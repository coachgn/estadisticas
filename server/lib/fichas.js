/* =====================================================================
   LA FICHA DEL CLIENTE · contacto, mail institucional y el log de avisos

   Una ficha por CATEGORÍA contratada (club + categoría, punto 60), en su
   PROPIA clave de Upstash: `sgadd:fichas`, un hash con un campo por
   `club|categoría`. No va dentro del catálogo por dos motivos:

   1. EL CATÁLOGO SE SIRVE A LOS CLIENTES. Un mail de contacto adentro le
      contaría a cada club el de los demás — el mismo motivo por el que los
      accesos viven en `sgadd:clientes` (punto 29). Las fichas solo salen
      por una ruta de ADMIN.
   2. EL CATÁLOGO SE ESCRIBE ENTERO (read-modify-write del objeto completo,
      punto 57). Registrar «mandé el aviso de 3 días» ahí adentro sería
      reescribir los planes y las zonas de todos los clubes por cada mail.

   LO QUE LA FICHA NO GUARDA: el nombre del club, el de la categoría, el
   plan y el vencimiento. Esos ya viven en el catálogo, y una copia acá
   sería una segunda fuente de verdad que se desincroniza en silencio —el
   bug del `sheetId` en dos lados—. El mail los lee del catálogo en el
   momento de mandarse, así que un plan cambiado ayer sale bien hoy.

   ---------------------------------------------------------------------
   LA IDEMPOTENCIA ES ATÓMICA

   Cada aviso se RECLAMA con `HSETNX` en `sgadd:notificaciones` antes de
   mandarse. `HSETNX` escribe solo si el campo no existe y dice si lo
   escribió: dos corridas del cron a la vez (un reintento de Vercel, una
   corrida manual) no pueden mandar dos veces el mismo aviso, porque una
   sola gana el reclamo. Si el envío falla, el reclamo se LIBERA y el aviso
   sale en la corrida siguiente.

   El hito de un recordatorio lleva la FECHA DE VENCIMIENTO en su id
   (`recordatorio_3d@2026-10-01`): al renovar, la fecha cambia y los tres
   avisos del período nuevo vuelven a estar disponibles sin que nadie
   limpie nada. La bienvenida es una sola por categoría.

   `notificacionesEnviadas` es el LOG legible de la ficha: qué se mandó,
   cuándo y a quién. Lo que decide si se manda es el reclamo; el log es lo
   que el Panel Master muestra.
   ===================================================================== */
'use strict';

const kv = require('./kv.js');

const CLAVE = 'sgadd:fichas';
const CLAVE_HITOS = 'sgadd:notificaciones';
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const EMAIL = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[a-z]{2,}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HITOS = ['bienvenida', 'recordatorio_5d', 'recordatorio_3d', 'recordatorio_1d'];
const RENOVACIONES = ['mensual', 'trimestral', 'semestral', 'temporada'];
/* Un log que crece sin techo termina siendo el campo más pesado del hash.
   Cuatro avisos por período dan para años. */
const MAX_LOG = 60;

function campoDe(club, categoria) { return club + '|' + categoria; }

function esObjeto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

/**
 * Fusión profunda: lo nuevo gana campo por campo y NADA se pierde por no
 * haberse mandado. Es lo que protege a la ficha de una pantalla vieja que
 * no conoce un campo: sin esto, guardar el contacto borraba el log.
 * Los arrays se REEMPLAZAN (un log no se fusiona por posición), y
 * `undefined` no pisa: «no lo mandé» no es «borralo».
 */
function deepMerge(base, cambio) {
  if (!esObjeto(cambio)) return cambio === undefined ? base : cambio;
  const out = esObjeto(base) ? Object.assign({}, base) : {};
  Object.keys(cambio).forEach((k) => {
    const v = cambio[k];
    if (v === undefined) return;
    out[k] = esObjeto(v) && esObjeto(out[k]) ? deepMerge(out[k], v) : (Array.isArray(v) ? v.slice() : v);
  });
  return out;
}

/**
 * Valida lo que manda el Panel Master. Devuelve `{ok, ficha}` con SOLO los
 * campos conocidos —el resto se ignora— o `{ok:false, motivo}`. Un campo
 * vacío es «borralo» (`null`), uno ausente es «no lo toques».
 */
