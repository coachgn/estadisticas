/* =====================================================================
   LO SIMULADO CONTRA LO QUE PASÓ (punto 171)

   GET /api/cron/predicciones            el cron diario (CRON_SECRET o ADMIN)
   GET /api/v1/predicciones/:torneo/:zona lo congelado de una zona (ADMIN)

   El cron recorre los torneos del catálogo con fuente de fixture, y por
   cada zona regular con libro:
     1. lee el fixture (el mismo camino de las alertas de partido);
     2. se queda con los partidos programados de hoy a pasado mañana;
     3. si hay alguno, lee el libro, arma el índice de la fase REGULAR (el
        mismo que usa la llave, y el mismo con que el Simulador proyecta
        una eliminatoria, punto 161) y cruza los nombres del fixture con
        el libro;
     4. congela la predicción del Simulador con HSETNX.

   `?simular=1` hace todo y no escribe. Una zona que falla no frena a las
   otras y queda en `fallaron`. El Simulador es solo de ADMIN, así que lo
   congelado también.
   ===================================================================== */
'use strict';

const catalogo = require('../lib/catalogo.js');
const sheets = require('../lib/google-sheets.js');
const etiquetas = require('../lib/etiquetas.js');
const fuentes = require('../lib/fixture-fuentes.js');
const alertas = require('../lib/alertas-partidos.js');
const PRED_KV = require('../lib/predicciones.js');
const { verificarToken, tokenDeLaPeticion } = require('../lib/auth.js');
const { mismoSecreto } = require('./mails.js');
const { partidosDe } = require('./alertas-partidos.js');
const { indiceRegular } = require('./llave.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');
const CORE = require('../lib/compartido/sgadd-core.js');
if (typeof global.SGADD === 'undefined') global.SGADD = CORE;
const DATOS = require('../lib/compartido/sgadd-data.js');
const F4 = require('../lib/compartido/sgadd-4factores.js');
const P = require('../lib/compartido/sgadd-predicciones.js');

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

function error(status, codigo, mensaje) {
  return { status: status, body: { ok: false, codigo: codigo, mensaje: mensaje } };
}

function aFilas(hojas) {
  const out = {};
  Object.keys(hojas || {}).forEach((h) => { out[h] = DATOS.matrizAFilas(hojas[h]); });
  return out;
}

/** Los alias que declara la zona del catálogo: nombre web → nombre del libro. */
function aliasDe(k) {
  const out = {};
  ((k && k.equipos) || []).forEach((e) => {
    if (!e || !e.nombre) return;
    out[e.nombre] = e.nombre;
    (e.alias || []).forEach((a) => { out[a] = e.nombre; });
  });
  return out;
}

/** Las zonas a recorrer: torneos con fuente de fixture, zonas regulares con libro. */
function zonasACongelar(cat) {
  const out = [];
  Object.keys(cat || {}).forEach((id) => {
    const t = cat[id];
    if (!t || t.tipo !== 'torneo' || !fuentes.configDe(t)) return;
    Object.keys(t.categorias || {}).forEach((slug) => {
      const k = t.categorias[slug];
      if (!k || !k.zona || !k.sheetId || k.interzonal) return;
      out.push({ torneo: id, zona: k.zona, slug: slug, k: k, formato: t.formato || {} });
    });
  });
  return out;
}

/** Lo puro de una zona: del fixture y el libro a los registros a congelar. */
function planificarZona(partidos, hojas, formato, alias, hoy, ahoraMs) {
  const ir = indiceRegular(formato, hojas);
  if (!ir) return { registros: [], omitidos: [], sinCruce: [], motivo: 'El libro no tiene una fase regular.' };
  const claves = ir.idx.lista().map(e => e.clave);
  const cruzado = fuentes.cruzarConLibro(partidos, claves, alias, CORE.claveEquipo);
  const cand = P.candidatos(cruzado.partidos, hoy);
  const res = P.resultados(ir.idx);
  const registros = [];
  const omitidos = [];
  cand.forEach((c) => {
    if (P.resultadoDe(c, res)) { omitidos.push({ clave: c.clave, motivo: 'Ya está jugado en el libro.' }); return; }
    const reg = P.congelar(F4, ir.idx, c, ahoraMs);
    if (reg.omitido) omitidos.push({ clave: reg.clave, motivo: reg.motivo }); else registros.push(reg);
  });
  const pendientes = cruzado.partidos.map((x, i) => (x.sinCruce ? partidos[i] : null)).filter(Boolean);
  return { registros: registros, omitidos: omitidos, sinCruce: cruzado.sinCruce, pendientes: pendientes, tramo: ir.tramo && ir.tramo.id };
}

