// Daily + weekly quests. Rotation is seeded by date so everyone (and every
// device) sees the same quests on the same day: server-friendly by design.
// Progress is derived from real data; claims are idempotent xp-ledger events.

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

// ctx: {entries, xpRows (for the date), health, targets, priorFoodIds, weights, hkConnected}
export const QUEST_POOL = [
  {
    id: 'q-first', name: 'Show up', desc: 'Log anything at all',
    coins: 40, needsHk: false,
    progress: c => ({ cur: Math.min(1, c.entries.length), target: 1 }),
  },
  {
    id: 'q-log5', name: 'Deep log', desc: 'Log 5 or more items today',
    coins: 50, needsHk: false,
    progress: c => ({ cur: Math.min(5, c.entries.length), target: 5 }),
  },
  {
    id: 'q-3meals', name: 'Square meals', desc: 'Log breakfast, lunch, and dinner',
    coins: 60, needsHk: false,
    progress: c => ({ cur: [0, 1, 2].filter(m => c.entries.some(e => e.meal === m)).length, target: 3 }),
  },
  {
    id: 'q-protein-half', name: 'Front-load protein', desc: 'Half your protein target by end of lunch',
    coins: 60, needsHk: false,
    progress: c => {
      const p = dayTotals(c.entries.filter(e => e.meal <= 1)).p;
      const target = Math.round((c.targets?.p || 150) / 2);
      return { cur: Math.min(target, Math.round(p)), target };
    },
  },
  {
    id: 'q-protein-full', name: 'Protein bullseye', desc: 'Hit your full protein target',
    coins: 70, needsHk: false,
    progress: c => {
      const target = c.targets?.p || 150;
      return { cur: Math.min(target, Math.round(dayTotals(c.entries).p)), target };
    },
  },
  {
    id: 'q-fiber', name: 'Fiber up', desc: 'Log 25 g of fiber',
    coins: 60, needsHk: false,
    progress: c => ({ cur: Math.min(25, Math.round(dayTotals(c.entries).fiber)), target: 25 }),
  },
  {
    id: 'q-scan', name: 'Laser checkout', desc: 'Log a food by scanning its barcode',
    coins: 50, needsHk: false,
    progress: c => ({ cur: Math.min(1, c.xpRows.filter(r => r.type === 'scan').length), target: 1 }),
  },
  {
    id: 'q-new-food', name: 'Explorer', desc: 'Log a food you have never logged before',
    coins: 50, needsHk: false,
    progress: c => ({
      cur: Math.min(1, c.entries.filter(e => e.foodId && !c.priorFoodIds.has(e.foodId)).length),
      target: 1,
    }),
  },
  {
    id: 'q-early', name: 'Early bird', desc: 'Log breakfast before 10 am',
    coins: 40, needsHk: false,
    progress: c => ({
      cur: Math.min(1, c.entries.filter(e => e.meal === 0 && new Date(e.ts).getHours() < 10).length),
      target: 1,
    }),
  },
  {
    id: 'q-weigh', name: 'Data point', desc: 'Log a weigh-in',
    coins: 40, needsHk: false,
    progress: c => ({ cur: c.weighedToday ? 1 : 0, target: 1 }),
  },
  {
    id: 'q-hunt', name: 'Boneyard sweep', desc: 'Collect 2 spawns on the radar',
    coins: 70, needsHk: false, needsHunt: true,
    progress: c => ({ cur: Math.min(2, c.xpRows.filter(r => r.type === 'spawn').length), target: 2 }),
  },
  {
    id: 'q-steps8', name: 'Get moving', desc: 'Sync 8,000+ steps from Apple Health',
    coins: 60, needsHk: true,
    progress: c => ({ cur: Math.min(8000, c.health?.steps || 0), target: 8000 }),
  },
  {
    id: 'q-steps11', name: 'Long haul', desc: 'Sync 11,000+ steps from Apple Health',
    coins: 80, needsHk: true,
    progress: c => ({ cur: Math.min(11000, c.health?.steps || 0), target: 11000 }),
  },
];

export function dailyQuests(date, { hkConnected = false, huntEnabled = false } = {}) {
  const pool = QUEST_POOL.filter(q => (!q.needsHk || hkConnected) && (!q.needsHunt || huntEnabled));
  const rand = mulberry32(hashStr('quests:' + date));
  const picked = [];
  const used = new Set();
  while (picked.length < 3 && used.size < pool.length) {
    const i = Math.floor(rand() * pool.length);
    if (used.has(i)) continue;
    used.add(i);
    picked.push(pool[i]);
  }
  return picked;
}

export function questState(q, ctx, xpRows) {
  const { cur, target } = q.progress(ctx);
  const claimed = xpRows.some(r => r.key === `quest-${ctx.date}-${q.id}`);
  return { cur, target, done: cur >= target, claimed };
}

export async function claimQuest(date, q) {
  const xp = await award(`quest-${date}-${q.id}`, 'quest', 25, `Quest: ${q.name}`, date);
  if (!xp) return null;
  await coinsAdd(q.coins);
  return { xp, coins: q.coins };
}

// Bonus crate when all three dailies are claimed.
export async function claimAllBonusIfDue(date, quests, xpRows) {
  const allClaimed = quests.every(q => xpRows.some(r => r.key === `quest-${date}-${q.id}`));
  if (!allClaimed) return null;
  const xp = await award(`questsall-${date}`, 'questsall', 30, 'All daily quests done', date);
  if (!xp) return null;
  await grantCrate('daily', 'quests');
  return { xp, crate: 'daily' };
}

/* ---------- weekly ---------- */
export function weekKeyOf(date) {
  // ISO week: Monday start
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const day = (dt.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(y, m - 1, d - day);
  return dateKey(monday);
}

export function weekDates(weekKey) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekKey, i));
}

export const WEEKLY = { name: 'Protein week', desc: 'Hit your protein target on 5 days this week', target: 5, coins: 150 };

export function weeklyState(allXpRows, date) {
  const wk = weekKeyOf(date);
  const days = weekDates(wk);
  const cur = days.filter(d => allXpRows.some(r => r.key === `protein-${d}`)).length;
  const claimed = allXpRows.some(r => r.key === `weekly-${wk}`);
  return { weekKey: wk, cur, target: WEEKLY.target, done: cur >= WEEKLY.target, claimed };
}

export async function claimWeekly(weekKey) {
  const xp = await award(`weekly-${weekKey}`, 'weekly', 60, 'Weekly: ' + WEEKLY.name, weekKey);
  if (!xp) return null;
  await coinsAdd(WEEKLY.coins);
  await grantCrate('golden', 'weekly');
  return { xp, coins: WEEKLY.coins, crate: 'golden' };
}
