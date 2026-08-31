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
import { RACK_ROTATE_POOL, RACK_ROTATE_N, RACK_RARITY_PRICE, RACK_POOLS, RACK_DUST, RACK_REROLL_LADDER, rackRerollCost, rackRotatePick, rackPick } from '../js/loot.js';
import { readFileSync } from 'node:fs';
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

/* DAILY, which is the reason the shelf is seeded on the day rather than the
   week. Tom, 2026-08-27: "i think the rack should change up everyday to keep
   things fresh and have people checking in". A shelf that repeated across days
   would look identical to the weekly one it replaced and nothing else in the app
   would say otherwise. */
{
  const themedW = themedFor('2026-W35', 0);
  const shelves = [];
  for (let d = 1; d <= 30; d++) shelves.push(pick(`2026-09-${String(d).padStart(2, '0')}`, 0, themedW).join());
  const distinct = new Set(shelves).size;
  ok('DAILY  a new day gives a different shelf, which is the point of seeding on the day',
    distinct === shelves.length && shelves.length === 30,
    `${distinct} distinct shelves across ${shelves.length} consecutive days`);
}

const a = pick('2026-W07', 2, themedFor('2026-W07', 2));
const b = pick('2026-W07', 2, themedFor('2026-W07', 2));
ok('STABLE the same week and salt give the same shelf, so it cannot change under a re-render',
  a.length > 0 && a.join() === b.join(), `${a.length} ids, identical on a second call`);

/* ============ THE REROLL CURVE (Tom, 2026-08-31) ============
 * "players should be able to pay an increasing amount to reroll the rack thats
 * fine": the count is unlimited within the week, so the PRICE is the only
 * ceiling. Three things must hold or the sink becomes a trap or a faucet:
 * the curve rises, it CAPS past the ladder rather than indexing off the end
 * (an undefined cost is `bal < undefined` = false, then a NaN wallet), and
 * every value is finite and positive (there is no free rung to spam). */
{
  const L = RACK_REROLL_LADDER;
  const rising = L.every((v, i) => i === 0 || v > L[i - 1]);
  ok('CURVE  the reroll price rises strictly with every rung, all finite and paid',
    L.length >= 2 && rising && L.every(v => Number.isFinite(v) && v > 0),
    L.join(' < '));
  const cap = L[L.length - 1];
  const past = [L.length, L.length + 5, 50].map(rackRerollCost);
  ok('CURVE  past the ladder the price holds at the cap, never null or undefined',
    past.every(v => v === cap) && rackRerollCost(0) === L[0],
    `rackRerollCost(${L.length}/${L.length + 5}/50) = ${past.join('/')}, cap ${cap}, first rung ${L[0]}`);
}

/* DISTINCT: each paid reroll buys a shelf the player has not already seen this
   week. The themed nine are FIXED per week (rerollRack keeps cur.ids), so
   `taken` is pinned to the week's salt-0 themed draw, exactly as the app now
   calls the picker. Pairwise across salts, not just adjacent: MOVES above only
   proves n differs from n-1, which a two-state flip-flop would pass. */
{
  let weeks = 0, allDistinct = 0;
  for (let w = 10; w < 20; w++) {
    const themed = themedFor(`2026-W${w}`, 0);
    const shelves = [];
    for (let n = 0; n <= 5; n++) shelves.push(pick(`2026-W${w}`, n, themed).join());
    weeks++;
    if (new Set(shelves).size === shelves.length) allDistinct++;
  }
  ok('DISTINCT six salts give six pairwise-different shelves, week after week',
    weeks === 10 && allDistinct === weeks,
    `${allDistinct} of ${weeks} weeks fully distinct across salts 0..5`);
}

/* N0: the un-rerolled shelf is untouched by the reroll machinery. A counter
   threaded wrongly into the seed (off by one, or salting n=0) would silently
   move EVERY player's default shelf on update day. The salt-0 seed string is
   pinned by a local FNV-1a reimplementation, so this goes red if it moves. */
{
  const fnv = t => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const themed = themedFor('2026-W21', 0);
  const pool = RACK_ROTATE_POOL.filter(id => !themed.includes(id));
  const expect = [];
  for (let i = 0; expect.length < RACK_ROTATE_N && i < RACK_ROTATE_N * 40; i++) {
    const id = pool[fnv(`2026-W21:0:rot:${i}`) % pool.length];
    if (!expect.includes(id)) expect.push(id);
  }
  const got = pick('2026-W21', 0, themed);
  ok('N0     salt 0 is exactly the un-rerolled draw (seed string pinned)',
    got.length === RACK_ROTATE_N && got.join() === expect.join(),
    `${got.length} ids against the pinned \${week}:0:rot:\${i} seed`);
}

