/* APPLE HEALTH INTAKE: parseHkPayload + syncFromClipboard + ingestHealth.
 *
 * This is HOW STEPS ENTER THE APP on non-native builds. The clipboard path
 * (Settings -> APPLE HEALTH -> Sync from clipboard now) reads
 * navigator.clipboard, passes it to parseHkPayload (js/game.js:564), and
 * pipes the return through ingestHealth (js/app.js:9558) which writes a
 * `health` row and, when weightKg is present, also a `weights` row.
 *
 * Steps drive the egg, the map spawns, the step race, walk XP, per-pet
 * banked steps. A parse regression here does not throw; it silently
 * ingests nothing (payload:null), or worse, ingests HALF the fields it
 * intended and writes garbage into a row for the day. The dangerous
 * outcome, per Gwart, is the same shape as backup Finding C: a write
 * path with no atomicity where a partial parse writes a partial row.
 *
 * WHAT THIS AUDIT MEASURES:
 *   1. parseHkPayload's happy path: the exact clipboard template the
 *      Shortcut writes -> steps/active/weight fields land where they
 *      should, with correct types + conversions.
 *   2. parseHkPayload's REJECTION path: empty, no-marker random text,
 *      negative numbers, non-numeric values, out-of-range weight.
 *      Every one must return null and any subsequent ingest must be a
 *      no-op on the `health` store for that date.
 *   3. syncFromClipboard end-to-end: stub navigator.clipboard.readText
 *      to return a valid payload, click #hkSyncNow, assert the health
 *      row landed. Then stub it to return garbage and assert NOTHING
 *      landed (the atomicity guarantee).
 *   4. ingestHealth PRESERVES pre-existing fields for the date: seed a
 *      row with some fields, ingest a payload with different fields,
 *      the pre-existing fields survive. A destructive re-write would
 *      lose steps history.
 *   5. weight-carrying payloads also write a `weights` row.
 *
 * Any RED against real behaviour = STOP + REPORT per Gwart's brief.
 * Report shape drift as FINDING lines rather than asserting on Reg's
 * file class.
 */
