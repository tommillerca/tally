// Reconstructed from authoritative specs. Missing on arrival, no arrival verdict.
import './mem-idb.mjs';
import vm from 'node:vm';
import { assert, read, cut, audit, storage, abortWrites } from './lib/r4-proof.mjs';
import * as D from '../js/db.js';
import * as health from '../js/sync-health.js';
import * as notices from '../js/save-disclosure.js';
const a = audit('R4 SILENCE'), app = read('js/app.js');
globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
const journalSource = read('js/save-disclosure.js').replaceAll('export ', '');
function journal(persistent) { const c = vm.createContext({ localStorage: persistent, sessionStorage: storage() }); vm.runInContext(journalSource, c); return c; }
await a.check('R4-11 failed save survives OS-kill model with wholly fresh VM and session storage', () => {
  const persistent = storage(); let old = journal(persistent);
  vm.runInContext('finishSave(beginSave(), true)', old); old = null;
  const fresh = journal(persistent); const state = fresh.takeSaveInterruption();
  assert.equal(state, 'failed'); assert.match(fresh.interruptionCopy({ save: state }), /last session ended after a save failed/);
  assert.equal(fresh.takeSaveInterruption(), null);
});
await a.check('R4-11 CONTROL confirmed saves and another writer cannot erase failure evidence', () => {
  const persistent = storage(), one = journal(persistent), two = journal(persistent);
  vm.runInContext('finishSave(beginSave())', one); assert.equal(journal(persistent).takeSaveInterruption(), null);
  vm.runInContext('finishSave(beginSave(), true)', one); vm.runInContext('finishSave(beginSave())', two);
  assert.equal(journal(persistent).takeSaveInterruption(), 'failed');
});
let abort = false;
abortWrites((_, op) => abort && op === 'clear');
const channels = [];
globalThis.BroadcastChannel = class {
  constructor(name) { this.name = name; this.listeners = new Set(); channels.push(this); }
  addEventListener(_, fn) { this.listeners.add(fn); }
  removeEventListener(_, fn) { this.listeners.delete(fn); }
  postMessage(data) { for (const peer of channels) if (peer !== this && peer.name === this.name) queueMicrotask(() => { const e = { data }; peer.onmessage?.(e); for (const fn of peer.listeners) fn(e); }); }
};
const owner = await import('../js/db.js?r4-owner');
let peer = await import('../js/db.js?r4-peer');
owner.useDbName('r4-erase'); peer.useDbName('r4-erase');
owner.watchForWipe(); peer.watchForWipe();
let reloads = 0; globalThis.location = { reload: () => reloads++ };
const paints = [];
const ui = vm.createContext({ ...notices, onWriteFailure: peer.onWriteFailure,
  takeSaveInterruption: () => null, trackEvent() {}, lastWriteFailToast: -Infinity, WRITE_FAIL_QUIET_MS: 8000,
  toast: (text, ms, opts) => paints.push({ text, opts }),
});
vm.runInContext(cut(app, 'function storageIsFull(', '\nasync function guardSaveBeforeInit'), ui);
vm.runInContext(cut(app, '  const interruptedSave = takeSaveInterruption();', '  saveWitness.settings ||='), ui);
await a.check('R4-6 failed erase proactively tells peer truth and reload recovery', async () => {
  await owner.kvSet('coins', 125); abort = true;
  try { await assert.rejects(owner.eraseAll()); } finally { abort = false; }
  await new Promise(r => setImmediate(r));
  assert.equal(await peer.kvGet('coins'), 125); assert.equal(reloads, 0);
  assert(paints.some(p => p.opts?.error && /erase attempt.*failed.*Saving is paused.*Reload/.test(p.text)), JSON.stringify(paints));
  await assert.rejects(peer.kvSet('coins', 126), /erase attempt.*failed.*Reload/);
  assert(paints.every(p => !/was erased/.test(p.text)));
  peer = await import('../js/db.js?r4-peer-reloaded'); peer.useDbName('r4-erase'); peer.watchForWipe();
  await peer.kvSet('coins', 126); assert.equal(await owner.kvGet('coins'), 126);
});
await a.check('R4-6 CONTROL successful erase still clears data and reloads peers', async () => {
  await owner.eraseAll(); await new Promise(r => setImmediate(r));
  assert.equal(await owner.kvGet('coins', null), null); assert(reloads > 0);
});
await a.check('R4-12 N=4 consecutive launches restamp draft but emit exactly one error notice', async () => {
  D.useDbName('r4-draft'); const initial = Date.now();
  await D.kvSet('addDraft', { ts: initial, q: 'rice', meal: 0, sheet: 'add' });
  const messages = []; const persistent = storage();
  for (let launch = 1; launch <= 4; launch++) {
    const c = vm.createContext({ ...D, ...notices, localStorage: persistent, crypto,
      Date: class extends Date { static now() { return initial + launch * 1000; } },
      currentTab: () => 'today', sheetStack: [], mealDefault: async () => 0,
      toast: (text, ms, opts) => messages.push({ text, opts }),
    });
    vm.runInContext(cut(app, 'const ADD_DRAFT_TTL =', '\n/* THE ONLINE ROW'), c);
    // Drive actual restoration, original openAdd identity initialization and stamp.
    const identity = app.split('\n').find(l => l.includes("addDraft = { sheet: 'add'"));
    vm.runInContext(`function openAdd(meal, q, draftId) { ${identity}\n stampAddDraft({q}); }`, c);
    await vm.runInContext(`(async () => {${cut(app, '  const interruptedFight =', '\n  /* FIRST PAINT')}})()`, c);
    await vm.runInContext('restoreAddDraft()', c);
    await new Promise(r => setImmediate(r));
    const draft = await D.kvGet('addDraft'); assert.equal(draft.id, initial); assert.equal(draft.ts, initial + launch * 1000);
  }
  console.log(`N=4 launches, ${messages.length} error notices`); assert.equal(messages.length, 1); assert.equal(messages[0].opts.error, true);
});
await a.check('R4-14 missing and existing accounts produce DIFFERENT exact notice strings', async () => {
  const result = [], realNow = Date.now; let now = realNow(); Date.now = () => now;
  try {
    for (const exists of [false, true]) {
      D.useDbName('r4-health-'+exists); if (exists) await D.kvSet('social', { playerId: 'audit' });
      const messages = []; health.onSyncTrouble(text => messages.push(text));
      for (let i = 0; i < 4; i++) { now += 1800000; const attempt = health.syncAttempt('audit'); health.syncFailure(attempt, exists ? 'request-failed' : 'offline-gate'); health.recordSyncOutcome(attempt); await health.syncHealthState(); }
      assert.equal(messages.length, 1); result.push(messages[0]);
      if (!exists) assert((await health.syncHealthLine()).includes(messages[0]));
    }
  } finally { Date.now = realNow; health.onSyncTrouble(null); }
  assert.equal(result[0], 'This device is not connected to a Crew account. No profile request started.');
  assert.equal(result[1], 'Your Crew profile has not finished syncing for a while. Your progress is still on this phone. Check Profile sync in Settings.');
  assert.notEqual(result[0], result[1]); console.log('Account notices: '+JSON.stringify(result));
});
a.finish();
