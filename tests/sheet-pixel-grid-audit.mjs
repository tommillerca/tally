/* THE SHEET PIXEL GRID, AND THE CENTRING TECHNIQUE THAT DOES NOT AFFECT IT.
 *
 * WHY THIS EXISTS. A report came in that `.sheet` centring itself with
 * `left: 50%; transform: translateX(-50%)` draws its whole subtree a half device
 * pixel off the grid at an ODD viewport width (393, 375), because a transform is
 * a compositor offset Chrome cannot snap; that it measures as 94.80% of pixels
 * on-palette on the crate takeover against 100.00% once switched to layout
 * centring; and that the 50 rules in app.css using this pattern therefore need a
 * sweep. Every part of that is checkable, and this file is what checks it.
 *
 * It came back negative on three independent counts, any one of which alone
 * kills the sweep. All three are asserted below rather than written down,
 * because a note in a file rots and a hunch this specific will come back:
 *
 *   GRID   `.sheet` is `width: 100%; max-width: 600px`. Below 600 the element
 *          width EQUALS its containing block, so `left: 50%` (+vw/2) and
 *          `translateX(-50%)` (-vw/2) cancel EXACTLY. Measured left is 0.000 at
 *          375, 390, 393, 412 and 430, at DPR 2 and DPR 3. The viewport's parity
 *          never enters into it: what matters is the difference between the
 *          element's width and its containing block's, not the viewport's.
 *          A half pixel appears only ABOVE the 600px clamp at an odd viewport
 *          (601 -> 0.5, 701 -> 50.5), which no phone this app ships to has.
 *
 *   SAME   The mechanism does not exist. Chrome folds a static translate into
 *          the paint offset and snaps it exactly as it snaps a layout offset.
 *          Transform-centred and layout-centred render BYTE-IDENTICAL, over
 *          pixel art, a 1px hairline and 9px text, at whole / half / quarter
 *          device-pixel offsets. This is the assertion that retires the sweep:
 *          if a future Chrome ever makes the two differ, this row goes red and
 *          the question is genuinely open again.
 *
 *   NOISE  The 94.80% was the noise floor. The crate reveal is an animation
 *          (crSink, crDrop, crSettle, crLid, crBloom) over an FX particle burst,
 *          and it does not repeat frame for frame. Capturing it TWICE off one
 *          unchanged tree scores 94.81% against itself at 393 - the reported
 *          number, with nothing changed. Frozen, it scores 100.00% both ways.
 *          So this file measures the takeover with the reveal FROZEN, and
 *          asserts the A/A control is clean before it trusts any A/B number.
 *
 * WHAT IS ACTUALLY WORTH GUARDING is the property the sweep was meant to buy and
 * which the app already has: the sheet, and the art inside it, land on whole
 * device pixels at the widths the app ships to. That is GRID and SHARP. They are
 * pixel measurements, not geometry reads, because the whole premise of the
 * report was that geometry cannot see this - which is true of a real subpixel
 * offset, and is why a static "nobody may write translateX(-50%)" check would
 * have been theatre: it can only see the technique, and the technique is not
 * what makes pixels soft. The OFFSET is. Fractional widths are where offsets
 * come from in this app (--pc-w is `min(61vw, ...)`), not centring.
 *
 * Usage: node tests/sheet-pixel-grid-audit.mjs      (URL=... to point elsewhere)
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

/* The app's real viewports. 375/393/431 are odd, 390/412/430 are even, which is
   the axis the report said mattered. Both parities are here on purpose: a guard
   that only looks where the bug was claimed cannot show the bug is absent. */
const WIDTHS = [375, 390, 393, 412, 430];
const DPRS = [2, 3];

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

/* Node has no image decoder and pngjs is not in this tree, so a scratch page's
   canvas is the decoder. Kept on its own tab so nothing it does can perturb the
   page under measurement. */
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

/* ON-PALETTE, the crate work's own metric: the share of opaque pixels whose
   exact RGB appears in the reference render's colour set. Bilinear resampling of
   art invents colours that are in neither source, so this falls the moment a
   raster lands off the device-pixel grid - and it falls just as hard when the
   two frames are simply different frames, which is the trap this file exists to
   keep anyone from falling into twice. */
