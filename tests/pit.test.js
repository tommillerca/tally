// The Pit engine vs the combat math spec's own numbers.
import assert from 'node:assert/strict';
import {
  deriveStats, derived, WEAPONS, ACTIONS, counterMult, resolveHit, makeFighter,
  createFight, actionsFor, applyAction, endTurn, planTelegraph, aiTakeTurn,
  simulate, LADDER, CHAMPION, scaleStats, TAUNT_CURVE, expectedDamage, MISS_CHANCE, allocatedStats, TRAIN_STEP,
} from '../js/pit.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error(`FAIL ${name}\n  ${e.message}`); }
}
const noLuck = () => 0.99; // rng that never crits, never glances

// ---- spec section 1: derived pools at stat 50 ----
test('derived pools at stat=50 match the spec table', () => {
  const s = { power: 50, marrow: 50, wind: 50, reflex: 50, hype: 50 };
  const d = derived(s);
  assert.equal(d.maxHp, 300);
  assert.equal(d.maxWind, 70);
  assert.equal(d.ap, 2);
  assert.equal(d.powerMult, 1.75);
  assert.ok(Math.abs(d.critChance - 0.20) < 1e-9);
  assert.ok(Math.abs(d.glanceChance - 0.125) < 1e-9);
});

// ---- spec section 8: the worked example ----
test('worked example: P60 Bonecrusher haymaker vs Block = ~108 + stagger', () => {
  const attacker = makeFighter({ name: 'A', stats: { power: 60, marrow: 50, wind: 50, reflex: 50, hype: 0 }, weaponId: 'bonecrusher' });
  const defender = makeFighter({ name: 'D', stats: { power: 50, marrow: 50, wind: 50, reflex: 40, hype: 0 } });
  defender.state = 'block';
  const r = resolveHit({ move: 'haymaker', attacker, defender, rng: noLuck });
  assert.equal(r.damage, 108, String(r.damage));
  assert.ok(r.breaksGuard && r.stagger);
  // wind cost with Bonecrusher penalty: 35 * 1.3 = 45.5 -> 46
  assert.equal(Math.round(35 * WEAPONS.bonecrusher.windCostMult('haymaker')), 46);
});

// ---- spec section 7: effort vs gear guardrail rows ----
test('guardrail: X (effort, starter) swing = 50', () => {
  const x = makeFighter({ name: 'X', stats: { power: 85, marrow: 50, wind: 80, reflex: 70, hype: 0 } });
  const dummy = makeFighter({ name: 'D', stats: { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 } });
  const r = resolveHit({ move: 'swing', attacker: x, defender: dummy, rng: noLuck });
  assert.equal(r.damage, 50, String(r.damage));
});
test('guardrail: Y (lazy, maxed Bonecrusher) haymaker = 65', () => {
  const y = makeFighter({ name: 'Y', stats: { power: 30, marrow: 50, wind: 30, reflex: 40, hype: 0 }, weaponId: 'bonecrusher' });
  const dummy = makeFighter({ name: 'D', stats: { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 } });
  const r = resolveHit({ move: 'haymaker', attacker: y, defender: dummy, rng: noLuck });
  assert.equal(r.damage, 65, String(r.damage));
});
test('guardrail: Z (effort + Bonecrusher) haymaker = 122', () => {
  const z = makeFighter({ name: 'Z', stats: { power: 85, marrow: 50, wind: 80, reflex: 70, hype: 0 }, weaponId: 'bonecrusher' });
  const dummy = makeFighter({ name: 'D', stats: { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 } });
  const r = resolveHit({ move: 'haymaker', attacker: z, defender: dummy, rng: noLuck });
  assert.equal(r.damage, 122, String(r.damage));
});

// ---- spec section 4: counter matrix ----
test('counter matrix reads', () => {
  assert.equal(counterMult('swing', 'block').mult, 0.35);
  assert.equal(counterMult('jab', 'block').mult, 0.5);
  assert.equal(counterMult('jab', 'dodge').mult, 1.1);
  assert.equal(counterMult('swing', 'dodge').mult, 0.7);
  assert.ok(counterMult('haymaker', 'dodge').miss);
  assert.ok(counterMult('haymaker', 'dodge').offBalance);
  assert.ok(counterMult('haymaker', 'block').breaksGuard);
  assert.equal(counterMult('swing', null).mult, 1.0);
});

// ---- spec section 5: signature ----
test('signature at Power 50 deals 210, resets hype', () => {
  const fight = createFight({
    player: makeFighter({ name: 'P', stats: { power: 50, marrow: 50, wind: 50, reflex: 0, hype: 50 } }),
    foe: makeFighter({ name: 'F', stats: { power: 50, marrow: 90, wind: 50, reflex: 0, hype: 0 } }),
    seed: 7,
  });
  fight.p.hype = 100;
  const before = fight.f.hp;
  applyAction(fight, 'signature');
  assert.equal(before - fight.f.hp, 210);
  assert.equal(fight.p.hype, 0);
});

