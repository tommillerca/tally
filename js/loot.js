// Loot: crates, cosmetics inventory, coins, consumables (streak freeze, XP boost).
// Depends only on db + the generated cosmetics manifest, so the whole economy
// stays portable (no DOM, no web-only APIs).

import { db, kvGet, kvSet, newId } from './db.js';
import { BH_ITEMS, BH_BY_ID, BH_SLOTS } from '../data/boneheadz.js';
import { GEAR_ITEMS, GEAR_BY_ID, GEAR_SLOTS } from './gear.js';
import { grantIngredient, COMMON_INGREDIENT_IDS } from './cooking.js';

export const RARITIES = {
  common:    { label: 'Common',    color: '#9fac9f', w: 52, dupe: 10 },
  uncommon:  { label: 'Uncommon',  color: '#4ade80', w: 26, dupe: 25 },
  rare:      { label: 'Rare',      color: '#6fd0ff', w: 13, dupe: 60 },
  epic:      { label: 'Epic',      color: '#c084fc', w: 6,  dupe: 150 },
  legendary: { label: 'Legendary', color: '#ffc961', w: 3,  dupe: 400 },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const CRATES = {
  daily:  { label: 'Daily Crate',  icon: '📦', rolls: 1, floor: 0, coins: [20, 40], consumableChance: 0.12 },
  golden: { label: 'Golden Crate', icon: '🧰', rolls: 3, floor: 2, coins: [10, 25], consumableChance: 0.18 },
  egg:    { label: 'Step Egg',     icon: '🥚', rolls: 1, floor: 1, coins: [20, 50], slotBias: ['FW', 'S', 'C'], consumableChance: 0.15 },
};

export const CONSUMABLES = {
  freeze: { label: 'Streak Freeze', icon: '🧊', desc: 'Auto-protects your streak the next day you forget to log' },
  // Battle Charm reuses the old 'xp2' storage key so any owned charges convert
  // 1:1 for free. It no longer touches logging; it pays out on Pit wins.
  xp2:    { label: 'Battle Charm',  icon: '🧿', desc: 'Your next 5 Pit wins pay +25% coins' },
};

export const SHOP = [
  { id: 'crate-daily', label: 'Daily Crate', icon: '📦', cost: 150 },
  { id: 'crate-golden', label: 'Golden Crate', icon: '🧰', cost: 400 },
  { id: 'freeze', label: 'Streak Freeze', icon: '🧊', cost: 120 },
  { id: 'xp2', label: 'Battle Charm', icon: '🧿', cost: 100 },
];

// Coin bonus a Battle Charm charge adds to a Pit win.
export const BATTLE_CHARM_BONUS = 0.25;

function rng() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 0xffffffff;
}

/* ---------- coins ---------- */
export async function coins() { return (await kvGet('coins', 0)) || 0; }
export async function coinsAdd(n) {
  const c = Math.max(0, (await coins()) + n);
  await kvSet('coins', c);
  return c;
}

/* ---------- inventory ---------- */
export async function inventory() { return db.all('inv'); }

export async function ownedCosmeticIds() {
  const inv = await inventory();
  const owned = new Set(inv.filter(r => r.kind === 'cos').map(r => r.itemId));
  for (const s of BH_SLOTS) if (s.default) owned.add(s.default);
  return owned;
}

export async function grantCosmetic(itemId, source) {
  const owned = await ownedCosmeticIds();
  if (owned.has(itemId)) return null;
  const row = { id: newId(), kind: 'cos', itemId, source, ts: Date.now() };
  await db.put('inv', row);
  return row;
}

export async function ownedGearIds() {
  const inv = await db.all('inv');
  return new Set(inv.filter(r => r.kind === 'gear').map(r => r.gearId));
}

export async function grantGear(gearId, source) {
  const g = GEAR_BY_ID[gearId];
  if (!g) throw new Error('unknown gear');
  const owned = await ownedGearIds();
  if (owned.has(gearId)) return null;
  await db.put('inv', { id: newId(), kind: 'gear', gearId, source, ts: Date.now() });
  return g;
}