const paletteOf = im => {
  const s = new Set();
  for (let i = 0; i < im.data.length; i += 4)
    if (im.data[i + 3] >= 250) s.add((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2]);
  return s;
};
const onPalette = (im, pal) => {
  let t = 0, h = 0;
  for (let i = 0; i < im.data.length; i += 4) {
    if (im.data[i + 3] < 250) continue;
    t++; if (pal.has((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2])) h++;
  }
  return t ? (h / t) * 100 : 0;
};
const colours = im => paletteOf(im).size;
const pxDiff = (a, b) => {
  let n = 0, max = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.max(Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    if (d > 2) n++; if (d > max) max = d;
  }
  return { n, max };
};
const frac = v => { const f = ((v % 1) + 1) % 1; return Math.min(f, 1 - f); };

/* ---- GRID: the real sheet lands on whole device pixels ------------------- */
/* A sheet, opened the way the app opens one, at every shipped width and DPR. */
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
   every later row reads as "no sheet". Close FORWARD, by route. */
const openTakeover = async () => {
  await page.evaluate(() => {
    if (!window.__packReveal) return;
    window.__packReveal([{ name: 'Grid probe', rarity: 'legendary', kind: 'GEAR · HAT', stats: '+7 POW' }], { coins: 0 });
  });
  await sleep(420);
  await settle(page);
  await sleep(160);
};
const closeSheet = async () => {
  await page.evaluate(() => { location.hash = '#/today'; });
  await sleep(380);
};

