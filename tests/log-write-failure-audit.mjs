/* A FAILED SAVE MUST NOT LOOK LIKE A SAVED MEAL.
 *
 * Measured 2026-08-13 on v373: reject the log write the way a full quota does
 * and the meal vanished with NO error, while an unrelated toast ("New talent
 * points ready. Tap Build to spec your Bonehead.") sat on screen reading like
 * success. 166 log rows before, 166 after. `await db.put('log', e)` had no
 * try/catch, db.put rejects on transaction abort, and everything after that
 * line was skipped, so the sheet closed and the player believed it saved.
 *
 * This is the app's most common action, and storage really does fill: measured
 * growth is ~2.4MB a year and a phone with 500MB free reaches its origin quota
 * in roughly four years of daily use.
 *
 * Tom chose the behaviour: tell the player and LEAVE THE ENTRY ON SCREEN so
 * they know to free up space and have somewhere to land when they come back.
 *
 * The failure is INJECTED, and that is deliberate and different from the quota
 * work in Lane C. Vlad correctly refused to simulate a quota in JS to prove the
 * PLATFORM fails. This proves how OUR CODE handles a rejected write, which is
 * our code, and injection is the honest way to reach it.
 *
 * PROVE-RED: remove the try/catch around db.put('log', e) and the FAIL rows go
 * red: no toast, sheet closed, nothing told the player.
 *
 * Usage: node tests/log-write-failure-audit.mjs
 */

import { boot, seed, sleep, serveTree } from './godmode.js';
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
const errs = []; page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
const rejections = [];
page.on('console', m => { if (/unhandled|rejection/i.test(m.text())) rejections.push(m.text().slice(0, 80)); });
await seed(page, { level: 12 });
await sleep(1500);

// make the NEXT write to the log store fail, the way a full quota would
await page.evaluate(async (shouldFail) => {
  const db = await import('./js/db.js');
  window.__failNext = shouldFail;
  const realPut = db.db.put;
  db.db.put = (store, val) => {
    if (window.__failNext && store === 'log') { window.__failNext = false;
      return Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError')); }
    return realPut(store, val);
  };
}, !!process.env.FAIL);
const before = await page.evaluate(async () => (await (await import('./js/db.js')).db.all('log')).length);
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
const logged = await page.evaluate(() => {
  const b = document.getElementById('addBtn');
  if (!b) return 'no-addBtn:' + picked;
  b.click(); return 'submitted';
});
await sleep(2200);
const after = await page.evaluate(async () => {
  const d = await import('./js/db.js');
  const sheetUp = !!document.getElementById('addBtn');
  return { rows: (await d.db.all('log')).length,
    toast: (document.getElementById('toast')?.textContent || '').trim(),
    sheetStillOpen: sheetUp,
    addBtnEnabled: sheetUp ? !document.getElementById('addBtn').disabled : null,
    tellsPlayer: /out of storage|could not save/i.test(document.body.innerText + ' ' + (document.getElementById('toast')?.textContent || '')) };
});
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
ok('SETUP the meal actually reached the Add button (a flow that never submits proves nothing)',
  logged === 'submitted', String(logged));
if (process.env.FAIL) {
  ok('FAIL-WRITE the meal is NOT silently counted as saved', after.rows === before, `${before} -> ${after.rows}`);
  ok('FAIL-WRITE the player is TOLD, in words about storage', after.tellsPlayer, JSON.stringify(after.toast));
  ok('FAIL-WRITE the entry stays on screen so they can retry', after.sheetStillOpen === true && after.addBtnEnabled === true, JSON.stringify(after));
  ok('FAIL-WRITE nothing throws to the page (the rejection is handled, not just logged)', errs.length === 0, errs.slice(0,1).join(''));
} else {
  ok('SUCCESS a normal meal still saves', after.rows === before + 1, `${before} -> ${after.rows}`);
  ok('SUCCESS the sheet closes on a good save', after.sheetStillOpen === false, JSON.stringify(after.sheetStillOpen));
  ok('SUCCESS the toast confirms it', /added/i.test(after.toast), JSON.stringify(after.toast));
}
await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nlog-write failure handled');
process.exit(fails.length ? 1 : 0);
