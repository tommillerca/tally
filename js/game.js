// Gamification: XP, levels, badges, and Apple Health payload parsing.
// XP events are append-only rows in the 'xp' store, keyed for idempotency:
// awarding the same key twice is a no-op, so backfills and retries are safe.

import { db, kvGet, kvSet } from './db.js';
import { dayTotals, addDays, dateKey, streakFrom } from './nutrition.js';
import { consumeXpBoostCharge, consumeFreeze, grantCrate, grantConsumable, coinsAdd } from './loot.js';
import { BH_SLOTS } from '../data/boneheadz.js';

// Streak counts logged days PLUS days protected by a Streak Freeze marker.
export function streakDateSet(log, xpRows) {
  const set = new Set(log.map(e => e.date));
  for (const r of xpRows) if (r.type === 'freeze') set.add(r.date);
  return set;
}

export const LEVEL_NAMES = [
  'Rookie Logger', 'Snack Scout', 'Barcode Cadet', 'Portion Padawan', 'Macro Apprentice',
  'Kitchen Chemist', 'Protein Prefect', 'Streak Runner', 'Label Sleuth', 'Calorie Cartographer',
  'Meal Strategist', 'Macro Machinist', 'Data Gourmet', 'Trend Tamer', 'Deficit Architect',
  'Gainz Engineer', 'Nutrition Ninja', 'Macro Wizard', 'Legendary Logger', 'Bone Grandmaster',
];

export function xpForLevel(L) {
  if (L <= 1) return 0;
  return Math.round((120 * Math.pow(L - 1, 1.55) + 80 * (L - 1)) / 10) * 10;
}

export function levelFor(xp) {
  let L = 1;
  while (xpForLevel(L + 1) <= xp) L++;
  const cur = xpForLevel(L), next = xpForLevel(L + 1);
  return {
    level: L,
    name: L <= LEVEL_NAMES.length ? LEVEL_NAMES[L - 1] : `${LEVEL_NAMES[LEVEL_NAMES.length - 1]} ${L}`,
    into: xp - cur,
    need: next - cur,
    pct: Math.max(0, Math.min(100, Math.round(((xp - cur) / (next - cur)) * 100))),
    nextAt: next,
    total: xp,
  };
}

export async function totalXp() {
  const rows = await db.all('xp');
  return rows.reduce((a, r) => a + (r.xp || 0), 0);
}

// Idempotent award. Returns the xp granted (0 if this key already exists).
let quietLevelups = false; // backfills replay history; they must not celebrate or drop loot

export async function award(key, type, xp, label, date) {
  const existing = await db.get('xp', key);
  if (existing) return 0;
  const before = await totalXp();
  await db.put('xp', { key, type, xp, label, date: date || dateKey(), ts: Date.now() });
  // any XP source can cross a level: steps, quests, pit wins, the road
  if (type !== 'levelup' && !quietLevelups) {
    const lvB = levelFor(before), lvA = levelFor(before + xp);
    if (lvA.level > lvB.level) {
      const rewards = await grantLevelRewards(lvB.level, lvA.level);
      if (typeof dispatchEvent === 'function') {
        dispatchEvent(new CustomEvent('bh-levelup', { detail: { levelUp: lvA, rewards } }));
      }
    }
  }
  return xp;
}

export function levelCoins(level) { return 20 + level * 5; }

// one reward drop per level, ever: ledger rows `levelup-N` make it idempotent,
// safe across multi-level jumps and every XP source
export async function grantLevelRewards(fromLevel, toLevel) {
  let coins = 0, crates = 0;
  for (let L = fromLevel + 1; L <= toLevel; L++) {
    const got = await award(`levelup-${L}`, 'levelup', 0, `Reached level ${L}`);
    const row = await db.get('xp', `levelup-${L}`);
    if (row && row.claimed) continue;
    if (row) { row.claimed = true; await db.put('xp', row); }
    await coinsAdd(levelCoins(L));
    await grantCrate('golden', 'level-' + L);
    coins += levelCoins(L); crates += 1;
  }
  return { coins, crates };
}

