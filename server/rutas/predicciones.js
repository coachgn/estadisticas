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
  for (const z of zonasACongelar(cat)) {
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
      const libro = await leerLibro(z.k.sheetId, d);
      etiquetas.reetiquetar(libro, z.slug);
      const plan = planificarZona(enVentana, aFilas(libro.hojas), z.formato, aliasDe(z.k), hoy, ahora);
      sal.tramo = plan.tramo || null;
      sal.omitidos = plan.omitidos;
      sal.sinCruce = plan.sinCruce;
      if (plan.motivo) sal.motivo = plan.motivo;
      if (simular) {
        sal.registros = plan.registros;
      } else {
        for (const reg of plan.registros) {
          if (await PRED_KV.congelar(z.torneo, z.zona, reg, d)) sal.congeladas++; else sal.yaEstaban++;
        }
      }
      zonas.push(sal);
    } catch (e) {
      fallaron.push({ torneo: z.torneo, zona: z.zona, codigo: e.codigo || 'ERROR', mensaje: e.message });
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

module.exports = { manejarCronPredicciones, manejarPredicciones, planificarZona, zonasACongelar, aliasDe };
