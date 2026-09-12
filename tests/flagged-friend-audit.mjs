// PURE: full in-process Worker, real signed requests and in-memory SQLite.
// --main reads main's Worker source without changing either checkout.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
const root = new URL('../', import.meta.url);
const main = process.argv.includes('--main');
const source = main ? execFileSync('git', ['show', 'main:server/src/index.js'], { cwd: root, encoding: 'utf8' })
  : readFileSync(new URL('server/src/index.js', root), 'utf8');
const worker = (await import('data:text/javascript;base64,' + Buffer.from(source.replace(
  "'./schema-health.js'", JSON.stringify(new URL('server/src/schema-health.js', root).href))).toString('base64'))).default;
const sql = new DatabaseSync(':memory:');
sql.exec(readFileSync(new URL('server/schema.sql', root), 'utf8'));
const DB = {
  prepare(query) {
    const stmt = sql.prepare(query); let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return stmt.get(...args) ?? null; },
      async all() { return { success: true, results: stmt.all(...args) }; },
      async run() { return { success: true, meta: { changes: Number(stmt.run(...args).changes) } }; },
    };
  },
  async batch(statements) {
    sql.exec('BEGIN');
    try {
      const results = [];
      for (const stmt of statements) results.push(await stmt.all());
      sql.exec('COMMIT'); return results;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  },
};
const keys = new Map();
for (const id of ['a', 'b', 'c', 'd']) {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  keys.set(id, key.privateKey);
  sql.prepare('INSERT INTO players (id,pubkey,handle,friend_code,created_at,last_seen,is_test,test_run) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, JSON.stringify(await crypto.subtle.exportKey('jwk', key.publicKey)), id, `CODE-${id.toUpperCase()}`, Date.now(), Date.now(), id === 'c' ? null : 0, 'local-audit');
}
globalThis.fetch = () => { throw new Error('Network prohibited'); };
async function call(id, path, body) {
  const method = body === undefined ? 'GET' : 'POST';
  const text = body === undefined ? '' : JSON.stringify(body);
  const ts = String(Date.now());
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.get(id),
    new TextEncoder().encode(`${method}\n${path}\n${ts}\n${text}`));
  const response = await worker.fetch(new Request(`https://flagged.invalid${path}`, {
    method, headers: { 'x-bh-player': id, 'x-bh-ts': ts, 'x-bh-sig': Buffer.from(sig).toString('base64'), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: text }),
  }), { DB });
  return { status: response.status, body: await response.json() };
}
async function ok(id, path, body) {
  const result = await call(id, path, body); assert.equal(result.status, 200, JSON.stringify(result)); return result.body;
}
let passed = 0, failed = 0;
async function row(name, fn) {
  try { await fn(); console.log(`PASS ${name}`); passed++; }
  catch (error) { console.error(`FAIL ${name}: ${error.message}`); failed++; }
}
try {
  await ok('a', '/friends/request', { code: 'CODE-B' });
  await ok('b', '/friends/accept', { id: 'a' });
  await ok('c', '/friends/request', { code: 'CODE-B' });
  await ok('b', '/friends/request', { code: 'CODE-D' });
  await row('CONTROL lists before retroactive flag', async () => {
    assert.deepEqual((await ok('a', '/friends')).friends.map(x => x.playerId), ['b']);
    const b = await ok('b', '/friends');
    assert.deepEqual(b.incoming.map(x => x.playerId), ['c']);
    assert.deepEqual(b.outgoing.map(x => x.playerId), ['d']);
  });
  sql.prepare('UPDATE players SET is_test = 1 WHERE id = ?').run('b');
  await row('FRIENDS all buckets suppress retroactively flagged pairs', async () => {
    for (const id of keys.keys()) {
      const result = await ok(id, '/friends');
      for (const bucket of ['friends', 'incoming', 'outgoing']) assert.deepEqual(result[bucket], [], `${id} ${bucket}`);
    }
  });
  const grants = () => Number(sql.prepare('SELECT COUNT(*) n FROM grants').get().n);
  for (const [from, to] of [['a', 'b'], ['b', 'a']]) {
    for (const [path, extra] of [['/gift', { mode: 'free' }], ['/gift', { mode: 'spend', coins: 10 }], ['/cheer', { cheer: 0 }]]) {
      await row(`REFUSE ${path} ${extra.mode || ''} ${from} to ${to}`, async () => {
        const before = grants();
        assert.equal((await call(from, path, { to, ...extra })).status, 403);
        assert.equal(grants(), before, 'no delivery');
      });
    }
  }
  for (const [from, other] of [['b', 'c'], ['d', 'b']]) {
    await row(`REFUSE accept ${from} from ${other}`, async () => {
      const before = grants();
      assert.equal((await call(from, '/friends/accept', { id: other })).status, 404);
      const [a, b] = [from, other].sort();
      assert.equal(sql.prepare('SELECT status FROM friendships WHERE a=? AND b=?').get(a, b).status, 'pending');
      assert.equal(grants(), before);
      const reciprocal = await call(from, '/friends/request', { code: `CODE-${other.toUpperCase()}` });
      if (other === 'b') assert.equal(reciprocal.status, 404);
      else { assert.equal(reciprocal.status, 200); assert.equal(reciprocal.body.ignored, true); }
      assert.equal(sql.prepare('SELECT status FROM friendships WHERE a=? AND b=?').get(a, b).status, 'pending');
      assert.equal(grants(), before);
    });
  }
  await row('CONTROL NULL and provenance list, accept and send both directions', async () => {
    await ok('c', '/friends/request', { code: 'CODE-D' });
    assert.ok((await ok('d', '/friends')).incoming.some(x => x.playerId === 'c'));
    assert.ok((await ok('c', '/friends')).outgoing.some(x => x.playerId === 'd'));
    await ok('d', '/friends/accept', { id: 'c' });
    for (const [from, to] of [['c', 'd'], ['d', 'c']]) {
      assert.ok((await ok(from, '/friends')).friends.some(x => x.playerId === to));
      for (const [path, extra] of [['/gift', { mode: 'free' }], ['/gift', { mode: 'spend', coins: 10 }], ['/cheer', { cheer: 0 }]]) {
        const before = grants(); await ok(from, path, { to, ...extra }); assert.equal(grants(), before + (path === '/cheer' ? 2 : 1));
      }
    }
  });
} finally { sql.close(); }
console.log(`flagged-friend: ${passed} passed, ${failed} failed${main ? ' (main)' : ''}`);
process.exitCode = failed ? 1 : 0;
