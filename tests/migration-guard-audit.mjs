// PURE proof uses SQLite and the actual Worker handler. CONTROL is the exact
// missing week-freeze pair. Real local D1 proof lives in server/test/.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { auditOutputPath } from './lib/audit-output.mjs';
import worker from '../server/src/index.js';
import { deriveWrites, generatedSource } from '../server/scripts/write-contract.mjs';
import { checkGenerated, currentContract, assertColumns, serverRoot } from '../server/scripts/schema-guard.mjs';
import { beforeWeekFreeze, weekFreeze, sentinelSQL } from '../server/test/migration-fixture.mjs';
import { missingDependency } from './lib/audit-dependencies.mjs';
// v531: this guard parses source with acorn. The project reserves exit 97 for a
// missing prerequisite so an absent package can never look like a real finding.
try { await import('acorn'); } catch { missingDependency('acorn', 'npm i -D acorn'); }

const contract = checkGenerated();
assert.ok(contract.players.includes('last_week_key'));
assert.ok(contract.backups.includes('daily_blob'), 'UPSERT-only columns must be covered');
console.log('PASS source-derived contract is fresh, including INSERT, UPDATE and UPSERT columns');

// Future columns need no hand-maintained list, including concatenated literals,
// quoted identifiers, object-held statements and interpolated RHS expressions.
const future = deriveWrites(`
  const a = 'INSERT INTO widgets (id, fresh) ' + 'VALUES (?,?) ON CONFLICT(id) DO UPDATE SET newer=?';
  const b = {sql: \`UPDATE "widgets" SET fresh=json_set(fresh, '$.a', ?), newest=\${value} WHERE id=?\`};
  // UPDATE widgets SET comment_only = 1
`);
assert.deepEqual(future.widgets, ['fresh', 'id', 'newer', 'newest']);
assert.notEqual(generatedSource({ ...contract, widgets: future.widgets }), generatedSource(contract));
for (const source of [
  'db.prepare(`UPDATE ${table} SET fresh=?`)',
  'db.prepare(`UPDATE widgets SET ${columns} WHERE id=?`)',
  'db.prepare("INSERT INTO widgets VALUES (?)")',
]) assert.throws(() => deriveWrites(source), /unsupported write SQL/);
assert.throws(() => assertColumns(contract, []), /Invalid D1/);
console.log('PASS future-column and unsupported-SQL controls');

const db = new DatabaseSync(':memory:');
db.exec(beforeWeekFreeze());
db.exec(sentinelSQL);
const snapshot = () => JSON.stringify(db.prepare('SELECT * FROM players').all());
const schemaRows = () => Object.keys(contract).map(table => ({ success: true, results: db.prepare(`PRAGMA table_info('${table}')`).all() }));
let probes = 0;
const DB = { prepare(sql) {
  // Every actual health operation must be an unconditional zero-row UPDATE.
  assert.match(sql, /^UPDATE [a-z_]+ SET .+ WHERE 0$/);
  probes++;
  const statement = db.prepare(sql);
  return { async run() {
    const r = statement.run();
    return { success: true, meta: { changes: Number(r.changes) } };
  } };
} };
const health = path => worker.fetch(new Request(`https://local.invalid${path}`), { DB });
const before = snapshot();
assert.throws(() => assertColumns(contract, schemaRows()), /players.last_week_key.*players.last_week_steps/);
console.log('CONTROL RED drift: missing players.last_week_key, players.last_week_steps');
for (const path of ['/health', '/health/deep']) {
  const r = await health(path);
  assert.equal(r.status, 503);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const body = await r.json();
  assert.match(body.error, /missing column: last_week_key/);
  console.log(`CONTROL RED ${path}: 503 ${body.error}`);
}
assert.equal(snapshot(), before);
db.exec(weekFreeze);
console.log(`GREEN drift: ${assertColumns(contract, schemaRows())}`);
const migrated = snapshot();
probes = 0;
for (let i = 0; i < 3; i++) {
  for (const path of ['/health', '/health/deep']) {
    const r = await health(path);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).ok, true);
  }
}
assert.equal(probes, Object.keys(contract).length * 6, 'no stale success cache may hide drift');
assert.equal(snapshot(), migrated, 'repeated probes must preserve the populated player row');
assert.equal(db.prepare('SELECT total_changes() AS n').get().n, 1, 'only the sentinel INSERT may change rows');
console.log('GREEN /health and /health/deep: 200, six calls, zero rows changed');
db.exec('ALTER TABLE players DROP COLUMN last_week_steps');
assert.equal((await health('/health')).status, 503, 'schema loss after green must turn red immediately');
const unavailable = await worker.fetch(new Request('https://local.invalid/health'), {
  DB: { prepare() { throw new Error('private internal diagnostic'); } },
});
assert.equal(unavailable.status, 503);
assert.ok(!(await unavailable.text()).includes('private internal'));
db.close();

// Execute the real release script with ALL external commands replaced by
// local stubs. No Wrangler, git transport, curl or deployment can run here.
const temp = mkdtempSync(auditOutputPath(join(tmpdir(), 'migration-deploy-proof-')));
try {
  const log = join(temp, 'calls');
  const stub = `#!/bin/sh
name=\${0##*/}
echo "$name $*" >> "$GUARD_CALLS"
if [ "$name" = node ] && [ "$2" = --remote ]; then exit "$GUARD_RESULT"; fi
if [ "$name" = node ] && [ "$1" = -e ]; then
  cat > /dev/null
  echo 'ADMIN_TOKEN ADD_TOKEN_SECRET RL_SECRET'
fi
if [ "$name" = npx ] && [ "$2" = secret ]; then
  echo '[{"name":"ADMIN_TOKEN"},{"name":"ADD_TOKEN_SECRET"},{"name":"RL_SECRET"}]'
fi
if [ "$name" = curl ]; then
  case "$*" in *'/steps/'*) echo 401;; *) echo 200;; esac
fi
if [ "$name" = git ]; then echo local-head; fi
exit 0
`;
  for (const name of ['node', 'npx', 'git', 'curl', 'sleep']) {
    writeFileSync(auditOutputPath(join(temp, name)), stub);
    chmodSync(auditOutputPath(join(temp, name)), 0o755);
  }
  for (const code of [42, 0]) {
    writeFileSync(auditOutputPath(log), '');
    const r = spawnSync('/bin/bash', [join(serverRoot, 'deploy.sh')], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PATH: `${temp}:${process.env.PATH}`, GUARD_CALLS: log, GUARD_RESULT: String(code) },
    });
    assert.equal(r.status, code, r.stdout + r.stderr);
    const calls = readFileSync(log, 'utf8');
    assert.match(calls, /node scripts\/schema-guard.mjs --remote/);
    if (code) assert.ok(!calls.includes('npx wrangler deploy'));
    else assert.ok(calls.indexOf('node scripts/schema-guard.mjs --remote') < calls.indexOf('npx wrangler deploy'));
  }
} finally { rmSync(auditOutputPath(temp), { recursive: true, force: true }); }
assert.deepEqual(currentContract(), contract);
console.log('PASS deploy CONTROL: failed preflight prevents deployment; green preflight permits the stub');
console.log('PASS migration guard (SQLite proof; local D1 is a separate required proof)');
