// L2: independent offline earnings, replay, spending, shared receipts and atomic
// import. CONTROL rows require real payouts and real encrypted backup writes.
// Prove red: run this unchanged with the pre-L2 js/db.js on a throwaway tree.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import * as D from '../js/db.js';
import * as L from '../js/loot.js';
import { backupScenarios } from './lib/l2-scenarios.mjs';
const document = globalThis.document = new EventTarget();
document.hidden = false;
document.visibilityState = 'visible';
globalThis.window = new EventTarget();
const S = await import('../js/social.js?l2-lifecycle');
let passed = 0, failed = 0, seq = 0;
async function check(name, fn) {
  try { await fn(assert); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
const merge = blob => D.importAll(blob, { replace: false });
const state = async () => { const { exportedAt, ...data } = await D.exportAll(); return data; };
async function fork() {
  const name = `l2-core-${++seq}`;
  D.useDbName(name);
  await L.coinsAdd(1000); await L.boneDustAdd(500);
  return { name, base: await D.exportAll() };
}
for (const reverse of [false, true]) await check(`MERGE ${reverse}: 300 and 700 credits plus debits survive repeated exchange`, async () => {
  const { name, base } = await fork();
  await L.coinsAdd(300); await L.spendCoins(90); await L.boneDustAdd(30); await L.spendDust(9);
  const a = await D.exportAll();
  D.useDbName(`${name}-b`); await D.importAll(base);
  await L.coinsAdd(700); await L.spendCoins(110); await L.boneDustAdd(70); await L.spendDust(11);
  const b = await D.exportAll();
  if (reverse) { D.useDbName(name); await merge(b); } else await merge(a);
  assert.equal(await D.kvGet('coins'), 1800, 'both earned deltas and both spends counted exactly once');
  assert.equal(await D.kvGet('bonedust'), 580);
  const union = await D.exportAll();
  for (const stale of [a, b, base, union, union]) await merge(stale);
  assert.equal(await D.kvGet('coins'), 1800, 'stale and duplicate imports cannot refund spends');
  await D.importAll(base);
  assert.equal(await D.kvGet('coins'), 1000, 'CONTROL explicit replace still rolls back');
});
await check('CLAIM and TAKE: shared authority receipts deduplicate offline payout', async () => {
  const { name, base } = await fork();
  const pay = { kv: { coins: cur => cur + 300, coinsRev: cur => cur + 300 } };
  const award = async () => {
    assert.equal(await D.claimAndPay('xp', { key: 'same-reward', xp: 10 }, pay), true);
    await D.db.put('inv', { id: 'shared-crate' });
    assert.ok(await D.takeAndPay('inv', 'shared-crate', pay));
  };
  await award(); const a = await D.exportAll();
  D.useDbName(`${name}-b`); await D.importAll(base); await award();
  await merge(a);
  assert.equal(await D.kvGet('coins'), 1600, 'two authorities pay once each across devices');
  assert.equal((await D.db.all('inv')).length, 0);
});
await check('ATOMIC payout records and import lock retain concurrent earnings', async () => {
  const { base } = await fork();
  await Promise.all([merge(base), L.coinsAdd(300), merge(base), L.coinsAdd(700)]);
  assert.equal(await D.kvGet('coins'), 2000);
  const before = await state();
  await assert.rejects(D.payAtomic({ kv: { coins: cur => cur + 300, coinsRev: cur => cur + 300,
    refuse: () => { throw new Error('refuse-test'); } } }), /refuse-test/);
  assert.deepEqual(await state(), before, 'CONTROL aborted reward leaves no history or balance');
});
await check('LEGACY export establishes a shared baseline before offline earning', async () => {
  D.useDbName(`l2-legacy-${++seq}`);
  await D.kvSet('coins', 1000); await D.kvSet('coinsRev', 1000);
  const base = await D.exportAll();
  await L.coinsAdd(300); const a = await D.exportAll();
  D.useDbName(`l2-legacy-b-${seq}`); await D.importAll(base); await L.coinsAdd(700);
  await merge(a); assert.equal(await D.kvGet('coins'), 2000);
});
await check('HISTORY incompatible, malformed and partial snapshots refuse without mutation', async () => {
  const { base } = await fork();
  const before = await state();
  for (const corrupt of [
    rows => { rows.find(r => r.k === 'coinsHistory').v.format = 99; },
    rows => { rows.find(r => r.k === 'coins').v += 1; },
    rows => { rows.find(r => r.k === 'coinsHistory').v.id = 'different-opening'; },
    rows => { rows.splice(rows.findIndex(r => r.k === 'coins'), 1); },
  ]) {
    const bad = structuredClone(base);
    if (!bad.kv.some(r => r.k === 'coinsHistory')) bad.kv.push({ k: 'coinsHistory', v: { format: 1, id: 'test', balance: 1000, revision: 1000, ops: {} } });
    corrupt(bad.kv);
    await assert.rejects(merge(bad), /history/);
    assert.deepEqual(await state(), before);
  }
  await assert.rejects(merge({ app: 'tally', log: [], kv: [{ k: 'coins', v: 1234 }, { k: 'coinsRev', v: 1234 }] }), /history/);
  assert.deepEqual(await state(), before);
  await merge({ app: 'tally', log: [], kv: [{ k: 'coinsRev', v: 999999 }] });
  assert.equal(await D.kvGet('coinsRev'), 1000, 'revision without balance cannot poison ordering');
});
for (const method of ['claimAndPay', 'payAtomic', 'kvUpdate', 'kvUpdateMulti']) await check(`WRITER ${method}: independent offline credits join the same history`, async () => {
  const { name, base } = await fork();
  const earn = async (amount, id) => {
    const kv = { coins: cur => cur + amount, coinsRev: cur => cur + amount };
    if (method === 'claimAndPay') return D.claimAndPay('xp', { key: id, xp: 1 }, { kv });
    if (method === 'payAtomic') return D.payAtomic({ kv });
    if (method === 'kvUpdateMulti') return D.kvUpdateMulti(kv);
    await D.kvUpdate('coins', kv.coins); await D.kvUpdate('coinsRev', kv.coinsRev);
  };
  await earn(300, 'a'); const a = await D.exportAll();
  D.useDbName(`${name}-b`); await D.importAll(base); await earn(700, 'b');
  await merge(a); assert.equal(await D.kvGet('coins'), 2000);
});
await check('IMPORT BOUNDARY: payout queued at the local read survives the write', async () => {
  const realOpen = indexedDB.open;
  let armed = false, intercepted = 0, payout;
  indexedDB.open = function (...args) {
    const req = realOpen.apply(this, args);
    Object.defineProperty(req, 'onsuccess', { set(callback) {
      this._success = event => {
        const connection = req.result, transaction = connection.transaction.bind(connection);
        connection.transaction = (...txArgs) => {
          const tx = transaction(...txArgs), objectStore = tx.objectStore.bind(tx);
          tx.objectStore = store => {
            const os = objectStore(store);
            if (store === 'kv') {
              const getAll = os.getAll.bind(os);
              os.getAll = () => {
                const read = getAll();
                Object.defineProperty(read, 'onsuccess', { set(fn) { this._success = event => {
                  if (armed) { armed = false; intercepted++; payout = L.coinsAdd(300); }
                  fn(event);
                }; }, get() { return this._success; } });
                read.onsuccess = () => {}; // old db.all reads result on tx completion, without a request handler
                return read;
              };
            }
            return os;
          };
          return tx;
        };
        callback(event);
      };
    }, get() { return this._success; } });
    return req;
  };
  try {
    const { base } = await fork();
    armed = true;
    await merge(base); await payout;
    assert.equal(intercepted, 1, 'CONTROL actual local kv read intercepted once');
    assert.equal(await D.kvGet('coins'), 1300, 'import overwrote an earning queued at its local read');
  } finally { indexedDB.open = realOpen; }
});
await check('OVERSPEND: incompatible offline debits refuse atomically', async () => {
  const { name, base } = await fork();
  await L.spendCoins(800); const a = await D.exportAll();
  D.useDbName(`${name}-b`); await D.importAll(base); await L.spendCoins(800);
  const before = await state();
  await assert.rejects(merge(a), /history/);
  assert.deepEqual(await state(), before);
});
await check('EXPORT: an untracked balance edit cannot publish mismatched history', async () => {
  await fork();
  await D.kvSet('coins', 1234); // deliberate corruption, unlike production writers
  await assert.rejects(D.exportAll(), /history/);
  assert.equal(await D.kvGet('coins'), 1234, 'refusal preserves the original data');
});
await backupScenarios({ D, L, S, check, hidden() {
  document.hidden = true; document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
} });
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
