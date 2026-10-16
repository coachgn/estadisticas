#!/usr/bin/env node
/* =====================================================================
   AUDITOR DEL ECOSISTEMA · solo lectura
     node server/bin/ecosistema.js auditar            todo, en una tabla
     node server/bin/ecosistema.js auditar --json     lo mismo, para otro script
     node server/bin/ecosistema.js auditar --sin-scripts   sin la API de Apps Script

   Cruza las SEIS fuentes que tienen que coincidir para que un libro ande
   de punta a punta, y que hoy nadie compara entre sí:

     1 · el catálogo de KV            (qué libros sirve la web, y a quién)
     2 · el libro en Google           (si la Service Account lo puede leer)
     3 · LICENCIAS del motor          (si el menú del libro le contesta a un cliente)
     4 · el Apps Script del libro     (si su MS_TOKEN es el de ESE libro)
     5 · la ingesta automática        (qué libros escribe sola)
     6 · torneos/*.json y logos/      (fixture, zonas y escudos)

   NO ESCRIBE NADA, en ninguna de las seis. Cada desvío sale con el
   comando que lo corrige: arreglar sigue siendo un gesto explícito, que
   es lo que evita que un auditor equivocado pise datos buenos.

   Lo que necesita de la máquina:
     server/.env                     KV + Service Account (como el resto del CLI)
     ~/.clasprc.json                 la sesión de clasp (para leer los scripts)
     ECOSISTEMA_MOTOR                carpeta del motor   (C:\Users\Pc\mi-motor-stats)
     ECOSISTEMA_INGESTA              carpeta de la ingesta (../motorstats-ingestion)

   Ninguna salida imprime un id entero: el repo es público y la salida se
   pega en chats y en issues. Van los primeros y últimos 4 caracteres.

   Guía de uso: OPERACION_ECOSISTEMA.md.
   ===================================================================== */
'use strict';
require('../lib/env.js').cargar();
const fs = require('fs');
const os = require('os');
const path = require('path');
const catalogo = require('../lib/catalogo.js');
const { obtenerDatosPlanilla } = require('../lib/google-sheets.js');
const AUTH = require('../lib/compartido/sgadd-auth.js');

/* Archivos de torneos/ que NO tienen que estar en el catálogo, con el
   motivo. Sin esta lista el auditor avisaría siempre lo mismo, y un aviso
   permanente se deja de leer. */
const TORNEOS_FUERA_DEL_CATALOGO = {
  'zona-c-la-plata-2026': 'dado de baja el 2026-09-27 (era la zona apb-2026-c duplicada); queda como fixture de test-torneos.js',
};

const REPO = path.join(__dirname, '..', '..');
const MOTOR = process.env.ECOSISTEMA_MOTOR || path.join(os.homedir(), 'mi-motor-stats');
const INGESTA = process.env.ECOSISTEMA_INGESTA || path.join(REPO, '..', 'motorstats-ingestion');

/* La planilla central de licencias del motor. Es la MISMA constante que
   `LIC_SPREADSHEET_ID` de licencias/Licencias_Backend.js: si se mueve
   allá, se mueve acá (el auditor lo denuncia si no la puede leer). */
const LICENCIAS_ID = process.env.ECOSISTEMA_LICENCIAS || '1_m1NHkAhY42OF-iSl95m3YUMheAZ5cTN-UabIBbzrsA';
const DIAS_AVISO_VENCE = 7;

const corto = (id) => !id ? '—' : String(id).slice(0, 4) + '…' + String(id).slice(-4);
const hoyISO = () => {
  const d = new Date(Date.now() - 3 * 3600 * 1000);   // día de Argentina, como el cron de mails
  return d.toISOString().slice(0, 10);
};
/* dd/mm/aaaa (la hoja) o aaaa-mm-dd (el catálogo) → aaaa-mm-dd. */
function iso(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  return null;
}

// ---------------------------------------------------------------------
// Los hallazgos
// ---------------------------------------------------------------------
const hallazgos = [];
function anotar(nivel, area, sujeto, texto, arreglo) {
  hallazgos.push({ nivel, area, sujeto, texto, arreglo: arreglo || null });
}

