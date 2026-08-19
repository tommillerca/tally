/* THE BONEYARD SUPPLY GUARD. Pins the Stage 1 change from ROADMAP.md
 * ("The Hollow and the Bone Garden are COMING OUT", 2026-08-18): the map, not
 * the garden, feeds the Kitchen, and it got denser without opening the faucet.
 *
 * Tom, 2026-08-18: "ingredients are found out in the boneyard", "add more coins
 * and small things to the bone yard and then decrease the amount each one gives
 * so it evens out and doesnt blow the economy", "splitting up the amount of food
 * items and gold would help us curb that and make the boneyard seem more full."
 *
 * WHICH DIRECTION IS FAILURE, per anti-regression rule 11, because three of
 * these can fail in either direction and only one direction is the bug:
 *   - coins and XP per cell: failure is UP. These are ratchets. v400 sits
 *     exactly ON the ceiling, so this half of the guard is green on main by
 *     design; it exists to stop the next change re-inflating the faucet.
 *   - ingredients per cell: failure is DOWN. The garden is coming out, so the
 *     map has to carry the Kitchen on its own.
 *   - the share of spawns carrying food: failure is UP, back toward 1.0, which
 *     is what re-couples supply to density and re-creates the oversupply the
 *     garden had.
 *   - viewport density: failure is DOWN (a map that reads empty), and it has a
 *     CEILING as well as a floor, because every spawn is a live DOM marker and
 *     an unbounded count is the lb-memory failure with a different name.
 *
 * MEASURED, not chosen. Every pinned number below was measured off the tree it
 * describes with scratchpad supply-sim.mjs and the same sampling this file does.
 *
 *   per cell            v400 (main)   this branch
 *   spawns .............. 2.00 ....... 5.00
 *   coins (incl crate) .. 46.54 ...... 41.46   0.89x
 *   XP .................. 53.98 ...... 52.13   0.97x
 *   ingredients ......... 2.00 ....... 2.93    1.46x
 *   spawns carrying food  100% ....... 37%
 *   in a 440px viewport . 4.2 ........ 10.2
 *
 * PROVE-RED: run this file against pristine origin/main. Six rows go red (the
 * Herb patch still pays seeds, no type carries 2 food, the field is half as
 * dense, ingredients per cell has not risen, food is still on every spawn, and
 * the food spawn's drop mix ignores the cookbook).
 *
 * Usage: node tests/boneyard-supply-audit.mjs      (exits non-zero on failure)
 */
import * as hunt from '../js/hunt.js';
import * as cook from '../js/cooking.js';
import { MAP_START_ZOOM } from '../js/map.js';

let bad = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  ' + detail : ''}`);
  if (!ok) bad++;
};

const { SPAWN_TYPES, spawnsForCell, distanceM } = hunt;
const SPAWN_FOOD = cook.SPAWN_FOOD || {};
const CELL_DEG = 0.005;
const LAT = 49.28, LNG = -123.12;   // Vancouver, the latitude everything was measured at
/* A Common Crate's coins are uniform[20,40] with dupe conversion on top once a
   collection saturates; 56 is the saturated end (js/loot.js CRATES.daily), which
   is the expensive end and therefore the honest one for a faucet ceiling. */
const CRATE_COINS = 56;

/* ---- the sample. The REAL generator over a real grid, not a model of it. ---- */
const CELLS = 200;
let cells = 0, spawns = 0, coinSum = 0, xpSum = 0, foodSum = 0, carrying = 0;
const foodMix = {}, foodSpawnMix = {};
let foodSpawnDrops = 0;
/* The food spawn is whichever non-rare type carries the most food, tie-broken to
   the type that pays neither coins nor a crate, because that is what a food spawn
   IS. Derived rather than named so renaming or replacing the Herb patch cannot
   quietly retire this guard, and so the tie on a tree where nothing declares food
   still resolves to the right type instead of the first key in the object. */
const unthemed = t => !cook.SPAWN_INGREDIENTS[t];   // the one type with no two-ingredient theme pool
const FOOD_TYPE = Object.keys(SPAWN_TYPES)
  .filter(t => t !== 'rare')
  .sort((a, b) => (SPAWN_FOOD[b] ?? 1) - (SPAWN_FOOD[a] ?? 1) || (unthemed(b) - unthemed(a)))[0];