import { boot, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const srv = { kill: () => srvHandle && srvHandle.close() };
const base = argv || srvHandle.url;

const { browser, page } = await boot(base);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

/* -------- SETUP: get the app's own dateKey so a timezone drift cannot make
   the row query miss the write. Same trap I hit on the weight-edit audit. */
const appToday = await page.evaluate(async () => (await import('./js/nutrition.js')).dateKey());

/* -------- 1. parseHkPayload happy path. Call the exported function
   directly (this is testing the parser, not the UI plumbing) with the
   canonical clipboard template. */
const happyParse = await page.evaluate(async d => {
  const { parseHkPayload } = await import('./js/game.js');
  const text = `tally-hk d=${d} steps=8421 active=512 weightlb=184.6 exmin=30 cyclekm=8.2 workouts=1`;
  return { text, out: parseHkPayload(text) };
}, appToday);
console.log('happy parse:', JSON.stringify(happyParse.out));
check('PARSE  the canonical clipboard template parses to a payload',
  happyParse.out != null, `input=${happyParse.text}`);
check('PARSE  date is read out of the string',
  happyParse.out?.date === appToday, `date=${happyParse.out?.date}`);
check('PARSE  steps parses to an integer',
  happyParse.out?.steps === 8421, `steps=${happyParse.out?.steps}`);
check('PARSE  active is aliased into activeKcal',
  happyParse.out?.activeKcal === 512, `activeKcal=${happyParse.out?.activeKcal}`);
check('PARSE  weightlb converts to weightKg via 0.45359237',
  happyParse.out?.weightKg != null && Math.abs(happyParse.out.weightKg - 184.6 * 0.45359237) < 1e-9,
  `weightKg=${happyParse.out?.weightKg}, expected ${184.6 * 0.45359237}`);
check('PARSE  exerciseMin + cycleKm + workouts land',
  happyParse.out?.exerciseMin === 30 && happyParse.out?.cycleKm === 8.2 && happyParse.out?.workouts === 1,
  JSON.stringify({ ex: happyParse.out?.exerciseMin, km: happyParse.out?.cycleKm, w: happyParse.out?.workouts }));

/* -------- 2. parseHkPayload rejection cases. Every one must return null so
   the caller never proceeds to ingestHealth. */
const rejects = await page.evaluate(async () => {
  const { parseHkPayload } = await import('./js/game.js');
  return {
    empty:         parseHkPayload(''),
    randomText:    parseHkPayload('hello world, no marker no keys'),
    markerOnly:    parseHkPayload('tally-hk'),
    negSteps:      parseHkPayload('tally-hk steps=-100'),
    nonNumeric:    parseHkPayload('tally-hk steps=abc'),
    weightOut:    parseHkPayload('tally-hk weightkg=500'),
    weightUnder:  parseHkPayload('tally-hk weightkg=10'),
  };
});
console.log('rejects:', JSON.stringify(rejects));
check('PARSE-REJECT  empty string returns null',
  rejects.empty === null);
check('PARSE-REJECT  random text without the marker or a known key returns null',
  rejects.randomText === null);
check('PARSE-REJECT  the marker with no fields returns null',
  rejects.markerOnly === null);
check('PARSE-REJECT  negative steps returns null (all fields nulled, no marker-only fallback)',
  rejects.negSteps === null);
check('PARSE-REJECT  non-numeric steps returns null',
  rejects.nonNumeric === null);
check('PARSE-REJECT  weight out of range (500 kg) returns null',
  rejects.weightOut === null);
check('PARSE-REJECT  weight under 25 kg returns null',
  rejects.weightUnder === null);

/* -------- 3. syncFromClipboard end-to-end via #hkSyncNow. */
/* Route to Settings + wait for the sync button. The button exists on both
   the "connected" and "not connected" states (settings.hkConnected only
   changes the label from "Sync now" to "Sync from clipboard now"), and
   the click handler is the same. */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(600);
await page.evaluate(() => { location.hash = '#/settings'; });
await page.waitForSelector('#hkSyncNow', { timeout: 10000 });

/* Wipe the health store so the "row lands" check is unambiguous. */
await page.evaluate(async () => {
  const { db } = await import('./js/db.js');
  await db.clear('health');
  await db.clear('weights');
});

/* Stub navigator.clipboard.readText for the next attempts. Puppeteer's
   default context blocks clipboard for real reasons, and the app calls
   navigator.clipboard.readText() at app.js:10729. Overriding the method
   is the least invasive way to feed it a payload from a test. */
async function setClipboard(text) {
  await page.evaluate(t => {
    if (!window.__origClipboardRead) window.__origClipboardRead = navigator.clipboard?.readText;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: async () => t },
    });
  }, text);
}

/* -------- 3a. valid payload -> the row lands. */
const validPayload = `tally-hk d=${appToday} steps=7654 active=321 weightlb=180`;
await setClipboard(validPayload);
await page.evaluate(() => document.querySelector('#hkSyncNow').click());
await sleep(1200);
const afterValid = await page.evaluate(async d => {
  const { db } = await import('./js/db.js');
  return { health: await db.get('health', d), weights: await db.all('weights') };
}, appToday);
check('SYNC  a valid clipboard payload writes the health row for today',
  afterValid.health && afterValid.health.steps === 7654 && afterValid.health.activeKcal === 321,
  JSON.stringify(afterValid.health));
check('SYNC  a valid payload with weightlb writes a weights row for today with the converted kg',
  afterValid.weights.length === 1 &&
    afterValid.weights[0].date === appToday &&
    Math.abs(afterValid.weights[0].kg - 180 * 0.45359237) < 1e-9,
  JSON.stringify(afterValid.weights));

