/* =====================================================================
   /api/v1/estados/:clubId/:categoria · los estados de jugador, compartidos

     GET    el mapa de estados de la categoría
     POST   { cambios: { "<NOMBRE>|<EQUIPO>": {estado, desde, nota, actualizado} } }

   Pedido del club (2026-09-12): un DT marca a un jugador lesionado y el
   resto del cuerpo técnico lo tiene que ver, en su navegador, sin que
   nadie le pase un link. Hasta acá los estados vivían solo en el
   `localStorage` de quien los cargó (punto 13).

   ---------------------------------------------------------------------
   LO QUE UN USUARIO CARGA NO LO PUEDE BORRAR NINGUNA RUTINA

   Van en su PROPIA clave de Upstash —`sgadd:estados:<club>:<categoría>`—
   y no dentro del catálogo. Así ninguna escritura del catálogo (un alta,
   una publicación de zonas, un `sembrar` del CLI) los toca: el catálogo
   se escribe entero y los estados no están ahí adentro.

   Y adentro de esa clave, un HASH con un campo por jugador: se escribe
   con `HSET` campo por campo y ningún camino hace `DEL` ni `SET` sobre
   el mapa. La regla de quién gana es la de `SGADD_ESTADOS.resolverEscritura`:
   el cambio más nuevo, jugador por jugador.

   VA EN SU PROPIO ARCHIVO, igual que `libro.js`: `handlers.js` tiene la
   única ruta que escribe el catálogo, y esta no tiene nada que ver con él.
   ===================================================================== */
'use strict';

const kv = require('../lib/kv.js');
const catalogo = require('../lib/catalogo.js');
const mutar = require('../lib/catalogo-mutar.js');
const { verificarToken, tokenDeLaPeticion } = require('../lib/auth.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');
const ESTADOS = require('../lib/compartido/sgadd-estados.js');

const PREFIJO = 'sgadd:estados:';
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
/* Por petición y por categoría. Un plantel son veinte jugadores y una
   liga entera, trescientos: esto no lo alcanza nadie usando el panel, y
   sí lo alcanzaría alguien con un token intentando llenar la base. */
const MAX_CAMBIOS = 300;
const MAX_JUGADORES = 3000;

function claveKV(clubId, slug) { return PREFIJO + clubId + ':' + slug; }

function error(status, codigo, mensaje) {
  return { status: status, body: { ok: false, codigo: codigo, mensaje: mensaje } };
}

/**
 * Quién pide y sobre qué. Un CLIENTE solo lee y escribe los de SU club;
 * el admin, los de cualquiera. La categoría tiene que existir en el
 * catálogo: sin eso cualquiera con un token podría crear claves nuevas.
 */
async function resolver(peticion, deps) {
  const v = verificarToken(tokenDeLaPeticion(peticion));
  if (!v.ok) return { error: error(401, v.motivo, 'El token de acceso no es válido.') };

  const params = (peticion && peticion.params) || {};
  const clubId = String(params.clubId || '').toLowerCase();
  const slug = String(params.categoria || '').toLowerCase();
  if (!SLUG.test(clubId) || !SLUG.test(slug)) {
    return { error: error(400, 'RUTA_INVALIDA', 'Falta el club o la categoría.') };
  }

  const esAdmin = v.rol === AUTH.ROLES.ADMIN;
  if (!esAdmin && v.club !== clubId) {
    return { error: error(403, 'OTRO_CLUB', 'Los estados de otro club no se pueden ver ni cambiar.') };
  }

  const cascada = await catalogo.cargar(deps);
  const club = cascada.catalogo && cascada.catalogo[clubId];
  if (!club || !club.categorias || !club.categorias[slug]) {
    return { error: error(404, 'SIN_CATEGORIA', 'Esa categoría no existe.') };
  }
  /* El mismo guard de los datos: un club pausado o vencido no recibe
     servicio. El admin pasa, para poder revisar (ver `guardSuscripcion`). */
  if (!esAdmin && mutar.estadoEfectivo(club) !== 'activo') {
    return { error: error(403, 'SUSCRIPCION', 'El acceso de este club no está activo.') };
  }
  return { clave: claveKV(clubId, slug), esAdmin: esAdmin };
}

function sinKV() {
  return error(503, 'SIN_KV', 'El servidor no tiene dónde guardar los estados: quedan en este navegador.');
}

/* Solo lo que tiene forma de estado: un campo roto no viaja al panel. */
function limpiar(mapa) {
  const out = {};
  Object.keys(mapa || {}).forEach(k => {
    const r = mapa[k];
    if (ESTADOS.CLAVE_JUGADOR_VALIDA.test(k) && r && ESTADOS.POR_ID[r.estado]) out[k] = r;
  });
  return out;
}

async function manejarEstados(peticion, deps) {
  const ctx = await resolver(peticion, deps);
  if (ctx.error) return ctx.error;
  const almacen = (deps && deps.kv) || kv;
  if (!almacen.configurado()) return sinKV();
  try {
    const mapa = await almacen.leerHash(ctx.clave);
    return { status: 200, body: { ok: true, estados: limpiar(mapa), ahora: Date.now() } };
  } catch (e) {
    /* NO se contesta un mapa vacío: el navegador lo tomaría como la verdad.
       Con un 503 se queda con su copia local, que es lo correcto. */
    return error(503, 'KV_ILEGIBLE', 'No se pudieron leer los estados guardados.');
  }
}

async function manejarEstadosEscribir(peticion, deps) {
  const ctx = await resolver(peticion, deps);
  if (ctx.error) return ctx.error;
  const almacen = (deps && deps.kv) || kv;
  if (!almacen.configurado()) return sinKV();

  const cambios = (peticion && peticion.body && peticion.body.cambios) || null;
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) {
    return error(400, 'SIN_CAMBIOS', 'No llegó ningún estado para guardar.');
  }
  const claves = Object.keys(cambios);
  if (!claves.length) return error(400, 'SIN_CAMBIOS', 'No llegó ningún estado para guardar.');
  if (claves.length > MAX_CAMBIOS) return error(413, 'DEMASIADOS', 'Demasiados cambios en una sola vez.');

  const ahora = Date.now();
  let r;
  try {
    const actuales = await almacen.leerCampos(ctx.clave, claves);
    r = ESTADOS.resolverEscritura(actuales, cambios, ahora);
    const nuevos = Object.keys(r.escribir).filter(k => !actuales[k]).length;
    if (nuevos && (await almacen.tamanoHash(ctx.clave)) + nuevos > MAX_JUGADORES) {
      return error(413, 'DEMASIADOS', 'La categoría ya tiene demasiados estados guardados.');
    }
    await almacen.escribirCampos(ctx.clave, r.escribir);
  } catch (e) {
    return error(503, 'KV_ESCRITURA', 'No se pudieron guardar los estados: quedan en este navegador y se reintenta solo.');
  }

  /* Se devuelve el mapa ENTERO después de escribir: así el que guarda se
     entera en la misma vuelta de lo que cargaron los demás. Si esa
     lectura falla, lo escrito ya está: se contesta sin mapa. */
  let estados = null;
  try { estados = limpiar(await almacen.leerHash(ctx.clave)); } catch (e) { estados = null; }
  return {
    status: 200,
    body: {
      ok: true,
      escritos: Object.keys(r.escribir),
      ignorados: r.ignorados,
      invalidos: r.invalidos,
      estados: estados,
      ahora: ahora,
    },
  };
}

module.exports = { manejarEstados, manejarEstadosEscribir, claveKV, PREFIJO, MAX_CAMBIOS, MAX_JUGADORES };
