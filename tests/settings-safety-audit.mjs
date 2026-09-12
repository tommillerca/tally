// Production Settings handlers/templates over mem-idb. No browser or sockets.
// CONTROL cases exercise successful delivery and typed destructive gates.
import './mem-idb.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../js/db.js';
import { restoreTruth, deleteAccount } from '../js/social.js';

globalThis.BroadcastChannel = undefined;
const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
function cut(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `CONTROL production slice missing: ${start}`);
  return source.slice(a, b);
}
function run(code, deps) {
  return new AsyncFunction(...Object.keys(deps), code)(...Object.values(deps));
}
let passed = 0, failed = 0, sequence = 0, abortClear = false;
let events = [], quotaFailure = false, snapshotHook = null, verificationFailure = false, lastDatabase;
const local = new Map();
globalThis.localStorage = {
  get length() { return local.size; }, key: i => [...local.keys()][i] ?? null,
  getItem: key => verificationFailure ? null : local.get(key) ?? null,
  setItem(key, value) {
    events.push('snapshot-write');
    if (quotaFailure) throw new DOMException('full', 'QuotaExceededError');
    local.set(key, String(value));
    snapshotHook?.();
  },
  removeItem: key => local.delete(key),
};
// Inject an actual transaction abort after eraseAll schedules its clears.
const originalOpen = indexedDB.open;
indexedDB.open = (...args) => {
  const request = originalOpen(...args);
  let success;
  Object.defineProperty(request, 'onsuccess', {
    get: () => event => {
      const originalTransaction = request.result.transaction;
      request.result.transaction = (...args) => {
        events.push(`transaction:${args[1]}`);
        const tx = originalTransaction(...args), objectStore = tx.objectStore;
        tx.objectStore = name => {
          const store = objectStore(name), clear = store.clear, put = store.put;
          store.put = value => { events.push('put:' + name); return put(value); };
          store.clear = () => { events.push('clear:' + name); const result = clear(); if (abortClear === true || abortClear === name) tx.abort(); return result; };
          return store;
        };
        return tx;
      };
      lastDatabase = request.result;
      success?.(event);
    },
    set: fn => { success = fn; },
  });
  return request;
};
async function test(name, fn) {
  try {
    D.useDbName(`settings-safety-${++sequence}`);
    events = [];
    await fn(); passed++; console.log(`PASS ${name}`);
  } catch (error) { failed++; console.log(`FAIL ${name}: ${error.message}`); }
  finally { abortClear = false; quotaFailure = false; snapshotHook = null; verificationFailure = false; }
}
function harness(extra = {}) {
  const nodes = new Map(), messages = [], downloads = [];
  let reloads = 0, html = '', sheetOptions;
  const $ = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: '', disabled: false, textContent: '', handlers: {},
      addEventListener(event, fn) { this.handlers[event] = fn; },
      click() { return this.handlers.click?.(); },
    });
    return nodes.get(selector);
  };
  const deps = {
    $, ...D, isNative: () => false,
    toast: message => messages.push(message), refresh() {}, dateKey: () => '2026-09-08',
    Blob, URL: { createObjectURL: () => 'blob:audit', revokeObjectURL() {} },
    document: { createElement: () => ({ click() { downloads.push(this.download); } }) },
    esc: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
    openSheet: (markup, options) => { html = markup; sheetOptions = options; return { isConnected: true }; },
    history: { back: () => sheetOptions?.onClose?.() }, ICONS: { close: () => '' },
    location: { reload: () => { reloads++; } },
    social: { hasCloudBackup: async () => null, hasRecoveryPhrase: async () => false,
      myRecoveryId: async () => null, restoreTruth, forgetIdentity: async () => {},
      deleteAccount: async () => ({ ok: false }) },
    ...extra,
  };
  return { deps, $, messages, downloads, get reloads() { return reloads; }, get html() { return html; } };
}
const exportCode = cut("  $('#exportBtn').addEventListener", "  $('#importBtn').addEventListener");
const eraseCode = cut("  $('#eraseBtn').addEventListener", '  /* Account deletion');
const deleteCode = cut("  $('#delAcctBtn')?.addEventListener", '  // Force-fetch the latest build');

