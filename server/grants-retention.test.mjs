/* Grants-retention tests against a running Worker.
 *
 *   npx wrangler d1 execute bonez --local --file=schema.sql
 *   npm run dev            # or: npx wrangler dev --local --port 8788 --var DEV:1 --var ADMIN_TOKEN:devtoken
 *   node grants-retention.test.mjs
 *
 * WHY THIS FILE IS NOT retention.test.mjs. Pruning telemetry and pruning grants
 * look like the same job and are not. An events row is an anonymous count; a
 * grants row is the DELIVERY RECORD for somebody's gift, welcome kit or step
 * race prize, and the client reads it exactly once. Deleting the wrong one does
 * not lose a statistic, it eats a present, and nothing anywhere goes red when it
 * happens: the player just never gets the thing their friend sent.
 *
 * So the weighting here is deliberately lopsided. There are more KEEP tests than
 * DELETE tests, and the KEEP tests are the ones written first, because a pruner
 * that is too lazy costs disk and a pruner that is too eager costs trust. Every
 * assertion states its DIRECTION, and every one proves its fixture EXISTS before
 * it proves anything about what the pruner did to it: an empty sample set is a
 * FAILURE, never a pass.
 *
 * The sharpest case is the one that has no signal at all. The grants cursor
 * lives on the DEVICE (js/social.js grantCursor, in the IndexedDB kv store), so
 * before players.grants_ack the server could not tell a delivered gift from one
 * still waiting. The test that matters most is therefore "a 300 day old gift for
 * a player who has never acknowledged anything is still there", because that is
 * the row a naive age-based pruner takes and nobody notices.
 *
 * Needs DEV=1 and ADMIN_TOKEN, exactly like the other suites.
 */
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const BASE = process.env.BASE || process.env.API || 'http://127.0.0.1:8788';

/* The limiter outlives the process, and this suite registers players, so a
   second run starts throttled and every case fails as "too many requests"
   rather than on its own merits. security.test.mjs and recovery.test.mjs
   already do this; this file predates the rate_limits table, which is why it
   was the only one still bleeding. */
if (/127\.0\.0\.1|localhost/.test(BASE)) {
  try {
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'bonez', '--local', '--command', 'DELETE FROM rate_limits'],
      { cwd: import.meta.dirname, stdio: 'ignore' });
  } catch { console.log('(could not reset the rate limiter; some limits may already be spent)'); }
}
const DAY = 86400000;
const RETENTION_DAYS = 90;      // must match GRANT_RETENTION_DAYS in src/index.js
let passed = 0, failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); failed++; }
}

const RUN = Math.random().toString(36).slice(2, 8);
const b64 = buf => Buffer.from(buf).toString('base64');

async function makeKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { kp, pubJwk: await crypto.subtle.exportKey('jwk', kp.publicKey) };
}
async function signedFetch(kp, playerId, method, path, body = '') {
  const ts = Date.now();
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey,
    new TextEncoder().encode(`${method}\n${path}\n${ts}\n${body}`));
  return fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-bh-player': playerId, 'x-bh-ts': String(ts), 'x-bh-sig': b64(sig) },
    body: method === 'GET' ? undefined : body,
  });
}
async function postJson(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}

/** A brand new account with its own keypair, so one test can never move another
 *  test's acknowledgement cursor. */
/* THIS SUITE NEEDS 16 REGISTRATIONS AND rl_register_ip ALLOWS 10 AN HOUR.
   Resetting once at import is not enough: the suite outruns the limit halfway
   through its own run, and every case after that failed as "too many requests"
   rather than on its own merits, which reads as nine broken features instead of
   one exhausted counter. Clearing the counter on a 429 and retrying ONCE keeps
   the limit itself honest (it is a real guard on a real route, and lowering it
   for tests would be testing a different server) while letting the suite finish.
   A second 429 is a genuine failure and still asserts. */
async function register(pubJwk) {
  return (await fetch(BASE + '/register', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pubkey: pubJwk }),
  })).json();
}
async function newPlayer() {
  const { kp, pubJwk } = await makeKeys();
  let r = await register(pubJwk);
  if (!r.playerId && /127\.0\.0\.1|localhost/.test(BASE)) {
    try {
      execFileSync('npx', ['wrangler', 'd1', 'execute', 'bonez', '--local', '--command', 'DELETE FROM rate_limits'],
        { cwd: import.meta.dirname, stdio: 'ignore' });
      r = await register(pubJwk);
    } catch { /* fall through to the assert with the original answer */ }
  }
  assert.ok(r.playerId, 'register failed: ' + JSON.stringify(r));
  return { kp, id: r.playerId };
}