// ---------------------------------------------------------------------
// 1 · El catálogo: un mapa sheetId → quiénes lo leen
// ---------------------------------------------------------------------
async function libroDelCatalogo() {
  const r = await catalogo.cargar({ forzar: true });
  if (r.origen !== 'kv') {
    anotar('ERROR', 'catálogo', 'KV', 'El catálogo salió del respaldo (' + r.origen + '), no de Upstash: '
      + (r.aviso || 'sin detalle') + '. Todo lo de abajo describe el respaldo.', 'node server/bin/kv-salud.js');
  }
  const libros = new Map();
  for (const [club, c] of Object.entries(r.catalogo)) {
    for (const [slug, cat] of Object.entries(c.categorias || {})) {
      if (!cat.sheetId) continue;
      if (!libros.has(cat.sheetId)) libros.set(cat.sheetId, []);
      libros.get(cat.sheetId).push({ club, slug, tipo: c.tipo || 'cliente', cat, c });
    }
  }
  return { cat: r.catalogo, libros };
}

// ---------------------------------------------------------------------
// 2 · LICENCIAS
// ---------------------------------------------------------------------
async function licencias() {
  try {
    const r = await obtenerDatosPlanilla(LICENCIAS_ID, 'LICENCIAS');
    const [cab, ...filas] = r.valores;
    const col = (n) => cab.findIndex(h => String(h).trim().toUpperCase() === n);
    const iId = col('SPREADSHEET_ID'), iEst = col('ESTADO'), iVen = col('FECHA_VENCIMIENTO'), iCli = col('CLIENTE');
    const porId = new Map();
    filas.forEach((f, i) => {
      const id = String(f[iId] || '').trim();
      if (!id) return;
      porId.set(id, { fila: i + 2, cliente: f[iCli], estado: String(f[iEst] || '').trim().toUpperCase(), vence: iso(f[iVen]) });
    });
    return porId;
  } catch (e) {
    anotar('ERROR', 'licencias', 'LICENCIAS', 'No se pudo leer la planilla central (' + (e.codigo || e.message)
      + '). Sin ella no se puede auditar el motor.', 'compartir la planilla central con la Service Account, modo Lector');
    return null;
  }
}

// ---------------------------------------------------------------------
// 3 · Los Apps Script: cuáles hay y de qué libro es cada uno
// ---------------------------------------------------------------------
/* De dónde salen los scriptIds, porque ninguna API lista "los scripts
   vinculados a mis planillas":
     · el registro `registro-scripts.json` del motor (lo mantiene el alta);
     · todo `.clasp.json` del motor y de la ingesta (clones y puentes).
   El LIBRO de cada uno no se escribe en ningún lado: lo dice Google
   (`parentId`), así que no hay un segundo dato que se desincronice. */
function scriptsConocidos() {
  const ids = new Map();
  const reg = path.join(MOTOR, 'registro-scripts.json');
  if (fs.existsSync(reg)) {
    try {
      for (const s of JSON.parse(fs.readFileSync(reg, 'utf8')).scripts || []) {
        if (s && s.scriptId) ids.set(s.scriptId, s.etiqueta || 'registro');
      }
    } catch (e) {
      anotar('ERROR', 'scripts', 'registro-scripts.json', 'El registro no es JSON válido: ' + e.message);
    }
  } else {
    anotar('AVISO', 'scripts', 'registro-scripts.json', 'No existe el registro de scripts del motor: solo se auditan los que tienen un clon local.',
      'node server/bin/ecosistema.js registrar --script <scriptId> --etiqueta "<club / categoría>"');
  }
  const recorrer = (dir, prof) => {
    if (prof > 3 || !fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.git')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(p, prof + 1);
      else if (e.name === '.clasp.json') {
        try {
          const id = JSON.parse(fs.readFileSync(p, 'utf8')).scriptId;
          if (id && !ids.has(id)) ids.set(id, path.relative(path.dirname(MOTOR), dir));
        } catch (_) { /* un .clasp.json roto no es asunto de esta auditoría */ }
      }
    }
  };
  recorrer(MOTOR, 0);
  recorrer(INGESTA, 0);
  return ids;
}

/* La sesión de clasp: un refresh y listo. Sin ella esta parte se saltea. */
async function tokenClasp() {
  const p = path.join(os.homedir(), '.clasprc.json');
  if (!fs.existsSync(p)) return null;
  const t = (JSON.parse(fs.readFileSync(p, 'utf8')).tokens || {}).default;
  if (!t || !t.refresh_token) return null;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: t.client_id, client_secret: t.client_secret,
      refresh_token: t.refresh_token, grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  return j.access_token || null;
}

