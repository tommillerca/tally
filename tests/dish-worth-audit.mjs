/* THE PIT SAYS WHAT A DISH IS WORTH, AND THIS KEEPS IT TRUE.
 * 2026-09-07, Tom's ruling (master handoff B5). Copy only: serving a dish still
 * pays its 8 XP and no recipe was re-costed.
 *
 * js/cooking.js DISH_WORTH is a sentence per dish, printed by the Pit's live
 * buff line and by the Kitchen's own recipe list. A sentence about a number is
 * a claim, and a claim nobody re-checks is a lie waiting for the next re-cost
 * (the Feast was re-costed once already, 2026-08-08). So this file re-measures
 * the claim rather than pinning the string.
 *
 * THE INSTRUMENT is tests/fight-sim.mjs against a MIRROR (foe at 100% of the
 * player's own stats), no talents, both arms on the same seed list, in TWO
 * configurations: with a level-5 Hound, and with no pet at all. Both, because
 * they disagree about the SIZE of every effect by roughly 3x -- a mirror with a
 * pet is already an 85% win, so that column has a ceiling at about +15pp -- and
 * a claim that only holds in the roomy column is not a claim about the game.
 *
 * ROWS:
 *   COVERAGE  every combat recipe is either claimed in DISH_WORTH or named in
 *             UNCLAIMED below with a reason. A new dish nobody thought about
 *             FAILS here rather than shipping a blank.
 *   HALVED    every dish whose copy says "more than halves the fights you lose"
 *             does exactly that, in BOTH configurations.
 *   SMALLER   Marrow Stew's weaker claim is true in both directions: it cuts
 *             losses by a margin clear of zero, and by strictly less than the
 *             smallest of the halving dishes.
 *   NOCLAIM   the two pet dishes carry no claim, and the reason is measured,
 *             not assumed: their delta spans zero in this harness. That is the
 *             harness declining to answer (js/pit.js smartPlayerTurn, which is
 *             what fight-sim drives, never takes a PET action, so the Skewer's
 *             whole effect can never fire), which is precisely why nothing is
 *             printed for them. If a future harness DOES drive the pet and one
 *             of them measures a real edge, this row goes red and the copy gets
 *             written then.
 *   CONTROL   the sample is real: both baselines sit strictly between 0 and 1,
 *             so no row above is riding a saturated arm.
 *
 * DIRECTION OF FAILURE (anti-regression rule 11): HALVED fails when a dish gets
 * WEAKER than its sentence; NOCLAIM fails when an unclaimed dish gets STRONGER
 * than "we cannot tell". Both directions are wired.
 *
 * PROVE-RED, three ways on a throwaway copy of this tree, 2026-09-07, each exit 1:
 *   (a) 'marrow-stew' moved to the halving sentence -> 3 red
 *     FAIL HALVED Marrow Stew more than halves the fights you lose (hound)  15.3% -> 8.5% (cut 44%, needs >50%)
 *     FAIL HALVED Marrow Stew more than halves the fights you lose (no pet)  62.7% -> 44.6% (cut 29%, needs >50%)
 *     FAIL SMALLER exactly one dish carries the weaker sentence  none
 *   (b) 'hunters-skewer' given the halving sentence -> 6 red
 *     FAIL NOCLAIM Hunter's Skewer carries no claim ...  claim printed: Measured: ...
 *     FAIL HALVED Hunter's Skewer more than halves the fights you lose (hound)  15.3% -> 15.3% (cut 0%)
 *     FAIL COVERAGE nothing is both claimed and registered unclaimed  both: hunters-skewer
 *   (c) 'bone-broth' deleted from DISH_WORTH -> 1 red
 *     FAIL COVERAGE every combat dish is claimed or registered unclaimed  unhandled: bone-broth
 *
 * PURE: node only, no browser, no database, ~4s.
 *   node tests/dish-worth-audit.mjs
 */
import { measure } from './fight-sim.mjs';
import { RECIPES, DISH_WORTH } from '../js/cooking.js';
import { buildBattlePet } from '../js/pets.js';
import { BH_ITEMS } from '../data/boneheadz.js';

