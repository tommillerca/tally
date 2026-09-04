/* A FAILED SAVE MUST NOT LOOK LIKE A SAVED MEAL, AND A SAVED MEAL MUST NOT
 * LOOK LIKE A FAILED ONE.
 *
 * Measured 2026-08-13 on v373: reject the log write the way a full quota does
 * and the meal vanished with NO error, while an unrelated toast ("New talent
 * points ready. Tap Build to spec your Bonehead.") sat on screen reading like
 * success. 166 log rows before, 166 after. `await db.put('log', e)` had no
 * try/catch, db.put rejects on transaction abort, and everything after that
 * line was skipped, so the sheet closed and the player believed it saved.
 *
 * Tom chose the behaviour: tell the player and LEAVE THE ENTRY ON SCREEN so
 * they know to free up space and have somewhere to land when they come back.
 *
 * RE-PREMISED 2026-09-03 (QA round 25 M4 and M24). The first version of this
 * file patched `db.db.put` from the page, which sits ABOVE db.js's guard(), so
 * it never exercised the guard or the write-failure sink it claimed to prove,
 * and it only ever failed the `log` store as the FIRST write. QA injected BELOW
 * db.js (aborting the xp transaction after the log row had committed) and
 * found the mirror-image bug: `log 166 -> 167`, sheet still open, Add live,
 * toast "That did not save.", a second tap `167 -> 168`. Two orphan rows on
 * one day, +189 kcal, unbounded in taps, and a null-message rejection escaping
 * to the page.
 *
 * So the injection now lives on IDBObjectStore.prototype, UNDER guard(), the
 * sink and every wrapper in db.js, and there are two failure modes:
 *   FAIL=log   the log row's own put aborts (the 2026-08-13 shape). Expect: row
 *              count unchanged, storage-worded toast, sheet open, Add live, no
 *              page error.
 *   FAIL=xp    the log row COMMITS, then the first xp-store write (the
 *              `log-<id>` receipt, via addIfAbsent -> add) has its transaction
 *              aborted, exactly QA's injection. Expect: row count +1, sheet
 *              CLOSED (so a second tap is impossible), toast reads Added and
 *              says XP did not record, no page error, and the row count is
 *              STILL +1 after we try to submit again.
 *   (unset)    control: a normal meal saves, sheet closes, toast confirms.
 *
 * PROVE-RED, both to be run on a tree WITHOUT commitLogEntry (f3cb6377):
 *   FAIL=xp  node tests/log-write-failure-audit.mjs
 *     expected red rows: "sheet CLOSED", "toast reads Added", "nothing throws
 *     to the page" (the abort's null-error rejection escapes), and the
 *     duplicate-tap row if the harness can reach #addBtn a second time.
 *   FAIL=log node tests/log-write-failure-audit.mjs
 *     stays green on f3cb6377 (that half was already fixed on 2026-08-13);
 *     remove the try/catch around the put in commitLogEntry to see it red.
 * On this tree both modes and the control are expected green. NOT RUN by the
 * author on 2026-09-03: the machine was under a STATIC-ONLY rule (another
 * process owned the browser). Run it before merging.
 *
 * Usage: [FAIL=log|xp] node tests/log-write-failure-audit.mjs
 */

import { boot, seed, sleep, serveTree } from './godmode.js';
const MODE = process.env.FAIL || '';           // '', 'log' or 'xp'
if (MODE && MODE !== 'log' && MODE !== 'xp') { console.error('FAIL must be log or xp'); process.exit(2); }
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await seed(page, { level: 12 });
await sleep(1500);

/* THE INJECTION, BELOW db.js. Patching the IDB prototypes means the request
   goes through db.js's tx()/addIfAbsent, its onabort, guard()'s
   reportWriteFailure and the app's onWriteFailure sink, the real path.
   - 'log': the put's own transaction is aborted right after dispatch, so the
     row never commits and db.put rejects (the quota shape, minus the quota).
   - 'xp': nothing happens until a log row has COMMITTED (its transaction's
     oncomplete fired); the next add/put against the xp store then has its
     transaction aborted. That is QA's exact injection, and `t.error` is null
     on an explicit abort, which is the null-message rejection QA saw escape. */
