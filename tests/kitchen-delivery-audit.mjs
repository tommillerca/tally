// Node-only transaction fault proof: real cooking/db modules over mem-idb.
// The cauldron row executes the actual armToConfirm callback from app.js.
// No browser, socket, physical-tap timing or rendered-pixel claim.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let abortKey = null, hits = 0;
const open = indexedDB.open.bind(indexedDB);
indexedDB.open = (...args) => {
  const request = open(...args);
  let success;
  Object.defineProperty(request, 'onsuccess', {
    set(fn) { success = fn; },
    get() { return event => {
      const database = request.result;
      const transaction = database.transaction.bind(database);
      database.transaction = (...args) => {
        const tx = transaction(...args), objectStore = tx.objectStore.bind(tx);
        tx.objectStore = name => {
          const store = objectStore(name), put = store.put.bind(store);
          store.put = row => {
            const result = put(row);
            if (name === 'kv' && row.k === abortKey) { hits++; tx.abort(); }
            return result;
          };
          return store;
        };
        return tx;
      };
      success(event);
    }; },
  });
  return request;
};
const db = await import('../js/db.js');
const cooking = await import('../js/cooking.js');
const loot = await import('../js/loot.js');
const NOW = 1800000000000;
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const begin = app.indexOf("      armToConfirm($('#buyPot', body)");
const end = app.indexOf('\n      });', begin);
assert.ok(begin > 0 && end > begin, 'actual cauldron callback found');
function purchase(owned = 2) {
  let callback;
  const notices = [];
  const bindings = { ...cooking, coins: loot.coins, coinsAdd: loot.coinsAdd,
    cook: { potsOwned: owned }, price: cooking.nextPotPrice(owned), body: {},
    $: () => ({}), armToConfirm: (_button, _label, fn) => { callback = fn; },
    toast: text => notices.push(text), popSound() {}, S: {}, render() {} };
  new Function(...Object.keys(bindings), app.slice(begin, end + '\n      });'.length))(...Object.values(bindings));
  return { run: () => callback(), notices };
}
let serial = 0, passed = 0, failed = 0;
async function reset(values = {}) {
  abortKey = null;
  db.useDbName(`kitchen-delivery-${++serial}`);
  for (const [key, value] of Object.entries({ potsOwned: 1, cooking: [null], cookq: [],
    ingredients: {}, pantry: [], foodbuffs: [], potions: {}, potionsRev: {}, coins: 0, coinsRev: 0, ...values })) {
    await db.kvSet(key, value);
  }
}
async function fault(key, action) {
  abortKey = key; hits = 0;
  let rejected = false;
  try { await action(); } catch { rejected = true; } finally { abortKey = null; }
  assert.ok(hits > 0 && rejected, `fault ${key} must fire and reject`);
}
async function check(name, fn) {
  try { const detail = await fn(); passed++; console.log(`PASS ${name}${detail ? ': ' + detail : ''}`); }
  catch (error) { failed++; console.log(`FAIL ${name}: ${error.message}`); }
}
const ids = rows => rows.map(row => row.recipeId || row.recipe);
const dish = recipeId => ({ recipeId, name: cooking.RECIPE_BY_ID[recipeId].name, cookedAt: NOW });
const requireState = (condition, detail) => { if (!condition) throw new Error(detail); return detail; };

await check('F20 confirmed third-cauldron purchase abort', async () => {
  await reset({ potsOwned: 2, coins: 3000, coinsRev: 7 });
  const buy = purchase();
  await fault('potsOwned', buy.run);
  const coins = await loot.coins(), owned = await cooking.potsOwned(), rev = await db.kvGet('coinsRev');
  requireState(coins === 3000 && owned === 2 && rev === 7 && !buy.notices.length,
    `coins=${coins}, pots=${owned}, coinsRev=${rev}, successToasts=${buy.notices.length}`);
  await buy.run();
  assert.equal(await loot.coins(), 0); assert.equal(await cooking.potsOwned(), 3);
  assert.equal(await db.kvGet('coinsRev'), 3007); assert.equal(buy.notices.length, 1);
  return 'coins=3000, pots=2, coinsRev=7 on abort; retry delivers pot 3 once';
});

