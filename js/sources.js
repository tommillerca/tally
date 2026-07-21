// Open Food Facts + USDA FoodData Central: fetchers and pure mappers to the app food model.
// Mappers are pure and unit-tested against real API fixtures.

import { kcalConsistent } from './nutrition.js';

const OFF_FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity,quantity,nutrition_data_per';

function n(v) { const x = typeof v === 'string' ? parseFloat(v) : v; return isFinite(x) ? x : null; }

export function mapOffProduct(json) {
  if (!json || json.status !== 1 || !json.product) return null;
  return mapOffP(json.product);
}

// Map a bare OFF product object (from the barcode endpoint's .product OR a
// search result in .products[]) to the app food model. Returns null if there's
// no usable energy figure.
export function mapOffP(p) {
  if (!p || !p.code) return null;
  const nu = p.nutriments || {};
  const kcal100 = n(nu['energy-kcal_100g']) != null ? n(nu['energy-kcal_100g'])
    : (n(nu['energy_100g']) != null ? n(nu['energy_100g']) / 4.184 : null);

  const per100 = kcal100 != null ? {
    kcal: kcal100,
    p: n(nu['proteins_100g']) ?? 0,
    c: n(nu['carbohydrates_100g']) ?? 0,
    f: n(nu['fat_100g']) ?? 0,
    fiber: n(nu['fiber_100g']),
    sugar: n(nu['sugars_100g']),
    sodium: n(nu['sodium_100g']) != null ? n(nu['sodium_100g']) * 1000 : null,
  } : null;

  const servingG = n(p.serving_quantity);
  let perServing = null;
  if (!per100) {
    const kcalS = n(nu['energy-kcal_serving']) != null ? n(nu['energy-kcal_serving'])
      : (n(nu['energy_serving']) != null ? n(nu['energy_serving']) / 4.184 : null);
    if (kcalS == null) return null;
    perServing = {
      kcal: kcalS,
      p: n(nu['proteins_serving']) ?? 0,
      c: n(nu['carbohydrates_serving']) ?? 0,
      f: n(nu['fat_serving']) ?? 0,
      fiber: n(nu['fiber_serving']),
      sugar: n(nu['sugars_serving']),
      sodium: n(nu['sodium_serving']) != null ? n(nu['sodium_serving']) * 1000 : null,
    };
  }

  const name = (p.product_name || '').trim() || 'Unnamed product';
  const brand = (p.brands || '').split(',')[0].trim() || null;
  const servings = [];
  const sLabel = (p.serving_size || '').trim();
  if (servingG || sLabel) servings.push({ label: sLabel || '1 serving', g: servingG || null });
  if (per100) servings.push({ label: '100 g', g: 100 });

  return {
    id: `off-${p.code}`,
    source: 'off',
    barcode: String(p.code),
    name: name.length > 60 ? name.slice(0, 57) + '...' : cap(name),
    brand,
    per100: per100 || undefined,
    perServing: perServing || undefined,
    servings: servings.length ? servings : [{ label: '1 serving', g: null }],
  };
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

export async function fetchOffProduct(code, fetchFn = fetch) {
  const tryCodes = [code];
  if (code.length === 12) tryCodes.push('0' + code); // UPC-A as EAN-13
  if (code.length === 13 && code.startsWith('0')) tryCodes.push(code.slice(1));
  for (const c of tryCodes) {
    try {
      const r = await fetchFn(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(c)}.json?fields=${OFF_FIELDS}`);
      if (r.status === 404) continue;
      if (!r.ok) continue;
      const j = await r.json();
      const food = mapOffProduct(j);
      if (food) return food;
    } catch { /* network issue, fall through */ }
  }
  return null;
}

// ---- USDA FoodData Central ----

const FDC_NUTR = {
  Energy: 'kcal',
  Protein: 'p',
  'Total lipid (fat)': 'f',
  'Carbohydrate, by difference': 'c',
  'Fiber, total dietary': 'fiber',
  'Total Sugars': 'sugar',
  'Sodium, Na': 'sodium',
};

export function mapFdcFood(f) {
  if (!f) return null;
  const per100 = {};
  for (const fn of f.foodNutrients || []) {
    const key = FDC_NUTR[fn.nutrientName];
    if (!key) continue;
    if (key === 'kcal' && String(fn.unitName).toUpperCase() !== 'KCAL') continue;
    if (per100[key] == null && fn.value != null) per100[key] = fn.value;
  }
  if (per100.kcal == null) return null;
  per100.p = per100.p ?? 0; per100.c = per100.c ?? 0; per100.f = per100.f ?? 0;

  const unit = String(f.servingSizeUnit || '').toLowerCase();
  const isGramsy = ['g', 'grm', 'gram', 'ml', 'mlt'].includes(unit);
  const servingG = isGramsy && n(f.servingSize) ? n(f.servingSize) : null;
  const household = (f.householdServingFullText || '').trim();

  const servings = [];
  if (servingG) {
    const label = household ? `${household} (${Math.round(servingG)} g)` : `1 serving (${Math.round(servingG)} g)`;
    servings.push({ label, g: servingG });
  }
  servings.push({ label: '100 g', g: 100 });

  const brand = (f.brandName || f.brandOwner || '').trim() || null;
  const rawName = (f.description || 'Unnamed').trim();
  const name = titleCase(rawName).slice(0, 60);

  return {
    id: `fdc-${f.fdcId}`,
    source: 'fdc',
    barcode: (f.gtinUpc || '').replace(/^0+/, '') || undefined,
    name,
    brand: brand ? titleCase(brand) : null,
    per100,
    servings,
    quality: kcalConsistent(per100) ? 1 : 0,
  };
}

function titleCase(s) {
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s; // already mixed case
  return s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

export function rankFdcResults(foods, query) {
  const q = query.toLowerCase();
  const seen = new Set();
  const scored = [];
  for (const f of foods) {
    if (!f) continue;
    const key = `${f.name}|${f.brand || ''}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    let score = f.quality * 10;
    if (f.name.toLowerCase().startsWith(q)) score += 5;
    if (f.name.toLowerCase().includes(q)) score += 3;
    if (f.brand) score += 1;
    if (f.servings.length > 1) score += 1;
    scored.push({ f, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.f);
}

export async function searchFdc(query, apiKey = 'DEMO_KEY', fetchFn = fetch) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}` +
    `&query=${encodeURIComponent(query)}&dataType=Branded,Foundation,SR%20Legacy&pageSize=25`;
  const r = await fetchFn(url);
  if (r.status === 429) throw new Error('rate_limit');
  if (!r.ok) throw new Error(`fdc_http_${r.status}`);
  const j = await r.json();
  return rankFdcResults((j.foods || []).map(mapFdcFood), query).slice(0, 15);
}

// Open Food Facts TEXT search (not just barcodes). Huge named/branded coverage
// (café drinks, brand items) that USDA misses. No API key, no per-user rate cap.
export async function searchOff(query, fetchFn = fetch) {
  const url = 'https://world.openfoodfacts.org/cgi/search.pl'
    + `?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1`
    + `&page_size=30&fields=${OFF_FIELDS}`;
  // OFF's search backend 503s intermittently under load — one quick retry.
  let r = await fetchFn(url);
  if (r.status >= 500) { await new Promise(res => setTimeout(res, 700)); r = await fetchFn(url); }
  if (!r.ok) throw new Error(`off_http_${r.status}`);
  const j = await r.json();
  const foods = (j.products || [])
    .map(mapOffP)
    .filter(f => f && f.name !== 'Unnamed product')
    .map(f => ({ ...f, quality: (f.per100 && kcalConsistent(f.per100)) ? 1 : 0 }));
  return rankFdcResults(foods, query).slice(0, 15);
}

// One online search across BOTH sources, merged + ranked. Resilient: if one
// source fails (USDA rate limit, OFF hiccup) the other still returns. Only
// throws rate_limit when USDA is limited AND OFF gave nothing.
export async function searchOnline(query, apiKey = 'DEMO_KEY', fetchFn = fetch) {
  const [fdc, off] = await Promise.allSettled([
    searchFdc(query, apiKey, fetchFn),
    searchOff(query, fetchFn),
  ]);
  const fdcFoods = fdc.status === 'fulfilled' ? fdc.value : [];
  const offFoods = off.status === 'fulfilled' ? off.value : [];
  if (!fdcFoods.length && !offFoods.length) {
    if (fdc.status === 'rejected' && fdc.reason && fdc.reason.message === 'rate_limit') throw new Error('rate_limit');
    return [];
  }
  // OFF first (better for named café/brand items), then USDA; rank dedups.
  return rankFdcResults([...offFoods, ...fdcFoods], query).slice(0, 20);
}

// Barcode fallback: FDC text search by GTIN digits.
export async function fetchFdcByBarcode(code, apiKey = 'DEMO_KEY', fetchFn = fetch) {
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}` +
      `&query=${encodeURIComponent(code)}&dataType=Branded&pageSize=5`;
    const r = await fetchFn(url);
    if (!r.ok) return null;
    const j = await r.json();
    const stripped = code.replace(/^0+/, '');
    for (const raw of j.foods || []) {
      const gtin = String(raw.gtinUpc || '').replace(/^0+/, '');
      if (gtin && (gtin === stripped || gtin.endsWith(stripped) || stripped.endsWith(gtin))) {
        const f = mapFdcFood(raw);
        if (f) { f.barcode = stripped; return f; }
      }
    }
  } catch { /* offline or rate limited */ }
  return null;
}
