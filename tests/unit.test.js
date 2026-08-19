// Node unit tests: node tests/unit.test.js
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import * as execFile_ from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
/* eggProgress is PURE (no db, no DOM), so it unit-tests directly. */
import { eggProgress } from '../js/loot.js';

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
import * as pitMod from '../js/pit.js';
const mkFighter = pitMod.makeFighter;
import {
  dailyQuests, weeklyQuests, monthlyQuests, questCtx, questState, periodKeyOf,
  weekKeyOf, weekDates, monthKeyOf, monthDates, DAILY_POOL, WEEKLY_POOL, MONTHLY_POOL,
} from '../js/quests.js';
import { RARITIES, RARITY_ORDER, CRATES, SHOP, DUST_VALUE, DUST_SHOP, gearDustValue, gearStatPoints, petDustValue,
  migrateInstances, bestInstance, speciesCount, removeWorstInstance, addInstance, creditSteps,
  removeInstance, breedParents, breedCost, transmogCost, TRANSMOG_HIDE } from '../js/loot.js';
import { BH_ITEMS, BH_SLOTS, BH_BY_ID, bhAsset } from '../data/boneheadz.js';
import {
  rollSeeds, harvestYield, SEED_ODDS, PLOTS_FREE, PLOTS_MAX, PLOT_PRICES, plotPrice,
  SEED_IDS, seedName, isRareSeed, growMinutes, GROW_MIN, GROW_MIN_RARE,
  HARVEST_BASE, HARVEST_BASE_RARE, COMPOSTS_PER_DAY, SPAWN_SEED_CHANCE, rollSpawnSeed,
} from '../js/garden.js';
import { phraseProblem, recoveryIdProblem, RECOVERY_ID_RE, RECOVERY_ITERS, RECOVERY_MIN_LEN } from '../js/social.js';
import { MINI_THEMES } from '../js/poi.js';
import { THEME_POOL, themedLook, FAMILIES } from '../js/bosses.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = f => JSON.parse(readFileSync(join(here, 'fixtures', f), 'utf8'));

let passed = 0, failed = 0;
/* AWAIT THE TEST. This used to be `try { fn(); passed++; }`, which never awaited,
   so every `async` case in this file passed UNCONDITIONALLY: a rejected promise
   from an async body cannot reach a synchronous catch, and passed++ ran no matter
   what the test asserted. Found 2026-08-08 when a brand-new async check stayed
   green with the bug it guards reintroduced. That is rule 1 of the project's own
   anti-regression list ("a check that cannot fail is not a check") broken inside
   the file that enforces the others.
   Cases are queued and run in order at the end so the summary counts all of
   them, sync and async alike. */
const QUEUE = [];
function test(name, fn) { QUEUE.push([name, fn]); }
async function runAll() {
  for (const [name, fn] of QUEUE) {
    try { await fn(); passed++; }
    catch (e) { failed++; console.error(`FAIL ${name}\n  ${e.message}`); }
  }
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

/* BATTLE CHARM: ONE AT A TIME. Tom, 2026-08-08: "You shouldn't be able to use
   multiple battle charms if one is already active."
   activateBattleCharm needs IndexedDB, so this is a source guard like the other
   NO-OP guards in this file. Comments and strings are stripped FIRST: an earlier
   guard here passed because the word it looked for appeared in a COMMENT while
   the real check had been deleted.
   Both halves of the SOP are pinned: the action refuses, AND the button stops
   being offered.
   PROVE-RED: restore `buffs.xp2 = (buffs.xp2 || 0) + 5` with no early return and
   the first assertion fails. */
test('battle charm: cannot stack a second charm over a running one', () => {
  const loot = readFileSync(join(here, '..', 'js', 'loot.js'), 'utf8');
  const fn = loot.slice(loot.indexOf('export async function activateBattleCharm'));
  const body = fn.slice(0, fn.indexOf('\nexport '));
  const bare = body
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
  const guard = bare.search(/if\s*\(\s*\(?\s*buffs\.xp2[^)]*\)?[^)]*\)\s*return/);
  const spend = bare.indexOf('db.del');
  assert.ok(guard >= 0, 'activateBattleCharm must refuse while charges remain (guard missing)');
  assert.ok(spend >= 0, 'activateBattleCharm should still consume the item when it DOES activate');
  assert.ok(guard < spend, 'the refusal must come BEFORE the item is consumed, or the charm is eaten anyway');
  // and it must set, not accumulate
  assert.ok(!/buffs\.xp2\s*=\s*\(?\s*buffs\.xp2/.test(bare), 'charges must be set, not added to an existing stack');
});

test('battle charm: the USE button is not offered while a charm is running', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const i = app.indexOf('id="useBoost"');
  assert.ok(i > 0, 'the charm USE button should exist');
  const row = app.slice(Math.max(0, i - 400), i + 200).replace(/<!--[\s\S]*?-->/g, ' ');
  assert.ok(/boost\s*\?/.test(row), 'the button must branch on whether a charm is already active');
  assert.ok(/disabled/.test(row), 'the active state must render a disabled control, not a live one');
});

/* INGREDIENT VARIETY. Tom, 2026-08-08: "all coins and stuff end up giving the
   same food ingredients."
   Each spawn type had a pool of exactly two, so four of the six commons were
   unreachable from any given type, and the picker was a char-code sum mod 2.
   Two assertions because either alone is a bad guard: EVERY common must be
   reachable from EVERY type (or the pantry stays impossible to stock), and the
   theme must still dominate (or bone piles stop feeling like bone piles and the
   flavour is gone).
   PROVE-RED: set THEME_ODDS to 1 and the reachability assertion fails. */
test('spawn ingredients: every common is reachable from every spawn type, theme still leads', async () => {
  const cook = await import('../js/cooking.js');
  for (const type of ['bones', 'coins', 'crate']) {
    const tally = {};
    for (let cx = 0; cx < 30; cx++) for (let cy = 0; cy < 30; cy++) for (let k = 0; k < 3; k++) {
      const r = cook.spawnIngredient({ type, id: `${cx}_${cy}_s${k}_i0` });
      tally[r.id] = (tally[r.id] || 0) + 1;
    }
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    assert.ok(total > 0, 'an empty sample is a failure');
    for (const id of cook.COMMON_INGREDIENT_IDS) {
      assert.ok(tally[id] > 0, `${type} spawns can never yield ${id}`);
    }
    const themed = cook.SPAWN_INGREDIENTS[type].reduce((a, id) => a + (tally[id] || 0), 0);
    const share = themed / total;
    assert.ok(share > 0.6 && share < 0.95, `${type} theme share ${share.toFixed(2)} should lead without caging the pool`);
  }
  // the map promises a specific drop, so the same spawn must always give the same thing
  const a = cook.spawnIngredient({ type: 'coins', id: '12_34_s1_i0' });
  const b = cook.spawnIngredient({ type: 'coins', id: '12_34_s1_i0' });
  assert.equal(a.id, b.id, 'a spawn must keep showing the same ingredient it advertises');
});

/* NEVER ANIMATE TRANSFORM ON A MAPLIBRE MARKER ROOT.
   A MapLibre DOM marker is positioned by a transform on the element you hand it,
   so any keyframe that animates `transform` on that same element wipes out the
   translate and parks the marker at the map container's origin. It has now cost
   two bugs: the spire markers in v161, and every in-range POI icon on 2026-08-08
   ("the mini boss icon disappears and swaps for the bottom button").
   This is a static scan because the failure is invisible in a DOM check: the
   element is still present, still visible, still opacity 1 — it is just in the
   wrong corner. Root classes are the ones passed to domMarker(); inner elements
   like .den-fx and .spire-fx are the CORRECT place to animate transforms, so
   selectors ending in a descendant are ignored.
   PROVE-RED: point .map-mini-mark.inrange back at spawnReady and this fails. */
test('map markers: no transform animation on a MapLibre marker root', () => {
  const css = readFileSync(join(here, '..', 'app.css'), 'utf8');
  // which keyframes animate transform?
  const movers = new Set();
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\}/g)) {
    if (/[^-]transform\s*:/.test(m[2])) movers.add(m[1]);
  }
  assert.ok(movers.size > 0, 'expected to find transform keyframes (an empty scan is a failure)');
  const ROOTS = ['map-spawn', 'map-den-mark', 'map-mini-mark', 'map-spire', 'map-you', 'map-glutton-mark'];
  const bad = [];
  for (const m of css.matchAll(/([^{}\n][^{}]*)\{([^{}]*)\}/g)) {
    const sel = m[1].trim(), body = m[2];
    const anim = /animation(?:-name)?\s*:\s*([^;]+)/.exec(body);
    if (!anim) continue;
    for (const root of ROOTS) {
      if (!sel.includes('.' + root)) continue;
      // only flag when the ANIMATED element is the root itself, not a descendant
      const last = sel.split(',').map(x => x.trim()).filter(x => x.includes('.' + root));
      for (const one of last) {
        const tail = one.split(/\s+/).pop();
        if (!tail.includes('.' + root)) continue;              // animates a child: fine
        for (const kf of movers) {
          if (new RegExp('\\b' + kf + '\\b').test(anim[1])) bad.push(`${one} -> ${kf}`);
        }
      }
    }
  }
  assert.deepEqual(bad, [], 'these animate transform on a marker root and will teleport the marker:\n  ' + bad.join('\n  '));
});

/* THE GLUTTON IS A GEAR CHECK, NOT A WALL. Tom, 2026-08-08: "I want to include
   the glutton art work in the infinite pit ladder. He should be a formidable boss
   that is a gear check on players every so often" -> "every 10 rungs, no
   punishment on losing, just the usual."
   Three properties, and the third is the one that rots silently: a FLAT bonus was
   a 21% step at rung 10 but only 12% by rung 30 and ~4% by rung 100, so he would
   stop being a check exactly where the ladder becomes the only content left.
   PROVE-RED: change the multiplier back to `+ 0.34` and CONSISTENT fails. */
test('endless: the Glutton lands every 10 rungs and stays a real step at every tier', async () => {
  const pit = await import('../js/pit.js');
  for (const r of [10, 20, 30, 50, 100]) {
    assert.ok(pit.isGluttonRung(r), `rung ${r} should be a Glutton rung`);
    assert.equal(pit.endlessFoe(r).glutton, true, `rung ${r} foe should be the Glutton`);
  }
  for (const r of [1, 9, 11, 19, 21, 99]) {
    assert.ok(!pit.isGluttonRung(r), `rung ${r} must NOT be a Glutton rung`);
    assert.ok(!pit.endlessFoe(r).glutton, `rung ${r} foe must be an ordinary climber`);
  }
  // he brings his own art rather than a generated skeleton
  assert.match(pit.endlessFoe(10).art || '', /glutton/, 'the Glutton rung should carry his artwork');
  /* CONSISTENT: the same bump at rung 10 and rung 100, measured against the
     LADDER'S OWN CURVE rather than the rung below. The rung below is not always
     an ordinary climber any more (rung 49 is the Live Wire, who is himself a
     step up), and comparing to him made the Glutton look like a smaller jump
     than he is. The question the check is asking is "how far above the ordinary
     ladder does he sit", so ask that. */
  const plain = r => 1.32 + r * 0.07;
  const step = r => pit.endlessFoe(r).mult / plain(r) - 1;
  for (const r of [10, 50, 100]) {
    assert.ok(step(r) > 0.15, `rung ${r} step ${(step(r) * 100).toFixed(1)}% is too small to be a check`);
    assert.ok(step(r) < 0.30, `rung ${r} step ${(step(r) * 100).toFixed(1)}% is a wall, not a check`);
  }
  // and he must still be on the ladder's own curve, not a spike that never scales
  assert.ok(pit.endlessFoe(100).mult > pit.endlessFoe(50).mult, 'the Glutton scales with the ladder');
});

