// Food-ingredient collectibles + timed home cooking -> food buffs.
// You scavenge ingredients on the map (spawns), then cook a recipe back home on a
// real-time timer; the finished dish grants a buff. This is a GAME crafting loop
// (stew / zombie-fajita flavor), fully separate from real calorie logging, and
// buffs only ever ADD (wellbeing-safe: nothing here rewards eating less).

import { kvGet, kvSet, kvUpdate, kvUpdateMulti, payAtomic, claimDay } from './db.js';
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
    buff: { kind: 'combat', petFree: true, fights: 2 }, desc: "Pet's special recovers one turn sooner, next 2 fights" },
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
  await kvUpdateMulti({
    potions: inv => ({ ...(inv || {}), [id]: ((inv && inv[id]) || 0) + n }),
    potionsRev: rev => ({ ...(rev || {}), [id]: (rev?.[id] || 0) + Math.max(1, Math.abs(n)) }),
  });
}
/* THE SIP HAS TO BE THE CLAIM TOO (2026-09-04, claimed-row-audit): reading the
   satchel, decrementing in memory and writing the whole map back raced
   grantPotion's own kvUpdate above it, the same shape O4 fixed on the granter
   two lines up. A dish that finished cooking while a fight was open could bank
   its potion via grantPotion between this read and this write, and the whole
   map this call then wrote back had no idea that potion existed. */
