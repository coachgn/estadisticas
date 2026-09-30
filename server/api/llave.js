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
const FASES = require('../lib/compartido/sgadd-fases.js');
const TORNEOS = require('../lib/torneos.js');

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

function error(status, codigo, mensaje) {
  return { status: status, body: { ok: false, codigo: codigo, mensaje: mensaje } };
}
function limpiarCache() { cache.clear(); }

/** Las zonas del torneo en las que el cliente tiene una categoría
    enganchada y con acceso. Vacío = no tiene nada que ver con el torneo. */
function zonasDelCliente(cat, clubId, torneoId) {
  const club = cat && cat[clubId];
  const cats = (club && club.categorias) || {};
  const out = new Set();
  Object.keys(cats).forEach((slug) => {
    if (!cats[slug] || cats[slug].torneo !== torneoId) return;
    const r = catalogo.resolver(cat, clubId, slug);
    if (r && AUTH.tieneAcceso(mutar.estadoEfectivo(r.suscripcion))) out.add(String(cats[slug].zona || '').toLowerCase());
  });
  return out;
}
function enganchadoConAcceso(cat, clubId, torneoId) { return zonasDelCliente(cat, clubId, torneoId).size > 0; }

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
  const zonas = esAdmin ? null : zonasDelCliente(cat, v.club, torneoId);
  if (!esAdmin && !zonas.size) {
    return { error: error(403, 'OTRO_TORNEO', 'Tu acceso no incluye ese torneo.') };
  }
  return { torneoId: torneoId, t: t, zonas: zonas, v: v, cat: cat, origen: cascada.origen };
}

/** La matriz cruda de Google → {cols, filas}, que es lo que come el índice. */
function aFilas(hojas) {
  const out = {};
  Object.keys(hojas || {}).forEach((h) => { out[h] = DATOS.matrizAFilas(hojas[h]); });
  return out;
}

/**
 * El valor de la columna FASE de la fase regular declarada.
 *
 * LA PRIMERA FASE NO ES LA REGULAR (punto 78). El editor de cruces guarda
 * solo las fases de eliminación, y con la primera declarada —«REPECHAJE
 * B-C»— cada zona salía con la tabla vacía: todos los puestos «a definir».
 * Es la fase de LIGA la que da las posiciones; sin ninguna, `REGULAR`.
 */
function faseRegular(formato) {
  const liga = FASES.parsear(formato || {}).fases.find(f => f.tipo === 'liga');
  return liga ? liga.libro[0] : 'REGULAR';
}

