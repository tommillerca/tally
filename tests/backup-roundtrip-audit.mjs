/* EXPORT / IMPORT: the player's data, round-trip, deep-equal.
 *
 * Settings -> YOUR DATA fires exportAll (js/db.js:84) and importAll (js/db.js:91).
 * exportAll reads seven object stores and returns them all in one JSON payload;
 * importAll iterates each store's array and calls db.put on every row. Today,
 * the ONLY behavioural check anywhere near this is a toast reading counts from
 * importAll's return value, and it is not the counts of what was ingested (see
 * finding B below). No test asserts a byte-equal round trip.
 *
 * THIS TEST DOES THE ROUND TRIP. Seed each store with a distinct row, capture
 * the exportAll payload, mutate the DB to a different state, importAll the
 * captured payload, then read each store back and deep-equal every row against
 * the original. Any drift is a FAIL.
 *
 * DEEP-EQUAL uses JSON canonical form (same shape the db-upgrade audit uses,
 * per Gwart's brief): sort each store's rows by its own keyPath, JSON.stringify
 * with sorted object keys inside each row, compare the strings. This catches
 * any missing field, changed value, or reordered array element that would slip
 * a shallow equality.
 *
 * FINDINGS TO REPORT AS FINDINGS, NOT FIX (per brief):
 *   A. `#exportBtn` in js/app.js:7585 early-returns on `isNative()` with a
 *      toast, so tapping "Export" on iOS/Android does NOT run exportAll and
 *      DOES NOT produce a file. The comment says cloud backup covers this;
 *      the visible affordance is misleading either way. Static check + note.
 *   B. importAll's returned counts are `{ foods, log, weights }` only. kv,
 *      xp, health and inv are silently imported but not counted, so the
 *      toast that reads those counts UNDERCOUNTS what was ingested. Measured.
 *   C. importAll is NOT transactional: each `db.put` is its own tx (js/db.js
 *      lines 61 + 91). A mid-import failure (quota, corrupt row) leaves the
 *      profile HALF-RESTORED with no visible warning. Measured by simulating
 *      a mid-run failure inside our own eval and reading the resulting DB.
 *
 * ADDED 2026-08-16, gwart/dbimport: THE RESTORE GUARDS.
 * importAll used to be upsert-only, which made Settings -> Export -> spend ->
 * Import an unlimited item and currency duplication loop: the kv coin row came
 * back at its pre-spend value and the inv row the purchase minted was never
 * removed. Four guard families now hold the fix down, each proven red against a
 * deliberately broken tree before being trusted:
 *   SPEND      export, buy a real drop piece through loot.buyDropItem, import
 *              the pre-spend backup. The piece must be gone, not just paid for
 *              twice. Red against upsert-only importAll.
 *   MALFORMED  the risk the fix introduces. A backup with an unkeyable row must
 *              be rejected AND leave every store byte-identical, because the
 *              clear runs inside the same transaction as the puts. Red against
 *              a tree with the t.abort() removed from importAll's catch, where
 *              the sync DataError commits the clear and empties three stores.
 *   OMITTED    a store the backup does not mention is NOT cleared (no put would
 *              restore it); a store it declares empty IS. Red against a tree
 *              that clears every store unconditionally.
 *   IDENTITY   kv holds the account key as well as the coin balance. A backup
 *              taken before this device registered must not sign it out. Red
 *              against upsert-only for the kv half of the loop.
 * The per-store RESTORE rows below replaced an informational note that reported
 * the additive shape as a design question. It was the bug.
 *
 * Run: node tests/backup-roundtrip-audit.mjs [baseUrl]
 */
import { boot, sleep, serveTree } from './godmode.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv[2] || process.env.URL;
const srvHandle = argv ? null : await serveTree(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const srv = { kill: () => srvHandle && srvHandle.close() };
const base = argv || srvHandle.url;

const { browser, page } = await boot(base);
let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };
/* Findings are REPORTED, not asserted. They describe existing behaviour that
   predates this branch, not new breakage; the audit's exit code tracks real
   round-trip drift (data-loss shape). A green gate means the export/import
   contract holds byte-equal, not that the findings are resolved. Each
   finding is prefixed FINDING and printed with its own kind (INFO / RISK). */
