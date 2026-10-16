'use strict';
/* test-canva.js · las piezas aprobadas a Canva por la API, sin Claude (punto 123).
   Todo con dependencias inyectadas: ni red, ni git, ni Chrome. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('./centro-mando/canva.js');

let pasan = 0, fallan = 0;
function check(n, c) { if (c) pasan++; else { fallan++; console.log('  ✗ ' + n); } }
const esperarNada = () => Promise.resolve();

function entorno(token) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-canva-'));
  const tokenArchivo = path.join(dir, 'token.json');
  if (token) fs.writeFileSync(tokenArchivo, JSON.stringify(token));
  const html = path.join(dir, '2026-10-16_apb-b_CR-01.html');
  fs.writeFileSync(html, '<section data-document-role="page">x</section>');
  const config = { clientId: 'cid', clientSecret: 'sec', tokenArchivo, pages: 'https://ej.github.io/est/', esperaPagesMs: 0 };
  return { dir, tokenArchivo, html, config };
}

/* Un Canva y un Pages de mentira. `guion.import` decide qué contesta el job. */
function falso(guion) {
  const llamadas = [];
  const fetch = async (url, op) => {
    llamadas.push({ url, op: op || {} });
    const json = (s, j) => ({ ok: s < 400, status: s, json: async () => j });
    if (url.endsWith('/oauth/token')) {
      const q = new URLSearchParams(op.body);
      return json(200, { access_token: 'acc-' + q.get('grant_type'), refresh_token: 'refresh-NUEVO', expires_in: 14400 });
    }
    if (op && op.method === 'HEAD') return { status: guion.pages === false ? 404 : 200 };
    if (url.endsWith('/url-imports') && op.method === 'POST') return json(200, { job: { id: 'J1', status: 'in_progress' } });
    if (url.includes('/url-imports/J1')) return json(200, guion.import || { job: { id: 'J1', status: 'success',
      result: { designs: [{ id: 'DZ1', page_count: 7, urls: { edit_url: 'https://canva.com/edit/DZ1', view_url: 'https://canva.com/view/DZ1' } }] } } });
    return json(404, {});
  };
  return { fetch, llamadas };
}

function gitFalso() {
  const ops = [];
  const git = (a) => {
    ops.push(a);
    if (a[0] === 'rev-parse') return 'main';
    if (a[0] === 'rev-list') return '0';
    if (a[0] === 'diff') return 'placas-tmp/x.pdf';
    return '';
  };
  return { git, ops };
}

