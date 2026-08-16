/* THE GARDEN SIM. A balance instrument, not a pass/fail test. Same job as
 * tests/fight-sim.mjs, and written against the same rule: balance here is
 * MEASURED, never reasoned from code.
 *
 * WHY IT EXISTS. Three design documents in a row argued garden throughput in
 * prose arithmetic, and prose arithmetic cannot see the thing that actually
 * throttles this loop. The garden and the kitchen are BOTH gated on how often
 * the app is opened, and the measured real cadence is 0.76 opens per device per
 * day. One open per day is the median player, not an edge case.
 *
 * WHAT IT MEASURES, per cadence x beds x pots: ingredients the garden PRODUCES
 * per day against ingredients the player can actually SPEND at the fight rate
 * the game grants (energy.js: FREE_FIGHTS free fights a day), plus the fraction
 * of fights that got to run with a food buff up, which is the player-facing
 * number the whole loop exists to move.
 *
 * The model is per-ingredient, not a generic "ingredient" scalar, because
 * composting only ever returns seeds of the thing you composted: the garden
 * amplifies the pantry you already have and can never convert Marrow into Grave
 * Salt. A scalar model hides that, and it is half the reason the garden feels
 * like it produces more than you can use.
 *
 * Usage:
 *   node tests/garden-sim.mjs               # the standard board + the lever table
 *   node tests/garden-sim.mjs --walk 0      # garden-only, no map income
 *   node tests/garden-sim.mjs --days 90
 */
import { pathToFileURL } from 'node:url';
import { RECIPES, POTIONS, COMMON_INGREDIENT_IDS } from '../js/cooking.js';
import {
  HARVEST_BASE, BUMPER_CHANCE, COMPOSTS_PER_DAY, SEED_ODDS,
  GROW_MIN, PLOTS_FREE, PLOTS_MAX, SPAWN_SEED_CHANCE,
} from '../js/garden.js';
import { FREE_FIGHTS } from '../js/energy.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const DAYS = arg('--days', 30);
const WALK = arg('--walk', 2);   // ingredients collected off the map per app open
const SEEDS_RUNS = arg('--runs', 60);

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rollSeedsWith = rnd => { const x = rnd(); let a = 0; for (let i = 0; i < SEED_ODDS.length; i++) { a += SEED_ODDS[i]; if (x < a) return i + 1; } return SEED_ODDS.length; };

/* Only combat dishes are a real sink: the coins dish is bought on a clock, not
   on a fight rate, and the rare-gated ones are fed by Ectoplasm which the garden
   deliberately cannot grow into (spores come off rare map finds only). */
const isCommonOnly = r => Object.keys(r.needs).every(id => COMMON_INGREDIENT_IDS.includes(id));
const cost = r => Object.values(r.needs).reduce((a, n) => a + n, 0);
const combatDishes = list => list.filter(r => r.buff?.kind === 'combat' && isCommonOnly(r));

/* ---------- one player, DAYS days ---------- */
/* `queue` is lever 5: how many cooks one visit can line up behind a single pot.
   Modelled as pots x queue parallel slots. ponytail: that is exact at 1 to 2 opens
   a day (24h and 12h gaps dwarf a 15 to 120 minute cook, so sequential and
   parallel finish in the same visit anyway) and slightly generous at 4 opens a
   day. Model a real per-pot FIFO if the 4-open row ever becomes the decision. */
