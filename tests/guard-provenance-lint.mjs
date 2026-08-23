/* GUARDS THAT ENCODE A DECISION NOBODY MADE ANY MORE. 2026-08-22.
 *
 * guard-hygiene-lint catches a guard that CANNOT SEE its bug. This file catches
 * the opposite and more expensive failure: a guard that sees perfectly well and
 * is enforcing an instruction that was reversed weeks ago. It reports GREEN. It
 * rejects correct work. And because green is the colour of "nothing to look at",
 * it survives far longer than a blind guard does.
 *
 * Four of these have been found in this repo, all after they had cost real time:
 *
 *   1. VECTOR_OK = ['Herb patch'] — an allow-list of one, kept enforcing a
 *      vector-art rule after the art direction had moved on
 *   2. the wheel's label row, still grading copy that had been rewritten
 *   3. the T-slot legendary demotion, a balance call that was later reversed
 *   4. worst: a GREEN audit blocked the Pit cap fix for THREE ROUNDS. Each round
 *      the guard said no, and each round the guard was believed, because a
 *      passing test looks like the code is wrong rather than the test being old.
 *
 * PROVE-RED CANNOT CATCH THIS, and that is the whole reason this file is
 * separate from guard-hygiene-lint. A stale guard passes its prove-red
 * flawlessly: mutate the implementation and it goes red exactly as designed. It
 * is guarding correctly. It is guarding the wrong thing. No amount of mutation
 * testing distinguishes "this rule is enforced" from "this rule still applies".
 *
 * THE ONE THAT WORKED. tests/community-audit.mjs:56 carries Tom's instruction
 * verbatim with its date: `Tom, 2026-08-13: "make the popup happen on the first
 * three opens to..."`. On 2026-08-21 an edit tried to change that 3 to a 2 as
 * incidental cleanup. The citation is the only reason it was caught and
 * reverted. One dated line, one prevented regression. That is the whole ask.
 *
 * WHAT THIS REQUIRES. A literal expectation constant — an UPPER_SNAKE const
 * assigned an array containing string literals — must carry an ISO date within
 * the 7 lines above it. That is the minimum that makes staleness CHECKABLE by a
 * human at debug time, which is when it matters: you hit a red guard, you
 * believe your code is right, and you need to know in one glance where its
 * expectation came from and whether that instruction is still live.
 *
 * WHAT THIS DOES NOT DO, said plainly rather than oversold:
 *   - A date is not proof the decision is current. It is a handle, not a fact.
 *   - It covers arrays of string literals only. COMMUNITY_MAX_SHOWS = 3 is
 *     exactly this species of decision and is NOT detected, because bare magic
 *     numbers cannot be told apart from arithmetic by any cheap static rule.
 *     Per section 3 of guard-hygiene-lint: a lint that cries wolf gets deleted,
 *     and a noisy row here would take the real ones down with it.
 *   - Nothing stops someone pasting a date to silence the row. The same is true
 *     of every ratchet in this repo. It raises the floor; it is not a fence.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fails = [];
const ok = (n, pass, d = '') => { console.log(`${pass ? 'ok  ' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!pass) fails.push(n); };

const AUDIT_RE = /audit|guard|lint|\.test\.js$/i;
const files = readdirSync(here).filter(f => /\.(mjs|js)$/.test(f) && AUDIT_RE.test(f) && f !== 'guard-provenance-lint.mjs');

/* Bracket-MATCHED, not regex-terminated. The first cut of this scan used
   `\[[^\]]*\]` and found 33 constants. Bracket matching finds 71: more than half
   of them span multiple lines, and a one-line regex is blind to every one. This
   repo has now shipped that same too-narrow-regex bug three times (twice on
   hyphenated cosmetic ids), so the SETUP rows below exist to catch it a fourth.
   Brackets inside string literals would miscount; the SETUP count is what
   notices if that ever starts happening. */