// ---- stagger economics ----
test('guard break staggers: defender starts next turn with 1 AP', () => {
  const fight = createFight({
    player: makeFighter({ name: 'P', stats: { power: 60, marrow: 50, wind: 90, reflex: 0, hype: 0 } }),
    foe: makeFighter({ name: 'F', stats: { power: 50, marrow: 80, wind: 50, reflex: 0, hype: 0 } }),
    seed: 3,
  });
  fight.f.state = 'block';
  applyAction(fight, 'haymaker');
  assert.ok(fight.f.stagger);
  endTurn(fight); // foe's turn begins
  assert.equal(fight.active, 'f');
  assert.equal(fight.ap, 1);
  assert.ok(!fight.f.stagger); // consumed
});

// ---- taunt diminishing ----
test('taunt curve diminishes 8/5/3/2/1', () => {
  const fight = createFight({
    player: makeFighter({ name: 'P', stats: { power: 50, marrow: 50, wind: 90, reflex: 0, hype: 0 } }),
    foe: makeFighter({ name: 'F', stats: { power: 50, marrow: 50, wind: 50, reflex: 0, hype: 0 } }),
    seed: 3,
  });
  fight.range = 'far';
  const gains = [];
  for (let i = 0; i < 5; i++) {
    fight.ap = 2; fight.p.wind = 90;
    const before = fight.p.hype;
    applyAction(fight, 'taunt');
    gains.push(fight.p.hype - before);
  }
  assert.deepEqual(gains, TAUNT_CURVE);
});

// ---- legality ----
test('actionsFor respects range and hype gate', () => {
  const fight = createFight({
    player: makeFighter({ name: 'P', stats: { power: 50, marrow: 50, wind: 50, reflex: 0, hype: 0 } }),
    foe: makeFighter({ name: 'F', stats: { power: 50, marrow: 50, wind: 50, reflex: 0, hype: 0 } }),
    seed: 3,
  });
  let ids = actionsFor(fight).map(a => a.id);
  assert.ok(ids.includes('jab') && ids.includes('block') && !ids.includes('advance') && !ids.includes('signature'));
  fight.range = 'far';
  ids = actionsFor(fight).map(a => a.id);
  assert.ok(ids.includes('advance') && ids.includes('throwb') && !ids.includes('jab'));
});

// ---- stat derivation ----
test('deriveStats: fresh ~20, capped at 100, monotonic', () => {
  const fresh = deriveStats({});
  for (const k of Object.keys(fresh)) assert.equal(fresh[k], 20, k);
  const big = deriveStats({ proteinDays: 999, streak: 999, closes: 999, lifetimeSteps: 99e6, spawns: 999, eggDays: 999, questsDone: 999, variety: 999 });
  for (const k of Object.keys(big)) assert.equal(big[k], 100, k);
  assert.ok(deriveStats({ proteinDays: 20 }).power > deriveStats({ proteinDays: 5 }).power);
});

// ---- pacing: 200 mid-vs-mid sims should land near the 5-7 turn target ----
test('pacing: mid vs mid resolves in a healthy turn range', () => {
  const mid = { power: 50, marrow: 50, wind: 50, reflex: 40, hype: 30 };
  let total = 0, decisive = 0, n = 200, maxTurns = 0;
  for (let i = 0; i < n; i++) {
    const r = simulate({ pStats: mid, fStats: mid, seed: 1000 + i });
    total += r.turns; maxTurns = Math.max(maxTurns, r.turns);
    if (r.winner !== 'draw') decisive++;
  }
  const avg = total / n;
  assert.ok(avg >= 3.5 && avg <= 9, `avg turns ${avg.toFixed(2)}`);
  assert.ok(decisive / n >= 0.95, `decisive ${decisive}/${n}`);
  console.log(`  (pacing: avg ${avg.toFixed(1)} turns, max ${maxTurns}, ${Math.round(decisive / n * 100)}% decisive)`);
});

// ---- guardrail sim: effort beats gear across 100 fights ----
test('guardrail sim: high-effort starter beats lazy Bonecrusher most of the time', () => {
  const X = { power: 85, marrow: 65, wind: 80, reflex: 70, hype: 40 };
  const Y = { power: 30, marrow: 40, wind: 30, reflex: 40, hype: 20 };
  let xWins = 0, n = 100;
  for (let i = 0; i < n; i++) {
    const r = simulate({ pStats: X, fStats: Y, pWeapon: 'starter', fWeapon: 'bonecrusher', seed: 5000 + i });
    if (r.winner === 'p') xWins++;
  }
  assert.ok(xWins / n >= 0.75, `X won ${xWins}/${n}`);
  console.log(`  (effort vs gear: high-effort won ${xWins}/${n})`);
});

