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
import assert from 'node:assert/strict';
import { flagFor } from './test-flag.mjs';

const BASE = process.env.BASE || process.env.API || 'http://127.0.0.1:8788';
/* Registrations are flagged when this run is NOT local, so a suite pointed at
   the live API mints accounts nobody can see. See server/test-flag.mjs. */
const IS_TEST = flagFor(BASE);

const DAY = 86400000;
const RETENTION_DAYS = 90;      // must match GRANT_RETENTION_DAYS in src/index.js
const DORMANT_DAYS = 180;       // must match GRANT_DORMANT_DAYS in src/index.js
const ADMIN = process.env.ADMIN_TOKEN || 'devtoken';
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
/* THIS SUITE MAKES 22 REGISTRATIONS AND rl_register_ip ALLOWS 10 AN HOUR, so
   sending them all from one address cannot work and never did: it used to clear
   the whole rate_limits table on every 429 and retry once, which meant the suite
   only finished when a several-second `wrangler d1 execute` subprocess won a race
   against the dev worker holding the same SQLite file. When it lost, nine
   unrelated cases failed as "too many requests" and the gate read as a broken
   pruner. That is the coin flip this file used to be, and the counter it kept
   resetting was not even its own budget.
   Each account now arrives from its own synthetic edge IP instead, which is the
   pattern test/api.test.mjs already documents at rndIp(): cf-connecting-ip is set
   by Cloudflare at the edge in production and a client-supplied value is replaced
   there, so this is only settable locally, and a dozen phones on a dozen
   addresses is what this suite honestly is. The limit itself is untouched, and
   security.test.mjs still proves it bites by pinning ONE address and exhausting
   it. Random per run rather than a fixed sequence, on purpose: fixed addresses
   would make the second run against one local database start throttled, which is
   the history dependence this replaces. */
