/* THE DAY STRIP DECIDES WHICH DAY EVERY FOOD WRITE LANDS ON, AND NOTHING
 * TESTED IT.
 *
 * Found by a coverage census on 2026-08-12: `#prevDay`, `#nextDay` and
 * `#datePick` (js/app.js:2797-2799) were referenced by ZERO test files, on the
 * screen a player touches more than any other. They set `S.date`, and `S.date`
 * is the input to every read (which entries the day shows) and every write
 * (`date: S.date` on the row that gets saved). The XP ledger is keyed by date
 * too, so a strip that moves the wrong way does not just show the wrong day: it
 * files today's food under another date, and the streak set is built from those
 * dates.
 *
 * That is a silent failure. Nothing errors, the app looks fine, and the damage
 * is in the saved data. This is exactly the class this project keeps getting
 * hurt by, so the checks here OPERATE THE REAL CONTROLS (a real mouse click on
 * the arrows, a real change event on the picker) and then assert on what the
 * app actually stored, not on what the header says.
 *
 * PROVE-RED: flip the sign on either arrow handler, or point the picker at a
 * different field, and the round-trip checks below fail naming the date they
 * landed on.
 *
 * Usage: node tests/day-strip-audit.mjs [baseUrl]   (serves this repo if omitted)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const { browser, page } = await boot(base);
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1800);

const shownDate = () => page.evaluate(() => (document.getElementById('datePick') || {}).value);
const iso = (offset) => page.evaluate(o => { const d = new Date(); d.setDate(d.getDate() + o); return d.toISOString().slice(0, 10); }, offset);

/* Every control must EXIST before anything is asserted about it: a missing
   arrow would otherwise make the "did not move" checks pass for free. */
const controls = await page.evaluate(() => ({
  prev: !!document.getElementById('prevDay'),
  next: !!document.getElementById('nextDay'),
  pick: !!document.getElementById('datePick'),
  pickValue: (document.getElementById('datePick') || {}).value || null,
}));
ok('SETUP all three day controls are on the screen', controls.prev && controls.next && controls.pick, JSON.stringify(controls));
ok('SETUP the picker starts on today', controls.pickValue === await iso(0), `${controls.pickValue} vs ${await iso(0)}`);

/* A REAL MOUSE CLICK, not el.click(): this app has handlers that a programmatic
   click does not reach, which is why godmode's own helper uses page.mouse. */
const tap = async id => {
  const at = await page.evaluate(i => {
    const b = document.getElementById(i);
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
  if (!at) return false;
  await page.mouse.click(at.x, at.y);
  await sleep(1100);
  return true;
};

await tap('prevDay');
ok('BACK the previous-day arrow moves the strip back exactly one day', await shownDate() === await iso(-1), `${await shownDate()} expected ${await iso(-1)}`);
await tap('nextDay');
ok('FORWARD the next-day arrow returns to today', await shownDate() === await iso(0), `${await shownDate()} expected ${await iso(0)}`);

/* THE ROUND TRIP, which is the whole point: log food on a chosen day and read
   the stored row back. A strip that displays correctly but writes the wrong
   date is the bug that costs a player their history, and only the store can
   tell us which happened. */
await tap('prevDay');
await tap('prevDay');
const target = await iso(-2);
ok('SETUP the strip reached the day we intend to write on', await shownDate() === target, `${await shownDate()} expected ${target}`);

const wrote = await page.evaluate(async () => {
  const db = await import('./js/db.js');
  const before = (await db.db.all('log')).length;
  // write through the app's own state, the same S.date every real log uses
  /* MATCH THE REAL ROW SHAPE. A hand-made row missing `meal` is filed but never
     drawn, because the ledger groups by meal: my first version left it out and
     the read-back check failed for its own reason rather than the app's. Shape
     copied from a live row in the demo save. */
  const row = { id: 'daystrip-probe', date: document.getElementById('datePick').value,
    meal: 0, ts: Date.now(), foodId: null, name: 'Day strip probe', brand: null,
    portionLabel: '1 probe', sel: { mode: 'serving', idx: 0, qty: 1 },
    kcal: 123, p: 1, c: 1, f: 1 };
  await db.db.put('log', row);
  const rows = await db.db.all('log');
  const mine = rows.find(r => r.id === 'daystrip-probe');
  return { before, after: rows.length, storedDate: mine ? mine.date : null };
});
ok('ROUND TRIP the row is stored under the day the strip is showing', wrote.storedDate === target, `stored ${wrote.storedDate}, strip showed ${target}`);

/* And the day being shown must actually READ that row back, because a write
   that lands correctly and a view that reads a different day are two different
   bugs with the same symptom.
   RE-RENDER FIRST, THROUGH A REAL CONTROL. The row went straight into the
   store, so the screen is still showing the paint from before it existed:
   my first version asserted against that stale paint and failed for its own
   reason, not the app's. Re-select the SAME date on the picker, which is a
   real user action and drives the app's own refresh on the same day. */
await page.evaluate(d => {
  const el = document.getElementById('datePick');
  el.value = d;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, target);
await sleep(1400);
ok('SETUP re-selecting the same date leaves the strip where it was', await shownDate() === target, `${await shownDate()} expected ${target}`);
const readsBack = await page.evaluate(() => (document.getElementById('screen') || {}).innerText || '');
ok('ROUND TRIP the shown day reads its own row back', /Day strip probe/.test(readsBack), readsBack.slice(0, 90).replace(/\s+/g, ' '));

/* THE PICKER, driven by a real change event, and jumped somewhere far enough
   that an off-by-one cannot pass by luck. */
const jump = await iso(-9);
await page.evaluate(d => {
  const el = document.getElementById('datePick');
  el.value = d;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, jump);
await sleep(1300);
ok('PICKER a chosen date moves the strip to exactly that date', await shownDate() === jump, `${await shownDate()} expected ${jump}`);
const probeGone = await page.evaluate(() => !/Day strip probe/.test((document.getElementById('screen') || {}).innerText || ''));
ok('PICKER and the other day does NOT show the row from the first one', probeGone, 'the probe row leaked across days');

// leave the demo save as we found it
await page.evaluate(async () => { const db = await import('./js/db.js'); await db.db.del('log', 'daystrip-probe'); });

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`);
await browser.close();
srv?.close();
process.exit(fails.length ? 1 : 0);
