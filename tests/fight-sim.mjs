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
import { realpathSync } from 'node:fs';
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

// Advisory stress board. Food and player talent combinations are separate from
// the no-player-talents pet envelope. In particular petFree bypasses recovery.
function printPetStress() {
  console.log('\nSTRESS EXCEPTIONS (not covered by the ordinary pet envelope): ' + FOES.map(f => f.key).join('/'));
  for (const id of ['C1', 'C2', 'C3', 'C4', 'C5']) for (const kind of ['petFree', 'Crow Lord']) {
    const picks = id === 'C1' ? ['i-jinx', 'i-doublehex', 'i-mark', 'i-deephex', 'i-havoc'] : petPicks(id, 10);
    const build = { ...(kind === 'Crow Lord' ? BUILDS.find(b => b.name.includes('Crow Lord')) : BUILDS[0]),
      pet: buildBattlePet(id, 10, picks, { shiny: true, lineage: HIGH_LINEAGE }),
      food: kind === 'petFree' ? { petFree: true } : null };
    const rates = FOES.map(foeCfg => measurePet(build, { foeCfg }).winRate);
    console.log(`${id} ${kind}: ${rates.map(r => (100 * r).toFixed(1)).join('/')} ${rates.some(r => r >= 0.95) ? 'FLAG >=95%' : ''}`);
  }
}

