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

/* test() is synchronous and would report a REJECTED PROMISE AS A PASS, so the
   async cases at the bottom of this file use this instead and await it at the
   call site. A guard that cannot go red is not a guard. */
async function atest(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
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
/* The board columns ride along, because from 2026-09-01 both boards RANK on
   them: a fixture whose level/badges/week_key are all NULL would match nothing
   and the BOUND assertion below would fail every board case for the wrong
   reason. RACE_WEEK is the week the /steps/week case asks for. */
const RACE_WEEK = '2026-08-31';
const P = ['pa', 'pb', 'pc'];
for (const id of P) {
  db.prepare(`INSERT INTO players (id, pubkey, handle, friend_code, profile, created_at, last_seen,
                                   level, badges, week_key, week_steps)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, 'k-' + id, 'Grim Tibia', 'BONE-' + id.toUpperCase() + '-AAAA',
         JSON.stringify({ outfit: {}, raceV: 2, weekKey: RACE_WEEK, weekSteps: 40000 }),
         1, Date.now(), 7, 3, RACE_WEEK, 40000);
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
/* ---- GET /friends, LIFTED OUT OF THE ROUTE ------------------------------
   The route builds one SELECT and runs it three times with three different
   predicates and three separate LIMITs. Retyping those here would mean the
   guards below could stay green against SQL the worker had stopped running, so
   they are pulled from src/index.js instead: the base SELECT is evaluated as
   the expression it is, and the three predicates are read off the batch. If the
   route stops looking like this, these throw rather than quietly passing. */
const friendsRoute = (() => {
  const i = source.indexOf("if (path === '/friends' && request.method === 'GET')");
  if (i < 0) throw new Error('GET /friends is gone from src/index.js; re-read the route and update this file');
  return source.slice(i, source.indexOf('Dark Spires: shared territory', i));
})();
const FRIEND_PAGE = Number(/const FRIEND_PAGE = (\d+)/.exec(source)?.[1]);
if (!FRIEND_PAGE) throw new Error('FRIEND_PAGE is gone from src/index.js');
/* new Function, not a hand-copied string: the argument is a source expression
   from this repo, not input. Parenthesised, because the lifted expression
   begins on its own line and a bare `return` before a newline is `return
   undefined` by ASI: the first build of this guard planned `undefined` and
   reported it as a type error rather than as the wrong SQL. */
const buildFriendSql = new Function('where',
  'return (' + (/env\.DB\.prepare\(([\s\S]*?)\);/.exec(friendsRoute) || [])[1] + ');');
const FRIEND_WHERES = [...friendsRoute.matchAll(/q\("([^"]+)"\)/g)].map(m => m[1]);
if (FRIEND_WHERES.length !== 3) throw new Error(`expected 3 GET /friends buckets, found ${FRIEND_WHERES.length}`);
const friendsSql = FRIEND_WHERES.map(buildFriendSql);

const CASES = [
  {
    /* The accepted bucket. Since 2026-09-03 this route runs THREE of these in
       one batch, one per bucket, and they differ only in the predicate that
       follows the OR pair (see friendsSql below, which lifts all three out of
       the source). Splitting the query added an `AND f.status = ...` to each,
       and an extra AND term is exactly the kind of thing that talks the planner
       out of the multi-index OR: if it does, the route reads every friendship
       row in the table three times per call instead of once. */
    name: 'GET /friends reaches the b side through idx_friendships_b',
    fragment: 'WHERE (f.a = ? OR f.b = ?) AND ',
    mustIndex: 'idx_friendships_b',
    mustNotScan: 'SCAN f',
    params: ['pb', 'pb', 101],
    get sql() { return friendsSql[0]; },
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
  /* ---- 2026-09-01: the two boards stop reading every player ------------- */
  {
    /* THE HOTTEST READ ON THE WORKER. Every crew-tab open fetches this, and it
       used to rank on CAST(json_extract(profile,'$.level')) plus
       json_extract(profile,'$.badges'), which no index can serve: a full walk
       of players, six json_extracts a row, and a temp b-tree to sort the lot
       for a hundred rows. Measured linear at about a microsecond a player,
       111 ms at 200,000 of them, against 0.24 ms and FLAT on idx_players_board.
       "SCAN players USING INDEX" is the ordered walk, which is the answer here;
       the temp b-tree is the thing that costs N and the thing this pins. */
    name: '/leaderboard ranks through idx_players_board with no sort',
    fragment: 'ORDER BY level DESC, badges DESC, last_seen DESC LIMIT 100',
    mustIndex: 'idx_players_board',
    mustNotScan: 'USE TEMP B-TREE FOR ORDER BY',
    params: [Date.now() - 7 * 86400000, Date.now(), Date.now() - 7 * 86400000],
    sql:
      `SELECT id, handle, name, level lvl, json_extract(profile,'$.levelName') lvlName, badges,
              json_extract(profile,'$.outfit') outfit, json_extract(profile,'$.pet') pet,
              json_extract(profile,'$.stats') stats,
              json_array_length(COALESCE(json_extract(profile,'$.gear'), '[]')) gearCount,
              last_seen, created_at,
              (SELECT COUNT(*) FROM spires sp WHERE sp.owner = players.id AND sp.tended_at > ?) spires,
              (SELECT COALESCE(SUM(? - sp.claimed_at), 0) FROM spires sp WHERE sp.owner = players.id AND sp.tended_at > ?) held_ms
       FROM players
       WHERE profile IS NOT NULL AND COALESCE(is_test, 0) = 0
       ORDER BY level DESC, badges DESC, last_seen DESC LIMIT 100`,
  },
  {
    /* Same class, and settlement calls this board TWICE. week_key and
       week_steps have been columns since 2026-08-16-hardening.sql and PUT
       /profile has always written them, so the JSON this route was re-parsing
       was never the only copy. On the columns the week is a SEEK and the order
       comes out of the index: 108 ms -> 0.02 ms at 200,000 players. raceV has
       no column and stays a json_extract, which is fine because it is now a
       residual on the 25 rows the index hands over. */
    name: '/steps/week seeks the race week through idx_players_week',
    fragment: 'ORDER BY week_steps DESC LIMIT 25',
    mustIndex: 'idx_players_week',
    mustNotScan: 'SCAN players',
    params: [RACE_WEEK],
    sql:
      /* The profile columns were added when the race board learned to open a
         racer's profile: they are per OUTPUT row, so the plan must be unchanged
         by them, and this copy carries them so the test keeps planning the query
         the route actually runs. */
      `SELECT id, handle, name, json_extract(profile,'$.outfit') outfit, week_steps steps,
              level lvl, json_extract(profile,'$.levelName') lvlName, badges,
              json_extract(profile,'$.pet') pet, json_extract(profile,'$.stats') stats,
              json_array_length(COALESCE(json_extract(profile,'$.gear'), '[]')) gearCount,
              last_seen seenAt
         FROM players
        WHERE profile IS NOT NULL
          AND COALESCE(is_test, 0) = 0
          AND week_key = ?
          AND CAST(COALESCE(json_extract(profile,'$.raceV'),0) AS INTEGER) >= 2
          AND week_steps > 0
        ORDER BY week_steps DESC LIMIT 25`,
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

/* ===========================================================================
   2026-09-01: THE BOARD MUST HAND BACK THE SAME PLAYERS IN THE SAME ORDER.
   ===========================================================================
   The plan cases above only prove the new queries are cheap. Cheap and wrong is
   the failure that matters here, and it has two distinct shapes:

     1. THE RATCHET. max_level was already sitting there and is tempting, but it
        is monotone: rank on it and every player who has ever been higher than
        they are now moves up the board. So `level` has to be the CURRENT claim.
     2. THE UN-BACKFILLED ROW. A new column is NULL until its owner next syncs,
        and NULL sorts LAST under DESC, so without the backfill the top 100 is
        rebuilt out of whoever happened to open the app since the deploy and
        everybody else silently vanishes. That is a worse bug than a slow board.

   So this runs the OLD json_extract query and the NEW column query over one
   fixture and requires an identical list of ids. The fixture is built with
   level/badges NULL, exactly as a live database looks the moment before the
   migration, and filled by the UPDATE statements READ OUT OF THE MIGRATION
   FILE ITSELF, so a backfill that stops matching what the board used to compute
   goes red here rather than on the Crew tab.

   TIES: level ties and (level, badges) ties are both in the fixture and both
   are broken by last_seen, which is unique across it, so the whole order is
   determined and an exact id sequence is a fair thing to demand. A THREE-WAY
   tie is deliberately not asserted on: neither plan promises an order for it,
   the old one no more than the new one, so pinning it would be pinning
   SQLite's sorter rather than this change. */
test('the board ranks the same players in the same order after the migration', () => {
  const bdb = new DatabaseSync(':memory:');
  bdb.exec(schema);

  /* Every row is left with level/badges NULL, which is exactly what a live
     database looks like the moment before the migration: the JSON is the only
     copy of the rank key. last_seen is unique and deliberately NOT in board
     order, so a board that has lost its ranking key falls back to last_seen and
     produces a visibly different list.
     The cases: a plain high row; one that beats the next two on badges alone;
     two on the same level AND badges, split by last_seen; a snapshot with NO
     level key at all (the board's COALESCE default of 1, and 0 badges); a
     flagged test account that must never appear at any rank; and a registration
     that has never synced a snapshot. */
  const add = (id, snap, seen, isTest = 0) =>
    bdb.prepare('INSERT INTO players (id, pubkey, handle, friend_code, profile, created_at, last_seen, is_test) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, 'k-' + id, 'Grim Tibia', 'BONE-' + id.toUpperCase() + '-AAAA',
           snap === null ? null : JSON.stringify(snap), 1, seen, isTest);
  add('top', { level: 40, badges: 2 }, 1000);
  add('tie-a', { level: 30, badges: 9 }, 500);
  add('tie-b', { level: 30, badges: 4 }, 900);
  add('tie-c', { level: 30, badges: 4 }, 300);   // same level AND badges as tie-b
  add('nolevel', {}, 700);
  /* THE THREE ROWS THAT MAKE THE COALESCE DEFAULTS LOAD-BEARING, and each one
     needs a NEIGHBOUR at the defaulted value or the slip changes nothing.
     `lvl1` states level 1 outright, below `nolevel` on last_seen, so defaulting
     an absent level to 0 drops nolevel under it. `nobadges` states a level and
     no badge count, and `badge1` sits at exactly one badge below it on
     last_seen, so defaulting absent badges to anything but 0 lifts nobadges
     over it. Both were silently green without the neighbour: an affected row
     that is already last stays last however it is scored. */
  add('lvl1', { level: 1, badges: 0 }, 200);
  add('nobadges', { level: 30 }, 400);
  add('badge1', { level: 30, badges: 1 }, 100);
  add('cheat', { level: 999, badges: 999 }, 800, 1);
  add('never', null, 600);

  const OLD = `SELECT id FROM players
                WHERE profile IS NOT NULL AND COALESCE(is_test, 0) = 0
                ORDER BY CAST(COALESCE(json_extract(profile,'$.level'), 1) AS INTEGER) DESC,
                         CAST(COALESCE(json_extract(profile,'$.badges'), 0) AS INTEGER) DESC,
                         last_seen DESC LIMIT 100`;
  const NEW = `SELECT id FROM players
                WHERE profile IS NOT NULL AND COALESCE(is_test, 0) = 0
                ORDER BY level DESC, badges DESC, last_seen DESC LIMIT 100`;
  const before = bdb.prepare(OLD).all().map(r => r.id);
  assert.ok(before.length > 0, 'the fixture matched nothing, so the comparison proves nothing');
  assert.ok(!before.includes('cheat') && !before.includes('never'),
    'the fixture is wrong: the excluded rows are on the old board too');

  /* THE BACKFILL IS LOAD-BEARING, and this is where that is proved rather than
     asserted: with the columns still NULL, which is every row on the day the
     migration lands, the new ORDER BY has nothing to rank on and hands back a
     different board. If somebody deletes the UPDATE below and this test still
     passes, the fixture has stopped reaching the bug. */
  const unbackfilled = bdb.prepare(NEW).all().map(r => r.id);
  assert.notDeepEqual(unbackfilled, before,
    'an un-backfilled board matched the old one, so the backfill below proves nothing');

  /* The migration's own backfill, not a copy of it. */
  const backfill = readFileSync(join(HERE, 'migrations', '2026-09-01-board-backfill.sql'), 'utf8');
  const updates = backfill.replace(/^\s*--.*$/gm, '').split(';').map(s => s.trim())
    .filter(s => /^UPDATE players\b/i.test(s) && /\blevel\b/.test(s));
  assert.equal(updates.length, 1, `expected one level backfill in the migration, found ${updates.length}`);
  bdb.exec(updates[0]);

  const after = bdb.prepare(NEW).all().map(r => r.id);
  assert.deepEqual(after, before,
    `the board reordered.\n      before ${before.join(',')}\n      after  ${after.join(',')}`);
  bdb.close();
});

test('the 2026-09-01 migration and schema.sql agree on both board indexes', () => {
  const migration = readFileSync(join(HERE, 'migrations', '2026-09-01-board-columns.sql'), 'utf8');
  const backfill = readFileSync(join(HERE, 'migrations', '2026-09-01-board-backfill.sql'), 'utf8');
  /* THE BACKFILL IS A SEPARATE FILE SO IT CAN BE RUN TWICE, which is the whole
     mechanism that closes the window between this migration and the deploy.
     `wrangler d1 execute --file` stops at the first error and a second
     ADD COLUMN always errors, so one ALTER in here silently makes the re-run a
     no-op that reports a failure and changes nothing. Measured on the local
     database 2026-09-01, which is how the split came to exist. */
  assert.ok(!/ALTER TABLE/i.test(backfill.replace(/^\s*--.*$/gm, '')),
    'the backfill file contains an ALTER, so re-running it aborts before the UPDATEs and the post-deploy sweep does nothing');
  for (const idx of ['idx_players_board', 'idx_players_week']) {
    assert.ok(new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}\\b`).test(schema), `schema.sql is missing ${idx}`);
    assert.ok(new RegExp(`CREATE INDEX IF NOT EXISTS ${idx}\\b`).test(migration), `the migration is missing ${idx}`);
  }
  /* A column the migration adds but schema.sql does not declare means a fresh
     database and a migrated one are different shapes, and the board is broken on
     exactly one of them. */
  for (const col of ['level', 'badges']) {
    assert.ok(new RegExp(`ALTER TABLE players ADD COLUMN ${col}\\b`).test(migration),
      `the migration never adds players.${col}`);
    assert.ok(new RegExp(`^\\s*${col} INTEGER`, 'm').test(schema),
      `schema.sql does not declare players.${col}`);
  }
});

