/* THE v359 BATCH. Twelve fixes Tom listed on 2026-08-10, each with the check
 * that would have caught it. Everything here operates a real control and reads
 * the result: rendering a screen and looking at it proves nothing, because every
 * one of these bugs rendered a perfectly good screen.
 *
 * Run: node tests/batch-audit.mjs [baseUrl]
 */
import { boot, seed, sleep, settle, finishFight } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const base = process.argv[2] || 'http://localhost:8765/';
const { browser, page } = await boot(base);
const errs = []; page.on('pageerror', e => errs.push(String(e)));
await page.evaluateOnNewDocument(() => { window.__crateForce = 1; window.__hatchForce = 1; });
await seed(page, { level: 30, coins: 5000, dust: 5000 });

/* ---- 4: Cam's lightning is the subject of every cast ---------------------- */
/* "You also haven't included any of the lightning bolts etc that were attached
   in the artwork I gave you... that's why cam included them." mage-fx.png sat on
   disk unreferenced while wraith-fx.js drew its own light from scratch. */
await page.evaluate(async () => { await window.__denFight(1.4, 0.5, { mage: true, name: 'The Live Wire' }); });
await sleep(2600); await settle(page, 400);
const casts = await page.evaluate(async () => {
  const arena = document.getElementById('arena'), stage = document.getElementById('foeStage');
  const m = await import('./js/wraith-fx.js');
  const anchors = m.anchorsFor(stage.getBoundingClientRect(), arena.getBoundingClientRect());
  const ar = arena.getBoundingClientRect();
  const out = {};
  for (const name of Object.keys(m.CASTS)) {
    document.querySelectorAll('.wfx').forEach(n => n.remove());
    m.cast(arena, name, anchors, {});
    await new Promise(r => setTimeout(r, 300));
    const imgs = [...document.querySelectorAll('.wfx img.art')];
    await Promise.all(imgs.map(i => i.decode().catch(() => {})));
    /* ON SCREEN, not merely in the DOM. reap used to be positioned off the left
       edge of the arena, so it was present, decoded, and invisible. */
    const onStage = imgs.filter(i => {
      const r = i.getBoundingClientRect();
      const overlap = Math.max(0, Math.min(r.right, ar.right) - Math.max(r.left, ar.left));
      return i.naturalWidth > 0 && r.width > 8 && overlap > r.width * 0.5;
    });
    out[name] = { total: imgs.length, onStage: onStage.length };
  }
  document.querySelectorAll('.wfx').forEach(n => n.remove());
  return out;
});
const castNames = Object.keys(casts);
ok('every one of his casts exists', castNames.length >= 4, castNames.join(', '));
const noArt = castNames.filter(n => casts[n].total === 0);
ok("every cast draws Cam's own art", noArt.length === 0, noArt.length ? `no sprite: ${noArt.join(', ')}` : castNames.map(n => `${n}:${casts[n].total}`).join(' '));
const offStage = castNames.filter(n => casts[n].onStage < casts[n].total);
ok('and all of it is actually inside the arena', offStage.length === 0,
  offStage.length ? offStage.map(n => `${n} ${casts[n].onStage}/${casts[n].total} on stage`).join(', ') : 'nothing clipped off the edge');

/* ---- 5 + 6: two enemies read as two enemies ------------------------------ */
const twoUp = await page.evaluate(() => {
  const a = document.getElementById('addStage'), f = document.getElementById('foeStage');
  if (!a || !f) return { why: 'no add in this fight' };
  const box = e => { const r = e.getBoundingClientRect(); return { x: r.x, w: r.width, right: r.right }; };
  const A = box(a), F = box(f);
  const ar = document.getElementById('arena').getBoundingClientRect();
  const sat = /saturate\(([\d.]+)\)/.exec(getComputedStyle(a).filter);
  return { sat: sat ? +sat[1] : 1, addW: A.w,
    offStage: Math.round(Math.max(0, ar.left - A.x) + Math.max(0, A.right - ar.right)) };
});
ok('the add is not washed out', !twoUp.why && twoUp.sat >= 0.8, `saturate(${twoUp.sat}) (0.55 was the faded one)`);
/* NOT "clear of the boss": sitting in front of his hem is the intended depth and
   is what every other den add does. The first version of this check demanded
   separation, I moved the add to satisfy it, and MEASURED the result at real
   phone widths: 36px off the left edge of the arena at 320, and 39/52/76px on top
   of the player at 375/390/430. The check was wrong, not the layout. What must
   never happen is the add leaving the stage, so that is what is asserted. */
ok('the add is fully on stage', !twoUp.why && twoUp.offStage === 0,
  twoUp.why || `${twoUp.offStage}px outside the arena`);

/* A dead enemy must go down THE MOMENT its bar empties, not when the fight ends,
   and the survivor must announce itself. */
