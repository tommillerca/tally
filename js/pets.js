// Pets in battle. Your equipped pet (slot C) fights ALONGSIDE your bonehead in
// the Pit as an auto-companion, modeled on WoW hunter pets (one always-on
// PASSIVE + one on-use ABILITY on a cooldown) with a WoW-pet-battle-style
// mini-tree (one-of-two choice per tier, unlocked by pet level from walking).
// Pure module: no DOM. The engine (pit.js) consumes buildBattlePet() output and
// resolves abilities via petAbilityEffect(); the family passive folds into
// resolveHit/dealDamage like a talent.

// ---- families (fixed per pet, echoing hunter specs) ----
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
    cooldown: 3,
    passive: 'damageTaken',         // -X% damage you take
  },
  imp: {
    key: 'imp', name: 'Imp', role: 'Utility', color: '#c084fc',
    blurb: 'Curses the enemy to hit softer.',
    cooldown: 2,
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
};
export function familyOf(petId) { return PET_FAMILIES[PET_ASSIGN[petId] || 'hound']; }

// Pets that HOVER in mid-air in combat — only genuinely airborne creatures (the
// flying duck C2). The cloud (C1) also flies but carries a baked ground shadow so
// it bottom-aligns; the catfish (C3), lizard (C4) and dog (C5) are not airborne
// and stand on the floor. Hand-assigned like PET_ASSIGN — add new flyers here.
export const HOVER_PETS = new Set(['C2']);
export function petHovers(petId) { return HOVER_PETS.has(petId); }

