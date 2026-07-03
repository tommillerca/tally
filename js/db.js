// Minimal promise wrapper over IndexedDB. Stores: foods, log, weights, kv, xp, health.
// IMPORTANT: upgrades must stay strictly ADDITIVE (create-if-missing only).
// Existing user data must survive every version bump.
const DB_VERSION = 2;
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
  const [foods, log, weights, kv, xp, health] = await Promise.all([
    db.all('foods'), db.all('log'), db.all('weights'), db.all('kv'), db.all('xp'), db.all('health'),
  ]);
  return { app: 'tally', version: 2, exportedAt: new Date().toISOString(), foods, log, weights, kv, xp, health };
}

export async function importAll(data) {
  if (!data || data.app !== 'tally' || !Array.isArray(data.log)) throw new Error('Not a Tally backup file');
  for (const f of data.foods || []) await db.put('foods', f);
  for (const e of data.log || []) await db.put('log', e);
  for (const w of data.weights || []) await db.put('weights', w);
  for (const r of data.kv || []) await db.put('kv', r);
  for (const r of data.xp || []) await db.put('xp', r);
  for (const r of data.health || []) await db.put('health', r);
  return { foods: (data.foods || []).length, log: (data.log || []).length, weights: (data.weights || []).length };
}

// Ask the browser to protect this origin's storage from automatic eviction.
export function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch { /* unsupported */ }
}
