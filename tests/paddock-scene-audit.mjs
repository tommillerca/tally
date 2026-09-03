/* THE PADDOCK SCENE, driven end-to-end. This is the audit the figure contract's
 * SITES row for 'paddock-herd' names as its driver.
 *
 * WHAT IT PROVES, and how each check dies:
 *   ENTRY     the real Stable chip opens the scene (kill #stableToPaddock -> red)
 *   HERD      one figure per owned COPY, counted against the same roster the
 *             scene reads; zero pets on a non-empty roster is red, and an empty
 *             roster is red too (rule 3: an empty sample never passes)
 *   DECODED   every herd sprite has pixels, in the live DOM (rule: gBCR reads a
 *             CSS box over a blank frame; naturalWidth does not lie)
 *   PACKING   no two RENDERED sprite boxes share more than 20px in BOTH axes.
 *             This replaced a walkers-only band check that stayed green while a
 *             catfish sat 59x46px inside a bulldog: the old rule compared one
 *             packer's output with itself and the three packers had no idea the
 *             others existed. Flyers are exempt and it says so at the check.
 *   FLOOR     no walker or flopper foot below the panel edge
 *   ALIVE     a walker actually moves between two samples 700ms apart: a scene
 *             of statues passes every screenshot and is dead
 *   FURNITURE keeper stack decoded, nest present, sign present
 *   LURKER    the bushes tease something the player can actually go and get,
 *             never the founders' lizard, in BOTH CX states
 *   KEEPER    no point inside your own bonehead's box opens a pet's card
 *   COACH     tapping a pet removes the coach mark, AND the next visit does not
 *             bring it back (two visits compared, not one asserted)
 *   TEASER    the founder banner is gone once the player owns the founder pet
 *   BENCH     a roster bigger than the field says so in words
 *
 * PROVE-RED (performed at build on a cp -R copy of the pre-fix tree): PACKING,
 * LURKER, KEEPER, COACH-quiet, TEASER and BENCH all go red there; ALIVE with
 * injected animation:none. Named below at each check.
 *
 * Run: node tests/paddock-scene-audit.mjs http://127.0.0.1:PORT/
 */
import { boot, seed, sleep } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const base = process.argv[2] || process.env.URL;
if (!base) { console.log('FAIL  needs a base URL, no safe default.'); process.exit(1); }

const { browser, page, errors } = await boot(base);
await seed(page, { level: 30, coins: 5000, dust: 5000 });

/* a herd worth measuring, granted through the REAL path. Deliberately more
   walkers than WALK_CAP so the rotation path is the one under test. */
await page.evaluate(async () => {
  const m = await import('./js/loot.js');
  /* every motion class is over-supplied on purpose: 10 walkers past the cap of
     8, 3 catfish and 4 clouds, which is the mix both playtest reports were
     taken on. Fewer of any of them and PACKING stops exercising the seam that
     broke (two systems packing into each other), which is rule 3 wearing a
     different hat: a sample that cannot show the bug is not a sample. */
  const grants = [['C5',0],['C5',0],['C5',0],['C5',0],['C4',0],['C4',0],['C4',0],['C4',0],['C4',0],['C4',0],['C3',0],['C3',0],['C3',1],['C1',0],['C1',0],['C1',0],['C1',1],['C2',1]];
  for (const [sp, shiny] of grants) await m.addPetInstance(sp, { shiny: !!shiny });
});

async function reachPaddock() {
  await page.evaluate(() => { location.hash = '#/bonehead'; });
  await sleep(1500);
  await page.evaluate(async () => {
    document.querySelector('.ch-tab[data-tab="crates"]')?.click();
    await new Promise(r => setTimeout(r, 900));
    document.querySelector('#openStableFromBp')?.click();
  });
  await sleep(1300);
  return page.evaluate(() => { const b = document.querySelector('#stableToPaddock'); if (b) { b.click(); return true; } return false; });
}
const entered = await reachPaddock();
await sleep(2400);
ok('ENTRY: the real Stable chip opens the Paddock', entered && await page.evaluate(() => !!document.querySelector('.pdk-scene')), String(entered));

