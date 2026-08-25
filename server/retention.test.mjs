/* Events-retention tests against a running Worker.
 *
 *   npx wrangler d1 execute bonez --local --file=schema.sql
 *   npm run dev            # or: npx wrangler dev --local --port 8788 --var DEV:1 --var ADMIN_TOKEN:devtoken
 *   node retention.test.mjs
 *
 * These exist because a pruner is judged twice, and the second judgement is the
 * one that bites. Deleting the right rows is easy to check and easy to get
 * right. KEEPING the right rows is neither, and the sharpest case is not a
 * product event at all: the recovery rate limiter stores its per-IP counters as
 * rows in this very table (src/index.js rateLimitRecovery), on a TEN MINUTE
 * window. Prune one of those out from under it and the limiter silently resets,
 * which turns the unauthenticated ciphertext endpoints into an unthrottled way
 * to harvest wrapped keys. Nothing would go red. Nothing would look wrong.
 *
 * So every assertion below states its DIRECTION, and the KEEP tests are as
 * heavily weighted as the DELETE tests. An empty sample set is a FAILURE, never
 * a pass: each test proves its fixture exists before it proves anything about
 * what the pruner did to it.
 *
 * Pass BASE=... to point at another origin. Needs DEV=1 (the /dev/prune and
 * /dev/events-count hooks) and ADMIN_TOKEN, exactly like the other suites.
 */
import assert from 'node:assert/strict';

const BASE = process.env.BASE || process.env.API || 'http://127.0.0.1:8788';
const DAY = 86400000;
const RETENTION_DAYS = 30;      // must match EVENT_RETENTION_DAYS in src/index.js
let passed = 0, failed = 0, skipped = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); failed++; }
}

const RUN = Math.random().toString(36).slice(2, 8);   // isolate this run from every other
const dev = tag => `retention-${RUN}-${tag}`;

async function postJson(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, json, text };
}

/** Plant events at a chosen age. The /events route derives `day` from the ts we
 *  send, so "200 days ago" lands with the day string a 200-day-old row really
 *  has, and no clock has to be faked on the write side. */
async function plant(device, name, ageMs, count = 1) {
  const now = Date.now();
  const events = Array.from({ length: count }, (_, i) => ({ name, ts: now - ageMs - i * 1000, props: { i } }));
  const r = await postJson('/events', { device, events, appV: 'test' });
  assert.equal(r.status, 200, `plant failed: ${r.text}`);
  assert.equal(r.json.accepted, count, `plant accepted ${r.json.accepted} of ${count}`);
  return now;
}

async function count(params) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${BASE}/dev/events-count?${qs}`);
  assert.equal(r.status, 200, `events-count needs DEV=1 (got ${r.status})`);
  return (await r.json()).n;
}

/** Count the LIMITER's rows. Deliberately not count(): that reads `events`, and
 *  this change is what moved the limiter into its own `rate_limits` table. */
async function rlCount(params) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${BASE}/dev/ratelimit-count?${qs}`);
  assert.equal(r.status, 200, `ratelimit-count needs DEV=1 (got ${r.status})`);
  return (await r.json()).n;
}
async function prune(opts = {}) {
  const r = await postJson('/dev/prune', opts);
  assert.equal(r.status, 200, `prune failed: ${r.text}`);
  return r.json;
}

/** Run the pruner to completion, so a bounded test afterwards is measuring its
 *  OWN rows rather than whatever backlog an earlier suite left behind. */
async function drain() {
  for (let i = 0; i < 40; i++) {
    const r = await prune();
    if (!r.more) return r;
  }
  throw new Error('drain never finished in 40 ticks');
}

// ---------------------------------------------------------------------------
await test('DEV hooks are reachable (otherwise every result below is vacuous)', async () => {
  const r = await fetch(BASE + '/health');
  assert.equal(r.status, 200, 'no worker at ' + BASE);
  assert.equal(typeof (await count({ name: '__nothing__' })), 'number');
});

await test('the pruner reports the window it actually enforces', async () => {
  const r = await prune({ maxRows: 0 });
  assert.equal(r.retentionDays, RETENTION_DAYS, `window is ${r.retentionDays} days, expected ${RETENTION_DAYS}`);
  const expected = new Date(Date.now() - RETENTION_DAYS * DAY).toISOString().slice(0, 10);
  assert.equal(r.cutoffDay, expected);
});

