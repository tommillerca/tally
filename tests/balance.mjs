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
import { measure, BUILDS } from './fight-sim.mjs';
import { BUILD_MULT_CAP, CATALYST_CAP } from '../js/pit.js';

const SEEDS = 120;
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

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
const cheatBuild = { name: 'sustain + last light', stats: BUILDS[0].stats, weaponId: 'starter', talents: [...SUSTAIN, 'lastlight'] };
const sustainOnly = { name: 'sustain alone', stats: BUILDS[0].stats, weaponId: 'starter', talents: SUSTAIN };
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
