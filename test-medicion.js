/* test-medicion.js · la medición después del clic (punto 180)
   node test-medicion.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const M = require('./server/lib/medicion.js');
const R = require('./server/rutas/medicion.js');
const AUTHS = require('./server/lib/auth.js');

let ok = 0, mal = 0;
const pendientes = [];
function t(nombre, fn) {
  pendientes.push(Promise.resolve().then(fn).then(() => { ok++; }, e => { mal++; console.log('  ✗ ' + nombre + '\n    ' + (e && e.message)); }));
}

/* Un KV de mentira con HINCRBY y HGETALL. */
function kvFalso() {
  const datos = {};
  return {
    datos,
    async comando(c) {
      const [op, clave, campo, n] = c;
      if (op === 'HINCRBY') { datos[clave] = datos[clave] || {}; datos[clave][campo] = (datos[clave][campo] || 0) + Number(n); return datos[clave][campo]; }
      if (op === 'HGETALL') { const h = datos[clave] || {}; const out = []; Object.keys(h).forEach(k => out.push(k, String(h[k]))); return out; }
      throw new Error('op ' + op);
    },
  };
}

console.log('1 · limpieza y vocabulario');
t('un UTM se limpia a [a-z0-9_-] y 40 caracteres', () => {
  assert.strictEqual(M.limpiar('Anota Poco!!'), 'anota-poco');
  assert.strictEqual(M.limpiar('Canción'), 'cancion');
  assert.strictEqual(M.limpiar('<script>'), 'script');
  assert.strictEqual(M.limpiar('x'.repeat(90)).length, 40);
});
t('sin UTM queda «(directo)»', () => {
  assert.strictEqual(M.limpiar(''), '(directo)');
  assert.deepStrictEqual(M.limpiarUtm(null), { source: '(directo)', medium: '(directo)', campaign: '(directo)', content: '(directo)' });
});
t('un evento fuera del vocabulario se descarta', () => {
  const ev = M.normalizarPedido({ eventos: [{ evento: 'landing' }, { evento: 'otra-cosa' }, { evento: 'pedido_demo', utm: { source: 'instagram' } }] });
  assert.strictEqual(ev.length, 2);
  assert.strictEqual(ev[1].utm.source, 'instagram');
});
t('a lo sumo 10 eventos por pedido', () => {
  const muchos = Array.from({ length: 30 }, () => ({ evento: 'landing' }));
  assert.strictEqual(M.normalizarPedido({ eventos: muchos }).length, M.MAX_EVENTOS);
});
t('el día es el de Argentina', () => {
  assert.strictEqual(M.diaAR('2026-11-17T02:00:00Z'), '2026-11-16');
  assert.strictEqual(M.diaAR('2026-11-17T04:00:00Z'), '2026-11-17');
});
t('el rango de días tiene tope y valida el orden', () => {
  assert.strictEqual(M.diasEntre('2026-11-10', '2026-11-12').length, 3);
  assert.strictEqual(M.diasEntre('2026-11-12', '2026-11-10'), null);
  assert.strictEqual(M.diasEntre('ayer', '2026-11-10'), null);
  assert.strictEqual(M.diasEntre('2026-01-01', '2026-12-31').length, M.MAX_DIAS);
});

console.log('2 · el registro: solo contadores');
t('el POST suma un contador por evento y UTM, sin datos de la persona', async () => {
  const kv = kvFalso();
  const r = await R.manejarMedicion({ body: { eventos: [{ evento: 'landing', utm: { source: 'instagram', medium: 'carrusel', campaign: 'anota-poco', content: 'cr02' }, email: 'x@y.com' }] } }, { kv, reloj: () => '2026-11-17T15:00:00Z' });
  assert.strictEqual(r.status, 200);
  const h = kv.datos['sgadd:medicion:2026-11-17'];
  assert.deepStrictEqual(Object.keys(h), ['landing|instagram|carrusel|anota-poco|cr02']);
  assert.ok(!JSON.stringify(kv.datos).includes('x@y.com'));
});
t('acepta el cuerpo como texto (sendBeacon)', async () => {
  const kv = kvFalso();
  const r = await R.manejarMedicion({ body: JSON.stringify({ eventos: [{ evento: 'demo_abierta' }] }) }, { kv });
  assert.strictEqual(r.body.sumados, 1);
});
t('un cuerpo roto no lanza', async () => {
  const r = await R.manejarMedicion({ body: '{nada' }, { kv: kvFalso() });
  assert.strictEqual(r.body.sumados, 0);
});
t('con KV caído contesta 503', async () => {
  const r = await R.manejarMedicion({ body: { eventos: [{ evento: 'landing' }] } }, { kv: { comando: async () => { throw new Error('caído'); } } });
  assert.strictEqual(r.status, 503);
});

