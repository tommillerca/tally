// API tests against a locally running worker (npm run dev, port 8788).
// Node 18+ has WebCrypto + fetch built in, so this mirrors the browser exactly.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import * as fsMod from 'node:fs';
// node:sqlite prints one experimental warning on import. schema-plan.test.mjs
// already lives with it; it is the only way to grade a claim about the DATABASE
// from here rather than about an answer some route composed.
import { DatabaseSync } from 'node:sqlite';
import { flagFor } from '../test-flag.mjs';

const BASE = process.env.API || 'http://127.0.0.1:8788';
/* Registrations are flagged when this run is NOT local, so a suite pointed at
   the live API mints accounts nobody can see. See server/test-flag.mjs. */
const IS_TEST = flagFor(BASE);
// wrangler must run from server/, not server/test/, to find wrangler.toml
const SERVER_DIR = path.resolve(import.meta.dirname, '..');
let passed = 0, failed = 0, unproven = 0;

/* UNPROVEN IS A THIRD ANSWER, AND IT IS NOT A SOFTER "FAIL".
 *
 * One test here asserts behaviour that only exists on real D1: a value too
 * large for the database throws SQLITE_TOOBIG, and the route must turn that
 * into a 413. Local D1 is plain SQLite with no such limit, so it stores the
 * blob and answers 200. The assertion is CORRECT and the environment simply
 * cannot exhibit the condition it is about.
 *
 * Before this, that read as FAIL, which meant deploy.sh -- which runs this
 * suite against a local dev server under `set -e` -- could never reach step 3.
 * It sat red permanently and no deploy of this worker happened for weeks
 * because of it. A gate that cannot go green is not a gate; it is a wall.
 *
 * So a test may declare itself UNPROVABLE HERE, which prints, counts and is
 * summarised separately, and does not fail the run. Two rules keep that from
 * becoming a way to launder failures:
 *   1. Only the ABSENCE OF THE PRECONDITION may raise it, proven positively in
 *      the test body (see the 3 MB case below: it verifies the blob really was
 *      stored intact, which is what shows the size limit is not there at all).
 *      A wrong answer from a database that DOES have the limit is still a FAIL.
 *   2. It is printed on its own line every run, so it can be seen rotting.
 */
const UNPROVEN = Symbol('unprovable in this environment');
const unprovable = why => { const e = new Error(why); e[UNPROVEN] = true; throw e; };

async function test(name, fn) {
  try { await fn(); passed++; console.log('  PASS', name); }
  catch (e) {
    if (e && e[UNPROVEN]) { unproven++; console.log('  UNPROVEN', name, '\n   ', e.message); return; }
    failed++; console.log('  FAIL', name, '\n   ', e.message);
  }
}

const b64 = buf => Buffer.from(buf).toString('base64');

/* REGISTRATION IS IP RATE LIMITED (10/hour, rl_register_ip in src/index.js).
   A suite registers a dozen-plus throwaway players in a few seconds, which is
   exactly the shape the limiter exists to stop, so each one arrives from its own
   synthetic edge IP -- the same thing a dozen real phones would look like.
   cf-connecting-ip is set by Cloudflare at the edge in production and a
   client-supplied value is replaced there, so this is only settable locally,
   which is what makes the IP-keyed limiter testable at all.
   Passing a FIXED ip is how a test drives the limiter deliberately. */
const rndIp = () => `198.18.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
function regFetch(pubkey, ip = rndIp()) {
  return fetch(BASE + '/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
    body: JSON.stringify({ test: IS_TEST, pubkey }),
  });
}
async function makeKeys() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return {
    kp,
    pubJwk: await crypto.subtle.exportKey('jwk', kp.publicKey),
  };
}
async function signedFetch(kp, playerId, method, path, body = '', tsOverride = null) {
  const ts = tsOverride ?? Date.now();
  const msg = `${method}\n${path}\n${ts}\n${body}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(msg));
  return fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', 'x-bh-player': playerId, 'x-bh-ts': String(ts), 'x-bh-sig': b64(sig) },
    body: method === 'GET' ? undefined : body,
  });
}

/* SIGN ONCE, SEND AS MANY TIMES AS YOU LIKE. signedFetch above re-signs on every
   call, which is what an honest client does and is therefore exactly what CANNOT
   test a replay. This returns a thunk over one frozen set of headers and one
   frozen body, so calling it twice puts the SAME bytes on the wire twice, which
   is what a captured request is. */
async function signedReq(kp, playerId, method, path, body = '') {
  const ts = Date.now();
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey,
    new TextEncoder().encode(`${method}\n${path}\n${ts}\n${body}`));
  const init = {
    method,
    headers: { 'content-type': 'application/json', 'x-bh-player': playerId, 'x-bh-ts': String(ts), 'x-bh-sig': b64(sig) },
    body: method === 'GET' ? undefined : body,
  };
  return () => fetch(BASE + path, init);
}

const { kp, pubJwk } = await makeKeys();
let player = null;

await test('health', async () => {
  const r = await (await fetch(BASE + '/health')).json();
  assert.ok(r.ok);
});

await test('register issues player + friend code + handle', async () => {
  const r = await (await regFetch(pubJwk)).json();
  assert.ok(r.playerId && /^BONE-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(r.friendCode) && r.handle.includes(' '), JSON.stringify(r));
  player = r;
});

await test('re-register with same key returns the SAME account (backup restore)', async () => {
  const r = await (await regFetch(pubJwk)).json();
  assert.equal(r.playerId, player.playerId);
  assert.ok(r.existing);
});

await test('bad pubkey rejected', async () => {
  const r = await regFetch({ kty: 'RSA' });
  assert.equal(r.status, 400);
});

await test('signed profile PUT accepted + stored', async () => {
  const body = JSON.stringify({ snapshot: { level: 8, stats: { power: 20 }, outfit: { SK: 'SK0-1' }, gear: [] }, appV: 'v66' });
  const r = await signedFetch(kp, player.playerId, 'PUT', '/profile', body);
  assert.equal(r.status, 200);
  const p = await (await fetch(BASE + `/dev/player?id=${player.playerId}`)).json();
  assert.equal(JSON.parse(p.profile).level, 8);
  assert.equal(p.app_v, 'v66');
});

