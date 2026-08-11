/* THE PADDOCK CARDS: what only a browser can answer.
 *
 * The models are unit-tested in node (unit.test.js, "paddock:" tests) because they
 * are pure. This file owns the rest, and its crown jewel is the ROUND TRIP: a bond
 * banked by pressing the real button must still be there after a reload. Rendering
 * a filled heart proves nothing about persistence, and this project has shipped a
 * derived-at-read-time value that looked right and was never stored (v222 paidLooks).
 *
 * It drives the REAL builders and the REAL handlers through window.__pdkMountCards,
 * a webdriver-only seam. Nothing here hand-calls bondUp or paints a heart itself:
 * the act is performed by the code that ships.
 *
 * Run: node tests/paddock-card-audit.mjs <baseUrl>
 */
import { boot, seed, sleep, settle, setWidth } from './godmode.js';
import { PET_CROP } from '../data/boneheadz.js';

/* TIMED-ABSENCE CHECKS, DECLARED (Reggie's refinement to the gate-contention rule,
   2026-08-11). Most assertions here cannot be faked by machine load: contention cannot
   make a wrong DOM state read right, so a green is credible and a RED is the suspect.
   These two are the exception, and they are the ones he fished for when he asked what
   would break my argument. Both assert that something did NOT happen within a wait, so
   a starved renderer can satisfy them for the wrong reason: the burst never got to
   fire, the dismissal never got to run. A green on THESE two only means something on a
   quiet machine.
   The list is MECHANICAL, not prose: every name here must match a check that actually
   ran, and DRIFT below fails if one does not. A comment naming checks would rot the
   first time somebody reworded one, which is the disease that has bitten this repo
   twice today already. */
const TIMED_ABSENCE = [
  'and a refused press at the cap fires NO burst',
  'and tapping INSIDE the card does not dismiss it',
  'RITUAL: a second press today fires NO burst and SAYS WHY (never a dead button)',
];

