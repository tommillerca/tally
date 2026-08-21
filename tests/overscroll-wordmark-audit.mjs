/* THE OVERSCROLL WORDMARK: hidden at rest, Today only, free of layout, and
 * UNMISTAKABLE once you pull.
 *
 * WHAT THIS FILE CANNOT DO, SAID FIRST. It does not test the rubber band. iOS
 * overscroll is a WKWebView/UIScrollView behaviour: no headless Chromium bounces,
 * and a scripted negative scrollTop is clamped to 0 by the engine (asserted
 * below, because that clamp is also the reason the mark cannot leak). The only
 * proof that pulling down on an iPhone shows the wordmark is pulling down on an
 * iPhone. Nothing here claims otherwise. What it CAN do is drive the production
 * scroll listener with a faked negative offset and then assert PIXELS, which is
 * the whole geometry and the whole fade curve minus the finger.
 *
 * WHAT IT DOES TEST is everything that can be wrong WITHOUT a bounce, which is
 * every requirement Tom actually set:
 *   REST      at scrollTop 0 not one pixel of the mark is on screen
 *   CLAMP     scrollTop cannot go negative, so ordinary scrolling can never
 *             reach it either
 *   ABOVE     at every scroll position the mark's bottom edge stays above the
 *             scrollport's top edge
 *   MECHANISM the mark rides the SCROLLED CONTENT LAYER, measured in pixels.
 *             This is the one property the whole feature depends on: the bounce
 *             translates that layer, so a mark that had drifted onto the
 *             viewport (position: fixed, background-attachment: fixed, moved out
 *             of the scroller) would sit perfectly still under a pull and reveal
 *             nothing, while every other row here stayed green.
 *   CURVE     the fade is a function of PULL DISTANCE, driven by the real
 *             listener in js/app.js, monotonic, and at FULL opacity by 36px
 *   FAILOPEN  with the listener never having fired, the mark is at opacity 1 and
 *             not at 0. v414 and v415 both shipped invisible; a JS-driven reveal
 *             whose default is transparent is how this ships invisible a third
 *             time, on any WebView that does not report the negative offset.
 *   REDUCED   prefers-reduced-motion pins it to the end state, the feature brings
 *             no animation for the global 0.001s duration collapse to act on, and
 *             the iteration cap that actually stops a loop is in force
 *   COST      the listener writes a style at most 21 times across 200 distinct
 *             pull values: the quantisation is real, not a comment
 *   VISIBLE   at a 36px pull there are thousands of BRIGHT ink pixels on screen
 *   TODAY     the class and the pseudo-element exist on Today and nowhere else
 *   NO-SHIFT  every element rect on Today is identical with the feature on and
 *             off. Bound is ZERO differing rects, not "about the same": this
 *             catches both added height above the first card and the containing
 *             block that `position: relative` on the scroller introduces.
 *   INK       the revealed mark composites BRIGHT, near the source cream
 *   PRECACHE  the asset is in sw.js PRECACHE, because an unprecached background
 *             image is a blank space on one bar of LTE
 *   UNDERNOTCH at the pull the fade calls FULL, some of the mark is BELOW
 *             env(safe-area-inset-top), i.e. out from under the status bar and
 *             the Dynamic Island. RED on this tree. See its own block.
 *
 * THE INK ROW WAS INVERTED ON PURPOSE, 2026-08-20. It used to pin the revealed
 * mark to --text-3 (#8f8578) with a brightness CEILING of 200, i.e. a rule that
 * said "this must stay dim". Tom rejected the dim version in words: "Make it
 * unmistakable." A guard asserting the thing the user rejected is a guard
 * encoding a superseded instruction, and this one had already bent the code once:
 * v415's own CSS note says "Opacity .55 -> .78" while the rule it sits on shipped
 * .55, because raising it turned this row red and the number got put back while
 * the sentence stayed. So the row now asserts the opposite, with a brightness
 * FLOOR. It is the same detector and the same sample; only the direction of the
 * claim changed, and the prove-red below is the old value going red on the new
 * row rather than the reverse.
 *
 * FOUR WAYS THIS COULD PASS WHILE BLIND, AND THE ROWS THAT RULE THEM OUT:
 *   1. the pixel sampler never sees anything, so REST's zero is free
 *      -> CONTROL displaces the mark by the geometry of a 240px bounce and
 *         REQUIRES thousands of ink pixels from the same detector, on the exact
 *         row that displacement puts them on. An earlier version of that row
 *         read 445,425 ink pixels off the green Bonehead panel because its
 *         sample window reached the card: it would have passed on a mark that
 *         never painted at all.
 *   2. the band is not stable, so an identical/empty result is luck
 *      -> SETUP captures the band twice 900ms apart and requires byte equality.
 *   3. the rect comparison is noise-dominated, so NO-SHIFT's zero is meaningless
 *      -> Today's idle Bonehead animation really does move 31 of 400 rects
 *         between two samples on an untouched tree (measured), so the rect pass
 *         freezes animations first, and FROZEN asserts the freeze took by
 *         re-sampling and requiring zero drift before any comparison is graded.
 *   4. the geometry is perfect and the mark is transparent anyway, which is
 *         exactly how v414 and v415 passed this file while Tom saw nothing
 *      -> VISIBLE grades a real screenshot at a 36px pull for ink COUNT and
 *         BRIGHTNESS together, and CURVE reads the opacity the real listener
 *         produced rather than the one the CSS declares.
 *
 * The notch is faked (--sat: 62px, anti-regression rule 4). The mark's own offset
 * no longer contains --sat (that is the point: the threshold is now the same on
 * every phone), but .screen's padding does, so the card position every pixel clip
 * is measured against still depends on it.
 *
 * PROVE-RED. Every mutation run in a throwaway worktree, each asserting the edit
 * really applied before the result was read (guard-hygiene-lint's failure 3).
 * These three are inherited from the versions of this file that shipped v414 and
 * v415, on rows that have not changed:
 *   app.css  .screen--today::before -> .screen::before    1 FAILED, TODAY:
 *            "today:MARK bonehead:MARK progress:MARK ..." on all six screens
 *   js/app.js  the classList.toggle('screen--today') line deleted
 *                                                         7 FAILED, including
 *            TODAY "today:- bonehead:- ..." and INK "no ink pixels found at all"
 *   app.css  position: absolute -> position: fixed        1 FAILED, MECHANISM,
 *            re-run on this tree: "shift 0px (want -60)". Silent to every other
 *            row, and the feature would be dead on the device.
 * and these were run against this release, on this file:
 *   app.css  the SHIPPED v415 geometry restored verbatim, `top: calc(-8px -
 *            var(--sat))` at 172x46                       6 FAILED. REST at
 *            --sat 0 reads 5,935 ink pixels in the 14px above the first card and
 *            a bottom edge at +38px; REACHABLE reads -38px of travel at --sat 0
 *            (it is already on screen), 9px at 47, 21px at 59, and the IDENTICAL
 *            row prints "-38px, 9px, 21px, 21px". That is the live regression
 *            this release fixes, going red on the geometry that shipped it.
 *   app.css  opacity: var(--wm-pull, 1) -> .55            8 FAILED: INK mean
 *            rgb(144,137,127) against the cream, both CURVE rows flat at 0.55 at
 *            every pull, VISIBLE at 0.55, FAILOPEN, REDUCED, and both SAMPLE
 *            rows that exist to stop a dim mark being graded as a bright one.
 *            The exact regression the OLD INK row used to demand.
 *   app.css  opacity: var(--wm-pull, 1) -> var(--wm-pull, 0)
 *                                                         2 FAILED, FAILOPEN and
 *            its SAMPLE row: the transparent-by-default trap, and it is invisible
 *            to every geometry and pixel row in this file because every one of
 *            them sets the pull first.
 *   js/app.js  the bindWordmarkPull() call deleted         3 FAILED: CURVE flat
 *            at 1.00 at every pull, COST "0 writes across 200 scroll events",
 *            and the reduced-motion SAMPLE row reading --wm-pull "".
 *   js/app.js  `still.matches ? 1 :` removed from the listener
 *                                                         1 FAILED, REDUCED.
 *   js/app.js  the 1/20 quantisation removed              1 FAILED, COST: 61
 *            writes across 200 scroll events instead of 21.
 *
 * UNDERNOTCH'S OWN LEDGER, 2026-08-21, and it runs the other way round: the row
 * is RED on this tree and the mutation is the one that makes it GREEN.
 *   (no mutation) the shipped rule                        RED. 0 visible px at
 *            the 36px js/app.js calls FULL, first ink at 76px of pull, whole at
 *            124px, with its SAMPLE partner reading 29,502px at 124 so the zeros
 *            are an occlusion and not a blind sampler.
 *   app.css  bottom: 100% -> bottom: calc(100% - var(--sat))
 *                                                         GREEN. 18,460 visible
 *            px at 36px of pull, first ink at 12px. The same run turns 12 other
 *            rows red (REST x3, ABOVE, CONTROL, MECHANISM, INK, VISIBLE,
 *            REACHABLE x4), because on a viewport with no notch that mark IS on
 *            screen at rest. That is not a flaw in either row: it is the shape of
 *            the problem. A mark hidden by the overflow clip is hidden from the
 *            status bar too, and a mark visible past the status bar is visible at
 *            rest. Whichever way the feature goes, one of these two sets has to
 *            be rewritten to grade against the inset instead of the origin.
 *   app.css  bottom: 100% -> bottom: calc(100% - 76px)    RED, and it was the
 *            run that caught the vacuous displacement: with the injected
 *            `top: <n>px` the displaced rows did not move at all. See the
 *            bounceStyle note in the MECHANISM block.
 *
 * WHAT THE iOS SIMULATOR SAID, because the obvious next idea is to go and get a
 * real bounce there. It cannot. Measured 2026-08-21 on a booted iPhone 17 Pro
 * (iOS 26.5), the live site in MobileSafari: a synthesised 340pt drag down at
 * scrollTop 0 moved the Today content ZERO pixels across a 26-frame burst, and
 * the SAME drag upward scrolled it normally, so the gesture path works. The
 * control that settles it is a bare document-scroller page served to the same
 * simulator: it did not bounce either, and iOS Safari's document scroller
 * certainly does on a real phone. So the limitation is the synthesised touch, not
 * the page, and no automated instrument on this machine can produce a rubber
 * band. UNPROVEN stays UNPROVEN: the one thing a human has to do is pull down on
 * Today on a real iPhone and watch whether the BONEHEAD CARD MOVES DOWN. If it
 * does not move, there is no bounce on this nested scroller and the mechanism is
 * dead whatever the geometry says. If it does move, the geometry above is what
 * decides whether he sees anything.
 *
 * The selector mutation is the reason to insist on this. The first version of
 * TODAY required the CLASS and a painted pseudo-element, and route() still adds
 * that class on Today, so the selector rewrite that put the wordmark on all six
 * screens left the row GREEN at 18/18. The deleted-toggle one is the reason the
 * rows check Number.isFinite before comparing: with no pseudo-element at all, NaN
 * geometry came back as null, node added two nulls to 0, and both REST-geometry
 * and ABOVE passed while reporting "bottom 0px" about an element that did not
 * exist.
 *
 * Usage: node tests/overscroll-wordmark-audit.mjs [baseUrl]
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveTree, boot, sleep } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

const SAT = 62;            // iPhone 17 Pro Max class top inset
const BAND = 76;           // --sat + 14px of padding: pure backdrop at rest
const BOUNCE = 240;        // the displacement the CONTROL and INK rows simulate
const DELTA = 60;          // scroll applied on top of it for the MECHANISM row
const INK_LUM = 60;        // ink detector: measured backdrop max is 33
const CREAM = [255, 243, 211];   // the wordmark PNG's own ink
const MARK_H = 62;         // app.css: the mark's height. `bottom: 100%` does the rest
const PAD = 14;            // .screen's padding above the first card, on top of --sat
const FULL = 36;           // js/app.js bindWordmarkPull(): px of pull for opacity 1

/* THE SIMULATED PULL. Chromium clamps scrollTop at 0, so the only way to reach
   the production listener is to shadow the element's scrollTop getter with an own
   property and dispatch a real scroll event. That runs the app's own handler and
   its own arithmetic; nothing here recomputes the curve. Returns the opacity the
   browser actually resolved for the pseudo-element, which is the number the eye
   would see.

   HOLD, IF THE RESULT HAS TO SURVIVE AN AWAIT. Cost me a debugging round: the
   VISIBLE row read opacity 1 out of this function and then screenshotted a black
   band, because releasing the override lets a real scroll event land during the
   next sleep and the listener correctly resets the mark to transparent at
   scrollTop 0. The listener was right and the harness was lying. Anything that
   grades PIXELS has to keep the scroller reporting a negative offset for as long
   as the capture takes, which is also a truer simulation of a bounce: during a
   real one the offset is negative the whole time. */
