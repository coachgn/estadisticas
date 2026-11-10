/* SGADD · Service Worker (PWA)

   Objetivo: que la app se instale y que abra sin red con lo último que se
   vio. NO es un modo offline de datos: la planilla y la API van por otro
   origen y nunca se tocan acá.

   Estrategia: RED PRIMERO, caché de respaldo. Con red siempre se sirve lo
   publicado —la trampa de este proyecto es la versión vieja que no se va—,
   y cada respuesta buena se guarda para cuando no haya red. La clave incluye
   el `?v=` de cada script, así que una entrega nueva se suma a la anterior;
   subir VERSION limpia las cachés viejas. */
const VERSION = 'sgadd-pwa-v2';
const CACHE = VERSION;
const BASE = new URL('./', self.location).pathname;
const SHELL = ['./', 'index.html', 'sgadd.css', 'manifest.json', 'icons/app-192.png', 'icons/app-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll falla entero si un archivo falla: se agregan de a uno.
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('sgadd-pwa-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Solo el propio sitio: la API del backend, GViz, Sheets y las tipografías
  // son de otro origen y siguen su camino.
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(BASE)) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(req);
      if (hit) return hit;
      // Navegación (cualquier ?club=, ?pwa=1 o hash): la app entera es index.html.
      if (req.mode === 'navigate') {
        const shell = (await cache.match('index.html')) || (await cache.match('./'));
        if (shell) return shell;
      }
      return new Response('Sin conexión y sin copia guardada de este archivo.', {
        status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});
