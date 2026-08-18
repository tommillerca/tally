// The Bone Garden: grow cooking ingredients in the Kitchen instead of only
// finding them on the map.
//
// THE BALANCE PROBLEM, because it is the whole design. Composting an ingredient
// into seeds and harvesting more than you planted is a multiplier greater than 1,
// which compounds: 1 -> 5 -> 25 if nothing throttles it. Ingredients gate the
// dishes, and dishes are combat buffs, so an unthrottled garden means every buff
// permanently on and the Boneyard stops mattering.
//
// The throttle is SEEDS, not plots. The compost heap takes COMPOSTS_PER_DAY a day
// and no more, so the closed loop is capped at roughly 4.6 seeds a day (about one
// walk's worth of ingredients back) however many beds you own. Plots and grow time
// are the second throttle, not the first. Ectoplasm is excluded entirely: spores
// only come off rare map finds, so the premium feast stays something you earn
// outside.
//
// Nothing here can kill a crop or lose a seed. Missing the watering window costs
// you the top yield, never the plant.

import { kvGet, kvSet, kvUpdate } from './db.js';
import { dateKey } from './nutrition.js';
import { INGREDIENTS, COMMON_INGREDIENT_IDS, RARE_INGREDIENT, grantIngredient, ingredients } from './cooking.js';

export const PLOTS_FREE = 3;
export const PLOTS_MAX = 5;
export const PLOT_PRICES = [1500, 4000];     // coins for the 4th bed, then the 5th
export const GROW_MIN = 180;                 // 3h for a common
export const GROW_MIN_RARE = 720;            // 12h for an Ectoplasm spore
export const COMPOSTS_PER_DAY = 3;
export const SEED_ODDS = [0.55, 0.35, 0.10]; // 1 / 2 / 3 seeds per composted ingredient
export const HARVEST_BASE = 2;               // a common seed always returns more than the one you spent
export const HARVEST_BASE_RARE = 1;
export const BUMPER_CHANCE = 0.10;           // +1 on a common, on top of the watering bonus
export const SPAWN_SEED_CHANCE = 0.30;       // a map spawn also dropping a seed

// what you can plant: every common, plus the rare as a "spore"
export const SEED_IDS = [...COMMON_INGREDIENT_IDS, RARE_INGREDIENT];
export function seedName(id) { return id === RARE_INGREDIENT ? 'Spore' : INGREDIENTS[id].name; }
export function isRareSeed(id) { return id === RARE_INGREDIENT; }
export function growMinutes(id) { return isRareSeed(id) ? GROW_MIN_RARE : GROW_MIN; }

/* ---------- state (kv 'garden') ----------
 * { seeds: {id: n}, plots: [null | {ing, plantedAt, readyAt, watered}],
 *   plotsOwned: n, composts: { date, used } }
 * Read migrates a missing/short shape rather than replacing it, so this can land
 * on an existing save without touching anything. */
const EMPTY = { seeds: {}, plots: [], plotsOwned: PLOTS_FREE, composts: { date: '', used: 0 } };

/* Pure so it can run INSIDE a kvUpdate transaction, where nothing may await. */
function migrate(rawIn) {
  const raw = rawIn || {};
  const g = { ...EMPTY, ...raw };
  g.seeds = { ...(raw.seeds || {}) };
  g.plotsOwned = Math.min(PLOTS_MAX, Math.max(PLOTS_FREE, raw.plotsOwned || PLOTS_FREE));
  g.plots = Array.isArray(raw.plots) ? raw.plots.slice(0, g.plotsOwned) : [];
  while (g.plots.length < g.plotsOwned) g.plots.push(null);
  g.composts = { date: raw.composts?.date || '', used: raw.composts?.used || 0 };
  return g;
}
async function read() { return migrate(await kvGet('garden', null)); }
async function write(g) { await kvSet('garden', g); }

/* ---------- seeds ---------- */
export async function seeds() { return (await read()).seeds; }
export async function seedCount(g) {
  const s = g || await seeds();
  return Object.values(s).reduce((a, n) => a + n, 0);
}
export async function grantSeed(id, n = 1) {
  if (!SEED_IDS.includes(id) || n <= 0) return 0;
  const g = await read();
  g.seeds[id] = (g.seeds[id] || 0) + n;
  await write(g);
  return g.seeds[id];
}
// a map spawn sometimes also drops a seed of what it yielded (walking stays the
// best seed source, which is the point)
export function rollSpawnSeed(rand = Math.random) { return rand() < SPAWN_SEED_CHANCE; }

/* ---------- compost: ingredient -> seeds ---------- */
// pure so the odds are testable without a database
export function rollSeeds(rand = Math.random) {
  const x = rand();
  let acc = 0;
  for (let i = 0; i < SEED_ODDS.length; i++) { acc += SEED_ODDS[i]; if (x < acc) return i + 1; }
  return SEED_ODDS.length;
}
export async function compostStatus(now = Date.now()) {
  const g = await read();
  const today = dateKey(new Date(now));
  const used = g.composts.date === today ? g.composts.used : 0;
  return { used, left: Math.max(0, COMPOSTS_PER_DAY - used), cap: COMPOSTS_PER_DAY };
}
export async function compostIngredient(id, now = Date.now(), rand = Math.random) {
  if (id === RARE_INGREDIENT) return { ok: false, reason: 'rare' };
  if (!SEED_IDS.includes(id)) return { ok: false, reason: 'unknown' };
  const st = await compostStatus(now);
  if (st.left <= 0) return { ok: false, reason: 'cap', cap: st.cap };
  const inv = await ingredients();
  if (!(inv[id] > 0)) return { ok: false, reason: 'ingredients' };
  const n = rollSeeds(rand);
  // spend the ingredient first, then bank the seeds, so a mid-write failure can
  // only ever cost the player nothing rather than duplicating
  await grantIngredient(id, -1);
  const g = await read();
  g.seeds[id] = (g.seeds[id] || 0) + n;
  g.composts = { date: dateKey(new Date(now)), used: (g.composts.date === dateKey(new Date(now)) ? g.composts.used : 0) + 1 };
  await write(g);
  return { ok: true, id, seeds: n, left: COMPOSTS_PER_DAY - g.composts.used };
}

