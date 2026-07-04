// The Pit: turn-based combat engine. Pure module (no DOM, injected RNG),
// implementing boneheadz-combat-math-spec v0.1 exactly. Every constant here
// is a spec starting value; tune via PIT_TUNING, not inline edits.
//
// Core guarantees (spec):
//   - fights resolve in ~5-7 turns
//   - effort dominates gear (PowerMult spread 1.0-2.5 > any WeaponMult)
//   - heavies are committal and telegraphed; reads beat mashing

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

export const STAT_META = [
  { key: 'power', label: 'Power', role: 'attack damage', fedBy: 'hitting your protein target' },
  { key: 'marrow', label: 'Marrow', role: 'max HP', fedBy: 'streaks + closing days on budget' },
  { key: 'wind', label: 'Wind', role: 'stamina per turn', fedBy: 'steps + active burn' },
  { key: 'reflex', label: 'Reflex', role: 'crits + glances', fedBy: 'Boneyard collecting + step eggs' },
  { key: 'hype', label: 'Hype', role: 'signature meter speed', fedBy: 'quests + logging variety' },
];

/* ================= talents (framework §7, simplified to 3-node chains) ================= */

export const TALENT_TREES = [
  {
    id: 'slab', name: 'Slab', tag: 'The Bruiser', color: 'var(--fat)',
    flavor: 'Fewer, bigger hits. Pairs with a protein habit.',
    nodes: [
      { id: 'heavyhands', tier: 1, name: 'Heavy Hands', desc: 'Haymakers hit 15% harder.' },
      { id: 'marrowlust', tier: 2, name: 'Marrowlust', desc: 'Haymaker and Titan hits heal you for 25% of the damage dealt.' },
      { id: 'bonebreaker', tier: 2, name: 'Bonebreaker', desc: 'Landed haymakers SUNDER: the enemy takes +15% damage for 2 turns.' },
      { id: 'concussive', tier: 3, name: 'Concussive', desc: 'Landed haymakers always stagger (enemy loses an action).' },
      { id: 'thickskull', tier: 3, name: 'Thick Skull', desc: '+45 max HP.' },
      { id: 'titan', tier: 4, name: 'Titan', move: true, desc: 'NEW MOVE: once per fight, an overhead slam that ignores Block and Dodge.' },
    ],
  },
  {
    id: 'greyhound', name: 'Greyhound', tag: 'The Runner', color: 'var(--protein)',
    flavor: 'Speed, bleed, and attrition. Pairs with a walking habit.',
    nodes: [
      { id: 'lightfeet', tier: 1, name: 'Light Feet', desc: '+1 action point every turn.' },
      { id: 'counterstep', tier: 2, name: 'Counterstep', desc: 'When a haymaker whiffs into your Dodge, you land a free counter-jab.' },
      { id: 'kite', tier: 2, name: 'Kite', desc: 'Throws hit 60% harder.' },
      { id: 'bleedout', tier: 3, name: 'Bleed Out', desc: 'Jabs open wounds: 4 damage per stack at the start of their turn, stacks to 3.' },
      { id: 'deeplungs', tier: 3, name: 'Deep Lungs', desc: '+15 max Wind.' },
      { id: 'flurry', tier: 4, name: 'Flurry', move: true, desc: 'NEW MOVE: dump ALL your Wind into an unblockable 3-hit combo.' },
    ],
  },
  {
    id: 'ringmaster', name: 'Ringmaster', tag: 'The Showman', color: 'var(--carbs)',
    flavor: 'Finishers, comebacks, crowd control. Pairs with quests and variety.',
    nodes: [
      { id: 'crowdwork', tier: 1, name: 'Crowd Work', desc: 'Hype builds 40% faster.' },
      { id: 'bigentrance', tier: 2, name: 'Big Entrance', desc: 'Start every fight at 25 Hype.' },
      { id: 'heckle', tier: 2, name: 'Heckle', desc: 'Taunts WEAKEN: the enemy deals 15% less damage for 2 turns.' },
      { id: 'ovation', tier: 3, name: 'Standing Ovation', desc: 'Getting hit builds double Hype (the comeback engine).' },
      { id: 'secondwind', tier: 3, name: 'Second Wind', desc: 'Once per fight, dropping below 25% HP restores 15% HP and 30 Wind.' },
      { id: 'showstopper', tier: 4, name: 'Showstopper', desc: 'Signature fires at 80 Hype and hits 25% harder.' },
    ],
  },
  {
    id: 'gravecaller', name: 'Gravecaller', tag: 'The Necromancer', color: '#c084fc',
    flavor: 'Bone magic and marrow mending. Pairs with quest-hunting variety.',
    nodes: [
      { id: 'bonebolt', tier: 1, name: 'Bone Bolt', move: true, desc: 'NEW MOVE: hurl a shard of bone at ANY range. Scales with your Hype stat.' },
      { id: 'soulsiphon', tier: 2, name: 'Soul Siphon', desc: 'Bone Bolts heal you for 30% of their damage.' },
      { id: 'mend', tier: 2, name: 'Mend Marrow', move: true, desc: 'NEW MOVE: knit your bones back together. Heals 12% max HP, 3 uses per fight.' },
      { id: 'hex', tier: 3, name: 'Hex of Dust', move: true, desc: 'NEW MOVE: curse the enemy to deal 20% less damage for 2 turns.' },
      { id: 'gravechill', tier: 3, name: 'Grave Chill', desc: 'Bone Bolts also drain 10 of the enemy Wind.' },
      { id: 'bonestorm', tier: 4, name: 'Bone Storm', move: true, desc: 'NEW MOVE: once per fight, a whirlwind of shards: three unblockable magic hits.' },
    ],
  },
  {
    id: 'gravewarden', name: 'Gravewarden', tag: 'The Cleric', color: '#ffe08a',
    flavor: 'Last rites and first aid. Holy light for unholy bones.',
    nodes: [
      { id: 'smite', tier: 1, name: 'Smite', move: true, desc: 'NEW MOVE: a lance of grave-light at ANY range. Scales with your Hype stat.' },
      { id: 'radiance', tier: 2, name: 'Radiance', desc: 'Smites heal you for 20% of their damage.' },
      { id: 'ward', tier: 2, name: 'Ward', move: true, desc: 'NEW MOVE: a holy shield that absorbs the next 25 damage.' },
      { id: 'judgement', tier: 3, name: 'Judgement', desc: 'Smites hit 50% harder on STAGGERED or SUNDERED enemies.' },
      { id: 'hallowed', tier: 3, name: 'Hallowed Marrow', desc: 'All healing you receive is 20% stronger.' },
      { id: 'lastlight', tier: 4, name: 'Last Light', desc: 'CHEAT DEATH: once per fight, a killing blow leaves you at 1 HP and restores 20% HP.' },
    ],
  },
  {
    id: 'boneshaman', name: 'Bone Shaman', tag: 'The Elementalist', color: '#ff7a45',
    flavor: 'Fire in the femurs, frost in the fingers.',
    nodes: [
      { id: 'frostbolt', tier: 1, name: 'Frost Bolt', move: true, desc: 'NEW MOVE: an icy shard at ANY range that CHILLS 8 Wind off the enemy.' },
      { id: 'firebolt', tier: 2, name: 'Fire Bolt', move: true, desc: 'NEW MOVE: a searing bolt that sets a BURN: 5 damage per turn for 2 turns.' },
      { id: 'totemic', tier: 2, name: 'Totemic Marrow', desc: '+5 Wind regeneration every turn.' },
      { id: 'frostbite', tier: 3, name: 'Frostbite', desc: 'Frost Bolts hit 40% harder when the enemy is gassed (under 30 Wind).' },
      { id: 'wildfire', tier: 3, name: 'Wildfire', desc: 'Burns tick 7 damage and last 3 turns.' },
      { id: 'tempest', tier: 4, name: 'Tempest', move: true, desc: 'NEW MOVE: once per fight, a barrage of fire and frost: four elemental hits.' },
    ],
  },
];

