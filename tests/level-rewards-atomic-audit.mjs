/* PURE: production game/db over mem-idb. Abort after the payment claim is
 * journaled, either at the claim itself or at each subsequent payout write.
 * On split-write main, aborting the first payout leaves the claim committed.
 */
import './mem-idb.mjs';
const fault = { target: null, seen: false, hit: false };
const originalOpen = indexedDB.open.bind(indexedDB);
indexedDB.open = (...args) => {
  const req = originalOpen(...args);
  let success;
  Object.defineProperty(req, 'onsuccess', {
    set(fn) { success = fn; },
    get() { return e => {
      const database = req.result;
      const transaction = database.transaction.bind(database);
      database.transaction = (...args) => {
        const tx = transaction(...args), objectStore = tx.objectStore.bind(tx);
        tx.objectStore = name => {
          const store = objectStore(name);
          for (const op of ['add', 'put']) {
            const write = store[op].bind(store);
            store[op] = row => {
              const result = write(row);
              if (name === 'xp' && row.key === 'levelpaid-25') fault.seen = true;
              if (fault.target && fault.seen && fault.target(name, row)) {
                fault.hit = true; tx.abort();
              }
              return result;
            };
          }
          return store;
        };
        return tx;
      };
      success(e);
    }; },
  });
  return req;
};
const { db, kvGet, kvSet, useDbName } = await import('../js/db.js');
const { grantLevelRewards } = await import('../js/game.js');
let failures = 0;
function check(name, pass, detail = '') {
  console.log(`${pass ? 'ok' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`);
  if (!pass) failures++;
}
async function setup(name) {
  fault.target = null; fault.seen = false; fault.hit = false;
  useDbName('level-atomic-' + name);
  await kvSet('coins', 500); await kvSet('bonedust', 40);
}
async function state() {
  return { paid: !!await db.get('xp', 'levelpaid-25'), coins: await kvGet('coins'),
    dust: await kvGet('bonedust'), coinsRev: await kvGet('coinsRev', 0),
    dustRev: await kvGet('dustRev', 0), inv: await db.all('inv') };
}
function full(s) {
  return s.paid && s.coins === 645 && s.dust === 190 && s.coinsRev === 145 && s.dustRev === 150 &&
    s.inv.length === 4 && ['level-25', 'milestone-25-0', 'milestone-25-1'].every(source =>
      s.inv.filter(r => r.kind === 'crate' && r.crate === 'golden' && r.source === source).length === 1) &&
    s.inv.filter(r => r.kind === 'egg' && r.source === 'milestone-25' && r.goal === 8000 && r.stepsAtStart === 0).length === 1;
}
const targets = [
  ['claim', (s, r) => s === 'xp' && r.key === 'levelpaid-25'],
  ...['coins', 'coinsRev', 'bonedust', 'dustRev'].map(key => [key, (s, r) => s === 'kv' && r.k === key]),
  ...['level-25', 'milestone-25-0', 'milestone-25-1', 'milestone-25'].map(source => [source, (s, r) => s === 'inv' && r.source === source]),
];
for (const [name, target] of targets) {
  await setup(name); fault.target = target;
  let threw = false;
  try { await grantLevelRewards(24, 25); } catch { threw = true; }
  fault.target = null;
  const s = await state();
  check('CRASH ' + name, fault.hit && threw && !s.paid && s.coins === 500 && s.dust === 40 && !s.coinsRev && !s.dustRev && !s.inv.length,
    `injected=${fault.hit}, paid=${s.paid}, coins=${s.coins}, dust=${s.dust}, items=${s.inv.length}`);
  await grantLevelRewards(24, 25);
  check('RETRY ' + name, full(await state()));
  const before = JSON.stringify(await state());
  const again = await grantLevelRewards(24, 25);
  check('ONCE ' + name, JSON.stringify(await state()) === before && again.coins === 0 && again.crates === 0 && again.dust === 0 && again.eggs === 0 && again.milestone === null);
}
await setup('control');
const receipt = await grantLevelRewards(24, 25);
check('CONTROL level 25', full(await state()) && receipt.coins === 145 && receipt.crates === 3 && receipt.dust === 150 && receipt.eggs === 1 && receipt.milestone.level === 25);
await setup('race');
const both = await Promise.all([grantLevelRewards(24, 25), grantLevelRewards(24, 25)]);
check('ONCE concurrent', full(await state()) && both.filter(r => r.coins === 145).length === 1);
await setup('legacy');
await db.put('xp', { key: 'levelup-25', type: 'levelup', xp: 0, claimed: true });
await grantLevelRewards(24, 25);
const legacy = await state();
check('CONTROL legacy paid flag', !legacy.paid && legacy.coins === 500 && legacy.dust === 40 && !legacy.inv.length);
console.log(`level-rewards-atomic: ${failures ? failures + ' failed' : 'all clean'}`);
process.exitCode = failures ? 1 : 0;
