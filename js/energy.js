// Pit energy (hybrid): a few free fights every day, plus extra fights fuelled by
// VIGOR that you earn ONLY from healthy behaviour — logging food and getting
// steps. It never hard-locks (the free floor is always there) and never rewards
// eating less: Vigor comes from logging + walking, not from a calorie deficit.
import { db, kvGet, kvUpdate, claimDay } from './db.js';
import { dateKey } from './nutrition.js';

export const FREE_FIGHTS = 3;          // free Pit fights every day, no strings attached
export const VIGOR_CAP = 12;           // most banked Vigor you can hold
export const STEP_VIGOR_PER = 2500;    // +1 Vigor per this many steps today...
export const STEP_VIGOR_CAP = 6;       // ...up to this many from steps per day
/* LOGGING NO LONGER EARNS VIGOR. Tom, 2026-08-15: "i dont want us giving 6
   energy for meal logging that doesnt make sense."
   The reason is stronger than the balance. Vigor was granted per DISTINCT MEAL,
   capped at three meals, so the reward tracked the SHAPE of the food diary
   rather than the truth of it: somebody who ate twice was nudged to add a third
   row, and somebody who ate five times had no reason to record the last two.
   Attaching a game prize to the accuracy of a medical log is the one thing this
   app must never do, and it was doing it quietly since v205.
   Nothing replaces it: Vigor now comes from STEPS, which is the behaviour the
   app exists to encourage, and from Draughts, which are earned or bought. The
   free-fight floor is untouched, so no player can ever be locked out. */
export const LOG_VIGOR_PER_MEAL = 0;   // retired 2026-08-15, see above
export const LOG_VIGOR_CAP = 0;        // retired 2026-08-15, see above

const clampVigor = v => Math.max(0, Math.min(VIGOR_CAP, v));

function view(st) {
  const free = Math.max(0, FREE_FIGHTS - (st.freeUsed || 0));
  const vigor = clampVigor(st.vigor || 0);
  return { free, freeMax: FREE_FIGHTS, vigor, vigorCap: VIGOR_CAP, ready: free + vigor };
}

// today's healthy-behaviour signal: steps walked. Meals deliberately excluded.
async function todaySignals() {
  const today = dateKey();
  const health = await db.all('health');
  const steps = health.filter(h => h.date === today).reduce((a, h) => a + (h.steps || 0), 0);
  return { steps };
}

// Recompute today's energy, awarding Vigor from STEPS IDEMPOTENTLY
// (safe to call on every Pit render / step sync). Banked Vigor carries across
// days up to the cap; the free-fight floor resets each day.
/* THE RECOMPUTE IS ONE TRANSACTION, AND A RENDER IS NOT ALLOWED TO REFUND A
 * FIGHT. This used to kvGet the record, await claimDay and the step tally, then
 * kvSet the WHOLE record back including freeUsed, so a spendPitFight that
 * committed during either await was simply overwritten by a stale count. That
 * is not a contrived interleave: this runs on every Pit render, every home
 * render and every wallet-pill refresh, and the Pit re-renders when a fight
 * ends. Measured 2026-09-02 on origin/main 620e852e, against a real IndexedDB:
 *   spend, then render, sequentially          freeUsed 1 (correct, the control)
 *   one render overlapping one spend, x12     freeUsed 0 on 12 of 12, every
 *                                             charge handed straight back
 *   3 spends each overlapped by a render      3 fights granted, freeUsed 0
 *                                             against FREE_FIGHTS 3
 * Only the two things that genuinely cannot run inside the transaction are read
 * first: the day verdict and the step tally, both of which are awaits. */
