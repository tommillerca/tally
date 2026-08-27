// Tally service worker: precache the app shell, runtime-cache heavy OCR assets.
const VERSION = 'tally-v458';
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
  './js/wanderer.js',
  './js/water.js',
  './js/talkbox.js',
  './data/boneheadz.js',
  './assets/fonts/bangers.woff2',
  /* BoldPixels: the dialogue face. 4KB. No surface renders a talk box since v418
     took Today's line off, so this is precached AHEAD of Gwart rather than for a
     screen that needs it today: the face has to be there the first time a box
     appears, and 4KB is not worth taking out and putting back. */
  './assets/fonts/boldpixels.woff2',
  './assets/brand/wordmark.png',
  /* GWART, the Shop's shopkeeper. 456KB for the pair, and they are precached
     because they ARE the Shop tab's header: a cold fetch means the panel paints
     its crimson glow with nobody standing in it, and his entrance is a 2.4s
     one-shot that has already played by the time a network image lands.
     THEY ARE THE 2048 MASTERS ON PURPOSE, and that was measured rather than
     assumed. The art is flat-shaded: 2,474 unique colours in the whole 2048
     square. A Lanczos downscale to 1440 interpolates that up to 12,932 colours,
     and the PNG comes out BIGGER than the master (479KB against 360KB). There
     is no smaller honest version at a smaller size. The 74% cut that does exist
     is a 256-colour quantise at full resolution (121KB for the pair), and that
     edits Cam's art — max delta 30/255 on 0.94% of pixels, alpha included — so
     it is Tom's call, not a build step. */
  './assets/gwart/gwart.png',
  './assets/gwart/gwart-stars.png',
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
  './assets/icons-pix/cauldron.png',
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
  './assets/icons-pix/herbs.png',
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
  './assets/icons-pix/water.png',
  './assets/icons-pix/bed.png',
  './assets/icons-pix/moon.png',
  './assets/icons-pix/scroll.png',
  './assets/icons-pix/dumbbell.png',
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
  // Bumbleseal, drawn on the Today hype banner, which is the DEFAULT screen: a
  // cold-cache miss is a hole in the first thing a player sees.
  './assets/bh/C/C6.png',
  './assets/bh/anim/lizard-amethyst/base.png',
  './assets/bh/anim/lizard-amethyst/lid.png',
  './assets/pit/gate-boneyard.webp',
  './assets/pit/gate-portal-mask.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

/* THE COMPLETENESS SENTINEL. Written LAST, and only if every entry above it
   arrived. Its presence in cache VERSION is this worker's promise that the
   cache holds ONE WHOLE BUILD, which is the only condition under which the
   shell may be served from it.
   It cannot be inferred from the cache merely existing. caches.open() creates
   the cache on its first line and the puts land one at a time, so an install
   that dies two thirds of the way through leaves a cache named VERSION holding
   two thirds of a build. Serving that cache-first is the mixed-version graph
   this whole change exists to prevent, and it is exactly the state
   tests/sw-upgrade-audit.mjs already measures on a deploy-time 404: "the
   half-filled cache EXISTS with N of the M listed entries". */
const READY = './__shell-ready__';

/* THE KILLSWITCH. Thirty bytes that are NEVER cached and NEVER served from
   cache. See checkStamp() below for why this file has to exist at all. */
const STAMP = './version.json';

/* The atomic set, as absolute urls, so a fetch can be tested against it in one
   Set lookup. ONLY these urls are ever answered from cache as shell. Anything
   else with a .js/.css/.json name is not part of the version this worker
   installed, so it keeps the old network-first road: a runtime-cached stray
   served cache-first would be a file from a DIFFERENT build sitting inside the
   atomic set, which is the mixing hole wearing a different hat. */
const PRECACHED = new Set(PRECACHE.map(u => new URL(u, self.location.href).href));

