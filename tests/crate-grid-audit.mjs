/* THE CRATE LANDS ON THE DEVICE PIXEL GRID.
 *
 * WHY THIS EXISTS. .pack-crate used to take both its size and its centring
 * offset from --pc-w, which was `min(61vw, 264px, calc((100dvh - 300px) * .61))`.
 * A percentage of a viewport unit is a fraction at essentially every width, so
 * the crate's box landed between device pixels on every phone we ship to.
 * Measured on 56c5058, left edge and width in DEVICE pixels:
 *     393x852@3   left 365.906  width 447.188
 *     390x844@3   left 363.094  width 443.766
 *     375x667@2   left 235.781  width 278.375
 *     430x932@3   left 400.313  width 489.281
 *     320x568@2   left 218.375  width 203.281
 * Not one of the ten numbers is whole. The crate art is an SVG scaled into that
 * box, and the lid and the box are two clips of the SAME art, so a fractional
 * box means the two halves do not have to round the same way. Soft edges, and a
 * lid cut that can drift by a device pixel against the seam that
 * crate-reveal-audit.mjs pins.
 *
 * WHAT IS ASSERTED, per supported profile:
 *   WIDTH   getBoundingClientRect().width * devicePixelRatio is a whole number
 *   LEFT    getBoundingClientRect().left  * devicePixelRatio is a whole number
 *   LADDER  the width is a whole number of CSS pixels too, which a percentage of
 *           a viewport unit cannot be except by accident
 *   FIT     the crate is inside .pack-scene on all four edges
 * and, for the crate kind that renders the nine authored 48x48 PNGs instead of a
 * vector icon, the same contract on the SPRITE itself:
 *   PIXDEV  #crateSeq's rendered box is a whole number of device pixels in BOTH
 *           dimensions, and so is its left edge
 *   PIX48   the rendered box is an INTEGER MULTIPLE OF 48 in both dimensions, so
 *           the 48x48 art is scaled by a whole number and never resampled
 *   PIXBOX  the sprite does not overflow .pack-crate. It is asserted as EQUALITY,
 *           not containment: .pack-crate.co-pix takes its width from the same
 *           --pc-seq the sprite does, so the two rects are the same rect. A
 *           merely-contained sprite would mean slack for an auto margin to round
 *           inside, and that is how a 144 sprite ended up in a 102 box.
 * Plus SOURCE (no viewport unit may come back into the two declarations that
 * decide the box), COUNT (an empty sample set is a FAILURE, rule 3) and CONTROL
 * (a missing .pack-crate must make this audit RED, not green).
 *
 * DIRECTION AND BOUND, not a trend: every measurement must be exactly whole.
 * The tolerance is zero. There is no "closer than before" pass here.
 *
 * PARITY, the thing that decides where the breakpoints go. A centred box has
 * left = (viewport - box) / 2, so left * dpr is whole only when
 * (viewport - box) * dpr is even. At dpr 3 that forces the crate's CSS width to
 * carry the same parity as the viewport's CSS width, which is why 390 (even) and
 * 393 (odd) cannot share a band, and why 402 and 412 get their own. At dpr 2 the
 * parity is free. At a fractional dpr (2.625, 2.75) no fixed CSS width can be
 * whole in device pixels at all, which is why the contract is this profile list
 * and not "any viewport": every profile here is a real shipping device at an
 * integer dpr. Adding a device to PROFILES is how you extend the contract, and
 * a device that cannot be satisfied will go red here rather than silently blur.
 *
 * PROVE-RED: put the old geometry back in app.css
 *     .pack-crate { width: calc(var(--pc-w) * .6218); margin-left: calc(var(--pc-w) * -.3109); }
 *     .pack-reveal { --pc-w: min(61vw, 264px, calc((100dvh - 300px) * .61)); }
 *   and every WIDTH, LEFT and LADDER row goes red.
 *
 * Usage: node tests/crate-grid-audit.mjs        (URL=... for live)
 */
import fs from 'node:fs';
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

