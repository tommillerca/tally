import { auditOutputPath } from './lib/audit-output.mjs';
/* Onboarding audit: the launch funnel, driven for real on a FRESH profile.
 *
 * WHY. Onboarding is the highest-leverage screen for going public (Tom's stated
 * main goal, 2026-08-07) and it is only reachable on a virgin IndexedDB, which
 * no other suite ever sees: screen-sweep and t1/t2 all boot ?demo. A regression
 * here is invisible everywhere else and costs installs, not sessions.
 *
 * WHAT IT PROVES, and how each check dies:
 *   STEP-1 HOOK      the character poster + restore path exist. Kill the
 *                    onbRestore wiring and RESTORE fails.
 *   STEP-2 REVEAL    the reroll actually changes the generated name (a dead
 *                    reroll renders fine and does nothing), and the pick is
 *                    stashed for the Crew name builder.
 *   STEP-3 PLAN      filling the real form computes real targets, START lands
 *                    on Today with settings persisted.
 *   HONEST SKIP      skipping states the default body in the toast, and the
 *                    saved profile IS that body (30 / 178cm / ~180lb).
 *   BACK             steps 2 and 3 can go back without losing the name pick.
 *
 * PROVE-RED (run 2026-08-07): remove the syncTalent-style reroll listener or
 * stub randomName to a constant and REROLL fails; break saveInitialSettings and
 * PLAN-SAVED fails.
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { serveTree, loadPuppeteer, chromePath, sandboxArgs } from './godmode.js';

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
base = base.replace(/\/?$/, '/');
const sh = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;

const results = [];
const ok = (n, pass, d = '') => { results.push({ n, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); };

const browser = await puppeteer.launch({
  headless: process.env.HEADLESS_MODE || 'new',
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  executablePath: chromePath(),
  args: sandboxArgs(),
});
const errors = [];

async function freshPage() {
  const ctx = await browser.createBrowserContext();   // its own storage: a virgin install
  const p = await ctx.newPage();
  p.on('pageerror', e => { errors.push(e.message); console.log('  PAGEERROR:', e.message.slice(0, 140)); });
  await p.goto(base, { waitUntil: 'networkidle2' });  // NO ?demo
  await sleep(2400);
  await p.waitForSelector('#saveNew', { visible: true });
  await p.click('#saveNew');
  await p.waitForSelector('#onbGo', { visible: true });
  return p;
}
const shot = async (p, n) => { if (sh) await p.screenshot({ path: auditOutputPath(path.join(sh, `onb-${n}.png`)) }); };

/* ---------- run 1: the full happy path ---------- */
let p = await freshPage();
ok('STEP-1 fresh install lands on onboarding', await p.evaluate(() => !!document.querySelector('.onb')));
/* VISIBLE, NOT MERELY PRESENT. This suite passed 15/15 for days while a brand
   new player's first screen was painted at opacity 0: #screen carries
   `.screen:not(.screen-in) { opacity: 0 }` and renderOnboarding writes straight
   into it without routing, so nothing ever added screen-in. Every assertion
   here was about the onboarding's CONTENT, and content was never the problem.
   The effective opacity of the whole ancestor chain is the thing a human sees,
   so multiply it: an ancestor at 0 hides children that each report 1, which is
   exactly how this hid from every check we had.
   PROVE-RED: remove `el.classList.add('screen-in')` from renderOnboarding and
   this fails with effectiveOpacity 0 while every other row stays green. */
const vis = await p.evaluate(() => {
  const el = document.querySelector('.onb');
  if (!el) return { found: false };
  let o = 1, n = el, chain = [];
  while (n && n.nodeType === 1) {
    const c = getComputedStyle(n);
    o *= parseFloat(c.opacity);
    if (c.visibility === 'hidden' || c.display === 'none') o = 0;
    chain.push(`${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}=${c.opacity}`);
    n = n.parentElement;
  }
  const r = el.getBoundingClientRect();
  return { found: true, effectiveOpacity: +o.toFixed(3), w: Math.round(r.width), h: Math.round(r.height), chain: chain.join(' ') };
});
ok('STEP-1 the onboarding is actually VISIBLE, not just present in the DOM',
  vis.found && vis.effectiveOpacity > 0.9 && vis.w > 100 && vis.h > 100,
  `effectiveOpacity=${vis.effectiveOpacity} ${vis.w}x${vis.h}  chain: ${vis.chain}`);