await test('tampered body rejected (signature covers body)', async () => {
  const good = JSON.stringify({ snapshot: { level: 8 } });
  const ts = Date.now();
  const msg = `PUT\n/profile\n${ts}\n${good}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, new TextEncoder().encode(msg));
  const r = await fetch(BASE + '/profile', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-bh-player': player.playerId, 'x-bh-ts': String(ts), 'x-bh-sig': b64(sig) },
    body: JSON.stringify({ snapshot: { level: 99 } }), // tampered
  });
  assert.equal(r.status, 401);
});

await test('wrong key rejected', async () => {
  const other = await makeKeys();
  const body = JSON.stringify({ snapshot: { level: 1 } });
  const r = await signedFetch(other.kp, player.playerId, 'PUT', '/profile', body);
  assert.equal(r.status, 401);
});

await test('stale timestamp rejected (replay protection)', async () => {
  const body = JSON.stringify({ snapshot: { level: 8 } });
  const r = await signedFetch(kp, player.playerId, 'PUT', '/profile', body, Date.now() - 10 * 60 * 1000);
  assert.equal(r.status, 401);
});

await test('grants: welcome grant delivered, cursor advances, no redelivery', async () => {
  const r1 = await (await signedFetch(kp, player.playerId, 'GET', '/grants?since=0')).json();
  assert.ok(r1.grants.some(g => g.key === 'social-welcome' && g.payload.coins === 50), JSON.stringify(r1));
  const r2 = await (await signedFetch(kp, player.playerId, 'GET', `/grants?since=${r1.cursor}`)).json();
  assert.equal(r2.grants.length, 0);
});

await test('dev grant flows through', async () => {
  await fetch(BASE + '/dev/grant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ playerId: player.playerId, key: 'test-coins-1', payload: { coins: 25, note: 'test' } }) });
  const r = await (await signedFetch(kp, player.playerId, 'GET', '/grants?since=0')).json();
  assert.ok(r.grants.some(g => g.key === 'test-coins-1'));
});

await test('/me returns identity after restore', async () => {
  const r = await (await signedFetch(kp, player.playerId, 'GET', '/me')).json();
  assert.equal(r.friendCode, player.friendCode);
});

await test('analytics: /events ingests an anonymous batch', async () => {
  const device = 'devtest-' + Math.random().toString(36).slice(2);
  const r = await (await fetch(BASE + '/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ device, appV: 'v80', events: [{ name: 'app_open' }, { name: 'pit_win', props: { level: 8 } }, { name: 'food_log' }] }) })).json();
  assert.ok(r.ok && r.accepted === 3, JSON.stringify(r));
});

await test('analytics: /stats is admin-gated + aggregates', async () => {
  assert.equal((await fetch(BASE + '/stats')).status, 401);
  const ok = await fetch(BASE + '/stats?token=devtoken');
  assert.equal(ok.status, 200);
  const s = await ok.json();
  assert.ok(s.totalDevices >= 1 && s.totalEvents >= 3, JSON.stringify(s));
  assert.ok(s.byName.some(e => e.name === 'pit_win'), 'event names aggregated');
  assert.ok(s.dau >= 1, 'DAU counts today');
  // Both windows travel with the numbers, so the dashboard can never label a
  // figure with a window it was not computed over.
  assert.equal(typeof s.windowDays, 'number', '/stats no longer reports the retention window');
  assert.equal(typeof s.statsWindowDays, 'number', '/stats no longer reports its own reporting window');
  assert.ok(s.statsWindowDays <= s.windowDays, '/stats reads further back than the table keeps');
});

await test('/stats keeps the rate limiter out of byName and the tester board', async () => {
  /* rateLimitRecovery USED TO store its per-IP counters as events, keyed by an
     IP HASH in the device column. They are not product events and they are not
     devices:
     on a quiet run rl_ridcheck was the most common "event name" on the dashboard
     and an IP hash led the tester leaderboard with no label and no geo.
     Drive the REAL limiter rather than planting a synthetic row, so this tests
     the rows production actually writes. */
  const probe = await fetch(BASE + `/recovery/available/statsrl${Math.random().toString(36).slice(2, 7)}`);
  assert.ok(probe.status === 200 || probe.status === 429, `availability probe answered ${probe.status}`);
  await probe.text();
  // BOUND: the rows have to exist, or the assertions below pass on nothing.
  const planted = await (await fetch(`${BASE}/dev/ratelimit-count?name=rl_ridcheck`)).json();
  assert.ok(planted.n > 0, 'the limiter wrote no row, so this test proves nothing');

  const s = await (await fetch(BASE + '/stats?token=devtoken')).json();
  // DIRECTION: absent. Not "fewer than before": a single one is a wrong row on
  // a dashboard somebody makes decisions from.
  for (const rl of ['rl_recovery', 'rl_ridcheck']) {
    assert.ok(!s.byName.some(e => e.name === rl), `${rl} is being counted as a product event`);
  }
  assert.ok(!s.testers.some(t => t.label === null && t.country === null && t.first === null),
    'a device with no devices row at all is on the tester leaderboard, which is what an IP hash looks like');
});

await test('backup: PUT stores ciphertext, GET returns it verbatim', async () => {
  const blob = 'AAAA' + Buffer.from('pretend-ciphertext-' + Math.random()).toString('base64');
  const put = await signedFetch(kp, player.playerId, 'PUT', '/backup', JSON.stringify({ blob, appV: 'v84' }));
  assert.equal(put.status, 200);
  const got = await (await signedFetch(kp, player.playerId, 'GET', '/backup')).json();
  assert.equal(got.blob, blob, 'blob round-trips byte-for-byte');
  assert.equal(got.appV, 'v84');
});

await test('backup: PUT overwrites the previous row (one per player)', async () => {
  const blob2 = 'BBBB' + Buffer.from('second-' + Math.random()).toString('base64');
  await signedFetch(kp, player.playerId, 'PUT', '/backup', JSON.stringify({ blob: blob2 }));
  const got = await (await signedFetch(kp, player.playerId, 'GET', '/backup')).json();
  assert.equal(got.blob, blob2);
});

await test('backup: GET 404 when a player has none', async () => {
  const fresh = await makeKeys();
  const reg = await (await regFetch(fresh.pubJwk)).json();
  const r = await signedFetch(fresh.kp, reg.playerId, 'GET', '/backup');
  assert.equal(r.status, 404);
});

await test('backup: PUT requires a valid signature (wrong key rejected)', async () => {
  const other = await makeKeys();
  const r = await signedFetch(other.kp, player.playerId, 'PUT', '/backup', JSON.stringify({ blob: 'x' }));
  assert.equal(r.status, 401);
});

/* THE 4 MB CLIFF, from both sides. Measured 2026-08-17, a real one-year save
   encrypts to 2.23 MB at p50 and 5.20 MB at p95, so 12.7% of players are on the
   far side of this constant after a year of daily use. Crossing it is not a
   degraded backup, it is NO backup: the 413 below reaches js/social.js
   pushBackup, which returns false, which autoSync discards, and nothing tells
   the player. See the note on MAX_BACKUP_BYTES in src/index.js.
   Both directions are asserted, because "the cap rejects everything" and "the
   cap rejects nothing" are both failures and only one of them looks like one. */
await test('backup: a 2 MB blob STORES, and comes back byte-for-byte', async () => {
  const fresh = await makeKeys();
  const reg = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ test: IS_TEST, pubkey: fresh.pubJwk }) })).json();
  // 2,000,000 bytes: comfortably over the p50 one-year save (2.23 MB is p50 at
  // 365 days, so this is roughly the median player at eleven months), and
  // comfortably under D1's own value limit measured at 2,199,942 bytes.
  const blob = 'A'.repeat(2_000_000);
  const put = await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob, appV: 'v385' }));
  assert.equal(put.status, 200, `a two-megabyte backup was refused (${put.status})`);
  const got = await (await signedFetch(fresh.kp, reg.playerId, 'GET', '/backup')).json();
  assert.equal(got.blob.length, blob.length, 'the stored blob changed length in the database');
});

await test('backup: a blob D1 cannot hold answers 413, not an unhandled 500', async () => {
  const fresh = await makeKeys();
  const reg = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ test: IS_TEST, pubkey: fresh.pubJwk }) })).json();
  /* 3 MB sits in the gap nobody knew was there: under MAX_BACKUP_BYTES, so the
     route's own check passes it, and over D1's value limit, so the INSERT throws
     SQLITE_TOOBIG. Before 2026-08-17 that fell through to the generic handler
     and every save between about 2.2 MB and 4 MB produced a 500. DIRECTION: a
     deliberate 413. A 500 here means the catch has been removed and the logs are
     back to reporting a full save as a broken worker. */
  const blob = 'A'.repeat(3 * 1024 * 1024);
  const put = await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob, appV: 'v385' }));
  /* LOCAL D1 HAS NO VALUE LIMIT. It is plain SQLite, so 3 MB stores happily and
     this returns 200. That is not the route misbehaving, it is the premise of
     the test being absent, and it is why this case sat FAIL forever under
     deploy.sh and blocked every deploy. The 200 is only accepted as UNPROVEN
     once the blob is READ BACK AT FULL LENGTH, which is positive proof that the
     database really did hold three megabytes rather than the route having
     quietly stored something short. Any other status, 500 above all, is still a
     hard FAIL: 500 is exactly the regression this test was written for. */
  if (put.status === 200) {
    const back = await signedFetch(fresh.kp, reg.playerId, 'GET', '/backup');
    const stored = back.status === 200 ? (await back.json()).blob : '';
    assert.equal(stored.length, blob.length,
      `a 3 MB PUT answered 200 but only ${stored.length} of ${blob.length} bytes came back: ` +
      'the database DOES have a limit and the route is losing data instead of refusing it');
    unprovable(
      'this D1 stored 3 MB intact, so it has no value limit and SQLITE_TOOBIG cannot be provoked here. ' +
      'Local D1 is plain SQLite; only the deployed database enforces the ~2.2 MB value cap this test is about. ' +
      'The assertion is unchanged and still runs in full against real D1.');
  }
  assert.equal(put.status, 413, `expected 413, got ${put.status} (500 means SQLITE_TOOBIG is unhandled again)`);
  assert.equal((await put.json()).code, 'too-large');
  const got = await signedFetch(fresh.kp, reg.playerId, 'GET', '/backup');
  assert.equal(got.status, 404, 'a backup D1 refused left a row behind');
});

await test('backup: a blob over the cap is refused with 413, and nothing is stored', async () => {
  const fresh = await makeKeys();
  const reg = await (await fetch(BASE + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ test: IS_TEST, pubkey: fresh.pubJwk }) })).json();
  const blob = 'A'.repeat(4 * 1024 * 1024 + 1024);
  const put = await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob }));
  assert.equal(put.status, 413, 'the cap is not being enforced at all');
  // DIRECTION: nothing was stored. A partial write here would be worse than a
  // refusal, because the restore would decrypt to garbage rather than 404.
  const got = await signedFetch(fresh.kp, reg.playerId, 'GET', '/backup');
  assert.equal(got.status, 404, 'a refused backup left a row behind');
  /* The tripwire that used to live here fired on 2026-08-30, exactly as
     designed: the launch-telemetry work made autoSync consume pushBackup's
     result (a backup that stops landing now emits a funnel event, with
     cloud-off opt-outs deliberately never counted as failures). The failure is
     surfaced, so per this test's own instruction the assertion is deleted and
     the name loses its "silently". The server half above still holds: refuse
     with 413 and store nothing. */
});

/* ---- the daily backup slot ----
   Tom: "i don't want a corrupted sync to destroy an account." The rule being
   proved here is the whole feature, and it is a rule about TIME, not about a
   number of revisions: js/social.js pushes every ten minutes, so "keep the last
   3" is thirty minutes of protection and a corruption sleeps through it.
   Two of the four cases below are the ones that matter, and both are KEEP tests:
   a push inside 24h must leave the archive alone, and the push that does replace
   it must archive the OUTGOING save, so the first corrupt push cannot be the one
   that poisons the slot. Every case proves its fixture landed before it asserts
   anything about what happened to it. */
const dailyGet = async (keys, id) => {
  const r = await signedFetch(keys.kp, id, 'GET', '/backup?slot=daily');
  return { status: r.status, blob: r.status === 200 ? (await r.json()).blob : null };
};
const warpBackup = async (id, backMs) => {
  const r = await fetch(BASE + '/dev/backup-warp', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: id, backMs }),
  });
  assert.equal(r.status, 200, `/dev/backup-warp needs DEV=1 (got ${r.status})`);
  const { row } = await r.json();
  assert.ok(row, 'warp found no backups row for this player');
  return row;
};
const DAY_MS = 24 * 60 * 60 * 1000;
const bl = tag => tag + '-' + Math.random().toString(36).slice(2) + '-' + 'x'.repeat(64);

await test('daily: one push leaves no archive (there is nothing older to keep)', async () => {
  const fresh = await makeKeys();
  const reg = await (await regFetch(fresh.pubJwk)).json();
  const put = await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: bl('one') }));
  assert.equal(put.status, 200, 'the fixture push failed, so nothing below is about the archive');
  assert.equal((await dailyGet(fresh, reg.playerId)).status, 404,
    'an archive appeared out of a single save, which means it is a copy of the live one');
});

await test('daily: the second push archives the save it REPLACED, not the one it carried', async () => {
  const fresh = await makeKeys();
  const reg = await (await regFetch(fresh.pubJwk)).json();
  const first = bl('first'), second = bl('second');
  await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: first }));
  await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: second }));
  const live = await (await signedFetch(fresh.kp, reg.playerId, 'GET', '/backup')).json();
  assert.equal(live.blob, second, 'the live save is not the newest push');
  /* DIRECTION, and it is the point of the whole design: `first`, never `second`.
     Archiving the incoming blob would mean the first corrupt sync lands in both
     slots at once and there is nothing to go back to. */
  assert.equal((await dailyGet(fresh, reg.playerId)).blob, first,
    'the archive holds the INCOMING save, so a corrupt push would poison both copies at once');
});

await test('daily: further pushes inside 24h do NOT touch the archive', async () => {
  const fresh = await makeKeys();
  const reg = await (await regFetch(fresh.pubJwk)).json();
  const first = bl('keep');
  await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: first }));
  await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: bl('p2') }));
  assert.equal((await dailyGet(fresh, reg.playerId)).blob, first, 'PRECONDITION: nothing was archived to defend');
  /* Six more pushes, which is an hour of a real client at BACKUP_THROTTLE_MS,
     and the shape of the failure this exists to survive: a corruption syncing
     over and over inside one day. Under "keep the last 3 revisions" the good
     save is gone by the third. */
  for (let i = 0; i < 6; i++) {
    await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: bl('corrupt' + i) }));
  }
  assert.equal((await dailyGet(fresh, reg.playerId)).blob, first,
    'six pushes in a row reached the archive, so a corruption that syncs repeatedly still destroys the account');
  // The archive is not simply frozen forever, either: it is holding a save the
  // 24h rule has not released yet, and the next test proves the release works.
  const row = await warpBackup(reg.playerId, 0);
  assert.ok(row.daily_at > 0 && row.daily_at <= row.updated_at,
    `daily_at (${row.daily_at}) is not a moment at or before the newest push (${row.updated_at})`);
});

/* THE PLAYER WHO OPENS THE APP ONCE A DAY, which is the case that caught the
   first version of this and is the reason daily_at is the promotion time rather
   than the archived save's own updated_at. Under that first version the save
   being archived was ALWAYS about 24h old for this player, so every push in the
   session promoted, the archive chased the live save ten minutes behind, and the
   feature was inert for exactly the light user it is meant to protect. RED on
   that version, green here, and it is the strongest statement of what the slot
   is for: what comes back is the END OF YESTERDAY, never anything from today. */
await test('daily: a once-a-day player gets YESTERDAY back, not this morning', async () => {
  const fresh = await makeKeys();
  const reg = await (await regFetch(fresh.pubJwk)).json();
  const day1a = bl('d1-open'), day1b = bl('d1-close');
  const day2a = bl('d2-open'), day2b = bl('d2-close'), day3a = bl('d3-open');
  // day 1: a session of two pushes, ten minutes apart in a real client
  await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: day1a }));
  await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: day1b }));
  assert.equal((await dailyGet(fresh, reg.playerId)).blob, day1a, 'PRECONDITION: day 1 archived nothing');
  // ...comes back a day later
  await warpBackup(reg.playerId, DAY_MS + 60000);
  await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: day2a }));
  await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: day2b }));
  assert.equal((await dailyGet(fresh, reg.playerId)).blob, day1b,
    'on day 2 the archive is not day 1\'s last save, so a corruption today has already eaten yesterday');
  // ...and again
  await warpBackup(reg.playerId, DAY_MS + 60000);
  await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: day3a }));
  assert.equal((await dailyGet(fresh, reg.playerId)).blob, day2b,
    'on day 3 the archive is not day 2\'s last save');
});

await test('daily: after 24h the NEXT push rolls the archive forward, one day at a time', async () => {
  const fresh = await makeKeys();
  const reg = await (await regFetch(fresh.pubJwk)).json();
  const first = bl('day1'), second = bl('day2'), third = bl('day3');
  await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: first }));
  await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: second }));
  assert.equal((await dailyGet(fresh, reg.playerId)).blob, first, 'PRECONDITION: the first archive never happened');
  // Age the whole row by a day and a minute, exactly as if the player came back
  // tomorrow. Nothing is copied by the warp: it only moves timestamps, so an
  // archive that changes below was changed by the server's own rule.
  await warpBackup(reg.playerId, DAY_MS + 60000);
  await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: third }));
  assert.equal((await dailyGet(fresh, reg.playerId)).blob, second,
    'the 24h boundary did not release the archive, so it would hold the same save forever');
  // ...and having just rolled, it is shut again for another day.
  await signedFetch(fresh.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: bl('again') }));
  assert.equal((await dailyGet(fresh, reg.playerId)).blob, second,
    'the archive rolled twice in one day, so the 24h rule is not being enforced after the first roll');
});

await test('daily: the archive is what a restore reads, and it is per player', async () => {
  const mine = await makeKeys();
  const reg = await (await regFetch(mine.pubJwk)).json();
  const keep = bl('mine');
  await signedFetch(mine.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: keep }));
  await signedFetch(mine.kp, reg.playerId, 'PUT', '/backup', JSON.stringify({ blob: bl('newer') }));
  assert.equal((await dailyGet(mine, reg.playerId)).blob, keep, 'PRECONDITION: no archive to read');
  // Somebody else's signature cannot read it. The blob is ciphertext either way,
  // but an archive that answers to the wrong key is still an account takeover.
  const other = await makeKeys();
  const r = await signedFetch(other.kp, reg.playerId, 'GET', '/backup?slot=daily');
  assert.equal(r.status, 401, 'another key read this player\'s archive');
  /* The client half of the restore path. The server cannot decrypt any of this,
     so getting the archive back is necessarily on-device, and this is the call
     that does it. If it is renamed or dropped, the slot becomes decoration. */
  const { readFileSync } = await import('node:fs');
  const social = readFileSync(new URL('../../js/social.js', import.meta.url), 'utf8');
  assert.ok(/export async function restoreDailyBackup\(\)\s*\{\s*return pullBackup\(\{ slot: 'daily', replace: true \}\)/.test(social),
    'js/social.js restoreDailyBackup() is gone or changed shape, so nothing can read the archive back');
});

// ---- curated display name ----
/* RUN-UNIQUE NUMBERS. Names became unique server-side on 2026-08-08, and the
   local D1 persists between runs, so a hardcoded name is claimed by the PREVIOUS
   run's player and every later run 409s. That is the feature working, not a
   regression, so the tests carry a per-run suffix instead of fixed strings. */
const RUNSUF = 100 + Math.floor(Math.random() * 800);
await test('name: set curated display name by indices, /me reflects it', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/name', JSON.stringify({ adj: 1, noun: 0, num: RUNSUF }));
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.name, `Grim Rex #${RUNSUF}`, JSON.stringify(d));
  const me = await (await signedFetch(kp, player.playerId, 'GET', '/me')).json();
  assert.equal(me.name, `Grim Rex #${RUNSUF}`);
});

