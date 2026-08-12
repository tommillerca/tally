/* THE SHELL MUST NOT STAY DEAD.
 *
 * 2026-08-12: a TestFlight user's first-ever open on one bar of LTE rendered
 * index.html's static markup (gear, tab bar) and nothing else, and reopening
 * did not help. app.js is a module; a module graph that loses ONE file never
 * executes, so #screen stays empty with no error a player can see.
 *
 * Precaching the three missing modules fixed every player who has loaded once.
 * It cannot fix a FIRST open: no service worker exists yet, and on a bad enough
 * line the worker's own install fails too (measured against live: worker never
 * took control). The recovery script at the bottom of index.html is the last
 * line of defence, and this audit is what stops it from becoming a reload loop.
 *
 * Two failures matter and they pull in opposite directions, which is why both
 * are checked here:
 *   RECOVERS: a dead shell must reload itself once and come back.
 *   NEVER LOOPS: if the app is genuinely unreachable, it must reload ONCE and
 *   then stop. A loop is worse than a blank screen: battery, data, and it never
 *   recovers on its own.
 *
 * Usage: node tests/dead-shell-audit.mjs [baseUrl]  (serves this repo if omitted)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, serveTree, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argUrl = process.argv.slice(2).find(a => !a.startsWith('--'));
const srv = argUrl ? null : await serveTree(ROOT);
const base = argUrl || srv.url;

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const puppeteer = await loadPuppeteer();

/* Count real navigations, which is the only way to tell "reloaded once" from
   "reloaded forever". A framenavigated listener on the top frame is the honest
   counter; reading a flag the page sets would trust the thing under test. */
const session = async (blockRe, waitMs) => {
  const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 430, height: 932 } });
  const page = await browser.newPage();
  let navs = 0;
  page.on('framenavigated', f => { if (f === page.mainFrame()) navs++; });
  if (blockRe) {
    await page.setRequestInterception(true);
    page.on('request', r => { blockRe.test(r.url()) ? r.abort('failed').catch(() => {}) : r.continue().catch(() => {}); });
  }
  await page.goto(base + '?demo', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(waitMs);
  const state = await page.evaluate(() => ({
    kids: (document.getElementById('screen') || {}).children?.length ?? -1,
    gear: !!document.getElementById('gearBtn'),
    retried: !!sessionStorage.getItem('bhg-shell-retry'),
  }));
  await browser.close();
  return { navs, ...state };
};

/* 1. HEALTHY: the recovery script must be invisible. No reload, no flag left
      behind, and the app up. If this ever fails, the script is reloading real
      players for no reason, which is the expensive way to be wrong. */
const healthy = await session(null, 12000);
ok('SETUP the app comes up normally when nothing is broken', healthy.kids > 0, `screenKids=${healthy.kids}`);
ok('HEALTHY no reload happens when the app is alive', healthy.navs === 1, `${healthy.navs} navigation(s)`);
ok('HEALTHY and no retry flag is left behind', !healthy.retried, `flag=${healthy.retried}`);

/* 2. DEAD SHELL, PERMANENTLY: one module never arrives, ever. The app cannot
      come up, so the correct behaviour is exactly ONE extra navigation and then
      silence. This is the loop guard, and it is the check that matters most:
      the failure it prevents is one we would ship to every broken device. */
const dead = await session(/\/js\/haptics\.js/, 26000);
ok('DEAD SHELL the shell really is dead in this scenario (else nothing below means anything)', dead.kids <= 0 && dead.gear,
  `screenKids=${dead.kids} gear=${dead.gear}`);
ok('DEAD SHELL it retries exactly ONCE, never loops', dead.navs === 2, `${dead.navs} navigations in 26s (1 = never tried, 3+ = loop)`);

/* 3. RECOVERABLE: the failure is transient, which is what a bad bar actually
      is. The reload must bring the app back on its own, with no user action. */
const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 430, height: 932 } });
const page = await browser.newPage();
let blocking = true, navs = 0;
page.on('framenavigated', f => { if (f === page.mainFrame()) navs++; });
await page.setRequestInterception(true);
page.on('request', r => {
  if (blocking && /\/js\/haptics\.js/.test(r.url())) { blocking = false; r.abort('failed').catch(() => {}); return; }
  r.continue().catch(() => {});
});
await page.goto(base + '?demo', { waitUntil: 'domcontentloaded', timeout: 60000 });
const beforeRetry = await page.evaluate(() => (document.getElementById('screen') || {}).children?.length ?? -1);
await sleep(14000);
const after = await page.evaluate(() => (document.getElementById('screen') || {}).children?.length ?? -1);
await browser.close();
ok('TRANSIENT the first load really did die (an empty sample would fake this)', beforeRetry <= 0, `screenKids=${beforeRetry}`);
ok('TRANSIENT the automatic reload brings the app back with no user action', after > 0, `screenKids after retry=${after}, navigations=${navs}`);

console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`);
srv?.close();
process.exit(fails.length ? 1 : 0);
