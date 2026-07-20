// Node unit tests: node tests/unit.test.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

import {
  computeTargets, nutrientsFor, portionLabel, dayTotals, kcalConsistent,
  dateKey, addDays, streakFrom, weightTrend, trendRatePerWeek,
  lbToKg, kgToLb, ftInToCm, cmToFtIn, mealForHour,
  assumedActiveBurn, activeCalorieBonus, bmrMifflin,
} from '../js/nutrition.js';
import { RECIPES, INGREDIENTS, canCook, ingredientCount, fmtCookTime, POTIONS, POTION_BY_ID, potionCount, MAX_POTS, POT_PRICES, nextPotPrice, TRANSMUTE, transmuteConsume } from '../js/cooking.js';
import { isWalkableFeature, snapToWalkable } from '../js/geo.js';
import { parseNutritionText } from '../js/labelparse.js';
import { mapOffProduct, mapFdcFood, rankFdcResults, fetchOffProduct } from '../js/sources.js';
import { GENERIC_FOODS, searchFoods } from '../data/generic-foods.js';
import { xpForLevel, levelFor, badgeCheck, parseHkPayload, LEVEL_NAMES, BADGES, levelCoins } from '../js/game.js';
import {
  dailyQuests, weeklyQuests, monthlyQuests, questCtx, questState, periodKeyOf,
  weekKeyOf, weekDates, monthKeyOf, monthDates, DAILY_POOL, WEEKLY_POOL, MONTHLY_POOL,
} from '../js/quests.js';
import { RARITIES, RARITY_ORDER, CRATES, SHOP, DUST_VALUE, DUST_SHOP, gearDustValue, petDustValue,
  migrateInstances, bestInstance, speciesCount, removeWorstInstance, addInstance, creditSteps,
  removeInstance, breedOffspring, breedCost } from '../js/loot.js';
import { BH_ITEMS, BH_SLOTS, BH_BY_ID, bhAsset } from '../data/boneheadz.js';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = f => JSON.parse(readFileSync(join(here, 'fixtures', f), 'utf8'));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.error(`FAIL ${name}\n  ${e.message}`); }
}
const approx = (a, b, tol = 0.02) => {
  assert.ok(Math.abs(a - b) <= Math.max(Math.abs(b) * tol, 0.01), `${a} !~ ${b}`);
};

// ---- targets ----
test('computeTargets male recomp', () => {
  const t = computeTargets({ sex: 'm', age: 32, heightCm: 180, weightKg: 84, activity: 'moderate', goal: 'recomp' });
  // BMR = 840 + 1125 - 160 + 5 = 1810; TDEE = 2805.5; recomp -8% = 2581 -> 2580
  assert.equal(t.bmr, 1810);
  assert.equal(t.kcal, 2580);
  assert.equal(t.p, Math.round(2.2 * 84)); // 185
  assert.ok(t.f >= Math.round(0.6 * 84));
  approx(t.p * 4 + t.c * 4 + t.f * 9, t.kcal, 0.03);
});
test('computeTargets female floor', () => {
  const t = computeTargets({ sex: 'f', age: 45, heightCm: 158, weightKg: 52, activity: 'sedentary', goal: 'cut' });
  assert.ok(t.kcal >= 1200);
});
test('active calorie-back: only burn ABOVE the activity baseline credits, at 50%', () => {
  const p = { sex: 'm', age: 32, heightCm: 180, weightKg: 84, activity: 'moderate', goal: 'recomp' };
  const bmr = bmrMifflin(p);
  const assumed = assumedActiveBurn(p);
  assert.equal(assumed, Math.round(bmr * (1.55 - 1)), 'baseline = BMR x (factor-1)');
  // below/at baseline -> nothing back (target already covers it)
  assert.equal(activeCalorieBonus(p, assumed - 50), 0);
  assert.equal(activeCalorieBonus(p, assumed), 0);
  // above baseline -> half the excess
  assert.equal(activeCalorieBonus(p, assumed + 600), 300);
  // missing data -> 0, never negative
  assert.equal(activeCalorieBonus(p, null), 0);
  assert.equal(activeCalorieBonus(p, 0), 0);
});

// ---- portion math ----
const rice = GENERIC_FOODS.find(f => f.id === 'g-white-rice-cooked');
test('rice exists with cup serving', () => {
  assert.ok(rice, 'rice food present');
  assert.ok(rice.servings.some(s => s.g === 158));
});
test('nutrientsFor serving mode', () => {
  const idx = rice.servings.findIndex(s => s.g === 158);
  const n = nutrientsFor(rice, { mode: 'serving', idx, qty: 1 });
  approx(n.kcal, 205.4); approx(n.p, 4.27); approx(n.c, 44.6);
});
test('nutrientsFor grams mode', () => {
  const n = nutrientsFor(rice, { mode: 'grams', grams: 50 });
  approx(n.kcal, 65);
});
test('nutrientsFor perServing-only food', () => {
  const f = { name: 'X', perServing: { kcal: 210, p: 5, c: 30, f: 8 }, servings: [{ label: '1 serving', g: null }] };
  const n = nutrientsFor(f, { mode: 'serving', idx: 0, qty: 2 });
  assert.equal(n.kcal, 420); assert.equal(n.p, 10);
});
test('portionLabel grams appended', () => {
  const idx = rice.servings.findIndex(s => s.g === 158);
  assert.equal(portionLabel(rice, { mode: 'serving', idx, qty: 1 }), '1 cup (158 g)');
  assert.equal(portionLabel(rice, { mode: 'grams', grams: 85 }), '85 g');
  assert.equal(portionLabel(rice, { mode: 'serving', idx, qty: 2 }), '2 × 1 cup (316 g)');
});
test('dayTotals sums', () => {
  const t = dayTotals([{ kcal: 100, p: 10 }, { kcal: 50, p: 2, f: 3 }]);
  assert.equal(t.kcal, 150); assert.equal(t.p, 12); assert.equal(t.f, 3);
});