const SEEDS = 2000;
const BASE = { power: 55, marrow: 55, wind: 55, reflex: 55, hype: 55 };
const HALVES = 'more than halves the fights you lose';

/* The dishes that deliberately carry NO worth sentence, and why. Registered
   here rather than inferred from an absent key, so "nobody wrote one yet" and
   "we measured and cannot say" are different states. */
const UNCLAIMED = {
  'hunters-skewer': "the pet's special ignoring its cooldown: smartPlayerTurn never takes a pet action, so the effect cannot fire in this harness",
  'bonemeal-kibble': 'pet HP and pet damage: the same harness limit, only the pet passive is reachable',
};

let fails = 0;
const ok = (m, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${m}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

let hound = null;
for (const it of BH_ITEMS.filter(i => i.slot === 'C' && !i.unreleased)) { hound = buildBattlePet(it.id, 5, []); if (hound) break; }

const wilson = (k, n, z = 1.959964) => {
  const p = k / n, d = 1 + z * z / n;
  const c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - h) / d, (c + h) / d];
};
/* Newcombe's hybrid score interval for a difference of two proportions. Both
   arms share a seed list, so treating them as independent makes this WIDER than
   the truth, which is the safe direction for a sentence printed on a screen. */
const newcombe = (k1, n1, k2, n2) => {
  const [l1, u1] = wilson(k1, n1), [l2, u2] = wilson(k2, n2);
  const p1 = k1 / n1, p2 = k2 / n2;
  return [(p1 - p2) - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2),
    (p1 - p2) + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)];
};

/* TWO CONFIGURATIONS, and both are load-bearing. Tom's ruling, 2026-09-07
   (master handoff B5): "Never print a fabricated or over-precise figure ... a
   dish whose measured effect spans zero must not claim an edge." Measured here
   the same day: a mirror WITH a pet is already an 84.7% win, so every dish
   saturates near +15pp there, while with NO pet the baseline is 37.4% and the
   same dishes spread from +18pp to +60pp. One column alone would let a claim
   ride a ceiling (or a floor); requiring both is what makes the sentence a fact
   about the game rather than about a harness setting. */
const CONFIGS = [{ tag: 'hound', pet: hound }, { tag: 'no pet', pet: null }];
const COMBAT = RECIPES.filter(r => r.buff && r.buff.kind === 'combat');

/* measure once per (config, dish), reused by every row below */
const data = new Map();   // tag -> { base, byId: Map(id -> {wr, lo, hi, cut}) }
for (const cfg of CONFIGS) {
  const b = measure({ name: 'no dish', stats: BASE, talents: [], pet: cfg.pet }, { foeMult: 1.0, seeds: SEEDS });
  const kb = Math.round(b.winRate * SEEDS);
  const byId = new Map();
  for (const r of COMBAT) {
    const m = measure({ name: r.name, stats: BASE, talents: [], pet: cfg.pet, food: r.buff }, { foeMult: 1.0, seeds: SEEDS });
    const k = Math.round(m.winRate * SEEDS);
    const [lo, hi] = newcombe(k, SEEDS, kb, SEEDS);
    // "the fights you lose", cut as a share of the baseline's losses
    const cut = (b.winRate === 1) ? 0 : ((1 - b.winRate) - (1 - m.winRate)) / (1 - b.winRate);
    byId.set(r.id, { wr: m.winRate, lo, hi, cut });
  }
  data.set(cfg.tag, { base: b.winRate, byId });
  console.log(`--  ${cfg.tag}: baseline ${(b.winRate * 100).toFixed(1)}% over ${SEEDS} seeds` +
    COMBAT.map(r => `\n      ${r.name.padEnd(22)}${(byId.get(r.id).wr * 100).toFixed(1).padStart(6)}%  ` +
      `delta [${(byId.get(r.id).lo * 100).toFixed(1)}, ${(byId.get(r.id).hi * 100).toFixed(1)}]pp  ` +
      `losses cut ${(byId.get(r.id).cut * 100).toFixed(0)}%`).join(''));
}

