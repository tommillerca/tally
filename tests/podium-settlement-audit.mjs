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
const week = '2026-09-11', prev = '2026-09-04', key = `stepweek-${prev}`;
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
  return { sql, state, async request() {
    const path = `/steps/week?week=${week}`, ts = String(Date.now());
    const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey,
      new TextEncoder().encode(`GET\n${path}\n${ts}\n`));
    return worker.fetch(new Request(`https://podium.invalid${path}`, { headers: {
      'x-bh-player': 'p1', 'x-bh-ts': ts, 'x-bh-sig': Buffer.from(sig).toString('base64'),
    } }), { DB });
  } };
}
function complete(f, count) {
  const rows = f.sql.prepare('SELECT * FROM grants ORDER BY id').all();
  assert.equal(rows.length, count);
  const coins = [5000, 2500, 1500, 600, 400], dust = [200, 100, 0, 0, 0];
  rows.forEach((r, i) => {
    assert.equal(r.player_id, `p${i + 1}`);
    const payload = JSON.parse(r.payload), steps = (count - i) * 1000;
    if (i < 5) {
      assert.equal(r.key, key); assert.equal(r.type, 'social');
      assert.deepEqual(payload, { coins: coins[i], crate: i < 3 ? 'golden' : 'daily',
        ...(dust[i] ? { dust: dust[i] } : {}), place: i + 1, steps,
        note: `${['1st','2nd','3rd','4th','5th'][i]} in the step race with ${steps.toLocaleString()} steps!` });
    } else {
      assert.equal(r.key, `raceplace-${prev}`); assert.equal(r.type, 'crew');
      assert.deepEqual(payload, { note: `You finished ${i + 1}th of ${count} in the step race with ${steps.toLocaleString()} steps.` });
    }
  });
}
let passed = 0, failed = 0;
async function test(name, count, fn) {
  const f = fixture(count);
  try { await fn(f); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); }
  finally { f.sql.close(); }
}
try {
  for (const [count, failAt] of [[3, 2], [7, 2], [7, 7]]) {
    await test(`ALL-OR-NOTHING racers=${count} fail insert=${failAt}`, count, async f => {
      f.state.failAt = failAt;
      assert.equal((await f.request()).status, 500);
      assert.equal(f.state.hit, true, 'fault must be reached');
      const grants = f.sql.prepare('SELECT COUNT(*) n FROM grants').get().n;
      const settled = !!f.sql.prepare('SELECT 1 FROM grants WHERE key = ? LIMIT 1').get(key);
      assert.deepEqual({ grants, settled }, { grants: 0, settled: false });
      f.state.failAt = 0;
      assert.equal((await f.request()).status, 200); complete(f, count);
      assert.equal(f.state.batches, 2, 'one failed batch and one complete retry');
    });
  }
  await test('ONCE', 7, async f => {
    assert.equal((await f.request()).status, 200); complete(f, 7);
    const before = f.sql.prepare('SELECT * FROM grants ORDER BY id').all();
    const inserts = f.state.inserts, batches = f.state.batches;
    assert.equal((await f.request()).status, 200);
    assert.deepEqual(f.sql.prepare('SELECT * FROM grants ORDER BY id').all(), before);
    assert.equal(f.state.inserts, inserts); assert.equal(f.state.batches, batches);
  });
  await test('CONTROL', 3, async f => {
    assert.equal((await f.request()).status, 200); complete(f, 3);
  });
} finally { Date.now = originalNow; }
console.log(`${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
