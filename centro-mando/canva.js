#!/usr/bin/env node
'use strict';
/* =====================================================================
   LAS PIEZAS APROBADAS A CANVA · sin Claude, por la API oficial

     node centro-mando/canva.js autorizar          UNA vez: abre el navegador y guarda el permiso
     node centro-mando/canva.js estado             ¿hay app? ¿hay permiso? ¿qué espera en la cola?
     node centro-mando/canva.js importar           la cola entera, de punta a punta
     node centro-mando/canva.js importar --ensayo  dice qué haría y no toca nada

   EL CIRCUITO (el mismo de /agencia canva, sin el conector de Claude):

     cola-canva.json (pendiente)
       → PDF en memoria desde el HTML aprobado (pdf.js)
       → placas-tmp/<pieza>.html y .pdf · commit SOLO de esa carpeta · push a main
       → GitHub Pages los sirve en una URL pública            (estado «publicada»)
       → Canva los importa por URL: POST /rest/v1/url-imports  (estado «importada»)
       → placas-tmp/ se vacía · commit · push

   POR QUÉ PDF Y NO EL HTML: la importación por URL de Canva acepta PDF,
   PPTX, DOCX y formatos de Adobe/Office, y NO HTML (documentación «Design
   imports», 2026-10-16). Lo único que convertía HTML en un diseño era el
   conector de Canva de Claude. El HTML igual se publica al lado.

   LO QUE HACE FALTA, UNA VEZ (ver OPERACION_ECOSISTEMA.md, punto 0 bis):
     1. una integración en https://www.canva.com/developers (Connect API),
        con el scope design:content:write y la URL de redirección
        http://127.0.0.1:8772/oauth/redirect (Canva no acepta «localhost»);
     2. CANVA_CLIENT_ID y CANVA_CLIENT_SECRET en centro-mando/.env;
     3. `node centro-mando/canva.js autorizar`.
   El permiso queda en centro-mando/.canva-token.json (en .gitignore).
   Canva ROTA el refresh token en cada uso: se guarda el nuevo ANTES de
   usar el acceso, o una caída en el medio deja la app sin permiso.

   LO QUE NO SE HACE SOLO, a propósito:
     · aprobar una pieza: es la decisión editorial (Centro de Mando);
     · publicar en Instagram: Canva deja el diseño listo para editar.

   Reintentos: cada corrida retoma donde quedó la anterior. Una pieza que
   Pages todavía no sirve queda «publicada» y se importa en la siguiente;
   un fallo transitorio de Canva se reintenta hasta 3 veces.
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { execFileSync, spawn } = require('child_process');

const REPO = path.join(__dirname, '..');
require(path.join(REPO, 'server', 'lib', 'env.js')).cargar(path.join(__dirname, '.env'));

const DATOS = process.env.CENTRO_MANDO_DATOS || path.join(REPO, 'contenido');
const COLA = path.join(DATOS, 'centro-mando', 'cola-canva.json');
const CARPETA_PUBLICA = 'placas-tmp';
const API = 'https://api.canva.com/rest/v1';
const AUTORIZAR = 'https://www.canva.com/api/oauth/authorize';
const SCOPE = 'design:content:write';
const MAX_INTENTOS = 3;
/* Errores de Canva que vale reintentar en la corrida siguiente. */
const TRANSITORIOS = ['fetch_failed', 'design_import_throttled', 'design_creation_throttled', 'internal_error', 'too_many_requests'];

