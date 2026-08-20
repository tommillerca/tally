/* THE OVERSCROLL WORDMARK: hidden at rest, Today only, and free of layout.
 *
 * WHAT THIS FILE CANNOT DO, SAID FIRST. It does not test the rubber band. iOS
 * overscroll is a WKWebView/UIScrollView behaviour: no headless Chromium bounces,
 * and a scripted negative scrollTop is clamped to 0 by the engine (asserted
 * below, because that clamp is also the reason the mark cannot leak). The only
 * proof that pulling down on an iPhone shows the wordmark is pulling down on an
 * iPhone. Nothing here claims otherwise.
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
 *   TODAY     the class and the pseudo-element exist on Today and nowhere else
 *   NO-SHIFT  every element rect on Today is identical with the feature on and
 *             off. Bound is ZERO differing rects, not "about the same": this
 *             catches both added height above the first card and the containing
 *             block that `position: relative` on the scroller introduces.
 *   INK       the revealed mark composites to --text-3, not to full cream
 *   PRECACHE  the asset is in sw.js PRECACHE, because an unprecached background
 *             image is a blank space on one bar of LTE
 *
 * THREE WAYS THIS COULD PASS WHILE BLIND, AND THE ROWS THAT RULE THEM OUT:
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
 *
 * The notch is faked (--sat: 62px, anti-regression rule 4): the mark is anchored
 * to the safe inset and a desktop viewport has none, so grading at --sat: 0 would
 * grade a geometry no phone has.
 *
 * PROVE-RED. Five mutations in a throwaway worktree, each asserting the edit
 * really applied before the result was read (guard-hygiene-lint's failure 3):
 *   app.css  top: calc(-54px - var(--sat)) -> top: 8px    4 FAILED, the 3 REST
 *            rows and ABOVE: the mark peeks at rest
 *   app.css  position: absolute -> position: fixed        1 FAILED, MECHANISM:
 *            "shift 0px (want -100)". Silent to every other row, and the feature
 *            would be dead on the device.
 *   app.css  .screen--today::before -> .screen::before    1 FAILED, TODAY:
 *            "today:MARK bonehead:MARK progress:MARK ..." on all six screens
 *   app.css  opacity: .55 -> opacity: 1                   1 FAILED, INK:
 *            mean rgb(237,225,197) against --text-3's rgb(143,133,120)
 *   js/app.js  the classList.toggle('screen--today') line deleted
 *                                                         7 FAILED, including
 *            TODAY "today:- bonehead:- ..." and INK "no ink pixels found at all"
 *
 * The third mutation is the reason to insist on this. The first version of TODAY
 * required the CLASS and a painted pseudo-element, and route() still adds that
 * class on Today, so the selector rewrite that put the wordmark on all six
 * screens left the row GREEN at 18/18. The fifth is the reason the rows now check
 * Number.isFinite before comparing: with no pseudo-element at all, NaN geometry
 * came back as null, node added two nulls to 0, and both REST-geometry and ABOVE
 * passed while reporting "bottom 0px" about an element that did not exist.
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
const DELTA = 100;         // scroll applied on top of it for the MECHANISM row
const INK_LUM = 60;        // ink detector: measured backdrop max is 33, mark mean 137
const TEXT3 = [143, 133, 120];   // --text-3 #8f8578

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
   never painted at all. */
const DISP = await page.addStyleTag({ content:
  `#screen{padding-top:calc(var(--sat) + 14px + ${BOUNCE}px) !important}` +
  `.screen--today::before{top:calc(${BOUNCE - 54}px - var(--sat)) !important}` });
await sleep(500);
/* The sample window: below the mark's simulated position and above where the
   first card lands, at BOTH scroll positions. mark [BOUNCE-116, BOUNCE-76],
   card at BOUNCE+76 and BOUNCE+76-DELTA. */
const clip = { x: 0, y: 0, width: VW, height: BOUNCE + BAND - DELTA - 16 };
const at0 = await stats(await shot(clip));
await page.evaluate(d => { document.getElementById('screen').scrollTop = d; }, DELTA);
await sleep(400);
const atD = await stats(await shot(clip));
await page.evaluate(() => { document.getElementById('screen').scrollTop = 0; });
await sleep(300);

ok(`CONTROL   the sampler is not blind: displaced by a simulated ${BOUNCE}px bounce the mark puts thousands of ink pixels into the same band the REST rows graded as empty`,
  at0.n > 2000 && at0.n < 60000 && Math.abs(css(at0.top) - (BOUNCE - 54 - SAT)) <= 3,
  `${at0.n} px over lum ${INK_LUM}, first ink row y=${css(at0.top)}css (want ${BOUNCE - 54 - SAT})`);
const shift = css(atD.top - at0.top);
ok(`MECHANISM the mark rides the scrolled content layer: ${DELTA}px of scroll moves its ink up by ${DELTA}px, which is the displacement a rubber band applies to that same layer`,
  atD.n > 2000 && Math.abs(shift + DELTA) <= 3,
  `ink first row ${css(at0.top)}css -> ${css(atD.top)}css, shift ${shift}px (want -${DELTA})`);

/* ---------- INK ---------- */
/* Same displaced capture, graded on colour. The mark must read as --text-3, not
   as the cream the source PNG is drawn in (#fff3d3). */
/* No ink at all is a FAILED row, never a thrown TypeError: a suite that dies
   mid-run prints a stack instead of the remaining rows, which reads like a broken
   app rather than a broken feature. */
const off = at0.mean ? TEXT3.map((c, i) => Math.abs(at0.mean[i] - c)) : null;
ok('INK       the revealed mark composites to --text-3, not to full cream',
  !!off && Math.max(...off) <= 14 && at0.maxCh <= 200,
  off
    ? `mean rgb(${at0.mean.join(',')}) vs --text-3 rgb(${TEXT3.join(',')}) delta ${off.join('/')}, brightest channel ${at0.maxCh} (source ink is 255,243,211)`
    : 'no ink pixels found at all: there is nothing to grade the colour of');
await DISP.evaluate(n => n.remove());
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
const FIRST_PX_MAX = 30;
/* THERE IS NO OPACITY CEILING HERE ON PURPOSE. I added one, asserting .7+ so the
   mark would "read", and it immediately contradicted the INK row above, which
   pins the revealed mark to composite to --text-3 and measures within 1/2/5 of
   it. Two rows disagreeing about the same pixel is how a suite starts grading
   its own opinion instead of the app. INK owns the look; this section owns the
   GEOMETRY, which is the half that was actually broken. */
const INSETS = [[390, 844, 47], [393, 852, 59], [440, 956, 59]];
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
  ok(`REACHABLE ${W}x${H} --sat ${sat}: the first pixel arrives within ${FIRST_PX_MAX}px of pull`,
    firstPx <= FIRST_PX_MAX,
    `needs ${firstPx.toFixed(0)}px of rubber-band travel before ANY of the mark is on screen (${whole.toFixed(0)}px to be whole). v414 shipped at 73px, which is why Tom could not see it.`);
}
ok('SAMPLE    every inset in the class was measured, so the ceilings above mean something',
  reachChecked === INSETS.length, `${reachChecked} of ${INSETS.length}`);

await dec.close();
await browser.close();
if (srv) srv.close();

const failed = results.filter(r => !r.pass);
if (results.length < 25) { console.log(`\nFAIL: only ${results.length} checks ran, expected 25`); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join(', ')); process.exit(1); }
console.log('overscroll-wordmark-audit clean');