function normalizar(entrada) {
  const e = entrada || {};
  const out = {};
  const texto = (v, max) => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
  if (e.contacto !== undefined) out.contacto = texto(e.contacto, 80) || null;
  if (e.email !== undefined) {
    const m = texto(e.email, 120).toLowerCase();
    if (m && !EMAIL.test(m)) return { ok: false, motivo: 'El mail institucional no es válido: ' + m };
    out.email = m || null;
  }
  if (e.fechaAlta !== undefined) {
    const f = texto(e.fechaAlta, 10);
    if (f && !FECHA.test(f)) return { ok: false, motivo: 'La fecha de alta va como AAAA-MM-DD.' };
    out.fechaAlta = f || null;
  }
  if (e.renovacion !== undefined) {
    const r = texto(e.renovacion, 20).toLowerCase();
    if (r && RENOVACIONES.indexOf(r) === -1) {
      return { ok: false, motivo: 'La modalidad de renovación es una de: ' + RENOVACIONES.join(', ') + '.' };
    }
    out.renovacion = r || null;
  }
  return { ok: true, ficha: out };
}

function almacen(deps) { return (deps && deps.kv) || kv; }

/** Todas las fichas: `{ "club|cat": ficha }`. LANZA si KV no contesta. */
async function leerTodas(deps) {
  return almacen(deps).leerHash(CLAVE);
}

async function leer(club, categoria, deps) {
  const r = await almacen(deps).leerCampos(CLAVE, [campoDe(club, categoria)]);
  return r[campoDe(club, categoria)] || null;
}

/**
 * Guarda un cambio sobre la ficha, fusionado con lo que hay. Escribe UN
 * campo del hash: ninguna otra ficha se toca.
 */
async function guardar(club, categoria, cambio, deps) {
  if (!SLUG.test(club) || !SLUG.test(categoria)) throw Object.assign(new Error('Club o categoría inválidos.'), { codigo: 'RUTA_INVALIDA' });
  const actual = (await leer(club, categoria, deps)) || {};
  const nueva = deepMerge(actual, Object.assign({}, cambio, { actualizado: new Date().toISOString() }));
  if (!Array.isArray(nueva.notificacionesEnviadas)) nueva.notificacionesEnviadas = actual.notificacionesEnviadas || [];
  await almacen(deps).escribirCampos(CLAVE, { [campoDe(club, categoria)]: nueva });
  return nueva;
}

/* --------------------------------------------------------------- HITOS */

/** El id del reclamo. Los recordatorios llevan el vencimiento: ver arriba. */
function idHito(club, categoria, hito, vence) {
  return campoDe(club, categoria) + '|' + hito + (hito === 'bienvenida' ? '' : '@' + (vence || 'sin-fecha'));
}

/** ¿Ya figura en el log de la ficha? Lo usa el planificador, que es PURO. */
function yaEnviado(ficha, hito, vence) {
  const log = (ficha && ficha.notificacionesEnviadas) || [];
  return log.some(r => r && r.hito === hito && (hito === 'bienvenida' || r.vence === vence));
}

/** Reclama un aviso. `true` si este proceso lo ganó. ATÓMICO. */
async function reclamar(id, deps) {
  const r = await almacen(deps).comando(['HSETNX', CLAVE_HITOS, id, JSON.stringify({ reclamado: new Date().toISOString() })]);
  return Number(r) === 1;
}

/** Libera un reclamo cuyo envío falló: sale en la corrida siguiente. */
async function liberar(id, deps) {
  return almacen(deps).comando(['HDEL', CLAVE_HITOS, id]);
}

/** Anota en el log de la ficha lo que salió. */
async function anotarEnviado(club, categoria, registro, deps) {
  const actual = (await leer(club, categoria, deps)) || {};
  const log = (actual.notificacionesEnviadas || []).concat([registro]).slice(-MAX_LOG);
  return guardar(club, categoria, { notificacionesEnviadas: log }, deps);
}

module.exports = {
  CLAVE, CLAVE_HITOS, HITOS, RENOVACIONES, MAX_LOG,
  campoDe, deepMerge, normalizar, leerTodas, leer, guardar,
  idHito, yaEnviado, reclamar, liberar, anotarEnviado,
};
