/* THE TODAY STATUS COLUMN, AND THE SCROLL PEEK.
 *
 * Tom asked for this arrangement three times before it was built, and the
 * scroll peek in his own words, 2026-08-21: "how will the player know to scroll
 * down and see more right now? i have a feeling they wont know unless we show
 * half a banner width or something to make them go look." So there are exactly
 * two things this file exists to pin, and they are the two he asked for:
 *
 *   ORDER  the currencies are at the TOP of the screen and Gwart is UNDER them.
 *   PEEK   a card is genuinely half on the screen at the bottom edge: its top
 *          above the fold, its bottom below it, and enough of it showing to be
 *          seen. Not a hairline, and not a whole card that has simply fitted.
 *
 * WHY THE OTHER ROWS ARE HERE. Each one is a way for those two to pass while
 * the screen is broken, and three of them are corrections Tom has already had
 * to make once:
 *
 *   GWART   an empty plate sits exactly where Gwart sits and orders perfectly
 *           against the chips above it. Graded on the ink inside the plate, off
 *           the render, plus a decode on the source images, because naturalWidth
 *           is 0 both for a broken path and for art still on its way.
 *   PLATE   Tom: "gwart's background is too bright", then, given two darker
 *           options, "split the difference between A and B". That answer is
 *           #d5c8b0 and it is one literal in one rule. It is graded off the
 *           RENDERED pixels rather than off getComputedStyle, because the plate
 *           is what he looked at.
 *   TEXT    the same screen's dialogue type is #f2e9d7 and so is --text. Tom,
 *           after a global replace: "why did you change the text colour in the
 *           textbox? i asked you to just change gwart's background colour." So
 *           --text is asserted UNCHANGED in the same file that pins the plate,
 *           because the failure is doing both at once.
 *   CLEAR   the plaque is drawn OVER the figure, so a plaque low enough to sit
 *           on the Bonehead's skull hides the collision it causes. Measured as
 *           ink: the figure is differenced against a frame with the figure
 *           hidden, which is exact whatever backdrop is equipped, and both
 *           animations are pinned to their WORST frame first (the plaque at the
 *           bottom of its float, the figure at the top of its idle).
 *   FIGURE  the peek is bought with the hero's height, so the cheapest way to
 *           pass PEEK is to shrink the hero until the Bonehead is a thumbnail.
 *           Anti-regression rule 11: the bound is a floor on the figure's stage,
 *           per viewport, measured on this build, not a trend.
 *
 * THE SHORT-PHONE CASE IS GRADED IN BOTH DIRECTIONS, ON PURPOSE. Above the fold
 * at 320x568 there are 501.8px, and 174 of them belong to the tab bar, the four
 * doors and the screen's own top padding. What is left has to cover the scene AND the
 * peek, so the figure's stage is `238 - peek - plaque` px however it is sliced,
 * and a plaque large enough for his face to read leaves a 144px Bonehead beside
 * a 108px pet. So app.css drops the plaque below 600px of viewport height and
 * keeps the currencies and the peek, which are what Tom asked for. That is a
 * trade, not a fact, so it is asserted from both sides: he is REQUIRED on the
 * tall viewports and REQUIRED ABSENT on the short one, with the figure's floor
 * graded either way. Deleting the media query and deleting the plaque both go
 * red.
 *
 * AN EMPTY SAMPLE IS A FAILURE. SETUP refuses to grade anything unless Today
 * really rendered, the hero scene is on it, and the fold is really above the
 * viewport's bottom edge (no tab bar, no fold, and every PEEK row would pass on
 * a screen with nothing under it).
 *
 * PROVEN RED, 2026-08-21. Every row family below was driven to FAIL in a
 * throwaway copy of this tree (rsync'd out of the worktree, never the worktree
 * itself), one mutation at a time, exit codes read from a file. The mutation,
 * then the line it produced:
 *
 * ORDER  .hero-top { top: 150px } and .gw-today { top: 10px }: the two swapped,
 *        which is Gwart above the currencies, the arrangement Tom rejected.
 *   FAIL ORDER 393x852-sat0 the currencies sit at the top of the hero  152.0px
 *        below the scene's top edge
 *   FAIL ORDER 393x852-sat0 Gwart is UNDER the currencies  plaque top 31.5,
 *        chips bottom 205                        (+4 more rows across configs)
 *
 * PEEK   .hero-scene's height reverted to the shipped `min(62vh, 520px)`.
 *   FAIL PEEK 393x852-sat59 enough of it shows  1.2px visible, floor 18
 *   FAIL PEEK 320x568-sat0  enough of it shows  14.8px visible, floor 18
 *   FAIL PEEK 320x568-sat59 a card straddles the fold  nothing straddles;
 *        nearest card tops 546, 546, 616.7 against fold 501.8
 *        Those three numbers are the shipped build measured before the change.
 *
 * GWART  both <img> pointed at assets/gwart/nope.png.
 *   FAIL GWART 393x852-sat0 both source layers decoded  nope.png:0
 *   FAIL GWART 393x852-sat0 his drawing is really on the plate  0.1% ink,
 *        floor 20%              (so an empty plate cannot carry the ORDER rows)
 *
 * PLATE  the plate set to #f2e9d7, which is the "too bright" version.
 *   FAIL PLATE 393x852-sat0 the plate is #d5c8b0  modal rgb(244,236,212)
 *        against rgb(213,200,176)
 *
 * TEXT   --text set to #d5c8b0, the global replace Tom caught.
 *   FAIL TEXT 393x852-sat0 --text is still #f2e9d7  #d5c8b0   (all 4 configs)
 *
 * CLEAR  two mutations, because they fail in different places.
 *        (a) .hero-char reverted to `top: 18px`, its value before the plaque:
 *   FAIL CLEAR 393x852-sat59 no Bonehead ink under the plaque  16039 px inside
 *        the plaque; figure ink starts 94.5px down, plaque ends 140.5px down
 *        Red at --sat 59 only, and that is the honest answer rather than a gap:
 *        at --sat 0 the scene is 52px taller, the figure is width-constrained
 *        and bottom-aligned, so its ink really does clear the plaque even from
 *        top: 18px. Hence (b), which is the regression this row is actually
 *        about, a plaque moved without moving the figure:
 *        (b) .gw-today { top: 210px }:
 *   FAIL CLEAR 393x852-sat0  no Bonehead ink under the plaque  37049 px inside
 *   FAIL CLEAR 393x852-sat59 no Bonehead ink under the plaque  32307 px inside
 *
 * CONTROL / CLEAR blindness  `.hero-char { visibility: hidden }` appended, so
 *        the difference mask has nothing in it:
 *   FAIL CONTROL 393x852-sat0 the figure's ink was found at all  0 ink pixels,
 *        floor 20000    (and it was this mutation that exposed the instrument's
 *        own bug: with only the figure's animation pinned, the pet's idle and
 *        the cast shadow leaked 4690 px into the mask and CONTROL passed on a
 *        scene with no Bonehead in it. The whole scene is stopped now.)
 *
 * FIGURE --gw-h forced to 220px: the peek still passes and the figure dies.
 *   FAIL FIGURE 393x852-sat0  the Bonehead's stage keeps its height  247px,
 *        floor 300
 *   FAIL FIGURE 393x852-sat59 194.7px, floor 260
 *
 * SMALL  the media query changed to (max-height: 1px), so the plaque comes back
 *        at 320x568 and takes the figure with it.
 *   FAIL ORDER 320x568-sat0 Gwart is drawn where the design says: stood down on
 *        a short screen  plaque drawn
 *   FAIL FIGURE 320x568-sat0 the Bonehead's stage keeps its height  144.3px,
 *        floor 180
 *        And the other direction, `.gw-today { display: none }` appended:
 *   FAIL ORDER 393x852-sat0 Gwart is drawn where the design says: present
 *        plaque absent
 *
 * Run: node tests/today-peek-audit.mjs [baseUrl]
 */