const finding = (kind, l, d = '') => console.log(`FINDING-${kind}  ${l}${d ? '\n  ' + d : ''}`);

/* -------- STORE SCHEMA. matches js/db.js's onupgradeneeded exactly, so my
   seed rows have the right keyPath for each store. Getting a keyPath wrong
   would either put nothing or overwrite an existing row silently. */
const STORES = [
  { name: 'foods',   key: 'id' },
  { name: 'log',     key: 'id' },
  { name: 'weights', key: 'date' },
  { name: 'kv',      key: 'k' },
  { name: 'xp',      key: 'key' },
  { name: 'health',  key: 'date' },
  { name: 'inv',     key: 'id' },
];

/* -------- SEED. One distinct row per store, all with deterministic content
   so failures name the exact drift. Values chosen to include nested objects,
   arrays, and numbers so a shallow copy would be visibly broken. */
const seeded = await page.evaluate(async () => {
  const { db } = await import('./js/db.js');
  const rows = {
    foods:   [{ id: 'F_apple',  name: 'Bone Apple',  kcal: 90,  macros: { p: 0, f: 0, c: 24 }, lastUsedAt: 1720000000000 },
              { id: 'F_bar',    name: 'Marrow Bar',  kcal: 210, macros: { p: 15, f: 8, c: 20 } }],
    log:     [{ id: 'L_1', date: '2026-01-10', foodId: 'F_apple', kcal: 90, name: 'apple', ts: 1720000010000 },
              { id: 'L_2', date: '2026-01-11', foodId: 'F_bar',   kcal: 210, name: 'bar',  ts: 1720000020000, tags: ['snack', 'pm'] }],
    weights: [{ date: '2026-01-01', kg: 72.5 }, { date: '2026-01-15', kg: 72.1 }],
    kv:      [{ k: 'coins', v: 350 }, { k: 'settings', v: { units: 'kg', targetKcal: 2200, notch: true } }],
    xp:      [{ key: 'X_first',  type: 'quest',   xp: 40, date: '2026-01-05', ts: 1720000100000 },
              { key: 'X_second', type: 'pitrung', xp: 40, date: '2026-01-06', ts: 1720000110000, label: 'Ladder: beat rung 3' }],
    health:  [{ date: '2026-01-15', steps: 5000, sleep: 420, restingHr: 58 }],
    inv:     [{ id: 'I_1', type: 'cosmetic', slot: 'H',  qty: 3, gotAt: 1720000200000 }],
  };
  for (const store of Object.keys(rows)) {
    for (const row of rows[store]) await db.put(store, row);
  }
  return { rows };
});

/* -------- EXPORT. Capture the payload. */
const payload = await page.evaluate(async () => {
  const { exportAll } = await import('./js/db.js');
  return await exportAll();
});

/* -------- STRUCTURE CHECKS on the payload. */
check('exportAll payload declares itself a tally backup', payload && payload.app === 'tally', JSON.stringify({ app: payload?.app, version: payload?.version }));
check('exportAll payload carries all seven stores as arrays',
  STORES.every(s => Array.isArray(payload[s.name])),
  STORES.map(s => `${s.name}:${Array.isArray(payload[s.name]) ? payload[s.name].length : 'MISSING'}`).join(' '));
check('exportAll payload has an exportedAt timestamp', typeof payload?.exportedAt === 'string' && /\d{4}/.test(payload.exportedAt), payload?.exportedAt);
check('exportAll payload has a version integer', typeof payload?.version === 'number', `version=${payload?.version}`);
/* Every seeded row must appear in the exported payload (before we even
   round-trip it). An exportAll that quietly drops a store would fail here. */
for (const s of STORES) {
  const seededRows = seeded.rows[s.name];
  const exportedRows = payload[s.name] || [];
  /* Match by keyPath, not by count: the store total on a demo profile can
     be in the hundreds, and printing "168 rows in export" alongside "2
     expected" reads like a count check. It is a keyed lookup. Report
     matched/expected explicitly so a green line names what was actually
     verified: N of N seeded rows found by key, and the total is context. */
  const missing = seededRows.filter(sr => !exportedRows.find(er => er[s.key] === sr[s.key])).map(r => r[s.key]);
  const matched = seededRows.length - missing.length;
  check(`EXPORT  ${s.name}: every seeded row was matched by key in the export`,
    missing.length === 0,
    missing.length
      ? `only ${matched}/${seededRows.length} matched by key; missing: ${missing.join(',')}`
      : `${matched}/${seededRows.length} seeded rows matched by key (store total in export: ${exportedRows.length})`);
}

