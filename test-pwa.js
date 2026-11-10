/* PWA (punto 175): manifest, iconos, service worker, registro y botón de instalar. */
const fs = require('fs');
const vm = require('vm');
let ok = 0, mal = 0;
const check = (n, c, d) => { if (c) ok++; else { mal++; console.log('  ✗', n, d || ''); } };
const HTML = fs.readFileSync('./index.html', 'utf8');
const M = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));

console.log('1 · manifest');
check('nombre, standalone y colores del tema', M.short_name === 'MotorStats' && M.display === 'standalone' && M.theme_color === '#0B1121' && M.background_color === '#0B1121');
check('rutas RELATIVAS: el sitio vive en un subdirectorio de Pages', M.start_url.startsWith('./') && M.scope === './' && M.icons.every(i => !i.src.startsWith('/')));
check('íconos 192 y 512 y los archivos existen', ['192x192', '512x512'].every(s => M.icons.some(i => i.sizes === s && i.purpose === 'any')) && M.icons.every(i => fs.existsSync('./' + i.src)));
check('los PNG son PNG del tamaño declarado', M.icons.every(i => { const b = fs.readFileSync('./' + i.src); const w = b.readUInt32BE(16); return b.slice(1, 4).toString() === 'PNG' && (i.sizes === w + 'x' + w); }));

