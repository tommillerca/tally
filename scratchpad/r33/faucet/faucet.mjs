/* scratchpad/r33/faucet/faucet.mjs: the economy faucet sim, REBUILT.
 *
 * WHY THIS IS A REBUILD. Round 33's lane left this file at
 * scratchpad/r33/faucet/faucet.mjs on the /home/claude rig with per-seed JSON
 * under out/. Neither survived into this repo (nothing on any branch, nothing
 * in any worktree). This file is reconstructed from the shipped functions the
 * way the lane's was, per HANDOFFr3320260904.md line 169, and its absolute
 * numbers are therefore NOT the salvaged table's numbers. What is decision
 * grade here is the DELTA between rule sets measured in ONE instrument.
 *
 * WHAT IS REAL AND WHAT IS MODELLED
 *   REAL   js/db.js on tests/mem-idb.mjs; js/game.js onHealthSync,
 *          awardDayCloseIfDue, award, grantLevelRewards, levelFor;
 *          js/loot.js grantCrate, openCrate, rollCosmetic, rollRarity,
 *          RARITIES, CRATES, RACK_RARITY_PRICE, coinsAdd/spendCoins.
 *          Every coin in the "crate" and "health" and "level" columns was
 *          minted by the shipped code, not by a formula in this file.
 *   MODEL  the Pit (a per-day coin draw, see PIT below), the shop (see SHOP),
 *          the health payload per depth (see DEPTHS), and the fifth-cut
 *          overlay, which is a PLAN (E32-3, HANDOFFshop20260904.md:229), not
 *          shipped code.
 *
 * THE CLOCK IS FAKED WHOLE. dateKey() reads `new Date()` (js/nutrition.js:176)
 * and claimDay reads Date.now() (js/db.js RULE 2), so faking Date.now alone
 * leaves the app's "today" frozen and every day after the first pays nothing.
 * FakeDate below replaces the constructor, Date.now and Date.parse.
 *
 * RULE 3 NEEDS A WITNESS. claimDay refuses any day more than WITNESS_GRACE
 * past the server mark as `unwitnessed`, so an offline sim under-counts the
 * day-close crate. witnessServerDay() is called with the faked clock each day,
 * which is what a player with a network connection gets for free.
 *
 * RUN   node scratchpad/r33/faucet/faucet.mjs [--days 365] [--seeds 11,23,47]
 *       [--rules today,fifth,fifth-half] [--depths light,committed,heavy]
 *       [--out scratchpad/r33/faucet/out]
 */
import '../../../tests/mem-idb.mjs';

/* ---------------- seeded rng, installed before loot.js ever calls it -------
   js/loot.js rng() (:710) is crypto.getRandomValues, so seeding the sim means
   seeding that. Same stream shape, so the shipped call sites are untouched. */
let RAND = mulberry32(1);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const realCrypto = globalThis.crypto;
Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    subtle: realCrypto?.subtle,
    randomUUID: () => `u${Math.floor(RAND() * 1e15).toString(36)}`,
    getRandomValues(arr) { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(RAND() * 0xffffffff); return arr; },
  },
});

/* ---------------- the whole Date, faked ---------------- */
const RealDate = Date;
let NOW = RealDate.parse('2031-01-01T09:00:00');
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(NOW); else super(...a); }
  static now() { return NOW; }
}
globalThis.Date = FakeDate;
const setNow = ms => { NOW = ms; };

const { db, useDbName, kvGet, kvSet } = await import('../../../js/db.js');
const dbm = await import('../../../js/db.js');
const g = await import('../../../js/game.js');
const loot = await import('../../../js/loot.js');
const { dateKey, addDays } = await import('../../../js/nutrition.js');
const { BH_ITEMS, BH_BY_ID } = await import('../../../data/boneheadz.js');
const { GEAR_ITEMS, GEAR_SLOTS } = await import('../../../js/gear.js');

const DAY_MS = 86400000;

/* ---------------- DEPTHS: the health payload a player of each depth sends ---
   Shaped to the three profiles the round-30/32 measurements name: a light
   player who mostly does not work out, a committed one who works out most
   days and logs food, a heavy one who trains hard daily.
   `logDays` is the share of days with a food log at all; `onBudget` the share
   of logged days inside the day-close window (that is the Bone Crate). */
