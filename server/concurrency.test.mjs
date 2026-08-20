/* Concurrency guards for the write paths.
 *
 *   npx wrangler d1 execute bonez --local --file=schema.sql
 *   npx wrangler dev --local --port 8788 --var DEV:1 --var ADMIN_TOKEN:devtoken
 *   node concurrency.test.mjs
 *
 * WHY THIS SUITE EXISTS. D1 is SQLite: one writer, and no interactive
 * transaction can span an await inside a Worker. So every read-modify-write that
 * crosses an await is a race, and at five friendly players it never fires. Every
 * check in here is the same shape: fire N requests at once with Promise.all and
 * assert the FINAL STATE OF THE DATABASE, not the responses. A route that
 * answers ok N times and stores one row is exactly the failure being hunted, and
 * only the stored state can tell you it happened.
 *
 * DIRECTION AND BOUND, stated per check rather than implied. Every assertion
 * here is an equality against an exact expected count, never a trend and never
 * an inequality that a broken run could satisfy from the wrong side. "One siege
 * pays exactly one level" is the rule; `level >= 2` would pass on the bug.
 *
 * WHY THE BACKGROUND LOAD. This is the part that makes the suite mean anything
 * locally. miniflare's D1 is in-process, so a statement resolves in tens of
 * microseconds and the window between a route's SELECT and its UPDATE is almost
 * closed: fired on an idle worker, the first request finishes before the second
 * has verified its signature, and every one of these races reports clean. On
 * real D1 each statement is a network hop, so that window is milliseconds wide
 * and a dozen requests sit inside it comfortably. BURST_LOAD reproduces the
 * width locally by keeping the isolate busy, which is what a loaded server does
 * anyway. Without it these guards are green against the bugs they exist for,
 * which is worse than not having them. Verified red against every unfixed shape
 * on 2026-08-17.
 */
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
const BURST_LOAD = Number(process.env.BURST_LOAD || 300);
let passed = 0, failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); failed++; }
}

