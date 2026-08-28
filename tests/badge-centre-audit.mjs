/* tests/badge-centre-audit.mjs — A DRAWING IN A ROUND BADGE SITS IN THE MIDDLE
 * OF IT, AND IT IS MEASURED RATHER THAN REMEMBERED.
 *
 * WHY THIS EXISTS. Tom, 2026-08-22 (feedback item v424-20):
 *   "Too fast to loot icon doesn't have lightning bolt centred in the circle.
 *    Stop doing that shit."
 * The "stop doing that shit" is the instruction. This is the third report of the
 * same shape in two batches: v424-7 is "the icon on the crew banner 'thanks for
 * bieng early' is up in the top left, it should be in the centre and always be
 * that way. you did this with the first step challenge foot too, i dont know
 * why." Three sightings of one mechanism means it is a class, and a class gets a
 * guard rather than a promise to be careful.
 *
 * THE ROOT CAUSE OF THE REPORTED ONE, measured on the rendered card, not guessed:
 * the readout wrote `<span class="ic warn">`, and app.css:637 carries a GLOBAL
 * `.warn` banner utility with `padding: 10px 12px` on it. `.map-act .ic` is a
 * 40px border-box disc with a 3px border, so that padding left a 10x14 content
 * box holding a 24px bolt, and Chrome pins a grid item larger than its area to
 * the START of that area instead of centring it. Top-left, which is the phrase
 * Tom used about the Crew banner. Measured before: box offset (7.00, 5.00)px,
 * 43.0% of the disc's own radius; ink centroid 38.4% of the radius. After
 * renaming the modifier to `.fast`: box (0.00, 0.00)px = 0.0%, ink 7.7%.
 *
 * WHAT IS GRADED, and which direction is failure.
 *
 *   BOX    the glyph's rendered box centre against the disc's geometric centre,
 *          as a percentage of the disc's radius. This is pure CSS and it is the
 *          row that catches the class. Threshold 8%, DERIVED: every one of the
 *          shipped badges measured 0.0% on this, without exception, so anything
 *          above sub-pixel rounding is a real displacement. 8% of the smallest
 *          graded disc (r=16px) is 1.3px, which is comfortably above rounding
 *          and 5x under the 43.0% the reported defect measured.
 *
 *   INK    the glyph's ink centroid against the same centre, same units. This is
 *          the number a player's eye actually reads, and it is the only row that
 *          can see a drawing that is perfectly boxed and still lopsided.
 *          Threshold 25%, DERIVED: a drawing is allowed to lean, because ink
 *          mass is not symmetry. The widest-leaning shipped badge is the Today
 *          trend arrow at 10.1% (its arrowhead is in the top right corner of its
 *          own viewBox and its box offset is 0.0%, so it is centred and simply
 *          asymmetric), and the bolt after the fix is 7.7% for the same reason.
 *          25% is 2.5x the widest honest lean and still well under the 38.4%
 *          the defect measured. Both numbers come from the measured set printed
 *          on every run; neither was invented to make a check pass.
 *
 *   COVERAGE  the reported badge itself is IN the sample. The Boneyard readout
 *          disc is named, and a run that never reached it is not a run that
 *          proved anything about it.
 *
 *   CONTROL  the graded set is non-empty and the ungraded rows are printed by
 *          name with their reason. An empty sample set is a failure, never a
 *          pass, and a badge that quietly leaves the sample is how that happens.
 *
 * WHAT IS DELIBERATELY NOT GRADED, and why each is named rather than dropped:
 *   COVERED  something is drawn on top of the disc. Every glyph is hidden in the
 *            same capture, so ink that another element covers contributes no
 *            difference at all and vanishes from the centroid. Hit-tested with
 *            elementFromPoint over the disc. This is what a half-covered Bone
 *            cache on the Boneyard looks like: box offset 0.0%, ink 35.3%, the
 *            same 5.38,-5.10px on three consecutive runs.
 *   OVERLAP  two discs whose rects intersect cannot be weighed by this method,
 *            because every glyph is hidden in one capture and the ink that
 *            disappears inside disc A includes part of disc B's drawing. Out on
 *            the Boneyard the loot markers routinely sit on each other. This is
 *            not hypothetical caution: before the gate existed, a Bone cache
 *            that is centred to 2.3% came back reading 35.3%, twice in a row,
 *            reproducibly and wrongly both times.
 *   MOVING   a badge whose region or rect changed between the bracketing
 *            captures was in motion while it was weighed.
 *   NO-INK   a badge that contributed no difference at all. Reported, and it is
 *            a FAILURE, because the commonest cause is an <img> that laid out
 *            perfectly and never decoded, which every geometry-only check in
 *            this repo would call a pass.
 *
 * SCOPE. Circular badges: one uniform border-radius of at least 45% of the box,
 * a square-ish box of at least 20px, and exactly one visible img/svg child and
 * no text. `.gbn-ico` on the Crew banners is a 38px box at a 10px radius (26%)
 * carrying the same top-left glyph, and it is feedback item v424-7 in its own
 * workstream; widening this file to cover it is the ROUND_MIN_PCT constant in
 * tests/badge-centre-lib.mjs and nothing else.
 *
 * Serves the tree by default and NEVER defaults to production. Pass a URL as
 * argv[2] only to point it somewhere deliberately. Needs WebGL and vector tiles
 * for the Boneyard leg, like boneyard-icon-audit, and reports UNPROVEN with exit
 * 97 rather than green when the map cannot be drawn.
 * Usage: node tests/badge-centre-audit.mjs      (exits non-zero on failure)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree, unproven, unprovenReport, exitFor } from './godmode.js';
import { measureScreen, fmt, keyOf, grade } from './badge-centre-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* THE TWO THRESHOLDS, as a percentage of the disc's own radius. Both derived
   from the measured set below, which every run reprints; see the header. */