/* ---------- Bone Dust: the salvage economy (v73) ----------
   Melt unwanted gear or salvage pets you don't want into Bone Dust, so a bad
   drop / dupe egg still pays off. Dust buys eggs, crates and consumables, so
   junk loops back into a shot at something good. Additive: dust lives in its
   own kv key; the XP ledger is untouched. */
export const DUST_VALUE = {
  gear: { common: 3, uncommon: 5, rare: 12, epic: 30, legendary: 80 },
  pet:  { common: 10, uncommon: 15, rare: 30, epic: 60, legendary: 120 },
};
export async function boneDust() { return (await kvGet('bonedust', 0)) || 0; }
export async function boneDustAdd(n) {
  const d = Math.max(0, (await boneDust()) + n);
  await kvSet('bonedust', d);
  return d;
}
export function gearDustValue(g) { return (g && DUST_VALUE.gear[g.rarity]) || 3; }
export function petDustValue(item) { return (item && DUST_VALUE.pet[item.rarity]) || 10; }

// Melt an owned gear piece into Bone Dust. Auto-unequips it first. Destructive
// to that ONE item by the player's explicit choice; nothing else is touched.
export async function disenchantGear(gearId) {
  const g = GEAR_BY_ID[gearId];
  if (!g) return { ok: false, reason: 'unknown' };
  const inv = await db.all('inv');
  const row = inv.find(r => r.kind === 'gear' && r.gearId === gearId);
  if (!row) return { ok: false, reason: 'not-owned' };
  const gl = await gearLoadout();
  if (gl[g.slot] === gearId) { const next = { ...gl }; delete next[g.slot]; await kvSet('gearloadout', next); }
  await db.del('inv', row.id);
  const dust = gearDustValue(g);
  await boneDustAdd(dust);
  return { ok: true, dust, name: g.name };
}

// Salvage an owned, EARNED pet into Bone Dust. Won't touch a default/base pet
// (no inv row) and unequips it if it's your active companion.
export async function salvagePet(petId) {
  const item = BH_BY_ID[petId];
  if (!item || item.slot !== 'C') return { ok: false, reason: 'not-a-pet' };
  const inv = await db.all('inv');
  const row = inv.find(r => r.kind === 'cos' && r.itemId === petId);
  if (!row) return { ok: false, reason: 'not-owned' }; // base/default pets can't be salvaged
  const eq = await equipped();
  if (eq.C === petId) await equip('C', null);
  await db.del('inv', row.id);
  const pets = (await kvGet('pets', {})) || {}; delete pets[petId]; await kvSet('pets', pets);
  const dust = petDustValue(item);
  await boneDustAdd(dust);
  return { ok: true, dust, name: item.name };
}

// Bone Dust shop: spend salvage on a fresh shot at pets / crates / consumables.
export const DUST_SHOP = [
  { id: 'egg', label: 'Mystery Egg', cost: 60, desc: 'Incubate, then hatch a pet' },
  { id: 'crate-daily', label: 'Daily Crate', cost: 40, desc: 'A roll of loot' },
  { id: 'freeze', label: 'Streak Freeze', cost: 25, desc: 'Protect a missed day' },
  { id: 'charm', label: 'Battle Charm', cost: 25, desc: 'Next Pit win pays more' },
];
export async function buyWithDust(id) {
  const item = DUST_SHOP.find(x => x.id === id);
  if (!item) return { ok: false, reason: 'unknown' };
  const bal = await boneDust();
  if (bal < item.cost) return { ok: false, reason: 'dust', need: item.cost, have: bal };
  await boneDustAdd(-item.cost);
  if (id === 'egg') await grantEgg('dust');
  else if (id === 'crate-daily') await grantCrate('daily', 'dust');
  else await grantConsumable(id, 'dust');
  return { ok: true, id, cost: item.cost };
}

export const EGG_GOAL_STEPS = 8000;

export async function lifetimeStepsSum() {
  const rows = await db.all('health');
  return rows.reduce((a, r) => a + (r.steps || 0), 0);
}

// Eggs incubate: they hatch into PETS after you walk EGG_GOAL_STEPS.
export async function grantEgg(source) {
  const stepsAtStart = await lifetimeStepsSum();
  const row = { id: newId(), kind: 'egg', stepsAtStart, goal: EGG_GOAL_STEPS, source, ts: Date.now() };
  await db.put('inv', row);
  return row;
}

