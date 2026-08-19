/* THE BONE GARDEN'S CLOSING PAYOUT PAYS EXACTLY ONCE.
 *
 * retireGardenIfNeeded (js/game.js) refunds PLOT_PRICES for bought beds and
 * converts every seed and every crop into ingredients when the garden leaves the
 * player's path. It pays up to 5,500 coins and it runs on BOOT, which makes it
 * the single most dangerous thing in the removal: a refund that re-runs on every
 * boot, restore, reinstall or second tab is a coin printer, and worse than no
 * refund at all.
 *
 * Rewarded-actions SOP rule 5: PROVE the second attempt pays nothing. Not by
 * reading the guard, by driving the action and measuring the balance either side.
 *
 *   PAYS      a real garden (5 beds, seeds in the pouch, crops in the ground) is
 *             settled: coins go up by exactly PLOT_PRICES, every seed and every
 *             crop lands in the Kitchen, the pouch and the beds are emptied.
 *   ONCE      the same call again moves coins by 0 and ingredients by 0.
 *   BOOT      a real page reload, which is the path this actually runs on, moves
 *             coins by 0.
 *   RACE      two calls fired concurrently pay exactly one refund between them.
 *   NOTHING   a save that never bought a bed and holds nothing is not paid at all
 *             and does not burn the ledger row.
 *
 * WHY IT CANNOT PASS VACUOUSLY. "The second run paid 0" is trivially true if the
 * FIRST run also paid 0, which is what a broken seed, a wrong kv key or a
 * migration that silently emptied the garden all look like. So every ONCE row is
 * gated on a PAYS row that asserts a specific NON-ZERO number first, and the
 * seeded state is read back through gardenState() before anything is graded.
 *
 * Self-serves this checkout when given no URL: boot()'s default is PRODUCTION.
 *
 * Usage: node tests/garden-retire-audit.mjs [url]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree, sleep } from './godmode.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2] || process.env.URL;
const server = arg ? null : await serveTree(ROOT);
const { browser, page, errors } = await boot(arg || server.url);

let bad = 0;
const check = (l, ok, d = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${l}${d ? '  ' + d : ''}`); if (!ok) bad++; };

/* A GARDEN WORTH 5,500 COINS AND EIGHT INGREDIENTS.
 *   beds       5 owned  -> 1500 + 4000 = 5,500 coins refunded
 *   pouch      3 marrow + 1 sinew + 1 ectoplasm spore -> 5 ingredients, 1:1
 *   ground     1 ripe common, 1 mid-grow common, 1 mid-grow spore
 *              -> HARVEST_BASE 2 + 2, HARVEST_BASE_RARE 1  = 5 ingredients
 *   total ingredients = 10, of which marrow 3+2 = 5.
 * Deliberately mixes ripe with mid-grow and common with rare, because the payout
 * must not depend on a clock or on a random roll. */
const seedGarden = () => page.evaluate(async () => {
  const db = await import('./js/db.js');
  const now = Date.now();
  await db.kvSet('garden', {
    seeds: { marrow: 3, sinew: 1, ectoplasm: 1 },
    plotsOwned: 5,
    plots: [
      { ing: 'marrow', plantedAt: now - 9e6, readyAt: now - 6e6, watered: true },   // ripe
      { ing: 'bog', plantedAt: now - 1e6, readyAt: now + 6e6, watered: false },     // mid-grow
      { ing: 'ectoplasm', plantedAt: now - 1e6, readyAt: now + 3e7, watered: false }, // mid-grow spore
      null, null,
    ],
    composts: { date: '', used: 0 },
  });
  await db.kvSet('coins', 1000);
  await db.kvSet('ingredients', {});
  // clear the ledger row so this run starts unsettled
  await db.db.del('kv', 'garden-retired');
});

const snap = () => page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const cooking = await import('./js/cooking.js');
  const garden = await import('./js/garden.js');
  const db = await import('./js/db.js');
  const inv = await cooking.ingredients();
  const g = await garden.gardenState();
  return {
    coins: await loot.coins(),
    ing: Object.values(inv).reduce((a, n) => a + (n || 0), 0),
    invById: inv,
    plotsOwned: g.plotsOwned,
    seeds: Object.values(g.seeds).reduce((a, n) => a + n, 0),
    planted: g.plots.filter(p => !p.empty).length,
    ledger: await db.kvGet('garden-retired', null),
  };
});

const runRetire = () => page.evaluate(async () => {
  const game = await import('./js/game.js');
  const r = await game.retireGardenIfNeeded();
  return r ? { paid: true, ...r } : { paid: false };
});

/* A SUITE THAT DIES READS LIKE A FLAKE. Without this row the whole run threw
   "retireGardenIfNeeded is not a function" on a tree that does not have it, and
   the gate prints a stack with no FAIL lines. Graded, not thrown. */
const exists = await page.evaluate(async () => typeof (await import('./js/game.js')).retireGardenIfNeeded === 'function');
check('SETUP js/game.js exports retireGardenIfNeeded', exists);
if (!exists) {
  console.log('\n1 FAILED');
  await browser.close(); server?.close();
  process.exit(1);
}

/* ------------------------- PAYS: the first settlement ------------------------- */
await seedGarden();
const before = await snap();
check('SETUP the save under test really holds a live garden: 5 beds, 5 seeds, 3 crops',
  before.plotsOwned === 5 && before.seeds === 5 && before.planted === 3, JSON.stringify(
    { beds: before.plotsOwned, seeds: before.seeds, planted: before.planted }));
check('SETUP the ledger row starts empty, so this is a first settlement', before.ledger === null, JSON.stringify(before.ledger));

