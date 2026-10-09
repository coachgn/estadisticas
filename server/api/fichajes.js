/* =====================================================================
   /api/v1/fichajes · EL MERCADO DE FICHAJES (punto 87)

     GET  /api/v1/fichajes                       los torneos que ve la sesión
     GET  /api/v1/fichajes/:torneo/:zona         el libro COMPLETO de una zona
                                                 + las fichas manuales
     POST /api/v1/fichajes/:torneo/fichas        { cambios: { "NOMBRE|EQUIPO": ficha } }   ADMIN
     GET  /api/v1/fichajes/padron                el padrón                                 ADMIN
     POST /api/v1/fichajes/padron                { email, torneos: [...], nota }           ADMIN

   ---------------------------------------------------------------------
   POR QUÉ ESTO SÍ ES SEGURIDAD

   El gate de la sección en el panel es de interfaz (punto 19). Lo que
   protege de verdad es que el libro SIN RECORTE de un torneo solo sale de
   acá, y solo para:

     · un ADMIN (mails del código, `ADMINS`), o
     · un mail del PADRÓN de fichajes, y solo de los torneos de su registro.

   El padrón vive en su PROPIA clave de KV —`sgadd:fichajes:padron`, un
   HASH con un campo por mail— y no adentro del catálogo ni del padrón de
   clientes: ninguna escritura de esos dos lo toca, y el catálogo se sirve
   a todo el que tiene token. Se lee EN CADA PEDIDO, sin caché: sacar a
   alguien del padrón corta el acceso en el próximo clic, no dentro de
   cinco minutos.

   KV caído con un no-admin: 503, nunca «habilitado por las dudas». Es una
   lista de permitidos y falla cerrada.

   Nada de esto devuelve un sheetId: hay un test que recorre las
   respuestas y falla si aparece uno.
   ===================================================================== */
'use strict';

const kv = require('../lib/kv.js');
const catalogo = require('../lib/catalogo.js');
const sheets = require('../lib/google-sheets.js');
const etiquetas = require('../lib/etiquetas.js');
const reglas = require('../lib/reglas.js');
const { verificarToken, tokenDeLaPeticion } = require('../lib/auth.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');
const MERCADO = require('../lib/compartido/sgadd-mercado.js');
const PADRON_J = require('../lib/padron-j.js');
const PBP = require('./pbp.js');

const PADRON = 'sgadd:fichajes:padron';
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const MAX_CAMBIOS = 300;
const MAX_FICHAS = 5000;

function claveFichas(torneoId) { return 'sgadd:fichajes:fichas:' + torneoId; }

function error(status, codigo, mensaje) {
  return { status: status, body: { ok: false, codigo: codigo, mensaje: mensaje } };
}

function almacenDe(deps) { return (deps && deps.kv) || kv; }

/**
 * Quién pide y qué torneos ve. Devuelve `{ error }` o
 * `{ v, esAdmin, cat, habilitados }`.
 */
async function sesionDeFichajes(peticion, deps) {
  const v = verificarToken(tokenDeLaPeticion(peticion));
  if (!v.ok) return { error: error(401, v.motivo, 'El token de acceso no es válido.') };
  const esAdmin = v.rol === AUTH.ROLES.ADMIN;
  const cascada = await catalogo.cargar(deps);
  const cat = cascada.catalogo || {};

  let registro = null;
  if (!esAdmin) {
    const almacen = almacenDe(deps);
    if (!almacen.configurado()) {
      return { error: error(403, 'NO_HABILITADO', 'Fichajes no está habilitado para tu mail.') };
    }
    const email = MERCADO.normalizarEmail(v.sesion && v.sesion.email);
    try {
      registro = (await almacen.leerCampos(PADRON, [email]))[email] || null;
    } catch (e) {
      return { error: error(503, 'KV_ILEGIBLE', 'No se pudo verificar el acceso a Fichajes.') };
    }
  }
  const habilitados = MERCADO.torneosHabilitados(cat, esAdmin, registro);
  if (!habilitados.length) {
    return { error: error(403, 'NO_HABILITADO', 'Fichajes no está habilitado para tu mail.') };
  }
  return { v: v, esAdmin: esAdmin, cat: cat, habilitados: habilitados };
}

/** Las zonas de un torneo, en el orden del catálogo. Sin sheetId. */
function zonasDe(t) {
  return Object.keys((t && t.categorias) || {}).map(slug => {
    const k = t.categorias[slug] || {};
    return {
      slug: slug, zona: k.zona || null, label: k.label || slug,
      nivel: k.nivel || t.nivel || null,
      conLibro: !!k.sheetId, interzonal: !!k.interzonal,
    };
  });
}

