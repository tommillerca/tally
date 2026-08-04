// Loot: crates, cosmetics inventory, coins, consumables (Battle Charm, Vigor Draught).
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
  daily:  { label: 'Common Crate',  icon: '📦', rolls: 1, floor: 0, coins: [20, 40], consumableChance: 0.12 },
  golden: { label: 'Golden Crate', icon: '🧰', rolls: 3, floor: 2, coins: [10, 25], consumableChance: 0.18 },
  egg:    { label: 'Step Egg',     icon: '🥚', rolls: 1, floor: 1, coins: [20, 50], slotBias: ['FW', 'S', 'C'], consumableChance: 0.15 },
};

export const CONSUMABLES = {
  // Battle Charm reuses the old 'xp2' storage key so any owned charges convert
  // 1:1 for free. It no longer touches logging; it pays out on Pit wins.
  xp2:    { label: 'Battle Charm',  icon: '🧿', desc: 'Your next 5 Pit wins pay +25% coins' },
  // v153: a second "use it when you want it" item alongside the Charm. Refills
  // Pit energy so a good day of habits can fund a longer Pit run. Still never
  // rewards eating less (it's a spent item).
  vigor:  { label: 'Vigor Draught', icon: '⚡', desc: 'Drink to bank +3 Vigor (Pit energy) right now' },
};
export const VIGOR_DRAUGHT_AMOUNT = 3;

export const SHOP = [
  { id: 'crate-daily', label: 'Common Crate', icon: '📦', cost: 150 },
  { id: 'crate-golden', label: 'Golden Crate', icon: '🧰', cost: 400 },
  { id: 'vigor', label: 'Vigor Draught', icon: '⚡', cost: 90 },
  { id: 'xp2', label: 'Battle Charm', icon: '🧿', cost: 100 },
];

// Coin bonus a Battle Charm charge adds to a Pit win.
export const BATTLE_CHARM_BONUS = 0.25;

/* ---------- the drop: limited cosmetic sets sold like a release ---------- */
// One active drop at a time. Items are ordinary BH_ITEMS entries (legendary, in
// the crate pool like every legendary), PLUS direct-buy here, so the two
// acquisition paths in the copy below stay true: crack crates or pay full price.
export const DROP = {
  id: 'puffer-pack',
  title: 'The Puffer Pack',
  blurb: 'Legendary colourways. Puffer on puffer.',
  acquire: 'Every piece drops from crates like any legendary, or buy it outright below. Jackets 3,000 · fish 1,500.',
  items: [
    { id: 'T9-5', cost: 3000 }, { id: 'T9-6', cost: 3000 }, { id: 'T9-7', cost: 3000 },
    { id: 'T9-8', cost: 3000 }, { id: 'T9-9', cost: 3000 },
    { id: 'H13-2', cost: 1500 }, { id: 'H13-3', cost: 1500 }, { id: 'H13-4', cost: 1500 },
    { id: 'H13-5', cost: 1500 }, { id: 'H13-6', cost: 1500 },
  ],
};

export async function buyDropItem(itemId) {
  const d = DROP.items.find(x => x.id === itemId);
  if (!d) throw new Error('not a drop item');
  const item = BH_BY_ID[itemId];
  if ((await ownedCosmeticIds()).has(itemId)) return { ok: false, reason: 'owned' };
  const c = await coins();
  if (c < d.cost) return { ok: false, reason: 'coins', need: d.cost, have: c };
  await coinsAdd(-d.cost);
  await grantCosmetic(itemId, 'drop');
  return { ok: true, label: item.name, cost: d.cost, coins: await coins() };
}

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
  await collectLook(itemId);
  return row;
}

export async function ownedGearIds() {
  const inv = await db.all('inv');
  return new Set(inv.filter(r => r.kind === 'gear').map(r => r.gearId));
}

export async function grantGear(gearId, source, opts = {}) {
  const g = GEAR_BY_ID[gearId];
  if (!g) throw new Error('unknown gear');
  const owned = await ownedGearIds();
  if (owned.has(gearId)) return null;
  // `slimed`: the rare green-glowing Glutton variant. Purely cosmetic + a brag,
  // stored on the inv row so the wardrobe can mark the piece forever.
  await db.put('inv', { id: newId(), kind: 'gear', gearId, source, ts: Date.now(), ...(opts.slimed ? { slimed: true } : {}) });
  await collectLook(g.artId);
  return g;
}