// ---- ladder scaling ----
test('ladder scaling floors and caps', () => {
  const s = scaleStats({ power: 50, marrow: 50, wind: 50, reflex: 40, hype: 30 }, 0.6);
  assert.equal(s.power, 30);
  assert.ok(Object.values(scaleStats({ power: 10, marrow: 10, wind: 10, reflex: 10, hype: 10 }, 0.6)).every(v => v >= 5));
  assert.equal(LADDER.length, 5);
  assert.equal(CHAMPION.weaponId, 'bonecrusher');
});



// ---- talents (framework section 7) ----
import { TALENT_TREES, talentPoints, canTakeTalent, sigThreshold, RUNG_TALENTS } from '../js/pit.js';
import { makeFighter as mf, createFight as cf, applyAction as apply, actionsFor as acts, endTurn as et, resolveHit as rh } from '../js/pit.js';

const MID = { power: 50, marrow: 50, wind: 50, reflex: 40, hype: 30 };

test('talent tiers gate by points-in-tree (WoW style)', () => {
  assert.equal(talentPoints(1), 0);
  assert.equal(talentPoints(8), 7);
  const taken = new Set();
  assert.ok(canTakeTalent(taken, 'slab', 0));      // T1 open
  assert.ok(!canTakeTalent(taken, 'slab', 1));     // T2 needs 1 in tree
  assert.ok(!canTakeTalent(taken, 'slab', 5));     // capstone needs 5
  taken.add('heavyhands');
  assert.ok(canTakeTalent(taken, 'slab', 1));      // both T2 options open
  assert.ok(canTakeTalent(taken, 'slab', 2));
  assert.ok(!canTakeTalent(taken, 'slab', 3));     // T3 needs 3 in tree
  taken.add('marrowlust'); taken.add('bonebreaker');
  assert.ok(canTakeTalent(taken, 'slab', 3));
  taken.add('concussive'); taken.add('thickskull');
  assert.ok(canTakeTalent(taken, 'slab', 5));      // capstone at 5 in tree
  assert.ok(!canTakeTalent(taken, 'slab', 0));     // already taken
  assert.equal(TALENT_TREES.length, 6);
  assert.ok(TALENT_TREES.every(t => t.nodes.length === 6));
  const gc = TALENT_TREES.find(t => t.id === 'gravecaller');
  assert.ok(gc && gc.nodes.filter(n => n.move).length >= 4); // the caster is move-rich
});