const pullTo = (page, px, hold = false) => page.evaluate((d, keep) => {
  const el = document.getElementById('screen');
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => -d });
  el.dispatchEvent(new Event('scroll'));
  const op = getComputedStyle(el, '::before').opacity;
  if (!keep) delete el.scrollTop;
  return { faked: -d, op: parseFloat(op), varSet: el.style.getPropertyValue('--wm-pull') };
}, px, hold);
const releasePull = page => page.evaluate(() => { delete document.getElementById('screen').scrollTop; });

/* ---------- static: the asset is precached ---------- */
const sw = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const precache = sw.slice(sw.indexOf('const PRECACHE = ['), sw.indexOf('];', sw.indexOf('const PRECACHE = [')));
ok('SETUP     the PRECACHE array was actually located in sw.js (a missed slice would make the row below vacuous)',
  precache.length > 500 && /index\.html/.test(precache), `${precache.length} bytes sliced`);
ok('PRECACHE  the wordmark is in sw.js PRECACHE, so a cold first pull is not a blank space',
  /['"]\.\/assets\/brand\/wordmark\.png['"]/.test(precache), 'assets/brand/wordmark.png');

/* ---------- browser ---------- */
let srv = null;
let base = process.argv.slice(2).find(a => !a.startsWith('--')) || process.env.URL;
if (!base) { srv = await serveTree(ROOT); base = srv.url; }

const { browser, page } = await boot(base);
const VW = page.viewport().width;

/* A second page that decodes screenshots through a canvas: the house pattern
   (boot-flash-audit), and it keeps node dependency-free. */
const dec = await browser.newPage();
await dec.goto('data:text/html,<body></body>');
const stats = b64 => dec.evaluate(async (data, lum) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + data;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0, sr = 0, sg = 0, sb = 0, top = -1, bottom = -1, maxCh = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    if (0.299 * r + 0.587 * gg + 0.114 * b <= lum) continue;
    n++; sr += r; sg += gg; sb += b; maxCh = Math.max(maxCh, r, gg, b);
    const y = Math.floor((i / 4) / c.width);
    if (top < 0) top = y;
    bottom = y;
  }
  return { total: d.length / 4, n, mean: n ? [sr / n | 0, sg / n | 0, sb / n | 0] : null, top, bottom, maxCh, h: c.height };
}, b64, INK_LUM);