await test('DELETES product events older than the window', async () => {
  const d = dev('old');
  await plant(d, 'food_log', 200 * DAY, 5);
  // DIRECTION: down to zero. BOUND: it must be 5 before the prune, or the test
  // proved nothing at all.
  assert.equal(await count({ device: d }), 5, 'fixture did not land');
  await drain();
  assert.equal(await count({ device: d }), 0, `a 200-day-old event survived a ${RETENTION_DAYS}-day window`);
});

await test('KEEPS product events inside the window', async () => {
  const d = dev('fresh');
  await plant(d, 'food_log', 5 * DAY, 5);
  assert.equal(await count({ device: d }), 5, 'fixture did not land');
  await drain();
  // DIRECTION: unchanged. A pruner that is too eager is worse than one that is
  // too lazy, because the data it takes does not come back.
  assert.equal(await count({ device: d }), 5, `a 5-day-old event was pruned by a ${RETENTION_DAYS}-day window`);
});

await test(`the ${RETENTION_DAYS}-day boundary: one day inside lives, one day outside dies`, async () => {
  const inside = RETENTION_DAYS - 1, outside = RETENTION_DAYS + 1;
  const dIn = dev('din'), dOut = dev('dout');
  await plant(dIn, 'app_open', inside * DAY, 3);
  await plant(dOut, 'app_open', outside * DAY, 3);
  assert.equal(await count({ device: dIn }), 3, 'fixture did not land');
  assert.equal(await count({ device: dOut }), 3, 'fixture did not land');
  await drain();
  assert.equal(await count({ device: dIn }), 3, `day ${inside} was pruned: the window is too tight`);
  assert.equal(await count({ device: dOut }), 0, `day ${outside} survived: the window is too loose`);
});

await test('KEEPS a LIVE rate-limit row, written by the real limiter', async () => {
  // Not a synthetic row: hit the unsigned availability probe, which is what
  // calls rateLimitRecovery(..., 'rl_ridcheck') in production.
  const r = await fetch(`${BASE}/recovery/available/ret${RUN}`);
  assert.ok(r.status === 200 || r.status === 429, `availability probe answered ${r.status}`);
  const liveFrom = String(Date.now() - 10 * 60 * 1000);   // the limiter's own 10-minute horizon
  const before = await rlCount({ name: 'rl_ridcheck', minTs: liveFrom });
  // BOUND: an empty sample set is a FAILURE. If the limiter wrote nothing there
  // is no live row to protect and the assertion below would pass on nothing.
  assert.ok(before > 0, 'the limiter wrote no live row, so this test proves nothing');
  await drain();
  const after = await rlCount({ name: 'rl_ridcheck', minTs: liveFrom });
  // DIRECTION: unchanged. Any drop at all means the limiter has been reset by
  // the pruner and the ciphertext endpoints are unthrottled.
  assert.equal(after, before, `the pruner ate ${before - after} live rate-limit rows`);
});

await test('the limiter still counts after a prune (429 budget is not reset)', async () => {
  // The row surviving is necessary but not sufficient: prove the limiter can
  // still SEE its own history by exhausting the tight bucket, pruning, and
  // checking it is still exhausted. /recovery/id/<rid> uses the strict bucket
  // (limit 10 per 10 minutes).
  const rid = `ret${RUN}x`;
  let sawLimit = false;
  for (let i = 0; i < 14 && !sawLimit; i++) {
    const r = await fetch(`${BASE}/recovery/id/${rid}`);
    if (r.status === 429) sawLimit = true; else await r.text();
  }
  assert.ok(sawLimit, 'never reached the 429, so there is no exhausted budget to test');
  await drain();
  const again = await fetch(`${BASE}/recovery/id/${rid}`);
  await again.text();
  // DIRECTION: still 429. A 404 here would mean the counter was pruned away and
  // the attacker got their budget back for free.
  assert.equal(again.status, 429, 'the prune handed the rate limiter a fresh budget');
});

await test(`DELETES stale rate-limit rows long before the ${RETENTION_DAYS}-day window`, async () => {
  // 2 days old: far inside the product window, far outside the 1-day
  // window these rows get. This is the test that goes red if somebody deletes
  // the override and lets rl rows ride the default retention.
  const d = dev('rlstale');
  await plant(d, 'rl_recovery', 2 * DAY, 4);
  await plant(d, 'rl_ridcheck', 2 * DAY, 4);
  assert.equal(await count({ device: d }), 8, 'fixture did not land');
  await drain();
  assert.equal(await count({ device: d }), 0,
    `two-day-old rate-limit rows survived: they are being kept for ${RETENTION_DAYS} days like product events`);
});

