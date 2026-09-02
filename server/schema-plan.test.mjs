/* Query-plan tests for schema.sql. No worker, no wrangler, no network:
 *
 *   node schema-plan.test.mjs
 *
 * (Node 22+. node:sqlite is still flagged experimental, so it prints one
 * ExperimentalWarning on stderr. That is the runtime talking, not a failure.)
 *
 * WHY THIS EXISTS. An index is invisible. Drop idx_grants_key out of schema.sql
 * and every other test in this directory still passes: /steps/settled returns
 * exactly the same podium, /steps/week settles exactly the same week, and the
 * only difference is that both of them now read 1.9 million rows to do it.
 * Nothing goes red, nothing looks wrong, and D1 bills for every one of those
 * rows. The failure mode of a missing index is a correct answer that costs a
 * hundred times too much, which is precisely the kind of thing a test suite
 * made of behaviour assertions cannot see.
 *
 * So this asserts the PLAN, not the answer. It rebuilds the real schema.sql in
 * local SQLite, runs the three statements that motivated
 * migrations/2026-08-16-indexes.sql, and requires each one to reach its rows
 * through an index.
 *
 * DIRECTION: a plan containing SCAN of the big table is the failure. BOUND: an
 * empty result set is also a failure, because a query that matched nothing
 * would produce a cheap-looking plan while proving nothing.
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = import.meta.dirname;
const schema = readFileSync(join(HERE, 'schema.sql'), 'utf8');
const source = readFileSync(join(HERE, 'src', 'index.js'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok  ${name}`); passed++; }
  catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); failed++; }
}

const db = new DatabaseSync(':memory:');
db.exec(schema);

/* A small but non-empty fixture. Plans here do not depend on row counts (there
   is no ANALYZE, exactly like a D1 database nobody has ANALYZEd), so a handful
   of rows is enough to prove both the plan and that the SQL still matches the
   schema it is written against. */
/* pa/pb/pc are ACTIVE (last_seen now) and pd is DORMANT (last_seen at the epoch).
   The grants pruner's third arm turns on the recipient's own clock, so a fixture
   where every player looks equally dormant could not tell the arm apart from a
   delete-on-age rule. */
const P = ['pa', 'pb', 'pc'];
for (const id of P) {
  db.prepare('INSERT INTO players (id, pubkey, handle, friend_code, profile, created_at, last_seen) VALUES (?,?,?,?,?,?,?)')
    .run(id, 'k-' + id, 'Grim Tibia', 'BONE-' + id.toUpperCase() + '-AAAA', '{"outfit":{}}', 1, Date.now());
}
db.prepare('INSERT INTO players (id, pubkey, handle, friend_code, profile, created_at, last_seen) VALUES (?,?,?,?,?,?,?)')
  .run('pd', 'k-pd', 'Grim Tibia', 'BONE-PD-AAAA', '{"outfit":{}}', 1, 2);
