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

/* ---- 4: Cam's lightning is the subject of every cast, THROUGH THE GAME ----- */
/* "You also haven't included any of the lightning bolts etc that were attached
   in the artwork I gave you... that's why cam included them."
   REWRITTEN to obey the FX contract's first rule: fire the real control, never
   the FX function. The first version imported wraith-fx and called cast()
   directly, which proved the library while the game's dispatch could be broken;
   the rise-to-wail remap lived at exactly that layer and this check passed over
   it. Now every kit cast is reached the way a player reaches it: the
   webdriver-only __bhFight.forceCast seam replaces the AI's DICE (never its
   rules; the move must still pass its own gates in pit.js), the turn is handed
   over for real, and the event renderer does the casting. */
/* close stacked sheets one at a time, top first: a blanket click on every
   .sheet-close in one tick only pops the top of the history stack, and this
   audit opens six fights back to back */
async function closeSheets() {
  for (let i = 0; i < 10; i++) {
    const n = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.sheet-close')];
      if (btns.length) btns[btns.length - 1].click();
      return btns.length;
    });
    if (!n) break;
    await sleep(500);
  }
}
const KIT_CASTS = ['bolt', 'wail', 'rise', 'grasp', 'reap'];
async function castRun(width, height = 900, squash = 0) {
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await closeSheets();
  await page.evaluate(async () => { await window.__denFight(1.4, 0.5, { mage: true, name: 'The Live Wire' }); });
  await sleep(2400); await settle(page, 400);
  return page.evaluate(async (names, squash) => {
    const arena = document.getElementById('arena');
    if (!arena || !window.__bhFight || !window.__bhFight.forceCast) return { why: 'no fight or no seam' };
    const out = { casts: {}, anchor: null };
    const sample = async () => {
      /* decoded pixels DURING the animation, best frame of ten (FX contract) */
      let best = { total: 0, onStage: 0 };
      const ar = arena.getBoundingClientRect();
      for (let f = 0; f < 10; f++) {
        const imgs = [...document.querySelectorAll('.wfx img.art')];
        await Promise.all(imgs.map(i => i.decode().catch(() => {})));
        const on = imgs.filter(i => {
          const r = i.getBoundingClientRect();
          const ox = Math.max(0, Math.min(r.right, ar.right) - Math.max(r.left, ar.left));
          return i.naturalWidth > 0 && r.width > 8 && ox > r.width * 0.5;
        });
        if (on.length >= best.onStage) best = { total: imgs.length, onStage: on.length };
        await new Promise(r => setTimeout(r, 90));
      }
      return best;
    };
    for (const name of names) {
      window.__fightPoke && window.__fightPoke({ foeHp: 400 });         // the run must outlive the sampling
      document.querySelectorAll('.wfx').forEach(n => n.remove());
      window.__bhFight.forceCast(name);
      await new Promise(r => setTimeout(r, 350));
      out.casts[name] = await sample();
      for (let i = 0; i < 24 && window.__bhFight.state().active !== 'p' && !window.__bhFight.state().over; i++) {
        await new Promise(r => setTimeout(r, 150));
      }
      if (window.__bhFight.state().over) { out.casts[name].endedEarly = true; break; }
    }
    /* ANCHOR ACCURACY, measured against the drawn INK. The expectation is
       computed here, independently, from the plate's own naturalWidth vs its
       box (the object-fit: contain letterbox), so if the app ever maps anchors
       onto the raw stage box again (the v359 bug), got and want disagree by the
       letterbox offset and this goes red. rise lands its strike on the hand
       column: hand.x - 8 in cast coordinates. */
    const stage = document.getElementById('foeStage');
    const img = stage && stage.querySelector('img.mage-plate');
    if (img && img.naturalWidth && !window.__bhFight.state().over) {
      /* geometry torture: the mapping must follow the INK under any box. At the
         shipped stage aspect the letterbox is vertical and the anchors sit near
         fraction 0.5, so a raw-box mapping misses by only ~3px and a tolerance
         check cannot condemn it. Squashing the stage flips the fit to
         height-bound, opens a ~50px side letterbox, and a raw-box mapping now
         misses the hand by ~32px: that is the geometry where this guard was
         proven red. */
      if (squash) { stage.style.height = squash + 'px'; await new Promise(r => requestAnimationFrame(r)); }
      const asp = img.naturalWidth / img.naturalHeight;
      /* WANT is measured pre-cast, in arena coordinates, from the plate's own
         contain-fit ink rect. GOT is read from the sprite wrapper's INLINE
         left/top/width (the frozen cast coordinates), NOT from gBCR: the whole
         .wfx layer breathes with an entrance/exit scale animation, so a gBCR
         mid-flight is distorted by up to layer-half-height x (s-1): 14px at a
         900-tall arena. That distortion is deliberate motion, not a misplaced
         anchor; the inline style is what the anchor mapping actually produced.
         The layer is inset:0 of the arena, so cast coords sit at the padding
         box: 2px of border off the arena's gBCR. */
      const arr = arena.getBoundingClientRect();
      const b = img.getBoundingClientRect();
      const w = Math.min(b.width, b.height * asp), h = w / asp;
      const bord = 2;
      const want = { x: b.left + (b.width - w) / 2 - arr.left - bord + w * 0.184 - 8,   // ANCHORS.hand x, rise's -8
                     y: b.top + (b.height - h) / 2 - arr.top - bord + h * 0.383 + 76 }; // hood.y + 168 - 92
      window.__fightPoke && window.__fightPoke({ foeHp: 400 });
      document.querySelectorAll('.wfx').forEach(n => n.remove());
      window.__bhFight.forceCast('rise');
      await new Promise(r => setTimeout(r, 450));
      const st = [...document.querySelectorAll('.wfx .artwrap')]
        .find(el => el.querySelector('img[src*="bolt-strike"]'));
      if (st) {
        const gx = parseFloat(st.style.left) + parseFloat(st.style.width) / 2;
        const gy = parseFloat(st.style.top) + parseFloat(st.style.height) / 2;
        out.anchor = { dx: +(gx - want.x).toFixed(1), dy: +(gy - want.y).toFixed(1),
          box: [+b.width.toFixed(1), +b.height.toFixed(1)], ink: [+w.toFixed(1), +h.toFixed(1)] };
      }
    }
    return out;
  }, KIT_CASTS, squash);
}
const cast390 = await castRun(390);
if (cast390.why) {
  ok('the kit casts fire through the real dispatch', false, cast390.why);
} else {
  const cn = Object.keys(cast390.casts);
  ok('every kit cast fires through the real dispatch', cn.length === KIT_CASTS.length && cn.every(n => cast390.casts[n].total > 0),
    cn.map(n => `${n}:${cast390.casts[n].total}`).join(' '));
  const blank = cn.filter(n => cast390.casts[n].onStage === 0);
  ok("and every cast draws Cam's art on stage, decoded, mid-animation", blank.length === 0,
    blank.length ? `blank: ${blank.join(', ')}` : 'all sampled visible');
  const near = a => !!a && Math.abs(a.dx) <= 8 && Math.abs(a.dy) <= 8;
  ok('the strike lands on his hand, not on the letterbox', near(cast390.anchor), JSON.stringify(cast390.anchor));
}
/* the letterbox error is width-dependent (that is the whole bug), so the anchor
   claim is re-proven where the drift is LARGEST: a wide stage column. 320 covers
   the small-phone end. */
