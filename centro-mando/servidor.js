/* =====================================================================
   centro-mando/servidor.js · el Centro de Mando Editorial, LOCAL

     node centro-mando/servidor.js        →  http://127.0.0.1:8770

   Corre en la máquina de quien administra y en ningún otro lado: lee los
   libros con la credencial local (`server/.env`), igual que
   `generar-contenido.js`, y escucha SOLO en 127.0.0.1. No hay login
   porque no hay red: quien llega a este puerto ya está sentado en la
   máquina que tiene la credencial.

   No calcula nada: le pide los números a `generar-contenido.js` —por el
   mismo camino que verifica el anonimato— y las propuestas a `motor.js`.
   Lo que se exporta y el aprendizaje van a `contenido/`, que está en
   .gitignore.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const express = require('../server/node_modules/express');
const GC = require('../generar-contenido.js');
const M = require('./motor.js');

const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(RAIZ, 'contenido', 'centro-mando');
const APRENDIZAJE = path.join(RAIZ, 'contenido', 'aprendizaje.json');
const PUERTO = Number(process.env.CENTRO_MANDO_PUERTO) || 8770;
const TTL_INDICE = 10 * 60 * 1000;

/* El libro tarda segundos en bajar: se guarda diez minutos por zona. */
const indices = new Map();
async function indiceDe(p, refrescar) {
  const k = p.ligaId + '/' + p.zonaId;
  const c = indices.get(k);
  if (c && !refrescar && Date.now() - c.t < TTL_INDICE) return c;
  const idx = await GC.leerIndice(p.zona);
  const nuevo = { idx, t: Date.now() };
  indices.set(k, nuevo);
  return nuevo;
}

function leerAprendizaje() {
  try { const d = JSON.parse(fs.readFileSync(APRENDIZAJE, 'utf8')); return Array.isArray(d.registros) ? d.registros : []; }
  catch (e) { if (e.code === 'ENOENT') return []; throw new Error('contenido/aprendizaje.json no se puede leer: ' + e.message); }
}

/** Lo que el pedido de la página se traduce a argumentos del generador. */
async function generar(b) {
  const x = b || {};
  const f = M.FORMATOS[x.formato];
  if (!f) throw new Error('Elegí un formato.');
  const args = { liga: x.liga, zona: x.zona };
  /* El Nivel 1 de APdeB sale con nombres salvo que se pida anónimo; el
     Nivel 2 al revés. Fuera de APdeB, `resolverPedido` rechaza los nombres. */
  if (x.conNombres) args['con-nombres'] = true;
  else if (f.nivel === 1) args.anonimo = true;
  const p = GC.resolverPedido(args);
  const motivo = M.motivoSinFormato(x.formato, p.liga, p.zona);
  if (motivo) return { meta: { torneo: p.liga.torneo, zona: p.zona.label }, propuestas: [], avisos: [motivo] };

  const { idx, t } = await indiceDe(p, !!x.refrescar);
  const salida = {};
  if (f.nivel === 2) {
    const piezas = M.piezasPara(x.formato, x.eje || null);
    if (!piezas.length) return { meta: { torneo: p.liga.torneo, zona: p.zona.label }, propuestas: [], avisos: ['Ninguna pieza de ese formato mide ese eje.'] };
    salida.nivel2 = GC.armarNivel2(Object.assign({ piezas: piezas.join(',') }, args), p, idx);
  } else {
    ['desde', 'hasta'].forEach((k) => { if (/^\d{4}-\d{2}-\d{2}$/.test(String(x[k] || ''))) args[k] = x[k]; });
    if (Number(x.fechaN) > 0) args['fecha-n'] = String(Number(x.fechaN));
    const pq = GC.armarNivel1(args, p, idx);
    if (!pq.ok) return { meta: { torneo: p.liga.torneo, zona: p.zona.label }, propuestas: [], avisos: pq.avisos };
    salida.nivel1 = pq;
  }
  const pond = M.ponderaciones(leerAprendizaje());
  const anonimo = f.nivel === 2 ? !(p.liga.nombres && x.conNombres) : !p.conNombres;
  return {
    meta: { torneo: p.liga.torneo, zona: p.zona.label, liga: p.ligaId, zonaId: p.zonaId, tramo: idx.liga.torneo + '|' + idx.fase, anonimo, leido: new Date(t).toISOString() },
    propuestas: M.propuestas(salida, { formato: x.formato, eje: x.eje || null }, pond),
    avisos: (salida.nivel1 && x.formato !== 'stories' ? salida.nivel1.avisos : []) || [],
  };
}

function exportar(b) {
  const x = b || {}, p = x.propuesta;
  if (!p || !p.id || !p.ok) throw new Error('No hay una propuesta con datos para exportar.');
  const dia = new Date().toISOString().slice(0, 10);
  const base = [dia, String(x.liga || 'liga').replace(/[^a-z0-9-]/gi, ''), String(p.id).replace(/[^A-Z0-9-]/gi, '')].join('_');
  fs.mkdirSync(SALIDA, { recursive: true });
  const escribir = (ext, v) => { const f = path.join(SALIDA, base + ext); fs.writeFileSync(f, v); return path.relative(RAIZ, f).replace(/\\/g, '/'); };
  const contexto = String(x.contexto || '').trim().slice(0, 600);
  return [
    escribir('.json', JSON.stringify({ meta: x.meta || null, gancho: x.gancho || null, contexto: contexto || null, propuesta: p }, null, 2)),
    escribir('.md', M.resumenMd(p, x.gancho, contexto)),
    escribir('.html', M.placasHtml(p, x.gancho, contexto)),
  ];
}

function registrar(b) {
  const v = M.normalizarRegistro(b);
  if (!v.ok) throw new Error(v.error);
  const registros = leerAprendizaje();
  registros.push(Object.assign({ cargado: new Date().toISOString() }, v.registro));
  fs.mkdirSync(path.dirname(APRENDIZAJE), { recursive: true });
  fs.writeFileSync(APRENDIZAJE, JSON.stringify({ registros }, null, 2));
  return registros;
}

function app() {
  const a = express();
  a.use(express.json({ limit: '2mb' }));
  const ruta = (f) => async (req, res) => {
    try { res.json(await f(req)); }
    catch (e) { res.status(400).json({ error: e.message }); }
  };
  a.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
  a.get('/api/opciones', ruta(() => M.opciones(GC.LIGAS)));
  a.post('/api/generar', ruta((req) => generar(req.body)));
  a.post('/api/exportar', ruta((req) => ({ archivos: exportar(req.body) })));
  const aprendizaje = () => { const r = leerAprendizaje(); return { registros: r, ponderaciones: M.ponderaciones(r) }; };
  a.get('/api/aprendizaje', ruta(aprendizaje));
  a.post('/api/aprendizaje', ruta((req) => { registrar(req.body); return aprendizaje(); }));
  return a;
}

if (require.main === module) {
  app().listen(PUERTO, '127.0.0.1', () => console.log('Centro de Mando Editorial · http://127.0.0.1:' + PUERTO));
}

module.exports = { app, generar, exportar, registrar, PUERTO };
