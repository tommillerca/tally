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

/* a herd worth measuring, granted through the REAL path */
await page.evaluate(async () => {
  const m = await import('./js/loot.js');
  const grants = [['C5',0],['C5',0],['C4',0],['C4',0],['C4',0],['C3',0],['C3',1],['C1',0],['C1',1],['C2',1]];
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
  const roster = await (await import('./js/paddock.js')).paddockRoster();
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
    roster: roster.length, pets: pets.length,
    decoded: imgs.filter(i => i.naturalWidth > 0).length, imgs: imgs.length,
    walkers, flops,
    keeper: [...document.querySelectorAll('.pdk-keeper img')].filter(i => i.naturalWidth > 0).length,
    lurker: !!document.querySelector('.pdk-lurker'),
    cxOwned: roster.some(r => r.sp === 'CX'),
    nest: !!document.querySelector('#pdkNest'),
    sign: !!document.querySelector('.pdk-sign'),
    coach: !!document.querySelector('#pdkCoach'),
  };
});
ok('HERD: one figure per owned copy, roster non-empty', scene.roster > 0 && scene.pets === scene.roster, `${scene.pets} figures / ${scene.roster} roster rows`);
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
ok('FURNITURE: keeper 3/3 decoded, nest, sign', scene.keeper === 3 && scene.nest && scene.sign, JSON.stringify({ k: scene.keeper, n: scene.nest, s: scene.sign }));
ok('LURKER: teases exactly when CX is unowned', scene.lurker === !scene.cxOwned, `lurker=${scene.lurker} cxOwned=${scene.cxOwned}`);
const coach = await page.evaluate(async () => {
  const before = !!document.querySelector('#pdkCoach');
  document.querySelector('.pdk-pet')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 500));
  return { before, after: !!document.querySelector('#pdkCoach') };
});
ok('COACH: a pet tap dismisses the coach mark', coach.before && !coach.after, JSON.stringify(coach));
ok('no page errors from the first load', (errors || []).length === 0, (errors || [])[0] || '');

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nthe paddock holds');
process.exit(fails.length ? 1 : 0);