/* PUT /profile IS THE ONLY WRITER, so it is the only thing keeping the columns
   equal to the snapshot the board used to read. If somebody adds a route that
   writes `profile` without writing `level` beside it, both boards start ranking
   on a value that has stopped moving, and nothing else in this suite would see
   it: the answer stays plausible and only the ORDER is wrong. */
test('every write of players.profile also writes the materialised rank key', () => {
  const writes = [...source.matchAll(/UPDATE players SET[\s\S]{0,400}?WHERE/g)]
    .map(m => m[0]).filter(s => /\bprofile\s*=/.test(s));
  assert.ok(writes.length >= 2, `only ${writes.length} writes of players.profile found; the parse is wrong`);
  for (const w of writes) {
    const oneLine = w.replace(/\s+/g, ' ').slice(0, 120);
    /* /dev/week-warp writes only the two race fields, through json_set, and it
       writes week_key/week_steps beside them. Anything that writes the whole
       snapshot has to write level and badges too. */
    if (/json_set\(/.test(w)) {
      assert.ok(/week_key\s*=/.test(w), `a json_set write of profile does not write week_key: ${oneLine}`);
      continue;
    }
    assert.ok(/\blevel\s*=/.test(w) && /\bbadges\s*=/.test(w),
      `this write replaces the snapshot without updating the board's rank key: ${oneLine}`);
  }
});

/* ===========================================================================
   2026-09-03: SURVEY V2. THE ROW GROWS A FORM AND A JSON ANSWER BLOB.
   ===========================================================================
   `leads` was one fixed column per v1 question, so every change of question was
   a migration. form/answers/ctx end that. Four things can break here and none
   of them would show up anywhere else in this directory:

     1. THE TWO DESCRIPTIONS DRIFT. A production database only ever gets the
        migration; every suite here builds schema.sql. A column in one and not
        the other means the INSERT throws on exactly one of the two databases,
        and it is the one with the players on it.
     2. THE INSERT AND THE SCHEMA DISAGREE. POST /survey names fifteen columns
        now. A typo there is a 500 on submit and no source-reading test can see
        it; this one RUNS the statement.
     3. THE BLOB GOES IN UNREADABLE. The reason the cap refuses instead of
        truncating is that a sliced JSON string can never be read back, so the
        readback is asserted through json_extract, which is how these rows will
        actually be queried.
     4. THE DASHBOARD AVERAGES TWO SURVEYS TOGETHER. Different questions, same
        column: one list of both is a number with no meaning.

   No worker and no wrangler for any of it: the real statements are lifted out
   of src/index.js and run against schema.sql in local SQLite, and dashboard.html
   is rendered by running its own script. The HTTP half of S1 (the 400 at the
   cap, the rate limit) is in security.test.mjs, which needs a running worker.
   =========================================================================== */
test('the survey v2 migration and schema.sql agree on leads', () => {
  const migration = readFileSync(join(HERE, 'migrations', '2026-09-03-survey-v2.sql'), 'utf8');
  for (const col of ['form', 'answers', 'ctx']) {
    assert.ok(new RegExp(`ALTER TABLE leads ADD COLUMN ${col}\\b`).test(migration),
      `the migration never adds leads.${col}`);
    assert.ok(new RegExp(`^\\s*${col} TEXT`, 'm').test(schema),
      `schema.sql does not declare leads.${col}, so a fresh database and a migrated one are different shapes`);
  }
});

/* The real INSERT and the real dashboard SELECT, lifted out of the route rather
   than retyped, so a column added to one and not the other goes red HERE rather
   than on submit. */
const surveyInsert = (/INSERT INTO leads \([^)]*\)\s*VALUES \([^)]*\)/.exec(source) || [])[0];
const leadsSelect = (/SELECT l\.name[\s\S]*?LIMIT 200/.exec(source) || [])[0];
const runnable = sql => sql.replace(/\$\{nin\('l\.device'\)\}/, "l.device NOT IN ('')");

