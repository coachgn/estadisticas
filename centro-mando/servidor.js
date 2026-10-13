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
   Lo que se exporta, la cola de Canva y el aprendizaje van a
   `contenido/`, que está en .gitignore.

   LO QUE ESTE SERVIDOR NO HACE: hablar con Canva. No tiene credencial de
   Canva ni dónde publicar el HTML para que Canva lo lea; deja cada pieza
   aprobada en una COLA (`cola-canva.json`) que se importa desde una
   sesión con el conector.
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const express = require('../server/node_modules/express');
/* La clave de Claude vive en centro-mando/.env; se carga ANTES de pedir el
   módulo de agentes, que lee el entorno. No pisa lo que ya esté definido. */
require('../server/lib/env.js').cargar(path.join(__dirname, '.env'));
require('../server/lib/env.js').cargar();
const GC = require('../generar-contenido.js');
const M = require('./motor.js');
const E = require('./explorador.js');
const LIBRE = require('./libre.js');
const LLM = require('./llm.js');

const RAIZ = path.join(__dirname, '..');
/* Dónde se escribe. La variable existe para los tests, que no pueden
   tocar la bandeja ni el historial de verdad. */
const DATOS = process.env.CENTRO_MANDO_DATOS || path.join(RAIZ, 'contenido');
const SALIDA = path.join(DATOS, 'centro-mando');
const COLA = path.join(SALIDA, 'cola-canva.json');
const BANDEJA = path.join(SALIDA, 'bandeja.json');
const APRENDIZAJE = path.join(DATOS, 'aprendizaje.json');
const QUINCENA_MS = 14 * 24 * 60 * 60 * 1000;
const PUERTO = Number(process.env.CENTRO_MANDO_PUERTO) || Number(process.env.PORT) || 8770;
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

function leerLista(archivo, clave) {
  try { const d = JSON.parse(fs.readFileSync(archivo, 'utf8')); return Array.isArray(d[clave]) ? d[clave] : []; }
  catch (e) { if (e.code === 'ENOENT') return []; throw new Error(path.basename(archivo) + ' no se puede leer: ' + e.message); }
}
function escribirLista(archivo, clave, lista) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify({ [clave]: lista }, null, 2));
}
const leerAprendizaje = () => leerLista(APRENDIZAJE, 'registros');

/* Las Stories tienen su plantilla diseñada en `contenido/placas/`, que
   está fuera del repo: si no está en esta máquina, se cae a la genérica. */
function plantillaStories() {
  try { const g = require(path.join(RAIZ, 'contenido', 'placas', 'generar-stories.js')); return typeof g.html === 'function' ? g.html : null; }
  catch (e) { return null; }
}

/** El HTML de las placas de una propuesta: el mismo para el visor y para exportar. */
function placas(p, gancho, contexto) {
  if (!p || !p.id || !p.ok) throw new Error('No hay una propuesta con datos.');
  const texto = gancho && typeof gancho === 'object' ? gancho.texto : gancho;
  const ctx = String(contexto || '').trim().slice(0, 600);
  if (p.id === 'STORIES' && p.datos && p.datos.meta && !p.datos.anonimo) {
    const html = plantillaStories();
    if (html) return { html: html({ meta: p.datos.meta, placas: p.datos.placas, formato: p.datos.formato }), plantilla: 'stories' };
  }
  return { html: M.placasHtml(p, texto, ctx), plantilla: 'generica' };
}

