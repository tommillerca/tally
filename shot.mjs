import { boot, seed, sleep, serveTree, setWidth } from './tests/godmode.js';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const srv = await serveTree(path.dirname(fileURLToPath(import.meta.url)));
const { browser, page } = await boot(srv.url);
await seed(page, { level: 24, coins: 60000 });
await setWidth(page, 393, 852);
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(2800);
const m = await page.evaluate(() => {
  const b = document.querySelector('.hype');
  if (!b) return { found: false };
  const r = b.getBoundingClientRect();
  const imgs = [...b.querySelectorAll('img')];
  return { found: true, y: Math.round(r.y), h: Math.round(r.height),
    imgs: imgs.length, decoded: imgs.filter(i=>i.naturalWidth>0).length,
    text: b.innerText.replace(/\s+/g,' ').trim().slice(0,120) };
});
console.log(JSON.stringify(m));
if (m.found) await page.evaluate(() => document.querySelector('.hype').scrollIntoView({block:'center'}));
await sleep(600);
await page.screenshot({ path: process.argv[2] });
await browser.close(); srv.close?.();
