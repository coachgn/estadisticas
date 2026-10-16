#!/usr/bin/env node
/* =====================================================================
   RENDER LOCAL DE LAS PLACAS · HTML → PNG por placa + un PDF
     node centro-mando/renderizar.js --pendientes        las piezas de la cola sin render
     node centro-mando/renderizar.js --archivo <x.html>  una sola
     node centro-mando/renderizar.js --pendientes --forzar   vuelve a renderizar todo

   Reemplaza al paso de Canva cuando no hace falta editar a mano: las placas
   que arma el Centro de Mando ya traen la línea gráfica de la cuenta. Usa el
   Chrome instalado en la máquina, sin ventana, por su protocolo de
   depuración (CDP). No suma dependencias: Node 18+ trae `fetch` y Node 22+
   trae `WebSocket`.

   Cada placa es un `<section data-document-role="page">` del HTML (el mismo
   contrato que usaba la importación a Canva). Salida, al lado del HTML:
     <base>/01.png … NN.png     una imagen por placa, al tamaño de la placa
     <base>.pdf                 todas, una por hoja, del mismo tamaño

   Las tipografías vienen de Google Fonts: sin red, Chrome usa la de
   respaldo y la placa sale con otra letra. El render lo avisa.

   La cola (cola-canva.json) NO cambia de estado: suma `render` con las
   rutas. Si después se importa a Canva, ese circuito sigue igual.
   ===================================================================== */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const RAIZ = path.join(__dirname, '..');
const DATOS = process.env.CENTRO_MANDO_DATOS || path.join(RAIZ, 'contenido');
const COLA = path.join(DATOS, 'centro-mando', 'cola-canva.json');
const PUERTO = Number(process.env.RENDER_PUERTO || 9333);

const CANDIDATOS_CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