for (let cx = 0; cx < CELLS; cx++) for (let cy = 0; cy < CELLS; cy++) {
  cells++;
  for (const s of spawnsForCell('2026-08-18', cx, cy, 600)) {
    // rares are placed on their own instance at a rate this change never touched,
    // so they are excluded from the faucet numbers rather than diluting them
    if (s.type === 'rare') continue;
    const def = SPAWN_TYPES[s.type];
    spawns++;
    coinSum += (def.coins || 0) + (def.crate ? CRATE_COINS : 0);
    xpSum += def.xp || 15;
    const drop = cook.spawnIngredient(s);
    const n = drop && drop.n != null ? drop.n : 1;
    if (n > 0) {
      carrying++; foodSum += n;
      foodMix[drop.id] = (foodMix[drop.id] || 0) + n;
      if (s.type === FOOD_TYPE) { foodSpawnDrops += n; foodSpawnMix[drop.id] = (foodSpawnMix[drop.id] || 0) + n; }
    }
  }
}

/* AN EMPTY SAMPLE IS A FAILURE, NEVER A PASS (anti-regression rule 3). Every
   number below divides by one of these, so all three have to be non-zero before
   a single threshold means anything. */
check('the generator produced a field to measure', spawns > 0, `${spawns} spawns over ${cells} cells`);
check('the field produced ingredients to measure', foodSum > 0, `${foodSum.toFixed(0)} ingredients`);
check('the food spawn produced drops to measure', foodSpawnDrops > 0, `${FOOD_TYPE}: ${foodSpawnDrops} drops`);
if (!spawns || !foodSum || !foodSpawnDrops) {
  console.log('\nan empty sample is a FAILURE, not a pass');
  process.exit(1);
}

const perCell = { spawns: spawns / cells, coins: coinSum / cells, xp: xpSum / cells, food: foodSum / cells };
const carryShare = carrying / spawns;

/* ---- 1. THE HERB PATCH PAYS FOOD, NOT SEEDS ---- */
const paysSeeds = Object.entries(SPAWN_TYPES).filter(([, d]) => d.seeds).map(([t]) => t);
check('no spawn type pays garden seeds any more', paysSeeds.length === 0, paysSeeds.join(',') || 'none');
check(`the food spawn (${FOOD_TYPE}) carries more than one ingredient`,
  (SPAWN_FOOD[FOOD_TYPE] ?? 1) >= 2, `SPAWN_FOOD.${FOOD_TYPE} = ${SPAWN_FOOD[FOOD_TYPE] ?? '(unset)'}`);

/* ---- 2. THE FAUCET DID NOT OPEN. Ratchets: failure is UP. ---- */
const COIN_CEILING = 46.54, XP_CEILING = 53.98;   // measured on v400 (405b5df)
check(`coins per cell ${perCell.coins.toFixed(2)} did not rise above v400`,
  perCell.coins <= COIN_CEILING, `ceiling ${COIN_CEILING}`);
check(`XP per cell ${perCell.xp.toFixed(2)} did not rise above v400`,
  perCell.xp <= XP_CEILING, `ceiling ${XP_CEILING}`);

/* ---- 3. SUPPLY ROSE. Failure is DOWN: the Kitchen loses the garden. ---- */
const FOOD_FLOOR = 2.60;   // 1.3x the v400 figure of 2.00 per cell
check(`ingredients per cell ${perCell.food.toFixed(2)} clears the no-garden floor`,
  perCell.food >= FOOD_FLOOR, `floor ${FOOD_FLOOR} (v400 was 2.00)`);

/* ---- 4. FOOD IS SPLIT ACROSS THE FIELD, not riding on every spawn ---- */
check(`only ${(carryShare * 100).toFixed(0)}% of spawns carry food`,
  carryShare < 0.75, 'ceiling 75%, v400 was 100%');

/* ---- 5. THE MAP READS FULL, and is bounded. A floor AND a ceiling: every
     spawn is a live DOM marker, so "as many as possible" is a memory bug. ---- */
