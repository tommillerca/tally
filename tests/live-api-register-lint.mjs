/* EVERY TEST REGISTRATION IS BORN FLAGGED.
 *
 * Tom, 2026-08-22 (docs/FEEDBACK-2026-08-22-v424.md, item 6): "im pretty sure
 * youve somehow added a bunch of bot testers again because we have a ton of lvl
 * 1s that no one plays ... find a more eloquent solution to this than just
 * leaving a mess of dead bots in the actual game."
 *
 * The census (docs/BOT-CENSUS-2026-08-22.md) found 47 of them, and 28 came from
 * ONE mechanism: a server suite run with BASE= pointed at the deployed Worker
 * instead of a local one. Every suite in server/ defaults to
 * http://127.0.0.1:8788 and takes BASE= or API= to point anywhere, and four
 * evening dev sessions each left a register-only burst behind.
 *
 * "Remember to run tests locally" is the rule that has already been forgotten
 * four times. This is the version that cannot be: every POST /register in a
 * test file carries `test: IS_TEST`, where IS_TEST is flagFor(BASE) from
 * server/test-flag.mjs. Local runs are unflagged and behave exactly as before
 * (the suites' own leaderboard and race assertions need visible accounts). A
 * run pointed anywhere else mints accounts with players.is_test = 1, invisible
 * on every public surface from the moment they exist. Pointing a suite at
 * production stops being a mess and becomes a non-event.
 *
 * WHAT IT CHECKS, per fetch(...'/register'...) under server/ and tests/:
 *   - the body has a `test:` key at all, and
 *   - its value is either the literal `true` (for a test OF the flag) or the
 *     identifier IS_TEST in a file that actually binds IS_TEST = flagFor(...).
 *     Checking the import alone is not enough: `const IS_TEST = false;` beside a
 *     live import passes that and mints visible accounts anyway.
 *   - or the call is annotated on the line above with `live-api-lint: unflagged`
 *     plus a reason. Nothing needs that annotation today.
 *
 * AND THE ROW A LOCAL RUN LEAVES BEHIND. 2026-09-02. Everything above is about
 * a run that reaches a REAL database. It says nothing about the runs that happen
 * every day, because `test:` is deliberately FALSE on a local base: an invisible
 * account cannot grade the leaderboard, the friend graph, the race or the
 * spires. MEASURED the same day on a cp -R copy with flagFor hard-coded to true:
 * 49 of 174 server assertions went red (test/api 43 passed 23 failed, spires
 * 6/22, security 22/4). is_test is a SUPPRESSION switch and cannot also be a
 * provenance mark.
 * So every register call carries `run: RUN` as well, RUN being the one
 * per-process label in server/test-flag.mjs, and the server writes it to
 * players.test_run. Nothing filters on that column, so a marked row still
 * behaves exactly like a real one, and an operator reading the table gets "a bot
 * made this" and "which run" without an investigation. This section checks the
 * label the same way it checks the flag: present, and bound to the shared guard
 * rather than to a local string.
 *
 * AN EMPTY SAMPLE IS A FAILURE. If the scan finds no register calls at all, the
 * matcher has drifted (a helper renamed, a suite moved) and the lint would pass
 * by finding nothing, which is the failure mode this repo has been bitten by
 * before. It exits 1 with that said out loud.
 *
 * AND THE REGISTRATION NO TEST FILE MAKES. 2026-09-02. The scan above cannot see
 * a register call the APP makes on an audit's behalf, and that turned out to be
 * the bigger hole: production went 73 -> 93 players in a day of local runs. The
 * second section below closes it. Both live here because they are one rule, "a
 * test run does not mint a real account", enforced at the only two places it can
 * be broken.
 *
 * PROVEN RED, 2026-08-23, both mutations made in the file itself and grepped
 * back before running:
 *   - drop `test: IS_TEST` from newPlayer() in server/security.test.mjs
 *     -> "POST /register with no `test:` in the body", 1 unflagged, exit 1.
 *   - defang the binding to `const IS_TEST = false;` (import left in place)
 *     -> "not bound to flagFor(BASE)" on both call sites, exit 1.
 *   Restored: 13 calls, 0 unflagged, exit 0.
 *
 * PROVEN RED for section 2, 2026-09-02, on a cp -R copy of the branch:
 *   - delete the setRequestInterception block from maskWebdriver in godmode.js
 *     -> WALL "refuses the production API host" goes red, exit 1.
 *   - paste the raw defineProperty mask back into one audit
 *     -> MASK "no audit installs the webdriver mask by hand" names it, exit 1.
 *
 *   node tests/live-api-register-lint.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANNOTATION = 'live-api-lint: unflagged';
const RUN_ANNOTATION = 'live-api-lint: unlabelled';

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git' || e === '.wrangler') continue;
    const f = path.join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (f.endsWith('.mjs') || f.endsWith('.test.js')) out.push(f);
  }
  return out;
}

/* The call this scans is `<opener>(<something with /register>, {...})`, in one of
   two spellings across the suites: a template literal (`${BASE}/register`) or a
   concatenation (BASE + '/register'). So: find each /register, walk back to the
   opener, then paren-match forward to its end. Prose mentions of /register in
   comments have no opener behind them and are skipped, which is why the backward
   walk is bounded rather than greedy.
   TWO OPENERS, not one. Until 2026-09-02 this looked for `fetch(` alone, and
   server/stale-retention.test.mjs registers through its own postJson() helper,
   so its call was never scanned at all: the lint reported 13 and there were 14.
   It happened to be flagged correctly, which is the worst version of the bug,
   because nothing said otherwise. A third spelling would slip through the same
   way, and the backstop for that is the empty-sample check below plus the count
   printed on the summary line: if it drops, a call stopped being seen. */
