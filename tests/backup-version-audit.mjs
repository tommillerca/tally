/* tests/backup-version-audit.mjs: A BACKUP'S VERSION IS READ, AND A SKIPPED
 * STORE IS SAID OUT LOUD. QA round 25 M6, 2026-09-03.
 *
 * THE BUG. exportAll() stamped `version: 3` as a literal that nothing tied to
 * DB_VERSION, and NOTHING anywhere read `data.version` back. Measured on tip:
 *   - a `version:1` payload with no `inv` or `health` keys imported clean,
 *     importAll recorded skipped:["health","inv"], and js/app.js's
 *     importSummary threw that list away before the toast, so the player saw
 *     "Restored 12 log entries" with two stores silently untouched;
 *   - a `version:9` payload carrying an eighth store was accepted and the
 *     unknown store dropped on the floor, which is exactly what a launch
 *     update does to every existing player's backup the day a store is added.
 *
 * THE FIX, each link pinned by a row below:
 *   VERSION-DERIVED  exportAll writes `version: DB_VERSION`, not a literal.
 *   V1-SKIPPED       importAll still reports the stores a v1 file omits, AND
 *                    importSummary names them: "Restored 5 of 7 stores.
 *                    Health and inventory were not in this backup."
 *   SAME-CLEAN       a current-version file with all seven stores skips
 *                    nothing and the summary says nothing about it (control).
 *   NEWER-REFUSED    a file stamped above DB_VERSION is refused with copy that
 *                    says "newer" and "update", and no store is touched.
 *
 * No browser: tests/mem-idb.mjs under the REAL js/db.js, and importSummary
 * lifted out of js/app.js source with new Function (same trick unit.test.js
 * uses for nextArtTier), because it is pure copy over a counts object.
 *
 * PROVEN RED on tip f3cb6377 before the fix (2026-09-03):
 *   FAIL VERSION-DERIVED  | exportAll still stamps a literal
 *   FAIL V1-SKIPPED summary names the missing stores  | importSummary not found in app.js
 *   FAIL NEWER-REFUSED importAll refuses a newer file  | resolved: {"foods":0,"log":1,...}
 *   FAIL NEWER-REFUSED nothing was written  | 2 log rows, ghost store swallowed
 * Controls (V1-SKIPPED list, SAME-CLEAN, untouched inv) were green on tip.
 *
 *   node tests/backup-version-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './mem-idb.mjs';   // installs globalThis.indexedDB (shared with backup-key-audit, log-xp-farm-audit)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ok = (l, pass, d = '') => { console.log(`${pass ? 'ok  ' : 'FAIL'} ${l}${d ? '  | ' + d : ''}`); if (!pass) bad++; };

const dbSrc = fs.readFileSync(path.join(ROOT, 'js/db.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
/* Read from SOURCE, not imported: on the pre-fix tree DB_VERSION is not exported
   and a missing named import is a link error that would hide every row below. */
const DB_VERSION = Number(dbSrc.match(/^const DB_VERSION = (\d+);/m)?.[1] || dbSrc.match(/^export const DB_VERSION = (\d+);/m)?.[1]);
ok('SETUP  DB_VERSION read from js/db.js', Number.isInteger(DB_VERSION) && DB_VERSION > 0, String(DB_VERSION));

const { db, exportAll, importAll, STORES } = await import(ROOT + '/js/db.js');

/* ---- VERSION-DERIVED ---------------------------------------------------- */
const exportLine = dbSrc.match(/return \{ app: 'tally', version: ([^,]+),/)?.[1];
ok('VERSION-DERIVED  exportAll stamps DB_VERSION, not a literal', exportLine === 'DB_VERSION', `exportAll still stamps ${JSON.stringify(exportLine)}`);
ok('VERSION-DERIVED  the exported file carries that number', (await exportAll()).version === DB_VERSION);

/* importSummary, lifted from js/app.js. The M6 block starts at STORE_WORDS and
   ends at the close of importSummary; absent on tip, which is the red. */
const sumSrc = appSrc.match(/const STORE_WORDS = [\s\S]*?\nfunction importSummary\(counts\) \{[\s\S]*?\n\}\n/)?.[0];
const importSummary = sumSrc ? new Function('STORES', `${sumSrc}; return importSummary;`)(STORES) : null;

/* ---- V1-SKIPPED --------------------------------------------------------- */
const row = (id, kcal) => ({ id, date: '2026-09-01', meal: 0, ts: 1, foodId: null, name: 'audit', portionLabel: '', kcal, p: 0, c: 0, f: 0 });
await db.put('inv', { id: 'inv-keep', kind: 'crate', crate: 'daily' });
await db.put('log', row('L-old', 100));
const v1 = { app: 'tally', version: 1, exportedAt: 'x', foods: [], log: [row('L-v1', 200)], weights: [], kv: [], xp: [] };
let c1, e1;
try { c1 = await importAll(v1); } catch (e) { e1 = e; }
ok('V1-SKIPPED  a v1 file still imports (older is allowed, it is what every existing player holds)', !!c1, e1 ? e1.message : '');
ok('V1-SKIPPED  importAll reports the two stores the file did not carry', JSON.stringify(c1?.skipped) === '["health","inv"]', JSON.stringify(c1?.skipped));
ok('V1-SKIPPED  the skipped store was left alone, not cleared', (await db.all('inv')).length === 1);
const s1 = importSummary ? importSummary(c1) : null;
ok('V1-SKIPPED  summary names the missing stores', !!s1 && /Restored 5 of 7 stores\. Health and inventory were not in this backup\./.test(s1),
  importSummary ? JSON.stringify(s1) : 'importSummary/STORE_WORDS not found in app.js');

/* ---- SAME-CLEAN (control) ---------------------------------------------- */
const same = { ...(await exportAll()), log: [row('L-same', 300)] };
const c2 = await importAll(same);
ok('SAME-CLEAN  a current-version file with all seven stores skips nothing', c2.skipped.length === 0, JSON.stringify(c2.skipped));
const s2 = importSummary ? importSummary(c2) : null;
ok('SAME-CLEAN  summary says nothing about missing stores', !!s2 && !/not in this backup/.test(s2), JSON.stringify(s2));

/* ---- NEWER-REFUSED ------------------------------------------------------ */
const before = (await db.all('log')).map(r => r.id).sort();
const newer = { ...(await exportAll()), version: DB_VERSION + 1, log: [row('L-new', 400)], ghost: [{ id: 'g1' }] };
let c3, e3;
try { c3 = await importAll(newer); } catch (e) { e3 = e; }
ok('NEWER-REFUSED  importAll refuses a file from a newer app', !!e3 && /newer/i.test(e3.message) && /update/i.test(e3.message),
  e3 ? e3.message : 'resolved: ' + JSON.stringify(c3));
ok('NEWER-REFUSED  nothing was written', JSON.stringify((await db.all('log')).map(r => r.id).sort()) === JSON.stringify(before),
  `${(await db.all('log')).length} log rows`);

console.log(bad ? `\n${bad} FAILED` : '\nall green');
process.exit(bad ? 1 : 0);
