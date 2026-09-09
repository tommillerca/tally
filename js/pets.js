// Pets in battle. Your equipped pet (slot C) fights ALONGSIDE your bonehead in
// the Pit as an auto-companion, modeled on WoW hunter pets (one always-on
// PASSIVE + one on-use ABILITY on a cooldown) with a WoW-pet-battle-style
// mini-tree (one-of-two choice per tier, unlocked by pet level from walking).
// Pure module: no DOM. The engine (pit.js) consumes buildBattlePet() output and
// resolves abilities via petAbilityEffect(); the family passive folds into
// resolveHit/dealDamage like a talent.
import { BH_BY_ID } from '../data/boneheadz.js';

// ---- families (fixed per pet, echoing hunter specs) ----
// cooldown is authoritative for the manual special action in PET_ACTIONS.
export const PET_FAMILIES = {
  hound: {
    key: 'hound', name: 'Hound', role: 'DPS', color: '#ff7a45',
    blurb: 'Bites for chip damage and leaves poison.',
    cooldown: 2,
    passive: 'yourDamage',          // +X% your outgoing damage
  },
  warden: {
    key: 'warden', name: 'Warden', role: 'Support', color: '#8fd0ff',
    blurb: 'Shields and mends you.',
    cooldown: 4,
    passive: 'damageTaken',         // -X% damage you take
  },
  imp: {
    key: 'imp', name: 'Imp', role: 'Utility', color: '#c084fc',
    blurb: 'Curses the enemy to hit softer.',
    cooldown: 4,
    passive: 'hypeGain',            // +X% hype gain
  },
};

// hand-assigned so every family is represented across the five pets
export const PET_ASSIGN = {
  C1: 'imp',      // Cosmic Pet
  C2: 'warden',   // Eternal Pet (legendary healer)
  C3: 'hound',    // Corner-store Pet
  C4: 'hound',    // Basic Pet
  C5: 'warden',   // Tidy Pet
  CX: 'hound',    // Day One Lizard (exclusive early-player reward), an amethyst C4
  /* Bumbleseal. SAME BUG CLASS AS THE ONE SHE WAS FOUND BY: she shipped in v421
     as a species this table had never heard of, and buildBattlePet's first line
     is `if (!PET_ASSIGN[petId]) return null`, so equipping the 50,000-coin
     legendary gave you NO pet in the Pit. Reachable in v421 through the 1% egg
     even before the purchase was fixed. Hound because the wardrobe sold for her
     includes a stinger and a sting is a bite that leaves poison, which is the
     hound passive in one sentence. Tom owns this call; it is here so she can
     fight at all, not because the family was designed for her. */
  C6: 'hound',    // Bumbleseal (Gwart's Emporium, 50,000 coins)
};
export function familyOf(petId) {
  const family = Object.hasOwn(PET_ASSIGN, petId) ? PET_ASSIGN[petId] : 'hound';
  requirePetFamily(family);
  return PET_FAMILIES[family];
}

function hasPetFamily(family) {
  return Object.hasOwn(PET_FAMILIES, family) && PET_FAMILIES[family]?.key === family
    && Object.hasOwn(PET_ACTIONS, family) && Array.isArray(PET_ACTIONS[family])
    && Object.hasOwn(PET_ABILITIES, family) && typeof PET_ABILITIES[family] === 'function'
    && Object.hasOwn(PET_TREES, family) && Array.isArray(PET_TREES[family]);
}

function requirePetFamily(family) {
  if (!hasPetFamily(family)) throw new Error(`Unknown or incomplete pet family: ${String(family)}`);
}

// Species must have both renderable catalogue identity and a complete combat kit.
export function isKnownPet(petId) {
  return typeof petId === 'string' && Object.hasOwn(PET_ASSIGN, petId)
    && Object.hasOwn(BH_BY_ID, petId) && BH_BY_ID[petId].slot === 'C'
    && Object.hasOwn(PET_STATS, petId) && hasPetFamily(PET_ASSIGN[petId]);
}

// Keep the first legal choice in each tier, in the caller's order. Invalid save
// data is discarded here; callers decide where to persist the returned subset.
export function legalPicks(petId, level, picks) {
  if (!isKnownPet(petId) || !Number.isFinite(level) || !Array.isArray(picks)) return [];
  const tree = PET_TREES[PET_ASSIGN[petId]], seen = new Set();
  return picks.filter(id => {
    const row = tree.find(row => level >= row.tier && row.opts.some(opt => opt.id === id));
    if (!row || seen.has(row.tier)) return false;
    seen.add(row.tier);
    return true;
  });
}

