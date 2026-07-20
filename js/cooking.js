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

// POTIONS: the kitchen also brews potions ANY class can carry and DRINK mid-fight
// (a one-tap "beaming potion" in the Pit). These are stored ITEMS (kv 'potions'),
// not passive dish buffs, and are separate from the Alchemist's own Toxicity kit.
export const POTIONS = [
  { id: 'vital-tonic',  name: 'Vital Tonic',      icon: '🧪', potion: true, needs: { graveroot: 1, bog: 1 },   cookMin: 20, effect: { heal: 0.30 }, desc: 'Drink in a fight: instantly restore 30% HP.' },
  { id: 'fury-flask',   name: 'Fury Flask',       icon: '⚗️', potion: true, needs: { ember: 2, sinew: 1 },     cookMin: 30, effect: { dmgPct: 0.25, turns: 3 }, desc: 'Drink in a fight: +25% damage for 3 turns.' },
  { id: 'stoneskin',    name: 'Stoneskin Draught', icon: '🧴', potion: true, needs: { marrow: 1, salt: 1 },     cookMin: 25, effect: { shield: 35 }, desc: 'Drink in a fight: a 35-point shield.' },
  { id: 'second-wind',  name: 'Second-Wind Brew', icon: '🍵', potion: true, needs: { graveroot: 1, ember: 1 }, cookMin: 25, effect: { stamina: true, heal: 0.10 }, desc: 'Drink in a fight: refill Stamina + 10% HP.' },
];
export const POTION_BY_ID = Object.fromEntries(POTIONS.map(p => [p.id, p]));

// dishes + potions are both cooked in the pot; recipes list is the union.
export const RECIPE_BY_ID = Object.fromEntries([...RECIPES, ...POTIONS].map(r => [r.id, r]));

/* ---------- brewed potion inventory (kv 'potions' = {id: count}) ---------- */
export async function potionsInv() { return (await kvGet('potions', {})) || {}; }
export async function grantPotion(id, n = 1) {
  if (!POTION_BY_ID[id]) return;
  const inv = await potionsInv(); inv[id] = (inv[id] || 0) + n; await kvSet('potions', inv);
}
export async function usePotion(id) {
  const inv = await potionsInv();
  if (!(inv[id] > 0)) return false;
  inv[id] -= 1; if (inv[id] <= 0) delete inv[id];
  await kvSet('potions', inv);
  return true;
}
export function potionCount(inv) { return Object.values(inv || {}).reduce((a, n) => a + n, 0); }

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

/* ---------- the cooking pots (v143: multiple slots, real-time timers) ----------
 * `cooking` kv is now an ARRAY of pot slots (null = empty). `potsOwned` (default 1)
 * caps how many you can run at once — buy the 2nd/3rd pot for coins. Reads migrate
 * the legacy single {recipeId,...} object into a one-element array automatically. */
export const MAX_POTS = 3;
export const POT_PRICES = [1000, 3000]; // coins for the 2nd pot, then the 3rd
export async function potsOwned() { return Math.min(MAX_POTS, Math.max(1, (await kvGet('potsOwned', 1)) || 1)); }
export function nextPotPrice(owned) { return owned >= MAX_POTS ? null : POT_PRICES[owned - 1]; }
export async function addPot() { // caller charges coins; this just grows the count
  const owned = await potsOwned();
  if (owned >= MAX_POTS) return owned;
  await kvSet('potsOwned', owned + 1);
  return owned + 1;
}
async function readSlots() {
  const raw = await kvGet('cooking', null);
  const n = await potsOwned();
  let arr;
  if (Array.isArray(raw)) arr = raw.slice();
  else if (raw && raw.recipeId) arr = [raw]; // migrate the legacy single-pot object
  else arr = [];
  while (arr.length < n) arr.push(null);
  if (arr.length > n) arr.length = n; // never expose more slots than pots owned
  return arr;
}
async function writeSlots(arr) { await kvSet('cooking', arr); }

export async function cookState(now = Date.now()) {
  const arr = await readSlots();
  const slots = arr.map((c, index) => {
    const r = c && RECIPE_BY_ID[c.recipeId];
    if (!r) return { index, empty: true };
    return { index, empty: false, recipe: r, startedAt: c.startedAt, readyAt: c.readyAt, ready: now >= c.readyAt, remainingMs: Math.max(0, c.readyAt - now) };
  });
  const readySlots = slots.filter(s => !s.empty && s.ready);
  return {
    potsOwned: arr.length, slots,
    freeCount: slots.filter(s => s.empty).length,
    readyCount: readySlots.length,
    anyCooking: slots.some(s => !s.empty && !s.ready),
    // back-compat for the home card / badges (any pot ready + its recipe)
    ready: readySlots.length > 0,
    recipe: readySlots[0] ? readySlots[0].recipe : null,
  };
}
export async function startCook(recipeId, now = Date.now()) {
  const r = RECIPE_BY_ID[recipeId];
  if (!r) return { ok: false, reason: 'unknown' };
  const arr = await readSlots();
  const free = arr.findIndex(c => !c);
  if (free < 0) return { ok: false, reason: 'busy' }; // every pot occupied
  const inv = await ingredients();
  if (!canCook(r, inv)) return { ok: false, reason: 'ingredients' };
  for (const [id, n] of Object.entries(r.needs)) inv[id] -= n;
  await kvSet('ingredients', inv);
  arr[free] = { recipeId, startedAt: now, readyAt: now + r.cookMin * 60e3 };
  await writeSlots(arr);
  return { ok: true, slot: free };
}
export async function collectDish(slotIndex = null, now = Date.now()) {
  const arr = await readSlots();
  let idx = slotIndex;
  if (idx == null) idx = arr.findIndex(c => c && now >= c.readyAt); // first ready
  if (idx < 0 || !arr[idx]) return null;
  const r = RECIPE_BY_ID[arr[idx].recipeId];
  if (!r || now < arr[idx].readyAt) return null;
  arr[idx] = null; await writeSlots(arr);
  if (r.potion) await grantPotion(r.id); // potions go to your satchel, drunk mid-fight
  else await addFoodBuff(r, now);         // dishes apply as passive buffs
  return r;
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