await test('name: no number is allowed', async () => {
  const d = await (await signedFetch(kp, player.playerId, 'POST', '/name', JSON.stringify({ adj: 0, noun: 0 }))).json();
  assert.equal(d.name, 'Rattling Rex');
});

await test('name: out-of-range indices rejected (no free text ever)', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/name', JSON.stringify({ adj: 999, noun: 0 }));
  assert.equal(r.status, 400);
});

// ---- friends ----
let p2 = null, p2keys = null;
await test('friends: request by code is pending, reciprocation auto-accepts', async () => {
  p2keys = await makeKeys();
  p2 = await (await regFetch(p2keys.pubJwk)).json();
  const r1 = await (await signedFetch(kp, player.playerId, 'POST', '/friends/request', JSON.stringify({ code: p2.friendCode }))).json();
  assert.equal(r1.status, 'pending', JSON.stringify(r1));
  const aList = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  assert.ok(aList.outgoing.some(x => x.playerId === p2.playerId), 'A has outgoing');
  const bList = await (await signedFetch(p2keys.kp, p2.playerId, 'GET', '/friends')).json();
  assert.ok(bList.incoming.some(x => x.playerId === player.playerId), 'B has incoming');
  const r2 = await (await signedFetch(p2keys.kp, p2.playerId, 'POST', '/friends/request', JSON.stringify({ code: player.friendCode }))).json();
  assert.equal(r2.status, 'accepted', JSON.stringify(r2));
  const aNow = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  assert.ok(aNow.friends.some(x => x.playerId === p2.playerId), 'A now friends with B');
});

await test('friends: name + public profile surface in the list', async () => {
  await signedFetch(p2keys.kp, p2.playerId, 'POST', '/name', JSON.stringify({ adj: 2, noun: 2, num: RUNSUF })); // Dusty Knuckles #N
  await signedFetch(p2keys.kp, p2.playerId, 'PUT', '/profile', JSON.stringify({ snapshot: { level: 12, levelName: 'Bruiser', outfit: { SK: 'SK0-1' } }, appV: 'v100' }));
  const aList = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  const b = aList.friends.find(x => x.playerId === p2.playerId);
  assert.equal(b.name, `Dusty Knuckles #${RUNSUF}`);
  assert.equal(b.profile.level, 12);
  assert.equal(b.friendCode, p2.friendCode);
});

await test('gift: free daily gift delivers a grant, second same-day 409s', async () => {
  const r1 = await signedFetch(kp, player.playerId, 'POST', '/gift', JSON.stringify({ to: p2.playerId, mode: 'free' }));
  assert.equal(r1.status, 200);
  const j1 = await r1.json();
  assert.ok(j1.ok && j1.reward, 'returns a rolled reward');
  const grants = await (await signedFetch(p2keys.kp, p2.playerId, 'GET', '/grants?since=0')).json();
  const gift = (grants.grants || []).find(g => g.type === 'gift' && g.payload.mode === 'free');
  assert.ok(gift, 'recipient sees the gift grant');
  assert.ok(gift.payload.from && gift.payload.note.includes(gift.payload.from), 'gift carries sender name');
  const r2 = await signedFetch(kp, player.playerId, 'POST', '/gift', JSON.stringify({ to: p2.playerId, mode: 'free' }));
  assert.equal(r2.status, 409, 'one free gift per friend per day');
});

await test('gift: spend-coins gift delivers the exact coins', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/gift', JSON.stringify({ to: p2.playerId, mode: 'spend', coins: 120 }));
  assert.equal(r.status, 200);
  const grants = await (await signedFetch(p2keys.kp, p2.playerId, 'GET', '/grants?since=0')).json();
  const spend = (grants.grants || []).find(g => g.type === 'gift' && g.payload.mode === 'spend');
  assert.equal(spend.payload.coins, 120);
});

await test('gift: to a non-friend is 403', async () => {
  const stranger = await makeKeys();
  const s = await (await regFetch(stranger.pubJwk)).json();
  const r = await signedFetch(kp, player.playerId, 'POST', '/gift', JSON.stringify({ to: s.playerId, mode: 'free' }));
  assert.equal(r.status, 403);
});

await test('cheer: preset cheer delivers a reward-less grant; self + bad index rejected', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/cheer', JSON.stringify({ to: p2.playerId, cheer: 0 }));
  assert.equal(r.status, 200);
  const grants = await (await signedFetch(p2keys.kp, p2.playerId, 'GET', '/grants?since=0')).json();
  const cheer = (grants.grants || []).find(g => g.type === 'cheer');
  assert.ok(cheer && cheer.payload.cheer === 0 && !cheer.payload.coins, 'cheer carries index, no reward');
  const self = await signedFetch(kp, player.playerId, 'POST', '/cheer', JSON.stringify({ to: player.playerId, cheer: 0 }));
  assert.equal(self.status, 400);
  const bad = await signedFetch(kp, player.playerId, 'POST', '/cheer', JSON.stringify({ to: p2.playerId, cheer: 999 }));
  assert.equal(bad.status, 400);
});

/* A RETRY IS NOT A SECOND CHEER. The client's send has a 12s deadline, so an
   answer lost in flight re-arms the chips and the player taps again; without an
   idempotency key the server counted a second row and the friend got two. */
