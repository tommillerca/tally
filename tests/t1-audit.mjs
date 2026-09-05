/* Tier 1 (daily-loop) audit. Drives the REAL controls through the whole
 * add-food flow and asserts what the player ends up looking at.
 *
 * WHY THESE CHECKS. Every one of them is red on a specific way this rebuild can
 * break, and each was proven red before being trusted (see PROVE-RED below):
 *   - the pinned action button can be pushed off-screen by one missing flex rule,
 *     and the sheet still "renders" perfectly while being unusable.
 *   - the budget strip and the payoff block are filled from async reads; if
 *     either promise throws, the sheet looks fine and quietly loses the feature.
 *   - a food row with no medallion means foodRowHtml regressed, and it is used by
 *     three different callers.
 *   - AN EMPTY SAMPLE SET IS A FAILURE. Zero rows examined means the check did
 *     not run, which is how this project once shipped invisible characters.
 *
 * PROVE-RED. Each of these was run and confirmed to fail on 2026-08-06:
 *   FOOT-ON-SCREEN  set `.sheet.t1 .sheet-body { flex: 0 0 auto }` in app.css
 *                   -> fails on foodform, bottom=855 against vh=844.
 *                   NOTE: merely DELETING the flex rule does not fail, because a
 *                   flex child shrinks by default and .sheet is height-clamped.
 *                   It is the no-shrink body that pushes the button off. Do not
 *                   re-document the delete as the proof; it passes.
 *   BUDGET, PAYOFF  make dayBudget() throw -> both fail (hidden/empty, null).
 *
 * Usage:  node tests/t1-audit.mjs                (serves this folder)
 *         URL=https://tommillerca.github.io/tally/ node tests/t1-audit.mjs
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serveTree, loadPuppeteer, chromePath, sandboxArgs,
  boneyardCapability, unproven, unprovenReport, exitFor, unclassifiedRows } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* puppeteer via godmode's loadPuppeteer: the repo's own node_modules first so a
   fresh clone works after `npm install`, the overlay-render-kit as fallback so the
   already-configured machines need no install. Each of these files used to carry
   its OWN copy of a hardcoded path into a sibling project. */
const puppeteer = await loadPuppeteer();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let srv = null, srvHandle = null;
let base = process.env.URL;
if (!base) {
  /* serveTree: a free port from the OS, and a HARD ERROR if python never
     bound. The hard-coded port with stdio:'ignore' meant a stranded server
     already holding it made this audit talk to whatever was listening. */
  srvHandle = await serveTree(ROOT);
  srv = { kill: () => srvHandle.close() };
  base = srvHandle.url;
}

const results = [];
const shots = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'new',
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // MapLibre needs WebGL. Without these the Boneyard draws as a black rectangle,
  // attribution and all, which reads like a network failure rather than no GPU.
  executablePath: chromePath(),
  args: [...sandboxArgs(), '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

const origin = new URL(base.replace(/\/?$/, '/')).origin;
await browser.defaultBrowserContext().overridePermissions(origin, ['geolocation']);
await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207, accuracy: 12 }); // Vancouver
await page.goto(base.replace(/\/?$/, '/') + '?demo', { waitUntil: 'networkidle2' });
await sleep(3000);
// clear the demo profile's first-run cards so they are not what we measure
for (let i = 0; i < 8; i++) {
  const hit = await page.evaluate(() => {
    const rx = /^(spin|nice|done|collect|claim|continue|ok|got it|next|skip)$/i;
    const b = [...document.querySelectorAll('button')].find(x => rx.test((x.textContent || '').trim()) && x.getBoundingClientRect().width);
    if (!b) return false;
    b.click();
    return true;
  });
  if (!hit) break;
  await sleep(1200);
}

/* real mouse click at the element's centre: this app has handlers that a
   programmatic .click() does not reach, and a check that fakes the tap is
   testing nothing. */