const downed = await page.evaluate(async () => {
  const st = window.__fightState && window.__fightState();
  return st ? 'seam' : 'none';
});
const killOne = await page.evaluate(async () => {
  /* kill the BOSS only and leave the add up: the state the fight had no visual
     language for at all */
  const f = document.getElementById('foeStage');
  if (!window.__fightPoke) return { why: 'no seam' };
  window.__fightPoke({ foeHp: 0 });
  await new Promise(r => setTimeout(r, 700));
  const a = document.getElementById('addStage');
  const flared = a ? a.classList.contains('last-standing') : null;
  /* NOW KILL THE SURVIVOR TOO, AND MEASURE PIXELS. The first version of this
     check asserted classList.contains('ko') and nothing else, so it passed on a
     build where the flare's animation-fill-mode:both permanently outranked
     .fstage.ko and the add stayed bolt upright at 55% opacity for the rest of the
     fight: the exact bug this was written to catch. A class is not a pose. */
  window.__fightPoke({ addHp: 0 });
  await new Promise(r => setTimeout(r, 1600));   // past the flare's 1.15s
  const rot = el => {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return Math.round(Math.abs(Math.atan2(m.b, m.a) * 180 / Math.PI));
  };
  return { foeKo: f.classList.contains('ko'), addKo: a ? a.classList.contains('ko') : null,
           survivorFlare: flared,
           foeRot: rot(f), addRot: a ? rot(a) : null };
});
if (killOne.why) {
  ok('a defeated enemy lies down (needs __fightPoke)', false, killOne.why);
} else {
  ok('a defeated enemy lies down before the fight ends', killOne.foeKo, JSON.stringify(killOne));
  ok('and the one still standing flares', killOne.survivorFlare === true, JSON.stringify(killOne));
  /* the pose, in degrees, not the class name */
  ok('the knocked-down boss is actually rotated over', killOne.foeRot > 40, `${killOne.foeRot}deg (.ko is 78deg)`);
  ok('and so is the one that flared, once it dies too', killOne.addRot > 40,
    `${killOne.addRot}deg  (0 means the flare is still overriding the KO pose)`);
}

/* ---- 7: no dead space above the result ----------------------------------- */
await page.evaluate(() => document.querySelectorAll('.sheet-close').forEach(b => b.click()));
await sleep(900);
await page.evaluate(async () => { await window.__denFight(1.0, 0, { name: 'Gap Test' }); });
await sleep(2200);
await finishFight(page, 'p');
await sleep(3200);
const gap = await page.evaluate(() => {
  const over = document.querySelector('.fight-over');
  const arena = document.querySelector('.fight-body .arena');
  if (!over) return { why: 'no result panel' };
  return { arenaH: arena ? Math.round(arena.getBoundingClientRect().height) : null,
           settled: !!document.querySelector('.fight-body.fight-settled') };
});
ok('the arena closes once the fight is decided', !gap.why && gap.settled && gap.arenaH < 40,
  gap.why || `arena ${gap.arenaH}px after the knockdown (it was 258+ before)`);

/* ---- 11: the egg cracks in place --------------------------------------- */
/* "the end of the hatch egg animation has the egg shoot down to the bottom of
   the screen randomly at the end of its animation... it should be staying in the
   same spot." It was a CLASS COLLISION: the stage added a bare `burst` class,
   which matched the combat FX particle rule (position:absolute; top:50%;
   width:14px; transform:translate(-50%,-50%)), so the egg was being turned into a
   spark. Measured then: y182 h200 -> y495 h18. This tracks the egg's CENTRE,
   because it legitimately shrinks as it bursts; what it must not do is travel. */
await page.evaluate(() => document.querySelectorAll('.sheet-close').forEach(b => b.click()));
await sleep(800);
const eggRun = await page.evaluate(async () => {
  if (!window.__openHatch) return { why: 'no __openHatch seam' };
  const data = await import('./data/boneheadz.js');
  const pet = data.BH_ITEMS.find(i => i.slot === 'C');
  window.__openHatch({ item: pet, shiny: false, dupe: false, coins: 0 });
  await new Promise(r => setTimeout(r, 350));
  const centres = [], stages = [];
  for (let i = 0; i < 20; i++) {
    const e = document.getElementById('boneEgg');
    const st = document.querySelector('.hatch-stage');
    if (!e || !e.isConnected || !st) break;
    const r = e.getBoundingClientRect(), sr = st.getBoundingClientRect();
    if (!r.width) break;
    centres.push({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    stages.push(sr.y);
    await new Promise(r2 => setTimeout(r2, 110));
  }
  if (centres.length < 8) return { why: `only ${centres.length} samples` };
  const ys = centres.map(c => c.y), xs = centres.map(c => c.x);
  return { n: centres.length,
    yDrift: +(Math.max(...ys) - Math.min(...ys)).toFixed(1),
    xDrift: +(Math.max(...xs) - Math.min(...xs)).toFixed(1),
    stageDrift: +(Math.max(...stages) - Math.min(...stages)).toFixed(1) };
});
ok('the egg hatches without travelling', !eggRun.why && eggRun.yDrift <= 6 && eggRun.xDrift <= 6,
  eggRun.why || `centre moved ${eggRun.xDrift}px x / ${eggRun.yDrift}px y over ${eggRun.n} frames`);
ok('and its stage never gets yanked out of the layout', !eggRun.why && eggRun.stageDrift <= 4,
  eggRun.why || `stage moved ${eggRun.stageDrift}px (it moved 313px when the burst class collided with the combat FX class)`);

ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' ; '));
await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nbatch clean');
process.exit(fails.length ? 1 : 0);
