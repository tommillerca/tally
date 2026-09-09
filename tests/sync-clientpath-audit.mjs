/* CONTROL: Execute the complete production boot function in Node, with UI and
 * OS scheduling doubles. Snapshot dependencies are bound from app.js's actual
 * import declarations, never replacement snapshot/fighter implementations.
 * Real db/game/loot/social/crypto over mem-idb. Fetch is an in-process boundary,
 * not a claim about production HTTP or a browser's module/DOM initialization.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import './mem-idb.mjs';
import * as database from '../js/db.js';
import * as social from '../js/social.js';
const { kvSet, kvGet, db, useDbName } = database;
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
function source(name) {
  const m = app.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));
  assert.ok(m, `production function ${name}`);
  return m[0];
}
function constant(name) {
  const m = app.match(new RegExp(`^const ${name} = [^\\n]+;`, 'm'));
  assert.ok(m, `production constant ${name}`);
  return m[0];
}
const bindings = {};
const modules = ['db', 'game', 'loot', 'pets', 'pit', 'gear', 'nutrition', 'native', 'save-disclosure', 'poi'];
for (const match of app.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)) {
  if (!modules.some(n => match[2] === `./${n}.js`)) continue;
  const mod = await import(new URL('../js/' + match[2], import.meta.url));
  for (const spec of match[1].split(',').map(s => s.trim()).filter(Boolean)) {
    const [name, alias = name] = spec.split(/\s+as\s+/);
    assert.ok(name in mod, `real import ${name}`);
    bindings[alias] = mod[name];
  }
}
const API = 'https://sync-clientpath.invalid';
const requests = [], traces = [], pending = [];
let status = 200, backupStatus = 200, rejectProfile = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  assert.equal(u.origin, API, 'no external network');
  requests.push({ path: u.pathname, opts });
  traces.push(`${opts.method || 'GET'} ${u.pathname}`);
  if (u.pathname === '/register') return Response.json({ playerId: 'fixture-player', handle: 'fixture', friendCode: 'FIXTURE' });
  if (u.pathname === '/health') return Response.json({ now: Date.now() });
  if (u.pathname === '/profile') {
    if (rejectProfile) throw new TypeError('fixture offline');
    return Response.json({ ok: status === 200, bounded: [] }, { status });
  }
  if (u.pathname === '/grants') return Response.json({ cursor: 0, grants: [] });
  if (u.pathname === '/backup' && opts.method === 'PUT') return Response.json({ ok: backupStatus === 200, version: 1, updatedAt: Date.now() }, { status: backupStatus });
  if (u.pathname === '/backup') return Response.json({}, { status: 404 });
  throw new Error(`unexpected fixture request ${opts.method} ${u.pathname}`);
};
const noop = () => {};
const asyncNoop = async () => null;
function context() {
  const c = vm.createContext({ ...bindings, console, Date, URLSearchParams,
    S: { demo: false, settings: null }, navigator: { webdriver: false, onLine: true },
    location: { search: '', protocol: 'http:', hash: '#/today' },
    window: { addEventListener: noop }, sessionStorage: { getItem: () => null, removeItem: noop },
    history: { replaceState: noop }, sheetStack: [],
    lifecycleBound: false, saveWitness: { settings: false, loot: false }, saveRecoveryActive: false,
    lastWriteFailToast: 0, WRITE_FAIL_QUIET_MS: 1000,
    social: { ...social, autoSync(build, version) {
      traces.push('autoSync');
      const promise = social.autoSync(async () => {
        traces.push('buildSnapshot');
        try { const snapshot = await build(); traces.push(`snapshot ${snapshot?.level}`); return snapshot; }
        catch (error) { traces.push(`snapshot error: ${error.message}`); throw error; }
      }, version);
      pending.push(promise); return promise;
    } },
    // UI, OS bridges and scheduled callbacks do not execute in this Node audit.
    setTimeout: noop, setInterval: noop, armMidnightTimer: () => ({ rearm: noop }),
    onAppResume: cb => { c.resume = cb; },
  });
  for (const name of ['watchForWipe', 'snapSettings', 'setHaptics', 'route', 'routeFromHash', 'bindTabs', 'installPaddockSeam',
    'backupNudge', 'checkPetLevelUp', 'rollDayIfNeeded', 'refreshNotifSchedules', 'flushAnalytics', 'initAnalytics',
    'refresh', 'toast', 'dayGuardToast', 'trackEvent', 'maybeShowRenameNotice', 'maybeNudgeRecovery',
    'maybeShowWhatsNew']) c[name] = noop;
  for (const name of ['hydrateGenericUse', 'showSplash', 'refreshShinyPets', 'refreshPetMorphs', 'refreshSlimedSlots',
    'refreshPetWear', 'maybeWelcomeBack', 'restoreAddDraft', 'drainCookQueue', 'ingestHkPayload', 'nativeAutoSync',
    'checkSieges', 'presentGrantDelivery', 'cloudTroubleNotice', 'checkFriendRequests', 'maybeShowDailyWheel',
    'drainSurvey2Pending']) c[name] = asyncNoop;
  c.takeHkFromUrl = () => null;
  c.renderAccountRecovery = () => { throw new Error('unexpected recovery gate'); };
  c.renderStorageUnavailable = () => { throw new Error('unexpected storage gate'); };
  vm.runInContext([
    ...['APP_SOCIAL_V', 'APP_BUILD', 'RACE_EPOCH', 'RACE_DAYS', 'RACE_RULES', 'HABIT_GRANT_KEY',
      'ECONOMY_TALENTS', 'CHAMP_BADGE', 'CHAMP_TITLE'].map(constant),
    ...['storageIsFull', 'guardSaveBeforeInit', 'boot', 'bindAppLifecycle', 'socialSnapshot', 'buildFighter',
      'habitBaseGrantTp', 'raceWeekKey', 'raceWeekDates', 'weekStepsNow', 'championTitle'].map(source),
  ].join('\n'), c);
  return c;
}
let n = 0;
async function seed() {
  useDbName(`sync-clientpath-${++n}`);
  await kvSet('apiBase', API);
  assert.equal((await social.goOnline()).ok, true);
  const identity = await kvGet('identity');
  await kvSet('social', { playerId: 'fixture-player', handle: 'fixture', friendCode: 'FIXTURE' });
  assert.ok(identity.privJwk.d, 'CONTROL real signing key');
  await kvSet('settings', { targets: { kcal: 2000, p: 100, c: 250, f: 70 }, createdAt: 1 });
  await kvSet('game-init', true);
  await kvSet('loot-init', true);
  await kvSet('bootRestored', true);
  await kvSet('backupAt', Date.now());
  await db.put('xp', { key: 'fixture-xp', xp: 5000, type: 'quest', date: bindings.dateKey() });
  await db.put('health', { date: bindings.dateKey(), steps: 1234 });
  requests.length = traces.length = pending.length = 0;
  status = backupStatus = 200; rejectProfile = false;
}
let bad = 0;
async function check(label, run) {
  try { await run(); console.log(`PASS ${label}`); }
  catch (error) { bad++; console.log(`FAIL ${label}: ${error.stack}`); }
}
await check('CONTROL boot reaches lifecycle, online gate, real snapshot and signed profile request', async () => {
  await seed();
  const c = context();
  assert.equal(await social.isOnline(), true);
  await c.boot();
  await Promise.all(pending);
  console.log('TRACE boot: ' + traces.join(' -> '));
  assert.equal(c.lifecycleBound, true);
  assert.equal(typeof c.resume, 'function');
  assert.equal(pending.length, 1);
  const profiles = requests.filter(r => r.path === '/profile');
  assert.equal(profiles.length, 1, 'profile fetch must be reached');
  const { snapshot } = JSON.parse(profiles[0].opts.body);
  assert.ok(snapshot.level > 1);
  assert.equal(snapshot.weekSteps, 1234);
  assert.ok(profiles[0].opts.headers['x-bh-sig']);
  assert.ok(await kvGet('socialSyncAt', 0));
  const before = pending.length;
  c.bindAppLifecycle();
  assert.equal(pending.length, before, 'binding is idempotent');
  await c.resume(); await Promise.all(pending);
  assert.equal(pending.length, 2, 'resume invokes autoSync');
  assert.equal(requests.filter(r => r.path === '/profile').length, 1, 'success throttles resume');
  await kvSet('socialSyncAt', Date.now() - 5 * 60 * 1000 - 1000);
  await c.resume(); await Promise.all(pending);
  assert.equal(requests.filter(r => r.path === '/profile').length, 2, 'due resume reaches profile');
});
for (const httpStatus of [401, 413, 429, 503]) await check(`HTTP ${httpStatus} does not stamp success and an immediate retry reaches profile`, async () => {
  await seed(); const c = context(); status = httpStatus;
  await social.autoSync(c.socialSnapshot, 'fixture');
  assert.equal(requests.filter(r => r.path === '/profile').length, 1);
  assert.equal(await kvGet('socialSyncAt', 0), 0, 'HTTP failure must not move throttle');
  status = 200;
  await social.autoSync(c.socialSnapshot, 'fixture');
  assert.equal(requests.filter(r => r.path === '/profile').length, 2);
  assert.ok(await kvGet('socialSyncAt', 0));
});
await check('CONTROL thrown snapshot/network failures leave throttle unchanged', async () => {
  await seed(); const c = context();
  await social.autoSync(async () => { throw new Error('fixture snapshot failure'); });
  assert.equal(await kvGet('socialSyncAt', 0), 0);
  assert.equal(requests.filter(r => r.path === '/profile').length, 0);
  rejectProfile = true;
  await social.autoSync(c.socialSnapshot);
  assert.equal(await kvGet('socialSyncAt', 0), 0);
  assert.equal(requests.filter(r => r.path === '/profile').length, 1);
});
await check('null snapshot does not stamp success or block the next valid snapshot', async () => {
  await seed(); const c = context();
  await social.autoSync(async () => null);
  assert.equal(requests.filter(r => r.path === '/profile').length, 0);
  assert.equal(await kvGet('socialSyncAt', 0), 0);
  await social.autoSync(c.socialSnapshot);
  assert.equal(requests.filter(r => r.path === '/profile').length, 1);
  assert.ok(await kvGet('socialSyncAt', 0));
});
for (const httpStatus of [200, 503]) await check(`CONTROL due backup HTTP ${httpStatus} still reaches profile`, async () => {
  await seed(); const c = context(); backupStatus = httpStatus;
  await kvSet('backupAt', 0);
  await social.autoSync(c.socialSnapshot);
  const paths = requests.map(r => r.path);
  assert.ok(paths.includes('/backup'));
  assert.ok(paths.indexOf('/profile') > paths.indexOf('/backup'));
  assert.ok(await kvGet('socialSyncAt', 0));
});
await check('CONTROL unregistered player does not build or upload a snapshot', async () => {
  await seed();
  await kvSet('social', null);
  assert.equal(await social.isOnline(), false);
  let builds = 0;
  await social.autoSync(async () => { builds++; return {}; });
  assert.equal(builds, 0);
  assert.equal(requests.length, 0);
});
console.log(`SYNC CLIENT PATH: ${bad} failed`);
process.exitCode = bad ? 1 : 0;
