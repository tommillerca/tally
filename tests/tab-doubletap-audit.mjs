/* DOUBLE-TAP THE TAB YOU ARE ALREADY ON.
 *
 * Tom, 2026-08-22: "Double tapping today should bring you to the top of today.
 * Double tapping the boneyard when you're in there should zoom in on your
 * current location."
 *
 * THE DANGEROUS HALF IS THE GUARD, not the two actions. A same-tab tap used to
 * route() on the spot, and route() rebuilds the screen from scratch: on the
 * Boneyard that tears down the live MapLibre instance, so the first tap of a
 * double would throw away the map the second tap is meant to move. The fix makes
 * a same-tab tap on these two tabs wait 300ms for a second one. Everything else
 * must be untouched, which is what the SINGLE rows are for.
 *
 * EVERY TAP HERE IS A REAL MOUSE CLICK on the real tab bar at the button's own
 * coordinates. Nothing calls the handler, and nothing calls scrollTo or the map.
 *
 * THE PROBES ARE OUTCOME STATE, and each pair is deliberate, because the pure
 * position rows can go green on the BROKEN tree for the wrong reason (a rebuild
 * also lands at the top, and a remade map also opens centred on you):
 *   a dataset marker on #screen's rendered child   present = the DOM survived,
 *                                                  i.e. no re-route happened
 *   an expando on the live map instance            present = the same map moved,
 *                                                  not a fresh one
 * So the position row and the identity row cannot both pass on a re-route.
 *
 * FALLBACK is the branch the fix could most easily leave dead: on the Boneyard
 * before the map is up there is no #mapRecenter to fire, and a tray tap that
 * does nothing at all is the exact complaint bindTabs' own header answers. It is
 * graded on the location gate, which needs no WebGL.
 *
 * The two YARD rows need a live map (WebGL + a reachable tile host) and report
 * UNPROVEN (exit 97) without one, per godmode's capability contract.
 *
 * PROVEN RED three ways, each in a throwaway tree seeded with `git archive HEAD`
 * plus one edited file, never a checkout:
 *   pre-fix js/app.js (d8819940)   TODAY-DBL's marker row (the first tap rebuilt
 *     the screen) and YARD-DBL's identity row (the map was torn down and remade,
 *     with a live PAGEERROR from the teardown). Both POSITION rows stayed GREEN
 *     on that tree, at scrollTop 0 and dead on the player: the rebuild lands at
 *     the top and reopens centred on you, which is exactly why neither of them
 *     is allowed to carry a row on its own.
 *   the fallback dropped (`if (second) { dbl(); return; }`)   FALLBACK alone.
 *   the cancel moved below the hash check (the shape this was written from)
 *     STALE alone, at 2 map builds for one arrival.
 *
 * Run: node tests/tab-doubletap-audit.mjs [baseUrl]   (serves this repo if omitted)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree, boneyardCapability, unproven, unprovenReport, exitFor } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv[2] || process.env.URL;
const srv = argv ? null : await serveTree(ROOT);
const base = argv || srv.url;
const fails = [];
const ok = (name, pass, detail = '') => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!pass) fails.push(name); };

/* The zoom the map's own recentre control returns to, read from the source of
   truth rather than pinned to a number here. */
const MAP_START_ZOOM = parseFloat(fs.readFileSync(path.join(ROOT, 'js', 'map.js'), 'utf8').match(/MAP_START_ZOOM\s*=\s*([\d.]+)/)?.[1] || 'NaN');
const GEO = { latitude: 49.2827, longitude: -123.1207 };

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
await page.setGeolocation(GEO);

const tapTab = async (tab, n = 1, gap = 120) => {
  const at = await page.evaluate(t => {
    const b = [...document.querySelectorAll('#tabbar .tab')].find(x => x.dataset.tab === t);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
  }, tab);
  if (!at) return false;
  for (let i = 0; i < n; i++) { await page.mouse.click(at.x, at.y); if (i + 1 < n) await sleep(gap); }
  return true;
};
const mark = () => page.evaluate(() => { const c = document.getElementById('screen').firstElementChild; if (c) c.dataset.dblProbe = '1'; return !!c; });
const marked = () => page.evaluate(() => document.getElementById('screen').firstElementChild?.dataset.dblProbe === '1');
const scrollTop = () => page.evaluate(() => document.getElementById('screen').scrollTop);

/* ---------------- TODAY ---------------- */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1800);
const scrolled = await page.evaluate(() => { const s = document.getElementById('screen'); s.scrollTop = 700; return s.scrollTop; });
ok('SETUP Today is scrolled well below the top', scrolled > 200, `scrollTop ${scrolled}`);
ok('SETUP the screen carries a marker so a rebuild is detectable', await mark());

ok('SETUP the Today tab took two real taps', await tapTab('today', 2));
let top = scrolled;
for (let i = 0; i < 40 && top >= 2; i++) { await sleep(100); top = await scrollTop(); }
ok('TODAY-DBL a double tap brings Today back to the top', top < 2, `scrollTop ${top}`);
ok('TODAY-DBL and the first tap did NOT re-route: the scrolled screen survived',
  await marked(), 'marker gone = the screen was rebuilt under the scroll');

/* The control. A lone same-tab tap still re-routes to Today's home, which is
   tray-destination-audit's contract and must not have moved. */
