/* THE INDEXEDDB UPGRADE PATH IS ADDITIVE: no user row is lost when the DB
 * bumps from v1 or v2 to v3.
 *
 * js/db.js:2 states this as a contract ("upgrades must stay strictly ADDITIVE
 * (create-if-missing only). Existing user data must survive every version
 * bump."), and nothing tested it. The onupgradeneeded body IS guarded per
 * store with `!objectStoreNames.contains(name)` so it looks additive by
 * construction, but that is the exact shape of a hollow check: a future
 * "just this once, drop and recreate" line inside one of those blocks would
 * silently wipe every player's foods/log/etc, and nothing here would go red.
 *
 * Also: the app is a PWA. A player who last opened the app on v1 (Aug 2024
 * calorie tracker) or v2 (Sep 2024 Boneheadz layer) could open v3 today and
 * MUST NOT lose the meals or weights they logged then. This runs that path.
 *
 * WHAT IT DOES, per (v1 -> v3) and (v2 -> v3):
 *   1. Generate a NEW scratch database name that does not exist yet. If a
 *      name from an earlier run somehow survived, we would silently be
 *      testing an upgrade that already happened. Fresh-per-run kills that.
 *   2. Open that name via RAW `indexedDB.open(name, N)` with an
 *      onupgradeneeded that creates only the stores present at version N.
 *      Seed a representative row in every store, close.
 *   3. Instrument `window.indexedDB.open` to record every upgradeneeded
 *      event with its oldVersion/newVersion.
 *   4. Open the same name through js/db.js's `useDbName + db.all` path
 *      (DB_VERSION=3 in the shipped source), which MUST trigger an upgrade.
 *   5. Assert:
 *        (a) upgradeneeded fired with oldVersion=N, newVersion=3
 *        (b) every seeded row is still present and deep-equal
 *        (c) every store added in versions > N now exists (empty is fine)
 *        (d) the database is now at version 3
 *
 * HISTORICAL SCHEMAS, from `git log --follow js/db.js`:
 *   v1 (98e5a3e, 2024-08): foods, log, weights, kv
 *   v2 (9e8414f, 2024-09): + xp, health
 *   v3 (35487e0, 2025+):   + inv
 *
 * PROVE-RED (documented, not run in this audit):
 *   Patch onupgradeneeded to `db.deleteObjectStore('foods'); createObjectStore('foods', ...)`
 *   inside the v1->v3 or v2->v3 path. The "foods rows preserved" assertion
 *   goes red naming the two seeded foods lost.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let srvHandle = null;
let base = process.env.URL;
if (!base) {
  srvHandle = await serveTree(ROOT);
  base = srvHandle.url;
}
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const { browser, page } = await boot(base);

/* SEEDS. Each store gets rows that are (a) deep-equal to a known payload and
 * (b) tagged with the source version so a cross-contamination bug is
 * obvious. Keys are per-store per keyPath. */
const V1_SEEDS = {
  foods:   [{ id: 'v1-food-1', name: 'Apple',  kcal: 95, barcode: 'v1-apple' }, { id: 'v1-food-2', name: 'Banana', kcal: 105 }],
  log:     [{ id: 'v1-log-1', date: '2024-08-01', foodId: 'v1-food-1', kcal: 95 }],
  weights: [{ date: '2024-08-01', kg: 70.5 }],
  kv:      [{ k: 'v1-firstBoot', v: '2024-08-01T00:00:00Z' }],
};
const V2_SEEDS = {
  ...V1_SEEDS,
  xp:      [{ key: 'v2-xp-1', ts: 1725148800000, type: 'meal', points: 10 }],
  health:  [{ date: '2024-09-01', restingHr: 62, hrv: 45 }],
};