// pb is deliberately only ever on the b side, so the OR arm that needs
// idx_friendships_b is the arm that has to find the row.
db.prepare('INSERT INTO friendships (a, b, status, requested_by, ts) VALUES (?,?,?,?,?)').run('pa', 'pb', 'accepted', 'pa', 3);
db.prepare('INSERT INTO friendships (a, b, status, requested_by, ts) VALUES (?,?,?,?,?)').run('pc', 'pb', 'pending', 'pc', 4);
for (let i = 0; i < 3; i++) {
  db.prepare('INSERT INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
    .run(P[i], 'stepweek-2026-08-07', 'social', JSON.stringify({ coins: 100, place: i + 1, steps: 9 - i }), 5);
}
/* Grants old enough for the retention pruner to be interested in, and an ack on
   one of them, so the DELETE below has something to match. pa's row is
   acknowledged (id <= grants_ack), pb's is a cheer (valueless, prunable on age
   alone), pc's is neither and must be the row the pruner leaves behind, and
   pd's is the dormancy arm: an unacknowledged gift whose recipient's last_seen
   is as old as the gift. Without pd the third OR arm would be planned but never
   matched, and the BOUND assertion would be graded on the other two. */
const OLD_TS = 1;
db.prepare('INSERT INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
  .run('pa', 'gift-free-pz-2026-01-01', 'gift', '{"coins":50}', OLD_TS);
db.prepare('INSERT INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
  .run('pb', 'cheer-pz-2026-01-01-0', 'cheer', '{"cheer":3}', OLD_TS);
db.prepare('INSERT INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
  .run('pc', 'gift-free-pz-2026-01-02', 'gift', '{"coins":50}', OLD_TS);
db.prepare('INSERT INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
  .run('pd', 'gift-free-pz-2026-01-03', 'gift', '{"coins":50}', OLD_TS);
db.prepare('UPDATE players SET grants_ack = (SELECT MAX(id) FROM grants g WHERE g.player_id = ?) WHERE id = ?')
  .run('pa', 'pa');

/* A handful of events + devices, so the /stats plans below have rows to reach.
   Two devices, several days, and the names /stats actually asks about. */
for (const d of ['dev-a', 'dev-b']) {
  db.prepare('INSERT INTO devices (device, label, country, region, city, first_seen, last_seen, plat) VALUES (?,?,?,?,?,?,?,?)')
    .run(d, 'Grim Tibia', 'GB', 'England', 'London', 1, 2, 'ios');
  for (const day of ['2026-08-15', '2026-08-16', '2026-08-17']) {
    for (const [name, props] of [['app_open', null], ['food_log', '{"kcal":420}'],
      ['session_ping', null], ['screen_time', '{"s":"home","ms":124000}']]) {
      db.prepare('INSERT INTO events (device, name, props, app_v, day, ts) VALUES (?,?,?,?,?,?)')
        .run(d, name, props, 'v385', day, 1);
    }
  }
}
// The rate limiter's own counter rows, which share this table by design.
db.prepare('INSERT INTO events (device, name, props, app_v, day, ts) VALUES (?,?,?,?,?,?)')
  .run('iphash01', 'rl_ridcheck', '{}', '', '2026-08-17', Date.now());

/* The three tables pruneStale() is the first thing ever to delete from, plus
   the sweep's own table. Every fixture here is planted PAST its window (the
   devices rows above already carry last_seen = 2), because a plan proves
   nothing about a query that matched nothing, and the BOUND assertion in the
   CASES loop grades exactly that. */
db.prepare('INSERT INTO reports (device, label, kind, lat, lng, target, note, app_v, geo, ts) VALUES (?,?,?,?,?,?,?,?,?,?)')
  .run('dev-a', 'Grim Tibia', 'den-nominate', 49.28, -123.12, 'Library', 'good spot', 'v385', 'Vancouver, BC, CA', 2);
db.prepare('INSERT INTO leads (device, player, label, name, email, email_optin, feedback, most_wanted, features, app_v, geo, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
  .run('dev-b', 'pa', 'Grim Tibia', 'Tom', 'tom@example.com', 1, 'more pets', 'pets', 'pit,steps', 'v385', 'Vancouver, BC, CA', 2);
// Expired (window_start*2 in the past) and LIVE, so the sweep's plan is measured
// against a table where its predicate has to actually choose.
db.prepare('INSERT INTO rate_limits (bucket, name, window_start, hits, expires_at) VALUES (?,?,?,?,?)')
  .run('deadbeef', 'sig', 1, 1, 2);
db.prepare('INSERT INTO rate_limits (bucket, name, window_start, hits, expires_at) VALUES (?,?,?,?,?)')
  .run('livebeef', 'rl_events_dev', Date.now(), 1, Date.now() + 7200000);

/* The statements, kept in step with the source. Each carries a fragment that
   must still be present in src/index.js: if somebody rewrites the route, the
   COVERAGE test below goes red and forces this file to be updated rather than
   quietly testing a query the worker no longer runs. */
const CASES = [
  {
    name: 'GET /friends reaches the b side through idx_friendships_b',
    fragment: 'WHERE f.a = ? OR f.b = ?',
    mustIndex: 'idx_friendships_b',
    mustNotScan: 'SCAN f',
    params: ['pb', 'pb'],
    sql:
      'SELECT f.a, f.b, f.status, f.requested_by, f.ts, ' +
      'pa.handle a_handle, pa.name a_name, pa.friend_code a_code, pa.profile a_profile, pa.app_v a_v, pa.last_seen a_seen, ' +
      'pb.handle b_handle, pb.name b_name, pb.friend_code b_code, pb.profile b_profile, pb.app_v b_v, pb.last_seen b_seen ' +
      'FROM friendships f JOIN players pa ON pa.id = f.a JOIN players pb ON pb.id = f.b ' +
      'WHERE f.a = ? OR f.b = ? ORDER BY f.ts DESC LIMIT 100',
  },
  {
    name: 'GET /steps/week finds a settled week through idx_grants_key',
    fragment: 'SELECT 1 FROM grants WHERE key = ? LIMIT 1',
    mustIndex: 'idx_grants_key',
    mustNotScan: 'SCAN grants',
    params: ['stepweek-2026-08-07'],
    sql: 'SELECT 1 FROM grants WHERE key = ? LIMIT 1',
  },
  {
    name: 'GET /steps/settled reads the paid podium through idx_grants_key',
    fragment: 'WHERE g.key = ?',
    mustIndex: 'idx_grants_key',
    mustNotScan: 'SCAN g',
    params: ['stepweek-2026-08-07'],
    sql:
      "SELECT g.payload, p.name, p.handle, json_extract(p.profile,'$.outfit') outfit " +
      'FROM grants g LEFT JOIN players p ON p.id = g.player_id WHERE g.key = ?',
  },
  /* ---- 2026-08-17: the grants pruner, and the /stats index swap ---------- */
  {
    /* The retention DELETE has to reach its candidates through ts, oldest
       first. Without idx_grants_ts the planner falls back to a MULTI-INDEX OR
       over idx_grants_key plus a temp b-tree for the ORDER BY, which measured
       382 ms a batch against 400,000 rows instead of 13.6 ms. That is a correct
       answer at 28x the cost, on a statement the cron runs every 15 minutes,
       which is exactly the failure this file exists to see. */
    name: 'the grants pruner walks candidates through idx_grants_ts',
    fragment: "OR (g.ts < ? AND p.last_seen < ?))",
    mustIndex: 'idx_grants_ts',
    mustNotScan: 'SCAN g',
    params: [Date.now(), 'stepweek-', 'stepweek.', Date.now() - 180 * 86400000, Date.now() - 180 * 86400000, 10],
    // BOUND is checked against the candidate SELECT, since a DELETE returns no rows.
    boundSql:
      `SELECT g.id FROM grants g LEFT JOIN players p ON p.id = g.player_id
        WHERE g.ts < ? AND (g.key < ? OR g.key >= ?)
          AND (g.id <= COALESCE(p.grants_ack, 0) OR g.type = 'cheer'
               OR (g.ts < ? AND p.last_seen < ?))
        ORDER BY g.ts LIMIT ?`,
    sql:
      `DELETE FROM grants WHERE id IN (
         SELECT g.id FROM grants g LEFT JOIN players p ON p.id = g.player_id
          WHERE g.ts < ?
            AND (g.key < ? OR g.key >= ?)
            AND (g.id <= COALESCE(p.grants_ack, 0) OR g.type = 'cheer'
                 OR (g.ts < ? AND p.last_seen < ?))
          ORDER BY g.ts LIMIT ?)`,
  },
  {
    /* THE 30 SECOND STATEMENT. The tester leaderboard groups the whole events
       table by device and reads `name` per row, so on (device, day) it is one
       table lookup per event: 33,883 ms at 12M rows, past D1's limit, at only
       2,600 daily devices. On (device, name, day) the grouping never leaves the
       index. "COVERING" is the word that has to be in this plan: without it the
       query is correct, fast-looking in a small fixture, and a timeout in
       production. */
    name: 'GET /stats tester leaderboard is a COVERING scan of idx_events_device_name_day',
    fragment: "WHERE e.day >= ? AND ${upto('+e.day')} AND ${noRl('e.name')} AND ${nin('e.device')}",
    mustIndex: 'COVERING INDEX idx_events_device_name_day',
    mustNotScan: 'SCAN e USING INDEX idx_events_device_day',
    params: ['2026-08-01', 'rl_recovery', 'rl_ridcheck'],
    sql:
      `SELECT e.device, COUNT(*) events,
              SUM(CASE WHEN e.name IN ('food_log','pit_win','boss_win','mini_win','cook','hatch','quest_claim','friend_battle','buy_weapon','transmute') THEN 1 ELSE 0 END) played,
              d.label, d.country, d.region, d.city,
              date(d.first_seen/1000,'unixepoch') first, date(d.last_seen/1000,'unixepoch') last
       FROM events e LEFT JOIN devices d ON d.device = e.device
       WHERE e.day >= ? AND +e.day <= '2026-08-31' AND e.name NOT IN (?,?) AND e.device NOT IN ('fb31564c-22cc-49e8-836b-2da8fbf8531f')
       GROUP BY e.device ORDER BY events DESC LIMIT 30`,
  },
  {
    /* Every day-ranged count on this route also needs `device`, and on (day)
       alone that meant leaving the index for the row. The upper bound added on
       2026-08-25 is planned here too, and deliberately: `day` is the leading
       column, so `>= ? AND <= 'x'` is one range seek and the COVERING plan below
       is the proof that bounding the window cost nothing. activeByDay 6,111 -> 348
       ms, dau 461 -> 13 ms at 12M rows. */
    name: 'GET /stats activeByDay never leaves idx_events_day_device',
    fragment: "SELECT day, COUNT(DISTINCT device) n FROM events WHERE day >= ? AND ${upto('day')}",
    mustIndex: 'COVERING INDEX idx_events_day_device',
    mustNotScan: 'SCAN events',
    params: ['2026-08-01'],
    sql: `SELECT day, COUNT(DISTINCT device) n FROM events WHERE day >= ? AND day <= '2026-08-31' AND device NOT IN ('fb31564c-22cc-49e8-836b-2da8fbf8531f') GROUP BY day ORDER BY day`,
  },
  {
    /* The retention pruner's own window DELETE. `day` is still the leading
       column of the widened index, so this plan must not have changed at all:
       if it ever reads SCAN events, the cron is reading the whole table every
       15 minutes. */
    name: 'the events pruner still reaches the window through a day index',
    fragment: 'DELETE FROM events WHERE id IN (SELECT id FROM events WHERE day < ? AND name NOT IN (',
    mustIndex: 'idx_events_day_device',
    mustNotScan: 'SCAN events',
    params: ['2026-08-16', 'rl_recovery', 'rl_ridcheck', 10],
    boundSql: 'SELECT id FROM events WHERE day < ? AND name NOT IN (?,?) LIMIT ?',
    sql: 'DELETE FROM events WHERE id IN (SELECT id FROM events WHERE day < ? AND name NOT IN (?,?) LIMIT ?)',
  },
  /* REMOVED, not lost: 'rateLimitRecovery seeks on device AND name'.
     It planned `SELECT COUNT(*) AS n FROM events WHERE device = ? AND name = ?
     AND ts > ?`, which was the recovery limiter counting its own rows in the
     events table. The concurrency work moved the limiter to its own
     `rate_limits` table with an atomic upsert, so that statement no longer
     exists anywhere in src/index.js and this case was planning a query nobody
     runs. The COVERAGE assertion below is what caught it, which is the whole
     reason that assertion exists: a plan test pinned to a deleted route reads
     green forever while guarding nothing.
     The index it guarded, idx_events_device_name_day, is still covered: the
     `testers` case above reads e.name out of it. */
];

/* ---- 2026-09-01: the tables nothing ever deleted from, and the bounded sweep
   -------------------------------------------------------------------------
   pruneStale() runs one statement shape against four tables, so these four
   cases share a `fragment`: the templated DELETE in src/index.js is the only
   place any of them is written down. What differs per table is the INDEX, and
   that is the whole point of planning them separately. devices is the one that
   needed a new index (migrations/2026-09-01-devices-retention.sql); without it
   the plan is SCAN devices, which the cron would run every 15 minutes forever.

   `${...}` below are literal characters in the source being searched for, not
   interpolations: these are single-quoted strings on purpose. */
const STALE_FRAGMENT = 'DELETE FROM ${rule.table} WHERE rowid IN (';
const staleCase = (table, col, index) => ({
  name: `the stale pruner reaches ${table} through ${index}`,
  fragment: STALE_FRAGMENT,
  mustIndex: `COVERING INDEX ${index}`,
  mustNotScan: `SCAN ${table}`,
  params: [Date.now(), 10],
  // BOUND is checked against the candidate SELECT, since a DELETE returns no rows.
  boundSql: `SELECT rowid FROM ${table} WHERE ${col} < ? LIMIT ?`,
  sql: `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${col} < ? LIMIT ?)`,
});
CASES.push(
  staleCase('devices', 'last_seen', 'idx_devices_last_seen'),
  staleCase('reports', 'ts', 'idx_reports_ts'),
  staleCase('leads', 'ts', 'idx_leads_ts'),
  staleCase('rate_limits', 'expires_at', 'idx_rate_limits_expiry'),
);

/* THE SWEEP ON THE REQUEST PATH, which is a different statement in a different
   place from the one above and has to be planned on its own. It used to be an
   unbounded `DELETE FROM rate_limits WHERE expires_at < ?` and round 12 measured
   202,733 rows going in a single 700 ms call, with five live backups queued
   behind D1's single writer paying about 675 ms each. This is the LIMITed form,
   lifted out of rateLimit() verbatim. */
const SWEEP_SQL =
  'DELETE FROM rate_limits WHERE rowid IN (SELECT rowid FROM rate_limits WHERE expires_at < ? LIMIT ?)';
CASES.push({
  name: 'the request-path sweep is a COVERING seek, not a walk of the expired set',
  fragment: SWEEP_SQL,
  mustIndex: 'COVERING INDEX idx_rate_limits_expiry',
  mustNotScan: 'SCAN rate_limits',
  params: [Date.now(), 1000],
  boundSql: 'SELECT rowid FROM rate_limits WHERE expires_at < ? LIMIT ?',
  sql: SWEEP_SQL,
});

const planOf = (sql, params) =>
  db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...params).map(r => r.detail).join(' | ');

for (const c of CASES) {
  test(c.name, () => {
    /* BOUND first: an empty sample set is a failure, not a pass. A DELETE
       returns no rows however well it matches, so those cases carry the
       candidate SELECT from inside them and the bound is checked on that. */
    const rows = db.prepare(c.boundSql || c.sql).all(...c.params);
    assert.ok(rows.length > 0, 'the query matched nothing, so its plan proves nothing');
    const plan = planOf(c.sql, c.params);
    assert.ok(plan.includes(c.mustIndex), `plan does not use ${c.mustIndex}:\n      ${plan}`);
    assert.ok(!plan.includes(c.mustNotScan), `plan still contains "${c.mustNotScan}":\n      ${plan}`);
  });
}

/* NO WINDOWED READ ON /stats MAY BE OPEN AT THE TOP END. The plan cases above
   pin two statements; this pins ALL of them, including the ones added tomorrow.
   715 rows dated up to three weeks ahead made WAU read 85 against a true 46,
   because `day >= ?` with no upper bound puts a future row inside "this week"
   and keeps it there until the calendar arrives. future-dates.test.mjs proves
   the same thing against a live worker, but it can only see figures whose event
   names it plants; this sees a new query the day it is written, with no fixture
   and nothing running. Both, because neither covers the other.
   `day = ?` is already exactly bounded (dau), so it passes on its own. */
test('every /stats read of `events` is bounded at BOTH ends', () => {
  const from = source.indexOf("path === '/stats'");
  const to = source.indexOf("path === '/admin/prune'");
  assert.ok(from > 0 && to > from, 'the /stats route moved; this guard cannot find it');
  const route = source.slice(from, to);
  // every template literal in the route that reads `events`
  const queries = route.split('`').filter(t => /FROM events/.test(t));
  assert.ok(queries.length >= 12, `only ${queries.length} events queries found in /stats; the parse is wrong`);
  const open = queries.filter(t => !t.includes('upto(') && !t.includes('day = ?'));
  assert.equal(open.length, 0,
    `${open.length} of ${queries.length} /stats reads of events have no upper day bound:\n      ` +
    open.map(t => t.replace(/\s+/g, ' ').trim().slice(0, 110)).join('\n      '));
});

test('COVERAGE: every statement above is still the one src/index.js runs', () => {
  for (const c of CASES) {
    assert.ok(source.includes(c.fragment),
      `src/index.js no longer contains "${c.fragment}". The route changed; update this file.`);
  }
});

test('the migration and schema.sql agree on both indexes', () => {
  const migration = readFileSync(join(HERE, 'migrations', '2026-08-16-indexes.sql'), 'utf8');
  for (const idx of ['idx_friendships_b', 'idx_grants_key']) {
    assert.ok(new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}\\b`).test(schema), `schema.sql is missing ${idx}`);
    assert.ok(new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}\\b`).test(migration), `the migration is missing ${idx}`);
  }
});

/* A migration file and schema.sql are two descriptions of one database, and a
   database only gets the migration. Every index the plans above depend on has to
   be in both, and the two the swap REPLACES have to be gone from both, or a
   production database keeps paying for indexes nothing reads while schema.sql
   claims a shape it does not have. */
test('the 2026-08-17 migration and schema.sql agree, and the replaced indexes are gone', () => {
  const migration = readFileSync(join(HERE, 'migrations', '2026-08-17-prune-and-stats.sql'), 'utf8');
  for (const idx of ['idx_grants_ts', 'idx_events_day_device', 'idx_events_device_name_day']) {
    assert.ok(new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}\\b`).test(schema), `schema.sql is missing ${idx}`);
    assert.ok(new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}\\b`).test(migration), `the migration is missing ${idx}`);
  }
  for (const gone of ['idx_events_day', 'idx_events_device_day']) {
    assert.ok(!new RegExp(`CREATE INDEX IF NOT EXISTS ${gone} `).test(schema),
      `schema.sql still creates ${gone}, which the swap replaced`);
    assert.ok(new RegExp(`DROP INDEX IF EXISTS ${gone}\\b`).test(migration),
      `the migration never drops ${gone}, so an existing database keeps paying for it`);
  }
  assert.ok(/ALTER TABLE players ADD COLUMN grants_ack INTEGER/.test(migration),
    'the migration never adds players.grants_ack, so an existing database can never prune a grant');
  assert.ok(/grants_ack INTEGER/.test(schema), 'schema.sql is missing players.grants_ack');
  // Create-before-drop, so an interrupted run leaves too many indexes, never too few.
  assert.ok(migration.indexOf('CREATE INDEX IF NOT EXISTS idx_events_day_device') < migration.indexOf('DROP INDEX IF EXISTS idx_events_day'),
    'the migration drops the old index before creating its replacement');
});

/* The /stats reporting window is a different question from the retention
   window, and it is only ever allowed to be the shorter of the two. Asking for
   30 days of a table that keeps 14 would report a window the pruner has already
   emptied, and the number would look like a collapse in usage. */
test('STATS_WINDOW_DAYS never exceeds EVENT_RETENTION_DAYS', () => {
  const retention = Number(/const EVENT_RETENTION_DAYS = (\d+)/.exec(source)?.[1]);
  const stats = Number(/const STATS_WINDOW_DAYS = (\d+)/.exec(source)?.[1]);
  assert.ok(retention > 0, 'EVENT_RETENTION_DAYS not found in src/index.js');
  assert.ok(stats > 0, 'STATS_WINDOW_DAYS not found in src/index.js');
  assert.ok(stats <= retention, `/stats reads ${stats} days of a table that keeps ${retention}`);
});

/* The dormancy window is applied INSIDE the pruner's outer age bound, so a
   number smaller than GRANT_RETENTION_DAYS would be silently clamped up to it
   and the constant would be describing a rule nobody runs. pruneGrants clamps it
   rather than trusting it; this is the assertion that says so out loud, so the
   day somebody lowers 180 to 30 they find out here rather than from a report of
   gifts going missing early. */
test('GRANT_DORMANT_DAYS is never shorter than GRANT_RETENTION_DAYS', () => {
  const grant = Number(/const GRANT_RETENTION_DAYS = (\d+)/.exec(source)?.[1]);
  const dormant = Number(/const GRANT_DORMANT_DAYS = (\d+)/.exec(source)?.[1]);
  assert.ok(grant > 0, 'GRANT_RETENTION_DAYS not found in src/index.js');
  assert.ok(dormant > 0, 'GRANT_DORMANT_DAYS not found in src/index.js');
  assert.ok(dormant >= grant, `the dormancy window (${dormant}d) is inside the age bound (${grant}d), so it is clamped`);
});

/* THE SWEEP MAY NEVER GO BACK TO BEING UNBOUNDED. The plan case above proves
   the LIMITed form reaches its rows well; it cannot prove the unbounded form is
   GONE, because a source file can contain both and only one of them runs. This
   is the assertion that goes red on the pre-2026-09-01 code, and it is on the
   request path rather than the cron, which is why it matters: what it stalls is
   somebody's backup finishing, not a background job. */
test('the request-path sweep of rate_limits carries a LIMIT', () => {
  assert.ok(source.includes(SWEEP_SQL),
    'the sweep statement has changed; re-read rateLimit() and update SWEEP_SQL here');
  assert.ok(!/DELETE FROM rate_limits WHERE expires_at < \?'/.test(source),
    'the unbounded sweep is back in src/index.js. One call took 700 ms for 202,733 rows and ' +
    'every signed write in flight queued behind it.');
});

/* STALE_RULES IS A LIST OF DECISIONS, so it is pinned as one. A table quietly
   dropped out of it stops being pruned and NOTHING else goes red: the pruner
   still runs, still reports a total, still says `more: false`, and the table it
   forgot grows forever exactly as it did before any of this was written. Each
   triple is (table, column, days) and each one was argued for in the note above
   STALE_RULES; changing a window is fine, changing it without coming through
   here is what this stops. */
test('STALE_RULES still covers every table that had no deleter at all', () => {
  const m = /const STALE_RULES = \[([\s\S]*?)\n\];/.exec(source);
  assert.ok(m, 'STALE_RULES is gone from src/index.js');
  const rules = [...m[1].matchAll(/\{ table: '(\w+)',\s*col: '(\w+)',\s*days: (\d+) \}/g)]
    .map(r => `${r[1]}.${r[2]}@${r[3]}`);
  assert.equal(rules.length, 4, `parsed ${rules.length} rules out of STALE_RULES, expected 4: ${rules}`);
  for (const want of ['devices.last_seen@365', 'reports.ts@365', 'leads.ts@365', 'rate_limits.expires_at@0']) {
    assert.ok(rules.includes(want), `STALE_RULES no longer contains ${want}, it has: ${rules.join(', ')}`);
  }
  /* The retention tables must come before the sweep. maxRows is shared across
     the whole run, so a busy hour of signed writes in front of them would starve
     the three tables this was written for. */
  assert.ok(rules.indexOf('rate_limits.expires_at@0') === rules.length - 1,
    `the rate_limits sweep is not last, so it can spend the tick's whole row budget: ${rules.join(', ')}`);
});

/* A PRUNER WITH NO CALLER IS AN INERT MECHANISM. pruneStale() can be perfect,
   its own suite can drive it through /dev/prune-stale and go green on every
   case, and if scheduled() does not call it then nothing is ever pruned in
   production and no test in this directory says so. The behaviour suite cannot
   see this either: it calls the DEV hook, which is a second caller. */
test('scheduled() actually runs the stale pruner', () => {
  const i = source.indexOf('async scheduled(event, env)');
  assert.ok(i > 0, 'scheduled() is gone; re-read the default export');
  const body = source.slice(i, source.indexOf('async fetch(request, env)', i));
  assert.ok(/await pruneStale\(env, now/.test(body),
    'scheduled() no longer calls pruneStale, so devices, reports and leads are back to growing forever');
  // Order matters: events has the 10 GB deadline and gets the budget first.
  assert.ok(body.indexOf('await pruneEvents(') < body.indexOf('await pruneStale('),
    'the stale pass now runs before the events pass, which is the one with the deadline');
});

/* Nothing may outlive the table it joins to. Both /stats reads of reports and
   leads LEFT JOIN devices for a label, and every surviving events row does too,
   so the devices window has to be the longest of the four. Shorten it below any
   of them and old rows silently lose their device without a single test
   noticing: the join is a LEFT JOIN and a COALESCE, so it degrades rather than
   throws, which is exactly why it needs saying here. */
test('the devices window outlives everything that joins to it', () => {
  const days = t => Number(new RegExp(`\\{ table: '${t}',\\s*col: '\\w+',\\s*days: (\\d+) \\}`).exec(source)?.[1]);
  const events = Number(/const EVENT_RETENTION_DAYS = (\d+)/.exec(source)?.[1]);
  const devices = days('devices');
  assert.ok(events > 0 && devices > 0, 'EVENT_RETENTION_DAYS or the devices rule is missing');
  assert.ok(devices >= events, `devices keeps ${devices} days of a table events keeps ${events} of`);
  for (const t of ['reports', 'leads']) {
    assert.ok(devices >= days(t), `devices keeps ${devices} days but ${t} keeps ${days(t)}, so old ${t} lose their label`);
  }
});

/* THE CROWD LOCKOUT, as arithmetic on the two constants rather than as 612 HTTP
   requests (security.test.mjs does it the expensive way against a real worker;
   this one sees it with nothing running). rl_events_ip was 600/hour, which is
   ten users posting 60 events an hour, and round 12 proved users 11 and 12 got
   429 on every post including a brand-new install's very first one. The IP
   bucket is a ceiling on ONE ABUSIVE SOURCE; the device bucket is the control.
   So the IP budget has to clear a crowd of CROWD_DEVICES devices all spending
   their per-device budget in full, or it is the binding constraint on a NAT and
   the crowds worth measuring are the ones that go dark. */
const CROWD_DEVICES = 100;
test(`the /events IP budget clears ${CROWD_DEVICES} devices at the per-device ceiling`, () => {
  const limitOf = n => Number(new RegExp(`${n}:\\s*\\{ limit: (\\d+)`).exec(source)?.[1]);
  const perDevice = limitOf('rl_events_dev'), perIp = limitOf('rl_events_ip');
  assert.ok(perDevice > 0 && perIp > 0, 'rl_events_dev / rl_events_ip are not in RATE_LIMITS any more');
  assert.ok(perIp >= perDevice * CROWD_DEVICES,
    `${perIp}/hour per IP is only ${Math.floor(perIp / perDevice)} devices at the ${perDevice}/hour device ceiling. ` +
    'On NAT that locks every further install out of analytics, first POST included.');
  // And the backstop must still EXIST: removing the IP bucket entirely would
  // pass the line above and leave an unsigned 51-writes-a-request route open.
  assert.ok(Number.isFinite(perIp), 'the IP backstop is gone from an unsigned route');
});

/* THE PREDICATE THAT DELETES SOMEBODY'S PRESENT, checked as SQL rather than as
   behaviour, because the behaviour suite needs a running worker and this file
   does not. The dormancy arm is only sound while BOTH of its clocks are in it.
   Drop `p.last_seen < ?` and it becomes a delete-on-age rule that takes a real
   reward off a player who is opening the app every day: an unacknowledged grant
   means the ack never landed, not that nobody is there. */
test('the dormancy arm still reads the RECIPIENT\'s clock, not only the gift\'s', () => {
  const i = source.indexOf('DELETE FROM grants WHERE id IN (');
  assert.ok(i > 0, 'the grants DELETE has moved; re-read pruneGrants and update this file');
  const stmt = source.slice(i, source.indexOf('.bind(', i));
  assert.ok(/OR \(g\.ts < \? AND p\.last_seen < \?\)/.test(stmt),
    'the grants pruner no longer requires the recipient to be dormant as well as the gift to be old:\n      ' + stmt.trim());
  // And the bind order has to match, or the two clocks are the same value read
  // from the wrong places and nothing says so.
  const bind = source.slice(source.indexOf('.bind(', i), source.indexOf('.run()', i));
  assert.ok(/dormantTs, dormantTs, n/.test(bind), `the dormancy bounds are not bound to dormantTs:\n      ${bind.trim()}`);
});

/* The four figures the swap moved OFF the events table. They were wrong before
   (each device's first SURVIVING day, not its first day) and they are the only
   reason totalDevices is now O(devices) instead of O(events). If one of them
   creeps back onto `events`, the dashboard silently starts lying again AND
   silently gets slow again, and neither shows up as a failure anywhere else. */
test('the all-time figures read `devices`, not `events`', () => {
  const stats = source.slice(source.indexOf("if (path === '/stats'"));
  const route = stats.slice(0, stats.indexOf('generatedAt: Date.now()'));
  for (const [figure, must] of [
    ['const totalDevices =', 'FROM devices'],
    ['const newByDay =', 'FROM devices'],
    ['const r = await q(`SELECT COUNT(*) total', 'FROM devices'],
  ]) {
    const i = route.indexOf(figure);
    assert.ok(i > 0, `${figure} has moved; re-read the /stats route and update this file`);
    const line = route.slice(i, route.indexOf('\n', i));
    assert.ok(line.includes(must), `${figure.trim()} no longer reads ${must}:\n      ${line.trim()}`);
    assert.ok(!/FROM events/.test(line), `${figure.trim()} went back to reading FROM events:\n      ${line.trim()}`);
  }
});

/* THE TRACE TABLE MUST NOT BECOME THE PROBLEM IT DOCUMENTS.
   prune_runs takes a row per tick, 96 a day, forever, and it is written by the
   one job on this worker whose entire purpose is stopping tables growing
   without a ceiling. A trim that silently stopped working would be invisible
   for months and then embarrassing, so it is proved here rather than asserted
   in a comment: the DELETE is lifted out of src/index.js verbatim and run
   against a real over-full table.
   DIRECTION: too many rows left is the failure. BOUND: the fixture is built
   larger than the ceiling first and checked, because a trim run against an
   already-small table would pass while doing nothing. */
const TRIM_SQL = 'DELETE FROM prune_runs WHERE id <= (SELECT MAX(id) FROM prune_runs) - ?';
test('the prune trace is trimmed to a fixed ceiling by the statement src/index.js runs', () => {
  assert.ok(source.includes(TRIM_SQL),
    'the trim statement has changed; re-read recordPruneRun and update TRIM_SQL here');
  const m = /const PRUNE_RUNS_KEEP = (\d+)/.exec(source);
  assert.ok(m, 'PRUNE_RUNS_KEEP is gone from src/index.js');
  const keep = Number(m[1]);

  const over = keep + 137;                       // deliberately not a round number
  const ins = db.prepare('INSERT INTO prune_runs (ts, ms, cron, ok, ev, ev_stop, ev_by, gr, gr_stop, err) VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (let i = 0; i < over; i++) ins.run(1000 + i, 1, '*/15 * * * *', 1, 0, null, '{}', 0, null, null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM prune_runs').get().n, over,
    'PRECONDITION: the fixture has to be over the ceiling or the trim proves nothing');
  const newestBefore = db.prepare('SELECT MAX(ts) t FROM prune_runs').get().t;

  db.prepare(TRIM_SQL).run(keep);

  assert.equal(db.prepare('SELECT COUNT(*) n FROM prune_runs').get().n, keep,
    `the trim left more than PRUNE_RUNS_KEEP (${keep}) rows, so the trace grows without bound`);
  assert.equal(db.prepare('SELECT MAX(ts) t FROM prune_runs').get().t, newestBefore,
    'the trim deleted the NEWEST run, which is the one anybody asking "did it run" needs');
  // And it is a no-op while the table is under the ceiling, so an early tick
  // does not delete the only run there is.
  db.prepare('DELETE FROM prune_runs').run();
  ins.run(9000, 1, '*/15 * * * *', 1, 0, null, '{}', 0, null, null);
  db.prepare(TRIM_SQL).run(keep);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM prune_runs').get().n, 1,
    'the trim ate the first ever run, so /admin/prune would report never-ran forever');
});