// Gear ids the player owns a SLIMED copy of (Glutton drops).
export async function slimedGearIds() {
  const inv = await db.all('inv');
  return new Set(inv.filter(r => r.kind === 'gear' && r.slimed).map(r => r.gearId));
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
// Dust is rarity PLUS the piece's stat points. Tom asked for statted gear to be
// worth more; measuring first showed that EVERY one of the 276 catalog pieces is
// statted, so a flat "statted" bonus would have been a 50% dust inflation with no
// differentiation at all. Stat totals do vary a lot (uncommon 2-6, rare 3-11,
// legendary 5-18), so paying per point makes a strong roll genuinely worth more
// than a weak one of the same rarity, which is the decision he was reaching for.
// Rarity still dominates: a rare's 12 base outweighs any uncommon's points.
export function gearStatPoints(g) {
  return g && g.stats ? Object.values(g.stats).reduce((a, v) => a + v, 0) : 0;
}
export function gearDustValue(g) {
  return ((g && DUST_VALUE.gear[g.rarity]) || 3) + gearStatPoints(g);
}
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
  const list = await petInstances();
  if (!speciesCount(list, petId)) return { ok: false, reason: 'not-owned' };
  // sacrifice the WORST copy first (keeps your best / shinies); a better copy
  // pays out more dust so salvaging a shiny or bred pet still feels fair.
  const { instances, removed } = removeWorstInstance(list, petId);
  await savePetInstances(instances);
  const remaining = speciesCount(instances, petId);
  if (remaining === 0) {
    // last copy gone: drop ownership, unequip, clear the legacy anchor
    const inv = await db.all('inv');
    const row = inv.find(r => r.kind === 'cos' && r.itemId === petId);
    if (row) await db.del('inv', row.id);
    const eq = await equipped({ raw: true });
    if (eq.C === petId) await equip('C', null);
    const pets = (await kvGet('pets', {})) || {}; delete pets[petId]; await kvSet('pets', pets);
  }
  const dust = petDustValue(item) + (removed && removed.shiny ? 15 : 0) + (removed ? (removed.lineage || 0) * 8 : 0);
  await boneDustAdd(dust);
  return { ok: true, dust, name: item.name, remaining };
}

