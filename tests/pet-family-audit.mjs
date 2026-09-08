import { auditOutputPath } from './lib/audit-output.mjs';
// Node-only lane D contract audit. The baseline is captured BEFORE editing pets.js.
// CONTROL: --source /tmp/pets-before.mjs runs these same guards on a throwaway
// copy of the original module. No mocks replace the missing production helpers.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { BH_ITEMS, bhAsset } from '../data/boneheadz.js';

const originalSHA = '21366bc0aaa833800ddc55fef37bac83947e2b1507f47f4207cee55263cb7570';
const baselineURL = new URL('./fixtures/pet-family-baseline.json', import.meta.url);
const sourceFlag = process.argv.indexOf('--source');
const sourceURL = sourceFlag < 0 ? new URL('../js/pets.js', import.meta.url)
  : pathToFileURL(resolve(process.argv[sourceFlag + 1]));
const pets = await import(sourceURL.href);
// In red runs the real engine must import the throwaway pets module too, or a
// mutated action cooldown would only be tested against the untouched engine kit.
const pitURL = new URL('../js/pit.js', import.meta.url);
const pitSource = sourceFlag < 0 ? null : readFileSync(pitURL, 'utf8').replace(
  /from '(\.[^']+)'/g, (_, path) => `from '${path === './pets.js' ? sourceURL.href : new URL(path, pitURL).href}'`);
const { makeFighter, createFight, applyPetAction, petActionsFor, endTurn } = await import(
  pitSource === null ? pitURL.href : 'data:text/javascript;base64,' + Buffer.from(pitSource).toString('base64'));
const encode = value => JSON.stringify(value, (_, v) => v instanceof Set ? [...v] : v);
const hash = value => createHash('sha256').update(value).digest('hex');
const species = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'CX'];
const options = [{}, { shiny: true }, { lineage: 3 }, { shiny: true, lineage: 7 }];
// Includes both sides and the exact boundary of Frenzy, rounding-sensitive owner
// stats, all species signatures, and every choice INCLUDING leaving a tier empty.
const contexts = [
  [{ d: { powerMult: 1, maxHp: 100 } }, { hp: 100, d: { maxHp: 100 } }],
  [{ d: { powerMult: 1.37, maxHp: 237 } }, { hp: 26, d: { maxHp: 100 } }],
  [{ d: { powerMult: 2.11, maxHp: 501 } }, { hp: 25, d: { maxHp: 100 } }],
  [{ d: { powerMult: 0.73, maxHp: 83 } }, { hp: 1, d: { maxHp: 100 } }],
];
function combinations(tree, level) {
  return tree.filter(row => row.tier <= level).reduce((all, row) =>
    all.flatMap(picks => [picks, ...row.opts.map(opt => [...picks, opt.id])]), [[]]);
}
function snapshot() {
  const rows = [];
  for (const id of species) for (let level = 1; level <= 10; level++) {
    const builds = createHash('sha256'), effects = createHash('sha256');
    let count = 0;
    for (const picks of combinations(pets.PET_TREES[pets.PET_ASSIGN[id]], level)) {
      for (const opts of options) {
        const pet = pets.buildBattlePet(id, level, picks, opts);
        builds.update(encode(pet) + '\n');
        for (const [self, foe] of contexts) effects.update(encode(pets.petAbilityEffect(pet, self, foe)) + '\n');
        count++;
      }
    }
    rows.push({ id, level, builds: count, effects: count * contexts.length,
      buildSHA256: builds.digest('hex'), effectSHA256: effects.digest('hex') });
  }
  return rows;
}