// ---- mini-trees: 3 tiers, ONE-OF-TWO per tier, unlocked at pet level 2/4/6 ----
export const PET_TREES = {
  hound: [
    { tier: 2, opts: [
      { id: 'h-rabid', name: 'Rabid', desc: 'Bite lands a second poison stack.' },
      { id: 'h-bloodscent', name: 'Bloodscent', desc: 'When the pet bites, you heal 6% of its damage.' } ] },
    { tier: 4, opts: [
      { id: 'h-pack', name: 'Pack Tactics', desc: 'The pet bites every turn instead of every other.' },
      { id: 'h-venom', name: 'Venom', desc: 'Poison ticks 50% harder.' } ] },
    { tier: 6, opts: [
      { id: 'h-frenzy', name: 'Frenzy', desc: 'Below 25% enemy HP, the pet bites twice.' },
      { id: 'h-maul', name: 'Maul', desc: 'Bites can crit for double.' } ] },
    { tier: 8, opts: [
      { id: 'h-savage', name: 'Savage', desc: 'Bites hit 35% harder.' },
      { id: 'h-gore', name: 'Gore', desc: 'Poison lasts 2 extra turns.' } ] },
    { tier: 10, opts: [
      { id: 'h-plague', name: 'Plague', desc: 'Every bite lands an extra poison stack.' },
      { id: 'h-rupture', name: 'Rupture', desc: 'Poison ticks 50% harder (stacks with Venom).' } ] },
  ],
  warden: [
    { tier: 2, opts: [
      { id: 'w-bulwark', name: 'Bulwark', desc: 'Shields are 60% larger.' },
      { id: 'w-mend', name: 'Mend', desc: 'Also heals you 8% max HP when it shields.' } ] },
    { tier: 4, opts: [
      { id: 'w-cleanse', name: 'Cleanse', desc: 'Clears one bleed/burn/poison off you when it acts.' },
      { id: 'w-guardstance', name: 'Guard Stance', desc: 'Passive damage reduction is doubled.' } ] },
    { tier: 6, opts: [
      { id: 'w-laststand', name: 'Last Stand', desc: 'The first killing blow each fight is fully absorbed.' },
      { id: 'w-devotion', name: 'Devotion', desc: 'Shields also grant you +15 Stamina.' } ] },
    { tier: 8, opts: [
      { id: 'w-fortify', name: 'Fortify', desc: 'Shields are a further 40% larger.' },
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
      { id: 'i-oblivion', name: 'Oblivion', desc: 'Curse lasts 2 extra turns.' },
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
};
// Shiny (the ultra-rare recolour) is no longer purely cosmetic: it grants a small
// flat bump to every stat so a shiny pull is a genuine power upgrade, not a skin.
export const SHINY_STAT_MULT = 1.08;
// v128 breeding: each LINEAGE tier (bred by fusing two pets) adds a flat % to every
// stat. Stackable forever — the endless "sink two pets to make a stronger one" chase.
export const PET_LINEAGE_STEP = 0.05; // +5% per lineage tier

// The single source of truth for a battle-pet's intrinsic stat line (engine AND
// UI read this). `hp` is the pet's own HP floor; makePetBody adds a slice of the
// owner's Marrow on top. Commons at level L (lineage 0, no shiny) reproduce the
// pre-v124 generic line.
export function petBattleStats(petId, level = 1, shiny = false, lineage = 0) {
  const L = Math.max(1, level);
  const lin = Math.max(0, Math.floor(lineage || 0));
  const p = PET_STATS[petId] || { rarity: 'common', mult: 1, tilt: {} };
  const t = p.tilt || {};
  const m = p.mult * (shiny ? SHINY_STAT_MULT : 1) * (1 + lin * PET_LINEAGE_STEP);
  return {
    power:  Math.round((10 + L * 4) * m * (t.power  || 1)),
    marrow: Math.round(20            * m * (t.marrow || 1)),
    wind:   Math.round(30            * m * (t.wind   || 1)),
    reflex: Math.round((25 + L * 5)  * m * (t.reflex || 1)),
    hype: 0,
    hp:     Math.round((40 + L * 8)  * m * (t.marrow || 1)),
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
// talent tiers unlock at pet level 2 / 4 / 6 / 8 / 10 (one choice every two levels)
export const PET_TIERS = [2, 4, 6, 8, 10];
export function unlockedTiers(level) {
  return PET_TIERS.filter(t => level >= t);
}

// ---- SPECIES SIGNATURE: a unique capstone per PET (not family), auto-unlocked at
// max level. This is the deep-endgame payoff + the thing that makes two same-family
// pets (e.g. the two hounds C3/C4) play differently. Reachable only by pouring steps
// into ONE pet, so it's the mark of a truly maxed companion. Previewed (locked) in
// the Stable from the start so the depth is visible. ----
export const PET_SIGNATURE = {
  C1: { id: 'sig-c1', name: 'Cosmic Storm', desc: 'Curse also calls down a burning storm on the enemy each turn, and weakens 20% harder.' },
  C2: { id: 'sig-c2', name: 'Eternal Guard', desc: 'The first killing blow each fight is survived AND mends you to 40% HP.' },
  C3: { id: 'sig-c3', name: 'Chum Slick', desc: 'Every bite floods the enemy to max poison, ticking 40% harder.' },
  C4: { id: 'sig-c4', name: 'Apex Ambush', desc: 'Bites always crit and strike 50% harder.' },
  C5: { id: 'sig-c5', name: 'Loyal Bulwark', desc: 'Shields are massive (+90%), refill your stamina and cleanse you.' },
  CX: { id: 'sig-cx', name: 'Day One Grit', desc: 'Steady and loyal: bites strike a little harder (+15%).' },
};
export function petSignature(petId) { return PET_SIGNATURE[petId] || null; }

// passive magnitude scales gently with level (level 1 -> ~6%, level 6 -> ~11%)
export function passivePct(level) { return 0.04 + (level - 1) * 0.008; }

// Assemble the battle-pet object makeFighter() takes. picks = array of node ids.
// opts.shiny flags the ultra-rare variant (a stat bump). The intrinsic stat line
// (rarity + per-pet tilt + shiny) rides on `.stats` so pit.js's makePetBody stays
// a pure consumer and the pet-card UI reads the exact same numbers.
export function buildBattlePet(petId, level = 1, picks = [], opts = {}) {
  if (!petId || !PET_ASSIGN[petId]) return null;
  const fam = familyOf(petId);
  const has = id => picks.includes(id);
  const shiny = !!opts.shiny;
  const lineage = Math.max(0, Math.floor(opts.lineage || 0));
  const stats = petBattleStats(petId, level, shiny, lineage);
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
    cooldown: fam.cooldown === 2 && has('h-pack') ? 1 : fam.cooldown,
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
    { id: 'bite', name: 'Bite', kind: 'special', cd: 2, desc: 'Savage bite: damage + poison' },
    { id: 'nip', name: 'Nip', kind: 'basic', desc: 'Quick chip damage' },
    { id: 'guard', name: 'Guard', kind: 'guard', desc: 'Steady up (heal a little)' },
  ],
  warden: [
    { id: 'shield', name: 'Shield', kind: 'special', cd: 2, desc: 'Ward + mend you' },
    { id: 'tend', name: 'Tend', kind: 'basic', desc: 'Small heal for you' },
    { id: 'guard', name: 'Guard', kind: 'guard', desc: 'Steady up (heal a little)' },
  ],
  imp: [
    { id: 'hex', name: 'Hex', kind: 'special', cd: 2, desc: 'Curse: weaken + blind/mark' },
    { id: 'zap', name: 'Zap', kind: 'basic', desc: 'Chip damage + a little Hype for you' },
    { id: 'guard', name: 'Guard', kind: 'guard', desc: 'Steady up (heal a little)' },
  ],
};
export function petActionMeta(family) { return PET_ACTIONS[family] || PET_ACTIONS.hound; }

// Resolve the pet's on-use ability. Pure: returns a list of intents the engine
// applies (so the engine keeps its dealDamage/status authority). `self`/`foe`
// are the fighters; `atkDamageBase` scales the hound bite off the owner's power.
export function petAbilityEffect(pet, self, foe) {
  const has = id => pet.picks.has(id);
  const lvl = pet.level;
  const sig = id => pet.signatureActive && pet.id === id; // species signature is lit
  if (pet.family === 'hound') {
    let base = Math.round((2 + lvl * 0.7) * self.d.powerMult * (has('h-savage') ? 1.35 : 1));
    const bites = (has('h-frenzy') && foe.hp <= foe.d.maxHp * 0.25) ? 2 : 1;
    let stacks = (has('h-rabid') ? 2 : 1) + (has('h-plague') ? 1 : 0);
    let per = Math.round((1 + lvl * 0.35) * (has('h-venom') ? 1.5 : 1) * (has('h-rupture') ? 1.5 : 1));
    // C4 Apex Ambush: guaranteed crit + harder bites. C3 Chum Slick: max poison,
    // harder ticks. CX Day One Grit: just a modest bite bump (deliberately mild so
    // the early-player pet is nice, not overpowered).
    const critAlways = sig('C4');
    if (sig('C4')) base = Math.round(base * 1.5);
    else if (sig('CX')) base = Math.round(base * 1.15);
    if (sig('C3')) { stacks = 3; per = Math.round(per * 1.4); }
    return {
      kind: 'pethit', bites, damage: base, crit: has('h-maul'), critAlways,
      lifesteal: has('h-bloodscent') ? 0.06 : 0,
      poison: { per, turns: 3 + (has('h-gore') ? 2 : 0), stacks },
    };
  }
  if (pet.family === 'warden') {
    // tuned down for the pet-as-body era: the pet already adds a soak layer, so
    // its support kit is lighter than the v34 companion version
    let shield = Math.round((7 + lvl * 1.5) * (has('w-bulwark') ? 1.5 : 1) * (has('w-fortify') ? 1.4 : 1));
    // C5 Loyal Bulwark: massive shields + stamina + cleanse. C2 Eternal Guard: auto last-stand that heals big.
    if (sig('C5')) shield = Math.round(shield * 1.9);
    return {
      kind: 'petshield', shield,
      heal: (has('w-mend') ? Math.round(self.d.maxHp * 0.06) : 0) + (has('w-renew') ? Math.round(self.d.maxHp * 0.08) : 0),
      cleanse: has('w-cleanse') || sig('C5'),
      stamina: (has('w-devotion') ? 15 : 0) + (has('w-bastion') ? 25 : 0) + (sig('C5') ? 40 : 0),
      armLastStand: sig('C2'),
      lastStandHeal: sig('C2') ? 0.4 : 0,
    };
  }
  // imp
  const pct = 0.12 * (has('i-doublehex') ? 1.5 : 1) * (has('i-deephex') ? 1.5 : 1) * (sig('C1') ? 1.2 : 1);
  return {
    kind: 'petdebuff', weakenPct: pct,
    turns: (has('i-doublehex') ? 3 : 2) + (has('i-oblivion') ? 2 : 0),
    blind: has('i-jinx') || has('i-havoc'),
    staminaDrain: has('i-drain') ? 16 : (has('i-siphon') ? 8 : 0),
    mark: has('i-mark'), stagger: has('i-trick') || has('i-havoc'),
    // C1 Cosmic Storm: the curse also lays a burning storm on the foe
    burn: sig('C1') ? { per: 6 + lvl, turns: 3 } : null,
  };
}