const scene = await page.evaluate(async () => {
  const pdk = await import('./js/paddock.js');
  const roster = await pdk.paddockRoster();
  const walkCount = roster.filter(r => r.motion === 'walk').length;
  const pets = [...document.querySelectorAll('.pdk-pet')];
  const rosterIids = new Set(roster.map(r => r.iid));
  const drawnIids = pets.map(p => p.dataset.iid);
  const imgs = [...document.querySelectorAll('.pdk-pet img')];
  const walkers = [...document.querySelectorAll('.pdk-walk')].map(w => {
    const st = w.style;
    return { x0: parseFloat(st.left), w: parseFloat(st.width),
      range: parseFloat(st.getPropertyValue('--pdk-range')) || 0,
      foot: parseFloat(st.top) + parseFloat(st.height) };
  });
  const flops = [...document.querySelectorAll('.pdk-flop')].map(f => parseFloat(f.style.top) + parseFloat(f.style.height));
  /* EVERY FIGURE'S BOX AS THE SCENE WROTE IT, flyers excluded (see the check).
     Read off the live elements' own inline geometry, not off placePaddock's
     return: the markup is what ships, and the three packers only ever met here.
     A walker's occupancy includes its WANDER RANGE, because same-row walkers
     get per-copy durations and drift out of phase with each other, so the whole
     x0..x0+w+range span is really its. Hoverers all share one un-delayed drift
     animation, so they move in lockstep and their relative x is the static one;
     sampling their transform would only add the same offset to every cloud. */
  const boxes = [...document.querySelectorAll('.pdk-pet:not(.pdk-fly)')].map(el => {
    const st = el.style, left = parseFloat(st.left), top = parseFloat(st.top);
    const w = parseFloat(st.width), h = parseFloat(st.height);
    const range = parseFloat(st.getPropertyValue('--pdk-range')) || 0;
    return { sp: el.dataset.pdk, kind: el.classList.contains('pdk-walk') ? 'walk' : el.classList.contains('pdk-flop') ? 'flop' : 'hover',
      x0: left, x1: left + w + range, y0: top, y1: top + h };
  });
  return {
    boxes,
    roster: roster.length, pets: pets.length, walkCount, cap: pdk.WALK_CAP,
    dupes: drawnIids.length - new Set(drawnIids).size,
    strays: drawnIids.filter(i => !rosterIids.has(i)).length,
    walkersDrawn: document.querySelectorAll('.pdk-walk').length,
    decoded: imgs.filter(i => i.naturalWidth > 0).length, imgs: imgs.length,
    walkers, flops,
    keeperImgs: document.querySelectorAll('.pdk-keeper img').length,
    keeperDecoded: [...document.querySelectorAll('.pdk-keeper img')].filter(i => i.naturalWidth > 0).length,
    lurker: document.querySelector('.pdk-lurker')?.dataset.pdk || null,
    lurkerShiny: !!document.querySelector('.pdk-lurker.pdk-lure-shiny'),
    cxOwned: roster.some(r => r.sp === 'CX'),
    nest: !!document.querySelector('#pdkNest'),
    sign: !!document.querySelector('.pdk-sign'),
    coach: !!document.querySelector('#pdkCoach'),
    /* the collection panel's half of the same two reports */
    panelMounted: !!document.querySelector('#pdkPanel .pdk-grid'),
    teaser: !!document.querySelector('.pdk-teaser'),
    bench: document.querySelector('.pdk-bench')?.textContent.trim() || null,
  };
});
/* HERD. Not "figures === roster minus a formula": the bench is no longer a
   walkers-only affair (a row that cannot hold another cloud benches a cloud
   too), and re-deriving the formula here would only be asking placePaddock
   whether it agrees with itself. The properties that matter and cannot be
   satisfied by a broken placer: exactly WALK_CAP walkers are on the grass, the
   roster really is bigger than the field so the bench path RAN, and every drawn
   figure is a distinct real copy (no duplicate iid, no invented row). */
ok('HERD: the cap is honoured and every figure is a distinct real copy',
  scene.roster > 0 && scene.walkCount > scene.cap && scene.walkersDrawn === scene.cap
  && scene.pets > 0 && scene.pets < scene.roster && scene.dupes === 0 && scene.strays === 0,
  `${scene.pets} figures / ${scene.roster} roster rows (${scene.walkersDrawn} of ${scene.walkCount} walkers, cap ${scene.cap}, ${scene.dupes} dupes, ${scene.strays} strays)`);