/* the 390x620 run is the one that catches the ORIGINAL bug: a short viewport
   clamps the stage height under the plate's aspect, the fit flips to
   height-bound, and a raw-box mapping misses in X by the side letterbox. */
for (const [w, h, squash] of [[320, 900, 0], [760, 900, 0], [390, 620, 0], [390, 900, 120]]) {
  const run = await castRun(w, h, squash);
  const nearW = a => !!a && Math.abs(a.dx) <= 8 && Math.abs(a.dy) <= 8;
  ok(`anchors hold at ${w}x${h}${squash ? ' squashed to ' + squash : ''}`, !run.why && nearW(run.anchor),
    run.why || JSON.stringify(run.anchor));
}
await page.setViewport({ width: 390, height: 900, deviceScaleFactor: 2 });
await closeSheets();
/* the amulet shatter is reached HONESTLY: a real crit from real jabs in a
   seeded fight. Bounded, and a miss is a report, not a hang. */
await page.evaluate(async () => { await window.__denFight(1.4, 0.5, { mage: true, name: 'The Live Wire' }); });
await sleep(2400); await settle(page, 400);
const amuletRun = await page.evaluate(async () => {
  if (!window.__bhFight) return { why: 'no fight' };
  let shattered = false, fxSeen = 0;
  window.__bhFight.sharpen();                       // the next real hit crits; resolveHit still does the work
  for (let t = 0; t < 12 && !shattered && !window.__bhFight.state().over; t++) {
    window.__fightPoke && window.__fightPoke({ foeHp: 400 });
    if (window.__bhFight.state().active === 'p') window.__bhFight.act('jab');
    await new Promise(r => setTimeout(r, 220));
    if (!window.__bhFight.state().amulet) {
      shattered = true;
      for (let f = 0; f < 8; f++) {
        const on = [...document.querySelectorAll('.wfx img.art')].filter(i => i.naturalWidth > 0).length;
        fxSeen = Math.max(fxSeen, on);
        await new Promise(r => setTimeout(r, 90));
      }
    }
  }
  return { shattered, fxSeen };
});
ok('a real crit shatters the amulet and draws its sparks', !amuletRun.why && amuletRun.shattered && amuletRun.fxSeen > 0,
  amuletRun.why || `shattered=${amuletRun.shattered} decoded art at peak=${amuletRun.fxSeen}`);

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
await closeSheets();
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
