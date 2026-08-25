/* THE BONE MERCHANT'S CLOSING PAYOUT PAYS EXACTLY ONCE.
 *
 * retireMerchantIfNeeded (js/loot.js) refunds the listed price of every weapon a
 * player bought when the Bone Merchant closes (S0, 2026-08-25,
 * docs/PLAN-remove-weapons.md §5). A full rack pays 33,300 coins and 1,030 Bone
 * Dust, which makes this the LARGEST SINGLE PAYOUT the app has ever made, and it
 * runs on BOOT. A refund that re-runs on every boot, restore, reinstall or
 * second tab is a coin printer, and worse than no refund at all.
 *
 * Rewarded-actions SOP rule 5: PROVE the second attempt pays nothing. Not by
 * reading the guard, by driving the action and measuring the balances either
 * side.
 *
 *   PAYS      a real rack (all twelve bought weapons) is settled: coins go up by
 *             exactly 33,300, dust by exactly 1,030, and the receipt lands.
 *   ROWS      the inventory rows are STILL THERE afterwards. Additive-only data
 *             rules: this refunds a purchase, it does not delete what somebody
 *             owns. §8 of the plan is explicit about it.
 *   ONCE      the same call again moves coins by 0 and dust by 0.
 *   BOOT      a real page reload, which is the path this actually runs on, moves
 *             both by 0.
 *   RACE      three calls fired at the same instant pay exactly one refund
 *             between them. A kvGet/kvSet version of this exact claim was once
 *             measured paying 16,500 coins to three concurrent callers, which is
 *             why the claim is db.addIfAbsent and why this row exists.
 *   PARTIAL   a player holding two weapons is paid for two, not for twelve, and
 *             a duplicated inv row for one weapon is still paid once.
 *   NOTHING   a save that never bought a weapon is not paid and does not burn
 *             the ledger row, so a save restored from backup can still settle.
 *
 * WHY IT CANNOT PASS VACUOUSLY. "The second run paid 0" is trivially true if the
 * FIRST run also paid 0, which is what a wrong kv key, an empty seed or a
 * mis-parsed inv row all look like. So every ONCE row is gated on a PAYS row
 * that asserts a specific NON-ZERO number first, and the seeded inventory is
 * read back out of IndexedDB before anything is graded.
 *
 * Self-serves this checkout when given no URL: boot()'s default is PRODUCTION.
 *
 * Usage: node tests/merchant-retire-audit.mjs [url]
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

const FULL_RACK_COINS = 33300;
const FULL_RACK_DUST = 1030;

/* Seed a save that bought `ids`. The rows are the exact shape buyWeapon wrote:
   kind 'weapon', a weaponId, source 'shop'. */
const seedWeapons = ids => page.evaluate(async (weaponIds) => {
  const db = await import('./js/db.js');
  for (const r of await db.db.all('inv')) if (r.kind === 'weapon') await db.db.del('inv', r.id);
  for (const w of weaponIds) {
    await db.db.put('inv', { id: 'wpn-' + w + '-' + Math.random().toString(36).slice(2),
      kind: 'weapon', weaponId: w, source: 'shop', ts: Date.now() });
  }
  await db.kvSet('coins', 1000);
  await db.kvSet('bonedust', 50);
  await db.db.del('kv', 'merchant-retired');
}, ids);

const snap = () => page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const db = await import('./js/db.js');
  const inv = await db.db.all('inv');
  return {
    coins: await loot.coins(),
    dust: await loot.boneDust(),
    weaponRows: inv.filter(r => r.kind === 'weapon').length,
    weaponIds: inv.filter(r => r.kind === 'weapon').map(r => r.weaponId).sort(),
    ledger: await db.kvGet('merchant-retired', null),
  };
});

const runRetire = () => page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const r = await loot.retireMerchantIfNeeded();
  return r ? { paid: true, ...r } : { paid: false };
});

/* A SUITE THAT DIES READS LIKE A FLAKE, so the export is GRADED, not assumed. */
const exists = await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  return typeof loot.retireMerchantIfNeeded === 'function' && !!loot.MERCHANT_REFUND;
});
check('SETUP js/loot.js exports retireMerchantIfNeeded and MERCHANT_REFUND', exists);
if (!exists) {
  console.log('\n1 FAILED');
  await browser.close(); server?.close();
  process.exit(1);
}

