/* THE APPETITE GUARD. Pins the balance decision that came out of
 * tests/garden-sim.mjs (numbers and reasoning: gwart/GARDEN-SIM-FINDINGS.md).
 *
 * THE DECISION IT PINS. The garden is in permanent oversupply, and the obvious
 * fix is to make dishes cost more or last fewer fights. Measured, both of those
 * make the median player WORSE OFF without meaningfully raising spend, because
 * ingredient spend is capped by how many cooks a visit can START (pots x opens),
 * not by what a recipe costs. At the measured cadence of 0.76 app opens a day,
 * raising recipe costs does not get eaten, it just takes the buff away.
 *
 * WHICH DIRECTION IS FAILURE (anti-regression rule 11). Failure is the median
 * player's buffed-fight rate going DOWN, and it is a FLOOR, not a trend: the
 * loop exists so that a fight has a dish behind it, and a player who tends the
 * garden every day must still clear the floor. A recipe table that lifts spend
 * by starving the player of buffs passes any "spend went up" check and is
 * exactly the change this guard exists to stop.
 *
 * MEASURED VALUES at the time of writing, median player (1 open/day, 3 beds,
 * 1 pot), maximising buff policy:
 *   as shipped .................. 64% buffed, 1.0 ingredients per fight covered
 *   every recipe's needs x2 ..... 40% buffed, 2.0   <- goes red here
 *   every dish lasts 1 fight .... 26% buffed, 3.0   <- goes red here
 *   a banquet tier added ........ 64% buffed, 1.0   <- stays green (free content)
 *   potions brewed as well ...... 59% buffed, 1.0   <- stays green
 *
 * Usage: node tests/garden-appetite-guard.mjs        (exits non-zero on failure)
 */
import { measure, LEVERS } from './garden-sim.mjs';
import { RECIPES, COMMON_INGREDIENT_IDS } from '../js/cooking.js';
import { PLOTS_FREE } from '../js/garden.js';
import { FREE_FIGHTS } from '../js/energy.js';

/* The floor sits between the shipped 64% and the 40% that the cheapest proposed
   lever produces, close enough to shipped to catch a real regression and far
   enough off it that bumper luck cannot trip it. */
const BUFFED_FLOOR = 0.55;
/* Bone Broth is the most expensive dish per fight it covers, at 3 ingredients
   for 2 fights. Anything above that is a recipe table the median cadence cannot
   feed. Failure direction: UP. */
const MAX_INGREDIENTS_PER_FIGHT = 1.5;

let bad = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? '  ' + detail : ''}`);
  if (!ok) bad++;
};

/* 1. STATIC: what the shipped cookbook asks of a fight. Cheap, and it catches
      both rejected levers without running a single simulated day. */
const isCommonOnly = r => Object.keys(r.needs).every(id => COMMON_INGREDIENT_IDS.includes(id));
const dishes = RECIPES.filter(r => r.buff?.kind === 'combat' && isCommonOnly(r));
check('there are common-fed combat dishes to measure at all', dishes.length > 0, `${dishes.length} dishes`);
if (!dishes.length) { console.log('\nan empty cookbook is a FAILURE, not a pass'); process.exit(1); }

for (const r of dishes) {
  const per = Object.values(r.needs).reduce((a, n) => a + n, 0) / r.buff.fights;
  check(`${r.id} costs ${per.toFixed(2)} ingredients per fight it covers`,
    per <= MAX_INGREDIENTS_PER_FIGHT, `ceiling ${MAX_INGREDIENTS_PER_FIGHT}`);
}

/* 2. SIMULATED: the median player, driven through the real recipe table. This is
      the one that catches a change which keeps every recipe cheap on paper but
      breaks the loop some other way (cook times, buff durations, pot counts). */
const median = measure({
  opens: 1, beds: PLOTS_FREE, pots: 1, stack: true,
  recipes: RECIPES, potions: [], fightsPerDay: FREE_FIGHTS,
});

// an empty sample set is a FAILURE, never a pass
check('the sim actually ran fights', median.fights > 0, `${median.fights} fights`);
check('the sim actually grew something', median.produced > 0, `${median.produced.toFixed(1)}/day`);

check(`median player keeps a dish up for ${(median.buffed * 100).toFixed(0)}% of fights`,
  median.buffed >= BUFFED_FLOOR, `floor ${(BUFFED_FLOOR * 100).toFixed(0)}%`);

/* CONTROL. The floor is only a bound if this sim, at this cadence, can actually
   be pushed through it. Lever 1 (every recipe's needs x2) is the cheapest of the
   two rejected levers and the one measured at 40% buffed. If it scores above the
   floor the sim is not reading the recipe table it was handed, and the row above
   is green for no reason: that is the same shape as an audit grading a set that
   cannot contain the bug. */
const lever = measure({
  opens: 1, beds: PLOTS_FREE, pots: 1, stack: true,
  ...LEVERS['1. needs x2'], fightsPerDay: FREE_FIGHTS,
});
check('CONTROL the rejected needs-x2 table really does fall through that floor',
  lever.buffed < BUFFED_FLOOR,
  `${(lever.buffed * 100).toFixed(0)}% buffed, floor ${(BUFFED_FLOOR * 100).toFixed(0)}% (measured 40% when this was written)`);

/* 3. The oversupply itself is REPORTED, not asserted. It is the open design
      question this branch measured, not a regression, and a guard that failed on
      it would go red on healthy code every day until the appetite work lands. */
console.log(`\nnote  median player grows ${median.produced.toFixed(1)} and spends ${median.spent.toFixed(1)} ingredients a day ` +
  `(${median.stock.toFixed(0)} banked by day 30). That gap is the open design question, not a regression.`);

console.log(bad ? `\n${bad} FAILED` : '\nall good');
process.exit(bad ? 1 : 0);
