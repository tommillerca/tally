// API tests against a locally running worker (npm run dev, port 8788).
// Node 18+ has WebCrypto + fetch built in, so this mirrors the browser exactly.
import assert from 'node:assert/strict';

const BASE = process.env.API || 'http://127.0.0.1:8788';
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  PASS', name); }
  catch (e) { failed++; console.log('  FAIL', name, '\n   ', e.message); }
}

const b64 = buf => Buffer.from(buf).toString('base64');
async function makeKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    kp,
    pubJwk: await crypto.subtle.exportKey('jwk', kp.publicKey),
  };
}
async function signedFetch(kp, playerId, method, path, body = '', tsOverride = null) {
  const ts = tsOverride ?? Date.now();
  const msg = `${method}\n${path}\n${ts}\n${body}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(msg));
  return fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-bh-player': playerId, 'x-bh-ts': String(ts), 'x-bh-sig': b64(sig) },
    body: method === 'GET' ? undefined : body,
  });
}

const { kp, pubJwk } = await makeKeys();
let player = null;

await test('health', async () => {
  const r = await (await fetch(BASE + '/health')).json();
  assert.ok(r.ok);
});

await test('register issues player + friend code + handle', async () => {
  const r = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: pubJwk }) })).json();
  assert.ok(r.playerId && /^BONE-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(r.friendCode) && r.handle.includes(' '), JSON.stringify(r));
  player = r;
});

await test('re-register with same key returns the SAME account (backup restore)', async () => {
  const r = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: pubJwk }) })).json();
  assert.equal(r.playerId, player.playerId);
  assert.ok(r.existing);
});

await test('bad pubkey rejected', async () => {
  const r = await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: { kty: 'RSA' } }) });
  assert.equal(r.status, 400);
});

await test('signed profile PUT accepted + stored', async () => {
  const body = JSON.stringify({ snapshot: { level: 8, stats: { power: 20 }, outfit: { SK: 'SK0-1' }, gear: [] }, appV: 'v66' });
  const r = await signedFetch(kp, player.playerId, 'PUT', '/profile', body);
  assert.equal(r.status, 200);
  const p = await (await fetch(BASE + `/dev/player?id=${player.playerId}`)).json();
  assert.equal(JSON.parse(p.profile).level, 8);
  assert.equal(p.app_v, 'v66');
});

await test('tampered body rejected (signature covers body)', async () => {
  const good = JSON.stringify({ snapshot: { level: 8 } });
  const ts = Date.now();
  const msg = `PUT\n/profile\n${ts}\n${good}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(msg));
  const r = await fetch(BASE + '/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-bh-player': player.playerId, 'x-bh-ts': String(ts), 'x-bh-sig': b64(sig) },
    body: JSON.stringify({ snapshot: { level: 99 } }), // tampered
  });
  assert.equal(r.status, 401);
});

await test('wrong key rejected', async () => {
  const other = await makeKeys();
  const body = JSON.stringify({ snapshot: { level: 1 } });
  const r = await signedFetch(other.kp, player.playerId, 'PUT', '/profile', body);
  assert.equal(r.status, 401);
});

await test('stale timestamp rejected (replay protection)', async () => {
  const body = JSON.stringify({ snapshot: { level: 8 } });
  const r = await signedFetch(kp, player.playerId, 'PUT', '/profile', body, Date.now() - 10 * 60 * 1000);
  assert.equal(r.status, 401);
});

await test('grants: welcome grant delivered, cursor advances, no redelivery', async () => {
  const r1 = await (await signedFetch(kp, player.playerId, 'GET', '/grants?since=0')).json();
  assert.ok(r1.grants.some(g => g.key === 'social-welcome' && g.payload.coins === 50), JSON.stringify(r1));
  const r2 = await (await signedFetch(kp, player.playerId, 'GET', `/grants?since=${r1.cursor}`)).json();
  assert.equal(r2.grants.length, 0);
});

await test('dev grant flows through', async () => {
  await fetch(BASE + '/dev/grant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ playerId: player.playerId, key: 'test-coins-1', payload: { coins: 25, note: 'test' } }) });
  const r = await (await signedFetch(kp, player.playerId, 'GET', '/grants?since=0')).json();
  assert.ok(r.grants.some(g => g.key === 'test-coins-1'));
});

await test('/me returns identity after restore', async () => {
  const r = await (await signedFetch(kp, player.playerId, 'GET', '/me')).json();
  assert.equal(r.friendCode, player.friendCode);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
