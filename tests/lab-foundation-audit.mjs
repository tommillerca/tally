// Foundation only. Real production grants over mem-idb; no browser or network.
// CONTROL rows exercise nonempty grants, coloured legacy saves, and Rose paths.
// Run this unchanged against pre-foundation sources to prove the new policy red.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { db, kvGet, kvSet, useDbName, importAll, exportAll } from '../js/db.js';
import * as pets from '../js/pets.js';
import * as loot from '../js/loot.js';
import * as game from '../js/game.js';
import { collectSpawn } from '../js/hunt.js';
import { claimQuest } from '../js/quests.js';
import { claimDenWin, claimMiniWin, isoWeekKey } from '../js/poi.js';
import { __testApplyGrant, openGift } from '../js/social.js';
import { dateKey } from '../js/nutrition.js';

const colours = ['base', 'ember', 'frost', 'toxic', 'rose', 'midnight'];
const species = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
let passed = 0, failed = 0, sequence = 0;
async function check(name, fn) {
  useDbName(`lab-foundation-${++sequence}`);
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
const cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
async function withRolls(values, fn) {
  let calls = 0;
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {
    randomUUID: () => `audit-${sequence}-${++sequence}`,
    getRandomValues(a) { a[0] = Math.floor(values[Math.min(calls++, values.length - 1)] * 0xffffffff); return a; },
  } });
  try { return await fn(() => calls); }
  finally { Object.defineProperty(globalThis, 'crypto', cryptoDescriptor); }
}
async function seed() {
  await kvSet('petInst', species.map((sp, i) => ({ iid: `old-${i}`, sp, morph: 'base', lineage: 0, shiny: false, hatchedAtSteps: 0 })));
  await kvSet('petLvlV', 2);
  await kvSet('pettalents', { __iidV: 2 });
  for (const sp of species) await db.put('inv', { id: `cos-${sp}`, kind: 'cos', itemId: sp });
}
const day = dateKey();
const routes = [
  ['welcome', () => game.initLootIfNeeded(), 0],
  ['health milestone', () => game.onHealthSync(day, { steps: game.EGG_STEP_THRESHOLD })],
  ['level milestone', () => game.grantLevelRewards(24, 25)],
  ['weekly dust', async () => { await kvSet('bonedust', 1000); await loot.buyDustEgg(); }],
  ['weekly dust recovery', async () => { await kvSet('bonedust', 1000); await kvSet(`dustegg:${isoWeekKey(new Date())}`, { granted: false }); await loot.buyDustEgg(); }],
  ['quest', () => claimQuest(day, { id: 'lab-egg', label: 'Audit', xp: 20, coins: 1, crate: 'egg' })],
  ['hunt/map spawn', () => collectSpawn({ id: 'lab-rare', type: 'rare', cell: '1_1' }, day)],
  ...['roaming', 'remote', 'landmark'].map(kind => [`POI ${kind}`, () => claimDenWin({ id: `lab-${kind}`, name: 'Audit', tier: 0, [kind]: true, reward: { crate: 'egg', xp: 60 } }, day)]),
  ['POI mini', () => claimMiniWin({ id: 'lab-mini', name: 'Audit', reward: { crate: 'egg', xp: 20 } }, day)],
  ['map crate fallback', () => loot.grantCrate('egg', 'boneyard')],
  ...[{ egg: true }, { egg: 'ready' }, { crate: 'egg' }].map((payload, i) => [`social ${i}`, () => __testApplyGrant({ key: `audit-grant-${i}`, type: 'admin', payload }), payload.egg === 'ready' ? 0 : undefined]),
  ['sealed social gift', async () => { await kvSet('giftbox', [{ key: 'audit-gift', type: 'gift', payload: { egg: 'ready' } }]); await openGift('audit-gift'); }, 0],
  ['legacy egg-crate conversion', async () => { await db.put('inv', { id: 'legacy', kind: 'crate', crate: 'egg', source: 'legacy' }); assert.equal(await loot.migrateLegacyEggs(), 1); }],
];
for (const [name, grant, goal = loot.EGG_GOAL_STEPS] of routes) {
  await check(`CONTROL BASE route: ${name}`, async () => {
    await seed();
    // On old code this stream chooses a non-Base morph from the fresh pool.
    await withRolls([0.5], grant);
    const eggs = (await loot.inventory()).filter(r => r.kind === 'egg');
    assert.equal(eggs.length, 1, 'route must actually grant exactly one egg');
    assert.equal(eggs[0].morph, 'base');
    assert.equal(eggs[0].goal, goal);
  });
}
await check('CONTROL EGG row keeps metadata and never reads pet ownership or rolls', async () => {
  await db.put('health', { date: day, steps: 1234, exerciseMin: 10 });
  const anchor = await loot.lifetimeStepsSum();
  const originalAll = db.all;
  db.all = store => { assert.notEqual(store, 'inv', 'grant must not read ownership'); return originalAll(store); };
  const before = Date.now();
  try {
    await withRolls([0.5], async calls => {
      const row = await loot.eggRow('metadata-control', 0);
      assert.equal(row.morph, 'base');
      assert.equal(row.morphPolicy, 'lab-final-v1');
      assert.equal(row.stepsAtStart, anchor);
      assert.equal(row.source, 'metadata-control');
      assert.equal(row.goal, 0);
      assert.ok(row.id && row.ts >= before && row.ts <= Date.now());
      assert.equal(calls(), 0);
    });
  } finally { db.all = originalAll; }
});
await check('CONTROL GRID six colours, exact tables and 36 current cells survive restore', async () => {
  const rows = species.flatMap(sp => colours.map(morph => ({ iid: `${sp}-${morph}`, sp, morph, lineage: 2, shiny: false, hatchedAtSteps: 123 })));
  await importAll({ app: 'tally', version: 3, log: [], kv: [{ k: 'petInst', v: rows }] });
  assert.deepEqual(await loot.petInstances(), rows);
  const backup = await exportAll();
  await importAll(backup);
  assert.deepEqual(await kvGet('petInst'), rows, 'migration/restore cannot confiscate or reroll colours');
  assert.deepEqual(pets.MORPHS, colours);
  assert.deepEqual(pets.MORPH_WEIGHT, { base: 40, ember: 22, frost: 22, toxic: 10, rose: 10, midnight: 4 });
  assert.deepEqual(pets.MORPH_TIER, { base: 0, ember: 1, frost: 1, toxic: 2, rose: 2, midnight: 3 });
  assert.equal(pets.MORPH_LABEL.rose, 'Rose');
  const owned = pets.ownedPairs([...rows, rows[0], { sp: 'CX', morph: 'base' }]);
  assert.equal(pets.ownedCellCount(owned, species), 36);
});
await check('CONTROL ROSE art resolves all six approved masters', () => {
  for (const sp of species) {
    assert.equal(pets.morphAsset(sp, 'rose'), `assets/bh/C/morph/${sp}__rose.png`);
    const png = readFileSync(new URL(`../${pets.morphAsset(sp, 'rose')}`, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
  }
  assert.equal(pets.morphAsset('CX', 'rose'), '');
});
await check('CONTROL LEGACY weighted helper can still select Rose', () => withRolls([0.92], () => {
  const owned = pets.ownedPairs(species.flatMap(sp => colours.map(morph => ({ sp, morph }))));
  assert.equal(pets.rollMorph(owned), 'rose');
}));
for (const morph of colours.filter(m => m !== 'base')) {
  await check(`HATCH existing ${morph} egg keeps its colour, shiny override unchanged`, async () => {
    await seed();
    assert.equal(loot.SHINY_CHANCE, 0.03);
    for (const shiny of [false, true]) {
      const id = `in-flight-${morph}-${shiny}`;
      const row = { id, kind: 'egg', source: 'old-client', goal: 0, stepsAtStart: 0, morph, ts: 1 };
      await db.put('inv', row);
      await importAll(await exportAll());
      await loot.migrateLegacyEggs();
      assert.deepEqual(await db.get('inv', id), row);
      await withRolls([shiny ? 0.029 : 0.031, 0.2], async calls => {
        const result = await loot.hatchEgg(id);
        assert.equal(result.ready, true);
        assert.equal(result.shiny, shiny);
        assert.equal(result.morph, shiny ? 'base' : morph);
        assert.equal((await loot.petInstances()).at(-1).morph, shiny ? 'base' : morph);
        assert.equal(calls(), 2, 'only shiny draw and species draw');
      });
    }
  });
}
await check('HATCH C6 still cannot be shiny', async () => {
  await seed();
  await db.put('inv', { id: 'c6', kind: 'egg', goal: 0, stepsAtStart: 0, morph: 'rose' });
  await withRolls([0, 0], async () => {
    const result = await loot.hatchEgg('c6');
    assert.equal(result.item.id, 'C6');
    assert.equal(result.shiny, false);
    assert.equal(result.morph, 'rose');
  });
});
await check('CONTROL DEFAULT direct and random pet grants remain Base', async () => {
  for (const sp of ['C1', 'random']) await loot.grantPet(sp, 'audit');
  await loot.addPetInstance('C2');
  const rows = await loot.petInstances();
  assert.equal(rows.length, 3);
  assert.ok(rows.every(r => r.morph === 'base'));
});

// Conservative lint: runtime modules cannot even reference the legacy helper.
// This also catches aliased imports, namespace calls and bracket access. Only
// pets.js owns the definition; tests and data tooling may import it separately.
const uncomment = source => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const forbidden = source => /\brollMorph\b/.test(uncomment(source));
await check('CONTROL LINT rejects old grant call, aliases and namespace access', () => {
  for (const src of [
    'const morph = rollMorph(ownedPairs(await petInstances()));',
    "import { rollMorph as choose } from './pets.js'; choose(new Set());",
    "return pets['rollMorph'](owned);",
  ]) assert.equal(forbidden(src), true);
  assert.equal(forbidden("const morph = 'base'; /* rollMorph is legacy */"), false);
  const files = readdirSync(new URL('../js/', import.meta.url), { recursive: true }).filter(f => /\.(?:m?js)$/.test(f) && f !== 'pets.js');
  assert.ok(files.includes('loot.js') && files.includes('social.js') && files.includes('game.js'));
  const bad = files.filter(f => forbidden(readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8')));
  assert.deepEqual(bad, [], 'reward/runtime modules must not reference rollMorph');
});
console.log(`LAB FOUNDATION: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
