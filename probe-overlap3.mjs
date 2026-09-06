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
const data = await page.evaluate(() => {
  const out = {};
  for (const act of ['jab','swing','haymaker','guard']) {
    const b = document.querySelector(`[data-act="${act}"]`);
    if (!b) { out[act] = null; continue; }
    const bEl = b.querySelector('b'), costEl = b.querySelector('small.cost');
    const lr = bEl.getBoundingClientRect(), cr = costEl.getBoundingClientRect();
    const overlapPx = Math.max(0, Math.min(lr.bottom,cr.bottom) - Math.max(lr.top,cr.top));
    out[act] = { label: [lr.top,lr.bottom], cost: [cr.top,cr.bottom], overlapPx: +overlapPx.toFixed(1), costText: costEl.textContent };
  }
  return out;
});
console.log(JSON.stringify(data, null, 2));
await browser.close();
if (srvHandle) srvHandle.close();
