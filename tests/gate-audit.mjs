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
 * PROVE-RED (confirmed 2026-08-15, the audit's OWN blind spot): rewrite
 * js/app.js:13632 to `const { ok } = await spendPitFight();` and drop the guard.
 * The version before this commit exits 0 "clean: 4 call site(s)" on that exploit,
 * because it counted the site before analysing it and its matcher could not see a
 * `{`. This version exits 1 naming spendPitFight. The same refactor WITH `if (!ok)`
 * still exits 0, so it is not simply failing on everything. Measured at the same
 * time: on shipped main the old matcher understood 3 of the 4 sites, and the one
 * it understood NOTHING about was js/app.js:14922, the spire claim, which is the
 * exact exploit this file exists for.
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
  const body = all.slice(all.search(def), all.search(def) + 1600);
  /* TWO SHAPES ARE HONEST {ok} HELPERS, and only one used to be recognised.
     collectTribute became `let out = {ok:false}; await kvUpdate(... out = {ok:true...})
     ; return out;` in v394, which is the FIX for the concurrent double-pay, and
     this check called that a stale list. Follow the returned BINDING when the
     function returns a name, exactly as the call-site half already does. */
  const direct = /return\s*\{\s*ok\s*:/.test(body);
  /* ALL returned names, not the first: collectTribute's updater returns
     `undefined` and `st` before the function returns `out`, so taking the first
     match graded the wrong binding and still called this helper stale. */
  const rets = [...body.matchAll(/\breturn\s+([A-Za-z_$][\w$]*)\s*;/g)].map(m => m[1]);
  const viaVar = rets.some(n => new RegExp(`\\b${n}\\s*=\\s*\\{\\s*ok\\s*:`).test(body));
  /* AND A TERNARY IS A THIRD LEGITIMATE SHAPE. spendPitFight became
     `return used ? { ok: true, used } : { ok: false };` on 2026-09-01, when the
     energy gate moved inside a single kvUpdate so a double tap could not open two
     staked fights on one charge. That is the same {ok} contract as ever, but the
     brace does not follow `return` and no name is returned, so both arms above
     missed it and this check called a correct function stale. A guard that reads
     the SHAPE of the source rather than the shape of the RESULT goes red every
     time somebody writes the same contract a different way, which is how a
     healthy tree ends up with a red it learns to ignore.
     Scoped to the same statement (no `;` in between) so it cannot wander into
     the next return. 2026-09-02. */
  const viaTernary = /\breturn\b[^;]*\?[^;]*\{\s*ok\s*:/.test(body);
  if (!direct && !viaVar && !viaTernary) {
    problems.push(`${fn}: no \`{ ok: ... }\` result near its definition; it may no longer be an {ok} helper`);
  }
}

/* CONTROL. Every failure this file has had was the MATCHER going blind: a shape
   it could not classify, a look-ahead window too short, a comment it ate. So a
   clean report is only evidence if the matcher can still see the shipped
   exploit. One synthetic call site in exactly that shape goes through the same
   loop as the real ones and must come back flagged; its findings are held out
   of the real report below. */
const CONTROL_FILE = '__control-fixture__.js';
src.set(CONTROL_FILE, 'async function control() {\n  const spent = await spendPitFight();\n  if (!spent) return;\n}\n');

// 1. every call site must reach for .ok
/* `sites` is what was SEEN, `analysed` is what this audit actually understood.
   Only the second one is evidence (see the empty-sample guard at the bottom). */
let sites = 0, analysed = 0;
for (const [file, text] of src) {
  /* COMMENTS ARE NOT CALL SITES. js/spires.js:266 is the doc comment describing
     the double-pay this audit exists for, and quoting `collectTribute('sp-1-1')`
     in it made the audit report its own subject as an unclassifiable call.
     Blank comment bodies while KEEPING newlines, so line numbers stay true.
     ponytail: this also blanks `//` inside string literals; no call site in this
     tree shares a line with one, and the empty-sample guard below catches it if
     that ever stops being true. */
  const lines = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ' ')).split('\n');
  lines.forEach((line, i) => {
    for (const fn of OK_HELPERS) {
      if (!line.includes(`${fn}(`)) continue;
      if (line.includes(`function ${fn}`)) continue;   // the definition itself
      sites++;
      const where = `${file}:${i + 1}`;
      /* Look-ahead window MEASURED, not guessed: the spire claim declares its
         result at js/app.js:14922 and reads `r.ok` at :14933, eleven lines down,
         so the old 4-line window would have called that site a failure the
         moment the matcher grew wide enough to see it. */
      const near = lines.slice(i, i + 14).join('\n');
      const after = lines.slice(i + 1, i + 14).join('\n');
      /* NOT `=\s*await`: that character class has no `{` in it, so a refactor to
         `const { ok } = await spendPitFight()` fell out of BOTH branches below
         and was analysed by neither, while still counting as a site. */
      const decl = line.match(/(?:const|let|var)\s+(\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=[^=]/);
      if (decl && /\bawait\b/.test(line)) {
        analysed++;
        const target = decl[1];
        if (target.startsWith('{')) {
          // Destructured: the BINDING is the answer, so follow the binding.
          const key = target.match(/\bok\b\s*(?::\s*([A-Za-z_$][\w$]*))?/);
          if (!key) {
            problems.push(`${where} destructures ${fn}() without taking \`ok\`; the answer is thrown away.`);
            continue;
          }
          const name = key[1] || 'ok';
          /* "consulted" is the same idiom as the NO-OP guard in
             tests/unit.test.js: the name has to appear in a CONDITION, because
             binding it and never testing it is exactly the shipped exploit. */
          if (!new RegExp(`\\b${name}\\s*(?:&&|\\|\\||\\)|\\?)`).test(after)) {
            problems.push(`${where} destructures \`${name}\` out of ${fn}() and never tests it.`);
          }
          continue;
        }
        const bare = new RegExp(`if\\s*\\(\\s*!\\s*${target}\\s*\\)`);
        const dotOk = new RegExp(`${target}\\s*(?:\\?\\.)?\\.ok`);
        if (bare.test(near) && !dotOk.test(near)) {
          problems.push(`${where} guards \`${target}\` (from ${fn}) for truthiness; an {ok:false} object is truthy. Use \`!${target}.ok\`.`);
        } else if (!dotOk.test(near)) {
          problems.push(`${where} takes ${fn}() into \`${target}\` and never reads \`${target}.ok\` nearby.`);
        }
        continue;
      }
      if (/if\s*\(\s*!?\s*await\s/.test(line)) {
        analysed++;
        if (!/\.ok/.test(line)) problems.push(`${where} awaits ${fn}() straight into a condition without \`.ok\`.`);
        continue;
      }
      /* UNKNOWN SHAPES FAIL, THEY DO NOT FALL THROUGH. A call site this audit
         cannot classify has been checked by nothing, and "checked by nothing" is
         indistinguishable from "safe" only to an audit that stays quiet about
         it. Widen a matcher above, do not delete this. */
      problems.push(`${where} calls ${fn}() in a shape this audit cannot classify, so NOTHING checked it: ${line.trim().slice(0, 120)}`);
    }
  });
}

const caught = problems.filter(p => p.startsWith(CONTROL_FILE));
for (const p of caught) problems.splice(problems.indexOf(p), 1);
sites--; analysed--;   // the synthetic control site is not a real call site
if (caught.length !== 1 || !/truthiness/.test(caught[0])) {
  problems.push(`CONTROL the synthetic \`if (!spent)\` call site was not flagged (${caught.length} finding(s)); the matcher has gone blind, so a clean report here means nothing`);
}

/* An empty sample set is a FAILURE, never a pass, and it has to count what was
   ANALYSED rather than what was seen. The old version incremented `sites` before
   any analysis and then asked `if (!sites)`, so a destructured refactor took the
   understood count to zero while the seen count stayed healthy: the guard read
   "clean" having examined nothing. Count the analysis, not the string
   (tally/CLAUDE.md rule 3, and tests/unit.test.js:1869 for the same fix). */
if (!analysed) problems.push(`no OK_HELPERS call site was ANALYSED (${sites} seen, 0 understood); this audit checked nothing`);

if (problems.length) {
  console.log(`gate-audit: ${problems.length} problem(s) across ${analysed}/${sites} analysed call site(s)\n`);
  for (const p of problems) console.log('  FAIL  ' + p);
  process.exit(1);
}
console.log(`gate-audit clean: ${analysed}/${sites} call site(s) analysed, ${OK_HELPERS.length} helpers verified`);