/** Lo que el pedido de la página se traduce a argumentos del generador. */
async function generar(b) {
  const x = b || {};
  const auto = x.formato === M.AUTO;
  const f = M.FORMATOS[x.formato];
  if (!f && !auto) throw new Error('Elegí un formato.');
  const args = { liga: x.liga, zona: x.zona };
  /* El Nivel 1 de APdeB sale con nombres salvo que se pida anónimo; el
     Nivel 2 al revés. En «destacadas» cada nivel va con su regla por
     defecto. Fuera de APdeB, `resolverPedido` rechaza los nombres. */
  if (!auto && x.conNombres) args['con-nombres'] = true;
  else if (!auto && f.nivel === 1) args.anonimo = true;
  const p = GC.resolverPedido(args);
  const meta0 = { torneo: p.liga.torneo, zona: p.zona.label, liga: p.ligaId, zonaId: p.zonaId };
  const motivo = auto ? null : M.motivoSinFormato(x.formato, p.liga, p.zona);
  if (motivo) return { meta: meta0, propuestas: [], avisos: [motivo] };

  const { idx, t } = await indiceDe(p, !!x.refrescar);
  const salida = {}, avisos = [];
  if (auto || f.nivel === 2) {
    const piezas = auto ? Object.keys(M.PIEZAS) : M.piezasPara(x.formato, x.eje || null);
    if (!piezas.length) return { meta: meta0, propuestas: [], avisos: ['Ninguna pieza de ese formato mide ese eje.'] };
    const a2 = { liga: x.liga, zona: x.zona, piezas: piezas.join(',') };
    if (!auto && x.conNombres) a2['con-nombres'] = true;
    salida.nivel2 = GC.armarNivel2(a2, p, idx);
  }
  if (auto || f.nivel === 1) {
    ['desde', 'hasta'].forEach((k) => { if (/^\d{4}-\d{2}-\d{2}$/.test(String(x[k] || ''))) args[k] = x[k]; });
    if (Number(x.fechaN) > 0) args['fecha-n'] = String(Number(x.fechaN));
    const pq = GC.armarNivel1(args, p, idx);
    if (pq.ok) { salida.nivel1 = pq; if (x.formato !== 'stories') pq.avisos.forEach((a) => avisos.push(a)); }
    else if (!auto) return { meta: meta0, propuestas: [], avisos: pq.avisos };
    else avisos.push('Nivel 1: ' + pq.avisos.join(' '));
  }
  const pond = M.ponderaciones(leerAprendizaje());
  const anonimo = auto ? null : (f.nivel === 2 ? !(p.liga.nombres && x.conNombres) : !p.conNombres);
  return {
    meta: Object.assign(meta0, { tramo: idx.liga.torneo + '|' + idx.fase, anonimo, leido: new Date(t).toISOString() }),
    propuestas: M.propuestas(salida, { formato: x.formato, eje: auto ? null : (x.eje || null), stories: !!p.liga.nombres }, pond),
    avisos,
  };
}

/* --------------------------------------------------------------------
   EL EXPLORADOR
   -------------------------------------------------------------------- */
async function zonasDe(p, refrescar) {
  const ids = Object.keys(p.liga.zonas);
  const out = [];
  for (const z of ids) {
    const pz = GC.resolverPedido({ liga: p.ligaId, zona: z });
    try { out.push({ id: z, label: pz.zona.label || 'Única', idx: (await indiceDe(pz, refrescar)).idx }); }
    catch (e) { out.push({ id: z, label: pz.zona.label || z, error: e.message }); }
  }
  return out;
}

async function explorar(b) {
  const x = b || {};
  const p = GC.resolverPedido({ liga: x.liga, zona: x.zona });
  if (x.nivel === 'zonas') {
    const zs = await zonasDe(p, !!x.refrescar), buenas = zs.filter((z) => z.idx);
    if (buenas.length < 2) throw new Error('Para comparar zonas hacen falta al menos dos con libro: ' + p.liga.torneo + ' tiene ' + buenas.length + '.');
    const r = E.zonas(buenas, x);
    r.avisos = zs.filter((z) => z.error).map((z) => z.label + ': no se pudo leer (' + z.error + ').');
    return r;
  }
  const { idx } = await indiceDe(p, !!x.refrescar);
  return E.explorar(idx, x.nivel, x);
}