const DEPTHS = {
  light: {
    logDays: 0.25, onBudget: 0.35, pitFights: 0,
    health: r => (r() < 0.30
      ? { steps: 4000 + Math.floor(r() * 3000), activeKcal: 120 + Math.floor(r() * 200), exerciseMin: 10 + Math.floor(r() * 15), workouts: 0, wtypes: [] }
      : { steps: 2000 + Math.floor(r() * 2500), activeKcal: 60 + Math.floor(r() * 120), exerciseMin: 5 + Math.floor(r() * 10), workouts: 0, wtypes: [] }),
  },
  committed: {
    logDays: 0.90, onBudget: 0.55, pitFights: 3,
    health: r => ({
      steps: 8500 + Math.floor(r() * 3500),
      activeKcal: 520 + Math.floor(r() * 400),
      exerciseMin: 35 + Math.floor(r() * 30),
      workouts: r() < 0.75 ? 1 : 0,
      wtypes: r() < 0.34 ? ['running'] : r() < 0.67 ? ['strength'] : ['yoga'],
    }),
  },
  heavy: {
    logDays: 0.98, onBudget: 0.70, pitFights: 7,
    health: r => ({
      steps: 13000 + Math.floor(r() * 5000),
      activeKcal: 900 + Math.floor(r() * 700),
      exerciseMin: 60 + Math.floor(r() * 45),
      workouts: 1 + (r() < 0.6 ? 1 : 0),
      cycleKm: r() < 0.35 ? 10 + Math.floor(r() * 25) : 0,
      wtypes: r() < 0.5 ? ['running', 'strength'] : ['running', 'yoga'],
    }),
  },
};

/* ---------------- PIT: modelled, and IDENTICAL in every rule set -----------
   The salvaged table's "of which pit" column is the same in both rule sets
   (about 71 committed, about 170 heavy, 0 light), so the Pit is a constant
   offset that cancels in the comparison this run exists to make. Modelled as
   the shipped ladder's repeatCoins (js/pit.js:1534-1543) for the rung the
   player's level has reached, times the fights they take that day.
   ponytail: a flat repeat-clear model, no win/loss roll, because a Pit that
   pays 0 or 175 on a coin flip only widens the seed spread on a column that
   does not move between rule sets. Swap in tests/fight-sim.mjs if the Pit
   itself is ever the question. */
const PIT_RUNGS = [15, 15, 20, 20, 25, 25, 30, 30, 40];
const pitCoinsFor = (level, fights) => {
  const rung = PIT_RUNGS[Math.min(PIT_RUNGS.length - 1, Math.floor(level / 9))];
  return rung * fights;
};

/* ---------------- SHOP models ---------------------------------------------
   TODAY: the shipped Rack. 9 themed rungs plus 12 rotating slots, priced by
   RACK_RARITY_PRICE (js/loot.js:187). Modelled rather than driven through
   rack() because rack() reaches poi.js/isoWeekKey and a weekly persisted
   record; the number that matters is the SINK, and the sink is the ladder
   price of what a player can see and afford on a given day.
   FIFTH: the 28 windows of HANDOFFshop20260904.md:66-93, set price (already
   25% off the piece sum), released on their stated week. */
const WINDOWS = [
  // [week, name, pieces, setPrice]
  [1, '5 A.M.', 6, 3900], [1, 'Bleachers', 9, 5480], [1, 'Boneheadz Away', 8, 4420],
  [1, 'Boneheadz OG', 8, 3980], [1, 'Game Day', 8, 5180], [1, 'Kitsune', 7, 4420],
  [1, 'Leg Day', 7, 4880], [1, 'Pool Day', 7, 4500], [1, 'Rest Day', 8, 4950],
  [1, 'Ronin', 7, 6750], [1, 'Smiley', 9, 4120], [1, 'Sticker Pack', 8, 4720],
  [1, 'Trailhead', 7, 4500], [1, 'Yard Work', 9, 4720],
  [2, "Gone Fishin'", 8, 6380], [4, 'Later Gator', 8, 5250], [5, 'Nightfall', 8, 4580],
  [6, 'Halo', 8, 7280], [6, 'Hell Week', 8, 5180], [7, 'Half Machine', 7, 4120],
  [8, 'Forager', 8, 4720], [11, 'Wild', 8, 4720], [12, 'Rink', 8, 4420],
  [14, 'Puffed Up', 7, 6000], [15, 'Iced Out', 8, 6900], [16, "New Year's Eve", 9, 6220],
  [25, 'Garden', 8, 4720], [26, 'Deep End', 6, 4280],
];

