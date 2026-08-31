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
import { claimDay, db } from './db.js';
import { keepersBoon } from './spires.js';
import { award } from './game.js';
import { coinsAdd, grantCrate, boneDustAdd, grantConsumable } from './loot.js';
import { grantIngredient } from './cooking.js';

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
    sleepToday: base.allXp.some(r => r.key === `sleep-${base.date}`),
    wellnessDays: new Set(base.allXp.filter(r => r.type === 'wellness' && inP(r)).map(r => r.date)).size,
    logDays,
    friendBattles: countType('friendbattle'),
    friendsBattled: new Set(base.allXp.filter(r => r.type === 'friendbattle' && inP(r) && r.friendId).map(r => r.friendId)).size,
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
  { id: 'q-new-food', name: 'Explorer', desc: 'Log a food you have never logged before', coins: 50,
    progress: c => clamp(c.entries.filter(e => e.foodId && !c.priorFoodIds.has(e.foodId)).length, 1) },
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
    progress: c => clamp(c.waterToday ? 1 : 0, 1) },
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
  { id: 'w-boss', name: 'Boss hunter', desc: 'Beat 2 world bosses this week', coins: 180, crate: 'golden', dust: 60,
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

export const MONTHLY_POOL = [
  { id: 'm-steps', name: 'Marathoner', desc: 'Walk 200,000 steps this month', coins: 400, crate: 'egg', need: 'hk',
    progress: c => clamp(c.steps, 200000) },
  { id: 'm-pit', name: 'Pit veteran', desc: 'Win 50 Pit fights this month', coins: 400, crate: 'egg', need: 'pit',
    progress: c => clamp(c.pitWins, 50) },
  { id: 'm-boss', name: 'Boss slayer', desc: 'Beat 8 world bosses this month', coins: 500, crate: 'egg', dust: 150,
    progress: c => clamp(c.bossWins, 8) },
  { id: 'm-protein', name: 'Protein month', desc: 'Hit your protein target on 20 days', coins: 400, crate: 'egg',
    progress: c => clamp(c.proteinDays, 20) },
];

function pick(pool, seedStr, n, { hkConnected, huntEnabled, socialOn, pitTried, kitchenReady } = {}) {
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
  /* DRAW FIRST, THEN FILTER, NEVER SUBSTITUTE. The loop this replaces walked
     the shuffled order SKIPPING gated quests until it had n, so a flag flip
     changed which quests filled the back of the set: substitution, new ledger
     keys, freshly claimable rewards. Measured on 2026-08-30 when Tom's ruling
     ("no one should get a quest they cannot complete") added gates to the
     weekly and monthly tiers: worst reachable XP/day rose to 1445, past the
     1315 this comment's own history calls an exploit.
     Now the period's set is the first n of the shuffled order, fixed by the
     seed alone, and gates only REMOVE from it. A locked player sees fewer
     quests, never different ones, so unlocking mid-period reveals at most the
     quests that were always theirs and mints nothing fresh.
     THE FLOOR: a player whose whole draw is gated gets the first quest they
     CAN do, because zero quests is a dead screen (the first-week rule). That
     floor is the one surviving substitution and it is bounded at one. */
  const drawn = order.slice(0, n);
  const out = drawn.filter(ok);
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

export function dailyQuests(date, opts = {}) { return pick(DAILY_POOL, 'quests:' + date, QUEST_N.day, opts); }
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
     the same clock, so a distrusted today must not pay a weekly either. */
  if (!(await claimDay(dateKey())).fresh) return null;
  /* THE BOUND, not a trend. Ordering the pool stops the set from churning, but
     it is a property of one function that a later edit could quietly undo. This
     is the ceiling that holds regardless: a period pays at most QUEST_N claims,
     counted from the ledger, whatever is on screen. It also covers the rollout
     of the ordering fix, which necessarily shows some players a different set
     today than the one they already claimed from. */
  const cap = QUEST_N[period] || QUEST_N.day;
  const rows = await db.all('xp');
  const already = claimsThisPeriod(rows, periodKey, period);
  if (already >= cap && !rows.some(r => r.key === `quest-${periodKey}-${q.id}`)) {
    /* Say so rather than returning null. A null here reaches a click handler that
       does nothing at all, and a button that silently does nothing is the exact
       failure the write-failure work went after. */
    return { capped: true, cap, period };
  }
  const xp = await award(`quest-${periodKey}-${q.id}`, 'quest', REWARD_XP[period] || 25, `Quest: ${q.name}`);
  if (!xp) return null;
  // Keeper's Boon: holding any Dark Spire pays a little extra on every quest.
  // This is the always-on perk that makes losing your last tower sting even when
  // nobody else is competing for it.
  const boon = await keepersBoon();
  const coins = boon ? Math.round(q.coins * (1 + boon.questCoinBonus)) : q.coins;
  await coinsAdd(coins);
  if (q.crate) await grantCrate(q.crate, 'quests');
  // v153: richer, more enticing rewards beyond coins — Bone Dust, ingredients,
  // and consumables so the reward table isn't all coins.
  if (q.dust) await boneDustAdd(q.dust);
  if (q.item) await grantConsumable(q.item, 'quests');            // e.g. 'vigor'
  if (q.ingredient) await grantIngredient(q.ingredient, q.ingredientN || 1);
  return { xp, coins, boon: boon ? Math.round(coins - q.coins) : 0, crate: q.crate || null, dust: q.dust || 0, item: q.item || null, ingredient: q.ingredient || null };
}

// Bonus daily crate when all three dailies are claimed.
export async function claimAllBonusIfDue(date, quests, allXp) {
  // The closed-period rule too: this is the SECOND of the two places in js/ that
  // mints a quest claim row, so it takes the same guard.
  if (periodClosed('day', date)) return null;
  // MONOTONIC DAY GUARD (js/db.js claimDay): the all-three bonus crate rides on
  // the same daily rollover as the claims above, so it takes the same gate.
  if (!(await claimDay(dateKey())).fresh) return null;
  const allClaimed = quests.every(q => allXp.some(r => r.key === `quest-${date}-${q.id}`));
  if (!allClaimed) return null;
  const xp = await award(`questsall-${date}`, 'questsall', 30, 'All daily quests done', date);
  if (!xp) return null;
  await grantCrate('daily', 'quests');
  return { xp, crate: 'daily' };
}
