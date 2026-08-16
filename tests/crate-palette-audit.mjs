/* THE PIXEL CRATE RENDERS ITS OWN COLOURS, AND NOTHING ELSE.
 *
 * WHY THIS EXISTS. Every other check on the common crate's nine authored frames
 * grades a BOX: the sprite is 144, the sprite is a multiple of 48, the sprite is
 * on the device grid, nine frames are mounted, none of them is undecoded. All of
 * that can be true of a sprite that arrives on screen as mush. The failure modes
 * for pixel art are not geometric, they are chromatic: a compositor that
 * interpolates instead of stepping, a screen-blend bloom sitting on top of the
 * outline, an opacity that is not 1, a rotation of a degree and a half. Each one
 * leaves the box exactly where it was and replaces the art with colours the
 * artist never chose.
 *
 * So this samples PIXELS. It screenshots the reveal, crops to the sprite's rect,
 * and asserts that at least 99% of the sampled device pixels are members of the
 * sprite's own palette.
 *
 * THE PALETTE IS DERIVED, NEVER TYPED. It is read out of assets/crates/common/
 * f0..f8.png at run time: every distinct fully-opaque RGB across the nine frames.
 * A hardcoded list would be a second copy of the art that nobody updates, and it
 * would go stale silently the first time a frame is repainted. Decoding is done
 * here with node:zlib because this repo has zero npm runtime dependencies and is
 * keeping it that way.
 *
 * THE ALPHA RULE, stated once. The source frames are strictly BINARY: an alpha of
 * 255 or an alpha of 0, and the audit asserts that rather than assuming it (SRC
 * ALPHA below), so re-authored art with real semi-transparency turns this red
 * instead of quietly widening what counts as legal. Given that:
 *   - a device pixel whose texel is alpha 255 is ART. It must render as an exact
 *     member of the palette. Nothing in the pipeline is entitled to change it:
 *     the drop-shadow paints behind, the stacked frames are opacity 0 or 1, and
 *     the scale is a whole number under image-rendering: pixelated.
 *   - a device pixel whose texel is alpha 0 is the SCENE BEHIND the sprite, not
 *     the sprite. It is excluded from the denominator and reported separately.
 *     Grading it would be grading the backdrop, and it would also cap the score
 *     at the art's own 59% coverage no matter how clean the render was.
 *   - anything in the RENDER that is neither of those is by definition a
 *     compositor artefact and not art, because the source has no such pixel.
 *
 * WHERE IN TIME. The sprite is graded at REST, 1080ms after the sheet mounts:
 * crDrop ends at 850, crSettle at 280 + 780 = 1060, crBloom does not start until
 * 1140 and crSink not until 1320. The animations are PAUSED at that time rather
 * than disabled, so anything that moves into that moment is still seen. What this
 * deliberately does not grade is the sprite mid-drop, where crDrop's scale
 * squashes it on purpose: that is authored motion, and failing it would be
 * reporting a state nobody is complaining about.
 *
 * VACUITY. Rule 3 in three places: a sprite that never rendered, a zero-area
 * rect, and a sample set below MIN_SAMPLES all FAIL. The smallest profile here
 * contributes about 21,000 sampled device pixels and the largest about 110,000.
 *
 * PROVE-RED, four separate injections, each one alone:
 *   bilinear     .co-seq img { image-rendering: auto }
 *   bloom        .pack-bloom { animation: none; opacity: 1; transform: none }
 *   alpha        .co-seq img.on { opacity: .9 }
 *   rotation     .co-seq img { transform: rotate(1.2deg) }
 *
 * Usage: node tests/crate-palette-audit.mjs        (URL=... for live)
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srvHandle = null;
let base = process.env.URL;
if (!base) { srvHandle = await serveTree(ROOT); base = srvHandle.url; }

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const whole = n => Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9;

const ART_DIR = path.join(ROOT, 'assets/crates/common');
const FRAMES = 9;
const ART = 48;                  // the authored frames are 48 x 48
const REST_MS = 1080;            // see the header: the only quiet moment
const THRESHOLD = 0.99;
const MIN_SAMPLES = 8000;        // per profile, against ~21k on the smallest
const MIN_TEXELS = 1000;         // distinct opaque source texels a sample must cover

/* ---- a PNG reader, because there is no npm here ----------------------------
   8-bit non-interlaced only, colour type 2 (RGB) or 6 (RGBA). That covers the
   authored art and it covers what Chrome hands back from a screenshot. Anything
   else throws rather than guessing, because a decoder that silently mis-reads is
   a check that grades noise. */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), bd = buf[24], ct = buf[25], il = buf[28];
  if (bd !== 8 || il !== 0 || (ct !== 2 && ct !== 6)) throw new Error(`unsupported PNG: bitdepth ${bd} colortype ${ct} interlace ${il}`);
  const bpp = ct === 6 ? 4 : 3;
  const parts = [];
  let o = 8;
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8);
    if (type === 'IDAT') parts.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
    if (type === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const stride = w * bpp;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const ft = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = (prev && x >= bpp) ? prev[x - bpp] : 0;
      let v = line[x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      } else if (ft !== 0) throw new Error(`bad PNG filter ${ft}`);
      cur[x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}

/* ---- the declared palette, read off the art -------------------------------- */
const palette = new Set();
const art = [];
let srcOpaque = 0, srcClear = 0, srcSemi = 0, srcPx = 0, badGeom = null;
for (let i = 0; i < FRAMES; i++) {
  const f = decodePng(fs.readFileSync(path.join(ART_DIR, `f${i}.png`)));
  if (f.w !== ART || f.h !== ART || f.bpp !== 4) badGeom = `f${i}.png is ${f.w}x${f.h} bpp ${f.bpp}`;
  const alpha = new Uint8Array(ART * ART);
  for (let k = 0; k < f.w * f.h; k++) {
    const a = f.data[k * 4 + 3];
    srcPx++;
    if (a === 255) { srcOpaque++; alpha[k] = 1; palette.add((f.data[k * 4] << 16) | (f.data[k * 4 + 1] << 8) | f.data[k * 4 + 2]); }
    else if (a === 0) srcClear++;
    else srcSemi++;
  }
  art.push({ alpha, opaque: alpha.reduce((s, v) => s + v, 0) });
}
ok('SRC GEOM all nine frames are 48x48 RGBA (the whole integer-scale argument rests on this)',
  !badGeom && art.length === FRAMES, badGeom || `${FRAMES} frames, ${ART}x${ART}`);
/* Reg's claim, verified here rather than taken. If it ever stops being true the
   alpha rule in the header stops being sound and this must go red, not adapt. */
ok('SRC ALPHA the source art is strictly binary: no semi-transparent pixel exists',
  srcPx > 0 && srcSemi === 0,
  `${srcPx} px across ${FRAMES} frames: ${srcOpaque} opaque, ${srcClear} fully transparent, ${srcSemi} semi-transparent`);
ok('SRC PALETTE the declared palette is non-empty and was derived, not typed',
  palette.size > 0, `${palette.size} distinct opaque RGB values`);
console.log(`      palette: ${[...palette].sort((a, b) => a - b).map(v => '#' + v.toString(16).padStart(6, '0')).join(' ')}`);

/* ---- the render ------------------------------------------------------------ */
const PROFILES = [
  ['iPhone 14/15/16 Pro',  393, 852, 3, 'all'],   // odd width at dpr 3, snapped; sweeps all nine frames
  ['iPhone X/XS/12 mini',  375, 812, 3, 'rest'],  // the other snapped one
  ['iPhone 12/13/14',      390, 844, 3, 'rest'],  // even width at dpr 3, exact centring
  ['iPhone SE1/5s',        320, 568, 2, 'rest'],  // the 96px rung, and the profile Tom reported
  ['iPhone SE2/SE3/8',     375, 667, 2, 'rest'],  // odd width, dpr 2, where parity is free
  ['iPhone 11/XR',         414, 896, 2, 'rest'],
];

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

/* The first-run takeover QUEUE paints over the reveal, and `changelogSeen` holds
   a build number so kvSet(.., true) reads as 0. Same helper as
   crate-reveal-audit.mjs and crate-grid-audit.mjs; this is not a new seam. */
const quiet = async () => {
  await page.evaluate(async () => {
    const db = await import('/js/db.js?q=1');
    const { DROP } = await import('/js/loot.js?q=1');
    await db.kvSet('changelogSeen', 999999);
    await db.kvSet(`dropSeen.${DROP.id}`, true);
    for (const k of ['spiresIntroSeen', 'raceIntroSeen', 'gardenIntroSeen', 'surveySeen', 'namePrompted']) await db.kvSet(k, true);
    await db.kvSet('renameRequired', null);
  });
};

await sleep(1200);
await quiet();
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1600);
await quiet();

