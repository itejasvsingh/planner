// Align Service Worker - Purges stale caches and ensures fresh app loading
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        return self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((c) => {
            if (c.url && 'navigate' in c) {
              c.navigate(c.url);
            }
          });
        });
      })
  );
});

self.addEventListener('fetch', (e) => {
  // Always fetch fresh network assets
  e.respondWith(fetch(e.request));
});