/* ---------------- badges ---------------- */

export const BADGES = [
  { id: 'first-log', icon: '🍽', name: 'First bite', desc: 'Log your first food' },
  { id: 'scan-1', icon: '📷', name: 'Laser eyes', desc: 'Log a food from a barcode scan' },
  { id: 'label-1', icon: '🔍', name: 'Fine print', desc: 'Create a food from a label photo' },
  { id: 'streak-3', icon: '🔥', name: 'Warming up', desc: 'Log 3 days in a row' },
  { id: 'streak-7', icon: '🚀', name: 'On a roll', desc: 'Log 7 days in a row' },
  { id: 'streak-30', icon: '🏆', name: 'Unstoppable', desc: 'Log 30 days in a row' },
  { id: 'protein-1', icon: '💪', name: 'Protein hit', desc: 'Hit your protein target for a day' },
  { id: 'protein-5', icon: '🦾', name: 'Protein week', desc: 'Hit protein 5 times' },
  { id: 'close-1', icon: '🎯', name: 'Bullseye', desc: 'Finish a day inside your calorie budget' },
  { id: 'logs-100', icon: '💯', name: 'Century club', desc: 'Log 100 foods' },
  { id: 'scan-25', icon: '🛒', name: 'Scanner pro', desc: '25 barcode scans logged' },
  { id: 'weigh-5', icon: '⚖️', name: 'Data driven', desc: 'Log 5 weigh-ins' },
  { id: 'steps-10k', icon: '👟', name: '10k stepper', desc: 'Sync a 10,000-step day from Apple Health' },
  { id: 'collector-10', icon: '🎩', name: 'Collector', desc: 'Own 10 Boneheadz cosmetics' },
  { id: 'drip-6', icon: '🧥', name: 'Full drip', desc: 'Have 6 or more slots equipped at once' },
  { id: 'hunter-1', icon: '🦴', name: 'First find', desc: 'Collect a Boneyard spawn' },
  { id: 'hunter-25', icon: '🗺', name: 'Boneyard regular', desc: 'Collect 25 Boneyard spawns' },
  { id: 'road-stop-1', icon: '🪧', name: 'First mile', desc: 'Claim a Bone Road stop' },
  { id: 'road-1', icon: '🗿', name: 'Road tripper', desc: 'Walk a full Bone Road lap' },
  { id: 'pit-1', icon: '🥊', name: 'Blooded', desc: 'Win a fight in The Pit' },
  { id: 'pit-25', icon: '💀', name: 'Pit fiend', desc: 'Win 25 Pit fights' },
  { id: 'pit-champ', icon: '👑', name: 'Kingslayer', desc: 'Dethrone the Marrow King' },
];

export function badgeCheck(id, st) {
  switch (id) {
    case 'first-log': return st.logs >= 1;
    case 'scan-1': return st.scans >= 1;
    case 'label-1': return st.labels >= 1;
    case 'streak-3': return st.streak >= 3;
    case 'streak-7': return st.streak >= 7;
    case 'streak-30': return st.streak >= 30;
    case 'protein-1': return st.proteinDays >= 1;
    case 'protein-5': return st.proteinDays >= 5;
    case 'close-1': return st.closes >= 1;
    case 'logs-100': return st.logs >= 100;
    case 'scan-25': return st.scans >= 25;
    case 'weigh-5': return st.weighs >= 5;
    case 'steps-10k': return st.maxSteps >= 10000;
    case 'collector-10': return st.cosmetics >= 10;
    case 'drip-6': return st.equippedSlots >= 6;
    case 'hunter-1': return st.spawns >= 1;
    case 'hunter-25': return st.spawns >= 25;
    case 'road-stop-1': return st.roadStops >= 1;
    case 'road-1': return st.roadCycles >= 1;
    case 'pit-1': return st.pitWins >= 1;
    case 'pit-25': return st.pitWins >= 25;
    case 'pit-champ': return st.pitChamp;
    default: return false;
  }
}

