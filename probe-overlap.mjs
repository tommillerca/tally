import { boot, sleep, serveTree, dismissOverlays } from './tests/godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    await db.kvSet('potions', { 'vital-tonic': 3, 'fury-flask': 2 });
    window.__denFight(1.4, 0, {});
  });
  await page.waitForFunction(() => {
    const f = document.getElementById('factions');
    return f && !/is acting/i.test(f.textContent || '') && f.querySelectorAll('.fight-act').length >= 4;
  }, { timeout: 15000, polling: 50 }).catch(() => {});
  await sleep(1000);
}

for (const [W, H] of [[393, 852], [375, 667]]) {
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await sleep(300);
  await openLoadedFight(page);
  const data = await page.evaluate(() => {
    const rectsOverlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const buttons = [...document.querySelectorAll('.fight-act')].map(b => {
      const r = b.getBoundingClientRect();
      const bEl = b.querySelector('b');
      const hintEl = b.querySelector('small:not(.cost)');
      const costEl = b.querySelector('small.cost');
      const bR = bEl?.getBoundingClientRect();
      const hR = hintEl?.getBoundingClientRect();
      const cR = costEl?.getBoundingClientRect();
      return {
        act: b.dataset.act || '(none)',
        name: bEl?.textContent.trim(),
        rect: { left: +r.left.toFixed(1), top: +r.top.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1), h: +r.height.toFixed(1), w: +r.width.toFixed(1) },
        labelClips: bEl ? bEl.scrollWidth > bEl.clientWidth + 1 : false,
        hintClips: hintEl ? hintEl.scrollWidth > hintEl.clientWidth + 1 : false,
        overlapLabelCost: (bR && cR) ? rectsOverlap(bR, cR) : false,
        overlapHintCost: (hR && cR) ? rectsOverlap(hR, cR) : false,
        costText: costEl?.textContent.trim(),
        hintText: hintEl?.textContent.trim(),
      };
    });
    return buttons;
  });
  console.log(`\n=== ${W}x${H} ===`);
  for (const b of data) {
    console.log(JSON.stringify(b));
  }
}
await browser.close();
if (srvHandle) srvHandle.close();
