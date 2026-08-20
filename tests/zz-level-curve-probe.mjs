/* THROWAWAY DIAGNOSTIC. Real xpForLevel/levelFor, no arithmetic of my own. */
import { xpForLevel, levelFor } from '../js/game.js';
import { LADDER, CHAMPION, endlessFoe } from '../js/pit.js';
import { DEN_TIERS } from '../js/poi.js';

const pad = (s, n) => String(s).padEnd(n);
console.log('LEVEL CURVE (real xpForLevel)');
console.log(pad('L', 4) + pad('total XP at L', 15) + pad('band L->L+1', 13) + 'growth vs prev band');
let prev = null;
for (const L of [1,2,3,4,5,6,7,8,9,10,12,15,20,25,30,40,50,60,80,100]) {
  const band = xpForLevel(L + 1) - xpForLevel(L);
  console.log(pad(L, 4) + pad(xpForLevel(L), 15) + pad(band, 13) + (prev ? (band / prev).toFixed(3) + 'x' : ''));
  prev = band;
}

/* MEASURED payouts from tests/zz-boss-xp-probe.mjs (real ledger), reused here. */
const PACKS = {
  'ladder rungs 1-4':        [50, 50, 55, 60],
  'ladder rungs 5-8':        [65, 70, 80, 90],
  'boss dens, tiers 1/2/3/5':[50, 70, 70, 70],
  'boss dens, 4x tier 6':    [110, 110, 110, 110],
  'roaming bosses, t0/1/2/2':[55, 70, 100, 100],
  'gauntlet ranks 1-4':      [80, 90, 100, 110],
  'gauntlet ranks 7-10':     [204, 130, 140, 290],
  'gauntlet ranks 17-20':    [180, 190, 380, 430],
};

console.log('\nHOW MANY LEVELS 4 BOSSES CROSS, starting at the FLOOR of each level');
console.log(pad('pack', 27) + [1,3,5,8,10,12,15,20,25,30,40].map(l => pad('L' + l, 5)).join(''));
for (const [name, pack] of Object.entries(PACKS)) {
  const sum = pack.reduce((a, b) => a + b, 0);
  const row = [1,3,5,8,10,12,15,20,25,30,40].map(L => {
    const start = xpForLevel(L);
    return pad(levelFor(start + sum).level - L, 5);
  });
  console.log(pad(`${name} (${sum} XP)`, 27) + row.join(''));
}

console.log('\nWORST CASE: start at the TOP of a level (1 XP short of the next)');
console.log(pad('pack', 27) + [1,3,5,8,10,12,15,20,25,30,40].map(l => pad('L' + l, 5)).join(''));
for (const [name, pack] of Object.entries(PACKS)) {
  const sum = pack.reduce((a, b) => a + b, 0);
  const row = [1,3,5,8,10,12,15,20,25,30,40].map(L => {
    const start = xpForLevel(L + 1) - 1;
    return pad(levelFor(start + sum).level - L, 5);
  });
  console.log(pad(`${name} (${sum} XP)`, 27) + row.join(''));
}

console.log('\nBOSS KILLS NEEDED TO CLEAR ONE LEVEL (boss-XP only, from the level floor)');
console.log(pad('L', 4) + pad('band', 8) + pad('den t3 (70)', 13) + pad('rung5 (65)', 12) + pad('gauntlet r4 (110)', 18) + 'gauntlet r20 (430)');
for (const L of [1,2,3,4,5,6,8,10,12,15,20,25,30,40,50]) {
  const band = xpForLevel(L + 1) - xpForLevel(L);
  const n = x => Math.ceil(band / x);
  console.log(pad(L, 4) + pad(band, 8) + pad(n(70), 13) + pad(n(65), 12) + pad(n(110), 18) + n(430));
}

/* the stated ceiling from js/game.js: everything else tops out ~690 XP a day,
   repeatables are allowed ~300 on top. What does an uncapped boss day add? */
console.log('\nA DAY OF BOSSES vs THE STATED DAILY SHAPE (game.js: ~690 other + ~300 repeatables = ~990)');
for (const n of [4, 8, 12, 20, 40]) {
  const den = n * 70, gaunt = n * 110;
  console.log(`${pad(n + ' bosses', 12)} tier-3 dens ${pad(den, 7)} XP   gauntlet r4 ${pad(gaunt, 7)} XP   (fight-capped share: 120 max)`);
}

console.log('\nLEVELS GAINED IN ONE DAY OF BOSS FARMING, from level 10, 20, 30');
console.log(pad('bosses/day', 12) + [10, 20, 30].map(l => pad('from L' + l, 12)).join(''));
for (const n of [4, 8, 12, 20, 40]) {
  const row = [10, 20, 30].map(L => {
    const start = xpForLevel(L);
    const capped = Math.min(n, 12) * 10;            // the fight component really is capped
    const uncapped = n * 60;                        // measured tier-3 bossday component
    return pad(`+${levelFor(start + capped + uncapped).level - L}`, 12);
  });
  console.log(pad(n, 12) + row.join(''));
}
