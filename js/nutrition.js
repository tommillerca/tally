// Pure nutrition math. No DOM, no storage. Unit-tested in tests/unit.test.js.

export const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: 'Sedentary', hint: 'Desk job, little exercise', factor: 1.2 },
  { id: 'light', label: 'Lightly active', hint: 'Exercise 1-3 days/week', factor: 1.375 },
  { id: 'moderate', label: 'Moderately active', hint: 'Exercise 3-5 days/week', factor: 1.55 },
  { id: 'very', label: 'Very active', hint: 'Hard exercise 6-7 days/week', factor: 1.725 },
  { id: 'athlete', label: 'Athlete', hint: 'Physical job + daily training', factor: 1.9 },
];

export const GOALS = [
  { id: 'cut', label: 'Lose fat', hint: 'About 0.7% of bodyweight per week', adj: -0.20, protein: 2.0 },
  { id: 'slowcut', label: 'Slow cut', hint: 'Gentler deficit, easier to sustain', adj: -0.10, protein: 2.0 },
  { id: 'recomp', label: 'Recomp', hint: 'Mild deficit, high protein', adj: -0.08, protein: 2.2 },
  { id: 'maintain', label: 'Maintain', hint: 'Hold current weight', adj: 0, protein: 1.6 },
  { id: 'bulk', label: 'Lean bulk', hint: 'Slow, mostly-muscle gain', adj: 0.10, protein: 1.8 },
];

export function bmrMifflin({ sex, age, heightCm, weightKg }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'm' ? 5 : -161);
}

/* The lowest calorie target this app will hand anyone: the person's own resting
   metabolic rate, and never under 1,200. QA round 25, M3: Sedentary x Lose fat
   is 1.2 x 0.80 = 0.96 x BMR, so 1,816 of 54,600 realistic adult profiles were
   targeted BELOW what their body burns lying still, and the bare 1,200 floor
   (which has no sex term, unlike every other line here) caught none of them.
   Shared by computeTargets and the manual editor so the two paths cannot drift. */
export function kcalFloor(profile) {
  return Math.max(1200, Math.round(bmrMifflin(profile)));
}

