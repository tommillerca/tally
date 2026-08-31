/* tests/backup-key-audit.mjs — TWO DEVICES, ONE ACCOUNT, ONE BACKUP KEY.
 *
 * THE BUG CHAIN THIS GRADES (total-loss class, found 2026-08-31 in source):
 *
 *   1. js/social.js pushBackup snapshotted via exportAll() BEFORE
 *      encryptBackup() lazily minted the AES key into kv 'identity'
 *      (backupKey()), so a device's FIRST-EVER blob embedded an identity row
 *      WITHOUT aesJwk.
 *   2. js/db.js importAll filtered DEVICE_KV (which includes 'identity') only
 *      under `replace`. The cloud pull is a MERGE (pullBackup replace:false)
 *      where the payload always won, so a second device restoring by phrase
 *      had its good identity (WITH aesJwk) overwritten by the blob's keyless
 *      one.
 *   3. That device lazily minted a FRESH aesJwk on its next push.
 *   4. The two devices now encrypt under DIFFERENT keys. The cloud copy's
 *      decryptability flips with whoever pushed last, and a phrase restore
 *      against the wrong-key blob reported "no save to pull" while the data
 *      sat on the server unreadable.
 *
 * THE FIX, three links, each pinned by its own row below:
 *   - pushBackup awaits backupKey() BEFORE exportAll (FIRSTBLOB, SRC-PUSH)
 *   - importAll's merge path never lets a payload overwrite a device key the
 *     device already holds (MERGEGUARD, SRC-MERGE), while payload-wins stays
 *     intact for non-device keys (MERGEWINS) and a device key the device does
 *     NOT hold still lands, keeping fresh-install behaviour byte-identical
 *     (MERGEFRESH)
 *   - a decrypt failure is named 'decrypt' instead of being laundered into a
 *     generic reason, so neither surface can present it as "no save" or a
 *     network blip (DECRYPT, SRC-REASON, SRC-BOOT, SRC-RESTORE, SRC-ADOPT)
 *
 * HOW IT RUNS. Node only, no browser: a minimal in-memory IndexedDB shim
 * (structured-clone faithful, journal commit on a macrotask, rollback on
 * abort — exactly the properties importAll's transaction discipline leans on)
 * plus an in-memory /register + /backup API behind globalThis.fetch, under
 * the REAL js/social.js and js/db.js. Two devices are two dbNames through
 * useDbName(), which is what separates their kv stores in the real app too.
 * Source-structure rows follow the pet-pool-audit precedent: the behavioural
 * rows prove the mechanism, the SRC rows pin the shape so the NEXT rewrite of
 * pushBackup / importAll / the two toasts fails by name.
 *
 * WHAT EACH ROW GRADES, and which direction is failure:
 *   SETUP       the fake server really received device A's PUT /backup.
 *               Failure is ZERO: an empty sample set is never a pass.
 *   FIRSTBLOB   the FIRST blob a fresh device ever pushes embeds kv 'identity'
 *               WITH aesJwk. Failure is a keyless identity in the ciphertext.
 *   MERGEGUARD  importAll(replace:false) never overwrites kv 'identity' on a
 *               device that has one. Failure is the payload's identity landing.
 *   MERGEWINS   control: a non-device key ('coins') in the same merge payload
 *               still wins. Failure is the documented payload-wins semantics
 *               quietly lost.
 *   MERGEFRESH  control: a DEVICE_KV key the device does NOT hold ('cloudOff')
 *               still lands from the payload, so the pre-fix fresh-install
 *               outcome is unchanged. Failure is the guard over-reaching.
 *   ROUNDTRIP   the full two-device chain over the real functions: A pushes,
 *               B adopts A's identity bundle (what a phrase restore installs)
 *               and pulls A's save, B pushes, A pulls and CAN STILL DECRYPT.
 *               KEYSTABLE inside it: B's aesJwk after the pull is byte-equal
 *               to A's, i.e. no re-mint ever happened.
 *   DECRYPT     a blob written under a different key comes back
 *               { restored:false, reason:'decrypt' } — not 'none' (the "no
 *               save" lie), not a laundered exception string — and the local
 *               save is untouched. Nothing is written server-side: the device
 *               holding the good key re-pushes daily and self-heals the cloud
 *               copy; the unrecoverable case is a phrase-only restore against
 *               a poisoned blob, which is exactly why the reason must be
 *               honest.
 *   SRC-*       source rows pinning the fix shape: backupKey() before
 *               exportAll() inside pushBackup; the !replace DEVICE_KV filter
 *               inside importAll; reason:'decrypt' inside pullBackup;
 *               adoptIdentity forwarding pullReason; the boot toast branching
 *               on reason === 'decrypt'; both adoptIdentity surfaces (phrase
 *               restore, vault adopt) branching on pullReason === 'decrypt'.
 *
 * PROVE-RED, 2026-08-31, against a cp -R snapshot of this tree taken BEFORE
 * the fix (origin/main 61249c4b, js/ + data/ only), this exact file copied in
 * and run there: 12 of 24 rows red, the SETUP premise and all three merge
 * controls green, so a green run is grading something. Measured output:
 *   FAIL FIRSTBLOB   aesJwk MISSING: the poisoned first blob
 *   FAIL MERGEGUARD  d=BLOB aes=missing (payload identity landed)
 *   ok   MERGEWINS / MERGEFRESH / SETUP x4  (controls green pre-fix)
 *   FAIL KEYSTABLE   no aesJwk on B (blob1's keyless identity overwrote B's
 *                    good one on the pull; the fresh mint follows on B's push)
 *   FAIL ROUNDTRIP   A pulls after B's push: restored=false, reason="The
 *                    operation failed for an operation-specific reason"
 *   FAIL ROUNDTRIP   B's row arrived on A (A could not ingest blob2 at all)
 *   FAIL DECRYPT     reason was that same laundered OperationError string,
 *                    not 'decrypt'
 *   FAIL SRC-PUSH    no backupKey() call in pushBackup
 *   FAIL SRC-MERGE / SRC-REASON / SRC-ADOPT / SRC-BOOT / SRC-RESTORE
 *                    (fix shapes absent from source; 0 surfaces found)
 * And the half-applied fix was caught too: with the merge filter computed but
 * the put loop still reading data.kv (the exact state a lost edit left this
 * tree in mid-review), MERGEGUARD alone went red while ROUNDTRIP stayed
 * green, which is why MERGEGUARD is its own row and not folded into it.
 *
 *   node tests/backup-key-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let bad = 0;
const ok = (l, pass, d = '') => { console.log(`${pass ? 'ok  ' : 'FAIL'} ${l}${d ? '  | ' + d : ''}`); if (!pass) bad++; };

/* =================== in-memory IndexedDB, just enough =====================
   Faithful in the four properties the code under test leans on:
   - rows are structured-clone copies on write AND read (a shared reference
     would let backupKey()'s in-place `id.aesJwk = ...` retroactively edit an
     already-exported snapshot and HIDE the first-blob bug);
   - writes journal and commit on a macrotask, so puts dispatched
     synchronously inside one transaction land together;
   - tx.abort() discards the journal (importAll's rollback guarantee);
   - request callbacks fire on microtasks, before the commit macrotask, so
     kvUpdate's get-then-put lands inside its transaction. */
