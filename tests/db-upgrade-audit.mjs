/* AN INDEXEDDB UPGRADE MUST NOT LOSE A SINGLE ROW.
 *
 * js/db.js line 2 says upgrades stay strictly ADDITIVE and existing user data
 * survives every version bump. Nothing tested it. The failure mode is a player
 * losing every meal, weight, XP award and item on their device the first time
 * they load a new build, and an account has been wiped twice in this project.
 *
 * The only honest check is a real migration, so this one is: seed a database at
 * the HISTORICAL v1 schema (foods/log/weights/kv, with v1's indexes), close it,
 * then reopen it THROUGH js/db.js's own open() at the current DB_VERSION so the
 * app's real onupgradeneeded runs, and read every seeded row back. Then the same
 * for a v2 database (v1 + xp + health). Reading the source and reasoning that
 * `if (!contains) create` is additive would pass on a build where a later
 * upgrade step deletes a store, which is exactly the mistake worth catching.
 *
 * Schema history, from git log on js/db.js:
 *   v1 98e5a3e  foods (idx barcode, lastUsedAt), log (idx date), weights, kv
 *   v2 9e8414f  + xp, + health
 *   v3 35487e0  + inv
 *
 * What a FAILING run prints: `rows survive v1 -> v3` FAIL with the store and the
 * missing/changed key, e.g. "foods: 0/3 rows survived". An empty sample set is a
 * failure here too: zero rows read back means the seed never landed.
 *
 * PROVEN RED TWICE, against a scratch js/db.js that was never committed.
 *
 * 1. Destroy-and-recreate a store. One line before the log create-if-missing,
 *    `if (db.objectStoreNames.contains('log')) db.deleteObjectStore('log');`:
 *      FAIL  v1 -> 3: rows survive the upgrade   log: 0/3 rows survived (0 read back)
 *      FAIL  v2 -> 3: rows survive the upgrade   log: 0/3 rows survived (0 read back)
 *      2 FAILED, exit 1
 *    Note the store-existence check stayed GREEN through that, because the store
 *    IS recreated. Only reading the rows back catches it, which is the point.
 *
 * 2. Drop an index and keep the rows. `deleteIndex('barcode')` on foods:
 *      FAIL  v1 -> 3: the v1 indexes still exist   foods.barcode
 *      FAIL  v1 -> 3: and an index still returns its rows   ... NotFoundError
 *      4 FAILED, exit 1
 *    Rows all survived that one, so the index assertions are not redundant.
 *
 * Both go green again the moment the scratch line is removed.
 */
import { boot } from './godmode.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
const base = process.argv[2];
if (!base) { console.log('FAIL  needs a base URL (npm run gate serves one).'); process.exit(1); }

/* The stores as they existed at each old version, so the probe database is a
   genuine old save rather than today's schema with a smaller version number. */
const V1 = [
  { name: 'foods', keyPath: 'id', indexes: ['barcode', 'lastUsedAt'] },
  { name: 'log', keyPath: 'id', indexes: ['date'] },
  { name: 'weights', keyPath: 'date' },
  { name: 'kv', keyPath: 'k' },
];
const V2 = [...V1, { name: 'xp', keyPath: 'key' }, { name: 'health', keyPath: 'date' }];
const HISTORY = { 1: V1, 2: V2 };

/* A representative spread: nested objects, arrays, floats, null, unicode and an
   empty string, because a lossy migration that survives `{id, n}` can still
   mangle real rows. */
const ROWS = {
  foods: [
    { id: 'f1', name: 'Oat porridge', barcode: '5000000000001', lastUsedAt: 1723000000000, per100: { kcal: 371, p: 13.5, c: 60.1, f: 7.03 }, tags: ['breakfast', 'staple'] },
    { id: 'f2', name: 'Café au lait ☕', barcode: '', lastUsedAt: 0, per100: { kcal: 39, p: 2, c: 3.4, f: 1.9 }, tags: [] },
    { id: 'f3', name: 'Leftovers', barcode: null, lastUsedAt: 1723999999999, per100: { kcal: 0, p: 0, c: 0, f: 0 }, note: '' },
  ],
  log: [
    { id: 'l1', date: '2026-01-01', foodId: 'f1', grams: 80, kcal: 296.8 },
    { id: 'l2', date: '2026-01-01', foodId: 'f2', grams: 250, kcal: 97.5 },
    { id: 'l3', date: '2026-06-15', foodId: 'f3', grams: 1, kcal: 0 },
  ],
  weights: [
    { date: '2026-01-01', kg: 82.4 },
    { date: '2026-06-15', kg: 79.05 },
  ],
  kv: [
    { k: 'probeGoal', v: 2200 },
    { k: 'probeUnits', v: { mass: 'kg', energy: 'kcal' } },
    { k: 'probeNull', v: null },
  ],
  xp: [
    { key: 'probe-quest', type: 'quest', xp: 240, label: 'test seed', date: '2026-06-15', ts: 1750000000000 },
    { key: 'probe-rung-3', type: 'pitrung', xp: 40, label: 'Ladder: beat rung 3', date: '2026-06-15', ts: 1750000000001 },
  ],
  health: [
    { date: '2026-06-15', steps: 8123, restingHr: 54, hrv: 61.5 },
  ],
};