/* An injected stylesheet, so the four prove-red cases are a flag on this file and
   not an edit to app.css. Empty on a normal run. */
const INJECT = process.env.PALETTE_INJECT || '';
if (INJECT) {
  console.log(`      INJECT: ${INJECT}`);
  await page.evaluateOnNewDocument(css => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
    });
  }, INJECT);
  await page.evaluate(css => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }, INJECT);
}

/* openPackReveal gates the sequence on `reducedMotion || navigator.webdriver`.
   __crateForce is the seam v329 added for exactly this, and 'daily' is the kind
   that renders the authored frames. */
const openPix = () => page.evaluate(() => {
  window.__crateForce = 1;
  if (!window.__packReveal) return false;
  window.__packReveal([{ name: 'Palette', rarity: 'common', kind: 'GEAR · HAT', stats: '+1 POW' }], { coins: 0, crate: 'daily' });
  return true;
});
const closeAll = async () => {
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i++) {
      if (!document.querySelector('.pack-reveal')) break;
      /* NO history.back() FALLBACK. It navigates, and a navigation between two
         profiles destroys the execution context mid-evaluate: the run died with
         "Execution context was destroyed" on the sixth viewport. If the close
         button is gone, take the sheet out directly. */
      const b = document.querySelector('.pack-reveal .sheet-close');
      if (b) b.click(); else document.querySelector('.sheet.takeover')?.remove();
      await new Promise(r => setTimeout(r, 380));
    }
  });
  await sleep(420);
};

