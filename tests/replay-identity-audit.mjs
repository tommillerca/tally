// PURE: full Worker handler, real signatures and schema, in-memory SQLite only.
// --main reads the local main ref without checking out or editing another tree.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import workerModule from '../server/src/index.js';
const root = new URL('../', import.meta.url);
const main = process.argv.includes('--main');
const read = path => main
  ? execFileSync('git', ['show', `main:${path}`], { cwd: root, encoding: 'utf8' })
  : readFileSync(new URL(path, root), 'utf8');
let worker = workerModule;
if (main) {
  const dependency = 'data:text/javascript;base64,' + Buffer.from(read('server/src/schema-health.js').replace("'./write-contract.generated.js'", JSON.stringify('data:text/javascript;base64,' + Buffer.from(read('server/src/write-contract.generated.js')).toString('base64')))).toString('base64');
  worker = (await import('data:text/javascript;base64,' + Buffer.from(
    read('server/src/index.js').replace("'./schema-health.js'", JSON.stringify(dependency))
  ).toString('base64'))).default;
  console.log('BASELINE main ' + execFileSync('git', ['rev-parse', 'main'], { cwd: root, encoding: 'utf8' }).trim());
}
globalThis.fetch = () => { throw new Error('Network forbidden in PURE audit'); };
let now = Date.parse('2026-09-12T12:00:00Z');
Date.now = () => now;
const sql = new DatabaseSync(':memory:');
sql.exec(read('server/schema.sql'));
let effects = 0;
const DB = {
  prepare(query) {
    const statement = sql.prepare(query);
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return statement.get(...args) ?? null; },
      async all() { return { results: statement.all(...args), success: true }; },
      async run() {
        if (/^(UPDATE friendships|INSERT OR IGNORE INTO grants)/.test(query)) effects++;
        const result = statement.run(...args);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
  },
  async batch(statements) {
    sql.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      sql.exec('COMMIT');
      return results;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const playerKeys = { a: keys };
for (const id of ['a', 'b', 'c']) {
  playerKeys[id] ||= await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubkey = JSON.stringify(await crypto.subtle.exportKey('jwk', playerKeys[id].publicKey));
  sql.prepare('INSERT INTO players (id,pubkey,handle,friend_code,created_at,last_seen) VALUES (?,?,?,?,?,?)')
    .run(id, pubkey, id, `TEST-${id}`, now, now);
}
for (const id of ['b', 'c']) sql.prepare('INSERT INTO friendships VALUES (?,?,?,?,?)').run('a', id, 'pending', id, now);
sql.prepare('INSERT INTO friendships VALUES (?,?,?,?,?)').run('b', 'c', 'pending', 'b', now);
async function signed({ player = 'a', path = '/friends/accept?proof=1', ts = String(now), body = '{"id":"b"}' } = {}) {
  const sig = Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, playerKeys[player].privateKey,
    new TextEncoder().encode(`POST\n${path}\n${ts}\n${body}`))).toString('base64');
  return new Request('https://replay.invalid' + path, { method: 'POST', body,
    headers: { 'x-bh-player': player, 'x-bh-ts': ts, 'x-bh-sig': sig } });
}
const send = request => worker.fetch(request, { DB });
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
async function accepted(request) {
  const before = effects;
  const response = await send(request);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.ok(effects > before, 'route effect reached');
}
async function refused(request, error = 'replayed request') {
  const before = effects;
  const rows = sql.prepare('SELECT * FROM friendships ORDER BY a,b').all();
  const response = await send(request);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error });
  assert.equal(effects, before, 'no route statements reached');
  assert.deepEqual(sql.prepare('SELECT * FROM friendships ORDER BY a,b').all(), rows);
}
const original = await signed();
await check('CONTROL valid signed write', () => accepted(original.clone()));
now += 1000;
await check('REPLAY identical signature', () => refused(original.clone()));
for (const [name, alias] of [
  ['no padding', sig => sig.replace(/=+$/, '')],
  ['inserted whitespace', sig => sig.slice(0, 12) + ' \t ' + sig.slice(12)],
]) await check(`ALIAS ${name} refused before route effect`, async () => {
  const request = original.clone();
  const sig = request.headers.get('x-bh-sig');
  const spelling = alias(sig);
  assert.notEqual(spelling, sig);
  assert.equal(atob(spelling), atob(sig), 'byte-equivalent signature');
  request.headers.set('x-bh-sig', spelling);
  await refused(request);
});
await check('REPLAY independently re-signed identical canonical request', async () => {
  await refused(await signed({ ts: original.headers.get('x-bh-ts') }));
});
await check('CONTROL independently signed fresh timestamp', async () => accepted(await signed()));
await check('CONTROL distinct query', async () => accepted(await signed({ path: '/friends/accept?proof=2' })));
await check('CONTROL distinct body', async () => accepted(await signed({ body: '{"id":"c"}' })));
await check('CONTROL distinct player with same canonical request', async () => accepted(await signed({ player: 'c' })));
now += 300001;
await check('SKEW stale request refused', () => refused(original.clone(), 'stale timestamp'));
sql.close();
console.log(`replay-identity: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