const cheerRows = async (to, keys) => {
  const g = await (await signedFetch(keys.kp, to, 'GET', '/grants?since=0')).json();
  return (g.grants || []).filter(x => x.type === 'cheer');
};
await test('cheer: the same ck twice delivers ONE cheer; a different ck delivers a second', async () => {
  const rk = await makeKeys();
  const r = await (await regFetch(rk.pubJwk)).json();
  await signedFetch(kp, player.playerId, 'POST', '/friends/request', JSON.stringify({ code: r.friendCode }));
  await signedFetch(rk.kp, r.playerId, 'POST', '/friends/request', JSON.stringify({ code: player.friendCode }));
  const ck = 'tap-' + RUNSUF;
  const send = c => signedFetch(kp, player.playerId, 'POST', '/cheer', JSON.stringify({ to: r.playerId, cheer: 1, ck: c }));
  const a = await send(ck);
  assert.equal(a.status, 200);
  const before = await cheerRows(r.playerId, rk);
  assert.equal(before.length, 1, 'the first send delivers exactly one');
  const b = await send(ck);
  assert.equal(b.status, 200, 'a retry is answered ok, not 429');
  assert.equal((await b.json()).duplicate, true, 'and is named as the duplicate it is');
  assert.equal((await cheerRows(r.playerId, rk)).length, 1, 'the same ck twice delivers ONE cheer');
  const c = await send(ck + '-2');
  assert.equal(c.status, 200);
  assert.equal((await cheerRows(r.playerId, rk)).length, 2, 'a different ck IS a second cheer');
});

/* A RETRY IS NOT A SECOND GIFT, and unlike a cheer this one moves coins. The
   client deducts locally BEFORE the send and refunds on anything that is not
   ok, so a delivered gift whose answer was lost refunds the sender while the
   friend keeps the coins: two of them mint coins out of nothing. */
const befriend = async (bk, b) => {
  await signedFetch(kp, player.playerId, 'POST', '/friends/request', JSON.stringify({ code: b.friendCode }));
  await signedFetch(bk.kp, b.playerId, 'POST', '/friends/request', JSON.stringify({ code: player.friendCode }));
};
const spendGiftRows = async (to, keys) => {
  const g = await (await signedFetch(keys.kp, to, 'GET', '/grants?since=0')).json();
  return (g.grants || []).filter(x => x.type === 'gift' && x.payload.mode === 'spend');
};
const sendGift = (to, ck, coins = 50) => signedFetch(kp, player.playerId, 'POST', '/gift',
  JSON.stringify(ck === null ? { to, mode: 'spend', coins } : { to, mode: 'spend', coins, ck }));

await test('gift: the same ck twice delivers ONE spend gift; a different ck delivers a second', async () => {
  const rk = await makeKeys();
  const r = await (await regFetch(rk.pubJwk)).json();
  await befriend(rk, r);
  const ck = 'gtap-' + RUNSUF;
  assert.equal((await sendGift(r.playerId, ck)).status, 200);
  assert.equal((await spendGiftRows(r.playerId, rk)).length, 1, 'the first send delivers exactly one');
  const b = await sendGift(r.playerId, ck);
  assert.equal(b.status, 200, 'a retry must be answered ok: the client refunds itself on anything else');
  const bj = await b.json();
  assert.equal(bj.duplicate, true, 'and is named as the duplicate it is');
  assert.equal(bj.reward.coins, 50, 'the retry still reports the reward, so the sheet can settle');
  assert.equal((await spendGiftRows(r.playerId, rk)).length, 1, 'the same ck twice delivers ONE gift');
  assert.equal((await sendGift(r.playerId, ck + '-2')).status, 200);
  assert.equal((await spendGiftRows(r.playerId, rk)).length, 2, 'a different ck IS a second gift');
});

await test('gift: the 5/friend/day cap still refuses at its bound, counting ck and no-ck alike', async () => {
  const rk = await makeKeys();
  const r = await (await regFetch(rk.pubJwk)).json();
  await befriend(rk, r);
  // Three keyed and two unkeyed, because the cap counts the whole key RANGE and
  // an older client sending no ck must not buy itself extra gifts.
  for (const c of ['cap1-' + RUNSUF, 'cap2-' + RUNSUF, 'cap3-' + RUNSUF, null, null]) {
    assert.equal((await sendGift(r.playerId, c)).status, 200, 'the first five are under the cap');
  }
  assert.equal((await spendGiftRows(r.playerId, rk)).length, 5, 'five delivered, and no more');
  const over = await sendGift(r.playerId, 'cap6-' + RUNSUF);
  assert.equal(over.status, 429, 'the sixth is refused by the cap, not deduped');
  assert.equal((await over.json()).code, 'limit');
  assert.equal((await spendGiftRows(r.playerId, rk)).length, 5, 'and nothing landed for it');
});

/* THE REPLAY, which is the sharpest form of all of this and the reason a client
   token alone is not the answer. verifySigned checked a signature and a
   five-minute skew window and nothing else, so a captured signed POST re-sent
   BYTE FOR BYTE verified again and landed again: one original plus two replays
   was measured as three cheers. The no-ck body below is deliberate. It is what
   an older client sends, so the grant key falls back to the counted shape and
   the client token cannot absorb anything: only the server-side nonce can. */
await test('replay: one signed POST sent three times lands ONE effect', async () => {
  const rk = await makeKeys();
  const r = await (await regFetch(rk.pubJwk)).json();
  await befriend(rk, r);
  const fire = await signedReq(kp, player.playerId, 'POST', '/cheer',
    JSON.stringify({ to: r.playerId, cheer: 2 }));
  assert.equal((await fire()).status, 200, 'PRECONDITION: the original must be accepted');
  assert.equal((await cheerRows(r.playerId, rk)).length, 1, 'PRECONDITION: it delivered one cheer');

  const again = await fire();
  assert.equal(again.status, 401, 'the same bytes a second time must be refused');
  assert.equal((await again.json()).error, 'replayed request', 'and told why, not "bad signature"');
  assert.equal((await fire()).status, 401, 'and a third time');
  assert.equal((await cheerRows(r.playerId, rk)).length, 1,
    'one original plus two replays is ONE cheer');

  /* THE CONTROL. A guard that refuses everything would pass every line above.
     The same player, same friend, same body, RE-SIGNED, is an ordinary second
     cheer and must land: that is what separates a replay guard from an outage. */
  const fresh = await signedFetch(kp, player.playerId, 'POST', '/cheer', JSON.stringify({ to: r.playerId, cheer: 2 }));
  assert.equal(fresh.status, 200, 'a re-signed send is not a replay');
  assert.equal((await cheerRows(r.playerId, rk)).length, 2, 'and it delivers a second cheer');

  // Reads are exempt on purpose: a replayed GET changes nothing, and nonce-ing
  // the polling routes would be the write amplification the guard exists to avoid.
  const read = await signedReq(rk.kp, r.playerId, 'GET', '/grants?since=0');
  assert.equal((await read()).status, 200);
  assert.equal((await read()).status, 200, 'a signed READ may be repeated');
});

await test('friends: accept endpoint seals a one-way request', async () => {
  const p3keys = await makeKeys();
  const p3 = await (await regFetch(p3keys.pubJwk)).json();
  await signedFetch(p3keys.kp, p3.playerId, 'POST', '/friends/request', JSON.stringify({ code: player.friendCode }));
  const acc = await signedFetch(kp, player.playerId, 'POST', '/friends/accept', JSON.stringify({ id: p3.playerId }));
  assert.equal(acc.status, 200);
  const aList = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  assert.ok(aList.friends.some(x => x.playerId === p3.playerId));
});

await test('friends: cannot friend your own code', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/friends/request', JSON.stringify({ code: player.friendCode }));
  assert.equal(r.status, 400);
});

await test('friends: unknown code 404', async () => {
  const r = await signedFetch(kp, player.playerId, 'POST', '/friends/request', JSON.stringify({ code: 'BONE-ZZZZ-ZZZZ' }));
  assert.equal(r.status, 404);
});

await test('friends: remove drops the edge for both sides', async () => {
  await signedFetch(kp, player.playerId, 'POST', '/friends/remove', JSON.stringify({ id: p2.playerId }));
  const aList = await (await signedFetch(kp, player.playerId, 'GET', '/friends')).json();
  assert.ok(!aList.friends.some(x => x.playerId === p2.playerId), 'A no longer friends with B');
  const bList = await (await signedFetch(p2keys.kp, p2.playerId, 'GET', '/friends')).json();
  assert.ok(!bList.friends.some(x => x.playerId === player.playerId), 'B no longer friends with A');
});

// Leaderboard: never-synced registrations must be invisible (they COALESCE to
// level-1 "bots"; 98 of 118 production rows were these), and a shiny pet must
// ride the payload so the board can render it shiny.
// PROVE-RED: drop the WHERE profile IS NOT NULL, or the pet field, from
// /leaderboard in src/index.js and the matching assert fails by name.
await test('leaderboard: hides never-synced players, carries pet.shiny', async () => {
  const synced = await makeKeys();
  const ghost = await makeKeys();
  const sp = await (await regFetch(synced.pubJwk)).json();
  const gp = await (await regFetch(ghost.pubJwk)).json();
  // level 999: the local dev DB accumulates a synced player per past run, and
  // the board is LIMIT 100, so a modest level can legitimately miss the page
  const body = JSON.stringify({ snapshot: { level: 999, outfit: { SK: 'SK0-1', C: 'C3' }, pet: { id: 'C3', level: 6, shiny: true }, gear: [] }, appV: 'test' });
  assert.equal((await signedFetch(synced.kp, sp.playerId, 'PUT', '/profile', body)).status, 200);
  const board = await (await signedFetch(synced.kp, sp.playerId, 'GET', '/leaderboard')).json();
  const me = board.players.find(x => x.playerId === sp.playerId);
  assert.ok(me, 'synced player is on the board');
  assert.ok(me.pet && me.pet.shiny === true && me.pet.id === 'C3', 'pet rides the leaderboard payload with shiny intact');
  assert.ok(!board.players.some(x => x.playerId === gp.playerId), 'never-synced registration is hidden');
});

/* THE BOARD RANKS ON THE CURRENT LEVEL, NOT ON THE RATCHET.
   2026-09-01 moved the rank key out of json_extract(profile,'$.level') and into
   a real column, because no index can serve an expression and the board was
   reading every player in the table to publish a hundred. players.max_level was
   already sitting there and looks like the same number, but it is MONOTONE by
   design: it is the server's memory of the highest level it has ever accepted,
   and the no-teleporting bound measures against it. Rank on that instead and
   every player who has ever been higher than they are now quietly moves up.
   A level can go down: sanitizeSnapshot clamps a claim from above and never
   from below, and a restore from an older backup is exactly that. So this walks
   one account down and asks the BOARD, which is the consumer that would be
   wrong, rather than asking the row.
   PROVE-RED: bind checked.maxLevel where PUT /profile binds checked.boardLevel,
   and this fails with the ratchet's number. */
