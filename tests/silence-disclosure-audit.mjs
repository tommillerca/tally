// L6: real DB guard and shipped boot/notification functions, no sockets or browser.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as notices from '../js/save-disclosure.js';
import { db, kvGet, kvSet, kvUpdate, useDbName, onWriteFailure } from '../js/db.js';

const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const memory = new Map();
globalThis.sessionStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
};
let failure = null, hold = false;
const realOpen = indexedDB.open;
indexedDB.open = (...args) => {
  const req = realOpen(...args);
  let success;
  Object.defineProperty(req, 'onsuccess', {
    set(fn) { success = fn; },
    get() { return event => {
      const transaction = req.result.transaction;
      req.result.transaction = (...a) => {
        if (a[1] === 'readwrite' && failure) throw failure;
        if (a[1] === 'readwrite' && hold) return { objectStore: () => ({ put: () => ({}) }) };
        return transaction(...a);
      };
      success?.(event);
    }; },
  });
  return req;
};
useDbName('silence-disclosure');

function section(start, end) {
  const a = app.indexOf(start), b = app.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `missing production section ${start}`);
  return app.slice(a, b);
}
function ui(extra = {}) {
  const classes = new Set(), timers = new Map(), paints = [];
  let id = 0;
  const el = {
    hidden: true, dataset: {},
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle(c, on) { on ? classes.add(c) : classes.delete(c); } },
    set textContent(text) { this.text = text; paints.push({ text, severity: this.dataset.severity, error: classes.has('toast-error') }); },
    get textContent() { return this.text; },
  };
  const c = vm.createContext({
    ...notices, sessionStorage, kvGet, onWriteFailure, $: () => el, reducedMotion: true,
    trackEvent() {}, lastWriteFailToast: -Infinity, WRITE_FAIL_QUIET_MS: 8000,
    setTimeout(fn) { timers.set(++id, fn); return id; }, clearTimeout(i) { timers.delete(i); },
    ...extra,
  });
  vm.runInContext(section('function storageIsFull(', '\nasync function guardSaveBeforeInit'), c);
  vm.runInContext(section('let toastTimer = 0;', '/* Test hook (webdriver only)'), c);
  return { c, el, paints, timers, drain() {
    let n = 0;
    while (timers.size) {
      assert.ok(++n < 150, 'toast queue did not drain');
      const [i, fn] = timers.entries().next().value; timers.delete(i); fn();
    }
  } };
}
function boot(u) {
  vm.runInContext(section('  const interruptedSave = takeSaveInterruption();', '  saveWitness.settings ||= !!S.settings;'), u.c);
}
async function unfinished(u) {
  await vm.runInContext(`(async () => {${section('  const interruptedFight =', '\n  /* FIRST PAINT')}})()`, u.c);
}
function errorPaint(u, pattern) {
  assert.ok(u.paints.some(p => p.error && p.severity === 'error' && pattern.test(p.text)), JSON.stringify(u.paints));
}
let passed = 0, failed = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (e) { failed++; console.error(`FAIL ${name}: ${e.stack}`); }
}

