/* THROWAWAY: win% across Gauntlet ranks for a MAXED player on the strong builds
   the shipped fight-sim already identified. Same fight construction as app.js. */
import {
  makeFighter, createFight, actionsFor, applyAction, endTurn, aiTakeTurn,
  scaleStats, expectedDamage, ACTIONS, TURN_CAP, endlessFoe,
} from '../js/pit.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SEEDS = arg('--seeds', 120);
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
      const dmg = legal.filter(a => ACTIONS[a.id] && ACTIONS[a.id].base)
        .map(a => ({ id: a.id, v: expectedDamage(a.id, fight.p, fight.f, fight.f) / Math.max(1, a.ap) }))
        .sort((x, y) => y.v - x.v);
      pick = dmg.length ? dmg[0].id : legal[0].id;
    }
    applyAction(fight, pick);
  }
  if (!fight.over) endTurn(fight);
}
const MAX = { power: 100, marrow: 100, wind: 100, reflex: 100, hype: 100 };
const BUILDS = {
  'rage stack': ['heavyhands','followthrough','followthrough','followthrough','bonebreaker','concussive','rage','titan','ironjaw','ironjaw','ironjaw'],
  'crow lord': ['callcrows','sharpbeaks','sharpbeaks','sharpbeaks','sharpbeaks','sharpbeaks','flock','flock','flock','carrion','roost','roost','frenzy','frenzy','murder'],
  'alchemist': ['fireflask','potency','potency','potency','potency','potency','acidvial','catalyst','catalyst','catalyst','catalyst','catalyst','overdose','corrode','deathbomb'],
};
function winRate(talents, foe) {
  let wins = 0, ran = 0; const turns = [];
  for (let s = 1; s <= SEEDS; s++) {
    const player = makeFighter({ name: 'P', stats: MAX, weaponId: 'bonecrusher', talents });
    const f = makeFighter({ name: 'F', stats: scaleStats(MAX, foe.mult), weaponId: foe.weaponId || 'starter', talents: foe.talents || [] });
    if (foe.mage) f.wraith = true;
    const fight = createFight({ player, foe: f, seed: s * 7919, aiLevel: foe.aiLevel || 3 });
    let g = 0;
    while (!fight.over && g++ < TURN_CAP * 4) {
      if (fight.active === 'p') playerTurn(fight);
      else { aiTakeTurn(fight); if (!fight.over) endTurn(fight); }
    }
    ran++;
    if (fight.over && fight.over.winner === 'p') { wins++; turns.push(fight.turn); }
  }
  if (!ran) throw new Error('EMPTY SAMPLE');
  turns.sort((a, b) => a - b);
  return { ran, win: wins / ran, med: turns.length ? turns[Math.floor(turns.length / 2)] : null };
}
const pad = (s, n) => String(s).padEnd(n);
console.log(`maxed player (all stats 100, Bonecrusher), ${SEEDS} seeds/cell\n`);
console.log(pad('rank (mult, XP)', 32) + Object.keys(BUILDS).map(b => pad(b, 14)).join(''));
let total = 0;
for (const rank of [1, 5, 10, 15, 20, 25, 30, 40, 50, 60, 80, 100]) {
  const foe = endlessFoe(rank);
  const row = Object.values(BUILDS).map(t => {
    const r = winRate(t, foe); total += r.ran;
    return pad(`${(r.win * 100).toFixed(0)}% / ${r.med ?? '-'}t`, 14);
  });
  console.log(pad(`${rank} ${foe.name.slice(0, 13)} (${foe.mult.toFixed(2)}, ${foe.xp})`, 32) + row.join(''));
}
console.log(`\nCONTROL: ${total} fights actually ran (a zero here would invalidate every number above).`);