/* ---------------- the fifth-cut overlay -----------------------------------
   E32-3 (HANDOFFshop20260904.md:229): "CRATES.coins: Common [60,100], Bone
   [400,600]" plus dust, and crates roll only the 32 basics plus one armoury
   piece per gear slot, everything else in the crate being coins, dust and gear.
   Applied HERE, on the shipped objects, so the shipped openCrate does the work:
     - CRATES.daily.coins / CRATES.golden.coins are rewritten in place;
     - the crate art pool is shrunk by marking every out-of-pool BH_ITEMS row
       `exclusive`, which is the shipped crateEligible predicate (js/loot.js:1742)
       doing the excluding, not a second copy of it.
   THE POOL KEEPS ONE ITEM PER RARITY on purpose. rollCosmetic's terminal
   fallback (js/loot.js:1770) picks at the ROLLED rarity and openCrate then
   reads item.id, so a pool with no legendary throws (RED's hole,
   HANDOFFshop20260904.md:579). HANDOFFshop:645 names this exact shape as the
   safest ship: "only shrink the pool to basics that include at least one item
   per rarity". Anything else needs the payout-table rewrite E32-3 also asks
   for, which is not what this run is measuring. */
const OVERLAY_POOL_N = 40;   // 32 basics + 8 armoury (one plain piece per gear slot)
/* E32-3's dust column. openCrate does not pay dust today (there is no dust
   anywhere in a crate, HANDOFFshop20260904.md:577), so the overlay pays it
   beside the shipped open rather than inside it. Coins are the decision here;
   dust is carried so the table has the column the salvaged one had. */
const OVERLAY_DUST = { fifth: { daily: [5, 15], golden: [20, 40] }, 'fifth-half': { daily: [5, 15], golden: [20, 40] }, 'fifth-quarter': { daily: [5, 15], golden: [20, 40] } };

function applyOverlay(rules) {
  // restore first: BH_ITEMS is module state shared across runs in one process
  for (const it of BH_ITEMS) if (it.__simExcluded) { delete it.exclusive; delete it.__simExcluded; }
  loot.CRATES.daily.coins = [20, 40];
  loot.CRATES.golden.coins = [10, 25];
  if (rules === 'today') return { crateCoins: { daily: [20, 40], golden: [10, 25] }, pool: null };

  /* The ladder. `fifth-half` is Tom's ruling; `fifth-quarter` is here only so
     the report can show the shape of the curve rather than two points on it.
     It is NOT a counter-proposal: the multiplier is Tom's to pick. */
  const coins = rules === 'fifth'
    ? { daily: [60, 100], golden: [400, 600] }        // E32-3 as written
    : rules === 'fifth-quarter'
      ? { daily: [15, 25], golden: [100, 150] }       // reference point only
      : { daily: [30, 50], golden: [200, 300] };      // Tom's ruling: halve it
  loot.CRATES.daily.coins = coins.daily;
  loot.CRATES.golden.coins = coins.golden;

  // deterministic pool: one item per rarity, one ARMOURY piece per gear slot,
  // then filled to N. The per-gear-slot row is RED's hole 2
  // (HANDOFFshop20260904.md:481, "weapons and off-hands never drop again"):
  // without it the gear branch at js/loot.js:1818 finds no variant of any
  // pooled art and the crate stops paying gear entirely.
  const eligible = BH_ITEMS.filter(i => loot.crateEligible(i)).slice().sort((a, b) => a.id < b.id ? -1 : 1);
  const byRarity = new Map();
  for (const i of eligible) { if (!byRarity.has(i.rarity)) byRarity.set(i.rarity, []); byRarity.get(i.rarity).push(i); }
  const keep = new Set();
  for (const [, list] of byRarity) keep.add(list[0].id);          // one of every rarity, never empty
  for (const slot of GEAR_SLOTS) {
    const armoury = eligible.find(i => i.slot === slot && GEAR_ITEMS.some(gi => gi.artId === i.id));
    if (armoury) keep.add(armoury.id);
  }
  for (const i of eligible) { if (keep.size >= OVERLAY_POOL_N) break; keep.add(i.id); }
  for (const it of BH_ITEMS) if (!keep.has(it.id) && !it.exclusive) { it.exclusive = true; it.__simExcluded = true; }
  return { crateCoins: coins, pool: [...keep] };
}

