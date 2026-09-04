// Food-ingredient collectibles + timed home cooking -> food buffs.
// You scavenge ingredients on the map (spawns), then cook a recipe back home on a
// real-time timer; the finished dish grants a buff. This is a GAME crafting loop
// (stew / zombie-fajita flavor), fully separate from real calorie logging, and
// buffs only ever ADD (wellbeing-safe: nothing here rewards eating less).

import { kvGet, kvSet, kvUpdate, claimDay } from './db.js';
import { dateKey } from './nutrition.js';

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
  // herbs is the food spawn and draws from DEMAND_POOL instead (see below)
};

/* HOW MUCH FOOD A SPAWN TYPE CARRIES. 2026-08-18, with the 2.5x density bump in
   hunt.js. Tom: "splitting up the amount of food items and gold would help us
   curb that and make the boneyard seem more full."
   Food used to be on EVERY spawn, so tripling the field would have tripled the
   pantry. It is split instead: the Herb patch is THE food spawn and always
   carries two, everything else carries one about a fifth of the time. Net effect
   measured, not guessed: ingredients per day 1.46x, which is what the Kitchen
   needs once the Bone Garden stops feeding it. A value below 1 is a chance; 1 or
   more is a guaranteed count. */
export const SPAWN_FOOD = { herbs: 2, rare: 1, bones: 0.2, coins: 0.2, crate: 0.2 };
// local copies, same as hunt.js/poi.js/spires.js: cooking.js is imported BY
// loot.js, so importing poi.js here would close an import cycle.
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Deterministic per spawn: the same spot always yields the same drop, so the map
   can show it and you can route to the ingredient you need. That property is
   deliberate and is kept.
   Tom, 2026-08-08: "all coins and stuff end up giving the same food ingredients."
   Two faults, and the pools were the bigger one. Each spawn TYPE mapped to a pool
   of exactly TWO ingredients, so a coin pile could only ever be Grave Salt or
   Ember Pepper no matter how many you collected: four of the six commons were
   unreachable from that spawn type. On top of that the picker was
   `sum-of-char-codes % 2`, and neighbouring spawn ids differ by one character, so
   the sum walked in step with the id and the choice alternated in a visible
   pattern rather than looking random.
   Now: a real hash, and the themed pool is a BIAS rather than a cage. A bone pile
   still usually gives marrow or sinew, but any common can turn up, so walking a
   route actually stocks a varied pantry. */
