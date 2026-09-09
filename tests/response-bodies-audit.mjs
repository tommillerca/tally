// Frozen fix-bodies: drive real client calls with parsed JSON over an in-memory
// transport. WRONG must refuse before state changes; CONTROL must still work.
// No sockets, browser or Worker. Run against the pre-fix source for red proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import './mem-idb.mjs';
import { db, kvGet, kvSet } from '../js/db.js';
import * as social from '../js/social.js';

const API = 'https://response-bodies.invalid';
await kvSet('apiBase', API);
const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
await kvSet('identity', { pubJwk: await crypto.subtle.exportKey('jwk', keys.publicKey), privJwk: await crypto.subtle.exportKey('jwk', keys.privateKey) });
await kvSet('idMinted', null);
const me = { playerId: 'player', handle: 'Bonehead', friendCode: 'BONE-AAAA-BBBB', name: null };
await kvSet('social', me);
let response, expected, calls = 0, messages = [];
globalThis.fetch = async (url, opts = {}) => {
  assert.equal(new URL(url).pathname, expected);
  calls++;
  return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(response)) };
};
// Execute the production toast wiring, so disclosure is more than a sidecar.
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const wiring = app.match(/social\.onResponseFailure\(message => toast\(message, 8000, \{ error: true \}\)\);/);
if (wiring) vm.runInNewContext(wiring[0], { social, toast: message => messages.push(message) });
const person = { playerId: 'friend', handle: 'Skull', name: 'Skull', profile: null };
const spire = { id: 'sp-1-1', name: 'Tower', owner: 'friend', ownerName: 'Skull', mine: false,
  defender: null, level: 1, claimedAt: 1, tendedAt: 1, siegeUntil: null, siegeName: null };