export function eggProgress(row, lifetime) {
  const walked = Math.max(0, lifetime - (row.stepsAtStart || 0));
  return { walked: Math.min(walked, row.goal || EGG_GOAL_STEPS), goal: row.goal || EGG_GOAL_STEPS, ready: walked >= (row.goal || EGG_GOAL_STEPS) };
}

// Odds a hatch comes out SHINY (an ultra-rare recolored variant). Stays
// obtainable even after you own every pet: a shiny roll on a dupe upgrades an
// owned pet to shiny instead of paying coins.
export const SHINY_CHANCE = 0.03;

// Crack a ready egg: rolls a PET (slot C), unowned first, dupe pays coins.
export async function hatchEgg(invId) {
  const inv = await inventory();
  const row = inv.find(r => r.id === invId && r.kind === 'egg');
  if (!row) throw new Error('egg gone');
  const { ready } = eggProgress(row, await lifetimeStepsSum());
  if (!ready) return { ready: false };
  const owned = await ownedCosmeticIds();
  const pets = BH_ITEMS.filter(i => i.slot === 'C');
  const fresh = pets.filter(i => !owned.has(i.id));
  await db.del('inv', row.id);
  const isShiny = rng() < SHINY_CHANCE;
  const pets2 = (await kvGet('pets', {})) || {};
  if (!fresh.length) {
    // Own them all: a shiny roll upgrades a not-yet-shiny pet; otherwise coins.
    if (isShiny) {
      const upg = pets.filter(i => !pets2[i.id]?.shiny);
      if (upg.length) {
        const pick = upg[Math.floor(rng() * upg.length)];
        pets2[pick.id] = { ...(pets2[pick.id] || { hatchedAtSteps: await lifetimeStepsSum() }), shiny: true };
        await kvSet('pets', pets2);
        return { ready: true, dupe: true, shiny: true, item: pick };
      }
    }
    await coinsAdd(120);
    return { ready: true, dupe: true, coins: 120 };
  }
  // rarity-weighted among unowned pets (uncommon floor keeps hatches exciting)
  const pool = fresh.filter(i => i.rarity !== 'common');
  const pick = (pool.length ? pool : fresh)[Math.floor(rng() * (pool.length ? pool.length : fresh.length))];
  await grantCosmetic(pick.id, 'egg');
  // anchor its battle level to now: pet level = steps walked SINCE this moment
  if (!pets2[pick.id]) pets2[pick.id] = { hatchedAtSteps: await lifetimeStepsSum() };
  if (isShiny) pets2[pick.id].shiny = true;
  await kvSet('pets', pets2);
  return { ready: true, item: pick, shiny: isShiny };
}

// Is an owned pet the shiny variant?
export async function isPetShiny(petId) {
  const pets2 = (await kvGet('pets', {})) || {};
  return !!pets2[petId]?.shiny;
}
export async function shinyPetIds() {
  const pets2 = (await kvGet('pets', {})) || {};
  return Object.keys(pets2).filter(id => pets2[id]?.shiny);
}

// The steps a pet has walked since it hatched (drives its battle level).
// Grant a pet directly (petId, or 'random' for a random unowned one), anchoring
// its battle level to now. Returns the granted item, or null if already owned /
// no fresh pets. Shared by hatching and code redemption.
export async function grantPet(petId, source = 'code') {
  const owned = await ownedCosmeticIds();
  const pets = BH_ITEMS.filter(i => i.slot === 'C');
  let pick;
  if (petId === 'random') {
    const fresh = pets.filter(i => !owned.has(i.id));
    if (!fresh.length) return null;
    const pool = fresh.filter(i => i.rarity !== 'common');
    pick = (pool.length ? pool : fresh)[Math.floor(rng() * (pool.length ? pool.length : fresh.length))];
  } else {
    pick = BH_BY_ID[petId];
    if (!pick || pick.slot !== 'C' || owned.has(petId)) return null;
  }
  await grantCosmetic(pick.id, source);
  const pets2 = (await kvGet('pets', {})) || {};
  if (!pets2[pick.id]) { pets2[pick.id] = { hatchedAtSteps: await lifetimeStepsSum() }; await kvSet('pets', pets2); }
  return pick;
}

