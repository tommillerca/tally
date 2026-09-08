/* The balance guard. Runs the sim and FAILS if any build is outside the band.
 *
 * WHY. Tom, 2026-08-06: "Are any builds or classes or gear in the game currently
 * broken? Once we monetize I can't be having certain exploits that are
 * overpowered." Answering that once is worth little; the point is that it stays
 * answered as talents get added. This is the check that goes red the next time
 * somebody stacks a multiplier onto an already-multiplicative chain.
 *
 * The numbers below were MEASURED (tests/fight-sim.mjs, 2026-08-08), not chosen:
 *   before the caps   worst stack 3.39x baseline damage, Alchemist 2.14x at max
 *                     stats and still climbing with level
 *   after the caps    worst stack 2.99x, Alchemist 1.93x and flat
 *
 * PROVE-RED (confirmed 2026-08-08): raise BUILD_MULT_CAP to 5 in js/pit.js, or
 * delete the CATALYST_CAP clamp, and CEILING fails naming the build.
 *
 * Usage: node tests/balance.mjs
 */
import { measure, BUILDS, STACKS, PET_BUILDS, FOES, HIGH_LINEAGE, winInterval, medianInterval, createSimFight, measurePet, petPicks, petEnvelope } from './fight-sim.mjs';
import { BUILD_MULT_CAP, CATALYST_CAP, makeFighter, createFight, smartPlayerTurn,
  petActionsFor, applyPetAction, endTurn, actionsFor, applyAction, ACTIONS, expectedDamage, scaleStats } from '../js/pit.js';
import { buildBattlePet, PET_ASSIGN, PET_TREES, PET_STATS, petBattleStats, PET_ACTIONS, petAbilityEffect, PET_LEVEL_STEPS, PET_MAX_LEVEL } from '../js/pets.js';
import { runFight as auditFight, POLICIES } from './balance-audit.js';
import { isDeepStrictEqual } from 'node:util';

const SEEDS = 120;
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

/* Pet-policy guards live in this already registered FULL-tier audit. Prove red
   by restoring the original smartPlayerTurn on a throwaway copy, and separately
   removing balance-audit.js's pet dispatch. The reference drives the public
   manual actions, asserting the final state, including start-of-turn DoTs.
   No balance limit is raised to accommodate the newly visible pet output. */
