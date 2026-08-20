/* Render the shop mockup myself: the agent stalled before capturing, and its
   render script lived in its scratchpad rather than the branch. */
import { boot, sleep, serveTree } from './tests/godmode.js';
import path from 'node:path';
const srv = await serveTree(path.resolve('.'));
const { browser, page } = await boot(srv.url);

async function shoot(w, h, tag) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await sleep(900);
  await page.evaluate(() => {
    const t = document.querySelector('[data-tab="shop"]');
    if (t) t.click();
  });
  await sleep(1600);
  // kill the demo badge, which the agent flagged as noise in its own captures
  await page.evaluate(() => { document.querySelectorAll('.demo-badge,[class*="demo"]').forEach(e => { if (/demo/i.test(e.textContent || '')) e.style.display = 'none'; }); });
  const m = await page.evaluate(() => {
    const sc = document.querySelector('.screen') || document.scrollingElement;
    const tiles = document.querySelectorAll('[data-tryon]').length;
    return { scroll: sc.scrollHeight, view: sc.clientHeight, tiles };
  });
  await page.evaluate(() => { const sc = document.querySelector('.screen'); if (sc) sc.scrollTop = 0; });
  await sleep(300);
  await page.screenshot({ path: `/tmp/shop3-${tag}-top.png` });
  console.log(tag, JSON.stringify(m));
  return m;
}
const a = await shoot(440, 956, '440');
// try-on: tap the first tile
await page.evaluate(() => document.querySelector('[data-tryon]')?.click());
await sleep(1400);
await page.screenshot({ path: '/tmp/shop3-440-tryon.png' });
console.log('try-on sheet captured');
await browser.close(); srv.stop?.();