/* Every one is a real shipping viewport at an integer devicePixelRatio. The
   five at the top are the ones whose fractional edges were reported. */
const PROFILES = [
  ['iPhone 14/15/16 Pro',  393, 852, 3],
  ['iPhone 12/13/14',      390, 844, 3],
  ['iPhone SE2/SE3/8',     375, 667, 2],
  ['iPhone 15/16 Pro Max', 430, 932, 3],
  ['iPhone SE1/5s',        320, 568, 2],
  ['iPhone 16 Pro',        402, 874, 3],
  ['iPhone 16 Pro Max',    440, 956, 3],
  ['iPhone X/XS/12 mini',  375, 812, 3],
  ['iPhone 11/XR',         414, 896, 2],
  ['iPhone 14/15 Plus',    428, 926, 3],
  ['Pixel 6/7/8',          412, 915, 3],
  ['Pixel 5 / A-series',   393, 851, 3],
  ['Galaxy S8/S20',        360, 740, 3],
  ['small Android',        360, 640, 3],
  ['iPad mini portrait',   744, 1133, 2],
  ['iPad Pro portrait',    1024, 1366, 2],
];

const { browser, page } = await boot(base, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

/* Silence every first-run takeover, exactly as crate-reveal-audit does: they
   fire in a QUEUE, and `changelogSeen` holds a BUILD NUMBER, so kvSet(.., true)
   reads as 0 and What's New paints over the reveal anyway. */
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

/* openPackReveal gates the whole sequence on `reducedMotion || navigator.webdriver`,
   so it cannot run under automation without the __crateForce seam that v329 added
   for exactly this. `drop` deletes .pack-crate after it is mounted, which is how
   the CONTROL row below proves an absent element fails instead of passing. */
const sample = async ({ drop = false } = {}) => page.evaluate(async kill => {
  window.__crateForce = 1;
  if (!window.__packReveal) return { err: 'no __packReveal hook' };
  window.__packReveal([{ name: 'Grid', rarity: 'rare', kind: 'GEAR · HAT', stats: '+7 POW' }], { coins: 0, crate: 'golden' });
  await new Promise(r => setTimeout(r, 200));
  if (kill) { const d = document.querySelector('.pack-crate'); if (d) d.remove(); }
  const c = document.querySelector('.pack-crate');
  const scene = document.querySelector('.pack-scene');
  const close = () => { const b = document.querySelector('.pack-reveal .sheet-close'); if (b) b.click(); else history.back(); };
  if (!c || !scene) { close(); return { err: c ? 'no .pack-scene' : 'no .pack-crate' }; }
  const R = el => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
  const out = { dpr: window.devicePixelRatio, vw: window.innerWidth, crate: R(c), scene: R(scene) };
  close();
  return out;
}, drop);

/* THE SPRITE HAS TO BE MEASURED AT REST, AND "at rest" IS A TIME.
 * #crateSeq lives inside .co-drop and .co-settle, which are still animating a
 * scale and a rotation for the first 1.06s, and inside .co-sink, which fades and
 * shrinks the whole thing from 1.32s. getBoundingClientRect includes those
 * transforms, so a rect read at any other moment measures the crate falling, not
 * the box the art is painted into, and would report a failure that is not one
 * (rule 12). So: let the sequence finish in real time, which stops the frame
 * timers advancing under us, then PAUSE every animation and set its currentTime
 * to REST_MS. Every one of these animations starts when the sheet mounts and
 * carries its delay in the shorthand, so one currentTime is one coherent moment.
 * 1080ms is the only clean one: crDrop ends at 850, crSettle at 280 + 780 =
 * 1060, crBloom does not start until 1140 and crSink not until 1320.
 * This does not SUPPRESS anything. An animation that moved into 1080ms would
 * still be seen here, which is the point. */
const REST_MS = 1080;
const freezeAtRest = async () => page.evaluate(ms => {
  for (const a of document.getAnimations()) { try { a.pause(); a.currentTime = ms; } catch { /* a finished animation can refuse */ } }
}, REST_MS);

let sampled = 0;
for (const [name, w, h, dpr] of PROFILES) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  await new Promise(r => setTimeout(r, 260));
  const tag = `${name} ${w}x${h}@${dpr}`;
  const m = await sample();
  await new Promise(r => setTimeout(r, 480));
  if (m.err) {
    ok(`WIDTH  ${tag}`, false, m.err);
    ok(`LEFT   ${tag}`, false, m.err);
    ok(`LADDER ${tag}`, false, m.err);
    ok(`FIT    ${tag}`, false, m.err);
    continue;
  }
  sampled++;
  const c = m.crate, s = m.scene, d = m.dpr;
  const wdev = c.w * d, ldev = c.l * d;
  ok(`WIDTH  ${tag}: crate width is a whole device pixel`, whole(wdev), `${c.w} css -> ${wdev} device (dpr ${d})`);
  ok(`LEFT   ${tag}: crate left edge is a whole device pixel`, whole(ldev), `${c.l} css -> ${ldev} device (dpr ${d})`);
  ok(`LADDER ${tag}: crate width is a whole CSS pixel (a viewport percentage is not)`, whole(c.w), `${c.w}`);
  const fits = c.l >= s.l - 1e-6 && c.r <= s.r + 1e-6 && c.t >= s.t - 1e-6 && c.b <= s.b + 1e-6;
  ok(`FIT    ${tag}: the crate is inside .pack-scene on all four edges`, fits,
    `crate [${c.l.toFixed(2)}, ${c.r.toFixed(2)}] x [${c.t.toFixed(2)}, ${c.b.toFixed(2)}] in scene [${s.l.toFixed(2)}, ${s.r.toFixed(2)}] x [${s.t.toFixed(2)}, ${s.b.toFixed(2)}]`);
}

