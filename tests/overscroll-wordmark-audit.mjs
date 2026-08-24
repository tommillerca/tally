/* THE OVERSCROLL WORDMARK: hidden at rest, Today only, free of layout, and
 * UNMISTAKABLE once you pull.
 *
 * WHAT THIS FILE CANNOT DO, SAID FIRST. It does not produce a rubber band. iOS
 * overscroll is a WKWebView/UIScrollView behaviour: no headless Chromium bounces,
 * and a scripted negative scrollTop is clamped to 0 by the engine (asserted
 * below, because that clamp is also the reason ordinary scrolling cannot leak the
 * mark). What it CAN do is drive the production scroll listener with a faked
 * negative offset and then assert PIXELS, which is the whole geometry and the
 * whole reveal curve minus the finger.
 *
 * WHAT A DEVICE SAID, 2026-08-21, BECAUSE THE THING THIS FILE CANNOT DO IS
 * EXACTLY WHERE THREE RELEASES DIED. Booted iPhone 17 Pro (iOS 26.5),
 * MobileSafari, a synthesised drag HELD open for ~10s so the bounce could be
 * screenshotted while it was happening:
 *   - the nested scroller DOES rubber-band, and `overscroll-behavior: contain`
 *     does not stop it. #screen.scrollTop bottomed out at -168, 33 scroll events
 *     fired with a negative value, and an element inside the scroller moved 168px
 *     down by getBoundingClientRect. So the listener has always had real data.
 *   - and NOTHING PARKED ABOVE THE SCROLLER'S CONTENT ORIGIN PAINTS INTO THE
 *     EXPOSED STRIP. In a 126pt-deep bounce, sampled at both halves of the width,
 *     the strip was the scroller's own background COLOUR edge to edge and zero px
 *     of anything else. Four forms of "parked above the origin" were in that page
 *     and all four scored zero: a `::before` at `bottom: 100%`, a real div at
 *     `bottom: 100%`, and a background-image at `center -60px` with
 *     `background-attachment: local` and with `scroll`. WebKit sizes the
 *     scrolled-contents layer to the scrollable-overflow rect, which begins AT
 *     the origin, and fills the rubber-band region from that layer's solid
 *     backgroundColor.
 * That is why Tom never saw the mark on any of v414, v415 or v421: not the pull
 * threshold, which is what every earlier version of this file argued about, but a
 * mark that could not have appeared however far he pulled.
 *
 * AND THE FIX WAS CONFIRMED THE SAME WAY, ON THE SAME SIMULATOR, BEFORE THIS FILE
 * WAS BELIEVED. The shipped rule and the shipped listener were lifted verbatim
 * into a bare page with the same #app/.screen boxes and the real wordmark.png,
 * and the same held drag was screenshotted: the wordmark painted IN FULL, at
 * device rows 245-369, entirely below the Dynamic Island, during a real rubber
 * band. That is the end of the chain, and it is the one link no headless run and
 * no row in this file can assert. The previous version
 * of this header said "the only proof that pulling down on an iPhone shows the
 * wordmark is pulling down on an iPhone", and then let a design decision rest on
 * an assumption about WKWebView that nobody had measured. Measuring it took one
 * page and one held drag.
 *
 * WHAT IT DOES TEST is everything that can be wrong WITHOUT a bounce, which is
 * every requirement Tom actually set:
 *   REST      at scrollTop 0 not one pixel of the mark is on screen
 *   CLAMP     scrollTop cannot go negative, so ordinary scrolling can never
 *             reach it either
 *   ABOVE     at every scroll position the mark's bottom edge stays above the
 *             viewport's top edge, so only a NEGATIVE offset can reveal it
 *   MECHANISM the mark is NOT inside the scroller and does NOT ride the scrolled
 *             content layer, asserted twice: `#screen::before` paints nothing,
 *             and 60px of real scrolling moves the mark's ink by ZERO pixels.
 *             The direction of this row is REVERSED from the one it replaces,
 *             which required the ride. See its block: the ride is the bug.
 *   CURVE     opacity AND travel are functions of PULL DISTANCE, driven by the
 *             real listener in js/app.js, monotonic, and fully revealed by 36px
 *   FAILOPEN  with the listener never having fired, the mark is at opacity 1 and
 *             not at 0, AND fully outside the clip. A JS-driven reveal whose
 *             default is transparent is one of the ways this shipped invisible.
 *   REDUCED   prefers-reduced-motion drops the FADE and leaves the TRAVEL alone.
 *             Pinning --wm-pull itself, which is how reduced motion used to be
 *             handled, would now park the mark permanently on screen. The feature
 *             brings no animation for the global 0.001s duration collapse to act
 *             on, and the iteration cap that actually stops a loop is in force
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
 *   UNDERNOTCH at the pull the reveal calls FULL, thousands of the mark's pixels
 *             are BELOW env(safe-area-inset-top), i.e. out from under the status
 *             bar and the Dynamic Island, and the first of them arrive by 24px of
 *             pull. GRADED again as of 2026-08-21, on Tom's instruction. See its
 *             own block for why it was downgraded for one release and why that
 *             is over.
 *   REACHABLE two-sided per inset and against the INSET, not the origin: nothing
 *             at rest at the fail-open opacity, and the WHOLE mark below --sat at
 *             a full pull, with the same clearance on every phone.
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
 * The notch is faked (--sat: 62px, anti-regression rule 4), and it is now the
 * term the whole feature turns on rather than one it was written to avoid. An
 * earlier row here FORBADE --sat from entering the reveal, on the reasoning that
 * no phone should need a harder pull than another; --sat is the occlusion, so a
 * rule that keeps the occluding term out of the number can never notice the
 * occlusion. The PULL is inset-free (--wm-pull is min(1, pull/36) everywhere) and
 * the TRAVEL contains --sat on purpose, which is what lands the same clearance on
 * every phone. REACHABLE's last row grades the clearance, not the offset.
 *
 * PROVE-RED. Every mutation run in a THROWAWAY COPY of the tree (cp -R, never in
 * the worktree), each one asserting the edit really applied before the result was
 * read (guard-hygiene-lint's failure 3). Run 2026-08-21 against this file, on the
 * release that moved the mark out of the scroller. The tree is 41/41 green.
 *
 *   m1  app.css  the `transform: translateY(...)` line DELETED, i.e. the reveal
 *                reverted to the geometry v421 shipped: the mark parked with its
 *                bottom edge on the viewport origin and nothing to move it.
 *                                                       12 FAILED, including
 *       UNDERNOTCH "0 ink px below the status bar at 36px of pull (floor 6000);
 *       first pull with any visible ink: none up to 120px" and its SAMPLE partner
 *       reading "6px:0 12px:0 18px:0 24px:0 36px:0 48px:0 72px:0 120px:0", plus
 *       VISIBLE "0 ink px ... travel 0px measured at capture", CONTROL, both
 *       MECHANISM-adjacent pixel rows, INK, CURVE and all five REACHABLE rows.
 *       THIS IS THE ROW TOM ASKED FOR, GOING RED ON THE THING HE COULD NOT SEE.
 *
 *   m2  app.css + js/app.js  the SHIPPED v421 FEATURE RESTORED VERBATIM:
 *                `.screen--today::before` with `bottom: 100%`, no transform, and
 *                the listener writing --wm-pull back onto #screen.
 *                                                       24 FAILED plus the count
 *       guard: "only 37 checks ran, expected 41", because the four REACHABLE rows
 *       skip themselves when their SAMPLE row finds no mark. Named rows include
 *       MECHANISM "#screen::before content none" going red the other way,
 *       UNDERNOTCH, VISIBLE, TODAY "today:- bonehead:- ..." (the mark is inside a
 *       scroller this file no longer looks in), COST "0 writes", and every REST
 *       geometry row reading null. The regression that shipped three times cannot
 *       pass this file quietly any more.
 *
 *   m3  app.css  `bottom: 100%` -> `bottom: calc(100% - var(--sat))`, i.e. the
 *                mark made VISIBLE AT REST, which is the other half of the
 *                constraint and the v415 regression in a new dress.
 *                                                       12 FAILED: REST in
 *       pixels ("nothing of the mark is on screen"), REST's geometry row, ABOVE,
 *       FAILOPEN, the ON/OFF band-identity row, and REACHABLE at --sat 47, 59 and
 *       59. --sat 0 correctly stays GREEN, because there the mutation is a no-op.
 *       Making the mark reachable did NOT cost the rest-state guarantee; that is
 *       the whole point of moving the reveal into a transform.
 *
 *   m4  app.css  `opacity: var(--wm-pull, 1)` -> `var(--wm-pull, 0)`, the
 *                transparent-by-default trap.            6 FAILED: FAILOPEN, its
 *       SAMPLE partner, and all four REACHABLE rows, which read the rest state at
 *       the fail-open opacity on purpose so a dim mark cannot be graded as a
 *       hidden one.
 *
 *   m5  js/app.js  `still.matches ? 1 :` PUT BACK in the listener, which is how
 *                reduced motion used to be handled and is now a live bug: it pins
 *                --wm-pull, and --wm-pull drives the TRANSFORM.
 *                                                       1 FAILED, REDUCED: "at
 *       pull 0 with reduce: opacity 1, travel 128px". The wordmark parked on
 *       screen forever for anyone who asked for less motion.
 *
 *   m6  app.css  `#app:has(.screen--today)::before` -> `#app::before`, the
 *                selector regression that used to slip through.
 *                                                       1 FAILED, TODAY: "today:
 *       MARK bonehead:MARK progress:MARK foods:MARK friends:MARK settings:MARK".
 *
 * INHERITED PROVE-REDS, from the versions of this file that shipped v414, v415
 * and v421, on rows whose claim has not changed:
 *   app.css  the SHIPPED v415 geometry, `top: calc(-8px - var(--sat))` at 172x46
 *                                                       6 FAILED. REST at --sat 0
 *            read 5,935 ink pixels in the 14px above the first card and a bottom
 *            edge at +38px: on screen at every scroll position on every device
 *            with no top inset.
 *   app.css  opacity: var(--wm-pull, 1) -> .55           8 FAILED: INK mean
 *            rgb(144,137,127) against the cream, both CURVE rows flat at 0.55,
 *            VISIBLE, FAILOPEN, REDUCED and both SAMPLE rows that exist to stop a
 *            dim mark being graded as a bright one.
 *   js/app.js  the bindWordmarkPull() call deleted        3 FAILED: CURVE flat,
 *            COST "0 writes across 200 scroll events", and the reduced-motion
 *            SAMPLE row reading --wm-pull "".
 *   js/app.js  the 1/20 quantisation removed              1 FAILED, COST: 61
 *            writes across 200 scroll events instead of 21.
 *   js/app.js  the classList.toggle('screen--today') line deleted
 *                                                        7 FAILED, including
 *            TODAY and INK "no ink pixels found at all".
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
const FULL = 36;           // js/app.js bindWordmarkPull(): px of pull for a full reveal
const LAND = 66;           // app.css: the travel is --sat + this, so the mark lands
                           // with its TOP edge LAND - MARK_H below the inset
const GAP = LAND - MARK_H; // 4px of clearance between the status bar and the mark

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
/* AND IT SETTLES BEFORE IT READS, WHICH IS NEW AND COST A ROUND TO UNDERSTAND.
   The reveal is SMOOTHED by a 130ms transition now (app.css, added because Tom
   called the un-smoothed version "clunky and glitchy"), so getComputedStyle
   immediately after the scroll event returns the transition's FROM value, not the
   value the pull asks for. Read that way the whole CURVE row came back as the
   fail-open default at every pull: 1.00/0px eight times, which reads like a dead
   listener and is actually a correct one being photographed at t=0. Every row
   that calls this wants the value the eye ENDS on, so the wait belongs here, once,
   rather than in each caller. The rows that assert the smoothing itself are
   SMOOTH/EASED below, and they deliberately do NOT come through this function. */
