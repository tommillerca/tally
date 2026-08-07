/* THE FIGHT SIM. A balance instrument, not a pass/fail test.
 *
 * WHY IT EXISTS. Tom, 2026-08-06: "Are any builds or classes or gear in the game
 * currently broken? Once we monetize I can't be having certain exploits that are
 * overpowered." Until now the only way to answer that was to play, which means
 * nobody ever did, which is how an uncapped multiplicative damage chain got to
 * eight talent trees deep without anyone measuring it.
 *
 * pit.js is pure (it imports only pets.js, no DOM, no IndexedDB), so a real fight
 * runs headless in a millisecond. This drives thousands of them.
 *
 * WHAT IT MEASURES, per build: win rate and median turns-to-kill against a foe
 * scaled off the player's own stats, which is how the game actually builds its
 * enemies (scaleStats). A build that ends fights in half the turns of the
 * baseline is not "strong", it is the reason the Pit has no difficulty.
 *
 * Usage:
 *   node tests/fight-sim.mjs              # the standard board
 *   node tests/fight-sim.mjs --seeds 400  # tighter numbers, slower
 */
import { pathToFileURL } from 'node:url';
import {
  makeFighter, createFight, actionsFor, applyAction, endTurn, aiTakeTurn,
  scaleStats, expectedDamage, ACTIONS, TURN_CAP,
} from '../js/pit.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SEEDS = arg('--seeds', 160);

/* A player policy good enough to expose a broken build: set up, then hit as hard
   as the current state allows. A weak policy would hide exactly the combos we
   are hunting, so buffs/summons that gate the big multipliers get priority. */