// Refused writes must leave the same sheet operable, with its inputs intact.
for (const site of ['restore', 'recovery', 'cloud', 'fit']) {
  await test('RETRY / ONCE ' + site + ' refused write', async () => {
    let reject = true, attempts = 0, commits = 0, uploads = 0;
    const write = async () => {
      attempts++;
      if (reject) throw new Error('injected write refusal');
      commits++;
      return { ok: true, restored: true, recoveryId: 'test-id' };
    };
    const h = harness({ wrap: {}, el: {}, fit: { id: 'fit-1', name: 'One' },
      S: { settings: {}, sounds: false }, saveRecoveryActive: false, saveWitness: null,
      snapSettings() {}, levelSound() {}, closeAllSheetsViaHistory() {}, route() {},
      renderSettings() {}, APP_SOCIAL_V: 1, deleteFit: write,
      popSound() {}, haptic: { heavy() {} }, renderCharacter() {},
      err: message => { throw new Error('unexpected validation: ' + message); } });
    Object.assign(h.deps.social, { restoreWithPhrase: write, setRecoveryPhrase: write,
      setCloudBackup: write, pushBackup: async () => { uploads++; return true; },
      recoveryIdProblem: () => null, phraseProblem: () => null });
    for (const id of ['#rsCode', '#rcId']) h.$(id).value = 'test-id';
    for (const id of ['#rsPhrase', '#rcPhrase', '#rcPhrase2']) h.$(id).value = 'unchanged phrase';
    const specs = {
      restore: ["  $('#rsGo', wrap).addEventListener", '\n}\n', '#rsGo', 'Restore my Bonehead'],
      recovery: ["  $('#rcSave', wrap).addEventListener", '\n}\n', '#rcSave', 'Save my recovery code'],
      cloud: ["  $('#cbOn', el)?.addEventListener", "  $('#cbOff', el)?.addEventListener", '#cbOn'],
      fit: ["      $('[data-fit-delete-confirm]', review).addEventListener", '\n    }));', '[data-fit-delete-confirm]'],
    };
    const [start, end, selector, label] = specs[site];
    h.deps.review = {};
    await run(cut(start, end), h.deps);
    const btn = h.$(selector), click = () => btn.handlers.click({ currentTarget: btn });
    await click().catch(() => {}); // Grade the stranded control even on the original handler.
    assert.equal(btn.disabled, false, 'refused write must re-enable button');
    assert.match(h.messages.join(' '), /could not|failed/i);
    if (label) assert.equal(btn.textContent, label);
    assert.equal(commits, 0);
    for (const id of ['#rsPhrase', '#rcPhrase', '#rcPhrase2']) assert.equal(h.$(id).value, 'unchanged phrase');
    reject = false;
    const retry = click();
    if (site === 'fit') await click();
    await retry;
    assert.equal(attempts, 2);
    assert.equal(commits, 1);
    if (site === 'cloud') assert.equal(uploads, 1);
    if (site === 'fit') { await click(); assert.equal(commits, 1, 'completed deletion stays locked'); }
  });
}

for (const stage of ['encrypt', 'recoverySetAt', 'recoveryId']) {
  await test('RECOVERY outcome ' + stage + ' and retry', async () => {
    const socialSource = readFileSync(new URL('../js/social.js', import.meta.url), 'utf8');
    const start = socialSource.indexOf('export async function setRecoveryPhrase(');
    const code = socialSource.slice(start, socialSource.indexOf('\nexport async function myRecoveryId', start)).replace('export ', '');
    let refuse = true, requests = 0, records = 0;
    const deps = { phraseProblem: () => null, recoveryIdProblem: () => null,
      apiBase: async () => 'https://audit.invalid', ensureIdentity: async () => {}, backupKey: async () => {},
      kvGet: async () => ({}), phraseKey: async () => ({}), RECOVERY_ITERS: 1,
      enc: new TextEncoder(), u8ToB64: () => 'wrapped',
      crypto: { getRandomValues: a => a, subtle: { encrypt: async () => {
        if (refuse && stage === 'encrypt') throw new Error('crypto refused');
        return new ArrayBuffer(1);
      } } },
      signedFetch: async () => { requests++; return { ok: true }; },
      kvSet: async key => {
        if (refuse && stage === key) throw new Error('local write refused');
        if (key === 'recoveryId') records++;
      } };
    const setRecoveryPhrase = await run(code + '\nreturn setRecoveryPhrase;', deps);
    const h = harness({ wrap: {}, S: {}, levelSound() {}, closeAllSheetsViaHistory() {},
      err: message => { throw new Error(message); } });
    Object.assign(h.deps.social, { setRecoveryPhrase, recoveryIdProblem: () => null, phraseProblem: () => null });
    h.$('#rcId').value = 'test-id';
    h.$('#rcPhrase').value = h.$('#rcPhrase2').value = 'unchanged phrase';
    await run(cut("  $('#rcSave', wrap).addEventListener", '\n}\n'), h.deps);
    await h.$('#rcSave').click();
    assert.equal(h.$('#rcSave').disabled, false);
    assert.equal(h.$('#rcPhrase').value, 'unchanged phrase');
    assert.equal(requests, stage === 'encrypt' ? 0 : 1);
    assert.match(h.messages.join(' '), stage === 'encrypt' ? /not sent to the server/i : /server saved.*could not record/i);
    refuse = false;
    await h.$('#rcSave').click();
    assert.equal(records, 1, 'exactly one completed local credential record');
    assert.equal(requests, stage === 'encrypt' ? 1 : 2, 'retry repeats the existing credential PUT after local failure');
  });
}

