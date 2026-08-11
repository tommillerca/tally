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
 *   BANDS     the exclusive x-band rule measured on the RENDERED walkers, not on
 *             placePaddock's return: the DOM is what ships. Two walkers whose
 *             foot rows sit within 40px may share at most 20px of x-range.
 *   FLOOR     no walker or flopper foot below the panel edge
 *   ALIVE     a walker actually moves between two samples 700ms apart: a scene
 *             of statues passes every screenshot and is dead
 *   FURNITURE keeper stack decoded, nest present, sign present, CX lurker
 *             present exactly when CX is unowned
 *   COACH     tapping a pet removes the coach mark (scene-side behavior; the
 *             card slider itself is paddock-card-audit's job)
 *
 * PROVE-RED (performed at build): BANDS with a forced band overlap via injected
 * style; ALIVE with injected animation:none. Both named below at the check.
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
   walkers than WALK_CAP so the rotation path is the one under test. Two pets
   get bonds seeded (one bonded, one maxed) so the greeting and the
   best-friend band are the paths under test, not empty samples. */
await page.evaluate(async () => {
  const m = await import('./js/loot.js');
  const grants = [['C5',0],['C5',0],['C5',0],['C5',0],['C4',0],['C4',0],['C4',0],['C4',0],['C4',0],['C4',0],['C3',0],['C3',1],['C1',0],['C1',1],['C2',1]];
  for (const [sp, shiny] of grants) await m.addPetInstance(sp, { shiny: !!shiny });
  const db = await import('./js/db.js');
  const walkers = (await m.petInstances()).filter(x => x.sp === 'C5' || x.sp === 'C4');
  window.__bondSeed = { greet: walkers[0].iid, bff: walkers[1].iid };
  await db.db.put('kv', { k: 'petBonds', v: { [walkers[0].iid]: 3, [walkers[1].iid]: 5 } });
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
  const expectedFigures = roster.length - Math.max(0, walkCount - pdk.WALK_CAP);
  const pets = [...document.querySelectorAll('.pdk-pet')];
  const imgs = [...document.querySelectorAll('.pdk-pet img')];
  const walkers = [...document.querySelectorAll('.pdk-walk')].map(w => {
    const st = w.style;
    return { x0: parseFloat(st.left), w: parseFloat(st.width),
      range: parseFloat(st.getPropertyValue('--pdk-range')) || 0,
      foot: parseFloat(st.top) + parseFloat(st.height) };
  });
  const flops = [...document.querySelectorAll('.pdk-flop')].map(f => parseFloat(f.style.top) + parseFloat(f.style.height));
  return {
    roster: roster.length, pets: pets.length, walkCount, expectedFigures, cap: pdk.WALK_CAP,
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
  };
});
/* HERD is cap-aware: one figure per copy up to WALK_CAP rendered walkers,
   and the grant list above guarantees walkCount > cap so the rotation path
   is the one being measured (empty-sample rule: a sub-cap herd would let a
   broken cap pass unexercised) */
ok('HERD: one figure per owned copy up to the walk cap', scene.roster > 0 && scene.walkCount > scene.cap && scene.pets === scene.expectedFigures,
  `${scene.pets} figures / ${scene.roster} roster rows (${scene.walkCount} walkers, cap ${scene.cap})`);
ok('DECODED: every herd sprite has pixels', scene.imgs > 0 && scene.decoded === scene.imgs, `${scene.decoded}/${scene.imgs}`);
/* BANDS, on the rendered DOM. Proven red at build by injecting
   style.left overrides that force two same-row walkers onto one range. */
let pairs = 0, viol = [];
for (let i = 0; i < scene.walkers.length; i++) for (let j = i + 1; j < scene.walkers.length; j++) {
  const a = scene.walkers[i], b = scene.walkers[j];
  if (Math.abs(a.foot - b.foot) < 40) {
    pairs++;
    const ov = Math.min(a.x0 + a.w + a.range, b.x0 + b.w + b.range) - Math.max(a.x0, b.x0);
    if (ov > 20) viol.push(`${Math.round(a.foot)}row ${Math.round(ov)}px`);
  }
}
ok('BANDS: same-row walkers never share more than 20px of range', scene.walkers.length > 1 && pairs > 0 && viol.length === 0,
  scene.walkers.length < 2 ? 'FEWER THAN 2 WALKERS: the rule never ran' : viol.join(', ') || `${pairs} pairs checked`);
ok('FLOOR: every foot above the panel edge', [...scene.walkers.map(w => w.foot), ...scene.flops].every(f => f <= 498),
  JSON.stringify([...scene.walkers.map(w => Math.round(w.foot)), ...scene.flops.map(Math.round)]));
/* STONE: the graveyard corner (tombstone x16-42 base y330, cross x62-78).
   A walker whose feet land above that base is BEHIND the props in world
   space, so its band (x0 .. x0+w+range) may never reach x<86 or the herd
   layer draws it over them. Proven red at build by reverting ROW_XMIN to
   PAD. Rows below the base pass in front, correct perspective, allowed. */
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
/* LURKER, both states. Fresh profile owns no CX, so the secret tease shows
   first; granting CX through the real path must flip the bushes to an
   uncollected-SHINY tease (gold treatment, species the player owns base of,
   never CX, never an owned shiny). */
ok('LURKER: CX secret tease while CX is unowned', scene.lurker === 'CX' && !scene.lurkerShiny, `lurker=${scene.lurker} shiny=${scene.lurkerShiny}`);
ok('FURNITURE: nest and sign present', scene.nest && scene.sign, JSON.stringify({ n: scene.nest, s: scene.sign }));
/* GREET + BEST FRIEND (Tom's B pick). Wiring asserted deterministically:
   the greet class and heart puff exist on bonded pets, the computed
   animation-name carries pdkHello on a greeting WALKER (computed style is
   immune to the frozen-main-thread-clock trap, unlike playback reads), and
   the maxed pet's band starts at the keeper-corner exclusion edge. The walk
   cap's daily rotation may bench either seeded pet, so each check first
   proves its subject is ON the field today: absent subject = skip is a lie,
   so the seeding above pins BOTH into the render via bond order (maxed pets
   are pulled to index 4 by placePaddock, and greet is render-time). */
const bond = await page.evaluate(() => {
  const seed = window.__bondSeed || {};
  const pets = [...document.querySelectorAll('.pdk-pet')];
  const greets = pets.filter(p => p.classList.contains('pdk-greet'));
  const walkGreet = document.querySelector('.pdk-walk.pdk-greet .pdk-bob');
  const bffEl = pets.find(p => p.classList.contains('pdk-walk') && p.classList.contains('pdk-greet') && parseFloat(p.style.left) <= 160 && parseFloat(p.style.top) + parseFloat(p.style.height) >= 380);
  return {
    greetCount: greets.length,
    puffs: greets.filter(p => p.querySelector('.pdk-hi')).length,
    helloWired: walkGreet ? getComputedStyle(walkGreet).animationName.includes('pdkHello') : null,
    bffAtKeeper: !!bffEl,
    seedKnown: !!(seed.greet && seed.bff),
  };
});
ok('GREET: bonded pets carry the greeting and its heart puff', bond.seedKnown && bond.greetCount >= 2 && bond.puffs === bond.greetCount,
  `${bond.greetCount} greeting, ${bond.puffs} puffs`);
ok('GREET: the hop is actually wired on a greeting walker', bond.helloWired === true, `animationName includes pdkHello: ${bond.helloWired}`);
ok('BEST FRIEND: the maxed pet grazes at the keeper corner', bond.bffAtKeeper, 'walker with greet class at x<=160, feet>=380');
const coach = await page.evaluate(async () => {
  const before = !!document.querySelector('#pdkCoach');
  document.querySelector('.pdk-pet')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 500));
  return { before, after: !!document.querySelector('#pdkCoach') };
});
ok('COACH: a pet tap dismisses the coach mark', coach.before && !coach.after, JSON.stringify(coach));
/* LURKER, second state, LAST because it tears the sheets down: granting CX
   through the real path must flip the bushes to an uncollected-SHINY tease
   (gold treatment, a species whose base the player owns, never CX). */
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
    shinyAlreadyOwned: el ? insts.some(x => x.sp === el.dataset.pdk && x.shiny) : null };
});
ok('LURKER: once CX is owned, the bushes tease an uncollected shiny you could hunt',
  re && lurk2.reopened && !!lurk2.sp && lurk2.sp !== 'CX' && lurk2.shinyTreat && lurk2.ownBase && lurk2.shinyAlreadyOwned === false,
  JSON.stringify(lurk2));

ok('no page errors from the first load', (errors || []).length === 0, (errors || [])[0] || '');

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nthe paddock holds');
process.exit(fails.length ? 1 : 0);
