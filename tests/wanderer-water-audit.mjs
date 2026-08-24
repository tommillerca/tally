/* THE WANDERER IS BOUND TO LAND, and the answer is the same on every device.
 *
 * Tom, 2026-08-22: "The wanderer is out in the lake where I am right now. He
 * shouldn't be. He's bound to land." wandererAt was pure math on a lat/lng grid
 * with zero land awareness. The fix hands it js/water.js's classifier (the
 * basemap's own z14 vector tiles, point-in-polygon against the `water` layer)
 * and a seeded fallback of beat centres.
 *
 * THE RISK THIS SUITE EXISTS FOR IS NOT THE LAKE. It is disagreement. Vector
 * tile water can be classified differently at different zooms, on different
 * devices, or by whatever tiles a viewport happens to hold, and two friends
 * seeing the wanderer in two different places is WORSE than the lake. So the
 * determinism rows are not a footnote here, they are the headline, and each one
 * carries a control proving it could have caught the disagreement.
 *
 *   CONTROL-*    the classifier is not blind, in BOTH directions: the middle of
 *                Lake Ontario reads water, inland Toronto reads land. A
 *                zero-violations row beside a blind classifier grades nothing,
 *                which is why these come first.
 *   SAMPLE       the scan really holds the bug: across the Toronto shoreline
 *                cells the LEGACY derivation (no oracle) walks over water in at
 *                least 3 (cell, instance) pairs. An empty sample is a FAILURE.
 *   LAND         with the oracle, every wanderer handed to the map keeps his
 *                ENTIRE lap on land: 180 sampled minutes per lap, zero water
 *                positions. And at least one pair that was water under legacy
 *                now stands on land, so the row cannot be satisfied by hiding
 *                everyone.
 *   HIDDEN       a cell in open water has NO wanderer that lap, with its own
 *                control that legacy DID put him on the water there.
 *   UNDECIDED    an oracle that cannot answer yet (tiles loading) hides him
 *                rather than showing him somewhere wrong.
 *   PURE         same (date, cell, clock, oracle) asked twice is the same man.
 *   CACHE        js/water.js caps its tile cache at MAX_TILES and evicts. A
 *                point classified before the eviction classifies the same after
 *                it, so "which tiles happen to be loaded" cannot move an answer.
 *   DETERMINISM  four child processes, each a fresh module instance fetching
 *                tiles again from cold, asking for them in four different
 *                ORDERS (forward, reverse, shuffled, trickled): the order tiles
 *                are requested is the order they arrive, and all four must
 *                derive the same grid and the same men byte-for-byte.
 *   MAP-STATE    the row the whole design exists for, in the real browser: the
 *                same points classified with the live MapLibre map parked at
 *                four different zooms and centres, a FRESH js/water.js per
 *                state, must be identical. CONTROL-MAP-STATE reads the same
 *                points off the RENDERED basemap in the same four states and
 *                requires those answers to DISAGREE with each other, which is
 *                the hazard named above, measured rather than asserted: it is
 *                what the fix would have looked like had it been built on
 *                queryRenderedFeatures.
 *   LIVE         the end of the chain, in the shipped app: the Boneyard open on
 *                a real waterfront position, and every Wanderer THE MAP ACTUALLY
 *                DRAWS unprojected off his own marker and classified. Its
 *                control is the same position under the legacy derivation,
 *                which has to put him on the water, or the run proved nothing.
 *
 * MEASURED WHEN THIS WAS FINISHED, 2026-08-23, so the numbers are on the record:
 *   - four cold builds x four tile-arrival orders: 323-point grid and 162
 *     derived positions IDENTICAL, five times out of five.
 *   - four map states in Chrome: isWater identical; queryRenderedFeatures
 *     returned three different answers for the same points, all-zero at the two
 *     zooms where the points were off-screen.
 *   - browser and node agree bit-for-bit on the same grid.
 *   - the constraint hides him only where he was drowning anyway: 0% hidden
 *     inland Toronto, 5% Calgary, 21% Vancouver, 61% Toronto waterfront, where
 *     legacy had put 64% of laps ON the water.
 *   - first oracle pass costs under 2ms for all nine cells, then memoized.
 *
 * PROVEN RED 2026-08-23, four mutations, each in its own throwaway `cp -R` tree
 * with .git REMOVED (a worktree's .git is a file pointing back at the original,
 * so a checkout inside a copy writes to the original and proves nothing), the
 * defect written into the FILE and grepped to confirm it landed, exit codes read
 * from a file and never through a pipe. Every one exited 1.
 *   THE ORIGINAL DEFECT   wandererAt ignores the oracle again -> LAND "7475 water
 *     positions ... (60 shown, 0 hidden)", HIDDEN, UNDECIDED. The LIVE rows
 *     correctly declare themselves unproven there: with nothing able to relocate,
 *     the before/after they grade does not exist.
 *   THE GLUE               js/wanderer.js keeps the fix and js/app.js drops the
 *     oracle from its one call, which is the field-dropped-in-the-mapper failure
 *     this project keeps paying for -> LIVE "2182_-3970_i25:WATER", the marker
 *     drawn 852 m from where the derivation had put him, on the water. Nothing
 *     else moved: every node row stayed green, because the math was never wrong.
 *   ASSUME LAND WHEN BLIND isWater returns false instead of undefined for a tile
 *     that has not arrived, the plausible version of this bug -> DETERMINISM red
 *     BY NAME ("trickle differ from forward"), plus CONTROL-WATER, SAMPLE, CACHE,
 *     CONTROL-DETERMINISM, MAP-STATE and BROWSER-AGREES-NODE.
 *   READ THE RENDERED MAP  isWater answers from queryRenderedFeatures when a map
 *     is present, which is the design G2 warned about -> MAP-STATE "the map state
 *     moved the answer" and BROWSER-AGREES-NODE.
 * The unproven path is not theory either: on the first finished run of the day the
 * search found no relocatable Wanderer in the band and the suite printed three
 * UNPRV rows and exited 97 rather than green.
 *
 * NEEDS THE TILE HOST, and the LIVE / MAP-STATE rows need a drawable map. Same
 * contract as tests/boneyard-audit.mjs: rows that could not run are reported
 * UNPROVEN with exit 97 by name, never quietly green.
 *
 *   node tests/wanderer-water-audit.mjs
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { boot, seed, serveTree, sleep, boneyardCapability, unproven, unprovenReport, unclassifiedRows, exitFor } from './godmode.js';
import * as W from '../js/wanderer.js';
import { isWater, ensureWater } from '../js/water.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATE = '2026-08-22';   // seeds are date-keyed; pinned so runs are comparable
let fails = 0;
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  | ' + d : ''}`); if (!p) fails = 1; };

/* EVERY ROW IS CLASSIFIED, or the unproven list rots. NET rows need the tile
   host; MAP rows need the tile host AND a drawable map. A row in neither fails
   here, before anything is graded. */