/* ---------- plots ---------- */
export function plotPrice(owned) { return owned >= PLOTS_MAX ? null : PLOT_PRICES[owned - PLOTS_FREE]; }
export async function addPlot() {   // caller charges the coins; this only grows the bed count
  const g = await read();
  if (g.plotsOwned >= PLOTS_MAX) return g.plotsOwned;
  g.plotsOwned += 1;
  g.plots.push(null);
  await write(g);
  return g.plotsOwned;
}

export async function gardenState(now = Date.now()) {
  const g = await read();
  const plots = g.plots.map((p, index) => {
    if (!p || !INGREDIENTS[p.ing]) return { index, empty: true };
    const ready = now >= p.readyAt;
    return {
      index, empty: false, ing: p.ing, name: INGREDIENTS[p.ing].name, rare: isRareSeed(p.ing),
      plantedAt: p.plantedAt, readyAt: p.readyAt, ready, watered: !!p.watered,
      remainingMs: Math.max(0, p.readyAt - now),
      // watering is only meaningful while it grows; a ready crop is past caring
      canWater: !ready && !p.watered,
    };
  });
  return {
    plotsOwned: g.plotsOwned, plots,
    seeds: g.seeds,
    freeCount: plots.filter(p => p.empty).length,
    readyCount: plots.filter(p => !p.empty && p.ready).length,
    growing: plots.filter(p => !p.empty && !p.ready).length,
    thirsty: plots.filter(p => p.canWater).length,
  };
}
// the Kitchen button badge / speech line only need the one number
export async function cropsReady(now = Date.now()) { return (await gardenState(now)).readyCount; }

export async function plantSeed(id, slot = null, now = Date.now()) {
  if (!SEED_IDS.includes(id)) return { ok: false, reason: 'unknown' };
  const g = await read();
  if (!(g.seeds[id] > 0)) return { ok: false, reason: 'seeds' };
  const idx = slot == null ? g.plots.findIndex(p => !p) : slot;
  if (idx < 0 || idx >= g.plots.length) return { ok: false, reason: 'full' };
  if (g.plots[idx]) return { ok: false, reason: 'occupied' };
  g.seeds[id] -= 1;
  if (g.seeds[id] <= 0) delete g.seeds[id];
  g.plots[idx] = { ing: id, plantedAt: now, readyAt: now + growMinutes(id) * 60e3, watered: false };
  await write(g);
  return { ok: true, slot: idx, readyAt: g.plots[idx].readyAt };
}

export async function waterPlot(index, now = Date.now()) {
  const g = await read();
  const p = g.plots[index];
  if (!p) return { ok: false, reason: 'empty' };
  if (now >= p.readyAt) return { ok: false, reason: 'ready' };
  if (p.watered) return { ok: false, reason: 'already' };
  p.watered = true;
  await write(g);
  return { ok: true, ing: p.ing };
}

// pure yield rule, so the numbers can be checked without a clock or a database
export function harvestYield({ rare, watered }, rand = Math.random) {
  let n = rare ? HARVEST_BASE_RARE : HARVEST_BASE;
  if (watered) n += 1;
  const bumper = !rare && rand() < BUMPER_CHANCE;
  if (bumper) n += 1;
  return { n, bumper };
}

/* CLEARING THE BED IS THE CLAIM, AND IT HAPPENS IN ONE TRANSACTION.
 * This used to bank the crop first and clear the bed afterwards, so that an
 * interrupted harvest could not empty a plot and hand over nothing. The cost of
 * that ordering is worse than the thing it avoided: two overlapping harvests of
 * one bed both read a grown plot and both paid, measured 2026-08-17 on this
 * tree (two concurrent harvestPlot(0) both returned ok, and only a SECOND bug,
 * a lost update inside grantIngredient, kept the ingredient count from
 * doubling). Reading the plot and nulling it are now the same transaction, so
 * exactly one caller can take a bed, and the same remove-first rule openGift,
 * hatchEgg, collectDish and claimDenLoot already follow applies here too: a
 * crash between the take and the grant costs one crop, which is recoverable. */
export async function harvestPlot(index, now = Date.now(), rand = Math.random) {
  let out = { ok: false, reason: 'empty' };
  await kvUpdate('garden', (raw) => {
    const g = migrate(raw);
    const p = g.plots[index];
    if (!p || !INGREDIENTS[p.ing]) { out = { ok: false, reason: 'empty' }; return undefined; }
    if (now < p.readyAt) { out = { ok: false, reason: 'growing' }; return undefined; }
    const { n, bumper } = harvestYield({ rare: isRareSeed(p.ing), watered: !!p.watered }, rand);
    out = { ok: true, ing: p.ing, name: INGREDIENTS[p.ing].name, n, bumper, watered: !!p.watered, rare: isRareSeed(p.ing) };
    g.plots[index] = null;
    return g;
  }, null);
  if (out.ok) await grantIngredient(out.ing, out.n);
  return out;
}
