import { auditOutputPath } from './lib/audit-output.mjs';
/* THE CRATE ACTUALLY CRACKS OPEN, AND THE LID IS CUT IN THE RIGHT PLACE.
 *
 * WHY THIS EXISTS. The crate reveal shipped from a branch whose own handoff said
 * the legendary card, the multi-card advance and the boss-loot grid were
 * "verified only in a stubbed harness", and that the daily crate's lid ratio was
 * derived by reading SVG path coordinates rather than by looking at it. That was
 * not carelessness: `openPackReveal` gates the whole sequence on
 * `reducedMotion || navigator.webdriver`, so it CANNOT run under automation. The
 * feature was structurally unverifiable, and every future change to it would have
 * been a guess.
 *
 * v329 adds `window.__crateForce`, the same opt-in seam the app already gives its
 * other webdriver-gated moments. This audit uses it.
 *
 * What it locks down:
 *   RUNS      the crate phase actually renders (it never could, under a test)
 *   LID       the lid is cut where the art's lid ENDS, measured from rendered
 *             pixels per crate kind, not read off a path coordinate
 *   OPENS     the lid leaves the box: it is somewhere else by mid-sequence
 *   CARD      a card arrives, decoded, with real text on it
 *   TIERS     every rarity renders, legendary included (RNG never produced one
 *             for the original author, so it is forced here)
 *   ADVANCE   a multi-card pack can be advanced through to the last card
 *   EMPTY     an empty sample set is a FAILURE, never a pass
 *
 * The first-run takeover queue (What's New, the drop, the garden, spires, race,
 * rename, survey) paints over the reveal, and `changelogSeen` is a BUILD NUMBER
 * rather than a boolean, so setting it to `true` suppresses nothing. Both are
 * handled in `quiet()` below.
 *
 * Usage: node tests/crate-reveal-audit.mjs        (URL=... for live)
 */
import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree, setWidth } from './godmode.js';
import { sampleMachineCadence } from './audit-lifecycle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const APP_SRC = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

const FLICK_BROWSER = {
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
};
const { browser, page } = await boot(base, FLICK_BROWSER);
await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);

/* Silence every first-run takeover. They fire in a QUEUE, so dismissing once is
   not enough, and `changelogSeen` holds a build number: kvSet(..., true) reads as
   0 and What's New shows anyway. */
const quiet = async (targetPage = page) => {
  await targetPage.evaluate(async () => {
    const db = await import('/js/db.js?q=1');
    const { DROP } = await import('/js/loot.js?q=1');
    await db.kvSet('changelogSeen', 999999);
    await db.kvSet(`dropSeen.${DROP.id}`, true);
    for (const k of ['spiresIntroSeen', 'raceIntroSeen', 'gardenIntroSeen', 'surveySeen', 'namePrompted']) await db.kvSet(k, true);
    await db.kvSet('renameRequired', null);
  });
};

const openCrateOfKind = async kind => page.evaluate(async k => {
  window.__crateForce = 1;                       // the seam: opt this run in
  if (!window.__packReveal) return { err: 'no __packReveal hook' };
  const loot = await import('/js/loot.js?o=' + Math.random());
  const row = await loot.grantCrate(k, 'audit');
  const res = await loot.openCrate(row.id);
  const cards = [{ name: 'Audit item', rarity: 'rare', kind: 'GEAR · HAT', stats: '+7 POW' }];
  window.__packReveal(cards, { coins: res.coins || 0, crate: res.crate });
  return { crate: res.crate };
}, kind);

await sleep(1200);
await quiet();
await page.evaluate(() => { location.hash = '#/today'; });
await sleep(1600);
await quiet();

/* ---- RUNS + LID, per crate kind ------------------------------------------ */
const KINDS = ['golden', 'daily'];
/* how many authored frames each crate is supposed to mount */
const SEQ_FRAMES = { daily: 9, golden: 3 };
for (const kind of KINDS) {
  const r = await openCrateOfKind(kind);
  if (r && r.err) { ok(`RUNS ${kind}: the reveal could be driven at all`, false, r.err); continue; }
  await sleep(160);
  const shot = await page.evaluate(() => {
    const c = document.querySelector('.pack-crate');
    if (!c) return null;
    const lid = c.querySelector('[class*="lid"]');
    const box = c.querySelector('[class*="box"], [class*="base"]');
    const rect = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height) }; };
    return { crate: rect(c), lid: rect(lid), box: rect(box), lidClip: lid ? getComputedStyle(lid).clipPath : null,
      boxClip: box ? getComputedStyle(box).clipPath : null };
  });
  ok(`RUNS ${kind}: the crate phase renders (it could not, before the seam)`, !!shot, JSON.stringify(shot));
  /* The COMMON crate no longer uses the clip-path lid fake: it plays 9 authored
     frames, so it has no lid element and no cut to measure. Asserting a clip on
     it would be asserting a mechanism the crate does not use. It gets a stronger
     check instead, below, because a sequence can fail in ways a static clip
     cannot: a frame that never advances, or one that paints undecoded. */
  if (shot && SEQ_FRAMES[kind]) {
    /* SAMPLE DURING THE SEQUENCE, not at 160ms. The .co-drop scale animation is
       still running early on (144 x 0.944 = 136), so an early read measures the
       crate falling, not the frames playing. The property under test is "the
       authored frames play on their integer grid", and they play at --b-lid,
       after the settle finishes. Measuring before then is rule 12: it grades a
       state nobody is complaining about and reports a failure that is not one. */
    await sleep(1100);
    const seq = await page.evaluate(() => {
      const el = document.querySelector('#crateSeq');
      if (!el) return { err: 'no #crateSeq' };
      const f = [...el.children];
      const r = el.getBoundingClientRect();
      return { n: f.length, w: Math.round(r.width),
        undecoded: f.filter(im => im.naturalWidth === 0).length,
        matted: null };
    });
    ok(`SEQ ${kind}: all ${SEQ_FRAMES[kind]} authored frames are mounted`, seq.n === SEQ_FRAMES[kind], JSON.stringify(seq));
    ok(`SEQ ${kind}: every frame is DECODED (an undecoded frame paints nothing)`,
      seq.n > 0 && seq.undecoded === 0, `${seq.undecoded} undecoded of ${seq.n}`);
    /* 144 is 48 x 3 exactly. Pixel art off its integer grid is resampled to
       mush, and the icon path's 148 is not a multiple of 48. */
    ok(`SEQ ${kind}: the box is an INTEGER multiple of the 48px art (144 = 48x3)`,
      seq.w % 48 === 0, `${seq.w}px, ${seq.w / 48}x`);
  }
  /* THE LID CHECK IS GONE BECAUSE THE LID IS GONE.
     It measured a clip-path cut across two halves of one static icon, which is
     how both crates used to fake opening. The Common crate stopped using it when
     Tom's nine frames landed, and the Golden crate stopped tonight when his bone
     chest replaced it. Neither crate has a lid element any more, so the check
     read a null clip-path and reported "box cut NaN%", which is the row doing
     its job: it said the mechanism it watches no longer exists.
     Nothing is left unguarded. A frame sequence can fail in ways a static clip
     never could (a frame that never advances, one that paints undecoded, a box
     off the integer grid) and SEQ above covers all three for both crates.
     crateOpenHtml still carries the lid branch; it is unreachable while every
     crate is in CRATE_SEQ, and it is left in place rather than ripped out on a
     night Tom is asleep. */
  // let it finish so the next kind starts clean
  await sleep(2600);
  await page.evaluate(() => { const b = document.querySelector('.pack-reveal .sheet-close, .pack-done'); if (b) b.click(); else history.back(); });
  await sleep(700);
}