const WM_TRANS = 130;                 // app.css: the transition on the mark
const WM_SETTLE = WM_TRANS + 110;     // comfortably past it, with a frame to spare
const pullTo = (page, px, hold = false) => page.evaluate(async (d, keep, settle) => {
  const el = document.getElementById('screen');
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => -d });
  el.dispatchEvent(new Event('scroll'));
  await new Promise(r => setTimeout(r, settle));
  const cs = getComputedStyle(document.getElementById('app'), '::before');
  const m = cs.transform.match(/matrix\(([^)]+)\)/);
  if (!keep) delete el.scrollTop;
  return {
    faked: -d, op: parseFloat(cs.opacity),
    ty: m ? parseFloat(m[1].split(',')[5]) : 0,
    varSet: document.documentElement.style.getPropertyValue('--wm-pull'),
  };
}, px, hold, WM_SETTLE);
const releasePull = page => page.evaluate(() => { delete document.getElementById('screen').scrollTop; });
const clearPull = page => page.evaluate(() => document.documentElement.style.removeProperty('--wm-pull'));

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

/* SELECT THE MARK BY DIFFERENCE, NOT BY BRIGHTNESS. Added 2026-08-24.

   stats() above picks "ink" with a luminance threshold whose own constant records
   its premise: INK_LUM 60, "measured backdrop max is 33". True while the strip
   behind the mark is page navy; false the moment the hero art is allowed to bleed
   up behind the status bar, because olive art is far brighter than 60. The INK row
   then reported mean rgb(136,145,91), which is the ART's olive, and called it the
   mark's cream.

   diffStats takes the same strip twice, once with the mark suppressed, and grades
   ONLY the pixels that actually changed. Whatever is behind the mark cancels, so
   the answer is the mark and nothing else, at any backdrop colour. Same idea as
   the byte-identical REST rows and as badge-centre-lib's glyph weighing.

   DELTA 12 rather than 0: PNG is lossless, but the compositor is not bit-exact
   across two captures of a live page (sub-pixel AA on the card edges below drifts
   a channel or two). Measured on this suite: with the mark suppressed the largest
   incidental channel delta anywhere in the strip is 6, and the mark's own pixels
   move 90 or more. 12 sits an order of magnitude below the signal. */
const diffStats = (onB64, offB64) => dec.evaluate(async (a, b, DELTA) => {
  const load = async d => { const i = new Image(); i.src = 'data:image/png;base64,' + d; await i.decode(); return i; };
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  const px = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    return { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height }; };
  const A = px(ia), B = px(ib);
  if (A.w !== B.w || A.h !== B.h) return { err: 'size mismatch', n: 0 };
  let n = 0, sr = 0, sg = 0, sb = 0, top = -1, bottom = -1, maxCh = 0, worstIncidental = 0;
  for (let i = 0; i < A.d.length; i += 4) {
    const dr = Math.abs(A.d[i] - B.d[i]), dg = Math.abs(A.d[i+1] - B.d[i+1]), db = Math.abs(A.d[i+2] - B.d[i+2]);
    const m = Math.max(dr, dg, db);
    if (m <= DELTA) { worstIncidental = Math.max(worstIncidental, m); continue; }
    n++; sr += A.d[i]; sg += A.d[i+1]; sb += A.d[i+2];
    maxCh = Math.max(maxCh, A.d[i], A.d[i+1], A.d[i+2]);
    const y = Math.floor((i / 4) / A.w);
    if (top < 0) top = y;
    bottom = y;
  }
  return { total: A.d.length / 4, n, mean: n ? [sr/n|0, sg/n|0, sb/n|0] : null, top, bottom, maxCh, h: A.h, worstIncidental };
}, onB64, offB64, 12);

/* Capture a strip with the mark suppressed, for diffStats to cancel against. */
const shotNoMark = async clip => {
  await page.evaluate(() => {
    const st = document.createElement('style'); st.id = '__wmX';
    st.textContent = '#app::before{content:none!important}';
    document.head.appendChild(st);
  });
  await sleep(320);
  const b = await shot(clip);
  await page.evaluate(() => document.getElementById('__wmX')?.remove());
  await sleep(320);
  return b;
};

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

/* THE MARK IS #app::before NOW, NOT #screen::before, AND EVERY GEOMETRY ROW HAS
   TO READ IT WHERE IT LIVES. `top` and `height` are the box before the transform;
   `ty` is the translate the rule resolved out of --wm-pull, read off the computed
   matrix rather than recomputed here, so the number comes from the shipped CSS.
   The mark's PAINTED bottom edge is top + h + ty, and every rest/clip row below
   grades that sum and not `top` alone: a mark hidden by the clip and a mark
   driven down past the status bar differ only in ty. */