async function buildStats() {
  const [log, weights, xp, health, inv, eq] = await Promise.all([
    db.all('log'), db.all('weights'), db.all('xp'), db.all('health'), db.all('inv'), kvGet('equipped', {}),
  ]);
  const defaults = new Set(BH_SLOTS.filter(s => s.default).map(s => s.code));
  return {
    logs: log.length,
    scans: xp.filter(r => r.type === 'scan').length,
    labels: xp.filter(r => r.type === 'label').length,
    proteinDays: xp.filter(r => r.type === 'protein').length,
    closes: xp.filter(r => r.type === 'dayclose').length,
    weighs: weights.length,
    streak: streakFrom([...streakDateSet(log, xp)], dateKey()),
    maxSteps: Math.max(0, ...health.map(h => h.steps || 0)),
    cosmetics: inv.filter(r => r.kind === 'cos').length,
    spawns: xp.filter(r => r.type === 'spawn').length,
    roadStops: xp.filter(r => r.type === 'road').length,
    roadCycles: xp.filter(r => r.type === 'road' && r.key.endsWith('-6')).length,
    pitWins: xp.filter(r => r.type === 'fight').length,
    pitChamp: xp.some(r => r.type === 'pitchamp'),
    equippedSlots: Object.keys(eq).filter(k => !defaults.has(k)).length + 2, // body + skull always on
  };
}

// Awards any newly earned badges (+25 xp each). Returns the badge objects.
export async function evaluateBadges() {
  const st = await buildStats();
  const out = [];
  for (const b of BADGES) {
    const key = 'badge-' + b.id;
    const got = await db.get('xp', key);
    if (!got && badgeCheck(b.id, st)) {
      await award(key, 'badge', 25, b.name);
      out.push(b);
    }
  }
  return out;
}

export async function earnedBadgeIds() {
  const rows = await db.all('xp');
  return new Set(rows.filter(r => r.type === 'badge').map(r => r.key.slice(6)));
}

/* ---------------- triggers ---------------- */

const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100];

async function streakAwards(streak) {
  let gained = 0, milestone = null;
  for (const n of STREAK_MILESTONES) {
    if (streak >= n) {
      const g = await award(`streak-${n}`, 'streakms', 100, `${n}-day streak`);
      if (g) { gained += g; milestone = n; }
    }
  }
  return { gained, milestone };
}

// Called after a log entry is written. Returns {xp, levelUp, newBadges, streakMilestone, boosted}.
export async function onFoodLogged(entry, { via = null, targets = null, entriesForDate = [] } = {}) {
  const before = await totalXp();
  let gained = 0;
  const logXp = await award(`log-${entry.id}`, 'log', 10, 'Logged a food', entry.date);
  gained += logXp;
  gained += await award(`firstlog-${entry.date}`, 'firstlog', 15, 'First log of the day', entry.date);
  if (via === 'scan') gained += await award(`scan-${entry.date}-${entry.foodId || entry.id}`, 'scan', 15, 'Barcode scan', entry.date);
  if (via === 'label') gained += await award(`label-${entry.foodId || entry.id}`, 'label', 20, 'Label scan', entry.date);

  const tot = dayTotals(entriesForDate);
  if (targets && targets.p && tot.p >= targets.p) {
    gained += await award(`protein-${entry.date}`, 'protein', 40, 'Protein target hit', entry.date);
  }
  const meals = new Set(entriesForDate.map(e => e.meal));
  if ([0, 1, 2].every(m => meals.has(m))) {
    gained += await award(`meals3-${entry.date}`, 'meals', 20, 'All meals logged', entry.date);
  }

  // XP Boost: one charge per genuinely new log, doubles this action's xp.
  // The bonus is written to the ledger so totals stay a pure sum of events.
  let boosted = false;
  if (logXp > 0 && gained > 0) {
    const factor = await consumeXpBoostCharge();
    if (factor > 1) {
      const bonus = gained * (factor - 1);
      await award(`boost-${entry.id}`, 'boost', bonus, 'XP Boost x2', entry.date);
      gained += bonus;
      boosted = true;
    }
  }

  const [log, xpRows] = await Promise.all([db.all('log'), db.all('xp')]);
  const streak = streakFrom([...streakDateSet(log, xpRows)], dateKey());
  const sa = await streakAwards(streak);
  gained += sa.gained;
  if (sa.milestone) await grantCrate('golden', 'streak-' + sa.milestone);

  const newBadges = await evaluateBadges();
  gained += newBadges.length * 25;

  const after = before + gained;
  const lvBefore = levelFor(before), lvAfter = levelFor(after);
  const levelUp = lvAfter.level > lvBefore.level ? lvAfter : null;
  let levelRewards = null;
  if (levelUp) levelRewards = await grantLevelRewards(lvBefore.level, lvAfter.level);
  return {
    xp: gained,
    total: after,
    levelUp,
    levelRewards,
    newBadges,
    streakMilestone: sa.milestone,
    streak,
    boosted,
    crates: (levelUp ? levelRewards.crates : 0) + (sa.milestone ? 1 : 0),
  };
}

