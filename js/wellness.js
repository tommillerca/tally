// Daily wellness self-care: water, made-bed, sleep. Pure positive habits — they
// ONLY ever add a reward, never punish (wellbeing contract). Each completion
// writes an idempotent ledger event (type 'wellness') dated today, so quests can
// read it and the XP is one-time per day. State for the day lives in kv 'wellness'.
import { kvGet, kvSet } from './db.js';
import { award } from './game.js';
import { dateKey } from './nutrition.js';

export const WATER_GOAL = 8; // cups

export async function getWellness(date = dateKey()) {
  const w = await kvGet('wellness', null);
  if (!w || w.date !== date) return { date, water: 0, bed: false, sleep: false };
  return w;
}
async function save(w) { await kvSet('wellness', w); }

// +1 cup of water; award once when you reach the goal. Returns { w, xp, reachedGoal }
// so the UI can surface the reward (the XP used to land silently).
export async function addWater(n = 1, date = dateKey()) {
  const w = await getWellness(date);
  const wasGoal = w.water >= WATER_GOAL;
  w.water = Math.max(0, Math.min(WATER_GOAL, w.water + n));
  await save(w);
  let xp = 0;
  if (!wasGoal && w.water >= WATER_GOAL) xp = await award(`water-${date}`, 'wellness', 8, 'Drank enough water', date);
  return { w, xp, reachedGoal: w.water >= WATER_GOAL };
}

// One-tap self-report; awards once per day. Returns { w, xp } (xp 0 if already done).
export async function markBed(date = dateKey()) {
  const w = await getWellness(date); let xp = 0;
  if (!w.bed) { w.bed = true; await save(w); xp = await award(`bed-${date}`, 'wellness', 5, 'Made your bed', date); }
  return { w, xp };
}
export async function markSleep(date = dateKey()) {
  const w = await getWellness(date); let xp = 0;
  if (!w.sleep) { w.sleep = true; await save(w); xp = await award(`sleep-${date}`, 'wellness', 10, 'Got a good night of sleep', date); }
  return { w, xp };
}