/* Freeze at rest. This PAUSES, it does not remove: an animation that had been
   retimed into 1080ms would still be painting here. */
const freezeAtRest = () => page.evaluate(ms => {
  for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = ms; } catch { /* a finished animation may refuse */ } }
}, REST_MS);

/* Show one specific frame. The sequence is a class swap and every frame is
   already mounted and decoded, so this is the same mechanism playCrateSeq uses,
   not a new one. It exists so the guard covers all nine frames somewhere rather
   than only whichever one the timers left on. */
const showFrame = i => page.evaluate(n => {
  const seq = document.querySelector('#crateSeq');
  if (!seq) return -1;
  const f = [...seq.children];
  for (const im of f) im.classList.remove('on');
  if (f[n]) f[n].classList.add('on');
  return f.findIndex(im => im.classList.contains('on'));
}, i);

const readRect = () => page.evaluate(() => {
  const seq = document.querySelector('#crateSeq');
  if (!seq) return { err: 'no #crateSeq: the sprite never rendered' };
  const b = seq.getBoundingClientRect();
  return { dpr: window.devicePixelRatio, l: b.left, t: b.top, w: b.width, h: b.height,
    on: [...seq.children].findIndex(im => im.classList.contains('on')),
    undecoded: [...seq.children].filter(im => im.naturalWidth === 0).length };
});

/* THE TWO PREDICATES, PULLED OUT SO THE CONTROL ROWS CAN RUN THE REAL ONES.
   A control that restates the rule in its own words proves nothing about the rule
   the graded rows actually used: it only proves that two copies of my opinion
   agree. These are the copies the profile loop calls, so loosening either one
   turns the CONTROL block red. */
const rectOk = r => r.w > 0 && r.h > 0 && whole(r.w * r.dpr) && whole(r.h * r.dpr)
  && whole(r.l * r.dpr) && r.w % ART === 0 && r.h % ART === 0;
const verdict = g => g.samples >= MIN_SAMPLES && g.texels >= MIN_TEXELS
  && g.outside === 0 && g.pct >= THRESHOLD;

/* One graded sample. The screenshot is FULL FRAME and cropped here on purpose:
   a CDP clip is specified in CSS pixels and scaled internally, and a half pixel
   of rounding in the crop origin would shift the texel grid and manufacture the
   exact failure this audit is looking for. Cropping from known device-pixel
   integers cannot.
   It takes the MASK rather than a frame index so the CONTROL block can hand it a
   mask with no art in it and drive the real counting loop to an empty sample. */
