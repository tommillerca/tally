// Food-ingredient collectibles + timed home cooking -> food buffs.
// You scavenge ingredients on the map (spawns), then cook a recipe back home on a
// real-time timer; the finished dish grants a buff. This is a GAME crafting loop
// (stew / zombie-fajita flavor), fully separate from real calorie logging, and
// buffs only ever ADD (wellbeing-safe: nothing here rewards eating less).

import { kvGet, kvSet } from './db.js';

export const INGREDIENTS = {
  marrow:    { id: 'marrow',    name: 'Marrow',        icon: '🦴', iconId: 'ingr-marrow',    tier: 'common' },
  graveroot: { id: 'graveroot', name: 'Graveroot',     icon: '🌿', iconId: 'ingr-graveroot', tier: 'common' },
  ember:     { id: 'ember',     name: 'Ember Pepper',  icon: '🌶️', iconId: 'ingr-ember',     tier: 'common' },
  bog:       { id: 'bog',       name: 'Bog Mushroom',  icon: '🍄', iconId: 'ingr-bog',       tier: 'common' },
  sinew:     { id: 'sinew',     name: 'Sinew',         icon: '🥩', iconId: 'ingr-sinew',     tier: 'common' },
  salt:      { id: 'salt',      name: 'Grave Salt',    icon: '🧂', iconId: 'ingr-salt',      tier: 'common' },
  // RARE: only from RARE map spawns + world-boss dens. Gates the premium feast.
  ectoplasm: { id: 'ectoplasm', name: 'Ectoplasm',     icon: '🫧', iconId: 'ingr-ectoplasm', tier: 'rare' },
};
export const INGREDIENT_IDS = Object.keys(INGREDIENTS);
export const COMMON_INGREDIENT_IDS = INGREDIENT_IDS.filter(id => INGREDIENTS[id].tier === 'common');
export const RARE_INGREDIENT = 'ectoplasm';

// which ingredients each spawn TYPE yields (thematic), so bone caches feel
// different from coin piles. RARE spawns yield the rare ingredient.
export const SPAWN_INGREDIENTS = {
  bones: ['marrow', 'sinew'],
  coins: ['salt', 'ember'],
  crate: ['graveroot', 'bog'],
};
// Deterministic per spawn: same spot always yields the same drop, so the map can
// show it and you can route to the ingredient you need.
export function spawnIngredient(spawn) {
  if (spawn.type === 'rare') return { id: RARE_INGREDIENT, n: 1 };
  const pool = SPAWN_INGREDIENTS[spawn.type] || COMMON_INGREDIENT_IDS;
  const h = [...spawn.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return { id: pool[h % pool.length], n: 1 };
}

// buff kinds:
//   combat -> applies for the next `fights` Pit fights (damagePct / hype / regenPct / petFree)
//   coins  -> +pct coins from world payouts for `hours`
export const RECIPES = [
  { id: 'bone-broth', iconId: 'dish-broth', name: 'Bone Broth', icon: '🍲', needs: { marrow: 2, salt: 1 }, cookMin: 15,
    buff: { kind: 'combat', regenPct: 0.06, fights: 2 }, desc: 'Heals 6% HP each turn, next 2 fights' },
  { id: 'hearty-hash', iconId: 'dish-hash', name: 'Hearty Hash', icon: '🥘', needs: { graveroot: 1, bog: 1, salt: 1 }, cookMin: 30,
    buff: { kind: 'combat', hype: 25, fights: 3 }, desc: 'Start your next 3 fights at +25 Hype' },
  { id: 'marrow-stew', iconId: 'dish-stew', name: 'Marrow Stew', icon: '🍜', needs: { marrow: 2, graveroot: 1 }, cookMin: 45,
    buff: { kind: 'combat', damagePct: 0.10, fights: 3 }, desc: '+10% your damage, next 3 fights' },
  { id: 'hunters-skewer', iconId: 'dish-skewer', name: "Hunter's Skewer", icon: '🍢', needs: { sinew: 2, ember: 1 }, cookMin: 45,
    buff: { kind: 'combat', petFree: true, fights: 2 }, desc: "Pet's special has no cooldown, next 2 fights" },
  { id: 'zombie-fajita', iconId: 'dish-fajita', name: 'Zombie Fajita', icon: '🌯', needs: { ember: 1, sinew: 1, bog: 1 }, cookMin: 120,
    buff: { kind: 'coins', pct: 0.25, hours: 2 }, desc: '+25% coins from the world, 2 hours' },
  { id: 'necro-feast', iconId: 'dish-feast', name: "Necromancer's Feast", icon: '🍖', needs: { ectoplasm: 1, marrow: 2, graveroot: 1 }, cookMin: 180,
    buff: { kind: 'combat', damagePct: 0.15, hype: 20, fights: 3 }, desc: '+15% damage AND +20 Hype start, next 3 fights (needs rare Ectoplasm)' },
  { id: 'bonemeal-kibble', iconId: 'dish-kibble', name: 'Bonemeal Kibble', icon: '🦴', needs: { marrow: 1, sinew: 1, bog: 1 }, cookMin: 60,
    buff: { kind: 'combat', petHpPct: 0.30, petDamagePct: 0.25, fights: 3 }, desc: 'Feeds your pet: +30% pet HP and +25% pet damage, next 3 fights' },
];
export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map(r => [r.id, r]));

