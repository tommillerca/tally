/* THE FIGHT SIM. A balance instrument, not a pass/fail test.
 *
 * WHY IT EXISTS. Tom, 2026-08-06: "Are any builds or classes or gear in the game
 * currently broken? Once we monetize I can't be having certain exploits that are
 * overpowered." Until now the only way to answer that was to play, which means
 * nobody ever did, which is how an uncapped multiplicative damage chain got to
 * eight talent trees deep without anyone measuring it.
 *
 * pit.js is pure (no DOM or IndexedDB), so a real fight
 * runs headless in a millisecond. This drives thousands of them.
 *
 * WHAT IT MEASURES: paired-seed pet contributions against the actual Pit and
 * Gauntlet configs, including talents, style and AI. The legacy dummy DPT ruler
 * remains separate for balance.mjs's existing no-pet guards.
 *
 * Usage:
 *   node tests/fight-sim.mjs              # the standard board
 *   node tests/fight-sim.mjs --seeds 400  # tighter numbers, slower
 */
import { pathToFileURL } from 'node:url';
import {
  makeFighter, createFight, endTurn, aiTakeTurn,
  scaleStats, TURN_CAP, smartPlayerTurn, LADDER, CHAMPION, RUNG_TALENTS, endlessFoe,
} from '../js/pit.js';

import { buildBattlePet, PET_ASSIGN, PET_TREES, PET_STATS, PET_SIGNATURE, SHINY_STAT_MULT, PET_LINEAGE_STEP } from '../js/pets.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SEEDS = arg('--seeds', 160);

/* A player policy good enough to expose a broken build: set up, then hit as hard
   as the current state allows. A weak policy would hide exactly the combos we
   are hunting, so buffs/summons that gate the big multipliers get priority.
   Moved to js/pit.js as smartPlayerTurn (master handoff B16, 2026-09-07) so the
   Glutton/Spire "can you plausibly win" sheets calibrate against the exact same
   simulated player this file already trusted for balance work. */
const playerTurn = smartPlayerTurn;

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
export function createSimFight({ stats, talents, pet, food, foeMult, foeCfg, seed }) {
  const player = makeFighter({ name: 'P', stats, talents, pet, food });
  const cfg = foeCfg || { mult: foeMult, aiLevel: 4 };
  const foe = makeFighter({ name: cfg.name || 'F', stats: scaleStats(stats, cfg.mult),
    style: cfg.style || 'plain', talents: cfg.talents || [] });
  if (cfg.mage) foe.wraith = true;
  const add = cfg.add ? makeFighter({ name: cfg.add.name || 'A',
    stats: scaleStats(stats, cfg.add.mult), talents: cfg.add.talents || [] }) : null;
  return createFight({ player, foe, add, seed, aiLevel: cfg.aiLevel });
}

export function runFight(build) {
  const fight = createSimFight(build);
  let guard = 0;
  while (!fight.over && guard++ < TURN_CAP * 4) {
    if (fight.active === 'p') playerTurn(fight);
    else { aiTakeTurn(fight); if (!fight.over) endTurn(fight); }
  }
  if (!fight.over) throw new Error('fight-sim exhausted its loop guard before a result');
  return { winner: fight.over.winner, turns: fight.turn };
}

// Wilson score intervals retain uncertainty even at 0/N and N/N wins.
export function winInterval(wins, n, z = 1.959963984540054) {
  if (!Number.isInteger(n) || n < 1 || wins < 0 || wins > n) throw new Error('nonempty valid sample required');
  const p = wins / n, den = 1 + z * z / n;
  const mid = (p + z * z / (2 * n)) / den;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}
const median = xs => xs.length ? (xs[Math.floor((xs.length - 1) / 2)] + xs[Math.floor(xs.length / 2)]) / 2 : null;
// Distribution-free order-statistic CI, conditional on winning. For <6 wins
// the sample cannot bound a two-sided 95% median, so report it as unbounded.
export function medianInterval(sorted) {
  const n = sorted.length;
  if (!n) return null;
  let logMass = -n * Math.LN2, tail = 0, k = 0;
  for (let j = 0; j < n / 2; j++) {
    tail += Math.exp(logMass);
    if (tail > 0.025) break;
    k = j + 1;
    logMass += Math.log((n - j) / (j + 1));
  }
  return k ? [sorted[k - 1], sorted[n - k]] : [-Infinity, Infinity];
}

export function measure(build, { foeMult = 0.8, foeCfg, seeds = SEEDS, offense = !foeCfg } = {}) {
  if (!Number.isInteger(seeds) || seeds < 1) throw new Error('seeds must be a positive integer');
  let wins = 0, draws = 0; const turns = [], dpts = [], outcomes = [];
  for (let s = 1; s <= seeds; s++) {
    const seed = s * 7919;
    if (offense) dpts.push(damagePerTurn(build, { seed }));
    const r = runFight({ ...build, foeMult, foeCfg, seed });
    outcomes.push(r);
    if (r.winner === 'p') { wins++; turns.push(r.turns); }
    if (r.winner === 'draw') draws++;
  }
  turns.sort((a, b) => a - b); dpts.sort((a, b) => a - b);
  return {
    name: build.name, wins, draws, seeds, outcomes,
    winRate: wins / seeds, winCI: winInterval(wins, seeds),
    medianTurns: median(turns), medianCI: medianInterval(turns),
    dpt: offense ? dpts[Math.floor(dpts.length / 2)] : null,
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
    talents: ['frostbolt', 'firebolt', 'attunement', 'attunement', 'attunement', 'attunement', 'attunement', 'wildfire', 'frostbite', 'tempest', 'kindling', 'kindling'] }

];

