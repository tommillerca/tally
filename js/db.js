// Minimal promise wrapper over IndexedDB. Stores: foods, log, weights, kv, xp, health, inv.
// IMPORTANT: upgrades must stay strictly ADDITIVE (create-if-missing only).
// Existing user data must survive every version bump.
const DB_VERSION = 3;
let dbPromise = null;
let dbName = 'tally';

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
  put: (store, val) => tx(store, 'readwrite', s => s.put(val)),
  del: (store, key) => tx(store, 'readwrite', s => s.delete(key)),
  get: (store, key) => tx(store, 'readonly', s => s.get(key)),
  clear: (store) => tx(store, 'readwrite', s => s.clear()),
  all: (store) => tx(store, 'readonly', s => s.getAll()),
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
 * again. Silent failure is not acceptable and neither is silent success. */
export async function importAll(data) {
  if (!data || data.app !== 'tally' || !Array.isArray(data.log)) throw new Error('Not a Tally backup file');
  const idb = await open();
  const STORES = ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv'];
  return new Promise((resolve, reject) => {
    let t;
    try { t = idb.transaction(STORES, 'readwrite'); }
    catch (e) { reject(new Error('the restore could not open storage. Your old data is unchanged. Try again.')); return; }
    t.oncomplete = () => resolve({ foods: (data.foods || []).length, log: (data.log || []).length, weights: (data.weights || []).length });
    /* onerror and onabort BOTH need handling. onerror bubbles from a
       failed put; onabort fires when the transaction is explicitly
       aborted OR when the tab is torn down mid-flight. Either way IDB
       rolls back and the player's old save survives. */
    t.onerror = () => reject(new Error('the restore did not finish. Your old data is unchanged. Try again.'));
    t.onabort = () => reject(new Error('the restore did not finish. Your old data is unchanged. Try again.'));
    try {
      for (const s of STORES) {
        const os = t.objectStore(s);
        for (const row of (data[s] || [])) os.put(row);
      }
    } catch (e) {
      /* A synchronous throw here (e.g. malformed row that put rejects
         inline) explicitly aborts the transaction; onabort will fire
         and reject the promise with the standard message. */
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