export function talentPoints(level) { return Math.max(0, level - 1); }

const TIER_GATE = { 1: 0, 2: 1, 3: 3, 4: 5 };

// WoW-style: tiers unlock by points already spent in that tree
export function canTakeTalent(taken, treeId, nodeIdx) {
  const tree = TALENT_TREES.find(t => t.id === treeId);
  if (!tree || nodeIdx >= tree.nodes.length) return false;
  const node = tree.nodes[nodeIdx];
  if (taken.has(node.id)) return false;
  const inTree = tree.nodes.filter(n => taken.has(n.id)).length;
  return inTree >= TIER_GATE[node.tier];
}

/* ================= derived pools (spec §1) ================= */

export function derived(stats, weapon = WEAPONS.starter, talents = null) {
  const t = talents || new Set();
  return {
    maxHp: Math.round(150 + stats.marrow * 3) + (t.has('thickskull') ? 45 : 0),
    maxWind: Math.round(40 + stats.wind * 0.6) + (t.has('deeplungs') ? 15 : 0),
    ap: 2 + (weapon.apBonus || 0) + (talents && talents.has('lightfeet') ? 1 : 0),
    powerMult: 1 + (stats.power / 100) * 1.5,
    magicMult: 1 + (stats.hype / 100) * 1.5,
    critChance: Math.min(0.60, 0.05 + (stats.reflex / 100) * 0.30 + (weapon.critBonus || 0)),
    glanceChance: (stats.reflex / 100) * 0.25,
  };
}

