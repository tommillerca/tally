// Gear: statted equipment for Head (H), Chest (T), and Weapon (IR) slots.
// Every gear item SHARES an existing cosmetic's art (no new illustration):
// the catalog deterministically derives 2 statted variants per art piece, each
// keyed to a talent archetype, so "the same look" can drop with different
// stats and rarities. Higher rarity = bigger stat budget; rarer gear is
// level-gated. Plain cosmetics stay stat-free.
import { BH_ITEMS } from '../data/boneheadz.js';

export const GEAR_SLOTS = ['H', 'T', 'IR'];
export const GEAR_SLOT_LABELS = { H: 'Head', T: 'Chest', IR: 'Weapon' };

// Archetypes mirror the talent trees, so gear pushes the build you spec.
export const GEAR_ARCHETYPES = {
  slab:        { epithet: "Bruiser's",      stats: ['power', 'marrow'] },
  greyhound:   { epithet: "Runner's",       stats: ['wind', 'reflex'] },
  ringmaster:  { epithet: "Showman's",      stats: ['hype', 'wind'] },
  gravecaller: { epithet: "Necromancer's",  stats: ['hype', 'power'] },
  gravewarden: { epithet: "Cleric's",       stats: ['marrow', 'hype'] },
  boneshaman:  { epithet: "Elementalist's", stats: ['reflex', 'hype'] },
};
const ARCH_KEYS = Object.keys(GEAR_ARCHETYPES);

// Total stat points by rarity, split ~60/40 across the archetype's two stats.
export const GEAR_BUDGET = { common: 4, uncommon: 6, rare: 9, epic: 13, legendary: 18 };
// Player level required to EQUIP (drops can arrive early and tease).
export const GEAR_MIN_LEVEL = { common: 1, uncommon: 4, rare: 8, epic: 12, legendary: 16 };
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function statSplit(arch, rarity) {
  const budget = GEAR_BUDGET[rarity];
  const [a, b] = GEAR_ARCHETYPES[arch].stats;
  const primary = Math.ceil(budget * 0.6);
  return { [a]: primary, [b]: budget - primary };
}

function bumpRarity(r) {
  return RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, RARITY_ORDER.indexOf(r) + 1)];
}

function variant(art, arch, rarity) {
  return {
    id: `g-${art.id}-${arch}`,
    artId: art.id,
    slot: art.slot,
    arch,
    rarity,
    minLevel: GEAR_MIN_LEVEL[rarity],
    stats: statSplit(arch, rarity),
    name: `${GEAR_ARCHETYPES[arch].epithet} ${art.name}`,
  };
}

// Two variants per art: one at the art's own rarity, one a tier up with a
// different archetype. Deterministic from the art id, forever.
export const GEAR_ITEMS = (() => {
  const out = [];
  for (const art of BH_ITEMS) {
    if (!GEAR_SLOTS.includes(art.slot) || art.default) continue;
    const h = hashStr('gear:' + art.id);
    const i1 = h % ARCH_KEYS.length;
    let i2 = (h >>> 3) % ARCH_KEYS.length;
    if (i2 === i1) i2 = (i2 + 1) % ARCH_KEYS.length;
    const a1 = ARCH_KEYS[i1], a2 = ARCH_KEYS[i2];
    out.push(variant(art, a1, art.rarity));
    out.push(variant(art, a2, bumpRarity(art.rarity)));
  }
  return out;
})();
export const GEAR_BY_ID = Object.fromEntries(GEAR_ITEMS.map(g => [g.id, g]));

export function gearLabel(g) {
  const KEY = { power: 'POW', marrow: 'MAR', wind: 'WND', reflex: 'RFX', hype: 'HYP' };
  return Object.entries(g.stats).map(([k, v]) => `+${v} ${KEY[k]}`).join(' · ');
}

// Sum equipped gear bonuses. Only owned pieces count, and only at level.
export function gearStats(loadout = {}, ownedGearIds = new Set(), level = 1) {
  const out = { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 };
  for (const slot of GEAR_SLOTS) {
    const g = GEAR_BY_ID[loadout[slot]];
    if (!g || g.slot !== slot) continue;
    if (!ownedGearIds.has(g.id)) continue;
    if (level < g.minLevel) continue;
    for (const [k, v] of Object.entries(g.stats)) out[k] += v;
  }
  return out;
}