/* ---- TIERS: force each rarity, legendary included ------------------------- */
/* One rarity per evaluate, closed from Node between them. Doing the close INSIDE
   a long-running evaluate calls history.back(), which navigates and destroys the
   execution context mid-call. */
const tiers = {};
for (const rar of ['common', 'uncommon', 'rare', 'legendary']) {
  await page.evaluate(r => {
    window.__crateForce = 1;
    window.__packReveal([{ name: `Audit ${r}`, rarity: r, kind: 'GEAR · HAT', stats: '+7 POW' }], { coins: 0 });
  }, rar);
  await sleep(650);
  tiers[rar] = await page.evaluate(() => {
    const el = document.querySelector('.pack-card, .pc-card, .pack-reveal [class*="card"]');
    if (!el) return null;
    const imgs = [...el.querySelectorAll('img')];
    return { cls: (el.className || '').toString().slice(0, 60),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      decoded: imgs.length === 0 || imgs.every(i => i.naturalWidth > 0) };
  });
  await page.evaluate(() => { const b = document.querySelector('.pack-reveal .sheet-close, .pack-done'); if (b) b.click(); else history.back(); });
  await sleep(600);
}
const seen = Object.entries(tiers).filter(([, v]) => v);
ok('TIERS every rarity renders a card (an empty sample is a FAILURE)', seen.length === 4, JSON.stringify(tiers));
ok('TIERS the legendary tier renders (RNG never produced one for the author)',
  !!tiers.legendary, JSON.stringify(tiers.legendary));
ok('TIERS every rendered card has its art decoded (a CSS box over a blank frame passes a position check)',
  seen.length > 0 && seen.every(([, v]) => v.decoded), JSON.stringify(seen.map(([k, v]) => [k, v.decoded])));

/* ---- PAYOFF + BULK COMMONS: R37-14/R37-19/R37-20 -------------------------
   A new cosmetic used to build an empty stats band while its duplicate printed
   a coin payoff. The card-builder row grades the real builder and requires the
   rarity in the same line, so "New" alone cannot flatten every tier together.

   Five Common Crates also used to expose one OPEN button that consumed one row,
   then force the player back through the Backpack after every reveal. The bulk
   row grants five Commons and two Bone Crates, taps the Backpack's real control
   ONCE, and requires all five Commons, but neither Bone Crate, to be consumed.
   It then dismisses the one combined reveal and reads the real toast sink.

   PROVE-RED (2026-09-06, origin/main v482):
     FAIL  PAYOFF a new Legendary cosmetic says New and names its rarity  stats=""
     FAIL  BULK five Common Crates expose one Open all control  {"commons":5,"bones":2,"buttons":0}
     FAIL  BULK Common opens are sequential, never Promise.all  handler missing
     FAIL  BULK one tap opens all five Commons and leaves Bone Crates alone  {"commons":5,"bones":2,"cards":0}
     FAIL  CLAIM a finished crate reveal names the new item and points to Wardrobe  toast="3 starter ingredients in your Kitchen: exactly one Bone Broth. Cook it."
 */
const payoff = await page.evaluate(() => {
  const item = { id: 'R37-AUDIT', name: 'Audit Legend', rarity: 'legendary', slot: 'H' };
  const card = window.__crateCard?.({ type: 'cos', item });
  return { stats: card?.stats || '', rarity: card?.rarity || '' };
});
ok('PAYOFF a new Legendary cosmetic says New and names its rarity',
  payoff.stats === 'New · Legendary' && payoff.rarity === 'legendary', `stats=${JSON.stringify(payoff.stats)}`);
const bulkHandlerAt = APP_SRC.indexOf("$$('[data-open-all]'");
const bulkHandler = bulkHandlerAt < 0 ? '' : APP_SRC.slice(bulkHandlerAt, APP_SRC.indexOf("$('#useBoost'", bulkHandlerAt));
ok('BULK Common opens are sequential, never Promise.all',
  /for \(const crate of held\) opened\.push\(await openCrate\(crate\.id\)\)/.test(bulkHandler)
    && !/Promise\.all/.test(bulkHandler), bulkHandler ? 'sequential await found' : 'handler missing');

await page.evaluate(async () => {
  for (let i = 0; i < 6; i++) {
    if (!document.querySelector('.pack-reveal')) break;
    const b = document.querySelector('.pack-reveal .sheet-close');
    if (b) b.click(); else history.back();
    await new Promise(r => setTimeout(r, 400));
  }
  const db = await import('/js/db.js');
  for (const row of await db.db.all('inv')) if (row.kind === 'crate') await db.db.del('inv', row.id);
  for (let i = 0; i < 5; i++) await db.db.put('inv', { id: `r37-common-${i}`, kind: 'crate', crate: 'daily', source: 'r37-bulk-audit', ts: Date.now() + i });
  for (let i = 0; i < 2; i++) await db.db.put('inv', { id: `r37-bone-${i}`, kind: 'crate', crate: 'golden', source: 'r37-bulk-control', ts: Date.now() + 10 + i });
  /* Deterministic non-dupe cosmetic: no consumable, no ingredient, common
     rarity, no gear conversion. The first of five identical rolls is new and
     the remaining four are dupes, which makes the claim toast deterministic. */
  Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value: a => { a.fill(0x80000000); return a; } });
  location.hash = '#/bonehead';
});
await sleep(1800);
await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="crates"]')?.click());
await sleep(1400);
const bulkBefore = await page.evaluate(async () => {
  const { db } = await import('/js/db.js');
  const rows = (await db.all('inv')).filter(r => r.kind === 'crate');
  return { commons: rows.filter(r => r.crate === 'daily').length,
    bones: rows.filter(r => r.crate === 'golden').length,
    buttons: document.querySelectorAll('[data-open-all="daily"]').length };
});
ok('BULK five Common Crates expose one Open all control',
  bulkBefore.commons === 5 && bulkBefore.bones === 2 && bulkBefore.buttons === 1, JSON.stringify(bulkBefore));
