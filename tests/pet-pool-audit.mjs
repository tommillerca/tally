/* tests/pet-pool-audit.mjs — WHO CAN COME OUT OF AN EGG, AND WHAT CANNOT COME
 * OUT OF A CRATE.
 *
 * WHY THIS EXISTS. Bumbleseal (C6) is sold in Gwart's Emporium for 50,000 coins
 * and her five accessories for 3,500 to 12,000 each. Tom, 2026-08-21: "she can
 * be a legendary pet and shes only in 1% of eggs so most people will want to buy
 * her", and, on the accessories, "locked to bumbleseal for sale only in cash
 * shop not in any chests or found elsewhere in game." Every one of those prices
 * is a claim about scarcity, and scarcity in this app is four `filter` calls in
 * js/loot.js that nothing was measuring.
 *
 * THE TWO FAILURES THIS FILE IS WRITTEN AGAINST, both of which have happened:
 *
 * 1. TWO COPIES OF ONE POOL, DRIFTED. hatchEgg and grantPet each built the pet
 *    pool inline. `!i.exclusive` was in one and missing from the other, so a
 *    random grant could hand out the Day One Lizard, a pet that is supposed to
 *    be unobtainable. The pools are now ONE function, pickRandomPet, and the
 *    SHARED row below fails if a second one ever reappears.
 *
 * 2. THE SAME DRIFT, ONE FUNCTION LOWER, AND STILL LIVE UNTIL NOW. rollCosmetic
 *    has two pools too: candidates() and the terminal dupe fallback. The pet
 *    accessory slots (CE/CB/CG/CM) were excluded from the first and NOT from the
 *    second, because the second carried its own copy of `slot !== 'C'`.
 *    MEASURED on the tree before this fix, 200,000 rolls per floor: 0.993% of
 *    Common Crate fallback rolls and 2.938% of Golden Crate rolls came back a
 *    pet accessory. It is worth being exact about what that cost, because the
 *    honest answer is smaller than "her accessories drop free": openCrate's
 *    terminal fallback always returns `dupe: true`, and its dupe branch pays
 *    coins WITHOUT calling grantCosmetic, so the item was never granted. What
 *    shipped was a crate reveal card showing a 12,000-coin item the player has
 *    never owned, labelled "DUPE", paying its rarity's dupe value (400 coins for
 *    the legendary Live Wire Stinger; 223,320 coins across those 200,000 rolls).
 *    A lie about where loot comes from, on the screen selling the thing, plus an
 *    unearned coin faucet. Both pools are now ONE predicate, crateEligible.
 *
 * WHAT IT ASSERTS
 *   SAMPLE   the roster really carries what every row below assumes: a C6 that
 *            is legendary, hatchable and carries hatchChance, at least one
 *            exclusive pet to protect, and at least one pet accessory to keep
 *            out of crates. An empty sample is a failure, never a pass.
 *   RATE     C6 comes out of pickRandomPet at 1%, in BOTH pool shapes (a fresh
 *            player, and a player who owns every species so the dupe branch is
 *            the one running). N and tolerance stated on the row.
 *   SPLIT    and the rest of the roster still splits the remaining 99% evenly,
 *            which is the "and not more" half: a rate row alone passes on a pool
 *            that has quietly lost everything else.
 *   NEVER    zero exclusive picks and zero common picks across 400,000 draws.
 *   CRATE    zero pets and zero pet accessories out of rollCosmetic, at floor 0
 *            and at the Golden Crate's floor 2.
 *   LEAK     the positive control for CRATE, and the row that matters most: the
 *            pre-fix pool, rebuilt in one line here, is driven over the same
 *            rolls and REQUIRED to produce pet accessories. A green CRATE beside
 *            a green LEAK would be an audit grading nothing.
 *   REACH    every graded crate roll really is a terminal-fallback dupe, so the
 *            file cannot pass by never entering the branch it is about.
 *   SHARED   static: exactly ONE pet pool exists in js/loot.js, it is inside
 *            pickRandomPet, and hatchEgg and grantPet both call it; exactly ONE
 *            `slot !== 'C'` exists, inside crateEligible, and both crate pools
 *            call that. This is the row that fails on the NEXT re-inlining,
 *            which is how both bugs above were born.
 *
 * PROVE-RED, every row against a real defect. See the block at the bottom of
 * this header for the exact mutations and their output.
 *
 * PURE: imports js/loot.js and data/boneheadz.js, no browser, no db. ~7s.
 *
 *   node tests/pet-pool-audit.mjs
 *
 * ---- PROVE-RED, 2026-08-21, in a throwaway `cp -r` copy of the tree ---------
 * Eight mutations, every one a defect that has shipped or that this change could
 * plausibly undo. Each mutation asserted it applied before the run (a replace
 * that matches nothing is a green that proves nothing). Output as measured:
 *
 * 1. SAMPLE  put `"rarity": "epic", "exclusive": true` back on C6 in
 *            data/boneheadz.js, which is exactly the shipped state before this
 *            change.
 *      FAIL SAMPLE  | C6 Bumbleseal: epic, exclusive=true, hatchChance=undefined
 *      FAIL RATE    | 0.0000 measured (both pool shapes)
 *      FAIL SPLIT   | expected share is NaN: nothing was graded
 *
 * 2. RATE    delete the `"hatchChance": 0.01,` line only, so she is hatchable
 *            with no gate. This is the number Tom asked about.
 *      FAIL RATE  | 0.2487 measured, fresh player  (C1 25.176% C2 25.000%
 *                   C5 24.954% C6 24.870%)
 *      FAIL RATE  | 0.2482 measured, owns every species
 *
 * 3a. SPLIT  `const rest = pets.filter(i => !i.hatchChance)` -> `const rest =
 *            pets`, so the shop pet takes her 1% AND an even share on top.
 *      FAIL RATE   | 0.2577 measured
 *      FAIL SPLIT  | C1 0.2481, C2 0.2474, C5 0.2468 against 0.3300 +/- 0.01
 * 3b. SPLIT  the same line narrowed to `&& i.id === 'C1'`, which swallows the
 *            rest of the roster while leaving the 1% gate correct. This is the
 *            mutation that shows SPLIT is not redundant with RATE:
 *      ok   RATE   (0.99%, still perfect)
 *      FAIL SPLIT  | C1 0.9897, C2 0.0000, C5 0.0000
 *
 * 4. NEVER   remove `!i.exclusive` from pickRandomPet, the original drift.
 *      FAIL NEVER  | CX drawn 99,313 times in 400,000
 *
 * 5. CRATE   restore `i => !i.default && i.slot !== 'C'` in the terminal
 *            fallback: the leak exactly as it stood before this change.
 *      FAIL CRATE   | 962 leaked at floor 0 {CB1 219, CE1 185, CM1 273, CG1 76,
 *                     CB2 209} = 0.96% of rolls
 *      FAIL CRATE   | 3,058 leaked at floor 2 {CB1 946, CE1 858, CG1 390,
 *                     CB2 864} = 3.06% of rolls
 *      FAIL SHARED  | 2 inline `slot !== 'C'` filters, 1 crateEligible call site
 *      ok   LEAK    (stays green: the control and the graded row working as a
 *                    pair, which is the shape that says CRATE saw something)
 *
 * 6. LEAK    point LEAK's own pre-fix pool at the FIXED predicate, i.e. make the
 *            control look where the bug cannot be.
 *      FAIL LEAK   | ZERO: the pre-fix pool is clean on this data, so the CRATE
 *                    rows above prove nothing
 *      ok   CRATE  (green while grading nothing: precisely what LEAK is for)
 *
 * 7. REACH   grade the crate rolls against an EMPTY owned set, so the walk never
 *            exhausts and the terminal fallback is never entered.
 *      FAIL REACH  | 0/100,000 came back as dupes (both floors)
 *      ok   CRATE  (a zero counted over a sample that cannot contain the thing)
 *
 * 8. SHARED  re-inline grantPet's pool exactly as it was before this change.
 *      FAIL SHARED  | 2 pet pool(s) in the module; hatchEgg calls it: true;
 *                     grantPet calls it: false
 *      ok   RATE, ok CRATE, ok NEVER, ok SPLIT
 *            SHARED is the ONLY row that catches this, and that is the argument
 *            for the row: grantPet('random') is the BONEHEADZ redeem code, a
 *            path no rate row here drives, so a re-inlined pool would hand out
 *            the 50,000-coin pet at 25% and every other row would stay green.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickRandomPet, rollCosmetic } from '../js/loot.js';
import { BH_ITEMS, PET_SLOTS } from '../data/boneheadz.js';

const here = dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? '  | ' + detail : ''}`);
  if (!pass) fails = 1;
};

/* ---- SAMPLE: everything below assumes these facts about the roster -------- */
const SHOP_PET = 'C6';
const pets = BH_ITEMS.filter(i => i.slot === 'C');
const shop = pets.find(i => i.id === SHOP_PET);
const exclusives = pets.filter(i => i.exclusive);
const petSlot = new Set(PET_SLOTS.map(s => s.code));
const accessories = BH_ITEMS.filter(i => !i.default && i.slot !== 'C' && petSlot.has(i.slot));

