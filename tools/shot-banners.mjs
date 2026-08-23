/* Each banner concept rendered INSIDE the real .marquee band, in the real
   Kitchen sheet, at the real 92px height and the real band width. Also measures
   the title's contrast against whatever the art puts behind it, because a
   banner that eats its own headline is not cooler, it is broken. */
import { boot, seed, sleep, serveTree, setWidth, dismissOverlays } from '../tests/godmode.js';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const which = process.argv[2];              // 'current' | file basename
const out = process.argv[3];
const srv = await serveTree(root);
const { browser, page } = await boot(srv.url);
await seed(page, { level: 24, coins: 60000 });
await setWidth(page, 393, 852);
await dismissOverlays(page);
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(2500);
await dismissOverlays(page);
await page.evaluate(() => document.querySelector('#kitchenActBtn')?.click());
await sleep(2000);

const m = await page.evaluate(async (which) => {
  const mq = document.querySelector('.marquee');
  if (!mq) return { error: 'no marquee' };
  if (which !== 'current') {
    mq.querySelector('.scene')?.remove();          // the vector placeholder goes
    const i = new Image();
    i.src = `mockups/kitchen-art/banner/${which}.png`;
    i.className = 'pix-scene';
    Object.assign(i.style, { position: 'absolute', right: '0', bottom: '0', zIndex: '2',
      imageRendering: 'pixelated', pointerEvents: 'none' });
    mq.appendChild(i);
    await i.decode();
    if (!i.naturalWidth) return { error: 'banner did not decode' };
  }
  const r = mq.getBoundingClientRect();
  const t = mq.querySelector('h2').getBoundingClientRect();
  return { band: { w: Math.round(r.width), h: Math.round(r.height) },
    title: { x: Math.round(t.x - r.x), y: Math.round(t.y - r.y), w: Math.round(t.width), h: Math.round(t.height) },
    clip: { x: r.x - 4, y: r.y - 4, width: r.width + 8, height: r.height + 8 } };
}, which);
console.log(JSON.stringify(m));
if (m.error) { await browser.close(); srv.close?.(); process.exit(1); }
await sleep(400);
await page.screenshot({ path: out, clip: m.clip });
await browser.close(); srv.close?.();
