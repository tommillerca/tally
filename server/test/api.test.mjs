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

await test('analytics: /events ingests an anonymous batch', async () => {
  const device = 'devtest-' + Math.random().toString(36).slice(2);
  const r = await (await fetch(BASE + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device, appV: 'v80', events: [{ name: 'app_open' }, { name: 'pit_win', props: { level: 8 } }, { name: 'food_log' }] }) })).json();
  assert.ok(r.ok && r.accepted === 3, JSON.stringify(r));
});

await test('analytics: /stats is admin-gated + aggregates', async () => {
  assert.equal((await fetch(BASE + '/stats')).status, 401);
  const ok = await fetch(BASE + '/stats?token=devtoken');
  assert.equal(ok.status, 200);
  const s = await ok.json();
  assert.ok(s.totalDevices >= 1 && s.totalEvents >= 3, JSON.stringify(s));
  assert.ok(s.byName.some(e => e.name === 'pit_win'), 'event names aggregated');
  assert.ok(s.dau >= 1, 'DAU counts today');
});

await test('backup: PUT stores ciphertext, GET returns it verbatim', async () => {
  const blob = 'AAAA' + Buffer.from('pretend-ciphertext-' + Math.random()).toString('base64');
  const put = await signedFetch(kp, player.playerId, 'PUT', '/backup', JSON.stringify({ blob, appV: 'v84' }));
  assert.equal(put.status, 200);
  const got = await (await signedFetch(kp, player.playerId, 'GET', '/backup')).json();
  assert.equal(got.blob, blob, 'blob round-trips byte-for-byte');
  assert.equal(got.appV, 'v84');
});

await test('backup: PUT overwrites the previous row (one per player)', async () => {
  const blob2 = 'BBBB' + Buffer.from('second-' + Math.random()).toString('base64');
  await signedFetch(kp, player.playerId, 'PUT', '/backup', JSON.stringify({ blob: blob2 }));
  const got = await (await signedFetch(kp, player.playerId, 'GET', '/backup')).json();
  assert.equal(got.blob, blob2);
});

await test('backup: GET 404 when a player has none', async () => {
  const fresh = await makeKeys();
  const reg = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: fresh.pubJwk }) })).json();
  const r = await signedFetch(fresh.kp, reg.playerId, 'GET', '/backup');
  assert.equal(r.status, 404);
});

await test('backup: PUT requires a valid signature (wrong key rejected)', async () => {
  const other = await makeKeys();
  const r = await signedFetch(other.kp, player.playerId, 'PUT', '/backup', JSON.stringify({ blob: 'x' }));
  assert.equal(r.status, 401);
});

// ---- curated display name ----
await test('name: set curated display name by indices, /me reflects it', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/name', JSON.stringify({ adj: 1, noun: 0, num: 7 }));
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.name, 'Grim Rex #7', JSON.stringify(d));
  const me = await (await signedFetch(kp, player.playerId, 'GET', '/me')).json();
  assert.equal(me.name, 'Grim Rex #7');
});

await test('name: no number is allowed', async () => {
  const d = await (await signedFetch(kp, player.playerId, 'POST', '/name', JSON.stringify({ adj: 0, noun: 0 }))).json();
  assert.equal(d.name, 'Rattling Rex');
});

await test('name: out-of-range indices rejected (no free text ever)', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/name', JSON.stringify({ adj: 999, noun: 0 }));
  assert.equal(r.status, 400);
});

// ---- friends ----
let p2 = null, p2keys = null;
await test('friends: request by code is pending, reciprocation auto-accepts', async () => {
  p2keys = await makeKeys();
  p2 = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: p2keys.pubJwk }) })).json();
  const r1 = await (await signedFetch(kp, player.playerId, 'POST', '/friends/request', JSON.stringify({ code: p2.friendCode }))).json();
  assert.equal(r1.status, 'pending', JSON.stringify(r1));
  const aList = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  assert.ok(aList.outgoing.some(x => x.playerId === p2.playerId), 'A has outgoing');
  const bList = await (await signedFetch(p2keys.kp, p2.playerId, 'GET', '/friends')).json();
  assert.ok(bList.incoming.some(x => x.playerId === player.playerId), 'B has incoming');
  const r2 = await (await signedFetch(p2keys.kp, p2.playerId, 'POST', '/friends/request', JSON.stringify({ code: player.friendCode }))).json();
  assert.equal(r2.status, 'accepted', JSON.stringify(r2));
  const aNow = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  assert.ok(aNow.friends.some(x => x.playerId === p2.playerId), 'A now friends with B');
});

await test('friends: name + public profile surface in the list', async () => {
  await signedFetch(p2keys.kp, p2.playerId, 'POST', '/name', JSON.stringify({ adj: 2, noun: 2 })); // Dusty Knuckles
  await signedFetch(p2keys.kp, p2.playerId, 'PUT', '/profile', JSON.stringify({ snapshot: { level: 12, levelName: 'Bruiser', outfit: { SK: 'SK0-1' } }, appV: 'v100' }));
  const aList = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  const b = aList.friends.find(x => x.playerId === p2.playerId);
  assert.equal(b.name, 'Dusty Knuckles');
  assert.equal(b.profile.level, 12);
  assert.equal(b.friendCode, p2.friendCode);
});

await test('friends: accept endpoint seals a one-way request', async () => {
  const p3keys = await makeKeys();
  const p3 = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: p3keys.pubJwk }) })).json();
  await signedFetch(p3keys.kp, p3.playerId, 'POST', '/friends/request', JSON.stringify({ code: player.friendCode }));
  const acc = await signedFetch(kp, player.playerId, 'POST', '/friends/accept', JSON.stringify({ id: p3.playerId }));
  assert.equal(acc.status, 200);
  const aList = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  assert.ok(aList.friends.some(x => x.playerId === p3.playerId));
});

await test('friends: cannot friend your own code', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/friends/request', JSON.stringify({ code: player.friendCode }));
  assert.equal(r.status, 400);
});

await test('friends: unknown code 404', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/friends/request', JSON.stringify({ code: 'BONE-ZZZZ-ZZZZ' }));
  assert.equal(r.status, 404);
});

await test('friends: remove drops the edge for both sides', async () => {
  await signedFetch(kp, player.playerId, 'POST', '/friends/remove', JSON.stringify({ id: p2.playerId }));
  const aList = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  assert.ok(!aList.friends.some(x => x.playerId === p2.playerId), 'A no longer friends with B');
  const bList = await (await signedFetch(p2keys.kp, p2.playerId, 'GET', '/friends')).json();
  assert.ok(!bList.friends.some(x => x.playerId === player.playerId), 'B no longer friends with A');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
