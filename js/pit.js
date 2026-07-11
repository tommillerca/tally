import { petAbilityEffect, petActionMeta } from './pets.js';

// The Pit: turn-based combat engine. Pure module (no DOM, injected RNG),
// implementing boneheadz-combat-math-spec v0.1 exactly. Every constant here
// is a spec starting value; tune via PIT_TUNING, not inline edits.
//
// Core guarantees (spec):
//   - fights resolve in ~5-7 turns
//   - effort dominates gear (PowerMult spread 1.0-2.5 > any WeaponMult)
//   - heavies are committal and UNANNOUNCED; guard on reads, not banners

/* ================= stats from real behavior ================= */
// Base stats only (V1): permanent, cumulative, never lost. 0-100.
// Fresh fighter ~20-30; consistent one ~70-90.

export function deriveStats(b) {
  const clamp = v => Math.max(0, Math.min(100, Math.round(v)));
  return {
    power: clamp(20 + (b.proteinDays || 0) * 2),                          // protein = muscle
    marrow: clamp(20 + (b.streak || 0) * 1.5 + (b.closes || 0) * 1.2),    // consistency
    wind: clamp(20 + Math.sqrt((b.lifetimeSteps || 0) / 1000) * 4),       // cardio
    reflex: clamp(20 + (b.spawns || 0) * 2 + (b.eggDays || 0) * 3),       // movement play
    hype: clamp(20 + (b.questsDone || 0) * 1 + (b.variety || 0) * 0.4),   // variety + quests
  };
}

// Each stat carries three plain-English lines so players know WHAT it does in a
// fight and WHICH build it powers (not just where it comes from). `combat` = the
// mechanical effect; `spec` = the playstyle it leans into.
export const STAT_META = [
  { key: 'power', label: 'Power', role: 'attack damage', fedBy: 'hitting your protein target',
    combat: 'Multiplies every physical hit (Jab, Swing, Haymaker) and your Signature.',
    spec: 'Bruisers who win with raw melee.' },
  { key: 'marrow', label: 'Marrow', role: 'max HP + armor', fedBy: 'streaks + closing days on budget',
    combat: 'Your HP pool, and your physical Armor (cuts incoming melee damage).',
    spec: 'Tanks and clerics who outlast the fight.' },
  { key: 'wind', label: 'Stamina', role: 'move fuel per turn', fedBy: 'steps + active burn',
    combat: 'Move fuel. Every action spends Stamina; run dry and you can only Jab or catch your breath.',
    spec: 'Fast fighters who chain lots of moves.' },
  { key: 'reflex', label: 'Reflex', role: 'crits + spell armor', fedBy: 'Boneyard collecting + step eggs',
    combat: 'More crits on your hits, hits glance off you for half, and your Spell Armor (cuts incoming magic).',
    spec: 'Duelists who win on finesse.' },
  { key: 'hype', label: 'Hype', role: 'spell power + signature', fedBy: 'quests + logging variety',
    combat: 'Powers your spells (bolts, heals) and fills your Signature meter faster.',
    spec: 'Casters and showstoppers.' },
];

// Hybrid customization: your habits set the BASE (deriveStats); training points
// earned from wellbeing-safe behavior (protein-target hits + closing days on
// budget) are spent to nudge stats up. Foes scale off your effective stats, so
// this specializes a build rather than just inflating it.
export const TRAIN_STEP = 2;       // stat points per allocated training point
export const TRAIN_CAP = 100;      // most you can add to one stat via training
export function allocatedStats(base, alloc = {}, step = TRAIN_STEP) {
  const out = {};
  for (const k of ['power', 'marrow', 'wind', 'reflex', 'hype']) {
    const bump = Math.min(TRAIN_CAP, (alloc[k] || 0) * step);
    out[k] = Math.max(0, Math.min(150, (base[k] || 0) + bump));
  }
  return out;
}

/* ================= talents (framework §7, simplified to 3-node chains) ================= */