const fails = [];
const ran = [];
const ok = (n, p, d = '') => { ran.push(n); console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const base = process.argv[2] || process.env.URL;
if (!base) {
  console.log('FAIL  paddock-card-audit needs a base URL, and there is no safe default.');
  console.log('        Use `npm run gate`, or: node tests/paddock-card-audit.mjs http://127.0.0.1:PORT/');
  process.exit(1);
}

const { browser, page, errors: errs } = await boot(base);

/* A roster to work with. Pets are instances, so seed real instance rows the way the
   game writes them rather than inventing a shape the app would never produce. */
const seeded = await page.evaluate(async () => {
  if (!new URLSearchParams(location.search).has('demo')) return { error: 'refusing to seed: not in ?demo' };
  const db = await new Promise((res, rej) => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const put = (store, rows) => new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite'); rows.forEach(r => tx.objectStore(store).put(r));
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  const pets = [
    { iid: 'w1', sp: 'C5', lineage: 0, shiny: false, hatchedAtSteps: 0 },
    { iid: 'w2', sp: 'C5', lineage: 0, shiny: false, hatchedAtSteps: 0 },
    { iid: 'w3', sp: 'C5', lineage: 1, shiny: true, hatchedAtSteps: 0 },
  ];
  /* instances live in the kv 'petInst' ARRAY (loot.js petInstances), not as inv
     rows: seeding the wrong store left the Stable with no pets, so its Paddock
     button never rendered and every check below cascaded off one missing control */
  await put('kv', [{ k: 'petInst', v: pets }]);
  return { pets: pets.length };
});
if (seeded.error) { console.log(`FAIL  ${seeded.error}`); await browser.close(); process.exit(1); }
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction(() => typeof window.__pdkMountCards === 'function', { timeout: 30000, polling: 100 })
  .then(() => {}).catch(() => {});
await setWidth(page, 390, 900);

/* OPEN THE REAL SCREEN FIRST. The cards mount into the scene's own DOM (#pdkScene,
   #pdkPanel), so a seam that mounts into a bare body would be testing markup in a
   vacuum. Drive the real entry point: the Stable's Paddock button. */
/* Reaching the Paddock is done TWICE (once before the bond, once after the reload),
   so it is one function: a second hand-rolled copy is how the post-reload half ended
   up never opening the screen at all, which read as a persistence failure. */
/* THE DAILY RITUAL CHANGED THE ECONOMICS OF THIS SCREEN, and four checks below were
   written against the old rule. Pressing Pet ten times used to bank ten hearts; now each
   kind lands once per pet per LOCAL DAY, so a press loop banks one. Those checks are
   about the CAP and about an animation that must not lie, not about the daily rule, so
   they need successive DAYS rather than successive taps. Wiping today's care record is
   exactly that: the next press is tomorrow's. Loosening them to expect one heart would
   have deleted the cap coverage, which is the drift trap. */
const nextDay = () => page.evaluate(async () => {
  const db = await new Promise(res => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); });
  await new Promise(res => { const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').delete('petCare'); tx.oncomplete = res; });
});

async function reachPaddock() {
  /* WAIT FOR EACH CONTROL BEFORE CLICKING IT. This clicked #stableBtn optional-chained
     with no wait, so on a slow first render the click hit nothing, silently, and then
     the run sat for 30s waiting for a sheet that was never going to open. Measured
     flaky 1-in-3 that way. Every step now waits for its own precondition, which makes
     reaching the screen deterministic instead of lucky: the clock-versus-condition
     lesson, one level up from the waits inside the screen. */
  const gone = await page.waitForFunction(() => !!document.getElementById('stableBtn'),
    { timeout: 30000, polling: 100 }).then(() => false).catch(() => true);
  if (gone) return false;
  await page.evaluate(() => document.getElementById('stableBtn').click());
  await page.waitForFunction(() => !!document.getElementById('stableToPaddock'), { timeout: 30000, polling: 100 }).catch(() => {});
  /* SETTLE BEFORE MEASURING. The Stable is a sheet and it ANIMATES IN. Reading the
     button's rect mid-animation and then mouse-clicking those coordinates meant the
     click landed where the button had been, so the Paddock never opened: measured
     flaky 2-in-4. godmode's settle() finishes the animations first, which is what it
     exists for (headless Chrome leaves sheet transforms parked, per its own note). */
  await settle(page, 250);
  const at = await page.evaluate(() => {
    const b = document.getElementById('stableToPaddock');
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (at) await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => !!document.getElementById('pdkScene'), { timeout: 30000, polling: 100 }).catch(() => {});
  await settle(page, 400);
  return !!at;
}

const opened = await reachPaddock();
ok('the Stable offers a way into the Paddock', !!opened, opened ? '' : 'no #stableToPaddock control');
const screen = await page.evaluate(() => ({
  scene: !!document.getElementById('pdkScene'),
  panelMounted: (document.getElementById('pdkPanel')?.children.length || 0) > 0,
  tiles: document.querySelectorAll('#pdkPanel .pdk-tile').length,
  foot: document.querySelector('#pdkPanel .pdk-seg.on')?.textContent?.trim() || null,
}));
ok('the Paddock scene opened', screen.scene, JSON.stringify(screen));
/* the panel is Lane W's and is mounted as the sheet opens, not on first tap */
ok('the collection panel mounted itself with the screen', screen.panelMounted && screen.tiles > 0,
  `${screen.tiles} tiles, footer ${screen.foot}`);

const mounted = await page.evaluate(async () => window.__pdkMountCards ? await window.__pdkMountCards('C5') : null);
ok('the seam mounts real cards for a real roster', !!mounted && mounted.opened && mounted.copies === 3,
  JSON.stringify(mounted));
await settle(page, 250);

const shape = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#pdkCards .pdk-card')];
  const dots = [...document.querySelectorAll('#pdkCards .pdk-dot')];
  return { cards: cards.length, dots: dots.length, iids: cards.map(c => c.dataset.iid),
           visible: cards.filter(c => c.getBoundingClientRect().width > 8).length,
           pdClasses: [...document.querySelectorAll('#pdkCards *')]
             .flatMap(n => [...n.classList]).filter(c => /^pd-/.test(c)) };
});
ok('one card per owned copy, all of them drawn', shape.cards === 3 && shape.visible === 3, JSON.stringify(shape));
ok('and dots match the copies', shape.dots === 3, `${shape.dots} dots`);
/* the namespace collision, checked in the RENDERED dom and not only in the builder */
ok('nothing rendered lands in the paperdoll namespace', shape.cards > 0 && shape.pdClasses.length === 0,
  shape.cards ? (shape.pdClasses.join(', ') || 'no .pd- classes present') : 'NO CARDS RENDERED: an empty dom has no .pd- classes either, which is not a pass');

/* MOUNT FROM A KNOWN STATE. `__pdkMountCards(sp)` is the real tap path, so calling it
   on the species already open DISMISSES it (that is the re-tap rule this audit also
   checks). Steps that just want the card present must close first, or they silently
   test an empty screen: that is exactly what happened when the later checks started
   reporting 0 pips and no close control. */
const ensureOpen = async sp => page.evaluate(async species => {
  window.__pdkClose && window.__pdkClose();
  await new Promise(r => setTimeout(r, 120));
  const res = await window.__pdkMountCards(species);
  await new Promise(r => setTimeout(r, 220));
  return res;
}, sp);

/* ---- THE ROUND TRIP ------------------------------------------------------ */
const before = await page.evaluate(() => document.querySelectorAll('#pdkCards .pdk-card[data-iid="w1"] .pdk-heart.on').length);
const clicked = await page.evaluate(() => {
  const b = document.querySelector('#pdkCards .pdk-card[data-iid="w1"] .pdk-btn-pet');
  if (!b) return false;
  b.scrollIntoView({ block: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
ok('the Pet button is there to press', !!clicked, clicked ? '' : 'no Pet button on the first card');
if (clicked) await page.mouse.click(clicked.x, clicked.y);
await page.waitForFunction(() => document.querySelectorAll('#pdkCards .pdk-card[data-iid="w1"] .pdk-heart.on').length > 0,
  { timeout: 8000, polling: 60 }).catch(() => {});
const afterPress = await page.evaluate(() => document.querySelectorAll('#pdkCards .pdk-card[data-iid="w1"] .pdk-heart.on').length);
ok('pressing Pet fills a heart', afterPress === before + 1, `${before} -> ${afterPress}`);

/* RELOAD. This is the assertion the whole file exists for: not that a heart was
   painted, but that the bond survived leaving the page. */
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction(() => typeof window.__pdkMountCards === 'function', { timeout: 30000, polling: 100 }).catch(() => {});
await setWidth(page, 390, 900);
/* ASSERT THE REOPEN. The sheet does not survive a reload, the bond must. When this
   was silent, a failed reopen read as "the bond did not persist", which sent me
   hunting a persistence bug in Lane R's bondUp that did not exist. */
const reopened = await reachPaddock();
const sceneBack = reopened && await page.evaluate(() => !!document.getElementById('pdkScene'));
ok('the Paddock reopens after the reload', sceneBack,
  sceneBack ? '' : (reopened ? 'scene missing after reopen' : 'could not reach the Stable or its Paddock button again'));
const remounted = await page.evaluate(async () => window.__pdkMountCards ? await window.__pdkMountCards('C5') : null);
ok('and the cards remount from the persisted roster', !!remounted && remounted.opened,
  JSON.stringify(remounted));
await settle(page, 250);
const survived = await page.evaluate(() => ({
  hearts: document.querySelectorAll('#pdkCards .pdk-card[data-iid="w1"] .pdk-heart.on').length,
  kv: null,
}));
ok('THE ROUND TRIP: the bond is still there after a reload', afterPress > 0 && survived.hearts === afterPress,
  `${afterPress} before the reload, ${survived.hearts} after (on a save that had no petBonds key at all)`);

/* ---- the cap, and an animation that must not lie ------------------------- */
const capped = await page.evaluate(async () => {
  /* "tomorrow", inline: raw kv, the same way this file seeds everything else. It lives
     here rather than as a seam in the shipped module, because a test-only trapdoor into
     player data is not something to ship for the sake of a tidier test. */
  const tomorrow = async () => {
    const db = await new Promise(res => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); });
    await new Promise(res => { const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete('petCare'); tx.oncomplete = res; });
  };
  const btn = () => document.querySelector('#pdkCards .pdk-card[data-iid="w2"] .pdk-btn-pet');
  const hearts = () => document.querySelectorAll('#pdkCards .pdk-card[data-iid="w2"] .pdk-heart.on').length;
  for (let i = 0; i < 7; i++) {
    await tomorrow();                     // successive DAYS, not successive taps
    btn()?.click();
    await new Promise(r => setTimeout(r, 260));
  }
  const atCap = hearts();
  const bffs = document.querySelectorAll('#pdkCards .pdk-card[data-iid="w2"] .pdk-bff').length;
  /* press once more AT the cap and watch for a burst: bondUp returns changed:false,
     so celebrating would be an animation over a write that never happened. On a FRESH
     day, so the refusal is the cap refusing and not the daily rule: a check that passes
     for the wrong reason is the thing this file exists to avoid. */
  await tomorrow();
  btn()?.click();
  await new Promise(r => setTimeout(r, 220));
  const burstAtCap = document.querySelectorAll('#pdkCards .pdk-card[data-iid="w2"] .pdk-burst').length;
  return { atCap, bffs, burstAtCap, overfilled: hearts() };
});
ok('the bond caps at 5 however many times you press', capped.atCap === 5 && capped.overfilled === 5, JSON.stringify(capped));
ok('BEST FRIEND appears once at the cap, not once per press', capped.bffs === 1, `${capped.bffs} badges`);
ok('and a refused press at the cap fires NO burst', capped.atCap === 5 && capped.burstAtCap === 0,
  `${capped.burstAtCap} bursts after pressing a maxed pet`);

/* THE BURST, READ AS MOTION AND NOT AS GEOMETRY. My first version measured rect size
   and opacity mid-animation and passed, and Reggie's paddock-scene work then showed
   why that green was not evidence: in headless Chrome the compositor keeps painting
   while the MAIN-THREAD animation clock freezes, so a rect and a computed transform
   can both read a frozen identity on motion a player plainly sees. The honest read is
   WAAPI: the element's own animation reports a playState and a currentTime that
   ADVANCES. Geometry is still checked, because a moving element nobody can see is
   also a failure, but movement is now proven by the clock rather than assumed. */
const burst = await page.evaluate(async () => {
  const b = document.querySelector('#pdkCards .pdk-card[data-iid="w3"] .pdk-btn-feed');
  if (!b) return { why: 'no Feed button' };
  b.click();
  await new Promise(r => setTimeout(r, 90));
  const glyphs = [...document.querySelectorAll('#pdkCards .pdk-card[data-iid="w3"] .pdk-glyph')];
  if (!glyphs.length) return { why: 'no glyphs created' };
  const anim = glyphs.flatMap(g => g.getAnimations()).find(a => /pdkFloat/.test(a.animationName));
  if (!anim) return { why: 'no pdkFloat animation on the glyphs' };
  /* read currentTime RAW and subtract, the way paddock-scene-audit's ALIVE clock does.
     My first attempt wrapped it as `Number(a.currentTime) || 0`, which collapses a
     non-plain value to 0 for BOTH samples, so the delta was always 0 and the check
     failed on healthy code. The window is short on purpose: pdkFloat is 850ms and the
     wrapper is removed at 950ms, so a 400ms sample would land after the end. */
  const t0 = anim.currentTime;
  const state0 = anim.playState;
  await new Promise(r => setTimeout(r, 200));
  const dt = anim.currentTime - t0;
  const shown = glyphs.filter(g => {
    const r = g.getBoundingClientRect(), cs = getComputedStyle(g);
    return r.width > 2 && r.height > 2 && +cs.opacity > 0.05;
  }).length;
  return { glyphs: glyphs.length, state: state0, dt, shown,
           hearts: glyphs.filter(g => g.querySelector('svg.bhi')).length };
});
ok('Feed fires a 3-glyph burst', !burst.why && burst.glyphs === 3, burst.why || `${burst.glyphs} glyphs`);
/* MOTION, read on the WAAPI clock the way paddock-scene-audit's ALIVE check does.
   CORRECTION WORTH KEEPING: I first measured +0ms here and nearly wrote it up as a
   headless platform limit. It was my own bug: the sampled glyphs belonged to a card my
   test had just DISMISSED by calling the mount seam on the already-open species, so I
   was reading a detached animation. From a known-open card the clock advances the full
   sample window. Read currentTime raw and subtract; wrapping it as
   `Number(x) || 0` collapses to 0 for both samples and fails on healthy code. */
ok('the burst really ANIMATES (running, and its clock advances)',
  !burst.why && burst.state === 'running' && burst.dt > 80,
  burst.why || `playState ${burst.state}, currentTime +${Math.round(burst.dt || 0)}ms over a 200ms window`);
ok('and it is on screen while it runs', !burst.why && burst.shown > 0,
  burst.why || `${burst.shown} of ${burst.glyphs} visible mid-animation`);

/* NO PIXEL-DIFF HALF HERE, DELIBERATELY. paddock-scene-audit pairs its WAAPI clock
   with a screenshot byte-diff, and that pairing is right for the scene: long-running
   compositor animations on elements that live for the whole session. I tried the same
   pairing here and could not make it honest. Two shots of the card region, clip raised
   60px to cover the glyphs' travel, came back byte-identical on a burst whose clock
   demonstrably advances 200ms in the same window. Rather than keep a red check I
   cannot explain, or soften it into something that passes without meaning, the motion
   claim rests on the clock alone, which IS proven red below. If someone later needs
   the pixel half for a 850ms dynamically-created animation, the open question is why
   the captures do not straddle the travel; it is not that the burst is static. */

/* and the PET burst carries the real heart (Feed carries bones, by design) */
await ensureOpen('C5');
await nextDay();          // the burst checks press expecting a WRITE, so: tomorrow
const petGlyphs = await page.evaluate(async () => {
  document.querySelector('#pdkCards .pdk-card[data-iid="w1"] .pdk-btn-pet')?.click();
  await new Promise(r => setTimeout(r, 150));
  const g = [...document.querySelectorAll('#pdkCards .pdk-card[data-iid="w1"] .pdk-glyph')];
  return { n: g.length, hearts: g.filter(x => x.querySelector('svg.bhi')).length };
});
ok('the Pet burst glyphs are the real heart icon', petGlyphs.n > 0 && petGlyphs.hearts === petGlyphs.n,
  `${petGlyphs.hearts} of ${petGlyphs.n} carry svg.bhi`);

/* ---- W-PADDOCK-2: hearts are hearts, not dots ---------------------------- */
await ensureOpen('C5');
const hearts = await page.evaluate(() => {
  const pips = [...document.querySelectorAll('#pdkCards .pdk-card[data-iid="w1"] .pdk-heart')];
  return { pips: pips.length, withIcon: pips.filter(p => p.querySelector('svg.bhi')).length,
           /* a CSS circle would have a border-radius and no svg: that is the "red dots"
              Tom reported, so assert the ICON is there rather than trusting the class */
           stillCircles: pips.filter(p => !p.querySelector('svg') && getComputedStyle(p).borderRadius !== '0px').length };
});
ok('the bond meter draws real heart icons, not CSS dots', hearts.pips === 5 && hearts.withIcon === 5 && hearts.stillCircles === 0,
  JSON.stringify(hearts));

/* ---- W-PADDOCK-1: every way out of the card ------------------------------ */
await ensureOpen('C5');
const exits = await page.evaluate(async () => {
  const open = () => document.querySelectorAll('#pdkCards .pdk-card').length;
  const out = {};
  /* the × on the card */
  const x = document.querySelector('#pdkCards .pdk-card .pdk-x-btn');
  out.hasCloseControl = !!x;
  if (x) { x.click(); await new Promise(r => setTimeout(r, 200)); out.closedByX = open() === 0; }
  /* reopen, then tap the SCENE outside the card. Safe to mount directly here because
     the × above closed it, so this is not a re-tap. */
  await window.__pdkMountCards('C5');
  await new Promise(r => setTimeout(r, 250));
  out.reopened = open() > 0;
  const scene = document.getElementById('pdkScene');
  const sr = scene.getBoundingClientRect();
  /* a corner of the scene, deliberately away from the card */
  scene.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: sr.left + 6, clientY: sr.top + 6 }));
  await new Promise(r => setTimeout(r, 220));
  out.closedByOutsideTap = open() === 0;
  /* and a tap INSIDE the card must NOT dismiss it */
  await window.__pdkMountCards('C5');
  await new Promise(r => setTimeout(r, 250));
  const card = document.querySelector('#pdkCards .pdk-card');
  card?.querySelector('.pdk-flavor')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 220));
  out.survivedInsideTap = open() > 0;
  return out;
});
ok('the card carries a visible close control, and it closes', exits.hasCloseControl && exits.closedByX, JSON.stringify(exits));
ok('tapping the scene outside the card dismisses it', exits.reopened && exits.closedByOutsideTap, JSON.stringify(exits));
/* the other half of the same rule: the dismisser must not eat taps on the card */
ok('and tapping INSIDE the card does not dismiss it', exits.survivedInsideTap, JSON.stringify(exits));