/* SEPARATE FROM BUILDS ON PURPOSE. tests/balance.mjs iterates BUILDS and holds
   every row to a 1.85x DESIGN BAND, a number chosen so the uncapped Alchemist at
   1.96x could not slip through. A STACK is a different question and is held to
   the game's HARD ceiling, BUILD_MULT_CAP, because that is the thing that
   actually stops it. Putting these in BUILDS graded a stack against the
   single-build band and turned balance.mjs red on my own change. */
export const STACKS = [
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
     WIN RATE LOOKED UNBOUNDED AND WAS NOT: THE DUMMY WAS. This comment used to
     say the full stack "wins 100% of fights" and that win rate "has no ceiling",
     and both claims were true only against this file's default foe at 0.8x of
     the player's stats, an opponent the shipped game stops serving almost
     immediately. Measured 2026-08-30 across the game's own escalation
     (160 seeds per cell):
        full stack:   79% vs an equal foe, 12% at the Glutton's 1.3,
                      3% at the Wanderer's 1.45
        Crow Lord:    94% / 41% / 18% at the same rungs
     and the endless Pit ladder opens at mult ~1.64 (js/pit.js: (1.32 +
     rank*0.07) * 1.18, proportional by design), so the first endless rung
     already beats every measured build over 94% of the time. Tom's ruling that
     a full stack "cannot be 100%" is satisfied by the shipped content; the
     alarm was this harness's dummy. The LADDER columns below exist so nobody
     reads the 0.8x column as the game again. */
  { name: 'STACK: alchemist + stamina', stats: BASE,
    talents: [...BUILDS_ALCH, ...BUILDS_STAM] },
  { name: 'STACK: alch + stamina + slab', stats: BASE,
    talents: [...BUILDS_ALCH, ...BUILDS_STAM, ...BUILDS_SLAB] }
];


// HIGH is a veteran scenario, not a measured population percentile: 20
// feedings, each consuming a pet, separated by 6,000 steps (loot.js). There is
// no lineage cap. These boosts multiply intrinsic stats, not all ability damage.
export const HIGH_LINEAGE = 20;
export const FOES = [
  ...LADDER.filter(l => [4, 8].includes(l.rung)).map(l => ({ ...l,
    key: `Pit ${l.rung}`, aiLevel: 2, talents: RUNG_TALENTS[l.rung] || [] })),
  { ...CHAMPION, key: 'Champion', aiLevel: 3 },
  ...[1, 10, 13].map(rank => ({ ...endlessFoe(rank), key: `Gauntlet ${rank}` })),
];

export function petPicks(id, level, branch) {
  return branch === 'none' ? [] : PET_TREES[PET_ASSIGN[id]]
    .filter(t => t.tier <= level).map(t => t.opts[branch === 'A' ? 0 : 1].id);
}
export const PET_BUILDS = Object.keys(PET_ASSIGN).flatMap(id => {
  const rows = [];
  const add = (level, branch, shiny = false, lineage = 0, stack = false) => {
    const parent = stack ? STACKS[STACKS.length - 1] : BUILDS[0];
    rows.push({ ...parent,
      name: `${id}/${PET_ASSIGN[id]} L${level} ${branch}${shiny ? ' shiny' : ''}${lineage ? ` lin${lineage}` : ''}${stack ? ' STACK' : ''}`,
      baseline: parent.name,
      pet: buildBattlePet(id, level, petPicks(id, level, branch), { shiny, lineage }),
    });
  };
  add(1, 'none');
  for (const level of [6, 10]) for (const branch of ['none', 'A', 'B']) add(level, branch);
  add(10, 'A', true);
  for (const branch of ['A', 'B']) {
    add(10, branch, true, HIGH_LINEAGE);
    add(10, branch, true, HIGH_LINEAGE, true);
  }
  return rows;
});

// Conservative 95% difference interval: two 97.5% Wilson intervals with
// Bonferroni coverage. Valid without treating paired seed outcomes as independent.
export function contribution(row, base) {
  if (row === base) return { winDelta: 0, winDeltaCI: [0, 0], turnsDelta: row.medianTurns == null ? null : 0 };
  const a = winInterval(row.wins, row.seeds, 2.241402727604947);
  const b = winInterval(base.wins, base.seeds, 2.241402727604947);
  return { winDelta: row.winRate - base.winRate, winDeltaCI: [a[0] - b[1], a[1] - b[0]],
    turnsDelta: row.medianTurns != null && base.medianTurns != null ? row.medianTurns - base.medianTurns : null };
}

