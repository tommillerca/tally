// Pit energy (hybrid): a few free fights every day, plus extra fights fuelled by
// VIGOR that you earn ONLY from healthy behaviour — logging food and getting
// steps. It never hard-locks (the free floor is always there) and never rewards
// eating less: Vigor comes from logging + walking, not from a calorie deficit.
import { db, kvGet, kvSet, claimDay } from './db.js';
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
export async function refreshPitEnergy() {
  const st = (await kvGet('pitEnergy', null)) || {};
  const today = dateKey();
  /* MONOTONIC DAY GUARD (js/db.js claimDay). FREE_FIGHTS refills purely because
     the stored date stopped matching dateKey(), which is three free Pit fights
     per clock nudge (measured at 3.0 per reset). The stored date still moves so
     this cannot loop, but the FLOOR only refills on a day the device honestly
     reached; on a distrusted day freeUsed carries over and the player keeps
     whatever they had left, which is the never-hard-lock promise above. */
  if (st.date !== today) {
    const day = await claimDay(today);
    st.date = today;
    if (day.fresh) { st.freeUsed = 0; st.fromSteps = 0; st.fromLog = 0; }
  }
  st.vigor = clampVigor(st.vigor || 0);
  const { steps } = await todaySignals();
  const stepTarget = Math.min(STEP_VIGOR_CAP, Math.floor(steps / STEP_VIGOR_PER));
  /* Kept, at zero, rather than deleted: st.fromLog carries a number on every
     existing player's device. Leaving the term in place means their banked
     Vigor is untouched and nothing is clawed back on the update. */
  const logTarget = 0;
  const gain = Math.max(0, stepTarget - (st.fromSteps || 0)) + Math.max(0, logTarget - (st.fromLog || 0));
  if (gain > 0) st.vigor = clampVigor(st.vigor + gain);
  st.fromSteps = Math.max(st.fromSteps || 0, stepTarget);
  st.fromLog = Math.max(st.fromLog || 0, logTarget);
  await kvSet('pitEnergy', st);
  return view(st);
}

// Current energy without recomputing (fast read for gating a button).
export async function pitEnergy() { return view((await kvGet('pitEnergy', {})) || {}); }

// Add banked Vigor (used by the Vigor Draught consumable). Clamped to the cap;
// returns the new energy view. Never rewards eating less — this is a spent item.
export async function addVigor(n) {
  const st = (await kvGet('pitEnergy', null)) || {};
  if (st.date !== dateKey()) { await refreshPitEnergy(); }
  const s2 = (await kvGet('pitEnergy', {})) || {};
  s2.vigor = clampVigor((s2.vigor || 0) + n);
  await kvSet('pitEnergy', s2);
  return view(s2);
}

// Consume one Pit fight: spend the free floor first, then banked Vigor.
// Returns { ok, used: 'free' | 'vigor' } or { ok: false } when tapped out.
export async function spendPitFight() {
  let st = (await kvGet('pitEnergy', null)) || {};
  if (st.date !== dateKey()) { await refreshPitEnergy(); st = (await kvGet('pitEnergy', {})) || {}; }
  if ((st.freeUsed || 0) < FREE_FIGHTS) { st.freeUsed = (st.freeUsed || 0) + 1; await kvSet('pitEnergy', st); return { ok: true, used: 'free' }; }
  if ((st.vigor || 0) > 0) { st.vigor = clampVigor(st.vigor - 1); await kvSet('pitEnergy', st); return { ok: true, used: 'vigor' }; }
  return { ok: false };
}
