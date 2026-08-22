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
const P = ['pa', 'pb', 'pc'];
for (const id of P) {
  db.prepare('INSERT INTO players (id, pubkey, handle, friend_code, profile, created_at, last_seen) VALUES (?,?,?,?,?,?,?)')
    .run(id, 'k-' + id, 'Grim Tibia', 'BONE-' + id.toUpperCase() + '-AAAA', '{"outfit":{}}', 1, 2);
}
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
   alone), pc's is neither and must be the row the pruner leaves behind. */
const OLD_TS = 1;
db.prepare('INSERT INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
  .run('pa', 'gift-free-pz-2026-01-01', 'gift', '{"coins":50}', OLD_TS);
db.prepare('INSERT INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
  .run('pb', 'cheer-pz-2026-01-01-0', 'cheer', '{"cheer":3}', OLD_TS);
db.prepare('INSERT INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
  .run('pc', 'gift-free-pz-2026-01-02', 'gift', '{"coins":50}', OLD_TS);
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
    fragment: "AND (g.id <= COALESCE(p.grants_ack, 0) OR g.type = 'cheer')",
    mustIndex: 'idx_grants_ts',
    mustNotScan: 'SCAN g',
    params: [Date.now(), 'stepweek-', 'stepweek.', 10],
    // BOUND is checked against the candidate SELECT, since a DELETE returns no rows.
    boundSql:
      `SELECT g.id FROM grants g LEFT JOIN players p ON p.id = g.player_id
        WHERE g.ts < ? AND (g.key < ? OR g.key >= ?)
          AND (g.id <= COALESCE(p.grants_ack, 0) OR g.type = 'cheer')
        ORDER BY g.ts LIMIT ?`,
    sql:
      `DELETE FROM grants WHERE id IN (
         SELECT g.id FROM grants g LEFT JOIN players p ON p.id = g.player_id
          WHERE g.ts < ?
            AND (g.key < ? OR g.key >= ?)
            AND (g.id <= COALESCE(p.grants_ack, 0) OR g.type = 'cheer')
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
    fragment: "WHERE e.day >= ? AND ${noRl('e.name')} AND ${nin('e.device')}",
    mustIndex: 'COVERING INDEX idx_events_device_name_day',
    mustNotScan: 'SCAN e USING INDEX idx_events_device_day',
    params: ['2026-08-01', 'rl_recovery', 'rl_ridcheck'],
    sql:
      `SELECT e.device, COUNT(*) events,
              SUM(CASE WHEN e.name IN ('food_log','pit_win','boss_win','mini_win','cook','hatch','quest_claim','friend_battle','buy_weapon','transmute') THEN 1 ELSE 0 END) played,
              d.label, d.country, d.region, d.city,
              date(d.first_seen/1000,'unixepoch') first, date(d.last_seen/1000,'unixepoch') last
       FROM events e LEFT JOIN devices d ON d.device = e.device
       WHERE e.day >= ? AND e.name NOT IN (?,?) AND e.device NOT IN ('fb31564c-22cc-49e8-836b-2da8fbf8531f')
       GROUP BY e.device ORDER BY events DESC LIMIT 30`,
  },
  {
    /* Every day-ranged count on this route also needs `device`, and on (day)
       alone that meant leaving the index for the row. activeByDay 6,111 -> 348
       ms, dau 461 -> 13 ms at 12M rows. */
    name: 'GET /stats activeByDay never leaves idx_events_day_device',
    fragment: 'SELECT day, COUNT(DISTINCT device) n FROM events WHERE day >= ?',
    mustIndex: 'COVERING INDEX idx_events_day_device',
    mustNotScan: 'SCAN events',
    params: ['2026-08-01'],
    sql: `SELECT day, COUNT(DISTINCT device) n FROM events WHERE day >= ? AND device NOT IN ('fb31564c-22cc-49e8-836b-2da8fbf8531f') GROUP BY day ORDER BY day`,
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