const OPENERS = ['fetch(', 'postJson('];
function registerCalls(src) {
  const hits = [];
  for (let i = src.indexOf('/register'); i !== -1; i = src.indexOf('/register', i + 1)) {
    const back = Math.max(...OPENERS.map(o => src.lastIndexOf(o, i)));
    if (back === -1 || i - back > 200) continue;      // prose, not a call
    let depth = 0, end = -1;
    for (let j = src.indexOf('(', back); j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end === -1) continue;                          // unterminated: not ours to judge
    hits.push({ at: back, text: src.slice(back, end + 1) });
  }
  return hits;
}

/* =================== 1. A REGISTER CALL A TEST MAKES ITSELF ============== */
const SELF = fileURLToPath(import.meta.url);
const files = walk(path.join(ROOT, 'server')).concat(walk(path.join(ROOT, 'tests')))
  .filter(f => f !== SELF);          // this file quotes the pattern it is looking for
let scanned = 0, bad = 0, annotated = 0, labelled = 0, unlabelled = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  if (!src.includes('/register')) continue;
  /* NOT just "does it import flagFor": `const IS_TEST = false;` next to a live
     import passes that and mints visible accounts anyway (measured, 2026-08-23).
     The binding itself is the guard, so the binding is what gets checked. */
  const boundToGuard = /\bIS_TEST\s*=\s*flagFor\s*\(/.test(src)
    && /from\s+'[^']*test-flag\.mjs'/.test(src);
  /* Same shape of check for the label: importing RUN proves nothing if the file
     then shadows it with a string of its own. */
  const runFromGuard = /\bRUN\b[^\n]*from\s+'[^']*test-flag\.mjs'/.test(src)
    && !/\bconst\s+RUN\s*=/.test(src);
  for (const hit of registerCalls(src)) {
    scanned++;
    const rel = path.relative(ROOT, f);
    const line = src.slice(0, hit.at).split('\n').length;
    const prev = src.slice(0, hit.at).split('\n').slice(-3).join('\n');
    if (prev.includes(ANNOTATION)) { annotated++; continue; }
    const m = /\btest\s*:\s*([A-Za-z_$][\w$]*|true|false)/.exec(hit.text);
    if (!m) {
      bad++;
      console.log(`FAIL  ${rel}:${line}  POST /register with no \`test:\` in the body`);
      continue;
    }
    // `true` is for a test OF the flag itself. Anything else has to be the
    // shared guard, or "flagged" could quietly mean `test: false`.
    if (m[1] !== 'true' && !(m[1] === 'IS_TEST' && boundToGuard)) {
      bad++;
      console.log(`FAIL  ${rel}:${line}  registers with \`test: ${m[1]}\`, which is not bound to flagFor(BASE)`);
    }
    /* AND THE LABEL, which is the half `test:` cannot cover. `test:` is false on
       a local run by design, so on the runs that happen every day it leaves a
       row that reads exactly like a real player's. `run: RUN` marks it without
       hiding it. A call that deliberately omits the label (the control in the
       server suite, which has to prove an unlabelled row really is possible)
       says so on the line above. */
    const r = /\brun\s*:\s*([A-Za-z_$][\w$]*)/.exec(hit.text);
    if (prev.includes(RUN_ANNOTATION)) { unlabelled++; continue; }
    if (!r) {
      bad++;
      console.log(`FAIL  ${rel}:${line}  POST /register with no \`run:\` in the body, so the row it makes is unmarked`);
    } else if (!(r[1] === 'RUN' && runFromGuard)) {
      bad++;
      console.log(`FAIL  ${rel}:${line}  registers with \`run: ${r[1]}\`, which is not RUN from server/test-flag.mjs`);
    } else labelled++;
  }
}

if (!scanned) {
  console.log('FAIL  scanned 0 register calls: the matcher has drifted, so this lint proves nothing');
  process.exit(1);
}
/* BOTH SAMPLES NON-EMPTY. A run of this lint that labelled nothing is grading an
   empty set, which is the way this repo has been fooled before. */