/* ================= weapons (spec §6) ================= */

export const WEAPONS = {
  starter: {
    id: 'starter', name: 'Taped Pipe', desc: 'Honest baseline. No tricks.',
    mult: () => 1.0,
    windCostMult: () => 1.0,
  },
  bonecrusher: {
    id: 'bonecrusher', name: 'Bonecrusher', desc: 'Feast-or-famine bombs. Scales off Power.',
    mult: (move, s) => move === 'haymaker' ? 1 + 0.40 * (s.power / 100)
      : move === 'swing' ? 1 + 0.10 * (s.power / 100) : 1.0,
    windCostMult: (move) => move === 'haymaker' ? 1.3 : 1.0,
  },
};

/* ================= actions (spec §2) ================= */

export const ACTIONS = {
  jab:      { label: 'Jab', range: 'close', ap: 1, wind: 8, base: 10, hype: 6 },
  swing:    { label: 'Swing', range: 'close', ap: 1, wind: 18, base: 22, hype: 10 },
  haymaker: { label: 'Haymaker', range: 'close', ap: 2, wind: 35, base: 40, hype: 15 },
  block:    { label: 'Block', range: 'close', ap: 1, wind: 10 },
  dodge:    { label: 'Dodge', range: 'close', ap: 1, wind: 10 },
  shove:    { label: 'Shove', range: 'close', ap: 1, wind: 12, hype: 4 },
  advance:  { label: 'Advance', range: 'far', ap: 1, wind: 5 },
  throwb:   { label: 'Throw', range: 'far', ap: 1, wind: 15, base: 14, hype: 8 },
  brace:    { label: 'Brace', range: 'any', ap: 1, wind: 0 },
  taunt:    { label: 'Taunt', range: 'far', ap: 1, wind: 5 },
  signature:{ label: 'Signature', range: 'close', ap: 2, wind: 0, base: 120 },
  titan:    { label: 'Titan', range: 'close', ap: 2, wind: 30, base: 55, hype: 15, talent: 'titan' },
  flurry:   { label: 'Flurry', range: 'close', ap: 2, wind: 0, base: 10, talent: 'flurry' },
  bonebolt: { label: 'Bone Bolt', range: 'any', ap: 1, wind: 18, base: 16, hype: 6, talent: 'bonebolt', magic: true, school: 'shadow' },
  mend:     { label: 'Mend', range: 'any', ap: 1, wind: 20, talent: 'mend', magic: true, school: 'nature' },
  hex:      { label: 'Hex', range: 'any', ap: 1, wind: 15, talent: 'hex', magic: true, school: 'shadow' },
  bonestorm:{ label: 'Bone Storm', range: 'close', ap: 2, wind: 40, base: 14, talent: 'bonestorm', magic: true, school: 'shadow' },
  smite:    { label: 'Smite', range: 'any', ap: 1, wind: 18, base: 15, hype: 6, talent: 'smite', magic: true, school: 'holy' },
  ward:     { label: 'Ward', range: 'any', ap: 1, wind: 15, talent: 'ward', magic: true, school: 'holy' },
  frostbolt:{ label: 'Frost Bolt', range: 'any', ap: 1, wind: 18, base: 14, hype: 6, talent: 'frostbolt', magic: true, school: 'frost' },
  firebolt: { label: 'Fire Bolt', range: 'any', ap: 1, wind: 20, base: 18, hype: 6, talent: 'firebolt', magic: true, school: 'fire' },
  tempest:  { label: 'Tempest', range: 'close', ap: 2, wind: 35, base: 10, talent: 'tempest', magic: true, school: 'fire' },
};
export const SHOWSTOPPER_HYPE = 80;

// big moves can miss (whiffed heavies leave you off-balance)
export const MISS_CHANCE = {
  swing: 0.04, haymaker: 0.12, titan: 0.15,
  flurry: 0.08, bonestorm: 0.10, tempest: 0.08,
};