await test('KEEPS a rate-limit row that is stale for the limiter but inside its own window', async () => {
  // 30 minutes old: the limiter has stopped counting it (10-minute window) but
  // the pruner must not take it yet either, because the 1-day override is what
  // guarantees a safety margin rather than a race with the limiter's clock.
  const d = dev('rlmid');
  await plant(d, 'rl_recovery', 30 * 60 * 1000, 3);
  assert.equal(await count({ device: d }), 3, 'fixture did not land');
  await drain();
  assert.equal(await count({ device: d }), 3,
    'a 30-minute-old rate-limit row was pruned: the safety margin over the limiter has gone');
});

await test('a run is BOUNDED by maxRows and resumes on the next tick', async () => {
  await drain();                       // start from a clean backlog
  const d = dev('batch');
  await plant(d, 'session_ping', 120 * DAY, 25);
  assert.equal(await count({ device: d }), 25, 'fixture did not land');

  // DIRECTION: strictly downward, in steps no larger than maxRows. BOUND: never
  // more than 10 in one tick, because the whole point is that a tick cannot run
  // away and hold D1's single writer for 30 seconds.
  const a = await prune({ maxRows: 10, batch: 5 });
  assert.equal(a.total, 10, `a bounded tick deleted ${a.total}, expected exactly 10`);
  assert.equal(a.stopped, 'maxRows');
  assert.equal(a.more, true, 'a tick that hit its bound must say there is more to do');
  assert.equal(await count({ device: d }), 15);

  const b = await prune({ maxRows: 10, batch: 5 });
  assert.equal(b.total, 10, 'the next tick did not resume where the last one stopped');
  assert.equal(await count({ device: d }), 5);

  const c = await prune();
  assert.equal(c.total, 5);
  assert.equal(c.more, false, 'a finished tick must not claim there is a backlog');
  assert.equal(await count({ device: d }), 0);
});

await test('a wall-clock bound also stops a run, and stops it cleanly', async () => {
  const d = dev('clock');
  await plant(d, 'session_ping', 120 * DAY, 12);
  assert.equal(await count({ device: d }), 12, 'fixture did not land');
  // budgetMs is floored at 100ms in pruneEvents, so this is the smallest legal
  // budget. DIRECTION: it must stop early, and it must still be correct about
  // having stopped early. It may legitimately delete some or all of them.
  const r = await prune({ budgetMs: 1, batch: 1 });
  assert.ok(r.stopped === 'budgetMs' || r.more === false,
    `a 100ms budget neither finished nor reported stopping: ${JSON.stringify(r)}`);
  await drain();
  assert.equal(await count({ device: d }), 0, 'the interrupted run did not resume to completion');
});

await test('pruning never touches rows through the front door either (/events still works)', async () => {
  const d = dev('post');
  await plant(d, 'app_open', 0, 2);
  await drain();
  assert.equal(await count({ device: d }), 2, 'a brand new event was pruned');
});

// The real scheduled() path. wrangler only exposes it with --test-scheduled, and
// deploy.sh starts its dev server without that flag, so this is reported as
// SKIPPED rather than failed when the route is not there. It is the one test
// that proves the cron entry point is wired to the same pruner.
await (async () => {
  const name = 'scheduled() runs the same pruner';
  const probe = await fetch(BASE + '/__scheduled?cron=*%2F15+*+*+*+*');
  if (probe.status === 404) {
    await probe.text();
    console.log(`  SKIP  ${name} (dev server not started with --test-scheduled)`);
    skipped++;
    return;
  }
  await probe.text();
  await test(name, async () => {
    const d = dev('cron');
    await plant(d, 'food_log', 300 * DAY, 3);
    assert.equal(await count({ device: d }), 3, 'fixture did not land');
    const r = await fetch(BASE + '/__scheduled?cron=*%2F15+*+*+*+*');
    await r.text();
    assert.equal(r.status, 200);
    assert.equal(await count({ device: d }), 0, 'the cron entry point pruned nothing');
  });
})();

/* ---------------------------------------------------------------------------
   CAN ANYONE TELL, AFTERWARDS, THAT IT RAN?

   Everything above proves the pruner deletes the right rows when something
   calls it. None of it proves a human can find out what happened last night,
   and on 2026-08-24 nobody could: the cron was enabled and confirmed by the
   deploy output, and three separate `wrangler tail` sessions caught zero ticks.
   scheduled() wrote nothing durable, so once the terminal closed the question
   had no answer at all. These four cases are that answer, and they are worth as
   much as the delete tests: a pruner nobody can audit is one nobody will notice
   has stopped.

   ADMIN_TOKEN must be devtoken, which is what npm run dev and deploy.sh both
   pass. A wrong token here shows up as the 401 case failing, not as silence. */
