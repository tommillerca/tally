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
import { flagFor } from './test-flag.mjs';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
/* Registrations are flagged when this run is NOT local, so a suite pointed at
   the live API mints accounts nobody can see. See server/test-flag.mjs. */
const IS_TEST = flagFor(BASE);
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
    body: JSON.stringify({ test: IS_TEST, pubkey: pubJwk }),
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
    body: JSON.stringify({ test: IS_TEST, pubkey: pubJwk }),
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

/* ---------------------------------------------------------------------------
   11. PUT /spires/<id>/claim -- the OWNER's re-claim, against a rival, on an
   AGED tower. Check 6 above races two rivals over a tower whose owner is not
   doing anything. Nothing in this suite ever contested a tower while its owner
   was tending it, which is exactly why the last read-across-an-await on this
   route survived every one of them.

   WAS: an early return in front of the upsert, taken on a `prev` read an await
   earlier, which answered `{ ok, already, level }` and ran
   `UPDATE spires SET tended_at, updated_at, defender WHERE id = ?` with NO owner
   clause. Every other write on this route re-checks ownership inside the
   statement; this one short-circuited in front of all of it.

   WHY AN AGED TOWER. The 1h shield covers one hour of a tower's 7 day life, so
   for the rest of it a rival takeover is perfectly legal, and an owner walking
   back to tend theirs is the routine action. Both at once is an ordinary
   Saturday, and the shielded fixtures above can never stage it.

   WHAT IS AND IS NOT THE BUG. `already: true` is NOT wrong on its own: an owner
   whose tend really did land a millisecond before a rival took the tower was
   told the truth, and that outcome is unavoidable in any concurrent system. The
   bug is `already` answered off a STALE READ, and it leaves a footprint. For the
   answer to be false the rival's write has to fall between the owner's read and
   the owner's UPDATE, and that unguarded UPDATE then necessarily lands on the
   WINNER's row: the loser's Bonehead ends up on the pennant and in the tower
   sheet, and tended_at is dragged off the claimed_at the winner's own upsert
   wrote it with, handing the winner a free dormancy and cap-window refresh. So
   the row itself says which of the two happened, and that is what is asserted
   here. It matters because js/app.js pays the flat consolation on `already`
   (see "Rewarded actions" in CLAUDE.md), so a false one is a paid no-op with
   the SERVER as the authority handing it back.

   WHY FOUR CLAIMS FROM THE OWNER. Same reason as BURST_LOAD, and it is a window
   widener, not a claim that players send four. The gap this bug lives in is one
   `if` wide, and on miniflare's in-process D1 a single owner request closes it
   before any rival write can arrive: raced one-against-one it showed up 1 time
   in 120, which is a guard that cannot fail. Four in flight give the rival's
   write four gaps to land in and reproduce it 26-30 times in 30. On real D1
   every statement is a network hop and one request is enough.

   DIRECTION of failure: the loser's write ends up on the winner's row, and the
   loser is paid for it. BOUND: zero, over every race that actually changed
   hands. Not a rate and not "most of them": one is the bug.
   Measured on 2026-09-01, 30 races per arm, against origin/main b81c11f9:
     BURST_LOAD=300 -> 26/30 false `already`, 26/30 wrong defender, 26/30 stray write
     BURST_LOAD=0   -> 30/30, 30/30, 30/30   (no artificial delay needed at all)
   After: 0/30 on every count in both arms, with 8 and 30 truthful `already`
   answers respectively, so the branch was still being exercised.
--------------------------------------------------------------------------- */
await test('a spire claim that loses the race never writes the winner\'s row, or gets paid for it', async () => {
  const ROUNDS = 5, OWNER_CLAIMS = 4;
  let changedHands = 0, falseAlready = 0, truthfulAlready = 0, strayWrite = 0, wrongDefender = 0;
  for (let i = 0; i < ROUNDS; i++) {
    // distinguishable builds, so the defender left on the row names WHO wrote it
    const owner = await newPlayer({ level: 9, weapon: 'ownerblade' });
    const rival = await newPlayer({ level: 9, weapon: 'rivalpike' });
    const eye = await newPlayer();  // a third party: /spires masks defender from its own holder
    const id = nextSpireId();
    assert.equal((await owner.signed('PUT', `/spires/${id}/claim`, { name: 'Aged', lat: 7, lng: 8 })).status, 200,
      'PRECONDITION: the owner must actually hold it');
    // age it past the shield the owner's own claim just raised, so the rival's
    // takeover is LEGAL and this is the race players really meet
    const w = await (await fetch(`${BASE}/dev/spire-warp`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, backMs: 2 * 3600000 }),
    })).json();
    assert.equal(w.row.owner, owner.id, 'PRECONDITION: the warp moves clocks, never ownership');
    assert.ok(w.row.claimed_at < Date.now() - 3600000, 'PRECONDITION: the tower is really past its shield');

    const fires = [];
    for (let k = 0; k < OWNER_CLAIMS; k++) fires.push(await owner.sign('PUT', `/spires/${id}/claim`, { name: 'Aged', lat: 7, lng: 8 }));
    fires.splice(1, 0, await rival.sign('PUT', `/spires/${id}/claim`, { name: 'Aged', lat: 7, lng: 8 }));
    const res = await burst(fires);
    const ownerBodies = await bodiesOf(res.filter((_, k) => k !== 1));
    const row = (await (await eye.signed('GET', `/spires?ids=${id}`)).json()).spires[0];
    if (row.owner !== rival.id) continue;   // the owner held it off; nothing was lost, nothing to judge
    changedHands++;
    const wrongDef = !!(row.defender && row.defender.weapon === 'ownerblade');
    /* The winner's upsert writes claimed_at and tended_at from ONE `now`, so any
       drift between them is somebody else's write landing after it. */
    const late = wrongDef || row.tendedAt !== row.claimedAt;
    if (wrongDef) wrongDefender++;
    if (late) strayWrite++;
    if (ownerBodies.some(b => b.ok === true && b.already === true)) (late ? falseAlready++ : truthfulAlready++);
  }
  /* changedHands is the denominator, and it is the only one worth asserting.
     How many owners get answered `already` is NOT: once the rival's takeover
     lands ahead of the owner's first claim every later one is correctly refused
     as shielded and none of them says `already` at all, which is a legitimate
     ordering and happened in about 1 run in 5. Asserting on it made this check
     go red on healthy code. The positive control for that branch is the next
     test down, where it is deterministic. */
  assert.ok(changedHands > 0, `EMPTY SAMPLE: no race in ${ROUNDS} changed hands, so nothing was measured`);
  assert.equal(wrongDefender, 0,
    `the loser's build may never end up defending the winner's tower: ${wrongDefender} of ${changedHands}`);
  assert.equal(strayWrite, 0,
    `nothing may write the winner's row after its own claim: ${strayWrite} of ${changedHands} had tended_at dragged off claimed_at`);
  assert.equal(falseAlready, 0,
    `an 'already' answered off a stale read is a paid no-op: ${falseAlready} of ${changedHands} (${truthfulAlready} truthful), and js/app.js pays every one`);
});

