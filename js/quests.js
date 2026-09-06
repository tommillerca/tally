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
import { claimDay, db, newId } from './db.js';
import { keepersBoon } from './spires.js';
import { awardOnce } from './game.js';
import { crateRow, eggRow } from './loot.js';
import { WATER_GOAL } from './wellness.js';

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

/* R38-8: a monthly's target assumes the whole month. A player whose account was
   created mid-month (a fresh install on the 28th) sees the same 200,000-step
   target as someone who had all 30 days, which is why m-steps read
   9000/200000 (63,667 steps/day needed) and m-protein (20 days) was already
   arithmetically impossible after the 11th. Scale to the days actually left in
   THIS player's first month, counted from account creation (S.settings.createdAt),
   never from "today", so an existing player who simply procrastinated does not
   get an easier target as the month runs out. Reward is untouched (Tom's ruling:
   the economy stays as it is); only the bar the player has to clear moves. */
function monthProrationScale(date, createdAt) {
  if (!createdAt) return 1;
  const createdKey = dateKey(new Date(createdAt));
  if (monthKeyOf(createdKey) !== monthKeyOf(date)) return 1; // not their first month: full target
  const totalDays = monthDates(date).length;
  const createdDay = Number(createdKey.slice(8, 10));
  const daysRemaining = totalDays - createdDay + 1; // inclusive of the creation day itself
  return Math.max(1, daysRemaining) / totalDays;
}

/* ---------- context ---------- */
// base: { date, entries (today), allXp, allLog, healthRows, targets,
//         weighedToday, priorFoodIds, hkConnected, huntEnabled }
export function questCtx(period, base) {
  const dates = periodDates(period, base.date);
  const set = new Set(dates);
  const inP = r => set.has(r.date);
  const countType = t => base.allXp.filter(r => r.type === t && inP(r)).length;
  const steps = (base.healthRows || []).filter(inP).reduce((a, r) => a + (r.steps || 0), 0);
  const active = (base.healthRows || []).filter(inP).reduce((a, r) => a + (r.activeKcal || 0), 0);
  const workoutToday = (base.healthRows || []).some(r => r.date === base.date && (r.activeKcal || 0) >= 500);
  const logDays = new Set((base.allLog || []).filter(e => set.has(e.date)).map(e => e.date)).size;
  return {
    period,
    periodKey: periodKeyOf(period, base.date),
    allXp: base.allXp,
    // today-scoped (daily quests)
    entries: base.entries || [],
    weighedToday: base.weighedToday,
    /* q-first says "Log anything at all", and the app's own UI calls a manual
       walk, a weigh-in, water, sleep and a routine "logging". Every one of
       those writes a type-'wellness' xp row (js/wellness.js) or the weights
       store, never the food 'log' store this quest used to read exclusively,
       so a player whose first act of the day was a manual walk sat on 0/1. */
    loggedAnyToday: (base.entries || []).length > 0 || !!base.weighedToday
      || base.allXp.some(r => r.type === 'wellness' && r.date === base.date),
    priorFoodIds: base.priorFoodIds || new Set(),
    /* R38-8 q-new-food: Quick Add writes foodId: null, so a genuinely new food
       logged through the app's primary logging path never had anything to
       compare against and the counter never left 0/1. Quick Add entries are
       matched by name instead, against names logged on PRIOR days only. */
    priorQuickNames: base.priorQuickNames || new Set(),
    scanToday: base.allXp.some(r => r.type === 'scan' && r.date === base.date),
    targets: base.targets,
    // period-scoped aggregates
    steps,
    active,
    workoutToday,
    workoutDays: base.allXp.filter(r => r.type === 'actcrate' && inP(r)).length, // ≥500 active-kcal days
    pitWins: countType('fight'),
    /* 'boss' is a LEGACY row type: nothing has written it since den wins moved
       to 'bossday' (landmark + remote) and 'roamboss' (roaming) in js/poi.js
       claimDenWin. Counting only the dead type left w-boss and m-boss at 0
       forever, on every kill. 'bossfirst' rows are excluded on purpose: they
       are 0-XP gate markers minted ALONGSIDE the day row, so counting them
       would double-count a first clear. The Boneyard Wanderer ('wanderer'
       rows) is also excluded: he re-rolls every 45 minutes and is deliberately
       kept out of boss progression (see the CEILING note in js/app.js and
       tests/wanderer-boneyard-audit.mjs). */
    bossWins: base.allXp.filter(r => (r.type === 'bossday' || r.type === 'roamboss' || r.type === 'boss') && inP(r)).length,
    spawns: countType('spawn'),
    proteinDays: countType('protein'),
    cookedToday: base.allXp.some(r => r.type === 'cook' && r.date === base.date),
    cooksDone: countType('cook'),
    // the garden logs an xp row per harvest, so the existing counter covers it
    harvestedToday: base.allXp.some(r => r.type === 'garden' && r.date === base.date),
    harvests: countType('garden'),
    bedToday: base.allXp.some(r => r.key === `bed-${base.date}`),
    waterToday: base.allXp.some(r => r.key === `water-${base.date}`),
    /* R38-8: q-water rendered 0/1 with no partial credit, the only multi-unit
       daily that hid its own progress. base.waterCups is the live cup count
       for the day being viewed (null on a past day, whose per-day count was
       never kept); when it exists, count against the real WATER_GOAL instead
       of a single all-or-nothing unit. */
    waterCups: base.waterCups,
    sleepToday: base.allXp.some(r => r.key === `sleep-${base.date}`),
    wellnessDays: new Set(base.allXp.filter(r => r.type === 'wellness' && inP(r)).map(r => r.date)).size,
    logDays,
    friendBattles: countType('friendbattle'),
    friendsBattled: new Set(base.allXp.filter(r => r.type === 'friendbattle' && inP(r) && r.friendId).map(r => r.friendId)).size,
    monthScale: period === 'month' ? monthProrationScale(base.date, base.createdAt) : 1,
  };
}