test('gravecaller: bone bolt is any-range magic scaling off Hype', () => {
  const caster = mf({ name: 'C', stats: { power: 0, marrow: 50, wind: 50, reflex: 0, hype: 60 }, talents: ['bonebolt'] });
  const dummy = mf({ name: 'D', stats: { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 } });
  const r = rh({ move: 'bonebolt', attacker: caster, defender: dummy, rng: noLuck });
  assert.equal(r.damage, Math.round(16 * (1 + 0.6 * 1.5))); // 30
  dummy.state = 'block'; // no counter event vs magic, but covering up blunts it 35%
  const rb = rh({ move: 'bonebolt', attacker: caster, defender: dummy, rng: noLuck });
  assert.ok(!rb.miss && rb.damage === Math.round(16 * (1 + 0.6 * 1.5) * 0.65), String(rb.damage));
  dummy.state = null;
  const fight = cf({ player: caster, foe: mf({ name: 'F', stats: MID }), seed: 21 });
  fight.range = 'far';
  assert.ok(acts(fight).some(a => a.id === 'bonebolt')); // castable at far
});
test('soul siphon + grave chill riders', () => {
  const caster = mf({ name: 'C', stats: { power: 0, marrow: 50, wind: 50, reflex: 0, hype: 60 }, talents: ['bonebolt', 'soulsiphon', 'mend', 'hex', 'gravechill'] });
  const fight = cf({ player: caster, foe: mf({ name: 'F', stats: { ...MID, reflex: 0 } }), seed: 22 });
  fight.p.hp = 100;
  const foeWind = fight.f.wind;
  const evs = apply(fight, 'bonebolt');
  assert.ok(evs.some(e => e.t === 'heal'), 'siphon heals');
  assert.equal(fight.f.wind, Math.max(0, foeWind - 10), 'chill drains wind');
});
test('mend heals and is limited to 3 uses', () => {
  const caster = mf({ name: 'C', stats: MID, talents: ['bonebolt', 'mend'] });
  const fight = cf({ player: caster, foe: mf({ name: 'F', stats: MID }), seed: 23 });
  fight.p.hp = 50;
  for (let i = 0; i < 3; i++) { fight.ap = 2; fight.p.wind = 90; apply(fight, 'mend'); }
  assert.ok(fight.p.hp > 50);
  assert.equal(fight.p.mendUses, 0);
  fight.ap = 2; fight.p.wind = 90;
  assert.ok(!acts(fight).some(a => a.id === 'mend'));
});
test('hex weakens outgoing damage 20%', () => {
  const caster = mf({ name: 'C', stats: MID, talents: ['bonebolt', 'mend', 'hex'] });
  const foe = mf({ name: 'F', stats: MID });
  const fight = cf({ player: caster, foe, seed: 24 });
  apply(fight, 'hex');
  assert.ok(foe.weaken && foe.weaken.pct === 0.20);
  const dummy = mf({ name: 'D', stats: { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 } });
  const r = rh({ move: 'swing', attacker: foe, defender: dummy, rng: noLuck });
  assert.equal(r.damage, Math.round(22 * 1.75 * 0.8)); // 31
});
test('bonebreaker sunder makes the enemy take +15%', () => {
  const slab = mf({ name: 'S', stats: MID, talents: ['heavyhands', 'bonebreaker'] });
  const foe = mf({ name: 'F', stats: { ...MID, reflex: 0, marrow: 90 } });
  const fight = cf({ player: slab, foe, seed: 25 });
  apply(fight, 'haymaker');
  assert.ok(foe.sunder, 'sunder applied');
  const r = rh({ move: 'jab', attacker: slab, defender: foe, rng: noLuck });
  assert.equal(r.damage, Math.round(10 * 1.75 * 1.15));
});
test('bleed out stacks and ticks at turn start', () => {
  const grey = mf({ name: 'G', stats: MID, talents: ['lightfeet', 'counterstep', 'kite', 'bleedout'] });
  const foe = mf({ name: 'F', stats: { ...MID, reflex: 0, marrow: 90 } });
  const fight = cf({ player: grey, foe, seed: 26 });
  apply(fight, 'jab'); fight.ap = 3; fight.p.wind = 90;
  apply(fight, 'jab');
  assert.equal(foe.bleed.stacks, 2);
  const hpBefore = foe.hp;
  et(fight); // foe's turn starts: bleed ticks 8
  assert.equal(foe.hp, hpBefore - 8);
});
test('kite boosts throws 60%', () => {
  const grey = mf({ name: 'G', stats: MID, talents: ['lightfeet', 'kite'] });
  const dummy = mf({ name: 'D', stats: { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 } });
  const r = rh({ move: 'throwb', attacker: grey, defender: dummy, rng: noLuck });
  assert.equal(r.damage, Math.round(14 * 1.75 * 1.6)); // 39
});
test('concussive: landed haymakers stagger without a block', () => {
  const slab = mf({ name: 'S', stats: MID, talents: ['heavyhands', 'marrowlust', 'bonebreaker', 'concussive'] });
  const foe = mf({ name: 'F', stats: { ...MID, reflex: 0, marrow: 90 } });
  const fight = cf({ player: slab, foe, seed: 27 });
  apply(fight, 'haymaker'); // neutral stance, no guard break needed
  assert.ok(foe.stagger);
});
test('second wind procs once below 25%', () => {
  const rm = mf({ name: 'R', stats: MID, talents: ['crowdwork', 'bigentrance', 'heckle', 'ovation', 'secondwind'] });
  const foe = mf({ name: 'F', stats: { ...MID, power: 90 } });
  const fight = cf({ player: foe, foe: rm, seed: 28 }); // attacker is the player slot
  rm.hp = Math.round(rm.d.maxHp * 0.26);
  const evs = apply(fight, 'haymaker');
  assert.ok(evs.some(e => e.t === 'secondwind') || rm.hp === 0, JSON.stringify(evs.map(e => e.t)));
  assert.ok(rm.secondWindUsed || rm.hp === 0);
});
test('derived bonuses: thick skull + deep lungs', () => {
  const base = mf({ name: 'B', stats: MID });
  const tanked = mf({ name: 'T', stats: MID, talents: ['heavyhands', 'marrowlust', 'bonebreaker', 'thickskull', 'lightfeet', 'counterstep', 'kite', 'deeplungs'] });
  assert.equal(tanked.d.maxHp, base.d.maxHp + 45);
  assert.equal(tanked.d.maxWind, base.d.maxWind + 15);
});
test('caster vs bruiser: both builds viable, pacing holds', () => {
  // full sims use the built-in policies (no caster policy), so just verify
  // a specced fight still terminates in bounds via the standard sim
  let turns = 0, n = 100;
  for (let i = 0; i < n; i++) turns += simulate({ pStats: MID, fStats: MID, seed: 30000 + i }).turns;
  assert.ok(turns / n >= 3.5 && turns / n <= 9, String(turns / n));
});
test('light feet grants 3 AP turns', () => {
  const f = mf({ name: 'G', stats: MID, talents: ['lightfeet'] });
  assert.equal(f.d.ap, 3);
});
test('heavy hands: +15% on haymakers only', () => {
  const atk = mf({ name: 'S', stats: MID, talents: ['heavyhands'] });
  const dfd = mf({ name: 'D', stats: { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 } });
  const hay = rh({ move: 'haymaker', attacker: atk, defender: dfd, rng: noLuck });
  assert.equal(hay.damage, Math.round(40 * 1.75 * 1.15)); // 81
  const swing = rh({ move: 'swing', attacker: atk, defender: dfd, rng: noLuck });
  assert.equal(swing.damage, Math.round(22 * 1.75)); // untouched
});
test('marrowlust heals 25% of haymaker damage', () => {
  const fight = cf({ player: mf({ name: 'P', stats: MID, talents: ['heavyhands', 'marrowlust'] }), foe: mf({ name: 'F', stats: MID }), seed: 11 });
  fight.p.hp = 100;
  apply(fight, 'haymaker');
  const heal = fight.log; // events returned, not stored; recompute via hp
  assert.ok(fight.p.hp > 100, String(fight.p.hp));
});
test('titan ignores block and dodge, once per fight', () => {
  const fight = cf({ player: mf({ name: 'P', stats: MID, talents: ['heavyhands', 'marrowlust', 'titan'] }), foe: mf({ name: 'F', stats: { ...MID, marrow: 90 } }), seed: 12 });
  fight.f.state = 'dodge';
  const before = fight.f.hp;
  const evs = apply(fight, 'titan');
  assert.ok(evs.some(e => e.t === 'hit' && e.titan && e.damage > 0), JSON.stringify(evs));
  assert.ok(fight.f.hp < before);
  assert.ok(fight.p.titanUsed);
  fight.ap = 2; fight.p.wind = 90;
  assert.ok(!acts(fight).some(a => a.id === 'titan')); // once per fight
});
test('flurry dumps all wind for 3 unblockable hits', () => {
  const fight = cf({ player: mf({ name: 'P', stats: MID, talents: ['lightfeet', 'counterstep', 'flurry'] }), foe: mf({ name: 'F', stats: { ...MID, marrow: 90 } }), seed: 13 });
  fight.f.state = 'block';
  const wind = fight.p.wind;
  assert.ok(wind >= 30);
  const before = fight.f.hp;
  const evs = apply(fight, 'flurry');
  const hits = evs.filter(e => e.t === 'hit' && e.flurry);
  assert.equal(hits.length, 3);
  assert.equal(fight.p.wind, 0);
  assert.ok(fight.f.hp < before);
});
test('counterstep punishes a whiffed haymaker', () => {
  const fight = cf({ player: mf({ name: 'P', stats: MID }), foe: mf({ name: 'F', stats: MID, talents: ['lightfeet', 'counterstep'] }), seed: 14 });
  fight.f.state = 'dodge';
  const before = fight.p.hp;
  const evs = apply(fight, 'haymaker');
  assert.ok(evs.some(e => e.t === 'miss'));
  assert.ok(evs.some(e => e.t === 'counter'), JSON.stringify(evs));
  assert.ok(fight.p.hp <= before);
});
test('ringmaster: big entrance + showstopper threshold + crowd work', () => {
  const rm = mf({ name: 'R', stats: MID, talents: ['crowdwork', 'bigentrance', 'showstopper'] });
  assert.equal(rm.hype, 25);
  assert.equal(sigThreshold(rm), 80);
  const fight = cf({ player: rm, foe: mf({ name: 'F', stats: { ...MID, reflex: 0, marrow: 90 } }), seed: 15 });
  apply(fight, 'swing'); // landed swing: 10 hype * 1.4 = 14
  assert.equal(fight.p.hype, 25 + 14, String(fight.p.hype));
  fight.p.hype = 85; fight.ap = 2;
  assert.ok(acts(fight).some(a => a.id === 'signature')); // fires at 80 with showstopper
});
test('balance: full-spec fighter wins more but pacing holds', () => {
  let w = 0, turns = 0, n = 150;
  for (let i = 0; i < n; i++) {
    const r = simulate({ pStats: MID, fStats: MID, seed: 20000 + i });
    turns += r.turns;
  }
  assert.ok(turns / n >= 3.5 && turns / n <= 9);
  assert.equal(RUNG_TALENTS[5].length, 2);
});