// ---- dates ----
test('date helpers', () => {
  assert.equal(addDays('2026-07-02', -1), '2026-07-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(dateKey(new Date(2026, 6, 2)), '2026-07-02');
  assert.equal(mealForHour(8), 0); assert.equal(mealForHour(12), 1);
  assert.equal(mealForHour(19), 2); assert.equal(mealForHour(23), 3);
});
test('streak counts back from today or yesterday', () => {
  assert.equal(streakFrom(['2026-06-30', '2026-07-01', '2026-07-02'], '2026-07-02'), 3);
  assert.equal(streakFrom(['2026-06-30', '2026-07-01'], '2026-07-02'), 2);
  assert.equal(streakFrom([], '2026-07-02'), 0);
});

// ---- weight trend ----
test('weightTrend smooths and rate is weekly', () => {
  const w = [];
  for (let i = 0; i < 28; i++) w.push({ date: addDays('2026-06-01', i), kg: 90 - i * 0.05 + (i % 2 ? 0.4 : -0.4) });
  const t = weightTrend(w);
  assert.equal(t.length, 28);
  const rate = trendRatePerWeek(t, 14);
  assert.ok(rate < 0 && rate > -1, `rate ${rate}`);
});

// ---- units ----
test('unit conversions round-trip', () => {
  approx(lbToKg(185), 83.91);
  approx(kgToLb(84), 185.2);
  approx(ftInToCm(5, 11), 180.34);
  const { ft, inch } = cmToFtIn(180);
  assert.equal(ft, 5); assert.equal(inch, 11);
});

// ---- generic DB integrity ----
test('generic foods: unique ids', () => {
  const ids = new Set(GENERIC_FOODS.map(f => f.id));
  assert.equal(ids.size, GENERIC_FOODS.length);
});
test('generic foods: kcal consistent with macros (non-alcohol)', () => {
  const bad = [];
  for (const f of GENERIC_FOODS) {
    if ((f.kws || '').includes('alcohol')) continue;
    if (!kcalConsistent(f.per100, 0.25, 25)) bad.push(`${f.name}: ${f.per100.kcal} vs ${4 * f.per100.p + 4 * f.per100.c + 9 * f.per100.f}`);
  }
  assert.equal(bad.length, 0, '\n' + bad.join('\n'));
});
test('generic foods: servings sane', () => {
  for (const f of GENERIC_FOODS) {
    assert.ok(f.servings.length >= 1, f.name);
    for (const s of f.servings) {
      assert.ok(s.g > 0 && s.g <= 1000, `${f.name} ${s.label} ${s.g}`);
      assert.ok(s.label.length > 0);
    }
  }
});
test('search: banana first for "banana"', () => {
  assert.equal(searchFoods(GENERIC_FOODS, 'banana')[0].name, 'Banana');
});
test('search: multi-term and keyword', () => {
  assert.equal(searchFoods(GENERIC_FOODS, 'chicken br')[0].name, 'Chicken breast, cooked');
  assert.ok(searchFoods(GENERIC_FOODS, 'pb')[0].name.includes('Peanut butter'));
  assert.ok(searchFoods(GENERIC_FOODS, 'oj')[0].name.includes('Orange juice'));
  assert.equal(searchFoods(GENERIC_FOODS, 'zzzz').length, 0);
});

// ---- label parser ----
const US_LABEL = `Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Amount per serving
Calories
230
% Daily Value
Total Fat 8g 10%
Saturated Fat 1g 5%
Trans Fat 0g
Cholesterol 0mg 0%
Sodium 160mg 7%
Total Carbohydrate 37g 13%
Dietary Fiber 4g 14%
Total Sugars 12g
Includes 10g Added Sugars 20%
Protein 3g
Vitamin D 2mcg 10%`;
test('parses US new-style label', () => {
  const r = parseNutritionText(US_LABEL);
  assert.equal(r.kcal, 230); assert.equal(r.fat, 8); assert.equal(r.satFat, 1);
  assert.equal(r.sodium, 160); assert.equal(r.carbs, 37); assert.equal(r.fiber, 4);
  assert.equal(r.sugar, 12); assert.equal(r.addedSugar, 10); assert.equal(r.protein, 3);
  assert.equal(r.servingGrams, 55);
});

const CA_LABEL = `Valeur nutritive
Nutrition Facts
Per 3/4 cup (175 g)
pour 3/4 tasse (175 g)
Calories 150
Fat / Lipides 8 g 11%
Saturated / satures 5 g
+ Trans / trans 0.2 g 26%
Carbohydrate / Glucides 27 g
Fibre / Fibres 0 g 0%
Sugars / Sucres 18 g 18%
Protein / Proteines 8 g
Cholesterol / Cholesterol 30 mg
Sodium 105 mg 5%`;
test('parses Canadian bilingual label', () => {
  const r = parseNutritionText(CA_LABEL);
  assert.equal(r.kcal, 150); assert.equal(r.fat, 8); assert.equal(r.satFat, 5);
  assert.equal(r.carbs, 27); assert.equal(r.sugar, 18); assert.equal(r.protein, 8);
  assert.equal(r.sodium, 105); assert.equal(r.servingGrams, 175);
});

const NOISY_LABEL = `Nutrition Facts
Serving Size 1 cup (24Og)
Calories 11O
Total Fat Og 0%
Sodium 125mg 5%
Total Carbohydrate 26g 9%
Dietary Fiber lg 4%
Sugars 22g
Protein 1g`;
test('parses OCR-noisy label (O for 0, l for 1)', () => {
  const r = parseNutritionText(NOISY_LABEL);
  assert.equal(r.kcal, 110); assert.equal(r.fat, 0); assert.equal(r.fiber, 1);
  assert.equal(r.carbs, 26); assert.equal(r.servingGrams, 240);
});

const OLD_LABEL = `Nutrition Facts
Serving Size 1 package (255g)
Servings Per Container 1
Amount Per Serving
Calories 250 Calories from Fat 110
Total Fat 12g 18%
Sodium 470mg 20%
Total Carbohydrate 31g 10%
Protein 5g`;
test('old label ignores calories-from-fat', () => {
  const r = parseNutritionText(OLD_LABEL);
  assert.equal(r.kcal, 250); assert.equal(r.fat, 12);
});
test('g-as-9 recovery bounded by parent value', () => {
  const r = parseNutritionText('Calories 230\nTotal Fat 8g\nSaturated Fat 19 5%\nTotal Carbohydrate 37g\nDietary Fiber 49\nProtein 3g');
  assert.equal(r.satFat, 1);
  assert.equal(r.fiber, 4);
});
test('macro mismatch warning fires', () => {
  const r = parseNutritionText('Calories 900\nTotal Fat 1g\nTotal Carbohydrate 10g\nProtein 2g');
  assert.ok(r.warnings.some(w => w.includes('Double-check')));
});

// ---- OFF mapper ----
test('mapOffProduct coca-cola fixture', () => {
  const f = mapOffProduct(fx('off_cocacola.json'));
  assert.equal(f.barcode, '5449000000996');
  assert.equal(f.per100.kcal, 42);
  approx(f.per100.sugar, 10.6);
  const s = f.servings.find(s => s.g === 330);
  assert.ok(s, 'has 330 ml serving');
  const n = nutrientsFor(f, { mode: 'serving', idx: f.servings.indexOf(s), qty: 1 });
  approx(n.kcal, 138.6);
});
test('mapOffProduct quaker fixture', () => {
  const f = mapOffProduct(fx('off_quaker.json'));
  assert.equal(f.per100.kcal, 375);
  assert.ok(f.servings.some(s => s.g === 40));
  assert.equal(f.brand, 'Quaker Oats');
});
test('fetchOffProduct retries UPC-A with leading zero', async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    if (url.includes('/038000138416.json')) return { status: 404, ok: false };
    return { status: 200, ok: true, json: async () => fx('off_quaker.json') };
  };
  const f = await fetchOffProduct('038000138416', fakeFetch);
  assert.ok(f);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes('/0038000138416.json'));
});

