// Minimal promise wrapper over IndexedDB. Stores: foods, log, weights, kv, xp, health, inv.
// IMPORTANT: upgrades must stay strictly ADDITIVE (create-if-missing only).
// Existing user data must survive every version bump.
const DB_VERSION = 3;
let dbPromise = null;
let dbName = 'tally';

/* THE STORE LIST, IN ONE PLACE, BECAUSE A HAND-COPIED ONE LOSES A STORE.
 *
 * Every place that has to act on "all of the player's data" reads this: the
 * transactional importAll below, and Settings > Erase all data in js/app.js.
 * The erase used to carry its own literal and it was missing 'inv', so an
 * erase left the whole inventory (crates, gear, cosmetics, pets) standing
 * while wiping the kv flag that says the welcome kit was already paid. The
 * dialog promised the Bonehead was gone and it was not, and every
 * erase-then-start-over cycle paid a second welcome kit on top of the gear it
 * had failed to remove: unbounded, from the single most natural piece of
 * support advice there is.
 *
 * Adding an eighth store means adding it HERE and to onupgradeneeded, and
 * tests/erase-completeness-audit.mjs fails if those two ever disagree, so the
 * next store cannot silently reintroduce the same hole. */
export const STORES = ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv'];

export function useDbName(name) { dbName = name; dbPromise = null; }

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('foods')) {
          const s = db.createObjectStore('foods', { keyPath: 'id' });
          s.createIndex('barcode', 'barcode');
          s.createIndex('lastUsedAt', 'lastUsedAt');
        }
        if (!db.objectStoreNames.contains('log')) {
          const s = db.createObjectStore('log', { keyPath: 'id' });
          s.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('weights')) {
          db.createObjectStore('weights', { keyPath: 'date' });
        }
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'k' });
        }
        if (!db.objectStoreNames.contains('xp')) {
          db.createObjectStore('xp', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('health')) {
          db.createObjectStore('health', { keyPath: 'date' });
        }
        if (!db.objectStoreNames.contains('inv')) {
          db.createObjectStore('inv', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/* ONE ACCOUNT, TWO TABS. Added 2026-08-17.
 *
 * Everything below this line exists because nothing in this app had ever been
 * opened twice at once, and a second tab is not a hypothetical: it is what a
 * shared link, a "open in new tab", or an installed PWA beside its own website
 * produces. Two tabs share ONE IndexedDB. IndexedDB serialises `readwrite`
 * transactions over a store across every connection, tab boundaries included,
 * so a transaction IS a lock. What is NOT a lock is a read, an `await`, and
 * then a write, and that is the shape almost every write in this app had.
 *
 * Measured on two real puppeteer pages against one served tree, before the fix
 * (tests/multitab-audit.mjs carries all of these as assertions):
 *   50 x coinsAdd(+10) from 1000 across two tabs   ended at 1280, not 1500
 *   20 spends of 100 racing 20 earns of 100        ended at 2500, not 3000
 *   one 100-coin grant delivered to both tabs      paid 200
 *   one gear id granted in both tabs               left TWO inv rows, and each
 *                                                  one disenchants for full dust
 *   awardCapped with a 12/day ceiling              paid 190 XP against a 120 cap
 *   30 additions to the grantsSeen list            kept 23 of them
 * None of these need a modified client, a patched server or a second device.
 * They need the app open twice.
 *
 * The primitives here are the whole answer: they do the read AND the write
 * inside a single transaction, so the browser does the mutual exclusion. There
 * is deliberately no lock, no leader election and no version counter to get
 * wrong. Rules for using them:
 *   - The updater function passed to kvUpdate must be SYNCHRONOUS. An `await`
 *     inside it drains the microtask queue, IndexedDB auto-commits, and the
 *     transaction is over before the write is issued. That is the same trap
 *     importAll documents above.
 *   - `addIfAbsent` is the test-and-set. It is what makes a ledger row a real
 *     receipt rather than a hint: exactly one caller can ever get `true` for a
 *     given key, no matter how many tabs ask at the same instant.
 */

/* Writes are refused while this is set. Only ever set by the wipe protocol
   below, in the tabs that are NOT doing the wiping, so that "erase everything"
   can be true rather than nearly true. A frozen tab is on its way to a reload. */
let frozen = false;
const FROZEN_MSG = 'this save was erased in another tab';

function tx(store, mode, fn) {
  if (frozen && mode === 'readwrite') return Promise.reject(new Error(FROZEN_MSG));
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = fn(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

/* ATOMIC INSERT-IF-ABSENT. Returns true only for the caller whose row landed.
 *
 * `add` (not `put`) fails with ConstraintError when the key is taken, and the
 * check and the insert are the SAME request, so there is no window between
 * them for a second tab to slip through. The preventDefault is load-bearing:
 * an unhandled request error bubbles to the transaction and ABORTS it, which
 * would turn "somebody else already has this key" into a rejected promise and
 * a lost write for whatever else shared the transaction. */
export function addIfAbsent(store, val) {
  if (frozen) return Promise.reject(new Error(FROZEN_MSG));
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    let inserted = true;
    const req = t.objectStore(store).add(val);
    req.onerror = e => {
      if (req.error && req.error.name === 'ConstraintError') {
        inserted = false;
        e.preventDefault();      // "already there" is an answer, not a failure
        e.stopPropagation();
      }
    };
    t.oncomplete = () => resolve(inserted);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('addIfAbsent aborted'));
  }));
}

/* ATOMIC TAKE. Hands the row over and deletes it, in ONE transaction.
 *
 * An inventory row (a crate, an egg, a piece of gear) IS the right to one
 * payout, so reading it and deleting it in a second transaction lets two
 * overlapping callers both read it and both get paid. Two tabs melting the
 * same gear cannot both be told they melted it.
 *
 * Resolves THE ROW when this call is the one that found it, and `undefined`
 * when it was already gone. The row rather than a bare boolean because
 * openCrate has to know WHAT it took before it can roll it, and every caller
 * that only wants the yes/no reads the same answer off truthiness. */
export function take(store, key) {
  if (frozen) return Promise.reject(new Error(FROZEN_MSG));
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    const g = os.get(key);
    let row;
    g.onsuccess = () => { row = g.result; if (row !== undefined) os.delete(key); };
    t.oncomplete = () => resolve(row);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('take aborted'));
  }));
}

