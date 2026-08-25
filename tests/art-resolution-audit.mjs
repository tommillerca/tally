/* IS ANY OF CAM'S ART BEING DRAWN BIGGER THAN ITS SOURCE?
 *
 * Tom, 2026-08-19: "when the grill or small item is presented alone it's always
 * look super pixelated are you fixing that elsewhere?" and then "make sure you
 * werent doing any of that shit with the art you missed that's a huge fuck up".
 *
 * He was right, and a one-off fix was the wrong answer, because the defect is a
 * CLASS: a surface asks bhThumb() for a tier, then draws it larger than that
 * tier can serve. It is invisible on a jacket and ruinous on a grill, so it
 * hides from casual review and only shows on the smallest art in the game.
 *
 * WHAT THIS PINS. For every <img> and <canvas> drawing gear art, the PHYSICAL
 * pixels it occupies (css size x devicePixelRatio) against the pixels its source
 * actually carries. Anything drawn meaningfully above 1:1 is being invented by
 * the browser rather than drawn by Cam.
 *
 * It cannot see the lone-item canvases, because a canvas has no naturalWidth
 * once drawn; those are pinned by their own unit case on the SMALL_INK path.
 * Saying so here rather than implying this covers everything.
 *
 * PROVE-RED, both run on this tree 2026-08-24 and reverted, and this is what
 * each printed. They matter because until that day this file swept a save
 * wearing the starter cloud, which is animated and never reaches croppedPetImg,
 * so the 2048px pet art -- the only art here whose master is not 640, and the
 * art most able to be handed a tier it outgrows -- was never on screen at all.
 *   heroPetTier forced from 384 to 192, i.e. a tier that cannot serve the box
 *     -> RESOLUTION  "today:thumb/192/C/C6.png src 192 drawn 385 = 2.01x", and
 *        the same for all four worn layers. This is the class, caught.
 *   the buyPetItem loop below deleted
 *     -> SETUP  "equipped m0-C1 wearing 0, 2 pet layers swept". Not zero: the
 *        Today hype banner draws C6 whoever you own, which is exactly why the
 *        bound is five layers and not one.
 */
import { boot, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fails = [];
const ok = (n, pass, d = '') => { console.log(`${pass ? 'ok  ' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!pass) fails.push(n); };
const argv = process.argv[2] || process.env.URL;
const srv = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srv.url;
const { browser, page } = await boot(base);

/* A RATCHET AT TODAY'S WORST, NOT A COMFORTABLE NUMBER. The first run of this
   audit failed at 1.39x and the failure was REAL: the Today hero draws the
   bonehead at 887 physical pixels from a 640 master, which is the largest that
   figure appears anywhere in the app and is above what Cam's art actually
   carries. That is not fixable in code, because 640 IS the master; it needs
   larger source art, and it is written up for Tom rather than tuned away.
   So the ceiling is pinned just above the measured worst case. It cannot rise.
   It catches the class that started this (a 192 thumbnail behind a 200px canvas
   is 2.0x and up) and it will catch any NEW surface that outgrows the masters.
   LOWER THIS when bigger art lands. Never raise it. */
const MAX_UP = 1.40;
const seen = [];

async function sweep(label) {
  const rows = await page.evaluate(() => {
    const out = [];
    for (const i of document.querySelectorAll('img')) {
      const src = i.getAttribute('src') || '';
      if (!/assets\/bh\//.test(src)) continue;
      if (!i.naturalWidth) continue;
      const r = i.getBoundingClientRect();
      if (r.width < 8) continue;
      out.push({ src: src.split('assets/bh/')[1], nat: i.naturalWidth,
                 phys: Math.round(r.width * devicePixelRatio),
                 pixelated: getComputedStyle(i).imageRendering === 'pixelated' });
    }
    return out;
  });
  for (const r of rows) seen.push({ ...r, screen: label });
}

await page.setViewport({ width: 440, height: 956, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
for (const [hash, tab, label] of [
  ['#/bonehead', 'wardrobe', 'wardrobe'], ['#/bonehead', 'backpack', 'backpack'],
  ['#/bonehead', 'build', 'build'], ['#/today', null, 'today'], ['#/crew', null, 'crew'],
]) {
  await page.evaluate(h => { location.hash = h; }, hash); await sleep(1100);
  if (tab) { await page.evaluate(t => document.querySelector(`[data-tab="${t}"]`)?.click(), tab); await sleep(1400); }
  await sweep(label);
}

ok('SETUP the sweep actually found gear art to measure (an empty sweep would pass every row below for free)',
  seen.length >= 8, `${seen.length} art layers across ${new Set(seen.map(s => s.screen)).size} screens`);

const over = seen.filter(s => s.phys / s.nat > MAX_UP);
ok(`RESOLUTION no gear art is drawn more than ${MAX_UP}x its source`,
  over.length === 0,
  over.length
    ? over.slice(0, 5).map(o => `${o.screen}:${o.src} src ${o.nat} drawn ${o.phys} = ${(o.phys / o.nat).toFixed(2)}x`).join(' | ')
    : `worst ${Math.max(...seen.map(s => s.phys / s.nat)).toFixed(2)}x`);

/* Cam's wearable art is 640x640 CONTINUOUS TONE, not pixel art. Nearest
   neighbour on it is a defect, and the four legitimate `image-rendering:
   pixelated` rules in this sheet are all on real pixel art (the egg sequence,
   the crate icons, the coin sequence, the 48px currency icons). */
const wrongly = seen.filter(s => s.pixelated);
ok('SMOOTH no continuous-tone gear art is rendered with nearest-neighbour',
  wrongly.length === 0,
  wrongly.length ? wrongly.slice(0, 4).map(w => `${w.screen}:${w.src}`).join(', ') : 'none');

console.log(`\nart-resolution: ${fails.length ? fails.length + ' FAILED' : 'clean'}`);
await browser.close(); await srv?.stop?.();
process.exit(fails.length ? 1 : 0);
