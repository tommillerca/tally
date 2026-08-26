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


/* SEAM. Tom, 2026-08-24: "there is like a seam where you can see the line between
   where you filled and where the boneheadz background finishes."
   --hero-edge is sampled by drawing the backdrop into a canvas and reading its
   top-centre pixel, but the player sees that art through `filter: saturate(0.92)`
   on .hero-backdrop. The sampler read the source and the screen showed the
   filtered version, so the fill sat five units of BLUE away from the art it was
   meant to continue: rgb(107,124,56) against rgb(108,123,61). A hue step is
   exactly the kind of edge the eye finds, which is why he saw a line.

   RE-PREMISED 2026-08-25, ON THE RENDERED STRIP, because Tom reported the seam a
   SECOND time: "there is still a slight seam you can tell the colour of my
   boneheadz background and the wordmark background is not identical."
   The previous premise was "the fill equals the FILTERED SOURCE", graded exactly,
   and it was green through the whole of the defect he was reporting. It had to be:
   both of its sides came out of the same image, so it could not see the layers the
   page composites on top of that image. What the player compares is the fill
   against the art AS PAINTED, so that is what this grades now.

   ITS OWN HEADER SAID THIS COULD NOT BE MADE TIGHT, and that was wrong, measured.
   The claimed ceiling of 4 came from reading ONE screenshotted pixel, where the
   grain is noise. Averaging the strip across 240 columns removes the noise and
   leaves the mean: the top six rows of the rendered strip came back as
   [110.8,125.4,65.5] +/- 0.1, against a defect of +2.8/+2.4/+4.5. So the floor is
   a tenth of a unit and the defect is three to four, and a bound of 1.5 sits an
   order of magnitude clear of the noise on one side and half the defect on the
   other.

   AND THE HEADER'S DIAGNOSIS WAS HALF WRONG TOO, which is why it is corrected here
   rather than quietly replaced. It attributed the residual to TWO layers, the 7%
   grain (`.hero-scene::after`) and the warm radial (`.hero-scene::before`).
   Suppressing them one at a time: killing the grain alone drops the rendered strip
   to EXACTLY rgb(108,123,61), i.e. to the fill; killing the radial changes nothing
   at all. It cannot: that gradient is `at 50% 46%` with radii `66% 44%`, so the
   art's top-centre pixel sits at 104.5% along its ray while its last stop is
   transparent at 68%. One layer, not two.
   Measured on the fix: fill rgb(111,125,65) against a rendered [110.8,125.4,65.5],
   max delta 0.5. Prove-red on the same tree with the grain composite removed from
   paintHeroEdge: 4.5. */
{
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(2800); await settle(page);

  const geo = await page.evaluate(() => {
    const img = document.querySelector('.hero-backdrop');
    if (!img || !img.naturalWidth) return null;
    const r = img.getBoundingClientRect();
    const el = document.querySelector('.hero-scene');
    const gcs = el && getComputedStyle(el, '::after');
    return {
      edge: getComputedStyle(document.documentElement).getPropertyValue('--hero-edge').trim(),
      x: r.x, y: r.y, w: r.width,
      grain: gcs ? gcs.backgroundImage.slice(0, 24) : '', grainOp: gcs ? gcs.opacity : '',
    };
  });

  /* The mean of the strip the fill is supposed to continue: the top ROWS of the
     rendered backdrop, across the middle 240 css px, so a single noisy grain pixel
     cannot be mistaken for a step. */
  const stripMean = async () => {
    const s = await shoot(page, { x: Math.max(0, Math.round(geo.x + geo.w / 2) - 120), y: Math.max(0, Math.round(geo.y)), width: 240, height: 6 });
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < s.data.length; i += 4) { r += s.data[i]; g += s.data[i + 1]; b += s.data[i + 2]; n++; }
    return [r / n, g / n, b / n];
  };

  /* THE MEAN WAS NEVER THE PROBLEM, AND THAT IS WHY THIS FILE MISSED IT.
     stripMean() above averages the strip, and v441 got that mean to within
     0.5 of the fill while Tom could still see the line. Measured 2026-08-25 at
     430x932 dpr2: the art's top row varied across x by 7 units with the grain
     on and 0 with it off, so the eye was reading a TEXTURE discontinuity, not a
     colour one, and an averaging row can never see it. This reads the SPREAD of
     the boundary row instead: a flat fill can only ever continue a flat surface.
     Five builds chased the colour before anyone measured the variance. */
  const stripSpread = async () => {
    const s = await shoot(page, { x: Math.max(0, Math.round(geo.x + geo.w / 2) - 120), y: Math.max(0, Math.round(geo.y)), width: 240, height: 1 });
    let lo = [255, 255, 255], hi = [0, 0, 0];
    for (let i = 0; i < s.data.length; i += 4)
      for (let c = 0; c < 3; c++) { const v = s.data[i + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
    return Math.max(...hi.map((v, c) => v - lo[c]));
  };

  /* RE-PREMISED 2026-08-26, and the old bound is kept in the message because this
     row is a small monument to the thing it got wrong. It required the grain
     layer to EXIST, which was reasonable while the fix was "fade the grain out
     over the first 28px so the boundary is flat-on-flat". The block above already
     knew the mean was never the problem and that the eye was reading TEXTURE; the
     28px mask did not remove that boundary, it moved it 28px down and turned a
     step into a ramp. Tom, having raised it once already: "im 99% sure it's
     because youve added a grainy noise layer on top of the whole bonehead
     section ... ive already brought this up to you but you glossed over it."
     The grain is gone from the hero now, so requiring it here would hold the
     defect in place with a green gate. What the control still has to do is prove
     the sampler found a real surface, which is the half that keeps the rows below
     honest. The ABSENCE of the grain is asserted too, in the same row, so this
     cannot quietly pass on a build that puts it back. */
  ok('CONTROL SEAM the backdrop and the fill colour were found, and the hero carries NO grain layer (it was the seam, removed 2026-08-26; this row wanted it PRESENT until then)',
    !!geo && !!geo.edge && !/^url\(/.test(geo.grain),
    geo ? `edge="${geo.edge}" grain=${geo.grain === 'none' ? 'none' : `"${geo.grain}..." opacity=${geo.grainOp} (A GRAIN LAYER IS BACK ON THE HERO)`}` : 'no .hero-backdrop');

  if (geo && geo.edge) {
    const rendered = await stripMean();
    /* WITH THE GRAIN OFF, so the row below cannot pass on a page that composites
       nothing over the art. If suppressing the only layer between the fill and the
       art moves the strip by less than a unit, this whole comparison is free. */
    await inject(page, '.hero-scene::after{display:none !important}');
    await sleep(200);
    const bare = await stripMean();
    await unInject(page);
    await sleep(200);

    const m = geo.edge.match(/(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    const fill = m ? [+m[1], +m[2], +m[3]] : null;
    const spread = Math.max(...rendered.map((v, i) => Math.abs(v - bare[i])));
    /* INVERTED BY THE 2026-08-25 FIX, deliberately. This used to demand that the
       grain measurably MOVES the strip, which was the right premise while the
       fill was matching the grained art's mean. app.css now masks the grain away
       from the top edge so the fill continues a FLAT surface, so the grain must
       NOT reach the strip: the old assertion would now demand the bug back. */
    ok('CONTROL SEAM the grain does NOT reach the boundary, so the flat fill has a flat surface to continue',
      spread <= 0.6,
      `rendered ${rendered.map(v => v.toFixed(1))} vs the same strip with .hero-scene::after off ${bare.map(v => v.toFixed(1))}, spread ${spread.toFixed(1)}`);

    const delta = fill ? Math.max(...fill.map((v, i) => Math.abs(v - rendered[i]))) : 999;
    ok('SEAM the fill matches the art AS RENDERED, not merely the source it is sampled from: the strip a bounce opens and the art it continues are the same colour',
      fill !== null && delta <= 1.5,
      `--hero-edge ${JSON.stringify(fill)} vs the rendered strip ${rendered.map(v => v.toFixed(1))}, delta ${delta.toFixed(1)} (bound 1.5; the sampler without the grain composite reads 4.5 here)`);

    const texture = await stripSpread();
    ok('SEAM-TEXTURE the boundary row is FLAT, so a flat fill can continue it exactly (a matching MEAN over a grained surface still reads as a line)',
      texture <= 1,
      `boundary row varies by ${texture} units across 240 css px (bound 1; it measured 7 before the grain was masked off the top edge)`);
  }
}

/* BLEED. Tom, 2026-08-24: "the background is now extending all down the app by the
   quests etc, that has changed to the background colour I have for my bonehead."
   v434 gave the Today scroller the Bonehead's backdrop colour as its
   background-COLOR so an iOS rubber-band pull would show art instead of a hard
   edge. That colour also showed through every transparent gap in the page, which
   is the regression he hit. The way to tell the two apart is to make the art
   colour something no stylesheet would ever produce and see which pixels follow
   it: any gap that turns magenta is painting from --hero-edge and is a bleed.

   THE FIX THAT FOLLOWED WAS ALSO WRONG, and the second report is what taught us
   the rule. Covering the content area with a flat background-IMAGE stopped the
   bleed and broke two other things. Tom, later the same day: "now there is no
   colour background above by the wordmark and the lower part of the page is just
   black instead of the old app background." So WebKit paints an overscroll from
   the scroller's whole background BOX rather than its background-color alone, and
   an opaque fill over the content area also buries the app's ambient glow.
   The scroller carries NO background at all now and the bounce colour is an
   element parked above the content. This row survived that rewrite unaltered
   because it never cared HOW the page is painted, only that no gap shows the
   backdrop colour. Proved red by putting the backdrop colour back on the scroller
   as a background-color: 3 of 4 gaps go magenta. */
{
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(2600); await settle(page);
  await page.evaluate(() => document.documentElement.style.setProperty('--hero-edge', 'rgb(255,0,255)'));
  await sleep(400);

  const gaps = await page.evaluate(() => {
    const s = document.querySelector('.screen--today');
    if (!s) return [];
    /* the plate is a zero-height sticky backdrop, not a card: it overlaps every
       sibling, so leaving it in the list invents gaps that do not exist */
    const out = [], kids = [...s.children].filter(k => !k.classList.contains('today-plate'));
    for (let i = 0; i < kids.length - 1; i++) {
      const a = kids[i].getBoundingClientRect(), b = kids[i + 1].getBoundingClientRect();
      const g = b.top - a.bottom;
      if (g >= 6) out.push({
        name: `${(kids[i].className || '?').toString().split(' ')[0]}|${(kids[i + 1].className || '?').toString().split(' ')[0]}`,
        x: 196, y: Math.round(a.bottom + g / 2) });
    }
    const d = document.querySelector('.hero-actions');
    if (d) { const r = d.getBoundingClientRect(); out.push({ name: 'left-of-doors', x: 3, y: Math.round(r.top + r.height / 2) }); }
    return out.filter(o => o.y > 0 && o.y < 830);
  });

  const bleeding = [];
  for (const g of gaps) {
    const shot = await page.screenshot({ encoding: 'base64', clip: { x: g.x, y: g.y, width: 4, height: 4 } });
    const c = await page.evaluate(async d => {
      const i = new Image(); i.src = 'data:image/png;base64,' + d; await i.decode();
      const cv = document.createElement('canvas'); cv.width = i.width; cv.height = i.height;
      const ctx = cv.getContext('2d'); ctx.drawImage(i, 0, 0);
      const p = ctx.getImageData(1, 1, 1, 1).data; return [p[0], p[1], p[2]];
    }, shot);
    if (c[0] > 200 && c[1] < 80 && c[2] > 200) bleeding.push(`${g.name} ${JSON.stringify(c)}`);
  }

  /* BOUNCE + PLATE. The two halves of the surface, graded apart because they fail
     apart, and both premises come from the measurement at the top of app.css
     rather than from reasoning: on a booted iPhone 17 Pro, a 126pt-deep held
     bounce showed the scroller's background COLOUR edge to edge and zero pixels
     of anything else, with a ::before, a real div, and a background-image at two
     attachments all scoring nothing.
     BOUNCE therefore forbids a background-IMAGE on the scroller, which is not a
     style preference: an opaque image is what took the colour out of the strip in
     v435, because the scrolled-contents layer no longer has a solid background
     for the compositor to promote. background-repeat cannot rescue that, since a
     gradient auto-sizes to the whole positioning area and repeat and no-repeat
     render identically.
     PLATE grades the thing that covers the page instead. It has to be the FIRST
     child (anything above the scroll origin is outside the layer that translates,
     so it can neither help nor hurt), opaque (or the bounce colour shows through
     every gap), and as wide as the padding box: .screen is padded by var(--pad),
     and an in-flow child inherits that inset, which measured as a strip of
     backdrop colour down both edges of the page until the negative margins went
     on. */
  const surf = await page.evaluate(() => {
    const s = document.querySelector('.screen--today');
    if (!s) return null;
    const own = getComputedStyle(s);
    const p = document.querySelector('.today-plate');
    const sr = s.getBoundingClientRect();
    const pr = p && p.getBoundingClientRect();
    const pcs = p && getComputedStyle(p);
    const bcs = p && getComputedStyle(p, '::before');
    return {
      bgc: own.backgroundColor, bgi: own.backgroundImage, iso: own.isolation,
      plate: !!p,
      plateFirst: !!p && s.firstElementChild === p,
      /* THE PAINT IS IN THE PSEUDO, not the element: .today-plate is a zero-height
         sticky anchor (a real height gave it margins that collapsed with the
         hero's bleed and shifted the page 69px). So read ::before, and read its
         WIDTH off the used left/right rather than the element's box. */
      plateW: pr ? Math.round(pr.width + (parseFloat(bcs.left) < 0 ? -2 * parseFloat(bcs.left) : 0)) : 0,
      scrollerW: Math.round(sr.width),
      plateBgc: bcs ? bcs.backgroundColor : '',
      plateBgi: bcs ? bcs.backgroundImage : '',
      plateH: bcs ? Math.round(parseFloat(bcs.height) || 0) : 0,
      viewH: Math.round(sr.height),
    };
  });
  const clear = c => !c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
  ok('BOUNCE the Today scroller carries the backdrop as a COLOUR and no background-image',
    !!surf && !clear(surf.bgc) && surf.bgi === 'none',
    surf ? `background-color: ${surf.bgc}, background-image: ${surf.bgi}` : 'no scroller');
  ok('CONTROL PLATE the page plate is on the screen at all (without it every row below grades nothing)',
    !!surf && surf.plate, surf ? `plate present=${surf.plate}` : '');
  ok('PLATE it is the FIRST child, so it starts at the scroll origin and can never paint into the bounce',
    !!surf && surf.plateFirst, surf ? `first child=${surf.plateFirst}` : '');
  ok('PLATE it is opaque, so the backdrop colour cannot show through the gaps',
    !!surf && !clear(surf.plateBgc) && surf.plateBgi !== 'none',
    surf ? `plate background-color ${surf.plateBgc}, image ${surf.plateBgi === 'none' ? 'none' : 'present'}` : '');
  ok('PLATE it reaches through the scroller\'s side padding, not just the content column',
    !!surf && surf.plateW >= surf.scrollerW,
    surf ? `plate ${surf.plateW}px across a ${surf.scrollerW}px scroller` : '');
  ok('PLATE it covers the viewport, so a scrolled page is never left uncovered',
    !!surf && surf.plateH >= surf.viewH,
    surf ? `plate ${surf.plateH}px tall over a ${surf.viewH}px viewport` : '');

  ok('CONTROL BLEED the page really has transparent gaps to grade (an empty sample passes for free)',
    gaps.length >= 3, `${gaps.length} gaps found, floor 3`);
  ok('BLEED no gap between Today cards paints the Bonehead backdrop colour',
    gaps.length >= 3 && bleeding.length === 0,
    bleeding.length ? `bleeding: ${bleeding.join(', ')}` : `${gaps.length} gaps, none bleeding`);
  await page.evaluate(() => document.documentElement.style.removeProperty('--hero-edge'));
}

ok('no page errors', errs.length === 0, errs.join(' | '));
await browser.close();
if (srvHandle) await srvHandle.close();
console.log(`\n${fails.length ? fails.length + ' FAILED' : 'all green'}`);
process.exit(fails.length ? 1 : 0);

