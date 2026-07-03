// Node unit tests: node tests/unit.test.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

import {
  computeTargets, nutrientsFor, portionLabel, dayTotals, kcalConsistent,
  dateKey, addDays, streakFrom, weightTrend, trendRatePerWeek,
  lbToKg, kgToLb, ftInToCm, cmToFtIn, mealForHour,
} from '../js/nutrition.js';
import { parseNutritionText } from '../js/labelparse.js';
import { mapOffProduct, mapFdcFood, rankFdcResults, fetchOffProduct } from '../js/sources.js';
import { GENERIC_FOODS, searchFoods } from '../data/generic-foods.js';
import { xpForLevel, levelFor, badgeCheck, parseHkPayload, LEVEL_NAMES, BADGES } from '../js/game.js';
import { dailyQuests, questState, weekKeyOf, weekDates, QUEST_POOL } from '../js/quests.js';
import { RARITIES, RARITY_ORDER, CRATES, SHOP } from '../js/loot.js';
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
test('daily quests: deterministic, three distinct, hk-gated', () => {
  const a = dailyQuests('2026-07-03', { hkConnected: true });
  const b = dailyQuests('2026-07-03', { hkConnected: true });
  assert.deepEqual(a.map(q => q.id), b.map(q => q.id));
  assert.equal(new Set(a.map(q => q.id)).size, 3);
  const noHk = dailyQuests('2026-07-03', { hkConnected: false });
  assert.ok(noHk.every(q => !q.needsHk));
  // rotation actually rotates across a week
  const week = new Set();
  for (let i = 0; i < 7; i++) dailyQuests(`2026-07-0${i + 1}`, { hkConnected: true }).forEach(q => week.add(q.id));
  assert.ok(week.size >= 6, String(week.size));
});
test('quest progress measures real data', () => {
  const q3 = QUEST_POOL.find(q => q.id === 'q-3meals');
  const ctx = { date: '2026-07-03', entries: [{ meal: 0 }, { meal: 1 }], xpRows: [], targets: { p: 180 }, priorFoodIds: new Set(), weighedToday: false };
  const st = questState(q3, ctx, []);
  assert.equal(st.cur, 2); assert.equal(st.target, 3); assert.ok(!st.done);
  const qp = QUEST_POOL.find(q => q.id === 'q-protein-half');
  const ctx2 = { ...ctx, entries: [{ meal: 0, p: 50 }, { meal: 1, p: 45 }, { meal: 2, p: 100 }] };
  const st2 = questState(qp, ctx2, []);
  assert.equal(st2.target, 90);
  assert.ok(st2.done, JSON.stringify(st2)); // 95g by lunch >= 90
  const claimed = questState(q3, ctx, [{ key: 'quest-2026-07-03-q-3meals' }]);
  assert.ok(claimed.claimed);
});
test('week helpers', () => {
  assert.equal(weekKeyOf('2026-07-03'), '2026-06-29'); // Friday -> Monday
  assert.equal(weekKeyOf('2026-06-29'), '2026-06-29');
  assert.equal(weekDates('2026-06-29').length, 7);
  assert.equal(weekDates('2026-06-29')[6], '2026-07-05');
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

// ---- bone road ----
const road = await import('../js/road.js');
test('road: thresholds ascend and stops sit on the map', () => {
  for (let i = 1; i < road.ROAD_STOPS.length; i++) {
    assert.ok(road.ROAD_STOPS[i].steps > road.ROAD_STOPS[i - 1].steps);
  }
  for (const s of road.ROAD_STOPS) {
    assert.ok(s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 100, s.n);
    assert.ok(s.reward.xp > 0);
  }
  assert.equal(road.CYCLE_STEPS, road.ROAD_STOPS[road.ROAD_STOPS.length - 1].steps);
});
test('road: state derivation and cycles', () => {
  const st = road.roadState(36053, new Set());
  assert.equal(st.cycle, 1);
  assert.equal(st.progress, 36053);
  assert.ok(st.stops[0].reached && !st.stops[0].claimed);
  assert.ok(!st.stops[1].reached);
  assert.equal(st.next.n, 'II');
  // claimed final stop rolls into lap 2 and progress restarts
  const lap2 = road.roadState(road.CYCLE_STEPS + 12000, new Set([road.roadKey(1, road.ROAD_STOPS.length - 1)]));
  assert.equal(lap2.cycle, 2);
  assert.equal(lap2.progress, 12000);
  assert.ok(!lap2.stops[0].reached);
});
test('road: traveler interpolates within bounds', () => {
  const p0 = road.travelerPos(0);
  const pMid = road.travelerPos(35000);
  const pEnd = road.travelerPos(road.CYCLE_STEPS + 999);
  for (const p of [p0, pMid, pEnd]) {
    assert.ok(p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100, JSON.stringify(p));
  }
  assert.ok(pMid.y > p0.y); // moving down the map
  approx(pEnd.x, road.ROAD_STOPS[road.ROAD_STOPS.length - 1].x, 0.01);
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
  assert.ok(a.length >= 3 && a.length <= 4);
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
  assert.ok(near.length > 0 && near.length <= 9);
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
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