await test('leaderboard: a level that goes DOWN goes down on the board too', async () => {
  const k = await makeKeys();
  const p = await (await regFetch(k.pubJwk)).json();
  const put = lvl => signedFetch(k.kp, p.playerId, 'PUT', '/profile',
    JSON.stringify({ snapshot: { level: lvl, outfit: { SK: 'SK0-1' }, gear: [] }, appV: 'test' }));
  /* Climb to this account's own ceiling first, so "one below the top" is a real
     rank on a dev DB that has accumulated a synced player per past run, rather
     than a modest level that legitimately misses a LIMIT 100 page. */
  assert.equal((await put(999999)).status, 200);
  const peak = JSON.parse((await (await fetch(BASE + `/dev/player?id=${p.playerId}`)).json()).profile).level;
  assert.ok(peak > 1, `PRECONDITION: the first sync landed a real level, got ${peak}`);
  assert.equal((await put(peak - 1)).status, 200);
  const board = await (await signedFetch(k.kp, p.playerId, 'GET', '/leaderboard')).json();
  const me = board.players.find(x => x.playerId === p.playerId);
  assert.ok(me, 'PRECONDITION: the player is on the board at all');
  assert.equal(me.level, peak - 1,
    `the board must show where the player is NOW (${peak - 1}), not the highest they have ever been (${peak})`);
});

/* THE WEEKLY STEP RACE. Tom, 2026-08-08: a weekly most-steps event with a prize
   and a visible 1st/2nd/3rd. Ranks come from the profile snapshot the client
   already syncs, stamped with the week they belong to, and the previous week is
   settled lazily on the first request of a new one.
   PROVE-RED: drop the `json_extract(profile,'$.weekKey') = ?` clause and the
   stale-week assert fails; remove the INSERT OR IGNORE and the pay-once assert
   fails with two grants. */
await test('step race: ranks this week only, and pays last week exactly once', async () => {
  /* THE REAL WEEK, not an invented one. This fixture used to pick a week in
     2030 so each run got a fresh, never-settled key, because the local dev DB
     persists between runs. That stopped being possible on 2026-08-16: a profile
     snapshot may now only carry the current, previous or next race week
     (sanitizeSnapshot in src/index.js), which is precisely the rule that stops
     an attacker parking a huge total on an uncontested week and collecting the
     5,000-coin podium. A test cannot ask for an exemption from the thing it is
     testing, so the fixture uses the real clock and resets its own state
     instead -- the same idiom recovery.test.mjs already uses for the limiter.
     Mirrors RACE_EPOCH / RACE_DAYS in src/index.js and js/app.js. */
  const RACE_EPOCH = '2026-08-07', RACE_DAYS = 7;
  const epoch = Date.parse(RACE_EPOCH + 'T00:00:00Z');
  const weekStart = epoch + Math.floor((Date.now() - epoch) / (RACE_DAYS * 86400000)) * RACE_DAYS * 86400000;
  const wk = new Date(weekStart).toISOString().slice(0, 10);
  const prev = new Date(weekStart - RACE_DAYS * 86400000).toISOString().slice(0, 10);
  // a real week key means a re-run finds it already settled, so clear the
  // receipt first. Failing to clear is a skipped reset, not a passing test.
  try {
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'bonez', '--local', '--command',
      `DELETE FROM grants WHERE key = 'stepweek-${prev}'`], { cwd: SERVER_DIR, stdio: 'ignore' });
    /* And clear this week's ACCUMULATED racers. The local D1 keeps every racer
       every past run of this suite ever minted, the board is LIMIT 25, and on
       2026-08-30 the leftovers finally outnumbered the slots: the 9,000-step
       fixture fell below the cut and the suite went red on a healthy server.
       A fixture that ranks against residue from old runs is a lottery that
       pays out until the table fills. The PREVIOUS week gets the same reset:
       every past run week-warped a stale racer there, so the settle-and-pay
       half of this test was ranking against ghosts too (its first symptom was
       the payout note naming the wrong place). Both storage forms are named
       because week-warp writes the columns while a live PUT writes the
       profile json. Same guard shape as the receipt above: reset first, or
       the re-run is not a test. */
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'bonez', '--local', '--command',
      `DELETE FROM players WHERE json_extract(profile,'$.weekKey') IN ('${wk}','${prev}') ` +
      `OR week_key IN ('${wk}','${prev}')`], { cwd: SERVER_DIR, stdio: 'ignore' });
  } catch { /* a remote BASE cannot be reset; the pay-once assert will say so */ }
  /* raceV IS REQUIRED, and this test never sent it. The v300 stale-client fix added
     `raceV >= RACE_RULES` to the board query so a client still counting steps under
     the OLD rules cannot rank against clients on the new ones. The real app sends it
     (js/app.js, `raceV: RACE_RULES`); this fixture did not, so COALESCE made it 0,
     every racer was filtered out, and the suite failed deterministically on a
     perfectly good server. Stale test, not a bug: the same audit-drift shape as the
     dust and spire audits earlier today.
     Must match RACE_RULES in server/src/index.js and js/app.js. */
  const RACE_V = 2;
  const mk = async (level, weekKey, steps, raceV = RACE_V) => {
    const k = await makeKeys();
    const p = await (await regFetch(k.pubJwk)).json();
    const body = JSON.stringify({ snapshot: { level, outfit: { SK: 'SK0-1' }, gear: [], weekKey, weekSteps: steps, raceV }, appV: 'test' });
    assert.equal((await signedFetch(k.kp, p.playerId, 'PUT', '/profile', body)).status, 200);
    return { k, p };
  };
  const walker = await mk(5, wk, 42000);
  const slower = await mk(5, wk, 9000);
  /* LAST WEEK'S RACER. A profile PUT can no longer assert a past week's total
     (that is the exploit, not the fixture), so this player is staged the only
     honest way: they sync THIS week like everyone else, and /dev/week-warp then
     moves their row back to where a player who really raced last week would
     have left it. STALE_STEPS is a total a human could actually walk -- the old
     999,999 is now above the weekly ceiling of 7 x 100,000 and would itself be
     clamped, which would have made this assertion about the wrong thing. */
  const STALE_STEPS = 120000;
  const stale = await mk(5, wk, 5000);
  await fetch(BASE + '/dev/week-warp', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: stale.p.playerId, weekKey: prev, steps: STALE_STEPS }),
  });
  // and now the gate itself is COVERED rather than merely tripped over: a client on
  // the old rules must not rank, however many steps it claims
  const oldRules = await mk(5, wk, 500000, RACE_V - 1);

  const r = await (await signedFetch(walker.k.kp, walker.p.playerId, 'GET', `/steps/week?week=${wk}`)).json();
  const ids = r.players.map(x => x.playerId);
  assert.ok(ids.includes(walker.p.playerId) && ids.includes(slower.p.playerId), 'this week\'s racers are on the board');
  assert.ok(!ids.includes(stale.p.playerId), 'a stale sync from last week does not rank in this one');
  assert.ok(!ids.includes(oldRules.p.playerId), 'a client on the OLD race rules does not rank, however many steps it claims');
  const wi = ids.indexOf(walker.p.playerId), si = ids.indexOf(slower.p.playerId);
  assert.ok(wi < si, 'ordered by steps, most first');
  assert.equal(r.players[wi].rank, wi + 1, 'rank is 1-based and matches position');
  assert.ok(r.prize && r.prize.coins > 0, 'the race states its prize');

  // last week had a racer (`stale`), so the FIRST request above settles it
  const g1 = await (await signedFetch(stale.k.kp, stale.p.playerId, 'GET', '/grants?since=0')).json();
  const prizes = (g1.grants || []).filter(x => x.key === `stepweek-${prev}`);
  assert.equal(prizes.length, 1, 'last week\'s winner was paid exactly once');
  assert.ok(prizes[0].payload.coins > 0 && /step race/i.test(prizes[0].payload.note || ''), 'the prize says what it was for');
  assert.ok(/1st/.test(prizes[0].payload.note), 'the note names the place finished');
  // Tom, 2026-08-08: "give 4th and 5th something but just far less than top 3."
  assert.ok(r.podium.length >= 5, `the board publishes every paying place, got ${r.podium.length}`);
  for (let i = 1; i < r.podium.length; i++) {
    assert.ok(r.podium[i].coins < r.podium[i - 1].coins, `place ${i + 1} pays less than place ${i}`);
  }
  assert.ok(r.podium[3].coins * 2 < r.podium[2].coins, '4th is FAR less than 3rd, not a near-miss');

  // and asking again must not pay twice
  await signedFetch(slower.k.kp, slower.p.playerId, 'GET', `/steps/week?week=${wk}`);
  const g2 = await (await signedFetch(stale.k.kp, stale.p.playerId, 'GET', '/grants?since=0')).json();
  assert.equal((g2.grants || []).filter(x => x.key === `stepweek-${prev}`).length, 1, 'settling is idempotent');

  /* THE SETTLED RESULT SURVIVES THE WINNER WALKING AGAIN.
     This is the whole reason /steps/settled exists, so it is asserted here
     rather than in isolation: the race above has just settled and paid
     `stale`, and the next thing a real winner does is take a step in the new
     week. Measured on production 2026-08-14: three of the five players PAID
     for 2026-08-07 had already rolled over, and querying that week returned
     three players who never placed. A results poster reading /steps/week
     announces the wrong winners, silently, and only some weeks. */
  const settled1 = await (await signedFetch(walker.k.kp, walker.p.playerId, 'GET', `/steps/settled?week=${prev}`)).json();
  assert.equal(settled1.podium.length, 1, 'the settled week reports exactly the racer who was paid');
  assert.equal(settled1.podium[0].place, 1, 'place is a number, not a sentence');
  assert.equal(settled1.podium[0].steps, STALE_STEPS, 'the steps are the total that was PAID, not a live count');
  assert.ok(settled1.podium[0].outfit, 'the winner carries art, so a poster can draw them');

  // roll the winner into the new week, exactly as their phone would
  const rolled = JSON.stringify({ snapshot: { level: 5, outfit: { SK: 'SK0-1' }, gear: [], weekKey: wk, weekSteps: 12, raceV: RACE_V }, appV: 'test' });
  assert.equal((await signedFetch(stale.k.kp, stale.p.playerId, 'PUT', '/profile', rolled)).status, 200);

  const gone = await (await signedFetch(walker.k.kp, walker.p.playerId, 'GET', `/steps/week?week=${prev}`)).json();
  assert.ok(!gone.players.some(x => x.playerId === stale.p.playerId),
    'PRECONDITION: the winner really has vanished from the live board for the week they won');

  const settled2 = await (await signedFetch(walker.k.kp, walker.p.playerId, 'GET', `/steps/settled?week=${prev}`)).json();
  assert.equal(settled2.podium.length, 1, 'the paid result is unchanged by the winner walking again');
  assert.equal(settled2.podium[0].steps, STALE_STEPS, 'and still reports the total they were paid on');
  assert.deepEqual(settled2.podium[0].name, settled1.podium[0].name, 'and still names the same player');
});