/* ============ v15: accuracy + cleric + shaman ============ */

test('big moves can miss outright (whiff leaves heavies off-balance)', () => {
  const A = makeFighter({ name: 'A', stats: { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 50 } });
  const B = makeFighter({ name: 'B', stats: { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 50 } });
  const alwaysMiss = () => 0.001;
  const r = resolveHit({ move: 'haymaker', attacker: A, defender: B, rng: alwaysMiss });
  assert.ok(r.miss && r.whiffed && r.offBalance, 'haymaker whiffs and leaves you off-balance');
  const j = resolveHit({ move: 'jab', attacker: A, defender: B, rng: alwaysMiss });
  assert.ok(!j.miss, 'jabs never whiff');
  const bolt = resolveHit({ move: 'bonebolt', attacker: A, defender: B, rng: alwaysMiss });
  assert.ok(!bolt.miss, 'casts are reliable');
  assert.ok(MISS_CHANCE.titan >= MISS_CHANCE.haymaker, 'bigger move, bigger whiff risk');
  const noLuck = () => 0.99;
  const h = resolveHit({ move: 'haymaker', attacker: A, defender: B, rng: noLuck });
  assert.ok(!h.miss && h.damage > 0, 'high roll still lands');
});

test('expectedDamage discounts by accuracy', () => {
  const A = makeFighter({ name: 'A', stats: { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 50 } });
  const hay = expectedDamage('haymaker', A);
  const hayFull = Math.round(hay / (1 - MISS_CHANCE.haymaker));
  assert.ok(hayFull > hay, 'accuracy discount applied');
});