/* ---------- ingredient inventory (kv 'ingredients' = {id: count}) ---------- */
export async function ingredients() { return (await kvGet('ingredients', {})) || {}; }
export async function grantIngredient(id, n = 1) {
  if (!INGREDIENTS[id]) return;
  const inv = await ingredients();
  inv[id] = (inv[id] || 0) + n;
  await kvSet('ingredients', inv);
}
export function canCook(recipe, inv) {
  return Object.entries(recipe.needs).every(([id, n]) => (inv[id] || 0) >= n);
}
export function ingredientCount(inv) {
  return Object.values(inv || {}).reduce((a, n) => a + n, 0);
}

/* ---------- the cooking pot (single slot, real-time timer) ---------- */
export async function cookState(now = Date.now()) {
  const c = await kvGet('cooking', null);
  if (!c) return null;
  const r = RECIPE_BY_ID[c.recipeId];
  if (!r) return null;
  return { recipe: r, startedAt: c.startedAt, readyAt: c.readyAt, ready: now >= c.readyAt, remainingMs: Math.max(0, c.readyAt - now) };
}
export async function startCook(recipeId, now = Date.now()) {
  const r = RECIPE_BY_ID[recipeId];
  if (!r) return { ok: false, reason: 'unknown' };
  if (await kvGet('cooking', null)) return { ok: false, reason: 'busy' };
  const inv = await ingredients();
  if (!canCook(r, inv)) return { ok: false, reason: 'ingredients' };
  for (const [id, n] of Object.entries(r.needs)) inv[id] -= n;
  await kvSet('ingredients', inv);
  await kvSet('cooking', { recipeId, startedAt: now, readyAt: now + r.cookMin * 60e3 });
  return { ok: true };
}
export async function collectDish(now = Date.now()) {
  const st = await cookState(now);
  if (!st || !st.ready) return null;
  await kvSet('cooking', null);
  await addFoodBuff(st.recipe, now);
  return st.recipe;
}

/* ---------- active food buffs (kv 'foodbuffs' = []) ---------- */
export async function foodBuffs() { return (await kvGet('foodbuffs', [])) || []; }
async function addFoodBuff(recipe, now = Date.now()) {
  const buffs = await foodBuffs();
  const b = { recipe: recipe.id, name: recipe.name, icon: recipe.icon, ...recipe.buff };
  if (b.kind === 'coins') b.untilMs = now + b.hours * 3600e3;
  if (b.kind === 'combat') b.fightsLeft = b.fights;
  buffs.push(b);
  await kvSet('foodbuffs', buffs);
}
// prune spent/expired buffs; return the live list
export async function activeFoodBuffs(now = Date.now()) {
  const buffs = await foodBuffs();
  const live = buffs.filter(b => b.kind === 'combat' ? (b.fightsLeft > 0) : (b.untilMs > now));
  if (live.length !== buffs.length) await kvSet('foodbuffs', live);
  return live;
}
// coin multiplier from active coin buffs (e.g. 1.25)
export async function foodCoinMult(now = Date.now()) {
  const live = await activeFoodBuffs(now);
  return 1 + live.filter(b => b.kind === 'coins').reduce((a, b) => a + b.pct, 0);
}
// combat bundle to hand to a fight
export async function foodCombatBuff(now = Date.now()) {
  const live = await activeFoodBuffs(now);
  const out = { damagePct: 0, hype: 0, regenPct: 0, petFree: false, petHpPct: 0, petDamagePct: 0 };
  for (const b of live) if (b.kind === 'combat') {
    out.damagePct += b.damagePct || 0;
    out.hype += b.hype || 0;
    out.regenPct = Math.max(out.regenPct, b.regenPct || 0);
    out.petFree = out.petFree || !!b.petFree;
    out.petHpPct += b.petHpPct || 0;
    out.petDamagePct += b.petDamagePct || 0;
  }
  return out;
}
// after a fight ends: spend one charge off each active combat buff
export async function consumeFightFoodBuffs(now = Date.now()) {
  const buffs = await foodBuffs();
  let changed = false;
  for (const b of buffs) if (b.kind === 'combat' && b.fightsLeft > 0) { b.fightsLeft -= 1; changed = true; }
  const live = buffs.filter(b => b.kind === 'combat' ? b.fightsLeft > 0 : b.untilMs > now);
  if (changed || live.length !== buffs.length) await kvSet('foodbuffs', live);
}

export function fmtCookTime(ms) {
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
