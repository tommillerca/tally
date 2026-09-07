// Node-only state and app-handler proof using production pets/loot/db exports.
// mem-idb supplies storage only. No stand-ins for isKnownPet or legalPicks.
// Reproduce defects on a throwaway copy with the same audit, never on this tree.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kvGet, kvSet, useDbName } from '../js/db.js';
import * as loot from '../js/loot.js';
import * as pets from '../js/pets.js';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const deps = { ...loot, ...pets };
function compile(source, args = []) {
  return new AsyncFunction(...Object.keys(deps), ...args, source).bind(null, ...Object.values(deps));
}
const helperStart = app.indexOf('async function choosePetTalent(');
const choose = helperStart < 0 ? undefined : compile(
  app.slice(helperStart, app.indexOf('async function openStable(', helperStart)) + '\nreturn choosePetTalent(iid, node);', ['iid', 'node']);
const tree = pets.PET_TREES.imp;
const full = tree.map(t => t.opts[0].id);
const levels = [10, 6, 4, 2, 1];
const copies = levels.map((level, i) => ({ iid: `audit-${i}`, sp: 'C1', lineage: 0, shiny: false }));
const steps = Object.fromEntries(copies.map((x, i) => [x.iid, pets.PET_LEVEL_STEPS[levels[i] - 1]]));
let seq = 0, passed = 0, failed = 0;
async function seed(extra = {}) {
  useDbName(`pet-state-${++seq}`);
  for (const [key, value] of Object.entries({ petInst: copies, petLvlV: 2,
    petLvlSteps: steps, petStepCredit: 0, petEquipped: copies[0].iid,
    equipped: { C: 'C1' }, pettalents: { C1: full, FUTURE: ['future-choice'] }, ...extra })) await kvSet(key, value);
}
async function test(name, fn) {
  try { await seed(); await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}

await test('MIGRATION five copies keep only their own earned tiers and archive legacy choices', async () => {
  for (let i = 0; i < copies.length; i++) {
    assert.deepEqual(await loot.petPicks(copies[i].iid), full.slice(0, Math.floor(levels[i] / 2)), `copy ${i} level ${levels[i]}`);
  }
  const bank = await kvGet('pettalents');
  assert.equal(bank.__iidV, 2);
  assert.deepEqual(bank.__legacy, { C1: full, FUTURE: ['future-choice'] });
  await loot.setPetPick(copies[0].iid, null, []);
  assert.deepEqual(await loot.petPicks(copies[0].iid), [], 'migration must never refill cleared choices');
  assert.deepEqual(await loot.petPicks('C1'), [], 'species is not an instance key');
});
await test('MIGRATION explicit instance choices win over species choices', async () => {
  await kvSet('pettalents', { C1: full, [copies[0].iid]: [tree[0].opts[1].id] });
  assert.deepEqual(await loot.petPicks(copies[0].iid), [tree[0].opts[1].id]);
});
await test('HATCH new level-one duplicate never inherits the legacy full tree', async () => {
  const hatch = await loot.addPetInstance('C1');
  assert.equal(pets.petLevel(await loot.petStepsForIid(hatch.iid)), 1);
  assert.deepEqual(await loot.petPicks(hatch.iid), []);
  assert.deepEqual(await loot.petPicks(copies[0].iid), full);
});
await test('STORAGE rejects unearned, wrong-family, duplicate-tier and unknown choices', async () => {
  const iid = copies[3].iid;
  const bad = [full[4], 'w-cleanse', full[0], tree[0].opts[1].id, 'bogus'];
  assert.deepEqual(await loot.setPetPick(iid, full[0], bad), [full[0]]);
  assert.deepEqual((await kvGet('pettalents'))[iid], [full[0]]);
  await kvSet('pettalents', { __iidV: 2, [iid]: bad });
  assert.deepEqual(await loot.petPicks(iid), [full[0]], 'stale imported data must be filtered on read');
});
await test('UNKNOWN unsupported rows survive storage but cannot equip, mint or fight', async () => {
  const unknown = { iid: 'future', sp: 'C99', arbitrary: { keep: true } };
  const invalid = [unknown, null, { iid: '', sp: 'C1' }, { iid: 'missing' }];
  await kvSet('petInst', [...copies, ...invalid]);
  assert.deepEqual(await loot.petInstances(), copies);
  assert.deepEqual((await kvGet('petInst')).slice(copies.length), invalid);
  await kvSet('equipped', { C: 'C99' });
  assert.equal((await loot.equipped({ raw: true })).C, undefined);
  assert.equal((await kvGet('equipped')).C, 'C99', 'read must not erase unknown data');
  await assert.rejects(() => loot.addPetInstance('C99'), /unknown pet/);
  assert.equal(await loot.setEquippedPet('future'), null);
  assert.equal(await kvGet('petEquipped'), copies[0].iid);
  assert.deepEqual(await loot.petPicks('future'), []);
});
await test('HEAL duplicate ids never steal an existing reserved id', async () => {
  const rows = [copies[0], { ...copies[0] }, { ...copies[0], iid: 'audit-0~2' }, { iid: 'future', sp: 'C99' }];
  const result = loot.healDupIids(rows);
  assert.ok(result, 'heal must return a list');
  assert.equal(new Set(result.map(x => x.iid)).size, rows.length);
  assert.equal(result[2].iid, rows[2].iid, 'an existing unique instance must keep its identity');
  assert.deepEqual(result[3], rows[3]);
});

// Execute the exact production registration and click body. The tiny DOM here
// captures listeners and highlights only; real-browser controls have their own audit.
async function clickHandler(stable, iid, node, cachedLevel = 10) {
  const selector = stable ? '[data-petpick2]' : '[data-petpick]';
  const start = app.indexOf(`$$('${selector}',`);
  assert.ok(start >= 0, 'real handler must exist');
  const end = app.indexOf('}));', start);
  const button = { dataset: { iid, pet: 'C1', sp: 'C1', tier: '10', lvl: String(cachedLevel),
    petpick: node, petpick2: node }, addEventListener(type, fn) { this.listener = fn; } };
  const fighter = { petMeta: { id: 'C1', iid, level: cachedLevel, picks: [] } };
  const $$ = query => query === selector ? [button] : [];
  await compile(app.slice(start, end + 4), ['$$', 'body', 'content', 'fighter', 'choosePetTalent', 'toast', 'popSound', 'S'])(
    $$, {}, {}, fighter, choose, () => {}, () => {}, { sounds: false });
  assert.equal(typeof button.listener, 'function');
  await button.listener();
}
for (const stable of [true, false]) {
  await test(`${stable ? 'STABLE' : 'WARDROBE'} click writes selected iid only and refuses a stale unlocked button`, async () => {
    const iid = copies[0].iid, other = copies[1].iid, node = tree[0].opts[1].id;
    await loot.petPicks(iid);
    const sibling = await loot.petPicks(other);
    await clickHandler(stable, iid, node);
    assert.ok((await loot.petPicks(iid)).includes(node), 'click did not save to the selected instance');
    assert.deepEqual(await loot.petPicks(other), sibling, 'editing a duplicate changed its sibling');
    await kvSet('petLvlSteps', { ...steps, [iid]: 0 });
    const before = await kvGet('pettalents');
    await clickHandler(stable, iid, full[4]);
    assert.deepEqual(await kvGet('pettalents'), before, 'stale button must refuse without writing');
  });
}
await test('UI-WIRING rendered controls and Stable reads carry instance ids', () => {
  assert.ok(/openPicks = openInst \? await petPicks\(openInst\.iid\)/.test(app), 'Stable must read openInst.iid');
  for (const token of ['data-iid="${esc(inst.iid)}"', 'data-iid="${esc(meta.iid)}"']) assert.ok(app.includes(token), token);
});
await test('BATTLE real app assembly gives buildBattlePet no unearned picks, including imported stale data', async () => {
  const start = app.indexOf('  let battlePet = null, petMeta = null;');
  const end = app.indexOf('  // habitStats', start);
  assert.ok(start >= 0 && end > start, 'real battle assembly must be sampled');
  let seen = 0;
  const build = pets.buildBattlePet;
  const run = compile(app.slice(start, end) + '\nreturn { battlePet, petMeta };', ['buildBattlePet']);
  const inspect = (sp, level, picks, opts) => {
    seen++;
    assert.deepEqual(picks, pets.legalPicks(sp, level, picks), 'unearned picks reached buildBattlePet');
    return build(sp, level, picks, opts);
  };
  for (let i = 0; i < copies.length; i++) {
    await kvSet('petEquipped', copies[i].iid);
    await kvSet('pettalents', { __iidV: 2, [copies[i].iid]: [...full, 'w-cleanse'], C1: full });
    const { battlePet, petMeta } = await run(inspect);
    const expected = full.slice(0, Math.floor(levels[i] / 2));
    assert.equal(petMeta.iid, copies[i].iid);
    assert.deepEqual(petMeta.picks, expected);
    assert.deepEqual([...battlePet.picks], expected);
  }
  assert.equal(seen, 5, 'empty battle sample cannot pass');
});
await test('BATTLE-SNAPSHOT picks are legal for the level passed to the builder', async () => {
  const iid = copies[4].iid;
  await kvSet('petEquipped', iid);
  await kvSet('pettalents', { __iidV: 2, [iid]: full });
  const start = app.indexOf('  let battlePet = null, petMeta = null;');
  const end = app.indexOf('  // habitStats', start);
  const run = compile(app.slice(start, end) + '\nreturn { battlePet, petMeta };', ['petPicks', 'buildBattlePet']);
  let seen = 0;
  const result = await run(async requested => {
    // A level update lands after buildFighter samples steps but before picks.
    await kvSet('petLvlSteps', { ...steps, [iid]: pets.PET_LEVEL_STEPS[9] });
    return loot.petPicks(requested);
  }, (sp, level, picks, opts) => {
    seen++;
    assert.equal(level, 1);
    assert.deepEqual(picks, [], 'higher-level picks reached the level-one builder');
    return pets.buildBattlePet(sp, level, picks, opts);
  });
  assert.equal(seen, 1);
  assert.deepEqual([...result.battlePet.picks], []);
});
console.log(`pet-state: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
