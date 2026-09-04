/* Retention tests for the three tables NOTHING ever deleted from, against a
 * running Worker.
 *
 *   npx wrangler d1 execute bonez --local --file=schema.sql
 *   npm run dev            # or: npx wrangler dev --local --port 8788 --var DEV:1 --var ADMIN_TOKEN:devtoken --var ADD_TOKEN_SECRET:devaddsecret --var RL_SECRET:devrlsecret
 *   node stale-retention.test.mjs
 *
 * `grep -n "DELETE FROM" src/index.js` named rate_limits, events, grants,
 * prune_runs, friendships and the /account/delete cascade. It did not name
 * `devices` or `reports` at all, and `leads` only lost the rows belonging to a
 * player who deleted their account. All three are written by UNSIGNED routes on
 * a device id the caller chooses, so the only thing between them and an
 * infinite table was a per-IP budget: 14,400 devices rows and 1,440 reports
 * rows a day from one address, forever, against a 10 GB per-database limit that
 * cannot be bought past.
 *
 * SO EVERY TEST BELOW STATES ITS DIRECTION, and the KEEP cases carry as much
 * weight as the DELETE cases, exactly like retention.test.mjs. The boundary is
 * asserted TO THE ROW rather than to the day: /dev/stale-count returns the
 * stored value of the column each rule prunes on, so a run at exactly
 * (that value + the window) must KEEP the row and a run one millisecond later
 * must delete it. A window proved only to the nearest minute is a window nobody
 * has actually read the predicate of.
 *
 * An empty sample set is a FAILURE. Every case proves its fixture landed, and
 * reads back the stored timestamp, before it asserts anything about the pruner.
 *
 * Pass BASE=... to point at another origin. Needs DEV=1 and ADMIN_TOKEN, like
 * every other suite here.
 */
import assert from 'node:assert/strict';
import { flagFor, RUN } from './test-flag.mjs';

const BASE = process.env.BASE || process.env.API || 'http://127.0.0.1:8788';
/* The same binding every other suite uses. Inline flagFor(BASE) at the call site
   read fine and behaved correctly, but it was invisible to
   tests/live-api-register-lint.mjs, which checks the BINDING rather than the
   import so that `const IS_TEST = false` cannot pass. */
const IS_TEST = flagFor(BASE);
const ADMIN = process.env.ADMIN_TOKEN || 'devtoken';
const DAY = 86400000;
const RETENTION_DAYS = 365;     // must match the devices/reports/leads rules in STALE_RULES
let passed = 0, failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); failed++; }
}

// renamed off RUN 2026-09-02: RUN is now the shared run label imported above
const KEYTAG = Math.random().toString(36).slice(2, 8);       // isolate this run from every other
const dev = tag => `stale-${KEYTAG}-${tag}`;
// A fresh address per fixture. Locally cf-connecting-ip is absent and every
// request would otherwise share the 'unknown' bucket, which means one suite can
// spend another's /survey budget and the fixture silently never lands.
const rndIp = () => `203.0.113.${1 + Math.floor(Math.random() * 250)}`;

async function postJson(path, body, ip = rndIp()) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}

/** Count a device's rows in one of the three tables, and read back the STORED
 *  value of the column that table is pruned on. */
async function rows(table, device) {
  const r = await fetch(`${BASE}/dev/stale-count?table=${table}&device=${encodeURIComponent(device)}`);
  assert.equal(r.status, 200, `stale-count needs DEV=1 (got ${r.status})`);
  return r.json();
}

async function rlCount(name) {
  const r = await fetch(`${BASE}/dev/ratelimit-count?name=${encodeURIComponent(name)}`);
  assert.equal(r.status, 200, `ratelimit-count needs DEV=1 (got ${r.status})`);
  return (await r.json()).n;
}

async function prune(opts = {}) {
  const r = await postJson('/dev/prune-stale', opts);
  assert.equal(r.status, 200, `prune-stale failed: ${r.text}`);
  return r.json;
}

/** Run to completion, so a bounded assertion afterwards is measuring its own
 *  rows rather than a backlog an earlier suite left behind. */