/* ---------------- PRICES: the cosmetic ladder, scaled in place -------------
   Round 33 asked the faucet question; this knob asks the SINK question with the
   SAME instrument, which is the only way the caveat at the top of this file
   ("deltas are decision grade, absolutes are not") survives. The multiplier
   rewrites the SHIPPED RACK_RARITY_PRICE object, so shopRack and buyRackItem
   both read the scaled ladder rather than a second copy of it.
   PRICE_LADDER, when given, wins over the multiplier: that is how a proposed
   clean ladder (600/1400/2000/2800/4000) is measured rather than a raw 2.0x. */
const RARITY_KEYS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const BASE_LADDER = RARITY_KEYS.map(k => loot.RACK_RARITY_PRICE[k].slice());
const BASE_POOLS = loot.RACK_POOLS.map(([p]) => p);
const BASE_AURA = loot.RACK_AURA.coin;
function applyPrices(mult, ladder) {
  RARITY_KEYS.forEach((k, i) => {
    loot.RACK_RARITY_PRICE[k][0] = ladder ? ladder[i] : Math.round(BASE_LADDER[i][0] * mult);
  });
  // the themed rungs and the aura ride the same scale, or the two shelves disagree
  loot.RACK_POOLS.forEach((rung, i) => { rung[0] = Math.round(BASE_POOLS[i] * mult); });
  loot.RACK_AURA.coin = Math.round(BASE_AURA * mult);
}

/* WHAT THE PLAYER CAN ACTUALLY BUY, at today's ladder or a scaled one. Counted
   here rather than read off `cosmetics`, because ownedCosmeticIds() unions
   PURCHASES with CRATE DROPS and the two answer different questions. */
const catalogueCost = () => loot.RACK_ROTATE_POOL
  .reduce((s, id) => s + loot.RACK_RARITY_PRICE[BH_BY_ID[id].rarity][0], 0) + loot.RACK_AURA.coin;