/* LOS CRUCES ENTRE ZONAS. En una postemporada interzonal el rival no está
   en el libro de la zona, así que `planificarZona` lo deja «sin cruce».
   Se proyecta con un índice armado con los libros de TODAS las zonas del
   torneo: cada equipo con sus propios partidos. En la fase regular las
   zonas no se cruzan, así que no hay datos que conecten sus niveles: el
   modelo los trata como una sola liga. Las filas TIPO (la mediana) se
   toman solo de la primera zona: dos filas TIPO dejarían la vara a la
   suerte del orden. */
const ES_TIPO = /\bTIPO\b/i;
function hojasDeTorneo(hojasPorZona) {
  const out = {};
  /* Cada hoja es { cols, filas } (`matrizAFilas`): las columnas se unen,
     así un libro con una columna de más no la pierde. */
  hojasPorZona.forEach((h, i) => {
    Object.keys(h || {}).forEach((hoja) => {
      const x = h[hoja] || {};
      const filas = (x.filas || []).filter((f) => {
        if (i === 0 || !f) return true;
        const eq = String(f.EQUIPO || '').trim();
        return !(!eq && !String(f.NOMBRES || '').trim()) && !ES_TIPO.test(eq) && !ES_TIPO.test(String(f.NOMBRES || ''));
      });
      const o = out[hoja] || (out[hoja] = { cols: [], filas: [] });
      (x.cols || []).forEach((c) => { if (o.cols.indexOf(c) < 0) o.cols.push(c); });
      o.filas = o.filas.concat(filas);
    });
  });
  return out;
}

/** ¿El torneo declara alguna fase que cruce zonas? */
function cruzaZonas(formato) {
  return ((formato && formato.fases) || []).some(f => f && String(f.cruce || '').toLowerCase() === 'interzonal');
}

/** Lo puro de los cruces entre zonas: [{zona, hojas}] + los partidos pendientes. */
function planificarEntreZonas(zonas, partidos, formato, alias, hoy, ahoraMs) {
  const zonaDe = {};
  const repetidos = new Set();
  zonas.forEach((z) => {
    (((z.hojas && z.hojas['Base Datos E']) || {}).filas || []).forEach((f) => {
      const eq = String((f && f.EQUIPO) || '').trim();
      if (!eq || ES_TIPO.test(eq)) return;
      const k = CORE.claveEquipo(eq);
      if (zonaDe[k] && zonaDe[k] !== z.zona) repetidos.add(k);
      zonaDe[k] = z.zona;
    });
  });
  /* Un mismo equipo en dos «zonas» quiere decir que son categorías
     distintas (U21 y U23 del mismo club), no zonas de una competencia:
     mezclarlas mediría a un equipo con los partidos de otra categoría. */
  if (repetidos.size) {
    return { registros: [], omitidos: [], sinCruce: [], motivo: 'Las zonas comparten equipos (' + Array.from(repetidos).slice(0, 3).join(', ') + '): son categorías distintas y no se mezclan.' };
  }
  const ir =indiceRegular(formato, hojasDeTorneo(zonas.map(z => z.hojas)));
  if (!ir) return { registros: [], omitidos: [], sinCruce: [], motivo: 'Los libros no tienen una fase regular.' };
  const claves = ir.idx.lista().map(e => e.clave);
  const cruzado = fuentes.cruzarConLibro(partidos, claves, alias, CORE.claveEquipo);
  const res = P.resultados(ir.idx);
  const registros = [];
  const omitidos = [];
  P.candidatos(cruzado.partidos, hoy).forEach((c) => {
    const zl = zonaDe[c.localClave], zv = zonaDe[c.visitanteClave];
    if (!zl || !zv) { omitidos.push({ clave: c.clave, motivo: 'Un equipo no tiene partidos en la fase regular de ninguna zona.' }); return; }
    if (P.resultadoDe(c, res)) { omitidos.push({ clave: c.clave, motivo: 'Ya está jugado en el libro.' }); return; }
    const reg = P.congelar(F4, ir.idx, c, ahoraMs);
    if (reg.omitido) { omitidos.push({ clave: reg.clave, motivo: reg.motivo }); return; }
    reg.entreZonas = zl !== zv;
    reg.zonas = zl === zv ? [zl] : [zl, zv];
    registros.push(reg);
  });
  return { registros: registros, omitidos: omitidos, sinCruce: cruzado.sinCruce, tramo: ir.tramo && ir.tramo.id };
}