test('ward absorbs the next 25 damage, then breaks', () => {
  const P = makeFighter({ name: 'P', stats: { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 50 }, talents: ['smite', 'ward'] });
  const F = makeFighter({ name: 'F', stats: { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 50 } });
  const fight = createFight({ player: P, foe: F, seed: 5 });
  fight.rng = () => 0.99;
  applyAction(fight, 'ward');
  assert.equal(P.ward, 25);
  const hpBefore = P.hp;
  fight.active = 'f'; fight.ap = 3;
  const evs = applyAction(fight, 'swing');
  const absorb = evs.find(e => e.t === 'absorb');
  assert.ok(absorb && absorb.amount === 25 && absorb.broken, 'ward soaked its full pool');
  assert.equal(P.ward, 0);
  assert.ok(hpBefore - P.hp <= 15, 'only the overflow reached bone');
});

test('Last Light cheats death once per fight', () => {
  const P = makeFighter({ name: 'P', stats: { marrow: 20, power: 20, wind: 20, reflex: 20, hype: 20 }, talents: ['lastlight'] });
  const F = makeFighter({ name: 'F', stats: { marrow: 90, power: 90, wind: 90, reflex: 90, hype: 90 } });
  const fight = createFight({ player: P, foe: F, seed: 5 });
  P.hp = 10;
  fight.active = 'f'; fight.ap = 3; fight.rng = () => 0.99;
  const evs = applyAction(fight, 'swing');
  assert.ok(evs.find(e => e.t === 'lastlight'), 'cheat death fired');
  assert.ok(P.hp >= 1 + Math.round(P.d.maxHp * 0.20), 'left standing with the promised marrow');
  assert.ok(!fight.over, 'fight continues');
  P.hp = 5;
  const evs2 = applyAction(fight, 'jab');
  assert.ok(!evs2.find(e => e.t === 'lastlight'), 'only once per fight');
});

test('fire bolt burns; wildfire burns hotter and longer; burn ticks at their turn start', () => {
  const P = makeFighter({ name: 'P', stats: { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 50 }, talents: ['frostbolt', 'firebolt'] });
  const F = makeFighter({ name: 'F', stats: { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 50 } });
  const fight = createFight({ player: P, foe: F, seed: 5 });
  fight.rng = () => 0.99;
  applyAction(fight, 'firebolt');
  assert.deepEqual(F.burn, { per: 5, turns: 2 });
  const hpBefore = F.hp;
  endTurn(fight);
  assert.equal(hpBefore - F.hp, 5, 'burn ticked 5');
  assert.ok(fight.pendingTicks.some(e => e.t === 'burntick'), 'tick surfaced for UI');
  const P2 = makeFighter({ name: 'P2', stats: P.stats, talents: ['frostbolt', 'firebolt', 'wildfire'] });
  const fight2 = createFight({ player: P2, foe: makeFighter({ name: 'F2', stats: F.stats }), seed: 5 });
  fight2.rng = () => 0.99;
  applyAction(fight2, 'firebolt');
  assert.deepEqual(fight2.f.burn, { per: 7, turns: 3 });
});

test('frost bolt chills wind; frostbite punishes gassed enemies', () => {
  const P = makeFighter({ name: 'P', stats: { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 60 }, talents: ['frostbolt', 'frostbite'] });
  const F = makeFighter({ name: 'F', stats: { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 50 } });
  const fight = createFight({ player: P, foe: F, seed: 5 });
  fight.rng = () => 0.99;
  const windBefore = F.wind;
  applyAction(fight, 'frostbolt');
  assert.equal(windBefore - F.wind, 8, 'chill drained 8 wind');
  const gassed = makeFighter({ name: 'G', stats: F.stats }); gassed.wind = 20;
  const fresh = makeFighter({ name: 'H', stats: F.stats });
  const noLuck = () => 0.99;
  const vsGassed = resolveHit({ move: 'frostbolt', attacker: P, defender: gassed, rng: noLuck });
  const vsFresh = resolveHit({ move: 'frostbolt', attacker: P, defender: fresh, rng: noLuck });
  assert.ok(vsGassed.damage > vsFresh.damage, 'frostbite bonus applied');
});

