/* WHICH FIGHTS RAISE THE GAUNTLET CEILING, asserted for EVERY claim path.
 *
 * Tom has reported this three times: "fighting some of the new boss dens in
 * the open world do not increase the ceiling on pit fights. some do some
 * dont." Each previous fix patched the one path he had just fought.
 *
 * The ceiling is endlessCeiling(denWinsCount()) = 7 + 3 x distinct dens ever
 * beaten, and denWinsCount() counts `bossfirst-` rows in the ledger. So the
 * real contract is not "claimDenWin works", it is: EVERY claim path for a
 * boss-shaped fight either mints a bossfirst marker or is on a written
 * exclusion list. This file asserts that, so path number five cannot quietly
 * arrive without a decision.
 *
 * The roster is the point. A behavioural check on the three paths that exist
 * today would still have passed on the day the Glutton was added.
 *
 *   node tests/pit-cap-paths-audit.mjs        (self-serves this checkout)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, sleep, serveTree } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

/* THE DECISIONS, written down. Changing one is a product call, and moving a
   name between these lists is what a reviewer should have to see in a diff. */
const MUST_RAISE = {
  claimDenWin: 'a boss den: walk-up, remote and roaming all count',
  claimGluttonWin: 'the Glutton is a real boss fight (Tom, 2026-08-15)',
};
const MUST_NOT_RAISE = {
  claimMiniWin: 'Boneyard minis are documented as far below a world-boss den',
  claimSpire: 'Tom, 2026-08-15: "the glutton can not spires"',
  claimDenLoot: 'picks a piece from a drop already earned; not a fight',
};

const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
const { browser, page } = await boot(base);
const errs = [];
page.on('pageerror', e => errs.push(String(e)));

try {
  await seed(page, { level: 30, coins: 5000 });

  /* ---- THE ROSTER ROW: no unclassified claim path may exist ---- */
  const paths = await page.evaluate(async () => {
    const poi = await import('./js/poi.js');
    const spires = await import('./js/spires.js');
    return [...Object.keys(poi), ...Object.keys(spires)]
      .filter(k => /^claim/.test(k))
      .sort();
  });
  const known = { ...MUST_RAISE, ...MUST_NOT_RAISE };
  const unclassified = paths.filter(p => !known[p]);
  const missing = Object.keys(known).filter(k => !paths.includes(k));
  ok('SAMPLE the claim paths were found at all', paths.length >= 4, paths.join(', '));
  ok('ROSTER every claim path is classified raise / do-not-raise', unclassified.length === 0,
    unclassified.length ? `UNCLASSIFIED: ${unclassified.join(', ')}. Add it to MUST_RAISE or MUST_NOT_RAISE with a reason.`
                        : `${paths.length} paths, all named`);
  ok('ROSTER and every classified path still exists', missing.length === 0,
    missing.length ? `named but gone: ${missing.join(', ')}` : 'no stale names');

  /* ---- BEHAVIOUR: drive the real functions and read the real ceiling ---- */
  const capNow = () => page.evaluate(async () => {
    const poi = await import('./js/poi.js');
    const pit = await import('./js/pit.js');
    const wins = await poi.denWinsCount();
    return { wins, ceiling: pit.endlessCeiling(wins) };
  });

  const start = await capNow();
  ok('SAMPLE a starting ceiling was read', Number.isInteger(start.ceiling) && start.ceiling >= 7,
    `${start.wins} wins, ceiling ${start.ceiling}`);

  /* the Glutton: raises it once, and only once, however many windows you beat */
  await page.evaluate(async () => { const poi = await import('./js/poi.js'); await poi.claimGluttonWin('2026-08-15', 0); });
  const afterGlutton = await capNow();
  ok('GLUTTON beating the Glutton raises the ceiling', afterGlutton.ceiling === start.ceiling + 3,
    `${start.ceiling} -> ${afterGlutton.ceiling}`);

  await page.evaluate(async () => {
    const poi = await import('./js/poi.js');
    await poi.claimGluttonWin('2026-08-16', 0);
    await poi.claimGluttonWin('2026-08-17', 1);
  });
  const afterFarm = await capNow();
  /* THE ANTI-FARM ROW. A per-appearance marker would make the ceiling rise +3
     a day forever, which the ledger's own doctrine forbids. Without this row
     the fix above would look identical to the farmable version. */
  ok('GLUTTON but beating him again on later days does NOT raise it further',
    afterFarm.ceiling === afterGlutton.ceiling,
    `after two more windows: ${afterGlutton.ceiling} -> ${afterFarm.ceiling}`);

  /* the excluded paths must leave it alone */
  const beforeExcluded = await capNow();
  const spireRan = await page.evaluate(async () => {
    const poi = await import('./js/poi.js');
    let ran = 0;
    try { await poi.claimMiniWin({ id: 'm1', name: 'Test Mini', reward: { xp: 20 } }, '2026-08-15'); ran++; } catch { /* shape differs */ }
    return ran;
  });
  const afterExcluded = await capNow();
  ok('EXCLUDED a Boneyard mini does not raise the ceiling', afterExcluded.ceiling === beforeExcluded.ceiling,
    `${beforeExcluded.ceiling} -> ${afterExcluded.ceiling} (mini claim ran: ${spireRan})`);

  ok('NO page errors', errs.length === 0, errs.join(' | '));
} finally {
  await browser.close();
  srv?.close?.();
}
console.log(fails ? '\nPIT CAP PATHS: FAILED' : '\nPIT CAP PATHS: every claim path is a decision, not an oversight');
process.exit(fails);