export const THEME_ODDS = 0.7;   // chance the drop comes from the spawn type's own pool
export function spawnIngredient(spawn) {
  if (spawn.type === 'rare') return { id: RARE_INGREDIENT, n: 1 };
  const rng = mulberry32(hashStr(`ingr:${spawn.id}`));
  // how many, then which. `n` can be 0: most spawns no longer carry food.
  const food = SPAWN_FOOD[spawn.type] ?? 1;
  const n = food >= 1 ? food : (rng() < food ? 1 : 0);
  // an id is returned even when n is 0, because the garden's seed roll still
  // rides on this spawn and needs to know what kind of seed the spot grows.
  const themed = spawn.type === 'herbs' ? DEMAND_POOL : SPAWN_INGREDIENTS[spawn.type];
  const pool = (themed && rng() < THEME_ODDS) ? themed : COMMON_INGREDIENT_IDS;
  return { id: pool[Math.floor(rng() * pool.length)], n };
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
  /* RE-COSTED 2026-08-08. The Feast was the ONLY sink for Ectoplasm and it lost to
     not using it. Measured against the alternative: Marrow Stew + Hearty Hash costs
     6 commons and 75 minutes and stacks to +10% damage AND +25 hype for 3 fights,
     while the Feast cost 9 commons-equivalent (6 through the transmute, plus 3 in
     the recipe), a 20-hour transmute cooldown and a 3-hour cook, to deliver +15%
     damage and FIVE LESS hype. It was strictly dominated, so the correct play was
     always to ignore it, which is why the rare ingredient piled up.
     It now clearly beats stacking two commons dishes, which is what a recipe
     gated behind the rarest ingredient in the game has to do. */
  { id: 'necro-feast', iconId: 'dish-feast', name: "Necromancer's Feast", icon: '🍖', needs: { ectoplasm: 1, marrow: 2, graveroot: 1 }, cookMin: 120,
    buff: { kind: 'combat', damagePct: 0.25, hype: 35, fights: 4 }, desc: '+25% damage AND +35 Hype start, next 4 fights (needs rare Ectoplasm)' },
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
  /* ECTOPLASM GETS A PURPOSE (2026-08-08).
     Tom: "make ectoplasm required for potions since theyre the most powerful in
     the game im guessing?" Two corrections went into this shape. Potions were NOT
     the strongest thing in the game (the dishes were), and gating EVERY potion on
     Ectoplasm would have deleted potions: supply is 1-2 per landmark boss, the odd
     rare spawn, and one per 20h from transmuting, against four recipes people brew
     freely today. So the four commons potions stay exactly as they were, and these
     two are added ABOVE them. Now Ectoplasm buys the best thing you can drink,
     which is the "I have been saving this" feeling it never had, instead of being
     a rare material with one mediocre sink.
     Both reuse the existing effect keys (heal / shield / dmgPct+turns / stamina),
     so drinkPotion needs no new combat code. */
  { id: 'revenant-draught', name: "Revenant's Draught", icon: '🫗', potion: true, rare: true, needs: { ectoplasm: 1, marrow: 2 }, cookMin: 60,
    effect: { heal: 0.60, shield: 50 }, desc: 'Drink in a fight: restore 60% HP AND a 50-point shield. Needs Ectoplasm.' },
  { id: 'spectral-fury', name: 'Spectral Fury', icon: '🧫', potion: true, rare: true, needs: { ectoplasm: 1, ember: 2 }, cookMin: 60,
    effect: { dmgPct: 0.50, turns: 4, stamina: true }, desc: 'Drink in a fight: +50% damage for 4 turns and refill Stamina. Needs Ectoplasm.' },
];
export const POTION_BY_ID = Object.fromEntries(POTIONS.map(p => [p.id, p]));

/* WHAT THE COOKBOOK ACTUALLY WANTS, derived from the recipes rather than listed.
   The Herb patch draws from this, so the food spawn hands you the thing three
   recipes are waiting on instead of a sixth Ember Pepper you have no use for.
   Rare-gated entries are skipped: you cannot cook them without Ectoplasm, so
   their commons are not demand a walking player can act on. Adding a recipe
   re-weights the map by itself; nothing here has to be edited to keep up. */
export const INGREDIENT_DEMAND = [...RECIPES, ...POTIONS].reduce((acc, r) => {
  if (Object.keys(r.needs).some(id => INGREDIENTS[id].tier !== 'common')) return acc;
  for (const [id, n] of Object.entries(r.needs)) acc[id] = (acc[id] || 0) + n;
  return acc;
}, {});
// one entry per unit demanded, so the uniform pick in spawnIngredient is weighted
const DEMAND_POOL = Object.entries(INGREDIENT_DEMAND).flatMap(([id, n]) => Array(n).fill(id));

// dishes + potions are both cooked in the pot; recipes list is the union.
export const RECIPE_BY_ID = Object.fromEntries([...RECIPES, ...POTIONS].map(r => [r.id, r]));

/* ---------- brewed potion inventory (kv 'potions' = {id: count}) ---------- */
export async function potionsInv() { return (await kvGet('potions', {})) || {}; }
export async function grantPotion(id, n = 1) {
  if (!POTION_BY_ID[id]) return;
  /* QA round 26 O4: two Serve taps in one frame emptied both pots and banked ONE
     potion (6/6). This was the last read-modify-write granter in the file; one
     transaction, same as grantIngredient below. */
  await kvUpdate('potions', inv => ({ ...(inv || {}), [id]: ((inv && inv[id]) || 0) + n }), {});
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
  // one transaction: read-then-write lost grants when two landed at once
  await kvUpdate('ingredients', inv => ({ ...(inv || {}), [id]: ((inv && inv[id]) || 0) + n }), {});
}
export function canCook(recipe, inv) {
  return Object.entries(recipe.needs).every(([id, n]) => (inv[id] || 0) >= n);
}
export function ingredientCount(inv) {
  return Object.values(inv || {}).reduce((a, n) => a + n, 0);
}