/* Device pixels to CSS pixels comes from the SCREENSHOT's page, never from the
   decoder's own window: reading innerWidth in the decoder put the first ink row at
   283css inside a 200css-tall clip, and the MECHANISM shift at -228 instead of
   -100. The rows were right and the ruler was wrong. */
const SCALE = page.viewport().deviceScaleFactor;
const css = devicePx => Math.round(devicePx / SCALE);
const shot = async clip => (await page.screenshot({ clip, encoding: 'base64' }));
const band = () => shot({ x: 0, y: 0, width: VW, height: BAND });

await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1800);
await page.addStyleTag({ content: `:root{--sat:${SAT}px}` });
await sleep(600);

const geo = () => page.evaluate(() => {
  const el = document.getElementById('screen');
  if (!el) return null;
  const cs = getComputedStyle(el, '::before');
  const first = el.firstElementChild?.getBoundingClientRect();
  return {
    cls: el.className, content: cs.content,
    top: parseFloat(cs.top), h: parseFloat(cs.height), w: parseFloat(cs.width),
    opacity: parseFloat(cs.opacity), bg: cs.backgroundImage, position: cs.position,
    scrollTop: el.scrollTop, scrollH: el.scrollHeight, clientH: el.clientHeight,
    firstY: first ? Math.round(first.y) : null,
  };
});

const g0 = await geo();
ok('SETUP     Today is up with the mark declared: a ::before with the wordmark as its background',
  !!g0 && /wordmark\.png/.test(g0.bg) && g0.content !== 'none' && g0.w > 0 && g0.h > 0,
  g0 ? `class="${g0.cls}" ${g0.w}x${g0.h} top ${g0.top} opacity ${g0.opacity} position ${g0.position}` : 'no #screen');

/* The asset behind the rule really loads. A 404 paints nothing, and every pixel
   row below would then be grading an empty box. */
const assetOk = await page.evaluate(async u => {
  try { const r = await fetch(u); return { s: r.status, bytes: (await r.blob()).size }; } catch (e) { return { s: 0, bytes: 0 }; }
}, new URL('assets/brand/wordmark.png', base.replace(/\/?$/, '/')).href);
ok('SETUP     the wordmark the rule points at really loads',
  assetOk.s === 200 && assetOk.bytes > 4000, `HTTP ${assetOk.s}, ${assetOk.bytes} bytes`);

/* The band is deterministic, so a difference in it means the mark and not the app. */
const b1 = await band(); await sleep(900); const b2 = await band();
ok('SETUP     the band above the first card is stable across time, so a pixel difference in it means the mark',
  b1 === b2, `two captures 900ms apart ${b1 === b2 ? 'byte-identical' : 'DIFFER'}`);

/* ---------- REST ---------- */
const restStats = await stats(b1);
ok('REST      at scrollTop 0 not one pixel above the ink threshold is in the band: nothing of the mark is on screen',
  g0.scrollTop === 0 && restStats.n === 0,
  `scrollTop ${g0.scrollTop}, ${restStats.n} of ${restStats.total} px over lum ${INK_LUM}`);
/* Finite, THEN above. With the mark absent both numbers come back NaN, which
   JSON turns into null and node adds to 0: `0 <= 0` passed, and the row said
   "bottom 0px" about an element that did not exist. Caught by running the
   prove-red that deletes the class toggle in route(). */
ok('REST      the mark\'s bottom edge sits above the scrollport, so the overflow clip owns it',
  Number.isFinite(g0.top) && Number.isFinite(g0.h) && g0.top + g0.h <= 0,
  `top ${g0.top}px + height ${g0.h}px = bottom ${g0.top + g0.h}px (must be a real number <= 0)`);

/* ---------- REST AT --sat 0, WHICH IS WHERE THE LIVE BUG WAS ---------- */
/* Every REST row above runs at one faked inset. v415's rule was fine there and
   welded 38 of its 46px to the top of Today at --sat 0. So: no inset, the
   FAIL-OPEN opacity (the worst case, a device whose listener never fires), and a
   screenshot of the only strip that is backdrop at that inset, which is the 14px
   of .screen padding that is not --sat. Nothing may be in it.
   The fail-open state is not a detail here. With --wm-pull at 0 the mark is
   transparent and this row would pass on a geometry that is 38px wrong, so the
   SAMPLE row underneath it refuses to grade anything until the opacity is 1. */