console.log('2 · index.html');
check('enlaza el manifest, el theme-color y el ícono de iOS', /rel="manifest" href="manifest\.json"/.test(HTML) && /name="theme-color" content="#0B1121"/.test(HTML) && /rel="apple-touch-icon"/.test(HTML));
check('el botón es un item más del menú: mismas clases que Principal',(()=>{const cl=s=>(HTML.match(new RegExp('<button[^>]*'+s+'[^>]*class="([^"]+)"'))||[])[1]||'';const p=cl('data-nav="principal"'),b=(HTML.match(/<button id="pwaInstalar"[^>]*class="([^"]+)"/)||[])[1]||'';return p&&['nav-item','w-full','flex','items-center','gap-3','px-4','py-3','rounded-md','font-body','text-sm','text-white','hover:bg-surface2','transition'].every(c=>b.split(' ').includes(c));})());
check('sin estilos propios de botón llamativo (nada de fondo del acento)', !/\.pwa-instalar\s*\{[^}]*background/.test(HTML));
check('los PNG del ícono tienen fondo transparente (esquinas con alfa 0)', ['icons/icon-192.png','icons/icon-512.png'].every(f=>{const zlib=require('zlib');const b=fs.readFileSync('./'+f);let i=8,d=[];while(i<b.length){const n=b.readUInt32BE(i),t=b.slice(i+4,i+8).toString();if(t==='IDAT')d.push(b.slice(i+8,i+8+n));i+=12+n;}const w=b.readUInt32BE(16),r=zlib.inflateSync(Buffer.concat(d));return b[25]===6&&(r[0]===0||r[0]===2)&&r[1+3]===0&&r[1+(w-1)*4+3]===0;}));
check('el botón existe, nace oculto y no se imprime', /id="pwaInstalar"[^>]*\bhidden\b/.test(HTML) && /@media print \{ \.pwa-instalar/.test(HTML));
check('el módulo carga con el mismo ?v= que el resto', (HTML.match(/sgadd-pwa\.js\?v=(\d+)/) || [])[1] === (HTML.match(/sgadd-core\.js\?v=(\d+)/) || [])[1]);

console.log('3 · service worker');
const SW = fs.readFileSync('./sw.js', 'utf8');
const caches = new Map(); const listeners = {};
const mkCache = () => { const m = new Map(); return { m, put: async (r, res) => { m.set(r.url || r, res); }, match: async (r) => m.get(typeof r === 'string' ? new URL(r, 'https://x.test/estadisticas/').href : r.url), add: async (u) => { m.set(new URL(u, 'https://x.test/estadisticas/').href, { ok: true }); } }; };
const self_ = { location: new URL('https://x.test/estadisticas/sw.js'), addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting: () => Promise.resolve(), clients: { claim: () => Promise.resolve() } };
let red = true;
const sandbox = { self: self_, URL, Response: class { constructor(b, o) { this.body = b; this.status = (o || {}).status || 200; this.ok = this.status < 400; } }, caches: { open: async (n) => { if (!caches.has(n)) caches.set(n, mkCache()); return caches.get(n); }, keys: async () => [...caches.keys()], delete: async (k) => caches.delete(k) }, fetch: async () => { if (!red) throw new Error('offline'); return { ok: true, type: 'basic', clone() { return this; } }; }, Promise };
vm.runInNewContext(SW, sandbox);
check('maneja install, activate y fetch', ['install', 'activate', 'fetch'].every(t => typeof listeners[t] === 'function'));
check('solo GET del propio sitio: nada de la API ni de otro origen', /req\.method !== 'GET'\) return/.test(SW) && /url\.origin !== self\.location\.origin\) return/.test(SW));
check('estrategia red primero (fetch antes que cache.match)', SW.indexOf('await fetch(req)') > 0 && SW.indexOf('await fetch(req)') < SW.indexOf('cache.match(req)'));

(async () => {
  const pedir = (url, mode) => { let r; listeners.fetch({ request: { method: 'GET', url, mode }, respondWith: (p) => { r = p; } }); return r; };
  check('un pedido de otro origen no se intercepta', pedir('https://api.otro.com/x') === undefined);
  check('un POST no se intercepta', (() => { let r; listeners.fetch({ request: { method: 'POST', url: 'https://x.test/estadisticas/a' }, respondWith: (p) => { r = p; } }); return r === undefined; })());
  red = true;
  const a = await pedir('https://x.test/estadisticas/js/sgadd-core.js?v=370');
  check('con red sirve lo publicado y lo guarda', a.ok === true && [...caches.get('sgadd-pwa-v1').m.keys()].some(k => k.includes('sgadd-core.js?v=370')));
  red = false;
  const b = await pedir('https://x.test/estadisticas/js/sgadd-core.js?v=370');
  check('sin red sirve la copia guardada', b && b.ok === true);
  const c = await pedir('https://x.test/estadisticas/js/otro.js');
  check('sin red y sin copia: 503 claro, no un cuelgue', c.status === 503);
  await caches.get('sgadd-pwa-v1').add('index.html');
  const d = await pedir('https://x.test/estadisticas/?club=jujuy', 'navigate');
  check('sin red, una navegación cae al index.html guardado', d && d.ok === true);
  caches.set('sgadd-pwa-v0', mkCache()); caches.set('otra-app', mkCache());
  await new Promise((res) => { listeners.activate({ waitUntil: (p) => p.then(res) }); });
  check('activate borra las cachés viejas de SGADD y no toca las ajenas', !caches.has('sgadd-pwa-v0') && caches.has('otra-app') && caches.has('sgadd-pwa-v1'));

  console.log('4 · registro y botón');
  const P = require('./js/sgadd-pwa.js');
  check('el módulo se puede requerir en Node sin romper', typeof P.iniciar === 'function');
  check('detecta iOS por el user agent', P.esIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)') && !P.esIos('Mozilla/5.0 (Windows NT 10.0) Chrome/120'));
  const win = (proto, host, standalone, sw) => ({ location: { protocol: proto, hostname: host }, navigator: sw === false ? {} : { serviceWorker: {}, standalone }, matchMedia: () => ({ matches: false }) });
  check('el SW solo en https o localhost', P.swPosible(win('https:', 'x.test')) && P.swPosible(win('http:', 'localhost')) && !P.swPosible(win('http:', 'x.test')) && !P.swPosible(win('file:', '')) && !P.swPosible(win('https:', 'x.test', false, false)));
  check('instalada (standalone) no ofrece instalar', P.esInstalada({ matchMedia: () => ({ matches: true }), navigator: {} }) && P.esInstalada({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } }) && !P.esInstalada({ matchMedia: () => ({ matches: false }), navigator: {} }));
  check('registra sw.js con ruta relativa y falla en silencio', /register\('sw\.js'\)\.catch/.test(fs.readFileSync('./js/sgadd-pwa.js', 'utf8')));
  const src = fs.readFileSync('./js/sgadd-pwa.js', 'utf8');
  check('el botón sale solo con beforeinstallprompt (o en iOS)', /beforeinstallprompt[\s\S]{0,120}evento = e;[\s\S]{0,40}mostrar\(\)/.test(src) && /esIos\(\) && !esInstalada\(\)\) mostrar\(\)/.test(src));

  console.log('\n' + (mal ? '✗ HAY FALLAS   ' : '') + ok + ' pasan · ' + mal + ' fallan');
  process.exit(mal ? 1 : 0);
})();