// Pets that HOVER in mid-air in combat — only genuinely airborne creatures (the
// flying duck C2). The cloud (C1) also flies but carries a baked ground shadow so
// it bottom-aligns; the catfish (C3), lizard (C4) and dog (C5) are not airborne
// and stand on the floor. Hand-assigned like PET_ASSIGN — add new flyers here.
export const HOVER_PETS = new Set(['C2']);
export function petHovers(petId) { return HOVER_PETS.has(petId); }

/* WHICH WAY DID CAM DRAW THIS ONE. Tom, 2026-08-22: "we need to mirror
   bumbleseal in the fights so she faces the enemy."
   Hand-assigned like HOVER_PETS and PET_ASSIGN above, and it has to be: facing
   is not derivable from the art. Measured on every pet plate's own alpha, the
   horizontal centroid sits LEFT of the ink box centre on both Bumbleseal (-6.7%
   of her width) and the Mallard (-7.1%), and the Mallard faces right, so the one
   number that looks like it should answer this answers it wrong. What it comes
   down to is where the face is: hers is the cream disc at the left of her plate
   (her left half is 1.59x brighter than her right), the Mallard's bill, the
   bulldog's muzzle and the beardie's head are all on the right.
   The Pit puts the player's pet on the LEFT with the foe on the right, so a
   left-facing pet fights with its back turned. Add a new pet here the day its
   art lands, the same as adding a flyer. */
export const FACES_LEFT = new Set(['C6']);
export function petFacesLeft(petId) { return FACES_LEFT.has(petId); }

// ---- mini-trees: 3 tiers, ONE-OF-TWO per tier, unlocked at pet level 2/4/6 ----
export const PET_TREES = {
  hound: [
    { tier: 2, opts: [
      { id: 'h-rabid', name: 'Rabid', desc: 'Bite lands a second poison stack.' },
      { id: 'h-bloodscent', name: 'Bloodscent', desc: 'When the pet bites, you heal 6% of its damage.' } ] },
    { tier: 4, opts: [
      { id: 'h-pack', name: 'Pack Tactics', desc: 'The pet bites every turn instead of every other.' },
      { id: 'h-venom', name: 'Venom', desc: 'Poison gains 50% of its base tick.' } ] },
    { tier: 6, opts: [
      { id: 'h-frenzy', name: 'Frenzy', desc: 'Below 25% enemy HP, the pet bites twice.' },
      { id: 'h-maul', name: 'Maul', desc: 'Bites can crit for double.' } ] },
    { tier: 8, opts: [
      { id: 'h-savage', name: 'Savage', desc: 'Bites hit 35% harder.' },
      { id: 'h-gore', name: 'Gore', desc: 'Poison lasts 2 extra turns.' } ] },
    { tier: 10, opts: [
      { id: 'h-plague', name: 'Plague', desc: 'Every bite lands an extra poison stack.' },
      { id: 'h-rupture', name: 'Rupture', desc: 'Poison gains 50% of its base tick (adds to Venom).' } ] },
  ],
  warden: [
    { tier: 2, opts: [
      { id: 'w-bulwark', name: 'Bulwark', desc: 'Shields gain 50% of their base size.' },
      { id: 'w-mend', name: 'Mend', desc: 'Also heals you 8% max HP when it shields.' } ] },
    { tier: 4, opts: [
      { id: 'w-cleanse', name: 'Cleanse', desc: 'Clears one bleed/burn/poison off you when it acts.' },
      { id: 'w-guardstance', name: 'Guard Stance', desc: 'Passive damage reduction is doubled.' } ] },
    { tier: 6, opts: [
      { id: 'w-laststand', name: 'Last Stand', desc: 'The first killing blow each fight is fully absorbed.' },
      { id: 'w-devotion', name: 'Devotion', desc: 'Shields also grant you +15 Stamina.' } ] },
    { tier: 8, opts: [
      { id: 'w-fortify', name: 'Fortify', desc: 'Shields gain another 40% of their base size.' },
      { id: 'w-renew', name: 'Renew', desc: 'Shielding also heals you 8% max HP.' } ] },
    { tier: 10, opts: [
      { id: 'w-immortal', name: 'Immortal', desc: 'Your passive damage reduction is 50% stronger.' },
      { id: 'w-bastion', name: 'Bastion', desc: 'Shields also grant you +25 Stamina.' } ] },
  ],
  imp: [
    { tier: 2, opts: [
      { id: 'i-jinx', name: 'Jinx', desc: 'Curse also blinds the enemy (they miss more).' },
      { id: 'i-siphon', name: 'Siphon', desc: 'Curse drains 8 of the enemy Stamina.' } ] },
    { tier: 4, opts: [
      { id: 'i-doublehex', name: 'Double Hex', desc: 'Curse hits 50% harder and lasts a turn longer.' },
      { id: 'i-showoff', name: 'Show-off', desc: 'Passive Hype gain is doubled.' } ] },
    { tier: 6, opts: [
      { id: 'i-mark', name: "Death's Mark", desc: 'Cursed enemies take +10% from everything.' },
      { id: 'i-trick', name: 'Trickster', desc: 'Curse also staggers the enemy (loses an action).' } ] },
    { tier: 8, opts: [
      { id: 'i-deephex', name: 'Deep Hex', desc: 'Curse weakens the enemy 50% more.' },
      { id: 'i-drain', name: 'Soul Drain', desc: 'Curse drains 16 enemy Stamina.' } ] },
    { tier: 10, opts: [
      { id: 'i-oblivion', name: 'Oblivion', desc: 'Curse lasts 1 extra turn.' },
      { id: 'i-havoc', name: 'Havoc', desc: 'Curse always staggers AND blinds the enemy.' } ] },
  ],
};