/* ---------------- one run ---------------- */
async function run({ rules, depth, seed, days, priceMult, ladder }) {
  RAND = mulberry32(seed);
  const r = () => RAND();
  const prof = DEPTHS[depth];
  const overlay = applyOverlay(rules);
  applyPrices(priceMult ?? 1, ladder);

  useDbName(`faucet-${rules}-${depth}-${seed}-${Date.now()}`);
  await db.clear('kv'); await db.clear('xp'); await db.clear('inv'); await db.clear('log');

  const START = RealDate.parse('2031-01-01T09:00:00');
  const targets = { kcal: 2200, p: 140 };

  const income = { health: 0, crate: 0, pit: 0, level: 0 };
  let spent = 0, windowsOwned = new Set(), outOfThings = null, firstWindowDay = null;
  const ownedWindowPieces = new Set();
  let prevCoins = 0, prevLevelCoins = 0;
  /* THE RACK PATH HAD NO out-of-things DETECTOR AT ALL: `outOfThings` was only
     ever written in the windows branch, so every `today` row printed null and
     the day a rack player runs dry was never measured. `bought` is counted
     separately from `cosmetics` because ownedCosmeticIds() unions purchases
     with CRATE DROPS, and a catalogue that arrives free in crates is not a
     catalogue a price can pace. */
  const boughtIds = new Set();
  let firstBuyDay = null;
  const snaps = {};
  const SNAP_DAYS = [30, 90, 180, 365];

  for (let d = 0; d < days; d++) {
    setNow(START + d * DAY_MS);
    const key = dateKey();
    await dbm.witnessServerDay(NOW);          // a player with a network gets this free

    // 1. boot: settle yesterday (day-close Bone Crate lives here)
    await g.awardDayCloseIfDue(targets);

    // 2. the day's food log
    if (r() < prof.logDays) {
      const on = r() < prof.onBudget;
      const kcal = on ? Math.round(targets.kcal * (0.65 + r() * 0.32)) : Math.round(targets.kcal * (1.05 + r() * 0.35));
      for (let meal = 0; meal < 3; meal++) {
        await db.put('log', {
          id: dbm.newId(), date: key, meal, ts: NOW,
          foodId: null, name: 'sim meal', kcal: Math.round(kcal / 3),
          p: Math.round(targets.p / 3), c: 60, f: 20,
        });
      }
    }

    // 3. health sync: the real payout function
    const before = await loot.coins();
    await g.onHealthSync(key, prof.health(r));
    income.health += (await loot.coins()) - before;

    // 4. open every crate the day produced
    const crates = (await db.all('inv')).filter(x => x.kind === 'crate');
    for (const c of crates) {
      const b = await loot.coins();
      const kind = c.crate;
      try { await loot.openCrate(c.id); } catch (e) { throw new Error(`openCrate threw on ${rules}/${depth}/${seed} day ${d}: ${e.message}`); }
      income.crate += (await loot.coins()) - b;
      const dr = OVERLAY_DUST[rules]?.[kind];
      if (dr) await loot.boneDustAdd(Math.round(dr[0] + r() * (dr[1] - dr[0])));
    }

    // 5. the Pit (modelled, identical across rule sets)
    const lvl = g.levelFor(await g.totalXp()).level;
    const pit = pitCoinsFor(lvl, prof.pitFights);
    if (pit) { await loot.coinsAdd(pit); income.pit += pit; }

    // 6. spend
    if (rules === 'today') {
      spent += await shopRack(r, boughtIds);
      if (firstBuyDay === null && boughtIds.size) firstBuyDay = d + 1;   // 1-based: "day 1" is their first day
      /* out of things = every purchasable piece is OWNED, however it arrived.
         RACK_ROTATE_POOL is the whole coin-buyable catalogue (the themed nine
         are drawn from the same art), so owning all of it is the shelf going
         empty for this player. */
      if (outOfThings === null) {
        const owned = await loot.ownedCosmeticIds();
        if (loot.RACK_ROTATE_POOL.every(id => owned.has(id))) outOfThings = d;
      }
    } else {
      const week = Math.floor(d / 7) + 1;
      const res = await shopWindows(week, windowsOwned, ownedWindowPieces);
      spent += res.spent;
      if (res.bought && firstWindowDay === null) firstWindowDay = d;
      const released = WINDOWS.filter(w => w[0] <= week).length;
      if (outOfThings === null && windowsOwned.size === released && released > 0) outOfThings = d;
    }

    if (SNAP_DAYS.includes(d + 1)) {
      snaps[d + 1] = {
        wallet: await loot.coins(), spent, bought: boughtIds.size,
        owned: (await loot.ownedCosmeticIds()).size + ownedWindowPieces.size,
      };
    }
  }

  // level coins are minted inside award(); back them out of `health` for the split
  const levelRows = (await db.all('xp')).filter(x => x.key.startsWith('levelpaid-'));
  for (const row of levelRows) income.level += g.levelCoins(Number(row.key.split('-')[1]));
  income.health -= income.level;

  const wallet = await loot.coins();
  const total = income.health + income.crate + income.pit + income.level;
  const cosmetics = (await loot.ownedCosmeticIds()).size + ownedWindowPieces.size;
  const gear = (await loot.ownedGearIds()).size;

  return {
    rules, depth, seed, days,
    priceMult: priceMult ?? 1,
    ladder: RARITY_KEYS.map(k => loot.RACK_RARITY_PRICE[k][0]),
    catalogueCost: catalogueCost(),
    bought: boughtIds.size,
    firstBuyDay,
    snaps,
    coinsPerDay: +(total / days).toFixed(1),
    pitPerDay: +(income.pit / days).toFixed(1),
    cratePerDay: +(income.crate / days).toFixed(1),
    healthPerDay: +(income.health / days).toFixed(1),
    levelPerDay: +(income.level / days).toFixed(1),
    level: g.levelFor(await g.totalXp()).level,
    cosmetics, gear,
    dust: await loot.boneDust(),
    wallet, spent,
    windowsDone: rules === 'today' ? 0 : windowsOwned.size,
    dayOutOfThings: outOfThings,
    firstWindowDay,
    crateCoinRanges: overlay.crateCoins,
  };
}

/* TODAY's sink: the Rack. 21 tiles a day (9 themed weekly + 12 rotating daily),
   drawn from the shipped RACK_ROTATE_POOL and priced by RACK_RARITY_PRICE.
   The player buys everything unowned they can afford, cheapest first, which is
   the most generous read and so the one that makes an idle wallet hardest to
   claim. */
async function shopRack(r, boughtIds) {
  const owned = await loot.ownedCosmeticIds();
  const pool = loot.RACK_ROTATE_POOL;
  const offers = [];
  for (let i = 0; i < 21; i++) {
    const id = pool[Math.floor(r() * pool.length)];
    if (owned.has(id) || offers.some(o => o.id === id)) continue;
    const it = BH_ITEMS.find(x => x.id === id);
    const price = loot.RACK_RARITY_PRICE[it?.rarity]?.[0];
    if (price) offers.push({ id, price });
  }
  offers.sort((a, b) => a.price - b.price);
  let spent = 0;
  for (const o of offers) {
    if ((await loot.spendCoins(o.price)) === null) break;
    await loot.grantCosmetic(o.id, 'rack');
    boughtIds.add(o.id);
    spent += o.price;
  }
  return spent;
}