test('a v1 body still inserts with form NULL, and a v2 body reads back through json_extract', () => {
  assert.ok(surveyInsert, 'the leads INSERT is gone from src/index.js; re-read POST /survey and update this file');
  const ldb = new DatabaseSync(':memory:');
  ldb.exec(schema);
  const ins = ldb.prepare(surveyInsert);
  const now = Date.now();
  /* A v1 client sends no form, no answers, no ctx. It must still land, and it
     must land as NULL: every row written before today is NULL and means v1, and
     two encodings of one form is a bucket the dashboard would split in half. */
  ins.run('dev-v1', null, null, 'Tom', 't@example.com', 1, 'nice', 'more pets', 'pit,log', null, null, null, '1.0', 'Vancouver', now);
  const v1 = ldb.prepare('SELECT form, answers, ctx, feedback, most_wanted FROM leads WHERE device = ?').get('dev-v1');
  assert.equal(v1.form, null, 'a v1 body did not land with form NULL');
  assert.equal(v1.answers, null, 'a v1 body invented an answers blob');
  assert.equal(v1.ctx, null, 'a v1 body invented a ctx blob');
  assert.equal(v1.feedback, 'nice', 'a v1 field stopped working');
  assert.equal(v1.most_wanted, 'more pets', 'a v1 field stopped working');

  const answers = { q1: 'pit', q2: ['streak', 'pets'], q5: 'definitely', q6: 'too much tapping' };
  ins.run('dev-v2', null, null, null, null, 0, null, null, null, 'v2',
    JSON.stringify(answers), JSON.stringify({ days: 12, level: 7 }), '1.0', 'Vancouver', now);
  /* json_extract is the point. It is how the blob will be queried and it only
     works on a string that is still valid JSON, which is why the route refuses
     an over-cap payload instead of slicing it: a truncated blob would answer
     NULL to every one of these, forever, in a row nothing prunes for a year. */
  const got = ldb.prepare(`SELECT form,
      json_extract(answers, '$.q1') q1,
      json_extract(answers, '$.q2[1]') q2b,
      json_extract(answers, '$.q5') q5,
      json_extract(ctx, '$.level') lvl
    FROM leads WHERE device = ?`).get('dev-v2');
  assert.equal(got.form, 'v2', 'the form slug did not land');
  assert.equal(got.q1, 'pit');
  assert.equal(got.q2b, 'pets', 'a multi-select answer did not survive as an array');
  assert.equal(got.q5, 'definitely');
  assert.equal(got.lvl, 7, 'the silent context did not land');
  ldb.close();
});