const racer = { playerId: 'friend', name: 'Skull', rank: 1, steps: 100, level: 1, you: false };
const fixtures = [
  { name: 'registerKey', path: '/register', call: () => social.goOnline(), good: me, wrong: { ...me, playerId: 7 }, pass: r => r.ok, fail: r => r.ok === false },
  { name: 'setName', path: '/name', call: () => social.setName(0, 0, 1), good: { ok: true, name: 'New Skull' }, wrong: { ok: true, name: 7 }, pass: r => r.ok && r.name === 'New Skull', fail: r => r.ok === false },
  { name: 'listFriends', path: '/friends', call: () => social.listFriends(), good: { friends: [person], incoming: [], outgoing: [] }, wrong: { friends: [{ ...person, playerId: 7 }], incoming: [], outgoing: [] }, pass: r => r.reached && r.friends.length === 1, fail: r => r.reached === false },
  { name: 'fetchSpires', path: '/spires', call: () => social.fetchSpires(['sp-1-1']), good: { spires: [spire] }, wrong: { spires: [{ ...spire, mine: 'false' }] }, pass: r => r?.length === 1, fail: r => r === null },
  { name: 'claimSpireRemote', path: '/spires/sp-1-1/claim', call: () => social.claimSpireRemote({ id: 'sp-1-1', name: 'Tower', lat: 1, lng: 1 }), good: { ok: true, tookFrom: null, level: 1 }, wrong: { ok: true, tookFrom: null, level: '1' }, pass: r => r.ok && r.level === 1, fail: r => r.ok === false },
  { name: 'fetchStepRace', path: '/steps/week', call: () => social.fetchStepRace('2026-09-07'), good: { week: '2026-09-07', players: [racer], yourRank: null, racers: 1, prize: { coins: 100, crate: 'golden' }, podium: [{ coins: 5000, crate: 'golden', dust: 200, place: '1st' }], champion: { name: 'Skull', steps: 100, week: '2026-08-31' } }, wrong: { week: '2026-09-07', players: [racer], yourRank: '1', racers: 1 }, pass: r => r?.players.length === 1, fail: r => r === null },
  { name: 'fetchSettledRace', path: '/steps/settled', call: () => social.fetchSettledRace('2026-08-31'), good: { week: '2026-08-31', podium: [{ place: 1, name: 'Skull', steps: 100, coins: 100, dust: 0, crate: null, outfit: null }] }, wrong: { podium: [{ place: 1, name: 'Skull', steps: '100' }] }, pass: r => r?.length === 1, fail: r => r === null },
  { name: 'defendSpireRemote', path: '/spires/sp-1-1/defend', call: () => social.defendSpireRemote('sp-1-1'), good: { ok: true, level: 2 }, wrong: { ok: true }, pass: r => r.ok && r.level === 2, fail: r => r.ok === false },
  { name: 'leaderboard', path: '/leaderboard', call: () => social.leaderboard(), good: { players: [{ playerId: 'friend', name: 'Skull', level: 1, you: false }] }, wrong: { players: [{ playerId: 'friend', name: 'Skull', level: '1', you: false }] }, pass: r => r?.length === 1, fail: r => r === null },
  { name: 'pullGrants', path: '/grants', call: () => social.pullGrants(), good: { grants: [{ id: 1, key: 'body-control', type: 'crew', payload: { coins: 7, note: 'From the Crew' }, ts: 1 }], cursor: 1 }, wrong: { grants: [], cursor: '100' }, pass: r => r.applied === 1, fail: r => r.applied === 0 && r.reason === 'bad-body' },
];
async function reset() {
  const identity = await kvGet('identity');
  await db.clear('kv');
  await db.clear('inv');
  await kvSet('identity', identity);
  await kvSet('apiBase', API);
  await kvSet('idMinted', null);
  await kvSet('social', me);
  for (const key of ['grantCursor', 'coins']) await kvSet(key, 0);
  await kvSet('grantsSeen', []);
  await db.clear('xp');
}
let checks = 0, failures = 0;
async function check(name, run) {
  checks++;
  try { await run(); console.log(`PASS ${name}`); }
  catch (error) { failures++; console.log(`FAIL ${name}: ${error.message}`); }
}
for (const f of fixtures) {
  expected = f.path;
  for (const [label, body] of [['missing', {}], ['typed', f.wrong], ['null', null], ['array', []]]) {
    await check(`${f.name} WRONG ${label}`, async () => {
      await reset(); response = body; messages = [];
      const before = await db.all('kv');
      const beforeXp = await db.all('xp');
      const beforeInv = await db.all('inv');
      const beforeCalls = calls;
      const result = await f.call();
      assert.equal(calls, beforeCalls + 1, 'must exercise the transport');
      assert.ok(f.fail(result), `accepted wrong body: ${JSON.stringify(result)}`);
      assert.deepEqual(await db.all('kv'), before, 'invalid body changed local state');
      assert.deepEqual(await db.all('xp'), beforeXp, 'invalid body minted a receipt');
      assert.deepEqual(await db.all('inv'), beforeInv, 'invalid body changed inventory');
      assert.equal(messages.length, 1, 'player must receive the production toast');
      assert.match(messages[0], /could not|couldn't/i);
    });
  }
  await check(`${f.name} CONTROL`, async () => {
    await reset(); response = f.good; messages = [];
    const result = await f.call();
    assert.ok(f.pass(result), `correct body refused: ${JSON.stringify(result)}`);
    assert.equal(messages.length, 0);
    if (f.name === 'registerKey') {
      const saved = await kvGet('social');
      assert.equal(saved.playerId, me.playerId);
      assert.equal(saved.friendCode, me.friendCode);
    }
    if (f.name === 'setName') assert.equal((await kvGet('social')).name, 'New Skull');
    if (f.name === 'pullGrants') {
      assert.equal(await kvGet('grantCursor'), 1);
      assert.equal(await kvGet('coins'), 7);
    }
  });
}
await check('claimSpireRemote already CONTROL', async () => {
  expected = '/spires/sp-1-1/claim'; response = { ok: true, already: true, level: 1 };
  assert.equal((await social.claimSpireRemote({ id: 'sp-1-1' })).already, true);
});
for (const [name, body] of [
  ['listFriends', { friends: [], incoming: [], outgoing: [] }],
  ['fetchSpires', { spires: [] }],
  ['fetchStepRace', { ...fixtures.find(f => f.name === 'fetchStepRace').good, players: [], racers: 0, yourRank: null, champion: null }],
  ['fetchSettledRace', { week: '2026-08-31', podium: [] }],
  ['leaderboard', { players: [] }],
  ['pullGrants', { grants: [], cursor: 0 }],
]) {
  await check(`${name} empty CONTROL`, async () => {
    await reset(); messages = [];
    const f = fixtures.find(f => f.name === name);
    expected = f.path; response = body;
    const result = await f.call();
    assert.ok(result !== null && result?.reached !== false && !result?.reason);
    assert.equal(messages.length, 0);
  });
}
await check('pullGrants WRONG late payload refuses the entire batch', async () => {
  await reset(); messages = [];
  expected = '/grants';
  const good = fixtures.find(f => f.name === 'pullGrants').good.grants[0];
  response = { grants: [good, { ...good, id: 2, key: 'bad-late', payload: { coins: '7' } }], cursor: 2 };
  const before = await db.all('kv');
  const result = await social.pullGrants();
  assert.equal(result.reason, 'bad-body');
  assert.deepEqual(await db.all('kv'), before);
  assert.deepEqual(await db.all('xp'), []);
  assert.equal(messages.length, 1);
});
console.log(`${checks - failures}/${checks} passed; ${failures} failed`);
process.exitCode = failures ? 1 : 0;
