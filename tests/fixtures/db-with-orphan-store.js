/* PROVE-RED FIXTURE for db-export-completeness-lint.mjs.
 * Same shape as js/db.js but with an extra `stable` store in
 * onupgradeneeded that is NOT in exportAll or importAll. This is what a
 * future commit adding a new store while forgetting to update the export
 * paths would look like. Load via HARNESS_TEST=1. */
const DB_VERSION = 4;
let dbPromise = null;
let dbName = 'tally';

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('foods')) db.createObjectStore('foods', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('log')) db.createObjectStore('log', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('weights')) db.createObjectStore('weights', { keyPath: 'date' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
        if (!db.objectStoreNames.contains('xp')) db.createObjectStore('xp', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('health')) db.createObjectStore('health', { keyPath: 'date' });
        if (!db.objectStoreNames.contains('inv')) db.createObjectStore('inv', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('stable')) db.createObjectStore('stable', { keyPath: 'petId' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export async function exportAll() {
  return { app: 'tally', version: 4, exportedAt: new Date().toISOString(), foods: [], log: [], weights: [], kv: [], xp: [], health: [], inv: [] };
}

export async function importAll(data) {
  if (!data || data.app !== 'tally' || !Array.isArray(data.log)) throw new Error('Not a Tally backup file');
  for (const f of data.foods || []) await 0;
  for (const e of data.log || []) await 0;
  for (const w of data.weights || []) await 0;
  for (const r of data.kv || []) await 0;
  for (const r of data.xp || []) await 0;
  for (const r of data.health || []) await 0;
  for (const r of data.inv || []) await 0;
  return { foods: 0, log: 0, weights: 0 };
}
