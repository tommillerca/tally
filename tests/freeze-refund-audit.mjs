/* THE STREAK FREEZE MAKE-GOOD PAYS EXACTLY ONCE.
 *
 * refundStreakFreezes (js/loot.js) pays 100 coins per Streak Freeze still in the
 * backpack when the item was retired in v253. It runs on BOOT (js/app.js), which
 * is the dangerous part: two tabs, a fast double-boot, or the PWA and the native
 * shell both waking put two callers inside it at the same instant.
 *
 * Until v441 the claim was a kvGet/kvSet pair with the payout BETWEEN them:
 *
 *     if (await kvGet('freeze-refunded', false)) return null;   // both pass
 *     ...
 *     await coinsAdd(coins);                                     // both pay
 *     await kvSet('freeze-refunded', true);                      // both set
 *
 * Two concurrent callers both clear the read and both pay. The identical shape
 * was measured paying 16,500 coins to three concurrent callers on the merchant
 * refund, which is why every claim in this app is db.addIfAbsent now.
 *
 *   PAYS       a save holding three freezes is paid exactly 300 coins and gets a
 *              receipt naming the count.
 *   ROWS       the freeze rows are gone afterwards, and coins are credited
 *              BEFORE they are deleted, so a write that dies halfway leaves an
 *              unusable item rather than losing coins somebody earned.
 *   ONCE       the same call again moves coins by 0. Ten more move it by 0.
 *   BOOT       a real page reload, the path this actually runs on, moves it by 0.
 *   RACE       three callers fired at the same instant pay ONE refund between
 *              them, not three. This is the row the bug fails.
 *   MIGRATION  a save that already carries the OLD kvSet flag from before the
 *              fix is treated as settled and paid NOTHING, even while holding
 *              freeze rows. Every existing install is in exactly this state, so
 *              a claim that missed it would pay the whole player base a second
 *              time: the opposite of the bug and far worse than it.
 *   NOTHING    a save that never held a freeze is paid nothing AND burns the
 *              flag, so it is not re-checked on every boot forever. That was the
 *              behaviour before the fix and it is deliberately preserved.
 *
 * WHY IT CANNOT PASS VACUOUSLY. "The second run paid 0" is trivially true when
 * the FIRST run also paid 0, which is what a wrong kv key, an empty seed or a
 * mis-parsed inv row all look like. So every no-op row below is gated on a PAYS
 * row that asserts a specific NON-ZERO number first, the seeded rows are read
 * back out of IndexedDB before anything is graded, and the RACE section re-seeds
 * and re-asserts a live unsettled save before it fires.
 *
 * Self-serves this checkout when given no URL: boot()'s default is PRODUCTION.
 *
 * Usage: node tests/freeze-refund-audit.mjs [url]
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

const PER_FREEZE = 100;
const SEEDED = 3;

/* Seed a save holding `n` Streak Freezes and NO settlement of any kind: the
   flag row is deleted outright, so this is a first settlement whichever claim
   the code under test uses. `oldFlag` seeds the pre-fix kvSet flag instead. */
const seedFreezes = (n, oldFlag = false) => page.evaluate(async ({ count, old }) => {
  const db = await import('./js/db.js');
  for (const r of await db.db.all('inv')) if (r.kind === 'freeze') await db.db.del('inv', r.id);
  for (let i = 0; i < count; i++) {
    await db.db.put('inv', { id: 'frz-' + i + '-' + Math.random().toString(36).slice(2),
      kind: 'freeze', ts: Date.now() });
  }
  await db.kvSet('coins', 1000);
  await db.db.del('kv', 'freeze-refunded');
  // The pre-fix flag, written exactly as the old code wrote it.
  if (old) await db.kvSet('freeze-refunded', true);
}, { count: n, old: oldFlag });

const snap = () => page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const db = await import('./js/db.js');
  const inv = await db.db.all('inv');
  return {
    coins: await loot.coins(),
    freezeRows: inv.filter(r => r.kind === 'freeze').length,
    flag: await db.kvGet('freeze-refunded', null),
  };
});

const runRefund = () => page.evaluate(async () => {
  const r = await (await import('./js/loot.js')).refundStreakFreezes();
  return r ? { paid: true, ...r } : { paid: false };
});

/* A SUITE THAT DIES READS LIKE A FLAKE, so the export is GRADED, not assumed. */
const exists = await page.evaluate(async () =>
  typeof (await import('./js/loot.js')).refundStreakFreezes === 'function');
check('SETUP js/loot.js exports refundStreakFreezes', exists);
if (!exists) {
  console.log('\n1 FAILED');
  await browser.close(); server?.close();
  process.exit(1);
}

/* --------------------------- PAYS: three freezes --------------------------- */
await seedFreezes(SEEDED);
const before = await snap();
check('SETUP the save under test really holds three Streak Freezes',
  before.freezeRows === SEEDED, `${before.freezeRows} rows`);
check('SETUP the settlement flag starts absent, so this is a first settlement',
  before.flag === null, JSON.stringify(before.flag));

