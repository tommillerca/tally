// Frozen sync-authpath diagnostic. Real client signing and full Worker handler,
// mem-idb client storage, real schema/SQL in SQLite. No sockets or remote calls.
// This is not workerd, production D1, or a reproduction of the reported outage.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import './mem-idb.mjs';
import { kvGet, kvSet } from '../js/db.js';
import { syncProfile, autoSync } from '../js/social.js';
import { GEAR_ITEMS } from '../js/gear.js';
import workerModule from '../server/src/index.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
// Keep the race week and rate-limit window stable, including at wall-clock
// hour boundaries. Native timeout scheduling is unaffected by Date.now.
let now = Date.parse('2026-09-09T12:00:00Z');
Date.now = () => now;
const mutation = process.argv.includes('--break-canonical');
let worker = workerModule;
if (mutation) {
  const source = read('../server/src/index.js');
  const needle = "${url.pathname}${url.search}";
  assert.equal(source.split(needle).length, 2, 'canonical mutation must hit exactly once');
  worker = (await import('data:text/javascript;base64,' + Buffer.from(
    source.replace(needle, '${url.pathname}${url.search}/wrong-canonical-path')
  ).toString('base64'))).default;
}

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
// Deliberately no secrets. None are required for this route. The Worker emits
// its normal missing-secret diagnostic once; these values never leave memory.
const env = { DB };
const API = 'https://sync-authpath.invalid';
const id = 'sync-authpath-player';
const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const identity = {
  pubJwk: await crypto.subtle.exportKey('jwk', keys.publicKey),
  privJwk: await crypto.subtle.exportKey('jwk', keys.privateKey),
};
await kvSet('apiBase', API);
await kvSet('identity', identity);
await kvSet('social', { playerId: id });
await kvSet('cloudOff', true);
const oldSeen = Date.now() - 3 * 86400000;
sql.prepare('INSERT INTO players (id,pubkey,handle,friend_code,created_at,last_seen) VALUES (?,?,?,?,?,?)')
  .run(id, JSON.stringify(identity.pubJwk), 'Local Player', 'BONE-TEST-AUTH', oldSeen - 60 * 86400000, oldSeen);
const player = () => sql.prepare('SELECT * FROM players WHERE id = ?').get(id);

let transform = r => r, lastRequest, lastResponse;
const requests = [];
globalThis.fetch = async (url, options) => {
  assert.equal(new URL(url).origin, API, 'unexpected network destination');
  assert.ok(['/profile', '/grants'].includes(new URL(url).pathname), 'unexpected route');
  const original = new Request(url, options);
  lastRequest = original.clone();
  const request = await transform(original);
  const response = await worker.fetch(request, env);
  lastResponse = { status: response.status, body: await response.clone().json() };
  requests.push({ path: new URL(request.url).pathname, ...lastResponse });
  return response;
};