const geo = () => page.evaluate(() => {
  const el = document.getElementById('screen');
  const app = document.getElementById('app');
  if (!el || !app) return null;
  const cs = getComputedStyle(app, '::before');
  const first = el.firstElementChild?.getBoundingClientRect();
  const m = cs.transform.match(/matrix\(([^)]+)\)/);
  return {
    cls: el.className, content: cs.content,
    top: parseFloat(cs.top), h: parseFloat(cs.height), w: parseFloat(cs.width),
    ty: m ? parseFloat(m[1].split(',')[5]) : (cs.transform === 'none' ? 0 : NaN),
    opacity: parseFloat(cs.opacity), bg: cs.backgroundImage, position: cs.position,
    zIndex: cs.zIndex, events: cs.pointerEvents,
    scrollTop: el.scrollTop, scrollH: el.scrollHeight, clientH: el.clientHeight,
    firstY: first ? Math.round(first.y) : null,
  };
});

const g0 = await geo();
ok('SETUP     Today is up with the mark declared: a ::before with the wordmark as its background',
  !!g0 && /wordmark\.png/.test(g0.bg) && g0.content !== 'none' && g0.w > 0 && g0.h > 0 && Number.isFinite(g0.ty),
  g0 ? `class="${g0.cls}" ${g0.w}x${g0.h} top ${g0.top} ty ${g0.ty} opacity ${g0.opacity} position ${g0.position} z ${g0.zIndex}` : 'no #app/#screen');

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
/* RE-DERIVED 2026-08-24, from a luminance threshold to a DIFFERENCE.

   This counted pixels over INK_LUM (60), a threshold whose own comment records
   where it came from: "measured backdrop max is 33". That held for exactly as
   long as the band above the first card was page navy. It stops holding the
   moment the hero art is allowed to bleed up behind the status bar, because the
   olive backdrop is far brighter than 60, so the ART trips the ink detector and
   the row reports the mark visible at rest when nothing of it is on screen.

   A brightness test cannot tell the mark's cream from bright art behind it. A
   DIFFERENCE can, and it does not care what colour the backdrop is: suppress the
   mark, capture, restore, capture, and require the two to be byte-identical.
   That is the same technique this file already uses at the FROZEN comparison
   further down, and the same one badge-centre-lib uses to weigh a glyph.

   Strictly stronger than what it replaces: the old row allowed any number of
   sub-threshold mark pixels, this one allows none at all. */
const bandNoMark = await (async () => {
  await page.evaluate(() => {
    const st = document.createElement('style');
    st.id = '__wmOff';
    st.textContent = '#app::before{content:none!important}';
    document.head.appendChild(st);
  });
  await sleep(350);
  const b = await band();
  await page.evaluate(() => document.getElementById('__wmOff')?.remove());
  await sleep(350);
  return b;
})();
const bandRest = await band();
ok('REST      at scrollTop 0 the band is byte-identical with the mark suppressed and restored: nothing of it is on screen',
  g0.scrollTop === 0 && bandRest === bandNoMark,
  `scrollTop ${g0.scrollTop}, band ${bandRest === bandNoMark ? 'identical' : 'DIFFERS with the mark present'}`);
/* Finite, THEN above. With the mark absent both numbers come back NaN, which
   JSON turns into null and node adds to 0: `0 <= 0` passed, and the row said
   "bottom 0px" about an element that did not exist. Caught by running the
   prove-red that deletes the class toggle in route(). */
ok('REST      the mark\'s bottom edge sits above the viewport, so #app\'s overflow clip owns it',
  Number.isFinite(g0.top) && Number.isFinite(g0.h) && Number.isFinite(g0.ty) && g0.top + g0.h + g0.ty <= 0,
  `top ${g0.top}px + height ${g0.h}px + translate ${g0.ty}px = bottom ${g0.top + g0.h + g0.ty}px (must be a real number <= 0)`);
/* THE MARK CANNOT TAKE A TAP. RE-DERIVED 2026-08-24, when it moved on top.

   This asserted `zIndex === '-1'`, which tested the MECHANISM rather than the
   property that matters. The mechanism changed on Tom's instruction ("yeah draw
   the wordmark on top of the art instead of behind") because behind the art is
   invisible once the hero bleeds up, and the row would have gone red on a change
   he asked for while telling nobody whether the real risk had appeared.

   The real risk is anti-regression rule 6: an absolutely positioned box over
   content must not be able to swallow a control. At z-index -1 that was true for
   free. At z-index 3 it is true only because of pointer-events: none, so it is
   worth ASKING THE BROWSER rather than reading a declaration. elementFromPoint at
   the mark's own centre, at full pull, must return something that is not the mark.
   PROVE-RED: delete `pointer-events: none` from the rule. */
const hit = await page.evaluate(() => {
  const app = document.getElementById('app');
  const cs = getComputedStyle(app, '::before');
  const r = app.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + 30;
  const el = document.elementFromPoint(cx, cy);
  return { events: cs.pointerEvents, z: cs.zIndex,
           topEl: el ? (el.className || el.tagName).toString().slice(0, 40) : null };
});
ok('REST      the mark cannot take a tap: pointer-events none, and the browser hands taps to what is under it',
  hit.events === 'none' && hit.topEl !== null,
  `pointer-events ${hit.events}, z-index ${hit.z}, tap at the mark's line lands on ${hit.topEl}`);

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
  document.documentElement.style.removeProperty('--wm-pull');
});
await sleep(400);
const sat0 = await page.evaluate(() => {
  const el = document.getElementById('screen');
  const cs = getComputedStyle(document.getElementById('app'), '::before');
  const m = cs.transform.match(/matrix\(([^)]+)\)/);
  return {
    top: parseFloat(cs.top), h: parseFloat(cs.height), op: parseFloat(cs.opacity),
    ty: m ? parseFloat(m[1].split(',')[5]) : (cs.transform === 'none' ? 0 : NaN),
    pad: getComputedStyle(el).paddingTop,
  };
});
ok('SAMPLE    at --sat 0 the mark is at its fail-open opacity, so the pixel row below is grading a mark that would actually paint',
  sat0.op === 1 && Number.isFinite(sat0.top) && sat0.h > 0 && Number.isFinite(sat0.ty),
  `opacity ${sat0.op}, top ${sat0.top}px, height ${sat0.h}px, translate ${sat0.ty}px, .screen padding-top ${sat0.pad}`);
/* Same re-derivation as the REST row above, for the same reason: an ink-pixel
   count in this strip assumes the strip is dark, and it is only dark while the
   hero art stops at the safe-area line. Difference instead of brightness. */
const sat0Strip = { x: 0, y: 0, width: VW, height: PAD };
const sat0Off = await (async () => {
  await page.evaluate(() => {
    const st = document.createElement('style'); st.id = '__wmOff0';
    st.textContent = '#app::before{content:none!important}';
    document.head.appendChild(st);
  });
  await sleep(350);
  const b = await shot(sat0Strip);
  await page.evaluate(() => document.getElementById('__wmOff0')?.remove());
  await sleep(350);
  return b;
})();
const sat0On = await shot(sat0Strip);
ok('REST      at --sat 0 nothing of the mark is on screen at rest: the strip is byte-identical with it suppressed',
  sat0On === sat0Off && Number.isFinite(sat0.top) && sat0.top + sat0.h + sat0.ty <= 0,
  `strip ${sat0On === sat0Off ? 'identical' : 'DIFFERS'}, bottom edge at ${sat0.top + sat0.h + sat0.ty}px (v415 measured +38px here, visible at every scroll position)`);
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
/* CLAMP still matters and it is still about the ENGINE, not about this feature:
   Chromium refuses a negative scrollTop, which is why no headless run can produce
   a rubber band and why the listener has to be driven by a faked getter below.
   ABOVE changed meaning with the mark. It used to subtract scrollTop, because the
   mark was a descendant of the scroller and rode the scrolled layer. It no longer
   is (app.css: nothing above a WKWebView scroller's origin ever paints), so the
   claim is the stronger one: ORDINARY SCROLLING DOES NOT MOVE IT AT ALL. The
   listener sees every one of these scrolls and writes 0 for each, so the mark
   stays clipped at every scroll position and the only thing that can reveal it is
   a negative offset. */
const clamp = await page.evaluate(() => {
  const el = document.getElementById('screen');
  el.scrollTop = -400;
  const after = el.scrollTop;
  const read = () => {
    const cs = getComputedStyle(document.getElementById('app'), '::before');
    const m = cs.transform.match(/matrix\(([^)]+)\)/);
    const ty = m ? parseFloat(m[1].split(',')[5]) : (cs.transform === 'none' ? 0 : NaN);
    return parseFloat(cs.top) + parseFloat(cs.height) + ty;
  };
  const out = [];
  for (const s of [0, 120, 600, 1e6]) {
    el.scrollTop = s;
    out.push({ want: s, got: Math.round(el.scrollTop), bottom: read() });
  }
  el.scrollTop = 0;
  return { negative: after, out };
});
ok('CLAMP     scrollTop cannot be driven negative, so ordinary scrolling can never reach the mark',
  clamp.negative === 0, `set -400, engine reported ${clamp.negative}`);
