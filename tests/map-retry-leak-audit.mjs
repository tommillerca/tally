/* THE BONEYARD MAY HOLD ONE MAPLIBRE INSTANCE, NOT ONE PER RETRY TAP.
 *
 * WHY THIS FILE EXISTS. Nobody had ever swept this app for leaks except
 * tests/lb-memory-audit.mjs, which exists because 312 MB in a single leaderboard
 * open killed the WKWebView renderer on Tom's phone. That was one screen, found
 * once, after it shipped. Sweeping the rest with CDP (Performance.getMetrics
 * JSEventListeners + Nodes, heap after a forced HeapProfiler.collectGarbage)
 * found the app clean on every path a player takes when things WORK: tabs,
 * sheets and the Boneyard open/close all hold flat. The leak is on the path a
 * player takes when things do not.
 *
 * THE BUG. `startMap()` (js/app.js, inside renderBoneyard) is bound to
 * `#mapRetry` from BOTH failure branches: no location fix, and the map erroring
 * before `load`, which is every player with no signal. It then did
 * `map = createBoneyardMap(...)` with no teardown of the instance already
 * there. The old MapLibre kept its WebGL context, its render loop, its
 * ResizeObserver, its two setIntervals and its three window listeners, and
 * cleanup() on the way out only ever knew about the LAST map. The two intervals
 * cannot save themselves either: they self-clear on `!body.isConnected` and
 * `body` is #mapBody, which a retry keeps and merely refills.
 *
 * MEASURED at 56c5058, driving the app's own Retry button ten times:
 *     taps    0    1    2    3    4    5    6    7    8    9   10
 *     GL      1    2    3    4    5    6    7    8    9   10   11
 *     listnr 58   97  151  205  259  298  337  376  415  454  493
 *     nodes 366  570  775  980 1187 1391 1595 1799 2003 2207 2411
 *     heap 5.55 MB ..................................... 11.07 MB
 * and then LEAVING the Boneyard released exactly ONE of the eleven contexts.
 *
 * WHY THE CONTEXT COUNT IS THE ROW THAT MATTERS. Browsers cap live WebGL
 * contexts (Chrome around sixteen) and force-lose the oldest past the cap, so a
 * player on a bad signal breaks their own map for the rest of the session while
 * the megabytes still look survivable. That is a sharper, earlier failure than
 * the heap curve, and it is a CEILING, not a trend (tally/CLAUDE.md rule 11).
 *
 * DIRECTION and BOUND, stated so nobody has to guess which way is down:
 *   - UP IS FAILURE on every number here.
 *   - BOUND: at most ONE live WebGL context while the Boneyard is open, no
 *     matter how many times Retry is tapped, and ZERO once you leave.
 *   - BOUND: listeners and DOM nodes at the last tap no higher than at the
 *     first open plus a fixed slack. Not "grows slowly": does not grow.
 *
 * THE INSTRUMENT MUST NOT BE THE LEAK. The first version of this measurement
 * kept every WebGLRenderingContext in a plain array so it could poll
 * isContextLost(). A context holds gl.canvas, so the array retained the whole
 * dead map subtree and reported a 28-listener, 215-node per-open leak on the
 * ordinary open/close path, which is clean. Every reference taken here is a
 * WeakRef for that reason. Do not "simplify" it back.
 *
 * DETERMINISM, NOT LUCK. The Retry button only exists when the map fails, so
 * this aborts requests to the tile host outright rather than relying on the
 * machine being offline. It therefore drives the same path on a networked CI box
 * and in a sandbox, and it cannot go green because a tile fetch happened to
 * succeed. WebGL comes from the same four flags tests/boneyard-audit.mjs uses.
 *
 * AN EMPTY SAMPLE SET IS A FAILURE (rule 3). DROVE asserts the app really showed
 * its Retry card and that it was tapped RETRIES times, and ALIVE asserts a
 * MapLibre instance and a WebGL context actually existed, because "no map was
 * ever built" satisfies a ceiling on its own.
 *
 * PROVE-RED: delete the four teardown lines at the top of startMap()
 * (cleanupExtras / map?.remove()) and GL CEILING, RELEASED, LISTENERS and NODES
 * all go red at 8 taps: 9 live contexts, 415 listeners, 2003 nodes.
 *
 * NOT COVERED, and none of it may be read as safe: this measures the JS heap,
 * the listener registry and the DOM node count. Decoded image bytes are
 * tests/memory-census.mjs's job, and GPU-side memory per context is visible to
 * neither of us. A real WKWebView caps contexts lower than Chrome does, so the
 * device failure arrives EARLIER than this file's bound, never later.
 *
 * Usage: node tests/map-retry-leak-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RETRIES = Number(process.env.RETRIES || 8);
const SETTLE_MS = 3400;          // one full startMap attempt: geolocation, style fetch, error

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const srv = await serveTree(ROOT);
const { browser, page } = await boot(srv.url, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));

await browser.defaultBrowserContext().overridePermissions(new URL(srv.url).origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });

/* The failure branch, created on purpose. Without this the audit only runs on a
   machine that happens to have no route to the tile host, and a machine that
   does would report "no Retry button" and grade nothing. */