/* ATOMIC READ-MODIFY-WRITE on one kv row. `fn` MUST be synchronous, see above.
   Returns the value that was actually stored. This is the replacement for every
   `const v = await kvGet(k); v.push(x); await kvSet(k, v)` in the tree: that
   shape loses one of two concurrent additions every time it interleaves.

   RETURN `undefined` FROM `fn` TO WRITE NOTHING. That is how a caller says "on
   looking at the real state inside the transaction, there is nothing to do
   here": a collect on an empty pot, a harvest of a bed somebody else just took,
   a tribute already claimed. It matters because those callers are the ones
   whose whole job is to decide whether a payout is owed, and a no-op that still
   wrote the record back would touch a row it never changed. kvUpdate then
   resolves undefined, so `if (!out.ok)` and `if (next === undefined)` are both
   honest readings of "I did not take the state". */
export function kvUpdate(k, fn, fallback = null) {
  if (frozen) return Promise.reject(new Error(FROZEN_MSG));
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction('kv', 'readwrite');
    const os = t.objectStore('kv');
    const g = os.get(k);
    let next;
    let threw = null;
    g.onsuccess = () => {
      const cur = g.result ? g.result.v : fallback;
      try { next = fn(cur); } catch (e) { threw = e; try { t.abort(); } catch { /* already going */ } return; }
      if (next !== undefined) os.put({ k, v: next });
    };
    t.oncomplete = () => resolve(next);
    t.onerror = () => reject(threw || t.error);
    t.onabort = () => reject(threw || t.error || new Error('kvUpdate aborted'));
  }));
}

/* The currency primitive. `coins` and `bonedust` are plain numbers in kv and
   every balance change in the game goes through here, so this one function is
   the difference between an exact balance and a drifting one. The clamp is the
   same `Math.max(0, ...)` the callers used to apply outside the transaction. */
export function kvBump(k, n, { min = 0 } = {}) {
  return kvUpdate(k, cur => Math.max(min, (Number(cur) || 0) + n), 0);
}

export const db = {
  put: (store, val) => tx(store, 'readwrite', s => s.put(val)),
  del: (store, key) => tx(store, 'readwrite', s => s.delete(key)),
  get: (store, key) => tx(store, 'readonly', s => s.get(key)),
  clear: (store) => tx(store, 'readwrite', s => s.clear()),
  all: (store) => tx(store, 'readonly', s => s.getAll()),
  /* The two atomic ones, defined below and hung here so every caller that
     already has `db` can reach them without a second import. */
  addIfAbsent: (store, val) => addIfAbsent(store, val),
  take: (store, key) => take(store, key),
  byIndex: (store, index, value) => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  })),
};