const notAbove = clamp.out.filter(r => !Number.isFinite(r.bottom) || r.bottom > 0);
ok('ABOVE     at every scroll position the mark stays above the viewport top edge: only a NEGATIVE offset reveals it',
  clamp.out.length === 4 && notAbove.length === 0,
  clamp.out.map(r => `scrollTop ${r.got}: bottom ${Math.round(r.bottom)}px`).join(', '));

/* ---------- MECHANISM ---------- */
/* THIS IS THE ROW THE WHOLE RELEASE EXISTS FOR, AND ITS DIRECTION IS REVERSED
 * FROM THE ONE IT REPLACES.
 *
 * The old MECHANISM row asserted that the mark RIDES THE SCROLLED CONTENT LAYER:
 * "the bounce translates that layer, so a mark that had drifted onto the viewport
 * would sit perfectly still under a pull and reveal nothing." It was a good row
 * about a false premise. Measured on a booted iPhone 17 Pro (iOS 26.5) on
 * 2026-08-21, with the drag HELD open for ~10 seconds so the bounce could be
 * screenshotted while it was happening:
 *   - the bounce is real. scrollTop bottomed out at -168, 33 scroll events fired
 *     with a negative value, and an element inside the scroller moved 168px down
 *     by getBoundingClientRect. `overscroll-behavior: contain` does not stop it.
 *   - and the exposed strip contained NOTHING but the scroller's own background
 *     COLOUR, edge to edge, in a 126pt-deep bounce. Four forms of "parked above
 *     the origin" were in that one page and all four scored zero pixels: a
 *     `::before` at `bottom: 100%`, a real div at `bottom: 100%`, and a
 *     background-image at `center -60px` with `background-attachment: local` and
 *     with `scroll`. WebKit sizes the scrolled-contents layer to the
 *     scrollable-overflow rect, which begins AT the origin, and fills the
 *     rubber-band region from that layer's solid backgroundColor.
 * So riding the scrolled layer is not the mechanism, it is the bug: three
 * releases shipped a mark that could not have appeared however far Tom pulled.
 * The mark is `#app::before` now and the reveal is a transform off --wm-pull.
 * These rows fail if anyone puts it back inside the scroller, which is the
 * regression that has already shipped three times. */
