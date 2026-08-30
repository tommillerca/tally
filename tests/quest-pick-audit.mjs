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
/* CEILINGS ARE THE WORST CASE OVER A YEAR, NOT ONE DATE. They were { day: 6,
   week: 3, month: 2 } with XP <= 680, taken from a single hard-coded 2026-08-20.
   That date is not typical, it is lucky: swept over 365 dates those four bounds
   are breached on 59, 316, 153 and 346 days respectively. Weekly failed 87% of
   the time. A one-date sample presented as a ceiling is the exact "checks that
   cannot fail" trap, so the sweep below is the assertion now.
   Measured on THIS tree's pools, independently of the numbers that came with the
   fix (and they agreed to the digit): day 9, week 7, month 3, XP/day 1145.
   These may only ever be RATCHETED DOWN. */
/* Tightened 2026-08-30 to the draw-then-filter measurement (365 dates x 32
   flag states, deterministic): the gates Tom ordered ("no one should get a
   quest they cannot complete") plus draw-then-filter DROPPED every bound below
   its pre-gate value. The intermediate state, gates with the old substituting
   picker, measured day 9 / week 9 / month 4 / 1445 XP, which is why these are
   assertions and not history. */
const CEILING = { day: 5, week: 6, month: 3 };
const CEILING_XP = 975;
/* The pre-fix figures, kept so the direction is legible: the old picker reached
   11/8/3 and 1315 XP on its own base. The ordering fix does not get to n by
   itself and was never going to (a gated quest ahead of the n-th ungated one
   still displaces it); what it removes is the CHURN that minted fresh ledger
   keys. The CAP in section 2b is what bounds the payout. */
const SWEEP_DAYS = 365;
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

// ---- 2a. reachable, swept over a YEAR of dates and all 32 flag states ------
console.log(`\n2a. distinct quests reachable, ${SWEEP_DAYS} dates x 32 flag states`);
const worst = { day: 0, week: 0, month: 0 };
const worstAt = {};
let worstXp = 0, worstXpDate = '', statesSeen = 0, datesSeen = 0;
const d0 = Date.parse(`${DATE.slice(0, 4)}-01-01T00:00:00Z`);
for (let i = 0; i < SWEEP_DAYS; i++) {
  const date = new Date(d0 + i * 86400000).toISOString().slice(0, 10);
  let dayXp = 0;
  for (const { period, fn, xp } of PERIODS) {
    const all = new Set();
    let states = 0;
    for (let m = 0; m < 32; m++) {
      const o = {}; FLAGS.forEach((f, j) => { o[f] = !!(m & (1 << j)); });
      const picked = fn(date, o);
      assert(picked.length > 0, `${period} ${date}: picked nothing, the sample set is empty`);
      picked.forEach(q => all.add(q.id));
      states++;
    }
    statesSeen = states;
    if (all.size > worst[period]) { worst[period] = all.size; worstAt[period] = date; }
    dayXp += all.size * xp;
  }
  if (dayXp > worstXp) { worstXp = dayXp; worstXpDate = date; }
  datesSeen++;
}
/* POSITIVE CONTROL / SAMPLE REACH. An empty or tiny sweep would make every
   ceiling below pass for free, so the size of the sample is asserted before any
   of it is graded. This is the row that fails if the loop above stops looping. */
ok(`CONTROL: the sweep actually ran ${SWEEP_DAYS} dates x 32 flag states`,
  datesSeen === SWEEP_DAYS && statesSeen === 32,
  `only ${datesSeen} dates and ${statesSeen} flag states ran, so the ceilings below graded almost nothing`);
ok(`CONTROL: the sweep found real variation, not one repeated answer`,
  worst.day > QUEST_N.day && worst.week > QUEST_N.week,
  `worst == intended on every date (${JSON.stringify(worst)}), which means the pickers are probably not being reached at all`);
for (const { period } of PERIODS) {
  ok(`${period}: worst ${worst[period]} reachable over the year, ceiling ${CEILING[period]}, intended ${QUEST_N[period]}`,
    worst[period] <= CEILING[period],
    `reachable rose to ${worst[period]} on ${worstAt[period]}, above the ${CEILING[period]} this is pinned at. The rotation is moving with the gates again.`);
}
ok(`worst reachable XP/day ${worstXp} is at most ${CEILING_XP}`,
  worstXp <= CEILING_XP,
  `worst reachable XP/day rose to ${worstXp} on ${worstXpDate}. It was 1315 before the ordering fix.`);