ok('DECODED: every herd sprite has pixels', scene.imgs > 0 && scene.decoded === scene.imgs, `${scene.decoded}/${scene.imgs}`);
/* PACKING, over the WHOLE ground and sky cast rather than one packer's output.
   The rule the design paid for is 20px; two sprites sharing more than that in
   BOTH axes are stacked, not staggered, and that is the number both playtesters
   measured. Flyers are the one exemption and it is deliberate: they cross the
   entire width on a CSS animation at their own depth (z-index 4, behind the
   herd), so they have no static x to compare and passing over a cloud is what
   they are for.
   PROVE-RED: run against the pre-fix tree, where this reports 8 offending pairs
   on this exact roster (worst 66x96px, two Drizzles on one hover spot). */
let pairs = 0, worst = { ox: 0, oy: 0 }, viol = [];
for (let i = 0; i < scene.boxes.length; i++) for (let j = i + 1; j < scene.boxes.length; j++) {
  const a = scene.boxes[i], b = scene.boxes[j];
  pairs++;
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (ox > 0 && oy > 0 && Math.min(ox, oy) > Math.min(worst.ox, worst.oy)) worst = { ox, oy, pair: `${a.sp}/${a.kind}+${b.sp}/${b.kind}` };
  if (ox > 20 && oy > 20) viol.push(`${a.sp}/${a.kind}+${b.sp}/${b.kind} ${Math.round(ox)}x${Math.round(oy)}px`);
}
ok('PACKING: no two figures share more than 20px in BOTH axes', scene.boxes.length > 1 && pairs > 0 && viol.length === 0,
  scene.boxes.length < 2 ? 'FEWER THAN 2 GROUND FIGURES: the rule never ran'
    : viol.length ? `${viol.length} bad: ${viol.join(', ')}`
      : `${pairs} pairs, worst overlap ${Math.round(worst.ox)}x${Math.round(worst.oy)}px (${worst.pair || 'none touch'})`);
ok('FLOOR: every foot above the panel edge', [...scene.walkers.map(w => w.foot), ...scene.flops].every(f => f <= 498),
  JSON.stringify([...scene.walkers.map(w => Math.round(w.foot)), ...scene.flops.map(Math.round)]));
/* STONE: the graveyard corner (tombstone x16-42 base y330, cross x62-78).
   A walker whose feet land above that base is BEHIND the props in world
   space, so its band (x0 .. x0+w+range) may never reach x<86 or the herd
   layer draws it over them. Proven red at build by dropping the top ground
   row's xmin to 8. Rows below the base pass in front, correct perspective,
   which stays allowed. */
const stoneViol = scene.walkers.filter(w => w.foot <= 340 && w.x0 < 86);
const stoneRows = scene.walkers.filter(w => w.foot <= 340).length;
ok('STONE: no behind-the-tombstone walker enters the graveyard corner', stoneRows > 0 && stoneViol.length === 0,
  stoneRows === 0 ? 'NO TOP-ROW WALKERS: the rule never ran' : `${stoneRows} top-row walkers checked`);
/* ALIVE, measured on the layer the player sees. gBCR and getComputedStyle
 * both FROZE at identity here while the herd visibly moved: headless Chrome
 * runs the wander on the compositor and stops ticking the main-thread
 * animation clock, so every geometry read lies (the v245 lesson's sibling:
 * a box read is not a pixel read). Two halves, each proven red at build:
 *   CLOCK  pdkWander exists on a walker, playState running, currentTime
 *          advances (red under animation-play-state: paused)
 *   PIXELS two screenshots of the scene 900ms apart are byte-identical only
 *          if NOTHING renders differently; a frozen scene encodes the same
 *          PNG twice (red under * { animation: none !important }) */