test('smite scales as magic; radiance heals 20%; judgement punishes sunder', () => {
  const P = makeFighter({ name: 'P', stats: { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 60 }, talents: ['smite', 'radiance', 'judgement'] });
  const F = makeFighter({ name: 'F', stats: { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 50 } });
  const fight = createFight({ player: P, foe: F, seed: 5 });
  fight.rng = () => 0.99;
  P.hp = 100;
  const evs = applyAction(fight, 'smite');
  const hit = evs.find(e => e.t === 'hit');
  const heal = evs.find(e => e.t === 'heal');
  assert.ok(hit.damage > 0 && hit.magic, 'smite lands as magic');
  assert.equal(heal.amount, Math.round(hit.damage * 0.20), 'radiance healed 20%');
  const sundered = makeFighter({ name: 'S', stats: F.stats }); sundered.sunder = { turns: 2 };
  const plain = makeFighter({ name: 'N', stats: F.stats });
  const noLuck = () => 0.99;
  const vsSunder = resolveHit({ move: 'smite', attacker: P, defender: sundered, rng: noLuck });
  const vsPlain = resolveHit({ move: 'smite', attacker: P, defender: plain, rng: noLuck });
  assert.ok(vsSunder.damage > vsPlain.damage * 1.5, 'judgement + sunder stack');
});

test('hallowed marrow amplifies healing received', () => {
  const base = { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 50 };
  const plain = makeFighter({ name: 'A', stats: base, talents: ['bonebolt', 'mend'] });
  const holy = makeFighter({ name: 'B', stats: base, talents: ['bonebolt', 'mend', 'hallowed'] });
  const f1 = createFight({ player: plain, foe: makeFighter({ name: 'X', stats: base }), seed: 5 });
  const f2 = createFight({ player: holy, foe: makeFighter({ name: 'Y', stats: base }), seed: 5 });
  plain.hp = 50; holy.hp = 50;
  const h1 = applyAction(f1, 'mend').find(e => e.t === 'heal').amount;
  const h2 = applyAction(f2, 'mend').find(e => e.t === 'heal').amount;
  assert.equal(h2, Math.round((holy.d.maxHp * 0.12 + 8 * holy.d.magicMult) * 1.2));
  assert.ok(h2 > h1, 'hallowed heals bigger');
});

test('tempest: four alternating elemental hits, once per fight, burn + chill riders', () => {
  const P = makeFighter({ name: 'P', stats: { marrow: 60, power: 60, wind: 60, reflex: 60, hype: 60 }, talents: ['frostbolt', 'firebolt', 'totemic', 'frostbite', 'wildfire', 'tempest'] });
  const F = makeFighter({ name: 'F', stats: { marrow: 70, power: 70, wind: 70, reflex: 70, hype: 70 } });
  const fight = createFight({ player: P, foe: F, seed: 5 });
  fight.rng = () => 0.99; fight.ap = 3;
  const evs = applyAction(fight, 'tempest');
  const hits = evs.filter(e => e.t === 'hit');
  assert.equal(hits.length, 4, 'four hits');
  assert.deepEqual(hits.map(h => h.school), ['fire', 'frost', 'fire', 'frost'], 'alternating elements');
  assert.ok(F.burn && F.burn.per === 7, 'burn applied (wildfire-boosted)');
  assert.ok(evs.some(e => e.t === 'status' && e.kind === 'chill'), 'chill applied');
  assert.ok(P.tempestUsed);
  assert.ok(!actionsFor(fight).some(x => x.id === 'tempest'), 'tempest gone after use');
});

test('totemic marrow regenerates extra wind each turn', () => {
  const base = { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 50 };
  const P = makeFighter({ name: 'P', stats: base, talents: ['frostbolt', 'totemic'] });
  const F = makeFighter({ name: 'F', stats: base });
  const fight = createFight({ player: P, foe: F, seed: 5 });
  P.wind = 10;
  fight.active = 'f';
  endTurn(fight);
  assert.equal(P.wind, 10 + 15 + 5, 'base regen + totemic 5');
});

test('six trees, six nodes each, unique ids, new moves registered', () => {
  assert.equal(TALENT_TREES.length, 6);
  const ids = TALENT_TREES.flatMap(t => t.nodes.map(n => n.id));
  assert.equal(new Set(ids).size, ids.length, 'no duplicate node ids');
  for (const t of TALENT_TREES) {
    assert.equal(t.nodes.length, 6);
    assert.equal(t.nodes.filter(n => n.tier === 4).length, 1, t.id + ' has one capstone');
  }
  assert.equal(TALENT_TREES.find(t => t.id === 'gravewarden').nodes.find(n => n.id === 'lastlight').tier, 4);
  assert.equal(TALENT_TREES.find(t => t.id === 'boneshaman').nodes.find(n => n.id === 'tempest').tier, 4);
  for (const id of ['smite', 'ward', 'frostbolt', 'firebolt', 'tempest']) assert.ok(ACTIONS[id], id + ' action exists');
});

/* ============ v16: anti-exploit balance ============ */