/* THE PRICE TABLE IS THE RECEIPT. Read it out of the running module rather than
   trusting the constant above, and prove the sample is not empty. */
const table = await page.evaluate(async () => (await import('./js/loot.js')).MERCHANT_REFUND);
const ALL = Object.keys(table);
check('SETUP the refund table covers all twelve weapons the merchant sold', ALL.length === 12, `${ALL.length}: ${ALL.join(', ')}`);
const tableCoins = ALL.reduce((a, k) => a + table[k].coins, 0);
const tableDust = ALL.reduce((a, k) => a + (table[k].dust || 0), 0);
check('SETUP the table totals the full rack: 33,300 coins and 1,030 dust',
  tableCoins === FULL_RACK_COINS && tableDust === FULL_RACK_DUST, `${tableCoins} coins, ${tableDust} dust`);

/* --------------------------- PAYS: the full rack --------------------------- */
await seedWeapons(ALL);
const before = await snap();
check('SETUP the save under test really holds twelve bought weapons',
  before.weaponRows === 12, `${before.weaponRows} rows`);
check('SETUP the ledger row starts empty, so this is a first settlement', before.ledger === null, JSON.stringify(before.ledger));

const first = await runRetire();
const afterFirst = await snap();
const coinsPaid = afterFirst.coins - before.coins;
const dustPaid = afterFirst.dust - before.dust;
check('PAYS the settlement ran and returned a receipt', first.paid === true, JSON.stringify(first));
check('PAYS coins go up by exactly the listed price of all twelve (33,300)',
  coinsPaid === FULL_RACK_COINS, `+${coinsPaid}`);
check('PAYS Bone Dust goes up by exactly the three prestige weapons (350 + 350 + 330)',
  dustPaid === FULL_RACK_DUST, `+${dustPaid}`);
check('PAYS the receipt records what was paid, so a revival can read it instead of guessing',
  afterFirst.ledger && afterFirst.ledger.coins === FULL_RACK_COINS
    && afterFirst.ledger.dust === FULL_RACK_DUST && afterFirst.ledger.weapons.length === 12,
  JSON.stringify(afterFirst.ledger));

/* ------------ ROWS: nobody's inventory is deleted, ever (plan §8) ------------ */
check('ROWS all twelve inventory rows survive the refund: this withdraws a purchase, it does not delete what you own',
  afterFirst.weaponRows === 12, `${afterFirst.weaponRows} rows left`);

/* THE GATE ON EVERY ROW BELOW. */
const paidSomething = coinsPaid === FULL_RACK_COINS && dustPaid === FULL_RACK_DUST;
check('SETUP the first settlement really paid, so the no-op rows below are not vacuous',
  paidSomething, `coins +${coinsPaid}, dust +${dustPaid}`);

/* --------------------------- ONCE: the second call -------------------------- */
const second = await runRetire();
const afterSecond = await snap();
check('ONCE the second call returns no receipt at all', second.paid === false, JSON.stringify(second));
check('ONCE the second call moves the coin balance by 0',
  afterSecond.coins - afterFirst.coins === 0, `+${afterSecond.coins - afterFirst.coins}`);
check('ONCE the second call moves the Bone Dust balance by 0',
  afterSecond.dust - afterFirst.dust === 0, `+${afterSecond.dust - afterFirst.dust}`);
check('ONCE ten more calls in a row still pay nothing',
  await (async () => {
    const c0 = afterSecond.coins, d0 = afterSecond.dust;
    for (let i = 0; i < 10; i++) await runRetire();
    const s = await snap();
    return s.coins === c0 && s.dust === d0;
  })(), 'ten repeats');

/* ------------------------ BOOT: the path it really runs on ------------------ */
const beforeBoot = await snap();
await page.reload({ waitUntil: 'networkidle2' });
await sleep(6000);
const afterBoot = await snap();
check('BOOT a real page reload, which is where this actually runs, pays no coins',
  afterBoot.coins - beforeBoot.coins === 0, `+${afterBoot.coins - beforeBoot.coins}`);