const pct = n => (100 * n).toFixed(1);
const interval = (ci, format = String) => ci ? `[${ci.map(format).join(',')}]` : 'NA';
const signed = n => n == null ? 'NA' : `${n > 0 ? '+' : ''}${n.toFixed(1)}`;
const ttk = r => r.medianTurns == null ? 'NA (0 wins)' : `${r.medianTurns} ${r.medianCI.every(Number.isFinite) ? interval(r.medianCI) : '[unbounded]'}`;

export function printPetBoard({ seeds = SEEDS } = {}) {
  console.log(`PET BOARD: ${BUILDS.length + STACKS.length} no-pet + ${PET_BUILDS.length} pet builds x ${FOES.length} real configs x ${seeds} seeds`);
  console.log('Stats: power/marrow/wind/reflex/hype = 55. No food, gear or tutorial. Captain-first target. Special then basic pet policy.');
  console.log('Win CI: 95% Wilson; delta CI: conservative 95% difference. Same seeds for every build. Pointwise, not multiple-comparison certification.');
  console.log('TTK: median fight.turn among WINS ONLY, with exact conservative 95% order-statistic CI. NA = no wins; unbounded = too few wins.');
  console.log('Delta TTK compares winning subsets, not paired kill times. Draws count as nonwins. Delta baseline matches player talents.');
  console.log('A/B select first/second option at EVERY unlocked tier. Covers every talent, not every mixed path or optimal policy. L10 automatically activates the species signature.');
  console.log(`HIGH lineage=${HIGH_LINEAGE}: plausible veteran with 20 consumed pets and 6,000-step feeding cooldowns, not telemetry or an upper bound. Lineage stacks forever.`);
  for (const id of Object.keys(PET_ASSIGN)) {
    const m = PET_STATS[id].mult;
    console.log(`${id}: intrinsic rarity budget ${m} x shiny ${SHINY_STAT_MULT} x (1 + ${PET_LINEAGE_STEP} x ${HIGH_LINEAGE}) = ${(m * SHINY_STAT_MULT * (1 + PET_LINEAGE_STEP * HIGH_LINEAGE)).toFixed(4)}x, before species tilt/rounding. Signature: ${PET_SIGNATURE[id]?.name || 'MISSING'}`);
    console.log(`  A=${petPicks(id, 10, 'A').join(',')} | B=${petPicks(id, 10, 'B').join(',')}`);
  }
  console.log('FINDINGS: Pack Tactics sets pet.cooldown=1, but dispatch uses meta.cd=2; simulated unchanged. C6 has no species signature in this checkout.');
  console.log('Intrinsic rarity/shiny/lineage chiefly improve the pet body. Special damage/shields are owner/level-based; the formula is not a blanket DPS multiplier.');
  const all = [];
  for (const foeCfg of FOES) {
    console.log(`\n${foeCfg.key}: ${foeCfg.name} mult=${foeCfg.mult} AI=${foeCfg.aiLevel} style=${foeCfg.style || 'plain'} talents=${(foeCfg.talents || []).join(',')}`);
    console.log('build | wins/draws | win% [95% CI] | delta pp [95% CI] | winning TTK [95% CI] | delta TTK');
    const baselines = new Map();
    for (const build of [...BUILDS, ...STACKS, ...PET_BUILDS]) {
      const row = measure(build, { foeCfg, seeds });
      if (!build.pet) baselines.set(build.name, row);
      const base = baselines.get(build.baseline || BUILDS[0].name);
      const d = contribution(row, base);
      console.log(`${row.name} | ${row.wins}/${row.draws} | ${pct(row.winRate)} ${interval(row.winCI, pct)} | ${signed(100 * d.winDelta)} ${interval(d.winDeltaCI, pct)} | ${ttk(row)} | ${signed(d.turnsDelta)}`);
      all.push({ build, row, foeCfg, delta: d });
    }
  }
  // A screening rule, not a newly invented pet balance band. Existing no-pet
  // damage ceilings do not bound a second body's soak/healing/status effects.
  const flags = all.filter(x => x.build.pet && x.foeCfg.mult > 1 && x.row.winCI[0] > 0.9);
  console.log('\nOUTLIER SCREEN: lower 95% win bound >90% against a stronger real foe (advisory, no approved pet design band).');
  for (const x of flags) console.log(`FLAG ${x.foeCfg.key} ${x.row.name}: ${pct(x.row.winRate)}% ${interval(x.row.winCI, pct)}, TTK ${ttk(x.row)}`);
  console.log(`${flags.length} flagged cells. This finite board cannot certify unbounded lineage or untested mixed talent paths.`);
  return all;
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  console.log(`LEGACY NO-PET DPT RULER: ${SEEDS} seeds, dummy only; not a ladder win-rate claim`);
  const rows = [...BUILDS, ...STACKS].map(b => measure(b));
  for (const r of rows) console.log(`${r.name}: ${r.dpt.toFixed(1)} damage/turn, ${(r.dpt / rows[0].dpt).toFixed(2)}x baseline`);
  printPetBoard();
}
