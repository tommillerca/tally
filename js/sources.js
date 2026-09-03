// Open Food Facts + USDA FoodData Central: fetchers and pure mappers to the app food model.
// Mappers are pure and unit-tested against real API fixtures.

import { kcalConsistent } from './nutrition.js';

/* A LOOKUP THAT HANGS IS NOT A LOOKUP THAT FAILED, AND NEITHER IS "NOT FOUND".
 *
 * Two separate problems live in this file and they compound.
 *
 * 1. No deadline. Measured 2026-08-17 against a server that accepts the request
 *    and never answers: the barcode sheet sat on "Looking up 5000112637922"
 *    with the camera already stopped, forever, and the Add-food sheet's online
 *    section sat on a spinner, forever. Same shape as js/social.js, same fix:
 *    abort at a deadline so the caller's failure path can run at all.
 *
 * 2. Every failure was flattened to "nothing found". fetchOffProduct returned
 *    null for a 404 AND for a dead network; searchOnline returned [] for both.
 *    Measured on the same run, barcode 5000112637922: online it resolves to a
 *    product and opens the portion sheet; with the network removed the app
 *    said "Not in the books. Plenty of packaged food was never listed in the
 *    databases" and offered to let the player type it in by hand. That is a
 *    statement of fact about a database we never reached, and acting on it
 *    costs the player a permanent duplicate custom food.
 *
 * So the *Ex functions below report whether the source was REACHED, and
 * 'unreachable' is thrown rather than swallowed. The plain exports keep their
 * old food-or-null shape because tests/unit.test.js and the mappers use them.
 *
 * 15s, not social.js's 12s: these are third-party hosts on a cold CDN edge, and
 * Open Food Facts's search backend is measurably slower than our own Worker. */
export const LOOKUP_DEADLINE_MS = 15000;
/* ONE BUDGET FOR THE WHOLE LOOKUP, not one per request. A barcode consults Open
   Food Facts (up to three code variants) and then USDA, sequentially, so a
   per-request deadline would have added up to 60s of staring at "Looking up
   5000112637922". The caller opens a budget once and every fetch underneath it
   aborts at the same wall-clock instant. */
export function fetchWithDeadline(deadlineAt) {
  return (url, opts = {}) => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(new DOMException('the food database did not answer in time', 'TimeoutError')),
      Math.max(1, deadlineAt - Date.now()));
    return fetch(url, { ...opts, signal: ac.signal }).finally(() => clearTimeout(t));
  };
}
export function timedFetch(url, opts = {}) {
  return fetchWithDeadline(Date.now() + LOOKUP_DEADLINE_MS)(url, opts);
}

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

/* reached:false means we never got an answer out of Open Food Facts, so nothing
   here is evidence about whether the product exists. */