/* ---------- pools ---------- */
// Each quest: { id, name, desc, coins, crate?, need?, progress(ctx) -> {cur,target} }
const clamp = (v, t) => ({ cur: Math.min(t, Math.max(0, Math.round(v))), target: t });

export const DAILY_POOL = [
  { id: 'q-first', name: 'Show up', desc: 'Log anything at all', coins: 30,
    progress: c => clamp(c.loggedAnyToday ? 1 : 0, 1) },
  { id: 'q-log5', name: 'Deep log', desc: 'Log 5 items today', coins: 50,
    progress: c => clamp(c.entries.length, 5) },
  { id: 'q-3meals', name: 'Square meals', desc: 'Log breakfast, lunch, and dinner', coins: 60,
    progress: c => clamp([0, 1, 2].filter(m => c.entries.some(e => e.meal === m)).length, 3) },
  { id: 'q-protein', name: 'Protein bullseye', desc: 'Hit your full protein target', coins: 70, dust: 15,
    progress: c => { const t = c.targets?.p || 150; return clamp(dayTotals(c.entries).p, t); } },
  { id: 'q-scan', name: 'Laser checkout', desc: 'Log a food by scanning its barcode', coins: 40,
    progress: c => clamp(c.scanToday ? 1 : 0, 1) },
  /* R38-8: uncompletable through the primary logging path. Quick Add (the
     first thing a new player reaches for) writes foodId: null, so `e.foodId &&`
     excluded every one of those entries and the counter never left 0/1 no
     matter how many brand-new foods were logged. A Quick Add entry has no id
     to compare, so it counts as new by NAME instead, against names logged on
     prior days only (case/whitespace-insensitive: the same food typed twice
     should not double as "new"). */
  { id: 'q-new-food', name: 'Explorer', desc: 'Log a food you have never logged before', coins: 50,
    progress: c => clamp(c.entries.filter(e => e.foodId ? !c.priorFoodIds.has(e.foodId)
      : (e.name && !c.priorQuickNames.has(String(e.name).trim().toLowerCase()))).length, 1) },
  { id: 'q-weigh', name: 'Data point', desc: 'Log a weigh-in', coins: 40,
    progress: c => clamp(c.weighedToday ? 1 : 0, 1) },
  /* Same class, found in the same playtest: the Kitchen on day one is a dead
     room ("Not enough ingredients yet", "Nothing planted yet", seven ingredient
     slots all reading 0). Asking somebody to cook in it is asking for something
     the app will not let them do. */
  { id: 'q-cook', name: 'Fire up the cauldron', desc: 'Cook a dish or brew a potion', coins: 50, ingredient: 'salt', need: 'kitchen',
    progress: c => clamp(c.cookedToday ? 1 : 0, 1) },
  /* q-harvest ("Harvest a bed in the Bone Garden") came out on 2026-08-18. The
     garden is off the player's path, so it is uncompletable, which is the exact
     mistake the day-one Pit card was. REVIVAL: restore it here from git history;
     `harvestedToday` in the context above still works. */
  { id: 'q-water', name: 'Stay watered', desc: 'Drink 8 cups of water', coins: 45,
    /* R38-8: rendered 0/1 with no partial credit, unlike every other multi-unit
       daily. waterCups is only known for the day actually being viewed (kv
       'wellness' keeps no history), so a past day falls back to the old
       all-or-nothing read rather than a count it does not have. */
    progress: c => c.waterCups != null ? clamp(c.waterCups, WATER_GOAL) : clamp(c.waterToday ? 1 : 0, 1) },
  { id: 'q-bed', name: 'Make your bed', desc: 'Start the day right: make your bed', coins: 40,
    progress: c => clamp(c.bedToday ? 1 : 0, 1) },
  { id: 'q-sleep', name: 'Rest up', desc: 'Log a good night of sleep', coins: 55,
    progress: c => clamp(c.sleepToday ? 1 : 0, 1) },
  /* GATED ON HAVING ACTUALLY FOUGHT. A non-gamer played this cold on
     2026-08-13, was pushed into the Pit by the day-one card, LOST on rung 1 of
     8, and then found that two of their three daily quests were "Win a Pit
     fight" and "Win 3 Pit fights today". Their words: "on day one I am already
     failing most of the day's list at a thing I did not download this app to
     do."
     A quest list is a statement about what today should look like. Handing a
     brand-new player two impossible ones on their first morning is the same
     mistake as pointing the day-one card at a fight, and it is the same fix:
     the Pit shows up once they have been there. `need` already exists here for
     exactly this shape (hk, hunt, social), so this is that mechanism, not a
     new one. */
  { id: 'q-pit1', name: 'Pit scrap', desc: 'Win a Pit fight', coins: 60, need: 'pit',
    progress: c => clamp(c.pitWins, 1) },
  { id: 'q-pit3', name: 'Pit run', desc: 'Win 3 Pit fights today', coins: 80, item: 'vigor', need: 'pit',
    progress: c => clamp(c.pitWins, 3) },
  { id: 'q-hunt', name: 'Boneyard sweep', desc: 'Collect 2 spawns on the map', coins: 70, need: 'hunt',
    progress: c => clamp(c.spawns, 2) },
  { id: 'q-steps8', name: 'Get moving', desc: 'Walk 8,000 steps', coins: 60, need: 'hk',
    progress: c => clamp(c.steps, 8000) },
  { id: 'q-steps11', name: 'Long haul', desc: 'Walk 11,000 steps', coins: 80, dust: 20, need: 'hk',
    progress: c => clamp(c.steps, 11000) },
  { id: 'q-active', name: 'Break a sweat', desc: 'Burn 500 active calories (a workout or a ride)', coins: 70, need: 'hk',
    progress: c => clamp(c.active, 500) },
  { id: 'q-friend', name: 'Bone brawl', desc: "Battle a friend's bonehead", coins: 75, need: 'social',
    progress: c => clamp(c.friendBattles, 1) },
];