const clock = await page.evaluate(async () => {
  const w = document.querySelector('.pdk-walk') || document.querySelector('.pdk-fly');
  if (!w) return { why: 'no animated pet found' };
  const anim = w.getAnimations().find(a => /pdkWander|pdkCross/.test(a.animationName));
  if (!anim) return { why: 'no wander/cross animation on the pet' };
  const t0 = anim.currentTime;
  await new Promise(r => setTimeout(r, 400));
  return { state: anim.playState, dt: anim.currentTime - t0 };
});
ok('ALIVE clock: the wander animation is running and advancing', !clock.why && clock.state === 'running' && clock.dt > 200,
  clock.why || `${clock.state}, +${Math.round(clock.dt)}ms`);
const shotA = await page.screenshot({ clip: { x: 0, y: 100, width: 390, height: 400 } });
await sleep(900);
const shotB = await page.screenshot({ clip: { x: 0, y: 100, width: 390, height: 400 } });
ok('ALIVE pixels: the rendered scene changes between frames',
  Buffer.compare(Buffer.from(shotA), Buffer.from(shotB)) !== 0, `${Math.abs(shotA.length - shotB.length)} png byte delta`);
/* KEEPER IS THE PLAYER: layer count varies with the equipped outfit, so the
   check is every layer decoded and at least body+skull present (an empty
   keeper div would pass a decoded-only filter: rule 3). */
ok('KEEPER: your own bonehead, every layer decoded', scene.keeperImgs >= 2 && scene.keeperDecoded === scene.keeperImgs,
  `${scene.keeperDecoded}/${scene.keeperImgs} layers`);
/* LURKER, first state. Tom's ruling (2026-08-31): a mystery pet is a pet the
   player does not have YET, and the founders' lizard is the sole exception to
   that, which the collection panel's banner carries alone. The bushes used to
   take priority for CX, so the new player found the bushes and the banner
   opening a BYTE-IDENTICAL locked card: two mysteries, one closed door. The
   tease here must be a shiny of a species the player DOES own the base of and
   has NOT collected shiny, which is something they can go and hunt.
   PROVE-RED: the pre-fix tree teases CX here on this fresh profile. */
ok('LURKER: the bushes tease something huntable, never the founder pet',
  !!scene.lurker && scene.lurker !== 'CX' && scene.lurkerShiny, `lurker=${scene.lurker} shinyTreatment=${scene.lurkerShiny}`);
ok('FURNITURE: nest and sign present', scene.nest && scene.sign, JSON.stringify({ n: scene.nest, s: scene.sign }));
/* THE KEEPER IS YOU, AND TAPPING YOURSELF DOES NOT OPEN SOMEBODY ELSE. The
   figure was pointer-events: none while being drawn at z-index 6 OVER the herd,
   so a press on your own bonehead fell through to whatever pet was hidden behind
   him. Sampled on a 5x5 grid across the figure's real box, so the failure cannot
   hide in a corner the way it hid from a single centre probe.
   PROVE-RED: on the pre-fix tree points on the right of the box return a pet. */
const keeperHits = await page.evaluate(() => {
  const k = document.querySelector('.pdk-keeper');
  if (!k) return { why: 'no keeper' };
  const r = k.getBoundingClientRect();
  const pts = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const x = r.left + r.width * (0.1 + i * 0.2), y = r.top + r.height * (0.1 + j * 0.2);
    const el = document.elementFromPoint(x, y);
    pts.push(el && el.closest('[data-pdk]') ? (el.closest('[data-pdk]').dataset.pdk || '?') : null);
  }
  return { n: pts.length, pets: pts.filter(Boolean) };
});
ok('KEEPER: no point on your own bonehead reaches a pet behind it',
  !keeperHits.why && keeperHits.n === 25 && keeperHits.pets.length === 0,
  keeperHits.why || `${keeperHits.pets.length}/25 points fall through${keeperHits.pets.length ? ': ' + keeperHits.pets.join(',') : ''}`);
const coach = await page.evaluate(async () => {
  const before = !!document.querySelector('#pdkCoach');
  document.querySelector('.pdk-pet')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 500));
  return { before, after: !!document.querySelector('#pdkCoach') };
});
ok('COACH: a pet tap dismisses the coach mark', coach.before && !coach.after, JSON.stringify(coach));
/* BENCH. The walk cap is 8, so this roster puts fewer animals on the grass than
   the footer counts, and the panel has to say so in words rather than leaving
   the veteran to wonder where two of his pets went. The numbers are checked
   against the MEASURED figure count, not just for shape: a line that said "16 of
   16" over 14 animals would be a new lie in place of the old silence.
   PROVE-RED: the pre-fix tree renders no .pdk-bench at all. */