/* THE ROUTE'S HALF OF "form NULL". The case above binds its own values, so it
   proves the COLUMN can hold NULL and nothing about what POST /survey writes
   when a pre-v2 client sends no form. Over HTTP that is invisible too: /stats
   COALESCEs NULL to 'dayone', so the payload looks identical either way, and
   the only thing that can tell them apart is the source. A source read is a
   weak guard and this is one on purpose, for the same reason recordPruneRun's
   is above: the alternative is a DEV route added for one assertion.
   WHY IT MATTERS. A literal 'dayone' written here would give v1 two encodings,
   NULL for every row before 2026-09-03 and a string for every one after, and
   the dashboard's filter would quietly split the v1 cohort in half. */
test('POST /survey writes form NULL, not a literal, when the client sends none', () => {
  const i = source.indexOf("if (path === '/survey' && request.method === 'POST')");
  assert.ok(i > 0, 'POST /survey is gone; re-read the route and update this file');
  const route = source.slice(i, source.indexOf('INSERT INTO leads', i));
  const m = /\.test\(rawForm\)\s*\?\s*rawForm\s*:\s*([^;]+);/.exec(route);
  assert.ok(m, 'the form fallback is gone from POST /survey; re-read it and update this file');
  assert.equal(m[1].trim(), 'null',
    `an absent form falls back to ${m[1].trim()}, so v1 now has two encodings and the dashboard filter splits the cohort`);
});