/* GET /api/v1/fichajes */
async function manejarFichajes(peticion, deps) {
  const ctx = await sesionDeFichajes(peticion, deps);
  if (ctx.error) return ctx.error;
  const torneos = ctx.habilitados.map(id => {
    const t = ctx.cat[id] || {};
    return { id: id, nombre: t.nombre || id, nombreCorto: t.nombreCorto || null,
      temporada: t.temporada || null, nivel: t.nivel || null, zonas: zonasDe(t) };
  });
  return { status: 200, body: { ok: true, admin: ctx.esAdmin, torneos: torneos } };
}

/* GET /api/v1/fichajes/:torneo/:zona */
async function manejarZona(peticion, deps) {
  const ctx = await sesionDeFichajes(peticion, deps);
  if (ctx.error) return ctx.error;
  const params = (peticion && peticion.params) || {};
  const torneoId = String(params.torneo || '').toLowerCase();
  const slug = String(params.zona || '').toLowerCase();
  if (!SLUG.test(torneoId) || !SLUG.test(slug)) return error(400, 'RUTA_INVALIDA', 'Falta el torneo o la zona.');
  /* 403 y no 404 para un torneo que existe pero no está en su registro:
     la lista de torneos no es secreta —la tabla de posiciones es pública—
     y negarlo confunde al que pegó un link viejo. */
  if (ctx.habilitados.indexOf(torneoId) === -1) {
    return error(403, 'OTRO_TORNEO', 'Tu acceso a Fichajes no incluye ese torneo.');
  }
  const t = ctx.cat[torneoId];
  const k = t && t.categorias && t.categorias[slug];
  if (!k) return error(404, 'SIN_ZONA', 'Esa zona no existe en el torneo.');
  if (!k.sheetId) return error(404, 'SIN_LIBRO', 'Esa zona todavía no tiene libro.');

  let libro;
  try {
    libro = await sheets.obtenerLibro(k.sheetId, deps);
    etiquetas.reetiquetar(libro, slug);
  } catch (e) {
    console.error('[sgadd] fichajes:', e && e.stack ? e.stack : e);
    return error(503, 'LIBRO_ILEGIBLE', 'No se pudo leer el libro de esa zona.');
  }

  /* LAS FICHAS MANUALES del torneo. Un fallo acá NO tumba la búsqueda: el
     mercado sin edades sirve, el mercado sin datos no. Se dice con
     `fichasLeidas: false` para que la pantalla no muestre «sin ficha» como
     si fuera un dato. */
  let fichas = {}, fichasLeidas = false;
  const almacen = almacenDe(deps);
  if (almacen.configurado()) {
    try { fichas = limpiarFichas(await almacen.leerHash(claveFichas(torneoId))); fichasLeidas = true; }
    catch (e) { fichas = {}; }
  }

  /* EL PADRÓN DEL LIBRO (`PADRON J`, lib/padron-j.js): nacimiento, y puesto
     y talla si alguien los cargó, para los libros que llegan por la ingesta
     automática. Completa las fichas manuales SIN pisarlas. Un libro sin esa
     pestaña —todos salvo la LNB— o una lectura que falla dejan las fichas
     como estaban: el padrón es un extra, nunca un motivo para un 503. */
  let padron = { leido: false, filas: 0, conDatos: 0, completadas: 0 };
  try {
    const r = await sheets.obtenerDatosPlanilla(k.sheetId, "'" + PADRON_J.HOJA + "'", deps);
    const del = PADRON_J.fichasDelPadron(r && r.valores);
    const f = PADRON_J.fusionar(fichas, del.fichas);
    fichas = f.fichas;
    padron = { leido: true, filas: del.filas, conDatos: del.conDatos, completadas: f.completadas };
  } catch (e) { /* sin PADRON J: nada que completar */ }

  const hojas = {};
  Object.keys(libro.hojas || {}).forEach(h => { hojas[h] = reglas.sinColumnasOcultas(libro.hojas[h]); });
  return {
    status: 200,
    body: {
      ok: true, torneo: torneoId, zona: slug, label: k.label || slug,
      nivel: k.nivel || t.nivel || null, nombreTorneo: t.nombre || torneoId,
      hojas: hojas, faltantes: libro.faltantes || [], leidoEn: libro.leidoEn || null,
      /* Con el padrón leído las fichas SON un dato aunque KV no haya
         respondido: la pantalla puede decir «sin ficha» con fundamento. */
      fichas: fichas, fichasLeidas: fichasLeidas || padron.leido, padron: padron,
    },
  };
}

