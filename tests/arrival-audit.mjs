/* ONE ARRIVAL: NOTHING APPEARS AFTER THE MAP IS ON SCREEN.
 *
 * Tom, 2026-08-08: "the boneyard is still loading in POIs at different times ...
 * it looks cheap when everything staggers in." That contract has now been broken
 * twice by the same shape of bug, so this is the slim, FAST-tier guard for it:
 * boneyard-audit carries the same check but sits in the FULL tier, which is how
 * the 2026-08-11 regression shipped unseen.
 *
 * WHAT IT MEASURES, AND WHY THIS SHAPE. Not "count the dens": a count tells you
 * something changed and nothing about what, and the last regression was ONE
 * marker out of twelve. This records, per POI class, the moment each marker
 * becomes VISIBLE (computed opacity, not DOM presence: MapLibre writes inline
 * opacity and a held marker is in the DOM the whole time), and fails naming the
 * class and the delay if any of them turns up after `.markers-in`.
 *
 * PROVE-RED, run 2026-08-12 on main at 0240e7f, twice, deterministic:
 *     FAIL  ARRIVAL nothing becomes visible after the reveal
 *           den +2040ms (1 marker)  reveal at 15682ms
 * The late marker was identified as a ROAMING den (class "map-den-mark roaming")
 * arriving through the post-reveal beat machinery as a beat of one.
 *
 * An empty sample is a FAILURE: zero markers seen means the map never drew and
 * every assertion below would be vacuously true.
 *
 * Usage: node tests/arrival-audit.mjs [baseUrl]   (serves this repo if omitted)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srvHandle = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srvHandle.url;

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

/* The recorder runs from before navigation: the reveal is the moment being
   measured, so a probe installed after boot has already missed it. */
await page.evaluateOnNewDocument(() => {
  window.__arrival = { t0: performance.now(), reveal: null, seen: new Map(), late: [] };
  const KINDS = { 'map-spawn': 'spawn', 'map-den-mark': 'den', 'map-mini-mark': 'mini',
    'map-spire': 'spire', 'map-glutton-mark': 'glutton' };
  setInterval(() => {
    const a = window.__arrival;
    const t = Math.round(performance.now() - a.t0);
    const stage = document.getElementById('mapStage');
    if (stage && stage.classList.contains('markers-in') && a.reveal == null) a.reveal = t;
    for (const [cls, kind] of Object.entries(KINDS)) {
      for (const el of document.querySelectorAll('.' + cls)) {
        if (!(+getComputedStyle(el).opacity > 0.01)) continue;   // held markers are in the DOM
        if (a.seen.has(el)) continue;
        a.seen.set(el, t);
        // AFTER the reveal, with no user action, is the whole bug
        if (a.reveal != null && t - a.reveal > 250) a.late.push({ kind, at: t, after: t - a.reveal, cls: el.className });
      }
    }
  }, 40);
});

await seed(page, { level: 18, coins: 500 });
await page.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(2500);
// the Boneyard opens on a location explainer; the map is behind its button
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
  if (b) b.click();
});
await sleep(20000);   // cold tiles on a loaded box: the late arrival lands ~2s after a ~15s reveal

const a = await page.evaluate(() => ({
  reveal: window.__arrival.reveal,
  total: window.__arrival.seen.size,
  late: window.__arrival.late,
}));

ok('SETUP the map revealed at all (never revealing is its own failure)', a.reveal != null, `reveal at ${a.reveal}ms`);
ok('SETUP markers were drawn (an empty sample is a FAILURE)', a.total > 0, `${a.total} markers seen`);
const byKind = a.late.reduce((m, l) => { (m[l.kind] = m[l.kind] || []).push(l); return m; }, {});
const summary = Object.entries(byKind)
  .map(([k, l]) => `${k} +${Math.min(...l.map(x => x.after))}ms (${l.length} marker${l.length === 1 ? '' : 's'})`)
  .join(', ');
ok('ARRIVAL nothing becomes visible after the reveal', a.late.length === 0,
  a.late.length ? `${summary}  reveal at ${a.reveal}ms  [${[...new Set(a.late.map(l => l.cls))].join(' | ')}]` : `${a.total} markers, all before the reveal`);

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await browser.close();
srvHandle?.close();
process.exit(failed ? 1 : 0);
