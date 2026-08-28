/* EVERY MARKER LANDS WHERE THE MAP PUT IT.
 *
 * MapLibre places a marker by writing a transform onto a root it has already
 * taken out of flow: `.maplibregl-marker { left: 0; top: 0; position: absolute }`
 * in vendor/maplibre/maplibre-gl.css. That rule is ONE CLASS, so any other
 * one-class rule that names a marker root and lands later in the head beats it,
 * the element goes back into normal flow, and the transform is then applied
 * from wherever the flow put it instead of from the map's origin. Nothing
 * throws. The marker is drawn, it is the right marker, it is simply not on the
 * ground it belongs to.
 *
 * THE BUG THIS WAS WRITTEN FOR, measured on the real Boneyard 2026-08-23.
 * js/wanderer.js injects its stylesheet at runtime and js/map.js loads
 * maplibre-gl.css lazily, so the Wanderer's block landed AFTER it and its
 * `position: relative` won. Absolute siblings take no space, so the FIRST
 * Wanderer was still correct (flow origin and map origin are the same point)
 * and every one after him stacked below the last by his own height: offsetTop
 * 0 / 200 / 400 with three of them up, boxes 200 px and 400 px below the point
 * the map had placed, which is 262 m and 522 m of ground at MAP_START_ZOOM.
 * His cone and inWandererCone both read his TRUE position, so on every
 * Wanderer but the first the light a player could see was not the light that
 * caught them, and it is invisible whenever only one of them is in range,
 * which is the common case.
 *
 * WHY THE ROWS ARE SHAPED LIKE THIS.
 *   ANCHORED  is the geometric invariant, and it is graded against MapLibre's
 *             OWN answer: the marker's inline transform is where the map put
 *             it, so the box has to be there too, margins and anchor
 *             percentages included. It covers EVERY marker on the screen
 *             rather than the Wanderer, because the cause is a cascade order
 *             that any marker class can walk into.
 *   GROUND    is the end of the chain, in the unit the player experiences: the
 *             drawn box, unprojected through the map's own camera, against the
 *             metre js/app.js handed the marker. A pixel row alone would let a
 *             right-looking number stand for a man standing somewhere else.
 *   CONTROL   is rule 2 in the run itself. The shipped CSS is measured, then
 *             `position: relative` is put BACK on the Wanderer root from a
 *             later stylesheet, the same markers are measured again, and the
 *             instrument has to report the stack. A green ANCHORED from a
 *             measurement that cannot see a displaced marker is worth nothing,
 *             and this repo has shipped exactly that twice.
 *   INJECTED  is the class, statically, on every machine. app.css also gives
 *             its marker roots `position: relative` and is SAFE, for one
 *             reason only: it is a <link> in the head of index.html, so the
 *             lazily-appended maplibre-gl.css always lands after it and wins.
 *             It has to stay relative, too, because the map key reuses
 *             .map-spawn / .map-den-mark / .map-mini-mark off the map
 *             (legendHtml in js/app.js), where there is no MapLibre to
 *             position them. A stylesheet injected from JS has the opposite
 *             fate: it can only ever land after maplibre-gl.css, so it is the
 *             one place this mistake is unconditional. ORDER asserts that
 *             premise instead of assuming it.
 * The marker-root class list is DERIVED from POI_CLASSES in js/map.js, so a
 * marker kind added next year is covered the day it is registered rather than
 * the day somebody remembers this file.
 *
 * NEEDS A MAP. MapLibre needs WebGL and a reachable vector tile host; without
 * them every live row here would be graded against a blank screen and pass on
 * nothing, so the capability is measured and the rows report UNPROVEN with
 * exit 97, the same contract tests/wanderer-despawn-audit.mjs runs under. The
 * static half runs everywhere.
 *
 * PROVE-RED, 2026-08-23. Throwaway copy of the tree with .git removed, one
 * mutation at a time, exit code read from a FILE and never through a pipe.
 * Every one exited 1 and only the rows named went red.
 *   RELATIVE-BACK   js/wanderer.js .map-wanderer-mark put back to
 *     "position: relative", which is the shipped bug -> INJECTED
 *     "js/wanderer.js gives .map-wanderer-mark position: relative", ANCHORED
 *     "2 of 25 marker(s) are not where the map put them: map-wanderer-mark
 *     off by 0,200 px (position: relative); map-wanderer-mark off by 0,400 px"
 *     and GROUND "worst 474.5 m from the position the map was given ... per
 *     marker 2460_-6158_i25 1.7m, 2460_-6159_i25 238.2m, 2461_-6158_i25
 *     474.5m". The first Wanderer stayed correct in that line, which is the
 *     whole reason this shipped. Green on the same tree: worst offset 0.00 px,
 *     worst 2.4 m of ground.
 *   INSTRUMENT-BLIND  the CONTROL stylesheet injection replaced with a comment
 *     so the row grades an unmutated page -> CONTROL "NOTHING moved when the
 *     bug was injected, so this measurement cannot see it", every other row
 *     green. That is what a blind instrument looks like from here.
 *   VENDOR-IN-HEAD  a maplibre-gl.css <link> added to index.html above app.css
 *     -> ORDER red on its own. The live rows stayed green, and honestly so:
 *     js/map.js keys its lazy load on link[data-maplibre], so it appended its
 *     own copy last anyway and the cascade was unchanged. ORDER is a premise
 *     row, not a second measurement of the same fact, and it is the only thing
 *     in the file that would notice the exemption going stale.
 *   CLASS-DROPPED   map-wanderer-mark removed from POI_CLASSES in js/map.js ->
 *     SAMPLE "6: map-spawn, map-den-mark, map-mini-mark, map-spire,
 *     map-glutton-mark, map-you". A marker kind that leaves the app own list
 *     silently narrows INJECTED to nothing, so the coverage is graded rather
 *     than assumed.
 *
 *   node tests/marker-anchor-audit.mjs        (self-serves this checkout)
 *   URL=https://... node tests/marker-anchor-audit.mjs
 */
