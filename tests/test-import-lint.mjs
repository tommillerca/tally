/* test-import-lint: an audit that cannot even LOAD has been reading as coverage.
 *
 * The ReferenceError-at-runtime class. feel-audit (fixed on ext/feel-audit-import)
 * and t2-audit (still red on main at 0240e7f) both call `serveTree(...)` at file
 * scope, but their destructured `await import('./godmode.js')` never bound it.
 * Running the file blew up before any assertion executed, and the release-gate
 * FULL tier could not tell that from a failing test. This is the static guard: no
 * browser, no fixtures beyond the source tree, for every tests/*.mjs whose text
 * calls a godmode-exported identifier that its imports never brought in, fail
 * with a NAMED finding.
 *
 * PROVE-RED shipped in the commit body: on 0240e7f (main tip when written), this
 * flags feel-audit and t2-audit, exit 1; on the same tree with feel-audit
 * imported (as ext/feel-audit-import does) it flags only t2-audit; with both
 * fixed, exit 0. That third state also proves this lint is not just theatre:
 * remove either import from a green tree and this goes red naming the removal.
 *
 * Rule (deliberately narrow, to avoid false positives): flag when
 *   (a) an identifier is EXPORTED by tests/godmode.js, AND
 *   (b) the identifier appears as a call `name(` in the source text, AND
 *   (c) it is not bound by any import from './godmode.js' or 'tests/godmode.js',
 *       static or dynamic, including rename forms (`import { a as b }` and
 *       `const { a: b } = await import(...)` both count `b` as bound).
 * Non-call references (bare identifier reads without parens) are NOT flagged:
 * the failure mode this catches is the runtime call, and node has no way of
 * knowing if a bare `serveTree` was intentional shadowing. Keep the surface small.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GM = path.join(ROOT, 'tests/godmode.js');

/* strip both string CONTENTS and comments so a bare word inside a message or a
   doc block does not read as a call: garden-doors.mjs has "each door states its
   own live state (...)" inside a message string, and release-gate.mjs has
   "died during boot (" inside a comment. Both would false-positive on the raw
   regex. Order matters: block comments first, then lines, then strings; template
   literals are blanked whole (interpolation edge cases are not worth a stateful
   scanner here, and the failure this lint catches lives in top-level code). */
function stripStringsAndComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))  // block comments, preserve newlines
    .replace(/\/\/.*$/gm, '')                                      // line comments
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")                         // single-quoted string bodies
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')                         // double-quoted string bodies
    .replace(/`(?:\\.|[^`\\])*`/g, '``');                          // template literals, whole
}

/* the set of things a tests/*.mjs COULD legitimately call from godmode */
const gm = fs.readFileSync(GM, 'utf8');
const EXPORTS = new Set();
for (const m of gm.matchAll(/^export\s+(?:async\s+)?(?:const|let|var|function)\s+([A-Za-z_]\w*)/gm)) EXPORTS.add(m[1]);
if (EXPORTS.size < 5) { console.log(`FAIL  test-import-lint: SETUP godmode.js exports parsed to ${EXPORTS.size}, expected many. Aborting.`); process.exit(2); }

/* import bindings from godmode in ONE file. Handles both static
 *   import { a, b as c } from './godmode.js'
 * and dynamic
 *   const { a, b: c } = await import(path.join(ROOT, 'tests/godmode.js'))
 * The RHS matcher requires the path text to CONTAIN "godmode", which is the
 * signal every existing test uses. Renames pass the LOCAL name through, because
 * the local name is what has to exist for the call to bind. */
function bindingsFromGodmode(src) {
  const bound = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]*godmode[^'"]*['"]/g)) {
    for (const part of m[1].split(',')) {
      const t = part.trim(); if (!t) continue;
      const rn = t.match(/^([A-Za-z_]\w*)\s+as\s+([A-Za-z_]\w*)$/);
      bound.add(rn ? rn[2] : t);
    }
  }
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=\s*await\s+import\s*\([^)]*godmode[^)]*\)/g)) {
    for (const part of m[1].split(',')) {
      const t = part.trim(); if (!t) continue;
      const rn = t.match(/^([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*)$/);
      bound.add(rn ? rn[2] : t);
    }
  }
  return bound;
}

const tests = fs.readdirSync(path.join(ROOT, 'tests')).filter(f => f.endsWith('.mjs')).sort();
const findings = [];
for (const rel of tests) {
  /* the lint MUST NOT lint itself out of coverage: skip only the guard file */
  if (rel === 'test-import-lint.mjs') continue;
  const p = path.join(ROOT, 'tests', rel);
  const src = fs.readFileSync(p, 'utf8');
  /* if the file does not touch godmode at all, nothing to check */
  if (!/godmode/.test(src)) continue;
  const bound = bindingsFromGodmode(src);          // import bindings run against the full source (they live in code)
  const code = stripStringsAndComments(src);       // but call detection runs against code-only
  for (const name of EXPORTS) {
    if (bound.has(name)) continue;
    /* a local `const sleep = ...`, `function sleep(){}`, or `let sleep` is a
       legitimate shadow: five test files define sleep locally rather than
       importing godmode's, and that is not the ReferenceError shape. Skip. */
    const localDecl = new RegExp(`(?:^|[^\\w$.])(?:const|let|var|function|async\\s+function)\\s+${name}\\b`);
    if (localDecl.test(code)) continue;
    const callRe = new RegExp(`(?<![\\w$.])${name}\\s*\\(`);
    if (callRe.test(code)) findings.push({ file: `tests/${rel}`, missing: name });
  }
}

if (findings.length) {
  console.log(`FAIL  test-import-lint: ${findings.length} unbound godmode call${findings.length === 1 ? '' : 's'} across ${new Set(findings.map(f => f.file)).size} file${new Set(findings.map(f => f.file)).size === 1 ? '' : 's'}`);
  for (const f of findings) console.log(`      ${f.file} calls '${f.missing}(' but never imports it from godmode`);
  process.exit(1);
}
console.log(`PASS  test-import-lint: every godmode call across ${tests.length - 1} tests/*.mjs binds`);
process.exit(0);