/* ---- CONTROL: nothing below is riding a saturated arm ---- */
for (const cfg of CONFIGS) {
  const b = data.get(cfg.tag).base;
  ok(`CONTROL the ${cfg.tag} baseline is a real fight, not a foregone one`, b > 0.02 && b < 0.98, `baseline=${(b * 100).toFixed(1)}%`);
}
ok('CONTROL every combat dish was measured', COMBAT.length > 0 && CONFIGS.every(c => data.get(c.tag).byId.size === COMBAT.length),
  `${COMBAT.length} dishes x ${CONFIGS.length} configs`);

/* ---- COVERAGE ---- */
const unhandled = COMBAT.filter(r => !DISH_WORTH[r.id] && !UNCLAIMED[r.id]).map(r => r.id);
const stale = Object.keys(UNCLAIMED).filter(id => DISH_WORTH[id]);
ok('COVERAGE every combat dish is claimed or registered unclaimed', unhandled.length === 0, `unhandled: ${unhandled.join(', ') || 'none'}`);
ok('COVERAGE nothing is both claimed and registered unclaimed', stale.length === 0, `both: ${stale.join(', ') || 'none'}`);

/* ---- HALVED ---- */
const halvers = COMBAT.filter(r => (DISH_WORTH[r.id] || '').includes(HALVES));
ok('HALVED the halving claim is actually made by some dish', halvers.length > 0, `${halvers.length} dishes`);
for (const r of halvers) {
  for (const cfg of CONFIGS) {
    const d = data.get(cfg.tag).byId.get(r.id);
    ok(`HALVED ${r.name} more than halves the fights you lose (${cfg.tag})`, d.cut > 0.5,
      `${((1 - data.get(cfg.tag).base) * 100).toFixed(1)}% -> ${((1 - d.wr) * 100).toFixed(1)}% (cut ${(d.cut * 100).toFixed(0)}%, needs >50%)`);
  }
}

/* ---- SMALLER: the one dish with the weaker sentence ---- */
const smaller = COMBAT.filter(r => DISH_WORTH[r.id] && !(DISH_WORTH[r.id]).includes(HALVES));
ok('SMALLER exactly one dish carries the weaker sentence', smaller.length === 1, smaller.map(r => r.id).join(', ') || 'none');
for (const r of smaller) {
  for (const cfg of CONFIGS) {
    const d = data.get(cfg.tag).byId.get(r.id);
    const weakest = Math.min(...halvers.map(h => data.get(cfg.tag).byId.get(h.id).lo));
    ok(`SMALLER ${r.name} cuts losses by a margin clear of zero (${cfg.tag})`, d.lo > 0,
      `delta [${(d.lo * 100).toFixed(1)}, ${(d.hi * 100).toFixed(1)}]pp`);
    ok(`SMALLER ${r.name} is below the big dishes (${cfg.tag})`, d.hi < weakest,
      `its upper ${(d.hi * 100).toFixed(1)}pp vs the weakest big dish's lower ${(weakest * 100).toFixed(1)}pp`);
  }
}

/* ---- NOCLAIM ---- */
for (const [id, why] of Object.entries(UNCLAIMED)) {
  const r = COMBAT.find(x => x.id === id);
  ok(`NOCLAIM ${id} is still a combat dish`, !!r, r ? '' : 'gone from RECIPES: retire the row');
  if (!r) continue;
  ok(`NOCLAIM ${r.name} carries no claim (${why.slice(0, 40)}...)`, !DISH_WORTH[id], `claim printed: ${DISH_WORTH[id] || 'none'}`);
  for (const cfg of CONFIGS) {
    const d = data.get(cfg.tag).byId.get(id);
    ok(`NOCLAIM ${r.name} still measures no edge this harness can see (${cfg.tag})`, d.lo <= 0 && d.hi >= 0,
      `delta [${(d.lo * 100).toFixed(1)}, ${(d.hi * 100).toFixed(1)}]pp: if this no longer spans zero, write the sentence`);
  }
}

/* ---- the copy itself never carries a number ---- */
for (const [id, line] of Object.entries(DISH_WORTH)) {
  ok(`PLAIN ${id} states no figure`, !/\d/.test(line), line);
}

console.log(`dish-worth: ${fails ? `${fails} FAILED` : 'all rows green'}`);
process.exit(fails ? 1 : 0);
