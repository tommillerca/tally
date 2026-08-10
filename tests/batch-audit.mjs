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

/* ---- 4: Cam's lightning is the subject of every cast ---------------------- */
/* "You also haven't included any of the lightning bolts etc that were attached
   in the artwork I gave you... that's why cam included them." mage-fx.png sat on
   disk unreferenced while wraith-fx.js drew its own light from scratch. */
/* 3.2x, not 1.4x: at a seeded level 30 the player kills him in two swings and he
   never casts anything, so a check driven at the lower multiplier reports "no
   cast reached the screen" about a perfectly working dispatch. */
await page.evaluate(async () => { await window.__denFight(3.2, 0.5, { mage: true, name: 'The Live Wire' }); });
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

const castNames = Object.keys(casts);
ok('every one of his casts exists', castNames.length >= 4, castNames.join(', '));
const noArt = castNames.filter(n => casts[n].total === 0);
ok("every cast draws Cam's own art", noArt.length === 0, noArt.length ? `no sprite: ${noArt.join(', ')}` : castNames.map(n => `${n}:${casts[n].total}`).join(' '));
const offStage = castNames.filter(n => casts[n].onStage < casts[n].total);
ok('and all of it is actually inside the arena', offStage.length === 0,
  offStage.length ? offStage.map(n => `${n} ${casts[n].onStage}/${casts[n].total} on stage`).join(', ') : 'nothing clipped off the edge');

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