ok('STEP-1 the character poster renders its layers', await p.evaluate(() =>
  document.querySelectorAll('.onb-poster img.ly').length >= 5 &&
  [...document.querySelectorAll('.onb-poster img.ly')].every(i => i.naturalWidth > 0)));
await p.evaluate(() => document.getElementById('onbRestore')?.click());
await sleep(1200);
ok('RESTORE opens the recovery sheet from screen 1', await p.evaluate(() =>
  !!document.querySelector('.sheet') && /recovery id/i.test(document.querySelector('.sheet').innerText)));
await p.evaluate(() => history.back());
await sleep(800);
await shot(p, '1');

await p.evaluate(() => document.getElementById('onbGo')?.click());
await sleep(900);
const name1 = await p.evaluate(() => document.getElementById('onbName')?.textContent);
ok('STEP-2 the reveal shows a generated name', !!name1 && name1.length > 3, name1);
// reroll until the name changes: two random picks CAN collide, so one identical
// draw is not a failure, but five in a row means the reroll is dead
let name2 = name1;
for (let i = 0; i < 5 && name2 === name1; i++) {
  await p.evaluate(() => document.getElementById('onbReroll')?.click());
  await sleep(300);
  name2 = await p.evaluate(() => document.getElementById('onbName')?.textContent);
}
ok('STEP-2 REROLL actually changes the name', name2 !== name1, `${name1} -> ${name2}`);
ok('STEP-2 the bare starter has no gear layers', await p.evaluate(() =>
  document.querySelectorAll('.onb-poster.bare img.ly').length === 2));
await shot(p, '2');

// back keeps the pick
await p.evaluate(() => document.getElementById('onbBack')?.click());
await sleep(700);
await p.evaluate(() => document.getElementById('onbGo')?.click());
await sleep(700);
const nameBack = await p.evaluate(() => document.getElementById('onbName')?.textContent);
ok('BACK returning to the reveal keeps the same name', nameBack === name2, `${nameBack}`);

await p.evaluate(() => document.getElementById('onbMe')?.click());
await sleep(900);
ok('STEP-3 the plan form renders', await p.evaluate(() => !!document.getElementById('pfAge')));
await p.evaluate(() => {
  const set = (id, v) => { const e = document.getElementById(id); if (!e) return; e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); };
  set('pfAge', '29'); set('pfFt', '5'); set('pfIn', '10'); set('pfW', '180');
});
await sleep(700);
const preview = await p.evaluate(() => document.getElementById('pfPreview')?.textContent || '');
ok('STEP-3 the live preview computed real targets', /\d{3,4}/.test(preview), preview.slice(0, 60));
await shot(p, '3');
await p.evaluate(() => document.getElementById('onbSave')?.click());
await sleep(2600);
const landed = await p.evaluate(async () => {
  const db = (await import('./js/db.js'));
  const s = await db.kvGet('settings', null);
  const pick = await db.kvGet('onbName', null);
  return { hash: location.hash, saved: !!s, age: s?.profile?.age, tabbar: getComputedStyle(document.getElementById('tabbar')).display !== 'none', pick: !!pick };
});
ok('PLAN-SAVED start lands on Today with settings persisted',
   landed.hash.includes('today') && landed.saved && landed.age === 29 && landed.tabbar, JSON.stringify(landed));
ok('NAME-STASHED the pick is stored for the Crew name builder', landed.pick);
await p.browserContext().close();

/* ---------- run 2: the honest skip ---------- */
p = await freshPage();
await p.evaluate(() => document.getElementById('onbGo')?.click()); await sleep(700);
await p.evaluate(() => document.getElementById('onbMe')?.click()); await sleep(700);
const skipText = await p.evaluate(() => document.getElementById('onbSkip')?.textContent || '');
ok('HONEST-SKIP the skip states the default body up front', /30 yr/.test(skipText) && /180 lb/.test(skipText), skipText.slice(0, 70));
/* v278 gave the toast a QUEUE, so a single read at a fixed time now sees
   whichever message is at the head (a boot tip fires before the welcome kit and
   is no longer stomped). Observe the slot for the whole window instead: the
   contract is that the welcome kit is SAID, not that it is said first. */
