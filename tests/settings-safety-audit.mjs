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
// Inject an actual transaction abort after eraseAll schedules its clears.
const originalOpen = indexedDB.open;
indexedDB.open = (...args) => {
  const request = originalOpen(...args);
  let success;
  Object.defineProperty(request, 'onsuccess', {
    get: () => event => {
      const originalTransaction = request.result.transaction;
      request.result.transaction = (...args) => {
        const tx = originalTransaction(...args), objectStore = tx.objectStore;
        tx.objectStore = name => {
          const store = objectStore(name), clear = store.clear;
          store.clear = () => { const result = clear(); if (abortClear) tx.abort(); return result; };
          return store;
        };
        return tx;
      };
      success?.(event);
    },
    set: fn => { success = fn; },
  });
  return request;
};
async function test(name, fn) {
  try {
    D.useDbName(`settings-safety-${++sequence}`);
    await fn(); passed++; console.log(`PASS ${name}`);
  } catch (error) { failed++; console.log(`FAIL ${name}: ${error.message}`); }
  finally { abortClear = false; }
}
function harness(extra = {}) {
  const nodes = new Map(), messages = [], downloads = [];
  let reloads = 0, html = '';
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
    openSheet: markup => { html = markup; return {}; }, ICONS: { close: () => '' },
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
  return harness({ S: { settings: { targets: {} } }, saveRecoveryActive: false, saveWitness: null,
    snapSettings() {}, hydrateGenericUse: async () => {}, closeAllSheetsViaHistory() {},
    importSummary, route() {} });
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

// Optional observation of the unresolved replacement policy. It is reported,
// not graded as desirable behavior or silently converted into a merge.
if (process.argv.includes('--observe-replacement')) {
  D.useDbName(`settings-replacement-${++sequence}`);
  await D.kvSet('settings', { targets: {} });
  await D.kvSet('coins', 100);
  const old = await D.exportAll();
  await D.kvBump('coins', 25);
  await D.db.put('inv', { id: 'new-earned-crate', kind: 'crate' });
  const before = { coins: await D.kvGet('coins'), inventory: (await D.db.all('inv')).length };
  assert.equal(before.coins, 125); assert.equal(before.inventory, 1);
  const h = fileHarness();
  await run(fileCode + '\nawait importBackupFromFile(file);', { ...h.deps, file: { text: async () => JSON.stringify(old) } });
  console.log('OBSERVED file replacement: ' + JSON.stringify({ before,
    after: { coins: await D.kvGet('coins'), inventory: (await D.db.all('inv')).length }, messages: h.messages }));
}
console.log(`settings-safety: ${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
