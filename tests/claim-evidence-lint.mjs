/* EVERY PATCH NOTE NAMES WHAT PROVES IT, OR THE GATE GOES RED. 2026-08-24.
 *
 * Tom: "There has been an unacceptable amount of missed work, false claims and bad
 * work in the last few days. You need to create a system to hold yourself
 * accountable."
 *
 * Four patch notes in 24 hours told players things that were not true for them:
 *
 *   v429  "Changing how gear looks got a clearer screen"   behind ?mogv2. No
 *         player has the flag, so the screen they open is the old one.
 *   v429  "Test accounts no longer clutter the leaderboard" the filtering is
 *         server-side and the Worker was never redeployed. `is_test` does not
 *         exist as a column in production.
 *   v427  "Tap a friend and see their paddock"             true of the code and
 *         empty in practice: it rides the FRIEND's upload.
 *   v427  the same line again, after the first fix          it named the
 *         destination and not the route, and the deck is a carousel, so one tap
 *         looks like nothing happened.
 *
 * ONE ROOT CAUSE, and it is not carelessness about any single line: the notes were
 * written from what had MERGED rather than from what a player could reach. A
 * passing audit and a green merge say the code is on main. They say nothing about
 * a feature behind a query flag, one waiting on a migration, or one that needs the
 * other person to update first.
 *
 * SO THE FIX IS FRICTION IN THE RIGHT PLACE, not a promise to be more careful.
 * Every item in the newest changelog entry has to be answered in docs/CLAIMS.md
 * with two things:
 *   PROOF    the audit that grades it, which must exist and be gate-registered.
 *   REACH    how a player gets to it, in their words, or one of the honest
 *            not-yet states: GATED, PENDING-DEPLOY, NEEDS-PEER.
 *
 * Writing "GATED ?mogv2" next to a line is the moment the author notices they are
 * about to tell players about something switched off. That is the whole design:
 * the lint cannot know whether a sentence is true, so it forces the author to
 * write down the thing that makes it obvious.
 *
 * DELIBERATELY NOT ENFORCED: whether the claim is true. A lint that guessed would
 * train people to write whatever silences it. It enforces only that somebody said
 * what proves it and how a player gets there.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fails = [];
const ok = (n, pass, d = '') => { console.log(`${pass ? 'ok  ' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!pass) fails.push(n); };

/* SETUP first: a scan that finds no changelog passes every row below for free,
   which is the exact shape of failure this file is about. */
const src = readFileSync(join(root, 'js/changelog.js'), 'utf8');
const entries = [...src.matchAll(/\{\s*n:\s*(\d+),[\s\S]*?items:\s*\[([\s\S]*?)\]\s*\}/g)]
  .map(m => ({ n: +m[1], body: m[2] }));
ok('SETUP the changelog was parsed and has entries to grade', entries.length > 0, `${entries.length} entries`);
if (!entries.length) { console.log('\nclaim-evidence: 1 FAILED'); process.exit(1); }

const newest = entries.reduce((a, b) => (b.n > a.n ? b : a));
const items = [...newest.body.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(m => m[1]);
ok(`SETUP the newest entry (v${newest.n}) has items to grade`, items.length > 0, `${items.length} items`);

const claimsPath = join(root, 'docs/CLAIMS.md');
ok('SETUP docs/CLAIMS.md exists', existsSync(claimsPath),
  existsSync(claimsPath) ? 'found' : 'every shipped claim needs an answer in it');
if (!existsSync(claimsPath)) { console.log('\nclaim-evidence: FAILED'); process.exit(1); }

const claims = readFileSync(claimsPath, 'utf8');
const block = claims.split(/^##\s+/m).find(b => b.startsWith(`v${newest.n}`));
ok(`CLAIMS docs/CLAIMS.md has a section for v${newest.n}`, !!block,
  block ? 'found' : `add "## v${newest.n}" with one line per item`);

if (block) {
  const rows = [...block.matchAll(/^\s*(\d+)\.\s+PROOF:\s*([^|]+)\|\s*REACH:\s*(.+)$/gm)]
    .map(m => ({ i: +m[1], proof: m[2].trim(), reach: m[3].trim() }));

  ok('CLAIMS every item in the newest entry is answered',
    rows.length === items.length,
    `${rows.length} answered of ${items.length} claims`);

  /* PROOF must name a real, registered audit. An audit nothing declares does not
     run in the gate, so citing it would be citing a check nobody performs. */
  const gate = readFileSync(join(root, 'tests/release-gate.mjs'), 'utf8');
  const bad = [];
  for (const r of rows) {
    for (const f of r.proof.split(/[,\s]+/).filter(x => /\.(mjs|js)$/.test(x))) {
      if (!existsSync(join(here, f))) bad.push(`#${r.i} names ${f}, which is not on disk`);
      else if (!gate.includes(`'${f}'`)) bad.push(`#${r.i} names ${f}, which the gate does not run`);
    }
    if (!/\.(mjs|js)/.test(r.proof) && !/^(NONE|MANUAL)\b/.test(r.proof))
      bad.push(`#${r.i} PROOF names no audit (say NONE and why, if there is none)`);
  }
  ok('PROOF every claim names an audit that exists and the gate actually runs',
    bad.length === 0, bad.length ? `${bad.length}: ${bad.slice(0, 3).join('; ')}` : `${rows.length} claims backed`);

  /* REACH is the row that would have caught all four. */
  const STATES = /^(GATED|PENDING-DEPLOY|NEEDS-PEER)\b/;
  const unreachable = rows.filter(r => STATES.test(r.reach));
  ok('REACH no claim in a shipped entry is GATED, PENDING-DEPLOY or NEEDS-PEER',
    unreachable.length === 0,
    unreachable.length
      ? `${unreachable.length} cannot be reached by a player: ` +
        unreachable.map(r => `#${r.i} ${r.reach.split(/\s+/)[0]}`).join(', ') +
        '. Take the line out until it is true for them.'
      : `all ${rows.length} reachable`);

  const vague = rows.filter(r => !STATES.test(r.reach) && r.reach.length < 12);
  ok('REACH the route is written out, not left as a word',
    vague.length === 0,
    vague.length ? `${vague.length} too thin: ${vague.map(r => '#' + r.i).join(', ')}` : 'every route spelled out');

  console.log(`\n    WHAT v${newest.n} CLAIMS, AND WHAT BACKS IT:`);
  for (const r of rows) console.log(`      ${r.i}. ${r.reach.slice(0, 68)}  <- ${r.proof.slice(0, 44)}`);
}

console.log(`\nclaim-evidence: ${fails.length ? fails.length + ' FAILED' : 'clean'}`);
process.exit(fails.length ? 1 : 0);
