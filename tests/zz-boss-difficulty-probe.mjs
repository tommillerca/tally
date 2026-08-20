/* THROWAWAY DIAGNOSTIC. Win rate against REAL boss configs, built the same way
   js/app.js openFight builds them: scaleStats(playerStats, mult), the boss's own
   talents, its own weapon, its own aiLevel, plus the den add where the den has
   one. Changes no balance constant. */
import {
  makeFighter, createFight, actionsFor, applyAction, endTurn, aiTakeTurn,
  scaleStats, expectedDamage, ACTIONS, TURN_CAP, LADDER, CHAMPION, RUNG_TALENTS,
  endlessFoe, talentPoints, TALENT_TREES,
} from '../js/pit.js';
import { DEN_TIERS, escalateDen, denBeastName } from '../js/poi.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SEEDS = arg('--seeds', 120);

/* the same greedy-but-sane policy the shipped fight-sim uses */
const SETUP_FIRST = ['rage', 'totem', 'raisedead', 'callcrows', 'ward'];
function playerTurn(fight) {
  let guard = 0;
  while (!fight.over && fight.active === 'p' && fight.ap > 0 && guard++ < 8) {
    const legal = actionsFor(fight).filter(x => x.enabled);
    if (!legal.length) break;
    const has = id => legal.find(x => x.id === id);
    let pick = null;
    if (fight.p.hp < fight.p.d.maxHp * 0.3 && (has('mend') || has('guard'))) pick = has('mend') ? 'mend' : 'guard';
    if (!pick && has('callcrows') && (fight.p.flock || 0) < 3) pick = 'callcrows';
    if (!pick) for (const id of SETUP_FIRST) if (id !== 'callcrows' && has(id)) { pick = id; break; }
    if (!pick && has('signature')) pick = 'signature';
    if (!pick) {
      const dmg = legal
        .filter(a => ACTIONS[a.id] && ACTIONS[a.id].base)
        .map(a => ({ id: a.id, v: expectedDamage(a.id, fight.p, fight.f, fight.f) / Math.max(1, a.ap) }))
        .sort((x, y) => y.v - x.v);
      pick = dmg.length ? dmg[0].id : legal[0].id;
    }
    applyAction(fight, pick);
  }
  if (!fight.over) endTurn(fight);
}

/* A LEVEL'S WORTH OF TALENTS, taken the way a player would: one tree, in order,
   ranks included. talentPoints(level) is the real budget. */
const SLAB = TALENT_TREES.find(t => /slab|bruiser|brawl/i.test(t.name || t.key || '')) || TALENT_TREES[0];
function talentsForLevel(level) {
  const budget = talentPoints(level);
  const out = [];
  for (const node of (SLAB.nodes || [])) {
    const ranks = node.ranks || 1;
    for (let r = 0; r < ranks && out.length < budget; r++) out.push(node.id);
    if (out.length >= budget) break;
  }
  return out;
}

function runFight({ pStats, pTalents, pWeapon, foe, addCfg, aiLevel, seed }) {
  const player = makeFighter({ name: 'P', stats: pStats, weaponId: pWeapon || 'starter', talents: pTalents });
  const f = makeFighter({ name: 'F', stats: scaleStats(pStats, foe.mult), weaponId: foe.weaponId || 'starter', talents: foe.talents || [] });
  if (foe.mage) f.wraith = true;
  const add = addCfg ? makeFighter({ name: 'A', stats: scaleStats(pStats, addCfg.mult), talents: addCfg.talents || [] }) : null;
  const fight = createFight({ player, foe: f, add, seed, aiLevel: aiLevel || 1 });
  let guard = 0;
  while (!fight.over && guard++ < TURN_CAP * 4) {
    if (fight.active === 'p') playerTurn(fight);
    else { aiTakeTurn(fight); if (!fight.over) endTurn(fight); }
  }
  return { winner: fight.over ? fight.over.winner : 'draw', turns: fight.turn };
}

function winRate(cfg) {
  let wins = 0, ran = 0;
  const turns = [];
  for (let s = 1; s <= SEEDS; s++) {
    const r = runFight({ ...cfg, seed: s * 7919 });
    ran++;
    if (r.winner === 'p') { wins++; turns.push(r.turns); }
  }
  if (!ran) throw new Error('EMPTY SAMPLE: no fights ran');
  turns.sort((a, b) => a - b);
  return { ran, win: wins / ran, medTurns: turns.length ? turns[Math.floor(turns.length / 2)] : null };
}

/* Player archetypes. deriveStats caps every stat at 100, so "committed" is not a
   hypothetical: protein 40 days = power 100, 400k lifetime steps = wind 100. */