const DATABASES = new Map();
const clone = v => structuredClone(v);
function makeTx(rec) {
  const journal = [];
  const tx = { error: null, oncomplete: null, onerror: null, onabort: null, _aborted: false };
  tx.abort = () => { tx._aborted = true; };
  tx.objectStore = (name) => {
    const st = rec.stores.get(name);
    const req = () => ({ onsuccess: null, onerror: null, result: undefined, error: null });
    const later = (r, fn) => { queueMicrotask(() => { if (tx._aborted) return; r.result = fn(); if (r.onsuccess) r.onsuccess({ target: r }); }); return r; };
    const staged = k => { // committed state + this tx's own journal
      let v = st.rows.has(k) ? st.rows.get(k) : undefined;
      for (const j of journal) {
        if (j.st !== st) continue;
        if (j.type === 'clear') v = undefined;
        else if (j.k === k) v = j.type === 'put' ? j.v : undefined;
      }
      return v;
    };
    return {
      get: k => later(req(), () => { const v = staged(k); return v === undefined ? undefined : clone(v); }),
      getAll: () => later(req(), () => {
        const keys = new Set(st.rows.keys());
        for (const j of journal) if (j.st === st) { if (j.type === 'clear') keys.clear(); else if (j.type === 'put') keys.add(j.k); else keys.delete(j.k); }
        return [...keys].map(k => clone(staged(k)));
      }),
      count: () => later(req(), () => st.rows.size),
      put: v => { const k = v[st.keyPath]; if (k === undefined) throw new DOMException('no key', 'DataError'); journal.push({ st, type: 'put', k, v: clone(v) }); return later(req(), () => k); },
      add: v => {
        const k = v[st.keyPath]; const r = req();
        queueMicrotask(() => {
          if (tx._aborted) return;
          if (staged(k) !== undefined) {
            r.error = new DOMException('exists', 'ConstraintError');
            const e = { target: r, _pd: false, preventDefault() { this._pd = true; }, stopPropagation() {} };
            if (r.onerror) r.onerror(e);
            if (!e._pd) { tx._aborted = true; tx.error = r.error; }
          } else { journal.push({ st, type: 'put', k, v: clone(v) }); r.result = k; if (r.onsuccess) r.onsuccess({ target: r }); }
        });
        return r;
      },
      delete: k => { journal.push({ st, type: 'del', k }); return later(req(), () => undefined); },
      clear: () => { journal.push({ st, type: 'clear' }); return later(req(), () => undefined); },
      index: () => { throw new Error('index not shimmed'); },
    };
  };
  setTimeout(() => {
    if (tx._aborted) { if (tx.onabort) tx.onabort({ target: tx }); return; }
    for (const j of journal) {
      if (j.type === 'put') j.st.rows.set(j.k, j.v);
      else if (j.type === 'del') j.st.rows.delete(j.k);
      else j.st.rows.clear();
    }
    if (tx.oncomplete) tx.oncomplete({ target: tx });
  }, 0);
  return tx;
}
globalThis.indexedDB = {
  open(name) {
    const req = { onupgradeneeded: null, onsuccess: null, onerror: null, result: null, error: null };
    queueMicrotask(() => {
      let rec = DATABASES.get(name);
      const fresh = !rec;
      if (fresh) { rec = { stores: new Map() }; DATABASES.set(name, rec); }
      req.result = {
        objectStoreNames: { contains: n => rec.stores.has(n) },
        createObjectStore: (n, { keyPath }) => { rec.stores.set(n, { keyPath, rows: new Map() }); return { createIndex() {} }; },
        transaction: (stores) => makeTx(rec),
        close() {},
      };
      if (fresh && req.onupgradeneeded) req.onupgradeneeded({ target: req });
      if (req.onsuccess) req.onsuccess({ target: req });
    });
    return req;
  },
};

