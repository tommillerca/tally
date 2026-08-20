/* THROWAWAY DIAGNOSTIC: where does "4 pit bosses = 3 levels" actually reproduce?
   Real xpForLevel/levelFor and real endlessFoe XP. */
import { xpForLevel, levelFor, XP_DAILY_CAP } from '../js/game.js';
import { endlessFoe, endlessCeiling } from '../js/pit.js';

const pad = (s, n) => String(s).padEnd(n);

/* four CONSECUTIVE first-clears from rank R, which is exactly how the Gauntlet
   advances (nextRank = endlessBeaten + 1), plus the capped +10 fight XP each. */
function fourFrom(R) {
  let xp = 0;
  for (let r = R; r < R + 4; r++) xp += endlessFoe(r).xp + 10;
  return xp;
}

const RANKS = [1, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 100];
const LEVELS = [3, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50];

console.log('LEVELS CROSSED BY 4 CONSECUTIVE GAUNTLET FIRST-CLEARS (from the level floor)');
console.log(pad('start rank', 12) + pad('4-fight XP', 12) + pad('dens needed', 13) + LEVELS.map(l => pad('L' + l, 5)).join(''));
for (const R of RANKS) {
  const xp = fourFrom(R);
  const dens = Math.ceil((R + 3 - 7) / 3);
  const row = LEVELS.map(L => pad(levelFor(xpForLevel(L) + xp).level - L, 5));
  console.log(pad(R, 12) + pad(xp, 12) + pad(Math.max(0, dens), 13) + row.join(''));
}

console.log('\nSAME, starting 1 XP short of the next level (best case for the player)');
console.log(pad('start rank', 12) + pad('4-fight XP', 12) + LEVELS.map(l => pad('L' + l, 5)).join(''));
for (const R of RANKS) {
  const xp = fourFrom(R);
  const row = LEVELS.map(L => pad(levelFor(xpForLevel(L + 1) - 1 + xp).level - L, 5));
  console.log(pad(R, 12) + pad(xp, 12) + row.join(''));
}

console.log('\nTHE RATIO THAT DRIVES IT: one Gauntlet clear vs the level band it lands in');
console.log(pad('rank', 8) + pad('rank XP', 10) + pad('level', 8) + pad('band', 8) + 'fights per level');
for (const [R, L] of [[1,3],[5,5],[10,8],[20,12],[30,15],[40,20],[50,25],[60,30],[80,35],[100,40]]) {
  const x = endlessFoe(R).xp + 10;
  const band = xpForLevel(L + 1) - xpForLevel(L);
  console.log(pad(R, 8) + pad(x, 10) + pad(L, 8) + pad(band, 8) + (band / x).toFixed(2));
}

console.log('\nWHAT THE GAUNTLET PAYS OVER A WHOLE CLIMB, vs the levels it buys');
let cum = 0;
console.log(pad('through rank', 14) + pad('cumulative XP', 15) + pad('level reached', 15) + 'dens needed for the ceiling');
for (let r = 1; r <= 100; r++) {
  cum += endlessFoe(r).xp + 10;
  if ([10, 20, 30, 40, 50, 60, 80, 100].includes(r)) {
    console.log(pad(r, 14) + pad(cum, 15) + pad(levelFor(cum).level, 15) + Math.ceil((r - 7) / 3));
  }
}

console.log(`\nFor reference, the capped sources: fight ${XP_DAILY_CAP.fight}x10 = ${XP_DAILY_CAP.fight * 10} XP/day max.`);