/* GET /api/v1/fichajes/:torneo/:zona/tiros?equipo=X  (punto 97)

   El paquete de play-by-play de UN equipo de la zona, para el mapa de tiro
   de la Radiografía. Vive en `sgadd:pbp:<torneo>:<zona>`: es la capa de
   laboratorio de la categoría del torneo (punto 94), la misma que lee
   `/api/v1/pbp`. Por qué una ruta aparte: `/api/v1/pbp` autoriza por CLUB
   (un cliente solo ve su categoría) y el que busca fichajes es, casi
   siempre, de OTRO club. Acá manda el padrón de fichajes, igual que el
   libro completo de la zona: el que puede ver el libro sin recorte puede
   ver dónde tira cada jugador. Solo lee, y de un equipo por pedido. */
async function manejarTirosZona(peticion, deps) {
  const ctx = await sesionDeFichajes(peticion, deps);
  if (ctx.error) return ctx.error;
  const params = (peticion && peticion.params) || {};
  const torneoId = String(params.torneo || '').toLowerCase();
  const slug = String(params.zona || '').toLowerCase();
  if (!SLUG.test(torneoId) || !SLUG.test(slug)) return error(400, 'RUTA_INVALIDA', 'Falta el torneo o la zona.');
  if (ctx.habilitados.indexOf(torneoId) === -1) {
    return error(403, 'OTRO_TORNEO', 'Tu acceso a Fichajes no incluye ese torneo.');
  }
  const t = ctx.cat[torneoId];
  if (!(t && t.categorias && t.categorias[slug])) return error(404, 'SIN_ZONA', 'Esa zona no existe en el torneo.');
  const q = (peticion && peticion.query) || {};
  const campo = PBP.campoDeEquipo(q.equipo);
  if (!campo) return error(400, 'EQUIPO_INVALIDO', 'Falta el nombre del equipo.');
  const almacen = almacenDe(deps);
  if (!almacen.configurado()) return error(503, 'SIN_KV', 'El servidor no tiene dónde leer el análisis.');
  let leido;
  try {
    leido = await almacen.leerCampos(PBP.claveKV(torneoId, slug), [campo]);
  } catch (e) {
    return error(503, 'KV_ILEGIBLE', 'No se pudo leer el análisis de play-by-play.');
  }
  const valor = leido && leido[campo];
  if (!valor) return error(404, 'SIN_DATOS', 'Todavía no hay análisis de play-by-play para ' + String(q.equipo) + '.');
  return { status: 200, body: { ok: true, paquete: valor } };
}

function limpiarFichas(mapa) {
  const out = {};
  Object.keys(mapa || {}).forEach(clave => {
    if (!MERCADO.CLAVE_VALIDA.test(clave)) return;
    const f = MERCADO.normalizarFicha(mapa[clave]);
    if (f && !f.error) out[clave] = f;
  });
  return out;
}

function soloAdmin(peticion) {
  const v = verificarToken(tokenDeLaPeticion(peticion));
  if (!v.ok) return { error: error(401, v.motivo, 'El token de acceso no es válido.') };
  if (v.rol !== AUTH.ROLES.ADMIN) return { error: error(403, AUTH.MOTIVOS.SOLO_ADMIN, 'Solo un administrador.') };
  return { v: v };
}

/* POST /api/v1/fichajes/:torneo/fichas · ADMIN
   Campo por campo (HSET), como los estados del punto 57: ninguna escritura
   puede dejar en cero las fichas de los demás. Una ficha vacía se guarda
   como `{}` —el jugador queda «sin ficha»— en vez de borrar el campo: el
   proyecto no tiene ningún camino que haga HDEL. */
