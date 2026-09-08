// P3 unresolved restore defects. Deliberately RED until coordinated fixes land.
// CONTROL verifies healthy restore and earned values before testing loss/refund.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { db, kvGet, kvSet, importAll, exportAll, useDbName } from '../js/db.js';
import { petInstances, petStepsForIid } from '../js/loot.js';
import { POTIONS, grantPotion, usePotion, potionCount, potionsInv, activeFoodBuffs } from '../js/cooking.js';
let passed = 0, failed = 0, seq = 0;
const restore = obj => importAll({ app: 'tally', version: 3, log: [],
  kv: Object.entries(obj).map(([k, v]) => ({ k, v })) }, { replace: false });
async function test(name, fn) {
  useDbName(`p3-debt-${++seq}`);
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
const first = { iid: 'first', sp: 'C1', shiny: false, lineage: 0 };
const earned = { iid: 'earned', sp: 'C1', shiny: true, lineage: 1 };
await test('CONTROL known pet restore reaches real level reader and export', async () => {
  await restore({ petInst: [first], petLvlV: 2, petLvlSteps: { first: 1000 } });
  assert.equal(await petStepsForIid('first'), 1000);
  assert.deepEqual((await exportAll()).kv.find(r => r.k === 'petInst').v, [first]);
});
await test('DEBT stale petInst merge must retain earned duplicate without reviving salvaged copies', async () => {
  await kvSet('petInst', [first, earned]);
  assert.equal((await petInstances()).length, 2);
  await restore({ petInst: [first] });
  const after = await petInstances();
  assert(after.some(x => x.iid === earned.iid), `earned iid lost; copies 2 -> ${after.length}`);
});
await test('DEBT stale per-instance level bank must not erase earned steps', async () => {
  await restore({ petInst: [first], petLvlV: 2, petLvlSteps: { first: 1000 } });
  assert.equal(await petStepsForIid('first'), 1000);
  await restore({ petLvlV: 2, petLvlSteps: { first: 10 } });
  const after = await petStepsForIid('first');
  assert.equal(after, 1000, `banked steps 1000 -> ${after}`);
});
await test('DEBT stale potion balance must not refund a consumed potion', async () => {
  const id = POTIONS[0].id;
  await grantPotion(id);
  assert.equal(potionCount(await potionsInv()), 1);
  const old = await exportAll();
  assert.equal(await usePotion(id), true);
  assert.equal(potionCount(await potionsInv()), 0);
  await importAll(old, { replace: false });
  const after = potionCount(await potionsInv());
  assert.equal(after, 0, `spent potion count 0 -> ${after}`);
});
await test('DEBT older cooking reader must preserve opaque future earned buff', async () => {
  const future = { kind: 'future-aura', charges: 9, format: 4 };
  await restore({ foodbuffs: [future] });
  assert.deepEqual(await kvGet('foodbuffs'), [future]);
  await activeFoodBuffs();
  const after = (await exportAll()).kv.find(r => r.k === 'foodbuffs').v;
  assert.deepEqual(after, [future], `opening kitchen deleted future buff; rows 1 -> ${after.length}`);
});
console.log(`${passed} passed, ${failed} failed (unresolved restore debt)`);
process.exitCode = failed ? 1 : 0;