/* Run dashboard.html's own script over a leads array and return what it painted
   into #leadsBox. The page is one <script> with no imports, so a four-method DOM
   stub is enough, and this grades the SHIPPED file rather than a copy of its
   logic. getElementById only finds ids the page has actually WRITTEN, so a case
   cannot assert against a control the render never emitted. */
async function renderLeads(leads, form = null) {
  const page = readFileSync(join(HERE, 'dashboard.html'), 'utf8');
  const src = /<script>([\s\S]*?)<\/script>\s*<\/body>/.exec(page)[1];
  const nodes = {};
  const make = id => (nodes[id] = { id, value: '', innerHTML: '', textContent: '', onclick: null, onchange: null });
  for (const id of ['out', 'api', 'token', 'go']) make(id);
  const drawn = () => Object.values(nodes).map(n => n.innerHTML).join('');
  const document = {
    querySelector: s => nodes[s.replace(/^#/, '')] || make(s),
    getElementById: id => nodes[id] || (drawn().includes(`id="${id}"`) ? make(id) : null),
  };
  const payload = {
    windowDays: 60, statsWindowDays: 14, totalDevices: 1, dau: 1, wau: 1, totalEvents: 1,
    byName: [{ name: 'a', n: 1 }], activeByDay: [{ day: '2026-09-01', n: 1 }], newByDay: [],
    screenTime: [], featureOpens: [], featureTime: [], playMinutes: 1, sessions: 1, avgSessionMin: 1,
    returnRate: 0.5, testers: [], byCountry: [], byCity: [], reports: [], leads, errors: [],
    errorsByBuild: [], vault: {}, generatedAt: Date.now(),
  };
  const fetchStub = async u => (String(u).includes('/admin/prune') ? { ok: false } : { ok: true, json: async () => payload });
  const app = new Function('document', 'localStorage', 'navigator', 'fetch', src + '\nreturn { load };')(
    document, {}, { clipboard: { writeText: async () => {} } }, fetchStub);
  nodes.api.value = 'http://x'; nodes.token.value = 't';
  await app.load();
  if (form) {
    assert.ok(nodes.leadForm, 'dashboard.html painted no form filter at all');
    nodes.leadForm.value = form; nodes.leadForm.onchange();
  }
  assert.ok(nodes.leadsBox, 'dashboard.html painted no #leadsBox at all');
  // asserted on TEXT, so a change of markup is not a false red
  return nodes.leadsBox.innerHTML.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
}

await atest('a seeded v2 lead reaches the dashboard payload with its answers parsed', async () => {
  assert.ok(leadsSelect, 'the dashboard leads SELECT is gone from src/index.js; re-read /stats and update this file');
  const ldb = new DatabaseSync(':memory:');
  ldb.exec(schema);
  const now = Date.now();
  const answers = { q1: 'pit', q2: ['streak'], q3: ['pit'], q3text: 'The Pit rules', q4: 'spires', q5: 'probably', q6: 'too much tapping' };
  const ins = ldb.prepare(surveyInsert);
  ins.run('dev-seed', null, null, 'Seed', null, 0, null, null, null, 'v2', JSON.stringify(answers), '{}', '1.0', 'Vancouver', now);
  // one pre-v2 row, so the COALESCE that makes NULL read as v1 is exercised
  ins.run('dev-old', null, null, 'Old', null, 0, 'nice', null, null, null, null, null, '1.0', 'x', now - 1);
  const rows = ldb.prepare(runnable(leadsSelect)).all();
  assert.equal(rows.length, 2, 'the seeded leads did not come back at all');
  const seeded = rows.find(r => r.name === 'Seed');
  assert.ok(seeded, 'the v2 lead is missing from the payload');
  assert.equal(seeded.form, 'v2', 'the payload does not carry the form');
  assert.deepEqual(JSON.parse(seeded.answers), answers, 'the answers blob did not survive the round trip');
  assert.equal(rows.find(r => r.name === 'Old').form, 'dayone',
    'a pre-v2 row did not COALESCE to dayone, so the dashboard would grow a third, nameless bucket');
  ldb.close();

  /* AND THE PAGE ACTUALLY RENDERS IT. A correct payload is half of S2; the
     other half is dashboard.html tallying it, and a tally that divides by the
     wrong n is a plausible-looking wrong number. */
  const painted = await renderLeads(rows);
  assert.match(painted, /Still playing in a month: 100% \(n=1\)/,
    'the Q5 line is missing, or it counted the v1 row, which never answered Q5');
  assert.match(painted, /Why did you open the app today\?[\s\S]{0,60}n=1/, 'Q1 has no tally');
  assert.match(painted, /too much tapping/, 'the Q6 free text is not listed');
  assert.ok(!/nice/.test(painted), 'a v1 answer leaked into the v2 tally');
});

await atest('the dashboard form filter keeps v1 and v2 apart', async () => {
  const now = Date.now();
  const leads = [
    { form: 'v2', name: 'New', answers: JSON.stringify({ q1: 'pit', q5: 'definitely' }), ctx: '{}', ts: now },
    { form: 'dayone', name: 'Old', feedback: 'nice', mostWanted: 'more pets', features: 'pit', ts: now - 1 },
  ];
  const v2 = await renderLeads(leads);
  assert.match(v2, /Still playing in a month/, 'the v2 view is not the v2 view');
  assert.ok(!/more pets/.test(v2), 'a v1 card rendered inside the v2 tally');
  const v1 = await renderLeads(leads, 'dayone');
  assert.match(v1, /more pets/, 'switching the filter to v1 did not bring the v1 cards back');
  assert.ok(!/Still playing in a month/.test(v1), 'the v2 tally survived a switch to v1');
  /* THE COUNT, NOT THE RENDERER. Which renderer runs is decided by the filter's
     VALUE, and that still looks right when the filter passes every row through:
     an earlier version of this case stayed green against a build with the
     filter deleted. n is the state that actually differs. */
  assert.match(v1, /\b1 response\b/, 'the v1 view counted a v2 row, so the filter is not filtering');
});

/* A malformed blob must cost one card, not the page. answers is written by a
   client and read a year later; one bad row taking the whole dashboard down is
   how a data bug becomes an outage. */
await atest('an unparseable answers blob does not take the dashboard down', async () => {
  const painted = await renderLeads([{ form: 'v2', name: 'x', answers: '{not json', ctx: '{}', ts: Date.now() }]);
  assert.match(painted, /Why did you open the app today\?/, 'the page did not render at all');
  assert.match(painted, /nobody answered/, 'a garbage blob was counted as an answer');
});

/* ===========================================================================
   GET /friends: A REQUEST CANNOT BE CROWDED OUT BY A FRIENDSHIP (2026-09-03)
   ===========================================================================
   THE BUG. All three buckets came out of one `WHERE f.a = ? OR f.b = ?
   ORDER BY f.ts DESC LIMIT 100` and were split apart in JS, so the 100 was
   SHARED. friendships.ts is the accept time for an accepted row and the request
   time for a pending one, and the two live in one ordering: every friendship a
   busy player accepts lands a row ABOVE an unanswered request, so a request
   that is not acted on slides down the list and, at 100 rows newer than it,
   stops being returned. Nothing tells the player, nothing tells the sender, and
   the client counts what it received as the whole truth. Past 100 accepted
   rows the same ordering silently drops accepted FRIENDS off the bottom too.

   These run the route's own SQL (lifted above) with the route's own binds and
   the route's own take/truncate arithmetic, against a fixture with the real
   schema. What they cannot see is the HTTP layer: verifySigned, the batch
   itself, and JSON encoding. security.test.mjs is where that would live and it
   needs a running worker.
   =========================================================================== */

/* The three binds, read off the route rather than retyped, so the LIMIT the
   guards below exercise is the LIMIT the worker sends. Each is `(me...,
   limit)`; how many `me`s differ per bucket (the pending ones bind
   requested_by too). */
const FRIEND_BINDS = [...friendsRoute.matchAll(/q\("[^"]+"\)\.bind\(([^)]*)\)/g)].map(m => {
  const args = m[1].split(',').map(s => s.trim());
  return { ids: args.length - 1, limit: new Function('FRIEND_PAGE', `return (${args.at(-1)});`)(FRIEND_PAGE) };
});
if (FRIEND_BINDS.length !== 3) throw new Error(`expected 3 GET /friends binds, found ${FRIEND_BINDS.length}`);

/* The route's read path end to end, minus HTTP: three bound statements, then
   the +1 row dropped and turned into `truncated`. */
function friendsPayload(fdb, me) {
  const out = { friends: [], incoming: [], outgoing: [], truncated: {} };
  ['friends', 'incoming', 'outgoing'].forEach((key, i) => {
    const b = FRIEND_BINDS[i];
    const rows = fdb.prepare(friendsSql[i]).all(...Array(b.ids).fill(me), b.limit);
    out.truncated[key] = rows.length > FRIEND_PAGE;
    out[key] = rows.slice(0, FRIEND_PAGE).map(r => ({ playerId: r.a === me ? r.b : r.a, since: r.ts }));
  });
  return out;
}

/* `accepted` friendships, all NEWER than `requestTs`, plus one pending request
   INTO `me` from a stranger. `me` is always on the `a` side of half of them and
   the `b` side of the other half, because the route's OR is the only reason
   either side is reachable. */
function seedCrew({ accepted, requestTs = 1, outgoing = 0 }) {
  const fdb = new DatabaseSync(':memory:');
  fdb.exec(schema);
  const player = (id, seen = Date.now()) =>
    fdb.prepare('INSERT INTO players (id, pubkey, handle, friend_code, profile, created_at, last_seen) VALUES (?,?,?,?,?,?,?)')
      .run(id, 'k-' + id, 'Grim Tibia', 'BONE-' + id.toUpperCase(), '{"outfit":{},"level":4}', 1, seen);
  const link = (x, y, status, by, ts) =>
    fdb.prepare('INSERT INTO friendships (a, b, status, requested_by, ts) VALUES (?,?,?,?,?)')
      .run(...(x < y ? [x, y] : [y, x]), status, by, ts);
  player('me');
  for (let i = 0; i < accepted; i++) { const o = `fr${String(i).padStart(4, '0')}`; player(o); link('me', o, 'accepted', 'me', 1000 + i); }
  for (let i = 0; i < outgoing; i++) { const o = `og${String(i).padStart(4, '0')}`; player(o); link('me', o, 'pending', 'me', 1000 + i); }
  player('stranger');
  link('me', 'stranger', 'pending', 'stranger', requestTs);
  return fdb;
}

/* THE DEFECT ITSELF. The request is the OLDEST row in the set, which is what an
   unanswered request becomes after a hundred friendships are accepted over it.
   PROVE-RED: in src/index.js, change the base SELECT's
     'WHERE (f.a = ? OR f.b = ?) AND ' + where + ' ORDER BY f.ts DESC LIMIT ?'
   back to
     'WHERE f.a = ? OR f.b = ? ORDER BY f.ts DESC LIMIT ?'
   (one line: the old shared query, with every bucket reading the same 100 rows)
   -> "the incoming request was ordered out by 100 accepted friendships". */
test('100 accepted friendships do not hide an older incoming request', () => {
  const fdb = seedCrew({ accepted: 100, requestTs: 1 });
  const p = friendsPayload(fdb, 'me');
  assert.equal(p.incoming.length, 1, 'the incoming request was ordered out by 100 accepted friendships');
  assert.equal(p.incoming[0].playerId, 'stranger');
  assert.equal(p.friends.length, 100, 'the accepted bucket lost rows to the other buckets');
  fdb.close();
});

/* A player's OWN outgoing requests must not starve their incoming ones either:
   that is the same defect with the sender in the room, and it is reachable by
   one player tapping Add a hundred times.
   PROVE-RED: same one-line revert as above -> incoming comes back 0. */
test('100 outgoing requests do not hide an older incoming request', () => {
  const fdb = seedCrew({ accepted: 0, outgoing: 100, requestTs: 1 });
  const p = friendsPayload(fdb, 'me');
  assert.equal(p.incoming.length, 1, 'the incoming request was ordered out by 100 outgoing requests');
  assert.equal(p.outgoing.length, 100, 'the outgoing bucket lost rows');
  fdb.close();
});

/* THE HONEST SIGNAL. `truncated` is the only thing that can stop a client
   presenting a cut list as complete, so it has to be RIGHT at the boundary in
   both directions: a flag that is always true is as useless as one that is
   always false.
   PROVE-RED: in src/index.js change the accepted bucket's bind from
     q("f.status = 'accepted'").bind(me, me, FRIEND_PAGE + 1)
   to
     q("f.status = 'accepted'").bind(me, me, FRIEND_PAGE)
   (one line) -> "a full page reported itself as complete": the route can no
   longer see the row past the page, so truncation becomes invisible again. */
test('truncated is set when the bound bites and clear when it does not', () => {
  const full = seedCrew({ accepted: FRIEND_PAGE });
  const p1 = friendsPayload(full, 'me');
  assert.equal(p1.friends.length, FRIEND_PAGE, 'an exactly-full page did not come back whole');
  assert.equal(p1.truncated.friends, false, 'an exactly-full page claimed to be truncated');
  full.close();

  const over = seedCrew({ accepted: FRIEND_PAGE + 1 });
  const p2 = friendsPayload(over, 'me');
  assert.equal(p2.friends.length, FRIEND_PAGE, 'the page is not being cut to FRIEND_PAGE');
  assert.equal(p2.truncated.friends, true, 'a full page reported itself as complete');
  /* the +1 row must never leak into the payload: it exists to be counted */
  assert.equal(new Set(p2.friends.map(f => f.playerId)).size, FRIEND_PAGE, 'the probe row leaked into the payload');
  /* and truncation of one bucket says nothing about the others */
  assert.equal(p2.truncated.incoming, false, 'a truncated friends list marked incoming truncated too');
  assert.equal(p2.truncated.outgoing, false, 'a truncated friends list marked outgoing truncated too');
  over.close();
});

/* THE UNCHANGED CASE. A small crew is the shape every existing client already
   renders, and a refactor that fixes the cap by re-bucketing the rows wrongly
   would break it silently.
   PROVE-RED: in src/index.js change the incoming bucket's predicate from
     f.status <> 'accepted' AND f.requested_by <> ?
   to
     f.status <> 'accepted' AND f.requested_by = ?
   (one line) -> incoming and outgoing swap and both assertions go red. */
test('a small crew still buckets exactly as before', () => {
  const fdb = seedCrew({ accepted: 3, outgoing: 2, requestTs: 9000 });
  const p = friendsPayload(fdb, 'me');
  assert.equal(p.friends.length, 3, 'accepted friendships did not land in friends');
  assert.equal(p.outgoing.length, 2, 'requests I sent did not land in outgoing');
  assert.deepEqual(p.incoming.map(f => f.playerId), ['stranger'], 'a request sent TO me did not land in incoming');
  assert.deepEqual(p.truncated, { friends: false, incoming: false, outgoing: false },
    'a four-row crew reported itself truncated');
  /* newest first within a bucket, unchanged */
  assert.deepEqual(p.friends.map(f => f.since), [1002, 1001, 1000], 'the ORDER BY changed');
  fdb.close();
});

/* The payload's shape is a CONTRACT with js/social.js listFriends(), which
   spreads whatever comes back and hands it to five call sites. `truncated` was
   added additively for exactly that reason; the day somebody renames or removes
   a bucket instead, this is the thing that says so. */
test('GET /friends still answers the three buckets every client destructures', () => {
  const p = friendsPayload(seedCrew({ accepted: 1 }), 'me');
  assert.deepEqual(Object.keys(p).sort(), ['friends', 'incoming', 'outgoing', 'truncated']);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
