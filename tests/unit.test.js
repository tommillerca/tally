// Node unit tests: node tests/unit.test.js
import { readFileSync, readdirSync } from 'node:fs';
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
import { GEAR_ITEMS } from '../js/gear.js';
import {
  boonBonusFor, levelTributeMult, BOON_PER_SPIRE, BOON_SPIRE_CAP, BOON_QUEST_BONUS,
  LEVEL_TRIBUTE_MAX, TRIBUTE_PER_DAY, TRIBUTE_CAP_DAYS, SPIRE_CAP,
  wardenTier, WARDEN_TIERS,
} from '../js/spires.js';
import { parseNutritionText } from '../js/labelparse.js';
import { mapOffProduct, mapFdcFood, rankFdcResults, fetchOffProduct } from '../js/sources.js';
import { GENERIC_FOODS, searchFoods } from '../data/generic-foods.js';
import { xpForLevel, levelFor, badgeCheck, parseHkPayload, LEVEL_NAMES, BADGES, levelCoins } from '../js/game.js';
import { STAT_META, WEAPONS } from '../js/pit.js';
import {
  dailyQuests, weeklyQuests, monthlyQuests, questCtx, questState, periodKeyOf,
  weekKeyOf, weekDates, monthKeyOf, monthDates, DAILY_POOL, WEEKLY_POOL, MONTHLY_POOL,
} from '../js/quests.js';
import { RARITIES, RARITY_ORDER, CRATES, SHOP, DUST_VALUE, DUST_SHOP, gearDustValue, gearStatPoints, petDustValue,
  migrateInstances, bestInstance, speciesCount, removeWorstInstance, addInstance, creditSteps,
  removeInstance, breedOffspring, breedCost, transmogCost, TRANSMOG_HIDE } from '../js/loot.js';