function chrome() {
  const c = CANDIDATOS_CHROME.find((p) => fs.existsSync(p));
  if (!c) throw new Error('No encontré Chrome. Poné su ruta en CHROME_PATH.');
  return c;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- un cliente CDP mínimo, sobre el WebSocket nativo ---- */
async function abrirChrome() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'motorstats-render-'));
  const proc = spawn(chrome(), ['--headless=new', '--remote-debugging-port=' + PUERTO,
    '--user-data-dir=' + perfil, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let destino = null;
  for (let i = 0; i < 50 && !destino; i++) {
    await esperar(200);
    try {
      const l = await (await fetch('http://127.0.0.1:' + PUERTO + '/json/list')).json();
      destino = l.find((t) => t.type === 'page');
    } catch (_) { /* todavía arrancando */ }
  }
  if (!destino) { proc.kill(); throw new Error('Chrome no abrió su puerto de depuración (' + PUERTO + ').'); }
  const ws = new WebSocket(destino.webSocketDebuggerUrl);
  await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = () => mal(new Error('No pude conectar con Chrome.')); });
  let n = 0;
  const pend = new Map();
  const eventos = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) {
      const { ok, mal } = pend.get(d.id); pend.delete(d.id);
      if (d.error) mal(new Error(d.error.message)); else ok(d.result);
    } else if (d.method) eventos.push(d);
  };
  const enviar = (method, params) => new Promise((ok, mal) => {
    const id = ++n; pend.set(id, { ok, mal });
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
  const cerrar = () => {
    try { ws.close(); } catch (_) { /* ya estaba cerrado */ }
    proc.kill();
    try { fs.rmSync(perfil, { recursive: true, force: true }); } catch (_) { /* Chrome tarda en soltarlo */ }
  };
  await enviar('Page.enable');
  await enviar('Runtime.enable');
  return { enviar, eventos, cerrar };
}

async function evaluar(c, expr) {
  const r = await c.enviar('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.text || 'error'));
  return r.result.value;
}

/** Renderiza UN html. Devuelve { png: [rutas], pdf, placas, fuentes }. */
async function renderizar(c, archivo) {
  const abs = path.resolve(archivo);
  const base = abs.replace(/\.html$/i, '');
  c.eventos.length = 0;
  await c.enviar('Page.navigate', { url: pathToFileURL(abs).href });
  for (let i = 0; i < 100 && !c.eventos.some((e) => e.method === 'Page.loadEventFired'); i++) await esperar(100);
  /* Las tipografías: se espera a que el documento las tenga, con techo. */
  const fuentes = await evaluar(c, `Promise.race([document.fonts.ready.then(() => document.fonts.size),
    new Promise(r => setTimeout(() => r(-1), 8000))])`);
  const cajas = await evaluar(c, `[...document.querySelectorAll('section[data-document-role="page"]')].map(s => {
    const r = s.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, etiqueta: s.dataset.label || '' };
  })`);
  if (!cajas.length) throw new Error('El HTML no tiene ninguna placa (section[data-document-role="page"]).');
  const ancho = Math.max(...cajas.map((b) => b.w));
  const alto = cajas.reduce((s, b) => s + b.h, 0);
  await c.enviar('Emulation.setDeviceMetricsOverride', { width: Math.ceil(ancho), height: Math.ceil(Math.max(...cajas.map((b) => b.y + b.h))), deviceScaleFactor: 1, mobile: false });
  fs.mkdirSync(base, { recursive: true });
  const png = [];
  for (let i = 0; i < cajas.length; i++) {
    const b = cajas[i];
    const r = await c.enviar('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true,
      clip: { x: b.x, y: b.y, width: b.w, height: b.h, scale: 1 } });
    const f = path.join(base, String(i + 1).padStart(2, '0') + '.png');
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    png.push(f);
  }
  /* El PDF: una placa por hoja, la hoja del tamaño de la placa. */
  const pul = (px) => px / 96;
  await evaluar(c, `(() => { const s = document.createElement('style');
    s.textContent = '@page{size:${Math.round(ancho)}px ${Math.round(cajas[0].h)}px;margin:0}'
      + 'html,body{margin:0!important;padding:0!important}'
      + 'section[data-document-role="page"]{break-after:page;page-break-after:always;margin:0!important}'
      + 'section[data-document-role="page"]:last-of-type{break-after:auto;page-break-after:auto}';
    document.head.appendChild(s); return true; })()`);
  const pdf = await c.enviar('Page.printToPDF', { printBackground: true, preferCSSPageSize: true,
    paperWidth: pul(ancho), paperHeight: pul(cajas[0].h), marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
  fs.writeFileSync(base + '.pdf', Buffer.from(pdf.data, 'base64'));
  return { png, pdf: base + '.pdf', placas: cajas.length, fuentes, alto };
}

function rel(f) { return path.relative(RAIZ, f).replace(/\\/g, '/'); }

async function main() {
  const a = process.argv.slice(2);
  const o = { pendientes: a.includes('--pendientes'), forzar: a.includes('--forzar') };
  const i = a.indexOf('--archivo');
  if (i !== -1) o.archivo = a[i + 1];
  if (!o.archivo && !o.pendientes) {
    console.error('uso: node centro-mando/renderizar.js --pendientes [--forzar] | --archivo <x.html>');
    process.exit(2);
  }
  let trabajos = [];
  let cola = null;
  if (o.archivo) trabajos = [{ html: o.archivo }];
  else if (fs.existsSync(COLA)) {
    cola = JSON.parse(fs.readFileSync(COLA, 'utf8'));
    trabajos = (cola.pendientes || []).filter((x) => x.html && (o.forzar || !x.render));
  }
  if (!trabajos.length) { console.log('  Nada para renderizar.'); return 0; }

  const c = await abrirChrome();
  let fallas = 0;
  try {
    for (const t of trabajos) {
      const f = path.isAbsolute(t.html) ? t.html : path.join(RAIZ, t.html);
      if (!fs.existsSync(f)) { console.log('  ✖ ' + t.html + ' · no está el HTML'); fallas++; continue; }
      try {
        const r = await renderizar(c, f);
        console.log('  ✓ ' + rel(f) + ' · ' + r.placas + ' placas → ' + rel(r.pdf)
          + (r.fuentes === -1 ? '   ⚠ las tipografías no cargaron a tiempo (¿sin red?)' : ''));
        if (cola) t.render = { fecha: new Date().toISOString(), pdf: rel(r.pdf), png: r.png.map(rel) };
      } catch (e) { console.log('  ✖ ' + t.html + ' · ' + e.message); fallas++; }
    }
  } finally { c.cerrar(); }
  if (cola) fs.writeFileSync(COLA, JSON.stringify(cola, null, 2));
  return fallas ? 1 : 0;
}

module.exports = { renderizar, abrirChrome };

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
}
