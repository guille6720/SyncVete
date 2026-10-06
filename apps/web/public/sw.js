self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open('owner-app-offline-v1').then((cache) => cache.add('/portal/offline.html')),
      self.skipWaiting(),
    ])
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.mode === 'navigate' &&
    url.origin === self.location.origin &&
    url.pathname.startsWith('/portal')
  ) {
    event.respondWith(
      fetch(event.request).catch(
        async () => (await caches.match('/portal/offline.html')) || Response.error()
      )
    );
  }
});
