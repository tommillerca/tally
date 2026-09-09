// Fixed paired seeds. This is an observed regression band, not a population guarantee.
// Run --control-empty / --control-degenerate to demonstrate a failing sample.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { petStressCells, historicalPetStressCells, measurePet, BUILDS } from './fight-sim.mjs';
import { petStatMultiplier, petStatBonusText, petBreedGainText, petBattleStats, PET_STAT_MULT_CAP,
  petCombatLead, petDamageMultiplier, petTargetChance, petAbilityEffect, buildBattlePet } from '../js/pets.js';
const SEEDS = 200;
/* PROVENANCE, 2026-09-08. Tom's ruling: "do what you need to do to balance the
   pet if it needs to be 20% instead of 40% that's fine", so the target band is
   ours and the CELL SET is what must not drift. These three lists are the
   stress board the retune was measured against, and they are pinned so a later
   change cannot quietly shrink the sample until nothing fails: an empty or
   narrowed board would read as a pass. IDS is every pet species including the
   founder (CX) and C6; KINDS are the dish loadouts; FOES are the five rungs the
   before/after/held-out distributions were taken on. Changing any of these
   invalidates the recorded distributions in docs/CLAIMS.md v519 and needs a
   fresh measurement, not an edited expectation. */
const IDS = ['C1', 'C2', 'C3', 'C4', 'C5', 'CX', 'C6'];
/* PROVENANCE, 2026-09-08 (Tom's pet-balance ruling): the dish loadouts the
   v519 distributions were measured on. Pinned so the board cannot be narrowed
   to hide a regression; changing it invalidates CLAIMS.md v519. */
const KINDS = ['Skewer', 'Crow Lord', 'Crow Lord + Skewer'];
/* PROVENANCE, 2026-09-08 (Tom's pet-balance ruling): the five rungs the
   before/after/held-out win rates were taken on. dailyGlutton is the easiest
   and is the pair that still exceeds 90% on held-out seeds with Crow Lord, a
   residual accepted deliberately in CLAIMS.md v519 rather than tuned away. */
