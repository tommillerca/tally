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
/* NO DEFAULT URL. This used to fall back to http://localhost:8765/, which in this
   house is normally another session's checkout, so a green run proved nothing
   about the code in front of you. There is no safe default: say which tree. */
const base = process.argv[2];
if (!base) {
  console.log('FAIL  batch-audit needs a base URL, and there is no safe default.');
  console.log('        Use `npm run gate` (it serves this checkout on its own port), or pass one:');
  console.log('        node tests/batch-audit.mjs http://127.0.0.1:PORT/');
  process.exit(1);
}
/* THE FIRST LOAD COUNTS. This used to attach its own pageerror listener here,
   after boot() had already navigated, so anything thrown while the app booted was
   invisible to the check at the bottom: the one error that takes the whole app
   down was the one error it could not see. godmode's boot() now hooks the page
   before its first goto and hands back what it collected. */
const { browser, page, errors: errs } = await boot(base);
await page.evaluateOnNewDocument(() => { window.__crateForce = 1; window.__hatchForce = 1; });
await seed(page, { level: 30, coins: 5000, dust: 5000 });

/* ---- 4: Cam's lightning, deterministic and THROUGH THE GAME ---------------- */
/* Two layers of proof, complementary:
   THIS SECTION drives every kit cast deterministically through the game's own
   dispatch (webdriver seam __bhFight.forceCast replaces the AI's DICE only; the
   move still passes its own gates in pit.js's kit roll), asserts decoded art on
   stage mid-animation, and pins the anchor mapping to the drawn ink at four
   geometries plus a squashed prove-red geometry. It replaced a direct
   fx.cast() block: the FX contract bans calling the animation's own function,
   and the rise remap lived at exactly the layer a direct call skips.
   THE viaFight SECTION BELOW plays real random turns and checks each cast that
   fired brought its own sprite: nondeterministic, end-to-end, catches what a
   forced roll cannot (the AI never choosing a move at all). Keep both. */
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
  /* a COLD first boot can need longer than the fixed sleeps (measured: the same
     code passed warm and failed cold); poll for readiness, and if it never
     arrives the main evaluate still returns its own failure. Never a pass. */
  for (let i = 0; i < 30; i++) {   // 15s ceiling: under gate load the first mage open has exceeded 6s
    const ready = await page.evaluate(() => !!(document.getElementById('arena') && window.__bhFight && window.__bhFight.forceCast));
    if (ready) break;
    await sleep(500);
  }
  return page.evaluate(async (names, squash) => {
    const arena = document.getElementById('arena');
    if (!arena || !window.__bhFight || !window.__bhFight.forceCast) return { why: 'no fight or no seam', dbg: { arena: !!arena, bh: !!window.__bhFight, fc: !!(window.__bhFight && window.__bhFight.forceCast), hash: location.hash, sheets: document.querySelectorAll('.sheet-close').length, veils: document.querySelectorAll('.drop-veil').length } };
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

/* viaFight below needs a FRESH fight: the amulet run above shatters the amulet,
   which gates wail and rise off his kit, and its fight is at 1.4x where a
   swinging harness kills him early (Aggie measured both). 3.2x, clean slate. */
await closeSheets();
await page.evaluate(async () => { await window.__denFight(3.2, 0.5, { mage: true, name: 'The Live Wire' }); });
await sleep(2400); await settle(page, 400);

/* AND THROUGH THE GAME'S OWN DISPATCH. Everything above calls fx.cast() straight,
   which tests the LIBRARY. The `rise` cast was remapped to `wail` at the dispatch
   site in app.js and no direct-call check could ever see it: the library was
   perfect and the game never asked it for that cast. So this drives real turns
   and records which casts the FIGHT actually renders. */
const viaFight = await page.evaluate(async () => {
  const seen = new Set();
  const lines = new Set();
  const arena = document.getElementById('arena');
  const mo = new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType !== 1 || !n.classList || !n.classList.contains('wfx')) continue;
      for (const img of n.querySelectorAll('img.art')) {
        const f = (img.getAttribute('src') || '').split('/').pop();
        if (f) seen.add(f);
      }
    }
  });
  mo.observe(arena, { childList: true, subtree: true });
  /* THE ACTION LADDER MATTERS. First attempt only clicked End Turn and hung on
     the pet's turn; the one before it swung every round and a level-30 player
     killed him before he ever acted. Neither saw a single cast, and both would
     have read as "the dispatch is broken" when the dispatch was fine. Resolve the
     pet's turn, then hand over, and only swing if there is nothing else to do. */
  /* LONG ENOUGH TO COVER THE KIT. A short run only ever saw `reap`, and a guard
     that happens to miss the cast it was written for is not a guard: with the
     rise->wail remap restored it went green. Runs until his kit has been
     exercised or the fight ends. */
  const need = new Set(['rise', 'bolt']);
  for (let step = 0; step < 400; step++) {
    /* NO `else break`. Between turns the action row is rebuilt, so for a tick or
       two nothing is clickable: bailing on the first such tick ran the whole
       check in two steps and saw one cast. Keep polling and let the fight play. */
    const pm = document.querySelector('.fight-act.petmove:not([disabled])');
    const et = document.getElementById('endTurn');
    const atk = document.querySelector('.fight-act[data-act=swing]:not([disabled])');
    if (pm) pm.click(); else if (et && !et.disabled) et.click(); else if (atk) atk.click();
    /* arrangement, not performance: nobody is allowed to DIE before the kit has
       been exercised, or whether this check sees rise and bolt depends on the
       seed position of this fight in the audit (it did: reordering the suite
       made the player die at step ~60 with one cast seen). No cast is faked;
       death just stops being a stopping condition. */
    window.__fightPoke && window.__fightPoke({ foeHp: 900, pHp: 900 });
    await new Promise(r => setTimeout(r, 240));
    const l = document.getElementById('flog')?.textContent || '';
    if (l) {
      lines.add(l);
      if (/up out of the floor|claws its way up/i.test(l)) need.delete('rise');
      if (/hollow bolt/i.test(l)) need.delete('bolt');
    }
    if (!need.size) break;
    if (document.querySelector('.fight-over')) break;
  }
  mo.disconnect();
  return { sprites: [...seen], lines: [...lines] };
});
/* EACH CAST MUST BRING ITS OWN ART. "at least one sprite appeared" is not enough:
   with the rise->wail remap restored, reap still fired and the check went green
   on the exact bug it was written for. So the fight log says which cast the GAME
   chose, and every cast that fired has to have put ITS sprite on screen. */