export async function kvGet(k, fallback = null) {
  const row = await db.get('kv', k);
  return row ? row.v : fallback;
}
export function kvSet(k, v) { return db.put('kv', { k, v }); }

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function exportAll() {
  const [foods, log, weights, kv, xp, health, inv] = await Promise.all([
    db.all('foods'), db.all('log'), db.all('weights'), db.all('kv'), db.all('xp'), db.all('health'), db.all('inv'),
  ]);
  return { app: 'tally', version: 3, exportedAt: new Date().toISOString(), foods, log, weights, kv, xp, health, inv };
}

/* kv rows that belong to the DEVICE, not to the save.
 *
 * Clearing kv is half of what closes the duplication loop below, but kv is
 * also where the account's private key lives, and a backup file taken before
 * this device ever registered carries no `identity` row to put back. Wiping
 * it would sign the player out of an account they cannot return to on the
 * web, where there is no OS keychain for ensureIdentity() to recover from.
 * That is the 2026-07-27 shape all over again.
 *
 * So these keys are read BEFORE the transaction and re-applied inside it,
 * and only for keys the payload does not itself carry. The payload always
 * wins where it has an opinion, which means the outcome for every one of
 * these keys is byte-identical to what upsert-only produced. Nothing here
 * is game state: no coins, no dust, no progress. */
const DEVICE_KV = ['identity', 'social', 'recoveryId', 'recoverySetAt', 'vaultConflict', 'bootRestored', 'cloudOff', 'apiBase'];

/* IMPORT IS ALL-OR-NOTHING. Tom, 2026-08-13, after Vlad's demonstration:
 * "sounds like a good fix youve suggested". Every row across every store
 * commits together in ONE multi-store transaction, or none of them do
 * and the player's old save is left byte-identical to what it was
 * before the click. No third state.
 *
 * The previous version did `await db.put(...)` per row per store, one
 * IndexedDB transaction per row. A tab reload, an app background, or a
 * failed put anywhere in the seven loops left foods/log full of new
 * data and weights/kv/xp/health/inv untouched, and the app booted on
 * the mixed state silently. See gwart/FINDING-C-INTERRUPT-DEMO.md and
 * tests/importall-interrupt-finding.mjs for the measurement.
 *
 * How the guarantee holds:
 *   - Multi-store readwrite transaction over ALL seven stores.
 *   - All puts dispatched SYNCHRONOUSLY inside the transaction. If any
 *     `await` sat between them, IndexedDB would auto-commit when the
 *     microtask queue drained and we would be back to piecewise commit.
 *   - `oncomplete` is the only success signal; the promise resolves
 *     only when EVERY put has committed.
 *   - Any failure inside the transaction (bad row, quota hit, tab
 *     reload) fires `onabort` and IDB rolls back automatically. The
 *     promise rejects with a message the toast can show verbatim.
 *
 * The rejection wording is intentionally caller-safe: js/app.js's
 * #importFile handler prefixes it as `Import failed: <message>` and
 * the full string tells the player their old data is safe and to try
 * again. Silent failure is not acceptable and neither is silent success.
 *
 * A RESTORE REPLACES, IT DOES NOT MERGE. Tom approved this on 2026-08-16.
 * The version above only ever called `os.put`, so a restore could add rows
 * and overwrite rows but could never REMOVE one. That is an unlimited
 * duplication loop reachable from the Settings buttons alone, with no
 * modified client and no edited file:
 *
 *   Settings -> Export.   coins 6500, 17 inv rows.
 *   Shop -> buy a drop piece for 3000.   coins 3500, 18 inv rows.
 *   Settings -> Import that same file.   coins 6500, STILL 18 inv rows.
 *
 * The kv row for `coins` came back at its pre-spend value because the file
 * carried it, and the inv row the purchase minted stayed because the file
 * carried nothing that could delete it. Measured twice around on the real
 * UI: two 3000-coin pieces for a net cost of zero. Same shape for any spend
 * whose payout lands in a NEW row: crates, gear, xp award rows.
 *
 * So every store the payload declares is CLEARED first, inside the same
 * transaction as its puts.
 *
 * WHY THE CLEAR IS SAFE, measured on Chrome 2026-08-16, not assumed:
 *   - An abort rolls the clear back with everything else. A transaction
 *     that cleared kv and inv, put a row, then hit a malformed row and
 *     aborted, left BOTH stores holding their original rows.
 *   - Same for an asynchronous request failure after the clear: the error
 *     bubbles, IDB aborts, the cleared rows come back.
 *   - BUT a malformed row throws SYNCHRONOUSLY out of `os.put` (DataError)
 *     and that throw does NOT abort the transaction by itself. Left alone
 *     it COMMITS, clear included, and the store is emptied. The `t.abort()`
 *     in the catch below is therefore load-bearing, not tidy-up. It is the
 *     only reason "Your old data is unchanged" is still literally true.
 *
 * A store the file OMITS is left completely alone: not cleared, not
 * written. An older export that predates a store carries no rows for it,
 * and clearing on absence would destroy data that no put restores. An
 * explicit empty array IS cleared, because "this store held nothing at
 * export time" is a fact the file is stating, and exportAll always emits
 * all seven keys as arrays, so a genuine backup never lands in the omitted
 * branch by accident.
 *
 * `replace: false` keeps the old additive behaviour for callers whose
 * contract is a merge rather than a restore. js/social.js's cloud pull is
 * the only one. */
