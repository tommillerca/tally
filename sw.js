// Tally service worker: precache the app shell, runtime-cache heavy OCR assets.
const VERSION = 'tally-v152';
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
  './js/changelog.js',
  './js/cooking.js',
  './js/geo.js',
  './js/hunt.js',
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
  './vendor/maplibre/maplibre.mjs',
  './vendor/maplibre/maplibre-gl.js',
  './vendor/maplibre/maplibre-gl.css',
  './assets/map/boneheadz-style.json',
  './js/map.js',
  './js/poi.js',
  './js/gear.js',
  './js/pets.js',
  './js/gateintro.js',
  './js/wheel.js',
  './js/walk.js',
  './js/icons-pack.js',
  './js/social.js',
  './js/names.js',
  './js/energy.js',
  './js/wellness.js',
  './js/analytics.js',
  './js/petanim.js',
  './js/notify.js',
  './assets/bh/C/shiny/C1.png',
  './assets/bh/C/shiny/C2.png',
  './assets/bh/C/shiny/C3.png',
  './assets/bh/C/shiny/C4.png',
  './assets/bh/C/shiny/C5.png',
  './assets/pit/gate-boneyard.webp',
  './assets/pit/gate-portal-mask.png',
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