const NET_ROWS = ['SETUP every tile the scan needs arrived', 'CONTROL-WATER the middle of Lake Ontario classifies as water',
  'CONTROL-LAND inland Toronto classifies as land', 'SETUP every legacy position could be classified',
  'SAMPLE the scan really holds the bug: legacy walks him over water',
  'LAND no shown wanderer ever stands on water, across every sampled minute of every lap',
  'LAND-RELOCATED the fallback finds land rather than hiding everyone: a legacy-wet lap now stands dry',
  'CONTROL-HIDDEN legacy really stranded him in open water there', 'HIDDEN a cell in open water has no wanderer that lap',
  'UNDECIDED tiles still loading means hidden, never shown-and-wrong', 'PURE same (date, cell, clock, oracle) twice is the same man',
  'CACHE an evicted and refetched tile re-answers its points identically', 'SETUP all four determinism children ran',
  'DETERMINISM four cold oracle builds, four tile-arrival orders, one answer',
  'CONTROL-DETERMINISM the children graded a real sample'];
const LIVE_ROWS = ['LIVE-SAMPLE the map really drew a Wanderer to grade',
  'LIVE-CONTROL legacy would have drawn him standing on the water right here',
  'LIVE every Wanderer the map actually draws is standing on land'];
const MAP_ROWS = [...LIVE_ROWS, 'MAP-STATE the same points classify identically at four map zooms and centres',
  'CONTROL-MAP-STATE the rendered basemap disagrees with itself across those same states',
  'BROWSER-AGREES-NODE the page and node classify the same grid identically'];
