// R54-4: real database wrapper and boot/render functions, with a minimal DOM.
// No browser or sockets. Pixel visibility remains unrun; assert the reveal
// classes against the shipped CSS and require actual non-empty screen markup.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import './mem-idb.mjs';
import { db, kvGet, kvSet, useDbName, storageStatus } from '../js/db.js';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const app = read('../js/app.js');
const start = app.indexOf('function renderAccountRecovery(');
const end = app.indexOf('\n/* DAY ROLLOVER', start);
assert.ok(start > 0 && end > start, 'boot/render source boundaries exist');
const bootSource = app.slice(start, end);
const markBooted = app.match(/^const markBooted = .*;$/m)?.[0];
assert.ok(markBooted, 'use the real boot latch');
assert.match(app, /import \{[^}]*\bstorageStatus\b[^}]*\} from '\.\/db\.js'/);
assert.match(read('../app.css'), /\.screen\.screen-in\s*\{\s*opacity:\s*1;/);
assert.match(read('release-gate.mjs'), /PURE\.push\('storage-boot-audit\.mjs'\)/);

function node() {
  return { innerHTML: '', classList: new Set(), style: {}, hidden: false,
    handlers: {}, addEventListener(event, fn) { this.handlers[event] = fn; } };
}

async function runBoot(failedStorage) {
  const elements = new Map(['#screen', '#tabbar', '#gearBtn'].map(id => [id, node()]));
  const screen = elements.get('#screen');
  const root = node();
  let setupCalls = 0, reloads = 0;
  const setup = () => {
    setupCalls++;
    assert.equal(failedStorage, false, 'failed storage must stop before setup');
  };
  const context = vm.createContext({
    db, kvGet, kvSet, useDbName, storageStatus,
    S: { demo: false, settings: null }, saveWitness: {},
    saveRecoveryActive: false, saveRecoveryStatus: 'unknown',
    document: { documentElement: root },
    $: id => {
      if (elements.has(id)) return elements.get(id);
      if (!screen.innerHTML.includes(`id="${id.slice(1)}"`)) return null;
      const el = node(); elements.set(id, el); return el;
    },
    location: { protocol: 'file:', reload() { reloads++; } },
    navigator: { webdriver: true }, sessionStorage: { getItem: () => null },
    ERASED_FLAG: 'erased',
    /* L6 landed save-disclosure wiring inside boot(). This audit evaluates
       boot's SOURCE in a vm context, so every new collaborator it calls has
       to be registered here or the boot throws for a reason that has nothing
       to do with storage. Stubs only: they must not make the storage
       assertions below pass on their own. */
    takeSaveInterruption: () => null,
    interruptionCopy: () => 'interrupted',
    writeFailureCopy: () => 'write failed',
    storageIsFull: () => false,
    toast: setup,
    lastWriteFailToast: 0,
    WRITE_FAIL_QUIET_MS: 0,
    snapSettings: setup, hydrateGenericUse: setup,
    requestPersistence: async () => { setup(); return false; },
    trackEvent: setup, watchForWipe: setup, onWriteFailure: setup,
    setHaptics: setup, wornAura: async () => null,
    equipped: async () => ({}), showSplash: setup,
    social: { onSyncTrouble: setup, onResponseFailure: setup, initFromQuery: setup, recoveryStatus: async () => 'unknown' },
  });
  await assert.doesNotReject(async () => vm.runInContext(
    `${markBooted}\n${bootSource}\nboot();`, context), 'boot must resolve without an escaping exception');
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(screen.innerHTML.replace(/<[^>]*>/g, '').trim().length > 0, 'screen has readable text');
  assert.ok(screen.classList.has('screen-in'), 'screen is revealed');
  assert.ok(root.classList.has('booted'), 'boot latch is set');
  assert.equal(elements.get('#tabbar').style.display, 'none');
  assert.equal(elements.get('#gearBtn').hidden, true);
  if (failedStorage) {
    assert.match(screen.innerHTML, /Storage is unavailable/);
    assert.match(screen.innerHTML, /local storage for saved progress/);
    assert.match(screen.innerHTML, /cannot continue until storage is available/);
    assert.equal(setupCalls, 0);
    elements.get('#storageRetry').handlers.click();
    assert.equal(reloads, 1, 'reload is actionable without storage');
  } else {
    assert.ok(setupCalls > 0, 'CONTROL: normal boot continues through setup');
    assert.match(screen.innerHTML, /NEW HERE\?/);
    assert.doesNotMatch(screen.innerHTML, /Storage is unavailable|storageRetry/,
      'CONTROL: normal boot must not disclose a storage failure');
  }
}

const normalIdb = globalThis.indexedDB;
const unhandled = [];
const onUnhandled = error => unhandled.push(error);
process.on('unhandledRejection', onUnhandled);
try {
  let opens = 0;
  const error = new DOMException('Site data is blocked', 'SecurityError');
  globalThis.indexedDB = { open() { opens++; throw error; } };
  useDbName('storage-boot-throws');
  await runBoot(true);
  assert.equal(opens, 1, 'the throwing open was exercised');
  assert.deepEqual(await storageStatus(), { ok: false, error }, 'failure is a value');
  await assert.rejects(db.put('kv', { k: 'must-not-save', v: true }),
    error, 'ordinary writes still reject');
  console.log('PASS THROW: disclosed, revealed, booted, reload works, no setup');

  globalThis.indexedDB = undefined;
  useDbName('storage-boot-missing');
  await runBoot(true);
  console.log('PASS MISSING: unavailable IndexedDB is disclosed');

  globalThis.indexedDB = { open() {
    const request = { error };
    queueMicrotask(() => request.onerror());
    return request;
  } };
  useDbName('storage-boot-async-error');
  await runBoot(true);
  console.log('PASS ASYNC: open request failure is disclosed');

  globalThis.indexedDB = normalIdb;
  useDbName('storage-boot-control');
  await kvSet('dayOneEquipFix', true);
  await runBoot(false);
  assert.deepEqual(await storageStatus(), { ok: true });
  assert.deepEqual(unhandled, [], 'no unhandled rejection escapes');
  console.log('PASS CONTROL: normal boot renders without storage disclosure');
  console.log('4 passed, 0 failed. Browser and socket checks unrun.');
} finally {
  globalThis.indexedDB = normalIdb;
  process.off('unhandledRejection', onUnhandled);
}