if (bulkBefore.buttons) await page.click('[data-open-all="daily"]');
await sleep(900);
const bulkAfter = await page.evaluate(async () => {
  const { db } = await import('/js/db.js');
  const rows = (await db.all('inv')).filter(r => r.kind === 'crate');
  return { commons: rows.filter(r => r.crate === 'daily').length,
    bones: rows.filter(r => r.crate === 'golden').length,
    cards: document.querySelectorAll('.pack-card').length };
});
ok('BULK one tap opens all five Commons and leaves Bone Crates alone',
  bulkAfter.commons === 0 && bulkAfter.bones === 2 && bulkAfter.cards > 0, JSON.stringify(bulkAfter));

/* Dismiss every card with the real card control. The toast fires only after the
   reveal resolves, which proves it is tied to a completed open rather than the
   pre-spend tap. */
for (let n = 0; n < 20; n++) {
  const state = await page.evaluate(() => {
    const reveal = document.querySelector('.pack-reveal');
    if (!reveal) return 'gone';
    const tilt = document.querySelector('.pack-tilt');
    if (!reveal.dataset.landed || !tilt) return 'wait';
    tilt.click();
    return 'clicked';
  });
  if (state === 'gone') break;
  await sleep(state === 'clicked' ? 850 : 250);
}
await sleep(700);
const claimToast = await page.evaluate(() => document.querySelector('#toast')?.textContent?.trim() || '');
ok('CLAIM a finished crate reveal names the new item and points to Wardrobe',
  /^.+ claimed\. Equip it in your Wardrobe\.$/.test(claimToast), `toast=${JSON.stringify(claimToast)}`);


/* ---- BULK RECOVERY: R39-y, a mid-loop failure must not swallow what already
   opened ---------------------------------------------------------------------
   Codex audit v487, "Bulk open has no failure recovery around its sequential
   loop. If the third openCrate rejects, earlier opens are committed, no
   combined reveal appears, and the button remains disabled" (js/app.js:17191,
   17195 pre-fix). The handler threw straight out of the click listener, so:
   the two crates already spent were never shown to the player, the reveal
   never opened, and "OPEN ALL" stayed disabled forever with no re-render to
   fix it.

   This poisons the THIRD of five Commons with openCrate's own existing
   defensive branch (crateRow.kind !== 'crate'): db.take removes the row,
   openCrate finds the wrong kind, puts the SAME row straight back unchanged,
   and throws 'crate gone'. That is a real crate-row corruption, not a stubbed
   function, and it leaves the poisoned row sitting in inventory exactly like
   a crate the loop never got to.

   PROVE-RED (2026-09-06, pre-fix js/app.js): the try/catch below did not
   exist, so `for (const crate of held) opened.push(await openCrate(crate.id))`
   threw out of the handler on crate 3:
     FAIL  RECOVERY the first two opens are revealed even though crate 3 threw  cards=0
     FAIL  RECOVERY three crates remain (the poisoned one plus the two never attempted)  remain=2
     FAIL  RECOVERY the Open all control comes back enabled  disabled=true
 */
await page.evaluate(async () => {
  for (let i = 0; i < 6; i++) {
    if (!document.querySelector('.pack-reveal')) break;
    const b = document.querySelector('.pack-reveal .sheet-close');
    if (b) b.click(); else history.back();
    await new Promise(r => setTimeout(r, 400));
  }
});
await sleep(500);
await page.evaluate(async () => {
  const db = await import('/js/db.js');
  for (const row of await db.db.all('inv')) if (row.kind === 'crate') await db.db.del('inv', row.id);
  for (let i = 0; i < 5; i++) await db.db.put('inv', { id: `r39-recover-${i}`, kind: 'crate', crate: 'daily', source: 'r39-recovery-audit', ts: Date.now() + i });
  Object.defineProperty(crypto, 'getRandomValues', { configurable: true, value: a => { a.fill(0x80000000); return a; } });
});
/* Render the tab with all FIVE still healthy: the handler's `held` array is a
   closure captured at render time, so the corruption below has to land AFTER
   this render and BEFORE the click, the same way a row could go bad on disk
   between a screen painting and a tap landing on it. Poisoning before the
   render would just make the crate invisible to the tab, never reaching
   openCrate at all. */
await page.evaluate(() => document.querySelector('.ch-tab[data-tab="wardrobe"]')?.click());
await sleep(300);
await page.evaluate(() => document.querySelector('.ch-tab[data-tab="crates"]')?.click());
await sleep(700);
const preClick = await page.evaluate(() => ({
  buttons: document.querySelectorAll('[data-open-all="daily"]').length,
}));
// poison the third, now that the rendered handler already holds all five ids
await page.evaluate(async () => {
  const db = await import('/js/db.js');
  const third = await db.db.get('inv', 'r39-recover-2');
  await db.db.put('inv', { ...third, kind: 'poisoned' });
});
if (preClick.buttons) await page.click('[data-open-all="daily"]');
await sleep(900);
const recovery = await page.evaluate(async () => {
  const db = await import('/js/db.js');
  const rows = (await db.db.all('inv')).filter(r => r.id && r.id.startsWith('r39-recover-'));
  return {
    cards: document.querySelectorAll('.pack-card').length,
    remain: rows.length,
  };
});
ok('RECOVERY the first two opens are revealed even though crate 3 threw',
  recovery.cards > 0, `cards=${recovery.cards}`);
ok('RECOVERY three crates remain (the poisoned one plus the two never attempted)',
  recovery.remain === 3, `remain=${recovery.remain}`);
/* Advance through the reveal with the real card control (same drive the CLAIM
   test above uses), not history.back(): openCrateReveal only resolves via its
   own done() path, which fires on the LAST card's advance, and the handler's
   renderCharacter (the thing that re-enables or removes the button) sits right
   after that await. A close that bypasses done() -- and pack-reveal has no
   .sheet-close of its own to click, so the generic drain used elsewhere in
   this file falls through to history.back() -- would leave that render never
   run, and the control could look stuck for a reason that has nothing to do
   with the recovery fix. */
for (let n = 0; n < 20; n++) {
  const state = await page.evaluate(() => {
    const reveal = document.querySelector('.pack-reveal');
    if (!reveal) return 'gone';
    const tilt = document.querySelector('.pack-tilt');
    if (!reveal.dataset.landed || !tilt) return 'wait';
    tilt.click();
    return 'clicked';
  });
  if (state === 'gone') break;
  await sleep(state === 'clicked' ? 850 : 250);
}
await sleep(700);
const afterDrain = await page.evaluate(() => ({
  hasButton: !!document.querySelector('[data-open-all="daily"]'),
  disabled: !!document.querySelector('[data-open-all="daily"]')?.disabled,
}));
/* the tab fully re-renders once the reveal resolves, so the control is either a
   fresh enabled button (crates remain) or gone (none left); either way it is
   never the same disabled node the click left behind. */
