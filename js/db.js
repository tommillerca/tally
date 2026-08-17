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

/* WRITE EPOCHS. A strictly increasing stamp per store, bumped by every write that
   goes through this module. It exists so a caller can cache something derived from
   a whole store (js/game.js caches the XP total) and know, in constant time and
   without re-reading the store, whether anything has touched THAT store since. Bumped
   BEFORE the write lands, so a write that then FAILS still invalidates: the safe
   direction is a needless rebuild, never a stale number.

   PER STORE, NOT ONE GLOBAL SEQUENCE, and this is the whole point. The first
   version of this used a single shared counter, so `epoch('xp')` moved when ANY
   store was written. js/game.js checks that the xp store moved exactly once across
   its own put, and with a shared counter an unrelated kv write in between broke
   that check. A fight win is award plus COINS, and coins are kvSet, which is
   db.put('kv', ...), so in the real app the xp cache was thrown away on almost
   every award and the next read paid for a full scan anyway: measured at 11 cache
   drops out of a 12-award burst, against 0 for a burst of bare awards. Making the
   stamp belong to the store the cache is derived from is the fix. Do not merge
   these counters back into one. */
const storeSeq = new Map();
function bumpStore(store) { storeSeq.set(store, (storeSeq.get(store) || 0) + 1); }
export function storeEpoch(store) { return storeSeq.get(store) || 0; }

export function useDbName(name) {
  dbName = name;
  dbPromise = null;
  /* A different database is different data, and no write to the new one has
     happened yet to say so. Bump every store this process knows about: the
     counters only ever climb, so no cache built against the old database can
     still match. */
  for (const s of new Set([...STORES, ...storeSeq.keys()])) bumpStore(s);
}

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

function tx(store, mode, fn) {
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

export const db = {
  put: (store, val) => { bumpStore(store); return tx(store, 'readwrite', s => s.put(val)); },
  del: (store, key) => { bumpStore(store); return tx(store, 'readwrite', s => s.delete(key)); },
  get: (store, key) => tx(store, 'readonly', s => s.get(key)),
  clear: (store) => { bumpStore(store); return tx(store, 'readwrite', s => s.clear()); },
  all: (store) => tx(store, 'readonly', s => s.getAll()),
  count: (store) => tx(store, 'readonly', s => s.count()),
  epoch: (store) => storeEpoch(store),
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
      /* An import replaces the contents of every store, so every derived cache
         built on the old contents is now wrong. Stamp them all. */
      for (const s of STORES) bumpStore(s);
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

// Ask the browser to protect this origin's storage from automatic eviction.
export function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch { /* unsupported */ }
}
