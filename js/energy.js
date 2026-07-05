// Pit energy (hybrid): a few free fights every day, plus extra fights fuelled by
// VIGOR that you earn ONLY from healthy behaviour — logging food and getting
// steps. It never hard-locks (the free floor is always there) and never rewards
// eating less: Vigor comes from logging + walking, not from a calorie deficit.
import { db, kvGet, kvSet } from './db.js';
import { dateKey } from './nutrition.js';

export const FREE_FIGHTS = 3;          // free Pit fights every day, no strings attached
export const VIGOR_CAP = 12;           // most banked Vigor you can hold
export const STEP_VIGOR_PER = 2500;    // +1 Vigor per this many steps today...
export const STEP_VIGOR_CAP = 6;       // ...up to this many from steps per day
export const LOG_VIGOR_PER_MEAL = 2;   // +2 Vigor per distinct meal logged today...
export const LOG_VIGOR_CAP = 6;        // ...up to this many from logging per day

const clampVigor = v => Math.max(0, Math.min(VIGOR_CAP, v));

function view(st) {
  const free = Math.max(0, FREE_FIGHTS - (st.freeUsed || 0));
  const vigor = clampVigor(st.vigor || 0);
  return { free, freeMax: FREE_FIGHTS, vigor, vigorCap: VIGOR_CAP, ready: free + vigor };
}

// today's healthy-behaviour signals: steps walked + distinct meals logged
async function todaySignals() {
  const today = dateKey();
  const health = await db.all('health');
  const steps = health.filter(h => h.date === today).reduce((a, h) => a + (h.steps || 0), 0);
  const log = await db.byIndex('log', 'date', today);
  const meals = new Set((log || []).map(e => e.meal)).size;
  return { steps, meals };
}

// Recompute today's energy, awarding Vigor from logging + steps IDEMPOTENTLY
// (safe to call on every Pit render / step sync). Banked Vigor carries across
// days up to the cap; the free-fight floor resets each day.
export async function refreshPitEnergy() {
  const st = (await kvGet('pitEnergy', null)) || {};
  const today = dateKey();
  if (st.date !== today) { st.date = today; st.freeUsed = 0; st.fromSteps = 0; st.fromLog = 0; }
  st.vigor = clampVigor(st.vigor || 0);
  const { steps, meals } = await todaySignals();
  const stepTarget = Math.min(STEP_VIGOR_CAP, Math.floor(steps / STEP_VIGOR_PER));
  const logTarget = Math.min(LOG_VIGOR_CAP, meals * LOG_VIGOR_PER_MEAL);
  const gain = Math.max(0, stepTarget - (st.fromSteps || 0)) + Math.max(0, logTarget - (st.fromLog || 0));
  if (gain > 0) st.vigor = clampVigor(st.vigor + gain);
  st.fromSteps = Math.max(st.fromSteps || 0, stepTarget);
  st.fromLog = Math.max(st.fromLog || 0, logTarget);
  await kvSet('pitEnergy', st);
  return view(st);
}

// Current energy without recomputing (fast read for gating a button).
export async function pitEnergy() { return view((await kvGet('pitEnergy', {})) || {}); }

// Consume one Pit fight: spend the free floor first, then banked Vigor.
// Returns { ok, used: 'free' | 'vigor' } or { ok: false } when tapped out.
export async function spendPitFight() {
  let st = (await kvGet('pitEnergy', null)) || {};
  if (st.date !== dateKey()) { await refreshPitEnergy(); st = (await kvGet('pitEnergy', {})) || {}; }
  if ((st.freeUsed || 0) < FREE_FIGHTS) { st.freeUsed = (st.freeUsed || 0) + 1; await kvSet('pitEnergy', st); return { ok: true, used: 'free' }; }
  if ((st.vigor || 0) > 0) { st.vigor = clampVigor(st.vigor - 1); await kvSet('pitEnergy', st); return { ok: true, used: 'vigor' }; }
  return { ok: false };
}
