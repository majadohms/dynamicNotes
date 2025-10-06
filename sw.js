const CACHE = 'blocks-cache-v1';
const APP_SHELL = [
  '/notiz-proto/',
  '/notiz-proto/index.html',
  '/notiz-proto/src/style.css',
  '/notiz-proto/src/app.js',
  '/notiz-proto/public/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Nur unsere Projektseite cachen/abfangen
  if (!url.pathname.startsWith('/notiz-proto/')) return;

  if (req.mode === 'navigate') {
    // HTML: network-first, Fallback Cache
    event.respondWith(
      fetch(req).catch(() => caches.match('/notiz-proto/index.html'))
    );
    return;
  }

  // Assets: cache-first + background update
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const clone = res.clone();
      caches.open(CACHE).then((c)=> c.put(req, clone));
      return res;
    }).catch(() => cached))
  );
});