const cls = unclassifiedRows(import.meta.url, [NET_ROWS, MAP_ROWS]);
const undeclared = cls.missing.filter(n => !n.startsWith('ROWS-CLASSIFIED'));   // this row itself needs nothing
ok('ROWS-CLASSIFIED every assertion in this file is declared under the environment it needs',
  undeclared.length === 0 && cls.callSites === NET_ROWS.length + MAP_ROWS.length + 1,
  `${cls.callSites} ok() rows in source, expected ${NET_ROWS.length + MAP_ROWS.length + 1}`
  + (undeclared.length ? `; undeclared: ${undeclared.join(' / ')}` : ''));

// ---- capability: no tile host, no verdict -------------------------------
try {
  const r = await fetch('https://tiles.openfreemap.org/planet');
  if (!r.ok) throw new Error(String(r.status));
} catch (e) {
  const why = `no route to the vector tile host (${e.message}); every row would grade a blind oracle`;
  for (const n of [...NET_ROWS, ...MAP_ROWS]) unproven(n, why);
  unprovenReport('wanderer-water-audit', null);
  process.exit(exitFor(fails));
}

// ---- the ground: Toronto's Lake Ontario shoreline -----------------------
// cx 2180..2182 spans lat 43.59..43.65 (islands, harbour, waterfront);
// cy -3970..-3966 spans lng -79.40..-79.32. Mixed land and water on purpose,
// and small enough that every tile it needs fits under water.js's cache cap.
const CELLS = [];
for (let cx = 2180; cx <= 2182; cx++) for (let cy = -3970; cy <= -3966; cy++) CELLS.push([cx, cy]);
const MID_LAKE = [2175, -3950];   // 43.50, -79.00: open water, ~15 km offshore
const INSTS = [0, 1, 2, 3];
const CONTROL_WATER = [43.75, -78.00];
const CONTROL_LAND = [43.7100, -79.4000];

/* ONE prefetch for the whole scan. Every cell's bbox plus a 600 m margin (a lap
   is at most WANDER_R_MAX_M across from a centre 0.36 cells off), stepped finer
   than a z14 tile's own span so no intersecting tile is missed, and the control
   points, which are nowhere near the cells and were the reason the first cut of
   this suite graded two undefineds as a failing classifier. */
const prefetch = [CONTROL_WATER, CONTROL_LAND];
for (const [cx, cy] of [...CELLS, MID_LAKE]) {
  const la0 = (cx - 0.5) * W.WANDER_CELL_DEG - 0.006, la1 = (cx + 0.5) * W.WANDER_CELL_DEG + 0.006;
  const ln0 = (cy - 0.5) * W.WANDER_CELL_DEG - 0.008, ln1 = (cy + 0.5) * W.WANDER_CELL_DEG + 0.008;
  for (let la = la0; la <= la1; la += 0.007) for (let ln = ln0; ln <= ln1; ln += 0.01) prefetch.push([la, ln]);
}
ok('SETUP every tile the scan needs arrived', await ensureWater(prefetch, 120000), `${prefetch.length} points`);

// ---- the classifier is not blind, in both directions --------------------
ok('CONTROL-WATER the middle of Lake Ontario classifies as water', isWater(...CONTROL_WATER) === true);
ok('CONTROL-LAND inland Toronto classifies as land', isWater(...CONTROL_LAND) === false);

