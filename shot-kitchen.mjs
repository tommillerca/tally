import { boot, seed, sleep, serveTree, setWidth, dismissOverlays } from './tests/godmode.js';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const srv = await serveTree(root);
const { browser, page } = await boot(srv.url);
await seed(page, { level: 24, coins: 60000 });
await setWidth(page, 393, 852);
await dismissOverlays(page);
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(2500);
await dismissOverlays(page);
// open the Kitchen
await page.evaluate(() => document.querySelector('#kitchenActBtn')?.click());
await sleep(2200);
const m = await page.evaluate(() => {
  const rows = [];
  for (const img of document.querySelectorAll('img.pix-cur')) {
    const r = img.getBoundingClientRect();
    if (!r.width) continue;
    rows.push({ src: img.getAttribute('src').split('/').pop(), css: Math.round(r.width),
      nat: img.naturalWidth, x: Math.round(r.x), y: Math.round(r.y),
      near: (img.closest('.pot-card,.crate-row,.hero-act')?.innerText || '').replace(/\s+/g,' ').trim().slice(0,42) });
  }
  const mq = document.querySelector('.marquee');
  const mr = mq && mq.getBoundingClientRect();
  return { rows, marquee: mr && { x: Math.round(mr.x), y: Math.round(mr.y), w: Math.round(mr.width), h: Math.round(mr.height) },
    dpr: window.devicePixelRatio, title: document.querySelector('.sheet-head h2')?.textContent };
});
console.log(JSON.stringify(m, null, 1));
await page.screenshot({ path: process.argv[2] || 'kitchen.png' });
await browser.close(); srv.close?.();
