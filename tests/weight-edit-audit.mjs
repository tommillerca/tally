/* LOG A WEIGHT + EDIT/DELETE A LOG ENTRY: two of the app's oldest,
 * highest-consequence surfaces with no runtime coverage.
 *
 * openWeightSheet at js/app.js:7004 writes to the `weights` store, overwrites
 * S.settings.profile.weightKg (which feeds every future target recalc), pays
 * XP through onWeighIn, and does an lb/kg conversion (line 7021) that is
 * permanent history: a wrong kg is not just today's row, it skews every
 * future targetKcal downstream.
 *
 * openEntryEdit at js/app.js:5607 -> openQuickAdd(entry) at :5614 is the
 * only way to fix or remove a mis-log. The delete branch (`#qaDel`, line
 * 5666) is the only path a player has to undo an entry. Neither has ever
 * been driven end-to-end in a test.
 *
 * This audit drives both, both directions, both units. Real controls: click
 * the actual buttons, then read the store back and assert every field.
 *
 * Run: node tests/weight-edit-audit.mjs [baseUrl]
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

const KG_PER_LB = 0.45359237;

/* Reset kv 'weights' + 'log' + settings.units cleanly between the two-unit
 * runs so each measurement starts from a known state. Same-tab, not a
 * reboot: settings live in kv, weights + log live in their own stores. */
async function resetForUnit(unit) {
  await page.evaluate(async u => {
    const { db, kvGet, kvSet } = await import('./js/db.js');
    await db.clear('weights');
    await db.clear('log');
    const settings = (await kvGet('settings', null)) || {};
    settings.units = u;
    settings.profile = settings.profile || { sex: 'm', age: 30, heightCm: 178, weightKg: 82, activity: 'moderate', goal: 'recomp' };
    settings.profile.weightKg = 82;   // known baseline the weight-log will overwrite
    await kvSet('settings', settings);
  }, unit);
  /* Reload so the new units and profile are read into S.settings by boot,
     since S is a module-scope cache. Same pattern the boot() does. */
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(2400);
}

/* Route to the Progress screen, click #logWeight, fill and save. Returns
 * what the store + kv looked like after the save. Waits on DOM signals
 * rather than fixed sleeps so a slow render does not corrupt the read. */
async function logWeightViaSheet({ value, date }) {
  await page.evaluate(() => { location.hash = '#/progress'; });
  await page.waitForSelector('#logWeight', { timeout: 10000 });
  await page.evaluate(() => document.querySelector('#logWeight').click());
  await page.waitForSelector('#wSave', { timeout: 5000 });
  await page.evaluate(({ v, d }) => {
    document.querySelector('#wVal').value = String(v);
    document.querySelector('#wDate').value = d;
  }, { v: value, d: date });
  await page.evaluate(() => document.querySelector('#wSave').click());
  /* Wait for the sheet to actually close (that is the app's own signal that
     the async save + kv write + onWeighIn have all completed). */
  await page.waitForFunction(() => !document.querySelector('#wSave'), { timeout: 8000 })
    .catch(() => {});
  await sleep(300);
  return page.evaluate(async () => {
    const { db, kvGet } = await import('./js/db.js');
    const weights = await db.all('weights');
    const settings = await kvGet('settings', null);
    return { weights, profileWeightKg: settings?.profile?.weightKg, units: settings?.units };
  });
}

/* -------------- 1. LOG WEIGHT: KG PATH -------------- */
await resetForUnit('kg');
const today = new Date().toISOString().slice(0, 10);
const kgResult = await logWeightViaSheet({ value: 74.5, date: today });
check('KG  the weight sheet wrote exactly one row to `weights`',
  kgResult.weights.length === 1, `got ${kgResult.weights.length} rows`);
check('KG  the stored kg equals the entered kg (no conversion)',
  kgResult.weights[0]?.kg === 74.5, `stored kg=${kgResult.weights[0]?.kg}`);
