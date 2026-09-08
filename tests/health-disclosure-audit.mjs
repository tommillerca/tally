// h1: production sync, persistence and v518 disclosure functions in Node.
// HealthKit and visible device UI remain unrun. No sockets or browser.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { db, kvGet, kvSet, kvUpdate, useDbName } from '../js/db.js';
import * as notices from '../js/save-disclosure.js';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const swift = readFileSync(new URL('../native/ios/App/App/HealthPlugin.swift', import.meta.url), 'utf8');
function section(start, end) {
  const a = app.indexOf(start), b = app.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `missing production section ${start}`);
  return app.slice(a, b);
}
const base = Date.parse('2026-09-08T12:00:00Z');
let serial = 0;
function session({ connected = true, result = { date: '2026-09-08', steps: 1200, stepsRead: 'ok' }, now = base } = {}) {
  const paints = [];
  class Clock extends Date { static now() { return c.now; } }
  const c = vm.createContext({
    ...notices, db, kvGet, kvSet, kvUpdate, Date: Clock, now, result,
    S: { settings: { hkConnected: connected, hkNative: connected, units: 'kg' } },
    isNative: () => true, nativeQueryToday: async () => {
      if (c.result instanceof Error) throw c.result;
      return c.result;
    },
    saveSettings: async () => {}, dispatchEvent() {}, CustomEvent: class {},
    onHealthSync: async () => ({ newBadges: [] }), checkPetLevelUp: async () => {},
    toast: (copy, duration, options) => paints.push({ copy, duration, options }),
    HK_SCOPES_V: 2, onWeighIn: async () => {},
    confettiBurst() {}, popSound() {}, innerWidth: 390,
  });
  vm.runInContext(section('async function hkStaleInfo(', '// Pets level up from walking;'), c);
  vm.runInContext(section('let lastNativeSync = 0;', '// Bump whenever the native HealthKit'), c);
  return { c, paints,
    sync: () => vm.runInContext('nativeSyncNow({ silent: true })', c),
    disclose: () => vm.runInContext('(async () => discloseHealthSync(await hkStaleInfo()))()', c),
  };
}
let passed = 0, failed = 0;
async function check(name, fn) {
  useDbName(`h1-${++serial}`);
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}: ${error.stack}`); }
}

await check('CONTROL healthy step sync produces NONE, including a readable zero', async () => {
  for (const steps of [1200, 0]) {
    const s = session({ result: { date: '2026-09-08', steps, stepsRead: 'ok' } });
    assert.equal(await s.sync(), true);
    assert.equal((await db.get('health', '2026-09-08')).steps, steps);
    assert.equal(await kvGet('hkLastSync'), base);
    await s.disclose();
    assert.equal(s.paints.length, 0);
  }
});

await check('failed bridge query discloses once across relaunch and preserves last success', async () => {
  await kvSet('hkLastSync', base - 3600e3);
  const s = session({ result: new Error('bridge unavailable') });
  assert.equal(await s.sync(), false);
  assert.equal(await kvGet('hkLastSync'), base - 3600e3);
  assert.equal((await kvGet('hkSyncIssue')).failedAt, base);
  assert.equal(s.paints.length, 1);
  assert.equal(s.paints[0].options.error, true);
  assert.match(s.paints[0].copy, /latest step sync failed/);
  assert.match(s.paints[0].copy, /2026-09-08T11:00:00.000Z/);
  assert.match(s.paints[0].copy, /Open Today.*retry/);
  const returned = session({ result: new Error('still unavailable') });
  await returned.sync(); await returned.disclose();
  assert.equal(returned.paints.length, 0, 'no launch nag');
});

await check('stale sync discloses at 36 hours, fresh timestamp is a positive CONTROL', async () => {
  await kvSet('hkLastSync', base - notices.HK_STALE_MS + 1);
  const s = session();
  await s.disclose(); assert.equal(s.paints.length, 0);
  s.c.now++;
  await s.disclose(); assert.equal(s.paints.length, 1);
  assert.match(s.paints[0].copy, /No step data has synced for 36 hours/);
  const returned = session({ now: base + notices.HK_STALE_MS });
  await returned.disclose(); assert.equal(returned.paints.length, 0);
  assert.equal(await kvGet('hkStaleNotified'), true);
});

await check('native error/empty results cannot overwrite steps or certify success', async () => {
  await kvSet('hkLastSync', base - notices.HK_STALE_MS);
  await db.put('health', { date: '2026-09-08', steps: 4200 });
  for (const result of [null,
    { date: '2026-09-08', steps: 0, activeKcal: 0, error: 'read-failed' },
    { date: '2026-09-08', steps: 0, activeKcal: 0, stepsRead: 'failed' },
    { date: '2026-09-08', steps: 0, activeKcal: 0, stepsRead: 'empty' },
    { date: '2026-09-08', steps: 0, activeKcal: 0 },
    { date: '2026-09-08', activeKcal: 300 },
  ]) {
    const s = session({ result });
    assert.equal(await s.sync(), false);
    assert.equal(await kvGet('hkLastSync'), base - notices.HK_STALE_MS);
    assert.equal((await db.get('health', '2026-09-08')).steps, 4200);
  }
});

await check('missing timestamp observes a grace period without inventing historical success', async () => {
  await db.put('health', { date: '2026-01-01', steps: 500 });
  const s = session({ result: { date: '2026-09-08', stepsRead: 'empty', activeKcal: 0 } });
  await s.sync();
  assert.equal(s.paints.length, 0, 'CONTROL empty today is not a confirmed failure');
  assert.equal(await kvGet('hkLastSync', null), null);
  const returned = session({ now: base + notices.HK_STALE_MS });
  await returned.disclose();
  assert.equal(returned.paints.length, 1);
  assert.match(returned.paints[0].copy, /No successful step sync time was recorded/);
  assert.doesNotMatch(returned.paints[0].copy, /revoked|disconnected|walking isn't counting|Settings/);
});

await check('recovery clears failure and re-arms only a later episode', async () => {
  const s = session({ result: new Error('failure') });
  await s.sync(); assert.equal(s.paints.length, 1);
  s.c.result = { date: '2026-09-08', steps: 2000, stepsRead: 'ok' };
  await s.sync();
  assert.equal(s.paints.length, 1, 'healthy recovery adds no warning');
  assert.equal(await kvGet('hkSyncIssue'), null);
  assert.equal(await kvGet('hkStaleNotified'), false);
  s.c.now += 600e3; s.c.result = new Error('new failure');
  await s.sync(); assert.equal(s.paints.length, 2);
});

await check('CONTROL never-connected player gets no health disclosure', async () => {
  const s = session({ connected: false });
  await s.disclose(); assert.equal(s.paints.length, 0);
  assert.equal(await kvGet('hkSyncIssue', null), null);
});

await check('production UI and Swift bridge retain actionable evidence plumbing', async () => {
  const banner = section('  ${hkStale ? `', '  ${/* THE DAY IS ONE COLLAPSED BANNER');
  assert.match(banner, /healthSyncCopy/);
  const click = section("  $('#hkStaleFix', el)", '  S.justLogged = false;');
  assert.match(click, /nativeSyncNow/); assert.match(click, /openHealthGuide/);
  assert.doesNotMatch(click, /#\/settings|iOS Settings/);
  const connect = section('async function connectNativeHealth()', 'async function syncFromClipboard()');
  assert.doesNotMatch(connect, /iOS Settings/);
  assert.match(connect, /toast\(ok \?/);
  const callback = swift.slice(swift.indexOf('var stepsRead'), swift.indexOf('quantityType: energyType'));
  assert.match(callback, /error != nil/); assert.match(callback, /stepsRead = "failed"/);
  assert.match(callback, /else if let quantity = stats\?\.sumQuantity\(\)/);
  assert.match(swift, /if stepsRead == "ok" \{ out\["steps"\]/);
  assert.match(app, /await discloseHealthSync\(hkStale\)/);
  assert.doesNotMatch(app, /notifyNow\('Steps stopped syncing'/);
});

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