/** Plant a grant at a chosen AGE. Returns its id, which is what the ack is
 *  expressed in. */
async function plant(playerId, key, type, ageMs, payload = { coins: 25, note: 'test' }) {
  const r = await postJson('/dev/grant-aged', { playerId, key, type, ageMs, payload });
  assert.equal(r.status, 200, `plant failed: ${r.text}`);
  assert.ok(r.json.id, `plant returned no id: ${r.text}`);
  return r.json.id;
}
async function grantsOf(playerId) {
  const r = await fetch(`${BASE}/dev/grants?player=${encodeURIComponent(playerId)}`);
  assert.equal(r.status, 200, `dev/grants needs DEV=1 (got ${r.status})`);
  return (await r.json()).rows;
}
const keysOf = rows => rows.map(r => r.key);
async function ackOf(playerId) {
  const r = await fetch(`${BASE}/dev/grants-ack?player=${encodeURIComponent(playerId)}`);
  assert.equal(r.status, 200);
  return (await r.json()).ack;
}
async function prune(opts = {}) {
  const r = await postJson('/dev/prune-grants', opts);
  assert.equal(r.status, 200, `prune failed: ${r.text}`);
  return r.json;
}
/** Run to completion so a later bounded test measures its OWN rows rather than
 *  a backlog some earlier test left behind. */
async function drain() {
  for (let i = 0; i < 40; i++) {
    const r = await prune();
    if (!r.more) return r;
  }
  throw new Error('drain never finished in 40 ticks');
}

const OLD = (RETENTION_DAYS + 30) * DAY;   // comfortably past the line
const NEW = 5 * DAY;                       // comfortably inside it

// ---------------------------------------------------------------------------
await test('DEV hooks are reachable (otherwise every result below is vacuous)', async () => {
  const r = await fetch(BASE + '/health');
  assert.equal(r.status, 200, 'no worker at ' + BASE);
  const p = await newPlayer();
  assert.equal((await grantsOf(p.id)).length, 1, 'a fresh account should hold exactly its welcome grant');
});

await test('the pruner reports the window it actually enforces', async () => {
  const r = await prune({ maxRows: 0 });
  assert.equal(r.retentionDays, RETENTION_DAYS, `window is ${r.retentionDays} days, expected ${RETENTION_DAYS}`);
  assert.ok(Math.abs(r.cutoffTs - (Date.now() - RETENTION_DAYS * DAY)) < 60000, 'cutoff is not the window it claims');
});

/* ---------------- THE ACKNOWLEDGEMENT, which everything else rests on ------ */

await test('GET /grants records how far the client has read (grants_ack)', async () => {
  const p = await newPlayer();
  const id = await plant(p.id, `ack-${RUN}-a`, 'social', NEW);
  // DIRECTION: null -> the cursor the client sent. BOUND: it must be null first,
  // or this proves nothing about what the route did.
  assert.equal(await ackOf(p.id), null, 'a fresh account should have acknowledged nothing');
  const r = await signedFetch(p.kp, p.id, 'GET', `/grants?since=${id}`);
  const body = await r.text();
  assert.equal(r.status, 200, body);
  assert.equal(await ackOf(p.id), id, 'GET /grants did not record the cursor it was called with');
});

await test('the ack is CLAMPED: a wild cursor cannot acknowledge grants nobody was shown', async () => {
  const p = await newPlayer();
  const id = await plant(p.id, `ack-${RUN}-b`, 'social', NEW);
  // A client asking for everything above a far-future id. Left unclamped this
  // would mark every grant the account ever receives below that id as delivered,
  // and the pruner would eat real gifts 90 days later.
  const r = await signedFetch(p.kp, p.id, 'GET', `/grants?since=${id + 1000000}`);
  assert.equal(r.status, 200);
  await r.json();
  const ack = await ackOf(p.id);
  // DIRECTION: capped at this player's own highest grant id. BOUND: never above it.
  assert.ok(ack <= id, `ack ran ahead of the account's newest grant (${ack} > ${id})`);
});