const first = await runRetire();
const afterFirst = await snap();
const coinsPaid = afterFirst.coins - before.coins;
const ingPaid = afterFirst.ing - before.ing;
check('PAYS the settlement ran and returned a receipt', first.paid === true, JSON.stringify(first));
check('PAYS coins go up by exactly PLOT_PRICES for the two bought beds (1500 + 4000)',
  coinsPaid === 5500, `+${coinsPaid}`);
check('PAYS every seed and every crop lands in the Kitchen: 5 seeds 1:1, plus 2 + 2 + 1 for the three beds',
  ingPaid === 10, `+${ingPaid} ingredients: ${JSON.stringify(afterFirst.invById)}`);
check('PAYS the mid-grow crops were converted too, not just the ripe one (bog is only in the ground)',
  (afterFirst.invById.bog || 0) === 2, `bog = ${afterFirst.invById.bog}`);
check('PAYS the rare spore paid HARVEST_BASE_RARE, not the common floor',
  (afterFirst.invById.ectoplasm || 0) === 2, `ectoplasm = ${afterFirst.invById.ectoplasm} (1 seed + 1 spore in the ground)`);
check('PAYS the pouch is emptied, so nothing can be converted twice', afterFirst.seeds === 0, `${afterFirst.seeds} seeds left`);
check('PAYS the beds are emptied and handed back to the free three', afterFirst.planted === 0 && afterFirst.plotsOwned === 3,
  JSON.stringify({ planted: afterFirst.planted, owned: afterFirst.plotsOwned }));
check('PAYS the receipt is written into the ledger with the numbers a revival would need',
  afterFirst.ledger && afterFirst.ledger.coins === 5500 && afterFirst.ledger.beds === 5, JSON.stringify(afterFirst.ledger));

/* THE GATE ON EVERY ROW BELOW. If the first settlement paid nothing, "the second
   pays nothing" is true and worthless. */
const paidSomething = coinsPaid === 5500 && ingPaid === 10;
check('SETUP the first settlement really paid, so the no-op rows below are not vacuous',
  paidSomething, `coins +${coinsPaid}, ingredients +${ingPaid}`);

/* --------------------------- ONCE: the second call --------------------------- */
const second = await runRetire();
const afterSecond = await snap();
check('ONCE the second call returns no receipt at all', second.paid === false, JSON.stringify(second));
check('ONCE the second call moves the coin balance by 0',
  afterSecond.coins - afterFirst.coins === 0, `+${afterSecond.coins - afterFirst.coins}`);
check('ONCE the second call moves the ingredient count by 0',
  afterSecond.ing - afterFirst.ing === 0, `+${afterSecond.ing - afterFirst.ing}`);
check('ONCE ten more calls in a row still pay nothing',
  await (async () => {
    const c0 = afterSecond.coins;
    for (let i = 0; i < 10; i++) await runRetire();
    const s = await snap();
    return s.coins === c0;
  })(), 'ten repeats');

/* ------------------------ BOOT: the path it really runs on ------------------- */
const beforeBoot = await snap();
await page.reload({ waitUntil: 'networkidle2' });
await sleep(6000);
const afterBoot = await snap();
check('BOOT a real page reload, which is where this actually runs, pays nothing',
  afterBoot.coins - beforeBoot.coins === 0, `+${afterBoot.coins - beforeBoot.coins}`);
check('BOOT the reload did not hand out ingredients either',
  afterBoot.ing - beforeBoot.ing === 0, `+${afterBoot.ing - beforeBoot.ing}`);

/* ------------- RACE: two callers at the same instant, one refund ------------- */
await seedGarden();
const beforeRace = await snap();
check('SETUP the race starts from a live garden again', beforeRace.plotsOwned === 5 && beforeRace.ledger === null,
  JSON.stringify({ beds: beforeRace.plotsOwned, ledger: beforeRace.ledger }));
const race = await page.evaluate(async () => {
  const game = await import('./js/game.js');
  const rs = await Promise.all([game.retireGardenIfNeeded(), game.retireGardenIfNeeded(), game.retireGardenIfNeeded()]);
  return rs.map(r => (r ? r.coins : null));
});
const afterRace = await snap();
check('RACE exactly one of three concurrent callers gets a receipt',
  race.filter(x => x !== null).length === 1, JSON.stringify(race));
check('RACE the balance moved by ONE refund, not three',
  afterRace.coins - beforeRace.coins === 5500, `+${afterRace.coins - beforeRace.coins}`);

/* ----------------- NOTHING: a save that never put anything in ---------------- */
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.kvSet('garden', null);
  await db.db.del('kv', 'garden-retired');
});
const beforeNil = await snap();
check('SETUP the empty save really is empty: three free beds, no seeds, nothing planted',
  beforeNil.plotsOwned === 3 && beforeNil.seeds === 0 && beforeNil.planted === 0, JSON.stringify(
    { beds: beforeNil.plotsOwned, seeds: beforeNil.seeds, planted: beforeNil.planted }));
const nil = await runRetire();
const afterNil = await snap();
check('NOTHING a player who never bought a bed is not paid', nil.paid === false && afterNil.coins === beforeNil.coins,
  `${JSON.stringify(nil)} coins ${beforeNil.coins} -> ${afterNil.coins}`);
check('NOTHING and the ledger row is left unburned, so a garden restored from cloud backup can still be settled',
  afterNil.ledger === null, JSON.stringify(afterNil.ledger));

check('NO page errors during the run', errors.length === 0, errors.join(' | '));

await browser.close();
server?.close();
console.log(bad ? `\n${bad} FAILED` : '\nTHE CLOSING PAYOUT PAYS EXACTLY ONCE');
process.exit(bad ? 1 : 0);