// ---- per-pet identity: base stats scale with RARITY, tilted by personality ----
// Every pet used to be a clone of its family; now each has its own stat line so a
// legendary is meaningfully stronger than a common and two same-family pets still
// feel different. `mult` is the rarity power budget; `tilt` redistributes it to
// give each pet a role flavour (glass-cannon, tank, evasive...). Commons sit at
// mult 1.0 with a light tilt so the early-game baseline is unchanged.
export const PET_RARITY_MULT = { common: 1.0, uncommon: 1.09, rare: 1.18, epic: 1.27, legendary: 1.36 };
export const PET_STATS = {
  C3: { rarity: 'common',    mult: 1.00, tilt: { power: 1.05, reflex: 0.97 } },            // Corner-store hound (catfish): scrappy biter
  C4: { rarity: 'common',    mult: 1.00, tilt: { power: 1.12, marrow: 0.85, reflex: 1.05 } }, // Basic hound (lizard): glass cannon
  C5: { rarity: 'uncommon',  mult: 1.09, tilt: { marrow: 1.15, power: 0.92 } },            // Tidy warden (dog): sturdy guardian
  C1: { rarity: 'epic',      mult: 1.27, tilt: { reflex: 1.12, wind: 1.06, power: 0.96 } }, // Cosmic imp (cloud): evasive utility
  C2: { rarity: 'legendary', mult: 1.36, tilt: { marrow: 1.08, reflex: 1.02 } },           // Eternal warden (duck): best all-round
  // Day One Lizard: an amethyst C4 for early players. Legendary GLOW for prestige,
  // but deliberately NOT a power pet: a well-rounded rare-tier line (mult 1.15,
  // balanced tilt) that sits clearly below the epic C1 (1.27) and legendary C2
  // (1.36), so it's a nice pet to have without breaking the game or the balance
  // audit. A thank-you, not best-in-slot.
  CX: { rarity: 'legendary', mult: 1.15, tilt: { power: 1.04, marrow: 1.06, reflex: 1.0 } }, // Day One hound (lizard): sturdy all-rounder
  /* Bumbleseal: THE DAY ONE LIZARD'S LINE, TO THE DIGIT, on purpose. She was
     missing from this table too, which silently made a 50,000-coin legendary a
     COMMON stat line (the `|| { rarity: 'common', mult: 1 }` fallback below).
     Rather than invent a number, she reuses the one line in here that already
     answers "a legendary GLOW that must not be best-in-slot": CX's, which is
     documented above as deliberately below the epic C1 (1.27) and the legendary
     C2 (1.36). Nothing new to balance, because nothing new was introduced. She is
     sold for coins and the house rule is that money never buys power. */
  C6: { rarity: 'legendary', mult: 1.15, tilt: { power: 1.04, marrow: 1.06, reflex: 1.0 } }, // Bumbleseal: prestige, not power
};
// Shiny (the ultra-rare recolour) is no longer purely cosmetic: it grants a small
// flat bump to every stat so a shiny pull is a genuine power upgrade, not a skin.
export const SHINY_STAT_MULT = 1.08;
// v128 breeding: each LINEAGE tier (bred by fusing two pets) adds a flat % to every
// stat. Lineage remains earned and recorded forever; combat has a finite budget.
export const PET_STAT_MULT_CAP = 1.5; // combined rarity, shiny and lineage budget
export const PET_LINEAGE_STEP = 0.05; // +5% per lineage tier

