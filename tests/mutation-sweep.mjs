/* MUTATION SWEEP: break the thing an audit claims to guard, and see if it notices.
 *
 * WHY, when tests/tautology-audit.mjs already exists. Because static detection of
 * "this assertion cannot fail" is undecidable, and the static half is honest
 * about being four narrow structural rules. It found the fight-tray escape clause
 * because that tautology has a SHAPE. It would never have found the other kind:
 * an assertion whose shape is perfect and whose BOUND is too loose to fire.
 * fight-layout-audit once asserted `arena >= 258` and passed a build rendering
 * the boss with his head cut off, at arena 292. Nothing about that line looks
 * wrong. Only breaking the app and watching the guard stay green can see it.
 *
 * THE METHOD. For each entry below: take a clean `git archive` of HEAD into a
 * scratch tree, apply ONE mutation to the APP (never to the audit), run the audit
 * against that tree, and read its exit code.
 *
 *   control green + mutant RED    the guard guards. Nothing to report.
 *   control green + mutant GREEN  THE FINDING. The guard did not respond to the
 *                                 defect it exists to catch.
 *   control RED                   INCONCLUSIVE, and reported as such: an audit
 *                                 that is already red proves nothing either way,
 *                                 and calling that a pass would be the exact
 *                                 self-deception this file is about.
 *
 * THE MUTATIONS ARE NOT RANDOM CHARACTER EDITS. Every one is derived from the
 * audit's own header: this repo writes a PROVE-RED line into 72 of its 131 test
 * files, which is the author stating, in advance, what breaking their guard's
 * subject looks like. Where a PROVE-RED exists the mutation is that line made
 * executable. Where it does not, the mutation is taken from the DIRECTION AND
 * BOUND paragraph, and `claim` below quotes the sentence it came from so a
 * reader can check the mutation against the promise rather than against my
 * judgement.
 *
 * WHAT THIS CANNOT DO, and it is the important paragraph.
 *   - IT DOES NOT COVER THE SUITE. The catalog is hand-written, one entry at a
 *     time, and it is printed as a fraction on every run for that reason. There
 *     is no way to generate a meaningful mutation from a filename. An audit with
 *     no entry here has been checked by NOTHING, and this file says so out loud
 *     rather than printing a clean summary over a 6% sample.
 *   - A GREEN MUTANT IS DECISIVE. A RED MUTANT IS NOT A CLEAN BILL. It proves the
 *     audit responds to THIS defect, not that its bound is right for every other
 *     one. One mutation per claim is a floor, not a proof.
 *   - It cannot see a guard that is honest about its assertion and never reaches
 *     the state it means to grade, unless the mutation happens to change that
 *     state.
 *
 * RUNTIME, measured on this checkout and not estimated (see MEASURED at the
 * bottom): the node-only entries are ~1s each; each browser entry is a full boot,
 * about 50-60s, and a browser entry needs a control run as well, so it is ~110s a
 * claim. A full mutation sweep over all 131 files, if the catalog were ever
 * written, would be several hours. That is not a tier, it is a nightly. What is
 * shippable today is the node lane, which is why it is the default and --browser
 * is opt-in.
 *
 * Usage: node tests/mutation-sweep.mjs            node-only lane (gate-shaped)
 *        node tests/mutation-sweep.mjs --browser  add the browser lane (slow)
 *        node tests/mutation-sweep.mjs --only=<substring>
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, appendFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---- mutation primitives. Each returns a description for the report. ---- */
const replace = (file, find, into) => ({
  file, describe: `replace ${JSON.stringify(find.slice(0, 60))} with ${JSON.stringify(into.slice(0, 60))} in ${file}`,
  apply(tree) {
    const p = path.join(tree, file);
    const src = readFileSync(p, 'utf8');
    if (!src.includes(find)) throw new Error(`mutation target not found in ${file}: ${find.slice(0, 80)}`);
    writeFileSync(p, src.replace(find, into));
  },
});
/* THE MARKER COMMENT GOES ON ITS OWN LINE, and that is not cosmetic. The first
   glyph mutation here put the marker comment and the mutated code on the SAME
   line, and glyph-audit skips any line whose trimmed text starts with a comment
   opener, so it correctly ignored the injected diamond and this sweep reported a
   FINDING against a perfectly healthy guard. A mutation that does not actually
   introduce the defect produces a false accusation, which is worse than having
   no sweep at all: it would have sent somebody to rewrite a working audit. So
   every payload is a marker line FOLLOWED BY the real code line, and a FINDING
   is only believable after reading the mutant tree and confirming the defect is
   really in it. */