// Frozen advisory report; run with --report for the complete handoff.
export const WAVE_REPORT = `WAVE advisory work-order report, 2026-09-07

Scope and provenance
Frozen plan SHA256: 0fa0c55fac97dfb3692cc8f5860d1972be2d93bb5aa71579328d2732df75b5c6.
Checkout base: b6b581da03c76366c35ac3cb19329426f1caa047.
Changed: js/pets.js, js/pit.js, tests/fight-sim.mjs, tests/balance.mjs,
tests/pet-family-audit.mjs. No new family, commits, pushes or publishing.
Read root CLAUDE.md. tally/CLAUDE.md is absent in this checkout; root is the
Tally-specific contract. All production paths resolved within this checkout.

Measurement contract
This checkout's initial balance.mjs failed at import: "does not provide an
export named 'createSimFight'". Restored the missing sim exports before tuning.
The instrument now builds actual encounter stats, styles, talents, AI and adds,
then drives smartPlayerTurn -> exactly one smartPetTurn -> endTurn. A no-pet
control and manual-action reference guard the consumer. The original production
modules were preserved in /private/tmp/wave-proof/before for before/red runs.
No before result is read off a changed production module.

All primary cells: 200 deterministic seeds s*7919, owner stats 55 in each stat,
no player talents or food. The default command prints the representative board,
Wilson 95% intervals, decomposition, all mixed-pick extrema (including winning
median turns and order-statistic median intervals), and separate stress flags.
Extrema sweep: 7 species, all 8 level-6 and 32 level-10 mixed legal paths, each
ordinary and shiny lineage 20, 5 encounters, 560000 fights. Maxima may come from
different picks before/after and on different rungs. They are observed sample
maxima, not population upper confidence bounds. These five rungs are a sample,
not the whole ladder or every stat allocation.

The plan's 40.5% alone baseline is not reproduced with these caller settings.
Measured alone: daily Glutton 1.5% [0.5,4.3], Champion 0.5% [0.1,2.8],
Endless 1 0.5% [0.1,2.8], rank-10 Glutton 0% [0,1.9], Wanderer 13 0.5% [0.1,2.8].
Daily Glutton is mult 1.3 / AI3 / three talents. Rank-10 Glutton is mult 2.384 /
AI5 / heavy / six talents. The report does not substitute a plain 1.3 dummy
for either encounter. The sim and audit source pin the daily caller constants.

Diagnosis before tuning
Ordered additions at level 10, first option in each tier, ordinary specimens;
these are win percentages on Glutton 10, not additive causal shares:
component             C1 imp   C2 warden   C3 hound   C4 hound   C5 warden
alone                  0.0       0.0        0.0        0.0        0.0
body only              0.5       0.5        0.0        0.0        0.0
+ family passive       0.5       0.5        0.0        0.0        0.0
+ ability/basic        0.5       2.0        3.5        2.5        0.0
+ tier 2               4.5       2.5        3.0        3.0        0.0
+ tier 4               4.5       2.5        3.0        3.0        0.0
+ tier 6               9.5      12.5        3.0        3.5        6.5
+ tier 8              12.0      19.5        5.5        5.0       12.5
+ tier 10             13.5      23.5        6.5        6.0       15.5
+ Signature           67.5      35.5       10.5       30.0       51.0
+ shiny / lineage20   71.0      77.5       25.5       62.5       95.5

The imp's Signature, not its shiny multiplier, dominates this path. Warden
sustain depends heavily on body survival: replacing C2's full intrinsic line
with L1 common stats while retaining its L10 kit drops 35.5% to 3.0%. Replacing
it with L10 common stats gives 15.0%, isolating the rarity/personality share.
The instrument also prints shiny-only and lineage-only ablations. Random-number
consumption and interactions mean adding a tier can slightly lower a sample
rate; the rows are not independent percentages to sum.

The combined stat cap was tested first, before talent tuning. At unchanged HP
and kits, cap 1.5 alone still left C5 shiny lineage20 path1 at 97% on Champion
and 74.5% on Glutton10. It was necessary but insufficient. The full mixed-pick
sweep also caught poison stacking that the all-first-option path understated.
Hound poison stacked Venom, Rupture and Chum Slick multiplicatively; warden
shielding stacked Bulwark, Fortify and Loyal Bulwark the same way. Imp curse
could last through its entire special recovery cycle.

Target and defence
Desired maxed-pet contribution is broad and matchup-dependent, approximately
+25 to +85 percentage points on daily Glutton, +15 to +70 on Champion,
+10 to +65 on early Endless, +2 to +40 on Glutton10 and +10 to +50 on Wanderer13.
Fixed-seed guard ceilings, allowing a little sampling/design headroom, are
90/75/70/45/55 percent wins respectively. Relative to the alone controls their
maximum permitted lifts are 88.5/74.5/69.5/45/54.5 points. The ordinary walking
reward should open encounters, while harder rungs still demand player progress.
Do not force every family to the same rate; matchup and talent choices matter.
The best legal builds per species must also clear useful floors of
25/15/10/2/10 percent, preventing a ceiling-only fix from making a family inert.
Level-6 ceilings are 75/40/35/10/15, leaving space for the 82000-step Signature.
These numerical ceilings cover this specified owner/food-free scenario only.

Tuned numbers
Combined rarity * shiny * lineage multiplier: min(1.5, old product). Species
rarity/tilts, shiny's 1.08 factor and +5% lineage term remain; raw lineage is
retained even above the combat cap. Intrinsic HP is 47+level instead of 40+8*level:
hatch HP stays 48; L10 is 57 instead of 120, before multipliers. Owner Marrow's
HP contribution is unchanged, and the engine's descriptor fallback matches.
Other intrinsic stat growth and family passive magnitudes are unchanged.
Hound Bite recovers in 2 turns; Warden Shield and Imp Hex recover in 4 instead
of 2. Their basic actions still fill the intervening turns.
Poison base tick: 1+0.20*level instead of 1+0.35*level. Venom +50%, Rupture +50%
and Chum Slick +40% add against the base before one rounding. Max C3 tick at
L10: 7 instead of 14; poison stacks/duration choices remain. Apex Ambush keeps
its guaranteed crit, with a 25% bonus instead of 50%.
Shield bonuses add against the base: Bulwark +50%, Fortify +40%, C5 Signature
+60% (previously +90%). Fully stacked L10 shield: 55 instead of 87. Cleansing,
stamina and healing choices remain. Last Stand saves at 5% instead of 15% HP;
C2's Signature saves at 20% instead of 40%. Both remain once per fight.
Imp base weaken: 8% instead of 12%, fully stacked 21.6% instead of 32.4%.
Blind: 20% instead of 30%. L10 storm tick: 8 instead of 16. Oblivion adds one
turn instead of two, leaving one actual enemy phase without weaken before the
next special. Stagger, mark, drain and burn identities remain.

Before -> after board
All maxed legal picks and both intrinsic profiles, best sampled win% per rung:
species | daily Glutton | Champion | Endless 1 | Glutton 10 | Wanderer 13
C1 | 100.0 -> 87.0 | 98.0 -> 55.5 | 99.0 -> 49.0 | 88.5 -> 14.0 | 97.5 -> 22.0
C2 | 100.0 -> 88.5 | 100.0 -> 54.0 | 100.0 -> 45.5 | 98.5 -> 10.0 | 100.0 -> 26.5
C3 | 99.5 -> 87.0 | 87.5 -> 39.0 | 88.5 -> 35.0 | 69.0 -> 12.5 | 88.5 -> 33.0
C4 | 99.5 -> 88.5 | 87.0 -> 48.5 | 86.5 -> 46.0 | 70.0 -> 25.0 | 91.0 -> 46.0
C5 | 100.0 -> 89.5 | 100.0 -> 57.5 | 100.0 -> 46.0 | 97.0 -> 14.5 | 100.0 -> 30.5
CX | 98.0 -> 84.5 | 74.5 -> 38.0 | 69.0 -> 33.0 | 47.0 -> 7.0 | 65.5 -> 27.0
C6 | 98.0 -> 82.0 | 72.5 -> 37.0 | 68.5 -> 30.0 | 42.0 -> 6.0 | 60.5 -> 25.5

Level-6 maximum across every species/path on the same five rungs:
96.5/82.5/69.0/24.5/43.5 -> 69.0/18.5/14.0/3.5/5.5.
The current default output includes every cell and its uncertainty. For example,
C1 ordinary first-path Glutton10 goes 67.5% [60.7,73.6] to 13.0% [9.0,18.4];
its pre-Signature path goes 13.5% to 1.5%, so the Signature remains meaningful.

Existing owners and level 11
No inventory, iid, banked level, steps, talent picks, lineage, shiny or morph is
deleted or rewritten. A maxed pet stays level 10 with the same unlocked choices
and Signature. It has less battle HP and less sustained special output, so it
can faint sooner and its owner can lose fights that were formerly automatic.
This is a real combat-power reduction, not grandfathered old power. For example,
ordinary C2's intrinsic HP goes 176 to 84, plus the same owner-Marrow contribution.
At capped lineage the pedigree number still increases but cannot increase stats
past 1.5. There is no new reason to spend pets solely for post-cap combat power.
No payment path or morph power is introduced; existing acquisition is unchanged.

Under today's formulas level 11 would buy more stats/passive/ability power and
no new unlock: the last tree tier and per-species Signature are already at 10.
That is exactly the vertical power this work bounds. Do not extend the current
formulas blindly. Leave max level 10 and its 82000-step cost intact. A future
11+ track can buy cosmetic mastery, titles or collection goals only after those
rewards are designed; this patch implements none of them and adds no family.

Guard evidence and ownership deviations
New guards live in existing release tiers: balance.mjs (FULL) and
pet-family-audit.mjs (PURE). No new audit file, so no release-gate edit needed.
The old family fixture remains immutable. New per-row hashes are frozen inside
the owned audit deliberately, and still cover 13552 builds / 54208 effects.
A separate original identity hash pins all three families and existing trees.
Original production files restored on a throwaway copy make guards fail:
  FAIL WAVE-STAT-CAP C1 ... HP=8229765, lineage=1000000
  FAIL WAVE-POISON ... per=14, stacks=3
  FAIL WAVE-SHIELD ... shield=87
  FAIL WAVE-CURSE ... weaken=0.324, burn=16
  FAIL WAVE-RECOVERY C1 ... cooldown=2
  FAIL WAVE-BLIND ... blind=0.3
  FAIL WAVE-SAVE C2 ... HP=126
Restored tuned source passes these with HP=86, poison=7, shield=55,
weaken=0.216/burn=8, cooldown=4, blind=0.2 and save HP=63 respectively.
The family audit reports 14 passed, 0 failed; the original-source red run reports
11 passed, 3 failed (cooldown, engine recovery and NO-DRIFT). An independent role
mutation also makes FAMILY-IDENTITY fail. Full red/green logs are in
/private/tmp/wave-proof, with exit codes stored separately, never read via pipes.

Agreed instrument: node tests/fight-sim.mjs --seeds 200, exit 0. An instrument
exit is not a universal balance pass. balance-audit.js also runs to exit 0.
The owned balance guard reports 128/128 passed, including the 560000-fight
envelope. The original-production red control reports 79/128 passed, exit 1;
49 checks fail on the real old behavior. The restored green run exits 0.
Pit unit checks report 92 passed, 1 failed: the unowned tests/pit.test.js still
requires fxC2.lastStandHeal >= 0.4. Reviewer change: pin it to 0.2, retaining the
existing once-per-fight test. This expected rebaseline was not made outside
file ownership. unit.test.js reports 362 passed, 1 failed: its embedded
serveTree child failed. That suite inadvertently attempted a server-dependent
check; no server/browser proof is claimed or retried. Browser/server review
remains unavailable under this work order. No approval rejection occurred.

Strict ownership conflicts with adding docs/CLAIMS.md. That file was not edited;
this dated report is kept in an owned file instead. Suggested lane PROOF entries:
balance.mjs
pet-family-audit.mjs
fight-sim.mjs
No original checkout, app.js, loot.js, spires.js, release metadata, App Store,
Worker, PR, native/ASC-SUBMISSION.md or integ/day5 was modified or contacted.

Integration blocker: uncapped lineage copy remains in unowned app.js at lines
18080, 19418, 19939, 20206, 20245, 20642 and 21036. These describe lineage*5%
or unconditional +5% to every stat. Before release, the owning lane must show
the effective capped multiplier from petBattleStats/PET_STAT_MULT_CAP, state
when breeding grants no further combat stats, and remove the unconditional
"stronger" claim from that celebration. Do not encourage sacrificing a spare
for a combat gain the cap prevents. This patch cannot fix those call sites
under strict ownership, so engine completion is not integration completion.

Unresolved interaction, proposed deviation for review
Hunter's Skewer's existing petFree flag bypasses cooldown entirely. A stress
probe with maxed shiny/lineage C1 and picks Jinx/Double Hex/Mark/Deep Hex/Havoc
still wins 100/97.5/98/89.5/92 percent on these rungs. With the same pet plus the
Crow Lord player build, rates are 94.5/59/61/31/57.5. Other combinations appear
in STRESS EXCEPTIONS in the default output. The ordinary pet target is met;
a claim that saturation is solved for the entire game would be false.
Do not treat this as clearance to add a fourth family or publish. Proposed
follow-up: replace petFree's zero cooldown with one-turn-faster recovery, then
remeasure. This requires agreeing a different dish contract, updating cooking.js
recipe/buff descriptions and app-facing copy plus the existing petFree tests.
Those files/semantics are outside this frozen lane. No silent food redesign was
made. Existing Pack Tactics is also still a deprecated auto-companion field;
the manual Bite remains on its existing two-turn cadence, as the original
family contract requires. This pre-existing identity/copy issue was not expanded
into another mechanics change.
`;

// pathToFileURL, not string concatenation: this project lives under
// "Hyperframes Editor" and the space arrives percent-encoded in import.meta.url,
// so the naive compare silently never matched and the script printed nothing.
const isMain = !!process.argv[1] && process.argv[1] !== '-' && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
if (isMain) {
  if (process.argv.includes('--report')) { console.log(WAVE_REPORT); process.exit(0); }
  if (!Number.isInteger(SEEDS) || SEEDS < 1) throw new Error('seeds must be a positive integer');
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