// Shared by combat stats and the Stable's capped bonus disclosure.
export function petStatMultiplier(petId, shiny = false, lineage = 0) {
  const rarity = PET_STATS[petId]?.mult || 1;
  const lin = Math.max(0, Math.floor(lineage || 0));
  return Math.min(PET_STAT_MULT_CAP, rarity * (shiny ? SHINY_STAT_MULT : 1) * (1 + lin * PET_LINEAGE_STEP));
}
export function petStatBonusText(petId, shiny = false, lineage = 0) {
  const mult = petStatMultiplier(petId, shiny, lineage);
  return `Combined rarity, shiny and lineage: ${Number(mult.toFixed(3))}x base stats${mult >= PET_STAT_MULT_CAP ? ' (cap reached)' : ` (cap ${PET_STAT_MULT_CAP}x)`}. Stats round individually.`;
}
export function petBreedGainText(petId, level, shiny, lineage) {
  const before = petBattleStats(petId, level, shiny, Math.max(0, lineage - 1));
  const after = petBattleStats(petId, level, shiny, lineage);
  const gains = ['power', 'marrow', 'wind', 'reflex', 'hp']
    .filter(key => after[key] > before[key])
    .map(key => `+${after[key] - before[key]} ${key === 'hp' ? 'HP' : key}`);
  return gains.length ? `This rank adds ${gains.join(', ')}.`
    : 'This rank adds no combat stats. Lineage is still recorded.';
}

// The single source of truth for a battle-pet's intrinsic stat line (engine AND
// UI read this). `hp` is the pet's own HP floor; makePetBody adds a slice of the
// owner's Marrow on top. Commons at level 1 (lineage 0, no shiny) retain the
// original hatch HP; subsequent HP growth is now +1 per level before multipliers.
export function petBattleStats(petId, level = 1, shiny = false, lineage = 0) {
  const L = Math.max(1, level);
  const lin = Math.max(0, Math.floor(lineage || 0));
  const p = PET_STATS[petId] || { rarity: 'common', mult: 1, tilt: {} };
  const t = p.tilt || {};
  const m = petStatMultiplier(petId, shiny, lin);
  return {
    power:  Math.round((10 + L * 4) * m * (t.power  || 1)),
    marrow: Math.round(20            * m * (t.marrow || 1)),
    wind:   Math.round(30            * m * (t.wind   || 1)),
    reflex: Math.round((25 + L * 5)  * m * (t.reflex || 1)),
    hype: 0,
    hp:     Math.round((47 + L)  * m * (t.marrow || 1)),
    rarity: p.rarity,
    lineage: lin,
  };
}

// ---- leveling: pets grow as you walk ----
// Maxing a pet is a long-haul goal, not a formality: the cost per level ESCALATES
// so early levels come while you settle in and the top of the tree (Lv 10) is a
// genuine achievement worth chasing. PET_LEVEL_STEPS[i] = lifetime steps-since-
// hatch needed to REACH level i+1 (index 0 = level 1 = the moment it hatches).
export const PET_LEVEL_STEPS = [0, 4000, 9000, 15000, 22000, 30000, 40000, 52000, 66000, 82000];
export const PET_MAX_LEVEL = PET_LEVEL_STEPS.length; // 10
// steps still needed to reach the NEXT level (0 if maxed) — drives the progress UI
export function petStepsToNext(stepsSinceHatch) {
  const s = Math.max(0, stepsSinceHatch || 0);
  const lvl = petLevel(s);
  if (lvl >= PET_MAX_LEVEL) return 0;
  return Math.max(0, PET_LEVEL_STEPS[lvl] - s); // PET_LEVEL_STEPS[lvl] is the (lvl+1)th threshold
}
export function petLevel(stepsSinceHatch) {
  const s = Math.max(0, stepsSinceHatch || 0);
  let lvl = 1;
  for (let i = 1; i < PET_LEVEL_STEPS.length; i++) { if (s >= PET_LEVEL_STEPS[i]) lvl = i + 1; else break; }
  return lvl;
}
// Trees own the schedule. The aggregate remains available for existing callers;
// pass a species id for celebrations and UI describing one pet's actual tree.
function treeTiers(rows) { return [...new Set(rows.map(row => row.tier))].sort((a, b) => a - b); }
export const PET_TIERS = treeTiers(Object.values(PET_TREES).flat());
export function unlockedTiers(level, petId) {
  const rows = petId === undefined ? Object.values(PET_TREES).flat()
    : (isKnownPet(petId) ? PET_TREES[PET_ASSIGN[petId]] : []);
  return treeTiers(rows).filter(t => level >= t);
}

