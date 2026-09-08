// Fixed paired seeds. This is an observed regression band, not a population guarantee.
// Run --control-empty / --control-degenerate to demonstrate a failing sample.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { petStressCells, measurePet, BUILDS } from './fight-sim.mjs';
import { petStatMultiplier, petStatBonusText, petBreedGainText, petBattleStats, PET_STAT_MULT_CAP } from '../js/pets.js';
const SEEDS = 200;
const IDS = ['C1', 'C2', 'C3', 'C4', 'C5', 'CX', 'C6'];
const KINDS = ['Skewer', 'Crow Lord', 'Crow Lord + Skewer'];
const FOES = ['dailyGlutton', 'champion', 'endless1', 'glutton10', 'wanderer13'];
const expected = IDS.flatMap(id => KINDS.flatMap(kind => FOES.map(foe => `${id} ${kind}/${foe}`))).sort();
function assertCells(cells) {
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
  }
}
if (process.argv.includes('--control-empty')) assertCells([]);
if (process.argv.includes('--control-degenerate')) assertCells(Array.from({ length: 105 }, () => ({ key: expected[0], seeds: 0, winRate: NaN })));
const cells = petStressCells({ seeds: SEEDS });
assertCells(cells);
assert.throws(() => assertCells([]), /105 cells/);
assert.throws(() => assertCells(Array(105).fill(cells[0])), /unique/);
assert.throws(() => assertCells(cells.map(c => ({ ...c, seeds: 0 }))), /200 fights/);
assert.throws(() => assertCells(cells.map(c => ({ ...c, winRate: NaN }))), /invalid rate/);
assert.throws(() => measurePet(BUILDS[0], { seeds: 0 }), /positive integer/);
assert.throws(() => assertCells(cells.map(c => ({ ...c, wins: 200, winRate: 1 }))), /90% ceiling/);
assert.throws(() => assertCells(cells.map(c => ({ ...c, control: { ...c.control, wins: c.wins, winRate: c.winRate } }))), /5 percentage points/);

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
for (const foe of FOES) {
  const rows = cells.filter(c => c.foe === foe).map(c => c.winRate).sort((a, b) => a - b);
  console.log(`${foe}: min/median/max ${[rows[0], rows[10], rows[20]].map(x => (100 * x).toFixed(1)).join('/')}%`);
}
console.log('pet-stress: 105 cells x 200 paired fights, 90% ceiling and daily +5pp floor PASS');
console.log('CONTROL empty, duplicate, zero-seed, NaN, saturated and no-advantage samples rejected; capped copy PASS');