async function anomalias(b) {
  const x = b || {};
  const p = GC.resolverPedido({ liga: x.liga, zona: x.zona });
  const { idx } = await indiceDe(p, !!x.refrescar);
  const v = GC.ventana(idx, {});
  const r = E.anomalias(idx, v ? GC.filasDeVentana(idx, v) : []);
  r.ventana = v ? { desde: v.desde, hasta: v.hasta } : null;
  r.zonas = [];
  if (Object.keys(p.liga.zonas).length > 1) {
    try { r.zonas = E.diferenciasEntreZonas((await zonasDe(p, false)).filter((z) => z.idx)); }
    catch (e) { r.avisoZonas = e.message; }
  }
  return r;
}

/**
 * La PREGUNTA TÁCTICA. Claude la traduce a un pedido del Explorador y el
 * Explorador local lo corre: el modelo no ve el libro ni devuelve datos.
 * Una condición que el modelo pidió y el catálogo no reconoce NO se
 * descarta en silencio —cambiaría la pregunta—: se rechaza la traducción.
 */
async function preguntar(b, deps) {
  const x = b || {};
  if (!deps && !LLM.disponible()) throw new Error('La IA está apagada. ' + LLM.motivoApagada());
  const p = GC.resolverPedido({ liga: x.liga, zona: x.zona });
  const r = await LLM.interpretar(x.pregunta, E.opciones(), deps);
  const c = r.consulta;
  if (!c.sePuede) return { sePuede: false, motivo: c.motivo || 'La pregunta pide algo que no está en los libros.', lectura: c.lectura, modelo: r.modelo };
  const crudo = { nivel: c.nivel, metricas: c.metricas, orden: c.orden, sentido: c.sentido === 'mejor' ? undefined : c.sentido, top: c.top, soloCalificados: c.soloCalificados,
    condiciones: c.nivel === 'zonas' ? [] : c.condiciones };
  const validado = E.pedido(c.nivel, crudo);
  const perdidas = crudo.condiciones.length - validado.condiciones.length;
  if (perdidas || validado.orden !== c.orden) {
    throw new Error('No pude traducir la pregunta con las métricas del libro (' + (perdidas ? perdidas + ' condición(es) usan una métrica que no existe en ese nivel' : 'la métrica de orden «' + c.orden + '» no existe en ese nivel') + '). Armala con los controles de abajo.');
  }
  if (c.nivel === 'zonas' && Object.keys(p.liga.zonas).length < 2) throw new Error('La pregunta compara zonas y ' + p.liga.torneo + ' tiene una sola.');
  const consulta = Object.assign({}, crudo, { metricas: validado.columnas, orden: validado.orden, liga: x.liga, zona: x.zona });
  return { sePuede: true, lectura: c.lectura, consulta, resultado: await explorar(consulta), modelo: r.modelo, uso: r.uso };
}

/* --------------------------------------------------------------------
   LA BANDEJA
   Una por liga y zona, en disco: lo que se propuso esta quincena y qué
   se hizo con cada pieza. Se arma al pedirla; nadie la arma de fondo.
   -------------------------------------------------------------------- */
function leerBandejas() {
  try { const d = JSON.parse(fs.readFileSync(BANDEJA, 'utf8')); return d && typeof d.bandejas === 'object' ? d.bandejas : {}; }
  catch (e) { if (e.code === 'ENOENT') return {}; throw new Error('bandeja.json no se puede leer: ' + e.message); }
}
function guardarBandeja(clave, b) {
  const todas = leerBandejas();
  todas[clave] = b;
  fs.mkdirSync(path.dirname(BANDEJA), { recursive: true });
  fs.writeFileSync(BANDEJA, JSON.stringify({ bandejas: todas }, null, 2));
  return b;
}
const claveBandeja = (p) => p.ligaId + '-' + p.zonaId;