await p.evaluate(() => {
  window.__toasts = [];
  const t = document.getElementById('toast');
  new MutationObserver(() => { if (!t.hidden && t.textContent) window.__toasts.push(t.textContent); })
    .observe(t, { childList: true, attributes: true, characterData: true, subtree: true });
});
await p.evaluate(() => document.getElementById('onbSkip')?.click());
await sleep(7000);
const skipped = await p.evaluate(async () => {
  const db = (await import('./js/db.js'));
  const s = await db.kvGet('settings', null);
  return { saved: !!s, h: s?.profile?.heightCm, kg: Math.round(s?.profile?.weightKg || 0), toast: [...new Set(window.__toasts)].join(' | ') };
});
ok('HONEST-SKIP saved profile IS the stated body', skipped.saved && skipped.h === 178 && skipped.kg === 82, JSON.stringify(skipped));
/* the defaults statement lives in the skip line BEFORE the tap (asserted above);
   after it, the single toast slot belongs to the welcome kit. A defaults toast
   here was being stomped unread at +1.2s, so it was removed rather than queued. */
ok('HONEST-SKIP the welcome kit still greets the skipper', /welcome kit/i.test(skipped.toast), skipped.toast.slice(0, 60));
await p.browserContext().close();

/* M5 frozen order, 2026-09-07: the first run keeps its splash. The player
   dismisses that intro, then the first onboarding CTA must receive the tap.
   first-run-honesty-audit also watches a boot without the forced preview. */
{
  const ctx = await browser.createBrowserContext();
  const p3 = await ctx.newPage();
  p3.on('pageerror', e => errors.push(e.message));
  await p3.goto(base + '?splash=1', { waitUntil: 'domcontentloaded' });
  await p3.waitForSelector('#splash', { timeout: 15000 });
  await p3.click('#splash');
  await p3.waitForSelector('#splash', { hidden: true });
  await p3.waitForSelector('#onbGo', { timeout: 15000 });
  const covered = await p3.evaluate(() => {
    const el = document.getElementById('onbGo'), b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2,
      hit: el.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)) };
  });
  await p3.touchscreen.tap(covered.x, covered.y);
  await p3.waitForSelector('#onbName', { timeout: 3000 });
  ok('M5 first onboarding CTA receives the tap after the intro', covered.hit, `hit=${covered.hit}`);
  await ctx.close();
}

/* ---------- R39-15: the primary CTA sits at the fold on a short phone ----------
   Handoff round 39: at 375x667 (iPhone SE) step 2's "That's me" measured 22px
   below the fold at first paint and step 3's "Start tracking" 293px below, with
   no scroll cue. .onb-foot used margin-top:auto, which only pushes the button
   down when #screen has leftover space; a short phone overflows before that
   space exists, so the button just sits wherever the content stack ends.
   Fixed with position:sticky (bottom:0) on .onb-foot so it rides #screen's own
   scrollport edge from first paint instead of the end of the content.
   PROVE-RED (run against origin/main before the CSS/markup change): both rows
   at both viewports failed with bottom > viewport, matching the numbers above. */
/* ---------- R43-4 / R43-5: the footer must not EAT the step it sits under ----
   The sticky footer that fixed R39-15 overshot. Measured on the shipped tip
   (v493) at 320x568: .onb-foot is an opaque 159.8px of a 568px viewport, the
   nameplate on THIS ONE'S YOURS is 0% visible, a real click at the reroll's
   coordinates leaves the name unchanged, and 144px of scroll is needed to get
   the plate out from under it. At 375x667 the plate is 46.7% visible. On THE
   PLAN a selected chip is behind the footer at all three viewports, 393x852
   included, where the whole Goal row is under #onbSave.

   DIRECTION AND BOUND (anti-regression rule 11), because both failures here are
   two-sided and a check that only watches one of them is worthless:
     the CTA's bottom edge must be <= the viewport         (R39-15's direction)
     the nameplate's VISIBLE fraction must be >= 0.9       (R43-4's direction)
   The first is what the sticky footer bought and the second is what it cost, so
   they are asserted in the same pass at the same viewport. Anything that fixes
   one by giving up the other goes red here.

   VISIBLE means visible to a person: the rect clipped by the viewport AND by
   every scrollport above it, then minus whatever the footer covers. A rect that
   is merely "in the DOM at these coordinates" is what let this ship.

   PROVE-RED: run against origin/main (v504, 6e55bbf) with only this file
   changed. Expected and observed there: NAMEPLATE-VISIBLE 0.000 at 320x568 and
   0.467 at 375x667, REROLL-CLICK unchanged at both, CHIPS-CLEAR red at all
   three. R39-15's own rows stay green on both trees, which is the point. */