// ---- FDC mapper ----
test('mapFdcFood cheerios per-100g basis', () => {
  const foods = fx('fdc_cheerios.json').foods.map(mapFdcFood);
  const good = foods.find(f => f && f.name.toLowerCase().includes('cheerios') && f.quality === 1);
  assert.ok(good, 'has a consistent cheerios');
  assert.ok(good.per100.kcal > 300 && good.per100.kcal < 420, String(good.per100.kcal));
  assert.ok(good.servings.some(s => s.g && s.g < 100), 'has label serving');
});
test('rankFdcResults dedupes and prefers quality', () => {
  const foods = fx('fdc_search.json').foods.map(mapFdcFood);
  const ranked = rankFdcResults(foods, 'fairlife 2% milk');
  assert.ok(ranked.length >= 1);
  const keys = ranked.map(f => `${f.name}|${f.brand}`);
  assert.equal(new Set(keys).size, keys.length);
});

// ---- game ----
test('xp curve is monotonic and starts at zero', () => {
  assert.equal(xpForLevel(1), 0);
  for (let L = 2; L <= 30; L++) assert.ok(xpForLevel(L) > xpForLevel(L - 1), `L${L}`);
});
test('levelFor boundaries', () => {
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(0).name, LEVEL_NAMES[0]);
  assert.equal(levelFor(xpForLevel(5)).level, 5);
  assert.equal(levelFor(xpForLevel(3) - 1).level, 2);
  const l = levelFor(120);
  assert.ok(l.pct >= 0 && l.pct <= 100);
});
test('badge checks', () => {
  assert.ok(badgeCheck('first-log', { logs: 1 }));
  assert.ok(!badgeCheck('first-log', { logs: 0 }));
  assert.ok(badgeCheck('streak-7', { streak: 9 }));
  assert.ok(badgeCheck('steps-10k', { maxSteps: 10400 }));
  assert.ok(!badgeCheck('steps-10k', { maxSteps: 9999 }));
  const ids = new Set(BADGES.map(b => b.id));
  assert.equal(ids.size, BADGES.length);
});
test('parseHkPayload clipboard format with separators', () => {
  const p = parseHkPayload('tally-hk steps=8,421 active=512,3 weightlb=184.6');
  assert.equal(p.steps, 8421);
  assert.equal(p.activeKcal, 512);
  approx(p.weightKg, 83.74, 0.01);
});
test('parseHkPayload url format with date', () => {
  const p = parseHkPayload('#/hk?steps=9000&active=300&weightkg=83.2&d=2026-07-01');
  assert.equal(p.steps, 9000);
  assert.equal(p.date, '2026-07-01');
  approx(p.weightKg, 83.2, 0.01);
});
test('parseHkPayload rejects junk', () => {
  assert.equal(parseHkPayload(''), null);
  assert.equal(parseHkPayload('hello world'), null);
  assert.equal(parseHkPayload('tally-hk nothing=1'), null);
  const p = parseHkPayload('tally-hk steps=4200');
  assert.equal(p.steps, 4200);
  assert.equal(p.weightKg, undefined ?? p.weightKg); // no weight present
  assert.equal(p.activeKcal, null);
});
test('parseHkPayload weight sanity bounds', () => {
  const p = parseHkPayload('tally-hk steps=100 weightlb=9999');
  assert.equal(p.weightKg, null);
});

// ---- quests ----
test('quest tiers: deterministic, distinct, gated', () => {
  const opts = { hkConnected: true, huntEnabled: true };
  const a = dailyQuests('2026-07-03', opts), b = dailyQuests('2026-07-03', opts);
  assert.deepEqual(a.map(q => q.id), b.map(q => q.id));
  assert.equal(new Set(a.map(q => q.id)).size, 3);
  assert.equal(weeklyQuests('2026-07-03', opts).length, 3);
  assert.equal(monthlyQuests('2026-07-03', opts).length, 2);
  // gating drops steps/hunt quests when those systems are off
  const off = dailyQuests('2026-07-03', { hkConnected: false, huntEnabled: false });
  assert.ok(off.every(q => q.need !== 'hk' && q.need !== 'hunt'));
  // daily rotation actually rotates across a week
  const week = new Set();
  for (let i = 0; i < 7; i++) dailyQuests(`2026-07-0${i + 1}`, opts).forEach(q => week.add(q.id));
  assert.ok(week.size >= 6, String(week.size));
});
test('questCtx aggregates period-scoped ledger data', () => {
  const allXp = [
    { type: 'fight', date: '2026-06-29' }, { type: 'fight', date: '2026-07-01' },
    { type: 'fight', date: '2026-07-13' }, // next week: excluded from this week
    { type: 'boss', date: '2026-06-30' }, { type: 'protein', date: '2026-07-01' },
    { type: 'spawn', date: '2026-07-02' },
  ];
  const healthRows = [
    { date: '2026-06-29', steps: 9000 }, { date: '2026-07-01', steps: 12000 },
    { date: '2026-07-13', steps: 5000 },
  ];
  const base = { date: '2026-07-03', entries: [], allXp, allLog: [], healthRows, targets: { p: 150 }, priorFoodIds: new Set(), weighedToday: false };
  const wk = questCtx('week', base); // week of 2026-06-29..07-05
  assert.equal(wk.pitWins, 2, 'two fights this week');
  assert.equal(wk.bossWins, 1);
  assert.equal(wk.spawns, 1);
  assert.equal(wk.proteinDays, 1);
  assert.equal(wk.steps, 21000, 'steps summed within the week only');
  const day = questCtx('day', base);
  assert.equal(day.pitWins, 0, 'no fights on the exact day');
});
test('questCtx: friend battles count total + distinct friends (v136)', () => {
  const allXp = [
    { type: 'friendbattle', date: '2026-07-03', friendId: 'amy' },
    { type: 'friendbattle', date: '2026-07-04', friendId: 'amy' },  // same friend, different day
    { type: 'friendbattle', date: '2026-07-04', friendId: 'bo' },
    { type: 'friendbattle', date: '2026-07-13', friendId: 'cy' },   // next week: excluded
  ];
  const base = { date: '2026-07-03', entries: [], allXp, allLog: [], healthRows: [], targets: {}, priorFoodIds: new Set() };
  const wk = questCtx('week', base);
  assert.equal(wk.friendBattles, 3, 'three battles this week');
  assert.equal(wk.friendsBattled, 2, 'two DISTINCT friends this week (amy, bo)');
  const day = questCtx('day', base);
  assert.equal(day.friendBattles, 1, 'one battle on the exact day');
  // the daily + weekly friend quests read those fields
  const dq = DAILY_POOL.find(q => q.id === 'q-friend');
  assert.deepEqual(dq.progress(day), { cur: 1, target: 1 });
  const wq = WEEKLY_POOL.find(q => q.id === 'w-friends');
  assert.deepEqual(wq.progress(wk), { cur: 2, target: 3 });
  assert.equal(dq.need, 'social'); assert.equal(wq.need, 'social');
});
test('quest progress + claim state', () => {
  const q3 = DAILY_POOL.find(q => q.id === 'q-3meals');
  const base = { date: '2026-07-03', entries: [{ meal: 0 }, { meal: 1 }], allXp: [], allLog: [], healthRows: [], targets: { p: 180 }, priorFoodIds: new Set(), weighedToday: false };
  const ctx = questCtx('day', base);
  const st = questState(q3, ctx);
  assert.equal(st.cur, 2); assert.equal(st.target, 3); assert.ok(!st.done);
  const wpit = WEEKLY_POOL.find(q => q.id === 'w-pit');
  assert.equal(wpit.progress({ pitWins: 12 }).target, 12);
  const mboss = MONTHLY_POOL.find(q => q.id === 'm-boss');
  assert.equal(mboss.progress({ bossWins: 8 }).cur, 8);
  // claimed detection reads the period-keyed ledger row
  const claimedBase = { ...base, allXp: [{ key: 'quest-2026-07-03-q-3meals' }] };
  assert.ok(questState(q3, questCtx('day', claimedBase)).claimed);
});
test('period key helpers', () => {
  assert.equal(weekKeyOf('2026-07-03'), '2026-06-29'); // Friday -> Monday
  assert.equal(weekKeyOf('2026-06-29'), '2026-06-29');
  assert.equal(weekDates('2026-06-29').length, 7);
  assert.equal(monthKeyOf('2026-07-03'), '2026-07');
  assert.equal(monthDates('2026-07-03').length, 31);
  assert.equal(monthDates('2026-02-15').length, 28);
  assert.equal(periodKeyOf('month', '2026-07-03'), '2026-07');
  assert.equal(weekDates('2026-06-29')[6], '2026-07-05');
});