// ---- SPECIES SIGNATURE: a unique capstone per PET (not family), auto-unlocked at
// max level. This is the deep-endgame payoff + the thing that makes two same-family
// pets (e.g. the two hounds C3/C4) play differently. Reachable only by pouring steps
// into ONE pet, so it's the mark of a truly maxed companion. Previewed (locked) in
// the Stable from the start so the depth is visible. ----
export const PET_SIGNATURE = {
  C1: { id: 'sig-c1', name: 'Cosmic Storm', desc: 'Curse also calls down a burning storm on the enemy each turn, and weakens 20% harder.' },
  C2: { id: 'sig-c2', name: 'Eternal Guard', desc: 'The first killing blow each fight is survived AND mends you to 20% HP.' },
  C3: { id: 'sig-c3', name: 'Chum Slick', desc: 'Every bite floods the enemy to max poison, adding 40% of its base tick.' },
  C4: { id: 'sig-c4', name: 'Apex Ambush', desc: 'Bites always crit and strike 25% harder.' },
  C5: { id: 'sig-c5', name: 'Loyal Bulwark', desc: 'Shields gain 60% of their base size, restore 40 Stamina and cleanse you.' },
  CX: { id: 'sig-cx', name: 'Day One Grit', desc: 'Steady and loyal: bites strike a little harder (+15%).' },
};
export function petSignature(petId) { return PET_SIGNATURE[petId] || null; }

// passive magnitude scales gently with level (level 1 -> ~6%, level 6 -> ~11%)
export function passivePct(level) { return 0.04 + (level - 1) * 0.008; }

/* ---- Kennel Phase A / palettes: morphs (cosmetic recolours, no stat touch, no glow) ----
 * Rolled at egg-grant time (js/loot.js eggRow), read at hatch. Order here IS
 * tier order for fusion (Phase C), not shipped yet.
 *
 * KENNEL PALETTES V2, 2026-09-06. Tom approved the v2 recolour sheet
 * ("now this is quality work. approved"): anatomy-first, per-fill regions
 * recoloured against an absolute target hue per morph (not a shared
 * hue-rotate), with ink/eye-white/cream protected byte-identical -- the fix
 * for a colour reading wrong on a specific species. One midnight tier (the
 * three-luminance-tier build was provisional; v2 ships a single midnight).
 * scripts/build-pet-morphs-v2.py recolors each species' own master into
 * assets/bh/C/morph/<species>__<morph>.png, and MORPH_ART/morphAsset below are
 * the gate every render path resolves through -- mirrors SHINY_ART (js/loot.js):
 * file exists (species is in MORPH_ART) -> use the variant PNG; else base. */
export const MORPHS = ['base', 'ember', 'frost', 'toxic', 'rose', 'midnight'];
export const MORPH_WEIGHT = { base: 40, ember: 22, frost: 22, toxic: 10, rose: 10, midnight: 4 };
export const MORPH_TIER = { base: 0, ember: 1, frost: 1, toxic: 2, rose: 2, midnight: 3 };
export const MORPH_LABEL = { base: '', ember: 'Ember', frost: 'Frost', toxic: 'Toxic', rose: 'Rose', midnight: 'Midnight' };
export function isMorph(m) { return MORPHS.includes(m); }

/* Which species carry per-morph PNG variants (mirrors SHINY_ART's shape: a
 * plain membership list, not a filesystem check -- a browser cannot read a
 * folder). CX is absent on purpose: its amethyst art IS its look (section 0.7).
 * Bumbleseal (C6) IS in here now (Kennel palettes, 2026-09-05: she is a normal
 * species for the morph grid, see MORPH_SPECIES below and js/loot.js). */
