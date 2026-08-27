/* DELETING A CUSTOM FOOD MUST NOT TAKE YOUR HISTORY WITH IT.
 *
 * A custom food is hand-entered: someone typed the macros off a packet. The
 * Foods tab can delete one permanently (js/app.js:4577, db.del('foods', id))
 * and a coverage census on 2026-08-12 found nothing pointed at it.
 *
 * The interesting question is not whether the delete works. It is what happens
 * to the LOG ENTRIES that referenced that food. A log row carries its own name
 * and macros plus a foodId pointing back at the source, so deleting the source
 * should leave every past day exactly as it was. If it does not, a player
 * tidying up their food list quietly rewrites their own history, and the
 * damage is invisible until they look at last week.
 *
 * WHAT THIS PINS:
 *   DELETE   the food really is gone from the foods store
 *   HISTORY  every log row that referenced it is untouched, name and macros
 *            included, and the day still totals the same
 *   RENDER   the day still draws that entry rather than dropping it
 *
 * PROVE-RED: make the delete also remove matching log rows and HISTORY fails.
 *
 * FINDING, reported not fixed: this delete is IMMEDIATE. Melting gear and
 * adopting a vault identity both arm-then-confirm in this app; deleting a
 * hand-entered food does not, so one stray tap is permanent with no undo. That
 * is a product call, not a test's call, so it is written up rather than
 * changed here.
 *
 * Usage: node tests/foods-delete-audit.mjs [baseUrl]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const { browser, page } = await boot(base);
await seed(page, { level: 10 });

/* A custom food, and two days of history that reference it: today and a day
   last week. One row would not show whether the damage is scoped to the
   visible day or to everything. */
const FOOD_ID = 'audit-custom-food';
const setup = await page.evaluate(async id => {
  const db = await import('./js/db.js');
  const { dateKey } = await import('./js/nutrition.js');
  const today = dateKey();
  const older = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); })();
  /* source 'custom' is what makes the editor (and therefore the delete)
     reachable at all: js/app.js:4191 only offers it for custom foods. */
  await db.db.put('foods', { id, name: 'Nan bread (from the packet)', brand: null, source: 'custom',
    per100: { kcal: 310, p: 9, c: 55, f: 5 },
    servings: [{ label: '1 piece (90 g)', grams: 90 }], lastUsedAt: Date.now() });
  const row = (date, rid) => ({ id: rid, date, meal: 2, ts: Date.now(), foodId: id,
    name: 'Nan bread (from the packet)', brand: null, portionLabel: '1 piece (90 g)',
    sel: { mode: 'serving', idx: 0, qty: 1 }, kcal: 279, p: 8.1, c: 49.5, f: 4.5 });
  await db.db.put('log', row(today, 'audit-entry-today'));
  await db.db.put('log', row(older, 'audit-entry-older'));
  return { today, older };
}, FOOD_ID);

const history = () => page.evaluate(async id => {
  const db = await import('./js/db.js');
  const rows = (await db.db.all('log')).filter(r => r.foodId === id);
  return {
    count: rows.length,
    rows: rows.map(r => JSON.stringify({ id: r.id, date: r.date, name: r.name, kcal: r.kcal, p: r.p, c: r.c, f: r.f })).sort(),
    foodExists: !!(await db.db.get('foods', id)),
  };
}, FOOD_ID);

/* RELOAD AFTER SEEDING. The Foods tab renders S.userFoods, an in-memory list
   built at boot, so a row written straight into the store afterwards is in the
   database and not on the screen. The first run of this file failed at "food
   row not found" for exactly that reason, which reads like a missing feature
   and was a stale render. Same trap the readiness audit hit. */
await page.reload({ waitUntil: 'domcontentloaded' });
await sleep(3000);

const before = await history();
ok('SETUP the custom food and two entries referencing it exist', before.foodExists && before.count === 2, JSON.stringify({ food: before.foodExists, entries: before.count }));

/* Drive the real control: the Foods tab, the food's own row, the delete
   button in its editor. Calling db.del would prove the database works and
   nothing about the screen that fires it. */
/* THE REAL PATH TO THE DELETE, which is not the obvious one. Tapping a food in
   the Foods tab OPENS THE PORTION SHEET to log it (js/app.js:5635), it does not
   edit it. The editor that carries the delete is reached from the portion
   sheet's own "edit" control, and only for a food whose source is 'custom'
   (js/app.js:4191). So the delete is three taps deep behind logging, which is
   worth knowing on its own: it is hard to hit by accident, which softens the
   no-confirm finding below. */
