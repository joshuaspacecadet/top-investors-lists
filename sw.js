const SW_VERSION = 'v1';
const STATIC_CACHE = `static-${SW_VERSION}`;
const DATA_CACHE = `data-${SW_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/styles.css',
  '/Assets/handshake.jpg',
  '/Assets/union.svg',
  '/Fonts/NBArchitekt-Regular.otf',
  '/Fonts/NBArchitekt-Bold.otf'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => ![STATIC_CACHE, DATA_CACHE].includes(k)).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  const isApi = url.pathname.startsWith('/.netlify/functions/list-records');
  const isAsset =
    STATIC_ASSETS.includes(url.pathname) ||
    /\.(?:png|jpg|jpeg|svg|webp|gif|otf|ttf|woff2?|css|js)$/i.test(url.pathname);

  if (isApi) {
    event.respondWith(staleWhileRevalidate(req, DATA_CACHE));
    return;
  }
  if (isAsset) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/')));
  }
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((resp) => {
      if (resp && resp.ok) cache.put(request, resp.clone());
      return resp;
    })
    .catch(() => cached);
  return cached || networkPromise;
}


