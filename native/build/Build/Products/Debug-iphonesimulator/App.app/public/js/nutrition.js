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
  { id: 'recomp', label: 'Recomp', hint: 'Lose fat and build muscle together', adj: -0.08, protein: 2.2 },
  { id: 'maintain', label: 'Maintain', hint: 'Hold current weight', adj: 0, protein: 1.6 },
  { id: 'bulk', label: 'Lean bulk', hint: 'Slow, mostly-muscle gain', adj: 0.10, protein: 1.8 },
];

export function bmrMifflin({ sex, age, heightCm, weightKg }) {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'm' ? 5 : -161);
}

// profile: {sex, age, heightCm, weightKg, activity (id), goal (id)}
export function computeTargets(profile) {
  const act = ACTIVITY_LEVELS.find(a => a.id === profile.activity) || ACTIVITY_LEVELS[1];
  const goal = GOALS.find(g => g.id === profile.goal) || GOALS[2];
  const bmr = bmrMifflin(profile);
  const tdee = bmr * act.factor;
  const kcal = Math.max(1200, Math.round(tdee * (1 + goal.adj) / 10) * 10);
  const p = Math.round(goal.protein * profile.weightKg);
  const f = Math.max(Math.round(kcal * 0.25 / 9), Math.round(0.6 * profile.weightKg));
  const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
  return { kcal, p, c, f, bmr: Math.round(bmr), tdee: Math.round(tdee) };
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
