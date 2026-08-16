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

await browser.close();
if (srvHandle) srvHandle.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) for (const f of failed) console.log(`  FAILED: ${f.name}`);
process.exit(failed.length ? 1 : 0);