function autorizado(peticion, env) {
  const secreto = env.CRON_SECRET || '';
  const enc = String(((peticion && peticion.headers) || {}).authorization || '');
  if (secreto && mismoSecreto(enc.replace(/^Bearer\s+/i, ''), secreto)) return null;
  const v = verificarToken(tokenDeLaPeticion(peticion));
  if (v.ok && v.rol === AUTH.ROLES.ADMIN) return null;
  return secreto ? error(401, 'CRON', 'Falta el secreto del cron.')
    : error(503, 'SIN_CRON_SECRET', 'CRON_SECRET no está configurado: la corrida no se habilita sin él.');
}

async function manejarCronPredicciones(peticion, deps) {
  const d = deps || {};
  const env = d.env || process.env;
  const no = autorizado(peticion, env);
  if (no) return no;
  const q = String(((peticion && peticion.query) || {}).simular || '').toLowerCase();
  const simular = q === '1' || q === 'true';
  const ahora = typeof d.ahora === 'number' ? d.ahora : Date.now();
  const hoy = alertas.hoyAR(ahora);

  let cat;
  try { cat = d.catalogo || (await catalogo.cargar(d)).catalogo; }
  catch (e) { return error(502, 'CATALOGO', 'No se pudo leer el catálogo: ' + e.message); }

  const leerFixture = d.partidosDe || partidosDe;
  const leerLibro = d.obtenerLibro || sheets.obtenerLibro;
  const zonas = [];
  const fallaron = [];
  const porTorneo = {};
  zonasACongelar(cat).forEach((z) => { (porTorneo[z.torneo] = porTorneo[z.torneo] || []).push(z); });
  /* Un registro entre zonas se guarda en la clave de LAS DOS zonas: cada
     club lo ve en la card de la suya. */
  const guardar = async (torneo, zonaIds, registros, sal) => {
    for (const reg of registros) {
      let nuevo = false;
      for (const zona of zonaIds(reg)) { if (await PRED_KV.congelar(torneo, zona, reg, d)) nuevo = true; }
      if (nuevo) sal.congeladas++; else sal.yaEstaban++;
    }
  };
  for (const torneo of Object.keys(porTorneo)) {
    const grupo = porTorneo[torneo];
    const hojasDe = {};
    const leer = async (z) => {
      if (!hojasDe[z.zona]) {
        const libro = await leerLibro(z.k.sheetId, d);
        etiquetas.reetiquetar(libro, z.slug);
        hojasDe[z.zona] = aFilas(libro.hojas);
      }
      return hojasDe[z.zona];
    };
    const pendientes = new Map();
    let zonaCayo = false;
    for (const z of grupo) {
      const sal = { torneo: z.torneo, zona: z.zona, congeladas: 0, yaEstaban: 0, enVentana: 0 };
      try {
        const fx = await leerFixture({ torneo: z.torneo, zona: z.zona }, Object.assign({}, d, { simular: simular }));
        /* Sin partidos en la ventana no se lee el libro: es lo caro. */
        const enVentana = (fx.partidos || []).filter((p) => {
          const f = P.iso(p.fecha);
          return f && f >= hoy && f <= P.sumarDias(hoy, P.DIAS_ANTES);
        });
        sal.enVentana = enVentana.length;
        if (!enVentana.length) { zonas.push(sal); continue; }
        const plan = planificarZona(enVentana, await leer(z), z.formato, aliasDe(z.k), hoy, ahora);
        sal.tramo = plan.tramo || null;
        sal.omitidos = plan.omitidos;
        sal.sinCruce = plan.sinCruce;
        if (plan.motivo) sal.motivo = plan.motivo;
        (plan.pendientes || []).forEach((p) => {
          pendientes.set(P.iso(p.fecha) + '|' + CORE.claveEquipo(p.local) + '|' + CORE.claveEquipo(p.visitante), p);
        });
        if (simular) sal.registros = plan.registros;
        else await guardar(z.torneo, () => [z.zona], plan.registros, sal);
        zonas.push(sal);
      } catch (e) {
        zonaCayo = true;
        fallaron.push({ torneo: z.torneo, zona: z.zona, codigo: e.codigo || 'ERROR', mensaje: e.message });
      }
    }
    /* El segundo pase, solo con dos zonas o más y algo que no cruzó. */
    /* Y solo en un torneo que declara una fase entre zonas: en Formativas
       las «zonas» son categorías (U21, U23) que nunca se cruzan. */
    if (grupo.length < 2 || !pendientes.size || !cruzaZonas(grupo[0].formato)) continue;
    const sal = { torneo: torneo, zona: 'entre-zonas', congeladas: 0, yaEstaban: 0, enVentana: pendientes.size };
    try {
      const zs = [];
      for (const z of grupo) zs.push({ zona: z.zona, hojas: await leer(z) });
      const alias = {};
      grupo.forEach(z => Object.assign(alias, aliasDe(z.k)));
      const plan = planificarEntreZonas(zs, Array.from(pendientes.values()), grupo[0].formato, alias, hoy, ahora);
      sal.tramo = plan.tramo || null;
      sal.omitidos = plan.omitidos;
      sal.sinCruce = plan.sinCruce;
      if (plan.motivo) sal.motivo = plan.motivo;
      if (zonaCayo) sal.aviso = 'Una zona no se pudo leer: los cruces con ella quedan sin proyectar.';
      if (simular) sal.registros = plan.registros;
      else await guardar(torneo, reg => reg.zonas, plan.registros, sal);
      zonas.push(sal);
    } catch (e) {
      fallaron.push({ torneo: torneo, zona: 'entre-zonas', codigo: e.codigo || 'ERROR', mensaje: e.message });
    }
  }
  return { status: fallaron.length && !zonas.length ? 502 : 200,
    body: { ok: !fallaron.length, hoy: hoy, simulacion: simular, version: P.VERSION, zonas: zonas, fallaron: fallaron } };
}

