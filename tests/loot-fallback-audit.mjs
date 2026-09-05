/* tests/loot-fallback-audit.mjs — A DUPE PAYS THE RARITY IT ROLLED, NOT THE CATALOGUE.
 *
 * WHY THIS EXISTS. rollCosmetic() picks uniformly over crateEligible items AT
 * THE ROLLED RARITY, owned or not (2026-09-05, crate-frequency audit lever 1:
 * scratchpad/r33/faucet/out/crate-frequency.md section 4c; before that date it
 * preferred an unowned item and walked to a neighbouring rarity, falling back
 * to a duplicate only once the whole catalogue was owned). Either way, the
 * question this file guards is the same one: does a duplicate pay the rarity
 * the crate actually rolled, or does it pay off a uniform pick over the whole
 * catalogue? The catalogue is 10.2% legendary against a 3% drop weight, so a
 * uniform-over-catalogue pick paid the 400-coin legendary dupe 3.41x more
 * often than the drop table says, and used to be the game's largest coin
 * faucet (measured: 90.8 coins per Common Crate at full collection, against
 * 65.5 once weighted). A fully-owned pool now dupes through the SAME uniform
 * pick every roll uses, rather than through a separate terminal-fallback
 * branch, so the promise this file grades is "the dupe mix matches the drop
 * weights", regardless of which line in rollCosmetic produced it.
 *
 * It is the least interesting line in the file, which is exactly why a refactor
 * would restore `BH_ITEMS.filter(i => !i.default)` without anybody noticing:
 * nothing about a uniform pick over a catalogue LOOKS wrong.
 *
 * WHAT IT ASSERTS
 *   REACH    every sampled roll on a fully-owned pool really does come back a
 *            dupe. Without this the whole file could pass by never reaching a
 *            dupe at all.
 *   PREMISE  the catalogue is genuinely NOT weight-shaped, so WEIGHT below is
 *            measuring the fix and not a coincidence in the data.
 *   WEIGHT   floor 0: the rarity mix of the returned dupes matches RARITIES[].w.
 *   FLOOR    floor 2 (Golden Crate): the mix matches the weights renormalised
 *            over rare/epic/legendary, and NO common or uncommon comes back.
 *            A uniform-over-catalogue pick fails this on sight, 64% of its
 *            picks being junk rarities a Golden Crate cannot roll.
 *   POOL     pets (slot C) never come back. They cannot drop from a crate, so
 *            revealing one as your dupe is a lie about where loot comes from.
 *
 * PROVE-RED: make rollCosmetic's item pick uniform over the WHOLE catalogue
 * instead of the rolled rarity (e.g. `BH_ITEMS.filter(crateEligible)` in place
 * of the rarity-filtered pool) and WEIGHT goes red on legendary (0.102
 * measured against 0.030 expected) and FLOOR goes red on commons appearing in
 * a Golden Crate.
 *
 * Node-only, no browser, no db. Measured 1.5s.
 */
import assert from 'node:assert/strict';
import { rollCosmetic, RARITIES, RARITY_ORDER, crateEligible } from '../js/loot.js';
import { BH_ITEMS } from '../data/boneheadz.js';

const N = 200_000;
const TOL = 0.01;            // 25x the p=0.03 standard error at this N
let checks = 0, failed = 0;
const ok = (name, cond, detail) => {
  checks++;
  if (!cond) { failed++; console.log(`FAIL  ${name}: ${detail}`); }
  else console.log(`ok    ${name}${detail ? ': ' + detail : ''}`);
};

/* Own literally everything a crate can give you, so every roll is a dupe: with
   the unowned preference gone (2026-09-05) this no longer forces the terminal
   fallback specifically, it forces EVERY roll's normal-path pick to land on an
   owned item, which is exactly the state this file needs to grade the mix. */
/* THE SAME POOL THE PICK DRAWS FROM, not a re-derivation of it (2026-09-04).
   The football kit added 256 epic, rack-only garments that crateEligible excludes;
   this line's own filter kept them, diluted legendary to 5.8% and PREMISE went red
   on a fallback that had not changed. */
const POOL = BH_ITEMS.filter(crateEligible);
const owned = new Set(POOL.map(i => i.id));

function sample(floor) {
  const tally = {}; let dupes = 0, pets = 0;
  for (let i = 0; i < N; i++) {
    const { item, dupe } = rollCosmetic(owned, floor, null);
    if (dupe) dupes++;
    if (item.slot === 'C') pets++;
    tally[item.rarity] = (tally[item.rarity] || 0) + 1;
  }
  return { tally, dupes, pets };
}

const f0 = sample(0);

/* REACH — a guard that never sees a dupe is not a guard. */
ok('REACH', f0.dupes === N, `${f0.dupes}/${N} rolls on a fully-owned pool came back dupes`);

/* PREMISE — if the catalogue ever became weight-shaped on its own, WEIGHT would
   pass against a uniform pick and this file would silently stop protecting
   anything. Fail loudly instead so somebody re-reads the assertion. */
const uniLeg = POOL.filter(i => i.rarity === 'legendary').length / POOL.length;
const wLeg = RARITIES.legendary.w / 100;
ok('PREMISE', uniLeg > wLeg * 2,
  `a uniform pick would return legendary ${(uniLeg * 100).toFixed(1)}% of the time against a ${(wLeg * 100).toFixed(0)}% drop weight (${(uniLeg / wLeg).toFixed(2)}x)`);

/* WEIGHT — floor 0 (Common Crate): the dupe mix IS the drop table. */
const totW = RARITY_ORDER.reduce((a, r) => a + RARITIES[r].w, 0);
for (const r of RARITY_ORDER) {
  const got = (f0.tally[r] || 0) / N, want = RARITIES[r].w / totW;
  ok(`WEIGHT ${r}`, Math.abs(got - want) < TOL,
    `${got.toFixed(3)} against ${want.toFixed(3)} expected (tolerance ${TOL})`);
}

/* FLOOR — floor 2 (Golden Crate): a crate that cannot roll a common must not
   pay one out either. */
const FLOOR = 2;
const f2 = sample(FLOOR);
const above = RARITY_ORDER.slice(FLOOR);
const junk = RARITY_ORDER.slice(0, FLOOR).reduce((a, r) => a + (f2.tally[r] || 0), 0);
ok('FLOOR junk', junk === 0,
  `${junk} of ${N} Golden Crate dupes came back below the crate's rarity floor (${RARITY_ORDER.slice(0, FLOOR).join('/')})`);
const totF = above.reduce((a, r) => a + RARITIES[r].w, 0);
for (const r of above) {
  const got = (f2.tally[r] || 0) / N, want = RARITIES[r].w / totF;
  ok(`FLOOR ${r}`, Math.abs(got - want) < TOL * 2,
    `${got.toFixed(3)} against ${want.toFixed(3)} expected`);
}

/* POOL — pets hatch from step eggs and never from crates. */
ok('POOL pets', f0.pets === 0 && f2.pets === 0,
  `${f0.pets + f2.pets} pet-slot items were handed back as crate dupes`);

console.log(`\n${failed ? 'FAIL' : 'PASS'}  loot-fallback-audit: ${checks - failed}/${checks} checks`);
process.exit(failed ? 1 : 0);