async function bandeja(b) {
  const x = b || {};
  const p = GC.resolverPedido({ liga: x.liga, zona: x.zona });
  const clave = claveBandeja(p);
  const previa = leerBandejas()[clave];
  const vencida = !previa || Date.now() - Date.parse(previa.generada) > QUINCENA_MS;
  if (previa && !x.rearmar && !vencida) return previa;
  const r = await generar({ liga: x.liga, zona: x.zona, formato: M.AUTO, refrescar: !!x.rearmar });
  const armada = M.armarBandeja(r.propuestas, Date.now().toString(36));
  /* Rearmar no se lleva puesto lo que se mandó desde el laboratorio y
     sigue pendiente: eso lo eligió alguien a mano. */
  const delLab = previa ? previa.items.filter((i) => i.estado === 'pendiente' && /^LAB-/.test(i.propuesta.id)) : [];
  return guardarBandeja(clave, Object.assign(armada, { items: delLab.concat(armada.items), clave, generada: new Date().toISOString(), meta: r.meta, avisos: r.avisos }));
}

async function accionDeBandeja(b) {
  const x = b || {};
  const p = GC.resolverPedido({ liga: x.liga, zona: x.zona });
  const clave = claveBandeja(p);
  let actual = leerBandejas()[clave];
  if (!actual) throw new Error('No hay bandeja armada para esa zona.');
  let extra = {};
  if (x.accion === 'enfoque') actual = M.cambiarEnfoque(actual, x.uid);
  else if (x.accion === 'tono') actual = M.cambiarTono(actual, x.uid);
  else if (x.accion === 'descartar') actual = M.marcar(actual, x.uid, 'descartada');
  else if (x.accion === 'aprobar') {
    const item = actual.items.find((i) => i.uid === x.uid);
    if (!item) throw new Error('Esa propuesta ya no está en la bandeja.');
    extra = aprobar({ propuesta: item.propuesta, gancho: x.gancho, contexto: x.contexto, liga: clave, meta: actual.meta });
    actual = M.marcar(actual, x.uid, 'aprobada');
  } else throw new Error('Esa acción no existe.');
  return Object.assign({ bandeja: guardarBandeja(clave, actual) }, extra);
}

/**
 * La IA REDACTA un ítem en su tono vigente. La guarda numérica ya corrió
 * adentro de `LLM.redactar`; acá se suma la del anonimato: si la pieza era
 * anónima, la redacción tiene que seguir siéndolo o se tira ENTERA.
 * La bandeja se relee DESPUÉS de esperar al modelo: varias redacciones
 * corren a la vez y cada una escribiría sobre una foto vieja.
 */
async function redactarItem(b, deps) {
  const x = b || {};
  const p = GC.resolverPedido({ liga: x.liga, zona: x.zona });
  const clave = claveBandeja(p);
  const antes = (leerBandejas()[clave] || { items: [] }).items.find((i) => i.uid === x.uid);
  if (!antes) throw new Error('Esa propuesta ya no está en la bandeja.');
  const base = antes.base || antes.propuesta, tono = antes.propuesta.tono;
  let red;
  if (x.redaccion) {
    /* Una redacción que llega HECHA (la escribió una sesión de Claude Code
       con /agencia): pasa por la MISMA guarda numérica que la del servidor. */
    if (x.tono && x.tono !== tono) throw new Error('La pieza está en tono ' + tono + ': la redacción dice ' + x.tono + '.');
    red = Object.assign(LLM.filtrar(x.redaccion, LLM.piezaDe(base)), { modelo: 'sesión de Claude Code', motor: 'sesion' });
  } else {
    if (!deps && !LLM.disponible()) throw new Error('La IA está apagada. ' + LLM.motivoApagada());
    if ((antes.redacciones || {})[tono] && !x.rehacer) return { bandeja: leerBandejas()[clave], item: antes };
    red = await LLM.redactar(base, tono, deps);
  }
  const nombres = GC.nombresDelLibro((await indiceDe(p, false)).idx);
  const nombra = (v) => { try { GC.verificarAnonimo(v, nombres); return false; } catch (e) { return true; } };
  if (!nombra({ t: base.titulo, d: base.dato, g: base.guion, x: base.datos }) && nombra({ t: red.titulo, g: red.ganchos, l: red.guion, p: red.placas, c: red.copy })) {
    throw new Error('La redacción nombró a alguien del libro en una pieza anónima: se descartó entera.');
  }
  const actual = leerBandejas()[clave];
  const nueva = guardarBandeja(clave, M.guardarRedaccion(actual, x.uid, tono, { titulo: red.titulo, ganchos: red.ganchos, guion: red.guion, placas: red.placas, copy: red.copy, descartado: red.descartado, modelo: red.modelo }));
  return { bandeja: nueva, item: nueva.items.find((i) => i.uid === x.uid), descartado: red.descartado, uso: red.uso };
}