// ---- scan: where did the LEGACY derivation put him? ---------------------
const lapMinutes = inst => {
  const out = [];
  for (let m = inst * W.WANDER_LAP_MIN; m < (inst + 1) * W.WANDER_LAP_MIN; m += 0.25) out.push(m);
  return out;
};
const pairs = [];
for (const [cx, cy] of CELLS) {
  for (const inst of INSTS) {
    let legacyWater = 0, unknown = 0;
    const mins = lapMinutes(inst);
    for (const m of mins) {
      const w = W.wandererAt(cx, cy, DATE, m);   // no oracle: the shipped bug
      const v = isWater(w.lat, w.lng);
      if (v === undefined) unknown++;
      else if (v) legacyWater++;
    }
    pairs.push({ cx, cy, inst, legacyWater, unknown, samples: mins.length });
  }
}
const unknownTotal = pairs.reduce((a, p) => a + p.unknown, 0);
ok('SETUP every legacy position could be classified', unknownTotal === 0, `${unknownTotal} unknown`);
const wet = pairs.filter(p => p.legacyWater > 0);
ok('SAMPLE the scan really holds the bug: legacy walks him over water', wet.length >= 3,
  `${wet.length} of ${pairs.length} (cell, instance) pairs put some of his lap on water; worst ${Math.max(0, ...wet.map(p => p.legacyWater))}/${pairs[0].samples} sampled minutes wet`);

// ---- the fix: every shown wanderer keeps his whole lap on land ----------
let violations = 0, shown = 0, hidden = 0, relocated = 0, undecided = 0;
for (const p of pairs) {
  let anyNull = false, anyWater = 0;
  for (const m of lapMinutes(p.inst)) {
    const w = W.wandererAt(p.cx, p.cy, DATE, m, isWater);
    if (!w) { anyNull = true; continue; }
    const v = isWater(w.lat, w.lng);
    if (v === undefined) undecided++;
    else if (v) anyWater++;
  }
  violations += anyWater;
  if (anyNull) hidden++; else shown++;
  if (!anyNull && p.legacyWater > 0) relocated++;
}
ok('LAND no shown wanderer ever stands on water, across every sampled minute of every lap',
  violations === 0 && undecided === 0,
  `${violations} water positions, ${undecided} unclassifiable, across ${pairs.length} laps (${shown} shown, ${hidden} hidden)`);
ok('LAND-RELOCATED the fallback finds land rather than hiding everyone: a legacy-wet lap now stands dry',
  relocated >= 1, `${relocated} of ${wet.length} legacy-wet laps relocated onto land`);

// ---- open water: no wanderer at all, and that null hides a real bug -----
{
  const [cx, cy] = MID_LAKE;
  const mins = lapMinutes(0);
  const legacyWet = mins.every(m => { const w = W.wandererAt(cx, cy, DATE, m); return isWater(w.lat, w.lng) === true; });
  ok('CONTROL-HIDDEN legacy really stranded him in open water there', legacyWet);
  ok('HIDDEN a cell in open water has no wanderer that lap',
    mins.every(m => W.wandererAt(cx, cy, DATE, m, isWater) === null));
}

// ---- an oracle that cannot answer yet hides him -------------------------
ok('UNDECIDED tiles still loading means hidden, never shown-and-wrong',
  W.wandererAt(2181, -3968, '1999-01-01', 10, () => undefined) === null);

// ---- purity survives the constraint -------------------------------------
{
  const a = W.wandererAt(2181, -3968, DATE, 12.5, isWater);
  const b = W.wandererAt(2181, -3968, DATE, 12.5, isWater);
  ok('PURE same (date, cell, clock, oracle) twice is the same man', JSON.stringify(a) === JSON.stringify(b));
}

