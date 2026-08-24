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
 * AN EMPTY SAMPLE IS A FAILURE. If the scan finds no register calls at all, the
 * matcher has drifted (a helper renamed, a suite moved) and the lint would pass
 * by finding nothing, which is the failure mode this repo has been bitten by
 * before. It exits 1 with that said out loud.
 *
 * PROVEN RED, 2026-08-23, both mutations made in the file itself and grepped
 * back before running:
 *   - drop `test: IS_TEST` from newPlayer() in server/security.test.mjs
 *     -> "POST /register with no `test:` in the body", 1 unflagged, exit 1.
 *   - defang the binding to `const IS_TEST = false;` (import left in place)
 *     -> "not bound to flagFor(BASE)" on both call sites, exit 1.
 *   Restored: 13 calls, 0 unflagged, exit 0.
 *
 *   node tests/live-api-register-lint.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANNOTATION = 'live-api-lint: unflagged';

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git' || e === '.wrangler') continue;
    const f = path.join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (f.endsWith('.mjs') || f.endsWith('.test.js')) out.push(f);
  }
  return out;
}

/* The call this scans is always `fetch(<something with /register>, {...})`, in
   one of two spellings across the suites: a template literal (`${BASE}/register`)
   or a concatenation (BASE + '/register'). So: find each /register, walk back to
   the fetch( that opens the call, then paren-match forward to its end. Prose
   mentions of /register in comments have no fetch( behind them and are skipped,
   which is why the backward walk is bounded rather than greedy. */
function registerCalls(src) {
  const hits = [];
  for (let i = src.indexOf('/register'); i !== -1; i = src.indexOf('/register', i + 1)) {
    const back = src.lastIndexOf('fetch(', i);
    if (back === -1 || i - back > 200) continue;      // prose, not a call
    let depth = 0, end = -1;
    for (let j = back + 'fetch'.length; j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end === -1) continue;                          // unterminated: not ours to judge
    hits.push({ at: back, text: src.slice(back, end + 1) });
  }
  return hits;
}

const SELF = fileURLToPath(import.meta.url);
const files = walk(path.join(ROOT, 'server')).concat(walk(path.join(ROOT, 'tests')))
  .filter(f => f !== SELF);          // this file quotes the pattern it is looking for
let scanned = 0, bad = 0, annotated = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  if (!src.includes('/register')) continue;
  /* NOT just "does it import flagFor": `const IS_TEST = false;` next to a live
     import passes that and mints visible accounts anyway (measured, 2026-08-23).
     The binding itself is the guard, so the binding is what gets checked. */
  const boundToGuard = /\bIS_TEST\s*=\s*flagFor\s*\(/.test(src)
    && /from\s+'[^']*test-flag\.mjs'/.test(src);
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
  }
}

if (!scanned) {
  console.log('FAIL  scanned 0 register calls: the matcher has drifted, so this lint proves nothing');
  process.exit(1);
}
console.log(`${bad ? 'FAIL' : 'PASS'}  ${scanned} register calls, ${bad} unflagged, ${annotated} annotated`);
if (bad) {
  console.log('      Fix: add `test: IS_TEST` beside `pubkey`, with IS_TEST = flagFor(BASE) from');
  console.log('      server/test-flag.mjs, so a run pointed at the live API mints an account');
  console.log(`      nobody can see. A deliberately VISIBLE one needs "${ANNOTATION} <reason>" above it.`);
}
process.exit(bad ? 1 : 0);
