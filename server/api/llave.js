/* =====================================================================
   GET /api/v1/torneos/:torneo/llave · LA LLAVE, SIN LOS LIBROS (punto 76)

   Lo que un DT necesita para saber CONTRA QUIÉN JUEGA en una fase entre
   zonas: la posición de cada equipo en su zona y los resultados de las
   series de la postemporada. Y NADA MÁS.

   ---------------------------------------------------------------------
   LA REGLA DE ACCESO, decidida con el club

   Un cliente descarga el libro completo SOLO de su propia zona, y eso ya lo
   hace cumplir `/api/v1/equipos` (el 403 OTRO_CLUB: el libro de una zona
   de torneo es del torneo, no del cliente). El libro de la OTRA zona y el
   de la postemporada no se entregan nunca a un cliente.

   Esta ruta es la que resuelve «1° Norte vs 2° Sur» sin abrir esos libros:
     - de cada zona: puesto, equipo, PJ, PG y PP, y si la tabla ya cerró;
     - de la postemporada: fecha, los dos equipos y el marcador final de
       cada partido, que es un resultado público como la tabla.
   Ninguna métrica, ningún jugador, ningún box score. Hay un test que
   recorre la respuesta y falla si aparece una columna de estadísticas.

   La pide el ADMIN, o un cliente con una categoría ENGANCHADA a ese
   torneo y con la suscripción activa. Cualquier otro: 403.

   ---------------------------------------------------------------------
   LA TABLA ES LA DE CLASIFICACIÓN

   Se arma con el MISMO motor que la sección (`sgadd-clasificacion.js`,
   vendorizado en `lib/compartido/`), con los partidos manuales del torneo
   y su orden de desempate. Con otra fórmula, el «2° Sur» de la llave podía
   no ser el 2° que ve el cliente de esa zona.

   Caché de cinco minutos por torneo: la llave la piden todos los clientes
   del torneo, y cada zona es un libro de Google.
   ===================================================================== */
'use strict';

const catalogo = require('../lib/catalogo.js');
const mutar = require('../lib/catalogo-mutar.js');
const sheets = require('../lib/google-sheets.js');
const etiquetas = require('../lib/etiquetas.js');
const { verificarToken, tokenDeLaPeticion } = require('../lib/auth.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');
const CORE = require('../lib/compartido/sgadd-core.js');
const DATOS = require('../lib/compartido/sgadd-data.js');
const CLASIF = require('../lib/compartido/sgadd-clasificacion.js');

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function error(status, codigo, mensaje) {
  return { status: status, body: { ok: false, codigo: codigo, mensaje: mensaje } };
}
function limpiarCache() { cache.clear(); }

/** ¿El cliente tiene una categoría enganchada a ese torneo, con acceso? */
function enganchadoConAcceso(cat, clubId, torneoId) {
  const club = cat && cat[clubId];
  const cats = (club && club.categorias) || {};
  return Object.keys(cats).some((slug) => {
    if (!cats[slug] || cats[slug].torneo !== torneoId) return false;
    const r = catalogo.resolver(cat, clubId, slug);
    return !!(r && AUTH.tieneAcceso(mutar.estadoEfectivo(r.suscripcion)));
  });
}

async function resolver(peticion, deps) {
  const v = verificarToken(tokenDeLaPeticion(peticion));
  if (!v.ok) return { error: error(401, v.motivo, 'El token de acceso no es válido.') };
  const torneoId = String(((peticion && peticion.params) || {}).torneo || '').toLowerCase();
  if (!SLUG.test(torneoId)) return { error: error(400, 'RUTA_INVALIDA', 'Falta el torneo.') };

  const cascada = await catalogo.cargar(deps);
  const cat = cascada.catalogo || {};
  const t = cat[torneoId];
  if (!t || t.tipo !== 'torneo') return { error: error(404, 'SIN_TORNEO', 'Ese torneo no existe.') };

  const esAdmin = v.rol === AUTH.ROLES.ADMIN;
  if (!esAdmin && !enganchadoConAcceso(cat, v.club, torneoId)) {
    return { error: error(403, 'OTRO_TORNEO', 'Tu acceso no incluye ese torneo.') };
  }
  return { torneoId: torneoId, t: t };
}

/** La matriz cruda de Google → {cols, filas}, que es lo que come el índice. */
function aFilas(hojas) {
  const out = {};
  Object.keys(hojas || {}).forEach((h) => { out[h] = DATOS.matrizAFilas(hojas[h]); });
  return out;
}

/** El valor de la columna FASE de la fase regular declarada. */
function faseRegular(formato) {
  const f = formato && Array.isArray(formato.fases) ? formato.fases[0] : null;
  if (!f) return 'REGULAR';
  const libro = Array.isArray(f.libro) ? f.libro[0] : f.libro;
  return String(libro || f.id || 'REGULAR').toUpperCase();
}

