/* tests/claimed-row-audit.mjs — THE SIBLINGS OF AN ATOMIC CLAIM. 2026-09-02.
 *
 * WHY THIS EXISTS, AND WHY reward-sop-audit COULD NEVER HAVE CAUGHT IT.
 *
 * This project spent days making PAYING actions atomic: read the authority and
 * write the receipt inside ONE transaction, so a double tap or a second tab
 * cannot collect twice. Those fixes are real and each one is proven. But the
 * sweep was aimed at PAYOUTS, and reward-sop-audit enumerates payouts by
 * construction: its scanner looks for award / coinsAdd / grantGear and friends.
 * A function that hands nothing over is invisible to it.
 *
 * The trouble is that a claim is only as good as the OTHER writers of its row.
 * `spendPitFight` takes a charge inside one kvUpdate. `refreshPitEnergy` read
 * the same record, awaited two things, and wrote the WHOLE record back
 * including freeUsed. It pays nobody. It is a render. And it handed the charge
 * straight back. Measured 2026-09-02 on origin/main 620e852e against a real
 * IndexedDB: twelve of twelve renders overlapping a spend left freeUsed at 0
 * after a fight was granted, and three fights ran off zero charges against
 * FREE_FIGHTS 3. Twelve sites across seven kv rows had the same shape.
 *
 * This is the same lesson as the round-9 ceiling fix. reward-sop-audit's CEILING
 * rows had to be added because every other row raced the SAME key against
 * itself, which the per-item claim protects by construction, so a ceiling shared
 * by several DISTINCT keys was never once tested. Here the second writer is not
 * even a second CALLER, it is a different function entirely, and no amount of
 * calling the claim twice can see it.
 *
 * WHAT IT ASSERTS
 *   COVERAGE  DERIVED FROM THE SOURCE. Any kv row that some function claims
 *             through kvUpdate / kvBump is a CLAIMED ROW. Every plain kvSet of
 *             a claimed row anywhere in js/ must appear in ACCEPTED below with
 *             a reason, or this fails. A new read-modify-write on a claimed row
 *             therefore has to be argued for in writing, which is the half that
 *             makes the class stay fixed rather than being swept once.
 *   STALE     an ACCEPTED entry whose site no longer exists also fails, so the
 *             list cannot rot into a set of excuses nobody maintains.
 *   PIT       the measured defect, driven: a render overlapping a spend, twelve
 *             times, against a real IndexedDB.
 *   GARDEN    the same shape one row over: a plant overlapping a harvest must
 *             not put the harvested crop back in its bed.
 *   CONTROL   the scanner found rows and sites (an empty sample is a failure),
 *             and both live probes are shown reading the OTHER value on the
 *             same code in the same session, so a sampler pinned at the right
 *             answer cannot pass.
 *
 * WHAT IT DELIBERATELY DOES NOT DO, said plainly rather than oversold.
 *   - It grades rows that SOMEBODY claims. A row with two sloppy writers and no
 *     atomic claim at all (kv 'potions', kv 'foodbuffs') is out of scope: there
 *     is no claim there to undo, so there is nothing this file can compare
 *     against, and widening it to "every kvSet in the tree" would be a lint that
 *     cries wolf. Those are lost-update candidates on their own merits and want
 *     their own decision, not a row here.
 *   - It cannot tell a SAFE whole-row write from a dangerous one. That is what
 *     ACCEPTED is for, and the reasons in it are claims by their authors.
 *   - It does not re-check that paying actions are atomic. reward-sop-audit owns
 *     that and this complements it rather than duplicating it.
 *
 * PROVE-RED, CONFIRMED 2026-09-02 on a `cp -R` throwaway copy of this tree with
 * only this file added, see the block at the foot.
 *
 * Usage: node tests/claimed-row-audit.mjs            (serves this tree)
 *        node tests/claimed-row-audit.mjs <base-url>
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

/* ===========================================================================
 * ACCEPTED: a plain kvSet of a claimed row that is NOT a read-modify-write
 * race. Each entry names the site and says why the whole-row write is safe.
 * Reviewed 2026-09-02 with the sibling-writer sweep; every other site in the
 * tree was converted to kvUpdate rather than listed here.
 * ======================================================================== */
