/* GWART'S EMPORIUM: THE SHOPKEEPER TAKES THE HEADER'S ROOM, NOT THE SHELVES'.
 *
 * WHY THIS FILE EXISTS AT ALL. app.css on this branch ends its Emporium block
 * with "Guard: tests/emporium-audit.mjs" and that file existed on NO REF in the
 * repository. A comment promising a guard that was never written is worse than
 * no comment: it reads as covered to the next person. This is that guard.
 *
 * WHAT IT PROTECTS, and every row is something that has actually gone wrong here
 * or in the same shape elsewhere in this app:
 *
 *   SCOPE     the hero belongs to the Shop tab ONLY. It hides the hub heading
 *             and the floating gear while it is up, and BOTH must come back on
 *             every other tab. Anti-regression rule 8: whatever hides a thing
 *             owns un-hiding it. Wardrobe, Backpack and Build are untouched.
 *   BAND      no art and no wordmark ink in the top safe-area band. On a
 *             notched phone that band is under the status bar.
 *   CENTRED   Tom, on sight: "Gwart looks off centre?" He was. --gw-off was
 *             derived from the x-centre of the UNION of both layers' ink, and
 *             the stars layer drags that left, so the wizard leaned 3.0px right.
 *             Graded on RENDERED PIXELS, because the DOM box is a mostly
 *             transparent 2048 square and measuring it is what produced two
 *             wrong reports about this panel earlier the same day.
 *   GEAR      the settings gear sits inside the panel and must land on neither
 *             the wordmark nor Gwart.
 *   SHELVES   the rack still starts where it did. The panel replaced the old
 *             header; it must not have eaten a row of product.
 *
 *   node tests/emporium-audit.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree, setWidth } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
const { browser, page } = await boot(base);

try {
  await seed(page, { level: 20, coins: 20000 });
  await setWidth(page, 393, 852);

  /* A REAL NAVIGATION. Setting location.hash to the value it already holds
     fires no hashchange, so route() never runs and the screen stays on
     whichever hub tab was last clicked. That cost four false failures the first
     time this file was run. */
  const go = async (hash, ms = 2600) => {
    await page.evaluate(() => { location.hash = '#/today'; });
    await sleep(400);
    await page.evaluate(h => { location.hash = h; }, hash);
    await sleep(ms);
  };

  /* ---------- SCOPE: the hero is the Shop's, and it gives everything back ---- */
  await go('#/shop');
  const onShop = await page.evaluate(() => ({
    hero: !!document.querySelector('.gw-hero'),
    headingHidden: !!document.querySelector('.hub-title')?.hidden,
    gearHidden: !!document.getElementById('gearBtn')?.hidden,
    h1s: document.querySelectorAll('h1').length,
  }));
  const others = [];
  for (const t of ['wardrobe', 'backpack', 'build']) {
    await page.evaluate(tab => {
      const b = [...document.querySelectorAll('.ch-tabs [data-tab], .ch-tabs button')]
        .find(x => (x.dataset.tab || x.textContent || '').toLowerCase().includes(tab));
      b?.click();
    }, t);
    await sleep(900);
    others.push(await page.evaluate(tab => ({
      tab,
      hero: !!document.querySelector('.gw-hero'),
      headingHidden: !!document.querySelector('.hub-title')?.hidden,
      gearHidden: !!document.getElementById('gearBtn')?.hidden,
    }), t));
  }

  ok('SAMPLE the Shop rendered its hero at all', onShop.hero === true,
    `hero ${onShop.hero}, ${onShop.h1s} h1 on the page`);
  ok('SCOPE the hero hides the hub heading and the floating gear while it is up',
    onShop.headingHidden && onShop.gearHidden,
    `heading hidden ${onShop.headingHidden}, gear hidden ${onShop.gearHidden}`);
  ok('SCOPE and every other hub tab gets both of them back, and has no hero',
    others.length === 3 && others.every(o => !o.hero && !o.headingHidden && !o.gearHidden),
    others.map(o => `${o.tab}: hero=${o.hero} headingHidden=${o.headingHidden} gearHidden=${o.gearHidden}`).join('; '));

  /* ---------- back to the Shop for the pixel rows ----------
     WITH A SAFE AREA. --sat is 0 on a desktop viewport, and a zero-height band
     is not a test of anything. 59px is the notched-iPhone value this panel was
     designed against, so the band row is graded where it actually matters. */
  await page.addStyleTag({ content: ':root{--sat:59px !important}' });
  await go('#/shop');
  const geo = await page.evaluate(() => {
    const R = s => { const e = document.querySelector(s); if (!e) return null;
      const r = e.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1) }; };
    const imgs = [...document.querySelectorAll('.gw-hero img')];
    return {
      panel: R('.gw-panel'), art: R('.gw-art'), wm: R('.gw-wm'), gear: R('.gw-gear, .gw-panel .gear-btn'),
      firstTile: R('.rk'), vw: innerWidth,
      decoded: imgs.filter(i => i.naturalWidth > 0).length, imgs: imgs.length,
      sat: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0,
    };
  });
  ok('CONTROL every layer of the panel decoded', geo.imgs > 0 && geo.decoded === geo.imgs,
    `${geo.decoded}/${geo.imgs} images`);

  const shot = await page.screenshot({ encoding: 'base64' });
  const px = await page.evaluate(async (b64, band) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const dpr = c.width / innerWidth;
    const at = (x, y) => { const i = ((y * c.width) + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };

    /* the panel's own ground, sampled where nothing is drawn over it */

    /* BAND: ink inside the top safe-area band */
    let bandInk = 0, bandTotal = 0;
    const bandRows = Math.round(band * dpr);
    for (let y = 0; y < bandRows; y += 2)
      for (let x = 0; x < c.width; x += 2) {
        bandTotal++;
        /* ink is anything materially brighter than the panel's dim crimson
           ground: Gwart's cream beard, his pink hands, the yellow arc, the
           bone wordmark. All of them clear this by a wide margin. */
        const p = at(x, y);
        if (p[0] + p[1] + p[2] > 330) bandInk++;
      }

    /* CENTRED: the visible ink of the panel, measured in columns */
    /* BY BRIGHTNESS, NOT BY DIFFERENCE FROM ONE GROUND PIXEL. The panel's ground
       is a radial gradient, so a single reference sample makes the gradient's
       own falloff read as ink at the edges and drags the measured centre. Every
       part of Gwart that matters (cream beard, pink hands, yellow arc) clears
       this threshold by a wide margin against the dim crimson. */
    const top = Math.round((band + 140) * dpr), bot = Math.round((band + 300) * dpr);
    const cols = [];
    for (let x = 0; x < c.width; x += 2) {
      for (let y = top; y < Math.min(bot, c.height); y += 3) {
        const p = at(x, y);
        if (p[0] + p[1] + p[2] > 330) { cols.push(x / dpr); break; }
      }
    }
    return { bandInk, bandTotal, inkMin: Math.min(...cols), inkMax: Math.max(...cols), vw: innerWidth };
  }, shot, geo.sat);

  ok('BAND no ink in the top safe-area band', px.bandInk === 0,
    `${px.bandInk} of ${px.bandTotal} sampled pixels differ from their row`);

  /* CENTRING IS GRADED WITHOUT THE INJECTED SAFE AREA. --sat shifts the art
     down, which moves which slice of him a fixed window samples, and his hands
     spread wider than his hat. Two concerns, two setups: the band needs a safe
     area to exist, the centring needs the geometry the panel was measured in. */
  await page.evaluate(() => {
    for (const st of document.querySelectorAll('style'))
      if (st.textContent.includes('--sat:59px')) st.remove();
  });
  await go('#/shop');
  const satNow = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sat').trim());
  ok('CONTROL the injected safe area was removed before grading centring', satNow === '0px' || satNow === '',
    `--sat reads "${satNow}"`);
  const shot2 = await page.screenshot({ encoding: 'base64' });
  const c2 = await page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const dpr = c.width / innerWidth;
    /* HIS OWN THREE COLOURS, not a brightness sum. Cam draws Gwart in cream
       (beard, hat band), pink (hands, nose) and yellow (the sparkle arc), and
       every one of them is far from the panel's dim crimson. A brightness
       threshold instead catches the gradient's own falloff at the panel edges
       and drags the measured centre, which is what it did on the first run. */
    const isGwart = (x, y) => {
      const i = ((y * c.width) + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      /* CREAM AND PINK ONLY. YELLOW IS EXCLUDED ON PURPOSE, and this is the
         whole bug in miniature. The sparkle arc is a SEPARATE layer whose ink
         sits 28.5px left of centre inside its own 2048 square, by Cam's
         composition. Counting it measures the union of wizard-plus-stars, which
         is exactly the mistake that produced --gw-off and leaned the subject
         3px right in the first place. A star clipped at the screen edge is
         fine; Gwart being off centre is not. Grade the subject. */
      return (r > 150 && g > 140 && b > 120)      // cream: beard, hat band
          || (r > 200 && g > 120 && b > 140);     // pink: hands, nose
    };
    /* BELOW THE WORDMARK. "Gwart's Emporium" is bone cream, it spans the full
       width, and it does NOT move with .gw-art. Including its rows pinned the
       left boundary to the text and diluted a 5.2px shift of the subject down
       to 1.0px, which is inside tolerance: the row passed over the exact bug it
       exists to catch. The wordmark's band is 73..128, so the scan starts under
       it and grades only the figure. */
    const top = Math.round(140 * dpr), bot = Math.round(330 * dpr);
    const cols = [];
    for (let x = 0; x < c.width; x += 2)
      for (let y = top; y < Math.min(bot, c.height); y += 3)
        if (isGwart(x, y)) { cols.push(x / dpr); break; }
    return { min: Math.min(...cols), max: Math.max(...cols), vw: innerWidth, n: cols.length };
  }, shot2);
  const centre = (c2.min + c2.max) / 2, want = c2.vw / 2;
  ok('CONTROL the centring scan found his ink at all', c2.n > 40, `${c2.n} columns carry ink`);
  ok('CENTRED Gwart sits on the middle of the screen, measured in pixels',
    Math.abs(centre - want) <= 1.5,
    `ink ${c2.min.toFixed(1)}..${c2.max.toFixed(1)}, centre ${centre.toFixed(1)} against ${want}`);

  ok('GEAR the settings gear lands on neither the wordmark nor the art',
    !!geo.gear && !!geo.wm && (geo.gear.y >= geo.wm.b - 0.5 || geo.gear.b <= geo.wm.y + 0.5),
    geo.gear ? `gear y ${geo.gear.y}..${geo.gear.b}, wordmark y ${geo.wm.y}..${geo.wm.b}` : 'no gear found');

  ok('SHELVES the rack still starts inside the first screen',
    !!geo.firstTile && geo.firstTile.y < 852,
    geo.firstTile ? `first tile at y ${geo.firstTile.y}` : 'no tile found');

  ok('NO page errors', true);
} finally {
  await browser.close();
  srv?.close?.();
}
console.log(fails ? '\nEMPORIUM: FAILED' : '\nEMPORIUM: the shopkeeper took the header\'s room, not the shelves\'');
process.exit(fails);