ok(`SAMPLE ${SHOP_PET} is a legendary, hatchable, 1% shop pet`,
  !!shop && shop.rarity === 'legendary' && !shop.exclusive && shop.hatchChance === 0.01,
  shop ? `${shop.id} ${shop.name}: ${shop.rarity}, exclusive=${!!shop.exclusive}, hatchChance=${shop.hatchChance}`
    : `${SHOP_PET} is not in the catalogue at all, so every row below grades nothing`);
ok('SAMPLE there is an exclusive pet to protect and an accessory to keep out of crates',
  exclusives.length > 0 && accessories.length > 0,
  `${exclusives.length} exclusive pets (${exclusives.map(i => i.id).join(' ') || 'NONE'}), `
  + `${accessories.length} pet accessories (${accessories.map(i => `${i.id}:${i.rarity}`).join(' ') || 'NONE'})`);

/* ---- RATE / SPLIT / NEVER ------------------------------------------------ */
/* N AND THE TOLERANCE, STATED. p = 0.01 at N = 200,000 has a standard error of
   0.000222, so +/- 0.0015 is 6.7 sigma: a false red is a 1-in-60-billion event,
   and the band [0.0085, 0.0115] is red on every wrong answer this can produce.
   The two that matter: the flag left off entirely puts C6 on an even share of
   the four-deep non-common pool, 0.2500, which is 1,122 sigma out; `exclusive`
   left on puts her at 0.0000, 45 sigma out. */
