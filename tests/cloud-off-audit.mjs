// Reconstructed in this checkout: original audit was absent, source fixes present.
// CONTROL uses the real wardrobe callback, debounce, storage and transport.
import './mem-idb.mjs';
import vm from 'node:vm';
import { assert, read, cut, audit } from './lib/r4-proof.mjs';
import * as D from '../js/db.js';
import * as social from '../js/social.js';
import * as health from '../js/sync-health.js';
import * as loot from '../js/loot.js';
import { BH_ITEMS } from '../data/boneheadz.js';
const a = audit('Cloud off audit'), app = read('js/app.js');
let calls = [], timer, handler, status = 200;
globalThis.fetch = async (url, opts) => {
  calls.push({ url: String(url), method: opts.method, body: JSON.parse(opts.body || '{}') });
  return { ok: status === 200, status, json: async () => ({}) };
};
D.useDbName('r4-cloud-off');
await D.kvSet('social', { playerId: 'audit' });
const item = BH_ITEMS.find(i => i.slot === 'CH');
assert(item, 'CONTROL real pet garment exists');
await D.db.put('inv', { id: 'garment', kind: 'cos', itemId: item.id });
const ctx = vm.createContext({ social, APP_SOCIAL_V: 'audit', S: {},
  socialSnapshot: async () => ({ level: 1, yard: { wear: await loot.petWear() } }),
  togglePetWear: loot.togglePetWear, refreshPetWear: async () => {}, popSound() {}, render() {}, toast() {}, body: {},
  $$: () => [{ dataset: { petwear: item.id }, addEventListener: (_, fn) => { handler = fn; } }],
  setTimeout: fn => { timer = fn; return 1; }, clearTimeout() {},
});
vm.runInContext(cut(app, 'let _profilePushT = null;', '\nfunction pitBeatKeys'), ctx);
vm.runInContext(cut(app, "    $$('[data-petwear]', body)", '    /* A TEAM TILE'), ctx);
async function tap() { calls = []; await handler(); assert(timer, 'real handler scheduled debounce'); const run = timer; timer = null; await run(); await health.syncHealthState(); }
await a.check('CONTROL healthy enabled garment tap uploads its persisted outfit', async () => {
  await tap(); assert.equal(calls.length, 1); assert.equal(calls[0].method, 'PUT');
  assert(calls[0].url.endsWith('/profile')); assert.deepEqual(calls[0].body.snapshot.yard.wear, await loot.petWear());
  assert.equal((await loot.petWear())[item.slot], item.id);
});
await a.check('OFF garment tap emits ZERO network requests', async () => {
  await social.setCloudBackup(false); await tap();
  console.log('OFF transport: ' + JSON.stringify(calls)); assert.equal(calls.length, 0);
  assert.notEqual((await loot.petWear())[item.slot], item.id, 'local tap still changed outfit');
});
await a.check('OFF direct and shared profile calls emit zero requests', async () => {
  calls = []; assert.equal(await social.syncProfile({ level: 2 }), false);
  assert.equal(await social.syncProfile({ level: 2 }, '', health.syncAttempt('shared')), false); assert.equal(calls.length, 0);
});
await a.check('OFF skips the snapshot builder itself', async () => {
  let built = 0; await social.pushProfileUpdate(async () => { built++; return {}; }); assert.equal(built, 0); assert.equal(calls.length, 0);
});
await a.check('opting out during snapshot preparation stops the shared upload', async () => {
  await social.setCloudBackup(true); calls = [];
  await social.pushProfileUpdate(async () => { await social.setCloudBackup(false); return { level: 1 }; }); assert.equal(calls.length, 0);
});
await a.check('Settings disclosure names stopped profile sync and stale Crew entries', async () => {
  const line = await health.syncHealthLine(); assert.match(line, /Profile sync is off/); assert.match(line, /Crew row and leaderboard entry stop updating/); assert.doesNotMatch(line, /notices are off/);
  const source = cut(app, "    toast('Cloud backup off.", '\n');
  const notices = []; vm.runInNewContext(source, { toast: text => notices.push(text) });
  assert.match(notices[0], /Crew row and leaderboard entry stop updating/);
});
await a.check('OFF diagnostic outcomes describe zero attempted profile requests', async () => {
  const state = await health.syncHealthState(); const last = state.entries.at(-1);
  assert.equal(last.hop, 'opted-out'); assert.equal(last.network, false); assert.equal(state.streak, null);
});
await a.check('CONTROL re-enable reaches server and reports its rejection', async () => {
  await social.setCloudBackup(true); status = 500; calls = []; await social.pushProfileUpdate(async () => ({ level: 1 }));
  assert.equal(calls.length, 1); assert.match(await health.syncHealthLine(), /HTTP 500/);
});
a.finish();