export const WEEKLY_POOL = [
  { id: 'w-steps', name: 'Trailblazer', desc: 'Walk 50,000 steps this week', coins: 150, crate: 'golden', need: 'hk',
    progress: c => clamp(c.steps, 50000) },
  { id: 'w-pit', name: 'Pit regular', desc: 'Win 12 Pit fights this week', coins: 150, crate: 'golden', item: 'vigor', need: 'pit',
    progress: c => clamp(c.pitWins, 12) },
  { id: 'w-workouts', name: 'Training week', desc: 'Work out (500+ active kcal) on 4 days', coins: 160, crate: 'golden', item: 'vigor', need: 'hk',
    progress: c => clamp(c.workoutDays, 4) },
  { id: 'w-protein', name: 'Protein week', desc: 'Hit your protein target on 5 days', coins: 150, crate: 'golden',
    progress: c => clamp(c.proteinDays, 5) },
  /* R38-8: ungated behind a door nothing points at (the world boss den is only
     reachable from inside the Pit sheet, and no UI copy says "world boss").
     Gated on pitTried like every other Pit-adjacent quest, so it shows up once
     the player has actually found the Pit rather than on a day-one board. */
  { id: 'w-boss', name: 'Boss hunter', desc: 'Beat 2 world bosses this week', coins: 180, crate: 'golden', dust: 60, need: 'pit',
    progress: c => clamp(c.bossWins, 2) },
  { id: 'w-hunt', name: 'Scavenger', desc: 'Collect 15 spawns this week', coins: 140, crate: 'golden', ingredient: 'ectoplasm', need: 'hunt',
    progress: c => clamp(c.spawns, 15) },
  { id: 'w-log', name: 'Steady logger', desc: 'Log on 5 days this week', coins: 120, crate: 'golden',
    progress: c => clamp(c.logDays, 5) },
  { id: 'w-cook', name: 'Cauldron keeper', desc: 'Cook or brew 5 times this week', coins: 130, crate: 'golden', need: 'kitchen',
    progress: c => clamp(c.cooksDone, 5) },
  /* w-garden ("Harvest 8 crops this week", 140 coins + a golden crate) came out
     with q-harvest, 2026-08-18.
     THE MID-WEEK QUESTION, answered rather than skipped: a player holding it at
     6/8 when this ships loses it, and no in-progress payout is made. Measured
     first: pick() indexes into the filtered pool, so dropping one member
     reshuffles 41 of 52 weekly slates, not only the 11 that carried w-garden.
     That is not new. The same reshuffle already happens the first time any `need`
     gate opens (connect Health, touch the Pit), so mid-period slate churn is a
     property this design has always had and always tolerated.
     What survives it: progress is DERIVED from cumulative week counters, so a
     substitute weekly arrives at the player's real progress rather than at zero,
     and `questState.claimed` is keyed by quest id, so nothing already claimed is
     revoked. What is lost: the harvests themselves, which cannot be finished at
     any price once the garden has no door.
     No separate payout, deliberately. The closing payout in game.js
     retireGardenIfNeeded already refunds real spend; paying 140 coins and a
     golden crate for an unfinished weekly would pay a player at 1/8 the same as
     one at 7/8, and the counter that would tell them apart (xp rows of type
     'garden') is not read anywhere else. */
  { id: 'w-wellness', name: 'Look after yourself', desc: 'Hit a wellness habit (water/bed/sleep) on 5 days', coins: 150, crate: 'golden',
    progress: c => clamp(c.wellnessDays, 5) },
  { id: 'w-friends', name: 'Rival circuit', desc: 'Battle 3 different friends this week', coins: 170, crate: 'golden', need: 'social',
    progress: c => clamp(c.friendsBattled, 3) },
];

