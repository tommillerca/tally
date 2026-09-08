import { writeSinks } from './lib/audit-write-scan.mjs';
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

/* LITERAL-TRUE, 2026-09-07: a success row with a constant verdict observes
   nothing. Both ok and check are used by audits. These ten exact legacy rows
   are reports reached only after a measured branch or a throwing prerequisite.
   Excuse the row, never the file or a word like SETUP. A new row in an excused
   file must still fail. This is a lexical shape check, not a control-flow proof. */
const literalTrueExcuses = [
  ['figure-audit.mjs', 'SETUP ink measurement works on this machine', 'decoder mismatch and empty real ink throw before this row'],
  ['selector-audit.mjs', 'SETUP the sweep proves itself on known verdicts', 'failed fixtures exit 2 before this row'],
  ['suite-rot-audit.mjs', 'SETUP audit-rot proves itself on known verdicts', 'failed fixtures call die before this row'],
  ['xp-key-provenance-lint.mjs', 'PROVENANCE no award key resolves to a clock or a random source', 'if no unallowed tainted chain exists'],
  ['xp-key-provenance-lint.mjs', 'ALLOWED ${r.file}:${r.line} ${r.key} reaches a clock through a persisted entity id', 'inside the resolved allowance branch'],
  ['boneyard-icon-audit.mjs', 'CONTROL  an egg is DRAWN on the map to compare, so the MATCH row has a sample', 'inside if eggDrawn; else explicitly ungraded'],
  ['boneyard-audit.mjs', 'BEATS the map drew a sample that could fail the grouping row (PREMISE)', 'else of seen below BEAT_MIN_SAMPLE'],
  ['boneyard-audit.mjs', 'BEATS-SLOW the map drew a sample that could fail the grouping row (PREMISE)', 'else of slowed sample below BEAT_MIN_SAMPLE'],
  ['wardrobe-family-grid-audit.mjs', 'SEED all ${seeded.want} ${SLOT}-slot pieces are granted and owned', 'empty or missing owned items call die first'],
  ['dressing-room-audit.mjs', 'SEED the ${KIT_SLOT} kit is owned (${seeded.kitOwned}/${seeded.kit}) and ${GEAR_SLOTS.length} slots hold wearable gear at level ${seeded.lvl}', 'seed error, empty kit or missing ownership call die first'],
];
function literalTrueRows(text) {
  return [...text.matchAll(/\b(?:ok|check)\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1\s*,\s*true\s*[,)]/g)]
    .map(m => ({ label: m[2], line: text.slice(0, m.index).split('\n').length }));
}
const constantRows = [...src].flatMap(([file, text]) => literalTrueRows(text).map(r => ({ file, ...r })));
const isExcused = r => literalTrueExcuses.some(([file, label]) => file === r.file && label === r.label);
const constants = constantRows.filter(r => !isExcused(r));
ok('LITERAL-TRUE no audit asserts a constant success (including NO page errors)', !constants.length,
  constants.length ? constants.map(r => `${r.file}:${r.line} ${r.label}`).join(' | ') : '0 offenders');
const staleExcuses = literalTrueExcuses.filter(([file, label]) =>
  constantRows.filter(r => r.file === file && r.label === label).length !== 1);
ok('LITERAL-TRUE the ten justified reports are excused exactly once', !staleExcuses.length,
  `${constantRows.filter(isExcused).length} excused; ${staleExcuses.length} stale or duplicated`);