const inScroller = await page.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('screen'), '::before');
  return { content: cs.content, bg: cs.backgroundImage, w: parseFloat(cs.width) };
});
ok('MECHANISM the mark is NOT painted inside the scroller: content above a WKWebView scroller\'s content origin never appears in the rubber-band strip, measured on device',
  !/wordmark/.test(inScroller.bg) && !/url\(/.test(inScroller.bg),
  `#screen::before content ${inScroller.content}, background-image ${inScroller.bg}`);

/* THE CONTENT DISPLACEMENT IS THE ONLY THING SIMULATED NOW. A rubber band moves
   the scroller's flow content down by the pull; that is reproduced with padding.
   The MARK is deliberately NOT displaced by this harness: it moves by its own
   shipped rule off --wm-pull, so these rows go red if that rule changes, instead
   of grading a constant this file chose (the trap caught on 2026-08-21). */
const contentPull = px => `#screen{padding-top:calc(var(--sat) + ${PAD}px + ${px}px) !important}`;
const PIN = await page.addStyleTag({ content: ':root{--wm-pull:1 !important}' });
const DISP = await page.addStyleTag({ content: contentPull(BOUNCE) });
await sleep(500);
/* The window starts at --sat, because above that the phone paints its own status
   bar over whatever is there, and stops just short of where the displaced first
   card lands. Everything between is backdrop at rest (the REST rows measure 0 ink
   there), so ink in it is the wordmark and nothing else. */
const clip = { x: 0, y: SAT, width: VW, height: PAD + BOUNCE - 2 };
/* diffStats, not stats: the brightness selector reads olive hero art as ink once
   the scene is allowed to bleed up behind the status bar. See diffStats. */
const at0 = await diffStats(await shot(clip), await shotNoMark(clip));
ok(`CONTROL   the sampler is not blind: at a full pull the mark puts thousands of ink pixels into the same band the REST rows graded as empty, and its top edge lands ${GAP}px BELOW the inset`,
  at0.n > 4000 && at0.n < 200000 && Math.abs(css(at0.top) - GAP) <= 3,
  `${at0.n} px over lum ${INK_LUM}, first ink row y=${css(at0.top)}css inside a clip that starts at --sat (want ${GAP})`);
/* Scrolling must not move it. This is the same claim ABOVE makes off geometry,
   made again in PIXELS, and it is the one that goes red if the mark is put back
   in the scroller: in there its ink would shift by exactly -DELTA. */
await page.evaluate(d => { document.getElementById('screen').scrollTop = d; }, DELTA);
await sleep(400);
const atD = await stats(await shot(clip));
await page.evaluate(() => { document.getElementById('screen').scrollTop = 0; });
await sleep(300);
const shift = css(atD.top - at0.top);
ok(`MECHANISM the mark does not ride the scrolled layer: ${DELTA}px of scroll moves its ink by ZERO px, because it is not in the layer the bounce translates`,
  atD.n > 4000 && shift === 0,
  `ink first row ${css(at0.top)}css -> ${css(atD.top)}css, shift ${shift}px (want 0; inside the scroller this reads -${DELTA})`);

/* ---------- INK ---------- */
/* Same capture, graded on colour, and the direction of this row was REVERSED in
   the release that made the mark unmistakable (see the header). It used to pin the
   revealed mark to --text-3 with a brightness CEILING of 200, i.e. a rule that
   said "this must stay dim", which is the thing Tom rejected in words. It now
   requires the opposite, with a brightness FLOOR. Measured both ways: opacity 1
   gives mean rgb(230,219,192) and brightest channel 255; the .55 the old row
   demanded gives mean ~(143,133,120) and never clears 200. */
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
await PIN.evaluate(n => n.remove());
await clearPull(page);
await sleep(300);

/* ---------- UNDERNOTCH: what is visible BELOW the status bar ---------- */
/* THE ROW THAT LETS TOM SEE IT. GRADED, 2026-08-21.
 *
 * Tom, on the third release: "you claimed twice that scrolling down on today
 * showed a boneheadz logo above behind scroll. it doesnt and youve never actually
 * got this right despite claiming you did multiple times." Then, on the fourth:
 * "i still have not been able to see the wordmark after scrolling at any time or
 * update despite what you say so fix that shit." He is the ground truth and this
 * file was green through all of it.
 *
 * WHAT IT WAS GREEN ABOUT. Every geometry row measured the pull at which the
 * mark's bottom edge crossed y = 0, THE VIEWPORT'S TOP EDGE. On the phone Tom
 * holds that is not where the screen starts being visible: the app ships
 * `viewport-fit=cover` with a black-translucent status bar, so the top
 * env(safe-area-inset-top) of the viewport is UNDER the system status bar, and on
 * a 17-class phone the Dynamic Island is a physical cutout ~125x37pt sitting dead
 * centre in that strip, exactly where a 232px-wide centred wordmark rides in.
 * Arriving at y = 0 and being VISIBLE were 62px apart and this file measured the
 * first while reporting the second. Every pixel row, meanwhile, graded a 240px
 * displacement, 6.7x the pull js/app.js calls full, in a window chosen to clear
 * the first card, which put it far below the inset by accident.
 *
 * WHY IT WAS DOWNGRADED TO A PRINTED NUMBER ON THE PREVIOUS RELEASE, AND WHY THAT
 * IS OVER. It was written as an assertion, went red, and blocked the v421 gate.
 * The reasoning for downgrading it was that app.css recorded a decision ("it is
 * not worth an unreachable peek") and a guard must not wire a disagreement with a
 * settled decision into the release gate. That reasoning was sound and the
 * decision it deferred to was wrong twice over: Tom has now overridden it in
 * words, and the mechanism it was defending could not have worked at all (see the
 * MECHANISM block: nothing above a WKWebView scroller's origin paints). So the
 * row is graded again, app.css records the override, and the geometry moved to
 * meet it rather than the other way round.
 *
 * IT IS DRIVEN BY THE REAL LISTENER AT REAL PULL DISTANCES. Nothing here pins
 * --wm-pull: each step fakes the negative scrollTop, dispatches a real scroll
 * event, and lets js/app.js decide the reveal, so the fade curve and the travel
 * curve are both the shipped ones. The content is displaced by the same pull with
 * padding, because a real bounce moves the flow content too and the mark sits
 * BEHIND it (z-index -1); grading the mark against a card that had not moved
 * would under-count it exactly where the card overlaps.
 *
 * NOT A SIMULATION OF THE BOUNCE, AND IT DOES NOT NEED TO BE. What it asserts is
 * the ARITHMETIC OF THE OCCLUSION: wherever the rubber band takes the layer, the
 * top --sat of the viewport is not visible, and the mark now has to be below it. */
const PULLS = [6, 12, 18, 24, FULL, 48, 72, 120];
const underInk = [];
for (const P of PULLS) {
  const d = await page.addStyleTag({ content: contentPull(P) });
  await pullTo(page, P, true);        // held: the listener resets to 0 the moment it is released
  await sleep(260);
  /* THE WINDOW STOPS AT THE FIRST CARD, WHICH THE DISPLACEMENT PUTS AT
     --sat + PAD + P, minus 2px so a border or a shadow cannot be counted as the
     mark. Its top edge is the inset: above that the phone paints its own status
     bar over whatever is there. Everything between is backdrop at rest (the REST
     rows measure 0 ink there), so ink in it is the wordmark and nothing else.
     Caught by running this row: a window that reached the card read 92,468 "ink"
     pixels at a SIX pixel pull, where the mark's bottom edge is 43px ABOVE the
     inset and cannot have contributed one of them. That is the same green
     Bonehead panel that fooled the first CONTROL row, and it would have graded a
     mark that never painted at all as a triumph. The mark sits BEHIND the card
     (z-index -1), so what this counts is only what a person can actually see. */
  const s = await stats(await shot({ x: 0, y: SAT, width: VW, height: PAD + P - 2 }));
  underInk.push({ P, n: s.n });
  await releasePull(page);
  await d.evaluate(n => n.remove());
}
await clearPull(page);
await sleep(200);
const VIS_MIN = 200;        // ink pixels below the inset that count as "any of it is showing"
const FULL_MIN = 6000;      // and what "he cannot miss it" costs at the pull the fade calls full
const FIRST_INK_MAX = 24;   // px of pull that may pass before ANY of it is visible. Ratchet DOWN only.
const firstSeen = underInk.find(u => u.n >= VIS_MIN);
const atFullPull = underInk.find(u => u.P === FULL);
/* SAMPLE: at the largest pull the strip MUST be full of ink, or this row's numbers
   are a blind sampler and not an occlusion. Same trap the CONTROL row exists for. */
ok(`SAMPLE    the under-the-notch sampler is not blind: at ${PULLS[PULLS.length - 1]}px of pull the strip below --sat is full of ink`,
  underInk[underInk.length - 1].n > 2000,
  underInk.map(u => `${u.P}px:${u.n}`).join(' '));
ok(`UNDERNOTCH at the ${FULL}px pull js/app.js calls FULL, thousands of the mark's pixels are BELOW the status bar at --sat ${SAT}, and the first of them arrives by ${FIRST_INK_MAX}px`,
  !!atFullPull && atFullPull.n >= FULL_MIN && !!firstSeen && firstSeen.P <= FIRST_INK_MAX,
  `${atFullPull ? atFullPull.n : 'no'} ink px below the status bar at ${FULL}px of pull (floor ${FULL_MIN}); first pull with any visible ink: ` +
  `${firstSeen ? firstSeen.P + 'px' : 'none up to ' + PULLS[PULLS.length - 1] + 'px'}. ` +
  `The three releases before this one read 0 here at ${FULL}px, first ink at 76px and whole at 124px, because the mark was pinned to the viewport origin and ` +
  `a mark whose bottom edge is pinned there cannot clear an inset of ${SAT} until the pull exceeds ${SAT}. Sweep: ${underInk.map(u => `${u.P}px:${u.n}`).join(' ')}`);

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
const travels = curve.every((c, i) => i === 0 || c.ty >= curve[i - 1].ty - 1e-9);
ok('CURVE     opacity AND travel are functions of PULL DISTANCE, read back off the real listener, and both only ever increase with the pull',
  curve[0].op === 0 && curve[0].ty === 0 && monotonic && travels && curve.every(c => Number.isFinite(c.op) && Number.isFinite(c.ty)),
  curve.map(c => `${-c.faked}px:${c.op.toFixed(2)}/${c.ty.toFixed(0)}px`).join(' '));
const atFull = curve.find(c => -c.faked === FULL);
ok(`CURVE     by ${FULL}px of pull it is at FULL opacity and has travelled its whole ${SAT + LAND}px, so the mark is lit AND clear of the status bar: v414 and v415 both capped at .55 and Tom saw neither`,
  atFull.op === 1 && Math.abs(atFull.ty - (SAT + LAND)) <= 0.5 && curve.find(c => -c.faked === 18).op >= 0.45,
  `${FULL}px -> opacity ${atFull.op} travel ${atFull.ty}px (want ${SAT + LAND}), 18px -> ${curve.find(c => -c.faked === 18).op}, 4px -> ${curve.find(c => -c.faked === 4).op} (a jitter-sized pull stays near invisible on purpose)`);

/* ---------- EASED: the SHAPE of that curve, not just its endpoints ---------- */
/* Tom, on v421, the first build where this mark could paint at all: "it is very
   clunky and glitchy, there is no easing involved in the movement and it feels
   cheap the way you've rigged it up".
   Everything above passes on a LINEAR mapping, which is exactly what v421 shipped:
   both endpoints are the same either way. So this row grades the middle of the
   curve against the straight line between them, at both ends, and the bounds are
   measured rather than invented. js/app.js runs the pull through smoothstep
   (t*t*(3-2t)) and quantises to twentieths, so:
        pull   linear (v421)   smoothstep (now)   bound here
         4px       0.10             0.05           <= 0.06
         9px       0.25             0.15           <= 0.20
        27px       0.75             0.85           >= 0.80
   Every bound is red on linear and green with margin on smoothstep. The FIRST two
   are the "quiet under a jitter-sized tug" half and the third is the "decelerates
   into its landing" half; a curve that only satisfied one of them is not eased,
   it is offset. Nothing here re-derives the arithmetic: the numbers are read back
   off the shipped listener through pullTo. */
const qAt = px => curve.find(c => -c.faked === px).op;
ok('EASED     the reveal is SHAPED, not linear: quiet under a jitter-sized tug, and decelerating into its landing. v421 tracked the finger 1:1 and Tom called it cheap',
  qAt(4) <= 0.06 && qAt(9) <= 0.20 && qAt(27) >= 0.80,
  `4px -> ${qAt(4)} (linear would be 0.10, bound 0.06), 9px -> ${qAt(9)} (linear 0.25, bound 0.20), 27px -> ${qAt(27)} (linear 0.75, bound 0.80)`);

/* ---------- SMOOTH: PIXELS OVER TIME, off the real control ---------- */
/* THE OTHER HALF OF TOM'S NOTE, AND THE HALF NO CSS VALUE CAN ANSWER. --wm-pull is
   quantised to twentieths (the COST row is why: without it a bounce writes a custom
   property once per frame), so the travel used to arrive in 6.4px steps, one per
   scroll event, and that stepping is the "glitchy". Measured on the shipped v421
   through a 380ms driven ramp, off compositor frames: 18 distinct rendered
   positions across 40 frames with 22 of them repeating the previous position, i.e.
   the mark was frozen in place for more than half the frames it was moving. The
   same ramp after the fix: 36 distinct positions across 39 frames, 3 repeats.
   THE TEST IS THE REPO'S OWN RULE FOR TRANSITIONS: fire the real control, sample
   the value over time, and require INTERMEDIATE values. Two distinct values across
   the window means it snapped. So this fires ONE scroll event that jumps the pull
   straight from nothing to FULL and watches what the compositor actually paints:
   an unsmoothed mark teleports and scores 2, a smoothed one is caught in flight.
   FRAMES, NOT getComputedStyle. A CSS box reads perfectly over a blank frame
   (tally/CLAUDE.md), and this whole feature is three releases deep in marks that
   measured fine and painted nothing, so the position is the lowest INK ROW in the
   top ${SMOOTH_BAND} css px of a real frame. */
const SMOOTH_BAND = 200;
/* Screencast frames come back at CSS scale, not at the viewport's
   deviceScaleFactor: measured 430x932 out of a 430x932x2 viewport. Reading the
   device scale here put the band 400 rows deep, which reached the displaced
   content and pinned every "position" at the band's own floor. */
const bandBottom = b64 => dec.evaluate(async (data, lum, band) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + data; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, Math.min(c.height, band)).data;
  let n = 0, bottom = -1;
  for (let i = 0; i < d.length; i += 4) {
    if (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] <= lum) continue;
    n++; bottom = Math.floor((i / 4) / c.width);
  }
  return { n, bottom };
}, b64, INK_LUM, SMOOTH_BAND);

