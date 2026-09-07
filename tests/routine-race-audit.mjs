/* THE ROUTINE XP CEILING MUST HOLD WHEN TWO ROUTINES FINISH AT ONCE.
 *
 * markRoutine's cap used to be READ, then DECIDED, across an await:
 * routinesDone() (a ledger scan) told the call how many of ROUTINE_XP_CAP
 * slots were already spent, and several awaits later a row was minted off
 * that count. Two DIFFERENT routines finishing concurrently at cap-1 both
 * read the same pre-award total, both decided "I am the last paying slot",
 * and both minted ROUTINE_XP: a documented 15 XP ceiling (ROUTINE_XP 5 x
 * ROUTINE_XP_CAP 3) paid 20 (measured 2026-09-06). js/wellness.js now wins the
 * slot through awardCapped (js/game.js), the same shared-ordinal
 * addIfAbsent test-and-set every other repeatable daily reward uses, so the
 * cap check and the payout are one atomic claim.
 *
 * HOW THE RACE IS MODELLED. tests/mem-idb.mjs serialises overlapping
 * readwrite transactions on one database in creation order (the real
 * IndexedDB spec's behaviour), so two concurrent markRoutine calls each get a
 * genuine turn at the `xp` store rather than both reading a stale snapshot.
 * That is exactly the property the old code broke: it decided the payout
 * BEFORE its own transaction, off a read taken outside it.
 *
 * SETUP fills 2 of the 3 XP-earning slots sequentially (routines A, B), so
 * the ceiling is at cap-1 when the race starts, the exact boundary the bug
 * needs. RACE then marks two fresh, DISTINCT routines (C, D) concurrently.
 *   RACE-TOTAL   the combined XP the two racing calls pay is 5, not 10: only
 *                one of the two takes the last slot.
 *   RACE-CEILING total wellness routine XP across the whole day is exactly
 *                15 (ROUTINE_XP * ROUTINE_XP_CAP), never 20.
 *   RACE-BOTH-DONE both C and D are recorded as done today (routinesDone),
 *                regardless of which one was paid: a routine past the cap
 *                still has to be remembered as completed.
 *   RACE-ONE-CAPPED exactly one of the two calls reports capped:true (xp 0),
 *                the other capped:false (xp 5): the loss is real, not silent
 *                double-non-payment.
 *
 * PROVE-RED, run on a throwaway copy of this tree with js/wellness.js's
 * markRoutine reverted to the pre-fix line (`done.size < ROUTINE_XP_CAP ?
 * ROUTINE_XP : 0`, no awardCapped) (2026-09-07):
 *   FAIL RACE-TOTAL the two racing routines pay 5 XP between them, not 10  +10 XP paid, expected +5
 *   FAIL RACE-CEILING total routine XP for the day never exceeds 15  20 XP total, expected 15
 *   FAIL RACE-ONE-CAPPED exactly one of the two racing calls is capped  0 of 2 capped
 *   ROUTINE RACE FAILED (3)
 * (measured directly from what markRoutine hands back, not off a ledger key
 * scheme, since which key carries the XP is itself half the bug)
 *
 * PURE: node only, no browser, under a second.
 *     node tests/routine-race-audit.mjs
 */
import './mem-idb.mjs';
import { kvSet, useDbName } from '../js/db.js';
import { addRoutine, markRoutine, routinesDone, ROUTINE_XP, ROUTINE_XP_CAP } from '../js/wellness.js';

useDbName('routine-race-audit');

let fails = 0;
const ok = (m, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${m}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

const DATE = '2099-04-01';
await kvSet('routines', []);   // clean slate: routines are the only thing this file writes

async function addNamed(name) {
  const r = await addRoutine(name);
  return r.list[r.list.length - 1].id;
}

/* The total is read off what markRoutine actually HANDS BACK to its caller
   (the UI toasts this number), not off a ledger key scheme: the ledger key a
   paid routine's XP lands under is exactly the bug (routine-<id>-<date>
   before the fix, a shared rslot-<date>-<n> after), so scanning for one
   scheme would silently pass against the other tree instead of grading the
   invariant that actually matters to a player. */

/* ---- SETUP: fill 2 of the 3 slots sequentially, so the race starts at cap-1 ---- */
const A = await addNamed('Stretch');
const B = await addNamed('Meditate');
const rA = await markRoutine(A, DATE);
const rB = await markRoutine(B, DATE);
ok('SETUP both seed routines paid ROUTINE_XP, leaving exactly one slot',
  rA.xp === ROUTINE_XP && rB.xp === ROUTINE_XP, `A=${rA.xp} B=${rB.xp}`);

/* ---- RACE: two DIFFERENT routines finishing concurrently for the last slot ---- */
const C = await addNamed('Cold shower');
const D = await addNamed('Read 10 pages');
const [rC, rD] = await Promise.all([markRoutine(C, DATE), markRoutine(D, DATE)]);
const raceTotal = rC.xp + rD.xp;
const dayTotal = rA.xp + rB.xp + raceTotal;

ok('RACE-TOTAL the two racing routines pay 5 XP between them, not 10',
  raceTotal === ROUTINE_XP, `+${raceTotal} XP paid, expected +${ROUTINE_XP}`);
ok('RACE-CEILING total routine XP for the day never exceeds 15',
  dayTotal === ROUTINE_XP * ROUTINE_XP_CAP, `${dayTotal} XP total, expected ${ROUTINE_XP * ROUTINE_XP_CAP}`);

const doneToday = await routinesDone(DATE);
ok('RACE-BOTH-DONE both racing routines are recorded as completed today, paid or not',
  doneToday.has(C) && doneToday.has(D), `done={${[...doneToday].join(',')}}`);

const capped = [rC, rD].filter(r => r.capped).length;
ok('RACE-ONE-CAPPED exactly one of the two racing calls is capped',
  capped === 1, `${capped} of 2 capped`);

console.log(`\n${fails ? `ROUTINE RACE FAILED (${fails})` : 'ROUTINE RACE VERIFIED'}`);
process.exit(fails ? 1 : 0);