export async function importAll(data, { replace = true } = {}) {
  if (frozen) throw new Error('this save was erased in another tab. Reload and try again.');
  if (!data || data.app !== 'tally' || !Array.isArray(data.log)) throw new Error('Not a Tally backup file');
  /* STORES is the module-level export above. importAll used to keep its own
     copy of this list, and a second copy in js/app.js's erase loop is what
     silently lost 'inv' and left the inventory behind on a full wipe. One
     list, imported everywhere, is the fix for that whole class. */
  /* Shape check BEFORE anything opens a transaction, so "unchanged" is
     trivially true on this path. A store key that is present but is not an
     array is a damaged file, not an old one, and the two cases deserve
     different answers: this one refuses, an absent key is skipped below. */
  const damaged = STORES.filter(s => data[s] != null && !Array.isArray(data[s]));
  if (damaged.length) throw new Error(`that backup file is damaged (${damaged.join(', ')}). Your old data is unchanged.`);
  const idb = await open();
  const declared = new Set(STORES.filter(s => Array.isArray(data[s])));
  const skipped = STORES.filter(s => !declared.has(s));
  /* Read the device rows out here, not inside the transaction. An `await`
     between the puts would let IDB auto-commit on the drained microtask
     queue and we would be back to piecewise commit, which is exactly what
     this function was rewritten to stop. */
  let keptKv = [];
  if (replace && declared.has('kv')) {
    const payloadKeys = new Set(data.kv.map(r => r && r.k));
    try { keptKv = (await db.all('kv')).filter(r => DEVICE_KV.includes(r.k) && !payloadKeys.has(r.k)); }
    catch (e) { throw new Error('the restore could not read storage. Your old data is unchanged. Try again.'); }
  }
  return new Promise((resolve, reject) => {
    let t;
    try { t = idb.transaction(STORES, 'readwrite'); }
    catch (e) { reject(new Error('the restore could not open storage. Your old data is unchanged. Try again.')); return; }
    t.oncomplete = () => resolve({ foods: (data.foods || []).length, log: (data.log || []).length, weights: (data.weights || []).length, skipped });
    /* onerror and onabort BOTH need handling. onerror bubbles from a
       failed put; onabort fires when the transaction is explicitly
       aborted OR when the tab is torn down mid-flight. Either way IDB
       rolls back and the player's old save survives. */
    t.onerror = () => reject(new Error('the restore did not finish. Your old data is unchanged. Try again.'));
    t.onabort = () => reject(new Error('the restore did not finish. Your old data is unchanged. Try again.'));
    try {
      for (const s of STORES) {
        const os = t.objectStore(s);
        /* Clear and puts in one transaction, so they land together or not
           at all. Only for stores the file declares: see the header. */
        if (replace && declared.has(s)) os.clear();
        for (const row of (data[s] || [])) os.put(row);
        if (s === 'kv') for (const row of keptKv) os.put(row);
      }
    } catch (e) {
      /* LOAD-BEARING, do not delete. A synchronous throw out of `os.put`
         (malformed row, unclonable value) does NOT abort the transaction
         on its own: measured, such a transaction goes on to COMPLETE and
         commits the clear, leaving the store empty. This abort is what
         rolls the clear back and keeps the promise in the rejection copy
         literally true. onabort then rejects with the standard message. */
      try { t.abort(); } catch { /* already aborting */ }
    }
  });
}