await test('settled result: an unsettled week is empty, and empty is not an error', async () => {
  const k = await makeKeys();
  const p = await (await regFetch(k.pubJwk)).json();
  const r = await signedFetch(k.kp, p.playerId, 'GET', '/steps/settled?week=2029-01-01');
  assert.equal(r.status, 200, 'a week nobody raced answers cleanly');
  assert.deepEqual((await r.json()).podium, [], 'and reports no podium rather than inventing one');
  const bad = await signedFetch(k.kp, p.playerId, 'GET', '/steps/settled?week=nonsense');
  assert.equal(bad.status, 400, 'a malformed week is refused, not parsed into a key');
});

/* THE PODIUM IS A PUBLIC LIST OF PLAYERS TOO, and it reads paid grants rather
   than the live board, so the board's is_test filter does not reach it. A
   flagged account can no longer place (and so can no longer be paid), but one
   flagged AFTER a payout would still have its name on last week's poster and on
   the Today banner. Both podium rows are staged directly through /dev/grant so
   the assertion is about the FILTER and not about winning a race.
   PROVE-RED: drop `AND COALESCE(p.is_test, 0) = 0` from /steps/settled in
   src/index.js and HIDDEN goes red. */
await test('the settled podium leaves out a flagged account and keeps a real one', async () => {
  /* A fresh week per run. The local D1 keeps rows between runs, so a fixed week
     would accumulate a podium and this would pass once and then fail forever. */
  const wk = `2027-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, '0')}`;
  const pay = (playerId, place) => fetch(BASE + '/dev/grant', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId, key: `stepweek-${wk}`, type: 'social', payload: { place, steps: 5000 + place, coins: 100 } }),
  });

  const real = await makeKeys();
  const rp = await (await regFetch(real.pubJwk)).json();
  const bot = await makeKeys();
  const bp = await (await fetch(BASE + '/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': rndIp() },
    body: JSON.stringify({ pubkey: bot.pubJwk, test: true }),
  })).json();
  assert.ok((await pay(rp.playerId, 1)).ok && (await pay(bp.playerId, 2)).ok, 'PRECONDITION: both payouts must be staged');

  const podium = (await (await signedFetch(real.kp, rp.playerId, 'GET', `/steps/settled?week=${wk}`)).json()).podium;
  assert.ok(podium.some(x => x.name === rp.handle),
    `CONTROL: the real winner must be on the poster, or nothing here is about the flag: ${JSON.stringify(podium)}`);
  assert.ok(!podium.some(x => x.name === bp.handle),
    `HIDDEN: a flagged account is still on the settled podium: ${JSON.stringify(podium)}`);
});

/* NAMES ARE UNIQUE. Tom, 2026-08-08: "How did you allow two people to pick the
   same name Massive coc? That was the whole point of usernames?"
   /name was a blind UPDATE with no check and players.name has no UNIQUE, so the
   second claimant simply overwrote nothing and kept the same string.
   PROVE-RED: delete the `clash` lookup in src/index.js and the second claim
   returns 200 instead of 409, failing the first assertion below. */
await test('names are unique: second claimant is refused and offered a free number', async () => {
  const mk = async () => {
    const k = await makeKeys();
    const p = await (await regFetch(k.pubJwk)).json();
    return { k, p };
  };
  const a = await mk(), b = await mk();
  // 57 = 'Chiseled', 15 = 'Coccyx' — indices, not free text (same wire format as
  // the app. Persistent local D1: find a suffix no earlier run has claimed.
  let pick = null, r1 = null;
  for (let i = 0; i < 8 && !pick; i++) {
    const cand = { adj: 57, noun: 15, num: 100 + Math.floor(Math.random() * 800) };
    const res = await signedFetch(a.k.kp, a.p.playerId, 'POST', '/name', JSON.stringify(cand));
    if (res.status === 200) { pick = cand; r1 = res; }
  }
  assert.ok(pick, 'could not find an unclaimed name to test with');
  assert.equal(r1.status, 200, 'first claimant gets the name');
  const taken = (await r1.json()).name;

  const r2 = await signedFetch(b.k.kp, b.p.playerId, 'POST', '/name', JSON.stringify(pick));
  assert.equal(r2.status, 409, 'second claimant is refused');
  const d2 = await r2.json();
  assert.equal(d2.reason, 'taken', 'refusal is a NAMED outcome, not a bare error');
  assert.equal(d2.name, taken);
  assert.ok(Number.isInteger(d2.suggestNum) && d2.suggestNum >= 1, 'a free number is offered: ' + JSON.stringify(d2));

  // the offered number must actually work
  const r3 = await signedFetch(b.k.kp, b.p.playerId, 'POST', '/name', JSON.stringify({ ...pick, num: d2.suggestNum }));
  assert.equal(r3.status, 200, 'the suggested number is genuinely free');
  assert.notEqual((await r3.json()).name, taken);
});

await test('names are unique: case-insensitive, and re-saving your OWN name still works', async () => {
  const k = await makeKeys();
  const p = await (await regFetch(k.pubJwk)).json();
  const pick = { adj: 58, noun: 62, num: 100 + Math.floor(Math.random() * 800) };
  assert.equal((await signedFetch(k.kp, p.playerId, 'POST', '/name', JSON.stringify(pick))).status, 200);
  // re-saving the identical name must NOT trip the guard (id <> self)
  assert.equal((await signedFetch(k.kp, p.playerId, 'POST', '/name', JSON.stringify(pick))).status, 200,
    'a player re-saving their own name must not be told it is taken');
});

/* TEST ACCOUNTS (2026-08-22). A live-API test registers with {test:true}; the
   row lands is_test=1 and is invisible on every public surface, so test runs
   stop flooding the Crew with dead level-1 accounts (docs/BOT-CENSUS-2026-08-22.md).
   PROVE-RED: drop the COALESCE(is_test,0)=0 clause from /leaderboard or the
   /friends/request lookup in src/index.js and the matching assert fails by name. */
await test('is_test account is hidden from the leaderboard and unfriendable', async () => {
  const bot = await makeKeys();
  const br = await (await fetch(BASE + '/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': rndIp() },
    body: JSON.stringify({ pubkey: bot.pubJwk, test: true }),
  })).json();
  assert.ok(br.playerId, 'flagged registration still works: ' + JSON.stringify(br));
  // give it a profile: without the filter this is exactly a leaderboard row
  const body = JSON.stringify({ snapshot: { level: 998, outfit: { SK: 'SK0-1' }, gear: [] }, appV: 'test' });
  assert.equal((await signedFetch(bot.kp, br.playerId, 'PUT', '/profile', body)).status, 200);

  const viewer = await makeKeys();
  const vp = await (await regFetch(viewer.pubJwk)).json();
  const board = await (await signedFetch(viewer.kp, vp.playerId, 'GET', '/leaderboard')).json();
  assert.ok(!board.players.some(x => x.playerId === br.playerId), 'flagged account never surfaces on the board');

  const fr = await signedFetch(viewer.kp, vp.playerId, 'POST', '/friends/request', JSON.stringify({ code: br.friendCode }));
  assert.equal(fr.status, 404, 'flagged account is unfriendable (same 404 as absent)');

  /* POSITIVE CONTROL, and the row that stops every assert above being vacuous.
     A board that returned nothing at all would satisfy "the bot is not on it".
     So an UNflagged account with the same profile shape must BE on it: the
     filter has to hide bots rather than hide everybody. */
  const real = await makeKeys();
  const rp = await (await regFetch(real.pubJwk)).json();
  assert.ok(rp.playerId && !rp.existing, 'plain registration unaffected');
  assert.equal((await signedFetch(real.kp, rp.playerId, 'PUT', '/profile', body)).status, 200);
  const board2 = await (await signedFetch(viewer.kp, vp.playerId, 'GET', '/leaderboard')).json();
  assert.ok(board2.players.some(x => x.playerId === rp.playerId),
    'an UNflagged account with the same profile must still appear, or the board is simply empty');
});

/* THE OTHER DIRECTION, which the code filter alone did not cover. /leaderboard
   hands every caller an opaque addToken for every row it returns, redeemed at
   POST /friends/add. So a flagged account can read the board and try to put a
   pending request in a REAL player's Crew, which is exactly the clutter Tom is
   looking at. requestFriendship refuses when EITHER side is flagged.
   PROVE-RED: delete the `WHERE NOT EXISTS (... is_test ...)` line from
   requestFriendship in src/index.js and PENDING fails by name. */
await test('a flagged account cannot put a friend request in a real player\'s Crew', async () => {
  const real = await makeKeys();
  const rp = await (await regFetch(real.pubJwk)).json();
  assert.equal((await signedFetch(real.kp, rp.playerId, 'PUT', '/profile',
    JSON.stringify({ snapshot: { level: 7, outfit: {}, gear: [] }, appV: 'test' }))).status, 200);

  const bot = await makeKeys();
  const bp = await (await fetch(BASE + '/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': rndIp() },
    body: JSON.stringify({ pubkey: bot.pubJwk, test: true }),
  })).json();

  // the bot reads the board and takes the real player's add handle off it
  const board = await (await signedFetch(bot.kp, bp.playerId, 'GET', '/leaderboard')).json();
  const row = board.players.find(x => x.playerId === rp.playerId);
  assert.ok(row && row.addToken, 'PRECONDITION: the bot must actually get an addToken, or this proves nothing');

  const add = await signedFetch(bot.kp, bp.playerId, 'POST', '/friends/add', JSON.stringify({ token: row.addToken }));
  assert.equal(add.status, 200, 'the refusal is silent: a flagged caller is told the same thing either way');
  const seen = await (await signedFetch(real.kp, rp.playerId, 'GET', '/friends')).json();
  const all = [...(seen.friends || []), ...(seen.incoming || []), ...(seen.outgoing || []), ...(seen.pending || [])];
  assert.ok(!all.some(x => x.playerId === bp.playerId || x.id === bp.playerId),
    'PENDING: nothing from a flagged account may appear in a real player\'s Crew');

  // CONTROL: the same call from an UNflagged account DOES land, so the assert above is about the flag
  const other = await makeKeys();
  const op = await (await regFetch(other.pubJwk)).json();
  const board2 = await (await signedFetch(other.kp, op.playerId, 'GET', '/leaderboard')).json();
  const row2 = board2.players.find(x => x.playerId === rp.playerId);
  assert.ok(row2 && row2.addToken, 'PRECONDITION: the control needs an addToken too');
  assert.equal((await signedFetch(other.kp, op.playerId, 'POST', '/friends/add', JSON.stringify({ token: row2.addToken }))).status, 200);
  const seen2 = await (await signedFetch(real.kp, rp.playerId, 'GET', '/friends')).json();
  const all2 = [...(seen2.friends || []), ...(seen2.incoming || []), ...(seen2.outgoing || []), ...(seen2.pending || [])];
  assert.ok(all2.some(x => x.playerId === op.playerId || x.id === op.playerId),
    'an UNflagged request must still arrive, or the guard is refusing everybody');
});