ok('RECOVERY the Open all control comes back enabled',
  afterDrain.hasButton && !afterDrain.disabled, `hasButton=${afterDrain.hasButton} disabled=${afterDrain.disabled}`);


/* ---- PACING + THE LAST CARD ------------------------------------------------
   Tom, 2026-08-08: "the swiping and closing of the crate when it's finished feels
   buggy" and "the initial open needs to happen a bit faster".
   PACE pins the time-to-card so a future retiming cannot quietly drift back to
   staring at a closed box for two and a half seconds.
   LASTCARD is the bug: every card but the final one flew off screen, and the last
   one hit `return done()` before any animation, so the takeover blinked out
   mid-swipe and read as an accidental dismissal.
   PROVE-RED: restore `if (i >= cards.length - 1) return done();` at the top of
   fling() and LASTCARD fails with the card never having moved. */
/* The beats live on .pack-reveal, so one has to be OPEN to read them. Reading
   them off documentElement returns null and the check silently passes on nothing. */
const pace = await page.evaluate(async () => {
  window.__crateForce = 1;
  window.__packReveal([{ name: 'Pace', rarity: 'rare', kind: 'GEAR · HAT', stats: '+7 POW' }], { coins: 0, crate: 'golden' });
  await new Promise(r => setTimeout(r, 260));
  const el = document.querySelector('.pack-reveal');
  if (!el) return { err: 'no reveal open' };
  const v = n => parseFloat(getComputedStyle(el).getPropertyValue(n));
  /* the sink's own duration, read off the element rather than assumed, so the
     ordering check below measures when the crate is actually GONE */
  const sinkEl = document.querySelector('.co-sink');
  const sinkDur = sinkEl ? parseFloat(getComputedStyle(sinkEl).animationDuration) : NaN;
  const out = { settle: v('--b-settle'), lid: v('--b-lid'), card: v('--b-card'),
    sink: v('--b-sink'), sinkDur, gone: v('--b-sink') + sinkDur, pix: el.classList.contains('pix-crate') };
  const b = document.querySelector('.pack-reveal .sheet-close');
  if (b) b.click(); else history.back();
  await new Promise(r => setTimeout(r, 500));
  return out;
});
/* ORDER is the bug Tom reported on the recording, 2026-08-16: "you have the
   ghost crate fading out weird once the card is already in frame and in front of
   it." Measured off that capture: the sink ran 1.66s to 2.21s while the card rose
   at 1.72s, so for half a second a finished card sat in front of a chest still
   dissolving around its edges. The property is an ORDERING one, and a threshold
   on time-to-card never expressed it. This row does.
   PROVE-RED: it went red on the shipped v388 numbers above (gone 2.21 > card
   1.72) before the retiming, which is the defect it exists to catch. */
ok('ORDER the crate is completely gone before the card starts (Tom: not fading behind it)',
  Number.isFinite(pace.gone) && Number.isFinite(pace.card) && pace.gone <= pace.card,
  JSON.stringify(pace));
/* PACE's ceiling was 1.6s, measured on the VECTOR crate, whose card arrived at
   1.38s. Both crates are authored frame sequences now and the performance is
   genuinely longer: the drop lands at 0.71s, bounces until 1.02, the frames play
   1.12 to 1.52, and only then can the crate clear. 1.6s and a nine-frame
   sequence that has to finish before the card cannot both hold.
   The ceiling is 1.9s so drift is still caught, and the 0.44s this costs against
   the vector crate is a DECISION FOR TOM, not something to tune away quietly:
   buying it back means shortening the 1.02s drop he has not complained about.
   Tracked as "retime the whole crate sequence". Do not raise this number again
   without his answer. */
ok('PACE the card arrives inside 1.9s (1.6s was the vector crate; the frame sequence is longer)',
  Number.isFinite(pace.card) && pace.card <= 1.9, JSON.stringify(pace));
ok('PACE the lid moves inside 1.3s', Number.isFinite(pace.lid) && pace.lid <= 1.3, JSON.stringify(pace));