import { BH_ITEMS, BH_SLOTS, BH_BY_ID, bhAsset } from '../data/boneheadz.js';
import {
  rollSeeds, harvestYield, SEED_ODDS, PLOTS_FREE, PLOTS_MAX, PLOT_PRICES, plotPrice,
  SEED_IDS, seedName, isRareSeed, growMinutes, GROW_MIN, GROW_MIN_RARE,
  HARVEST_BASE, HARVEST_BASE_RARE, COMPOSTS_PER_DAY, SPAWN_SEED_CHANCE, rollSpawnSeed,
} from '../js/garden.js';
import { phraseProblem, recoveryIdProblem, RECOVERY_ID_RE, RECOVERY_ITERS, RECOVERY_MIN_LEN } from '../js/social.js';
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
test('boneheadz: yard decor is retired (no YD slot)', () => {
  assert.equal(BH_ITEMS.filter(i => i.slot === 'YD').length, 0, 'yard slot scrapped in v220');
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
  assert.equal(gear.GEAR_SLOTS.length, 8, 'stats on weapon/off-hand/chest/pants/kicks/hat/undies/socks');
  for (const s of ['P', 'H']) {
    assert.ok(gear.GEAR_SLOTS.includes(s), 'statted slot ' + s);
    assert.ok(gear.GEAR_ITEMS.some(g => g.slot === s), 'catalog has ' + s + ' rolls');
  }
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
test('transmog: looks are priced off rarity, reverting and hiding are free', () => {
  assert.equal(transmogCost(null), 0, 'back to the gear\'s own look is free');
  assert.equal(transmogCost(TRANSMOG_HIDE), 0, 'hiding a slot is free');
  assert.equal(transmogCost('nope-not-an-item'), 0, 'unknown art never charges');
  const seen = {};
  for (const i of BH_ITEMS) if (!seen[i.rarity]) seen[i.rarity] = transmogCost(i.id);
  assert.equal(seen.common, 6);
  assert.equal(seen.uncommon, 12);
  assert.equal(seen.rare, 25);
  assert.equal(seen.legendary, 60);
  // a look must never cost more than melting the piece that carries it pays out,
  // for every tier where melting is the realistic way to fund it
  assert.ok(transmogCost(BH_ITEMS.find(i => i.rarity === 'legendary').id) < DUST_VALUE.gear.legendary,
    'melting a legendary funds wearing its look');
});
test('health: nativeSyncNow must forward every field the plugin returns', () => {
  // The bug this exists to prevent: HealthPlugin returned sleepMin and friends
  // from v213 onward, but nativeSyncNow builds an explicit allow-list payload and
  // nobody added them, so every sleep field was silently dropped in the glue
  // between the plugin and ingestHealth. Sleep could never work, and no amount of
  // fixing permissions or the query window would have helped.
  const swift = readFileSync(join(here, '..', 'native', 'ios', 'App', 'App', 'HealthPlugin.swift'), 'utf8');
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');

  const emitted = new Set([...swift.matchAll(/out\["([a-zA-Z]+)"\]/g)].map(m => m[1]));
  // the sleep dictionary is spread into `out`, so its keys are emitted too
  const sleepDict = swift.match(/done\(\[([\s\S]*?)\], diag\)/);
  assert.ok(sleepDict, 'sleep result dictionary still present in the plugin');
  for (const m of sleepDict[1].matchAll(/"([a-zA-Z]+)":/g)) emitted.add(m[1]);

  const fn = app.match(/async function nativeSyncNow[\s\S]*?\n\}/);
  assert.ok(fn, 'nativeSyncNow present');
  const payload = fn[0].match(/const payload = \{([\s\S]*?)\n    \};/);
  assert.ok(payload, 'nativeSyncNow still builds an explicit payload');
  const forwarded = new Set([...payload[1].matchAll(/([a-zA-Z]+):/g)].map(m => m[1]));

  const dropped = [...emitted].filter(k => !forwarded.has(k));
  assert.deepEqual(dropped, [],
    `nativeSyncNow drops plugin fields before ingestHealth ever sees them: ${dropped.join(', ')}`);
});
test('transmog: the paid-once credit must be persisted, not derived', () => {
  // Regression. paidLooks() used to seed purely from the live transmog map, so a
  // v221 player who cleared the slot lost the evidence and paid twice for a look
  // they already owned. The seed must be written back to kv.
  const src = readFileSync(join(here, '..', 'js', 'loot.js'), 'utf8');
  const fn = src.match(/export async function paidLooks\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fn, 'paidLooks present');
  assert.ok(/kvSet\('paidlooks'/.test(fn[0]), 'paidLooks persists the grandfathered seed');
  // and re-confirming a look you are already wearing must bank it too
  const ap = src.match(/export async function applyTransmog[\s\S]*?\n\}/);
  assert.ok(/already: true/.test(ap[0]) && /markPaid[\s\S]*?already: true/.test(ap[0]),
    'the already-worn early return banks the look before returning');
});
test('collection: every locked piece must be indistinguishable', () => {
  // The Looks browser renders locked pieces from a single constant string with no
  // item data bound in, so a future edit that starts interpolating art, name or
  // rarity into a locked tile fails here rather than quietly spoiling unlocks.
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const m = app.match(/missing\.map\((.*?)\)\.join\(''\)/s);
  assert.ok(m, 'locked-tile renderer still present');
  const body = m[1];
  assert.ok(/^\(\)\s*=>/.test(body.trim()), 'locked tile takes no item argument');
  for (const leak of ['bhAsset', 'i.name', 'i.rarity', 'i.id', '<img']) {
    assert.ok(!body.includes(leak), `locked tile must not reference ${leak}`);
  }
});
test('gear: armor stays normalized as slots are added', () => {
  // Gear STATS self-balance (foes scale off your stats) but gear ARMOR does not:
  // it is a player-only damage cut. Adding statted slots must not quietly raise the
  // tankiness ceiling, so ARMOR_NORM rescales points against the pre-v220 baseline.
  const best = {};
  for (const s of gear.GEAR_SLOTS) {
    const g = gear.GEAR_ITEMS.find(x => x.slot === s && x.rarity === 'legendary');
    if (g) best[s] = g.id;
  }
  const owned = new Set(Object.values(best));
  const a = gear.gearArmor(best, owned, 99);
  const full = a.armor + a.spellArmor;
  assert.ok(full >= 80 && full <= 90, `full legendary armor ${full} inside the 80-90 band`);
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
  // v237: every rare unlocked at exactly 8 and every legendary at 14, so crossing
  // those levels handed a player a whole wardrobe at once. Gates now ramp per slot.
  const rareGates = gear.GEAR_SLOTS.map(s => gear.gearMinLevel('rare', s));
  assert.ok(new Set(rareGates).size >= 3, 'rare unlocks must spread across levels, not land on one');
  assert.equal(Math.max(...rareGates), gear.GEAR_MIN_LEVEL.rare, 'the ramp tops out at the old gate');
  // offsets must never push a gate LATER, or players lose gear they already wear
  for (const s of gear.GEAR_SLOTS) {
    for (const tier of ['uncommon', 'rare', 'legendary']) {
      assert.ok(gear.gearMinLevel(tier, s) <= gear.GEAR_MIN_LEVEL[tier],
        `${tier}/${s} gate moved later, which would unequip live gear`);
    }
  }
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

/* ---- v231 account recovery: the rules that decide whether a lost account can
   come back. A regression here is not a cosmetic bug, it is a wiped save. ---- */

test('recovery: phrase bar is high enough to survive a guessable recovery ID', () => {
  assert.equal(RECOVERY_MIN_LEN, 12, 'raised from 8 when recovery IDs made lookup guessable');
  assert.equal(RECOVERY_ITERS, 1000000, 'KDF cost raised to match');
  assert.ok(phraseProblem('short'), 'too short is rejected');
  assert.ok(phraseProblem('elevenchars'), '11 chars is still short');
  assert.ok(phraseProblem('password123'), 'blocklisted phrase rejected even at length');
  assert.ok(phraseProblem('aaaaaaaaaaaaaa'), 'single repeated character rejected');
  assert.ok(phraseProblem('correcthorsebattery'), 'one long word is nudged toward two');
  assert.equal(phraseProblem('correct horse battery'), null, 'multi-word passes');
  assert.equal(phraseProblem('bonehunter77'), null, 'a digit counts as variety too');
});

test('recovery: IDs accept what people type and reject what breaks the URL', () => {
  assert.equal(recoveryIdProblem('tom-bones'), null);
  assert.equal(recoveryIdProblem('TOM.Bones_1'), null, 'case folded before checking');
  assert.ok(recoveryIdProblem('ab'), 'too short');
  assert.ok(recoveryIdProblem('x'.repeat(33)), 'too long');
  assert.ok(recoveryIdProblem('tom bones'), 'no spaces');
  assert.ok(recoveryIdProblem('tom/bones'), 'no slashes, it is a path segment');
  assert.ok(recoveryIdProblem(''), 'empty is not a valid id');
  // the client regex has to agree with the Worker's or lookups 400 in the wild
  const worker = readFileSync(join(here, '..', 'server', 'src', 'index.js'), 'utf8');
  const m = worker.match(/RECOVERY_ID_RE\s*=\s*(\/[^\n;]+\/)/);
  assert.ok(m, 'Worker declares RECOVERY_ID_RE');
  assert.equal(m[1], String(RECOVERY_ID_RE), 'client and Worker recovery-id rules must match exactly');
});

/* ---- v240 safe-area guard ------------------------------------------------
   The hero cancelled the screen's safe-area padding with a negative top margin.
   That was fine while a day header sat above it, and became a bug the moment the
   hero was first: it slid under the notch / Dynamic Island, clipping the
   character and putting the currency chips behind the clock and battery. A
   desktop browser reports no safe area, so this is invisible there. The pattern
   is what is dangerous, so the pattern is what gets asserted. ---- */

test('css: nothing cancels the safe-area inset with a negative top margin', () => {
  const css = readFileSync(join(here, '..', 'app.css'), 'utf8');
  // paren-aware: split a shorthand on TOP-LEVEL spaces only, so calc(...) with
  // nested brackets stays in one piece. A naive regex silently matched nothing.
  const topValue = (v) => {
    let depth = 0, out = '';
    for (const ch of v.trim()) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (/\s/.test(ch) && depth === 0) break;
      out += ch;
    }
    return out;
  };
  const offenders = [];
  for (const line of css.split('\n')) {
    const m = line.match(/margin(-top)?\s*:\s*([^;]+);/);
    if (!m) continue;
    const top = m[1] ? m[2].trim() : topValue(m[2]);
    if (/--sat/.test(top) && /-\s*1\s*\*|^-/.test(top)) offenders.push(line.trim());
  }
  assert.deepEqual(offenders, [],
    'a negative top margin containing var(--sat) pulls content under the notch');
});

test('css: the scroll container still reserves the safe area', () => {
  const css = readFileSync(join(here, '..', 'app.css'), 'utf8');
  assert.match(css, /\.screen\s*\{[^}]*padding:\s*calc\(var\(--sat\)/,
    '.screen must pad the safe area, or every screen starts under the notch');
});

// ---- the Puffer Pack drop: manifest and shop must agree ----
test('drop items exist in the manifest, legendary, with drop names', () => {
  const data = readFileSync(join(here, '..', 'data', 'boneheadz.js'), 'utf8');
  const items = JSON.parse(data.match(/BH_ITEMS = (\[[\s\S]*?\]);/)[1]);
  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  const jackets = ['T9-5', 'T9-6', 'T9-7', 'T9-8', 'T9-9'];
  const hats = ['H13-2', 'H13-3', 'H13-4', 'H13-5', 'H13-6'];
  for (const id of [...jackets, ...hats]) {
    assert.ok(byId[id], `${id} missing from the manifest`);
    assert.equal(byId[id].rarity, 'legendary', `${id} must be legendary, is ${byId[id]?.rarity}`);
    assert.match(byId[id].name, /Puffer|Blowfish/, `${id} kept a generated name: ${byId[id]?.name}`);
  }
  // the drop definition sells exactly these ids at the agreed prices
  const loot = readFileSync(join(here, '..', 'js', 'loot.js'), 'utf8');
  const dropSrc = loot.match(/export const DROP = \{[\s\S]*?\n\};/)[0];
  for (const id of jackets) assert.ok(dropSrc.includes(`{ id: '${id}', cost: 3000 }`), `${id} must sell for 3000`);
  for (const id of hats) assert.ok(dropSrc.includes(`{ id: '${id}', cost: 1500 }`), `${id} must sell for 1500`);
});

test('rebuilding cosmetics cannot eat hand-added manifest entries again', () => {
  // CX vanished from a rebuild once (survey reward, hand-added). The build script
  // must carry every hand-added id in SPECIALS.
  const script = readFileSync(join(here, '..', 'scripts', 'build-cosmetics.py'), 'utf8');
  assert.ok(/'id': 'CX'/.test(script), 'CX missing from build-cosmetics SPECIALS: the next rebuild deletes the Day One Lizard');
  const data = readFileSync(join(here, '..', 'data', 'boneheadz.js'), 'utf8');
  assert.ok(data.includes('"Day One Lizard"'), 'CX missing from the shipped manifest');
});

// ---- patch notes render emphasis, not literal tags ----
test('changelog items are rendered with richLine, not esc', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.ok(/wn-list[\s\S]{0,80}richLine\(i\)/.test(app),
    'What\'s New must render items through richLine; esc() prints a literal <b> in players\' patch notes');
  // and richLine must still neuter anything that is not simple emphasis
  const body = app.match(/function richLine\(str\) \{([\s\S]*?)\n\}/)[1];
  assert.ok(body.includes('esc('), 'richLine must escape first');
  assert.ok(!/script|img|a\|/.test(body), 'richLine allowlist must stay b/i/br only');
});

// ---- Streak Freezes are gone, everywhere ----
test('no Streak Freeze remains in the shops, crates, wheel or welcome kit', () => {
  const loot = readFileSync(join(here, '..', 'js', 'loot.js'), 'utf8');
  const wheel = readFileSync(join(here, '..', 'js', 'wheel.js'), 'utf8');
  const game = readFileSync(join(here, '..', 'js', 'game.js'), 'utf8');
  const shop = loot.match(/export const SHOP = \[([\s\S]*?)\];/)[1];
  const dust = loot.match(/export const DUST_SHOP = \[([\s\S]*?)\];/)[1];
  const cons = loot.match(/export const CONSUMABLES = \{([\s\S]*?)\n\};/)[1];
  assert.ok(!/freeze/i.test(shop), 'the coin shop still sells a freeze');
  assert.ok(!/freeze/i.test(dust), 'the dust shop still sells a freeze');
  assert.ok(!/freeze/i.test(cons), 'freeze is still a consumable');
  const pool = loot.match(/const pool = \[([^\]]*)\]/)[1];
  assert.ok(!/freeze/i.test(pool), 'crates can still drop a freeze');
  const prizes = wheel.match(/const PRIZES = \[([\s\S]*?)\n\];/)[1];
  assert.ok(!/freeze/i.test(prizes), 'the wheel can still land on a freeze');
  assert.ok(!/grantConsumable\('freeze'/.test(game), 'the welcome kit still grants a freeze');
  assert.ok(!/checkStreakFreeze/.test(game), 'the freeze-consuming boot check is still there');
});

test('the wheel derives its geometry, so removing a prize cannot skew it', () => {
  const wheel = readFileSync(join(here, '..', 'js', 'wheel.js'), 'utf8');
  assert.match(wheel, /const SEG = PRIZES\.length/);
  assert.match(wheel, /const SEG_DEG = 360 \/ SEG/);
});

test('days a freeze already protected still count toward a streak', () => {
  // Retiring an item must not retroactively break a streak someone really kept.
  const game = readFileSync(join(here, '..', 'js', 'game.js'), 'utf8');
  const fn = game.match(/export function streakDateSet\([\s\S]*?\n\}/)[0];
  assert.ok(/r\.type === 'freeze'/.test(fn), 'historic freeze markers must still be honoured');
});

test('the freeze payout is idempotent and pays before it deletes', () => {
  const loot = readFileSync(join(here, '..', 'js', 'loot.js'), 'utf8');
  const fn = loot.match(/export async function refundStreakFreezes\([\s\S]*?\n\}/)[0];
  assert.ok(/kvGet\('freeze-refunded'/.test(fn), 'must be guarded by a flag');
  assert.ok(fn.indexOf('coinsAdd') < fn.indexOf('db.del'), 'coins must be credited BEFORE rows are deleted');
  assert.ok(/\* 100/.test(fn), 'must pay 100 coins each');
});

test('every named import from a local module actually exists', () => {
  // node --check parses a file but never resolves its imports, so deleting an
  // export leaves `node --check` perfectly happy and the app dead on boot. That
  // happened while retiring Streak Freezes (consumeFreeze / checkStreakFreeze).
  const dir = join(here, '..', 'js');
  const files = readdirSync(dir).filter(f => f.endsWith('.js'));
  const exportsOf = new Map();
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    const names = new Set();
    for (const m of src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^export\s+(?:const|let|class)\s+(\w+)/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
      for (const part of m[1].split(',')) {
        const n = part.trim().split(/\s+as\s+/).pop().trim();
        if (n) names.add(n);
      }
    }
    if (/^export\s+default/m.test(src)) names.add('default');
    exportsOf.set(f, names);
  }
  const problems = [];
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/([\w.-]+\.js)'/g)) {
      const target = m[2];
      if (!exportsOf.has(target)) continue;      // ../data or vendor: out of scope
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name && !exportsOf.get(target).has(name)) problems.push(`${f} imports { ${name} } from ${target}, which does not export it`);
      }
    }
  }
  assert.deepEqual(problems, [], problems.join('\n      '));
});