self.addEventListener('install', e => {
  // no-cache: revalidate against the server so a stale HTTP cache can't poison the precache
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(PRECACHE.map(u => fetch(new Request(u, { cache: 'no-cache' })).then(r => {
      if (r.ok) return c.put(u, r);
      throw new Error('precache ' + u + ' -> ' + r.status);
    })));
    await c.put(READY, new Response(VERSION, { headers: { 'Content-Type': 'text/plain' } }));
  })());
  /* AND NO skipWaiting(), WHICH IS THE ATOMIC SWAP.
     skipWaiting() activated the new worker underneath a page that had already
     executed the OLD module graph. From that moment every lazy import() the
     running page made was answered out of the NEW cache: two builds in one
     document. It was survivable only because app.js reloads the page on
     controllerchange, and that reload IS Tom's "it does a full reload after I
     have been away for a minute" (js/app.js: controllerchange -> location
     .reload, armed by reg.update() on every visibilitychange).
     Waiting instead means the new build takes over when the last client of the
     old one goes away, i.e. on the next open, with a document that runs one
     build end to end. The download still happens now, in the background; only
     the swap is deferred. Settings' "Get latest" (hardRefresh) is the manual
     lever for anyone who does not want to wait. */
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* IS THERE A WHOLE BUILD IN THERE. Memoised for the life of the worker: the
   answer cannot change under a running worker, because the only thing that
   writes READY is an install, and an install belongs to a DIFFERENT worker with
   a different VERSION and therefore a different cache. Not memoised it would be
   an async cache lookup in front of every single shell request, which is the
   cost this change exists to remove. */
let readyP = null;
/* .catch(() => false), and it is not decoration. caches.match with a cacheName
   that no longer exists is a REJECTION in some engines rather than an undefined,
   and site data cleared out from under a running worker is exactly how you get
   there. A rejection here would propagate out of shell(), respondWith would see
   a rejected promise, and the player would get a network error for index.html:
   a blank app, caused by the caching layer, which is the one failure this whole
   branch must not be able to produce. Degrade to the network instead. */
const shellReady = () => (readyP || (readyP = caches.match(READY, { cacheName: VERSION }).then(r => !!r).catch(() => false)));

/* THE ONE FILE THAT ALWAYS TOUCHES THE NETWORK, AND WHY IT HAS TO EXIST.
 *
 * A bad service worker is the only bug that survives its own fix being
 * deployed, because the broken worker is what decides whether the fix is ever
 * fetched. Everything below this line is cache-first; if that machinery is ever
 * wrong there is no lever left. So one file is carved out of it permanently.
 *
 * version.json is thirty bytes, is fetched with cache: 'no-store' (so neither
 * this cache nor the browser's HTTP cache can answer it), is never written to
 * any cache, and is excluded from the shell branch by name. When it names a
 * build other than the one this worker IS, the worker asks the browser for a
 * new sw.js, which is the full re-download: a new worker, a new install, a new
 * complete cache, and the old one deleted on activate.
 *
 * It is deliberately not sw.js itself. sw.js is ~12KB and the point of the
 * exercise is not paying for bytes on a bad connection; the stamp is the
 * cheapest possible question, asked at most once a minute.
 *
 * It is also the backstop for the case app.js cannot cover. js/app.js calls
 * reg.update() on visibilitychange, which does the same job, but that line
 * lives in the build the player is stuck on: if they are stranded on a build
 * whose app.js is broken, it is not running. This one is in the worker. */
let stampAt = 0;
function checkStamp() {
  if (Date.now() - stampAt < 60000) return;   // at most once a minute, and never awaited
  stampAt = Date.now();
  fetch(new Request(STAMP, { cache: 'no-store' }))
    .then(r => (r.ok ? r.json() : null))
    .then(j => {
      if (!j || !j.version || j.version === VERSION) return;
      /* THE NEW BUILD IS ALREADY ON THE DEVICE, IT IS JUST WAITING FOR THE LAST
         CLIENT OF THIS WORKER TO GO AWAY. Without this, a player who keeps the
         app open sees the stamp disagree every minute for as long as they leave
         it open, and every one of those calls re-fetches sw.js. That is a
         repeating cost on exactly the bad connection this branch exists to stop
         punishing, in service of an update that has already arrived. */
      if (self.registration.waiting || self.registration.installing) return;
      return self.registration.update();
    })
    .catch(() => { /* offline, or the stamp is not deployed yet: try again next minute */ });
}

