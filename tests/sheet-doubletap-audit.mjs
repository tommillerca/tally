/* R39-12: double-tapping a sheet trigger opened the sheet and closed it right back.
 *
 * WHERE. openSheet's `.sheet-backdrop` click handler (js/app.js) called
 * history.back() unconditionally. The backdrop is `position:fixed; inset:0`, so it
 * covers the trigger button the instant the sheet opens; a second real tap at the
 * SAME screen coordinates, made before the 0.28s slide-up settles, lands on the
 * backdrop instead of on whatever is behind it and closes the sheet it just opened.
 * Measured on the handoff: 6/6 reproductions at a 60ms gap between taps, 5/6 at
 * 90ms, 0/6 at 150ms+.
 *
 * FIX. openSheet stamps `openedAt` and the backdrop handler ignores a click that
 * lands inside the first 300ms (a hair over the 0.28s slide-up).
 *
 * This is generic sheet-trigger behaviour, not a Kennel-specific fix, so it is
 * driven here through Progress -> "Log weight" (`#logWeight`), a plain openSheet
 * call already used as a stable trigger by tests/screen-sweep.mjs.
 *
 * PROVE-RED: reintroducing the unconditional history.back() (or dropping the
 * openedAt gate) fails the first row below with the sheet closed after a 60ms
 * double-tap; verified 2026-09-06 before the fix landed.
 *
 * Usage: node tests/sheet-doubletap-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveTree, loadPuppeteer, chromePath, sandboxArgs } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const puppeteer = await loadPuppeteer();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let srv = null, srvHandle = null;
let base = process.env.URL;
if (!base) {
  srvHandle = await serveTree(ROOT);
  srv = { kill: () => srvHandle.close() };
  base = srvHandle.url;
}
base = base.replace(/\/?$/, '/');

const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'new',
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  executablePath: chromePath(),
  args: sandboxArgs(),
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(base + '?demo', { waitUntil: 'networkidle2' });
await sleep(2500);
await page.evaluate(() => { location.hash = '#/progress'; });
await sleep(1800);

const centreOf = async sel => {
  const found = await page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    return true;
  }, sel);
  if (!found) return null;
  await sleep(200);   // real coordinates: a tap must land on the trigger, not scroll mid-flight
  return page.evaluate(s => {
    const r = document.querySelector(s).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
};

/* ---------- row 1: a 60ms double-tap must not close the sheet it opened ---------- */
{
  const btn = await centreOf('#logWeight');
  if (!btn) {
    ok('R39-12 SETUP #logWeight is reachable on Progress', false, 'button missing, cannot drive the trigger');
  } else {
    await page.mouse.click(btn.x, btn.y);
    await sleep(60);                         // the measured worst gap: 6/6 reproduced here pre-fix
    await page.mouse.click(btn.x, btn.y);     // lands on the backdrop pre-fix, on whatever is behind it post-fix
    await sleep(500);                        // let any close animation finish so a real close isn't mid-flight
    const open = await page.evaluate(() => !!document.querySelector('.sheet'));
    ok('R39-12 a 60ms double-tap on the trigger leaves the sheet open', open);
    // clean up: close it the normal way before the next check
    if (open) { await page.evaluate(() => history.back()); await sleep(500); }
  }
}

/* ---------- row 2: a tap on the backdrop after 400ms still closes normally ---------- */
{
  const btn = await centreOf('#logWeight');
  if (!btn) {
    ok('R39-12 SETUP #logWeight is reachable on Progress (row 2)', false);
  } else {
    await page.mouse.click(btn.x, btn.y);
    await sleep(400);
    const opened = await page.evaluate(() => !!document.querySelector('.sheet'));
    // tap near the top of the viewport: above the sheet panel (it slides up from the
    // bottom and does not cover full height), so this can only land on the backdrop
    await page.mouse.click(20, 20);
    await sleep(500);
    const closedAfter = await page.evaluate(() => !document.querySelector('.sheet'));
    ok('R39-12 a backdrop tap at 400ms still closes the sheet', opened && closedAfter, `opened=${opened} closedAfter=${closedAfter}`);
  }
}

ok('NO page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join(', ')); process.exit(1); }
console.log('sheet-doubletap-audit clean');