const ACCEPTED = [
  { site: 'js/loot.js:rack', row: "'rack'",
    why: "the NEW-WEEK rebuild, not a read-modify-write. It runs only when no record for this week exists, and the record it writes is derived entirely from (week, salt 0), so two callers racing it write byte-identical records. Nothing can have claimed a row that did not exist yet: rerollRack refuses on `cur.week !== st.week`. The migration branch above it DOES carry state forward and is a kvUpdate for that reason." },
  { site: 'js/loot.js:stripAll', row: "'transmog'",
    why: "Take it all off clears the map OUTRIGHT rather than editing it, so there is no read whose result could go stale. The comment above the line is explicit that a leftover entry on an emptied slot is the bug being closed, so preserving a concurrent write here would be wrong, not right." },
  { site: 'js/app.js:seedDemo', row: "'settings'",
    why: "the demo seeder, which replaces the whole profile on a virgin tally-demo database before any surface is reachable. It is not editing a player's settings and there is nothing live to race." },
  { site: 'js/app.js:seedDemo', row: "'coins'",
    why: "the same seeder, setting a starting balance rather than changing one. 'coins' counts as claimed because kvBump is how every real balance change moves it; this line runs once on a virgin demo database with no wallet to overdraw." },
];

/* ===========================================================================
 * COVERAGE: derive the claimed rows, and their plain writers, from the source.
 * ======================================================================== */

/* Strip COMMENTS, keeping every newline so line numbers stay honest. This is
   reward-sop-audit's stripProse with its third replace deliberately left off:
   that one blanks the INSIDE of every string literal, which is right when you
   are hunting function NAMES and fatal here, because the thing being matched is
   the kv row name and it only ever appears as a string literal. Written down
   because the first cut of this file copied all three and every row collapsed
   onto `kvSet('          '`, reporting 8 claimed rows and 120 unlisted writers
   that were really one row seen through a blanked quote. */
function stripProse(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length));
}

/* The first argument to a kv call, as written: a quoted literal or a bare
   identifier. Anything else (a template, an expression) is not something this
   scan can reason about and is skipped rather than guessed at. */
const ARG = String.raw`\s*(['"][^'"]+['"]|[A-Za-z_$][\w$]*)`;
const CLAIM_RE = new RegExp(String.raw`(?:^|[^\w.])kv(?:Update|Bump)\(${ARG}`);
const SET_RE = new RegExp(String.raw`(?:^|[^\w.])kvSet\(${ARG}`);

const files = readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js') && n !== 'changelog.js');
const code = new Map(files.map(f => [f, stripProse(readFileSync(path.join(ROOT, 'js', f), 'utf8')).split('\n')]));

/* A row named by a STRING LITERAL is the same row in every module, so those are
   collected globally: a kvSet('garden') in one file races a kvUpdate('garden')
   in another. A row named by an IDENTIFIER (spires' `KV`, loot's `key`) is a
   local binding and only means anything inside its own file. */