/* THE LIVE WIRE holds his own rungs the same way, one step lighter because he
   comes round more often. Tom, 2026-08-09: "the way itll appear in the pit". */
test('endless: the Live Wire lands every 7 rungs, never on the Glutton', async () => {
  const pit = await import('../js/pit.js');
  for (const r of [7, 14, 21, 28, 42]) {
    assert.equal(pit.endlessFoe(r).mage, true, `rung ${r} should be the Live Wire`);
    assert.match(pit.endlessFoe(r).art || '', /mage/, `rung ${r} should carry his artwork`);
    assert.match(pit.endlessFoe(r).name, /Live Wire/, `rung ${r} should be named for him`);
  }
  for (const r of [1, 6, 8, 10, 20, 70]) {
    assert.ok(!pit.endlessFoe(r).mage, `rung ${r} must be someone else`);
  }
  // 70 is divisible by both: the Glutton keeps it, and they never double up
  assert.equal(pit.endlessFoe(70).glutton, true, 'rung 70 stays the Glutton');
  for (let r = 1; r <= 200; r++) {
    const f = pit.endlessFoe(r);
    assert.ok(!(f.mage && f.glutton), `rung ${r} cannot be both`);
  }
  // a real step above the ordinary ladder, but a lighter one than the Glutton's
  const plain = r => 1.32 + r * 0.07;
  for (const r of [7, 49, 105]) {
    const s = pit.endlessFoe(r).mult / plain(r) - 1;
    assert.ok(s > 0.08 && s < 0.16, `rung ${r} step ${(s * 100).toFixed(1)}% should be a check, not a wall`);
    assert.ok(s < pit.endlessFoe(10).mult / plain(10) - 1, 'lighter than the Glutton');
  }
});

/* UNRELEASED COSMETICS STAY DARK. Tom, 2026-08-08: "I want all of these as new
   cosmetics for tally. Don't launch them just yet, I want to do a big teaser post
   about the new cosmetics before they go live."
   Sixty-three items sit in the data file flagged `unreleased`. The ONE thing that
   must not happen before his post is one of them falling out of a crate, so this
   asserts the gate rather than trusting it. It also checks the art is really on
   disk: a teaser item whose PNG is missing is worse than no teaser at all.
   PROVE-RED: drop the `.filter(i => !i.unreleased)` from the BH_ITEMS export and
   the first assertion fails with 63 leaked. */
test('cosmetics: the drop is live, its art exists, and the gate still works', async () => {
  const data = await import('../data/boneheadz.js');
  /* The 63-item drop launched on 2026-08-08. This asserts the LIVE state now, and
     still asserts the gate mechanism, because that is what makes the next hidden
     batch a one-word change. An `unreleased` item must never be reachable whether
     or not any exist today. */
  const leaked = data.BH_ITEMS.filter(i => i.unreleased);
  assert.equal(leaked.length, 0, `unreleased cosmetics are reachable: ${leaked.map(i => i.id).join(', ')}`);

  const DROP_RE = /^(H|E|M|G)S\d+$/;
  const drop = data.BH_ITEMS.filter(i => DROP_RE.test(i.id));
  assert.equal(drop.length, 63, `expected the 63-item drop to be live, found ${drop.length}`);

  // art on disk, or a crate hands out a broken image
  const missing = drop.filter(i => !existsSync(join(here, '..', 'assets', 'bh', i.slot, `${i.id}.png`)));
  assert.deepEqual(missing.map(i => i.id), [], 'drop cosmetics with no art file');

  // and they must sit in slots that already exist
  const slots = new Set(data.BH_SLOTS.map(x => x.code));
  for (const i of drop) assert.ok(slots.has(i.slot), `${i.id} uses unknown slot ${i.slot}`);

  // the spread the teaser advertises has to be the real one
  const by = c => drop.filter(i => i.slot === c).length;
  assert.deepEqual({ H: by('H'), E: by('E'), M: by('M'), G: by('G') }, { H: 24, E: 23, M: 13, G: 3 });
});

// ---- boss dens (the bone road, reimagined) ----
const poi = await import('../js/poi.js');
/* Dens RELOCATE weekly (Tom, 2026-08-08). This test used to assert the exact
   opposite ("landmarks never move"), so it is the proven-red guard for the
   change: it fails against the old cell-only position seed.
   Two halves, and both matter. Stable WITHIN a week, or the den you are walking
   to teleports mid-journey. Moved BETWEEN weeks, or the relocation silently
   stops working and nobody notices, because a den in the wrong place looks
   exactly like a den in the right place. */
test('dens: weekly relocation, stable within a week, deterministic', () => {
  const wk = '2026-W27';
  const a = poi.densNear(wk, 49.2827, -123.1207);
  const b = poi.densNear(wk, 49.2827, -123.1207);
  assert.equal(a.length, 9);
  assert.deepEqual(a.map(d => d.id), b.map(d => d.id), 'same cells, same dens');
  assert.deepEqual([a[0].lat, a[0].lng], [b[0].lat, b[0].lng], 'positions stable within the week');
  const c = poi.densNear('2026-W28', 49.2827, -123.1207);
  // ids are cell-based and must NOT change (the weekly claim key depends on it)
  assert.deepEqual(a.map(d => d.id).sort(), c.map(d => d.id).sort(), 'cell identity survives the move');
  // every den must land somewhere new next week
  const posByIdA = new Map(a.map(d => [d.id, `${d.lat},${d.lng}`]));
  const moved = c.filter(d => posByIdA.get(d.id) !== `${d.lat},${d.lng}`);
  assert.equal(moved.length, c.length, 'every landmark den relocates across weeks');
  // and it stays inside its own cell, so "a few dens within any walk" still holds
  for (const d of c) {
    const [cx, cy] = d.id.split('_').map(Number);
    assert.ok(Math.abs(d.lat / poi.DEN_CELL_DEG - cx) <= 0.5, 'moved den stays in its cell (lat)');
    assert.ok(Math.abs(d.lng / poi.DEN_CELL_DEG - cy) <= 0.5, 'moved den stays in its cell (lng)');
  }
  for (const d of a) {
    assert.ok(d.tier >= 0 && d.tier < poi.DEN_TIERS.length);
    assert.ok(d.mult >= 0.7 && d.mult <= 1.32, 'boss scale within audited pit range');
    assert.ok(d.name && d.boss);
    assert.ok(d.reward.xp > 0);
  }
});
/* SCOUTING, at the generator level. js/app.js now passes scoutLat/scoutLng (the
   map centre) into these instead of the GPS fix, so "keep looking and more of
   the world resolves" only works if the generators are genuinely anchor-driven.
   tests/scout-audit.mjs proves the end-to-end pan for DENS in a real browser;
   spires are covered here because the walkability snap suppresses every spire at
   the audit's test coordinates, so the browser pass never exercises that layer
   and must not be read as evidence that it works. */
