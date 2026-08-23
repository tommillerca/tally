/* SHOTS OF THE SHIPPED TODAY, not of a mockup: four states at 390x844 dark on a
 * ?demo-seeded save. Capture only, no assertions; tests/today-container-audit.mjs
 * is the guard. Usage: node tests/today-d2-shots.mjs [baseUrl]
 */
import { boot, serveTree, sleep } from './godmode.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(repo, '_feedback_shots', 'today-d2');
const arg = process.argv[2];
const srv = arg ? null : await serveTree(repo);
const { browser, page } = await boot(arg || srv.url);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(2600);
const settle = async () => {
  await page.evaluate(async () => {
    document.querySelector('.dw')?.remove(); document.querySelector('.drop-veil')?.remove();
    await Promise.all([...document.querySelectorAll('#screen img')].map(i => i.decode().catch(() => {})));
  });
  await sleep(500);
};
const shot = async name => { await settle(); await page.screenshot({ path: join(out, name) }); console.log(name); };
const scrollTo = y => page.evaluate(v => { document.getElementById('screen').scrollTop = v; }, y);

await shot('d2-1-top.png');
await scrollTo(await page.evaluate(() => document.querySelector('.dayblk').offsetTop - 40));
await shot('d2-2-day.png');
await scrollTo(await page.evaluate(() => document.querySelector('.tsec-meals').offsetTop + 260));
await shot('d2-3-food.png');
await scrollTo(1e6);
await shot('d2-4-bottom.png');
await page.evaluate(() => document.getElementById('prevDay').click());
await sleep(1800);
await scrollTo(await page.evaluate(() => document.querySelector('.dayblk').offsetTop - 90));
await shot('d2-5-pastday.png');
await scrollTo(0);
await shot('d2-6-pastday-top.png');
await browser.close(); srv?.close?.();
