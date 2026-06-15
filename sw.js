const CACHE_NAME = 'screamous-pos-v1';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './logo.png'
];

// 1. Saat pertama kali aplikasi dibuka, simpan file dasar ke memori lokal
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// 2. Saat internet mati, panggil file dari memori lokal
self.addEventListener('fetch', event => {
  // PENGECUALIAN: Jangan cache proses kirim data ke Google Sheets
  if (event.request.url.includes('script.google.com')) return;
  
  event.respondWith(
    caches.match(event.request).then(response => {
      // Jika ada di memori lokal, pakai yang lokal.
      // Jika tidak ada (misal library Bootstrap/SweetAlert), ambil dari internet lalu otomatis simpan ke memori lokal untuk cadangan
      return response || fetch(event.request).then(fetchResponse => {
        return caches.open(CACHE_NAME).then(cache => {
          if (!event.request.url.includes('chrome-extension')) {
            cache.put(event.request, fetchResponse.clone());
          }
          return fetchResponse;
        });
      });
    }).catch(() => {
      console.log("Internet mati dan file belum masuk cache.");
    })
  );
});