const retap = await page.evaluate(async () => {
  const wasOpen = document.querySelectorAll('#pdkCards .pdk-card').length > 0;
  const openAgain = await window.__pdkMountCards('C5');   // same species = dismiss
  return { wasOpen, stillOpen: openAgain.open, cards: document.querySelectorAll('#pdkCards .pdk-card').length };
});
ok('re-tapping the same species dismisses the slider', retap.wasOpen === true && retap.stillOpen === false && retap.cards === 0,
  JSON.stringify(retap));

/* INK FIT (figure contract rule 3). Tom: the pets read small and off-centre in their
   boxes. This measures what he was looking at: the ink bounding box mapped through the
   RENDERED geometry, never the img box. A box-fitted pet reads ~0.25 of its box with
   its ink centre ~13% down and right of the box centre, which is what this went red on
   before the fix; an ink-fitted one reads FILL (0.82) and dead centre. Both halves
   matter: the size check alone passes on a big off-centre pet, and the centre check
   alone passes on a perfectly centred tiny one. Decoded is asserted in the same sample,
   because geometry reads fine over a blank frame (tally/CLAUDE.md, FX rules). */
/* a card has to be OPEN or the thumb Tom taps through is not in the sample: the first
   run of this measured 7 boxes (six tiles and the teaser) and said nothing about it */