/* Displace the flow content the way a real bounce does, so the whole travel band
   is backdrop and the mark is measurable across all of it, and still the idle
   Bonehead first: it is the only other thing on Today that moves. */
const SMO = await page.addStyleTag({ content: contentPull(BOUNCE) });
const SMOA = await page.addStyleTag({ content: '.bh-anim,.bh-anim *{animation:none !important}' });
await pullTo(page, 0);
await sleep(300);
const scFrames = [];
const cdp = await page.createCDPSession();
/* THE FRAME'S OWN TIMESTAMP IS KEPT, because the LINEAR row below grades the
   transition's SHAPE and a shape needs a clock. metadata.timestamp is the frame
   swap time in epoch SECONDS, which is the same clock Date.now() reads, so the
   scroll event's own fire time (taken INSIDE the page, so the CDP round trip
   cannot land in the middle of the window) lines up with it directly. */
cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
  scFrames.push({ data, t: metadata.timestamp * 1000 });
  try { await cdp.send('Page.screencastFrameAck', { sessionId }); } catch { /* stopped */ }
});
await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
await sleep(400);
const warm = scFrames.length;
scFrames.length = 0;
/* THE REAL CONTROL: one scroll event on #screen, which is what the production
   listener is bound to. Not a call to anything this feature owns. */
const firedAt = await page.evaluate(d => {
  const el = document.getElementById('screen');
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => -d });
  el.dispatchEvent(new Event('scroll'));
  return Date.now();
}, FULL);
await sleep(500);
await cdp.send('Page.stopScreencast').catch(() => {});
const smoPos = [], smoT = [];
for (const f of scFrames) { const s = await bandBottom(f.data); smoPos.push(s.n ? s.bottom : null); smoT.push(f.t - firedAt); }
await releasePull(page);
await SMO.evaluate(n => n.remove());
await SMOA.evaluate(n => n.remove());
await clearPull(page);
await sleep(300);
const landed = smoPos.filter(v => v !== null);
const END = SAT + LAND - MARK_H + 0;      // the mark's box lands with its top here
const finalPos = landed.length ? landed[landed.length - 1] : null;
/* ---------- LINEAR: the SHAPE of that smoothing, which is the v424 report ----
 * Tom, 2026-08-22, on a build where the two SMOOTH rows below were already
 * green: "the boneheadz watermark when you scroll to reveal the top under the
 * game exits in a jolty fashion as if it's not enough FPS."
 *
 * SO THE SMOOTHING EXISTED AND WAS STILL WRONG, and the rows above cannot see
 * the difference: they ask whether the mark is caught in flight, and it was.
 * What was wrong is the timing FUNCTION. This is a scroll-linked value, so the
 * transition restarts on every scroll event, and an ease-out restarted mid-flight
 * resets to its FASTEST velocity each time: fast-slow, fast-slow, which is what
 * reads as dropped frames. app.css carries the release measurement (frame
 * velocity CV 0.53-0.66 on ease-out against 0.28-0.34 on linear) and why neither
 * paint cost nor deleting the transition was the answer.
 *
 * GRADED HERE AS THE CURVE ITSELF, NOT AS THE RELEASE, on purpose. The release
 * numbers separate cleanly but they are frame-timing statistics and this repo has
 * paid for clock-dependent guards twice. The curve is deterministic: ONE scroll
 * event, ONE transition, and the shape of the travel it paints is a property of
 * the timing function and of nothing else.
 *
 * PIXELS, and the SAME pixels the rows above grade: progress is the mark's own
 * ink row in a compositor frame divided by where that ink finally lands, so a
 * frame that painted nothing scores 0 rather than scoring well.
 *
 * THE STATISTIC IS A RATIO OF TWO HALVES OF ITSELF, and the first version was
 * not, which cost a round. A trapezoidal mean anchored on the scroll event read
 * 0.37 on a correct linear build (the first painted frame lands 20-45ms after
 * the event, and that is start LATENCY, not curve shape), and re-anchoring it on
 * the last empty FRAME still read 0.61 against a 0.62 bound, because the frame
 * before the first visible one is not the true zero crossing and every ms of
 * that gap biases the answer toward failing. Comparing the travel's own first
 * half against its own second half has no anchor to get wrong: a constant
 * velocity scores 1.0 whatever the offset, whatever the frame rate, and however
 * many frames were dropped.
 *
 * DIRECTION AND BOUND, because "not linear" has two sides and only one of them is
 * the bug. ABOVE 1 is front-loaded, which is the defect: cubic-bezier(.33,1,.68,1)
 * is 0.87 of the way home at half time, so its first half runs 3 to 7 times the
 * speed of its second. Below 1 would be an ease-IN, which nobody has shipped here
 * but which would read as the mark lurching at the end, so it fails too. Measured
 * on this tree across three runs: 1.17, 1.18 and 1.34 with `linear`, against
 * 2.87 and 3.13 with the shipped bezier put back and a bound of 1.9. */
const LIN_LO = 0.55, LIN_HI = 1.9;
const prog = smoPos.map((v, i) => ({ t: smoT[i], p: finalPos ? Math.min(1, (v || 0) / finalPos) : 0 }))
  .filter(f => Number.isFinite(f.t)).sort((a, b) => a.t - b.t);
const iLast = prog.findIndex(f => f.p >= 0.98);
const iFirst = prog.findIndex(f => f.p >= 0.02);
const inWindow = iFirst >= 0 && iLast > iFirst ? prog.slice(iFirst, iLast + 1) : [];
/* p at an arbitrary time, straight-line between the two frames either side of it */
const pAt = t => {
  for (let i = 1; i < inWindow.length; i++) {
    if (inWindow[i].t < t) continue;
    const a = inWindow[i - 1], b = inWindow[i];
    return b.t === a.t ? b.p : a.p + (b.p - a.p) * (t - a.t) / (b.t - a.t);
  }
  return inWindow.length ? inWindow[inWindow.length - 1].p : null;
};
let ratio = null;
if (inWindow.length >= 6) {
  const a = inWindow[0], z = inWindow[inWindow.length - 1], mt = (a.t + z.t) / 2, mp = pAt(mt);
  const s1 = (mp - a.p) / (mt - a.t), s2 = (z.p - mp) / (z.t - mt);
  ratio = s2 > 0 ? s1 / s2 : Infinity;
}
ok(`SAMPLE    the ${WM_TRANS}ms transition was photographed while it ran, so the shape row below is grading a curve and not an empty window`,
  inWindow.length >= 6 && ratio !== null && finalPos !== null,
  `${inWindow.length} frames from first ink to arrival, spanning ${inWindow.length >= 2 ? Math.round(inWindow[inWindow.length - 1].t - inWindow[0].t) : 0}ms, final ink row ${finalPos}`);
ok('LINEAR    the smoothing holds a CONSTANT velocity: a scroll-linked transition restarts on every event, so an ease-out resets to full speed each time and the travel arrives as a fast-slow sawtooth. Tom, on that build: "exits in a jolty fashion as if it\'s not enough FPS"',
  ratio !== null && ratio >= LIN_LO && ratio <= LIN_HI,
  `the travel's first half runs ${ratio === null ? 'n/a' : (Number.isFinite(ratio) ? ratio.toFixed(2) : 'inf')}x the speed of its second (linear is 1.00, want ${LIN_LO}-${LIN_HI}; the shipped ease-out measured 2.9-3.1 here): ${inWindow.map(f => `${Math.round(f.t - inWindow[0].t)}ms:${f.p.toFixed(2)}`).join(' ')}`);
ok(`SMOOTH    SAMPLE the compositor really produced frames of this transition and the mark really arrived: warm-up ${warm}, ${scFrames.length} graded frames, ending with the mark on screen`,
  warm > 0 && scFrames.length >= 6 && finalPos !== null && finalPos >= END,
  `${scFrames.length} frames, positions ${landed.slice(0, 12).join(',')}${landed.length > 12 ? '...' : ''}, final ${finalPos} css px (floor ${END})`);