const append = (file, text, describe) => ({
  file, describe,
  apply(tree) { appendFileSync(path.join(tree, file), text); },
});
/* DELETING A LINE IS NOT `replace(line, '')`. sw.js's PRECACHE holds './js/db.js'
   and './js/dbx.js' would substring-match a careless find, so the newline and the
   indent are part of the needle. */
const dropLine = (file, needle) => ({
  file, describe: `delete the line containing ${JSON.stringify(needle)} from ${file}`,
  apply(tree) {
    const p = path.join(tree, file);
    const lines = readFileSync(p, 'utf8').split('\n');
    const i = lines.findIndex(l => l.includes(needle));
    if (i < 0) throw new Error(`mutation target not found in ${file}: ${needle}`);
    lines.splice(i, 1);
    writeFileSync(p, lines.join('\n'));
  },
});

/* ------------------------------------------------------------- THE CATALOG ---
 * lane:   'node'    the audit reads sources; it runs INSIDE the mutant tree.
 *         'browser' the audit boots a page, so the mutant tree is also SERVED over
 *                   HTTP and the URL passed as argv. The audit still runs from
 *                   inside the mutant tree, because several audits in tests/ read
 *                   sources off disk AND drive a page (see the note in once()).
 * claim:  quoted from the audit's own header or from its release-gate line.
 * expect: 'red' always. An entry that expects green is a documented finding, not
 *         a check, and belongs in the report rather than in the runner.
 */
const CATALOG = [
  {
    audit: 'precache-audit.mjs', lane: 'node',
    claim: 'a module missing from PRECACHE = a blank app on one bad bar (header PROVE-RED: "delete any module line from sw.js PRECACHE and this names it")',
    mutation: dropLine('sw.js', "'./js/db.js'"),
  },
  {
    audit: 'db-export-completeness-lint.mjs', lane: 'node',
    claim: 'every createObjectStore in js/db.js must appear in exportAll and importAll (release-gate: "New store added later without export coverage = silent backup gap")',
    mutation: append('js/db.js', "\n/* MUTATION */\nexport function __mut(d) { d.createObjectStore('mutStore', { keyPath: 'id' }); }\n",
      "add a createObjectStore('mutStore') to js/db.js that no export path knows about"),
  },
  {
    audit: 'selector-audit.mjs', lane: 'node',
    claim: 'a query nothing emits: the .pit-sect class of dead guard',
    mutation: append('js/app.js', "\n/* MUTATION */\nexport function __mutSel() { return document.querySelector('.mut-dead-sect'); }\n",
      "add a document.querySelector('.mut-dead-sect') to js/app.js for a class nothing emits"),
  },
  {
    audit: 'glyph-audit.mjs', lane: 'node',
    claim: 'no text characters standing in for icons (header PROVE-RED: put `<span class="dust-ico">*</span>` back and it fails)',
    mutation: append('js/app.js', "\n/* MUTATION */\nexport const __mutGlyph = (n) => `<div class=\"row\"><span class=\"dust-ico\">◆</span> ${n} Bone Dust</div>`;\n",
      'put a dust diamond back into a markup template literal in js/app.js'),
  },
  {
    audit: 'gate-audit.mjs', lane: 'node',
    claim: 'its own header PROVE-RED: "change app.js back to `if (!spent)` and this exits 1 naming spendPitFight"',
    mutation: append('js/app.js', "\n/* MUTATION */\nexport async function __mutSpend() { const spent = await spendPitFight(); if (!spent) return; return 1; }\n",
      'add a spendPitFight() call site guarded for bare truthiness instead of .ok'),
  },
  {
    audit: 'placeholder-audit.mjs', lane: 'browser',
    claim: 'nothing prints a literal template placeholder (header: the shape is a ${...} inside a SINGLE-quoted string nested in a template literal)',
    mutation: append('js/app.js', "\n/* MUTATION */\nexport const __mutPh = () => `<div class=\"row\">` + '<b>${ICONS.check(11)}</b>' + `</div>`;\n",
      'nest a literal ${ICONS.check(11)} inside a single-quoted markup string in js/app.js'),
  },
  /* TWO ENTRIES FOR fight-tray, because it makes two different promises and they
     do not stand or fall together. Splitting them is the whole reason this file
     reports per CLAIM and not per FILE. */
  {
    audit: 'fight-tray-audit.mjs', lane: 'browser',
    claim: 'release-gate:113 "move-button text inside its own box" / header DIRECTION AND BOUND: "failure is scrollHeight exceeding clientHeight by more than the border+padding slack, on ANY button"',
    mutation: append('app.css', "\n/* MUTATION */\n.fight-actions button { height: 44px !important; max-height: 44px !important; }\n",
      'crush every move button to 44px so its two-line label overflows its own box'),
  },
  {
    audit: 'fight-tray-audit.mjs', lane: 'browser',
    claim: 'release-gate:113 "a scrolling tray that says it scrolls" / CLIP: "any button past the tray\'s edge is announced as scrollable"',
    mutation: append('app.css', "\n/* MUTATION */\n.fight-actions { max-height: 90px !important; }\n",
      'squeeze the move tray to 90px so five of eight buttons fall outside its clip'),
  },
  {
    audit: 'fight-layout-audit.mjs', lane: 'browser',
    claim: 'release-gate:127 "the fight screen holds still" / assertion: "the arena uses at least half the screen"',
    mutation: append('app.css', "\n/* MUTATION */\n.arena { max-height: 150px !important; }\n",
      'cap the arena at 150px so the fight picture is far under half the screen'),
  },
];

