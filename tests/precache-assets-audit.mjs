/* PRECACHE FOR NON-MODULES: what else does the app die without.
 *
 * The sibling tests/precache-audit.mjs walks the JS import graph and requires
 * every module be in sw.js PRECACHE, because the sw.js fallback answers a
 * missing js/*.js with index.html and a module served text/html is a hard
 * error. That is the shape of the 2026-08-12 TestFlight outage.
 *
 * But the same fallback answers ANY missed request with index.html: a missing
 * stylesheet gets served HTML, a missing font gets served HTML, a missing
 * vendor bundle gets served HTML. The consequence differs by asset type:
 * unusable HTML in a <link rel=stylesheet> is not a hard load error (the
 * browser silently ignores it) but the app then paints unstyled. That is not
 * a MODULE-shape failure and the existing lint would not see it.
 *
 * This audit measures each candidate non-module asset by BOOTING WITH IT
 * BLOCKED at the browser network layer (before the SW ever sees it, which is
 * the first-open scenario a new player experiences) and grading the result:
 *
 *   FATAL          the app fails to reach its own readiness signal within
 *                  a reasonable budget: no tab bar, no screen content, and
 *                  the player is stuck on the shell exactly like the
 *                  TestFlight outage. MUST be in PRECACHE.
 *   BOOTS-WITHOUT  the app STILL REACHES the readiness signal (screen has
 *                  children, tab bar is present) with the asset blocked.
 *                  THIS AUDIT DOES NOT JUDGE USABILITY. app.css blocked
 *                  boots the shell to "usable" by this signal but the
 *                  player sees an unstyled wall of text; that is broken to
 *                  their eyes, not cosmetic. This label means only "boot
 *                  survives", never "player would be OK".
 *
 * The rule for extending PRECACHE from this audit's output: FATAL findings
 * are the ones this audit can act on. BOOTS-WITHOUT findings need the
 * cost/benefit judgment done separately (bytes saved vs player-visible
 * damage), which lives in the write-up alongside the byte measurements
 * below, not in this program's exit code.
 *
 * Method: puppeteer + page.setRequestInterception. Never reason from the file
 * list, always measure. Every check has a specific verdict on real behaviour.
 *
 * Hard-stop rule from Gwart: if a FATAL finding turns up that is NOT already
 * in PRECACHE, stop the sweep and report immediately rather than finishing.
 * That is the shape of today's outage and it is exactly what a live player
 * would hit next.
 */
import { boot, sleep, serveTree } from './godmode.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const srv = { kill: () => srvHandle && srvHandle.close() };
const base = argv || srvHandle.url;