/* ---- account deletion (App Store 5.1.1(v)) ----
   One doomed player and one friend who watches them vanish, staged once so
   each requirement is its own test and a failure names itself. Order matters:
   the wrong-key attempt runs BEFORE the real delete, because "the account
   survives" is only a claim while the account exists. */
const doomed = {}, witness = {};
let delWk = null;
await test('account delete: setup: a friended, backed-up racer exists', async () => {
  doomed.k = await makeKeys();
  doomed.p = await (await regFetch(doomed.k.pubJwk)).json();
  witness.k = await makeKeys();
  witness.p = await (await regFetch(witness.k.pubJwk)).json();
  // on this week's step board (same week arithmetic as the race test above)
  const epoch = Date.parse('2026-08-07T00:00:00Z');
  const weekStart = epoch + Math.floor((Date.now() - epoch) / (7 * 86400000)) * 7 * 86400000;
  delWk = new Date(weekStart).toISOString().slice(0, 10);
  const body = JSON.stringify({ snapshot: { level: 4, outfit: { SK: 'SK0-1' }, gear: [], weekKey: delWk, weekSteps: 20000, raceV: 2 }, appV: 'test' });
  assert.equal((await signedFetch(doomed.k.kp, doomed.p.playerId, 'PUT', '/profile', body)).status, 200);
  // a backup to lose
  assert.equal((await signedFetch(doomed.k.kp, doomed.p.playerId, 'PUT', '/backup', JSON.stringify({ blob: bl('doomed') }))).status, 200);
  // a friendship to sever (reciprocal request auto-accepts, as above)
  await signedFetch(doomed.k.kp, doomed.p.playerId, 'POST', '/friends/request', JSON.stringify({ code: witness.p.friendCode }));
  await signedFetch(witness.k.kp, witness.p.playerId, 'POST', '/friends/request', JSON.stringify({ code: doomed.p.friendCode }));
  // PRECONDITIONS, positively: without these the deletion tests prove nothing
  const seen = await (await signedFetch(witness.k.kp, witness.p.playerId, 'GET', '/friends')).json();
  assert.ok(seen.friends.some(x => x.playerId === doomed.p.playerId), 'PRECONDITION: the witness must actually hold the friendship');
  assert.equal((await signedFetch(doomed.k.kp, doomed.p.playerId, 'GET', '/backup')).status, 200, 'PRECONDITION: the backup must exist');
  const board = await (await signedFetch(witness.k.kp, witness.p.playerId, 'GET', `/steps/week?week=${delWk}`)).json();
  assert.ok(board.players.some(x => x.playerId === doomed.p.playerId), 'PRECONDITION: the racer must be on the board');
});

await test('account delete: a wrong key gets 401 and the account survives', async () => {
  const other = await makeKeys();
  const r = await signedFetch(other.kp, doomed.p.playerId, 'POST', '/account/delete');
  assert.equal(r.status, 401, 'a signature by the wrong key must be refused');
  assert.equal((await signedFetch(doomed.k.kp, doomed.p.playerId, 'GET', '/me')).status, 200, 'the refused delete must leave the account standing');
});

await test('account delete: the owner\'s signed delete answers ok', async () => {
  const r = await signedFetch(doomed.k.kp, doomed.p.playerId, 'POST', '/account/delete');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

await test('account delete: the player disappears from a friend\'s Crew', async () => {
  const seen = await (await signedFetch(witness.k.kp, witness.p.playerId, 'GET', '/friends')).json();
  const all = [...(seen.friends || []), ...(seen.incoming || []), ...(seen.outgoing || [])];
  assert.ok(!all.some(x => x.playerId === doomed.p.playerId), 'the deleted player is still in the witness\'s Crew');
});

await test('account delete: the backup is gone (404 on the restore path)', async () => {
  // the row itself is gone, not merely unreadable behind the dead identity
  const warp = await fetch(BASE + '/dev/backup-warp', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: doomed.p.playerId, backMs: 0 }),
  });
  assert.equal(warp.status, 200, `/dev/backup-warp needs DEV=1 (got ${warp.status})`);
  assert.equal((await warp.json()).row, null, 'a backups row survived the deletion');
  // and the user-visible restore path: the same device re-registers (same
  // pubkey), gets a FRESH account, and finds no backup waiting for it
  const re = await (await regFetch(doomed.k.pubJwk)).json();
  assert.notEqual(re.playerId, doomed.p.playerId, 'PRECONDITION: re-registering must mint a fresh account, or the players row survived');
  const r = await signedFetch(doomed.k.kp, re.playerId, 'GET', '/backup');
  assert.equal(r.status, 404, 'a re-registered account was handed the deleted account\'s backup');
});

await test('account delete: the deleted player is off the step board', async () => {
  const board = await (await signedFetch(witness.k.kp, witness.p.playerId, 'GET', `/steps/week?week=${delWk}`)).json();
  assert.ok(!board.players.some(x => x.playerId === doomed.p.playerId), 'the deleted player still ranks');
  // CONTROL: the board is not simply empty (an absence needs a denominator)
  assert.ok(board.players.length > 0, 'CONTROL: the board answered empty, so the absence above proves nothing');
});