export const TALENT_TREES = [
  {
    id: 'slab', name: 'Slab', tag: 'The Bruiser', color: 'var(--fat)',
    flavor: 'Fewer, bigger hits. Pairs with a protein habit.',
    nodes: [
      { id: 'heavyhands', tier: 1, name: 'Heavy Hands', desc: 'Haymakers hit 15% harder.' },
      { id: 'steadyhands', tier: 1, ranks: 5, name: 'Steady Hands', desc: '+1% hit chance per rank on Swings, Haymakers and Titan.' },
      { id: 'marrowlust', tier: 2, name: 'Marrowlust', desc: 'Haymaker and Titan hits heal you for 25% of the damage dealt.' },
      { id: 'bonebreaker', tier: 2, name: 'Bonebreaker', desc: 'Landed haymakers SUNDER: the enemy takes +15% damage for 2 turns.' },
      { id: 'densebones', tier: 2, ranks: 5, name: 'Dense Bones', desc: '+6 max HP per rank.' },
      { id: 'followthrough', tier: 2, ranks: 3, name: 'Follow-Through', desc: 'Swings and Haymakers hit 4% harder per rank.' },
      { id: 'concussive', tier: 3, name: 'Concussive', desc: 'Landed haymakers always stagger (enemy loses an action).' },
      { id: 'thickskull', tier: 3, name: 'Thick Skull', desc: '+45 max HP.' },
      { id: 'ironjaw', tier: 3, ranks: 3, name: 'Iron Jaw', desc: '+4 Armor per rank (blunts incoming melee).' },
      { id: 'rage', tier: 3, name: 'Blood Rage', move: true, desc: 'NEW MOVE: fly into a RAGE for 3 turns. You deal +35% damage but bleed 6 HP at the start of each of your turns (never below 1). You glow red.' },
      { id: 'titan', tier: 4, name: 'Titan', move: true, desc: 'NEW MOVE: once per fight, a devastating overhead slam.' },
    ],
  },
  {
    id: 'greyhound', name: 'Greyhound', tag: 'The Runner', color: 'var(--protein)',
    flavor: 'Speed, bleed, and attrition. Pairs with a walking habit.',
    nodes: [
      { id: 'lightfeet', tier: 1, name: 'Light Feet', desc: '+1 action point every turn.' },
      { id: 'footwork', tier: 1, ranks: 5, name: 'Footwork', desc: '+1% glance chance per rank (more hits skim off you for half).' },
      { id: 'counterstep', tier: 2, name: 'Counterstep', desc: 'When an enemy attack misses you, you snap back with a free counter-jab.' },
      { id: 'kite', tier: 2, name: 'Kite', desc: 'Hit-and-run: your Jabs also sap 8 enemy Stamina.' },
      { id: 'sharpjabs', tier: 2, ranks: 5, name: 'Sharp Jabs', desc: 'Jabs and Throws hit 4% harder per rank.' },
      { id: 'cardio', tier: 2, ranks: 3, name: 'Cardio', desc: '+5 max Stamina per rank.' },
      { id: 'bleedout', tier: 3, name: 'Bleed Out', desc: 'Jabs open wounds: 4 damage per stack at the start of their turn, stacks to 3.' },
      { id: 'deeplungs', tier: 3, name: 'Deep Lungs', desc: '+15 max Stamina.' },
      { id: 'pacing', tier: 3, ranks: 3, name: 'Pacing', desc: '+2 Stamina regeneration per rank, every turn.' },
      { id: 'flurry', tier: 4, name: 'Flurry', move: true, desc: 'NEW MOVE: dump ALL your Stamina into a relentless 3-hit combo.' },
    ],
  },
  {
    id: 'ringmaster', name: 'Ringmaster', tag: 'The Showman', color: 'var(--carbs)',
    flavor: 'Finishers, comebacks, crowd control. Pairs with quests and variety.',
    nodes: [
      { id: 'crowdwork', tier: 1, name: 'Crowd Work', desc: 'Hype builds 40% faster.' },
      { id: 'stagepresence', tier: 1, ranks: 5, name: 'Stage Presence', desc: 'All Hype you build is 6% greater per rank.' },
      { id: 'bigentrance', tier: 2, name: 'Big Entrance', desc: 'Start every fight at 25 Hype.' },
      { id: 'heckle', tier: 2, name: 'Heckle', desc: 'Your Bone Guard also RATTLES the enemy: they deal 25% less damage for 3 turns.' },
      { id: 'warmup', tier: 2, ranks: 3, name: 'Warm-Up Act', desc: 'Start every fight with +4 Hype per rank.' },
      { id: 'comboartist', tier: 2, ranks: 5, name: 'Combo Artist', desc: '+2% crit chance per rank.' },
      { id: 'ovation', tier: 3, name: 'Standing Ovation', desc: 'Getting hit builds double Hype (the comeback engine).' },
      { id: 'secondwind', tier: 3, name: 'Second Wind', desc: 'Once per fight, dropping below 25% HP restores 15% HP and 30 Stamina.' },
      { id: 'encoretraining', tier: 3, ranks: 3, name: 'Encore Training', desc: 'Repeat Signatures lose 5% less punch per rank.' },
      { id: 'showstopper', tier: 4, name: 'Showstopper', desc: 'Signature fires at 80 Hype and hits 25% harder.' },
    ],
  },
  {
    id: 'gravecaller', name: 'Gravecaller', tag: 'The Necromancer', color: '#c084fc',
    flavor: 'Bone magic and marrow mending. Pairs with quest-hunting variety.',
    nodes: [
      { id: 'bonebolt', tier: 1, name: 'Bone Bolt', move: true, desc: 'NEW MOVE: hurl a shard of bone at ANY range. Scales with your Hype stat.' },
      { id: 'darkstudy', tier: 1, ranks: 5, name: 'Dark Study', desc: 'Your shadow magic (bolts, spikes, storms) hits 3% harder per rank.' },
      { id: 'soulsiphon', tier: 2, name: 'Soul Siphon', desc: 'Bone Bolts heal you for 30% of their damage.' },
      { id: 'mend', tier: 2, name: 'Mend Marrow', move: true, desc: 'NEW MOVE: knit your bones back together. Heals 12% max HP, 3 uses per fight.' },
      { id: 'marrowtap', tier: 2, ranks: 3, name: 'Marrow Tap', desc: 'Shadow spells cost 2 less Stamina per rank.' },
      { id: 'soulreserve', tier: 2, ranks: 5, name: 'Soul Reserve', desc: '+5 max HP per rank.' },
      { id: 'hex', tier: 3, name: 'Hex of Dust', move: true, desc: 'NEW MOVE: curse the enemy to deal 20% less damage for 2 turns.' },
      { id: 'gravechill', tier: 3, name: 'Grave Chill', desc: 'Bone Bolts also drain 10 of the enemy Stamina.' },
      { id: 'lingering', tier: 3, ranks: 3, name: 'Lingering Dust', desc: 'Your Hex saps 3% more damage per rank.' },
      { id: 'raisedead', tier: 3, name: 'Raise Dead', move: true, desc: 'NEW MOVE: raise a bone minion for 3 turns. It claws the enemy for shadow damage at the start of each of your turns.' },
      { id: 'bonestorm', tier: 4, name: 'Bone Storm', move: true, desc: 'NEW MOVE: once per fight, a whirlwind of shards: three piercing magic hits.' },
    ],
  },
  {
    id: 'gravewarden', name: 'Gravewarden', tag: 'The Cleric', color: '#ffe08a',
    flavor: 'Last rites and first aid. Holy light for unholy bones.',
    nodes: [
      { id: 'smite', tier: 1, name: 'Smite', move: true, desc: 'NEW MOVE: a lance of grave-light at ANY range. Scales with your Hype stat.' },
      { id: 'devotion', tier: 1, ranks: 5, name: 'Devotion', desc: 'Your holy magic hits 3% harder per rank.' },
      { id: 'radiance', tier: 2, name: 'Radiance', desc: 'Smites heal you for 20% of their damage.' },
      { id: 'ward', tier: 2, name: 'Ward', move: true, desc: 'NEW MOVE: a holy shield that absorbs the next 25 damage.' },
      { id: 'blessedward', tier: 2, ranks: 3, name: 'Blessed Ward', desc: 'Wards absorb +5 damage per rank.' },
      { id: 'sanctified', tier: 2, ranks: 5, name: 'Sanctified Bones', desc: '+2 Armor and +2 Spell Armor per rank.' },
      { id: 'judgement', tier: 3, name: 'Judgement', desc: 'Smites hit 50% harder on STAGGERED or SUNDERED enemies.' },
      { id: 'hallowed', tier: 3, name: 'Hallowed Marrow', desc: 'All healing you receive is 20% stronger.' },
      { id: 'mercy', tier: 3, ranks: 3, name: 'Mercy', desc: 'Mend Marrow heals +3% max HP per rank.' },
      { id: 'lastlight', tier: 4, name: 'Last Light', desc: 'CHEAT DEATH: once per fight, a killing blow leaves you at 1 HP and restores 20% HP.' },
    ],
  },
  {
    id: 'boneshaman', name: 'Bone Shaman', tag: 'The Elementalist', color: '#ff7a45',
    flavor: 'Fire in the femurs, frost in the fingers.',
    nodes: [
      { id: 'frostbolt', tier: 1, name: 'Frost Bolt', move: true, desc: 'NEW MOVE: an icy shard at ANY range that CHILLS 8 Stamina off the enemy.' },
      { id: 'attunement', tier: 1, ranks: 5, name: 'Attunement', desc: 'Your fire and frost magic hits 3% harder per rank.' },
      { id: 'firebolt', tier: 2, name: 'Fire Bolt', move: true, desc: 'NEW MOVE: a searing bolt that sets a BURN: 5 damage per turn for 2 turns.' },
      { id: 'totemic', tier: 2, name: 'Totemic Marrow', desc: '+5 Stamina regeneration every turn.' },
      { id: 'deepfreeze', tier: 2, ranks: 3, name: 'Deep Freeze', desc: 'Chills drain +3 more enemy Stamina per rank.' },
      { id: 'kindling', tier: 2, ranks: 3, name: 'Kindling', desc: 'Your burns tick +1 damage per rank.' },
      { id: 'frostbite', tier: 3, name: 'Frostbite', desc: 'Frost Bolts hit 40% harder when the enemy is gassed (under 30 Stamina).' },
      { id: 'wildfire', tier: 3, name: 'Wildfire', desc: 'Burns tick 7 damage and last 3 turns.' },
      { id: 'conduits', tier: 3, ranks: 5, name: 'Bone Conduits', desc: 'Elemental spells cost 1 less Stamina per rank.' },
      { id: 'totem', tier: 3, name: 'Spirit Totem', move: true, desc: 'NEW MOVE: plant a spirit totem for 3 turns. At the start of each of your turns it zaps the enemy and restores 8 of your Stamina.' },
      { id: 'tempest', tier: 4, name: 'Tempest', move: true, desc: 'NEW MOVE: once per fight, a barrage of fire and frost: four elemental hits.' },
    ],
  },
  {
    id: 'alchemist', name: 'The Alchemist', tag: 'The Toxicologist', color: '#8bd450',
    flavor: 'Bombs, vials and decoctions. Every potion builds TOXICITY, and Toxicity powers your alchemy — but it bleeds off each turn, so keep brewing.',
    nodes: [
      { id: 'fireflask', tier: 1, name: 'Fire Flask', move: true, desc: 'NEW MOVE: hurl a Fire Flask at ANY range — alchemical fire that BURNS. Builds Toxicity.' },
      { id: 'potency', tier: 1, ranks: 5, name: 'Potency', desc: 'Your alchemy (flasks, vials, bombs) hits 3% harder per rank.' },
      { id: 'acidvial', tier: 2, name: 'Acid Vial', move: true, desc: 'NEW MOVE: shatter an Acid Vial — damage and SUNDER (enemy takes +15% damage) for 2 turns.' },
      { id: 'swallow', tier: 2, name: 'Swallow', move: true, desc: 'NEW MOVE: quaff a Swallow decoction — heal 12% max HP. 3 uses per fight.' },
      { id: 'concoction', tier: 2, ranks: 3, name: 'Concoction', desc: 'Your potions cost 2 less Stamina per rank.' },
      { id: 'hardyliver', tier: 2, ranks: 5, name: 'Hardy Liver', desc: '+5 max HP per rank — a constitution that shrugs off its own brews.' },
      { id: 'catalyst', tier: 3, ranks: 5, name: 'Catalyst', desc: 'Every 10 Toxicity adds +2% alchemy damage per rank. Ride the high.' },
      { id: 'corrode', tier: 3, name: 'Corrode', desc: 'Acid Vials also drain 12 of the enemy Stamina.' },
      { id: 'distill', tier: 3, ranks: 3, name: 'Distill', desc: 'Your potions build 3 less Toxicity per rank (a cleaner brew).' },
      { id: 'overdose', tier: 3, name: 'Overdose', desc: 'While your Toxicity is 60+, all your alchemy hits 15% harder.' },
      { id: 'deathbomb', tier: 4, name: 'Fury Bomb', move: true, desc: 'NEW MOVE: once per fight, a three-stage alchemical bomb whose damage scales with your Toxicity.' },
    ],
  },
  {
    id: 'crowlord', name: 'The Crow Lord', tag: 'The Murder', color: '#6f86c9',
    flavor: 'Command a murder of crows. Call them to your Flock and they peck the enemy every turn — then unleash the whole Murder at once.',
    nodes: [
      { id: 'callcrows', tier: 1, name: 'Call the Murder', move: true, desc: 'NEW MOVE: summon 2 crows to your Flock (any range). Your Flock pecks the enemy at the start of each of your turns.' },
      { id: 'sharpbeaks', tier: 1, ranks: 5, name: 'Sharp Beaks', desc: 'Each crow pecks +1 damage per rank.' },
      { id: 'peckeyes', tier: 2, name: 'Peck the Eyes', move: true, desc: 'NEW MOVE: the flock dives — damage, BLIND the enemy for 2 turns, and add a crow to your Flock.' },
      { id: 'carrion', tier: 2, name: 'Carrion Feast', desc: 'Your crows heal you for 30% of their peck damage.' },
      { id: 'flock', tier: 2, ranks: 3, name: 'Growing Flock', desc: 'Your Flock holds +1 more crow per rank (base 4).' },
      { id: 'roost', tier: 2, ranks: 5, name: 'Dark Roost', desc: '+4 max HP per rank.' },
      { id: 'scavenge', tier: 3, ranks: 3, name: 'Scavenge', desc: 'Your crows also drain 1 enemy Stamina per crow, per rank, when they peck.' },
      { id: 'omen', tier: 3, name: 'Ill Omen', desc: 'While your Flock is 4+, the harried enemy deals 15% less damage.' },
      { id: 'nightwing', tier: 3, name: 'Nightwing', desc: 'Your Blind lasts 3 turns instead of 2.' },
      { id: 'frenzy', tier: 3, ranks: 5, name: 'Feeding Frenzy', desc: '+2% crit chance per rank.' },
      { id: 'murder', tier: 4, name: 'Unleash the Murder', move: true, desc: 'NEW MOVE: once per fight, every crow in your Flock strikes at once (damage scales with Flock size), then the Flock scatters.' },
    ],
  },
];

export function talentPoints(level) { return Math.max(0, level - 1); }

// Deeper trees (v69): tiers unlock by POINTS SPENT in that tree, ranks included.
// Maxing one tree now costs ~26 points (~level 27), not 6.
const TIER_GATE = { 1: 0, 2: 2, 3: 6, 4: 10 };

export function nodeRanks(node) { return node.ranks || 1; }

// kv 'talents' is an ARRAY; multi-rank talents simply appear once per rank
// (additive: every pre-v69 save is already valid). This folds it to counts.
export function talentRanks(takenArr) {
  const out = {};
  for (const id of takenArr || []) out[id] = (out[id] || 0) + 1;
  return out;
}

// WoW-style acquisition gate. Accepts the raw array (rank-aware) or a Set.
export function canTakeTalent(taken, treeId, nodeIdx) {
  const arr = taken instanceof Set ? [...taken] : (taken || []);
  const ranks = talentRanks(arr);
  const tree = TALENT_TREES.find(t => t.id === treeId);
  if (!tree || nodeIdx >= tree.nodes.length) return false;
  const node = tree.nodes[nodeIdx];
  if ((ranks[node.id] || 0) >= nodeRanks(node)) return false;
  const inTree = tree.nodes.reduce((a, n) => a + Math.min(ranks[n.id] || 0, nodeRanks(n)), 0);
  return inTree >= TIER_GATE[node.tier];
}

/* ================= derived pools (spec §1) ================= */

// Armor points -> damage-reduction fraction, with diminishing returns and a hard
// cap so nobody becomes unhittable. 60 pts ~ 33%, capped at 40%.
export const ARMOR_K = 120;
export const ARMOR_CAP = 0.40;
export function armorDR(points) { return Math.min(ARMOR_CAP, Math.max(0, points) / (Math.max(0, points) + ARMOR_K)); }

export function derived(stats, weapon = WEAPONS.starter, talents = null, gearArmor = null, ranks = null) {
  const t = talents || new Set();
  const rk = id => (ranks && ranks[id]) || 0;
  // Blend: base armor from stats (Marrow -> physical, Reflex -> spell) + gear +
  // ranked defensive talents on top.
  const physPts = stats.marrow * 0.6 + (gearArmor?.armor || 0) + rk('ironjaw') * 4 + rk('sanctified') * 2;
  const spellPts = stats.reflex * 0.6 + (gearArmor?.spellArmor || 0) + rk('sanctified') * 2;
  return {
    maxHp: Math.round(150 + stats.marrow * 3) + (t.has('thickskull') ? 45 : 0) + rk('densebones') * 6 + rk('soulreserve') * 5,
    maxWind: Math.round(40 + stats.wind * 0.6) + (t.has('deeplungs') ? 15 : 0) + rk('cardio') * 5,
    ap: 2 + (weapon.apBonus || 0) + (talents && talents.has('lightfeet') ? 1 : 0),
    powerMult: 1 + (stats.power / 100) * 1.5,
    magicMult: 1 + (stats.hype / 100) * 1.5 + (weapon.magicBonus || 0),
    critChance: Math.min(0.60, 0.05 + (stats.reflex / 100) * 0.30 + (weapon.critBonus || 0) + rk('comboartist') * 0.02 + rk('frenzy') * 0.02),
    glanceChance: (stats.reflex / 100) * 0.25 + rk('footwork') * 0.01,
    armor: armorDR(physPts),        // cuts incoming physical damage
    spellArmor: armorDR(spellPts),  // cuts incoming magic damage
    armorPts: Math.round(physPts), spellArmorPts: Math.round(spellPts),
  };
}