export async function refreshPitEnergy() {
  const before = (await kvGet('pitEnergy', null)) || {};
  const today = dateKey();
  /* MONOTONIC DAY GUARD (js/db.js claimDay). FREE_FIGHTS refills purely because
     the stored date stopped matching dateKey(), which is three free Pit fights
     per clock nudge (measured at 3.0 per reset). The stored date still moves so
     this cannot loop, but the FLOOR only refills on a day the device honestly
     reached; on a distrusted day freeUsed carries over and the player keeps
     whatever they had left, which is the never-hard-lock promise above. */
  const day = before.date !== today ? await claimDay(today) : null;
  const { steps } = await todaySignals();
  const stepTarget = Math.min(STEP_VIGOR_CAP, Math.floor(steps / STEP_VIGOR_PER));
  /* Kept, at zero, rather than deleted: st.fromLog carries a number on every
     existing player's device. Leaving the term in place means their banked
     Vigor is untouched and nothing is clawed back on the update. */
  const logTarget = 0;
  const st = await kvUpdate('pitEnergy', cur => {
    const s = { ...(cur || {}) };
    /* `day` is the verdict on the record READ BEFORE the transaction. Without
       one there is nothing that entitles this call to refill the floor, so it
       leaves the date alone and the next refresh asks claimDay properly. */
    if (s.date !== today && day) {
      s.date = today;
      if (day.fresh) { s.freeUsed = 0; s.fromSteps = 0; s.fromLog = 0; }
    }
    s.vigor = clampVigor(s.vigor || 0);
    const gain = Math.max(0, stepTarget - (s.fromSteps || 0)) + Math.max(0, logTarget - (s.fromLog || 0));
    if (gain > 0) s.vigor = clampVigor(s.vigor + gain);
    s.fromSteps = Math.max(s.fromSteps || 0, stepTarget);
    s.fromLog = Math.max(s.fromLog || 0, logTarget);
    return s;
  }, {});
  return view(st);
}

// Current energy without recomputing (fast read for gating a button).
export async function pitEnergy() { return view((await kvGet('pitEnergy', {})) || {}); }

// Add banked Vigor (used by the Vigor Draught consumable). Clamped to the cap;
// returns the new energy view. Never rewards eating less — this is a spent item.
export async function addVigor(n) {
  const st = (await kvGet('pitEnergy', null)) || {};
  if (st.date !== dateKey()) { await refreshPitEnergy(); }
  /* One transaction, for spendPitFight's sake rather than its own: this read
     the record and wrote the WHOLE thing back, so a charge taken in between
     came straight back with it. Measured 2026-09-02 on origin/main 620e852e, a
     Draught drunk across a spend of banked Vigor left 3 where 2 was right. */
  const s2 = await kvUpdate('pitEnergy', cur => {
    const s = cur || {};
    return { ...s, vigor: clampVigor((s.vigor || 0) + n) };
  }, {});
  return view(s2);
}

/* Consume one Pit fight: spend the free floor first, then banked Vigor.
 * Returns { ok, used: 'free' | 'vigor' } or { ok: false } when tapped out.
 *
 * THE CHARGE IS READ AND SPENT IN ONE TRANSACTION. It used to be a kvGet, an
 * await and a kvSet, so two overlapping calls both saw the same last free fight
 * and both took it: measured 2026-09-01 on origin/main 3d4b208c, with one free
 * fight left a double tap on a rung's FIGHT button opened TWO staked arenas
 * against ONE charge, and the two-tab race did the same. The rollover refresh
 * stays outside, because it is a day boundary rather than a charge, and the
 * updater below has to be synchronous. */
export async function spendPitFight() {
  const st = (await kvGet('pitEnergy', null)) || {};
  if (st.date !== dateKey()) await refreshPitEnergy();
  let used = null;
  await kvUpdate('pitEnergy', cur => {
    const s = cur || {};
    if ((s.freeUsed || 0) < FREE_FIGHTS) { used = 'free'; return { ...s, freeUsed: (s.freeUsed || 0) + 1 }; }
    if ((s.vigor || 0) > 0) { used = 'vigor'; return { ...s, vigor: clampVigor(s.vigor - 1) }; }
    return undefined;   // tapped out: nothing owed, so nothing is written
  }, {});
  return used ? { ok: true, used } : { ok: false };
}