/* WEEK-IDENTITY, statically, the same way the GUARD row reads buyRackItem:
   rerollRack must keep the themed nine (`ids: cur.ids`) and must debit only
   AFTER the kvUpdate claim is won, or a losing racer pays for a shelf it never
   moved. Source order is the contract here because this audit is pure node and
   cannot drive IndexedDB. */
{
  const src = readFileSync(new URL('../js/loot.js', import.meta.url), 'utf8');
  const at = src.indexOf('async function rerollRack');
  /* Comments are STRIPPED before matching. Proving this row red caught the
     first draft matching the words `ids: cur.ids` inside rerollRack's own
     comment while the code beside it redrew the nine: a guard that reads prose
     grades the documentation, not the behaviour. */
  const body = (at === -1 ? '' : src.slice(at, src.indexOf('\nexport', at + 1)))
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const keeps = body.includes('ids: cur.ids');
  const debitAfterClaim = body.includes('kvUpdate') && body.includes('coinsAdd')
    && body.indexOf('kvUpdate') < body.indexOf('coinsAdd');
  ok('WEEK-IDENTITY rerollRack keeps the themed nine and debits only after the claim',
    keeps && debitAfterClaim,
    body ? `ids: cur.ids ${keeps ? 'present' : 'MISSING'}, debit-after-claim ${debitAfterClaim}` : 'rerollRack body NOT FOUND, so this row read nothing');
}

/* THE TWO RUNG ARRAYS ARE PARALLEL, AND NOTHING ELSE HOLDS THEM TOGETHER.
   buyRackItem prices a dust buy as RACK_DUST[i] where i indexes RACK_POOLS; a
   rung added to one array without the other prices as undefined, `bal <
   undefined` is false, and the wallet write is NaN (the loot.js guard now
   refuses that sale at runtime; this row is what keeps the guard theoretical).
   The rung ladder gets the same certainty-premium rule the rarity shelf has:
   coins-per-dust must never reverse as rungs get dearer. */
{
  const src = (await import('node:fs')).readFileSync(new URL('../js/loot.js', import.meta.url), 'utf8');
  const at = src.indexOf('function buyRackItem');
  const body = at === -1 ? '' : src.slice(at, src.indexOf('\nexport', at + 1));
  ok('GUARD buyRackItem refuses a non-finite price before the receipt claim',
    body.includes('Number.isFinite(price)')
      && body.indexOf('Number.isFinite(price)') < body.indexOf('rackbuy:'),
    'the NaN-wallet guard sits between pricing and the claim');
}
ok('PARALLEL every RACK_POOLS rung has its RACK_DUST price',
  RACK_DUST.length === RACK_POOLS.length && RACK_DUST.every(Number.isFinite),
  `${RACK_POOLS.length} rungs, ${RACK_DUST.length} dust prices`);
{
  const rungs = RACK_POOLS.map(([coin], i) => ({ coin, cpd: coin / RACK_DUST[i] }))
    .sort((x, y) => x.coin - y.coin);
  const rising = rungs.every((x, i) => i === 0 || x.cpd >= rungs[i - 1].cpd);
  ok('RUNG-LADDER coins-per-dust never reverses across the themed rungs',
    rising, rungs.map(x => x.cpd.toFixed(2)).join(' <= '));
}

const order = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const cpd = order.map(r => ({ r, v: RACK_RARITY_PRICE[r][0] / RACK_RARITY_PRICE[r][1] }));
const rising = cpd.every((x, i) => i === 0 || x.v > cpd[i - 1].v);
ok('LADDER coins-per-dust never reverses as pieces get dearer (dust is the certainty premium)',
  rising, cpd.map(x => `${x.r} ${x.v.toFixed(2)}`).join(' < '));

console.log(fails ? '\nrack-rotate: FAILED' : '\nrack-rotate: clean');
process.exit(fails);