// ---- cooking ----
test('recipes reference real ingredients; canCook + timer helpers', () => {
  for (const r of RECIPES) {
    assert.ok(r.cookMin > 0 && r.buff && r.buff.kind, r.id);
    for (const id of Object.keys(r.needs)) assert.ok(INGREDIENTS[id], `${r.id} needs real ingredient ${id}`);
  }
  const stew = RECIPES.find(r => r.id === 'marrow-stew'); // needs marrow:2 graveroot:1
  assert.ok(!canCook(stew, { marrow: 1, graveroot: 1 }), 'not enough marrow');
  assert.ok(canCook(stew, { marrow: 2, graveroot: 1, salt: 5 }), 'enough to cook');
  assert.equal(ingredientCount({ marrow: 2, salt: 1 }), 3);
  assert.equal(fmtCookTime(15 * 60000), '15m');
  assert.equal(fmtCookTime(90 * 60000), '1h 30m');
});

// ---- map spawn placement (snap to walkable) ----
test('walkable classifier: roads/paths/parks yes, motorway/buildings no', () => {
  assert.ok(isWalkableFeature({ sourceLayer: 'transportation', properties: { class: 'residential' } }));
  assert.ok(isWalkableFeature({ sourceLayer: 'transportation', properties: { class: 'footway' } }));
  assert.ok(isWalkableFeature({ sourceLayer: 'park', properties: {} }));
  assert.ok(isWalkableFeature({ sourceLayer: 'landuse', properties: { class: 'grass' } }));
  assert.ok(!isWalkableFeature({ sourceLayer: 'transportation', properties: { class: 'motorway' } }));
  assert.ok(!isWalkableFeature({ sourceLayer: 'building', properties: {} }));
  assert.ok(!isWalkableFeature({ sourceLayer: 'water', properties: {} }));
});
test('snapToWalkable: snaps to a nearby road, respects the max distance, sits inside a park', () => {
  const anchor = { lat: 40, lng: -74 };
  const roadAt = m => ({ sourceLayer: 'transportation', properties: { class: 'residential' },
    geometry: { type: 'LineString', coordinates: [[-74.001, 40 + m / 110540], [-73.999, 40 + m / 110540]] } });
  const near = snapToWalkable(anchor, [roadAt(10)], 35);
  assert.ok(near && Math.abs(near.dist - 10) < 3, JSON.stringify(near));
  assert.ok(near.lat > anchor.lat, 'snapped toward the road (north)');
  assert.equal(snapToWalkable(anchor, [roadAt(100)], 35), null, 'too far -> no snap');
  const park = { sourceLayer: 'park', properties: {}, geometry: { type: 'Polygon',
    coordinates: [[[-74.001, 39.999], [-73.999, 39.999], [-73.999, 40.001], [-74.001, 40.001], [-74.001, 39.999]]] } };
  const inPark = snapToWalkable(anchor, [park], 35);
  assert.ok(inPark && inPark.inside && inPark.lat === anchor.lat, 'inside a park -> keep the anchor');
});

// ---- loot data ----
test('rarity weights sum to 100 and crates are sane', () => {
  assert.equal(RARITY_ORDER.reduce((a, r) => a + RARITIES[r].w, 0), 100);
  for (const k of Object.keys(CRATES)) {
    assert.ok(CRATES[k].rolls >= 1 && CRATES[k].floor < RARITY_ORDER.length, k);
  }
  assert.ok(SHOP.every(s => s.cost > 0));
});

// ---- boneheadz manifest ----
test('boneheadz: unique ids, valid slots, assets exist', () => {
  const ids = new Set(BH_ITEMS.map(i => i.id));
  assert.equal(ids.size, BH_ITEMS.length);
  const slotCodes = new Set(BH_SLOTS.map(s => s.code));
  for (const i of BH_ITEMS) {
    assert.ok(slotCodes.has(i.slot), i.id);
    assert.ok(RARITY_ORDER.includes(i.rarity), i.id);
  }
  // spot-check asset files on disk (every 10th to keep it fast)
  for (let k = 0; k < BH_ITEMS.length; k += 10) {
    const p = join(here, '..', bhAsset(BH_ITEMS[k]));
    assert.ok(existsSync(p), p);
  }
});
test('boneheadz: full slots have a legendary to chase, defaults exist', () => {
  for (const s of BH_SLOTS) {
    const items = BH_ITEMS.filter(i => i.slot === s.code);
    if (items.length >= 5) assert.ok(items.some(i => i.rarity === 'legendary'), s.code);
    if (s.default) assert.ok(BH_BY_ID[s.default], s.default);
  }
});
test('boneheadz: yard specials exist with real art files', () => {
  const yd = BH_ITEMS.filter(i => i.slot === 'YD');
  assert.equal(yd.length, 2);
  for (const i of yd) {
    assert.ok(i.file, i.id);
    assert.ok(existsSync(join(here, '..', bhAsset(i))), i.file);
  }
});