await test('EXPORT native does not promise an unverified cloud save', async () => {
  await D.kvSet('cloudOff', true);
  const h = harness({ isNative: () => true });
  await run(exportCode, h.deps); await h.$('#exportBtn').click();
  assert.equal(h.downloads.length, 0);
  assert.equal(await D.kvGet('lastExportAt', null), null);
  assert.doesNotMatch(h.messages.join(' '), /auto-saved|progress is safe/i);
  assert.match(h.messages.join(' '), /web version/i);
});
await test('EXPORT failed storage read reports failure without recording success', async () => {
  await D.kvSet('coins', 125);
  await D.kvSet('coinsHistory', { damaged: true });
  const h = harness();
  await run(exportCode, h.deps);
  await assert.doesNotReject(() => h.$('#exportBtn').click());
  assert.match(h.messages.join(' '), /could not|failed/i);
  assert.equal(h.downloads.length, 0);
  assert.equal(await D.kvGet('lastExportAt', null), null);
});
await test('CONTROL web Export contains every store and records a completed attempt', async () => {
  await D.kvSet('coins', 125);
  await D.db.put('inv', { id: 'earned-crate', kind: 'crate' });
  let payload;
  const h = harness({ URL: { createObjectURL: blob => { payload = blob; return 'blob:audit'; }, revokeObjectURL() {} } });
  await run(exportCode, h.deps); await h.$('#exportBtn').click();
  const data = JSON.parse(await payload.text());
  for (const store of D.STORES) assert.ok(Array.isArray(data[store]));
  assert.equal(data.kv.find(row => row.k === 'coins').v, 125);
  assert.equal(data.inv[0].id, 'earned-crate');
  assert.equal(h.downloads.length, 1);
  assert.ok(await D.kvGet('lastExportAt', 0));
});
await test('SETTINGS recovery copy does not contradict a surviving vault', async () => {
  const code = cut('  const restore = me ?', '  const backupAge =');
  const line = await run(code + '\nreturn restoreLine;', {
    me: {}, myRid: null, recoverySet: false,
    social: { restoreTruth, hasCloudBackup: async () => true },
  });
  assert.doesNotMatch(line, /automatically|brings it back/i);
});
await test('SETTINGS missing phrase does not declare the account permanently lost', async () => {
  const row = cut('    ${me ? `<div class="settings-row" style="margin-top:10px">', '    ${vaultRowHtml(vault)}');
  const html = await run('return `' + row + '`;', { me: {}, recoverySet: false, myRid: null, esc: String });
  assert.doesNotMatch(html, /gone for good/i);
  assert.match(html, /recovery code/i);
});
await test('SETTINGS cloud-off explanation is conditional', async () => {
  const start = source.indexOf('    <p class="note" style="margin:8px 0 0">Your whole save');
  const paragraph = start >= 0 ? source.slice(start, source.indexOf('</p>', start) + 4)
    : cut('    <p class="note" style="margin:8px 0 0">When cloud backup', '</p>') + '</p>';
  const html = await run('return `' + paragraph + '`;', { restoreLine: '', backupOn: false });
  assert.doesNotMatch(html, />Your whole save backs up automatically/i);
  assert.match(html, /when cloud backup is on/i);
});
await test('ERASE aborted transaction retains earnings and offers retry', async () => {
  await D.kvSet('coins', 125);
  const h = harness(); await run(eraseCode, h.deps); await h.$('#eraseBtn').click();
  h.$('#erIn').value = 'ERASE'; abortClear = true;
  await assert.doesNotReject(() => h.$('#erGo').click());
  assert.equal(await D.kvGet('coins'), 125);
  assert.equal(h.reloads, 0); assert.equal(h.$('#erGo').disabled, false);
  assert.match(h.messages.join(' '), /could not|failed/i);
  abortClear = false; await h.$('#erGo').click();
  for (const store of D.STORES) assert.equal((await D.db.all(store)).length, 0);
  assert.equal(h.reloads, 1);
});
await test('DELETE uncertain server result does not claim nothing was deleted', async () => {
  await D.kvSet('coins', 125);
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  await D.kvSet('identity', { privJwk: await crypto.subtle.exportKey('jwk', pair.privateKey), pubJwk: await crypto.subtle.exportKey('jwk', pair.publicKey) });
  await D.kvSet('social', { playerId: 'settings-audit' });
  await D.kvSet('apiBase', 'https://settings-audit.invalid');
  const h = harness(); await run(deleteCode, h.deps); await h.$('#delAcctBtn').click();
  h.deps.social.deleteAccount = deleteAccount;
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://settings-audit.invalid/account/delete');
    assert.equal(options.method, 'POST'); requests++;
    throw new TypeError('response lost after request delivery');
  };
  try { h.$('#daIn').value = 'DELETE'; await h.$('#daGo').click(); }
  finally { globalThis.fetch = originalFetch; }
  assert.equal(requests, 1, 'CONTROL real signed delete reached the transport');
  assert.equal(await D.kvGet('coins'), 125); assert.equal(h.reloads, 0);
  assert.equal(h.$('#daGo').disabled, false);
  assert.doesNotMatch(h.messages.join(' '), /nothing was deleted/i);
  assert.match(h.messages.join(' '), /could not confirm/i);
});
await test('DELETE local abort retries cleanup without deleting the account again', async () => {
  await D.kvSet('coins', 125);
  const h = harness(); let calls = 0;
  h.deps.social.deleteAccount = async () => ({ ok: ++calls === 1 });
  await run(deleteCode, h.deps); await h.$('#delAcctBtn').click();
  h.$('#daIn').value = 'DELETE'; abortClear = true;
  await assert.doesNotReject(() => h.$('#daGo').click());
  assert.equal(await D.kvGet('coins'), 125); assert.equal(h.reloads, 0);
  assert.equal(h.$('#daGo').disabled, false);
  assert.match(h.messages.join(' '), /cloud account.*deleted/i);
  abortClear = false; await h.$('#daGo').click();
  assert.equal(calls, 1); assert.equal(h.reloads, 1);
  for (const store of D.STORES) assert.equal((await D.db.all(store)).length, 0);
});
await test('CONTROL unconfirmed danger actions preserve the save', async () => {
  await D.kvSet('coins', 125);
  const h = harness(); let forgets = 0, deletes = 0;
  h.deps.social.forgetIdentity = async () => { forgets++; };
  h.deps.social.deleteAccount = async () => { deletes++; return { ok: true }; };
  await run(eraseCode + deleteCode, h.deps);
  await h.$('#eraseBtn').click(); await h.$('#erGo').click();
  await h.$('#delAcctBtn').click(); await h.$('#daGo').click();
  assert.equal(await D.kvGet('coins'), 125);
  assert.equal(forgets + deletes + h.reloads, 0);
});