async function drain(opts = {}) {
  for (let i = 0; i < 60; i++) {
    const r = await prune(opts);
    if (!r.more) return r;
  }
  throw new Error('drain never finished in 60 ticks');
}

/* The three planters. Each goes through the REAL unsigned route that writes the
   table, so the row a test prunes is the row production stores, timestamped by
   the server rather than by this process. */
const plant = {
  async devices(device) {
    // An empty batch still upserts `devices`: that write is the leak, and it is
    // separate from the events rows, which have their own 30 day window.
    const r = await postJson('/events', { device, appV: 'staletest', events: [] });
    assert.equal(r.status, 200, `POST /events refused the fixture: ${r.text}`);
  },
  async reports(device) {
    const r = await postJson('/report', {
      device, kind: 'den-nominate', lat: 49.2827, lng: -123.1207,
      target: 'Library', note: `fixture ${KEYTAG}`, appV: 'staletest',
    });
    assert.equal(r.status, 200, `POST /report refused the fixture: ${r.text}`);
  },
  async leads(device) {
    const r = await postJson('/survey', {
      device, name: 'Fixture', email: `${KEYTAG}@example.invalid`, emailOptin: 0,
      feedback: `fixture ${KEYTAG}`, features: ['pit'], appV: 'staletest',
    });
    assert.equal(r.status, 200, `POST /survey refused the fixture: ${r.text}`);
  },
};

/* The orphan fixture needs SIGNED writes, because there is no unsigned way to
   store a backup or claim a tower. One throwaway account, signed inline: the
   rest of this suite is unsigned by nature and does not need a shared harness
   for it. Mirrors server/test/api.test.mjs's signedFetch exactly. */
async function orphanFixture(spireId) {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubkey = await crypto.subtle.exportKey('jwk', kp.publicKey);
  const reg = await postJson('/register', { test: IS_TEST, run: RUN, pubkey });
  assert.equal(reg.status, 200, `register refused the fixture: ${reg.text}`);
  const id = reg.json.playerId;
  const signed = async (method, p, bodyObj = null) => {
    const body = bodyObj === null ? '' : JSON.stringify(bodyObj);
    const ts = Date.now();
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey,
      new TextEncoder().encode(`${method}\n${p}\n${ts}\n${body}`));
    return fetch(BASE + p, {
      method,
      headers: { 'content-type': 'application/json', 'x-bh-player': id, 'x-bh-ts': String(ts),
        'x-bh-sig': Buffer.from(new Uint8Array(sig)).toString('base64') },
      body: method === 'GET' ? undefined : body,
    });
  };
  assert.equal((await signed('PUT', '/backup', { blob: 'A'.repeat(512), appV: 'staletest' })).status, 200,
    'PRECONDITION: the fixture must actually have a backup row to strand');
  /* LOCAL ONLY, and it says so rather than failing mysteriously: a non-local
     BASE registers with test:true, and a flagged account is refused a tower on
     purpose (see the is_test arm on /spires/<id>/claim). */
  assert.equal((await signed('PUT', `/spires/${spireId}/claim`, { name: 'Stranded', lat: 3, lng: 4 })).status, 200,
    'PRECONDITION: the fixture must actually hold a tower to strand (a non-local BASE flags it is_test and cannot)');
  return id;
}

async function orphans() {
  const r = await fetch(`${BASE}/dev/orphan`);
  assert.equal(r.status, 200, `/dev/orphan needs DEV=1 (got ${r.status})`);
  return r.json();
}

// ---------------------------------------------------------------------------
await test('DEV hooks are reachable (otherwise every result below is vacuous)', async () => {
  const r = await fetch(BASE + '/health');
  assert.equal(r.status, 200, 'no worker at ' + BASE);
  const probe = await rows('devices', '__nothing__');
  assert.equal(probe.n, 0);
  assert.equal(probe.at, null, 'a table with no matching row must report no timestamp, not 0');
  // The route must refuse a table it does not know, rather than interpolating it.
  const bad = await fetch(`${BASE}/dev/stale-count?table=players&device=x`);
  assert.equal(bad.status, 400, 'the stale-count hook accepted an arbitrary table name');
  await bad.text();
});