const tap = async (sel, label = sel) => {
  const hit = await page.evaluate(s => {
    const el = document.querySelector(s);
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  if (!hit) { ok(`TAP ${label}`, false, 'not present or zero-size'); return false; }
  await page.mouse.click(hit.x, hit.y);
  return true;
};
const count = sel => page.evaluate(s => document.querySelectorAll(s).length, sel);
const shot = async name => { if (shots) await page.screenshot({ path: path.join(shots, `live-t1-${name}.png`) }); };

// a pinned footer button that sits below the fold is unusable, and the sheet
// looks completely correct in a screenshot of the top half.
const footOnScreen = async where => {
  const r = await page.evaluate(() => {
    const b = document.querySelector('.t1-foot .btn');
    if (!b) return null;
    const box = b.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, h: innerHeight };
  });
  if (!r) { ok(`FOOT-ON-SCREEN ${where}`, false, 'no .t1-foot .btn found'); return; }
  ok(`FOOT-ON-SCREEN ${where}`, r.bottom <= r.h + 1 && r.top > 0, `bottom=${Math.round(r.bottom)} vh=${r.h}`);
};

/* ---------- 1. the picker ---------- */
/* FORCE a real hashchange, not just an assignment. 2026-09-05: boot() now
   normalises an empty hash to '#/today' via history.replaceState (so the
   FIRST tab tap isn't a no-op), which means demo boot can already BE on
   '#/today' by the time we get here. Assigning the same value is then a
   no-op: no hashchange fires, route()'s closeAllSheets() never runs, and a
   takeover left over from the intro-dismiss loop above (it clicks a Claim
   button through an overlay a real finger could never reach, and the reward
   crate reveal only dismisses on a tap-anywhere the loop never makes) sits
   over the screen and eats the FAB tap below. Proven red exactly this way on
   integ/day2 while it passed on origin/main, where boot leaves the hash
   empty and the same assignment was a real navigation. Bouncing off '#/'
   first guarantees the next assignment always differs. */
await page.evaluate(() => { history.replaceState(null, '', '#/'); location.hash = '#/today'; });
await sleep(1600);
await tap('#fab', 'FAB');
await sleep(1400);

ok('PICKER opens with the t1 sheet', await count('.sheet.t1') > 0);
ok('PICKER routes are one row of four', await count('.t1-routes .t1-route') === 4);
const rows = await count('.t1-frow');
ok('PICKER shows food rows', rows > 0, `${rows} rows`);           // empty = failure, not a pass
const medded = await page.evaluate(() =>
  [...document.querySelectorAll('.t1-frow')].filter(r => (r.querySelector('.t1-med b')?.textContent || '').trim()).length);
ok('PICKER every row has a kcal medallion', rows > 0 && medded === rows, `${medded}/${rows}`);
const budget = await page.evaluate(() => {
  const el = document.querySelector('#addBudget');
  if (!el || el.hidden) return null;
  return (el.querySelector('.n')?.textContent || '').trim();
});
ok('PICKER budget strip is filled', !!budget && /\d/.test(budget), budget || 'hidden/empty');
await shot('picker');

/* ---------- 2. the portion sheet ---------- */
await tap('[data-food]', 'first food row');   // L9: the first .t1-frow is a one-tap relog row now
await sleep(1300);
ok('PORTION opens', await count('.t1-hero') > 0);
const payoff = await page.evaluate(() => {
  const el = document.querySelector('#payoff');
  if (!el || el.hidden) return null;
  return { rows: el.querySelectorAll('.t1-pr').length, base: /\+10/.test(el.textContent), left: /Left after this/.test(el.textContent) };
});
ok('PORTION payoff block is filled', !!payoff && payoff.rows >= 2 && payoff.base && payoff.left, JSON.stringify(payoff));
await footOnScreen('portion');

// operate the stepper: a rendered stepper that does not step is the bug
const before = await page.evaluate(() => document.querySelector('#qtyIn')?.value);
await tap('.t1-step button.plus', 'stepper +');
await sleep(400);
const after = await page.evaluate(() => document.querySelector('#qtyIn')?.value);
ok('PORTION stepper changes the quantity', !!before && !!after && before !== after, `${before} -> ${after}`);
const kcalMoved = await page.evaluate(() => document.querySelector('#pvKcal')?.textContent);
ok('PORTION kcal recalculates', !!kcalMoved && /\d/.test(kcalMoved), kcalMoved);
await shot('portion');
await page.evaluate(() => history.back());
await sleep(800);

/* ---------- 3. quick add ---------- */
await tap('#actQuick', 'Quick');
await sleep(900);
ok('QUICKADD hero calorie field', await count('.t1-field.hot input') === 1);
await footOnScreen('quickadd');
await shot('quickadd');
await page.evaluate(() => history.back());
await sleep(700);

/* ---------- 4. label scan ---------- */
await tap('#actLabel', 'Label');
await sleep(1100);
ok('LABEL guide stage renders', await count('.t1-stage .brk i') === 4);
ok('LABEL shows the three rules', await count('.t1-rules div') === 3);
const guide = await page.evaluate(() => {
  const im = document.querySelector('.t1-stage img');
  return im ? { present: true, w: im.naturalWidth } : { present: false, w: 0 };
});
// naturalWidth, not getBoundingClientRect: a CSS box measures fine over an
// image that never decoded, which is exactly how a blank render once passed.
ok('LABEL guide art actually decoded', guide.present && guide.w > 0, JSON.stringify(guide));
await footOnScreen('label');
await shot('label');
await page.evaluate(() => history.back());
await sleep(700);

/* ---------- 5. the scanner ---------- */
await tap('#actScan', 'Barcode');
await sleep(2600);
ok('SCANNER has four corner brackets', await count('.reticle.t1 i') === 4);
ok('SCANNER manual entry is plated', await count('.scan-foot .row .t1-search input') === 1);
ok('SCANNER offers the label escape hatch', await count('#scanToLabel') === 1);
/* The status message used to be positioned at 44% - 130px, which is exactly
   where the bracket tops land: a two-line "camera denied" ran straight through
   them. Geometry, not a screenshot, because the overlap is only obvious at the
   one message length that happens to wrap. */
const overlap = await page.evaluate(() => {
  const st = document.querySelector('.scan-status');
  const txt = st && st.querySelector('.plate');
  if (!txt) return { checked: 0, hits: 0 };
  const a = txt.getBoundingClientRect();
  const marks = [...document.querySelectorAll('.reticle.t1 i')];
  const hits = marks.filter(m => {
    const b = m.getBoundingClientRect();
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }).length;
  return { checked: marks.length, hits };
});
ok('SCANNER status never crosses the brackets', overlap.checked === 4 && overlap.hits === 0, JSON.stringify(overlap));
const hintHidden = await page.evaluate(() => {
  const st = document.querySelector('.scan-status .plate');
  const h = document.querySelector('.scan-hint');
  return { speaking: !!st, hintHidden: !!h?.hidden };
});
ok('SCANNER hint yields while the status speaks', !hintHidden.speaking || hintHidden.hintHidden, JSON.stringify(hintHidden));
await shot('scanner');
await page.evaluate(() => { const n = document.querySelectorAll('.sheet').length; if (n) history.go(-n); });
await sleep(1000);

/* ---------- 6. the food form ---------- */
await page.evaluate(() => { location.hash = '#/foods'; });
await sleep(1600);
await tap('#newFood', 'Create a food');
await sleep(1100);
ok('FOODFORM uses the t1 field recipe', await count('.t1-field input') >= 8);
await footOnScreen('foodform');
await shot('foodform');

/* ---------- 7. the Boneyard ---------- */
/* CAN THIS MACHINE HOST SECTION 7 AT ALL?
 *
 * Everything below drives MapLibre over a REMOTE vector tile host. With that
 * host unreachable, js/app.js:13287 replaces the Boneyard with "The Boneyard
 * needs a network signal to draw the map" and a Retry button, and these rows
 * stop measuring the app. Two of them then PASS on nothing, measured on this
 * container 2026-08-17: "BONEYARD old floating pill is gone" and "BONEYARD
 * mini-boss uses drawn art, not a dingbat" are both `count(...) === 0`
 * assertions, and a map with no markers satisfies them for the wrong reason.
 * That is an empty sample read as a pass (tally/CLAUDE.md rule 3).
 *
 * So the capability is MEASURED (godmode.boneyardCapability) and, when absent,
 * every row in this section is declared UNPROVEN BY NAME and the suite exits
 * 97. Sections 1 to 6 are untouched: they need no map and they still grade.
 *
 * 'NO page errors' is unproven too, deliberately. The error stream collects
 * console errors, and an unreachable tile host puts its own network error in
 * there, so the row can only be graded by excluding errors by hand, which is a
 * judgement rather than a measurement. */
const MAP_ROWS = [
  'BONEYARD has a plated top bar',
  'BONEYARD top bar reports what is out there',
  'BONEYARD readout and Collect share one card',
  'BONEYARD old floating pill is gone',
  'BONEYARD draws spawn markers',
  'BONEYARD every marker carries its art',
  'BONEYARD no soft-glow chrome',
  'BONEYARD collect radius is drawn to scale',
  'BONEYARD OSM attribution is not covered',
  'BONEYARD mini-boss uses drawn art, not a dingbat',
  'NO page errors',
];
/* Anti-rot, and it runs on EVERY machine including this one: every ok() row
   written after this section marker must be in MAP_ROWS. A new Boneyard
   assertion that nobody classified would otherwise be graded against a dead map
   and pass on an empty set, which is the bug this whole block exists to end. */
const cls = unclassifiedRows(import.meta.url, [MAP_ROWS, ['ROWS-CLASSIFIED every Boneyard row is declared map-dependent']],
  { after: '/* ---------- 7. the Boneyard ---------- */' });
ok('ROWS-CLASSIFIED every Boneyard row is declared map-dependent',
  cls.missing.length === 0 && cls.seen > 0,
  cls.missing.length ? `unclassified: ${cls.missing.join(' | ')}` : `${cls.seen} row names read from section 7`);

const mapCap = await boneyardCapability(page);
if (!mapCap.ok) {
  for (const n of MAP_ROWS) unproven(n, 'the Boneyard could not draw on this machine');
  await browser.close();
  if (srv) srv.kill();
  const f = results.filter(r => !r.pass);
  console.log(`\n${results.length - f.length}/${results.length} of the checks that COULD run passed`);
  unprovenReport('t1-audit.mjs', mapCap);
  process.exit(exitFor(f.length));
}

await page.evaluate(() => { const n = document.querySelectorAll('.sheet').length; if (n) history.go(-n); });
await sleep(700);
await page.evaluate(() => { location.hash = '#/boneyard'; });
await sleep(2200);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /open the map/i.test(x.textContent || ''));
  if (b) b.click();
});
await sleep(11000);