/* Stores and indexes the CURRENT schema must offer once the upgrade has run.
   Checked as a superset, not equality: a future v4 adding a store is the
   additive change this contract is protecting, and must not read as a failure. */
const EXPECT_STORES = ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv'];
const EXPECT_INDEXES = { foods: ['barcode', 'lastUsedAt'], log: ['date'] };

const { browser, page } = await boot(base);

/* Runs entirely in the page: Node has no IndexedDB, and js/db.js only exists as
   a module served by the app. */
async function migrate(from, stores, rows, expectStores, expectIndexes) {
  return page.evaluate(async (from, stores, rows, expectStores, expectIndexes) => {
    const name = `tally-upgrade-probe-v${from}`;
    const idbDelete = n => new Promise(res => { const r = indexedDB.deleteDatabase(n); r.onsuccess = r.onerror = r.onblocked = () => res(); });
    await idbDelete(name);

    // 1. A genuine old database at the historical schema, seeded and closed.
    const old = await new Promise((res, rej) => {
      const r = indexedDB.open(name, from);
      r.onupgradeneeded = () => {
        for (const s of stores) {
          const os = r.result.createObjectStore(s.name, { keyPath: s.keyPath });
          for (const ix of s.indexes || []) os.createIndex(ix, ix);
        }
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const seeded = {};
    for (const s of stores) {
      const rs = rows[s.name] || [];
      await new Promise((res, rej) => {
        const t = old.transaction(s.name, 'readwrite');
        rs.forEach(row => t.objectStore(s.name).put(row));
        t.oncomplete = res; t.onerror = () => rej(t.error);
      });
      seeded[s.name] = rs;
    }
    old.close();

    // 2. Reopen THROUGH THE APP'S OWN OPEN PATH so the real upgrade steps run.
    const mod = await import('./js/db.js');
    mod.useDbName(name);
    const after = {};
    for (const s of stores) after[s.name] = await mod.db.all(s.name);

    // 3. Every seeded row still there and byte-equal (key-order-stable JSON).
    const stable = v => JSON.stringify(v, (k, x) =>
      x && typeof x === 'object' && !Array.isArray(x)
        ? Object.fromEntries(Object.keys(x).sort().map(kk => [kk, x[kk]]))
        : x);
    const survival = {};
    for (const s of stores) {
      const got = new Set((after[s.name] || []).map(stable));
      const want = seeded[s.name].map(stable);
      survival[s.name] = { want: want.length, got: want.filter(w => got.has(w)).length, read: (after[s.name] || []).length };
    }

    // 4. The new stores and the old indexes exist on the upgraded database.
    const raw = await new Promise((res, rej) => {
      const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const haveStores = [...raw.objectStoreNames];
    const haveIndexes = {};
    for (const sn of Object.keys(expectIndexes)) {
      haveIndexes[sn] = haveStores.includes(sn)
        ? [...raw.transaction(sn, 'readonly').objectStore(sn).indexNames] : [];
    }
    const version = raw.version;
    raw.close();

    // The index is only proven by USING it: indexNames can list an index whose
    // contents an upgrade dropped.
    // try/catch, not bare: a dropped index makes .index() THROW, and an
    // unhandled throw here kills the suite instead of naming the loss.
    let byIndex = -1;
    try { byIndex = (await mod.db.byIndex('foods', 'barcode', rows.foods[0].barcode)).length; }
    catch (e) { byIndex = String(e && e.name || e); }

    await idbDelete(name);
    return {
      survival, version, byIndex,
      missingStores: expectStores.filter(s => !haveStores.includes(s)),
      missingIndexes: Object.entries(expectIndexes)
        .flatMap(([sn, ixs]) => ixs.filter(ix => !(haveIndexes[sn] || []).includes(ix)).map(ix => `${sn}.${ix}`)),
    };
  }, from, stores, rows, expectStores, expectIndexes);
}

for (const from of [1, 2]) {
  const r = await migrate(from, HISTORY[from], ROWS, EXPECT_STORES, EXPECT_INDEXES);
  const tag = `v${from} -> ${r.version}`;
  const lost = Object.entries(r.survival).filter(([, s]) => s.got !== s.want || s.want === 0);
  ok(`${tag}: rows survive the upgrade`, lost.length === 0,
    lost.length
      ? lost.map(([n, s]) => `${n}: ${s.got}/${s.want} rows survived (${s.read} read back)`).join('; ')
      : Object.entries(r.survival).map(([n, s]) => `${n} ${s.got}/${s.want}`).join(', '));
  ok(`${tag}: the version really moved to the current DB_VERSION`, r.version > from, `version = ${r.version}`);
  ok(`${tag}: the new stores exist`, r.missingStores.length === 0, r.missingStores.join(', ') || `all of ${EXPECT_STORES.join(', ')}`);
  ok(`${tag}: the v1 indexes still exist`, r.missingIndexes.length === 0, r.missingIndexes.join(', ') || 'barcode, lastUsedAt, date');
  ok(`${tag}: and an index still returns its rows`, r.byIndex === 1, `foods.barcode lookup returned ${r.byIndex} row(s)`);
}

await browser.close();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nupgrades are additive: no seeded row was lost');
process.exit(fails.length ? 1 : 0);