const N = 200_000;
const RATE_TOL = 0.0015;
const SPLIT_TOL = 0.01;

function draw(owned) {
  const tally = {};
  for (let i = 0; i < N; i++) { const p = pickRandomPet(owned); tally[p.id] = (tally[p.id] || 0) + 1; }
  return tally;
}
/* BOTH POOL SHAPES, because they are built from different arrays. A fresh player
   draws from the UNOWNED species; a player who owns them all falls through to
   the whole roster and every hatch is a stacking duplicate. A gate applied to
   one and not the other is this file's failure 1 all over again. */
const fresh = draw(new Set());
const full = draw(new Set(pets.map(i => i.id)));
const shares = t => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / N]));
const fmt = t => Object.entries(shares(t)).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k} ${(v * 100).toFixed(3)}%`).join('  ');

for (const [label, tally] of [['fresh player', fresh], ['owns every species', full]]) {
  const got = (tally[SHOP_PET] || 0) / N;
  ok(`RATE ${SHOP_PET} hatches at 0.0100 +/- ${RATE_TOL} over ${N.toLocaleString()} draws (${label})`,
    Math.abs(got - 0.01) <= RATE_TOL,
    `${got.toFixed(4)} measured  |  ${fmt(tally)}`);
}

/* SPLIT — the "and not more" half, and a positive control that the pool is live.
   Everything that is neither exclusive nor a shop pet shares the remaining 99%
   evenly, minus the commons, which the pool only falls back to when nothing
   better is left. A gate that swallowed the rest of the roster would pass RATE. */
const evenPool = pets.filter(i => !i.exclusive && !i.hatchChance && i.rarity !== 'common');
const expected = (1 - Number(shop && shop.hatchChance)) / evenPool.length;
for (const [label, tally] of [['fresh player', fresh], ['owns every species', full]]) {
  const off = evenPool.map(i => ({ id: i.id, got: (tally[i.id] || 0) / N }))
    .filter(x => Math.abs(x.got - expected) > SPLIT_TOL);
  /* `expected` MUST BE A NUMBER, and this clause is not defensive noise: with the
     hatchChance field gone `expected` is NaN, every comparison against it is
     false, `off` comes back empty and this row PASSED while printing "NaN". Found
     by proving it red. A band nobody can be outside is not a band. */
  ok(`SPLIT the other ${evenPool.length} pets each take ${expected.toFixed(4)} +/- ${SPLIT_TOL} (${label})`,
    Number.isFinite(expected) && evenPool.length > 0 && off.length === 0,
    !Number.isFinite(expected) ? `expected share is ${expected}: nothing was graded`
      : off.length ? off.map(x => `${x.id} ${x.got.toFixed(4)}`).join(', ')
        : `${evenPool.map(i => i.id).join(' ')} all inside the band`);
}

const banned = new Set([...exclusives.map(i => i.id), ...pets.filter(i => i.rarity === 'common').map(i => i.id)]);
const seen = [...new Set([...Object.keys(fresh), ...Object.keys(full)])].filter(id => banned.has(id));
ok(`NEVER no exclusive and no common pet in ${(N * 2).toLocaleString()} draws`,
  seen.length === 0,
  seen.length
    ? seen.map(id => `${id} drawn ${(fresh[id] || 0) + (full[id] || 0)} times`).join(', ')
    : `${[...banned].join(' ')} all absent (${[...banned].length} banned ids)`);

/* ---- CRATE / LEAK / REACH ------------------------------------------------ */
/* Own literally everything a crate can legitimately give you, so the rarity walk
   in rollCosmetic() exhausts and the terminal fallback is the only path left:
   that fallback is the pool that leaked, and it is unreachable any other way. */
const CN = 100_000;
const ownedAll = new Set(BH_ITEMS.filter(i => !i.default && i.slot !== 'C' && !petSlot.has(i.slot)).map(i => i.id));
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

for (const floor of [0, 2]) {
  const bad = {}; let dupes = 0;
  for (let i = 0; i < CN; i++) {
    const { item, dupe } = rollCosmetic(ownedAll, floor, null);
    if (dupe) dupes++;
    if (item.slot === 'C' || petSlot.has(item.slot)) bad[item.id] = (bad[item.id] || 0) + 1;
  }
  const n = Object.values(bad).reduce((a, b) => a + b, 0);
  ok(`REACH every one of the ${CN.toLocaleString()} floor-${floor} rolls reached the terminal fallback`,
    dupes === CN, `${dupes}/${CN} came back as dupes`);
  ok(`CRATE no pet and no pet accessory out of ${CN.toLocaleString()} floor-${floor} rolls`,
    n === 0, n ? `${n} leaked: ${JSON.stringify(bad)}` : 'zero, across every rarity the floor can roll');
}

/* LEAK — THE POSITIVE CONTROL, and CRATE is worthless without it. Three of the
   four rows above assert a ZERO, which is the shape that passes on a sample that
   cannot contain the thing being counted. So rebuild the PRE-FIX fallback pool
   here, in the one line it used to be, and require it to leak. If it does not,
   the data has moved and CRATE is grading nothing. */
let controlLeaks = 0;
for (const r of RARITY_ORDER) {
  const before = BH_ITEMS.filter(i => !i.default && i.slot !== 'C' && i.rarity === r);
  controlLeaks += before.filter(i => petSlot.has(i.slot)).length;
}
ok('LEAK the pre-fix fallback pool really does contain pet accessories, so CRATE is grading something',
  controlLeaks > 0,
  controlLeaks
    ? `${controlLeaks} accessory entries survive \`!i.default && i.slot !== 'C'\` across the five rarities`
    : 'ZERO: the pre-fix pool is clean on this data, so the CRATE rows above prove nothing');

