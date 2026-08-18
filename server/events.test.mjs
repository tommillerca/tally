/* /events ingest-budget tests against a running Worker.
 *
 *   npx wrangler d1 execute bonez --local --file=schema.sql
 *   npx wrangler dev --port 8788 --local
 *   node events.test.mjs
 *
 * These exist because /events is unsigned and each accepted event costs FOUR
 * written rows (the row + three indexes). On the free plan's 100,000 rows/day
 * a few hundred scripted posts used to exhaust the whole api's daily budget
 * until 00:00 UTC, taking backups, profile sync and grants down with them.
 * Pass BASE=... to point at another origin.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
const CAP = 4000;          // EVENTS_DAILY_CAP in src/index.js
const PER_POST = 50;       // the server's per-request event cap
let passed = 0, failed = 0;

// The budget lives in D1 and outlives the process, so a second run of this file
// would start already spent and every post would 429. Clear it first.
if (/127\.0\.0\.1|localhost/.test(BASE)) {
  try {
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'bonez', '--local', '--command', 'DELETE FROM rl'],
      { cwd: import.meta.dirname, stdio: 'ignore' });
  } catch { console.log('(could not reset the ingest budget; posts may 429 early)'); }
}

async function test(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); failed++; }
}

let seq = 0;
/** One flush, shaped like js/analytics.js sends it. */
function post(n, device = 'test-device') {
  const events = Array.from({ length: n }, () => ({ name: 'session_ping', ts: Date.now(), props: { i: seq++ } }));
  return fetch(`${BASE}/events`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device, appV: 'test', plat: 'test', events }),
  });
}

// A normal player's flush is 1-5 events every 60s. Nothing in that shape may
// ever be refused: the limiter is here to stop a script, not a household.
await test('a normal flush is accepted', async () => {
  for (let i = 0; i < 20; i++) {
    const r = await post(3);
    assert.equal(r.status, 200, `flush ${i + 1} of a normal-sized batch was refused with ${r.status}`);
  }
});

// The real failure: max-size posts on repeat. Must be refused, and must be
// refused before the cap can run away with the day's write budget.
let refusedAt = 0;
await test('a max-size flood is refused inside the cap', async () => {
  const bound = Math.ceil(CAP / PER_POST) + 5;   // + slack for the 20 posts above
  for (let i = 1; i <= bound; i++) {
    const r = await post(PER_POST, 'flood-device');
    if (r.status === 429) {
      const body = await r.json();
      assert.ok(body.error, `429 must carry a JSON error, got ${JSON.stringify(body)}`);
      refusedAt = i;
      return;
    }
    assert.equal(r.status, 200, `post ${i} answered ${r.status}`);
  }
  assert.fail(`sent ${bound} posts of ${PER_POST} events (${bound * PER_POST} events, ~${bound * PER_POST * 4} written rows) and was NEVER refused`);
});

await test('the flood was refused near the cap, not at some accidental number', () => {
  assert.ok(refusedAt > 0, 'never refused');
  const spent = refusedAt * PER_POST;
  assert.ok(spent >= CAP * 0.9 && spent <= CAP * 1.2,
    `refused after ~${spent} events, expected within 10-20% of the ${CAP} cap`);
});

// The refusal path is what actually saves the budget: once over, further posts
// must stay refused (and cost no writes), not drift back under on the next tick.
await test('refusal sticks', async () => {
  for (let i = 0; i < 3; i++) {
    const r = await post(PER_POST, 'flood-device');
    assert.equal(r.status, 429, `post ${i + 1} after the cap answered ${r.status}`);
  }
});

// Same IP, so a fresh device id must NOT reset the budget: the counter is keyed
// on the hashed address precisely because a script can mint device ids for free.
await test('a new device id does not buy a fresh budget', async () => {
  const r = await post(PER_POST, 'brand-new-device-' + Date.now());
  assert.equal(r.status, 429, `a new device id got ${r.status}, so the budget is keyed on something forgeable`);
});

// Hand the local DB back unspent: the flood above burns most of the day's
// budget for this address, and test/api.test.mjs posts events too.
if (/127\.0\.0\.1|localhost/.test(BASE)) {
  try {
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'bonez', '--local', '--command', 'DELETE FROM rl'],
      { cwd: import.meta.dirname, stdio: 'ignore' });
  } catch { console.log('(could not clear the ingest budget; other suites may 429)'); }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