const petFixture = (id, { picks = [], food, state } = {}) => {
  const fight = createFight({
    player: makeFighter({ stats: BUILDS[0].stats, pet: id ? buildBattlePet(id, 10, picks) : null, food }),
    foe: makeFighter({ stats: { ...BUILDS[0].stats, marrow: 4000 } }), seed: 7919, aiLevel: 3,
  });
  fight.p.hp -= 40; // make warden healing observable
  if (state === 'fainted') { fight.pAux.fainted = true; fight.pAux.hp = 0; }
  if (state === 'dead') fight.pAux.hp = 0;
  if (state === 'over') fight.over = { winner: 'p' };
  if (state === 'foe') fight.active = 'f';
  if (state === 'body-kill') { fight.f.hp = 1; fight.f.stats.reflex = 0; }
  if (state === 'pet-kill') { fight.f.hp = 1; fight.ap = 0; }
  return fight;
};
const snapshot = fight => JSON.stringify(fight, (k, v) => k === 'owner' || typeof v === 'function' ? undefined : v instanceof Set ? [...v] : v);
function manualBodyAndPet(fight) {
  if (fight.over || fight.active !== 'p') return;
  // Fixture has no player talents and enough HP to avoid the policy heal rule.
  while (!fight.over && fight.ap > 0) {
    const legal = actionsFor(fight).filter(a => a.enabled);
    if (!legal.length) break;
    const ranked = legal.filter(a => ACTIONS[a.id]?.base).sort((a, b) =>
      expectedDamage(b.id, fight.p, fight.f, fight.f) / Math.max(1, b.ap)
      - expectedDamage(a.id, fight.p, fight.f, fight.f) / Math.max(1, a.ap));
    applyAction(fight, legal.find(a => a.id === 'signature')?.id || ranked[0]?.id || legal[0].id);
  }
  const legal = petActionsFor(fight).filter(a => a.enabled);
  const action = legal.find(a => a.kind === 'special') || legal.find(a => a.kind === 'basic');
  if (action) applyPetAction(fight, action.id);
  if (!fight.over) endTurn(fight);
}
for (const id of Object.keys(PET_ASSIGN)) {
  const actual = petFixture(id), reference = petFixture(id);
  let same = true;
  const cds = [];
  for (let round = 0; round < 4; round++) {
    smartPlayerTurn(actual); manualBodyAndPet(reference);
    same &&= snapshot(actual) === snapshot(reference);
    cds.push(actual.p.pet?.specialCd);
    if (!actual.over) endTurn(actual);
    if (!reference.over) endTurn(reference);
  }
  ok(`PET-PHASE ${id} body then exactly one pet action then endTurn`, same && isDeepStrictEqual(cds, PET_ACTIONS[PET_ASSIGN[id]][0].cd === 2 ? [2, 1, 2, 1] : [4, 3, 2, 1]), `cooldowns=${cds}`);
}
for (const state of ['fainted', 'dead', 'over', 'foe', 'body-kill', 'pet-kill']) {
  const actual = petFixture('C4', { state }), reference = petFixture('C4', { state });
  smartPlayerTurn(actual); manualBodyAndPet(reference);
  ok(`PET-LIFECYCLE ${state} matches manual dispatch and terminal state`, snapshot(actual) === snapshot(reference)
    && (!state.endsWith('kill') || (actual.over?.winner === 'p' && actual.active === 'p')));
}
{
  const actual = petFixture(null), reference = petFixture(null);
  smartPlayerTurn(actual); manualBodyAndPet(reference);
  ok('PET-CONTROL no pet retains the body-only policy', snapshot(actual) === snapshot(reference));
}
for (const [label, opts, expected] of [
  ['Pack Tactics follows shipped meta.cd', { picks: ['h-pack'] }, [2, 1, 2, 1]],
  ['Skewer hound recovers one turn sooner', { food: { petFree: true } }, [1, 1, 1, 1]],
]) {
  const actual = petFixture('C3', opts), reference = petFixture('C3', opts), cds = [];
  let same = true;
  for (let i = 0; i < 4; i++) {
    smartPlayerTurn(actual); manualBodyAndPet(reference);
    same &&= snapshot(actual) === snapshot(reference);
    cds.push(actual.p.pet.specialCd);
    endTurn(actual); endTurn(reference);
  }
  ok(`PET-COOLDOWN ${label}`, same && isDeepStrictEqual(cds, expected), `cooldowns=${cds}`);
}
for (const id of ['C1', 'C2', 'C3']) {
  const run = pet => auditFight({ stats: BUILDS[0].stats, talents: [],
    foeCfg: FOES[2], policy: POLICIES.smart, seed: 7919, pet });
  const pet = run({ id, level: 10, picks: [] }), none = run(null);
  ok(`PET-AUDIT ${id} consumer actually executes pet turns`, pet.petActions > 0 && none.petActions === 0,
    `pet actions=${pet.petActions}, no-pet actions=${none.petActions}`);
}
for (const id of Object.keys(PET_ASSIGN)) {
  const rows = PET_BUILDS.filter(b => b.pet.id === id);
  const picks = new Set(rows.flatMap(b => [...b.pet.picks]));
  const coverage = PET_TREES[PET_ASSIGN[id]].every(t => t.opts.every(o => picks.has(o.id)));
  const legal = rows.every(b => PET_TREES[PET_ASSIGN[id]].every(t =>
    t.opts.filter(o => b.pet.picks.has(o.id)).length <= (b.pet.level >= t.tier ? 1 : 0)));
  ok(`PET-COVERAGE ${id} levels, no talents, both legal paths and auto signature state`, coverage && legal
    && [1, 6, 10].every(level => rows.some(b => b.pet.level === level && b.pet.picks.size === 0))
    && rows.every(b => b.pet.signatureActive === (b.pet.level === 10)));
  const high = rows.find(b => b.pet.shiny && b.pet.lineage === HIGH_LINEAGE);
  const m = Math.min(1.5, PET_STATS[id].mult * 1.08 * (1 + 0.05 * HIGH_LINEAGE));
  ok(`PET-STACK ${id} high lineage reaches the intrinsic HP at end of construction`, !!high
    && makeFighter({ stats: BUILDS[0].stats, pet: high.pet }).pet.stats.hp
      === Math.round(57 * m * (PET_STATS[id].tilt.marrow || 1))
    && petBattleStats(id, 10, true, HIGH_LINEAGE + 1).hp === high.pet.stats.hp, `${m.toFixed(4)}x, bounded above HIGH`);
}
ok('PET-STATS confidence retains uncertainty at extremes and sparse wins',
  winInterval(0, 200)[1] > 0 && winInterval(200, 200)[0] < 1
  && medianInterval([]) === null && medianInterval([4])[1] === Infinity
  && isDeepStrictEqual(medianInterval(Array(200).fill(4)), [4, 4]));