/* STRICTLY BETWEEN. The two endpoints are what a SNAP also produces, so they are
   excluded by construction and the bound is on what is left. Measured: 8 with the
   transition, 0 without it. */
const mid = [...new Set(landed.filter(v => v > 0 && v < finalPos))];
ok('SMOOTH    the mark is CAUGHT IN FLIGHT: one scroll event that jumps the pull from nothing to full paints intermediate positions instead of teleporting. v421 quantised to twentieths and snapped between them, which is the "glitchy"',
  mid.length >= 3,
  `${mid.length} distinct intermediate positions between 0 and ${finalPos}: ${mid.sort((a, b) => a - b).join(',')}. A snap scores 0 here (both endpoints are excluded on purpose)`);

/* FAILOPEN. The one way a JS-driven reveal ships blank: the listener never runs
   (a WebView that does not report the negative offset, a boot that threw before
   bindWordmarkPull) and the CSS default is transparent. Third attempt at this
   feature, so the default is asserted, not assumed. Clearing the inline property
   is exactly the state before the first scroll event. */
const failopen = await page.evaluate(() => {
  document.documentElement.style.removeProperty('--wm-pull');
  const cs = getComputedStyle(document.getElementById('app'), '::before');
  const m = cs.transform.match(/matrix\(([^)]+)\)/);
  const ty = m ? parseFloat(m[1].split(',')[5]) : (cs.transform === 'none' ? 0 : NaN);
  return { op: parseFloat(cs.opacity), ty, bottom: parseFloat(cs.top) + parseFloat(cs.height) + ty };
});
/* AND BE HONEST ABOUT WHAT THIS BUYS NOW. `var(--wm-pull, 0)` on the opacity is
   the transparent-by-default trap that shipped invisible before, so the default
   stays loud and this row still goes red on it. What it no longer buys is a
   working feature on a WebView that never reports the negative offset: the reveal
   is a TRANSFORM now, whose default is 0, so a listener that never fires means no
   reveal. The old block claimed the opacity default made a silent no-op
   "impossible"; it never did, because the geometry it fell back on could not
   paint at all. What retires that risk is the device measurement in the MECHANISM
   block: the negative offset IS reported and the listener DOES fire. */
ok('FAILOPEN  with --wm-pull never set the mark is at FULL opacity and fully outside the clip: the only thing that hides it at rest is geometry, never a transparent default',
  failopen.op === 1 && failopen.ty === 0 && failopen.bottom <= 0,
  `opacity ${failopen.op}, translate ${failopen.ty}px, bottom edge ${failopen.bottom}px`);

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
  rmBase.op === 0 && rmBase.varSet === '0' && rmBase.ty === 0, `opacity ${rmBase.op}, --wm-pull "${rmBase.varSet}", travel ${rmBase.ty}px`);
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
const rm = await page.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('app'), '::before');
  const m = cs.transform.match(/matrix\(([^)]+)\)/);
  return { op: parseFloat(cs.opacity), ty: m ? parseFloat(m[1].split(',')[5]) : (cs.transform === 'none' ? 0 : NaN) };
});
const rmDur = await page.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('app'), '::before');
  return { dur: cs.animationDuration, name: cs.animationName, iter: cs.animationIterationCount, trans: cs.transitionDuration };
});
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
await sleep(250);
/* AND THE TRAVEL MUST NOT BE PINNED WITH IT, which is new and is the trap the old
   mechanism hid. Reduced motion used to be handled by pinning --wm-pull itself to
   1 in the listener, which was harmless while the mark was clipped no matter what
   the variable said. It is not harmless now: --wm-pull drives the TRANSFORM, so
   pinning it would park the wordmark permanently on screen for every player who
   asked for less motion, the moment anything scrolled. So the pin moved to a
   media query on the OPACITY only, and this row asserts both halves: lit at a
   zero pull, and still at a zero pull. */
ok('REDUCED   under prefers-reduced-motion the fade is dropped (opacity pinned to 1) while the TRAVEL still tracks the pull, and the feature declares no animation for the global duration collapse to act on',
  rm.op === 1 && rm.ty === 0 && rmDur.name === 'none' && rmDur.iter === '1',
  `at pull 0 with reduce: opacity ${rm.op}, travel ${rm.ty}px (must be 0: a pinned travel would park the mark on screen); animation-name ${rmDur.name}, duration ${rmDur.dur}, iterations ${rmDur.iter}, transition ${rmDur.trans}`);

/* COST. A scroll listener on this element is the one thing that could make the
   feature expensive, and "it is quantised" is a comment until something counts.
   Counts STYLE WRITES rather than milliseconds: deterministic, and it is the
   write that costs, not the arithmetic. 200 distinct pull values across the full
   range may produce at most 21 writes (0 through 1 in twentieths). */
const cost = await page.evaluate(async n => {
  const el = document.getElementById('screen');
  const root = document.documentElement;
  let writes = 0;
  const real = root.style.setProperty.bind(root.style);
  root.style.setProperty = (...a) => { if (a[0] === '--wm-pull') writes++; return real(...a); };
  let d = 0;
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => -d });
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { d = (i / n) * 120; el.dispatchEvent(new Event('scroll')); }
  const ms = performance.now() - t0;
  delete el.scrollTop;
  delete root.style.setProperty;
  return { writes, ms, n };
}, 200);
ok('COST      the listener is quantised for real: 200 distinct pull values produce at most 21 style writes, so a bounce cannot write a custom property once per frame',
  cost.writes > 1 && cost.writes <= 21,
  `${cost.writes} writes across ${cost.n} scroll events, ${cost.ms.toFixed(1)}ms total (${(cost.ms / cost.n).toFixed(3)}ms per event, no layout read but scrollTop)`);

/* ---------- VISIBLE: pixels, at the pull the curve says is full ---------- */
/* The money row, and the one whose absence let v414 and v415 pass this file.
   It is simpler than it was, because the mark no longer has to be smuggled out of
   an overflow clip to be photographed: it lands on the viewport by its own rule.
   Nothing is pinned. The listener sets the opacity AND the travel from a faked
   negative scrollTop, the content is displaced by the same pull the way a real
   bounce displaces it, and the capture is the strip below the status bar. */
const VIS = await page.addStyleTag({ content: contentPull(FULL) });
await pullTo(page, FULL, true);      // held: see pullTo's note
await sleep(400);
/* The opacity that goes into the row is re-read AT CAPTURE TIME, not the one
   pullTo returned before the sleep. That is the whole lesson of the black band. */
const visGeo = await geo();
/* Same card rule as UNDERNOTCH: from the mark's top edge down to just short of
   where the displaced first card lands. The mark's lower rows are behind the card
   and are not Tom's to see, so they are not counted. */
/* VISIBLE stays on the brightness selector, and that is a KNOWN LIMIT rather than
   an oversight. The difference technique that fixed REST and INK returns 0 here:
   both captures come back with no mark in them, and re-asserting the pull between
   them did not change that, so something about this row's state does not survive
   the style swap. I did not isolate it.
   CONSEQUENCE, stated plainly: this row is sound while the strip behind the mark
   is dark, which is every shipped configuration today. It is the one row that
   still blocks un-gating the island bleed (?island), because olive art in the
   strip inflates its count. Whoever un-gates that owns fixing this row first. */
/* DIFFERENCE, like REST and INK, and getting here took one wrong conclusion that
   is worth writing down.

   When this first moved to diffStats it returned 0 changed pixels and I called it
   a harness failure: "both captures come back with no mark, the held pull must be
   decaying". That was wrong. Measured afterwards at this exact point, with the
   scene NOT bleeding, all four ways of suppressing the mark (content, opacity,
   background-image, display) change the same 22,566 pixels. The technique was
   never the problem.

   The 0 was a REAL READING. It was measured with the island bleed un-gated, and
   the mark is `#app::before` at z-index -1, i.e. BEHIND the screen's content. Let
   the hero art start at y=0 and at full pull that opaque art sits over the strip
   the mark travels into, so suppressing the mark changes nothing because the mark
   is not on screen. The bleed hides it.

   The brightness selector could not say that. It counted 75,680 "ink" pixels in
   the same state and passed the mark off as visible, because olive art clears
   INK_LUM 60 just as cream does. So the old row did not merely tolerate the
   conflict, it CONCEALED it, and the honest reading only appears once the pixels
   are attributed to the mark rather than to whatever is bright.

   This row is therefore the one that says out loud what x425/css found and left in
   a comment: the island bleed and the overscroll reveal are incompatible while the
   mark paints behind the world. Un-gating ?island needs the mark lifted above the
   art, not a looser threshold here. */