await test('the pruner reports the windows it actually enforces', async () => {
  const r = await fetch(`${BASE}/admin/prune`, { headers: { authorization: `Bearer ${ADMIN}` } }); // QA r29 S2
  assert.equal(r.status, 200, `/admin/prune refused the token (${r.status}); is ADMIN_TOKEN devtoken?`);
  const s = await r.json();
  assert.deepEqual(s.retention.staleDays,
    { devices: RETENTION_DAYS, reports: RETENTION_DAYS, leads: RETENTION_DAYS, rate_limits: 0 },
    'the windows this route publishes are not the ones the tests below assert');
  /* The audit surface, because the stale pass writes no prune_runs column: an
     `oldest` next to a `cutoff` per table is the only way anybody answers "is it
     keeping pace". Losing it would leave three tables with no visibility at all. */
  for (const t of ['devices', 'reports', 'leads', 'rate_limits']) {
    assert.ok(s.tables.stale && s.tables.stale[t], `/admin/prune reports nothing at all about ${t}`);
    assert.equal(typeof s.tables.stale[t].rows, 'number', `${t}.rows is not a count`);
    assert.equal(typeof s.tables.stale[t].cutoff, 'number', `${t}.cutoff is not an instant`);
  }
});

/* ---------------------------------------------------------------------------
   THE KEEP CASES FIRST, on the REAL clock. Everything after them injects a
   clock a year out, and a fixture planted now would be on the wrong side of it. */

await test('KEEPS a row in every one of the three tables when it is new', async () => {
  const d = dev('fresh');
  for (const table of ['devices', 'reports', 'leads']) {
    await plant[table](d);
    const before = await rows(table, d);
    assert.equal(before.n, 1, `${table} fixture did not land`);
  }
  await drain();
  // DIRECTION: unchanged, all three. A pruner that is too eager is worse than
  // one that is too lazy, because what it takes does not come back.
  for (const table of ['devices', 'reports', 'leads']) {
    assert.equal((await rows(table, d)).n, 1,
      `a brand new ${table} row was deleted by a ${RETENTION_DAYS} day window`);
  }
});

await test('KEEPS a LIVE rate-limit row, written by the real limiter', async () => {
  // Not a synthetic row: hit the unsigned availability probe, which is what
  // calls rateLimitRecovery(..., 'rl_ridcheck') in production.
  const r = await fetch(`${BASE}/recovery/available/stale${KEYTAG}`);
  assert.ok(r.status === 200 || r.status === 429, `availability probe answered ${r.status}`);
  await r.text();
  const before = await rlCount('rl_ridcheck');
  // BOUND: an empty sample set is a FAILURE. With no live row there is nothing
  // to protect and the assertion below would pass on nothing.
  assert.ok(before > 0, 'the limiter wrote no row, so this test proves nothing');
  await drain();
  // DIRECTION: unchanged. Any drop means the sweep is taking rows the limiter is
  // still counting, which hands an attacker their budget back for free.
  assert.equal(await rlCount('rl_ridcheck'), before,
    'the stale pruner ate rate-limit rows that have not expired yet');
});

/* ---------------------------------------------------------------------------
   THE BOUNDARY, TO THE ROW.

   Every rule is `col < now - days*DAY`, so a row aged to T is KEPT by a run at
   exactly T + days*DAY (T < T is false) and DELETED by a run one millisecond
   later. Both sides come from the row's OWN stored timestamp, read back through
   /dev/stale-count, so neither is this process's clock rounded to something.

   THE FIXTURE IS AGED, NOT THE CLOCK, which is where the events and grants
   suites differ. Their injected clock is safe because it only reaches `events`
   and `grants`; here a clock a year out puts EVERY row in these tables past its
   cutoff, so it emptied `devices` while the 30-day events rows pointing at them
   survived, and api.test.mjs's tester-board case went red on the second run
   against the same local database. Nothing production does can produce that (the
   devices window is 365 days and events keep 30), but a suite that breaks its
   neighbours on a re-run is not one anybody keeps running. /dev/stale-warp moves
   one fixture back instead, and the prune stays on the real clock where only
   that fixture is a candidate. */

