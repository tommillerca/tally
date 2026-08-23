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

/* ---- THE RATCHET, ON THE SET AND NOT THE COUNT ---------------------------
   The first version counted: "must not rise above 69". It went red on 2026-08-23
   for a PR whose author had added ONE undated constant, because two OTHER
   sessions had merged two more hours earlier. The count was true and the blame
   was wrong, and the message made it worse by saying "yours is almost certainly
   in a file you just edited". It sent the author to date two constants that were
   neither new nor theirs.
   A global count fires on whoever runs next rather than on whoever caused it. So
   this ratchets the SET: every undated constant that exists today is listed
   below, and the row fails only on one that is NOT. New offenders are named
   exactly, and nobody inherits another session's debt.
   Two directions, because a list like this rots otherwise:
     NEW    an undated constant not in the inventory -> red, named
     STALE  an inventory entry that is now dated or gone -> red, delete the line
   Fix one, delete its line. The inventory only shrinks. */
const KNOWN_UNDATED = [
  'backup-roundtrip-audit.mjs:NAMES',
  'backup-roundtrip-audit.mjs:NAMES',
  'backup-roundtrip-audit.mjs:NAMES',
  'backup-roundtrip-audit.mjs:STORES',
  'balance-audit.js:FOES',
  'balance-audit.js:WEAPONIZED',
  'batch-audit.mjs:KIT_CASTS',
  'crash-guard-audit.mjs:SHAPES',
  'crate-palette-audit.mjs:CRATES',
  'crate-reveal-audit.mjs:KINDS',
  'crew-fan-audit.mjs:FRIENDS',
  'den-ceiling-audit.mjs:WEEKS',
  'ember-cohesion-audit.mjs:CLASSES',
  'facegate-audit.mjs:HELD_SLOTS',
  'fight-exit-audit.mjs:MAP_ROWS',
  'fight-exit-audit.mjs:NO_MAP_ROWS',
  'fight-layout-audit.mjs:SLACK_SIZES',
  'fight-tray-audit.mjs:KNOWN',
  'figure-audit.mjs:SITES',
  'flaky-network-audit.mjs:DEADLINE_FILES',
  'flaky-network-audit.mjs:FRIENDS',
  'flaky-network-audit.mjs:LOCAL_ONLY',
  'fx-audit.js:MOVES',
  'gate-audit.mjs:OK_HELPERS',
  'grid-min-width-audit.mjs:ROUTES',
  'handover-audit.mjs:SWAPS',
  'hollow-backdrop-audit.mjs:BANDS',
  'hollow-beds-audit.mjs:BEDS',
  'hollow-beds-audit.mjs:CHIPS',
  'hollow-beds-audit.mjs:SIGNS',
  'idle-perf-audit.mjs:SURFACES',
  'input-validation-audit.mjs:MALFORMED',
  'motion-truth-audit.mjs:REGISTER',
  'nav-perf-audit.mjs:LAP',
  'notif-tier-audit.mjs:PROBED',
  'pet-pool-audit.mjs:RARITY_ORDER',
  'pixel-art-swap-audit.mjs:SCREENS',
  'placeholder-audit.mjs:SCREENS',
  'precache-assets-audit.mjs:CANDIDATES',
  'quest-daymore-audit.mjs:IMPOSSIBLE_ON_DAY_ONE',
  'quest-pick-audit.mjs:PERIODS',
  'race-results-audit.mjs:LIVE_BOARD_TODAY',
  'race-results-audit.mjs:PAID',
  'rebuild-lossless-audit.mjs:RANK',
  'reward-sop-audit.mjs:ACTIONS',
  'reward-sop-audit.mjs:PAY',
  'scout-audit.mjs:MAP_ROWS',
  'selector-audit.mjs:QUERY_RE',
  'sheet-action-reachable-audit.mjs:SHEETS',
  'spawn-quiet-audit.mjs:QUIET',
  'spawn-quiet-audit.mjs:TYPES',
  'speech-audit.mjs:CASES',
  'suite-rot-audit.mjs:EMIT_RE',
  'suite-rot-audit.mjs:QUERY_RE',
  't1-audit.mjs:MAP_ROWS',
  'tab-chip-audit.mjs:TABS',
  'tab-chip-audit.mjs:VIEWPORTS',
  'tabbar-contrast-audit.mjs:TABS',
  'tray-destination-audit.mjs:STATES',
  'tray-destination-audit.mjs:TABS',
  'ui-audit.js:CONTROL_EXPECTATIONS',
  'unit.test.js:CONTROLS',
  'unit.test.js:PDK_ROSTER',
  'unit.test.js:PROVEN_BY_PIXELS',
  'unit.test.js:ROOTS',
  'unit.test.js:TARGETS',
  'v279-audit.mjs:SWEEP',
  'wanderer-patrol-live-audit.mjs:ROWS',
  'xp-cap-audit.mjs:SOURCES'
];

/* COUNTS, NOT MEMBERSHIP. `file:NAME` is NOT unique: backup-roundtrip-audit.mjs
   has THREE constants called NAMES. A Set collapsed them to one key, so dating
   one of the three left the key live and the STALE row never fired, and a
   genuinely new constant sharing a name would have been waved through as known.
   Found by prove-red on this very change. Comparing counts per key handles
   duplicates without pinning line numbers, which would rot on every edit. */
const key = c => `${c.file}:${c.name}`;
const tally = xs => xs.reduce((m, k) => m.set(k, (m.get(k) || 0) + 1), new Map());

const undated = found.filter(c => !c.date);
const liveCount = tally(undated.map(key));
const knownCount = tally(KNOWN_UNDATED);
const allKeys = new Set([...liveCount.keys(), ...knownCount.keys()]);

const novel = [], stale = [];
for (const k of allKeys) {
  const live = liveCount.get(k) || 0, known = knownCount.get(k) || 0;
  if (live > known) novel.push(`${k}${live - known > 1 ? ` x${live - known}` : ''}`);
  if (live < known) stale.push(`${k}${known - live > 1 ? ` x${known - live}` : ''}`);
}

ok('RATCHET no NEW pinned expectation lacks dated provenance',
  novel.length === 0,
  novel.length
    ? `${novel.length} new: ${novel.join(', ')}. Cite the source instruction and date within 7 lines above.`
    : `${undated.length} known, 0 new`);

ok('RATCHET the inventory has no stale entries (fixed one? delete its line)',
  stale.length === 0,
  stale.length ? `${stale.length} now dated or gone: ${stale.join(', ')}` : 'inventory matches');

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