import { boot, seed, settle, sleep, serveTree } from './godmode.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const base = argv || srvHandle.url;
const fails = [];
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!pass) fails.push(name);
};

/* The four configurations, and what each is for. --sat 59 is the Dynamic
   Island: it is the term that moves the fold's distance from the hero, so a
   peek that only works without an inset is a peek that does not work on Tom's
   phone. 320x568 is the narrowest and shortest phone this app supports; the
   sat59 row there is not a device that exists (a 568pt screen has no island)
   and is graded anyway, because it is the worst case the arithmetic can be
   handed and a peek that survives it survives anything. */
const CONFIGS = [
  { w: 393, h: 852, sat: 0, gwart: true, figureFloor: 300 },
  { w: 393, h: 852, sat: 59, gwart: true, figureFloor: 260 },
  { w: 320, h: 568, sat: 0, gwart: false, figureFloor: 180 },
  { w: 320, h: 568, sat: 59, gwart: false, figureFloor: 120 },
];

/* THE PEEK BAND. A floor because a 1.2px hairline of a rounded corner is what
   the shipped build showed at --sat 59 and it is not a signal to anybody. A
   ceiling because "peeking" means partly off: the row already requires the
   bottom to be below the fold, and this keeps a card that merely fits from
   being read as a peek if that bottom check is ever loosened. */
