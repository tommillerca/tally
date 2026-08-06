/* Gate audit: catches guards that cannot fail.
 *
 * WHY THIS EXISTS. Twice now a gate has shipped that never once fired:
 *   1. `if (!gluttonBeaten)` referenced a function that did not exist, so tapping
 *      "Face The Glutton" threw ReferenceError on every tap and the feature had
 *      never opened.
 *   2. `const spent = await spendPitFight(); if (!spent)` — spendPitFight returns
 *      `{ ok: false }` when you are out of energy, and an object is always truthy,
 *      so taking a rival's Dark Spire was free at any energy level. The comment
 *      above it described a rule the code did not implement.
 *
 * Both were invisible in review because the code READS correctly. So this checks
 * mechanically: every helper below returns an {ok} result object, and its value
 * must be tested via `.ok`, never for bare truthiness.
 *
 * PROVE-RED (confirmed 2026-08-07): change app.js:2066 back to `if (!spent)` and
 * this exits 1 naming spendPitFight.
 *
 * Usage: node tests/gate-audit.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../js');

/* Helpers whose resolved value is an object like { ok: boolean, ... }. Truthiness
   on any of these is a bug by construction. Verified against their definitions,
   not assumed: the check below re-reads each one and fails if a helper on this
   list stopped returning an object literal with an `ok` key. */
const OK_HELPERS = ['spendPitFight', 'claimSpire', 'collectTribute'];

const files = readdirSync(JS).filter(f => f.endsWith('.js'));
const src = new Map(files.map(f => [f, readFileSync(path.join(JS, f), 'utf8')]));
const all = [...src.values()].join('\n');

const problems = [];

// 0. the list itself has to stay true, or this audit silently checks nothing
for (const fn of OK_HELPERS) {
  // NOT `\([^)]*\)`: these take defaulted args like `now = Date.now()`, whose
  // nested paren ends the class early and made the audit report every helper
  // missing, which would have read as "the list is stale" forever.
  const def = new RegExp(`(?:export\\s+)?async function ${fn}\\s*\\(`, 'm');
  if (!def.test(all)) { problems.push(`${fn}: no definition found; the OK_HELPERS list is stale`); continue; }
  const body = all.slice(all.search(def));
  if (!/return\s*\{\s*ok\s*:/.test(body.slice(0, 1600))) {
    problems.push(`${fn}: no \`return { ok: ... }\` near its definition; it may no longer be an {ok} helper`);
  }
}

// 1. every call site must reach for .ok
let sites = 0;
for (const [file, text] of src) {
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    for (const fn of OK_HELPERS) {
      if (!line.includes(`${fn}(`)) continue;
      if (line.includes(`function ${fn}`)) continue;   // the definition itself
      sites++;
      const m = line.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+/);
      if (m) {
        // assigned: the guard is on a following line, so look ahead a little
        const name = m[1];
        const near = lines.slice(i, i + 4).join('\n');
        const bare = new RegExp(`if\\s*\\(\\s*!\\s*${name}\\s*\\)`);
        const dotOk = new RegExp(`${name}\\s*(?:\\?\\.)?\\.ok`);
        if (bare.test(near) && !dotOk.test(near)) {
          problems.push(`${file}:${i + 1} guards \`${name}\` (from ${fn}) for truthiness; an {ok:false} object is truthy. Use \`!${name}.ok\`.`);
        } else if (!dotOk.test(near)) {
          problems.push(`${file}:${i + 1} takes ${fn}() into \`${name}\` and never reads \`${name}.ok\` nearby.`);
        }
      } else if (/if\s*\(\s*!?\s*await\s/.test(line) && !/\.ok/.test(line)) {
        problems.push(`${file}:${i + 1} awaits ${fn}() straight into a condition without \`.ok\`.`);
      }
    }
  });
}

// An empty sample set is a FAILURE, never a pass: zero call sites means the
// pattern moved and this audit is checking nothing.
if (!sites) problems.push('no call sites found for any OK_HELPERS; this audit checked nothing');

if (problems.length) {
  console.log(`gate-audit: ${problems.length} problem(s) across ${sites} call site(s)\n`);
  for (const p of problems) console.log('  FAIL  ' + p);
  process.exit(1);
}
console.log(`gate-audit clean: ${sites} call site(s), ${OK_HELPERS.length} helpers verified`);