/* ---------------- ERASE EVERYTHING, WITH A SECOND TAB OPEN ----------------
 *
 * THE MEASUREMENT. Settings > Erase all data used to be, in js/app.js:
 *     for (const st of STORES) await db.clear(st);
 *     location.reload();
 * Seven separate transactions, then a reload of THIS tab only. Driven with a
 * second tab in a plain write loop (30 x coinsAdd(5) + 30 inv rows), the erase
 * finished and the database still held 30 inv rows, a kv row, and a coin
 * balance of 150. The sheet says "Your log, foods, weights, XP, gear and
 * Bonehead on this device will be gone". It was not gone, and the tab that did
 * the erasing reloaded onto a save it believed it had destroyed. That is the
 * 2026-08-13 'inv' shape again: a destructive dialog that is not true, and the
 * welcome kit is re-paid on top of an inventory that survived.
 *
 * WHY IT NEEDS A HANDSHAKE AND NOT JUST ONE TRANSACTION. One transaction fixes
 * the erase being piecewise. It does nothing about the other tab, which is
 * still running, still holds the player's whole state in memory, and writes
 * again a millisecond later. So:
 *
 *   1. Broadcast `freeze`. Every other tab sets `frozen` SYNCHRONOUSLY in its
 *      message handler, which makes every readwrite in this module reject, and
 *      acks.
 *   2. Wait for the acks (bounded: WIPE_ACK_MS, so one wedged tab cannot hold
 *      the erase hostage forever).
 *   3. THEN open the clear transaction. Anything the other tab dispatched
 *      before it froze was queued as a transaction earlier than this one, and
 *      IndexedDB runs same-store readwrite transactions in creation order, so
 *      those writes commit BEFORE the clear and the clear removes them. That
 *      is the whole reason the ack has to come before the transaction opens
 *      rather than after.
 *   4. Broadcast `erased`, and the frozen tabs reload onto the empty save
 *      instead of sitting there showing a Bonehead that no longer exists.
 *
 * Bound, measured with the other tab in a continuous write loop across the
 * whole handshake: every store holds exactly ZERO rows afterwards. Not fewer.
 * Zero. tests/multitab-audit.mjs asserts that number.
 *
 * BroadcastChannel is absent in no browser this app supports, but the whole
 * protocol degrades to "one transaction, this tab only" if it is missing,
 * which is still strictly better than the seven-transaction loop it replaces. */
const WIPE_CH = 'tally-db-wipe';
const WIPE_ACK_MS = 300;
let wipeChannel = null;
function chan() {
  if (wipeChannel !== null) return wipeChannel;
  try { wipeChannel = new BroadcastChannel(WIPE_CH); } catch { wipeChannel = false; }
  if (wipeChannel) {
    wipeChannel.onmessage = e => {
      const m = e && e.data;
      if (!m || typeof m !== 'object') return;
      if (m.t === 'freeze') {
        frozen = true;                       // synchronous: no write can slip past this
        try { wipeChannel.postMessage({ t: 'frozen', id: m.id }); } catch { /* channel gone */ }
      } else if (m.t === 'erased') {
        frozen = true;
        try { if (typeof location !== 'undefined') location.reload(); } catch { /* not a document */ }
      }
    };
  }
  return wipeChannel;
}
// Called once at boot so a tab is listening before any OTHER tab erases.
export function watchForWipe() { chan(); }

export async function eraseAll() {
  const ch = chan();
  if (ch) {
    const id = Math.random().toString(36).slice(2);
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; ch.removeEventListener('message', onAck); resolve(); } };
      /* Resolve on the FIRST ack rather than counting tabs: there is no way to
         know how many are open, and a tab that never answers is covered by the
         timeout and then by the `erased` reload. */
      const onAck = e => { if (e && e.data && e.data.t === 'frozen' && e.data.id === id) finish(); };
      ch.addEventListener('message', onAck);
      try { ch.postMessage({ t: 'freeze', id }); } catch { finish(); return; }
      setTimeout(finish, WIPE_ACK_MS);
    });
  }
  const idb = await open();
  await new Promise((resolve, reject) => {
    /* ONE transaction over every store db.js defines. Same guarantee importAll
       gives a restore: it all goes, or none of it does and the player is left
       exactly where they were. STORES, never a literal: the literal is what
       lost 'inv' and left the whole wardrobe standing. */
    const t = idb.transaction(STORES, 'readwrite');
    for (const st of STORES) t.objectStore(st).clear();
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('erase aborted'));
  });
  if (ch) try { ch.postMessage({ t: 'erased' }); } catch { /* channel gone */ }
}

// Ask the browser to protect this origin's storage from automatic eviction.
export function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch { /* unsupported */ }
}
