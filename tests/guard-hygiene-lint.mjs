/* GUARDS THAT PASS WHILE BLIND. 2026-08-19.
 *
 * In one day, FOUR separate guards in this repo reported green while unable to
 * see the bug they were written for. None was caught by running the tests. All
 * four were caught only by insisting they go RED first:
 *
 *   1. a case appended below `await runAll();` in unit.test.js registered into a
 *      queue that had already been drained, so it never ran at all
 *   2. a CSS check that required a `}` before its selector silently graded a
 *      DIFFERENT rule, because the rule it wanted sat under a comment
 *   3. a mutation-based prove-red where nothing asserted the mutation had
 *      actually applied, so "it stayed green" proved nothing
 *   4. an audit that looked for "the app named an ingredient the player did not
 *      receive" among THE INGREDIENTS THE PLAYER ALREADY OWNED, a set that by
 *      definition cannot contain that lie
 *
 * Tom: "can you find a way to prevent some of this moving forward we need to be
 * catching mistakes".
 *
 * THE PATTERN. An empty-sample guard is not enough. Cases 2 and 4 had samples
 * that were non-empty and WRONG. What separates a trustworthy guard from a
 * blind one is a POSITIVE CONTROL: a row that fails if the check is looking in
 * the wrong place. The one audit that day nobody had to re-verify asserted both
 * that the secret appeared in zero payloads AND that four known-public fields
 * DID appear in the same captured body. That second row is the whole difference.
 *
 * This file is a lint, not a rule, because rules get forgotten and lints do not.
 * It is deliberately cheap and static: it cannot tell whether a control is a
 * GOOD control, only that one is present. That is worth saying plainly rather
 * than overselling it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fails = [];
const ok = (n, pass, d = '') => { console.log(`${pass ? 'ok  ' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!pass) fails.push(n); };

const files = readdirSync(here).filter(f => /\.(mjs|js)$/.test(f) && f !== 'guard-hygiene-lint.mjs');
const src = new Map(files.map(f => [f, readFileSync(join(here, f), 'utf8')]));

/* EMPTY-SAMPLE GUARD, applied to this lint itself. If the scan ever stops
   finding files, every row below passes for free, which is the exact failure
   this file exists to prevent. */
ok('SETUP the lint found test files to scan', files.length >= 50, `${files.length} files`);

/* ---- 1. NOTHING REGISTERS AFTER THE RUNNER HAS DRAINED ------------------- */
/* This is failure 1, and it is absolute: a case below `await runAll()` never
   executes and reports green forever. Cheap to check, impossible to argue with. */
const stranded = [];
for (const [f, text] of src) {
  const run = text.indexOf('\nawait runAll();');
  if (run === -1) continue;
  const after = text.slice(run + 1);
  const m = after.match(/^\s*(test|mapRow|check)\s*\(/m);
  if (m) stranded.push(`${f}:+${after.slice(0, m.index).split('\n').length}`);
}
ok('RUNNER no case is registered after the runner has already drained',
  stranded.length === 0,
  stranded.length ? stranded.join(', ') + '  (these never run and report green forever)' : 'none');

/* ---- 2. THE POSITIVE-CONTROL RATCHET ------------------------------------ */
/* 144 audits exist and 85 carry a control row. Retrofitting the other 59 in one
   sweep is not realistic and would be done badly under time pressure, so this
   RATCHETS instead: the number WITHOUT a control may never rise. A new audit
   therefore has to carry one, and every legacy file fixed lowers the ceiling
   permanently. Lower the number below when you fix one; never raise it. */
const AUDIT_RE = /audit|guard|lint|\.test\.js$/i;
const CONTROL_RE = /\bCONTROL\b|\bPOSITIVE\b|\bPREMISE\b|\bSETUP\b|\bREACH\b|\bSAMPLE\b/;
const audits = [...src.keys()].filter(f => AUDIT_RE.test(f));
const blind = audits.filter(f => !CONTROL_RE.test(src.get(f)));
const CEILING = 49;
ok('SETUP the audit scan is not vacuous', audits.length >= 50, `${audits.length} audits`);
ok(`CONTROL the number of audits with NO positive control does not rise above ${CEILING}`,
  blind.length <= CEILING,
  `${blind.length} of ${audits.length} carry no CONTROL/PREMISE/SETUP/REACH/SAMPLE row. ` +
  (blind.length > CEILING
    ? `NEW audits must carry a row that fails if the check is looking in the wrong place. Newest offenders: ${blind.slice(-3).join(', ')}`
    : 'ratchet holding'));

/* ---- 3. NOT LINTED, AND HERE IS WHY --------------------------------------
   Failure 3 was a prove-red that edited a file without checking the edit landed,
   so "still green" was indistinguishable from "the replace matched nothing".
   I wrote a static check for it and DELETED IT: it flagged five files that were
   not doing prove-red mutations at all, because prove-reds in this repo are
   ad-hoc shell steps rather than a shared shape, and the exclusion had to be so
   broad it stopped meaning anything. A lint that cries wolf gets deleted, and a
   noisy row here would take the two real rows down with it.
   The discipline instead, written where it will be read: ANY prove-red that
   mutates a file must assert the mutation applied before drawing a conclusion
   from the result. `s.count(old) == 1` before the replace, every time. If that
   ever gets a shared helper, lint the helper rather than the pattern. */

console.log(`\nguard-hygiene: ${fails.length ? fails.length + ' FAILED' : 'clean'}`);
process.exit(fails.length ? 1 : 0);