const fileCode = cut('async function importBackupFromFile(file)', '\nasync function openRestoreSheet()');
const summaryCode = source.match(/const STORE_WORDS = [\s\S]*?\nfunction importSummary\(counts\) \{[\s\S]*?\n\}\n/)?.[0];
assert.ok(summaryCode, 'CONTROL production import summary exists');
const importSummary = new Function('STORES', summaryCode + '; return importSummary;')(D.STORES);
function fileHarness() {
  const h = harness({ S: { settings: { targets: {} } }, saveRecoveryActive: false, saveWitness: null,
    snapSettings() {}, hydrateGenericUse: async () => {}, closeAllSheetsViaHistory() {},
    importSummary, STORE_WORDS: { foods: 'custom foods', log: 'food log', weights: 'weigh-ins', kv: 'settings', xp: 'XP', health: 'health', inv: 'inventory' }, route() {} });
  const reviewCode = cut('function openPetDestructionReview(', '\nfunction wireLabLinks(');
  h.deps.openPetDestructionReview = new Function(...Object.keys(h.deps), reviewCode + '; return openPetDestructionReview;')(...Object.values(h.deps));
  return h;
}
function files(h) {
  return new Function(...Object.keys(h.deps), fileCode + '; return { importBackupFromFile, openFileRestorePoints: typeof openFileRestorePoints === "function" ? openFileRestorePoints : null };')(...Object.values(h.deps));
}
async function fixture() {
  await D.kvSet('settings', { targets: {} });
  await D.kvSet('coins', 100);
  const old = await D.exportAll();
  await D.kvBump('coins', 25);
  await D.db.put('inv', { id: 'new-earned-crate', kind: 'crate', name: '<Earned crate>' });
  await D.db.put('foods', { id: 'new-food', name: 'Earned meal', kcal: 250 });
  await D.db.put('log', { id: 'new-log', date: '2026-09-09', name: 'Lunch', kcal: 250 });
  await D.db.put('weights', { date: '2026-09-09', kg: 80 });
  await D.db.put('xp', { key: 'earned-xp', amount: 55 });
  await D.db.put('health', { date: '2026-09-09', steps: 4200 });
  const current = {};
  for (const s of D.STORES) current[s] = await D.db.all(s);
  return { old, current, file: { text: async () => JSON.stringify(old) } };
}
async function assertState(expected) {
  for (const s of D.STORES) assert.deepEqual(await D.db.all(s), expected[s], s + ' must be coherent');
}
async function confirm(h) {
  h.$('#pdIn').value = 'REPLACE';
  await h.$('#pdGo').click();
}
function points() { return [...local.values()].map(v => JSON.parse(v)); }

