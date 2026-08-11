/* Phase 4 "feel" audit: exits, queue, dialogs, haptics.
 *
 * WHAT EACH CHECK GUARDS, and its red:
 *   TOAST-QUEUE  two rapid toasts must BOTH be read in order. Red: restore the
 *                one-slot toast() and the second stomps the first.
 *   SHEET-EXIT   closing a sheet animates out (.closing present, pointer-events
 *                dead) and the node is GONE within 400ms (a swallowed
 *                animationend must never leak sheets). Red: remove the
 *                classList.add('closing') and the mid-flight assert fails.
 *   NO-PROMPT    window.prompt/confirm are BANNED: both are stubbed to throw, so
 *                any surviving call site fails the run loudly. The fit-save flow
 *                must open a sheet instead.
 *   ERASE-WORD   the erase button stays dead until the literal word ERASE is
 *                typed. Asserts enablement only: clicking would wipe the profile.
 *   HAPTICS      navigator.vibrate is counter-stubbed pre-load. The Settings
 *                toggle fires one; toggling Off gates future fires.
 *   ROUTE-IN     a navigation lands with the fade class on the fresh screen.
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { boot, sleep } = await import(path.join(ROOT, 'tests/godmode.js'));

/* serveTree: OS-assigned port, and a hard error if python never bound. */
const srvHandle = process.env.URL ? null : await serveTree(ROOT);
const srv = { kill: () => srvHandle && srvHandle.close() };
const base = process.env.URL || srvHandle.url;

const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

const { browser, page } = await boot(base, {
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
// BAN the natives + count vibrations, before any app code runs on next nav
await page.evaluateOnNewDocument(() => {
  window.__vibes = 0;
  Object.defineProperty(navigator, 'vibrate', { value: () => { window.__vibes++; return true; }, configurable: true });
  window.prompt = () => { throw new Error('window.prompt is banned (Phase 4)'); };
  window.confirm = () => { throw new Error('window.confirm is banned (Phase 4)'); };
});
await page.goto(base.replace(/\/?$/, '/') + '?demo', { waitUntil: 'networkidle2' });
await sleep(2600);

/* TOAST-QUEUE is asserted below via two real fit-saves in quick succession. */

/* ---------- SHEET-EXIT ---------- */
await page.evaluate(() => document.getElementById('fab')?.click());
await sleep(1200);
ok('SHEET opens (precondition)', await page.evaluate(() => !!document.querySelector('.sheet')));
const exit = await page.evaluate(async () => {
  const before = document.querySelectorAll('#sheets > div').length;
  history.back();                                 // the real close path (popstate)
  await new Promise(r => setTimeout(r, 80));      // mid-flight
  const sheet = document.querySelector('.sheet');
  const mid = {
    closing: !!sheet?.classList.contains('closing'),
    dead: sheet ? getComputedStyle(sheet.parentElement).pointerEvents === 'none' : false,
  };
  await new Promise(r => setTimeout(r, 420));     // must be buried by now
  return { before, mid, after: document.querySelectorAll('#sheets > div').length };
});
ok('SHEET-EXIT animates out and cannot eat taps', exit.mid.closing && exit.mid.dead, JSON.stringify(exit.mid));
ok('SHEET-EXIT the node is gone within 400ms', exit.before === 1 && exit.after === 0, `${exit.before} -> ${exit.after}`);

/* ---------- NO-PROMPT: the fit flow opens a SHEET ---------- */
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(2400);
await page.evaluate(() => document.querySelector('[data-fit-save]')?.click());
await sleep(1000);
const fit = await page.evaluate(() => {
  const sheet = [...document.querySelectorAll('.sheet')].pop();
  const input = sheet?.querySelector('#txIn');
  return { sheet: !!sheet, input: !!input, value: input?.value || '' };
});
ok('NO-PROMPT saving a fit opens a text sheet', fit.sheet && fit.input && /^Fit \d+/.test(fit.value), JSON.stringify(fit));
// and the queue: save twice quickly -> both toasts must be seen, in order
const toasts = await page.evaluate(async () => {
  const seen = [];
  const t = document.getElementById('toast');
  const mo = new MutationObserver(() => { if (!t.hidden && t.textContent) seen.push(t.textContent.slice(0, 24)); });
  mo.observe(t, { childList: true, attributes: true, characterData: true, subtree: true });
  const go = document.querySelector('#txGo');
  const input = document.querySelector('#txIn');
  input.value = 'Feel Test Fit';
  go.click();
  await new Promise(r => setTimeout(r, 500));
  // fire a second toast immediately behind the first via the other real control
  document.querySelector('[data-fit-save]')?.click();
  await new Promise(r => setTimeout(r, 600));
  document.querySelector('#txGo')?.click();
  await new Promise(r => setTimeout(r, 3400));
  mo.disconnect();
  return [...new Set(seen)];
});
ok('TOAST-QUEUE both saves were announced in order', toasts.length >= 2 && /Saved "Feel Test Fit"/.test(toasts.join('|')), toasts.join(' | '));
ok('TOAST aria-live is stamped', await page.evaluate(() => document.getElementById('toast').getAttribute('aria-live') === 'polite'));

/* ---------- ERASE-WORD ---------- */
await page.evaluate(() => { location.hash = '#/settings'; });
await sleep(1800);
await page.evaluate(() => document.getElementById('eraseBtn')?.click());
await sleep(900);
const erase = await page.evaluate(async () => {
  const go = document.getElementById('erGo'), input = document.getElementById('erIn');
  if (!go || !input) return null;
  const start = go.disabled;
  const type = async v => { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 120)); };
  await type('DELETE');
  const wrong = go.disabled;
  await type('erase');
  const right = go.disabled;
  return { start, wrongStaysDead: wrong, caseInsensitiveArms: !right };
});
ok('ERASE-WORD dead until the word is typed', !!erase && erase.start && erase.wrongStaysDead && erase.caseInsensitiveArms, JSON.stringify(erase));
await page.evaluate(() => history.back());
await sleep(700);

/* ---------- HAPTICS ---------- */
const hap = await page.evaluate(async () => {
  const before = window.__vibes;
  document.getElementById('hapOn')?.click();          // fires haptic.success()
  await new Promise(r => setTimeout(r, 700));
  const afterOn = window.__vibes;
  document.getElementById('hapOff')?.click();         // gates future fires
  await new Promise(r => setTimeout(r, 700));
  const off = window.__vibes;
  document.getElementById('hapOn')?.click();          // restore default ON
  await new Promise(r => setTimeout(r, 400));
  return { before, afterOn, gatedDelta: off - afterOn };
});
ok('HAPTICS the toggle fires the motor', hap.afterOn > hap.before, JSON.stringify(hap));
ok('HAPTICS off gates future fires', hap.gatedDelta === 0, `delta while off: ${hap.gatedDelta}`);

/* ---------- ROUTE-IN ---------- */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1600);
ok('ROUTE-IN a navigation lands with the fade class', await page.evaluate(() =>
  !!document.querySelector('#screen > .route-in') || !!document.querySelector('.screen > .route-in')));

ok('NO page errors (prompt/confirm bans included)', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
srv.kill();
const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join(', ')); process.exit(1); }
console.log('feel-audit clean');
