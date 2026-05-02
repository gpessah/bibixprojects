const CACHE = 'bibix-pwa-v5';
self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const path = new URL(e.request.url).pathname;
  // Never cache the HTML page or API calls — always fetch fresh
  if (path.startsWith('/api/') || path === '/app/' || path === '/app/index.html') return;
  e.respondWith(
    caches.match(e.request).then(c => c || fetch(e.request).then(r => {
      if (r.ok && e.request.method === 'GET') {
        const clone = r.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
      }
      return r;
    }))
  );
});
