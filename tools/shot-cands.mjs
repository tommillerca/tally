/* Renders the four candidates INSIDE the real Kitchen sheet, in the real pot
   card, at the real 24 CSS px pixCur('recipe', 26) resolves to. Not a contact
   sheet: the app's own CSS, the app's own image-rendering, the app's own
   background. Writes the crop the eye actually has to judge. */
import { boot, seed, sleep, serveTree, setWidth, dismissOverlays } from '../tests/godmode.js';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srv = await serveTree(root);
const { browser, page } = await boot(srv.url);
await seed(page, { level: 24, coins: 60000 });
const DPR = Number(process.env.DPR || 2);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
await sleep(900);
await dismissOverlays(page);
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(2500);
await dismissOverlays(page);
await page.evaluate(() => document.querySelector('#kitchenActBtn')?.click());
await sleep(2200);

const cands = [
  ['CURRENT', 'assets/icons-pix/recipe.png'],
  ['A', 'assets/icons-pix/kitchen.png'],
  ['B', 'mockups/kitchen-art/cand/b-lit-brew.png'],
  ['C', 'mockups/kitchen-art/cand/c-cold-pot.png'],
];
const m = await page.evaluate(async (cands) => {
  const grid = document.querySelector('.pot-card')?.parentElement;
  if (!grid) return { error: 'no pot grid' };
  grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
  grid.innerHTML = cands.map(([n, src]) => `<div class="pot-card idle">
      <span class="pot-ico"><img src="${src}" alt="" class="ico pix-cur" width="24" height="24"
        style="width:24px;height:24px" decoding="sync"></span>
      <small>${n}<br>Empty pot</small></div>`).join('');
  const imgs = [...grid.querySelectorAll('img')];
  await Promise.all(imgs.map(i => i.decode().catch(() => {})));
  const r = grid.getBoundingClientRect();
  return { box: { x: r.x, y: r.y, w: r.width, h: r.height },
    decoded: imgs.filter(i => i.naturalWidth > 0).length, n: imgs.length,
    css: imgs.map(i => Math.round(i.getBoundingClientRect().width)) };
}, cands);
console.log(JSON.stringify(m));
if (m.error) { await browser.close(); srv.close?.(); process.exit(1); }
if (m.decoded !== m.n) { console.log('FAIL: not every candidate decoded'); await browser.close(); srv.close?.(); process.exit(1); }
await page.evaluate(() => document.querySelector('.pot-card').scrollIntoView({ block: 'center' }));
await sleep(500);
const clip = await page.evaluate(() => {
  const r = document.querySelector('.pot-card').parentElement.getBoundingClientRect();
  return { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: r.width + 20, height: r.height + 20 };
});
console.log('clip ' + JSON.stringify(clip));
await page.screenshot({ path: process.argv[2], clip });
await browser.close(); srv.close?.();