/* ---- THE PIXEL SPRITE, at every profile ------------------------------------
   The loop above opens a `golden` crate, which is a vector icon clipped into a
   lid and a box. The COMMON crate is nine authored 48x48 PNGs and has its own
   geometry problem: the sprite was a hardcoded 144 at every breakpoint while the
   crate box it sits in runs 70 to 164, so at 320x568 it rendered 144/101.64 =
   1.417x the vector crate and hung 21px off each side of its parent. That is the
   overflow Tom reported. Same three questions as above, asked of the art. */
let seqSampled = 0;
for (const [name, w, h, dpr] of PROFILES) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  await new Promise(r => setTimeout(r, 260));
  const tag = `${name} ${w}x${h}@${dpr}`;
  await page.evaluate(() => {
    window.__crateForce = 1;
    window.__packReveal([{ name: 'Pix', rarity: 'common', kind: 'GEAR · HAT', stats: '+1 POW' }], { coins: 0, crate: 'daily' });
  });
  /* Past the last frame step (the sequence ends at --b-card, 1380ms) so no timer
     can move the art between the freeze and the read, THEN freeze at rest. */
  await new Promise(r => setTimeout(r, 1500));
  await freezeAtRest();
  const m = await page.evaluate(() => {
    const seq = document.querySelector('#crateSeq');
    const box = document.querySelector('.pack-crate');
    const R = el => { const b = el.getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    const out = seq && box
      ? { dpr: window.devicePixelRatio, seq: R(seq), box: R(box),
          pix: box.classList.contains('co-pix'),
          on: [...seq.children].findIndex(im => im.classList.contains('on')),
          undecoded: [...seq.children].filter(im => im.naturalWidth === 0).length }
      : { err: seq ? 'no .pack-crate' : 'no #crateSeq' };
    const b = document.querySelector('.pack-reveal .sheet-close');
    if (b) b.click(); else history.back();
    return out;
  });
  await new Promise(r => setTimeout(r, 520));
  if (m.err) {
    for (const row of ['PIXDEV', 'PIX48 ', 'PIXBOX']) ok(`${row} ${tag}`, false, m.err);
    continue;
  }
  seqSampled++;
  const s = m.seq, b = m.box, d = m.dpr;
  ok(`PIXDEV ${tag}: the sprite's box is a whole device pixel in BOTH dimensions, left included`,
    whole(s.w * d) && whole(s.h * d) && whole(s.l * d),
    `${s.w}x${s.h} css at left ${s.l} -> ${s.w * d}x${s.h * d} at ${s.l * d} device (dpr ${d})`);
  ok(`PIX48  ${tag}: the sprite is an INTEGER multiple of the 48px art in both dimensions`,
    whole(s.w) && whole(s.h) && s.w % 48 === 0 && s.h % 48 === 0 && s.w > 0,
    `${s.w}x${s.h} css = ${(s.w / 48).toFixed(4)}x${(s.h / 48).toFixed(4)} of 48`);
  /* EQUALITY, not containment. See the header: slack is where the rounding goes. */
  const over = Math.max(b.l - s.l, s.r - b.r, b.t - s.t, s.b - b.b);
  ok(`PIXBOX ${tag}: the sprite IS its crate box, so it cannot overflow it`,
    m.pix && Math.abs(s.w - b.w) < 1e-6 && Math.abs(s.l - b.l) < 1e-6 && over <= 1e-6,
    `sprite [${s.l.toFixed(2)}, ${s.r.toFixed(2)}] w ${s.w} in .pack-crate${m.pix ? '.co-pix' : ' (NO .co-pix)'} [${b.l.toFixed(2)}, ${b.r.toFixed(2)}] w ${b.w}; worst overflow ${over.toFixed(3)}px`);
  if (m.undecoded) ok(`PIXDEC ${tag}: every frame decoded`, false, `${m.undecoded} undecoded`);
}
ok('COUNT every profile produced a sprite measurement (an empty sample set is a FAILURE)',
  seqSampled === PROFILES.length, `${seqSampled} of ${PROFILES.length} profiles measured`);