function run({ opens, beds, pots, recipes, potions = [], stack = false, waters = true, queue = 1, compostPolicy = 'abundant', fightsPerDay = FREE_FIGHTS, walk = WALK, seed = 1 }) {
  const rnd = mulberry32(seed * 7919);
  const dishes = combatDishes(recipes);
  const brews = potions.filter(isCommonOnly);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];

  const inv = {};                       // ingredients
  const pouch = {};                     // seeds
  const plots = new Array(beds).fill(null);
  const pans = new Array(pots * queue).fill(null);
  const pantry = [];                    // cooked dishes waiting to be eaten
  let buffs = [];                       // { id, fightsLeft }
  let potionsHeld = 0;

  let harvested = 0, composted = 0, cooked = 0, spent = 0, walked = 0, blocked = 0;
  let fights = 0, buffedFights = 0;

  const WAKE = 7 * 60, WINDOW = 16 * 60;          // opens sit inside a 16h waking day
  const openTimes = Array.from({ length: opens }, (_, i) => WAKE + Math.round(i * WINDOW / opens));
  const total = id => id ? (inv[id] || 0) : Object.values(inv).reduce((a, n) => a + n, 0);
  const seedTotal = () => Object.values(pouch).reduce((a, n) => a + n, 0);

  for (let day = 0; day < DAYS; day++) {
    let compostsLeft = COMPOSTS_PER_DAY;
    // the fights the day's energy grants, split across the opens the player makes
    const perOpen = Array.from({ length: opens }, (_, i) => Math.floor(fightsPerDay / opens) + (i < fightsPerDay % opens ? 1 : 0));

    openTimes.forEach((mins, oi) => {
      const now = day * 1440 + mins;

      // 1. the map pays first: walking is where ingredients and seeds come from
      for (let i = 0; i < walk; i++) {
        const id = pick(COMMON_INGREDIENT_IDS);
        inv[id] = (inv[id] || 0) + 1; walked++;
        if (rnd() < SPAWN_SEED_CHANCE) pouch[id] = (pouch[id] || 0) + 1;
      }

      // 2. harvest
      plots.forEach((p, i) => {
        if (!p || now < p.readyAt) return;
        const n = HARVEST_BASE + (p.watered ? 1 : 0) + (rnd() < BUMPER_CHANCE ? 1 : 0);
        inv[p.ing] = (inv[p.ing] || 0) + n; harvested += n;
        plots[i] = null;
      });

      // 3. compost only what we can plant, and only from the pile we are richest
      //    in: seeds you cannot put in the ground are a wasted ingredient
      const want = {};
      for (const r of [...dishes, ...brews]) for (const [id, n] of Object.entries(r.needs)) want[id] = (want[id] || 0) + n;
      const freeBeds = () => plots.filter(p => !p).length;
      while (compostsLeft > 0 && seedTotal() < freeBeds()) {
        /* WHICH ingredient goes on the heap decides the shape of everything
           downstream, because composting only ever returns seeds of the SAME
           species. 'abundant' is the obvious play (compost your spare) and it
           compounds a monoculture. 'needed' is the expert play: compost the thing
           the cookbook is shortest of, which only works while you still hold one. */
        const order = COMMON_INGREDIENT_IDS.slice();
        if (compostPolicy === 'needed') order.sort((a, b) => ((want[b] || 0) - total(b)) - ((want[a] || 0) - total(a)));
        else order.sort((a, b) => total(b) - total(a));
        const id = order.find(x => total(x) >= 4);  // keep a working pantry back
        if (!id) break;
        inv[id] -= 1; composted++; compostsLeft--;
        pouch[id] = (pouch[id] || 0) + rollSeedsWith(rnd);
      }

      // 4. plant the thing the cookbook is shortest of, out of what we hold
      while (plots.some(p => !p) && seedTotal() > 0) {
        const held = Object.keys(pouch).filter(id => pouch[id] > 0);
        held.sort((a, b) => ((want[b] || 0) - total(b)) - ((want[a] || 0) - total(a)));
        const id = held[0];
        pouch[id] -= 1; if (!pouch[id]) delete pouch[id];
        plots[plots.indexOf(null)] = { ing: id, readyAt: now + GROW_MIN, watered: false };
      }

      /* 4b. WATER, AFTER PLANTING, because that is the real affordance. plantSeed
         leaves watered:false and the sheet re-renders on the spot, so the bed the
         player just filled comes back as a tappable "needs water" bed in the SAME
         visit. Watering before planting (the intuitive order) models a bug that
         does not exist and understates the garden by a third. `waters` is the
         switch so the cost of NOT knowing about the tap can be measured. */
      if (waters) plots.forEach(p => { if (p && now < p.readyAt && !p.watered) p.watered = true; });

      // 5. the pots: collect what is done, then start what we can afford
      pans.forEach((c, i) => {
        if (!c || now < c.readyAt) return;
        if (c.potion) potionsHeld++; else pantry.push({ id: c.id, fights: c.fights });
        pans[i] = null;
      });
      // eat first, so the cook decision sees the coverage we actually have
      if (stack) { while (pantry.length) { const d = pantry.shift(); buffs = buffs.filter(b => b.id !== d.id).concat({ id: d.id, fightsLeft: d.fights }); } }
      else if (!buffs.length && pantry.length) { const d = pantry.shift(); buffs = [{ id: d.id, fightsLeft: d.fights }]; }

      const afford = r => Object.entries(r.needs).every(([id, n]) => total(id) >= n);
      const pay = r => { for (const [id, n] of Object.entries(r.needs)) { inv[id] -= n; spent += n; } cooked++; };
      for (let i = 0; i < pans.length; i++) {
        if (pans[i]) continue;
        // a rational player cooks toward coverage, not toward a hoard: one buff
        // running under the single policy, every distinct dish under the stack
        // policy, and never more than a day of spare charges in the pantry.
        const held = new Set([...buffs.map(b => b.id), ...pantry.map(d => d.id), ...pans.filter(Boolean).map(c => c.id)]);
        let r = null;
        if (stack) r = dishes.filter(d => !held.has(d.id) && afford(d)).sort((a, b) => cost(a) - cost(b))[0];
        else {
          const cover = buffs.reduce((a, b) => a + b.fightsLeft, 0) + pantry.reduce((a, d) => a + d.fights, 0)
            + pans.filter(Boolean).reduce((a, c) => a + (c.fights || 0), 0);
          if (cover < fightsPerDay) r = dishes.filter(afford).sort((a, b) => cost(a) / a.buff.fights - cost(b) / b.buff.fights)[0];
        }
        // potions are a second sink and are only brewed once the dishes are set
        if (!r && brews.length) r = brews.filter(afford).sort((a, b) => cost(a) - cost(b))[0];
        // a cook the player WANTED but could not pay for. Tracked separately from
        // "nothing left to cook": a blocked pot with a full larder is a different
        // failure from a satisfied one, and prose arithmetic cannot tell them apart.
        if (!r) {
          const wanted = stack ? dishes.some(d => !held.has(d.id)) : true;
          if (wanted && total() >= 6) blocked++;
          break;
        }
        pay(r);
        pans[i] = { id: r.id, potion: !!r.potion, fights: r.buff?.fights || 0, readyAt: now + r.cookMin };
      }

      // 6. fight
      for (let f = 0; f < perOpen[oi]; f++) {
        fights++;
        if (buffs.length) buffedFights++;
        buffs = buffs.map(b => ({ ...b, fightsLeft: b.fightsLeft - 1 })).filter(b => b.fightsLeft > 0);
        if (!buffs.length && pantry.length) { const d = pantry.shift(); buffs = [{ id: d.id, fightsLeft: d.fights }]; }
      }
    });
  }

  return {
    produced: (harvested - composted) / DAYS,      // the garden's NET output per day
    harvested: harvested / DAYS,
    walked: walked / DAYS,
    spent: spent / DAYS,                            // ingredients the kitchen actually ate
    cooked: cooked / DAYS,
    surplus: (harvested - composted + walked) / DAYS - spent / DAYS,
    stock: Object.values(inv).reduce((a, n) => a + n, 0),
    buffed: fights ? buffedFights / fights : 0,
    potions: potionsHeld,
    // the SHAPE of the leftovers, which is the whole question a scalar model hides
    blocked: blocked / DAYS,
    thinnest: Math.min(...COMMON_INGREDIENT_IDS.map(id => inv[id] || 0)),
    fattest: Math.max(...COMMON_INGREDIENT_IDS.map(id => inv[id] || 0)),
    fights,
  };
}