await page.evaluate(() => {
  document.documentElement.style.setProperty('--sat', '0px');
  document.getElementById('screen').style.removeProperty('--wm-pull');
});
await sleep(400);
const sat0 = await page.evaluate(() => {
  const el = document.getElementById('screen');
  const cs = getComputedStyle(el, '::before');
  return { top: parseFloat(cs.top), h: parseFloat(cs.height), op: parseFloat(cs.opacity), pad: getComputedStyle(el).paddingTop };
});
ok('SAMPLE    at --sat 0 the mark is at its fail-open opacity, so the pixel row below is grading a mark that would actually paint',
  sat0.op === 1 && Number.isFinite(sat0.top) && sat0.h > 0,
  `opacity ${sat0.op}, top ${sat0.top}px, height ${sat0.h}px, .screen padding-top ${sat0.pad}`);
const sat0Stats = await stats(await shot({ x: 0, y: 0, width: VW, height: PAD }));
ok('REST      at --sat 0 nothing of the mark is on screen at rest, in pixels: no inset is the case the shipped rule got backwards',
  sat0Stats.n === 0 && Number.isFinite(sat0.top) && sat0.top + sat0.h <= 0,
  `${sat0Stats.n} ink px in the ${PAD}px above the first card, bottom edge at ${sat0.top + sat0.h}px (v415 measured +38px here, visible at every scroll position)`);
await page.evaluate(v => document.documentElement.style.setProperty('--sat', v + 'px'), SAT);
await sleep(400);

/* The feature-off comparison lives at the BOTTOM of this file, not here. Taking
   the class off and putting it back by hand is exactly how a guard lies: with the
   toggle in route() deleted (a real way to break this feature) nothing was left to
   remove the hand-added class, so it survived every later navigation and the tab
   sweep reported the mark on all six screens. It still went red, for the wrong
   reason, on evidence that was the audit's own doing. Nothing here sets that class
   until every row that reads it has been graded. */

/* ---------- CLAMP + ABOVE ---------- */
const clamp = await page.evaluate(() => {
  const el = document.getElementById('screen');
  el.scrollTop = -400;
  const after = el.scrollTop;
  const cs = getComputedStyle(el, '::before');
  const out = [];
  for (const s of [0, 120, 600, 1e6]) {
    el.scrollTop = s;
    out.push({ want: s, got: Math.round(el.scrollTop), bottom: parseFloat(cs.top) + parseFloat(cs.height) - el.scrollTop });
  }
  el.scrollTop = 0;
  return { negative: after, out };
});
ok('CLAMP     scrollTop cannot be driven negative, so ordinary scrolling can never reach the mark',
  clamp.negative === 0, `set -400, engine reported ${clamp.negative}`);
const notAbove = clamp.out.filter(r => !Number.isFinite(r.bottom) || r.bottom > 0);
ok('ABOVE     at every scroll position the mark stays above the scrollport top edge',
  clamp.out.length === 4 && notAbove.length === 0,
  clamp.out.map(r => `scrollTop ${r.got}: bottom ${Math.round(r.bottom)}px`).join(', '));

/* ---------- MECHANISM ---------- */
/* THE SIMULATION, AND IT IS A SIMULATION. A rubber band translates the whole
   scrolled content layer down by d, so it is reproduced by moving BOTH the flow
   content and the mark down by d: padding for the content, `top` for the mark.
   Nothing else about the render changes. It is not a bounce; it is the geometry a
   bounce produces, which is all a browser without one can offer.
   Sampling stays inside the region that is content-free at BOTH scroll positions
   (the card lands at BOUNCE + 76 and at BOUNCE + 76 - DELTA), because a clip that
   reaches the card grades the card: the first version of this row read 445,425
   ink pixels off the green Bonehead panel and would have passed on a mark that
   never painted at all.

   THE MARK MOVES BY TRANSFORM, NOT BY A REWRITTEN `top`, AND THAT IS LOAD-BEARING.
   Every displaced row in this file used to inject `bottom:auto; top:<n>px`, which
   throws the shipped rule's own anchor away and pins the mark to a number this
   file chose. Caught 2026-08-21 by a prove-green that would not go green: the
   wordmark was moved 76px down the page in app.css and the displaced rows did not
   move one pixel, because they were grading the constant at the top of THIS file.
   Four rows measuring their own arithmetic. `translateY` adds the displacement to
   wherever the shipped rule actually put the mark, which is what a rubber band
   does to it, and it is also the only version that can go red when the rule moves. */
const bounceStyle = px =>
  `#screen{padding-top:calc(var(--sat) + ${PAD}px + ${px}px) !important}` +
  `.screen--today::before{transform:translateY(${px}px) !important}`;
/* --wm-pull is PINNED for this block, and it has to be. The block scrolls the
   element for real, which fires the production listener, which sets the property
   to 0 for any non-negative scrollTop and would black out the mark mid-row. 1 is
   also the honest value: a 240px bounce is 6.7x the 36px the fade needs, so a real
   device at this displacement is at full opacity. A stylesheet !important beats
   the listener's inline write. The fade itself is graded by CURVE and VISIBLE
   below, off the listener with nothing pinned. */
const DISP = await page.addStyleTag({ content:
  bounceStyle(BOUNCE) + `#screen{--wm-pull:1 !important}` });
await sleep(500);
/* The sample window: below the mark's simulated position and above where the
   first card lands, at BOTH scroll positions. mark [BOUNCE-63, BOUNCE-1] and
   [BOUNCE-62-DELTA, BOUNCE-DELTA], card at BOUNCE+76 and BOUNCE+76-DELTA. */
const clip = { x: 0, y: 0, width: VW, height: BOUNCE + BAND - DELTA - 16 };
const at0 = await stats(await shot(clip));
await page.evaluate(d => { document.getElementById('screen').scrollTop = d; }, DELTA);
await sleep(400);
const atD = await stats(await shot(clip));
await page.evaluate(() => { document.getElementById('screen').scrollTop = 0; });
await sleep(300);

ok(`CONTROL   the sampler is not blind: displaced by a simulated ${BOUNCE}px bounce the mark puts thousands of ink pixels into the same band the REST rows graded as empty`,
  at0.n > 2000 && at0.n < 200000 && Math.abs(css(at0.top) - (BOUNCE - MARK_H)) <= 3,
  `${at0.n} px over lum ${INK_LUM}, first ink row y=${css(at0.top)}css (want ${BOUNCE - MARK_H})`);