export const REGEN_PER_TURN = 15;
export const BRACE_BONUS = 40;
export const TAUNT_CURVE = [8, 5, 3, 2, 1];
export const SIGNATURE_HYPE = 100;
export const HIT_TAKEN_HYPE = 4;

export function sigThreshold(f) { return f.talents.has('showstopper') ? SHOWSTOPPER_HYPE : SIGNATURE_HYPE; }
function gainHype(f, amt) {
  const mult = f.talents.has('crowdwork') ? 1.4 : 1;
  f.hype = Math.min(SIGNATURE_HYPE, f.hype + Math.round(amt * mult));
}
export const TURN_CAP = 30;

// counter matrix (spec §4): attacker move vs defender state
export function counterMult(move, defState) {
  if (defState === 'block') {
    if (move === 'jab') return { mult: 0.5 };
    if (move === 'swing') return { mult: 0.35 };
    if (move === 'haymaker') return { mult: 1.15, breaksGuard: true, stagger: true };
  }
  if (defState === 'dodge') {
    if (move === 'jab') return { mult: 1.1 };
    if (move === 'swing') return { mult: 0.7 };
    if (move === 'haymaker') return { mult: 0, miss: true, offBalance: true };
  }
  return { mult: 1.0 };
}

/* ================= damage pipeline (spec §3) ================= */

export function resolveHit({ move, attacker, defender, rng }) {
  const a = ACTIONS[move];
  const immune = move === 'signature' || move === 'titan' || move === 'flurry' || !!ACTIONS[move].magic;
  const counter = immune ? { mult: 1.0 } : counterMult(move, defender.state);
  if (counter.miss) {
    return { damage: 0, miss: true, offBalance: !!counter.offBalance, crit: false, glance: false };
  }
  const missChance = MISS_CHANCE[move] || 0;
  if (missChance && rng() < missChance) {
    return { damage: 0, miss: true, whiffed: true, offBalance: move === 'haymaker' || move === 'titan', crit: false, glance: false };
  }
  let dmg = a.base;
  dmg *= a.magic ? attacker.d.magicMult : attacker.d.powerMult;
  if (!a.magic) dmg *= attacker.weapon.mult(move, attacker.stats);
  dmg *= counter.mult;
  if (move === 'haymaker' && attacker.talents.has('heavyhands')) dmg *= 1.15;
  if (move === 'throwb' && attacker.talents.has('kite')) dmg *= 1.6;
  if (a.magic && defender.state === 'block') dmg *= 0.65; // covering up blunts spells
  if (move === 'smite' && attacker.talents.has('judgement') && (defender.stagger || defender.sunder)) dmg *= 1.5;
  if (move === 'frostbolt' && attacker.talents.has('frostbite') && defender.wind < 30) dmg *= 1.4;
  if (attacker.weaken) dmg *= (1 - attacker.weaken.pct);
  if (defender.sunder) dmg *= 1.15;
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
  return Math.round(raw * acc * (1 + attacker.d.critChance * 0.5) * (1 - (defender ? defender.d.glanceChance : 0) * 0.5));
}

/* ================= fight state ================= */

export function makeFighter({ name, stats, weaponId = 'starter', outfit = null, talents = [] }) {
  const weapon = WEAPONS[weaponId] || WEAPONS.starter;
  const tset = new Set(talents);
  const d = derived(stats, weapon, tset);
  return {
    name, stats, weapon, d, outfit, talents: tset,
    titanUsed: false, bonestormUsed: false, secondWindUsed: false,
    tempestUsed: false, lastlightUsed: false,
    sigsUsed: 0, shoveCount: 0,
    mendUses: 3,
    ward: 0,          // holy shield pool, absorbs damage first
    burn: null,       // {per, turns}
    bleed: null,      // {stacks, turns}
    sunder: null,     // {turns} takes +15% damage
    weaken: null,     // {pct, turns} deals less damage
    hp: d.maxHp, wind: d.maxWind, hype: tset.has('bigentrance') ? 25 : 0,
    state: null,           // 'block' | 'dodge' | null (persists through opponent's next turn)
    stagger: false,        // loses one 1-AP action next turn
    offBalance: false,
    tauntCount: 0,
    recentCloseMoves: [],  // for AI tendency reads
  };
}