/* R38-8: every monthly target below is scaled by ctx.monthScale (see
   monthProrationScale above), so a first month that started mid-month asks for
   a share of the full month's target proportional to the days actually left,
   instead of the arithmetically-impossible full number. Untouched (scale 1)
   for anyone whose first month this is not. */
const scaleT = (t, c) => Math.max(1, Math.round(t * (c.monthScale ?? 1)));
export const MONTHLY_POOL = [
  { id: 'm-steps', name: 'Marathoner', desc: 'Walk 200,000 steps this month', coins: 400, crate: 'egg', need: 'hk',
    progress: c => clamp(c.steps, scaleT(200000, c)) },
  { id: 'm-pit', name: 'Pit veteran', desc: 'Win 50 Pit fights this month', coins: 400, crate: 'egg', need: 'pit',
    progress: c => clamp(c.pitWins, scaleT(50, c)) },
  /* R38-8: ungated behind a door nothing points at, same fix as w-boss above. */
  { id: 'm-boss', name: 'Boss slayer', desc: 'Beat 8 world bosses this month', coins: 500, crate: 'egg', dust: 150, need: 'pit',
    progress: c => clamp(c.bossWins, scaleT(8, c)) },
  { id: 'm-protein', name: 'Protein month', desc: 'Hit your protein target on 20 days', coins: 400, crate: 'egg',
    progress: c => clamp(c.proteinDays, scaleT(20, c)) },
];

