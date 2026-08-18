/* GAUNTLET XP CURVE OPTIONS. A MODEL FOR A DECISION, NOT A GUARD.
 *
 * It asserts nothing about the app and it changes no game code. It exists so
 * the choice of curve gets made on measured numbers instead of a feel.
 *
 * THE PROBLEM IT IS COSTING. Tom, 2026-08-18: he levelled three times off four
 * Gauntlet first-clears. Gauntlet XP is LINEAR in rank forever (60 + 10r, with
 * premium rungs for the Live Wire and the Glutton) while xpForLevel grows
 * SUBLINEARLY, so the number of fights a level costs falls the whole way up the
 * ladder. Underneath that, scaleStats clamps a foe to 100 per stat while
 * allocatedStats clamps a player to 150, so above roughly stat 80 every rank
 * from 10 to 100 serves the identical statline while the reward grows 5.5x.
 * The reward curve and the difficulty curve are separate decisions; this file
 * only costs the reward curve.
 *
 * SWITCHING CURVES IS ONE LINE: change CURVE below. Each candidate is a pure
 * function of (rank, kind). The one-line change in the shipped game would be in
 * endlessFoe (js/pit.js), which today writes the three formulas inline:
 *     xp: 60 + rank * 10        ordinary rung
 *     xp: 110 + rank * 12       Live Wire, every 7th
 *     xp: 140 + rank * 14       Glutton, every 10th
 * Replacing those three literals with one call to the chosen CURVES entry is
 * the whole edit. NOTHING HERE IS SHIPPED. Tom picks the shape.
 *
 * Usage:  node tests/xp-curve-model.mjs
 */
import { xpForLevel, levelFor } from '../js/game.js';
import { isGluttonRung, isMageRung } from '../js/pit.js';

/* ---- which curve this run reports as "active". The table covers all of them
   regardless; this only marks one. ---- */
const CURVE = 'shipped';

/* Rung kind, exactly as endlessFoe decides it: the Glutton's every-10th wins
   over the Live Wire's every-7th. */
const kindOf = r => isGluttonRung(r) ? 'glutton' : isMageRung(r) ? 'mage' : 'ordinary';

/* PREMIUM RUNGS. Shipped hard-codes a separate formula per kind, and its
   implied premium over the ordinary rung DRIFTS with rank: the Live Wire pays
   1.44x an ordinary rung at rank 10 but 1.24x at rank 100, the Glutton 1.75x
   falling to 1.45x. The three alternatives use a FIXED premium instead, set at
   the middle of that measured drift, so the only thing changing between rows is
   the curve rather than the curve and the premium at once. */
const PREMIUM = { ordinary: 1, mage: 1.3, glutton: 1.5 };
const withPremium = (base, kind) => Math.round(base * PREMIUM[kind]);

const CURVES = {
  // exactly what ships today, all three literals
  shipped: (r, kind) =>
    kind === 'glutton' ? 140 + r * 14
    : kind === 'mage' ? 110 + r * 12
    : 60 + r * 10,
  // sublinear: pays forever but the slope keeps falling
  sqrt: (r, kind) => withPremium(60 + 40 * Math.sqrt(r), kind),
  // linear until it stops: identical to shipped up to the cap, flat after
  hardcap: (r, kind) => Math.min(CURVES.shipped(r, kind), 300),
  // shipped up to rank 20, then 65% off: a kink, not a ceiling
  shaved: (r, kind) => r <= 20 ? CURVES.shipped(r, kind) : Math.round(CURVES.shipped(r, kind) * 0.35),
};
const NAMES = { shipped: 'shipped  60+10r', sqrt: 'sqrt  60+40*sqrt(r)', hardcap: 'hard cap  min(.,300)', shaved: 'shaved  -65% past r20' };

/* THE CLIMBER. Every Gauntlet rank is a ONE-TIME first clear (app.js keys it
   `endless-<rank>`, so award() dedupes it forever), which makes a climber's
   lifetime Gauntlet XP exactly the cumulative sum of the curve. Prior is the
   fixed 540 from clearing the eight-rung ladder and the Champion once, which is
   what unlocks the Gauntlet at all.
   OTHER is XP from the rest of the game earned between one first clear and the
   next. It is a KNOB, not a measurement, because nobody knows how many days a
   player spends per rank. 0 is the pessimistic bracket (an under-levelled
   climber, so levels are cheap and fights-per-level reads LOW); 690 is one
   maximal non-Gauntlet day per rank, per the sizing note above XP_DAILY_CAP.
   Both are printed. The comparison between curves is the point, and it holds
   either way. */