await test('the ack only ever RISES, so a restored client cannot un-acknowledge', async () => {
  const p = await newPlayer();
  const id = await plant(p.id, `ack-${RUN}-c`, 'social', NEW);
  await (await signedFetch(p.kp, p.id, 'GET', `/grants?since=${id}`)).json();
  assert.equal(await ackOf(p.id), id, 'fixture did not land');
  // A reinstall restores an OLD backup, so grantCursor comes back stale and the
  // next pull asks from further down. That must not lower the watermark.
  await (await signedFetch(p.kp, p.id, 'GET', '/grants?since=0')).json();
  assert.equal(await ackOf(p.id), id, 'a stale cursor lowered the acknowledgement watermark');
});

/* ---------------- KEEP ----------------------------------------------------- */

await test('KEEPS a 120-day-old GIFT for a player who has never acknowledged anything', async () => {
  const p = await newPlayer();
  await plant(p.id, `keep-${RUN}-unread`, 'gift', OLD, { coins: 200, from: 'A Friend', gift: true });
  // BOUND: the fixture must exist, or the assertion after the drain is vacuous.
  assert.ok(keysOf(await grantsOf(p.id)).includes(`keep-${RUN}-unread`), 'fixture did not land');
  await drain();
  // DIRECTION: unchanged. This is THE test. Age alone must never be enough to
  // delete something carrying value: the only safe signal is the client saying
  // it has the row, and this player's client has never said anything.
  assert.ok(keysOf(await grantsOf(p.id)).includes(`keep-${RUN}-unread`),
    'an unread 120-day-old gift was deleted: a player just lost a present');
});

await test('KEEPS an ACKNOWLEDGED grant that is still inside the window', async () => {
  const p = await newPlayer();
  const id = await plant(p.id, `keep-${RUN}-fresh`, 'social', NEW);
  await (await signedFetch(p.kp, p.id, 'GET', `/grants?since=${id}`)).json();
  assert.equal(await ackOf(p.id), id, 'fixture did not land');
  await drain();
  // DIRECTION: unchanged. The age bound is the margin that survives a restore
  // rolling the client's cursor backwards, so acknowledgement alone is not a
  // licence to delete immediately.
  assert.ok(keysOf(await grantsOf(p.id)).includes(`keep-${RUN}-fresh`),
    'a 5-day-old grant was pruned the moment it was acknowledged');
});

await test('KEEPS a stepweek- RECEIPT forever, acknowledged and ancient', async () => {
  const p = await newPlayer();
  /* A week nobody else in this run or any previous run has used. /steps/settled
     reads by KEY across every player, so a shared constant here would have this
     test grading the leftovers of the last run as well as its own. */
  const week = new Date(Date.UTC(1990, 0, 1) + Math.floor(Math.random() * 9000) * DAY).toISOString().slice(0, 10);
  const steps = 90000 + Math.floor(Math.random() * 9000);
  const id = await plant(p.id, `stepweek-${week}`, 'social', 5 * 365 * DAY,
    { coins: 5000, place: 1, steps, note: `1st in the step race with ${steps} steps!` });
  await (await signedFetch(p.kp, p.id, 'GET', `/grants?since=${id}`)).json();
  assert.equal(await ackOf(p.id), id, 'fixture did not land');
  await drain();
  // DIRECTION: unchanged, at any age, under every rule. /steps/settled reads
  // these rows back as the receipt for a race that already paid, and the route's
  // own comment explains why the live board cannot answer the same question.
  assert.ok(keysOf(await grantsOf(p.id)).includes(`stepweek-${week}`),
    'a step-race receipt was pruned: the settled podium for that week is now unreadable');
  // And prove it through the ROUTE, not only the table: a receipt that survives
  // but no longer answers is the same outage with extra steps.
  const r = await signedFetch(p.kp, p.id, 'GET', `/steps/settled?week=${week}`);
  assert.equal(r.status, 200);
  const podium = (await r.json()).podium;
  const mine = podium.find(x => x.steps === steps);
  assert.ok(mine, `the settled podium no longer contains the paid row (got ${JSON.stringify(podium)})`);
  assert.equal(mine.place, 1);
});

await test('KEEPS a cheer that is inside the window', async () => {
  const p = await newPlayer();
  await plant(p.id, `cheer-${RUN}-fresh`, 'cheer', NEW, { from: 'A Friend', cheer: 3, note: 'A Friend cheered you' });
  assert.ok(keysOf(await grantsOf(p.id)).includes(`cheer-${RUN}-fresh`), 'fixture did not land');
  await drain();
  // DIRECTION: unchanged. Cheers lose their age protection, not their delivery.
  assert.ok(keysOf(await grantsOf(p.id)).includes(`cheer-${RUN}-fresh`),
    'a 5-day-old cheer was pruned: the window is being ignored for cheers');
});