async function leerScript(scriptId, token) {
  const h = { Authorization: 'Bearer ' + token };
  const meta = await fetch('https://script.googleapis.com/v1/projects/' + scriptId, { headers: h });
  if (meta.status !== 200) return { scriptId, error: 'HTTP ' + meta.status };
  const m = await meta.json();
  if (!m.parentId) return { scriptId, titulo: m.title, independiente: true };
  const cont = await fetch('https://script.googleapis.com/v1/projects/' + scriptId + '/content', { headers: h });
  let msToken = null;
  if (cont.status === 200) {
    for (const f of (await cont.json()).files || []) {
      const x = String(f.source || '').match(/var\s+MS_TOKEN\s*=\s*['"]([^'"]*)['"]/);
      if (x) { msToken = x[1]; break; }
    }
  }
  return { scriptId, titulo: m.title, parentId: m.parentId, msToken };
}

function tokenDe() {
  const p = path.join(MOTOR, 'herramientas', 'tokenDeCliente.js');
  return fs.existsSync(p) ? require(p).tokenDe : null;
}

// ---------------------------------------------------------------------
// 4 · La ingesta automática
// ---------------------------------------------------------------------
function competenciasDeIngesta() {
  const p = path.join(INGESTA, 'src', 'sitios.js');
  if (!fs.existsSync(p)) {
    anotar('AVISO', 'ingesta', 'sitios.js', 'No encontré la ingesta en ' + INGESTA + ': se saltea.');
    return [];
  }
  const s = require(p);
  return Object.entries(s.COMPETENCIAS || {})
    .map(([id, c]) => ({ id, sheetId: (c.destino || {}).sheetId || c.sheetId || null,
      scriptId: (c.destino || {}).scriptId || c.scriptId || null }))
    .filter(c => c.sheetId);
}

