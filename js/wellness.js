// Daily wellness self-care: water, made-bed, sleep. Pure positive habits — they
// ONLY ever add a reward, never punish (wellbeing contract). Each completion
// writes an idempotent ledger event (type 'wellness') dated today, so quests can
// read it and the XP is one-time per day. State for the day lives in kv 'wellness'.
import { kvGet, kvSet, db } from './db.js';
import { award } from './game.js';
import { addVigor } from './energy.js';
import { dateKey } from './nutrition.js';

export const WATER_GOAL = 8; // cups

export async function getWellness(date = dateKey()) {
  const w = await kvGet('wellness', null);
  if (!w || w.date !== date) return { date, water: 0, bed: false, sleep: false, sleepHours: null };
  if (w.sleepHours === undefined) w.sleepHours = null; // legacy bool rows: no hours on record
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
// Log hours slept. Re-tapping updates the hours (and the trend) but only awards
// XP once/day. Wellbeing contract: we reward LOGGING sleep, never scale the
// reward down for a short night. Persists hours to the per-date health row so
// Trends can chart sleep over time.
export async function markSleep(hours, date = dateKey()) {
  hours = Math.max(1, Math.min(14, Number(hours) || 0));
  const w = await getWellness(date); const first = w.sleepHours == null;
  w.sleepHours = hours; w.sleep = true; await save(w);
  const h = (await db.get('health', date)) || { date };
  // Manual entry: hours only, no stages. Flag it so the auto watch-read won't
  // overwrite a night the player deliberately logged by hand.
  h.sleepHours = hours; h.sleepMin = Math.round(hours * 60);
  h.sleepManual = true; h.sleepAuto = false; h.sleepStaged = false;
  h.sleepDeepMin = null; h.sleepRemMin = null; h.sleepCoreMin = null; h.sleepAwakeMin = null;
  await db.put('health', h);
  let xp = 0;
  if (first) xp = await award(`sleep-${date}`, 'wellness', 10, `Slept ${hours}h`, date);
  return { w, xp, hours, first };
}

/* MANUAL WALKS: "Add a walk" for players with no HealthKit / no watch.
 *
 * LOCAL REWARDS ONLY, and that boundary is the whole design. The weekly step
 * race pays real prizes: weekStepsNow() (js/app.js) builds profile.weekSteps by
 * summing `r.steps` across db 'health' rows, and the server's anti-cheat bound
 * (MAX_STEPS_PER_DAY in server/src/index.js) assumes every step in that sum was
 * counted by a phone. A self-reported walk in that sum is a prize-fraud button.
 * So a manual walk NEVER writes a `steps` field anywhere: it lives in its own
 * `manualWalks` list on the per-date health row, which weekStepsNow, the
 * Vigor-from-steps watermark (todaySignals in js/energy.js) and questCtx.steps
 * all ignore because each of them reads only `r.steps`.
 *
 * What it DOES pay, through the same local ledgers everything else uses:
 *   XP     award() row of type 'wellness', so it also counts toward the
 *          wellness quests (wellnessDays / w-wellness) like water/bed/sleep
 *   Vigor  addVigor(1), banked exactly like a Vigor Draught
 */
export const MANUAL_WALK_MAX_MIN = 60;
/* Two a day, enforced HERE in the write path rather than in the UI: a manual
   walk is self-reported and free to tap, so without a hard bound it is an
   XP-and-Vigor faucet. Two covers a real day (a morning and an evening walk)
   without paying anyone to sit and tap. */
export const MANUAL_WALKS_PER_DAY = 2;
export const MANUAL_WALK_XP = 10;

export async function manualWalksToday(date = dateKey()) {
  const h = await db.get('health', date);
  return (h && Array.isArray(h.manualWalks)) ? h.manualWalks : [];
}

// Log one walk of up to MANUAL_WALK_MAX_MIN minutes. Returns
// { ok, xp, energy, count } or { ok: false, reason: 'capped' }.
export async function logManualWalk(minutes, date = dateKey()) {
  const min = Math.max(1, Math.min(MANUAL_WALK_MAX_MIN, Math.round(Number(minutes) || 0)));
  const h = (await db.get('health', date)) || { date };
  const walks = Array.isArray(h.manualWalks) ? h.manualWalks : [];
  if (walks.length >= MANUAL_WALKS_PER_DAY) return { ok: false, reason: 'capped' };
  walks.push({ min, at: Date.now(), source: 'manual' });
  h.manualWalks = walks; // never h.steps: see the block comment above
  await db.put('health', h);
  const xp = await award(`mwalk-${date}-${walks.length}`, 'wellness', MANUAL_WALK_XP, `Walked ${min} min`, date);
  // Vigor rides the award's idempotency: two overlapping taps race the cap
  // read above, but they mint the same ledger key, so only the one whose
  // award() actually paid banks the Vigor (one extra Pit fight per walk).
  if (xp > 0) await addVigor(1);
  return { ok: true, xp, vigor: xp > 0 ? 1 : 0, count: walks.length };
}

/* USER ROUTINES.
 *
 * Tom, 2026-08-06: "it would be cool to have a part of the app where could set
 * routines or personal tasks you need to accomplish."
 *
 * The three habits above are hard-coded because they are the ones the game has
 * opinions about. A routine is whatever YOU decide it is: stretch, meds, walk
 * the dog, ten minutes of guitar. Definitions live in kv 'routines'; completions
 * write the SAME idempotent ledger rows the built-in habits use, so a routine
 * counts toward the wellness quest and the streak for free, with no new store.
 *
 * XP IS CAPPED ON PURPOSE. A task you write yourself is an XP faucet you control,
 * so only the first ROUTINE_XP_CAP completions each day pay. Beyond that a
 * routine still ticks, still counts, just does not print money. The built-in
 * habits are safe from this because there are exactly three of them.
 */
export const ROUTINE_XP = 5;
export const ROUTINE_XP_CAP = 3;   // XP-earning completions per day
export const ROUTINE_MAX = 12;     // a to-do list, not a second app

export async function getRoutines() {
  const list = await kvGet('routines', null);
  return Array.isArray(list) ? list : [];
}
export async function addRoutine(name) {
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) return { ok: false, reason: 'empty' };
  const list = await getRoutines();
  if (list.length >= ROUTINE_MAX) return { ok: false, reason: 'full', max: ROUTINE_MAX };
  // ids are minted from the clock, never from the name: renaming or repeating a
  // name must not collide with an existing routine's ledger history
  list.push({ id: `r${Date.now().toString(36)}${list.length}`, name: clean });
  await kvSet('routines', list);
  return { ok: true, list };
}
export async function removeRoutine(id) {
  const list = (await getRoutines()).filter(r => r.id !== id);
  await kvSet('routines', list);
  return list;
}

// Which routines are done today. Read from the LEDGER, not a separate flag, so
// it cannot drift out of step with what was actually awarded.
export async function routinesDone(date = dateKey(), xpRows = null) {
  const rows = xpRows || await db.all('xp');   // renderToday hands in the xp rows it holds (QA round 28 G3)
  const done = new Set();
  for (const r of rows) {
    if (r.type === 'wellness' && r.date === date && r.key.startsWith('routine-')) {
      done.add(r.key.slice('routine-'.length, r.key.length - date.length - 1));
    }
  }
  return done;
}

export async function markRoutine(id, date = dateKey()) {
  const list = await getRoutines();
  const item = list.find(r => r.id === id);
  if (!item) return { ok: false };
  const done = await routinesDone(date);
  if (done.has(id)) return { ok: true, xp: 0, already: true };
  const xp = done.size < ROUTINE_XP_CAP ? ROUTINE_XP : 0;
  await award(`routine-${id}-${date}`, 'wellness', xp, `Routine: ${item.name}`, date);
  return { ok: true, xp, capped: xp === 0 };
}
