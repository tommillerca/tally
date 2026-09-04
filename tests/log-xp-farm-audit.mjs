/* tests/log-xp-farm-audit.mjs: LOGGING FOOD CANNOT PAY FOREVER.
 *
 * WHY THIS EXISTS. QA round A (2026-09-03, L1, CRITICAL): the log award was
 * `award(`log-${entry.id}`, 'log', 10, ...)` and entry.id is newId(), which is
 * Date.now() plus randomness. So every log was a fresh key, award() could never
 * dedupe it, and nothing retired the xp row when the log row was deleted.
 * Measured through the real controls: 10 log/delete cycles = +100 XP with 0
 * surviving entries; 5 re-logs from the recents row = 15 taps for +50 XP,
 * 3.3 XP per tap, 245 XP a minute, uncapped, level 20 in about 53 minutes.
 * tests/xp-cap-audit.mjs's STATIC lint was written for exactly this class and
 * passed it, because the clock was one variable hop away inside newId(). The
 * provenance lint that replaces it is tests/xp-key-provenance-lint.mjs; THIS
 * file is the behavioural half: it drives the real onFoodLogged against the
 * real js/db.js on an in-memory IndexedDB and reads the ledger back.
 *
 * WHAT IT ASSERTS
 *   SHAPE    XP_DAILY_CAP.log exists and is smaller than the hammer count, so
 *            the FARM check below is a real ceiling and not NaN.
 *   CONTROL  the first log of the day pays its 10 XP, so a helper that paid
 *            nothing could not pass FARM by paying zero.
 *   FARM     60 fresh logs on one date mint exactly cap x 10 XP of type 'log'.
 *   DELETE   deleting every one of them and logging 5 more mints nothing new:
 *            the day is spent whether or not the rows survive.
 *   ROLLOVER a different date pays again: the ceiling is per day.
 *
 * PROVE-RED. On integ/playtest-round-a at 28f4e1bb (the tip before the fix):
 * SHAPE red (no cap), FARM red at 600 XP, DELETE red at 650 XP. All green with
 * the fix in js/game.js.
 *
 * PURE: node only, no browser, about 1s.   node tests/log-xp-farm-audit.mjs
 */
import './mem-idb.mjs';   // installs globalThis.indexedDB before js/db.js opens it

const { db, useDbName, newId } = await import('../js/db.js');
const g = await import('../js/game.js');
useDbName('log-xp-farm-audit');

const out = [];
let fails = 0;
const ok = (m, cond, detail = '') => {
  if (cond) out.push(`ok   ${m}${detail ? '  ' + detail : ''}`);
  else { fails++; out.push(`FAIL ${m}${detail ? '  ' + detail : ''}`); }
};

/* A fixed date, not today: the keys are built from entry.date, and pinning it
   keeps the run identical at 23:59 and 00:01 (lessons_clock_rotated_identity). */
const DAY = '2031-05-05', OTHER = '2031-05-06';
const HAMMER = 60;

async function logOne(date) {
  const e = { id: newId(), date, meal: 0, ts: Date.now(), foodId: null, name: 'audit food', kcal: 100, p: 5, c: 5, f: 5 };
  await db.put('log', e);
  const entriesForDate = (await db.all('log')).filter(r => r.date === date);
  return g.onFoodLogged(e, { entriesForDate });
}
const logXp = async () => (await db.all('xp')).filter(r => r.type === 'log').reduce((a, r) => a + r.xp, 0);

const CAP = g.XP_DAILY_CAP.log;
ok('SHAPE XP_DAILY_CAP.log exists and is below the hammer count', Number.isInteger(CAP) && CAP > 0 && CAP < HAMMER,
  `cap=${CAP}, hammer=${HAMMER}`);

await logOne(DAY);
ok('CONTROL the first log of a day pays 10 XP', (await logXp()) === 10, `${await logXp()} XP after one log`);

for (let i = 1; i < HAMMER; i++) await logOne(DAY);
const farmed = await logXp();
ok(`FARM ${HAMMER} logs on one date pay the daily ceiling and stop`, farmed === CAP * 10,
  `${HAMMER} logs minted ${farmed} XP of type log, ceiling is ${CAP} x 10 = ${CAP * 10}`);

for (const r of (await db.all('log')).filter(r => r.date === DAY)) await db.del('log', r.id);
for (let i = 0; i < 5; i++) await logOne(DAY);
const afterDelete = await logXp();
ok('DELETE deleting the day and logging again mints nothing new', afterDelete === farmed,
  `${farmed} -> ${afterDelete} XP after deleting all rows and logging 5 more`);

await logOne(OTHER);
ok('ROLLOVER a different date pays again', (await logXp()) === afterDelete + 10, `${await logXp()} XP`);

/* REPEAT (gate7 red 2026-09-04, found by reward-sop-audit's streak driver):
   the date-and-ordinal key made the cap hold, but it also made a SECOND
   onFoodLogged for the SAME entry pay a fresh slot. On origin/main the key was
   log-<entry.id>, so a repeat paid 0 by construction; the farm fix lost that.
   A retried commit (R25-M4), a second tab, or the reward-sop driver itself must
   pay once per entry: awardCapped now carries `ref: entry.id` on the ledger row
   and returns 0 when a slot of that day already names this entry. */
const THIRD = '2031-05-07';
const rep = { id: newId(), date: THIRD, meal: 0, ts: Date.now(), foodId: null, name: 'audit food', kcal: 100, p: 5, c: 5, f: 5 };
await db.put('log', rep);
const before = await logXp();
await g.onFoodLogged(rep, { entriesForDate: [rep] });
await g.onFoodLogged(rep, { entriesForDate: [rep] });
ok('REPEAT the same entry through onFoodLogged twice pays its log XP once', (await logXp()) === before + 10,
  `${before} -> ${await logXp()} XP after two calls for one entry (one slot is 10)`);

console.log(out.join('\n'));
console.log(fails ? `\nFAIL (${fails})` : `\nall green, ${out.length} checks`);
process.exit(fails ? 1 : 0);