// ------------------------------------------------------------------ runner ---

const args = process.argv.slice(2);
const wantBrowser = args.includes('--browser');
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7);
const lanes = wantBrowser ? ['node', 'browser'] : ['node'];
const work = CATALOG.filter(e => lanes.includes(e.lane) && (!only || e.audit.includes(only) || e.claim.includes(only)));

function freshTree() {
  const dir = mkdtempSync(path.join(tmpdir(), 'mutsweep-'));
  /* `git archive`, never a recursive copy of the worktree: a copy drags in
     node_modules, .git and every scratch file, and on a shared machine it can
     also drag in another session's half-written edit. The archive is exactly
     what is committed. */
  const gz = spawnSync('sh', ['-c', `git -C ${JSON.stringify(ROOT)} archive HEAD | tar -x -C ${JSON.stringify(dir)}`], { encoding: 'utf8' });
  if (gz.status !== 0) throw new Error(`git archive failed: ${gz.stderr}`);
  const nm = path.join(ROOT, 'node_modules');
  if (existsSync(nm)) { try { symlinkSync(nm, path.join(dir, 'node_modules')); } catch { /* fine, node-only lane */ } }
  return dir;
}

async function serve(dir) {
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
  const server = createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent((req.url || '/').split('?')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      const full = path.join(dir, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      if (!full.startsWith(dir)) { res.writeHead(403).end(); return; }
      const st = await stat(full).catch(() => null);
      if (!st || !st.isFile()) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(full));
    } catch { res.writeHead(500).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

/* EXIT CODES ARE READ FROM THE CHILD, NOT INFERRED FROM ITS OUTPUT. An audit
   that dies during boot prints no FAIL line and exits 1, and grepping stdout for
   /FAIL/ would score that as a pass. */
function run(entryFile, cwdTree, url) {
  return new Promise(res => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [path.join(cwdTree, 'tests', entryFile), ...(url ? [url] : [])],
      { stdio: ['ignore', 'pipe', 'pipe'], cwd: cwdTree });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    const kill = setTimeout(() => { try { p.kill('SIGKILL'); } catch { /* gone */ } }, 5 * 60_000);
    p.on('close', code => { clearTimeout(kill); res({ code, out, secs: (Date.now() - t0) / 1000 }); });
  });
}