const BOX_MAX_PCT = 8;
const INK_MAX_PCT = 25;

/* The badge the report was about. Named, so a run that never reached the
   Boneyard fails COVERAGE instead of passing on the seven badges it did see. */
const MUST_COVER = { name: 'the Boneyard readout disc', re: /span\.ic\./ };

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const base = process.argv[2] || null;
const srv = base ? null : await serveTree(ROOT);
const url = base || srv.url;
const { browser, page } = await boot(url, {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
await browser.defaultBrowserContext().overridePermissions(new URL(url).origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });

const rows = [];
/* Scroll each screen through, because a badge below the fold is still a badge
   and the collector only takes what is fully inside the viewport. */
const scrollerOf = () => page.evaluate(() => {
  const c = [document.scrollingElement, ...document.querySelectorAll('#screen, #app, .sheet-body')];
  const s = c.find(e => e && e.scrollHeight > e.clientHeight + 40);
  return s ? { h: s.scrollHeight, c: s.clientHeight } : null;
});
const scrollTo = y => page.evaluate(yy => {
  const c = [document.scrollingElement, ...document.querySelectorAll('#screen, #app, .sheet-body')];
  const s = c.find(e => e && e.scrollHeight > e.clientHeight + 40);
  if (s) s.scrollTop = yy;
}, y);
const sweep = async name => {
  const sc = await scrollerOf();
  const steps = sc ? Math.min(6, Math.ceil(sc.h / sc.c)) : 1;
  for (let i = 0; i < steps; i++) {
    if (sc) { await scrollTo(i * sc.c * 0.9); await sleep(700); }
    rows.push(...await measureScreen(page, steps > 1 ? `${name}@${i}` : name));
  }
  if (sc) { await scrollTo(0); await sleep(400); }
};

for (const [h, n] of [['#/today', 'today'], ['#/bonehead', 'bonehead'], ['#/friends', 'crew'],
  ['#/progress', 'progress'], ['#/settings', 'settings'], ['#/foods', 'foods']]) {
  await page.evaluate(hh => { location.hash = hh; }, h);
  await sleep(2200);
  await sweep(n);
}
await page.evaluate(() => { location.hash = '#/bonehead'; });
await sleep(2000);
for (const t of ['crates', 'shop', 'talents', 'wardrobe']) {
  await page.evaluate(tt => document.querySelector(`.ch-tab[data-tab="${tt}"]`)?.click(), t);
  await sleep(1600);
  await sweep('bonehead:' + t);
}

/* THE BONEYARD, AND THE STATE THE REPORT WAS ABOUT. The readout only says "Too
   fast to loot" when youSpeed clears MAX_LOOT_SPEED, and youSpeed is derived
   from real position deltas inside the app's own watchPosition handler, so the
   only honest way to reach it is to MOVE: six fixes about 67m apart, spaced past
   the handler's own 1200ms throttle. Firing the readout's render directly would
   prove the markup and nothing about whether the game ever produces this state.
   The settle afterwards is deliberate and safe: youSpeed decays only when a NEW
   fix arrives, so waiting lets the camera stop without letting the state go. */
await page.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(2500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('#screen button')].find(x => /open the map/i.test(x.textContent || ''));
  if (b) b.click();
});
await sleep(9000);
const mapUp = await page.evaluate(() => !!document.querySelector('#mapStage'));
if (mapUp) {
  rows.push(...await measureScreen(page, 'boneyard'));
  let lat = 49.2827;
  for (let i = 0; i < 6; i++) { lat += 0.0006; await page.setGeolocation({ latitude: lat, longitude: -123.1207 }); await sleep(1500); }
  await sleep(3000);
  const card = await page.evaluate(() => document.querySelector('#mapAct')?.innerText.replace(/\s+/g, ' ').trim() || '');
  console.log(`      readout: "${card}"`);
  rows.push(...await measureScreen(page, 'boneyard:toofast'));
}