ok('BONEYARD has a plated top bar', await count('.map-topbar h1') === 1);
const mapCount = await page.evaluate(() => (document.querySelector('#mapCount')?.textContent || '').trim());
ok('BONEYARD top bar reports what is out there', /\d|Nothing/.test(mapCount), mapCount);
// #mapReadout is re-rendered by innerHTML on every fix, so #mapCollect MUST be
// its sibling inside the card. Nesting it would delete the button and its
// listener on the first GPS update, and the card would still look right.
const cardShape = await page.evaluate(() => {
  const card = document.querySelector('.map-act');
  const ro = document.querySelector('#mapReadout');
  const btn = document.querySelector('#mapCollect');
  if (!card || !ro || !btn) return null;
  return { roInCard: card.contains(ro), btnInCard: card.contains(btn), btnInsideRo: ro.contains(btn) };
});
ok('BONEYARD readout and Collect share one card', !!cardShape && cardShape.roInCard && cardShape.btnInCard && !cardShape.btnInsideRo, JSON.stringify(cardShape));
ok('BONEYARD old floating pill is gone', await count('.map-readout:not(.ma-body)') === 0);

const spawns = await count('.map-spawn');
ok('BONEYARD draws spawn markers', spawns > 0, `${spawns} markers`);   // empty = failure
/* ART IS A DRAWN NODE THAT DECODED, NOT AN <svg>. This row asked
   `querySelector('svg')` from the day it was written, and v416 moved every
   spawn type off vectors: spawnIcon() now routes through pixCur/crateIcon and
   emits <img src="assets/icons-pix/*.png">. Measured on origin/main at
   14fb37a3, with the map drawing normally: 61 of 61 .map-spawn nodes carried a
   decoded <img> and 0 carried an <svg>, so this row read 0/61 while
   boneyard-icon-audit.mjs graded the same markers green in the same tree
   (66 pixel imgs, 66 decoded). Drifted assertion, not an app defect.
   NOT MERELY WIDENED. An <img> only counts once naturalWidth > 0 says the PNG
   actually decoded, so the row now also fails on the blank tile the old <svg>
   test could never see: an icon can hold a perfect 24x24 box over a file that
   never loaded. */