const PLAYERS = {
  'new (habit stats ~30)':      { power: 30, marrow: 30, wind: 32, reflex: 26, hype: 26 },
  'regular (~55)':              { power: 55, marrow: 55, wind: 55, reflex: 50, hype: 50 },
  'committed (~80)':            { power: 80, marrow: 80, wind: 78, reflex: 74, hype: 74 },
  'maxed habits (100)':         { power: 100, marrow: 100, wind: 100, reflex: 100, hype: 100 },
};

const pad = (s, n) => String(s).padEnd(n);
console.log(`boss-difficulty probe: ${SEEDS} seeds per cell, real pit.js fights\n`);

console.log('=== SCALESTATS SATURATION: what the foe actually gets ===');
console.log(pad('player', 26) + pad('mult 1.0', 10) + pad('1.32', 8) + pad('1.67', 8) + pad('2.38', 8) + pad('3.21', 8) + '4.04');
for (const [name, st] of Object.entries(PLAYERS)) {
  const row = [1.0, 1.32, 1.67, 2.384, 3.21, 4.036].map(m => pad(scaleStats(st, m).power, 8));
  console.log(pad(name, 26) + pad(scaleStats(st, 1.0).power, 10) + row.slice(1).join(''));
}

console.log('\n=== LADDER RUNGS: win% by player level (talents = level-1 points) ===');
console.log(pad('rung (mult)', 26) + Object.keys(PLAYERS).map(p => pad(p.split(' ')[0], 13)).join(''));
for (const L of LADDER) {
  const row = Object.entries(PLAYERS).map(([, st]) => {
    const lvl = Math.max(1, L.rung * 2);
    const r = winRate({ pStats: st, pTalents: talentsForLevel(lvl), foe: { mult: L.mult, talents: RUNG_TALENTS[L.rung] || [] }, aiLevel: 2 });
    return pad(`${(r.win * 100).toFixed(0)}% / ${r.medTurns ?? '-'}t`, 13);
  });
  console.log(pad(`${L.rung} ${L.name.slice(0, 12)} (${L.mult})`, 26) + row.join(''));
}

console.log('\n=== GAUNTLET RANKS: win% by player level, "committed" stats ===');
console.log(pad('rank (mult, XP)', 30) + [5, 10, 15, 20, 30, 40].map(l => pad('L' + l, 12)).join(''));
for (const rank of [1, 3, 5, 7, 10, 14, 20, 30, 40]) {
  const foe = endlessFoe(rank);
  const row = [5, 10, 15, 20, 30, 40].map(lvl => {
    const r = winRate({ pStats: PLAYERS['committed (~80)'], pTalents: talentsForLevel(lvl), foe, aiLevel: foe.aiLevel });
    return pad(`${(r.win * 100).toFixed(0)}% / ${r.medTurns ?? '-'}t`, 12);
  });
  console.log(pad(`${rank} ${foe.name.slice(0, 14)} (${foe.mult.toFixed(2)}, ${foe.xp})`, 30) + row.join(''));
}

console.log('\n=== GAUNTLET RANKS: win% by player STATS at level 20 ===');
console.log(pad('rank (mult)', 26) + Object.keys(PLAYERS).map(p => pad(p.split(' ')[0], 13)).join(''));
for (const rank of [1, 5, 10, 20, 30, 40, 60]) {
  const foe = endlessFoe(rank);
  const row = Object.entries(PLAYERS).map(([, st]) => {
    const r = winRate({ pStats: st, pTalents: talentsForLevel(20), foe, aiLevel: foe.aiLevel });
    return pad(`${(r.win * 100).toFixed(0)}% / ${r.medTurns ?? '-'}t`, 13);
  });
  console.log(pad(`${rank} ${foe.name.slice(0, 10)} (${foe.mult.toFixed(2)})`, 26) + row.join(''));
}

console.log('\n=== BOSS DENS: win% by tier and den-wins escalation, committed / L20 ===');
console.log(pad('tier (base mult)', 22) + [0, 3, 5, 8, 12].map(w => pad(`${w} dens beaten`, 15)).join(''));
for (let tier = 0; tier <= 6; tier++) {
  const den = { ...DEN_TIERS[tier], theme: { arch: 'slab', boss: 'B' } };
  const row = [0, 3, 5, 8, 12].map(w => {
    const e = escalateDen(den, w);
    const r = winRate({
      pStats: PLAYERS['committed (~80)'], pTalents: talentsForLevel(20),
      foe: { mult: e.bossMult || e.mult, talents: den.talents || [] },
      addCfg: e.add, aiLevel: e.aiLevel,
    });
    return pad(`${(r.win * 100).toFixed(0)}% / ${r.medTurns ?? '-'}t`, 15);
  });
  console.log(pad(`${tier} (${DEN_TIERS[tier].mult})`, 22) + row.join(''));
}
