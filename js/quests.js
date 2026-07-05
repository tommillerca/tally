// Quests across three periods: daily, weekly, monthly. Rotation is seeded by the
// period key so every device sees the same quests for the same day/week/month:
// server-friendly by design. Progress is derived from real ledger + log data;
// claims are idempotent xp-ledger events keyed `quest-<periodKey>-<id>`.
//
// The pool is deliberately cross-category (log / walk / Pit / world boss / hunt)
// and weighted toward walking + the Pit: the fun is going outside and fighting,
// not a logging bonus. Wellbeing guardrail holds: nothing here ever rewards
// eating less. Longer periods pay bigger (coins + crates) for tougher targets.

import { dayTotals, addDays, dateKey } from './nutrition.js';
import { award } from './game.js';
import { coinsAdd, grantCrate } from './loot.js';

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- period math ---------- */
export function weekKeyOf(date) {
  // ISO-ish week, Monday start; key = that Monday's date
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = (dt.getDay() + 6) % 7;
  const monday = new Date(y, m - 1, d - day);
  return dateKey(monday);
}
export function weekDates(weekKey) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekKey, i));
}
export function monthKeyOf(date) { return date.slice(0, 7); } // 'YYYY-MM'
export function monthDates(date) {
  const [y, m] = date.split('-').map(Number);
  const n = new Date(y, m, 0).getDate(); // days in the month
  return Array.from({ length: n }, (_, i) => dateKey(new Date(y, m - 1, i + 1)));
}

export function periodKeyOf(period, date) {
  return period === 'week' ? weekKeyOf(date) : period === 'month' ? monthKeyOf(date) : date;
}
function periodDates(period, date) {
  return period === 'week' ? weekDates(weekKeyOf(date)) : period === 'month' ? monthDates(date) : [date];
}

// XP each claim grants, scaled by period.
const REWARD_XP = { day: 25, week: 70, month: 160 };

/* ---------- context ---------- */
// base: { date, entries (today), allXp, allLog, healthRows, targets,
//         weighedToday, priorFoodIds, hkConnected, huntEnabled }
export function questCtx(period, base) {
  const dates = periodDates(period, base.date);
  const set = new Set(dates);
  const inP = r => set.has(r.date);
  const countType = t => base.allXp.filter(r => r.type === t && inP(r)).length;
  const steps = (base.healthRows || []).filter(inP).reduce((a, r) => a + (r.steps || 0), 0);
  const logDays = new Set((base.allLog || []).filter(e => set.has(e.date)).map(e => e.date)).size;
  return {
    period,
    periodKey: periodKeyOf(period, base.date),
    allXp: base.allXp,
    // today-scoped (daily quests)
    entries: base.entries || [],
    weighedToday: base.weighedToday,
    priorFoodIds: base.priorFoodIds || new Set(),
    scanToday: base.allXp.some(r => r.type === 'scan' && r.date === base.date),
    targets: base.targets,
    // period-scoped aggregates
    steps,
    pitWins: countType('fight'),
    bossWins: countType('boss'),
    spawns: countType('spawn'),
    proteinDays: countType('protein'),
    logDays,
  };
}

/* ---------- pools ---------- */
// Each quest: { id, name, desc, coins, crate?, need?, progress(ctx) -> {cur,target} }
const clamp = (v, t) => ({ cur: Math.min(t, Math.max(0, Math.round(v))), target: t });

export const DAILY_POOL = [
  { id: 'q-first', name: 'Show up', desc: 'Log anything at all', coins: 30,
    progress: c => clamp(c.entries.length, 1) },
  { id: 'q-log5', name: 'Deep log', desc: 'Log 5 items today', coins: 50,
    progress: c => clamp(c.entries.length, 5) },
  { id: 'q-3meals', name: 'Square meals', desc: 'Log breakfast, lunch, and dinner', coins: 60,
    progress: c => clamp([0, 1, 2].filter(m => c.entries.some(e => e.meal === m)).length, 3) },
  { id: 'q-protein', name: 'Protein bullseye', desc: 'Hit your full protein target', coins: 70,
    progress: c => { const t = c.targets?.p || 150; return clamp(dayTotals(c.entries).p, t); } },
  { id: 'q-scan', name: 'Laser checkout', desc: 'Log a food by scanning its barcode', coins: 40,
    progress: c => clamp(c.scanToday ? 1 : 0, 1) },
  { id: 'q-new-food', name: 'Explorer', desc: 'Log a food you have never logged before', coins: 50,
    progress: c => clamp(c.entries.filter(e => e.foodId && !c.priorFoodIds.has(e.foodId)).length, 1) },
  { id: 'q-weigh', name: 'Data point', desc: 'Log a weigh-in', coins: 40,
    progress: c => clamp(c.weighedToday ? 1 : 0, 1) },
  { id: 'q-pit1', name: 'Pit scrap', desc: 'Win a Pit fight', coins: 60,
    progress: c => clamp(c.pitWins, 1) },
  { id: 'q-pit3', name: 'Pit run', desc: 'Win 3 Pit fights today', coins: 80,
    progress: c => clamp(c.pitWins, 3) },
  { id: 'q-hunt', name: 'Boneyard sweep', desc: 'Collect 2 spawns on the map', coins: 70, need: 'hunt',
    progress: c => clamp(c.spawns, 2) },
  { id: 'q-steps8', name: 'Get moving', desc: 'Walk 8,000 steps', coins: 60, need: 'hk',
    progress: c => clamp(c.steps, 8000) },
  { id: 'q-steps11', name: 'Long haul', desc: 'Walk 11,000 steps', coins: 80, need: 'hk',
    progress: c => clamp(c.steps, 11000) },
];