/* And the CONTROL for it: uncontested, a re-claim is still a tend. If check 11
   went green by breaking the ordinary path instead of fixing the race, this is
   what says so. */
await test('an uncontested re-claim of my own aged tower is still a tend that refreshes it', async () => {
  const owner = await newPlayer({ level: 9, weapon: 'ownerblade' });
  const eye = await newPlayer();
  const id = nextSpireId();
  assert.equal((await owner.signed('PUT', `/spires/${id}/claim`, { name: 'Quiet', lat: 9, lng: 10 })).status, 200);
  await fetch(`${BASE}/dev/spire-warp`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, backMs: 2 * 3600000 }),
  });
  const before = (await (await eye.signed('GET', `/spires?ids=${id}`)).json()).spires[0];
  const again = await (await owner.signed('PUT', `/spires/${id}/claim`, { name: 'Quiet', lat: 9, lng: 10 })).json();
  assert.equal(again.already, true, 're-claiming my own tower is a tend, and must still say so');
  assert.equal(again.level, 1, 'a tend must not level the tower');
  const after = (await (await eye.signed('GET', `/spires?ids=${id}`)).json()).spires[0];
  assert.equal(after.owner, owner.id, 'and it must still be mine');
  assert.ok(after.tendedAt > before.tendedAt,
    `the tend must have moved tended_at: ${before.tendedAt} -> ${after.tendedAt}`);
  assert.equal(after.claimedAt, before.claimedAt, 'a tend is not a takeover: claimed_at must not move');
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