await check('CONTROL normal session saves and returns with no error-shaped disclosure', async () => {
  const u = ui(); boot(u);
  await kvSet('coins', 25);
  await db.put('log', { id: 'normal', date: '2026-09-08', kcal: 100 });
  assert.equal((await db.get('log', 'normal')).kcal, 100, 'CONTROL really saved');
  const returned = ui(); boot(returned); await unfinished(returned);
  assert.equal(returned.paints.length, 0);
  vm.runInContext("toast('Meal saved')", returned.c);
  assert.equal(returned.paints[0].severity, 'status');
  assert.equal(returned.paints[0].error, false);
});
await check('ordinary claim refusals leave no failed-save journal or disclosure', async () => {
  const u = ui(); boot(u);
  const refused = Object.assign(new Error('already claimed'), { refused: true });
  await assert.rejects(kvUpdate('coins', () => { throw refused; }), e => e === refused);
  assert.equal(u.paints.length, 0);
  assert.equal(notices.takeSaveInterruption(), null);
});
await check('generic write failure still speaks when telemetry throws', async () => {
  const u = ui({ trackEvent() { throw new Error('telemetry unavailable'); } }); boot(u);
  failure = new Error('save transaction failed');
  await assert.rejects(kvSet('coins', 99), /save transaction failed/);
  failure = null;
  errorPaint(u, /progress did not save.*export a backup/);
  notices.takeSaveInterruption();
});
await check('write failure is error-shaped, preempts routine traffic and survives 108 routine mutations', async () => {
  const u = ui(); boot(u);
  vm.runInContext("toast('Routine message')", u.c);
  failure = new DOMException('Failed to write blobs (IOError)', 'DataError');
  const expected = failure;
  await assert.rejects(db.put('inv', { id: 'lost-gear' }), e => e === expected);
  failure = null;
  assert.equal(await db.get('inv', 'lost-gear'), undefined, 'the failed row did not land');
  errorPaint(u, /out of storage.*did not save/);
  vm.runInContext('for (let i = 0; i < 108; i++) toast(`Routine ${i}`)', u.c);
  assert.equal(u.el.dataset.severity, 'error', 'routine traffic displaced the failure');
  u.drain();
  assert.equal(u.paints.filter(p => p.error).length, 1);
  assert.ok(u.paints.filter(p => !p.error).length <= 5, 'routine backlog exceeded four plus initial paint');
});
await check('failed save remains disclosed on return even if later writes succeed', async () => {
  await kvSet('coins', 26);
  const u = ui(); boot(u);
  errorPaint(u, /last session ended after a save failed/);
});
await check('quiet bookkeeping failures do not announce or recurse', async () => {
  const u = ui(); boot(u);
  failure = new Error('disk unavailable');
  await assert.rejects(kvSet('evq', []));
  await assert.rejects(kvSet('lastOpenDay', '2026-09-08'));
  failure = null;
  assert.equal(u.paints.length, 0);
});
await check('interrupted fight and food entry are disclosed from persisted evidence on any return route', async () => {
  await kvSet('pitFight', { phase: 'open', foe: 'Rattles', at: 123 });
  await kvSet('addDraft', { ts: Date.now(), q: 'rice' });
  const u = ui(); await unfinished(u);
  errorPaint(u, /fight against Rattles.*Open the Pit.*food entry was open.*Check Today/);
  const again = ui(); await unfinished(again);
  assert.equal(again.paints.length, 0, 'unchanged action was nagged about again');
  await kvSet('pitFight', null); await kvSet('addDraft', null);
  const done = ui(); await unfinished(done);
  assert.equal(done.paints.length, 0);
});
await check('stale drafts and settled fights are normal, not interrupted sessions', () => {
  assert.equal(notices.interruptionCopy({ fight: { phase: 'lost' }, draft: { ts: 0, q: 'rice' }, now: 86400001 }), '');
});
await check('confirmed erase is error-shaped and consumed once', () => {
  const u = ui({ ERASED_FLAG: 'tally-erased' });
  sessionStorage.setItem('tally-erased', '1');
  const code = section('  try {\n    if (sessionStorage.getItem(ERASED_FLAG))', '  S.sounds =');
  vm.runInContext(code, u.c);
  errorPaint(u, /Wardrobe.*erased.*Restore an account or backup file/);
  const returned = ui({ ERASED_FLAG: 'tally-erased' }); vm.runInContext(code, returned.c);
  assert.equal(returned.paints.length, 0);
});
await check('queued errors survive routine backlog pressure and normal exit animation callbacks', () => {
  const u = ui({ reducedMotion: false });
  vm.runInContext("toast('Routine message')", u.c);
  // Enter the 180ms exit animation, then interrupt it with a failed save.
  const [i, expire] = u.timers.entries().next().value; u.timers.delete(i); expire();
  vm.runInContext("toast(writeFailureCopy(false), 8000, { error: true }); toast(ERASED_COPY, 8000, { error: true }); for (let i = 0; i < 108; i++) toast(`Routine ${i}`)", u.c);
  u.drain();
  errorPaint(u, /progress did not save/);
  errorPaint(u, /Wardrobe.*erased/);
  assert.equal(u.paints.filter(p => p.error).length, 2);
});
await check('an interrupted in-flight write discloses uncertainty on return', async () => {
  // A fresh module reads the real DB guard's journal, like a new page.
  const fresh = await import('../js/save-disclosure.js?return');
  notices.takeSaveInterruption();
  hold = true;
  void db.put('log', { id: 'interrupted' });
  await new Promise(resolve => setImmediate(resolve));
  hold = false;
  // The original promise never settles, modelling termination before its callback.
  assert.equal(sessionStorage.getItem('tally-save-state'), 'pending');
  const returned = ui({ takeSaveInterruption: fresh.takeSaveInterruption }); boot(returned);
  errorPaint(returned, /ended before a save was confirmed.*Check your saved progress/);
});
await check('refused session storage does not prevent the live failure disclosure', () => {
  const saved = globalThis.sessionStorage;
  globalThis.sessionStorage = { setItem() { throw Error('denied'); }, removeItem() { throw Error('denied'); }, getItem() { throw Error('denied'); } };
  try {
    const token = notices.beginSave(); notices.finishSave(token);
    assert.equal(notices.takeSaveInterruption(), null);
    const u = ui(); boot(u);
    vm.runInContext(`toast(writeFailureCopy(false), 8000, { error: true })`, u.c);
    errorPaint(u, /progress did not save.*export a backup/);
  } finally { globalThis.sessionStorage = saved; }
});

onWriteFailure(null);
console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