/* ---- COUNT: an empty sample set is a FAILURE, never a pass (rule 3) -------- */
ok('COUNT every profile produced a real measurement', sampled === PROFILES.length,
  `${sampled} of ${PROFILES.length} profiles measured`);

/* ---- CONTROL: a missing crate must be RED, not green ---------------------- */
/* Without this the whole audit is one `querySelector` away from grading nothing
   and printing sixteen PASS lines. */
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await new Promise(r => setTimeout(r, 260));
const ctrl = await sample({ drop: true });
await new Promise(r => setTimeout(r, 480));
ok('CONTROL an absent .pack-crate is reported as an error, so it FAILS rather than passes',
  !!ctrl.err && ctrl.err === 'no .pack-crate', JSON.stringify(ctrl).slice(0, 120));

/* ---- SOURCE: the two declarations that decide the box stay off the viewport -- */
/* Behaviour above is the real guard. This is the second lock, and it has to look
   at the VARIABLE, not at the literal text of the declaration. My first version
   only grepped the two declarations for a `vw`/`dvh` token, and it passed on the
   reintroduced bug: `width: calc(var(--pc-w) * .6218)` carries no unit of its
   own, the unit is one hop away inside --pc-w. That is anti-regression rule 1,
   a check that cannot fail, caught by rule 2 in the prove-red run.
   So: the box must come from --pc-crate, must NOT come from --pc-w (which stays
   proportional for the rest of the scene), and every --pc-crate definition in the
   sheet must be a plain integer pixel length. */
const css = fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8');
const block = css.match(/\.pack-crate\s*\{[^}]*\}/);
const decls = block ? block[0] : '';
const widthDecl = decls.match(/(^|[;{\s])width\s*:[^;}]*/)?.[0] || '';
const marginDecl = decls.match(/margin-left\s*:[^;}]*/)?.[0] || '';
ok('SOURCE .pack-crate exists in app.css and declares both width and margin-left',
  !!block && !!widthDecl && !!marginDecl, decls.replace(/\s+/g, ' ').slice(0, 160));