(async () => {
  // 1 · el permiso
  {
    const e = entorno({ refresh_token: 'refresh-VIEJO', access_token: 'viejo', expira: 0 });
    const f = falso({});
    const t = await C.acceso(e.config, { fetch: f.fetch, ahora: () => 1000 });
    const guardado = JSON.parse(fs.readFileSync(e.tokenArchivo, 'utf8'));
    check('un acceso vencido se renueva con el refresh token', t === 'acc-refresh_token');
    check('el refresh NUEVO queda guardado (Canva lo rota en cada uso)', guardado.refresh_token === 'refresh-NUEVO');
    check('el pedido de token va con Basic auth del client_id:secret',
      f.llamadas[0].op.headers.Authorization === 'Basic ' + Buffer.from('cid:sec').toString('base64'));
    const f2 = falso({});
    await C.acceso(e.config, { fetch: f2.fetch, ahora: () => 2000 });
    check('un acceso vigente no vuelve a pedir token', f2.llamadas.length === 0);
  }
  {
    const e = entorno(null);
    let err = null;
    try { await C.acceso(e.config, { fetch: falso({}).fetch }); } catch (x) { err = x; }
    check('sin autorizar, el error lo dice y nombra el comando', err && err.codigo === 'SIN_PERMISO' && /canva\.js autorizar/.test(err.message));
  }

  // 2 · el circuito entero
  {
    const e = entorno({ refresh_token: 'r', access_token: 'a', expira: Date.now() + 3600e3 });
    const f = falso({});
    const g = gitFalso();
    const cola = { pendientes: [{ id: 'P1', pieza: 'CR-01', titulo: 'Cruce', estado: 'pendiente', html: e.html }] };
    let pdfs = 0;
    const r = await C.importar({}, { config: e.config, fetch: f.fetch, git: g.git, cola, guardarCola: () => {}, raiz: e.dir,
      esperar: esperarNada, log: () => {}, pdfDe: async () => { pdfs++; return { pdf: Buffer.from('%PDF'), placas: 1 }; } });
    const x = cola.pendientes[0];
    check('la pieza queda importada, con el link de edición de Canva', x.estado === 'importada' && x.canva === 'https://canva.com/edit/DZ1' && x.canvaId === 'DZ1');
    check('el PDF se arma una vez', pdfs === 1);
    const post = f.llamadas.find((l) => l.url.endsWith('/url-imports') && l.op.method === 'POST');
    const cuerpo = JSON.parse(post.op.body);
    check('Canva recibe la URL pública de Pages, como PDF', cuerpo.url === 'https://ej.github.io/est/placas-tmp/2026-10-16_apb-b_CR-01.pdf' && cuerpo.mime_type === 'application/pdf');
    check('el título es el de la pieza', cuerpo.title === 'Cruce');
    const commits = g.ops.filter((a) => a[0] === 'commit');
    check('dos commits: publicar y quitar', commits.length === 2);
    check('cada commit es SOLO de placas-tmp', commits.every((a) => a[a.length - 1] === 'placas-tmp' && a[a.length - 2] === '--'));
    check('el add también se limita a placas-tmp', g.ops.filter((a) => a[0] === 'add').every((a) => a.join(' ') === 'add -A -- placas-tmp'));
    check('al terminar, placas-tmp queda vacía', fs.readdirSync(path.join(e.dir, 'placas-tmp')).length === 0);
    check('el resumen cuenta lo que pasó', r.publicadas === 1 && r.importadas === 1 && r.errores === 0);
  }

  // 3 · Pages tarda: queda publicada para la próxima corrida
  {
    const e = entorno({ refresh_token: 'r', access_token: 'a', expira: Date.now() + 3600e3 });
    const f = falso({ pages: false });
    const g = gitFalso();
    const cola = { pendientes: [{ pieza: 'CR-01', estado: 'pendiente', html: e.html }] };
    const r = await C.importar({}, { config: e.config, fetch: f.fetch, git: g.git, cola, guardarCola: () => {}, raiz: e.dir,
      esperar: esperarNada, log: () => {}, pdfDe: async () => ({ pdf: Buffer.from('%PDF') }) });
    check('sin Pages, la pieza queda publicada y esperando', cola.pendientes[0].estado === 'publicada' && r.esperando === 1);
    check('y el PDF sigue publicado (no se quita lo que falta importar)', fs.existsSync(path.join(e.dir, 'placas-tmp', '2026-10-16_apb-b_CR-01.pdf')));
    check('no se le pidió nada a Canva', !f.llamadas.some((l) => l.url.includes('/url-imports')));
  }

  // 4 · errores de Canva: transitorio se reintenta, definitivo no
  for (const [codigo, esperado] of [['fetch_failed', 'publicada'], ['invalid_file', 'error']]) {
    const e = entorno({ refresh_token: 'r', access_token: 'a', expira: Date.now() + 3600e3 });
    const f = falso({ import: { job: { id: 'J1', status: 'failed', error: { code: codigo, message: 'no' } } } });
    const cola = { pendientes: [{ pieza: 'CR-01', estado: 'publicada', html: e.html, publicado: { url: 'https://ej/x.pdf' } }] };
    await C.importar({}, { config: e.config, fetch: f.fetch, git: gitFalso().git, cola, guardarCola: () => {}, raiz: e.dir,
      esperar: esperarNada, log: () => {} });
    check(codigo + ' deja la pieza en «' + esperado + '»', cola.pendientes[0].estado === esperado);
  }

  // 5 · las guardas
  {
    const e = entorno(null);
    const g = gitFalso();
    const cola = { pendientes: [{ pieza: 'CR-01', estado: 'pendiente', html: e.html }] };
    let err = null;
    try { await C.importar({}, { config: e.config, fetch: falso({}).fetch, git: g.git, cola, guardarCola: () => {}, raiz: e.dir, log: () => {} }); } catch (x) { err = x; }
    check('sin permiso no se publica nada', err && !g.ops.some((a) => a[0] === 'push') && cola.pendientes[0].estado === 'pendiente');
  }
  {
    const e = entorno({ refresh_token: 'r', access_token: 'a', expira: Date.now() + 3600e3 });
    const g = gitFalso();
    const cola = { pendientes: [{ pieza: 'CR-01', estado: 'pendiente', html: e.html }] };
    await C.importar({ ensayo: true }, { config: e.config, fetch: falso({}).fetch, git: g.git, cola, guardarCola: () => {}, raiz: e.dir, log: () => {} });
    check('el ensayo no toca git ni la cola', g.ops.length === 0 && cola.pendientes[0].estado === 'pendiente');
  }
  {
    const atras = (a) => (a[0] === 'rev-parse' ? 'main' : a[0] === 'rev-list' ? '2' : '');
    let err = null;
    try { C.publicarCarpeta(atras, 'x'); } catch (x) { err = x; }
    check('con main atrás de origin no se publica', err && /atrás/.test(err.message));
    let err2 = null;
    try { C.publicarCarpeta((a) => (a[0] === 'rev-parse' ? 'otra' : ''), 'x'); } catch (x) { err2 = x; }
    check('fuera de main no se publica', err2 && /main/.test(err2.message));
  }

  // 6 · lo que no tiene que estar
  const src = fs.readFileSync(path.join(__dirname, 'centro-mando', 'canva.js'), 'utf8');
  check('no llama a Claude ni a la API de Anthropic', !/anthropic|claude -p|llm\.js/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
  check('importa PDF, no HTML (la API de Canva no acepta HTML)', /mime_type: 'application\/pdf'/.test(src));
  check('el permiso se guarda fuera del repo publicado', fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf8').includes('centro-mando/.canva-token.json'));
  check('ya no hay render local', !fs.existsSync(path.join(__dirname, 'centro-mando', 'renderizar.js')));
  const pdf = fs.readFileSync(path.join(__dirname, 'centro-mando', 'pdf.js'), 'utf8');
  check('pdf.js no escribe archivos (devuelve el PDF en memoria)', !/writeFileSync/.test(pdf));
  check('pdf.js no suma dependencias', !/require\(['"](puppeteer|playwright)/.test(pdf));

  console.log('\n  test-canva · ' + pasan + ' pasan · ' + fallan + ' fallan');
  if (fallan) { console.log('  FALLARON'); process.exit(1); }
})();