/** Age one fixture row, and read back the timestamp it now carries. */
async function warp(table, device, backMs) {
  const w = await postJson('/dev/stale-warp', { table, device, backMs });
  assert.equal(w.status, 200, `stale-warp needs DEV=1: ${w.text}`);
  assert.equal(w.json.moved, 1, `the warp moved ${w.json.moved} rows, so the fixture is not where the test thinks`);
  const after = await rows(table, device);
  assert.equal(after.n, 1, `${table} fixture vanished during the warp`);
  return after.at;
}

for (const table of ['devices', 'reports', 'leads']) {
  await test(`${table}: the ${RETENTION_DAYS} day boundary, one millisecond either side`, async () => {
    const d = dev(`edge-${table}`);
    await plant[table](d);
    const planted = await rows(table, d);
    assert.equal(planted.n, 1, `${table} fixture did not land, so nothing below is being measured`);
    assert.equal(typeof planted.at, 'number', `${table} fixture has no stored timestamp to age`);
    const at = await warp(table, d, RETENTION_DAYS * DAY);
    assert.equal(at, planted.at - RETENTION_DAYS * DAY, 'the warp did not move the row the distance it was asked to');

    // ON the cutoff: kept. This is the half that is easy to get wrong by one.
    await drain({ nowMs: at + RETENTION_DAYS * DAY });
    assert.equal((await rows(table, d)).n, 1,
      `a ${table} row exactly ${RETENTION_DAYS} days old was deleted: the window is a day short`);

    // One millisecond past it: gone.
    await drain({ nowMs: at + RETENTION_DAYS * DAY + 1 });
    assert.equal((await rows(table, d)).n, 0,
      `a ${table} row past ${RETENTION_DAYS} days survived, which is what "nothing ever deleted from this table" looked like`);
  });
}

await test('a run is BOUNDED by maxRows and resumes on the next tick', async () => {
  const mine = Array.from({ length: 25 }, (_, i) => dev(`batch${i}`));
  for (const d of mine) { await plant.devices(d); await warp('devices', d, (RETENTION_DAYS + 1) * DAY); }
  let planted = 0;
  for (const d of mine) planted += (await rows('devices', d)).n;
  assert.equal(planted, 25, `only ${planted} of 25 fixtures landed, so a bound of 10 could be met by an empty table`);

  /* DIRECTION: never more than maxRows in one tick, because the whole point is
     that a tick cannot run away and hold D1's single writer for 30 seconds.
     BOUND: 25 aged fixtures of this suite's own are prunable on the real clock,
     so neither tick below can be satisfied by an empty table. */
  const a = await prune({ maxRows: 10, batch: 5 });
  assert.equal(a.total, 10, `a bounded tick deleted ${a.total}, expected exactly 10`);
  assert.equal(a.stopped, 'maxRows');
  assert.equal(a.more, true, 'a tick that hit its bound must say there is more to do');

  const b = await prune({ maxRows: 10, batch: 5 });
  assert.equal(b.total, 10, 'the next tick did not resume where the last one stopped');

  // And it resumes to completion, cursorlessly: every one of the 25 is gone.
  const done = await drain();
  assert.equal(done.more, false, 'a finished tick must not claim there is a backlog');
  let left = 0;
  for (const d of mine) left += (await rows('devices', d)).n;
  assert.equal(left, 0, `${left} of 25 fixtures survived a drain, so an interrupted run does not resume`);
});