ok('SOURCE the crate box comes from --pc-crate and never from --pc-w',
  !!block && /var\(--pc-crate\)/.test(widthDecl) && /var\(--pc-crate\)/.test(marginDecl)
    && !/var\(--pc-w\)/.test(widthDecl) && !/var\(--pc-w\)/.test(marginDecl),
  `${widthDecl.trim()} | ${marginDecl.trim()}`);
const crateDefs = [...css.matchAll(/--pc-crate\s*:\s*([^;}]+)/g)].map(m => m[1].trim());
const badDefs = crateDefs.filter(v => !/^\d+px$/.test(v));
ok('SOURCE every --pc-crate definition is a whole pixel length, never a viewport expression',
  crateDefs.length > 0 && badDefs.length === 0,
  `${crateDefs.length} definitions, ladder ${crateDefs.join(' ')}${badDefs.length ? ` | rejected: ${badDefs.join(' | ')}` : ''}`);

/* The sprite's ladder gets the same treatment, plus the one thing --pc-crate does
   not have to satisfy: every rung must be a multiple of 48. A rung of 140px would
   still be a whole CSS pixel and would still pass PIXDEV at dpr 2, and it would
   resample the art. The snap is allowed a half pixel, and ONLY a half pixel, for
   the reason spelled out beside it in app.css. */
const seqDefs = [...css.matchAll(/--pc-seq\s*:\s*([^;}]+)/g)].map(m => m[1].trim());
const badSeq = seqDefs.filter(v => !/^\d+px$/.test(v) || parseInt(v, 10) % 48 !== 0 || parseInt(v, 10) === 0);
ok('SOURCE every --pc-seq rung is a whole pixel length AND a multiple of 48',
  seqDefs.length > 0 && badSeq.length === 0,
  `${seqDefs.length} rungs, ladder ${seqDefs.join(' ')}${badSeq.length ? ` | rejected: ${badSeq.join(' | ')}` : ''}`);
const snapDefs = [...css.matchAll(/--pc-seq-snap\s*:\s*([^;}]+)/g)].map(m => m[1].trim());
const badSnap = snapDefs.filter(v => !/^(0px|-?\.5px|-?0\.5px)$/.test(v));
ok('SOURCE every --pc-seq-snap is 0 or exactly half a CSS pixel, never a viewport expression',
  snapDefs.length > 0 && badSnap.length === 0,
  `${snapDefs.length} definitions: ${snapDefs.join(' ')}${badSnap.length ? ` | rejected: ${badSnap.join(' | ')}` : ''}`);
const pixBlock = css.match(/\.pack-crate\.co-pix\s*\{[^}]*\}/);
ok('SOURCE .pack-crate.co-pix sizes the pixel crate off --pc-seq and nothing else',
  !!pixBlock && /width\s*:\s*var\(--pc-seq\)/.test(pixBlock[0])
    && /margin-left\s*:[^;}]*var\(--pc-seq\)/.test(pixBlock[0])
    && !/var\(--pc-crate\)|vw|dvh|vh/.test(pixBlock[0]),
  (pixBlock ? pixBlock[0] : 'missing').replace(/\s+/g, ' ').slice(0, 170));
const seqRule = css.match(/(^|\})\s*\.co-seq\s*\{[^}]*\}/m);
ok('SOURCE .co-seq takes its box from --pc-seq, not from a hardcoded 144',
  !!seqRule && /width\s*:\s*var\(--pc-seq\)/.test(seqRule[0]) && /height\s*:\s*var\(--pc-seq\)/.test(seqRule[0])
    && !/\d+px/.test(seqRule[0].replace(/--pc-seq/g, '')),
  (seqRule ? seqRule[0] : 'missing').replace(/\s+/g, ' ').slice(0, 170));

await browser.close();
if (srvHandle) srvHandle.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) for (const f of failed) console.log(`  FAILED: ${f.name}`);
process.exit(failed.length ? 1 : 0);
