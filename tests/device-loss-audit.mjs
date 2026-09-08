/* L3: Node-only real encrypted backup/import/init paths and production UI
 * functions in DOM doubles. The 965/950/6-row and 168,680-coin fixtures model
 * the measured incidents; this does not reproduce tmpfs eviction or pixels.
 * CONTROL: healthy and explicitly new saves still initialize; retained keys,
 * unknown identity, unreadable vault, normal merge and failed restore retry
 * each have separate rows. Revert app.js/social.js in a throwaway tree to
 * prove the regression rows red. No network: fetch refuses unknown routes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import './mem-idb.mjs';
import { db, kvSet, kvGet, useDbName, exportAll, importAll, STORES } from '../js/db.js';
import * as social from '../js/social.js';
import { initGameIfNeeded, initLootIfNeeded } from '../js/game.js';
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
let bad = 0, rows = 0;
async function check(name, run) {
  rows++;
  try { await run(); console.log(`PASS ${name}`); }
  catch (e) { bad++; console.log(`FAIL ${name}: ${e.message}`); }
}
function fn(name, optional = false) {
  const start = app.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
  if (optional && start < 0) return '';
  assert.ok(start >= 0, `missing production function ${name}`);
  return app.slice(start, app.indexOf('\n}', start) + 2);
}
function uiContext(extra = {}) {
  const els = new Map();
  const $ = id => {
    if (id === '#saveNew' && !els.get('#screen')?.innerHTML.includes('id="saveNew"')) return null;
    if (id === '#saveRetry' && !els.get('#screen')?.innerHTML.includes('id="saveRetry"')) return null;
    if (!els.has(id)) els.set(id, { innerHTML: '', style: {}, classList: { add() {} }, handlers: {}, addEventListener(k, f) { this.handlers[k] = f; } });
    return els.get(id);
  };
  const c = vm.createContext({ $, els, S: { settings: null }, saveWitness: { settings: false, loot: false }, saveRecoveryActive: false,
    saveRecoveryStatus: 'unknown', newPlayerConfirmed: false, kvGet, kvSet, db, social, markBooted() {}, messages: [],
    toast(m) { c.messages.push(m); }, trackEvent() {}, setTimeout(f) { f(); },
    openRestoreSheet() { c.restoreOpened = true; }, renderOnboarding() { c.onboardingOpened = true; },
    ...extra });
  vm.runInContext(['storageIsFull', 'guardSaveBeforeInit', 'renderAccountRecovery'].map(n => fn(n, true)).join('\n'), c);
  return c;
}
let backup = null, gets = 0, puts = 0, failure = false;
const API = 'https://device-loss.invalid';
globalThis.fetch = async (url, opts = {}) => {
  const { pathname } = new URL(url);
  const reply = (status, body) => ({ ok: status === 200, status, json: async () => body });
  if (pathname === '/health') return reply(404, {});
  if (pathname === '/register') {
    const { pubkey } = JSON.parse(opts.body);
    return reply(200, { playerId: pubkey.x, handle: 'fixture', friendCode: 'FIXTURE' });
  }
  if (pathname === '/backup') {
    if (opts.method === 'PUT') { puts++; backup = { ...JSON.parse(opts.body), version: puts, updatedAt: Date.now() }; return reply(200, { ok: true, version: puts }); }
    gets++; return failure ? reply(503, {}) : backup ? reply(200, backup) : reply(404, {});
  }
  throw new Error(`Unexpected test fetch: ${url}`);
};
async function device(name) { useDbName(`L3-${name}`); await kvSet('apiBase', API); }
async function countRows() { return (await Promise.all(STORES.map(s => db.all(s)))).reduce((n, a) => n + a.length, 0); }
async function wipeToSix(keep = []) {
  for (const store of STORES) await db.clear(store);
  for (const [k, v] of keep) await kvSet(k, v);
  for (let i = keep.length; i < 6; i++) await kvSet(`residue-${i}`, true);
  assert.equal(await countRows(), 6);
}
const settings = { targets: { kcal: 2000, p: 100, c: 250, f: 70 }, createdAt: 1 };
let identity, snapshot;
await check('CONTROL 965-row account and reachable 180,368-byte encrypted backup', async () => {
  await device('source');
  assert.equal((await social.goOnline()).ok, true);
  await social.pushBackup('fixture');
  identity = await kvGet('identity');
  assert.ok(identity.aesJwk);
  // Precisely-sized, valid legacy-format AES-GCM blob. JSON whitespace padding
  // makes its encoded size deterministic without inventing extra save rows.
  snapshot = { app: 'tally', version: 3, ...Object.fromEntries(STORES.map(s => [s, []])) };
  snapshot.log = Array.from({ length: 960 }, (_, i) => ({ id: `old-${i}`, date: '2026-09-01', kcal: 123 }));
  snapshot.kv = [['settings', settings], ['coins', 168680], ['coinsRev', 1], ['loot-init', true], ['game-init', true]].map(([k,v]) => ({k,v}));
  assert.equal(STORES.reduce((n,s) => n + snapshot[s].length, 0), 965);
  const key = await crypto.subtle.importKey('jwk', identity.aesJwk, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(snapshot).padEnd(180368 / 4 * 3 - 28, ' '));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const bytes = new Uint8Array(12 + ct.length); bytes.set(iv); bytes.set(ct, 12);
  const blob = Buffer.from(bytes).toString('base64');
  assert.equal(blob.length, 180368);
  assert.equal((await fetch(API + '/backup', { method: 'PUT', body: JSON.stringify({ blob }) })).status, 200);
});
await check('R54-2 965 rows to 6 with retained identity: reachable backup restores 960 diary rows', async () => {
  await importAll(snapshot);
  await wipeToSix([['identity', identity], ['social', { playerId: identity.pubJwk.x }], ['bootRestored', true], ['apiBase', API]]);
  const before = gets;
  const r = await social.bootSync({ saveMissing: true });
  assert.equal(r.restored, true, `backup not restored: ${r.reason}; local rows=${await countRows()}`);
  assert.ok(gets > before, 'no backup request');
  assert.equal((await db.all('log')).length, 960);
  assert.equal(await kvGet('coins'), 168680);
});
await check('R54-2 965 rows to 6 without a key: recovery is offered before onboarding', async () => {
  await wipeToSix();
  const c = uiContext();
  // Execute the real no-settings boot gate, including its return. Stop before
  // the first paint; everything before this branch is unrelated boot setup.
  const boot = fn('boot');
  const start = boot.indexOf('  if (!S.settings) {');
  const end = boot.indexOf('  /* FIRST PAINT', start);
  assert.ok(start >= 0 && end > start);
  Object.assign(c, { renderOnboarding() { c.onboardingOpened = true; }, social });
  await vm.runInContext(`(async () => {${boot.slice(start, end)}})()`, c);
  assert.match(c.$('#screen').innerHTML, /PLAYED BEFORE\?/, 'wipe went straight to the first-run poster');
  await c.$('#saveRestore').handlers.click();
  assert.equal(c.restoreOpened, true);
  assert.equal(c.onboardingOpened, undefined);
  await c.$('#saveNew').handlers.click();
  assert.equal(c.onboardingOpened, true, 'explicit new-player choice must work');
});
await check('CONTROL unreadable vault is not a new player; recovered key can restore', async () => {
  await wipeToSix();
  globalThis.window = { Capacitor: { Plugins: { BhVault: { get: async () => ({ error: 'locked' }) } } } };
  try {
    assert.equal((await social.bootSync({ saveMissing: true })).reason, 'vault-unreadable');
    window.Capacitor.Plugins.BhVault.get = async () => ({ value: JSON.stringify(identity) });
    assert.equal((await social.bootSync({ saveMissing: true })).restored, true);
    assert.equal(await kvGet('coins'), 168680);
  } finally { delete globalThis.window; }
});
const awardStart = app.indexOf('  let backfillSpoke = false;');
const awardEnd = app.indexOf('  // the pouch reaches', awardStart);
assert.ok(awardStart > 0 && awardEnd > awardStart, 'production boot award block not found');
async function runAwards(c) {
  Object.assign(c, { initGameIfNeeded, initLootIfNeeded, route() {} });
  return vm.runInContext(`(async () => {${app.slice(awardStart, awardEnd)}})()`, c);
}
await check('R54-1 950 rows to 6 in a level-12 session: zero welcome rewards and zero welcome toasts', async () => {
  await device('disk-loss');
  await wipeToSix([['settings', settings], ['loot-init', true], ['game-init', true]]);
  for (let i = 0; i < 944; i++) await db.put('log', { id: `day45-${i}`, date: '2026-09-01', kcal: 100 });
  assert.equal(await countRows(), 950);
  const c = uiContext({ S: { settings, level: 12 }, saveWitness: { settings: true, loot: true } });
  if (c.guardSaveBeforeInit) assert.equal(await c.guardSaveBeforeInit(), false);
  await wipeToSix();
  await runAwards(c);
  assert.equal((await db.all('inv')).filter(r => r.source === 'welcome').length, 0, 'welcome inventory paid after save loss');
  assert.equal((await db.all('inv')).length, 0, 'destroyed save paid a welcome kit');
  assert.equal(c.messages.filter(m => /Welcome kit/.test(m)).length, 0);
  assert.match(c.$('#screen').innerHTML, /RECOVER YOUR BONES/);
  assert.equal(c.$('#saveNew'), null, 'known account must not be treated as new');
});
await check('R54-1 store disappears during game initialization: kit still cannot pay', async () => {
  await device('between-init'); await kvSet('settings', settings); await kvSet('loot-init', true);
  const c = uiContext({ S: { settings }, saveWitness: { settings: true, loot: true },
    initGameIfNeeded: async () => { await wipeToSix(); return null; }, initLootIfNeeded, route() {} });
  await vm.runInContext(`(async () => {${app.slice(awardStart, awardEnd)}})()`, c);
  assert.equal((await db.all('inv')).length, 0, 'kit paid after the game-init await lost storage');
  assert.equal(c.messages.filter(m => /Welcome kit/.test(m)).length, 0);
});
await check('R54-1 replayed onboarding cannot write new settings over known save loss', async () => {
  await wipeToSix();
  let writes = 0;
  const c = uiContext({ S: { settings }, saveWitness: { settings: true, loot: true },
    settingsBase: {}, computeTargets: () => settings.targets, saveSettings: async () => { writes++; } });
  const src = fn('saveInitialSettings');
  const end = src.indexOf("  await kvSet('game-init'");
  assert.ok(end > 0);
  await vm.runInContext(`(${src.slice(0, end)}\n})({})`, c);
  assert.equal(writes, 0, 'onboarding overwrote the old profile');
  assert.match(c.$('#screen').innerHTML, /RECOVER YOUR BONES/);
});
await check('CONTROL healthy boot and explicitly new player still receive one kit total', async () => {
  await device('fresh');
  await kvSet('settings', settings); await kvSet('game-init', true);
  const c = uiContext({ S: { settings }, newPlayerConfirmed: true });
  await runAwards(c);
  const inv = (await db.all('inv')).length;
  assert.ok(inv > 0, 'fresh kit was suppressed');
  assert.equal(c.messages.filter(m => /Welcome kit/.test(m)).length, 1);
  await runAwards(c);
  assert.equal((await db.all('inv')).length, inv);
  assert.equal(c.messages.filter(m => /Welcome kit/.test(m)).length, 1);
});
await check('R50-3 explicit restore replaces all 25 local diary rows and restores 168,680 coins', async () => {
  await device('replace');
  await kvSet('settings', settings); await kvSet('coins', 7); await kvSet('coinsRev', 999999);
  for (let i = 0; i < 25; i++) await db.put('log', { id: `local-${i}`, date: '2026-09-02' });
  const r = await social.adoptIdentity(identity);
  assert.equal(r.restored, true, r.pullReason);
  assert.equal(await kvGet('coins'), 168680, '168,680 coins discarded in favor of local balance');
  assert.equal((await db.all('log')).filter(r => r.id.startsWith('local-')).length, 0, 'kept all 25 local rows despite replacement promise');
  assert.equal((await db.all('log')).length, 960);
});
await check('CONTROL failed explicit download retries with replacement intent at boot', async () => {
  await device('retry'); await kvSet('settings', settings); await kvSet('coins', 7); await kvSet('coinsRev', 999999);
  await db.put('log', { id: 'local-retry', date: '2026-09-02' });
  failure = true;
  try {
    assert.equal((await social.adoptIdentity(identity)).restored, false);
    const before = puts;
    assert.equal(await social.pushBackup('pending-recovery'), false, 'pending recovery uploaded the wrong local account');
    assert.equal(puts, before, 'pending recovery overwrote the backup it still needs');
  }
  finally { failure = false; }
  assert.equal(await kvGet('coins'), 7, 'failed download changed the wallet');
  assert.equal((await social.bootSync()).restored, true);
  assert.equal(await kvGet('coins'), 168680);
  assert.equal(await db.get('log', 'local-retry'), undefined);
});
await check('CONTROL normal pull remains a merge', async () => {
  await db.put('log', { id: 'local-merge', date: '2026-09-02' });
  await kvSet('coins', 7); await kvSet('coinsRev', 999999);
  assert.equal((await social.pullBackup()).restored, true);
  assert.ok(await db.get('log', 'local-merge'));
  assert.equal(await kvGet('coins'), 7);
});
await check('R54-2 failed phrase restore keeps the known-loss gate closed', async () => {
  await wipeToSix();
  const c = uiContext({ S: { settings }, saveRecoveryActive: true, saveRecoveryStatus: 'known',
    social: { restoreWithPhrase: async () => ({ ok: true, restored: false, pullReason: 'http-503' }) },
    openSheet: () => ({}), snapSettings() {}, levelSound() {}, closeAllSheetsViaHistory() {},
    enterAppFromOnboarding() { c.entered = true; }, route() { c.entered = true; } });
  vm.runInContext(fn('openRestoreSheet'), c);
  await c.openRestoreSheet();
  await c.$('#rsGo').handlers.click();
  assert.equal(c.entered, undefined, 'failed restore reopened the app using stale in-memory settings');
  assert.match(c.$('#screen').innerHTML, /RECOVER YOUR BONES/);
});
const io = new DOMException('Failed to write blobs (IOError)', 'DataError');
await check('R54-1 real DataError IOError shape fires the global out-of-storage message', () => {
  const c = uiContext({ lastWriteFailToast: 0, WRITE_FAIL_QUIET_MS: 6000, onWriteFailure(f) { c.sink = f; } });
  const start = app.indexOf('  onWriteFailure((');
  const end = app.indexOf('\n  });', start) + 6;
  assert.ok(start > 0 && end > start);
  vm.runInContext(app.slice(start, end), c);
  c.sink({ store: 'log', key: 'meal', op: 'put', quiet: false, quota: false, error: io });
  assert.equal(c.messages.length, 1);
  assert.match(c.messages[0], /out of storage/, c.messages[0]);
});
await check('R54-1 real DataError IOError shape fires Add out-of-storage message and preserves input', async () => {
  let attempted = false;
  const c = uiContext({ S: { date: '2026-09-01', settings: { targets: null } }, dateKey: () => '2026-09-01',
    rollDayIfNeeded: async () => {}, db: { get: async () => undefined, put: async () => { attempted = true; throw io; } } });
  vm.runInContext(fn('commitLogEntry'), c);
  const btn = { disabled: true };
  assert.equal(await c.commitLogEntry({ id: 'meal', date: c.S.date }, btn), null);
  assert.equal(attempted, true, 'the real IOError must come from the meal write');
  assert.equal(btn.disabled, false);
  assert.match(c.messages[0], /out of storage/);
});
console.log(`device-loss: ${rows - bad}/${rows} passed; ${bad} failed`);
process.exitCode = bad ? 1 : 0;