async function liveFileReview(h, file) {
  await files(h).importBackupFromFile(file);
  assert.match(h.html, /id="pdIn"/);
  assert.match(h.html, /Replace your save with this file/);
  assert.equal(typeof h.$('#pdIn').handlers.input, 'function');
  h.$('#pdIn').value = 'REPLACE';
  h.$('#pdIn').handlers.input();
  assert.equal(h.$('#pdGo').disabled, false);
  console.log('CONTROL ' + JSON.stringify({ opened: true, confirmation: h.$('#pdIn').value, disabled: h.$('#pdGo').disabled }));
}
await test('SENTENCE retention number matches production eviction and observed saves', async () => {
  const f = await fixture(), h = fileHarness();
  await liveFileReview(h, f.file);
  const dbSource = readFileSync(new URL('../js/db.js', import.meta.url), 'utf8');
  const limit = Number(dbSource.match(/for \(const old of points\.slice\((\d+)\)\)/)?.[1]);
  assert.ok(limit > 0, 'production eviction limit must be found');
  for (let i = 0; i < limit + 2; i++) D.saveFileRestorePoint(f.current);
  assert.equal(D.fileRestorePoints().length, limit);
  const sentence = h.html.match(/The last (\w+) restore points are kept on this device; older ones are removed when a new one is saved\./);
  assert.ok(sentence, 'retention sentence missing');
  assert.equal(({ two: 2 })[sentence[1]] ?? Number(sentence[1]), limit);
});
for (const failure of ['throw', 'quota', 'abort', 'after-commit']) {
  await test('RETRY / ONCE file ' + failure, async () => {
    const f = await fixture(), h = fileHarness();
    let attempts = 0, commits = 0, refreshes = 0;
    h.deps.importAll = async (...args) => {
      attempts++;
      if (failure === 'throw' && attempts === 1) throw new Error('forced commit failure');
      const result = await D.importAll(...args);
      commits++;
      return result;
    };
    h.deps.hydrateGenericUse = async () => {
      if (failure === 'after-commit' && ++refreshes === 1) throw new Error('forced refresh failure');
    };
    await liveFileReview(h, f.file);
    quotaFailure = failure === 'quota'; abortClear = failure === 'abort' ? 'inv' : false;
    await h.$('#pdGo').click();
    assert.equal(h.$('#pdIn').value, 'REPLACE');
    assert.equal(h.$('#pdGo').disabled, false, 'refused sheet must remain live');
    if (failure !== 'after-commit') await assertState(f.current);
    quotaFailure = false; abortClear = false;
    const retry = h.$('#pdGo').click();
    await h.$('#pdGo').click(); // Busy guard also covers overlapping presses.
    await retry;
    assert.equal(attempts, ['throw', 'abort'].includes(failure) ? 2 : 1, 'retry reaches the handler without repeating an applied import');
    assert.equal(commits, 1, 'exactly one successful database commit');
    assert.equal(await D.kvGet('coins'), 100);
    await h.$('#pdGo').click();
    assert.equal(commits, 1, 'finished guard prevents another commit');
    console.log('ONCE ' + JSON.stringify({ failure, attempts, commits }));
  });
}

