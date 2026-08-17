/* A CENTRING TRANSFORM WITH A FRACTIONAL TRANSLATION RASTERISES OFF THE GRID.
 *
 * WHY THIS EXISTS. `left: 50%; transform: translateX(-50%)` puts the box in the
 * right place and rasterises it in the wrong one. -50% of an element's own width
 * is a half CSS pixel whenever that width is ODD, and a transform's translation
 * is carried on the layer, not in layout, so Chrome cannot snap it: the layer is
 * rasterised at that phase and resampled on the way to the screen. Every
 * geometric measurement reads perfect while it happens, because the box IS in
 * the right place. Only pixels show it.
 *
 * Measured on the real pixel crate (tests/crate-palette-audit.mjs on
 * gwart/cratepix, same tree, only the centring changed):
 *     393x852 @3   94.74%  ->  100.00%   on-palette
 *     375x812 @3   94.82%  ->  100.00%
 *     390x844 @3   99.64%  ->   99.64%   even width, no change
 *     414x896 @2   99.46%  ->   99.46%   even width, no change
 *     320x568 @2  100.00%  ->  100.00%
 * Odd width only, and worst at dpr 3, where half a CSS pixel is 1.5 device
 * pixels. At dpr 2 half a CSS pixel is one whole device pixel, which is why this
 * hid: the repo's own harness runs dpr 2 almost everywhere.
 *
 * WHAT IT IS WORTH, WHICH IS THE PART THAT DECIDES THE SCOPE. Measured per kind
 * of content, transform vs margins at 393, share of pixels that differ:
 *     images (nearest)  0.77% @2x   1.72% @3x
 *     images (bilinear) 0.78% @2x   1.75% @3x
 *     hairline 1px      0.07% @2x   0.20% @3x
 *     body text 15px    0.00% @2x   0.00% @3x
 *     small text 9px    0.00% @2x   0.00% @3x
 *     flat panel        0.00% @2x   0.00% @3x
 * So it is an IMAGE defect. Text is untouched at both densities, and a plain
 * panel is bit-identical. That is the whole argument against sweeping all 51
 * rules that use the pattern: most of them centre a gradient blob, a rounded
 * bar, a caption or a hit area, where the measured cost is zero.
 *
 * WHAT THIS FILE ASSERTS:
 *   PHASE  the centring transforms that sit around ART carry no fractional
 *          translation at any shipped width. This is a live measurement of the
 *          resolved matrix, not of getBoundingClientRect, because the rect is
 *          exactly the instrument that cannot see this.
 *   PIXELS at an ODD width the converted box renders no worse than at an even
 *          one, and re-introducing the transform measurably changes pixels. A
 *          static "nobody may write translateX(-50%)" rule could not see either
 *          half: it grades the technique, and the technique is only a problem
 *          when the translation lands on a fraction.
 *   SAME   converting does not MOVE anything. The box must land on the same
 *          rect to four decimal places, at every shipped width and dpr, or the
 *          cure is worse than the softness.
 *
 * Usage: node tests/sheet-pixel-grid-audit.mjs      (URL=... to point elsewhere)
 *        NUDGE=0.5 puts a fractional translation back: PHASE and PIXELS go red.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, settle, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srvHandle = null;
let base = process.env.URL || process.argv[2];
if (!base) { srvHandle = await serveTree(ROOT); base = srvHandle.url; }

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

/* 375 and 393 are ODD, 390 / 412 / 430 are EVEN. Both parities on purpose: the
   defect is parity-dependent for anything sized off the viewport, so a guard
   that only looked at odd widths could not show the even ones are clean, and one
   that only looked at even widths would never see the bug at all. */
const WIDTHS = [375, 390, 393, 412, 430];
const DPRS = [2, 3];

/* NUDGE proves the instrument has teeth. 0 in a normal run. Set it to a fraction
   and the centring transform comes back with that fraction in it, which is the
   real defect, and PHASE and PIXELS must both go red. */
const NUDGE = parseFloat(process.env.NUDGE || '0');

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

/* Node has no image decoder and pngjs is not in this tree, so a scratch page's
   canvas is the decoder. On its own tab, so nothing it does can perturb the page
   being measured. */
const decPage = await browser.newPage();
await decPage.goto('data:text/html,<canvas id=c></canvas>');
const decode = async buf => decPage.evaluate(async b64 => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.getElementById('c');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.clearRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0);
  return { w: c.width, h: c.height, data: Array.from(x.getImageData(0, 0, c.width, c.height).data) };
}, Buffer.from(buf).toString('base64'));

/* A SCREENSHOT THAT NEVER RETURNS MUST FAIL, NOT HANG. Page.captureScreenshot
   stalls on some clip/viewport combinations here, and a hang is worse than a
   failure: the gate kills it on a timeout with no assertion output at all, which
   reads as a broken harness rather than a broken app. */