async function grade(tag, rect, mask) {
  const dpr = rect.dpr;
  const x0 = Math.round(rect.l * dpr), y0 = Math.round(rect.t * dpr);
  const wd = Math.round(rect.w * dpr), hd = Math.round(rect.h * dpr);
  const scale = wd / ART;
  const shot = decodePng(await page.screenshot({ type: 'png', captureBeyondViewport: false }));
  let samples = 0, hits = 0, offGrid = 0, outside = 0;
  const texels = new Set();
  const misses = new Map();
  for (let dy = 0; dy < hd; dy++) {
    const sy = y0 + dy;
    if (sy < 0 || sy >= shot.h) { outside += wd; continue; }
    const ty = Math.floor(dy / scale);
    for (let dx = 0; dx < wd; dx++) {
      const sx = x0 + dx;
      if (sx < 0 || sx >= shot.w) { outside++; continue; }
      if (!mask[ty * ART + Math.floor(dx / scale)]) continue;   // the scene behind the sprite, not the sprite
      const k = (sy * shot.w + sx) * shot.bpp;
      const rgb = (shot.data[k] << 16) | (shot.data[k + 1] << 8) | shot.data[k + 2];
      samples++;
      texels.add(ty * ART + Math.floor(dx / scale));
      if (palette.has(rgb)) hits++;
      else { offGrid++; misses.set(rgb, (misses.get(rgb) || 0) + 1); }
    }
  }
  const pct = samples ? hits / samples : 0;
  const worst = [...misses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([v, n]) => `#${v.toString(16).padStart(6, '0')} x${n}`).join(', ');
  return { samples, hits, offGrid, outside, pct, texels: texels.size, worst, scale, x0, y0, wd, hd, tag };
}

let graded = 0, totalSampled = 0;
for (const [name, w, h, dpr, mode] of PROFILES) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  await sleep(280);
  const tag = `${name} ${w}x${h}@${dpr}`;
  if (!await openPix()) { ok(`OPEN ${tag}`, false, 'no __packReveal hook'); continue; }
  /* Past the last frame step (the sequence finishes at --b-card, 1380ms) so no
     timer can move the art between the freeze and the screenshot. */
  await sleep(1500);
  await freezeAtRest();
  const rect = await readRect();
  if (rect.err) {
    ok(`RECT ${tag}: the sprite rendered at all`, false, rect.err);
    ok(`PALETTE ${tag}`, false, rect.err);
    await closeAll();
    continue;
  }
  /* VACUITY, before anything is counted: a zero-area rect must FAIL, and a rect
     that is not a whole number of device pixels or a whole multiple of 48 means
     the texel mapping below would be a lie. */
  const wd = rect.w * dpr, hd = rect.h * dpr;
  const geomOk = rectOk(rect);
  ok(`RECT ${tag}: the sprite has a real, whole, integer-scaled box to sample`, geomOk,
    `${rect.w}x${rect.h} css at left ${rect.l} -> ${wd}x${hd} device, scale ${(wd / ART).toFixed(4)}x, frame f${rect.on}, ${rect.undecoded} undecoded`);
  if (!geomOk || rect.on < 0) {
    ok(`PALETTE ${tag}`, false, 'unusable rect, refusing to grade (an ungradeable sample is a FAILURE)');
    await closeAll();
    continue;
  }
  const frames = mode === 'all' ? [...Array(FRAMES).keys()] : [rect.on];
  for (const fi of frames) {
    if (fi !== rect.on) { const got = await showFrame(fi); if (got !== fi) { ok(`PALETTE ${tag} f${fi}`, false, `could not show frame ${fi}`); continue; } }
    const g = await grade(tag, rect, art[fi].alpha);
    graded++;
    totalSampled += g.samples;
    ok(`PALETTE ${tag} f${fi}: >= ${(THRESHOLD * 100).toFixed(0)}% of sampled pixels are members of the sprite's own palette`,
      verdict(g),
      `${(g.pct * 100).toFixed(2)}% (${g.hits}/${g.samples} px over ${g.texels} texels at ${g.scale}x)`
        + `${g.offGrid ? `, ${g.offGrid} off-palette, worst: ${g.worst}` : ''}`
        + `${g.samples < MIN_SAMPLES ? `, SAMPLE TOO SMALL (< ${MIN_SAMPLES})` : ''}`
        + `${g.texels < MIN_TEXELS ? `, TOO FEW TEXELS COVERED (< ${MIN_TEXELS})` : ''}`
        + `${g.outside ? `, ${g.outside} px of the rect fell outside the screenshot` : ''}`);
  }
  await closeAll();
}