const PEEK_MIN = 18;
/* His plate against his ink. Measured on this build: 40-46% of the plate's
   interior is his drawing at 393x852. The floor is well under that and well
   over the ~2% a stray grain speckle could score on a blank plate. */
const INK_MIN = 0.20;
const PLATE = [213, 200, 176];      // #d5c8b0, as it renders under the scene's 7% grain
const PLATE_TOL = 12;

const { browser, page } = await boot(base);
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await seed(page, { level: 12, coins: 1240, dust: 380 });
await sleep(1200);

/* One screenshot, decoded in the page, reduced to the numbers the rows need.
   Returns a sampler the caller drives, so the three frames CLEAR needs (figure
   hidden, figure shown, both with the plaque out of the way) all go through the
   same decode path and cannot disagree about dpr or origin. */
async function shoot(page, clip) {
  const b64 = await page.screenshot({ clip, encoding: 'base64' });
  return page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    return { w: c.width, h: c.height, data: [...g.getImageData(0, 0, c.width, c.height).data] };
  }, b64);
}

async function inject(page, css) {
  return page.evaluate(c => {
    const s = document.createElement('style');
    s.dataset.audit = '1'; s.textContent = c;
    document.head.appendChild(s);
  }, css);
}
const unInject = page => page.evaluate(() => document.querySelectorAll('style[data-audit]').forEach(s => s.remove()));

