/* THE WORLD FOLLOWS WHERE YOU LOOK, AND STAYS THE SAME SIZE.
 *
 * Tom, 2026-08-08: "right now when I look through the boneyard I can't see
 * spires outside a certain location or other POIs. The map should continue to
 * load other POIs if you keep looking. Just make sure that this feature doesn't
 * make the app load slower."
 *
 * Every POI generator builds a fixed 3x3 grid of cells around a point, and that
 * point was always the GPS fix. Panning moved the camera across a map that could
 * never resolve anything new. Generation is now anchored to `scoutLat/scoutLng`,
 * which tracks the map centre.
 *
 * Both halves of his ask are load-bearing, so both are asserted:
 *   SCOUT     panning to new ground resolves dens/spires that were NOT there
 *   BOUNDED   the marker count does NOT grow while doing it (the window MOVES,
 *             it does not widen) — this is the "doesn't make the app slower" half
 *   ANCHORED  distance is still measured from YOUR fix, so looking at a far den
 *             never puts it in range
 *   NONEMPTY  an empty marker set is a FAILURE, never a pass (rule 3)
 *
 * Positions are read back through map.unproject(), so they are real world
 * coordinates and survive the pan that a screen-space check would not.
 *
 * PROVE-RED: point densNear/spiresNear back at (lat, lng) instead of
 * (scoutLat, scoutLng) in js/app.js and SCOUT fails with zero new POIs.
 *
 * Usage: node tests/scout-audit.mjs           (URL=... for live)
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree} from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srv = null, srvHandle = null;
let base = process.env.URL;
if (!base) {
  /* serveTree: a free port from the OS, and a HARD ERROR if python never
     bound. The hard-coded port with stdio:'ignore' meant a stranded server
     already holding it made this audit talk to whatever was listening. */
  srvHandle = await serveTree(ROOT);
  srv = { kill: () => srvHandle.close() };
  base = srvHandle.url;
}
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const HOME = { lat: 49.2488, lng: -123.0010 };

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const origin = new URL(base).origin;
await browser.defaultBrowserContext().overridePermissions(origin, ['geolocation']);
await page.setGeolocation({ latitude: HOME.lat, longitude: HOME.lng });
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

await seed(page, { level: 18, coins: 500 });
await page.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(2500);
// the Boneyard opens on a location explainer; the map is behind its button
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
  if (b) b.click();
});
await sleep(9000);

// Read every POI marker back as a real world coordinate via the map's own
// projection, so identities survive a camera move.
const readWorld = () => page.evaluate(() => {
  const m = window.__map;
  if (!m) return null;
  const KINDS = { den: '.map-den-mark', spire: '.map-spire', mini: '.map-mini-mark', spawn: '.map-spawn' };
  const out = {};
  for (const [kind, sel] of Object.entries(KINDS)) {
    out[kind] = [...document.querySelectorAll(sel)].map(el => {
      const r = el.getBoundingClientRect();
      const p = m.unproject([r.left + r.width / 2, r.top + r.height / 2]);
      return `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    });
  }
  out.center = (() => { const c = m.getCenter(); return { lat: c.lat, lng: c.lng }; })();
  return out;
});

const before = await readWorld();
if (!before) {
  ok('SCOUT harness: window.__map exposed', false, 'no map instance — cannot drive a camera move');
} else {
  ok('NONEMPTY before: the map resolved POIs at all', (before.den.length + before.spire.length) > 0,
    `dens ${before.den.length}, spires ${before.spire.length}`);

  /* Look ~3 den-cells east (DEN_CELL_DEG is 0.01, so 0.03 clears the whole 3x3
     window). jumpTo is the real camera control: it fires movestart/moveend/idle
     exactly like a drag, so the app's own placement pass is what runs. */
  await page.evaluate(({ lat, lng }) => {
    window.__map.jumpTo({ center: [lng + 0.03, lat] });
  }, HOME);
  await sleep(6000);

  const after = await readWorld();
  const movedKm = Math.round(Math.abs(after.center.lng - before.center.lng) * 111 * Math.cos(HOME.lat * Math.PI / 180) * 10) / 10;

  ok('NONEMPTY after: POIs exist at the new view', (after.den.length + after.spire.length) > 0,
    `dens ${after.den.length}, spires ${after.spire.length} after panning ${movedKm}km`);

  const wasDen = new Set(before.den), wasSpire = new Set(before.spire);
  const newDens = after.den.filter(p => !wasDen.has(p));
  const newSpires = after.spire.filter(p => !wasSpire.has(p));
  ok('SCOUT: panning to new ground resolves POIs that were not there',
    (newDens.length + newSpires.length) > 0,
    `${newDens.length} new dens, ${newSpires.length} new spires`);

  /* Say out loud which layers this run did NOT exercise, so a green tick is never
     mistaken for coverage it does not have (rule 1 + rule 3). At these test
     coordinates the walkability snap suppresses every spire, so the spire half of
     the scouting change is proven in tests/unit.test.js instead, not here. */
  if (before.spire.length === 0 && after.spire.length === 0) {
    console.log('WARN  spire layer never rendered at these coordinates — SCOUT above is DEN-ONLY evidence.');
    console.log('      Spire anchoring is covered by "scouting: den + spire generators follow their anchor" in unit.test.js.');
  }

  /* Tom's constraint, asserted rather than asserted-about: the generation window
     MOVES, it never widens, so the marker budget after scouting is the same order
     as before. A generator that grew its grid to cover the viewport would blow
     this and would be the thing that made the map slow. */
  const beforeTotal = before.den.length + before.spire.length + before.mini.length;
  const afterTotal = after.den.length + after.spire.length + after.mini.length;
  ok('BOUNDED: scouting does not grow the marker count',
    afterTotal <= Math.max(beforeTotal, 4) * 1.6,
    `${beforeTotal} -> ${afterTotal} markers`);

  /* Distance is still measured from the player, not the camera. Nothing 3km away
     may be reported as reachable just because you looked at it. */
  const reach = await page.evaluate(() => {
    const btn = document.querySelector('#mapDen');
    const vis = btn && !btn.hidden && getComputedStyle(btn).display !== 'none' && btn.getBoundingClientRect().width > 0;
    return { enterVisible: !!vis };
  });
  ok('ANCHORED: a den you only looked at is not enterable', reach.enterVisible === false,
    reach.enterVisible ? 'Enter the den is showing after panning 3km away' : 'enter button correctly hidden');
}

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