await ensureOpen('C5');
await settle(page, 200);
const ink = await page.evaluate(crop => {
  const boxes = [];
  const imgs = [
    ...document.querySelectorAll('#pdkPanel .pdk-tile img'),
    ...document.querySelectorAll('#pdkPanel .pdk-teaser img'),
    ...document.querySelectorAll('#pdkCards .pdk-thumb img'),
  ];
  for (const img of imgs) {
    const host = img.closest('[data-sp]') || img.closest('.pdk-card, .pdk-teaser');
    const sp = host?.dataset?.sp || img.closest('.pdk-slider')?.dataset?.sp;
    const c = crop[sp];
    if (!c) continue;                       // no measured bbox = nothing to assert against
    const box = img.parentElement.getBoundingClientRect();
    const r = img.getBoundingClientRect();
    if (!box.width || !r.width) continue;
    /* the img shows the WHOLE 640-square, so the ink is a fixed fraction of its rect */
    const ix = r.left + c.x0 * r.width, iy = r.top + c.y0 * r.height;
    const iw = (c.x1 - c.x0) * r.width, ih = (c.y1 - c.y0) * r.height;
    boxes.push({
      sp, where: img.closest('.pdk-tile') ? 'tile' : img.closest('.pdk-teaser') ? 'teaser' : 'card',
      fill: +(Math.max(iw, ih) / box.width).toFixed(3),
      dx: +((ix + iw / 2 - (box.left + box.width / 2)) / box.width).toFixed(3),
      dy: +((iy + ih / 2 - (box.top + box.height / 2)) / box.height).toFixed(3),
      decoded: img.naturalWidth > 0,
    });
  }
  return boxes;
}, PET_CROP);
const small = ink.filter(b => b.fill < 0.7);
const offset = ink.filter(b => Math.abs(b.dx) > 0.02 || Math.abs(b.dy) > 0.02);
const blank = ink.filter(b => !b.decoded);
ok('every pet box was actually measured (empty sample = failure)', ink.length >= 8 && ink.some(b => b.where === 'card'),
  `${ink.length} pet boxes: ${[...new Set(ink.map(b => b.where))].join(', ')}`);