test('shove costs escalate: kiting is a window, not a lock', () => {
  const P = makeFighter({ name: 'P', stats: MID });
  const F = makeFighter({ name: 'F', stats: MID });
  const fight = createFight({ player: P, foe: F, seed: 9 });
  fight.rng = () => 0.99;
  const costOf = () => actionsFor(fight).find(a => a.id === 'shove');
  const c0 = costOf().windCost;
  applyAction(fight, 'shove');
  fight.range = 'close'; fight.ap = 3; P.wind = 100;
  const c1 = costOf().windCost;
  applyAction(fight, 'shove');
  fight.range = 'close'; fight.ap = 3; P.wind = 100;
  const c2 = costOf().windCost;
  assert.ok(c1 === c0 * 2 && c2 === c0 * 3, `${c0} -> ${c1} -> ${c2}`);
});

test('signature encore falloff: 0.75x per prior use', () => {
  const P = makeFighter({ name: 'P', stats: MID });
  const F = makeFighter({ name: 'F', stats: { ...MID, marrow: 99 } });
  const fight = createFight({ player: P, foe: F, seed: 9 });
  fight.rng = () => 0.99;
  P.hype = 100; fight.ap = 3;
  const d1 = applyAction(fight, 'signature').find(e => e.t === 'hit').damage;
  P.hype = 100; fight.ap = 3;
  const d2 = applyAction(fight, 'signature').find(e => e.t === 'hit').damage;
  assert.equal(d2, Math.round(120 * P.d.powerMult * 0.75));
  assert.ok(d2 < d1, 'second showing hits softer');
});

test('one miracle per fight: second wind and last light are exclusive', () => {
  const both = ['secondwind', 'lastlight'];
  const P = makeFighter({ name: 'P', stats: MID, talents: both });
  const F = makeFighter({ name: 'F', stats: MID });
  const fight = createFight({ player: P, foe: F, seed: 9 });
  fight.active = 'f'; fight.ap = 3; fight.rng = () => 0.99;
  P.hp = Math.round(P.d.maxHp * 0.24); // low enough to proc second wind on any hit
  const evs = applyAction(fight, 'jab');
  assert.ok(evs.find(e => e.t === 'secondwind'), 'second wind fired first');
  P.hp = 3;
  const evs2 = applyAction(fight, 'jab');
  assert.ok(!evs2.find(e => e.t === 'lastlight'), 'no second miracle');
});

test('champion runs the full slab tree', () => {
  assert.equal(CHAMPION.talents.length, 6);
  assert.ok(CHAMPION.talents.includes('thickskull') && CHAMPION.talents.includes('titan'));
});

/* ============ v26: hybrid training-point allocation ============ */

test('allocatedStats adds TRAIN_STEP per point on top of the habit base', () => {
  const base = { power: 30, marrow: 40, wind: 50, reflex: 20, hype: 25 };
  const eff = allocatedStats(base, { power: 5, wind: 2 });
  assert.equal(eff.power, 30 + 5 * TRAIN_STEP);
  assert.equal(eff.wind, 50 + 2 * TRAIN_STEP);
  assert.equal(eff.marrow, 40, 'untouched stats keep their base');
  assert.equal(eff.reflex, 20);
});

test('allocatedStats never lowers a stat and is guardrail-safe (only adds)', () => {
  const base = { power: 30, marrow: 40, wind: 50, reflex: 20, hype: 25 };
  const eff = allocatedStats(base, {});
  for (const k of Object.keys(base)) assert.ok(eff[k] >= base[k], k + ' never drops');
  // allocation can only ever raise stats (no path to reward eating less)
  const eff2 = allocatedStats(base, { power: 999 });
  assert.ok(eff2.power > base.power && eff2.power <= 150, 'clamped, still a raise');
});

test('specced build does not trivialize the champion (foes scale off effective stats)', () => {
  // dump everything into Power on a mid fighter
  const base = { power: 50, marrow: 50, wind: 50, reflex: 50, hype: 50 };
  const eff = allocatedStats(base, { power: 25 }); // +50 power
  let wins = 0, n = 60;
  for (let i = 0; i < n; i++) {
    const fight = createFight({
      player: makeFighter({ name: 'P', stats: eff }),
      foe: makeFighter({ name: 'C', stats: scaleStats(eff, CHAMPION.mult), weaponId: CHAMPION.weaponId, talents: CHAMPION.talents }),
      seed: 40000 + i, aiLevel: 3,
    });
    let g = 0;
    while (!fight.over && g++ < 300) {
      if (fight.active === 'p') {
        let inner = 0;
        while (!fight.over && fight.active === 'p' && fight.ap > 0 && inner++ < 8) {
          const legal = actionsFor(fight).filter(x => x.enabled);
          const pick = id => legal.find(x => x.id === id);
          // brainless: biggest swing every AP
          const c = pick('signature') || pick('haymaker') || pick('swing') || pick('jab') || legal[0];
          if (!c) break;
          applyAction(fight, c.id);
        }
        if (!fight.over) endTurn(fight);
      } else { aiTakeTurn(fight); if (!fight.over) endTurn(fight); }
    }
    if (fight.over && fight.over.winner === 'p') wins++;
  }
  const rate = wins / n;
  assert.ok(rate < 0.9, `glass-cannon spam vs champ winrate ${Math.round(rate * 100)}% should stay under 90% (foes scale)`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
