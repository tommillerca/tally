/* Render docs/mockups/dust-loop.html's three boards to PNG at 390x844 dpr2.
 * Capture only, no assertions. Usage: node docs/mockups/shoot-dust-loop.mjs
 * Serves the repo so ../../app.css and ../../assets/** resolve by their real paths.
 */
import { serveTree, sleep } from '../../tests/godmode.js';
import { loadPuppeteer, chromePath, sandboxArgs } from '../../tests/godmode.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const srv = await serveTree(ROOT);
const puppeteer = await loadPuppeteer();
const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'new',
  executablePath: chromePath(),
  args: sandboxArgs(),
  protocolTimeout: 300000,
});
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
await page.goto(srv.url.replace(/\/?$/, '/') + 'docs/mockups/dust-loop.html', { waitUntil: 'networkidle2' });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(async () => {
  await Promise.all([...document.images].map(i => i.decode().catch(() => {})));
});
await sleep(600);
for (const [id, name] of [['boardA', 'mock-a-mirror.png'], ['boardB', 'mock-b-bench-new.png'], ['boardC', 'mock-c-bench-rate.png']]) {
  const el = await page.$('#' + id);
  await el.screenshot({ path: join(HERE, name) });
  console.log(name, JSON.stringify(await el.boundingBox()));
}
await browser.close();
srv.close?.();