await check('F07 Serve Feast pantry abort', async () => {
  await reset({ ingredients: { ...cooking.RECIPE_BY_ID['necro-feast'].needs } });
  assert.equal((await cooking.startCook('necro-feast', NOW)).ok, true);
  await fault('pantry', () => cooking.collectDish(0, NOW + 121 * 60e3));
  const pot = (await db.kvGet('cooking'))[0], pantry = await cooking.pantryDishes();
  requireState(pot?.recipeId === 'necro-feast' && pantry.length === 0,
    `pot=${pot?.recipeId || 'empty'}, pantry=${pantry.length}`);
  assert.equal((await cooking.collectDish(0, NOW + 121 * 60e3)).id, 'necro-feast');
  assert.equal(await cooking.collectDish(0, NOW + 121 * 60e3), null);
  assert.equal((await cooking.pantryDishes()).length, 1);
  return 'Feast remains in pot on abort; retry banks exactly one Feast';
});

await check('F09 Eat Feast buff abort', async () => {
  await reset({ pantry: [dish('necro-feast')] });
  await fault('foodbuffs', () => cooking.activatePantryDish(0, NOW));
  const pantry = await cooking.pantryDishes(), buffs = await cooking.foodBuffs();
  requireState(pantry.length === 1 && buffs.length === 0, `pantry=${pantry.length}, buffs=${buffs.length}`);
  assert.equal((await cooking.activatePantryDish(0, NOW)).id, 'necro-feast');
  assert.equal((await cooking.foodBuffs())[0].fightsLeft, 4);
  assert.equal((await cooking.pantryDishes()).length, 0);
  return 'pantry=1, buffs=0 on abort; retry activates Feast for 4 fights';
});

await check('F10 overlapping Eat index zero', async () => {
  await reset({ pantry: [dish('marrow-stew'), dish('necro-feast')] });
  const results = await Promise.all([cooking.activatePantryDish(0, NOW), cooking.activatePantryDish(0, NOW)]);
  const pantry = ids(await cooking.pantryDishes()), buffs = ids(await cooking.foodBuffs());
  return requireState(results.filter(Boolean).length === 1 && pantry.join() === 'necro-feast' && buffs.join() === 'marrow-stew',
    `returns=${results.map(r => r?.id || 'null').join(',')}, pantry=${pantry.join() || 'empty'}, buffs=${buffs.join() || 'empty'}`);
});

for (const key of ['cooking', 'pantry']) await check(`F08 advance queue ${key} abort`, async () => {
  await reset({ ingredients: { marrow: 4, salt: 2 } });
  assert.equal((await cooking.startCook('bone-broth', NOW)).ok, true);
  assert.equal((await cooking.queueCook('bone-broth')).ok, true);
  const before = await db.kvGet('cooking');
  await fault(key, () => cooking.advanceQueue(NOW + 16 * 60e3));
  const queue = await db.kvGet('cookq'), pot = await db.kvGet('cooking'), pantry = await cooking.pantryDishes();
  requireState(queue.length === 1 && JSON.stringify(pot) === JSON.stringify(before) && pantry.length === 0,
    `queue=${queue.length}, originalPot=${JSON.stringify(pot) === JSON.stringify(before)}, pantry=${pantry.length}`);
  const banked = await cooking.advanceQueue(NOW + 16 * 60e3);
  assert.equal(banked.length, 1); assert.equal((await cooking.pantryDishes()).length, 1);
  assert.equal((await db.kvGet('cooking'))[0].startedAt, NOW + 15 * 60e3);
  assert.equal((await db.kvGet('cookq')).length, 0);
  return 'queue=1, originalPot=true, pantry=0 on abort; retry banks and starts successor';
});

for (const [verb, key] of [['Cook', 'cooking'], ['Line up', 'cookq']]) await check(`F06 ${verb} job abort`, async () => {
  await reset({ ingredients: { marrow: 2, salt: 1 } });
  const action = () => key === 'cooking' ? cooking.startCook('bone-broth', NOW) : cooking.queueCook('bone-broth');
  await fault(key, action);
  const inv = await cooking.ingredients();
  requireState(inv.marrow === 2 && inv.salt === 1, `marrow=${inv.marrow}, salt=${inv.salt}`);
  assert.deepEqual(await db.kvGet('cooking'), [null]); assert.deepEqual(await db.kvGet('cookq'), []);
  assert.equal((await action()).ok, true);
  assert.deepEqual(await cooking.ingredients(), { marrow: 0, salt: 0 });
  return 'marrow=2, salt=1 on abort; retry pays for exactly one job';
});

await check('CONTROL concurrent Serve and queue drain conserve both cooks', async () => {
  await reset({ ingredients: { marrow: 4, salt: 2 } });
  await cooking.startCook('bone-broth', NOW); await cooking.queueCook('bone-broth');
  await Promise.all([cooking.collectDish(0, NOW + 16 * 60e3), cooking.advanceQueue(NOW + 16 * 60e3), cooking.advanceQueue(NOW + 16 * 60e3)]);
  assert.equal((await cooking.pantryDishes()).length, 1);
  assert.equal((await db.kvGet('cooking'))[0].recipeId, 'bone-broth');
  assert.equal((await db.kvGet('cookq')).length, 0);
});

