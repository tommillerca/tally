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
for (const [W,H] of [[393,852],[375,667]]) {
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await openLoadedFight(page);
  const res = await page.evaluate((topVal) => {
    const style = document.createElement('style');
    style.textContent = `.fight-act small.cost { top: ${topVal}px !important; }`;
    document.head.appendChild(style);
    // shorten guard text to simulate the code fix
    const guardCost = document.querySelector('[data-act="guard"] small.cost');
    guardCost.textContent = guardCost.textContent.replace(/\+22 Stamina$/, '+22');
    const out = {};
    for (const act of ['jab','swing','haymaker','guard']) {
      const b = document.querySelector(`[data-act="${act}"]`);
      const bEl = b.querySelector('b'), costEl = b.querySelector('small.cost');
      const lr = bEl.getBoundingClientRect(), cr = costEl.getBoundingClientRect();
      const overlapPx = Math.max(0, Math.min(lr.bottom,cr.bottom) - Math.max(lr.top,cr.top));
      const overlapX = Math.max(0, Math.min(lr.right,cr.right) - Math.max(lr.left,cr.left));
      out[act] = { overlapPx: +overlapPx.toFixed(1), overlapX: +overlapX.toFixed(1), costTop: +cr.top.toFixed(1), labelTop: +lr.top.toFixed(1) };
    }
    document.head.removeChild(style);
    return out;
  }, -3);
  console.log(`--- ${W}x${H} top:-3 ---`, JSON.stringify(res));
}
await browser.close();
if (srvHandle) srvHandle.close();
