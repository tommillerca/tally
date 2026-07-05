// Gear: statted equipment for Head (H), Chest (T), and Weapon (IR) slots.
// Every gear item SHARES an existing cosmetic's art (no new illustration):
// the catalog deterministically derives 2 statted variants per art piece, each
// keyed to a talent archetype, so "the same look" can drop with different
// stats and rarities. Higher rarity = bigger stat budget; rarer gear is
// level-gated. Plain cosmetics stay stat-free.
import { BH_ITEMS } from '../data/boneheadz.js';
import { TALENT_TREES } from './pit.js';

// Every WEARABLE slot carries gear now, weighted by impact: a chest piece
// rolls more stat points than socks. Scene slots (Background, Yard) and Pets
// stay pure cosmetics. FOUR gear tiers: common is plain armor (no stats);
// uncommon/rare/legendary add stats, and the top tiers can carry a talent.
// Only these slots carry stats (Tom's call): weapon, off-hand, chest, kicks,
// undies, socks. Everything else (hats, skulls, eyes, pets, scenes) is pure look.
export const GEAR_SLOTS = ['IR', 'IL', 'T', 'FW', 'U', 'S'];
export const GEAR_SLOT_LABELS = {
  IR: 'Weapon', IL: 'Off-hand', T: 'Chest', FW: 'Kicks', U: 'Undies', S: 'Socks',
};
// impact weights: main gear > kicks > underthings
export const SLOT_WEIGHT = { T: 1.0, IR: 1.0, IL: 0.7, FW: 0.6, U: 0.35, S: 0.3 };

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

// FOUR gear tiers (cosmetic rarities stay 5-tier; gear maps into these).
export const GEAR_TIERS = ['common', 'uncommon', 'rare', 'legendary'];
export const GEAR_BUDGET = { uncommon: 6, rare: 11, legendary: 18 };  // x slot weight
export const GEAR_MIN_LEVEL = { common: 1, uncommon: 3, rare: 8, legendary: 14 };

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function statSplit(arch, tier, slot) {
  const budget = Math.max(1, Math.round(GEAR_BUDGET[tier] * (SLOT_WEIGHT[slot] || 0.5)));
  const [a, b] = GEAR_ARCHETYPES[arch].stats;
  const primary = Math.ceil(budget * 0.6);
  const out = { [a]: primary };
  if (budget - primary > 0) out[b] = budget - primary;
  return out;
}

// art rarity (5-tier) -> gear tier (4-tier)
function tierOfArt(r) {
  if (r === 'legendary' || r === 'epic') return 'legendary';
  if (r === 'rare') return 'rare';
  return 'uncommon';
}
function bumpTier(t) {
  return GEAR_TIERS[Math.min(GEAR_TIERS.length - 1, GEAR_TIERS.indexOf(t) + 1)];
}

const TREE_BY_ID = Object.fromEntries(TALENT_TREES.map(t => [t.id, t]));

function variant(art, arch, tier) {
  const g = {
    id: `g-${art.id}-${arch}`,
    artId: art.id,
    slot: art.slot,
    arch,
    rarity: tier,
    minLevel: GEAR_MIN_LEVEL[tier],
    stats: statSplit(arch, tier, art.slot),
    name: `${GEAR_ARCHETYPES[arch].epithet} ${art.name}`,
  };
  // Diablo-style affix: legendary always carries a talent from its archetype's
  // tree; rares roll one about half the time (tiers 1-3: capstones stay earned).
  const affixRoll = hashStr('affix:' + art.id + ':' + arch);
  if (tier === 'legendary' || (tier === 'rare' && affixRoll % 2 === 0)) {
    const nodes = (TREE_BY_ID[arch]?.nodes || []).filter(n => n.tier <= 3);
    if (nodes.length) {
      const pick = nodes[affixRoll % nodes.length];
      g.talent = pick.id;
      g.talentName = pick.name;
    }
  }
  return g;
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
    const t1 = tierOfArt(art.rarity);
    out.push(variant(art, a1, t1));
    out.push(variant(art, a2, bumpTier(t1)));
  }
  return out;
})();
export const GEAR_BY_ID = Object.fromEntries(GEAR_ITEMS.map(g => [g.id, g]));

export function gearLabel(g) {
  const KEY = { power: 'POW', marrow: 'MAR', wind: 'STA', reflex: 'RFX', hype: 'HYP' };
  return Object.entries(g.stats).map(([k, v]) => `+${v} ${KEY[k]}`).join(' · ');
}