/* -------- MUTATE. Clear each store completely, then put a stray row into
   each so the import step has to overwrite AND fill. If a store is left
   empty after import, the deep-equal below flags it. */
await page.evaluate(async STORES => {
  const { db } = await import('./js/db.js');
  for (const s of STORES) {
    await db.clear(s.name);
    /* One stray row per store, keyed so importAll's put would NOT clobber it,
       so a broken import that fails to write leaves the stray behind and the
       deep-equal catches the drift. */
    const stray = { [s.key]: `STRAY_${s.name}` };
    if (s.name === 'foods') Object.assign(stray, { name: 'strayfood', kcal: 0 });
    if (s.name === 'log')   Object.assign(stray, { date: '2020-01-01', kcal: 0, name: 'stray' });
    if (s.name === 'kv')    Object.assign(stray, { v: 'stray' });
    if (s.name === 'xp')    Object.assign(stray, { type: 'stray', xp: 0, date: '2020-01-01', ts: 0 });
    if (s.name === 'health')Object.assign(stray, { steps: 0 });
    if (s.name === 'weights') Object.assign(stray, { kg: 0 });
    if (s.name === 'inv')   Object.assign(stray, { type: 'stray', qty: 0 });
    await db.put(s.name, stray);
  }
}, STORES);

/* -------- IMPORT the captured payload. */
const importResult = await page.evaluate(async payload => {
  const { importAll } = await import('./js/db.js');
  try {
    const counts = await importAll(payload);
    return { counts, err: null };
  } catch (e) {
    return { counts: null, err: String(e) };
  }
}, payload);
check('IMPORT  importAll did not throw', !importResult.err, importResult.err || '');
check('IMPORT  importAll returned a counts object', !!importResult.counts, JSON.stringify(importResult.counts));

/* -------- FINDING B: counts undercount. importAll returns
   { foods, log, weights } only, so the Settings-YOUR-DATA toast that reads
   those numbers lies about anything ingested into kv/xp/health/inv. */
const countKeys = importResult.counts ? Object.keys(importResult.counts).sort() : [];
const bMissing = ['kv', 'xp', 'health', 'inv'].filter(k => !countKeys.includes(k));
if (bMissing.length) {
  finding('B (INFO)  importAll counts undercount what was ingested',
    `returned keys: [${countKeys.join(', ')}], silently ingested but not counted: [${bMissing.join(', ')}]. Settings-YOUR-DATA toast reads only foods/log/weights and would tell a player "Imported 0 log entries, 0 foods" on a restore of a profile whose only rows were XP or health. No data loss, but the player-visible number is a lie by omission.`);
}

/* -------- READ BACK every store. */
const afterImport = await page.evaluate(async STORES => {
  const { db } = await import('./js/db.js');
  const out = {};
  for (const s of STORES) out[s.name] = await db.all(s.name);
  return out;
}, STORES);

/* -------- DEEP-EQUAL against the original payload. Canonicalise both sides:
   sort each store's rows by keyPath, JSON.stringify each row with sorted
   object keys. String comparison then catches any drift including reordered
   nested keys or dropped fields. */