await page.evaluate((mode) => {
  window.__logCommitted = false;
  window.__armed = !!mode;
  const P = IDBObjectStore.prototype;
  const realPut = P.put, realAdd = P.add;
  function wrap(real) {
    return function (...args) {
      const req = real.apply(this, args);
      if (mode === 'log' && this.name === 'log' && window.__armed) {
        window.__armed = false;
        this.transaction.abort();
      } else if (mode === 'xp' && this.name === 'log') {
        this.transaction.addEventListener('complete', () => { window.__logCommitted = true; });
      } else if (mode === 'xp' && this.name === 'xp' && window.__logCommitted && window.__armed) {
        window.__armed = false;
        this.transaction.abort();
      }
      return req;
    };
  }
  P.put = wrap(realPut); P.add = wrap(realAdd);
}, MODE);

const rows = () => page.evaluate(async () => (await (await import('./js/db.js')).db.all('log')).length);
const before = await rows();
// log a real meal through the real UI path
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1500);
/* The real path: a [data-addmeal] tile opens openAdd(), pick a generic food,
   then the sheet's #addBtn writes the log row. */
await page.evaluate(() => document.querySelector('[data-addmeal]')?.click());
await sleep(1600);
await page.evaluate(() => {
  const inp = document.querySelector('#t1Search, input[type=search]');
  if (inp) { inp.value = 'apple'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await sleep(1600);
const picked = await page.evaluate(() => {
  const row = document.querySelector('.t1-frow, [data-food], .food-row');
  if (!row) return 'no-food-row';
  row.click(); return 'picked';
});
await sleep(1600);
const submit = () => page.evaluate((picked) => {
  const b = document.getElementById('addBtn');
  if (!b) return 'no-addBtn:' + picked;
  b.click(); return 'submitted';
}, picked);
const logged = await submit();
await sleep(2200);
const state = () => page.evaluate(() => {
  const sheetUp = !!document.getElementById('addBtn');
  const toast = (document.getElementById('toast')?.textContent || '').trim();
  return { toast, sheetStillOpen: sheetUp,
    addBtnEnabled: sheetUp ? !document.getElementById('addBtn').disabled : null,
    tellsPlayer: /out of storage|could not save/i.test(document.body.innerText + ' ' + toast) };
});
const after = await state();
const afterRows = await rows();
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
ok('SETUP the meal actually reached the Add button (a flow that never submits proves nothing)',
  logged === 'submitted', String(logged));
if (MODE) ok('SETUP the injection fired (an armed abort that never ran proves nothing)',
  (await page.evaluate(() => window.__armed)) === false, 'window.__armed still true');
if (MODE === 'log') {
  ok('FAIL-LOG the meal is NOT silently counted as saved', afterRows === before, `${before} -> ${afterRows}`);
  ok('FAIL-LOG the player is TOLD, in words about storage', after.tellsPlayer, JSON.stringify(after.toast));
  ok('FAIL-LOG the entry stays on screen so they can retry', after.sheetStillOpen === true && after.addBtnEnabled === true, JSON.stringify(after));
  ok('FAIL-LOG nothing throws to the page (the rejection is handled, not just logged)', errs.length === 0, errs.slice(0, 1).join(''));
} else if (MODE === 'xp') {
  ok('FAIL-XP the committed row IS counted as saved', afterRows === before + 1, `${before} -> ${afterRows}`);
  ok('FAIL-XP the sheet CLOSED, so a second tap cannot duplicate the meal', after.sheetStillOpen === false, JSON.stringify(after));
  ok('FAIL-XP the toast reads Added and owns up to the lost receipt', /added/i.test(after.toast) && /xp did not record/i.test(after.toast), JSON.stringify(after.toast));
  ok('FAIL-XP nothing throws to the page (the null-message abort is handled)', errs.length === 0, errs.slice(0, 1).join(''));
  // the duplication itself: try to tap Add again; with the sheet gone there is no button
  const again = await submit();
  await sleep(1500);
  const rows2 = await rows();
  ok('FAIL-XP a second Add does not write a second row', again !== 'submitted' && rows2 === before + 1, `${again}, ${before} -> ${rows2}`);
} else {
  ok('SUCCESS a normal meal still saves', afterRows === before + 1, `${before} -> ${afterRows}`);
  ok('SUCCESS the sheet closes on a good save', after.sheetStillOpen === false, JSON.stringify(after.sheetStillOpen));
  ok('SUCCESS the toast confirms it', /added/i.test(after.toast) && !/did not record/i.test(after.toast), JSON.stringify(after.toast));
  ok('SUCCESS nothing throws to the page', errs.length === 0, errs.slice(0, 1).join(''));
}
await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nlog-write failure handled');
process.exit(fails.length ? 1 : 0);