/**
 * Una tabla del Explorador → propuesta ANÓNIMA y verificada. El mismo
 * camino que el Nivel 2: anónima SIEMPRE, y verificada contra los nombres
 * de todos los libros que se leyeron. Lanza si el ángulo nombra a alguien.
 */
async function propuestaAnonima(p, nivel, res, angulo, sello) {
  const cruda = E.aPropuesta(res, angulo, sello);
  if (!cruda.ok) throw new Error(cruda.avisos[0]);
  const anon = GC.anonimizar(cruda);
  const nombres = { jugadores: [], equipos: [] };
  const zs = nivel === 'zonas' ? (await zonasDe(p, false)).filter((z) => z.idx) : [{ idx: (await indiceDe(p, false)).idx }];
  zs.forEach((z) => { const n = GC.nombresDelLibro(z.idx); nombres.jugadores = nombres.jugadores.concat(n.jugadores); nombres.equipos = nombres.equipos.concat(n.equipos); });
  GC.verificarAnonimo(anon, nombres);
  delete anon.anonimo;
  anon.ganchos = M.ganchos(anon.titulo, anon.dato, anon.guion);
  return anon;
}
function aLaBandeja(p, anon, sello) {
  const clave = claveBandeja(p);
  return guardarBandeja(clave, Object.assign({ clave, generada: new Date().toISOString(), meta: { torneo: p.liga.torneo, zona: p.zona.label, liga: p.ligaId, zonaId: p.zonaId } }, M.sumarABandeja(leerBandejas()[clave], anon, sello)));
}

/** Un hallazgo del Explorador → propuesta ANÓNIMA y verificada → bandeja. */
async function delLaboratorio(b) {
  const x = b || {};
  const p = GC.resolverPedido({ liga: x.liga, zona: x.zona });
  const res = await explorar(x);
  const sello = Date.now().toString(36);
  const anon = await propuestaAnonima(p, x.nivel, res, x.angulo, sello);
  return { bandeja: aLaBandeja(p, anon, sello), id: anon.id };
}

/**
 * «A MEDIDA», TEXTO LIBRE. El intérprete LOCAL lee lo que se escribió
 * contra el catálogo del libro de esa zona —sin modelo—, el Explorador
 * corre el pedido y sale una propuesta anónima. La respuesta trae qué se
 * entendió, qué se aproximó y qué no existe: nada se aproxima en silencio.
 * Con `aBandeja`, la propuesta queda arriba de la bandeja (que es donde
 * se redacta con IA).
 */