/* ================= weapons (spec §6) ================= */

// Weapons each have a CLEAR identity tied to a stat/spec, so the choice is never
// random: pick the weapon that amplifies the build you're growing. They MULTIPLY
// your effort (scale off your own stats or shave Stamina), never replace it.
// `spec` = the stat it rewards; `rarity` drives shop cost + the chip's ring.
export const WEAPONS = {
  starter: {
    id: 'starter', name: 'Taped Pipe', rarity: 'common', spec: null, arch: null,
    desc: 'Where every bonehead starts. No bonus, no penalty; the honest baseline.',
    mult: () => 1.0,
    windCostMult: () => 1.0,
  },
  rapier: {
    id: 'rapier', name: 'Femur Rapier', rarity: 'rare', spec: 'reflex', arch: 'melee',
    desc: 'A keen, quick edge. +12% crit chance, and Swings cost less Stamina. Rewards Reflex duelists.',
    mult: () => 1.0,
    windCostMult: (move) => move === 'swing' ? 0.8 : 1.0,
    critBonus: 0.12,
  },
  shivs: {
    id: 'shivs', name: 'Twin Shivs', rarity: 'rare', spec: 'wind', arch: 'melee',
    desc: 'Two blades, endless motion. Every close strike (Jab, Swing, Haymaker) costs 20% less Stamina. Rewards high-Stamina tempo.',
    mult: () => 1.0,
    windCostMult: (move) => (move === 'jab' || move === 'swing' || move === 'haymaker') ? 0.8 : 1.0,
  },
  scepter: {
    id: 'scepter', name: 'Skull Scepter', rarity: 'epic', spec: 'hype', arch: 'caster',
    desc: 'A focus for bone-magic. Your spells (bolts, heals, Bone Storm) hit 30% harder. Rewards Hype casters.',
    mult: () => 1.0,
    windCostMult: () => 1.0,
    magicBonus: 0.30,
  },
  bonecrusher: {
    id: 'bonecrusher', name: 'Bonecrusher', rarity: 'legendary', spec: 'power', arch: 'melee',
    desc: 'Feast-or-famine bombs. Swing and Haymaker scale off Power; Haymaker costs more Stamina. The Champion’s prize.',
    mult: (move, s) => move === 'haymaker' ? 1 + 0.40 * (s.power / 100)
      : move === 'swing' ? 1 + 0.10 * (s.power / 100) : 1.0,
    windCostMult: (move) => move === 'haymaker' ? 1.3 : 1.0,
  },
  // ---- The Bone Merchant's stock (v71): build-specific, tiered gold sinks ----
  // MELEE
  cleaver: {
    id: 'cleaver', name: 'Ribsplitter Cleaver', rarity: 'epic', spec: 'power', arch: 'melee', vendor: true, tier: 2,
    desc: 'A butcher\'s edge. Swings bite 15% harder and Haymakers scale off Power. Rewards Power bruisers.',
    mult: (move, s) => move === 'swing' ? 1.15 : move === 'haymaker' ? 1 + 0.25 * (s.power / 100) : 1.0,
    windCostMult: () => 1.0,
  },
  maul: {
    id: 'maul', name: 'Gravemarrow Maul', rarity: 'legendary', spec: 'power', arch: 'melee', vendor: true, tier: 3,
    desc: 'Two-handed ruin. Haymakers scale hard off Power and land steadier, but cost more Stamina. The bruiser\'s endgame.',
    mult: (move, s) => move === 'haymaker' ? 1 + 0.5 * (s.power / 100) : move === 'swing' ? 1.1 : 1.0,
    windCostMult: (move) => move === 'haymaker' ? 1.25 : 1.0,
    critBonus: 0.05,
  },
  // CASTER
  wand: {
    id: 'wand', name: 'Bonecarver Wand', rarity: 'rare', spec: 'hype', arch: 'caster', vendor: true, tier: 1,
    desc: 'A starter focus. Spells hit 15% harder and cost a little less Stamina. An affordable step into casting.',
    mult: () => 1.0,
    windCostMult: (move) => 1.0,
    magicBonus: 0.15,
  },
  lichfocus: {
    id: 'lichfocus', name: 'Lich\'s Focus', rarity: 'legendary', spec: 'hype', arch: 'caster', vendor: true, tier: 3,
    desc: 'A skull socketed with a cold star. Spells hit 45% harder with a touch more crit. The caster\'s endgame.',
    mult: () => 1.0,
    windCostMult: () => 1.0,
    magicBonus: 0.45,
    critBonus: 0.05,
  },
  // SUPPORT (magicBonus lifts heals + wards; cheaper sustain)
  crook: {
    id: 'crook', name: 'Warden\'s Crook', rarity: 'epic', spec: 'marrow', arch: 'support', vendor: true, tier: 2,
    desc: 'A shepherd\'s staff for the dead. Heals and holy magic hit 20% harder, and Mend, Ward and Smite cost 20% less Stamina. Rewards menders.',
    mult: () => 1.0,
    windCostMult: (move) => (move === 'mend' || move === 'ward' || move === 'smite') ? 0.8 : 1.0,
    magicBonus: 0.20,
  },
  censer: {
    id: 'censer', name: 'Sanctifier Censer', rarity: 'legendary', spec: 'marrow', arch: 'support', vendor: true, tier: 3,
    desc: 'Swinging incense that never gutters. Your magic hits 30% harder and every cast costs 25% less Stamina. The support endgame.',
    mult: () => 1.0,
    windCostMult: () => 0.75,
    magicBonus: 0.30,
  },
};

/* ================= actions (spec §2) ================= */

// v117: the range system (Shove/Advance/Throw/Taunt + close/far gating) is GONE.
// It was vestigial: fights always started close, the AI never shoved or taunted,
// so far-range moves were unreachable in real play. Every action is always legal
// (AP/Stamina permitting); Kite and Heckle were repurposed onto Jab and Rattle.
export const ACTIONS = {
  jab:      { label: 'Jab', ap: 1, wind: 8, base: 10, hype: 6 },
  swing:    { label: 'Swing', ap: 1, wind: 18, base: 22, hype: 10 },
  haymaker: { label: 'Haymaker', ap: 2, wind: 35, base: 40, hype: 15 },
  // Active defense (no more passive Block/Dodge/Brace): a shield you raise and a
  // debuff you land. Both are proactive plays, not "turtle and wait".
  guard:    { label: 'Bone Guard', ap: 1, wind: 12, shield: true, hype: 3 },
  signature:{ label: 'Signature', ap: 2, wind: 0, base: 120 },
  titan:    { label: 'Titan', ap: 2, wind: 30, base: 55, hype: 15, talent: 'titan' },
  flurry:   { label: 'Flurry', ap: 2, wind: 0, base: 10, talent: 'flurry' },
  bonebolt: { label: 'Bone Bolt', ap: 1, wind: 18, base: 16, hype: 6, talent: 'bonebolt', magic: true, school: 'shadow' },
  mend:     { label: 'Mend', ap: 1, wind: 20, talent: 'mend', magic: true, school: 'nature' },
  hex:      { label: 'Hex', ap: 1, wind: 15, talent: 'hex', magic: true, school: 'shadow' },
  bonestorm:{ label: 'Bone Storm', ap: 2, wind: 40, base: 14, talent: 'bonestorm', magic: true, school: 'shadow' },
  smite:    { label: 'Smite', ap: 1, wind: 18, base: 15, hype: 6, talent: 'smite', magic: true, school: 'holy' },
  ward:     { label: 'Ward', ap: 1, wind: 15, talent: 'ward', magic: true, school: 'holy' },
  frostbolt:{ label: 'Frost Bolt', ap: 1, wind: 18, base: 14, hype: 6, talent: 'frostbolt', magic: true, school: 'frost' },
  firebolt: { label: 'Fire Bolt', ap: 1, wind: 20, base: 18, hype: 6, talent: 'firebolt', magic: true, school: 'fire' },
  tempest:  { label: 'Tempest', ap: 2, wind: 35, base: 10, talent: 'tempest', magic: true, school: 'fire' },
  // class-identity actives (v70): a self-buff and two summons that act on your turn
  rage:     { label: 'Rage', ap: 1, wind: 10, talent: 'rage' },
  raisedead:{ label: 'Raise Dead', ap: 2, wind: 22, talent: 'raisedead', magic: true, school: 'shadow' },
  totem:    { label: 'Spirit Totem', ap: 1, wind: 18, talent: 'totem', magic: true, school: 'nature' },
  // The Alchemist (v77): thrown potions. Their own school 'alchemy' + a Toxicity
  // ramp (own resource, NOT the kitchen). Toxicity powers alchemy damage, decays each turn.
  fireflask:{ label: 'Fire Flask', ap: 1, wind: 18, base: 16, hype: 6, talent: 'fireflask', magic: true, school: 'alchemy' },
  acidvial: { label: 'Acid Vial', ap: 1, wind: 18, base: 14, hype: 6, talent: 'acidvial', magic: true, school: 'alchemy' },
  swallow:  { label: 'Swallow', ap: 1, wind: 18, talent: 'swallow', magic: true, school: 'alchemy' },
  deathbomb:{ label: 'Fury Bomb', ap: 2, wind: 40, base: 12, talent: 'deathbomb', magic: true, school: 'alchemy' },
  // The Crow Lord (v79): grow a Flock that pecks every turn, then unleash it.
  callcrows:{ label: 'Call the Murder', ap: 1, wind: 14, talent: 'callcrows' },
  peckeyes: { label: 'Peck the Eyes', ap: 1, wind: 18, base: 12, hype: 6, talent: 'peckeyes', magic: true, school: 'shadow' },
  murder:   { label: 'Unleash the Murder', ap: 2, wind: 30, base: 8, talent: 'murder', magic: true, school: 'shadow' },
  // universal bone moves (every fighter is a skeleton): flavor + utility, not talent-gated
  bonespike:{ label: 'Bone Spike', ap: 1, wind: 16, base: 17, hype: 8, talent: 'bonebolt', magic: true, school: 'shadow' }, // necro-only, BLINDS on hit
};
export const SHOWSTOPPER_HYPE = 80;

// big moves can miss (whiffed heavies leave you off-balance)
export const MISS_CHANCE = {
  swing: 0.04, haymaker: 0.12, titan: 0.15,
  flurry: 0.08, bonestorm: 0.10, tempest: 0.08,
};
const clampNum = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rkOf = (f, id) => (f && f.tranks && f.tranks[id]) || 0; // multi-rank talent rank
// Alchemist: potions build Toxicity (Distill brews cleaner), capped at 100.
function addToxicity(me, n) { me.toxicity = Math.min(100, (me.toxicity || 0) + Math.max(0, n - rkOf(me, 'distill') * 3)); }

export const REGEN_PER_TURN = 20; // higher now that Brace is gone: Stamina refills passively
export const GUARD_BASE = 16;     // Bone Guard absorb floor; scales with Marrow
export const GUARD_STAMINA = 22;  // Bone Guard also lets you catch your breath (active Stamina)
export const SIGNATURE_HYPE = 100;
export const HIT_TAKEN_HYPE = 4;

