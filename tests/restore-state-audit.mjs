// P3 restore boundary and end-of-chain guards. CONTROL uses real db/loot exports.
// Node-only storage harness. Every fixed defect is rerun on a throwaway pre-fix tree.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { db, kvGet, kvSet, importAll, exportAll, useDbName, STORES } from '../js/db.js';
import * as loot from '../js/loot.js';
import { BH_SLOTS } from '../data/boneheadz.js';
import { GEAR_ITEMS } from '../js/gear.js';
let passed = 0, failed = 0, seq = 0;
const blob = kv => ({ app: 'tally', version: 3, log: [], kv });
const rows = obj => Object.entries(obj).map(([k, v]) => ({ k, v }));
const state = async () => Promise.all(STORES.map(s => db.all(s)));
async function test(name, fn) {
  useDbName(`p3-restore-${++seq}`);
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
for (const [k, v] of Object.entries({ paidlooks: {}, equipped: 'SK0-1', petInst: {}, coins: '900', grantCursor: 'tomorrow', pettalents: [] })) {
  await test(`TYPE ${k} refuses before any store changes`, async () => {
    await kvSet('coins', 17);
    await db.put('log', { id: 'keep' });
    const before = await state();
    await assert.rejects(importAll(blob(rows({ [k]: v }))), /damaged|unsupported|update/i,
      `accepted ${k}=${JSON.stringify(v)}`);
    assert.deepEqual(await state(), before);
  });
}
await test('DUPLICATE kv keys cannot bypass revision selection', async () => {
  await kvSet('coins', 100); await kvSet('coinsRev', 10);
  await assert.rejects(importAll(blob([{ k: 'coins', v: 100 }, { k: 'coinsRev', v: 10 },
    { k: 'coins', v: 1 }]), { replace: false }), /duplicate|damaged/i, 'duplicate coins accepted');
  assert.equal(await loot.coins(), 100);
});
await test('NULL declared store refuses rather than silently skipping', async () => {
  await assert.rejects(importAll({ ...blob([]), inv: null }), /damaged/i, 'inv:null accepted as omitted');
});
await test('FUTURE level-bank format refuses without downgrading data', async () => {
  await kvSet('coins', 17); const before = await state();
  await assert.rejects(importAll(blob(rows({ petLvlV: 3, petLvlSteps: { future: { points: 20 } } }))), /newer|update/i,
    'future level format accepted');
  assert.deepEqual(await state(), before);
});
await test('FUTURE talent-bank format refuses without downgrading data', async () => {
  await assert.rejects(importAll(blob(rows({ pettalents: { __iidV: 3, future: { picks: ['new'] } } }))), /newer|update/i,
    'future talent format accepted');
});
await test('CONTROL unknown kv values survive import and export byte-for-byte', async () => {
  const future = { k: 'future-bank', v: { version: 91, earned: [null, { id: 'X9' }] } };
  await importAll(blob([future]));
  assert.deepEqual((await exportAll()).kv.find(r => r.k === future.k), future);
});
for (const k of ['paidlooks', 'looks', 'redeemed', 'grantsSeen']) {
  await test(`STALE ${k} merge retains both devices receipts`, async () => {
    await kvSet(k, ['local-earned']);
    await importAll(blob(rows({ [k]: ['remote-earned'] })), { replace: false });
    assert.deepEqual(await kvGet(k), ['local-earned', 'remote-earned'], `${k} lost local-earned`);
    if (k === 'paidlooks') assert((await loot.paidLooks()).has('local-earned'));
    await importAll(blob(rows({ [k]: ['remote-earned'] })), { replace: false });
    assert.equal((await kvGet(k)).length, 2);
    await importAll(blob(rows({ [k]: ['archived'] })));
    assert.deepEqual(await kvGet(k), ['archived'], 'explicit rollback remains payload-wins');
  });
}
await test('UNRESOLVED equipped art is hidden with slot defaults and no storage loss', async () => {
  const saved = { SK: 'FUTURE-SKULL', H: 'SK0-1', C: 'C99', FUTURE: { earned: true } };
  await importAll(blob(rows({ equipped: saved })));
  const eq = await loot.equipped();
  assert.equal(eq.SK, BH_SLOTS.find(s => s.code === 'SK').default, `unresolved SK=${eq.SK}`);
  assert.equal(eq.H, undefined, 'wrong-slot art rendered');
  assert.equal(eq.C, undefined);
  assert.deepEqual(await kvGet('equipped'), saved);
  await loot.equip('H', null);
  const after = await kvGet('equipped');
  assert.equal(after.SK, saved.SK); assert.equal(after.C, saved.C); assert.deepEqual(after.FUTURE, saved.FUTURE);
});
await test('UNRESOLVED transmog cannot display art in the wrong slot', async () => {
  await importAll(blob(rows({ equipped: { H: 'H0-1' }, transmog: { H: 'SK0-1' } })));
  const eq = await loot.equipped();
  assert.notEqual(eq.H, 'SK0-1', 'skull art returned for hat slot');
  assert.equal((await kvGet('transmog')).H, 'SK0-1');
});
await test('FUTURE equipped instance stays selected in storage when opened', async () => {
  const pet = { iid: 'future', sp: 'C99', earned: { level: 50 } };
  await importAll(blob(rows({ petInst: [pet], petEquipped: 'future', equipped: { C: 'C99' } })));
  assert.equal(await loot.equippedPetInstance(), null);
  assert.equal(await kvGet('petEquipped'), 'future', 'opening erased future equipped iid');
  assert.deepEqual(await kvGet('petInst'), [pet]);
  assert.deepEqual((await exportAll()).kv.find(r => r.k === 'equipped').v, { C: 'C99' });
});
await test('FUTURE equipment survives a cosmetic equip', async () => {
  await kvSet('equipped', { C: 'C99' });
  await loot.equip('H', null);
  assert.equal((await kvGet('equipped')).C, 'C99', 'cosmetic equip erased future pet');
});
await test('FUTURE equipment survives a known gear equip', async () => {
  const gear = GEAR_ITEMS.find(g => g.minLevel <= 1 && g.slot !== 'SK');
  assert(gear, 'CONTROL starter gear exists');
  await db.put('inv', { id: 'owned-gear', kind: 'gear', gearId: gear.id });
  await kvSet('equipped', { SK: 'FUTURE-SKULL', C: 'C99' });
  await loot.equipGear(gear.slot, gear.id);
  assert.equal((await kvGet('equipped')).C, 'C99', 'gear equip erased future pet');
  assert.equal((await loot.gearLoadout())[gear.slot], gear.id);
});
await test('FUTURE equipment survives a known pet slot repair', async () => {
  await kvSet('equipped', { SK: 'FUTURE-SKULL' });
  await kvSet('petInst', [{ iid: 'known', sp: 'C1', lineage: 0, shiny: false }]);
  await kvSet('petEquipped', 'known');
  assert.equal(await loot.equippedPetIid(), 'known');
  assert.equal((await kvGet('equipped')).C, 'C1');
  assert.equal((await kvGet('equipped')).SK, 'FUTURE-SKULL', 'pet repair erased future skull');
});
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
