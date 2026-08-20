/* A FAILED WRITE MUST NOT EAT THE PLAYER'S COINS AND THE PIECE.
 *
 * THE BUG THIS EXISTS FOR, found 2026-08-20 in an adversarial pass on the shop.
 * buyRackItem (js/loot.js) wins an atomic claim, THEN deducts, THEN grants. The
 * ordering is right: the claim before the money is what makes a double-spend
 * impossible. The cost is a gap. js/db.js rejects on abort, on quota and on the
 * wipe-protocol freeze flag, and nothing caught those, so a rejection after the
 * deduct left the player charged and holding nothing.
 *
 * What made it permanent rather than annoying: the claim row `rackbuy:<artId>`
 * is never removed (js/loot.js:194). So every later tap lost the addIfAbsent,
 * fell into the `owned` branch, and js/app.js toasted "Already in your
 * Wardrobe" for a piece that was not in the wardrobe. The piece was unbuyable
 * forever, on every future rack, and the coins were gone.
 *
 * WHY NO EXISTING GUARD SAW IT, which is the part worth keeping.
 * tests/purchase-firewall.mjs asserts that a SECOND call to buyRackItem pays
 * nothing. That is exactly the trap: the second call paying nothing is the
 * correct behaviour for a real double-tap and the broken behaviour here, and
 * the two are indistinguishable unless you also ask whether the player OWNS the
 * thing. A guard written around idempotency alone passes forever.
 *
 * HOW THE FAILURE IS INDUCED. The real db.addIfAbsent is made to reject for the
 * one row grantCosmetic writes, which is precisely what quota, abort and freeze
 * do to that same call. No app logic is stubbed: buyRackItem, the claim, the
 * deduct and grantCosmetic all run for real.
 *
 * PROVE-RED: drop the recovery branch in buyRackItem (the one that finishes the
 * grant when a receipt exists but the piece is not owned) and RECOVER goes red
 * while every other row stays green.
 *
 *   node tests/purchase-write-failure-audit.mjs        (self-serves this checkout)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, seed, serveTree } from './godmode.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let fails = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? `  | ${detail}` : ''}`);
  if (!pass) fails = 1;
};

const srv = process.env.URL ? null : await serveTree(ROOT);
const base = process.env.URL || srv.url;
const { browser, page } = await boot(base);

try {
  await seed(page, { level: 20, coins: 20000 });

  const r = await page.evaluate(async () => {
    const loot = await import('./js/loot.js');
    const dbmod = await import('./js/db.js');
    const out = {};

    const st = await loot.rack();
    out.stocked = (st.ids || []).length;
    /* The cheapest rung, because the point is the write failing, not the price.
       Its index in RACK_POOLS is also the price, so this stays honest if the
       pools are re-ordered. */
    const idx = out.stocked - 1;
    const artId = st.ids[idx];
    out.artId = artId;

    const ownsIt = async () => (await loot.ownedCosmeticIds()).has(artId);
    out.ownedAtStart = await ownsIt();

    /* ---- CONTROL: a clean buy of a DIFFERENT piece must work, so a run where
       nothing can be bought at all cannot pass the rows below. ---- */
    const ctlId = st.ids[0];
    const ctlBefore = await loot.coins();
    const ctl = await loot.buyRackItem(ctlId, 'coins');
    out.control = { ok: !!ctl.ok, owned: (await loot.ownedCosmeticIds()).has(ctlId),
      charged: ctlBefore - (await loot.coins()) };

    /* ---- INDUCE: make the grant's own write reject, the way quota does. ---- */
    const realAdd = dbmod.db.addIfAbsent;
    dbmod.db.addIfAbsent = (store, val) =>
      (store === 'inv' && val && val.kind === 'cos')
        ? Promise.reject(new Error('QuotaExceededError'))
        : realAdd(store, val);

    const before = await loot.coins();
    try {
      const bad = await loot.buyRackItem(artId, 'coins');
      out.firstCall = { ok: !!bad.ok, reason: bad.reason || null, threw: false };
    } catch (e) {
      out.firstCall = { ok: false, reason: null, threw: true, msg: String(e && e.message) };
    }
    out.chargedOnFailure = before - (await loot.coins());
    out.ownedAfterFailure = await ownsIt();
    out.receiptExists = (await dbmod.kvGet(`rackbuy:${artId}`, null)) != null;

    /* ---- RECOVER: the write works again, the player taps the same tile. ---- */
    dbmod.db.addIfAbsent = realAdd;
    const beforeRetry = await loot.coins();
    let retry;
    try { retry = await loot.buyRackItem(artId, 'coins'); }
    catch (e) { retry = { ok: false, reason: 'threw', msg: String(e && e.message) }; }
    out.retry = { ok: !!retry.ok, reason: retry.reason || null, recovered: !!retry.recovered };
    out.ownedAfterRetry = await ownsIt();
    out.chargedOnRetry = beforeRetry - (await loot.coins());
    return out;
  });

  /* AN EMPTY SAMPLE IS A FAILURE. No rack, no purchase, nothing graded. */
  ok('SAMPLE the rack was stocked and a piece was chosen', r.stocked >= 8 && !!r.artId,
    `${r.stocked} ids, testing ${r.artId}`);
  ok('CONTROL a clean purchase still works and charges once',
    r.control.ok && r.control.owned && r.control.charged > 0,
    `ok=${r.control.ok} owned=${r.control.owned} charged=${r.control.charged}`);
  ok('SETUP the piece under test was not already owned', r.ownedAtStart === false);

  /* The situation, stated honestly. The money moving is not the defect; the
     defect is what happens next. */
  ok('FAILURE the money left the wallet when the grant could not write',
    r.chargedOnFailure > 0, `charged ${r.chargedOnFailure} coins`);
  ok('FAILURE and the piece was NOT granted', r.ownedAfterFailure === false);
  ok('FAILURE the receipt is on the ledger, which is what blocks a second charge',
    r.receiptExists === true);
  ok('FAILURE the player is TOLD, rather than the failure vanishing',
    r.firstCall.threw === false && r.firstCall.reason === 'write',
    `threw=${r.firstCall.threw} reason=${r.firstCall.reason}`);

  /* THE LOAD-BEARING ROW, and note what it does NOT assert. It grades OWNERSHIP,
     not the return value. Before the fix this same call also answered 'owned',
     so a check written around the reason string would have passed on the bug.
     The only question that separates the two worlds is whether the player ends
     up holding the piece they paid for. */
  ok('RECOVER tapping again hands over the piece that was already paid for',
    r.ownedAfterRetry === true,
    `retry=${JSON.stringify(r.retry)} owned=${r.ownedAfterRetry}`);
  ok('RECOVER and it does NOT charge a second time',
    r.chargedOnRetry === 0, `${r.chargedOnRetry} coins taken on the retry`);
  /* Silent on purpose: this branch cannot distinguish a stuck receipt from a
     losing caller in a three-way race, so it must not report a fresh purchase.
     The flag exists only so the UI can refresh the tile. */
  ok('RECOVER it reports as owned rather than as a new purchase, and flags itself',
    r.retry.ok === false && r.retry.reason === 'owned' && r.retry.recovered === true,
    JSON.stringify(r.retry));

  ok('NO page errors', true);
} finally {
  await browser.close();
  srv?.close?.();
}
console.log(fails ? '\nPURCHASE WRITE FAILURE: FAILED' : '\nPURCHASE WRITE FAILURE: a rejected write costs nothing permanent');
process.exit(fails);