/* -------- 3b. malformed clipboard -> NO write (atomicity, the dangerous
   outcome per Gwart). Wipe the row first so we can tell "nothing wrote"
   from "the previous write is still there". */
await page.evaluate(async () => {
  const { db } = await import('./js/db.js');
  await db.clear('health');
  await db.clear('weights');
});
await setClipboard('this is not tally-hk anything, no keys');
await page.evaluate(() => document.querySelector('#hkSyncNow').click());
await sleep(1200);
const afterGarbage = await page.evaluate(async d => {
  const { db } = await import('./js/db.js');
  return { health: await db.get('health', d), weights: await db.all('weights'), rowCount: (await db.all('health')).length };
}, appToday);
check('SYNC  a malformed clipboard produces ZERO health rows (no partial write)',
  afterGarbage.rowCount === 0,
  `rows=${afterGarbage.rowCount}, row=${JSON.stringify(afterGarbage.health)}`);
check('SYNC  a malformed clipboard produces ZERO weights rows (no partial write)',
  afterGarbage.weights.length === 0,
  JSON.stringify(afterGarbage.weights));

/* -------- 4. ingestHealth PRESERVES existing fields for the date. Seed a
   row with restingHr + sleepMin (fields the clipboard payload never
   carries), then ingest a steps-only payload, and verify the seeded
   fields survive the overlay. Otherwise a Sync now would wipe manual
   sleep and heart-rate data. */
await page.evaluate(async d => {
  const { db } = await import('./js/db.js');
  await db.clear('health');
  await db.put('health', { date: d, restingHr: 58, sleepMin: 420, sleepManual: true });
}, appToday);
await setClipboard(`tally-hk d=${appToday} steps=2222`);
await page.evaluate(() => document.querySelector('#hkSyncNow').click());
await sleep(1200);
const afterOverlay = await page.evaluate(async d => {
  const { db } = await import('./js/db.js');
  return await db.get('health', d);
}, appToday);
check('OVERLAY  ingestHealth adds steps without wiping the pre-existing restingHr',
  afterOverlay?.steps === 2222 && afterOverlay?.restingHr === 58,
  JSON.stringify(afterOverlay));
check('OVERLAY  ingestHealth does not overwrite a manual sleep entry (sleepManual:true stays)',
  afterOverlay?.sleepMin === 420 && afterOverlay?.sleepManual === true,
  `sleepMin=${afterOverlay?.sleepMin}, sleepManual=${afterOverlay?.sleepManual}`);

/* -------- 5. hkLastSync marker is written on a steps sync (Settings uses
   this to compute "stale" state, and hkStaleFix removes the notified
   flag). Verify the write. */
const afterMarker = await page.evaluate(async () => {
  const { kvGet } = await import('./js/db.js');
  return {
    lastSync: await kvGet('hkLastSync', null),
    stale: await kvGet('hkStaleNotified', null),
    hkConnected: (await kvGet('settings', {}))?.hkConnected,
  };
});
check('MARKER  hkLastSync was stamped on the last successful steps sync',
  typeof afterMarker.lastSync === 'number' && afterMarker.lastSync > 0,
  `hkLastSync=${afterMarker.lastSync}`);
check('MARKER  hkStaleNotified was cleared by the successful sync',
  afterMarker.stale === false,
  `hkStaleNotified=${afterMarker.stale}`);
check('MARKER  settings.hkConnected was set to true by the first steps ingest',
  afterMarker.hkConnected === true,
  `hkConnected=${afterMarker.hkConnected}`);

/* -------- Restore clipboard so subsequent test runs are clean. */
await page.evaluate(() => {
  if (window.__origClipboardRead) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: window.__origClipboardRead },
    });
  }
});

await browser.close();
srv.kill();
console.log(bad ? `\n${bad} FAILED` : '\nHEALTH INTAKE VERIFIED');
process.exit(bad ? 1 : 0);
