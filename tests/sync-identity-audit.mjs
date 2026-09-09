// Node only: real social/db modules, transactional memory IDB, no sockets.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { kvGet, kvSet, importAll, exportAll, useDbName, eraseAll } from '../js/db.js';
import * as social from '../js/social.js';

globalThis.BroadcastChannel = undefined;
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const identity = {
  privJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  pubJwk: await crypto.subtle.exportKey('jwk', pair.publicKey),
};
const me = { playerId: 'same-player', handle: 'Test Bones', friendCode: 'TEST-1234', name: null };
let calls = [], mode = 'ok', sequence = 0, passed = 0, failed = 0;
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  assert.equal(u.origin, 'https://identity.invalid', 'all traffic must use the local fetch stub');
  calls.push(`${opts.method || 'GET'} ${u.pathname}`);
  if (u.pathname === '/health') return reply({ ok: true, day: '2026-09-09' });
  if (u.pathname === '/register') {
    assert.deepEqual(JSON.parse(opts.body).pubkey, identity.pubJwk, 'recovery must reuse the signing key');
    if (mode === 'lost-reply') throw new Error('response lost after server registration');
    if (mode === 'bad-body') return reply({ playerId: me.playerId });
    return reply(me);
  }
  const headers = opts.headers;
  assert.equal(headers['x-bh-player'], me.playerId);
  const signed = `${opts.method}\n${u.pathname + u.search}\n${headers['x-bh-ts']}\n${opts.body || ''}`;
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey,
    Buffer.from(headers['x-bh-sig'], 'base64'), new TextEncoder().encode(signed)), 'signature belongs to the original key');
  if (u.pathname === '/profile') return reply({ ok: mode !== 'profile-rejected' }, mode === 'profile-rejected' ? 503 : 200);
  if (u.pathname === '/grants') return reply({ grants: [], cursor: 0 });
  if (u.pathname === '/backup' && opts.method === 'GET') return reply({ error: 'none' }, 404);
  throw new Error(`Unexpected request: ${calls.at(-1)}`);
};
async function fresh({ key = true, online = false, cloudOff = true } = {}) {
  useDbName(`sync-identity-${++sequence}`);
  calls = []; mode = 'ok';
  await kvSet('apiBase', 'https://identity.invalid');
  await kvSet('cloudOff', cloudOff);
  await kvSet('backupAt', Date.now());
  if (key) await kvSet('identity', identity);
  if (online) await kvSet('social', me);
}
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
}
const sync = () => social.autoSync(() => ({ level: 2 }), 'identity-audit');

await check('lost registration reply leaves a key but no social; resume repairs and signs as the same player', async () => {
  await fresh();
  await kvSet('idMinted', Date.now());
  mode = 'lost-reply';
  assert.equal((await social.goOnline()).ok, false);
  assert.equal(await social.isOnline(), false);
  assert.deepEqual(await kvGet('identity'), identity);
  assert.equal(await kvGet('coins'), 50);
  mode = 'profile-rejected'; calls = [];
  assert.equal((await sync()).applied, 0);
  assert.equal(await kvGet('socialSyncAt', 0), 0, 'recovered registration cannot stamp a rejected profile');
  let health = await social.syncHealthState();
  assert.equal(health.entries.length, 1);
  assert.equal(health.entries[0].hop, 'non-2xx');
  assert.equal(health.entries[0].profileStatus, 503);
  assert.equal(health.entries[0].grantsNetwork, true);
  assert.deepEqual(calls, ['POST /register', 'PUT /profile', 'GET /grants']);
  mode = 'ok'; calls = [];
  await sync();
  health = await social.syncHealthState();
  assert.equal(health.entries.length, 2);
  assert.equal(health.entries[1].hop, 'success');
  assert.deepEqual(calls, ['PUT /profile', 'GET /grants'], 'immediate retry uses the repaired registration');
  assert.equal((await social.socialMe())?.playerId, me.playerId);
  assert.ok(calls.includes('PUT /profile'));
  assert.ok(calls.includes('GET /grants'));
  assert.equal(await kvGet('coins'), 50, 'recovery cannot repay the welcome grant');
  assert.ok(await kvGet('socialSyncAt'));
  assert.equal(await kvGet('cloudOff'), true);
  assert.ok(!calls.some(c => c.includes('/backup')), 'cloud opt-out remains respected');
});
await check('failed recovery and incomplete response stay retryable without replacing the key', async () => {
  await fresh();
  for (const failure of ['lost-reply', 'bad-body']) {
    mode = failure;
    assert.equal(await sync(), null);
    assert.equal(await social.socialMe(), null);
    assert.deepEqual(await kvGet('identity'), identity);
    assert.equal(await kvGet('socialSyncAt', 0), 0);
  }
  mode = 'ok';
  await sync();
  assert.equal((await social.socialMe())?.playerId, me.playerId);
});
await check('new install and incomplete identity do not mint or register on resume', async () => {
  await fresh({ key: false });
  await sync();
  assert.equal(await kvGet('identity', null), null);
  await kvSet('identity', { privJwk: identity.privJwk });
  await sync();
  assert.deepEqual(calls, []);
});
await check('CONTROL existing account sync needs no registration', async () => {
  await fresh({ online: true });
  await sync();
  assert.deepEqual(calls, ['PUT /profile', 'GET /grants']);
});
await check('cloud-enabled boot already recovers missing social', async () => {
  await fresh({ cloudOff: false });
  await social.bootSync();
  assert.equal((await social.socialMe())?.playerId, me.playerId);
});
await check('cloud opt-out boot skips recovery but resume must recover public identity', async () => {
  await fresh();
  assert.equal((await social.bootSync()).reason, 'opted-out');
  assert.equal(await social.socialMe(), null);
  await sync();
  assert.equal((await social.socialMe())?.playerId, me.playerId);
});
await check('replacement import preserves omitted identity and social; merge rejects incoming device overrides', async () => {
  await fresh({ online: true });
  const file = { app: 'tally', version: 3, log: [], kv: [{ k: 'coins', v: 7 }] };
  await importAll(file);
  assert.deepEqual(await kvGet('identity'), identity);
  assert.deepEqual(await social.socialMe(), me);
  await importAll({ ...file, kv: [{ k: 'social', v: null }, { k: 'identity', v: null }] }, { replace: false });
  assert.deepEqual(await kvGet('identity'), identity);
  assert.deepEqual(await social.socialMe(), me);
  assert.ok((await exportAll()).kv.some(r => r.k === 'social'));
});
await check('replacement import honors explicit social null; surviving key recovers on resume', async () => {
  await fresh({ online: true });
  await importAll({ app: 'tally', version: 3, log: [], kv: [{ k: 'social', v: null }] });
  assert.equal(await social.socialMe(), null);
  assert.deepEqual(await kvGet('identity'), identity);
  await sync();
  assert.equal((await social.socialMe())?.playerId, me.playerId);
});
await check('erase removes both records and resume cannot resurrect the erased account', async () => {
  await fresh({ online: true });
  await eraseAll();
  assert.equal(await kvGet('identity', null), null);
  assert.equal(await social.socialMe(), null);
  await sync();
  assert.deepEqual(calls, []);
});
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