for (const foeCfg of FOES) {
  const fight = createSimFight({ ...BUILDS[0], foeCfg, seed: 1 });
  const expected = makeFighter({ name: foeCfg.name, stats: scaleStats(BUILDS[0].stats, foeCfg.mult),
    style: foeCfg.style || 'plain', talents: foeCfg.talents || [] });
  ok(`PET-LADDER ${foeCfg.key} measures the full real config`,
    isDeepStrictEqual(fight.f.stats, expected.stats) && fight.f.style.id === expected.style.id
    && isDeepStrictEqual(fight.f.talents, expected.talents) && fight.aiLevel === foeCfg.aiLevel,
    `mult=${foeCfg.mult}, AI=${fight.aiLevel}, style=${fight.f.style.id}, talents=${fight.f.talents.size}`);
}

/* WAVE 2026-09-07. New guards in the already registered FULL-tier audit.
   Red control: original pets.js/pit.js on a throwaway copy of this checkout.
   These assert resolved combat state as well as the stat boundary. */
for (const id of Object.keys(PET_ASSIGN)) {
  const high = buildBattlePet(id, 10, petPicks(id, 10), { shiny: true, lineage: 1000000 });
  const low = petBattleStats(id, 1);
  const tilt = PET_STATS[id].tilt;
  ok(`WAVE-STAT-CAP ${id} finite power budget keeps the earned lineage`,
    high.stats.hp <= Math.round(57 * 1.5 * (tilt.marrow || 1))
    && high.stats.power <= Math.round(50 * 1.5 * (tilt.power || 1))
    && high.lineage === 1000000 && high.stats.lineage === 1000000,
    `HP=${high.stats.hp}, lineage=${high.lineage}`);
  ok(`WAVE-HP ${id} hatch HP is preserved, level growth is bounded`,
    low.hp === Math.round(48 * PET_STATS[id].mult * (tilt.marrow || 1))
    && petBattleStats(id, 10).hp === Math.round(57 * PET_STATS[id].mult * (tilt.marrow || 1)));
}
for (const mode of ['missing stats', 'missing HP']) {
  const descriptor = buildBattlePet('C3', 10);
  if (mode === 'missing stats') delete descriptor.stats;
  else delete descriptor.stats.hp;
  const fight = createFight({ player: makeFighter({ stats: BUILDS[0].stats, pet: descriptor }),
    foe: makeFighter({ stats: BUILDS[0].stats }) });
  ok(`WAVE-HP-FALLBACK ${mode} reaches the same bounded body HP`, fight.pAux.d.maxHp === 71,
    `body HP=${fight.pAux.d.maxHp}`);
}
ok('WAVE-EARNED level 10 and Signature still unlock at 82000 steps',
  PET_MAX_LEVEL === 10 && PET_LEVEL_STEPS[9] === 82000
  && Object.keys(PET_ASSIGN).every(id => buildBattlePet(id, 10).signatureActive));
{
  const self = { d: { powerMult: 1, maxHp: 100 } }, foe = { hp: 100, d: { maxHp: 100 } };
  const effect = (id, picks) => petAbilityEffect(buildBattlePet(id, 10, picks), self, foe);
  const poison = effect('C3', ['h-venom', 'h-rupture']);
  ok('WAVE-POISON stacked poison and Signature share an additive budget', poison.poison.per === 7 && poison.poison.stacks === 3,
    `per=${poison.poison.per}, stacks=${poison.poison.stacks}`);
  const shield = effect('C5', ['w-bulwark', 'w-fortify']);
  ok('WAVE-SHIELD shield talents and Signature share an additive budget', shield.shield === 55, `shield=${shield.shield}`);
  const imp = effect('C1', ['i-doublehex', 'i-deephex', 'i-oblivion']);
  ok('WAVE-CURSE-GAP maximum duration leaves an unweakened enemy turn', imp.turns === 4, `duration=${imp.turns}`);
  ok('WAVE-CURSE bounded weaken and burning Signature', Math.abs(imp.weakenPct - 0.216) < 1e-10 && imp.burn.per === 8,
    `weaken=${imp.weakenPct.toFixed(3)}, burn=${imp.burn.per}`);
  const bite = effect('C4', []);
  ok('WAVE-AMBUSH guaranteed crit keeps a smaller Signature multiplier', bite.critAlways && bite.damage === 11, `damage=${bite.damage}`);
}
for (const id of ['C1', 'C2']) {
  const fight = petFixture(id, { picks: id === 'C1' ? ['i-jinx'] : [] });
  applyPetAction(fight, id === 'C1' ? 'hex' : 'shield');
  ok(`WAVE-RECOVERY ${id} special resolves with four-turn recovery`, fight.p.pet.specialCd === 4,
    `cooldown=${fight.p.pet.specialCd}`);
  if (id === 'C1') ok('WAVE-BLIND resolved curse misses at 20 percent', fight.f.blind.pct === 0.2,
    `blind=${fight.f.blind.pct}`);
  else ok('WAVE-ETERNAL resolved save arms a 20 percent heal', fight.p.pet.lastStandHealFrac === 0.2,
    `save=${fight.p.pet.lastStandHealFrac}`);
}
{
  const fight = petFixture('C1', { picks: ['i-doublehex', 'i-oblivion'] });
  applyPetAction(fight, 'hex');
  const weakened = [];
  for (let round = 0; round < 4; round++) {
    endTurn(fight); weakened.push(!!fight.f.weaken); endTurn(fight);
  }
  ok('WAVE-CURSE-WINDOW real enemy phase has a gap before recast',
    isDeepStrictEqual(weakened, [true, true, true, false]), `weakened=${weakened}`);
}
// Real lethal hits test the shared damage path, not merely the effect intent.
for (const [id, expected] of [['C5', 0.05], ['C2', 0.2]]) {
  const fight = petFixture(id, { picks: ['w-laststand'] });
  applyPetAction(fight, 'shield');
  fight.p.ward = 0; fight.p.hp = 1; fight.pTarget = 'f';
  endTurn(fight); fight.ap = 2; fight.f.wind = fight.f.d.maxWind; fight.rng = () => 0.5;
  applyAction(fight, 'haymaker');
  ok(`WAVE-SAVE ${id} lethal hit consumes one save at the tuned HP`,
    fight.p.pet.lastStandUsed && fight.p.hp === Math.round(fight.p.d.maxHp * expected), `HP=${fight.p.hp}`);
}
const appSource = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
ok('WAVE-ENCOUNTER daily Glutton config matches the real caller',
  appSource.includes('const GLUTTON_FOE_MULT = 1.3;')
  && appSource.includes('const GLUTTON_FOE_AI_LEVEL = 3;')
  && appSource.includes("const GLUTTON_FOE_TALENTS = ['heavyhands', 'marrowlust', 'bonebreaker'];"));