const found = [];
for (const f of files) {
  const text = readFileSync(join(here, f), 'utf8');
  const lines = text.split('\n');
  const re = /(^|\n)\s*const\s+([A-Z][A-Z0-9_]{2,})\s*=\s*\[/g;
  let m;
  while ((m = re.exec(text))) {
    const open = text.indexOf('[', m.index);
    let depth = 0, end = -1;
    for (let i = open; i < text.length; i++) {
      const c = text[i];
      if (c === '[') depth++;
      else if (c === ']' && !--depth) { end = i; break; }
    }
    if (end < 0) continue;
    const body = text.slice(open, end + 1);
    if (!/["'`]/.test(body)) continue;               // no string literals: not an expectation
    const line = text.slice(0, m.index).split('\n').length;
    const ctx = lines.slice(Math.max(0, line - 7), line + 1).join('\n');
    const date = (ctx.match(/20\d\d-\d\d-\d\d/) || [])[0] || null;
    found.push({ file: f, line, name: m[2], date });
  }
}

/* ---- SETUP: THE SCAN IS NOT VACUOUS ------------------------------------- */
/* Both rows below fail if the scan stops reaching, which is the exact way this
   file would go quietly useless: no files, or a matcher that stops matching,
   and every ratchet row underneath passes for free. */
ok('SETUP the scan found audit files', files.length >= 50, `${files.length} files`);
ok('SETUP the matcher still finds literal expectation constants',
  found.length >= 60, `${found.length} constants; the first cut of this scan used a one-line regex and saw only 33 of them`);

/* ---- THE RATCHET -------------------------------------------------------- */
/* 69 of 71 carry no date today. Retrofitting all of them in one sweep would be
   done badly and would mostly produce dates pasted to silence a row, which is
   worth less than nothing. So this ratchets: the undated count may never rise.
   A NEW pinned expectation therefore has to cite where it came from, and every
   legacy one fixed lowers the ceiling permanently. Lower the number when you fix
   one; never raise it. */
const undated = found.filter(c => !c.date);
const CEILING = 69;
ok(`RATCHET literal expectation constants with no dated provenance do not rise above ${CEILING}`,
  undated.length <= CEILING,
  `${undated.length} of ${found.length} undated. ` +
  (undated.length > CEILING
    ? `${undated.length - CEILING} more than the ceiling. A pinned expectation must cite its source instruction and date within 7 lines above.`
    : 'ratchet holding'));

/* NAME THE CULPRITS WHEN IT TRIPS. The first person to hit this ratchet (2026-08-23,
   scoping the boneyard marker selectors) got a bare "70 of 72" and dated the WRONG
   constant, because the row printed three arbitrary examples in scan order and this
   matcher only counts bracketed literals containing strings. They found the real one
   by trial. A ratchet that says "something you touched is undated" without saying
   what is a puzzle, not a guard, so on failure print the whole list grouped by file:
   the offender is almost always in a file the author just edited, which makes it
   obvious by inspection even at this length. Only on failure, so a green run stays
   one line. */
if (undated.length > CEILING) {
  const byFile = new Map();
  for (const c of undated) (byFile.get(c.file) ?? byFile.set(c.file, []).get(c.file)).push(c);
  console.log(`\n    every undated pinned expectation (${undated.length}), grouped by file.`);
  console.log('    Yours is almost certainly in a file you just edited:');
  for (const [file, cs] of [...byFile].sort()) {
    console.log(`      ${file}`);
    for (const c of cs) console.log(`          :${c.line}  ${c.name}`);
  }
}

/* ---- THE REVIEW LIST ---------------------------------------------------- */
/* Not a failure. The point of a date is that it can be READ, so the oldest
   citations get printed on every run: those are the expectations most likely to
   be enforcing an instruction that has since moved. This list is thin now and
   grows useful as the ratchet walks down. */
const dated = found.filter(c => c.date).sort((a, b) => a.date.localeCompare(b.date));
if (dated.length) {
  console.log(`\n    oldest pinned expectations (${dated.length} cited, review when one blocks you):`);
  for (const c of dated.slice(0, 10)) console.log(`      ${c.date}  ${c.file}:${c.line}  ${c.name}`);
}

console.log(`\nguard-provenance: ${fails.length ? fails.length + ' FAILED' : 'clean'}`);
process.exit(fails.length ? 1 : 0);
