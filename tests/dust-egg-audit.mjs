/* tests/dust-egg-audit.mjs — THE DUST EGG: PRICE, BOUND, RACE, AND A REFUSED WRITE.
 *
 * WHY THIS EXISTS. Tom ruled on 2026-08-31 that the dust shop egg (removed with
 * S0, commit 23de102b) was removed unintentionally: dust is the deterministic
 * hatch route for a player who cannot walk the step milestones. buyDustEgg in
 * js/loot.js restores it at the historical price (60 dust) with a NEW bound of
 * one per ISO week (the old cell was unbounded, which predates the exploit
 * sweeps). This file is the teeth on all three numbers, in the shape
 * purchase-write-failure-audit.mjs proved out for the rack:
 *
 *   PRICE      a real purchase through the real function charges exactly 60
 *              dust and lands exactly one egg inv row. Driven three-way
 *              concurrently, because sequential-only is how the garden refund
 *              printed 16,500 coins: exactly ONE of three overlapping callers
 *              is told yes, and the wallet falls by exactly one price.
 *   BOUND      a second attempt in the same week returns reason 'limit',
 *              deducts nothing and grants nothing. The bound IS the receipt:
 *              db.addIfAbsent on kv dustegg:<isoWeek>.
 *   FAILURE    the grant's own write is made to reject (the same rejection
 *              quota, abort and the wipe freeze produce), through the REAL
 *              function with nothing stubbed but that one write. The player is
 *              TOLD (reason 'write'), and the receipt's granted flag is
 *              reopened so the purchase is recoverable.
 *   RECOVER    tapping again hands over the egg that was already paid for and
 *              charges NOTHING the second time. Graded on the INVENTORY, not
 *              the return value, for the same reason the rack's audit is: a
 *              broken recovery also answers 'limit', so only the egg row
 *              separates the two worlds.
 *   CONTROL    every measurement is preceded by a row that fails if it is
 *              looking at nothing. An empty sample is a failure, never a pass.
 *
 * WRITTEN UNDER A NO-RUN RELEASE GATE (2026-08-31): this suite has NOT yet been
 * executed, and its prove-reds have NOT been run. VERIFY.md carries both as the
 * browser pass. The prove-reds to run there, each in a throwaway tree:
 *   1. change DUST_EGG.cost            -> PRICE goes red
 *   2. key the receipt on Date.now()   -> BOUND goes red (every buy is a new key)
 *   3. swap addIfAbsent for kvGet+kvSet -> RACE goes red (three callers all pay)
 *   4. drop the recovery branch (the kvUpdate arm on a lost claim)
 *                                      -> RECOVER goes red
 *   5. move boneDustAdd above the claim -> BOUND still holds but RACE overcharges
 *
 * Usage: node tests/dust-egg-audit.mjs            (serves this tree)
 *        node tests/dust-egg-audit.mjs <base-url>
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, serveTree } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const srv = process.argv[2] ? null : await serveTree(ROOT);
const base = process.argv[2] || srv.url;
console.log(`URL UNDER TEST: ${base}`);
const { browser, page } = await boot(base);

try {
  const r = await page.evaluate(async () => {
    const loot = await import('./js/loot.js');
    const dbmod = await import('./js/db.js');
    const { isoWeekKey } = await import('./js/poi.js');
    const out = {};
    const key = `dustegg:${isoWeekKey(new Date())}`;
    const eggs = async () => (await loot.inventory()).filter(x => x.kind === 'egg').length;

    out.price = loot.DUST_EGG.cost;
    await dbmod.kvSet('bonedust', 1000);
    out.eggs0 = await eggs();
    out.dust0 = await loot.boneDust();

    /* ---- PRICE + RACE: the week's first purchase, three callers at once. ---- */
    const rs = await Promise.all([loot.buyDustEgg(), loot.buyDustEgg(), loot.buyDustEgg()]);
    out.race = { oks: rs.filter(x => x.ok).length, reasons: rs.map(x => x.ok ? 'ok' : x.reason) };
    out.dustAfterRace = await loot.boneDust();
    out.eggsAfterRace = await eggs();
    out.boughtFlag = await loot.dustEggBought();

    /* ---- BOUND: a fourth, sequential attempt in the same week. ---- */
    const again = await loot.buyDustEgg();
    out.again = { ok: !!again.ok, reason: again.reason || null, recovered: !!again.recovered };
    out.dustAfterAgain = await loot.boneDust();
    out.eggsAfterAgain = await eggs();

    /* ---- FAILURE: reset to an unbought week, then make the egg's own inv
       write reject, the way quota does. Nothing else is stubbed: the claim,
       the debit and grantEgg all run for real. ---- */
    await dbmod.db.del('kv', key);
    const realPut = dbmod.db.put;
    dbmod.db.put = (store, val) =>
      (store === 'inv' && val && val.kind === 'egg')
        ? Promise.reject(new Error('QuotaExceededError'))
        : realPut(store, val);
    const beforeFail = await loot.boneDust();
    let bad;
    try { bad = await loot.buyDustEgg(); }
    catch (e) { bad = { ok: false, reason: 'threw', msg: String(e && e.message) }; }
    out.fail = { ok: !!bad.ok, reason: bad.reason || null };
    out.chargedOnFailure = beforeFail - (await loot.boneDust());
    out.eggsAfterFailure = await eggs();
    out.receipt = await dbmod.kvGet(key, null);
    out.boughtFlagAfterFailure = await loot.dustEggBought();

    /* ---- RECOVER: the write works again, the player taps the same cell. ---- */
    dbmod.db.put = realPut;
    const beforeRetry = await loot.boneDust();
    let retry;
    try { retry = await loot.buyDustEgg(); }
    catch (e) { retry = { ok: false, reason: 'threw', msg: String(e && e.message) }; }
    out.retry = { ok: !!retry.ok, reason: retry.reason || null, recovered: !!retry.recovered };
    out.eggsAfterRetry = await eggs();
    out.chargedOnRetry = beforeRetry - (await loot.boneDust());

    /* ---- REFUSED-BROKE: too poor to buy must deduct and grant nothing. ---- */
    await dbmod.db.del('kv', key);
    await dbmod.kvSet('bonedust', out.price - 1);
    const poor = await loot.buyDustEgg();
    out.poor = { ok: !!poor.ok, reason: poor.reason || null, need: poor.need, have: poor.have };
    out.dustAfterPoor = await loot.boneDust();
    out.eggsAfterPoor = await eggs();
    return out;
  });

  /* CONTROL. A run that graded nothing cannot pass. */
  ok('CONTROL the price is the historical 60 and the wallet was seeded', r.price === 60 && r.dust0 === 1000,
    `price=${r.price} dust=${r.dust0}`);

  ok('PRICE exactly one of three concurrent callers buys', r.race.oks === 1, JSON.stringify(r.race));
  ok('PRICE the wallet falls by exactly one price', r.dust0 - r.dustAfterRace === r.price,
    `${r.dust0} -> ${r.dustAfterRace}`);
  ok('PRICE exactly one egg lands', r.eggsAfterRace - r.eggs0 === 1, `${r.eggs0} -> ${r.eggsAfterRace}`);
  ok('PRICE the shop cell reads it as bought (dustEggBought)', r.boughtFlag === true);

  ok('BOUND a second attempt this week is refused by NAME', r.again.ok === false && r.again.reason === 'limit',
    JSON.stringify(r.again));
  ok('BOUND and it deducts nothing', r.dustAfterAgain === r.dustAfterRace, `${r.dustAfterRace} -> ${r.dustAfterAgain}`);
  ok('BOUND and it grants nothing', r.eggsAfterAgain === r.eggsAfterRace);

  /* The situation stated honestly: the money moving is not the defect, what
     happens next is. */
  ok('FAILURE the dust left the wallet when the egg could not write', r.chargedOnFailure === r.price,
    `charged ${r.chargedOnFailure}`);
  ok('FAILURE and no egg was granted', r.eggsAfterFailure === r.eggsAfterAgain);
  ok('FAILURE the player is TOLD rather than the failure vanishing',
    r.fail.ok === false && r.fail.reason === 'write', JSON.stringify(r.fail));
  ok('FAILURE the receipt is down with granted reopened, which is what makes recovery possible',
    !!r.receipt && r.receipt.granted !== true, JSON.stringify(r.receipt));
  ok('FAILURE the cell stays pressable (dustEggBought is false on a stuck week)',
    r.boughtFlagAfterFailure === false);

  /* THE LOAD-BEARING ROWS: graded on the inventory, not the return value. */
  ok('RECOVER tapping again hands over the egg that was already paid for',
    r.eggsAfterRetry - r.eggsAfterFailure === 1, `retry=${JSON.stringify(r.retry)}`);
  ok('RECOVER and it does NOT charge a second time', r.chargedOnRetry === 0,
    `${r.chargedOnRetry} dust taken on the retry`);
  ok('RECOVER it reports as limit rather than a fresh purchase, and flags itself',
    r.retry.ok === false && r.retry.reason === 'limit' && r.retry.recovered === true, JSON.stringify(r.retry));

  ok('BROKE a wallet one dust short is refused by NAME, deducts nothing, grants nothing',
    r.poor.ok === false && r.poor.reason === 'dust' && r.poor.need === r.price
    && r.dustAfterPoor === r.price - 1 && r.eggsAfterPoor === r.eggsAfterRetry,
    JSON.stringify(r.poor));
} finally {
  await browser.close();
  srv?.close?.();
}
console.log(fails ? '\nDUST EGG: FAILED' : '\nDUST EGG: one a week, 60 dust, and a refused write costs nothing permanent');
process.exit(fails);