export function sigThreshold(f) { return f.talents.has('showstopper') ? SHOWSTOPPER_HYPE : SIGNATURE_HYPE; }
function gainHype(f, amt) {
  let mult = f.talents.has('crowdwork') ? 1.4 : 1;
  mult *= 1 + rkOf(f, 'stagepresence') * 0.06; // ranked: Stage Presence
  if (f.pet && f.pet.passive === 'hypeGain') mult *= (1 + f.pet.passivePct);
  f.hype = Math.min(SIGNATURE_HYPE, f.hype + Math.round(amt * mult));
}

// The pet takes its OWN turn each round: you pick one action from its kit. The
// SPECIAL is the tuned petAbilityEffect on a short cooldown; BASIC is a light
// every-turn move; GUARD steadies the pet. The pet hits YOUR current target.
export function petActionsFor(fight) {
  const pet = fight.p && fight.p.pet, body = fight.pAux;
  if (!pet || !body || body.fainted || body.hp <= 0 || fight.over) return [];
  const petFree = !!(fight.p && fight.p.foodPetFree); // Hunter's Skewer
  return petActionMeta(pet.family).map(a => ({
    ...a,
    cd: a.kind === 'special' && !petFree ? (pet.specialCd || 0) : 0,
    enabled: a.kind !== 'special' || petFree || (pet.specialCd || 0) <= 0,
  }));
}

export function applyPetAction(fight, actionId) {
  const events = [];
  const me = fight.p, pet = me && me.pet, body = fight.pAux;
  if (!pet || !body || body.fainted || fight.over) return events;
  const meta = petActionMeta(pet.family).find(a => a.id === actionId);
  if (!meta) return events;
  const petFree = !!me.foodPetFree; // Hunter's Skewer: special ignores cooldown
  if (meta.kind === 'special' && !petFree && (pet.specialCd || 0) > 0) return events;
  const foeWho = targetWhoFor(fight, 'p');
  const foe = fighterOf(fight, foeWho);

  if (meta.kind === 'special') {
    if (!petFree) pet.specialCd = meta.cd;
    const fx = petAbilityEffect(pet, me, foe);
    if (fx.kind === 'pethit') {
      for (let b = 0; b < fx.bites && foe.hp > 0; b++) {
        let dmg = Math.round(fx.damage * (1 + (body.petDamagePct || 0)));
        if (fx.crit && fight.rng() < 0.25) dmg *= 2;
        dealDamage(fight, foeWho, dmg, events);
        if (fx.lifesteal) me.hp = Math.min(me.d.maxHp, me.hp + Math.round(dmg * fx.lifesteal));
        events.push({ t: 'pethit', who: 'p', damage: dmg, name: pet.name });
      }
      if (foe.hp > 0 && fx.poison) {
        const cur = foe.poison ? foe.poison.stacks : 0;
        foe.poison = { per: fx.poison.per, stacks: Math.min(3, cur + fx.poison.stacks), turns: fx.poison.turns };
        events.push({ t: 'status', who: foeWho, kind: 'poison', stacks: foe.poison.stacks });
      }
    } else if (fx.kind === 'petshield') {
      me.ward = Math.max(me.ward, 0) + fx.shield;
      if (fx.heal) me.hp = Math.min(me.d.maxHp, me.hp + fx.heal);
      if (fx.stamina) me.wind = Math.min(me.d.maxWind, me.wind + fx.stamina);
      if (fx.cleanse) { me.bleed = null; me.burn = null; me.poison = null; }
      if (pet.picks.has('w-laststand')) pet.lastStandArmed = true;
      events.push({ t: 'petshield', who: 'p', shield: fx.shield, heal: fx.heal, name: pet.name });
    } else if (fx.kind === 'petdebuff') {
      if (foe.hp > 0) {
        if (!foe.weaken || foe.weaken.pct < fx.weakenPct) foe.weaken = { pct: fx.weakenPct, turns: fx.turns };
        if (fx.blind) foe.blind = { pct: 0.30, turns: 2 };
        if (fx.staminaDrain) foe.wind = Math.max(0, foe.wind - fx.staminaDrain);
        if (fx.mark) foe.marked = { turns: 3 };
        if (fx.stagger) foe.stagger = true;
      }
      events.push({ t: 'petdebuff', who: foeWho, name: pet.name });
    }
  } else if (meta.kind === 'basic') {
    const lvl = pet.level;
    // basics are light filler (the pet acts every round now): the SPECIAL is the payoff
    if (pet.family === 'warden') {
      const heal = Math.round(me.d.maxHp * 0.025);
      me.hp = Math.min(me.d.maxHp, me.hp + heal);
      events.push({ t: 'petshield', who: 'p', shield: 0, heal, name: pet.name });
    } else {
      const dmg = Math.round((0.5 + lvl * 0.15) * me.d.powerMult * (1 + (body.petDamagePct || 0)));
      if (foe && foe.hp > 0) dealDamage(fight, foeWho, dmg, events);
      events.push({ t: 'pethit', who: 'p', damage: dmg, name: pet.name });
      if (pet.family === 'imp') gainHype(me, 2);
    }
  } else { // guard
    const heal = Math.round(body.d.maxHp * 0.15);
    body.hp = Math.min(body.d.maxHp, body.hp + heal);
    events.push({ t: 'petguard', who: 'p', name: pet.name });
  }
  checkOver(fight);
  return events;
}
export const TURN_CAP = 30;

// Passive Block/Dodge are retired: defense is now active (Bone Guard's absorb
// pool + Rattle's weaken), so there is no attacker-vs-defender-state matrix.
// Kept as a stable {mult:1} shim so callers/tests don't need to branch.
export function counterMult() { return { mult: 1.0 }; }

/* ================= damage pipeline (spec §3) ================= */

export function resolveHit({ move, attacker, defender, rng }) {
  const a = ACTIONS[move];
  const counter = { mult: 1.0 }; // no passive-defense matrix anymore
  const immune = move === 'signature' || move === 'titan' || move === 'flurry' || !!a.magic; // no glance
  let missChance = MISS_CHANCE[move] || 0;
  // Cam's model: on already-riskier moves, hit rate flexes with your attack (Power)
  // vs their evasion (Reflex). Small so the ladder stays balanced; jabs stay reliable.
  if (missChance > 0) {
    missChance += clampNum((defender.stats.reflex - attacker.stats.power) * 0.0015, -0.05, 0.10);
    if (attacker.talents.has('heavyhands')) missChance -= 0.05; // committed swing = steadier aim
    // Steady Hands: +1% hit per rank on committed swings (Tom's stacking-hit ask)
    if (move === 'swing' || move === 'haymaker' || move === 'titan') missChance -= rkOf(attacker, 'steadyhands') * 0.01;
  }
  // blindness fogs even simple strikes (physical only; magic bolts still home in)
  if (!a.magic && attacker.blind) missChance += attacker.blind.pct;
  missChance = clampNum(missChance, 0, 0.85);
  if (missChance && rng() < missChance) {
    return { damage: 0, miss: true, whiffed: true, offBalance: move === 'haymaker' || move === 'titan', crit: false, glance: false };
  }
  let dmg = a.base;
  dmg *= a.magic ? attacker.d.magicMult : attacker.d.powerMult;
  if (!a.magic) dmg *= attacker.weapon.mult(move, attacker.stats);
  dmg *= counter.mult;
  if (move === 'haymaker' && attacker.talents.has('heavyhands')) dmg *= 1.15;
  if (move === 'smite' && attacker.talents.has('judgement') && (defender.stagger || defender.sunder)) dmg *= 1.5;
  if (move === 'frostbolt' && attacker.talents.has('frostbite') && defender.wind < 30) dmg *= 1.4;
  // ranked synergy passives (v69): small stacking boosts per rank
  if (move === 'swing' || move === 'haymaker') dmg *= 1 + rkOf(attacker, 'followthrough') * 0.04;
  if (move === 'jab') dmg *= 1 + rkOf(attacker, 'sharpjabs') * 0.04;
  if (a.school === 'shadow') dmg *= 1 + rkOf(attacker, 'darkstudy') * 0.03;
  if (a.school === 'holy') dmg *= 1 + rkOf(attacker, 'devotion') * 0.03;
  if (a.school === 'fire' || a.school === 'frost') dmg *= 1 + rkOf(attacker, 'attunement') * 0.03;
  if (a.school === 'alchemy') {
    dmg *= 1 + rkOf(attacker, 'potency') * 0.03;                                   // Potency
    dmg *= 1 + Math.floor((attacker.toxicity || 0) / 10) * rkOf(attacker, 'catalyst') * 0.02; // Catalyst: ride the Toxicity
    if (attacker.talents.has('overdose') && (attacker.toxicity || 0) >= 60) dmg *= 1.15;       // Overdose
  }
  if (attacker.elixir) dmg *= 1 + attacker.elixir.pct; // Fury potion (kitchen brew)
  if (attacker.rage) dmg *= 1.35; // Blood Rage: all-in aggression
  if (attacker.weaken) dmg *= (1 - attacker.weaken.pct);
  if (defender.sunder) dmg *= 1.15;
  if (defender.marked) dmg *= 1.07; // imp Death's Mark
  // armor: physical hits blunted by Armor, magic by Spell Armor
  dmg *= (1 - (a.magic ? (defender.d.spellArmor || 0) : (defender.d.armor || 0)));
  if (attacker.pet && attacker.pet.passive === 'yourDamage') dmg *= (1 + attacker.pet.passivePct);
  if (defender.pet && defender.pet.passive === 'damageTaken') dmg *= (1 - defender.pet.passivePct);
  if (attacker.foodDamagePct) dmg *= (1 + attacker.foodDamagePct); // Marrow Stew etc.
  const crit = rng() < attacker.d.critChance;
  if (crit) dmg *= 1.5;
  const glance = !immune && rng() < defender.d.glanceChance;
  if (glance) dmg *= 0.5;
  return {
    damage: Math.round(dmg), crit, glance,
    breaksGuard: !!counter.breaksGuard, stagger: !!counter.stagger,
  };
}

// expected value for previews (spec §3)
export function expectedDamage(move, attacker, defenderState, defender) {
  const a = ACTIONS[move];
  const counter = move === 'signature' ? { mult: 1 } : counterMult(move, defenderState);
  if (counter.miss) return 0;
  const raw = a.base * (a.magic ? attacker.d.magicMult : attacker.d.powerMult) * (a.magic ? 1 : attacker.weapon.mult(move, attacker.stats)) * counter.mult;
  const acc = 1 - (MISS_CHANCE[move] || 0);
  const armorCut = defender ? (1 - (a.magic ? (defender.d.spellArmor || 0) : (defender.d.armor || 0))) : 1;
  return Math.round(raw * acc * armorCut * (1 + attacker.d.critChance * 0.5) * (1 - (defender ? defender.d.glanceChance : 0) * 0.5));
}

/* ================= fight state ================= */