export function createFight({ player, foe, seed = 1, aiLevel = 1 }) {
  return {
    p: player, f: foe,
    range: 'close',
    active: 'p',
    turn: 1,
    ap: player.d.ap,
    rng: mulberry32(seed),
    aiLevel,
    telegraph: null,   // set when the foe has pre-committed a haymaker
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

function dealDamage(fight, victimWho, amount, events) {
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
  v.hp = Math.max(0, v.hp - amount);
  if (v.hp > 0 && v.hp <= v.d.maxHp * 0.25 && v.talents.has('secondwind') && !v.secondWindUsed && !v.lastlightUsed) {
    v.secondWindUsed = true;
    const heal = Math.round(v.d.maxHp * 0.15 * healMult(v));
    v.hp = Math.min(v.d.maxHp, v.hp + heal);
    v.wind = Math.min(v.d.maxWind, v.wind + 30);
    events.push({ t: 'secondwind', who: victimWho, heal });
  }
}

export function fighterOf(fight, who) { return who === 'p' ? fight.p : fight.f; }
export function opponentOf(fight, who) { return who === 'p' ? fight.f : fight.p; }

// legal actions for the active fighter right now
export function actionsFor(fight) {
  const me = fighterOf(fight, fight.active);
  const out = [];
  for (const [id, a] of Object.entries(ACTIONS)) {
    if (a.range !== 'any' && a.range !== fight.range) continue;
    if (a.talent && !me.talents.has(a.talent)) continue;
    if (id === 'signature' && me.hype < sigThreshold(me)) continue;
    if (id === 'titan' && me.titanUsed) continue;
    if (id === 'bonestorm' && me.bonestormUsed) continue;
    if (id === 'mend' && me.mendUses <= 0) continue;
    if (id === 'tempest' && me.tempestUsed) continue;
    if (id === 'ward' && me.ward >= 25) continue;
    let windCost = Math.round((a.wind || 0) * me.weapon.windCostMult(id));
    if (id === 'shove') windCost = Math.round(windCost * (1 + me.shoveCount));
    let ok = fight.ap >= a.ap && me.wind >= windCost;
    if (id === 'flurry') { windCost = me.wind; ok = fight.ap >= a.ap && me.wind >= 30; }
    out.push({ id, ...a, windCost, enabled: ok && !fight.over });
  }
  return out;
}

// apply one action by the active fighter; returns event list
export function applyAction(fight, actionId) {
  const me = fighterOf(fight, fight.active);
  const them = opponentOf(fight, fight.active);
  const a = ACTIONS[actionId];
  const events = [];
  let windCost = Math.round((a.wind || 0) * me.weapon.windCostMult(actionId));
  if (actionId === 'shove') windCost = Math.round(windCost * (1 + me.shoveCount));
  if (!a || fight.over) return events;
  if (a.range !== 'any' && a.range !== fight.range) return events;
  if (fight.ap < a.ap || me.wind < windCost) return events;

  fight.ap -= a.ap;
  me.wind -= windCost;
  if (fight.range === 'close' && ['jab', 'swing', 'haymaker', 'block', 'dodge', 'shove'].includes(actionId)) {
    me.recentCloseMoves.push(actionId);
    if (me.recentCloseMoves.length > 6) me.recentCloseMoves.shift();
  }

  switch (actionId) {
    case 'block':
    case 'dodge': {
      me.state = actionId;
      events.push({ t: 'state', who: fight.active, state: actionId });
      break;
    }
    case 'brace': {
      me.wind = Math.min(me.d.maxWind, me.wind + BRACE_BONUS);
      events.push({ t: 'brace', who: fight.active });
      break;
    }
    case 'shove': {
      fight.range = 'far';
      them.state = null; // resets their setup
      me.shoveCount += 1; // they get wise: each shove costs more wind
      gainHype(me, a.hype);
      events.push({ t: 'shove', who: fight.active });
      break;
    }
    case 'advance': {
      fight.range = 'close';
      events.push({ t: 'advance', who: fight.active });
      break;
    }
    case 'taunt': {
      const gain = TAUNT_CURVE[Math.min(me.tauntCount, TAUNT_CURVE.length - 1)];
      me.tauntCount += 1;
      gainHype(me, gain);
      if (me.talents.has('heckle')) {
        if (!them.weaken || them.weaken.pct <= 0.15) them.weaken = { pct: 0.15, turns: 2 };
        events.push({ t: 'status', who: fight.active === 'p' ? 'f' : 'p', kind: 'weaken' });
      }
      events.push({ t: 'taunt', who: fight.active, gain });
      break;
    }
    case 'signature': {
      if (me.hype < sigThreshold(me)) break;
      me.hype = 0;
      const boost = me.talents.has('showstopper') ? 1.25 : 1;
      const encore = Math.pow(0.75, me.sigsUsed); // the crowd's seen this one before
      me.sigsUsed += 1;
      const dmg = Math.round(ACTIONS.signature.base * me.d.powerMult * boost * encore);
      dealDamage(fight, fight.active === 'p' ? 'f' : 'p', dmg, events);
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
      dealDamage(fight, fight.active === 'p' ? 'f' : 'p', r.damage, events);
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
        dealDamage(fight, fight.active === 'p' ? 'f' : 'p', dmg, events);
        if (dmg > 0) { gainHype(me, 6); gainHype(them, HIT_TAKEN_HYPE); }
        events.push({ t: 'hit', who: fight.active, move: 'flurry', damage: dmg, crit: r.crit, glance: false, flurry: true, hitNo: h + 1, whiffed: !!r.whiffed });
      }
      break;
    }
    case 'bonebolt': {
      const r = resolveHit({ move: 'bonebolt', attacker: me, defender: them, rng: fight.rng });
      dealDamage(fight, fight.active === 'p' ? 'f' : 'p', r.damage, events);
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
          events.push({ t: 'status', who: fight.active === 'p' ? 'f' : 'p', kind: 'chill' });
        }
      }
      events.push({ t: 'hit', who: fight.active, move: 'bonebolt', ...r, magic: true });
      break;
    }
    case 'mend': {
      me.mendUses -= 1;
      const heal = Math.round((me.d.maxHp * 0.12 + 8 * me.d.magicMult) * healMult(me));
      me.hp = Math.min(me.d.maxHp, me.hp + heal);
      events.push({ t: 'heal', who: fight.active, amount: heal, mend: true, usesLeft: me.mendUses });
      break;
    }
    case 'hex': {
      if (!them.weaken || them.weaken.pct <= 0.20) them.weaken = { pct: 0.20, turns: 2 };
      events.push({ t: 'status', who: fight.active === 'p' ? 'f' : 'p', kind: 'hex' });
      break;
    }
    case 'smite': {
      const r = resolveHit({ move: 'smite', attacker: me, defender: them, rng: fight.rng });
      dealDamage(fight, fight.active === 'p' ? 'f' : 'p', r.damage, events);
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
      me.ward = 25;
      events.push({ t: 'status', who: fight.active, kind: 'ward' });
      break;
    }
    case 'frostbolt': {
      const r = resolveHit({ move: 'frostbolt', attacker: me, defender: them, rng: fight.rng });
      dealDamage(fight, fight.active === 'p' ? 'f' : 'p', r.damage, events);
      if (r.damage > 0) {
        gainHype(me, a.hype || 0);
        gainHype(them, them.talents.has('ovation') ? Math.round(HIT_TAKEN_HYPE * 1.5) : HIT_TAKEN_HYPE);
        them.wind = Math.max(0, them.wind - 8);
        events.push({ t: 'status', who: fight.active === 'p' ? 'f' : 'p', kind: 'chill' });
      }
      events.push({ t: 'hit', who: fight.active, move: 'frostbolt', ...r, magic: true });
      break;
    }
    case 'firebolt': {
      const r = resolveHit({ move: 'firebolt', attacker: me, defender: them, rng: fight.rng });
      dealDamage(fight, fight.active === 'p' ? 'f' : 'p', r.damage, events);
      if (r.damage > 0) {
        gainHype(me, a.hype || 0);
        gainHype(them, them.talents.has('ovation') ? Math.round(HIT_TAKEN_HYPE * 1.5) : HIT_TAKEN_HYPE);
        them.burn = { per: me.talents.has('wildfire') ? 7 : 5, turns: me.talents.has('wildfire') ? 3 : 2 };
        events.push({ t: 'status', who: fight.active === 'p' ? 'f' : 'p', kind: 'burn' });
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
        dealDamage(fight, fight.active === 'p' ? 'f' : 'p', r.damage, events);
        if (r.damage > 0) { landed = true; gainHype(me, 4); gainHype(them, them.talents.has('ovation') ? 6 : 4); }
        events.push({ t: 'hit', who: fight.active, move: 'tempest', damage: r.damage, crit: r.crit, glance: false, storm: true, school, hitNo: h + 1, whiffed: !!r.whiffed });
      }
      if (landed && them.hp > 0) {
        them.burn = { per: me.talents.has('wildfire') ? 7 : 5, turns: me.talents.has('wildfire') ? 3 : 2 };
        them.wind = Math.max(0, them.wind - 8);
        events.push({ t: 'status', who: fight.active === 'p' ? 'f' : 'p', kind: 'burn' });
        events.push({ t: 'status', who: fight.active === 'p' ? 'f' : 'p', kind: 'chill' });
      }
      break;
    }
    case 'bonestorm': {
      me.bonestormUsed = true;
      for (let h = 0; h < 3 && them.hp > 0; h++) {
        const r = resolveHit({ move: 'bonestorm', attacker: me, defender: them, rng: fight.rng });
        dealDamage(fight, fight.active === 'p' ? 'f' : 'p', r.damage, events);
        if (r.damage > 0) { gainHype(me, 5); gainHype(them, them.talents.has('ovation') ? 6 : 4); }
        events.push({ t: 'hit', who: fight.active, move: 'bonestorm', damage: r.damage, crit: r.crit, glance: false, storm: true, hitNo: h + 1, whiffed: !!r.whiffed });
      }
      break;
    }
    default: { // jab / swing / haymaker / throwb
      const move = actionId === 'throwb' ? 'throwb' : actionId;
      const r = resolveHit({ move, attacker: me, defender: them, rng: fight.rng });
      if (r.miss) {
        me.offBalance = r.whiffed ? !!r.offBalance : true;
        events.push({ t: 'miss', who: fight.active, move, whiffed: !!r.whiffed, offBalance: me.offBalance });
        if (them.talents.has('counterstep') && !r.whiffed) {
          const c = resolveHit({ move: 'jab', attacker: them, defender: { ...me, state: null, d: me.d, talents: me.talents, sunder: me.sunder }, rng: fight.rng });
          dealDamage(fight, fight.active, c.damage, events);
          if (c.damage > 0) gainHype(them, 6);
          events.push({ t: 'counter', who: fight.active === 'p' ? 'f' : 'p', damage: c.damage, crit: c.crit });
        }
      } else {
        dealDamage(fight, fight.active === 'p' ? 'f' : 'p', r.damage, events);
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
            events.push({ t: 'status', who: fight.active === 'p' ? 'f' : 'p', kind: 'sunder' });
          }
          if (move === 'jab' && me.talents.has('bleedout')) {
            them.bleed = { stacks: Math.min(3, (them.bleed ? them.bleed.stacks : 0) + 1), turns: 3 };
            events.push({ t: 'status', who: fight.active === 'p' ? 'f' : 'p', kind: 'bleed', stacks: them.bleed.stacks });
          }
        }
        events.push({ t: 'hit', who: fight.active, move, ...r });
      }
    }
  }

  if (them.hp <= 0) {
    fight.over = { winner: fight.active };
    events.push({ t: 'ko', who: fight.active });
  } else if (me.hp <= 0) {
    fight.over = { winner: fight.active === 'p' ? 'f' : 'p' };
  }
  return events;
}

