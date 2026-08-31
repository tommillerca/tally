/* EVERY BOSS DEN RAISES THE GAUNTLET CEILING, OR NONE OF THEM DO.
 *
 * Tom, 2026-08-13, and not for the first time: "fighting some of the new boss
 * dens in the open world do not increase the ceiling on pit fights. some do
 * some dont, it is very frustrating for players".
 *
 * He was right and the split was structural. denWinsCount() counts xp rows of
 * type 'bossfirst'. claimDenWin has three branches:
 *     landmark den   mints bossfirst   counted
 *     remote den     mints bossfirst   counted (its comment insists on it)
 *     ROAMING boss   minted NOTHING    never counted
 * Same function, same kind of fight, silently different progression.
 *
 * This drives the real claim functions rather than asserting on the counter, so
 * a future branch that pays a boss without minting its marker fails here.
 *
 * PROVE-RED: drop the `bossfirst-${den.id}` award from the roaming branch and
 * ROAMING goes red with the ceiling unmoved.
 *
 * Usage: node tests/den-ceiling-audit.mjs
 */
import { boot, seed, sleep, serveTree } from './godmode.js';
const srv = await serveTree(process.cwd());
const { browser, page } = await boot(srv.url, { headless: process.env.HEADLESS_MODE || 'shell' });
const fails = [];
const ok = (n, p, d = '') => { console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  ' + d : ''}`); if (!p) fails.push(n); };
await seed(page, { level: 20 });
await sleep(1200);

const probe = await page.evaluate(async () => {
  const poi = await import('./js/poi.js');
  const pit = await import('./js/pit.js');
  const out = { base: null, steps: [] };
  const ceil = async () => pit.endlessCeiling(await poi.denWinsCount());
  out.base = await ceil();

  // a ROAMING boss, the shape Tom is reporting
  const roam = { id: 'roam-2026-08-13-9-9', roaming: true, day: '2026-08-13',
    name: 'Test Roamer', reward: { xp: 50 } };
  const first = await poi.claimDenWin(roam, '2026-08-13');
  out.steps.push({ what: 'roaming win', paid: !!first, ceiling: await ceil() });
  // and again: a re-clear must not move it a second time
  const again = await poi.claimDenWin(roam, '2026-08-13');
  out.steps.push({ what: 'roaming re-clear', paid: !!again, ceiling: await ceil() });

  // a LANDMARK den, which already worked, as the control
  const land = { id: 'den-test-1', name: 'Test Landmark', tier: 1,
    reward: { xp: 60 }, theme: null };
  const l1 = await poi.claimDenWin(land, '2026-08-13');
  out.steps.push({ what: 'landmark win', paid: !!l1, ceiling: await ceil() });

  /* A REMOTE den claim must not move the wallet. The remote branch used to pay
     coinsAdd(r.coins) itself while the fight settle paid the same r.coins out
     of the return: every remote win banked double its banner (+48 announced,
     +96 banked, measured live in the round-2 playtest). The settle is the one
     payer, so this function's own wallet delta is exactly zero, while the
     return still CARRIES the coins for the settle to pay. */
  const loot = await import('./js/loot.js');
  const remote = { id: 'remote-test-1', remote: true, name: 'Test Remote',
    reward: { xp: 40, coins: 48 } };
  const before = await loot.coins();
  const rw = await poi.claimDenWin(remote, '2026-08-13');
  out.remote = { paid: !!rw, carried: rw ? rw.coins || 0 : 0,
    delta: (await loot.coins()) - before, ceiling: await ceil() };
  return out;
});

console.log(JSON.stringify(probe));
const [roamWin, roamAgain, landWin] = probe.steps;
ok('SETUP the ceiling started somewhere sane (a null baseline proves nothing)',
  typeof probe.base === 'number' && probe.base >= 7, `base ${probe.base}`);
ok('ROAMING beating a roaming boss RAISES the ceiling (this is the bug Tom reported)',
  roamWin.paid && roamWin.ceiling > probe.base, `${probe.base} -> ${roamWin.ceiling}`);
ok('ROAMING re-clearing the same boss does NOT raise it again (no farm)',
  roamAgain.ceiling === roamWin.ceiling, `${roamWin.ceiling} -> ${roamAgain.ceiling}`);
ok('LANDMARK a walk-to den still raises it (the control that already worked)',
  landWin.paid && landWin.ceiling > roamWin.ceiling, `${roamWin.ceiling} -> ${landWin.ceiling}`);
ok('REMOTE-PAYS-NOTHING a remote den claim carries its coins in the return and leaves the wallet alone (the settle is the one payer)',
  probe.remote && probe.remote.paid && probe.remote.carried > 0 && probe.remote.delta === 0,
  probe.remote ? `carried ${probe.remote.carried}, wallet delta ${probe.remote.delta}` : 'remote claim never ran');
ok('REMOTE a remote den still raises the ceiling (the reason the branch exists)',
  probe.remote && probe.remote.ceiling > landWin.ceiling - 1 && probe.remote.ceiling > probe.base,
  probe.remote ? `ceiling ${probe.remote.ceiling}` : '');
ok('STEP each distinct boss moves it by the same amount, whatever kind it is',
  (roamWin.ceiling - probe.base) === (landWin.ceiling - roamWin.ceiling),
  `roaming +${roamWin.ceiling - probe.base}, landmark +${landWin.ceiling - roamWin.ceiling}`);

/* THE SAME CELL, A NEW BOSS EVERY WEEK.
 *
 * Tom, 2026-08-16, having been told this was fixed five times: "I've killed a
 * boss den and it still didn't raise my pit cap."
 *
 * A landmark den's `id` is its GRID CELL (`${cx}_${cy}`), but denForCell seeds
 * the boss and tier from `den:${week}:${cx}:${cy}`, so one cell holds a
 * DIFFERENT boss each ISO week. The gate marker was `bossfirst-<cell>`, so the
 * first clear of a cell banked it forever and every later week's boss in that
 * cell minted nothing. A player who fights the dens near home sees real kills
 * and a frozen ceiling, permanently.
 *
 * Five audits already covered this bug area and ALL of them passed while it was
 * live, because every one of them beat a den exactly ONCE in a fresh profile.
 * Once is the one case the bug cannot show up in. So this drives the REAL
 * densNear/claimDenWin pair at a real anchor, pinned to ONE cell, across four
 * consecutive weeks, and asserts the whole delta rather than a trend.
 *
 * PROVE-RED: revert the marker to `bossfirst-${den.id}` and WEEK-ROTATION goes
 * red at +1 win / +3 ceiling instead of +4 / +12.
 *
 * The re-clear case is load-bearing in the other direction: it is a second real
 * kill of the same week's boss on a LATER day, so it reaches the marker line
 * and can only be stopped by award()'s dedupe. Deleting dedupe to make the
 * rotation case pass turns this one red.
 */
const WEEKS = ['2026-W30', '2026-W31', '2026-W32', '2026-W33'];
const rot = await page.evaluate(async weeks => {
  const poi = await import('./js/poi.js');
  const pit = await import('./js/pit.js');
  const { db } = await import('./js/db.js');
  const LAT = 49.28434, LNG = -123.10884;              // Gastown, a real den anchor
  const ceil = async () => pit.endlessCeiling(await poi.denWinsCount());
  const landmarks = week => poi.densNear(week, LAT, LNG).filter(d => !d.roaming && !d.remote);
  const seedWeek = landmarks(weeks[0]);
  if (!seedWeek.length) return { cell: null, missing: weeks.slice(), steps: [] };
  const cell = seedWeek[0].id;                         // pin ONE cell for every week
  const out = { cell, bosses: [], missing: [], steps: [],
    baseWins: await poi.denWinsCount(), baseCeiling: await ceil() };
  for (const week of weeks) {
    const den = landmarks(week).find(d => d.id === cell);
    if (!den) { out.missing.push(week); continue; }
    out.bosses.push(`${week} "${den.boss}" t${den.tier}`);
    /* The THIRD argument is not optional here: without it claimDenWin defaults
       to the real current week and every iteration writes the same marker, so
       the check would pass on the broken build. */
    const paid = await poi.claimDenWin(den, `${week}-d1`, week);
    out.steps.push({ week, paid: !!paid, wins: await poi.denWinsCount(), ceiling: await ceil() });
  }
  // a second real kill of the LAST week's boss, on a later day inside that week
  const lastWeek = weeks[weeks.length - 1];
  const again = landmarks(lastWeek).find(d => d.id === cell);
  const paidAgain = again ? await poi.claimDenWin(again, `${lastWeek}-d2`, lastWeek) : null;
  out.reclear = { paid: !!paidAgain, wins: await poi.denWinsCount(), ceiling: await ceil() };
  out.markers = (await db.all('xp'))
    .filter(x => x.type === 'bossfirst' && x.key.endsWith(cell)).map(x => x.key);
  return out;
}, WEEKS);

console.log(JSON.stringify(rot));
const N = WEEKS.length;
const lastStep = rot.steps[rot.steps.length - 1];
ok('SETUP a real den was found in the pinned cell for every week (an empty sample proves nothing)',
  !!rot.cell && rot.steps.length === N && rot.missing.length === 0,
  rot.cell ? `cell ${rot.cell}, ${rot.steps.length}/${N} weeks: ${rot.bosses.join(' | ')}${rot.missing.length ? `, MISSING ${rot.missing.join(',')}` : ''}`
    : `NO landmark den at the anchor, 0 of ${N} weeks sampled`);
ok('SETUP every one of those weekly kills actually paid out (an unpaid kill is not a test of the gate)',
  rot.steps.length === N && rot.steps.every(s => s.paid),
  `${rot.steps.filter(s => s.paid).length}/${N} paid`);
ok(`WEEK-ROTATION ${N} weekly bosses in ONE cell raise denWins by exactly ${N} (this is Tom's frozen pit cap)`,
  !!lastStep && lastStep.wins - rot.baseWins === N,
  lastStep ? `wins ${rot.baseWins} -> ${lastStep.wins}, +${lastStep.wins - rot.baseWins}, expected +${N} (${N - (lastStep.wins - rot.baseWins)} short)`
    : 'no weekly kill landed at all');
ok(`WEEK-ROTATION and raise the endless ceiling by exactly ${3 * N}`,
  !!lastStep && lastStep.ceiling - rot.baseCeiling === 3 * N,
  lastStep ? `ceiling ${rot.baseCeiling} -> ${lastStep.ceiling}, +${lastStep.ceiling - rot.baseCeiling}, expected +${3 * N} (${3 * N - (lastStep.ceiling - rot.baseCeiling)} short)`
    : 'no weekly kill landed at all');
ok(`WEEK-ROTATION one distinct gate marker per week, ${N} in that cell (a cell-only marker leaves 1)`,
  rot.markers?.length === N, `markers ${JSON.stringify(rot.markers)}`);
ok('DEDUPE re-killing the SAME week\'s boss on a later day does NOT raise it again (no farm)',
  !!lastStep && rot.reclear.paid && rot.reclear.ceiling === lastStep.ceiling,
  `re-clear paid=${rot.reclear?.paid}, ceiling ${lastStep?.ceiling} -> ${rot.reclear?.ceiling}`);

await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nevery kind of boss counts');
process.exit(fails.length ? 1 : 0);
