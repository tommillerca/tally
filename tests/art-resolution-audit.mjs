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
   LOWER THIS when bigger art lands. Never raise it.

   AND IT IS NOT RAISED FOR THE SHOP EITHER (2026-08-25). Extending the sweep to
   the Shop rack -- see the SURFACES note below for why it was never swept --
   puts RESOLUTION red on a real defect that has been shipping since v409:

     the rack's mannequin tiles pass `thumb: 384` to avatarLayersHtml, and then
     CSS zooms the stage into the slot being sold. `.fit-waist` is scale(2.8),
     so a 384px source is drawn across ~653 device pixels on a dpr-2 phone.
     That is 1.70x, and it is the exact class this file exists to catch.

   MEASURED OFF THE RENDER, 2026-08-25, 440x956 DPR 2, load 5.29, and the run
   printed these verbatim rather than them being derived from the CSS:
     shop:thumb/384/U/U7.png     src 384 drawn 653 = 1.70x
     shop:thumb/384/S/S4-1.png   src 384 drawn 583 = 1.52x
     shop:thumb/384/B/B0-1.png   src 384 drawn 653 = 1.70x  (the shared body)
     shop:thumb/384/B/B0-1.png   src 384 drawn 583 = 1.52x  (same file, S tile)
     shop:thumb/384/SK/SK0-1.png src 384 drawn 583 = 1.52x  (the shared skull)
   REACH was green for all six surfaces on the same run and SETUP found 92 art
   layers, so this is a real sweep and not an empty one.

   AND IT IS DETERMINISTIC, which is what makes it guardable. RACK_POOLS is
   eight rungs and each rung is pinned to a SLOT; the week only chooses which of
   three ids fills it, never which slot. So the rack's nine stages (eight rungs
   plus the aura at RACK_AURA_CELL) always show the same nine zooms:
     U   fit-waist  2.8   1.70x   OVER      FW  fit-feet   2.2   1.34x
     S   fit-shin   2.5   1.52x   OVER      P   fit-hips   2.0   1.21x
     H   fit-head   2.3   1.40x   on the line    T  fit-torso 1.7  1.03x
     IL / aura  fit-hand(-l) 1.6  0.97x     B   fit-body   1.35  0.82x
   The ratio is the ZOOM, not the tile, so on an over tile EVERY layer is over:
   the shared body and skull are drawn through the same transform as the piece
   being sold. That is six layers over on a normal week, not two.

   RAISING THE CEILING FOR THIS WOULD BE THE WRONG TRADE and the numbers say so
   rather than taste. The fix is one word in js/app.js -- drop `thumb: 384` off
   rackTile and rackAuraTile so the stages take the 640 masters -- and at 640 the
   worst slot lands at 640/2.8 = 229 source px under 233 device px, i.e. 1.02x,
   essentially 1:1. What that costs in memory, worked from the decoded-RGBA
   arithmetic the census uses (384^2*4 = 0.5625 MB a layer, 640^2*4 = 1.5625 MB,
   so +1.0 MB per layer promoted):
     nine stages: seven of three layers (body B0-1, skull SK0-1, the piece), the
     BODY rung of two (its piece IS the body, replacing B0-1), and the aura tile
     of three. 26 <img> elements, but only 11 DISTINCT sources, because the base
     pair is shared by every tile and a browser decodes a URL once.
     counted the way memory-census counts (per <img>):  +26.0 MB
     counted the way the renderer actually pays it:     +11.0 MB
   The Shop reads 38.1 MB post-#158 against a 90 MB ceiling, so the worst of
   those lands at 64.1 MB and the likely one at 49.1 MB. It clears, but 64.1 on
   the census's own instrument is thin on a screen that also carries the ten
   petShotHtml layers, and that instrument is documented as a FLOOR.
   A CHEAPER VARIANT EXISTS if 64.1 turns out to be too close: promote only the
   two over rungs (U and S) and leave the other seven on 384. That is 6 layers
   rather than 26, +6.0 MB by the instrument, and it fixes both real breaches.
   It costs a per-slot branch in rackTile, which is why it is the fallback and
   not the first suggestion.

   SO THIS ROW STAYS RED UNTIL SOMEBODY MEASURES IT ON A MACHINE THAT CAN RUN A
   BROWSER. That is the honest state: the defect is real, the remedy is known and
   cheap, and the memory side of it has been computed but NOT measured. Pinning
   an exception at 1.71 to make the gate green would be inventing a number to
   pass a check, which is the thing this file's own header refuses to do. */
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