const iconed = await page.evaluate(() =>
  [...document.querySelectorAll('.map-spawn')].filter(m => {
    const img = m.querySelector('img');
    return !!m.querySelector('svg') || !!(img && img.naturalWidth > 0);
  }).length);
ok('BONEYARD every marker carries its art', spawns > 0 && iconed === spawns, `${iconed}/${spawns}`);

/* The deck bans soft glow on chrome, and the old markers had 14px-blur halos.
   Parse the computed shadow rather than trusting the stylesheet: a later rule
   could reintroduce one and the source would still look clean. */
const glow = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.map-spawn, .map-you-av, .map-ctl')];
  const worst = els.map(el => {
    const sh = getComputedStyle(el).boxShadow || '';
    const blurs = [...sh.matchAll(/px\s+(-?[\d.]+)px\s+([\d.]+)px/g)].map(m => parseFloat(m[2]));
    return { cls: el.className, blur: blurs.length ? Math.max(...blurs) : 0 };
  }).sort((a, b) => b.blur - a.blur)[0];
  return { checked: els.length, worst };
});
ok('BONEYARD no soft-glow chrome', glow.checked > 0 && glow.worst.blur <= 6, JSON.stringify(glow.worst));

// the radius ring proves the metres-to-pixels projection actually ran
const ring = await page.evaluate(() => {
  const el = document.querySelector('.map-radius');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { hidden: el.hidden, w: Math.round(r.width) };
});
ok('BONEYARD collect radius is drawn to scale', !!ring && !ring.hidden && ring.w > 28, JSON.stringify(ring));