export const MORPH_ART = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];
/* The one path helper every draw path resolves through (mirrors bhAsset,
 * the cosmetics manifest). '' for base, CX, an unknown morph, or a species with no
 * morph art -- never guesses, never throws; the caller falls back to the base
 * asset exactly the way a missing shiny id would. */
export function morphAsset(petId, morph) {
  if (!morph || morph === 'base' || !isMorph(morph) || petId === 'CX' || !MORPH_ART.includes(petId)) return '';
  return `assets/bh/C/morph/${petId}__${morph}.png`;
}

// Same crypto source loot.js's rng() uses, duplicated rather than imported: pets.js
// stays a pure module with no DOM/db dependency (loot.js imports FROM here, not the
// reverse), and tests seed it the same way (monkeypatch crypto.getRandomValues), see
// "crate levers (a)" in tests/unit.test.js.
function rng() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 0xffffffff;
}

// Species that COUNT toward the fresh-first pool below: the ordinary
// dupe-pool pets (spec section 2.2's "(species x morph) pairs"). Excludes CX
// (exempt from morphs per spec section 0.7 -- its amethyst art IS its look).
// A hand-kept list, not derived from PET_ASSIGN: this module stays import-free
// (no cosmetics manifest), and "hatch-pool species" is exactly the distinction
// pickRandomPet's own `rest` (js/loot.js) draws on, which this list mirrors.
//
// C6 (Bumbleseal) WAS excluded here (2026-09-05 morning): she was a 1%
// shop-exclusive hatch that most players never owned by any morph, so putting
// her in this accounting alongside C1-C5 left 'base' permanently "fresh" for
// her sake and starved the other four morphs of any weight -- found by the
// 200-egg sim, where a player owning all of C1-C5 in base still hatched
// nothing but base across 200 draws (see git history / KENNEL.md section 3).
//
// KENNEL PALETTES, 2026-09-05 afternoon, Tom: "roll Bumbleseal into things,
// her time as shop-exclusive has passed ... part of the morph grid = 6
// species x 5 morphs = 30 pairs, fresh-first accounting includes her." The
// exclusion above is gone: js/loot.js pickRandomPet no longer special-cases
// her (hatchChance removed from her catalogue entry), so she is now an
// ordinary member of the same hatch pool as C1-C5 and belongs in this
// accounting for the same reason they do -- the 200-egg bug this list used to
// guard against cannot recur, because nothing here treats her as rare anymore.
const MORPH_SPECIES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];

// The (species, morph) pairs a player already owns, as a Set of "sp|morph" keys.
// Pure: takes the instance list (js/loot.js petInstances()), never reads it itself.
export function ownedPairs(instances) {
  return new Set((instances || []).map(x => `${x.sp}|${x.shiny ? 'base' : x.morph || 'base'}`));
}
// R39-10 (2026-09-06): how many of those pairs have a CELL in the Kennel grid.
// owned.size counts CX (exempt, no cell) too: "37 / 36" with a full set.
export function ownedCellCount(owned, speciesIds) {
  let n = 0;
  for (const sp of speciesIds) for (const m of MORPHS) if (owned.has(`${sp}|${m}`)) n++;
  return n;
}

function weightedMorph(candidates) {
  const total = candidates.reduce((a, m) => a + MORPH_WEIGHT[m], 0);
  let r = rng() * total;
  for (const m of candidates) { r -= MORPH_WEIGHT[m]; if (r < 0) return m; }
  return candidates[candidates.length - 1];
}

/* LEGACY ONLY: pure weighted helper for old tests and data tooling. Never
 * import or call from a new reward/grant path. New eggs always grant Base.
 * Retains fresh-first compatibility: prefer colours missing on any ordinary
 * species, then use the full six-colour weighted table when all 36 are owned.
 * Reads only the supplied ownership set and the existing crypto RNG. */
export function rollMorph(owned) {
  const fresh = MORPHS.filter(m => MORPH_SPECIES.some(s => !owned.has(`${s}|${m}`)));
  return weightedMorph(fresh.length ? fresh : MORPHS);
}

