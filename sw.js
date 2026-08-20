// Tally service worker: precache the app shell, runtime-cache heavy OCR assets.
const VERSION = 'tally-v421';
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
  './js/icons-pix.js',
  /* THESE THREE WERE MISSING AND IT COST A NEW PLAYER THE WHOLE APP.
     app.js reaches 41 modules; this list carried 38. haptics.js, bosses.js and
     wraith-fx.js are STATIC imports of app.js, so if any one of them fails to
     arrive the entire module graph dies and index.html's shell paints alone:
     the gear button and the tab bar with nothing behind them. That is the
     screenshot from a TestFlight user on one bar of LTE, 2026-08-12, who could
     not get past it.
     It is worse than a normal missing asset because of the fallback at the
     bottom of this file: a js request that misses the network AND the cache is
     answered with index.html, and a module served text/html is a hard load
     error, so a flaky moment can persist instead of recovering.
     Reproduced against LIVE with one module blocked on a fresh profile: 155
     characters of screen content became 0 with the gear still painted.
     tests/precache-audit.mjs now fails if this list ever falls behind the
     module graph again, so the next module cannot be forgotten quietly. */
  './js/haptics.js',
  './js/bosses.js',
  './js/wraith-fx.js',
  './js/crate-fx.js',
  './js/loot.js',
  './js/quests.js',
  './js/changelog.js',
  './js/cooking.js',
  './js/geo.js',
  './js/hunt.js',
  './js/native.js',
  './js/pit.js',
  './js/mimic.js',
  './js/talkbox.js',
  './data/boneheadz.js',
  './assets/fonts/bangers.woff2',
  /* BoldPixels: the dialogue face. 4KB. No surface renders a talk box since v418
     took Today's line off, so this is precached AHEAD of Gwart rather than for a
     screen that needs it today: the face has to be there the first time a box
     appears, and 4KB is not worth taking out and putting back. */
  './assets/fonts/boldpixels.woff2',
  './assets/brand/wordmark.png',
  /* The common crate's 9 authored frames. The whole sequence runs inside a
     260ms window, so a cold fetch mid-open paints a blank frame. Precached
     rather than left to the runtime cache for that reason. 36KB for all 9. */
  /* 976 KB, and it never plays until the player unmutes, so it is precached
     for the visit AFTER they turn it on rather than fetched mid-scene. */
  './assets/audio/morning-dew-loop.m4a',
  /* Tom's 48px currency set. 16px is the floor: at 12 the coin is a dot and
     the eggs are a smear, which he confirmed looking at the render. Clean
     steps from 48 are 12, 16, 24, 48. */
  './assets/icons-pix/coin.png',
  './assets/icons-pix/dust.png',
  './assets/icons-pix/egg.png',
  './assets/icons-pix/egg-24.png',
  './assets/icons-pix/egg-basic.png',
  './assets/icons-pix/crate.png',
  './assets/icons-pix/bone-dust.png',
  './assets/icons-pix/pit.png',
  './assets/icons-pix/wardrobe.png',
  './assets/icons-pix/shop.png',
  './assets/icons-pix/build.png',
  './assets/icons-pix/battle-charm.png',
  './assets/icons-pix/vigor-draught.png',
  './assets/icons-pix/stable.png',
  './assets/icons-pix/kitchen.png',
  './assets/icons-pix/ectoplasm.png',
  './assets/icons-pix/marrow.png',
  './assets/icons-pix/graveroot.png',
  './assets/icons-pix/ember.png',
  './assets/icons-pix/bog.png',
  './assets/icons-pix/sinew.png',
  './assets/icons-pix/salt.png',
  './assets/icons-pix/dish-broth.png',
  './assets/icons-pix/dish-hash.png',
  './assets/icons-pix/dish-stew.png',
  './assets/icons-pix/dish-skewer.png',
  './assets/icons-pix/dish-fajita.png',
  './assets/icons-pix/dish-feast.png',
  './assets/icons-pix/dish-kibble.png',
  './assets/icons-pix/potion.png',
  './assets/icons-pix/badge-skull.png',
  './assets/icons-pix/badge-trophy.png',
  './assets/icons-pix/badge-crown.png',
  './assets/icons-pix/badge-signpost.png',
  './assets/icons-pix/badge-footprint.png',
  './assets/icons-pix/star.png',
  './assets/icons-pix/bone.png',
  './assets/icons-pix/paw.png',
  './assets/icons-pix/bolt.png',
  './assets/icons-pix/sparkle.png',
  './assets/icons-pix/tombstone.png',
  './assets/icons-pix/recipe.png',
  './assets/icons-pix/potion-vital.png',
  './assets/icons-pix/potion-fury.png',
  './assets/icons-pix/potion-stone.png',
  './assets/icons-pix/potion-wind.png',
  './assets/crates/common/f0.png',
  './assets/crates/common/f0-24.png',
  './assets/crates/common/f1.png',
  './assets/crates/common/f2.png',
  './assets/crates/common/f3.png',
  './assets/crates/common/f4.png',
  './assets/crates/common/f5.png',
  './assets/crates/common/f6.png',
  './assets/crates/common/f7.png',
  './assets/crates/common/f8.png',
  /* the Golden crate's three authored bone-chest states, same reason */
  './assets/crates/golden/f0.png',
  './assets/crates/golden/f0-24.png',
  /* The Step Egg hatch, all fifteen frames. None of these were precached when
     the sequence shipped, so the animation was fetching frames from the network
     while it played. 64K for the set. */
  './assets/eggs/step/f1.png',
  './assets/eggs/step/f2.png',
  './assets/eggs/step/f3.png',
  './assets/eggs/step/f4.png',
  './assets/eggs/step/f5.png',
  './assets/eggs/step/f6.png',
  './assets/eggs/step/f7.png',
  './assets/eggs/step/f8.png',
  './assets/eggs/step/f9.png',
  './assets/eggs/step/f10.png',
  './assets/eggs/step/f11.png',
  './assets/eggs/step/f12.png',
  './assets/eggs/step/f13.png',
  './assets/eggs/step/f14.png',
  './assets/eggs/step/f15.png',
  './assets/crates/golden/f1.png',
  './assets/crates/golden/f2.png',
  './assets/brand/logo.png',
  './assets/brand/tombstone.png',
  './assets/brand/sword.png',
  './assets/brand/tomb.png',
  './assets/brand/quest-map.png',
  './assets/bh/fx/jab/jab1.png',
  './assets/bh/fx/jab/jab2.png',
  './assets/bh/fx/jab/jab3.png',
  './assets/bh/fx/jab/basic1.png',
  './assets/bh/fx/jab/basic2.png',
  './assets/bh/fx/jab/basic3.png',
  './assets/bh/fx/swing/swing1.png',
  './assets/bh/fx/swing/swing2.png',
  './assets/bh/fx/swing/swing3.png',
  './assets/bh/fx/heckle/dark1.png',
  './assets/bh/fx/heckle/dark2.png',
  './assets/bh/fx/heckle/bone1.png',
  './assets/bh/fx/heckle/bone2.png',
  './assets/bh/mage/mage.png',
  // Cam's lightning layers, cut from mage-fx.png: his casts are drawn with these,
  // so a cold cache must not fire a spell with no spell in it
  './assets/bh/mage/fx/bolt-tall.png',
  './assets/bh/mage/fx/bolt-sweep.png',
  './assets/bh/mage/fx/bolt-strike.png',
  './assets/bh/mage/fx/bolt-thin.png',
  './assets/bh/mage/fx/zigzag.png',
  './assets/bh/mage/fx/sparks.png',
  './assets/bh/mage/mage-fight.png',   // a hand-drawn boss: a cold-cache miss shows a broken image where a monster should be
  // the two bosses added with the Mimic. Same rule as the line above: a
  // cold-cache miss draws a broken image where a monster should be.
  './assets/bh/mimic/mimic.png',
  './assets/bh/mimic/mimic-eyes-2.png',
  './assets/bh/mimic/mimic-eyes-3.png',
  './assets/bh/mimic/mimic-loop.gif',   // the reveal IS this file; without it the chest never opens
  './assets/bh/wanderer/wanderer.png',
  './assets/bh/glutton/idle.png',
  './assets/bh/glutton/tongue.png',
  './assets/bh/glutton/middle.png',
  './assets/bh/glutton/bub0.png',
  './assets/bh/glutton/bub1.png',
  './assets/bh/glutton/bub2.png',
  './assets/bh/glutton/bub3.png',
  // the COMBAT plates, which are what the arena actually renders. Only the
  // hero/portrait set was listed, so the boss loaded over the network at fight
  // start and was invisible for the opening moves on a cold cache.
  './assets/bh/glutton/combat/idle.png',
  './assets/bh/glutton/combat/tongue.png',
  './assets/bh/glutton/combat/middle.png',
  './js/glutton.js',
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
  './js/spires.js',
  './js/garden.js',
  /* The Hollow's three modules. openHollow imports all of them, so a single
     failed fetch of any one is a blank app, which is exactly what
     precache-audit caught before this shipped. */
  './js/hollow-art.js',
  './js/hollow-beds.js',
  './js/hollow-scene.js',
  './js/gear.js',
  './js/pets.js',
  './js/paddock.js',
  './js/paddock-cards.js',
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
  './assets/bh/C/CX.png',
  './assets/bh/anim/lizard-amethyst/base.png',
  './assets/bh/anim/lizard-amethyst/lid.png',
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

  const p = url.pathname;
  const isVendor = p.includes('/vendor/');
  // App shell = the HTML + our own JS/CSS/JSON. Served NETWORK-FIRST so a new
  // deploy is picked up the moment the device is online, and so a stale/poisoned
  // cache entry can never get stuck being served forever. Cache is the offline
  // fallback only. Heavy, rarely-changing binaries (fonts, images, vendor libs)
  // stay cache-first for speed + offline.
  const isShell = !isVendor && (e.request.mode === 'navigate' || /\.(?:js|mjs|css|json)$/.test(p));

  if (isShell) {
    // no-cache: force revalidation against the server (bypass the browser HTTP
    // cache) so a stale HTTP-cached copy can't keep the app pinned to old code.
    e.respondWith(
      fetch(new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })).then(async res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return res; }
        /* A 404 IS A RESPONSE, AND RETURNING IT KILLS THE APP.
           Only a THROWN fetch reached the .catch below, so an offline device was
           handled and an online device receiving one bad status was not: the
           status was handed to the page as the answer. Measured by
           tests/sw-upgrade-audit.mjs: with js/app.js answering 404 and a good
           14,480-byte cached copy sitting unused, the player got a new
           index.html, a new app.css, no app.js at all and #screen with zero
           children. The SAME device with the network fully removed booted fine,
           which is the tell: it failed BECAUSE it was online.
           One bad file during a deploy now falls back to the last good copy of
           that file instead of taking the app down. */
        const hit = await caches.match(e.request);
        if (hit) return hit;
        if (e.request.mode === 'navigate') return (await caches.match('./index.html')) || res;
        return res;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // static assets: cache-first
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }))
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});
