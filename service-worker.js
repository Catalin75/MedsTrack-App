const CACHE_NAME = 'medstrack-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './src/main.js',
  './src/db.js',
  './src/audio.js',
  './src/views/dashboard.js',
  './src/views/addMedication.js',
  './src/views/cabinet.js',
  './src/views/notifications.js',
  './src/views/history.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
