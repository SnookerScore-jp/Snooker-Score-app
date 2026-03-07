const CACHE_NAME = 'snooker-v1';
const ASSETS = [
  'index.html',
  'style.css',
  'script.js',
  'confetti.js',
  'manifest.json'
];

// インストール時にファイルをキャッシュする
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// オフライン時はキャッシュから読み込む
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});