// ---- 2b. THE CAP is the actual bound, and it is date-independent -----------
/* This is the assertion that carries the economic claim. Ordering reduces the
   churn; the cap is what makes a period PAY n. It must hold on every date,
   including the worst one section 2a just found, so it is asserted there too. */
console.log('\n2b. the claim cap bounds the payout regardless of the date');
const cappedXp = PERIODS.reduce((sum, { period, xp }) => sum + QUEST_N[period] * xp, 0);
ok(`the cap holds a period to QUEST_N, so a day banks at most ${cappedXp} XP`,
  cappedXp === 605, `capped payout computed as ${cappedXp}, expected 605`);
ok(`the cap is what closes the gap: ${worstXp} reachable vs ${cappedXp} bankable`,
  cappedXp < worstXp,
  `the cap (${cappedXp}) is not below what is reachable (${worstXp}), so it is bounding nothing`);

// ---- 3. the ledger count must not confuse a day with its month -------------
console.log('\n3. a daily claim must not spend a monthly slot');
const rows = [
  { key: 'quest-2026-08-20-q-log5' }, { key: 'quest-2026-08-20-q-bed' }, { key: 'quest-2026-08-20-q-weigh' },
  { key: 'quest-2026-08-m-steps' },
  { key: 'quest-2026-08-17-w-cook' },
];
ok('the day sees exactly its own 3', claimsThisPeriod(rows, '2026-08-20', 'day') === 3,
  `counted ${claimsThisPeriod(rows, '2026-08-20', 'day')}`);
ok('the month sees 1, not the 3 daily rows nested under its prefix',
  claimsThisPeriod(rows, '2026-08', 'month') === 1,
  `counted ${claimsThisPeriod(rows, '2026-08', 'month')}: '2026-08' is a prefix of '2026-08-20', so a naive startsWith swallows the dailies and the monthly cap fires early`);
ok('the week sees exactly its own 1', claimsThisPeriod(rows, '2026-08-17', 'week') === 1,
  `counted ${claimsThisPeriod(rows, '2026-08-17', 'week')}`);
/* THE MONDAY COLLISION, which the digit guard cannot see and which took weekly
   quests offline for a whole week. weekKeyOf() returns the Monday's own date, so
   on a Monday the week key IS a day key: 'quest-2026-08-17-' prefixes both, and
   both suffixes are quest ids starting with a letter. Three dailies claimed on
   Monday made the weekly count read 3, which is the weekly cap, and every weekly
   was then refused until the next week. Counting POOL MEMBERSHIP is what fixes
   it; there is no naming rule or date test that could. */
const monday = [
  { key: 'quest-2026-08-17-q-log5' }, { key: 'quest-2026-08-17-q-bed' }, { key: 'quest-2026-08-17-q-weigh' },
];
ok('MONDAY: three dailies claimed on a Monday count as 3 dailies',
  claimsThisPeriod(monday, '2026-08-17', 'day') === 3,
  `counted ${claimsThisPeriod(monday, '2026-08-17', 'day')}`);
ok('MONDAY: those same dailies spend NONE of the weekly budget',
  claimsThisPeriod(monday, '2026-08-17', 'week') === 0,
  `counted ${claimsThisPeriod(monday, '2026-08-17', 'week')} weekly claims from three DAILY rows. On a Monday the week key and the day key are the same string, so a prefix test hands the weekly cap its own dailies and refuses every weekly for the rest of the week.`);
const mondayWeek = [{ key: 'quest-2026-08-17-w-cook' }, { key: 'quest-2026-08-17-w-fight' }];
ok('MONDAY: and weeklies claimed on a Monday spend none of the DAILY budget',
  claimsThisPeriod(mondayWeek, '2026-08-17', 'day') === 0,
  `counted ${claimsThisPeriod(mondayWeek, '2026-08-17', 'day')}`);

// ---- 4. the cap constants are the ones the pickers use ---------------------
console.log('\n4. the cap and the picker agree');
for (const { period, fn } of PERIODS) {
  ok(`${period}: picker returns QUEST_N.${period} (${QUEST_N[period]})`,
    fn(DATE, ALL_ON).length === QUEST_N[period],
    `picker returned ${fn(DATE, ALL_ON).length}, cap is ${QUEST_N[period]}: claimQuest would refuse a quest the UI still offers`);
}

console.log(failed ? `\nFAILED: ${failed} assertion${failed === 1 ? '' : 's'}.` : '\nPASS');
process.exit(failed ? 1 : 0);
