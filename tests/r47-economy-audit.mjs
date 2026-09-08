// Node-only guards. Uses the repository's transactional in-memory IDB, no sockets.
import '../tests/mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { db, kvSet, kvGet, useDbName, importAll } from '../js/db.js';
import * as sp from '../js/spires.js';
import * as social from '../js/social.js';
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../server/src/index.js', import.meta.url), 'utf8');
const DAY = 86400000, now = Date.now();
const tower = { id: 'sp-1-1', name: 'Audit tower', level: 6, claimedAt: now - 2 * DAY, tendedAt: now };
const record = { ...tower, collectedAt: now - DAY - 1000, meta: { name: tower.name } };
let rows = [tower], offline = false, clockError = false;
globalThis.fetch = async url => {
  if (offline) throw new Error('offline');
  if (String(url).includes('/spires/mine')) return {
    ok: !clockError, status: clockError ? 401 : 200,
    json: async () => clockError ? { error: 'stale timestamp' } : { spires: rows, serverNow: now },
  };
  return { ok: true, status: 200, json: async () => ({ grants: [], cursor: 500 }) };
};
async function setup(name) {
  useDbName(`r47-${name}`);
  await kvSet('social', { playerId: 'audit', onlineAt: now });
  await kvSet('spires', { [tower.id]: record });
  offline = false; clockError = false; rows = [tower];
}
let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`PASS ${name}`); }
  catch (e) { fail++; console.error(`FAIL ${name}: ${e.message.slice(0, 600)}`); }
}
await test('takeover removes measured 90 coins / 12 Bone Dust and Boon', async () => {
  await setup('takeover');
  await sp.syncSieges(rows);
  const paying = sp.readSpire(await sp.spireState(), tower, now);
  assert.equal(paying.tribute.coins, 90); assert.equal(paying.tribute.dust, 12);
  assert.equal((await sp.keepersBoon()).spires, 1);
  rows = []; await sp.syncSieges(rows);
  offline = true;
  const paid = await sp.collectTribute(tower.id);
  assert.equal(paid.coins || 0, 0, 'lost tower still pays 90 coins');
  assert.equal(paid.dust || 0, 0, 'lost tower still pays 12 Bone Dust');
  assert.equal(await sp.keepersBoon(), null, 'lost tower still grants Boon');
});
await test('offline re-fight stays pending, reconnect cannot mint a rival tower', async () => {
  await setup('pending'); rows = []; await sp.syncSieges(rows); offline = true;
  await sp.claimSpire(tower, now - DAY - 1000);
  const view = sp.readSpire(await sp.spireState(), tower, now);
  assert.equal(view.held, false, 'offline re-fight recreated ownership');
  assert.equal(view.pending, true);
  assert.equal((await sp.collectTribute(tower.id)).coins || 0, 0);
  offline = false; await sp.syncSieges(await social.fetchMySpires());
  assert.equal(await sp.keepersBoon(), null);
  assert.equal((await sp.collectTribute(tower.id)).dust || 0, 0);
});
await test('stale file restore and advanced grant cursor cannot resurrect 90 / 12 income', async () => {
  await setup('restore'); rows = []; await sp.syncSieges(rows);
  await kvSet('grantCursor', 999);
  await importAll({ app: 'tally', log: [], kv: [{ k: 'spires', v: { [tower.id]: record } }] }, { replace: false });
  offline = true;
  assert.equal((await sp.collectTribute(tower.id)).coins || 0, 0, 'restored loser pays 90');
  assert.equal(await sp.keepersBoon(), null);
  offline = false; await sp.syncSieges(await social.fetchMySpires());
  assert.equal((await sp.spireState())[tower.id], undefined);
});
await test('empty successful snapshot differs from offline and skew is reported', async () => {
  await setup('offline'); offline = true;
  assert.equal(await social.fetchMySpires(), null);
  assert.ok((await sp.spireState())[tower.id], 'offline erased the stored claim');
  offline = false; rows = [];
  assert.deepEqual(await social.fetchMySpires(), []);
  clockError = true;
  assert.equal(await social.fetchMySpires(), null);
  assert.equal((await kvGet('spireFail')).reason, 'clock', 'clock error was hidden');
});
await test('tending a tower requires a real owner transition', async () => {
  await setup('tend');
  assert.equal(await social.tendSpireRemote(tower.id), false, 'HTTP 200 with no changed tower is not a successful tend');
});
await test('48 hour siege uses server clock and stops paying at zero', async () => {
  await setup('clock');
  assert.equal(typeof sp.setSpireClock, 'function', 'no server clock');
  const mine = worker.slice(worker.indexOf("if (path === '/spires/mine'"), worker.indexOf('// Break a siege.'));
  assert.ok(/serverNow: now/.test(mine), 'ownership response omitted server clock');
  sp.setSpireClock(now);
  const oldNow = Date.now;
  Date.now = () => now - 4 * 60000;
  try {
    await sp.syncSieges([{ ...tower, siegeUntil: now + 48 * 3600000 }]);
    const view = sp.readSpire(await sp.spireState(), tower);
    assert.ok(view.siege.msLeft <= 48 * 3600000 && view.siege.msLeft > 48 * 3600000 - 1000);
    const expired = sp.readSpire(await sp.spireState(), tower, now + 48 * 3600000);
    assert.equal(expired.held, false, 'expired siege still offers normal ownership');
    assert.equal(expired.tribute.coins, 0);
  } finally { Date.now = oldNow; }
});
await test('grant transaction abort leaves neither receipt nor unpaid reward', async () => {
  await setup('abort');
  const claim = db.claimAndPay, add = db.addIfAbsent;
  // Inject death in the atomic payout. On the old path, die immediately AFTER
  // the independently committed ledger receipt, the actual R47-1 crash seam.
  db.claimAndPay = (store, row, pay) => claim(store, row, { ...pay, kv: { ...pay.kv, r47Abort: () => { throw new Error('interrupted'); } } });
  db.addIfAbsent = async (store, row) => { const r = await add(store, row); if (row.key === 'abort-grant') throw new Error('interrupted'); return r; };
  const g = { key: 'abort-grant', type: 'social', payload: { coins: 90, dust: 12, crate: 'golden' }, ts: now };
  try { await assert.rejects(social.__testApplyGrant(g), /interrupted/); }
  finally { db.claimAndPay = claim; db.addIfAbsent = add; }
  assert.equal(await db.get('xp', g.key), undefined, 'receipt survived interrupted application; reward is permanently skipped');
  assert.equal(await kvGet('coins', 0), 0);
  assert.equal((await db.all('inv')).length, 0);
  await social.__testApplyGrant(g);
  assert.equal(await kvGet('coins', 0), 90); assert.equal(await kvGet('bonedust', 0), 12);
  assert.equal((await db.all('inv')).length, 1);
});
await test('concurrent delivery pays all payload shapes exactly once and retains presentation', async () => {
  await setup('concurrent');
  await kvSet('equipped', { C: 'C2' });
  const g = { key: 'all-grant', type: 'social', payload: { coins: 90, dust: 12, crate: 'golden', consumable: 'xp2', egg: 'ready', pet: 'C1', gearId: 'not-set', rename: 'Old name' }, ts: now };
  const { GEAR_ITEMS } = await import('../js/gear.js'); g.payload.gearId = GEAR_ITEMS[0].id;
  await Promise.all([social.__testApplyGrant(g), social.__testApplyGrant(g)]);
  assert.equal(await kvGet('coins', 0), 90); assert.equal(await kvGet('bonedust', 0), 12);
  assert.equal((await db.all('xp')).filter(r => r.key === g.key).length, 1);
  assert.equal((await kvGet('petInst', [])).filter(p => p.sp === 'C1').length, 1);
  assert.equal((await db.all('inv')).length, 5);
  assert.equal(await kvGet('renameRequired'), 'Old name');
  assert.equal((await kvGet('equipped')).C, 'C2', 'grant displaced the chosen companion');
  assert.equal(await kvGet('petEquipped', null), null, 'grant selected a different instance behind the outfit');
  assert.equal(typeof social.pendingGrantDelivery, 'function', 'paid grant has no durable presentation');
  await kvSet('grantCursor', 999);
  assert.equal((await social.pendingGrantDelivery()).appliedGrants[0].key, g.key);
  await social.acknowledgeGrantDelivery([g.key]);
  assert.equal((await social.pendingGrantDelivery()).applied, 0);
});
await test('cold delivery waits for visible app, then acknowledges presentation', async () => {
  const start = app.indexOf('let grantDeliveryBusy =');
  assert.ok(start > 0, 'cold boot has no presentation readiness gate');
  const end = app.indexOf('\nfunction drawGrantDelivery', start);
  let blocked = true, drawn = 0, acked = 0, reads = 0;
  const g = { key: 'cold', type: 'spire', payload: { note: 'Tower lost' } };
  const fn = new Function('social', 'document', 'sheetStack', 'setTimeout', 'drawGrantDelivery', `${app.slice(start, end)}; return presentGrantDelivery;`)(
    { pendingGrantDelivery: async () => ({ applied: 1, appliedGrants: [g] }), acknowledgeGrantDelivery: async () => { assert.equal(drawn, 1); acked++; } },
    { documentElement: { classList: { contains: () => true } }, hidden: false, querySelector: () => { reads++; return blocked; } }, [],
    cb => { assert.equal(drawn, 0, 'presented under cold splash'); blocked = false; cb(); },
    async () => { drawn++; });
  await fn(null); assert.ok(reads >= 2); assert.equal(drawn, 1); assert.equal(acked, 1);
});
await test('reachable siege banner and offline fight payout gates remain wired', () => {
  assert.match(app, /banner\.innerHTML = html/);
  assert.match(app, /const html = spireBannerHtml\(rows\)/, 'siege banner remains unreachable');
  assert.match(app, /if \(pending\) \{\s*coins = 0;/, 'offline fight pays takeover coins');
  assert.match(app, /sb\.disabled = takeSpent \|\| view\.pending/);
  assert.match(app, /await refreshSpires\(\{ force: true \}\);\s*if \(!spireInRange\)/);
  assert.match(app, /spireFail/);
  assert.ok(app.includes("notifyNow('Dark Spires', p.note"), 'spire grant has no device notification');
});
console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