async function once(entry, tree, mutate) {
  let srv = null;
  try {
    if (mutate) entry.mutation.apply(tree);
    if (entry.lane === 'browser') {
      srv = await serve(tree);
      /* RUN THE AUDIT FROM THE MUTANT TREE, NOT FROM THIS ONE, even though the
         page it grades arrives over HTTP. The first version ran browser-lane
         audits out of ROOT on the theory that the grader should never be the
         thing that changed, and it produced a FALSE FINDING inside an hour:
         placeholder-audit has a STATIC half that reads ROOT/js off the DISK and
         a RENDERED half that reads the URL, so running it from ROOT pointed its
         static scan at the UNMUTATED sources while its browser half looked at
         the mutant. It reported 3/3 and this sweep called a healthy guard dead.
         Several audits in tests/ are the same two-halves shape.
         The original concern is answered by CATALOG INTEGRITY below instead: no
         mutation may touch tests/, so the copy of the audit in the mutant tree
         is byte-identical to HEAD's by construction. */
      return await run(entry.audit, tree, srv.url);
    }
    return await run(entry.audit, tree, null);
  } finally {
    if (srv) srv.server.close();
  }
}

/* CATALOG INTEGRITY, BEFORE THE FIRST TREE IS BUILT. Audits run out of the
   mutant tree, so the ONE thing that must stay true is that a mutation never
   edits an audit. If it could, a "GUARDS" row might mean nothing worse than a
   syntax error in the grader, and a "FINDING" might mean the mutation deleted
   the assertion. Cheap to state, fatal to omit. */
for (const e of CATALOG) {
  if (/^tests\//.test(e.mutation.file)) {
    console.log(`FAIL  catalog integrity: the mutation for ${e.audit} edits ${e.mutation.file}, which is an audit, not the app.`);
    process.exit(1);
  }
}

const t0 = Date.now();
console.log(`mutation-sweep: ${work.length} claim(s) in the ${lanes.join(' + ')} lane(s)\n`);

/* ONE CONTROL TREE FOR THE WHOLE RUN, AND ONE CONTROL RESULT PER (audit, lane).
   A `git archive` of this repo is 81MB, and the first version built two of them
   per claim: nine claims meant 1.4GB of copying, and it ran fight-tray's control
   twice for the two claims that share it, which is a wasted 50-second browser
   boot. The control tree is never mutated, so one is enough, and a control result
   depends on the audit and not on the mutation it is about to be compared with. */
const controlTree = freshTree();
const controlCache = new Map();
const results = [];
for (const entry of work) {
  const mutTree = freshTree();
  let row;
  try {
    const key = `${entry.audit}|${entry.lane}`;
    if (!controlCache.has(key)) controlCache.set(key, await once(entry, controlTree, false));
    const control = controlCache.get(key);
    if (control.code !== 0) {
      row = { entry, verdict: 'INCONCLUSIVE', detail: `control exits ${control.code} on an unmutated tree, so a green or red mutant proves nothing`, control, mutant: null };
    } else {
      const mutant = await once(entry, mutTree, true);
      row = mutant.code === 0
        ? { entry, verdict: 'FINDING', detail: `control 0, mutant 0: the guard did not respond`, control, mutant }
        : { entry, verdict: 'GUARDS', detail: `control 0, mutant ${mutant.code}`, control, mutant };
    }
  } catch (e) {
    row = { entry, verdict: 'ERROR', detail: String(e && e.message || e), control: null, mutant: null };
  } finally {
    rmSync(mutTree, { recursive: true, force: true });
  }
  results.push(row);
  const secs = ((row.control?.secs || 0) + (row.mutant?.secs || 0)).toFixed(0);
  console.log(`${row.verdict.padEnd(12)} ${entry.audit}  (${secs}s)`);
  console.log(`             mutation: ${entry.mutation.describe}`);
  console.log(`             claim:    ${entry.claim}`);
  console.log(`             ${row.detail}\n`);
}

// ---------------------------------------------------------------- coverage ---

/* THE FRACTION IS PART OF THE RESULT. A summary that says "9 claims checked, all
   green" over a suite of 131 files is the defect this whole branch is about, so
   the denominator is printed at the same size as the numerator, and this file
   refuses to describe itself as coverage. */
const { readdirSync } = await import('node:fs');
const onDisk = readdirSync(path.join(ROOT, 'tests')).filter(f => /\.(mjs|js)$/.test(f));
const covered = new Set(CATALOG.map(e => e.audit));
const findings = results.filter(r => r.verdict === 'FINDING');
const inconclusive = results.filter(r => r.verdict !== 'FINDING' && r.verdict !== 'GUARDS');

rmSync(controlTree, { recursive: true, force: true });