function canon(row) {
  if (row === null || typeof row !== 'object') return JSON.stringify(row);
  if (Array.isArray(row)) return '[' + row.map(canon).join(',') + ']';
  const keys = Object.keys(row).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canon(row[k])).join(',') + '}';
}
function canonSorted(rows, key) {
  return rows.slice().sort((a, b) => String(a[key]).localeCompare(String(b[key]))).map(canon);
}
for (const s of STORES) {
  const original = canonSorted(payload[s.name] || [], s.key);
  const back = canonSorted(afterImport[s.name] || [], s.key);
  /* The stray row we injected during MUTATE has key STRAY_<store>. If it is
     still there after the round trip, importAll left orphans; that is the
     append-only-shape of the writer, which is a decision either way, but the
     ROUND-TRIP property still needs every ORIGINAL row present and byte-equal.
     So filter the stray out of the "back" set for the compare and check the
     stray's presence separately below. */
  const strayKey = `STRAY_${s.name}`;
  const backNoStray = back.filter(c => !c.includes(strayKey));
  const equal = JSON.stringify(original) === JSON.stringify(backNoStray);
  check(`ROUND-TRIP  ${s.name}: every original row came back byte-equal (${original.length} rows)`, equal,
    equal ? '' : `diff (${original.length} original vs ${backNoStray.length} back):\n        original: ${original.join('\n        ')}\n        back:     ${backNoStray.join('\n        ')}`);
  /* A RESTORE REMOVES WHAT THE BACKUP DOES NOT CONTAIN. This used to be an
     informational note about importAll being purely additive. Additive is
     the duplication bug: a row minted after the export survives the restore
     while the currency that paid for it is refunded. The stray rows were
     written during MUTATE and appear nowhere in the payload, so the ONLY
     correct count of them after the restore is zero.
     DIRECTION: failure is the stray still being there, i.e. more rows than
     the backup carried. BOUND: exactly the payload's row count, never more. */
  const strayStillThere = back.some(c => c.includes(strayKey));
  check(`RESTORE  ${s.name}: a row the backup does not contain is gone after the restore (BOUND: ${original.length} rows, the payload count, never more)`,
    !strayStillThere && back.length === original.length,
    strayStillThere
      ? `stray row ${strayKey} SURVIVED the restore; store holds ${back.length} rows where the backup carried ${original.length}. An upsert-only import cannot remove a row, so anything minted after the export is kept for free while the kv currency that paid for it is restored.`
      : `${back.length} rows, matches the payload`);
}

/* -------- FINDING C: partial import (no transactional wrap).
   Simulate a mid-import failure by re-running importAll with the DB in a
   quota-exhausted state, and check what state is left afterward. Puppeteer
   cannot exhaust real quota cheaply, so mimic the shape instead: monkey-patch
   window.__mockPutFailsAfter to a number, wrap db.put to throw after that many
   calls, then re-import and observe the DB state. This tests the SEMANTIC
   property that importAll is not atomic across stores, and any drift means
   a partial state is possible in the wild too. */