// Fixed 200-seed outcome ceilings. Maxed pets help unlock a rung, but cannot
// erase it. The level-6 ceiling reserves a reason to finish the walking curve.
const waveEnvelope = petEnvelope({ seeds: 200 });
for (const row of waveEnvelope) {
  const ceilings = row.level === 6 ? [0.75, 0.40, 0.35, 0.10, 0.15] : [0.90, 0.75, 0.70, 0.45, 0.55];
  ok(`WAVE-OUTCOME ${row.id} L${row.level} every mixed legal path stays below rung ceilings`,
    row.samples > 0 && row.best.every((r, i) => r.winRate <= ceilings[i]),
    row.best.map((r, i) => `${FOES[i].key}=${(100 * r.winRate).toFixed(1)}<=${Math.round(100 * ceilings[i])}`).join(', '));
  if (row.level === 10) {
    const floors = [0.25, 0.15, 0.10, 0.02, 0.10];
    ok(`WAVE-REWARD ${row.id} retains useful builds on every rung`,
      row.best.every((r, i) => r.winRate >= floors[i]),
      row.best.map(r => (100 * r.winRate).toFixed(1)).join('/'));
  }
}
ok('WAVE-COVERAGE nonempty sweep includes all seven species and both levels',
  waveEnvelope.length === 14 && waveEnvelope.reduce((n, r) => n + r.samples, 0) === 560000);