function pick(pool, seedStr, n, { hkConnected, huntEnabled, socialOn, pitTried, kitchenReady, stickyIds } = {}) {
  /* Callers that predate a gate must not silently lose quests, so an undefined
     flag means "no opinion, keep it". Only an explicit false hides one. */
  const off = (flag) => flag === false;
  const ok = (q) =>
    (q.need !== 'hk' || hkConnected) && (q.need !== 'hunt' || huntEnabled) && (q.need !== 'social' || socialOn)
    && !(q.need === 'pit' && off(pitTried)) && !(q.need === 'kitchen' && off(kitchenReady));
  /* ORDER THE WHOLE POOL FIRST, GATE SECOND.
     This used to filter to `avail` and then draw indices against avail.length.
     The seed is the period, so the draw looked stable, but the ARRAY it indexed
     into was not: five flags (hkConnected, huntEnabled, socialOn, pitTried,
     kitchenReady) change what avail contains, so the same day handed out a
     different set of quests depending on how much the player had unlocked.
     Different quests mean different `quest-<periodKey>-<id>` ledger keys, and
     award() is idempotent per KEY, so each new set was freshly claimable.
     Measured on the old code, one date, across all 32 flag states: 11 distinct
     dailies reachable where 3 were intended, 8 weeklies where 3 were, 3 monthlies
     where 2 were. 1315 XP/day against an intended 605.
     Shuffling the full pool makes the sequence a property of the period alone.
     A flag can now only decide whether a quest is SKIPPED, never where the
     others sit, so unlocking something cannot reshuffle what came before it. */
  const rand = mulberry32(hashStr(seedStr));
  const order = pool.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  /* THE FLOOR: a player whose whole draw is gated gets the first quest they
     CAN do, because zero quests is a dead screen (the first-week rule). That
     floor is the one surviving substitution and it is bounded at one. */
  const drawn = order.slice(0, n);
  let out = drawn.filter(ok);
  /* R38-24: PIN WHAT A PLAYER HAS ALREADY BEEN SHOWN THIS PERIOD. `stickyIds`
     is the id list THIS player was already shown for THIS period (app.js
     persists it in kv the first time a period is rendered, and threads it back
     in on every later render); every id in it that is still `ok` is kept, so a
     capability change can only ADD to what a player has seen this period,
     never replace it. Generalized 2026-09-06 (R39-3) from a single floor id to
     a list so a caller (dailyQuests' day-one anchor, below) can pin more than
     one quest at once; harmless to every other caller since nobody else passes
     more than the original single id. */
  const pinned = (stickyIds || []).map(id => order.find(q => q.id === id)).filter(q => q && ok(q));
  if (pinned.length) {
    const pinnedIds = new Set(pinned.map(q => q.id));
    out = [...pinned, ...out.filter(q => !pinnedIds.has(q.id))].slice(0, n);
  }
  if (!out.length) {
    const fallback = order.find(ok);
    if (fallback) out.push(fallback);
  }
  return out;
}

/* How many claims a period is allowed to pay, ever. Exported because claimQuest
   enforces it and the audit asserts against it. */
export const QUEST_N = { day: 3, week: 3, month: 2 };

/* Rows this period has already paid. Counted from the ledger rather than from
   the quests currently on screen, because the whole bug was that the on-screen
   set moves: a quest that has dropped out of view still spent its slot.

   THE KEY PREFIX DOES NOT IDENTIFY THE TIER, AND TWO SEPARATE COLLISIONS PROVE IT.
   1. A month key ('2026-08') is a prefix of every day key in that month
      ('2026-08-20'), so `quest-2026-08-` matches daily rows.
   2. Worse, and the reason this counts POOL MEMBERSHIP now: weekKeyOf() returns
      the Monday's own date, so ON A MONDAY the week key and the day key are the
      SAME STRING. A digit test cannot separate those, because both suffixes are
      quest ids starting with a letter. Measured: three dailies claimed on Monday
      2026-08-17 made the weekly count read 3, which is the weekly cap, so EVERY
      weekly quest was refused for the rest of that week. Symmetrically, weeklies
      claimed on a Monday ate that day's daily budget.

   So the tier is decided by what the id IS, not by what the key looks like. The
   pools are right here in this file, so this needs no convention, no naming rule
   and no date parsing: a row counts against the day cap only if its id is a
   DAILY_POOL id. An unknown id (a pool entry deleted in a later version, like
   q-harvest when the Bone Garden closed) counts against nothing, which is the
   safe direction: it can under-count a retired quest, never lock a player out. */
const POOL_IDS = () => ({
  day: new Set(DAILY_POOL.map(q => q.id)),
  week: new Set(WEEKLY_POOL.map(q => q.id)),
  month: new Set(MONTHLY_POOL.map(q => q.id)),
});
export function claimsThisPeriod(rows, periodKey, period = 'day') {
  const pre = `quest-${periodKey}-`;
  const ids = POOL_IDS()[period] || POOL_IDS().day;
  return rows.filter(r => r.key.startsWith(pre) && ids.has(r.key.slice(pre.length))).length;
}

/* R39-3: the daily seed used to be the date string alone, so every install on
   the same calendar day drew the identical board. opts.createdAt (the
   account's own creation timestamp, already persisted at onboarding and
   already threaded into questCtx for month proration) is folded in as a
   stable per-install salt: two players installing the same day get different
   boards, and the SAME player's board is still the same seed on every render
   of that day (createdAt never changes). Optional, so every existing caller
   that omits it (tests, __questOrder) draws exactly as before. */