function iso(v) {
  const d = CORE.fecha(v);
  if (!d || isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

/** La tabla de una zona: puesto, equipo, PJ, PG, PP. Nada más. */
function tablaDeZona(t, slug, hojas) {
  const formato = t.formato || {};
  const fr = faseRegular(formato);
  const tramos = CORE.combinacionesTorneoFase(hojas);
  const deFase = tramos.filter(x => x.fase === fr);
  const tramo = deFase.find(x => x.sintetico) || deFase[0] || null;
  if (!tramo) return { filas: [], cerrada: false };
  const idx = CORE.construirIndice(hojas, { fase: fr, torneo: tramo.torneo });
  const manuales = CLASIF.manualesDelTramo(((t.partidosManuales || {})[slug]) || {}, tramo.torneo, fr);
  const orden = (t.competencia && t.competencia.ordenTabla) || CLASIF.ORDEN_POR_DEFECTO;
  const filas = CLASIF.tabla(idx, { orden: orden, manuales: manuales }).map(r => ({
    puesto: r.puesto, clave: r.clave, nombre: r.nombre, pj: r.pj, pg: r.pg, pp: r.pp,
  }));
  /* Cerrada: el reglamento declara cuántos partidos juega cada uno y todos
     los alcanzaron, o ya se jugó una fase posterior EN ESE libro. Nunca
     por intuición: un «1° Sur» se da por hecho recién ahí. */
  const posterior = tramos.some(x => x.fase !== fr && !x.agregado && x.conPartidos);
  const n = Number(formato.partidosPorEquipo) || 0;
  const cerrada = posterior || (n > 0 && filas.length > 0 && filas.every(f => Number(f.pj) >= n));
  return { filas: filas, cerrada: cerrada };
}

/** Los partidos de la postemporada: fecha, equipos y marcador final. */
function partidosDePostemporada(hojas) {
  const bd = hojas['Base Datos E'];
  const out = [];
  ((bd && bd.filas) || []).forEach((f) => {
    if (String(f.CONDICION || '').toUpperCase() !== 'LOCAL') return;
    const partes = String(f.PARTIDO || '').split(/\s+vs\.?\s+/i);
    const rival = partes.length === 2
      ? (CORE.claveEquipo(partes[0]) === CORE.claveEquipo(f.EQUIPO) ? partes[1] : partes[0]) : null;
    if (!rival) return;
    const pl = Number(f.PTS), pv = Number(f.PTSopp);
    out.push({ fase: String(f.FASE || '').toUpperCase(), fecha: iso(f.FECHA),
      local: CORE.limpiarNombre ? CORE.limpiarNombre(f.EQUIPO) : f.EQUIPO,
      visitante: CORE.limpiarNombre ? CORE.limpiarNombre(rival) : rival,
      ptsLocal: isFinite(pl) ? pl : null, ptsVisitante: isFinite(pv) ? pv : null });
  });
  return out;
}

async function armar(torneoId, t, deps) {
  const guardado = cache.get(torneoId);
  if (guardado && guardado.venceEn > Date.now()) return guardado.datos;

  const zonas = {};
  const postemporada = { conLibro: false, partidos: [] };
  const cats = t.categorias || {};
  for (const slug of Object.keys(cats)) {
    const k = cats[slug];
    if (!k || !k.zona) continue;
    if (!k.sheetId) {
      if (!k.interzonal) zonas[k.zona] = { label: k.label || k.zona, filas: [], cerrada: false, sinLibro: true };
      continue;
    }
    let hojas;
    try {
      const libro = await sheets.obtenerLibro(k.sheetId, deps);
      etiquetas.reetiquetar(libro, slug);
      hojas = aFilas(libro.hojas);
    } catch (e) {
      /* UNA ZONA ILEGIBLE NO TUMBA LA LLAVE: sus lados quedan pendientes,
         que es lo honesto, y el resto se resuelve igual. */
      if (!k.interzonal) zonas[k.zona] = { label: k.label || k.zona, filas: [], cerrada: false, ilegible: true };
      continue;
    }
    if (k.interzonal) {
      /* TODOS LOS LIBROS VINCULADOS (punto 77): playoffs A y B, la
         permanencia, un repechaje. Sin repetir un partido que MotorStats
         haya escrito en dos. */
      postemporada.conLibro = true;
      const vistos = new Set(postemporada.partidos.map(p => p.fase + '|' + p.fecha + '|' + p.local + '|' + p.visitante));
      partidosDePostemporada(hojas).forEach((p) => {
        const kk = p.fase + '|' + p.fecha + '|' + p.local + '|' + p.visitante;
        if (!vistos.has(kk)) { vistos.add(kk); postemporada.partidos.push(p); }
      });
    } else {
      zonas[k.zona] = Object.assign({ label: k.label || k.zona }, tablaDeZona(t, slug, hojas));
    }
  }
  const datos = { ok: true, torneo: torneoId, nombre: t.nombre || torneoId, zonas: zonas,
    postemporada: postemporada, leidoEn: Date.now() };
  cache.set(torneoId, { datos: datos, venceEn: Date.now() + TTL_MS });
  return datos;
}

async function manejarLlave(peticion, deps) {
  const ctx = await resolver(peticion, deps);
  if (ctx.error) return ctx.error;
  try {
    return { status: 200, body: await armar(ctx.torneoId, ctx.t, deps) };
  } catch (e) {
    console.error('[sgadd] llave:', e && e.stack ? e.stack : e);
    return error(503, 'LLAVE_ILEGIBLE', 'No se pudo armar la llave del torneo.');
  }
}

module.exports = { manejarLlave, limpiarCache, tablaDeZona, partidosDePostemporada, faseRegular };