export async function usePotion(id) {
  let taken = false;
  // The sip and its revision are one transaction, including the last potion.
  const drunk = await kvUpdateMulti({ potions: cur => {
    const next = { ...(cur || {}) };
    if (!(next[id] > 0)) return undefined;
    next[id] -= 1; if (next[id] <= 0) delete next[id];
    taken = true;
    return next;
  }, potionsRev: rev => taken ? { ...(rev || {}), [id]: (rev?.[id] || 0) + 1 } : undefined });
  return !!drunk.potions;
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
// The displayed ownership is the purchase target. A stale confirmation cannot
// charge for a different (more expensive) pot. Balance, revision and ownership
// are decided from one live snapshot and commit together.
export async function addPot(expectedOwned) {
  return payAtomic({ snapshot: { keys: ['potsOwned', 'coins', 'coinsRev'] }, decide: state => {
    const owned = Math.min(MAX_POTS, Math.max(1, state.potsOwned || 1));
    const price = nextPotPrice(owned);
    if (price == null) return { result: { ok: false, reason: 'full' } };
    if (expectedOwned != null && expectedOwned !== owned) return { result: { ok: false, reason: 'stale' } };
    const balance = Number(state.coins) || 0;
    if (balance < price) return { result: { ok: false, reason: 'coins' } };
    return { result: { ok: true, owned: owned + 1 }, kv: {
      coins: () => balance - price,
      coinsRev: () => (Number(state.coinsRev) || 0) + price,
      potsOwned: () => owned + 1,
    } };
  } });
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

// Used only after affordability is decided inside the job's transaction.
function spentIngredients(recipe, inv) {
  const next = { ...(inv || {}) };
  for (const [id, n] of Object.entries(recipe.needs)) next[id] -= n;
  return next;
}

export async function queueCook(recipeId) {
  const r = RECIPE_BY_ID[recipeId];
  if (!r) return { ok: false, reason: 'unknown' };
  return payAtomic({ snapshot: { keys: ['ingredients', 'cookq'] }, decide: state => {
    const q = Array.isArray(state.cookq) ? state.cookq : [];
    if (q.length >= QUEUE_MAX) return { result: { ok: false, reason: 'full' } };
    if (!canCook(r, state.ingredients || {})) return { result: { ok: false, reason: 'ingredients' } };
    return { result: { ok: true, queued: q.length + 1 }, kv: {
      ingredients: () => spentIngredients(r, state.ingredients),
      cookq: () => [...q, { recipeId }],
    } };
  } });
}

// Delivery updaters join the SAME transaction that clears/replaces the pot.
// Potion revisions must ride along too, including a failed delivery.
function deliveryUpdates(banked) {
  const dishes = banked.filter(b => !b.recipe.potion);
  const potions = banked.filter(b => b.recipe.potion);
  return {
    ...(dishes.length ? { pantry: list => [...(list || []), ...dishes.map(({ recipe, at }) => ({
      recipeId: recipe.id, name: recipe.name, icon: recipe.icon, iconId: recipe.iconId, cookedAt: at,
    }))] } : {}),
    ...(potions.length ? {
      potions: inv => {
        const next = { ...(inv || {}) };
        for (const { recipe } of potions) next[recipe.id] = (next[recipe.id] || 0) + 1;
        return next;
      },
      potionsRev: rev => {
        const next = { ...(rev || {}) };
        for (const { recipe } of potions) next[recipe.id] = (next[recipe.id] || 0) + 1;
        return next;
      },
    } : {}),
  };
}

/* Advance on the clock: each successor starts when the previous cook finished.
 * Queue removal, pot replacement and delivery all commit or abort together.
 * Returns only dishes banked by this transaction, for drainCookQueue's XP.
 * Unsupported paid entries are retained for recovery instead of being dropped. */
export async function advanceQueue(now = Date.now()) {
  // Avoid a write transaction on the common busy/empty-queue render path.
  if (!(await readSlots()).some(c => !c || c.readyAt <= now) || !(await readQueue()).length) return [];
  return payAtomic({ snapshot: { keys: ['potsOwned', 'cooking', 'cookq'] }, decide: state => {
    const arr = slotsFrom(state.cooking, Math.min(MAX_POTS, Math.max(1, state.potsOwned || 1)));
    const queue = Array.isArray(state.cookq) ? state.cookq.slice() : [];
    const banked = [];
    let moved = 0;
    while (queue.length) {
      const r = RECIPE_BY_ID[queue[0].recipeId];
      if (!r) break;
      let idx = arr.findIndex(c => !c), at = now;
      if (idx < 0) {
        const done = arr.map((c, i) => ({ i, t: c.readyAt }))
          .filter(x => x.t <= now && RECIPE_BY_ID[arr[x.i].recipeId]).sort((a, b) => a.t - b.t)[0];
        if (!done) break;
        idx = done.i; at = done.t;
        banked.push({ recipe: RECIPE_BY_ID[arr[idx].recipeId], at });
      }
      queue.shift(); moved++;
      arr[idx] = { recipeId: r.id, startedAt: at, readyAt: at + r.cookMin * 60e3 };
    }
    return { result: banked.map(b => b.recipe), kv: moved ? {
      cookq: () => queue, cooking: () => arr, ...deliveryUpdates(banked),
    } : {} };
  } });
}

/* WHAT A DRAIN WOULD COLLECT, WITHOUT COLLECTING IT. Pure: no kv, no XP, no
 * writes. Today's Kitchen card has to SAY how many dishes are waiting, and it
 * used to find out by draining mid-render (QA r26 O15). Draining pays, and
 * awardCapped drags level rewards, crates and eggs into the Today render tick,
 * which tests/today-reads-lint.mjs row A1 grades at one full-store scan per
 * store; it read health x4 and xp x2. The card only ever needed a COUNT.
 *
 * Mirrors advanceQueue's placement exactly so the number matches what the next
 * real drain banks: an EMPTY pot takes the head of the queue starting `now` (so
 * that cook can never already be finished, it only swallows an entry), and a
 * FINISHED pot hands its entry over back-dated to the moment it came free, so a
 * queue laid down on Monday reads right on Tuesday. Loops to the same fixpoint
 * drainCookQueue's own loop reaches. Disjoint from readyCount: that counts the
 * dishes sitting in pots, this counts the queued cooks behind them. */
export function queueReadyCount(slots, queue, now = Date.now()) {
  const q = queue.slice(slots.filter(c => !c).length);   // empty pots swallow the head of the line
  const free = slots.filter(c => c && c.readyAt <= now).map(c => c.readyAt).sort((a, b) => a - b);
  let ready = 0;
  for (const r of q) {
    if (!free.length) break;
    const done = free[0] + r.cookMin * 60e3;
    if (done > now) { free.shift(); continue; }   // that pot is cooking again, and not done yet
    ready++;
    free[0] = done;
    free.sort((a, b) => a - b);
  }
  return ready;
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
    // queued cooks that would already have finished had the queue been drained
    queueReady: queueReadyCount(arr, queue, now),
    anyCooking: slots.some(s => !s.empty && !s.ready),
    // back-compat for the home card / badges (any pot ready + its recipe)
    ready: readySlots.length > 0,
    recipe: readySlots[0] ? readySlots[0].recipe : null,
  };
}
// Affordability, vacancy and ingredient payment use the same live snapshot.
export async function startCook(recipeId, now = Date.now()) {
  const r = RECIPE_BY_ID[recipeId];
  if (!r) return { ok: false, reason: 'unknown' };
  return payAtomic({ snapshot: { keys: ['potsOwned', 'cooking', 'ingredients'] }, decide: state => {
    const arr = slotsFrom(state.cooking, Math.min(MAX_POTS, Math.max(1, state.potsOwned || 1)));
    const free = arr.findIndex(c => !c);
    if (free < 0) return { result: { ok: false, reason: 'busy' } };
    if (!canCook(r, state.ingredients || {})) return { result: { ok: false, reason: 'ingredients' } };
    arr[free] = { recipeId, startedAt: now, readyAt: now + r.cookMin * 60e3 };
    return { result: { ok: true, slot: free }, kv: {
      ingredients: () => spentIngredients(r, state.ingredients), cooking: () => arr,
    } };
  } });
}

// Clearing the pot claims the dish, and banking it completes that same write.
export async function collectDish(slotIndex = null, now = Date.now()) {
  return payAtomic({ snapshot: { keys: ['potsOwned', 'cooking'] }, decide: state => {
    const arr = slotsFrom(state.cooking, Math.min(MAX_POTS, Math.max(1, state.potsOwned || 1)));
    const idx = slotIndex == null ? arr.findIndex(c => c && now >= c.readyAt && RECIPE_BY_ID[c.recipeId]) : slotIndex;
    const c = arr[idx], r = c && RECIPE_BY_ID[c.recipeId];
    if (!r || now < c.readyAt) return { result: null };
    arr[idx] = null;
    return { result: r, kv: { cooking: () => arr, ...deliveryUpdates([{ recipe: r, at: now }]) } };
  } });
}

/* R38-23: A DAY-ONE COOK CAN STRAND THEMSELVES. Bone Broth needs {marrow:2,
 * salt:1}, which is exactly the starter pouch, but Stoneskin Draught needs
 * {marrow:1, salt:1} and is ALSO affordable with it: a day-one save has both
 * buttons enabled, and cooking the wrong one leaves {marrow:1, salt:0}, which
 * cooks nothing else in the game (measured: 606 coins of foraging to recover a
 * specific dish, against a day-one wallet of roughly 300). There was no way
 * back out of a pot once started.
 *
 * Same claim shape as collectDish above: read-and-null the slot in ONE
 * transaction, so two overlapping cancels of one pot cannot both refund it.
 * Refuses once the pot is already empty (served via collectDish, or already
 * cancelled), which slotsFrom's !arr[slotIndex] check covers for free. Works
 * whether the pot is still cooking or sitting ready-to-serve: either way the
 * dish has not been SERVED (collectDish never ran), so nothing has been paid
 * out yet and a full ingredient refund is honest.
 *
 * THE POT AND THE REFUND ARE NOW THE SAME TRANSACTION (fixed 2026-09-06). This
 * used to null the pot here, then call refundIngredients as a separate
 * kvUpdate: correct against a same-instant double-cancel, but a crash between
 * the two committed transactions left the pot gone with the ingredients never
 * returned, exactly the gap CLAIMS wrongly called atomic. kvUpdateMulti runs
 * both kv rows in one IndexedDB transaction: the ingredients fn only refunds
 * once the cooking fn has actually found something to cancel, and a throw in
 * either aborts both, so a crash mid-cancel leaves the pot cooking with its
 * ingredients unspent rather than either half alone. */
export async function cancelCook(slotIndex) {
  const pots = await potsOwned();
  let cancelled = null;
  await kvUpdateMulti({
    cooking: raw => {
      const arr = slotsFrom(raw, pots);
      if (slotIndex == null || !arr[slotIndex]) return undefined;
      cancelled = arr[slotIndex];
      arr[slotIndex] = null;
      return arr;
    },
    ingredients: inv => {
      if (!cancelled) return undefined;             // nothing cancelled: refund nothing
      const r = RECIPE_BY_ID[cancelled.recipeId];
      if (!r) return undefined;                      // stale/unknown recipe: nothing owed
      const cur = { ...(inv || {}) };
      for (const [id, n] of Object.entries(r.needs)) cur[id] = (cur[id] || 0) + n;
      return cur;
    },
  }, { cooking: null, ingredients: {} });
  if (!cancelled) return null;
  return RECIPE_BY_ID[cancelled.recipeId] || null;
}

/* ---------- Pantry (v152): cooked dishes stockpile until you choose to use one ----------
 * Old behavior force-activated a dish the moment you collected it. Now collecting
 * banks it in the Pantry (kv 'pantry' = [{recipeId,name,icon,iconId,cookedAt}]);
 * activatePantryDish() is what turns it into a live buff, so you can save a dish
 * for the fight/day you actually want it. Additive + data-safe: existing active
 * buffs (kv 'foodbuffs') are untouched; potions still go straight to the satchel. */
export async function pantryDishes() { return (await kvGet('pantry', [])) || []; }
// Discard claims the current pantry row in one transaction, so it preserves
// dishes banked concurrently by Serve or the Kitchen's queue tick.
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
// Index buttons remain visible while their async handler saves. Reject a
// second in-flight action on that index before it can target the shifted dish.
const pantryEats = new Set();
export async function activatePantryDish(index, now = Date.now()) {
  if (!Number.isInteger(index) || index < 0 || pantryEats.has(index)) return null;
  pantryEats.add(index);
  try {
    // Bind the action to the entry present at invocation, also across modules.
    const before = await pantryDishes();
    if (!before[index]) return null;
    return await payAtomic({ snapshot: { keys: ['pantry'] }, decide: state => {
      const list = state.pantry || [];
      if (JSON.stringify(list) !== JSON.stringify(before)) return { result: null };
      const r = RECIPE_BY_ID[list[index]?.recipeId];
      if (!r || !r.buff) return { result: null };
      return { result: r, kv: {
        pantry: () => list.filter((_, i) => i !== index),
        foodbuffs: buffs => [...(buffs || []), newFoodBuff(r, now)],
      } };
    } });
  } finally { pantryEats.delete(index); }
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
function newFoodBuff(recipe, now) {
  const b = { recipe: recipe.id, name: recipe.name, icon: recipe.icon, ...recipe.buff };
  if (b.kind === 'coins') b.untilMs = now + b.hours * 3600e3;
  if (b.kind === 'combat') b.fightsLeft = b.fights;
  return b;
}
// Only understood lifetimes may be pruned or spent. Opaque future rows stay
// byte-identical in storage and do not contribute effects in this build.
function knownFoodBuff(b) {
  return !!b && !Object.hasOwn(b, 'format') && ((b.kind === 'combat' && Number.isFinite(b.fightsLeft)) ||
    (b.kind === 'coins' && Number.isFinite(b.untilMs)));
}
const keepFoodBuff = (b, now) => !knownFoodBuff(b) || (b.kind === 'combat' ? b.fightsLeft > 0 : b.untilMs > now);
// prune spent/expired known buffs; return only understood live effects
export async function activeFoodBuffs(now = Date.now()) {
  const buffs = await foodBuffs();
  const live = buffs.filter(b => keepFoodBuff(b, now));
  if (live.length !== buffs.length) await kvSet('foodbuffs', live);
  return live.filter(knownFoodBuff);
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
  for (const b of buffs) if (knownFoodBuff(b) && b.kind === 'combat' && b.fightsLeft > 0) { b.fightsLeft -= 1; changed = true; }
  const live = buffs.filter(b => keepFoodBuff(b, now));
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
  if (b.petFree) bits.push('pet special recovers one turn sooner');
  return `${bits.join(' · ')} · ${b.fightsLeft} fight${b.fightsLeft === 1 ? '' : 's'} left`;
}

/* WHAT A DISH IS WORTH, IN PLAIN WORDS. Tom's ruling, 2026-09-07 (master
 * handoff B5, copy only: serving a dish still pays its 8 XP and nothing about a
 * recipe changed).
 *
 * v483 put one line in the Pit naming the active dish. It said what the buff
 * DOES ("+25% dmg, 4 fights left") and never what that is worth, which is the
 * question a player actually has in front of a fight.
 *
 * Measured against a mirror, 2000 seeds per arm, no talents, with a level-5
 * Hound and with no pet. smartPlayerTurn now takes one smartPetTurn before
 * endTurn, matching the app's body -> pet -> end-turn sequence.
 *
 * T1 remeasurement, 2026-09-07: hound baseline 1836/2000, no pet 747/2000.
 * Broth, Hash and Feast still more than halve losses in both arms; Stew
 * remains below each of those dishes. Skewer now shortens recovery by one
 * turn, retaining petFree as the saved-data key so stocked/active dishes work.
 * With the level-5 C6 hound it wins 1900/2000 (difference interval
 * [1.7, 4.8]pp), versus 747/2000 without a pet. Kibble wins 1923/2000
 * and 747/2000 respectively. Hounds already act once per round, so their
 * new one-turn recovery produces the same outcomes as the former bypass.
 * The hound-only worth instrument cannot detect the warden/imp cooldown
 * defect: pit.test.js guards recovery for every species on the real engine.
 * No percentage belongs in the copy: size depends on the configuration.
 *
 * tests/dish-worth-audit.mjs re-measures this on every gate run and fails if a
 * dish's claim stops being true, so a re-cost cannot leave the copy lying. */
export const DISH_WORTH = {
  'bone-broth':  'Measured: against an even fight it more than halves the fights you lose.',
  'hearty-hash': 'Measured: against an even fight it more than halves the fights you lose.',
  'necro-feast': 'Measured: against an even fight it more than halves the fights you lose.',
  'marrow-stew': 'Measured: it cuts the fights you lose against an even foe, less than the big dishes do.',
  // T2: 2000-seed hound comparison spans zero; keep the recovery description only.
  'bonemeal-kibble': 'Measured: with a trained hound at your side, a tougher, harder-hitting pet helps you lose fewer fights against an even foe.',
};
export const dishWorth = recipeId => DISH_WORTH[recipeId] || '';

export function fmtCookTime(ms) {
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