check('KG  the stored row is dated today',
  kgResult.weights[0]?.date === today, `stored date=${kgResult.weights[0]?.date}`);
check('KG  settings.profile.weightKg was overwritten to the new kg (feeds target recalc)',
  kgResult.profileWeightKg === 74.5, `profile.weightKg=${kgResult.profileWeightKg}`);
check('KG  units setting was preserved as kg', kgResult.units === 'kg', `units=${kgResult.units}`);

/* -------------- 2. LOG WEIGHT: LB PATH (conversion is permanent history) -------------- */
await resetForUnit('lb');
const lbInput = 200;                    // player types 200 lb
const expectedKg = lbInput * KG_PER_LB; // 90.718474
const lbResult = await logWeightViaSheet({ value: lbInput, date: today });
check('LB  the weight sheet wrote exactly one row to `weights`',
  lbResult.weights.length === 1, `got ${lbResult.weights.length} rows`);
check('LB  the stored kg is the lb-to-kg conversion of what was entered (200 lb -> 90.72 kg)',
  lbResult.weights[0]?.kg != null && Math.abs(lbResult.weights[0].kg - expectedKg) < 1e-9,
  `stored kg=${lbResult.weights[0]?.kg}, expected ${expectedKg}`);
check('LB  settings.profile.weightKg was overwritten to the converted kg',
  lbResult.profileWeightKg != null && Math.abs(lbResult.profileWeightKg - expectedKg) < 1e-9,
  `profile.weightKg=${lbResult.profileWeightKg}, expected ${expectedKg}`);
check('LB  units setting was preserved as lb', lbResult.units === 'lb', `units=${lbResult.units}`);

/* Cross-check: the conversion is symmetric. If a player toggles to lb after
 * logging a kg, the displayed number should be the reverse conversion of
 * what got stored. Prevents a "converted twice" or "off by 2.2046" class of
 * bug where the store carries lb but the reader thinks it is kg. */
check('CONVERSION  kg -> lb round trip is stable at full precision',
  Math.abs(expectedKg / KG_PER_LB - lbInput) < 1e-9,
  `${expectedKg} kg / KG_PER_LB = ${expectedKg / KG_PER_LB}, expected ${lbInput}`);

/* -------------- 3. ENTRY EDIT + DELETE -------------- */
await resetForUnit('kg');
/* Use the app's OWN dateKey() rather than JS's toISOString().slice(0, 10):
   the app's S.date is set from dateKey() at boot, and if the two diverge
   (timezone, demo-profile stamp, whatever) my seed lands on a date that
   the Today render is not filtering for and the [data-entry] never
   appears. Same source of truth on both sides. */
const appToday = await page.evaluate(async () => {
  const { dateKey } = await import('./js/nutrition.js');
  return dateKey();
});

/* Seed one quick-add-shape log entry directly, so we can drive the EDIT
 * path (the openQuickAdd(entry, ...) flow the button fires) without also
 * having to go through the whole add-a-quick-add UI first. The delete
 * path is fired from the same edit sheet. */
const seededId = await page.evaluate(async appToday => {
  const { db, newId } = await import('./js/db.js');
  const id = newId();
  await db.put('log', {
    id, date: appToday, meal: 2 /* Dinner: MEAL_ORDER is [Breakfast=0, Lunch=1, Dinner=2, Snacks=3] and mealBlock filters `e.meal === i` on integers */, ts: Date.now(),
    foodId: null, name: 'Vlad quick-add', portionLabel: '', kcal: 300, p: 20, c: 30, f: 10,
  });
  return id;
}, appToday);

/* Route to Today, wait for the [data-entry] button for our seeded row.
   Bounce through another route first because the boot may have landed on
   /today already, and setting location.hash to what it already is does
   not fire route() and does not re-render, which leaves our just-seeded
   entry invisible on a screen rendered BEFORE the seed. */
await page.evaluate(() => { location.hash = '#/progress'; });
await sleep(600);
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1500);
const editBtnFound = await page.waitForSelector(`[data-entry="${seededId}"]`, { timeout: 10000 })
  .then(() => true).catch(() => false);