const gridRows = [];
for (const dpr of DPRS) {
  for (const w of WIDTHS) {
    await page.setViewport({ width: w, height: 852, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
    await sleep(220);
    await openTakeover();
    const m = await page.evaluate(d => {
      const s = document.querySelector('.sheet');
      if (!s) return null;
      const r = s.getBoundingClientRect();
      return { left: +r.left.toFixed(4), width: +r.width.toFixed(4), devLeft: +(r.left * d).toFixed(4) };
    }, dpr);
    await closeSheet();
    if (m) gridRows.push({ dpr, w, ...m, off: frac(m.devLeft) });
  }
}

/* AN EMPTY SAMPLE SET IS A FAILURE, NOT A PASS. Every row below reads from
   gridRows; if the takeover never opened, all of them would vacuously pass. */
ok(`GRID sampled every width x DPR (${WIDTHS.length * DPRS.length} expected, an empty set is a FAILURE)`,
  gridRows.length === WIDTHS.length * DPRS.length,
  `${gridRows.length} sampled`);

const offGrid = gridRows.filter(r => r.off > 0.001);
ok('GRID .sheet lands on a WHOLE device pixel at every shipped width, odd ones included',
  gridRows.length > 0 && offGrid.length === 0,
  offGrid.length
    ? offGrid.map(r => `${r.w}@${r.dpr}x left=${r.left} dev=${r.devLeft}`).join('; ')
    : gridRows.map(r => `${r.w}@${r.dpr}x=${r.left}`).join(' '));

/* The REASON it lands whole, asserted so a future `width: 92%` cannot quietly
   take it away while GRID still passes on one lucky viewport. */
const notFull = gridRows.filter(r => r.width !== r.w && r.w <= 600);
ok('GRID the sheet fills its containing block below the 600px clamp, which is WHY the two halves cancel',
  gridRows.length > 0 && notFull.length === 0,
  notFull.map(r => `${r.w} -> ${r.width}`).join('; ') || 'width === viewport at every sampled width');

/* ---- SHARP: an odd width rasterises no softer than an even one ----------- */
/* THE ODD-WIDTH PIXEL MEASUREMENT. Two assertions, and the shape of each one
   matters more than the fact that it reads pixels.

   EDGE is the direct one: at an odd viewport, is the sheet's painted left edge a
   clean one-device-pixel step, or is it a two-pixel ramp? That is precisely what
   a half-pixel offset does to an edge, and it is free of every confound. It has
   to be sampled ABOVE the 600px clamp, because below it the sheet spans the
   viewport and has no left edge to look at - which is itself the reason there is
   nothing to fix at 375 or 393.

   STILL is the control. The report's instrument was an on-palette percentage on
   the crate takeover, and the takeover is an animation over an FX particle
   burst. Frozen, it must agree with itself to the byte. If it does not, no
   on-palette number taken off this surface means anything, which is exactly how
   94.80% got mistaken for a finding.

   Deliberately NOT asserted: "393 rasterises the card art as sharply as 390".
   It reads like the obvious test and it is junk, because --pc-w is `min(61vw,
   ...)`: the card is 237.90 wide at 390 and 239.73 at 393, so the art is SCALED
   differently and the colour counts differ for a reason that has nothing to do
   with the pixel grid. A guard cannot tell those two apart, so it must not
   pretend to. */
const rampPixels = im => {
  /* Walk each row; the two ends are the plateaus either side of the edge. Count
     pixels that sit strictly between them, which is the blend a half-pixel
     offset creates and a snapped edge does not. */
  const L = i => 0.2126 * im.data[i] + 0.7152 * im.data[i + 1] + 0.0722 * im.data[i + 2];
  const med = xs => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  let ramp = 0;
  for (let y = 0; y < im.h; y++) {
    const row = [];
    for (let x = 0; x < im.w; x++) row.push(L((y * im.w + x) * 4));
    const a = med(row.slice(0, 4)), b = med(row.slice(-4));
    const lo = Math.min(a, b) + 3, hi = Math.max(a, b) - 3;
    if (hi <= lo) continue;                    // no edge in this row, nothing to grade
    for (const v of row) if (v > lo && v < hi) ramp++;
  }
  return ramp;
};

const shootEdge = async (w, dpr, nudge) => {
  await page.setViewport({ width: w, height: 900, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  await sleep(220);
  await page.evaluate(n => {
    let s = document.getElementById('__nudge');
    if (!s) { s = document.createElement('style'); s.id = '__nudge'; document.head.appendChild(s); }
    s.textContent = n ? `.sheet{transform:translateX(calc(-50% + ${n}px)) !important}` : '';
  }, nudge);
  await openTakeover();
  const geo = await page.evaluate(() => {
    const s = document.querySelector('.sheet');
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { l: r.left, t: r.top, w: r.width };
  });
  if (!geo || geo.l < 8) { await closeSheet(); return null; }
  /* well below the 22px top radius, where the edge is a straight vertical line */
  const clip = { x: Math.floor(geo.l) - 5, y: Math.floor(geo.t) + 60, width: 11, height: 24 };
  const im = await decode(await page.screenshot({ clip, captureBeyondViewport: false }));
  await closeSheet();
  return im;
};

/* NUDGE proves this instrument has teeth. 0 in a normal run; a fraction of a
   pixel makes EDGE and SAME go red, because a genuine subpixel offset IS the
   defect class the report was reaching for. Reintroducing the transform does NOT
   make either go red, and that is the finding. */
const NUDGE = parseFloat(process.env.NUDGE || '0');

const edgeOdd = await shootEdge(701, 2, NUDGE);
const edgeEven = await shootEdge(700, 2, NUDGE);
ok('EDGE the sheet edge could be sampled at all (an empty sample is a FAILURE)',
  !!(edgeOdd && edgeEven), `odd=${!!edgeOdd} even=${!!edgeEven}`);
if (edgeOdd && edgeEven) {
  const ro = rampPixels(edgeOdd), re = rampPixels(edgeEven);
  ok('EDGE at an ODD viewport the sheet edge is a clean one-device-pixel step, not a two-pixel ramp',
    ro === 0, `701 ramp pixels = ${ro} (even control 700 = ${re})`);
  ok('EDGE the even-width control is clean too, so a red EDGE cannot be dismissed as instrument noise',
    re === 0, `700 ramp pixels = ${re}`);
}

/* STILL: the frozen takeover agrees with itself. */
const shootDeck = async (w, dpr) => {
  await page.setViewport({ width: w, height: 852, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  await sleep(220);
  await openTakeover();
  const geo = await page.evaluate(() => {
    const d = document.querySelector('.pack-deck');
    if (!d) return null;
    const b = d.getBoundingClientRect();
    return { l: b.left, t: b.top };
  });
  if (!geo) { await closeSheet(); return null; }
  const im = await decode(await page.screenshot({
    clip: { x: Math.round(geo.l), y: Math.round(geo.t), width: 200, height: 200 }, captureBeyondViewport: false }));
  await closeSheet();
  return im;
};
const stillA = await shootDeck(393, 2);
const stillB = await shootDeck(393, 2);
ok('STILL the takeover art could be captured at an odd width (an empty sample is a FAILURE)',
  !!(stillA && stillB), `a=${!!stillA} b=${!!stillB}`);
if (stillA && stillB) {
  const d = pxDiff(stillA, stillB);
  const pal = onPalette(stillA, paletteOf(stillB));
  ok('STILL the A/A control the "94.80% on-palette" report never ran: frozen, the takeover agrees with itself',
    d.n === 0 && pal > 99.99,
    `393@2x A/A pxDiff=${d.n} maxDiff=${d.max} onPalette=${pal.toFixed(2)}%`);
}

/* ---- SAME: transform centring and layout centring are the same pixels ---- */
/* On a FIXTURE, not the app: this needs a byte-exact comparison at offsets the
   app does not happen to produce, and the app cannot be asked to hold still to
   four decimal places. Pixel art (nearest AND bilinear), a 1px hairline and 9px
   text, which is the whole list of things a half-pixel offset would show on. */
const CASES = [
  { cb: 400, el: 200, name: 'whole 100.00' },
  { cb: 401, el: 200, name: 'half 100.50' },
  { cb: 400.5, el: 200, name: 'quarter 100.25' },
];
const fixture = (mode, cb, el, nudge = 0) => `
<style>
  html,body{margin:0;padding:0;background:#101010}
  .cb{position:relative;width:${cb}px;height:220px;background:#181818}
  .el{position:absolute;top:10px;width:${el}px;height:190px;background:#222;
      border:1px solid #a5e847;box-sizing:border-box}
  ${mode === 'transform'
    ? `.el{left:50%;transform:translateX(calc(-50% + ${nudge}px))}`
    : `.el{left:${nudge}px;right:${-nudge}px;margin-inline:auto}`}
  .px{position:absolute;left:6px;top:6px;width:96px;height:96px;image-rendering:pixelated}
  .sm{position:absolute;left:110px;top:6px;width:80px;height:80px}
  .hair{position:absolute;left:6px;top:112px;width:180px;height:1px;background:#f2e9d7}
  .t1{position:absolute;left:6px;top:126px;font:11px/1.3 monospace;color:#f2e9d7}
  .t2{position:absolute;left:6px;top:146px;font:9px/1.3 monospace;color:#f2e9d7}
</style>
<div class="cb"><div class="el" id="el">
  <img class="px" src="/assets/bh/G/G1.png"><img class="sm" src="/assets/bh/G/G1.png">
  <div class="hair"></div>
  <div class="t1">hairline 1px + 11px mono text</div>
  <div class="t2">9px mono text sample 0123456789</div>
</div></div>`;

const fxPage = await browser.newPage();
const shootFixture = async (mode, c, dpr, nudge) => {
  await fxPage.setViewport({ width: 760, height: 400, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  await fxPage.goto(base, { waitUntil: 'load' });
  await fxPage.setContent(fixture(mode, c.cb, c.el, nudge), { waitUntil: 'load' });
  await fxPage.evaluate(async () => { await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); });
  return decode(await fxPage.screenshot({ clip: { x: 95, y: 0, width: 220, height: 220 }, captureBeyondViewport: false }));
};

const sameRows = [];
for (const dpr of DPRS) {
  for (const c of CASES) {
    const t = await shootFixture('transform', c, dpr, 0);
    const l = await shootFixture('layout', c, dpr, NUDGE);
    const d = pxDiff(t, l);
    sameRows.push({ dpr, name: c.name, ...d, tc: colours(t), lc: colours(l),
      pal: onPalette(t, paletteOf(l)) });
  }
}
ok(`SAME sampled every offset x DPR (${CASES.length * DPRS.length} expected, an empty set is a FAILURE)`,
  sameRows.length === CASES.length * DPRS.length, `${sameRows.length} sampled`);

const differ = sameRows.filter(r => r.n > 0);
ok('SAME transform centring and layout centring render BYTE-IDENTICAL, so the sweep buys nothing',
  sameRows.length > 0 && differ.length === 0,
  differ.length
    ? differ.map(r => `${r.name}@${r.dpr}x pxDiff=${r.n} maxDiff=${r.max} colours ${r.tc}/${r.lc} onPalette=${r.pal.toFixed(2)}%`).join('; ')
    : sameRows.map(r => `${r.name}@${r.dpr}x=0`).join(' '));

await fxPage.close();
await decPage.close();
await browser.close();
if (srvHandle) srvHandle.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (!results.length) { console.log('FAIL  no assertions ran at all'); process.exit(1); }
process.exit(failed.length ? 1 : 0);
