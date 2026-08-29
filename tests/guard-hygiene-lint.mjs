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
import { execFileSync } from 'node:child_process';
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

/* PARSES, added 2026-08-23 after a peer session lost roughly 45 minutes and six of
   a pre-registered twelve runs to this exact hole.

   Every static check in this repo, including the two rows above, reads an audit as
   TEXT: grep for constants, grep for control rows, regex the ok() literals. None of
   them loads the file. So a duplicate `const` declaration is invisible to all of
   them, and a suite can cheerfully report "32 ok() rows in source, expected 32"
   about a file Node refuses to execute. Six runs executed zero lines while three
   lints reported clean.

   That is the exact family this whole file exists to catch, one level up: a check
   reporting success while not examining the thing that is broken. `node --check`
   is the smallest thing that actually parses, and an early error (a duplicate
   declaration among them) is caught before a single line runs.

   It does NOT prove a suite works, only that Node will accept it. That is the
   floor, not the ceiling, and it is a floor nothing here had. */
const unparseable = [];
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', join(here, f)], { stdio: 'pipe' }); }
  catch (e) {
    const why = String(e.stderr || e.message).split('\n').find(l => /Error/.test(l)) || 'did not parse';
    unparseable.push(`${f}: ${why.trim()}`);
  }
}
ok('PARSES every audit is something Node will actually execute',
  unparseable.length === 0,
  unparseable.length ? `${unparseable.length}: ${unparseable.slice(0, 3).join(' | ')}` : `${files.length} files parse`);

/* SEAM: A GUARD THAT ONLY EVER TOUCHES A TEST HOOK PROVES THE FEATURE RENDERS,
   NEVER THAT ANYBODY CAN REACH IT.

   Added 2026-08-24 after Tom asked "I don't see the crew tab paddock viewer, that
   never actually got launched no?". He was right to ask and the suite could not
   answer him: all fifteen rows of friend-paddock-audit opened the sheet through
   `window.__openFriendProfile`, the webdriver-only hook, and not one touched the
   control a player touches. Deleting the real tap handler left FIFTEEN ROWS GREEN
   and only the one row added that day red. A feature can be finished, guarded and
   entirely green while being unreachable.

   A RATCHET, not a rule, and deliberately so. 21 suites here are seam-only today
   and several are correct to be: badge-centre-lib is a library, and clock-trust,
   backup-roundtrip and error-telemetry are about mechanisms with no control to
   press. Demanding a real click from those would be a lint that cries wolf, which
   this file's own CONTROL row exists to avoid becoming. So today's set is pinned
   and anything NEW has to justify itself by driving something a player can touch:
   a .click(), a dispatched event, or page.click.

   FIXED ONE? Delete its line. The row fails on a stale entry too, so the
   inventory cannot quietly rot into a list nobody maintains. */
const SEAM_ONLY_KNOWN = [
  /* The two levelpaid tools (#265) are skip-tiered INVESTIGATION instruments,
     not guards: the tracer asserts nothing and the repro deliberately exits 1
     on machines too fast to mint the race it reproduces. Neither is evidence
     that a player can reach anything, and neither claims to be. They live here
     rather than in a filename carve-out so that a future rename cannot slip a
     real seam-only audit past this row. */
  'levelpaid-repro.mjs',
  'levelpaid-trace.mjs',
  'admin-grant-audit.mjs',
  'backup-roundtrip-audit.mjs',
  'badge-centre-lib.mjs',
  'bestiary-audit.mjs',
  'boot-backfill-audit.mjs',
  'boot-flash-audit.mjs',
  'clock-trust-audit.mjs',
  'crate-advance-audit.mjs',
  'crate-palette-audit.mjs',
  'endless-look-audit.mjs',
  'error-telemetry-audit.mjs',
  'fav-skull-audit.mjs',
  'fight-tray-audit.mjs',
  'freeze-reveal-audit.mjs',
  'lb-profile.mjs',
  'motion-truth-audit.mjs',
  'nav-perf-audit.mjs',
  'newcomers-audit.mjs',
  'race-audit.mjs',
  'race-you.mjs',
  'speech-audit.mjs',
  'spire-phase3-audit.mjs',
  'spire-poster.mjs',
  'sw-upgrade-audit.mjs',
];
const usesSeam = t => /window\.__[a-zA-Z]/.test(t);
const drivesReal = t => /\.click\(\)|dispatchEvent|page\.(click|tap)/.test(t);
const seamNow = files.filter(f => /\.mjs$/.test(f)).filter(f => {
  const t = readFileSync(join(here, f), 'utf8');
  return usesSeam(t) && !drivesReal(t);
});
const seamNew = seamNow.filter(f => !SEAM_ONLY_KNOWN.includes(f));
const seamGone = SEAM_ONLY_KNOWN.filter(f => !seamNow.includes(f));
ok('SEAM no NEW audit proves a feature only through a test hook',
  seamNew.length === 0,
  seamNew.length ? `${seamNew.length} new: ${seamNew.join(', ')}. Drive the control a player touches, or add it here with a reason.`
                 : `${seamNow.length} known seam-only, 0 new`);
ok('SEAM the seam-only inventory has no stale entries (fixed one? delete its line)',
  seamGone.length === 0,
  seamGone.length ? `${seamGone.length} no longer seam-only: ${seamGone.join(', ')}` : 'inventory matches');

console.log(`\nguard-hygiene: ${fails.length ? fails.length + ' FAILED' : 'clean'}`);
process.exit(fails.length ? 1 : 0);