/* ---- COUNT: rule 3, an empty sample set is a FAILURE ----------------------- */
const expected = PROFILES.reduce((n, p) => n + (p[4] === 'all' ? FRAMES : 1), 0);
ok('COUNT every profile produced a graded screenshot (an empty sample set is a FAILURE, never a pass)',
  graded === expected, `${graded} of ${expected} samples graded, ${totalSampled} device pixels sampled in total`);

/* ---- CONTROL: the three ways this audit could grade NOTHING and print PASS --
 * Anti-regression rule 1: a check that cannot fail is not a check. Everything
 * above is one `querySelector` away from measuring an empty set and reporting
 * fourteen green rows, which is exactly the failure the crate has already had
 * once ("no frames shown with empty art" out of an empty sample). So the three
 * degenerate inputs are DRIVEN here, in the live page where possible, and run
 * through the same rectOk/verdict/grade the graded rows used. */
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await sleep(280);
await openPix();
await sleep(1500);
await freezeAtRest();

/* 1. THE SPRITE NEVER RENDERED. Take #crateSeq out and read it the normal way. */
const live = await readRect();
await page.evaluate(() => document.querySelector('#crateSeq')?.remove());
const gone = await readRect();
ok('CONTROL a sprite that never rendered is reported as an ERROR, so it FAILS rather than passes',
  !!gone.err && !live.err,
  `present: ${live.err || `${live.w}x${live.h}`} | removed: ${gone.err || 'STILL MEASURED, which would be a silent pass'}`);
await closeAll();

/* 2. A ZERO-AREA RECT. The same predicate the RECT rows used has to refuse it,
      and still accept the real rect measured a moment ago. */
ok('CONTROL a zero-area rect is refused by rectOk, the same gate the RECT rows use',
  rectOk({ w: 0, h: 0, l: 0, dpr: 3 }) === false
    && rectOk({ w: 144, h: 0, l: 124, dpr: 3 }) === false
    && rectOk({ w: 0, h: 144, l: 124, dpr: 3 }) === false
    && rectOk(live) === true,
  `0x0 -> ${rectOk({ w: 0, h: 0, l: 0, dpr: 3 })}, 144x0 -> ${rectOk({ w: 144, h: 0, l: 124, dpr: 3 })}, live ${live.w}x${live.h} -> ${rectOk(live)}`);

/* 3. AN EMPTY SAMPLE SET, driven through the real counting loop: a mask with no
      art in it means every device pixel is skipped as "behind the sprite", which
      is precisely the shape of a check that grades nothing. It must not reach
      100% by dividing zero by zero. */
await openPix();
await sleep(1500);
await freezeAtRest();
const liveRect = await readRect();
const empty = await grade('control', liveRect, new Uint8Array(ART * ART));
const full = await grade('control', liveRect, art[8].alpha);
await closeAll();
/* The positive arm is deliberately `samples >= MIN_SAMPLES` and NOT
   `verdict(full) === true`. This row is about the EMPTY case, and tying it to a
   clean render would make it cascade red every time the palette itself failed,
   turning one real finding into two and hiding which was which. That the verdict
   CAN return true is already proven fourteen times above. */
ok('CONTROL an empty sample set FAILS the same verdict the PALETTE rows use, it does not score 100%',
  empty.samples === 0 && verdict(empty) === false && full.samples >= MIN_SAMPLES,
  `empty mask: ${empty.samples} px sampled, pct ${(empty.pct * 100).toFixed(2)}%, verdict ${verdict(empty)} | real mask: ${full.samples} px sampled, so the loop does count when there is art`);

await browser.close();
if (srvHandle) srvHandle.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) for (const f of failed) console.log(`  FAILED: ${f.name}`);
console.log(failed.length ? 'CRATE PALETTE AUDIT FAILED' : 'CRATE PALETTE VERIFIED');
process.exit(failed.length ? 1 : 0);
