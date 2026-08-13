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

/* And it must still hand out THREE, or the fix has quietly emptied the list. */
const counts = new Set();
for (let i = 0; i < 365; i++) {
  const d = new Date(2026, 0, 1 + i).toISOString().slice(0, 10);
  counts.add(dailyQuests(d, NEW).length);
}
ok('DAY-ONE they still get a full list of 3 (a gate that empties the list is a worse bug)',
  counts.size === 1 && counts.has(3), `list sizes seen: ${[...counts].join(', ')}`);

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