// Assemble the battle-pet object makeFighter() takes. picks = array of node ids.
// opts.shiny flags the ultra-rare variant (a stat bump). The intrinsic stat line
// (rarity + per-pet tilt + shiny) rides on `.stats` so pit.js's makePetBody stays
// a pure consumer and the pet-card UI reads the exact same numbers.
export function buildBattlePet(petId, level = 1, picks = [], opts = {}) {
  if (!petId || !Object.hasOwn(PET_ASSIGN, petId)) return null;
  const fam = familyOf(petId);
  const has = id => picks.includes(id);
  const shiny = !!opts.shiny;
  const lineage = Math.max(0, Math.floor(opts.lineage || 0));
  const stats = petBattleStats(petId, level, shiny, lineage);
  // Deprecated auto-companion field: retain the serialized battle-pet contract,
  // including Warden's historical 3. No engine reads it; manual specials use
  // PET_ACTIONS.cd, sourced from PET_FAMILIES. Remove only with a schema change.
  const legacyCooldown = fam.key === 'warden' ? 3 : 2;
  return {
    id: petId,
    family: fam.key,
    name: fam.name,
    role: fam.role,
    color: fam.color,
    level,
    shiny,
    lineage,
    rarity: stats.rarity,
    stats,                    // intrinsic battle stats (power/marrow/wind/reflex/hp)
    passive: fam.passive,
    passivePct: passivePct(level)
      * (fam.key === 'warden' && has('w-guardstance') ? 1.35 : 1)
      * (fam.key === 'warden' && has('w-immortal') ? 1.5 : 1)
      * (fam.key === 'imp' && has('i-showoff') ? 2 : 1),
    cooldown: legacyCooldown === 2 && has('h-pack') ? 1 : legacyCooldown,
    picks: new Set(picks),
    signature: petSignature(petId),                 // the species capstone (for UI + effect)
    signatureActive: level >= PET_MAX_LEVEL,         // lit only on a fully-maxed pet
    // per-fight mutable state is added by makeFighter (cd timer, lastStandUsed)
  };
}

// The pet's manual kit: on its own turn you pick ONE of these. Each family has a
// SPECIAL (its signature, on a short cooldown), a light BASIC (every turn), and
// GUARD (the pet steadies itself, recovering some HP). The special reuses the
// tuned petAbilityEffect below.
export const PET_ACTIONS = {
  hound: [
    { id: 'bite', name: 'Bite', kind: 'special', cd: PET_FAMILIES.hound.cooldown, desc: 'Savage bite: damage + poison' },
    { id: 'nip', name: 'Nip', kind: 'basic', desc: 'Quick chip damage' },
    { id: 'guard', name: 'Guard', kind: 'guard', desc: 'Steady up (heal a little)' },
  ],
  warden: [
    { id: 'shield', name: 'Shield', kind: 'special', cd: PET_FAMILIES.warden.cooldown, desc: 'Ward + mend you' },
    { id: 'tend', name: 'Tend', kind: 'basic', desc: 'Small heal for you' },
    { id: 'guard', name: 'Guard', kind: 'guard', desc: 'Steady up (heal a little)' },
  ],
  imp: [
    { id: 'hex', name: 'Hex', kind: 'special', cd: PET_FAMILIES.imp.cooldown, desc: 'Curse: weaken + blind/mark' },
    { id: 'zap', name: 'Zap', kind: 'basic', desc: 'Chip damage + a little Hype for you' },
    { id: 'guard', name: 'Guard', kind: 'guard', desc: 'Steady up (heal a little)' },
  ],
};
export function petActionMeta(family) {
  requirePetFamily(family);
  return PET_ACTIONS[family];
}

// Resolve the pet's on-use ability. Pure: returns a list of intents the engine
// applies (so the engine keeps its dealDamage/status authority). `self`/`foe`
// are the fighters; `atkDamageBase` scales the hound bite off the owner's power.
// T2 round 2: preserve specials until the owner leads by 15 percentage points
// of remaining health. Beyond that, diminish damage and expose the pet to more
// pressure. This uses live combat state, never species/encounter IDs or win odds.
export function petCombatLead(self, foe) {
  if (![self.hp, foe.hp, self.d.maxHp, foe.d.maxHp].every(Number.isFinite)
    || self.d.maxHp <= 0 || foe.d.maxHp <= 0) return 0;
  const health = fighter => Math.max(0, Math.min(1, fighter.hp / fighter.d.maxHp));
  return Math.max(0, health(self) - health(foe) - 0.15);
}
export function petDamageMultiplier(self, foe) {
  return 1 / (1 + 64 * petCombatLead(self, foe));
}
export function petTargetChance(self, foe, petLow) {
  const base = petLow ? 0.45 : 0.18;
  return base + (0.8 - base) * Math.min(1, 3 * petCombatLead(self, foe));
}
export function petAbilityEffect(pet, self, foe) {
  requirePetFamily(pet.family);
  const has = id => pet.picks.has(id);
  const lvl = pet.level;
  const sig = id => pet.signatureActive && pet.id === id; // species signature is lit
  const effect = PET_ABILITIES[pet.family]({ has, lvl, sig, self, foe });
  // Opening burst also needs a ceiling before a health lead exists. Bites up
  // to 16 are unchanged; excess damage approaches 8 more, before engine crits.
  if (effect.damage > 16) effect.damage = 16 + 8 * (effect.damage - 16) / (8 + effect.damage - 16);
  const mult = petDamageMultiplier(self, foe);
  if (effect.damage) effect.damage = Math.round(effect.damage * mult);
  if (effect.poison) effect.poison.per = Math.round(effect.poison.per * mult);
  if (effect.burn) effect.burn.per = Math.round(effect.burn.per * mult);
  return effect;
}