// ---- boss dens (the bone road, reimagined) ----
const poi = await import('../js/poi.js');
test('dens: permanent positions, weekly identity, deterministic', () => {
  const wk = '2026-W27';
  const a = poi.densNear(wk, 49.2827, -123.1207);
  const b = poi.densNear(wk, 49.2827, -123.1207);
  assert.equal(a.length, 9);
  assert.deepEqual(a.map(d => d.id), b.map(d => d.id), 'same cells, same dens');
  assert.deepEqual([a[0].lat, a[0].lng], [b[0].lat, b[0].lng], 'positions stable');
  // positions do NOT change across weeks; identity (tier/theme) may
  const c = poi.densNear('2026-W28', 49.2827, -123.1207);
  assert.deepEqual(a.map(d => [d.id, d.lat, d.lng]), c.map(d => [d.id, d.lat, d.lng]), 'landmarks never move');
  for (const d of a) {
    assert.ok(d.tier >= 0 && d.tier < poi.DEN_TIERS.length);
    assert.ok(d.mult >= 0.7 && d.mult <= 1.32, 'boss scale within audited pit range');
    assert.ok(d.name && d.boss);
    assert.ok(d.reward.xp > 0);
  }
});
test('dens: weekly claim keys + reward labels', () => {
  const wk = poi.isoWeekKey(new Date('2026-07-04T12:00:00Z'));
  assert.equal(wk, '2026-W27');
  const den = poi.densNear(wk, 49.2827, -123.1207)[0];
  assert.ok(poi.denKey(wk, den).startsWith('boss-2026-W27-'));
  assert.ok(poi.denRewardLabel({ crate: 'golden', coins: 200, xp: 100 }).includes('Golden Crate'));
  // iso week boundaries: Sunday belongs to the week of the preceding Monday
  assert.equal(poi.isoWeekKey(new Date('2026-01-01T12:00:00Z')), '2026-W01');
});

// ---- boneyard hunt ----
const huntMod = await import('../js/hunt.js');
test('hunt: spawns are deterministic per date+cell and differ across cells/days', () => {
  const a = huntMod.spawnsForCell('2026-07-03', 9856, -24625);
  const b = huntMod.spawnsForCell('2026-07-03', 9856, -24625);
  assert.deepEqual(a, b);
  const c = huntMod.spawnsForCell('2026-07-04', 9856, -24625);
  assert.notDeepEqual(a.map(s => [s.lat, s.lng]), c.map(s => [s.lat, s.lng]));
  const d = huntMod.spawnsForCell('2026-07-03', 9857, -24625);
  assert.notDeepEqual(a.map(s => [s.lat, s.lng]), d.map(s => [s.lat, s.lng]));
  assert.ok(a.length >= 2 && a.length <= 3); // SLOTS=2 base + an occasional rare
  for (const s of a) assert.ok(['bones', 'coins', 'crate', 'rare'].includes(s.type));
});
test('hunt: distance and bearing math', () => {
  // 0.001 deg latitude ~ 111 m
  approx(huntMod.distanceM(49.28, -123.12, 49.281, -123.12), 111.2, 0.02);
  approx(huntMod.bearingDeg(49.28, -123.12, 49.281, -123.12), 0, 0.01); // due north
  const east = huntMod.bearingDeg(49.28, -123.12, 49.28, -123.119);
  assert.ok(Math.abs(east - 90) < 1, String(east));
  assert.equal(huntMod.compassLabel(0), 'N');
  assert.equal(huntMod.compassLabel(93), 'E');
  assert.equal(huntMod.compassLabel(225), 'SW');
});
test('hunt: spawnsNear returns nearest-first annotated set', () => {
  const near = huntMod.spawnsNear('2026-07-03', 49.28, -123.12);
  assert.ok(near.length > 0 && near.length <= 20);
  for (let i = 1; i < near.length; i++) assert.ok(near[i].dist >= near[i - 1].dist);
  for (const s of near) { assert.ok(isFinite(s.dist) && isFinite(s.bearing)); }
});
test('hunt: spawn keys are stable and ledger-friendly', () => {
  const s = { id: '9856_-24625_1' };
  assert.equal(huntMod.spawnKey('2026-07-03', s), 'spawn-2026-07-03-9856_-24625_1');
});
test('hunt: fmtDist', () => {
  assert.equal(huntMod.fmtDist(42), '42 m');
  assert.equal(huntMod.fmtDist(1620), '1.6 km');
});

// ---- companion shortcut ----
test('signed Sync Boneheadz shortcut ships with the app', () => {
  const p = join(here, '..', 'assets', 'shortcut', 'Sync-Boneheadz.shortcut');
  assert.ok(existsSync(p));
  const buf = readFileSync(p);
  assert.equal(buf.subarray(0, 4).toString(), 'AEA1'); // Apple signed-shortcut container
  assert.ok(buf.length > 5000 && buf.length < 200000, String(buf.length));
});

// async tests resolution
await new Promise(r => setTimeout(r, 50));
test('level rewards scale with level', () => {
  assert.equal(levelCoins(2), 30);
  assert.equal(levelCoins(10), 70);
  assert.ok(levelCoins(11) > levelCoins(10));
});