const mPerPx = 156543.03392 * Math.cos(LAT * Math.PI / 180) / Math.pow(2, MAP_START_ZOOM);
const HALF_W = 440 * mPerPx / 2, HALF_H = 700 * mPerPx / 2;   // iPhone 17 Pro Max, map stage
let viewSum = 0, viewSamples = 0;
for (const date of ['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-22']) {
  for (const mins of [420, 600, 780, 960, 1140]) {
    const R = Math.ceil(Math.max(HALF_W, HALF_H) / (CELL_DEG * 111000)) + 2;
    const c0 = Math.round(LAT / CELL_DEG), c1 = Math.round(LNG / CELL_DEG);
    let n = 0;
    for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) {
      for (const s of spawnsForCell(date, c0 + dx, c1 + dy, mins)) {
        const dLat = Math.abs(s.lat - LAT) * 111000;
        const dLng = Math.abs(s.lng - LNG) * 111000 * Math.cos(LAT * Math.PI / 180);
        if (dLat <= HALF_H && dLng <= HALF_W) n++;
      }
    }
    viewSum += n; viewSamples++;
  }
}
check('the viewport was actually sampled', viewSamples > 0, `${viewSamples} samples`);
const inView = viewSum / viewSamples;
check(`${inView.toFixed(1)} spawns sit in a phone viewport`, inView >= 8, 'floor 8, v400 was 4.2');
check(`${inView.toFixed(1)} spawns is still a drawable number of markers`, inView <= 24, 'ceiling 24');

/* ---- 6. THE FOOD SPAWN DROPS WHAT THE COOKBOOK WANTS ----
   Recounted here from the recipe tables rather than read off the module, so a
   hand-edited constant standing in for the derivation fails this row. */
const demand = {};
for (const r of [...cook.RECIPES, ...cook.POTIONS]) {
  if (Object.keys(r.needs).some(id => cook.INGREDIENTS[id].tier !== 'common')) continue;
  for (const [id, n] of Object.entries(r.needs)) demand[id] = (demand[id] || 0) + n;
}
const demandTotal = Object.values(demand).reduce((a, b) => a + b, 0);
check('the cookbook demands something to weight against', demandTotal > 0, `${demandTotal} units`);
check('the app derives the same demand table this audit recounts',
  JSON.stringify(cook.INGREDIENT_DEMAND || null) !== 'null' &&
  cook.COMMON_INGREDIENT_IDS.every(id => (cook.INGREDIENT_DEMAND || {})[id] === demand[id]),
  JSON.stringify(cook.INGREDIENT_DEMAND || null));

let worst = null;
for (const id of cook.COMMON_INGREDIENT_IDS) {
  const got = (foodSpawnMix[id] || 0) / foodSpawnDrops;
  const want = (demand[id] || 0) / demandTotal;
  check(`${FOOD_TYPE} can drop ${id} at all`, (foodSpawnMix[id] || 0) > 0, `${(got * 100).toFixed(1)}%`);
  const ratio = want ? got / want : Infinity;
  if (!worst || Math.abs(Math.log(ratio)) > Math.abs(Math.log(worst.ratio))) worst = { id, ratio, got, want };
}
check(`the food spawn's worst-served ingredient (${worst.id}) is within a quarter of its demand`,
  worst.ratio >= 0.8 && worst.ratio <= 1.25,
  `${worst.ratio.toFixed(2)}x  drop ${(worst.got * 100).toFixed(1)}% vs need ${(worst.want * 100).toFixed(1)}%`);

console.log(`\nnote  per cell: ${perCell.spawns.toFixed(2)} spawns, ${perCell.coins.toFixed(2)} coins, ` +
  `${perCell.xp.toFixed(2)} XP, ${perCell.food.toFixed(2)} ingredients (${(carryShare * 100).toFixed(0)}% of spawns carry food).`);
console.log(`note  whole-field mix: ` + cook.COMMON_INGREDIENT_IDS
  .map(id => `${id} ${(((foodMix[id] || 0) / foodSum) * 100).toFixed(1)}%`).join(', '));

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
