'use strict';
/* =====================================================================
   EL PDF DE UNA PIEZA, EN MEMORIA · lo que Canva sabe importar

   La API pública de Canva NO importa HTML: su importación por URL acepta
   PDF, PPTX, DOCX y los formatos de Adobe/Office (documentación de
   «Design imports», verificado el 2026-10-16). Por eso el HTML aprobado
   se pasa a PDF, una placa por hoja y del tamaño de la placa, y Canva lo
   abre como un diseño editable.

   NO escribe nada en disco: devuelve el PDF como un Buffer. Quien lo
   necesite publicado (canva.js) lo pone en placas-tmp/ el tiempo justo
   para que Pages lo sirva, y lo borra.

   Usa el Chrome de la máquina por su protocolo de depuración (CDP). No
   suma dependencias: Node 22+ trae `fetch` y `WebSocket`.

   Cada placa es un `<section data-document-role="page">` del HTML, el
   mismo contrato que usaba la importación por el conector.
   ===================================================================== */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const PUERTO = Number(process.env.PDF_PUERTO || 9333);

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

/* Un cliente CDP mínimo, sobre el WebSocket nativo. El perfil va a una
   carpeta temporal del sistema y se borra al cerrar. */
async function abrirChrome() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'motorstats-pdf-'));
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

/** El PDF de UN html, como Buffer. Devuelve { pdf, placas, fuentesListas }. */
async function pdfDe(c, archivo) {
  c.eventos.length = 0;
  await c.enviar('Page.navigate', { url: pathToFileURL(path.resolve(archivo)).href });
  for (let i = 0; i < 100 && !c.eventos.some((e) => e.method === 'Page.loadEventFired'); i++) await esperar(100);
  /* Las tipografías vienen de Google Fonts: se espera a que el documento
     las tenga, con techo. Sin red, Chrome usa la de respaldo. */
  const fuentes = await evaluar(c, `Promise.race([document.fonts.ready.then(() => document.fonts.size),
    new Promise(r => setTimeout(() => r(-1), 8000))])`);
  const cajas = await evaluar(c, `[...document.querySelectorAll('section[data-document-role="page"]')]
    .map(s => { const r = s.getBoundingClientRect(); return { w: r.width, h: r.height }; })`);
  if (!cajas.length) throw new Error('El HTML no tiene ninguna placa (section[data-document-role="page"]).');
  const ancho = Math.max(...cajas.map((b) => b.w));
  const alto = cajas[0].h;
  /* Una placa por hoja, la hoja del tamaño de la placa. */
  await evaluar(c, `(() => { const s = document.createElement('style');
    s.textContent = '@page{size:${Math.round(ancho)}px ${Math.round(alto)}px;margin:0}'
      + 'html,body{margin:0!important;padding:0!important}'
      + 'section[data-document-role="page"]{break-after:page;page-break-after:always;margin:0!important}'
      + 'section[data-document-role="page"]:last-of-type{break-after:auto;page-break-after:auto}';
    document.head.appendChild(s); return true; })()`);
  const r = await c.enviar('Page.printToPDF', { printBackground: true, preferCSSPageSize: true,
    paperWidth: ancho / 96, paperHeight: alto / 96, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
  return { pdf: Buffer.from(r.data, 'base64'), placas: cajas.length, fuentesListas: fuentes !== -1 };
}

module.exports = { abrirChrome, pdfDe };