const shift = css(atD.top - at0.top);
ok(`MECHANISM the mark rides the scrolled content layer: ${DELTA}px of scroll moves its ink up by ${DELTA}px, which is the displacement a rubber band applies to that same layer`,
  atD.n > 2000 && Math.abs(shift + DELTA) <= 3,
  `ink first row ${css(at0.top)}css -> ${css(atD.top)}css, shift ${shift}px (want -${DELTA})`);

/* ---------- INK ---------- */
/* Same displaced capture, graded on colour, and the direction of this row was
   REVERSED in the release that made the mark unmistakable (see the header). It
   used to require the composite to land on --text-3 with a brightness ceiling of
   200. It now requires the opposite: at a full pull the mark reads as the cream
   it is drawn in, with a brightness FLOOR. Measured both ways on this tree:
   opacity 1 gives mean rgb(230,219,192) and brightest channel 255; the .55 the
   old row demanded gives mean ~(143,133,120) and never clears 200, so the two
   states are 80+ levels apart on every channel and the bound is not delicate. */
/* No ink at all is a FAILED row, never a thrown TypeError: a suite that dies
   mid-run prints a stack instead of the remaining rows, which reads like a broken
   app rather than a broken feature. */
const off = at0.mean ? CREAM.map((c, i) => Math.abs(at0.mean[i] - c)) : null;
ok('INK       at a full pull the mark composites BRIGHT, near the cream it is drawn in, not dimmed down to --text-3',
  !!off && Math.max(...off) <= 40 && at0.maxCh >= 240,
  off
    ? `mean rgb(${at0.mean.join(',')}) vs source ink rgb(${CREAM.join(',')}) delta ${off.join('/')}, brightest channel ${at0.maxCh} (the dim version this replaces measured mean 143,133,120 / max 200)`
    : 'no ink pixels found at all: there is nothing to grade the colour of');
await DISP.evaluate(n => n.remove());
await sleep(300);

/* ---------- UNDERNOTCH: the pull it takes to clear the STATUS BAR ---------- */
/* THE ROW THAT LETS TOM SEE IT, AND THE ONE THIS FILE DID NOT HAVE.
 *
 * Tom, 2026-08-21, on the third release of this feature: "you claimed twice that
 * scrolling down on today showed a boneheadz logo above behind scroll. it doesnt
 * and youve never actually got this right despite claiming you did multiple
 * times." He is the ground truth and the file was green. So what was it green
 * about?
 *
 * REACHABLE, below, computes `firstPx = -(top + height)` off getComputedStyle and
 * calls the mark reachable when that lands within 1px. That is the pull at which
 * the mark's bottom edge crosses y = 0, THE SCROLLPORT'S TOP EDGE. On the phone
 * Tom holds, y = 0 is not where the screen starts being visible: the app ships
 * `viewport-fit=cover` with a black-translucent status bar, so the top
 * env(safe-area-inset-top) of the viewport is UNDER the system status bar, and on
 * a 17-class phone the Dynamic Island is a physical cutout ~125x37pt sitting dead
 * centre in that strip, which is exactly where a 232px-wide centred wordmark's
 * middle rides in. Arriving at y = 0 and being VISIBLE are 62px apart, and this
 * file measured the first and reported the second.
 *
 * Worse, its partner row ("the threshold is IDENTICAL on every inset") exists to
 * keep --sat OUT of the threshold, on the reasoning that no phone should need a
 * harder pull than another. --sat is the whole occlusion. A rule that forbids the
 * occluding term from entering the number cannot ever notice the occlusion.
 *
 * And every row in this file that grades PIXELS does it at BOUNCE = 240px of
 * displacement, 6.7x the pull js/app.js itself calls full, in a sample window
 * chosen to clear the first card, which puts it far below the inset by accident.
 * So no row ever looked at the strip an ordinary pull actually exposes.
 *
 * THIS ROW LOOKS AT EXACTLY THAT STRIP. Same displacement trick the MECHANISM
 * block uses (padding for the flow content, `top` for the mark: the geometry a
 * bounce produces), swept across real pull distances, and the capture is clipped
 * to y in [--sat, pull]: the part of the reveal that is NOT behind the status bar.
 * Ink there is ink Tom can see. Ink above it is ink the phone paints over.
 *
 * IT CANNOT BE SATISFIED BY THE SHIPPED MECHANISM, and that is the finding, not a
 * bug in the row. A mark parked above the scrollport has its first visible pixel
 * at pull = --sat and is whole at pull = --sat + height. Moving it down to fix
 * that puts it on screen at rest, which is the v415 regression REST exists to
 * catch. The two constraints are the same number with opposite signs. Proven both
 * ways in the prove-red notes at the top of this file.
 *
 * NOT A SIMULATION OF THE BOUNCE. Chromium cannot bounce and neither can the iOS
 * Simulator under synthesised touch: measured 2026-08-21, a 340pt drag on the
 * booted iPhone 17 Pro moved the content ZERO pixels and left scrollTop at 0, on
 * the app AND on a bare document-scroller control page, which is the control that
 * says the input is the limitation and not the page. What this row asserts is the
 * ARITHMETIC OF THE OCCLUSION, which needs no bounce: wherever the rubber band
 * takes the layer, the top --sat of the viewport is not visible. */
const PULLS = [12, 24, FULL, 48, 62, 76, 100, 124, 160];
const UNDER = await page.addStyleTag({ content: '#screen{--wm-pull:1 !important}' });
const underInk = [];
for (const P of PULLS) {
  const d = await page.addStyleTag({ content: bounceStyle(P) });
  await sleep(220);
  /* THE WINDOW IS [--sat, the first card], WHICH IS THE EMPTY SPACE A HUMAN SEES.
     Its top edge is the inset: above that the phone paints its own status bar over
     whatever is there. Its bottom edge is where the first card now lands, which
     the displacement puts at --sat + PAD + P, minus 2px so a border or a shadow
     cannot be counted as the mark. Everything in between is backdrop at rest (the
     REST rows measure 0 ink there), so ink in it is the wordmark and nothing else.
     An earlier version stopped the window at P instead of at the card, which made
     it structurally impossible for any mark below the scrollport origin to score:
     the row was then a test of the shipped anchor rather than of visibility, and
     it could not go green for the fix either. */
  const s = await stats(await shot({ x: 0, y: SAT, width: VW, height: PAD + P - 2 }));
  underInk.push({ P, n: s.n });
  await d.evaluate(n => n.remove());
}
await UNDER.evaluate(n => n.remove());
await sleep(200);
const VIS_MIN = 200;       // ink pixels below the inset that count as "he can see it"
const firstSeen = underInk.find(u => u.n >= VIS_MIN);
const atFullPull = underInk.find(u => u.P === FULL);
/* SAMPLE: at the largest pull the strip MUST be full of ink, or this row's zeros
   are a blind sampler and not an occlusion. Same trap the CONTROL row exists for. */