function config() {
  return {
    clientId: process.env.CANVA_CLIENT_ID || '',
    clientSecret: process.env.CANVA_CLIENT_SECRET || '',
    redirect: process.env.CANVA_REDIRECT_URI || 'http://127.0.0.1:8772/oauth/redirect',
    tokenArchivo: process.env.CANVA_TOKEN_ARCHIVO || path.join(__dirname, '.canva-token.json'),
    pages: (process.env.PAGES_BASE || 'https://coachgn.github.io/estadisticas/').replace(/\/?$/, '/'),
    esperaPagesMs: Number(process.env.CANVA_ESPERA_PAGES_MS || 20 * 60 * 1000),
  };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// ---------------------------------------------------------------------
// El permiso · OAuth 2 con PKCE, una vez desde el navegador
// ---------------------------------------------------------------------
function leerToken(cfg) {
  try { return JSON.parse(fs.readFileSync(cfg.tokenArchivo, 'utf8')); } catch (_) { return null; }
}
function guardarToken(cfg, t) {
  fs.writeFileSync(cfg.tokenArchivo, JSON.stringify(t, null, 2), { mode: 0o600 });
}

async function pedirToken(cfg, cuerpo, d) {
  const traer = (d && d.fetch) || fetch;
  const r = await traer(API + '/oauth/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(cfg.clientId + ':' + cfg.clientSecret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(cuerpo).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw Object.assign(new Error('Canva no dio el permiso: ' + (j.message || j.code || ('HTTP ' + r.status))), { codigo: j.code || 'TOKEN' });
  return j;
}

/** El acceso vigente. Si venció, lo renueva y guarda el refresh NUEVO antes de devolverlo. */
async function acceso(cfg, d) {
  const ahora = (d && d.ahora ? d.ahora() : Date.now());
  const t = leerToken(cfg);
  if (!t || !t.refresh_token) throw Object.assign(new Error('Canva no está autorizado: corré `node centro-mando/canva.js autorizar`.'), { codigo: 'SIN_PERMISO' });
  if (t.access_token && t.expira && t.expira - 60 * 1000 > ahora) return t.access_token;
  if (!cfg.clientId || !cfg.clientSecret) throw Object.assign(new Error('Faltan CANVA_CLIENT_ID y CANVA_CLIENT_SECRET en centro-mando/.env.'), { codigo: 'SIN_APP' });
  const j = await pedirToken(cfg, { grant_type: 'refresh_token', refresh_token: t.refresh_token }, d);
  guardarToken(cfg, { refresh_token: j.refresh_token || t.refresh_token, access_token: j.access_token,
    expira: ahora + (Number(j.expires_in) || 14400) * 1000, scope: j.scope || t.scope, renovado: new Date(ahora).toISOString() });
  return j.access_token;
}

async function autorizar() {
  const cfg = config();
  if (!cfg.clientId || !cfg.clientSecret) {
    console.error('  Faltan CANVA_CLIENT_ID y CANVA_CLIENT_SECRET en centro-mando/.env (ver OPERACION_ECOSISTEMA.md, 0 bis).');
    process.exit(1);
  }
  const verificador = b64url(crypto.randomBytes(48));
  const desafio = b64url(crypto.createHash('sha256').update(verificador).digest());
  const estadoCsrf = b64url(crypto.randomBytes(24));
  const u = new URL(cfg.redirect);
  const url = AUTORIZAR + '?' + new URLSearchParams({ code_challenge: desafio, code_challenge_method: 'S256',
    scope: SCOPE, response_type: 'code', client_id: cfg.clientId, state: estadoCsrf, redirect_uri: cfg.redirect });
  const codigo = await new Promise((ok, mal) => {
    const srv = http.createServer((req, res) => {
      const q = new URL(req.url, cfg.redirect);
      if (q.pathname !== u.pathname) { res.writeHead(404); res.end(); return; }
      const listo = (msj, err) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<p style="font-family:sans-serif">' + msj + '</p>'); srv.close(); err ? mal(err) : ok(q.searchParams.get('code')); };
      if (q.searchParams.get('state') !== estadoCsrf) return listo('El estado no coincide: se cortó por seguridad.', new Error('state distinto'));
      if (!q.searchParams.get('code')) return listo('Canva no dio el permiso.', new Error(q.searchParams.get('error') || 'sin código'));
      listo('Listo: MotorStats quedó autorizado en Canva. Podés cerrar esta pestaña.');
    });
    srv.listen(Number(u.port || 80), u.hostname);
    console.log('\n  Abrí este link y aceptá el permiso (se abre solo si se puede):\n\n  ' + url + '\n');
    try { spawn(process.platform === 'win32' ? 'cmd' : 'open', process.platform === 'win32' ? ['/c', 'start', '', url] : [url], { stdio: 'ignore', detached: true }); } catch (_) { /* se abre a mano */ }
    setTimeout(() => { srv.close(); mal(new Error('Pasaron 5 minutos sin respuesta.')); }, 5 * 60 * 1000).unref();
  });
  const j = await pedirToken(cfg, { grant_type: 'authorization_code', code: codigo, code_verifier: verificador, redirect_uri: cfg.redirect });
  guardarToken(cfg, { refresh_token: j.refresh_token, access_token: j.access_token,
    expira: Date.now() + (Number(j.expires_in) || 14400) * 1000, scope: j.scope, autorizado: new Date().toISOString() });
  console.log('  Autorizado. El permiso quedó en ' + path.relative(REPO, cfg.tokenArchivo) + ' (no se sube al repo).');
}

// ---------------------------------------------------------------------
// La importación · un PDF publicado → un diseño de Canva
// ---------------------------------------------------------------------
async function importarUrl(cfg, url, titulo, d) {
  const traer = (d && d.fetch) || fetch;
  const pausa = (d && d.esperar) || esperar;
  const token = await acceso(cfg, d);
  const h = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  const r = await traer(API + '/url-imports', { method: 'POST', headers: h,
    body: JSON.stringify({ title: String(titulo).slice(0, 255), url, mime_type: 'application/pdf' }) });
  let j = await r.json().catch(() => ({}));
  if (!r.ok || !j.job) return { ok: false, codigo: j.code || ('HTTP_' + r.status), motivo: j.message || 'Canva rechazó el pedido.' };
  for (let i = 0; i < 60 && j.job.status === 'in_progress'; i++) {
    await pausa(3000);
    const g = await traer(API + '/url-imports/' + encodeURIComponent(j.job.id), { headers: h });
    j = await g.json().catch(() => ({ job: { status: 'failed', error: { code: 'HTTP_' + g.status } } }));
  }
  if (j.job.status !== 'success') {
    const e = j.job.error || {};
    return { ok: false, codigo: e.code || (j.job.status === 'in_progress' ? 'SIN_TERMINAR' : 'failed'), motivo: e.message || 'La importación no terminó.' };
  }
  const dz = (j.job.result && j.job.result.designs || [])[0] || {};
  return { ok: true, id: dz.id, edit: dz.urls && dz.urls.edit_url, view: dz.urls && dz.urls.view_url, paginas: dz.page_count };
}

// ---------------------------------------------------------------------
// El circuito entero
// ---------------------------------------------------------------------
function gitReal(args) { return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }

/* Commit SOLO de placas-tmp/ y push. Nunca arrastra otros cambios de la
   copia de trabajo, y no publica si la rama local quedó atrás del remoto
   (un rebase sin nadie mirando puede pisar trabajo). */
function publicarCarpeta(git, mensaje) {
  if (git(['rev-parse', '--abbrev-ref', 'HEAD']) !== 'main') throw new Error('La copia no está en main: no se publica.');
  git(['fetch', 'origin', 'main']);
  if (Number(git(['rev-list', '--count', 'HEAD..origin/main'])) > 0) throw new Error('main local está atrás de origin: hacé git pull antes.');
  git(['add', '-A', '--', CARPETA_PUBLICA]);
  if (!git(['diff', '--cached', '--name-only', '--', CARPETA_PUBLICA])) return false;
  git(['commit', '-m', mensaje, '--', CARPETA_PUBLICA]);
  git(['push', 'origin', 'main']);
  return true;
}

function leerCola() { try { return JSON.parse(fs.readFileSync(COLA, 'utf8')); } catch (_) { return { pendientes: [] }; } }
function guardarCola(c) { fs.writeFileSync(COLA, JSON.stringify(c, null, 2)); }
const baseDe = (html) => path.basename(String(html)).replace(/\.html$/i, '');

async function importar(o, d) {
  const dd = d || {};
  const cfg = Object.assign(config(), dd.config || {});
  const git = dd.git || gitReal;
  const raiz = dd.raiz || REPO;   // los tests publican en una carpeta temporal
  const traer = dd.fetch || fetch;
  const log = dd.log || ((t) => console.log('  ' + t));
  const cola = dd.cola || leerCola();
  const guardar = dd.guardarCola || guardarCola;
  const items = cola.pendientes || [];
  const pend = items.filter((x) => x.estado === 'pendiente' && x.html);
  const publ = () => items.filter((x) => x.estado === 'publicada');
  const res = { publicadas: 0, importadas: 0, errores: 0, esperando: 0 };

  if (!pend.length && !publ().length) { log('Nada en la cola para Canva.'); return res; }
  if (o.ensayo) {
    pend.forEach((x) => log('publicaría  ' + x.pieza + ' · ' + x.html));
    publ().forEach((x) => log('importaría  ' + x.pieza + ' · ' + x.publicado.url));
    return res;
  }
  /* El permiso se mira ANTES de publicar: sin él, publicar dejaría placas
     a la vista sin nadie que las importe. */
  await acceso(cfg, dd);

  // 1 · publicar lo pendiente
  if (pend.length) {
    const carpeta = path.join(raiz, CARPETA_PUBLICA);
    fs.mkdirSync(carpeta, { recursive: true });
    const hacerPdf = dd.pdfDe || (async (archivo) => {
      const P = require('./pdf.js');
      const c = await P.abrirChrome();
      try { return await P.pdfDe(c, archivo); } finally { c.cerrar(); }
    });
    const listos = [];
    for (const x of pend) {
      const html = path.isAbsolute(x.html) ? x.html : path.join(REPO, x.html);
      if (!fs.existsSync(html)) { x.estado = 'error'; x.error = 'No está el HTML aprobado (' + x.html + ').'; res.errores++; log('✖ ' + x.pieza + ' · ' + x.error); continue; }
      const r = await hacerPdf(html);
      const base = baseDe(x.html);
      fs.writeFileSync(path.join(carpeta, base + '.pdf'), r.pdf);
      fs.copyFileSync(html, path.join(carpeta, base + '.html'));
      listos.push({ x, base });
      if (r.fuentesListas === false) log('⚠ ' + x.pieza + ' · las tipografías no cargaron a tiempo (¿sin red?)');
    }
    if (listos.length) {
      publicarCarpeta(git, 'chore: placas temporales para importar a Canva');
      for (const { x, base } of listos) {
        x.estado = 'publicada';
        x.publicado = { pdf: CARPETA_PUBLICA + '/' + base + '.pdf', url: cfg.pages + CARPETA_PUBLICA + '/' + base + '.pdf', fecha: new Date().toISOString() };
        res.publicadas++;
        log('↑ ' + x.pieza + ' · publicada en ' + x.publicado.url);
      }
    }
    guardar(cola);
  }

  // 2 · esperar a Pages e importar
  const limite = Date.now() + cfg.esperaPagesMs;
  const pausa = dd.esperar || esperar;
  for (const x of publ()) {
    let visible = false;
    while (!visible) {
      try { visible = (await traer(x.publicado.url + '?cb=' + Date.now(), { method: 'HEAD', cache: 'no-store' })).status === 200; } catch (_) { /* reintenta */ }
      if (visible || Date.now() > limite) break;
      await pausa(10000);
    }
    if (!visible) { res.esperando++; log('… ' + x.pieza + ' · Pages todavía no la sirve: se importa en la próxima corrida.'); continue; }
    const r = await importarUrl(cfg, x.publicado.url, x.titulo || x.pieza, dd);
    if (r.ok) {
      Object.assign(x, { estado: 'importada', importada: new Date().toISOString(), canva: r.edit, canvaId: r.id, via: 'api' });
      res.importadas++;
      log('✓ ' + x.pieza + ' · en Canva: ' + r.edit);
    } else {
      x.intentos = (x.intentos || 0) + 1;
      x.error = r.codigo + ' · ' + r.motivo;
      if (TRANSITORIOS.indexOf(r.codigo) === -1 || x.intentos >= MAX_INTENTOS) { x.estado = 'error'; res.errores++; }
      else res.esperando++;
      log('✖ ' + x.pieza + ' · ' + x.error + (x.estado === 'error' ? '' : ' (se reintenta)'));
    }
    guardar(cola);
  }

  // 3 · limpiar lo que ya no tiene que estar publicado
  const sacar = items.filter((x) => x.publicado && (x.estado === 'importada' || x.estado === 'error') && !x.publicado.retirado);
  if (sacar.length) {
    for (const x of sacar) {
      const base = baseDe(x.html);
      for (const ext of ['.pdf', '.html']) {
        const f = path.join(raiz, CARPETA_PUBLICA, base + ext);
        try { fs.unlinkSync(f); } catch (_) { /* ya no estaba */ }
      }
      x.publicado.retirado = new Date().toISOString();
    }
    publicarCarpeta(git, 'chore: quitar las placas temporales, ya importadas a Canva');
    guardar(cola);
  }
  return res;
}

async function estado() {
  const cfg = config();
  const t = leerToken(cfg);
  const c = leerCola().pendientes || [];
  const cuenta = (e) => c.filter((x) => x.estado === e).length;
  console.log('\n  app de Canva    ' + (cfg.clientId && cfg.clientSecret ? 'configurada' : 'FALTA (CANVA_CLIENT_ID / CANVA_CLIENT_SECRET en centro-mando/.env)'));
  console.log('  permiso         ' + (t && t.refresh_token ? 'autorizado' + (t.autorizado ? ' el ' + t.autorizado.slice(0, 10) : '') : 'FALTA (node centro-mando/canva.js autorizar)'));
  console.log('  cola            ' + cuenta('pendiente') + ' pendientes · ' + cuenta('publicada') + ' publicadas · ' + cuenta('importada') + ' importadas · ' + cuenta('error') + ' con error\n');
}

module.exports = { importar, importarUrl, acceso, publicarCarpeta, config, TRANSITORIOS };

if (require.main === module) {
  const cmd = process.argv[2];
  const o = { ensayo: process.argv.includes('--ensayo') };
  const correr = cmd === 'autorizar' ? autorizar() : cmd === 'estado' ? estado()
    : cmd === 'importar' ? importar(o).then((r) => { console.log('\n  ' + r.publicadas + ' publicadas · ' + r.importadas + ' importadas · ' + r.esperando + ' esperando · ' + r.errores + ' con error\n'); if (r.errores) process.exitCode = 1; })
    : Promise.reject(new Error('uso: node centro-mando/canva.js autorizar | estado | importar [--ensayo]'));
  correr.catch((e) => { console.error('  ' + e.message); process.exit(1); });
}