export const WEEKLY_POOL = [
  { id: 'w-steps', name: 'Trailblazer', desc: 'Walk 50,000 steps this week', coins: 150, crate: 'golden', need: 'hk',
    progress: c => clamp(c.steps, 50000) },
  { id: 'w-pit', name: 'Pit regular', desc: 'Win 12 Pit fights this week', coins: 150, crate: 'golden',
    progress: c => clamp(c.pitWins, 12) },
  { id: 'w-protein', name: 'Protein week', desc: 'Hit your protein target on 5 days', coins: 150, crate: 'golden',
    progress: c => clamp(c.proteinDays, 5) },
  { id: 'w-boss', name: 'Boss hunter', desc: 'Beat 2 world bosses this week', coins: 180, crate: 'golden',
    progress: c => clamp(c.bossWins, 2) },
  { id: 'w-hunt', name: 'Scavenger', desc: 'Collect 15 spawns this week', coins: 140, crate: 'golden', need: 'hunt',
    progress: c => clamp(c.spawns, 15) },
  { id: 'w-log', name: 'Steady logger', desc: 'Log on 5 days this week', coins: 120, crate: 'golden',
    progress: c => clamp(c.logDays, 5) },
];

export const MONTHLY_POOL = [
  { id: 'm-steps', name: 'Marathoner', desc: 'Walk 200,000 steps this month', coins: 400, crate: 'egg', need: 'hk',
    progress: c => clamp(c.steps, 200000) },
  { id: 'm-pit', name: 'Pit veteran', desc: 'Win 50 Pit fights this month', coins: 400, crate: 'egg',
    progress: c => clamp(c.pitWins, 50) },
  { id: 'm-boss', name: 'Boss slayer', desc: 'Beat 8 world bosses this month', coins: 500, crate: 'egg',
    progress: c => clamp(c.bossWins, 8) },
  { id: 'm-protein', name: 'Protein month', desc: 'Hit your protein target on 20 days', coins: 400, crate: 'egg',
    progress: c => clamp(c.proteinDays, 20) },
];

function pick(pool, seedStr, n, { hkConnected, huntEnabled } = {}) {
  const avail = pool.filter(q => (q.need !== 'hk' || hkConnected) && (q.need !== 'hunt' || huntEnabled));
  const rand = mulberry32(hashStr(seedStr));
  const out = [], used = new Set();
  while (out.length < n && used.size < avail.length) {
    const i = Math.floor(rand() * avail.length);
    if (used.has(i)) continue;
    used.add(i); out.push(avail[i]);
  }
  return out;
}

export function dailyQuests(date, opts = {}) { return pick(DAILY_POOL, 'quests:' + date, 3, opts); }
export function weeklyQuests(date, opts = {}) { return pick(WEEKLY_POOL, 'weekly:' + weekKeyOf(date), 3, opts); }
export function monthlyQuests(date, opts = {}) { return pick(MONTHLY_POOL, 'monthly:' + monthKeyOf(date), 2, opts); }

/* ---------- state + claim ---------- */
export function questState(q, ctx) {
  const { cur, target } = q.progress(ctx);
  const claimed = ctx.allXp.some(r => r.key === `quest-${ctx.periodKey}-${q.id}`);
  return { cur, target, done: cur >= target, claimed };
}

export async function claimQuest(periodKey, q, period = 'day') {
  const xp = await award(`quest-${periodKey}-${q.id}`, 'quest', REWARD_XP[period] || 25, `Quest: ${q.name}`);
  if (!xp) return null;
  await coinsAdd(q.coins);
  if (q.crate) await grantCrate(q.crate, 'quests');
  return { xp, coins: q.coins, crate: q.crate || null };
}

// Bonus daily crate when all three dailies are claimed.
export async function claimAllBonusIfDue(date, quests, allXp) {
  const allClaimed = quests.every(q => allXp.some(r => r.key === `quest-${date}-${q.id}`));
  if (!allClaimed) return null;
  const xp = await award(`questsall-${date}`, 'questsall', 30, 'All daily quests done', date);
  if (!xp) return null;
  await grantCrate('daily', 'quests');
  return { xp, crate: 'daily' };
}