// ---------------------------------------------------------------------
// 5 · Torneos y escudos
// ---------------------------------------------------------------------
function auditarTorneos(cat) {
  const dir = path.join(REPO, 'torneos');
  const archivos = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const enCatalogo = Object.entries(cat).filter(([, c]) => c.tipo === 'torneo');
  const ids = new Set(archivos.map(f => f.replace(/\.json$/, '')));
  for (const f of archivos) {
    const id = f.replace(/\.json$/, '');
    let t;
    try { t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { anotar('ERROR', 'torneos', f, 'No es JSON válido: ' + e.message); continue; }
    const c = cat[id];
    if (!c) {
      if (TORNEOS_FUERA_DEL_CATALOGO[id]) continue;
      anotar('AVISO', 'torneos', id, 'El archivo existe y el torneo no está en el catálogo: la web no lo sirve.',
        'node server/bin/catalogo.js torneo --archivo torneos/' + f + ' --libro "<zona>=<sheetId>" --probar');
      continue;
    }
    const zonasArchivo = Object.values(t.zonas || {}).map(z => z.slug).filter(Boolean);
    for (const slug of zonasArchivo) {
      const zc = (c.categorias || {})[slug];
      if (!zc) anotar('ERROR', 'torneos', id + ' / ' + slug, 'La zona está en el archivo y no en el catálogo.',
        'node server/bin/catalogo.js torneo --archivo torneos/' + f + ' --probar');
      else if (!zc.sheetId) anotar('AVISO', 'torneos', id + ' / ' + slug, 'Zona declarada sin libro conectado.',
        'node server/bin/catalogo.js torneo --archivo torneos/' + f + ' --libro "' + slug + '=<sheetId>"');
    }
  }
  for (const [id] of enCatalogo) {
    if (!ids.has(id)) anotar('AVISO', 'torneos', id, 'Está en el catálogo y no tiene torneos/' + id + '.json: sin fixture ni equipos declarados.');
  }
}

function claveLogo(n) {
  return String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s*-\s*(MM|MF|U\d{1,2}[MF]?)\s*$/, '')
    /* Como las claves del manifiesto: paréntesis y puntos como espacios
       («ARGENTINO (J)» → «argentino j»). */
    .replace(/['´`]/g, '').replace(/[.()\-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function auditarEscudos(cat) {
  const base = path.join(REPO, 'logos');
  const carpetas = fs.readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  const manifiestos = {};
  for (const liga of carpetas) {
    const pIdx = path.join(base, liga, 'index.json');
    if (!fs.existsSync(pIdx)) {
      anotar('ERROR', 'escudos', 'logos/' + liga, 'La carpeta no tiene index.json: el panel no resuelve NINGUNO de sus escudos.',
        'escribir logos/' + liga + '/index.json (clave del equipo en minúsculas → archivo) y correr node test-logos.js');
      continue;
    }
    let m;
    try { m = JSON.parse(fs.readFileSync(pIdx, 'utf8')); }
    catch (e) { anotar('ERROR', 'escudos', 'logos/' + liga + '/index.json', 'No es JSON válido.'); continue; }
    manifiestos[liga] = m;
    const rotos = Object.entries(m).filter(([, a]) => typeof a === 'string' && !fs.existsSync(path.join(base, liga, a)));
    if (rotos.length) anotar('ERROR', 'escudos', 'logos/' + liga, rotos.length + ' entradas apuntan a archivos que no existen ('
      + rotos.slice(0, 3).map(r => r[1]).join(', ') + (rotos.length > 3 ? '…' : '') + ').', 'node test-logos.js');
  }
  const ligas = new Set(Object.values(cat).map(c => c.liga).filter(Boolean));
  for (const l of ligas) if (!carpetas.includes(l)) anotar('AVISO', 'escudos', 'liga ' + l, 'El catálogo usa la liga y no hay logos/' + l + '/.');
  /* Los equipos de cada torneo declarado contra el manifiesto de su liga. */
  for (const f of fs.readdirSync(path.join(REPO, 'torneos')).filter(x => x.endsWith('.json'))) {
    let t; try { t = JSON.parse(fs.readFileSync(path.join(REPO, 'torneos', f), 'utf8')); } catch (_) { continue; }
    const m = manifiestos[t.liga];
    if (!m) continue;
    const faltan = [];
    for (const z of Object.values(t.zonas || {})) for (const e of z.equipos || []) {
      const claves = [e.nombre].concat(e.alias || []).map(claveLogo);
      const ok = claves.some(k => m[k] || m[k.replace(/\s+[a-z]$/, '')]);
      if (!ok) faltan.push(e.nombre);
    }
    if (faltan.length) anotar('AVISO', 'escudos', f, faltan.length + ' equipos sin escudo en logos/' + t.liga + ' ('
      + faltan.slice(0, 4).join(', ') + (faltan.length > 4 ? '…' : '') + '). Salen con iniciales.');
  }
}

// ---------------------------------------------------------------------
// El cruce
// ---------------------------------------------------------------------
async function auditar(o) {
  const hoy = hoyISO();
  const { cat, libros } = await libroDelCatalogo();
  const lic = await licencias();
  const ingesta = competenciasDeIngesta();

  /* Los scripts, con su libro según Google. */
  const porLibro = new Map();          // sheetId → [script]
  if (!o['sin-scripts']) {
    let tk = null;
    try { tk = await tokenClasp(); } catch (_) { /* sin red o sin sesión */ }
    if (!tk) anotar('AVISO', 'scripts', 'clasp', 'No hay sesión de clasp utilizable: no se auditan los tokens de los scripts.', 'clasp login');
    else {
      const derivar = tokenDe();
      for (const [sid, etiqueta] of scriptsConocidos()) {
        const s = await leerScript(sid, tk);
        s.etiqueta = etiqueta;
        if (s.error) { anotar('AVISO', 'scripts', corto(sid) + ' (' + etiqueta + ')', 'No se pudo leer (' + s.error + '): la cuenta de clasp no tiene acceso o el script no existe.'); continue; }
        if (s.independiente) continue;    // la librería, el backend de licencias: no son de un libro
        if (!porLibro.has(s.parentId)) porLibro.set(s.parentId, []);
        porLibro.get(s.parentId).push(s);
        if (s.msToken === null) continue; // un puente o un cliente viejo sin fachada: no lleva token
        if (!derivar) continue;
        if (s.msToken !== derivar(s.parentId)) {
          anotar('ERROR', 'motor', s.titulo + ' · ' + corto(s.parentId),
            'El MS_TOKEN del script no es el de su libro (casi siempre: el libro es una copia). El menú contesta «Token inválido».',
            'cd ' + MOTOR + ' && node herramientas/publicarCliente.js ' + sid + ' ' + s.parentId);
        }
      }
    }
  }

  /* Todos los libros que alguna fuente nombra. */
  const todos = new Set([...libros.keys(), ...porLibro.keys(), ...ingesta.map(c => c.sheetId)]);
  for (const id of todos) {
    const usos = libros.get(id) || [];
    const scripts = porLibro.get(id) || [];
    const nombre = usos.length ? usos.map(u => u.club + '/' + u.slug).join(', ')
      : scripts.length ? 'script «' + scripts[0].titulo + '»' : 'ingesta';
    const sujeto = corto(id) + ' · ' + nombre;

    // 2 · Google
    try { await obtenerDatosPlanilla(id, 'A1'); }
    catch (e) {
      anotar('ERROR', 'google', sujeto, e.codigo === 'SIN_HOJA' ? 'El libro NO EXISTE (id mal escrito o borrado).'
        : 'La Service Account no lo puede leer (' + (e.codigo || e.message) + ').',
        e.codigo === 'SIN_HOJA' ? 'corregir el sheetId en el catálogo (Panel Master o catalogo.js alta)'
          : 'compartir el libro con la Service Account, modo Lector');
    }

    // 1 · Catálogo: un libro que tiene script pero la web no conoce
    if (!usos.length && scripts.length) {
      anotar('AVISO', 'catálogo', sujeto, 'El libro tiene motor pero no está en el catálogo: la web no lo muestra.',
        'torneo: node server/bin/catalogo.js torneo --archivo torneos/<id>.json --libro "<zona>=' + id + '"  ·  cliente: Panel Master → Alta');
    }

    // 3 · Licencia del motor
    if (lic) {
      const l = lic.get(id);
      /* Un libro que escribe la ingesta lo opera MotorStats (un administrador):
         ahí el cliente usa la web, no el menú de la planilla. */
      const deIngesta = ingesta.some(c => c.sheetId === id);
      const deCliente = !deIngesta && usos.some(u => u.tipo !== 'torneo');
      if (!l) {
        anotar(deCliente ? 'ERROR' : 'AVISO', 'licencias', sujeto,
          deCliente ? 'Libro de un cliente sin fila en LICENCIAS: su menú contesta «suscripción inactiva» a todo el que no sea administrador.'
            : 'Sin fila en LICENCIAS: el menú solo le contesta a un administrador (alcanza para un torneo que opera MotorStats).',
          'node server/bin/ecosistema.js plan-alta --sheet ' + id + '   (dice la fila exacta a cargar)');
      } else {
        const activa = l.estado === 'ACTIVA';
        if (!activa) anotar(deCliente ? 'ERROR' : 'AVISO', 'licencias', sujeto, 'LICENCIAS fila ' + l.fila + ': ESTADO = ' + (l.estado || 'vacío') + '.', 'poner ESTADO = ACTIVA en la fila ' + l.fila);
        else if (l.vence && l.vence < hoy) anotar(deCliente ? 'ERROR' : 'AVISO', 'licencias', sujeto, 'LICENCIAS fila ' + l.fila + ': vencida el ' + l.vence + '.', 'extender FECHA_VENCIMIENTO en la fila ' + l.fila);
        /* La licencia del motor y la suscripción de la web son DOS fechas. */
        for (const u of usos) {
          const v = u.cat.vence || u.c.vence;
          if (u.tipo !== 'torneo' && v && l.vence && v > l.vence) {
            anotar('AVISO', 'licencias', u.club + '/' + u.slug, 'La web vence el ' + v + ' y la licencia del motor el ' + l.vence
              + ': entre esas fechas el panel anda y el menú de la planilla no.', 'alinear FECHA_VENCIMIENTO de la fila ' + l.fila);
          }
        }
      }
    }
  }

  // 4 · La ingesta escribe en libros que la web tiene que conocer
  for (const c of ingesta) {
    if (!libros.has(c.sheetId)) anotar('ERROR', 'ingesta', c.id, 'La ingesta escribe en ' + corto(c.sheetId) + ' y ese libro no está en el catálogo.');
  }

  // 5 · Suscripciones de la web
  for (const [club, c] of Object.entries(cat)) {
    if (c.tipo === 'torneo') continue;
    for (const slug of Object.keys(c.categorias || {})) {
      /* La MISMA cascada que hace valer el servidor (punto 60). */
      const s = AUTH.suscripcionDeCategoria(c, slug);
      if (!s.vence) continue;
      if (s.estado === 'vencido' || s.pruebaVencida) {
        anotar('AVISO', 'suscripción', club + '/' + slug, (s.pruebaVencida ? 'La prueba terminó' : 'Venció') + ' el ' + s.vence
          + ': el panel ya le corta el acceso.',
          'renovar: node server/bin/catalogo.js vence --club ' + club + ' --categoria ' + slug + ' --vence <aaaa-mm-dd>');
      } else if (s.acceso && (new Date(s.vence) - new Date(hoy)) / 864e5 <= DIAS_AVISO_VENCE) {
        anotar('AVISO', 'suscripción', club + '/' + slug, 'Vence el ' + s.vence + ' (el mail de aviso sale solo a 5, 3 y 1 día).');
      }
    }
  }

  // 6 · Torneos y escudos
  auditarTorneos(cat);
  auditarEscudos(cat);

  // 7 · El motor sin historial
  if (fs.existsSync(MOTOR) && !fs.existsSync(path.join(MOTOR, '.git'))) {
    anotar('AVISO', 'motor', MOTOR, 'El código del motor no está bajo git: un cambio que rompe no tiene vuelta atrás salvo las carpetas de respaldo.', 'cd ' + MOTOR + ' && git init && git add -A && git commit -m "estado inicial"');
  }
  return hallazgos;
}

// ---------------------------------------------------------------------
// plan-alta · qué falta para que UN libro ande de punta a punta
// ---------------------------------------------------------------------
async function planAlta(sheetId) {
  await auditar({});
  const mios = hallazgos.filter(h => String(h.sujeto).startsWith(corto(sheetId)));
  console.log('\n  Libro ' + corto(sheetId) + (mios.length ? ' · ' + mios.length + ' pendientes\n' : ' · nada pendiente\n'));
  mios.forEach(h => console.log('  [' + h.nivel + '] ' + h.area + ': ' + h.texto + (h.arreglo ? '\n          → ' + h.arreglo : '')));
  console.log('\n  Fila de LICENCIAS, si falta:  CLIENTE=<nombre> · SPREADSHEET_ID=' + sheetId + ' · ESTADO=ACTIVA · FECHA_VENCIMIENTO=<dd/mm/aaaa> · PLAN=<plan>\n');
}

// ---------------------------------------------------------------------
// registrar · suma un script al registro del motor
// ---------------------------------------------------------------------
function registrar(o) {
  if (!o.script) { console.error('uso: node server/bin/ecosistema.js registrar --script <scriptId> --etiqueta "<texto>"'); process.exit(2); }
  const p = path.join(MOTOR, 'registro-scripts.json');
  const reg = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : { '//': 'Scripts de libros que audita server/bin/ecosistema.js. El libro de cada uno lo dice Google (parentId): acá va solo el scriptId.', scripts: [] };
  if (reg.scripts.some(s => s.scriptId === o.script)) { console.log('  ya estaba registrado'); return; }
  reg.scripts.push({ scriptId: o.script, etiqueta: o.etiqueta || '', alta: hoyISO() });
  fs.writeFileSync(p, JSON.stringify(reg, null, 2) + '\n');
  console.log('  registrado en ' + p);
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].indexOf('--') !== 0) continue;
    const c = argv[i].slice(2), s = argv[i + 1];
    if (s === undefined || s.indexOf('--') === 0) o[c] = true; else { o[c] = s; i++; }
  }
  return o;
}

