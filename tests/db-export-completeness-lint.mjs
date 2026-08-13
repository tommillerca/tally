/* THE EXPORT AND IMPORT FUNCTIONS COVER EVERY STORE THE DB DEFINES.
 *
 * js/db.js:84 (exportAll) and js/db.js:91 (importAll) hand-list the seven
 * stores by name. If a future commit adds an eighth store to onupgradeneeded
 * without also adding it to exportAll and importAll, backups will silently
 * omit that store's data and restores will silently not restore it. Nobody
 * finds out until a player wipes their device and comes back missing
 * whatever the eighth store held.
 *
 * Same class as the PRECACHE list that cost a new player the whole app on
 * 2026-08-12. tests/backup-roundtrip-audit.mjs does NOT catch this: it
 * verifies the round trip of what is exported, not whether everything IS
 * exported.
 *
 * Static-only, no browser. Parses js/db.js and asserts:
 *   1. Every store created in onupgradeneeded appears as a field in
 *      exportAll()'s return literal.
 *   2. Every store created in onupgradeneeded is consumed by importAll's
 *      `for (const ... of data.<store> || [])` loops.
 *   3. The parse itself is non-trivial (empty-sample guard: if either
 *      list comes back with fewer than 5 stores the regex has drifted and
 *      the lint is silently checking nothing).
 *
 * KNOWN CEILING, on record because Gwart's rule 3: this parser is a set of
 * regexes over JavaScript source, not an AST. It will lie if someone writes
 * `db.createObjectStore(NAME, ...)` with a computed name, or spreads
 * `data.<store>` via a variable. If db.js grows either shape, the lint
 * fails the empty-sample guard by design rather than pretending to work.
 * Replace with an AST parser at that point.
 *
 * PROVE-RED (documented, run under HARNESS_TEST=1):
 *   Set HARNESS_TEST=1 to run against a fixture db.js that has an extra
 *   store 'stable' in onupgradeneeded but not in exportAll or importAll.
 *   Both assertions go red naming 'stable' as the missing store.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = process.env.HARNESS_TEST === '1';
const dbSrc = HARNESS
  ? readFileSync(path.join(ROOT, 'tests/fixtures/db-with-orphan-store.js'), 'utf8')
  : readFileSync(path.join(ROOT, 'js/db.js'), 'utf8');

const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

/* Parse. `db.createObjectStore('name', ...)` and `s.createObjectStore('name', ...)`
   both appear in db.js; capture both. Literal single-quote string only, which
   matches the file's style; if it drifts to backticks or double-quotes the
   empty-sample guard below flags it. */
const createRe = /createObjectStore\(\s*'([a-zA-Z_][a-zA-Z0-9_]*)'/g;
const createdStores = new Set();
for (let m; (m = createRe.exec(dbSrc)); ) createdStores.add(m[1]);

/* exportAll's return literal contains `{ app: 'tally', version: N, exportedAt: ..., foods, log, ... }`.
   Extract the top-level identifiers via a coarse match: after the `return {`,
   until the matching `}`. Filter to identifiers that are ALSO in createdStores
   (so `app`, `version`, `exportedAt` don't count as stores; the store
   shorthand fields do). */
/* Anchor on `function exportAll` rather than the bare identifier, or the
   header-comment mention of exportAll wins the non-greedy race. Same for
   importAll below. */
const exportBlock = dbSrc.match(/function\s+exportAll[\s\S]*?return\s*\{([\s\S]*?)\}\s*;/);
const exportedStores = new Set();
if (exportBlock) {
  const body = exportBlock[1];
  /* Shorthand-property syntax `foods,` counts. Explicit `foods: ...` also. */
  /* Match an identifier that is followed by a separator OR end-of-block. The
     end-of-block case is what catches the LAST shorthand field (`..., inv `
     with no trailing comma before the closing `}`). Without it the last
     store silently drops out of the parsed set and the lint would go red
     against healthy code, which is worse than going green against broken. */
  const idRe = /(?:^|[\s,{])([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*(?:,|\}|:|$))/g;
  for (let m; (m = idRe.exec(body)); ) exportedStores.add(m[1]);
}

/* importAll iterates `for (const _ of data.<store> || [])` for each store.
   Also accepts `for (const _ of data.<store>)`. */
const importBlock = dbSrc.match(/function\s+importAll[\s\S]*?\n\}/);
const importedStores = new Set();
if (importBlock) {
  const body = importBlock[0];
  const forRe = /for\s*\(\s*const\s+[a-zA-Z_$][\w$]*\s+of\s+data\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
  for (let m; (m = forRe.exec(body)); ) importedStores.add(m[1]);
}

/* EMPTY-SAMPLE GUARDS, on all three parses. If the regexes have drifted,
   the diff below is trivially empty and the lint passes vacuously; that is
   the -Infinity-evidence trap in a different costume. Assert non-trivial
   before comparing. Threshold 5 is below the current 7 stores with headroom
   for a genuine reduction, above the shape a hollow parse produces (0). */
const MIN_EXPECTED = 5;
ok(`SETUP  db.js parse found >=${MIN_EXPECTED} createObjectStore calls (empty parse means the regex has drifted from the file style)`,
  createdStores.size >= MIN_EXPECTED,
  `parsed ${createdStores.size} stores: ${JSON.stringify([...createdStores])}`);
ok(`SETUP  exportAll return literal parse found >=${MIN_EXPECTED} store fields`,
  exportedStores.size >= MIN_EXPECTED,
  `parsed ${exportedStores.size} exported fields: ${JSON.stringify([...exportedStores])}`);
ok(`SETUP  importAll for-of loops parse found >=${MIN_EXPECTED} data.<store> reads`,
  importedStores.size >= MIN_EXPECTED,
  `parsed ${importedStores.size} imported stores: ${JSON.stringify([...importedStores])}`);

/* DIFF. Every store CREATED must be EXPORTED and IMPORTED. Report the missing
   set in each direction so a future regression names the store, not a count. */
const missingFromExport = [...createdStores].filter(s => !exportedStores.has(s));
const missingFromImport = [...createdStores].filter(s => !importedStores.has(s));
ok('EXPORT  every store created in onupgradeneeded appears in exportAll (a store you cannot back up is a store that vanishes on a device wipe)',
  missingFromExport.length === 0,
  missingFromExport.length ? `missing from exportAll: ${JSON.stringify(missingFromExport)}` : `all ${createdStores.size} stores exported`);
ok('IMPORT  every store created in onupgradeneeded is consumed by importAll',
  missingFromImport.length === 0,
  missingFromImport.length ? `missing from importAll: ${JSON.stringify(missingFromImport)}` : `all ${createdStores.size} stores restored on import`);

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
