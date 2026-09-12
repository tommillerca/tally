// PURE: full Worker handler, real schema and transactional SQLite D1 double.
// No sockets, production D1, secrets or migrations. --main reads git main only.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const source = process.argv.includes('--main')
  ? execFileSync('git', ['show', 'main:server/src/index.js'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' })
  : read('../server/src/index.js');
const worker = (await import('data:text/javascript;base64,' + Buffer.from(source.replace(
  "'./schema-health.js'", JSON.stringify(new URL('../server/src/schema-health.js', import.meta.url).href)
)).toString('base64'))).default;
const originalNow = Date.now;
Date.now = () => Date.parse('2026-09-12T12:00:00Z');
const prev = '2026-09-04';
let now = Date.parse('2026-09-12T23:59:59Z');
Date.now = () => now;
const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pubkey = JSON.stringify(await crypto.subtle.exportKey('jwk', keys.publicKey));
function fixture(count) {
  const sql = new DatabaseSync(':memory:');
  sql.exec(read('../server/schema.sql'));
  for (let i = 1; i <= count; i++) sql.prepare(`INSERT INTO players
    (id,pubkey,handle,friend_code,created_at,last_seen,profile,week_key,week_steps)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(`p${i}`, i === 1 ? pubkey : `fixture-${i}`, `Racer ${i}`, `fixture-${i}`,
      Date.now(), Date.now(), JSON.stringify({ raceV: 2 }), prev, (count + 1 - i) * 1000);
  const state = { failAt: 0, inserts: 0, batches: 0, hit: false };
  const DB = {
    prepare(query) {
      const stmt = sql.prepare(query); let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return stmt.get(...args) ?? null; },
        async all() { return { results: stmt.all(...args), success: true }; },
        async run() {
          if (/INSERT OR IGNORE INTO grants/.test(query)) {
            state.inserts++;
            if (state.inserts === state.failAt) { state.hit = true; const error = new Error('injected settlement insert failure'); error.stack = error.message; throw error; }
          }
          const result = stmt.run(...args);
          return { success: true, meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch(statements) {
      state.batches++; sql.exec('BEGIN');
      try {
        const results = [];
        for (const stmt of statements) results.push(await stmt.run());
        sql.exec('COMMIT'); return results;
      } catch (e) { sql.exec('ROLLBACK'); throw e; }
    },
  };
  sql.prepare("INSERT INTO friendships (a,b,status,requested_by,ts) VALUES ('p1','p2','accepted','p1',?)").run(now);
  return { sql, state, async request(path, body) {
    const ts = String(Date.now()), text = JSON.stringify(body);
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey,
      new TextEncoder().encode(`POST\n${path}\n${ts}\n${text}`));
    const response = await worker.fetch(new Request(`https://gift.invalid${path}`, { method: 'POST', body: text, headers: {
      'x-bh-player': 'p1', 'x-bh-ts': ts, 'x-bh-sig': Buffer.from(sig).toString('base64'),
    } }), { DB });
    return { status: response.status, body: await response.json() };
  } };
}
let failed = 0;
async function test(name, fn) {
  now = Date.parse('2026-09-12T23:59:59Z');
  const f = fixture(2);
  try { await fn(f); console.log(`PASS ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
  finally { f.sql.close(); }
}
await test('MIDNIGHT', async f => {
  const body = { to: 'p2', cheer: 3, ck: 'midnight' };
  const original = await f.request('/cheer', body); assert.equal(original.status, 200);
  now += 2000;
  assert.deepEqual(await f.request('/cheer', body), { ...original, body: { ...original.body, duplicate: true } }); // the API contract (test/api.test.mjs): a retry gets the original acknowledgement AND is named as the duplicate
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM grants WHERE type='cheer'").get().n, 1);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM grants WHERE type='cheer' AND ts >= ?").get(Date.parse('2026-09-13T00:00:00Z')).n, 0);
  for (let i = 0; i < 10; i++) assert.equal((await f.request('/cheer', { ...body, ck: `new${i}` })).status, 200);
  assert.equal((await f.request('/cheer', { ...body, ck: 'capped' })).status, 429);
});
await test('GIFT ORIGINAL ACK AND REMOVED FRIEND', async f => {
  const body = { to: 'p2', mode: 'spend', coins: 50, ck: 'gift' };
  const original = await f.request('/gift', body); assert.equal(original.status, 200);
  now += 2000; f.sql.exec('DELETE FROM friendships');
  assert.deepEqual(await f.request('/gift', { ...body, coins: 100 }), { ...original, body: { ...original.body, duplicate: true } }); // the API contract (test/api.test.mjs): a retry gets the original acknowledgement AND is named as the duplicate
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM grants WHERE type='gift'").get().n, 1);
});
await test('CONTROL', async f => {
  const body = { to: 'p2', cheer: 3, ck: 'before' };
  assert.equal((await f.request('/cheer', body)).status, 200); now += 2000;
  assert.equal((await f.request('/cheer', { ...body, ck: 'after' })).status, 200);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM grants WHERE type='cheer'").get().n, 2);
});
await test('GIFT CAP AND SEVEN DAYS', async f => {
  const body = { to: 'p2', mode: 'spend', coins: 50, ck: 'first' };
  const original = await f.request('/gift', body);
  for (let i = 0; i < 4; i++) assert.equal((await f.request('/gift', { ...body, ck: `gift${i}` })).status, 200);
  assert.equal((await f.request('/gift', { ...body, ck: 'cap' })).status, 429);
  now += 7 * 86400000;
  assert.deepEqual(await f.request('/gift', body), { ...original, body: { ...original.body, duplicate: true } }); // the API contract (test/api.test.mjs): a retry gets the original acknowledgement AND is named as the duplicate
});
await test('FREE GIFT RETRY AND CAP', async f => {
  const body = { to: 'p2', mode: 'free', ck: 'free' };
  const original = await f.request('/gift', body); assert.equal(original.status, 200);
  assert.equal((await f.request('/gift', { ...body, ck: 'other' })).status, 409);
  now += 2000;
  assert.deepEqual(await f.request('/gift', body), { ...original, body: { ...original.body, duplicate: true } }); // the API contract (test/api.test.mjs): a retry gets the original acknowledgement AND is named as the duplicate
  assert.equal((await f.request('/gift', { ...body, ck: 'tomorrow' })).status, 200);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM grants WHERE type='gift'").get().n, 2);
});
Date.now = originalNow;
process.exitCode = failed ? 1 : 0;
