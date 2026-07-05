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
export function passivePct(level) { return 0.06 + (level - 1) * 0.01; }

// Assemble the battle-pet object makeFighter() takes. picks = array of node ids.
export function buildBattlePet(petId, level = 1, picks = []) {
  if (!petId || !PET_ASSIGN[petId]) return null;
  const fam = familyOf(petId);
  const has = id => picks.includes(id);
  return {
    id: petId,
    family: fam.key,
    name: fam.name,
    role: fam.role,
    color: fam.color,
    level,
    passive: fam.passive,
    passivePct: passivePct(level) * (fam.key === 'warden' && has('w-guardstance') ? 2 : 1) * (fam.key === 'imp' && has('i-showoff') ? 2 : 1),
    cooldown: fam.cooldown === 2 && has('h-pack') ? 1 : fam.cooldown,
    picks: new Set(picks),
    // per-fight mutable state is added by makeFighter (cd timer, lastStandUsed)
  };
}

// Resolve the pet's on-use ability. Pure: returns a list of intents the engine
// applies (so the engine keeps its dealDamage/status authority). `self`/`foe`
// are the fighters; `atkDamageBase` scales the hound bite off the owner's power.
export function petAbilityEffect(pet, self, foe) {
  const has = id => pet.picks.has(id);
  const lvl = pet.level;
  if (pet.family === 'hound') {
    const base = Math.round((3 + lvl * 0.95) * self.d.powerMult);
    const bites = (has('h-frenzy') && foe.hp <= foe.d.maxHp * 0.25) ? 2 : 1;
    const stacks = has('h-rabid') ? 2 : 1;
    return {
      kind: 'pethit', bites, damage: base, crit: has('h-maul'),
      lifesteal: has('h-bloodscent') ? 0.06 : 0,
      poison: { per: Math.round((1.5 + lvl * 0.4) * (has('h-venom') ? 1.5 : 1)), turns: 3, stacks },
    };
  }
  if (pet.family === 'warden') {
    const shield = Math.round((14 + lvl * 3) * (has('w-bulwark') ? 1.6 : 1));
    return {
      kind: 'petshield', shield,
      heal: has('w-mend') ? Math.round(self.d.maxHp * 0.08) : 0,
      cleanse: has('w-cleanse'),
      stamina: has('w-devotion') ? 15 : 0,
    };
  }
  // imp
  const pct = 0.15 * (has('i-doublehex') ? 1.5 : 1);
  return {
    kind: 'petdebuff', weakenPct: pct, turns: has('i-doublehex') ? 3 : 2,
    blind: has('i-jinx'), staminaDrain: has('i-siphon') ? 8 : 0,
    mark: has('i-mark'), stagger: has('i-trick'),
  };
}