// CONTROL: compose source text so this fixture is not itself an assertion row.
const constantFixture = (name, label) => name + '(' + JSON.stringify(label) + ', ' + 'true);';
ok('CONTROL literal-true catches a new offender even inside an excused file',
  literalTrueRows(constantFixture('ok', 'NEW page errors')).some(r => !isExcused({ file: 'figure-audit.mjs', ...r }))
  && literalTrueRows(constantFixture('check', 'NEW multiline').replace(', ', ',\n')).length === 1
  && literalTrueRows('ok("measured", errors.length === 0);').length === 0);

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
  /* R48-A, 2026-09-07: executes the production settlement body with webdriver
     false and checks that the window alias is absent. It never calls the alias.
     The lexical seam scan sees the absence check; browser arrival is separately
     driven by dressing-room-audit. Node DOM adapters cannot prove browser taps. */
  'r48-state-audit.mjs',
  /* dead-shell-audit's exposeFunction binding is an INSTRUMENT, not a stand-in
     for the feature. It kills a real shell and drives a real reload; the binding
     only COUNTS document loads from outside the page, which is the whole point
     — reading a flag the page sets would trust the thing under test. It replaced
     a framenavigated listener on 2026-09-03 because that event also fires for
     same-document navigation and was calling a healthy app a reloading one.
     The distinction this list cares about — an audit that passes while the
     player-facing path is broken — does not apply: the player-facing path IS
     what it drives. */
  'dead-shell-audit.mjs',
  /* reveal-mannequin-audit builds its cards through the webdriver-only __gearCard
     and __crateCard seams. Reaching a real reveal needs a crate in hand or a den
     win inside a GPS radius, neither of which a harness can arrange without
     faking the very grant under test. The compensating control is its COVERAGE
     row, which is STATIC and derived from js/app.js: a new reveal that ships a
     bare `imgSrc: bhAsset(...)` card fails there even though this audit never
     taps it. Added 2026-09-03. */
  'reveal-mannequin-audit.mjs',
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
  'nav-perf-audit.mjs',
  'newcomers-audit.mjs',
  /* pack-sink-audit drives window.__packReveal because the pack reveal is the
     one screen no click can reach with a chosen payload: it is entered from a
     crate open, a boss settle or an ingested grant, and none of those lets a
     test choose the string. The hook is not a fixture either, it is
     `(cards, opts) => openPackReveal(cards, opts || {})`, so the audit runs the
     shipped function and the shipped markup builder. render-sink-lint is here
     for a different reason: it is a STATIC source scan that boots nothing, and
     it trips this row only because its header quotes the hook by name while
     explaining what went wrong. */
  'pack-sink-audit.mjs',
  'render-sink-lint.mjs',
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

/* R3: every recognized filesystem destination and screenshot/trace path
   is checked at the sink. Recurse into helpers and retired audits too.
   Bounded lexical coverage, not an OS sandbox. See docs/RELEASE-GATE-STATUS.md. */
const outputFiles = [];
function scanOutput(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, ent.name);
    if (ent.isDirectory()) scanOutput(file);
    else if (/\.(mjs|js)$/.test(ent.name)) outputFiles.push(file);
  }
}
scanOutput(here);
const outputViolations = [];
let outputSinks = 0;
for (const file of outputFiles) {
  const text = readFileSync(file, 'utf8');
  const sinks = writeSinks(text);
  outputSinks += sinks.length;
  const bound = /import\s*\{[^}]*\bauditOutputPath\b[^}]*\}\s*from\s*['"][^'"]*\/audit-output\.mjs['"]/.test(text);
  for (const sink of sinks) if (!sink.guarded || !bound) {
    outputViolations.push(`${file.slice(here.length + 1)}:${sink.line} ${sink.api}`);
  }
}
ok('OUTPUT all recognized audit writes validate destinations outside the graded checkout',
  outputViolations.length === 0, outputViolations.length ? outputViolations.join(' | ') : `${outputSinks} guarded sinks`);
ok('CONTROL the output sweep is nonempty and rejects an unguarded checkout screenshot',
  outputSinks > 100 && writeSinks('page.' + 'screenshot({path: join(repo, "probe.png")});').some(r => !r.guarded),
  `${outputFiles.length} files scanned recursively`);

console.log(`\nguard-hygiene: ${fails.length ? fails.length + ' FAILED' : 'clean'}`);
process.exit(fails.length ? 1 : 0);
