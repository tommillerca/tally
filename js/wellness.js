// Daily wellness self-care: water, made-bed, sleep. Pure positive habits — they
// ONLY ever add a reward, never punish (wellbeing contract). Each completion
// writes an idempotent ledger event (type 'wellness') dated today, so quests can
// read it and the XP is one-time per day. State for the day lives in kv 'wellness'.
import { kvGet, kvSet, db, payAtomic } from './db.js';
import { award, awardCapped, finishAward } from './game.js';
import { refreshPitEnergy, VIGOR_CAP } from './energy.js';
import { dateKey } from './nutrition.js';

export const WATER_GOAL = 8; // cups

export async function getWellness(date = dateKey()) {
  const w = await kvGet('wellness', null);
  if (!w || w.date !== date) return { date, water: 0, bed: false, sleep: false, sleepHours: null };
  if (w.sleepHours === undefined) w.sleepHours = null; // legacy bool rows: no hours on record
  return w;
}
// The live completion transition and its entire local payout share one commit.
// The ledger remains authority for repeats, including legacy paid rows.
async function completeWellness(date, decide) {
  const result = await payAtomic({
    snapshot: { keys: ['wellness'], stores: ['health', 'xp'] },
    decide(state, rows) {
      const w = state.wellness?.date === date ? state.wellness
        : { date, water: 0, bed: false, sleep: false, sleepHours: null };
      if (w.sleepHours === undefined) w.sleepHours = null;
      const h = rows.health.find(r => r.date === date) || { date };
      const plan = decide(w, h);
      const paid = plan.key && !rows.xp.some(r => r.key === plan.key);
      const xp = paid ? plan.xp : 0;
      return {
        result: { ...plan.result, xp },
        kv: { wellness: () => w },
        puts: [...(plan.health ? [{ store: 'health', val: h }] : []),
          ...(paid ? [{ store: 'xp', val: { key: plan.key, type: 'wellness', xp,
            label: plan.label, date, ts: Date.now() } }] : [])],
      };
    },
  });
  if (result.xp > 0) await finishAward(result.xp);
  return result;
}

export async function addWater(n = 1, date = dateKey()) {
  return completeWellness(date, w => {
    const wasGoal = w.water >= WATER_GOAL;
    w.water = Math.max(0, Math.min(WATER_GOAL, w.water + n));
    return { key: !wasGoal && w.water >= WATER_GOAL ? `water-${date}` : null,
      xp: 8, label: 'Drank enough water', result: { w, reachedGoal: w.water >= WATER_GOAL } };
  });
}

export async function markBed(date = dateKey()) {
  return completeWellness(date, w => {
    const first = !w.bed;
    w.bed = true;
    return { key: first ? `bed-${date}` : null, xp: 5, label: 'Made your bed', result: { w } };
  });
}

// Editing hours updates the trend, but logging sleep only pays once per day.
export async function markSleep(hours, date = dateKey()) {
  hours = Math.max(1, Math.min(14, Number(hours) || 0));
  return completeWellness(date, (w, h) => {
    const first = w.sleepHours == null;
    w.sleepHours = hours; w.sleep = true;
    h.sleepHours = hours; h.sleepMin = Math.round(hours * 60);
    h.sleepManual = true; h.sleepAuto = false; h.sleepStaged = false;
    h.sleepDeepMin = null; h.sleepRemMin = null; h.sleepCoreMin = null; h.sleepAwakeMin = null;
    return { key: first ? `sleep-${date}` : null, xp: 10, label: `Slept ${hours}h`,
      health: true, result: { w, hours, first } };
  });
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
 *   XP     ledger row of type 'wellness', so it also counts toward the
 *          wellness quests (wellnessDays / w-wellness) like water/bed/sleep
 *   Vigor  +1 in the same commit, banked exactly like a Vigor Draught
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
// { ok, xp, vigor, count } or { ok: false, reason: 'capped' }.
export async function logManualWalk(minutes, date = dateKey()) {
  const min = Math.max(1, Math.min(MANUAL_WALK_MAX_MIN, Math.round(Number(minutes) || 0)));
  // Refresh verified-step energy before accepting a walk, as addVigor did.
  if ((await kvGet('pitEnergy', {}))?.date !== dateKey()) await refreshPitEnergy();
  const result = await payAtomic({
    snapshot: { keys: ['pitEnergy'], stores: ['health', 'xp'] },
    decide(state, rows) {
      const h = rows.health.find(r => r.date === date) || { date };
      const walks = Array.isArray(h.manualWalks) ? h.manualWalks : [];
      if (walks.length >= MANUAL_WALKS_PER_DAY) return { result: { ok: false, reason: 'capped' } };
      // A free daily ordinal becomes a completed walk. Never write verified steps.
      walks.push({ min, at: Date.now(), source: 'manual' });
      h.manualWalks = walks;
      const key = `mwalk-${date}-${walks.length}`;
      const paid = !rows.xp.some(r => r.key === key);
      return {
        result: { ok: true, xp: paid ? MANUAL_WALK_XP : 0, vigor: paid ? 1 : 0, count: walks.length },
        kv: paid ? { pitEnergy: cur => ({ ...(cur || {}),
          vigor: Math.max(0, Math.min(VIGOR_CAP, ((cur || {}).vigor || 0) + 1)) }) } : {},
        puts: [{ store: 'health', val: h }, ...(paid ? [{ store: 'xp', val: {
          key, type: 'wellness', xp: MANUAL_WALK_XP, label: `Walked ${min} min`, date, ts: Date.now(),
        } }] : [])],
      };
    },
  });
  if (result.xp > 0) await finishAward(result.xp);
  return result;
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
  /* THE CEILING USED TO BE READ, THEN DECIDED, ACROSS AN AWAIT: routinesDone()
     (a ledger scan) told this call how many of the ROUTINE_XP_CAP slots were
     already spent, and several awaits later a row was minted off that count.
     Two DIFFERENT routines finishing at once both read cap-1, both decided
     "I am the last paying slot", and both minted ROUTINE_XP: a documented
     15 XP ceiling paid 20 (measured 2026-09-06). The slot now has to be WON,
     not counted: awardCapped (js/game.js) claims one of ROUTINE_XP_CAP shared
     ordinal rows ('rslot-<date>-<n>') with the same addIfAbsent test-and-set
     every other repeatable daily reward uses, so only one caller can ever
     land a given slot and a caller past the cap gets 0 back, decided and
     written in the SAME transaction. `id` as the ref means a repeat tap of
     the SAME routine can never take a second slot. That slot row carries the
     real XP, so totalXp() counts it exactly once; the routine's OWN
     completion row below always carries 0 and exists only so THIS routine is
     remembered as done today, whether or not a slot was left for it. */
  const xp = await awardCapped('rslot', 'wellness', ROUTINE_XP, `Routine: ${item.name}`, ROUTINE_XP_CAP, date, id);
  await award(`routine-${id}-${date}`, 'wellness', 0, `Routine: ${item.name}`, date);
  return { ok: true, xp, capped: xp === 0 };
}
