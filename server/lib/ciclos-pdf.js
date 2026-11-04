/* =====================================================================
   EL PDF DEL INFORME DE CICLO · Chromium sin ventana (Ciclos, fase 6)

   Dos caminos, mismo código:
   - En Vercel, `@sparticuz/chromium` (un Chromium recortado para funciones
     serverless) manejado con `puppeteer-core`.
   - En la máquina del analista (`node server/bin/ciclos.js publicar`), el
     Chrome instalado: es la Opción B, por si la función serverless no puede
     levantar el navegador.

   Las dos dependencias se cargan recién al pedir un PDF: el resto del servidor
   (y los tests) no las necesita, y un `import` que falla no tumba la API.
   `deps.render` reemplaza todo esto en los tests.
   ===================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const CANDIDATOS_CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

const enServerless = () => !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

async function lanzar() {
  let puppeteer;
  try { puppeteer = (await import('puppeteer-core')).default; }
  catch (e) { throw Object.assign(new Error('Falta puppeteer-core en el servidor.'), { codigo: 'PDF_SIN_PUPPETEER' }); }
  if (enServerless()) {
    let chromium;
    try { chromium = (await import('@sparticuz/chromium')).default; }
    catch (e) { throw Object.assign(new Error('Falta @sparticuz/chromium en el servidor.'), { codigo: 'PDF_SIN_CHROMIUM' }); }
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: 'shell' });
  }
  const ruta = CANDIDATOS_CHROME.find(p => fs.existsSync(p));
  if (!ruta) throw Object.assign(new Error('No encontré Chrome en esta máquina. Poné su ruta en CHROME_PATH.'), { codigo: 'PDF_SIN_CHROME' });
  return puppeteer.launch({ executablePath: ruta, headless: true, args: ['--no-sandbox'] });
}

/** El HTML → un Buffer PDF (A4, con los fondos). Lanza con `codigo` si no se puede. */
async function aPdf(html) {
  let nav = null;
  try {
    nav = await lanzar();
    const pag = await nav.newPage();
    await pag.setContent(html, { waitUntil: 'load', timeout: 30000 });
    const buf = await pag.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    const pdf = Buffer.from(buf);
    if (pdf.length < 1000 || pdf.slice(0, 4).toString() !== '%PDF') throw new Error('El PDF salió vacío.');
    return pdf;
  } catch (e) {
    if (e && e.codigo) throw e;
    throw Object.assign(new Error('No se pudo compilar el PDF: ' + ((e && e.message) || e)), { codigo: 'PDF_FALLO' });
  } finally {
    if (nav) { try { await nav.close(); } catch (e) { /* ya cerrado */ } }
  }
}

module.exports = { aPdf, lanzar, enServerless };
