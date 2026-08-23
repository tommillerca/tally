/* Render mockups/kitchen-art/review.html and prove every image on it decoded.
 *
 * boot(base) navigates to `base + '?demo'`, so handing it a deep .html path
 * produces `review.html/?demo`, which 404s. The first cut did exactly that and
 * then reported 0 images and 0 broken images as a PASS: an empty sample is a
 * failure, never a pass. Boot the server root, goto the page, and require a
 * non-zero image count before believing anything.
 */
import { boot, serveTree, sleep } from '../tests/godmode.js';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srv = await serveTree(root);
const { browser, page } = await boot(srv.url);
await page.setViewport({ width: 1000, height: 1200, deviceScaleFactor: 1 });
await page.goto(srv.url + 'mockups/kitchen-art/review.html', { waitUntil: 'networkidle2' });
await sleep(1200);
const m = await page.evaluate(async () => {
  const imgs = [...document.images];
  await Promise.all(imgs.map(i => i.decode().catch(() => {})));
  return {
    imgs: imgs.length,
    broken: imgs.filter(i => !i.naturalWidth).map(i => i.getAttribute('src')),
    h: document.body.scrollHeight,
    title: document.title,
  };
});
console.log(JSON.stringify(m));
let fail = 0;
if (m.imgs < 8) { console.log(`FAIL CONTROL: only ${m.imgs} images on the page, expected 8+`); fail++; }
if (m.broken.length) { console.log(`FAIL DECODE: ${m.broken.join(', ')}`); fail++; }
if (m.h < 2000) { console.log(`FAIL: page is only ${m.h}px tall, it did not render`); fail++; }
if (!fail) await page.screenshot({ path: process.argv[2], fullPage: true });
await browser.close(); srv.close?.();
process.exit(fail ? 1 : 0);