ok('THE INK fills its box, not the transparent canvas', ink.length > 0 && small.length === 0,
  small.length ? JSON.stringify(small.slice(0, 3)) : `fill ${Math.min(...ink.map(b => b.fill))}-${Math.max(...ink.map(b => b.fill))} of the box`);
ok('and the INK is centred in it, not the canvas', ink.length > 0 && offset.length === 0,
  offset.length ? JSON.stringify(offset.slice(0, 3)) : 'all within 2% of centre');
ok('the art measured is decoded art', ink.length > 0 && blank.length === 0, JSON.stringify(blank.slice(0, 2)));

/* THE SECOND VISIT (Reggie, reviewing 58117a1). Every check above this one runs inside
   ONE visit to the Paddock, so all of them passed while the screen was broken the
   second time you opened it: the module's `sel`/`host`/`outsideTap` outlived the DOM
   they described, because the sheet closes without telling this module. Two separate
   defects lived in that gap, so both halves are asserted here: the first tap on the
   species that was open last time must OPEN a card (it was being eaten by the re-tap
   rule), and the outside-tap dismisser must still work (it had latched itself to a
   destroyed scene and never re-armed). Driven the player's way: the real Done button,
   then the real chip back in. */
await ensureOpen('C5');
/* `.sheet-close` runs history.back(), so the close is ASYNCHRONOUS. Reading for the
   scene in the same tick as the click always saw it still there, and because both
   checks below were only gated on `reentered` they passed on a first visit that had
   never ended: a pair of checks that could not fail, which is the thing this project
   keeps getting caught by. Nothing below runs until the scene is really gone. */