const ADMIN = process.env.ADMIN_TOKEN || 'devtoken';
const pruneStatus = async (token = ADMIN) => {
  const r = await fetch(`${BASE}/admin/prune?token=${encodeURIComponent(token)}`);
  return { status: r.status, json: await r.json().catch(() => null) };
};

await test('/admin/prune is admin-gated, like every other admin read', async () => {
  assert.equal((await fetch(BASE + '/admin/prune')).status, 401, 'no token got in');
  assert.equal((await pruneStatus('not-the-token')).status, 401, 'a wrong token got in');
  const ok = await pruneStatus();
  assert.equal(ok.status, 200, `the right token was refused (${ok.status}); is ADMIN_TOKEN devtoken?`);
  // The header form the dashboard uses has to work too, or dashboard.html
  // cannot read this route at all.
  const viaHeader = await fetch(BASE + '/admin/prune', { headers: { 'x-bh-admin': ADMIN } });
  assert.equal(viaHeader.status, 200, 'x-bh-admin is not accepted, so the dashboard cannot read this');
  await viaHeader.text();
});

await (async () => {
  const name = 'a cron tick leaves a DURABLE trace of what it deleted';
  const probe = await fetch(BASE + '/__scheduled?cron=*%2F15+*+*+*+*');
  if (probe.status === 404) {
    await probe.text();
    console.log(`  SKIP  ${name} (dev server not started with --test-scheduled)`);
    skipped++;
    return;
  }
  await probe.text();

  await test(name, async () => {
    const before = (await pruneStatus()).json;
    assert.equal(before.status === 'no-table', false,
      'prune_runs does not exist: apply migrations/2026-08-25-prune-runs.sql first');
    const d = dev('trace');
    await plant(d, 'food_log', 300 * DAY, 4);
    assert.equal(await count({ device: d }), 4, 'PRECONDITION: the fixture did not land, so a trace of 0 would prove nothing');

    const r = await fetch(BASE + '/__scheduled?cron=*%2F15+*+*+*+*');
    await r.text();
    assert.equal(r.status, 200);

    const after = (await pruneStatus()).json;
    assert.equal(after.recordedRuns, Math.min(before.recordedRuns + 1, after.keeping),
      'the tick recorded no run, so scheduled() is not writing its trace');
    const run = after.runs[0];
    assert.equal(run.ok, 1, `the recorded tick failed: ${run.err}`);
    assert.ok(run.ev >= 4, `the trace says ${run.ev} events deleted, but ${4} were planted for it to find`);
    assert.ok(Math.abs(Date.now() - run.ts) < 120000, 'the newest run is not from just now');
    // The per-rule breakdown is the part that makes a row worth reading rather
    // than merely present: "50,000 rows" and "50,000 rows, all of them the
    // retention window" are different findings.
    assert.ok(JSON.parse(run.evBy).window >= 4, `evBy does not attribute the deletions: ${run.evBy}`);
  });

  await test('/admin/prune answers "is the pruner healthy" in one word and one sentence', async () => {
    await drain();
    const r = await fetch(BASE + '/__scheduled?cron=*%2F15+*+*+*+*');
    await r.text();
    const s = (await pruneStatus()).json;
    assert.equal(s.status, 'healthy',
      `status is "${s.status}" straight after a full drain and a successful tick: ${s.detail}`);
    assert.equal(s.ok, true, 'ok disagrees with status');
    assert.ok(s.detail && s.detail.length > 40, 'detail is not a sentence anybody could act on');
    // The tail the pruner cannot touch has to be visible here, because it is
    // invisible everywhere else: a run log only ever reports rows it DELETED.
    assert.equal(typeof s.tables.grantsDormant, 'number',
      'the unprunable grants tail is not reported, so nothing surfaces it at all');
    assert.ok(s.tables.eventsOldestDay === null || s.tables.eventsOldestDay >= s.retention.eventCutoffDay,
      `rows older than the cutoff survived a drain (oldest ${s.tables.eventsOldestDay}, cutoff ${s.retention.eventCutoffDay})`);
  });
})();

console.log(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(failed ? 1 : 0);
