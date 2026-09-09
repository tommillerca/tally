// Node transport evidence for the same all-request counter as the browser audit.
// No browser/server claim. Optional scratch tree supports a real guard reversion.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import './mem-idb.mjs';
import { cloudOptoutRequests } from './lib/cloud-optout-requests.mjs';
for (const method of ['GET', 'PUT', 'POST', 'DELETE', 'PATCH', 'OPTIONS']) {
  const counter = cloudOptoutRequests([{ method, url: '/unrelated' }]);
  assert.equal(counter.total, 1, `${method} on any endpoint must count`);
  assert.equal(counter.backups, 0);
}
const tree = process.argv.find(a => a.startsWith('--tree='))?.slice(7);
const root = tree ? pathToFileURL(resolve(tree) + '/') : new URL('../', import.meta.url);
const D = await import(new URL('js/db.js', root));
const social = await import(new URL('js/social.js', root));
D.useDbName('verify-tail-transport');
await D.kvSet('social', { playerId: 'audit' });
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ method: opts.method || 'GET', url: String(url) });
  return { ok: true, status: 200, json: async () => ({ grants: [], cursor: 0 }) };
};
await social.setCloudBackup(true);
await social.syncProfile({ level: 1 });
assert.equal(calls.length, 1, 'CONTROL enabled profile reaches transport');
await social.setCloudBackup(false);
const mark = calls.length;
await social.pushBackup('audit');
await social.syncProfile({ level: 2 });
await social.pushProfileUpdate(async () => ({ level: 3 }));
if (process.argv.includes('--auto-sync')) await social.autoSync(async () => ({ level: 4 }), 'audit');
const off = cloudOptoutRequests(calls, mark);
console.log(`OFF all requests=${off.total}; old PUT /backup count=${off.backups}; ${JSON.stringify(off.rows)}`);
assert.equal(off.total, 0, 'opted out must emit ZERO REQUESTS OF ANY KIND');
console.log('PASS direct backup and profile paths emit zero requests (Node transport only)');
