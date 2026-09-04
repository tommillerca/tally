/* tests/mem-idb.mjs: the in-memory IndexedDB the node-only audits share.
 *
 * Lifted verbatim from backup-key-audit.mjs (2026-09-03) when log-xp-farm-audit
 * needed the same thing: a real js/db.js + js/game.js driven in node, no
 * browser. Importing this module installs `globalThis.indexedDB`; nothing is
 * exported because js/db.js only ever reaches the global.
 *
 * Faithful in the four properties the code under test leans on:
 *   - rows are structured-clone copies on write AND read;
 *   - writes journal and commit on a macrotask, so puts dispatched
 *     synchronously inside one transaction land together;
 *   - tx.abort() discards the journal (importAll's rollback guarantee);
 *   - request callbacks fire on microtasks, before the commit macrotask, so
 *     kvUpdate's get-then-put lands inside its transaction;
 *   and `add` raises ConstraintError on a taken key, which is what
 *   db.addIfAbsent (and so every awardOnce) is built on.
 * `index` is NOT shimmed: nothing here uses db.byIndex yet. */
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