export function makeFighter({ name, stats, weaponId = 'starter', outfit = null, talents = [], pet = null, food = null, gearArmor = null }) {
  const weapon = WEAPONS[weaponId] || WEAPONS.starter;
  const tset = new Set(talents);
  const tranks = talentRanks(talents instanceof Set ? [...talents] : talents); // multi-rank counts
  const d = derived(stats, weapon, tset, gearArmor, tranks);
  return {
    name, stats, weapon, d, outfit, talents: tset, tranks,
    pet: pet ? { ...pet, specialCd: 0, lastStandUsed: false } : null,
    // food-dish buffs (temporary, from the kitchen); only ever on the player
    foodDamagePct: food?.damagePct || 0,
    foodRegenPct: food?.regenPct || 0,
    foodPetFree: !!food?.petFree,
    foodPetHpPct: food?.petHpPct || 0,      // Bonemeal Kibble: pet HP up
    foodPetDamagePct: food?.petDamagePct || 0, // Bonemeal Kibble: pet damage up
    titanUsed: false, bonestormUsed: false, secondWindUsed: false,
    tempestUsed: false, lastlightUsed: false, deathbombUsed: false,
    sigsUsed: 0,
    mendUses: 3, swallowUses: 3,
    toxicity: 0,      // Alchemist: builds from potions, powers alchemy dmg, decays each turn
    flock: 0,         // Crow Lord: crows in your Flock; peck each turn, unleashed by Murder
    murderUsed: false,
    ward: 0,          // holy shield pool, absorbs damage first
    burn: null,       // {per, turns}
    bleed: null,      // {stacks, turns}
    poison: null,     // {per, stacks, turns} pet DoT (Hound)
    sunder: null,     // {turns} takes +15% damage
    weaken: null,     // {pct, turns} deals less damage
    blind: null,      // {pct, turns} its own physical attacks miss more
    marked: null,     // {turns} takes +10% from everything (imp Death's Mark)
    elixir: null,     // {pct, turns} a drunk Fury potion: +dmg for a few turns (kitchen, universal)
    rage: null,       // {turns} Blood Rage: +35% dmg, bleeds 6 HP/turn (Slab)
    minion: null,     // {turns, dmg} Raise Dead: strikes enemy at your turn start (Necro)
    totem: null,      // {turns, dmg} Spirit Totem: zaps enemy + regens you (Shaman)
    hp: d.maxHp, wind: d.maxWind, hype: Math.min(100, (tset.has('bigentrance') ? 25 : 0) + (tranks['warmup'] || 0) * 4 + (food?.hype || 0)),
    state: null,           // 'block' | 'dodge' | null (persists through opponent's next turn)
    stagger: false,        // loses one 1-AP action next turn
    offBalance: false,
    recentCloseMoves: [],  // for AI tendency reads
    fainted: false,        // aux bodies (pet / add) can drop without ending the fight
    isPet: false,
  };
}

// Your pet as a REAL body: enemies can target and down it (dropping its aura).
// HP is sized directly (the 150-base HP formula is too big for a small pet);
// it still uses a full derived block so it works as a defender in resolveHit.
export function makePetBody(petDescriptor, owner) {
  const L = petDescriptor.level || 1;
  // Intrinsic stat line comes from pets.js (rarity + per-pet tilt + shiny). Fall
  // back to the pre-v124 generic line for any descriptor built without it.
  const bs = petDescriptor.stats || { power: 10 + L * 4, marrow: 20, wind: 30, reflex: 25 + L * 5, hype: 0, hp: 40 + L * 8 };
  const petStats = { power: bs.power, marrow: bs.marrow, wind: bs.wind, reflex: bs.reflex, hype: 0 };
  const body = makeFighter({ name: petDescriptor.name, stats: petStats });
  const hpBoost = 1 + (owner.foodPetHpPct || 0); // Bonemeal Kibble
  const petHp = bs.hp != null ? bs.hp : 40 + L * 8;
  const maxHp = Math.round((petHp + Math.round((owner.stats.marrow || 40) * 0.25)) * hpBoost);
  body.d = { ...body.d, maxHp };
  body.hp = maxHp;
  body.isPet = true;
  body.side = 'p';
  body.petDamagePct = owner.foodPetDamagePct || 0; // Bonemeal Kibble: pet hits harder
  body.kit = petDescriptor;   // family/ability/picks used by resolvePet
  return body;
}