const partial = await page.evaluate(async payload => {
  const dbMod = await import('./js/db.js');
  const { db, importAll } = dbMod;
  /* Wipe first so we start from a known baseline. */
  for (const s of ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv']) await db.clear(s);
  /* Monkey-patch db.put to fail on the 5th call. importAll walks stores in a
     fixed order: foods, log, weights, kv, xp, health, inv. Depending on how
     many rows are in each, the 5th call may land in the middle of any store,
     and the ROUND-TRIP set has ~11 rows total, so the failure is mid-way. */
  const origPut = db.put;
  let calls = 0;
  db.put = async (store, val) => {
    calls++;
    if (calls === 5) throw new Error('SYNTHETIC quota exhausted mid-import');
    return origPut(store, val);
  };
  let err = null;
  try { await importAll(payload); } catch (e) { err = String(e); }
  db.put = origPut;
  const state = {};
  for (const s of ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv']) state[s] = (await db.all(s)).length;
  const anythingWritten = Object.values(state).some(n => n > 0);
  const everythingWritten = Object.values(state).every((n, i) => n === (payload[Object.keys(state)[i]] || []).length);
  return { err, state, anythingWritten, everythingWritten };
}, payload);
/* Finding C fires only if the DB is in an actual MID-state (some stores
   populated, others empty). With the fix on ext/data-safety, importAll
   opens ONE multi-store transaction and commits atomically; the
   synthetic monkey-patch on db.put does not intercept the transaction
   layer, so on the fixed tree this audit sees everythingWritten=true
   and correctly does NOT surface Finding C. If the fix regresses, the
   synthetic mid-state returns and this row fires again. */
if (partial.anythingWritten && !partial.everythingWritten) {
  finding('C (RISK)  importAll is NOT transactional across stores',
    `state after mid-import synthetic failure: ${JSON.stringify(partial.state)}  err=${partial.err}. Each row is put in its own tx (js/db.js:61 + :91), so a real mid-import failure (quota, corrupt row, tab close) leaves the DB in a state that is NEITHER the previous save NOR the restore. The Settings-YOUR-DATA toast on failure says "Import failed: <err>", and the player has no way to know their profile is now partially overwritten. Same additive-storage discipline as the rest of the app SHOULD apply, and a single readwrite tx across all stores would give it. Not fixed here per findings-only rule; sw.js/db.js is Reg's file class.`);
}

/* ============================================================================
   GUARD 1: A SPEND CANNOT BE UNDONE BY A RESTORE.
   The highest-severity thing this file protects. Export, spend real coins on a
   real drop piece through the shop's own buyDropItem, then import the backup
   that was taken BEFORE the spend. The restore refunds the coins because the
   file carries the kv row. It must ALSO take the piece back, because the file
   does not carry the inv row the purchase minted. Coins and goods move
   together or the player nets a free item on every lap.
   DIRECTION: failure is ending up with the pre-spend coin balance AND the
   piece. BOUND: owned drop pieces after the restore is exactly the 0 the
   backup carried, never 1.  */
const spendGuard = await page.evaluate(async () => {
  const { db, exportAll, importAll, kvSet } = await import('./js/db.js');
  const loot = await import('./js/loot.js');
  for (const s of ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv']) await db.clear(s);
  await kvSet('coins', 6500);
  await db.put('log', { id: 'L_guard', date: '2026-02-01', kcal: 10, name: 'guard' });  // importAll needs a log array
  const ITEM = 'T9-5';
  const before = { coins: await loot.coins(), owns: (await loot.ownedCosmeticIds()).has(ITEM), invRows: (await db.all('inv')).length };
  const backup = await exportAll();
  const buy = await loot.buyDropItem(ITEM);
  const afterSpend = { coins: await loot.coins(), owns: (await loot.ownedCosmeticIds()).has(ITEM), invRows: (await db.all('inv')).length };
  let err = null;
  try { await importAll(backup); } catch (e) { err = String(e); }
  const afterRestore = { coins: await loot.coins(), owns: (await loot.ownedCosmeticIds()).has(ITEM), invRows: (await db.all('inv')).length };
  return { buy, before, afterSpend, afterRestore, err, backupInvRows: (backup.inv || []).length };
});
/* Empty-sample guard: if the purchase never happened the rest of this block
   is comparing a state to itself and would pass vacuously. */
check('SPEND  SETUP the purchase actually went through (an unbought item makes every check below vacuous)',
  spendGuard.buy && spendGuard.buy.ok === true && spendGuard.afterSpend.owns === true && spendGuard.afterSpend.coins < spendGuard.before.coins,
  `buy=${JSON.stringify(spendGuard.buy)} coins ${spendGuard.before.coins} -> ${spendGuard.afterSpend.coins}, owns ${spendGuard.before.owns} -> ${spendGuard.afterSpend.owns}`);
check('SPEND  restoring the pre-spend backup did not throw', !spendGuard.err, spendGuard.err || '');
check('SPEND  the restore took the purchase back (BOUND: 0 owned drop pieces, exactly what the backup carried)',
  spendGuard.afterRestore.owns === false,
  spendGuard.afterRestore.owns
    ? `FREE ITEM. coins ${spendGuard.before.coins} -> ${spendGuard.afterSpend.coins} (spent ${spendGuard.before.coins - spendGuard.afterSpend.coins}) -> ${spendGuard.afterRestore.coins} after the restore, and the piece is STILL OWNED. The backup carried ${spendGuard.backupInvRows} inv rows, the DB now holds ${spendGuard.afterRestore.invRows}. Export, spend, import is an unlimited duplication loop through the Settings buttons.`
    : `coins ${spendGuard.before.coins} -> ${spendGuard.afterSpend.coins} -> ${spendGuard.afterRestore.coins}, piece gone, inv rows ${spendGuard.afterRestore.invRows} == backup ${spendGuard.backupInvRows}`);
check('SPEND  the restored inv store holds exactly the rows the backup carried, never more',
  spendGuard.afterRestore.invRows === spendGuard.backupInvRows,
  `after restore ${spendGuard.afterRestore.invRows}, backup ${spendGuard.backupInvRows}, after spend ${spendGuard.afterSpend.invRows}`);

/* ============================================================================
   GUARD 2: A MALFORMED IMPORT LEAVES THE OLD SAVE INTACT.
   This is the risk the clear introduces, so it is asserted, not assumed.
   A row with no value at its keyPath makes os.put throw SYNCHRONOUSLY, and a
   sync DataError does NOT abort an IndexedDB transaction on its own: left
   alone the transaction COMMITS, clear included, and the store is emptied.
   importAll's catch calls t.abort() for exactly this reason. Assert both the
   rejection copy and that every store still holds its pre-import bytes. */
const malformed = await page.evaluate(async () => {
  const { db, exportAll, importAll, kvSet } = await import('./js/db.js');
  const NAMES = ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv'];
  for (const s of NAMES) await db.clear(s);
  await kvSet('coins', 4242);
  await db.put('foods', { id: 'F_keep', name: 'keep me', kcal: 1 });
  await db.put('log', { id: 'L_keep', date: '2026-03-01', kcal: 1, name: 'keep' });
  await db.put('inv', { id: 'I_keep', kind: 'cos', itemId: 'H11-1' });
  await db.put('xp', { key: 'X_keep', type: 'quest', xp: 5, date: '2026-03-01', ts: 1 });
  const snapshot = await exportAll();
  /* A payload that is valid at the header, would overwrite kv and foods, and
     then hits a row with no `id` in the LAST store. Everything before it has
     already been cleared and re-put inside the transaction by then. */
  const bad = JSON.parse(JSON.stringify(snapshot));
  bad.kv = [{ k: 'coins', v: 999999 }];
  bad.foods = [{ id: 'F_evil', name: 'evil', kcal: 0 }];
  bad.inv = [{ NO_KEYPATH_HERE: true }];
  let err = null;
  try { await importAll(bad); } catch (e) { err = e && e.message ? e.message : String(e); }
  const after = {};
  for (const s of NAMES) after[s] = await db.all(s);
  return { err, snapshot, after };
});
check('MALFORMED  a backup with an unkeyable row is REJECTED, not half-applied', !!malformed.err, `err=${malformed.err}`);
/* The copy contract. js/app.js prints `Import failed: <message>`, and that
   sentence promises the old save is untouched. If the fix ever makes that a
   lie the copy has to change, so pin the literal string. */
check('MALFORMED  the rejection still promises "Your old data is unchanged" (the copy contract js/app.js prints verbatim)',
  typeof malformed.err === 'string' && malformed.err.includes('Your old data is unchanged'),
  `err=${malformed.err}`);
for (const s of STORES) {
  const before = canonSorted(malformed.snapshot[s.name] || [], s.key);
  const after = canonSorted(malformed.after[s.name] || [], s.key);
  const equal = JSON.stringify(before) === JSON.stringify(after);
  check(`MALFORMED  ${s.name}: the old save is byte-identical after the failed restore (${before.length} rows)`, equal,
    equal ? `${after.length} rows unchanged` :
      `ROLLBACK FAILED. before: ${before.join(' | ') || '(none)'}\n        after:  ${after.join(' | ') || '(none)'}`);
}

/* ============================================================================
   GUARD 3: A STORE THE BACKUP OMITS IS NOT WIPED.
   Clear-then-put destroys data exactly here, because there is no put to
   restore it. An older export that predates a store carries no key for it.
   Absent means "no information", so leave it alone; an explicit empty array
   means "this store held nothing", so honour it. Both directions checked. */
const omitted = await page.evaluate(async () => {
  const { db, exportAll, importAll } = await import('./js/db.js');
  const NAMES = ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv'];
  for (const s of NAMES) await db.clear(s);
  await db.put('log', { id: 'L_o', date: '2026-04-01', kcal: 1, name: 'o' });
  await db.put('inv', { id: 'I_o1', kind: 'cos', itemId: 'H11-1' });
  await db.put('health', { date: '2026-04-01', steps: 100 });
  const snap = await exportAll();
  const noInv = JSON.parse(JSON.stringify(snap));
  delete noInv.inv;                 // key absent entirely: an older backup shape
  const emptyHealth = { ...noInv, health: [] };  // key present, explicitly empty
  let err = null, res = null;
  try { res = await importAll(emptyHealth); } catch (e) { err = String(e); }
  return { err, res, invAfter: (await db.all('inv')).map(r => r.id), healthAfter: (await db.all('health')).length };
});
check('OMITTED  a store the backup does not mention survives the restore untouched', !omitted.err && omitted.invAfter.length === 1,
  `err=${omitted.err || 'none'} inv after=${JSON.stringify(omitted.invAfter)}, skipped=${JSON.stringify(omitted.res && omitted.res.skipped)}`);
check('OMITTED  importAll reports which stores it skipped, so a support ticket can name them',
  !!(omitted.res && Array.isArray(omitted.res.skipped) && omitted.res.skipped.includes('inv')),
  JSON.stringify(omitted.res && omitted.res.skipped));
check('OMITTED  a store the backup declares EMPTY is cleared, because that is what the file says it held (BOUND: 0 rows)',
  omitted.healthAfter === 0, `health rows after restore: ${omitted.healthAfter}`);

/* ============================================================================
   GUARD 4: A RESTORE DOES NOT SIGN THE DEVICE OUT OF ITS ACCOUNT.
   kv holds the account private key as well as the coin balance. A backup
   taken before this device registered carries no `identity` row, so a naive
   clear of kv would orphan the account with no put to bring it back and no
   keychain on the web to recover from. The device rows survive; ordinary kv
   game state the backup does not carry still goes, or the loop is back. */
const identityGuard = await page.evaluate(async () => {
  const { db, exportAll, importAll, kvGet, kvSet } = await import('./js/db.js');
  const NAMES = ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv'];
  for (const s of NAMES) await db.clear(s);
  await kvSet('coins', 100);
  await db.put('log', { id: 'L_i', date: '2026-05-01', kcal: 1, name: 'i' });
  const snap = await exportAll();                 // taken BEFORE the device registers
  await kvSet('identity', { pubJwk: 'PUB', privJwk: 'PRIV' });
  await kvSet('cloudOff', true);
  await kvSet('someLaterGameKey', 777);           // ordinary game state, not device state
  let err = null;
  try { await importAll(snap); } catch (e) { err = String(e); }
  return {
    err,
    identity: await kvGet('identity', null),
    cloudOff: await kvGet('cloudOff', null),
    laterGameKey: await kvGet('someLaterGameKey', null),
    coins: await kvGet('coins', null),
  };
});
check('IDENTITY  restoring a backup with no identity row does NOT sign the device out',
  !identityGuard.err && identityGuard.identity && identityGuard.identity.privJwk === 'PRIV',
  `err=${identityGuard.err || 'none'} identity=${JSON.stringify(identityGuard.identity)}`);
check('IDENTITY  the device cloud-backup consent flag survives too', identityGuard.cloudOff === true, `cloudOff=${identityGuard.cloudOff}`);
check('IDENTITY  ordinary kv game state the backup does not carry is still removed (or the duplication loop is back through kv)',
  identityGuard.laterGameKey === null, `someLaterGameKey after restore = ${JSON.stringify(identityGuard.laterGameKey)}`);
check('IDENTITY  the backup\'s own kv values still win', identityGuard.coins === 100, `coins=${identityGuard.coins}`);

/* -------- FINDING A: exportBtn short-circuits on isNative().
   Static check on app.js source, since headless is not native and cannot
   directly reach the isNative() branch. Confirms the shape of the finding
   Gwart flagged: on iOS/Android the visible export button does not run
   exportAll and produces no file. */
const appSrc = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js/app.js'), 'utf8');
const idx = appSrc.indexOf("$('#exportBtn').addEventListener");
const handler = appSrc.slice(idx, appSrc.indexOf('$', idx + 200) + 0); // rough handler body
const nativeSkip = /if\s*\(\s*isNative\(\)\s*\)\s*\{[^}]*toast\([^}]*return\s*;/s.test(handler);
if (nativeSkip) {
  finding('A (INFO)  the export button is a toast-only no-op on native shells',
    'js/app.js:~7585, `if (isNative()) { toast(...); return; }` inside the #exportBtn handler. On iOS/Android the button visibly "works" but does NOT run exportAll and produces NO file. The comment says cloud backup covers this and it may well be the right shape; the visible affordance is nevertheless misleading. Reg\'s call whether to (a) grey the button on native, (b) rename it "Copy backup passphrase" and route to the cloud flow, or (c) leave the toast.');
}

await browser.close();
srv.kill();
console.log(bad ? `\n${bad} FAILED` : '\nBACKUP ROUND-TRIP VERIFIED');
process.exit(bad ? 1 : 0);