await page.evaluate(() => { location.hash = '#/foods'; });
await sleep(1800);
const reached = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('[data-food]')]
    .find(b => (b.textContent || '').includes('Nan bread'));
  if (!btn) return { step: 'food row not found in the Foods tab' };
  btn.click();
  return { step: 'portion sheet opened' };
});
await sleep(1500);
const editOpened = await page.evaluate(() => {
  const e = document.getElementById('editFoodBtn');
  if (!e) return { ok: false, why: 'no edit control on the portion sheet (is the food source custom?)' };
  e.click();
  return { ok: true };
});
await sleep(1500);
const hasDel = await page.evaluate(() => !!document.getElementById('ffDel'));
ok('SETUP the delete is reachable through the real path (Foods, log it, edit it)',
  hasDel, JSON.stringify({ ...reached, ...editOpened, hasDel }));
if (!hasDel) {
  /* A missing control is a NAMED failure, not a stack trace three lines later.
     This is the exact class I have been fixing in other people's audits and I
     wrote it into my own first draft. */
  console.log('\nSTOPPING: the delete control was never reached, so nothing below would mean anything.');
  console.log(`\n${fails.length} FAILED`);
  await browser.close(); srv?.close(); process.exit(1);
}

/* THE FINDING, MEASURED RATHER THAN ASSERTED: is there an arm-then-confirm
   step, as there is for melting gear? Recorded either way; the audit does not
   fail on it, because which destructive actions deserve a confirm is Tom's
   call, not a test's. */
const label = await page.evaluate(() => document.getElementById('ffDel').textContent.trim());
await page.evaluate(() => document.getElementById('ffDel').click());
await sleep(1800);
/* Whether it ARMED is answered by the store, not by the button. Reading the
   button straight after the click said "still there, same label", which I
   first reported as "armed"; the food was already gone. The button outliving
   the tap by a frame is not a confirm step. */
const goneAfterOneTap = await page.evaluate(async id => !(await (await import('./js/db.js')).db.get('foods', id)), FOOD_ID);
console.log(`FINDING  delete affordance: one tap on "${label}" ${goneAfterOneTap
  ? 'DELETED IT. No arm-then-confirm, unlike melting gear or adopting a vault identity in this same app.'
  : 'did not delete it, so something gates the first tap.'}`);

const after = await history();
ok('DELETE the food is gone from the foods store', !after.foodExists, `foodExists=${after.foodExists}`);
ok('HISTORY every log row that referenced it survived', after.count === before.count, `${after.count} rows vs ${before.count}`);
const identical = JSON.stringify(after.rows) === JSON.stringify(before.rows);
ok('HISTORY and those rows are byte identical, name and macros included',
  identical, identical ? `${after.count} rows unchanged` : 'CONTENTS CHANGED: ' + JSON.stringify(after.rows));

/* And the day must still DRAW it. A row that survives in the store but stops
   rendering is the same loss from where the player sits. */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(2000);
/* EXPAND THE DAY BEFORE READING IT (2026-08-27). Since the day collapsed behind
   its own ring-and-macros banner, everything below that banner is inside a shut
   <details id="dayRest">, and innerText does not report text the browser is not
   laying out. Measured on the failing run: with it shut, #screen.innerText was
   509 chars and did NOT contain "Nan bread", while #screen.textContent was 5,633
   chars and DID; opening it took innerText to 1,408 chars and the name came back.
   So the row is still drawn. It went behind a tap, it did not go away, and this
   check is about whether the day still DRAWS the orphaned entry, not about how
   many taps it takes to see it. Grading the shut state would have quietly turned
   "the deleted food's entry survives" into "nothing is on the day at all". */
await page.evaluate(() => {
  const d = document.getElementById('dayRest');
  if (d && !d.open) d.open = true;
});
await sleep(400);
const drawn = await page.evaluate(() => (document.getElementById('screen')?.innerText || '').includes('Nan bread'));
ok('RENDER today still draws the entry whose food was deleted', drawn, drawn ? '' : 'the entry vanished from the day');

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`);
await browser.close();
srv?.close();
process.exit(fails.length ? 1 : 0);
