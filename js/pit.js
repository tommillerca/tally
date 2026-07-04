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
      { id: 'heavyhands', name: 'Heavy Hands', desc: 'Haymakers hit 15% harder.' },
      { id: 'marrowlust', name: 'Marrowlust', desc: 'Haymaker and Titan hits heal you for 25% of the damage dealt.' },
      { id: 'titan', name: 'Titan', move: true, desc: 'NEW MOVE: once per fight, an overhead slam that ignores Block and Dodge.' },
    ],
  },
  {
    id: 'greyhound', name: 'Greyhound', tag: 'The Runner', color: 'var(--protein)',
    flavor: 'Speed and attrition. Pairs with a walking habit.',
    nodes: [
      { id: 'lightfeet', name: 'Light Feet', desc: '+1 action point every turn.' },
      { id: 'counterstep', name: 'Counterstep', desc: 'When a haymaker whiffs into your Dodge, you land a free counter-jab.' },
      { id: 'flurry', name: 'Flurry', move: true, desc: 'NEW MOVE: dump ALL your Wind into an unblockable 3-hit combo. Harder with more Wind.' },
    ],
  },
  {
    id: 'ringmaster', name: 'Ringmaster', tag: 'The Showman', color: 'var(--carbs)',
    flavor: 'Finishers and momentum. Pairs with quests and variety.',
    nodes: [
      { id: 'crowdwork', name: 'Crowd Work', desc: 'Hype builds 40% faster.' },
      { id: 'bigentrance', name: 'Big Entrance', desc: 'Start every fight at 25 Hype.' },
      { id: 'showstopper', name: 'Showstopper', desc: 'Signature fires at 80 Hype and hits 25% harder.' },
    ],
  },
];

export function talentPoints(level) { return Math.max(0, level - 1); }

// linear chains: a node needs the previous node in its tree
export function canTakeTalent(taken, treeId, nodeIdx) {
  const tree = TALENT_TREES.find(t => t.id === treeId);
  if (!tree || nodeIdx >= tree.nodes.length) return false;
  if (taken.has(tree.nodes[nodeIdx].id)) return false;
  return nodeIdx === 0 || taken.has(tree.nodes[nodeIdx - 1].id);
}

/* ================= derived pools (spec §1) ================= */

export function derived(stats, weapon = WEAPONS.starter, talents = null) {
  return {
    maxHp: Math.round(150 + stats.marrow * 3),
    maxWind: Math.round(40 + stats.wind * 0.6),
    ap: 2 + (weapon.apBonus || 0) + (talents && talents.has('lightfeet') ? 1 : 0),
    powerMult: 1 + (stats.power / 100) * 1.5,
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
};
export const SHOWSTOPPER_HYPE = 80;

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
  const immune = move === 'signature' || move === 'titan' || move === 'flurry';
  const counter = immune ? { mult: 1.0 } : counterMult(move, defender.state);
  if (counter.miss) {
    return { damage: 0, miss: true, offBalance: !!counter.offBalance, crit: false, glance: false };
  }
  let dmg = a.base;
  dmg *= attacker.d.powerMult;
  dmg *= attacker.weapon.mult(move, attacker.stats);
  dmg *= counter.mult;
  if (move === 'haymaker' && attacker.talents.has('heavyhands')) dmg *= 1.15;
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
  const raw = a.base * attacker.d.powerMult * attacker.weapon.mult(move, attacker.stats) * counter.mult;
  return Math.round(raw * (1 + attacker.d.critChance * 0.5) * (1 - (defender ? defender.d.glanceChance : 0) * 0.5));
}

/* ================= fight state ================= */

export function makeFighter({ name, stats, weaponId = 'starter', outfit = null, talents = [] }) {
  const weapon = WEAPONS[weaponId] || WEAPONS.starter;
  const tset = new Set(talents);
  const d = derived(stats, weapon, tset);
  return {
    name, stats, weapon, d, outfit, talents: tset,
    titanUsed: false,
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
    let windCost = Math.round((a.wind || 0) * me.weapon.windCostMult(id));
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
  const windCost = Math.round((a.wind || 0) * me.weapon.windCostMult(actionId));
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
      events.push({ t: 'taunt', who: fight.active, gain });
      break;
    }
    case 'signature': {
      if (me.hype < sigThreshold(me)) break;
      me.hype = 0;
      const boost = me.talents.has('showstopper') ? 1.25 : 1;
      const dmg = Math.round(ACTIONS.signature.base * me.d.powerMult * boost);
      them.hp = Math.max(0, them.hp - dmg);
      events.push({ t: 'hit', who: fight.active, move: 'signature', damage: dmg, crit: false, glance: false, signature: true });
      break;
    }
    case 'titan': {
      me.titanUsed = true;
      const r = resolveHit({ move: 'titan', attacker: me, defender: them, rng: fight.rng });
      them.hp = Math.max(0, them.hp - r.damage);
      if (r.damage > 0) {
        gainHype(me, a.hype || 0);
        gainHype(them, HIT_TAKEN_HYPE);
        if (me.talents.has('marrowlust')) {
          const heal = Math.round(r.damage * 0.25);
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
        them.hp = Math.max(0, them.hp - dmg);
        if (dmg > 0) { gainHype(me, 6); gainHype(them, HIT_TAKEN_HYPE); }
        events.push({ t: 'hit', who: fight.active, move: 'flurry', damage: dmg, crit: r.crit, glance: false, flurry: true, hitNo: h + 1 });
      }
      break;
    }
    default: { // jab / swing / haymaker / throwb
      const move = actionId === 'throwb' ? 'throwb' : actionId;
      const r = resolveHit({ move, attacker: me, defender: them, rng: fight.rng });
      if (r.miss) {
        me.offBalance = true;
        events.push({ t: 'miss', who: fight.active, move });
        if (them.talents.has('counterstep')) {
          const c = resolveHit({ move: 'jab', attacker: them, defender: { ...me, state: null, d: me.d }, rng: fight.rng });
          me.hp = Math.max(0, me.hp - c.damage);
          if (c.damage > 0) gainHype(them, 6);
          events.push({ t: 'counter', who: fight.active === 'p' ? 'f' : 'p', damage: c.damage, crit: c.crit });
        }
      } else {
        them.hp = Math.max(0, them.hp - r.damage);
        if (r.breaksGuard) { them.state = null; }
        if (r.stagger) { them.stagger = true; }
        if (r.damage > 0) {
          gainHype(me, a.hype || 0);
          gainHype(them, HIT_TAKEN_HYPE);
          if (move === 'haymaker' && me.talents.has('marrowlust')) {
            const heal = Math.round(r.damage * 0.25);
            me.hp = Math.min(me.d.maxHp, me.hp + heal);
            events.push({ t: 'heal', who: fight.active, amount: heal });
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
  me.wind = Math.min(me.d.maxWind, me.wind + REGEN_PER_TURN);
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
export const CHAMPION = { name: 'The Marrow King', mult: 1.32, coins: 220, repeatCoins: 40, xp: 100, weaponId: 'bonecrusher', talents: ['heavyhands', 'marrowlust', 'titan'] };
export const RUNG_TALENTS = { 4: ['heavyhands'], 5: ['heavyhands', 'marrowlust'] };

export function scaleStats(stats, mult) {
  const out = {};
  for (const k of Object.keys(stats)) out[k] = Math.max(5, Math.min(100, Math.round(stats[k] * mult)));
  return out;
}