// Redeem-a-code (web stopgap so friends can get a pet before TestFlight). Each
// code works ONCE per device (kv 'redeemed'). Share the codes you want.
export const REDEEM_CODES = {
  BONEHEADZ:  { pet: 'random', coins: 50 }, // welcome: a random pet + coins
  COSMICPET:  { pet: 'C1' },
  ETERNALPET: { pet: 'C2' },
  CORNERPET:  { pet: 'C3' },
  BASICPET:   { pet: 'C4' },
  TIDYPET:    { pet: 'C5' },
};
export async function redeemCode(raw) {
  const code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!code) return { ok: false, reason: 'empty' };
  const def = REDEEM_CODES[code];
  if (!def) return { ok: false, reason: 'invalid' };
  const done = (await kvGet('redeemed', [])) || [];
  if (done.includes(code)) return { ok: false, reason: 'used' };
  let pet = null, coins = 0, dupe = false;
  if (def.pet) {
    pet = await grantPet(def.pet, 'code:' + code);
    if (!pet) { dupe = true; coins += 120; await coinsAdd(120); } // already owned -> coins
  }
  if (def.coins) { coins += def.coins; await coinsAdd(def.coins); }
  done.push(code); await kvSet('redeemed', done);
  return { ok: true, pet, coins, dupe };
}

export async function petStepsSince(petId) {
  const pets = (await kvGet('pets', {})) || {};
  const rec = pets[petId];
  const now = await lifetimeStepsSum();
  return Math.max(0, now - (rec ? rec.hatchedAtSteps : 0)); // pre-existing pets: count all steps
}
export async function petPicks(petId) {
  const all = (await kvGet('pettalents', {})) || {};
  return all[petId] || [];
}
export async function setPetPick(petId, nodeId, picks) {
  const all = (await kvGet('pettalents', {})) || {};
  all[petId] = picks;
  await kvSet('pettalents', all);
  return picks;
}

// Legacy: unopened egg-type crates become incubating eggs (idempotent sweep).
export async function migrateLegacyEggs() {
  const inv = await inventory();
  const legacy = inv.filter(r => r.kind === 'crate' && r.crate === 'egg');
  for (const r of legacy) {
    await db.del('inv', r.id);
    await grantEgg(r.source || 'legacy');
  }
  return legacy.length;
}

export async function grantCrate(kind, source) {
  if (kind === 'egg') return grantEgg(source); // eggs incubate, they don't open
  const row = { id: newId(), kind: 'crate', crate: kind, source, ts: Date.now() };
  await db.put('inv', row);
  return row;
}

export async function grantConsumable(type, source) {
  const row = { id: newId(), kind: type, source, ts: Date.now() };
  await db.put('inv', row);
  return row;
}

export async function consumableCount(type) {
  return (await inventory()).filter(r => r.kind === type).length;
}

export async function unopenedCrates() {
  return (await inventory()).filter(r => r.kind === 'crate').sort((a, b) => a.ts - b.ts);
}

/* ---------- crate rolling ---------- */
function rollRarity(floor = 0) {
  const pool = RARITY_ORDER.slice(floor);
  const total = pool.reduce((a, r) => a + RARITIES[r].w, 0);
  let x = rng() * total;
  for (const r of pool) {
    x -= RARITIES[r].w;
    if (x <= 0) return r;
  }
  return pool[pool.length - 1];
}

function candidates(rarity, owned, slotBias) {
  // pets (slot C) hatch from step eggs only, never from crates
  let pool = BH_ITEMS.filter(i => !i.default && i.slot !== 'C' && i.rarity === rarity && !owned.has(i.id));
  if (slotBias && rng() < 0.5) {
    const biased = pool.filter(i => slotBias.includes(i.slot));
    if (biased.length) pool = biased;
  }
  return pool;
}

// One cosmetic roll. Prefers unowned at the rolled rarity, walks down then up,
// and falls back to a duplicate (converted to coins) when the collection is fat.
function rollCosmetic(owned, floor, slotBias) {
  const rolled = RARITY_ORDER.indexOf(rollRarity(floor));
  const order = [...RARITY_ORDER.slice(0, rolled + 1).reverse(), ...RARITY_ORDER.slice(rolled + 1)];
  for (const r of order) {
    const pool = candidates(r, owned, slotBias);
    if (pool.length) return { item: pool[Math.floor(rng() * pool.length)], dupe: false };
  }
  const any = BH_ITEMS.filter(i => !i.default);
  const item = any[Math.floor(rng() * any.length)];
  return { item, dupe: true };
}