/* THE APP SHELL, SERVED CACHE-FIRST OUT OF ONE COMPLETE VERSION.
 *
 * WHAT IT WAS. Every html, js, css and json file was fetched NETWORK-FIRST with
 * cache: 'no-cache', which forces revalidation against the server and bypasses
 * the browser's HTTP cache too. So every open of the app waited on the real
 * network for the whole module graph, every time, and the cache was never the
 * thing a player was served. Tom, item 18 of docs/FEEDBACK-2026-08-22-v424.md:
 * "The app is very sluggish on a bad connection like verrrrry sluggish". On a
 * bad connection that sentence IS this branch, and when iOS evicts the page
 * after a minute in the background the reload pays all of it again.
 *
 * WHAT IT PROTECTED, AND HOW THAT IS KEPT. Network-first was not paranoia: it
 * was there so a stale or poisoned cache entry could never get stuck being
 * served forever, and so a release could not land as a NEW index.html running
 * OLD modules. Both are kept, by version rather than by round trip:
 *   - the cache is named for the build (VERSION), install fills it all or not
 *     at all, and READY is written last, so a hit here can only ever come from
 *     one whole build;
 *   - only urls in PRECACHED are eligible, so a runtime-cached stray from some
 *     other build cannot be served as if it belonged to this one;
 *   - activate deletes every other tally-v* cache, so there is one;
 *   - and nothing is stuck, because checkStamp() above always reaches the
 *     network.
 * The trade that IS accepted: the visit a release lands on is served the old
 * build, whole, instantly, and the new one takes over on the next open. That is
 * the atomic swap, it is deliberate, and tests/sw-upgrade-audit.mjs grades it.
 * DO NOT "fix" that row by making the shell network-first again.
 *
 * Everything that follows the cache hit is the old network-first path, verbatim,
 * and it still runs for anything not in the atomic set and for any worker that
 * has not got a complete build yet (a first-ever open, or one whose install is
 * still in flight). */
async function shell(req) {
  const nav = req.mode === 'navigate';
  /* NAVIGATIONS ALWAYS READ './index.html', NOT THEIR OWN URL. A navigation
     carries whatever query and hash the player arrived with (#/boneyard, and
     index.html's dead-shell watchdog retries with ?bhgr=<now>), and none of
     those are cache keys. The precached shell is the answer for all of them:
     this is a single-page app and the hash is read by app.js after boot. */
  try {
    if ((nav || PRECACHED.has(req.url)) && await shellReady()) {
      const hit = await caches.match(nav ? './index.html' : req.url, { cacheName: VERSION });
      if (hit) return hit;
    }
  } catch { /* the cache is gone or unreadable: fall through to the network, never fail the request */ }
  // no-cache: force revalidation against the server (bypass the browser HTTP
  // cache) so a stale HTTP-cached copy can't keep the app pinned to old code.
  try {
    const res = await fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }));
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; }
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
    const hit = await caches.match(req);
    if (hit) return hit;
    if (nav) return (await caches.match('./index.html')) || res;
    return res;
  } catch {
    return (await caches.match(req)) || (await caches.match('./index.html'));
  }
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API calls go to network

  const p = url.pathname;
  /* THE KILLSWITCH IS NOT CACHEABLE BY ANY ROUTE, including a request the PAGE
     makes rather than this worker. Handled before anything else so no later
     branch can ever claim it. */
  if (p.endsWith('/version.json')) return;

  /* Fire-and-forget, on any same-origin GET rather than on navigations only: a
     resumed PWA never navigates again, and "away for a minute, come back" is
     precisely the case this has to cover. Throttled to once a minute inside. */
  checkStamp();

  const isVendor = p.includes('/vendor/');
  // App shell = the HTML + our own JS/CSS/JSON. Heavy, rarely-changing binaries
  // (fonts, images, vendor libs) are cache-first below for speed + offline.
  const isShell = !isVendor && (e.request.mode === 'navigate' || /\.(?:js|mjs|css|json)$/.test(p));

  if (isShell) { e.respondWith(shell(e.request)); return; }

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