const PRIOR = 40 + 40 + 45 + 50 + 55 + 60 + 70 + 80 + 100;
const xpAt = (curve, r) => CURVES[curve](r, kindOf(r));
function climberXp(curve, rank, other) {
  let x = PRIOR;
  for (let r = 1; r < rank; r++) x += xpAt(curve, r) + other;
  return x;
}
/* Levels crossed by four consecutive first-clears starting at `rank`, from the
   level a climber is at when they arrive there. This is Tom's actual report:
   four clears, three levels. */
function fourClears(curve, rank, other) {
  const start = climberXp(curve, rank, other);
  let x = start;
  for (let r = rank; r < rank + 4; r++) x += xpAt(curve, r);
  return { from: levelFor(start).level, to: levelFor(x).level, gained: levelFor(x).level - levelFor(start).level, xp: x - start };
}
/* Fights per level AT this rank: how many clears paying this rank's XP it takes
   to cross a WHOLE level at the level the climber is standing on.
   L.need, not (L.need - L.into): the remaining XP in a partial level is phase
   noise, it depends only on where the last award happened to land, and reading
   it as a rate produced a nonsense column (5.14, 0.91, 1.19, 0.15) that jumped
   around inside a single curve. The level's full width is the rate. */
function fightsPerLevel(curve, rank, other) {
  return levelFor(climberXp(curve, rank, other)).need / xpAt(curve, rank);
}

const RANKS = [1, 10, 20, 50, 80, 100];
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

console.log(`GAUNTLET XP CURVE OPTIONS   (active constant CURVE = '${CURVE}')`);
console.log(`level curve: xpForLevel(L) = round((120*(L-1)^1.55 + 80*(L-1))/10)*10   L2=${xpForLevel(2)} L10=${xpForLevel(10)} L40=${xpForLevel(40)}`);
console.log(`\nRung kinds at the sampled ranks: ${RANKS.map(r => `r${r}=${kindOf(r)}`).join('  ')}`);
console.log('Every sampled rank but 1 is a multiple of 10, so it is a GLUTTON rung. Both views below.');

for (const view of ['actual', 'ordinary']) {
  console.log(`\n=== XP PER FIRST CLEAR (${view === 'actual' ? 'the rung actually standing at that rank' : 'the ordinary-rung formula, so the curve shape is visible'}) ===`);
  console.log(pad('curve', 22) + RANKS.map(r => rpad('r' + r, 8)).join(''));
  console.log('-'.repeat(22 + RANKS.length * 8));
  for (const c of Object.keys(CURVES)) {
    console.log(pad(NAMES[c], 22) + RANKS.map(r => rpad(view === 'actual' ? xpAt(c, r) : CURVES[c](r, 'ordinary'), 8)).join(''));
  }
}

for (const other of [0, 690]) {
  console.log(`\n\n########  OTHER (non-Gauntlet XP per rank) = ${other}  ########`);
  console.log('\n=== FIGHTS PER LEVEL at that rank  (the number Tom wants roughly CONSTANT) ===');
  console.log(pad('curve', 22) + RANKS.map(r => rpad('r' + r, 8)).join('') + '   r1->r100');
  console.log('-'.repeat(22 + RANKS.length * 8 + 12));
  for (const c of Object.keys(CURVES)) {
    const v = RANKS.map(r => fightsPerLevel(c, r, other));
    console.log(pad(NAMES[c], 22) + v.map(x => rpad(x.toFixed(2), 8)).join('') + `   ${(v[0]).toFixed(2)} -> ${(v[v.length - 1]).toFixed(2)}`);
  }

  console.log('\n=== LEVELS CROSSED BY 4 CONSECUTIVE FIRST-CLEARS from that rank ===');
  console.log('(Tom measured 3 levels off 4 clears. "L a->b (+n)")');
  console.log(pad('curve', 22) + RANKS.map(r => rpad('r' + r, 14)).join(''));
  console.log('-'.repeat(22 + RANKS.length * 14));
  for (const c of Object.keys(CURVES)) {
    console.log(pad(NAMES[c], 22) + RANKS.map(r => {
      const f = fourClears(c, r, other);
      return rpad(`${f.from}->${f.to} (+${f.gained})`, 14);
    }).join(''));
  }
}