export function dailyQuests(date, opts = {}) {
  const seed = 'quests:' + date + (opts.createdAt ? ':' + opts.createdAt : '');
  const quests = pick(DAILY_POOL, seed, QUEST_N.day, opts);
  const hasAnchor = q => q.id === 'q-first' || q.id === 'q-3meals';
  if (quests.length >= QUEST_N.day && quests.some(hasAnchor)) return quests;
  /* R39-3: a day-one board (every one of the five gates off) can pass pick()
     above and still land under-filled (a gated slot in the fixed draw, nothing
     to replace it) or full of quests nothing in onboarding ever taught
     (q-sleep, q-protein are gateless but untaught). Scoped to EXACTLY this one
     gate state -- not "whatever pick() under-fills" generally -- so it cannot
     touch the reachable-quest ceiling every OTHER combination is held to
     (tests/quest-pick-audit.mjs: pick()'s general algorithm above is
     untouched). Fill any missing slot and force one ANCHOR from the loop
     onboarding actually teaches, drawing from the SAME seeded order (pick()
     asked for the full pool length is exactly that order, filtered to what a
     player with every gate off can reach). */
  const dayOne = opts.hkConnected === false && opts.huntEnabled === false && opts.socialOn === false
    && opts.pitTried === false && opts.kitchenReady === false;
  if (!dayOne) return quests;
  const reachable = pick(DAILY_POOL, seed, DAILY_POOL.length, opts);
  const anchor = reachable.find(hasAnchor) || DAILY_POOL.find(q => q.id === 'q-first');
  const out = quests.slice();
  for (const q of reachable) {
    if (out.length >= QUEST_N.day) break;
    if (!out.some(x => x.id === q.id)) out.push(q);
  }
  if (!out.some(hasAnchor)) out[out.length - 1] = anchor;
  return out.slice(0, QUEST_N.day);
}
export function weeklyQuests(date, opts = {}) { return pick(WEEKLY_POOL, 'weekly:' + weekKeyOf(date), QUEST_N.week, opts); }
export function monthlyQuests(date, opts = {}) { return pick(MONTHLY_POOL, 'monthly:' + monthKeyOf(date), QUEST_N.month, opts); }

/* Test hook: the audit needs the seeded order at FULL pool length to prove the
   sequence is a property of the period and not of the gate flags. Deliberately
   the same pick() the app uses, so the audit exercises the real ordering rather
   than a re-implementation of it (same reason social.js carries __testApplyGrant). */
export function __questOrder(period, date, opts = {}) {
  const [pool, seed] = period === 'week' ? [WEEKLY_POOL, 'weekly:' + weekKeyOf(date)]
    : period === 'month' ? [MONTHLY_POOL, 'monthly:' + monthKeyOf(date)]
    : [DAILY_POOL, 'quests:' + date];
  return pick(pool, seed, pool.length, opts);
}

/* ---------- state + claim ---------- */
export function questState(q, ctx) {
  const { cur, target } = q.progress(ctx);
  const claimed = ctx.allXp.some(r => r.key === `quest-${ctx.periodKey}-${q.id}`);
  return { cur, target, done: cur >= target, claimed };
}

/* A CLOSED PERIOD PAYS NOTHING. Tom, 2026-08-23: "make past day quests
   read-only". v425 made a past day render the whole day, quests included, and
   that put a live Claim button on a quest somebody completed days ago: real
   money, minted retroactively, from a screen that exists to be READ.

   THIS IS THE ONLY GUARD, and it sits here rather than in the click handler
   because here is where the money is actually authorised. Exactly two places in
   js/ mint a quest claim row, `award('quest-...')` and `award('questsall-...')`,
   and both are in this file, so both take this. A guard in js/app.js would be a
   guard on the BUTTON, and the button is the one part of this that a stale
   closure, a deep link, a re-render or a day that changed mid-flight can all get
   past. This reads the clock on every call, so none of them reach the ledger.

   PAST, NOT "NOT TODAY". A claim is refused when its period has CLOSED, which is
   what retroactive means. A future key is left alone: it is not retroactive, the
   clock-forward case is already claimDay's job on the next line, and two audits
   legitimately drive this function on a virgin FUTURE period to get one with no
   history in it (tests/reward-sop-audit.mjs uses '2099-01-02').
   String order IS chronological for all three keys: 'YYYY-MM-DD' for a day, the
   Monday's own 'YYYY-MM-DD' for a week, 'YYYY-MM' for a month.

   It returns null, which is this file's existing answer for "nothing was paid"
   (the duplicate path below returns it too), so every caller already handles it
   and none can mistake it for a payout. */