function iso(v) {
  const d = CORE.fecha(v);
  if (!d || isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

/** La tabla de una zona: puesto, equipo, PJ, PG, PP. Nada más. */
/** El índice de la fase REGULAR de una zona: el TOTAL si tiene varios torneos. */
function indiceRegular(formato, hojas) {
  let fr = faseRegular(formato);
  const tramos = CORE.combinacionesTorneoFase(hojas);
  let deFase = tramos.filter(x => x.fase === fr);
  /* Una fase de liga declarada con otro nombre que el libro no trae cae a
     REGULAR antes que dejar la zona sin tabla. */
  if (!deFase.length && fr !== 'REGULAR') { fr = 'REGULAR'; deFase = tramos.filter(x => x.fase === fr); }
  const tramo = deFase.find(x => x.sintetico) || deFase[0] || null;
  if (!tramo) return null;
  return { fr: fr, tramo: tramo, tramos: tramos, idx: CORE.construirIndice(hojas, { fase: fr, torneo: tramo.torneo }) };
}

function tablaDeZona(t, slug, hojas) {
  const formato = t.formato || {};
  const ir = indiceRegular(formato, hojas);
  if (!ir) return { filas: [], cerrada: false };
  const { fr, tramo, tramos, idx } = ir;
  /* LOS DATOS DEL EQUIPO, no solo su puesto (punto 79): la zona y el id
     de Gesdeportiva viajan para que el panel resuelva el escudo de un
     equipo que no está en su libro. */
  const k = ((t.categorias || {})[slug]) || {};
  const ids = {};
  (k.equipos || []).forEach((e) => { if (e && e.id != null) ids[e.clave || CORE.claveEquipo(e.nombre)] = e.id; });
  const manuales = CLASIF.manualesDelTramo(((t.partidosManuales || {})[slug]) || {}, tramo.torneo, fr);
  const orden = (t.competencia && t.competencia.ordenTabla) || CLASIF.ORDEN_POR_DEFECTO;
  const filas = CLASIF.tabla(idx, { orden: orden, manuales: manuales }).map(r => ({
    puesto: r.puesto, clave: r.clave, nombre: r.nombre, pj: r.pj, pg: r.pg, pp: r.pp,
    zona: k.zona || null, id: ids[r.clave] != null ? ids[r.clave] : null,
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
        /* EL LIBRO de donde sale (la zona vinculada, nunca su sheetId): el
           mismo valor de FASE puede estar en dos libros (punto 78). */
        if (!vistos.has(kk)) { vistos.add(kk); postemporada.partidos.push(Object.assign(p, { zonaLibro: k.zona })); }
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

/**
 * LO QUE LE LLEGA A UN CLIENTE (punto 78): la llave de SU zona.
 *
 *   fases       las de sus zonas y las que esas necesitan para resolverse
 *               (una final A-B necesita la semifinal A);
 *   tablas      las de las zonas que esas fases cruzan: para traducir
 *               «4° Zona C» al nombre del club hace falta la tabla de la C;
 *   partidos    los de esas fases, cada uno de SU libro. Un partido de una
 *               fase no declarada entra si el libro incluye a su zona.
 *
 * Los libros siguen sin viajar: esto recorta una respuesta que ya era de
 * posiciones y resultados. El admin recibe todo.
 */
function paraZonas(datos, t, zonas) {
  if (!zonas) return datos;
  const participan = TORNEOS.participanDeTorneo(t);
  const fases = FASES.parsear(t.formato || {}, { participan: participan }).fases;
  let visibles = [];
  zonas.forEach((z) => { visibles = visibles.concat(FASES.filtrarPorZona(fases, z)); });
  const necesarias = FASES.dependenciasDe(fases, visibles);
  const idsNec = new Set(necesarias.map(f => f.id));

  let todas = false;
  const zonasTabla = new Set(zonas);
  necesarias.forEach((f) => { if (!f.zonas) todas = true; else f.zonas.forEach(z => zonasTabla.add(z)); });

  const zonasOut = {};
  Object.keys(datos.zonas || {}).forEach((z) => { if (todas || zonasTabla.has(String(z).toLowerCase())) zonasOut[z] = datos.zonas[z]; });

  const incluye = (lista) => !lista || !lista.length || lista.some(z => zonas.has(String(z).toLowerCase()));
  const partidos = ((datos.postemporada && datos.postemporada.partidos) || []).filter((p) => {
    const f = fases.find(x => x.libro.indexOf(String(p.fase || '').toUpperCase()) !== -1
      && (!x.zonaLibro || !p.zonaLibro || x.zonaLibro === p.zonaLibro));
    if (f) return idsNec.has(f.id);
    return incluye(participan[p.zonaLibro]);
  });
  return Object.assign({}, datos, { zonas: zonasOut,
    postemporada: Object.assign({}, datos.postemporada, { partidos: partidos }) });
}

async function manejarLlave(peticion, deps) {
  const ctx = await resolver(peticion, deps);
  if (ctx.error) return ctx.error;
  try {
    return { status: 200, body: paraZonas(await armar(ctx.torneoId, ctx.t, deps), ctx.t, ctx.zonas) };
  } catch (e) {
    console.error('[sgadd] llave:', e && e.stack ? e.stack : e);
    return error(503, 'LLAVE_ILEGIBLE', 'No se pudo armar la llave del torneo.');
  }
}

/* =====================================================================
   GET /api/v1/torneos/:torneo/rival?equipo=<clave> · EL RIVAL DE LA LLAVE
   QUE JUEGA EN OTRA ZONA (punto 79)

   El libro de otra zona sigue sin entregarse. Lo que se entrega es UN
   equipo de esa zona —su temporada regular, sus partidos, sus jugadores y
   el box de SUS jugadores— y solo si:
     1. el cliente tiene una categoría del torneo con acceso y con el
        informe pre-partido en su plan (el mismo `puedeBloque` de /scouting);
     2. la llave de SU zona tiene un cruce de SU equipo contra ese rival,
        resuelto o proyectado con la tabla de hoy: el DT se prepara antes
        de que se juegue;
     3. el rival es de OTRA zona: el de la propia ya está en su libro.
   El admin pasa sin (1) ni (2).
   ===================================================================== */
function crucesDe(ll, fases, zonas) {
  const out = [];
  fases.forEach((f) => {
    if (zonas && !Array.from(zonas).some(z => FASES.visibleEnZona(f, z))) return;
    ((ll[f.id] || {}).cruces || []).forEach((cr) => { out.push({ fase: f, cr: cr }); });
  });
  return out;
}

async function manejarRival(peticion, deps) {
  const ctx = await resolver(peticion, deps);
  if (ctx.error) return ctx.error;
  const q = (peticion && peticion.query) || {};
  const rival = CORE.claveEquipo(String(q.equipo || ''));
  if (!rival) return error(400, 'SIN_EQUIPO', 'Falta el equipo rival.');
  const { t, cat, v, zonas } = ctx;

  /* 1 · el plan, por categoría y con el plan EFECTIVO del catálogo */
  let propios = null;
  if (zonas) {
    const H = require('./handlers.js');
    const reglas = require('../lib/reglas.js');
    const club = cat[v.club] || {};
    propios = new Set();
    let conPlan = false;
    Object.keys(club.categorias || {}).forEach((slug) => {
      const k = club.categorias[slug];
      if (!k || k.torneo !== ctx.torneoId) return;
      const r = catalogo.resolver(cat, v.club, slug);
      if (!r || !AUTH.tieneAcceso(mutar.estadoEfectivo(r.suscripcion))) return;
      const plan = H.planEfectivo(r.suscripcion || {}, v.sesion, ctx.origen);
      if (!reglas.puedeBloque('scouting', Object.assign({}, v.sesion, { plan: plan })).ok) return;
      conPlan = true;
      const eq = AUTH.equipoDeCategoria(club, slug).equipo;
      if (eq) propios.add(CORE.claveEquipo(eq));
      if (v.sesion && v.sesion.equipoAsignado) propios.add(CORE.claveEquipo(v.sesion.equipoAsignado));
    });
    if (!conPlan) return error(403, AUTH.MOTIVOS.REQUIERE_PLAN, 'El informe pre-partido no está en tu plan.');
  }

  let datos;
  try { datos = paraZonas(await armar(ctx.torneoId, t, deps), t, zonas); }
  catch (e) { return error(503, 'LLAVE_ILEGIBLE', 'No se pudo armar la llave del torneo.'); }

  /* 2 · el cruce, con la llave que el cliente ve */
  const fases = FASES.parsear(t.formato || {}, { participan: TORNEOS.participanDeTorneo(t) }).fases;
  const lc = FASES.mezclarLlave({ tablas: {}, partidosPorFase: {}, zonaDeEquipo: {}, nombresZona: {} }, fases, datos, null);
  const cruces = crucesDe(FASES.llave(fases, lc), fases, zonas).filter(({ cr }) => {
    const ks = [cr.a.clave, cr.b.clave];
    if (ks.indexOf(rival) === -1) return false;
    return !propios || ks.some(k => k && k !== rival && propios.has(k));
  });
  if (propios && !cruces.length) {
    return error(403, 'SIN_CRUCE', 'Ese equipo no es tu rival en la llave: el scouting de otra zona se abre para el cruce definido.');
  }

  /* 3 · el rival es de otra zona */
  const zonaRival = Object.keys(datos.zonas || {}).find(z => (datos.zonas[z].filas || []).some(f => f.clave === rival)) || null;
  if (!zonaRival) return error(404, 'SIN_RIVAL', 'Ese equipo no está en ninguna tabla del torneo.');
  if (zonas && zonas.has(zonaRival)) {
    return error(400, 'MISMA_ZONA', 'Ese rival juega en tu zona: sus datos ya están en tu libro.');
  }
  const slug = Object.keys(t.categorias || {}).find(s => t.categorias[s] && t.categorias[s].zona === zonaRival && !t.categorias[s].interzonal);
  const k = slug && t.categorias[slug];
  if (!k || !k.sheetId) return error(404, 'SIN_LIBRO', 'La zona de ese equipo no tiene libro.');
  try {
    const libro = await sheets.obtenerLibro(k.sheetId, deps);
    etiquetas.reetiquetar(libro, slug);
    const ir = indiceRegular(t.formato || {}, aFilas(libro.hojas));
    const equipo = ir && ir.idx.exportarEquipo(rival);
    if (!equipo) return error(404, 'SIN_RIVAL', 'Ese equipo no tiene datos de fase regular.');
    /* El nombre de su liga, para rotular su mediana en el informe (punto 80). */
    equipo.equipo.__ligaOrigen.label = (datos.zonas[zonaRival] || {}).label || zonaRival;
    equipo.equipo.__ligaOrigen.zona = zonaRival;
    const c0 = cruces[0];
    return { status: 200, body: { ok: true, torneo: ctx.torneoId, zona: zonaRival,
      zonaLabel: (datos.zonas[zonaRival] || {}).label || zonaRival,
      tramo: { torneo: ir.tramo.torneo, fase: ir.fr },
      cruce: c0 ? { id: c0.cr.id, fase: c0.fase.id, label: c0.fase.label } : null,
      equipo: equipo } };
  } catch (e) {
    console.error('[sgadd] rival:', e && e.stack ? e.stack : e);
    return error(503, 'LIBRO_ILEGIBLE', 'No se pudo leer la zona del rival.');
  }
}

module.exports = { manejarLlave, manejarRival, crucesDe, limpiarCache, tablaDeZona, partidosDePostemporada, faseRegular, paraZonas };