// profile: {sex, age, heightCm, weightKg, activity (id), goal (id)}
export function computeTargets(profile) {
  const act = ACTIVITY_LEVELS.find(a => a.id === profile.activity) || ACTIVITY_LEVELS[1];
  const goal = GOALS.find(g => g.id === profile.goal) || GOALS[2];
  const bmr = bmrMifflin(profile);
  const tdee = bmr * act.factor;
  const kcal = Math.max(kcalFloor(profile), Math.round(tdee * (1 + goal.adj) / 10) * 10);
  const p = Math.round(goal.protein * profile.weightKg);
  const f = Math.max(Math.round(kcal * 0.25 / 9), Math.round(0.6 * profile.weightKg));
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  return { kcal, p, c, f, bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

/* A hand-typed target (Settings > Daily targets). QA round 25, M2: the editor
   wrote kcal, protein, carbs and fat as four INDEPENDENT fields, so 800 kcal was
   stored with the 2,571 kcal of macros computed for the old figure still on top,
   and 800 went under the floor the computed path applies, for anyone. Here the
   calorie figure is the truth: protein and fat may be typed (null = the plan's
   own numbers), carbs is always the remainder, and a figure the floor or the
   arithmetic cannot honour is refused rather than stored.
   Returns {ok:true, targets:{kcal,p,c,f}} or {ok:false, problem}. */
export function manualTargets(profile, { kcal, p = null, f = null }) {
  const floor = kcalFloor(profile);
  if (kcal < floor) return { ok: false, problem: `Calorie target must be at least ${floor} kcal, your resting rate` };
  const goal = GOALS.find(g => g.id === profile.goal) || GOALS[2];
  const pp = p == null ? Math.round(goal.protein * profile.weightKg) : Math.round(p);
  const ff = f == null ? Math.max(Math.round(kcal * 0.25 / 9), Math.round(0.6 * profile.weightKg)) : Math.round(f);
  const c = Math.round((kcal - pp * 4 - ff * 9) / 4);
  if (c < 0) return { ok: false, problem: 'Protein and fat alone add up to more than the calorie target' };
  return { ok: true, targets: { kcal: Math.round(kcal), p: pp, c, f: ff } };
}

// Your activity level IS an assumed daily active burn: BMR x (factor - 1). That
// amount is already baked into your target, so only measured active energy ABOVE
// it is genuinely "extra" and earns calories back.
export const ACTIVE_CREDIT_FRACTION = 0.5; // credit half of the excess (watches over-read burn)
export function assumedActiveBurn(profile) {
  const act = ACTIVITY_LEVELS.find(a => a.id === profile.activity) || ACTIVITY_LEVELS[1];
  return Math.round(bmrMifflin(profile) * (act.factor - 1));
}
// Calories to add back to today's allowance given measured active energy (kcal).
export function activeCalorieBonus(profile, activeKcal, fraction = ACTIVE_CREDIT_FRACTION) {
  if (!profile || activeKcal == null || !isFinite(activeKcal)) return 0;
  const excess = activeKcal - assumedActiveBurn(profile);
  return excess > 0 ? Math.round(excess * fraction) : 0;
}

// ---- Food model ----
// food = {
//   id, name, brand?, source: 'generic'|'off'|'fdc'|'custom', barcode?,
//   per100?:      {kcal,p,c,f, fiber?,sugar?,sodium?}   nutrients per 100 g
//   perServing?:  {kcal,p,c,f, fiber?,sugar?,sodium?}   nutrients per 1 serving (when grams unknown)
//   servings: [{label, g}]  g may be null when unknown
//   favorite?, useCount?, lastUsedAt?, lastPortion?
// }
// sel = {mode:'serving', idx, qty} | {mode:'grams', grams}

const NUTR_KEYS = ['kcal', 'p', 'c', 'f', 'fiber', 'sugar', 'sodium'];

function scaleN(n, factor) {
  const out = {};
  for (const k of NUTR_KEYS) {
    if (n[k] != null && isFinite(n[k])) out[k] = n[k] * factor;
  }
  return out;
}

export function selGrams(food, sel) {
  if (sel.mode === 'grams') return sel.grams;
  const s = food.servings && food.servings[sel.idx];
  if (s && s.g != null) return s.g * sel.qty;
  return null;
}

/* Grams to preselect when the player taps the grams chip: the portion they were
   already looking at. QA round 25 M12(b)(c): app.js used to derive this as
   round(kcal / per100.kcal * 100), which is 0/0 = NaN for Diet soda (the corpus's
   one 0 kcal food, so every field read NaN and Add refused) and rounds a 1 tsp
   olive oil portion from 4.5 g to 5 g (40 to 44 kcal). The serving's own grams
   are known, so use them; divide by kcal only for perServing-only foods, and
   never by zero. */
export function gramsChipDefault(food, sel) {
  const g = selGrams(food, sel);
  if (g != null && isFinite(g)) return g;
  const cur = nutrientsFor(food, sel);
  if (cur && food.per100 && food.per100.kcal > 0) return Math.round((cur.kcal / food.per100.kcal) * 100);
  return 100;
}

export function nutrientsFor(food, sel) {
  if (sel.mode === 'grams') {
    if (!food.per100) return null;
    return scaleN(food.per100, sel.grams / 100);
  }
  const grams = selGrams(food, sel);
  if (grams != null && food.per100) return scaleN(food.per100, grams / 100);
  if (food.perServing) return scaleN(food.perServing, sel.qty);
  return null;
}

export function portionLabel(food, sel) {
  if (sel.mode === 'grams') return `${fmtQty(sel.grams)} g`;
  const s = (food.servings && food.servings[sel.idx]) || { label: 'serving', g: null };
  const qty = fmtQty(sel.qty);
  const grams = selGrams(food, sel);
  const base = sel.qty === 1 ? s.label : `${qty} × ${s.label}`;
  if (grams != null && !/\(\s*\d/.test(s.label) && s.g !== 100) return `${base} (${fmtQty(grams)} g)`;
  return base;
}

export function fmtQty(q) {
  if (q == null) return '';
  const r = Math.round(q * 100) / 100;
  return String(r);
}

export function fmtKcal(v) { return v == null ? '-' : String(Math.round(v)); }

export function fmtG(v) {
  if (v == null) return '-';
  const r = Math.round(v * 10) / 10;
  return Math.abs(r) >= 10 ? String(Math.round(r)) : String(r);
}

export function dayTotals(entries) {
  const t = { kcal: 0, p: 0, c: 0, f: 0, fiber: 0, sugar: 0, sodium: 0 };
  for (const e of entries) {
    for (const k of NUTR_KEYS) t[k] += e[k] || 0;
  }
  return t;
}

// kcal sanity: 4/4/9 within tolerance. Returns true when consistent or not checkable.
export function kcalConsistent(n, tolPct = 0.3, tolAbs = 30) {
  if (n == null || n.kcal == null) return true;
  const { p = 0, c = 0, f = 0 } = n;
  if (p === 0 && c === 0 && f === 0) return n.kcal <= tolAbs; // water, coffee, diet soda
  const est = 4 * p + 4 * c + 9 * f;
  const diff = Math.abs(est - n.kcal);
  return diff <= Math.max(tolAbs, n.kcal * tolPct, est * tolPct);
}

// ---- dates ----
export function dateKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const x = new Date(y, m - 1, d + n);
  return dateKey(x);
}

/* THE DAY BOUNDARY IS A TIMEOUT, NOT A 60 s LOTTERY (QA round 26 O13). dateKey()
   flips at 0 ms; everything the player could see flipped at up to 53 s because
   the day roll ran on a 60 s setInterval (measured across four real midnights:
   53.2, 44.4, 42.2, 41.2 s). One setTimeout aimed at the next LOCAL midnight
   lands the visible flip within ~1 s. setHours(24,0,0,0) is local-time
   arithmetic, so DST folds and a 23 or 25 hour day are already in the number.
   If a timer fires a hair EARLY the roll sees the same day and does nothing,
   and the re-arm computes the few ms left and fires again: self-healing. The
   interval stays behind it as the belt to this brace. */
export function msToNextMidnight(now = Date.now()) {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return Math.max(1, d.getTime() - now);
}
/* Arms one timeout for the next midnight and re-arms itself after each fire.
   `rearm()` is for resume: a suspended WebView's timers stop with it, so the
   one that was pending is thrown away and re-aimed from the current clock.
   The deps are injectable so node can drive it with a fake clock. */
export function armMidnightTimer(fn, { now = Date.now, setTimeout: st = globalThis.setTimeout, clearTimeout: ct = globalThis.clearTimeout } = {}) {
  let id = null;
  const arm = () => { id = st(() => { fn(); arm(); }, msToNextMidnight(now())); };
  arm();
  return { rearm() { ct(id); arm(); }, cancel() { ct(id); } };
}

/* MONOTONIC DAY GUARD, part 1 of 2. Part 2 is claimDay() in js/db.js.
 *
 * Turn a 'YYYY-MM-DD' key into an integer count of days since 1970-01-01.
 * NO Date OBJECT IS BUILT, and that is the point rather than a micro-
 * optimisation: dateKey() above asks the device what day it is, so it moves
 * whenever the device clock moves. This function asks nothing. It is pure
 * arithmetic on the characters of a string, so two keys can be ordered
 * against each other without the clock getting a second vote. A local
 * midnight, a timezone, a DST fold and a leap year are all already baked
 * into the key by the time it arrives here.
 *
 * Howard Hinnant's days_from_civil, exact for any proleptic Gregorian date.
 * Returns NaN for anything that is not a well-formed key, and every caller
 * treats NaN as "cannot judge this", never as zero. */
export function dayOrdinal(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key == null ? '' : key));
  if (!m) return NaN;
  const mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
  const y = +m[1] - (mo <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;                                   // [0, 399]
  const doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}
export function mealForHour(h) {
  if (h >= 4 && h < 10.5) return 0;       // breakfast
  if (h >= 10.5 && h < 15) return 1;      // lunch
  if (h >= 17 && h < 21.5) return 2;      // dinner
  return 3;                                // snacks
}
export const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

// ---- units ----
export const KG_PER_LB = 0.45359237;
export function lbToKg(lb) { return lb * KG_PER_LB; }
export function kgToLb(kg) { return kg / KG_PER_LB; }
export function ftInToCm(ft, inch) { return (ft * 12 + inch) * 2.54; }
export function cmToFtIn(cm) {
  const totalIn = cm / 2.54;
  let ft = Math.floor(totalIn / 12);
  let inch = Math.round(totalIn - ft * 12);
  if (inch === 12) { ft += 1; inch = 0; }
  return { ft, inch };
}

// ---- weight trend: exponentially smoothed over daily series ----
// weights: [{date:'YYYY-MM-DD', kg}] sorted ascending. Returns [{date, kg, trend}]
export function weightTrend(weights, alpha = 0.3) {
  const out = [];
  let trend = null;
  for (const w of weights) {
    trend = trend == null ? w.kg : trend + alpha * (w.kg - trend);
    out.push({ date: w.date, kg: w.kg, trend });
  }
  return out;
}

// Rate of change per week from trend line over the last `days` days.
export function trendRatePerWeek(trended, days = 14) {
  if (trended.length < 2) return null;
  const last = trended[trended.length - 1];
  const cutoff = addDays(last.date, -days);
  const window = trended.filter(t => t.date >= cutoff);
  if (window.length < 2) return null;
  const first = window[0];
  const spanDays = (new Date(last.date) - new Date(first.date)) / 86400000;
  if (spanDays < 3) return null;
  return (last.trend - first.trend) / spanDays * 7;
}

export function streakFrom(datesWithEntries, todayKey) {
  const set = new Set(datesWithEntries);
  let streak = 0;
  let d = todayKey;
  if (!set.has(d)) d = addDays(d, -1); // today not logged yet still counts yesterday's streak
  while (set.has(d)) { streak += 1; d = addDays(d, -1); }
  return streak;
}
