// Bibix Projects Service Worker
const CACHE = 'bibix-v1';

self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

// ── Push notifications ────────────────────────────────────────────────────────
self.addEventListener('push', e => {
  let data = { title: 'Bibix Projects', body: 'You have a new notification' };
  try { data = e.data.json(); } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/bibix-logo.png',
      badge: '/bibix-logo.png',
      vibrate: [100, 50, 100],
      data: data.data || {},
      actions: [{ action: 'open', title: 'Open' }],
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.link ? ('/' + e.notification.data.link).replace('//', '/') : '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cls => {
      const existing = cls.find(c => c.url.includes(self.location.origin));
      if (existing) { existing.focus(); existing.navigate(url); }
      else clients.openWindow(url);
    })
  );
});

// ── Fetch caching ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return;
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/index.html')));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