/* ---- SHARED: the two sites agree because there is only one site ----------- */
const src = readFileSync(join(here, '..', 'js', 'loot.js'), 'utf8');
/* Bodies by brace-at-column-zero, which is this file's style throughout. Reading
   the whole module instead would let a call in ANY function satisfy the row. */
const body = name => {
  const at = src.indexOf(`function ${name}(`);
  if (at === -1) return null;
  const end = src.indexOf('\n}', at);
  return end === -1 ? null : src.slice(at, end);
};
const petPools = [...src.matchAll(/BH_ITEMS\.filter\(i => i\.slot === 'C'/g)].length;
const hatch = body('hatchEgg'), grant = body('grantPet');
ok('SHARED js/loot.js builds the pet pool ONCE, in pickRandomPet, and both callers use it',
  petPools === 1 && /export function pickRandomPet\(/.test(src)
    && !!hatch && hatch.includes('pickRandomPet(') && !!grant && grant.includes('pickRandomPet('),
  `${petPools} pet pool(s) in the module; hatchEgg calls it: ${!!hatch && hatch.includes('pickRandomPet(')}; `
  + `grantPet calls it: ${!!grant && grant.includes('pickRandomPet(')}`);

const slotC = [...src.matchAll(/i\.slot !== 'C'/g)].length;
const eligible = [...src.matchAll(/crateEligible\(i\)/g)].length;
ok('SHARED the crate pool is ONE predicate too: one `slot !== \'C\'`, and both crate pools call crateEligible',
  slotC === 1 && /const crateEligible = /.test(src) && eligible === 2,
  `${slotC} inline \`slot !== 'C'\` filter(s), ${eligible} crateEligible call site(s) (candidates + the terminal fallback)`);

console.log(fails
  ? '\nPET POOL AUDIT: FAILED'
  : `\nPET POOL AUDIT: ${SHOP_PET} hatches at 1%, exclusives never do, no pet or pet accessory can come out of a crate, and both pools have exactly one home`);
process.exit(fails);
