/* EVERY BALANCE WRITE MOVES ITS REVISION IN THE SAME TRANSACTION. 2026-09-06.
 *
 * Codex's audit of v485: `coinsAdd` bumped 'coinsRev' but `spendCoins` did not,
 * buyRackItem's claimAndPay debited 'coins' alone, collectSpawn credited 'coins'
 * alone, and Bone Dust had no revision at all. js/db.js importAll ranks a merge
 * by that revision, so every one of those sites let a same-revision blob taken
 * BEFORE the change win on "higher balance": a silent refund of the purchase
 * with the item kept (tests/coins-merge-tie-audit.mjs COIN-DEBIT, DUST-DEBIT,
 * DUST-EARN, RACK-COIN, RACK-DUST, SPAWN are the measured rows).
 *
 * The fix routes every helper through kvBumpRevisioned and puts a revision fn
 * beside every balance fn in a claim's pay map. This lint is what stops the
 * NEXT site from forgetting, because the merge audit can only grade the sites
 * somebody remembered to drive. Static, grep-based, over js/*.js:
 *
 *   RAW    no kvSet / kvUpdate / kvBump / db.put of a literal 'coins' or
 *          'bonedust' row anywhere. kvGet is a read and is the only allowed verb.
 *   MAP    every pay-map entry whose key is `coins` or `bonedust` and whose value
 *          is a FUNCTION (an inline arrow, or an identifier bound to one in the
 *          same file) has `coinsRev` / `dustRev` in the SAME object literal, which
 *          is what claimAndPay commits as one transaction. A data object with a
 *          `coins:` number (a quest row, a fight config) is not a write and is
 *          not graded.
 *   ASSIGN the `pay.kv.coins = fn` form (js/hunt.js) has `pay.kv.coinsRev =`
 *          within six lines. Coarse on purpose; both sites today are adjacent.
 *   PRIM   coinsAdd, boneDustAdd and spendBalance each call kvBumpRevisioned, so
 *          a variable-keyed kvUpdate inside them (the one shape RAW cannot see)
 *          cannot come back.
 *   SAMPLE the scan found at least the sites it was written against. An empty
 *          scan is a failure, not a pass.
 *
 * PROVE-RED, run 2026-09-07 on a throwaway worktree. First on origin/main
 * bce3a937 (v493) with this file copied in, which is the shipped state:
 *   FAIL  RAW  no raw kvSet/kvUpdate/kvBump/db.put of a literal 'coins' or 'bonedust' row  js/app.js:25822 kvSet('coins'; js/loot.js:910 kvBump('coins'; js/loot.js:1013 kvBump('bonedust'
 *   FAIL  MAP  every coins/bonedust pay-map fn has its revision fn in the same object literal  js/loot.js:586 `bonedust` without `dustRev`; js/loot.js:586 `coins` without `coinsRev`; js/quests.js:558 `bonedust` without `dustRev`
 *   FAIL  ASSIGN  every `.kv.coins =` / `.kv.bonedust =` has its revision assigned within 6 lines  js/hunt.js:222
 *   FAIL  PRIM  coinsAdd, boneDustAdd and spendBalance route through kvBumpRevisioned  coinsAdd, boneDustAdd, spendBalance
 * Then one mutation at a time on the fixed tree (2b2d5061), so each check is
 * shown to catch its own site alone:
 *   delete `dustRev:` from js/quests.js claimQuest's pay map ->
 *     FAIL  MAP  every coins/bonedust pay-map fn has its revision fn in the same object literal  js/quests.js:559 `bonedust` without `dustRev`
 *   swap js/loot.js coinsAdd back to `kvBump('coins', n)` ->
 *     FAIL  RAW  no raw kvSet/kvUpdate/kvBump/db.put of a literal 'coins' or 'bonedust' row  js/loot.js:915 kvBump('coins'
 *     FAIL  PRIM  coinsAdd, boneDustAdd and spendBalance route through kvBumpRevisioned  coinsAdd
 *   delete js/hunt.js's `pay.kv.coinsRev =` line ->
 *     FAIL  ASSIGN  every `.kv.coins =` / `.kv.bonedust =` has its revision assigned within 6 lines  js/hunt.js:223
 *
 * Usage: node tests/currency-revision-lint.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fails = [];
const ok = (n, pass, d = '') => { console.log(`${pass ? 'ok  ' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!pass) fails.push(n); };

const REV = { coins: 'coinsRev', bonedust: 'dustRev' };

/* comments blanked, newlines kept, so line numbers stay honest (same idiom as
   tests/claimed-row-audit.mjs stripProse) */
const strip = src => src
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
const lineOf = (src, i) => src.slice(0, i).split('\n').length;