const claimedGlobal = new Set();
const claimedLocal = new Map(files.map(f => [f, new Set()]));
for (const [f, lines] of code) {
  for (const ln of lines) {
    const m = ln.match(CLAIM_RE);
    if (!m) continue;
    if (/^['"]/.test(m[1])) claimedGlobal.add(m[1].slice(1, -1));
    else claimedLocal.get(f).add(m[1]);
  }
}

const owners = lines => {
  const found = [];
  lines.forEach((ln, i) => {
    const m = ln.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/)
      || ln.match(/^(?:export\s+)?(?:const|let)\s+(\w+)\s*=/);
    if (m) found.push([i, m[1]]);
  });
  return i => {
    let name = '(top level)';
    for (const [ln, n] of found) { if (ln <= i) name = n; else break; }
    return name;
  };
};

const writers = [];   // { site, row, line }
for (const [f, lines] of code) {
  if (f === 'db.js') continue;   // the primitive's own definition is not a call site
  const ownerAt = owners(lines);
  lines.forEach((ln, i) => {
    const m = ln.match(SET_RE);
    if (!m) return;
    const literal = /^['"]/.test(m[1]);
    const row = literal ? m[1].slice(1, -1) : m[1];
    if (!(literal ? claimedGlobal.has(row) : claimedLocal.get(f).has(row))) return;
    writers.push({ site: `js/${f}:${ownerAt(i)}`, row: literal ? `'${row}'` : row, line: i + 1 });
  });
}

ok('CONTROL the scanner found claimed rows and plain writers to grade (an empty sample is a failure)',
  claimedGlobal.size >= 10 && writers.length >= 1,
  `${claimedGlobal.size} literal rows claimed through kvUpdate/kvBump across ${files.length} modules, ` +
  `${writers.length} plain kvSet writers of a claimed row`);

/* A NON-EMPTY SAMPLE OF THE WRONG THING READS EXACTLY LIKE A HEALTHY ONE, which
   is what the stripProse note above is about: the first cut reported 8 rows and
   120 findings and every one of them was a blanked quote. So name rows that are
   known to be claimed and require the scan to have seen them by name. Pinned
   2026-09-02 against this tree: 'coins' and 'bonedust' are claimed by kvBump
   (js/db.js is the primitive, every balance change routes through it),
   'pitEnergy' by spendPitFight, 'garden' by harvestPlot, 'cooking' by
   collectDish, 'spires' is NOT here because spires.js names it through a
   local const, which is the identifier half this scan keeps per-file. */
const KNOWN_CLAIMED = ['coins', 'bonedust', 'pitEnergy', 'garden', 'cooking', 'denloot'];
const missed = KNOWN_CLAIMED.filter(r => !claimedGlobal.has(r));
ok('CONTROL the scan reads real row names, not blanked quotes',
  missed.length === 0,
  missed.length ? `did not see ${missed.join(', ')} claimed anywhere` : KNOWN_CLAIMED.join(', '));

const accepted = new Map(ACCEPTED.map(a => [`${a.site} ${a.row}`, a]));
const unlisted = writers.filter(w => !accepted.has(`${w.site} ${w.row}`));
ok('COVERAGE every plain kvSet of a CLAIMED row is listed as safe, with a reason',
  unlisted.length === 0,
  unlisted.length
    ? `\n     ${unlisted.map(w => `${w.site}  writes ${w.row} whole at line ${w.line} — route it through kvUpdate the way its atomic sibling does, or add it to ACCEPTED saying why the whole-row write cannot lose a claim`).join('\n     ')}`
    : `${writers.length} writer${writers.length === 1 ? '' : 's'}, all listed`);

const stale = [...accepted.keys()].filter(k => !writers.some(w => `${w.site} ${w.row}` === k));
ok('STALE no ACCEPTED entry names a site that no longer writes that row',
  stale.length === 0,
  stale.length ? `${stale.join(', ')}  (delete the entry)` : `${accepted.size} entries, all live`);

for (const a of ACCEPTED) console.log(`     accepted  ${a.site} ${a.row}: ${a.why}`);

/* ===========================================================================
 * THE LIVE HALF. A static rule about a shape is not evidence of damage, and
 * the whole reason this file exists is that the damage was measurable.
 * ======================================================================== */
const { browser, page, errors } = await boot(process.argv[2] || process.env.URL || undefined,
  { headless: process.env.HEADLESS_MODE || 'shell' });

const pit = await page.evaluate(async () => {
  const energy = await import('/js/energy.js');
  const db = await import('/js/db.js');
  /* Same shape as godmode's localDay: page context cannot import it. */
  const today = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());
  const fresh = () => db.kvSet('pitEnergy', { date: today, freeUsed: 0, vigor: 0, fromSteps: 0, fromLog: 0 });
  const used = async () => ((await db.kvGet('pitEnergy', {})) || {}).freeUsed || 0;

  // the probe must be able to read ZERO, or the row below passes on nothing
  await fresh();
  await energy.refreshPitEnergy();
  const rendersOnly = await used();

  const overlapped = [];
  for (let i = 0; i < 12; i++) {
    await fresh();
    const [, spend] = await Promise.all([energy.refreshPitEnergy(), energy.spendPitFight()]);
    overlapped.push({ spent: !!spend.ok, used: await used() });
  }

  // the charges are still SPENDABLE: a fix that refused every spend would pass above
  await fresh();
  const three = await Promise.all([
    energy.refreshPitEnergy(), energy.spendPitFight(),
    energy.refreshPitEnergy(), energy.spendPitFight(),
    energy.refreshPitEnergy(), energy.spendPitFight(),
  ]);
  return {
    rendersOnly,
    granted: overlapped.filter(t => t.spent).length,
    handedBack: overlapped.filter(t => t.spent && t.used === 0).length,
    trials: overlapped.length,
    threeFights: three.filter(x => x && x.ok).length,
    threeUsed: await used(),
    freeMax: energy.FREE_FIGHTS,
  };
});

ok('CONTROL pit a render on its own leaves freeUsed at 0, so the probe can read the value the bug produces',
  pit.rendersOnly === 0, `freeUsed after a lone render: ${pit.rendersOnly}`);
ok('CONTROL pit every overlapped spend really was granted a fight, so the row below is not passing on a refused spend',
  pit.granted === pit.trials, `${pit.granted} of ${pit.trials} granted`);
ok('PIT a render overlapping a spend does not hand the charge back',
  pit.handedBack === 0,
  `${pit.handedBack} of ${pit.trials} fights left freeUsed at 0 after being granted`);
ok('PIT three spends each overlapped by a render cost exactly three charges',
  pit.threeFights === 3 && pit.threeUsed === 3,
  JSON.stringify({ fights: pit.threeFights, freeUsed: pit.threeUsed, freeMax: pit.freeMax }));

const garden = await page.evaluate(async () => {
  const g = await import('/js/garden.js');
  const db = await import('/js/db.js');
  const ING = 'marrow';
  const grown = now => ({ ing: ING, plantedAt: now - 1, readyAt: now - 1, watered: false });
  const seed = async (now) => db.kvSet('garden', {
    seeds: { [ING]: 5 }, plotsOwned: 3, plots: [grown(now), null, null], composts: { date: '', used: 0 },
  });
  const bed0 = async () => (((await db.kvGet('garden', {})) || {}).plots || [])[0];

  // CONTROL: an un-overlapped harvest really does empty the bed
  const now = Date.now();
  await seed(now);
  const solo = await g.harvestPlot(0, now);
  const soloBed = await bed0();

  /* The interleave: a plant into bed 1 while bed 0 is being harvested. ORDER
     MATTERS AND IS NOT COSMETIC. IndexedDB queues a readonly behind a readwrite
     on the same store, so calling the harvest first makes the plant read the
     ALREADY-harvested garden and nothing is ever lost: the first cut of this
     row was written that way and stayed green against a deliberately regressed
     plantSeed. The plant has to open its READ first, so that the harvest
     commits inside the window between that read and the plant's write, which is
     precisely the shape the whole file is about. */
  await seed(now);
  const [p, h] = await Promise.all([g.plantSeed(ING, 1, now), g.harvestPlot(0, now)]);
  const after = ((await db.kvGet('garden', {})) || {}).plots || [];
  return {
    soloOk: !!solo.ok, soloBedEmpty: !soloBed,
    harvested: !!h.ok, planted: !!p.ok,
    bed0Restored: !!after[0], bed1Planted: !!after[1],
  };
});

ok('CONTROL garden an un-overlapped harvest empties the bed, so the row below can tell full from empty',
  garden.soloOk && garden.soloBedEmpty, JSON.stringify(garden));
ok('CONTROL garden the overlapped harvest AND the overlapped plant both took their state',
  garden.harvested && garden.planted, JSON.stringify(garden));
ok('GARDEN a plant overlapping a harvest does not put the harvested crop back in its bed',
  garden.bed0Restored === false && garden.bed1Planted === true,
  JSON.stringify({ bed0HoldsACropAgain: garden.bed0Restored, bed1Planted: garden.bed1Planted }));

ok('CONTROL no page errors while the probes ran', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nall green');
process.exit(fails ? 1 : 0);

/* ===========================================================================
 * PROVE-RED. Every line below was CONFIRMED 2026-09-02 in a `cp -R` throwaway
 * copy of this tree (never a checkout of the working tree), by restoring the
 * origin/main 620e852e shape of one function and running this file there.
 *
 *  1. js/energy.js restored verbatim from origin/main 620e852e (refreshPitEnergy
 *     and addVigor both kvGet -> await -> kvSet of the whole record)
 *       3 FAILED. PIT red at 12 of 12 fights leaving freeUsed 0, the second PIT
 *       row red at { fights: 3, freeUsed: 0, freeMax: 3 } (three fights for
 *       nothing), and COVERAGE red naming js/energy.js. Both CONTROL pit rows
 *       GREEN there, a lone render reading 0 and all 12 spends granted, so the
 *       probe really was looking at the right number on the broken tree.
 *
 *  2. js/garden.js plantSeed back to read() -> mutate -> write(g)
 *       2 FAILED. GARDEN red at bed0HoldsACropAgain true, COVERAGE red naming
 *       js/garden.js:write. Both CONTROL garden rows green: the solo harvest
 *       emptied the bed and both overlapped calls reported ok, so the failure
 *       is the restore and not a refusal. Every PIT row green there, which is
 *       what makes this a second finding rather than the first one again.
 *
 *  3. js/loot.js:stripAll's kvSet swapped for an equivalent kvUpdate, so the
 *     ACCEPTED entry names a site that no longer exists
 *       STALE red, naming the entry, with COVERAGE still green. This is what
 *       stops the list becoming a place to park findings.
 *
 * AND THE ONE THAT MATTERED MOST, because it is the failure this project keeps
 * paying for: run 2 was GREEN on the GARDEN row the first time, on a tree that
 * was genuinely broken. The driver called harvestPlot before plantSeed, and
 * IndexedDB queues a readonly behind a readwrite on the same store, so the
 * plant simply read the already-harvested garden and there was nothing to lose.
 * A guard can be pointed at the right function, on the right row, with real
 * damage present, and still be looking at an instant where the bug cannot
 * exist. The fix is in the driver, not the assertion, and the comment beside
 * that Promise.all says so.
 *
 * WHAT NEEDS THE CONTROLS, and it is not decoration. A fix that made
 * spendPitFight refuse everything passes the PIT row trivially (nothing is
 * granted, so nothing can be handed back), which CONTROL pit granted catches at
 * 0 of 12. A probe that read freeUsed off a stale copy would report 1 forever
 * and pass on a broken tree, which CONTROL pit rendersOnly catches by requiring
 * the same probe to read 0 on a record nothing spent. A garden fix that refused
 * every plant passes GARDEN and is caught by CONTROL garden.
 * ======================================================================== */