const rndIp = () => `198.18.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
async function register(pubJwk) {
  return (await fetch(BASE + '/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': rndIp() },
    body: JSON.stringify({ test: IS_TEST, pubkey: pubJwk }),
  })).json();
}
async function newPlayer() {
  const { kp, pubJwk } = await makeKeys();
  const r = await register(pubJwk);
  assert.ok(r.playerId,
    'register failed, and a 429 here means a registration went out without its own cf-connecting-ip: '
    + JSON.stringify(r));
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
/** Move a player's whole clock backwards, so "this account has not been seen in
 *  N days" is a state a test can build. /dev/player-warp is the real fixture the
 *  snapshot-bounds tests already use; it moves created_at, last_seen and
 *  max_level_at together, which is the only combination the real world produces. */
async function warpPlayer(playerId, backMs) {
  const r = await postJson('/dev/player-warp', { id: playerId, backMs });
  assert.equal(r.status, 200, `player-warp failed: ${r.text}`);
  assert.ok(r.json.row, `player-warp matched no player: ${r.text}`);
  return r.json.row;
}
const lastSeenOf = async playerId => (await warpPlayer(playerId, 0)).last_seen;
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
  assert.equal(r.dormantDays, DORMANT_DAYS, `dormancy window is ${r.dormantDays} days, expected ${DORMANT_DAYS}`);
  assert.ok(Math.abs(r.dormantTs - (Date.now() - DORMANT_DAYS * DAY)) < 60000, 'the dormancy cutoff is not the window it claims');
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

/* ---------------- DORMANCY (2026-08-25) -----------------------------------
   Tom's decision: an unacknowledged value-bearing grant expires after 180 days
   of the GIFT's age AND 180 days of the RECIPIENT's silence. Three tests, and
   the two KEEPs are the important ones: the whole risk of this rule is that
   somebody drops the second predicate as a simplification, at which point it is
   a delete-on-age rule and it eats presents belonging to people who are playing
   right now. An unacknowledged grant does not mean an absent player; it means
   the ack never landed, which happens on an old build, after a cloud restore
   rolls the cursor backwards, and whenever the ack write fails. */

await test('KEEPS a 200-day-old unread GIFT for a player who is still ACTIVE', async () => {
  const p = await newPlayer();
  await plant(p.id, `dorm-${RUN}-active`, 'gift', (DORMANT_DAYS + 20) * DAY, { coins: 500, from: 'A Friend', gift: true });
  // BOUND, both halves: the gift must be past the age line and the player must
  // be inside the silence line, or this passes for the wrong reason.
  assert.ok(keysOf(await grantsOf(p.id)).includes(`dorm-${RUN}-active`), 'fixture did not land');
  const seen = await lastSeenOf(p.id);
  assert.ok(seen > Date.now() - DORMANT_DAYS * DAY,
    `fixture did not land: the player is already dormant (last_seen ${new Date(seen).toISOString()})`);
  await drain();
  /* DIRECTION: unchanged. THIS IS THE TEST. Age alone is not a licence to
     delete something carrying value, at ANY age, while the recipient is still
     opening the app. If this goes red the rule has become delete-on-age and a
     live player has just lost 500 coins their friend sent them. */
  assert.ok(keysOf(await grantsOf(p.id)).includes(`dorm-${RUN}-active`),
    'a 200-day-old unread gift was deleted from an ACTIVE account: the dormancy rule is ignoring the recipient');
});

await test('KEEPS a fresh unread gift for a player who HAS gone dormant', async () => {
  const p = await newPlayer();
  await plant(p.id, `dorm-${RUN}-young`, 'gift', 30 * DAY, { coins: 500, from: 'A Friend', gift: true });
  await warpPlayer(p.id, (DORMANT_DAYS + 20) * DAY);
  assert.ok(keysOf(await grantsOf(p.id)).includes(`dorm-${RUN}-young`), 'fixture did not land');
  assert.ok(await lastSeenOf(p.id) < Date.now() - DORMANT_DAYS * DAY, 'fixture did not land: the player is not dormant');
  await drain();
  // DIRECTION: unchanged. The other half of the AND. A player who stops playing
  // does not forfeit the gift that arrived last month; they forfeit the one that
  // has been sitting unopened for longer than they have been gone.
  assert.ok(keysOf(await grantsOf(p.id)).includes(`dorm-${RUN}-young`),
    'a 30-day-old gift was deleted because its recipient is dormant: the age bound is not being applied');
});

await test('DELETES a 200-day-old unread gift once its recipient has ALSO been gone 200 days', async () => {
  const p = await newPlayer();
  await plant(p.id, `dorm-${RUN}-gone`, 'gift', (DORMANT_DAYS + 20) * DAY, { coins: 500, from: 'A Friend', gift: true });
  await warpPlayer(p.id, (DORMANT_DAYS + 20) * DAY);
  assert.ok(keysOf(await grantsOf(p.id)).includes(`dorm-${RUN}-gone`), 'fixture did not land');
  assert.ok(await lastSeenOf(p.id) < Date.now() - DORMANT_DAYS * DAY, 'fixture did not land: the player is not dormant');
  await drain();
  // DIRECTION: gone, and this is the only rule in the file that deletes a
  // value-bearing row the client never read. It is sound because BOTH clocks ran
  // out: nothing has come for this gift, and nobody has come for the account.
  assert.ok(!keysOf(await grantsOf(p.id)).includes(`dorm-${RUN}-gone`),
    'a 200-day-old unread gift for a 200-day-dormant account survived: the tail still has no ceiling');
});

await test('a stepweek- RECEIPT survives dormancy too, on both clocks', async () => {
  // The carve-out is unconditional and the new rule must not have punched a hole
  // in it: this is the receipt /steps/settled reads back for a race that paid.
  const p = await newPlayer();
  const week = new Date(Date.UTC(1990, 0, 1) + Math.floor(Math.random() * 9000) * DAY).toISOString().slice(0, 10);
  await plant(p.id, `stepweek-${week}`, 'social', (DORMANT_DAYS + 400) * DAY, { coins: 5000, place: 2, steps: 70001 });
  await warpPlayer(p.id, (DORMANT_DAYS + 400) * DAY);
  assert.ok(keysOf(await grantsOf(p.id)).includes(`stepweek-${week}`), 'fixture did not land');
  await drain();
  assert.ok(keysOf(await grantsOf(p.id)).includes(`stepweek-${week}`),
    'the dormancy rule ate a step-race receipt: the settled podium for that week is now unreadable');
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

/* ---------------- SAVE SIZE, WATCHED RATHER THAN PRUNED -------------------
   Tom's decision on the backups table was "prune nothing, watch the average",
   ON THE CONDITION that the average becomes visible. So the thing that has to
   be tested is not a deletion, it is that the number on /admin/prune is an
   OBSERVATION and not a forecast somebody typed in: it has to move when the
   saves move. A hardcoded projection would pass every assertion about its own
   arithmetic and still be worthless the month saves double in size. */
await test('/admin/prune reports the save-size trend, and it MOVES with the saves', async () => {
  const status = async () => {
    const r = await fetch(`${BASE}/admin/prune?token=${encodeURIComponent(ADMIN)}`);
    assert.equal(r.status, 200, `/admin/prune answered ${r.status}; is ADMIN_TOKEN ${ADMIN}?`);
    const b = (await r.json()).tables.backups;
    assert.ok(b, 'no backups figures on /admin/prune at all: decision 3 is not implemented');
    return b;
  };
  const pushSave = async (p, bytes) => {
    const body = JSON.stringify({ blob: 'A'.repeat(bytes), appV: 'test' });
    const r = await signedFetch(p.kp, p.id, 'PUT', '/backup', body);
    const t = await r.text();
    assert.equal(r.status, 200, `PUT /backup failed: ${t}`);
  };

  // A small save first, so the fixture exists before anything is asserted about
  // it: on a fresh local database the table is empty and every figure below
  // would be null, which is the empty-sample failure, not a pass.
  await pushSave(await newPlayer(), 4096);
  const before = await status();
  assert.ok(before.rows > 0, 'the fixture did not land: no backup rows to average');
  assert.equal(before.avgBytes, Math.round(before.bytes / before.rows), 'avgBytes is not bytes/rows');
  assert.equal(before.playersAtBudget, Math.round(before.budgetBytes / before.avgBytes),
    'playersAtBudget is not the budget divided by the CURRENT average, so it is a forecast, not a measurement');
  assert.ok(before.budgetFraction > 0 && before.budgetFraction <= 1,
    `the budget fraction (${before.budgetFraction}) has to travel with the projection or the number means nothing`);

  // Now a save an order of magnitude bigger, which is exactly what a maturing
  // save looks like. DIRECTION: the average and the max go UP, the projected
  // player count goes DOWN. That fall is the signal the decision rests on.
  /* BIG IS MEASURED, NOT GUESSED, and it used to be a flat 400 KB. That was red
     on origin/main before this branch touched anything, in deploy.sh's own order
     on a fresh database: test/api.test.mjs runs first and leaves a 2 MB and a
     3 MB save behind, so the mean was already 1.2 MB and a 400 KB "big" save
     pulled it DOWN. The assertion was right about the direction; the fixture was
     too small for the table it was being asserted against. Anything above the
     current mean raises the mean, so the fixture now comes from the mean. */
  const big = Math.min(before.avgBytes + 400 * 1024, 4 * 1024 * 1024 - 1024);
  assert.ok(big > before.avgBytes,
    `the 4 MB cap leaves no room above the current average (${before.avgBytes}), so this test can no longer move it`);
  await pushSave(await newPlayer(), big);
  const after = await status();
  assert.equal(after.rows, before.rows + 1, 'the second save did not land as its own row');
  assert.ok(after.avgBytes > before.avgBytes, `the average did not move (${before.avgBytes} -> ${after.avgBytes})`);
  assert.ok(after.maxBytes >= big, `the largest save is reported as ${after.maxBytes}, under the ${big} just written`);
  assert.ok(after.playersAtBudget < before.playersAtBudget,
    `the projected player count did not fall as saves grew (${before.playersAtBudget} -> ${after.playersAtBudget}): ` +
    'it is a constant, not an observation of reality');
});

await test('nothing prunes the backups table, at any age', async () => {
  // The other half of the decision, and the one that is easy to lose by
  // accident: Tom explicitly chose NOT to prune saves. A rule that quietly
  // appears here deletes the only copy of somebody's progress.
  const p = await newPlayer();
  const body = JSON.stringify({ blob: 'B'.repeat(2048), appV: 'test' });
  assert.equal((await signedFetch(p.kp, p.id, 'PUT', '/backup', body)).status, 200, 'fixture did not land');
  await drain();
  // And through the REAL cron entry point, which is where both pruners run, so
  // this is not only asserting that the grants pruner minds its own table.
  await (await fetch(BASE + '/__scheduled?cron=*%2F15+*+*+*+*')).text();
  const r = await signedFetch(p.kp, p.id, 'GET', '/backup');
  assert.equal(r.status, 200, `the save is gone after a prune (${r.status})`);
  assert.equal((await r.json()).blob.length, 2048, 'the save came back a different size');
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
