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
 * configurations: with a level-5 Hound, and with no pet at all. The hound
 * T2 baseline wins 85.8%: pet actions fire through smartPlayerTurn's call to
 * smartPetTurn before endTurn, matching app.js's body -> pet -> end sequence.
 * Sizes depend on configuration, so the copy contains no percentage.
 *
 * ROWS:
 *   COVERAGE every combat dish is claimed or explicitly registered UNCLAIMED,
 *            and every printed claim selects exactly one measured band.
 *   HALVED   loss reduction exceeds half in BOTH configurations.
 *   SMALLER  Stew beats baseline, and each big dish beats Stew directly, with
 *            a difference interval strictly above zero in BOTH configurations.
 *   PET      the trained-hound claim has an edge clear of zero with that pet;
 *            without a pet, the dish leaves the result unchanged.
 *   NOCLAIM  any explicitly unclaimed dish must still span zero in both arms.
 *            T2 Skewer is unclaimed. This path fails upward if its edge returns.
 *   CONTROL  nonempty measurements and unsaturated baselines.
 *
 * DIRECTION OF FAILURE: HALVED and PET fail when a claim loses its edge;
 * SMALLER fails when a big dish no longer clearly beats Stew; NOCLAIM fails
 * upward when an unclaimed dish gains an edge. Unknown copy fails COVERAGE.
 *
 * PURE: node only, no browser, no database, ~4s.
 *   node tests/dish-worth-audit.mjs
 */
import { measure } from './fight-sim.mjs';
import { RECIPES, DISH_WORTH, foodBuffLabel } from '../js/cooking.js';
import { buildBattlePet } from '../js/pets.js';
import { BH_ITEMS } from '../data/boneheadz.js';

const SEEDS = 2000;
const BASE = { power: 55, marrow: 55, wind: 55, reflex: 55, hype: 55 };
const HALVES = 'more than halves the fights you lose';
const SMALLER = 'less than the big dishes do';
const PET_EDGE = 'with a trained hound at your side';

/* The dishes that deliberately carry NO worth sentence, and why. Registered
   here rather than inferred from an absent key, so "nobody wrote one yet" and
   "we measured and cannot say" are different states. */
const UNCLAIMED = { 'hunters-skewer': 'T2 hound comparison: 1716 vs 1750 wins in 2000 seeds; difference interval [-0.4, 3.8]pp spans zero.' };

let fails = 0;
const ok = (m, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${m}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

// The numeric worth instrument uses a hound, whose one-turn recovery already
// allows a special every round. Guard the changed promise separately; engine
// recovery for all species is guarded by pit.test.js, including direct calls.
const skewer = RECIPES.find(r => r.id === 'hunters-skewer');
ok('SKEWER recipe promises one-turn-faster recovery', /recovers one turn sooner/.test(skewer?.desc || ''));
ok('SKEWER saved petFree buffs print the same recovery promise',
  foodBuffLabel({ kind: 'combat', petFree: true, fightsLeft: 2 }) === 'pet special recovers one turn sooner · 2 fights left');

let hound = null;
for (const it of BH_ITEMS.filter(i => i.slot === 'C' && !i.unreleased)) {
  const pet = buildBattlePet(it.id, 5, []);
  if (pet?.family === 'hound') { hound = pet; break; }
}
ok('CONTROL a level-5 hound drives the pet arm', hound?.family === 'hound' && hound.level === 5, hound?.id || 'missing');

const wilson = (k, n, z = 1.959964) => {
  const p = k / n, d = 1 + z * z / n;
  const c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - h) / d, (c + h) / d];
};
/* Newcombe's hybrid score interval for a difference of two proportions.
   Retain the audit's marginal Wilson intervals; this does not estimate the
   within-seed correlation of the two arms. */
const newcombe = (k1, n1, k2, n2) => {
  const [l1, u1] = wilson(k1, n1), [l2, u2] = wilson(k2, n2);
  const p1 = k1 / n1, p2 = k2 / n2;
  return [(p1 - p2) - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2),
    (p1 - p2) + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)];
};