const CAST_ART = [
  ['rise',   /up out of the floor|claws its way up/i, 'bolt-strike.png'],
  ['bolt',   /hollow bolt/i,                          'bolt-tall.png'],
  ['reap',   /\breaps?\b/i,                           'bolt-sweep.png'],
  ['wail',   /wails?\b|wounds will not close/i,        'zigzag.png'],
  ['amulet', /amulet/i,                                'sparks.png'],
];
const fired = CAST_ART.filter(([, re]) => viaFight.lines.some(l => re.test(l)));
ok('his casts reached the screen at all', viaFight.sprites.length > 0,
  viaFight.sprites.length ? viaFight.sprites.join(', ') : 'no Cam sprite reached the screen from a real turn');
ok('the fight exercised his kit, not just one move', fired.length >= 2,
  fired.map(([id]) => id).join(', ') || `he never cast anything in 120 steps (${viaFight.lines.length} log lines seen)`);
const wrongArt = fired.filter(([, , art]) => !viaFight.sprites.includes(art));
ok('and every cast that fired drew ITS OWN art', wrongArt.length === 0,
  wrongArt.length ? wrongArt.map(([id, , a]) => `${id} fired but ${a} never appeared`).join('; ')
                  : fired.map(([id, , a]) => `${id}->${a}`).join(', '));


/* ---- 5 + 6: two enemies read as two enemies ------------------------------ */
/* AT EVERY PHONE WIDTH, AGAINST BOTH NEIGHBOURS. The first version measured the
   add against the BOSS only, at one viewport. So when the add was moved to satisfy
   it, the new position hung 36px off the arena at 320px and sat 39/52/76px ON THE
   PLAYER at 375/390/430, and this file went green on all of it. A layout claim
   that is not checked at 320 / 390 / 430 is a claim about one phone.
   The sheet is REOPENED per width, not resized: arriving at a width is not the
   same as resizing an open fight, and 320 is where it breaks. */