/* The band. A build may be meaningfully better than no talents at all (that is
   the entire point of talents) but not so far ahead that the rest of the game
   stops mattering, and never WORSE, which would make a whole tree a trap. */
// 1.85, not 2.0: measured post-cap the worst build sits at 1.70x, and the
// UNCAPPED Alchemist sat at 1.96x at ordinary stats. A 2.0 band would have let
// the exact bug this was written for slip through at every level but the cap.
const MAX_RATIO = 1.85;  // vs the no-talent baseline, offense only
const MIN_RATIO = 0.7;

console.log(`balance: ${BUILDS.length} builds x ${SEEDS} seeds (caps: chain ${BUILD_MULT_CAP}x, catalyst +${CATALYST_CAP * 100}%)\n`);
const rows = BUILDS.map(b => measure(b, { seeds: SEEDS }));
const base = rows[0];
ok('the sim produced a baseline to measure against', base && base.dpt > 0, `baseline dpt=${base?.dpt?.toFixed(1)}`);

/* STACKS ARE HELD TO THE HARD CAP, NOT THE DESIGN BAND, and they are graded
   here because until 2026-08-27 NOTHING did. MAX_RATIO is 1.85 for a single
   build, chosen so the uncapped Alchemist at 1.96x could not slip through. A
   COMBINATION is a different question: BUILD_MULT_CAP is what actually stops it,
   so that is what it is measured against.
   Measured the day this was added: alchemist + stamina reaches 2.17x against a
   cap of 2.2, which is 98.6% of it. That is a real finding, not a comfortable
   pass: there is almost no headroom, and the row exists so the next talent or
   gear set that eats the rest fails here rather than in someone's hands. */
for (const st of STACKS) {
  const m = measure(st, { seeds: SEEDS });
  const ratio = m.dpt / base.dpt;
  ok(`STACK-CEILING ${st.name} stays within the hard cap ${BUILD_MULT_CAP}x`,
    ratio <= BUILD_MULT_CAP, `${ratio.toFixed(2)}x of ${BUILD_MULT_CAP}x (${((ratio / BUILD_MULT_CAP) * 100).toFixed(0)}% of the ceiling)`);
}

for (const r of rows.slice(1)) {
  const ratio = r.dpt / base.dpt;
  ok(`CEILING ${r.name} stays under ${MAX_RATIO}x baseline damage`, ratio <= MAX_RATIO, `${ratio.toFixed(2)}x`);
  ok(`FLOOR ${r.name} is not a trap`, ratio >= MIN_RATIO, `${ratio.toFixed(2)}x`);
}

/* The one that actually scaled with progression. Measured at the stat clamp,
   which is the strongest a real player can ever be. */
const MAXED = { power: 150, marrow: 150, wind: 150, reflex: 150, hype: 150 };
const cat = BUILDS.find(b => /catalyst/i.test(b.name));
const hi = measure({ ...cat, stats: MAXED }, { seeds: SEEDS });
const hiBase = measure({ ...BUILDS[0], stats: MAXED }, { seeds: SEEDS });
const hiRatio = hi.dpt / hiBase.dpt;
ok('SCALING the Alchemist does not grow past the band at max stats', hiRatio <= MAX_RATIO, `${hiRatio.toFixed(2)}x at stat 150`);

/* CHEAT DEATH must not make a fight unloseable.
 *
 * Tom, 2026-08-08: "it cannot be a 100% winrate that's broken."
 *
 * Last Light used to revive you at 20% HP, and a sustain build then simply
 * healed back to full: measured 99% win at even stats and 95% against a foe 20%
 * STRONGER than you, i.e. the fight could not be lost. It now leaves you at 1 HP
 * and halves all healing on you for the rest of the fight: 63% / 41%.
 *
 * Note this metric only sees builds the sim's greedy policy actually plays (a
 * ramp kit like the Alchemist's never gets cast, so its win rate reads as the
 * baseline). It is trustworthy for sustain and passive builds, which is what
 * cheat death is.
 *
 * PROVE-RED (confirmed 2026-08-08): restore `v.hp = 1 + Math.round(v.d.maxHp *
 * 0.20 * healMult(v))` in dealDamage, or make healUp ignore lastlightUsed, and
 * the ceilings below fail.
 */
