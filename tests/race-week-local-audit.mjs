// PURE: production calendar helpers and signed in-process Worker over memory SQLite.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
export function clientCalendar(zone, main = false) {
  const oldTZ = process.env.TZ;
  process.env.TZ = zone;
  try {
    const source = main ? execFileSync('git', ['show', 'main:js/app.js'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, cwd: new URL('..', import.meta.url) }) : read('../js/app.js');
    const extract = name => source.slice(source.indexOf(`function ${name}(`), source.indexOf('\n}', source.indexOf(`function ${name}(`)) + 2);
    const NativeDate = Date;
    class FixedDate extends NativeDate {
      constructor(...args) { super(...(args.length ? args : ['2026-11-06T12:00:00Z'])); }
      static now() { return NativeDate.parse('2026-11-06T12:00:00Z'); }
    }
    const ctx = vm.createContext({ Date: FixedDate });
    vm.runInContext(`const RACE_EPOCH = '2026-08-07', RACE_DAYS = 7;
      const dateKey = (d = new Date()) => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
      ${extract('raceWeekKey')}\n${extract('raceWeekDates')}`, ctx);
    for (const start of ['2026-10-23', '2026-10-30', '2026-11-06']) {
      const days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start + 'T00:00:00'); d.setDate(d.getDate() + i);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      });
      const actual = vm.runInContext(`raceWeekDates('${start}')`, ctx);
      assert.deepEqual(Array.from(actual), days, `${zone}: seven distinct calendar days from ${start}`);
      for (const day of days) {
        const key = vm.runInContext(`raceWeekKey('${day}')`, ctx);
        assert.equal(key, start, `${zone}: ${day} belongs to local Friday ${start}`);
        assert.equal(new Date(key + 'T00:00:00').getDay(), 5);
      }
    }
    assert.equal(vm.runInContext('raceWeekKey()', ctx), '2026-11-06', 'fixed clock default');
    console.log(`PASS DST ${zone}: seven distinct days, local Friday keys, fixed clock`);
  } finally { if (oldTZ === undefined) delete process.env.TZ; else process.env.TZ = oldTZ; }
}
if (process.argv.includes('--client')) {
  clientCalendar(process.argv.includes('--positive') ? 'Europe/Berlin' : 'America/Vancouver', process.argv.includes('--main'));
} else {
const { DatabaseSync } = await import('node:sqlite');
const { default: worker } = await import('../server/src/index.js');
const sql = new DatabaseSync(':memory:');
sql.exec(read('../server/schema.sql'));
// Adapt the D1 methods this handler calls, without substituting any SQL or
// fabricating query results. batch is transactional, including rollback.
const DB = {
  prepare(query) {
    const statement = sql.prepare(query);
    let args = [];
    return {
      bind(...values) { args = values; return this; },
      async first() { return statement.get(...args) ?? null; },
      async all() { return { results: statement.all(...args), success: true }; },
      async run() {
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

let now = Date.parse('2026-11-10T12:00:00Z');
Date.now = () => now;
const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pub = JSON.stringify(await crypto.subtle.exportKey('jwk', keys.publicKey));
async function request(id, method, path, object) {
  const body = object ? JSON.stringify(object) : '';
  const ts = String(now);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey,
    new TextEncoder().encode(`${method}\n${path}\n${ts}\n${body}`));
  const response = await worker.fetch(new Request('https://local.invalid' + path, {
    method, headers: { 'content-type': 'application/json', 'x-bh-player': id, 'x-bh-ts': ts,
      'x-bh-sig': Buffer.from(sig).toString('base64') }, ...(body ? { body } : {}),
  }), { DB });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}
for (const delta of [-2, -1, 0, 1, 2]) {
  sql.exec('DELETE FROM grants; DELETE FROM players; DELETE FROM rate_limits;');
  now = Date.parse('2026-11-10T12:00:00Z');
  const id = 'local-' + delta;
  const key = new Date(Date.parse('2026-11-06T00:00:00Z') + delta * 86400000).toISOString().slice(0,10);
  sql.prepare('INSERT INTO players (id,pubkey,handle,friend_code,created_at,last_seen) VALUES (?,?,?,?,?,?)')
    .run(id, pub, id, id, now - 60 * 86400000, now);
  const snapshot = { weekKey: key, weekSteps: 1234, utcOffsetMinutes: delta < 0 ? -480 : 60, raceV: 2, level: 1 };
  await request(id, 'PUT', '/profile', { snapshot });
  const player = sql.prepare('SELECT * FROM players WHERE id = ?').get(id);
  if (Math.abs(delta) === 2) {
    assert.equal(player.week_key, null, 'two-day-off key refused');
    assert.ok(!JSON.parse(player.profile).weekKey);
    console.log(`PASS REFUSED ${key}`);
    continue;
  }
  assert.equal(player.week_key, key);
  assert.equal(player.week_steps, 1234);
  assert.equal(JSON.parse(player.profile).utcOffsetMinutes, snapshot.utcOffsetMinutes);
  // Advancing the profile freezes exactly the old key before lazy settlement.
  now += 7 * 86400000;
  const next = new Date(Date.parse(key + 'T00:00:00Z') + 7 * 86400000).toISOString().slice(0,10);
  await request(id, 'PUT', '/profile', { snapshot: { ...snapshot, weekKey: next, weekSteps: 50 } });
  await request(id, 'GET', '/steps/week?week=' + next);
  await request(id, 'GET', '/steps/week?week=' + next);
  const grants = sql.prepare("SELECT * FROM grants WHERE player_id = ? AND key = ?").all(id, 'stepweek-' + key);
  assert.equal(grants.length, 1, 'settles once under original key');
  const payload = JSON.parse(grants[0].payload);
  assert.equal(payload.steps, 1234);
  assert.equal(payload.coins, 5000);
  console.log(`PASS ${delta === 0 ? 'CONTROL UTC' : 'ADJACENT'} ${key}: accepted and settled once under supplied key`);
}
sql.close();
console.log('Race week local audit: 5 passed, 0 failed');
}