const hitDone = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#sheets .sheet-close')].pop();
  if (!btn) return false;
  btn.click();
  return true;
});
const sceneGone = hitDone && await page.waitForFunction(() => !document.getElementById('pdkScene'),
  { timeout: 8000, polling: 50 }).then(() => true).catch(() => false);
const reentered = sceneGone ? await reachPaddock() : false;
const second = sceneGone && reentered ? await page.evaluate(async () => {
  const out = { reentered: !!document.getElementById('pdkScene') };
  const cards = () => document.querySelectorAll('#pdkCards .pdk-card').length;
  /* the FIRST tap on the previously-open species, through the real tap path */
  const res = await window.__pdkMountCards('C5');
  await new Promise(r => setTimeout(r, 250));
  out.openedOnFirstTap = !!(res && res.open) && cards() > 0;
  /* and exit 3 on the NEW scene */
  const scene = document.getElementById('pdkScene');
  const host = document.getElementById('pdkCards');
  const r = host?.getBoundingClientRect();
  const x = r ? Math.max(4, r.left / 2) : 8;
  scene?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: 90 }));
  await new Promise(r2 => setTimeout(r2, 250));
  out.outsideTapStillWorks = out.openedOnFirstTap && cards() === 0;
  return out;
}) : { why: 'the sheet never closed, so there was no second visit to test' };
ok('the sheet closes and the Paddock can be re-entered', sceneGone && reentered && second.reentered === true,
  JSON.stringify({ hitDone, sceneGone, reentered, ...second }));
ok('SECOND VISIT: the first tap on the last-open species opens its card', second.openedOnFirstTap === true,
  JSON.stringify(second));
ok('SECOND VISIT: the outside-tap exit still dismisses on the new scene', second.outsideTapStillWorks === true,
  JSON.stringify(second));

/* THE NAMES MYSTERY (W-PADDOCK-5). Tom kept reporting that the Paddock showed the same
   two names whichever animal he tapped, and he was right: scene figures carried only the
   SPECIES, so every duck opened this slider at copy #1 and copy #1's name is what he
   read. The cards were never wrong; the tap threw the copy away. This drives the fixed
   call and asserts the thing HE experienced, the NAME on the card in front, not just an
   internal index: three copies of one species, all named differently by assignNames, and
   opening by the third one's iid must put the third one in front. */
const focus = await page.evaluate(async () => {
  const out = {};
  const { paddockRoster } = await import('./js/paddock.js');
  const roster = (await paddockRoster()).filter(r => r.sp === 'C5');
  out.copies = roster.map(r => ({ iid: r.iid, name: r.name }));
  out.distinctNames = new Set(roster.map(r => r.name)).size;
  if (roster.length < 3) return { ...out, why: 'need three copies to tell a wrong one apart' };
  const target = roster[2];
  out.target = target;
  await window.__pdkClose();
  const res = await window.__pdkMountCards('C5', target.iid);
  await new Promise(r => setTimeout(r, 420));
  out.front = res.front;
  /* the NAME the player is looking at: the card nearest the middle of the rail */
  const rail = document.querySelector('#pdkCards .pdk-rail');
  const cards = [...document.querySelectorAll('#pdkCards .pdk-card')];
  const mid = rail.scrollLeft + rail.clientWidth / 2;
  const front = cards.reduce((b, c) => Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid)
    < Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid) ? c : b, cards[0]);
  out.frontName = front.querySelector('.pdk-name')?.textContent || null;
  out.frontIid = front.dataset.iid;
  out.dotOn = [...document.querySelectorAll('#pdkCards .pdk-dot')].findIndex(d => d.classList.contains('on'));
  /* and a tap on ANOTHER copy while this one is open must MOVE, not dismiss */
  const other = roster[0];
  const moved = await window.__pdkMountCards('C5', other.iid);
  await new Promise(r => setTimeout(r, 420));
  out.movedNotClosed = !!(moved && moved.open);
  out.afterMove = moved && moved.front;
  /* while a tap on the copy already in front is still a dismissal */
  const again = await window.__pdkMountCards('C5', other.iid);
  await new Promise(r => setTimeout(r, 300));
  out.sameCopyDismisses = !(again && again.open);
  return out;
});
ok('three copies exist and are named differently (an empty or same-named set proves nothing)',
  !focus.why && focus.copies.length >= 3 && focus.distinctNames >= 3, JSON.stringify(focus.copies || focus.why));
ok("THE NAMES BUG: opening by a copy's iid shows THAT copy's name, not copy #1's",
  !focus.why && focus.frontIid === focus.target.iid && focus.frontName === focus.target.name,
  JSON.stringify({ asked: focus.target, gotIid: focus.frontIid, gotName: focus.frontName, dot: focus.dotOn }));
