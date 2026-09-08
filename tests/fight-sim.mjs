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
import { realpathSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  makeFighter, createFight, endTurn, aiTakeTurn,
  scaleStats, TURN_CAP, smartPlayerTurn, LADDER, CHAMPION, RUNG_TALENTS, endlessFoe,
} from '../js/pit.js';

import { buildBattlePet, PET_ASSIGN, PET_TREES, PET_ACTIONS, petBattleStats } from '../js/pets.js';

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
function damagePerTurn({ stats, talents, pet, food = null }, { turns = 10, seed = 1 } = {}) {
  const player = makeFighter({ name: 'P', stats, talents, pet, food });
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
/* `food` is a COOKED DISH's buff object (js/cooking.js RECIPES[].buff), on the
   PLAYER only, which is what the Kitchen actually does. Added 2026-09-07 so the
   Pit's "what is this dish worth" line is measured here rather than asserted:
   makeFighter has always taken it, this harness simply never passed it. */
export function createSimFight({ stats, talents = [], pet, food = null, foeCfg, foeMult = 0.8, seed }) {
  const cfg = foeCfg || { mult: foeMult, aiLevel: 4 };
  const player = makeFighter({ name: 'P', stats, talents, pet, food });
  const foe = makeFighter({ name: cfg.name || 'F', stats: cfg.foeStats || scaleStats(stats, cfg.bossMult || cfg.mult),
    style: cfg.style || 'plain', talents: cfg.mode === 'champ' ? CHAMPION.talents
      : cfg.mode === 'rung' ? RUNG_TALENTS[cfg.rung] || [] : cfg.talents || [] });
  if (cfg.mage) foe.wraith = true;
  const add = cfg.add ? makeFighter({ name: cfg.add.name, stats: scaleStats(stats, cfg.add.mult), talents: cfg.add.talents || [] }) : null;
  return createFight({ player, foe, add, seed, aiLevel: cfg.aiLevel ?? 4 });
}
export function runFight(build) {
  const fight = createSimFight(build);
  let guard = 0;
  while (!fight.over && guard++ < TURN_CAP * 4) {
    if (fight.active === 'p') playerTurn(fight);
    else { aiTakeTurn(fight); if (!fight.over) endTurn(fight); }
  }
  if (!fight.over) throw new Error('fight-sim exhausted its loop guard');
  return { winner: fight.over.winner, turns: fight.turn };
}

export function winInterval(wins, n) {
  const z = 1.96, p = wins / n, den = 1 + z * z / n;
  const mid = (p + z * z / (2 * n)) / den;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}
export function medianInterval(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  // Exact distribution-free order-statistic interval for the winning median.
  let mass = 2 ** -n, tail = mass, k = 0;
  while (k < n / 2 && tail <= 0.025) {
    k++; mass *= (n - k + 1) / k; tail += mass;
  }
  return k === 0 ? [-Infinity, Infinity] : [sorted[k - 1], sorted[n - k]];
}
export function measurePet(build, { foeCfg, seeds = SEEDS } = {}) {
  if (!Number.isInteger(seeds) || seeds < 1) throw new Error('seeds must be a positive integer');
  let wins = 0, draws = 0; const turns = [];
  const family = build.pet?.family, actions = PET_ACTIONS[family];
  // Diagnostic ablation only: same real body and AI targeting, no pet action.
  if (build.noPetActions && family) PET_ACTIONS[family] = [];
  try {
    for (let s = 1; s <= seeds; s++) {
      const r = runFight({ ...build, foeCfg, seed: s * 7919 });
      if (r.winner === 'p') { wins++; turns.push(r.turns); }
      if (r.winner === 'draw') draws++;
    }
  } finally { if (build.noPetActions && family) PET_ACTIONS[family] = actions; }
  turns.sort((a, b) => a - b);
  return { winRate: wins / seeds, wins, draws, ci: winInterval(wins, seeds),
    medianTurns: turns.length ? turns[Math.floor(turns.length / 2)] : null, medianCI: medianInterval(turns) };
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


// Full encounter configurations, including AI, styles and talent kits.
export const FOES = [
  // app.js GLUTTON_FOE_*; balance.mjs pins this duplicate to the real caller.
  { key: 'dailyGlutton', name: 'The Glutton', mult: 1.3, aiLevel: 3, talents: ['heavyhands', 'marrowlust', 'bonebreaker'] },
  { key: 'champion', ...CHAMPION, aiLevel: 3 },
  { key: 'endless1', ...endlessFoe(1) },
  { key: 'glutton10', ...endlessFoe(10) },
  { key: 'wanderer13', ...endlessFoe(13) },
];
export const HIGH_LINEAGE = 20;
export function petPicks(id, level, path = 0) {
  return PET_TREES[PET_ASSIGN[id]].filter(t => t.tier <= level).map(t => t.opts[path].id);
}
export const PET_BUILDS = Object.keys(PET_ASSIGN).flatMap(id => [1, 6, 10].flatMap(level =>
  [[], petPicks(id, level, 0), petPicks(id, level, 1)].map((picks, path) => ({
    ...BUILDS[0], name: `${id} L${level} path${path}`, pet: buildBattlePet(id, level, picks),
  }))).concat([0, 1].map(path => ({ ...BUILDS[0], name: `${id} L10 shiny lineage${HIGH_LINEAGE} path${path + 1}`,
    pet: buildBattlePet(id, 10, petPicks(id, 10, path), { shiny: true, lineage: HIGH_LINEAGE }),
  }))));

export function decomposition(id) {
  const full = buildBattlePet(id, 10, petPicks(id, 10));
  const bare = { ...buildBattlePet(id, 10), signatureActive: false, passivePct: 0 };
  const base = { ...BUILDS[0] };
  return [
    { ...base, name: 'alone' },
    { ...base, name: 'body only', pet: bare, noPetActions: true },
    { ...base, name: '+ passive', pet: { ...bare, passivePct: buildBattlePet(id, 10).passivePct }, noPetActions: true },
    { ...base, name: '+ ability/basic', pet: { ...buildBattlePet(id, 10), signatureActive: false } },
    ...[2, 4, 6, 8, 10].map(tier => ({ ...base, name: `+ talent tier ${tier}`,
      pet: { ...buildBattlePet(id, 10, petPicks(id, tier)), signatureActive: false } })),
    { ...base, name: '+ Signature', pet: full },
    { ...base, name: '+ shiny only', pet: buildBattlePet(id, 10, petPicks(id, 10), { shiny: true }) },
    { ...base, name: '+ lineage20 only', pet: buildBattlePet(id, 10, petPicks(id, 10), { lineage: HIGH_LINEAGE }) },
    { ...base, name: '+ shiny/lineage20', pet: buildBattlePet(id, 10, petPicks(id, 10), { shiny: true, lineage: HIGH_LINEAGE }) },
    { ...base, name: 'full, L10 common stats', pet: { ...full, stats: petBattleStats('C3', 10) } },
    { ...base, name: 'full, L1 common stats', pet: { ...full, stats: petBattleStats('C3', 1) } },
  ];
}
// Sweep every mixed legal path, with and without the maximum intrinsic stack.
// Extrema are descriptive maxima over a fixed sample, not population guarantees.
export function petEnvelope({ seeds = SEEDS, levels = [6, 10], ids = Object.keys(PET_ASSIGN) } = {}) {
  const rows = [];
  for (const level of levels) for (const id of ids) {
    const choices = PET_TREES[PET_ASSIGN[id]].filter(t => t.tier <= level).reduce(
      (all, tier) => all.flatMap(picks => tier.opts.map(o => [...picks, o.id])), [[]]);
    const best = FOES.map(() => ({ winRate: -1 }));
    let samples = 0;
    for (const picks of choices) for (const opts of [{}, { shiny: true, lineage: HIGH_LINEAGE }]) {
      for (const [i, foeCfg] of FOES.entries()) {
        const r = measurePet({ ...BUILDS[0], pet: buildBattlePet(id, level, picks, opts) }, { foeCfg, seeds });
        if (r.winRate > best[i].winRate) best[i] = { ...r, picks, opts };
        samples += seeds;
      }
    }
    rows.push({ id, level, samples, best });
  }
  return rows;
}
function printEnvelope() {
  console.log('\nMIXED-PICK ENVELOPE: all 32 max-level / 8 level-6 paths, ordinary and shiny lineage20.');
  for (const row of petEnvelope()) console.log(JSON.stringify(row));
}

function printPetBoard() {
  console.log(`\nPET BOARD: ${SEEDS} paired seeds, stats=55, no player talents. Cells: win% [95% Wilson interval].`);
  console.log('build'.padEnd(38) + FOES.map(f => f.key.padEnd(23)).join(''));
  const cell = r => `${(100 * r.winRate).toFixed(1)} [${r.ci.map(x => (100 * x).toFixed(1)).join(',')}]`.padEnd(23);
  for (const b of [BUILDS[0], ...PET_BUILDS]) {
    console.log(b.name.padEnd(38) + FOES.map(foeCfg => cell(measurePet(b, { foeCfg }))).join(''));
  }
  console.log('\nDECOMPOSITION: ordered additions, not additive causal shares; interactions and RNG consumption change outcomes.');
  for (const id of ['C1', 'C2', 'C3', 'C4', 'C5']) {
    console.log(`\n${id} L10, path1; final row ablates the stat line only`);
    for (const b of decomposition(id)) console.log(b.name.padEnd(38) + FOES.map(foeCfg => cell(measurePet(b, { foeCfg }))).join(''));
  }
}

// Shared stress cells for the advisory board and the PURE regression guard.
export const PET_STRESS_KINDS = ['Skewer', 'Crow Lord', 'Crow Lord + Skewer'];
export function petStressBuilds() {
  return Object.keys(PET_ASSIGN).flatMap(id => PET_STRESS_KINDS.map(kind => {
    const picks = id === 'C1' ? ['i-jinx', 'i-doublehex', 'i-mark', 'i-deephex', 'i-havoc'] : petPicks(id, 10);
    return { ...(kind.includes('Crow Lord') ? BUILDS.find(b => b.name.includes('Crow Lord')) : BUILDS[0]),
      name: `${id} ${kind}`, id, kind,
      pet: buildBattlePet(id, 10, picks, { shiny: true, lineage: HIGH_LINEAGE }),
      food: kind.includes('Skewer') ? { petFree: true } : null };
  }));
}
export function petStressCells({ seeds = SEEDS } = {}) {
  return petStressBuilds().flatMap(build => FOES.map(foeCfg => ({
    key: `${build.name}/${foeCfg.key}`, id: build.id, kind: build.kind, foe: foeCfg.key, seeds,
    ...measurePet(build, { foeCfg, seeds }),
    control: measurePet({ ...build, pet: null }, { foeCfg, seeds }),
  })));
}
function printPetStress() {
  console.log('PET STRESS: win% [95% Wilson interval], paired no-pet win%, seeds');
  for (const cell of petStressCells()) console.log(JSON.stringify(cell));
}

// Historical T1 report retained for provenance. --report reads the current T2 handoff.
export const WAVE_REPORT = `T1 advisory work-order report, 2026-09-07

Scope and provenance
Frozen plan SHA256: a3abec03d6dee9376c829a0fbfa8acbb74dd1f406830d58ab26ce851efad9e65.
Verified the supplied plan file against that digest before editing.
Checkout HEAD: b394f11e907a2a49b3fa010f794bfd1619cfe312 (a merge).
Read git show HEAD, then its first parent's actual re-tune, 8e8aeb1b.
Read root CLAUDE.md. tally/CLAUDE.md does not exist in this checkout.
All source paths resolve inside this checkout. Historical sources come from
this checkout's Git objects and were written only to throwaway /private/tmp trees.

Files changed
js/pit.js: Skewer reduces the family special's recovery by one turn, minimum
one. Both the displayed availability and direct action dispatcher enforce it.
js/cooking.js: recipe, active-buff label and measured worth sentence match the
new recovery. Saved petFree remains the compatibility key; no migration needed.
tests/pit.test.js: exact 20% Signature contract, dormant below max and per-species;
real lethal hit and second-hit checks; normal and Skewer recovery for all seven
species, across two cycles, including direct attempts while disabled.
tests/dish-worth-audit.mjs: guards recipe/live-buff promises, retains every
measurement band, numerical threshold, no-percentage rule and NOCLAIM path.
tests/balance.mjs: replaces the old zero-cooldown expectation with the hound's
one-turn recovery; existing outcome ceilings and reward floors are unchanged.
tests/pet-family-audit.mjs: records deliberate ratification of the existing
rebaseline. Its frozen hashes, original fixture and identity guard are retained.
tests/fight-sim.mjs: stress coverage now includes all seven species and combined
Crow Lord plus Skewer, as well as each separately; this current advisory report
replaces the prior handoff. Run node tests/fight-sim.mjs --report to read it.
docs/CLAIMS.md: one dated T1 section, no other section edited.

Eternal Guard's 20% effect and player-facing text were already present in HEAD.
They are retained in js/pets.js; the stale >=0.4 test is now exactly 0.2.
The Signature stays per species, activates automatically at level 10 with no
Signature pick required, and its shield special arms the once-per-fight save.
No acquisition, purchase, inventory or progression source was changed.

Nothing earned is lost: what existing owners experience
A maxed pet keeps its iid, species/family, level 10, 82,000-step unlock, stored
steps, talent choices, Signature, shiny, lineage, nickname and cosmetics.
The inherited re-tune reduces HP growth and sustained combat output and caps
the combined rarity/shiny/lineage stat multiplier at 1.5. It does not grandfather
old combat power: pets can faint sooner and formerly automatic wins can be lost.
For example, ordinary C2 intrinsic HP is 84 instead of 176 before the re-tune,
plus the same owner-Marrow contribution. Eternal Guard saves at 20% instead of
40% HP, once per fight. The recorded lineage can still grow beyond its stat cap.

A player who stocked Skewers keeps every dish and remaining active charge.
The same saved petFree flag now means one-turn-faster recovery for the same two
fights: hound 2 -> 1 turns, warden/imp 4 -> 3. Hounds can still use their special
every player round; wardens/imps must wait through recovery. Recipe ingredients,
cook time, serving XP and charge consumption are unchanged. No paid power or
paid shortcut was added. The money-never-buys-power boundary is unchanged;
this is not a new audit of every historical purchase path.

Deliberate family rebaseline
The prior re-tune already froze new per-row hashes in pet-family-audit.mjs,
while preserving fixtures/pet-family-baseline.json from the original source.
Tom's ruling ratifies those exact tuned values: HEAD already has the 20% effect.
Re-measurement confirms all 13,552 builds and 54,208 effects match; Skewer is an
engine recovery rule outside the serialized build/effect snapshot, so no new
hash change is warranted. NO-DRIFT still fails on an old 40% C2 effect, and the
independent identity guard still protects assignments, roles and talent unlocks.
No baseline is regenerated during ordinary audit runs.

Measurement contract
Ran the entire default board with 200 deterministic paired seeds (s*7919),
owner stats 55, actual encounter multipliers/styles/talents/AI and additional
opponents. The five columns are daily Glutton, Champion, Endless 1, Glutton 10,
Wanderer 13. Every comparison drives the real smartPlayerTurn pet phase.
The default output includes 78 representative rows (no pet plus 77 pet builds),
75 decomposition rows, the 560,000-fight mixed-path envelope, 21 stress rows,
and the existing player-build summaries. Primary ladder conclusions below
come from fighting ladder opponents, not the ancillary damage dummy.

Three complete runs, all exit 0:
1. untuned-full-board.txt: production pets.js/pit.js from 8e8aeb1b^, before the
   inherited re-tune, with the current measuring instrument.
2. before-full-board.txt: incoming HEAD production, including its 20% Eternal
   Guard but the old Skewer bypass, with the same instrument.
3. after-full-board.txt: final production with both rulings completed.
All three logs live in /private/tmp/t1-proof. Cells carry Wilson intervals;
mixed-path extrema also retain winning-turn medians and their intervals.
Sample maxima and the >=95% stress flag describe these 200 seeds. They do not
certify every player build, policy, interaction or population win probability.

Before -> after whole pet envelope
Maximum sampled win% across all 32 legal level-10 paths, ordinary and shiny
lineage20, no player talents or food. Incoming HEAD and final values are identical
in this no-food arm; the original re-tune's before values were freshly rerun.
species | daily Glutton | Champion | Endless 1 | Glutton 10 | Wanderer 13
C1 | 100.0 -> 87.0 | 98.0 -> 55.5 | 99.0 -> 49.0 | 88.5 -> 14.0 | 97.5 -> 22.0
C2 | 100.0 -> 88.5 | 100.0 -> 54.0 | 100.0 -> 45.5 | 98.5 -> 10.0 | 100.0 -> 26.5
C3 | 99.5 -> 87.0 | 87.5 -> 39.0 | 88.5 -> 35.0 | 69.0 -> 12.5 | 88.5 -> 33.0
C4 | 99.5 -> 88.5 | 87.0 -> 48.5 | 86.5 -> 46.0 | 70.0 -> 25.0 | 91.0 -> 46.0
C5 | 100.0 -> 89.5 | 100.0 -> 57.5 | 100.0 -> 46.0 | 97.0 -> 14.5 | 100.0 -> 30.5
CX | 98.0 -> 84.5 | 74.5 -> 38.0 | 69.0 -> 33.0 | 47.0 -> 7.0 | 65.5 -> 27.0
C6 | 98.0 -> 82.0 | 72.5 -> 37.0 | 68.5 -> 30.0 | 42.0 -> 6.0 | 60.5 -> 25.5
Level-6 maxima across all species, all eight legal paths and both profiles:
96.5/82.5/69.0/24.5/43.5 -> 69.0/18.5/14.0/3.5/5.5.
The ordinary pet outcome target passes; it is not a universal saturation claim.

Stress board: incoming HEAD -> final
Each row uses a level-10 shiny lineage20 pet. C1 picks Jinx, Double Hex, Mark,
Deep Hex, Havoc; other species use the first legal path. Crow Lord is the real
player build from BUILDS. Skewer rows use the production food flag.
All cells are win%, in the same five-rung order above.
build | incoming HEAD | final
C1 Skewer | 100.0/97.5/98.0/89.5/92.0 | 90.0/62.5/61.0/21.5/37.5
C1 Crow Lord | 94.5/59.0/61.0/31.0/57.5 | 94.5/59.0/61.0/31.0/57.5
C1 Crow Lord + Skewer | 100.0/100.0/100.0/95.5/99.0 | 96.0/77.0/78.5/50.0/72.0
C2 Skewer | 90.0/61.0/52.5/24.5/29.0 | 82.5/44.0/39.5/9.0/14.5
C2 Crow Lord | 84.0/56.0/50.0/28.5/32.5 | 84.0/56.0/50.0/28.5/32.5
C2 Crow Lord + Skewer | 93.5/74.0/71.5/39.5/49.0 | 85.5/60.5/53.0/30.0/35.5
C3 Skewer | 83.5/34.5/37.0/11.0/31.5 | 83.5/34.5/37.0/11.0/31.5
C3 Crow Lord | 96.5/62.0/54.0/27.5/53.0 | 96.5/62.0/54.0/27.5/53.0
C3 Crow Lord + Skewer | 98.0/73.5/68.5/35.5/68.0 | 98.0/73.5/68.5/35.5/68.0
C4 Skewer | 93.5/64.5/65.5/48.5/65.5 | 93.5/64.5/65.5/48.5/65.5
C4 Crow Lord | 96.5/75.0/70.0/43.5/66.0 | 96.5/75.0/70.0/43.5/66.0
C4 Crow Lord + Skewer | 99.5/83.5/87.0/69.5/85.0 | 99.5/83.5/87.0/69.5/85.0
C5 Skewer | 98.0/80.5/73.5/39.5/58.5 | 92.0/61.0/45.0/16.0/29.0
C5 Crow Lord | 86.0/70.5/58.5/31.5/48.0 | 86.0/70.5/58.5/31.5/48.0
C5 Crow Lord + Skewer | 98.0/91.0/84.0/60.0/71.5 | 89.0/77.5/68.0/42.0/56.0
CX Skewer | 85.5/40.5/39.5/11.5/33.0 | 85.5/40.5/39.5/11.5/33.0
CX Crow Lord | 95.5/65.0/57.0/27.5/51.5 | 95.5/65.0/57.0/27.5/51.5
CX Crow Lord + Skewer | 98.0/75.5/72.5/39.5/68.0 | 98.0/75.5/72.5/39.5/68.0
C6 Skewer | 82.5/38.0/32.5/8.5/27.5 | 82.5/38.0/32.5/8.5/27.5
C6 Crow Lord | 95.0/62.0/54.0/25.0/49.0 | 95.0/62.0/54.0/25.0/49.0
C6 Crow Lord + Skewer | 98.0/74.0/69.0/37.0/64.0 | 98.0/74.0/69.0/37.0/64.0

Residual saturation is explicit. Daily Glutton remains at 96.0% for C1 with
Crow Lord plus Skewer; C3/C4 are 96.5% with Crow Lord alone and 98.0%/99.5%
with both; CX is 95.5%/98.0%, and C6 is 95.0%/98.0% respectively. These are
1.0, 1.5, 3.0, 4.5, 0.5 or 0 percentage points above the descriptive 95% flag,
as applicable. No other final stress cell reaches 95% on this board.
C4 with both still wins 83.5/87.0/69.5/85.0% on the four harder rungs, so there
is substantial strength below that flag too. No clearance for a fourth family,
level-11 combat growth or publication follows from these measurements.

Re-measured dish truth
Both configurations: 2,000 seeds, actual mirror foe, no player talents.
Hound (C6 level 5): baseline 1836 wins, Skewer 1900; win difference interval
[1.7, 4.8] percentage points, 39% of baseline losses removed. Without a pet:
both 747 wins, difference interval [-3.0, 3.0]pp. Copy contains no percentage:
Measured: with a trained hound at your side, recovering a turn sooner helps you
lose fewer fights against an even foe.

The plan predicted that changing Skewer would make the numerical dish claim
go red. Measurement shows that premise is false for this hound-only claim:
one-turn recovery and zero recovery both permit one special each player round.
The measured edge is identical. The proposed and implemented adjustment is to
retain the measured bands, rewrite the mechanical wording, and separately guard
real recovery for every species. No threshold was lowered to manufacture green.
Restoring the old recipe/live-buff promises fails the new copy rows.
Removing Skewer's edge fails PET; falsely registering it unclaimed fails NOCLAIM
upward. Both directions are demonstrated below.

Proof output
Agreed command, run verbatim in this checkout:
node tests/pit.test.js && node tests/dish-worth-audit.mjs
101 passed, 0 failed
dish-worth: all rows green
Exit 0. Full output: /private/tmp/t1-proof/agreed-proof.txt and agreed-proof.exit.

node tests/balance.mjs: 128/128 passed, exit 0, including all 560,000 envelope
fights. PET-COOLDOWN Skewer: cooldowns=1,1,1,1. WAVE-ETERNAL: save=0.2.
node tests/pet-family-audit.mjs: 14 passed, 0 failed, exit 0;
13552 builds and 54208 effects byte-identical.
Every entry in the actual PURE initializer plus all subsequent push/unshift
calls was executed using Node without the browser/server gate wrapper:
80/80 exit 0. No test was skipped, filtered, re-tiered or weakened.
Per-file receipts: /private/tmp/t1-proof/pure-results.json; full outputs and
separate exit files are named pure-<filename>.txt and pure-<filename>.exit.
The release-gate's browser/full tiers were not executed as a gate. balance.mjs
is an existing FULL-tier Node-only file and was run directly. No new audit was
added, so no tier registration was needed.

Red -> restored-green controls (throwaway copies only)
Skewer engine reverted to HEAD:
FAIL pets: Skewer C1 shortens recovery by one turn without bypassing it
C1 Skewer recovery: 0 !== 3
All seven species fail their recovery row: 94 passed, 7 failed, exit 1.
Restored final source: 101 passed, 0 failed, exit 0.

Eternal effect reverted to 40%:
FAIL pets: species signatures are per-pet, auto-lit only at max level (Lv 10)
Eternal Guard promises exactly 20% HP: 0.4 !== 0.2
FAIL pets: Eternal Guard survives a real lethal hit at 20% HP only once
lethal hit heals to 20% HP: 120 !== 60
99 passed, 2 failed, exit 1. Restored: 101 passed, 0 failed, exit 0.
Reverting only the description to 40% also fails the Signature text assertion.

Same old effect against the frozen family baseline:
FAIL NO-DRIFT full serialized builds and effects match the frozen WAVE baseline: C2 level 10
13 passed, 1 failed, exit 1. Restored: 14 passed, 0 failed, exit 0.
An initial throwaway lacked render assets and also failed KNOWN; copied the seven
required assets and reran both arms to isolate the actual baseline failure.
An initial asset-copy helper passed an ID where bhAsset requires an item object;
it failed ENOENT, was corrected, and affected no checkout file.

Old Skewer recipe and live-buff text:
FAIL SKEWER recipe promises one-turn-faster recovery
FAIL SKEWER saved petFree buffs print the same recovery promise
dish-worth: 2 FAILED, exit 1. Restored: dish-worth: all rows green, exit 0.

Skewer disabled in makeFighter, eliminating its measured edge:
FAIL PET Hunter's Skewer cuts losses with a trained hound  delta [-1.7, 1.7]pp
dish-worth: 1 FAILED, exit 1. Restored: dish-worth: all rows green, exit 0.

Working Skewer falsely registered UNCLAIMED with its worth sentence removed:
FAIL NOCLAIM Hunter's Skewer still measures no edge this harness can see (hound)
delta [1.7, 4.8]pp: if this no longer spans zero, write the sentence
dish-worth: 1 FAILED, exit 1. Restored: dish-worth: all rows green, exit 0.
Every red/green transcript and exit code is in /private/tmp/t1-proof, with
exit codes written directly to files, never read through a pipe.

Denied/blocked actions, deviations and integration findings
No approval rejection, denied command, commit, push, PR, publish, version stamp,
changelog edit, App Store Connect request or Worker request occurred. The direct
user prohibition on commit/push overrides the plan's contradictory closing line.
Browser and server proofs were prohibited and were not attempted. UI operation
and rendered-copy checks remain for the independent reviewer; Node results do
not certify those environments. Expect the revised Skewer recovery wording in
Kitchen/Pantry/Pit, and Eternal Guard's existing 20% text in the Stable.

The plan contains strict ownership boilerplate but no new explicit file list.
Scope was resolved from the prior lane's five owned files, the newly named
pit.test.js/cooking.js/dish-worth-audit.mjs permissions, and its explicit
CLAIMS.md instruction. No app.js, loot.js or sibling lane source was edited.
The absent nested CLAUDE.md and hound measurement limitation are disclosed above.
The rebaseline was already in HEAD; its exact hashes were deliberately ratified
instead of manufacturing a needless new baseline.

Integration blocker retained from the earlier report: app.js still advertises
uncapped lineage gains at lines 18166, 19504, 19509, 20051, 20320, 20759 and
21163, plus the unconditional 'got stronger' celebration at 21159. The owning
lane must replace raw lineage*5% and unconditional +5%/stronger promises with
the effective capped multiplier from petBattleStats/PET_STAT_MULT_CAP, disclose
when breeding adds no combat stats, and stop inviting players to sacrifice a
spare for power the cap prevents. These were read, not edited. This remains a
release blocker even though the scoped Node proofs pass.
Pack Tactics still changes only the deprecated companion field while manual
Bite uses its family recovery; C6 still has no species Signature definition.
Those inherited identity/copy issues require their owners' separate decisions.
This report is advisory for independent review, not release certification.
`;

// pathToFileURL, not string concatenation: this project lives under
// "Hyperframes Editor" and the space arrives percent-encoded in import.meta.url,
// so the naive compare silently never matched and the script printed nothing.
const isMain = !!process.argv[1] && process.argv[1] !== '-' && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) {
  if (process.argv.includes('--report')) { console.log(readFileSync(new URL('../docs/t2-balance-report.md', import.meta.url), 'utf8')); process.exit(0); }
  if (!Number.isInteger(SEEDS) || SEEDS < 1) throw new Error('seeds must be a positive integer');
  if (process.argv.includes('--stress-only')) { printPetStress(); process.exit(0); }
  if (process.argv.includes('--envelope-only')) { printEnvelope(); process.exit(0); }
  printPetBoard();
  printEnvelope();
  printPetStress();
  if (process.argv.includes('--pets-only')) process.exit(0);
  console.log(`fight-sim: ${BUILDS.length} builds + ${STACKS.length} stacks x ${SEEDS} seeds`);
  console.log('damage/turn vs a dummy (offense, no AI noise) + win% vs a foe at 80% of your stats\n');
  const rows = [...BUILDS, ...STACKS].map(b => measure(b));
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
  /* THE LADDER COLUMNS: the same builds against the rungs players actually
     fight. Without these, the 0.8x dummy column reads as the game (it did, for
     two days: a "100%, no ceiling" alarm that survived into a plan and five
     candidate nerfs before anyone asked what the foe was). */
  console.log('\nwin% vs the game\'s own rungs   Glutton 1.3   Wanderer 1.45');
  for (const b of [...BUILDS, ...STACKS].filter(x => /STACK|Crow|two free|stamina engine|baseline/.test(x.name))) {
    const a = Math.round(measure(b, { foeMult: 1.3 }).winRate * 100);
    const c = Math.round(measure(b, { foeMult: 1.45 }).winRate * 100);
    console.log(b.name.padEnd(30) + String(a + '%').padStart(12) + String(c + '%').padStart(15));
  }
}
