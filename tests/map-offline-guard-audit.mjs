/* THE BONEYARD ON A DEAD CONNECTION: THE POLITE MESSAGE, AND NOTHING ELSE.
 *
 * THE BUG (measured on 56c5058, v385). MapLibre fires `error` before `load`
 * whenever the tile host is unreachable, and startMap's handler replaces ALL of
 * #mapBody with "The Boneyard needs a network signal to draw the map" plus a
 * Retry button. That wipe deletes #mapCanvas, #mapStage and every action
 * button. startMap is async and keeps running: it resumes from one of its
 * awaits on a body that no longer contains any of them, and
 * `$('#mapCanvas', body).addEventListener(...)` throws
 * "Cannot read properties of null (reading 'addEventListener')".
 *
 * So a player who opened the Boneyard offline got the polite message AND an
 * uncaught TypeError, and everything after that line silently never ran.
 *
 * The two dereferences that were reported (#mapCanvas and #mapSpire) were not
 * the only ones. On the same straight-line path, after the same awaits, there
 * are NINE: #mapCanvas (used four times), #mapStage, #mapDen, #mapSecret,
 * #mapMini, #mapSpire, #mapGlutton, #mapCollect. Only the first is visible,
 * because it throws and takes the rest with it.
 *
 * WHAT THIS CHECKS, and which DIRECTION is failure:
 *   OFFLINE   the polite message is on screen. FAILING = it is not, and the
 *             run proved nothing (an empty sample set is a failure).
 *   NO-ERROR  ZERO page errors during the whole offline open. BOUND, not a
 *             trend: 0, not "fewer than before". FAILING = the TypeError above,
 *             which is what main does.
 *   RETRY     the Retry button survives and is clickable, and clicking it does
 *             not throw either. The polite path has to still work.
 *   ABORT     startMap really STOPPED. The geolocation watch it starts at the
 *             very end must never start, and neither interval must be armed.
 *             BOUND: 0 watches. This is the check that fails the NAIVE fix:
 *             null-guarding the nine dereferences one at a time lets startMap
 *             run to completion against a dead screen, wiring click handlers to
 *             nothing and arming a GPS watch and two timers for a map that is
 *             not there.
 *   SWEEP     static: no top-level dereference in startMap after the first
 *             await may be bare. FAILING = a new `$('#x', body).foo` appears
 *             without `?.`, which is how this bug gets reintroduced.
 *
 * TWO environment properties this depends on, and rule 4 says name them both:
 *
 *   1. AN UNREACHABLE TILE HOST. Blocked with request interception, which is
 *      the real failure the player hits.
 *   2. A PHONE'S CPU. This bug is a RACE: the wipe has to land while startMap
 *      is suspended at one of its three awaits. On this machine, unthrottled,
 *      the three local IndexedDB reads finish before MapLibre's error event is
 *      even dispatched, startMap completes, and the tree WITHOUT the fix passes
 *      clean. Measured on 56c5058: CPU x1 -> 0 page errors; CPU x6 and x20 ->
 *      "TypeError: Cannot read properties of null (reading 'addEventListener')"
 *      every run. A datacenter core is 4-20x a mid-range phone, and the player
 *      also has a fatter xp ledger and a real avatar composite to decode. So
 *      the throttle is not a trick to force a failure, it is the only way to
 *      run this check on the device the bug belongs to, and without it the
 *      check silently cannot fail.
 *
 * PROVE-RED (measured, see the deliverable): against the tree before the fix,
 * OFFLINE passes and NO-ERROR + SWEEP go red naming the TypeError.
 *
 * Usage: node tests/map-offline-guard-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const checked = [];
const ok = (n, p, d = '') => { checked.push(n); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

/* ---------------- SWEEP: static, and it covers the sites the offline drive
   cannot reach because the abort stops before them ---------------- */
const src = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8').split('\n');
const startLine = src.findIndex(l => /^\s{2}async function startMap\(\)\s*\{/.test(l));
let endLine = -1;
for (let i = startLine + 1; i < src.length; i++) if (/^ {2}\}\s*$/.test(src[i])) { endLine = i; break; }
const bodyLines = startLine >= 0 && endLine > startLine ? src.slice(startLine, endLine) : [];
/* Everything after the FIRST await that follows the error handler's
   registration can be resumed on a wiped body. Before it, the wipe cannot have
   happened yet: MapLibre's error event is asynchronous and straight-line code
   between two awaits cannot be interrupted. */
