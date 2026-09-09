/* Node sync probe. Real app snapshot functions and their actual imported bindings,
 * real social/db/game/loot modules, mem-idb, WebCrypto and an in-process fetch spy.
 * Optional tree argument supports isolated historical exports without editing them.
 * CONTROL: a throwing builder must be observed as no profile request.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import './mem-idb.mjs';

const root = resolve(process.argv[2] || fileURLToPath(new URL('../', import.meta.url)));
const app = readFileSync(join(root, 'js/app.js'), 'utf8');
const moduleAt = p => import(pathToFileURL(join(root, p)).href);
Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
const { db, kvSet, kvGet, useDbName } = await moduleAt('js/db.js');
const social = await moduleAt('js/social.js');
function source(name) {
  const match = app.match(new RegExp(`^(?:async )?function ${name}\\([^]*?^}`, 'm'));
  assert.ok(match, `production function ${name} exists`);
  return match[0];
}
const names = ['socialSnapshot', 'buildFighter', 'habitBaseGrantTp', 'weekStepsNow',
  'raceWeekKey', 'raceWeekDates', 'championTitle'];
let code = names.map(source).join('\n');
for (const name of ['RACE_EPOCH', 'RACE_DAYS', 'RACE_RULES', 'CHAMP_BADGE', 'CHAMP_TITLE', 'HABIT_GRANT_KEY', 'ECONOMY_TALENTS']) {
  const match = app.match(new RegExp(`^const ${name} = [^\\n]+;`, 'm'));
  assert.ok(match, `production constant ${name} exists`);
  code += '\n' + match[0];
}
const bindings = {};
// Resolve names through app.js's own import list. Supplying entire namespaces
// would hide a missing import, exactly the kind of break this probe must catch.
for (const m of app.matchAll(/^import\s*\{([^]*?)\}\s*from\s*['"]([^'"]+)['"];?/gm)) {
  const needed = m[1].split(',').map(s => s.trim()).filter(Boolean).map(s => s.split(/\s+as\s+/))
    .filter(parts => new RegExp(`\\b${parts.at(-1)}\\b`).test(code));
  if (!needed.length) continue;
  const mod = await moduleAt(join('js', m[2]));
  for (const [original, alias = original] of needed) {
    assert.ok(original in mod, `${m[2]} exports ${original}`);
    bindings[alias] = mod[original];
  }
}
const ctx = vm.createContext({ ...bindings, console, Date, Set, Map });
vm.runInContext(code, ctx, { filename: join(root, 'js/app.js') });
const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const identity = { privJwk: await crypto.subtle.exportKey('jwk', kp.privateKey), pubJwk: await crypto.subtle.exportKey('jwk', kp.publicKey) };
let requests = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  assert.equal(u.origin, 'https://sync-probe.invalid', 'no external traffic');
  const body = opts.body || '';
  const signed = `${opts.method}\n${u.pathname}${u.search}\n${opts.headers['x-bh-ts']}\n${body}`;
  assert.equal(opts.headers['x-bh-player'], 'sync-probe');
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey,
    Buffer.from(opts.headers['x-bh-sig'], 'base64'), new TextEncoder().encode(signed)), 'valid profile/grants signature');
  requests.push({ method: opts.method, path: u.pathname, body: body && JSON.parse(body) });
  if (u.pathname === '/profile') return Response.json({ ok: true });
  if (u.pathname === '/grants') return Response.json({ grants: [] });
  if (u.pathname === '/backup') return Response.json({ ok: true, version: 1 });
  throw new Error(`unexpected route ${u.pathname}`);
};
async function seed(label, pet, backupDue = false) {
  useDbName(`sync-probe-${label}`);
  requests = [];
  for (const [k, v] of Object.entries({ apiBase: 'https://sync-probe.invalid', social: { playerId: 'sync-probe', name: 'Probe' },
    identity, settings: { targets: {} }, 'loot-init': true, backupAt: backupDue ? 0 : Date.now(), socialSyncAt: 0, cloudOff: false })) await kvSet(k, v);
  if (pet) {
    await db.put('inv', { id: 'pet-probe', kind: 'pet', sp: 'C2', shiny: false, ts: 1 });
    await kvSet('equipped', { C: 'C2' });
    await kvSet('petInst', [{ iid: 'pet-probe', sp: 'C2', shiny: false, morph: 'base', born: 1 }]);
    await kvSet('petEquipped', 'pet-probe');
  }
}
let failures = 0;
for (const [label, pet, backupDue] of [['empty', false, false], ['pet', true, false], ['backup-due', true, true]]) {
  await seed(label, pet, backupDue);
  let snapshotError = null;
  const result = await social.autoSync(async () => {
    try { return await ctx.socialSnapshot(); }
    catch (e) { snapshotError = `${e.name}: ${e.message}`; throw e; }
  }, 'v68');
  const profiles = requests.filter(r => r.path === '/profile');
  if (profiles.length && pet) assert.equal(profiles[0].body.snapshot.pet?.id, 'C2', 'CONTROL equipped pet was actually serialized');
  const pass = profiles.length === 1 && result !== null && (await kvGet('socialSyncAt', 0)) > 0;
  console.log(JSON.stringify({ label, pass, snapshotError, requests: requests.map(r => `${r.method} ${r.path}`) }));
  if (!pass) failures++;
}
// Drive the shipped boot tail and its registered resume callback. UI, timers,
// Health/day refresh and presentation are inert doubles; autoSync and snapshot
// construction remain real. This cannot prove boot reaches the tail in a WebView.
let lifecycle;
if (/^function bindAppLifecycle\(/m.test(app)) lifecycle = source('bindAppLifecycle');
else {
  const start = app.indexOf('  backupNudge();', app.indexOf('async function boot('));
  const end = app.indexOf('  initAnalytics(APP_BUILD)', start);
  assert.ok(start > 0 && end > start, 'legacy boot tail exists');
  lifecycle = 'function bindAppLifecycle() { const NOSOCIAL = S.demo || navigator.webdriver === true;\n' + app.slice(start, end) + '\n}';
}
let resume, pending = [];
const noop = () => {};
Object.assign(ctx, {
  S: { demo: false }, navigator: { webdriver: false }, sheetStack: [],
  social: { ...social,
    autoSync: (...args) => { const p = social.autoSync(...args); pending.push(p); return p; },
    touchServerDay: async () => {}, settleServerDay: async () => {},
  },
  onAppResume: fn => { resume = fn; }, armMidnightTimer: () => ({ rearm: noop }),
  setTimeout: noop, setInterval: noop, backupNudge: noop, nativeAutoSync: noop,
  checkPetLevelUp: noop, checkSieges: noop, presentGrantDelivery: noop,
  cloudTroubleNotice: noop, checkFriendRequests: noop, rollDayIfNeeded: noop,
  drainCookQueue: async () => {}, maybeWelcomeBack: async () => false,
  renderAccountRecovery: () => { throw new Error('unexpected save recovery gate'); }, refresh: noop,
  flushAnalytics: noop, refreshNotifSchedules: noop,
});
if (/^async function guardSaveBeforeInit\(/m.test(app)) {
  vm.runInContext('let saveWitness = { settings: true, loot: true }; let saveRecoveryActive = false; let newPlayerConfirmed = false;\n' + source('guardSaveBeforeInit'), ctx);
}
vm.runInContext("let lifecycleBound = false; const APP_SOCIAL_V = 'v68';\n" + lifecycle, ctx);
await seed('lifecycle', true);
ctx.bindAppLifecycle();
await Promise.all(pending);
for (const label of ['boot', 'resume']) {
  if (label === 'resume') {
    requests = []; pending = [];
    await kvSet('socialSyncAt', 0);
    assert.equal(typeof resume, 'function', 'resume callback registered');
    await resume();
    await Promise.all(pending);
  }
  const pass = requests.filter(r => r.path === '/profile').length === 1;
  console.log(JSON.stringify({ label, pass, requests: requests.map(r => `${r.method} ${r.path}`) }));
  if (!pass) failures++;
}
await seed('control', false);
await social.autoSync(async () => { throw new Error('CONTROL snapshot failure'); }, 'v68');
assert.equal(requests.filter(r => r.path === '/profile').length, 0, 'CONTROL thrown builder never reaches profile');
assert.equal(await kvGet('socialSyncAt', 0), 0, 'CONTROL failed snapshot stays retryable');
console.log('PASS CONTROL: thrown snapshot produces no profile request and no throttle stamp');
process.exitCode = failures ? 1 : 0;
