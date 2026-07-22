// Gamification: XP, levels, badges, and Apple Health payload parsing.
// XP events are append-only rows in the 'xp' store, keyed for idempotency:
// awarding the same key twice is a no-op, so backfills and retries are safe.

import { db, kvGet, kvSet } from './db.js';
import { dayTotals, addDays, dateKey, streakFrom } from './nutrition.js';
import { consumeFreeze, grantCrate, grantConsumable, coinsAdd, boneDustAdd } from './loot.js';
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

// v136: battling a friend's AI bonehead. Pays ONCE per friend per day (win pays
// more, a loss still gives a shame-free consolation) so the incentive is to battle
// MANY friends, not farm one. Records a `friendbattle` ledger row tagged with the
// friendId so the daily/weekly friend quests can count total + distinct friends.
// Returns {firstToday, coins, xp, won}; caller adds the coins.
export async function claimFriendBattle(friendId, won, date) {
  const d = date || dateKey();
  const key = `friendbattle-${d}-${friendId}`;
  if (await db.get('xp', key)) return { firstToday: false, coins: 0, xp: 0, won };
  const xp = won ? 12 : 5;
  await award(key, 'friendbattle', xp, won ? "Beat a friend's bonehead" : 'Battled a friend', d);
  const row = await db.get('xp', key);
  if (row) { row.friendId = friendId; row.won = won ? 1 : 0; await db.put('xp', row); }
  return { firstToday: true, coins: won ? 25 : 8, xp, won };
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
  { id: 'den-1', icon: '🏚', name: 'Den cracker', desc: 'Beat a boss den on the map' },
  { id: 'den-5', icon: '👑', name: 'Den lord', desc: 'Beat 5 boss dens' },
  { id: 'pit-1', icon: '🥊', name: 'Blooded', desc: 'Win a fight in The Pit' },
  { id: 'pit-25', icon: '💀', name: 'Pit fiend', desc: 'Win 25 Pit fights' },
  { id: 'pit-champ', icon: '👑', name: 'Kingslayer', desc: 'Dethrone the Marrow King' },
  // hidden until earned: easter-egg bosses spread by rumor, not by badge list
  { id: 'secret-tumtum', icon: '🥁', name: 'Wabaloo Whisperer', desc: 'Found Tum Tum Wabaloo where he was buried', secret: true },
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
    case 'den-1': return st.bossWins >= 1;
    case 'den-5': return st.bossWins >= 5;
    case 'pit-1': return st.pitWins >= 1;
    case 'pit-25': return st.pitWins >= 25;
    case 'pit-champ': return st.pitChamp;
    case 'secret-tumtum': return st.secretTumtum;
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
    maxActiveKcal: Math.max(0, ...health.map(h => h.activeKcal || 0)),
    cosmetics: inv.filter(r => r.kind === 'cos').length,
    spawns: xp.filter(r => r.type === 'spawn').length,
    roadStops: xp.filter(r => r.type === 'road').length,
    roadCycles: xp.filter(r => r.type === 'road' && r.key.endsWith('-6')).length,
    bossWins: xp.filter(r => r.type === 'boss').length,
    pitWins: xp.filter(r => r.type === 'fight').length,
    pitChamp: xp.some(r => r.type === 'pitchamp'),
    secretTumtum: xp.some(r => r.key === 'secret-tumtum'),
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

  // Logging pays its base XP only. The old double-XP-for-logging perk was
  // retired (the fun is walking + the Pit, not a logging bonus); the item that
  // powered it is now the Battle Charm, spent on Pit wins instead.
  const boosted = false;

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

// A series of step goals that reward you, then keep paying (less and less) past
// the daily cap so extra walking always counts. Steps only: wellbeing-safe.
export const STEP_MILESTONES = [
  { at: 5000, coins: 20 },
  { at: 8000, coins: 30 },
  { at: 10000, coins: 40 }, // the daily cap
];
// Step Eggs now take a genuinely big day (not every 10k), so pets aren't handed
// out too fast. Combined with the higher hatch cost (EGG_GOAL_STEPS), eggs are rarer.
export const EGG_STEP_THRESHOLD = 14000;
export const STEP_OVER = [ // diminishing bonuses beyond the cap
  { at: 12500, coins: 12 }, { at: 15000, coins: 10 }, { at: 17500, coins: 8 }, { at: 20000, coins: 6 },
];

// ACTIVE ENERGY (Apple Watch / Health): active kcal is the universal "you moved"
// signal — a bike ride, a gym session, a run all burn it, so rewarding it means
// every workout counts, not just steps. Wellbeing-safe: rewards effort/movement,
// never eating less. (Active energy also nudges the eating TARGET up elsewhere.)
export const ACTIVE_MILESTONES = [
  { at: 250, coins: 15 },  // an active day
  { at: 500, coins: 25 },  // a genuine workout / ride happened today -> also a crate
  { at: 750, coins: 35 },  // big training day (soft cap)
];
export const ACTIVE_WORKOUT_KCAL = 500; // "you worked out today" threshold -> daily crate
export const ACTIVE_OVER = [ // diminishing beyond the cap
  { at: 1000, coins: 10 }, { at: 1250, coins: 8 }, { at: 1500, coins: 6 },
];

// ---- WORKOUTS (HealthKit / Health Connect granularity) ----
// Beyond steps + calories: reward completed workout sessions, exercise minutes,
// and cycling distance, and theme the reward to the KIND of activity. Wellbeing-
// safe (rewards doing the activity, never eating less).
export const WORKOUT_COINS = 25;          // per completed workout
export const WORKOUT_CAP = 3;             // rewarded workouts/day (anti-farm)
export const EXERCISE_RING_MIN = 30;      // Apple's daily Exercise ring
export const CYCLE_KM_STEP = 5;           // reward every 5 km ridden
export const CYCLE_KM_CAP = 40;           // stop paying past 40 km/day
// Raw HealthKit / Health Connect activity types -> our three "disciplines".
export const WORKOUT_DISCIPLINE = {
  // cardio -> Vigor (energy)
  running: 'cardio', walking: 'cardio', cycling: 'cardio', biking: 'cardio', hiking: 'cardio',
  swimming: 'cardio', rowing: 'cardio', elliptical: 'cardio', stairclimbing: 'cardio',
  hiit: 'cardio', dance: 'cardio', jumprope: 'cardio', kickboxing: 'cardio',
  // strength -> Battle Charm (hit harder)
  strength: 'strength', functionalstrength: 'strength', traditionalstrength: 'strength',
  core: 'strength', crosstraining: 'strength', crossfit: 'strength', weightlifting: 'strength',
  // flexibility / mind -> Bone Dust (restorative crafting mat)
  yoga: 'flex', pilates: 'flex', flexibility: 'flex', mindandbody: 'flex', barre: 'flex',
  cooldown: 'flex', stretching: 'flex',
};
// discipline -> the themed reward it grants (once per discipline per day)
export const DISCIPLINE_REWARD = {
  cardio:   { consumable: 'vigor', label: 'Vigor Draught' },
  strength: { consumable: 'xp2',   label: 'Battle Charm' },
  flex:     { dust: 20,            label: 'Bone Dust' },
};
export function disciplineOf(type) {
  const k = String(type || '').toLowerCase().replace(/[^a-z]/g, '');
  return WORKOUT_DISCIPLINE[k] || 'cardio'; // unknown activity still counts as cardio effort
}

export async function onHealthSync(date, { steps, activeKcal, exerciseMin, cycleKm, workouts, wtypes } = {}) {
  let gained = await award(`hk-${date}`, 'hk', 10, 'Apple Health sync', date);
  let egg = false, coinsEarned = 0, workout = false;
  const themed = []; // themed consumables granted this sync (for the toast)
  if (steps != null) {
    for (const m of STEP_MILESTONES) {
      if (steps < m.at) break;
      const g = await award(`stepms-${date}-${m.at}`, 'stepms', 15, `${m.at.toLocaleString()} steps`, date);
      if (g) { gained += g; coinsEarned += m.coins; }
    }
    // a Step Egg only on a genuinely big day
    if (steps >= EGG_STEP_THRESHOLD) {
      const g = await award(`egg-${date}`, 'egg', 15, 'Big-day Step Egg', date);
      if (g) { gained += g; await grantCrate('egg', 'steps-' + date); egg = true; }
    }
    for (const o of STEP_OVER) {
      if (steps < o.at) break;
      const g = await award(`stepx-${date}-${o.at}`, 'stepx', 5, `Extra steps past the cap: ${o.at.toLocaleString()}`, date);
      if (g) { gained += g; coinsEarned += o.coins; }
    }
  }
  // Active energy: rewards every kind of workout (bike/run/gym/swim all burn it).
  if (activeKcal != null) {
    for (const m of ACTIVE_MILESTONES) {
      if (activeKcal < m.at) break;
      const g = await award(`actms-${date}-${m.at}`, 'actms', 15, `${m.at.toLocaleString()} active kcal`, date);
      if (g) { gained += g; coinsEarned += m.coins; }
    }
    // a real workout's worth of burn -> a daily crate (once/day, idempotent)
    if (activeKcal >= ACTIVE_WORKOUT_KCAL) {
      const g = await award(`actcrate-${date}`, 'actcrate', 15, 'Workout of the day', date);
      if (g) { gained += g; await grantCrate('daily', 'active-' + date); workout = true; }
    }
    for (const o of ACTIVE_OVER) {
      if (activeKcal < o.at) break;
      const g = await award(`actx-${date}-${o.at}`, 'actx', 5, `Extra burn past the cap: ${o.at.toLocaleString()} kcal`, date);
      if (g) { gained += g; coinsEarned += o.coins; }
    }
  }
  // Completed workout SESSIONS (capped/day so it can't be farmed).
  if (workouts != null && workouts > 0) {
    for (let i = 1; i <= Math.min(workouts, WORKOUT_CAP); i++) {
      const g = await award(`wk-${date}-${i}`, 'wk', 15, `Workout ${i}`, date);
      if (g) { gained += g; coinsEarned += WORKOUT_COINS; workout = true; }
    }
  }
  // Apple Exercise ring.
  if (exerciseMin != null && exerciseMin >= EXERCISE_RING_MIN) {
    const g = await award(`exring-${date}`, 'exring', 20, `${EXERCISE_RING_MIN} exercise minutes`, date);
    if (g) { gained += g; coinsEarned += 20; }
  }
  // Cycling distance (every CYCLE_KM_STEP km up to the cap).
  if (cycleKm != null && cycleKm > 0) {
    for (let km = CYCLE_KM_STEP; km <= CYCLE_KM_CAP; km += CYCLE_KM_STEP) {
      if (cycleKm < km) break;
      const g = await award(`cyc-${date}-${km}`, 'cyc', 8, `${km} km ridden`, date);
      if (g) { gained += g; coinsEarned += 10; }
    }
  }
  // Type-themed reward: one per DISCIPLINE done today (cardio->Vigor,
  // strength->Battle Charm, flex->Bone Dust). Idempotent per date+discipline.
  if (wtypes && wtypes.length) {
    for (const disc of new Set(wtypes.map(disciplineOf))) {
      const g = await award(`wtype-${date}-${disc}`, 'wtype', 10, `${disc} session`, date);
      if (!g) continue;
      gained += g;
      const r = DISCIPLINE_REWARD[disc];
      if (r?.consumable) { await grantConsumable(r.consumable, `workout-${disc}-${date}`); themed.push(r.label); }
      else if (r?.dust) { await boneDustAdd(r.dust); themed.push(r.label); }
    }
  }
  if (coinsEarned) await coinsAdd(coinsEarned);
  const newBadges = await evaluateBadges();
  gained += newBadges.length * 25;
  return { xp: gained, newBadges, egg, coins: coinsEarned, workout, themed };
}

// At boot: settle yesterday (day-close bonus and any missed day checks).
export async function awardDayCloseIfDue(targets) {
  if (!targets) return null;
  const y = addDays(dateKey(), -1);
  const es = await db.byIndex('log', 'date', y);
  if (!es.length) return null;
  const tot = dayTotals(es);
  const onBudget = tot.kcal <= targets.kcal && tot.kcal >= targets.kcal * 0.6;
  let closed = false, consoled = false;
  if (onBudget) {
    // locked in: the full reward
    const g = await award(`dayclose-${y}`, 'dayclose', 50, 'Closed the day on budget', y);
    if (g) { await grantCrate('golden', 'dayclose-' + y); closed = true; }
  } else {
    // shame-free: you still logged the day, so you still earn — just a lighter
    // reward, never a penalty ("you'll get 'em next time"). This rewards the ACT
    // of tracking, not the calorie number, so it never favours eating less: an
    // on-budget day always pays strictly more, and over/under both land here.
    const g = await award(`dayeffort-${y}`, 'dayeffort', 25, 'Logged the day', y);
    if (g) { await grantCrate('daily', 'dayeffort-' + y); consoled = true; }
  }
  if (targets.p && tot.p >= targets.p) await award(`protein-${y}`, 'protein', 40, 'Protein target hit', y);
  const meals = new Set(es.map(e => e.meal));
  if ([0, 1, 2].every(m => meals.has(m))) await award(`meals3-${y}`, 'meals', 20, 'All meals logged', y);
  await evaluateBadges();
  return closed ? { date: y, closed: true } : consoled ? { date: y, consoled: true } : null;
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
  if (!(/tally-hk/i.test(t) || /(^|[?&# ])(steps|active|weightlb|weightkg|exmin|cyclekm|workouts)=/i.test(t))) return null;

  const params = {};
  for (const m of t.matchAll(/([a-z]+)\s*=\s*([0-9.,-]+)/gi)) params[m[1].toLowerCase()] = m[2];
  // wtypes is a comma list of activity slugs (letters), not numeric
  const wtMatch = t.match(/wtypes\s*=\s*([a-z,]+)/i);
  const wtypes = wtMatch ? wtMatch[1].toLowerCase().split(',').map(s => s.trim()).filter(Boolean) : null;

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

  const exerciseMin = num(params.exmin) != null ? Math.round(num(params.exmin)) : null;
  const cycleKm = num(params.cyclekm);
  const workouts = num(params.workouts) != null ? Math.round(num(params.workouts)) : null;

  if (steps == null && active == null && weightKg == null &&
      exerciseMin == null && cycleKm == null && workouts == null && !wtypes) return null;
  return { date, steps, activeKcal: active, weightKg, exerciseMin, cycleKm, workouts, wtypes };
}
