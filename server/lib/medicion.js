/* =====================================================================
   LA MEDICIÓN DESPUÉS DEL CLIC (punto 180)

   Instagram dice quién tocó el enlace. Esto dice qué pasó después:
   entró a la landing, abrió la demo, terminó un recorrido guiado, pidió
   una demo por WhatsApp. Por campaña y por pieza (UTM).

   SOLO CONTADORES. No se guarda la IP, el navegador, ni un identificador
   de la persona: un hash por día de Argentina (`sgadd:medicion:AAAA-MM-DD`)
   y un campo por combinación «evento|source|medium|campaign|content», que
   se incrementa (HINCRBY). Lo que se dedupe (una landing por visita) lo
   hace el navegador con sessionStorage.

   El vocabulario de eventos es CERRADO y los UTM se limpian a [a-z0-9_-],
   hasta 40 caracteres: lo que viaja en la URL lo escribe cualquiera, y un
   campo libre en KV sería una forma de llenarlo de basura.
   ===================================================================== */
'use strict';

const kv = require('./kv.js');

const EVENTOS = ['landing', 'demo_abierta', 'tour_fin', 'pedido_demo'];
const CAMPOS_UTM = ['source', 'medium', 'campaign', 'content'];
const SIN_UTM = '(directo)';
const MAX_EVENTOS = 10;
const MAX_DIAS = 92;
const PREFIJO = 'sgadd:medicion:';

function almacen(deps) { return (deps && deps.kv) || kv; }

/** Un valor de UTM limpio, o «(directo)». */
function limpiar(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || SIN_UTM;
}

function limpiarUtm(u) {
  const x = u || {};
  const out = {};
  CAMPOS_UTM.forEach(k => { out[k] = limpiar(x[k]); });
  return out;
}

/** El día de Argentina (UTC-3 fijo), como «AAAA-MM-DD». */
function diaAR(ahora) {
  const d = new Date((ahora ? new Date(ahora).getTime() : Date.now()) - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function campo(evento, utm) {
  return [evento].concat(CAMPOS_UTM.map(k => utm[k])).join('|');
}

/** Lo que manda el navegador, recortado a lo que se acepta. PURO. */
function normalizarPedido(body) {
  const b = body || {};
  const lista = Array.isArray(b.eventos) ? b.eventos.slice(0, MAX_EVENTOS) : [];
  const eventos = [];
  lista.forEach(e => {
    const x = e || {};
    const evento = String(x.evento || '');
    if (EVENTOS.indexOf(evento) === -1) return;
    eventos.push({ evento: evento, utm: limpiarUtm(x.utm) });
  });
  return eventos;
}

/** Suma cada evento a su contador del día. */
async function registrar(eventos, deps, opciones) {
  if (!eventos.length) return 0;
  const clave = PREFIJO + diaAR(opciones && opciones.ahora);
  const al = almacen(deps);
  for (const e of eventos) await al.comando(['HINCRBY', clave, campo(e.evento, e.utm), '1']);
  return eventos.length;
}

/** Los días entre dos fechas (inclusive), con tope. PURO. */
function diasEntre(desde, hasta) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(desde) || !re.test(hasta) || desde > hasta) return null;
  const out = [];
  let d = new Date(desde + 'T12:00:00Z');
  const fin = new Date(hasta + 'T12:00:00Z');
  while (d <= fin && out.length < MAX_DIAS) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

/** El crudo de KV de un día: { campo: n }. */
async function leerDia(dia, deps) {
  const al = almacen(deps);
  const crudo = await al.comando(['HGETALL', PREFIJO + dia], { soloLectura: true });
  const out = {};
  if (Array.isArray(crudo)) {
    for (let i = 0; i + 1 < crudo.length; i += 2) out[crudo[i]] = Number(crudo[i + 1]) || 0;
  } else if (crudo && typeof crudo === 'object') {
    Object.keys(crudo).forEach(k => { out[k] = Number(crudo[k]) || 0; });
  }
  return out;
}

/** El embudo: totales, por día y por campaña · pieza. PURO. */
function resumen(porDia) {
  const vacio = () => { const o = {}; EVENTOS.forEach(e => { o[e] = 0; }); return o; };
  const total = vacio();
  const dias = {};
  const piezas = {};
  Object.keys(porDia || {}).sort().forEach(dia => {
    dias[dia] = vacio();
    const c = porDia[dia] || {};
    Object.keys(c).forEach(k => {
      const p = k.split('|');
      const ev = p[0];
      if (EVENTOS.indexOf(ev) === -1) return;
      const n = Number(c[k]) || 0;
      total[ev] += n;
      dias[dia][ev] += n;
      const id = [p[1], p[2], p[3], p[4]].join('|');
      if (!piezas[id]) piezas[id] = Object.assign({ source: p[1], medium: p[2], campaign: p[3], content: p[4] }, vacio());
      piezas[id][ev] += n;
    });
  });
  const lista = Object.keys(piezas).map(k => piezas[k])
    .sort((a, b) => (b.pedido_demo - a.pedido_demo) || (b.landing - a.landing));
  /* La conversión se dice solo si hay de dónde: sin landings no hay tasa. */
  const tasa = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  return {
    eventos: EVENTOS.slice(),
    total: total,
    conversion: {
      landingADemo: tasa(total.demo_abierta, total.landing),
      demoATour: tasa(total.tour_fin, total.demo_abierta),
      demoAPedido: tasa(total.pedido_demo, total.demo_abierta),
    },
    dias: dias,
    piezas: lista,
  };
}

module.exports = { EVENTOS, CAMPOS_UTM, SIN_UTM, MAX_EVENTOS, MAX_DIAS, PREFIJO,
  limpiar, limpiarUtm, diaAR, campo, normalizarPedido, registrar, diasEntre, leerDia, resumen };