console.log('3 · la lectura: solo ADMIN, con el embudo');
t('sin token, 401', async () => {
  const r = await R.manejarMedicionLeer({ headers: {}, query: {} }, { kv: kvFalso() });
  assert.strictEqual(r.status, 401);
});
t('el embudo suma por pieza y calcula la conversión', () => {
  const r = M.resumen({
    '2026-11-17': { 'landing|instagram|carrusel|anota-poco|cr02': 10, 'demo_abierta|instagram|carrusel|anota-poco|cr02': 4, 'pedido_demo|instagram|carrusel|anota-poco|cr02': 1, 'landing|(directo)|(directo)|(directo)|(directo)': 6 },
    '2026-11-18': { 'tour_fin|instagram|carrusel|anota-poco|cr02': 2 },
  });
  assert.strictEqual(r.total.landing, 16);
  assert.strictEqual(r.total.demo_abierta, 4);
  assert.strictEqual(r.conversion.landingADemo, 25);
  assert.strictEqual(r.conversion.demoAPedido, 25);
  assert.strictEqual(r.piezas[0].campaign, 'anota-poco');
  assert.strictEqual(r.piezas[0].tour_fin, 2);
  assert.strictEqual(r.dias['2026-11-18'].tour_fin, 2);
});
t('sin landings no hay tasa (null, no 0)', () => {
  assert.strictEqual(M.resumen({}).conversion.landingADemo, null);
});
t('con token de admin devuelve el embudo del rango', async () => {
  const kv = kvFalso();
  kv.datos['sgadd:medicion:2026-11-17'] = { 'landing|instagram|carrusel|anota-poco|cr02': 3 };
  const orig = AUTHS.verificarToken;
  AUTHS.verificarToken = () => ({ ok: true, rol: 'ADMIN' });
  try {
    const r = await R.manejarMedicionLeer({ headers: {}, query: { desde: '2026-11-16', hasta: '2026-11-17' } }, { kv });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.total.landing, 3);
    const r2 = await R.manejarMedicionLeer({ headers: {}, query: { desde: '2026-11-17', hasta: '2026-11-01' } }, { kv });
    assert.strictEqual(r2.status, 400);
  } finally { AUTHS.verificarToken = orig; }
});
t('un cliente no la lee', async () => {
  const orig = AUTHS.verificarToken;
  AUTHS.verificarToken = () => ({ ok: true, rol: 'CLIENTE' });
  try { assert.strictEqual((await R.manejarMedicionLeer({ headers: {}, query: {} }, { kv: kvFalso() })).status, 403); }
  finally { AUTHS.verificarToken = orig; }
});