module.exports = { iso, claveLogo, corto };

if (require.main === module) {
  const cmd = process.argv[2];
  const o = args(process.argv.slice(3));
  (async () => {
    if (cmd === 'registrar') return registrar(o);
    if (cmd === 'plan-alta') {
      if (!o.sheet) { console.error('uso: node server/bin/ecosistema.js plan-alta --sheet <sheetId>'); process.exit(2); }
      return planAlta(o.sheet);
    }
    if (cmd !== 'auditar') {
      console.error('uso: node server/bin/ecosistema.js auditar [--json] [--sin-scripts] | plan-alta --sheet <id> | registrar --script <id> --etiqueta "<texto>"');
      process.exit(2);
    }
    const h = await auditar(o);
    if (o.json) { console.log(JSON.stringify(h, null, 2)); }
    else {
      const orden = { ERROR: 0, AVISO: 1 };
      h.sort((a, b) => orden[a.nivel] - orden[b.nivel] || a.area.localeCompare(b.area));
      console.log('\n  Auditoría del ecosistema · ' + hoyISO() + '\n');
      if (!h.length) console.log('  Todo en orden: las seis fuentes coinciden.');
      for (const x of h) {
        console.log('  ' + (x.nivel === 'ERROR' ? '✖' : '⚠') + ' ' + x.area.padEnd(12) + x.sujeto);
        console.log('      ' + x.texto);
        if (x.arreglo) console.log('      → ' + x.arreglo);
      }
      const e = h.filter(x => x.nivel === 'ERROR').length;
      console.log('\n  ' + e + ' errores · ' + (h.length - e) + ' avisos\n');
    }
    process.exit(h.some(x => x.nivel === 'ERROR') ? 1 : 0);
  })().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
}