const SUSTAIN = ['mend', 'mercy', 'mercy', 'mercy', 'hallowed', 'soulsiphon', 'marrowlust'];
const cheatBuild = { name: 'sustain + last light', stats: BUILDS[0].stats, talents: [...SUSTAIN, 'lastlight'] };
const sustainOnly = { name: 'sustain alone', stats: BUILDS[0].stats, talents: SUSTAIN };
const cheatEven = measure(cheatBuild, { foeMult: 1.0, seeds: SEEDS });
const cheatHard = measure(cheatBuild, { foeMult: 1.2, seeds: SEEDS });
const sustEven = measure(sustainOnly, { foeMult: 1.0, seeds: SEEDS });
ok('CHEATDEATH a fight against your equal is still loseable', cheatEven.winRate <= 0.75, `${(cheatEven.winRate * 100).toFixed(0)}% at even stats`);
ok('CHEATDEATH a fight against your better is still usually lost', cheatHard.winRate <= 0.55, `${(cheatHard.winRate * 100).toFixed(0)}% vs a foe 20% stronger`);
// ...and the other way: a tier-4 capstone that changes nothing is a dead talent.
ok('CHEATDEATH it is still worth taking', cheatEven.winRate >= sustEven.winRate + 0.03,
  `${(cheatEven.winRate * 100).toFixed(0)}% with vs ${(sustEven.winRate * 100).toFixed(0)}% without`);
ok('CHEATDEATH the wound clause is wired to the shared heal path',
  /function healUp\(f, amount\)/.test(readFileSync(new URL('../js/pit.js', import.meta.url), 'utf8'))
  && !/hp = Math\.min\([a-z]+\.d\.maxHp, [a-z]+\.hp \+ /.test(
    readFileSync(new URL('../js/pit.js', import.meta.url), 'utf8').replace(/function healUp[\s\S]*?\n}/, '')),
  'no heal site bypasses healUp');

/* NO BUILD MAY BEAT A HARDER FOE ON AUTOPILOT.
 *
 * The offense band above is measured against a DUMMY, so it only sees raw
 * damage. It never caught the Crow Lord, whose flock was 1.27x on damage but
 * won 100% of fights at EVERY difficulty the game serves, because the damage
 * was free: no AP, no expiry, and it bypassed wards entirely. Tom, 2026-08-08:
 * "crow lord should not be winning 100% at every difficulty... if a build is
 * broken fix it."
 *
 * So this guards OUTCOMES against a foe stronger than you, where a broken build
 * shows up and a merely strong one does not. Measured 2026-08-08 after the fix,
 * win rate at x1.2 / x1.5: melee stack 72/7, Crow Lord 64/9, sustain 41/8,
 * stamina engine 25/3, no talents 15/2. Before the fix the Crow Lord was 96/42.
 *
 * PROVE-RED (confirmed 2026-08-08): delete the `me.flock -= 1` thinning line in
 * js/pit.js and HARDFOE names the Crow Lord at both tiers.
 */
const HARD_CEIL = 0.82;   // at a foe 20% stronger. Strongest legit build sits at 72%.
const BRUTAL_CEIL = 0.30; // at a foe 50% stronger. Strongest legit build sits at 9%.
for (const b of BUILDS.slice(1)) {
  const hard = measure(b, { foeMult: 1.2, seeds: SEEDS });
  ok(`HARDFOE ${b.name} can still lose to a foe 20% stronger`, hard.winRate <= HARD_CEIL, `${(hard.winRate * 100).toFixed(0)}%`);
}
for (const b of BUILDS.slice(1)) {
  const brutal = measure(b, { foeMult: 1.5, seeds: SEEDS });
  ok(`HARDFOE ${b.name} does not walk over a foe 50% stronger`, brutal.winRate <= BRUTAL_CEIL, `${(brutal.winRate * 100).toFixed(0)}%`);
}

/* Action economy must be PAID FOR. A gear affix or a 4-piece set handing out a
   +1 AP talent was worth +45% damage on an engine build and cost nothing. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const APP = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../js/app.js'), 'utf8');
ok('GEAR cannot grant action-economy talents',
  /ECONOMY_TALENTS\s*=\s*new Set\(\[[^\]]*'lightfeet'/.test(APP) && /!ECONOMY_TALENTS\.has\(id\)/.test(APP),
  'ECONOMY_TALENTS filter present in buildFighter');

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (!results.length) { console.log('FAIL: no checks ran'); process.exit(1); }
process.exit(failed ? 1 : 0);