/* One row per badge. The WORST graded reading wins, because a badge that is
   centred on one screen and displaced on another is displaced. */
const best = new Map();
for (const r of rows) {
  const k = keyOf(r);
  const p = best.get(k);
  if (!p) { best.set(k, r); continue; }
  if (r.graded && (!p.graded || r.inkOffPct > p.inkOffPct)) best.set(k, r);
}
const uniq = [...best.values()].sort((a, b) => (b.inkOffPct ?? 1e9) - (a.inkOffPct ?? 1e9));
const graded = uniq.filter(r => r.graded);
const ungraded = uniq.filter(r => !r.graded);

console.log(`\n=== ${rows.length} readings, ${uniq.length} distinct circular badges, ${graded.length} graded ===`);
for (const r of uniq) console.log('      ' + fmt(r));
if (ungraded.length) {
  console.log(`\n      NOT GRADED (named, never silently dropped):`);
  for (const r of ungraded) console.log(`      ${r.why}  ${r.src.split('/').pop()}  ${r.path}`);
}

ok('CONTROL a circular badge was actually measured', graded.length > 0,
  `${graded.length} graded of ${uniq.length} found across ${rows.length} readings`);

const covered = uniq.find(r => MUST_COVER.re.test(r.path));
ok(`COVERAGE ${MUST_COVER.name} is in the sample`, !!covered && covered.graded,
  covered ? `found and ${covered.graded ? 'graded' : 'NOT graded: ' + covered.why}` : 'never reached');

const noInk = uniq.filter(r => r.why === 'NO-INK');
ok('DECODE every badge put ink on the glass', noInk.length === 0,
  noInk.length ? noInk.map(r => `${r.src.split('/').pop()} @ ${r.path}`).join(' | ')
    : `${graded.length} badges each contributed ink`);

const boxBad = graded.filter(r => r.boxOffPct > BOX_MAX_PCT);
ok(`BOX every glyph's box is centred in its disc (<= ${BOX_MAX_PCT}% of the radius)`, boxBad.length === 0,
  boxBad.length ? 'WORST: ' + boxBad.slice(0, 5).map(fmt).join(' || ')
    : `worst ${graded.length ? Math.max(...graded.map(r => r.boxOffPct)).toFixed(1) : 0}% over ${graded.length} badges`);

const inkBad = graded.filter(r => r.inkOffPct > INK_MAX_PCT);
ok(`INK every glyph's ink centroid is centred in its disc (<= ${INK_MAX_PCT}% of the radius)`, inkBad.length === 0,
  inkBad.length ? 'WORST: ' + inkBad.slice(0, 5).map(fmt).join(' || ')
    : `worst ${graded.length ? Math.max(...graded.map(r => r.inkOffPct)).toFixed(1) : 0}% over ${graded.length} badges`);

console.log('\n      WORST OFFENDERS (graded, worst ink first):');
for (const r of graded.slice(0, 6)) console.log(`      ${grade(r).padStart(7)}  box ${r.boxOffPct.toFixed(1)}%  ${r.src.split('/').pop()}  ${r.screen}  ${r.path}`);

if (!mapUp) unproven('the Boneyard legs', 'the map never came up on this machine (WebGL or vector tiles unreachable), so the readout disc and the map markers were not measured');

await browser.close();
if (srv) srv.close();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${failed ? 'FAILED' : 'OK'}  ${results.length - failed}/${results.length} checks passed`);
unprovenReport('badge-centre-audit');
process.exit(exitFor(failed));