export async function fetchOffProductEx(code, fetchFn = timedFetch) {
  const tryCodes = [code];
  if (code.length === 12) tryCodes.push('0' + code); // UPC-A as EAN-13
  if (code.length === 13 && code.startsWith('0')) tryCodes.push(code.slice(1));
  let reached = false;
  for (const c of tryCodes) {
    try {
      const r = await fetchFn(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(c)}.json?fields=${OFF_FIELDS}`);
      /* A RESPONSE OBJECT IS NOT AN ANSWER ABOUT THE PRODUCT. `reached` used to
         be set right here, so an Open Food Facts 500, a 502 off the CDN edge, or
         a captive-portal login page (200, HTML body, r.json() throws below into
         the catch) all counted as "the book answered, the product is not in it".
         The player got "Not in the books" with no Try again and was steered into
         creating a permanent duplicate custom food. Only two things are evidence:
         a 404, which really is this book saying no such code, and a body that
         parsed as JSON. */
      if (r.status === 404) { reached = true; continue; }
      if (!r.ok) continue;
      const j = await r.json();
      reached = true;
      const food = mapOffProduct(j);
      if (food) return { food, reached: true };
    } catch { /* no answer from this host; `reached` stays as it was */ }
  }
  return { food: null, reached };
}
export async function fetchOffProduct(code, fetchFn = timedFetch) {
  return (await fetchOffProductEx(code, fetchFn)).food;
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

export async function searchFdc(query, apiKey = 'DEMO_KEY', fetchFn = timedFetch) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}` +
    `&query=${encodeURIComponent(query)}&dataType=Branded,Foundation,SR%20Legacy&pageSize=25`;
  let r;
  try { r = await fetchFn(url); } catch { throw new Error('unreachable'); }
  if (r.status === 429) throw new Error('rate_limit');
  if (!r.ok) throw new Error(`fdc_http_${r.status}`);
  const j = await r.json();
  return rankFdcResults((j.foods || []).map(mapFdcFood), query).slice(0, 15);
}

// Open Food Facts TEXT search (not just barcodes). Huge named/branded coverage
// (café drinks, brand items) that USDA misses. No API key, no per-user rate cap.
export async function searchOff(query, fetchFn = timedFetch) {
  const url = 'https://world.openfoodfacts.org/cgi/search.pl'
    + `?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1`
    + `&page_size=30&fields=${OFF_FIELDS}`;
  // OFF's search backend 503s intermittently under load — one quick retry.
  let r;
  try { r = await fetchFn(url); } catch { throw new Error('unreachable'); }
  if (r.status >= 500) {
    await new Promise(res => setTimeout(res, 700));
    try { r = await fetchFn(url); } catch { throw new Error('unreachable'); }
  }
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
export async function searchOnline(query, apiKey = 'DEMO_KEY', fetchFn = null) {
  const fn = fetchFn || fetchWithDeadline(Date.now() + LOOKUP_DEADLINE_MS);
  const [fdc, off] = await Promise.allSettled([
    searchFdc(query, apiKey, fn),
    searchOff(query, fn),
  ]);
  const fdcFoods = fdc.status === 'fulfilled' ? fdc.value : [];
  const offFoods = off.status === 'fulfilled' ? off.value : [];
  if (!fdcFoods.length && !offFoods.length) {
    if (fdc.status === 'rejected' && fdc.reason && fdc.reason.message === 'rate_limit') throw new Error('rate_limit');
    /* NOBODY ANSWERED IS NOT NOTHING FOUND. Returning [] here is what put
       "Nothing found online. Try the barcode or label scanner." on screen for a
       player whose phone had no signal, which sends them to a scanner that
       needs the same network. Only claim an empty result when at least one
       source actually answered. */
    const unreachable = r => r.status === 'rejected' && r.reason && r.reason.message === 'unreachable';
    if (unreachable(fdc) && unreachable(off)) throw new Error('unreachable');
    return [];
  }
  // OFF first (better for named café/brand items), then USDA; rank dedups.
  return rankFdcResults([...offFoods, ...fdcFoods], query).slice(0, 20);
}

// Barcode fallback: FDC text search by GTIN digits.
export async function fetchFdcByBarcodeEx(code, apiKey = 'DEMO_KEY', fetchFn = timedFetch) {
  let reached = false;
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(apiKey)}` +
      `&query=${encodeURIComponent(code)}&dataType=Branded&pageSize=5`;
    const r = await fetchFn(url);
    // Same misdirection as fetchOffProductEx above, and it lands in the same
    // place: lookupBarcode ANDs the two `reached` flags, so a USDA 500 or an
    // unparseable body was enough to turn an honest OFF miss into "not in the
    // books". This is a search endpoint, so nothing short of a parsed body is
    // an answer (there is no 404-means-absent case here).
    if (!r.ok) return { food: null, reached };
    const j = await r.json();
    reached = true;
    const stripped = code.replace(/^0+/, '');
    for (const raw of j.foods || []) {
      const gtin = String(raw.gtinUpc || '').replace(/^0+/, '');
      if (gtin && (gtin === stripped || gtin.endsWith(stripped) || stripped.endsWith(gtin))) {
        const f = mapFdcFood(raw);
        if (f) { f.barcode = stripped; return { food: f, reached: true }; }
      }
    }
  } catch { /* no answer, or an unreadable body */ }
  return { food: null, reached };
}
export async function fetchFdcByBarcode(code, apiKey = 'DEMO_KEY', fetchFn = timedFetch) {
  return (await fetchFdcByBarcodeEx(code, apiKey, fetchFn)).food;
}

/* THE WHOLE BARCODE LOOKUP, WITH ITS OWN VERDICT.
 * `reached` is an AND across every source consulted: if EITHER book was
 * unreachable, "not in the books" is not something we are entitled to say. */
export async function lookupBarcode(code, apiKey = 'DEMO_KEY', fetchFn = null) {
  const fn = fetchFn || fetchWithDeadline(Date.now() + LOOKUP_DEADLINE_MS);
  const off = await fetchOffProductEx(code, fn);
  if (off.food) return { food: off.food, reached: true, source: 'off' };
  const fdc = await fetchFdcByBarcodeEx(code, apiKey, fn);
  if (fdc.food) return { food: fdc.food, reached: true, source: 'fdc' };
  return { food: null, reached: off.reached && fdc.reached, source: null };
}
