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
for (const [W,H] of [[393,852],[375,667],[320,568]]) {
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await openLoadedFight(page);
  const res = await page.evaluate((candidates) => {
    function lineCount(el) {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const tops = new Set();
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const r = document.createRange(); r.selectNodeContents(n);
        for (const box of r.getClientRects()) if (box.width > 0) tops.add(Math.round(box.top));
      }
      return tops.size;
    }
    const b = document.querySelector('[data-act="guard"]');
    const costEl = b.querySelector('small.cost');
    const labelEl = b.querySelector('b');
    const orig = costEl.textContent;
    const out = {};
    for (const c of candidates) {
      costEl.textContent = c;
      const lr = labelEl.getBoundingClientRect(), cr = costEl.getBoundingClientRect();
      const overlapPx = Math.max(0, Math.min(lr.bottom,cr.bottom) - Math.max(lr.top,cr.top));
      out[c] = { lines: lineCount(costEl), overlapPx: +overlapPx.toFixed(1) };
    }
    costEl.textContent = orig;
    return out;
  }, [
    '1 AP · 12 Stamina · +22 Stamina',
    '1 AP · 12 Stamina · +22',
    '1 AP · 12 Stam · +22',
    '1 AP · 12/+22 Stamina',
  ]);
  console.log(`--- ${W}x${H} ---`);
  console.log(JSON.stringify(res, null, 2));
}
await browser.close();
if (srvHandle) srvHandle.close();