export async function onWeighIn(date) {
  const gained = await award(`weigh-${date}`, 'weigh', 15, 'Weigh-in', date);
  const newBadges = await evaluateBadges();
  return { xp: gained + newBadges.length * 25, newBadges };
}

export async function onHealthSync(date, { steps } = {}) {
  let gained = await award(`hk-${date}`, 'hk', 10, 'Apple Health sync', date);
  let egg = false;
  if (steps != null && steps >= 10000) {
    const g = await award(`egg-${date}`, 'egg', 15, '10k-step egg', date);
    if (g) { gained += g; await grantCrate('egg', 'steps-' + date); egg = true; }
  }
  const newBadges = await evaluateBadges();
  gained += newBadges.length * 25;
  return { xp: gained, newBadges, egg };
}

// At boot: settle yesterday (day-close bonus and any missed day checks).
export async function awardDayCloseIfDue(targets) {
  if (!targets) return null;
  const y = addDays(dateKey(), -1);
  const es = await db.byIndex('log', 'date', y);
  if (!es.length) return null;
  const tot = dayTotals(es);
  let closed = false;
  if (tot.kcal <= targets.kcal && tot.kcal >= targets.kcal * 0.6) {
    const g = await award(`dayclose-${y}`, 'dayclose', 50, 'Closed the day on budget', y);
    if (g) { await grantCrate('golden', 'dayclose-' + y); closed = true; }
  }
  if (targets.p && tot.p >= targets.p) await award(`protein-${y}`, 'protein', 40, 'Protein target hit', y);
  const meals = new Set(es.map(e => e.meal));
  if ([0, 1, 2].every(m => meals.has(m))) await award(`meals3-${y}`, 'meals', 20, 'All meals logged', y);
  await evaluateBadges();
  return closed ? { date: y } : null;
}

// At boot: if yesterday broke a streak and a Streak Freeze is in the inventory,
// consume it and mark the day as protected.
export async function checkStreakFreeze() {
  const y = addDays(dateKey(), -1);
  const [log, xpRows] = await Promise.all([db.all('log'), db.all('xp')]);
  if (log.some(e => e.date === y)) return null;
  if (xpRows.some(r => r.key === `freeze-${y}`)) return null;
  const dates = streakDateSet(log, xpRows);
  let d = addDays(y, -1), s = 0;
  while (dates.has(d)) { s++; d = addDays(d, -1); }
  if (s < 2) return null; // nothing meaningful to protect
  if (!(await consumeFreeze())) return null;
  await award(`freeze-${y}`, 'freeze', 0, 'Streak Freeze used', y);
  return { date: y, saved: s };
}