await page.setRequestInterception(true);
page.on('request', r => (/tiles\.openfreemap\.org/.test(r.url()) ? r.abort() : r.continue()));

/* WeakRef only. See THE INSTRUMENT MUST NOT BE THE LEAK above. */
await page.evaluateOnNewDocument(() => {
  window.__glRefs = [];
  const og = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = og.call(this, type, ...rest);
    if (/webgl/i.test(String(type)) && ctx) window.__glRefs.push(new WeakRef(ctx));
    return ctx;
  };
});

await seed(page, { level: 12, coins: 5000 });

const cdp = await page.createCDPSession();
await cdp.send('Performance.enable');
await cdp.send('HeapProfiler.enable');

/* Force GC before every sample or the numbers are allocation noise, not state. */
async function sample(label) {
  for (let i = 0; i < 3; i++) { await cdp.send('HeapProfiler.collectGarbage'); await sleep(200); }
  const { metrics } = await cdp.send('Performance.getMetrics');
  const m = Object.fromEntries(metrics.map(x => [x.name, x.value]));
  const g = await page.evaluate(() => ({
    /* a context the app still holds AND has not lost: exactly the resource the
       browser rations. A removed map loses its context, a collected one derefs
       to undefined, and neither counts. */
    glLive: window.__glRefs.filter(r => { const c = r.deref(); try { return c && !c.isContextLost(); } catch { return false; } }).length,
    glMade: window.__glRefs.length,
    hasMap: !!window.__map,
    retryShown: !!document.getElementById('mapRetry'),
  }));
  return { label, heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(2), listeners: m.JSEventListeners, nodes: m.Nodes, ...g };
}

await page.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(1400);
await page.evaluate(() => document.getElementById('mapStart')?.click());
await sleep(SETTLE_MS);

const first = await sample('open');
console.log(JSON.stringify(first));

/* A missing WebGL stack is a SETUP failure, not a clean app: say so by name
   instead of reporting a ceiling nothing ever approached. */
if (!first.glMade) {
  console.log('FAIL  SETUP no WebGL context was ever created, so nothing here was measured.');
  console.log('        This audit needs --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist');
  console.log('        and they are passed below; a browser that still cannot start GL cannot run this check.');
  await browser.close(); srv.close?.();
  process.exit(1);
}

const rows = [first];
let tapped = 0;
for (let i = 1; i <= RETRIES; i++) {
  const hit = await page.evaluate(() => { const b = document.getElementById('mapRetry'); if (!b) return false; b.click(); return true; });
  if (!hit) break;
  tapped++;
  await sleep(SETTLE_MS);
  const s = await sample('retry' + i);
  rows.push(s);
  console.log(JSON.stringify(s));
}

await page.evaluate(() => { location.hash = '#/today'; });
await sleep(2000);
const left = await sample('left');
console.log(JSON.stringify(left));

const peak = k => Math.max(...rows.map(r => r[k]));
const peakGl = peak('glLive'), peakL = peak('listeners'), peakN = peak('nodes');

ok(`DROVE the app showed its own Retry card and it was tapped ${RETRIES} times (an undriven path is a FAILURE, not a pass)`,
  tapped === RETRIES && first.retryShown, `${tapped}/${RETRIES} taps landed, retry card present at open: ${first.retryShown}`);
ok('ALIVE a MapLibre instance and a WebGL context really existed, so the ceilings below had something to measure',
  first.hasMap && first.glMade >= 1, `map object: ${first.hasMap}, contexts created: ${first.glMade}`);

/* UP IS FAILURE. BOUND: one. */
ok('GL CEILING the Boneyard never holds more than ONE live WebGL context, however many times Retry is tapped',
  peakGl <= 1, `peak ${peakGl} live of ${rows.at(-1).glMade} created across ${tapped} taps (the bug reached 11 at ten taps)`);
ok('RELEASED leaving the Boneyard leaves NO live WebGL context behind',
  left.glLive === 0, `${left.glLive} still live after leaving (the bug left 10 of 11)`);
ok('LISTENERS the listener registry does not grow with retries (a ceiling, not a trend)',
  peakL - first.listeners <= 60, `${first.listeners} at open, peak ${peakL} across ${tapped} taps (the bug reached 493)`);
ok('NODES the DOM node count does not grow with retries',
  peakN - first.nodes <= 200, `${first.nodes} at open, peak ${peakN} across ${tapped} taps (the bug reached 2411)`);

console.log(`\nheap across the run: ${rows.map(r => r.heapMB).join(' -> ')} MB (after forced GC at every sample)`);
/* Page errors are REPORTED, not graded. The offline map path throws its own
   TypeError at js/app.js:13836 and further down: `map.once('error')` replaces
   body.innerHTML while startMap is still awaiting ownShinyPetId / db.all('xp') /
   loadMyName, so the `$('#mapDen', body).addEventListener` group that follows
   dereferences null. That is a real crash on the no-signal path and it is
   written up in the sweep, but it predates this file and grading it here would
   make a memory guard red for a reason that has nothing to do with memory. */
if (errs.length) console.log(`note: ${errs.length} page error(s) on the offline map path, unrelated to the ceilings above: ${[...new Set(errs)].slice(0, 2).join(' ; ')}`);

await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nboneyard retry holds one map');
process.exit(fails.length ? 1 : 0);