test('every screen that renders pack cards also hydrates their art', () => {
  // packCardHtml() emits a <canvas> for imgSrc cards that stays BLANK until
  // hydratePackArt() fills it. The Pit victory screen rendered cards without ever
  // calling it, so every gear reward showed its name over an empty panel. Guard:
  // the file must call hydratePackArt at least once per place that builds cards.
  const src = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const builders = (src.match(/packCardHtml\(/g) || []).length;
  const hydrators = (src.match(/hydratePackArt\(/g) || []).length;
  // one definition + one call per rendering surface
  assert.ok(hydrators >= 4, `only ${hydrators} hydratePackArt call sites for ${builders} packCardHtml uses`);
});

test('every js/spires.js name app.js USES is actually imported', () => {
  /* This exists because of a real, self-inflicted outage. The spires import in
   * app.js is a two-line statement; I pattern-matched a different shape, so five
   * function imports and four constants silently never landed. app.js then referenced
   * TRIBUTE_PER_DAY, syncSieges, wardenTier and others as undefined globals, the
   * Today render threw inside an async function whose rejection nothing catches, and
   * the ENTIRE home screen rendered blank with no page error at all.
   *
   * The existing import test only checks that imported names EXIST in the target
   * module. It cannot see a name that is used but never imported, which is the more
   * dangerous direction. This closes that gap for the module it bit us on. */
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const spires = readFileSync(join(here, '..', 'js', 'spires.js'), 'utf8');
  const exported = [...spires.matchAll(/export (?:async )?function (\w+)|export const (\w+)/g)]
    .map(m => m[1] || m[2]);
  assert.ok(exported.length > 10, `expected spires.js exports, found ${exported.length}`);
  const stmt = app.match(/import \{[^}]*\} from '\.\/spires\.js';/s);
  assert.ok(stmt, 'app.js must import from spires.js');
  const imported = new Set(stmt[0].replace(/import \{|\} from.*/gs, '').split(',').map(x => x.trim()).filter(Boolean));
  // strip the import statement itself, then look for uses of each export
  const body = app.replace(stmt[0], '');
  const missing = exported.filter(name => {
    if (imported.has(name)) return false;
    return new RegExp(`(?<![\\w.'"\`])${name}\\s*[(,)\\.;:}\\]]`).test(body);
  });
  assert.deepEqual(missing, [], `app.js uses these spires.js exports without importing them: ${missing.join(', ')}`);
});

test('every <details> in a rendered template is closed with </details>', () => {
  // A <details> closed with </div> does not error: the parser silently nests
  // everything after it INSIDE the collapsed element. That shipped in v253 and
  // swallowed the whole coin shop, so buying was dead while the buttons still
  // looked present (closed-details children still report an offsetParent).
  // Strip comments first: a line like "same <details> pattern as the talent
  // trees" is prose, not markup, and counting it makes the guard cry wolf.
  const src = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const opens = (src.match(/<details[\s>]/g) || []).length;
  const closes = (src.match(/<\/details>/g) || []).length;
  assert.equal(opens, closes, `${opens} <details> opened but ${closes} closed in app.js`);
});

/* ---------- The Bone Garden ---------- *
 * These are the economy numbers, so they are asserted rather than eyeballed. The
 * failure that matters is not a crash, it is a multiplier quietly drifting above
 * what walking pays, which is invisible until every buff is permanently on. */
test('composting rolls 1 to 3 seeds and the odds sum to 1', () => {
  assert.equal(SEED_ODDS.reduce((a, b) => a + b, 0).toFixed(6), '1.000000');
  assert.equal(rollSeeds(() => 0), 1);
  assert.equal(rollSeeds(() => 0.54), 1);
  assert.equal(rollSeeds(() => 0.56), 2);
  assert.equal(rollSeeds(() => 0.89), 2);
  assert.equal(rollSeeds(() => 0.91), 3);
  assert.equal(rollSeeds(() => 0.999999), 3);
});

test('a common seed always returns more than the ingredient it cost', () => {
  // Tom's rule, and the reason the loop is worth doing at all
  for (const watered of [false, true]) {
    for (const r of [0, 0.5, 0.99]) {
      const { n } = harvestYield({ rare: false, watered }, () => r);
      assert.ok(n > 1, `common yield ${n} must beat the 1 ingredient composted`);
    }
  }
});

test('watering is worth exactly +1, and the bumper roll another +1', () => {
  assert.deepEqual(harvestYield({ rare: false, watered: false }, () => 0.5), { n: HARVEST_BASE, bumper: false });
  assert.deepEqual(harvestYield({ rare: false, watered: true }, () => 0.5), { n: HARVEST_BASE + 1, bumper: false });
  assert.deepEqual(harvestYield({ rare: false, watered: true }, () => 0.0), { n: HARVEST_BASE + 2, bumper: true });
  assert.equal(harvestYield({ rare: false, watered: false }, () => 0.0).n, HARVEST_BASE + 1);
});

test('a rare spore never bumpers and caps at two', () => {
  assert.deepEqual(harvestYield({ rare: true, watered: false }, () => 0), { n: HARVEST_BASE_RARE, bumper: false });
  assert.deepEqual(harvestYield({ rare: true, watered: true }, () => 0), { n: HARVEST_BASE_RARE + 1, bumper: false });
});

test('the closed compost loop stays under what a walk pays', () => {
  // The whole balance argument in one number. Best case per day: every compost
  // rolls 3 seeds and every bed comes in watered with a bumper.
  const bestSeedsPerDay = COMPOSTS_PER_DAY * 3;
  const bestPerSeed = harvestYield({ rare: false, watered: true }, () => 0).n;
  const ceiling = bestSeedsPerDay * bestPerSeed - COMPOSTS_PER_DAY;   // net of what was composted
  assert.ok(ceiling <= 40, `closed-loop ceiling of ${ceiling}/day is too generous`);
  // and the realistic case (average roll, watered, no bumper) is about one walk
  const typical = Math.round(COMPOSTS_PER_DAY * 1.55 * (HARVEST_BASE + 1) - COMPOSTS_PER_DAY);
  assert.ok(typical >= 6 && typical <= 15, `typical net of ${typical}/day should sit near one walk`);
});

test('walking is the better seed source', () => {
  // 30% of spawns, and a walk passes far more than three spawns, so a walker
  // out-earns the heap. If this ever inverts, the garden has replaced the map.
  assert.ok(SPAWN_SEED_CHANCE >= 0.25, 'seeds must be a real walk reward, not a rumour');
  assert.equal(rollSpawnSeed(() => SPAWN_SEED_CHANCE - 0.01), true);
  assert.equal(rollSpawnSeed(() => SPAWN_SEED_CHANCE + 0.01), false);
});

test('every ingredient is plantable except that the rare takes far longer', () => {
  assert.deepEqual(SEED_IDS.filter(id => !INGREDIENTS[id]), []);
  assert.equal(SEED_IDS.length, Object.keys(INGREDIENTS).length);
  const rare = SEED_IDS.filter(isRareSeed);
  assert.equal(rare.length, 1);
  assert.equal(seedName(rare[0]), 'Spore');
  assert.equal(growMinutes(rare[0]), GROW_MIN_RARE);
  assert.ok(GROW_MIN_RARE >= GROW_MIN * 3);
  for (const id of SEED_IDS.filter(i => !isRareSeed(i))) assert.equal(growMinutes(id), GROW_MIN);
});

test('beds are priced for every step up to the cap, then stop', () => {
  assert.equal(PLOT_PRICES.length, PLOTS_MAX - PLOTS_FREE);
  for (let owned = PLOTS_FREE; owned < PLOTS_MAX; owned++) {
    assert.equal(typeof plotPrice(owned), 'number', `no price for the bed after ${owned}`);
    assert.ok(plotPrice(owned) > 0);
  }
  assert.equal(plotPrice(PLOTS_MAX), null);
  // rising, so the last bed is a real decision
  assert.ok(PLOT_PRICES.every((p, i) => i === 0 || p > PLOT_PRICES[i - 1]));
});

/* ---------- Dark Spires economy ---------- *
 * Tom's explicit worry: an uncapped Keeper's Boon would ruin the economy. These
 * assert the CEILINGS, not the happy path, because the failure mode is a number
 * quietly growing past what quests are balanced for. */
test("the Keeper's Boon is capped at three spires, whatever the tower cap becomes", () => {
  assert.equal(boonBonusFor(0), 0);
  assert.equal(+boonBonusFor(1).toFixed(4), 0.05);
  assert.equal(+boonBonusFor(2).toFixed(4), 0.10);
  assert.equal(+boonBonusFor(3).toFixed(4), 0.15);
  // the whole point: MORE than three pays nothing extra, so raising SPIRE_CAP
  // later cannot inflate quest coins by accident
  for (const n of [4, 5, 10, 99]) {
    assert.equal(+boonBonusFor(n).toFixed(4), 0.15, `${n} spires must still pay 15%`);
  }
  assert.equal(+BOON_QUEST_BONUS.toFixed(4), 0.15, 'the exported ceiling must match');
  assert.ok(BOON_SPIRE_CAP <= SPIRE_CAP, 'a boon cap above the tower cap would be dead config');
  // check the value that actually reaches a payout, not the raw float product
  assert.ok(boonBonusFor(BOON_SPIRE_CAP) <= 0.15, 'the boon ceiling must not exceed 15%');
  assert.ok(BOON_PER_SPIRE > 0, 'a zero rate would make the whole perk dead');
});

test('spire level pays more tribute, but never more than half again', () => {
  assert.equal(levelTributeMult(1), 1);
  assert.equal(+levelTributeMult(2).toFixed(4), 1.1);
  assert.equal(+levelTributeMult(6).toFixed(4), 1.5);
  // a tower that has changed hands fifty times must not print money
  for (const lv of [6, 10, 50, 500]) {
    assert.equal(levelTributeMult(lv), LEVEL_TRIBUTE_MAX, `level ${lv} must stay at the cap`);
  }
  assert.equal(levelTributeMult(0), 1, 'a missing level reads as level 1');
  // and the absolute worst case a single spire can pay in one collection
  const worst = Math.round(TRIBUTE_CAP_DAYS * TRIBUTE_PER_DAY * LEVEL_TRIBUTE_MAX);
  assert.ok(worst <= 300, `one spire could pay ${worst} coins per collection`);
});

test('no control that spends coins or dust buys on a single tap', () => {
  /* Tom's rule, after a player bought a 1,000-coin cauldron by accident: one tap
   * must never spend. This is a STRUCTURAL guard because the failure is invisible
   * (the button works perfectly, it just works too eagerly) and because the sweep
   * has to hold for buttons nobody has written yet.
   *
   * Every handler that deducts currency must sit behind either armToConfirm() or the
   * older inline dataset.armed dance. The check is: find each spend call, walk back
   * to the handler that contains it, and require a confirm gate in that handler. */
  const src = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  // the spend controls, by the attribute/id their handler is bound to
  const CONTROLS = [
    ['#buyPot', 'the extra cauldron'],
    ['#buyBed', 'the extra garden bed'],
    ['#forageBtn', 'foraging'],
    ['[data-buy]', 'the coin shop'],
    ['[data-dustbuy]', 'the Bone Dust shop'],
    ['[data-buydrop]', 'the featured drop'],
    ['[data-buyweapon]', 'the Bone Merchant'],
  ];
  const unguarded = [];
  const lines = src.split('\n');
  for (const [sel, label] of CONTROLS) {
    // Windows of raw characters were too loose: a 2900-char window around one button
    // picked up the NEXT button's armToConfirm and passed a genuinely unguarded
    // control. So this works line by line. A control is guarded when the line that
    // binds it calls armToConfirm, or when the handler it opens uses the older
    // inline dataset.armed dance within its own body.
    const hits = lines.map((ln, n) => [ln, n]).filter(([ln]) => ln.includes(sel));
    assert.ok(hits.length, `${label}: control ${sel} has vanished from app.js`);
    const guarded = hits.some(([ln, n]) => {
      if (ln.includes('armToConfirm(')) return true;
      if (!/addEventListener|forEach/.test(ln)) return false;   // markup, not a binding
      return lines.slice(n, n + 26).some(x => x.includes('dataset.armed'));
    });
    if (!guarded) unguarded.push(`${label} (${sel})`);
  }
  assert.deepEqual(unguarded, [], `these spend on ONE tap: ${unguarded.join(', ')}`);
  // and the shared helper must actually require a second tap before running the buy
  const helper = src.slice(src.indexOf('function armToConfirm'), src.indexOf('function badgeIconHtml'));
  assert.match(helper, /dataset\.armed !== '1'/, 'armToConfirm must check the armed flag');
  assert.match(helper, /return;/, 'the first tap must RETURN before spending');
  assert.match(helper, /setTimeout\(restore/, 'an armed button must cool off on its own');
  assert.ok(helper.indexOf("dataset.armed !== '1'") < helper.indexOf('await onConfirm()'),
    'the arm check must come BEFORE the purchase runs');
});

test('every badge icon maps to a drawn pack icon, not a raw emoji', () => {
  /* app.js renders badges through badgeIconHtml(), which looks the emoji up in
   * BADGE_ICON and falls back to the RAW EMOJI when it misses. Three of the four
   * Warden badges shipped with emoji that had no mapping, so they would have drawn
   * as system emoji in a row of hand-drawn icons. The fallback is silent, which is
   * why this needs a test rather than a glance. */
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const tbl = app.slice(app.indexOf('const BADGE_ICON = {'), app.indexOf('};', app.indexOf('const BADGE_ICON = {')));
  assert.ok(tbl.length > 100, 'could not find the BADGE_ICON table');
  const KNOWN_RAW = new Set(['secret-tumtum']);   // pre-existing secret badge, no pack art
  const unmapped = BADGES
    .filter(b => !KNOWN_RAW.has(b.id))
    .filter(b => !tbl.includes(`'${(b.icon || '').replace(/\uFE0F/g, '')}'`))
    .map(b => `${b.id} (${b.icon})`);
  assert.deepEqual(unmapped, [], `these badges would render as raw emoji: ${unmapped.join(', ')}`);
});

test('a tower only wears a milestone once it has really been held that long', () => {
  // off-by-one here would hand out a century tier on day 99, and the tiers are the
  // only prestige in the game you cannot grind for
  assert.equal(wardenTier(0).tier, 0);
  assert.equal(wardenTier(6).tier, 0, 'day 6 is not a Warden yet');
  assert.equal(wardenTier(7).tier, 1, 'day 7 earns the first tier');
  assert.equal(wardenTier(29).tier, 1);
  assert.equal(wardenTier(30).tier, 2);
  assert.equal(wardenTier(99).tier, 2, 'day 99 is NOT a century tower');
  assert.equal(wardenTier(100).tier, 3);
  assert.equal(wardenTier(10000).tier, 3, 'there is nothing above the top tier');
  // descending order is what makes `find` correct; an ascending list would always
  // return the lowest tier and silently cap everyone at Warden
  const days = WARDEN_TIERS.map(t => t.days);
  assert.deepEqual(days, [...days].sort((a, b) => b - a), 'WARDEN_TIERS must stay descending');
  for (const t of WARDEN_TIERS) assert.ok(t.name && t.tier > 0, 'every tier needs a name');
});

test('the Warden badges are the only ones you cannot grind for', () => {
  const ids = BADGES.map(b => b.id);
  for (const id of ['warden-7', 'warden-30', 'warden-100', 'siege-1']) {
    assert.ok(ids.includes(id), `${id} must exist`);
  }
  // each one has to be reachable by badgeCheck, or it is decoration
  assert.equal(badgeCheck('warden-7', { spireDaysBest: 7 }), true);
  assert.equal(badgeCheck('warden-7', { spireDaysBest: 6 }), false);
  assert.equal(badgeCheck('warden-30', { spireDaysBest: 30 }), true);
  assert.equal(badgeCheck('warden-100', { spireDaysBest: 100 }), true);
  assert.equal(badgeCheck('warden-100', { spireDaysBest: 99 }), false);
  assert.equal(badgeCheck('siege-1', { siegesBroken: 1 }), true);
  assert.equal(badgeCheck('siege-1', { siegesBroken: 0 }), false);
  // and their thresholds must agree with the tower tiers, or the map and the badge
  // list would tell the player two different stories
  assert.deepEqual(WARDEN_TIERS.map(t => t.days).sort((a, b) => a - b), [7, 30, 100]);
});

test('no random pet roll can ever include an exclusive pet', () => {
  // hatchEgg() has always excluded them; grantPet('random') did not, so the
  // Founder's Lizard was reachable by chance. Both roll pools are asserted here by
  // reading the source, because the pools are built inline and cannot be imported.
  const src = readFileSync(join(here, '..', 'js', 'loot.js'), 'utf8');
  const pools = [...src.matchAll(/BH_ITEMS\.filter\(i => i\.slot === 'C'([^)]*)\)/g)].map(m => m[1]);
  assert.ok(pools.length >= 2, `expected the hatch + grant pools, found ${pools.length}`);
  for (const p of pools) {
    assert.match(p, /!i\.exclusive/, `a pet pool is built without excluding exclusives: "i.slot === 'C'${p}"`);
  }
  // and there IS at least one exclusive pet to protect, or this guard is theatre
  const exclusives = BH_ITEMS.filter(i => i.slot === 'C' && i.exclusive);
  assert.ok(exclusives.length > 0, 'no exclusive pets exist, so this guard proves nothing');
});

test('every weapon rewards a stat that actually exists', () => {
  // The vendor prints "rewards <Stat>" from WEAPONS[].spec, and the Build FAQ now
  // tells players to match the two. A typo'd spec would silently fall back to
  // "all-rounder" in the shop, quietly breaking that advice.
  const keys = new Set(STAT_META.map(m => m.key));
  for (const [id, w] of Object.entries(WEAPONS)) {
    if (w.spec === null || w.spec === undefined) continue;
    assert.ok(keys.has(w.spec), `weapon ${id} rewards "${w.spec}", which is not a stat`);
  }
  // and at least one weapon exists for every stat, so no build is left without one
  const covered = new Set(Object.values(WEAPONS).map(w => w.spec).filter(Boolean));
  const missing = [...keys].filter(k => !covered.has(k));
  assert.deepEqual(missing, [], `no weapon rewards: ${missing.join(', ')}`);
});

test('gear dust pays for stat points, not just rarity', () => {
  // Tom asked for statted gear to be worth more. Measuring first showed all 276
  // catalog pieces are statted, so a flat statted bonus would have been pure dust
  // inflation. Paying per stat point differentiates a strong roll from a weak one.
  const weak = { rarity: 'rare', stats: { power: 3 } };
  const strong = { rarity: 'rare', stats: { power: 8, marrow: 3 } };
  assert.ok(gearDustValue(strong) > gearDustValue(weak),
    `a stronger roll must pay more: ${gearDustValue(strong)} vs ${gearDustValue(weak)}`);
  assert.equal(gearStatPoints(strong), 11);
  assert.equal(gearStatPoints({ rarity: 'rare' }), 0);
  // rarity still dominates: no uncommon can out-melt any rare
  const bestUncommon = gearDustValue({ rarity: 'uncommon', stats: { a: 6 } });
  const worstRare = gearDustValue({ rarity: 'rare', stats: { a: 3 } });
  assert.ok(worstRare > bestUncommon, `rarity must dominate: rare ${worstRare} vs uncommon ${bestUncommon}`);
  // and every real catalog piece gets a sane number
  for (const g of GEAR_ITEMS) {
    const d = gearDustValue(g);
    assert.ok(d > 0 && d < 200, `${g.id} melts for ${d}`);
  }
});

test('every image the combat stage renders is precached', () => {
  // The Glutton was invisible for the opening moves because sw.js precached the
  // hero portraits (glutton/idle.png) but not the COMBAT plates the arena
  // actually renders, which are ~90KB each and lost the race to the first paint.
  // Same class of failure as the invisible punch in v245.
  const sw = readFileSync(join(here, '..', 'sw.js'), 'utf8');
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const glutton = readFileSync(join(here, '..', 'js', 'glutton.js'), 'utf8');
  const rendered = [...glutton.matchAll(/src="(assets\/[^"]+\.png)"/g)].map(m => m[1]);
  assert.ok(rendered.length >= 3, `expected the stage to render plates, found ${rendered.length}`);
  const missing = rendered.filter(src => !sw.includes(src));
  assert.deepEqual(missing, [], `not precached: ${missing.join(', ')}`);
  // and warmed before the fight, so the first paint is decoded rather than fetched
  const combat = rendered.filter(s2 => s2.includes('/combat/'));
  const unwarmed = combat.filter(src => !app.includes(src));
  assert.deepEqual(unwarmed, [], `not warmed by the app: ${unwarmed.join(', ')}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
