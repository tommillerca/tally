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
    // The flock thins as it feeds (v288), so Call the Murder is a move you come
    // BACK to, not a one-off. Re-summon when the flock has actually thinned;
    // without the threshold the greedy policy re-casts every single turn and the
    // build measures as far worse than a person would ever play it.
    if (!pick && has('callcrows') && (fight.p.flock || 0) < 3) pick = 'callcrows';
    if (!pick) for (const id of SETUP_FIRST) if (id !== 'callcrows' && has(id)) { pick = id; break; }
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
function damagePerTurn({ stats, talents, pet }, { turns = 10, seed = 1 } = {}) {
  const player = makeFighter({ name: 'P', stats, talents, pet });
  const dummy = makeFighter({ name: 'DUMMY', stats: { ...stats, marrow: 4000, reflex: 0 } });
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
function runFight({ stats, talents, pet, foeMult, seed }) {
  const player = makeFighter({ name: 'P', stats, talents, pet });
  const foe = makeFighter({ name: 'F', stats: scaleStats(stats, foeMult) });
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
/* Pulled out so the STACK rows below reuse the EXACT same talent lists as the
   isolated rows, rather than a second copy that can drift from them. */
const BUILDS_SLAB = ['heavyhands', 'followthrough', 'rage', 'rage', 'rage', 'sunder', 'sunder'];
const BUILDS_ALCH = ['fireflask', 'potency', 'potency', 'potency', 'potency', 'potency', 'acidvial', 'catalyst', 'catalyst', 'catalyst', 'catalyst', 'catalyst', 'overdose', 'corrode', 'deathbomb'];
const BUILDS_STAM = ['totem', 'totemic', 'pacing', 'pacing', 'pacing', 'conduits', 'conduits', 'conduits', 'conduits', 'conduits', 'deeplungs'];

export const BUILDS = [
  { name: 'baseline (no talents)', stats: BASE, talents: [] },
  // #1 the multiplicative melee chain: heavy hands x follow-through x rage x sunder
  { name: 'Slab: rage stack', stats: BASE,
    talents: ['heavyhands', 'followthrough', 'followthrough', 'followthrough', 'bonebreaker', 'concussive', 'rage', 'titan', 'ironjaw', 'ironjaw', 'ironjaw'] },
  // #2 the Alchemist catalyst: toxicity feeds a multiplier with no ceiling
  { name: 'Alchemist: catalyst', stats: BASE,
    talents: ['fireflask', 'potency', 'potency', 'potency', 'potency', 'potency', 'acidvial', 'catalyst', 'catalyst', 'catalyst', 'catalyst', 'catalyst', 'overdose', 'corrode', 'deathbomb'] },
  // #3 sustain: lifesteal across trees, all multiplied by Hallowed Marrow
  { name: 'lifesteal + hallowed', stats: BASE,
    talents: ['hallowed', 'marrowlust', 'soulsiphon', 'radiance', 'secondwind', 'lastlight', 'devotion', 'devotion'] },
  // #4 the free per-turn flock: damage AND sustain at no AP cost
  { name: 'Crow Lord: flock', stats: BASE,
    talents: ['callcrows', 'sharpbeaks', 'sharpbeaks', 'sharpbeaks', 'sharpbeaks', 'sharpbeaks', 'flock', 'flock', 'flock', 'carrion', 'roost', 'roost', 'frenzy', 'frenzy', 'murder'] },
  // #5 two free lives, from two different trees
  { name: 'two free lives', stats: BASE, talents: ['secondwind', 'lastlight', 'hallowed'] },
  // #6 the stamina engine: if spells cost nothing, cost is not a resource
  { name: 'stamina engine', stats: BASE,
    talents: ['totem', 'totemic', 'pacing', 'pacing', 'pacing', 'conduits', 'conduits', 'conduits', 'conduits', 'conduits', 'deeplungs'] },
  // #7 the caster chain, for comparison against the melee one
  { name: 'Shaman: elemental', stats: BASE,
    talents: ['frostbolt', 'firebolt', 'attunement', 'attunement', 'attunement', 'attunement', 'attunement', 'wildfire', 'frostbite', 'tempest', 'kindling', 'kindling'] },
  /* ---- STACKS, added 2026-08-27. THE BOARD ABOVE TESTS BUILDS IN ISOLATION,
     WHICH IS NOT WHERE THE BUG WAS. The 3.39x finding that produced
     BUILD_MULT_CAP was a COMBINATION (Alchemist catalyst + the stamina engine +
     a free AP), and nothing here ever measured a combination again, so the cap
     that was added in response was never re-checked against the thing it was
     written for.
     Measured on this tree the day these rows were added:
       alchemist + stamina           2.17x   99% win   5 turns
       alchemist + stamina + slab    1.93x   98% win   5 turns
       everything measured           1.93x  100% win   4 turns
     The cap HOLDS, at 2.17x against a ceiling of 2.2, which is 98.6% of it. That
     is the useful number: there is almost no headroom, so the next damage talent
     or gear set breaches it, and now the board says so instead of a future
     session rediscovering stacking from scratch.
     WIN RATE IS THE OTHER HALF AND IT HAS NO CEILING. The full stack wins 100%
     of fights in 4 turns against a baseline of 78% in 6, and 'two free lives'
     reaches 98% with NO damage increase at all, so BUILD_MULT_CAP cannot touch
     it. Survivability stacking is unbounded by design; whether that is wrong is
     Tom's call, not the sim's. */
  { name: 'STACK: alchemist + stamina', stats: BASE,
    talents: [...BUILDS_ALCH, ...BUILDS_STAM] },
  { name: 'STACK: alch + stamina + slab', stats: BASE,
    talents: [...BUILDS_ALCH, ...BUILDS_STAM, ...BUILDS_SLAB] }
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
  console.log(pad('build', 30) + pad('dmg/turn', 11) + pad('x base', 9) + pad('win%', 7) + 'median turns');
  console.log('-'.repeat(76));
  for (const r of rows) {
    console.log(
      pad(r.name, 30) +
      pad(r.dpt.toFixed(1), 11) +
      pad((r.dpt / base.dpt).toFixed(2) + 'x', 9) +
      pad((r.winRate * 100).toFixed(0) + '%', 7) +
      (r.medianTurns ?? 'never won')
    );
  }
  console.log('\nSame stats in every row, so the multiplier IS the talents.');
}