async function runUpgradeCase(seededVersion, seeds) {
  const scratchName = `db-upgrade-audit-v${seededVersion}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const storeNames = Object.keys(seeds);
  return await page.evaluate(async (name, ver, storeNamesArg, seedsArg) => {
    /* Step 1: raw open at `ver` on a name that does not exist. onupgradeneeded
       creates only the stores that version had. */
    await new Promise((resolve, reject) => {
      const req = indexedDB.open(name, ver);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s of storeNamesArg) {
          if (d.objectStoreNames.contains(s)) continue;
          if (s === 'foods') d.createObjectStore(s, { keyPath: 'id' });
          else if (s === 'log') d.createObjectStore(s, { keyPath: 'id' });
          else if (s === 'weights') d.createObjectStore(s, { keyPath: 'date' });
          else if (s === 'kv') d.createObjectStore(s, { keyPath: 'k' });
          else if (s === 'xp') d.createObjectStore(s, { keyPath: 'key' });
          else if (s === 'health') d.createObjectStore(s, { keyPath: 'date' });
        }
      };
      req.onsuccess = () => {
        const d = req.result;
        const t = d.transaction(storeNamesArg, 'readwrite');
        for (const s of storeNamesArg) {
          for (const row of seedsArg[s]) t.objectStore(s).put(row);
        }
        t.oncomplete = () => { d.close(); resolve(); };
        t.onerror = () => reject(t.error);
      };
      req.onerror = () => reject(req.error);
    });

    /* Sanity: raw-open with no version returns the version we just wrote. If
       this reads 3, a previous run's DB survived and we would be testing an
       already-migrated tree, not an upgrade. Fresh name per run should make
       this impossible; the guard is here as a check-that-can-fail. */
    const versionBefore = await new Promise((resolve, reject) => {
      const req = indexedDB.open(name);
      req.onsuccess = () => { const v = req.result.version; req.result.close(); resolve(v); };
      req.onerror = () => reject(req.error);
    });

    /* Step 2: instrument indexedDB.open, then open via the app path (js/db.js
       calls indexedDB.open(name, DB_VERSION) internally). The wrapper records
       every upgradeneeded event's oldVersion/newVersion so we can assert the
       upgrade fired with the version we expected, not merely infer it. */
    const upgradeEvents = [];
    const origOpen = window.indexedDB.open.bind(window.indexedDB);
    window.indexedDB.open = function(n, v) {
      const req = origOpen(n, v);
      req.addEventListener('upgradeneeded', (ev) => {
        if (n === name) upgradeEvents.push({ oldVersion: ev.oldVersion, newVersion: ev.newVersion });
      });
      return req;
    };
    let dbMod;
    try {
      dbMod = await import(`./js/db.js?upgrade-${ver}`);   // fresh module instance so dbPromise starts null
      dbMod.useDbName(name);
      const foods = await dbMod.db.all('foods');
      const log = await dbMod.db.all('log');
      const weights = await dbMod.db.all('weights');
      const kv = await dbMod.db.all('kv');
      const xp = await dbMod.db.all('xp');
      const health = await dbMod.db.all('health');
      const inv = await dbMod.db.all('inv');
      const versionAfter = await new Promise((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => { const v = req.result.version; req.result.close(); resolve(v); };
        req.onerror = () => reject(req.error);
      });
      return { versionBefore, versionAfter, upgradeEvents, foods, log, weights, kv, xp, health, inv };
    } finally {
      window.indexedDB.open = origOpen;
      /* Reset the module's cached db handle for the next test's fresh module
         instance; the ?query trick above already handles this at import time. */
    }
  }, scratchName, seededVersion, storeNames, seeds);
}

/* ---- v1 -> v3 --------------------------------------------------------- */
const r1 = await runUpgradeCase(1, V1_SEEDS);
ok('V1->V3  scratch DB was actually at v1 before the app opened it (fresh-name-per-run guard)',
  r1.versionBefore === 1, `versionBefore=${r1.versionBefore}`);
ok('V1->V3  onupgradeneeded fired with oldVersion=1, newVersion=3 (the app path really upgraded)',
  r1.upgradeEvents.some(e => e.oldVersion === 1 && e.newVersion === 3),
  JSON.stringify(r1.upgradeEvents));
ok('V1->V3  DB is now at version 3 (raw-open confirms)',
  r1.versionAfter === 3, `versionAfter=${r1.versionAfter}`);
ok('V1->V3  foods rows preserved (2 rows, deep-equal)',
  JSON.stringify(r1.foods.sort((a, b) => a.id.localeCompare(b.id))) === JSON.stringify(V1_SEEDS.foods),
  JSON.stringify(r1.foods));
ok('V1->V3  log rows preserved',
  JSON.stringify(r1.log) === JSON.stringify(V1_SEEDS.log),
  JSON.stringify(r1.log));
ok('V1->V3  weights rows preserved',
  JSON.stringify(r1.weights) === JSON.stringify(V1_SEEDS.weights),
  JSON.stringify(r1.weights));
ok('V1->V3  kv rows preserved',
  JSON.stringify(r1.kv) === JSON.stringify(V1_SEEDS.kv),
  JSON.stringify(r1.kv));
ok('V1->V3  xp store was created empty (v1 had no xp)',
  Array.isArray(r1.xp) && r1.xp.length === 0, `xp=${JSON.stringify(r1.xp)}`);
ok('V1->V3  health store was created empty',
  Array.isArray(r1.health) && r1.health.length === 0, `health=${JSON.stringify(r1.health)}`);
ok('V1->V3  inv store was created empty',
  Array.isArray(r1.inv) && r1.inv.length === 0, `inv=${JSON.stringify(r1.inv)}`);

/* ---- v2 -> v3 --------------------------------------------------------- */
const r2 = await runUpgradeCase(2, V2_SEEDS);
ok('V2->V3  scratch DB was actually at v2 before the app opened it',
  r2.versionBefore === 2, `versionBefore=${r2.versionBefore}`);
ok('V2->V3  onupgradeneeded fired with oldVersion=2, newVersion=3',
  r2.upgradeEvents.some(e => e.oldVersion === 2 && e.newVersion === 3),
  JSON.stringify(r2.upgradeEvents));
ok('V2->V3  DB is now at version 3',
  r2.versionAfter === 3, `versionAfter=${r2.versionAfter}`);
ok('V2->V3  foods rows preserved',
  JSON.stringify(r2.foods.sort((a, b) => a.id.localeCompare(b.id))) === JSON.stringify(V2_SEEDS.foods),
  JSON.stringify(r2.foods));
ok('V2->V3  log rows preserved',
  JSON.stringify(r2.log) === JSON.stringify(V2_SEEDS.log),
  JSON.stringify(r2.log));
ok('V2->V3  weights rows preserved',
  JSON.stringify(r2.weights) === JSON.stringify(V2_SEEDS.weights),
  JSON.stringify(r2.weights));
ok('V2->V3  kv rows preserved',
  JSON.stringify(r2.kv) === JSON.stringify(V2_SEEDS.kv),
  JSON.stringify(r2.kv));
ok('V2->V3  xp rows preserved (v2 already had xp)',
  JSON.stringify(r2.xp) === JSON.stringify(V2_SEEDS.xp),
  JSON.stringify(r2.xp));
ok('V2->V3  health rows preserved (v2 already had health)',
  JSON.stringify(r2.health) === JSON.stringify(V2_SEEDS.health),
  JSON.stringify(r2.health));
ok('V2->V3  inv store was created empty (v3 addition)',
  Array.isArray(r2.inv) && r2.inv.length === 0, `inv=${JSON.stringify(r2.inv)}`);

await browser.close();
if (srvHandle) srvHandle.close();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
