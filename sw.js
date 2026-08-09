// Clean Service Worker - Network Only & Auto-Clear Legacy Caches
const CACHE_NAME = 'digi-suite-v8-clean';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Always fetch fresh network content directly
  event.respondWith(fetch(event.request));
});