ok(`SAMPLE    the under-the-notch sampler is not blind: at ${PULLS[PULLS.length - 1]}px of pull the strip below --sat is full of ink`,
  underInk[underInk.length - 1].n > 2000,
  underInk.map(u => `${u.P}px:${u.n}`).join(' '));
ok(`UNDERNOTCH a pull of ${FULL}px, which js/app.js calls FULL opacity, puts wordmark pixels BELOW the status bar where Tom can actually see them`,
  !!firstSeen && firstSeen.P <= FULL && atFullPull.n >= VIS_MIN,
  `${atFullPull.n} visible px at ${FULL}px of pull (--sat ${SAT}); first pull with any: ${firstSeen ? firstSeen.P + 'px' : 'none up to ' + PULLS[PULLS.length - 1] + 'px'}. ` +
  `A mark whose bottom edge is pinned to the scrollport origin cannot clear an inset of ${SAT} until the pull exceeds ${SAT}, and is whole at ${SAT + MARK_H}.`);

/* ---------- CURVE: the fade is driven off scroll position ---------- */
/* THIS IS THE ROW THE FEATURE WAS MISSING. Everything above grades geometry and
   colour at an assumed full reveal. Tom's instruction was that the reveal be
   deterministic in the PULL: "Drive it off scroll position so it fades in
   deterministically." So drive the real listener with a faked negative scrollTop
   and read back the opacity the browser resolved. No arithmetic is repeated here;
   the numbers come out of js/app.js. */
const curve = [];
for (const px of [0, 4, 9, 18, 27, 36, 72, 240]) curve.push(await pullTo(page, px));
const monotonic = curve.every((c, i) => i === 0 || c.op >= curve[i - 1].op - 1e-9);
ok('CURVE     the mark\'s opacity is a function of PULL DISTANCE, read back off the real listener, and it only ever increases with the pull',
  curve[0].op === 0 && monotonic && curve.every(c => Number.isFinite(c.op)),
  curve.map(c => `${-c.faked}px:${c.op.toFixed(2)}`).join(' '));
const atFull = curve.find(c => -c.faked === FULL);
ok(`CURVE     by ${FULL}px of pull it is at FULL opacity, and half way there it is already half lit: v414 and v415 both capped at .55 and Tom saw neither`,
  atFull.op === 1 && curve.find(c => -c.faked === 18).op >= 0.45,
  `${FULL}px -> ${atFull.op}, 18px -> ${curve.find(c => -c.faked === 18).op}, 4px -> ${curve.find(c => -c.faked === 4).op} (a jitter-sized pull stays near invisible on purpose)`);

/* FAILOPEN. The one way a JS-driven reveal ships blank: the listener never runs
   (a WebView that does not report the negative offset, a boot that threw before
   bindWordmarkPull) and the CSS default is transparent. Third attempt at this
   feature, so the default is asserted, not assumed. Clearing the inline property
   is exactly the state before the first scroll event. */
const failopen = await page.evaluate(() => {
  const el = document.getElementById('screen');
  el.style.removeProperty('--wm-pull');
  return parseFloat(getComputedStyle(el, '::before').opacity);
});
ok('FAILOPEN  with --wm-pull never set, the mark is at FULL opacity and not at zero: a listener that never fires degrades to the loud version, never to a blank space',
  failopen === 1, `computed opacity with no listener contribution: ${failopen}`);

/* REDUCED MOTION. The mark declares NO animation, so there is no keyframe to
   shorten. What reduced motion does here is pin the scroll-linked opacity to the
   end state, which is also the loudest one; asserted at pull 0, where the fade
   would otherwise be transparent.
   The duration is NOT asserted to be 0s, and that is deliberate. app.css's global
   reduce block sets animation-duration: 0.001s on every element, which is the
   1000-cycles-a-second trap on its own; the same block caps
   animation-iteration-count at 1, which is what actually stops a loop. So the
   right thing to assert about this feature is that it brings no animation for
   that rule to act on, plus the cap being in force. Measured: name none,
   duration 0.001s, iterations 1. */
/* AND THE BASELINE IS ESTABLISHED AND ASSERTED FIRST, because without it this row
   passed with the handling DELETED. Prove-red m6 caught it: FAILOPEN leaves the
   inline property removed, the listener short-circuits when the quantised value
   has not changed, so a naive pull-to-0 wrote nothing, the default 1 applied, and
   the row read opacity 1 while asserting nothing about reduced motion at all.
   Force a non-zero pull first so the write to 0 really happens, and REQUIRE the
   transparent state before emulating anything. */
await pullTo(page, FULL);
const rmBase = await pullTo(page, 0);
ok('SAMPLE    with motion allowed a zero pull really is transparent, so the reduced-motion row below cannot pass on the fail-open default',
  rmBase.op === 0 && rmBase.varSet === '0', `opacity ${rmBase.op}, --wm-pull "${rmBase.varSet}"`);
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await sleep(250);
/* The pin is in the LISTENER, so a scroll event has to run for it to apply.
   AND THEN THE READ HAS TO WAIT, which cost a debugging round and is worth
   writing down because it makes a working feature look broken. With emulated
   media, the computed style of a PSEUDO-ELEMENT lags one recalc cycle behind the
   custom-property write that feeds it: measured, the listener set --wm-pull to
   "1" and three consecutive reads returned "0", "0", "1". The first draft of this
   row read in the same task, got 0, and I concluded a perfectly good CSS
   `@media` pin did not apply and swapped the mechanism. The mechanism swap was
   fine on its own merits (one source of truth for --wm-pull, and reduced motion
   is the same look with the fade removed rather than a second rule), but the
   evidence for it was a stale read, so: read in its own task, after a settle. */