check('BOOT the reload paid no Bone Dust either',
  afterBoot.dust - beforeBoot.dust === 0, `+${afterBoot.dust - beforeBoot.dust}`);

/* ------------- RACE: three callers at the same instant, one refund ----------- */
await seedWeapons(ALL);
const beforeRace = await snap();
check('SETUP the race starts from an unsettled save again',
  beforeRace.weaponRows === 12 && beforeRace.ledger === null,
  JSON.stringify({ rows: beforeRace.weaponRows, ledger: beforeRace.ledger }));
const race = await page.evaluate(async () => {
  const loot = await import('./js/loot.js');
  const rs = await Promise.all([loot.retireMerchantIfNeeded(), loot.retireMerchantIfNeeded(), loot.retireMerchantIfNeeded()]);
  return rs.map(r => (r ? r.coins : null));
});
const afterRace = await snap();
check('RACE exactly one of three concurrent callers gets a receipt',
  race.filter(x => x !== null).length === 1, JSON.stringify(race));
check('RACE the coin balance moved by ONE refund, not three',
  afterRace.coins - beforeRace.coins === FULL_RACK_COINS, `+${afterRace.coins - beforeRace.coins}`);
check('RACE the dust balance moved by ONE refund, not three',
  afterRace.dust - beforeRace.dust === FULL_RACK_DUST, `+${afterRace.dust - beforeRace.dust}`);

/* ------------- PARTIAL: two weapons, and a duplicated row for one ------------ */
await seedWeapons(['rapier', 'warmaul', 'warmaul']);
const beforePart = await snap();
check('SETUP the partial save holds three rows for two distinct weapons',
  beforePart.weaponRows === 3, `${beforePart.weaponRows} rows: ${beforePart.weaponIds.join(', ')}`);
const part = await runRetire();
const afterPart = await snap();
check('PARTIAL a player who bought two weapons is paid for two, not for the rack (500 + 6000)',
  afterPart.coins - beforePart.coins === 6500, `+${afterPart.coins - beforePart.coins}`);
check('PARTIAL a duplicated inventory row is still paid ONCE: 350 dust, not 700',
  afterPart.dust - beforePart.dust === 350, `+${afterPart.dust - beforePart.dust}`);
check('PARTIAL the receipt names the two weapons it settled', part.paid === true && part.weapons.length === 2,
  JSON.stringify(part.weapons));

/* ----------------- NOTHING: a save that never bought anything ---------------- */
await seedWeapons([]);
const beforeNil = await snap();
check('SETUP the empty save really holds no weapons', beforeNil.weaponRows === 0, `${beforeNil.weaponRows} rows`);
const nil = await runRetire();
const afterNil = await snap();
check('NOTHING a player who never bought a weapon is not paid',
  nil.paid === false && afterNil.coins === beforeNil.coins && afterNil.dust === beforeNil.dust,
  `${JSON.stringify(nil)} coins ${beforeNil.coins} -> ${afterNil.coins}, dust ${beforeNil.dust} -> ${afterNil.dust}`);
check('NOTHING and the ledger row is left unburned, so a save restored from cloud backup can still be settled',
  afterNil.ledger === null, JSON.stringify(afterNil.ledger));

/* --------- BONECRUSHER: the Champion prize was never bought, never owed ------- */
await seedWeapons([]);
await page.evaluate(async () => {
  const db = await import('./js/db.js');
  await db.db.put('inv', { id: 'wpn-bc', kind: 'weapon', weaponId: 'bonecrusher', source: 'pit-champion', ts: Date.now() });
});
const beforeBc = await snap();
const bc = await runRetire();
const afterBc = await snap();
check('PRIZE a Bonecrusher won from the Champion pays nothing: it was never for sale',
  bc.paid === false && afterBc.coins === beforeBc.coins, `${JSON.stringify(bc)} coins ${beforeBc.coins} -> ${afterBc.coins}`);
check('PRIZE and the row it lives on is still there', afterBc.weaponRows === 1, `${afterBc.weaponRows} rows`);

check('NO page errors during the run', errors.length === 0, errors.join(' | '));

await browser.close();
server?.close();
console.log(bad ? `\n${bad} FAILED` : '\nTHE MERCHANT REFUND PAYS EXACTLY ONCE');
process.exit(bad ? 1 : 0);