await test('the 90-day boundary: day 89 lives, day 91 dies', async () => {
  const p = await newPlayer();
  const a = await plant(p.id, `edge-${RUN}-89`, 'social', 89 * DAY);
  const b = await plant(p.id, `edge-${RUN}-91`, 'social', 91 * DAY);
  await (await signedFetch(p.kp, p.id, 'GET', `/grants?since=${Math.max(a, b)}`)).json();
  assert.equal(await ackOf(p.id), Math.max(a, b), 'fixture did not land');
  assert.equal((await grantsOf(p.id)).filter(r => r.key.startsWith(`edge-${RUN}`)).length, 2, 'fixture did not land');
  await drain();
  const left = keysOf(await grantsOf(p.id));
  assert.ok(left.includes(`edge-${RUN}-89`), 'day 89 was pruned: the window is too tight');
  assert.ok(!left.includes(`edge-${RUN}-91`), 'day 91 survived: the window is too loose');
});

/* ---------------- DELETE --------------------------------------------------- */

await test('DELETES an acknowledged grant that is past the window', async () => {
  const p = await newPlayer();
  const id = await plant(p.id, `gone-${RUN}-acked`, 'social', OLD);
  await (await signedFetch(p.kp, p.id, 'GET', `/grants?since=${id}`)).json();
  assert.equal(await ackOf(p.id), id, 'fixture did not land');
  assert.ok(keysOf(await grantsOf(p.id)).includes(`gone-${RUN}-acked`), 'fixture did not land');
  await drain();
  // DIRECTION: gone. This is the only reason the table has a ceiling at all.
  assert.ok(!keysOf(await grantsOf(p.id)).includes(`gone-${RUN}-acked`),
    'a delivered, acknowledged, 120-day-old grant survived: nothing is being reclaimed');
});

await test('DELETES a stale CHEER even though it was never acknowledged', async () => {
  const p = await newPlayer();
  await plant(p.id, `cheer-${RUN}-stale`, 'cheer', OLD, { from: 'A Friend', cheer: 7, note: 'A Friend cheered you' });
  assert.ok(keysOf(await grantsOf(p.id)).includes(`cheer-${RUN}-stale`), 'fixture did not land');
  await drain();
  /* DIRECTION: gone, and this is the ONE rule that deletes something a client
     has not read, so it is the one that has to be justified rather than
     assumed. /cheer builds its payload from { from, cheer, cheerFrom, note }
     and nothing else: there is no coins, xp, dust, crate, gearId, egg or
     consumable field, so applyPayload has nothing to award. Losing one costs a
     toast, not a reward. If this test goes red because /cheer started paying
     something, the RULE is what has to change, not the test. */
  assert.ok(!keysOf(await grantsOf(p.id)).includes(`cheer-${RUN}-stale`),
    'a 120-day-old cheer survived: the valueless-grant rule is not running');
});

