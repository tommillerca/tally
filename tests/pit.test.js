// The Pit engine vs the combat math spec's own numbers.
import assert from 'node:assert/strict';
import {
  deriveStats, derived, WEAPONS, ACTIONS, counterMult, resolveHit, makeFighter,
  createFight, actionsFor, applyAction, endTurn, planTelegraph, aiTakeTurn,
  simulate, LADDER, CHAMPION, scaleStats, TAUNT_CURVE,
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