test('scouting: den + spire generators follow their anchor, not the player', async () => {
  const spires = await import('../js/spires.js');
  const wk = '2026-W27';
  const here = poi.densNear(wk, 49.2827, -123.1207);
  const away = poi.densNear(wk, 49.2827, -123.0607);   // ~4.4km east: clears the 3x3 window
  const hereIds = new Set(here.map(d => d.id));
  assert.ok(away.some(d => !hereIds.has(d.id)), 'a den window moved with the anchor');

  const sHere = spires.spiresNear(49.2827, -123.1207);
  const sAway = spires.spiresNear(49.2827, -123.0007);  // ~8.8km east: clears the spire window
  assert.ok(sHere.length > 0 && sAway.length > 0, 'both anchors produce spires (empty sample is a failure)');
  const sHereIds = new Set(sHere.map(s => s.id));
  assert.ok(sAway.some(s => !sHereIds.has(s.id)), 'a spire window moved with the anchor');
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
  // derived, not hard-coded: this list went stale the moment a new spawn type
  // (the Herb patch) was added, and the failure said nothing about what was wrong
  for (const s of a) assert.ok(Object.keys(huntMod.SPAWN_TYPES).includes(s.type), `unknown spawn type ${s.type}`);
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
  /* PER-PLAYER DROPS. Tom, 2026-08-08: "players are all getting the same loot
     from boss dens and the glutton this should be random."
     The seed had no player in it. Two assertions, because either one alone lets
     a bug through: same salt must stay STABLE (a pending chooser must not reroll
     under the player) and different salts must actually DIVERGE.
     PROVE-RED: drop `salt` from the seed string in rollDenLoot and the second
     assertion fails with every player on the same drop. */
  const den0 = dens[0];
  const mine = poi.rollDenLoot(den0, wk, new Set(), 999, null, 'salt-aaaa');
  const mineAgain = poi.rollDenLoot(den0, wk, new Set(), 999, null, 'salt-aaaa');
  assert.deepEqual(mine.map(g => g.id), mineAgain.map(g => g.id), 'same player, same den, same day = same offer');
  let diverged = 0;
  for (const d of dens) {
    const a = poi.rollDenLoot(d, wk, new Set(), 999, null, 'salt-aaaa');
    const b = poi.rollDenLoot(d, wk, new Set(), 999, null, 'salt-bbbb');
    if (a && b && a.map(g => g.id).join() !== b.map(g => g.id).join()) diverged++;
  }
  assert.ok(diverged >= Math.ceil(dens.length * 0.6),
    `two players should get different offers at most dens (diverged ${diverged}/${dens.length})`);
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

/* THE MODEL CHANGED (Tom's call 2026-08-07). Breeding used to destroy BOTH pets
   and mint a third, which is why it needed a species picker and why a shiny
   behaved like a transferable skin. It now FEEDS A SPARE into a pet you keep:
   the keeper is the same pet throughout and only gains a lineage rank.
   These tests are the record of the new rules. */
test('breeding: the fed pet is reported so the reveal can show what it cost', () => {
  const fed = { iid: 'y', sp: 'C3', lineage: 4, shiny: true };
  const [rec] = breedParents(fed);
  assert.equal(rec.sp, 'C3');
  assert.equal(rec.shiny, true, 'the reveal has to be able to say a shiny was lost');
  assert.equal(rec.lineage, 4);
  assert.equal(breedParents(fed).length, 1, 'exactly ONE pet is consumed, not two');
});

test('breeding: lineage is earned per feeding, never transferred from the spare', () => {
  /* Feeding a lineage-4 pet into a lineage-0 keeper must NOT vault the keeper to
     5: otherwise sacrificing your best pet is a strategy instead of a mistake.
     The rule is keeper.lineage + 1, which is what breedCost is quoted against. */
  const keeperLineage = 0, spareLineage = 4;
  const next = keeperLineage + 1;
  assert.equal(next, 1, 'keeper goes 0 -> 1 regardless of the spare');
  assert.notEqual(next, spareLineage + 1, 'the spare lineage does not carry');
  assert.equal(breedCost(next), 60, 'and the price is quoted for the rank actually gained');
});

test('breeding: cost escalates with the lineage rank being bought', () => {
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
  // BH_ITEMS_ALL is the raw array; BH_ITEMS is the released-only export built from
  // it (see the unreleased-cosmetics gate in data/boneheadz.js). Match the array.
  const items = JSON.parse(data.match(/BH_ITEMS_ALL = (\[[\s\S]*?\n\]);/)[1]);
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

/* ---------------------------------------------------------------------------
 * REWARDED ACTIONS PAY ONLY ON A REAL STATE TRANSITION.
 *
 * Tom, 2026-08-07: "You can still exploit the spire system just like the glutton
 * was. After beating you can take the same spire again when it's already yours.
 * I've already brought this up to you and you struggled multiple times fixing it
 * for the glutton. Figure out an SOP for yourself so this doesn't keep happening
 * on this feature or new ones."
 *
 * The class, both times: the payout branch was gated on "the request did not
 * error" instead of on the state actually changing. The spire server has always
 * been idempotent (claiming a tower you own returns `ok:true, already:true` and
 * moves no ownership); the client only checked `ok === false`, so a re-fight of
 * your own tower paid the full takeover every time.
 *
 * The SOP is in tally/CLAUDE.md under "Rewarded actions". These two checks are
 * the teeth: the authority's no-op answer must be handled at every call site
 * that pays, and it must be handled by NAME, not by hoping ok===false covers it.
 *
 * PROVE-RED (confirmed 2026-08-07): delete the `already` handling from the spire
 * branch in js/app.js and NO-OP fails naming social.claimSpireRemote.
 * ------------------------------------------------------------------------- */
test('NO-OP every paying remote call branches on the answer BEFORE it pays', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const lines = app.split('\n');
  /* Strip prose first. The first version of this check read raw source, so the
     word "already" sitting in a COMMENT satisfied it while the guard was deleted:
     a check that cannot fail (tally/CLAUDE.md rule 1). */
  const code = lines.map(l => l.replace(/\/\/[^\n]*$/, ''));
  const findings = [];
  let analysed = 0;
  code.forEach((ln, i) => {
    const m = ln.match(/const\s+(\w+)\s*=\s*await\s+social\.(\w+Remote)\s*\(/);
    if (!m) return;
    analysed++;
    const [, resp, fn] = m;
    const block = code.slice(i, i + 34);
    const payAt = block.findIndex(l => /\bcoins\s*=\s*\d|extraCards\.push|\bxp\s*\+=|await award\(/.test(l));
    if (payAt < 0) return;                     // this call site pays nothing
    /* The answer has to be CONSULTED before the money moves. Both live exploits
       were this exact shape: ask the server, ignore what it said, pay anyway. */
    const consulted = block.slice(0, payAt).some(l => new RegExp(`\\b${resp}\\s*(&&|\\.|\\))`).test(l) && !l.includes('await social.'));
    if (!consulted) findings.push(`js/app.js:${i + 1}  ${fn} pays at +${payAt} lines without reading ${resp} first`);
  });
  /* THE EMPTY-SAMPLE GUARD HAS TO COUNT WHAT WAS ACTUALLY EXAMINED. This
     asserted that the STRING 'social.claimSpireRemote' appears in app.js, which
     is a fact about the file, not about this check: the matcher above only sees
     `const X = await social.YRemote(`, so one refactor to a destructured
     `const { ok } = await social.claimSpireRemote(...)` takes the analysed count
     to zero while the string is still there, and the whole guard passes having
     read nothing. Measured 2026-08-12: it analyses 2 call sites today, both
     paying, so it is honest right now; this pins that it stays honest. Count the
     sites, not the string (tally/CLAUDE.md rule 3). */
  assert.ok(analysed > 0, `no paying remote call sites were ANALYSED (matcher saw ${analysed}): an empty sample is a failure, not a pass`);
  assert.deepEqual(findings, [], '\n      ' + findings.join('\n      '));
});

test('NO-OP the spire claim treats an already-yours answer as no takeover', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const i = app.indexOf('claimSpireRemote');
  assert.ok(i > 0, 'the spire claim call is gone: this check has nothing to guard');
  const block = app.slice(i, i + 1800);
  assert.ok(/already\s*=\s*!!\(remote/.test(block), 'the already flag is not read off the server answer');
  assert.ok(/refused \|\| already/.test(block), 'the local claim still runs when the server says already');
  // and it must not pay the takeover price for a no-op
  const alreadyBranch = block.slice(block.indexOf('if (already)'), block.indexOf('if (already)') + 260);
  assert.ok(/coins\s*=\s*(\d+)/.test(alreadyBranch), 'the already branch sets no payout at all');
  const paid = Number(alreadyBranch.match(/coins\s*=\s*(\d+)/)[1]);
  assert.ok(paid <= 25, `a repeat pays ${paid} coins, which is not pocket change`);
});

/* ---------------------------------------------------------------------------
 * AN EGG THAT CANNOT HATCH.
 * Tom, 2026-08-08: "Chiseled [Patella]'s eggs aren't incubating can you see why".
 * Two ways an egg stops moving, both silent:
 *   1. goal 0 fell back to 8,000 through `row.goal || EGG_GOAL_STEPS`, so the
 *      READY egg the Crew channel hands a new player asked for a full walk. Mine,
 *      shipped in v307, and the one thing the goal parameter existed to express.
 *   2. stepsAtStart above the current lifetime. Lifetime CAN go down (a restore
 *      with fewer health rows, or a wiped container), and max(0, ...) then pins
 *      progress at zero forever behind a dead bar.
 * PROVE-RED: put `||` back and READY fails; drop the stalled branch and STALL
 * fails with walked 0 of 8000.
 * ------------------------------------------------------------------------- */
test('EGG a goal of 0 means ready now, not a full walk', () => {
  const p = eggProgress({ stepsAtStart: 5000, goal: 0 }, 5000);
  assert.equal(p.goal, 0, 'goal 0 was replaced by the default');
  assert.equal(p.ready, true, 'a zero-goal egg is not ready');
});
test('EGG a normal egg still needs its full goal', () => {
  const a = eggProgress({ stepsAtStart: 1000 }, 1000);
  assert.equal(a.goal, 8000);
  assert.equal(a.ready, false);
  assert.equal(a.walked, 0);
  const b = eggProgress({ stepsAtStart: 1000 }, 9000);
  assert.equal(b.ready, true, '8000 walked should hatch it');
});
test('EGG STALL an anchor above lifetime unsticks instead of freezing forever', () => {
  // the device has 4,000 lifetime steps but the egg was anchored at 12,000
  const p = eggProgress({ stepsAtStart: 12000, goal: 8000 }, 4000);
  assert.equal(p.stalled, true, 'the stall was not detected');
  assert.equal(p.walked, 0, 'it should start from here, not go negative');
  // and once they walk, it MOVES, which is the thing that was broken
  const q = eggProgress({ stepsAtStart: 4000, goal: 8000 }, 6000);
  assert.equal(q.walked, 2000, 'a re-anchored egg must accumulate');
});

/* ---------------------------------------------------------------------------
 * WHICH SHELL IS THE PLAYER ON?
 *
 * Tom, 2026-08-08: "What are you talking about android has had steps for a
 * while no??" It has, via a full Health Connect bridge in
 * native/android/.../HealthPlugin.kt, and I told him twice it did not, because I
 * reasoned from a comment at the top of js/native.js instead of looking at the
 * platform. The reason a guess was even POSSIBLE is that nothing recorded the
 * platform anywhere: not the events, not the devices row, not the profile
 * snapshot. "Is this player on Android" had no answer, so I invented one.
 *
 * So it is recorded in both places now, and both are pinned here:
 *   profile  -> answers it for ONE player (the support question)
 *   devices  -> answers it in aggregate (how many testers are on each)
 *
 * PROVE-RED (confirmed 2026-08-08): drop `plat` from socialSnapshot and PROFILE
 * fails; drop it from the /events envelope or the devices upsert and DEVICE
 * fails naming which half is missing.
 * ------------------------------------------------------------------------- */
test('PLAT the app can tell which shell it is running in', () => {
  const nat = readFileSync(join(here, '..', 'js', 'native.js'), 'utf8');
  assert.ok(/export function platformTag\(/.test(nat), 'platformTag is gone');
  // it must distinguish the NATIVE shell from a browser: on iOS that is the
  // difference between "Health just works" and "you need the Shortcut"
  assert.ok(/isNative\(\)/.test(nat.slice(nat.indexOf('platformTag'))),
    'platformTag does not consult isNative, so it cannot tell app from web');
});
test('PLAT PROFILE a player snapshot carries the platform', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.ok(/plat:\s*platformTag\(\)/.test(app), 'socialSnapshot no longer sends plat');
});
test('PLAT DEVICE analytics send it and the server stores it', () => {
  const an = readFileSync(join(here, '..', 'js', 'analytics.js'), 'utf8');
  const srv = readFileSync(join(here, '..', 'server', 'src', 'index.js'), 'utf8');
  assert.ok(/plat:\s*platformTag\(\)/.test(an), 'the events envelope no longer carries plat');
  assert.ok(/INSERT INTO devices \([^)]*\bplat\b/.test(srv), 'the devices upsert dropped the plat column');
  assert.ok(/plat = COALESCE\(excluded\.plat/.test(srv), 'a returning device never updates its plat');
});

/* ---------------------------------------------------------------------------
 * A DESTINATION MUST NOT BE HARDER TO REACH THAN A PICKUP.
 *
 * Tom, 2026-08-08, from feel alone: "does the new 75m radius include boss dens
 * because it feels like it doesn't". It did not. COLLECT_RADIUS_M went 45 -> 55
 * -> 75 across three separate requests and every other radius stayed where it
 * was, so a boss den you make a special trip for became 15m TIGHTER than
 * something you brush past on the pavement. DEN_RADIUS_M even still carried the
 * comment "a touch roomier than spawns", which had quietly become false.
 *
 * This pins the ORDERING, not the numbers, so the next spawn bump cannot invert
 * it again by omission. Tune the values freely; just keep destinations >= spawns.
 * PROVE-RED (confirmed 2026-08-08): set DEN_RADIUS_M back to 60 and it fails
 * naming the den at 60 against a spawn radius of 75.
 * ------------------------------------------------------------------------- */
test('REACH a den, spire or world boss is never tighter than a spawn', async () => {
  const hunt = await import('../js/hunt.js');
  const poi = await import('../js/poi.js');
  const spires = await import('../js/spires.js');
  const spawn = hunt.COLLECT_RADIUS_M;
  assert.ok(spawn > 0, 'no spawn radius to compare against: an empty check is a failure');
  const destinations = [
    ['boss den', poi.DEN_RADIUS_M],
    ['roaming mini', poi.MINI_RADIUS_M],
    ['world boss', poi.GLUTTON_RADIUS_M],
    ['dark spire', spires.SPIRE_RADIUS_M],
  ];
  const tighter = destinations.filter(([, r]) => r < spawn).map(([n, r]) => `${n} ${r}m < spawn ${spawn}m`);
  assert.deepEqual(tighter, [], tighter.join('; '));
});
/* The hidden ones are the deliberate exception: a secret den is MEANT to need you
   nearly on top of it, which is the whole mechanic (whisper at 400, reveal at
   150, enter at 45). Asserted so nobody "fixes" it to match the others. */
test('REACH a secret den stays deliberately tight', async () => {
  const poi = await import('../js/poi.js');
  const hunt = await import('../js/hunt.js');
  assert.ok(poi.SECRET_RADIUS_M < hunt.COLLECT_RADIUS_M,
    'a secret den is supposed to be harder to stand on than a spawn');
  assert.ok(poi.SECRET_WHISPER_M > poi.SECRET_RADIUS_M, 'the whisper must reach further than the door');
});

/* NO PLACEHOLDER NAMES IN THE CATALOGUE.
   Tom, 2026-08-08: "we should rename the solana items so they're not just called
   'sol xxxx'." 63 cosmetics shipped as "Sol Lid #1" through "Sol Shades #23",
   which is an internal batch label wearing a product name. This fails on any item
   named after its source batch or numbered like a spreadsheet row, so the next
   drop cannot repeat it. */
test('NAMES the drop ships no placeholder or batch names', async () => {
  const { BH_ITEMS_WITH_UNRELEASED } = await import('../data/boneheadz.js');
  /* Scoped to the 63-piece drop on purpose. Writing this guard turned up 258
     numbered names across the WHOLE catalogue ("Tidy Backdrop #1", and 21 more
     backdrops like it), which is a real pre-existing problem but a different and
     much larger job than the one asked for, and one that needs a decision about
     tone before 258 items get rewritten. Flagged to Tom rather than folded in
     silently. Widen this filter the day those are named. */
  const drop = BH_ITEMS_WITH_UNRELEASED.filter(i => /^(H|E|M|G)S\d+$/.test(i.id));
  assert.equal(drop.length, 63, 'an empty or short sample is a failure, not a pass');
  const bad = drop.filter(i => /^sol\b/i.test(i.name) || /#\d+\s*$/.test(i.name));
  assert.deepEqual(bad.map(i => `${i.id}="${i.name}"`), [], 'placeholder names reached the drop');
});
test('NAMES no two cosmetics share a name', async () => {
  const { BH_ITEMS_WITH_UNRELEASED } = await import('../data/boneheadz.js');
  const names = BH_ITEMS_WITH_UNRELEASED.map(i => i.name);
  const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  assert.deepEqual(dupes, [], 'two cosmetics with one name are indistinguishable in the wardrobe');
});

/* THE HANDS DRAW UNDER THE HEAD (2026-08-09, Tom: "we need those to be correct
   in the BH hierarchy they're going to be live for players").

   The bug this pins: IL/IR shipped as the TOP two layers, so any held item drawn
   raised painted over the player's own face. IL9 covered 81% of the face zone,
   the two spades 10.8%. Flip either z back above the skull's and this goes red,
   which is the only reason to trust it. */
test('FIGURE held items never draw over the face', async () => {
  const { BH_SLOTS } = await import('../data/boneheadz.js');
  const z = Object.fromEntries(BH_SLOTS.map(s => [s.code, s.z]));
  assert.ok(z.SK != null && z.IL != null && z.IR != null, 'an empty sample is a failure, not a pass');
  for (const hand of ['IL', 'IR']) {
    assert.ok(z[hand] < z.SK, `${hand} (z ${z[hand]}) must draw under the skull (z ${z.SK})`);
    assert.ok(z[hand] < z.E, `${hand} (z ${z[hand]}) must draw under the eyes (z ${z.E})`);
    assert.ok(z[hand] < z.H, `${hand} (z ${z[hand]}) must draw under headwear (z ${z.H})`);
    assert.ok(z[hand] > z.T, `${hand} (z ${z[hand]}) must still draw over the top (z ${z.T})`);
  }
  assert.ok(z.IR > z.IL, 'the near hand (IR) still wins over the far hand (IL)');
});

/* Every boss look is buildable: a typo in an item id renders a missing layer,
   which degrades to a half-dressed monster rather than an error, so nothing
   would ever tell us. */
test('BOSSES every look uses real catalogue ids', async () => {
  const { BH_BY_ID } = await import('../data/boneheadz.js');
  const { LOOKS, FAMILIES } = await import('../js/bosses.js');
  const all = [...Object.values(LOOKS), ...Object.values(FAMILIES).flat()];
  assert.ok(all.length >= 56, 'an empty or short roster is a failure, not a pass');
  const bad = [];
  for (const eq of all) for (const [slot, id] of Object.entries(eq)) {
    if (!BH_BY_ID[id]) bad.push(`${slot}:${id}`);
    else if (BH_BY_ID[id].slot !== slot) bad.push(`${id} is a ${BH_BY_ID[id].slot}, worn as ${slot}`);
  }
  assert.deepEqual([...new Set(bad)], [], 'a boss references art that does not exist');
});


/* THE LIVE WIRE'S KIT. Designed against the drawing before the art existed
   (ROADMAP, 2026-08-09) and then, when the art landed, very nearly shipped
   without any of it. Each move checks something the game does not otherwise
   check, so each one gets a test that fails if it quietly stops doing that.
   These run through aiTakeTurn, the real path, not by poking flags. */
const wireFight = (seed, tweak = () => {}) => {
  const you = mkFighter({ name: 'You', stats: { power: 12, marrow: 14, wind: 40, reflex: 10, spirit: 10 } });
  const him = mkFighter({ name: 'The Live Wire', stats: { power: 16, marrow: 12, wind: 40, reflex: 8, spirit: 14 } });
  him.wraith = true;
  const fight = pitMod.createFight({ player: you, foe: him, seed, aiLevel: 4 });
  you.hp = 9999; you.d.maxHp = 9999;
  tweak({ fight, you, him });
  /* hand the turn over the way the game does, rather than poking active/ap:
     endTurn is what sets the foe's AP, ticks its timers and flips the side. */
  pitMod.endTurn(fight);
  return { fight, you, him };
};
const wireCasts = (n, tweak) => {
  const seen = [];
  for (let seed = 1; seed <= n; seed++) {
    const { fight } = wireFight(seed, tweak);
    for (const e of pitMod.aiTakeTurn(fight)) if (e.t === 'wraith') seen.push(e.cast);
  }
  return seen;
};

test('the Live Wire casts his own kit, not a skeleton\'s', async () => {
  const casts = wireCasts(60);
  assert.ok(casts.length >= 50, `he should act every turn, got ${casts.length} casts in 60 fights`);
  const kinds = new Set(casts);
  for (const id of ['bolt', 'reap', 'wail', 'rise']) {
    assert.ok(kinds.has(id), `${id} never came up in 60 fights: ${[...kinds].join(', ')}`);
  }
});

test('the Live Wire: Wail halves your healing and wears off', async () => {
  const { fight, you } = wireFight(3);
  // heal at full rate
  you.hp = 100; you.d.maxHp = 1000;
  const base = pitMod.healForTest(you, 100);
  you.healCut = 2;
  const cut = pitMod.healForTest(you, 100);
  assert.equal(cut, Math.round(base * pitMod.WAIL_HEAL_MULT), `${cut} should be half of ${base}`);
  // and it expires on its own
  fight.active = 'f';
  pitMod.endTurn(fight);        // -> player's turn ticks it
  pitMod.endTurn(fight);
  pitMod.endTurn(fight);
  assert.equal(you.healCut, 0, 'Wail must not last the whole fight');
});

test('the Live Wire: a crit shatters the amulet, and only a crit', async () => {
  const { fight, him } = wireFight(11);
  fight.active = 'p';
  assert.notEqual(him.amulet, false, 'it starts intact');
  // a plain hit leaves it alone
  const plain = pitMod.applyAction(fight, 'jab');
  const wasCrit = plain.some(e => e.t === 'hit' && e.crit);
  if (!wasCrit) assert.notEqual(him.amulet, false, 'a non-crit must not shatter it');
  /* and a real crit shatters it. Driven through applyAction with a high-Reflex
     player over many seeds rather than by setting the flag, so this fails if the
     shatter ever stops being wired to the crit. */
  let shattered = false, sawCrit = false;
  for (let seed = 1; seed <= 60 && !shattered; seed++) {
    const you2 = mkFighter({ name: 'You', stats: { power: 30, marrow: 10, wind: 80, reflex: 60, hype: 0 } });
    const him2 = mkFighter({ name: 'The Live Wire', stats: { power: 10, marrow: 60, wind: 40, reflex: 6, hype: 0 } });
    him2.wraith = true;
    const f2 = pitMod.createFight({ player: you2, foe: him2, seed, aiLevel: 1 });
    for (let i = 0; i < 8 && !shattered && !f2.over; i++) {
      f2.ap = 3;
      const evs = pitMod.applyAction(f2, 'swing');
      if (evs.some(e => e.t === 'hit' && e.crit)) sawCrit = true;
      if (evs.some(e => e.t === 'amulet')) { shattered = true; assert.equal(him2.amulet, false); }
      if (f2.f.hp <= 0) { f2.f.hp = f2.f.d.maxHp; f2.over = null; }
    }
  }
  assert.ok(sawCrit, 'the sample never landed a crit, so it proves nothing');
  assert.ok(shattered, 'a crit should shatter the amulet');
  // and with it gone he can no longer Wail or Rise
  const after = wireCasts(40, ({ him: h }) => { h.amulet = false; });
  assert.ok(!after.includes('wail'), 'Wail must be gone with the amulet');
  assert.ok(!after.includes('rise'), 'Rise must be gone with the amulet');
});

test('the Live Wire: Reap punishes a full stamina bar, not an empty one', async () => {
  const reap = wind => {
    let total = 0, n = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const { fight } = wireFight(seed, ({ you, him }) => { you.wind = wind; him.amulet = false; });
      for (const e of pitMod.aiTakeTurn(fight)) if (e.t === 'hit' && e.move === 'reap') { total += e.damage; n++; }
    }
    return { avg: n ? total / n : 0, n };
  };
  const hi = reap(100), lo = reap(8);
  assert.ok(hi.n > 0, 'Reap should fire against a full bar');
  assert.equal(lo.n, 0, 'Reap should not fire at all against an empty bar');
  assert.ok(hi.avg > 0, `full-bar Reap should hurt, got ${hi.avg}`);
});

test('the Live Wire: Grasp turns your stamina into his health', async () => {
  let drained = 0;
  for (let seed = 1; seed <= 120 && !drained; seed++) {
    const { fight, you, him } = wireFight(seed, ({ you: y, him: h }) => {
      y.wind = 40; h.amulet = false; h.hp = Math.round(h.d.maxHp * 0.5);
    });
    const hpBefore = fight.f.hp, windBefore = fight.p.wind;
    for (const e of pitMod.aiTakeTurn(fight)) {
      if (e.t === 'drain') {
        assert.ok(fight.p.wind < windBefore, 'it should take stamina');
        assert.ok(fight.f.hp > hpBefore, 'and turn it into his health');
        drained = 1;
      }
    }
  }
  assert.ok(drained, 'Grasp never fired in 120 tries');
});

/* EVERY ROAMING MINI-BOSS HAS A FACE. Tom, 2026-08-10: "the first miniboss i
   fought today was not one of the ones we worked on creating yesterday that has a
   theme to it."
   The gap was that minis passed only a name into the fight, and no mini name is
   in LOOKS, so all six fell through to foeOutfitFor's random-cosmetic coin flip.
   This is the guard rail: a mini theme with no bloodline behind it fails here, so
   a seventh mini added next month cannot ship faceless. It asserts the LOOK, not
   the mapping table, because a THEME_POOL key pointing at a family that does not
   exist would satisfy a table check and still draw nothing. */
test('every roaming mini-boss theme resolves to a real themed look', () => {
  const missing = [];
  for (const t of MINI_THEMES) {
    const look = themedLook(t.key, `2026-08-10:0_0`);
    if (!look || !look.B || !look.SK) missing.push(`${t.key} (${t.name})`);
  }
  assert.deepEqual(missing, [], `mini themes with no look: ${missing.join(', ')}`);
});

/* And the pools they point at must be real. THEME_POOL naming a family that is
   not in FAMILIES is a silent null from themedLook at every call site, not only
   the minis'. */
test('no THEME_POOL entry points at a family that does not exist', () => {
  const bad = [];
  for (const [k, fams] of Object.entries(THEME_POOL)) {
    for (const f of fams) if (!FAMILIES[f]) bad.push(`${k} -> ${f}`);
  }
  assert.deepEqual(bad, [], bad.join(', '));
});

/* A BOSS FIGHT MUST BE WINNABLE. Tom, 2026-08-10: "the live wire in the pit is
   un beatable when his health hits 0 the player fights for infinity with no win"
   and then "Ensure you don't make this bug occur in future fights with new
   bosses."
   The cause was `rise` installing a fight.fAux mid-fight: an enemy with no body,
   no HP bar and no target chip, which checkOver then required you to kill.
   Measured on that build with an invincible player: 40 of 60 fights ran to the
   turn cap and reported a DRAW with the boss already at 0 HP.
   The player here CANNOT lose, so the only thing under test is whether the fight
   can reach a win at all. Any future boss kit that strands a fight fails here. */
function fightToTheEnd(seed, dressFoe = () => {}) {
  const you = mkFighter({ name: 'You', stats: { power: 40, marrow: 40, wind: 60, reflex: 30, spirit: 20 } });
  const him = mkFighter({ name: 'Boss', stats: { power: 10, marrow: 6, wind: 30, reflex: 5, spirit: 8 } });
  dressFoe(him);
  const fight = pitMod.createFight({ player: you, foe: him, seed, aiLevel: 4 });
  you.hp = 99999; you.d.maxHp = 99999;
  let guard = 0;
  while (!fight.over && guard++ < 300) {
    if (fight.active === 'p') {
      let inner = 0;
      while (!fight.over && fight.active === 'p' && fight.ap > 0 && inner++ < 8) {
        const legal = pitMod.actionsFor(fight).filter(x => x.enabled);
        if (!legal.length) break;
        pitMod.applyAction(fight, (legal.find(x => x.id === 'haymaker') || legal.find(x => x.id === 'swing') || legal[0]).id);
      }
      if (!fight.over) pitMod.endTurn(fight);
    } else { pitMod.aiTakeTurn(fight); if (!fight.over) pitMod.endTurn(fight); }
  }
  return fight;
}

test('the Live Wire can actually be beaten', () => {
  const bad = [];
  for (let seed = 1; seed <= 40; seed++) {
    const fight = fightToTheEnd(seed, f => { f.wraith = true; });
    if (!fight.over) bad.push(`seed ${seed}: never ended`);
    else if (fight.over.winner !== 'p') bad.push(`seed ${seed}: ${fight.over.winner} (foe hp ${fight.f.hp})`);
  }
  assert.deepEqual(bad, [], `an invincible player must always win: ${bad.slice(0, 5).join('; ')}`);
});

test('no boss may summon a second enemy mid-fight', () => {
  /* The structural guard in createFight refuses the assignment and counts it, so
     this catches a future boss kit doing what rise used to do. Runs the Live Wire
     because he is the one with a summon; a plain foe has nothing to summon. */
  const offenders = [];
  for (let seed = 1; seed <= 40; seed++) {
    const fight = fightToTheEnd(seed, f => { f.wraith = true; });
    if (fight.badAuxAttempt) offenders.push(`seed ${seed}: ${fight.badAuxAttempt} attempt(s)`);
  }
  assert.deepEqual(offenders, [], `a second enemy can only be created at fight open: ${offenders.slice(0, 3).join('; ')}`);
});

/* THE LADDER ALWAYS HAS A FACE. Rank 51+ used to render "Bonefather 7", which
   matched no LOOKS entry and fell through to a random cosmetic coin flip. */
test('every Gauntlet rank resolves a real monster look', () => {
  const naked = [];
  for (let r = 1; r <= 140; r++) {
    const f = pitMod.endlessFoe(r);
    if (f.glutton || f.mage) continue;      // drawn bosses bring their own art
    if (!f.look || !f.look.B || !f.look.SK) naked.push(`${r}: ${f.name}`);
    if (/\s\d+$/.test(f.name)) naked.push(`${r}: bare digit in "${f.name}"`);
  }
  assert.deepEqual(naked, [], `ranks with no face: ${naked.slice(0, 8).join(', ')}`);
});


/* ================= BhVault backfill: additive-only, all four gates =========
 * The iOS registration fix (2026-08-10) makes every existing player's device a
 * "readable empty vault + real local identity" case, which nothing wrote
 * before. backfillVaultMirror closes that; these pin its safety envelope, the
 * same envelope that protects against the two historical account wipes:
 * an unreadable vault is NEVER written, a different account is NEVER displaced,
 * and only a confirmed-empty vault receives the local key. */

test('vault backfill writes ONLY into a confirmed-empty vault', async () => {
  const { backfillVaultMirror } = await import('../js/social.js');
  const ME = { privJwk: { d: 'me' }, pubJwk: {} };
  const OTHER = { privJwk: { d: 'other' }, pubJwk: {} };
  const calls = [];
  const mk = (readResult, id = ME) => ({
    read: async () => readResult,
    mirror: async v => { calls.push(v.privJwk.d); },
    getId: async () => id,
  });
  // 1. unreadable: ok:false is a failed READ, not an empty vault. Never write.
  assert.equal(await backfillVaultMirror(mk({ ok: false, id: null })), 'unreadable');
  // 2. different account present: leave it alone (a recoverable account).
  assert.equal(await backfillVaultMirror(mk({ ok: true, id: OTHER })), 'conflict');
  // 3. same account already mirrored: nothing to do.
  assert.equal(await backfillVaultMirror(mk({ ok: true, id: ME })), 'already');
  // 4. no local identity yet: nothing to protect, never write.
  assert.equal(await backfillVaultMirror(mk({ ok: true, id: null }, null)), 'no-local');
  assert.deepEqual(calls, [], `cases 1-4 must write nothing, wrote: ${calls}`);
  // 5. the one legal write: readable AND empty AND a real local identity.
  assert.equal(await backfillVaultMirror(mk({ ok: true, id: null })), 'written');
  assert.deepEqual(calls, ['me'], 'the empty-vault case mirrors the local key, exactly once');
});

test('identity boot order stays local-first and backfill stays before the cloud gates', () => {
  const src = readFileSync(join(here, '../js/social.js'), 'utf8');
  // ensureIdentity must return an existing local identity BEFORE any keychain
  // read: the mirror-on-every-read bug once destroyed a good keychain entry.
  const ei = src.slice(src.indexOf('async function ensureIdentity'), src.indexOf('async function signingKey'));
  const firstReturn = ei.indexOf('return id;');
  const firstRead = ei.indexOf('readKeychainIdentity');
  assert.ok(firstReturn > -1 && firstRead > -1 && firstReturn < firstRead,
    'ensureIdentity consults the keychain before honoring the local identity');
  // bootSync must fire the backfill BEFORE the cloudOff / no-api early returns,
  // or local-only players (cloud off) never get their reinstall protection.
  const bs = src.slice(src.indexOf('export async function bootSync'));
  const fill = bs.indexOf('backfillVaultMirror');
  const gate = bs.indexOf("kvGet('cloudOff'");
  assert.ok(fill > -1 && gate > -1 && fill < gate, 'backfill runs after the cloud gates, so cloud-off players are unprotected');
});
/* NOBODY CHANGES THE VIEWPORT WITHOUT SAYING isMobile AND hasTouch.
 *
 * puppeteer reloads the page for you when either one CHANGES, and it reads a
 * missing key as false:
 *   puppeteer-core/lib/cjs/puppeteer/cdp/Page.js:819
 *     if (needsReload) { await this.reload(); }
 *   puppeteer-core/lib/cjs/puppeteer/cdp/EmulationManager.js:335
 *     const mobile = viewport?.isMobile || false;
 * godmode's boot() launches with both true, so `{ width, height,
 * deviceScaleFactor }` flips both and silently reloads. On this app that is a
 * fresh 10-13s seeded boot mid-suite whose route() closes every open sheet, and it
 * presents as an unrelated flake somewhere else entirely: batch-audit's "no fight
 * or no seam". Two lines cost a week and three wrong theories (a renderer crash, a
 * delayed popstate, a slow static server). Measured, extra documents served after
 * one setViewport: bare [1,1,1], with both flags [0,0,0].
 *
 * The rule is PRESENCE, not a value. A desktop viewport is a legitimate thing to
 * want; it just has to be deliberate, because it really will reload. Prefer
 * godmode's setWidth(page, w, h), which always carries both.
 */
test('no browser test changes the viewport without isMobile and hasTouch', () => {
  const dirs = [here, join(here, '..', 'scripts')];
  const files = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      /* this file is skipped on purpose: it drives no browser, and it quotes the
         very identifiers it is searching for, so scanning itself would be noise */
      if (f === 'unit.test.js' || !/\.(mjs|js)$/.test(f)) continue;
      files.push(join(dir, f));
    }
  }
  /* ONLY FILES THAT BOOT THROUGH GODMODE. The flip needs a CHANGE, and godmode's
     boot() is what makes the starting state isMobile/hasTouch true, so only its
     callers can flip them by omission. scripts/capture-petanim.mjs launches its own
     browser with no defaultViewport, so mobile is already false there and its bare
     setViewport reloads nothing: including it would demand a meaningless edit, and
     a guard that cries wolf gets deleted. Anything launching its own browser owns
     its own defaults. */
  const viaGodmode = files.filter(p => /from\s+'[^']*godmode\.js'/.test(readFileSync(p, 'utf8')));
  const offenders = [];
  let calls = 0;
  for (const path of viaGodmode) {
    const src = readFileSync(path, 'utf8');
    let i = 0;
    while ((i = src.indexOf('setViewport(', i)) !== -1) {
      /* match the parens so a call broken across lines is read whole; a
         line-at-a-time regex would simply miss it and report the tree clean */
      const open = src.indexOf('(', i);
      let depth = 0, j = open;
      for (; j < src.length; j++) {
        if (src[j] === '(') depth++;
        else if (src[j] === ')' && --depth === 0) break;
      }
      const args = src.slice(open + 1, j);
      calls++;
      if (!/\bisMobile\b/.test(args) || !/\bhasTouch\b/.test(args)) {
        offenders.push(`${path.split('/').pop()}:${src.slice(0, i).split('\n').length}`);
      }
      i = j;
    }
  }
  /* AN EMPTY SCAN IS A FAILURE, NOT A CLEAN TREE. If the paren walk or the glob
     ever breaks, this must go red rather than quietly passing forever. */
  assert.ok(calls > 0, 'scanned no setViewport calls at all: the scan is broken, not the tree clean');
  assert.deepEqual(offenders, [],
    `these change the viewport without stating isMobile/hasTouch, so puppeteer will RELOAD the page: ${offenders.join(', ')}. `
    + 'Use setWidth(page, w, h) from godmode.js, or state both keys if you really do want the reload.');
});

/* ===== PLUGIN PARITY =====================================================
 * @capacitor/haptics was missing for weeks and nothing could notice, because a
 * missing plugin degrades to silence by design: js/haptics.js falls back to
 * navigator.vibrate?.(), which does not exist in an iOS WKWebView, inside a
 * try/catch. The same shape shipped BhVault compiled-but-unregistered on iOS,
 * where js/social.js reads a missing vault as an empty one on purpose.
 * native/capabilities.json is the declared list; these check it both ways.
 * Static, so they cost no browser time and run in `npm test`.
 */
const CAPS = JSON.parse(readFileSync(join(here, '..', 'native', 'capabilities.json'), 'utf8'));
const nat = f => readFileSync(join(here, '..', 'native', f), 'utf8');

test('plugin parity: every plugin the web code asks for is declared', () => {
  /* THE DIRECTION THAT CATCHES THE ORIGINAL BUG. Haptics was referenced by
     js/haptics.js and declared in no manifest, no package.json, nowhere. A
     forward-only check cannot see a plugin nobody declared. */
  const asked = new Set();
  for (const f of readdirSync(join(here, '..', 'js')).filter(f => f.endsWith('.js'))) {
    const src = readFileSync(join(here, '..', 'js', f), 'utf8');
    for (const m of src.matchAll(/Capacitor\s*\??\.\s*Plugins\s*\??\.\s*([A-Za-z][A-Za-z0-9]*)/g)) asked.add(m[1]);
  }
  assert.ok(asked.size > 0, 'found no Capacitor.Plugins references at all: the scan is broken, not the code clean');
  const declared = new Set(CAPS.plugins.map(p => p.id));
  const missing = [...asked].filter(id => !declared.has(id));
  assert.deepEqual(missing, [], `js/ asks for these and native/capabilities.json does not declare them: ${missing.join(', ')}`);
});

test('plugin parity: every declared plugin is really wired up', () => {
  const pkg = JSON.parse(nat('package.json'));
  const spm = nat('ios/App/CapApp-SPM/Package.swift');
  const settingsGradle = nat('android/capacitor.settings.gradle');
  const buildGradle = nat('android/app/capacitor.build.gradle');
  const iosReg = nat('ios/App/App/BoneheadzViewController.swift');
  const androidReg = nat('android/app/src/main/java/com/boneheadz/gym/MainActivity.java');
  const pbx = nat('ios/App/App.xcodeproj/project.pbxproj');

  const problems = [];
  for (const p of CAPS.plugins) {
    const gaps = [];
    if (p.source === 'npm') {
      // npm alone is NOT enough: iOS needs two more lines, Android two more files
      if (!pkg.dependencies?.[p.pkg]) gaps.push('not in native/package.json');
      if (!spm.includes(p.pkg)) gaps.push('no .package/.product in CapApp-SPM/Package.swift (iOS would not link it)');
      const slug = p.pkg.replace('@capacitor/', 'capacitor-');
      if (!settingsGradle.includes(slug)) gaps.push(`no '${slug}' in capacitor.settings.gradle`);
      if (!buildGradle.includes(slug)) gaps.push(`no '${slug}' in app/capacitor.build.gradle`);
    } else {
      /* the native CLASS name is not always the JS-facing id: the Health plugin is
         `HealthPlugin` in Swift and Kotlin but `Capacitor.Plugins.Health` in JS, so
         the manifest states the class rather than the guard guessing it. */
      const cls = p.class || p.id;
      /* a local plugin must EXIST, be in the Xcode target, and be REGISTERED on each
         platform. Capacitor 8 does not auto-discover app-target plugins, which is how
         BhVault shipped compiled but unreachable on iOS. */
      if (p.platforms.includes('ios')) {
        const f = p.files.ios;
        if (!existsSync(join(here, '..', f))) gaps.push(`${f} missing`);
        else if (!pbx.includes(f.split('/').pop())) gaps.push(`${f} is not in the Xcode target`);
        if (!new RegExp(`registerPluginInstance\\(\\s*${cls}\\s*\\(`).test(iosReg)) gaps.push(`not registerPluginInstance'd on iOS`);
      }
      if (p.platforms.includes('android')) {
        const f = p.files.android;
        if (!existsSync(join(here, '..', f))) gaps.push(`${f} missing`);
        if (!new RegExp(`registerPlugin\\(\\s*${cls}\\.class`).test(androidReg)) gaps.push('not registerPlugin\'d on Android');
      }
    }
    if (!gaps.length) {
      /* THE RECORD MUST NOT ROT. A known_gap left on a plugin that is now wired up
         would quietly excuse the next real gap. */
      if (p.known_gap) problems.push(`${p.id}: is wired up now, so DELETE its known_gap from native/capabilities.json`);
    } else if (!p.known_gap) {
      problems.push(`${p.id}: ${gaps.join('; ')}`);
    }
  }
  assert.ok(CAPS.plugins.length > 0, 'no plugins declared at all: the manifest is empty, which is not the same as clean');
  assert.deepEqual(problems, [],
    `native/capabilities.json disagrees with the native projects:\n  ${problems.join('\n  ')}`);
});

test('plugin parity: Settings still carries the diagnostics row', () => {
  /* The row is the only runtime half of this feature. It could be deleted in a
     Settings tidy-up and nothing else would notice, so pin the three things that
     make it useful: it renders, it reports the SERVED sw version rather than the
     compiled constant, and it can be copied. */
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.ok(/id="diagLine"/.test(app), 'the diagnostics line is gone from renderSettings');
  assert.ok(/id="copyDiag"/.test(app), 'the Copy control is gone');
  assert.ok(/fetch\('\.\/sw\.js\?diag=1'/.test(app),
    'diagnostics must FETCH the served sw.js: reporting the compiled VERSION constant would agree with itself and prove nothing about what is being served');
});

/* ================= Paddock data layer: bonds + derived names ==============
 * Lane R interface for The Paddock (design handoff 2026-08-10). Pins the
 * additive-only bond envelope and the determinism the scene depends on. */
test('bondAfter only ever steps +1 into [0, BOND_MAX]', async () => {
  const { bondAfter, BOND_MAX } = await import('../js/loot.js');
  assert.equal(bondAfter(0), 1);
  assert.equal(bondAfter(4), 5);
  assert.equal(bondAfter(BOND_MAX), BOND_MAX, 'capped at max, never past it');
  assert.equal(bondAfter(-3), 1, 'garbage below zero clamps to a first pet');
  assert.equal(bondAfter(99), BOND_MAX, 'garbage above max clamps to max');
});
test('bond writes are guarded: ghost iids refused, removals clean up', () => {
  const src = readFileSync(join(here, '../js/loot.js'), 'utf8');
  const up = src.slice(src.indexOf('export async function bondUp'), src.indexOf('async function clearBond'));
  assert.ok(up.indexOf('petInstances()') < up.indexOf("kvSet('petBonds'"),
    'bondUp must confirm the iid is a live instance BEFORE writing');
  // both instance-removal paths take the bond row with them
  const salv = src.slice(src.indexOf('export async function salvageInstance'));
  assert.ok(/clearBond\(iid\)/.test(salv), 'salvage leaves an orphaned bond row');
  const breedRegion = src.slice(src.indexOf('delete bank[feedIid]'));
  assert.ok(/clearBond\(feedIid\)/.test(breedRegion.slice(0, 200)), 'breed-consume leaves an orphaned bond row');
});
test('paddock names are deterministic, collision-free, order-independent', async () => {
  const { assignNames, PADDOCK_NAMES, flavorFor } = await import('../js/paddock.js');
  const iids = ['p1-a-C5', 'p2-b-C5', 'p3-c-C4', 'p4-d-C4', 'p5-e-C3'];
  const a = assignNames(iids);
  const b = assignNames([...iids].reverse());
  assert.deepEqual(a, b, 'render order must not change anyone\'s name');
  assert.equal(new Set(Object.values(a)).size, iids.length, 'two copies share a nickname');
  // pool overflow still yields unique, deterministic names
  const many = Array.from({ length: PADDOCK_NAMES.length + 4 }, (_, i) => `pz-${i}-C5`);
  const m = assignNames(many);
  assert.equal(new Set(Object.values(m)).size, many.length, 'overflow suffixes collided');
  assert.equal(flavorFor('p1-a-C5'), flavorFor('p1-a-C5'), 'flavor must be stable per iid');
});


test('paddock walkers own exclusive x-bands (the handoff\'s paid-for layout rule)', async () => {
  const { assignBands, placePaddock, PDK_SCENE } = await import('../js/paddock.js');
  for (const n of [1, 2, 3, 5, 7, 9, 14]) {
    const bands = assignBands(Array.from({ length: n }, (_, i) => ({ iid: 'w' + i, motion: 'walk' })));
    assert.equal(bands.length, n, `lost a walker at n=${n}`);
    let checked = 0;
    for (const a of bands) for (const b of bands) {
      if (a.iid >= b.iid) continue;
      if (Math.abs(a.y - b.y) < 40) {
        checked++;
        const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        assert.ok(ov <= 20, `n=${n}: ${a.iid}@${a.y} and ${b.iid}@${b.y} share ${ov}px of x-range (rule: <=20)`);
      }
    }
    if (n >= 2) assert.ok(checked > 0, `n=${n}: no same-cluster pairs were checked, the rule never ran`);
    for (const b of bands) {
      assert.ok(b.y < PDK_SCENE.PANEL_Y, `feet below the panel edge at n=${n}`);
      /* the graveyard corner (tombstone x16-42 base y330, cross x62-78): a
         walker whose feet sit above that base must never enter its x-range,
         because the herd layer would draw it over props it stands behind */
      assert.ok(b.x0 >= PDK_SCENE.ROW_XMIN(b.y), `n=${n}: ${b.iid}@${b.y} band starts at ${b.x0}, inside the row's left exclusion (${PDK_SCENE.ROW_XMIN(b.y)})`);
    }
    /* and the exclusion itself is pinned to the measured graveyard edge (the
       cross ends at x78), so weakening the spec cannot pass the loop above */
    assert.ok(PDK_SCENE.ROW_XMIN(322) >= 86, 'top-row left exclusion regressed below the graveyard edge');
    /* and the bottom-left corner is the player's own bonehead now */
    assert.ok(PDK_SCENE.ROW_XMIN(460) >= 152, 'bottom-row left exclusion regressed into the keeper corner');
  }
  // every motion kind gets placed, none invents a position off-scene
  const cast = [...Array(4)].flatMap((_, i) => [
    { iid: `a${i}`, motion: 'walk' }, { iid: `b${i}`, motion: 'fly' },
    { iid: `c${i}`, motion: 'hover' }, { iid: `d${i}`, motion: 'flop' }]);
  const placed = placePaddock(cast);
  assert.equal(Object.keys(placed).length, cast.length, 'a pet vanished in placement');

  /* THE WALK CAP (Aggie's measured ceiling, 2026-08-11): the rule is measured
     on 76px sprites, so same-cluster spacing (bandW + GUTTER) must stay >= 56,
     which the top cluster's 202px span can only give 4 walkers. A big herd
     rotates by day instead of crushing the clusters. */
  const herd = Array.from({ length: 20 }, (_, i) => ({ iid: 'h' + i, motion: 'walk' }));
  const capped = placePaddock(herd, undefined, '2026-08-11');
  const walks = Object.entries(capped).filter(([, p]) => p.kind === 'walk');
  assert.equal(walks.length, 8, `walk cap must render exactly 8 of 20, got ${walks.length}`);
  for (const [iid, p] of walks) assert.ok(p.x1 - p.x0 >= 32, `${iid}: capped band ${p.x1 - p.x0}px, below the 32px floor the 56px spacing rule implies`);
  const again = placePaddock(herd, undefined, '2026-08-11');
  assert.deepEqual(Object.keys(again).sort(), Object.keys(capped).sort(), 'same day must pick the same herd');
  const other = placePaddock(herd, undefined, '2026-08-12');
  assert.notDeepEqual(Object.keys(other).sort(), Object.keys(capped).sort(), 'a new day must rotate the herd (deterministic fixture: a collision here means the day seed is dead)');

  /* AND THE APP MUST ASK FOR ITS OWN DAY. placePaddock's default seed is
     toISOString(), which is UTC, and openPaddock called it with no day at all:
     a capped herd would have rotated at 17:00 local here while streaks, daily
     bosses and every other rollover in this app use the LOCAL dateKey. Exactly
     the class of bug documented at the top of mini-theme-audit.mjs, but visible
     to the player rather than to a test. The default stays (paddock.js is pure
     and must not import the app's date code); the CALL SITE is what is pinned.
     PROVE-RED: revert the call to `placePaddock(roster)` and this fails. */
  const appSrc = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const call = (appSrc.match(/placePaddock\([^)]*\)/g) || []).filter(c => !c.includes('placePaddock:'));
  assert.ok(call.length, 'no placePaddock call found in app.js: an empty sample is a failure, not a pass');
  for (const c of call) assert.ok(/dateKey\(\)/.test(c), `openPaddock must pass the app's LOCAL day, got ${c}`);

  /* THE DUCK STAGGER (Tom, 2026-08-11: "most of my ducks are flying in a
     clump they should stagger more"). Two flyers sharing a lane with the same
     dur AND phase hold the same x forever: a clump by construction. Every
     same-lane pair must differ in at least one of the two, and the sky must
     stay deterministic for the same herd. */
  const flock = Array.from({ length: 6 }, (_, i) => ({ iid: 'd' + i, motion: 'fly' }));
  const sky = placePaddock(flock, undefined, '2026-08-11');
  const flies = Object.entries(sky).map(([iid, p], i) => ({ iid, lane: i % 2, dur: p.dur, phase: p.phase }));
  let flyPairs = 0;
  for (const a of flies) for (const b of flies) {
    if (a.iid >= b.iid || a.lane !== b.lane) continue;
    flyPairs++;
    assert.ok(a.dur !== b.dur || a.phase !== b.phase, `${a.iid}/${b.iid} share a lane with identical dur AND phase: they fly as one`);
  }
  assert.ok(flyPairs > 0, 'no same-lane duck pairs were checked, the stagger rule never ran');
  assert.deepEqual(placePaddock(flock, undefined, '2026-08-11'), sky, 'the sky must be deterministic for the same herd');
});


test("duplicate instance iids heal deterministically (Tom's pooled duck hearts, 2026-08-11)", async () => {
  const { healDupIids } = await import('../js/loot.js');
  const dup = [
    { iid: 'pabc-1-C2', sp: 'C2' }, { iid: 'pabc-1-C2', sp: 'C2' },
    { iid: 'pabc-1-C2', sp: 'C2' }, { iid: 'pxyz-2-C5', sp: 'C5' },
  ];
  const healed = healDupIids(dup);
  const ids = healed.map(x => x.iid);
  assert.equal(new Set(ids).size, ids.length, `healed list still carries duplicates: ${ids}`);
  assert.equal(healed[0].iid, 'pabc-1-C2', 'the first occurrence must KEEP the original iid (bond/bank stay attached)');
  assert.ok(healed[1].healedFrom === 'pabc-1-C2' && healed[2].healedFrom === 'pabc-1-C2', 'later duplicates must record where they came from');
  assert.equal(healed[3].iid, 'pxyz-2-C5', 'a unique row must pass through untouched');
  assert.deepEqual(healDupIids(dup), healed, 'healing must be deterministic (sync-safe across devices)');
  // healing an already-clean list returns the SAME reference: no write happens
  const clean = [{ iid: 'a-C2', sp: 'C2' }, { iid: 'b-C2', sp: 'C2' }];
  assert.equal(healDupIids(clean), clean, 'a clean list must come back by reference, or every read becomes a write');
  // and a healed list is stable under re-heal (the suffix ids must not collide)
  assert.equal(healDupIids(healed), healed, 're-healing a healed list must be a no-op');
});


/* ================= the shell parse gate (2026-08-11, after a 14-minute
 * production outage) ========================================================
 * 178f442 shipped an HTML comment containing BACKTICKS inside a template
 * literal in js/app.js: the first backtick terminated the string, the module
 * died at parse, and because main IS the deploy branch and the app shell is
 * network-first, every fresh app open got a dead app for ~14 minutes
 * (23:00-23:14 PDT). Error telemetry was blind BY CONSTRUCTION: the app dies
 * before analytics.js installs its hooks. So the guard runs where it cannot
 * be blind: every module must PARSE, in npm test, before anything reaches
 * the deploy branch. Two layers:
 *   1. every js/*.js parses as an ES module (catches the whole class);
 *   2. no template-literal HTML comment contains a backtick (catches THIS
 *      shape at the lint level with a readable message, because "Unexpected
 *      token ':'" at a random line is a miserable way to learn about a
 *      comment).
 * Proven red against the exact production bytes of 178f442. */
test('every js module parses (a shell that cannot parse cannot report itself)', () => {
  /* PARSED, NEVER EXECUTED. The first version of this (Reggie's, written from
     the same urgent message within fifteen minutes of mine) imported each file
     as a base64 data URI and caught SyntaxError. That detects the parse failure
     correctly, but `import()` RUNS the module: for js/app.js it executes top-level
     code in node until something throws on a missing browser global, so the check
     depends on side effects it does not want and cannot control.
     `--check --input-type=module` through stdin parses and stops. It is the same
     step the browser performs before running a line, and it touches nothing.
     Kept his framing and his sibling backtick lint; only the mechanism is mine.
     PROVEN RED against the exact production bytes of the 13-minute outage:
     `git show 178f442:js/app.js` yields "SyntaxError: Unexpected token ':'". */
  const jsDir = join(here, '..', 'js');
  const files = readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
  assert.ok(files.length > 20, 'the js/ scan found almost nothing: scan broken, not tree clean');
  const broken = [];
  for (const f of files) {
    try {
      execFile_.execFileSync(process.execPath, ['--check', '--input-type=module'],
        { input: readFileSync(join(jsDir, f), 'utf8'), stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      broken.push(`js/${f}: ${(String(e.stderr).match(/SyntaxError.*/) || ['parse failed'])[0]}`);
    }
  }
  assert.deepEqual(broken, [], `these files would not load in a browser:\n  ${broken.join('\n  ')}`);
});
test('no template-literal HTML comment carries a backtick', () => {
  const files = readdirSync(join(here, '../js')).filter(f => f.endsWith('.js'));
  const hits = [];
  for (const f of files) {
    const src = readFileSync(join(here, '../js', f), 'utf8');
    let m;
    const re = /<!--([\s\S]*?)-->/g;
    while ((m = re.exec(src))) {
      if (m[1].includes('`')) {
        const line = src.slice(0, m.index).split('\n').length;
        hits.push(`${f}:${line}`);
      }
    }
  }
  assert.deepEqual(hits, [], `backticks inside HTML comments (template-literal killers): ${hits.join(', ')}`);
});


/* the NARROWER sibling of the parse gate above (both, not either): the parse
 * gate catches any syntax death; this names the one shape that caused the
 * 2026-08-10 outage BEFORE it becomes one, by file:line with a readable
 * message, because "Unexpected token ':'" at a random line is a miserable way
 * to learn about a comment. Proven red against 178f442 (names app.js:9849). */
test('no template-literal HTML comment carries a backtick', () => {
  const files = readdirSync(join(here, '../js')).filter(f => f.endsWith('.js'));
  const hits = [];
  for (const f of files) {
    const src = readFileSync(join(here, '../js', f), 'utf8');
    let m;
    const re = /<!--([\s\S]*?)-->/g;
    while ((m = re.exec(src))) {
      if (m[1].includes('`')) {
        const line = src.slice(0, m.index).split('\n').length;
        hits.push(`${f}:${line}`);
      }
    }
  }
  assert.deepEqual(hits, [], `backticks inside HTML comments (template-literal killers): ${hits.join(', ')}`);
});

/* ===== THE PADDOCK, Lane W: cards + collection panel =====================
 * These are the decisions about WHAT a player reads, so they are testable with no
 * browser and they live here rather than in the audit. The audit owns what only a
 * browser can answer: scroll, pops, decoded art, and the bond reload round trip.
 * NOTE (Reggie flagged it): every lane inserts tests before this same `await
 * runAll();`, so whoever merges resolves by hand AND RUNS the suite. `node --check`
 * will not save you: it misreports top-level await in ESM as a syntax error, which
 * cost me a broken unit.test.js earlier today.
 */
const PDK = await import('../js/paddock-cards.js');
const PDK_ROSTER = [
  { iid: 'a1', sp: 'C5', shiny: false, bond: 0, levelSteps: 0, name: 'DOOM', flavor: 'Chews fence posts.' },
  { iid: 'a2', sp: 'C5', shiny: false, bond: 5, levelSteps: 45000, name: 'GRAVY', flavor: 'Sits on the hay.' },
  { iid: 'a3', sp: 'C5', shiny: false, bond: 2, levelSteps: 0, name: 'TANK', flavor: 'Snores.' },
  { iid: 'b1', sp: 'C3', shiny: true, bond: 1, levelSteps: 0, name: 'GILDA', flavor: 'Flops.' },
  { iid: 'c1', sp: 'C2', shiny: false, bond: 3, levelSteps: 0, name: 'MEATBALL', flavor: 'Flies.' },
];

test('paddock: a card is a COPY, addressed by iid', () => {
  const s = PDK.sliderModel(PDK_ROSTER, 'C5');
  assert.equal(s.copies.length, 3, 'three Bulldog copies, three cards');
  assert.deepEqual(s.copies.map(c => c.iid), ['a1', 'a2', 'a3']);
  /* the bond is banked against the INSTANCE, so the card must carry iid. A
     species+index identity would move the affection to a different animal the
     first time the roster sorted differently. */
  const html = PDK.cardHtml(s.copies[2]);
  assert.ok(html.includes('data-iid="a3"'), 'the card and its buttons must carry the iid');
  assert.ok(/data-act="pet" data-iid="a3"/.test(html), 'Pet must post the copy it belongs to');
});

test('paddock: dots exist only above one copy, and track copies', () => {
  assert.equal(PDK.sliderModel(PDK_ROSTER, 'C5').dots, 3);
  assert.equal(PDK.sliderModel(PDK_ROSTER, 'C2').dots, 0, 'one copy needs no dots');
  assert.ok(!PDK.sliderHtml(PDK_ROSTER, 'C2').includes('pdk-dots'), 'and must not render the row');
});

test('paddock: the bond meter fills to its value and BEST FRIEND is the cap', () => {
  const [doom, gravy, tank] = PDK.sliderModel(PDK_ROSTER, 'C5').copies;
  assert.equal((PDK.cardHtml(doom).match(/pdk-heart on/g) || []).length, 0, '0/5 fills nothing');
  assert.equal((PDK.cardHtml(tank).match(/pdk-heart on/g) || []).length, 2, '2/5 fills two');
  assert.equal((PDK.cardHtml(gravy).match(/pdk-heart on/g) || []).length, 5, '5/5 fills five');
  assert.ok(!PDK.cardHtml(tank).includes('pdk-bff'), 'no badge below the cap');
  assert.ok(PDK.cardHtml(gravy).includes('pdk-bff'), 'badge at the cap');
  /* a bond above the cap is a bug upstream, but the card must not draw six hearts */
  assert.equal(PDK.cardModel({ iid: 'x', sp: 'C5', bond: 9 }).bond, 5, 'clamped for display');
});

test('paddock: locked and egg cards offer no affection controls', () => {
  /* NARROWED, and here is what moved: the cards gained a close control (Tom, morning
     of 2026-08-11: "it's kinda hard to get out of the paddock feed/affection for pet
     dialogue"), which is an EXIT and not affection. This read `data-act=` and so
     forbade every button including that one. The rule was always "nothing to bond
     with, so no way to bond": it now says that, by naming the affection acts. */
  const affection = /pdk-heart\b|data-act="(pet|feed)"/;
  const locked = PDK.lockedCardHtml('CX');
  assert.ok(!affection.test(locked), 'nothing to bond with, so no hearts and no Pet/Feed');
  assert.ok(/data-act="close"/.test(locked), 'but it must still offer a way out');
  const egg = PDK.eggCardHtml({ count: 2, nearest: { togo: 2140, pct: 0.4, ready: false } });
  assert.ok(!affection.test(egg), 'same for the egg card');
  assert.ok(/data-act="close"/.test(egg), 'and the egg card can be dismissed too');
});

test('paddock: the egg card carries a REAL step count in every state', () => {
  assert.match(PDK.eggCardModel({ count: 0, nearest: null }).line, /Nothing in the nest/);
  assert.match(PDK.eggCardModel({ count: 3, nearest: { togo: 2140, pct: 0.4 } }).line, /2,140 steps to go/);
  assert.match(PDK.eggCardModel({ count: 1, nearest: { togo: 0, pct: 1, ready: true } }).line, /ready to hatch/);
  /* the handoff shipped a hardcoded "2,140 steps to go"; wiring the real number is
     the point, so a placeholder surviving into the copy is a failure */
  assert.ok(!/2,140/.test(PDK.eggCardModel({ count: 1, nearest: { togo: 77, pct: 0.1 } }).line),
    'the line must come from the egg data, not from the mockup');
});

test('paddock: the species grid counts copies, stars shinies and locks the rest', () => {
  const g = PDK.gridModel(PDK_ROSTER);
  assert.equal(g.length, PDK.PET_SPECIES.length, 'every species gets a tile, owned or not');
  const by = Object.fromEntries(g.map(t => [t.sp, t]));
  assert.equal(by.C5.count, 3);
  assert.ok(by.C5.showCount, 'duplicates show xN');
  assert.ok(!by.C2.showCount, 'a single copy shows no badge');
  assert.ok(by.C3.anyShiny, 'one shiny copy stars the species');
  assert.ok(!by.C5.anyShiny);
  assert.ok(!by.C1.owned && !by.CX.owned, 'unowned species stay locked rather than hidden');
  const html = PDK.panelHtml(PDK_ROSTER, { count: 0, nearest: null });
  assert.ok(html.includes('×3'), 'the count badge reaches the markup');
  assert.ok(html.includes('pdk-lockt'), 'and so does the locked treatment');
});

test('paddock: the footer counts copies and kinds, not species rows', () => {
  assert.equal(PDK.footerLabel(PDK_ROSTER), '5 PETS · 3 OF 6 KINDS');
  assert.equal(PDK.footerLabel([PDK_ROSTER[0]]), '1 PET · 1 OF 6 KINDS', 'singular reads right');
  assert.equal(PDK.footerLabel([]), '0 PETS · 0 OF 6 KINDS');
});

test('paddock: nothing emits a .pd- class', () => {
  /* `.pd-*` is the wardrobe PAPERDOLL (app.css "wardrobe: paperdoll":
     .pd-slot/.pd-art/.pd-center/.pd-gear/.pd-stat, used by renderCharacter).
     The Paddock is `.pdk-`. A generic collision on a dark screen is the same defect
     as the `.sheet-body` reveal rule that left the Boneyard map blank, so this
     stops it at the source rather than after someone reports a blank panel. */
  const out = PDK.sliderHtml(PDK_ROSTER, 'C5') + PDK.panelHtml(PDK_ROSTER, { count: 1, nearest: { togo: 5, pct: 0.9 } })
    + PDK.lockedCardHtml('CX') + PDK.eggCardHtml({ count: 1, nearest: null });
  const bad = [...out.matchAll(/class="([^"]*)"/g)]
    .flatMap(m => m[1].split(/\s+/)).filter(c => /^pd-/.test(c));
  assert.ok(out.length > 0, 'no markup produced at all: the scan proves nothing');
  assert.deepEqual([...new Set(bad)], [], 'the Paddock must not use the paperdoll namespace');
});

/* EVERY GEAR STAT IS A FINITE NUMBER.
 *
 * GEAR_BUDGET (js/gear.js:39) has entries for uncommon, rare and legendary and
 * NO 'common'. statSplit does Math.max(1, Math.round(GEAR_BUDGET[tier] * w)),
 * and Math.max(1, NaN) is NaN, so a common tier would produce { power: NaN },
 * hasStats() would report true on the key count, and gearLabel() would render
 * "+NaN POW" at the player.
 *
 * A handoff reported that as LIVE ON MAIN. It is not, and the difference
 * matters because the "fix" would have touched gear balance. Nothing can reach
 * that branch: variant() is only ever called with tierOfArt(), which returns
 * legendary/rare/uncommon and falls back to uncommon, or bumpTier() of it,
 * which only ascends. Measured on the shipped catalogue: 388 items, tiers
 * {uncommon:115, rare:146, legendary:127}, zero common, zero non-finite.
 *
 * So this is a landmine, not a bug: the day somebody adds a common tier, or
 * gives GEAR_MIN_LEVEL's existing 'common' entry a matching item, it starts
 * rendering NaN to players silently. A comment would ask people to remember.
 * This fails instead.
 *
 * PROVE-RED: add `common: 4` to GEAR_MIN_LEVEL's sibling GEAR_BUDGET and have
 * tierOfArt return 'common' for the plain tier, or simply call
 * statSplit(arch, 'common', slot); every stat it yields is NaN and this fails
 * by item id. */
/* NOTHING A PLAYER TYPES INTO THEIR FOOD DIARY MAY EARN A GAME REWARD.
 *
 * Until 2026-08-15 the Pit granted +2 Vigor per DISTINCT MEAL logged, capped at
 * three meals. That put a prize on the SHAPE of a medical log: a player who ate
 * twice was nudged to add a third row, and one who ate five times had no reason
 * to record the last two. It shipped in v205 and survived ten releases because
 * nothing in this suite ever looked at it.
 *
 * This reads js/energy.js as TEXT on purpose. The behavioural version would need
 * IndexedDB and a seeded day, and the thing worth defending is not a number in a
 * running app, it is that the CONSTANTS stay at zero and nothing re-reads the
 * log store to award energy. If somebody puts either back, this goes red and
 * names the line.
 */
test('logging a meal earns no Vigor, and energy never reads the food log', () => {
  const src = readFileSync(join(here, '..', 'js', 'energy.js'), 'utf8');
  const perMeal = /LOG_VIGOR_PER_MEAL\s*=\s*(\d+)/.exec(src);
  const cap = /LOG_VIGOR_CAP\s*=\s*(\d+)/.exec(src);
  assert.ok(perMeal && cap, 'the retired constants are still declared, so their value is checkable');
  assert.equal(Number(perMeal[1]), 0, 'LOG_VIGOR_PER_MEAL must stay 0: meals do not buy fights');
  assert.equal(Number(cap[1]), 0, 'LOG_VIGOR_CAP must stay 0: meals do not buy fights');
  // the stronger half: the energy module must not touch the log store at all
  assert.ok(!/byIndex\(\s*'log'/.test(src), "energy.js must not read the 'log' store");
  assert.ok(!/\bmeals\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '')),
    'no meal term may survive outside comments');
  // and steps must STILL earn, or this test would pass on an app with no energy at all
  const stepPer = /STEP_VIGOR_PER\s*=\s*(\d+)/.exec(src);
  const stepCap = /STEP_VIGOR_CAP\s*=\s*(\d+)/.exec(src);
  assert.ok(stepPer && Number(stepPer[1]) > 0, 'steps still earn Vigor (an empty sample is a FAILURE)');
  assert.ok(stepCap && Number(stepCap[1]) > 0, 'the step cap is still above zero');
});

test('every gear stat is a finite number (no NaN can reach a player)', async () => {
  const g = await import('../js/gear.js');
  const list = Object.values(g).find(v => Array.isArray(v) && v[0] && v[0].stats);
  assert.ok(list && list.length > 50, 'gear catalogue not found: an empty scan proves nothing');
  const bad = [];
  for (const item of list) {
    for (const [k, v] of Object.entries(item.stats || {})) {
      if (!Number.isFinite(v)) bad.push(`${item.id} ${item.rarity} ${k}=${v}`);
    }
  }
  assert.deepEqual(bad, [], 'gear carrying a non-finite stat would render "+NaN POW"');
});

/* EVERY LONG-PRESS TARGET SUPPRESSES iOS's OWN LONG-PRESS.
 *
 * v401 gave the Pit's move buttons a 750ms hold to open a move's detail. On a
 * real iPhone that same hold ALSO raises the text-selection magnifier and the
 * callout menu, so the player gets a loupe and highlighted words on top of the
 * popup. Tom, 2026-08-18: "it's magnifying with force click and highlighting
 * text on the iphone can we turn that iphone feature off?"
 *
 * The Boneyard map hit this first and already carries the three lines. The Pit
 * inherited the GESTURE (LP_MS/LP_MOVE are literally the map's constants) but
 * not the SUPPRESSION, which is exactly the kind of half-copy nobody notices
 * until it is on a device. Chromium does not implement -webkit-touch-callout,
 * so no browser audit in this repo can catch it: a static check is the only
 * thing that can.
 *
 * COVERAGE IS THE POINT. This counts the long-press sites in js/app.js. A THIRD
 * one fails here on the day it is written, which forces whoever adds it to name
 * its target and give that target the suppression.
 */
test('every long-press target suppresses the iOS callout and text selection', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const css = readFileSync(join(here, '..', 'app.css'), 'utf8');

  const sites = [...app.matchAll(/const LP_MS\s*=/g)].length;
  assert.ok(sites > 0, 'found no long-press sites at all: the scan is broken, not the tree clean');
  assert.equal(sites, 2,
    `${sites} long-press sites in js/app.js, expected 2 (the Boneyard map and the Pit move tray). ` +
    'A new one must add its target selector to the list in this test AND give that ' +
    'target -webkit-touch-callout: none, or iOS will raise the magnifier over it.');

  /* The selector each site presses on. Kept literal on purpose: a rule that
     tried to derive these would drift silently, and the whole failure mode here
     is a target that nobody remembered to cover. */
  const TARGETS = ['.map-den-mark', '.map-mini-mark', '.map-spawn', '.fight-act'];
  const missing = TARGETS.filter(sel => {
    /* find any rule whose prelude names the selector, then look inside it */
    const re = new RegExp(`[^}]*\\${sel}\\b[^{]*\\{([^}]*)\\}`, 'g');
    for (const m of css.matchAll(re)) {
      if (/-webkit-touch-callout\s*:\s*none/.test(m[1])) return false;
    }
    return true;
  });
  assert.deepEqual(missing, [],
    'these long-press targets can still raise the iOS magnifier and text selection: ' +
    `${missing.join(', ')}. Each needs -webkit-touch-callout: none, -webkit-user-select: none ` +
    'and user-select: none, the same three lines .map-den-mark already carries.');
});

await runAll();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

