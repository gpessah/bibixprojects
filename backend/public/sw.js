// Bibix Projects Service Worker — push notifications only.
// Fetch caching removed: it could turn a network hiccup into a hard failure
// that broke lazy-loaded chunks and blanked the whole app.
const CACHE = 'bibix-v4';

self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim())
));

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
// No fetch handler: the browser loads all assets/navigations directly, so the
// SW can never break chunk loading. (Offline caching removed deliberately.)