export async function openCrate(invId) {
  const inv = await inventory();
  const crateRow = inv.find(r => r.id === invId && r.kind === 'crate');
  if (!crateRow) throw new Error('crate gone');
  const def = CRATES[crateRow.crate] || CRATES.daily;
  const owned = await ownedCosmeticIds();
  const results = [];
  let coinsWon = Math.round(def.coins[0] + rng() * (def.coins[1] - def.coins[0]));

  for (let i = 0; i < def.rolls; i++) {
    const floor = i === 0 ? def.floor : 0;
    if (rng() < def.consumableChance) {
      const type = rng() < 0.5 ? 'freeze' : 'xp2';
      await grantConsumable(type, 'crate');
      results.push({ type: 'consumable', consumable: type });
      continue;
    }
    // a no-walk fallback for cooking: crates sometimes hold a common ingredient
    if (rng() < 0.28) {
      const ing = COMMON_INGREDIENT_IDS[Math.floor(rng() * COMMON_INGREDIENT_IDS.length)];
      await grantIngredient(ing);
      results.push({ type: 'ingredient', ingredient: ing });
      continue;
    }
    const { item, dupe } = rollCosmetic(owned, floor, def.slotBias);
    // gear-slot art has a 55% chance to drop as a STATTED variant of the same look
    if (GEAR_SLOTS.includes(item.slot) && rng() < 0.55) {
      // never drop gear gated more than 3 levels ahead (dead loot kills momentum);
      // if no variant qualifies, fall through to the plain cosmetic instead
      const { totalXp: _txp, levelFor: _lf } = await import('./game.js');
      const cap = _lf(await _txp()).level + 3;
      const variants = GEAR_ITEMS.filter(g => g.artId === item.id && (g.minLevel || 1) <= cap);
      const gOwned = await ownedGearIds();
      const pick = variants.find(g => !gOwned.has(g.id)) || variants[Math.floor(rng() * variants.length)];
      if (pick && !gOwned.has(pick.id)) {
        await grantGear(pick.id, 'crate');
        results.push({ type: 'gear', gear: pick, item });
        continue;
      } else if (pick) {
        const value = RARITIES[pick.rarity].dupe;
        coinsWon += value;
        results.push({ type: 'geardupe', gear: pick, item, coins: value });
        continue;
      }
    }
    if (dupe || owned.has(item.id)) {
      const value = RARITIES[item.rarity].dupe;
      coinsWon += value;
      results.push({ type: 'dupe', item, coins: value });
    } else {
      await grantCosmetic(item.id, 'crate');
      owned.add(item.id);
      results.push({ type: 'cos', item });
    }
  }
  await db.del('inv', crateRow.id);
  await coinsAdd(coinsWon);
  return { crate: crateRow.crate, def, results, coins: coinsWon };
}

export async function buyShopItem(shopId) {
  const s = SHOP.find(x => x.id === shopId);
  if (!s) throw new Error('unknown item');
  const c = await coins();
  if (c < s.cost) return { ok: false, reason: 'coins' };
  await coinsAdd(-s.cost);
  if (shopId === 'crate-daily') await grantCrate('daily', 'shop');
  else if (shopId === 'crate-golden') await grantCrate('golden', 'shop');
  else await grantConsumable(shopId, 'shop');
  return { ok: true };
}

/* ---------- weapons (bought with coins, one-each) ---------- */
// Bonecrusher is the Champion's prize, not for sale. The rest reward a spec.
// The Bone Merchant's tiered stock (v71) is a deliberate gold sink: the endgame
// pieces cost thousands, so weapons are a long-term goal, not a quick clear.
export const WEAPON_COST = {
  rapier: 500, shivs: 500, scepter: 900,
  wand: 700, cleaver: 1500, crook: 1600,   // entry / mid tier
  maul: 3400, lichfocus: 3400, censer: 3200, // legendary gold sinks
};

