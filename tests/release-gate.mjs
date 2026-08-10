/* THE RELEASE GATE.
 *
 * Tom, 2026-08-10, after finding the News tab broken a day after it was fixed:
 * "you need to create guard rails to fix these things and then not have them slip
 * back to some bullshit broken code."
 *
 * The guard rails mostly EXISTED. The problem is that `npm test` runs two files
 * (unit + pit) and the forty-odd browser audits are all run by hand, one at a
 * time, from memory, which means the ones I do not happen to think about that day
 * are not run at all. An audit nobody runs is not a guard rail, it is a file.
 *
 * So this is one command that runs the audits guarding SHIPPED, PLAYER-FACING
 * surfaces, and exits non-zero if any of them fails. It is deliberately not all
 * forty: a gate that takes half an hour gets skipped, and a skipped gate is the
 * thing we are fixing. Anything guarding a surface a player touches every day
 * belongs on this list; add to it rather than running something on the side.
 *
 *   node tests/release-gate.mjs [baseUrl]
 *
 * Run it against localhost BEFORE pushing, and against the live URL AFTER, per
 * the standing ritual (localhost passing is not "a player can use it").
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
/* THE GATE OWNS ITS SERVER. Passing no argument used to mean localhost:8765 and
   hope: whatever happened to be serving that port. With two sessions open on this
   machine that is a green about somebody else's working tree, which has bitten
   this project before. With no argument it now serves THIS repo on a free port
   and tears it down after. Pass a URL (the live site) to skip all of that. */
import { createServer } from 'node:http';
import { readFile, stat, readdir } from 'node:fs/promises';
import { extname, join as pjoin, normalize } from 'node:path';

