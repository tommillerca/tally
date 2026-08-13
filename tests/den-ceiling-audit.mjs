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
ok('STEP each distinct boss moves it by the same amount, whatever kind it is',
  (roamWin.ceiling - probe.base) === (landWin.ceiling - roamWin.ceiling),
  `roaming +${roamWin.ceiling - probe.base}, landmark +${landWin.ceiling - roamWin.ceiling}`);

await browser.close(); srv.close?.();
console.log(fails.length ? `\n${fails.length} FAILED: ${fails.join(', ')}` : '\nevery kind of boss counts');
process.exit(fails.length ? 1 : 0);