const errIdx = bodyLines.findIndex(l => /map\.once\('error'/.test(l));
const firstAwaitIdx = bodyLines.findIndex((l, i) => i > errIdx && /^ {4}\S.*\bawait /.test(l));
const bare = [];
for (let i = firstAwaitIdx + 1; i < bodyLines.length; i++) {
  const l = bodyLines[i];
  if (!/^ {4}\S/.test(l)) continue;                        // top level of startMap only
  const m = l.match(/\$\('#[\w-]+', body\)\./);
  if (m) bare.push(`${startLine + i + 1}: ${l.trim().slice(0, 78)}`);
  if (/\bmapEl\.[a-zA-Z]/.test(l)) bare.push(`${startLine + i + 1}: ${l.trim().slice(0, 78)}`);
}
ok('SETUP the static sweep actually found startMap and its post-await region',
  startLine >= 0 && endLine > startLine && errIdx >= 0 && firstAwaitIdx > errIdx,
  `startMap at ${startLine + 1}, error handler +${errIdx}, first await +${firstAwaitIdx}, ${bodyLines.length} lines`);
ok('SWEEP no bare post-wipe dereference is left in startMap',
  bare.length === 0, bare.length ? `\n        ${bare.join('\n        ')}` : 'all optional-chained');

/* ---------------- the offline drive ---------------- */
const srv = await serveTree(ROOT);
const { browser, page } = await boot(srv.url, {
  headless: process.env.HEADLESS_MODE || 'shell',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
page.on('console', m => { if (m.type() === 'error' && /Uncaught|TypeError/.test(m.text())) errs.push('console: ' + m.text().slice(0, 120)); });

await browser.defaultBrowserContext().overridePermissions(new URL(srv.url).origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

/* Count what startMap starts at its very END. If any of these is non-zero the
   function ran past the wipe instead of aborting. */
await page.evaluate(() => {
  window.__watchCalls = 0;
  const realWatch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
  navigator.geolocation.watchPosition = (...a) => { window.__watchCalls++; return realWatch(...a); };
});

/* THE DEAD CONNECTION. The style JSON is a local asset; the tiles are not.
   Blocking the tile host is exactly what a player with no signal has. */
let blocked = 0;
await page.setRequestInterception(true);
page.on('request', req => {
  if (/tiles\.openfreemap\.org|openfreemap|\.pbf(\?|$)/.test(req.url())) { blocked++; req.abort('failed').catch(() => {}); return; }
  req.continue().catch(() => {});
});

/* The phone's CPU. See the header: without this the race always goes the safe
   way here and the check cannot fail. */
const CPU_THROTTLE = Number(process.env.CPU_THROTTLE || 20);
await page.emulateCPUThrottling(CPU_THROTTLE);

await page.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(3000);
// a virgin demo profile shows the START button first; a returning one auto-starts
await page.evaluate(() => document.querySelector('#mapStart')?.click());
await sleep(12000);

const state = await page.evaluate(() => ({
  text: (document.body.innerText || '').slice(0, 400),
  offlineMsg: /needs a network signal/i.test(document.body.innerText || ''),
  hasRetry: !!document.querySelector('#mapRetry'),
  hasCanvas: !!document.querySelector('#mapCanvas'),
  watchCalls: window.__watchCalls,
}));

ok('SETUP the tile host was really blocked (an empty sample set is a failure)',
  blocked > 0, `${blocked} tile requests aborted, CPU throttle x${CPU_THROTTLE}`);
ok('OFFLINE the player gets the polite "needs a network signal" message',
  state.offlineMsg, JSON.stringify(state.text.replace(/\s+/g, ' ').slice(0, 140)));
ok('OFFLINE and the map canvas really is gone, so this is the post-wipe path',
  state.hasCanvas === false, `#mapCanvas present: ${state.hasCanvas}`);
ok('NO-ERROR zero page errors on the offline Boneyard path',
  errs.length === 0, errs.slice(0, 3).join(' | '));
ok('ABORT startMap stopped at the wipe: no GPS watch was armed for a dead map',
  state.watchCalls === 0, `watchPosition called ${state.watchCalls}x (want 0)`);
ok('RETRY the Retry button survives the wipe', state.hasRetry === true);

const errsBeforeRetry = errs.length;
await page.evaluate(() => document.querySelector('#mapRetry')?.click());
await sleep(12000);
const retryState = await page.evaluate(() => ({
  offlineMsg: /needs a network signal|no location fix|could not load/i.test(document.body.innerText || ''),
  watchCalls: window.__watchCalls,
}));
ok('RETRY tapping it does not throw either (a second run takes the same path)',
  errs.length === errsBeforeRetry, errs.slice(errsBeforeRetry, errsBeforeRetry + 2).join(' | '));
ok('RETRY and it lands back on a message, not a blank screen', retryState.offlineMsg);
ok('RETRY still no GPS watch for a map that never drew', retryState.watchCalls === 0, `${retryState.watchCalls}`);

await browser.close(); srv.close?.();
if (!checked.length) { console.log('\nNO CHECKS RAN'); process.exit(1); }
console.log(fails.length ? `\n${fails.length}/${checked.length} FAILED: ${fails.join(', ')}` : `\n${checked.length} checks: the offline Boneyard is quiet`);
process.exit(fails.length ? 1 : 0);