console.log('4 · el navegador');
function navegador(busqueda, extra) {
  const almacen = {};
  const enviado = [];
  const ctx = Object.assign({
    location: { search: busqueda },
    sessionStorage: { getItem: k => (k in almacen ? almacen[k] : null), setItem: (k, v) => { almacen[k] = String(v); }, removeItem: k => { delete almacen[k]; } },
    navigator: { sendBeacon: (url, blob) => { enviado.push({ url, blob }); return true; } },
    Blob: function (partes) { this.texto = partes.join(''); },
    URLSearchParams,
    SGADD_API: 'https://api.ejemplo',
    console,
  }, extra || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/sgadd-medicion.js', 'utf8'), ctx);
  return { ctx, almacen, enviado, M: ctx.SGADD_MEDICION };
}
t('lee los UTM de la primera página y los recuerda en la visita', () => {
  const n = navegador('?utm_source=instagram&utm_campaign=anota-poco&club=x');
  assert.deepStrictEqual(JSON.parse(n.almacen['sgadd.utm']), { source: 'instagram', campaign: 'anota-poco' });
});
t('una visita que arrancó sin UTM toma la pieza del link etiquetado; una ya atribuida no cambia', () => {
  const almacen = { 'sgadd.utm': '{}' };
  const ctx = { location: { search: '?utm_campaign=b' }, sessionStorage: { getItem: k => (k in almacen ? almacen[k] : null), setItem: (k, v) => { almacen[k] = String(v); } }, navigator: {}, URLSearchParams };
  ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/sgadd-medicion.js', 'utf8'), ctx);
  assert.deepStrictEqual(JSON.parse(almacen['sgadd.utm']), { campaign: 'b' });
  ctx.location.search = '?utm_campaign=c';
  vm.runInContext(fs.readFileSync('js/sgadd-medicion.js', 'utf8'), ctx);
  assert.deepStrictEqual(JSON.parse(almacen['sgadd.utm']), { campaign: 'b' });
});
t('cada evento sale una sola vez por visita, solo con evento y UTM', () => {
  const n = navegador('?utm_source=instagram');
  assert.strictEqual(n.M.registrar('pedido_demo'), true);
  assert.strictEqual(n.M.registrar('pedido_demo'), false);
  assert.strictEqual(n.enviado.length, 1);
  assert.strictEqual(n.enviado[0].url, 'https://api.ejemplo/api/v1/medicion');
  assert.deepStrictEqual(JSON.parse(n.enviado[0].blob.texto), { eventos: [{ evento: 'pedido_demo', utm: { source: 'instagram' } }] });
});
t('un evento desconocido no sale', () => {
  assert.strictEqual(navegador('').M.registrar('cualquiera'), false);
});
t('con «No rastrear» no se manda nada', () => {
  const n = navegador('?utm_source=ig', { navigator: { doNotTrack: '1', sendBeacon: () => { throw new Error('no debía'); } } });
  assert.strictEqual(n.M.registrar('landing'), false);
});
t('sin backend configurado no se manda nada', () => {
  assert.strictEqual(navegador('', { SGADD_API: '' }).M.registrar('landing'), false);
});

console.log('5 · el cableado');
const index = fs.readFileSync('index.html', 'utf8');
t('el módulo carga ANTES que sgadd-club.js', () => {
  assert.ok(index.indexOf('js/sgadd-medicion.js') !== -1);
  assert.ok(index.indexOf('js/sgadd-medicion.js') < index.indexOf('js/sgadd-club.js'));
});
t('el recorrido y el pedido de demo registran su evento', () => {
  assert.ok(/registrar\('tour_fin'\)/.test(fs.readFileSync('js/sgadd-tour.js', 'utf8')));
  assert.ok(/registrar\('pedido_demo'\)/.test(fs.readFileSync('js/sgadd-demo.js', 'utf8')));
});
t('el puente /demo/ conserva los UTM', () => {
  const d = fs.readFileSync('demo/index.html', 'utf8');
  assert.ok(/location\.search/.test(d) && /demo', '1'/.test(d));
});
t('las dos rutas están en app.js, con el texto para sendBeacon', () => {
  const a = fs.readFileSync('server/app.js', 'utf8');
  assert.ok(a.includes("app.post('/api/v1/medicion'"));
  assert.ok(a.includes("app.get('/api/v1/medicion'"));
  assert.ok(/express\.text\(\{ type: 'text\/plain'/.test(a));
});

Promise.all(pendientes).then(() => {
  console.log('\n' + ok + ' ok · ' + mal + ' fallaron');
  if (mal) { console.log('HAY FALLAS'); process.exit(1); }
});