const WIDTHS = [320, 390, 430];
const geo = [];
for (const w of WIDTHS) {
  await page.setViewport({ width: w, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluate(() => document.querySelectorAll('.sheet-close').forEach(b => b.click()));
  await sleep(600);
  await page.evaluate(async () => { await window.__denFight(1.4, 0.5, { mage: true, name: 'The Live Wire' }); });
  await sleep(2200); await settle(page, 300);
  geo.push(await page.evaluate(wid => {
    const g = id => document.getElementById(id);
    const box = e => { if (!e) return null; const r = e.getBoundingClientRect();
      return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; };
    const add = box(g('addStage')), you = box(g('youStage')), foe = box(g('foeStage')),
          arena = box(document.getElementById('arena'));
    if (!add || !you || !foe || !arena) return { w: wid, why: 'missing stage' };
    const ov = (a, b) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l));
    const sat = /saturate\(([\d.]+)\)/.exec(getComputedStyle(g('addStage')).filter);
    const cx = r => r.l + r.w / 2;
    return { w: wid,
      /* ALL FOUR EDGES. Left and right alone meant an add pushed through the floor
         or the ceiling of the arena still read as fully on stage. */
      offStage: Math.round(Math.max(0, arena.l - add.l) + Math.max(0, add.r - arena.r)
                         + Math.max(0, arena.t - add.t) + Math.max(0, add.b - arena.b)),
      onPlayer: Math.round(ov(add, you)), onBoss: Math.round(ov(add, foe)),
      addW: Math.round(add.w), sat: sat ? +sat[1] : 1,
      nearerFoe: Math.abs(cx(add) - cx(foe)) < Math.abs(cx(add) - cx(you)) };
  }, w));
  await page.evaluate(() => document.querySelectorAll('.sheet-close').forEach(b => b.click()));
  await sleep(400);
}
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
/* AN EMPTY SAMPLE IS A FAILURE. A width where the fight never opened means the
   loop proved nothing there, so it is reported as a miss, not skipped. */
ok('the two-enemy fight opened at every width', geo.length === WIDTHS.length && geo.every(g => !g.why),
  geo.map(g => `${g.w}:${g.why || 'ok'}`).join(' '));
const offAny = geo.filter(g => g.why || g.offStage > 0);
ok('the add stays inside the arena at 320 / 390 / 430', offAny.length === 0,
  offAny.length ? offAny.map(g => `${g.w}px: ${g.why || g.offStage + 'px outside'}`).join(', ')
                : geo.map(g => `${g.w}:ok`).join(' '));
const faded = geo.filter(g => !g.why && g.sat < 0.8);
ok('the add is not washed out, at any width', faded.length === 0,
  faded.length ? faded.map(g => `${g.w}px: saturate(${g.sat})`).join(', ')
               : geo.map(g => `${g.w}:saturate(${g.sat})`).join(' ') + '  (0.55 was the faded one)');
/* The boss's own stage is 208px inside a 288px arena at 320px, so the three
   figures are genuinely crowded there and a zero-overlap rule would fail on
   shipped, pre-existing layout. What must not happen is the add sitting mostly on
   the player, which is what the earlier "fix" did. */
const onPlayer = geo.filter(g => !g.why && g.onPlayer > g.addW * 0.5);
ok('and never lands mostly on the player', onPlayer.length === 0,
  onPlayer.length ? onPlayer.map(g => `${g.w}px: ${g.onPlayer}px of a ${g.addW}px figure`).join(', ')
                  : geo.map(g => `${g.w}:${g.onPlayer}px`).join(' '));
/* MEASURED, NOT ASSERTED: overlap with the BOSS. It is ~100% at every width by
   construction, because the add is a child of .fighterG.foe-side and #foeStage
   fills that column, and sitting in front of his hem is the intended depth that
   every other den add uses. A rule against it cannot pass without moving the add
   onto the player or off the stage. Worth knowing which way a break goes: BOTH
   ways of misplacing the add REDUCE these numbers toward zero, because it leaves
   the arena, so an "overlap under 25%" rule would go green on the bug and red on
   the shipped layout. The numbers are printed so nobody has to re-derive them. */
console.log(`      two-enemy geometry: ${geo.filter(g => !g.why).map(g => `${g.w}px add ${g.addW}w onBoss ${g.onBoss}px onPlayer ${g.onPlayer}px ${g.nearerFoe ? 'nearer-boss' : 'NEARER-PLAYER'}`).join(' | ')}`)

/* A dead enemy must go down THE MOMENT its bar empties, not when the fight ends,
   and the survivor must announce itself.
   Reopen a fight first: the width loop above closes every sheet, and without this
   the next line dereferenced a null #foeStage and killed the whole suite. The gate
   reported that as a blank blocker until it learned to print a crash. */
await page.evaluate(async () => { await window.__denFight(1.4, 0.5, { mage: true, name: 'The Live Wire' }); });
await sleep(2300); await settle(page, 350);
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
