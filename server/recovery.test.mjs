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

/* The IP rate limiter outlives the process, so a second run of this file would
   start already throttled and every lookup would 429. Clear it first, otherwise
   the suite only passes once.
   The counters moved OUT of `events` and into their own `rate_limits` table on
   2026-08-16: counting a limiter's budget in the table that the unauthenticated
   /events ingest writes to meant anyone could forge rows into someone else's
   bucket and lock that IP out of account recovery. Same reset, new table. */
if (/127\.0\.0\.1|localhost/.test(BASE)) {
  try {
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'bonez', '--local', '--command',
      "DELETE FROM rate_limits"], { cwd: import.meta.dirname, stdio: 'ignore' });
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

/* Registration is IP rate limited (10/hour). Throwaway players each arrive from
   their own synthetic edge IP, the way real phones would. cf-connecting-ip is
   set by Cloudflare in production and a client-supplied value is replaced there,
   so this only works locally, which is what makes the limiter testable. */
const rndIp = () => `198.18.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;

/** A throwaway player, registered the same way the app registers. */
async function newPlayer() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const res = await fetch(`${BASE}/register`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': rndIp() },
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

/* THE FRIEND-CODE LOOKUP IS NOW LEGACY-ONLY (2026-08-16).
   A friend code is printed in the app, copied into chats, and used to be
   published for the whole top 100 by /leaderboard, so it was never a secret --
   and making it the lookup handle for the wrapped identity bundle meant the
   ciphertext was effectively public and offline-attackable at leisure. The route
   cannot simply be deleted: a pre-v231 account has no recovery_id and its owner
   has wiped the phone that displayed one, so this is their only way back in.
   So it is narrowed to exactly that population, and the two halves are asserted
   separately because they are two different rules. */
await test('GET /recovery/<friendCode> still works for a pre-v231 account (no recovery id)', async () => {
  const legacy = await newPlayer();
  // a bundle stored WITHOUT a recovery id: the pre-v231 shape
  assert.equal((await legacy.signed('PUT', '/recovery', blob('L'))).status, 200);
  const r = await read(await fetch(`${BASE}/recovery/${legacy.me.friendCode}`));
  assert.equal(r.status, 200, `the legacy way in must not regress (${r.text})`);
  assert.equal(r.json.wrapped, blob('L').wrapped);
});

await test('GET /recovery/<friendCode> is CLOSED once the account has a recovery id', async () => {
  // `a` set ridA in the first test, so its code must no longer be a handle to
  // its ciphertext. This is the harvest being closed.
  const r = await read(await fetch(`${BASE}/recovery/${a.me.friendCode}`));
  assert.equal(r.status, 404, `a friend code must not hand out a modern account's bundle (${r.text})`);
  assert.ok(!r.json?.wrapped, 'and certainly not the wrapped bundle itself');
  // the SAME answer as an account with nothing stored, so this cannot be used to
  // tell which codes belong to accounts worth attacking some other way
  const none = await read(await fetch(`${BASE}/recovery/${(await newPlayer()).me.friendCode}`));
  assert.equal(none.status, 404, 'an account with no recovery set answers the same way');
  assert.deepEqual(r.json, none.json, 'indistinguishable: no oracle');
  // and the account is still perfectly recoverable by the handle that is NOT a
  // share-key, which is the whole point of the change
  const byId = await read(await fetch(`${BASE}/recovery/id/${ridA}`));
  assert.equal(byId.status, 200, 'the recovery id still works: this closes a door, it does not lock anyone out');
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