// A new family needs an explicit effect as well as actions and a tree.
const PET_ABILITIES = {
  hound({ has, lvl, sig, self, foe }) {
    let base = Math.round((2 + lvl * 0.7) * self.d.powerMult * (has('h-savage') ? 1.35 : 1));
    const bites = (has('h-frenzy') && foe.hp <= foe.d.maxHp * 0.25) ? 2 : 1;
    let stacks = (has('h-rabid') ? 2 : 1) + (has('h-plague') ? 1 : 0);
    const per = Math.round((1 + lvl * 0.20) * (1 + (has('h-venom') ? 0.5 : 0)
      + (has('h-rupture') ? 0.5 : 0) + (sig('C3') ? 0.4 : 0)));
    // C4 Apex Ambush: guaranteed crit + harder bites. C3 Chum Slick: max poison,
    // harder ticks. CX Day One Grit: just a modest bite bump (deliberately mild so
    // the early-player pet is nice, not overpowered).
    const critAlways = sig('C4');
    if (sig('C4')) base = Math.round(base * 1.25);
    else if (sig('CX')) base = Math.round(base * 1.15);
    if (sig('C3')) stacks = 3;
    return {
      kind: 'pethit', bites, damage: base, crit: has('h-maul'), critAlways,
      lifesteal: has('h-bloodscent') ? 0.06 : 0,
      poison: { per, turns: 3 + (has('h-gore') ? 2 : 0), stacks },
    };
  },
  warden({ has, lvl, sig, self }) {
    // tuned down for the pet-as-body era: the pet already adds a soak layer, so
    // its support kit is lighter than the v34 companion version
    const shield = Math.round((7 + lvl * 1.5) * (1 + (has('w-bulwark') ? 0.5 : 0)
      + (has('w-fortify') ? 0.4 : 0) + (sig('C5') ? 0.6 : 0)));
    // C5 Loyal Bulwark: massive shields + stamina + cleanse. C2 Eternal Guard: auto last-stand that heals big.
    return {
      kind: 'petshield', shield,
      heal: (has('w-mend') ? Math.round(self.d.maxHp * 0.06) : 0) + (has('w-renew') ? Math.round(self.d.maxHp * 0.08) : 0),
      cleanse: has('w-cleanse') || sig('C5'),
      stamina: (has('w-devotion') ? 15 : 0) + (has('w-bastion') ? 25 : 0) + (sig('C5') ? 40 : 0),
      armLastStand: sig('C2'),
      lastStandHeal: sig('C2') ? 0.2 : 0,
    };
  },
  imp({ has, lvl, sig }) {
    const pct = 0.08 * (has('i-doublehex') ? 1.5 : 1) * (has('i-deephex') ? 1.5 : 1) * (sig('C1') ? 1.2 : 1);
    return {
      kind: 'petdebuff', weakenPct: pct,
      turns: (has('i-doublehex') ? 3 : 2) + (has('i-oblivion') ? 1 : 0),
      blind: has('i-jinx') || has('i-havoc'),
      staminaDrain: has('i-drain') ? 16 : (has('i-siphon') ? 8 : 0),
      mark: has('i-mark'), stagger: has('i-trick') || has('i-havoc'),
      // C1 Cosmic Storm: the curse also lays a burning storm on the foe
      burn: sig('C1') ? { per: 3 + Math.round(lvl * 0.5), turns: 3 } : null,
    };
  },
};