/* THE SWEEP LIST WAS THREE-FIFTHS FICTION UNTIL 2026-08-25, and the row that
 * reported its own coverage was counting LABELS, not screens.
 *
 * It read:
 *     ['#/bonehead', 'wardrobe', 'wardrobe'], ['#/bonehead', 'backpack', 'backpack'],
 *     ['#/bonehead', 'build', 'build'], ['#/today', null, 'today'], ['#/crew', null, 'crew'],
 * and clicked `[data-tab="${tab}"]` with `?.click()`. There is no
 * `data-tab="backpack"` and no `data-tab="build"` anywhere in the app -- the hub
 * chips are `crates` and `talents` -- so both optional-chained into nothing and
 * the sweep stayed on the Wardrobe and measured it again under a second and a
 * third name. `#/crew` is not a route either: routeFromHash falls through to
 * `else { renderToday() }`, so that lap measured TODAY a second time.
 *
 * Real coverage was WARDROBE and TODAY. Two screens. SETUP printed "5 screens"
 * because it counted `new Set(seen.map(s => s.screen)).size`, which is the label
 * it was handed, not the screen it landed on. A row cannot report its own
 * coverage from a string the caller chose.
 *
 * SO EVERY SURFACE NOW CARRIES A MARKER IT MUST LAND ON, and REACH grades that
 * separately from the art. A selector that stops matching -- a renamed chip, a
 * retired route -- is now a RED, not a silently-skipped screen. This is the
 * whole reason the Shop's 1.70x upscale survived: nothing ever went there.
 *
 * SWEPT, and each is confirmed by its own marker below:
 *     Wardrobe, Backpack, Shop, Build (the four hub tabs), Today, Crew.
 * NOT SWEPT, and none of it may be read as clean -- it is unmeasured, which is
 * the state the Shop was in:
 *     Boneyard (map), Settings, Foods, Progress/Trends, the Pit and every fight
 *     screen, the Garden, the Stable, the Paddock, the Den, the Bestiary, the
 *     Collection/Looks picker, the crate-reveal sequence, and every sheet or
 *     modal (try-on, gift, crate open, transmog). Sheets are the biggest hole:
 *     the try-on stage draws 640 MASTERS at 385 CSS px and no row here sees it.
 *
 * AND CREW IS REACHED BUT STILL NOT MEASURED, which is a third state worth
 * naming: on the 2026-08-25 run REACH confirmed the Crew screen landed, and it
 * contributed ZERO gear layers, so SETUP reported five contributing screens out
 * of six landed. The demo profile has no friends to draw. REACH going green
 * there is honest -- we did get to the screen -- but nobody should read it as
 * "Crew's art is clean". It needs a fixture with a populated crew before it
 * grades anything, and until then it is closer to the NOT SWEPT list above.
 */
const SURFACES = [
  // [hash, hub chip data-tab, label, a marker that proves we actually landed]
  ['#/bonehead', 'wardrobe', 'wardrobe', '#chTabs .ch-tab[data-tab="wardrobe"][aria-selected="true"]'],
  ['#/bonehead', 'crates', 'backpack', '#chTabs .ch-tab[data-tab="crates"][aria-selected="true"]'],
  ['#/bonehead', 'shop', 'shop', '#chTabs .ch-tab[data-tab="shop"][aria-selected="true"]'],
  ['#/bonehead', 'talents', 'build', '#chTabs .ch-tab[data-tab="talents"][aria-selected="true"]'],
  ['#/today', null, 'today', '#screen.screen--today'],
  ['#/friends', null, 'crew', '#screen .crew-friends'],
];

await page.setViewport({ width: 440, height: 956, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const reached = [], missed = [];
for (const [hash, tab, label, marker] of SURFACES) {
  await page.evaluate(h => { location.hash = h; }, hash); await sleep(1100);
  /* A REAL CLICK ON THE REAL CHIP, and the selector is asserted to have matched
     BEFORE the click rather than optional-chained away. `?.click()` on a typo is
     exactly how three of these surfaces went missing for weeks. */
  if (tab) {
    await page.evaluate(t => {
      const b = document.querySelector(`#chTabs .ch-tab[data-tab="${t}"]`);
      if (!b) throw new Error(`#chTabs .ch-tab[data-tab="${t}"] does not exist: the sweep list has drifted from the app`);
      b.click();
    }, tab);
    await sleep(1600);
  }
  const landed = await page.evaluate(m => !!document.querySelector(m), marker);
  (landed ? reached : missed).push(label);
  if (landed) await sweep(label);
}

ok('REACH every surface in the sweep list was really landed on, proven by a marker in its own DOM',
  missed.length === 0,
  missed.length ? `MISSED ${missed.join(',')} (reached ${reached.join(',') || 'none'})` : `${reached.join(', ')}`);

ok('SETUP the sweep actually found gear art to measure (an empty sweep would pass every row below for free)',
  seen.length >= 8 && new Set(seen.map(s => s.screen)).size >= 4,
  `${seen.length} art layers across ${new Set(seen.map(s => s.screen)).size} CONFIRMED-LANDED screens: ${[...new Set(seen.map(s => s.screen))].join(', ')}`);

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