const FOES = ['dailyGlutton', 'champion', 'endless1', 'glutton10', 'wanderer13'];
const expected = IDS.flatMap(id => KINDS.flatMap(kind => FOES.map(foe => `${id} ${kind}/${foe}`))).sort();
// Frozen round-1 no-pet wins on seeds 1..200, in FOES order. Targeting and
// damage changes must preserve every matched control, not just its maximum.
const controlWins = { Skewer: [3, 1, 1, 0, 1], 'Crow Lord': [22, 2, 1, 1, 3], 'Crow Lord + Skewer': [22, 2, 1, 1, 3] };
function assertHistoricalCells(cells) {
  assert.ok(Array.isArray(cells) && cells.length === 105, 'stress sample must contain all 105 cells');
  assert.deepEqual(cells.map(c => c.key).sort(), expected, 'stress cells must be unique and cover every species/build/foe');
  for (const c of cells) {
    assert.equal(c.key, `${c.id} ${c.kind}/${c.foe}`, 'cell identity must match its key');
    assert.equal(c.seeds, SEEDS, 'every cell must contain 200 fights');
    for (const r of [c, c.control]) {
      assert.ok(r && Number.isInteger(r.wins) && r.wins >= 0 && r.wins <= SEEDS, `${c.key}: invalid wins`);
      assert.ok(Number.isInteger(r.draws) && r.draws >= 0 && r.draws + r.wins <= SEEDS, `${c.key}: invalid draws`);
      assert.equal(r.winRate, r.wins / SEEDS, `${c.key}: invalid rate`);
      assert.ok(r.ci?.length === 2 && r.ci.every(Number.isFinite), `${c.key}: missing interval`);
    }
    assert.ok(c.winRate <= 0.90, `${c.key}: ${(100 * c.winRate).toFixed(1)}% exceeds 90% ceiling`);
    // Hard rungs may legitimately approach zero; retain an advantage where it
    // can be measured reliably, on the daily Glutton for every species/build.
    if (c.foe === 'dailyGlutton') assert.ok(c.winRate >= c.control.winRate + 0.05,
      `${c.key}: pet must add at least 5 percentage points over its matched no-pet control`);
    assert.equal(c.control.wins, controlWins[c.kind][FOES.indexOf(c.foe)], `${c.key}: no-pet control moved`);
    assert.equal(c.control.draws, 0, `${c.key}: no-pet draws moved`);
  }
  const rates = cells.map(c => c.winRate).sort((a, b) => a - b);
  assert.ok(rates[52] >= 0.45 && rates[52] <= 0.55, `stress median ${(rates[52] * 100).toFixed(1)}% outside 45-55% band`);
  assert.ok(rates[104] >= 0.85, 'stress peak must retain the 85-90% band');
}
// The v519 synthetic board and its original assertions above remain readable.
// Its measured figures do not describe equipped real play. Run explicitly to
// compare today's pet code with the historical band; it is not the new gate.
if (process.argv.includes('--historical-check')) assertHistoricalCells(historicalPetStressCells({ seeds: SEEDS }));
// PROVENANCE 2026-09-09: Tom's frozen realistic-player work order.
// Both competent Crow Lord food states replace the talentless main-board row.
const REALISTIC_KINDS = ['Crow Lord', 'Crow Lord + Skewer'];
const realisticExpected = IDS.flatMap(id => REALISTIC_KINDS.flatMap(kind => FOES.map(foe => `${id} ${kind}/${foe}`))).sort();
// Chosen AFTER step-2 measurement, BEFORE post-parity measurement: peak 74.5%.
// 85% leaves 10.5pp headroom, but still requires >=15% losses in every cell.
// No median floor: this board measures challenge, not the old synthetic shape.
const REALISTIC_CEILING = 0.85;
const realisticControlWins = [11, 3, 1, 5, 24]; // step 2, paired seeds 1..200
function assertCells(cells) {
  assert.ok(Array.isArray(cells) && cells.length === 70, 'stress sample must contain all 70 cells');
  assert.deepEqual(cells.map(c => c.key).sort(), realisticExpected, 'stress cells must be unique and cover every species/build/foe');
  for (const c of cells) {
    assert.equal(c.key, `${c.id} ${c.kind}/${c.foe}`, 'cell identity must match key');
    assert.equal(c.seeds, SEEDS, 'every cell must contain 200 fights');
    for (const r of [c, c.control]) {
      assert.ok(r && Number.isInteger(r.wins) && r.wins >= 0 && r.wins <= SEEDS, `${c.key}: invalid wins`);
      assert.ok(Number.isInteger(r.draws) && r.draws >= 0 && r.draws + r.wins <= SEEDS, `${c.key}: invalid draws`);
      assert.equal(r.winRate, r.wins / SEEDS, `${c.key}: invalid rate`);
      assert.ok(r.ci?.length === 2 && r.ci.every(Number.isFinite), `${c.key}: missing interval`);
    }
    assert.ok(c.winRate <= REALISTIC_CEILING, `${c.key}: ${(100*c.winRate).toFixed(1)}% exceeds 85% realistic ceiling`);
    if (c.foe === 'dailyGlutton') assert.ok(c.winRate >= c.control.winRate + 0.05,
      `${c.key}: pet must add at least 5 percentage points over its matched no-pet control`);
    assert.equal(c.control.wins, realisticControlWins[FOES.indexOf(c.foe)], `${c.key}: no-pet control moved`);
    assert.equal(c.control.draws, 0, `${c.key}: no-pet draws moved`);
  }
}
if (process.argv.includes('--control-empty')) assertCells([]);
if (process.argv.includes('--control-degenerate')) assertCells(Array.from({ length: 70 }, () => ({ key: realisticExpected[0], seeds: 0, winRate: NaN })));
const cells = petStressCells({ seeds: SEEDS, overpowered: process.argv.includes('--control-overpowered') });
if (process.argv.includes('--control-overpowered')) console.log('OVERPOWERED INPUT: pet body stats x1000, real engine, same player/foes/seeds; peak ' + Math.max(...cells.map(c => c.winRate))*100 + '%');
assertCells(cells);
assert.throws(() => assertCells([]), /70 cells/);
assert.throws(() => assertCells(Array(70).fill(cells[0])), /unique/);
assert.throws(() => assertCells(cells.map(c => ({ ...c, seeds: 0 }))), /200 fights/);
assert.throws(() => assertCells(cells.map(c => ({ ...c, winRate: NaN }))), /invalid rate/);
assert.throws(() => measurePet(BUILDS[0], { seeds: 0 }), /positive integer/);
assert.throws(() => measurePet(BUILDS[0], { seedStart: 0 }), /seedStart/);
assert.throws(() => measurePet(BUILDS[0], { seedStart: Number.MAX_SAFE_INTEGER }), /seedStart/);
assert.throws(() => assertCells(cells.map(c => ({ ...c, wins: 200, winRate: 1 }))), /85% realistic ceiling/);
assert.throws(() => assertCells(cells.map(c => ({ ...c, control: { ...c.control, wins: c.wins, winRate: c.winRate } }))), /5 percentage points/);
assert.throws(() => assertCells(cells.map(c => ({ ...c,
  control: { ...c.control, wins: c.control.wins + 1, winRate: (c.control.wins + 1) / SEEDS } }))), /no-pet control moved/);
