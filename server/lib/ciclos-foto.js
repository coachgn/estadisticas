/* =====================================================================
   LA FOTO DEL INFORME DE CICLO (2026-11-06)

   El informe de las 6 secciones (js/sgadd-cicloinforme.js) se arma en el
   navegador del administrador: necesita el libro, la liga al cierre del
   ciclo y el paquete entero, que el servidor no tiene juntos. Al cerrar un
   ciclo, ese navegador manda el HTML ya armado de cada sección: la FOTO.

   - El servidor no confía en la foto para los NÚMEROS del sello: recalcula
     el ciclo desde su paquete y exige que la huella que vino coincida.
   - La foto es lo que ve el cuerpo técnico en Ciclos y lo que va en el PDF
     del mail. Así los dos dicen lo mismo y no cambian si la liga sigue.
   - Se guarda comprimida (gzip + base64): medida en el Ciclo 0 de Jujuy,
     384 KB de HTML quedan en 62 KB.

   Puro salvo zlib: se prueba sin red.
   ===================================================================== */
'use strict';

const zlib = require('zlib');

/* Evolución va PRIMERA (2026-11-08): es la primera hoja del PDF del mail. Existe desde el Ciclo 1. */
const SECCIONES = ['evolucion', 'principal', 'equipos', 'jugadores', 'clasificacion', 'fixture', 'plan'];
const TITULOS = { evolucion: 'Evolución', principal: 'Principal', equipos: 'Equipos', jugadores: 'Jugadores', clasificacion: 'Clasificación', fixture: 'Fixture', plan: 'Plan de intervención' };
const MAX_BYTES = 3 * 1024 * 1024;     // el HTML entero, sin comprimir
const MAX_ESTILO = 120 * 1024;
/* Las rutas relativas del informe (escudos, logos) se resuelven contra el panel publicado. */
const BASE_PANEL = 'https://coachgn.github.io/estadisticas/';

/** Valida la foto que manda el navegador. Devuelve { ok, foto } o { ok: false, motivo }. */
function validar(crudo) {
  const f = crudo && typeof crudo === 'object' ? crudo : null;
  if (!f || !f.secciones || typeof f.secciones !== 'object') return { ok: false, motivo: 'Falta el informe armado.' };
  const secciones = {};
  let total = 0;
  SECCIONES.forEach((s) => {
    const h = f.secciones[s];
    if (typeof h === 'string' && h.trim()) { secciones[s] = h; total += h.length; }
  });
  if (!secciones.principal) return { ok: false, motivo: 'El informe no trae la sección Principal.' };
  const estilo = typeof f.estilo === 'string' ? f.estilo : '';
  if (estilo.length > MAX_ESTILO) return { ok: false, motivo: 'El estilo del informe es demasiado grande.' };
  if (total + estilo.length > MAX_BYTES) return { ok: false, motivo: 'El informe pesa más de 3 MB.' };
  const titulo = String(f.titulo || '').replace(/[<>]/g, '').slice(0, 160);
  return { ok: true, foto: { titulo, estilo, secciones, generado: typeof f.generado === 'string' ? f.generado.slice(0, 40) : null } };
}

/* ---- LAS METAS CONGELADAS (Evolución, 2026-11-08) ----
   Las arma el navegador del admin con el informe (js/sgadd-cicloinforme.js, metasDelCiclo).
   Se guardan tal cual las mide el ciclo siguiente: id, base, meta, liga y su valor en puntos.
   Solo se acota la forma: números finitos, textos cortos, a lo sumo 120 metas. */
const SECCIONES_META = new Set(SECCIONES.concat(['fixture']));
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
const txt = (v, max) => String(v === undefined || v === null ? '' : v).replace(/[<>]/g, '').slice(0, max);
function validarMetas(crudo) {
  const m = crudo && typeof crudo === 'object' ? crudo : null;
  if (!m || !Array.isArray(m.metas)) return null;
  const metas = m.metas.slice(0, 120).map((x) => {
    if (!x || typeof x !== 'object') return null;
    const id = typeof x.id === 'string' ? x.id : '', base = num(x.base), meta = num(x.meta);
    if (id.length > 80 || !/^[A-Za-z0-9_:%. ,'ÁÉÍÓÚÑáéíóúñü()-]+$/.test(id) || base === null || meta === null) return null;
    return { id, secciones: (Array.isArray(x.secciones) ? x.secciones : []).filter(s => SECCIONES_META.has(s)).slice(0, 7),
      aspecto: txt(x.aspecto, 40), lado: txt(x.lado, 20), label: txt(x.label, 120), unidad: ['pct', 'p2', 'n1', 'signo'].includes(x.unidad) ? x.unidad : 'n1',
      dir: x.dir === -1 ? -1 : 1, tipo: x.tipo === 'sostener' ? 'sostener' : 'mejorar', base, meta, liga: num(x.liga), pts: num(x.pts) };
  }).filter(Boolean);
  const c = m.ciclo && typeof m.ciclo === 'object' ? m.ciclo : {};
  return { version: 1, ciclo: { numero: num(c.numero), desde: txt(c.desde, 10), hasta: txt(c.hasta, 10) }, metas, reconstruidas: m.reconstruidas === true };
}

const comprimir = (foto) => zlib.gzipSync(Buffer.from(JSON.stringify(foto), 'utf8')).toString('base64');
function descomprimir(b64) {
  try { return JSON.parse(zlib.gunzipSync(Buffer.from(String(b64 || ''), 'base64')).toString('utf8')); }
  catch (e) { return null; }
}

/** El documento HTML para el PDF: las 6 secciones, cada una en hoja nueva, en el tema de papel. */
function documento(foto, meta) {
  const m = meta || {};
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const cuerpo = SECCIONES.filter(s => foto.secciones[s]).map((s, i) =>
    `<section class="foto-sec"${i ? ' style="break-before:page"' : ''}><h2 class="foto-h2">${esc(TITULOS[s])}</h2>${abrirDetalles(foto.secciones[s])}</section>`).join('');
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><base href="${BASE_PANEL}">
<title>${esc(foto.titulo || 'Informe de ciclo')}</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<style>@page{size:A4;margin:12mm 10mm}body{margin:0;background:#fff;color:#0f1b2e;font-family:Inter,Arial,sans-serif;font-size:12px}
.foto-cab{border-bottom:3px solid #f7941e;padding:0 0 8px;margin:0 0 12px}.foto-cab b{font:700 20px 'Barlow Condensed',sans-serif;text-transform:uppercase;letter-spacing:.06em}
.foto-cab span{display:block;color:#475569;font-size:12px;margin-top:2px}.foto-h2{font:700 18px 'Barlow Condensed',sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#b45309;margin:0 0 8px}
.ci-rm,.ci details>summary{list-style:none}details{display:block}details>*{display:block}button{display:none}
${foto.estilo || ''}</style></head><body>
<header class="foto-cab"><b>MotorStats AR · ${esc(foto.titulo || 'Informe de ciclo')}</b><span>${esc([m.equipo, m.desde && m.hasta ? m.desde + ' al ' + m.hasta : '', m.record].filter(Boolean).join(' · '))}</span></header>
${cuerpo}</body></html>`;
}

/** Los `<details>` del informe se abren en el papel: en una hoja impresa nadie puede tocar «Ver más». */
const abrirDetalles = (html) => String(html).replace(/<details(?![^>]*\bopen\b)/g, '<details open');

module.exports = { validar, validarMetas, comprimir, descomprimir, documento, abrirDetalles, SECCIONES, TITULOS, MAX_BYTES, BASE_PANEL };
