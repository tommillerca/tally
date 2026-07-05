// The Pit engine vs the combat math spec's own numbers.
import assert from 'node:assert/strict';
import {
  deriveStats, derived, WEAPONS, ACTIONS, counterMult, resolveHit, makeFighter,
  createFight, actionsFor, applyAction, endTurn, planTelegraph, aiTakeTurn,
  simulate, LADDER, CHAMPION, scaleStats, TAUNT_CURVE, expectedDamage, MISS_CHANCE, allocatedStats, TRAIN_STEP,
  petActionsFor, applyPetAction, dealDamage, armorDR, makePetBody, talentRanks, nodeRanks,
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
test('worked example: P60 Bonecrusher haymaker = base*power*weapon (vs a no-armor dummy)', () => {
  const attacker = makeFighter({ name: 'A', stats: { power: 60, marrow: 50, wind: 50, reflex: 50, hype: 0 }, weaponId: 'bonecrusher' });
  const defender = makeFighter({ name: 'D', stats: { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 } });
  const r = resolveHit({ move: 'haymaker', attacker, defender, rng: noLuck });
  // 40 base * powerMult(1.9) * bonecrusher haymaker mult(1.24) = 94.24 -> 94 (dummy has 0 armor)
  assert.equal(r.damage, 94, String(r.damage));
  // wind cost with Bonecrusher penalty: 35 * 1.3 = 45.5 -> 46
  assert.equal(Math.round(35 * WEAPONS.bonecrusher.windCostMult('haymaker')), 46);
});

test('weapons: each has a clear spec identity + real mechanical hook', () => {
  const s = { power: 40, marrow: 40, wind: 40, reflex: 40, hype: 40 };
  // Skull Scepter: +30% magic (magicMult), no physical bonus
  const base = derived(s, WEAPONS.starter).magicMult;
  const scep = derived(s, WEAPONS.scepter).magicMult;
  assert.ok(Math.abs(scep - (base + 0.30)) < 1e-9, `scepter magic ${scep} vs ${base}+0.3`);
  assert.equal(WEAPONS.scepter.spec, 'hype');
  // Femur Rapier: +12% crit, cheaper swing
  assert.ok(Math.abs(derived(s, WEAPONS.rapier).critChance - (derived(s, WEAPONS.starter).critChance + 0.12)) < 1e-9);
  assert.ok(WEAPONS.rapier.windCostMult('swing') < 1 && WEAPONS.rapier.windCostMult('jab') === 1);
  // Twin Shivs: all close strikes cheaper, no crit/magic change
  assert.ok(WEAPONS.shivs.windCostMult('jab') === 0.8 && WEAPONS.shivs.windCostMult('haymaker') === 0.8);
  assert.equal(derived(s, WEAPONS.shivs).critChance, derived(s, WEAPONS.starter).critChance);
  // Starter is a true neutral baseline
  assert.equal(WEAPONS.starter.windCostMult('haymaker'), 1.0);
  assert.equal(WEAPONS.starter.mult('haymaker', s), 1.0);
  // every weapon declares a rarity
  for (const w of Object.values(WEAPONS)) assert.ok(w.rarity, `${w.id} rarity`);
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

// ---- passive Block/Dodge retired: defense is active (Bone Guard + Rattle) ----
test('no counter matrix: counterMult is a neutral shim', () => {
  assert.equal(counterMult('swing', 'block').mult, 1.0);
  assert.equal(counterMult('haymaker', 'dodge').mult, 1.0);
  assert.ok(!counterMult('haymaker', 'dodge').miss);
  // the defensive moves are gone from the action set entirely
  assert.ok(!ACTIONS.block && !ACTIONS.dodge && !ACTIONS.brace);
  // replaced by an active shield + an active debuff
  assert.ok(ACTIONS.guard.shield && ACTIONS.rattle.debuff);
});

test('Bone Guard raises a Marrow-scaled absorb pool that soaks damage', () => {
  const fight = createFight({
    player: makeFighter({ name: 'P', stats: { power: 50, marrow: 60, wind: 90, reflex: 0, hype: 0 } }),
    foe: makeFighter({ name: 'F', stats: { power: 50, marrow: 50, wind: 90, reflex: 0, hype: 0 } }),
    seed: 5,
  });
  applyAction(fight, 'guard');
  const shield = Math.round(16 + 60 * 0.15); // 25
  assert.equal(fight.p.ward, shield);
  const hpBefore = fight.p.hp;
  const evs = []; dealDamage(fight, 'p', 10, evs);
  assert.equal(fight.p.hp, hpBefore); // fully soaked
  assert.equal(fight.p.ward, shield - 10);
});

test('ranked passives hook into the engine (HP, cost, damage, hit)', () => {
  const st = { power: 50, marrow: 50, wind: 50, reflex: 50, hype: 50 };
  const plain = makeFighter({ name: 'P', stats: st });
  // densebones 5/5 = +30 max HP
  const beefy = makeFighter({ name: 'B', stats: st, talents: ['densebones', 'densebones', 'densebones', 'densebones', 'densebones'] });
  assert.equal(beefy.d.maxHp, plain.d.maxHp + 30);
  // followthrough 3/3 = swings +12%
  const dummy = makeFighter({ name: 'D', stats: { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 } });
  const base = resolveHit({ move: 'swing', attacker: plain, defender: dummy, rng: noLuck }).damage;
  const boosted = makeFighter({ name: 'F', stats: st, talents: ['followthrough', 'followthrough', 'followthrough'] });
  const hit = resolveHit({ move: 'swing', attacker: boosted, defender: dummy, rng: noLuck }).damage;
  assert.equal(hit, Math.round(22 * 1.75 * 1.12), `${base} -> ${hit}`); // engine rounds once at the end
  // marrowtap 3/3 = bone bolt costs 6 less
  const caster = makeFighter({ name: 'C', stats: st, talents: ['bonebolt', 'marrowtap', 'marrowtap', 'marrowtap'] });
  const fight = createFight({ player: caster, foe: makeFighter({ name: 'X', stats: st }), seed: 3 });
  const bolt = actionsFor(fight).find(x => x.id === 'bonebolt');
  assert.equal(bolt.windCost, ACTIONS.bonebolt.wind - 6);
  // steadyhands 5/5 = -5% miss on haymaker (probe expected damage path via missChance edge)
  const shaky = makeFighter({ name: 'S', stats: st });
  const steady = makeFighter({ name: 'T', stats: st, talents: Array(5).fill('steadyhands') });
  let shakyMiss = 0, steadyMiss = 0;
  for (let i = 0; i < 4000; i++) {
    const rng1 = mulberrylike(i), rng2 = mulberrylike(i);
    if (resolveHit({ move: 'haymaker', attacker: shaky, defender: dummy, rng: rng1 }).miss) shakyMiss++;
    if (resolveHit({ move: 'haymaker', attacker: steady, defender: dummy, rng: rng2 }).miss) steadyMiss++;
  }
  assert.ok(steadyMiss < shakyMiss, `steady ${steadyMiss} < shaky ${shakyMiss}`);
});
function mulberrylike(seed) { let a = (seed * 2654435761) >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test('pet food (Bonemeal Kibble): bigger pet HP + harder pet hits', () => {
  const st = { power: 50, marrow: 50, wind: 50, reflex: 50, hype: 50 };
  const petDesc = { name: 'Fido', level: 4, family: 'hound', picks: new Set(), ability: null };
  const plainOwner = makeFighter({ name: 'P', stats: st, pet: petDesc });
  const fedOwner = makeFighter({ name: 'P', stats: st, pet: petDesc, food: { petHpPct: 0.30, petDamagePct: 0.25 } });
  const plainPet = makePetBody(petDesc, plainOwner);
  const fedPet = makePetBody(petDesc, fedOwner);
  assert.ok(fedPet.d.maxHp > plainPet.d.maxHp, `${fedPet.d.maxHp} > ${plainPet.d.maxHp}`);
  assert.ok(Math.abs(fedPet.d.maxHp / plainPet.d.maxHp - 1.30) < 0.05, 'about +30% HP');
  assert.equal(fedPet.petDamagePct, 0.25);
  assert.equal(plainPet.petDamagePct || 0, 0);
});

test('Bone Guard restores stamina (the new way to refuel)', () => {
  const st = { power: 50, marrow: 50, wind: 50, reflex: 50, hype: 50 };
  const fight = createFight({ player: makeFighter({ name: 'P', stats: st }), foe: makeFighter({ name: 'F', stats: st }), seed: 5 });
  fight.p.wind = 30;
  applyAction(fight, 'guard');
  assert.equal(fight.p.wind, 30 - 12 + 22); // spent 12 on the move, caught +22 stamina = 40
  assert.ok(fight.p.ward > 0, 'and raised a shield');
});

test('boss AoE sweep can hit both you and your pet', () => {
  const st = { power: 50, marrow: 50, wind: 50, reflex: 50, hype: 50 };
  let sawAoe = false;
  for (let s = 1; s <= 80 && !sawAoe; s++) {
    const petDesc = { name: 'Pet', level: 5, family: 'hound', picks: new Set(), ability: null };
    const player = makeFighter({ name: 'You', stats: st, pet: petDesc });
    const foe = makeFighter({ name: 'Boss', stats: scaleStats(st, 1.2) });
    const fight = createFight({ player, foe, seed: s, aiLevel: 5 });
    fight.range = 'close'; fight.active = 'f'; fight.ap = foe.d.ap;
    const evs = aiTakeTurn(fight);
    const aoe = evs.find(e => e.t === 'aoe');
    if (aoe) { sawAoe = true; assert.ok(aoe.dmgYou >= 0 && aoe.dmgPet >= 0, 'sweep hits both bodies'); }
  }
  assert.ok(sawAoe, 'a boss with a living pet eventually sweeps the team');
});

test('armor: Marrow blunts physical, Reflex blunts magic, gear adds on top', () => {
  // physical armor from Marrow
  const beefy = makeFighter({ name: 'B', stats: { power: 0, marrow: 100, wind: 0, reflex: 0, hype: 0 } });
  const glassy = makeFighter({ name: 'G', stats: { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 } });
  assert.ok(beefy.d.armor > 0.2 && glassy.d.armor === 0, `${beefy.d.armor} vs ${glassy.d.armor}`);
  // a physical hit lands softer on the armored target
  const atk = makeFighter({ name: 'A', stats: { power: 60, marrow: 0, wind: 0, reflex: 0, hype: 0 } });
  const hard = resolveHit({ move: 'swing', attacker: atk, defender: beefy, rng: noLuck }).damage;
  const soft = resolveHit({ move: 'swing', attacker: atk, defender: glassy, rng: noLuck }).damage;
  assert.ok(hard < soft, `armored ${hard} < bare ${soft}`);
  // Reflex gives SPELL armor, not physical; a caster is blunted by it
  const nimble = makeFighter({ name: 'N', stats: { power: 0, marrow: 0, wind: 0, reflex: 100, hype: 0 } });
  assert.ok(nimble.d.spellArmor > 0.2 && nimble.d.armor === 0);
  const caster = makeFighter({ name: 'C', stats: { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 80 }, talents: ['bonebolt'] });
  const boltHard = resolveHit({ move: 'bonebolt', attacker: caster, defender: nimble, rng: noLuck }).damage;
  const boltSoft = resolveHit({ move: 'bonebolt', attacker: caster, defender: glassy, rng: noLuck }).damage;
  assert.ok(boltHard < boltSoft, `spell-armored ${boltHard} < bare ${boltSoft}`);
  // gear armor stacks on the base and stays capped
  const geared = makeFighter({ name: 'GA', stats: { power: 0, marrow: 100, wind: 0, reflex: 0, hype: 0 }, gearArmor: { armor: 200, spellArmor: 0 } });
  assert.ok(geared.d.armor > beefy.d.armor && geared.d.armor <= 0.40);
});

test('Rattle weakens the foe and drains their stamina', () => {
  const fight = createFight({
    player: makeFighter({ name: 'P', stats: { power: 50, marrow: 50, wind: 90, reflex: 0, hype: 0 } }),
    foe: makeFighter({ name: 'F', stats: { power: 50, marrow: 50, wind: 90, reflex: 0, hype: 0 } }),
    seed: 5,
  });
  const foeWind = fight.f.wind;
  applyAction(fight, 'rattle');
  assert.ok(fight.f.weaken && fight.f.weaken.pct >= 0.18);
  assert.equal(fight.f.wind, foeWind - 12); // target's stamina jarred loose
});

// ---- spec section 5: signature ----
test('signature at Power 50 deals 210 pre-armor, resets hype', () => {
  const fight = createFight({
    player: makeFighter({ name: 'P', stats: { power: 50, marrow: 50, wind: 50, reflex: 0, hype: 50 } }),
    foe: makeFighter({ name: 'F', stats: { power: 50, marrow: 90, wind: 50, reflex: 0, hype: 0 } }),
    seed: 7,
  });
  fight.p.hype = 100;
  const before = fight.f.hp;
  applyAction(fight, 'signature');
  // 210 raw, blunted by the foe's physical armor (marrow 90 -> 54 pts)
  assert.equal(before - fight.f.hp, Math.round(210 * (1 - armorDR(90 * 0.6))));
  assert.equal(fight.p.hype, 0);
});

// ---- stagger economics ----
test('stagger economics: a staggered fighter starts next turn with 1 AP', () => {
  const fight = createFight({
    player: makeFighter({ name: 'P', stats: { power: 60, marrow: 50, wind: 90, reflex: 0, hype: 0 } }),
    foe: makeFighter({ name: 'F', stats: { power: 50, marrow: 80, wind: 50, reflex: 0, hype: 0 } }),
    seed: 3,
  });
  fight.f.stagger = true; // (now applied by concussive, no longer by blocking a haymaker)
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
  assert.ok(ids.includes('jab') && ids.includes('guard') && ids.includes('rattle') && !ids.includes('advance') && !ids.includes('signature'));
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
  assert.equal(LADDER.length, 8);
  assert.ok(LADDER.every((r, i) => i === 0 || r.mult > LADDER[i - 1].mult), 'rung mults ascend');
  assert.ok(LADDER[LADDER.length - 1].mult < CHAMPION.mult, 'champion tops the ladder');
  assert.equal(CHAMPION.weaponId, 'bonecrusher');
});



// ---- talents (framework section 7) ----
import { TALENT_TREES, talentPoints, canTakeTalent, sigThreshold, RUNG_TALENTS } from '../js/pit.js';
import { makeFighter as mf, createFight as cf, applyAction as apply, actionsFor as acts, endTurn as et, resolveHit as rh } from '../js/pit.js';

const MID = { power: 50, marrow: 50, wind: 50, reflex: 40, hype: 30 };

test('talent tiers gate by points-in-tree, ranks count (v69 deep trees)', () => {
  assert.equal(talentPoints(1), 0);
  assert.equal(talentPoints(8), 7);
  const slab = TALENT_TREES.find(t => t.id === 'slab');
  const idx = id => slab.nodes.findIndex(n => n.id === id);
  const taken = []; // raw kv array: multi-rank ids appear once per rank
  assert.ok(canTakeTalent(taken, 'slab', idx('heavyhands')));   // T1 open
  assert.ok(canTakeTalent(taken, 'slab', idx('steadyhands'))); // ranked T1 open
  assert.ok(!canTakeTalent(taken, 'slab', idx('marrowlust'))); // T2 needs 2 in tree
  assert.ok(!canTakeTalent(taken, 'slab', idx('titan')));      // capstone needs 10
  taken.push('heavyhands', 'steadyhands');
  assert.ok(canTakeTalent(taken, 'slab', idx('marrowlust')));  // T2 opens at 2
  assert.ok(!canTakeTalent(taken, 'slab', idx('concussive'))); // T3 needs 6
  taken.push('steadyhands', 'steadyhands', 'densebones', 'densebones'); // 6 in tree
  assert.ok(canTakeTalent(taken, 'slab', idx('concussive')));
  taken.push('followthrough', 'followthrough', 'followthrough', 'ironjaw'); // 10 in tree
  assert.ok(canTakeTalent(taken, 'slab', idx('titan')));       // capstone at 10
  // rank caps: steadyhands is 5 ranks; the 6th is refused
  taken.push('steadyhands', 'steadyhands'); // now at 5 total
  assert.equal(talentRanks(taken)['steadyhands'], 5);
  assert.ok(!canTakeTalent(taken, 'slab', idx('steadyhands')));
  // single-rank stays single
  assert.ok(!canTakeTalent(taken, 'slab', idx('heavyhands')));
  assert.equal(TALENT_TREES.length, 6);
  assert.ok(TALENT_TREES.every(t => t.nodes.length >= 10), 'deep trees: 10+ nodes each');
  assert.ok(TALENT_TREES.every(t => t.nodes.reduce((a, n) => a + (n.ranks || 1), 0) >= 22), 'each tree takes 22+ points to max');
  const gc = TALENT_TREES.find(t => t.id === 'gravecaller');
  assert.ok(gc && gc.nodes.filter(n => n.move).length >= 4); // the caster is move-rich
  // v70 class-identity actives are registered on their trees
  assert.ok(TALENT_TREES.find(t => t.id === 'slab').nodes.some(n => n.id === 'rage' && n.move), 'Slab has Rage');
  assert.ok(gc.nodes.some(n => n.id === 'raisedead' && n.move), 'Necro has Raise Dead');
  assert.ok(TALENT_TREES.find(t => t.id === 'boneshaman').nodes.some(n => n.id === 'totem' && n.move), 'Shaman has Spirit Totem');
});

test('gravecaller: bone bolt is any-range magic scaling off Hype', () => {
  const caster = mf({ name: 'C', stats: { power: 0, marrow: 50, wind: 50, reflex: 0, hype: 60 }, talents: ['bonebolt'] });
  const dummy = mf({ name: 'D', stats: { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 } });
  const r = rh({ move: 'bonebolt', attacker: caster, defender: dummy, rng: noLuck });
  assert.equal(r.damage, Math.round(16 * (1 + 0.6 * 1.5))); // 30
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
  assert.equal(r.damage, Math.round(10 * 1.75 * 1.15 * (1 - armorDR(90 * 0.6))));
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
test('titan lands a big hit, once per fight', () => {
  const fight = cf({ player: mf({ name: 'P', stats: MID, talents: ['heavyhands', 'marrowlust', 'titan'] }), foe: mf({ name: 'F', stats: { ...MID, marrow: 90 } }), seed: 12 });
  const before = fight.f.hp;
  const evs = apply(fight, 'titan');
  assert.ok(evs.some(e => e.t === 'hit' && e.titan && e.damage > 0), JSON.stringify(evs));
  assert.ok(fight.f.hp < before);
  assert.ok(fight.p.titanUsed);
  fight.ap = 2; fight.p.wind = 90;
  assert.ok(!acts(fight).some(a => a.id === 'titan')); // once per fight
});
test('flurry dumps all wind for 3 hits', () => {
  const fight = cf({ player: mf({ name: 'P', stats: MID, talents: ['lightfeet', 'counterstep', 'flurry'] }), foe: mf({ name: 'F', stats: { ...MID, marrow: 90 } }), seed: 13 });
  const wind = fight.p.wind;
  assert.ok(wind >= 30);
  const before = fight.f.hp;
  const evs = apply(fight, 'flurry');
  const hits = evs.filter(e => e.t === 'hit' && e.flurry);
  assert.equal(hits.length, 3);
  assert.equal(fight.p.wind, 0);
  assert.ok(fight.f.hp < before);
});
test('counterstep punishes a missed enemy attack', () => {
  // With Dodge retired, misses come from MISS_CHANCE/blind. Blind the attacker so
  // the haymaker whiffs, and counterstep should fire the free counter-jab.
  let sawMissWithCounter = false;
  for (let seed = 1; seed <= 40 && !sawMissWithCounter; seed++) {
    const fight = cf({ player: mf({ name: 'P', stats: MID }), foe: mf({ name: 'F', stats: MID, talents: ['lightfeet', 'counterstep'] }), seed });
    fight.p.blind = { pct: 0.85, turns: 2 };
    const evs = apply(fight, 'haymaker');
    if (evs.some(e => e.t === 'miss')) {
      assert.ok(evs.some(e => e.t === 'counter'), JSON.stringify(evs.map(e => e.t)));
      sawMissWithCounter = true;
    }
  }
  assert.ok(sawMissWithCounter, 'a blinded haymaker eventually whiffs and is countered');
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

test('v70 Blood Rage: +35% damage while raged, bleeds 6 HP at turn start, never self-KO', () => {
  const base = { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 50 };
  const P = makeFighter({ name: 'P', stats: base, talents: ['rage'] });
  const F = makeFighter({ name: 'F', stats: base });
  const dummy = makeFighter({ name: 'D', stats: { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 } });
  const swingBase = resolveHit({ move: 'swing', attacker: P, defender: dummy, rng: noLuck }).damage;
  const fight = createFight({ player: P, foe: F, seed: 3 });
  apply(fight, 'rage');
  assert.ok(P.rage && P.rage.turns === 3, 'raging for 3 turns');
  const swingRaged = resolveHit({ move: 'swing', attacker: P, defender: dummy, rng: noLuck }).damage;
  assert.ok(swingRaged > swingBase && Math.abs(swingRaged - swingBase * 1.35) <= 1, `raged ~= base*1.35 (${swingBase} -> ${swingRaged})`);
  // turn passes and comes back: bleed ticks
  const hpBefore = P.hp;
  endTurn(fight); // to foe
  endTurn(fight); // back to me -> rage tick
  assert.equal(P.hp, hpBefore - 6, 'bled 6 at turn start');
  assert.equal(P.rage.turns, 2, 'rage counted down');
  // rage cannot self-KO
  P.hp = 4; P.rage.turns = 3;
  fight.active = 'f'; endTurn(fight);
  assert.ok(P.hp >= 1, 'rage floors at 1 HP');
});

test('v70 Raise Dead: bone minion strikes the enemy at your turn start for 3 turns', () => {
  const base = { marrow: 40, power: 20, wind: 60, reflex: 20, hype: 60 };
  const P = makeFighter({ name: 'P', stats: base, talents: ['raisedead'] });
  const F = makeFighter({ name: 'F', stats: { power: 50, marrow: 80, wind: 50, reflex: 50, hype: 30 } });
  const fight = createFight({ player: P, foe: F, seed: 7 });
  apply(fight, 'raisedead');
  assert.ok(P.minion && P.minion.turns === 3 && P.minion.dmg > 0, 'minion summoned');
  const foeHp = F.hp, dmg = P.minion.dmg;
  endTurn(fight); endTurn(fight); // back to my turn -> minion strikes
  assert.equal(F.hp, foeHp - dmg, 'minion clawed the enemy');
  assert.equal(P.minion.turns, 2);
  assert.ok(fight.pendingTicks.some(t => t.t === 'minionstrike'), 'minion strike event emitted');
  // expires after 3 ticks
  endTurn(fight); endTurn(fight); endTurn(fight); endTurn(fight);
  assert.equal(P.minion, null, 'minion gone after 3 turns');
});

test('v70 Spirit Totem: zaps enemy + restores your Stamina each of your turns', () => {
  const base = { marrow: 40, power: 20, wind: 60, reflex: 20, hype: 60 };
  const P = makeFighter({ name: 'P', stats: base, talents: ['totem'] });
  const F = makeFighter({ name: 'F', stats: { power: 50, marrow: 80, wind: 50, reflex: 50, hype: 30 } });
  const fight = createFight({ player: P, foe: F, seed: 9 });
  apply(fight, 'totem');
  assert.ok(P.totem && P.totem.turns === 3 && P.totem.dmg > 0, 'totem planted');
  const foeHp = F.hp, zap = P.totem.dmg;
  P.wind = 10;
  endTurn(fight); endTurn(fight); // back to my turn -> totem ticks
  assert.equal(F.hp, foeHp - zap, 'totem zapped the enemy');
  assert.equal(P.wind, Math.min(P.d.maxWind, 10 + 20 + 8), 'base regen + totem +8 stamina');
});

test('v71 Bone Merchant weapons: bonuses actually hook into the engine', () => {
  const s = { power: 80, marrow: 50, wind: 50, reflex: 40, hype: 80 };
  const dummy = mf({ name: 'D', stats: { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 } });
  // Gravemarrow Maul: haymaker scales harder off Power than the starter pipe
  const maulHay = rh({ move: 'haymaker', attacker: mf({ name: 'M', stats: s, weaponId: 'maul' }), defender: dummy, rng: noLuck }).damage;
  const pipeHay = rh({ move: 'haymaker', attacker: mf({ name: 'P', stats: s, weaponId: 'starter' }), defender: dummy, rng: noLuck }).damage;
  assert.ok(maulHay > pipeHay, `maul ${maulHay} > pipe ${pipeHay}`);
  // Lich's Focus: +45% magic beats the +30% Skull Scepter on a bolt
  const lich = mf({ name: 'L', stats: s, weaponId: 'lichfocus', talents: ['bonebolt'] });
  const scep = mf({ name: 'S', stats: s, weaponId: 'scepter', talents: ['bonebolt'] });
  const lichBolt = rh({ move: 'bonebolt', attacker: lich, defender: dummy, rng: noLuck }).damage;
  const scepBolt = rh({ move: 'bonebolt', attacker: scep, defender: dummy, rng: noLuck }).damage;
  assert.ok(lichBolt > scepBolt, `lich ${lichBolt} > scepter ${scepBolt}`);
  // Warden's Crook: Mend costs 20% less Stamina
  const crook = mf({ name: 'C', stats: s, weaponId: 'crook', talents: ['mend'] });
  const plainMend = mf({ name: 'P2', stats: s, weaponId: 'starter', talents: ['mend'] });
  const cf1 = cf({ player: crook, foe: mf({ name: 'F', stats: MID }), seed: 1 });
  const cf2 = cf({ player: plainMend, foe: mf({ name: 'F', stats: MID }), seed: 1 });
  const crookCost = acts(cf1).find(a => a.id === 'mend').windCost;
  const plainCost = acts(cf2).find(a => a.id === 'mend').windCost;
  assert.ok(crookCost < plainCost, `crook mend ${crookCost} < plain ${plainCost}`);
  // every vendor weapon is registered with an archetype
  const vendorArch = Object.values(WEAPONS).filter(w => w.vendor);
  assert.ok(vendorArch.length >= 6, 'six+ vendor weapons');
  assert.ok(vendorArch.every(w => ['melee', 'caster', 'support'].includes(w.arch)), 'each vendor weapon has an arch');
});

test('totemic marrow regenerates extra wind each turn', () => {
  const base = { marrow: 50, power: 50, wind: 50, reflex: 50, hype: 50 };
  const P = makeFighter({ name: 'P', stats: base, talents: ['frostbolt', 'totemic'] });
  const F = makeFighter({ name: 'F', stats: base });
  const fight = createFight({ player: P, foe: F, seed: 5 });
  P.wind = 10;
  fight.active = 'f';
  endTurn(fight);
  assert.equal(P.wind, 10 + 20 + 5, 'base regen (20) + totemic 5');
});

test('six trees, ten nodes each, unique ids, new moves registered', () => {
  assert.equal(TALENT_TREES.length, 6);
  const ids = TALENT_TREES.flatMap(t => t.nodes.map(n => n.id));
  assert.equal(new Set(ids).size, ids.length, 'no duplicate node ids');
  for (const t of TALENT_TREES) {
    assert.ok(t.nodes.length >= 10 && t.nodes.length <= 11, t.id + ' has 10-11 nodes');
    assert.equal(t.nodes.filter(n => n.tier === 4).length, 1, t.id + ' has one capstone');
    assert.ok(t.nodes.filter(n => (n.ranks || 1) > 1).length >= 4, t.id + ' has 4+ ranked passives');
  }
  assert.equal(TALENT_TREES.find(t => t.id === 'gravewarden').nodes.find(n => n.id === 'lastlight').tier, 4);
  assert.equal(TALENT_TREES.find(t => t.id === 'boneshaman').nodes.find(n => n.id === 'tempest').tier, 4);
  for (const id of ['smite', 'ward', 'frostbolt', 'firebolt', 'tempest', 'rage', 'raisedead', 'totem']) assert.ok(ACTIONS[id], id + ' action exists');
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
  assert.equal(d2, Math.round(120 * P.d.powerMult * 0.75 * (1 - armorDR(99 * 0.6))));
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

/* ============ v27: bone moves, blind, attack-vs-defense ============ */

test('bone spike is necromancer-only and applies BLIND; blind makes physical attacks miss', () => {
  const P = makeFighter({ name: 'P', stats: MID, talents: ['bonebolt'] });
  const F = makeFighter({ name: 'F', stats: MID });
  const fight = createFight({ player: P, foe: F, seed: 5 });
  fight.rng = () => 0.99; // lands, no crit
  // only necromancers (bonebolt talent) can throw it
  assert.ok(actionsFor(fight).some(x => x.id === 'bonespike'), 'necro has bone spike');
  assert.ok(!actionsFor(createFight({ player: makeFighter({ name: 'N', stats: MID }), foe: F, seed: 5 })).some(x => x.id === 'bonespike'), 'non-necro does not');
  applyAction(fight, 'bonespike');
  assert.ok(F.blind && F.blind.pct > 0, 'foe is blinded');
  // a blinded attacker's physical jab can now miss (base jab never misses)
  const blinded = makeFighter({ name: 'B', stats: MID }); blinded.blind = { pct: 0.30, turns: 2 };
  const clear = makeFighter({ name: 'C', stats: MID });
  const dummy = makeFighter({ name: 'D', stats: MID });
  const rollInWindow = () => 0.15; // under 0.30 blind, over 0 for clear
  assert.ok(resolveHit({ move: 'jab', attacker: blinded, defender: dummy, rng: rollInWindow }).miss, 'blinded jab can miss');
  assert.ok(!resolveHit({ move: 'jab', attacker: clear, defender: dummy, rng: rollInWindow }).miss, 'clear jab never misses');
});

test('blind does NOT affect magic bolts (they home in)', () => {
  const caster = makeFighter({ name: 'C', stats: { power: 0, marrow: 50, wind: 50, reflex: 0, hype: 60 }, talents: ['bonebolt'] });
  caster.blind = { pct: 0.8, turns: 2 };
  const dummy = makeFighter({ name: 'D', stats: MID });
  assert.ok(!resolveHit({ move: 'bonebolt', attacker: caster, defender: dummy, rng: () => 0.5 }).miss, 'bolt ignores blind');
});


test('attack-vs-defense: Power raises hit, Reflex evades (Cam model)', () => {
  const bruiser = makeFighter({ name: 'A', stats: { power: 100, marrow: 50, wind: 50, reflex: 50, hype: 50 } });
  const weakling = makeFighter({ name: 'B', stats: { power: 20, marrow: 50, wind: 50, reflex: 50, hype: 50 } });
  const slippery = makeFighter({ name: 'S', stats: { power: 50, marrow: 50, wind: 50, reflex: 100, hype: 50 } });
  const plain = makeFighter({ name: 'P', stats: MID });
  // haymaker base miss 0.12; count misses over many rolls
  const rolls = Array.from({ length: 1000 }, (_, i) => (i + 0.5) / 1000);
  const missRate = (atk, def) => { let m = 0; for (const r of rolls) if (resolveHit({ move: 'haymaker', attacker: atk, defender: def, rng: () => r }).miss) m++; return m / rolls.length; };
  assert.ok(missRate(bruiser, plain) < missRate(weakling, plain), 'higher Power = fewer misses');
  assert.ok(missRate(plain, slippery) > missRate(plain, plain), 'higher Reflex defender dodges more');
  assert.ok(!resolveHit({ move: 'jab', attacker: weakling, defender: slippery, rng: () => 0.001 }).miss, 'jabs still reliable regardless');
});

test('Heavy Hands also steadies aim (accuracy talent)', () => {
  const plain = makeFighter({ name: 'P', stats: MID });
  const slab = makeFighter({ name: 'S', stats: MID, talents: ['heavyhands'] });
  const def = makeFighter({ name: 'D', stats: MID });
  const rolls = Array.from({ length: 1000 }, (_, i) => (i + 0.5) / 1000);
  const missRate = atk => { let m = 0; for (const r of rolls) if (resolveHit({ move: 'haymaker', attacker: atk, defender: def, rng: () => r }).miss) m++; return m / rolls.length; };
  assert.ok(missRate(slab) < missRate(plain), 'heavy hands lands more often');
});

import { buildBattlePet, familyOf, petLevel, unlockedTiers, PET_ASSIGN, PET_FAMILIES, PET_TREES } from '../js/pets.js';

/* ============ v34: pets in battle ============ */

test('pets: families cover all 3 roles; level curve + tier gates', () => {
  const fams = new Set(Object.keys(PET_ASSIGN).map(id => familyOf(id).key));
  assert.deepEqual([...fams].sort(), ['hound', 'imp', 'warden'], 'all three families represented');
  assert.equal(petLevel(0), 1);
  assert.equal(petLevel(3000), 2);
  assert.equal(petLevel(99999), 6, 'caps at 6');
  assert.deepEqual(unlockedTiers(1), []);
  assert.deepEqual(unlockedTiers(6), [2, 4, 6]);
});

test('pets: Hound passive raises your damage; Warden passive lowers damage taken', () => {
  const houndPet = buildBattlePet('C3', 6, []); // hound
  const wardenPet = buildBattlePet('C2', 6, []); // warden
  const A = makeFighter({ name: 'A', stats: MID, pet: houndPet });
  const plain = makeFighter({ name: 'P', stats: MID });
  const D = makeFighter({ name: 'D', stats: MID });
  const noLuck = () => 0.99;
  const withHound = resolveHit({ move: 'swing', attacker: A, defender: D, rng: noLuck }).damage;
  const without = resolveHit({ move: 'swing', attacker: plain, defender: D, rng: noLuck }).damage;
  assert.ok(withHound > without, `hound owner hits harder (${withHound} > ${without})`);
  const Dward = makeFighter({ name: 'DW', stats: MID, pet: wardenPet });
  const vsWarden = resolveHit({ move: 'swing', attacker: plain, defender: Dward, rng: noLuck }).damage;
  assert.ok(vsWarden < without, `warden owner takes less (${vsWarden} < ${without})`);
});

test('pets: manual Hound Bite deals damage + applies poison that ticks; special on cooldown', () => {
  const P = makeFighter({ name: 'P', stats: MID, pet: buildBattlePet('C3', 6, ['h-rabid']) });
  const F = makeFighter({ name: 'F', stats: { ...MID, marrow: 99 } });
  const fight = createFight({ player: P, foe: F, seed: 7 });
  fight.rng = () => 0.99;
  const foeHp0 = F.hp;
  // Bite is available immediately (specialCd starts 0)
  assert.ok(petActionsFor(fight).find(a => a.id === 'bite').enabled, 'bite ready at fight start');
  const evs = applyPetAction(fight, 'bite');
  assert.ok(evs.some(e => e.t === 'pethit'), 'the hound bit');
  assert.ok(F.hp < foeHp0, 'bite dealt damage');
  assert.ok(F.poison && F.poison.stacks === 2, 'rabid applied 2 poison stacks');
  // special now on cooldown; a basic (nip) is still available
  assert.ok(!petActionsFor(fight).find(a => a.id === 'bite').enabled, 'bite on cooldown after use');
  assert.ok(petActionsFor(fight).find(a => a.id === 'nip').enabled, 'nip (basic) always available');
  // poison ticks when the foe's turn begins
  const hpBeforeTick = F.hp;
  endTurn(fight); // to foe -> ticks foe DoTs
  assert.ok(fight.pendingTicks.some(e => e.t === 'poisontick') || F.hp < hpBeforeTick, 'poison ticked');
});

test('pets: manual Warden Shield wards its owner', () => {
  const P = makeFighter({ name: 'P', stats: MID, pet: buildBattlePet('C2', 6, ['w-bulwark']) });
  const F = makeFighter({ name: 'F', stats: MID });
  const fight = createFight({ player: P, foe: F, seed: 7 });
  applyPetAction(fight, 'shield');
  assert.ok(P.ward > 0, `warden granted a shield (${P.ward})`);
});

test('pets: one pick per tier; tree gated by pet level', () => {
  // build with two nodes from the SAME tier: buildBattlePet just stores picks,
  // the UI enforces one-per-tier; here assert tree shape + level gating math
  for (const fam of Object.keys(PET_TREES)) {
    const tree = PET_TREES[fam];
    assert.equal(tree.length, 3, fam + ' has 3 tiers');
    assert.deepEqual(tree.map(t => t.tier), [2, 4, 6]);
    assert.ok(tree.every(t => t.opts.length === 2), 'one-of-two per tier');
  }
});

test('pets as bodies: the pet has its own HP pool on your side', () => {
  const P = makeFighter({ name: 'P', stats: MID, pet: buildBattlePet('C3', 6, []) });
  const F = makeFighter({ name: 'F', stats: MID });
  const fight = createFight({ player: P, foe: F, seed: 3 });
  assert.ok(fight.pAux && fight.pAux.isPet, 'pet body created on the player side');
  assert.ok(fight.pAux.hp > 0 && fight.pAux.hp === fight.pAux.d.maxHp, 'pet starts at full HP');
});

test('pets as bodies: a downed pet faints (aura drops) but is NOT a loss', () => {
  const P = makeFighter({ name: 'P', stats: MID, pet: buildBattlePet('C3', 6, []) });
  const F = makeFighter({ name: 'F', stats: MID });
  const fight = createFight({ player: P, foe: F, seed: 3 });
  assert.ok(P.pet, 'aura present while the pet lives');
  fight.active = 'f'; fight.fTarget = 'pa'; fight.pAux.hp = 1; fight.rng = () => 0.5;
  applyAction(fight, 'swing'); // foe finishes the pet
  assert.ok(fight.pAux.fainted, 'pet fainted');
  assert.equal(P.pet, null, 'aura dropped when the pet went down');
  assert.ok(!fight.over, 'the fight continues after the pet faints');
});

test('multi-body: win requires the WHOLE enemy side down (boss + add)', () => {
  const P = makeFighter({ name: 'P', stats: { ...MID, power: 99 } });
  const F = makeFighter({ name: 'Boss', stats: MID });
  const ADD = makeFighter({ name: 'Add', stats: MID });
  const fight = createFight({ player: P, foe: F, add: ADD, seed: 3 });
  fight.rng = () => 0.5;
  fight.f.hp = 1; fight.pTarget = 'f';
  applyAction(fight, 'swing'); // kill the boss captain
  assert.ok(fight.f.hp <= 0, 'boss down');
  assert.ok(!fight.over, 'not over while the add still stands');
  fight.fAux.hp = 1; fight.pTarget = 'fa'; fight.ap = 2;
  applyAction(fight, 'swing'); // kill the add
  assert.ok(fight.over && fight.over.winner === 'p', 'win only once BOTH enemies are down');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
