/* tests/xp-curve-audit.mjs — A GAUNTLET RANK MUST NOT PAY A BIGGER SHARE OF A
 * LEVEL THE HIGHER YOU CLIMB.
 *
 * WHY IT EXISTS. ROADMAP, "Levelling rate: reshape the GAUNTLET XP CURVE":
 * levelling is too fast, and the fix is the CURVE, explicitly not a cap on boss
 * XP and explicitly not a cap on levels. Measured on origin/main at 0b8680f5,
 * one Gauntlet rank paid 35% of a level at rank 1, 62% at rank 10, 74% at rank
 * 50 and 81% at rank 80: three cleared ranks per level early, one per level by
 * rank 41. That climb is the bug. It came from the payouts being LINEAR in rank
 * (`60 + rank * 10` and friends) while the level cost in js/game.js grows as
 * (L-1)^1.55, whose per-level step grows only as L^0.55.
 *
 * WHAT EACH NUMBER IS A MEASUREMENT OF, because that is the thing this repo
 * gets wrong: SHARE is one FIRST CLEAR of one rank, divided by the XP the level
 * you are standing in costs, on a player whose ONLY XP source is the Gauntlet
 * and who clears every rank on the first attempt. It is not fights, not days
 * and not a whole player's levelling: XP is paid on first clear only (js/app.js,
 * `award('endless-<rank>')`), so attempts do not enter it, and every other XP
 * source in the game (logging, quests, steps, dens, the daily fight cap) is
 * outside this file and outside both sims. It is the SHAPE of the Gauntlet's
 * own contribution and nothing else.
 *
 * The instrument is tests/gauntlet-sim.mjs, which prints per-rank XP beside the
 * win rates. This file is the guard that stops the shape drifting back.
 *
 * PROVEN RED. CONTROL below rebuilds the pre-fix linear payouts and requires
 * SHAPE to fail on them; a green SHAPE beside a green CONTROL is an audit
 * grading nothing. Also driven red for real on 2026-08-23 in a cp -R throwaway
 * of this tree with js/pit.js reverted to origin/main: SHAPE FAIL, exit 1, late
 * 1.052 > early 0.693, and the run's own footer printed the bug in full: r1 35%
 * r10 62% r20 61% r50 74% r80 81% r120 91%. The remaining five rows stayed
 * green there on purpose, including FIRST-HOUR at exactly its 774 floor: this
 * file guards the SHAPE, and only the shape row may go red on main.
 */
import { endlessFoe, endlessCeiling } from '../js/pit.js';
import { levelFor } from '../js/game.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const MAX = 120;
const kindOf = f => f.glutton ? 'glutton' : f.mage ? 'mage' : f.wanderer ? 'wanderer' : f.mimic ? 'mimic' : 'ordinary';

/* Walk the ladder banking first-clear XP, and record what share of the level you
   are standing in each rank paid. `xpAt` is a seam so CONTROL can walk the same
   ladder with the old payouts. */
function walk(xpAt) {
  const rows = []; let cum = 0;
  for (let r = 1; r <= MAX; r++) {
    const f = endlessFoe(r), xp = xpAt(r, f);
    cum += xp;
    const lv = levelFor(cum);
    rows.push({ r, kind: kindOf(f), xp, cum, level: lv.level, share: xp / lv.need });
  }
  return rows;
}
const shipped = walk((r, f) => f.xp);
const band = (rows, lo, hi) => Math.max(...rows.filter(x => x.r >= lo && x.r <= hi).map(x => x.share));

/* SHAPE. Early is ranks 1-15 (it contains one of every boss kind, so the bands
   are comparable), late is 30-120. The bound is "no higher than early", not a
   pinned number, so retuning a base or a slope does not falsely go red. */
const early = band(shipped, 1, 15), late = band(shipped, 30, 120);
ok('SHAPE a late rank never pays a bigger share of a level than an early one',
  late <= early, `late(30-120) ${late.toFixed(3)} vs early(1-15) ${early.toFixed(3)}`);

/* CONTROL. The same walk with the pre-fix LINEAR payouts read off origin/main's
   endlessFoe. If this does not go red, SHAPE cannot see the bug it exists for. */
const LINEAR = { glutton: [140, 14], mage: [110, 12], wanderer: [180, 16], mimic: [70, 10], ordinary: [60, 10] };
const ctl = walk((r, f) => { const [b, s] = LINEAR[kindOf(f)]; return b + r * s; });
const cLate = band(ctl, 30, 120), cEarly = band(ctl, 1, 15);
ok('CONTROL the pre-fix linear curve fails SHAPE',
  cLate > cEarly, `linear late ${cLate.toFixed(3)} vs early ${cEarly.toFixed(3)}`);

/* FIRST HOUR. endlessCeiling(0) is the highest rank a player with no world-boss
   den win may take, so ranks 1..that ARE the new player's whole Gauntlet. 774 is
   the measured cumulative first-clear XP over that span on origin/main at
   0b8680f5. Flattening the tail must never come out of the opening. */
const openRanks = endlessCeiling(0);
const opening = shipped[openRanks - 1].cum;
ok('FIRST-HOUR the pre-den span pays at least what it paid on main',
  opening >= 774, `ranks 1-${openRanks}: ${opening} xp, level ${shipped[openRanks - 1].level} (main: 774, level 3)`);

/* MONOTONE. Levels are uncapped and so is the ladder: within a kind, climbing
   must never pay less than the rank below. Ranks 1-200 because the compression
   is a power curve and a rounding-down step would show up out here first. */
const last = {}; const inversions = [];
for (let r = 1; r <= 200; r++) {
  const f = endlessFoe(r), k = kindOf(f);
  if (last[k] !== undefined && f.xp < last[k]) inversions.push(`${k} rank ${r}: ${f.xp} < ${last[k]}`);
  last[k] = f.xp;
}
ok('MONOTONE within a kind, XP never falls as you climb', inversions.length === 0, inversions.slice(0, 3).join('; '));

/* BOSS PREMIUM. The decision refused a cap on boss XP by name. Every drawn boss
   must still out-pay the ordinary rung it displaces. Graded against the richest
   ordinary rung at or below its rank, taken from endlessFoe itself rather than
   from the payout formula: a guard that recomputes the constants it is guarding
   grades its own copy, and it must also survive the formula being reshaped
   again. */
const stingy = []; let bestOrd = 0;
for (let r = 1; r <= 200; r++) {
  const f = endlessFoe(r), k = kindOf(f);
  if (k === 'ordinary') { bestOrd = Math.max(bestOrd, f.xp); continue; }
  if (f.xp <= bestOrd) stingy.push(`${k} rank ${r}: ${f.xp} <= ordinary ${bestOrd}`);
}
ok('BOSS-PREMIUM a drawn boss always out-pays an ordinary rung at its own rank',
  stingy.length === 0, stingy.slice(0, 3).join('; '));

/* SAMPLE, so none of the rows above can pass on an empty ladder. */
ok('SAMPLE the ladder yielded ranks of every kind',
  new Set(shipped.map(x => x.kind)).size === 5 && shipped.length === MAX,
  `${shipped.length} ranks, kinds: ${[...new Set(shipped.map(x => x.kind))].join(',')}`);

console.log(`\nshare of a level per rank: ${[1, 10, 20, 50, 80, 120].map(r => `r${r} ${(shipped[r - 1].share * 100).toFixed(0)}%`).join('  ')}`);
console.log(`${fails.length ? 'FAILED: ' + fails.join(', ') : 'all green'}`);
process.exit(fails.length ? 1 : 0);
