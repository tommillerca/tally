// Frozen 2026-09-09 work order: equality at the old top multiplier, no stat loss.
import assert from 'node:assert/strict';
import { PET_STATS, PET_ASSIGN, petBattleStats, petStatMultiplier,
  SHINY_STAT_MULT, PET_LINEAGE_STEP, PET_STAT_MULT_CAP } from '../js/pets.js';
const before = {
  C3: [1, { power: 1.05, reflex: 0.97 }],
  C4: [1, { power: 1.12, marrow: 0.85, reflex: 1.05 }],
  C5: [1.09, { marrow: 1.15, power: 0.92 }],
  C1: [1.27, { reflex: 1.12, wind: 1.06, power: 0.96 }],
  C2: [1.36, { marrow: 1.08, reflex: 1.02 }],
  CX: [1.15, { power: 1.04, marrow: 1.06, reflex: 1 }],
  C6: [1.15, { power: 1.04, marrow: 1.06, reflex: 1 }],
};
const tilt = { power: 1.12, marrow: 1.15, wind: 1.06, reflex: 1.12 };
console.log('PARITY observed ' + JSON.stringify(Object.fromEntries(Object.entries(PET_STATS).map(([id, s]) => [id, { mult: s.mult, tilt: s.tilt }]))));
assert.deepEqual(Object.keys(PET_STATS).sort(), Object.keys(before).sort());
assert.deepEqual(Object.keys(PET_ASSIGN).sort(), Object.keys(before).sort());
assert.equal(SHINY_STAT_MULT, 1.08);
assert.equal(PET_LINEAGE_STEP, 0.05);
assert.equal(PET_STAT_MULT_CAP, 1.5);
function assertParity(rows) {
  assert.deepEqual(Object.keys(rows).sort(), Object.keys(before).sort(), 'all seven species');
  for (const id of Object.keys(before)) {
    assert.equal(rows[id].mult, 1.36, `${id}: multiplier must equal old top 1.36`);
    assert.deepEqual(rows[id].tilt, tilt, `${id}: identical tilt without losing a capped stat`);
  }
}
assertParity(PET_STATS);
// CONTROL: the same assertions must reject a missing species, the old lower
// multiplier, and a same-multiplier species whose tilt still gives extra stats.
assert.throws(() => assertParity({}), /all seven species/);
assert.throws(() => assertParity({ ...PET_STATS, C3: { ...PET_STATS.C3, mult: 1 } }), /multiplier/);
assert.throws(() => assertParity({ ...PET_STATS, C3: { ...PET_STATS.C3, tilt: { ...tilt, power: 2 } } }), /identical tilt/);
for (const [id, [oldMult, oldTilt]] of Object.entries(before)) {
  assert.equal(PET_STATS[id].mult, 1.36, `${id}: multiplier must equal old top 1.36`);
  assert.deepEqual(PET_STATS[id].tilt, tilt, `${id}: identical tilt without losing a capped stat`);
  for (let level = 1; level <= 10; level++) for (const shiny of [false, true])
    for (const lineage of [...Array(31).keys(), 1000]) {
      const actual = petBattleStats(id, level, shiny, lineage);
      const equal = petBattleStats('C2', level, shiny, lineage);
      const old = Math.min(1.5, oldMult * (shiny ? 1.08 : 1) * (1 + lineage * 0.05));
      assert.equal(petStatMultiplier(id, shiny, lineage), petStatMultiplier('C2', shiny, lineage));
      for (const [k, base] of Object.entries({ power: 10 + level*4, marrow: 20, wind: 30, reflex: 25 + level*5, hp: 47 + level })) {
        assert.equal(actual[k], equal[k], `${id} L${level}: ${k} parity`);
        assert.ok(actual[k] >= Math.round(base * old * (oldTilt[k === 'hp' ? 'marrow' : k] || 1)),
          `${id} L${level} shiny=${shiny} lineage=${lineage}: ${k} nerfed`);
      }
    }
}
console.log('pet-parity: 7 species, levels 1-10, ordinary/shiny, lineage 0-30/1000: equal stats and no loss PASS');
