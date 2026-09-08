import { auditOutputPath } from './lib/audit-output.mjs';
/* M5 frozen order, 2026-09-07. Adapted from the available cx-firstrun WIP:
 * preserve the first-run intro and four-job toast backlog cap. Browser proof
 * is pending in the authoring sandbox. Expected: 8/8 passed, exit 0.
 * CONTROL: boot with webdriver masked and observe all splash insertions;
 * measure six requested toasts but expect only the active one plus four newest.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveTree, loadPuppeteer, chromePath, sandboxArgs, sleep, maskWebdriver, shotDir } from './godmode.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srv = process.argv[2] ? null : await serveTree(root);
const base = (process.argv[2] || srv.url).replace(/\/?$/, '/');
const shots = shotDir('m5-firstrun');
const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`);
};
const puppeteer = await loadPuppeteer();
let browser;
try {
  browser = await puppeteer.launch({
    headless: process.env.HEADLESS_MODE || 'shell', executablePath: chromePath(), args: sandboxArgs(),
    defaultViewport: { width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  const errors = [];
  async function pageFor(context) {
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await maskWebdriver(page); // includes the production egress wall
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
    await page.evaluateOnNewDocument(() => {
      window.__m5Splashes = 0;
      new MutationObserver(records => {
        for (const r of records) for (const n of r.addedNodes) {
          if (n.nodeType === 1 && (n.id === 'splash' || n.querySelector?.('#splash'))) window.__m5Splashes++;
        }
      }).observe(document, { subtree: true, childList: true });
    });
    return page;
  }
  const freshContext = await browser.createBrowserContext();
  const fresh = await pageFor(freshContext);
  await fresh.goto(base, { waitUntil: 'domcontentloaded' });
  await fresh.waitForSelector('#splash', { visible: true, timeout: 15000 });
  await fresh.waitForFunction(() => {
    const images = [...document.querySelectorAll('#splash img')];
    return images.length > 0 && images.every(img => img.complete && img.naturalWidth > 0);
  }, { timeout: 15000 });
  await fresh.screenshot({ path: auditOutputPath(path.join(shots, 'first-run-intro.png')) });
  ok('FIRST-INTRO first run retains its unforced splash', await fresh.evaluate(() => window.__m5Splashes === 1));
  await fresh.click('#splash');
  await fresh.waitForSelector('#splash', { hidden: true });
  await fresh.waitForSelector('#onbGo', { visible: true });
  const disclosure = await fresh.$eval('.onb', el => el.innerText);
  const expected = "New bones. I'm Gwart. You eat, the skeleton earns. I keep an anonymous account for you. No email, password, or sign-up. The Privacy policy tells the long version.";
  ok('DISCLOSURE Gwart introduces himself and names the anonymous account', disclosure.includes(expected));
  await fresh.screenshot({ path: auditOutputPath(path.join(shots, 'first-run-disclosure.png')) });
  const go = await fresh.$('#onbGo');
  await go.click();
  await fresh.waitForSelector('#onbName', { visible: true });
  ok('FIRST-CTA onboarding advances after dismissing the intro', await fresh.$('#onbName') !== null);
  await freshContext.close();

  const toastContext = await browser.createBrowserContext();
  // This page keeps the browser's native webdriver flag, exposing __toast
  // and retaining the app's NOSOCIAL guard, as toast-map-audit does.
  const toastPage = await toastContext.newPage();
  toastPage.on('pageerror', e => errors.push(e.message));
  await toastPage.goto(base, { waitUntil: 'networkidle2' });
  const dwell = await toastPage.evaluate(async () => {
    const toast = document.querySelector('#toast'), intervals = new Map();
    const sample = () => {
      if (!toast.hidden && toast.textContent.startsWith('m5-toast-')) {
        const key = toast.textContent, now = performance.now();
        const row = intervals.get(key) || { first: now, last: now };
        row.last = now; intervals.set(key, row);
      }
    };
    const timer = setInterval(sample, 10);
    for (let i = 0; i < 6; i++) window.__toast(`m5-toast-${i}`, 260);
    await new Promise(r => setTimeout(r, 6 * (260 + 180) + 500));
    clearInterval(timer); sample();
    return Array.from({ length: 6 }, (_, i) => {
      const row = intervals.get(`m5-toast-${i}`);
      return row ? Math.round(row.last - row.first) : -1;
    });
  });
  ok('TOAST-CAP active toast plus newest four, no backlog lecture', dwell[1] === -1 && dwell.filter(ms => ms >= 0).length === 5, dwell.join(', '));
  ok('TOAST-DWELL retained notices get their requested dwell', [0, 2, 3, 4, 5].every(i => dwell[i] >= 225), dwell.join(', '));
  await toastContext.close();

  const returnContext = await browser.createBrowserContext();
  const returning = await pageFor(returnContext);
  await returning.goto(base + '?demo', { waitUntil: 'domcontentloaded' });
  await returning.waitForSelector('#dwSpin', { visible: true, timeout: 20000 });
  await returning.screenshot({ path: auditOutputPath(path.join(shots, 'returning-reward.png')) });
  await returning.click('#dwSpin');
  await sleep(80);
  if (await returning.$('#dwSpin')) await returning.click('#dwSpin');
  await returning.waitForSelector('.dw-result', { timeout: 8000 });
  await returning.click('.dw-cta');
  await returning.waitForSelector('.dw', { hidden: true });
  ok('RETURN-INTRO returning boot never mounted the splash', await returning.evaluate(() => window.__m5Splashes === 0));
  const ready = await returning.evaluate(() => {
    const el = document.querySelector('#fab');
    if (!el || location.hash !== '#/today') return false;
    const b = el.getBoundingClientRect();
    return b.width > 0 && b.height > 0 && el.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
  });
  ok('RETURN-TODAY Today is interactive after the daily reward', ready);
  await returnContext.close();
  ok('ERRORS no page errors', errors.length === 0, errors.join('; '));
} finally {
  if (browser) await browser.close();
  if (srv) await srv.close();
}
const failed = results.filter(r => !r.pass).length;
console.log(`${results.length - failed}/${results.length} passed`);
console.log(`Screenshots: ${shots}`);
process.exitCode = failed || results.length !== 8 ? 1 : 0;