// One-time retroactive backfill so existing users start with their history honored.
export async function initGameIfNeeded(targets) {
  if (await kvGet('game-init')) return null;
  quietLevelups = true;
  try {
  const [log, weights] = await Promise.all([db.all('log'), db.all('weights')]);
  const today = dateKey();
  const dates = [...new Set(log.map(e => e.date))].sort();

  for (const e of log.slice(-400)) await award(`log-${e.id}`, 'log', 10, 'Logged a food', e.date);
  for (const d of dates) await award(`firstlog-${d}`, 'firstlog', 15, 'First log of the day', d);
  for (const w of weights.slice(-60)) await award(`weigh-${w.date}`, 'weigh', 15, 'Weigh-in', w.date);

  for (const d of dates) {
    if (d >= today) continue;
    const es = log.filter(e => e.date === d);
    const tot = dayTotals(es);
    if (targets) {
      if (targets.p && tot.p >= targets.p) await award(`protein-${d}`, 'protein', 40, 'Protein target hit', d);
      if (tot.kcal <= targets.kcal && tot.kcal >= targets.kcal * 0.6) await award(`dayclose-${d}`, 'dayclose', 50, 'Closed the day on budget', d);
    }
    const meals = new Set(es.map(e => e.meal));
    if ([0, 1, 2].every(m => meals.has(m))) await award(`meals3-${d}`, 'meals', 20, 'All meals logged', d);
  }
  const streak = streakFrom(dates, today);
  await streakAwards(streak);
  await evaluateBadges();
  await kvSet('game-init', true);
  const xp = await totalXp();
  const lv = levelFor(xp);
  // baseline: levels reached before this feature never retro-drop rewards
  for (let L = 2; L <= lv.level; L++) {
    await award(`levelup-${L}`, 'levelup', 0, `Reached level ${L}`);
    const row = await db.get('xp', `levelup-${L}`);
    if (row && !row.claimed) { row.claimed = true; await db.put('xp', row); }
  }
  return { xp, level: lv };
  } finally { quietLevelups = false; }
}

// One-time welcome kit when the RPG layer first arrives (or on fresh install).
export async function initLootIfNeeded() {
  if (await kvGet('loot-init')) return null;
  await grantCrate('golden', 'welcome');
  await grantCrate('daily', 'welcome');
  await grantConsumable('freeze', 'welcome');
  await kvSet('loot-init', true);
  return { crates: 2, freeze: 1 };
}

// XP rows for a given date (for the progress sheet).
export async function xpForDate(date) {
  const rows = await db.all('xp');
  return rows.filter(r => r.date === date).sort((a, b) => b.ts - a.ts);
}

/* ---------------- Apple Health payload ---------------- */
// Accepts the clipboard format written by the Shortcut, or URL params:
//   "tally-hk d=2026-07-03 steps=8421 active=512 weightlb=184.6"
//   "#/hk?steps=8421&active=512&weightkg=83.4"
export function parseHkPayload(input) {
  const t = String(input || '').trim();
  if (!t) return null;
  if (!(/tally-hk/i.test(t) || /(^|[?&# ])(steps|active|weightlb|weightkg)=/i.test(t))) return null;

  const params = {};
  for (const m of t.matchAll(/([a-z]+)\s*=\s*([0-9.,-]+)/gi)) params[m[1].toLowerCase()] = m[2];

  const num = v => {
    if (v == null) return null;
    let s = String(v).trim();
    // strip thousands separators, keep a trailing decimal comma
    s = s.replace(/,(?=\d{3}(\D|$))/g, '');
    s = s.replace(',', '.');
    const x = parseFloat(s);
    return isFinite(x) && x >= 0 ? x : null;
  };

  const dm = t.match(/\d{4}-\d{2}-\d{2}/);
  const date = dm ? dm[0] : dateKey();
  const steps = num(params.steps) != null ? Math.round(num(params.steps)) : null;
  const active = num(params.active ?? params.activekcal) != null ? Math.round(num(params.active ?? params.activekcal)) : null;
  let weightKg = num(params.weightkg);
  const wlb = num(params.weightlb);
  if (weightKg == null && wlb != null) weightKg = wlb * 0.45359237;
  if (weightKg != null && (weightKg < 25 || weightKg > 350)) weightKg = null;

  if (steps == null && active == null && weightKg == null) return null;
  return { date, steps, activeKcal: active, weightKg };
}