/* ---- eviction cannot move an answer ------------------------------------
   water.js keeps at most MAX_TILES and drops the rest, so a long session
   classifies some points against tiles that have been thrown away and fetched
   again. Read a strip, thrash the cache with a far-away band until the strip's
   tiles are gone, read the strip again. */
{
  const strip = [];
  for (let ln = -79.42; ln <= -79.30; ln += 0.01) strip.push([43.63, +ln.toFixed(4)]);
  await ensureWater(strip, 60000);
  const before = strip.map(p => (isWater(...p) ? 1 : 0)).join('');
  const far = [];
  for (let la = 44.0; la <= 45.6; la += 0.08) for (let ln = -80.4; ln <= -79.6; ln += 0.12) far.push([la, ln]);
  for (const p of far) isWater(...p);                    // queues past the cap; evicts the strip
  await new Promise(r => setTimeout(r, 4000));
  const evicted = strip.filter(p => isWater(...p) === undefined).length;
  await ensureWater(strip, 60000);
  const after = strip.map(p => (isWater(...p) ? 1 : 0)).join('');
  ok('CACHE an evicted and refetched tile re-answers its points identically',
    before === after && before.includes('1') && before.includes('0'),
    `${evicted}/${strip.length} points were evicted and refetched; ${before} then ${after}`);
}

/* ---- four cold builds, four tile-arrival orders -------------------------
   Each child is a FRESH process importing a FRESH js/water.js, so its tiles come
   off the network again. MODE decides the order points are ASKED for, which is
   the order their tiles are requested and so the order they arrive. If any of
   that could reach the answer, these four disagree. Exit codes come from
   spawnSync status, never through a shell pipe. */
const CHILD = `
const water = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'js', 'water.js')).href)});
const W = await import(${JSON.stringify(pathToFileURL(path.join(ROOT, 'js', 'wanderer.js')).href)});
const { isWater, ensureWater } = water;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pts = [];
for (let la = 43.585; la <= 43.670; la += 0.005)
  for (let ln = -79.455; ln <= -79.265; ln += 0.010) pts.push([+la.toFixed(4), +ln.toFixed(4)]);
let order = pts.slice();
if (process.env.MODE === 'reverse') order.reverse();
if (process.env.MODE === 'shuffle') {
  let s = 7;
  const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
}
if (process.env.MODE === 'trickle')
  for (let i = 0; i < order.length; i += 20) { order.slice(i, i + 20).forEach(p => isWater(...p)); await sleep(60); }
await ensureWater(order, 180000);
const grid = pts.map(p => (isWater(...p) ? '1' : '0')).join('');
const cells = [];
for (let cx = 2180; cx <= 2182; cx++) for (let cy = -3970; cy <= -3966; cy++)
  for (const m of [3, 21, 39, 48, 66, 84]) cells.push([cx, cy, m]);
const res = new Map();
for (let round = 0; round < 6; round++) {
  let pending = false;
  for (const [cx, cy, m] of cells) {
    const w = W.wandererAt(cx, cy, '${DATE}', m, isWater);
    res.set(cx + '/' + cy + '/' + m, w ? [w.lat.toFixed(12), w.lng.toFixed(12), w.heading.toFixed(9)].join(',') : 'none');
    if (!w) pending = true;
  }
  if (!pending) break;
  await ensureWater(order, 180000);
  await sleep(200);
}
console.log(JSON.stringify({ grid, out: cells.map(([cx, cy, m]) => res.get(cx + '/' + cy + '/' + m)) }));
`;
const MODES = ['forward', 'reverse', 'shuffle', 'trickle'];
const kids = MODES.map(m => spawnSync(process.execPath, ['--input-type=module', '-e', CHILD],
  { encoding: 'utf8', timeout: 300000, env: { ...process.env, MODE: m } }));
ok('SETUP all four determinism children ran', kids.every(k => k.status === 0),
  kids.map((k, i) => `${MODES[i]}=${k.status}${k.status ? ' ' + (k.stderr || '').slice(0, 160) : ''}`).join('  '));