let bad = 0;
const results = [];
const say = (verdict, name, detail) => {
  const p = verdict === 'ok';
  results.push({ verdict, name, detail });
  console.log(`${p ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  if (!p) bad++;
};

/* Boot the app with `pattern` blocked at the CDP layer, optionally then
 * navigate to `then` and re-measure there. Returns readiness observations.
 * First-open scenario: fresh browser, no SW yet, so the blocked request
 * never resolves the way an offline player would experience it.
 *
 * Readiness signal is the same one godmode's boot() readiness wait uses on
 * ext/godmode-boot: #screen has children AND the tab bar exists. Any value
 * below "tabs > 0 AND screenKids > 0" reads as "the shell is up but the app
 * is not", which is exactly the TestFlight-blank-screen shape.
 *
 * If `then` (a hash route) is given, after the initial boot we also
 * navigate to that route and check that its screen has content, so a
 * lazy-loaded asset can be graded on the screen that fetches it rather than
 * on boot. */
async function measureWithBlocked(pattern, { then = null } = {}) {
  const { browser, page } = await boot(base);
  /* If the follow-up route is the Boneyard, its map only instantiates once
     geolocation is granted and a position is available; without both, maplibre
     is not even imported and the "block maplibre and see what happens" test
     never fires. Grant them here so the intended fetch actually happens and
     the block gets measured rather than silently missed. */
  if (then && /boneyard/.test(then)) {
    const origin = new URL(base).origin;
    await browser.defaultBrowserContext().overridePermissions(origin, ['geolocation']);
    await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });
  }
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => consoleErrors.push('PAGEERROR ' + String(e).slice(0, 200)));
  await page.setRequestInterception(true);
  const blocked = [];
  page.on('request', req => {
    const url = req.url();
    if (pattern.test(url)) { blocked.push(url); req.abort(); return; }
    req.continue();
  });
  const t0 = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  const ready = await page.waitForFunction(
    () => (document.getElementById('screen')?.children.length || 0) > 0
       && (document.querySelector('#tabbar')?.children.length || 0) > 0,
    { timeout: 15000, polling: 200 }
  ).then(() => true).catch(() => false);
  let thenState = null;
  if (then && ready) {
    await page.evaluate(r => { location.hash = r; }, then);
    /* Boneyard shows a location-permission explainer first; click it to
       reach the map. Same shape boneyard-audit uses to get past the door. */
    await sleep(1200);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
      if (b) b.click();
    });
    /* Give the map plumbing time to try to instantiate (it will import
       maplibre if it can); ~4s covers the boneyard-audit's own cadence. */
    await sleep(4000);
    thenState = await page.evaluate(() => ({
      screenKids: document.getElementById('screen')?.children.length || 0,
      screenTextLen: (document.getElementById('screen')?.innerText || '').length,
      hasMap: !!document.querySelector('.maplibregl-map, #mapStage'),
    })).catch(() => ({ screenKids: 0, screenTextLen: 0, hasMap: false }));
  }
  const state = await page.evaluate(() => ({
    screenKids: document.getElementById('screen')?.children.length || 0,
    tabs: document.querySelector('#tabbar')?.children.length || 0,
    screenTextLen: (document.getElementById('screen')?.innerText || '').length,
    sheetsPresent: !!document.getElementById('sheets'),
  })).catch(() => ({ screenKids: 0, tabs: 0, screenTextLen: 0, sheetsPresent: false }));
  const elapsed = Date.now() - t0;
  await browser.close();
  return { ready, elapsed, state, thenState, blockedCount: blocked.length, sampleBlocked: blocked[0], consoleErrors };
}

/* Read sw.js's PRECACHE list so I can tell whether a FATAL finding is
   ALREADY covered (report as 'ok', asset dies but the precache saves it in
   the wild) or whether it is a live outage risk (report as FAIL and stop). */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swText = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const precacheArr = swText.slice(swText.indexOf('PRECACHE'), swText.indexOf('];', swText.indexOf('PRECACHE')));
const precached = new Set([...precacheArr.matchAll(/['"]\.\/([\w/.-]+)['"]/g)].map(m => m[1]));

/* Baseline: same measurement with NOTHING blocked, so I know what "ready"
 * looks like on this box. If baseline itself does not reach the readiness
 * signal, everything below reports noise and this is a HARNESS bug. */
console.log('baseline: booting with no request blocked');
const baseline = await measureWithBlocked(/^$a/);   // never matches
say(baseline.ready ? 'ok' : 'fail',
    'SETUP  baseline boot reaches the readiness signal',
    `ready=${baseline.ready} ${baseline.elapsed}ms  tabs=${baseline.state.tabs} screenKids=${baseline.state.screenKids}`);
if (!baseline.ready) {
  console.log('\nBASELINE FAILED, refusing to grade under-blocked runs: they would all read as bricked for reasons that have nothing to do with the blocked asset.');
  await srv.kill();
  process.exit(2);
}

/* Candidates. `then` navigates to a route after boot to grade lazy assets
 * on the screen that fetches them (maplibre bundles live behind the
 * Boneyard). Screens are stateful: a lazy-load failure that never surfaces
 * at boot may still leave a specific screen dead, which is worse than a
 * boot failure because it happens later in the session and is harder to
 * diagnose. */
const CANDIDATES = [
  { key: 'app.css',           pattern: /\/app\.css(\?|$)/,                          precacheKey: 'app.css' },
  { key: 'manifest',          pattern: /\/manifest\.webmanifest(\?|$)/,             precacheKey: 'manifest.webmanifest' },
  { key: 'bangers.woff2',     pattern: /\/assets\/fonts\/bangers\.woff2(\?|$)/,     precacheKey: 'assets/fonts/bangers.woff2' },
  { key: 'boldpixels.woff2',  pattern: /\/assets\/fonts\/boldpixels\.woff2(\?|$)/,  precacheKey: 'assets/fonts/boldpixels.woff2' },
  { key: 'icon-192.png',      pattern: /\/icons\/icon-192\.png(\?|$)/,              precacheKey: 'icons/icon-192.png' },
  { key: 'apple-touch-icon',  pattern: /\/icons\/apple-touch-icon\.png(\?|$)/,      precacheKey: 'icons/apple-touch-icon.png' },
  { key: 'maplibre.mjs',      pattern: /\/vendor\/maplibre\/maplibre\.mjs(\?|$)/,   precacheKey: 'vendor/maplibre/maplibre.mjs',    then: '#/boneyard' },
  { key: 'maplibre-gl.js',    pattern: /\/vendor\/maplibre\/maplibre-gl\.js(\?|$)/, precacheKey: 'vendor/maplibre/maplibre-gl.js', then: '#/boneyard' },
  { key: 'maplibre-gl.css',   pattern: /\/vendor\/maplibre\/maplibre-gl\.css(\?|$)/,precacheKey: 'vendor/maplibre/maplibre-gl.css', then: '#/boneyard' },
];

for (const c of CANDIDATES) {
  console.log(`\n--- blocking ${c.key}${c.then ? ` then navigating to ${c.then}` : ''} ---`);
  const m = await measureWithBlocked(c.pattern, { then: c.then });
  const covered = precached.has(c.precacheKey);
  /* Classification order matters:
       1. If the request was NEVER MADE, blocking it is a no-op measurement,
          not evidence of anything. Kind = NOT-AT-BOOT (or NOT-ON-ROUTE if
          `then` was set and it still did not fire). Verdict = ok, but the
          asset gets no BOOTS-WITHOUT/FATAL claim from this run.
       2. Boot failed reaching readiness  => FATAL-AT-BOOT. Real outage risk.
       3. Boot ok but `then` screen failed (empty screen, no map) => FATAL-ON-<route>.
          Whole app lives; that ONE screen dies. Also a real risk, gentler shape.
       4. Boot ok, `then` (if any) ok      => BOOTS-WITHOUT. */
  const fatalAtBoot = !m.ready;
  /* On a follow-up route, "fatal" means the SCREEN'S THING did not
     instantiate: for #/boneyard that is the map. If hasMap is true, the
     screen is up (even if unstyled because a css bundle was blocked), and
     the honest label is BOOTS-WITHOUT on that screen, not FATAL. Without
     this the CSS-only case reads as FATAL because the map draws no text.
     A screen-agnostic check (screenKids/screenText) is too crude for
     visual screens; the specific "hasMap" is a per-route usable signal. */
  const fatalOnRoute = c.then && m.ready && m.thenState
    && !m.thenState.hasMap;
  const notFetched = m.blockedCount === 0;
  let kind;
  if (notFetched) kind = c.then ? 'NOT-ON-ROUTE' : 'NOT-AT-BOOT';
  else if (fatalAtBoot) kind = 'FATAL-AT-BOOT';
  else if (fatalOnRoute) kind = `FATAL-ON-${c.then}`;
  else kind = 'BOOTS-WITHOUT';
  const isFatal = kind.startsWith('FATAL');
  const verdict = isFatal && !covered ? 'fail' : 'ok';
  const detail = `${kind}  ready=${m.ready} ${m.elapsed}ms  tabs=${m.state.tabs} screenKids=${m.state.screenKids} screenText=${m.state.screenTextLen}${m.thenState ? ` | route ${c.then}: screenKids=${m.thenState.screenKids} screenText=${m.thenState.screenTextLen} hasMap=${m.thenState.hasMap}` : ''}  blocked=${m.blockedCount} sample=${m.sampleBlocked || 'none'}  covered-in-precache=${covered}  console-errors=${m.consoleErrors.length}`;
  say(verdict, `blocking ${c.key}`, detail);
  if (isFatal && !covered) {
    console.log(`\nHARD STOP: ${c.key} is ${kind} and NOT in PRECACHE. This is the same shape as the 2026-08-12 outage.`);
    console.log(`  first blocked URL: ${m.sampleBlocked}`);
    console.log(`  console errors (first 5):`);
    for (const e of m.consoleErrors.slice(0, 5)) console.log(`    ${e}`);
    await srv.kill();
    process.exit(1);
  }
}

/* BYTE WEIGHT MEASUREMENT.
 *
 * sw.js's install is Promise.all over the full PRECACHE list (sw.js:135), so
 * the whole worker fails to install if ANY entry cannot be fetched on a bad
 * line. Total install bytes is therefore the single number that predicts a
 * first-open failure rate: bigger install, higher chance one request drops.
 * Each entry's share of the total tells us which drops would matter most.
 *
 * Fetch each PRECACHE entry once at the SAME local origin the audit is
 * measuring against, so the numbers reflect this build's real payload.
 * Uses Content-Length when the server sends it, falls back to the length
 * of the response body for local http.server (which is always length-aware
 * for static files). Skips './' (a directory alias for index.html). */
async function measurePrecacheBytes(baseUrl) {
  const url = baseUrl.replace(/\/?$/, '/');
  const entries = [...precacheArr.matchAll(/['"]\.\/([\w/.-]+)['"]/g)].map(m => m[1]);
  const rows = [];
  for (const p of entries) {
    if (!p || p === '') continue;
    try {
      const r = await fetch(url + p);
      if (!r.ok) { rows.push({ path: p, bytes: 0, note: `HTTP ${r.status}` }); continue; }
      const cl = r.headers.get('content-length');
      const buf = await r.arrayBuffer();
      const bytes = cl ? Math.max(+cl, buf.byteLength) : buf.byteLength;
      rows.push({ path: p, bytes });
    } catch (e) {
      rows.push({ path: p, bytes: 0, note: `err ${String(e).slice(0, 60)}` });
    }
  }
  return rows;
}

console.log('\n--- byte weight of PRECACHE ---');
const byteRows = await measurePrecacheBytes(base);
const totalBytes = byteRows.reduce((s, r) => s + r.bytes, 0);
byteRows.sort((a, b) => b.bytes - a.bytes);
console.log(`TOTAL: ${totalBytes.toLocaleString()} bytes across ${byteRows.length} entries (${(totalBytes / 1024).toFixed(1)} KB, ${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
console.log('top 15 by size (path, bytes, % of total):');
for (const r of byteRows.slice(0, 15)) {
  const pct = totalBytes ? (r.bytes * 100 / totalBytes).toFixed(1) : '0';
  const note = r.note ? `  ${r.note}` : '';
  console.log(`  ${r.bytes.toString().padStart(10)}  ${pct.padStart(5)}%  ${r.path}${note}`);
}
say(totalBytes > 0 ? 'ok' : 'fail', 'BYTES  the PRECACHE payload was actually measured (an empty measurement is a FAILURE)',
    `${totalBytes.toLocaleString()} bytes across ${byteRows.length} entries`);

/* Candidate cross-reference: BOOTS-WITHOUT/NOT-* status per candidate, with
   its byte share. The write-up uses this to argue cost/benefit for each. */
const candidateRows = CANDIDATES.map(c => {
  const r = results.find(r => r.name === `blocking ${c.key}`);
  const kind = r ? (r.detail.match(/^(FATAL-AT-BOOT|FATAL-ON-[^\s]+|BOOTS-WITHOUT|NOT-AT-BOOT|NOT-ON-ROUTE)/) || [])[0] : '?';
  const size = byteRows.find(b => b.path === c.precacheKey)?.bytes || 0;
  const pct = totalBytes ? (size * 100 / totalBytes).toFixed(1) : '0';
  return { key: c.key, kind, size, pct, precacheKey: c.precacheKey, coveredInPrecache: precached.has(c.precacheKey) };
});
console.log('\n--- candidate summary (kind, bytes, % of PRECACHE) ---');
for (const r of candidateRows) {
  console.log(`  ${r.kind.padEnd(15)}  ${r.size.toString().padStart(10)}  ${r.pct.padStart(5)}%  ${r.precacheKey}${r.coveredInPrecache ? '' : '  [NOT-IN-PRECACHE]'}`);
}
const measuredCosmeticInPrecache = candidateRows.filter(r => r.kind === 'BOOTS-WITHOUT' && r.coveredInPrecache);
const unmeasuredInPrecache = candidateRows.filter(r => /NOT-(AT-BOOT|ON-ROUTE)/.test(r.kind) && r.coveredInPrecache);
if (measuredCosmeticInPrecache.length) console.log(`\nBOOTS-WITHOUT and currently in PRECACHE (needs cost/benefit, NOT auto-droppable): ${measuredCosmeticInPrecache.map(r => `${r.key} (${(r.size/1024).toFixed(1)}KB, ${r.pct}%)`).join(', ')}`);
if (unmeasuredInPrecache.length) console.log(`NOT-MEASURED here (request never fired in this scenario): ${unmeasuredInPrecache.map(r => `${r.key} (${(r.size/1024).toFixed(1)}KB, ${r.pct}%)`).join(', ')}`);

await srv.kill();
console.log(bad ? `\n${bad} FAILED` : `\nPRECACHE ASSETS VERIFIED  (${CANDIDATES.length} candidates measured; total PRECACHE ${(totalBytes / 1024).toFixed(1)}KB)`);
process.exit(bad ? 1 : 0);