const visClip = { x: 0, y: SAT + GAP, width: VW, height: PAD + FULL - GAP - 2 };
const visOn = await shot(visClip);
await page.evaluate(() => {
  const st = document.createElement('style'); st.id = '__wmV';
  st.textContent = '#app:has(.screen--today)::before{content:none!important}';
  document.head.appendChild(st);
});
await pullTo(page, FULL, true); await sleep(400);
const visNoMark = await shot(visClip);
await page.evaluate(() => document.getElementById('__wmV')?.remove());
await pullTo(page, FULL, true); await sleep(400);
const vis = await diffStats(visOn, visNoMark);
const visOff = vis.mean ? CREAM.map((c, i) => Math.abs(vis.mean[i] - c)) : null;
ok(`VISIBLE   a ${FULL}px pull puts thousands of bright wordmark pixels on screen BELOW the status bar: not merely present, VISIBLE`,
  visGeo.opacity === 1 && Math.abs(visGeo.ty - (SAT + LAND)) <= 0.5
  && vis.n > 6000 && !!visOff && Math.max(...visOff) <= 50 && vis.maxCh >= 240,
  `${vis.n} ink px in the ${PAD + FULL - GAP - 2}px of the mark that is clear of the first card, starting ${GAP}px below --sat ${SAT}; opacity ${visGeo.opacity} and travel ${visGeo.ty}px measured at capture, mean rgb(${vis.mean ? vis.mean.join(',') : 'none'}), brightest ${vis.maxCh}`);
await releasePull(page);
await VIS.evaluate(n => n.remove());
await clearPull(page);
await sleep(300);

/* ---------- TODAY ONLY ---------- */
const tabs = ['today', 'bonehead', 'progress', 'foods', 'friends', 'settings'];
const seen = [];
for (const t of tabs) {
  await page.evaluate(h => { location.hash = '#/' + h; }, t);
  await sleep(1500);
  seen.push({ t, ...await page.evaluate(() => {
    const el = document.getElementById('screen');
    const cs = getComputedStyle(document.getElementById('app'), '::before');
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

/* ---- REACHABLE. The assertion this file was missing for two releases, and it is
   TWO-SIDED against the INSET now rather than against the viewport origin.
   The ceiling used to be "the mark's bottom edge reaches y = 0 within 1px of
   pull", which is the number that was green while Tom saw nothing: y = 0 is under
   the status bar. The floor is unchanged in spirit and is the v415 regression:
   the mark must not already be on screen at rest, at ANY inset, --sat 0 included,
   where the shipped v415 rule welded 38 of its 46px to the top of Today forever.
   So, per inset:
     FLOOR    with --wm-pull unset (the state before the first scroll event, and
              the loudest opacity this feature has) the mark's bottom edge is at
              or above 0, so the clip owns every pixel of it.
     CEILING  at a full pull its TOP edge is at least --sat, so the whole mark is
              clear of the status bar and the Dynamic Island on every phone.
   Both are measured off getComputedStyle including the resolved transform, so a
   change to the travel expression moves them. */
/* RE-ENABLE FIRST. The section above deliberately strips .screen--today to
   measure the feature OFF, and never puts it back, so a naive read here finds no
   pseudo-element at all and every bound below passes vacuously on a null. That is
   the same empty-sample trap this file's own SAMPLE rows exist to catch. */
await page.evaluate(() => document.getElementById('screen').classList.add('screen--today'));
await clearPull(page);
await sleep(300);
/* --sat 0 IS IN THE LIST, and it is the inset that mattered most: v415 read
   `top: calc(-8px - var(--sat))` at height 46, so its bottom edge sat at 38 - sat,
   above the origin on a notched phone (Tom saw nothing) and 38px BELOW it with no
   inset. Every inset this file used to grade was non-zero, which is how a rule
   with a live regression on one whole class of device passed 25 of 25. */
const INSETS = [[390, 844, 0], [390, 844, 47], [393, 852, 59], [440, 956, 59]];
const clearances = [];
let reachChecked = 0;
for (const [W, H, sat] of INSETS) {
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluate(v => document.documentElement.style.setProperty('--sat', v + 'px'), sat);
  await sleep(400);
  const g = await page.evaluate(() => {
    const app = document.getElementById('app');
    if (!document.querySelector('.screen--today')) return null;
    const read = () => {
      const cs = getComputedStyle(app, '::before');
      const m = cs.transform.match(/matrix\(([^)]+)\)/);
      return {
        top: parseFloat(cs.top), h: parseFloat(cs.height), op: parseFloat(cs.opacity),
        ty: m ? parseFloat(m[1].split(',')[5]) : (cs.transform === 'none' ? 0 : NaN),
      };
    };
    document.documentElement.style.removeProperty('--wm-pull');
    const rest = read();
    document.documentElement.style.setProperty('--wm-pull', 1);
    const full = read();
    document.documentElement.style.removeProperty('--wm-pull');
    return { rest, full };
  });
  /* SAMPLE REACH: no element, no pseudo, or a zero-height mark makes every bound
     below pass for free. */
  ok(`SAMPLE    ${W}x${H} --sat ${sat}: there is a wordmark with real geometry to measure, at rest and at a full pull`,
    !!g && Number.isFinite(g.rest.top) && g.rest.h > 0 && Number.isFinite(g.rest.ty) && Number.isFinite(g.full.ty),
    JSON.stringify(g));
  if (!g || !Number.isFinite(g.rest.top) || !(g.rest.h > 0) || !Number.isFinite(g.full.ty)) continue;
  reachChecked++;
  const restBottom = g.rest.top + g.rest.h + g.rest.ty;
  const fullTop = g.full.top + g.full.ty;
  clearances.push(fullTop - sat);
  ok(`REACHABLE ${W}x${H} --sat ${sat}: nothing at rest, and at a full pull the WHOLE mark is below the status bar`,
    g.rest.op === 1 && restBottom <= 0 && fullTop >= sat,
    `at rest the bottom edge is ${restBottom.toFixed(0)}px at the fail-open opacity ${g.rest.op} (v415 measured +38px here, on screen at every scroll position); at a full pull the top edge is ${fullTop.toFixed(0)}px, ${(fullTop - sat).toFixed(0)}px below the inset (v414/v415/v421 all landed it ABOVE the inset, which is why Tom saw nothing)`);
}
/* SAME ON EVERY PHONE. The travel contains --sat on purpose now (that is the
   occlusion the feature has to clear), so what has to be identical is the
   CLEARANCE it buys, not the raw offset. This row is what stops the travel
   drifting into an expression that lands the mark differently per device. */
ok(`REACHABLE the clearance below the status bar at a full pull is IDENTICAL on every inset (${GAP}px), so no phone gets a worse reveal than another`,
  clearances.length === INSETS.length && new Set(clearances.map(v => v.toFixed(1))).size === 1 && Math.abs(clearances[0] - GAP) <= 0.5,
  `clearance per inset: ${clearances.map(v => v.toFixed(0) + 'px').join(', ')}`);
ok('SAMPLE    every inset in the class was measured, so the bounds above mean something',
  reachChecked === INSETS.length, `${reachChecked} of ${INSETS.length}`);

await dec.close();
await browser.close();
if (srv) srv.close();

const failed = results.filter(r => !r.pass);
/* 44. UNDERNOTCH is a GRADED row again (it was downgraded to a printed number for
   one release; the block at that line carries why, and why that is over), and the
   release that moved the mark out of the scroller added the two rows that would
   have caught the dead mechanism: MECHANISM "not painted inside the scroller" and
   REST "behind the content and not hit-testable". Restoring the v421 rule verbatim
   drops this to 40, because the REACHABLE rows skip themselves when their SAMPLE
   row finds no mark, so the count guard goes red on that regression too.
   41 -> 44 on 2026-08-21 with EASED and the two SMOOTH rows. Everything that was
   here before this passes on the LINEAR, UNSMOOTHED v421 reveal, which is the
   version Tom called "clunky and glitchy": this file graded where the mark ends
   up and never once graded how it gets there. */
if (results.length < 44) { console.log(`\nFAIL: only ${results.length} checks ran, expected 44`); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join(', ')); process.exit(1); }
console.log('overscroll-wordmark-audit clean');
