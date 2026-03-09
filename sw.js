const CACHE_NAME = 'snooker-v3'; // ここを v2 に上げる
const ASSETS = [
  'index.html',
  'style.css',
  'script.js',
  'confetti.js',
  'manifest.json',
  'icon.png',
  'Player_Name_List.csv',
  'Snooker_app_manual_.pdf'
];

// インストール時にキャッシュを作成
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // 新しいSWをすぐに有効化させる
});

// 古いキャッシュを削除する処理を追加
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Old cache deleted:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});