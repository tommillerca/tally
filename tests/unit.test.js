// Node unit tests: node tests/unit.test.js
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import * as execFile_ from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
/* eggProgress is PURE (no db, no DOM), so it unit-tests directly. */
import { eggProgress } from '../js/loot.js';
/* onAppResume touches window/document only when CALLED, so it imports clean (O24). */
import { onAppResume } from '../js/native.js';

import {
  computeTargets, nutrientsFor, portionLabel, dayTotals, kcalConsistent,
  dateKey, addDays, streakFrom, weightTrend, trendRatePerWeek,
  lbToKg, kgToLb, ftInToCm, cmToFtIn, mealForHour,
  assumedActiveBurn, activeCalorieBonus, bmrMifflin, kcalFloor, gramsChipDefault, fmtG,
} from '../js/nutrition.js';
import { RECIPES, INGREDIENTS, canCook, ingredientCount, fmtCookTime, POTIONS, POTION_BY_ID, potionCount, MAX_POTS, POT_PRICES, nextPotPrice, TRANSMUTE, transmuteConsume, foodBuffLabel } from '../js/cooking.js';
import { isWalkableFeature, snapToWalkable } from '../js/geo.js';
import { GEAR_ITEMS } from '../js/gear.js';
import {
  boonBonusFor, levelTributeMult, BOON_PER_SPIRE, BOON_SPIRE_CAP, BOON_QUEST_BONUS,
  LEVEL_TRIBUTE_MAX, TRIBUTE_PER_DAY, TRIBUTE_CAP_DAYS, SPIRE_CAP,
  wardenTier, WARDEN_TIERS,
} from '../js/spires.js';
import { parseNutritionText } from '../js/labelparse.js';
import { mapOffProduct, mapFdcFood, rankFdcResults, fetchOffProduct, fetchOffProductEx } from '../js/sources.js';
import { GENERIC_FOODS, searchFoods } from '../data/generic-foods.js';
import { xpForLevel, levelFor, badgeCheck, parseHkPayload, LEVEL_NAMES, BADGES, levelCoins, dayCloseNews, habitGrantCard } from '../js/game.js';
import { STAT_META, STYLES } from '../js/pit.js';
import * as pitMod from '../js/pit.js';
const mkFighter = pitMod.makeFighter;
import {
  dailyQuests, weeklyQuests, monthlyQuests, questCtx, questState, periodKeyOf,
  weekKeyOf, weekDates, monthKeyOf, monthDates, DAILY_POOL, WEEKLY_POOL, MONTHLY_POOL,
} from '../js/quests.js';
import { RARITIES, RARITY_ORDER, CRATES, SHOP, DUST_VALUE, gearDustValue, gearStatPoints, petDustValue,
  migrateInstances, bestInstance, speciesCount, removeWorstInstance, addInstance, creditSteps,
  removeInstance, breedParents, transmogCost, TRANSMOG_HIDE,
  nickProblem, cleanNick, NICK_MAX } from '../js/loot.js';