/* ============== in-memory API: /register + /backup only ================== */
const API = 'http://bh-audit.invalid';
const backups = new Map();          // playerId -> { blob, updatedAt }
const pushes = [];                  // every PUT /backup, in order: { pid, blob }
globalThis.fetch = async (url, opts = {}) => {
  const { pathname } = new URL(url);
  const method = opts.method || 'GET';
  const hdr = opts.headers || {};
  const resp = (status, obj) => ({ ok: status >= 200 && status < 300, status, json: async () => obj });
  if (pathname === '/register') {
    const { pubkey } = JSON.parse(opts.body);
    // same pubkey -> same playerId, exactly the server's re-register contract
    return resp(200, { playerId: 'p-' + pubkey.x.slice(0, 20), handle: 'AUDIT BONES', friendCode: 'AUDIT1', name: null });
  }
  if (pathname === '/backup') {
    const pid = hdr['x-bh-player'];
    if (method === 'PUT') {
      const { blob } = JSON.parse(opts.body);
      backups.set(pid, { blob, updatedAt: Date.now() });
      pushes.push({ pid, blob });
      return resp(200, { ok: true });
    }
    const b = backups.get(pid);
    return b ? resp(200, b) : resp(404, {});
  }
  return resp(404, {});
};

/* ==================== the REAL modules under test ========================= */
const social = await import(ROOT + '/js/social.js');
const { db, kvGet, kvSet, importAll, useDbName } = await import(ROOT + '/js/db.js');

// switch "phones": a device is a dbName, same as the real app's useDbName
async function device(name) { useDbName(name); await kvSet('apiBase', API); }

