/* THE GAUNTLET BALANCE INSTRUMENT. A measuring tool, not a pass/fail test, the
 * same way tests/fight-sim.mjs is.
 *
 * WHY IT EXISTS. The Gauntlet went from two drawn bosses to four (the Mimic and
 * the Wanderer joined the Glutton and the Live Wire) and "is it harder now" is
 * not a question you can answer by reading endlessFoe. It was answered wrong
 * twice while that change was being written:
 *
 *   - the Mimic was specced at 1.05x on the theory that a 5% step is inside the
 *     noise. He measured 12.0% player win against 28.8% for an ordinary rung,
 *     because the TALENT TREE dominates the multiplier: the six trees range from
 *     5.3% to 65.7% player win at the SAME multiplier.
 *   - the Wanderer was specced at 1.22x to sit "just above" the Glutton's 1.18x.
 *     He measured EASIER than the Glutton (35.8% against 18.1%), because his
 *     thematic tree is the weakest of the six.
 *
 * Both numbers were then set from this instrument instead.
 *
 * WHAT IT MEASURES. Win rate per rung against the real foe config, with the foe
 * scaled by its RELATIVE multiplier (its mult over the ordinary curve). Relative
 * is the only honest scale here: the ladder builds every foe off the player's own
 * stats, so an absolute multiplier only says "the ladder is endless" and floors
 * every rung at 0% win. Relative says "how much of a step is this rung", which is
 * the number the design comments in js/pit.js actually claim.
 *
 * Usage:
 *   node tests/gauntlet-sim.mjs
 *   node tests/gauntlet-sim.mjs --seeds 200 --max 78
 *   node tests/gauntlet-sim.mjs --tree /path/to/other/checkout   # before/after
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TREE = arg('--tree', process.cwd());
const SEEDS = Number(arg('--seeds', 60));
const MAXRANK = Number(arg('--max', 40));

const pit = await import(pathToFileURL(path.join(TREE, 'js/pit.js')).href);
const { makeFighter, createFight, actionsFor, applyAction, endTurn, aiTakeTurn,
        scaleStats, expectedDamage, ACTIONS, TURN_CAP, endlessFoe } = pit;

const SETUP_FIRST = ['rage', 'totem', 'raisedead', 'callcrows', 'ward'];
function playerTurn(fight) {
  let guard = 0;
  while (!fight.over && fight.active === 'p' && fight.ap > 0 && guard++ < 8) {
    const legal = actionsFor(fight).filter(x => x.enabled);
    if (!legal.length) break;
    const has = id => legal.find(x => x.id === id);
    let pick = null;
    if (fight.p.hp < fight.p.d.maxHp * 0.3 && (has('mend') || has('guard'))) pick = has('mend') ? 'mend' : 'guard';
    if (!pick && has('callcrows') && (fight.p.flock || 0) < 3) pick = 'callcrows';
    if (!pick) for (const id of SETUP_FIRST) if (id !== 'callcrows' && has(id)) { pick = id; break; }
    if (!pick && has('signature')) pick = 'signature';
    if (!pick) {
      const dmg = legal.filter(a => ACTIONS[a.id] && ACTIONS[a.id].base)
        .map(a => ({ id: a.id, v: expectedDamage(a.id, fight.p, fight.f, fight.f) / Math.max(1, a.ap) }))
        .sort((x, y) => y.v - x.v);
      pick = dmg.length ? dmg[0].id : legal[0].id;
    }
    applyAction(fight, pick);
  }
  if (!fight.over) endTurn(fight);
}

const STATS = { power: 55, marrow: 55, wind: 55, reflex: 55, hype: 55 };
const PLAYER_TALENTS = ['heavyhands', 'marrowlust', 'bonebreaker', 'concussive', 'thickskull', 'titan'];

// THE ORDINARY CURVE. Every foe's mult is measured AGAINST this, because the
// ladder scales the foe off the PLAYER's own stats: an absolute mult only says
// "the ladder is endless", it cannot say "this rung is a step up". The relative
// mult is the number the design comments already claim (Glutton 1.18x, Mage
// 1.11x), so the sim measures the thing the code says it does.
const ordinaryMult = rank => 1.32 + rank * 0.07;
function fightRank(f, seed) {
  const rel = f.mult / ordinaryMult(f.rank);
  const player = makeFighter({ name: 'P', stats: STATS, weaponId: 'starter', talents: PLAYER_TALENTS });
  const foe = makeFighter({ name: f.name, stats: scaleStats(STATS, rel),
    weaponId: f.weaponId || 'starter', talents: f.talents || [] });
  if (f.mage) foe.wraith = true;
  if (f.wraith) foe.wraith = true;
  const fight = createFight({ player, foe, seed, aiLevel: f.aiLevel || 3 });
  let guard = 0;
  while (!fight.over && guard++ < TURN_CAP * 4) {
    if (fight.active === 'p') playerTurn(fight);
    else { aiTakeTurn(fight); if (!fight.over) endTurn(fight); }
  }
  return fight.over ? fight.over.winner : 'draw';
}

const rows = [];
for (let rank = 1; rank <= MAXRANK; rank++) {
  const f = endlessFoe(rank);
  let wins = 0;
  for (let s = 1; s <= SEEDS; s++) if (fightRank(f, s * 7919) === 'p') wins++;
  const kind = f.glutton ? 'glutton' : f.mage ? 'mage' : f.mimic ? 'mimic' : f.wanderer ? 'wanderer' : 'ordinary';
  rows.push({ rank, name: f.name, kind, mult: +f.mult.toFixed(3), xp: f.xp, coins: f.coins,
              repeat: f.repeatCoins, win: wins / SEEDS });
}
const named = rows.filter(r => r.kind !== 'ordinary');
const sum = k => rows.reduce((a, r) => a + r[k], 0);
console.log(`GAUNTLET SIM  tree=${path.basename(TREE)}  ranks 1-${MAXRANK}  seeds=${SEEDS}  player=slab@55s`);
console.log('rank  kind      name                     mult    win%   xp    coins  repeat');
for (const r of rows) console.log(
  String(r.rank).padEnd(6) + r.kind.padEnd(10) + r.name.padEnd(25) +
  String(r.mult).padEnd(8) + (r.win * 100).toFixed(0).padStart(4) + '%  ' +
  String(r.xp).padEnd(6) + String(r.coins).padEnd(7) + r.repeat);
console.log('');
console.log(`named-boss rungs      ${named.length}/${MAXRANK} = ${(named.length / MAXRANK * 100).toFixed(1)}%`);
for (const k of ['glutton', 'mage', 'mimic', 'wanderer']) {
  const g = rows.filter(r => r.kind === k);
  if (g.length) console.log(`  ${k.padEnd(10)} ${g.length} rungs, mean win ${(g.reduce((a, r) => a + r.win, 0) / g.length * 100).toFixed(1)}%`);
}
const ord = rows.filter(r => r.kind === 'ordinary');
console.log(`  ordinary   ${ord.length} rungs, mean win ${(ord.reduce((a, r) => a + r.win, 0) / ord.length * 100).toFixed(1)}%`);
console.log(`OVERALL mean clear rate  ${(sum('win') / MAXRANK * 100).toFixed(1)}%`);
console.log(`TOTAL first-clear coins  ${sum('coins')}`);
console.log(`TOTAL first-clear xp     ${sum('xp')}`);
console.log(`EXPECTED coins (win-weighted) ${Math.round(rows.reduce((a, r) => a + r.coins * r.win, 0))}`);
