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
};
// Shiny (the ultra-rare recolour) is no longer purely cosmetic: it grants a small
// flat bump to every stat so a shiny pull is a genuine power upgrade, not a skin.
export const SHINY_STAT_MULT = 1.08;

// The single source of truth for a battle-pet's intrinsic stat line (engine AND
// UI read this). `hp` is the pet's own HP floor; makePetBody adds a slice of the
// owner's Marrow on top. Commons at level L reproduce the pre-v124 generic line.
export function petBattleStats(petId, level = 1, shiny = false) {
  const L = Math.max(1, level);
  const p = PET_STATS[petId] || { rarity: 'common', mult: 1, tilt: {} };
  const t = p.tilt || {};
  const m = p.mult * (shiny ? SHINY_STAT_MULT : 1);
  return {
    power:  Math.round((10 + L * 4) * m * (t.power  || 1)),
    marrow: Math.round(20            * m * (t.marrow || 1)),
    wind:   Math.round(30            * m * (t.wind   || 1)),
    reflex: Math.round((25 + L * 5)  * m * (t.reflex || 1)),
    hype: 0,
    hp:     Math.round((40 + L * 8)  * m * (t.marrow || 1)),
    rarity: p.rarity,
  };
}

// ---- leveling: pets grow as you walk ----
export const PET_STEPS_PER_LEVEL = 3000;
export const PET_MAX_LEVEL = 6;
export function petLevel(stepsSinceHatch) {
  return Math.max(1, Math.min(PET_MAX_LEVEL, 1 + Math.floor(Math.max(0, stepsSinceHatch) / PET_STEPS_PER_LEVEL)));
}
// tiers unlock at pet level 2 / 4 / 6
export function unlockedTiers(level) {
  return [2, 4, 6].filter(t => level >= t);
}

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
  const stats = petBattleStats(petId, level, shiny);
  return {
    id: petId,
    family: fam.key,
    name: fam.name,
    role: fam.role,
    color: fam.color,
    level,
    shiny,
    rarity: stats.rarity,
    stats,                    // intrinsic battle stats (power/marrow/wind/reflex/hp)
    passive: fam.passive,
    passivePct: passivePct(level) * (fam.key === 'warden' && has('w-guardstance') ? 1.35 : 1) * (fam.key === 'imp' && has('i-showoff') ? 2 : 1),
    cooldown: fam.cooldown === 2 && has('h-pack') ? 1 : fam.cooldown,
    picks: new Set(picks),
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
  if (pet.family === 'hound') {
    const base = Math.round((2 + lvl * 0.7) * self.d.powerMult);
    const bites = (has('h-frenzy') && foe.hp <= foe.d.maxHp * 0.25) ? 2 : 1;
    const stacks = has('h-rabid') ? 2 : 1;
    return {
      kind: 'pethit', bites, damage: base, crit: has('h-maul'),
      lifesteal: has('h-bloodscent') ? 0.06 : 0,
      poison: { per: Math.round((1 + lvl * 0.35) * (has('h-venom') ? 1.5 : 1)), turns: 3, stacks },
    };
  }
  if (pet.family === 'warden') {
    // tuned down for the pet-as-body era: the pet already adds a soak layer, so
    // its support kit is lighter than the v34 companion version
    const shield = Math.round((7 + lvl * 1.5) * (has('w-bulwark') ? 1.5 : 1));
    return {
      kind: 'petshield', shield,
      heal: has('w-mend') ? Math.round(self.d.maxHp * 0.06) : 0,
      cleanse: has('w-cleanse'),
      stamina: has('w-devotion') ? 15 : 0,
    };
  }
  // imp
  const pct = 0.12 * (has('i-doublehex') ? 1.5 : 1);
  return {
    kind: 'petdebuff', weakenPct: pct, turns: has('i-doublehex') ? 3 : 2,
    blind: has('i-jinx'), staminaDrain: has('i-siphon') ? 8 : 0,
    mark: has('i-mark'), stagger: has('i-trick'),
  };
}