// ---- gear: statted equipment on all wearable slots ----
const gear = await import('../js/gear.js');
test('gear: catalog covers all wearable slots in 4 tiers', () => {
  assert.ok(gear.GEAR_ITEMS.length > 100, String(gear.GEAR_ITEMS.length));
  assert.equal(gear.GEAR_SLOTS.length, 6, 'stats only on weapon/off-hand/chest/kicks/undies/socks');
  const tiers = new Set(gear.GEAR_ITEMS.map(g => g.rarity));
  assert.deepEqual([...tiers].sort(), ['legendary', 'rare', 'uncommon'], 'statted tiers only; common = plain armor');
  for (const g of gear.GEAR_ITEMS) {
    assert.ok(gear.GEAR_SLOTS.includes(g.slot), g.id);
    assert.ok(BH_BY_ID[g.artId], 'art exists ' + g.id);
  }
  const ids = new Set(gear.GEAR_ITEMS.map(g => g.id));
  assert.equal(ids.size, gear.GEAR_ITEMS.length, 'ids unique');
});
test('gear: slot impact weights budgets (chest > socks)', () => {
  const sum = g => Object.values(g.stats).reduce((a, b) => a + b, 0);
  for (const tier of ['uncommon', 'rare', 'legendary']) {
    const chest = gear.GEAR_ITEMS.find(g => g.slot === 'T' && g.rarity === tier);
    const socks = gear.GEAR_ITEMS.find(g => g.slot === 'S' && g.rarity === tier);
    if (chest && socks) assert.ok(sum(chest) > sum(socks), `${tier}: chest ${sum(chest)} > socks ${sum(socks)}`);
  }
  const legChest = gear.GEAR_ITEMS.find(g => g.slot === 'T' && g.rarity === 'legendary');
  assert.equal(Object.values(legChest.stats).reduce((a, b) => a + b, 0), gear.GEAR_BUDGET.legendary, 'full-weight slot spends the whole budget');
});
test('gear: same art two variants, distinct archetypes, tier bump', () => {
  const byArt = {};
  for (const g of gear.GEAR_ITEMS) (byArt[g.artId] = byArt[g.artId] || []).push(g);
  const arts = Object.values(byArt);
  assert.ok(arts.every(v => v.length === 2), 'two variants per art');
  assert.ok(arts.every(([a, b]) => a.arch !== b.arch), 'distinct archetypes');
});
test('gear: affixes: legendary always, rare sometimes, capstones never', () => {
  const legs = gear.GEAR_ITEMS.filter(g => g.rarity === 'legendary');
  assert.ok(legs.every(g => g.talent), 'every legendary carries a talent');
  const rares = gear.GEAR_ITEMS.filter(g => g.rarity === 'rare');
  const withAffix = rares.filter(g => g.talent).length;
  assert.ok(withAffix > 0 && withAffix < rares.length, `rares mixed: ${withAffix}/${rares.length}`);
  const capstones = new Set(['titan', 'flurry', 'showstopper', 'bonestorm', 'lastlight', 'tempest']);
  assert.ok(gear.GEAR_ITEMS.every(g => !g.talent || !capstones.has(g.talent)), 'no capstone affixes');
  const uncommons = gear.GEAR_ITEMS.filter(g => g.rarity === 'uncommon');
  assert.ok(uncommons.every(g => !g.talent), 'uncommons never affix');
});
test('gear: level gates ascend and gearStats validates', () => {
  assert.ok(gear.GEAR_MIN_LEVEL.uncommon < gear.GEAR_MIN_LEVEL.rare && gear.GEAR_MIN_LEVEL.rare < gear.GEAR_MIN_LEVEL.legendary);
  const g = gear.GEAR_ITEMS.find(x => x.rarity === 'legendary' && x.slot === 'T');
  const lo = { [g.slot]: g.id };
  const zero = { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 };
  assert.deepEqual(gear.gearStats(lo, new Set(), 20), zero, 'unowned = nothing');
  assert.deepEqual(gear.gearStats(lo, new Set([g.id]), g.minLevel - 1), zero, 'underleveled = nothing');
  const on = gear.gearStats(lo, new Set([g.id]), g.minLevel);
  assert.equal(Object.values(on).reduce((a, b) => a + b, 0), gear.GEAR_BUDGET.legendary);
});
test('gear tier sets: 2pc/4pc thresholds, level+ownership gated', () => {
  // gather 4 distinct-slot slab pieces
  const bySlot = {};
  for (const g of gear.GEAR_ITEMS) { if (g.arch === 'slab' && !bySlot[g.slot]) bySlot[g.slot] = g; }
  const four = Object.values(bySlot).slice(0, 4);
  assert.ok(four.length === 4, 'have 4 distinct-slot slab pieces');
  const lo = {}, owned = new Set();
  for (const g of four) { lo[g.slot] = g.id; owned.add(g.id); }
  const hiLvl = Math.max(...four.map(g => g.minLevel));

  // unowned = no set at all
  assert.deepEqual(gearSetInfoSets(gear.gearSetInfo(lo, new Set(), hiLvl)), [], 'unowned = no set');

  // own only 1 piece -> counted but no tier
  const oneOwned = new Set([four[0].id]);
  const one = gear.gearSetInfo(lo, oneOwned, hiLvl);
  assert.deepEqual(one.sets.find(s => s.arch === 'slab')?.tiers || [], [], '1 piece = no bonus');

  // own 2 -> 2pc only
  const twoOwned = new Set([four[0].id, four[1].id]);
  const lvl2 = Math.max(four[0].minLevel, four[1].minLevel);
  const two = gear.gearSetInfo(lo, twoOwned, lvl2);
  assert.deepEqual(two.sets.find(s => s.arch === 'slab').tiers, [2], '2pc active, not 4pc');
  assert.equal(two.talents.length, 0, 'no talent at 2pc');
  assert.ok(two.stats.power > 0 && two.stats.marrow > 0, '2pc grants the stat bundle');

  // own 4 at level -> 2pc + 4pc + talent
  const full = gear.gearSetInfo(lo, owned, hiLvl);
  assert.deepEqual(full.sets.find(s => s.arch === 'slab').tiers, [2, 4], 'both tiers');
  assert.deepEqual(full.talents, ['heavyhands'], '4pc grants archetype talent');
  assert.ok(full.stats.power >= 12, '4pc stacks more power');

  // underleveled pieces do not count toward the set
  const under = gear.gearSetInfo(lo, owned, 1);
  const underSlab = under.sets.find(s => s.arch === 'slab');
  assert.ok(!underSlab || underSlab.pieces < 4, 'underleveled pieces excluded from count');

  // labels are non-empty
  assert.ok(gear.setBonusLabel('slab', 2).length > 0 && gear.setBonusLabel('slab', 4).includes('·'));
});
function gearSetInfoSets(info) { return info.sets.filter(s => s.tiers.length); }
test('den loot: two-piece gamble rolls distinct, deterministic choices; legendary is a rare chance not a floor', async () => {
  const poi = await import('../js/poi.js');
  const wk = '2026-W27';
  const dens = poi.densNear(wk, 49.2827, -123.1207);
  assert.equal(dens.length, 9);
  for (const den of dens) {
    const pair = poi.rollDenLoot(den, wk, new Set());
    assert.ok(pair && pair.length === 2, den.id);
    assert.ok(pair[0].id !== pair[1].id, 'distinct pieces');
    // deterministic (seeded by week + den)
    const again = poi.rollDenLoot(den, wk, new Set());
    assert.deepEqual(pair.map(g => g.id), again.map(g => g.id));
  }
  // pacing: across all dens/weeks, legendary drops are the exception, not the rule
  const RANK = { uncommon: 0, rare: 1, legendary: 2 };
  let n = 0, leg = 0;
  for (let i = 0; i < 300; i++) {
    for (const d of poi.densNear(wk, 40 + i * 0.02, -74 - i * 0.02)) {
      const p = poi.rollDenLoot(d, wk, new Set(), 20); if (!p) continue;
      n++; if (p[0].rarity === 'legendary') leg++;
    }
  }
  assert.ok(leg / n < 0.15, `legendary drop rate ${(leg / n * 100).toFixed(1)}% stays rare (was a guaranteed floor)`);
});
test('den loot never drops gear gated more than 3 levels ahead', async () => {
  const poi = await import('../js/poi.js');
  const wk = '2026-W27';
  const dens = poi.densNear(wk, 49.2827, -123.1207);
  for (const lvl of [1, 3, 6, 10]) {
    const cap = lvl + 3;
    for (const den of dens) {
      const pair = poi.rollDenLoot(den, wk, new Set(), cap);
      if (!pair) continue; // acceptable if nothing fits the cap
      assert.ok(pair.every(g => (g.minLevel || 1) <= cap), `Lv${lvl} den ${den.id}: ${pair.map(g => g.minLevel)}`);
    }
  }
});

