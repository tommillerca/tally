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
];

const planOf = (sql, params) =>
  db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...params).map(r => r.detail).join(' | ');

for (const c of CASES) {
  test(c.name, () => {
    // BOUND first: an empty sample set is a failure, not a pass.
    const rows = db.prepare(c.sql).all(...c.params);
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