// Execute the production snapshot builder with explicit fixture dependencies.
// It still owns the yard/gear caps and the exact outbound shape. The fixture
// sizes are synthetic, not a recovered production player's private save.
const app = read('../js/app.js');
const start = app.indexOf('async function socialSnapshot()');
const end = app.indexOf('// Push the public profile snapshot', start);
assert.ok(start >= 0 && end > start, 'snapshot source seam');
const talents = Array.from({ length: 64 }, (_, i) => `talent-${i}`);
const gear = GEAR_ITEMS.slice(0, 100).map(g => g.id);
assert.equal(gear.length, 100, 'mature fixture requires 100 real gear ids');
const pet = { id: 'C6', level: 10, shiny: true, lineage: 2, morph: 'base' };
const context = vm.createContext({
  gameInitSettled: async () => {},
  buildFighter: async () => ({ stats: { power: 80, marrow: 70, wind: 60, reflex: 50, hype: 40 }, talents, gearLo: {}, petMeta: pet }),
  equipped: async () => ({ B: 'B0-1', SK: 'SK0-1', C: 'C6' }),
  totalXp: async () => 1000, levelFor: () => ({ level: 20, name: 'Calorie Cartographer' }),
  ownedGearIds: async () => new Set(gear), earnedBadgeIds: async () => new Set(['a', 'b']),
  weekStepsNow: async () => ({ weekKey: weekStart(), steps: 1000 }),
  petInstances: async () => Array.from({ length: 200 }, () => ({ sp: 'C6', shiny: true, morph: 'base' })),
  petWear: async () => ({ CE: 'CE1' }), championTitle: async () => 'Champion',
  platformTag: () => 'ios', RACE_RULES: 2, isMorph: value => value === 'base',
});
vm.runInContext(app.slice(start, end), context);
function weekStart() {
  const epoch = Date.parse('2026-08-07T00:00:00Z');
  const period = 7 * 86400000;
  return new Date(epoch + Math.floor((Date.now() - epoch) / period) * period).toISOString().slice(0, 10);
}
const mature = JSON.parse(JSON.stringify(await context.socialSnapshot()));
let passed = 0, failed = 0;
async function check(name, fn) {
  now += 1000;
  transform = r => r;
  sql.exec("DELETE FROM rate_limits WHERE name = 'rl_profile'");
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.message}`); }
}
async function accepts(snapshot) {
  assert.equal(await syncProfile(snapshot, 'v68'), true, JSON.stringify(lastResponse));
  assert.equal(lastResponse.status, 200);
  assert.equal(lastResponse.body.ok, true);
  assert.ok(player().last_seen > oldSeen, 'last_seen must advance in SQL');
  assert.equal(player().app_v, 'v68');
  return JSON.parse(player().profile);
}
async function refuses(snapshot, status, error) {
  const before = player();
  assert.equal(await syncProfile(snapshot, 'v68'), false);
  assert.deepEqual(lastResponse, { status, body: { error } });
  assert.deepEqual(player(), before, 'refusal must leave the profile row untouched');
}

await check('CONTROL minimal signed profile stores and advances last_seen', async () => {
  assert.equal((await accepts({ level: 1 })).level, 1);
});
await check('MATURE 64 talents, 100 gear ids, 200 pets accepted', async () => {
  sql.prepare('UPDATE players SET max_level = ?, max_level_at = ? WHERE id = ?').run(20, oldSeen, id);
  assert.equal(mature.talents.length, 64);
  assert.equal(mature.gear.length, 100);
  assert.equal(mature.yard.n, 200);
  assert.equal(mature.yard.pets.length, 24);
  const stored = await accepts(mature);
  assert.deepEqual(stored, mature);
  assert.equal(lastResponse.body.bounded, undefined);
  const body = await lastRequest.text();
  console.log(`MEASURE mature body: ${body.length} UTF-16 units, ${Buffer.byteLength(body)} UTF-8 bytes`);
});
await check('GROWTH all catalogue gear survives at client cap', async () => {
  context.ownedGearIds = async () => new Set(GEAR_ITEMS.map(g => g.id));
  const snapshot = JSON.parse(JSON.stringify(await context.socialSnapshot()));
  assert.equal(snapshot.gear.length, Math.min(400, GEAR_ITEMS.length));
  assert.deepEqual((await accepts(snapshot)).gear, snapshot.gear);
  console.log(`MEASURE catalogue body: ${snapshot.gear.length} gear ids, ${(await lastRequest.text()).length} UTF-16 units`);
});
await check('SHAPE clamps values without rejecting the signed request', async () => {
  const snapshot = { ...mature, unknown: 'dropped', talents: Array(513).fill('x'), gear: Array(401).fill('g'),
    title: 'a'.repeat(100), stats: { power: { a: { b: { c: 1 } } } } };
  const stored = await accepts(snapshot);
  assert.equal(stored.unknown, undefined);
  assert.equal(stored.title.length, 64);
  assert.equal(stored.talents.length, 512);
  assert.equal(stored.gear.length, 400);
  assert.equal(stored.stats.power.a.b, null);
  assert.ok(lastResponse.body.bounded.includes('shape'));
  assert.ok(lastResponse.body.bounded.includes('gear'));
  assert.deepEqual((await kvGet('profileBounded')).fields, lastResponse.body.bounded);
});
await check('BODY accepts exactly 24576 units, rejects 24577 before auth', async () => {
  const snapshot = { padding: '' };
  snapshot.padding = 'x'.repeat(24576 - JSON.stringify({ snapshot, appV: 'v68' }).length);
  await accepts(snapshot);
  snapshot.padding += 'x';
  await refuses(snapshot, 413, 'profile too large');
});
await check('CONTROL Unicode is signed as UTF-8 on both sides', async () => {
  const snapshot = { level: 1, title: 'Crâne 🦴' };
  assert.equal((await accepts(snapshot)).title, snapshot.title);
});
for (const [name, mutate, reason] of [
  ['body tamper', async r => new Request(r, { body: (await r.text()) + ' ' }), 'bad signature'],
  ['query tamper', r => new Request(r.url + '?changed=1', r), 'bad signature'],
  ['signature tamper', r => { r.headers.set('x-bh-sig', 'invalid'); return r; }, 'bad signature'],
  ['unknown player', r => { r.headers.set('x-bh-player', 'unknown'); return r; }, 'unknown player'],
  ['stale timestamp', r => { r.headers.set('x-bh-ts', String(Date.now() - 300001)); return r; }, 'stale timestamp'],
  ['nonfinite timestamp', r => { r.headers.set('x-bh-ts', 'NaN'); return r; }, 'bad timestamp'],
]) {
  await check(`AUTH CONTROL ${name}`, async () => {
    transform = mutate;
    await refuses(mature, 401, reason);
  });
}
await check('AUTH CONTROL wrong local private key', async () => {
  const other = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  await kvSet('identity', { ...identity, privJwk: await crypto.subtle.exportKey('jwk', other.privateKey) });
  try { await refuses(mature, 401, 'bad signature'); }
  finally { await kvSet('identity', identity); }
});
await check('REPLAY rejects captured signature, accepts newly signed retry', async () => {
  await accepts(mature);
  const captured = lastRequest.clone(), before = player();
  const response = await worker.fetch(captured, env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'replayed request');
  assert.deepEqual(player(), before);
  await accepts(mature);
});
await check('SHAPE CONTROL array and null snapshot rejected', async () => {
  await refuses([], 400, 'missing snapshot');
  await refuses(null, 400, 'missing snapshot');
});
await check('RATE CONTROL accepts 120 fresh signatures, rejects request 121', async () => {
  for (let i = 0; i < 120; i++) await accepts({ level: 1 });
  const before = player();
  assert.equal(await syncProfile(mature, 'v68'), false);
  assert.equal(lastResponse.status, 429);
  assert.ok(lastResponse.body.retryAfterMs > 0);
  assert.deepEqual(player(), before);
});
await check('AUTO real profile then signed grants completes and stamps sync', async () => {
  await kvSet('socialSyncAt', 0);
  const before = requests.length;
  const result = await autoSync(async () => mature, 'v68');
  assert.equal(result.applied, 0);
  assert.deepEqual(requests.slice(before).map(r => [r.path, r.status]), [['/profile', 200], ['/grants', 200]]);
  assert.ok(await kvGet('socialSyncAt') > 0);
});
if (!mutation) {
  await check('RED CONTROL canonical mismatch makes this audit exit 1', async () => {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--break-canonical'], { encoding: 'utf8', timeout: 60000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /FAIL MATURE.*bad signature/);
    console.log('MEASURE canonical mutation: child exit 1, MATURE rejected with 401 bad signature');
  });
}
sql.close();
console.log(`sync-authpath: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
