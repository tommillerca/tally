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

   TIGHTENED 2026-09-06 (R39-3): a genuinely fresh player (every one of the five
   gates explicitly false, opts===NEW below) draws a board that can be
   under-filled or teach nothing onboarding covers, so dailyQuests() now fills
   and forces an onboarding anchor for THAT ONE GATE STATE ONLY (js/quests.js:
   `dayOne = opts.hkConnected === false && ... === false`) -- pick()'s general
   draw-then-filter, and every other one of the 32 flag combinations, is
   untouched. So "fewer never different" is no longer a blanket rule: it is
   swept across all 32 combinations below, and the assertion is that only ONE
   of them (bitmask 0, every flag false) is allowed to produce a MULTI-QUEST
   board that is not a subset of the fully-open list. A single-quest board that
   is not in that subset is pick()'s OWN pre-existing floor -- a draw gated
   wall to wall falls back to one quest from outside the top-n slice, on any
   gate combination, always length 1 -- and is not this ticket's substitution;
   it is excluded the same way the pre-2026-09-06 version of this row excluded
   it. Any OTHER combination going non-subset at length > 1 means #283's
   exploit -- a gate flip minting a freshly-claimable board -- has come back on
   a path this fix did not intend to touch. */
let empties = 0;
const GATE_FLAGS = ['hkConnected', 'huntEnabled', 'socialOn', 'pitTried', 'kitchenReady'];
const substitutingCombos = new Set();
let dayOneSubstituted = 0;
for (let i = 0; i < 365; i++) {
  const d = new Date(2026, 0, 1 + i).toISOString().slice(0, 10);
  // The ceiling is ALL_ON (every gate explicitly true), not {}: hk/hunt/social
  // read their flag's truthiness directly in pick(), so an UNDEFINED flag is
  // falsy there and {} quietly excludes those three gates' quests too (only
  // pit/kitchen treat undefined as "no opinion" via their off() helper --
  // that asymmetry is pre-existing and not this ticket's to fix). ALL_ON is
  // the one opts value guaranteed to pass every gate, so it is the true
  // fully-open ceiling every other combination must be a subset of.
  const allIds = new Set(dailyQuests(d, VET).map(q => q.id));
  if (dailyQuests(d, NEW).length === 0) empties++;
  for (let m = 0; m < 32; m++) {
    const o = {}; GATE_FLAGS.forEach((f, j) => { o[f] = !!(m & (1 << j)); });
    const ids = dailyQuests(d, o).map(q => q.id);
    if (ids.length <= 1) continue; // pick()'s pre-existing floor, legitimate on any mask
    if (!ids.every(id => allIds.has(id))) {
      if (m === 0) dayOneSubstituted++; else substitutingCombos.add(m);
    }
  }
}
ok('DAY-ONE the list is never empty, across a whole year',
  empties === 0, `${empties} empty days`);
ok('CONTROL: the day-one anchor-fill actually fires somewhere in the sweep (else the row below passes for free)',
  dayOneSubstituted > 0, `${dayOneSubstituted} day-one substitutions seen`);
ok('SCOPED: across all 32 gate combinations x a whole year, only the all-locked day-one state (bitmask 0) ever produces a multi-quest non-subset board',
  substitutingCombos.size === 0,
  `non-subset multi-quest boards seen on bitmask(es) ${[...substitutingCombos].sort((a, b) => a - b).join(', ')} too (0 = day-one, expected and excluded above)`);

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