await check('CONTROL potion Serve preserves inventory and revision on abort', async () => {
  await reset({ ingredients: { ...cooking.POTION_BY_ID['vital-tonic'].needs } });
  await cooking.startCook('vital-tonic', NOW);
  await fault('potionsRev', () => cooking.collectDish(0, NOW + 21 * 60e3));
  assert.equal((await db.kvGet('cooking'))[0]?.recipeId, 'vital-tonic');
  assert.deepEqual(await cooking.potionsInv(), {});
  await cooking.collectDish(0, NOW + 21 * 60e3);
  assert.equal((await cooking.potionsInv())['vital-tonic'], 1);
  assert.equal((await db.kvGet('potionsRev'))['vital-tonic'], 1);
});

await check('CONTROL stale and overlapping purchase confirmations never change the price', async () => {
  await reset({ coins: 4000 });
  const a = purchase(1), b = purchase(1);
  await Promise.all([a.run(), b.run()]);
  assert.equal(await loot.coins(), 3000); assert.equal(await cooking.potsOwned(), 2);
  assert.equal(await db.kvGet('coinsRev'), 1000);
  assert.equal([...a.notices, ...b.notices].filter(t => t.startsWith('New cauldron')).length, 1);
  await a.run();
  assert.equal(await loot.coins(), 3000); assert.equal(await cooking.potsOwned(), 2);
  await purchase(2).run();
  assert.equal(await loot.coins(), 0); assert.equal(await cooking.potsOwned(), 3);
  await purchase(3).run(); assert.equal(await loot.coins(), 0);
  await reset({ potsOwned: 2, coins: 2999 });
  await purchase(2).run();
  assert.equal(await loot.coins(), 2999); assert.equal(await cooking.potsOwned(), 2);
});

await check('CONTROL concurrent Cook and Line up spend only available ingredients', async () => {
  await reset({ ingredients: { marrow: 2, salt: 1 } });
  const results = await Promise.all([cooking.startCook('bone-broth', NOW), cooking.queueCook('bone-broth')]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.deepEqual(await cooking.ingredients(), { marrow: 0, salt: 0 });
  await reset({ ingredients: { marrow: 10, salt: 5 } });
  await cooking.startCook('bone-broth', NOW);
  assert.equal((await cooking.startCook('bone-broth', NOW)).reason, 'busy');
  await cooking.queueCook('bone-broth'); await cooking.queueCook('bone-broth');
  assert.equal((await cooking.queueCook('bone-broth')).reason, 'full');
  assert.deepEqual(await cooking.ingredients(), { marrow: 4, salt: 2 });
});

await check('CONTROL separate module Eats target one dish and sequential Eats retain both buffs', async () => {
  const other = await import('../js/cooking.js?kitchen-delivery-context');
  await reset({ pantry: [dish('marrow-stew'), dish('necro-feast')] });
  const results = await Promise.all([cooking.activatePantryDish(0, NOW), other.activatePantryDish(0, NOW)]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.deepEqual(ids(await cooking.pantryDishes()), ['necro-feast']);
  await cooking.activatePantryDish(0, NOW);
  assert.deepEqual(ids(await cooking.foodBuffs()), ['marrow-stew', 'necro-feast']);
  assert.deepEqual(await cooking.pantryDishes(), []);
});

await check('F11 partial unsupported pantry entry is retained', async () => {
  const item = { recipeId: 'retired-dish', name: 'Retired dish', cookedAt: NOW };
  await reset({ pantry: [item] });
  assert.equal(await cooking.activatePantryDish(0, NOW), null);
  const pantry = await cooking.pantryDishes();
  requireState(JSON.stringify(pantry) === JSON.stringify([item]), `pantry=${pantry.length}, buffs=${(await cooking.foodBuffs()).length}`);
  return 'pantry=1, buffs=0; unsupported UI disclosure remains out of scope';
});

await check('CONTROL missing ingredients and unknown recipes refuse without spending', async () => {
  await reset();
  for (const method of [cooking.startCook, cooking.queueCook]) {
    assert.equal((await method('bone-broth')).reason, 'ingredients');
    assert.equal((await method('retired-dish')).reason, 'unknown');
  }
  assert.deepEqual(await cooking.ingredients(), {});
});

console.log(`KITCHEN DELIVERY: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