const lastCard = await page.evaluate(async () => {
  window.__crateForce = 1;
  window.__packReveal([{ name: 'Only card', rarity: 'rare', kind: 'GEAR · HAT', stats: '+7 POW' }], { coins: 0 });
  await new Promise(r => setTimeout(r, 1900));
  const tilt = document.querySelector('.pack-tilt');
  if (!tilt) return { err: 'no card' };
  const before = tilt.style.transform || 'none';
  const r = tilt.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const pd = (t, x) => tilt.dispatchEvent(new PointerEvent(t, { pointerId: 5, clientX: x, clientY: cy, bubbles: true }));
  pd('pointerdown', cx);
  for (let i = 1; i <= 6; i++) pd('pointermove', cx - i * 22);
  pd('pointerup', cx - 132);
  await new Promise(r2 => setTimeout(r2, 120));
  const during = (document.querySelector('.pack-tilt') || {}).style?.transform || 'gone';
  return { before, during, moved: /translateX\(-?[1-9]/.test(during) };
});
ok('LASTCARD the final card flies away like the others before the sheet closes',
  !lastCard.err && lastCard.moved, JSON.stringify(lastCard));


/* ---- BEST FIRST ------------------------------------------------------------
   Tom, 2026-08-08: "the rarest thing should come out of the chest first so it's
   exciting, in the current order the chests feel like a let down."
   A hand dealt in roll order usually ENDS on a common, so the card you are left
   looking at is the worst thing in the crate.
   PROVE-RED: remove the REVEAL_RANK sort in openPackReveal and this fails,
   because the fixture below is deliberately handed over worst-first. */
/* Make sure nothing is still open. An earlier block's reveal survived its close
   and this test then read ITS card, reporting a stale rarity as a failure of the
   sort. Drain first, and assert the drain worked. */
await page.evaluate(async () => {
  for (let i = 0; i < 6; i++) {
    if (!document.querySelector('.pack-reveal')) break;
    const b = document.querySelector('.pack-reveal .sheet-close');
    if (b) b.click(); else history.back();
    await new Promise(r => setTimeout(r, 400));
  }
});
await sleep(600);
const drained = await page.evaluate(() => !document.querySelector('.pack-card, .pc-card'));
ok('BEST FIRST the previous reveal actually closed (a stale card would fake this result)', drained, `drained=${drained}`);

const order = await page.evaluate(async () => {
  window.__crateForce = 1;
  const worstFirst = [
    { name: 'A common', rarity: 'common', kind: 'GEAR · HAT', stats: '+1 POW' },
    { name: 'A rare', rarity: 'rare', kind: 'GEAR · HAT', stats: '+7 POW' },
    { name: 'A legendary', rarity: 'legendary', kind: 'GEAR · HAT', stats: '+18 POW' },
    { name: 'An uncommon', rarity: 'uncommon', kind: 'GEAR · HAT', stats: '+3 POW' },
  ];
  window.__packReveal(worstFirst, { coins: 0 });
  await new Promise(r => setTimeout(r, 1800));
  /* The deck can hold more than one node (the rest of the hand stacks behind),
     so querySelector returns whatever is first in DOM order, not what is on TOP.
     Read the one inside .pc-rise, which is the card actually being presented. */
  const rise = document.querySelector('.pc-rise .pack-card, .pc-rise .pc-card');
  const all = [...document.querySelectorAll('.pack-card, .pc-card')].map(n => n.className);
  const first = rise ? (rise.className || '') : (all[0] || '');
  const b = document.querySelector('.pack-reveal .sheet-close');
  if (b) b.click(); else history.back();
  await new Promise(r => setTimeout(r, 500));
  return { firstCardClass: first, allInDom: all };
});
ok('BEST FIRST the rarest card is dealt first, whatever order the roll produced',
  /r-legendary/.test(order.firstCardClass), JSON.stringify(order));


/* ---- TAP, WITHOUT A CLICK --------------------------------------------------
   Tom, 2026-08-08: "tap on chests does not work you have to drag. There should be
   tap too."
   The click listener works when a click arrives, which it does in a desktop
   harness, which is why this looked fine under test while failing on his phone: a
   touch the browser suspects might be a scroll ends in pointercancel and NO click
   ever follows. So this fires pointerdown/pointerup only, deliberately WITHOUT a
   click, which is the real-device case.
   PROVE-RED: move the tap decision back into the click listener alone and this
   fails with the card unchanged. */
await page.evaluate(async () => {
  for (let i = 0; i < 6; i++) {
    if (!document.querySelector('.pack-reveal')) break;
    const b = document.querySelector('.pack-reveal .sheet-close');
    if (b) b.click(); else history.back();
    await new Promise(r => setTimeout(r, 400));
  }
});
await sleep(500);
const tap = await page.evaluate(async () => {
  window.__crateForce = 1;
  window.__packReveal([
    { name: 'One', rarity: 'legendary', kind: 'GEAR · HAT', stats: '+18 POW' },
    { name: 'Two', rarity: 'rare', kind: 'GEAR · HAT', stats: '+7 POW' },
  ], { coins: 0 });
  await new Promise(r => setTimeout(r, 1800));
  const cardCls = () => (document.querySelector('.pc-rise .pack-card') || {}).className || 'none';
  const before = cardCls();
  const tilt = document.querySelector('.pack-tilt');
  if (!tilt) return { err: 'no card' };
  const b = tilt.getBoundingClientRect();
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
  tilt.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, clientX: cx, clientY: cy, bubbles: true }));
  tilt.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, clientX: cx, clientY: cy, bubbles: true }));
  // deliberately NO click event
  await new Promise(r => setTimeout(r, 900));
  return { before, after: cardCls() };
});
ok('TAP a tap advances the card WITHOUT a click event (the real touch case)',
  !tap.err && tap.before !== tap.after && /r-rare/.test(tap.after), JSON.stringify(tap));


/* ---- EARLYTAP: R37-5, A TAP BEFORE THE CARD LANDS MUST NOT DESTROY IT -----
   Round 37 handoff, R37-5: a tap on the card between 900 and 1800ms into the
   open deleted the reveal before it had ever drawn, permanently losing the
   item (three real grants lost this way on a real device: a Cobalt Puffer, a
   Lemon, an Odd Pair, none ever seen and none recoverable from any surface).
   The `dataset.landed` guard already existed on the reveal-level tap-anywhere
   handler (the one bound in renderCard's `if (reveal && !reveal.dataset.tapWired)`
   block) but NOT on the tilt's own pointerup (`end`) or click listener, so a
   tap landing ON the card itself, rather than beside it, still flung or
   dismissed it before `landed(tier)` had ever run.
   PROVE-RED: remove either `if (!reveal.dataset.landed) return;` line added to
   `end` and the tilt's click listener in openPackReveal (js/app.js) and this
   goes red: the reveal disappears mid-tap and the card is never confirmed. */
{
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i++) {
      if (!document.querySelector('.pack-reveal')) break;
      const b = document.querySelector('.pack-reveal .sheet-close');
      if (b) b.click(); else history.back();
      await new Promise(r => setTimeout(r, 400));
    }
  });
  await sleep(500);
  for (const tapAt of [900, 1400, 1800]) {
    const r = await page.evaluate(async ms => {
      window.__crateForce = 1;
      window.__packReveal([{ name: 'Early tap', rarity: 'rare', kind: 'GEAR · HAT', stats: '+7 POW' }], { coins: 0, crate: 'daily' });
      await new Promise(res => setTimeout(res, ms));
      const tilt = document.querySelector('.pack-tilt');
      if (!tilt) return { err: 'no tilt mounted at tap time' };
      const b = tilt.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      // the real device path: pointerdown/pointerup, deliberately NO click
      // (see the TAP row above -- a touch the browser suspects might be a
      // scroll never gets a compat click at all)
      tilt.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, clientX: cx, clientY: cy, bubbles: true }));
      tilt.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, clientX: cx, clientY: cy, bubbles: true }));
      await new Promise(res => setTimeout(res, 200));
      const survivedTap = !!document.querySelector('.pack-reveal');
      // wait past the real landing beat (PACE's own 1.9s ceiling), then read the card back
      await new Promise(res => setTimeout(res, 2300));
      const el = document.querySelector('.pack-card, .pc-card, .pack-reveal [class*="card"]');
      const landedOk = !!el && (el.textContent || '').includes('Early tap');
      /* Only close if a reveal is actually still there. On the UNGUARDED tree
         the premature tap already destroyed it (that IS the bug this row
         proves), and an unconditional history.back() here would pop a SECOND
         time, past the app's own root state -- a test-harness artifact, not
         the app crashing. */
      const b2 = document.querySelector('.pack-reveal .sheet-close');
      if (b2) b2.click(); else if (document.querySelector('.pack-reveal')) history.back();
      await new Promise(res => setTimeout(res, 600));
      return { survivedTap, landedOk };
    }, tapAt);
    ok(`EARLYTAP ${tapAt}ms: a tap on the card before it lands does not destroy the reveal`,
      !r.err && r.survivedTap, JSON.stringify(r));
    ok(`EARLYTAP ${tapAt}ms: the item still lands and reads back (nothing lost)`,
      !r.err && r.landedOk, JSON.stringify(r));
    await sleep(400);
  }
  // and the click-listener half of the same guard, in case a real click DOES arrive
  const rc = await page.evaluate(async () => {
    window.__crateForce = 1;
    window.__packReveal([{ name: 'Early click', rarity: 'rare', kind: 'GEAR · HAT', stats: '+7 POW' }], { coins: 0, crate: 'daily' });
    await new Promise(res => setTimeout(res, 900));
    const tilt = document.querySelector('.pack-tilt');
    if (!tilt) return { err: 'no tilt' };
    tilt.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // wait past fling's own 330ms dismiss delay, THEN past the real landing
    // beat (PACE's 1.9s ceiling), so an unguarded click has had time to finish
    // destroying the reveal before we ask whether it survived.
    await new Promise(res => setTimeout(res, 2600));
    const el = document.querySelector('.pack-card, .pc-card, .pack-reveal [class*="card"]');
    const landedOk = !!el && (el.textContent || '').includes('Early click');
    const b = document.querySelector('.pack-reveal .sheet-close');
    if (b) b.click(); else if (document.querySelector('.pack-reveal')) history.back();
    await new Promise(res => setTimeout(res, 600));
    return { landedOk };
  });
  ok('EARLYTAP 900ms: a direct click on the card before it lands does not destroy it (nothing lost)',
    !rc.err && rc.landedOk, JSON.stringify(rc));
}