if (process.argv.includes('--capture-baseline')) {
  assert.equal(hash(readFileSync(sourceURL)), originalSHA, 'baseline must come from the unmodified source');
  const outputIndex = process.argv.indexOf('--baseline-output');
  assert.ok(outputIndex >= 0 && process.argv[outputIndex + 1], 'capture requires --baseline-output outside the checkout');
  const baselineOutput = auditOutputPath(resolve(process.argv[outputIndex + 1]));
  assert.ok(!existsSync(baselineOutput), 'never overwrite a frozen baseline');
  const rows = snapshot();
  writeFileSync(auditOutputPath(baselineOutput), JSON.stringify({ sourceSHA256: originalSHA,
    sourceCommit: '45b4989ba45624c1cbc05934116df8cd06c4b54b', rows }, null, 2) + '\n');
  console.log(`CAPTURED baseline: ${rows.reduce((n, r) => n + r.builds, 0)} builds, ${rows.reduce((n, r) => n + r.effects, 0)} effects`);
  process.exit(0);
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
function dummy(fn, actions = false) {
  pets.PET_FAMILIES.dummy = { ...pets.PET_FAMILIES.hound, key: 'dummy' };
  pets.PET_TREES.dummy = pets.PET_TREES.hound;
  pets.PET_ASSIGN.C3 = 'dummy';
  if (actions) pets.PET_ACTIONS.dummy = pets.PET_ACTIONS.hound;
  try { fn(); } finally {
    pets.PET_ASSIGN.C3 = 'hound';
    delete pets.PET_FAMILIES.dummy;
    delete pets.PET_TREES.dummy;
    delete pets.PET_ACTIONS.dummy;
  }
}
const namedDummy = e => /dummy/.test(e.message) && /family/i.test(e.message);
test('FAMILY-ACTIONS refuses a registered row without actions', () => dummy(() => {
  let actual;
  try { actual = pets.petActionMeta('dummy'); } catch (e) { assert.ok(namedDummy(e)); return; }
  assert.fail(`dummy silently received ${actual[0].name} (Hound actions)`);
}));
test('FAMILY-ABILITY refuses a registered row with actions but no dispatch', () => dummy(() => {
  let actual;
  try { actual = pets.petAbilityEffect({ family: 'dummy', level: 1, picks: new Set() }, ...contexts[0]); }
  catch (e) { assert.ok(namedDummy(e)); return; }
  assert.fail(`dummy silently executed ${actual.kind} (Imp effect)`);
}, true));
test('FAMILY-BUILD refuses an incomplete family before a real fight', () => dummy(() => {
  assert.throws(() => pets.buildBattlePet('C3'), namedDummy);
}, true));
test('FAMILY-MISSING an existing dispatch cannot hide missing actions', () => {
  const actions = pets.PET_ACTIONS.hound;
  delete pets.PET_ACTIONS.hound;
  try {
    assert.throws(() => pets.petActionMeta('hound'), /pet family: hound/);
    assert.throws(() => pets.petAbilityEffect({ family: 'hound', level: 1, picks: new Set() }, ...contexts[0]), /pet family: hound/);
    assert.throws(() => pets.buildBattlePet('C3'), /pet family: hound/);
    assert.equal(pets.isKnownPet('C3'), false);
  } finally { pets.PET_ACTIONS.hound = actions; }
});
test('KNOWN accepts renderable combat species and rejects unknown/prototype ids', () => {
  assert.equal(typeof pets.isKnownPet, 'function', 'isKnownPet export is missing');
  assert.deepEqual(BH_ITEMS.filter(i => i.slot === 'C').map(i => i.id).sort(), [...species].sort());
  for (const id of species) {
    assert.equal(pets.isKnownPet(id), true, id);
    const item = BH_ITEMS.find(i => i.id === id);
    assert.ok(existsSync(new URL('../' + bhAsset(item), import.meta.url)), `${id} has renderable art`);
    assert.ok(pets.buildBattlePet(id), `${id} can enter combat`);
  }
  for (const id of ['bogus', 'constructor', '__proto__', 'toString', '', null, undefined, 3, {}]) {
    assert.equal(pets.isKnownPet(id), false);
  }
  dummy(() => assert.equal(pets.isKnownPet('C3'), false), true);
  pets.PET_ASSIGN.C999 = 'hound';
  pets.PET_STATS.C999 = pets.PET_STATS.C3;
  try { assert.equal(pets.isKnownPet('C999'), false, 'combat-only species has no renderable identity'); }
  finally { delete pets.PET_ASSIGN.C999; delete pets.PET_STATS.C999; }
});
test('PICKS-TREE drops an out-of-family pick', () => {
  assert.equal(typeof pets.legalPicks, 'function', 'legalPicks export is missing; out-of-tree picks have no shared guard');
  assert.deepEqual(pets.legalPicks('C3', 10, ['w-mend', 'h-rabid']), ['h-rabid']);
});
test('PICKS-LEVEL drops an above-level pick', () => {
  assert.equal(typeof pets.legalPicks, 'function', 'legalPicks export is missing; above-level picks have no shared guard');
  assert.deepEqual(pets.legalPicks('C3', 2, ['h-savage', 'h-rabid']), ['h-rabid']);
});
test('PICKS-TIER drops the second pick in a tier', () => {
  assert.equal(typeof pets.legalPicks, 'function', 'legalPicks export is missing; competing tier picks have no shared guard');
  const picks = ['h-venom', 'h-bloodscent', 'h-rabid', 'h-venom'];
  assert.deepEqual(pets.legalPicks('C3', 4, picks), ['h-venom', 'h-bloodscent']);
  assert.deepEqual(picks, ['h-venom', 'h-bloodscent', 'h-rabid', 'h-venom'], 'input stays unchanged');
});
test('PICKS-SUBSET accepts every legal combination, preserves order, never throws on invalid data', () => {
  for (const id of species) for (let level = 1; level <= 10; level++) {
    for (const picks of combinations(pets.PET_TREES[pets.PET_ASSIGN[id]], level)) {
      assert.deepEqual(pets.legalPicks(id, level, [...picks].reverse()), [...picks].reverse());
    }
  }
  for (const picks of [null, undefined, {}, 'h-rabid', 3]) assert.deepEqual(pets.legalPicks('C3', 10, picks), []);
  for (const level of [null, undefined, NaN, Infinity, {}, 'bad']) assert.deepEqual(pets.legalPicks('C3', level, ['h-rabid']), []);
  assert.deepEqual(pets.legalPicks('unknown', 10, ['h-rabid']), []);
  assert.deepEqual(pets.legalPicks('C3', 10, [null, {}, 'unknown']), []);
  dummy(() => assert.deepEqual(pets.legalPicks('C3', 10, ['h-rabid']), []), true);
});
test('TIERS derives new unlocks from the applicable family tree', () => {
  pets.PET_TREES.warden.push({ tier: 3, opts: [{ id: 'w-dummy' }] });
  try {
    assert.deepEqual(pets.unlockedTiers(3, 'C2'), [2, 3], 'new Warden tier must unlock and celebrate');
    assert.deepEqual(pets.unlockedTiers(3, 'C3'), [2], 'Hound must not inherit Warden tiers');
    assert.deepEqual(pets.legalPicks('C2', 3, ['w-dummy']), ['w-dummy']);
    assert.deepEqual(pets.legalPicks('C2', 2, ['w-dummy']), []);
  } finally { pets.PET_TREES.warden.pop(); }
});
test('COOLDOWN family metadata agrees with the effective special action', () => {
  for (const family of Object.keys(pets.PET_FAMILIES)) {
    const special = pets.petActionMeta(family).find(a => a.kind === 'special');
    assert.equal(special.cd, 2, `${family} effective cooldown must not change`);
    assert.equal(pets.PET_FAMILIES[family].cooldown, special.cd, `${family} has conflicting cooldown metadata`);
  }
});
test('COOLDOWN-ENGINE specials set the same two-turn timer and reopen after two owner turns', () => {
  const stats = { power: 30, marrow: 100, wind: 40, reflex: 30, hype: 0 };
  for (const [id, action, picks] of [['C3', 'bite', ['h-pack']], ['C2', 'shield', []], ['C1', 'hex', []]]) {
    const fight = createFight({
      player: makeFighter({ name: 'Owner', stats, pet: pets.buildBattlePet(id, 6, picks) }),
      foe: makeFighter({ name: 'Foe', stats }), seed: 7,
    });
    assert.ok(petActionsFor(fight).find(a => a.id === action).enabled);
    assert.ok(applyPetAction(fight, action).length > 0, `${id} actually acted`);
    assert.equal(fight.p.pet.specialCd, 2, `${id} timer is 2, including Pack Tactics`);
    assert.ok(!petActionsFor(fight).find(a => a.id === action).enabled);
    for (let turn = 1; turn <= 2; turn++) {
      endTurn(fight); endTurn(fight);
      assert.equal(fight.p.pet.specialCd, 2 - turn);
      assert.equal(petActionsFor(fight).find(a => a.id === action).enabled, turn === 2);
    }
  }
});
test('NO-DRIFT full serialized builds and effects match the frozen baseline', () => {
  const baseline = JSON.parse(readFileSync(baselineURL));
  assert.equal(baseline.sourceSHA256, originalSHA);
  const actual = snapshot();
  assert.equal(actual.length, 70, 'all 7 species at all 10 levels');
  for (let i = 0; i < actual.length; i++) assert.deepEqual(actual[i], baseline.rows[i], `${actual[i].id} level ${actual[i].level}`);
  console.log(`  ${actual.reduce((n, r) => n + r.builds, 0)} builds and ${actual.reduce((n, r) => n + r.effects, 0)} effects byte-identical`);
});
console.log(`pet-family-audit: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