const periodClosed = (period, periodKey) => periodKey < periodKeyOf(period, dateKey());

export async function claimQuest(periodKey, q, period = 'day') {
/* TWO INDEPENDENT CEILINGS, AND BOTH RUN. The day guard came from the clock-trust
   work and the per-period cap from the rotation fix; they were written against
   the same function without either knowing about the other, and they stop
   different things. Cheapest first: the day guard is a single claimDay() and
   costs no db.all(), so a distrusted clock never pays for a ledger scan. */
  // THE CLOSED-PERIOD GUARD, see periodClosed above. First, because it is free.
  if (periodClosed(period, periodKey)) return null;
  /* MONOTONIC DAY GUARD (js/db.js claimDay). Gated on TODAY rather than on
     periodKey, because periodKey is a week or month key for the other two
     tiers and only dayOrdinal-comparable for 'day'. Gating all three on the
     current day is also the stronger rule: a week and a month roll over off
     the same clock, so a distrusted today must not pay a weekly either.
     A REFUSAL HERE GETS A VOICE. This used to return null, which reaches the
     click handler as a glowing Claim button whose tap does nothing: exactly how
     a lapsed player (7+ days with no /health, reason 'unwitnessed') experienced
     the app. The DECISION is untouched and stays the guard's; this only names
     it, shaped like { capped } below: truthy, carries no xp/coins, and every
     counter that scores wins must exclude it (clock-trust and reward-sop's
     predicates were updated alongside). */
  const day = await claimDay(dateKey());
  if (!day.fresh) return { dayGuard: day.reason || true };
  /* THE BOUND, not a trend. Ordering the pool stops the set from churning, but
     it is a property of one function that a later edit could quietly undo. This
     is the ceiling that holds regardless: a period pays at most QUEST_N claims,
     counted from the ledger, whatever is on screen. It also covers the rollout
     of the ordering fix, which necessarily shows some players a different set
     today than the one they already claimed from. */
  const cap = QUEST_N[period] || QUEST_N.day;
  const rows = await db.all('xp');
  const already = claimsThisPeriod(rows, periodKey, period);
  const mine = rows.some(r => r.key === `quest-${periodKey}-${q.id}`);
  /* RESERVE A SLOT, DO NOT MERELY COUNT ONE. The per-quest key below is atomic,
     so the SAME quest can never pay twice, but the period TOTAL was a read, an
     await and a write: two claims of DIFFERENT quests both saw themselves under
     the ceiling and both paid. Measured 2026-09-01 on origin/main 3d4b208c, a
     weekly cap of 3 with one prior claim paid FOUR when three distinct ids were
     claimed at once (+450 coins, +210 XP, 2 golden crates and a Vigor Draught),
     and a monthly cap of 2 paid 3. Reachable in one tab with no devtools: the
     Claim handler is async and the button is neither disabled nor debounced, so
     a second tap before the first await settles runs both.
     WHY A LEDGER ROW AND NOT A COUNTER IN kv. The ledger is already this file's
     authority, it is what claimsThisPeriod counts, and it survives a backup and
     restore. A kv counter would be new state that a restored save or a mid-period
     rollout starts from zero, handing every player a fresh capful. The slots are
     numbered from `already` so the rows that exist today are honoured without a
     backfill, and the walk up to `cap` is what settles a tie: two callers racing
     for slot n cannot both get it, and the loser takes n+1 or is refused.
     The id `slot-<n>` is deliberately not in any quest pool, so these rows are
     invisible to claimsThisPeriod, and they carry 0 XP, the same shape
     backfillDenCeilingIfNeeded's markers use. */
  let slotKey = null;
  if (!mine) {
    for (let n = already; n < cap; n++) {
      const key = `quest-${periodKey}-slot-${n}`;
      if (await db.addIfAbsent('xp', { key, type: 'questslot', xp: 0, label: 'Quest slot', date: dateKey(), ts: Date.now() })) { slotKey = key; break; }
    }
    if (!slotKey) {
      /* Say so rather than returning null. A null here reaches a click handler that
         does nothing at all, and a button that silently does nothing is the exact
         failure the write-failure work went after. */
      return { capped: true, cap, period };
    }
  }
  // Keeper's Boon: holding any Dark Spire pays a little extra on every quest.
  // This is the always-on perk that makes losing your last tower sting even when
  // nobody else is competing for it.
  const boon = await keepersBoon();
  const coins = boon ? Math.round(q.coins * (1 + boon.questCoinBonus)) : q.coins;
  /* CLAIM HYGIENE, 2026-09-05. Coins, crate, dust, item and ingredient used to
     land in five writes AFTER award() had already minted the quest's ledger
     row, so a throw anywhere in that chain (quota, the wipe-protocol freeze
     flag, an IndexedDB abort) left the quest permanently claimed and paid
     nothing: award() cannot be re-run once the row exists, and the
     slot-release branch above only covers the reservation, not this. Same
     shape js/hunt.js:collectSpawn already uses for the Boneyard collect (QA
     round 28 Y5): every payout rides inside the claim's own transaction via
     awardOnce's `pay`, so a losing write takes the whole reward with it and a
     winning claim always leaves with everything it bought. */
  const crate = q.crate ? (q.crate === 'egg' ? await eggRow('quests') : crateRow(q.crate, 'quests')) : null;
  const item = q.item ? { id: newId(), kind: q.item, source: 'quests', ts: Date.now() } : null;   // e.g. 'vigor'
  const pay = {
    kv: {
      coins: cur => Math.max(0, (Number(cur) || 0) + coins),
      // R38-13 (2026-09-06): bumped by the coin MAGNITUDE, matching js/loot.js
      // coinsAdd's own fix -- a flat +1 here would undermine the sum-based
      // merge tie-break for every quest payout. One-line, quest-lane-adjacent;
      // see js/db.js importAll's coinsRev comment for the full reasoning.
      coinsRev: cur => Math.max(0, (Number(cur) || 0) + Math.max(1, Math.abs(coins))),
      // v153: richer, more enticing rewards beyond coins — Bone Dust and
      // ingredients so the reward table isn't all coins.
      ...(q.dust ? { bonedust: cur => Math.max(0, (Number(cur) || 0) + q.dust) } : {}),
      ...(q.ingredient ? { ingredients: inv => ({ ...(inv || {}), [q.ingredient]: ((inv && inv[q.ingredient]) || 0) + (q.ingredientN || 1) }) } : {}),
    },
    puts: [...(crate ? [{ store: 'inv', val: crate }] : []), ...(item ? [{ store: 'inv', val: item }] : [])],
  };
  const claim = await awardOnce(`quest-${periodKey}-${q.id}`, 'quest', REWARD_XP[period] || 25, `Quest: ${q.name}`, undefined, null, pay);
  /* Nothing was minted, so give the slot back rather than burning it. Only the
     caller that created this row is here to delete it, and it deletes only on
     the path where it paid for nothing. */
  if (!claim.claimed) { if (slotKey) await db.del('xp', slotKey); return null; }
  return { xp: claim.xp, coins, boon: boon ? Math.round(coins - q.coins) : 0, crate: q.crate || null, dust: q.dust || 0, item: q.item || null, ingredient: q.ingredient || null };
}

