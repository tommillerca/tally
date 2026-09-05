/* tests/backup-conflict-audit.mjs: cloud backup optimistic locking, client half.
 *
 * Two devices can pull the same cloud version and then both push. The losing
 * device must not overwrite the winner. pushBackup must re-pull the winner,
 * merge it through importAll({ replace:false }), rebuild the encrypted blob,
 * and retry once with the version it just pulled.
 *
 * This runs the real js/social.js and js/db.js over tests/mem-idb.mjs. The API
 * is only an in-memory signed-fetch peer because the Worker half is exercised
 * separately by server/test/api.test.mjs against local wrangler dev.
 *
 * PROVEN RED on integ/day2 at ee52f249, before the implementation:
 *   FAIL SETUP  initial push landed
 *   FAIL RETRY  pushBackup reports success after one stale conflict  | false
 *
 * Usage: node tests/backup-conflict-audit.mjs
 */
import './mem-idb.mjs';

const API = 'http://bh-backup-conflict.invalid';
let server = null;
let version = 0;
let forceConflict = false;
let conflictPutCount = 0;
let rejectEveryPut = false;
let rejectedPuts = 0;

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

globalThis.fetch = async (url, opts = {}) => {
  const { pathname } = new URL(url);
  const method = opts.method || 'GET';
  if (pathname === '/register') {
    return response(200, { playerId: 'backup-conflict-player', handle: 'AUDIT BONES', friendCode: 'AUD1', name: null });
  }
  if (pathname !== '/backup') return response(404, {});
  if (method === 'GET') return server
    ? response(200, { blob: server, updatedAt: version, version })
    : response(404, {});

  const body = JSON.parse(opts.body || '{}');
  if (rejectEveryPut) {
    version++;
    rejectedPuts++;
    return response(409, { error: 'stale backup', code: 'stale-backup', version });
  }
  if (forceConflict) {
    forceConflict = false;
    version++;
    conflictPutCount++;
    return response(409, { error: 'stale backup', code: 'stale-backup', version });
  }
  if (server && body.baseVersion !== version) {
    return response(409, { error: 'stale backup', code: 'stale-backup', version });
  }
  if (!server && body.baseVersion !== null) {
    return response(409, { error: 'stale backup', code: 'stale-backup', version: null });
  }
  server = body.blob;
  version++;
  if (conflictPutCount) conflictPutCount++;
  return response(200, { ok: true, updatedAt: version, version });
};

const { db, kvGet, kvSet, useDbName } = await import('../js/db.js');
const social = await import('../js/social.js');

let bad = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? '  | ' + detail : ''}`);
  if (!pass) bad++;
};
const row = id => ({ id, date: '2026-09-05', meal: 0, ts: Date.now(), name: id, kcal: 1, p: 0, c: 0, f: 0 });

useDbName('backup-conflict-client');
await kvSet('apiBase', API);
const online = await social.goOnline();
ok('SETUP  client registered', !!(online && online.ok), JSON.stringify(online));

await db.put('log', row('from-a'));
ok('SETUP  initial push landed', await social.pushBackup('audit'));
ok('SETUP  successful push stored the returned version', (await kvGet('backupVersion', null)) === version,
  `local=${await kvGet('backupVersion', null)} server=${version}`);

/* Turn the local database into device B while retaining its identity and base
   version. The server still holds device A's row. Device B adds its own row,
   then another winner advances the server version before B's PUT arrives. */
await db.clear('log');
await db.put('log', row('from-b'));
forceConflict = true;
const pushed = await social.pushBackup('audit');
ok('RETRY  pushBackup reports success after one stale conflict', pushed === true, String(pushed));
ok('RETRY  exactly one retry followed the conflict', conflictPutCount === 2, String(conflictPutCount));

/* The retried blob is opaque. Clear the phone and restore that exact server
   blob through the real decrypt/import path, then inspect the resulting rows. */
await db.clear('log');
const restored = await social.pullBackup({ replace: true });
const ids = (await db.all('log')).map(r => r.id).sort();
ok('MERGE  the retry blob contains both devices', restored.restored && JSON.stringify(ids) === '["from-a","from-b"]',
  JSON.stringify({ restored, ids }));
ok('VERSION  the live pull stores the version it observed', (await kvGet('backupVersion', null)) === version,
  `local=${await kvGet('backupVersion', null)} server=${version}`);

rejectEveryPut = true;
const refused = await social.pushBackup('audit');
ok('BOUND  a second 409 stops after one retry', refused === false && rejectedPuts === 2,
  JSON.stringify({ refused, rejectedPuts }));

console.log(bad ? `\n${bad} FAILED` : '\nall green');
process.exit(bad ? 1 : 0);
