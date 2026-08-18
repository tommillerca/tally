/* tests/version-stamp-audit.mjs — THE THREE VERSION STAMPS MUST AGREE.
 *
 * WHY THIS EXISTS. v391 merged with v390 stamped on it. The commit was titled
 * v391, the tree said sw.js tally-v390, APP_BUILD v390, changelog n: 390, and
 * the live site served v390 for hours while the release that fixed the update
 * path sat on main unreachable. I blamed a stuck Pages deploy and the GitHub
 * outage, twice, before gwart pointed at the tree.
 *
 * It is not a one-off. Auditing the last ten releases found a second: aa4359b,
 * titled v386, shipping sw.js and APP_BUILD at 385 with the changelog at 386.
 * Both are the same shape, a renumber that ran for some files and not others.
 *
 * NO OTHER TEST CAN CATCH THIS. Every suite passes on a correctly built tree
 * with the wrong number stamped on it, which is exactly what a half-done
 * renumber produces. The stamps have to be read out of the files and compared
 * to each other; there is nothing behavioural to observe.
 *
 * WHAT IT ASSERTS
 *   FOUND    all three stamps were located, so a rename cannot make this pass
 *            by finding nothing to compare
 *   AGREE    sw.js VERSION, APP_BUILD and the newest changelog entry are the
 *            same number
 *
 * WHAT IT DOES NOT CATCH, AND THIS MATTERS. It cannot see the v391 case that
 * prompted it. On that commit all three stamps agreed with each other at 390
 * and were uniformly wrong against a release titled v391. Proven both ways
 * rather than assumed: run against aa4359b it exits 1 on 385/385/386, and run
 * against ddbb079 it exits 0 on 390/390/390.
 *
 * So this is half a guard. It closes the half-renumber, where some files moved
 * and others did not, which has happened twice. The other half, a renumber that
 * never ran at all, has no in-tree signal: the tree is internally consistent
 * and only the commit title disagrees, and a test on a checkout cannot see a
 * commit title. That half stays procedural: read the three stamps OUT of the
 * tree at release time and print them, rather than asserting them in a commit
 * message, which is exactly the mistake that shipped v391 as v390.
 *
 * Node-only, no browser, runs in milliseconds.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = []; let fails = 0;
const ok = (m, cond, detail = '') => {
  if (cond) out.push(`ok   ${m}${detail ? '  ' + detail : ''}`);
  else { fails++; out.push(`FAIL ${m}${detail ? '  ' + detail : ''}`); }
};
const read = f => readFileSync(path.join(ROOT, f), 'utf8');

const sw  = read('sw.js').match(/const VERSION = 'tally-v(\d+)'/);
const app = read('js/app.js').match(/const APP_BUILD = 'v(\d+)'/);
const log = read('js/changelog.js').match(/\{\s*n:\s*(\d+)/);

/* FOUND first. If a rename or a refactor moves one of these, the comparison
   below would be comparing undefined to undefined and passing on nothing. */
ok('FOUND all three version stamps are where this test looks for them',
  !!sw && !!app && !!log,
  `sw.js ${sw ? 'yes' : 'NO'}, APP_BUILD ${app ? 'yes' : 'NO'}, changelog ${log ? 'yes' : 'NO'}`);

if (sw && app && log) {
  const [a, b, c] = [sw[1], app[1], log[1]];
  ok('AGREE sw.js VERSION, APP_BUILD and the newest changelog entry are the same build',
    a === b && b === c,
    `sw.js tally-v${a}, APP_BUILD v${b}, changelog n: ${c}`);
}

console.log(out.join('\n'));
console.log(fails ? `\nFAIL (${fails})` : `\nall green, ${out.length} checks`);
process.exit(fails ? 1 : 0);