/* ---------- the cooking pots (v143: multiple slots, real-time timers) ----------
 * `cooking` kv is now an ARRAY of pot slots (null = empty). `potsOwned` (default 1)
 * caps how many you can run at once - buy the 2nd/3rd pot for coins. Reads migrate
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
/* Pure so it can run INSIDE a kvUpdate transaction, where nothing may await. */
function slotsFrom(raw, n) {
  let arr;
  if (Array.isArray(raw)) arr = raw.slice();
  else if (raw && raw.recipeId) arr = [raw]; // migrate the legacy single-pot object
  else arr = [];
  while (arr.length < n) arr.push(null);
  if (arr.length > n) arr.length = n; // never expose more slots than pots owned
  return arr;
}
async function readSlots() { return slotsFrom(await kvGet('cooking', null), await potsOwned()); }

/* ---------- the cook queue ----------
 * A visit could only ever START as many cooks as you own pots, and the measured
 * median player opens the app once a day. tests/garden-sim.mjs put numbers on
 * what that costs: the garden grows 7.1 ingredients a day and the kitchen eats
 * 1.5 to 2.4 of them, and no edit to a recipe moves that, because the ceiling is
 * cook starts per visit and not what a dish costs. Of everything measured, a
 * queue is the ONLY change that raised ingredient spend (2.4 to 3.9 a day) while
 * ALSO raising the share of fights the player got to take with a buff up (64% to
 * 67%). Every other lever bought spend by taking the buff away.
 *
 * Nothing about a dish changes here: same ingredients, same cook time, same buff,
 * same duration. This is throughput, not potency. There is no purchasable slot
 * and no gate: the depth is flat and free for everybody.
 *
 * Ingredients are spent when you QUEUE, so a queued cook is already paid for and
 * advancing it can never charge anybody twice. */
export const QUEUE_MAX = 2;
async function readQueue() { const q = await kvGet('cookq', []); return Array.isArray(q) ? q : []; }

/* Pay for a cook in ONE transaction, or refuse inside it. Every caller used to
   read the larder, await something, then write the whole inventory back, which
   lost whatever a harvest or a map spawn had granted in between. Returns true
   when the ingredients were really taken. */
async function payIngredients(recipe) {
  return !!(await kvUpdate('ingredients', inv => {
    const cur = { ...(inv || {}) };
    if (!canCook(recipe, cur)) return undefined;   // short inside the transaction: nothing owed, nothing written
    for (const [id, n] of Object.entries(recipe.needs)) cur[id] -= n;
    return cur;
  }, {}));
}
// hand back what payIngredients took, when the pot or the queue turned it away
async function refundIngredients(recipe) {
  for (const [id, n] of Object.entries(recipe.needs)) await grantIngredient(id, n);
}

export async function queueCook(recipeId) {
  const r = RECIPE_BY_ID[recipeId];
  if (!r) return { ok: false, reason: 'unknown' };
  if ((await readQueue()).length >= QUEUE_MAX) return { ok: false, reason: 'full' };  // cheap refusal, the real one is below
  if (!(await payIngredients(r))) return { ok: false, reason: 'ingredients' };
  /* PUSHING ONTO THE QUEUE IS ONE TRANSACTION, because advanceQueue TAKES from
     this row. `q` was read before the ingredient spend, so writing it whole put
     back an entry advanceQueue had already moved into a pot, and the same
     paid-for cook ran a second time for free. */
  const next = await kvUpdate('cookq', cur => {
    const a = Array.isArray(cur) ? cur : [];
    return a.length >= QUEUE_MAX ? undefined : [...a, { recipeId }];
  }, []);
  if (!next) { await refundIngredients(r); return { ok: false, reason: 'full' }; }
  return { ok: true, queued: next.length };
}

