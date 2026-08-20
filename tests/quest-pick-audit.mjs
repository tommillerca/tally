/* Quest rotation must be a property of the PERIOD, never of what the player has
 * unlocked. Node-only, no browser: everything here is pure.
 *
 * THE BUG THIS EXISTS FOR. pick() filtered the pool to `avail` by five gate
 * flags and THEN drew indices against avail.length. The seed was the period, so
 * the draw looked stable, but the array it indexed into was not. Flip a flag and
 * the same day handed out different quests, which meant different
 * `quest-<periodKey>-<id>` ledger keys, and award() is idempotent per KEY, so
 * every new set was freshly claimable.
 *
 * Measured on the broken code, one date, all 32 flag states:
 *   daily    11 distinct quests reachable where 3 were intended
 *   weekly    8 where 3 were intended
 *   monthly   3 where 2 were intended
 *   1315 XP/day reachable against an intended 605, a 2.2x overpay
 * kitchenReady flips whenever the ingredient count crosses zero, so players hit
 * this by accident, not only by trying.
 *
 * DIRECTION AND BOUND, not a trend (anti-regression rule 11). Failure is the
 * reachable count going UP. Every assertion below is a ceiling.
 */
import assert from 'node:assert/strict';
import { dailyQuests, weeklyQuests, monthlyQuests, __questOrder, claimsThisPeriod, QUEST_N } from '../js/quests.js';

const DATE = '2026-08-20';
const FLAGS = ['hkConnected', 'huntEnabled', 'socialOn', 'pitTried', 'kitchenReady'];
const ALL_OFF = Object.fromEntries(FLAGS.map(f => [f, false]));
const ALL_ON = Object.fromEntries(FLAGS.map(f => [f, true]));

let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { console.log(`  ok    ${name}`); return; }
  failed++; console.log(`  FAIL  ${name}\n        ${detail}`);
};

/* Ceilings measured on the FIXED code. Daily is not 3 because unlocking a quest
   that sits early in the seeded order displaces one further down: the ordering
   fix removes the churn, the claim cap is what makes the PAYOUT exactly n. */
const CEILING = { day: 6, week: 3, month: 2 };
const PERIODS = [
  { period: 'day', fn: dailyQuests, xp: 25 },
  { period: 'week', fn: weeklyQuests, xp: 70 },
  { period: 'month', fn: monthlyQuests, xp: 160 },
];

console.log('QUEST ROTATION');

// ---- 1. the sequence is a function of the seed alone -----------------------
console.log('\n1. the seeded order does not move when a gate flips');
for (const { period } of PERIODS) {
  const on = __questOrder(period, DATE, ALL_ON);
  const off = __questOrder(period, DATE, ALL_OFF);
  assert(on.length > 0 && off.length > 0, 'empty pool: nothing was measured');
  const ungatedOfOn = on.filter(q => !q.need).map(q => q.id);
  const offIds = off.map(q => q.id);
  ok(`${period}: gates-off list is the gates-on list minus gated quests, same order`,
    JSON.stringify(ungatedOfOn) === JSON.stringify(offIds),
    `gates-on filtered to ungated: ${ungatedOfOn.join(',')}\n        gates-off:                      ${offIds.join(',')}`);
}

// ---- 2. reachable across every flag state stays under the ceiling ----------
console.log('\n2. distinct quests reachable across all 32 flag states');
let reachableXp = 0, intendedXp = 0, statesSeen = 0;
for (const { period, fn, xp } of PERIODS) {
  const all = new Set();
  let states = 0;
  for (let m = 0; m < 32; m++) {
    const o = {}; FLAGS.forEach((f, i) => { o[f] = !!(m & (1 << i)); });
    const picked = fn(DATE, o);
    assert(picked.length > 0, `${period}: picked nothing, the sample set is empty`);
    picked.forEach(q => all.add(q.id));
    states++;
  }
  statesSeen = states;
  reachableXp += all.size * xp;
  intendedXp += QUEST_N[period] * xp;
  ok(`${period}: ${all.size} reachable, ceiling ${CEILING[period]}, intended ${QUEST_N[period]}`,
    all.size <= CEILING[period],
    `reachable rose to ${all.size}, above the ${CEILING[period]} this was pinned at. The rotation is moving with the gates again.`);
}
ok(`32 flag states actually enumerated`, statesSeen === 32, `only ${statesSeen} states ran`);
ok(`reachable XP/day ${reachableXp} is at most 680 (intended ${intendedXp})`,
  reachableXp <= 680,
  `reachable XP/day rose to ${reachableXp}. It was 1315 before the fix and 680 after.`);

// ---- 3. the ledger count must not confuse a day with its month -------------
console.log('\n3. a daily claim must not spend a monthly slot');
const rows = [
  { key: 'quest-2026-08-20-q-log5' }, { key: 'quest-2026-08-20-q-bed' }, { key: 'quest-2026-08-20-q-weigh' },
  { key: 'quest-2026-08-m-steps' },
  { key: 'quest-2026-08-17-w-cook' },
];
ok('the day sees exactly its own 3', claimsThisPeriod(rows, '2026-08-20') === 3,
  `counted ${claimsThisPeriod(rows, '2026-08-20')}`);
ok('the month sees 1, not the 3 daily rows nested under its prefix',
  claimsThisPeriod(rows, '2026-08') === 1,
  `counted ${claimsThisPeriod(rows, '2026-08')}: '2026-08' is a prefix of '2026-08-20', so a naive startsWith swallows the dailies and the monthly cap fires early`);
ok('the week sees exactly its own 1', claimsThisPeriod(rows, '2026-08-17') === 1,
  `counted ${claimsThisPeriod(rows, '2026-08-17')}`);

// ---- 4. the cap constants are the ones the pickers use ---------------------
console.log('\n4. the cap and the picker agree');
for (const { period, fn } of PERIODS) {
  ok(`${period}: picker returns QUEST_N.${period} (${QUEST_N[period]})`,
    fn(DATE, ALL_ON).length === QUEST_N[period],
    `picker returned ${fn(DATE, ALL_ON).length}, cap is ${QUEST_N[period]}: claimQuest would refuse a quest the UI still offers`);
}

console.log(failed ? `\nFAILED: ${failed} assertion${failed === 1 ? '' : 's'}.` : '\nPASS');
process.exit(failed ? 1 : 0);
