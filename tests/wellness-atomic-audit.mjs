// PURE: production wellness and db over mem-idb. Abort the transaction that
// journals each completion/reward boundary. A retained claim is a failure.
import './mem-idb.mjs';
let fault = null, hit = false;
const realOpen = indexedDB.open.bind(indexedDB);
indexedDB.open = (...args) => {
  const req = realOpen(...args);
  let success;
  Object.defineProperty(req, 'onsuccess', {
    set(fn) { success = fn; },
    get() { return e => {
      const database = req.result, transaction = database.transaction.bind(database);
      database.transaction = (...args) => {
        const tx = transaction(...args), objectStore = tx.objectStore.bind(tx);
        tx.objectStore = name => {
          const store = objectStore(name);
          for (const op of ['put', 'add']) {
            const write = store[op];
            store[op] = value => {
              const r = write(value);
              if (fault?.(name, value)) {
                hit = true;
                if (op === 'put') tx.abort();
                else {
                  let callback;
                  Object.defineProperty(r, 'onsuccess', {
                    set(fn) { callback = fn; },
                    get() { return e => { tx.abort(); callback?.(e); }; },
                  });
                }
              }
              return r;
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
const { db, kvSet, kvGet, useDbName } = await import('../js/db.js');
const { dateKey } = await import('../js/nutrition.js');
const wellness = await import('../js/wellness.js');
const day = dateKey();
let fails = 0, checks = 0, serial = 0;
function check(name, condition) {
  checks++; if (!condition) fails++;
  console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`);
}
const xpTotal = async () => (await db.all('xp')).filter(r => r.type === 'wellness').reduce((n, r) => n + r.xp, 0);
async function setup(kind) {
  useDbName(`wellness-atomic-${serial++}`);
  await kvSet('pitEnergy', { date: day, vigor: 3, freeUsed: 1 });
  await kvSet('wellness', { date: day, water: 7, bed: false, sleep: false, sleepHours: null });
  await db.put('health', { date: day, steps: 4321, sleepHours: 6, untouched: true,
    ...(kind === 'walk' ? { manualWalks: [{ min: 20, source: 'manual', at: 1 }] } : {}) });
}
const cases = [
  { kind: 'water', amount: 8, run: () => wellness.addWater(1, day) },
  { kind: 'bed', amount: 5, run: () => wellness.markBed(day) },
  { kind: 'sleep', amount: 10, run: () => wellness.markSleep(8, day) },
  // The second walk is the identical-retry case: the first and second walks
  // are intentionally distinct paid actions under the unchanged two/day rule.
  { kind: 'walk', amount: 10, run: () => wellness.logManualWalk(30, day) },
];
async function snapshot() {
  return JSON.stringify([await kvGet('wellness'), await db.get('health', day),
    await db.all('xp'), await kvGet('pitEnergy')]);
}
async function paid(c) {
  const w = await kvGet('wellness'), h = await db.get('health', day), energy = await kvGet('pitEnergy');
  return await xpTotal() === c.amount && h.steps === 4321 && h.untouched && energy.freeUsed === 1 &&
    energy.vigor === (c.kind === 'walk' ? 4 : 3) &&
    (c.kind === 'water' ? w.water === 8 : c.kind === 'bed' ? w.bed :
      c.kind === 'sleep' ? w.sleepHours === 8 && h.sleepHours === 8 && h.sleepMin === 480 && h.sleepManual && !h.sleepAuto && h.sleepDeepMin === null : h.manualWalks.length === 2);
}
for (const c of cases) {
  for (const seam of c.kind === 'walk' ? ['completion', 'xp', 'vigor'] : c.kind === 'sleep' ? ['completion', 'health', 'xp'] : ['completion', 'xp']) {
    await setup(c.kind);
    const before = await snapshot();
    hit = false;
    fault = (store, row) => seam === 'xp' ? store === 'xp' && row.type === 'wellness'
      : seam === 'vigor' ? store === 'kv' && row.k === 'pitEnergy'
      : seam === 'health' || c.kind === 'walk' ? store === 'health'
      : store === 'kv' && row.k === 'wellness';
    let rejected = false;
    try { await c.run(); } catch { rejected = true; }
    fault = null;
    // Reopen the same durable database, discarding the connection.
    const name = `wellness-atomic-${serial - 1}`; useDbName(name);
    check(`CRASH ${c.kind}/${seam}: aborted, no claim and no payout`, hit && rejected && await snapshot() === before);
    await c.run();
    check(`RETRY ${c.kind}/${seam}: pays exactly once`, await paid(c));
    const after = await snapshot();
    const repeat = await c.run();
    check(`ONCE ${c.kind}/${seam}: identical repeat pays nothing`, !(repeat.xp > 0) && await snapshot() === after);
  }
  await setup(c.kind);
  const r = await c.run();
  check(`CONTROL ${c.kind}: original ${c.amount} XP and complete state`, r.xp === c.amount && await paid(c));
}
await setup('bed');
await Promise.all([wellness.addWater(1, day), wellness.markBed(day), wellness.markSleep(8, day)]);
check('CONTROL concurrent habits preserve every completion', await xpTotal() === 23 && (await kvGet('wellness')).water === 8 && (await kvGet('wellness')).bed && (await kvGet('wellness')).sleepHours === 8);
await setup('water');
const walks = await Promise.all(Array.from({ length: 5 }, () => wellness.logManualWalk(30, day)));
check('CONTROL concurrent walks retain two/day and verified steps', walks.filter(r => r.ok).length === 2 && await xpTotal() === 20 && (await kvGet('pitEnergy')).vigor === 5 && (await db.get('health', day)).steps === 4321);
await setup('water');
await kvSet('pitEnergy', { date: day, vigor: 12 });
await wellness.logManualWalk(30, day);
check('CONTROL Vigor stays capped at 12', (await kvGet('pitEnergy')).vigor === 12);
console.log(`wellness-atomic: ${checks - fails} passed, ${fails} failed`);
process.exitCode = fails ? 1 : 0;