/* Move the queue along, on the CLOCK. A pot that finished while the app was shut
 * hands its dish over AT THE MOMENT IT FINISHED, and the next cook starts there
 * rather than whenever the player happened to look, so a queue lined up on Monday
 * has really drained by Tuesday instead of waiting for a tap it never got.
 * Returns the dishes it collected on the player's behalf so the caller can pay
 * the same XP a manual Serve pays. It has exactly ONE caller for that reason.
 *
 * EMPTYING THE POT IS THE CLAIM HERE TOO, same as collectDish below. Reading the
 * slots, awaiting the grant and writing the slots back used to be three separate
 * transactions, so two overlapping ticks both found the same finished cook and
 * both banked it: measured 2026-09-01 on origin/main 3d4b208c, one cook paid TWO
 * Pantry dishes from one ingredient set in a single context, and a true two-tab
 * race double-banked 10 of 12 attempts. Overlapping ticks are the ordinary case
 * rather than a contrivance: the Kitchen re-renders on a 1000ms setInterval that
 * calls an async render() without awaiting it, and render() opens with this.
 *
 * The queue is a SECOND kv row, so it cannot ride in the pot transaction. It is
 * TAKEN first instead (kvUpdate on 'cookq': the read and the shift are one
 * transaction, so no entry can be carried into two pots), and whatever the pots
 * turn out not to have room for goes back at the front. Both halves are needed:
 * claiming the pot alone still let two ticks start one paid-for queue entry in
 * two different pots, which is the same free dish by another door. */
export async function advanceQueue(now = Date.now()) {
  const arr0 = await readSlots();
  /* Cheap pre-check, and it is what keeps the take below off the common path:
     with every pot busy and none finished there is nothing to advance, which is
     what almost every one of those per-second ticks looks like. */
  const room = arr0.filter(c => !c || c.readyAt <= now).length;
  if (!room) return [];
  const pots = arr0.length;
  let mine = [];
  await kvUpdate('cookq', cur => {
    const a = Array.isArray(cur) ? cur : [];
    if (!a.length) return undefined;
    mine = a.slice(0, room);
    return a.slice(mine.length);
  }, []);
  if (!mine.length) return [];
  const banked = [];
  await kvUpdate('cooking', raw => {
    const arr = slotsFrom(raw, pots);
    while (mine.length) {
      let idx = arr.findIndex(c => !c);
      let at = now;
      if (idx < 0) {
        // the pot that came free EARLIEST, so the line runs in the order it was laid
        const done = arr.map((c, i) => ({ i, t: c.readyAt })).filter(x => x.t <= now).sort((a, b) => a.t - b.t)[0];
        if (!done) break;
        idx = done.i; at = done.t;
        const prev = RECIPE_BY_ID[arr[idx].recipeId];
        arr[idx] = null;
        // granted AFTER the transaction, so only a pot THIS call emptied pays
        if (prev) banked.push({ recipe: prev, at });
      }
      const r = RECIPE_BY_ID[mine.shift().recipeId];
      arr[idx] = r ? { recipeId: r.id, startedAt: at, readyAt: at + r.cookMin * 60e3 } : null;
    }
    return arr;
  }, null);
  /* Anything the pots could not take after all goes back at the FRONT. It was
     paid for in ingredients at queueCook and must never be dropped. */
  if (mine.length) await kvUpdate('cookq', cur => [...mine, ...(Array.isArray(cur) ? cur : [])], []);
  for (const { recipe, at } of banked) {
    if (recipe.potion) await grantPotion(recipe.id); else await addToPantry(recipe, at);
  }
  return banked.map(b => b.recipe);
}