// Bonus daily crate when all three dailies are claimed.
/* THE CALLER USED TO HAND THIS THE WHOLE XP STORE (R17-P2). Every row of it,
   read fresh on every quest claim, so that this function could test three
   exact keys. The xp store has no date index and never needed one: a claim row
   IS keyed `quest-<date>-<id>`, so the question is a point lookup per quest,
   three reads instead of a scan that grows for the life of the account. */
export async function claimAllBonusIfDue(date, quests) {
  // The closed-period rule too: this is the SECOND of the two places in js/ that
  // mints a quest claim row, so it takes the same guard.
  if (periodClosed('day', date)) return null;
  // MONOTONIC DAY GUARD (js/db.js claimDay): the all-three bonus crate rides on
  // the same daily rollover as the claims above, so it takes the same gate.
  if (!(await claimDay(dateKey())).fresh) return null;
  const claimRows = await Promise.all(quests.map(q => db.get('xp', `quest-${date}-${q.id}`)));
  if (!claimRows.every(Boolean)) return null;
  /* CLAIM HYGIENE, 2026-09-05: same fix as claimQuest above, and the same
     collectSpawn shape. grantCrate ran AFTER award() succeeded, so a throw
     there burned the questsall claim and handed over no crate. */
  const claim = await awardOnce(`questsall-${date}`, 'questsall', 30, 'All daily quests done', date, null,
    { kv: {}, puts: [{ store: 'inv', val: crateRow('daily', 'quests') }] });
  if (!claim.claimed) return null;
  return { xp: claim.xp, crate: 'daily' };
}
