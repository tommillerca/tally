// Loot: crates, cosmetics inventory, coins, consumables (streak freeze, XP boost).
// Depends only on db + the generated cosmetics manifest, so the whole economy
// stays portable (no DOM, no web-only APIs).

import { db, kvGet, kvSet, newId } from './db.js';
import { BH_ITEMS, BH_BY_ID, BH_SLOTS } from '../data/boneheadz.js';
import { GEAR_ITEMS, GEAR_BY_ID, GEAR_SLOTS } from './gear.js';

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
  golden: { label: 'Golden Crate', icon: '🧰', rolls: 2, floor: 2, coins: [60, 120], consumableChance: 0.25 },
  egg:    { label: 'Step Egg',     icon: '🥚', rolls: 1, floor: 1, coins: [20, 50], slotBias: ['FW', 'S', 'C'], consumableChance: 0.15 },
};

export const CONSUMABLES = {
  freeze: { label: 'Streak Freeze', icon: '🧊', desc: 'Auto-protects your streak the next day you forget to log' },
  xp2:    { label: 'XP Boost',      icon: '⚡️', desc: 'Double XP on your next 5 logged foods' },
};

export const SHOP = [
  { id: 'crate-daily', label: 'Daily Crate', icon: '📦', cost: 150 },
  { id: 'crate-golden', label: 'Golden Crate', icon: '🧰', cost: 400 },
  { id: 'freeze', label: 'Streak Freeze', icon: '🧊', cost: 120 },
  { id: 'xp2', label: 'XP Boost', icon: '⚡️', cost: 100 },
];

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

export async function grantCrate(kind, source) {
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
  let pool = BH_ITEMS.filter(i => !i.default && i.rarity === rarity && !owned.has(i.id));
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
    const { item, dupe } = rollCosmetic(owned, floor, def.slotBias);
    // gear-slot art has a 55% chance to drop as a STATTED variant of the same look
    if (GEAR_SLOTS.includes(item.slot) && rng() < 0.55) {
      const variants = GEAR_ITEMS.filter(g => g.artId === item.id);
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

/* ---------- XP boost ---------- */
export async function activateXpBoost() {
  const inv = await inventory();
  const row = inv.find(r => r.kind === 'xp2');
  if (!row) return false;
  await db.del('inv', row.id);
  const buffs = await kvGet('buffs', {});
  buffs.xp2 = (buffs.xp2 || 0) + 5;
  await kvSet('buffs', buffs);
  return true;
}

export async function xpBoostCharges() {
  const buffs = await kvGet('buffs', {});
  return buffs.xp2 || 0;
}

// Consume one charge for a newly logged food. Returns the multiplier (1 or 2).
export async function consumeXpBoostCharge() {
  const buffs = await kvGet('buffs', {});
  if (!buffs.xp2 || buffs.xp2 <= 0) return 1;
  buffs.xp2 -= 1;
  await kvSet('buffs', buffs);
  return 2;
}

/* ---------- streak freeze ---------- */
export async function consumeFreeze() {
  const inv = await inventory();
  const row = inv.find(r => r.kind === 'freeze');
  if (!row) return false;
  await db.del('inv', row.id);
  return true;
}