await test('account delete: deleting an already-deleted account is ok, not a 500', async () => {
  const r = await signedFetch(doomed.k.kp, doomed.p.playerId, 'POST', '/account/delete');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

/* ---- what a deleted account leaves in EVERYBODY ELSE'S rows, added 2026-09-02 ----
 *
 * The cascade above deletes every row keyed to the player's id, and the tests
 * above prove it. The name is not keyed to the player anywhere it landed: a
 * cheer or a gift is stored under the RECIPIENT, and devices.label /
 * reports.label are stamped by value from unsigned routes. Measured against
 * 1681e58c with the fixture below, AFTER a successful delete, the name was
 * still in five rows across three tables and the sender's id in four.
 *
 * GRADED FROM THE DATABASE FILE, not from an API answer. Every assertion the
 * suite could make through a route reads a projection somebody wrote, and this
 * is exactly the bug where the projection is fine and the row is not. So the
 * check opens the local D1 sqlite read-only and walks sqlite_master: EVERY
 * table, EVERY column, INSTR for the needle. Enumerating rather than listing is
 * the point. A table nobody thought of is the shape of this whole finding, and
 * a hand-written list of tables would have missed devices and reports in
 * exactly the way the cascade did.
 *
 * The scan cannot reach a remote database, so a non-local BASE declares itself
 * UNPROVEN rather than passing on nothing. */
const D1_DIR = path.join(SERVER_DIR, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
function scanDb(needle) {
  const { readdirSync } = fsMod, file = (() => {
    let names = [];
    try { names = readdirSync(D1_DIR); } catch { return null; }
    return names.filter(n => n.endsWith('.sqlite'))[0] || null;
  })();
  if (!file) unprovable(`no local D1 file under ${D1_DIR}; this check reads the database, not the API`);
  const db = new DatabaseSync(path.join(D1_DIR, file), { readOnly: true });
  try {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf%'").all();
    const hits = []; let scanned = 0;
    for (const { name } of tables) {
      scanned += db.prepare(`SELECT COUNT(*) c FROM ${name}`).get().c;
      for (const col of db.prepare(`PRAGMA table_info(${name})`).all()) {
        const n = db.prepare(`SELECT COUNT(*) c FROM ${name} WHERE INSTR(COALESCE(${col.name},''), ?) > 0`).get(needle).c;
        if (n) hits.push(`${name}.${col.name}x${n}`);
      }
    }
    return { hits, tables: tables.length, scanned };
  } finally { db.close(); }
}

const res = {};
await test('delete residue: setup: a player who cheered, gifted and was labelled', async () => {
  res.a = await makeKeys(); res.ap = await (await regFetch(res.a.pubJwk)).json();
  res.b = await makeKeys(); res.bp = await (await regFetch(res.b.pubJwk)).json();
  await signedFetch(res.a.kp, res.ap.playerId, 'POST', '/friends/request', JSON.stringify({ code: res.bp.friendCode }));
  await signedFetch(res.b.kp, res.bp.playerId, 'POST', '/friends/request', JSON.stringify({ code: res.ap.friendCode }));
  /* A CURATED NAME, not the generated handle. A handle is two words off a
     shared list and could collide with a live player's, which would make the
     "it is gone everywhere" assertion below depend on luck. '#N' is what makes
     this needle this account's alone. buildName's indices; see src/index.js. */
  const nm = await signedFetch(res.a.kp, res.ap.playerId, 'POST', '/name',
    JSON.stringify({ adj: 5, noun: 13, num: 617 }));
  assert.equal(nm.status, 200, 'PRECONDITION: the doomed player needs a name to leave behind');
  res.name = (await nm.json()).name;
  assert.ok(res.name && res.name.includes('#'), `PRECONDITION: expected a curated name, got ${res.name}`);

  // one of each authored shape: the cheer carries the sender's id, both gifts carry value
  assert.equal((await signedFetch(res.a.kp, res.ap.playerId, 'POST', '/cheer',
    JSON.stringify({ to: res.bp.playerId, cheer: 3 }))).status, 200);
  assert.equal((await signedFetch(res.a.kp, res.ap.playerId, 'POST', '/gift',
    JSON.stringify({ to: res.bp.playerId, mode: 'free' }))).status, 200);
  assert.equal((await signedFetch(res.a.kp, res.ap.playerId, 'POST', '/gift',
    JSON.stringify({ to: res.bp.playerId, mode: 'spend', coins: 25 }))).status, 200);

  // and the two unsigned routes that stamp the name by value
  res.device = 'res-' + Math.random().toString(36).slice(2, 10);
  const ip = { 'content-type': 'application/json', 'cf-connecting-ip': rndIp() };
  assert.equal((await fetch(BASE + '/events', { method: 'POST', headers: ip,
    body: JSON.stringify({ device: res.device, label: res.name, appV: 'res', events: [{ name: 'app_open' }] }) })).status, 200);
  assert.equal((await fetch(BASE + '/report', { method: 'POST', headers: ip,
    body: JSON.stringify({ device: res.device, label: res.name, kind: 'den-nominate', lat: 1, lng: 2, note: 'n' }) })).status, 200);

  /* THE CONTROL, and it runs before the delete on purpose: if the scan finds
     nothing HERE then it is broken, the fixture never landed, or the needle is
     wrong, and every assertion after the delete would be graded on an empty
     set. Five rows across three tables is the measured shape. */
  const before = scanDb(res.name);
  assert.ok(before.scanned > 0, `CONTROL: the scan examined ${before.scanned} rows, so it proves nothing`);
  assert.ok(before.hits.length >= 3,
    `CONTROL: the name must be findable BEFORE the delete, found only in [${before.hits}]`);
});

await test('delete residue: the display name survives nowhere in the database', async () => {
  assert.equal((await signedFetch(res.a.kp, res.ap.playerId, 'POST', '/account/delete')).status, 200);
  const after = scanDb(res.name);
  assert.ok(after.scanned > 0 && after.tables > 5,
    `CONTROL: scanned ${after.scanned} rows over ${after.tables} tables; an empty database proves nothing`);
  assert.deepEqual(after.hits, [],
    `a deleted player's name is still in the database: ${after.hits.join(', ')}`);
});

await test('delete residue: the only trace of the id left is the opaque grant key', async () => {
  /* NOT deleted, and deliberately: rewriting a grant's key rewrites the
     CLIENT's ledger key, and a client whose cursor rolled backwards would then
     be paid a real gift twice. See the note on the cascade. Asserted as an
     EQUALITY against the exact expected set rather than "nothing else", so this
     goes red the day a new table starts keeping the id. */
  const after = scanDb(res.ap.playerId);
  assert.ok(after.scanned > 0, `CONTROL: scanned ${after.scanned} rows`);
  assert.deepEqual(after.hits, ['grants.keyx3'],
    `the deleted id survives somewhere new: ${after.hits.join(', ')}`);
});

await test('delete residue: the friend keeps the reward and loses only the name', async () => {
  const g = await (await signedFetch(res.b.kp, res.bp.playerId, 'GET', '/grants?since=0')).json();
  const mine = g.grants.filter(x => x.type === 'cheer' || x.type === 'gift');
  assert.equal(mine.length, 3, `PRECONDITION: the friend must still hold all three rows, got ${mine.length}`);
  for (const row of mine) {
    const p = row.payload;
    /* WHAT THE CLIENT RENDERS. js/app.js paintCheers reads `from` first and
       otherwise backs the name out of the note, so both have to say something.
       An empty string or a missing `from` renders "undefined cheered you",
       which is a worse bug than the residue this test exists for. */
    assert.equal(p.from, 'A Bonehead', `${row.key}: from must be the same anonymous sender the route writes for a nameless player, got ${JSON.stringify(p.from)}`);
    assert.ok(p.note && !p.note.includes(res.name) && !/undefined|null/.test(p.note),
      `${row.key}: the note still names somebody or renders nothing: ${JSON.stringify(p.note)}`);
    assert.equal(p.cheerFrom, undefined, `${row.key}: cheerFrom is the id Cheer-back posts to, and it 403s now`);
  }
  // THE VALUE IS UNTOUCHED. Scrubbing must not have cost the friend the gift.
  const spend = mine.find(x => x.key.includes('gift-spend'));
  assert.equal(spend.payload.coins, 25, 'the friend lost the coins they were sent');
  assert.equal(mine.find(x => x.key.includes('gift-free')).payload.gift, true, 'the free gift stopped being a gift');
  assert.equal(mine.find(x => x.type === 'cheer').payload.cheer, 3, 'the cheer lost WHICH cheer it was');
});

/* WHAT A PEER IS SERVED OUT OF YOUR SNAPSHOT, added 2026-09-01.
   sanitizeSnapshot did `{ ...rawSnap }` and clamped four NUMBERS. It stripped no
   unknown key, bounded no string and refused no nesting, and players.profile is
   not a private field: GET /friends hands the whole blob to every accepted
   friend, and the same blob is copied into spires.defender for every rival who
   opens a tower this account holds. Measured against 996f28b9, all six of the
   values below came back to the peer VERBATIM, bounded only by the 24KB body cap.
   Graded at the PEER's readback rather than on the PUT response, because that is
   the end of the chain and the response is not what anybody renders. */
await test('snapshot: a peer is never served unknown keys, long strings or deep nesting', async () => {
  const owner = await makeKeys();
  const op = await (await regFetch(owner.pubJwk)).json();
  const peer = await makeKeys();
  const pp = await (await regFetch(peer.pubJwk)).json();
  // reciprocate so the friendship is ACCEPTED and /friends returns the blob
  await signedFetch(owner.kp, op.playerId, 'POST', '/friends/request', JSON.stringify({ code: pp.friendCode }));
  await signedFetch(peer.kp, pp.playerId, 'POST', '/friends/request', JSON.stringify({ code: op.friendCode }));

  const put = await signedFetch(owner.kp, op.playerId, 'PUT', '/profile', JSON.stringify({
    snapshot: {
      // the legitimate half, and the CONTROL: every one of these must survive
      level: 12, levelName: 'Bruiser', badges: 4, title: 'Marrow King',
      stats: { power: 20, guard: 11 }, outfit: { SK: 'SK0-1' }, gear: ['g-1', 'g-2'],
      pet: { id: 'C3', level: 6, shiny: true },
      yard: { n: 2, pets: [{ sp: 'C3', shiny: true }], wear: { G: 'PA1' } },
      // the six the reviewers proved came back to a peer untouched
      evilHtml: '<img src=x onerror=alert(1)>',
      ctrl: 'a\u0000bc',
      note: 'N'.repeat(20000),
      nested: { a: { b: { c: { d: 'too deep' } } } },
      name: { toString: 'not a string' },
      levelNameLong: 'L'.repeat(500),
    },
    appV: 'test',
  }));
  assert.equal(put.status, 200, 'a strange snapshot is bounded, not rejected');
  const putBody = await put.json();

  const list = await (await signedFetch(peer.kp, pp.playerId, 'GET', '/friends')).json();
  const seen = (list.friends || []).find(x => x.playerId === op.playerId);
  assert.ok(seen && seen.profile, 'PRECONDITION: the peer must actually be served a profile, or every absence below is vacuous');
  const prof = seen.profile;

  /* CONTROL FIRST. An allowlist that dropped a key the client renders would
     break the crew sheet and the tower sheet, and every absence asserted below
     would pass on an empty object. */
  assert.equal(prof.level, 12, 'CONTROL level');
  assert.equal(prof.levelName, 'Bruiser', 'CONTROL levelName');
  assert.equal(prof.title, 'Marrow King', 'CONTROL title');
  assert.equal(prof.stats.power, 20, 'CONTROL stats');
  assert.equal(prof.outfit.SK, 'SK0-1', 'CONTROL outfit');
  assert.equal(prof.pet.id, 'C3', 'CONTROL pet');
  assert.equal(prof.yard.pets[0].sp, 'C3', 'CONTROL yard is still three levels deep');
  assert.equal(prof.yard.wear.G, 'PA1', 'CONTROL the paddock wardrobe');
  assert.equal(prof.gear.length, 2, 'CONTROL gear');

  for (const k of ['evilHtml', 'ctrl', 'note', 'nested', 'name', 'levelNameLong']) {
    assert.ok(!(k in prof), `unknown key '${k}' reached the peer`);
  }
  const blob = JSON.stringify(prof);
  assert.ok(blob.length < 1024, `the peer was served ${blob.length} bytes of snapshot`);
  assert.ok(!/onerror/.test(blob), 'the payload reached the peer somewhere in the blob');

  /* Asserted LAST on purpose. `bounded` is a convenience for a client and a
     test, and it is only present when it is non-empty, so reading it first made
     the pre-fix run die on `undefined.includes` before it had said a word about
     the actual leak. The rows above are the finding; this one is the receipt. */
  assert.ok((putBody.bounded || []).includes('shape'),
    `\`bounded\` must name that the shape was cut, got ${JSON.stringify(putBody.bounded)}`);
});

/* THE OTHER HALF, and the one an allowlist on its own does not answer: an
   ALLOWED key can still carry an unbounded string or a control character, and
   levelName is rendered straight into a crew row. */
await test('snapshot: an allowed key is still bounded, stripped and depth-limited', async () => {
  const owner = await makeKeys();
  const op = await (await regFetch(owner.pubJwk)).json();
  const peer = await makeKeys();
  const pp = await (await regFetch(peer.pubJwk)).json();
  await signedFetch(owner.kp, op.playerId, 'POST', '/friends/request', JSON.stringify({ code: pp.friendCode }));
  await signedFetch(peer.kp, pp.playerId, 'POST', '/friends/request', JSON.stringify({ code: op.friendCode }));

  await signedFetch(owner.kp, op.playerId, 'PUT', '/profile', JSON.stringify({
    snapshot: {
      level: 9,
      levelName: 'L'.repeat(5000),
      title: 'Mar\u0000row\u202eKing',
      plat: 'ios',                                   // CONTROL: a short honest string is untouched
      yard: { n: 1, pets: [{ sp: 'C3', deeper: { a: 1 } }] },
    },
    appV: 'test',
  }));
  const list = await (await signedFetch(peer.kp, pp.playerId, 'GET', '/friends')).json();
  const prof = ((list.friends || []).find(x => x.playerId === op.playerId) || {}).profile;
  assert.ok(prof, 'PRECONDITION: the peer must be served a profile');
  assert.equal(prof.plat, 'ios', 'CONTROL: a legitimate short string passes through untouched');
  assert.equal(prof.levelName.length, 64, `levelName came back ${prof.levelName.length} chars`);
  assert.equal(prof.title, 'MarrowKing', 'a NUL and a bidi override survived into a rendered name');
  assert.equal(prof.yard.pets[0].sp, 'C3', 'CONTROL: the real field at that depth still travels');
  assert.equal(prof.yard.pets[0].deeper, null, 'a value nested below the deepest real field still travelled');
});

console.log(`\n${passed} passed, ${failed} failed${unproven ? `, ${unproven} UNPROVEN here (see the note on UNPROVEN above)` : ''}`);
process.exit(failed ? 1 : 0);