/* ---- FABSAFE: R37-6, THE CLOSE HINT MUST NEVER HIT THE ADD-FOOD FAB -------
   Round 37 handoff, R37-6: #packFoot (188x80) sat 100% over #fab, 3,364px² of
   overlap, measured at both 393x852 and 375x667. closeTopSheet's restoreFocus
   un-inerts the tab bar and the dying sheet goes pointer-events:none the
   INSTANT a close begins (by design, so a dying sheet never eats a tap meant
   for what is behind it -- correct for every other sheet in the app), which
   left a real window where a second tap at the same spot 400 to 900ms later
   landed on the FAB and opened the Add-food sheet on top of the closing
   crate. Fixed two ways, both graded here: the FAB is held
   pointer-events:none + hidden for the reveal's whole life plus a beat past
   its own ~320ms teardown (js/app.js), and #packFoot is shifted clear of the
   FAB's box in CSS (app.css, .pack-foot margin-bottom).
   PROVE-RED: drop either half (the `fab.style` lines around openSheet's call
   in openPackReveal, or app.css's `.pack-foot` margin-bottom) and this goes
   red -- OVERLAP stops reading 0, or a sample resolves to the FAB again. */
for (const [w, h] of [[393, 852], [375, 667]]) {
  await setWidth(page, w, h);
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i++) {
      if (!document.querySelector('.pack-reveal')) break;
      const b = document.querySelector('.pack-reveal .sheet-close');
      if (b) b.click(); else history.back();
      await new Promise(r => setTimeout(r, 400));
    }
  });
  await sleep(500);
  const fabSafe = await page.evaluate(async () => {
    window.__crateForce = 1;
    window.__packReveal([{ name: 'FAB safe', rarity: 'rare', kind: 'GEAR · HAT', stats: '+7 POW' }], { coins: 12, crate: 'daily' });
    await new Promise(res => setTimeout(res, 1900));   // past landing
    const foot = document.querySelector('#packFoot'), fab = document.querySelector('#fab');
    if (!foot || !fab) return { err: 'missing #packFoot or #fab' };
    const fr = foot.getBoundingClientRect(), ar = fab.getBoundingClientRect();
    const overlapPx = Math.max(0, Math.min(fr.right, ar.right) - Math.max(fr.left, ar.left))
      * Math.max(0, Math.min(fr.bottom, ar.bottom) - Math.max(fr.top, ar.top));
    const cx = fr.left + fr.width / 2, cy = fr.top + fr.height / 2;
    // dismiss with the real close control, then sample the SAME on-screen spot
    // the player just tapped, across the whole close animation
    const b = document.querySelector('.pack-reveal .sheet-close');
    if (b) b.click(); else history.back();
    const samples = [];
    let last = 0;
    for (const t of [0, 100, 200, 400, 600, 900]) {
      await new Promise(res => setTimeout(res, t - last)); last = t;
      const hit = document.elementFromPoint(cx, cy);
      samples.push({ t, isFab: !!(hit && hit.closest && hit.closest('.fab')) });
    }
    return { overlapPx, samples };
  });
  ok(`FABSAFE ${w}x${h}: #packFoot no longer overlaps #fab (was 100% of its box)`,
    !fabSafe.err && fabSafe.overlapPx === 0, JSON.stringify(fabSafe));
  ok(`FABSAFE ${w}x${h}: no sample from 0 to 900ms after the close tap resolves to the FAB`,
    !fabSafe.err && fabSafe.samples.every(s => !s.isFab), JSON.stringify(fabSafe.samples));
  await sleep(800);
}
await setWidth(page, 393, 852);  // restore, for the sections below

