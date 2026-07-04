// Tally service worker: precache the app shell, runtime-cache heavy OCR assets.
const VERSION = 'tally-v19';
const PRECACHE = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/db.js',
  './js/nutrition.js',
  './js/labelparse.js',
  './js/sources.js',
  './js/scanner.js',
  './js/ocr.js',
  './js/game.js',
  './js/fx.js',
  './js/loot.js',
  './js/quests.js',
  './js/hunt.js',
  './js/road.js',
  './js/native.js',
  './js/pit.js',
  './data/boneheadz.js',
  './assets/fonts/bangers.woff2',
  './assets/brand/wordmark.png',
  './assets/brand/logo.png',
  './assets/brand/tombstone.png',
  './assets/brand/sword.png',
  './assets/brand/tomb.png',
  './assets/brand/quest-map.png',
  './assets/shortcut/Sync-Boneheadz.shortcut',
  './icons/maskable-512.png',
  './data/generic-foods.js',
  './vendor/zbar/zbar.mjs',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  // no-cache: revalidate against the server so a stale HTTP cache can't poison the precache
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(PRECACHE.map(u => fetch(new Request(u, { cache: 'no-cache' })).then(r => {
        if (r.ok) return c.put(u, r);
        throw new Error('precache ' + u + ' -> ' + r.status);
      }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API calls go to network

  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then(hit => hit || fetch(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
        }
        return res;
      });
    })
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