const repoRoot = pjoin(here, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

async function serveRepo() {
  const server = createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent((req.url || '/').split('?')[0]);
      if (rel.endsWith('/')) rel += 'index.html';
      // never serve outside the repo, however creative the request is
      const full = pjoin(repoRoot, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
      if (!full.startsWith(repoRoot)) { res.writeHead(403).end(); return; }
      const st = await stat(full).catch(() => null);
      if (!st || !st.isFile()) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream',
        'cache-control': 'no-store' });
      res.end(await readFile(full));
    } catch { res.writeHead(500).end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

const argUrl = process.argv[2];
const own = argUrl ? null : await serveRepo();
const base = argUrl || own.url;
if (own) console.log(`serving this repo at ${base}\n`);

/* Node-only checks first: they are seconds, and there is no point burning four
   minutes of browser time on a build whose pure logic is already broken. */
const PURE = ['unit.test.js', 'pit.test.js'];
const BROWSER = [
  'news-tab-audit.mjs',      // every announcement still opens with its art
  'mini-theme-audit.mjs',    // roaming mini-bosses are drawn as themed monsters
  'remote-den-audit.mjs',    // the daily free boss reads as beaten, and moves the cap
  'bestiary-audit.mjs',      // the teaser stays a teaser; Today names the hunt
  'mage-audit.mjs',          // the Live Wire on every surface he belongs on
  'fight-layout-audit.mjs',  // the fight screen holds still
  'batch-audit.mjs',         // Cam's FX, the two-enemy read, the result screen
  'error-telemetry-audit.mjs', // crashes queue, and never leave a test device
  'contrast-audit.mjs',      // Walt gave it an exit code; it could not fail before
  'year-readout-audit.mjs',  // Walt: every Year bucket names a DIFFERENT month
  'gate-audit.mjs',          // hunts guards that cannot fail: belongs in every run
  'screen-sweep.mjs',        // no screen renders blank or throws
];

function run(file, args) {
  return new Promise(res => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [join(here, file), ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    p.on('close', code => res({ file, code, out, secs: Math.round((Date.now() - t0) / 1000) }));
  });
}

/* A SUITE THAT CRASHES MUST NOT LOOK LIKE A QUIET FAILURE. This printed only
   lines matching /^FAIL/, so a suite that died during boot (no assertions run,
   no FAIL lines, exit 1) reported as a blank blocker and read like a flake. Show
   the assertion failures when there are any, and the tail of the output when
   there are not, which is where the stack will be. */
function failLines(out) {
  const lines = out.split('\n');
  const hits = lines.filter(l => /^FAIL|FAILED/.test(l));
  const show = hits.length ? hits.slice(0, 12) : ['(no assertions failed: the suite itself died)', ...lines.filter(Boolean).slice(-8)];
  return show.map(l => '        ' + l).join('\n');
}

/* NO AUDIT MAY EXIST WITHOUT RUNNING. The BROWSER list above is hand-written, so
   a new *-audit.mjs could sit in tests/ forever without the gate ever calling it,
   which is worse than not having written it: it reads as coverage. Anything
   deliberately out of the gate goes in SKIP with a reason, so the omission is a
   decision on the record rather than an oversight. */
const SKIP = {};
const onDisk = (await readdir(here)).filter(f => /-audit\.mjs$/.test(f)).sort();
/* TWO TIERS, BECAUSE THE ALTERNATIVE IS THEATRE EITHER WAY.
   The hand-written list above was the only thing the gate ran, and 43 other
   audits sat in tests/ never executed: guards against a dust exploit, a Glutton
   farm on its third fix, literal ${...} printing in the UI, onboarding on a fresh
   profile. Not throwaways. Unrun guards are worse than no guards, because they
   read as coverage.
   But running all 53 takes the better part of an hour, and Reggie's own warning
   holds: a gate that takes half an hour gets skipped, and a skipped gate is what
   we were fixing. So FAST runs on every push and FULL is everything else, run
   before a release with `--all`. The coverage assertion below is the point: a file
   in NEITHER tier fails the gate, so a new audit cannot quietly go unrun. */
const FULL = onDisk.filter(f => !BROWSER.includes(f) && !SKIP[f]);
const runAll = process.argv.includes('--all');
/* ⚠️ THE COVERAGE CHECK HERE CANNOT FAIL, AND SAYING SO IS THE POINT.
   I wrote `const unrun = runAll ? [] : []` and a comment claiming every audit
   belongs to a tier "by construction". It is true and it is worthless: FULL is
   defined as everything-not-FAST, so an undeclared audit is silently swept into
   FULL rather than flagged, and the line this file prints about tiers is a
   description, not protection. Walt proved it dead; anti-regression rule 1, in
   the gate itself, written by the person who added the rule to the gate.
   The real fix is his DECLARED-map version (W1b, his lane, next after this
   push): every audit must be named in a tier, checked BEFORE any browser spawns,
   an empty reason failing. Not duplicated here, because three of us fixing the
   same thing in parallel is the week's other lesson. Until it lands, the output
   below states what it is and must not be cited as coverage. */
if (runAll) BROWSER.push(...FULL);

const results = [];
for (const f of PURE) {
  const r = await run(f, []);
  results.push(r);
  console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${f.padEnd(24)} ${r.secs}s`);
  if (r.code !== 0) console.log(failLines(r.out));
}
for (const f of BROWSER) {
  const r = await run(f, [base]);
  results.push(r);
  console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${f.padEnd(24)} ${r.secs}s`);
  if (r.code !== 0) console.log(failLines(r.out));
}

if (own) own.server.close();
if (!runAll && FULL.length) {
  console.log(`\n${FULL.length} audit(s) not in FAST were skipped (everything not named in FAST lands here).`);
  console.log('Run them before a release:  node tests/release-gate.mjs --all');
  console.log('NOTE: this is a tally, not a guard. A new audit is swept in here silently;');
  console.log('      the check that would flag it is Walt\'s W1b, not yet landed.');
}
const bad = results.filter(r => r.code !== 0);
console.log(`\n${results.length - bad.length}/${results.length} suites green against ${base}`);
if (bad.length) console.log(`BLOCKED: ${bad.map(r => r.file).join(', ')}`);
process.exit(bad.length ? 1 : 0);