async function manejarFichasEscribir(peticion, deps) {
  const ctx = soloAdmin(peticion);
  if (ctx.error) return ctx.error;
  const torneoId = String(((peticion && peticion.params) || {}).torneo || '').toLowerCase();
  if (!SLUG.test(torneoId)) return error(400, 'RUTA_INVALIDA', 'Falta el torneo.');
  const cat = (await catalogo.cargar(deps)).catalogo || {};
  if (!cat[torneoId] || cat[torneoId].tipo !== 'torneo') return error(404, 'SIN_TORNEO', 'Ese torneo no existe.');

  const almacen = almacenDe(deps);
  if (!almacen.configurado()) return error(503, 'SIN_KV', 'El servidor no tiene dónde guardar las fichas.');
  const cambios = (peticion && peticion.body && peticion.body.cambios) || null;
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios) || !Object.keys(cambios).length) {
    return error(400, 'SIN_CAMBIOS', 'No llegó ninguna ficha para guardar.');
  }
  const claves = Object.keys(cambios);
  if (claves.length > MAX_CAMBIOS) return error(413, 'DEMASIADOS', 'Demasiadas fichas en una sola vez.');

  const escribir = {};
  for (const clave of claves) {
    if (!MERCADO.CLAVE_VALIDA.test(clave)) return error(400, 'CLAVE_INVALIDA', 'La clave «' + clave + '» no es NOMBRE|EQUIPO.');
    const f = MERCADO.normalizarFicha(cambios[clave]);
    if (f && f.error) return error(400, f.error, f.mensaje + ' (' + clave.split('|')[0] + ')');
    escribir[clave] = Object.assign({}, f || {}, { actualizado: Date.now(), por: ctx.v.sesion.email });
  }
  try {
    const actuales = await almacen.leerCampos(claveFichas(torneoId), claves);
    const nuevos = claves.filter(k => !actuales[k]).length;
    if (nuevos && (await almacen.tamanoHash(claveFichas(torneoId))) + nuevos > MAX_FICHAS) {
      return error(413, 'DEMASIADOS', 'El torneo ya tiene demasiadas fichas.');
    }
    await almacen.escribirCampos(claveFichas(torneoId), escribir);
    const fichas = limpiarFichas(await almacen.leerHash(claveFichas(torneoId)));
    return { status: 200, body: { ok: true, escritas: claves, fichas: fichas } };
  } catch (e) {
    return error(503, 'KV_ESCRITURA', 'No se pudieron guardar las fichas.');
  }
}

/* GET /api/v1/fichajes/padron · ADMIN */
async function manejarPadron(peticion, deps) {
  const ctx = soloAdmin(peticion);
  if (ctx.error) return ctx.error;
  const almacen = almacenDe(deps);
  if (!almacen.configurado()) return { status: 200, body: { ok: true, padron: {}, sinKV: true } };
  try {
    const crudo = await almacen.leerHash(PADRON);
    const padron = {};
    Object.keys(crudo || {}).sort().forEach(email => {
      const r = crudo[email] || {};
      padron[email] = { torneos: Array.isArray(r.torneos) ? r.torneos : [], nota: r.nota || null,
        actualizado: r.actualizado || null, por: r.por || null };
    });
    return { status: 200, body: { ok: true, padron: padron } };
  } catch (e) {
    return error(503, 'KV_ILEGIBLE', 'No se pudo leer el padrón de Fichajes.');
  }
}

/* POST /api/v1/fichajes/padron · ADMIN
   `torneos: []` DESHABILITA: el registro queda, vacío, y el mail deja de
   entrar en el próximo pedido. Igual que «Reactivar» en los estados, nada
   se borra. */
async function manejarPadronEscribir(peticion, deps) {
  const ctx = soloAdmin(peticion);
  if (ctx.error) return ctx.error;
  const almacen = almacenDe(deps);
  if (!almacen.configurado()) return error(503, 'SIN_KV', 'El servidor no tiene dónde guardar el padrón.');
  const cat = (await catalogo.cargar(deps)).catalogo || {};
  const n = MERCADO.normalizarHabilitacion((peticion && peticion.body) || {}, cat);
  if (n.error) return error(400, n.error, n.mensaje);
  /* Un admin ya ve todo: darlo de alta no le agrega nada y ensucia el
     padrón con alguien que no se puede deshabilitar desde acá. */
  if (AUTH.esAdmin(n.email)) return error(400, 'ES_ADMIN', 'Ese mail es administrador: ya ve todos los torneos.');
  const registro = Object.assign({}, n.registro, { actualizado: Date.now(), por: ctx.v.sesion.email });
  try {
    await almacen.escribirCampos(PADRON, { [n.email]: registro });
  } catch (e) {
    return error(503, 'KV_ESCRITURA', 'No se pudo guardar el padrón.');
  }
  return manejarPadron(peticion, deps);
}

module.exports = {
  manejarFichajes, manejarZona, manejarTirosZona, manejarFichasEscribir, manejarPadron, manejarPadronEscribir,
  PADRON, claveFichas,
};