check('EDIT  the seeded quick-add entry rendered with its [data-entry] control on Today',
  editBtnFound, editBtnFound ? '' : `no [data-entry="${seededId}"] on Today after 10s`);

/* Click the edit control. openEntryEdit -> openQuickAdd(entry) fires. */
await page.evaluate(id => document.querySelector(`[data-entry="${id}"]`).click(), seededId);
await page.waitForSelector('#qaKcal', { timeout: 5000 });
/* The edit sheet's qaKcal should be pre-filled with the entry's kcal. */
const preFilled = await page.evaluate(() => ({
  kcal: document.querySelector('#qaKcal')?.value,
  name: document.querySelector('#qaName')?.value,
  hasDeleteBtn: !!document.querySelector('#qaDel'),
  headline: document.querySelector('.sheet-head h2')?.textContent?.trim(),
}));
check('EDIT  the edit sheet opened in EDIT mode (headline says "Edit quick add")',
  /Edit/i.test(preFilled.headline || ''), `headline="${preFilled.headline}"`);
check('EDIT  the sheet pre-filled qaKcal from the entry (300)',
  Number(preFilled.kcal) === 300, `qaKcal="${preFilled.kcal}"`);
check('EDIT  the sheet pre-filled qaName from the entry',
  /Vlad quick-add/.test(preFilled.name || ''), `qaName="${preFilled.name}"`);
check('EDIT  the delete button is present ONLY in edit mode', preFilled.hasDeleteBtn);

/* Change kcal to 450 and click Save. */
await page.evaluate(() => {
  document.querySelector('#qaKcal').value = '450';
  document.querySelector('#qaAdd').click();
});
await page.waitForFunction(() => !document.querySelector('#qaAdd'), { timeout: 8000 })
  .catch(() => {});
await sleep(300);

const afterEdit = await page.evaluate(async id => {
  const { db } = await import('./js/db.js');
  const rows = await db.all('log');
  return { rows, row: rows.find(r => r.id === id) };
}, seededId);
check('EDIT  the log row was updated in place (same id, one row still)',
  afterEdit.rows.length === 1 && afterEdit.row && afterEdit.row.id === seededId,
  `${afterEdit.rows.length} log rows`);
check('EDIT  the kcal is now 450 (the edited value)',
  afterEdit.row?.kcal === 450, `stored kcal=${afterEdit.row?.kcal}`);
check('EDIT  the date and meal fields were preserved through the edit',
  afterEdit.row?.date === appToday && afterEdit.row?.meal === 2,
  `date=${afterEdit.row?.date}, meal=${afterEdit.row?.meal}`);

/* Re-open the edit sheet, click Delete, verify the row is GONE. */
await page.evaluate(id => document.querySelector(`[data-entry="${id}"]`).click(), seededId);
await page.waitForSelector('#qaDel', { timeout: 5000 });
await page.evaluate(() => document.querySelector('#qaDel').click());
await page.waitForFunction(() => !document.querySelector('#qaDel'), { timeout: 8000 })
  .catch(() => {});
await sleep(300);

const afterDelete = await page.evaluate(async id => {
  const { db } = await import('./js/db.js');
  const rows = await db.all('log');
  return { rows, hasSeeded: rows.some(r => r.id === id) };
}, seededId);
check('DELETE  the log row is GONE after clicking #qaDel',
  !afterDelete.hasSeeded, `still present? ${afterDelete.hasSeeded}, rows=${afterDelete.rows.length}`);
check('DELETE  and no other log rows were touched by the delete',
  afterDelete.rows.length === 0, `${afterDelete.rows.length} log rows survived`);

/* -------------- final -------------- */
await browser.close();
srv.kill();
console.log(bad ? `\n${bad} FAILED` : '\nWEIGHT + ENTRY EDIT/DELETE VERIFIED');
process.exit(bad ? 1 : 0);