const outs = kids.map(k => (k.stdout || '').trim());
ok('DETERMINISM four cold oracle builds, four tile-arrival orders, one answer',
  outs[0].length > 0 && outs.every(o => o === outs[0]),
  outs.every(o => o === outs[0]) ? `${outs[0].length} bytes, identical across ${MODES.join(', ')}`
    : `disagreement: ${MODES.filter((m, i) => outs[i] !== outs[0]).join(', ')} differ from forward`);
ok('CONTROL-DETERMINISM the children graded a real sample',
  (() => {
    try {
      const j = JSON.parse(outs[0]);
      return j.grid.includes('1') && j.grid.includes('0') && j.out.length === 90 && j.out.some(o => o !== 'none');
    } catch { return false; }
  })(), 'the grid holds both classes and real wanderers were derived');

/* ---- THE BROWSER: map states, and the man the map actually draws -------- */
const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
console.log(`URL UNDER TEST  ${base}`);
const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.setGeolocation({ latitude: 43.6300, longitude: -79.3600 });
const cap = await boneyardCapability(page);
if (!cap.ok) {
  for (const n of MAP_ROWS) unproven(n, 'the Boneyard could not draw on this machine');
} else {
  await seed(page, { level: 18, coins: 500 });

  /* WHERE TO STAND, decided for TODAY'S date because the app seeds off dateKey()
     and no test can pin that. Search the waterfront band for a cell whose lap
     legacy put on the water and whose fixed lap is SHOWN (relocated, not
     hidden): a hidden cell draws no marker and would grade the LAND row against
     an empty screen. Both the current instance and the next one must qualify, so
     the 45-minute clock turning over mid-run cannot invalidate the sample. */
  const pick = await page.evaluate(async () => {
    const W = await import('./js/wanderer.js');
    const { isWater, ensureWater } = await import('./js/water.js');
    const { dateKey } = await import('./js/nutrition.js');
    const date = dateKey();
    const D = W.WANDER_CELL_DEG;
    const pts = [];
    for (let la = 43.56; la <= 43.68; la += 0.007) for (let ln = -79.43; ln <= -79.29; ln += 0.01) pts.push([la, ln]);
    await ensureWater(pts, 90000);
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const inst = Math.floor(mins / W.WANDER_LAP_MIN);
    /* THE INSTANCE THE APP WILL ACTUALLY DRAW. Requiring the next one too
       halved the candidate pool for a rollover that only matters if the 45
       minutes run out mid-read, so it is required only when it is close. */
    const insts = mins - inst * W.WANDER_LAP_MIN > W.WANDER_LAP_MIN - 3 ? [inst, inst + 1] : [inst];
    for (let cx = 2179; cx <= 2183; cx++) {
      for (let cy = -3971; cy <= -3965; cy++) {
        const good = insts.every(i => {
          const m = i * W.WANDER_LAP_MIN + 10;
          const legacy = W.wandererAt(cx, cy, date, m);
          const fixed = W.wandererAt(cx, cy, date, m, isWater);
          return isWater(legacy.lat, legacy.lng) === true && fixed && isWater(fixed.lat, fixed.lng) === false;
        });
        if (good) {
          const w = W.wandererAt(cx, cy, date, mins, isWater);
          return { cx, cy, date, lat: w.lat, lng: w.lng, inst };
        }
      }
    }
    return null;
  });
  console.log(`LIVE POSITION   ${pick ? `cell ${pick.cx}/${pick.cy} instance ${pick.inst}, standing him at ${pick.lat.toFixed(5)}, ${pick.lng.toFixed(5)}` : 'none found'}`);

  /* AN EMPTY SAMPLE IS DECLARED, NEVER GRADED. The Wanderer set is date-seeded
     and this row needs a cell today's seeds put on the water AND the fix stands
     back on land. On a date where that band offers none, the honest answer is
     that the row did not run: tests/wanderer-despawn-audit.mjs (#117) went red
     on exactly this shape, an empty sample crashed rather than saying so. The
     node rows above still grade the derivation on a pinned date, so nothing
     about the fix goes unchecked when this happens. */
  if (!pick) for (const n of LIVE_ROWS) unproven(n, "today's seeds put no relocatable Wanderer in the Toronto waterfront band, so there is no before/after to grade");
  if (pick) await page.setGeolocation({ latitude: pick.lat, longitude: pick.lng });
  await page.evaluate(() => { location.hash = '#/boneyard'; });
  await sleep(3000);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await sleep(9000);

  /* THE END OF THE CHAIN. Not "the oracle says land": the marker the map drew,
     put back through the map's own projection, classified. */
  const live = !pick ? null : await page.evaluate(async here => {
    const W = await import('./js/wanderer.js');
    const { isWater } = await import('./js/water.js');
    const { dateKey } = await import('./js/nutrition.js');
    const { distanceM } = await import('./js/hunt.js');
    const date = dateKey();
    const fixed = W.wanderersNear(date, here.lat, here.lng, undefined, isWater);
    /* MAPLIBRE'S OWN PLACEMENT, off the transform it wrote onto the marker, put
       back through the map's own projection. Not the element's bounding box:
       js/wanderer.js's injected style gives .map-wanderer-mark position:relative,
       which beats maplibre-gl.css's position:absolute, so the second and third
       wanderer markers on screen are laid out in normal FLOW 200 and 400 px below
       where the map put them. That is a real marker bug, it predates this branch
       and it is not this suite's business, but a box read would have graded the
       wrong patch of ground because of it. */
    const drawn = [...document.querySelectorAll('.map-wanderer-mark')].map(el => {
      const t = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(el.style.transform);
      const p = t ? window.__map.unproject([+t[1], +t[2]]) : null;
      const derived = fixed.find(w => w.id === el.dataset.w);
      return { id: el.dataset.w, lat: p && p.lat, lng: p && p.lng, water: p ? isWater(p.lat, p.lng) : undefined,
        off: (p && derived) ? Math.round(distanceM(p.lat, p.lng, derived.lat, derived.lng)) : null };
    });
    /* THE COUNTERFACTUAL, on the same seeds the map is drawing from: the nine
       cells around the player, derived with NO oracle. Not wanderersNear, which
       filters to WANDER_SHOW_M and would report an empty sample simply because
       the man legacy stranded offshore is further away than the one standing
       here. */
    const { cx, cy } = W.wandererCell(here.lat, here.lng);
    const legacy = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const w = W.wandererAt(cx + dx, cy + dy, date, undefined);
      legacy.push({ id: w.id, lat: w.lat, lng: w.lng, water: isWater(w.lat, w.lng) });
    }
    return { drawn, legacy };
  }, pick ? { lat: pick.lat, lng: pick.lng } : { lat: 43.6300, lng: -79.3600 });
  if (live) {
  for (const d of live.drawn) console.log(`  DRAWN  ${d.id}  ${(d.lat ?? 0).toFixed(6)}, ${(d.lng ?? 0).toFixed(6)}  water=${d.water}  ${d.off}m off his derived point`);
  for (const l of live.legacy) console.log(`  LEGACY ${l.id}  ${l.lat.toFixed(6)}, ${l.lng.toFixed(6)}  water=${l.water}`);
  /* The read itself is grounded: a marker unprojected back to somewhere he is
     not would let the LAND row grade the wrong patch of ground. */
  ok('LIVE-SAMPLE the map really drew a Wanderer to grade', live.drawn.length >= 1 && live.drawn.every(d => d.off !== null && d.off <= 25),
    `${live.drawn.length} wanderer markers on the map, each within ${Math.max(0, ...live.drawn.map(d => d.off ?? 999))} m of his derived point`);
  ok('LIVE-CONTROL legacy would have drawn him standing on the water right here',
    live.legacy.some(l => l.water === true),
    `${live.legacy.filter(l => l.water === true).length} of the ${live.legacy.length} cells around the player had legacy standing him on water`);
  ok('LIVE every Wanderer the map actually draws is standing on land',
    live.drawn.length >= 1 && live.drawn.every(d => d.water === false),
    live.drawn.map(d => `${d.id}:${d.water === false ? 'land' : d.water === true ? 'WATER' : 'undecided'}`).join(' '));
  }

  /* ---- the same points, four map states ------------------------------- */
  const STATES = [['z13.5 over the open lake', 43.500, -79.000, 13.5], ['z18 inland, the points far off-screen', 43.7400, -79.4200, 18],
    ['z16 on the waterfront itself', 43.6300, -79.3600, 16], ['z14 a different city entirely', 49.2827, -123.1207, 14]];
  const states = [];
  for (let i = 0; i < STATES.length; i++) {
    const [label, lat, lng, zoom] = STATES[i];
    const r = await page.evaluate(async ({ lat, lng, zoom, i }) => {
      window.__map.jumpTo({ center: [lng, lat], zoom });
      await new Promise(res => (window.__map.loaded() ? res() : window.__map.once('idle', res)));
      await new Promise(res => setTimeout(res, 2500));
      // a FRESH js/water.js per map state: its own tile cache, its own TileJSON fetch
      const { isWater, ensureWater } = await import(`./js/water.js?state=${i}`);
      const pts = [];
      for (let la = 43.600; la <= 43.660; la += 0.010) for (let ln = -79.420; ln <= -79.300; ln += 0.015) pts.push([+la.toFixed(4), +ln.toFixed(4)]);
      const filled = await ensureWater(pts, 90000);
      const layers = window.__map.getStyle().layers.filter(L => /water/i.test(L.id) && L.type === 'fill').map(L => L.id);
      const rendered = pts.map(([la, ln]) => (window.__map.queryRenderedFeatures(window.__map.project([ln, la]), { layers }).length ? '1' : '0')).join('');
      return { filled, grid: pts.map(p => (isWater(...p) ? '1' : '0')).join(''), rendered, zoom: window.__map.getZoom() };
    }, { lat, lng, zoom, i });
    console.log(`  ${label.padEnd(38)} z=${r.zoom.toFixed(2)}\n    isWater   ${r.grid}\n    rendered  ${r.rendered}`);
    states.push(r);
  }
  ok('MAP-STATE the same points classify identically at four map zooms and centres',
    states.every(s => s.filled && s.grid === states[0].grid) && states[0].grid.includes('1') && states[0].grid.includes('0'),
    states.every(s => s.grid === states[0].grid) ? `${states[0].grid.length} points, identical in all four` : 'the map state moved the answer');
  ok('CONTROL-MAP-STATE the rendered basemap disagrees with itself across those same states',
    new Set(states.map(s => s.rendered)).size > 1,
    `${new Set(states.map(s => s.rendered)).size} distinct answers from queryRenderedFeatures for one fixed set of points`);
  const gridPts = [];
  for (let la = 43.600; la <= 43.660; la += 0.010) for (let ln = -79.420; ln <= -79.300; ln += 0.015) gridPts.push([+la.toFixed(4), +ln.toFixed(4)]);
  await ensureWater(gridPts, 90000);   // the CACHE row above evicted these on purpose
  const nodeGrid = gridPts.map(p => (isWater(...p) ? '1' : '0')).join('');
  ok('BROWSER-AGREES-NODE the page and node classify the same grid identically',
    nodeGrid === states[0].grid, `node ${nodeGrid}`);
}
await browser.close();
if (srv) srv.close();

unprovenReport('wanderer-water-audit', cap);
console.log(fails ? '\nWANDERER WATER AUDIT FAILED' : '\nWANDERER WATER AUDIT VERIFIED');
process.exit(exitFor(fails));