// Bone Dust shop: spend salvage on a fresh shot at pets / crates / consumables.
export const DUST_SHOP = [
  { id: 'egg', label: 'Mystery Egg', cost: 60, desc: 'Incubate, then hatch a pet' },
  { id: 'crate-daily', label: 'Common Crate', cost: 40, desc: 'A roll of loot' },
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

// Crack a ready egg: rolls a PET (slot C). A NEW species if you're missing any
// (rarity-weighted, uncommon floor), otherwise a DUPLICATE that stacks in your
// crew as breeding stock (v126: no more coins dead-end when you own them all).
export async function hatchEgg(invId) {
  const inv = await inventory();
  const row = inv.find(r => r.id === invId && r.kind === 'egg');
  if (!row) throw new Error('egg gone');
  const { ready } = eggProgress(row, await lifetimeStepsSum());
  if (!ready) return { ready: false };
  await db.del('inv', row.id);
  const owned = await ownedCosmeticIds();
  const pets = BH_ITEMS.filter(i => i.slot === 'C' && !i.exclusive); // exclusive pets (Day One Lizard) never hatch
  const fresh = pets.filter(i => !owned.has(i.id));
  const isShiny = rng() < SHINY_CHANCE;
  const isDupe = !fresh.length;
  const poolAll = isDupe ? pets : fresh;
  const pool = poolAll.filter(i => i.rarity !== 'common');
  const pick = (pool.length ? pool : poolAll)[Math.floor(rng() * (pool.length ? pool.length : poolAll.length))];
  await addPetInstance(pick.id, { shiny: isShiny });
  return { ready: true, item: pick, shiny: isShiny, dupe: isDupe };
}

/* ============ v126: pet INSTANCES (duplicates stack) ============
 * Pets used to be one-per-species (binary ownership in `inv` + a per-species
 * `pets` record for shiny/hatchedAtSteps). To support duplicates + breeding
 * (v127 lineage) a pet is now an INSTANCE: { iid, sp, lineage, shiny,
 * hatchedAtSteps }. The `petInst` kv is the authoritative list once migrated.
 * `inv` 'cos' rows stay the "own >=1 of this species" flag (drives the wardrobe
 * + equip, which are species-keyed), kept in lockstep with the instance count.
 * The core transforms below are PURE so they can be unit-tested without a DB. */

// Build the initial instance list from the legacy per-species state (one lineage-0
// instance per owned species; carries its shiny + hatch anchor). Idempotent input.
export function migrateInstances(ownedPetIds, petsRec = {}) {
  return (ownedPetIds || []).map((sp, i) => ({
    iid: `m${i}-${sp}`,
    sp,
    lineage: 0,
    shiny: !!(petsRec[sp] && petsRec[sp].shiny),
    hatchedAtSteps: (petsRec[sp] && petsRec[sp].hatchedAtSteps) || 0,
  }));
}
// The instance the game FIGHTS with for a species: best lineage, then shiny.
export function bestInstance(instances, sp) {
  const of = (instances || []).filter(x => x.sp === sp);
  if (!of.length) return null;
  return of.slice().sort((a, b) => (b.lineage - a.lineage) || (Number(!!b.shiny) - Number(!!a.shiny)))[0];
}
export function speciesCount(instances, sp) { return (instances || []).filter(x => x.sp === sp).length; }
// Salvage/breed sacrifices the WORST copy first (lowest lineage, non-shiny first)
// so a player never loses their best or a shiny to a routine salvage.
export function removeWorstInstance(instances, sp) {
  const tagged = (instances || []).map((x, i) => ({ x, i })).filter(o => o.x.sp === sp);
  if (!tagged.length) return { instances: instances || [], removed: null };
  tagged.sort((a, b) => (a.x.lineage - b.x.lineage) || (Number(!!a.x.shiny) - Number(!!b.x.shiny)));
  const idx = tagged[0].i;
  return { instances: instances.filter((_, i) => i !== idx), removed: instances[idx] };
}
export function addInstance(instances, inst) { return [...(instances || []), inst]; }
export function removeInstance(instances, iid) {
  const idx = (instances || []).findIndex(x => x.iid === iid);
  if (idx < 0) return { instances: instances || [], removed: null };
  return { instances: instances.filter((_, i) => i !== idx), removed: instances[idx] };
}

/* ============ v128: BREEDING ============
 * Fuse two owned pets: BOTH are consumed, producing one offspring of a chosen
 * parent's species at lineage = max(parents) + 1 (a permanent stat bump + glow).
 * Costs Bone Dust (escalating with the target lineage) plus a steps cooldown so
 * it stays tied to walking. The offspring inherits shiny if either parent was. */
export const BREED_COOLDOWN_STEPS = 6000;
export function breedCost(offspringLineage) { return 30 + Math.max(1, offspringLineage) * 30; }
// pure: the offspring instance from two parents (iid supplied by the caller)
export function breedOffspring(a, b, offspringSp, iid) {
  const lineage = Math.max(a.lineage || 0, b.lineage || 0) + 1;
  return { iid, sp: offspringSp, lineage, shiny: !!(a.shiny || b.shiny), hatchedAtSteps: 0 };
}

// Live status for the breeding UI (dust, cooldown, whether you have >=2 pets).
export async function breedStatus() {
  const [list, dust, lifetime, credit] = await Promise.all([
    petInstances(), boneDust(), lifetimeStepsSum(), kvGet('petBreedCredit', null),
  ]);
  const walkedSince = credit == null ? BREED_COOLDOWN_STEPS : Math.max(0, lifetime - credit);
  const cooldownLeft = Math.max(0, BREED_COOLDOWN_STEPS - walkedSince);
  return { total: list.length, dust, cooldownLeft, ready: cooldownLeft <= 0 };
}

// Breed two instances by iid. offspringSp must be one of the two parents' species.
export async function breedPets(iidA, iidB, offspringSp) {
  if (!iidA || !iidB || iidA === iidB) return { ok: false, reason: 'pick-two' };
  let list = await petInstances();
  const a = list.find(x => x.iid === iidA);
  const b = list.find(x => x.iid === iidB);
  if (!a || !b) return { ok: false, reason: 'gone' };
  if (offspringSp !== a.sp && offspringSp !== b.sp) return { ok: false, reason: 'bad-species' };
  const lifetime = await lifetimeStepsSum();
  const credit = await kvGet('petBreedCredit', null);
  if (credit != null && lifetime - credit < BREED_COOLDOWN_STEPS) {
    return { ok: false, reason: 'cooldown', stepsLeft: BREED_COOLDOWN_STEPS - (lifetime - credit) };
  }
  const offLineage = Math.max(a.lineage || 0, b.lineage || 0) + 1;
  const cost = breedCost(offLineage);
  if ((await boneDust()) < cost) return { ok: false, reason: 'dust', cost };
  // consume both parents, add the offspring
  const off = breedOffspring(a, b, offspringSp, newIid(offspringSp));
  const wasEquipped = (await kvGet('petEquipped', null));
  const parentEquipped = wasEquipped === iidA || wasEquipped === iidB;
  list = removeInstance(list, iidA).instances;
  list = removeInstance(list, iidB).instances;
  list = addInstance(list, off);
  await savePetInstances(list);
  await boneDustAdd(-cost);
  await kvSet('petBreedCredit', lifetime);
  // offspring inherits the higher parent's level so breeding never loses progress
  const bank = await petLevelBank();
  off._startSteps = Math.max(bank[iidA] || 0, bank[iidB] || 0);
  bank[off.iid] = off._startSteps;
  delete bank[iidA]; delete bank[iidB];
  await kvSet('petLvlSteps', bank);
  // if you bred away the pet you had out, the offspring takes its place
  if (parentEquipped) { await kvSet('petEquipped', off.iid); await equip('C', off.sp); }
  // any parent species now extinct: drop ownership + clear legacy anchor
  for (const sp of [a.sp, b.sp]) {
    if (speciesCount(list, sp) === 0) {
      const inv = await db.all('inv');
      const row = inv.find(r => r.kind === 'cos' && r.itemId === sp);
      if (row) await db.del('inv', row.id);
      const eqp = await equipped({ raw: true });
      if (eqp.C === sp && off.sp !== sp) await equip('C', off.sp);
      const petsRec = (await kvGet('pets', {})) || {}; delete petsRec[sp]; await kvSet('pets', petsRec);
    }
  }
  return { ok: true, offspring: off, cost };
}

let _iidSeq = 0;
function newIid(sp) { _iidSeq += 1; return `p${Date.now().toString(36)}-${_iidSeq}-${sp}`; }

// Read the instance list, migrating on first access (additive: never touches the
// legacy `pets`/`inv` state, so a rollback to a pre-v126 build still works).
export async function petInstances() {
  let list = await kvGet('petInst', null);
  if (Array.isArray(list)) return list;
  const owned = await ownedCosmeticIds();
  const ownedPets = [...owned].filter(id => (BH_BY_ID[id] || {}).slot === 'C');
  const petsRec = (await kvGet('pets', {})) || {};
  list = migrateInstances(ownedPets, petsRec);
  await kvSet('petInst', list);
  return list;
}
async function savePetInstances(list) { await kvSet('petInst', list); }

// Add one instance of a species (a fresh hatch/dupe). Keeps the `inv` ownership
// flag + legacy `pets` anchor in sync so species-keyed code keeps working.
export async function addPetInstance(sp, { shiny = false, hatchedAtSteps = null, startLevelSteps = 0 } = {}) {
  const list = await petInstances();
  const anchor = hatchedAtSteps == null ? await lifetimeStepsSum() : hatchedAtSteps;
  const inst = { iid: newIid(sp), sp, lineage: 0, shiny: !!shiny, hatchedAtSteps: anchor };
  await savePetInstances(addInstance(list, inst));
  await grantCosmetic(sp, 'hatch');                 // idempotent ownership flag
  const petsRec = (await kvGet('pets', {})) || {};
  if (!petsRec[sp]) { petsRec[sp] = { hatchedAtSteps: anchor }; }
  if (shiny) petsRec[sp].shiny = true;
  await kvSet('pets', petsRec);
  // seed this individual's level bank (a fresh hatch starts at level 1)
  const bank = await petLevelBank();
  bank[inst.iid] = Math.max(0, startLevelSteps || 0);
  await kvSet('petLvlSteps', bank);
  return inst;
}

// Destroy ONE specific pet instance for Bone Dust (the Stable's "Destroy"). Drops
// ownership + clears the legacy anchor when its species' last copy is gone, and
// re-points the equipped pet if you just scrapped the one you had out.
export async function salvageInstance(iid) {
  const list = await petInstances();
  const inst = list.find(x => x.iid === iid);
  if (!inst) return { ok: false, reason: 'gone' };
  const item = BH_BY_ID[inst.sp] || {};
  const next = list.filter(x => x.iid !== iid);
  await savePetInstances(next);
  const bank = await petLevelBank(); delete bank[iid]; await kvSet('petLvlSteps', bank);
  if ((await kvGet('petEquipped', null)) === iid) {
    const repl = bestInstance(next, inst.sp) || next[0] || null;
    await kvSet('petEquipped', repl ? repl.iid : null);
    if (repl) await equip('C', repl.sp); else await equip('C', null);
  }
  if (speciesCount(next, inst.sp) === 0) {
    const inv = await db.all('inv');
    const row = inv.find(r => r.kind === 'cos' && r.itemId === inst.sp);
    if (row) await db.del('inv', row.id);
    const petsRec = (await kvGet('pets', {})) || {}; delete petsRec[inst.sp]; await kvSet('pets', petsRec);
  }
  const dust = petDustValue(item) + (inst.shiny ? 15 : 0) + (inst.lineage || 0) * 8;
  await boneDustAdd(dust);
  return { ok: true, dust, name: item.name, remaining: speciesCount(next, inst.sp) };
}

// Is an owned pet the shiny variant? (any instance of the species is shiny)
export async function isPetShiny(petId) {
  return (await petInstances()).some(x => x.sp === petId && x.shiny);
}
export async function shinyPetIds() {
  return [...new Set((await petInstances()).filter(x => x.shiny).map(x => x.sp))];
}
// The lineage of the instance the game fights with for a species (best copy).
export async function bestPetLineage(petId) {
  const b = bestInstance(await petInstances(), petId);
  return b ? (b.lineage || 0) : 0;
}
// How many copies of each species you hold (backpack shows this).
export async function petCounts() {
  const counts = {};
  for (const x of await petInstances()) counts[x.sp] = (counts[x.sp] || 0) + 1;
  return counts;
}

// The steps a pet has walked since it hatched (drives its battle level).
// Grant a pet directly (petId, or 'random' for a random unowned one), anchoring
// its battle level to now. Returns the granted item, or null if already owned /
// no fresh pets. Shared by hatching and code redemption.
export async function grantPet(petId, source = 'code') {
  const owned = await ownedCosmeticIds();
  // EXCLUSIVE pets (the Founder's / Day One Lizard) are awarded by name only. This
  // filter was missing here while hatchEgg has always had it, so a 'random' grant
  // could hand out a pet that is supposed to be unobtainable, permanently
  // devaluing it for everyone who was actually given one.
  const pets = BH_ITEMS.filter(i => i.slot === 'C' && !i.exclusive);
  let pick;
  if (petId === 'random') {
    const fresh = pets.filter(i => !owned.has(i.id));
    const poolAll = fresh.length ? fresh : pets;   // own them all -> a stacking dupe
    const pool = poolAll.filter(i => i.rarity !== 'common');
    pick = (pool.length ? pool : poolAll)[Math.floor(rng() * (pool.length ? pool.length : poolAll.length))];
  } else {
    pick = BH_BY_ID[petId];
    if (!pick || pick.slot !== 'C') return null;   // owning it already is fine now (dupes stack)
  }
  await addPetInstance(pick.id, {});
  // Put it on the player's shoulder if that slot is empty. Granting a pet used to
  // only file it in the Stable, so claiming the Day One Lizard showed a big
  // celebration and then nothing on the home screen. Never overrides a companion
  // the player already chose.
  try {
    const eq = await equipped({ raw: true });
    if (!eq.C) await equip('C', pick.id);
  } catch { /* the pet is granted either way; equipping is a courtesy */ }
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

/* ---- v130: BANKED per-INSTANCE leveling + instance equip. Each individual pet
 * (not species) levels on its own; only the equipped INSTANCE earns the steps you
 * walk, so you pick exactly which pet to invest in. `petLvlSteps` is keyed by iid
 * (petLvlV=2); `petEquipped` holds the equipped instance's iid; `petStepCredit` is
 * the lifetime-steps checkpoint. ---- */

// pure: add a step delta to one key's bank (used by the crediting flow + tests)
export function creditSteps(bank, key, delta) {
  const out = { ...(bank || {}) };
  if (key && delta > 0) out[key] = (out[key] || 0) + delta;
  return out;
}

// The per-INSTANCE banked-step map (keyed by iid). Migrates losslessly from the
// v127 per-species map (each instance inherits its species' level) or, failing
// that, from hatch anchors — so no pet loses its current level. Sets the credit
// checkpoint so past steps aren't retroactively dumped onto the equipped pet.
export async function petLevelBank() {
  const ver = await kvGet('petLvlV', 0);
  let bank = await kvGet('petLvlSteps', null);
  if (bank && ver >= 2) return bank;
  const insts = await petInstances();
  const lifetime = await lifetimeStepsSum();
  const next = {};
  if (bank && ver < 2) {
    // v127 species-keyed -> iid-keyed: every copy inherits its species' banked level
    for (const x of insts) next[x.iid] = Math.max(0, bank[x.sp] || 0);
  } else {
    // pre-bank / fresh: seed each instance from its hatch anchor (preserves level)
    for (const x of insts) next[x.iid] = Math.max(0, lifetime - (x.hatchedAtSteps || 0));
  }
  await kvSet('petLvlSteps', next);
  await kvSet('petLvlV', 2);
  if ((await kvGet('petStepCredit', null)) == null) await kvSet('petStepCredit', lifetime);
  return next;
}

// The equipped instance's iid (the battle pet). Migrates from the old species-slot
// equip (equipped.C) by picking the best instance of that species.
export async function equippedPetIid() {
  let iid = await kvGet('petEquipped', null);
  const insts = await petInstances();
  if (iid && insts.some(x => x.iid === iid)) return iid;
  // migrate / repair: fall back to the old paper-doll species, else the best pet owned
  const oldSp = (await equipped({ raw: true })).C;
  const target = (oldSp && bestInstance(insts, oldSp)) || bestInstance(insts, insts[0] && insts[0].sp) || insts[0] || null;
  iid = target ? target.iid : null;
  await kvSet('petEquipped', iid);
  return iid;
}
export async function setEquippedPet(iid) {
  const insts = await petInstances();
  const inst = insts.find(x => x.iid === iid);
  if (!inst) return null;
  await kvSet('petEquipped', iid);
  // keep the legacy paper-doll slot pointed at the species so any species-keyed
  // render (home companion) still resolves the right art
  await equip('C', inst.sp);
  return inst;
}
export async function equippedPetInstance() {
  const iid = await equippedPetIid();
  return (await petInstances()).find(x => x.iid === iid) || null;
}

// Credit steps walked since the last checkpoint to the equipped INSTANCE only.
// Idempotent: advancing the checkpoint means a second call adds nothing.
export async function creditEquippedPetSteps() {
  await petLevelBank(); // ensure migrated + checkpoint set
  const lifetime = await lifetimeStepsSum();
  const credit = await kvGet('petStepCredit', lifetime);
  const delta = Math.max(0, lifetime - credit);
  await kvSet('petStepCredit', lifetime);
  const iid = await equippedPetIid();
  if (delta > 0 && iid) {
    const bank = creditSteps(await petLevelBank(), iid, delta);
    await kvSet('petLvlSteps', bank);
  }
  return { delta, credited: delta > 0 ? iid : null };
}

// Steps banked toward THIS instance's level. Only grows while it is equipped.
export async function petStepsForIid(iid) {
  const bank = await petLevelBank();
  return Math.max(0, bank[iid] || 0);
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

// Spend one consumable of `type` (removes the oldest inv row). Returns true if
// one was consumed. The caller applies the effect (e.g. addVigor for a Draught).
export async function consumeConsumable(type) {
  const row = (await inventory()).filter(r => r.kind === type).sort((a, b) => a.ts - b.ts)[0];
  if (!row) return false;
  await db.del('inv', row.id);
  return true;
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
      // v153: Streak Freeze was half of every consumable drop and nobody used them
      // all. Battle Charm + Vigor Draught (the
      // items people actually spend) fill the rest.
      const pool = ['xp2', 'vigor'];
      const type = pool[Math.floor(rng() * pool.length)];
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
  if (c < s.cost) return { ok: false, reason: 'coins', need: s.cost, have: c };
  await coinsAdd(-s.cost);
  if (shopId === 'crate-daily') await grantCrate('daily', 'shop');
  else if (shopId === 'crate-golden') await grantCrate('golden', 'shop');
  else await grantConsumable(shopId, 'shop');
  // Report WHAT was bought, what it cost, the new balance and how many you now
  // hold. The old bare {ok:true} left the UI with nothing to say beyond
  // "Purchased", which reads as a no-op when you tap twice, so people kept
  // tapping and drained their coins without ever seeing a purchase land.
  const owned = shopId.startsWith('crate-') ? (await unopenedCrates()).length : await consumableCount(shopId);
  return { ok: true, label: s.label, cost: s.cost, coins: await coins(), owned };
}

/* ---------- weapons (bought with coins, one-each) ---------- */
// Bonecrusher is the Champion's prize, not for sale. The rest reward a spec.
// The Bone Merchant's tiered stock (v71) is a deliberate gold sink: the endgame
// pieces cost thousands, so weapons are a long-term goal, not a quick clear.
export const WEAPON_COST = {
  rapier: 500, shivs: 500, scepter: 900,
  wand: 700, cleaver: 1500, crook: 1600,   // entry / mid tier
  maul: 3400, lichfocus: 3400, censer: 3200, // legendary gold sinks
  // tier-4 prestige (v145): dual-currency sinks — coins AND Bone Dust. Objects,
  // not numbers, so the buy flow spends salvage too. weaponCoinCost() flattens
  // either shape when only the coin figure is needed.
  warmaul: { coins: 6000, dust: 350 },
  voidstar: { coins: 6000, dust: 350 },
  reliquary: { coins: 5600, dust: 330 },
};

// A cost entry is either a plain coin number or a {coins, dust} object. These
// two helpers read whichever shape without the callers caring.
export function weaponCoinCost(id) { const c = WEAPON_COST[id]; return c == null ? null : (typeof c === 'number' ? c : c.coins); }
export function weaponDustCost(id) { const c = WEAPON_COST[id]; return (c && typeof c === 'object') ? (c.dust || 0) : 0; }

export async function ownedWeaponIds() {
  const inv = await db.all('inv');
  return new Set(['starter', ...inv.filter(r => r.kind === 'weapon').map(r => r.weaponId)]);
}

export async function buyWeapon(weaponId) {
  const coinCost = weaponCoinCost(weaponId);
  if (coinCost == null) return { ok: false, reason: 'not-for-sale' };
  const dustCost = weaponDustCost(weaponId);
  const owned = await ownedWeaponIds();
  if (owned.has(weaponId)) return { ok: false, reason: 'owned' };
  const bal = await coins();
  if (bal < coinCost) return { ok: false, reason: 'coins', need: coinCost, have: bal };
  if (dustCost) {
    const dbal = await boneDust();
    if (dbal < dustCost) return { ok: false, reason: 'dust', need: dustCost, have: dbal };
  }
  await coinsAdd(-coinCost);
  if (dustCost) await boneDustAdd(-dustCost);
  await db.put('inv', { id: newId(), kind: 'weapon', weaponId, source: 'shop', ts: Date.now() });
  return { ok: true, weaponId, cost: coinCost, dust: dustCost };
}

/* ---------- Transmog (v221): wear the stats, keep the look ----------
   Statted gear used to force its own art on you: equipGear writes the look too,
   and picking a plain cosmetic dropped the stats. So liking a piece cost you
   power. Transmog splits the two: your gear keeps its stats, the slot shows a
   look you have collected.

   Three rules keep this honest and surprise-free:
   1. COLLECTION IS FOREVER. Seeing a piece once unlocks its look permanently,
      even after you melt it. `looks` is append-only and read unions it with what
      you currently own, so pre-v221 saves are grandfathered on first read with
      no migration and nobody can lose a look they already had.
   2. THE OVERRIDE ONLY APPLIES OVER GEAR. If you deliberately equip a plain
      cosmetic in a slot, the look you picked is the look you get. No hidden
      override fighting your choice.
   3. IT IS PER SLOT, NOT PER ITEM. WoW makes you re-apply on every upgrade;
      here your look sticks as the gear underneath it changes. */
export const TRANSMOG_HIDE = '__hide';
// Priced off the LOOK's rarity, in Bone Dust (melting a piece is how you fund
// wearing it). Reverting to the gear's own look, and hiding a slot, are free.
const TRANSMOG_COST = { common: 6, uncommon: 12, rare: 25, epic: 60, legendary: 60 };
export function transmogCost(artId) {
  if (!artId || artId === TRANSMOG_HIDE) return 0;
  const art = BH_BY_ID[artId];
  return art ? (TRANSMOG_COST[art.rarity] ?? 12) : 0;
}

export async function collectedLooks() {
  const out = new Set((await kvGet('looks', [])) || []);
  for (const id of await ownedCosmeticIds()) out.add(id);
  for (const gid of await ownedGearIds()) { const g = GEAR_BY_ID[gid]; if (g) out.add(g.artId); }
  return out;
}
export async function collectLook(artId) {
  if (!artId) return;
  const stored = (await kvGet('looks', [])) || [];
  if (stored.includes(artId)) return;
  stored.push(artId);
  await kvSet('looks', stored);
}

export async function transmogMap() { return (await kvGet('transmog', {})) || {}; }

/* You pay for a (slot, look) pair ONCE. After that, wearing it again in that
   slot is free forever. That is what makes saved fits swappable without a tax,
   and it retires the v221 trap where flip-flopping between two looks charged
   you every single time. Read seeds itself from whatever you are currently
   wearing, so anyone who paid under v221 keeps what they bought. */
const paidKey = (slot, artId) => `${slot}:${artId}`;
export async function paidLooks() {
  const stored = (await kvGet('paidlooks', [])) || [];
  const set = new Set(stored);
  // Grandfather anything worn under v221, when nothing recorded the purchase.
  // This WRITES on read, deliberately: seeding from the live transmog map alone
  // is not durable, because clearing the slot would erase the only evidence and
  // charge the player a second time for a look they already bought.
  const add = [];
  for (const [slot, artId] of Object.entries(await transmogMap())) {
    const k = paidKey(slot, artId);
    if (artId !== TRANSMOG_HIDE && !set.has(k)) { set.add(k); add.push(k); }
  }
  if (add.length) await kvSet('paidlooks', [...stored, ...add]);
  return set;
}
async function markPaid(slot, artId) {
  const list = (await kvGet('paidlooks', [])) || [];
  const k = paidKey(slot, artId);
  if (!list.includes(k)) { list.push(k); await kvSet('paidlooks', list); }
}
// What this slot change would cost right now (0 if free or already bought).
export async function transmogPrice(slot, artId) {
  if (!artId || artId === TRANSMOG_HIDE) return 0;
  const tm = await transmogMap();
  if (tm[slot] === artId) return 0;
  return (await paidLooks()).has(paidKey(slot, artId)) ? 0 : transmogCost(artId);
}

export async function applyTransmog(slot, artId) {
  if (!GEAR_SLOTS.includes(slot)) return { ok: false, reason: 'slot' };
  if (artId == null || artId === '') return clearTransmog(slot);
  if (artId !== TRANSMOG_HIDE) {
    const art = BH_BY_ID[artId];
    if (!art || art.slot !== slot) return { ok: false, reason: 'slot' };
    if (!(await collectedLooks()).has(artId)) return { ok: false, reason: 'not-collected' };
  }
  const tm = await transmogMap();
  if (tm[slot] === artId) {
    if (artId !== TRANSMOG_HIDE) await markPaid(slot, artId); // banked, not just worn
    return { ok: true, cost: 0, already: true };
  }
  const cost = await transmogPrice(slot, artId);
  if (cost > 0) {
    const bal = await boneDust();
    if (bal < cost) return { ok: false, reason: 'dust', need: cost, have: bal };
    await boneDustAdd(-cost);
  }
  if (artId !== TRANSMOG_HIDE) await markPaid(slot, artId);
  tm[slot] = artId;
  await kvSet('transmog', tm);
  return { ok: true, cost };
}

export async function clearTransmog(slot) {
  const tm = await transmogMap();
  if (!(slot in tm)) return { ok: true, cost: 0 };
  delete tm[slot];
  await kvSet('transmog', tm);
  return { ok: true, cost: 0 };
}

/* ---------- Saved fits (v222) ----------
   A fit is a LOOK, never stats: you re-gear constantly chasing numbers and your
   outfit should survive that. Two halves, because they mean different things:
   `tm` is the transmog overrides (a gear slot missing from tm means "show
   whatever the gear itself looks like", which is not the same as pinning that
   art), and `cos` is the plain cosmetics on non-gear slots. Pets are excluded:
   the Stable owns that slot now. */
export const MAX_FITS = 6;
export const FIT_COSMETIC_SLOTS = BH_SLOTS
  .map(s => s.code)
  .filter(c => !GEAR_SLOTS.includes(c) && c !== 'C');

export async function fits() { return (await kvGet('outfits', [])) || []; }

export async function captureFit(name) {
  const list = await fits();
  if (list.length >= MAX_FITS) return { ok: false, reason: 'full', max: MAX_FITS };
  const tm = { ...(await transmogMap()) };
  const eq = await equipped({ raw: true });
  const cos = {};
  for (const s of FIT_COSMETIC_SLOTS) if (eq[s]) cos[s] = eq[s];
  const fit = { id: newId(), name: (name || `Fit ${list.length + 1}`).slice(0, 18), tm, cos, ts: Date.now() };
  await kvSet('outfits', [...list, fit]);
  return { ok: true, fit };
}

// Total dust to wear this fit right now: only the looks you have never bought.
export async function fitPrice(fit) {
  if (!fit) return 0;
  let sum = 0;
  for (const [slot, artId] of Object.entries(fit.tm || {})) sum += await transmogPrice(slot, artId);
  return sum;
}

export async function applyFit(id) {
  const fit = (await fits()).find(f => f.id === id);
  if (!fit) return { ok: false, reason: 'missing' };
  const cost = await fitPrice(fit);
  const bal = await boneDust();
  if (cost > bal) return { ok: false, reason: 'dust', need: cost, have: bal };
  // gear slots: the fit's tm replaces the whole map, so a slot the fit does not
  // mention goes back to its gear's own look rather than keeping a stale override
  for (const slot of GEAR_SLOTS) {
    const want = (fit.tm || {})[slot];
    if (want == null) await clearTransmog(slot);
    else await applyTransmog(slot, want);
  }
  // cosmetics: skip anything no longer owned rather than throwing
  const owned = await ownedCosmeticIds();
  for (const [slot, itemId] of Object.entries(fit.cos || {})) {
    if (owned.has(itemId)) await equip(slot, itemId, { keepGear: true });
  }
  return { ok: true, cost, name: fit.name };
}

export async function renameFit(id, name) {
  const list = await fits();
  const f = list.find(x => x.id === id);
  if (!f) return { ok: false };
  f.name = (name || f.name).slice(0, 18);
  await kvSet('outfits', list);
  return { ok: true };
}

export async function deleteFit(id) {
  await kvSet('outfits', (await fits()).filter(f => f.id !== id));
  return { ok: true };
}

// The piece that best identifies a fit at chip size: whatever it deliberately
// changed, most-visible slot first.
export function fitThumbArt(fit) {
  if (!fit) return null;
  for (const s of ['H', 'SK', 'T', 'IR', 'M', 'E', 'G', 'IL', 'P', 'FW', 'B']) {
    const v = (fit.tm || {})[s];
    if (v && v !== TRANSMOG_HIDE && BH_BY_ID[v]) return BH_BY_ID[v];
  }
  for (const s of ['SK', 'B', 'BG']) {
    const v = (fit.cos || {})[s];
    if (v && BH_BY_ID[v]) return BH_BY_ID[v];
  }
  return null;
}

/* ---------- equipped ----------
   Returns the LOOK by default: every render path (home hero, Pit, map marker,
   splash, level-up card, friends' Crew card) already funnels through here, so
   resolving transmog once means they all show it with no extra plumbing.
   `{ raw: true }` returns the true equipment. Anything that WRITES equipment
   back, or reasons about what you actually own, must use raw or it would bake
   a transmog into the real save. */
export async function equipped({ raw = false } = {}) {
  const base = {};
  for (const s of BH_SLOTS) if (s.default) base[s.code] = s.default;
  const saved = await kvGet('equipped', {});
  const eq = { ...base, ...saved };
  if (raw) return eq;
  const tm = (await kvGet('transmog', {})) || {};
  const slots = Object.keys(tm);
  if (!slots.length) return eq;
  const lo = await gearLoadout();
  for (const slot of slots) {
    if (!lo[slot]) continue;                       // rule 2: only overrides gear
    if (tm[slot] === TRANSMOG_HIDE) delete eq[slot];
    else if (BH_BY_ID[tm[slot]]) eq[slot] = tm[slot];
  }
  return eq;
}

export async function equip(slot, itemId, { keepGear = false } = {}) {
  const eq = await equipped({ raw: true });
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
  const eq = await equipped({ raw: true });
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

/* Streak Freezes were retired in v253: nobody used them, and an item that
   silently forgives a missed day muddied what a streak even means. Holders were
   paid out at 100 coins each (see refundStreakFreezes). Deliberately not
   replaced: do not re-add a "protect a day" consumable without a real reason. */

/* One-time payout: 100 coins per Streak Freeze still in the backpack. Idempotent
   via a kv flag AND by deleting the rows it pays for, so a double run cannot
   double-pay. Coins are added BEFORE the rows are deleted: if the write dies
   halfway, a player keeps an unusable item rather than losing coins they earned. */
export async function refundStreakFreezes() {
  if (await kvGet('freeze-refunded', false)) return null;
  const rows = (await inventory()).filter(r => r.kind === 'freeze');
  if (!rows.length) { await kvSet('freeze-refunded', true); return null; }
  const coins = rows.length * 100;
  await coinsAdd(coins);
  for (const r of rows) await db.del('inv', r.id);
  await kvSet('freeze-refunded', true);
  return { count: rows.length, coins };
}
