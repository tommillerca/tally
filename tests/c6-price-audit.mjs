/* Frozen C6 beta correction. Real purchase, hatch, refund and save transactions
   over the shared IndexedDB harness. See docs/reviews/fix-c6-price.md for reds
   and mutation controls. No analytics, network, browser or production data. */
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as D from '../js/db.js';
import * as L from '../js/loot.js';
import { PET_SHOP } from '../data/boneheadz.js';

let passed = 0, failed = 0, seq = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
async function fresh() {
  const name = `c6-price-${++seq}`;
  D.useDbName(name);
  await D.kvSet('coins', 60000);
  await D.kvSet('petInst', []);
  await D.kvSet('petLvlV', 2);
  return name;
}
async function oldBuyer() {
  const name = await fresh();
  const current = PET_SHOP.pet.coin;
  let purchase;
  // Exercise the production purchase at the historical catalogue price.
  try { PET_SHOP.pet.coin = 50000; purchase = await L.buyPetItem('C6'); }
  finally { PET_SHOP.pet.coin = current; }
  assert.equal(purchase.ok, true);
  assert.equal(purchase.cost, 50000);
  assert.equal(await L.coins(), 10000);
  assert.equal((await D.kvGet('petbuy:C6')).price, 50000);
  const [pet] = await L.petInstances();
  assert.equal(pet.sp, 'C6');
  await D.kvSet('petLvlSteps', { [pet.iid]: 123456 });
  await D.kvSet('petNick', { [pet.iid]: 'Honey' });
  await D.kvSet('petBonds', { [pet.iid]: 3 });
  return name;
}
async function progress() {
  return { inv: await D.db.all('inv'), kv: (await D.db.all('kv'))
    .filter(r => !['coins', 'coinsRev', 'coinsHistory'].includes(r.k)) };
}
const refund = () => L.refundC6BetaPrice();