export function createFight({ player, foe, add = null, seed = 1, aiLevel = 1 }) {
  const pAux = player.pet ? makePetBody(player.pet, player) : null;
  if (pAux) pAux.owner = player;
  player.side = 'p'; foe.side = 'f';
  if (add) add.side = 'f';
  return {
    p: player, f: foe,
    pAux, fAux: add,
    // each captain's current target ('f'/'fa' for the player, 'p'/'pa' for the foe)
    pTarget: 'f', fTarget: 'p',
    active: 'p',
    turn: 1,
    ap: player.d.ap,
    rng: mulberry32(seed),
    aiLevel,
    log: [],
    over: null,        // {winner: 'p'|'f'|'draw'}
  };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function healMult(f) { return f.talents.has('hallowed') ? 1.2 : 1; }

export function dealDamage(fight, victimWho, amount, events) {
  const v = fighterOf(fight, victimWho);
  if (v.ward > 0 && amount > 0) {
    const soak = Math.min(v.ward, amount);
    v.ward -= soak; amount -= soak;
    events.push({ t: 'absorb', who: victimWho, amount: soak, broken: v.ward <= 0 });
  }
  if (amount >= v.hp && v.talents.has('lastlight') && !v.lastlightUsed && !v.secondWindUsed) {
    v.lastlightUsed = true;
    v.hp = 1 + Math.round(v.d.maxHp * 0.20 * healMult(v));
    events.push({ t: 'lastlight', who: victimWho });
    return;
  }
  if (amount >= v.hp && v.pet && v.pet.lastStandArmed && !v.pet.lastStandUsed) {
    v.pet.lastStandUsed = true; v.pet.lastStandArmed = false;
    // a real last stand: survive the killing blow at a sliver, not a full negate
    v.hp = Math.max(1, Math.round(v.d.maxHp * 0.15));
    events.push({ t: 'petshield', who: victimWho, shield: 0, laststand: true, name: v.pet.name });
    return;
  }
  v.hp = Math.max(0, v.hp - amount);
  if (v.hp > 0 && v.hp <= v.d.maxHp * 0.25 && v.talents.has('secondwind') && !v.secondWindUsed && !v.lastlightUsed) {
    v.secondWindUsed = true;
    const heal = Math.round(v.d.maxHp * 0.15 * healMult(v));
    v.hp = Math.min(v.d.maxHp, v.hp + heal);
    v.wind = Math.min(v.d.maxWind, v.wind + 30);
    events.push({ t: 'secondwind', who: victimWho, heal });
  }
  // A downed pet faints (not a loss): drop its aura so the fight keeps going.
  if (v.isPet && v.hp <= 0 && !v.fainted) {
    v.fainted = true;
    if (v.owner) v.owner.pet = null; // aura reads (resolveHit/gainHype) stop
    events.push({ t: 'faint', who: victimWho, name: v.name });
  }
}

export function fighterOf(fight, who) {
  return who === 'p' ? fight.p : who === 'f' ? fight.f : who === 'pa' ? fight.pAux : fight.fAux;
}
export function opponentOf(fight, who) { return (who === 'p' || who === 'pa') ? fight.f : fight.p; }

// Who the given attacker hits right now: their chosen target if it is still up,
// otherwise any living enemy (so nobody swings at a corpse and stalls the fight).
export function targetWhoFor(fight, who) {
  const alive = (w) => { const f = fighterOf(fight, w); return f && f.hp > 0 && !f.fainted; };
  if (who === 'p' || who === 'pa') {
    if (fight.pTarget === 'fa' && alive('fa')) return 'fa';
    if (alive('f')) return 'f';
    return alive('fa') ? 'fa' : 'f';
  }
  if (fight.fTarget === 'pa' && alive('pa')) return 'pa';
  if (alive('p')) return 'p';
  return alive('pa') ? 'pa' : 'p';
}

// Fight ends only when a whole SIDE's captains-and-adds are down. A downed pet is
// NOT a loss (it just faints and drops its aura).
export function checkOver(fight) {
  if (fight.over) return;
  const pDown = fight.p.hp <= 0;
  const fDown = fight.f.hp <= 0 && (!fight.fAux || fight.fAux.hp <= 0);
  if (pDown && fDown) fight.over = { winner: 'draw' };
  else if (pDown) fight.over = { winner: 'f' };
  else if (fDown) fight.over = { winner: 'p' };
}

// One source of truth for stamina costs (computed in actionsFor AND applyAction;
// v16 lesson: never let the two drift). Ranked reductions live here.
function windCostFor(me, id, a) {
  let c = Math.round((a.wind || 0) * me.weapon.windCostMult(id));
  if (a.school === 'shadow') c = Math.max(0, c - rkOf(me, 'marrowtap') * 2);   // Marrow Tap
  if (a.school === 'fire' || a.school === 'frost') c = Math.max(0, c - rkOf(me, 'conduits')); // Bone Conduits
  return c;
}

// legal actions for the active fighter right now
export function actionsFor(fight) {
  const me = fighterOf(fight, fight.active);
  const out = [];
  for (const [id, a] of Object.entries(ACTIONS)) {
    if (a.talent && !me.talents.has(a.talent)) continue;
    if (id === 'signature' && me.hype < sigThreshold(me)) continue;
    if (id === 'titan' && me.titanUsed) continue;
    if (id === 'bonestorm' && me.bonestormUsed) continue;
    if (id === 'mend' && me.mendUses <= 0) continue;
    if (id === 'tempest' && me.tempestUsed) continue;
    if (id === 'rage' && me.rage) continue;       // already raging
    if (id === 'raisedead' && me.minion) continue; // minion still up
    if (id === 'totem' && me.totem) continue;      // totem still planted
    if (id === 'swallow' && me.swallowUses <= 0) continue;
    if (id === 'deathbomb' && me.deathbombUsed) continue;
    if (id === 'murder' && (me.murderUsed || me.flock <= 0)) continue; // need a Flock to unleash
    if (id === 'ward' && me.ward >= 25) continue;
    if (id === 'guard' && (me.ward || 0) >= Math.round(GUARD_BASE + me.stats.marrow * 0.15)) continue;
    let windCost = windCostFor(me, id, a);
    let ok = fight.ap >= a.ap && me.wind >= windCost;
    if (id === 'flurry') { windCost = me.wind; ok = fight.ap >= a.ap && me.wind >= 30; }
    out.push({ id, ...a, windCost, enabled: ok && !fight.over });
  }
  return out;
}

// apply one action by the active fighter; returns event list
export function applyAction(fight, actionId) {
  const me = fighterOf(fight, fight.active);
  const defWho = targetWhoFor(fight, fight.active);
  const them = fighterOf(fight, defWho);
  const a = ACTIONS[actionId];
  const events = [];
  const windCost = a ? windCostFor(me, actionId, a) : 0;
  if (!a || fight.over) return events;
  if (fight.ap < a.ap || me.wind < windCost) return events;

  fight.ap -= a.ap;
  me.wind -= windCost;
  if (['jab', 'swing', 'haymaker', 'guard'].includes(actionId)) {
    me.recentCloseMoves.push(actionId);
    if (me.recentCloseMoves.length > 6) me.recentCloseMoves.shift();
  }

  switch (actionId) {
    case 'guard': {
      // Bone Guard: THE defensive move (Rattle retired v118 — two defense buttons
      // was one too many). Raise an absorb pool (Marrow-scaled) AND catch your
      // breath (restore Stamina). Heckle folds in here: your guard also rattles
      // the enemy — they deal 25% less damage for 3 turns.
      const shield = Math.round(GUARD_BASE + me.stats.marrow * 0.15);
      me.ward = Math.max(me.ward || 0, shield);
      me.wind = Math.min(me.d.maxWind, me.wind + GUARD_STAMINA);
      gainHype(me, a.hype);
      events.push({ t: 'status', who: fight.active, kind: 'guard', shield });
      if (me.talents.has('heckle')) {
        if (!them.weaken || them.weaken.pct < 0.25) them.weaken = { pct: 0.25, turns: 3 };
        events.push({ t: 'status', who: defWho, kind: 'weaken' });
      }
      break;
    }
    case 'signature': {
      if (me.hype < sigThreshold(me)) break;
      me.hype = 0;
      const boost = me.talents.has('showstopper') ? 1.25 : 1;
      const encore = Math.pow(Math.min(0.95, 0.75 + rkOf(me, 'encoretraining') * 0.05), me.sigsUsed); // the crowd's seen this one before
      me.sigsUsed += 1;
      const dmg = Math.round(ACTIONS.signature.base * me.d.powerMult * boost * encore * (1 - (them.d.armor || 0)));
      dealDamage(fight, defWho, dmg, events);
      events.push({ t: 'hit', who: fight.active, move: 'signature', damage: dmg, crit: false, glance: false, signature: true });
      break;
    }
    case 'titan': {
      me.titanUsed = true;
      const r = resolveHit({ move: 'titan', attacker: me, defender: them, rng: fight.rng });
      if (r.miss) {
        me.offBalance = !!r.offBalance;
        events.push({ t: 'miss', who: fight.active, move: 'titan', whiffed: true });
        break;
      }
      dealDamage(fight, defWho, r.damage, events);
      if (r.damage > 0) {
        gainHype(me, a.hype || 0);
        gainHype(them, HIT_TAKEN_HYPE);
        if (me.talents.has('marrowlust')) {
          const heal = Math.round(r.damage * 0.25 * healMult(me));
          me.hp = Math.min(me.d.maxHp, me.hp + heal);
          events.push({ t: 'heal', who: fight.active, amount: heal });
        }
      }
      events.push({ t: 'hit', who: fight.active, move: 'titan', ...r, titan: true });
      break;
    }
    case 'flurry': {
      const spent = me.wind;
      me.wind = 0;
      const mult = 1 + spent / 120;
      for (let h = 0; h < 3 && them.hp > 0; h++) {
        const r = resolveHit({ move: 'flurry', attacker: me, defender: them, rng: fight.rng });
        const dmg = Math.round(r.damage * mult);
        dealDamage(fight, defWho, dmg, events);
        if (dmg > 0) { gainHype(me, 6); gainHype(them, HIT_TAKEN_HYPE); }
        events.push({ t: 'hit', who: fight.active, move: 'flurry', damage: dmg, crit: r.crit, glance: false, flurry: true, hitNo: h + 1, whiffed: !!r.whiffed });
      }
      break;
    }
    case 'bonebolt': {
      const r = resolveHit({ move: 'bonebolt', attacker: me, defender: them, rng: fight.rng });
      dealDamage(fight, defWho, r.damage, events);
      if (r.damage > 0) {
        gainHype(me, a.hype || 0);
        gainHype(them, them.talents.has('ovation') ? Math.round(HIT_TAKEN_HYPE * 1.5) : HIT_TAKEN_HYPE);
        if (me.talents.has('soulsiphon')) {
          const heal = Math.round(r.damage * 0.30 * healMult(me));
          me.hp = Math.min(me.d.maxHp, me.hp + heal);
          events.push({ t: 'heal', who: fight.active, amount: heal });
        }
        if (me.talents.has('gravechill')) {
          them.wind = Math.max(0, them.wind - 10);
          events.push({ t: 'status', who: defWho, kind: 'chill' });
        }
      }
      events.push({ t: 'hit', who: fight.active, move: 'bonebolt', ...r, magic: true });
      break;
    }
    case 'mend': {
      me.mendUses -= 1;
      const heal = Math.round((me.d.maxHp * (0.12 + rkOf(me, 'mercy') * 0.03) + 8 * me.d.magicMult) * healMult(me));
      me.hp = Math.min(me.d.maxHp, me.hp + heal);
      events.push({ t: 'heal', who: fight.active, amount: heal, mend: true, usesLeft: me.mendUses });
      break;
    }
    case 'hex': {
      { const hexPct = 0.20 + rkOf(me, 'lingering') * 0.03; if (!them.weaken || them.weaken.pct <= hexPct) them.weaken = { pct: hexPct, turns: 2 }; }
      events.push({ t: 'status', who: defWho, kind: 'hex' });
      break;
    }
    case 'smite': {
      const r = resolveHit({ move: 'smite', attacker: me, defender: them, rng: fight.rng });
      dealDamage(fight, defWho, r.damage, events);
      if (r.damage > 0) {
        gainHype(me, a.hype || 0);
        gainHype(them, them.talents.has('ovation') ? Math.round(HIT_TAKEN_HYPE * 1.5) : HIT_TAKEN_HYPE);
        if (me.talents.has('radiance')) {
          const heal = Math.round(r.damage * 0.20 * healMult(me));
          me.hp = Math.min(me.d.maxHp, me.hp + heal);
          events.push({ t: 'heal', who: fight.active, amount: heal });
        }
      }
      events.push({ t: 'hit', who: fight.active, move: 'smite', ...r, magic: true });
      break;
    }
    case 'ward': {
      me.ward = 25 + rkOf(me, 'blessedward') * 5;
      events.push({ t: 'status', who: fight.active, kind: 'ward' });
      break;
    }
    case 'frostbolt': {
      const r = resolveHit({ move: 'frostbolt', attacker: me, defender: them, rng: fight.rng });
      dealDamage(fight, defWho, r.damage, events);
      if (r.damage > 0) {
        gainHype(me, a.hype || 0);
        gainHype(them, them.talents.has('ovation') ? Math.round(HIT_TAKEN_HYPE * 1.5) : HIT_TAKEN_HYPE);
        them.wind = Math.max(0, them.wind - 8 - rkOf(me, 'deepfreeze') * 3);
        events.push({ t: 'status', who: defWho, kind: 'chill' });
      }
      events.push({ t: 'hit', who: fight.active, move: 'frostbolt', ...r, magic: true });
      break;
    }
    case 'firebolt': {
      const r = resolveHit({ move: 'firebolt', attacker: me, defender: them, rng: fight.rng });
      dealDamage(fight, defWho, r.damage, events);
      if (r.damage > 0) {
        gainHype(me, a.hype || 0);
        gainHype(them, them.talents.has('ovation') ? Math.round(HIT_TAKEN_HYPE * 1.5) : HIT_TAKEN_HYPE);
        them.burn = { per: (me.talents.has('wildfire') ? 7 : 5) + rkOf(me, 'kindling'), turns: me.talents.has('wildfire') ? 3 : 2 };
        events.push({ t: 'status', who: defWho, kind: 'burn' });
      }
      events.push({ t: 'hit', who: fight.active, move: 'firebolt', ...r, magic: true });
      break;
    }
    case 'tempest': {
      me.tempestUsed = true;
      let landed = false;
      for (let h = 0; h < 4 && them.hp > 0; h++) {
        const school = h % 2 === 0 ? 'fire' : 'frost';
        const r = resolveHit({ move: 'tempest', attacker: me, defender: them, rng: fight.rng });
        dealDamage(fight, defWho, r.damage, events);
        if (r.damage > 0) { landed = true; gainHype(me, 4); gainHype(them, them.talents.has('ovation') ? 6 : 4); }
        events.push({ t: 'hit', who: fight.active, move: 'tempest', damage: r.damage, crit: r.crit, glance: false, storm: true, school, hitNo: h + 1, whiffed: !!r.whiffed });
      }
      if (landed && them.hp > 0) {
        them.burn = { per: (me.talents.has('wildfire') ? 7 : 5) + rkOf(me, 'kindling'), turns: me.talents.has('wildfire') ? 3 : 2 };
        them.wind = Math.max(0, them.wind - 8 - rkOf(me, 'deepfreeze') * 3);
        events.push({ t: 'status', who: defWho, kind: 'burn' });
        events.push({ t: 'status', who: defWho, kind: 'chill' });
      }
      break;
    }
    case 'rage': {
      me.rage = { turns: 3 };
      events.push({ t: 'status', who: fight.active, kind: 'rage' });
      break;
    }
    case 'raisedead': {
      me.minion = { turns: 3, dmg: Math.max(6, Math.round(12 * me.d.magicMult * (1 + rkOf(me, 'darkstudy') * 0.03))) };
      events.push({ t: 'summon', who: fight.active, kind: 'minion' });
      break;
    }
    case 'totem': {
      me.totem = { turns: 3, dmg: Math.max(4, Math.round(8 * me.d.magicMult * (1 + rkOf(me, 'attunement') * 0.03))) };
      events.push({ t: 'summon', who: fight.active, kind: 'totem' });
      break;
    }
    case 'fireflask': {
      const r = resolveHit({ move: 'fireflask', attacker: me, defender: them, rng: fight.rng });
      dealDamage(fight, defWho, r.damage, events);
      if (r.damage > 0) {
        gainHype(me, a.hype || 0);
        gainHype(them, them.talents.has('ovation') ? Math.round(HIT_TAKEN_HYPE * 1.5) : HIT_TAKEN_HYPE);
        them.burn = { per: 5 + rkOf(me, 'kindling'), turns: 2 };
        events.push({ t: 'status', who: defWho, kind: 'burn' });
      }
      addToxicity(me, 18);
      events.push({ t: 'hit', who: fight.active, move: 'fireflask', ...r, magic: true, toxicity: me.toxicity });
      break;
    }
    case 'acidvial': {
      const r = resolveHit({ move: 'acidvial', attacker: me, defender: them, rng: fight.rng });
      dealDamage(fight, defWho, r.damage, events);
      if (r.damage > 0) {
        gainHype(me, a.hype || 0);
        gainHype(them, them.talents.has('ovation') ? Math.round(HIT_TAKEN_HYPE * 1.5) : HIT_TAKEN_HYPE);
        them.sunder = { turns: 2 };
        events.push({ t: 'status', who: defWho, kind: 'sunder' });
        if (me.talents.has('corrode')) { them.wind = Math.max(0, them.wind - 12); events.push({ t: 'status', who: defWho, kind: 'chill' }); }
      }
      addToxicity(me, 18);
      events.push({ t: 'hit', who: fight.active, move: 'acidvial', ...r, magic: true, toxicity: me.toxicity });
      break;
    }
    case 'swallow': {
      me.swallowUses -= 1;
      const heal = Math.round(me.d.maxHp * 0.12 * healMult(me));
      me.hp = Math.min(me.d.maxHp, me.hp + heal);
      addToxicity(me, 10);
      events.push({ t: 'heal', who: fight.active, amount: heal, mend: true, usesLeft: me.swallowUses, toxicity: me.toxicity });
      break;
    }
    case 'callcrows': {
      const cap = 4 + rkOf(me, 'flock');
      me.flock = Math.min(cap, (me.flock || 0) + 2);
      events.push({ t: 'summon', who: fight.active, kind: 'crows', crows: me.flock });
      break;
    }
    case 'peckeyes': {
      const r = resolveHit({ move: 'peckeyes', attacker: me, defender: them, rng: fight.rng });
      dealDamage(fight, defWho, r.damage, events);
      if (r.damage > 0) {
        gainHype(me, a.hype || 0);
        gainHype(them, them.talents.has('ovation') ? Math.round(HIT_TAKEN_HYPE * 1.5) : HIT_TAKEN_HYPE);
        them.blind = { pct: 0.30, turns: me.talents.has('nightwing') ? 3 : 2 };
        events.push({ t: 'status', who: defWho, kind: 'blind' });
      }
      const cap = 4 + rkOf(me, 'flock');
      me.flock = Math.min(cap, (me.flock || 0) + 1); // the diving flock grows
      events.push({ t: 'hit', who: fight.active, move: 'peckeyes', ...r, magic: true, crows: me.flock });
      break;
    }
    case 'murder': {
      me.murderUsed = true;
      const crows = me.flock || 0;
      me.flock = 0; // the Murder scatters after it strikes
      const hits = Math.max(1, Math.min(6, crows));
      for (let h = 0; h < hits && them.hp > 0; h++) {
        const r = resolveHit({ move: 'murder', attacker: me, defender: them, rng: fight.rng });
        dealDamage(fight, defWho, r.damage, events);
        if (r.damage > 0) { gainHype(me, 4); gainHype(them, them.talents.has('ovation') ? 6 : 4); }
        events.push({ t: 'hit', who: fight.active, move: 'murder', damage: r.damage, crit: r.crit, glance: false, storm: true, hitNo: h + 1, whiffed: !!r.whiffed });
      }
      break;
    }
    case 'deathbomb': {
      me.deathbombUsed = true;
      addToxicity(me, 30);
      for (let h = 0; h < 3 && them.hp > 0; h++) {
        const r = resolveHit({ move: 'deathbomb', attacker: me, defender: them, rng: fight.rng });
        dealDamage(fight, defWho, r.damage, events);
        if (r.damage > 0) { gainHype(me, 5); gainHype(them, them.talents.has('ovation') ? 6 : 4); }
        events.push({ t: 'hit', who: fight.active, move: 'deathbomb', damage: r.damage, crit: r.crit, glance: false, storm: true, hitNo: h + 1, whiffed: !!r.whiffed, toxicity: me.toxicity });
      }
      if (them.hp > 0) { them.burn = { per: 5 + rkOf(me, 'kindling'), turns: 2 }; events.push({ t: 'status', who: defWho, kind: 'burn' }); }
      break;
    }
    case 'bonestorm': {
      me.bonestormUsed = true;
      for (let h = 0; h < 3 && them.hp > 0; h++) {
        const r = resolveHit({ move: 'bonestorm', attacker: me, defender: them, rng: fight.rng });
        dealDamage(fight, defWho, r.damage, events);
        if (r.damage > 0) { gainHype(me, 5); gainHype(them, them.talents.has('ovation') ? 6 : 4); }
        events.push({ t: 'hit', who: fight.active, move: 'bonestorm', damage: r.damage, crit: r.crit, glance: false, storm: true, hitNo: h + 1, whiffed: !!r.whiffed });
      }
      break;
    }
    case 'bonespike': {
      const r = resolveHit({ move: 'bonespike', attacker: me, defender: them, rng: fight.rng });
      dealDamage(fight, defWho, r.damage, events);
      if (r.damage > 0) {
        gainHype(me, a.hype || 0);
        gainHype(them, them.talents.has('ovation') ? Math.round(HIT_TAKEN_HYPE * 1.5) : HIT_TAKEN_HYPE);
        them.blind = { pct: 0.30, turns: 2 };
        events.push({ t: 'status', who: defWho, kind: 'blind' });
      }
      events.push({ t: 'hit', who: fight.active, move: 'bonespike', ...r, magic: true });
      break;
    }
    default: { // jab / swing / haymaker
      const move = actionId;
      const r = resolveHit({ move, attacker: me, defender: them, rng: fight.rng });
      if (r.miss) {
        me.offBalance = r.whiffed ? !!r.offBalance : true;
        events.push({ t: 'miss', who: fight.active, move, whiffed: !!r.whiffed, offBalance: me.offBalance });
        // counterstep: any missed enemy attack (heavies whiff now that Dodge is gone)
        // opens a free counter-jab for the defender who has it
        if (them.talents.has('counterstep')) {
          const c = resolveHit({ move: 'jab', attacker: them, defender: { ...me, state: null, d: me.d, talents: me.talents, sunder: me.sunder }, rng: fight.rng });
          dealDamage(fight, fight.active, c.damage, events);
          if (c.damage > 0) gainHype(them, 6);
          events.push({ t: 'counter', who: defWho, damage: c.damage, crit: c.crit });
        }
      } else {
        dealDamage(fight, defWho, r.damage, events);
        if (r.breaksGuard) { them.state = null; }
        if (r.stagger || (move === 'haymaker' && r.damage > 0 && me.talents.has('concussive'))) { them.stagger = true; }
        if (r.damage > 0) {
          gainHype(me, a.hype || 0);
          gainHype(them, them.talents.has('ovation') ? Math.round(HIT_TAKEN_HYPE * 1.5) : HIT_TAKEN_HYPE);
          if (move === 'haymaker' && me.talents.has('marrowlust')) {
            const heal = Math.round(r.damage * 0.25 * healMult(me));
            me.hp = Math.min(me.d.maxHp, me.hp + heal);
            events.push({ t: 'heal', who: fight.active, amount: heal });
          }
          if (move === 'haymaker' && me.talents.has('bonebreaker')) {
            them.sunder = { turns: 2 };
            events.push({ t: 'status', who: defWho, kind: 'sunder' });
          }
          if (move === 'jab' && me.talents.has('bleedout')) {
            them.bleed = { stacks: Math.min(3, (them.bleed ? them.bleed.stacks : 0) + 1), turns: 3 };
            events.push({ t: 'status', who: defWho, kind: 'bleed', stacks: them.bleed.stacks });
          }
          // Kite (repurposed from the retired Throw): hit-and-run jabs sap their gas
          if (move === 'jab' && me.talents.has('kite')) {
            them.wind = Math.max(0, them.wind - 8);
          }
        }
        events.push({ t: 'hit', who: fight.active, move, ...r });
      }
    }
  }

  checkOver(fight);
  if (fight.over && fight.over.winner !== 'draw') events.push({ t: 'ko', who: fight.over.winner });
  return events;
}

// damage-over-time ticks (bleed / burn / poison) for one fighter
function tickDots(f, who, ticks) {
  if (f.bleed) {
    const tick = 4 * f.bleed.stacks;
    f.hp = Math.max(0, f.hp - tick);
    ticks.push({ t: 'bleedtick', who, damage: tick });
    f.bleed.turns -= 1; if (f.bleed.turns <= 0) f.bleed = null;
  }
  if (f.hp > 0 && f.burn) {
    f.hp = Math.max(0, f.hp - f.burn.per);
    ticks.push({ t: 'burntick', who, damage: f.burn.per });
    f.burn.turns -= 1; if (f.burn.turns <= 0) f.burn = null;
  }
  if (f.hp > 0 && f.poison) {
    const tick = f.poison.per * f.poison.stacks;
    f.hp = Math.max(0, f.hp - tick);
    ticks.push({ t: 'poisontick', who, damage: tick });
    f.poison.turns -= 1; if (f.poison.turns <= 0) f.poison = null;
  }
}

// count down timed debuffs for one fighter
function tickTimers(f) {
  if (f.sunder) { f.sunder.turns -= 1; if (f.sunder.turns <= 0) f.sunder = null; }
  if (f.weaken) { f.weaken.turns -= 1; if (f.weaken.turns <= 0) f.weaken = null; }
  if (f.blind) { f.blind.turns -= 1; if (f.blind.turns <= 0) f.blind = null; }
  if (f.marked) { f.marked.turns -= 1; if (f.marked.turns <= 0) f.marked = null; }
  if (f.elixir) { f.elixir.turns -= 1; if (f.elixir.turns <= 0) f.elixir = null; }
}

// end the active fighter's turn, start the other's
export function endTurn(fight) {
  const next = fight.active === 'p' ? 'f' : 'p';
  fight.active = next;
  const me = fighterOf(fight, next);
  // my defensive state persisted through the opponent's turn; clears now
  me.state = null;
  me.wind = Math.min(me.d.maxWind, me.wind + REGEN_PER_TURN + (me.talents.has('totemic') ? 5 : 0) + rkOf(me, 'pacing') * 2);
  // DoTs tick for the captain AND any living aux (pet / add) on this side
  const ticks = [];
  // Bone Broth: heal a little at the start of your turn
  if (me.foodRegenPct && me.hp > 0) {
    const h = Math.round(me.d.maxHp * me.foodRegenPct);
    me.hp = Math.min(me.d.maxHp, me.hp + h);
    ticks.push({ t: 'heal', who: next, amount: h, food: true });
  }
  tickDots(me, next, ticks);
  if (me.toxicity > 0) me.toxicity = Math.max(0, me.toxicity - 10); // Alchemist Toxicity bleeds off
  // v70 class-identity ticks, at the START of this fighter's turn
  if (me.rage && me.hp > 0) {
    me.hp = Math.max(1, me.hp - 6); // bleed the cost; never self-KO
    ticks.push({ t: 'ragetick', who: next, damage: 6 });
    me.rage.turns -= 1; if (me.rage.turns <= 0) { me.rage = null; ticks.push({ t: 'ragefade', who: next }); }
  }
  if (me.hp > 0 && me.flock > 0) { // Crow Lord: the Flock pecks at the start of your turn
    const foeWho = next === 'p' ? 'f' : 'p';
    const foe = fighterOf(fight, foeWho);
    if (foe && foe.hp > 0) {
      const perCrow = Math.max(2, 2 + rkOf(me, 'sharpbeaks') + Math.floor((me.d.magicMult - 1) * 4));
      const dmg = me.flock * perCrow;
      foe.hp = Math.max(0, foe.hp - dmg);
      ticks.push({ t: 'crowpeck', who: foeWho, damage: dmg, crows: me.flock });
      if (rkOf(me, 'scavenge')) foe.wind = Math.max(0, foe.wind - me.flock * rkOf(me, 'scavenge'));
      if (me.talents.has('carrion')) { const h = Math.round(dmg * 0.3 * healMult(me)); me.hp = Math.min(me.d.maxHp, me.hp + h); ticks.push({ t: 'heal', who: next, amount: h }); }
      if (me.talents.has('omen') && me.flock >= 4 && (!foe.weaken || foe.weaken.pct < 0.15)) foe.weaken = { pct: 0.15, turns: 2 };
    }
  }
  if (me.hp > 0 && (me.minion || me.totem)) {
    const foeWho = next === 'p' ? 'f' : 'p';
    const foe = fighterOf(fight, foeWho);
    const foeUp = foe && foe.hp > 0;
    if (me.minion) {
      if (foeUp) { foe.hp = Math.max(0, foe.hp - me.minion.dmg); ticks.push({ t: 'minionstrike', who: foeWho, damage: me.minion.dmg }); }
      me.minion.turns -= 1; if (me.minion.turns <= 0) me.minion = null;
    }
    if (me.totem) {
      if (foeUp && foe.hp > 0) { foe.hp = Math.max(0, foe.hp - me.totem.dmg); ticks.push({ t: 'totemtick', who: foeWho, damage: me.totem.dmg }); }
      me.wind = Math.min(me.d.maxWind, me.wind + 8);
      me.totem.turns -= 1; if (me.totem.turns <= 0) me.totem = null;
    }
  }
  const auxWho = next === 'p' ? 'pa' : 'fa';
  const aux = fighterOf(fight, auxWho);
  if (aux && aux.hp > 0 && !aux.fainted) {
    tickDots(aux, auxWho, ticks);
    if (aux.isPet && aux.hp <= 0 && !aux.fainted) {
      aux.fainted = true; if (aux.owner) aux.owner.pet = null;
      ticks.push({ t: 'faint', who: auxWho, name: aux.name });
    }
  }
  checkOver(fight);
  // the pet no longer auto-acts; it takes its own player-driven turn (petActionsFor
  // / applyPetAction). Its special cooldown ticks down at the start of your turn.
  if (next === 'p' && fight.p.pet && fight.p.pet.specialCd > 0) fight.p.pet.specialCd -= 1;
  fight.pendingTick = ticks[0] || null;
  fight.pendingTicks = ticks;
  tickTimers(me);
  if (aux && !aux.fainted) tickTimers(aux);
  let ap = me.d.ap;
  if (me.stagger) { ap = Math.max(1, ap - 1); me.stagger = false; }
  if (me.offBalance) { ap = Math.max(1, ap - 1); me.offBalance = false; }
  fight.ap = ap;
  if (next === 'p') fight.turn += 1;
  if (fight.turn > TURN_CAP) fight.over = { winner: 'draw' };
  return fight;
}

/* ================= AI (V1 heuristic, tendency reads) ================= */

function haymakerRate(moves) {
  const atk = moves.filter(m => ['jab', 'swing', 'haymaker'].includes(m));
  if (atk.length < 2) return 0;
  return atk.filter(m => m === 'haymaker').length / atk.length;
}

// run one enemy fighter's whole turn (captain or add), pushing events
function actForEnemy(fight, who, events) {
  const f = fighterOf(fight, who), p = fight.p;
  f._sweptThisTurn = false;
  const petUp = () => fight.pAux && !fight.pAux.fainted && fight.pAux.hp > 0 && p.pet;
  // pick a target for this turn: usually the player, but often go after a living
  // pet to strip its aura (more tempting the lower the pet already is)
  fight.fTarget = 'p';
  if (petUp()) {
    const petLow = fight.pAux.hp <= fight.pAux.d.maxHp * 0.4;
    if (fight.rng() < (petLow ? 0.35 : 0.15)) fight.fTarget = 'pa';
  }
  let guard = 0;
  while (!fight.over && fight.active === who && fight.ap > 0 && guard++ < 6) {
    const legal = actionsFor(fight).filter(x => x.enabled);
    if (!legal.length) break;
    const pick = (id) => legal.find(x => x.id === id);
    let choice = null;

    // Boss AoE: tough foes occasionally sweep the whole team, hurting BOTH you
    // and your pet in one blow (protect the pet — it can be downed).
    if (fight.aiLevel >= 4 && petUp() && !f._sweptThisTurn
        && fight.ap >= 1 && f.wind >= 20 && fight.rng() < 0.16) {
      f._sweptThisTurn = true; fight.ap -= 1; f.wind -= 20;
      const rY = resolveHit({ move: 'swing', attacker: f, defender: fight.p, rng: fight.rng });
      const rP = resolveHit({ move: 'swing', attacker: f, defender: fight.pAux, rng: fight.rng });
      const dmgYou = Math.round(rY.damage * 0.8), dmgPet = Math.round(rP.damage * 0.8);
      events.push({ t: 'foeAction', id: 'sweep' });
      events.push({ t: 'aoe', who, dmgYou, dmgPet, name: f.name });
      dealDamage(fight, 'p', dmgYou, events);
      dealDamage(fight, 'pa', dmgPet, events);
      gainHype(fight.p, 4);
      checkOver(fight);
      continue;
    }

    // heavies are UNANNOUNCED now (no telegraph): the foe just throws one when
    // it has the gas, so Guard is a read/rhythm call, not a reaction to a banner
    if (pick('haymaker') && fight.rng() < (0.28 + fight.aiLevel * 0.04)) {
      choice = 'haymaker';
    } else if (pick('signature')) {
      choice = 'signature';
    } else if (pick('titan') && fight.rng() < 0.6) {
      choice = 'titan';
    } else {
      // Active-defense AI: raise a Bone Guard when hurt, but mostly press the attack.
      const lowHp = f.hp <= f.d.maxHp * 0.30;
      const roll = fight.rng();
      if (lowHp && (f.ward || 0) <= 0 && pick('guard') && roll < 0.45 + fight.aiLevel * 0.05) choice = 'guard';
      else if (roll < 0.60 && pick('swing')) choice = 'swing';
      else if (roll < 0.82 && pick('jab')) choice = 'jab';
      else if (pick('swing')) choice = 'swing';
      else if (pick('jab')) choice = 'jab';
      else choice = legal[0].id;
    }
    events.push({ t: 'foeAction', id: choice });
    events.push(...applyAction(fight, choice));
  }
}

// the whole enemy phase: the boss captain acts, then its add (if any). In a 1v1
// there is no add, so this is just the captain (identical to before).
export function aiTakeTurn(fight) {
  const events = [];
  if (fight.f.hp > 0) actForEnemy(fight, 'f', events);
  if (fight.fAux && fight.fAux.hp > 0 && !fight.over) {
    fight.active = 'fa';
    fight.ap = fight.fAux.d.ap;
    events.push({ t: 'foeAction', id: 'add' });
    actForEnemy(fight, 'fa', events);
    fight.active = 'f'; // restore so endTurn flips f -> p
  }
  return events;
}

/* ================= simulation (tests + tuning) ================= */

// simple player policy for pacing sims: mirrors the spec's §9 fight style
export function simulate({ pStats, fStats, seed = 1, pWeapon = 'starter', fWeapon = 'starter' }) {
  const fight = createFight({
    player: makeFighter({ name: 'A', stats: pStats, weaponId: pWeapon }),
    foe: makeFighter({ name: 'B', stats: fStats, weaponId: fWeapon }),
    seed,
  });
  let guard = 0;
  while (!fight.over && guard++ < 200) {
    if (fight.active === 'p') {
      let inner = 0;
      while (!fight.over && fight.active === 'p' && fight.ap > 0 && inner++ < 6) {
        const legal = actionsFor(fight).filter(x => x.enabled);
        if (!legal.length) break;
        const pick = id => legal.find(x => x.id === id);
        let c;
        // no telegraph to react to anymore: guard on a read (hurt + shield down)
        if ((fight.p.ward || 0) <= 0 && fight.p.hp < fight.p.d.maxHp * 0.55 && pick('guard') && fight.rng() < 0.4) c = 'guard';
        else if (pick('signature')) c = 'signature';
        else if (pick('swing')) c = 'swing';
        else if (pick('jab')) c = 'jab';
        else c = legal[0].id;
        applyAction(fight, c);
      }
      if (!fight.over) endTurn(fight);
    } else {
      aiTakeTurn(fight);
      if (!fight.over) endTurn(fight);
    }
  }
  return { turns: fight.turn, winner: fight.over ? fight.over.winner : 'draw' };
}

/* ================= ladder ================= */

export const LADDER = [
  { rung: 1, name: 'Rattles', mult: 0.55, coins: 60, repeatCoins: 15, xp: 40 },
  { rung: 2, name: 'Knuckles', mult: 0.68, coins: 70, repeatCoins: 15, xp: 40 },
  { rung: 3, name: 'Big Femur', mult: 0.8, coins: 80, repeatCoins: 20, xp: 45 },
  { rung: 4, name: 'The Gravekeeper', mult: 0.92, coins: 90, repeatCoins: 20, xp: 50 },
  { rung: 5, name: 'Two-Ton Tibia', mult: 1.02, coins: 110, repeatCoins: 25, xp: 55 },
  { rung: 6, name: 'Skullcracker', mult: 1.1, coins: 130, repeatCoins: 25, xp: 60 },
  { rung: 7, name: 'The Bonecollector', mult: 1.18, coins: 150, repeatCoins: 30, xp: 70 },
  { rung: 8, name: 'Ribcage Ricky', mult: 1.26, coins: 175, repeatCoins: 30, xp: 80 },
];
export const CHAMPION = { name: 'The Marrow King', mult: 1.32, coins: 220, repeatCoins: 40, xp: 100, weaponId: 'bonecrusher', talents: ['heavyhands', 'marrowlust', 'bonebreaker', 'concussive', 'thickskull', 'titan'] };
export const RUNG_TALENTS = {
  4: ['heavyhands'],
  5: ['heavyhands', 'marrowlust'],
  6: ['heavyhands', 'marrowlust', 'bonebreaker'],
  7: ['lightfeet', 'counterstep', 'kite', 'bleedout'],
  8: ['heavyhands', 'marrowlust', 'bonebreaker', 'concussive', 'thickskull'],
};

// Endless ladder: past the Champion, foes scale forever so the Pit never runs
// dry. First-clear XP is real; repeat coins diminish so it's not a farm exploit.
// Access is GATED by world-boss den wins (see gating in app.js) so you can't
// couch-grind to the top: you have to go outside.
const ENDLESS_NAMES = ['The Hollow King', 'Gravemaw', 'The Tallboy', 'Ossuary Prime', 'Rattle Lord', 'The Marrowmancer', 'Bonefather', 'Calcite the Cruel'];
const ENDLESS_TREES = [
  ['heavyhands', 'marrowlust', 'bonebreaker', 'concussive', 'thickskull', 'titan'],
  ['lightfeet', 'counterstep', 'kite', 'bleedout', 'deeplungs', 'flurry'],
  ['crowdwork', 'bigentrance', 'heckle', 'ovation', 'secondwind', 'showstopper'],
  ['bonebolt', 'soulsiphon', 'gravechill', 'mend', 'hex', 'bonestorm'],
  ['smite', 'radiance', 'ward', 'judgement', 'hallowed', 'lastlight'],
  ['frostbolt', 'firebolt', 'totemic', 'frostbite', 'wildfire', 'tempest'],
];
export function endlessFoe(rank) {
  const cycle = Math.floor((rank - 1) / ENDLESS_NAMES.length) + 1;
  const base = ENDLESS_NAMES[(rank - 1) % ENDLESS_NAMES.length];
  return {
    rank,
    name: cycle > 1 ? `${base} ${['II', 'III', 'IV', 'V', 'VI'][cycle - 2] || cycle}` : base,
    mult: 1.32 + rank * 0.07,
    talents: ENDLESS_TREES[(rank - 1) % ENDLESS_TREES.length],
    weaponId: rank % 3 === 0 ? 'bonecrusher' : 'starter',
    aiLevel: 3,
    xp: 60 + rank * 10,
    coins: 120 + rank * 15,
    repeatCoins: 15 + Math.min(35, rank * 2),
  };
}
// How high you may climb: 3 free ranks, then +2 per distinct world-boss den beaten.
export function endlessCeiling(denWins) { return 5 + 3 * Math.max(0, denWins); }

export function scaleStats(stats, mult) {
  const out = {};
  for (const k of Object.keys(stats)) out[k] = Math.max(5, Math.min(100, Math.round(stats[k] * mult)));
  return out;
}
