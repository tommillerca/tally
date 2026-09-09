import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
export { assert };
export const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
export function cut(src, start, end) {
  const a = src.indexOf(start), b = src.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `missing production section: ${start}`);
  return src.slice(a, b);
}
export function audit(label) {
  let passed = 0, failed = 0;
  return {
    async check(name, fn) {
      try { await fn(); passed++; console.log(`PASS ${name}`); }
      catch (e) { failed++; console.log(`FAIL ${name}: ${e.stack}`); }
    },
    finish() { console.log(`${label}: ${passed} passed, ${failed} failed`); if (failed) process.exitCode = 1; },
  };
}
export function storage() {
  const m = new Map();
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null,
    getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
// Abort the real memory-IDB transaction after the selected write is staged.
export function abortWrites(predicate) {
  const original = indexedDB.open;
  indexedDB.open = (...args) => {
    const req = original(...args); let success;
    Object.defineProperty(req, 'onsuccess', {
      set: fn => { success = fn; },
      get: () => event => {
        const transaction = req.result.transaction;
        req.result.transaction = (...args) => {
          const tx = transaction(...args), objectStore = tx.objectStore;
          tx.objectStore = name => {
            const store = objectStore(name);
            for (const op of ['put', 'clear']) {
              const original = store[op];
              store[op] = value => { const result = original(value); if (predicate(name, op, value)) tx.abort(); return result; };
            }
            return store;
          };
          return tx;
        };
        success?.(event);
      },
    });
    return req;
  };
}
