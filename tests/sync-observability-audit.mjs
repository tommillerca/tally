import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as dbm from '../js/db.js';
import * as social from '../js/social.js';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const rowSource = app.slice(app.indexOf('async function profileSyncRowHtml()'), app.indexOf('\n}', app.indexOf('async function profileSyncRowHtml()')) + 2);
const pushSource = app.slice(app.indexOf('let _profilePushT = null;'), app.indexOf('\nfunction pitBeatKeys'));
let mode, calls, build, timer;
const context = vm.createContext({ social, socialSnapshot: () => build(), APP_SOCIAL_V: 'audit',
  setTimeout: fn => { timer = fn; return 1; }, clearTimeout() {}, esc: value => String(value).replaceAll('<', '&lt;') });
vm.runInContext(pushSource, context);
vm.runInContext(rowSource, context);
globalThis.fetch = async (url) => {
  calls.push(String(url));
  const grants = String(url).includes('/grants');
  if (mode === 'request-failed' || (mode === 'grants-throw' && grants)) throw new TypeError('PRIVATE PLAYER CONTENT');
  const status = mode === 'non-2xx' && !grants ? 503 : mode === 'grants-failed' && grants ? 502 : 200;
  return { ok: status === 200, status, json: async () => grants ? (mode === 'grants-body' ? {} : { grants: [], cursor: 0 }) : { ok: true } };
};
let failed = 0, checked = 0;
function check(name, fn) {
  checked++;
  try { fn(); console.log(`PASS ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
}
async function setup(kind) {
  mode = kind; calls = [];
  dbm.useDbName(`sync-observability-${kind}-${Math.random()}`);
  if (kind !== 'offline-gate') await dbm.kvSet('social', { playerId: 'audit' });
  await dbm.kvSet('backupAt', Date.now());
  build = async () => {
    if (kind === 'snapshot-failed') throw new RangeError('PRIVATE PLAYER CONTENT');
    return kind === 'null-snapshot' ? null : { level: 1 };
  };
}
for (const path of ['autoSync', 'pushProfileSoon']) {
  for (const kind of ['offline-gate', 'null-snapshot', 'snapshot-failed', 'request-failed', 'non-2xx', ...(path === 'autoSync' ? ['grants-failed', 'grants-throw', 'grants-body'] : []), 'success']) {
    await setup(kind);
    if (path === 'autoSync') await social.autoSync(() => build(), 'audit');
    else { vm.runInContext('pushProfileSoon()', context); await timer(); }
    if (social.syncHealthState) await social.syncHealthState();
    const health = await dbm.kvGet('syncHealth', null);
    const awaitedRows = await dbm.db.all('kv');
    check(`${path} ${kind}: persisted outcome`, () => {
      assert.ok(health?.entries?.length, `NO sync outcome; fetch calls=${calls.length}; kv keys=${JSON.stringify((awaitedRows).map(r => r.k))}`);
    });
    const outcome = health?.entries?.at(-1);
    check(`${path} ${kind}: correct hop and network evidence`, () => {
      assert.equal(health.entries.length, 1, 'exactly one record per attempt');
      assert.equal(outcome.source, path);
      assert.equal(outcome.hop, ['grants-throw', 'grants-body'].includes(kind) ? 'grants-failed' : kind);
      assert.equal(outcome.network, calls.some(url => url.includes('/profile')));
      assert.equal(outcome.grantsNetwork, calls.some(url => url.includes('/grants')));
      assert.equal(outcome.errorName, kind === 'snapshot-failed' ? 'RangeError' : ['request-failed', 'grants-throw'].includes(kind) ? 'TypeError' : kind === 'grants-body' ? 'Error' : null);
      assert.equal(outcome.profileStatus, !outcome.network || kind === 'request-failed' ? null : kind === 'non-2xx' ? 503 : 200);
      assert.ok(Number.isFinite(outcome.at));
      assert.ok(!JSON.stringify(health).includes('PRIVATE PLAYER CONTENT'));
      assert.ok(!('snapshot' in outcome));
    });
    if (kind === 'success') check(`CONTROL ${path}: real transport accepts the built profile`, () => {
      assert.equal(outcome.profileStatus, 200);
      assert.equal(health.lastAcceptedAt, outcome.profileAt);
      assert.equal(calls.filter(url => url.includes('/profile')).length, 1);
      assert.equal(calls.filter(url => url.includes('/grants')).length, path === 'autoSync' ? 1 : 0);
    });
    if (path === 'autoSync') {
      const stamp = await dbm.kvGet('socialSyncAt', 0);
      check(`${kind}: only an accepted profile can advance the throttle`, () => {
        if (kind === 'success') assert.ok(stamp > 0);
        if (['offline-gate', 'null-snapshot', 'snapshot-failed', 'request-failed', 'non-2xx'].includes(kind)) assert.equal(stamp, 0);
        if (['non-2xx', 'null-snapshot'].includes(kind)) assert.equal(outcome.grantsNetwork, true);
      });
    }
    const row = await vm.runInContext('profileSyncRowHtml()', context);
    const phrases = { 'offline-gate': 'not connected', 'null-snapshot': 'not ready',
      'snapshot-failed': 'could not prepare', 'request-failed': 'could not finish',
      'non-2xx': 'did not accept', 'grants-failed': 'deliveries could not be checked',
      'grants-throw': 'deliveries could not be checked', 'grants-body': 'deliveries could not be checked', success: 'Sync completed' };
    check(`${path} ${kind}: real Settings row reports outcome`, () => {
      assert.ok(row.includes('id="profileSyncStatus"'));
      /* Case-insensitive: the phrases below are written lowercase because they
         appear mid-sentence in every signed-in line, but the signed-out row
         opens with its phrase ("Not connected."), and a sentence that starts
         with a capital is not a defect. */
      assert.ok(row.toLowerCase().includes(phrases[kind].toLowerCase()), row);
      if (kind === 'non-2xx') assert.ok(row.includes('HTTP 503'));
      if (kind === 'grants-failed') assert.ok(row.includes('HTTP 502'));
      if (kind === 'grants-throw') { assert.ok(row.includes('TypeError')); assert.ok(!row.includes('HTTP 200')); }
      /* The signed-OUT row is deliberately exempt from the diagnostic detail.
         Tom, 2026-09-11, on seeing "No profile server reply recorded yet. No
         sync attempt recorded yet." in Settings having never gone online; the
         same ruling he made for the Crew screen the day before. The row is
         still graded: offline-gate must carry "not connected" above, so a row
         that goes blank or lies still fails. Every SIGNED-IN failure mode keeps
         the full detail, which is what this audit was written for. */
      if (kind === 'offline-gate') assert.ok(!row.includes('recorded yet'), `signed-out row must not narrate sync plumbing: ${row}`);
      else if (outcome.profileStatus) assert.ok(row.includes('Last server reply:'));
      else assert.ok(row.includes('No profile server reply recorded yet.'));
    });
  }
}

for (const path of ['autoSync', 'pushProfileSoon']) {
  await setup('success');
  await dbm.kvSet('identity', { privJwk: { kty: 'EC' }, pubJwk: { kty: 'EC' } });
  if (path === 'autoSync') await social.autoSync(() => build(), 'audit');
  else { vm.runInContext('pushProfileSoon()', context); await timer(); }
  const state = await social.syncHealthState();
  check(`${path}: signing failure is recorded before fetch`, () => {
    assert.equal(calls.length, 0);
    assert.equal(state.entries[0].network, false);
    assert.equal(state.entries[0].hop, 'request-failed');
    assert.equal(state.entries[0].errorName, 'DataError');
  });
}
const normalFetch = globalThis.fetch;
await setup('success');
social.__setApiDeadline(5);
globalThis.fetch = (url, opts) => new Promise((resolve, reject) => {
  opts.signal.addEventListener('abort', () => reject(opts.signal.reason), { once: true });
});
try {
  await social.autoSync(() => build(), 'audit');
  const state = await social.syncHealthState();
  check('real request deadline records TimeoutError and no server reply', () => {
    assert.equal(state.entries[0].errorName, 'TimeoutError');
    assert.equal(state.entries[0].network, true);
    assert.equal(state.lastReachedAt, null);
  });
} finally {
  globalThis.fetch = normalFetch;
  social.__setApiDeadline(social.API_DEADLINE_MS);
}

// Direct callers of syncProfile must also have success and failure receipts.
for (const kind of ['success', 'non-2xx', 'request-failed']) {
  await setup(kind);
  await social.syncProfile({ level: 1 }, 'audit').catch(() => false);
  const state = await social.syncHealthState();
  check(`direct syncProfile ${kind}`, () => assert.equal(state.entries[0].hop, kind));
}

const realNow = Date.now;
let now = realNow();
Date.now = () => now;
const notices = [];
social.onSyncTrouble(message => notices.push(message));
async function attemptAfter(minutes = 0, kind = 'request-failed', path = 'autoSync') {
  now += minutes * 60000;
  mode = kind;
  await dbm.kvSet('backupAt', now);
  if (path === 'autoSync') await social.autoSync(() => build(), 'audit');
  else { vm.runInContext('pushProfileSoon()', context); await timer(); }
  return social.syncHealthState();
}
try {
  await setup('request-failed');
  await attemptAfter(); await attemptAfter(10);
  check('brief failures stay quiet', () => assert.equal(notices.length, 0));
  await attemptAfter(50);
  check('three failures across an hour give one calm notice', () => {
    assert.equal(notices.length, 1);
    assert.ok(notices[0].includes('Settings'));
  });
  await attemptAfter(3 * 24 * 60);
  check('a continuing three-day outage does not repeat the notice', () => assert.equal(notices.length, 1));
  await attemptAfter(10, 'success');
  let state = await attemptAfter(10);
  const accepted = state.lastAcceptedAt;
  for (let i = 0; i < 45; i++) state = await attemptAfter(0, 'request-failed', 'pushProfileSoon');
  check('bounded history retains last accepted time and failure window', () => {
    assert.equal(state.entries.length, 40);
    assert.equal(state.lastAcceptedAt, accepted);
    assert.equal(state.streak.count, 46);
    assert.equal(notices.length, 1, 'many rapid taps are not a meaningful window');
  });
  await attemptAfter(60);
  check('success resets the episode so a later sustained failure can notify', () => assert.equal(notices.length, 2));
  await social.setCloudBackup(false);
  await attemptAfter(70); await attemptAfter(70); state = await attemptAfter(70);
  const offRow = await vm.runInContext('profileSyncRowHtml()', context);
  check('cloud opt-out has no failure episode or warning', () => {
    assert.equal(state.streak, null);
    assert.equal(notices.length, 2);
    assert.ok(offRow.includes('Profile sync is off'));
    assert.ok(!offRow.includes('notices are off'));
    assert.equal(state.entries.at(-1).network, false);
    assert.ok(!offRow.includes('could not'));
  });
  await social.setCloudBackup(true);
  state = await attemptAfter(70);
  check('opting back in starts a fresh episode', () => {
    assert.equal(state.streak.count, 1);
    assert.equal(notices.length, 2);
  });
  await dbm.kvSet('socialSyncAt', now);
  for (let i = 0; i < 45; i++) state = await attemptAfter();
  const throttleRow = await vm.runInContext('profileSyncRowHtml()', context);
  check('throttle skips are recorded but never count as failures or hide the reason', () => {
    assert.equal(state.entries.length, 40);
    assert.equal(state.entries.at(-1).hop, 'throttled');
    assert.equal(state.streak.count, 1);
    assert.ok(throttleRow.includes('could not finish'));
  });
  const saved = await dbm.exportAll();
  check('diagnostics are excluded from every save export and cloud backup', () => {
    assert.ok(!saved.kv.some(r => r.k === 'syncHealth'));
  });
  const current = await dbm.readFileSave();
  const preview = dbm.fileReplacementPreview(current, { ...saved, kv: [...saved.kv, { k: 'syncHealth', v: { foreign: true } }] });
  check('file replacement preview preserves local diagnostics just like import', () => {
    assert.deepEqual(preview.kv.find(r => r.k === 'syncHealth')?.v, state);
  });
  for (const replace of [true, false]) {
    await dbm.importAll({ ...saved, kv: [...saved.kv, { k: 'syncHealth', v: { foreign: true } }] }, { replace });
    const local = await social.syncHealthState();
    check(`import replace=${replace} preserves device diagnostics and rejects foreign diagnostics`, () => assert.deepEqual(local, state));
  }
} finally {
  Date.now = realNow;
  social.onSyncTrouble(null);
}

await setup('success');
await social.autoSync(() => build(), 'audit');
await social.syncHealthState();
const healthModule = await import(`../js/sync-health.js?reload=${Date.now()}`);
const reloaded = await healthModule.syncHealthState();
check('diagnostics survive module reload', () => assert.equal(reloaded.entries[0].hop, 'success'));
await setup('request-failed');
await Promise.all(Array.from({ length: 12 }, () => social.pushProfileUpdate(() => build(), 'audit')));
const concurrent = await social.syncHealthState();
check('overlapping attempts append atomically', () => assert.equal(concurrent.entries.length, 12));

// Execute the actual boot-registered toast callback, including its delayed recheck.
const noticeSource = app.slice(app.indexOf('  social.onSyncTrouble(message =>'), app.indexOf('  }, 8500));', app.indexOf('  social.onSyncTrouble(message =>')) + '  }, 8500));'.length);
const shown = [];
const noticeContext = vm.createContext({ social, setTimeout: fn => { timer = fn; }, toast: (...args) => shown.push(args) });
vm.runInContext(noticeSource, noticeContext);
await setup('request-failed');
const startNow = Date.now;
let noticeNow = startNow();
Date.now = () => noticeNow;
try {
  for (let i = 0; i < 3; i++) {
    noticeNow += 3600000;
    await dbm.kvSet('backupAt', noticeNow);
    await social.autoSync(() => build(), 'audit');
    await social.syncHealthState();
  }
  const delayedToast = timer;
  await delayedToast();
  check('actual app callback presents a non-blocking toast', () => {
    assert.equal(shown.length, 1);
    assert.equal(shown[0][1], 6500);
    assert.equal(shown[0].length, 2, 'no blocking/error option');
  });
  mode = 'success';
  await social.autoSync(() => build(), 'audit');
  await social.syncHealthState();
  await delayedToast();
  check('recovery before the delayed toast suppresses stale warnings', () => assert.equal(shown.length, 1));
} finally {
  Date.now = startNow;
  social.onSyncTrouble(null);
}

const source = readFileSync(new URL('../js/social.js', import.meta.url), 'utf8');
check('both swallowing boundaries record failures and cannot regain a bare catch', () => {
  for (const name of ['autoSync', 'pushProfileUpdate']) {
    const start = source.indexOf(`export async function ${name}(`);
    const next = source.indexOf('\nexport ', start + 1);
    const body = source.slice(start, next === -1 ? undefined : next);
    assert.match(body, /catch \(error\) \{\s*syncFailure\(attempt, hop, error\);/);
    assert.match(body, /finally \{\s*recordSyncOutcome\(attempt\);/);
  }
  assert.ok(pushSource.includes('social.pushProfileUpdate(socialSnapshot, APP_SOCIAL_V)'));
  assert.ok(!/catch\s*\{/.test(pushSource));
});
check('Settings, toast and offline cache are wired into the app', () => {
  assert.ok(app.includes('const profileSyncRow = await profileSyncRowHtml();'));
  assert.ok(app.includes('${profileSyncRow}'));
  assert.ok(app.includes('social.onSyncTrouble(message => setTimeout('));
  assert.ok(app.includes('if (await social.cloudBackupOn().catch(() => false)) toast(message, 6500)'));
  assert.ok(readFileSync(new URL('../sw.js', import.meta.url), 'utf8').includes("'./js/sync-health.js'"));
  assert.ok(readFileSync(new URL('./release-gate.mjs', import.meta.url), 'utf8').split('const PURE = [')[1].split('];')[0].includes("'sync-observability-audit.mjs'"));
});
console.log(`${checked - failed}/${checked} checks passed`);
process.exitCode = failed ? 1 : 0;
