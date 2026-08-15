/* LOCATION IS ONLY EVER ASKED FOR WHEN THE PLAYER ASKED FOR THE MAP.
 *
 * The bug: a player gets the iOS location prompt seconds after opening the app,
 * with nothing tapped, worse after days away.
 *
 * The chain (traced in app.js, every hop):
 *   1. renderBoneyard ends with `if (await kvGet('map-seen', false)) startMap()`.
 *      Open the map once, ever, and the Boneyard auto-starts it from then on.
 *   2. startMap() calls navigator.geolocation.getCurrentPosition. It is the only
 *      getCurrentPosition call in the app.
 *   3. A new build makes the app reload ITSELF: controllerchange -> location.reload().
 *   4. A reload KEEPS THE HASH. A player last on #/boneyard is dropped straight
 *      back onto the map by a navigation they did not perform, and the prompt
 *      fires while the app is still loading. start_url is "./" with no hash, so
 *      a genuine cold launch lands on Today: a reload is the ONLY way to arrive
 *      at #/boneyard untapped.
 *
 * What this locks down, with navigator.geolocation stubbed and every
 * getCurrentPosition COUNTED in sessionStorage so the count survives the reload:
 *   STUB      the counting stub is genuinely installed. Measured 2026-08-15: an
 *             earlier draft installed it AFTER the first load, so the real API
 *             was live, Chrome denied it, and the count read 0 for a reason that
 *             had nothing to do with the app. A counter nobody wired reads 0
 *             forever, which is a green light bolted over the bug.
 *   NAV-AUTO  tapping the Boneyard TAB does auto-start: exactly 1 call. This is
 *             the half that goes red if the fix over-reaches and simply deletes
 *             the auto-start for everyone.
 *   RENDERED  after the reload the app really is on the Boneyard screen.
 *             Without this a count of 0 is vacuous: a Boneyard that never
 *             rendered also never asks for location. An empty sample is a FAIL.
 *   NO-AUTO   0 getCurrentPosition calls after the reload, before any tap.
 *   TAP       tapping #mapStart still asks for location: exactly 1 call.
 *             A fix that never asks at all is not a fix, it is a broken map.
 *
 * HOW THE RELOAD IS SIMULATED: the page runs `location.reload()` itself, the
 * identical statement app.js line ~515 runs on controllerchange. The service
 * worker cannot be used here (registration is gated on !S.demo && https, and
 * this harness is ?demo over http), but the fix does not inspect WHY the reload
 * happened. It depends on three properties of location.reload(), and all three
 * hold: the hash is preserved, page JS state is destroyed, and no hashchange
 * fires. The untested gap is the controllerchange listener itself.
 *
 * PROVE-RED (confirmed 2026-08-15, pristine origin/main 0e9a746 in a throwaway
 * tree): STUB / NAV-AUTO / RENDERED pass, NO-AUTO fails with 1 call before any
 * tap, TAP fails because the auto-started map has already replaced the
 * #mapStart button with the map itself.
 *
 * Usage: node tests/boneyard-geo-intent-audit.mjs      (URL=... for a live build)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree, dismissOverlays } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srvHandle = null;
let base = process.env.URL;
if (!base) { srvHandle = await serveTree(ROOT); base = srvHandle.url; }

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const { browser, page } = await boot(base);

/* The stub replaces geolocation entirely and counts every call in
   sessionStorage, which survives location.reload() in the same tab. Installed
   with evaluateOnNewDocument so it is in place before app.js runs on the first
   load AND on the reloaded document. */
await page.evaluateOnNewDocument(() => {
  const bump = k => sessionStorage.setItem(k, String(Number(sessionStorage.getItem(k) || 0) + 1));
  const fix = { coords: { latitude: 49.2827, longitude: -123.1207, accuracy: 5, heading: null, speed: 0 }, timestamp: Date.now() };
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition(success) { bump('__gcp'); setTimeout(() => success(fix), 30); },
      watchPosition(success) { bump('__watch'); setTimeout(() => success(fix), 300); return 1; },
      clearWatch() {},
    },
  });
});

