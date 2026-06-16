const CACHE_NAME = 'screamous-pos-v3'; // Kita naikkan versinya ke v3
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './logo.png'
];

// 1. Install & Langsung Aktif
self.addEventListener('install', event => {
  self.skipWaiting(); // Memaksa PWA langsung memakai versi terbaru tanpa menunggu ditutup
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// 2. Membersihkan Sampah Memori Lama (Agar togle tidak hilang)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName); // Hapus v1 dan v2
          }
        })
      );
    })
  );
});

// 3. Strategi Network-First (Cek internet dulu, kalau mati baru pakai lokal)
self.addEventListener('fetch', event => {
  if (event.request.url.includes('script.google.com')) return;
  
  event.respondWith(
    fetch(event.request).then(fetchResponse => {
      return caches.open(CACHE_NAME).then(cache => {
        if (!event.request.url.includes('chrome-extension')) {
          cache.put(event.request, fetchResponse.clone());
        }
        return fetchResponse;
      });
    }).catch(() => {
      // Kalau internet mati, ambil dari brankas memori
      return caches.match(event.request);
    })
  );
});