export async function ownedWeaponIds() {
  const inv = await db.all('inv');
  return new Set(['starter', ...inv.filter(r => r.kind === 'weapon').map(r => r.weaponId)]);
}

export async function buyWeapon(weaponId) {
  const cost = WEAPON_COST[weaponId];
  if (!cost) return { ok: false, reason: 'not-for-sale' };
  const owned = await ownedWeaponIds();
  if (owned.has(weaponId)) return { ok: false, reason: 'owned' };
  const bal = await coins();
  if (bal < cost) return { ok: false, reason: 'coins', need: cost, have: bal };
  await coinsAdd(-cost);
  await db.put('inv', { id: newId(), kind: 'weapon', weaponId, source: 'shop', ts: Date.now() });
  return { ok: true, weaponId, cost };
}

/* ---------- equipped ---------- */
export async function equipped() {
  const base = {};
  for (const s of BH_SLOTS) if (s.default) base[s.code] = s.default;
  const saved = await kvGet('equipped', {});
  return { ...base, ...saved };
}

export async function equip(slot, itemId, { keepGear = false } = {}) {
  const eq = await equipped();
  if (itemId == null) {
    const def = BH_SLOTS.find(s => s.code === slot)?.default || null;
    if (def) eq[slot] = def; else delete eq[slot];
  } else {
    const item = BH_BY_ID[itemId];
    if (!item || item.slot !== slot) throw new Error('bad item');
    const owned = await ownedCosmeticIds();
    if (!owned.has(itemId)) throw new Error('not owned');
    eq[slot] = itemId;
  }
  await kvSet('equipped', eq);
  // choosing a plain look drops the statted piece from that slot
  if (!keepGear && GEAR_SLOTS.includes(slot)) {
    const lo = await gearLoadout();
    if (lo[slot]) { delete lo[slot]; await kvSet('gearloadout', lo); }
  }
  return eq;
}

export async function gearLoadout() { return (await kvGet('gearloadout', {})) || {}; }

// Equip a statted piece: sets the stats slot AND the matching look.
// The art does not need to be separately owned: the gear IS the item.
export async function equipGear(slot, gearId) {
  const lo = await gearLoadout();
  if (gearId == null) { delete lo[slot]; await kvSet('gearloadout', lo); return lo; }
  const g = GEAR_BY_ID[gearId];
  if (!g || g.slot !== slot) throw new Error('bad gear');
  const owned = await ownedGearIds();
  if (!owned.has(gearId)) throw new Error('not owned');
  const { totalXp, levelFor } = await import('./game.js'); // lazy: avoids circular init
  if (levelFor(await totalXp()).level < g.minLevel) throw new Error('level ' + g.minLevel + ' required');
  lo[slot] = gearId;
  await kvSet('gearloadout', lo);
  const eq = await equipped();
  eq[slot] = g.artId;
  await kvSet('equipped', eq);
  return lo;
}

/* ---------- Battle Charm (formerly XP Boost) ----------
   Charges live in kv buffs.xp2 (key kept so old charges convert 1:1). A charge
   is spent on a Pit WIN and adds BATTLE_CHARM_BONUS to that win's coins. */
export async function activateBattleCharm() {
  const inv = await inventory();
  const row = inv.find(r => r.kind === 'xp2');
  if (!row) return false;
  await db.del('inv', row.id);
  const buffs = await kvGet('buffs', {});
  buffs.xp2 = (buffs.xp2 || 0) + 5;
  await kvSet('buffs', buffs);
  return true;
}

export async function battleCharmCharges() {
  const buffs = await kvGet('buffs', {});
  return buffs.xp2 || 0;
}

// Consume one charge on a Pit win. Returns the coin bonus fraction (0 if none).
export async function consumeBattleCharmCharge() {
  const buffs = await kvGet('buffs', {});
  if (!buffs.xp2 || buffs.xp2 <= 0) return 0;
  buffs.xp2 -= 1;
  await kvSet('buffs', buffs);
  return BATTLE_CHARM_BONUS;
}

/* ---------- streak freeze ---------- */
export async function consumeFreeze() {
  const inv = await inventory();
  const row = inv.find(r => r.kind === 'freeze');
  if (!row) return false;
  await db.del('inv', row.id);
  return true;
}