async function libre(b) {
  const x = b || {};
  const p = GC.resolverPedido({ liga: x.liga, zona: x.zona });
  const { idx } = await indiceDe(p, !!x.refrescar);
  const multi = Object.keys(p.liga.zonas).length > 1;
  const lec = LIBRE.interpretarLibre(x.texto, E.catalogo(idx), { nivel: E.NIVELES[x.nivel] ? x.nivel : null, zonas: multi });
  if (!lec.ok) return { ok: false, lectura: lec };
  const consulta = Object.assign({}, lec.consulta, { liga: x.liga, zona: x.zona });
  /* El grupo del cruce: el que se elige a mano le gana al que leyó el texto. */
  if (x.grupo && Object.prototype.hasOwnProperty.call(E.GRUPOS_CRUCE, x.grupo)) consulta.grupo = x.grupo;
  if (Number(x.top) > 0) consulta.top = Number(x.top);
  const resultado = await explorar(consulta);
  const sello = Date.now().toString(36);
  /* El título es lo que se escribió si entra entero; si no, su primera
     oración; y si tampoco, el que arma el generador. Nunca un texto cortado. */
  const titulo = E.tituloDe(x.angulo || x.texto, 90);
  let propuesta = null;
  const avisos = [];
  try { propuesta = await propuestaAnonima(p, consulta.nivel, resultado, titulo, sello); }
  catch (e) {
    /* El texto nombró a alguien del libro: la propuesta sale igual, con el
       título que arma el generador, y se dice por qué. */
    if (!/todavía nombra a/.test(e.message)) avisos.push(e.message);
    else {
      try { propuesta = await propuestaAnonima(p, consulta.nivel, resultado, '', sello); avisos.push('El texto nombra a alguien del libro y las propuestas del laboratorio salen anónimas: el título se armó sin él.'); }
      catch (e2) { avisos.push(e2.message); }
    }
  }
  const out = { ok: true, lectura: lec, consulta, resultado, propuesta, avisos };
  if (x.aBandeja) {
    if (!propuesta) throw new Error(avisos[0] || 'No hay una propuesta que mandar.');
    aLaBandeja(p, propuesta, sello);
    out.enBandeja = propuesta.id;
  }
  return out;
}

/**
 * APROBAR una pieza: escribe sus tres archivos, la deja en la cola de
 * Canva y la anota en el historial de aprendizaje, sin métricas.
 */
function aprobar(b) {
  const x = b || {}, p = x.propuesta;
  const pl = placas(p, x.gancho, x.contexto);
  const ahora = new Date();
  const liga = String(x.liga || 'liga').replace(/[^a-z0-9-]/gi, '');
  const base = [M.diaLocal(ahora), liga, String(p.id).replace(/[^A-Z0-9-]/gi, '')].join('_');
  fs.mkdirSync(SALIDA, { recursive: true });
  const escribir = (ext, v) => { const f = path.join(SALIDA, base + ext); fs.writeFileSync(f, v); return path.relative(RAIZ, f).replace(/\\/g, '/'); };
  const contexto = String(x.contexto || '').trim().slice(0, 600);
  const g = x.gancho && typeof x.gancho === 'object' ? x.gancho : { texto: x.gancho || null, estilo: null };
  const archivos = [
    escribir('.json', JSON.stringify({ meta: x.meta || null, gancho: g.texto, contexto: contexto || null, placas: M.placasDe(p, g.texto), copy: p.copy || M.copyPlantilla(p, g.texto), promptCopy: M.promptDeCopy(p, g.texto), propuesta: p }, null, 2)),
    escribir('.md', M.resumenMd(p, g.texto, contexto)),
    escribir('.html', pl.html),
  ];
  const reg = M.registroDeAprobacion(p, g, liga, ahora);
  /* Volver a aprobar la misma pieza el mismo día PISA sus archivos, así
     que también reemplaza su lugar en la cola y en el historial. */
  const mismo = (r) => r.pieza === reg.pieza && r.liga === reg.liga && r.fecha === reg.fecha;
  const registros = leerAprendizaje();
  const previo = registros.find((r) => mismo(r) && r.estado === 'aprobada');
  if (previo) Object.assign(previo, reg, { id: previo.id }); else registros.push(reg);
  escribirLista(APRENDIZAJE, 'registros', registros);
  const cola = leerLista(COLA, 'pendientes').filter((c) => !(c.pieza === reg.pieza && c.liga === liga && c.fecha === reg.fecha && c.estado === 'pendiente'));
  cola.push({ id: (previo || reg).id, estado: 'pendiente', fecha: reg.fecha, pieza: reg.pieza, liga, titulo: p.id + ' · ' + p.titulo, html: archivos[2], plantilla: pl.plantilla, conNombres: p.id === 'STORIES' || !!(x.meta && x.meta.anonimo === false) });
  escribirLista(COLA, 'pendientes', cola);
  return { archivos, plantilla: pl.plantilla, registro: previo || reg, enCola: cola.filter((c) => c.estado === 'pendiente').length };
}

