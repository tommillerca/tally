import { boot, serveTree, sleep } from '../tests/godmode.js';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srv = await serveTree(root);
const { browser, page } = await boot(srv.url + 'mockups/kitchen-art/review.html');
await page.setViewport({ width: 1000, height: 1200, deviceScaleFactor: 1 });
await sleep(1500);
const m = await page.evaluate(async () => {
  const imgs = [...document.images];
  await Promise.all(imgs.map(i => i.decode().catch(() => {})));
  return { imgs: imgs.length, broken: imgs.filter(i => !i.naturalWidth).map(i => i.getAttribute('src')),
    h: document.body.scrollHeight };
});
console.log(JSON.stringify(m));
if (m.broken.length) { await browser.close(); srv.close?.(); process.exit(1); }
await page.screenshot({ path: process.argv[2], fullPage: true });
await browser.close(); srv.close?.();