await pullTo(page, 0);
await sleep(300);
const rm = { op: await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('screen'), '::before').opacity)) };
const rmDur = await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('.screen--today'), '::before');
  return { dur: cs.animationDuration, name: cs.animationName, iter: cs.animationIterationCount, trans: cs.transitionDuration };
});
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
await sleep(250);
ok('REDUCED   under prefers-reduced-motion the listener pins the mark to the end state instead of fading it, and the feature declares no animation for the global duration collapse to act on',
  rm.op === 1 && rmDur.name === 'none' && rmDur.iter === '1',
  `opacity at pull 0 with reduce: ${rm.op}; animation-name ${rmDur.name}, duration ${rmDur.dur}, iterations ${rmDur.iter}, transition ${rmDur.trans}`);

/* COST. A scroll listener on this element is the one thing that could make the
   feature expensive, and "it is quantised" is a comment until something counts.
   Counts STYLE WRITES rather than milliseconds: deterministic, and it is the
   write that costs, not the arithmetic. 200 distinct pull values across the full
   range may produce at most 21 writes (0 through 1 in twentieths). */
const cost = await page.evaluate(async n => {
  const el = document.getElementById('screen');
  let writes = 0;
  const real = el.style.setProperty.bind(el.style);
  el.style.setProperty = (...a) => { if (a[0] === '--wm-pull') writes++; return real(...a); };
  let d = 0;
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => -d });
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { d = (i / n) * 120; el.dispatchEvent(new Event('scroll')); }
  const ms = performance.now() - t0;
  delete el.scrollTop;
  delete el.style.setProperty;
  return { writes, ms, n };
}, 200);
ok('COST      the listener is quantised for real: 200 distinct pull values produce at most 21 style writes, so a bounce cannot write a custom property once per frame',
  cost.writes > 1 && cost.writes <= 21,
  `${cost.writes} writes across ${cost.n} scroll events, ${cost.ms.toFixed(1)}ms total (${(cost.ms / cost.n).toFixed(3)}ms per event, no layout read but scrollTop)`);

/* ---------- VISIBLE: pixels, at the pull the curve says is full ---------- */
/* The money row, and the one whose absence let v414 and v415 pass this file.
   FIRST ATTEMPT WAS WRONG AND SAID SO LOUDLY: 0 ink pixels. I displaced the mark
   to top: -27, which is where a 36px bounce leaves it in CONTENT coordinates, and
   the overflow clip ate it. That clip is the entire feature (the mark is only ever
   reachable because the bounce translates the content INSIDE the clip, which
   Chromium will not do), so a simulation has to move the mark to where it is
   PAINTABLE and then sample only the rows the pull would expose.
   So: the same BOUNCE displacement CONTROL uses, and a screenshot of the LAST
   FULL rows of the mark's box, which is exactly the slice a FULL-px pull reveals.
   Opacity comes from the real listener with nothing pinned. */
const VIS = await page.addStyleTag({ content: bounceStyle(BOUNCE) });
await pullTo(page, FULL, true);      // held: see pullTo's note
await sleep(400);
/* The opacity that goes into the row is re-read AT CAPTURE TIME, not the one
   pullTo returned before the sleep. That is the whole lesson of the black band. */
const visGeo = await geo();
const vis = await stats(await shot({ x: 0, y: BOUNCE - FULL, width: VW, height: FULL }));
const visOff = vis.mean ? CREAM.map((c, i) => Math.abs(vis.mean[i] - c)) : null;
ok(`VISIBLE   a ${FULL}px pull puts thousands of bright wordmark pixels on screen: not merely present, VISIBLE`,
  visGeo.opacity === 1 && vis.n > 4000 && !!visOff && Math.max(...visOff) <= 50 && vis.maxCh >= 240,
  `${vis.n} ink px in the ${FULL}px the pull exposes, opacity ${visGeo.opacity} measured at capture, mean rgb(${vis.mean ? vis.mean.join(',') : 'none'}), brightest ${vis.maxCh}`);
await releasePull(page);
await VIS.evaluate(n => n.remove());
await page.evaluate(() => document.getElementById('screen').style.removeProperty('--wm-pull'));
await sleep(300);

/* ---------- TODAY ONLY ---------- */
const tabs = ['today', 'bonehead', 'progress', 'foods', 'friends', 'settings'];
const seen = [];
for (const t of tabs) {
  await page.evaluate(h => { location.hash = '#/' + h; }, t);
  await sleep(1500);
  seen.push({ t, ...await page.evaluate(() => {
    const el = document.getElementById('screen');
    const cs = getComputedStyle(el, '::before');
    /* THE MARK, NOT THE CLASS. The first version of this row required BOTH the
       class and a painted pseudo-element, and the class is applied by route() in
       js/app.js, which a CSS mutation does not touch: rewriting the selector to
       `.screen::before` gave the wordmark to all six screens and this row stayed
       green, 18/18. The class was doing all the deciding and the actual mark was
       never graded, which is guard-hygiene-lint's failure 4. Ask the renderer what
       it PAINTS on this screen and nothing else. */
    return {
      cls: el.className, kids: el.children.length,
      mark: cs.content !== 'none' && /wordmark\.png/.test(cs.backgroundImage) && parseFloat(cs.width) > 0,
    };
  }) });
}
const empty = seen.filter(s => !s.kids);
const wrong = seen.filter(s => (s.t === 'today') !== s.mark);
ok('SETUP     every tab in the sweep actually rendered something (an empty screen would make the row below vacuous)',
  seen.length === tabs.length && empty.length === 0, `${seen.length} tabs, empty: ${empty.map(s => s.t).join(',') || 'none'}`);
ok('TODAY     the wordmark is PAINTED on Today and on no other screen',
  wrong.length === 0,
  seen.map(s => `${s.t}:${s.mark ? 'MARK' : '-'}`).join(' '));

/* ---------- NO LAYOUT SHIFT ---------- */
/* Today's idle Bonehead animation moves 31 of 400 rects between two samples on
   an untouched tree, so freeze first and PROVE the freeze took: a drifting
   baseline would make a zero here meaningless (and a non-zero a false alarm). */
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1700);
await page.addStyleTag({ content: '*,*::before,*::after{animation:none !important;transition:none !important}' });
await sleep(500);
const rects = () => page.evaluate(() => {
  const el = document.getElementById('screen');
  return [...el.querySelectorAll('*')].map(n => {
    const r = n.getBoundingClientRect();
    return `${n.tagName}.${n.className}|${r.x.toFixed(1)},${r.y.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}`;
  });
});
const f1 = await rects(); await sleep(700); const f2 = await rects();
const drift = f1.filter((v, i) => v !== f2[i]).length;
ok('FROZEN    with animations frozen Today holds still, so the comparison below measures the feature and not the idle Bonehead',
  f1.length > 100 && drift === 0, `${f1.length} elements, ${drift} moved across 700ms`);

