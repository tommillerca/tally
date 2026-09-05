/* A ROW DATED IN THE FUTURE MUST NOT MOVE A SINGLE FIGURE ON /stats.
 *
 *   npx wrangler d1 execute bonez --local --file=schema.sql
 *   npm run dev            # or: npx wrangler dev --local --port 8788 --var DEV:1 --var ADMIN_TOKEN:devtoken --var ADD_TOKEN_SECRET:devaddsecret --var RL_SECRET:devrlsecret
 *   node future-dates.test.mjs
 *
 * WHY THIS EXISTS. Every windowed aggregate on /stats was written `day >= ?`
 * with no upper bound, so a row dated after today sat inside "this week" and
 * stayed there until the calendar caught up. On 2026-08-25, 39 devices with
 * wrong system clocks had written 715 rows dated 2026-09-01 to 2026-09-14 and
 * WAU read 85 against a true 46. Nothing was broken, nothing threw, and the
 * number would have corrected itself three weeks later with no record that it
 * had ever been wrong. That is the whole class of bug this file is pointed at.
 *
 * WHY IT DOES NOT USE POST /events. The clamp on the write path (PR #170) is
 * the first line and this is the second, and a second line that depends on the
 * first proves nothing. The fixture is planted through /dev/event-at, which
 * writes the row directly, exactly as a future writer with no clamp would.
 *
 * HOW IT IS ABLE TO FAIL. Two tests, in order, and the first is a POSITIVE
 * CONTROL: it plants a row dated TODAY and asserts the figures MOVE. A
 * comparison that cannot see a real row moving cannot be trusted when it
 * reports that a future row did not, and "/stats returned the same object
 * twice" is what a broken or empty database looks like too. The control runs
 * first so that a failure there is read as "this suite is not measuring
 * anything", not as a pass.
 *
 * THE ASSERTION IS THE WHOLE PAYLOAD, not a list of figures. Every aggregate is
 * compared, minus generatedAt, so a figure added to that route later is covered
 * on the day it is added rather than the day somebody remembers to add it here.
 *
 * Needs DEV=1 and ADMIN_TOKEN, exactly like the other suites. BASE=... points
 * it elsewhere.
 */
import assert from 'node:assert/strict';

const BASE = process.env.BASE || process.env.API || 'http://127.0.0.1:8788';
const TOKEN = process.env.ADMIN_TOKEN || 'devtoken';
const DAY = 86400000;
let passed = 0, failed = 0;

async function test(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); failed++; }
}

const RUN = Math.random().toString(36).slice(2, 8);
const utcDay = ms => new Date(ms).toISOString().slice(0, 10);

/* Every event name /stats aggregates by name, so the future fixture exercises
   every branch of that route and not only the four generic counters. `err` and
   the two vault names are the ones with NO lower day bound, which is exactly why
   they belong here: their bound is the upper one and nothing else tests it. */
const AGGREGATED = [
  ['screen', null], ['screen_time', { s: 'today', ms: 60000 }],
  ['feat_open', { f: 'shop' }], ['feat_time', { f: 'shop', ms: 60000 }],
  ['session_ping', null], ['session_start', null],
  ['err', { m: `future-${RUN}`, k: 'js', src: 'test', s: 'today' }],
  ['vault_backfill', null], ['vault_recover', null],
];

async function stats() {
  const r = await fetch(`${BASE}/stats`, { headers: { authorization: `Bearer ${TOKEN}` } }); // QA r29 S2: header, never the URL
  assert.equal(r.status, 200, `/stats needs ADMIN_TOKEN (got ${r.status})`);
  const j = await r.json();
  delete j.generatedAt;              // the one field that MUST differ
  return j;
}

/** Plant one row at an exact ts, bypassing the /events write path and its clamp. */
async function plantAt(device, name, ts, props) {
  const r = await fetch(BASE + '/dev/event-at', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device, name, ts, props, appV: 'test' }),
  });
  const text = await r.text();
  assert.equal(r.status, 200, `/dev/event-at needs DEV=1 (got ${r.status}: ${text})`);
  return JSON.parse(text);
}

/** Rows this run planted at or after `minTs`. The fixture is proved to EXIST
 *  before anything is concluded from its absence in an aggregate. */
async function countFrom(device, minTs) {
  const r = await fetch(`${BASE}/dev/events-count?device=${encodeURIComponent(device)}&minTs=${minTs}`);
  assert.equal(r.status, 200, `events-count needs DEV=1 (got ${r.status})`);
  return (await r.json()).n;
}

const startedDay = utcDay(Date.now());

/* POSITIVE CONTROL. A row dated today must move the figures, or the comparison
   in the test below is measuring nothing and its silence means nothing. */
await test('CONTROL: a row dated TODAY moves wau and totalEvents', async () => {
  const before = await stats();
  const device = `fut-ctl-${RUN}`;
  const now = Date.now();
  await plantAt(device, 'screen', now, { s: 'today' });
  assert.equal(await countFrom(device, now - 1000), 1, 'control fixture was not written');
  const after = await stats();
  assert.ok(after.wau > before.wau, `wau did not move: ${before.wau} -> ${after.wau}`);
  assert.ok(after.totalEvents > before.totalEvents,
    `totalEvents did not move: ${before.totalEvents} -> ${after.totalEvents}`);
  /* testers is capped at 30 by activity, so on a busy database a one-event
     device is legitimately off the end and its absence proves nothing. Assert
     the informative case, and say which one happened rather than guessing. */
  assert.ok(after.testers.some(t => t.device === device) || after.testers.length >= 30,
    'control device is missing from an unfilled tester leaderboard');
});

/* THE GUARD. */
await test('a future-dated row moves NOTHING on /stats', async () => {
  const before = await stats();
  const device = `fut-${RUN}`;
  const future = Date.now() + 10 * DAY;

  for (const [name, props] of AGGREGATED) await plantAt(device, name, future, props);

  // the fixture exists, it is genuinely in the future, and it is the size we think
  const planted = await countFrom(device, future - 1000);
  assert.equal(planted, AGGREGATED.length,
    `fixture is ${planted} rows, expected ${AGGREGATED.length}: this guard would prove nothing`);
  assert.ok(utcDay(future) > startedDay, `fixture day ${utcDay(future)} is not after ${startedDay}`);

  const after = await stats();
  assert.equal(startedDay, utcDay(Date.now()),
    'the UTC date rolled over mid-test; re-run (this is not a failure of the bound)');

  // whole payload, so a figure added to /stats later is covered without an edit here
  assert.deepEqual(after, before,
    'a future-dated row changed /stats: every aggregate must be bounded at today');

  // and, said directly, the two ways it showed up in production
  assert.ok(!after.activeByDay.some(d => d.day > startedDay),
    `activeByDay contains a day after today: ${JSON.stringify(after.activeByDay.filter(d => d.day > startedDay))}`);
  assert.ok(!after.testers.some(t => t.device === device),
    'a device whose only rows are in the future is on the tester leaderboard');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