// average the runs: one seed's bumper luck is not a balance finding
export function measure(cfg) {
  const rows = Array.from({ length: SEEDS_RUNS }, (_, i) => run({ ...cfg, seed: i + 1 }));
  const avg = k => rows.reduce((a, r) => a + r[k], 0) / rows.length;
  return Object.fromEntries(Object.keys(rows[0]).map(k => [k, avg(k)]));
}

/* The demand ceiling in closed form, for cross-checking the sim: what the fight
   rate could absorb if pots and cadence were free. If the sim's spend sits far
   under this, the recipes are not the constraint. */
export function demandCeiling(recipes, { stack = false, fightsPerDay = FREE_FIGHTS } = {}) {
  const d = combatDishes(recipes);
  if (!d.length) return 0;
  const per = stack
    ? d.reduce((a, r) => a + cost(r) / r.buff.fights, 0)
    : Math.min(...d.map(r => cost(r) / r.buff.fights));
  return per * fightsPerDay;
}

/* ---------- the four levers, as data transforms ---------- */
const scaleNeeds = (list, k) => list.map(r => ({ ...r, needs: Object.fromEntries(Object.entries(r.needs).map(([id, n]) => [id, Math.ceil(n * k)])) }));
const oneFightDishes = list => list.map(r => r.buff?.kind === 'combat' ? { ...r, buff: { ...r.buff, fights: 1 } } : r);
export const BANQUET = [
  { id: 'sim-banquet', name: 'banquet tier A', needs: { marrow: 2, graveroot: 2, salt: 1, bog: 1 }, cookMin: 90, buff: { kind: 'combat', damagePct: 0.20, hype: 20, fights: 3 } },
  { id: 'sim-cauldron', name: 'banquet tier B', needs: { sinew: 2, ember: 2, bog: 2, salt: 1 }, cookMin: 90, buff: { kind: 'combat', damagePct: 0.18, regenPct: 0.08, fights: 3 } },
];
export const LEVERS = {
  'as shipped':            { recipes: RECIPES, potions: [] },
  '1. needs x2':           { recipes: scaleNeeds(RECIPES, 2), potions: [] },
  '2. dish = 1 fight':     { recipes: oneFightDishes(RECIPES), potions: [] },
  '3. banquet tier (6-8)': { recipes: [...RECIPES, ...BANQUET], potions: [] },
  '4. potions on':         { recipes: RECIPES, potions: POTIONS },
  '1+2 together':          { recipes: oneFightDishes(scaleNeeds(RECIPES, 2)), potions: [] },
  '3+4 together':          { recipes: [...RECIPES, ...BANQUET], potions: POTIONS },
  '5. cook queue x3':      { recipes: RECIPES, potions: [], queue: 3 },
  '3+4+queue':             { recipes: [...RECIPES, ...BANQUET], potions: POTIONS, queue: 3 },
};

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const pad = (s, n) => String(s).padEnd(n);
  const pc = x => (x * 100).toFixed(0) + '%';
  console.log(`garden-sim: ${DAYS} days x ${SEEDS_RUNS} runs, ${WALK} map ingredient(s) per app open, ${FREE_FIGHTS} free fights/day`);
  console.log('produced = garden harvest net of what was composted. spent = ingredients the kitchen ate.\n');

  console.log('== AS SHIPPED, one buff at a time (the honest median policy) ==');
  console.log(pad('opens/day', 11) + pad('beds', 6) + pad('pots', 6) + pad('produced', 10) + pad('walk in', 9) + pad('spent', 8) + pad('surplus', 9) + pad('buffed fights', 15) + 'stockpile d30');
  console.log('-'.repeat(90));
  for (const opens of [1, 2, 4]) for (const beds of [PLOTS_FREE, PLOTS_MAX]) for (const pots of [1, 3]) {
    const r = measure({ opens, beds, pots, ...LEVERS['as shipped'] });
    console.log(pad(opens, 11) + pad(beds, 6) + pad(pots, 6) + pad(r.produced.toFixed(1), 10) + pad(r.walked.toFixed(1), 9)
      + pad(r.spent.toFixed(1), 8) + pad(r.surplus.toFixed(1), 9) + pad(pc(r.buffed), 15) + r.stock.toFixed(0));
  }
  console.log(`\ndemand ceiling if pots and cadence were free: ${demandCeiling(RECIPES).toFixed(1)} ingredients/day (single buff), ` +
    `${demandCeiling(RECIPES, { stack: true }).toFixed(1)} (stacking every dish)`);

  console.log('\n== THE SAME BOARD, stacking every dish (the maximising player) ==');
  console.log(pad('opens/day', 11) + pad('beds', 6) + pad('pots', 6) + pad('produced', 10) + pad('spent', 8) + pad('surplus', 9) + 'buffed fights');
  console.log('-'.repeat(66));
  for (const opens of [1, 2, 4]) for (const beds of [PLOTS_FREE, PLOTS_MAX]) for (const pots of [1, 3]) {
    const r = measure({ opens, beds, pots, stack: true, ...LEVERS['as shipped'] });
    console.log(pad(opens, 11) + pad(beds, 6) + pad(pots, 6) + pad(r.produced.toFixed(1), 10) + pad(r.spent.toFixed(1), 8) + pad(r.surplus.toFixed(1), 9) + pc(r.buffed));
  }

  console.log('\n== THE FOUR LEVERS, at the median player (1 open/day, 3 beds, 1 pot), stacking ==');
  console.log(pad('lever', 24) + pad('produced', 10) + pad('spent', 8) + pad('surplus', 9) + pad('buffed fights', 15) + 'stockpile d30');
  console.log('-'.repeat(75));
  for (const [name, cfg] of Object.entries(LEVERS)) {
    const r = measure({ opens: 1, beds: PLOTS_FREE, pots: 1, stack: true, ...cfg });
    console.log(pad(name, 24) + pad(r.produced.toFixed(1), 10) + pad(r.spent.toFixed(1), 8) + pad(r.surplus.toFixed(1), 9) + pad(pc(r.buffed), 15) + r.stock.toFixed(0));
  }

  console.log('\n== THE SAME LEVERS AT A HEAVY CADENCE (4 opens/day, 5 beds, 3 pots), stacking ==');
  console.log(pad('lever', 24) + pad('produced', 10) + pad('spent', 8) + pad('surplus', 9) + pad('buffed fights', 15) + 'stockpile d30');
  console.log('-'.repeat(75));
  for (const [name, cfg] of Object.entries(LEVERS)) {
    const r = measure({ opens: 4, beds: PLOTS_MAX, pots: 3, stack: true, ...cfg });
    console.log(pad(name, 24) + pad(r.produced.toFixed(1), 10) + pad(r.spent.toFixed(1), 8) + pad(r.surplus.toFixed(1), 9) + pad(pc(r.buffed), 15) + r.stock.toFixed(0));
  }

  console.log('\n== IS THE SURPLUS THE WRONG SIZE, OR THE WRONG SHAPE? (stacking) ==');
  console.log(pad('opens/day', 11) + pad('beds', 6) + pad('stock d30', 11) + pad('fattest', 9) + pad('thinnest', 10) + 'pots blocked with a full larder /day');
  console.log('-'.repeat(83));
  for (const opens of [1, 2, 4]) for (const beds of [PLOTS_FREE, PLOTS_MAX]) {
    const r = measure({ opens, beds, pots: 1, stack: true, ...LEVERS['as shipped'] });
    console.log(pad(opens, 11) + pad(beds, 6) + pad(r.stock.toFixed(0), 11) + pad(r.fattest.toFixed(0), 9) + pad(r.thinnest.toFixed(1), 10) + r.blocked.toFixed(2));
  }

  console.log('\n== DOES COMPOSTING THE THING YOU NEED FIX THE SHAPE? (stacking, 1 pot) ==');
  console.log(pad('opens/day', 11) + pad('beds', 6) + pad('compost', 11) + pad('spent', 8) + pad('fattest', 9) + pad('thinnest', 10) + 'buffed fights');
  console.log('-'.repeat(70));
  for (const opens of [1, 4]) for (const beds of [PLOTS_FREE, PLOTS_MAX]) for (const compostPolicy of ['abundant', 'needed']) {
    const r = measure({ opens, beds, pots: 1, stack: true, compostPolicy, ...LEVERS['as shipped'] });
    console.log(pad(opens, 11) + pad(beds, 6) + pad(compostPolicy, 11) + pad(r.spent.toFixed(1), 8) + pad(r.fattest.toFixed(0), 9) + pad(r.thinnest.toFixed(1), 10) + pc(r.buffed));
  }

  /* ONE VARIABLE AT A TIME, off the shipped baseline, at the median cadence.
     This is the table that decides the recommendation: every row is the same
     player with exactly one thing changed, so the column IS the lever. */
  console.log('\n== ONE VARIABLE AT A TIME, median player (1 open/day, 3 beds, 1 pot), stacking ==');
  const BASE = { opens: 1, beds: PLOTS_FREE, pots: 1, stack: true, ...LEVERS['as shipped'] };
  const VARIANTS = [
    ['shipped baseline', {}],
    ['+ compost what you need', { compostPolicy: 'needed' }],
    ['+ 3 pots (buyable now)', { pots: 3 }],
    ['+ cook queue x3', { queue: 3 }],
    ['+ queue x3 & smart compost', { queue: 3, compostPolicy: 'needed' }],
    ['+ 9 fights/day (walker)', { fightsPerDay: 9 }],
    ['+ 9 fights & 3 pots', { fightsPerDay: 9, pots: 3 }],
    ['+ 9 fights, 3 pots, smart', { fightsPerDay: 9, pots: 3, compostPolicy: 'needed' }],
    ['+ all of the above & lvr3+4', { fightsPerDay: 9, pots: 3, compostPolicy: 'needed', queue: 3, recipes: [...RECIPES, ...BANQUET], potions: POTIONS }],
  ];
  console.log(pad('variant', 29) + pad('produced', 10) + pad('spent', 8) + pad('surplus', 9) + pad('buffed fights', 15) + 'stockpile d30');
  console.log('-'.repeat(80));
  for (const [name, v] of VARIANTS) {
    const r = measure({ ...BASE, ...v });
    console.log(pad(name, 29) + pad(r.produced.toFixed(1), 10) + pad(r.spent.toFixed(1), 8) + pad(r.surplus.toFixed(1), 9) + pad(pc(r.buffed), 15) + r.stock.toFixed(0));
  }

  console.log('\n== WATERING: what the +1 is worth, and whether a 1-open player can reach it ==');
  console.log(pad('opens/day', 11) + pad('waters', 9) + pad('produced', 10) + pad('buffed fights', 15) + 'stockpile d30');
  console.log('-'.repeat(58));
  for (const opens of [1, 2, 4]) for (const waters of [true, false]) {
    const r = measure({ opens, beds: PLOTS_FREE, pots: 1, stack: true, waters, ...LEVERS['as shipped'] });
    console.log(pad(opens, 11) + pad(waters ? 'yes' : 'no', 9) + pad(r.produced.toFixed(1), 10) + pad(pc(r.buffed), 15) + r.stock.toFixed(0));
  }
  console.log('  A bed is waterable from the instant it is planted (gardenState.canWater is');
  console.log('  !ready && !watered, and the sheet re-renders after plantSeed), so the 1-open');
  console.log('  player CAN take the +1 on the planting visit. The gap above is the cost of');
  console.log('  not knowing that, not the cost of a window nobody can hit.');
}