export async function cookState(now = Date.now()) {
  const arr = await readSlots();
  const queue = (await readQueue()).map(x => RECIPE_BY_ID[x.recipeId]).filter(Boolean);
  const slots = arr.map((c, index) => {
    const r = c && RECIPE_BY_ID[c.recipeId];
    if (!r) return { index, empty: true };
    return { index, empty: false, recipe: r, startedAt: c.startedAt, readyAt: c.readyAt, ready: now >= c.readyAt, remainingMs: Math.max(0, c.readyAt - now) };
  });
  const readySlots = slots.filter(s => !s.empty && s.ready);
  return {
    potsOwned: arr.length, slots,
    queue, queueLeft: Math.max(0, QUEUE_MAX - queue.length),
    freeCount: slots.filter(s => s.empty).length,
    readyCount: readySlots.length,
    anyCooking: slots.some(s => !s.empty && !s.ready),
    // back-compat for the home card / badges (any pot ready + its recipe)
    ready: readySlots.length > 0,
    recipe: readySlots[0] ? readySlots[0].recipe : null,
  };
}
/* TAKING THE POT IS A CLAIM TOO, the same claim collectDish and advanceQueue
   make on this row. `arr` used to be read here, carried across the ingredient
   spend (two whole transactions) and written back whole, which put a finished
   dish back in a pot one of those two had just emptied and banked it twice.
   Ingredients first, pot second, and the pot hands them back if it turned out
   to have no room: that is the same take-first ordering harvestPlot documents,
   and a refused start must never cost the player a cook. */
export async function startCook(recipeId, now = Date.now()) {
  const r = RECIPE_BY_ID[recipeId];
  if (!r) return { ok: false, reason: 'unknown' };
  const arr = await readSlots();
  if (!arr.some(c => !c)) return { ok: false, reason: 'busy' }; // every pot occupied
  const pots = arr.length;
  if (!(await payIngredients(r))) return { ok: false, reason: 'ingredients' };
  let free = -1;
  await kvUpdate('cooking', raw => {
    const slots = slotsFrom(raw, pots);
    free = slots.findIndex(c => !c);
    if (free < 0) return undefined;
    slots[free] = { recipeId, startedAt: now, readyAt: now + r.cookMin * 60e3 };
    return slots;
  }, null);
  if (free < 0) { await refundIngredients(r); return { ok: false, reason: 'busy' }; }
  return { ok: true, slot: free };
}
/* EMPTYING THE POT IS THE CLAIM. Reading the slot and nulling it used to be two
   transactions, so two overlapping serves of one pot both found a finished dish
   and both banked it: measured 2026-08-17, two concurrent collectDish(0) both
   returned the recipe, and only a lost update inside addToPantry stopped the
   Pantry gaining two. The read and the null are one transaction now. */
export async function collectDish(slotIndex = null, now = Date.now()) {
  const pots = await potsOwned();
  let r = null;
  await kvUpdate('cooking', (raw) => {
    const arr = slotsFrom(raw, pots);
    let idx = slotIndex;
    if (idx == null) idx = arr.findIndex(c => c && now >= c.readyAt); // first ready
    if (idx < 0 || !arr[idx]) return undefined;
    const rec = RECIPE_BY_ID[arr[idx].recipeId];
    if (!rec || now < arr[idx].readyAt) return undefined;
    r = rec;
    arr[idx] = null;
    return arr;
  }, null);
  if (!r) return null;
  if (r.potion) await grantPotion(r.id); // potions go to your satchel, drunk mid-fight
  else await addToPantry(r, now);         // dishes stockpile in the Pantry; activated on demand
  return r;
}

/* ---------- Pantry (v152): cooked dishes stockpile until you choose to use one ----------
 * Old behavior force-activated a dish the moment you collected it. Now collecting
 * banks it in the Pantry (kv 'pantry' = [{recipeId,name,icon,iconId,cookedAt}]);
 * activatePantryDish() is what turns it into a live buff, so you can save a dish
 * for the fight/day you actually want it. Additive + data-safe: existing active
 * buffs (kv 'foodbuffs') are untouched; potions still go straight to the satchel. */