function registrar(b) {
  const x = b || {};
  let registros = leerAprendizaje();
  if (x.id) {
    const r = M.medir(registros, String(x.id), x);
    if (!r.ok) throw new Error(r.error);
    registros = r.registros;
  } else {
    const v = M.normalizarRegistro(x);
    if (!v.ok) throw new Error(v.error);
    registros.push(Object.assign({ id: Date.now().toString(36) + '-m', estado: 'medida', cargado: new Date().toISOString() }, v.registro));
  }
  escribirLista(APRENDIZAJE, 'registros', registros);
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
  a.get('/api/opciones', ruta(() => Object.assign(M.opciones(GC.LIGAS), { explorador: E.opciones(),
    ia: { activa: LLM.disponible(), motor: LLM.motor(), modelo: LLM.motor() === 'api' ? LLM.MODELO : null, motivo: LLM.motivoApagada() } })));
  a.get('/api/cola', ruta(() => ({ pendientes: leerLista(COLA, 'pendientes') })));
  a.post('/api/preguntar', ruta((req) => preguntar(req.body)));
  a.post('/api/bandeja/redactar', ruta((req) => redactarItem(req.body)));
  a.post('/api/explorar', ruta((req) => explorar(req.body)));
  a.post('/api/anomalias', ruta((req) => anomalias(req.body)));
  a.post('/api/bandeja', ruta((req) => bandeja(req.body)));
  a.post('/api/bandeja/accion', ruta((req) => accionDeBandeja(req.body)));
  a.post('/api/laboratorio', ruta((req) => delLaboratorio(req.body)));
  a.post('/api/libre', ruta((req) => libre(req.body)));
  a.post('/api/generar', ruta((req) => generar(req.body)));
  a.post('/api/placas', ruta((req) => placas(req.body.propuesta, req.body.gancho, req.body.contexto)));
  /* El copy y el prompt alternativo de una propuesta, con el gancho elegido. Sin modelo: los arma el motor. */
  a.post('/api/copy', ruta((req) => { const p = req.body.propuesta || {}, g = req.body.gancho && req.body.gancho.texto; return { copy: p.copy || M.copyPlantilla(p, g), deIa: !!p.copy, prompt: M.promptDeCopy(p, g), placas: M.placasDe(p, g) }; }));
  a.post('/api/aprobar', ruta((req) => aprobar(req.body)));
  const aprendizaje = () => { const r = leerAprendizaje(); return { registros: r, ponderaciones: M.ponderaciones(r), cola: leerLista(COLA, 'pendientes').filter((c) => c.estado === 'pendiente') }; };
  a.get('/api/aprendizaje', ruta(aprendizaje));
  a.post('/api/aprendizaje', ruta((req) => { registrar(req.body); return aprendizaje(); }));
  return a;
}

if (require.main === module) {
  app().listen(PUERTO, '127.0.0.1', () => console.log('Centro de Mando Editorial · http://127.0.0.1:' + PUERTO));
}

module.exports = { app, generar, placas, aprobar, registrar, explorar, anomalias, bandeja, accionDeBandeja, delLaboratorio, libre, preguntar, redactarItem, indices, PUERTO };