ok('and the dots agree with what is in front', !focus.why && focus.dotOn === 2, `dot ${focus.dotOn} lit`);
ok('tapping a DIFFERENT copy moves the rail instead of dismissing',
  !focus.why && focus.movedNotClosed && focus.afterMove === focus.copies[0].iid, JSON.stringify(focus));
ok('tapping the copy already in front still dismisses', !focus.why && focus.sameCopyDismisses === true,
  JSON.stringify({ sameCopyDismisses: focus.sameCopyDismisses }));

/* THE DAILY RITUAL, consuming half (Tom picked B+C). Reggie's layer decides what a press
   does; these checks are about what the player is TOLD, which is my half of the split.
   The important one is the READ path: a card has to show "Petted" before anybody taps
   anything, because bondUp's return only speaks after a write, and a card that can only
   learn today's state by pressing the button is the no-op this feature exists to remove.
   That is also why it is checked AFTER A RELOAD, the same way the bond round trip is:
   rendering the right label once proves nothing about where it came from. */
/* a clean day first: the bond and burst checks above have already petted this pet
   today, so without this the "starts unspent" check would fail on THEIR writes and tell
   me nothing about the render */
await nextDay();
await ensureOpen('C5');
const ritual = await page.evaluate(async () => {
  const out = {};
  const card = () => document.querySelector('#pdkCards .pdk-card');
  const btn = k => card()?.querySelector(`.pdk-btn[data-act="${k}"]`);
  const noteText = () => card()?.querySelector('.pdk-note')?.textContent?.trim() || '';
  const given = k => !!btn(k)?.classList.contains('given');
  out.beforePet = { label: btn('pet')?.textContent.trim(), given: given('pet') };
  btn('pet').click();
  await new Promise(r => setTimeout(r, 500));
  out.afterFirstPet = { label: btn('pet')?.textContent.trim(), given: given('pet'), note: noteText() };
  /* the SECOND press of the same kind today: no burst, and it must SAY why.
     DRAIN FIRST, do not subtract. The burst glyphs are transient (they float up and
     remove themselves), so a before/after delta measured -3 when the FIRST press's
     glyphs expired mid-check: the count went down, not up, and the check failed on its
     own arithmetic rather than on the app. Waiting for a clean zero and then asserting
     zero is the honest shape. */
  const glyphs = () => document.querySelectorAll('#pdkCards .pdk-glyph').length;
  for (let i = 0; i < 40 && glyphs() > 0; i++) await new Promise(r => setTimeout(r, 100));
  out.drainedToZero = glyphs() === 0;
  btn('pet').click();
  await new Promise(r => setTimeout(r, 500));
  out.afterSecondPet = { note: noteText(), given: given('pet'), newBursts: glyphs() };
  /* Feed is a DIFFERENT kind: petting must not have spent it */
  out.feedStillOffered = { label: btn('feed')?.textContent.trim(), given: given('feed') };
  btn('feed').click();
  await new Promise(r => setTimeout(r, 500));
  out.afterFeed = { label: btn('feed')?.textContent.trim(), given: given('feed'), note: noteText() };
  return out;
});
ok('RITUAL: a card starts with its kinds unspent', ritual.beforePet.label === 'Pet' && ritual.beforePet.given === false,
  JSON.stringify(ritual.beforePet));
ok('RITUAL: giving a kind marks it given, from the answer', ritual.afterFirstPet.given === true && ritual.afterFirstPet.label === 'Petted',
  JSON.stringify(ritual.afterFirstPet));
ok('RITUAL: a second press today fires NO burst and SAYS WHY (never a dead button)',
  ritual.drainedToZero === true && ritual.afterSecondPet.newBursts === 0
  && /come back tomorrow/i.test(ritual.afterSecondPet.note),
  JSON.stringify({ ...ritual.afterSecondPet, drainedToZero: ritual.drainedToZero }));
ok('RITUAL: Feed is its own kind, unspent by petting', ritual.feedStillOffered.given === false && ritual.feedStillOffered.label === 'Feed',
  JSON.stringify(ritual.feedStillOffered));
ok('RITUAL: and giving Feed marks Feed, not Pet', ritual.afterFeed.given === true && ritual.afterFeed.label === 'Fed',
  JSON.stringify(ritual.afterFeed));

/* THE READ PATH, across a reload. Nothing below presses anything. */
await page.reload({ waitUntil: 'networkidle2' });
await page.waitForFunction(() => typeof window.__pdkMountCards === 'function', { timeout: 30000, polling: 100 }).catch(() => {});
await setWidth(page, 390, 900);
const backAgain = await reachPaddock();
const readBack = await page.evaluate(async () => {
  const res = await window.__pdkMountCards('C5');
  await new Promise(r => setTimeout(r, 400));
  const card = document.querySelector('#pdkCards .pdk-card');
  if (!card) return { why: 'no card after the reload' };
  const lbl = k => card.querySelector(`.pdk-btn[data-act="${k}"]`)?.textContent.trim();
  const given = k => !!card.querySelector(`.pdk-btn[data-act="${k}"]`)?.classList.contains('given');
  return { opened: !!(res && res.open), pet: lbl('pet'), feed: lbl('feed'),
           givenPet: given('pet'), givenFeed: given('feed'),
           note: card.querySelector('.pdk-note')?.textContent?.trim() || '' };
});
ok('RITUAL ROUND TRIP: after a reload the card knows both kinds were given, with nobody pressing anything',
  backAgain && !readBack.why && readBack.givenPet === true && readBack.givenFeed === true
  && readBack.pet === 'Petted' && readBack.feed === 'Fed', JSON.stringify(readBack));