/* ================================================================
   THE FIFTH OPTION: LEAVE THE CURVE ALONE, CAP THE DAY INSTEAD.
   ================================================================
 * Today only the flat +10 "Pit win" routes through awardCapped (app.js:16764,
 * XP_DAILY_CAP.fight = 12). Every boss payout uses plain award(): pitrung,
 * pitchamp, endless, bossday, roamboss, secret, glutton. award() dedupes on the
 * key but has no ceiling at all, which is why 40 den kills measured 2520 XP
 * with only 120 of it capped.
 *
 * THE MECHANISM DOES NOT DO WHAT THE NAME SUGGESTS. awardCapped's `cap` is a
 * COUNT OF AWARDS, not an XP budget: it walks keys `${prefix}-${date}-${n}` for
 * n up to cap and pays the full `xp` for each slot it claims. Every existing
 * cap is on a FIXED-VALUE action (fight +10, garden +6, cook +8, siege +12), so
 * count and budget were the same thing. Boss XP is not fixed, it is 70 at rank
 * 1 and 1540 at rank 100. So a `XP_DAILY_CAP.boss = N` cannot land on a target
 * daily number: the same N pays 22x more to a rank-100 climber than to a rank-1
 * one. Both are modelled below. */
const REST_OF_GAME = 690;   // the sizing note above XP_DAILY_CAP: everything non-repeatable, maximal day
const INTENT = 990;         // "about 990 XP on a maximal day"
const BOSS_BUDGET = INTENT - REST_OF_GAME;

console.log('\n\n================ OPTION 5: cap the day, not the curve ================');
console.log(`stated intent ~${INTENT}/day; the rest of the game tops out at ${REST_OF_GAME}, so boss XP has ${BOSS_BUDGET} to spend`);

console.log('\n--- 5a. XP_DAILY_CAP.boss as a COUNT (what awardCapped actually does today) ---');
console.log('   N = boss clears paid per day. Shows the resulting daily boss XP for four first-clears at that rank.');
console.log(pad('rank', 8) + pad('xp/clear', 10) + [1, 2, 3, 4].map(n => rpad('N=' + n, 9)).join('') + '   verdict vs ' + BOSS_BUDGET);
console.log('-'.repeat(70));
for (const r of RANKS) {
  const per = xpAt('shipped', r);
  const row = [1, 2, 3, 4].map(n => Math.min(n, 4) * per);
  const n1 = row[0];
  console.log(pad('r' + r, 8) + pad(per, 10) + row.map(v => rpad(v, 9)).join('') +
    `   ${n1 > BOSS_BUDGET ? `N=1 ALREADY ${(n1 / BOSS_BUDGET).toFixed(1)}x over` : 'N=' + (row.filter(v => v <= BOSS_BUDGET).length) + ' fits'}`);
}
console.log('\n  A single count N cannot serve both ends of the ladder: the N that keeps a');
console.log('  rank-100 climber near the intent pays a rank-1 player almost nothing, and');
console.log('  the N that is generous at rank 1 is 3x to 6x over the intent at rank 50+.');

console.log('\n--- 5b. an XP BUDGET cap (a NEW mechanism: clamp the sum, not the count) ---');
console.log(`   Budget ${BOSS_BUDGET}/day lands the maximal day on ~${INTENT}. What four first-clears at that rank actually pay:`);
console.log(pad('rank', 8) + pad('xp/clear', 10) + pad('uncapped 4', 12) + pad('paid', 8) + pad('clawed back', 13) + 'what the player sees');
console.log('-'.repeat(96));
for (const r of RANKS) {
  const per = xpAt('shipped', r);
  const uncapped = per * 4;
  const paid = Math.min(uncapped, BOSS_BUDGET);
  let seen;
  if (per >= BOSS_BUDGET) seen = 'clear 1 truncated, clears 2-4 pay NOTHING';
  else {
    const full = Math.floor(BOSS_BUDGET / per);
    seen = full >= 4 ? 'all four pay in full' : `${full} pay in full, then a stub, then nothing`;
  }
  console.log(pad('r' + r, 8) + pad(per, 10) + pad(uncapped, 12) + pad(paid, 8) + pad(uncapped - paid, 13) + seen);
}

console.log(`
  WHAT IT COSTS. From about rank ${(() => { let r = 1; while (xpAt('shipped', r) < BOSS_BUDGET && r < 500) r++; return r; })()} on, ONE first clear spends the whole day's
  budget, so the second boss of the day pays zero and the fourth pays zero. A
  first clear is meant to be a milestone: a named boss, beaten once, ever. This
  option keeps the milestone's SIZE intact and deletes it for everyone who
  fought earlier that day, which is the reverse of what a milestone is. It also
  punishes the session shape the game otherwise rewards, a long climb in one
  sitting, and it is invisible until it bites: the player is not told the fight
  they are walking into will pay nothing.
  It is also NOT a one-line change. awardCapped counts slots; an XP ceiling has
  to sum today's rows for the type and clamp, which is new code on the payout
  path plus a new field on XP_DAILY_CAP.`);

console.log('\nNOTHING IN THIS FILE IS SHIPPED. It models four curves and one cap; the choice is Tom\'s.');
