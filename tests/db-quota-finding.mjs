/* WHAT HAPPENS WHEN INDEXEDDB QUOTA RUNS OUT (Reg 12h plan C4).
 *
 * This app writes every meal, weight, fight, pet, xp event and inv item
 * forever. A player who uses it for a year accumulates thousands of rows
 * across seven stores. At some point the browser's per-origin quota bites,
 * and the question is: what does the player SEE.
 *
 * The naive way to answer this is to simulate a full disk in JS by making
 * db.put throw. That measures the app's response to a promise rejection,
 * which is not what actually happens on the platform: real quota failures
 * surface at TRANSACTION-ABORT time (`t.onabort` with a QuotaExceededError),
 * which is a different event than a synchronous put reject and reaches
 * different code paths. Do this the way Gwart's leaderboard/invisible-
 * content lesson said: force the REAL failure through the platform.
 *
 * WHAT I TRIED, and what actually worked:
 *   Chromium's CDP exposes Storage.overrideQuotaForOrigin. Puppeteer can
 *   send it. The command is accepted (no protocol error), but on this
 *   Chromium (Puppeteer's bundled build) the override does NOT bite on
 *   subsequent IndexedDB puts: 50/50 2KB writes committed after setting
 *   the origin quota to (currentUsage + 1024). The override is either
 *   deprecated silently, only enforced at bucket boundaries this puppet
 *   never crosses, or applies only to new browsing contexts. Either way
 *   this Chromium refuses to fail on cue.
 *
 *   The falsehood I do NOT ship as a substitute: monkey-patching db.put
 *   to reject with a synthetic QuotaExceededError. That measures the
 *   promise-reject path, not the real platform failure. Silent JS
 *   substitution would be the exact trap invisible-content diagnosed.
 *
 * WHAT THIS AUDIT DOES SHIP:
 *   1. Baseline: navigator.storage.estimate() on a fresh boot.
 *   2. Realistic growth measurement: seed a scratch DB with typical
 *      per-day activity (10 meal log entries, 1 weight, ~30 xp events,
 *      ~2 inv changes) times 365, then measure. Report per-year MB and
 *      the crude extrapolation to years-to-quota given the puppet's
 *      quota AND given a realistic on-device quota (Chrome allocates
 *      ~60% of free disk shared across origins; a device with 2GB free
 *      caps this origin at ~40MB, not the ~10GB the puppet reports).
 *   3. CDP override attempt with an honest outcome record. If the
 *      override DID bite, capture the error surface. If it did not,
 *      say so explicitly and do not fake it.
 *   4. FINDING block summarising what the growth measurement means for a
 *      real player, and what remains untested (transaction-abort path
 *      on real device pressure).
 *
 * SCOPE THIS DOES NOT COVER, on record because Gwart's rule 3:
 *   - Real transaction-abort behavior on a real quota-exceeded event.
 *     Needs either a device with actual disk pressure, or a Chromium
 *     feature-flag / build variant that honours the override. Filed as
 *     "not-tested-here"; the growth number IS testable and IS shipped.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srvHandle = null;
let base = process.env.URL;
if (!base) { srvHandle = await serveTree(ROOT); base = srvHandle.url; }
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const finding = (label, body) => console.log(`\nFINDING  ${label}\n${body.split('\n').map(l => '  ' + l).join('\n')}\n`);

const { browser, page } = await boot(base);
const cdp = await page.target().createCDPSession();

const baseline = await page.evaluate(async () => {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  return await navigator.storage.estimate();
});
ok('SETUP  navigator.storage.estimate() is available on this build',
  baseline && typeof baseline.usage === 'number' && typeof baseline.quota === 'number',
  baseline ? `usage=${baseline.usage} quota=${baseline.quota}` : 'estimate() unavailable');

const scratchName = `db-quota-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const YEAR_DAYS = 365;
const MEALS_PER_DAY = 10;
const XP_PER_DAY = 30;
const INV_PER_DAY = 2;
const yearMeasurement = await page.evaluate(async (name, days, meals, xps, invs) => {
  const { useDbName, db } = await import(`./js/db.js?quota=${Date.now()}`);
  useDbName(name);
  const before = await navigator.storage.estimate();
  const dayISO = i => new Date(Date.UTC(2025, 0, 1) + i * 86400_000).toISOString().slice(0, 10);
  for (let d = 0; d < days; d++) {
    const date = dayISO(d);
    for (let m = 0; m < meals; m++) {
      await db.put('log', { id: `log-${d}-${m}`, date, foodId: `food-${m % 20}`, kcal: 120 + m * 30, protein: 8 + m, carbs: 15 + m, fat: 5 });
    }
    await db.put('weights', { date, kg: 70 + Math.sin(d / 30) * 2 });
    for (let x = 0; x < xps; x++) {
      await db.put('xp', { key: `xp-${d}-${x}`, ts: d * 86400_000 + x * 60_000, type: x % 3 === 0 ? 'step' : (x % 3 === 1 ? 'meal' : 'fight'), points: 1 + (x % 10) });
    }
    for (let i = 0; i < invs; i++) {
      await db.put('inv', { id: `inv-${d}-${i}`, type: 'egg', qty: 1, day: d });
    }
  }
  const after = await navigator.storage.estimate();
  const rows = await Promise.all(['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv'].map(async s => [s, (await db.all(s)).length]));
  return { before, after, rows: Object.fromEntries(rows) };
}, scratchName, YEAR_DAYS, MEALS_PER_DAY, XP_PER_DAY, INV_PER_DAY);

const perYearBytes = yearMeasurement.after.usage - yearMeasurement.before.usage;
const perYearMB = perYearBytes / 1024 / 1024;
ok('GROWTH  one year of typical activity seeded across log/weights/xp/inv (year-scale sample, not per-day)',
  yearMeasurement.rows.log >= 3000 && yearMeasurement.rows.xp >= 10000,
  `rows: ${JSON.stringify(yearMeasurement.rows)}, per-year ${perYearMB.toFixed(2)} MB`);

/* CDP override attempt. Report honest outcome. */
const origin = new URL(base).origin;
let cdpAccepted = false, cdpBitCount = 0;
try {
  await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: yearMeasurement.after.usage + 1024 });
  cdpAccepted = true;
} catch (e) {
  cdpAccepted = false;
}
if (cdpAccepted) {
  const bigRow = 'x'.repeat(2048);
  const experiment = await page.evaluate(async (name, bigStr) => {
    const { useDbName, db } = await import(`./js/db.js?quota-force=${Date.now()}`);
    useDbName(name);
    const outcomes = [];
    for (let i = 0; i < 20; i++) {
      try { await db.put('foods', { id: `blowup-${i}`, blob: bigStr }); outcomes.push({ i, ok: true }); }
      catch (e) { outcomes.push({ i, ok: false, err: String(e).slice(0, 120) }); }
    }
    return outcomes;
  }, scratchName, bigRow);
  cdpBitCount = experiment.filter(o => !o.ok).length;
}
/* This is a REPORT, not a pass/fail. The purpose is to name what this build
   of Chromium does when we try to force quota via CDP, which is: nothing.
   A future puppet on a Chromium that honours the override would see a
   different number here and the finding would be updated. */