await test('the tick sweeps EXPIRED rate-limit rows, which is the gap /backup and /cheer sat in', async () => {
  /* PUT /backup and POST /cheer claim a nonce row on every write and call no
     limiter, so before the tick learned to sweep, the two routes writing the
     most rows here were the two that never cleared any: the sweep only ran on
     the first hit of a fresh rate-limit window. This proves the tick does it
     now, from rows the real limiter wrote. */
  const r = await fetch(`${BASE}/recovery/available/sweep${KEYTAG}`);
  await r.text();
  await plant.devices(dev('sweep'));          // an rl_events_dev row, 1 hour window
  const expiring = await rlCount('rl_ridcheck');
  const living = await rlCount('rl_events_dev');
  // BOUND, both directions: neither assertion below may be graded on an empty set.
  assert.ok(expiring > 0, 'the recovery limiter wrote no row, so there is nothing to prove a sweep against');
  assert.ok(living > 0, 'the events limiter wrote no row, so the KEEP half proves nothing');

  /* 21 minutes out, which is past every rl_ridcheck row (a 10 minute window,
     swept at twice that) and past every nonce (10 minute TTL), and nowhere near
     the 2 hours an rl_events_dev row is kept. A clock further out would sweep
     live counters too and the KEEP assertion would be vacuous. */
  await drain({ nowMs: Date.now() + 21 * 60000 });
  assert.equal(await rlCount('rl_ridcheck'), 0,
    'expired rate-limit rows survived the tick, so nothing sweeps after a signed write');
  assert.equal(await rlCount('rl_events_dev'), living,
    'the tick swept counters the limiter is still counting, which hands an attacker their budget back');
});

/* ---- rows whose player is gone, added 2026-09-02 ----
   Not a window: ORPHAN_RULES asks "is there still an account this belongs to".
   Both writes are guarded at write time now, so this sweep exists for the rows
   the unguarded code already left, and as the backstop for the next signed
   write that forgets. /dev/orphan strands a player (drops the players row and
   nothing else), which is the only way left to build the state the guards
   refuse to produce, and its GET counts what is orphaned across both tables.
   KEEP is asserted as hard as DELETE: a sweep that empties `backups` because
   its NOT EXISTS is wrong would destroy every live player's save. */
await test('a stranded player\'s backup and tower are swept; a live player\'s are not', async () => {
  /* A fresh map cell per run. The local D1 keeps every tower every past run
     claimed, and re-claiming one this suite already holds hits the shield. */
  const cell = () => 100000 + Math.floor(Math.random() * 900000);
  const doomedSpire = `sp-${cell()}-${cell()}`, liveSpire = `sp-${cell()}-${cell()}`;
  const doomedId = await orphanFixture(doomedSpire);
  const liveId = await orphanFixture(liveSpire);

  const strand = await postJson('/dev/orphan', { playerId: doomedId });
  assert.equal(strand.status, 200, `/dev/orphan needs DEV=1: ${strand.text}`);
  assert.equal(strand.json.stranded, 1, 'the fixture was not stranded, so there is nothing to sweep');

  // CONTROL, before the sweep: the orphans are visible and countable. An
  // assertion that they are gone afterwards proves nothing without this.
  const before = await orphans();
  assert.ok(before.backups > 0 && before.spires > 0,
    `CONTROL: nothing is orphaned (backups=${before.backups}, spires=${before.spires}), so the sweep has no work`);

  await drain();

  /* THE KEEP HALF IS ASSERTED FIRST, on purpose. Both halves have to be able to
     go red on their own, and they cannot if the DELETE assertions run first: a
     predicate accidentally inverted sweeps every LIVE row and leaves every
     orphan, which stops at the first assertion below and never reaches the one
     that would name what actually happened. This order makes the data-loss
     direction the one that reports itself. */
  const warp = await postJson('/dev/backup-warp', { playerId: liveId, backMs: 0 });
  assert.ok(warp.json.row, 'the sweep deleted a LIVE player\'s backup');
  const sw = await postJson('/dev/spire-warp', { id: liveSpire, backMs: 0 });
  assert.equal(sw.json.row && sw.json.row.owner, liveId, 'the sweep deleted a LIVE player\'s tower');

  const after = await orphans();
  assert.equal(after.backups, 0, `${after.backups} orphaned backup rows survived the tick`);
  assert.equal(after.spires, 0, `${after.spires} towers owned by a deleted account survived the tick`);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