if (!labelled) {
  console.log('FAIL  0 register calls carried `run: RUN`: the label check matched nothing and proves nothing');
  bad++;
}
console.log(`${bad ? 'FAIL' : 'PASS'}  ${scanned} register calls, ${bad} unflagged, ${annotated} annotated, ${labelled} labelled, ${unlabelled} deliberately unlabelled`);
if (bad) {
  console.log('      Fix: add `test: IS_TEST, run: RUN` beside `pubkey`, both from');
  console.log('      server/test-flag.mjs, so a run pointed at the live API mints an account');
  console.log('      nobody can see AND every row it makes says which run made it.');
  console.log(`      A deliberately VISIBLE one needs "${ANNOTATION} <reason>" above it;`);
  console.log(`      a deliberately UNMARKED one needs "${RUN_ANNOTATION} <reason>".`);
}

/* =================== 2. A MASK WITHOUT ITS WALL =========================
 *
 * The section above only sees a register call a TEST file makes itself. It
 * cannot see the one the APP makes on the test's behalf, and that is the bigger
 * hole: an audit that masks navigator.webdriver turns off NOSOCIAL, and
 * js/social.js then falls back to PROD_API because no ?api= override is stored,
 * so a virgin install boots, finishes onboarding and registers for real. Nothing
 * in that path is a fetch() this repo wrote, so `test: IS_TEST` can never reach
 * it. MEASURED 2026-09-02: one run of tests/profile-units-audit.mjs made 20
 * requests to bonez-api.boneheadz.workers.dev, 3 of them POST /register.
 *
 * godmode's maskWebdriver installs the mask and the egress wall together, which
 * is the only reason they cannot drift apart. So the rule is: nobody else
 * installs the mask by hand, and the wall really refuses.
 *
 * THE WALL ROW IS DRIVEN, NOT GREPPED. A presence check on a string in
 * godmode.js would go red on a rename and green on a wall whose host test had
 * been widened to allow everything. This calls the real maskWebdriver with a
 * stand-in page and asks what it does with two requests, one of each kind. */
const { maskWebdriver } = await import('./godmode.js');
const fakeReq = url => {
  const r = { url: () => url, method: () => 'POST', acted: null };
  r.abort = () => { r.acted = 'abort'; return Promise.resolve(); };
  r.continue = () => { r.acted = 'continue'; return Promise.resolve(); };
  return r;
};
let handler = null;
const exitBefore = process.listeners('exit');
const quiet = console.log;
console.log = () => {};                    // the wall SHOUTS by design; this is a probe, not a run
await maskWebdriver({
  evaluateOnNewDocument: async () => {},
  setRequestInterception: async () => {},
  on: (ev, h) => { if (ev === 'request') handler = h; },
});
const outside = fakeReq('https://bonez-api.boneheadz.workers.dev/register');
const loopback = fakeReq('http://127.0.0.1:8765/index.html');
if (handler) { handler(outside); handler(loopback); }
console.log = quiet;
/* Drop the exit summary this probe just armed, and only that one: a lint that
   ends by announcing refused egress reads like the lint itself leaked. */
for (const l of process.listeners('exit')) if (!exitBefore.includes(l)) process.off('exit', l);

const wallRow = (name, pass, detail) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  if (!pass) bad++;
};
wallRow('WALL maskWebdriver refuses the production API host',
  outside.acted === 'abort', `${outside.url()} -> ${outside.acted || 'nothing at all'}`);
/* THE CONTROL. Without it a wall that refused EVERYTHING, breaking every suite
   that serves the tree or stubs an API on a local port, would pass the row
   above. Both samples are non-empty on purpose. */
wallRow('WALL CONTROL and lets a loopback request through',
  loopback.acted === 'continue', `${loopback.url()} -> ${loopback.acted || 'nothing at all'}`);

/* Every OTHER spelling of the mask is the drift this section exists to stop. */
const MASK_RE = /defineProperty\(\s*navigator\s*,\s*['"]webdriver['"]/;
const testFiles = readdirSync(path.join(ROOT, 'tests')).filter(f => /\.(mjs|js)$/.test(f));
const inline = testFiles.filter(f => f !== 'godmode.js' && f !== path.basename(SELF)
  && MASK_RE.test(readFileSync(path.join(ROOT, 'tests', f), 'utf8')));
wallRow('MASK no audit installs the webdriver mask by hand',
  inline.length === 0, inline.length
    ? `${inline.length}: ${inline.join(', ')}. Call maskWebdriver(page) from godmode.js instead, so the mask cannot arrive without the wall.`
    : `${testFiles.length} test files scanned, all masks go through godmode`);
/* AN EMPTY SAMPLE IS A FAILURE, same as above: if nothing calls maskWebdriver
   the two WALL rows are grading a helper nobody uses. */
const callers = testFiles.filter(f => f !== 'godmode.js' && f !== path.basename(SELF)
  && /\bmaskWebdriver\s*\(/.test(readFileSync(path.join(ROOT, 'tests', f), 'utf8')));
wallRow('MASK SAMPLE the helper is actually used by audits',
  callers.length >= 2, `${callers.length} caller(s): ${callers.join(', ') || 'none'}`);

process.exit(bad ? 1 : 0);
