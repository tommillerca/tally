// Frozen day-one grant order: real welcome kit and rack purchases over mem-idb.
// No demo seed, browser, network or filesystem writes. CONTROL exercises both
// sides of the production purchase boundary at the unchanged common anchor.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { db, kvGet, kvSet, useDbName } from '../js/db.js';
import { DAYONE_TOPUP, initLootIfNeeded } from '../js/game.js';
import * as loot from '../js/loot.js';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.log(`FAIL ${name}: ${error.message}`); }
}

await test('REAL GRANT: first boot can afford at least one rack piece', async () => {
  useDbName('dayone-affordability-fresh');
  assert.equal(await loot.coins(), 0, 'CONTROL fresh wallet must be empty');
  await initLootIfNeeded();
  const wallet = await loot.coins();
  assert.equal(wallet, DAYONE_TOPUP, 'measure the actual kit payment');
  const shelf = await loot.rack();
  const prices = loot.RACK_POOLS.map(([price], i) => ({ id: shelf.ids[i], price }));
  const cheapest = prices.reduce((a, b) => a.price < b.price ? a : b);
  console.log(`MEASURE day-one wallet=${wallet}; cheapest rack piece=${cheapest.price}; affordable themed pieces=${prices.filter(p => p.price <= wallet).length}/${prices.length}`);
  assert.equal(cheapest.price, 300, 'the anchor must stay at 300');
  assert.ok(wallet >= cheapest.price, `real grant ${wallet} cannot afford a ${cheapest.price}-coin rack piece`);
  assert.ok(wallet < 2 * cheapest.price, 'grant must not fund two cheapest pieces');
  const bought = await loot.buyRackItem(cheapest.id);
  assert.equal(bought.ok, true, 'actual purchase must succeed with welcome coins');
  assert.equal(bought.cost, cheapest.price);
  assert.ok((await loot.ownedCosmeticIds()).has(cheapest.id));
  assert.equal(await loot.coins(), wallet - cheapest.price);
  assert.equal(await initLootIfNeeded(), null, 'reboot cannot refill the wallet');
  assert.equal(await loot.coins(), wallet - cheapest.price);
  assert.equal((await db.all('xp')).filter(r => r.key === 'dayone-topup').length, 1);
});

await test('CONTROL: 40 coins refuse the anchor; its exact price buys it', async () => {
  useDbName('dayone-affordability-boundary');
  const shelf = await loot.rack();
  const index = loot.RACK_POOLS.findIndex(([price]) => price === 300);
  assert.ok(index >= 0);
  const id = shelf.ids[index];
  await kvSet('coins', 40);
  assert.equal((await loot.buyRackItem(id)).ok, false);
  assert.equal(await loot.coins(), 40);
  assert.equal((await loot.ownedCosmeticIds()).has(id), false);
  await kvSet('coins', 300);
  assert.equal((await loot.buyRackItem(id)).ok, true);
  assert.equal(await loot.coins(), 0);
  assert.ok((await loot.ownedCosmeticIds()).has(id));
});

await test('CONTROL: a completed legacy welcome kit receives no new grant', async () => {
  useDbName('dayone-affordability-legacy');
  await kvSet('loot-init', true);
  await kvSet('coins', 40);
  assert.equal(await initLootIfNeeded(), null);
  assert.equal(await kvGet('coins'), 40);
  assert.equal((await db.all('inv')).length, 0);
});

console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
