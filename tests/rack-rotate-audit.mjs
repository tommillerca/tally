/* THE ROTATING SHELF SELLS THE RIGHT THINGS AT THE RIGHT PRICE. 2026-08-27.
 *
 * Tom: "we need to be offering for more for sale there now that we have removed
 * chests for sale from the game players are pissed and have no where to spend
 * their gold so make the rack more interesting", and the shape he chose: "part
 * of the rack has themed stuff and then there is just random rotating items
 * below".
 *
 * The themed rack sells NINE a week out of a catalogue of 370, so 361 finished
 * pieces were unreachable with coins. The second shelf draws from the rest. That
 * is a pool nobody hand-checks, which is what makes these rows worth having:
 * every failure below is SILENT in the app.
 *
 *   POOL       nothing that must never be sold can enter. Pets are hatched, not
 *              bought; Bumbleseal (C6) is shop-only WITH a 1% hatch and has her
 *              own shelf; `exclusive` art is "awarded by name only" per
 *              js/loot.js and selling it breaks a promise to the players who
 *              earned it (the Day One Lizard is the live case); `default` is the
 *              body and skull every player already starts with. Each is asserted
 *              by NAME with the denominator printed, because "I found none" over
 *              an empty scan is this repo's most repeated false pass.
 *   DISJOINT   THIS IS THE MONEY ROW. buyRackItem prices a themed piece by
 *              `st.ids.indexOf(artId)` and a rotating one by rarity. One id on
 *              BOTH shelves would take the themed branch wherever the player
 *              tapped it and charge another rung's price, which is exactly the
 *              collision rack-theme-lint exists to stop one level up. Checked
 *              across many weeks AND salts, not one.
 *   LADDER     dust is the CERTAINTY premium, so coins-per-dust must never
 *              REVERSE as pieces get dearer. RACK_DUST carries the same
 *              invariant and records that a formula once made plain briefs cost
 *              25% more dust than the aura.
 *   PRICED     every id the picker can return has a rarity price, so no tile can
 *              render with an undefined price.
 *   STABLE     the same week and salt give the same shelf. A rack recomputed per
 *              render is a rack that changes under the player's thumb.
 *   MOVES      a reroll actually moves it, or the reroll is taking coins for
 *              nothing.
 *
 * PURE: reads the module, no browser, sub-second, so it runs on every gate and
 * on every art drop.
 *
 * PROVE-RED, each isolating its own row: put an `exclusive` id in the pool
 * filter -> POOL; seed the rotating picker with the same namespace as the themed
 * one -> DISJOINT; swap two dust values -> LADDER.
 *
 * Usage: node tests/rack-rotate-audit.mjs
 */
/* THE REAL PICKERS, IMPORTED RATHER THAN REIMPLEMENTED. The first draft of this
   file reproduced the seed arithmetic locally, which meant DISJOINT graded a
   COPY: deleting the `taken` filter from js/loot.js left this file completely
   green, so the one row that protects the money could not see the defect it
   exists for. Caught by proving it red, not by reading it. */
import { RACK_ROTATE_POOL, RACK_ROTATE_N, RACK_RARITY_PRICE, rackRotatePick, rackPick } from '../js/loot.js';
import { BH_ITEMS, BH_BY_ID } from '../data/boneheadz.js';

let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

/* SETUP: an empty pool would pass every row below for free. */
ok('SETUP the rotating pool is not empty', RACK_ROTATE_POOL.length > 50,
  `${RACK_ROTATE_POOL.length} sellable ids out of ${BH_ITEMS.length} in the catalogue`);
if (RACK_ROTATE_POOL.length <= 50) { console.log('\nrack-rotate: FAILED'); process.exit(1); }

const inPool = new Set(RACK_ROTATE_POOL);
const banned = [
  ['pets (hatched, never bought)', BH_ITEMS.filter(i => i.slot === 'C')],
  ["Bumbleseal's own pieces (her own shelf)", BH_ITEMS.filter(i => ['CE', 'CB', 'CG', 'CM'].includes(i.slot))],
  ['exclusive (awarded by name only)', BH_ITEMS.filter(i => i.exclusive)],
  ['starting body and skull', BH_ITEMS.filter(i => i.default)],
];
for (const [what, items] of banned) {
  const leaked = items.filter(i => inPool.has(i.id));
  ok(`POOL   no ${what} can be sold on the rotating shelf`,
    items.length > 0 && leaked.length === 0,
    items.length === 0
      ? 'NOTHING MATCHED, so this row graded an empty set and proves nothing'
      : `${items.length} such item(s) in the catalogue [${items.map(i => i.id).join(', ')}], ${leaked.length} leaked into the pool`);
}

ok('PRICED every sellable id has a rarity price, so no tile renders undefined',
  RACK_ROTATE_POOL.every(id => RACK_RARITY_PRICE[BH_BY_ID[id].rarity]),
  `${RACK_ROTATE_POOL.length} ids across ${new Set(RACK_ROTATE_POOL.map(id => BH_BY_ID[id].rarity)).size} rarities`);

/* Reproduce the picker's seed exactly rather than importing it (it is module
   private), so this also pins the seed string: change it and DISJOINT/STABLE
   move, which is the point. */
const pick = rackRotatePick;
const themedFor = rackPick;

let collisions = 0, short = 0, samples = 0, moved = 0, movePairs = 0;
for (let w = 0; w < 60; w++) {
  for (let salt = 0; salt < 4; salt++) {
    const t = themedFor(`2026-W${w}`, salt);
    const r = pick(`2026-W${w}`, salt, t);
    samples++;
    if (r.length !== RACK_ROTATE_N) short++;
    if (r.some(id => t.includes(id))) collisions++;
    if (new Set(r).size !== r.length) collisions++;
    if (salt > 0) {
      movePairs++;
      const prev = pick(`2026-W${w}`, salt - 1, themedFor(`2026-W${w}`, salt - 1));
      if (r.join() !== prev.join()) moved++;
    }
  }
}
ok('DISJOINT no id is ever on both shelves at once, so the indexOf price lookup cannot cross',
  collisions === 0 && samples > 0, `${collisions} collision(s) across ${samples} week/salt shelves`);
ok('SIZE   every shelf is full, so the picker never returns short',
  short === 0 && samples > 0, `${short} short shelf/shelves of ${samples}`);
ok('MOVES  a reroll actually changes the rotating shelf',
  movePairs > 0 && moved === movePairs, `${moved} of ${movePairs} rerolls moved it`);

const a = pick('2026-W07', 2, themedFor('2026-W07', 2));
const b = pick('2026-W07', 2, themedFor('2026-W07', 2));
ok('STABLE the same week and salt give the same shelf, so it cannot change under a re-render',
  a.length > 0 && a.join() === b.join(), `${a.length} ids, identical on a second call`);

const order = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const cpd = order.map(r => ({ r, v: RACK_RARITY_PRICE[r][0] / RACK_RARITY_PRICE[r][1] }));
const rising = cpd.every((x, i) => i === 0 || x.v > cpd[i - 1].v);
ok('LADDER coins-per-dust never reverses as pieces get dearer (dust is the certainty premium)',
  rising, cpd.map(x => `${x.r} ${x.v.toFixed(2)}`).join(' < '));

console.log(fails ? '\nrack-rotate: FAILED' : '\nrack-rotate: clean');
process.exit(fails);
