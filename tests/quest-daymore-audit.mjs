/* A DAY-ONE QUEST LIST MUST DESCRIBE A DAY THIS PLAYER CAN HAVE.
 *
 * A non-gamer played this cold on 2026-08-13, was pushed into the Pit by the
 * day-one card, LOST on rung 1 of 8, and then found two of their three daily
 * quests were "Win a Pit fight" and "Win 3 Pit fights today". Their words:
 * "on day one I am already failing most of the day's list at a thing I did not
 * download this app to do."
 *
 * The picker already gated on hk / hunt / social. Pit and Kitchen quests were
 * ungated, so a brand-new profile could be handed up to three impossible ones.
 *
 * PROVE-RED: drop `need: 'pit'` from q-pit1/q-pit3 and the DAY-ONE rows fail
 * with those ids back in the pool.
 *
 * Usage: node tests/quest-daymore-audit.mjs
 */
import { DAILY_POOL, dailyQuests } from '../js/quests.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const NEW = { hkConnected: false, huntEnabled: false, socialOn: false, pitTried: false, kitchenReady: false };
const VET = { hkConnected: true, huntEnabled: true, socialOn: true, pitTried: true, kitchenReady: true };

ok('SETUP the pool is real (an empty pool would pass everything below)',
  DAILY_POOL.length >= 10, `${DAILY_POOL.length} quests`);

/* Every day of a year, not one seeded day: the picker is date-seeded, so a
   single sample could miss the day it hands out the impossible one. */
/* ASSERT ON IDS, NOT ON `need`. The first version of this row tested
   `q.need === 'pit'`, which is the GATE and not the QUEST: deleting the gate
   also deleted the property, the condition stopped matching, and the audit went
   green on the exact bug it was written for. Naming the quests that must not
   appear is the thing that cannot be satisfied by removing a field. */
const IMPOSSIBLE_ON_DAY_ONE = ['q-pit1', 'q-pit3', 'q-cook', 'q-harvest'];
const bad = [];
for (let i = 0; i < 365; i++) {
  const d = new Date(2026, 0, 1 + i).toISOString().slice(0, 10);
  for (const q of dailyQuests(d, NEW)) {
    if (IMPOSSIBLE_ON_DAY_ONE.includes(q.id)) bad.push(`${d}:${q.id}`);
  }
}
ok(`DAY-ONE none of ${IMPOSSIBLE_ON_DAY_ONE.join('/')} is ever handed to a brand-new player, across a whole year`,
  bad.length === 0, bad.length ? `${bad.length} bad days, e.g. ${bad.slice(0, 3).join(', ')}` : '365 days clean');

/* SPEC CHANGE, 2026-08-30 (#283): this row used to demand a full list of 3,
   which the old picker satisfied by SUBSTITUTION: skip a gated quest, hand the
   next one. Substitution is the exploit #283 closed (a flag flip minted fresh
   ledger keys; measured 1445 XP/day against an intended 605), so gates now only
   REMOVE from a seed-fixed draw and a day-one list can legitimately be short.
   What must still hold instead:
     1. never EMPTY (zero quests is a dead screen; pick() keeps a floor of one),
     2. fewer, never different: the day-one list is a SUBSET of the same date's
        ungated list, so unlocking reveals quests, never swaps them. The ONE
        allowed exception is pick()'s floor: a draw that is gated wall to wall
        collapses to a single fallback quest from outside the draw, because an
        empty list is a dead screen. A floor day is exactly a length-1 list;
        any other non-subset shape is substitution creeping back in. */
let empties = 0, swapped = 0, floorDays = 0;
for (let i = 0; i < 365; i++) {
  const d = new Date(2026, 0, 1 + i).toISOString().slice(0, 10);
  const newIds = dailyQuests(d, NEW).map(q => q.id);
  const allIds = new Set(dailyQuests(d, {}).map(q => q.id));
  if (newIds.length === 0) empties++;
  else if (!newIds.every(id => allIds.has(id))) {
    if (newIds.length === 1) floorDays++; else swapped++;
  }
}
ok('DAY-ONE the list is never empty, across a whole year',
  empties === 0, `${empties} empty days`);
ok('DAY-ONE fewer never different: gating only removes from the draw (floor days excepted, and a floor day is length 1)',
  swapped === 0, `${swapped} days where gating SWAPPED a quest; ${floorDays} legitimate floor days`);

/* The gates must OPEN, or we have just deleted content. */
const vetIds = new Set();
for (let i = 0; i < 365; i++) {
  const d = new Date(2026, 0, 1 + i).toISOString().slice(0, 10);
  for (const q of dailyQuests(d, VET)) vetIds.add(q.id);
}
ok('VETERAN the Pit quests come back once the player has fought',
  vetIds.has('q-pit1') || vetIds.has('q-pit3'), [...vetIds].filter(x => x.startsWith('q-pit')).join(', ') || 'none');
ok('VETERAN the Kitchen quests come back once it has ingredients',
  vetIds.has('q-cook') || vetIds.has('q-harvest'), [...vetIds].filter(x => /cook|harvest/.test(x)).join(', ') || 'none');

/* An older caller that passes no flags must not silently lose quests. */
const legacy = new Set();
for (let i = 0; i < 60; i++) {
  const d = new Date(2026, 0, 1 + i).toISOString().slice(0, 10);
  for (const q of dailyQuests(d, {})) legacy.add(q.id);
}
ok('COMPAT a caller that passes no flags still sees the gated quests (undefined is not false)',
  [...legacy].some(x => x.startsWith('q-pit')), `${legacy.size} distinct ids`);

console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nday one is a day you can actually have');
process.exit(fails.length ? 1 : 0);
