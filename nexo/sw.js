/* Nexo · Service Worker
   - Caché versionado (nexo-v1): al cambiar la versión se borra el anterior.
   - Precarga todo el shell: la app funciona sin conexión.
   - NUNCA cachea /api/ (la IA siempre va a la red). */

const VERSION = 'nexo-v2';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './tokens.css',
  './app.js',
  './manifest.json',
  './icons/logo.svg',
  './icons/favicon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/db.js',
  './js/ai.js',
  './js/ui.js',
  './js/context.js',
  './js/hoy.js',
  './js/finanzas.js',
  './js/negocio.js',
  './js/memoria.js',
  './js/reuniones.js',
  './js/salud.js',
  './js/idiomas.js',
  './js/viajes.js',
  './js/chat.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo GET del mismo origen; la API de IA nunca pasa por la caché.
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    }),
  );
});