await test('a cheer that STARTS PAYING is a rule change, not a test failure', async () => {
  // Not a database assertion: a source assertion, and the only guard that can
  // catch the day somebody adds coins to a cheer. The pruner deletes cheers
  // without asking whether they were delivered, and that is only sound while
  // the payload is inert.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./src/index.js', import.meta.url), 'utf8');
  /* Matches the assignment form AND the object-property form. /cheer moved from
     `const payload = JSON.stringify({...})` to an inline `payload:` inside
     insertCappedGrant when the daily cap landed, and the old pattern then matched
     nothing, which is why this assertion went red rather than quietly passing.
     Anchor on the cheer-specific fields, not on the surrounding syntax. */
  const m = /(?:const payload = |payload: )JSON\.stringify\(\{ from: fromName, cheer[^\n]*\n/.exec(src);
  assert.ok(m, 'the /cheer payload line has moved; re-read it and re-check the pruner rule');
  for (const field of ['coins', 'xp', 'dust', 'crate', 'gearId', 'egg', 'consumable']) {
    assert.ok(!new RegExp(`\\b${field}\\b`).test(m[0]),
      `/cheer now puts "${field}" in its payload, so pruning unread cheers can destroy value. ` +
      'Remove cheers from the valueless rule in pruneGrants, or stop paying on a cheer.');
  }
});

/* ---------------- BOUNDS --------------------------------------------------- */

await test('a run is BOUNDED by maxRows and resumes on the next tick', async () => {
  await drain();                       // start from a clean backlog
  const p = await newPlayer();
  for (let i = 0; i < 25; i++) {
    await plant(p.id, `batch-${RUN}-${i}`, 'cheer', OLD + i * 1000, { from: 'F', cheer: 1, note: 'F cheered you' });
  }
  assert.equal((await grantsOf(p.id)).filter(r => r.key.startsWith(`batch-${RUN}`)).length, 25, 'fixture did not land');

  // DIRECTION: strictly downward, in steps no larger than maxRows. BOUND: never
  // more than 10 in one tick, because a tick that runs away holds D1's single
  // writer while every gift and profile sync queues behind it.
  const a = await prune({ maxRows: 10, batch: 5 });
  assert.equal(a.total, 10, `a bounded tick deleted ${a.total}, expected exactly 10`);
  assert.equal(a.stopped, 'maxRows');
  assert.equal(a.more, true, 'a tick that hit its bound must say there is more to do');
  assert.equal((await grantsOf(p.id)).filter(r => r.key.startsWith(`batch-${RUN}`)).length, 15);

  const b = await prune({ maxRows: 10, batch: 5 });
  assert.equal(b.total, 10, 'the next tick did not resume where the last one stopped');
  const c = await prune();
  assert.equal(c.more, false, 'a finished tick must not claim there is a backlog');
  assert.equal((await grantsOf(p.id)).filter(r => r.key.startsWith(`batch-${RUN}`)).length, 0);
});

await test('a wall-clock bound also stops a run, and stops it cleanly', async () => {
  const p = await newPlayer();
  for (let i = 0; i < 12; i++) {
    await plant(p.id, `clock-${RUN}-${i}`, 'cheer', OLD + i * 1000, { from: 'F', cheer: 1, note: 'F cheered you' });
  }
  assert.equal((await grantsOf(p.id)).filter(r => r.key.startsWith(`clock-${RUN}`)).length, 12, 'fixture did not land');
  const r = await prune({ budgetMs: 1, batch: 1 });
  assert.ok(r.stopped === 'budgetMs' || r.more === false,
    `a 100ms budget neither finished nor reported stopping: ${JSON.stringify(r)}`);
  await drain();
  assert.equal((await grantsOf(p.id)).filter(r => r.key.startsWith(`clock-${RUN}`)).length, 0,
    'the interrupted run did not resume to completion');
});

await test('pruning grants does not disturb the EVENTS pruner or the front door', async () => {
  // The two run back to back on the same cron tick and share a wall clock.
  const p = await newPlayer();
  const id = await plant(p.id, `live-${RUN}`, 'social', NEW, { coins: 10, note: 'still here' });
  await drain();
  // DIRECTION: a brand new grant is still deliverable through the real route.
  const r = await signedFetch(p.kp, p.id, 'GET', `/grants?since=${id - 1}`);
  assert.equal(r.status, 200);
  const got = (await r.json()).grants.map(g => g.key);
  assert.ok(got.includes(`live-${RUN}`), 'a fresh grant stopped being deliverable after a prune');
});

// The real scheduled() path, which is where BOTH pruners actually run. wrangler
// only exposes it with --test-scheduled, so this reports SKIPPED rather than
// failing when the dev server was started without it.
await (async () => {
  const name = 'scheduled() runs the grants pruner too';
  const probe = await fetch(BASE + '/__scheduled?cron=*%2F15+*+*+*+*');
  if (probe.status === 404) {
    await probe.text();
    console.log(`  SKIP  ${name} (dev server not started with --test-scheduled)`);
    return;
  }
  await probe.text();
  await test(name, async () => {
    const p = await newPlayer();
    await plant(p.id, `cron-${RUN}`, 'cheer', OLD, { from: 'F', cheer: 1, note: 'F cheered you' });
    assert.ok(keysOf(await grantsOf(p.id)).includes(`cron-${RUN}`), 'fixture did not land');
    const r = await fetch(BASE + '/__scheduled?cron=*%2F15+*+*+*+*');
    await r.text();
    assert.equal(r.status, 200);
    assert.ok(!keysOf(await grantsOf(p.id)).includes(`cron-${RUN}`), 'the cron entry point pruned no grants');
  });
})();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
