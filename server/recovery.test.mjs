/* Recovery-route tests against a running Worker.
 *
 *   npx wrangler dev --port 8788 --local
 *   npx wrangler d1 execute bonez --local --file=schema.sql
 *   node recovery.test.mjs
 *
 * These exist because the recovery path is the only thing standing between a
 * player and a permanently lost account, and it is unauthenticated by necessity
 * (a device restoring has no key yet). Pass BASE=... to point at another origin.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
let passed = 0, failed = 0;

// The IP rate limiter lives in the events table and outlives the process, so a
// second run of this file would start already throttled and every lookup would
// 429. Clear it first, otherwise the suite only passes once.
if (/127\.0\.0\.1|localhost/.test(BASE)) {
  try {
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'bonez', '--local', '--command',
      "DELETE FROM events WHERE name IN ('rl_recovery','rl_ridcheck')"], { cwd: import.meta.dirname, stdio: 'ignore' });
  } catch { console.log('(could not reset the rate limiter; lookups may 429)'); }
}

async function test(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); failed++; }
}

const b64 = buf => Buffer.from(new Uint8Array(buf)).toString('base64');

/** Read a Response body ONCE. Passing `await r.text()` as an assert message
 *  consumes the body before the test can parse it, which reads as a route
 *  failure when the route was fine. */
async function read(r) {
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, text, json };
}

/** A throwaway player, registered the same way the app registers. */
async function newPlayer() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const res = await fetch(`${BASE}/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pubkey: pubJwk }),
  });
  if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
  const me = await res.json();
  const signed = async (method, path, bodyObj = null) => {
    const body = bodyObj ? JSON.stringify(bodyObj) : '';
    const ts = Date.now();
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey,
      new TextEncoder().encode(`${method}\n${path}\n${ts}\n${body}`));
    return fetch(BASE + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-bh-player': me.playerId, 'x-bh-ts': String(ts), 'x-bh-sig': b64(sig) },
      body: method === 'GET' ? undefined : body,
    });
  };
  return { me, signed };
}

const blob = (tag) => ({ wrapped: Buffer.from('ciphertext-' + tag).toString('base64'), salt: 'c2FsdHNhbHQ=', iters: 1000000 });

const uniq = () => 'rid' + Math.random().toString(36).slice(2, 10);

console.log(`recovery routes @ ${BASE}\n`);

const a = await newPlayer();
const ridA = uniq();

await test('PUT /recovery stores a bundle with a recovery id', async () => {
  const r = await read(await a.signed('PUT', '/recovery', { ...blob('A'), recoveryId: ridA }));
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.recoveryId, ridA);
});

await test('GET /recovery/available reports a taken id as unavailable', async () => {
  const r = await fetch(`${BASE}/recovery/available/${ridA}`);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).available, false);
});

await test('GET /recovery/available reports an unused id as free', async () => {
  const r = await fetch(`${BASE}/recovery/available/${uniq()}`);
  assert.equal((await r.json()).available, true);
});

await test('GET /recovery/id returns the wrapped bundle', async () => {
  const r = await fetch(`${BASE}/recovery/id/${ridA}`);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.wrapped, blob('A').wrapped);
  assert.equal(j.iters, 1000000);
});

/* INVERTED 2026-08-17. This used to assert the friend-code lookup still worked.
   It cannot: /leaderboard publishes every player's friend code to every player,
   so a code that also unlocks a recovery bundle makes all 100 bundles fetchable
   by anyone. The code stays public and shareable, and recovery moves to the
   chosen recovery id. Checked on production D1 before removing the route: 11
   recovery rows, 0 without a recovery_id, so no account lost its way back in.
   The assertion is kept rather than deleted, pointing the other way, so that
   quietly restoring the route fails here. */
await test('GET /recovery/<friendCode> is GONE: a published code cannot unlock a bundle', async () => {
  const r = await read(await fetch(`${BASE}/recovery/${a.me.friendCode}`));
  assert.notEqual(r.status, 200, `the friend-code recovery route must stay retired (${r.text})`);
  assert.ok(!(r.json && r.json.wrapped), 'no wrapped bundle may come back for a friend code');
});

await test('the recovery id still works, so the account is not stranded', async () => {
  const r = await read(await fetch(`${BASE}/recovery/id/${ridA}`));
  assert.equal(r.status, 200, `recovery-id lookup is now the only way in (${r.text})`);
  assert.equal(r.json.wrapped, blob('A').wrapped);
});

await test('a second player cannot steal a taken recovery id (409)', async () => {
  const b = await newPlayer();
  const r = await read(await b.signed('PUT', '/recovery', { ...blob('B'), recoveryId: ridA }));
  assert.equal(r.status, 409, r.text);
  // and the original still resolves to A's bundle, not B's
  const check = await (await fetch(`${BASE}/recovery/id/${ridA}`)).json();
  assert.equal(check.wrapped, blob('A').wrapped, 'the collision must not overwrite the first owner');
});

await test('re-saving a phrase without an id keeps the existing id', async () => {
  const r = await a.signed('PUT', '/recovery', blob('A2'));   // no recoveryId
  assert.equal(r.status, 200);
  const j = await (await fetch(`${BASE}/recovery/id/${ridA}`)).json();
  assert.equal(j.wrapped, blob('A2').wrapped, 'bundle updated');
});

await test('the same player may keep re-using their own id', async () => {
  const r = await read(await a.signed('PUT', '/recovery', { ...blob('A3'), recoveryId: ridA }));
  assert.equal(r.status, 200, r.text);
});

await test('malformed recovery ids are rejected, not looked up', async () => {
  for (const bad of ['ab', 'has space', 'x'.repeat(40)]) {
    const r = await fetch(`${BASE}/recovery/id/${encodeURIComponent(bad)}`);
    assert.equal(r.status, 400, `${bad} should 400`);
  }
});

await test('a weak KDF is refused', async () => {
  const r = await a.signed('PUT', '/recovery', { ...blob('W'), iters: 1000, recoveryId: uniq() });
  assert.equal(r.status, 400);
});

await test('unknown recovery id is a 404, not a hint', async () => {
  const r = await fetch(`${BASE}/recovery/id/${uniq()}`);
  assert.equal(r.status, 404);
});

await test('availability checks do NOT spend the restore budget', async () => {
  // typing four candidate IDs in the setup sheet must not lock you out of your
  // own restore; these buckets were shared once and that is exactly what happened
  for (let i = 0; i < 12; i++) await fetch(`${BASE}/recovery/available/${uniq()}`);
  const r = await fetch(`${BASE}/recovery/id/${ridA}`);
  assert.equal(r.status, 200, 'a real lookup still works after a dozen name checks');
});

await test('unsigned lookups are rate limited (429)', async () => {
  // the limiter is per hashed IP across ALL recovery routes; burn through it
  let saw429 = false;
  for (let i = 0; i < 25 && !saw429; i++) {
    const r = await fetch(`${BASE}/recovery/id/${uniq()}`);
    if (r.status === 429) saw429 = true;
  }
  assert.ok(saw429, 'ciphertext lookups must throttle, or the phrase can be attacked at speed');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