async function manejarPredicciones(peticion, deps) {
  const d = deps || {};
  const v = verificarToken(tokenDeLaPeticion(peticion));
  if (!v.ok) return error(401, v.motivo, 'El token de acceso no es válido.');
  if (v.rol !== AUTH.ROLES.ADMIN) return error(403, 'SOLO_ADMIN', 'Las predicciones del simulador son solo del administrador.');
  const params = (peticion && peticion.params) || {};
  const torneo = String(params.torneo || '').toLowerCase();
  const zona = String(params.zona || '').toLowerCase();
  if (!SLUG.test(torneo) || !SLUG.test(zona)) return error(400, 'RUTA_INVALIDA', 'Falta el torneo o la zona.');
  let hash;
  try { hash = await PRED_KV.leer(torneo, zona, d); }
  catch (e) { return error(503, 'KV', 'No se pudieron leer las predicciones.'); }
  const lista = Object.keys(hash || {}).map(k => hash[k]).filter(x => x && x.clave && x.fecha)
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  return { status: 200, body: { ok: true, torneo: torneo, zona: zona, predicciones: lista } };
}

module.exports = { manejarCronPredicciones, manejarPredicciones, planificarZona, planificarEntreZonas, hojasDeTorneo, cruzaZonas, zonasACongelar, aliasDe };