const b64ToU8 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function decryptWith(aesJwk, b64blob) {
  const key = await crypto.subtle.importKey('jwk', aesJwk, { name: 'AES-GCM' }, false, ['decrypt']);
  const buf = b64ToU8(b64blob);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function encryptForeign(obj) {   // a blob written by "somebody else's key"
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  const out = new Uint8Array(iv.length + ct.length); out.set(iv, 0); out.set(ct, iv.length);
  return btoa(String.fromCharCode(...out));
}

/* ---------------- FIRSTBLOB: device A's very first push ------------------ */
await device('devA');
const onA = await social.goOnline();
ok('SETUP  device A registered', onA.ok, onA.reason || '');
await db.put('log', { id: 'L_audit', date: '2026-08-30', foodId: 'F_x', kcal: 123, name: 'audit meal' });
await kvSet('coins', 777);
const pushedA = await social.pushBackup('audit');
ok('SETUP  device A pushed its FIRST-EVER backup (empty sample = FAIL)', pushedA === true && pushes.length === 1, `pushes=${pushes.length}`);

const idA = await kvGet('identity', null);
ok('SETUP  device A holds aesJwk after the push', !!(idA && idA.aesJwk), 'without this the decrypt rows below cannot run');
let firstSnap = null;
try { firstSnap = await decryptWith(idA.aesJwk, pushes[0].blob); } catch { /* graded below */ }
ok('SETUP  first blob decrypts under A\'s own current key', !!firstSnap);
const embedded = firstSnap && (firstSnap.kv || []).find(r => r && r.k === 'identity');
ok('FIRSTBLOB  the first blob embeds kv identity WITH aesJwk',
  !!(embedded && embedded.v && embedded.v.aesJwk),
  embedded ? (embedded.v.aesJwk ? 'aesJwk present' : 'aesJwk MISSING: the poisoned first blob') : 'no identity row in blob');

/* ---------------- MERGE rows: importAll(replace:false) directly ---------- */
await device('devMerge');
await kvSet('identity', { privJwk: { d: 'LOCAL' }, pubJwk: { x: 'L' }, aesJwk: { k: 'GOOD-KEY' } });
await kvSet('coins', 5);
await importAll({
  app: 'tally', version: 3, log: [],
  kv: [
    { k: 'identity', v: { privJwk: { d: 'BLOB' }, pubJwk: { x: 'B' } } },  // keyless, like the poisoned blob
    { k: 'coins', v: 999 },
    { k: 'cloudOff', v: true },                                            // device key this device does NOT hold
  ],
}, { replace: false });
const mId = await kvGet('identity', null);
ok('MERGEGUARD  merge never overwrites kv identity on a device that has one',
  !!(mId && mId.privJwk && mId.privJwk.d === 'LOCAL' && mId.aesJwk && mId.aesJwk.k === 'GOOD-KEY'),
  `d=${mId && mId.privJwk && mId.privJwk.d} aes=${(mId && mId.aesJwk && mId.aesJwk.k) || 'missing'}`);
ok('MERGEWINS  control: payload still wins a NON-device key on merge', (await kvGet('coins', 0)) === 999);
ok('MERGEFRESH  control: a device key the device lacks still lands (fresh-install unchanged)', (await kvGet('cloudOff', false)) === true);

/* ---------------- ROUNDTRIP: A pushes, B restores, B pushes, A pulls ----- */
/* adoptIdentity IS the phrase restore's install step: restoreWithPhrase only
   unwraps the same identity bundle (setRecoveryPhrase wraps kv 'identity'
   whole, aesJwk included, after forcing backupKey()) and hands it here. The
   PBKDF2 wrapping is not part of the bug chain, so it is not re-driven. */
await device('devB');
const adopted = await social.adoptIdentity(structuredClone(idA));
ok('ROUNDTRIP  B adopts A\'s bundle and pulls A\'s save', !!(adopted && adopted.ok && adopted.restored),
  adopted ? `ok=${adopted.ok} restored=${adopted.restored} pullReason=${adopted.pullReason || ''} ${adopted.reason || ''}` : 'no result');
ok('ROUNDTRIP  A\'s log row is on device B after the pull', !!(await db.get('log', 'L_audit')));
const idB = await kvGet('identity', null);
ok('KEYSTABLE  B\'s aesJwk after the pull is byte-equal to A\'s (no re-mint)',
  JSON.stringify(idB && idB.aesJwk) === JSON.stringify(idA.aesJwk),
  (idB && idB.aesJwk) ? (JSON.stringify(idB.aesJwk) === JSON.stringify(idA.aesJwk) ? 'same key' : 'DIFFERENT KEY: re-minted') : 'no aesJwk on B');
await db.put('log', { id: 'L_fromB', date: '2026-08-31', foodId: 'F_y', kcal: 45, name: 'b meal' });
const pushedB = await social.pushBackup('audit');
ok('ROUNDTRIP  B pushed (the write that used to poison the cloud copy)', pushedB === true);

await device('devA');
await kvSet('bootRestored', false);
const pullA = await social.pullBackup();
ok('ROUNDTRIP  A pulls after B\'s push and CAN STILL DECRYPT',
  !!(pullA && pullA.restored), pullA ? `restored=${pullA.restored} reason=${pullA.reason || ''}` : 'no result');
ok('ROUNDTRIP  B\'s row arrived on A (the merge really ran)', !!(await db.get('log', 'L_fromB')));
ok('ROUNDTRIP  A\'s own data survived the round trip', (await kvGet('coins', 0)) === 777 && !!(await db.get('log', 'L_audit')));

/* ---------------- DECRYPT: a blob written by a different key ------------- */
await device('devC');
const onC = await social.goOnline();
await kvSet('coins', 55);
const meC = await kvGet('social', null);
backups.set(meC.playerId, { blob: await encryptForeign({ app: 'tally', version: 3, log: [], kv: [] }), updatedAt: Date.now() });
const pullC = await social.pullBackup();
ok('DECRYPT  a wrong-key blob is named reason:\'decrypt\', never "no save" or a laundered exception',
  !!(onC.ok && pullC && pullC.restored === false && pullC.reason === 'decrypt'),
  pullC ? `restored=${pullC.restored} reason=${JSON.stringify(pullC.reason)}` : 'no result');
ok('DECRYPT  the local save is untouched by the failed pull', (await kvGet('coins', 0)) === 55);
ok('DECRYPT  the server copy is untouched (self-heal by the good device stays possible)', !!backups.get(meC.playerId));

/* ---------------- SRC rows: pin the fix's shape in the sources ----------- */
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const fnBody = (text, header) => {
  const i = text.indexOf(header);
  if (i < 0) return '';
  const j = text.indexOf('\nexport ', i + 1);
  return text.slice(i, j < 0 ? undefined : j);
};
const socialSrc = src('js/social.js');
const dbSrc = src('js/db.js');
const appSrc = src('js/app.js');

const pushBody = fnBody(socialSrc, 'export async function pushBackup');
ok('SRC-PUSH  pushBackup awaits backupKey() BEFORE exportAll()',
  pushBody.includes('await backupKey()') && pushBody.includes('exportAll()')
    && pushBody.indexOf('await backupKey()') < pushBody.indexOf('exportAll()'),
  pushBody ? (pushBody.includes('await backupKey()') ? 'order ok' : 'no backupKey() call in pushBackup') : 'pushBackup not found');

const importBody = fnBody(dbSrc, 'export async function importAll');
ok('SRC-MERGE  importAll filters DEVICE_KV on the MERGE path too',
  /if\s*\(!replace\)\s*\{[\s\S]{0,400}?DEVICE_KV/.test(importBody),
  'a !replace branch consulting DEVICE_KV inside importAll');

const pullBody = fnBody(socialSrc, 'export async function pullBackup');
ok('SRC-REASON  pullBackup names the decrypt failure reason:\'decrypt\'',
  /catch[\s\S]{0,120}?reason:\s*'decrypt'/.test(pullBody));

const adoptBody = fnBody(socialSrc, 'export async function adoptIdentity');
ok('SRC-ADOPT  adoptIdentity forwards pullReason to its callers',
  adoptBody.includes('pullReason'));

ok('SRC-BOOT  the boot pull toast has a dedicated decrypt branch with honest copy',
  /reason === 'decrypt'/.test(appSrc) && /different key/.test(appSrc));

const restoreHits = (appSrc.match(/pullReason === 'decrypt'/g) || []).length;
ok('SRC-RESTORE  both adoptIdentity surfaces (phrase restore, vault adopt) branch on pullReason',
  restoreHits >= 2, `${restoreHits} surface(s) found, need 2`);

console.log(bad ? `\n${bad} FAILED` : '\nall green');
process.exit(bad ? 1 : 0);