const files = readdirSync(join(root, 'js')).filter(f => f.endsWith('.js') && f !== 'changelog.js');
const code = new Map(files.map(f => [f, strip(readFileSync(join(root, 'js', f), 'utf8'))]));

/* ---- RAW ---- */
const raw = [];
for (const [f, src] of code) {
  for (const m of src.matchAll(/\b(?:kvSet|kvUpdate|kvBump)\(\s*['"](coins|bonedust)['"]/g)) raw.push(`js/${f}:${lineOf(src, m.index)} ${m[0]}`);
  for (const m of src.matchAll(/\{\s*k:\s*['"](coins|bonedust)['"]/g)) raw.push(`js/${f}:${lineOf(src, m.index)} ${m[0]}`);
}
ok("RAW  no raw kvSet/kvUpdate/kvBump/db.put of a literal 'coins' or 'bonedust' row", raw.length === 0, raw.join('; ') || 'reads only (kvGet)');

/* ---- MAP ---- */
/* the object literal enclosing position i: walk back to the unmatched `{` and
   forward to its `}`; balanced pairs in between (nested fns, other entries) are
   skipped */
function enclosing(src, i) {
  let depth = 0, start = -1;
  for (let j = i - 1; j >= 0; j--) {
    const c = src[j];
    if (c === '}') depth++;
    else if (c === '{') { if (depth === 0) { start = j; break; } depth--; }
  }
  if (start < 0) return null;
  depth = 0;
  for (let j = start; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  return null;
}
const mapBad = [];
let mapSites = 0;
for (const [f, src] of code) {
  const arrowConsts = new Set([...src.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)].map(m => m[1]));
  for (const m of src.matchAll(/(?<![\w$.])(coins|bonedust)\s*:\s*(?:(\(?[A-Za-z_$][\w$]*\)?)\s*=>|([A-Za-z_$][\w$]*)\s*[,}\n])/g)) {
    const isFn = !!m[2] || arrowConsts.has(m[3]);
    if (!isFn) continue;
    mapSites++;
    const obj = enclosing(src, m.index);
    const revKey = REV[m[1]];
    if (!obj || !new RegExp(`(?<![\\w$.])${revKey}\\s*:`).test(obj)) mapBad.push(`js/${f}:${lineOf(src, m.index)} \`${m[1]}\` without \`${revKey}\``);
  }
}
ok('MAP  every coins/bonedust pay-map fn has its revision fn in the same object literal', mapBad.length === 0, mapBad.join('; ') || `${mapSites} pay-map entries`);

/* ---- ASSIGN ---- */
const asgBad = [];
let asgSites = 0;
for (const [f, src] of code) {
  const lines = src.split('\n');
  lines.forEach((ln, i) => {
    const m = ln.match(/\.kv\.(coins|bonedust)\s*=[^=]/);
    if (!m) return;
    asgSites++;
    const win = lines.slice(Math.max(0, i - 6), i + 7).join('\n');
    if (!new RegExp(`\\.kv\\.${REV[m[1]]}\\s*=[^=]`).test(win)) asgBad.push(`js/${f}:${i + 1}`);
  });
}
ok('ASSIGN  every `.kv.coins =` / `.kv.bonedust =` has its revision assigned within 6 lines', asgBad.length === 0, asgBad.join('; ') || `${asgSites} assignments`);

/* ---- PRIM ---- */
const loot = code.get('loot.js');
const body = name => {
  const i = loot.search(new RegExp(`(?:export )?async function ${name}\\(`));
  return i < 0 ? '' : loot.slice(i, loot.indexOf('\n}', i) + 2).split('\n').slice(0, 12).join('\n');
};
const primBad = ['coinsAdd', 'boneDustAdd', 'spendBalance'].filter(n => !/kvBumpRevisioned\(/.test(body(n)));
ok('PRIM  coinsAdd, boneDustAdd and spendBalance route through kvBumpRevisioned', primBad.length === 0, primBad.join(', ') || 'all three');

/* ---- SAMPLE ---- */
/* pinned 2026-09-06 against this tree: quests.js (coins, bonedust), social.js
   (coins), loot.js buyRackItem (coins, bonedust) are pay-map entries; hunt.js
   collectSpawn is the one assignment */
ok('SAMPLE  the scan saw the sites it was written against (an empty scan is a failure)', mapSites >= 5 && asgSites >= 1, `${mapSites} pay-map entries, ${asgSites} assignments`);

console.log(`\ncurrency-revision: ${fails.length ? fails.length + ' FAILED' : 'clean'}`);
process.exit(fails.length ? 1 : 0);