const b64 = buf => Buffer.from(new Uint8Array(buf)).toString('base64');
const rndIp = () => `198.18.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
let cell = Math.floor(Math.random() * 900000) + 100000;
const nextSpireId = () => `sp-${++cell}-${cell}`;

/* Sign now, send later. A signature costs real CPU, so signing inside the burst
   would stagger the arrivals by exactly the amount the race needs to not
   happen. preSign returns a thunk that only calls fetch. */
async function preSign(kp, playerId, method, path, bodyObj = null) {
  const body = bodyObj === null ? '' : JSON.stringify(bodyObj);
  const ts = Date.now();
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey,
    new TextEncoder().encode(`${method}\n${path}\n${ts}\n${body}`));
  const init = {
    method,
    headers: { 'content-type': 'application/json', 'x-bh-player': playerId, 'x-bh-ts': String(ts), 'x-bh-sig': b64(sig) },
    body: method === 'GET' ? undefined : body,
  };
  return () => fetch(BASE + path, init);
}

async function newPlayer(snapshot = { level: 9 }) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const res = await fetch(`${BASE}/register`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': rndIp() },
    body: JSON.stringify({ pubkey: pubJwk }),
  });
  if (!res.ok) throw new Error(`register failed: ${res.status}`);
  const me = await res.json();
  const signed = async (method, path, bodyObj = null) => (await preSign(kp, me.playerId, method, path, bodyObj))();
  if (snapshot) await signed('PUT', '/profile', { snapshot, appV: 'conc' });
  return { kp, me, id: me.playerId, signed, sign: (m, p, b) => preSign(kp, me.playerId, m, p, b) };
}

/* Fire every thunk at once, under load. Returns the responses. Refuses to
   return an empty sample: a burst that sent nothing is a broken test, not a
   passing one. */
async function burst(thunks) {
  assert.ok(thunks.length > 0, 'BURST SENT NOTHING: an empty sample set is a failure, never a pass');
  const noise = [];
  for (let i = 0; i < BURST_LOAD; i++) noise.push(fetch(`${BASE}/dev/player?id=nobody`).catch(() => {}));
  const res = await Promise.all(thunks.map(f => f()));
  await Promise.allSettled(noise);
  assert.equal(res.length, thunks.length, 'every request in the burst must have come back');
  return res;
}

const bodiesOf = res => Promise.all(res.map(r => r.json()));
const grantKeys = async (who, prefix) => {
  const g = await (await who.signed('GET', '/grants?since=0')).json();
  return (g.grants || []).map(x => x.key).filter(k => k.startsWith(prefix));
};

/* ---------------------------------------------------------------------------
   1. POST /spires/<id>/defend -- the level increment.

   WAS: read the row, check siege_until in JS, then UPDATE ... level = level + 1
   with no siege condition in the WHERE. The arithmetic was already inline and
   safe; the GUARD was the read-modify-write. Twelve concurrent defends of ONE
   open siege all passed the JS check and all incremented.
   DIRECTION of failure: level goes UP. BOUND: exactly one repelled siege pays
   exactly one level, so a level-1 tower must finish at exactly 2 and never 3+.
   Measured before the fix: 12 ok responses, final level 13.
--------------------------------------------------------------------------- */
await test('one open siege pays exactly one level, however many defends arrive at once', async () => {
  const owner = await newPlayer();
  const id = nextSpireId();
  const claim = await owner.signed('PUT', `/spires/${id}/claim`, { name: 'Guard Tower', lat: 1.5, lng: 2.5 });
  assert.equal(claim.status, 200, 'PRECONDITION: the tower must be claimed');
  const mine = await (await owner.signed('GET', '/spires/mine?force=1')).json();
  const staged = mine.spires.find(s => s.id === id);
  assert.ok(staged && staged.siegeUntil, 'PRECONDITION: a siege must actually be open, or nothing is being tested');
  assert.equal(staged.level, 1, 'PRECONDITION: the tower starts at level 1');

  const N = 12;
  const fires = [];
  for (let i = 0; i < N; i++) fires.push(await owner.sign('POST', `/spires/${id}/defend`, {}));
  const res = await burst(fires);
  const bodies = await bodiesOf(res);

  const won = bodies.filter(b => b.ok).length;
  const after = await (await owner.signed('GET', '/spires/mine')).json();
  const row = after.spires.find(s => s.id === id);
  assert.equal(won, 1, `exactly one of ${N} concurrent defends may repel the siege, got ${won}`);
  assert.equal(row.level, 2, `one siege = one level: expected exactly 2, got ${row.level}`);
  assert.equal(row.siegeUntil, null, 'the siege must be cleared');
  // and the level each caller was TOLD must be the level that is stored
  for (const b of bodies) if (b.ok) assert.equal(b.level, 2, 'the reported level must be the stored level');
});

/* ---------------------------------------------------------------------------
   2. POST /gift mode=free -- the once-per-day check.

   WAS: SELECT 1 FROM grants WHERE key = ? ; then INSERT OR IGNORE. The INSERT
   was idempotent, the CHECK was not, so several callers passed a once-per-day
   gate, several free gifts were rolled, and one was delivered.
   DIRECTION: callers told ok goes UP past 1. BOUND: exactly one ok and exactly
   one grant. Measured before the fix: 3 of 8 callers told ok, 1 grant.
--------------------------------------------------------------------------- */
await test('the free daily gift is sent exactly once, however many senders race', async () => {
  const A = await newPlayer(), B = await newPlayer();
  await befriend(A, B);
  const N = 8;
  const fires = [];
  for (let i = 0; i < N; i++) fires.push(await A.sign('POST', '/gift', { to: B.id, mode: 'free' }));
  const res = await burst(fires);
  const bodies = await bodiesOf(res);

  const ok = bodies.filter(b => b.ok).length;
  const keys = await grantKeys(B, 'gift-free-');
  assert.equal(ok, 1, `a once-per-day gift may be accepted exactly once, got ${ok} of ${N}`);
  assert.equal(keys.length, 1, `exactly one free gift may reach the recipient, got ${keys.length}`);
  assert.equal(res.filter(r => r.status === 409).length, N - 1, 'every other caller must be told daily-done');
  assert.ok(bodies.filter(b => b.error).every(b => b.code === 'daily-done'), 'refusal is a NAMED outcome');
});

/* ---------------------------------------------------------------------------
   3. POST /gift mode=spend -- the counted key, and the cap.

   WAS: SELECT COUNT(*) n ; key = prefix + n ; INSERT OR IGNORE. Concurrent
   senders all read the same n, all built the SAME key, and all but one insert
   was silently swallowed by OR IGNORE while every caller was answered ok. The
   client deducts the sender's coins on that ok, so the coins left and the gift
   did not. The cap failed in the other direction at the same time: eight passed
   a limit of five.
   DIRECTION: grants delivered goes DOWN relative to callers charged, and the cap
   goes UP past 5. BOUND: delivered == told-ok, and delivered == 5 exactly.
   Measured before the fix: 8 callers told ok, 1 grant delivered, 7 lost.
--------------------------------------------------------------------------- */
await test('every accepted spend-gift is delivered, and the daily cap of 5 holds under a burst', async () => {
  const A = await newPlayer(), B = await newPlayer();
  await befriend(A, B);
  const N = 8;
  const fires = [];
  for (let i = 0; i < N; i++) fires.push(await A.sign('POST', '/gift', { to: B.id, mode: 'spend', coins: 100 }));
  const res = await burst(fires);
  const bodies = await bodiesOf(res);

  const ok = bodies.filter(b => b.ok).length;
  const keys = await grantKeys(B, 'gift-spend-');
  assert.equal(keys.length, new Set(keys).size, 'no two gifts may share a key');
  assert.equal(ok, keys.length, `every sender told ok must have delivered a gift: ${ok} charged, ${keys.length} delivered`);
  assert.equal(keys.length, 5, `the cap is 5 a day: expected exactly 5 delivered from ${N} concurrent, got ${keys.length}`);
  assert.equal(res.filter(r => r.status === 429).length, N - 5, 'the rest must be refused, not silently dropped');
});

/* ---------------------------------------------------------------------------
   4. POST /cheer -- identical counted-key shape, cap 10.
   DIRECTION: delivered goes DOWN relative to accepted. BOUND: equal, and 8 of 8
   below the cap. Measured before the fix: 8 accepted, 2 delivered.
--------------------------------------------------------------------------- */
await test('every accepted cheer is delivered', async () => {
  const A = await newPlayer(), B = await newPlayer();
  await befriend(A, B);
  const N = 8;               // under the cap of 10, so all of them must land
  const fires = [];
  for (let i = 0; i < N; i++) fires.push(await A.sign('POST', '/cheer', { to: B.id, cheer: i % 8 }));
  const res = await burst(fires);
  const bodies = await bodiesOf(res);

  const ok = bodies.filter(b => b.ok).length;
  const keys = await grantKeys(B, 'cheer-');
  assert.equal(ok, N, `all ${N} cheers are under the cap of 10 and must be accepted, got ${ok}`);
  assert.equal(keys.length, new Set(keys).size, 'no two cheers may share a key');
  assert.equal(keys.length, N, `every accepted cheer must be delivered: ${ok} accepted, ${keys.length} delivered`);
});

/* ---------------------------------------------------------------------------
   5. PUT /spires/<id>/claim -- the three-tower cap.

   WAS: SELECT COUNT(*) held ; refuse at 3 ; then INSERT. Concurrent claims of
   DIFFERENT towers all read held = 0.
   DIRECTION: towers held goes UP past the cap. BOUND: exactly 3, never more.
   Measured before the fix: 8 concurrent claims, 8 towers held.
--------------------------------------------------------------------------- */
await test('the three-tower cap holds against a burst of claims on different towers', async () => {
  const P = await newPlayer();
  const N = 8;
  const fires = [];
  for (let i = 0; i < N; i++) {
    fires.push(await P.sign('PUT', `/spires/${nextSpireId()}/claim`, { name: `Cap ${i}`, lat: 1 + i / 100, lng: 2 + i / 100 }));
  }
  const res = await burst(fires);
  const bodies = await bodiesOf(res);

  const mine = await (await P.signed('GET', '/spires/mine')).json();
  assert.equal(mine.spires.length, 3, `the server cap is 3 towers: holds ${mine.spires.length} after ${N} concurrent claims`);
  assert.equal(bodies.filter(b => b.ok).length, 3, 'exactly three claims may be accepted');
  assert.equal(bodies.filter(b => b.error === 'cap').length, N - 3, 'the rest must be refused by name');
});

/* ---------------------------------------------------------------------------
   6. PUT /spires/<id>/claim -- the takeover shield, and the level it pays.

   WAS: the shield read claimed_at, then the upsert ran unconditionally, so two
   rivals taking one tower at the same moment both took it and the tower gained
   two levels for one takeover.
   DIRECTION: level goes UP, and two players are each told they own it. BOUND:
   exactly one winner and exactly one level.
--------------------------------------------------------------------------- */
await test('two rivals claiming one tower at once produce one owner and one level', async () => {
  const holder = await newPlayer();
  const r1 = await newPlayer(), r2 = await newPlayer();
  const id = nextSpireId();
  assert.equal((await holder.signed('PUT', `/spires/${id}/claim`, { name: 'Contested', lat: 5, lng: 6 })).status, 200);
  // step past the one-hour shield the holder's own claim raised
  const w = await fetch(`${BASE}/dev/spire-warp`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, backMs: 2 * 3600000 }),
  });
  assert.equal((await w.json()).row.level, 1, 'PRECONDITION: the contested tower is at level 1');

  const res = await burst([
    await r1.sign('PUT', `/spires/${id}/claim`, { name: 'Contested', lat: 5, lng: 6 }),
    await r2.sign('PUT', `/spires/${id}/claim`, { name: 'Contested', lat: 5, lng: 6 }),
  ]);
  const bodies = await bodiesOf(res);
  const winners = bodies.filter(b => b.ok);
  assert.equal(winners.length, 1, `exactly one rival may take it, got ${winners.length}`);
  assert.equal(bodies.filter(b => b.error === 'shielded').length, 1, 'the loser must be told shielded, by name');

  const seen = await (await holder.signed('GET', `/spires?ids=${id}`)).json();
  assert.equal(seen.spires[0].level, 2, `one takeover = one level: expected exactly 2, got ${seen.spires[0].level}`);
  assert.equal(winners[0].level, 2, 'the level the winner was told must be the level that is stored');
});

/* ---------------------------------------------------------------------------
   7. POST /register -- the same pubkey twice at once.

   WAS: SELECT on pubkey ; then INSERT. players.pubkey is UNIQUE, and the retry
   loop treated every UNIQUE failure as a friend-code collision, so it retried
   with a fresh code, collided on the pubkey again, five times, and 500'd.
   DIRECTION: a 500 on the most ordinary client action there is. BOUND: every
   response 200, and exactly ONE distinct playerId across all of them.
   Measured before the fix: [200, 200, 500].
--------------------------------------------------------------------------- */
await test('concurrent registers of one pubkey all return the one account', async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const ip = rndIp();
  const one = () => fetch(`${BASE}/register`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ pubkey: pubJwk }),
  });
  const res = await burst([one, one, one]);
  const bodies = await bodiesOf(res);
  assert.deepEqual(res.map(r => r.status), [200, 200, 200], `no register may 500: got ${JSON.stringify(bodies)}`);
  const ids = new Set(bodies.map(b => b.playerId));
  assert.equal(ids.size, 1, `one pubkey is one account: got ${ids.size} distinct ids`);
  assert.ok([...ids][0], 'the account id must come back');
});

/* ---------------------------------------------------------------------------
   8. POST /friends/request -- both players press Add at the same moment.

   WAS: SELECT ; then INSERT against PRIMARY KEY (a, b). The loser 500'd with a
   raw SQLITE_CONSTRAINT in the body, and the reciprocation rule never ran, so
   two people who both asked ended up merely pending, each waiting on the other.
   DIRECTION: a 500, and an accepted friendship silently downgraded to pending.
   BOUND: both 200, and the pair ends ACCEPTED, exactly one row.
--------------------------------------------------------------------------- */
await test('both players pressing Add at once become friends, with no 500', async () => {
  const A = await newPlayer({ level: 3 }), B = await newPlayer({ level: 3 });
  const ca = (await (await A.signed('GET', '/me')).json()).friendCode;
  const cb = (await (await B.signed('GET', '/me')).json()).friendCode;
  const res = await burst([
    await A.sign('POST', '/friends/request', { code: cb }),
    await B.sign('POST', '/friends/request', { code: ca }),
  ]);
  const bodies = await bodiesOf(res);
  assert.deepEqual(res.map(r => r.status), [200, 200], `neither side may 500: ${JSON.stringify(bodies)}`);

  const fa = await (await A.signed('GET', '/friends')).json();
  const fb = await (await B.signed('GET', '/friends')).json();
  assert.equal(fa.friends.length, 1, `A must have exactly one friend, got ${fa.friends.length}`);
  assert.equal(fb.friends.length, 1, `B must have exactly one friend, got ${fb.friends.length}`);
  assert.equal(fa.incoming.length + fa.outgoing.length, 0, 'nothing may be left pending: both of them asked');
  assert.equal(fb.incoming.length + fb.outgoing.length, 0, 'nothing may be left pending: both of them asked');
});

/* ---------------------------------------------------------------------------
   9. POST /name -- two players reaching for the same joke.

   WAS: SELECT clash ; then blind UPDATE. idx_players_name_ci is the real guard,
   and the loser's UPDATE threw into the outer 500 handler instead of returning
   the designed 409 {reason:'taken', suggestNum}.
   DIRECTION: a 500 with a raw constraint message. BOUND: exactly one 200 and
   exactly one 409, and the 409 must still carry a usable suggestion.
--------------------------------------------------------------------------- */
await test('two players claiming one name at once: one wins, the other gets the named 409', async () => {
  const A = await newPlayer({ level: 3 }), B = await newPlayer({ level: 3 });
  const pick = { adj: 3, noun: 7, num: 100 + Math.floor(Math.random() * 800) };
  const res = await burst([
    await A.sign('POST', '/name', pick),
    await B.sign('POST', '/name', pick),
  ]);
  const bodies = await bodiesOf(res);
  const codes = res.map(r => r.status).sort();
  assert.deepEqual(codes, [200, 409], `expected one winner and one named refusal, got ${JSON.stringify(codes)} ${JSON.stringify(bodies)}`);
  const lost = bodies.find(b => b.ok === false);
  assert.equal(lost.reason, 'taken', 'the refusal must be a NAMED outcome, not a server error');
  assert.ok(Number.isInteger(lost.suggestNum) && lost.suggestNum >= 1, 'a free number must still be offered: ' + JSON.stringify(lost));
});

/* ---------------------------------------------------------------------------
   10. The rate limiter -- the shape that was already right, pinned so it stays.

   rateLimit() upserts with `hits = hits + 1 ... RETURNING hits`, which is a
   single statement, so the count cannot be lost or double-applied however many
   callers arrive together. This check exists because that property is the whole
   reason the limiter is trustworthy, and it is one refactor away from becoming
   a SELECT plus an UPDATE like everything else in this file used to be.
   DIRECTION of failure: MORE than the budget gets through. BOUND: exactly the
   configured 10 of rl_recovery, never 11.
--------------------------------------------------------------------------- */
await test('the rate limiter counts exactly, under a burst (no lost or doubled hits)', async () => {
  const ip = `198.51.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const rid = 'conc' + Math.floor(Math.random() * 1e6);
  const N = 30;
  const fires = [];
  for (let i = 0; i < N; i++) fires.push(() => fetch(`${BASE}/recovery/id/${rid}`, { headers: { 'cf-connecting-ip': ip } }));
  const res = await burst(fires);
  const through = res.filter(r => r.status !== 429).length;
  assert.equal(through, 10, `rl_recovery is 10 per window: exactly 10 of ${N} concurrent may pass, got ${through}`);
  assert.equal(res.filter(r => r.status === 429).length, N - 10, 'the rest must be refused');
});

async function befriend(x, y) {
  const cx = (await (await x.signed('GET', '/me')).json()).friendCode;
  const cy = (await (await y.signed('GET', '/me')).json()).friendCode;
  await x.signed('POST', '/friends/request', { code: cy });
  await y.signed('POST', '/friends/request', { code: cx });
  const fr = await (await x.signed('GET', '/friends')).json();
  assert.equal(fr.friends.length, 1, 'PRECONDITION: the two players must actually be friends');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