for (const cfg of CONFIGS) {
  const { w, h, sat } = cfg;
  const tag = `${w}x${h}-sat${sat}`;
  console.log(`\n---- ${tag} ----`);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  if (sat) await inject(page, ':root{--sat:59px !important}');
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(1700);
  await settle(page);
  await page.evaluate(async () => {
    await Promise.all([...document.querySelectorAll('#screen img')].map(i => i.decode().catch(() => {})));
  });
  await sleep(300);

  const geo = await page.evaluate(() => {
    const box = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1), left: +r.left.toFixed(1), right: +r.right.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    const sc = document.getElementById('screen');
    if (!sc) return { rendered: false };
    const fold = +sc.getBoundingClientRect().bottom.toFixed(1);
    /* EVERY CARD ON THE SCREEN, not the hype banner by name. What peeks depends
       on the account: an unlock nudge, the step-race result and the stale-steps
       warning all come and go, so naming one of them would make this row pass or
       fail on state rather than on layout. The question is whether SOMETHING with
       a card's shape straddles the fold. */
    const cards = [...sc.querySelectorAll('.card, .q-collapse, .dayblk')]
      .map(e => ({ cls: e.className, ...(() => { const r = e.getBoundingClientRect(); return { top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1) }; })() }))
      .filter(c => c.bottom > c.top + 8);
    const gw = document.querySelector('.gw-today');
    const gwShown = !!gw && gw.getBoundingClientRect().height > 0;
    return {
      rendered: sc.textContent.trim().length > 200,
      vh: innerHeight, fold, cards,
      scene: box(document.querySelector('.hero-scene')),
      chips: box(document.querySelector('.hero-top')),
      wallet: box(document.querySelector('.wallet-pill')),
      trend: box(document.querySelector('.trend-dot')),
      gw: gwShown ? box(gw) : null,
      gwShown,
      gwImgs: gw ? [...gw.querySelectorAll('img')].map(i => ({ src: i.getAttribute('src'), nw: i.naturalWidth })) : [],
      char: box(document.querySelector('.hero-char')),
      text: getComputedStyle(document.documentElement).getPropertyValue('--text').trim().toLowerCase(),
    };
  });

  ok(`SETUP ${tag} Today rendered with content on it`, !!geo.rendered);
  ok(`SETUP ${tag} the hero scene and the currency row are both on it`, !!geo.scene && !!geo.chips && !!geo.wallet);
  ok(`SETUP ${tag} there is a fold: the tab bar ends the screen above the viewport's bottom`,
    !!geo.fold && geo.fold < geo.vh - 20, `fold ${geo.fold} of ${geo.vh}`);
  ok(`SETUP ${tag} there are cards below the hero to peek at all (an empty list grades nothing)`,
    geo.cards.length >= 2, `${geo.cards.length} cards`);
  if (!geo.rendered || !geo.scene || !geo.chips || !geo.cards.length) { await unInject(page); continue; }

  /* ---------------- ORDER: currencies at the top, Gwart under them --------- */
  /* THE REFERENCE IS THE VISIBLE TOP, NOT THE BOX'S TOP. Re-derived 2026-08-24.
     This measured `chips.top - scene.top`, which was the same number as the
     visible top for as long as the scene began below the safe area. It is not the
     same number once the scene is allowed to bleed up behind the status bar and
     the Dynamic Island: there the box starts at y=0 and chips 10px below the
     VISIBLE top read as 83px below the box, and the row calls a correct screen
     floating-in-the-middle.
     Measured both ways at --sat 59: box-relative 83.0px, visible-relative 10.0px.
     The bound is unchanged at 24px and this row still fails on real drift, which
     is the point: the reference moved, the strictness did not. */
  const visibleTop = Math.max(geo.scene.top, cfg.sat);
  ok(`ORDER ${tag} the currencies sit at the top of the hero, not floating in the middle of it`,
    /* 14px, TIGHTENED 2026-08-24. It was 24, and 24 is exactly the gap Tom
       complained about: "the UI for currencies needs to move up a bit because now
       there is just a weird gap between the dynamic island and the currency." The
       row tolerated the defect it should have caught, which is worse than not
       having it. The chips are anchored at --sat + 10 so the offset is 10.0 at
       every inset; 14 clears that by 4 and catches 24 by 10. */
    geo.chips.top - visibleTop <= 14 && geo.chips.top >= visibleTop - 1,
    `${(geo.chips.top - visibleTop).toFixed(1)}px below the hero's visible top` +
    (geo.scene.top < cfg.sat ? ` (scene box starts ${(cfg.sat - geo.scene.top).toFixed(1)}px behind the inset)` : ''));
  ok(`ORDER ${tag} the wallet is inside the card, not clipped by its right edge`,
    geo.wallet.right <= geo.scene.right - 4, `wallet right ${geo.wallet.right}, scene right ${geo.scene.right}`);
  ok(`ORDER ${tag} Gwart is drawn where the design says: ${cfg.gwart ? 'present' : 'stood down on a short screen'}`,
    geo.gwShown === cfg.gwart, `plaque ${geo.gwShown ? 'drawn' : 'absent'}`);

  if (cfg.gwart) {
    ok(`ORDER ${tag} Gwart is UNDER the currencies, and touching them`,
      geo.gw.top >= geo.chips.bottom - 1 && geo.gw.top - geo.chips.bottom <= 22,
      `plaque top ${geo.gw.top}, chips bottom ${geo.chips.bottom}`);
    ok(`ORDER ${tag} the plaque is left-aligned with the currency row above it`,
      Math.abs(geo.gw.left - geo.chips.left) <= 2, `plaque ${geo.gw.left}, chips ${geo.chips.left}`);
    /* THE CROP'S OWN ASPECT, not a declared width. R3's frame is
       (293,442)-(1753,1136) of the 2048 square, 1460 x 694, so a plate whose
       content box has drifted off 2.1037:1 is stretching him. */
    const aspect = (geo.gw.w - 4) / (geo.gw.h - 4);
    ok(`ORDER ${tag} the plate keeps the crop's proportions, so he is not stretched`,
      Math.abs(aspect - 1460 / 694) < 0.03, `content aspect ${aspect.toFixed(4)} against 2.1037`);
    ok(`GWART ${tag} both source layers decoded`,
      geo.gwImgs.length >= 2 && geo.gwImgs.every(i => i.nw > 0),
      geo.gwImgs.map(i => `${i.src.split('/').pop()}:${i.nw}`).join(' '));
  }

  /* ---------------- PEEK: something is half on the screen ------------------ */
  const straddling = geo.cards
    .map(c => ({ ...c, vis: +(geo.fold - c.top).toFixed(1), hidden: +(c.bottom - geo.fold).toFixed(1) }))
    .filter(c => c.vis > 0 && c.hidden > 0);
  const best = straddling.sort((a, b) => b.vis - a.vis)[0] || null;
  ok(`PEEK ${tag} a card straddles the fold: part of it on screen, part of it below`,
    !!best, best ? `${best.cls.slice(0, 30)} showing ${best.vis}px, hiding ${best.hidden}px`
      : `nothing straddles; nearest card tops ${geo.cards.map(c => c.top).filter(t => t < geo.fold + 200).slice(-3).join(', ')} against fold ${geo.fold}`);
  ok(`PEEK ${tag} enough of it shows to be a signal rather than a hairline`,
    !!best && best.vis >= PEEK_MIN, best ? `${best.vis}px visible, floor ${PEEK_MIN}` : 'no card straddles');
  ok(`PEEK ${tag} it really is cut off, so there is visibly more below`,
    !!best && best.hidden >= 4, best ? `${best.hidden}px below the fold` : 'no card straddles');

  /* ---------------- FIGURE: the peek is not bought with the Bonehead ------- */
  ok(`FIGURE ${tag} the Bonehead's stage keeps its height`,
    !!geo.char && geo.char.h >= cfg.figureFloor,
    `stage ${geo.char ? geo.char.h : 'missing'}px, floor ${cfg.figureFloor}`);

  /* ---------------- TEXT: the one hex that must not have moved ------------- */
  ok(`TEXT ${tag} --text is still #f2e9d7: the plate change did not travel`,
    geo.text === '#f2e9d7', geo.text);

  /* ---------------- pixels: the plate, his ink, and his clearance ---------- */
  if (cfg.gwart) {
    const clip = { x: geo.gw.left, y: geo.gw.top, width: geo.gw.w, height: geo.gw.h };
    const shot = await shoot(page, clip);
    const px = shot.data;
    const cw = shot.w, ch = shot.h;
    /* Skip the 2px border and the rounded corners: sample the interior only. */
    const pad = Math.round(6 * (cw / geo.gw.w));
    let plateN = 0, ink = 0, total = 0;
    const hist = new Map();
    for (let y = pad; y < ch - pad; y++) for (let x = pad; x < cw - pad; x++) {
      const i = (y * cw + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      total++;
      const key = `${r >> 3},${g >> 3},${b >> 3}`;
      hist.set(key, (hist.get(key) || 0) + 1);
      const near = Math.abs(r - PLATE[0]) <= PLATE_TOL && Math.abs(g - PLATE[1]) <= PLATE_TOL && Math.abs(b - PLATE[2]) <= PLATE_TOL;
      if (near) plateN++; else ink++;
    }
    const modal = [...hist.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(v => (+v << 3) + 4);
    ok(`PLATE ${tag} the plate is #d5c8b0, the darkness Tom settled on`,
      modal.every((v, i) => Math.abs(v - PLATE[i]) <= PLATE_TOL),
      `modal rgb(${modal.join(',')}) against rgb(${PLATE.join(',')})`);
    ok(`GWART ${tag} his drawing is really on the plate, not an empty rectangle`,
      total > 0 && ink / total >= INK_MIN, `${(100 * ink / total).toFixed(1)}% ink, floor ${(100 * INK_MIN).toFixed(0)}%`);

    /* CLEAR, on ink and on the worst frame. The plaque paints over the figure,
       so a collision is invisible in the composite: the figure's mask is taken
       by differencing a frame that has it against one that does not, with the
       plaque out of both so it cannot contribute. Then both animations are
       pinned against each other: the plaque parked at the BOTTOM of its 5px
       float and the figure at the TOP of its 5px idle. */
    /* EVERY ANIMATION IN THE SCENE IS STOPPED, not just the figure's, and that
       is not tidiness. The two frames are 120ms apart, and the pet's idle, the
       Bonehead's inner bob and the cast shadow all keep moving across that gap,
       so an unpinned difference scores thousands of pixels on a scene whose
       Bonehead is not drawn at all. Measured with the figure forced hidden:
       4690 px of pure leftover motion, which sailed over a 3000 floor and made
       CONTROL green on exactly the blindness it exists to catch. With the scene
       stopped the same mutation scores near zero. The figure's own transform is
       then re-applied by hand, at the TOP of its idle, so the assertion is made
       against the worst frame rather than the resting one. */
    await inject(page, `.gw-today{visibility:hidden}
      .hero-scene *{animation:none!important}
      .hero-char{transform:translate(var(--bh-shift,0px),-5px)!important}`);
    await sleep(120);
    const sceneClip = { x: geo.scene.left, y: geo.scene.top, width: geo.scene.w, height: geo.scene.h };
    const withFig = await shoot(page, sceneClip);
    await inject(page, '.hero-char{visibility:hidden!important}');
    await sleep(120);
    const noFig = await shoot(page, sceneClip);
    await page.evaluate(() => document.querySelectorAll('style[data-audit]').forEach(s => {
      if (!s.textContent.includes('--sat')) s.remove();
    }));

    const dpr = withFig.w / geo.scene.w;
    /* The plaque's rect in scene coordinates, taken at the BOTTOM of its float
       (settle() leaves gwFloat on its 100% keyframe, translateY(2.5px)) and
       given 2px of slack so a shadow edge is not read as a collision. */
    const px0 = Math.round((geo.gw.left - geo.scene.left) * dpr);
    const px1 = Math.round((geo.gw.right - geo.scene.left) * dpr);
    const py0 = Math.round((geo.gw.top - geo.scene.top) * dpr);
    const py1 = Math.round((geo.gw.bottom - geo.scene.top) * dpr);
    let figTotal = 0, figUnder = 0, figTop = null;
    const A = withFig.data, B = noFig.data;
    for (let y = 0; y < withFig.h; y++) for (let x = 0; x < withFig.w; x++) {
      const i = (y * withFig.w + x) * 4;
      const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
      if (d < 24) continue;                       // 8 per channel: above the grain, under any drawing
      figTotal++;
      if (figTop === null) figTop = y;
      if (x >= px0 && x < px1 && y >= py0 && y < py1) figUnder++;
    }
    ok(`CONTROL ${tag} the figure's ink was found at all (a zero mask grades every clearance row green)`,
      figTotal > 20000, `${figTotal} ink pixels, floor 20000`);
    ok(`CLEAR ${tag} no Bonehead ink under the plaque, at the worst frame of both animations`,
      figTotal > 20000 && figUnder === 0,
      `${figUnder} px inside the plaque; figure ink starts ${figTop === null ? 'nowhere' : (figTop / dpr).toFixed(1) + 'px'} down the scene, plaque ends ${(py1 / dpr).toFixed(1)}px down`);
  }

  await unInject(page);
}

ok('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
if (srvHandle) await srvHandle.close();
console.log(`\n${fails.length ? fails.length + ' FAILED' : 'all green'}`);
process.exit(fails.length ? 1 : 0);