const first = await runRefund();
const afterFirst = await snap();
const coinsPaid = afterFirst.coins - before.coins;
check('PAYS the make-good ran and returned a receipt', first.paid === true, JSON.stringify(first));
check('PAYS coins go up by exactly 100 per freeze held (3 x 100 = 300)',
  coinsPaid === SEEDED * PER_FREEZE, `+${coinsPaid}`);
check('PAYS the receipt names the count it settled',
  first.count === SEEDED && first.coins === SEEDED * PER_FREEZE, JSON.stringify(first));

/* ---------------------- ROWS: the retired items are gone --------------------- */
check('ROWS the freeze rows are deleted once they have been paid for',
  afterFirst.freezeRows === 0, `${afterFirst.freezeRows} rows left`);

/* THE GATE ON EVERY NO-OP ROW BELOW. */
check('SETUP the first settlement really paid, so the no-op rows below are not vacuous',
  coinsPaid === SEEDED * PER_FREEZE, `+${coinsPaid}`);

/* --------------------------- ONCE: the second call -------------------------- */
const second = await runRefund();
const afterSecond = await snap();
check('ONCE the second call returns no receipt at all', second.paid === false, JSON.stringify(second));
check('ONCE the second call moves the coin balance by 0',
  afterSecond.coins - afterFirst.coins === 0, `+${afterSecond.coins - afterFirst.coins}`);
check('ONCE ten more calls in a row still pay nothing',
  await (async () => {
    const c0 = afterSecond.coins;
    for (let i = 0; i < 10; i++) await runRefund();
    return (await snap()).coins === c0;
  })(), 'ten repeats');

/* ------------------------ BOOT: the path it really runs on ------------------ */
const beforeBoot = await snap();
await page.reload({ waitUntil: 'networkidle2' });
await sleep(6000);
const afterBoot = await snap();
check('BOOT a real page reload, which is where this actually runs, pays no coins',
  afterBoot.coins - beforeBoot.coins === 0, `+${afterBoot.coins - beforeBoot.coins}`);

/* ------------- RACE: three callers at the same instant, one refund ----------- */
await seedFreezes(SEEDED);
const beforeRace = await snap();
check('SETUP the race starts from an unsettled save holding three freezes again',
  beforeRace.freezeRows === SEEDED && beforeRace.flag === null,
  JSON.stringify({ rows: beforeRace.freezeRows, flag: beforeRace.flag }));
const race = await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const rs = await Promise.all([loot.refundStreakFreezes(), loot.refundStreakFreezes(), loot.refundStreakFreezes()]);
  return rs.map(r => (r ? r.coins : null));
});
const afterRace = await snap();
check('RACE exactly one of three concurrent callers gets a receipt',
  race.filter(x => x !== null).length === 1, JSON.stringify(race));
check('RACE the coin balance moved by ONE refund of 300, not by three',
  afterRace.coins - beforeRace.coins === SEEDED * PER_FREEZE, `+${afterRace.coins - beforeRace.coins}`);

/* ---- MIGRATION: a save that already carries the pre-fix flag is settled ----- */
await seedFreezes(SEEDED, true);
const beforeMig = await snap();
check('SETUP the migration save holds three freezes AND the old kvSet flag',
  beforeMig.freezeRows === SEEDED && beforeMig.flag === true,
  JSON.stringify({ rows: beforeMig.freezeRows, flag: beforeMig.flag }));
const mig = await runRefund();
const afterMig = await snap();
check('MIGRATION an install that was already settled by the OLD flag is paid NOTHING',
  mig.paid === false && afterMig.coins - beforeMig.coins === 0,
  `${JSON.stringify(mig)} +${afterMig.coins - beforeMig.coins}`);
check('MIGRATION and its freeze rows are left alone rather than silently deleted',
  afterMig.freezeRows === SEEDED, `${afterMig.freezeRows} rows`);

/* ----------------- NOTHING: a save that never held a freeze ----------------- */
await seedFreezes(0);
const beforeNil = await snap();
check('SETUP the empty save really holds no freezes and is unsettled',
  beforeNil.freezeRows === 0 && beforeNil.flag === null,
  JSON.stringify({ rows: beforeNil.freezeRows, flag: beforeNil.flag }));
const nil = await runRefund();
const afterNil = await snap();
check('NOTHING a player who never held a freeze is not paid',
  nil.paid === false && afterNil.coins === beforeNil.coins,
  `${JSON.stringify(nil)} coins ${beforeNil.coins} -> ${afterNil.coins}`);
check('NOTHING and the flag IS burned, so this save is not re-checked on every boot forever',
  afterNil.flag !== null, JSON.stringify(afterNil.flag));

check('NO page errors during the run', errors.length === 0, errors.join(' | '));

await browser.close();
server?.close();
console.log(bad ? `\n${bad} FAILED` : '\nTHE FREEZE MAKE-GOOD PAYS EXACTLY ONCE');
process.exit(bad ? 1 : 0);