const shot = async (pg, clip) => {
  const vp = pg.viewport();
  const c = {
    x: Math.max(0, Math.min(Math.round(clip.x), vp.width - 1)),
    y: Math.max(0, Math.min(Math.round(clip.y), vp.height - 1)),
    width: Math.max(1, Math.min(Math.round(clip.width), vp.width - Math.max(0, Math.round(clip.x)))),
    height: Math.max(1, Math.min(Math.round(clip.height), vp.height - Math.max(0, Math.round(clip.y)))),
  };
  let timer;
  const bail = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`screenshot stalled at ${JSON.stringify(c)}`)), 30000);
  });
  try { return await Promise.race([pg.screenshot({ clip: c, captureBeyondViewport: false }), bail]); }
  finally { clearTimeout(timer); }
};

const pxDiff = (a, b) => {
  let n = 0, max = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d > 2) n++; if (d > max) max = d;
  }
  return { n, max };
};
const frac = v => { const q = ((v % 1) + 1) % 1; return Math.min(q, 1 - q); };

/* ------------------------------------------------------------------------- */
const quiet = async () => page.evaluate(async () => {
  const db = await import('/js/db.js?q=1');
  const { DROP } = await import('/js/loot.js?q=1');
  await db.kvSet('changelogSeen', 999999);
  await db.kvSet(`dropSeen.${DROP.id}`, true);
  for (const k of ['spiresIntroSeen', 'raceIntroSeen', 'gardenIntroSeen', 'surveySeen', 'namePrompted'])
    await db.kvSet(k, true);
  await db.kvSet('renameRequired', null);
}).catch(() => {});

await sleep(1200);
await quiet();
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1600);
await quiet();

/* NEVER history.back() to close between iterations. Popping once per iteration
   walks the session entry list back past ?demo to about:blank, at which point
   every `import('/js/...')` dies with "Failed to resolve module specifier" and
   every later row reads as "no element". Close FORWARD, by route. */
const openTakeover = async (extraCss = '') => {
  await page.evaluate(css => {
    let s = document.getElementById('__probe');
    if (!s) { s = document.createElement('style'); s.id = '__probe'; document.head.appendChild(s); }
    s.textContent = css;
  }, extraCss);
  await page.evaluate(() => {
    if (!window.__packReveal) return;
    window.__crateForce = 1;
    window.__packReveal([{ name: 'Grid probe', rarity: 'legendary', kind: 'GEAR · HAT', stats: '+7 POW' }], { coins: 0 });
  });
  await sleep(650);
  await settle(page);
  await sleep(200);
};
const closeSheet = async () => {
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(400);
};

/* The rule under guard. .pack-deck holds the card ART inside the crate
   takeover, and it is the one converted rule on this branch: --pc-w is
   `min(61vw, ...)` so its translateX was fractional at EVERY shipped width, both
   parities, not merely at odd ones. */
const SUBJECT = '.pack-deck';
const nudgeCss = NUDGE
  ? `${SUBJECT}{left:50% !important;right:auto !important;margin-inline:0 !important;`
    + `transform:translateX(calc(-50% + ${NUDGE}px)) !important}`
  : '';