console.log('-'.repeat(72));
console.log(`CATALOG COVERAGE: ${covered.size} of ${onDisk.length} files in tests/ have a mutation. The other ${onDisk.length - covered.size} were NOT checked by this run and this is not evidence about them.`);
console.log(`ran ${results.length} claim(s) in ${Math.round((Date.now() - t0) / 1000)}s: ${results.filter(r => r.verdict === 'GUARDS').length} guard, ${findings.length} do not, ${inconclusive.length} inconclusive.`);

for (const r of findings) {
  console.log(`\nFAIL  ${r.entry.audit} stayed GREEN through: ${r.entry.mutation.describe}`);
  console.log(`        it claims: ${r.entry.claim}`);
  const line = (r.mutant.out.split('\n').filter(Boolean).pop() || '').trim();
  console.log(`        the mutant run's last line was: ${line.slice(0, 140)}`);
}
if (findings.length) {
  console.log('\nA guard that does not move when its subject breaks is not a guard.');
  process.exit(1);
}
if (inconclusive.length) {
  console.log('\nNo finding, but not a clean run either: see the INCONCLUSIVE rows above.');
  process.exit(1);
}
console.log('\nEvery claim in the catalog responded to its mutation. That is a statement about the catalog, not about tests/.');

/* MEASURED on this checkout, 2026-08-17, wall clock, not estimated:
 *   node lane      5 claims,   6s total  (one shared 81MB control tree, then one
 *                              mutant tree per claim; the audits themselves are
 *                              sub-second source scans)
 *   --browser      9 claims, 314s total  (3 browser controls + 4 browser mutants
 *                              at ~50-60s a boot; placeholder 81s, fight-tray
 *                              108s a claim, fight-layout 61s)
 *
 * SO: the node lane is FAST-tier shaped and is registered there. The browser lane
 * is not a tier at ANY size and it is dishonest to pretend otherwise. Nine claims
 * over four files already costs five minutes; the catalog covers 8 of 139 files in
 * tests/, and a browser mutation for every browser audit would be roughly 90 files
 * x ~110s, which is close to three hours. Three hours is a nightly or a
 * per-changed-file mode, and this repo's own rule is that a gate people skip is
 * worse than no gate.
 *
 * HOW IT SHOULD ACTUALLY RUN, in the order I would build it:
 *   1. FAST (today): the node lane, 6s, on every push. Registered.
 *   2. PER-CHANGED-FILE: `--only=<audit>` already does this. The hook is one line
 *      in the pre-push path: for each audit whose SUBJECT files the diff touches,
 *      run its claims. A tray change costs 108s, not three hours.
 *   3. NIGHTLY: the whole catalog with --browser, on a machine nobody is waiting
 *      at, with the FINDING rows mailed rather than blocking a push.
 * None of that is worth building until the catalog is bigger than 8 files, and
 * growing the catalog is the actual work here: the runner was an afternoon, the
 * mutations are one careful reading of one audit header each.
 *
 * FINDINGS FROM THE FIRST FULL RUN (2026-08-17):
 *   fight-tray-audit.mjs CLIP + AFFORDANCE stay GREEN, 22/22, exit 0, on a tree
 *   where the move tray is squeezed to 90px and hides 138px with five of eight
 *   buttons past its edge. tests/tautology-audit.mjs rule E names the mechanism
 *   statically: the escape clause reads .scrolls, which js/app.js:15635 toggles
 *   from the same scrollHeight - clientHeight the antecedent measures.
 *   The same file's TEXT row is HEALTHY: crush the buttons to 44px so the labels
 *   overflow and it goes red. The two halves are not the same guard, which is why
 *   entries here are per CLAIM.
 *
 * FALSE FINDINGS THIS RUNNER PRODUCED BEFORE IT WAS RIGHT, kept on the record
 * because they are the failure mode of the method itself:
 *   1. glyph-audit "did not respond" to a diamond injected on the same line as
 *      the `/* MUTATION *\/` marker. glyph-audit skips comment lines and was
 *      correct; the mutation never introduced the defect.
 *   2. placeholder-audit "did not respond" while browser-lane audits ran out of
 *      THIS tree. Its STATIC half reads sources off disk, so it graded the
 *      unmutated repo while its RENDERED half looked at the mutant.
 * Both read as a dead guard and both were the runner. A FINDING is a claim about
 * somebody else's work: open the mutant tree and confirm the defect is in it
 * before you believe one.
 */
