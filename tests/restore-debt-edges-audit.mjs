// Q1: CONTROL and end-of-chain restore guards for removal, ordering and opacity.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { kvGet, kvSet, importAll, exportAll, useDbName } from '../js/db.js';
import { addPetInstance, salvagePet, salvageInstance, breedPets, petInstances, petStepsForIid } from '../js/loot.js';
import { POTIONS, grantPotion, usePotion, potionsInv, activeFoodBuffs, consumeFightFoodBuffs, foodCombatBuff, foodCoinMult } from '../js/cooking.js';
let passed = 0, failed = 0, seq = 0;
const blob = obj => ({ app: 'tally', version: 3, log: [], kv: Object.entries(obj).map(([k, v]) => ({ k, v })) });
const merge = obj => importAll(blob(obj), { replace: false });
async function test(name, fn) {
  useDbName(`q1-edges-${++seq}`);
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
for (const mode of ['instance', 'species']) await test(`PET ${mode} salvage receipt survives repeated stale merges`, async () => {
  const first = await addPetInstance('C1');
  const before = await exportAll();
  assert.equal((await petInstances()).length, 1, 'CONTROL real grant owns one copy');
  const result = mode === 'instance' ? await salvageInstance(first.iid) : await salvagePet('C1');
  assert.equal(result.ok, true);
  assert.equal((await petInstances()).length, 0);
  const after = await exportAll();
  for (let n = 0; n < 2; n++) {
    await importAll(before, { replace: false });
    assert.equal((await petInstances()).length, 0, 'stale backup revived salvaged copy');
    assert((await kvGet('petTaken', [])).includes(first.iid));
  }
  await importAll(before); // explicit rollback still restores the copy
  assert.equal((await petInstances()).length, 1);
  await importAll(after, { replace: false }); // remote receipt removes local copy too
  assert.equal((await petInstances()).length, 0, 'remote receipt failed to remove local copy');
  const rebooted = await import(`../js/loot.js?q1-reboot=${mode}`);
  assert.equal((await rebooted.petInstances()).length, 0, 'opening the Stable after remote salvage reclaimed the copy');
});
await test('PET breeding retains earned lineage and never revives the fed copy', async () => {
  const keep = await addPetInstance('C1'), feed = await addPetInstance('C1');
  const before = await exportAll();
  assert.equal((await breedPets(keep.iid, feed.iid)).ok, true, 'CONTROL breed succeeded');
  await importAll(before, { replace: false });
  const pets = await petInstances();
  assert.equal(pets.length, 1, 'fed copy revived');
  assert.equal(pets[0].lineage, 1, 'keeper lost earned lineage');
  assert((await kvGet('petTaken', [])).includes(feed.iid));
});
await test('CONTROL duplicate-iid copies in one snapshot still reach the existing healer', async () => {
  const copy = { iid: 'duplicate', sp: 'C1', lineage: 0, shiny: false };
  await merge({ petInst: [copy, copy], petLvlV: 2, petLvlSteps: { duplicate: 100 } });
  const pets = await petInstances();
  assert.equal(pets.length, 2, 'merge discarded a copy before iid healing');
  assert.equal(new Set(pets.map(x => x.iid)).size, 2);
  for (const pet of pets) assert.equal(await petStepsForIid(pet.iid), 100);
});
await test('BANK union and legacy merge retain per-instance steps and credit', async () => {
  const a = { iid: 'a', sp: 'C1', lineage: 0 }, b = { iid: 'b', sp: 'C1', lineage: 0 };
  await merge({ petInst: [a, b], petLvlV: 2, petLvlSteps: { a: 1000, b: 500 }, petStepCredit: 1000 });
  await merge({ petLvlV: 1, petLvlSteps: { C1: 10 }, petStepCredit: 10 });
  assert.equal(await petStepsForIid('a'), 1000, 'legacy marker downgraded the iid bank');
  assert.equal(await petStepsForIid('b'), 500);
  assert.equal(await kvGet('petStepCredit'), 1000, 'stale checkpoint credits steps twice');
  await merge({ petLvlV: 2, petLvlSteps: { a: 2000 } });
  assert.equal(await petStepsForIid('a'), 2000, 'CONTROL newer earned steps accepted');
  assert.equal(await petStepsForIid('b'), 500);
});
await test('POTION revisions preserve independent kinds, remote spend and rollback', async () => {
  const a = POTIONS[0].id, b = POTIONS[1].id;
  await grantPotion(a, 2);
  const before = await exportAll();
  await usePotion(a);
  const spent = await exportAll();
  await importAll(before);
  await grantPotion(b, 5);
  await importAll(spent, { replace: false });
  assert.deepEqual(await potionsInv(), { [a]: 1, [b]: 5 }, 'remote spend or independent earnings lost');
  await importAll(before);
  assert.deepEqual(await potionsInv(), { [a]: 2 }, 'CONTROL explicit rollback accepted');
  await Promise.all([usePotion(a), grantPotion(a)]);
  assert.equal((await potionsInv())[a], 2);
  assert.equal((await kvGet('potionsRev'))[a], 4, 'balance and revision drifted');
});
await test('POTION empty sip writes no revision and revision-only merge cannot poison balance', async () => {
  const id = POTIONS[0].id;
  assert.equal(await usePotion(id), false, 'CONTROL empty sip refused');
  assert.equal(await kvGet('potionsRev'), null);
  await grantPotion(id);
  await merge({ potionsRev: { [id]: 100 } });
  assert.equal((await kvGet('potionsRev'))[id], 1, 'revision advanced without its balance');
});
await test('BUFF prune and fight spend preserve opaque rows and apply only understood effects', async () => {
  const opaque = [{ kind: 'future-aura', untilMs: 1, charges: 9 }, { kind: 'combat', fightsLeft: { future: 3 } }, { kind: 'combat', format: 4, fightsLeft: 3 }, null];
  const combat = { kind: 'combat', fightsLeft: 2, damagePct: 7 };
  await kvSet('foodbuffs', [...opaque, combat, { kind: 'coins', untilMs: 200, pct: .25 }, { kind: 'coins', untilMs: 1 }]);
  assert.equal((await activeFoodBuffs(100)).length, 2, 'opaque rows must not become active effects');
  assert.equal((await foodCombatBuff(100)).damagePct, 7, 'CONTROL known combat effect applies');
  assert.equal(await foodCoinMult(100), 1.25, 'CONTROL known coin effect applies');
  await consumeFightFoodBuffs(300);
  assert.deepEqual(await kvGet('foodbuffs'), [...opaque, { ...combat, fightsLeft: 1 }]);
  await consumeFightFoodBuffs(300);
  assert.deepEqual((await exportAll()).kv.find(r => r.k === 'foodbuffs').v, opaque);
});
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