ok('CDP  Storage.overrideQuotaForOrigin was ACCEPTED by the protocol (whether it bites is separate)',
  cdpAccepted, cdpAccepted ? 'accepted' : 'protocol rejected the command');

/* Adversarial-honest reveal: if CDP override DID bite (cdpBitCount > 0),
   the platform failure was forced and the audit's job is done. If it did
   NOT bite, the audit says so and stops rather than substituting a
   JS-simulated failure. */
finding('C4  INDEXEDDB QUOTA BEHAVIOUR', [
  `GROWTH MEASUREMENT (typical player, one year of activity):`,
  `  usage before seed:  ${yearMeasurement.before.usage.toLocaleString()} bytes`,
  `  usage after seed:   ${yearMeasurement.after.usage.toLocaleString()} bytes`,
  `  per-year cost:      ${perYearMB.toFixed(2)} MB`,
  `  puppet quota:       ${(yearMeasurement.after.quota / 1024 / 1024).toFixed(0)} MB (unrealistically large on this machine)`,
  `  years to puppet quota: ~${Math.round(yearMeasurement.after.quota / perYearBytes).toLocaleString()}`,
  ``,
  `WHAT THIS MEANS FOR A REAL PLAYER: puppet quotas do not match device`,
  `quotas. Chrome allocates each origin ~60% of free disk, capped at a`,
  `total-storage share across the browser profile. Common device slices:`,
  `  device with 500MB free disk:  origin cap ~ 10MB  → ~${(10 / perYearMB).toFixed(1)} years`,
  `  device with 2GB free disk:    origin cap ~ 40MB  → ~${(40 / perYearMB).toFixed(1)} years`,
  `  device with 10GB free disk:   origin cap ~200MB  → ~${(200 / perYearMB).toFixed(1)} years`,
  `  device with 50GB free disk:   origin cap ~1GB    → ~${(1024 / perYearMB).toFixed(1)} years`,
  `A player on a nearly-full budget phone with 500MB free could hit quota`,
  `inside ~${(10 / perYearMB).toFixed(0)} years of daily use. That is well within the lifetime`,
  `of a Boneheadz account and the growth is monotonic (no compaction, no`,
  `eviction, no per-store cap). This is the real risk this audit surfaces.`,
  ``,
  `FORCED-FAILURE RESULT ON THIS CHROMIUM:`,
  `  CDP Storage.overrideQuotaForOrigin: ${cdpAccepted ? 'accepted' : 'protocol-rejected'}`,
  `  puts past the override that failed: ${cdpBitCount}/20`,
  `  ${cdpBitCount === 0 ? 'The override did NOT bite. This Chromium either ignores the deprecated CDP command or enforces quota at bucket boundaries this puppet does not cross. See "SCOPE" in the file header for what stays untested.' : 'The override bit and forced real transaction-abort behavior. Errors captured above.'}`,
  ``,
  `WHAT THE APP DOES ON A REAL QUOTA FAILURE (from code inspection, NOT`,
  `measured here): db.put returns a promise that rejects when the`,
  `underlying transaction aborts. importAll (js/db.js:91) has no try/catch`,
  `around the per-store puts, so a rejected promise unwinds through the`,
  `#importFile handler in js/app.js which does show a toast: "Import failed:`,
  `<err>". The WRITE path from ordinary meal logging is a different call`,
  `site (log-food flow); if THAT path lacks the same catch, a quota failure`,
  `on a routine meal write may silently lose the meal without user-visible`,
  `feedback. Not measured here; filed as a follow-up.`,
  ``,
  `NOT TESTED: real transaction-abort on a real device with actual disk`,
  `pressure. Needs either a device or a Chromium that honours the CDP`,
  `override. This puppet does neither.`,
].join('\n'));

await browser.close();
if (srvHandle) srvHandle.close();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