/* 2026-09-07, Tom's dish-copy instruction (master handoff B5), reiterated in
   frozen Lane H RED 3: measure both a level-5 hound and no pet against a mirror.
   The with-pet and no-pet arms disagree by roughly a factor of three, which is
   exactly why the dish copy states no percentage. Both configurations stay:
   pet claims require the trained hound, with no invented benefit without it. */
const CONFIGS = [{ tag: 'hound', pet: hound }, { tag: 'no pet', pet: null }];
const COMBAT = RECIPES.filter(r => r.buff && r.buff.kind === 'combat');

/* measure once per (config, dish), reused by every row below */
const data = new Map();   // tag -> { base, byId: Map(id -> {wins, wr, lo, hi, cut}) }
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
    byId.set(r.id, { wins: k, wr: m.winRate, lo, hi, cut });
  }
  data.set(cfg.tag, { base: b.winRate, byId });
  console.log(`--  ${cfg.tag}: baseline ${(b.winRate * 100).toFixed(1)}% over ${SEEDS} seeds (${kb} wins)` +
    COMBAT.map(r => `\n      ${r.name.padEnd(22)}${(byId.get(r.id).wr * 100).toFixed(1).padStart(6)}%  ` +
      `delta [${(byId.get(r.id).lo * 100).toFixed(1)}, ${(byId.get(r.id).hi * 100).toFixed(1)}]pp  ` +
      `losses cut ${(byId.get(r.id).cut * 100).toFixed(0)}%  wins=${byId.get(r.id).wins}`).join(''));
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

for (const [id, line] of Object.entries(DISH_WORTH)) {
  const bands = [HALVES, SMALLER, PET_EDGE].filter(band => line.includes(band));
  ok(`COVERAGE ${id} selects exactly one measured claim`, COMBAT.some(r => r.id === id) && bands.length === 1,
    `bands=${bands.length}`);
}

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
const smaller = COMBAT.filter(r => (DISH_WORTH[r.id] || '').includes(SMALLER));
ok('SMALLER exactly one dish carries the weaker sentence', smaller.length === 1, smaller.map(r => r.id).join(', ') || 'none');
for (const r of smaller) {
  for (const cfg of CONFIGS) {
    const d = data.get(cfg.tag).byId.get(r.id);
    ok(`SMALLER ${r.name} cuts losses by a margin clear of zero (${cfg.tag})`, d.lo > 0,
      `delta [${(d.lo * 100).toFixed(1)}, ${(d.hi * 100).toFixed(1)}]pp`);
    // Compare big dish minus Stew, not two dish-minus-baseline intervals.
    // The old test counted the shared baseline's uncertainty twice. Retain
    // the same Newcombe interval and strict positive lower bound for each rival.
    for (const h of halvers) {
      const big = data.get(cfg.tag).byId.get(h.id);
      const [lo, hi] = newcombe(big.wins, SEEDS, d.wins, SEEDS);
      ok(`SMALLER ${r.name} is below ${h.name} (${cfg.tag})`, lo > 0,
        `big dish minus stew [${(lo * 100).toFixed(2)}, ${(hi * 100).toFixed(2)}]pp`);
    }
  }
}

/* ---- PET: claim only the configuration with a measured edge ---- */
const petClaims = COMBAT.filter(r => (DISH_WORTH[r.id] || '').includes(PET_EDGE));
ok('PET the conditional claim is actually made', petClaims.length > 0, `${petClaims.length} dishes`);
for (const r of petClaims) {
  for (const cfg of CONFIGS) {
    const d = data.get(cfg.tag).byId.get(r.id);
    if (cfg.pet) {
      ok(`PET ${r.name} cuts losses with a trained hound`, d.lo > 0,
        `delta [${(d.lo * 100).toFixed(1)}, ${(d.hi * 100).toFixed(1)}]pp`);
    } else {
      ok(`PET ${r.name} gives no benefit without a pet`, d.wr === data.get(cfg.tag).base && d.lo <= 0 && d.hi >= 0,
        `delta [${(d.lo * 100).toFixed(1)}, ${(d.hi * 100).toFixed(1)}]pp`);
    }
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
  ok(`PLAIN ${id} states no figure`, !/\d|%|percent|per cent/i.test(line), line);
}

console.log(`dish-worth: ${fails ? `${fails} FAILED` : 'all rows green'}`);
process.exit(fails ? 1 : 0);