/* ---- TAIL: THE LAST AUTHORED FRAME HAS TO BE SEEN -------------------------
   Tom, 2026-08-17: "the first chest you open for both kind clips the end of the
   animation a little bit but the second chest doesn't."

   The frame schedule used to be anchored to the moment image DECODE finished,
   while the sink and the card were anchored to the moment the reveal opened.
   Two clocks. Whatever decode cost came straight out of the last frame, and
   decode costs most on the first open of a session, which is exactly the
   asymmetry he saw.

   This row holds the crate PNGs back 300ms, which is what a phone fetching and
   decoding nine of them costs, and then asserts the last frame is still on
   screen for a real beat before the sink starts. The delay is the whole point:
   without it the shipped bug passes, because a fast desktop hides it.

   PROVEN RED on the shipped v389 tree with this exact delay:
     daily  last frame @ 1929ms vs sink @ 1600  -> clipped by 329ms
     golden last frame @ 1826ms vs sink @ 1600  -> clipped by 226ms */
{
  const p2 = await browser.newPage();
  await setWidth(p2, 393, 852);   // isMobile + hasTouch, or puppeteer reloads the page under us
  await p2.setRequestInterception(true);
  p2.on('request', async r => {
    if (/assets\/crates\/.*\.png/.test(r.url())) await new Promise(x => setTimeout(x, 300));
    r.continue().catch(() => {});
  });
  await p2.goto(base, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  for (const kind of ['daily', 'golden']) {
    const r = await p2.evaluate(async k => {
      const t0 = performance.now(); const marks = []; let last = -1;
      window.__crateForce = true;
      window.__packReveal([{ name: 'Tail', rarity: 'rare', kind: 'gear', iconHtml: '<span></span>' }], { crate: k });
      await new Promise(res => { const iv = setInterval(() => {
        const now = performance.now() - t0;
        const seq = document.querySelector('#crateSeq');
        if (seq) { const on = [...seq.children].findIndex(c => c.classList.contains('on'));
          if (on >= 0 && on !== last) { last = on; marks.push({ f: on, t: +now.toFixed(0) }); } }
        if (now > 3200) { clearInterval(iv); res(); }
      }, 16); });
      const seq = document.querySelector('#crateSeq');
      const cs = getComputedStyle(document.querySelector('.pack-reveal'));
      return { shown: marks.length, total: seq ? seq.children.length : 0,
        lastIdx: marks[marks.length - 1]?.f ?? -1, lastAt: marks[marks.length - 1]?.t ?? null,
        sink: Math.round(parseFloat(cs.getPropertyValue('--b-sink')) * 1000) };
    }, kind);
    /* CONTROL first: a run where the sequence never played would give a huge
       apparent margin and pass the real check by doing nothing. */
    ok(`TAIL ${kind} CONTROL the sequence actually reached its final frame under the delay`,
      r.total > 0 && r.lastIdx === r.total - 1,
      `showed frame ${r.lastIdx} of ${r.total - 1}`);
    const hold = r.lastAt === null ? -1 : r.sink - r.lastAt;
    ok(`TAIL ${kind} the last authored frame is on screen before the crate leaves`,
      hold >= 60, `final frame held ${hold}ms (want 60+), last frame @ ${r.lastAt}ms, sink @ ${r.sink}ms`);
    await p2.evaluate(async () => { history.back(); await new Promise(r => setTimeout(r, 900)); });
  }
  await p2.close();
}

/* ---- FLICK: THE CARD-TO-CARD MOVE GETS THE WHOLE FRAME BUDGET ------------
   Tom, 2026-09-07, on v498: "opening crates right now is super slow and
   glitchy between the items after one in the crate."

   MEASURED FIRST, on four builds (v481 before the tap guards, v487 after Open
   all and the payoff, v495 after the Open all recovery, v498), driving a real
   three-card Bone Crate through the Backpack's own OPEN button, two runs each.
   THERE IS NO REGRESSION: the wall-clock gap from the tap to the next card
   being interactive is 331 to 340ms on every one of them (it is fling's own
   `at(330, advance)`), and the per-card cost is identical too, 2 layouts, ~32
   style recalcs, 1.9ms of script, ZERO canvas work (a crate deals `wear`
   cards, whose art is <img> layers already warmed by openPackReveal, so
   drawTrimmedArt never runs between cards) and no long task at all.

   What IS wrong, and is wrong in v481 as well: the reveal renders at HALF RATE
   the whole time it is open, because #packBurst is a full-screen WebGL
   fragment shader drawing every frame. Back to back in one process, two passes
   agreeing: median frame 33.3ms with the burst mounted, 16.7ms with it hidden.
   The flick is the one moment that budget shows, so 340ms of fling plus a
   420ms rise played at 30fps, which is the "glitchy" he is describing.

   R45-5 correction: burst drawArrays calls fell from 18 and 26 on v493 to
   zero on v509 during the move. Preserve that real v500 mechanism. R45's
   12 to 20 first-flick samples in four of five runs describe that environment,
   not a universal defect. The supplied v513 remeasurement, five fresh browser
   processes/profiles with FLICK_TRACE_DIR enabled, saw first samples
   49,46,59,58,47 and second samples 43,57,59,58,43; first over20 gaps
   4,4,1,1,5, 81/81 rows passed. None reproduced the <=20 first flick;
   the first sampled more than the second in three runs. These are supplied
   observations, not measurements made in this lane. Trace adds overhead.
   First-flick asymmetry is environment-specific pending a reproduction.
   If Tom's QA rig still reproduces 12 to 20 frames, build and verify the fix
   there. Do not guess a first-flick fix or undo v500 without that reproduction.

   Each 520ms window at 60Hz has about 31 frames, so the previous 47 to 59
   claim cannot describe that window at 60Hz. Keep over20 <=6 and additionally
   require at least floor(520 / (1000/60)) - 6 = 25 samples per move. A long
   stall must not pass merely because it leaves few intervals to count.
   rAF samples measure cadence, not a count of compositor-rendered frames.
   N5: the earlier rows have already opened many crates in this process.
   Each repetition below uses a NEW browser process and profile, so those rows
   cannot warm its shaders, textures or layers. This is a cold crate reveal
   after ordinary app boot, not a claim that the OS disk cache is cold.
   Five runs print ten separate cadence rows. No average can hide a bad first.

   Optional diagnosis: FLICK_TRACE_DIR=/tmp/crate-traces saves one Chromium
   trace and a tap-time/DOM record per run. Trace mode adds profiling overhead;
   its cadence results are diagnostic, not release performance evidence. Run
   again without tracing for the cadence verdict. Traces include GPU, paint,
   raster and layer work, plus user-timing marks for each tap. Compare the
   first and second move before selecting any app fix. No cause or new
   performance improvement has been measured in this sandbox.
 */
await browser.close();
const traceDir = process.env.FLICK_TRACE_DIR;
console.log('FLICK INTERPRETATION: preserve the v500 burst-pause mechanism. First-flick asymmetry is environment-specific pending reproduction. If Tom\'s QA rig reproduces 12 to 20 frames, build and verify the fix there. Compare MACHINE CHARACTER lines, including baseline and trace overhead.');
if (traceDir) {
  mkdirSync(auditOutputPath(traceDir), { recursive: true });
  console.log('FLICK DIAGNOSTIC tracing enabled: cadence includes profiling overhead');
}
for (let run = 1; run <= 5; run++) {
  console.log(`FLICK RUN ${run}/5: fresh browser process and profile`);
  const { browser: flickBrowser, page, errors: flickErrors } = await boot(base, FLICK_BROWSER);
  let tracing = false;
  try {
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await quiet(page);
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i++) {
      if (!document.querySelector('.pack-reveal')) break;
      const b = document.querySelector('.pack-reveal .sheet-close');
      if (b) b.click(); else history.back();
      await new Promise(r => setTimeout(r, 400));
    }
    const db = await import('/js/db.js');
    for (const row of await db.db.all('inv')) if (row.kind === 'crate') await db.db.del('inv', row.id);
    // golden is `rolls: 3` in loot.js: a real hand, not a single card
    await db.db.put('inv', { id: 'flick-bone', kind: 'crate', crate: 'golden', source: 'flick-audit', ts: Date.now() });
    location.hash = '#/bonehead';
  });
  await sleep(1600);
  await page.evaluate(() => document.querySelector('#chTabs .ch-tab[data-tab="crates"]')?.click());
  await sleep(1200);
  if (traceDir) {
    await page.tracing.start({ path: auditOutputPath(path.join(traceDir, `flick-${run}.trace.json`)),
      categories: ['devtools.timeline', 'blink.user_timing', 'gpu', 'cc',
        'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.layers'] });
    tracing = true;
  }
  await sampleMachineCadence(page, `FLICK run ${run}: settled Crates tab before OPEN, after optional trace start`);
  await page.evaluate(trace => {
    window.__crateForce = 1;
    const M = window.__flick = { raf: [], long: [], counts: [], burstDraws: [], taps: [], glOps: [] };
    // CONTROL below must see this exact canvas draw before either move.
    for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!C) continue;
      // Synchronous API cost only. Deferred GPU work belongs to the trace.
      // The canvas class is set before shaders compile, before DOM attachment.
      if (trace) for (const method of ['compileShader', 'linkProgram', 'texImage2D', 'texSubImage2D', 'bufferData']) {
        const call = C.prototype[method];
        C.prototype[method] = function (...args) {
          if (!this.canvas.classList.contains('burst-gl')) return call.apply(this, args);
          const t = performance.now();
          try { return call.apply(this, args); }
          finally {
            const end = performance.now();
            M.glOps.push({ method, t, d: end - t });
            performance.measure(`crate-${method}`, { start: t, end });
          }
        };
      }
      const draw = C.prototype.drawArrays;
      C.prototype.drawArrays = function (...args) {
        if (this.canvas.closest('#packBurst')) M.burstDraws.push(performance.now());
        return draw.apply(this, args);
      };
    }
    const tick = t => { M.raf.push(t); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    try {
      new PerformanceObserver(l => { for (const e of l.getEntries()) M.long.push({ t: e.startTime, d: e.duration }); })
        .observe({ type: 'longtask', buffered: true });
    } catch { /* no longtask on this engine; the rAF rows still hold */ }
    /* MutationObserver, not a poll: renderCard deletes and re-sets
       dataset.landed inside one microtask turn, which a poll cannot see. */
    new MutationObserver(() => {
      const c = document.querySelector('#packCount')?.textContent || '';
      if (c && M.counts[M.counts.length - 1] !== c) M.counts.push(c);
    }).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
    document.querySelector('[data-open]')?.click();
  }, !!traceDir);
  /* the real control: wait for the card to be up, then tap it, exactly as the
     TAP row above proves a player does (pointerdown/pointerup, no click) */
  const moves = [];
  for (let card = 0; card < 2; card++) {
    for (let w = 0; w < 60 && !(await page.evaluate(() => !!document.querySelector('.pack-reveal')?.dataset.landed)); w++) await sleep(100);
    await sleep(400);
    const t0 = await page.evaluate(() => {
      const tilt = document.querySelector('.pack-tilt');
      if (!tilt) return null;
      const b = tilt.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      // Read the DOM before the mark so inspection is outside the move window.
      const reveal = document.querySelector('.pack-reveal');
      const state = { count: document.querySelector('#packCount')?.textContent,
        classes: reveal?.className, crate: !!reveal?.querySelector('.pack-crate'),
        art: [...tilt.querySelectorAll('img')].map(im => ({ src: im.currentSrc,
          decoded: im.complete && im.naturalWidth > 0 })) };
      const t = performance.mark(`flick-${window.__flick.taps.length + 1}`).startTime;
      window.__flick.taps.push({ t, ...state });
      tilt.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 31, clientX: cx, clientY: cy, bubbles: true }));
      tilt.dispatchEvent(new PointerEvent('pointerup', { pointerId: 31, clientX: cx, clientY: cy, bubbles: true }));
      return t;
    });
    moves.push(t0);
    await sleep(900);
  }
  const flick = await page.evaluate(() => window.__flick);
  if (tracing) { await page.tracing.stop(); tracing = false; }
  if (traceDir) writeFileSync(auditOutputPath(path.join(traceDir, `flick-${run}.samples.json`)),
    JSON.stringify({ run, viewport: { width: 393, height: 852 },
      dpr: await page.evaluate(() => devicePixelRatio), moves, ...flick }, null, 2));
  ok('FLICK CONTROL fresh session has no page errors', flickErrors.length === 0, JSON.stringify(flickErrors));
  const gaps = flick.raf.slice(1).map((t, i) => ({ t, d: t - flick.raf[i] }));
  /* CONTROL FIRST: a reveal that never advanced would render nothing, drop
     nothing, and pass the two rows below by doing no work at all. */
  ok('FLICK CONTROL the real OPEN button dealt three cards and both taps advanced',
    flick.counts.join(',') === '1 of 3,2 of 3,3 of 3' && moves.every(Boolean),
    `counts=${JSON.stringify(flick.counts)} taps=${moves.filter(Boolean).length}`);
  ok('FLICK CONTROL the burst draw instrument saw the real canvas before the first tap',
    moves[0] != null && flick.burstDraws.some(t => t < moves[0]),
    `${flick.burstDraws.length} burst drawArrays calls recorded`);
  moves.forEach((t0, n) => {
    const label = n === 0 ? 'FIRST FLICK 1->2' : 'SECOND FLICK 2->3';
    if (t0 == null) { ok(`${label} cadence`, false, 'no card to tap'); return; }
    const w = gaps.filter(g => g.t >= t0 && g.t <= t0 + 520);
    const m = { over20: w.filter(g => g.d > 20).length, over34: w.filter(g => g.d > 34).length,
      worst: Math.round(Math.max(0, ...w.map(g => g.d))), rafSamples: w.length,
      // where the worst one landed, in ms after the tap: a hitch at 0 is the
      // fling, one at ~330 is the deck rebuild; resume is >=330+480ms
      worstAt: w.length ? Math.round(w.reduce((a, b) => (b.d > a.d ? b : a)).t - t0) : null };
    const minFrames = Math.floor(520 / (1000 / 60)) - 6;
    ok(`${label} cadence: >=${minFrames} rAF samples and <=6 gaps over 20ms`,
      w.length >= minFrames && m.over20 <= 6, JSON.stringify(m));
    const draws = flick.burstDraws.filter(t => t >= t0 && t <= t0 + 520).length;
    ok(`${label} burst pauses during the move`, draws === 0, `${draws} drawArrays calls`);
  });
  /* WINDOWED. `buffered: true` hands back every long task this page has ever
     run, including the 44 rows above; counting those would grade the audit's
     own setup rather than the open. */
  const inMoves = flick.long.filter(l => moves.some(t0 => t0 != null && l.t + l.d >= t0 && l.t <= t0 + 520));
  const worstTask = Math.round(Math.max(0, ...inMoves.map(l => l.d)));
  ok('FLICK no long task over 200ms during either card move', worstTask <= 200, `worst longtask ${worstTask}ms of ${inMoves.length}`);
  } finally {
    try { if (tracing) await page.tracing.stop(); }
    finally { await flickBrowser.close(); }
  }
}

if (srv) srv.kill();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(failed ? 'CRATE REVEAL AUDIT FAILED' : 'CRATE REVEAL VERIFIED');
process.exit(failed ? 1 : 0);
