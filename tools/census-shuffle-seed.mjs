#!/usr/bin/env node
/* Deterministic-per-commit shuffle for the audit list, proposed as a
 * MITIGATION for the fixed-order adjacency in the current release-gate.
 *
 * WHAT this fixes and what it does NOT.
 *
 * The 2026-08-14 diagnostic (see gwart/SHUFFLE-CENSUS-RESULT.md) showed:
 * running the census's audit list in alphabetical order produces 36
 * STARTUP_CRASH at a flat 30.6s. Shuffling with any of three tested random
 * seeds produced 0 STARTUP_CRASH and the same 7 real FAILs, deterministically.
 * The pathological adjacency lives in the sorted order specifically.
 *
 * This mitigation avoids that adjacency by shuffling the list, but keeps
 * the ordering REPRODUCIBLE PER COMMIT so any failure is exactly repeatable.
 * The seed is the git HEAD hash of the tree the census is run against.
 *
 * A random-per-run shuffle would convert the deterministic failure into an
 * intermittent one, which is worse — a flaky gate stops being trusted.
 * A commit-stable shuffle preserves reproducibility.
 *
 * This is NOT a root-cause fix. The specific adjacency in the sorted order
 * that triggers the crash is undiagnosed. A bisection over orderings is
 * bounded (~7 runs) with the known-bad (alphabetical) and known-good
 * (seed=1 shuffle) endpoints and worth doing when there is time.
 *
 * Usage:
 *   node tools/census-shuffle-seed.mjs <repo-worktree>
 *     prints the shuffled audit order for HEAD, one per line
 *   node tools/census-shuffle-seed.mjs <repo-worktree> --list
 *     prints just the ordered list
 *   node tools/census-shuffle-seed.mjs <repo-worktree> --sorted
 *     prints the alphabetical (pathological) order for comparison
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO = path.resolve(process.argv[2] || '.');
const MODE = process.argv[3] || '';

/* Read the same audit list the census reads: PURE + BROWSER + FULL blocks
 * of release-gate.mjs. Kept in-sync with scratchpad/flake-census-v2.mjs's
 * enumeration so this ordering matches what a census would use. */
function readAudits(repo) {
  const gate = readFileSync(path.join(repo, 'tests/release-gate.mjs'), 'utf8');
  const strings = (block, tier) => {
    const out = [];
    const re = tier
      ? new RegExp(`'([^']+\\.(?:mjs|js))'\\s*:\\s*\\['${tier}'`, 'g')
      : /'([^']+\.(?:mjs|js))'/g;
    let m; while ((m = re.exec(block))) out.push(m[1]);
    return out;
  };
  const pure = gate.match(/const PURE = \[([^\]]*)\]/);
  const browser = gate.match(/const BROWSER = \[([^\]]*)\]/s);
  const declared = gate.match(/const DECLARED = \{([\s\S]*?)\n\};/);
  return [...strings(pure[1]), ...strings(browser[1]), ...strings(declared[1], 'full')];
}

/* git HEAD short hash of the given worktree. Deterministic per commit;
 * changes iff a new commit is made. Not the tree hash, so an uncommitted
 * change does not shift the seed — the SEED is a property of what got
 * committed, so `git diff` still reads the same audit results between
 * two dirty runs at the same HEAD. */
function headHash(repo) {
  const out = spawnSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  if (out.status !== 0) throw new Error(`git rev-parse HEAD failed in ${repo}: ${out.stderr}`);
  return out.stdout.trim();
}

/* Turn a 40-char hex SHA into a 32-bit unsigned int for the PRNG. FNV-1a
 * over the bytes; picked for readability, not for cryptographic properties. */
function seedFromHash(hex) {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < hex.length; i++) {
    h ^= hex.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* mulberry32: same PRNG the diagnostic runner used, so seed=N here gives
 * the same order as seed=N in scratchpad/flake-census-shuffle.mjs. */
function rng(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* Fisher-Yates. */
function shuffle(arr, seed) {
  const r = rng(seed);
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const AUDITS = readAudits(REPO);

if (MODE === '--sorted') {
  /* Baseline: the alphabetical order that produces the pathological
     adjacency. Print for comparison / bisection endpoints. */
  for (const a of AUDITS) console.log(a);
  process.exit(0);
}

const hash = headHash(REPO);
const seed = seedFromHash(hash);
const ordered = shuffle(AUDITS, seed);

if (MODE === '--list') {
  for (const a of ordered) console.log(a);
} else {
  console.log(`# repo:  ${REPO}`);
  console.log(`# HEAD:  ${hash}`);
  console.log(`# seed:  ${seed} (fnv1a of HEAD)`);
  console.log(`# count: ${ordered.length}`);
  console.log(`# NOTE:  MITIGATION for known pathological adjacency in alphabetical order.`);
  console.log(`# NOTE:  See gwart/SHUFFLE-CENSUS-RESULT.md for the diagnostic and cautions.`);
  console.log(`# NOTE:  Same HEAD -> same order. Different HEAD -> different order.`);
  console.log(`#`);
  for (const a of ordered) console.log(a);
}