/* FIFTH's sink: the windows. Cheapest released unowned set first, set price
   (already the 25% bundle), pieces counted as owned art. */
async function shopWindows(week, owned, pieces) {
  let spent = 0, bought = false;
  for (;;) {
    const next = WINDOWS
      .filter(w => w[0] <= week && !owned.has(w[1]))
      .sort((a, b) => a[3] - b[3])[0];
    if (!next) break;
    if ((await loot.spendCoins(next[3])) === null) break;
    owned.add(next[1]); spent += next[3]; bought = true;
    for (let i = 0; i < next[2]; i++) pieces.add(`${next[1]}#${i}`);
  }
  return { spent, bought };
}

/* ---------------- main ---------------- */
const argv = process.argv.slice(2);
const arg = (k, dflt) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : dflt; };
const days = Number(arg('days', 365));
const seeds = arg('seeds', '11,23,47').split(',').map(Number);
const ruleSets = arg('rules', 'today,fifth,fifth-half').split(',');
const depths = arg('depths', 'light,committed,heavy').split(',');
const outDir = arg('out', null);
/* --price-mults 1,2 runs the SAME rule set at two ladders in one process, which
   is the only comparison this file's own caveat licenses. --ladder overrides
   the multiplier with five explicit coin prices. */
const priceMults = arg('price-mults', '1').split(',').map(Number);
const ladderArg = arg('ladder', null);
const ladder = ladderArg ? ladderArg.split(',').map(Number) : null;

const rows = [];
for (const rules of ruleSets) for (const priceMult of priceMults) for (const depth of depths) for (const seed of seeds) {
  const t0 = RealDate.now();
  const row = await run({ rules, depth, seed, days, priceMult, ladder: priceMult === 1 && !ladderArg ? null : ladder });
  row.ms = RealDate.now() - t0;
  rows.push(row);
  process.stderr.write(`${rules}/x${priceMult}/${depth}/${seed}  ${row.coinsPerDay}/day  wallet ${row.wallet}  bought ${row.bought}  out ${row.dayOutOfThings}  (${row.ms}ms)\n`);
}

const head = ['scenario', 'ladder', 'catalogue', 'depth', 'seed', 'coins/day', 'of which pit', 'level', 'bought', 'cosmetics', 'gear', 'dust', 'wallet d365', 'windows done', 'day out of things', 'first buy day', 'first window day'];
const line = r => [r.rules, r.ladder.join('/'), r.catalogueCost, r.depth, r.seed, r.coinsPerDay, r.pitPerDay, r.level, r.bought, r.cosmetics, r.gear, r.dust, r.wallet, r.windowsDone, r.dayOutOfThings, r.firstBuyDay, r.firstWindowDay];
console.log('| ' + head.join(' | ') + ' |');
console.log('|' + head.map(() => '---').join('|') + '|');
for (const r of rows) console.log('| ' + line(r).join(' | ') + ' |');

console.log('\nAffordability: pieces BOUGHT / coins spent / wallet, at day 30, 90, 180, 365');
console.log('| scenario | ladder | depth | seed | ' + [30, 90, 180, 365].map(d => `d${d} bought | d${d} spent | d${d} wallet`).join(' | ') + ' |');
console.log('|' + Array(4 + 12).fill('---').join('|') + '|');
for (const r of rows) {
  console.log('| ' + [r.rules, r.ladder.join('/'), r.depth, r.seed,
    ...[30, 90, 180, 365].flatMap(d => { const s = r.snaps[d] || {}; return [s.bought ?? '', s.spent ?? '', s.wallet ?? '']; })].join(' | ') + ' |');
}

console.log('\nIncome split (coins/day): scenario depth seed  health crate pit level');
for (const r of rows) console.log(`  ${r.rules} ${r.depth} ${r.seed}  ${r.healthPerDay} ${r.cratePerDay} ${r.pitPerDay} ${r.levelPerDay}   crate ranges ${JSON.stringify(r.crateCoinRanges)}`);

if (outDir) {
  const fs = await import('node:fs');
  fs.mkdirSync(outDir, { recursive: true });
  for (const r of rows) fs.writeFileSync(`${outDir}/${r.rules}-${r.depth}-${r.seed}.json`, JSON.stringify(r, null, 2));
  fs.writeFileSync(`${outDir}/all.json`, JSON.stringify(rows, null, 2));
}