const SETUP_FIRST = ['rage', 'totem', 'raisedead', 'callcrows', 'ward'];
function playerTurn(fight) {
  let guard = 0;
  while (!fight.over && fight.active === 'p' && fight.ap > 0 && guard++ < 8) {
    const legal = actionsFor(fight).filter(x => x.enabled);
    if (!legal.length) break;
    const has = id => legal.find(x => x.id === id);
    let pick = null;
    // stay alive first: a dead build measures nothing
    if (fight.p.hp < fight.p.d.maxHp * 0.3 && (has('mend') || has('guard'))) pick = has('mend') ? 'mend' : 'guard';
    if (!pick) for (const id of SETUP_FIRST) if (has(id)) { pick = id; break; }
    if (!pick && has('signature')) pick = 'signature';
    if (!pick) {
      // otherwise the best damage per AP available right now
      // .base, NOT .dmg: ACTIONS has no `dmg` field, so the original filter
      // matched nothing and every build silently spammed the first legal move,
      // which is exactly why the first sim run showed every talent set at 1.00x.
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

/* METRIC 1: DAMAGE PER TURN against a dummy.
 *
 * A mirror match at identical stats loses on turn 5 for every build, so win rate
 * alone carries no signal. Offense measured against something that cannot fight
 * back does: same stats, same turns, only the talents differ. The dummy has an
 * absurd Marrow so it survives long enough to be a ruler, and it never acts, so
 * there is no AI variance in the number. */
function damagePerTurn({ stats, talents, weaponId, pet }, { turns = 10, seed = 1 } = {}) {
  const player = makeFighter({ name: 'P', stats, weaponId, talents, pet });
  const dummy = makeFighter({ name: 'DUMMY', stats: { ...stats, marrow: 4000, reflex: 0 }, weaponId: 'starter' });
  const fight = createFight({ player, foe: dummy, seed, aiLevel: 1 });
  const startHp = fight.f.hp;
  let t = 0;
  while (!fight.over && t < turns) {
    if (fight.active === 'p') { playerTurn(fight); t++; }
    else { endTurn(fight); }   // the dummy simply passes
  }
  return (startHp - fight.f.hp) / Math.max(1, t);
}

/* METRIC 2: win rate against a real, fighting foe scaled like a ladder rung. */
function runFight({ stats, talents, weaponId, pet, foeMult, seed }) {
  const player = makeFighter({ name: 'P', stats, weaponId, talents, pet });
  const foe = makeFighter({ name: 'F', stats: scaleStats(stats, foeMult), weaponId: 'starter' });
  const fight = createFight({ player, foe, seed, aiLevel: 4 });
  let guard = 0;
  while (!fight.over && guard++ < TURN_CAP * 4) {
    if (fight.active === 'p') playerTurn(fight);
    else { aiTakeTurn(fight); if (!fight.over) endTurn(fight); }
  }
  return { winner: fight.over ? fight.over.winner : 'draw', turns: fight.turn };
}

export function measure(build, { foeMult = 0.8, seeds = SEEDS } = {}) {
  let wins = 0; const turns = []; const dpts = [];
  for (let s = 1; s <= seeds; s++) {
    const seed = s * 7919;
    dpts.push(damagePerTurn(build, { seed }));
    const r = runFight({ ...build, foeMult, seed });
    if (r.winner === 'p') { wins++; turns.push(r.turns); }
  }
  turns.sort((a, b) => a - b); dpts.sort((a, b) => a - b);
  return {
    name: build.name,
    winRate: wins / seeds,
    medianTurns: turns.length ? turns[Math.floor(turns.length / 2)] : null,
    dpt: dpts[Math.floor(dpts.length / 2)],
  };
}

/* The builds. Stats are held IDENTICAL across every row on purpose: the only
   variable is the talent set, so any difference in the table is the talents. */
const BASE = { power: 55, marrow: 55, wind: 55, reflex: 55, hype: 55 };
export const BUILDS = [
  { name: 'baseline (no talents)', stats: BASE, talents: [], weaponId: 'starter' },
  // #1 the multiplicative melee chain: heavy hands x follow-through x rage x sunder
  { name: 'Slab: rage stack', stats: BASE, weaponId: 'starter',
    talents: ['heavyhands', 'followthrough', 'followthrough', 'followthrough', 'bonebreaker', 'concussive', 'rage', 'titan', 'ironjaw', 'ironjaw', 'ironjaw'] },
  // #2 the Alchemist catalyst: toxicity feeds a multiplier with no ceiling
  { name: 'Alchemist: catalyst', stats: BASE, weaponId: 'starter',
    talents: ['fireflask', 'potency', 'potency', 'potency', 'potency', 'potency', 'acidvial', 'catalyst', 'catalyst', 'catalyst', 'catalyst', 'catalyst', 'overdose', 'corrode', 'deathbomb'] },
  // #3 sustain: lifesteal across trees, all multiplied by Hallowed Marrow
  { name: 'lifesteal + hallowed', stats: BASE, weaponId: 'starter',
    talents: ['hallowed', 'marrowlust', 'soulsiphon', 'radiance', 'secondwind', 'lastlight', 'devotion', 'devotion'] },
  // #4 the free per-turn flock: damage AND sustain at no AP cost
  { name: 'Crow Lord: flock', stats: BASE, weaponId: 'starter',
    talents: ['callcrows', 'sharpbeaks', 'sharpbeaks', 'sharpbeaks', 'sharpbeaks', 'sharpbeaks', 'flock', 'flock', 'flock', 'carrion', 'roost', 'roost', 'frenzy', 'frenzy', 'murder'] },
  // #5 two free lives, from two different trees
  { name: 'two free lives', stats: BASE, weaponId: 'starter', talents: ['secondwind', 'lastlight', 'hallowed'] },
  // #6 the stamina engine: if spells cost nothing, cost is not a resource
  { name: 'stamina engine', stats: BASE, weaponId: 'starter',
    talents: ['totem', 'totemic', 'pacing', 'pacing', 'pacing', 'conduits', 'conduits', 'conduits', 'conduits', 'conduits', 'deeplungs'] },
  // #7 the caster chain, for comparison against the melee one
  { name: 'Shaman: elemental', stats: BASE, weaponId: 'starter',
    talents: ['frostbolt', 'firebolt', 'attunement', 'attunement', 'attunement', 'attunement', 'attunement', 'wildfire', 'frostbite', 'tempest', 'kindling', 'kindling'] },
];

// pathToFileURL, not string concatenation: this project lives under
// "Hyperframes Editor" and the space arrives percent-encoded in import.meta.url,
// so the naive compare silently never matched and the script printed nothing.
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  console.log(`fight-sim: ${BUILDS.length} builds x ${SEEDS} seeds`);
  console.log('damage/turn vs a dummy (offense, no AI noise) + win% vs a foe at 80% of your stats\n');
  const rows = BUILDS.map(b => measure(b));
  const base = rows[0];
  const pad = (s, n) => String(s).padEnd(n);
  console.log(pad('build', 26) + pad('dmg/turn', 11) + pad('x base', 9) + pad('win%', 7) + 'median turns');
  console.log('-'.repeat(72));
  for (const r of rows) {
    console.log(
      pad(r.name, 26) +
      pad(r.dpt.toFixed(1), 11) +
      pad((r.dpt / base.dpt).toFixed(2) + 'x', 9) +
      pad((r.winRate * 100).toFixed(0) + '%', 7) +
      (r.medianTurns ?? 'never won')
    );
  }
  console.log('\nSame stats in every row, so the multiplier IS the talents.');
}