/* the streak line, seeded rather than waited for: a real one needs consecutive days */
const streakSeen = await page.evaluate(async () => {
  const db = await new Promise(res => { const r = indexedDB.open('tally-demo'); r.onsuccess = () => res(r.result); });
  const today = new Date();
  const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  await new Promise(res => { const tx = db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put({ k: 'petCare', v: { w1: { day, pet: true, feed: false, streak: 4 } } });
    tx.oncomplete = res; });
  await window.__pdkClose();
  await window.__pdkMountCards('C5', 'w1');
  await new Promise(r => setTimeout(r, 400));
  const card = document.querySelector('#pdkCards .pdk-card[data-iid="w1"]');
  return { note: card?.querySelector('.pdk-note')?.textContent?.trim() || '', streakAttr: card?.dataset.streak };
});
ok('RITUAL: a streak of 4 says so on the card', /4 days running/i.test(streakSeen.note), JSON.stringify(streakSeen));

/* END TO END, THE WHOLE OF TOM'S BUG. Everything above drives my half through the seam,
   which proves the slider CAN focus a copy but not that the scene asks it to. This taps a
   REAL figure in the field, by coordinates, and asserts the name on the resulting card is
   that figure's own. It spans both halves (Reggie's data-iid on the figure, my rail
   focus), which is why it asserts the thing the player experiences rather than either
   side's internals. Skips honestly if fewer than two figures of one species are out in
   the field today, because the herd rotates and a one-figure field cannot show the bug. */
await page.evaluate(() => window.__pdkClose && window.__pdkClose());
await settle(page, 200);
const e2e = await page.evaluate(async () => {
  /* select on .pdk-pet and read the iid SEPARATELY, so the two ways this can break say
     different things: figures missing entirely, versus figures that carry no iid. The
     first version selected [data-iid] and reported "no figures in the field" when the
     scene simply stopped tagging them, which is a true red with a misleading reason. */
  const figs = [...document.querySelectorAll('#pdkScene .pdk-pet')];
  if (!figs.length) return { why: 'no figures in the field at all' };
  const tagged = figs.filter(f => f.dataset.iid);
  if (!tagged.length) return { why: `THE SCENE TAGS NO IIDS: ${figs.length} figures, none with data-iid, so every tap is lossy again` };
  const bySp = {};
  for (const f of tagged) (bySp[f.dataset.pdk] = bySp[f.dataset.pdk] || []).push(f);
  const sp = Object.keys(bySp).find(k => bySp[k].length >= 2);
  if (!sp) return { why: `no species has two tagged figures in the field today (${tagged.length} tagged)` };
  /* the SECOND figure of that species: copy #1 is what the bug always showed */
  const fig = bySp[sp][1];
  const r = fig.getBoundingClientRect();
  return { sp, iid: fig.dataset.iid, x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
let tapped = { why: e2e.why };
if (!e2e.why) {
  await page.mouse.click(e2e.x, e2e.y);
  await page.waitForFunction(() => document.querySelectorAll('#pdkCards .pdk-card').length > 0,
    { timeout: 8000, polling: 50 }).catch(() => {});
  await settle(page, 350);
  tapped = await page.evaluate(async askedIid => {
    const rail = document.querySelector('#pdkCards .pdk-rail');
    const cards = [...document.querySelectorAll('#pdkCards .pdk-card')];
    if (!rail || !cards.length) return { why: 'the tap opened no cards' };
    const mid = rail.scrollLeft + rail.clientWidth / 2;
    const front = cards.reduce((b, c) => Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid)
      < Math.abs(b.offsetLeft + b.offsetWidth / 2 - mid) ? c : b, cards[0]);
    const { paddockRoster } = await import('./js/paddock.js');
    const row = (await paddockRoster()).find(x => x.iid === askedIid);
    return { asked: askedIid, askedName: row && row.name, gotIid: front.dataset.iid,
             gotName: front.querySelector('.pdk-name')?.textContent || null, cards: cards.length };
  }, e2e.iid);
}
ok('END TO END: tapping the SECOND figure of a species opens THAT animal, by name',
  !tapped.why && tapped.gotIid === tapped.asked && tapped.gotName === tapped.askedName,
  tapped.why ? `SKIPPED-AS-FAILURE: ${tapped.why}` : JSON.stringify(tapped));

ok('no page errors', errs.length === 0, errs.slice(0, 2).join(' ; '));

/* DRIFT: the declaration has to describe the checks that exist, or it is decoration.
   Reword a timed-absence check without updating the list and this fails by name. */
const missing = TIMED_ABSENCE.filter(n => !ran.includes(n));
ok('the timed-absence declaration matches the checks that ran', missing.length === 0,
  missing.length ? `declared but never ran: ${missing.join(' | ')}` : `${TIMED_ABSENCE.length} declared, all present`);
console.log(`\nQUIET-RUN CHECKS (green here only counts on an idle machine): ${TIMED_ABSENCE.join(' | ')}`);
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\npaddock cards clean');
process.exit(fails.length ? 1 : 0);
