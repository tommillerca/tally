import { boot, sleep, serveTree, dismissOverlays } from './tests/godmode.js';
import path from 'node:path';
const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve('.'));
const { browser, page } = await boot(argv || srvHandle.url);
async function openLoadedFight(page) {
  await dismissOverlays(page);
  await page.evaluate(() => document.querySelector('.sheet-close')?.click());
  await sleep(400);
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.kvSet('talents', ['heckle']);
    window.__denFight(1.4, 0, {});
  });
  await page.waitForFunction(() => {
    const f = document.getElementById('factions');
    return f && !/is acting/i.test(f.textContent || '') && f.querySelectorAll('.fight-act').length >= 4;
  }, { timeout: 15000, polling: 50 }).catch(() => {});
  await sleep(1000);
}
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await openLoadedFight(page);
await page.screenshot({ path: process.env.OUT || '/tmp/pit-before.png' });
const b = await page.$('[data-act="guard"]');
await b.screenshot({ path: (process.env.OUT || '/tmp/pit-before.png').replace('.png','-guard.png') });
const j = await page.$('[data-act="jab"]');
await j.screenshot({ path: (process.env.OUT || '/tmp/pit-before.png').replace('.png','-jab.png') });
await browser.close();
if (srvHandle) srvHandle.close();