import path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, boneyardCapability, unproven, unprovenReport,
  exitFor, unclassifiedRows } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  | ' + d : ''}`); if (!p) fails = 1; };

/* ------------------------------------------------------------------ static */

/* THE MARKER ROOTS, FROM THE APP. 2026-08-23, the day the Wanderer stack was
   found. POI_CLASSES is js/map.js's own list of the classes it hands to
   MapLibre (it uses them for the arrival hold), and .map-you is the player's
   own marker, which is built in js/app.js and is not in that list. Derived
   rather than typed out so a new marker kind is covered the day it is
   registered; SAMPLE fails if the parse ever stops finding the list. */
const mapSrc = readFileSync(path.join(ROOT, 'js', 'map.js'), 'utf8');
const poiLine = mapSrc.match(/const POI_CLASSES\s*=\s*\[([^\]]*)\]/);
const ROOTS = [...new Set([...(poiLine ? poiLine[1].matchAll(/'([^']+)'/g) : [])].map(m => m[1]).concat('map-you'))];
ok('SAMPLE the marker-root classes were read out of js/map.js, not typed in here',
  ROOTS.length >= 6 && ROOTS.includes('map-wanderer-mark') && ROOTS.includes('map-you'),
  `${ROOTS.length}: ${ROOTS.join(', ')}`);

/* THE PREMISE UNDER THE EXEMPTION BELOW. app.css may give a marker root
   position: relative only because maplibre-gl.css is appended to the head at
   runtime and therefore always wins the tie. If the vendor sheet were ever
   moved into index.html above app.css, every one of those roots would break
   the same way the Wanderer did and this lint would be exempting the bug. */
const indexSrc = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const appLinked = /<link[^>]+href="app\.css"/.test(indexSrc);
const vendorInHead = /maplibre-gl\.css/.test(indexSrc);
const vendorAppended = /maplibre-gl\.css[\s\S]{0,400}?document\.head\.appendChild/.test(mapSrc);
ok('ORDER app.css is a head link and maplibre-gl.css is appended at runtime, so app.css can never win',
  appLinked && !vendorInHead && vendorAppended,
  `app.css linked in index.html: ${appLinked}; maplibre-gl.css named in index.html: ${vendorInHead}; appended by js/map.js: ${vendorAppended}`);

/* A stylesheet injected from JS lands after maplibre-gl.css unconditionally, so
   a one-class rule on a marker root in one of these is the bug by construction.
   Only the BARE root selector is read: `.map-wanderer-mark.charging img` and
   friends are inside the marker and are none of MapLibre's business.
   WHAT IT CANNOT SEE, said rather than implied: it finds stylesheets by the
   `createElement('style')` that builds them, which is how every runtime
   stylesheet in this app is made (js/wanderer.js, js/mimic.js, js/walk.js and
   four others). CSS smuggled in through insertRule or an existing sheet would
   pass this row, and would still be caught live by ANCHORED. */
const jsFiles = readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));
const offenders = [];
let rulesSeen = 0;
for (const f of jsFiles) {
  const src = readFileSync(path.join(ROOT, 'js', f), 'utf8');
  if (!/createElement\('style'\)|createElement\("style"\)/.test(src)) continue;
  for (const cls of ROOTS) {
    for (const m of src.matchAll(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`, 'g'))) {
      rulesSeen++;
      const pos = m[1].match(/(?:^|[;{\s])position\s*:\s*([a-z-]+)/);
      if (pos && pos[1] !== 'absolute') offenders.push(`js/${f} gives .${cls} position: ${pos[1]}`);
    }
  }
}
ok('SAMPLE the injected-stylesheet scan really found marker-root rules to read',
  rulesSeen > 0, `${rulesSeen} bare marker-root rule(s) in runtime-injected stylesheets`);
ok('INJECTED no runtime-injected stylesheet takes a marker root out of MapLibre hands',
  offenders.length === 0,
  offenders.length ? offenders.join(' | ') + '  (this lands after maplibre-gl.css and puts the marker back in flow)'
    : `${rulesSeen} rule(s) checked, all absolute or silent on position`);

/* -------------------------------------------------------------------- live */

/* THE TWO ROW GROUPS, 2026-08-23. Which rows need a live map and which run
   anywhere: without this split a machine with no WebGL grades the live rows
   against a blank screen and passes on an empty set. Every row name in this
   file must appear in exactly one of them, which ROWS-CLASSIFIED enforces off
   the file's own source. */
const MAP_ROWS = [
  'SAMPLE the Boneyard drew markers to measure',
  'STACKABLE two or more Wanderers are drawn at once, which is where this bug lives',
  'ANCHORED every marker box lands where MapLibre placed it',
  'GROUND every Wanderer marker sits on the metre the map was given',
  'CONTROL the measurement goes red when the markers are put back into flow',
];
/* The other half of that split, 2026-08-23: source-only rows, graded on every
   machine including the ones that cannot draw a map. */
const STATIC_ROWS = [
  'SAMPLE the marker-root classes were read out of js/map.js, not typed in here',
  'ORDER app.css is a head link and maplibre-gl.css is appended at runtime, so app.css can never win',
  'SAMPLE the injected-stylesheet scan really found marker-root rules to read',
  'INJECTED no runtime-injected stylesheet takes a marker root out of MapLibre hands',
  'ROWS-CLASSIFIED every assertion in this file is declared map-dependent or static',
];
const cls = unclassifiedRows(import.meta.url, [MAP_ROWS, STATIC_ROWS]);
ok('ROWS-CLASSIFIED every assertion in this file is declared map-dependent or static',
  cls.missing.length === 0 && cls.seen > 0,
  cls.missing.length ? `unclassified: ${cls.missing.join(' | ')}` : `${cls.seen} row names read from this file`);

const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
console.log(`URL UNDER TEST  ${base}`);
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const HOME = { latitude: 49.2827, longitude: -123.1207 };

/* ONE READ, so the three facts cannot be about different moments: he walks
   continuously and the map rebuilds his marker every 5 seconds, so the derived
   set has to be re-derived at the instant the boxes are measured.
   Expected position is MapLibre's own transform, decomposed: the anchor is a
   percentage translate of the element's own box, the placement is a pixel
   translate, and a marker root may carry a margin (.map-spire has 24px of one),
   which shifts an absolutely positioned box on top of left/top: 0. */
const measure = (page, at) => page.evaluate(async (at) => {
  const W = await import('./js/wanderer.js');
  const water = await import('./js/water.js');
  const { dateKey } = await import('./js/nutrition.js');
  const map = window.__map;
  if (!map) return { error: 'no window.__map on the page' };
  const cont = map.getContainer().getBoundingClientRect();
  const R = 6371000, rad = Math.PI / 180;
  const distM = (a, b, c, d) => {
    const dLat = (c - a) * rad, dLng = (d - b) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  /* DERIVED THE WAY js/app.js DERIVES, WITH THE LAND ORACLE, or this row measures
     the oracle instead of the marker. wandererAt runs landCandidate, a seeded
     fallback that reseeds a Wanderer's beat CENTRE when his lap crosses water,
     and the candidate index is NOT part of his id. So an oracle-free
     wanderersNear returns the RIGHT ID AT THE WRONG PLACE, and GROUND then
     compares a marker MapLibre placed correctly against a position the app never
     used. That is the whole of this row's history: 1.9 m on one run, 549.6 m on
     another, 1331.1 m on a third, on markers that never moved.
     ensureWater first because the oracle is only as good as its tiles: water.js
     caps its cache at MAX_TILES 64 and evicts mid-pass, so a cold read falls back
     exactly as if the cell were dry. Same lattice and same reason as
     godmode.js's realWanderer. */
  const pts = [];
  for (let a = -4; a <= 4; a++) for (let b = -4; b <= 4; b++) pts.push([at.lat + a * 0.008, at.lng + b * 0.008]);
  await water.ensureWater(pts, 20000);
  const near = new Map(W.wanderersNear(dateKey(), at.lat, at.lng, undefined, water.isWater).map(w => [w.id, w]));
  const rows = [];
  for (const el of document.querySelectorAll('.maplibregl-marker')) {
    const t = el.style.transform || '';
    const pct = t.match(/translate\((-?[\d.]+)%,\s*(-?[\d.]+)%\)/);
    const px = t.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
    const op = el.offsetParent;
    if (!pct || !px || !op) { rows.push({ kind: el.className, unreadable: t || '(no transform)' }); continue; }
    const pr = op.getBoundingClientRect(), r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const dx = r.left - (pr.left + (parseFloat(cs.marginLeft) || 0) + (+px[1]) + (+pct[1]) / 100 * r.width);
    const dy = r.top - (pr.top + (parseFloat(cs.marginTop) || 0) + (+px[2]) + (+pct[2]) / 100 * r.height);
    const row = { kind: (el.className.match(/map-[\w-]+/) || ['?'])[0], position: cs.position,
      dx: +dx.toFixed(2), dy: +dy.toFixed(2) };
    const w = el.dataset.w && near.get(el.dataset.w);
    if (w) {
      const c = map.unproject([r.left + r.width / 2 - cont.left, r.top + r.height / 2 - cont.top]);
      /* the same read for the point MapLibre was GIVEN, so the honest baseline
         (he moves while the marker waits for the next 5-second refresh) is on
         the record next to the error rather than hidden inside the tolerance */
      const p = map.unproject([pr.left + (+px[1]) - cont.left, pr.top + (+px[2]) - cont.top]);
      row.id = w.id;
      row.drawnM = +distM(w.lat, w.lng, c.lat, c.lng).toFixed(1);
      row.placedM = +distM(w.lat, w.lng, p.lat, p.lng).toFixed(1);
    }
    rows.push(row);
  }
  return { rows, wanderers: rows.filter(r => r.id).length };
}, at);

const { browser, page } = await boot(base, { args: GL });
let cap = null;
try {
  await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setGeolocation(HOME);
  cap = await boneyardCapability(page);
  if (!cap.ok) {
    for (const n of MAP_ROWS) unproven(n, 'this machine cannot draw the Boneyard');
  } else {
    await seed(page, { level: 18, coins: 500 });
    /* STAND WHERE THE BUG CAN EXIST (anti-regression rule 4). One Wanderer
       cannot show a stack: the first one is at flow origin and reads perfectly
       either way, which is why this shipped. The set is a pure function of
       (date, cell, clock), so the spot is SEARCHED for rather than hardcoded,
       and a date that offers nobody a crowd is declared, never passed. */
    /* THE SEARCH AND THE GRADING MUST AGREE ABOUT WHO IS OUT THERE, and until
       tonight they did not. GROUND grades with the land oracle (that fix is what
       stopped it measuring the oracle instead of the marker), while this search
       ran WITHOUT it for cost: warming water tiles at every point of a 41x41
       lattice would take far longer than the whole suite. The result was a spot
       where three Wanderers derive dry and NONE derive once the water constraint
       applies, and the run failed with "0 Wanderer marker(s) matched to a derived
       instance" on an app that was fine.
       So the sweep stays cheap and oracle-free to find CANDIDATES, and then the
       few best candidates are CONFIRMED with the oracle, warming tiles only for
       those. A candidate that does not survive the constraint is not a failure,
       it is not a spot. */
    const spot = await page.evaluate(async (HOME) => {
      const W = await import('./js/wanderer.js');
      const water = await import('./js/water.js');
      const { dateKey } = await import('./js/nutrition.js');
      const date = dateKey();
      const cands = [];
      for (let dy = -20; dy <= 20; dy++) for (let dx = -20; dx <= 20; dx++) {
        const lat = HOME.latitude + dy * 0.004, lng = HOME.longitude + dx * 0.006;
        const n = W.wanderersNear(date, lat, lng);
        if (n.length >= 3) { cands.push({ lat, lng, bare: n.length }); if (cands.length >= 12) break; }
      }
      for (const c of cands) {
        const pts = [];
        for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) pts.push([c.lat + a * 0.008, c.lng + b * 0.008]);
        await water.ensureWater(pts, 8000).catch(() => {});
        const wet = W.wanderersNear(date, c.lat, c.lng, undefined, water.isWater);
        if (wet.length >= 2) return { lat: c.lat, lng: c.lng, n: wet.length, bare: c.bare, tried: cands.length };
      }
      return null;
    }, HOME);
    if (!spot) {
      const why = 'no point near HOME has two Wanderers in range on this date ONCE THE LAND CONSTRAINT APPLIES (the set is date-seeded, and candidates that derive dry can be all-water)';
      for (const n of MAP_ROWS) unproven(n, why);
    } else {
      console.log(`STANDING AT  ${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}  (${spot.n} Wanderers derived)`);
      await page.setGeolocation({ latitude: spot.lat, longitude: spot.lng });
      await page.evaluate(() => { location.hash = '#/boneyard'; });
      await sleep(2500);
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
        if (b) b.click();
      });
      await sleep(10000);

      const m = await measure(page, spot);
      if (m.error) {
        for (const n of MAP_ROWS) ok(n, false, m.error);
      } else {
        const readable = m.rows.filter(r => !r.unreadable);
        ok('SAMPLE the Boneyard drew markers to measure',
          readable.length >= 5 && !m.rows.some(r => r.unreadable),
          `${readable.length} marker(s) read` + (m.rows.some(r => r.unreadable) ? `, ${m.rows.filter(r => r.unreadable).length} with no readable transform` : ''));
        ok('STACKABLE two or more Wanderers are drawn at once, which is where this bug lives',
          m.wanderers >= 2, `${m.wanderers} Wanderer marker(s) matched to a derived instance`);

        const off = readable.filter(r => Math.abs(r.dx) > 1 || Math.abs(r.dy) > 1);
        ok('ANCHORED every marker box lands where MapLibre placed it',
          readable.length > 0 && off.length === 0,
          off.length ? `${off.length} of ${readable.length} marker(s) are not where the map put them: `
            + off.map(r => `${r.kind} off by ${r.dx},${r.dy} px (position: ${r.position})`).join('; ')
            : `${readable.length} marker(s), worst offset ${Math.max(0, ...readable.map(r => Math.max(Math.abs(r.dx), Math.abs(r.dy)))).toFixed(2)} px`);

        /* 15 m of tolerance is the walk, not slack: the marker is placed on the
           map's 5-second refresh and he keeps walking at up to 0.51 m/s, so the
           point he was GIVEN is already a couple of metres behind him by the
           time this reads it. placedM is that drift with the box taken out of
           it, and it is printed on every run so the two cannot be confused. */
        const wand = readable.filter(r => r.id);
        const worst = wand.length ? Math.max(...wand.map(r => r.drawnM)) : null;
        ok('GROUND every Wanderer marker sits on the metre the map was given',
          wand.length >= 2 && worst !== null && worst <= 15,
          wand.length ? `worst ${worst} m from the position the map was given `
            + `(the same read for MapLibre own placement, which is his walk since the last refresh: `
            + `${Math.max(...wand.map(r => r.placedM))} m); per marker `
            + wand.map(r => `${r.id} ${r.drawnM}m`).join(', ')
            : 'no Wanderer marker could be matched to a derived instance');

        /* RULE 2, IN THE RUN. Put the bug back from a later stylesheet (one
           class, appended last, so it beats js/wanderer.js exactly the way
           js/wanderer.js beat maplibre-gl.css) and require the instrument to
           report the stack. Then take it away again. */
        await page.evaluate(() => {
          const s = document.createElement('style');
          s.id = 'marker-anchor-control';
          s.textContent = '.map-wanderer-mark { position: relative; }';
          document.head.appendChild(s);
        });
        await sleep(400);
        const bug = await measure(page, spot);
        await page.evaluate(() => { document.getElementById('marker-anchor-control')?.remove(); });
        const moved = (bug.rows || []).filter(r => !r.unreadable && (Math.abs(r.dx) > 50 || Math.abs(r.dy) > 50));
        ok('CONTROL the measurement goes red when the markers are put back into flow',
          moved.length >= 1 && moved.every(r => r.kind === 'map-wanderer-mark'),
          moved.length ? `${moved.length} marker(s) moved: `
            + moved.map(r => `${r.kind} by ${r.dx},${r.dy} px${r.drawnM != null ? `, ${r.drawnM} m of ground` : ''}`).join('; ')
            : 'NOTHING moved when the bug was injected, so this measurement cannot see it');
      }
    }
  }
} finally {
  await browser.close();
  if (srv) srv.close();
}

console.log(`\nmarker-anchor: ${fails ? 'FAILED' : 'clean'}`);
unprovenReport('marker-anchor-audit.mjs', cap);
process.exit(exitFor(fails));