const counts = () => page.evaluate(() => ({
  gcp: Number(sessionStorage.getItem('__gcp') || 0),
  watch: Number(sessionStorage.getItem('__watch') || 0),
}));
const zero = () => page.evaluate(() => { sessionStorage.removeItem('__gcp'); sessionStorage.removeItem('__watch'); });

// The player has opened the map before: that is the whole precondition for the
// auto-start. Written straight into the demo kv store, the same way seed() does.
const seeded = await page.evaluate(async () => {
  if (!new URLSearchParams(location.search).has('demo')) return { error: 'not in ?demo mode' };
  const db = await new Promise((res, rej) => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put({ k: 'map-seen', v: true }); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  const row = await new Promise((res, rej) => { const tx = db.transaction('kv', 'readonly'); const q = tx.objectStore('kv').get('map-seen'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  return { readback: row && row.v };
});
if (seeded.error || seeded.readback !== true) { console.log(`FAIL  SETUP  map-seen not seeded (${JSON.stringify(seeded)})`); process.exit(1); }

/* boot() already loaded the page, so the stub above is only live from the NEXT
   document on. Reload to get a document that has it from the first line of
   app.js, which is also the state a real player is in. Lands on Today: the
   start_url carries no hash. */
await page.reload({ waitUntil: 'networkidle2' });
await sleep(3000);
await dismissOverlays(page);

const stubbed = await page.evaluate(() => String(navigator.geolocation.getCurrentPosition).includes('bump'));
ok('STUB', stubbed, stubbed ? 'counting stub is live on this document' : 'the real geolocation API is live — every count below is meaningless');

// Navigate to the Boneyard the way a player does: tap the tab. This SHOULD
// auto-start the map, and it puts #/boneyard in the hash for the reload to restore.
await zero();
await page.evaluate(() => document.querySelector('#tabbar .tab[data-tab="boneyard"]').click());
await sleep(4000);
const nav = await counts();
const hashBefore = await page.evaluate(() => location.hash);
ok('NAV-AUTO', hashBefore === '#/boneyard' && nav.gcp === 1,
  `tapped the Boneyard tab -> hash=${hashBefore} getCurrentPosition x${nav.gcp} (want 1)`);

// Now the reload. Counter back to zero first so what we measure is only what
// the restored page does on its own.
await zero();
await Promise.all([
  page.waitForNavigation({ waitUntil: 'networkidle2' }),
  page.evaluate(() => location.reload()),   // the identical call app.js makes on controllerchange
]);
await sleep(6000);   // generous: renderBoneyard is async and boot has a long await chain

const after = await page.evaluate(() => ({
  hash: location.hash,
  mapScreen: !!document.querySelector('#screen.screen--map'),
  boneyardTabActive: !!document.querySelector('#tabbar .tab[data-tab="boneyard"].active'),
  hasStart: !!document.querySelector('#mapStart'),
  bodyText: (document.querySelector('#screen')?.innerText || '').slice(0, 80).replace(/\s+/g, ' '),
}));
const c1 = await counts();

ok('RENDERED', after.hash === '#/boneyard' && after.mapScreen && after.boneyardTabActive,
  `hash=${after.hash} mapScreen=${after.mapScreen} tabActive=${after.boneyardTabActive} screen="${after.bodyText}"`);
ok('NO-AUTO', c1.gcp === 0,
  `getCurrentPosition x${c1.gcp} watchPosition x${c1.watch} before any tap (want 0)`);

// And the player can still get the map by asking for it.
await dismissOverlays(page);
const tapped = await page.evaluate(() => { const b = document.querySelector('#mapStart'); if (!b) return false; b.click(); return true; });
await sleep(3000);
const c2 = await counts();
ok('TAP', tapped && c2.gcp === 1,
  tapped ? `#mapStart tapped -> getCurrentPosition x${c2.gcp} (want 1)` : 'no #mapStart button on screen to tap');

await browser.close();
srvHandle?.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (!results.length) { console.log('EMPTY SAMPLE — nothing was checked'); process.exit(1); }
process.exit(failed.length ? 1 : 0);