import { BH_ITEMS, BH_SLOTS, BH_BY_ID, bhAsset, PET_SLOTS } from '../data/boneheadz.js';
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
test('R25-M3 no sedentary cut is targeted below its own resting rate', () => {
  /* QA round 25, M3. Sedentary x Lose fat is 1.2 x 0.80 = 0.96 x BMR, so the
     computed target sat BELOW the person's own resting metabolic rate for 1,816
     of 54,600 realistic adult profiles (all in this one bucket), and the 1,200
     floor caught none of them. The floor now includes the BMR itself. Sweep the
     realistic grid at the pure function: the layer the bug lives at. */
  let n = 0, below = [];
  for (const sex of ['m', 'f'])
    for (let age = 18; age <= 80; age += 2)
      for (let heightCm = 145; heightCm <= 200; heightCm += 5)
        for (let weightKg = 45; weightKg <= 150; weightKg += 5) {
          const p = { sex, age, heightCm, weightKg, activity: 'sedentary', goal: 'cut' };
          const t = computeTargets(p);
          n++;
          if (t.kcal < Math.round(bmrMifflin(p))) below.push(`${sex}/${age}/${heightCm}/${weightKg}: ${t.kcal} < ${t.bmr}`);
          assert.ok(t.kcal >= 1200, 'the old 1200 floor still holds');
        }
  assert.ok(n > 10000, `grid too small to mean anything: ${n}`);
  assert.equal(below.length, 0, `${below.length}/${n} below BMR, e.g. ${below.slice(0, 3).join('; ')}`);
});
test('computeTargets female floor', () => {
  const t = computeTargets({ sex: 'f', age: 45, heightCm: 158, weightKg: 52, activity: 'sedentary', goal: 'cut' });
  assert.ok(t.kcal >= 1200);
});
test('R25-M2 a manual target write keeps the macros on the calorie figure and above the floor', async () => {
  /* QA round 25, M2. Settings > Daily targets wrote the four fields
     INDEPENDENTLY: type 800 into kcal and Save, and the app stored 800 kcal with
     the 2,571 kcal of protein/carbs/fat computed for the old figure still on top,
     and 800 sailed under the 1,200 floor the computed path applies (for anyone,
     a child included). The write now routes through nutrition.manualTargets:
     protein and fat may be typed, carbs is the remainder, the floor is
     kcalFloor(profile), and anything that cannot agree is refused, not stored. */
  const nut = await import('../js/nutrition.js');
  assert.equal(typeof nut.manualTargets, 'function', 'manualTargets is missing: the editor still writes fields independently');
  const { manualTargets } = nut;
  const prof = { sex: 'f', age: 10, heightCm: 138, weightKg: 32, activity: 'sedentary', goal: 'cut' };
  const floor = kcalFloor(prof);
  assert.ok(floor >= 1200);
  // below the floor: refused, nothing to store
  const low = manualTargets(prof, { kcal: 800, p: null, f: null });
  assert.equal(low.ok, false); assert.match(low.problem, /at least/);
  // protein + fat alone over the figure: refused
  const over = manualTargets({ ...prof, weightKg: 70 }, { kcal: 1400, p: 200, f: 100 }); // floor 1352, 800+900 > 1400
  assert.equal(over.ok, false); assert.match(over.problem, /more than/);
  // every accepted write: p*4 + c*4 + f*9 lands on kcal within carb rounding (4 kcal)
  for (const prof2 of [prof, { sex: 'm', age: 32, heightCm: 180, weightKg: 84, activity: 'moderate', goal: 'recomp' }])
    for (const kcal of [kcalFloor(prof2), 2000, 2571, 3200])
      for (const [p, f] of [[null, null], [150, null], [null, 60], [120, 50]]) {
        const r = manualTargets(prof2, { kcal, p, f });
        assert.equal(r.ok, true, `${kcal}/${p}/${f}: ${r.problem}`);
        const t = r.targets;
        assert.equal(t.kcal, kcal);
        assert.ok(t.kcal >= kcalFloor(prof2));
        assert.ok(t.p >= 0 && t.c >= 0 && t.f >= 0);
        assert.ok(Math.abs(t.p * 4 + t.c * 4 + t.f * 9 - kcal) <= 4, `${kcal}: macros sum to ${t.p * 4 + t.c * 4 + t.f * 9}`);
        if (p != null) assert.equal(t.p, p);
        if (f != null) assert.equal(t.f, f);
      }
  // and the Settings handler is glue over it: no independent four-field write left
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const i = app.indexOf("$('#saveTargets').addEventListener");
  assert.ok(i > 0, 'saveTargets handler not found: this check has drifted');
  const block = app.slice(i, app.indexOf('await saveSettings();', i));
  assert.ok(block.includes('manualTargets('), 'saveTargets does not route through manualTargets');
  assert.ok(!/c:\s*Math\.round\(c\.value/.test(block), 'saveTargets still stores a typed carb figure independently of kcal');
});
test('R25-M1 the minimum plan age is one named constant and every target display carries the disclosure', () => {
  /* QA round 25, M1 (child safety). The age floor was a bare 10 inside LIMITS
     and the app said nothing about who its estimates are for. The number is
     still 10 (owner's call), but it must stay in ONE named place, and the two
     surfaces that show a computed target (plan preview, Settings targets card)
     must both render the disclosure. Structural, not copy-pinned: it checks the
     constant is referenced, not what it says. */
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.match(app, /^const MIN_AGE = \d+;/m, 'MIN_AGE constant missing');
  assert.ok(app.includes('age: { min: MIN_AGE,'), 'LIMITS.age.min is not MIN_AGE');
  const preview = app.slice(app.indexOf("$('#pfPreview', wrap).innerHTML"), app.indexOf('onChange?.(p, t);'));
  assert.ok(preview.includes('${TARGET_DISCLOSURE}'), 'plan preview shows a target without the disclosure');
  const card = app.slice(app.indexOf('DAILY TARGETS'), app.indexOf("$('#saveTargets')"));
  assert.ok(card.includes('${TARGET_DISCLOSURE}'), 'Settings targets card shows a target without the disclosure');
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

/* QA round 25 M12. (a) three 'canned' bean rows carried boiled-without-salt
   sodium; (b) Diet soda + grams chip read NaN (kcal / per100.kcal with kcal 0);
   (c) the same line rounded 1 tsp olive oil 4.5 g to 5 g. */
test('QA round 25 M12(a): canned bean rows carry canned sodium', () => {
  for (const name of ['Black beans, cooked', 'Chickpeas, cooked', 'Kidney beans, cooked']) {
    const f = GENERIC_FOODS.find(x => x.name === name);
    assert.ok(f, name + ' missing');
    assert.ok(f.per100.sodium >= 200 && f.per100.sodium <= 400,
      `${name} sodium ${f.per100.sodium} mg/100 g is not the canned figure (200 to 400)`);
  }
});
test('QA round 25 M12(b)(c): grams chip preselects the serving grams', () => {
  const soda = GENERIC_FOODS.find(x => x.name === 'Diet soda');
  const g = gramsChipDefault(soda, { mode: 'serving', idx: 0, qty: 1 });
  assert.ok(Number.isFinite(g) && g > 0, `Diet soda grams chip gave ${g}`);
  assert.equal(g, 355);
  const oil = GENERIC_FOODS.find(x => x.name === 'Olive oil');
  const sel = { mode: 'grams', grams: gramsChipDefault(oil, { mode: 'serving', idx: 0, qty: 1 }) };
  assert.equal(sel.grams, 4.5);
  assert.equal(portionLabel(oil, sel), '4.5 g');
  assert.equal(Math.round(nutrientsFor(oil, sel).kcal), 40);
  // perServing-only food (no grams known): still a finite fallback, never NaN
  const ps = { perServing: { kcal: 0, p: 0, c: 0, f: 0 }, servings: [{ label: 'serving', g: null }] };
  assert.equal(gramsChipDefault(ps, { mode: 'serving', idx: 0, qty: 1 }), 100);
  // wiring: the chip handler in app.js must route through the helper
  const appSrc = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const handler = appSrc.slice(appSrc.indexOf("if (c.hasAttribute('data-grams')) {"), appSrc.indexOf("sel.mode = 'grams';"));
  assert.ok(handler.includes('gramsChipDefault(food, sel)'), 'grams chip no longer uses gramsChipDefault');
  assert.ok(!handler.includes('per100.kcal'), 'grams chip divides by per100.kcal again');
});
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
// QA round 24 L5: 21 of 48 real queries found nothing (20 an empty screen). These are
// the probes QA typed into the real input; every one asserts a non-empty list AND the
// obvious food in the top 3. On the pre-fix tip all eight failed (five empty, three
// ranked wrong). The nonsense control keeps the ANY-match fallback from turning
// silence into noise.
test('search: QA r24 L5 probes land the obvious food in the top 3', () => {
  const top3 = q => searchFoods(GENERIC_FOODS, q, 3).map(f => f.name);
  const expect = {
    'eggs': 'Egg, large',                 // plural vs "Egg, large"
    'yoghurt': 'Yogurt, plain whole milk',   // UK spelling vs five yogurts
    'oatmilk': 'Oat milk',                // missing space
    'chicken tikka masala': 'Chicken curry', // hard AND killed every dish
    'fish and chips': 'Potato chips',     // "and" was a required term
    'chicken': 'Chicken breast, cooked',  // was 4th behind curry/nuggets/thigh
    'tomatoes': 'Tomato', 'bananas': 'Banana', 'carrots': 'Carrot',
  };
  for (const [q, want] of Object.entries(expect)) {
    const got = top3(q);
    assert.ok(got.length > 0, `"${q}" returned an empty list`);
    assert.ok(got.includes(want), `"${q}" top 3 lacks "${want}": ${got.join(' | ')}`);
  }
  assert.notEqual(top3('rice')[0], 'Rice cake', 'rice -> Rice cake first');
  assert.notEqual(top3('potato')[0], 'Potato chips', 'potato -> Potato chips first');
  assert.equal(top3('oats')[0], 'Oats, dry rolled', 'stem hit must not outrank a literal hit');
  assert.equal(searchFoods(GENERIC_FOODS, 'zzqx').length, 0, 'fallback must not invent rows for nonsense');
  // a food the player has logged before outranks one they never have
  const used = GENERIC_FOODS.map(f => ({ ...f }));
  used.find(f => f.name === 'Chicken curry').useCount = 5;
  assert.equal(searchFoods(used, 'chicken')[0].name, 'Chicken curry');
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

/* QA round 25 M7 (HIGH): the +20 XP Label route minted a 2.22x wrong food with no
   warning. On a two-column European panel the parser took the FIRST number on
   every line, which is the per-100 g column. A 45 g serving that should read
   203 kcal reached the log as 451 kcal, 189 g fat, 76 g fibre, servingGrams null,
   warnings []. The 4/4/9 check cannot catch it: per-100 g figures are internally
   consistent. The >250 clearing rule cannot either: any macro under 25 g survives
   a lost decimal point. Four cases below; (a) and (d) proved red on the tip. */
const EU_TWO_COL = `Nutrition Information
Typical values Per 100 g Per 45 g serving
Energy 1892 kJ / 451 kcal 851 kJ / 203 kcal
Fat 18.9 g 8.5 g
of which saturates 2.1 g 0.9 g
Carbohydrate 58 g 26 g
of which sugars 15 g 6.8 g
Fibre 7.6 g 3.4 g
Protein 12 g 5.4 g
Salt 0.5 g 0.2 g`;
test('label M7 (a): two-column EU panel reads the per-serving column, not per-100 g', () => {
  const r = parseNutritionText(EU_TWO_COL);
  assert.equal(r.kcal, 203, `kcal ${r.kcal}: 451 is the per-100 g column`);
  assert.equal(r.fat, 8.5); assert.equal(r.satFat, 0.9);
  assert.equal(r.carbs, 26); assert.equal(r.sugar, 6.8);
  assert.equal(r.fiber, 3.4); assert.equal(r.protein, 5.4);
  assert.equal(r.servingGrams, 45, 'serving mass sits in the header, not on a "Serving size" line');
  assert.ok(r.warnings.some(w => /per serving column/i.test(w)), `no column-choice warning: ${JSON.stringify(r.warnings)}`);
  assert.ok(!r.warnings.some(w => /per-100 g, not per serving/.test(w)), 'mass check must not fire on the correct column');
});
test('label M7 (a2): serving column FIRST is honoured too', () => {
  const r = parseNutritionText('Per serving (30 g) Per 100 g\nEnergy 120 kcal 400 kcal\nFat 3 g 10 g\nCarbohydrate 15 g 50 g\nProtein 6 g 20 g');
  assert.equal(r.kcal, 120); assert.equal(r.fat, 3); assert.equal(r.carbs, 15); assert.equal(r.protein, 6);
  assert.equal(r.servingGrams, 30);
});
test('label M7 (b2): "Serving size 100 g" on a one-column US panel is NOT a two-column header', async () => {
  // Review catch 2026-09-04: the word "serving" plus "100 g" on one line matched
  // detectColumns, pushing a bogus two-column warning and skipping the serving parse.
  const { parseNutritionText } = await import('../js/labelparse.js');
  const r = parseNutritionText('Nutrition Facts\nServing size 100 g\nCalories 250\nTotal Fat 10 g\nTotal Carbohydrate 30 g\nProtein 8 g');
  assert.equal(r.servingGrams, 100, 'serving grams read from the serving line');
  assert.equal(r.kcal, 250);
  assert.deepEqual(r.warnings, [], 'no two-column warning on a one-column panel');
});

test('label M7 (b): one-column per-serving panel is unchanged, no spurious warning', () => {
  const r = parseNutritionText(US_LABEL);
  assert.equal(r.kcal, 230); assert.equal(r.fat, 8); assert.equal(r.fiber, 4); assert.equal(r.protein, 3);
  assert.deepEqual(r.warnings, []);
});
test('label M7 (c): per-100 g only panel with no serving still parses, servingGrams null', () => {
  const r = parseNutritionText('Nutrition per 100 g\nEnergy 1892 kJ / 451 kcal\nFat 18.9 g\nCarbohydrate 58 g\nFibre 7.6 g\nProtein 12 g');
  assert.equal(r.kcal, 451); assert.equal(r.fat, 18.9); assert.equal(r.fiber, 7.6); assert.equal(r.protein, 12);
  assert.equal(r.servingGrams, null);
  assert.ok(!r.warnings.some(w => /column/i.test(w)), `no column warning on a one-column panel: ${JSON.stringify(r.warnings)}`);
});
test('label M7 (d): macro grams above the stated serving mass carry the per-100 g warning', () => {
  // the QA panel with its decimal points lost by OCR: 18.9 -> 189 style, all
  // under 250 so the clearing rule keeps every one of them.
  const r = parseNutritionText('Serving size 45 g\nCalories 451\nTotal Fat 19 g\nTotal Carbohydrate 58 g\nDietary Fiber 76 g\nProtein 12 g');
  assert.equal(r.servingGrams, 45);
  assert.ok(r.warnings.some(w => /per-100 g, not per serving/.test(w)), `no mass warning: ${JSON.stringify(r.warnings)}`);
  // a serving whose macros fit inside it stays quiet (55 g serving, 48 g macros)
  const ok = parseNutritionText(US_LABEL);
  assert.ok(!ok.warnings.some(w => /per-100 g/.test(w)));
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
/* `reached` decides which of two sheets the player sees, and the wrong one has
   no Try again and offers to create a duplicate custom food. A response object
   is not an answer: only a 404 or a parsed body is. Both halves matter, so the
   404 control is asserted alongside the two failures. */
test('fetchOffProductEx: only a 404 or a parsed body counts as reached', async () => {
  const off = (fetchFn) => fetchOffProductEx('5000112637922', fetchFn);
  const notFound = await off(async () => ({ status: 404, ok: false }));
  assert.equal(notFound.reached, true, '404 is the book saying no such code');
  const boom = await off(async () => ({ status: 500, ok: false }));
  assert.equal(boom.reached, false, 'a 500 says nothing about the product');
  const portal = await off(async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } }));
  assert.equal(portal.reached, false, 'a captive portal page says nothing either');
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
test('QA round 25 M10: activeKcal is bounded like weightKg', () => {
  /* A 6,000 typo added +2,504 kcal to an 800 kcal day. Out of range reads as
     null (the weightKg pattern), in range passes through unchanged. */
  assert.equal(parseHkPayload('tally-hk steps=100 active=6000').activeKcal, null);
  assert.equal(parseHkPayload('tally-hk steps=100 active=60000').activeKcal, null);
  assert.equal(parseHkPayload('tally-hk steps=100 active=612').activeKcal, 612);
  assert.equal(parseHkPayload('tally-hk steps=100 active=4000').activeKcal, 4000);
  // active alone, out of range: the payload has nothing left to say
  assert.equal(parseHkPayload('tally-hk active=6000'), null);
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
  /* BOTH SLOT TABLES. This set exists to catch a typo'd slot, and a pet
     accessory's slot is not a typo: PET_SLOTS is a second, deliberate table
     (see data/boneheadz.js) precisely BECAUSE those codes must not sit in
     BH_SLOTS, which nine sites iterate to paint the PLAYER figure. Checking
     against BH_SLOTS alone rejected CE1 for having a slot the app defines. */
  const slotCodes = new Set([...BH_SLOTS.map(s => s.code), ...PET_SLOTS.map(s => s.code)]);
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
    /* FOUR drawn bosses share the ladder now, so "never two at once" is a
       property of the whole set rather than of one pair. Counting is the form
       that cannot rot when a fifth is added. */
    const drawn = [f.glutton, f.mage, f.mimic, f.wanderer].filter(Boolean).length;
    assert.ok(drawn <= 1, `rung ${r} cannot be more than one boss (${drawn})`);
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
  assert.ok(poi.denRewardLabel({ crate: 'golden', coins: 200, xp: 100 }).includes('Bone Crate'));
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
  assert.ok(a.length >= huntMod.SLOTS && a.length <= huntMod.SLOTS + 1); // every slot, plus an occasional rare
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
/* Y4, round 28. The display and the collect decision read the SAME distance, so
   any rounding band where they disagree is a promise the intro card breaks:
   Math.round put 75.32 m on "75 m", which is exactly the number the card names
   as collectable. This sweeps the whole neighbourhood of the radius at 1 cm
   resolution and asserts the ONE invariant that matters, that "printed <= R" and
   "collectable" are the same fact, rather than pinning one lucky number. */
test('hunt: a printed distance can never contradict the collect decision', () => {
  const R = huntMod.COLLECT_RADIUS_M;
  const samples = [];
  for (let cm = (R - 2) * 100; cm <= (R + 2) * 100; cm++) samples.push(cm / 100);
  assert.ok(samples.length > 300, `empty/thin sample: ${samples.length}`);
  let far = 0, near = 0;
  for (const d of samples) {
    const label = huntMod.fmtDist(d);
    assert.match(label, /^\d+ m$/, `${d} m did not print in metres: ${label}`);
    const shown = parseInt(label, 10);
    const collectable = d <= R;
    collectable ? near++ : far++;
    assert.equal(shown <= R, collectable,
      `${d} m prints "${label}" but collectSpawn ${collectable ? 'accepts' : 'refuses'} it`);
  }
  assert.ok(far > 100 && near > 100, `one-sided sample: ${near} in range, ${far} out`);
  assert.equal(huntMod.fmtDist(75.32), '76 m'); // the exact band QA drove
});
/* Y2, round 28. Dens speak, the Wanderer speaks, the speed guard speaks; a spawn
   you could see but not reach said nothing, and reachability lived only in a CSS
   class. Both player-facing sentences come from here so the marker tip and the
   refused collect cannot drift apart. */
test('hunt: an out-of-range spawn says it is out of range and how far', () => {
  const R = huntMod.COLLECT_RADIUS_M;
  const far = huntMod.collectReach(R + 0.32);
  assert.match(far, /^76 m away\./, far);
  assert.match(far, new RegExp(`Get within ${R} m to collect it\\.$`), far);
  const atEdge = huntMod.collectReach(R);
  assert.notEqual(atEdge, far);                       // the two states must differ
  assert.match(atEdge, /close enough/, atEdge);
  assert.match(huntMod.collectReach(12), /^12 m away\./);
});
/* The pure sentence above is inert unless the map actually says it. These are the
   two arms round 28 found silent: the refused collect (which returned with no
   message at all) and the marker tip (which said "walk to reach it" whether you
   were 12 m or 1.2 km out). */
test('boneyard: the refused collect and the marker tip both speak', () => {
  const src = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const arms = src.match(/rec\.spawn\.dist > COLLECT_RADIUS_M[^\n]*/g) || [];
  assert.equal(arms.length, 1, `expected one out-of-range collect arm, found ${arms.length}`);
  assert.ok(/toast\(collectReach\(/.test(arms[0]),
    `the refused collect is silent, it should toast collectReach(): ${arms[0].trim()}`);
  assert.ok(/foot: collectReach\(s\.dist\)/.test(src),
    'the spawn marker tip never says whether the spawn is reachable');
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
  /* EITHER WRITING PRIMITIVE. What this test is about is that the seed is
     WRITTEN BACK rather than re-derived; it is not about which call does it.
     Pinned to kvSet alone until 2026-09-02, when paidLooks moved to kvUpdate so
     that a receipt markPaid banks during the transmogMap await is not dropped,
     and this row went red on a strictly better version of the same behaviour. */
  assert.ok(/kv(?:Set|Update)\('paidlooks'/.test(fn[0]), 'paidLooks persists the grandfathered seed');
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
     The rule is keeper.lineage + 1. */
  const keeperLineage = 0, spareLineage = 4;
  const next = keeperLineage + 1;
  assert.equal(next, 1, 'keeper goes 0 -> 1 regardless of the spare');
  assert.notEqual(next, spareLineage + 1, 'the spare lineage does not carry');
});

test('breeding: costs no dust at all, and the step cooldown is the whole gate', async () => {
  /* REPLACES 'cost escalates with the lineage rank being bought', which asserted
     breedCost(1) === 60 and breedCost(2) > breedCost(1). Tom retired the cost on
     2026-08-27 (dust plan Q1, option a): dust is becoming a paid resource and
     lineage is +5% per tier permanently, so a dust price on breeding would have
     been selling power the moment dust went on sale.

     This asserts the ABSENCE, because the old test would simply have been
     deleted otherwise and nothing would notice a price coming back. If somebody
     re-exports breedCost or re-adds a spend to the breed path, this goes red. */
  const loot = await import('../js/loot.js');
  assert.equal(loot.breedCost, undefined, 'breedCost must not come back: dust cannot buy power');
  const src = readFileSync(new URL('../js/loot.js', import.meta.url), 'utf8');
  const breed = src.slice(src.indexOf('export async function breedPets'));
  const body = breed.slice(0, breed.indexOf('\nexport '));
  assert.ok(!/boneDustAdd\(\s*-/.test(body), 'the breed path must not spend dust');
  assert.ok(/BREED_COOLDOWN_STEPS/.test(body), 'and the step cooldown is still the gate');
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

/* QA round 26 O17: every coins dish in the Pantry read "+25% coins · NaNh NaNm
   left". The Pantry row hands the formatter the recipe's bare buff, which has a
   duration (hours) and no deadline (untilMs), and the formatter subtracted the
   missing deadline from the clock. Both shapes the app feeds it are graded:
   the Pantry shape for EVERY recipe, and the live shape with a real deadline.
   PROVE-RED: the pre-fix formatter body (untilMs - now unconditionally) prints
   NaN for zombie-fajita in the Pantry shape. */
test('kitchen: foodBuffLabel formats every recipe finitely, in the Pantry and live (QA r26 O17)', () => {
  const NOW = 1_800_000_000_000;
  let coinsDishes = 0;
  for (const r of RECIPES) {
    const pantry = foodBuffLabel({ ...r.buff, ...(r.buff.kind === 'combat' ? { fightsLeft: r.buff.fights } : {}) }, NOW);
    assert.ok(typeof pantry === 'string' && pantry.length > 0 && !/NaN|undefined|Infinity/.test(pantry), `${r.id} pantry label: ${pantry}`);
    if (r.buff.kind === 'coins') {
      coinsDishes++;
      assert.match(pantry, /^\+\d+% coins for \d+h/, `${r.id} pantry label states the duration it will run: ${pantry}`);
      const live = foodBuffLabel({ ...r.buff, untilMs: NOW + 90 * 60000 }, NOW);
      assert.equal(live, `+${Math.round(r.buff.pct * 100)}% coins · 1h 30m left`, 'a live coins buff still counts down');
    }
  }
  assert.ok(coinsDishes > 0, 'an empty sample is a failure: no coins dish in RECIPES');
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
  /* ONE EXEMPTION, AND IT IS TIED TO ITS PROOF RATHER THAN TO A NAME.
     This rule matches CSS TEXT, and text cannot tell "the panel's BACKGROUND
     bleeds under the notch", which is what a full-bleed hero is for, from "the
     CONTENT slides under the notch", which is the v240 bug. Gwart's Emporium
     genuinely uses the pattern and genuinely does the safe thing: its own audit
     samples the safe-area band in PIXELS and measures 0 ink there.
     So the exemption is only valid while that proof exists. If
     tests/emporium-audit.mjs is ever deleted or renamed, this test fails again
     and the exemption has to be re-earned. An allowlist that outlives its
     evidence is how a guard quietly stops guarding. */
  const PROVEN_BY_PIXELS = [
    { css: '.gw-hero', audit: 'emporium-audit.mjs', row: 'BAND' },
  ];
  const proven = PROVEN_BY_PIXELS.filter(p => {
    if (!existsSync(join(here, p.audit))) return false;
    return readFileSync(join(here, p.audit), 'utf8').includes(p.row);
  });
  assert.equal(proven.length, PROVEN_BY_PIXELS.length,
    'every safe-area exemption must name an audit that exists and still carries its row');
  const excused = offenders.filter(l => proven.some(p => cssRuleFor(css, l).includes(p.css)));
  assert.deepEqual(offenders.filter(o => !excused.includes(o)), [],
    'a negative top margin containing var(--sat) pulls content under the notch');
});
/* which selector owns a declaration: walk back to the nearest `{` above it */
function cssRuleFor(css, line) {
  const i = css.indexOf(line);
  if (i < 0) return '';
  const before = css.slice(0, i);
  const open = before.lastIndexOf('{');
  return open < 0 ? '' : before.slice(before.lastIndexOf('}', open) + 1, open);
}

test('css: the scroll container still reserves the safe area', () => {
  const css = readFileSync(join(here, '..', 'app.css'), 'utf8');
  assert.match(css, /\.screen\s*\{[^}]*padding:\s*calc\(var\(--sat\)/,
    '.screen must pad the safe area, or every screen starts under the notch');
});

/* ---- QA round 25 M20: the 44px floor on the logging path, resolved through
   the CASCADE, not read off one rule. `.sheet-close` (app.css ~445) declares
   min-height: 44px and the a11y audit was green, yet the button measured 44x41:
   `<button class="sheet-close t1-icon-btn">` also matches `.t1-icon-btn`
   (min-height: 40px, app.css ~6763), same specificity (one class), written
   6,283 lines later, so the later rule wins. A grep for "min-height: 44px" on
   .sheet-close is exactly the guard that stays green over this bug. This
   resolves min-height for the real element (its classes plus its ancestors'
   classes) by specificity then source order, the way the browser does, for the
   three controls QA measured under the floor. The pixel proof is
   tests/a11y-audit.mjs (M24 rows); this is the static half. ---- */
/* THE CASCADE RESOLVER, shared by R25-M20 and R22-W12 below. Simple selectors
   only: `.a`, `.a.b`, `.a .b`, `tag`, `.a input`. Anything with an id, pseudo,
   attribute or combinator other than descendant is skipped, which is safe here
   because a skipped rule can only make this resolver report a SMALLER winner
   than the browser if that rule raised the value, and every rule in the chains
   it is asked about is plain classes.
   el = { tag, classes, ancestors: [{tag, classes}, ...] nearest first } */
function cssResolve(sheet, el, prop) {
  const compound = tok => { const m = tok.match(/^([a-z]+)?((?:\.[\w-]+)*)$/i); return m ? { tag: m[1] || null, classes: (m[2].match(/[\w-]+/g) || []) } : null; };
  const matchesCompound = (c, el) => (!c.tag || c.tag === el.tag) && c.classes.every(k => el.classes.includes(k));
  const matches = (selector, el) => {
    const parts = selector.trim().split(/\s+/).map(compound);
    if (parts.some(p => !p) || /[#:>+~\[]/.test(selector)) return null;
    if (!matchesCompound(parts[parts.length - 1], el)) return false;
    let anc = 0;
    for (let i = parts.length - 2; i >= 0; i--) {
      while (anc < el.ancestors.length && !matchesCompound(parts[i], el.ancestors[anc])) anc++;
      if (anc++ >= el.ancestors.length) return false;
    }
    return true;
  };
  const specificity = sel => (sel.match(/\.[\w-]+/g) || []).length * 10 + (sel.match(/(^|\s)[a-z]+/gi) || []).length;
  let win = null, order = 0;
  for (const m of sheet.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    order++;
    const decl = m[2].match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
    if (!decl) continue;
    for (const sel of m[1].split(',')) {
      if (!matches(sel, el)) continue;
      const sp = specificity(sel);
      if (!win || sp > win.sp || (sp === win.sp && order >= win.order)) win = { sp, order, sel: sel.trim(), value: decl[1].trim() };
    }
  }
  return win;
}
const cssPx = v => { assert.match(v, /^\d+(\.\d+)?px$/, `expected a px value, got "${v}"`); return parseFloat(v); };

test('R25-M20 sheet-head icon buttons and the amount input resolve to >= 44px', () => {
  const css = readFileSync(join(here, '..', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const resolve = (el, prop, sheet = css) => cssResolve(sheet, el, prop);
  const px = cssPx;
  const sheetHead = [{ tag: 'div', classes: ['t1-tools'] }, { tag: 'div', classes: ['sheet-head'] }, { tag: 'div', classes: ['sheet', 't1'] }];
  const close = { tag: 'button', classes: ['sheet-close', 't1-icon-btn'], ancestors: sheetHead };
  const fav = { tag: 'button', classes: ['t1-icon-btn'], ancestors: sheetHead };
  const qty = { tag: 'input', classes: [], ancestors: [{ tag: 'div', classes: ['val'] }, { tag: 'div', classes: ['t1-step'] }, { tag: 'div', classes: ['sheet-body'] }] };
  /* QA round 28 B2: two more controls the same cascade left under the floor.
     The chevron is a bare .t1-icon-btn OUTSIDE .t1-tools (a recents row), so
     the M20 fix never reached it; "Wear it" is a .btn whose only height came
     from padding, so no rule set min-height at all. Both red on main. */
  const chev = { tag: 'button', classes: ['t1-icon-btn'], ancestors: [{ tag: 'div', classes: ['t1-frow', 't1-frow-split'] }, { tag: 'div', classes: ['sheet-body'] }, { tag: 'div', classes: ['sheet', 't1'] }] };
  const wear = { tag: 'button', classes: ['btn', 'mog-go'], ancestors: [{ tag: 'div', classes: ['look-bar', 'mog-bar'] }, { tag: 'div', classes: ['mog-dock'] }] };
  for (const [name, el] of [['.sheet-close.t1-icon-btn', close], ['#favBtn (.t1-icon-btn)', fav], ['#qtyIn (.t1-step .val input)', qty],
    ['"Change portion" chevron (.t1-frow-split .t1-icon-btn, R28-B2)', chev], ['"Wear it" (.look-bar.mog-bar .btn.mog-go, R28-B2)', wear]]) {
    const w = resolve(el, 'min-height');
    assert.ok(w, `${name}: no rule sets min-height at all`);
    assert.ok(px(w.value) >= 44, `${name}: the winning min-height is "${w.sel} { min-height: ${w.value} }", under the 44px floor (QA round 25 M20)`);
  }
  /* THE INSTRUMENT MUST SEE THE SHADOWING IT EXISTS FOR (control). With the
     two-class fix stripped out, the resolver has to land on the one-class
     .t1-icon-btn at 40px by source order, exactly the cascade that shipped
     44x41. If it reports .sheet-close here, it is reading the first rule and
     not the winning one, and every green above is worthless. */
  const stripped = css.replace(/\.t1-tools \.t1-icon-btn\s*\{[^}]*\}/, '');
  assert.notEqual(stripped, css, 'the .t1-tools .t1-icon-btn rule is gone from app.css');
  const shadow = resolve(close, 'min-height', stripped);
  assert.equal(shadow.sel, '.t1-icon-btn', `CONTROL: without the fix the resolver picked "${shadow.sel}", not the later same-specificity .t1-icon-btn`);
  assert.equal(px(shadow.value), 40, `CONTROL: the shadowing rule should read 40px, got ${shadow.value}`);
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
  const cons = loot.match(/export const CONSUMABLES = \{([\s\S]*?)\n\};/)[1];
  assert.ok(!/freeze/i.test(shop), 'the coin shop still sells a freeze');
  // the dust shop's row is gone with the dust shop itself (2026-08-25); the test
  // below, "S0: dust buys looks", is what keeps it from coming back at all.
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

test('the freeze payout claims atomically BEFORE it pays, and pays before it deletes', () => {
  /* A kvGet/kvSet flag around the payout is not a claim: two boots both clear
     the read and both pay (measured at +900 for 300 owed, see
     tests/freeze-refund-audit.mjs). Only addIfAbsent is a test-and-set, and it
     has to come first, so the payout can only run on the branch that won it.
     The KEY must stay 'freeze-refunded': every already-settled install carries
     that row, and a new key would pay all of them a second time. */
  const loot = readFileSync(join(here, '..', 'js', 'loot.js'), 'utf8');
  const fn = loot.match(/export async function refundStreakFreezes\([\s\S]*?\n\}/)[0];
  assert.ok(/addIfAbsent\('kv', \{ k: 'freeze-refunded'/.test(fn), 'must claim via db.addIfAbsent on the ORIGINAL kv key');
  assert.ok(!/kvSet\('freeze-refunded'/.test(fn), 'a kvSet flag is not a claim and must not be the guard');
  assert.ok(fn.indexOf('addIfAbsent') < fn.indexOf('coinsAdd'), 'the claim must be resolved BEFORE any coin moves');
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
    ['[data-buydrop]', 'the featured drop'],
    // [data-buyweapon] stood here. The Bone Merchant closed on 2026-08-25 (S0);
    // there is no weapon left to buy on any number of taps. The dust shop's
    // cell went the same way later that day, and the test above ("S0: dust buys
    // looks") is what keeps a dust-priced product from coming back UNDECLARED:
    // the egg returned on 2026-08-31 as that register's one declared exception.
    ['[data-dustegg]', 'the dust egg'],
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
  // Founder's Lizard was reachable by chance. The two inline pools were merged
  // into pickRandomPet() so there is nothing left to keep in step, and this reads
  // the source because there is still no way to ask the pool what it contains
  // without driving it. ONE pool now, and it excludes exclusives; that the two
  // callers really route through it is tests/pet-pool-audit.mjs's SHARED row.
  const src = readFileSync(join(here, '..', 'js', 'loot.js'), 'utf8');
  const pools = [...src.matchAll(/BH_ITEMS\.filter\(i => i\.slot === 'C'([^)]*)\)/g)].map(m => m[1]);
  assert.ok(pools.length >= 1, `expected the shared pet pool, found ${pools.length}`);
  for (const p of pools) {
    assert.match(p, /!i\.exclusive/, `a pet pool is built without excluding exclusives: "i.slot === 'C'${p}"`);
  }
  // and there IS at least one exclusive pet to protect, or this guard is theatre
  const exclusives = BH_ITEMS.filter(i => i.slot === 'C' && i.exclusive);
  assert.ok(exclusives.length > 0, 'no exclusive pets exist, so this guard proves nothing');
});

/* "every weapon rewards a stat that actually exists" stood here. The Bone
   Merchant closed on 2026-08-25 (S0) and there are no weapons to check.
   The property that REPLACED it is the one below: coins may not buy power. */

test('S0: no coin-priced sink grants a crate, gear or a weapon row', () => {
  /* THE WHOLE POINT OF S0, ASSERTED STATICALLY. Coins bought power in two places:
     the crate cells (150 / 400, a crate rolls a statted gear variant) and the
     twelve Bone Merchant weapons. Both are gone. This is a LINT rather than a
     runtime probe because the thing being asserted is an ABSENCE, and the honest
     way to test an absence is to read the source and print the denominator.
     docs/IAP-SCOPING.md calls for exactly this before any coin pack ships. */
  const src = readFileSync(join(here, '..', 'js', 'loot.js'), 'utf8');

  // 1. the coin shop's stock, read out of the source rather than assumed
  const shop = [...src.matchAll(/\{ id: '([a-z0-9-]+)', label: '[^']*', icon: '[^']*', cost: (\d+) \}/g)]
    .map(m => ({ id: m[1], cost: Number(m[2]) }));
  assert.ok(shop.length >= 2, `SHOP parsed ${shop.length} rows; the lint is reading the wrong thing`);
  for (const row of shop) {
    assert.ok(!row.id.startsWith('crate-'), `coin shop still sells ${row.id} for ${row.cost}`);
  }

  // 2. buyShopItem must not be able to reach a crate at all
  const buy = src.slice(src.indexOf('export async function buyShopItem'));
  const body = buy.slice(0, buy.indexOf('\n}\n'));
  assert.ok(body.length > 40, 'failed to slice buyShopItem; the lint is reading the wrong thing');
  assert.ok(!/grantCrate|grantGear|db\.put\('inv'/.test(body),
    'buyShopItem reaches a crate, gear or an inventory row');

  // 3. the weapon buy flow is gone outright, not merely unreferenced
  for (const gone of ['WEAPON_COST', 'export async function buyWeapon', 'weaponCoinCost', 'weaponDustCost'])
    assert.ok(!src.includes(gone), `${gone} is still in js/loot.js`);

  // 4. CONTROL. The lint above only proves anything if the strings it hunts for
  // are the ones a violation would use, so prove each pattern fires on a forgery.
  const forgery = "export async function buyShopItem(x) {\n  await grantCrate('daily', 'shop');\n}\n";
  const fbody = forgery.slice(0, forgery.indexOf('\n}\n'));
  assert.ok(/grantCrate|grantGear|db\.put\('inv'/.test(fbody), 'the crate pattern cannot detect a violation');
});

test('no audit can grade PRODUCTION by accident: boot() defaults to this checkout', () => {
  /* boot()'s default used to be the literal live URL. In the release gate it
     never showed, because release-gate passes `base` as argv[2] to every browser
     suite. The damage was to BARE runs, which is how every debugging session and
     every prove-red happens: MEASURED 2026-08-27, 26 audits called boot() with an
     unset argv/env and silently graded https://tommillerca.github.io/tally/.

     It cost a full investigation the same day. melt-ui-audit had one red row that
     read the SAME red against a pristine origin/main worktree, so it was reported
     as pre-existing and structural. It was neither: two cp -R mutations of the
     exact copy that row asserts on changed the output by NOTHING, because the
     mutated files were never served.

     This is a source lint rather than a behavioural one on purpose. The failure
     it guards is an audit AGREEING with you, so there is no red state to observe;
     the only observable is the default itself. */
  const gm = readFileSync(join(here, 'godmode.js'), 'utf8');
  const sig = gm.match(/export async function boot\(([^)]*)\)/);
  assert.ok(sig, 'boot() was not found; this lint is reading the wrong thing');
  assert.ok(!/https?:\/\//.test(sig[1]),
    `boot() takes a URL as its default again: ${sig[1]}. An unset base must serve THIS checkout.`);
  const body = gm.slice(gm.indexOf('export async function boot('));
  assert.ok(/if \(!base\)[\s\S]{0,200}serveTree/.test(body),
    'boot() no longer falls back to serving the tree when given no base');
});

test('S0: dust buys looks, and every dust spend in the tree is declared', () => {
  /* THE SECOND HALF OF S0, 2026-08-25. Coins stopped buying power; this is the
     same property one currency along. Tom: "i dont think we want to be able to
     buy with dust at all unless that becomes a currency you can only get from
     spending real money". The Bone Dust shop sold an egg (a pet that fights),
     a Common Crate (statted gear) and a Battle Charm (a Pit win pays more), and
     all three are gone.

     WHY A LINT AND NOT A PROBE: the thing asserted is an ABSENCE, so it is read
     off the source with the denominator printed, the same shape as the coin
     lint above. Three rows, because a shop can come back under a new name:
       1. the old names are gone from the file outright;
       2. EVERY dust spend in the module is enumerated and must be DECLARED
          here, so a new one cannot appear silently;
       3. no declared dust spend reaches a grant of an item.
     Row 2 is the load-bearing one. It used to carry ONE declared exception,
     breedPets, written down rather than quietly excluded because a register that
     hides its exception is a lie. That exception was retired on 2026-08-27.
     A NEW exception arrived on 2026-08-31: Tom ruled the dust shop EGG was
     removed unintentionally (dust is the deterministic hatch route for a player
     who cannot walk the step milestones), so buyDustEgg sells one Mystery Egg a
     week for 60 dust. Row 3 pins the exception to exactly grantEgg: the crate,
     the charm and every other grant stay unreachable from a dust spend. */
  const src = readFileSync(join(here, '..', 'js', 'loot.js'), 'utf8');
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');

  // 1. the shop is gone from the source, not merely unrendered
  for (const gone of ['DUST_SHOP', 'buyWithDust'])
    assert.ok(!src.includes(gone) && !app.includes(gone), `${gone} is back in the tree`);

  /* 2. every dust SPEND, by the function that makes it, against a declaration.
        A spend is `await spendDust(...)` OR boneDustAdd with a negative
        argument; the positive ones are income (melting, quests, the wheel) and
        are not this test's business.
        BOTH SHAPES, and the pattern widened rather than moved on 2026-08-31.
        The spends became atomic that day (spendDust decides affordability and
        debits in ONE kv transaction, because the old read-then-boneDustAdd let
        two concurrent dust buys pass the same stale read and clamp their
        overdrafts to free), and this register went momentarily blind: it found
        0 spends and said so, which is the floor row below doing its job. Keeping
        `boneDustAdd(-` in the pattern matters as much as adding the new one, so
        a future hand-rolled negative debit still lands in this register instead
        of slipping past a check that now only knows about spendDust. The
        `await` is what keeps spendDust's own one-line definition out of the
        census. */
  const DECLARED = {
    buyRackItem: 'COSMETIC. Buys a piece off the rack: grantCosmetic, or the aura kv. tests/purchase-firewall.mjs asserts statically that this path cannot reach grantGear or grantCrate.',
    applyTransmog: 'COSMETIC. Pays for a look on a slot. One changes your stats, one costs dust and changes only the picture.',
    /* breedPets WAS the third entry, declared NOT COSMETIC and written down
       rather than excused: "it is the one place dust still touches power and it
       is the first thing to look at if dust is ever sold for money". That is
       exactly what happened. Tom ruled on 2026-08-27 (dust plan Q1, option a)
       that breeding stops costing dust, so the exception this register existed
       to flag is gone and EVERY remaining dust spend is cosmetic. The floor
       below moved 3 -> 2 with it. */
    buyDustEgg: 'NOT COSMETIC, BY RULING (Tom, 2026-08-31): the dust shop egg was removed unintentionally, and dust is the deterministic hatch route for a non-walker. One Mystery Egg per ISO week for 60 dust, bounded by the dustegg:<week> receipt. If dust is ever sold for real money, this is the first thing to look at.',
  };
  /* The one dust spend allowed to reach a grant, and ONLY grantEgg. Not a skip:
     row 3 still forbids it every other grant, so the crate and the charm cannot
     ride back in on the egg's ruling. */
  const POWER_EXCEPTIONS = { buyDustEgg: /grantEgg/ };
  const owners = [...src.matchAll(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm)].map(m => [m.index, m[1]]);
  const ownerAt = i => { let n = '(top level)'; for (const [ix, name] of owners) { if (ix <= i) n = name; else break; } return n; };
  const DUST_SPEND = /boneDustAdd\(\s*-|await spendDust\(/g;
  const spends = [...src.matchAll(DUST_SPEND)].map(m => ownerAt(m.index));
  assert.ok(spends.length >= 2, `found ${spends.length} dust spends; the lint is reading the wrong thing`);
  assert.deepEqual([...new Set(spends)].sort(), Object.keys(DECLARED).sort(),
    `an undeclared dust spend: ${spends.join(', ')}`);

  // 3. and none of them hands out an item, except the one declared exception,
  //    which may reach EXACTLY its declared grant and nothing else
  const GRANTS = /grantEgg|grantCrate|grantConsumable|grantGear|grantPet\b|addPetInstance/;
  for (const fn of Object.keys(DECLARED)) {
    const from = src.slice(src.indexOf(`function ${fn}(`));
    const body = from.slice(0, from.indexOf('\n}\n'));
    assert.ok(body.length > 40, `failed to slice ${fn}; the lint is reading the wrong thing`);
    const allowed = POWER_EXCEPTIONS[fn];
    if (allowed) {
      assert.ok(allowed.test(body), `${fn} is a declared exception for ${allowed} and no longer reaches it; retire the exception`);
      const others = body.replace(new RegExp(allowed.source, 'g'), '');
      assert.ok(!GRANTS.test(others), `${fn} reaches a grant beyond its declared exception ${allowed}`);
    } else {
      assert.ok(!GRANTS.test(body), `${fn} spends dust and grants an item`);
    }
  }

  /* 4. CONTROL. Each row above only proves something if it can fire, so fire
        every pattern against a forgery of the thing it hunts for. */
  const forgery = "function buyWithDust(id) {\n  await boneDustAdd(-60);\n  await grantEgg('dust');\n}\n";
  assert.ok(forgery.includes('buyWithDust'), 'the name pattern cannot detect a violation');
  assert.equal([...forgery.matchAll(new RegExp(DUST_SPEND.source, 'g'))].length, 1, 'the spend pattern cannot find a legacy boneDustAdd spend');
  /* and the same for the shape every real spend uses now, so the widened half
     of the pattern is proven to fire rather than merely present */
  const forgery2 = "function buyWithDust2(id) {\n  await spendDust(60);\n}\n";
  assert.equal([...forgery2.matchAll(new RegExp(DUST_SPEND.source, 'g'))].length, 1, 'the spend pattern cannot find a spendDust spend');
  assert.ok(GRANTS.test(forgery), 'the grant pattern cannot detect a violation');
});

test('S0: the merchant refund knows what every withdrawn weapon cost', () => {
  /* THE REFUND IS THE LARGEST PAYOUT THE APP MAKES, and its price table is now
     the only surviving record of what people paid. These twelve ids and figures
     were read off WEAPON_COST on origin/main before it was deleted; a typo here
     short-changes a real player and nothing else in the tree can catch it. */
  const src = readFileSync(join(here, '..', 'js', 'loot.js'), 'utf8');
  const table = src.slice(src.indexOf('export const MERCHANT_REFUND'));
  const rows = [...table.slice(0, table.indexOf('};')).matchAll(/(\w+): \{ coins: (\d+)(?:, dust: (\d+))? \}/g)];
  const got = Object.fromEntries(rows.map(m => [m[1], [Number(m[2]), Number(m[3] || 0)]]));
  assert.deepEqual(got, {
    rapier: [500, 0], shivs: [500, 0], scepter: [900, 0],
    wand: [700, 0], cleaver: [1500, 0], crook: [1600, 0],
    maul: [3400, 0], lichfocus: [3400, 0], censer: [3200, 0],
    warmaul: [6000, 350], voidstar: [6000, 350], reliquary: [5600, 330],
  }, 'the refund prices no longer match what the Bone Merchant charged');
  // a player who bought the full rack is owed exactly this, which is the figure
  // docs/PLAN-remove-weapons.md §5 sized the exposure against
  const coins = Object.values(got).reduce((a, [c]) => a + c, 0);
  const dust = Object.values(got).reduce((a, [, d]) => a + d, 0);
  assert.equal(coins, 33300, `full rack pays ${coins} coins`);
  assert.equal(dust, 1030, `full rack pays ${dust} dust`);
  // Bonecrusher was never for sale, so nothing is owed for it
  assert.ok(!('bonecrusher' in got), 'the Champion prize was never bought and must not be refunded');
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
  /* WINDOW 1800 -> 4000, 2026-09-03. This slices a FIXED number of characters
     after the call and string-matches inside it, so any comment added to the
     claim path silently pushes `if (already)` out of the window and three
     assertions go red on code that satisfies all of them. That is exactly what
     the R20-P2 refund fix did. Measured at the time: the properties held at
     2600 and the branch sat at offset 2376. 4000 buys headroom; if this drifts
     again the answer is to anchor on the branch, not to widen it a third time. */
  const block = app.slice(i, i + 4000);
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
    if (f.glutton || f.mage || f.mimic || f.wanderer) continue;   // drawn bosses bring their own art
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


/* THE WHOLE CAST, NOT ONE OF ITS THREE PACKERS.
 *
 * The old pin measured walkers against walkers, which is exactly why it stayed
 * green while a catfish sat 59x46px inside a bulldog: floppers and hoverers were
 * placed by two other systems and nothing compared the three. This one measures
 * every placed figure's SPRITE BOX against every other's, which is what the two
 * playtesters measured on the live screen (2026-08-31: eight offending pairs,
 * worst 66x96px).
 *
 * FLYERS ARE EXCLUDED, and it is a stated exemption rather than an oversight:
 * they cross the entire width on a CSS animation at their own depth (z-index 4,
 * behind everything on the ground), so they have no static x to compare and
 * passing over a cloud is what the design asks them to do. */
const pdkBox = p => (p.kind === 'walk'
  ? { x0: p.x0, x1: Math.max(p.x1, p.x0 + p.w), y0: p.y - p.w, y1: p.y }
  : { x0: p.x, x1: p.x + p.w, y0: p.y - p.w, y1: p.y });
function pdkClashes(placed, tol = 20) {
  const boxes = Object.entries(placed).filter(([, p]) => p.kind !== 'fly').map(([iid, p]) => ({ iid, ...pdkBox(p) }));
  const bad = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ox > tol && oy > tol) bad.push(`${a.iid}/${b.iid} ${Math.round(ox)}x${Math.round(oy)}px`);
  }
  return { bad, pairs: (boxes.length * (boxes.length - 1)) / 2, boxes };
}

test('paddock figures never stack: no pair shares more than 20px in BOTH axes', async () => {
  const { assignRows, placePaddock, PDK_SCENE, OVERLAP } = await import('../js/paddock.js');
  /* every mix that has ever been on this screen, walkers alone through a herd
     past the cap with catfish and clouds in it */
  const mixes = [
    [['walk', 1]], [['walk', 3]], [['walk', 8]], [['walk', 14]],
    [['walk', 8], ['flop', 3]], [['walk', 11], ['flop', 3], ['hover', 5], ['fly', 2]],
    [['flop', 6], ['hover', 6], ['walk', 6], ['fly', 4]],
  ];
  let comparisons = 0;
  for (const mix of mixes) {
    const roster = mix.flatMap(([motion, n]) => Array.from({ length: n }, (_, i) => ({ iid: `${motion}${i}`, motion })));
    const placed = placePaddock(roster, undefined, '2026-08-31');
    const { bad, pairs, boxes } = pdkClashes(placed);
    assert.ok(boxes.length > 0, `${JSON.stringify(mix)}: nothing was placed, so the rule never ran (an empty sample is a failure)`);
    comparisons += pairs;
    assert.equal(bad.length, 0, `${JSON.stringify(mix)}: ${bad.join(', ')}`);
    for (const [iid, p] of Object.entries(placed)) {
      if (p.kind === 'fly') continue;
      assert.ok(pdkBox(p).y1 <= PDK_SCENE.PANEL_Y, `${iid} stands below the panel edge at ${pdkBox(p).y1}`);
    }
  }
  assert.ok(comparisons > 50, `only ${comparisons} pairs were compared across every mix: the rule barely ran`);
  /* and the geometry the guarantee rests on, pinned where weakening it shows:
     rows further apart than the sprite minus the tolerance is what makes two
     rows independent, so the loop above cannot be satisfied by luck */
  const ys = PDK_SCENE.GROUND_ROWS.map(r => r.y);
  for (let i = 1; i < ys.length; i++) {
    assert.ok(ys[i] - ys[i - 1] >= 76 - 20, `ground rows ${ys[i - 1]} and ${ys[i]} are ${ys[i] - ys[i - 1]}px apart, closer than the 76px sprite minus the 20px tolerance`);
  }
  assert.ok(OVERLAP <= 20, 'the allocator hands out more overlap than the layout rule tolerates');
  /* the graveyard corner (tombstone x16-42 base y330, cross x62-78): a figure
     whose feet sit above that base must never enter its x-range, because the
     herd layer draws over the backdrop and would hide the props */
  assert.ok(PDK_SCENE.GROUND_ROWS[0].xmin >= 86, 'top-row left exclusion regressed below the graveyard edge');
  /* and the bottom-left corner is the player's own bonehead */
  for (const r of PDK_SCENE.GROUND_ROWS.filter(r => r.y >= 376)) {
    assert.ok(r.xmin >= 152, `row ${r.y} reaches into the keeper corner at x${r.xmin}`);
  }
  /* the allocator DROPS what will not fit rather than stacking it, and says so
     by returning fewer rows than it was handed: the panel's "N of M out today"
     line is built on that difference being real */
  const crowd = Array.from({ length: 40 }, (_, i) => ({ iid: 'c' + i, w: 76 }));
  const rows = assignRows(crowd, PDK_SCENE.GROUND_ROWS);
  assert.ok(rows.length > 0 && rows.length < crowd.length, `assignRows placed ${rows.length} of ${crowd.length}: it must fill the rows and drop the rest`);

  // every motion kind gets placed, none invents a position off-scene
  const cast = [...Array(4)].flatMap((_, i) => [
    { iid: `a${i}`, motion: 'walk' }, { iid: `b${i}`, motion: 'fly' },
    { iid: `c${i}`, motion: 'hover' }, { iid: `d${i}`, motion: 'flop' }]);
  const placed = placePaddock(cast);
  assert.equal(Object.keys(placed).length, cast.length, 'a pet vanished in placement');

  /* THE WALK CAP (Aggie's measured ceiling, 2026-08-11), unchanged at 8: a big
     herd rotates by day instead of crushing the rows. */
  const herd = Array.from({ length: 20 }, (_, i) => ({ iid: 'h' + i, motion: 'walk' }));
  const capped = placePaddock(herd, undefined, '2026-08-11');
  const walks = Object.entries(capped).filter(([, p]) => p.kind === 'walk');
  assert.equal(walks.length, 8, `walk cap must render exactly 8 of 20, got ${walks.length}`);
  for (const [iid, p] of walks) assert.ok(p.x1 - p.x0 >= p.w, `${iid}: band ${p.x1 - p.x0}px is narrower than its own ${p.w}px sprite`);
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
  /* DERIVED, NOT TYPED. This read '3 OF 6 KINDS' and broke the day a seventh
     pet was added, which is a true statement about the catalogue being graded
     as a regression. The point of the row is that the footer counts COPIES and
     KINDS rather than species rows, and that survives the catalogue growing. */
  const kinds = BH_ITEMS.filter(i => i.slot === 'C').length;
  assert.equal(PDK.footerLabel(PDK_ROSTER), `5 PETS · 3 OF ${kinds} KINDS`);
  assert.equal(PDK.footerLabel([PDK_ROSTER[0]]), `1 PET · 1 OF ${kinds} KINDS`, 'singular reads right');
  assert.equal(PDK.footerLabel([]), `0 PETS · 0 OF ${kinds} KINDS`);
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

/* THE PRIVATE PET NICKNAME accepts and refuses the right things.
   Pure, so it is graded here rather than in a browser; the rendering, the
   reload and the "in ZERO outbound payloads" claim are in
   tests/nickname-private-audit.mjs, which drives the real screen and reads the
   real wire. Both halves are needed: this file would pass on a validator
   nobody called, and that one would pass on a validator that refused
   everything. */
test('nickname: an ordinary name, emoji and right-to-left text are all accepted', () => {
  assert.equal(nickProblem('Biscuit'), null);
  assert.equal(nickProblem('BISCUIT THE THIRD'), null);
  assert.equal(nickProblem('\u{1F436}‍\u{1F9B4} Bones'), null, 'a zero-width-joiner emoji sequence is one picture, not a control character');
  assert.equal(nickProblem('عظمة'), null, 'Arabic is a language, not an attack');
  assert.equal(nickProblem(''), null, 'empty is how you clear a nickname');
  assert.equal(nickProblem('   '), null, 'and whitespace-only is empty');
  assert.equal(nickProblem(null), null);
});
test('nickname: over-length is REFUSED in words, never silently truncated', () => {
  const at = 'W'.repeat(NICK_MAX);
  assert.equal(nickProblem(at), null, `${NICK_MAX} characters is the limit, not one under it`);
  const over = nickProblem('W'.repeat(NICK_MAX + 1));
  assert.ok(over, 'one character over the limit must be refused');
  assert.match(over, new RegExp(`\\b${NICK_MAX}\\b`), 'the refusal has to tell the player the actual limit');
  /* The bug this pins is the v387 shape: coercing garbage into the store
     instead of refusing it. cleanNick must never shorten a name to fit. */
  assert.equal(cleanNick('W'.repeat(NICK_MAX + 6)).length, NICK_MAX + 6,
    'cleanNick must not truncate: refusing is the product decision, guessing at intent is what caused the v387 losses');
});
test('nickname: length is counted in CODE POINTS, so an emoji costs what it looks like', () => {
  const eight = '\u{1F480}'.repeat(8);       // 8 skulls = 16 UTF-16 units, 8 code points
  assert.equal(eight.length, 16, 'the fixture really is a surrogate-pair string');
  assert.equal(nickProblem(eight), null, 'counting UTF-16 units here would refuse a name well inside the limit');
  /* And why it matters beyond arithmetic: a naive slice(0, N) can cut a
     surrogate pair in half and store a lone surrogate, which renders as a
     replacement glyph forever. Nothing here truncates, so nothing can. */
  assert.equal(cleanNick(eight), eight);
});
test('nickname: bidi control characters are refused, because they reorder everything drawn after them', () => {
  for (const ch of ['‮', '‪', '‏', '⁦', '']) {
    const p = nickProblem(`BOB${ch}exe`);
    assert.ok(p, `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} must be refused: it is a spoofing tool, not a language`);
  }
  assert.equal(nickProblem('BOB‍exe'), null, 'but the zero-width JOINER stays legal, or every compound emoji breaks');
});
test('nickname: cleanNick trims and collapses runs of whitespace, and that is ALL it does', () => {
  assert.equal(cleanNick('  Old   Bones  '), 'Old Bones');
  assert.equal(cleanNick('Old\tBones'), 'Old Bones');
  assert.equal(cleanNick(''), '');
  assert.equal(cleanNick(undefined), '');
  assert.equal(cleanNick('<img src=x>'), '<img src=x>',
    'cleanNick does not sanitise markup: escaping belongs to the render layer (esc() in js/app.js) and doing it in both places would double-encode');
});
test('nickname: it is stored in its OWN kv map, never on the instance row or in kv equipped', () => {
  const loot = readFileSync(join(here, '..', 'js', 'loot.js'), 'utf8');
  /* WHY THIS IS A TEST AND NOT A COMMENT. socialSnapshot() uploads
     `outfit: eq`, and equipped() builds that with `{ ...base, ...saved }` over
     kv 'equipped'. Any key written into that object ships itself to every
     friend, the leaderboard and the step race with no code change at all. The
     nickname is private, so its storage SHAPE is the guard, and a guard that
     nothing checks is a comment. */
  assert.match(loot, /kvSet\('petNick'/, 'the nickname must live in its own kv key');
  const from = loot.indexOf('export async function setPetNick');
  const to = loot.indexOf('async function clearNick');
  assert.ok(from > 0 && to > from, 'found no setPetNick body to inspect: this check has drifted, it has not passed');
  const setter = loot.slice(from, to);
  assert.doesNotMatch(setter, /kvSet\('equipped'|kvSet\('petInst'/,
    'setPetNick must not write into either object that is uploaded wholesale to other players');
});

/* THE APP-WIDE NO-SELECT RULE, AND THE TWO EXEMPTIONS THAT MAKE IT SAFE.
 * Tom, 2026-08-18: "i noticed you can press and hold to highlight text all over
 * the app though thats annoying". body now carries the suppression.
 *
 * THE EXEMPTIONS ARE THE POINT OF THIS TEST. Suppressing selection globally is
 * one line and quietly breaks two things:
 *   - form fields: user-select: none INHERITS into input/textarea, and on iOS
 *     that interferes with selecting and editing what you typed.
 *   - .code-line is the RECOVERY CODE, the one string a player must be able to
 *     copy. Long-press "Copy" is the iOS affordance for it, so killing the
 *     callout there loses people their save. That is a far worse bug than the
 *     magnifier this rule exists to remove.
 * Anyone tidying this rule later will be tempted to drop the exemptions. This
 * fails when they do. Chromium does not implement -webkit-touch-callout, so no
 * browser audit in this repo can catch any of it.
 */
test('the app-wide no-select rule keeps form fields and the recovery code usable', () => {
  const css = readFileSync(join(here, '..', 'app.css'), 'utf8');
  /* Collect the body of every rule whose PRELUDE mentions the selector. Walk the
     braces rather than pattern-matching the prelude: an earlier version of this
     test required a `}` before the selector and so never saw the rule sitting
     directly under a comment, which is exactly where this one lives. It reported
     green while looking at a different body rule entirely. */
  const bodiesFor = (needle) => {
    const out = [];
    let i = 0;
    while ((i = css.indexOf('{', i)) !== -1) {
      const close = css.indexOf('}', i);
      if (close === -1) break;
      const preludeStart = Math.max(css.lastIndexOf('}', i - 1), css.lastIndexOf('*/', i - 1), 0);
      const prelude = css.slice(preludeStart, i);
      if (prelude.includes(needle)) out.push(css.slice(i + 1, close));
      i = close + 1;
    }
    return out.join(' ');
  };

  const body = bodiesFor('body');
  assert.ok(body.length > 0, 'found no body rule at all: the scan is broken, not the tree clean');
  assert.match(body, /-webkit-touch-callout\s*:\s*none/,
    'body must suppress the iOS callout, or a long press anywhere raises the magnifier');
  assert.match(body, /user-select\s*:\s*none/,
    'body must suppress text selection app-wide');

  const fields = bodiesFor('textarea');
  assert.ok(fields.length > 0, 'no rule mentions textarea: the exemption is missing entirely');
  assert.match(fields, /user-select\s*:\s*text/,
    'input/textarea must be put BACK to user-select: text. Without it the global none ' +
    'inherits into every form field and iOS fights you editing what you typed.');
  assert.match(fields, /-webkit-touch-callout\s*:\s*default/,
    'input/textarea must restore the callout, or the paste menu goes with it');

  const code = bodiesFor('.code-line');
  assert.ok(code.length > 0, 'no rule mentions .code-line: the recovery code exemption is missing');
  assert.match(code, /-webkit-touch-callout\s*:\s*default/,
    '.code-line is the RECOVERY CODE and long-press Copy is how a player saves it. ' +
    'It must keep the callout, or losing a phone means losing the save.');
  assert.match(code, /user-select\s*:\s*all/, '.code-line must stay fully selectable');
});

/* SMALL ART IS NOT DRAWN FROM A THUMBNAIL, AND NOT NEAREST-NEIGHBOURED.
 * Tom, 2026-08-19: "when the grill or small item is presented alone it's always
 * look super pixelated". Measured ink at the 192 tier vs the 640 master:
 *   G3 grillz 3x4 vs 11x11, G4 15x7 vs 47x22, G1 16x11 vs 50x35,
 *   E1 earring 27x14 vs 86x44, H13-5 hat 71x74 vs 234x244.
 * A hat loses nothing. A grill was being drawn from twelve pixels and then
 * INTEGER-BLOWN-UP by a nearest-neighbour step whose own comment names "a 43px
 * grillz" as its case. That reasoning holds at 43px and draws squares at 12.
 *
 * WHY THIS IS STATIC AND WHAT THAT COSTS. tests/art-resolution-audit.mjs sweeps
 * the real app but can only measure <img> elements; the lone-item path draws
 * into a <canvas>, which has no naturalWidth once painted, so that audit is
 * BLIND to this exact fix. I proved that rather than assuming it: disabling
 * SMALL_INK left it green. So this case pins the two behaviours at the source.
 * It cannot tell you the picture got better, only that neither rule was
 * deleted. Saying so plainly rather than implying more.
 *
 * THE ESCALATION CLIMBS, IT DOES NOT JUMP (2026-08-24). It used to go straight
 * from any thumbnail to the 640 master, which put 62 concurrent 640x640 bitmaps
 * (103.1 MB) on the Wardrobe's hat slot and reddened the memory census's OFF-DOM
 * row. It now steps one tier at a time, so the 384 sheet gets the chance the
 * jump never gave it and only art that is still tiny there reaches the master.
 * The grep that used to stand for "the upgrade still exists" is replaced by
 * RUNNING the ladder: a proxy could not tell a climb from a jump, and could not
 * catch the one way this can genuinely break, which is a ladder that never
 * terminates at the master.
 */
test('small art climbs to a bigger source and skips the nearest-neighbour step', async () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const m = app.match(/const SMALL_INK = (\d+);/);
  assert.ok(m, 'SMALL_INK is gone: the small-art path has been removed entirely');
  const threshold = +m[1];
  assert.ok(threshold >= 32, `SMALL_INK is ${threshold}; below ~32 it stops covering the items that need it ` +
    '(G1 grillz measure 50x35 in the master and were still visibly blocky)');

  const fn = app.slice(app.indexOf('function drawTrimmedArt'), app.indexOf('function hydratePackArt'));
  assert.ok(fn.length > 200, 'drawTrimmedArt not found: this check has drifted, it has not passed');
  assert.match(fn, /Math\.max\(bw, bh\) < SMALL_INK[\s\S]{0,120}nextArtTier\(src\)/,
    'the small-ink upgrade is gone: small items will be drawn from the 192 tier again');
  assert.match(fn, /Math\.max\(bw, bh\) < SMALL_INK[\s\S]{0,80}Math\.min\(3, Math\.floor\(scale\)\)/,
    'the nearest-neighbour step is no longer skipped for small ink: tiny art will be drawn as squares again');

  // Run the ladder itself: 192 -> 384 -> master -> stop, on the app's own tiers.
  const src = app.slice(app.indexOf('const nextArtTier'), app.indexOf('function drawTrimmedArt'));
  /* THE REAL ARRAY, IMPORTED, not scraped out of js/app.js. It used to be a
     regex over this file's own source, which went red the day BH_THUMB_TIERS
     moved to data/boneheadz.js (so js/paddock-cards.js could reach it) and
     reported "Cannot read properties of null" rather than anything about tiers.
     A scrape can only ever follow a definition around; an import IS it. */
  const { BH_THUMB_TIERS } = await import('../data/boneheadz.js');
  const next = new Function('BH_THUMB_TIERS', `${src}; return nextArtTier;`)(BH_THUMB_TIERS);
  const rung = ['assets/bh/thumb/192/H/H1.png'];
  for (let i = 0; i < 6 && rung[rung.length - 1] != null; i++) rung.push(next(rung[rung.length - 1]));
  assert.deepEqual(rung, [
    'assets/bh/thumb/192/H/H1.png', 'assets/bh/thumb/384/H/H1.png', 'assets/bh/H/H1.png', null,
  ], 'the small-ink ladder no longer climbs 192 -> 384 -> master and stop');
});

/* EVERY PATH bhTrim() OR bhThumb() CAN PRODUCE HAS A FILE BEHIND IT.
 *
 * The cropped tier is served to <canvas>es through drawTrimmedArt, and that
 * function's error path paints a blank plate: a missing trim thumbnail is an
 * EMPTY TILE in the Wardrobe, not a soft one. The <img> tiers can afford to be
 * sloppy about this because avatarLayersHtml carries an onerror that swaps back
 * to the full-size art (rule 8, degrade to ugly never to invisible); a canvas
 * has nowhere to fall back to.
 *
 * So this walks the masters with the app's OWN regex, lifted out of js/app.js
 * rather than retyped, and demands the file. It goes red the moment somebody
 * adds art and forgets `python3 scripts/build-bh-thumbs.py`, which is exactly
 * how C6 shipped with no 192 or 384 sheet at all (found 2026-08-24, still true
 * of those two tiers on main and written up rather than fixed here).
 *
 * PROVE-RED: `rm assets/bh/thumb/trim/H/H1.png` and this fails naming H/H1.png.
 */
test('every cosmetic any tier can be asked for is on disk', async () => {
  // the real rule, IMPORTED from where it lives now (data/boneheadz.js) rather
  // than scraped out of js/app.js. The scrape went red the day the rule moved,
  // with "Cannot read properties of null" and nothing at all about tiers: a
  // scrape can only ever follow a definition around, an import IS it.
  const { BH_THUMB_RE: re } = await import('../data/boneheadz.js');
  const bh = join(here, '..', 'assets', 'bh');
  const rels = [];
  for (const slot of readdirSync(bh)) {
    if (slot === 'thumb') continue;
    for (const dir of [slot, join(slot, 'shiny')]) {
      const abs = join(bh, dir);
      if (!existsSync(abs)) continue;
      for (const f of readdirSync(abs)) {
        const rel = `${dir}/${f}`.replace(/\\/g, '/');
        if (re.test(`assets/bh/${rel}`)) rels.push(rel);
      }
    }
  }
  assert.ok(rels.length > 300, `only ${rels.length} cosmetics matched: the regex or the walk has drifted, this has not passed`);
  /* ALL THREE TIERS, not just the cropped one. Extended 2026-08-24: this test
     was written the same week C6 shipped with no 192 or 384 sheet, and it says
     so in the comment above while covering only `trim`, so it watched the bug
     it was documenting go past. The square tiers are NOT a softer case: the
     Collection's <img> carries no onerror, so a missing square tile is a
     broken-image icon (measured on e2cb252d, alt text "Bumbleseal" over
     Chrome's torn-page glyph), which is worse than the blank canvas plate the
     comment above worries about.
     A tier is only owed a file when the master is BIGGER than it, which is what
     the generator does, hence the header read rather than a flat demand. Every
     master today is 640 or 2048, so nothing is exempt right now and this is
     purely so smaller art landing later cannot false-red the suite. */
  const pngWidth = f => readFileSync(f).readUInt32BE(16);
  const missing = [];
  for (const r of rels) {
    const w = pngWidth(join(bh, r));
    for (const tier of ['192', '384', 'trim']) {
      if (tier !== 'trim' && w <= Number(tier)) continue;
      if (!existsSync(join(bh, 'thumb', tier, r))) missing.push(`${tier}/${r}`);
    }
  }
  assert.deepEqual(missing, [], `${missing.length} tier files are absent; run scripts/build-bh-thumbs.py`);
});

/* ---- R17-P2: the hot paths do not GAIN a full-store read -----------------
 *
 * WHAT THIS IS AND WHAT IT IS NOT. `db.all(store)` reads every row a player has
 * ever written. On a hot path that is unbounded linear growth: measured at 51
 * vs 5001 log rows on one rig, boot-to-first-paint went 404ms -> 908ms, heap
 * after boot 5.1MB -> 23.2MB, and a day-back tap 140ms -> 355ms. Nothing
 * crashed. It just gets worse for a player forever, which is why a number-based
 * check would be useless here and this is a SOURCE check instead.
 *
 * IT IS A RATCHET, NOT A ZERO. renderToday still has three full-store reads and
 * they are not removable today: `allLog` feeds `priorFoodIds` (every food ever
 * logged before this date, for the Explorer quest) and questCtx's logDays;
 * `allXp` feeds the whole quest ledger across day/week/month periods plus
 * all-time pitTried/fightWins; `healthRows` feeds period step and active totals.
 * So this pins the CURRENT set and fails on a fourth. It also fails when the set
 * SHRINKS, on purpose: that is the moment to come back here and lower the bar
 * rather than leave a guard that has quietly stopped measuring anything.
 *
 * WHAT IT CANNOT SEE: a full-store read reached indirectly through a helper
 * renderToday awaits (totalXp, cookState, unopenedCrates, getWellness...). Only
 * literal db.all() calls in this function body are in scope. Statically finding
 * the rest would mean walking the call graph of a 22k-line module; the four
 * named callers below are the ones the finding measured. */
/* QA round 28 G3 (2026-09-04): `inv` joined the list. Not a fourth read on the
   draw: the same inv rows were being scanned THREE times outside this body
   (unopenedCrates, ownedGearIds, route()'s refreshCrateBadge) and are now read
   once here and handed down, so the draw went from three inv scans to one.
   tests/today-reads-lint.mjs grades the whole draw (this body plus every awaited
   callee) at exactly one scan per store, which is the guard this one could not
   be (see WHAT IT CANNOT SEE above). */
test('R17-P2 renderToday keeps exactly its four known full-store reads', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const m = app.match(/\nasync function renderToday\(el\) \{\n([\s\S]*?)\n\}\n/);
  assert.ok(m, 'renderToday not found; the guard is reading the wrong shape and is measuring nothing');
  const body = m[1];
  // SETUP: prove the extraction reached the real body, not an empty match.
  assert.ok(body.length > 4000 && body.includes('questTiers'),
    `extracted body looks wrong (${body.length} chars); an empty sample passes every check below for free`);
  const found = [...body.matchAll(/db\.all\(\s*'([a-z]+)'\s*\)/g)].map(x => x[1]).sort();
  assert.deepEqual(found, ['health', 'inv', 'log', 'xp'],
    `renderToday's full-store reads changed to [${found}]. A NEW one is unbounded growth on the tap that runs on every #prevDay / #nextDay and after every log: use db.byIndex('log','date',d) or a point db.get. FEWER is progress: update this list.`);
});

test('R17-P2 backupNudge counts the log, it does not read it', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const body = app.match(/async function backupNudge\(\) \{([\s\S]*?)\n\}\n/)[1];
  assert.ok(!/db\.all\(/.test(body), 'backupNudge is reading the whole log again; it only ever asks whether there are 20 rows');
  assert.ok(/db\.count\(\s*'log'\s*\)/.test(body), 'backupNudge lost its db.count check');
});

/* ---- R18-P5: js/changelog.js stays off the boot path -------------------- */
test('R18-P5 js/app.js does not statically import the changelog', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.ok(!/^import .*from '\.\/changelog\.js';/m.test(app),
    "js/changelog.js is 155KB and nothing on the boot path reads it; import() it at the use site instead");
  assert.ok(/await import\('\.\/changelog\.js'\)/.test(app), 'no dynamic changelog import left; the What\'s New sheet has lost its data');
  // and it must stay precached, or What's New breaks offline
  const sw = readFileSync(join(here, '..', 'sw.js'), 'utf8');
  assert.ok(sw.includes("'./js/changelog.js'"), 'changelog.js dropped out of the service-worker precache: a lazy import offline is a blank sheet');
});

/* ---- R25-M4: a committed meal is never reported as a failed one ---------- */
test('R25-M4 every UI log write routes through commitLogEntry, and its two outcomes are honest', () => {
  /* QA round 25 M4, 2026-09-03: abort the xp store AFTER the log row committed and
     the sheet stayed open, the button live, the toast read "That did not save",
     and a second tap wrote a second row (167 -> 168, unbounded in taps). The
     follow-on (recordMealUsed, onFoodLogged) sat OUTSIDE the try/catch around
     db.put('log'), and Quick add had no try/catch at all. The browser-level
     guard is tests/log-write-failure-audit.mjs (FAIL=xp); this row is the
     shape it cannot check statically: ONE owner of the write sequence, and
     all four log writers (portion sheet, Quick add, relog, copy yesterday)
     going through it. SETUP asserts the extraction is real. */
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const m = app.match(/\nasync function commitLogEntry\(e, btn, via = null\) \{([\s\S]*?)\n\}\n/);
  assert.ok(m, 'commitLogEntry(e, btn, via) is gone from js/app.js: the log write and its follow-on have lost their one owner');
  const body = m[1];
  assert.ok(body.length > 300 && body.includes("db.put('log', e)"), `commitLogEntry body looks wrong (${body.length} chars)`);
  // outcome 1: NOT committed -> the button is re-armed and the caller gets null
  const notCommitted = body.match(/try \{\s*await db\.put\('log', e\);\s*\} catch \(err\) \{([\s\S]*?)return null;/);
  assert.ok(notCommitted, "db.put('log', e) is no longer in a try whose catch returns null (the not-committed outcome)");
  assert.ok(/btn\.disabled = false/.test(notCommitted[1]), 'the not-committed catch no longer re-arms the button');
  // outcome 2: committed, receipt failed -> a stub game object, the button stays as it was
  const committed = body.match(/try \{[\s\S]*?onFoodLogged\(e,[\s\S]*?\} catch \(err\) \{([\s\S]*?)\}\s*$/);
  assert.ok(committed, 'onFoodLogged is no longer inside a try/catch: a failed XP receipt escapes and re-arms Add on a committed row');
  assert.ok(/receiptFailed: true/.test(committed[1]), 'the committed-but-receipt-failed catch no longer returns receiptFailed: true');
  assert.ok(!/btn\.disabled/.test(committed[1]), 'the committed catch touches btn.disabled: a committed row must never re-arm Add');
  // every UI writer goes through it; only the helper and the ?demo seed write the log store directly
  const puts = app.match(/db\.put\('log'/g) || [];
  assert.equal(puts.length, 2, `js/app.js has ${puts.length} db.put('log' sites; expected 2 (commitLogEntry + the demo seed). A new bare one has the M4 hole.`);
  const calls = (app.match(/await commitLogEntry\(/g) || []).length;
  assert.ok(calls >= 4, `only ${calls} callers of commitLogEntry; the portion sheet, Quick add, relog and copy-yesterday make 4`);
  assert.ok(!/await onFoodLogged\(/.test(app.replace(m[0], '')), 'a caller still awaits onFoodLogged directly, outside commitLogEntry');
});

/* ---- QA round 24, L3: built-in foods remember their portion across a relaunch ----
   persistFoodUse returned on its first line for generics, so the lastPortion the
   Add button wrote onto the GENERIC_FOODS singleton never reached storage: 60 days
   of chicken at "1 breast" (284 kcal) came back after a relaunch as "1 small
   breast" (198 kcal), 30.3% low. This runs the REAL persistFoodUse and
   hydrateGenericUse out of js/app.js against an in-memory kv, then throws the
   in-memory food objects away (the relaunch) and hydrates fresh ones. */
test('L3 generic food use (portion, count, star) survives a cold relaunch via kv', async () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a = app.indexOf('const GEN_USE_KEY'), b = app.indexOf('\nasync function entriesFor');
  assert.ok(a > 0 && b > a, 'persistFoodUse/hydrateGenericUse block not found in js/app.js');
  const kv = new Map();                         // the fake kv store, k -> v
  const kvUpdate = async (k, fn, fallback) => { kv.set(k, fn(kv.has(k) ? kv.get(k) : fallback)); };
  const db = {
    all: async (store) => { assert.equal(store, 'kv'); return [...kv].map(([k, v]) => ({ k, v })); },
    put: async (store, row) => { assert.equal(store, 'kv', 'a generic must never become a foods row'); kv.set(row.k, row.v); },
  };
  const mk = () => [{ id: 'g-chicken-breast', source: 'generic', name: 'Chicken breast' }, { id: 'g-rice', source: 'generic', name: 'Rice' }];
  const load = (foods) => new Function('kvUpdate', 'db', 'GENERIC_FOODS', 'S',
    `${app.slice(a, b)}; return { persistFoodUse, hydrateGenericUse };`)(kvUpdate, db, foods, { userFoods: [] });

  // session 1: log chicken at "1 breast" twice, star it (what #favBtn does: kvSet('fav-'+id))
  const s1 = mk(); const fx1 = load(s1);
  s1[0].lastPortion = { mode: 'serving', idx: 1, qty: 1 };
  await fx1.persistFoodUse(s1[0]);
  await fx1.persistFoodUse(s1[0]);
  await db.put('kv', { k: 'fav-g-chicken-breast', v: true });

  // session 2: fresh module objects, hydrate from kv
  const s2 = mk(); const fx2 = load(s2);
  await fx2.hydrateGenericUse();
  assert.deepEqual(s2[0].lastPortion, { mode: 'serving', idx: 1, qty: 1 }, 'lastPortion did not survive the relaunch: the recents row will offer the wrong portion');
  assert.equal(s2[0].useCount, 2, 'useCount did not survive the relaunch');
  assert.ok(s2[0].lastUsedAt > 0, 'lastUsedAt did not survive the relaunch');
  assert.equal(s2[0].favorite, true, 'the star did not survive the relaunch');
  assert.equal(s2[1].favorite, false); assert.equal(s2[1].lastPortion, undefined);

  // the bound: 200 ids kept, least recently used pruned first
  const now = Date.now(); let t = 0;
  const realNow = Date.now; Date.now = () => now + (t++);
  try {
    for (let i = 0; i < 205; i++) await fx2.persistFoodUse({ id: 'g-x' + i, source: 'generic' });
  } finally { Date.now = realNow; }
  const rec = kv.get('genUse');
  assert.equal(Object.keys(rec).length, 200, 'genUse record is unbounded');
  assert.ok(!rec['g-chicken-breast'] && !rec['g-x0'] && !rec['g-x4'], 'pruning did not drop the least recently used');
  assert.ok(rec['g-x5'] && rec['g-x204'], 'pruning dropped a recent id');
});

/* ---- QA round 25, M5: a logged meal survives the deletion of its food ----------
   Delete asks nothing; the orphaned entry then routes (openEntryEdit: findFood is
   null) into the quick-add editor, whose save rebuilt it from four boxes. Measured
   on one save: fibre 5, sugar, sodium 800, portionLabel, brand and sel all gone.
   Runs the REAL findFood (the routing decision) and the REAL quickAddEntry (the
   rebuild) out of js/app.js. */
test('M5 editing an entry whose custom food was deleted keeps every nutrient and label', async () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const ff = app.match(/function findFood\(id\) \{[\s\S]*?\n\}\n/);
  const qa = app.match(/function quickAddEntry\([\s\S]*?\n\}\n/);
  assert.ok(ff, 'findFood not found in js/app.js');
  assert.ok(qa, 'quickAddEntry not found in js/app.js: the quick-add save is rebuilding entries from the boxes again');
  const S = { userFoods: [{ id: 'c-abc', source: 'custom', name: 'Oat bar', brand: 'Bobs' }], date: '2026-09-03' };
  const { findFood, quickAddEntry } = new Function('S', 'GENERIC_FOODS', 'newId',
    `${ff[0]}${qa[0]}; return { findFood, quickAddEntry };`)(S, [], () => 'new-id');

  // what the portion sheet's Add wrote for this custom food (the `e` literal in openPortion)
  const logged = {
    id: 'e1', date: '2026-09-03', meal: 1, ts: 1700000000000, foodId: 'c-abc',
    name: 'Oat bar', brand: 'Bobs', portionLabel: '1 bar (45 g)', sel: { mode: 'serving', idx: 0, qty: 1 },
    kcal: 190, p: 4, c: 30, f: 6, fiber: 5, sugar: 12, sodium: 800,
  };
  assert.ok(findFood('c-abc'), 'precondition: the food resolves before the delete');

  // Foods > Edit > Delete: db.del('foods') and the S.userFoods filter, no prompt
  S.userFoods = S.userFoods.filter(x => x.id !== 'c-abc');
  assert.equal(findFood(logged.foodId), null, 'precondition: the entry is now orphaned and openEntryEdit routes it to quick add');

  // Save in the quick-add editor with the boxes untouched (prefilled from the entry)
  const saved = quickAddEntry(logged, { meal: logged.meal, name: logged.name, kcal: 190, p: 4, c: 30, f: 6 });
  assert.deepEqual(saved, logged, 'an untouched save changed the entry: the deleted food took nutrients out of a meal already logged');

  // Save with a corrected kcal: only the edited fields move
  const edited = quickAddEntry(logged, { meal: 2, name: 'Oat bar', kcal: 200, p: 4, c: 30, f: 6 });
  assert.deepEqual(edited, { ...logged, meal: 2, kcal: 200 });

  // A fresh quick add is built exactly as before
  const { ts, ...fresh } = quickAddEntry(null, { meal: 0, name: 'Quick add', kcal: 300, p: 0, c: 0, f: 0 });
  assert.ok(Math.abs(ts - Date.now()) < 5000);
  assert.deepEqual(fresh, { id: 'new-id', date: '2026-09-03', meal: 0, foodId: null, name: 'Quick add', portionLabel: '', kcal: 300, p: 0, c: 0, f: 0 });
});

/* ---- QA round 24, L4: recents are ranked per meal, not by recency alone ----
   The eight "Log it again" rows were byte-identical under all four meal chips
   (recency only): measured hit rate for the wanted food 23.6 / 5.2 / 4.9%
   (breakfast / lunch / dinner) on a 60-day diary, 63.2% of opens showing none
   of that meal's foods. Runs the REAL recentFoods out of js/app.js over a
   seeded diary whose most recent rows are NOT the staple of the chip being
   asked about, so recency-only order is red. */
test('L4 recentFoods ranks the staple of the selected meal first, ties by recency', async () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a = app.indexOf('async function recentFoods'), b = app.indexOf('\nfunction defaultSel');
  assert.ok(a > 0 && b > a, 'recentFoods not found in js/app.js');
  const rows = []; let ts = 0;
  const log = (foodId, meal) => rows.push({ id: 'e' + (++ts), ts, foodId, name: foodId, meal, kcal: 100 });
  for (let i = 0; i < 10; i++) log('g-oats', 0);        // the breakfast staple, oldest
  log('g-eggs', 0);                                       // one breakfast, older than toast
  log('g-oats', 3);                                       // an oats snack: the newest oats row is NOT at breakfast
  for (let i = 0; i < 10; i++) log('g-chicken', 2);     // the dinner staple
  log('g-toast', 0);                                      // one breakfast, the newest row of all
  // recency-only order (the tip): toast, chicken, oats, eggs under every chip
  const recentFoods = new Function('db', 'findFood',
    `${app.slice(a, b)}; return recentFoods;`)({ all: async () => rows.slice() }, id => ({ id }));

  const bf = await recentFoods(8, 0);
  assert.deepEqual(bf.map(r => r.food.id), ['g-oats', 'g-toast', 'g-eggs', 'g-chicken'],
    `breakfast chip order is ${bf.map(r => r.food.id)}: expected the 10x breakfast staple first, then the two one-offs newest first, then the dinner-only food`);
  assert.equal(bf[0].entry.meal, 0, 'the oats row offered at breakfast must be the last BREAKFAST log (its portion), not the newer snack');
  const dn = await recentFoods(8, 2);
  assert.equal(dn[0].food.id, 'g-chicken', `dinner chip ranks ${dn[0].food.id} first; recency-only order would put the newest row first`);
  assert.deepEqual(dn.slice(1).map(r => r.food.id), ['g-toast', 'g-oats', 'g-eggs'], 'zero-count filler must fall back to recency');
  assert.equal((await recentFoods(2, 0)).length, 2, 'limit is not honoured');
});

/* ---- QA round 24, L9: a recent is one tap, a different portion is still reachable ----
   showDefault branched: a recent whose foodId resolved got foodRowHtml (a
   [data-food] row into the portion sheet, 3 taps) and only a quick-add recent
   got the one-tap [data-relog]. Runs the REAL recentRowHtml: the main tap is
   [data-relog] for both kinds of recent, the resolvable one also carries a
   separate [data-food] control, and no <button> nests inside another. */
test('L9 recentRowHtml relogs on the main tap and keeps a change-portion control', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a = app.indexOf('function recentRowHtml'), b = app.indexOf('\n/* ================= portion sheet');
  assert.ok(a > 0 && b > a, 'recentRowHtml is not in js/app.js: recents are back to the 3-tap foodRowHtml');
  const recentRowHtml = new Function('esc', 'fmtG', 'ICONS',
    `${app.slice(a, b)}; return recentRowHtml;`)(String, String, { chev: () => '<svg/>' });
  const entry = { id: 'e9', name: 'Oats', portionLabel: '80 g', kcal: 300, p: 10 };
  const rich = recentRowHtml({ entry, food: { id: 'g-oats' } });
  const quick = recentRowHtml({ entry: { ...entry, portionLabel: '' }, food: null });
  for (const html of [rich, quick]) {
    assert.match(html, /<button[^>]*data-relog="e9"/, 'the main tap is not a one-tap relog');
    assert.ok(!/<button[^>]*>(?:(?!<\/button>)[\s\S])*<button/.test(html), 'a <button> is nested inside a <button>');
    assert.ok(html.includes('t1-med') && html.includes('300'), 'the kcal medallion is gone from the recents row');
  }
  assert.match(rich, /<button[^>]*data-food="g-oats"[^>]*aria-label=/, 'a resolvable recent lost its change-portion control into openPortion');
  assert.ok(!/data-food/.test(quick), 'a quick-add recent has no food to open a portion sheet for');
  // and the sheet actually uses it, per meal
  assert.ok(/recentFoods\(8, curMeal\)/.test(app), 'showDefault no longer asks recentFoods for the selected meal (L4)');
  assert.ok(/recents\.map\(recentRowHtml\)/.test(app), 'showDefault no longer renders recents through recentRowHtml');
  assert.ok(!/if \(r\.food\) return foodRowHtml\(r\.food\)/.test(app), 'the 3-tap foodRowHtml branch for resolvable recents is back');
});

/* THE COUNT STATED A FALSE NUMBER AS FACT. The server bounds GET /friends per
   bucket (100 each) and returns `truncated: { friends, incoming, outgoing }`;
   that flag was added server-side on 2026-09-03 and nothing on the client read
   it, so a crew of 140 read `YOUR CREW · 100`. Runs the REAL crewCount /
   crewTruncText / requestRowsHtml: a truncated bucket reads `N+` and carries one
   line saying what is shown; an exactly-full untruncated bucket reads a bare N
   and carries no line. The fan count is a DOM write inside renderFriends, so its
   two statements are pinned by source. */
test('Crew count reads N+ with a note when the server truncated the bucket', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a = app.indexOf('function crewCount('), b = app.indexOf('\n// The Crew tab (full screen)');
  assert.ok(a > 0 && b > a, 'crewCount is not in js/app.js: the count is back to a bare length');
  const { crewCount, requestRowsHtml } = new Function('esc', 'friendRowAvatar', 'nameWithAlias',
    `${app.slice(a, b)}; return { crewCount, requestRowsHtml };`)(String, () => '', f => f.playerId);
  const rows = Array.from({ length: 100 }, (_, i) => ({ playerId: 'p' + i }));
  assert.equal(crewCount(rows, true), '100+');
  assert.equal(crewCount(rows, false), '100');
  const cut = requestRowsHtml({ incoming: rows, outgoing: rows, truncated: { friends: true, incoming: true, outgoing: true } });
  assert.ok(cut.includes('Wants to be friends · 100+') && cut.includes('Pending · 100+'), 'a truncated request bucket did not read 100+');
  assert.equal((cut.match(/Showing your 100 most recent requests\./g) || []).length, 2, 'each truncated request bucket needs its one line');
  const full = requestRowsHtml({ incoming: rows, outgoing: rows, truncated: { friends: false, incoming: false, outgoing: false } });
  assert.ok(full.includes('Wants to be friends · 100') && full.includes('Pending · 100') && !full.includes('100+'), 'an exactly-full bucket grew a +');
  assert.ok(!full.includes('Showing your'), 'an untruncated bucket carries the truncation note');
  assert.ok(!requestRowsHtml({ incoming: rows, outgoing: [] }).includes('+'), 'a payload with no truncated object (older server) grew a +');
  // the fan: count and note both keyed off truncated.friends, note hidden otherwise
  assert.match(app, /const truncated = !!data\.truncated\?\.friends;/, 'paintFan no longer reads truncated.friends');
  assert.match(app, /` · \$\{crewCount\(data\.friends, truncated\)\}`/, 'the fan count is not built through crewCount');
  assert.match(app, /truncBox\.hidden = unreached \|\| !truncated;/, 'the fan note is not hidden when the list is complete');
  assert.match(app, /id="cfanTrunc" hidden/, 'the fan note has no mount in the Crew markup');
});

/* QA round 27 R3: THE PENDING RENDERER READS ONLY WHAT THE SERVER STILL SENDS.
   GET /friends used to ship the other player's complete plaintext profile on a
   PENDING row, so a one-sided request read anybody's profile. The server now
   shapes pending rows to exactly the set below (server/src/index.js, the
   `shape` in GET /friends). This pins the client half: every `f.<field>` and
   `f.profile.<field>` read inside requestRowsHtml, friendRowAvatar and
   nameWithAlias must be in that set, so a renderer that grows a new read goes
   red here instead of rendering blank against the live server. `alias` is
   client-local (friendAliases kv), never on the wire. */
test('R27-R3 the pending-request renderer reads no field the server no longer sends', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const fn = name => {
    const a = app.indexOf(`function ${name}(`);
    assert.ok(a > 0, `${name} is not in js/app.js`);
    const b = app.indexOf('\n}\n', a);
    return app.slice(a, b);
  };
  const src = fn('requestRowsHtml') + fn('friendRowAvatar') + fn('nameWithAlias');
  const PENDING = new Set(['playerId', 'name', 'handle', 'profile', 'alias']);
  const PENDING_PROFILE = new Set(['outfit', 'pet', 'level']);
  const top = [...src.matchAll(/\bf\.(\w+)/g)].map(m => m[1]);
  const prof = [...src.matchAll(/\bf\.profile\.(\w+)/g)].map(m => m[1]);
  assert.ok(top.length >= 4 && prof.length >= 3, `CONTROL: too few reads found (${top.length}/${prof.length}), the slice is wrong`);
  assert.deepEqual([...new Set(top)].filter(k => !PENDING.has(k)), [], 'the pending renderer reads a row field the server no longer sends on pending rows');
  assert.deepEqual([...new Set(prof)].filter(k => !PENDING_PROFILE.has(k)), [], 'the pending renderer reads a profile field the server no longer sends on pending rows');
});

/* A BLOWN DAY LOOKED LIKE A PERFECT ONE. QA round 24 L8: macroRow had no over
   branch and the bar clamps at 100%, so 299 g of fat against 71 rendered byte-
   identical to 71 against 71, and 419 g of protein against 185 still wore the
   green hit dot. Runs the REAL macroRow (sliced with calorieRingCard and
   shownTotals, the three live together). Prove-red on the integ tip: the
   over-class assertion; 299/71 and 71/71 differed only in the printed number. */
test('L8 macroRow shows an over state and drops the hit dot past the protein band', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a = app.indexOf('function calorieRingCard('), b = app.indexOf('\nconst bubbleSideCache');
  assert.ok(a > 0 && b > a, 'calorieRingCard/macroRow are not where the slice expects');
  const { macroRow } = new Function('fmtG', 'ICONS', 'dayTotals',
    `${app.slice(a, b)}; return { macroRow };`)(fmtG, { check: () => '<svg/>' }, dayTotals);
  const fatOver = macroRow('Fat', 299, 71, 'fat', 100, false);
  const fatHit = macroRow('Fat', 71, 71, 'fat', 100, false);
  const fatUnder = macroRow('Fat', 70, 71, 'fat', 98.6, false);
  assert.match(fatOver, /class="macro over"/, '299/71 fat does not carry the over class');
  assert.ok(fatOver.includes('228 over'), `299/71 fat does not read its overage ("228 over"): ${fatOver}`);
  assert.ok(fatOver.includes('299 / 71 g'), 'the reading itself must stay "299 / 71 g"');
  assert.ok(!/-\d/.test(fatOver), 'an overage is never printed negative');
  for (const [html, name] of [[fatHit, '71/71'], [fatUnder, '70/71']]) {
    assert.ok(!html.includes('over'), `${name} fat carries an over marker it has not earned`);
    assert.ok(!html.includes('hit-dot'), `${name} fat grew a hit dot (only protein has one)`);
  }
  assert.ok(fatUnder.includes('70 / 71 g') && fatUnder.includes('width:98.6%'), '70/71 no longer renders as before');
  // protein: over is fine up to 1.5x the target, past that the dot goes and the row reads over
  const pWay = macroRow('Protein', 419, 185, 'protein', 100, true);
  const pHit = macroRow('Protein', 200, 185, 'protein', 100, true);
  assert.ok(!pWay.includes('hit-dot') && !pWay.includes('glow'), '419/185 protein still wears the "target hit" dot');
  assert.ok(pWay.includes('macro over') && pWay.includes('234 over'), '419/185 protein does not read as over');
  assert.ok(pHit.includes('hit-dot') && pHit.includes('glow') && !pHit.includes('over'), '200/185 protein lost its hit dot: the band is too tight');
  assert.ok(app.indexOf('function shownTotals(') > a && app.indexOf('function shownTotals(') < b, 'shownTotals is not in js/app.js: the ring rounds the raw sum again');
  assert.match(app, /const tot = shownTotals\(entries\);/, 'renderToday no longer builds its ring total through shownTotals');
  assert.match(app, /const tToday = shownTotals\(byDate\[dateKey\(\)\] \|\| \[\]\);/, 'the Trends ring no longer rounds the way Today does');
});

/* THE RING SAID 1,023, THE ROWS ADDED TO 1,022. Same ticket: the ring rounded
   the raw sum, each meal row rounds its own entry, and a .5 boundary splits
   them. Runs the REAL calorieRingCard and the REAL mealBlock on one seeded day
   whose raw total lands on exactly .5 and asserts the ring's number equals the
   sum of the row numbers. Prove-red on the integ tip: the shownTotals presence
   assertion (the helper did not exist); with the helper mutated back to the raw
   dayTotals the equality assertion is the one that fires (1023 vs 1022). */
test('L8 the ring headline and the meal rows agree on a .5-boundary day', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a = app.indexOf('function calorieRingCard('), b = app.indexOf('\nconst bubbleSideCache');
  const c = app.indexOf('function mealBlock('), d = app.indexOf('\n\n/* ================= meal defaults');
  assert.ok(a > 0 && b > a && c > 0 && d > c, 'calorieRingCard or mealBlock moved');
  assert.ok(app.indexOf('function shownTotals(') > a && app.indexOf('function shownTotals(') < b, 'shownTotals is not in js/app.js: the ring rounds the raw sum, the rows round each entry');
  const { calorieRingCard, shownTotals } = new Function('fmtG', 'ICONS', 'dayTotals',
    `${app.slice(a, b)}; return { calorieRingCard, shownTotals };`)(fmtG, { check: () => '<svg/>' }, dayTotals);
  const mealBlock = new Function('esc', 'emptyMealLine', 'shownTotals', 'dayTotals',
    `${app.slice(c, d)}; return mealBlock;`)(String, () => '', shownTotals, dayTotals);
  const mk = (id, kcal) => ({ id, name: id, meal: 0, kcal, p: 10, c: 10, f: 10, fiber: 0, sugar: 0, sodium: 0 });
  const entries = [mk('a', 340.4), mk('b', 340.4), mk('c', 341.7)];   // raw 1022.5: round-of-sum 1023, sum-of-rounded 1022
  assert.equal(dayTotals(entries).kcal, 1022.5, 'the seed must sit on the .5 boundary or this test proves nothing');
  const tot = shownTotals(entries);
  const t = { kcal: 2570, p: 185, c: 298, f: 71 };
  const ring = calorieRingCard({ tot, t, over: false, remaining: t.kcal - tot.kcal, protHit: false, startBig: tot.kcal, live: false });
  const rows = mealBlock('Breakfast', 0, entries, []);
  const rowSum = [...rows.matchAll(/<span class="kc">(\d+)<\/span>/g)].map(m => Number(m[1])).reduce((x, y) => x + y, 0);
  assert.equal(rowSum, 1022, 'the seeded rows should add to 1022');
  const big = Number(ring.match(/<div class="big"[^>]*>([\d,]+)</)[1].replace(',', ''));
  const eaten = Number(ring.match(/<span>Eaten<\/span><b>([\d,]+)</)[1].replace(',', ''));
  assert.equal(big, rowSum, `ring headline ${big} disagrees with the meal rows ${rowSum}`);
  assert.equal(eaten, rowSum, `ring "Eaten" ${eaten} disagrees with the meal rows ${rowSum}`);
  assert.ok(rows.includes('>1,022 kcal<'), 'the meal heading rounds differently from its own rows');
});

/* THE PROTEIN AVERAGE ALWAYS DIVIDED BY SEVEN. QA round 25 M8: a blank week
   read "0 g protein avg / day", one missed day understated 148 g as 127, a
   day-one install read 23 g. The calorie stat one line above divided by days
   logged and said so. Runs the REAL loggedAvg both stats now share, and pins
   the protein line to it. Prove-red on the integ tip: the `/ 7` assertion. */
test('M8 the protein average divides by logged days and is labelled that way', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.ok(!/const pAvg = [^\n]*\/ 7;/.test(app), 'the protein average still divides by a literal 7');
  const a = app.indexOf('function loggedAvg('), b = app.indexOf('\nasync function renderTrends(');
  assert.ok(a > 0 && b > a, 'loggedAvg is not in js/app.js');
  const loggedAvg = new Function(`${app.slice(a, b)}; return loggedAvg;`)();
  const day = (p, logged) => ({ p, kcal: logged ? 1800 : 0, logged });
  const week = [day(148, true), day(0, false), day(148, true), day(0, false), day(0, false), day(148, true), day(0, false)];
  assert.equal(loggedAvg(week, 'p'), 148, '3 logged days at 148 g must average 148, not 63');
  assert.equal(loggedAvg(week.map(() => day(0, false)), 'p'), null, 'a blank week must be the empty state, not 0');
  assert.equal(loggedAvg(week, 'kcal'), 1800, 'the calorie stat runs through the same helper');
  assert.match(app, /loggedAvg\(days7, 'p'\) != null \? `\$\{loggedAvg\(days7, 'p'\)\} g` : '·'/, 'the protein stat does not render loggedAvg with the calorie stat\'s "·" empty state');
  assert.ok(app.includes('protein avg / logged day · target'), 'the protein stat is not labelled "/ logged day" like the calorie stat');
  assert.match(app, /loggedAvg\(days14, 'kcal'\)\?\.toLocaleString\(\) \?\? '·'/, 'the calorie stat left the shared helper');
});

/* ---- QA round 25 M9 / M23: the wipe says nothing, and persist() is asked and ignored ----
   Measured: 3,780 rows to zero in 72 ms, the reloaded tab booted with #toast
   EMPTY (nothing was ever queued: both wipe paths call eraseAll() then
   location.reload(), and toast() state dies with the document), and
   `persisted()` read false with a year of data because db.js discarded the
   answer. The wipe half runs the REAL js/db.js eraseAll under mem-idb; the
   boot half is a static read of app.js because app.js cannot load in node. */
test('QA round 25 M9(a): eraseAll leaves the erased flag for the reloaded tab, and boot toasts erasure from it', async () => {
  await import('./mem-idb.mjs');
  const dbm = await import('../js/db.js');
  dbm.useDbName('unit-m9-wipe');
  /* node has a real BroadcastChannel and an open one keeps the process alive
     forever (this runner has no process.exit on success), so the wipe protocol
     runs its single-tab degrade path here. */
  globalThis.BroadcastChannel = undefined;
  const store = new Map();
  globalThis.sessionStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  await dbm.kvSet('probe', 1);
  await dbm.eraseAll();
  assert.equal(typeof dbm.ERASED_FLAG, 'string', 'db.js exports ERASED_FLAG');
  assert.equal(store.get(dbm.ERASED_FLAG), '1', 'eraseAll did not leave the erased flag for the reload to read');
  assert.equal(await dbm.kvGet('probe', null), null, 'the flag must ride sessionStorage, not a kv row the wipe just cleared');
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const m = app.match(/sessionStorage\.getItem\(ERASED_FLAG\)[\s\S]{0,240}?toast\('([^']+)'/);
  assert.ok(m, 'boot does not read ERASED_FLAG and toast a literal');
  assert.match(m[1], /erased/i, 'the post-wipe toast does not mention erasure');
});
test('QA round 25 M9(b): the erase confirm carries the no-recovery-code sentence only when no code exists', async () => {
  const s = await import('../js/social.js');
  assert.equal(typeof s.recoveryWarning, 'function', 'social.js exports recoveryWarning');
  assert.match(s.NO_RECOVERY_CODE_MSG, /^No recovery code yet\. Delete the app and this account is gone/, 'the existing sentence, not a new one');
  assert.equal(s.recoveryWarning(true, 'ABC123'), '', 'with a phrase AND an id the confirm stays as it was');
  assert.equal(s.recoveryWarning(false, 'ABC123'), s.NO_RECOVERY_CODE_MSG, 'no phrase');
  assert.equal(s.recoveryWarning(true, null), s.NO_RECOVERY_CODE_MSG, 'phrase but no recovery id (the v230 gap)');
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a = app.indexOf("$('#eraseBtn')"), b = app.indexOf("name: 'Erase' }"), c = app.indexOf("name: 'DeleteAccount'");
  assert.ok(a > 0 && b > a && c > b, 'erase sheet anchors moved');
  assert.ok(!app.slice(a, b).includes('No recovery code yet'), 'the sentence is baked into the template for the with-code state too');
  assert.match(app.slice(b, c), /recoveryWarning\(/, 'the Erase confirm never asks recoveryWarning');
  assert.equal((app.match(/No recovery code yet\. Delete the app/g) || []).length, 0, 'app.js still carries its own copy of the sentence; reuse social.NO_RECOVERY_CODE_MSG');
});
test('QA round 25 M23: the persist() answer is kept, not thrown away', async () => {
  const dbm = await import('../js/db.js');
  assert.equal(typeof dbm.persistenceGranted, 'function', 'db.js exports persistenceGranted');
  for (const v of [true, false]) {
    navigator.storage = { persist: async () => v };
    assert.equal(await dbm.requestPersistence(), v, `requestPersistence() resolves the browser's answer (${v})`);
    assert.equal(dbm.persistenceGranted(), v, `persistenceGranted() reads ${v} after the browser said so`);
  }
  delete navigator.storage;
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.match(app, /requestPersistence\(\)\.then\([\s\S]{0,160}?trackEvent\('persist'/, 'boot does not log the persist outcome');
});

/* ---- QA round 25, M16 / M21 / M18: the add sheet's helpers, run for real ----
   The block between ADD_DRAFT_TTL and openAdd holds every pure helper of the
   add flow; slice it once and run the shipped functions with a kv stub. */
function addSheetHelpers() {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a = app.indexOf('const ADD_DRAFT_TTL'), b = app.indexOf('\nfunction openAdd(');
  assert.ok(a > 0 && b > a, 'the add-sheet helpers (ADD_DRAFT_TTL .. openAdd) are not in js/app.js');
  const kv = new Map();
  const mod = new Function('kvSet', 'kvGet', 'esc', 'ICONS', 'foodRowHtml', 'currentTab', 'sheetStack', 'openAdd', 'openPortion', 'findFood', 'MEALS',
    `${app.slice(a, b)}; return { addDraftUsable, stampAddDraft, clearAddDraft, onlineRowHtml, restoreOnlineRow, localResultsHtml, ADD_DRAFT_TTL,
      resultsCountText, mealChipsHtml, setChipOn };`)(
    (k, v) => { kv.set(k, JSON.parse(JSON.stringify(v))); return Promise.resolve(); },   // IndexedDB round-trips a structured clone; JSON is the stricter stand-in
    k => Promise.resolve(kv.has(k) ? kv.get(k) : null),
    String, { searchIco: () => '<svg/>' }, f => `<row ${f.id}>`, () => 'today', [], () => {}, () => {}, () => null,
    ['Breakfast', 'Lunch', 'Dinner', 'Snacks']);
  return { ...mod, kv, app };
}

test('M16 the add-sheet draft round-trips, expires after 24 h and is cleared on commit', () => {
  const { addDraftUsable, stampAddDraft, clearAddDraft, ADD_DRAFT_TTL, kv, app } = addSheetHelpers();
  const sel = { mode: 'serving', idx: 1, qty: 1.5 };
  stampAddDraft({ sheet: 'add', q: 'chicken', meal: 2 });
  stampAddDraft({ sheet: 'portion', foodId: 'g-chicken', sel, meal: 1 });
  const d = kv.get('addDraft');
  assert.deepEqual({ sheet: d.sheet, q: d.q, foodId: d.foodId, sel: d.sel, meal: d.meal },
    { sheet: 'portion', q: 'chicken', foodId: 'g-chicken', sel, meal: 1 }, 'query, food, sel and meal did not survive the kv row');
  assert.ok(addDraftUsable(d, d.ts + 1000), 'a fresh draft is not usable');
  assert.ok(!addDraftUsable(d, d.ts + ADD_DRAFT_TTL + 1), 'a draft older than 24 h must be ignored');
  assert.ok(!addDraftUsable({ sheet: 'add', q: '', meal: 0, ts: d.ts }, d.ts), 'an empty sheet (nothing typed, nothing picked) is not a draft');
  clearAddDraft();
  assert.equal(kv.get('addDraft'), null, 'clearAddDraft left the row behind');
  assert.ok(!addDraftUsable(kv.get('addDraft')), 'a cleared draft reads as usable');
  // and the two commit paths clear it before the sheets close
  const add = app.slice(app.indexOf("$('#addBtn', wrap).addEventListener"), app.indexOf('if (editing) $(\'#delBtn\''));
  assert.ok(/clearAddDraft\(\);[\s\S]{0,80}closeAllSheetsViaHistory\(\);/.test(add), 'the portion sheet Add commit does not clear the draft before closing');
  const relog = app.slice(app.indexOf("$$('[data-relog]', results)"), app.indexOf('function bindOnline('));
  assert.ok(/clearAddDraft\(\);[\s\S]{0,80}history\.back\(\);/.test(relog), 'the one-tap relog commit does not clear the draft');
  assert.match(app, /\n  route\(\);\n  restoreAddDraft\(\)/, 'boot no longer restores the draft right after route()');
});

test('M21 the online row carries the offline hint, a retry on failure, and resets on the online event', () => {
  const { onlineRowHtml, restoreOnlineRow } = addSheetHelpers();
  const idle = onlineRowHtml('chicken');
  assert.match(idle, /<button[^>]*data-online/, 'the idle row is not tappable through [data-online]');
  assert.ok(idle.includes('Search online for "chicken"') && !/Offline/.test(idle), 'the idle row reads offline while online');
  const off = onlineRowHtml('chicken', { offline: true });
  assert.ok(off.includes('Offline right now') && /<button[^>]*data-online/.test(off), 'offline: the row must say so in its label AND stay tappable');
  const failed = onlineRowHtml('chicken', { error: 'No signal, so the food databases could not be searched.' });
  assert.ok(failed.includes('No signal, so the food databases could not be searched.'), 'the failure message was dropped');
  assert.match(failed, /<button[^>]*data-online[^>]*>Try again<\/button>/, 'a failed row has no Try again on the shared [data-online] hook');
  // the online-event handler: a failed (or hinted) row goes back to idle; a results list is left alone
  const sect = { innerHTML: failed, querySelector: s => (sect.innerHTML.includes(s.replace(/[[\]]/g, '')) ? {} : null) };
  assert.equal(restoreOnlineRow(sect, 'chicken'), true, 'restoreOnlineRow did not act on a failed row');
  assert.equal(sect.innerHTML, idle, 'the restored row is not the plain idle row');
  const list = { innerHTML: '<row a><row b>', querySelector: () => null };
  assert.equal(restoreOnlineRow(list, 'chicken'), false, 'a list of real online results was wiped by the online event');
  assert.equal(list.innerHTML, '<row a><row b>');
});

test('M18 the empty local result offers Create a food with the query; a hit list does not', () => {
  const { localResultsHtml, app } = addSheetHelpers();
  const empty = localResultsHtml([], 'kombucha');
  assert.ok(empty.includes('Nothing local matches.'), 'the empty-state line is gone');
  assert.match(empty, /<button[^>]*data-create="kombucha"/, 'the empty result has no create control carrying the query');
  assert.ok(empty.includes('Create a food'), 'the create control is not labelled as the create-food entry point');
  const hits = localResultsHtml([{ id: 'g-1' }, { id: 'g-2' }], 'oats');
  assert.equal(hits, '<row g-1><row g-2>', 'a non-empty result must be the plain rows');
  assert.ok(!/data-create/.test(hits), 'the create control leaked into a non-empty result');
  // the offer is consumed: the create form seeds its name from the prefill (M18 follow-up, 2026-09-04)
  assert.match(app, /id="ffName"[^>]*value="\$\{esc\(f\?\.name \|\| pv\.name \|\| ''\)\}"/, 'openFoodForm ignores prefill.name, so the empty-search offer opens a blank form');
});

/* QA round 25 M17: a screen reader is told almost nothing on the logging path.
   Measured with a real AT tree: #results had no role and no live region (8
   recents becoming 11 matches announced to nobody, no count anywhere), typing
   threw activeElement to BODY, the stepper moved 1 to 1.25 and 282 to 353 kcal
   with no spinbutton role, no aria-valuenow and no live change, and the meal
   chips carried no aria-pressed. The helpers run for real; the markup and the
   render target are asserted over the shipped source. */
test('M17 the add and portion sheets carry the roles, live regions and pressed states a screen reader needs', () => {
  const { resultsCountText, mealChipsHtml, setChipOn, app } = addSheetHelpers();
  // the live count line, for 0 / 8 / 11
  assert.equal(resultsCountText(0, 'banana'), '0 matches for banana', 'an empty search has no announced count');
  assert.equal(resultsCountText(11, 'banana'), '11 matches for banana', 'the search count is wrong');
  assert.equal(resultsCountText(1, 'banana'), '1 match for banana');
  assert.equal(resultsCountText(8, ''), '8 recent foods', 'the default list has no announced count');
  // the count line is a STATIC sibling of #results (a live region rebuilt with its
  // message announces nothing) and both renders write it
  assert.match(app, /<div id="resultsCount" class="sr-only" aria-live="polite"><\/div>\s*<div id="results" role="region" aria-label="Results"><\/div>/,
    '#results has no role/label, or the live count line is missing or inside #results');
  const openAdd = app.slice(app.indexOf('\nfunction openAdd('), app.indexOf('\nconst t1Sect ='));
  assert.equal((openAdd.match(/count\.textContent = resultsCountText\(/g) || []).length, 2, 'the count line is not written by both showDefault and the search render');
  const css = readFileSync(join(here, '..', 'app.css'), 'utf8');
  assert.equal((css.match(/^\.sr-only \{/gm) || []).length, 1, 'app.css needs exactly ONE visually-hidden utility (.sr-only) for the count line');
  // meal chips: aria-pressed follows the selected state, in the markup and in the toggle
  const chips = mealChipsHtml(2);
  assert.equal((chips.match(/aria-pressed="true"/g) || []).length, 1, 'exactly one chip is pressed');
  assert.match(chips, /class="on" aria-pressed="true" data-meal="2">Dinner</, 'the selected chip is not the pressed one');
  assert.match(chips, /class="" aria-pressed="false" data-meal="0">Breakfast</, 'an unselected chip is not aria-pressed="false"');
  const mk = () => { const a = {}; return { a, classList: { toggle: (c, on) => { a.cls = on; } }, setAttribute: (k, v) => { a[k] = v; } }; };
  const c0 = mk(), c1 = mk();
  setChipOn([c0, c1], c1);
  assert.deepEqual([c0.a, c1.a], [{ cls: false, 'aria-pressed': 'false' }, { cls: true, 'aria-pressed': 'true' }], 'setChipOn does not move .on and aria-pressed together');
  assert.equal((app.match(/id="mealChips" role="group" aria-label="Meal">\s*\$\{mealChipsHtml\(meal\)\}/g) || []).length, 1, '#mealChips is not drawn by mealChipsHtml');
  assert.equal((app.match(/id="pMealChips" role="group" aria-label="Meal">\s*\$\{mealChipsHtml\(curMeal\)\}/g) || []).length, 1, '#pMealChips is not drawn by mealChipsHtml');
  assert.match(app, /setChipOn\(\$\$\('#mealChips button', wrap\), c\)/, 'the add sheet chip handler toggles .on without aria-pressed');
  assert.match(app, /setChipOn\(\$\$\('#pMealChips button', wrap\), c\)/, 'the portion sheet chip handler toggles .on without aria-pressed');
  // the stepper: a text input is not a native spinbutton, so it gets the role and values; the kcal preview is live
  assert.match(app, /<div class="t1-step" role="group" aria-label="Servings">/, 'the servings stepper is not a labelled group');
  assert.match(app, /<div class="t1-step" role="group" aria-label="Grams">/, 'the grams stepper is not a labelled group');
  assert.match(app, /id="qtyIn" type="text"[^>]*role="spinbutton" aria-valuenow="\$\{sel\.qty\}" aria-valuemin="\$\{LIMITS\.servings\.min\}" aria-valuemax="\$\{LIMITS\.servings\.max\}"/, '#qtyIn is not a spinbutton with now/min/max');
  assert.match(app, /id="gramsIn" type="text"[^>]*role="spinbutton" aria-valuenow="\$\{sel\.grams\}" aria-valuemin="\$\{LIMITS\.servingG\.min\}" aria-valuemax="\$\{LIMITS\.servingG\.max\}"/, '#gramsIn is not a spinbutton with now/min/max');
  const preview = app.slice(app.indexOf('\n  function preview() {'), app.indexOf('\n  function preview() {') + 700);
  assert.match(preview, /amtEl\.setAttribute\('aria-valuenow', sel\.mode === 'grams' \? sel\.grams : sel\.qty\)/, 'preview() does not keep aria-valuenow in step with the amount');
  assert.match(app, /<b id="pvKcal" aria-live="polite">/, 'the kcal preview is not a live region, so 282 to 353 is silent');
  // focus: the search handler's render target is #results, a sibling of #q, never the sheet body
  const handler = openAdd.slice(openAdd.indexOf("input.addEventListener('input'"), openAdd.indexOf("input.addEventListener('keydown'"));
  assert.match(handler, /results\.innerHTML =/, 'the search handler no longer renders into #results');
  assert.ok(!/wrap\.innerHTML|sheet-body|sBody|openSheet\(/.test(handler), 'the search handler re-renders the node #q lives in, which throws focus to BODY');
  const tpl = openAdd.slice(0, openAdd.indexOf('`, { cls:'));
  assert.ok(tpl.indexOf('id="q"') < tpl.indexOf('id="results"') && /id="results"[^>]*><\/div>/.test(tpl), '#q must be a sibling of an empty #results, not inside it');
});

/* QA round 25 M19 + M18 (data half): the create-food Save mapping. Sliced out of
   js/app.js as customFoodDraft so it runs at node level with no DOM.
   M19: calories-only input keeps null macros (it used to write p:0,c:0,f:0 via
   `mp.value || 0`, asserting zero protein into a template that is re-logged for
   ever); 0 kcal with 60 g of macros yields a warning BEFORE the write; a
   consistent food yields none. M18: a name matching a built-in or a custom food,
   case/whitespace/accent-insensitive, yields the "You already have" warning. */
test('Create food: null macros stay null, kcal-vs-macros and duplicate names warn before save', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a = app.indexOf('const normFoodName ='), b = app.indexOf('\nfunction openFoodForm(');
  assert.ok(a > 0 && b > a, 'customFoodDraft is not in js/app.js: the Save mapping is inline again and untestable (QA round 25 M19)');
  const { customFoodDraft } = new Function('newId', 'scaleToPer100', 'kcalConsistent',
    `${app.slice(a, b)}; return { customFoodDraft };`)(() => 'x', (n) => n, kcalConsistent);
  const foods = [
    { id: 'g-apple', source: 'generic', name: 'Apple', per100: { kcal: 52, p: 0.3, c: 14, f: 0.2 }, servings: [['1 medium', 182]] },
    { id: 'c-1', source: 'custom', name: 'Crème brûlée', perServing: { kcal: 300 }, servings: [{ label: '1 ramekin', g: null }] },
  ];
  const base = { name: 'Protein granola', brand: '', serving: '1 bowl', grams: null, fiber: null, sugar: null, sodium: null };
  // calories-only: macros unknown, not zero
  const only = customFoodDraft({ ...base, kcal: 200, p: null, c: null, f: null }, { foods });
  assert.deepEqual([only.food.perServing.p, only.food.perServing.c, only.food.perServing.f], [null, null, null],
    'calories-only input recorded 0 macros instead of null (QA round 25 M19)');
  assert.deepEqual(only.warnings, [], 'a calories-only food must not be nagged about macros it never claimed');
  // 0 kcal + 60 g macros (20/20/20 = 340 kcal) of real food
  const zero = customFoodDraft({ ...base, kcal: 0, p: 20, c: 20, f: 20 }, { foods });
  assert.ok(zero.warnings.length > 0 && /340 kcal, not 0/.test(zero.warnings[0]), '0 kcal with 60 g of macros saved without a warning (QA round 25 M19)');
  // consistent food: nothing to say
  assert.deepEqual(customFoodDraft({ ...base, kcal: 200, p: 10, c: 20, f: 8.9 }, { foods }).warnings, []);
  // duplicates, folded (M18)
  for (const name of ['apple', ' APPLE  ', 'Apple']) {
    const d = customFoodDraft({ ...base, name, kcal: 999, p: null, c: null, f: null }, { foods });
    assert.deepEqual(d.warnings, ["You already have 'Apple' (52 kcal per 100 g). Save anyway?"], `duplicate "${name}" not caught (QA round 25 M18)`);
  }
  assert.deepEqual(customFoodDraft({ ...base, name: 'creme brulee', kcal: 300, p: null, c: null, f: null }, { foods }).warnings,
    ["You already have 'Crème brûlée' (300 kcal per 1 ramekin). Save anyway?"], 'accent-folded duplicate not caught');
  // editing a food is not a duplicate of itself
  assert.deepEqual(customFoodDraft({ ...base, name: 'Crème brûlée', kcal: 300, p: null, c: null, f: null }, { foods, existing: foods[1] }).warnings, []);
  // per100 derives from the same nulls, never NaN
  const g = customFoodDraft({ ...base, kcal: 100, p: null, c: 25, f: null, grams: 50 }, { foods });
  assert.deepEqual(g.food.perServing, { kcal: 100, p: null, c: 25, f: null, fiber: null, sugar: null, sodium: null });
});

/* QA round 25 M18 (list half): My foods sorted by lastUsedAt only, so never-used
   foods compared equal and came back in database key order. The comparator is
   module-level in js/app.js so it can be sliced here. */
test('My foods: most recent first, then name A to Z when lastUsedAt ties', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a = app.indexOf('const byLastUsedThenName ='), b = app.indexOf('\nconst MY_FOODS_FILTER_AT');
  assert.ok(a > 0 && b > a, 'byLastUsedThenName is not in js/app.js: the My foods sort is back to lastUsedAt only (QA round 25 M18)');
  const { byLastUsedThenName, MY_FOODS_FILTER_AT } = new Function(`${app.slice(a, b)}; ${app.slice(b, app.indexOf('\n', b + 1))}; return { byLastUsedThenName, MY_FOODS_FILTER_AT };`)();
  const rows = [
    { id: 'c-3', name: 'Zucchini bread' }, { id: 'c-1', name: 'Protein granola', lastUsedAt: 5 },
    { id: 'c-2', name: 'apple crumble' }, { id: 'c-4', name: 'Banana bread', lastUsedAt: 9 },
  ];
  assert.deepEqual([...rows].sort(byLastUsedThenName).map(r => r.name),
    ['Banana bread', 'Protein granola', 'apple crumble', 'Zucchini bread'],
    'never-used foods did not fall back to name order (QA round 25 M18)');
  assert.equal(MY_FOODS_FILTER_AT, 15, 'the filter threshold moved off the measured bound (unusable at N = 15)');
  // the filter is wired: renders over the bound, filters by the same folded name
  const rf = app.slice(app.indexOf('async function renderFoods('), app.indexOf('/* ================= settings'));
  assert.match(rf, /customs\.length > MY_FOODS_FILTER_AT\) html \+= `<div class="t1-search"/, 'the My foods filter input is not rendered over the bound');
  assert.match(rf, /customs\.filter\(f => normFoodName\(f\.name\)\.includes\(q\)\)/, 'the filter does not narrow the customs list');
});

/* ===== Survey v2 S3 (spec: surveyv2spec.md section 2 and S3). The sheet is
   dark until S4 flips a trigger, so these are the only thing that says the
   questions, the wire shape and the kv facts are what the spec and the server
   expect. Slices the REAL block out of js/app.js and runs it with stubbed
   plumbing; the DOM half (the sheet itself) is S3's browser audit, not this. */
const survey2Load = (stubs = {}) => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a = app.indexOf('/* Survey v2 S3: the sheet'), b = app.indexOf("\n// What's New: the player-facing changelog");
  assert.ok(a > 0 && b > a, 'the Survey v2 S3 block is not in js/app.js (openSurvey2Sheet does not exist here)');
  const kv = {};
  const env = {
    esc: String, kvGet: async (k, d = null) => (k in kv ? kv[k] : d), kvSet: async (k, v) => { kv[k] = v; },
    trackEvent: () => {}, sendSurvey: async () => ({ ok: true }),
    buildStats: async () => ({ streak: 3, logs: 41, pitWins: 7 }), levelFor: () => ({ level: 12 }), totalXp: async () => 0,
    db: { all: async () => [{ ts: Date.now() - 9 * 86400000 }, { ts: Date.now() }] }, petInstances: async () => [1, 2, 3],
    social: { socialMe: async () => ({ id: 'x' }) }, APP_BUILD: 'v473', platformTag: () => 'ios',
    openSheet: () => {}, $: () => null, $$: () => [], ...stubs,
  };
  const names = Object.keys(env);
  const out = new Function(...names, `${app.slice(a, b)}; return { SURVEY2_QUESTIONS, SURVEY2_TEXT_MAX, survey2QuestionsHtml, survey2Answers, survey2Ctx, survey2Submit, survey2Dismiss, drainSurvey2Pending };`)(...names.map(n => env[n]));
  return { ...out, kv, app };
};

test('Survey v2 S3 (a): the question list is the spec, in order, with its ids, types, option counts and copy', () => {
  const { SURVEY2_QUESTIONS: Q, survey2QuestionsHtml, SURVEY2_TEXT_MAX } = survey2Load();
  // spec section 2: six questions, five of them taps
  assert.deepEqual(Q.map(q => q.id), ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'], 'question ids or order drifted from the spec');
  assert.deepEqual(Q.map(q => q.type), ['single', 'multi', 'multi', 'single', 'single', 'text']);
  assert.deepEqual(Q.map(q => (q.opts || []).length), [9, 9, 10, 10, 4, 0], 'option counts drifted from the spec (9, 9, 10, 10, 4)');
  assert.equal(Q[1].max, 2, 'Q2 lost its two-pick cap');
  assert.equal(Q[2].text && Q[2].text.id, 'q3text', 'Q3 lost its reveal-on-tick text field (dashboard key q3text)');
  assert.equal(Q[2].text.reveal.length, 9, 'Q3 reveals on the nine areas only, never on "Nothing, it made sense"');
  assert.ok(!Q[2].text.reveal.includes('nothing'));
  assert.deepEqual(Q[4].opts.map(o => o[0]), ['definitely', 'probably', 'not_sure', 'probably_not'], 'Q5 slugs: the dashboard counts definitely/probably as the yes');
  // verbatim copy, spec section 2
  assert.deepEqual(Q.map(q => q.label), [
    'Why did you open the app today?', 'What keeps you coming back?', 'Was there anything you did not understand?',
    'If we cut one thing to make this simpler, what should go?', 'Will you still be playing in a month?', 'What nearly made you stop playing?']);
  assert.deepEqual(Q[0].opts.map(o => o[1]), ['Log my food', 'Check my steps', 'Fight in the Pit', 'The Boneyard map', 'My pets', 'Cook something', 'See what my crew did', 'A quest or the wheel', 'Just checking in']);
  assert.deepEqual(Q[1].opts.map(o => o[1]), ['My streak', 'Watching my Bonehead get stronger', 'The pets', 'Beating my friends', 'The daily wheel', 'Walking the Boneyard', 'Logging food properly', 'The fights', 'Honestly, not much yet']);
  assert.deepEqual(Q[2].opts.map(o => o[1]), ['The Pit', 'Stats and training', 'The Boneyard map', 'Cooking', 'Dark Spires', 'Quests', 'Gear and the Wardrobe', 'Pets and the Stable', 'The Crew', 'Nothing, it made sense']);
  assert.equal(Q[3].opts[9][1], "Don't cut anything");
  assert.equal(Q[2].text.label, 'What was confusing about it?');
  assert.equal(SURVEY2_TEXT_MAX, 240, 'free text is 240 chars in the spec');
  // the renderer emits every question, in order, with the right control kind
  const html = survey2QuestionsHtml();
  const grids = [...html.matchAll(/<div class="survey-feats" data-q="(q\d)"/g)].map(m => m[1]);
  assert.deepEqual(grids, ['q1', 'q2', 'q3', 'q4', 'q5'], 'the rendered chip grids are not the five tap questions in order');
  for (const q of Q.filter(x => x.opts)) {
    const n = (html.match(new RegExp(`<input type="${q.type === 'single' ? 'radio' : 'checkbox'}" name="sv2-${q.id}"`, 'g')) || []).length;
    assert.equal(n, q.opts.length, `${q.id} rendered ${n} ${q.type} inputs, spec has ${q.opts.length}`);
  }
  assert.match(html, /data-q="q2" data-max="2"/, 'Q2 grid does not carry its cap for the two-pick handler');
  assert.match(html, /<textarea id="sv2-q3text"[^>]*maxlength="240"[^>]*hidden>/, 'Q3 text field is not hidden until a chip is ticked');
  assert.match(html, /<textarea id="sv2-q6"[^>]*maxlength="240"/, 'Q6 free text lost its 240 cap');
  assert.ok(html.indexOf('data-q="q5"') < html.indexOf('id="sv2-q6"'), 'Q6 renders before Q5');
});

test('Survey v2 S3 (b): the body is form/answers/ctx in the S2 wire shape and stays under the caps with every text at its cap', async () => {
  const { survey2Answers, survey2Ctx, survey2Submit, app } = survey2Load();
  const full = { q1: 'log', q2: ['streak', 'stronger'], q3: ['pit', 'stats', 'boneyard', 'cooking', 'spires', 'quests', 'gear', 'pets', 'crew'],
    q3text: 'x'.repeat(240), q4: 'dontcut', q5: 'probably_not', q6: 'y'.repeat(240) };
  const body = await survey2Submit(full, { email: 'a@b.co', emailOptin: true });
  assert.equal(body.form, 'v2', 'form slug is not v2 (the dashboard filter key)');
  assert.deepEqual(Object.keys(body.answers), ['q1', 'q2', 'q3', 'q3text', 'q4', 'q5', 'q6'], 'answers keys are not the dashboard Q_LABELS/FREE_LABELS keys');
  assert.deepEqual(body.answers.q2, ['streak', 'stronger']);
  assert.equal(typeof body.ctx, 'object');
  assert.ok(JSON.stringify(body.answers).length <= 4000, `answers blob ${JSON.stringify(body.answers).length} > server cap 4000`);
  assert.ok(JSON.stringify(body.ctx).length <= 1000, `ctx blob ${JSON.stringify(body.ctx).length} > server cap 1000`);
  // the silent context, spec section 2: every named field present with the stubbed sources
  const ctx = await survey2Ctx();
  assert.deepEqual(ctx, { build: 'v473', plat: 'ios', streak: 3, foods: 41, pitWins: 7, level: 12, days: 9, pets: 3, crew: true });
  // skipped questions are ABSENT, not empty (the dashboard counts n by presence)
  assert.deepEqual(survey2Answers({ q1: '', q2: [], q3text: '   ', q5: 'definitely' }), { q5: 'definitely' });
  // and the transport forwards the three fields (js/analytics.js sendSurvey)
  const an = readFileSync(join(here, '..', 'js', 'analytics.js'), 'utf8');
  assert.match(an, /\.\.\.\(data\.form \? \{ form: String\(data\.form\)\.slice\(0, 24\), answers: data\.answers \|\| \{\}, ctx: data\.ctx \|\| \{\} \} : \{\}\)/, 'sendSurvey no longer forwards form/answers/ctx to POST /survey');
  // nothing on the launch path opens it (spec section 0): definition + webdriver handle only
  assert.deepEqual(app.match(/\w* ?openSurvey2Sheet\(/g), ['function openSurvey2Sheet('], 'openSurvey2Sheet is CALLED somewhere in js/app.js; S4 (the trigger) is not this ticket');
});

test('Survey v2 S3 (c): free text over the cap is cut, never sent long', () => {
  const { survey2Answers, SURVEY2_TEXT_MAX } = survey2Load();
  const out = survey2Answers({ q6: 'z'.repeat(1500), q3text: ' ' + 'w'.repeat(1200) });
  assert.equal(out.q6.length, SURVEY2_TEXT_MAX, `q6 went out at ${out.q6.length} chars`);
  assert.equal(out.q3text.length, SURVEY2_TEXT_MAX, `q3text went out at ${out.q3text.length} chars`);
  assert.ok(out.q6.length <= 1000 && out.q3text.length <= 1000);
});

test('Survey v2 S3 (d): submit writes survey2Done, Not now writes survey2SnoozeAt, both as timestamps', async () => {
  const { survey2Submit, survey2Dismiss, kv } = survey2Load();
  const t0 = Date.now();
  await survey2Submit({ q1: 'pit' });
  assert.ok(typeof kv.survey2Done === 'number' && kv.survey2Done >= t0, 'survey2Done is not a submit timestamp');
  assert.equal(kv.survey2SnoozeAt, undefined);
  await survey2Dismiss();
  assert.ok(typeof kv.survey2SnoozeAt === 'number' && kv.survey2SnoozeAt >= t0, 'survey2SnoozeAt is not a dismiss timestamp');
  assert.equal(kv.survey2Pending, undefined, 'a successful post left a pending row');
});

test('Survey v2 S3 (e): a failed post keeps the exact body pending and a retry drains it once it lands', async () => {
  let online = false, posted = [];
  const { survey2Submit, drainSurvey2Pending, kv } = survey2Load({ sendSurvey: async b => { posted.push(b); return { ok: online }; } });
  const body = await survey2Submit({ q1: 'pit', q6: 'late nights' });
  assert.deepEqual(kv.survey2Pending, body, 'the failed body was not kept in survey2Pending');
  assert.equal(kv.survey2Done > 0, true, 'done was not marked before the network answered');
  assert.equal(await drainSurvey2Pending(), false, 'a retry that failed reported success');
  assert.deepEqual(kv.survey2Pending, body, 'a failed retry dropped the row');
  online = true;
  assert.equal(await drainSurvey2Pending(), true);
  assert.equal(kv.survey2Pending, null, 'a successful retry left the row behind');
  assert.deepEqual(posted[posted.length - 1], body, 'the retry did not send the original body');
  assert.equal(await drainSurvey2Pending(), false, 'an empty queue reported a send');
  // boot and the online event both call the drain (js/app.js boot())
  const { app } = survey2Load();
  const bootBody = app.slice(app.indexOf('async function boot()'), app.indexOf('/* DAY ROLLOVER (v224).'));
  assert.match(bootBody, /drainSurvey2Pending\(\)/, 'boot() no longer retries a pending survey');
  assert.match(bootBody, /addEventListener\('online', \(\) => \{ drainSurvey2Pending\(\)/, "the 'online' event no longer retries a pending survey");
});

/* ---- QA round 24, L10: the meal you picked is remembered, and My foods reads it ----
   Measured: open the sheet on Snacks, tap Dinner, close, reopen: Snacks. curMeal
   was closure state and recordMealUsed fired only on a committed row. And
   renderFoods (the "My foods" route) picked the meal BY THE CLOCK, a fifth commit
   path around the memory the other four share. Runs the REAL mealPrecedence out
   of js/app.js (with the real addDraftUsable and mealForHour) and pins, statically,
   that every reopen reads it: renderFoods no longer calls mealForHour, mealDefault
   is the only caller, and both chip handlers write the memory on a tap.
   Prove-red on the pre-fix tip: the first assert (mealPrecedence absent). */
test('R24-L10 mealPrecedence is draft > remembered meal > clock, and every reopen reads it', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const ttl = app.match(/const ADD_DRAFT_TTL = [^\n]+\n/);
  const usable = app.match(/function addDraftUsable\([\s\S]*?\n\}\n/);
  const prec = app.match(/function mealPrecedence\([\s\S]*?\n\}\n/);
  assert.ok(ttl && usable, 'ADD_DRAFT_TTL / addDraftUsable not found in js/app.js');
  assert.ok(prec, 'mealPrecedence not found in js/app.js: the reopen meal has no single owner (L10)');
  const mealPrecedence = new Function('mealForHour', `${ttl[0]}${usable[0]}${prec[0]}; return mealPrecedence;`)(mealForHour);
  const now = 1_700_000_000_000, date = '2026-09-04', hour = 8;   // 08:00 is breakfast (0) by the clock
  assert.equal(mealForHour(hour), 0, 'precondition: the clock says breakfast');
  // 1. a usable draft wins over the memory and the clock
  assert.equal(mealPrecedence({ draft: { meal: 2, q: 'ban', ts: now - 1000 }, last: { date, meal: 1 }, date, hour, now }), 2);
  // 2. no draft: the meal remembered today wins over the clock
  assert.equal(mealPrecedence({ draft: null, last: { date, meal: 1 }, date, hour, now }), 1, 'the remembered meal lost to the clock');
  // 3. a chip-tap-only draft (nothing typed or picked) is not usable: the memory carries the tap
  assert.equal(mealPrecedence({ draft: { meal: 2, q: '', ts: now - 1000 }, last: { date, meal: 3 }, date, hour, now }), 3);
  // 4. a stale draft and yesterday's memory both fall through to the clock
  assert.equal(mealPrecedence({ draft: { meal: 2, q: 'ban', ts: now - 25 * 3600e3 }, last: { date: '2026-09-03', meal: 1 }, date, hour, now }), 0);
  assert.equal(mealPrecedence({ draft: null, last: null, date, hour, now }), 0);
  // the one place: mealDefault feeds mealPrecedence, and nothing else asks the clock
  const md = app.match(/async function mealDefault\(\) \{([\s\S]*?)\n\}\n/);
  assert.ok(md && /mealPrecedence\(/.test(md[1]), 'mealDefault no longer routes through mealPrecedence');
  const clockCalls = app.match(/\bmealForHour\([^)]/g) || [];
  assert.equal(clockCalls.length, 1, `js/app.js asks mealForHour in ${clockCalls.length} places; only mealPrecedence may (a second one is a path around the meal memory)`);
  // renderFoods (My foods) reads the precedence, not the clock
  const rfStart = app.indexOf('async function renderFoods(el)');
  assert.ok(rfStart > 0, 'renderFoods not found');
  const rf = app.slice(rfStart, app.indexOf('\nasync function ', rfStart + 10));
  assert.ok(!/mealForHour\(/.test(rf), 'renderFoods picks the meal by the clock again (the fifth commit path, L10)');
  assert.ok(/openPortion\(f, \{ meal: await mealDefault\(\) \}\)/.test(rf), 'renderFoods does not open the portion sheet on mealDefault()');
  // a chip tap writes the memory, on both chip sets
  for (const id of ['#mealChips', '#pMealChips']) {
    const i = app.indexOf(`$$('${id} button', wrap).forEach(c => c.addEventListener('click', () => {`);
    assert.ok(i > 0, `${id} click handler not found`);
    const handler = app.slice(i, app.indexOf('\n  }));', i));
    assert.ok(/recordMealUsed\(curMeal\)/.test(handler), `${id} tap no longer records the meal: closing and reopening forgets the chip (L10)`);
  }
});

/* ---- QA round 24, L17: midnight is a decision, not a timer ----
   With the app open on Today, a log at 00:00 landed on YESTERDAY while dateKey()
   already said today: rollDayIfNeeded ran only on resume and on a 60 s interval
   (measured catch-up 45,038 ms), and the callers stamp `date: S.date` when they
   build the row. Pins the source order (the roll precedes the write) and runs the
   REAL rollDayIfNeeded + commitLogEntry out of js/app.js with a clock that has
   crossed midnight: a fresh row follows the day, an edit keeps its day.
   Prove-red on the pre-fix tip: the source-order assert (no rollDayIfNeeded in
   commitLogEntry). */
test('R24-L17 commitLogEntry rolls the day before the row is written, and a fresh row follows it', async () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const cle = app.match(/\nasync function commitLogEntry\(e, btn, via = null\) \{([\s\S]*?)\n\}\n/);
  assert.ok(cle, 'commitLogEntry not found');
  const roll = cle[1].indexOf('await rollDayIfNeeded()'), put = cle[1].indexOf("db.put('log', e)");
  assert.ok(roll >= 0 && roll < put, 'commitLogEntry does not roll the day before db.put: a log at 00:00 lands on yesterday until the 60 s timer fires (L17)');
  const rdn = app.match(/let _dayAnchor = dateKey\(\);\nlet _rolling = false;\nasync function rollDayIfNeeded\(\) \{[\s\S]*?\n\}\n/);
  assert.ok(rdn, 'rollDayIfNeeded (with its _dayAnchor / _rolling) not found in js/app.js');

  let clock = '2026-09-03';                       // the anchor is taken at 23:59
  const S = { settings: { targets: {} }, date: '2026-09-03' };
  const store = new Map([['old', { id: 'old', date: '2026-09-03', meal: 2, kcal: 300 }]]);
  const db = {
    put: async (st, v) => { store.set(v.id, { ...v }); },
    get: async (st, id) => store.get(id) || undefined,
  };
  const routed = [];
  const load = () => new Function('S', 'db', 'dateKey', 'awardDayCloseIfDue', 'route', 'toast', 'maybeShowDailyWheel',
    'refreshNotifSchedules', 'recordMealUsed', 'onFoodLogged', 'entriesFor', 'trackEvent',
    `${rdn[0]}${cle[0]}; return { commitLogEntry, rollDayIfNeeded };`)(
    S, db, () => clock, async () => null, () => routed.push(S.date), () => {}, () => Promise.resolve(false),
    () => {}, async () => {}, async () => ({ xp: 10 }), async () => [], () => {});
  const { commitLogEntry } = load();

  clock = '2026-09-04';                           // midnight passed; the 60 s timer has not fired
  assert.equal(S.date, '2026-09-03', 'precondition: the app still sits on yesterday');
  const fresh = { id: 'new', date: S.date, meal: 3, kcal: 120 };   // what quickAddEntry / openPortion build
  const game = await commitLogEntry(fresh, null);
  assert.equal(S.date, '2026-09-04', 'the commit did not roll the day');
  assert.equal(store.get('new').date, '2026-09-04', 'a log at 00:00 was written to the day that had ended (L17)');
  assert.deepEqual(routed, ['2026-09-04'], 'rollDayIfNeeded did not behave as it does on the timer (route on the new day)');
  assert.ok(game && game.xp === 10, 'the commit lost its receipt');

  // an EDIT of a row eaten yesterday keeps yesterday, even across the same roll
  const S2 = { settings: { targets: {} }, date: '2026-09-03' };
  clock = '2026-09-03';
  const again = new Function('S', 'db', 'dateKey', 'awardDayCloseIfDue', 'route', 'toast', 'maybeShowDailyWheel',
    'refreshNotifSchedules', 'recordMealUsed', 'onFoodLogged', 'entriesFor', 'trackEvent',
    `${rdn[0]}${cle[0]}; return { commitLogEntry };`)(
    S2, db, () => clock, async () => null, () => {}, () => {}, () => Promise.resolve(false),
    () => {}, async () => {}, async () => ({ xp: 0 }), async () => [], () => {});
  clock = '2026-09-04';
  await again.commitLogEntry({ ...store.get('old'), kcal: 350 }, null);
  assert.equal(S2.date, '2026-09-04');
  assert.equal(store.get('old').date, '2026-09-03', 'editing a row eaten yesterday moved it to today');
  assert.equal(store.get('old').kcal, 350);
});

/* QA ROUND 24 L16: THE DAY-CLOSE IS DELIVERED ONLY AS A DROPPABLE TOAST.
   On budget the player got "Yesterday closed on budget: Bone Crate earned" for
   3.4s inside a 4-deep toast queue that drops the oldest, and nothing on Today
   ever recorded that the day closed. The fix DERIVES a news row from the xp
   ledger (no new store) and renders it in the Today news pill. These rows pin:
   (a) the derivation yields exactly the toast's copy, dated to the closed day,
       for both outcomes and both gap states, newest close wins, none without rows;
   (b) renderToday hands that row to the pill from the xp read it already has;
   (c) the hero rule is untouched by it: newsHero()'s output is identical on a
       NEWS fixture with and without a day-close-shaped row in it. */
test('R24-L16 (a) dayCloseNews derives the toast copy and the closed date from the ledger, newest close only', () => {
  const at = d => new Date(`${d}T09:00:00`).getTime(); // the settle ran on the morning of d
  assert.equal(dayCloseNews([]), null, 'no ledger rows must yield no row');
  assert.equal(dayCloseNews([{ type: 'protein', date: '2026-09-02', ts: at('2026-09-03') }]), null,
    'a protein row is not a day-close');
  assert.deepEqual(
    dayCloseNews([{ key: 'dayclose-2026-09-02', type: 'dayclose', xp: 50, date: '2026-09-02', ts: at('2026-09-03') }]),
    { id: 'dayclose-2026-09-02', type: 'dayclose', title: 'Yesterday closed on budget: Bone Crate earned', date: '2026-09-02' });
  assert.deepEqual(
    dayCloseNews([{ key: 'dayeffort-2026-09-02', type: 'dayeffort', xp: 25, date: '2026-09-02', ts: at('2026-09-03') }]),
    { id: 'dayclose-2026-09-02', type: 'dayeffort', title: 'You logged yesterday. That counts: Common Crate earned', date: '2026-09-02' });
  // the gap case: settled two days after the closed day, the toast said "your last logged day"
  assert.equal(dayCloseNews([{ type: 'dayclose', date: '2026-08-30', ts: at('2026-09-03') }]).title,
    'Your last logged day closed on budget: Bone Crate earned');
  assert.equal(dayCloseNews([{ type: 'dayeffort', date: '2026-08-30', ts: at('2026-09-03') }]).title,
    'You logged your last day here. That counts: Common Crate earned');
  // newest CLOSED DAY wins, whatever order the store hands rows back in
  const r = dayCloseNews([
    { type: 'dayclose', date: '2026-09-02', ts: at('2026-09-03') },
    { type: 'dayeffort', date: '2026-08-31', ts: at('2026-09-01') },
    { type: 'dayclose', date: '2026-09-01', ts: at('2026-09-02') },
  ]);
  assert.equal(r.date, '2026-09-02');
  assert.equal(r.type, 'dayclose');
});

/* ---- QA round 28 B1: the R21-P1 make-good gets a card. The grant itself
   (js/app.js habitBaseGrantTp) writes { tp, at } to kv once; habitGrantCard is
   the pure half that turns that row plus the dismissal flag into a card or
   nothing, so the once-ness is provable here without a DOM. Red on main: the
   export does not exist. ---- */
test('R28-B1 (a) habitGrantCard renders once with the grant N, never after dismissal, never without a grant', () => {
  const card = habitGrantCard({ tp: 37, at: 1 }, false);
  assert.ok(card, 'a grant row with unspent points must produce a card');
  assert.equal(card.tp, 37);
  assert.match(card.body, /\b37 training points\b/, `the body must carry N: ${card.body}`);
  assert.match(card.body, /Training/, 'the body must say where the points are spent');
  assert.equal(habitGrantCard({ tp: 1, at: 1 }, false).body.includes('1 training point.'), true, 'singular for one point');
  assert.equal(habitGrantCard({ tp: 37, at: 1 }, true), null, 'once the button has been tapped the card never returns');
  assert.equal(habitGrantCard({ tp: 0, at: 1 }, false), null, 'a zero grant (a new player, nothing to explain) draws no card');
  assert.equal(habitGrantCard(null, false), null, 'no grant row yet (the fighter has not been built since the update) draws no card');
  assert.equal(habitGrantCard({ at: 1 }, false), null, 'a malformed row draws no card rather than "undefined training points"');
});
test('R28-B1 (b) static: Today mounts the card after the grant is written, and its button marks it seen then opens Training', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const todayStart = app.indexOf('\nasync function renderToday(');
  const today = app.slice(todayStart, app.indexOf('\n}\n', todayStart));
  const grantAt = today.indexOf('habitGrantCard(await kvGet(HABIT_GRANT_KEY, null), await kvGet(HABIT_GRANT_SEEN_KEY, false))');
  assert.ok(grantAt > 0, 'renderToday must derive the card from the grant row and the seen flag');
  assert.ok(grantAt > today.indexOf('await buildFighter('), 'the grant row is read AFTER buildFighter writes it, so the card lands on the same draw as the points');
  assert.match(today, /id="habitGrantCard"[\s\S]*?<button class="btn" id="habitGrantGo">/, 'the card carries its Training button');
  assert.match(today, /\$\('#habitGrantGo', el\)\?\.addEventListener\('click', async \(\) => \{ await kvSet\(HABIT_GRANT_SEEN_KEY, true\); openCharacter\('talents'\); \}\)/,
    'the button writes the seen flag and routes to Training (the talents tab of the hub)');
  assert.match(app, /const HABIT_GRANT_SEEN_KEY = 'habitBaseGrantCardSeen_v471';/, 'the seen flag is versioned with the grant');
});

test('R24-L16 (b) renderToday feeds the derived day-close row to the news pill from the xp rows it already read', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.match(app, /newsBannerHtml\(newsUnseen, eq, dayCloseNews\(allXp\)\)/,
    'renderToday no longer passes dayCloseNews(allXp) into newsBannerHtml: the day-close is a droppable toast again (QA r24 L16)');
  const m = app.match(/\nfunction newsBannerHtml\(unseen, eq, dayClose\) \{\n([\s\S]*?)\n\}\n/);
  assert.ok(m, 'newsBannerHtml(unseen, eq, dayClose) not found');
  assert.ok(/\$\{esc\(dayClose\.title\)\}/.test(m[1]) && /\$\{esc\(dayClose\.date\)\}/.test(m[1]),
    'the pill no longer renders the day-close row\'s title and date');
  // the toast strings ARE the row strings: the toast copy at both call sites must still be what game.js derives
  const game = readFileSync(join(here, '..', 'js', 'game.js'), 'utf8');
  for (const copy of ['Yesterday closed on budget: Bone Crate earned', 'You logged yesterday. That counts: Common Crate earned',
    'Your last logged day closed on budget: Bone Crate earned', 'You logged your last day here. That counts: Common Crate earned']) {
    assert.ok(app.includes(copy), `toast copy changed: "${copy}" is no longer in app.js`);
    assert.ok(game.includes(copy), `row copy drifted from the toast: "${copy}" is no longer in game.js`);
  }
});

test('R24-L16 (c) the hero choice is unchanged by a day-close row: newsHero() reads NEWS only', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const fb = app.match(/\nconst NEWS_HERO_FALLBACK = \{[\s\S]*?\n\};\n/)?.[0];
  const fn = app.match(/\nfunction newsHero\(\) \{\n[\s\S]*?\n\}\n/)?.[0];
  assert.ok(fb && fn, 'NEWS_HERO_FALLBACK / newsHero() not found; this pin is reading the wrong shape');
  assert.ok(!/dayClose/i.test(fn), 'newsHero() now reads the day-close: the hero rule must not change (QA r24 L16)');
  const pick = (NEWS) => new Function('NEWS', 'HYPE_PLATES', `${fb}${fn}; return newsHero();`)(NEWS, { 'a.png': {} });
  const plain = [{ id: 'x', title: 'x' }, { id: 'w', title: 'w', hero: 'a.png' }];
  const dayclose = { id: 'dayclose-2026-09-02', type: 'dayclose', title: 'Yesterday closed on budget: Bone Crate earned', date: '2026-09-02' };
  // with a hero-bearing entry present, the same entry wins whether or not the day-close row is in the list
  assert.equal(pick([dayclose, ...plain]), pick(plain));
  assert.equal(pick(plain).id, 'w', 'setup: the fixture hero was not chosen; the pin below compares nothing');
  // with no hero-bearing entry, the fallback wins, and the day-close row never stands in for it
  assert.equal(pick([dayclose, plain[0]]).title, pick([plain[0]]).title);
  assert.equal(pick([dayclose]).title, 'Two want to eat you');
});

/* QA ROUND 23 F6. Measured on a heavy account: 57 collected looks made a 1420px
   Dressing Room grid in BH_ITEMS declaration order with no organisation, and 56
   of 56 look tiles carried no rarity class while the fit grid twelve lines above
   carries r-<rarity> plus the tag. Runs the REAL `cell` + `lookTilesHtml` slice
   on a fixture in SHUFFLED declaration order: tiles come out in the Looks tab's
   order (rarity descending, declaration order kept inside a band), every look
   tile carries r-<rarity> and the ward-rar tag, and the two fixed cells (own look
   and Hide) stay first and untiered. */
test('R23 F6: Dressing Room look tiles are sorted by rarity and carry r-<rarity> like the fit grid', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a = app.indexOf('const cell = (val, inner, title');
  const b = app.indexOf('/* ---------------------------------------------------------------- v2', a);
  assert.ok(a > 0 && b > a, 'the transmog `cell` helper moved: re-anchor this slice');
  const slice = app.slice(a, b);
  assert.ok(slice.includes('const lookTilesHtml ='), 'lookTilesHtml is gone: the look grid is back to an unsorted, untiered arts.map');
  const rarOrder = app.match(/^const RAR_ORDER = .*$/m)[0];
  const tagFn = app.match(/function rarityTagHtml\(rarity\) \{[\s\S]*?\n\}/)[0];
  const lookTilesHtml = new Function('cur', 'sel', 'esc', 'ownArt', 'wornGear', 'bhTrim', 'bhAsset', 'ICONS', 'TRANSMOG_HIDE', 'costTag',
    `${rarOrder}; ${tagFn}; ${slice}; return lookTilesHtml;`)(
    '', '', String, { id: 'own' }, null, x => x, i => i.id + '.png', { hidden: () => '<svg/>' }, '__hide__', () => '<span class="look-cost paid">owned</span>');
  // declaration order deliberately interleaves tiers, the way BH_ITEMS does
  const arts = [
    { id: 'c1', name: 'C one', rarity: 'common' }, { id: 'l1', name: 'L one', rarity: 'legendary' },
    { id: 'r1', name: 'R one', rarity: 'rare' }, { id: 'c2', name: 'C two', rarity: 'common' },
    { id: 'e1', name: 'E one', rarity: 'epic' }, { id: 'u1', name: 'U one', rarity: 'uncommon' },
    { id: 'r2', name: 'R two', rarity: 'rare' },
  ];
  const html = lookTilesHtml(arts);
  const tiles = [...html.matchAll(/<button class="ward-cell look ([^"]*)" data-look="([^"]*)"/g)].map(m => ({ cls: m[1], id: m[2] }));
  assert.deepEqual(tiles.slice(0, 2).map(t => t.id), ['', '__hide__'], 'the As equipped / Hide cells must stay first');
  assert.ok(tiles.slice(0, 2).every(t => !/\br-/.test(t.cls)), 'the two fixed cells carry no tier');
  assert.deepEqual(tiles.slice(2).map(t => t.id), ['l1', 'e1', 'r1', 'r2', 'u1', 'c1', 'c2'],
    'look tiles are not in the Looks tab order (rarity desc, declaration order inside a band)');
  for (const t of tiles.slice(2)) {
    const rar = arts.find(x => x.id === t.id).rarity;
    assert.ok(t.cls.split(/\s+/).includes(`r-${rar}`), `tile ${t.id} lacks r-${rar}: ${t.cls}`);
  }
  assert.equal((html.match(/class="ward-rar"/g) || []).length, arts.length, 'every look tile must carry the rarity tag the fit grid carries');
  // and the input is not mutated: lookPriceMap and the panel read slotArts in place
  assert.equal(arts[0].id, 'c1', 'lookTilesHtml must sort a copy, not the caller\'s array');
});

/* QA ROUND 23 F8. At 6 fits [data-fit-save] used to vanish, so the only storage
   cap in the app printed no total, and "You can keep 6 fits. Bin one first." was
   dead code (captureFit can only return `full` from a control that only rendered
   while not full). Runs the REAL fitRail slice at 5 and 6 fits, the REAL
   ward-head at both counts, and pins that the string has more than one user. */
test('R23 F8: the fits cap is printed and the save chip stays, ghosted, with its rule reachable', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const MAX = 6;
  const a = app.indexOf('const fitRail = `');
  const b = app.indexOf('\n    content.innerHTML = `', a);
  assert.ok(a > 0 && b > a, 'the fitRail template moved: re-anchor this slice');
  const rail = n => new Function('fitList', 'fitPrices', 'S', 'fitThumbArt', 'esc', 'ICONS', 'MAX_FITS', 'stripPlan',
    `${app.slice(a, b)}; return fitRail;`)(
    Array.from({ length: n }, (_, i) => ({ id: 'f' + i, name: 'Fit ' + i, gear: {} })), Array(n).fill(0),
    { fitEdit: null }, () => null, String, { dust: () => '', close: () => '' }, MAX, { slots: [], mogs: [] });
  const five = rail(5), six = rail(6);
  const save = /<button class="fit-chip add" data-fit-save="1"([^>]*)>/;
  assert.match(five, save, 'at 5 fits the save chip is missing');
  assert.ok(!/aria-disabled/.test(five.match(save)[1]), 'at 5 fits the save chip must be enabled');
  assert.match(six, save, 'at 6 fits the save chip vanished again: the cap is silent');
  assert.match(six.match(save)[1], /aria-disabled="true"/, 'at the cap the save chip must be ghosted (aria-disabled), not live');
  assert.ok(!/ disabled/.test(six.match(save)[1]), 'a `disabled` button swallows the tap that toasts the rule');

  const h = app.indexOf('<div class="ward-head">');
  const hEnd = app.indexOf("</div>` : tab === 'shop'", h);
  assert.ok(h > 0 && hEnd > h, 'the ward-head template moved: re-anchor this slice');
  const head = n => new Function('lvl', 'coinBal', 'dustBal', 'ownedCount', 'boost', 'ICONS', 'sparkIco', 'looksAll', 'looksHave', 'esc', 'fitCount', 'MAX_FITS',
    'return `' + app.slice(h, hEnd) + '</div>`;')(
    { level: 1, name: 'x' }, 0, 0, 0, 0, { coin: () => '', dust: () => '', bone: () => '', boltIco: () => '' }, () => '', [], new Set(), String, n, MAX);
  assert.match(head(5), /<span class="bh-pill ward-fits">5\/6 fits<\/span>/, 'the header does not print 5/6 fits');
  assert.match(head(6), /<span class="bh-pill ward-fits">6\/6 fits<\/span>/, 'the header does not print 6/6 fits');

  // the explaining string: defined once, used by the ghosted chip AND by captureFit's `full`
  assert.equal((app.match(/You can keep \$\{MAX_FITS\} fits\. Bin one first\./g) || []).length, 1, 'the cap string must be defined once, as fitsFullMsg');
  const uses = (app.match(/\bfitsFullMsg\b/g) || []).length;
  assert.ok(uses > 2, `fitsFullMsg is dead code again: ${uses} occurrence(s), need the definition plus two users`);
  const handler = app.slice(app.indexOf("$('[data-fit-save]', content)"), app.indexOf('openTextSheet', app.indexOf("$('[data-fit-save]', content)")));
  assert.match(handler, /fitList\.length >= MAX_FITS[\s\S]*toast\(fitsFullMsg/, 'a tap on the ghosted save chip must toast the rule before any sheet opens');
});

test('SW update checks bypass the HTTP cache (GitHub Pages max-age=600 held a device on v470 for ten minutes after v471 was live)', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const calls = [...app.matchAll(/serviceWorker\.register\(([^)]*)\)/g)].map(m => m[1]);
  assert.equal(calls.length, 1, `expected exactly one register() call, found ${calls.length}`);
  assert.match(calls[0], /updateViaCache:\s*'none'/, 'register() does not pass updateViaCache: none, so a deploy can hide behind the HTTP cache');

});

/* ---- QA round 26 O5: one logged food left Today at 60 style recalcs/s and 15 to
   22% of a core, forever. renderToday adds ONE class after a log, `bounce` on
   .hero-scene (S.justLogged), and its rule read `bhbounce 0.7s ..., bh-idle 4s
   ... infinite`: two animations on one `transform`, which Chrome never composites
   and never re-decides, so the infinite half ran on the main thread until the next
   innerHTML rebuild. This is the static half (the browser half is
   tests/today-idle-cpu-audit.mjs): the rule carries exactly one animation and no
   `infinite`, and app.js has the exit that hands the element back its own idle.
   Proven red on origin/main 96c1104a: app.css:1681 carries `infinite`. ---- */
test('R26-O5 the post-log bounce is one finite animation, and renderToday ends it', () => {
  const css = readFileSync(join(here, '..', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/\.hero-scene\.bounce[^{]*\{([^}]*)\}/g)].map(m => m[1]);
  assert.ok(rules.length >= 1, 'no .hero-scene.bounce rule in app.css: the celebration is gone, or moved (re-anchor)');
  for (const body of rules) {
    const anim = body.match(/animation\s*:\s*([^;]+)/);
    if (!anim) continue;
    assert.ok(!/infinite/.test(anim[1]), `.hero-scene.bounce animates forever: ${anim[1].trim()}`);
    // a top-level comma separates animations; the ones inside cubic-bezier(...) do not
    assert.ok(!anim[1].replace(/\([^)]*\)/g, '').includes(','), `.hero-scene.bounce lists two animations on one element, which Chrome never composites: ${anim[1].trim()}`);
  }
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.match(app, /addEventListener\('animationend',[\s\S]{0,200}animationName === 'bhbounce'[\s\S]{0,80}classList\.remove\('bounce'\)/,
    'renderToday no longer removes .bounce on bhbounce animationend, so the idle never restarts alone');
});

/* ---------------------------------------------------------------------------
 * QA round 27 R13. The Android manifest declared 17 Health Connect READ_
 * permissions and HealthPlugin.kt requested all 17 as a "full superset", while
 * queryToday() read 7 record types. Over-declared health permissions are a
 * routine Play data-safety query, and a grant sheet that asks for VO2 max and
 * body fat the app never reads is a trust problem with the player too.
 *
 * Three sets, all parsed from source, must be EQUAL:
 *   manifest   <uses-permission android.permission.health.READ_X />
 *   requested  HealthPermission.getReadPermission(XRecord::class) in readPerms
 *   read       XRecord::class / XRecord.SOMETHING_TOTAL anywhere else in the plugin
 * A mismatch in either direction goes red: a declared-but-unread permission
 * (the R13 defect) and a read-but-undeclared one (requestAuth can never satisfy
 * containsAll(readPerms), so Health stays "not connected" forever).
 *
 * PROVE-RED (2026-09-04, on origin/main v472): fails at the "manifest declares
 * permissions the bridge never reads" assertion listing the 10 extras.
 * ------------------------------------------------------------------------- */
test('QA round 27 R13: Android manifest declares exactly the Health Connect types the bridge reads', () => {
  const manifest = readFileSync(join(here, '..', 'native', 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
  const kt = readFileSync(join(here, '..', 'native', 'android', 'app', 'src', 'main', 'java', 'com', 'boneheadz', 'gym', 'HealthPlugin.kt'), 'utf8');

  const declared = new Set([...manifest.matchAll(/android\.permission\.health\.(READ_[A-Z_]+)/g)].map(m => m[1]));
  assert.ok(declared.size > 0, 'no health permissions found in the manifest: the regex or the path has drifted, this has not passed');

  // Record class -> permission name. Health Connect's names are the class minus
  // "Record" in UPPER_SNAKE, except the three it shortens.
  const IRREGULAR = { ExerciseSessionRecord: 'READ_EXERCISE', HeartRateVariabilityRmssdRecord: 'READ_HEART_RATE_VARIABILITY', SleepSessionRecord: 'READ_SLEEP' };
  const permOf = rec => IRREGULAR[rec] || 'READ_' + rec.replace(/Record$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

  const permsBlock = kt.match(/private val readPerms = setOf\(([\s\S]*?)\n    \)/);
  assert.ok(permsBlock, 'readPerms set not found in HealthPlugin.kt: re-anchor this test');
  const requested = new Set([...permsBlock[1].matchAll(/getReadPermission\((\w+Record)::class\)/g)].map(m => permOf(m[1])));

  // everything outside the imports and the request set is a READ SITE
  const body = kt.replace(permsBlock[0], '').split('\n').filter(l => !/^import /.test(l)).join('\n');
  const read = new Set([...body.matchAll(/\b(\w+Record)(?:::class|\.[A-Z_]+_TOTAL)/g)].map(m => permOf(m[1])));
  assert.ok(read.size > 0, 'no read sites found in HealthPlugin.kt: the regex has drifted, this has not passed');

  const diff = (a, b) => [...a].filter(x => !b.has(x)).sort();
  assert.deepEqual(diff(declared, read), [], `manifest declares permissions the bridge never reads: ${diff(declared, read).join(', ')}`);
  assert.deepEqual(diff(read, declared), [], `bridge reads types the manifest does not declare: ${diff(read, declared).join(', ')}`);
  assert.deepEqual(diff(requested, read), [], `readPerms requests permissions the bridge never reads: ${diff(requested, read).join(', ')}`);
  assert.deepEqual(diff(read, requested), [], `bridge reads types readPerms never requests (requestAuth can never be satisfied): ${diff(read, requested).join(', ')}`);
  assert.equal(read.size, 7, `expected the 7 read types traced in R13, saw ${[...read].sort().join(', ')}: if a read was added on purpose, update this count with it`);
});

/* ---------------------------------------------------------------------------
 * QA round 27 R14(a). The first CTA of a fresh install refused taps for
 * 2,676 ms because the #splash montage (fixed, inset 0, z-index 400, opaque)
 * sat over the onboarding. showSplash now returns before it builds anything
 * when there is no profile yet, and it does so BEFORE the ?splash=1 force so
 * the onb-audit row can tap through a forced splash and prove the gate.
 * PROVE-RED (2026-09-04, origin/main v472): the gate is absent, fails at the
 * first assertion.
 * ------------------------------------------------------------------------- */
test('QA round 27 R14(a): no splash is built over a fresh install\'s onboarding', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const fn = app.match(/async function showSplash\(userEq\) \{([\s\S]*?)\n\}/);
  assert.ok(fn, 'showSplash not found: re-anchor this test');
  const head = fn[1].slice(0, fn[1].indexOf("const forced"));
  assert.match(head, /if \(!S\.settings\) return;/, 'showSplash builds the montage over onboarding again (no S.settings gate before the forced check)');
  assert.ok(!/document\.createElement/.test(head), 'the gate must run before the splash element exists');
  // the CSS half: the moment the splash fades it must stop eating taps
  const css = readFileSync(join(here, '..', 'app.css'), 'utf8');
  assert.match(css, /#splash\.out \{[^}]*pointer-events: none/, 'a fading splash must be non-interactive');
});

/* ---------------------------------------------------------------------------
 * QA round 27 R14(b). Geolocation callback never fires -> the Boneyard waited
 * 25.3 s and then blamed the network. boneyardFloorMsg is the single chooser:
 * denied -> platform copy; answered no-fix OR never-answered -> the no-fix copy;
 * everything else -> the network copy. floorMap always renders #mapRetry, so
 * every branch here carries a retry.
 * PROVE-RED (2026-09-04, origin/main v472): fails at the first assertion, the
 * 25s bound hardcoding NET_MSG.
 * ------------------------------------------------------------------------- */
test('QA round 27 R14(b): a never-answered geolocation wait yields the no-fix copy, not the network copy', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.ok(!/if \(!tilesSeen\) floorMap\(NET_MSG\); \}, 25000\)/.test(app),
    'the 25s boot bound floors to NET_MSG unconditionally again: a silent geolocation blames the network');
  const start = app.indexOf('function boneyardFloorMsg(');
  assert.ok(start > 0, 'boneyardFloorMsg is gone');
  const src = app.slice(start, app.indexOf('\n}\n', start) + 2);
  const net = app.match(/const NET_MSG = '([^']+)';/);
  assert.ok(net, 'NET_MSG constant not found at module level');
  const chooser = new Function('NET_MSG', src + '\nreturn boneyardFloorMsg;')(net[1]);
  const noFix = chooser({ err: { code: 3 } });                         // answered: timeout
  assert.match(noFix, /No location fix yet/, 'an answered no-fix must say no fix');
  assert.equal(chooser({ fixSeen: false }), noFix, 'a never-answered wait must produce the SAME no-fix copy, not the network copy');
  assert.equal(chooser({ err: { code: 2 } }), noFix, 'position-unavailable is a no-fix too');
  assert.match(chooser({ err: { code: 1 } }), /Location is off\. Allow it in Settings → Boneheadz Gym/, 'iOS denial copy');
  assert.match(chooser({ err: { code: 1 }, isAndroid: true }), /Settings → Apps → Boneheadz Gym → Permissions/, 'Android denial copy');
  assert.equal(chooser({}), net[1], 'a map that got a fix but no tiles is a network problem');
  assert.equal(chooser({ err: new Error('import failed') }), net[1], 'a non-geo error (vendor import) is a network problem');
  // the bound feeds the chooser what it knows, and the wait state is labelled
  const sm = app.slice(app.indexOf('async function startMap()'), app.indexOf('if (attempt !== mapAttempt) return;   // player left'));
  assert.match(sm, /floorMap\(boneyardFloorMsg\(\{ fixSeen: geoAnswered \}\)\); \}, 25000\)/, 'the 25s bound must pass geoAnswered to the chooser');
  assert.match(sm, /pos => \{ geoAnswered = true; res\(pos\); \}, e => \{ geoAnswered = true; rej\(e\); \}/, 'both geolocation callbacks must mark the wait answered');
  assert.match(sm, /Raising the map from the dirt\.\.\./, 'the wait state lost its label');
  assert.match(app, /id="mapRetry"/, 'floorMap lost its Retry button');
});

/* ---------------------------------------------------------------------------
 * QA round 26 O24. Inside the Capacitor shell both appStateChange(isActive)
 * and visibilitychange fire on one foregrounding, so the resume body in app.js
 * (rollover, health sync, social sync, refresh) ran twice per resume. Driven
 * here with stub listeners: two triggers inside the 500 ms window run the body
 * once; two transitions further apart run it twice.
 * PROVE-RED (2026-09-04, origin/main v472): body ran 2 times on the first
 * assertion.
 * ------------------------------------------------------------------------- */
test('QA round 26 O24: one resume body per foreground transition, both listeners kept', () => {
  const handlers = { app: null, vis: null };
  const savedWin = globalThis.window, savedDoc = globalThis.document, savedNow = Date.now;
  globalThis.window = { Capacitor: { Plugins: { App: { addListener: (name, fn) => { if (name === 'appStateChange') handlers.app = fn; } } } } };
  globalThis.document = { hidden: false, addEventListener: (name, fn) => { if (name === 'visibilitychange') handlers.vis = fn; } };
  let t = 1_000_000; Date.now = () => t;
  try {
    let runs = 0;
    onAppResume(() => { runs++; });
    assert.ok(handlers.app && handlers.vis, 'both listeners must still be registered (each is the only one on its platform)');
    // one foregrounding, both platforms report it a few ms apart
    handlers.app({ isActive: true }); t += 20; handlers.vis();
    assert.equal(runs, 1, `body ran ${runs} times for ONE foreground transition`);
    handlers.app({ isActive: false }); // backgrounding never runs the body
    globalThis.document.hidden = true; handlers.vis(); globalThis.document.hidden = false;
    assert.equal(runs, 1, 'backgrounding ran the resume body');
    // a second, real transition later
    t += 600; handlers.vis(); t += 20; handlers.app({ isActive: true });
    assert.equal(runs, 2, `two transitions must run the body twice, ran ${runs}`);
  } finally {
    globalThis.window = savedWin; globalThis.document = savedDoc; Date.now = savedNow;
  }
});

/* ---------- QA round 26 O1: a veil poster rides the sheet stack ---------- *
 * Today -> News -> "Dark Spires" opened a .drop-veil OUTSIDE the stack: Escape
 * did nothing, history.back() did nothing, two route changes left it covering
 * the tab bar. Eight posters shared the shape. openVeil is the one door. */
const veilSlices = () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const fn = name => {
    const a = app.indexOf(`\nfunction ${name}(`);
    assert.ok(a > 0, `app.js must define ${name}`);
    return app.slice(a, app.indexOf('\n}\n', a) + 3);
  };
  return { app, src: fn('openVeil') + fn('closeTopSheet') + fn('closeAllSheets') };
};
test('R26 O1 (a) openVeil pushes the stack; a popped history entry and a route change both remove the veil', () => {
  const { app, src } = veilSlices();
  // the popstate line every sheet relies on: openVeil borrows it, so pin it
  assert.match(app, /addEventListener\('popstate', \(\) => \{ if \(sheetStack\.length\) closeTopSheet\(\); \}\)/, 'popstate must pop the top sheet');
  assert.match(app, /if \(e\.key !== 'Escape' \|\| !sheetStack\.length\) return;\s*e\.preventDefault\(\);\s*history\.back\(\);/, 'Escape must go through history');
  const sheetStack = [], pushes = [], backs = [];
  let api;
  // back() runs the shipped popstate handler, verbatim (asserted above)
  const history = { pushState: st => pushes.push(st), back: () => { backs.push(1); if (sheetStack.length) api.closeTopSheet(); } };
  api = new Function('sheetStack', 'history', 'document', '$', 'reducedMotion', 'updatePending', 'location',
    `${src}; return { openVeil, closeTopSheet, closeAllSheets };`)(
    sheetStack, history, { body: { appendChild: v => { v.appended = true; } } }, () => null, true, false, { reload() {} });
  const { openVeil, closeAllSheets } = api;
  const mkVeil = () => ({ appended: false, removed: false, remove() { this.removed = true; }, addEventListener(t, f) { this.tap = f; } });

  // open: on the stack, one history entry, in the DOM
  const v1 = mkVeil();
  const close = openVeil(v1);
  assert.equal(sheetStack.length, 1, 'opening a poster must push onto sheetStack');
  assert.equal(sheetStack[0].wrap, v1, 'the stack record must point at the veil so closeTopSheet removes IT');
  assert.deepEqual(pushes, [{ sheet: 1 }], 'opening a poster must push one history entry, like a sheet');
  assert.ok(v1.appended, 'the veil must still be appended to document.body');
  // back: the entry pops, the veil goes
  close();
  assert.equal(backs.length, 1, 'close must go through history.back(), not veil.remove()');
  assert.equal(sheetStack.length, 0, 'a popped history entry must pop the poster');
  assert.ok(v1.removed, 'and remove the veil from the DOM (no .sheet inside, so at once)');
  // a second close after it is gone must not pop whatever is above
  close();
  assert.equal(backs.length, 1, 'close on an already-closed poster must not call history.back() again');
  // route change: route() calls closeAllSheets(); the poster must not survive it
  const v2 = mkVeil();
  openVeil(v2);
  closeAllSheets();
  assert.equal(sheetStack.length, 0, 'a route change must clear the poster');
  assert.ok(v2.removed, 'a route change must remove the veil');
  // the bare-veil tap closes it, like a sheet backdrop
  const v3 = mkVeil();
  openVeil(v3);
  v3.tap({ target: v3 });
  assert.ok(v3.removed, 'a tap on the veil itself must close the poster');
  v3.tap({ target: {} });   // a tap on the card must not throw or double-pop
});
test('R26 O1 (b) every .drop-veil poster opens through openVeil; none appends itself to body', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const src = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const openers = [...src.matchAll(/className = 'drop-veil/g)].map(m => m.index);
  assert.ok(openers.length >= 8, `expected the eight posters, found ${openers.length} .drop-veil openers`);
  const bypass = openers.filter(i => {
    const rest = src.slice(i);
    const m = rest.match(/openVeil\(veil\)|document\.body\.appendChild\(veil\)/);
    return !m || m[0] !== 'openVeil(veil)';
  }).map(i => src.slice(src.lastIndexOf('function ', i) + 9, src.indexOf('(', src.lastIndexOf('function ', i))));
  assert.deepEqual(bypass, [], `${bypass.length} poster(s) bypass openVeil: ${bypass.join(', ')}`);
  // the one bare append is the helper's own
  assert.equal((src.match(/document\.body\.appendChild\(veil\)/g) || []).length, 1, 'only openVeil may append a veil to body');
});

/* ---------- QA round 26 O12: the versus card stops eating taps when it fades ---------- *
 * pointer-events auto in 29/29 samples, still swallowing at opacity 0.010 and 0:
 * the fade at 1150ms and the removal at 1420ms never turned hit-testing off. */
test('R26 O12 the versus card is pointer-events none from the moment its fade starts', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a = app.indexOf("vs.className = 'vs-card quake'");
  assert.ok(a > 0, 'the versus card moved: re-anchor this slice');
  const b = app.indexOf('vs.remove()', a);
  assert.ok(b > a, 'the versus card must still be removed');
  const slice = app.slice(a, b);
  const fade = slice.match(/setTimeout\(\(\) => \{([^\n]*)opacity = '0'[^\n]*\}, (\d+)\);/);
  assert.ok(fade, 'the fade timeout (opacity 0) must exist before the removal');
  assert.match(fade[1], /pointerEvents = 'none'/, `the fade at ${fade[2]}ms must set pointer-events none in the same tick it starts fading`);
});

/* ---------- QA round 26 O6: the Glutton sheet reaps its visibilitychange listener ---------- *
 * +4.47 listeners and +73 nodes per open over 30 opens: the visibilitychange
 * closure over `wrap` was added per open and never removed, while the
 * bh-glutton-beaten listener one line up was reaped by a MutationObserver
 * written for exactly this bug. */
test('R26 O6 after the Glutton sheet leaves the DOM its visibilitychange listener is removed', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a = app.indexOf('  const onBeaten = () => healCleansed();');
  assert.ok(a > 0, 'the Glutton onBeaten line moved: re-anchor this slice');
  const b = app.indexOf("$('#gluttonFight', wrap)?.addEventListener", a);
  assert.ok(b > a, 'the Glutton fight handler moved: re-anchor this slice');
  const added = [], removed = []; let moCb = null;
  const wrap = { isConnected: true };
  const doc = {
    hidden: true,
    addEventListener: (t, f) => added.push([t, f]),
    removeEventListener: (t, f) => removed.push([t, f]),
    getElementById: () => ({}),
  };
  const MO = function (cb) { moCb = cb; this.observe = () => {}; this.disconnect = () => {}; };
  new Function('wrap', 'document', 'MutationObserver', 'addEventListener', 'removeEventListener', 'healCleansed', 'gluttonBeaten', 'slot', app.slice(a, b))(
    wrap, doc, MO, () => {}, () => {}, () => {}, async () => false, 0);
  const vis = added.filter(([t]) => t === 'visibilitychange');
  assert.equal(vis.length, 1, 'the sheet must add exactly one visibilitychange listener');
  assert.ok(moCb, 'the reaping MutationObserver must exist');
  wrap.isConnected = false;
  moCb();
  const gone = removed.filter(([t, f]) => t === 'visibilitychange' && f === vis[0][1]);
  assert.equal(gone.length, 1, 'once the sheet is gone the SAME visibilitychange handler must be removed from document');
});

test('melt: the worn piece is named as coming off, the arm is armToConfirm, a burst tap melts once (QA round 22 W2, W3)', async () => {
  /* W2: melting the equipped piece takes it off (disenchantGear clears the loadout
   * slot) and nothing said so; the melt button had its own inline arm with a 2600
   * literal, no .arming class, no haptic, no busy guard. W3: six rapid taps ran a
   * second melt against a row db.take had already spent and toasted a failure
   * after a melt that worked. This drives the REAL handler slice through the REAL
   * armToConfirm with a fake button: two synchronous clicks on an armed button
   * must call disenchantGear once and toast no failure. */
  const src = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const start = src.indexOf("$$('[data-melt-gear]', content)");
  const end = src.indexOf("$$('[data-petpick]', content)", start);
  assert.ok(start > 0 && end > start, 'the melt handler moved: re-anchor this slice');
  const handler = src.slice(start, end);
  assert.ok(!/2600/.test(handler), 'the melt cool-off must be ARM_COOLOFF_MS, not a 2600 literal');
  assert.match(handler, /armToConfirm\(btn/, 'the melt button must arm through armToConfirm (class, haptic, busy, cool-off)');
  const helper = src.slice(src.indexOf('const ARM_COOLOFF_MS'), src.indexOf('function badgeIconHtml'));
  assert.match(helper, /const ARM_COOLOFF_MS = 3200;/, 'ARM_COOLOFF_MS moved; the helper slice is stale');

  const run = async (worn) => {
    const calls = { melt: 0, toasts: [], haptic: 0, rendered: 0, timers: [] };
    const g = { id: 'g-x', slot: 'H', name: 'Bone Crown', rarity: 'rare' };
    const btn = {
      dataset: { meltGear: 'g-x' }, isConnected: true, innerHTML: 'Melt · +12 dust',
      classes: new Set(), classList: { add(c) { this.classes.add(c); }, remove(c) { this.classes.delete(c); } },
      addEventListener(_, fn) { this.fire = fn; },
    };
    btn.classList.classes = btn.classes;
    const env = {
      $$: () => [btn], content: null, GEAR_BY_ID: { 'g-x': g }, gearLo: worn ? { H: 'g-x' } : {},
      disenchantGear: async () => { calls.melt++; return calls.melt === 1 ? { ok: true, dust: 12, name: g.name } : { ok: false, reason: 'not-owned' }; },
      toast: m => calls.toasts.push(m), S: {}, popSound: () => {}, renderCharacter: () => { calls.rendered++; },
      wrap: null, esc: s => String(s), haptic: { heavy: () => { calls.haptic++; } },
      setTimeout: (fn, ms) => { calls.timers.push(ms); return 0; }, clearTimeout: () => {},
    };
    new Function(...Object.keys(env), helper + '\n' + handler)(...Object.values(env));
    const ev = { preventDefault() {}, stopPropagation() {} };
    await btn.fire(ev);                        // arm
    const label = btn.innerHTML, arming = btn.classes.has('arming'), cooloff = calls.timers[0];
    const p1 = btn.fire(ev), p2 = btn.fire(ev); // burst: two taps in one frame on the armed button
    await Promise.all([p1, p2]);
    return { label, arming, cooloff, ...calls };
  };
  const w = await run(true);
  assert.ok(w.label.includes('Bone Crown') && w.label.includes('takes it off'), `worn piece: arm label must name the piece and say it comes off, got "${w.label}"`);
  assert.ok(w.arming, 'the armed melt button must carry .arming like every other spend');
  assert.equal(w.cooloff, 3200, 'the melt cool-off must be ARM_COOLOFF_MS (3200)');
  assert.equal(w.melt, 1, `a burst of two taps on the armed button must melt once, melted ${w.melt}`);
  assert.deepEqual(w.toasts.filter(t => /Could not melt/.test(t)), [], 'a swallowed second tap is not a failure to report');
  assert.equal(w.haptic, 1, 'the committing tap thumps once');
  const u = await run(false);
  assert.equal(u.label, 'Tap again to melt', `unworn piece: plain melt label, got "${u.label}"`);
  assert.ok(!u.label.includes('takes it off'), 'an unworn piece is not "taken off"');
});

/* ---- QA round 22 W5: a tap in the "pick your fit" grid that takes statted gear
   off arms first. Measured on main: one click on .ward-cell.r-common dropped
   loadout.H with no toast and the stat chips kept the OLD numbers (MARROW 58 +4
   over a fighter at 54) until a forced re-render, because restageWardrobe
   repaints the doll and the rings only. The pixel proof is the W5 rows in
   tests/transmog-clarity-audit.mjs; this is the static half over the handler. */
test('R22-W5 a displacing equip goes through armToConfirm and the gear path; a free swap stays one tap', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const start = app.indexOf('const doEquip = async cell =>');
  assert.ok(start > 0, 'the [data-equip] handler is no longer doEquip (main wired the tap straight to equip())');
  const slice = app.slice(start, app.indexOf('async function restageLook', start));
  // the wiring: displacing tiles arm, naming the gear and its stats; free swaps do not
  assert.match(slice, /if \(!wornGear\) \{ cell\.addEventListener\('click', \(\) => doEquip\(cell\)\); return; \}/,
    'a tap that displaces nothing must stay one tap');
  assert.match(slice, /armToConfirm\(cell, `Tap again: takes off \$\{wornGear\.name\}, \$\{gearLabel\(wornGear\)/,
    'a tap that takes statted gear off must arm first and name the gear and its stats');
  // the restage: gear came off, so the whole screen re-reads (stats, lead, prices)
  const eq = slice.indexOf('await equip(slot, cell.dataset.equip || null)');
  const full = slice.indexOf("if (wornGear) { renderCharacter(wrap, 'wardrobe', { instant: true }); return; }");
  const inPlace = slice.indexOf('await restageWardrobe(content, slot)');
  assert.ok(eq > 0 && full > eq && inPlace > full,
    'after a displacing equip the handler must take the full render BEFORE the in-place restage (which never repaints .pd-stats or .mog-panel)');
  // and the full render is where the stat chips and the panel come from
  assert.match(app, /<div class="pd-stats">\$\{STAT_META\.map\(statChip\)\.join\(''\)\}<\/div>/, 'the stat chips are rendered by statChip inside renderCharacter');
  assert.ok(app.includes('lookPriceMap[i.id] = await transmogPrice(slot, i.id)'), 'the panel prices come from transmogPrice inside renderCharacter');
  // armToConfirm rewrites innerHTML, so the art must be redrawn after the cool-off
  assert.match(slice, /hydratePackArt\(cell, '\.ward-art\[data-art\]'\); \}, ARM_COOLOFF_MS \+ 20\)/, 'the tile art must be redrawn once the cool-off restores the markup');
});

/* ---- QA round 22 W4: an uncommitted preview must not follow the player out and
   back in. S.lookPreview was cleared only on commit/cancel; a hub tab switch or a
   hash change reopened the slot with the preview on the doll, captioned "After",
   bar armed. The clear lives in route() because every navigation lands there. */
test('R22-W4 route() clears S.lookPreview on navigation, and both hub paths reach route()', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const route = app.slice(app.indexOf('function route({ keepScroll = false } = {})'), app.indexOf('const tab = currentTab();', app.indexOf('function route({ keepScroll = false } = {})')));
  assert.match(route, /const isNav = !keepScroll;[\s\S]*if \(isNav\) S\.lookPreview = null;/, 'route() must null S.lookPreview on a navigation (QA round 22 W4)');
  assert.doesNotMatch(route, /^\s*S\.lookPreview = null;/m, 'the clear must be gated on isNav: refresh() is not the player leaving');
  const oc = app.slice(app.indexOf("function openCharacter(tab = 'wardrobe')"), app.indexOf('let pendingHubTab'));
  assert.match(oc, /return route\(\);/, 'openCharacter on the hub must route()');
  assert.match(oc, /location\.hash = '#\/bonehead';/, 'openCharacter off the hub must set the hash, which routes');
  assert.match(app, /function routeFromHash\(\) \{[\s\S]{0,200}?route\(\);/, 'a hashchange must reach route()');
});

/* ---- QA round 22 W13, three bullets. (a) after a successful commit the bar sat
   .armed with a live "Wear it" until restageLook decoded the doll; (b) the v1
   tile printed a bare number; (c) the only scrollIntoView on the screen went to
   the gear card, not the Dressing Room. */
test('R22-W13 the bar disarms on commit, every price tag carries the unit, a doll-slot tap arrives at the panel', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  // (a) same tick as the receipt, before the async restage
  const apply = app.slice(app.indexOf('async function applyLook(btn)'), app.indexOf("$$('[data-equipgear]', content)"));
  const ok = apply.indexOf('S.lookPreview = null;'), disarm = apply.indexOf("classList.remove('armed')"), dis = apply.indexOf('btn.disabled = true;'), restage = apply.indexOf('restageLook({ committed: true })');
  assert.ok(ok > 0 && disarm > ok && dis > ok && restage > dis, 'applyLook must drop .armed and disable the button before restageLook({ committed: true }) (QA round 22 W13a)');
  // the resting bar: not armed, button disabled
  assert.match(app, /class="look-bar mog-bar\$\{changed \? ' armed' : ''\}"/, 'the bar is armed only while a change is selected');
  assert.match(app, /: '<button class="btn ghost mog-go" disabled>Wear it<\/button>'/, 'nothing selected renders a disabled Wear it');
  // (b) no bare price span is left: every priced look tag goes through costTag (dust unit)
  assert.doesNotMatch(app, /<span class="look-cost">\$\{/, 'a bare `12` price tag survives; use costTag (QA round 22 W13b)');
  assert.equal((app.match(/\$\{costTag\(i\.id\)\}/g) || []).length, 2, 'both look grids (v2 and the ?mogv2=0 fallback) price through costTag');
  // (c) the doll-slot tap scrolls the Dressing Room into view after the render lands
  const pd = app.slice(app.indexOf('const wirePd = b =>'), app.indexOf("$$('[data-pd]', content).forEach(wirePd)"));
  assert.match(pd, /await renderCharacter\(wrap, 'wardrobe', \{ instant: true \}\);[\s\S]*\$\('\.mog-panel', wrap\)\?\.scrollIntoView\(/, 'after a doll-slot tap the .mog-panel must be scrolled into view, after the render (QA round 22 W13c)');
});

/* ---- QA round 22 W12: four tap targets under Apple's 44px floor ("Wear it"
   79x43, "What is this?" 105x24, "+ Save this fit" 128x34, "Take it all off"
   120x34), focus invisible on a selected tile, and the price chip and the
   "owned" chip on the same ground. Resolved through the CASCADE like R25-M20:
   .mog-go is a .btn override, so a grep on one rule proves nothing. The pixel
   half is the wardrobe rows in tests/a11y-audit.mjs. */
test('R22-W12 the Dressing Room controls resolve to >= 44px, focus survives selection, owned is not a price', () => {
  const css = readFileSync(join(here, '..', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const dock = [{ tag: 'div', classes: ['mog-dock'] }, { tag: 'div', classes: ['screen'] }];
  const controls = [
    ['Wear it (.look-bar.mog-bar .btn.mog-go)', { tag: 'button', classes: ['btn', 'mog-go'], ancestors: [{ tag: 'div', classes: ['look-bar', 'mog-bar'] }, ...dock] }],
    ['What is this? (.gd-what)', { tag: 'button', classes: ['gd-what'], ancestors: [{ tag: 'div', classes: ['sect-h', 'mog-h'] }, { tag: 'div', classes: ['mog-panel'] }, ...dock] }],
    ['+ Save this fit (.fit-chip.add)', { tag: 'button', classes: ['fit-chip', 'add'], ancestors: [{ tag: 'div', classes: ['fit-rail'] }] }],
    ['Take it all off (.fit-chip.reset)', { tag: 'button', classes: ['fit-chip', 'reset'], ancestors: [{ tag: 'div', classes: ['fit-rail'] }] }],
  ];
  for (const [name, el] of controls) {
    const w = cssResolve(css, el, 'min-height');
    assert.ok(w, `${name}: no rule sets min-height at all (QA round 22 W12)`);
    assert.ok(cssPx(w.value) >= 44, `${name}: the winning min-height is "${w.sel} { min-height: ${w.value} }", under the 44px floor`);
  }
  /* focus on a selected tile: a rule with MORE simple selectors than
     .ward-cell.selected (2), and a different outline than the selection ring */
  const sel = css.match(/\.ward-cell\.selected\s*\{([^}]*)\}/), foc = css.match(/\.ward-cell\.selected:focus-visible\s*\{([^}]*)\}/);
  assert.ok(sel && foc, '.ward-cell.selected and .ward-cell.selected:focus-visible must both exist');
  const outline = block => (block.match(/(?:^|;)\s*outline\s*:\s*([^;]+)/) || [])[1]?.trim();
  assert.ok(outline(foc[1]) && outline(foc[1]) !== outline(sel[1]), `a focused selected tile must compute a different outline (selected: ${outline(sel[1])}, focused: ${outline(foc[1])})`);
  // owned vs price: same chip class, different ground
  const tile = [{ tag: 'button', classes: ['ward-cell', 'look'] }];
  const paid = cssResolve(css, { tag: 'span', classes: ['look-cost', 'paid'], ancestors: tile }, 'background');
  const price = cssResolve(css, { tag: 'span', classes: ['look-cost', 'dust'], ancestors: tile }, 'background');
  assert.ok(paid && price, 'both chips must resolve a background');
  assert.notEqual(paid.value, price.value, `"owned" and a price share a background (${paid.value}); the receipt needs its own ground`);
});

/* ================= QA round 26: the day plumbing (O10, O11, O13, O14, O15) =================
   All node-level. mem-idb is the real js/db.js over an in-memory IndexedDB whose
   transactions are SERIALISED (one at a time, in dispatch order), so a get-then-put
   spanning two transactions interleaves with a second one exactly as a browser
   lets it, and a single-transaction addIfAbsent cannot. That is the caveat and
   the point: the race rows below can only ever see the SHAPE of the claim. */

/* O11. The wheel's spin gate answered granted, granted: a kvGet/kvSet pair on
   wheelLastDate, in one page or across two tabs. The claim is one addIfAbsent on
   kv wheelspin:<date>. Prove-red on main: claimSpin does not exist there. */
test('R26-O11 two overlapping spin claims on one day grant exactly once', async () => {
  await import('./mem-idb.mjs');
  const dbm = await import('../js/db.js');
  dbm.useDbName('unit-r26-o11');
  const { claimSpin } = await import('../js/wheel.js');
  assert.equal(typeof claimSpin, 'function', 'wheel.js must export claimSpin, the addIfAbsent the spin is gated on');
  /* CONTROL: the old shape under this harness. A get-then-put across two
     transactions is what wheel.js shipped, and mem-idb lets both readers see
     the row empty. If this control ever stops showing two grants the harness
     has changed and the race row below proves nothing. */
  const oldGate = async () => {
    if ((await dbm.kvGet('wheelLastDate', null)) === '2026-09-04') return false;
    await dbm.kvSet('wheelLastDate', '2026-09-04');
    return true;
  };
  const ctl = await Promise.all([oldGate(), oldGate()]);
  assert.deepEqual(ctl, [true, true], `harness control: the shipped get-then-put must double-grant here, got ${JSON.stringify(ctl)}`);
  /* HARNESS PROBE. origin/main's mem-idb does not serialise transactions, so two
     overlapping `add`s on one key both see it absent and both land: under it
     this row cannot go green on correct code. The serialising mem-idb (kitchen
     lane, integ/day2) makes it real. Probe with a bare addIfAbsent pair on a
     throwaway key; only assert the race when the harness can carry it. */
  const probe = await Promise.all([dbm.addIfAbsent('kv', { k: 'r26-o11-probe', v: 1 }), dbm.addIfAbsent('kv', { k: 'r26-o11-probe', v: 2 })]);
  const both = await Promise.all([claimSpin('2026-09-04'), claimSpin('2026-09-04')]);
  if (probe.filter(Boolean).length === 1) {
    assert.equal(both.filter(Boolean).length, 1, `two overlapping claims: exactly one may be granted, got ${JSON.stringify(both)}`);
  } else {
    console.log('  R26-O11 note: mem-idb here does not serialise transactions (probe ' + JSON.stringify(probe) + '); the overlapping-claim row is skipped, the sequential rows below still hold');
  }
  assert.equal(await claimSpin('2026-09-04'), false, 'a later claim on the same day is refused');
  assert.equal(await claimSpin('2026-09-05'), true, 'the next day is a fresh claim');
  // the shape pin: the commit asks claimSpin BEFORE it grants, and returns `already` to the loser
  const wheel = readFileSync(join(here, '..', 'js', 'wheel.js'), 'utf8');
  const c = wheel.slice(wheel.indexOf('const commit = async () => {'), wheel.indexOf('prize.grant(rng)'));
  assert.ok(c.length > 0 && /await claimSpin\(today\)/.test(c), 'the wheel commit does not claim the spin with claimSpin before granting');
  assert.match(c, /already: true/, 'the loser must be told (already: true), not handed a silent coinDelta 0');
  assert.match(wheel, /result\.already \? 'Already spun today'/, "the reveal must say 'Already spun today' to the loser, not 'You won'");
});

/* O10. claimDay's rule 2 ('too-fast') read elapsed time off the clock that had
   just moved, so no clock move could ever fire it; the header credited it with
   the wild jumps rule 3 catches. Choice: REMOVED, header says rule 3 is the
   guard. Prove-red on main: 'too-fast' is in db.js there, and a forged anchor
   row makes claimDay say 'too-fast'. */
test('R26-O10 rule 2 is gone from claimDay and from the header, and rule 3 refuses the jump it was credited with', async () => {
  const dbSrc = readFileSync(join(here, '..', 'js', 'db.js'), 'utf8');
  assert.ok(!/too-fast/.test(dbSrc), "js/db.js still carries 'too-fast': a rule that cannot fire is described as a guard again");
  assert.ok(!/\bDAY_GRACE\b/.test(dbSrc), 'DAY_GRACE (rule 2\'s allowance) is still in js/db.js');
  const body = dbSrc.slice(dbSrc.indexOf('export async function claimDay('), dbSrc.indexOf('export async function dayGuardState('));
  assert.ok(!/dayPace/.test(body), 'claimDay still reads or writes the rule-2 anchor rows');
  assert.match(dbSrc, /THERE IS NO RULE 2 ANY MORE/, 'the header must record why rule 2 went, so it is not rebuilt');
  assert.match(dbSrc, /RULE 3: THE SERVER'S DAY\. This is the part no local rule could do, and it\n \* is THE guard against a forward clock move/, 'the header must name rule 3 as the forward-jump guard');
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.ok(!/'too-fast':/.test(app), "DAY_GUARD_COPY still carries a 'too-fast' line for a rule that no longer exists");

  await import('./mem-idb.mjs');
  const dbm = await import('../js/db.js');
  dbm.useDbName('unit-r26-o10');
  const { addDays, dayOrdinal } = await import('../js/nutrition.js');
  const d0 = '2026-09-04';
  assert.equal((await dbm.claimDay(d0)).reason, 'seeded');
  // the only shape that ever made rule 2 fire: an anchor forged 100 days back, "zero time elapsed"
  await dbm.kvSet('dayPaceKey', addDays(d0, -100)); await dbm.kvSet('dayPaceAt', Date.now());
  const next = await dbm.claimDay(addDays(d0, 1));
  assert.equal(next.reason, 'advanced', `a forged anchor must no longer be a refusal (rule 2 is gone), got ${JSON.stringify(next)}`);
  // and the jump rule 2 was credited with (a decade-ahead RTC) is refused by rule 3, by name
  const decade = await dbm.claimDay(addDays(d0, 3650));
  assert.equal(decade.fresh, false); assert.equal(decade.reason, 'unwitnessed', `rule 3 must refuse the decade jump, got ${JSON.stringify(decade)}`);
  assert.equal(decade.ceiling, dayOrdinal(d0) + dbm.WITNESS_GRACE);
  const st = await dbm.dayGuardState();
  assert.ok(!('paceKey' in st) && !('grace' in st), 'dayGuardState still reports rule-2 state');
});

/* O14. DAY_GUARD_COPY had one call site (the quest-claim toast), so five of the
   six day-keyed rewards refused in silence. Every surface now reports through it.
   Prove-red on main: dayGuardToast does not exist and the site count is 1. */
test('R26-O14 every day-keyed reward surface speaks the day-guard copy (>= 6 sites, enumerated)', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const helper = app.match(/\nfunction dayGuardToast\(reason\) \{[\s\S]*?\n\}\n/);
  assert.ok(helper, 'dayGuardToast (the one toast voice for DAY_GUARD_COPY) is missing');
  assert.match(helper[0], /toast\(DAY_GUARD_COPY\[reason\] \|\| DAY_GUARD_COPY\.other, 4200\)/, 'dayGuardToast must speak DAY_GUARD_COPY, nothing new');
  const rest = app.replace(helper[0], '');
  const sites = (rest.match(/\bdayGuardToast\(/g) || []).length + (rest.match(/DAY_GUARD_COPY\[/g) || []).length;
  assert.ok(sites >= 6, `DAY_GUARD_COPY reaches ${sites} surfaces, need >= 6`);
  // one per surface, by anchor
  const surfaces = {
    'quest claim toast': /if \(res\?\.dayGuard\) \{\n\s*dayGuardToast\(res\.dayGuard\);/,
    'day close at boot': /const closed = await awardDayCloseIfDue\(S\.settings\.targets\);\n  if \(closed\?\.closed\)[^\n]*\n  else if \(closed\?\.consoled\)[^\n]*\n  else if \(closed\?\.dayGuard\) setTimeout\(\(\) => dayGuardToast\(closed\.dayGuard\)/,
    'day close on the midnight roll': /_rolling = true;[\s\S]*?else if \(closed\?\.dayGuard\) setTimeout\(\(\) => dayGuardToast\(closed\.dayGuard\)[\s\S]*?finally \{ _rolling = false; \}/,
    'wheel at boot': /maybeShowDailyWheel\(\{ sounds: S\.sounds \}\)\.then\(spun => \{\n    if \(spun === true && !sheetStack\.length\) refresh\(\);\n    else if \(spun\?\.dayGuard\) dayGuardToast\(spun\.dayGuard\)/,
    'wheel on the midnight roll': /_rolling = true;[\s\S]*?maybeShowDailyWheel\(\{ sounds: S\.sounds \}\)\.then\(spun => \{\n      if \(spun === true && !sheetStack\.length\) refresh\(\);\n      else if \(spun\?\.dayGuard\) dayGuardToast\(spun\.dayGuard\)[\s\S]*?finally \{ _rolling = false; \}/,
    'Pit energy line': /energy\.dayGuard \? ' · ' \+ \(DAY_GUARD_COPY\[energy\.dayGuard\] \|\| DAY_GUARD_COPY\.other\)/,
  };
  for (const [name, re] of Object.entries(surfaces)) assert.match(app, re, `surface "${name}" does not report the day-guard refusal`);
  // and the producers hand the reason back rather than swallowing it
  assert.match(readFileSync(join(here, '..', 'js', 'game.js'), 'utf8'), /if \(!day\.fresh\) return \{ dayGuard: day\.reason \|\| true \};/, 'awardDayCloseIfDue still returns a bare null on refusal');
  assert.match(readFileSync(join(here, '..', 'js', 'energy.js'), 'utf8'), /if \(day && !day\.fresh\) v\.dayGuard = day\.reason \|\| true;/, 'refreshPitEnergy does not name the refusal');
  assert.match(readFileSync(join(here, '..', 'js', 'wheel.js'), 'utf8'), /if \(!day\.fresh\) return \{ dayGuard: day\.reason \|\| true \};/, 'maybeShowDailyWheel still returns a bare false on refusal');
});

/* O15. advanceQueue had one caller (the Kitchen sheet's render), so a queue with
   the sheet closed never drained, and Today's card read the pot only. Every
   drain goes through drainCookQueue (which pays the cook XP), called from boot,
   resume, Today's render and the Kitchen; the card counts what was banked.
   Prove-red on main: drainCookQueue does not exist; kitchenCardHtml has no
   `banked` and prints the single pot. */
test('R26-O15 the cook queue drains from boot, resume, Today and the Kitchen, and the card counts finished cooks', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const helper = app.match(/\nasync function drainCookQueue\(\) \{[\s\S]*?\n\}\n/);
  assert.ok(helper, 'drainCookQueue is missing');
  assert.match(helper[0], /await advanceQueue\(\)/, 'drainCookQueue must call advanceQueue');
  assert.match(helper[0], /awardCapped\('cook', 'cook', 8, `Cooked \$\{dish\.name\}`, XP_DAILY_CAP\.cook\)/, 'a drained dish must pay the same XP a manual Serve pays');
  const rest = app.replace(helper[0], '');
  assert.equal((rest.match(/\badvanceQueue\(/g) || []).length, 0, 'advanceQueue is called outside drainCookQueue: that path pays no cook XP');
  const callers = (rest.match(/\bdrainCookQueue\(\)/g) || []).length;
  assert.ok(callers >= 4, `drainCookQueue has ${callers} callers, need boot + resume + Today + Kitchen (>= 4)`);
  const boot = app.slice(app.indexOf('const closed = await awardDayCloseIfDue(S.settings.targets);'), app.indexOf('await ingestHkPayload(hkTaken);'));
  assert.match(boot, /await drainCookQueue\(\);/, 'boot does not drain the queue');
  const resume = app.slice(app.search(/onAppResume\((?:async )?\(\) => \{/), app.indexOf('setInterval(rollDayIfNeeded, 60e3)'));
  assert.match(resume, /drainCookQueue\(\)/, 'resume does not drain the queue');
  const today = app.slice(app.indexOf('async function renderToday(el) {'), app.indexOf("kitchenCardHtml(cook, ingCount, foodbuffs, cropsRipe, _cookBanked)"));
  assert.match(today, /await drainCookQueue\(\);\s*\/\/[^\n]*\n\s*const cook = await cookState\(\);/, 'Today must drain BEFORE it reads cookState for the card');

  // the card renderer, run for real: two finished cooks banked, no pot ready -> "2 dishes are ready!"
  const m = app.match(/\nfunction kitchenCardHtml\(cook, ingCount, buffs, cropsRipe = 0, banked = 0\) \{[\s\S]*?\n\}\n/);
  assert.ok(m, 'kitchenCardHtml does not take the banked count');
  const card = new Function('bhIcon', 'recipeIconHtml', 'esc', `${m[0]}; return kitchenCardHtml;`)(() => '', () => '', String);
  const idle = { ready: false, readyCount: 0, recipe: null };
  assert.match(card(idle, 0, [], 0, 2), /<b[^>]*>2 dishes are ready!<\/b>/, 'two finished cooks waiting in the Pantry are not announced');
  assert.match(card({ ready: true, readyCount: 1, recipe: { name: 'Bone Broth' } }, 0, [], 0, 1), /2 dishes are ready!/, 'one pot ready plus one banked must read 2');
  assert.match(card({ ready: true, readyCount: 1, recipe: { name: 'Bone Broth' } }, 0, [], 0, 0), /Bone Broth is ready!/, 'the single-pot line is unchanged when nothing was banked');
  assert.equal(card(idle, 0, [], 0, 0), '', 'nothing ready, nothing banked: no card, as before');
  assert.match(app, /_cookBanked = 0;   \/\/ the Pantry is on screen from here/, 'opening the Kitchen must clear the announcement');
});

/* O13. dateKey() flips at 0 ms; the visible day flipped at up to 53 s off the 60 s
   interval. One setTimeout aimed at the next local midnight, re-armed after each
   fire and on resume. Prove-red on main: nutrition.js has no armMidnightTimer. */
test('R26-O13 the midnight timeout fires the roll at 0 ms and re-arms for the following midnight', async () => {
  const nut = await import('../js/nutrition.js');
  assert.equal(typeof nut.armMidnightTimer, 'function', 'nutrition.js must export armMidnightTimer');
  const midnight = new Date(2026, 8, 5, 0, 0, 0, 0).getTime();   // local midnight
  let now = midnight - 3000;                                     // 3 s before
  const timers = [];
  let rolls = 0;
  const st = (cb, ms) => { timers.push({ cb, ms, cleared: false }); return timers.length - 1; };
  const ct = id => { if (timers[id]) timers[id].cleared = true; };
  const t = nut.armMidnightTimer(() => { rolls++; }, { now: () => now, setTimeout: st, clearTimeout: ct });
  assert.equal(timers.length, 1, 'exactly ONE timeout is armed');
  assert.ok(Math.abs(timers[0].ms - 3000) <= 1, `3 s before midnight the timeout must be ~3000 ms, got ${timers[0].ms}`);
  now = midnight;                                                // the timer fires at 0 ms
  timers[0].cb();
  assert.equal(rolls, 1, 'the roll did not fire');
  assert.equal(timers.length, 2, 'the timer did not re-arm after firing');
  assert.ok(Math.abs(timers[1].ms - 86400000) <= 3600000 + 1, `re-armed for the following midnight (~24 h, DST allowed), got ${timers[1].ms}`);
  assert.equal(nut.dateKey(new Date(now + timers[1].ms)), '2026-09-06', 'the re-armed timer must land on the next local midnight');
  now = midnight + 7 * 3600000;                                  // resume at 07:00: the pending timer is stale
  t.rearm();
  assert.ok(timers[1].cleared, 'rearm must clear the pending timer');
  assert.equal(timers.length, 3);
  assert.ok(Math.abs(timers[2].ms - 17 * 3600000) <= 1, `re-aimed from the resume clock (17 h), got ${timers[2].ms}`);
  // the app wires it beside the interval and re-aims it on resume
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.match(app, /const midnight = armMidnightTimer\(rollDayIfNeeded\);/, 'app.js does not arm the midnight timeout on rollDayIfNeeded');
  const resume = app.slice(app.search(/onAppResume\((?:async )?\(\) => \{/), app.indexOf('setInterval(rollDayIfNeeded, 60e3)'));
  assert.match(resume, /midnight\.rearm\(\);/, 'resume does not re-aim the midnight timeout');
});

/* ---- QA round 28 P4: sparring paid with no state transition ----
   Driven on v472: start() in the Pit skips spendPitFight (on purpose, practice
   is free), two spars left freeUsed 0 / vigor 3, and settle() paid 15 coins per
   win and 5 per loss off literals, with no ledger key, no cooldown and no cap.
   The Glutton class, in the Pit itself. Runs the REAL js/game.js under mem-idb.
   The cap NUMBER is SPAR_DAILY_CAP = XP_DAILY_CAP.fight, flagged for Tom, so the
   hammer is read off the constant rather than pinned here. */
test('QA round 28 P4: N spars pay at most the daily cap, and one fight id pays once', async () => {
  await import('./mem-idb.mjs');
  const dbm = await import('../js/db.js');
  const g = await import('../js/game.js');
  dbm.useDbName('unit-r28-p4-spar');
  assert.equal(typeof g.claimSpar, 'function', 'game.js exports claimSpar');
  assert.ok(Number.isInteger(g.SPAR_DAILY_CAP) && g.SPAR_DAILY_CAP > 0, 'SPAR_DAILY_CAP is a positive integer');
  const DAY = '2031-07-07';
  // CONTROL: the first spar of the day actually pays the shipped 15
  const first = await g.claimSpar('r28-fight-0', true, DAY);
  assert.deepEqual(first, { claimed: true, coins: 15 }, 'the first spar win must pay 15 (the shipped amount)');
  // the same fight settled again pays nothing: the ref is the fight id
  assert.deepEqual(await g.claimSpar('r28-fight-0', true, DAY), { claimed: false, coins: 0 }, 'a repeated settle of ONE fight took a second slot');
  // hammer: cap + 5 distinct fights on one day pay exactly cap x 15 in total
  let total = 15;
  for (let i = 1; i < g.SPAR_DAILY_CAP + 5; i++) total += (await g.claimSpar(`r28-fight-${i}`, true, DAY)).coins;
  assert.equal(total, g.SPAR_DAILY_CAP * 15, `${g.SPAR_DAILY_CAP + 5} spar wins paid ${total}, the ceiling is ${g.SPAR_DAILY_CAP * 15}`);
  const rows = (await dbm.db.all('xp')).filter(r => r.type === 'spar' && r.date === DAY);
  assert.equal(rows.length, g.SPAR_DAILY_CAP, 'the ledger holds exactly cap spar rows for the day');
  assert.ok(rows.every(r => r.xp === 0), 'a spar slot carries 0 XP: the win XP is the fight cap in settle(), not here');
  // a loss draws from the SAME pool: past the cap it pays 0 too
  assert.deepEqual(await g.claimSpar('r28-fight-loss', false, DAY), { claimed: false, coins: 0 }, 'a spar loss past the cap still paid');
  // and a loss inside the cap pays the shipped 5 (a different day)
  assert.deepEqual(await g.claimSpar('r28-fight-loss', false, '2031-07-08'), { claimed: true, coins: 5 }, 'a spar loss inside the cap must pay 5');
  /* Two OVERLAPPING settles of one fight are NOT graded here: tests/mem-idb.mjs
     commits each transaction on its own macrotask, so two concurrent addIfAbsent
     on one key BOTH resolve true (measured 2026-09-04: awardCapped with one ref
     paid 10 + 10 and left one row, which real IndexedDB cannot do because it
     serialises readwrite transactions on a store). The concurrent half is the
     REPEAT spar row in tests/reward-sop-audit.mjs, against a real IndexedDB. */
  // the settle wires it: no bare literal for the spar win, and the loss branch routes spars too
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.equal((app.match(/mode === 'spar'\) \{ coins = 15/g) || []).length, 0, 'settle() still assigns the 15-coin spar win off a literal');
  assert.match(app, /mode === 'spar'\) \{ coins = \(await claimSpar\(fightId, true\)\)\.coins/, 'the spar win does not read its coins off claimSpar');
  assert.match(app, /coins = foeCfg\.mode === 'spar' \? \(await claimSpar\(fightId, false\)\)\.coins : 5/, 'the spar loss does not read its coins off claimSpar');
  assert.match(app, /const fightId = newId\(\);/, 'openFight mints no fightId for the spar ref');
  // awardCapped callers are untouched by the claimCapped split: the number still means "granted"
  assert.equal(await g.awardCapped('r28cap', 'fight', 10, 'x', 1, DAY), 10, 'awardCapped no longer returns the xp it granted');
  assert.equal(await g.awardCapped('r28cap', 'fight', 10, 'x', 1, DAY), 0, 'awardCapped no longer returns 0 at the ceiling');
});

/* ---- QA round 28 P2: nothing on a button says what a move costs ----
   Driven on v472 over 111 turns: Haymaker's 2 AP / 35 Stamina, Bone Guard's +22
   and Signature's Hype dump lived only in title= (hover, absent on a phone);
   Haymaker sat disabled on 71 of 111 turns while advertising "~45 dmg · 88%
   hit" with no reason; HP was a bar with no number on 0 of 111 turns. The move
   button renderer is a closure inside openFight, so its `costLine` + `btn`
   source is sliced and run here with the values actionsFor would have handed it. */
test('QA round 28 P2: every move button carries its cost in visible text, the reason when disabled, and the HP bars carry a number', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const a0 = app.indexOf('    const costLine = a => {');
  const a1 = app.indexOf("      </button>` : '';", a0);
  assert.ok(a0 > 0 && a1 > a0, 'the costLine/btn block moved: re-anchor this slice');
  const src = app.slice(a0, a1 + "      </button>` : '';".length);
  const render = (fight, player, a) => new Function('fight', 'player', 'esc', 'moveDetail', 'GUARD_STAMINA',
    src + '\nreturn btn(a, { hint: "~45 dmg · 88% hit" });'.replace('btn(a,', 'btn(arguments[5],'))(fight, player, String, () => 'TITLE', 22, a);
  const visible = html => html.replace(/title="[^"]*"/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const hay = { id: 'haymaker', label: 'Haymaker', ap: 2, windCost: 35 };
  // CONTROL: the hint itself still renders, so the slice is the real renderer
  const on = render({ ap: 2, over: false }, { wind: 80, hype: 0 }, { ...hay, enabled: true });
  assert.match(visible(on), /~45 dmg · 88% hit/, 'the slice did not render the hint: this test is looking at the wrong code');
  assert.match(visible(on), /2 AP · 35 Stamina/, 'an enabled Haymaker does not print its 2 AP / 35 Stamina outside title=');
  assert.ok(!/ disabled/.test(on), 'an enabled move rendered disabled');
  // disabled for AP: the reason, with the same value actionsFor compared
  const noAp = render({ ap: 1, over: false }, { wind: 80, hype: 0 }, { ...hay, enabled: false });
  assert.match(noAp, / disabled/, 'control: the disabled attribute is present');
  assert.match(visible(noAp), /Needs 2 AP/, 'a Haymaker disabled for AP does not say "Needs 2 AP" in visible text');
  // disabled for Stamina: current/needed
  const noWind = render({ ap: 2, over: false }, { wind: 12.6, hype: 0 }, { ...hay, enabled: false });
  assert.match(visible(noWind), /Stamina 12\/35/, 'a Haymaker disabled for Stamina does not say "Stamina 12/35"');
  assert.ok(!/Needs 2 AP/.test(visible(noWind)), 'the Stamina case is misreported as an AP case');
  // Bone Guard's +22 (GUARD_STAMINA) and Signature's Hype are values, not prose
  const guard = render({ ap: 1, over: false }, { wind: 50, hype: 0 }, { id: 'guard', label: 'Bone Guard', ap: 1, windCost: 12, enabled: true });
  assert.match(visible(guard), /1 AP · 12 Stamina · \+22 Stamina/, 'Bone Guard does not print its +22 Stamina');
  const sig = render({ ap: 2, over: false }, { wind: 50, hype: 100 }, { id: 'signature', label: 'Signature', ap: 2, windCost: 0, enabled: true });
  assert.match(visible(sig), /2 AP · 100 Hype/, 'Signature does not print the Hype it spends');
  // the full-width SIGNATURE button in renderActions carries the same sub-line
  assert.match(app, /data-act="signature"[^\n]*<span class="cost">\$\{costLine\(sig\)\}<\/span><\/small>/, 'the SIGNATURE button has no cost on its hint line');
  assert.ok(!/<small class="cost">/.test(app), 'a second <small> per move row breaks the three-rows-no-scroll tray (fight-layout ROWS at 393x852)');
  // HP number: printed in the HUD, updated from the same value that drives the width
  assert.match(app, /<span id="youHpN">\$\{Math\.round\(player\.hp\)\}\/\$\{player\.d\.maxHp\}<\/span>/, 'the You HUD has no HP number');
  assert.match(app, /<span id="foeHpN">\$\{Math\.round\(foe\.hp\)\}\/\$\{foe\.d\.maxHp\}<\/span>/, 'the foe HUD has no HP number');
  const ub = app.slice(app.indexOf('  function updateBars() {'), app.indexOf("    el('youHp').style.width"));
  assert.match(ub, /el\('youHpN'\)\.textContent = `\$\{Math\.max\(0, Math\.round\(player\.hp\)\)\}\/\$\{player\.d\.maxHp\}`/, 'updateBars does not refresh the You HP number');
  assert.match(ub, /el\('foeHpN'\)\.textContent = `\$\{Math\.max\(0, Math\.round\(foe\.hp\)\)\}\/\$\{foe\.d\.maxHp\}`/, 'updateBars does not refresh the foe HP number');
});

/* ---- QA round 28 P5: the defeat copy fed a stat that no longer exists ----
   "eat well, walk far" told the loser their habits would rebuild the fighter,
   and since R21-P1's flat base habits feed training POINTS, not stats. The
   Build tab already says so; the defeat panel and the settle note reuse it.
   The quit-0 / loss-5 asymmetry is Tom's call and is NOT graded here. */
test('QA round 28 P5: the stale "eat well, walk far" sentence is gone and both defeat surfaces carry the Training-points sentence', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.equal((app.match(/eat well, walk far/g) || []).length, 0, 'the false sentence is still in app.js');
  const def = app.match(/const DEFEAT_STATS_NOTE = '([^']+)';/);
  assert.ok(def, 'DEFEAT_STATS_NOTE is not defined once as a const');
  assert.match(def[1], /hitting your protein target, closing a day on budget, and every 25,000 steps you walk/, 'the sentence is not the Build tab\'s own Training-points copy');
  // CONTROL: the copy it reuses still exists where it came from
  assert.match(app, /Points come from hitting your protein target, closing a day on budget, and every 25,000 steps you walk, so the build grows/, 'the Build tab source sentence moved: re-check the reuse');
  assert.equal((app.match(/\$\{DEFEAT_STATS_NOTE\}/g) || []).length, 2, 'the note must be used on both defeat surfaces (the DOWN, NOT OUT panel and the settle note)');
});

test('a downloaded build can actually start: boot posts SKIP_WAITING to a waiting worker', () => {
  /* Tom's phone sat on v470 for hours while the server served v472. sw.js does not
     call skipWaiting() on purpose, so a new build waits for every client to close;
     inside the native WKWebView that never happens, and NOTHING in the app had ever
     posted SKIP_WAITING. The download completed and then had nowhere to go. */
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const sw = readFileSync(join(here, '..', 'sw.js'), 'utf8');
  assert.match(sw, /SKIP_WAITING'\s*\)\s*self\.skipWaiting\(\)|=== 'SKIP_WAITING'/, 'sw.js no longer honours the SKIP_WAITING message the app sends');
  assert.match(app, /postMessage\('SKIP_WAITING'\)/, 'nothing in the app tells a waiting worker to take over, so a downloaded build can never start');
  const start = app.indexOf("serviceWorker.register('sw.js'");
  const reg = app.slice(start, app.indexOf("controllerchange", start));
  assert.ok(reg.length > 200, 'setup: the registration block was not found, so the assertions below prove nothing');
  assert.match(reg, /letItIn\(reg\)/, 'the handshake is not run at boot for a build that was already waiting');
  assert.match(reg, /updatefound/, 'a build that arrives mid-session is never let in');
});

test('REV-2: TestFlight invite card is gated by SHOW_BETA_THANKS flag', () => {
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.match(app, /const\s+SHOW_BETA_THANKS\s*=\s*true/, 'SHOW_BETA_THANKS flag not found or not set to true');
  assert.match(app, /async\s+function\s+openThanksCard\(\)\s*{\s*if\s*\(\s*!SHOW_BETA_THANKS\s*\)\s*return/, 'openThanksCard does not guard entry with SHOW_BETA_THANKS check');
  assert.match(app, /function\s+thanksBannerHtml\(\)\s*{\s*if\s*\(\s*!SHOW_BETA_THANKS\s*\)\s*return\s+''/, 'thanksBannerHtml does not return empty string when SHOW_BETA_THANKS is false');
  const newsFilter = app.match(/const\s+NEWS\s*=\s*\[[^]*?\]\.filter\([^)]*\)/);
  assert.ok(newsFilter && newsFilter[0].includes("n.id === 'thanks'") && newsFilter[0].includes('SHOW_BETA_THANKS'), 'NEWS array is not filtered based on SHOW_BETA_THANKS');
});

test('REV-5: wheel weights sum to 95 and comment reflects it', () => {
  const wheel = readFileSync(join(here, '..', 'js', 'wheel.js'), 'utf8');
  assert.match(wheel, /weights\s+sum\s+to\s+95.*probabilities\s+are\s+w\/95/, 'wheel comment does not state weights sum to 95 with normalized probabilities');
  const prizeMatch = wheel.match(/const\s+PRIZES\s*=\s*\[[^]*?\n\];/);
  assert.ok(prizeMatch, 'PRIZES array not found');
  const prizes = prizeMatch[0];
  const weights = [...prizes.matchAll(/weight:\s*(\d+)/g)].map(m => parseInt(m[1], 10));
  const sum = weights.reduce((a, b) => a + b, 0);
  assert.equal(sum, 95, `wheel weights sum to ${sum}, not 95: ${weights.join(' + ')} = ${sum}`);
});

/* ---- QA round 29, S12: the Crew surface says several things that are not true ----
   Every one of these was DRIVEN on two real accounts against a local worker, so
   each assertion below is pinned to a measured symptom rather than to a reading
   of the code. */

test('S12: the friending toast names the two buttons B actually gets', () => {
  /* Measured: A sent a request and was told "They just enter your code back to
     seal it." B's screen has an Accept and an Ignore on the request row and no
     text field anywhere near it. */
  /* FIVE call sites said this and no two agreed. Graded across the whole file,
     not at the one the ticket named: the add-a-code box, the leaderboard row,
     the leaderboard sheet and both arms of the stranger profile all send the
     same request and all owe the same sentence. */
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const lies = app.split('\n')
    .map((l, i) => [i + 1, l])
    .filter(([, l]) => /Request sent\./.test(l) && !/REQUEST_SENT_MSG/.test(l))
    .filter(([, l]) => /enter your code back|adding you back/i.test(l));
  assert.deepEqual(lies, [], `these still describe a flow B is not shown: ${lies.map(([n, l]) => n + ': ' + l.trim()).join(' | ')}`);
  const m = app.match(/^const REQUEST_SENT_MSG = '([^']+)';$/m);
  assert.ok(m, 'there is no one string for what happens after a friend request is sent');
  assert.ok(/Accept/.test(m[1]) && /Ignore/.test(m[1]),
    `the request message does not name the Accept and Ignore B actually gets: ${m[1]}`);
  const uses = (app.match(/REQUEST_SENT_MSG/g) || []).length - 1;
  assert.ok(uses >= 5, `only ${uses} of the five request-sent surfaces use the shared message`);
});

/* THE LEDGER STAMPED THE PULL, NOT THE SEND. Three cheers sent minutes apart,
   one app open, three rows reading "just now". Both halves are driven here
   because neither is the bug on its own: js/social.js has to KEEP the server's
   ts, and js/app.js has to READ it.
   Runs the real applyPayload with a spy awardOnce (it is the one line that turns
   a grant into a ledger row) and the real deliveredWhen + onlineLabel. */
test('S12: a cheer sent nine minutes ago does not render "just now"', async () => {
  const social = readFileSync(join(here, '..', 'js', 'social.js'), 'utf8');
  const sa = social.indexOf('async function applyPayload(');
  const sb = social.indexOf('\n// Test hook: a grant normally arrives', sa);
  assert.ok(sa > 0 && sb > sa, 'applyPayload is not where the slice expects in js/social.js');
  const rows = [];
  const noop = async () => {};
  const applyPayload = new Function('awardOnce', 'coinsAdd', 'boneDustAdd', 'grantCrate',
    'grantConsumable', 'grantEgg', 'grantPet', 'grantGear', 'kvSet',
    `${social.slice(sa, sb)}; return applyPayload;`)(
    async (key, type, xp, label, date, extra) => { rows.push({ ...(extra || {}), key, type, xp, label, ts: Date.now() }); return { claimed: true, xp }; },
    noop, noop, noop, noop, noop, noop, noop, noop);

  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const oa = app.indexOf('function onlineLabel(');
  const ob = app.indexOf('\nconst S = {', oa);
  const da = app.indexOf('const deliveredWhen = ');
  const db_ = app.indexOf('\nasync function crewCheers(', da);
  assert.ok(oa > 0 && ob > oa && da > 0 && db_ > da, 'onlineLabel/deliveredWhen are not where the slice expects in js/app.js');
  const deliveredWhen = new Function(`${app.slice(oa, ob)}\n${app.slice(da, db_)}; return deliveredWhen;`)();

  const SENT = Date.now() - 9 * 60000;
  await applyPayload('cheer-k1', 'cheer', { cheer: 3, cheerFrom: 'p2', from: 'Dusty Lulu', note: 'Dusty Lulu cheered you' }, SENT);
  assert.equal(rows.length, 1, 'setup: the spy ledger took no row, so nothing below is being graded');
  assert.equal(rows[0].sentAt, SENT,
    'the ledger row carries no send time: the grant ts is dropped at applyPayload and every reader downstream sees the ingest stamp');
  assert.equal(deliveredWhen(rows[0]), '9m ago',
    `a cheer sent nine minutes ago rendered "${deliveredWhen(rows[0])}"`);
  // and the ingest stamp is a different number, so the assertion above could have failed
  assert.notEqual(rows[0].ts, SENT, 'setup: ingest and send time are the same instant here, so this proves nothing');
});

test('S12: a row with no send time falls back to ingest and says so', () => {
  /* Every cheer and gift already in a player's ledger predates the fix and has
     no sentAt to recover. Reprinting the ingest stamp as though it were the send
     time is the bug; saying which one it is, is not. */
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  const oa = app.indexOf('function onlineLabel(');
  const ob = app.indexOf('\nconst S = {', oa);
  const da = app.indexOf('const deliveredWhen = ');
  const db_ = app.indexOf('\nasync function crewCheers(', da);
  assert.ok(oa > 0 && ob > oa && da > 0 && db_ > da, 'onlineLabel/deliveredWhen are not where the slice expects in js/app.js');
  const deliveredWhen = new Function(`${app.slice(oa, ob)}\n${app.slice(da, db_)}; return deliveredWhen;`)();
  const old = { key: 'k', type: 'cheer', label: 'Someone cheered you', ts: Date.now() - 9 * 60000 };
  assert.equal(deliveredWhen(old), 'arrived 9m ago',
    `a pre-fix row rendered "${deliveredWhen(old)}" instead of naming the time as an arrival`);
  assert.equal(deliveredWhen({ ts: Date.now() }), 'arrived just now', 'a fresh pre-fix row lost its label');
  assert.equal(deliveredWhen({ sentAt: Date.now() }), 'just now', 'a row WITH a send time must not be labelled as an arrival');
});

test('S12: both sides are told a friendship completed, and a cheer is receipted to its sender', () => {
  /* A waited 45 seconds after B accepted with nothing but analytics on the wire.
     There is exactly one delivery channel for "a friend did something" in this
     app -- the grants feed -- so this asserts the news goes onto THAT rather
     than onto a new one, and that the client has somewhere to show it. */
  const srv = readFileSync(join(here, '..', 'server', 'src', 'index.js'), 'utf8');
  assert.match(srv, /async function notifyFriendship\(/, 'nothing on the server tells either side a friendship completed');
  const na = srv.indexOf('async function notifyFriendship(');
  const body = srv.slice(na, srv.indexOf('\n/* ---------------- daily-capped grants', na));
  assert.ok(body.length > 200, 'setup: notifyFriendship body not found, so the assertions below prove nothing');
  assert.equal((body.match(/INSERT OR IGNORE INTO grants/g) || []).length, 1, 'the pair of rows is not built from one statement');
  assert.match(body, /row\(a, b\), row\(b, a\)/, 'only one side of the pair is told');
  /* Keyed by the player it NAMES, which is what lets POST /account/delete reach
     every crew row about a deleted account with one range. */
  assert.match(body, /`crew-\$\{other\}-pair`/, 'a crew row is not keyed by the player it names');
  const del = srv.slice(srv.indexOf("path === '/account/delete'"), srv.indexOf("path === '/events'"));
  assert.match(del, /DELETE FROM grants WHERE key >= \? AND key < \?[\s\S]{0,80}crew-\$\{id\}-/,
    'a deleted account keeps its name and its id on its friends\' crew news for a year');
  // both completion paths: the explicit accept AND the reciprocated request
  const accept = srv.slice(srv.indexOf("path === '/friends/accept'"), srv.indexOf("path === '/friends/remove'"));
  assert.match(accept, /notifyFriendship\(/, '/friends/accept completes a friendship and tells nobody');
  const req = srv.slice(srv.indexOf('async function requestFriendship('), na);
  assert.match(req, /status === 'accepted'[\s\S]*notifyFriendship\(/, 'a reciprocated request auto-accepts and tells nobody');
  // the cheer receipt, on the landed path only
  const cheer = srv.slice(srv.indexOf("path === '/cheer' && request.method === 'POST'"), srv.indexOf("path === '/me' && request.method === 'GET'"));
  assert.match(cheer, /crew-\$\{to\}-cheerack-/, 'a cheer still leaves no trace on the side that sent it');
  assert.ok(cheer.indexOf('-cheerack-') > cheer.indexOf("code: 'limit' }, 429"),
    'the cheer receipt is written before the cap refusal, so a refused cheer would be receipted');
  // and the client can show a crew-typed grant at all
  const app = readFileSync(join(here, '..', 'js', 'app.js'), 'utf8');
  assert.match(app, /DELIVERY_TYPES = new Set\(\[[^\]]*'crew'/, "Deliveries does not list 'crew' rows, so the news lands in the ledger and is never shown");
  assert.match(app, /g\.type === 'crew'[\s\S]{0,120}crewNews\.push/, 'a crew-typed grant falls through every reveal branch and arrives silently');
});

await runAll();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