test('v73 Bone Dust values scale with rarity, pets worth more than gear', () => {
  for (const kind of ['gear', 'pet']) {
    const v = DUST_VALUE[kind];
    assert.ok(v.common < v.rare && v.rare < v.epic && v.epic < v.legendary, `${kind} dust monotonic`);
  }
  // a pet is worth more dust than gear of the same rarity (pets are rarer to earn)
  for (const r of ['rare', 'epic', 'legendary']) assert.ok(DUST_VALUE.pet[r] > DUST_VALUE.gear[r], `pet ${r} > gear ${r}`);
  assert.equal(gearDustValue({ rarity: 'legendary' }), DUST_VALUE.gear.legendary);
  assert.equal(petDustValue({ rarity: 'epic' }), DUST_VALUE.pet.epic);
  assert.equal(gearDustValue(null), 3); // safe fallback
});
test('v73 Dust Shop loops junk back into pets/crates/consumables', () => {
  assert.ok(DUST_SHOP.length >= 3);
  assert.ok(DUST_SHOP.every(d => d.cost > 0 && d.id && d.label));
  assert.ok(DUST_SHOP.some(d => d.id === 'egg'), 'dust can buy an egg (dupe pets -> new pet)');
});

test('v75 mini-bosses: deterministic per day, roam daily, keyed once/day', async () => {
  const poi = await import('../js/poi.js');
  const [lat, lng] = [49.2827, -123.1207];
  const a1 = poi.minisNear('2026-07-05', lat, lng);
  const a2 = poi.minisNear('2026-07-05', lat, lng);
  assert.deepEqual(a1.map(m => m.id + m.name + m.tier), a2.map(m => m.id + m.name + m.tier), 'same day = same minis');
  // across a week the roster changes (roaming), not frozen like dens
  const days = ['2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08'].map(d => JSON.stringify(poi.minisNear(d, lat, lng).map(m => m.id)));
  assert.ok(new Set(days).size > 1, 'minis roam day to day');
  assert.ok(a1.length >= 1 && a1.every(m => m.mult > 0 && m.aiLevel >= 1 && m.reward && m.reward.xp > 0), 'minis are valid, rewarding foes');
  assert.match(poi.miniKey('2026-07-05', a1[0]), /^mini-2026-07-05-/);
  // tiers escalate mult; all beatable filler (well under a world-boss)
  assert.ok(poi.MINI_TIERS[0].mult < poi.MINI_TIERS[2].mult && poi.MINI_TIERS[2].mult <= 1.0, 'minis stay below world-boss strength');
});

test('v78 kitchen potions: brewable by anyone, each has a mid-fight effect + ingredient cost', () => {
  assert.ok(POTIONS.length >= 3, 'several potions');
  for (const p of POTIONS) {
    assert.ok(p.potion === true, `${p.id} flagged as potion`);
    assert.ok(p.needs && Object.keys(p.needs).length, `${p.id} costs ingredients`);
    assert.ok(p.cookMin > 0, `${p.id} takes time to brew`);
    const e = p.effect || {};
    assert.ok(e.heal || e.dmgPct || e.shield || e.stamina, `${p.id} does something in a fight`);
    assert.ok(Object.keys(p.needs).every(id => INGREDIENTS[id]), `${p.id} uses real ingredients`);
  }
  // potions are their own thing, NOT dishes (no passive buff kind)
  assert.ok(POTIONS.every(p => !p.buff), 'potions are not passive dish buffs');
  assert.ok(POTION_BY_ID['fury-flask'] && POTION_BY_ID['fury-flask'].effect.dmgPct > 0, 'Fury Flask buffs damage');
  assert.equal(potionCount({ 'vital-tonic': 2, 'fury-flask': 1 }), 3);
});
test('v78 cooking quests exist (daily + weekly), driven by the cook ledger', () => {
  assert.ok(DAILY_POOL.find(q => q.id === 'q-cook'), 'daily cook quest');
  assert.ok(WEEKLY_POOL.find(q => q.id === 'w-cook'), 'weekly cook quest');
  const dq = DAILY_POOL.find(q => q.id === 'q-cook');
  assert.deepEqual(dq.progress({ cookedToday: true }), { cur: 1, target: 1 });
  assert.deepEqual(dq.progress({ cookedToday: false }), { cur: 0, target: 1 });
  assert.deepEqual(WEEKLY_POOL.find(q => q.id === 'w-cook').progress({ cooksDone: 3 }), { cur: 3, target: 5 });
});

test('v80 wellness quests: water/bed/sleep daily + weekly self-care, all pure-positive', () => {
  for (const id of ['q-water', 'q-bed', 'q-sleep']) assert.ok(DAILY_POOL.find(q => q.id === id), id + ' exists');
  assert.ok(WEEKLY_POOL.find(q => q.id === 'w-wellness'), 'weekly wellness quest');
  assert.deepEqual(DAILY_POOL.find(q => q.id === 'q-bed').progress({ bedToday: true }), { cur: 1, target: 1 });
  assert.deepEqual(DAILY_POOL.find(q => q.id === 'q-water').progress({ waterToday: false }), { cur: 0, target: 1 });
  assert.deepEqual(DAILY_POOL.find(q => q.id === 'q-sleep').progress({ sleepToday: true }), { cur: 1, target: 1 });
  assert.deepEqual(WEEKLY_POOL.find(q => q.id === 'w-wellness').progress({ wellnessDays: 3 }), { cur: 3, target: 5 });
  // every wellness quest is a reward-only add (never a penalty / no negative target)
  for (const id of ['q-water', 'q-bed', 'q-sleep', 'w-wellness']) { const q = [...DAILY_POOL, ...WEEKLY_POOL].find(x => x.id === id); assert.ok(q.coins > 0, id + ' pays coins'); }
});

