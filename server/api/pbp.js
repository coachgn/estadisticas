/* =====================================================================
   /api/v1/pbp/:clubId/:categoria · analítica de play-by-play (laboratorio)

     GET                      el índice: qué equipos tienen análisis
     GET ?equipo=<nombre>     el paquete de ESE equipo

   Quintetos, dúos y tríos, iniciales y cierre, clutch y mapa de tiro
   calibrado de cada equipo de la competencia. Lo arma
   `motorstats-ingestion` desde el play-by-play oficial y lo sube
   `server/bin/pbp.js`. Punto 62 de CLAUDE.md.

   ---------------------------------------------------------------------
   ES UNA CAPA DE LABORATORIO, Y EL GUARD VIVE ACÁ

   Un cliente la ve solo si su categoría la tiene habilitada
   (`categorias[slug].laboratorio`, ver `AUTH.CAPAS_LABORATORIO`), o si
   está enganchada a una zona de torneo que la tiene y no la apagó en la
   suya (`TORNEOS.capasEfectivas`, punto 101 — ya viene resuelto en
   `catalogo.resolver`). La
   pestaña del panel es la vidriera: quien decide es este archivo. El
   ADMIN pasa aunque la capa no esté habilitada, para poder revisar los
   datos ANTES de mostrárselos a nadie.

   Un cliente pide cualquier equipo de SU categoría —el suyo y los rivales—
   porque el análisis de un rival es exactamente el scouting que la capa
   prueba. Otro club, no.

   ---------------------------------------------------------------------
   DÓNDE VIVE

   Un hash propio de Upstash —`sgadd:pbp:<club>:<categoría>`— con un campo
   por equipo (su `claveEquipo`) y `__indice`. Fuera del catálogo, por el
   mismo motivo que los estados (punto 57): ninguna escritura del catálogo
   lo puede tocar. Y ESTA RUTA SOLO LEE: escribir es del CLI.
   ===================================================================== */
'use strict';

const kv = require('../lib/kv.js');
const catalogo = require('../lib/catalogo.js');
const mutar = require('../lib/catalogo-mutar.js');
const { verificarToken, tokenDeLaPeticion } = require('../lib/auth.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');
const CORE = require('../lib/compartido/sgadd-core.js');
const TORNEOS = require('../lib/torneos.js');

const PREFIJO = 'sgadd:pbp:';
const CAMPO_INDICE = '__indice';
const CAPA = 'pbp';
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

function claveKV(clubId, slug) { return PREFIJO + clubId + ':' + slug; }

/** El campo de un equipo: el normalizador de todo el panel, no el texto. */
function campoDeEquipo(nombre) { return CORE.claveEquipo(String(nombre || '')); }

function error(status, codigo, mensaje) {
  return { status: status, body: { ok: false, codigo: codigo, mensaje: mensaje } };
}

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
    return { error: error(403, 'OTRO_CLUB', 'El análisis de otro club no se puede ver.') };
  }

  const cascada = await catalogo.cargar(deps);
  const club = cascada.catalogo && cascada.catalogo[clubId];
  if (!club || !club.categorias || !club.categorias[slug]) {
    return { error: error(404, 'SIN_CATEGORIA', 'Esa categoría no existe.') };
  }
  const cat = catalogo.resolver(cascada.catalogo, clubId, slug);
  if (!esAdmin && !AUTH.tieneAcceso(mutar.estadoEfectivo(cat.suscripcion))) {
    return { error: error(403, 'SUSCRIPCION', 'El acceso a esta categoría no está activo.') };
  }
  if (!esAdmin && (cat.laboratorio || []).indexOf(CAPA) === -1) {
    return { error: error(403, 'SIN_CAPA', 'El análisis de play-by-play no está habilitado para esta categoría.') };
  }
  return { clave: claveDeDatos(cascada.catalogo, clubId, slug), esAdmin: esAdmin, habilitada: (cat.laboratorio || []).indexOf(CAPA) !== -1 };
}

/**
 * DÓNDE ESTÁN LOS TIROS DE UNA CATEGORÍA (2026-10-09).
 *
 * La ingesta automática sube los paquetes UNA vez por zona de torneo
 * (`sgadd:pbp:liga-nacional-2026-27:lnb-2026-27`). Un cliente enganchado a
 * esa zona —Boca en la LNB: su categoría declara `torneo` y `zona`— lee
 * ESOS datos: es el mismo libro y los mismos partidos, y subirlos otra vez
 * por cliente sería duplicar el KV y que una copia quede vieja. Una
 * categoría con su propio hash (Jujuy, que sube su análisis aparte) sigue
 * leyendo el suyo: el del torneo es el respaldo, no lo pisa.
 *
 * El permiso se decide arriba con la categoría DEL CLIENTE: su suscripción
 * y las capas que rigen en ella, que desde el punto 101 son las de la zona
 * si no declara las suyas. Esto solo dice de qué clave se lee.
 */
function claveDeDatos(cat, clubId, slug) {
  const propia = claveKV(clubId, slug);
  const k = cat && cat[clubId] && cat[clubId].categorias && cat[clubId].categorias[slug];
  if (!k || !k.torneo || !k.zona || k.torneo === clubId) return propia;
  const zona = TORNEOS.categoriaDeZona(cat[k.torneo], k.zona);
  return zona ? { propia: propia, torneo: claveKV(k.torneo, zona.slug) } : propia;
}

async function manejarPbp(peticion, deps) {
  const ctx = await resolver(peticion, deps);
  if (ctx.error) return ctx.error;
  const almacen = (deps && deps.kv) || kv;
  if (!almacen.configurado()) return error(503, 'SIN_KV', 'El servidor no tiene dónde leer el análisis.');

  const q = (peticion && peticion.query) || {};
  const equipo = q.equipo ? String(q.equipo) : '';
  const campo = equipo ? campoDeEquipo(equipo) : CAMPO_INDICE;
  if (equipo && !campo) return error(400, 'EQUIPO_INVALIDO', 'Falta el nombre del equipo.');

  /* La clave propia primero; si no tiene el campo y la categoría está
     enganchada a una zona de torneo, la del torneo (`claveDeDatos`). */
  const claves = typeof ctx.clave === 'string' ? [ctx.clave] : [ctx.clave.propia, ctx.clave.torneo];
  let valor = null;
  try {
    for (const clave of claves) {
      const leido = await almacen.leerCampos(clave, [campo]);
      valor = leido && leido[campo];
      if (valor) break;
    }
  } catch (e) {
    return error(503, 'KV_ILEGIBLE', 'No se pudo leer el análisis de play-by-play.');
  }
  if (!valor) {
    return error(404, 'SIN_DATOS', equipo
      ? 'Todavía no hay análisis de play-by-play para ' + equipo + '.'
      : 'Todavía no hay análisis de play-by-play cargado para esta categoría.');
  }
  return {
    status: 200,
    body: equipo
      ? { ok: true, paquete: valor, capaHabilitada: ctx.habilitada }
      : { ok: true, indice: valor, capaHabilitada: ctx.habilitada },
  };
}

module.exports = { manejarPbp, claveKV, claveDeDatos, campoDeEquipo, CAMPO_INDICE, PREFIJO, CAPA };