await test('CONTROL file import refuses malformed JSON and damaged stores without losing earnings', async () => {
  await D.kvSet('coins', 125);
  await D.db.put('inv', { id: 'earned-crate', kind: 'crate' });
  const h = fileHarness();
  for (const text of ['bad json', JSON.stringify({ app: 'tally', log: [], inv: {} })]) {
    await run(fileCode + '\nawait importBackupFromFile(file);', { ...h.deps, file: { text: async () => text } });
    assert.equal(await D.kvGet('coins'), 125);
    assert.equal((await D.db.all('inv'))[0].id, 'earned-crate');
  }
  assert.match(h.messages[0], /doesn't look like/i);
  assert.match(h.messages[1], /damaged/i);
});

await test('FILE real losses are disclosed before any write; cancel preserves every store', async () => {
  const f = await fixture(), h = fileHarness();
  events = [];
  await files(h).importBackupFromFile(f.file);
  assert.match(h.html, /Coins<\/b>: 125 → 100 \(25 lost\)/);
  assert.match(h.html, /inventory: 1 → 0/);
  assert.match(h.html, /&lt;Earned crate&gt;/);
  assert.doesNotMatch(h.html, /<Earned crate>/);
  assert.ok(!events.some(e => /snapshot-write|put:|clear:|transaction:readwrite/.test(e)), events.join(', '));
  await h.$('#pdGo').click(); // No typed acknowledgement.
  await assertState(f.current);
});
await test('FILE verified snapshot exists before replacement transaction opens', async () => {
  const f = await fixture(), h = fileHarness(), start = local.size;
  await files(h).importBackupFromFile(f.file);
  events = [];
  await confirm(h);
  assert.equal(local.size, start + 1, 'a durable restore point must exist');
  const write = events.indexOf('snapshot-write'), transaction = events.indexOf('transaction:readwrite');
  assert.ok(write >= 0 && transaction > write, events.join(', '));
  for (const s of D.STORES) assert.deepEqual(points().at(-1).data[s], f.current[s]);
  assert.equal(await D.kvGet('coins'), 100);
  assert.equal((await D.db.all('inv')).length, 0);
  assert.match(h.messages.join(' '), /Settings.*Restore points/);
});
await test('FILE persisted restore-point UI returns every store to the pre-import state', async () => {
  const f = await fixture(), h = fileHarness();
  await files(h).importBackupFromFile(f.file); await confirm(h);
  // Fresh handler/harness models reopening Settings after app restart.
  const fresh = fileHarness(), api = files(fresh);
  assert.equal(typeof api.openFileRestorePoints, 'function', 'recovery must be reachable after restart');
  await api.openFileRestorePoints();
  assert.match(fresh.html, /Review save from/);
  await fresh.$('[data-file-point="0"]').click();
  await confirm(fresh);
  await assertState(f.current);
  assert.equal(fresh.reloads, 1);
  assert.ok(D.fileRestorePoints().length === 2, 'undo must also keep the save being left');
});
await test('FILE aborted replacement leaves exactly the old state and a valid restore point', async () => {
  const f = await fixture(), h = fileHarness(), start = local.size;
  abortClear = 'inv'; // Abort after the other six stores have staged clears and puts.
  await files(h).importBackupFromFile(f.file); await confirm(h);
  assert.equal(local.size, start + 1, 'abort must retain the restore point');
  await assertState(f.current);
  for (const s of D.STORES) assert.deepEqual(points().at(-1).data[s], f.current[s]);
  assert.match(h.messages.join(' '), /failed/i);
  assert.doesNotMatch(h.messages.join(' '), /Backup restored/);
});
await test('FILE snapshot quota failure blocks replacement before its transaction', async () => {
  const f = await fixture(), h = fileHarness();
  quotaFailure = true; events = [];
  await files(h).importBackupFromFile(f.file); await confirm(h);
  assert.ok(!events.includes('transaction:readwrite'), events.join(', '));
  await assertState(f.current);
  assert.match(h.messages.join(' '), /restore point.*storage is full or unavailable/i);
  assert.doesNotMatch(h.messages.join(' '), /Backup restored/);
});
await test('FILE progress earned during review refuses a stale confirmation', async () => {
  const f = await fixture(), h = fileHarness();
  await files(h).importBackupFromFile(f.file);
  await D.kvBump('coins', 9);
  await confirm(h);
  assert.equal(await D.kvGet('coins'), 134);
  assert.equal((await D.db.all('inv')).length, 1);
  assert.match(h.messages.join(' '), /save changed after the review/i);
});
await test('FILE unreadable snapshot verification blocks the import transaction', async () => {
  const f = await fixture(), h = fileHarness();
  verificationFailure = true; events = [];
  await files(h).importBackupFromFile(f.file); await confirm(h);
  assert.ok(!events.includes('transaction:readwrite'), events.join(', '));
  await assertState(f.current);
  assert.match(h.messages.join(' '), /Could not save a restore point/);
});
await test('FILE payout queued after snapshot persists is checked under the import lock', async () => {
  const f = await fixture(), h = fileHarness();
  let payout;
  await files(h).importBackupFromFile(f.file);
  snapshotHook = () => {
    // Model another connection's already-open payout transaction, queued ahead
    // of the importer. The shared mem-idb lock decides their actual order.
    const tx = lastDatabase.transaction(['inv'], 'readwrite');
    tx.objectStore('inv').put({ id: 'racing-reward', kind: 'crate' });
    payout = new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = reject; });
  };
  await confirm(h); await payout;
  assert.equal(await D.kvGet('coins'), 125);
  assert.equal((await D.db.all('inv')).length, 2);
  assert.match(h.messages.join(' '), /save changed after the review/i);
});
await test('FILE undo quota failure preserves the imported state and original point', async () => {
  const f = await fixture(), h = fileHarness();
  const api = files(h);
  await api.importBackupFromFile(f.file); await confirm(h);
  const imported = {};
  for (const s of D.STORES) imported[s] = await D.db.all(s);
  assert.equal(typeof api.openFileRestorePoints, 'function');
  await api.openFileRestorePoints(); await h.$('[data-file-point="0"]').click();
  quotaFailure = true; events = [];
  await confirm(h);
  assert.ok(!events.includes('transaction:readwrite'), events.join(', '));
  await assertState(imported);
  assert.equal(D.fileRestorePoints().length, 1);
});
await test('FILE repeated imports retain older points; ERASE removes points only after success', async () => {
  const f = await fixture(), h = fileHarness();
  await files(h).importBackupFromFile(f.file); await confirm(h);
  await files(h).importBackupFromFile(f.file); await confirm(h);
  assert.equal(D.fileRestorePoints?.().length, 2, 'successive points must not overwrite each other');
  abortClear = true;
  await assert.rejects(() => D.eraseAll());
  assert.equal(D.fileRestorePoints().length, 2);
  abortClear = false; await D.eraseAll();
  assert.equal(D.fileRestorePoints().length, 0);
});

// Same measured fixture as the original RED; do not auto-confirm the review.
if (process.argv.includes('--observe-replacement')) {
  D.useDbName(`settings-replacement-${++sequence}`);
  const f = await fixture(), h = fileHarness();
  const before = { coins: await D.kvGet('coins'), inventory: (await D.db.all('inv')).length };
  await files(h).importBackupFromFile(f.file);
  console.log('OBSERVED file replacement: ' + JSON.stringify({ before,
    after: { coins: await D.kvGet('coins'), inventory: (await D.db.all('inv')).length },
    review: /Type REPLACE/.test(h.html), messages: h.messages }));
}
console.log(`settings-safety: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
