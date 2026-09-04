/* TWO FAST TAPS ON ADD LOG ONE MEAL.
 *
 * WHY THIS EXISTS. QA round A (2026-09-03), L2 HIGH. The portion sheet's Add
 * handler (js/app.js, `$('#addBtn', wrap)`) had `btn.disabled = false` in its
 * catch and nothing that ever set it true, so the button stayed live across
 * `await db.put('log', e)` and a fast second tap ran the handler again: two log
 * rows and +20 XP from one food. The CONCURRENT case was already correct
 * (awardOnce's addIfAbsent checks and writes in one request); only the fast
 * double tap escaped, which is why no ledger-level guard could see it. The fix
 * disables the button before the first await, the shape of #wbOk's "one tap,
 * one write" and armToConfirm's `busy`.
 *
 * WHAT IT ASSERTS, driven through the real sheet, two synchronous clicks:
 *   SETUP     the meal reached the Add button (a flow that never submits proves
 *             nothing), and the tap paid a log row (a no-op flow cannot pass ROWS).
 *   DISABLED  the button reads disabled immediately after the first click, so
 *             the browser drops the second one.
 *   ROWS      exactly one log row was written.
 *   LEDGER    exactly one 'log' xp row was minted (the cap keys them per day, so
 *             a second row would have paid `log-<date>-2`).
 *
 * PROVE-RED. This file was written in a lane that could not run a browser (the
 * machine rule for QA round A). Run it on integ/playtest-round-a at 28f4e1bb:
 * expect DISABLED false, ROWS before+2, LEDGER +2. Then on the fix: all green.
 *
 * Usage: node tests/add-double-tap-audit.mjs
 */

import { boot, seed, sleep, serveTree } from './godmode.js';
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await seed(page, { level: 12 });
await sleep(1500);

const counts = () => page.evaluate(async () => {
  const d = await import('./js/db.js');
  const xp = await d.db.all('xp');
  return { rows: (await d.db.all('log')).length, logXp: xp.filter(r => r.type === 'log').length };
});
const before = await counts();

// the same path log-write-failure-audit drives: Today -> a meal row -> search -> pick -> Add
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1500);
await page.evaluate(() => document.querySelector('[data-addmeal]')?.click());
await sleep(1600);
await page.evaluate(() => {
  const inp = document.querySelector('#t1Search, input[type=search]');
  if (inp) { inp.value = 'apple'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await sleep(1600);
const picked = await page.evaluate(() => {
  const row = document.querySelector('[data-food], .t1-frow, .food-row');
  if (!row) return 'no-food-row';
  row.click(); return 'picked';
});
await sleep(1600);
/* Both clicks in ONE evaluate, back to back, with no await between them: that
   is the fast double tap. `disabled` is read between the two, synchronously,
   which is the exact instant the second tap lands. */
const tapped = await page.evaluate(() => {
  const b = document.getElementById('addBtn');
  if (!b) return { status: 'no-addBtn' };
  b.click();
  const disabledAfterFirst = b.disabled;
  b.click();
  return { status: 'submitted', disabledAfterFirst };
});
await sleep(2500);
const after = await counts();

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
ok('SETUP the meal reached the Add button', tapped.status === 'submitted', `${picked}, ${tapped.status}`);
ok('SETUP the tap wrote at least one log row (a flow that writes nothing proves nothing)', after.rows > before.rows, `${before.rows} -> ${after.rows}`);
ok('DISABLED the Add button is disabled the instant the first tap lands', tapped.disabledAfterFirst === true, String(tapped.disabledAfterFirst));
ok('ROWS two fast taps wrote exactly one log row', after.rows === before.rows + 1, `${before.rows} -> ${after.rows}`);
ok("LEDGER two fast taps minted exactly one 'log' xp row", after.logXp === before.logXp + 1, `${before.logXp} -> ${after.logXp}`);
ok('nothing threw to the page', errs.length === 0, errs.slice(0, 1).join(''));

await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\ndouble tap logs once');
process.exit(fails.length ? 1 : 0);