export async function pantryDishes() { return (await kvGet('pantry', [])) || []; }
async function addToPantry(recipe, now = Date.now()) {
  // one transaction, same reason as grantIngredient
  await kvUpdate('pantry', list => [...(list || []),
    { recipeId: recipe.id, name: recipe.name, icon: recipe.icon, iconId: recipe.iconId, cookedAt: now }], []);
}
/* TAKING THE DISH OUT OF THE PANTRY IS THE CLAIM, the same shape collectDish
   uses one row over. Reading the list, splicing it and writing it whole dropped
   any dish addToPantry banked in between, and addToPantry runs off a 1000ms
   Kitchen tick, so a cooked dish could simply vanish on a Serve. */
async function takePantryDish(index) {
  let item = null;
  await kvUpdate('pantry', list => {
    const p = list || [];
    if (index < 0 || !p[index]) return undefined;
    item = p[index];
    return p.filter((_, i) => i !== index);
  }, []);
  return item;
}
export async function activatePantryDish(index, now = Date.now()) {
  const item = await takePantryDish(index);
  if (!item) return null;
  const r = RECIPE_BY_ID[item.recipeId];
  if (!r) return null;   // stale entry: the take above is what drops it
  await addFoodBuff(r, now);
  return r;
}
export async function discardPantryDish(index) {
  return !!(await takePantryDish(index));
}

/* ---------- daily transmute: merge surplus commons -> 1 rare Ectoplasm ----------
 * Tom's WoW-transmute idea + the "turn basics into the building block of others"
 * note, unified: Ectoplasm gates the premium feast and otherwise only drops from
 * RARE spawns / world bosses, so this gives a reliable, walk-fed path to it. Costs
 * COMMONS commons (pulled greedily from your most-abundant), on a ~daily cooldown. */
export const TRANSMUTE = { commons: 6, yields: RARE_INGREDIENT, cooldownMs: 20 * 3600e3 };
// pure: WHICH commons a transmute takes, in take order, greedily from the
// most-abundant first. The Kitchen's slot strip draws exactly this list, and
// transmuteConsume spends exactly this list, so the sockets a player sees and
// the ingredients that vanish cannot disagree (Tom picked option B on
// 2026-08-29: "These six go in. One Ectoplasm comes out.").
export function transmutePicks(inv, n) {
  const have = { ...(inv || {}) };
  const picks = [];
  const order = COMMON_INGREDIENT_IDS.slice().sort((a, b) => (have[b] || 0) - (have[a] || 0));
  for (const id of order) { while (picks.length < n && (have[id] || 0) > 0) { have[id]--; picks.push(id); } }
  return picks;
}
// pure: greedily remove `n` commons from the most-abundant first (for the consume + tests).
// Derived from transmutePicks so the preview and the spend share one order.
export function transmuteConsume(inv, n) {
  const out = { ...(inv || {}) };
  const picks = transmutePicks(out, n);
  for (const id of picks) { out[id]--; if (!out[id]) delete out[id]; }
  return { inv: out, taken: picks.length };
}
/* QA round 26 O3 (backward): a stamp in the FUTURE means the clock went back
   since the last transmute. Read it as "just now", so the lockout is at most one
   cooldown instead of growing one-for-one with the jump (measured 8780h at minus
   365 days, surviving reload and riding along in exportAll). Shared by the status
   and the claim below so the two cannot disagree. */