const onGeo = await geo();
const on = await rects();
const bandOn = await band();
await page.evaluate(() => document.getElementById('screen').classList.remove('screen--today'));
await sleep(400);
const offGeo = await geo();
const offRects = await rects();
const bandOff = await band();
ok('REST      the band above the first card is byte-identical with the feature ON and OFF: at rest the wordmark changes nothing',
  bandOn === bandOff, bandOn === bandOff ? 'identical' : 'the feature paints something at rest');
const moved = on.filter((v, i) => v !== offRects[i]);
ok('NO-SHIFT  every element rect on Today is identical with the mark present and absent: it costs nothing above the first card, and `position: relative` on the scroller re-parents nothing',
  on.length > 100 && on.length === offRects.length && moved.length === 0,
  `${on.length} elements, ${moved.length} differ${moved.length ? ': ' + moved.slice(0, 3).join(' | ') : ''}`);
ok('NO-SHIFT  the first card\'s y and the scroll height are EXACTLY equal with the mark present and absent',
  Number.isFinite(onGeo.firstY) && onGeo.firstY === offGeo.firstY
  && onGeo.scrollH > 0 && onGeo.scrollH === offGeo.scrollH,
  `first card y ${onGeo.firstY} -> ${offGeo.firstY}, scrollHeight ${onGeo.scrollH} -> ${offGeo.scrollH}`);

/* ---- REACHABLE. The assertion this file was missing, and the reason it passed
   while the feature was invisible on Tom's phone. Everything above proves the
   mark costs no LAYOUT. Nothing proved it can be SEEN. Shipped v414 needed 73px
   of rubber-band travel at --sat 59px before one pixel appeared, and 113px to be
   whole, at .55 opacity; the CSS called that deliberate. A reveal nobody can
   reach is not a reveal.
   The bounce itself cannot be reproduced headless (WKWebView gives the scroller
   a negative content offset; Chromium does not), so this asserts the GEOMETRY
   that decides the pull, which is the part that was wrong. FIRST_PX_MAX is a
   ceiling and may only be ratcheted DOWN. */
/* RE-ENABLE FIRST. The section above deliberately strips .screen--today to
   measure the feature OFF, and never puts it back, so a naive read here finds no
   pseudo-element at all and every ceiling below passes vacuously on a null. That
   is the same empty-sample trap this file's own SAMPLE rows exist to catch. */
await page.evaluate(() => document.getElementById('screen').classList.add('screen--today'));
await sleep(300);
const FIRST_PX_MAX = 1;    // ratcheted 30 -> 4 -> 1 as the offset arithmetic went away
/* NO OPACITY BOUND HERE. There used to be a note explaining that an opacity floor
   would contradict the INK row's --text-3 ceiling. That contradiction is gone
   (INK now demands bright), but the division of labour is still right: CURVE and
   VISIBLE own the look, off the real listener; this section owns the GEOMETRY,
   which is measured with --wm-pull absent and would read 1 everywhere. */
/* --sat 0 IS IN THE LIST, and it is the inset that mattered most. The shipped
   v415 rule read `top: calc(-8px - var(--sat))` at height 46, so its bottom edge
   sat at 38 - sat: above the origin on a notched phone (Tom saw nothing) and 38px
   BELOW it with no inset, welding most of the wordmark to the top of Today on
   desktop, notchless phones and the Android shell. Every inset this file used to
   grade was non-zero, which is how a rule with a live regression on one whole
   class of device passed 25 of 25. */
const INSETS = [[390, 844, 0], [390, 844, 47], [393, 852, 59], [440, 956, 59]];
const firstPxSeen = [];
let reachChecked = 0;
for (const [W, H, sat] of INSETS) {
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluate(v => document.documentElement.style.setProperty('--sat', v + 'px'), sat);
  await sleep(400);
  const g = await page.evaluate(() => {
    const sc = document.querySelector('.screen--today');
    if (!sc) return null;
    const cs = getComputedStyle(sc, '::before');
    return { top: parseFloat(cs.top), h: parseFloat(cs.height), op: parseFloat(cs.opacity) };
  });
  /* SAMPLE REACH: no element, no pseudo, or a zero-height mark makes every
     ceiling below pass for free. */
  ok(`SAMPLE    ${W}x${H} --sat ${sat}: there is a wordmark with real geometry to measure`,
    !!g && Number.isFinite(g.top) && g.h > 0,
    JSON.stringify(g));
  if (!g || !Number.isFinite(g.top) || !(g.h > 0)) continue;
  reachChecked++;
  const firstPx = -(g.top + g.h);
  const whole = -g.top;
  firstPxSeen.push(firstPx);
  /* TWO-SIDED. The ceiling is "he can reach it"; the floor is "it is not already
     there", which is the --sat 0 regression, and a one-sided ceiling passes a
     mark hanging 38px into the screen with room to spare. */
  ok(`REACHABLE ${W}x${H} --sat ${sat}: the first pixel arrives within ${FIRST_PX_MAX}px of pull, and not before 0`,
    firstPx >= 0 && firstPx <= FIRST_PX_MAX,
    `needs ${firstPx.toFixed(0)}px of rubber-band travel before ANY of the mark is on screen (${whole.toFixed(0)}px to be whole). v414 shipped at 73px, which is why Tom could not see it.`);
}
/* SAME ON EVERY PHONE. The old rule put --sat in the offset, so the threshold was
   9px on a 14-class notch and 21px on a 17-class one: nobody chose that, it fell
   out of an anchor picked for a different reason. Pinning the mark's BOTTOM edge
   to the origin instead makes the pull identical everywhere, and this row is what
   stops --sat creeping back into it. */
ok('REACHABLE the threshold is IDENTICAL on every inset, so no phone gets a harder pull than another',
  firstPxSeen.length === INSETS.length && new Set(firstPxSeen.map(v => v.toFixed(1))).size === 1,
  `first-pixel pull per inset: ${firstPxSeen.map(v => v.toFixed(0) + 'px').join(', ')}`);
ok('SAMPLE    every inset in the class was measured, so the ceilings above mean something',
  reachChecked === INSETS.length, `${reachChecked} of ${INSETS.length}`);

await dec.close();
await browser.close();
if (srv) srv.close();

const failed = results.filter(r => !r.pass);
if (results.length < 39) { console.log(`\nFAIL: only ${results.length} checks ran, expected 39`); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join(', ')); process.exit(1); }
console.log('overscroll-wordmark-audit clean');
