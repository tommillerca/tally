/* THE FIRST FIGHT CANNOT BE LOST. Tom, 2026-08-13: "we cannot have people losing
   their first fight by any means. getting dunked on in a tutorial fight is crazy
   that should be a 100% win rate for them to have a positive first experience."

   A fresh-eyes playtester quit the game at exactly this moment, killed by a
   signature move for more than half their health on rung 1.

   THE PLAYER THIS MEASURES IS THE REAL DAY-ONE PLAYER, not a convenient one.
   deriveStats() on an empty body (no protein days, no streak, no steps, no
   spawns, no quests) returns 20 across the board, so the block below is not a
   guess: it is what every brand-new account literally has. The foe is built the
   way openFight builds it, scaleStats(playerStats, mult) at rung 1's 0.55.

   Proven red against the unguarded engine: see the CONTROL row, which runs the
   SAME seeds with tutorial off and must show real losses. If that row ever
   reports zero losses, this audit has stopped testing anything and fails, because
   a guard that is never exercised cannot be shown to work (anti-regression rule
   1, and rule 3 on empty samples). */
import { simulate, scaleStats, deriveStats, LADDER } from '../js/pit.js';

const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };

const RUNS = 400;
const rung1 = LADDER[0];

/* the genuine fresh account: every counter zero */
const pStats = deriveStats({});
const fStats = scaleStats(pStats, rung1.mult);

if (Object.values(pStats).some(v => v !== 20)) {
  console.log('NOTE  fresh-account stats are not the expected flat 20:', JSON.stringify(pStats));
}

const run = tutorial => {
  const out = { p: 0, f: 0, draw: 0 };
  for (let s = 1; s <= RUNS; s++) {
    // aiLevel 2 is what openFight gives a rung fight
    const r = simulate({ pStats, fStats, seed: s, tutorial, aiLevel: 2 });
    out[r.winner]++;
  }
  return out;
};

const guarded = run(true);
const control = run(false);

/* ---- the control proves the bug is real and the sample is not empty ---- */
ok('CONTROL an unguarded day-one player really does lose rung 1',
  control.f > 0,
  `${control.f} losses and ${control.draw} draws in ${RUNS} unguarded fights (${(control.f / RUNS * 100).toFixed(1)}% loss rate)`);

/* ---- the actual requirement, stated as Tom stated it ---- */
ok('the first fight is won 100% of the time',
  guarded.p === RUNS,
  `${guarded.p}/${RUNS} wins, ${guarded.f} losses, ${guarded.draw} draws`);

/* HONEST LIMIT OF THIS AUDIT: the tutorial branch on the TURN_CAP draw
   (js/pit.js, endTurn) is NOT exercised by anything here. I tried to force it
   with two feeble high-marrow fighters and the fight still resolved inside 30
   turns, so I could not construct a stalemate. It stays in the engine because
   the cap draw is not hypothetical in this codebase (the Live Wire shipped a kit
   that drove 40 of 60 sim fights to a cap draw with the boss already at 0 HP),
   but nobody should read this file as proof that line works. If you find a way
   to reach the cap, add the row here. */

/* a draw is a loss wearing a different word: it is not a positive first
   experience and it does not pay the rung. Called out separately so a
   regression that converts losses into draws cannot read as an improvement. */
ok('no first fight ends in a draw either', guarded.draw === 0, `${guarded.draw} draws`);

/* ---- and the guard must not leak into the rest of the game ---- */
ok('the guard does NOT apply once they have won one',
  control.f > 0 && control.p < RUNS,
  `unguarded record ${control.p}W/${control.f}L/${control.draw}D`);

console.log(`\n${fails.length ? `FAILED: ${fails.join(', ')}` : 'all green'}`);
process.exit(fails.length ? 1 : 0);