const boxProbe = () => {
  /* the fraction of `el` a person can actually see, and what a click at its
     centre would land on. Walks the scrollport chain so a clip by .onb-scroll
     counts the same as a clip by the window. */
  const clipped = el => {
    let r = el.getBoundingClientRect();
    let box = { top: Math.max(r.top, 0), bottom: Math.min(r.bottom, innerHeight), left: Math.max(r.left, 0), right: Math.min(r.right, innerWidth) };
    for (let n = el.parentElement; n; n = n.parentElement) {
      const c = getComputedStyle(n);
      if (!/auto|scroll|hidden/.test(c.overflowY + c.overflowX)) continue;
      const q = n.getBoundingClientRect();
      box = { top: Math.max(box.top, q.top), bottom: Math.min(box.bottom, q.bottom), left: Math.max(box.left, q.left), right: Math.min(box.right, q.right) };
    }
    /* TWO NUMBERS, NOT ONE, and the difference is the whole point. `clip` is how
       much survives the viewport and every scrollport above it; `covered` is how
       much of that the footer paints over. A chip scrolled past the content's
       own fold has clip 0 and is not a defect (CHIPS-REACHABLE scrolls to it). A
       chip the footer sits on top of has clip 1 and covered 1 and IS the defect.
       Collapsing them into one fraction grades those two identically, which on
       the fixed tree silently excused the case this file exists to catch. */
    const foot = document.querySelector('.onb-foot');
    const whole = Math.max(1, r.width * r.height);
    const area = Math.max(0, box.bottom - box.top) * Math.max(0, box.right - box.left);
    let cov = 0;
    if (foot) {
      const f = foot.getBoundingClientRect();
      const oh = Math.max(0, Math.min(box.bottom, f.bottom) - Math.max(box.top, f.top));
      const ow = Math.max(0, Math.min(box.right, f.right) - Math.max(box.left, f.left));
      cov = oh * ow;
    }
    return { clip: area / whole, covered: cov / whole };
  };
  const hit = el => {
    const r = el.getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { tag: e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') : 'none', self: !!e && (e === el || el.contains(e)), inFoot: !!e && !!e.closest('.onb-foot') };
  };
  return { clipped, hit };
};

for (const vp of [{ w: 375, h: 667 }, { w: 320, h: 568 }, { w: 393, h: 852 }]) {
  const ctx = await browser.createBrowserContext();
  const pv = await ctx.newPage();
  await pv.setViewport({ width: vp.w, height: vp.h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await pv.goto(base, { waitUntil: 'networkidle2' });
  await sleep(2000);
  await pv.evaluate(() => document.getElementById('onbGo')?.click());
  await sleep(900);
  const meBottom = await pv.evaluate(() => document.getElementById('onbMe')?.getBoundingClientRect().bottom);
  ok(`R39-15 "That's me" is inside the fold at ${vp.w}x${vp.h}`, meBottom != null && meBottom <= vp.h, `bottom=${meBottom} viewport=${vp.h}`);

  const plate = await pv.evaluate(probe => {
    const { clipped, hit } = (new Function('return ' + probe))()();
    const np = document.querySelector('.onb-nameplate');
    const rr = document.getElementById('onbReroll');
    const foot = document.querySelector('.onb-foot');
    if (!np) return { found: false };
    const c = clipped(np);
    return { found: true, frac: +(c.clip - c.covered).toFixed(3), hit: hit(np), rerollHit: rr ? hit(rr) : null,
      footH: foot ? +foot.getBoundingClientRect().height.toFixed(1) : null,
      rrBox: rr ? (b => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 }))(rr.getBoundingClientRect()) : null };
  }, boxProbe.toString());
  ok(`R43-4 NAMEPLATE-VISIBLE the name is on screen at ${vp.w}x${vp.h}`,
    plate.found && plate.frac >= 0.9 && plate.hit.self,
    `visibleFraction=${plate.frac} centreHits=${plate.hit?.tag} footer=${plate.footH}px of ${vp.h}`);

  /* A REAL CLICK AT THE BUTTON'S COORDINATES, not element.click(): the whole
     defect is that something else owns those pixels, and a programmatic click
     ignores that and passes. Reroll up to 5 times, because two random draws can
     legitimately collide (the happy-path run above uses the same allowance). */
  const before = await pv.evaluate(() => document.getElementById('onbName')?.textContent);
  let after = before;
  for (let i = 0; i < 5 && after === before && plate.rrBox; i++) {
    await pv.mouse.click(plate.rrBox.x, plate.rrBox.y);
    await sleep(300);
    after = await pv.evaluate(() => document.getElementById('onbName')?.textContent);
  }
  ok(`R43-4 REROLL-CLICK a click at the reroll's own coordinates rerolls at ${vp.w}x${vp.h}`,
    !!plate.rrBox && after !== before && !plate.rerollHit.inFoot,
    `${before} -> ${after} centreHits=${plate.rerollHit?.tag}`);

  await pv.evaluate(() => document.getElementById('onbMe')?.click());
  await sleep(900);
  const saveBottom = await pv.evaluate(() => document.getElementById('onbSave')?.getBoundingClientRect().bottom);
  ok(`R39-15 "Start tracking" is inside the fold at ${vp.w}x${vp.h}`, saveBottom != null && saveBottom <= vp.h, `bottom=${saveBottom} viewport=${vp.h}`);

  /* R43-5. The selected chips are the answer to the only question this step
     asks, so a chip that is on screen must be readable and pressable. A chip
     scrolled past the content's own fold is fine and is asserted separately:
     bring it into view and it must answer its own hit test. An EMPTY chip list
     is a failure, not a pass (anti-regression rule 3): the form ships with four
     defaults selected. */
  const chips = await pv.evaluate(probe => {
    const { clipped, hit } = (new Function('return ' + probe))()();
    const sel = [...document.querySelectorAll('#pfHost button')].filter(b => b.classList.contains('on'));
    const foot = document.querySelector('.onb-foot').getBoundingClientRect();
    return sel.map(c => {
      const r = c.getBoundingClientRect();
      const g = clipped(c);
      const h = hit(c);
      return { t: c.textContent.trim().slice(0, 16), clip: +g.clip.toFixed(3), covered: +g.covered.toFixed(3),
        overlapsFoot: r.bottom > foot.top && r.top < foot.bottom, hit: h.tag, self: h.self, inFoot: h.inFoot };
    });
  }, boxProbe.toString());
  const eaten = chips.filter(c => c.clip > 0.05 && c.covered > 0.1 * c.clip);
  ok(`R43-5 CHIPS-CLEAR no selected chip is behind the footer at ${vp.w}x${vp.h}`,
    chips.length >= 3 && eaten.length === 0,
    `${chips.length} selected, eaten=${eaten.length} ${eaten.map(c => `${c.t} clip=${c.clip} covered=${c.covered} hits ${c.hit}`).join(', ')}`);

  const reached = await pv.evaluate(probe => {
    const { hit } = (new Function('return ' + probe))()();
    const sel = [...document.querySelectorAll('#pfHost button')].filter(b => b.classList.contains('on'));
    return sel.map(c => { c.scrollIntoView({ block: 'center' }); const h = hit(c); return { t: c.textContent.trim().slice(0, 16), tag: h.tag, self: h.self }; });
  }, boxProbe.toString());
  ok(`R43-5 CHIPS-REACHABLE every selected chip answers its own hit test once scrolled to at ${vp.w}x${vp.h}`,
    reached.length >= 3 && reached.every(r => r.self),
    reached.filter(r => !r.self).map(r => `${r.t} hits ${r.tag}`).join(', ') || `${reached.length}/${reached.length}`);

  if (sh) await pv.screenshot({ path: auditOutputPath(path.join(sh, `onb-plan-${vp.w}x${vp.h}.png`)) });
  await ctx.close();
}

ok('NO page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
if (srv) srv.kill();
const failed = results.filter(r => !r.pass);
if (!results.length) { console.log('\nFAIL: no checks ran'); process.exit(1); }
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED: ' + failed.map(f => f.n).join(', ')); process.exit(1); }
console.log('onb-audit clean');