/* OSM attribution is a licence requirement, and moving the action card is
   exactly the kind of change that buries it (it did: the den button covered it
   completely at bottom:88px).
   NOT a hit test. `.map-attrib` is pointer-events:none, so elementFromPoint can
   never return it and the check would fail even while it is plainly visible.
   Overlap its rect against everything that floats over the map instead. */
const attrib = await page.evaluate(() => {
  const el = document.querySelector('.map-attrib');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  if (!r.width || !r.height || cs.visibility === 'hidden' || +cs.opacity === 0) return { visible: false, why: 'not rendered' };
  const floaters = [...document.querySelectorAll('.map-act, .btn.map-den, .btn.map-mini, .btn.map-spire-btn, .map-topbar, #tabbar, .map-legend:not([hidden])')];
  const covered = floaters.filter(f => {
    const b = f.getBoundingClientRect();
    if (!b.width || !b.height) return false;
    return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
  }).map(f => f.className || f.id);
  return { visible: covered.length === 0, checked: floaters.length, covered, text: el.textContent.trim() };
});
ok('BONEYARD OSM attribution is not covered', !!attrib && attrib.visible && attrib.checked > 0, JSON.stringify(attrib));
// dingbats used as icons: the mini-boss skull was a ☠ text glyph
ok('BONEYARD mini-boss uses drawn art, not a dingbat', await count('.map-mini-mark .mini-glyph') === 0);
await shot('boneyard');

ok('NO page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
if (srv) srv.kill();

const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran at all'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.name).join(', ')); process.exit(1); }
console.log('t1-audit clean');
process.exit(exitFor(0));