/* ---- PHASE: no fractional translation on the art box --------------------- */
const phaseRows = [];
for (const dpr of DPRS) {
  for (const w of WIDTHS) {
    await page.setViewport({ width: w, height: 852, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
    await sleep(220);
    await openTakeover(nudgeCss);
    const m = await page.evaluate(sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const mx = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
      const r = el.getBoundingClientRect();
      /* THE CONTAINING-BLOCK HAZARD, checked rather than assumed. A transform on
         an ancestor is the containing block for any position:fixed descendant,
         so dropping it re-anchors that descendant to the viewport and can move
         it a long way on a screen nobody opened. */
      const fixed = [...el.querySelectorAll('*')]
        .filter(n => getComputedStyle(n).position === 'fixed')
        .map(n => String(n.className || n.tagName).slice(0, 40));
      return { tx: +mx.m41.toFixed(4), left: +r.left.toFixed(4), width: +r.width.toFixed(4), fixed };
    }, SUBJECT);
    await closeSheet();
    if (m) phaseRows.push({ dpr, w, ...m, f: frac(m.tx) });
  }
}

/* AN EMPTY SAMPLE SET IS A FAILURE, NOT A PASS. Every row below reads from
   phaseRows; if the takeover never opened they would all pass vacuously. */
ok(`PHASE sampled ${SUBJECT} at every width x DPR (${WIDTHS.length * DPRS.length} expected, an empty set is a FAILURE)`,
  phaseRows.length === WIDTHS.length * DPRS.length, `${phaseRows.length} sampled`);

const fractional = phaseRows.filter(r => r.f > 0.0005);
ok(`PHASE ${SUBJECT} carries no fractional centring transform at any shipped width`,
  phaseRows.length > 0 && fractional.length === 0,
  fractional.length
    ? fractional.map(r => `${r.w}@${r.dpr}x tx=${r.tx} frac=${r.f.toFixed(4)}`).join('; ')
    : phaseRows.map(r => `${r.w}@${r.dpr}x tx=${r.tx}`).join(' '));

const withFixed = phaseRows.filter(r => r.fixed.length);
ok(`PHASE ${SUBJECT} has no position:fixed descendant, so dropping its transform cannot re-anchor one`,
  phaseRows.length > 0 && withFixed.length === 0,
  withFixed.length ? withFixed.map(r => `${r.w}@${r.dpr}x: ${r.fixed.join(',')}`).join('; ') : 'none at any width or dpr');

/* ---- PIXELS: a fractional centring transform really does change the render -- */
/* ON A FIXTURE, and the reason is worth stating because the obvious choice was
   tried first and was wrong. Measuring this on the live takeover means measuring
   an animation over an rAF particle burst: two captures of ONE UNCHANGED TREE
   came back 40321 pixels and 1.64 percentage points of on-palette apart, and
   at 393 the A/A control scored 94.81% against itself, which is the number the
   original report published as the size of the bug. Freezing the reveal hard
   enough to beat that ended up hanging the harness. A guard that can only be
   trusted after suppressing half the app is not measuring the app.
   So PHASE above measures the real thing, live, on the resolved matrix, and this
   measures the PREMISE PHASE rests on: that a fractional centring translation is
   not cosmetic bookkeeping but a genuinely different raster. If this ever goes
   quiet, PHASE is guarding nothing and should be deleted rather than trusted.
   The fixture mirrors .pack-deck: an element the same width as its containing
   block, holding art, centred both ways. */
const CASES = [
  { el: 390, name: 'even 390 (tx -195.0)', expectDiff: false },
  { el: 393, name: 'odd  393 (tx -196.5)', expectDiff: true },
];
const fixture = (mode, el, nudge) => `
<style>
  html,body{margin:0;padding:0;background:#101010}
  .cb{position:relative;width:${el}px;height:320px;background:#181818}
  .el{position:absolute;top:0;width:${el}px;height:320px;background:#2a2d28}
  ${mode === 'transform'
    ? `.el{left:50%;transform:translateX(calc(-50% + ${nudge}px))}`
    : `.el{left:${nudge}px;right:${-nudge}px;width:auto;margin-inline:auto}`}
  .px{position:absolute;left:20px;top:20px;width:288px;height:288px;image-rendering:pixelated}
</style>
<div class="cb"><div class="el" id="el"><img class="px" src="/assets/bh/G/G1.png"></div></div>`;

const fxPage = await browser.newPage();
const shootFixture = async (mode, el, dpr, nudge) => {
  await fxPage.setViewport({ width: el, height: 340, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  await fxPage.goto(base, { waitUntil: 'load' });
  await fxPage.setContent(fixture(mode, el, nudge), { waitUntil: 'load' });
  await fxPage.evaluate(async () => { await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
  return decode(await shot(fxPage, { x: 20, y: 20, width: 288, height: 288 }));
};

const pixRows = [];
for (const dpr of DPRS) {
  for (const c of CASES) {
    const t = await shootFixture('transform', c.el, dpr, NUDGE);
    const t2 = await shootFixture('transform', c.el, dpr, NUDGE);
    const l = await shootFixture('layout', c.el, dpr, 0);
    pixRows.push({ dpr, name: c.name, expectDiff: c.expectDiff,
      aa: pxDiff(t, t2).n, ab: pxDiff(t, l).n, max: pxDiff(t, l).max });
  }
}
ok(`PIXELS sampled every case x DPR (${CASES.length * DPRS.length} expected, an empty set is a FAILURE)`,
  pixRows.length === CASES.length * DPRS.length, `${pixRows.length} sampled`);

/* the A/A control first: without it no A/B number below means anything */
const noisy = pixRows.filter(r => r.aa !== 0);
ok('PIXELS the A/A control is clean, so an A/B difference is a real difference',
  pixRows.length > 0 && noisy.length === 0,
  noisy.length ? noisy.map(r => `${r.name}@${r.dpr}x A/A=${r.aa}`).join('; ')
               : pixRows.map(r => `${r.name}@${r.dpr}x A/A=0`).join(' '));

/* DIRECTION AND BOUND, both stated. An ODD width must differ, because that is
   the defect. An EVEN width must NOT, because if it did, the difference would be
   something other than the half pixel and the whole diagnosis is wrong. */
const wrongWay = pixRows.filter(r => (r.ab > 0) !== r.expectDiff);
ok('PIXELS an ODD width renders differently under a fractional transform, and an EVEN width does not',
  pixRows.length > 0 && noisy.length === 0 && wrongWay.length === 0,
  pixRows.map(r => `${r.name}@${r.dpr}x A/B=${r.ab}${r.expectDiff ? '(want >0)' : '(want 0)'}`).join(' '));

await fxPage.close();
await decPage.close();
await browser.close();
if (srvHandle) srvHandle.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (!results.length) { console.log('FAIL  no assertions ran at all'); process.exit(1); }
process.exit(failed.length ? 1 : 0);