const benchNums = (scene.bench || '').match(/(\d+) of (\d+)/);
ok('BENCH: the panel says how many of the roster are actually out today',
  scene.panelMounted && scene.roster > scene.pets && !!benchNums
  && Number(benchNums[1]) === scene.pets && Number(benchNums[2]) === scene.roster,
  scene.roster <= scene.pets ? 'THE WHOLE ROSTER FITS: the rule never ran' : `${JSON.stringify(scene.bench)} vs measured ${scene.pets}/${scene.roster}`);
/* TEASER, first state: this profile does NOT own the founder pet, so the banner
   that offers it is honest and must be there. The second state is below. */
ok('TEASER: the founder banner shows to a player who does not own the founder pet',
  scene.panelMounted && scene.teaser, `panel=${scene.panelMounted} teaser=${scene.teaser}`);
/* LURKER, second state, LAST because it tears the sheets down: granting CX
   through the real path must NOT change what the bushes tease (they were never
   the lizard), and must remove the banner that offers it. */
await page.evaluate(async () => {
  const m = await import('./js/loot.js');
  await m.addPetInstance('CX', {});
  document.querySelectorAll('.sheet-close').forEach(b => b.click());
});
await sleep(900);
const re = await reachPaddock();
await sleep(2400);
const lurk2 = await page.evaluate(async () => {
  const el = document.querySelector('.pdk-lurker');
  const loot = await import('./js/loot.js');
  const owned = await loot.ownedCosmeticIds();
  const insts = await loot.petInstances();
  return { reopened: !!document.querySelector('.pdk-scene'), sp: el?.dataset.pdk || null,
    shinyTreat: !!el?.classList.contains('pdk-lure-shiny'), ownBase: el ? owned.has(el.dataset.pdk) : false,
    /* the whole point: the teased shiny must be one the player does NOT have */
    shinyAlreadyOwned: el ? insts.some(x => x.sp === el.dataset.pdk && x.shiny) : null,
    cxOwned: owned.has('CX'),
    panelMounted: !!document.querySelector('#pdkPanel .pdk-grid'),
    teaser: !!document.querySelector('.pdk-teaser'),
    coach: !!document.querySelector('#pdkCoach') };
});
ok('LURKER: once CX is owned, the bushes tease an uncollected shiny you could hunt',
  re && lurk2.reopened && !!lurk2.sp && lurk2.sp !== 'CX' && lurk2.shinyTreat && lurk2.ownBase && lurk2.shinyAlreadyOwned === false,
  JSON.stringify(lurk2));
/* TEASER, second state, and this pair is the whole check: the banner was
   rendered unconditionally, so the veteran who has owned the Day One Lizard
   since the beta was advertised his own pet and handed a card telling him
   somebody else owns one. Two RENDERS of the same panel across two ownership
   states, both sample sets non-empty, is what makes this a guard rather than a
   markup assertion.
   PROVE-RED: on the pre-fix tree the banner is still there in this state. */
ok('TEASER: the founder banner is gone once the player owns the founder pet',
  lurk2.panelMounted && lurk2.cxOwned && scene.teaser && !lurk2.teaser,
  `owned=${lurk2.cxOwned} before=${scene.teaser} after=${lurk2.teaser}`);
/* COACH, second visit. It re-rendered on EVERY entry and only cleared on a
   scene-pet tap inside that one visit, so the veteran was onboarded every time
   he walked in. A pet was tapped above, so this visit must arrive without it.
   Same two-render shape: coach present on visit one, absent on visit two.
   PROVE-RED: on the pre-fix tree the pill is back on this visit. */
ok('COACH: it does not greet a player who has already tapped a pet',
  lurk2.reopened && scene.coach && !lurk2.coach, `visit1=${scene.coach} visit2=${lurk2.coach}`);

ok('no page errors from the first load', (errors || []).length === 0, (errors || [])[0] || '');

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nthe paddock holds');
process.exit(fails.length ? 1 : 0);