await page.evaluate(() => { document.getElementById('screen').scrollTop = 700; });
await mark();   // re-marked, not carried over: the control must not depend on the row above passing
ok('SETUP the single-tap control starts scrolled and marked', await scrollTop() > 200 && await marked());
await tapTab('today', 1);
await sleep(1800);
const single = { top: await scrollTop(), probe: await marked() };
ok('TODAY-SINGLE a lone tap still lands at the top of Today', single.top < 2, `scrollTop ${single.top}`);
ok('TODAY-SINGLE by re-routing, exactly as before', !single.probe, 'marker survived = route() never ran');

/* ---------------- BONEYARD ---------------- */
await tapTab('boneyard', 1);
await sleep(1600);
/* First arrival is the location gate, which is also the state where there is no
   map to recentre: the fallback branch, and it needs no WebGL to grade. */
const gate = await page.evaluate(() => !!document.getElementById('mapStart') && !document.getElementById('mapRecenter'));
if (gate) {
  ok('SETUP the Boneyard gate is up and marked (no map yet, so no #mapRecenter)', await mark());
  ok('SETUP the Boneyard tab took two real taps', await tapTab('boneyard', 2));
  await sleep(900);
  ok('FALLBACK a double tap with no map to move still routes rather than doing nothing',
    !await marked() && await page.evaluate(() => !!document.getElementById('mapStart')),
    'marker survived = both taps were swallowed');
} else {
  unproven('FALLBACK a double tap with no map to move still routes rather than doing nothing',
    'the Boneyard did not open on its location gate, so the no-map state was not reachable');
}

await page.evaluate(() => document.getElementById('mapStart')?.click());
let hasMap = false;
for (let i = 0; i < 40 && !hasMap; i++) { await sleep(500); hasMap = await page.evaluate(() => !!window.__map && !!document.getElementById('mapRecenter')); }

if (!hasMap) {
  const cap = await boneyardCapability(page);
  unproven('YARD-DBL a double tap recentres the map on the player at the start zoom', 'the Boneyard map never came up on this machine');
  unproven('YARD-DBL on the SAME live map, not a rebuild', 'same');
  unprovenReport('tab-doubletap-audit', cap);
} else {
  await sleep(2500);   // let first placement settle before shoving the camera
  const displaced = await page.evaluate(() => {
    const m = window.__map;
    m.__dblProbe = 1;            // survives easeTo, dies with the instance
    m.jumpTo({ center: [m.getCenter().lng + 0.03, m.getCenter().lat + 0.02], zoom: m.getZoom() - 2 });
    const c = m.getCenter();
    return { lng: c.lng, lat: c.lat, zoom: m.getZoom() };
  });
  await sleep(400);
  ok('SETUP the camera was displaced from the player', Math.abs(displaced.lng - GEO.longitude) > 0.01, JSON.stringify(displaced));
  ok('SETUP the Boneyard tab took two real taps', await tapTab('boneyard', 2));
  let cam = null, home = false;
  for (let i = 0; i < 50 && !home; i++) {
    await sleep(120);
    cam = await page.evaluate(() => {
      const m = window.__map;
      if (!m) return null;
      const c = m.getCenter();
      return { lng: c.lng, lat: c.lat, zoom: m.getZoom(), probe: m.__dblProbe === 1 };
    });
    home = !!cam && Math.abs(cam.lng - GEO.longitude) < 0.002 && Math.abs(cam.lat - GEO.latitude) < 0.002
      && Math.abs(cam.zoom - MAP_START_ZOOM) < 0.5;
  }
  ok('YARD-DBL a double tap recentres the map on the player at the start zoom', home,
    `${JSON.stringify(cam)} vs ${GEO.longitude},${GEO.latitude} @ ${MAP_START_ZOOM}`);
  ok('YARD-DBL on the SAME live map, not a rebuild', !!cam && cam.probe === true,
    'expando gone = the map was torn down and remade');

  /* THE ARMED WAIT IS CANCELLED BY THE NEXT TAB TAP. Tap Today while on Today
     (which arms it), then leave for the Boneyard inside the window: a stale
     timer fires route() AFTER the hashchange already routed, and route() reads
     the CURRENT hash, so the Boneyard would render twice and build a second map
     over the one it just built. Counted at the app's own assignment site
     (js/app.js `window.__map = map`), so the probe is the real build, not a
     proxy. Healthy is exactly ONE build per arrival; this row is proven red by
     mutation (drop the clearTimeout) rather than by the pre-fix tree, which has
     no armed wait to leave behind. */
  await page.evaluate(() => {
    let m = window.__map, n = 0;
    Object.defineProperty(window, '__map', { configurable: true, get: () => m, set: v => { m = v; window.__mapBuilds = ++n; } });
    window.__mapBuilds = 0;
  });
  await tapTab('today', 1);
  await sleep(1600);
  await page.evaluate(() => { window.__mapBuilds = 0; });
  await tapTab('today', 1);      // arms the same-tab wait on Today
  await sleep(100);              // well inside the 300ms window
  await tapTab('boneyard', 1);   // navigates away; the armed wait must not survive it
  await sleep(2400);
  const builds = await page.evaluate(() => window.__mapBuilds);
  ok('STALE leaving a tab inside the double-tap window builds the next screen ONCE',
    builds === 1, `${builds} map builds on one arrival (a stale route() rebuilds it)`);
}

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`);
await browser.close();
srv?.close();
process.exit(exitFor(fails.length));