// end the active fighter's turn, start the other's
export function endTurn(fight) {
  const next = fight.active === 'p' ? 'f' : 'p';
  fight.active = next;
  const me = fighterOf(fight, next);
  // my defensive state persisted through the opponent's turn; clears now
  me.state = null;
  me.wind = Math.min(me.d.maxWind, me.wind + REGEN_PER_TURN + (me.talents.has('totemic') ? 5 : 0));
  // status ticks
  const ticks = [];
  if (me.bleed) {
    const tick = 4 * me.bleed.stacks;
    me.hp = Math.max(0, me.hp - tick);
    ticks.push({ t: 'bleedtick', who: next, damage: tick });
    me.bleed.turns -= 1;
    if (me.bleed.turns <= 0) me.bleed = null;
  }
  if (me.hp > 0 && me.burn) {
    me.hp = Math.max(0, me.hp - me.burn.per);
    ticks.push({ t: 'burntick', who: next, damage: me.burn.per });
    me.burn.turns -= 1;
    if (me.burn.turns <= 0) me.burn = null;
  }
  fight.pendingTick = ticks[0] || null;
  fight.pendingTicks = ticks;
  if (me.hp <= 0) fight.over = { winner: next === 'p' ? 'f' : 'p' };
  if (me.sunder) { me.sunder.turns -= 1; if (me.sunder.turns <= 0) me.sunder = null; }
  if (me.weaken) { me.weaken.turns -= 1; if (me.weaken.turns <= 0) me.weaken = null; }
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

// pre-commit: does the foe wind up a haymaker for its next turn?
// called at the START of the player's turn so heavies are telegraphed.
export function planTelegraph(fight) {
  const f = fight.f;
  fight.telegraph = null;
  if (fight.over || fight.range !== 'close') return;
  const wantsHeavy = f.wind >= Math.round(35 * f.weapon.windCostMult('haymaker')) &&
    fight.rng() < (fight.p.state === 'block' ? 0.75 : 0.28 + fight.aiLevel * 0.04);
  if (wantsHeavy) fight.telegraph = 'haymaker';
}

// choose and apply the foe's whole turn; returns events
export function aiTakeTurn(fight) {
  const events = [];
  const f = fight.f, p = fight.p;
  let guard = 0;
  while (!fight.over && fight.active === 'f' && fight.ap > 0 && guard++ < 6) {
    const legal = actionsFor(fight).filter(x => x.enabled);
    if (!legal.length) break;
    const pick = (id) => legal.find(x => x.id === id);
    let choice = null;

    if (fight.telegraph === 'haymaker' && pick('haymaker')) {
      choice = 'haymaker';
      fight.telegraph = null;
    } else if (pick('signature')) {
      choice = 'signature';
    } else if (pick('titan') && fight.rng() < 0.6) {
      choice = 'titan';
    } else if (fight.range === 'far') {
      if (f.wind < 20 && pick('brace')) choice = 'brace';
      else if (pick('advance')) choice = 'advance';
      else if (pick('throwb')) choice = 'throwb';
      else choice = legal[0].id;
    } else {
      const pHeavy = haymakerRate(p.recentCloseMoves);
      if (f.wind < 18 && pick('brace')) choice = 'brace';
      else if (pHeavy > 0.45 && fight.rng() < 0.55 + fight.aiLevel * 0.1 && pick('dodge') && f.state == null) choice = 'dodge';
      else if (p.state === 'dodge' && pick('jab')) choice = 'jab';
      else if (p.state === 'block' && pick('jab') && fight.rng() < 0.5) choice = 'jab';
      else {
        const roll = fight.rng();
        if (roll < 0.5 && pick('swing')) choice = 'swing';
        else if (roll < 0.72 && pick('jab')) choice = 'jab';
        else if (roll < 0.86 && pick('block') && f.state == null) choice = 'block';
        else if (pick('swing')) choice = 'swing';
        else if (pick('jab')) choice = 'jab';
        else choice = legal[0].id;
      }
    }
    events.push({ t: 'foeAction', id: choice });
    events.push(...applyAction(fight, choice));
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
      planTelegraph(fight);
      let inner = 0;
      while (!fight.over && fight.active === 'p' && fight.ap > 0 && inner++ < 6) {
        const legal = actionsFor(fight).filter(x => x.enabled);
        if (!legal.length) break;
        const pick = id => legal.find(x => x.id === id);
        let c;
        if (fight.range === 'far') c = (fight.p.wind < 15 && pick('brace')) ? 'brace' : (pick('advance') ? 'advance' : legal[0].id);
        else if (fight.telegraph === 'haymaker' && pick('dodge') && fight.p.state == null && fight.rng() < 0.6) c = 'dodge';
        else if (pick('signature')) c = 'signature';
        else if (fight.p.wind < 18 && pick('brace')) c = 'brace';
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
  { rung: 1, name: 'Rattles', mult: 0.6, coins: 60, repeatCoins: 15, xp: 40 },
  { rung: 2, name: 'Knuckles', mult: 0.75, coins: 70, repeatCoins: 15, xp: 40 },
  { rung: 3, name: 'Big Femur', mult: 0.9, coins: 80, repeatCoins: 20, xp: 50 },
  { rung: 4, name: 'The Gravekeeper', mult: 1.05, coins: 90, repeatCoins: 20, xp: 50 },
  { rung: 5, name: 'Two-Ton Tibia', mult: 1.2, coins: 110, repeatCoins: 25, xp: 60 },
];
export const CHAMPION = { name: 'The Marrow King', mult: 1.32, coins: 220, repeatCoins: 40, xp: 100, weaponId: 'bonecrusher', talents: ['heavyhands', 'marrowlust', 'bonebreaker', 'concussive', 'thickskull', 'titan'] };
export const RUNG_TALENTS = { 4: ['heavyhands'], 5: ['heavyhands', 'marrowlust'] };

export function scaleStats(stats, mult) {
  const out = {};
  for (const k of Object.keys(stats)) out[k] = Math.max(5, Math.min(100, Math.round(stats[k] * mult)));
  return out;
}