// Exercise the actual combat input mutation on every ordinary guard run too.
const runaway = petStressCells({ seeds: SEEDS, overpowered: true });
assert.throws(() => assertCells(runaway), /85% realistic ceiling/);

const fighter = (hp, maxHp = 100) => ({ hp, d: { maxHp, powerMult: 1 } });
for (const hp of [20, 50, 65]) {
  const self = fighter(hp), foe = fighter(50);
  assert.ok(petCombatLead(self, foe) < 1e-12);
  assert.ok(Math.abs(petDamageMultiplier(self, foe) - 1) < 1e-12, 'behind or within the free lead keeps full damage');
  assert.ok(Math.abs(petTargetChance(self, foe, false) - 0.18) < 1e-12);
  assert.ok(Math.abs(petTargetChance(self, foe, true) - 0.45) < 1e-12);
}
const foe = fighter(20), self = fighter(100);
assert.ok(petDamageMultiplier(self, foe) < petDamageMultiplier(fighter(80), foe));
assert.equal(petTargetChance(self, foe, false), 0.8);
assert.equal(petTargetChance(self, foe, true), 0.8);
assert.equal(petDamageMultiplier(fighter(200, 200), fighter(40, 200)), petDamageMultiplier(self, foe));
for (const id of ['C1', 'C3', 'C4']) {
  const pet = buildBattlePet(id, 10, []);
  const behind = petAbilityEffect(pet, fighter(10), foe), ahead = petAbilityEffect(pet, self, foe);
  if (behind.damage) assert.ok(ahead.damage < behind.damage);
  for (const status of ['poison', 'burn']) if (behind[status]) {
    assert.ok(ahead[status].per < behind[status].per);
    assert.equal(ahead[status].turns, behind[status].turns);
  }
}
const hound = buildBattlePet('C4', 10, []);
assert.equal(petAbilityEffect(hound, fighter(10), foe).damage, 11, 'small bite is untouched');
const huge = fighter(10); huge.d.powerMult = 100;
assert.ok(petAbilityEffect(hound, huge, foe).damage <= 24, 'large pre-crit bite is capped even while behind');

// The same capped maths powers previews, help, and the destructive breed receipt.
for (const id of IDS) for (const shiny of [false, true]) {
  assert.equal(petStatMultiplier(id, shiny, 1000), PET_STAT_MULT_CAP);
  assert.match(petStatBonusText(id, shiny, 1000), /1\.5x base stats \(cap reached\)/);
  assert.match(petBreedGainText(id, 10, shiny, 1000), /adds no combat stats/);
  for (const level of [1, 6, 10]) for (const lineage of [1, 2, 3, 10]) {
    const before = petBattleStats(id, level, shiny, lineage - 1), after = petBattleStats(id, level, shiny, lineage);
    const gains = ['power', 'marrow', 'wind', 'reflex', 'hp'].filter(k => after[k] > before[k]);
    const copy = petBreedGainText(id, level, shiny, lineage);
    if (!gains.length) assert.match(copy, /adds no combat stats/);
    for (const k of gains) assert.ok(copy.includes(`+${after[k] - before[k]} ${k === 'hp' ? 'HP' : k}`));
  }
}
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
assert.doesNotMatch(app, /lineage\s*\*\s*5|offLineage\s*\*\s*5|\+5% to every stat|got stronger|Each rank is worth the same/);
assert.ok(app.includes('petBreedGainText(keeper.sp') && app.includes('petBreedGainText(off.sp'), 'preview and receipt must disclose actual gains');
assert.ok(app.includes('petStatBonusText(petId, shiny, lineage)'), 'pet card must disclose the combined cap');
for (const foe of ['all', ...FOES]) {
  const rows = cells.filter(c => foe === 'all' || c.foe === foe).map(c => c.winRate).sort((a, b) => a - b);
  console.log(`${foe}: min/median/max ${[rows[0], rows[Math.floor(rows.length / 2)], rows.at(-1)].map(x => (100 * x).toFixed(1)).join('/')}%`);
}
console.log('pet-stress: 70 cells x 200 paired fights, <=85% ceiling, daily +5pp floor and frozen realistic no-pet controls PASS');
console.log('CONTROL empty, duplicate, zero-seed, NaN, saturated, no-advantage and moved-control samples rejected; actual overpowered pet input rejected; shaped effects and capped copy PASS');
