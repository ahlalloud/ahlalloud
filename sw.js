const CACHE_NAME = 'ahl-al-oud-v4-20261112-product-polish';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css?v=20261112-product-polish',
  './app.js?v=20261112-product-polish',
  './config.js',
  './manifest.webmanifest',
  './assets/icon.svg?v=20261112-refresh'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('ahl-al-oud-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const isDocument = request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  const isScriptOrStyle = /\.(js|css)$/i.test(url.pathname);
  if (isDocument || isScriptOrStyle) {
    event.respondWith((async () => {
      try {
        const response = await fetch(new Request(request, {cache:'no-store'}));
        if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone());
        return response;
      } catch (error) {
        return (await caches.match(request)) || caches.match('./index.html');
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) (await caches.open(CACHE_NAME)).put(request, response.clone());
      return response;
    } catch (error) {
      return caches.match('./index.html');
    }
  })());
});