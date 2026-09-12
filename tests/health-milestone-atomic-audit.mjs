/* PURE: production game/db over mem-idb. Failure means a claim survives without
 * its full reward, an aborted claim pays anything, or a replay changes state.
 * Proven red on main cb2aca568cf53661d5f9bd584831f618feda3cd7: 53 failures,
 * including CRASH commit stepms-2026-09-12-5000 (0 coins, expected 20).
 * Abort runs discard the claim transaction. Commit runs kill later transactions
 * to catch the historical split-write bug, which abort alone cannot detect.
 */
import './mem-idb.mjs';
import assert from 'node:assert/strict';
const fault = { key: null, mode: null, hit: false, dead: false };
const open = indexedDB.open.bind(indexedDB);
indexedDB.open = (...args) => {
  const req = open(...args);
  let success;
  Object.defineProperty(req, 'onsuccess', {
    set(fn) { success = fn; },
    get() { return e => {
      const d = req.result, transaction = d.transaction.bind(d);
      d.transaction = (...args) => {
        const tx = transaction(...args);
        if (fault.dead) { tx.abort(); return tx; }
        const objectStore = tx.objectStore.bind(tx);
        tx.objectStore = name => {
          const store = objectStore(name), add = store.add;
          store.add = row => {
            const r = add(row);
            if (name === 'xp' && row.key === fault.key) {
              let callback;
              Object.defineProperty(r, 'onsuccess', {
                set(fn) { callback = fn; },
                get() { return e => {
                  fault.hit = true;
                  if (fault.mode === 'abort') tx.abort();
                  else fault.dead = true;
                  callback?.(e);
                }; },
              });
            }
            return r;
          };
          return store;
        };
        return tx;
      };
      success(e);
    }; },
  });
  return req;
};
const { db, useDbName, kvGet } = await import('../js/db.js');
let game = await import('../js/game.js');
const date = '2026-09-12';
const payload = { steps: 14000, activeKcal: 1500, exerciseMin: 60, cycleKm: 50,
  workouts: 4, wtypes: ['running', 'walking', 'strength', 'yoga', 'pilates'] };
// Independent shipped amounts, order and caps. Above-cap inputs must add no rows.
const rows = [
  ['hk', 10], ['stepms', 15, 20, '5000'], ['stepms', 15, 30, '8000'],
  ['stepms', 15, 40, '10000'], ['egg', 15, 0, '', 'egg:steps-'],
  ['stepx', 5, 12, '12500'], ['actms', 15, 15, '250'],
  ['actms', 15, 25, '500'], ['actms', 15, 35, '750'],
  ['actcrate', 15, 0, '', 'crate:active-'], ['actx', 5, 10, '1000'],
  ['actx', 5, 8, '1250'], ['actx', 5, 6, '1500'],
  ...[1, 2, 3].map(n => ['wk', 15, 25, String(n)]), ['exring', 20, 20],
  ...[5, 10, 15, 20, 25, 30, 35, 40].map(n => ['cyc', 8, 10, String(n)]),
  ['wtype', 10, 0, 'cardio', 'vigor:workout-cardio-'],
  ['wtype', 10, 0, 'strength', 'xp2:workout-strength-'],
  ['wtype', 10, 0, 'flex', null, 20],
].map(([type, xp, coins = 0, suffix, item, dust = 0]) => ({
  key: `${type}-${date}${suffix ? '-' + suffix : ''}`, xp, coins, item, dust,
}));
const expected = rs => ({
  xp: rs.map(r => [r.key, r.xp]).sort(),
  coins: rs.reduce((n, r) => n + r.coins, 0), coinsRev: rs.reduce((n, r) => n + r.coins, 0),
  dust: rs.reduce((n, r) => n + r.dust, 0), dustRev: rs.reduce((n, r) => n + r.dust, 0),
  inv: rs.filter(r => r.item).map(r => r.item + date).sort(),
});
async function snapshot() {
  const inv = await db.all('inv');
  for (const r of inv) {
    if (r.kind === 'egg') { assert.equal(r.goal, 8000); assert.equal(r.stepsAtStart, 29000); }
    if (r.kind === 'crate') assert.equal(r.crate, 'daily');
  }
  return { xp: (await db.all('xp')).filter(r => !r.key.startsWith('badge-') && r.key !== 'seed').map(r => [r.key, r.xp]).sort(),
    coins: await kvGet('coins', 0), coinsRev: await kvGet('coinsRev', 0),
    dust: await kvGet('bonedust', 0), dustRev: await kvGet('dustRev', 0),
    inv: inv.map(r => `${r.kind}:${r.source}`).sort() };
}
let serial = 0;
async function reload(name) {
  Object.assign(fault, { key: null, mode: null, hit: false, dead: false });
  useDbName(name);
  game = await import(`../js/game.js?health-reload=${++serial}`);
}
async function setup(name) {
  await reload(name);
  // Stay inside a high level: level rewards are a separate work order.
  await db.put('xp', { key: 'seed', xp: 10000000 });
  for (const b of game.BADGES) await db.put('xp', { key: 'badge-' + b.id, xp: 0 });
  await db.put('health', { date, ...payload });
}
let passed = 0, failed = 0;
async function check(label, run) {
  try { await run(); console.log('ok ' + label); passed++; }
  catch (e) { console.log('FAIL ' + label + ': ' + e.message); failed++; }
}
await check('CONTROL full day pays shipped rewards and toast totals', async () => {
  await setup('health-control');
  const r = await game.onHealthSync(date, payload);
  assert.deepEqual(await snapshot(), expected(rows));
  assert.equal(r.xp, rows.reduce((n, r) => n + r.xp, 0));
  assert.equal(r.coins, expected(rows).coins);
  assert.equal(r.egg, true); assert.equal(r.workout, true);
  assert.deepEqual(r.themed, ['Vigor Draught', 'Battle Charm', 'Bone Dust']);
});
for (const mode of ['abort', 'commit']) for (const [i, row] of rows.entries()) {
  await check(`CRASH ${mode} ${row.key}, reload and ONCE`, async () => {
    const name = `health-${mode}-${i}`;
    await setup(name);
    Object.assign(fault, { key: row.key, mode });
    await game.onHealthSync(date, payload).catch(() => {});
    assert.equal(fault.hit, true, 'fault must fire after the XP add succeeds');
    await reload(name);
    assert.deepEqual(await snapshot(), expected(rows.slice(0, i + (mode === 'commit' ? 1 : 0))));
    await game.onHealthSync(date, payload);
    assert.deepEqual(await snapshot(), expected(rows));
    const before = await db.all('inv');
    await reload(name);
    assert.deepEqual(await game.onHealthSync(date, payload),
      { xp: 0, newBadges: [], egg: false, coins: 0, workout: false, themed: [] });
    assert.deepEqual(await snapshot(), expected(rows));
    assert.deepEqual(await db.all('inv'), before);
  });
}
await check('ONCE concurrent identical syncs pay once', async () => {
  await setup('health-concurrent');
  const receipts = await Promise.all([game.onHealthSync(date, payload), game.onHealthSync(date, payload)]);
  assert.deepEqual(await snapshot(), expected(rows));
  assert.equal(receipts.reduce((n, r) => n + r.coins, 0), expected(rows).coins);
});
console.log(`health-milestone-atomic: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