await check('PAID: real 50,000 purchase returns exactly 45,000 and preserves all progress', async () => {
  await oldBuyer();
  const before = await progress(), rev = await D.kvGet('coinsRev');
  assert.equal(await refund(), 45000);
  assert.equal(await L.coins(), 55000);
  assert.equal(await D.kvGet('coinsRev'), rev + 45000);
  assert.deepEqual(await progress(), before);
});
await check('REPLAY: ten retries and a reopened database grant nothing', async () => {
  const name = await oldBuyer();
  assert.equal(await refund(), 45000);
  for (let i = 0; i < 10; i++) assert.equal(await refund(), 0);
  D.useDbName(name);
  assert.equal(await refund(), 0);
  assert.equal(await L.coins(), 55000);
});
await check('HATCH: a real free C6 hatch has no paid entitlement', async () => {
  await fresh();
  const egg = await L.grantEgg('audit', 0);
  const random = crypto.getRandomValues;
  // C6 is first in the ordinary egg pool. 0.1 is above the shiny threshold.
  let hatch;
  try {
    crypto.getRandomValues = a => { a[0] = Math.floor(0.1 * 0xffffffff); return a; };
    hatch = await L.hatchEgg(egg.id);
  } finally { crypto.getRandomValues = random; }
  assert.equal(hatch.ready, true);
  assert.equal(hatch.item.id, 'C6');
  const before = await progress();
  assert.equal(await D.kvGet('petbuy:C6'), null);
  assert.equal(await refund(), 0);
  assert.equal(await L.coins(), 60000);
  assert.deepEqual(await progress(), before);
});
await check('NEW: real purchase charges 5,000 and receives no correction', async () => {
  await fresh();
  const result = await L.buyPetItem('C6');
  assert.equal(result.ok, true);
  assert.equal(result.cost, 5000);
  assert.equal(await L.coins(), 55000);
  assert.equal((await D.kvGet('petbuy:C6')).price, 5000);
  assert.equal((await L.petInstances())[0].sp, 'C6');
  assert.equal(await refund(), 0);
});
await check('RACE: three simultaneous corrections pay once', async () => {
  await oldBuyer();
  assert.deepEqual((await Promise.all([refund(), refund(), refund()])).sort((a,b) => a-b), [0, 0, 45000]);
  assert.equal(await L.coins(), 55000);
});
await check('ABORT: failed credit burns no entitlement and can retry', async () => {
  await oldBuyer();
  const open = indexedDB.open;
  let injected = false;
  indexedDB.open = (...args) => {
    const req = open(...args);
    const handler = Object.getOwnPropertyDescriptor(req, 'onsuccess');
    // The harness uses an ordinary callback property, just as a native request.
    assert.equal(handler?.set, undefined);
    let success;
    Object.defineProperty(req, 'onsuccess', { set(fn) { success = fn; }, get() {
      return event => {
        const db = req.result, transaction = db.transaction;
        db.transaction = (...scope) => {
          const tx = transaction(...scope), objectStore = tx.objectStore;
          tx.objectStore = name => {
            const store = objectStore(name), put = store.put;
            store.put = row => {
              if (!injected && name === 'kv' && row.k === 'coins') {
                injected = true;
                throw new Error('injected refund write failure');
              }
              return put(row);
            };
            return store;
          };
          return tx;
        };
        success?.(event);
      };
    } });
    return req;
  };
  // Reopen so the injected storage boundary wraps the real refund transaction.
  try {
    D.useDbName(`c6-price-${seq}`);
    await assert.rejects(refund(), /injected refund write failure/);
  } finally { indexedDB.open = open; }
  assert.equal(injected, true);
  assert.equal(await L.coins(), 10000);
  assert.equal(await refund(), 45000);
  assert.equal(await refund(), 0);
});
await check('MERGE: two offline copies settle the same refund without adding it twice', async () => {
  const name = await oldBuyer();
  const before = await D.exportAll();
  assert.equal(await refund(), 45000);
  const settled = await D.exportAll();
  D.useDbName(`c6-price-remote-${seq}`);
  await D.importAll(before, { replace: true });
  assert.equal(await refund(), 45000);
  await D.importAll(settled, { replace: false });
  assert.equal(await L.coins(), 55000);
  assert.equal(await refund(), 0);
  D.useDbName(name);
  await D.importAll(before, { replace: false });
  assert.equal(await refund(), 0);
  assert.equal(await L.coins(), 55000);
});
await check('EVIDENCE: missing, unpriced and other-price receipts cannot authorize a refund', async () => {
  for (const receipt of [null, true, { price: 5000 }, { price: 49999 }, { price: '50000' }]) {
    await oldBuyer();
    await D.kvSet('petbuy:C6', receipt);
    assert.equal(await refund(), 0);
    assert.equal(await L.coins(), 10000);
  }
});
await check('LEGACY: priced receipts predating currency history settle without changing the pet', async () => {
  await oldBuyer();
  await D.db.del('kv', 'coinsHistory');
  const before = await progress();
  assert.equal(await refund(), 45000);
  assert.equal(await refund(), 0);
  assert.equal(await L.coins(), 55000);
  assert.deepEqual(await progress(), before);
});
await check('RESTORE: a full rollback restores the old balance and cannot accumulate refunds', async () => {
  await oldBuyer();
  const before = await D.exportAll();
  assert.equal(await refund(), 45000);
  const settled = await D.exportAll();
  await D.importAll(before, { replace: true });
  assert.equal(await L.coins(), 10000);
  assert.equal(await refund(), 45000);
  assert.equal(await L.coins(), 55000);
  await D.importAll(settled, { replace: true });
  assert.equal(await refund(), 0);
  assert.equal(await L.coins(), 55000);
});
await check('BOOT: shipped boot call pays and discloses the one-off correction', async () => {
  await oldBuyer();
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const body = app.split('// C6 BETA CORRECTION BEGIN')[1]?.split('// C6 BETA CORRECTION END')[0];
  assert.ok(body, 'boot must invoke the correction');
  const messages = [];
  const context = vm.createContext({ refundC6BetaPrice: L.refundC6BetaPrice,
    toast: text => messages.push(text), setTimeout: fn => fn() });
  await vm.runInContext(`(async () => { ${body} })()`, context);
  assert.equal(await L.coins(), 55000);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /45,000/);
  assert.match(messages[0], /one-off beta correction/i);
  await vm.runInContext(`(async () => { ${body} })()`, context);
  assert.equal(messages.length, 1);
});

console.log(`\nC6 price audit: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