// Sum equipped gear bonuses. Only owned pieces count, and only at level.
// Talents granted by equipped gear (validated like stats).
export function gearTalents(loadout = {}, ownedGearIds = new Set(), level = 1) {
  const out = [];
  for (const slot of GEAR_SLOTS) {
    const g = GEAR_BY_ID[loadout[slot]];
    if (!g || g.slot !== slot || !g.talent) continue;
    if (!ownedGearIds.has(g.id) || level < g.minLevel) continue;
    out.push(g.talent);
  }
  return out;
}

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

// TIER SETS (WoW-style): wear matching-archetype gear for a bonus at 2 and 4
// pieces. 2pc = a stat bundle; 4pc = more stats + the archetype's signature
// tier-1 talent (a move / +AP / hype engine), so a 4-set always does something.
export const SET_BONUSES = {
  slab:        { two: { power: 6, marrow: 6 }, fourStat: { power: 6 },  fourTalent: 'heavyhands' },
  greyhound:   { two: { wind: 6, reflex: 6 },  fourStat: { reflex: 6 }, fourTalent: 'lightfeet' },
  ringmaster:  { two: { hype: 8 },             fourStat: { hype: 6 },   fourTalent: 'crowdwork' },
  gravecaller: { two: { hype: 6, power: 6 },    fourStat: { hype: 6 },   fourTalent: 'bonebolt' },
  gravewarden: { two: { marrow: 8 },           fourStat: { marrow: 6 }, fourTalent: 'smite' },
  boneshaman:  { two: { reflex: 6, hype: 6 },   fourStat: { hype: 6 },   fourTalent: 'frostbolt' },
};
const TALENT_NAME = Object.fromEntries(TALENT_TREES.flatMap(t => t.nodes.map(n => [n.id, n.name])));
const STAT_ABBR = { power: 'POW', marrow: 'MAR', wind: 'STA', reflex: 'RFX', hype: 'HYP' };
function statBundle(o) { return Object.entries(o).map(([k, v]) => `+${v} ${STAT_ABBR[k]}`).join(' '); }
export function setBonusLabel(arch, tier) {
  const b = SET_BONUSES[arch]; if (!b) return '';
  if (tier === 2) return statBundle(b.two);
  return `${statBundle(b.fourStat || {})} · ${TALENT_NAME[b.fourTalent] || b.fourTalent}`;
}

// Worn gear also grants ARMOR points on top of the base (Marrow/Reflex) armor.
// Heavy/melee archetypes plate you against physical hits; caster archetypes ward
// you against spells, so your gear choice answers "what am I about to face".
const ARMOR_PTS = { common: 4, uncommon: 8, rare: 14, legendary: 22 };
const SPELL_ARCH = new Set(['gravecaller', 'gravewarden', 'boneshaman']); // casters -> spell armor
export function gearArmor(loadout = {}, ownedGearIds = new Set(), level = 1) {
  let armor = 0, spellArmor = 0;
  for (const slot of GEAR_SLOTS) {
    const g = GEAR_BY_ID[loadout[slot]];
    if (!g || g.slot !== slot || !ownedGearIds.has(g.id) || level < g.minLevel) continue;
    const pts = Math.round((ARMOR_PTS[g.rarity] || 0) * (SLOT_WEIGHT[slot] || 0.5));
    if (SPELL_ARCH.has(g.arch)) spellArmor += pts; else armor += pts;
  }
  return { armor, spellArmor };
}

// Count equipped/owned/at-level pieces per archetype and total the set bonuses.
export function gearSetInfo(loadout = {}, ownedGearIds = new Set(), level = 1) {
  const counts = {};
  for (const slot of GEAR_SLOTS) {
    const g = GEAR_BY_ID[loadout[slot]];
    if (!g || g.slot !== slot || !ownedGearIds.has(g.id) || level < g.minLevel) continue;
    counts[g.arch] = (counts[g.arch] || 0) + 1;
  }
  const stats = { power: 0, marrow: 0, wind: 0, reflex: 0, hype: 0 };
  const talents = [];
  const sets = [];
  for (const [arch, n] of Object.entries(counts)) {
    const b = SET_BONUSES[arch]; if (!b) continue;
    const tiers = [];
    if (n >= 2) { for (const [k, v] of Object.entries(b.two)) stats[k] += v; tiers.push(2); }
    if (n >= 4) { for (const [k, v] of Object.entries(b.fourStat || {})) stats[k] += v; if (b.fourTalent) talents.push(b.fourTalent); tiers.push(4); }
    sets.push({ arch, epithet: GEAR_ARCHETYPES[arch].epithet, pieces: n, tiers });
  }
  return { stats, talents, sets };
}