function lastTransmute(raw, now) { return Math.min(Number(raw) || 0, now); }
export async function transmuteStatus(now = Date.now()) {
  const last = lastTransmute(await kvGet('transmuteAt', 0), now);
  const msLeft = Math.max(0, last + TRANSMUTE.cooldownMs - now);
  const inv = await ingredients();
  const commonsHave = COMMON_INGREDIENT_IDS.reduce((a, id) => a + (inv[id] || 0), 0);
  return { ready: msLeft <= 0, msLeft, commonsHave, need: TRANSMUTE.commons, canAfford: commonsHave >= TRANSMUTE.commons, yields: TRANSMUTE.yields };
}
export async function doTransmute(now = Date.now()) {
  const st = await transmuteStatus(now);
  if (!st.ready) return { ok: false, reason: 'cooldown', msLeft: st.msLeft };
  if (!st.canAfford) return { ok: false, reason: 'ingredients', need: TRANSMUTE.commons, have: st.commonsHave };
  /* QA round 26 O3 (forward): with the cooldown as the only gate, a clock set
     ahead paid ten Ectoplasm in forty seconds, because the gate reads the clock
     being moved. Ask the day guard, like every other day-keyed reward (wheel,
     quests, dens): a day past the witness ceiling, or behind the high-water
     mark, is refused until real time catches up. AFTER the cheap refusals, so a
     cooldown or an empty larder never opens a day as a side effect. */
  if (!(await claimDay(dateKey(new Date(now)))).fresh) return { ok: false, reason: 'day' };
  /* QA round 26 O2: the check above and the stamp were two transactions with the
     spend and the grant awaited between them, so two overlapping taps both read
     "ready" and both paid (8/8 on one page, 4/5 across two tabs). THE STAMP IS
     THE CLAIM: one kvUpdate on 'transmuteAt' that re-reads the cooldown and
     refuses INSIDE its own transaction, so the loser is turned away before
     anything moves. `prev` is kept so a failed take below can hand the day back. */
  let prev = 0;
  const stamped = await kvUpdate('transmuteAt', raw => {
    prev = Number(raw) || 0;
    return lastTransmute(raw, now) + TRANSMUTE.cooldownMs > now ? undefined : now;
  }, 0);
  if (stamped === undefined) return { ok: false, reason: 'cooldown', msLeft: TRANSMUTE.cooldownMs };
  /* Spend AND grant in ONE transaction on the larder: transmuteConsume is pure
     precisely so it can run inside one, and reading the larder then writing it
     whole dropped anything granted in between. The Ectoplasm rides in the same
     write as the six commons it cost, so there is no state where one exists
     without the other. */
  const paid = await kvUpdate('ingredients', raw => {
    const res = transmuteConsume(raw || {}, TRANSMUTE.commons);
    if (res.taken < TRANSMUTE.commons) return undefined;
    res.inv[TRANSMUTE.yields] = (res.inv[TRANSMUTE.yields] || 0) + 1;
    return res.inv;
  }, {});
  if (!paid) {
    // the larder was drained between the affordability check and the take (a
    // cook queued in another tab): give the day back, nothing was spent
    await kvUpdate('transmuteAt', cur => (cur === now ? prev : undefined), 0);
    return { ok: false, reason: 'ingredients', need: TRANSMUTE.commons, have: st.commonsHave };
  }
  return { ok: true, yields: TRANSMUTE.yields };
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

/* One line under a dish, for a LIVE buff (kv 'foodbuffs', carries untilMs or
   fightsLeft) or a dish still sitting in the Pantry (the recipe's bare `buff`).
   QA round 26 O17: the Pantry handed a coins dish here with no `untilMs`, so
   `untilMs - Date.now()` was NaN and every coins dish read "NaNh NaNm left". A
   dish in the Pantry has a DURATION (`hours`), not a deadline: the clock only
   starts when it is eaten, so it says how long it will run. The recipe data was
   right; the formatter assumed every coins buff was already ticking. Lives here
   rather than in app.js so a node test can format every recipe. */
export function foodBuffLabel(b, now = Date.now()) {
  if (b.kind === 'coins') {
    const pct = `+${Math.round(b.pct * 100)}% coins`;
    return b.untilMs == null ? `${pct} for ${fmtCookTime(b.hours * 3600e3)}` : `${pct} · ${fmtCookTime(Math.max(0, b.untilMs - now))} left`;
  }
  const bits = [];
  if (b.damagePct) bits.push(`+${Math.round(b.damagePct * 100)}% dmg`);
  if (b.hype) bits.push(`+${b.hype} Hype start`);
  if (b.regenPct) bits.push(`heal ${Math.round(b.regenPct * 100)}%/turn`);
  if (b.petFree) bits.push('pet special free');
  return `${bits.join(' · ')} · ${b.fightsLeft} fight${b.fightsLeft === 1 ? '' : 's'} left`;
}

export function fmtCookTime(ms) {
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