/* ---- v126: pet instancing (pure core) ---- */
test('pet instancing: migration is lossless — one lineage-0 instance per owned species, shiny + anchor preserved', () => {
  const owned = ['C1', 'C3', 'C5'];
  const petsRec = { C1: { hatchedAtSteps: 5000, shiny: true }, C3: { hatchedAtSteps: 0 }, C5: { hatchedAtSteps: 12000 } };
  const inst = migrateInstances(owned, petsRec);
  assert.equal(inst.length, 3, 'one instance per owned species');
  assert.deepEqual(inst.map(x => x.sp).sort(), ['C1', 'C3', 'C5']);
  assert.ok(inst.every(x => x.lineage === 0), 'all start at lineage 0');
  const c1 = inst.find(x => x.sp === 'C1');
  assert.equal(c1.shiny, true, 'shiny carried over');
  assert.equal(c1.hatchedAtSteps, 5000, 'hatch anchor carried over');
  assert.equal(inst.find(x => x.sp === 'C3').shiny, false, 'non-shiny stays non-shiny');
});

test('pet instancing: migration of an empty collection yields no instances', () => {
  assert.deepEqual(migrateInstances([], {}), []);
  assert.deepEqual(migrateInstances(undefined, undefined), []);
});

test('pet instancing: bestInstance prefers higher lineage, then shiny', () => {
  const list = [
    { iid: 'a', sp: 'C1', lineage: 0, shiny: true },
    { iid: 'b', sp: 'C1', lineage: 2, shiny: false },
    { iid: 'c', sp: 'C1', lineage: 0, shiny: false },
  ];
  assert.equal(bestInstance(list, 'C1').iid, 'b', 'lineage wins over shiny');
  assert.equal(bestInstance([{ iid: 'x', sp: 'C1', lineage: 0, shiny: false }, { iid: 'y', sp: 'C1', lineage: 0, shiny: true }], 'C1').iid, 'y', 'shiny breaks a lineage tie');
  assert.equal(bestInstance(list, 'C9'), null, 'no instance -> null');
});

test('pet instancing: speciesCount + addInstance track duplicates', () => {
  let list = [{ iid: 'a', sp: 'C1', lineage: 0, shiny: false }];
  assert.equal(speciesCount(list, 'C1'), 1);
  list = addInstance(list, { iid: 'b', sp: 'C1', lineage: 0, shiny: false });
  assert.equal(speciesCount(list, 'C1'), 2, 'a duplicate stacks');
  assert.equal(speciesCount(list, 'C2'), 0);
});

test('pet instancing: salvage removes the WORST copy first (keeps best + shinies)', () => {
  const list = [
    { iid: 'keep-lin', sp: 'C1', lineage: 3, shiny: false },
    { iid: 'keep-shiny', sp: 'C1', lineage: 0, shiny: true },
    { iid: 'worst', sp: 'C1', lineage: 0, shiny: false },
  ];
  const r1 = removeWorstInstance(list, 'C1');
  assert.equal(r1.removed.iid, 'worst', 'lowest-lineage non-shiny goes first');
  assert.equal(speciesCount(r1.instances, 'C1'), 2);
  const r2 = removeWorstInstance(r1.instances, 'C1');
  assert.equal(r2.removed.iid, 'keep-shiny', 'shiny preferred over the lineage-3 copy when both remain');
  assert.equal(removeWorstInstance([], 'C1').removed, null, 'nothing to remove -> null');
});

test('pet leveling: steps credit ONLY the equipped species (benched pets frozen)', () => {
  let bank = { C1: 1000, C2: 500 };
  bank = creditSteps(bank, 'C1', 300); // walk while C1 is equipped
  assert.equal(bank.C1, 1300, 'equipped pet banks the steps');
  assert.equal(bank.C2, 500, 'benched pet is untouched');
  bank = creditSteps(bank, 'C3', 200); // equip a fresh species
  assert.equal(bank.C3, 200, 'a newly-equipped species starts banking from 0');
  assert.equal(bank.C1, 1300, 'the previously-equipped pet is now frozen');
  const before = { C1: 1300 };
  assert.deepEqual(creditSteps(before, 'C1', 0), before, 'zero delta is a no-op');
  assert.deepEqual(creditSteps(before, null, 500), before, 'no equipped pet -> nothing banked');
});

test('breeding: offspring takes the chosen species at max(parent lineage)+1, inherits shiny', () => {
  const a = { iid: 'a', sp: 'C1', lineage: 2, shiny: false };
  const b = { iid: 'b', sp: 'C3', lineage: 4, shiny: true };
  const off = breedOffspring(a, b, 'C1', 'new1');
  assert.equal(off.sp, 'C1', 'offspring is the chosen species');
  assert.equal(off.lineage, 5, 'lineage = higher parent (4) + 1');
  assert.equal(off.shiny, true, 'inherits shiny if either parent was');
  assert.equal(off.iid, 'new1');
  const off2 = breedOffspring({ iid: 'x', sp: 'C4', lineage: 0, shiny: false }, { iid: 'y', sp: 'C4', lineage: 0, shiny: false }, 'C4', 'n2');
  assert.equal(off2.lineage, 1, 'two lineage-0 pets breed a lineage-1');
  assert.equal(off2.shiny, false);
});

test('breeding: cost escalates with the offspring lineage', () => {
  assert.ok(breedCost(2) > breedCost(1), 'higher lineage costs more');
  assert.equal(breedCost(1), 60);
});

test('breeding: removeInstance drops exactly the targeted iid', () => {
  const list = [{ iid: 'a', sp: 'C1' }, { iid: 'b', sp: 'C1' }, { iid: 'c', sp: 'C2' }];
  const r = removeInstance(list, 'b');
  assert.equal(r.removed.iid, 'b');
  assert.deepEqual(r.instances.map(x => x.iid), ['a', 'c']);
  assert.equal(removeInstance(list, 'zzz').removed, null, 'missing iid -> null');
});

test('kitchen: pot pricing — 2nd = 1000g, 3rd = 3000g, capped at 3 (v143)', () => {
  assert.equal(MAX_POTS, 3);
  assert.deepEqual(POT_PRICES, [1000, 3000]);
  assert.equal(nextPotPrice(1), 1000, 'buying the 2nd pot costs 1000');
  assert.equal(nextPotPrice(2), 3000, 'buying the 3rd pot costs 3000');
  assert.equal(nextPotPrice(3), null, 'no 4th pot');
});

test('kitchen: transmute consumes commons greedily from the most-abundant (v144)', () => {
  assert.equal(TRANSMUTE.commons, 6);
  assert.equal(TRANSMUTE.yields, 'ectoplasm');
  // 6 taken from the biggest piles first; rare (ectoplasm) never touched
  const { inv, taken } = transmuteConsume({ marrow: 5, salt: 4, graveroot: 1, ectoplasm: 2 }, 6);
  assert.equal(taken, 6, 'takes the full cost when affordable');
  assert.equal((inv.marrow || 0) + (inv.salt || 0) + (inv.graveroot || 0), 4, '10 commons - 6 = 4 left');
  assert.equal(inv.ectoplasm, 2, 'rare ingredient untouched');
  // short of 6: takes what it can (caller gates on canAfford so this is defensive)
  assert.equal(transmuteConsume({ marrow: 2 }, 6).taken, 2);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