/* THE TRACE MAY NEVER BREAK THE PRUNE. prune_runs arrives by migration and
   deploy.sh does not run migrations, so there is a window in which the worker is
   live and the table is not there. If recordPruneRun let "no such table" out,
   observability would delete the thing it exists to observe: every tick would
   fail and nothing would be pruned. A source read rather than a behaviour test
   because provoking it needs the table dropped under a running worker, which
   this suite has no worker to do it to; retention.test.mjs covers the route's
   half of the same contract. */
test('recordPruneRun swallows its own failure, so a missing migration cannot stop the prune', () => {
  const i = source.indexOf('async function recordPruneRun');
  assert.ok(i > 0, 'recordPruneRun is gone; re-read scheduled() and update this file');
  const body = source.slice(i, source.indexOf('\n}', i));
  assert.ok(/\btry\s*\{/.test(body) && /\bcatch\s*\(/.test(body),
    'recordPruneRun no longer catches. A worker deployed before its migration would now fail every ' +
    'cron tick and prune nothing, which is strictly worse than having no trace at all.');
  assert.ok(!/\bthrow\b/.test(body), 'recordPruneRun rethrows, which is the same failure by another route');
});

/* A migration file and schema.sql are two descriptions of one database, and a
   PRODUCTION database only ever gets the migration. The plan case above runs
   against schema.sql, so without this the index could be in schema.sql, absent
   from production, and the plan test would stay green while the live cron
   scanned a million-row table every fifteen minutes. */
test('the devices retention index is in both schema.sql and its migration', () => {
  const migration = readFileSync(join(HERE, 'migrations', '2026-09-01-devices-retention.sql'), 'utf8');
  const re = /CREATE INDEX IF NOT EXISTS idx_devices_last_seen\b/;
  assert.ok(re.test(schema), 'schema.sql is missing idx_devices_last_seen');
  assert.ok(re.test(migration), 'the migration is missing idx_devices_last_seen');
});

test('the prune_runs migration and schema.sql agree', () => {
  const migration = readFileSync(join(HERE, 'migrations', '2026-08-25-prune-runs.sql'), 'utf8');
  const re = /CREATE TABLE IF NOT EXISTS prune_runs\b/;
  assert.ok(re.test(schema), 'schema.sql is missing prune_runs');
  assert.ok(re.test(migration), 'the migration is missing prune_runs');
  /* Same columns in both, or a database that only ever gets the migration ends
     up a shape schema.sql does not describe and the INSERT throws. */
  const cols = sql => (/CREATE TABLE IF NOT EXISTS prune_runs \(([^;]*)\)/.exec(sql)[1])
    .split('\n').map(l => (/^\s*(\w+)\s/.exec(l) || [])[1]).filter(Boolean).sort().join(',');
  assert.equal(cols(migration), cols(schema),
    'prune_runs has different columns in schema.sql and its migration');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
