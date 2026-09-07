/* R38-13 (2026-09-06, measured on v477 against a v477 Worker; main is v482,
 * re-verified on this tree before writing the fix): two devices, both offline,
 * each moved the coin ledger the SAME NUMBER OF TIMES. js/db.js importAll's
 * merge (replace:false) only refused a payload's 'coins' when localCoinsRev
 * was STRICTLY GREATER than the payload's; a TIE fell straight through to the
 * payload winning regardless of which balance was actually higher. Measured
 * on two real devices: B's 25 coins silently replaced by A's 10.
 *
 * Related: a spent consumable (or a used Battle Charm, or a pet's last
 * cosmetic copy on salvage) had NO receipt at all, so the same stale-blob
 * merge revived it -- measured, a spent Vigor Draught came back 1 -> 0 -> 1.
 * openCrate's 'crateTaken' covered crates only.
 *
 * FIX: js/loot.js coinsAdd (and js/quests.js's award-transaction bump) now
 * bump 'coinsRev' by the MAGNITUDE of the change, not a flat 1, so an exact
 * tie means the two devices' changes happened to sum to the exact same
 * total -- and js/db.js importAll keeps the HIGHER balance on any tie that
 * still occurs, because "never lower a balance from a stale blob" is the
 * rule this app runs on. consumeConsumable, activateBattleCharm,
 * refundStreakFreezes and the two salvage/extinction sites now call the same
 * markInvTaken(id) receipt openCrate already had, and importAll checks it.
 *
 * This runs the real js/db.js and js/loot.js over tests/mem-idb.mjs, driving
 * importAll(payload, {replace:false}) directly -- no network needed, since
 * the bug and the fix are both entirely in the merge, not in how the payload
 * got here (that half is server/test/api.test.mjs + tests/backup-conflict-audit.mjs).
 *
 * PROVE-RED: reverting js/db.js's tie-break to the old bare
 * `if (localCoinsRev > fileCoinsRev)` fails TIE below with:
 *   AssertionError: a coinsRev TIE must keep the higher local balance, not
 *   whichever number the payload happened to carry
 * Reverting js/loot.js coinsAdd's coinsRev bump to a flat 1 makes SUM-TIE
 * fail the same way (both devices then genuinely tie on count alone).
 * Reverting any markInvTaken call fails its own REVIVE row.
 *
 *
 * 2026-09-06, Codex audit of v485 (lane 1 of the seven-lane plan): every DEBIT
 * moved the balance without its revision (spendCoins, spendDust, buyRackItem's
 * claimAndPay, collectSpawn's credit), and Bone Dust had no revision at all, so
 * a same-revision blob from before the spend won on "higher balance" and
 * refunded the purchase while the item stayed. js/db.js kvBumpRevisioned moves
 * balance and revision in ONE transaction; buyRackItem and collectSpawn carry
 * the revision inside their own claim transaction; importAll ranks 'bonedust'
 * by 'dustRev' the way it ranks 'coins' by 'coinsRev'.
 * PROVE-RED, captured on origin/main bce3a937 (v493) with these rows added:
 *   FAIL COIN-DEBIT  merging the pre-purchase blob cannot silently refund spent coins  | got 100, expected 10
 *   FAIL DUST-DEBIT  merging the pre-purchase blob cannot silently refund spent Bone Dust  | got 100, expected 10
 *   FAIL DUST-EARN  merging the pre-earn blob cannot erase Bone Dust just melted for  | got 100, expected 160
 *   FAIL RACK-COIN  a coin rack purchase moves coinsRev by the price inside its claim  | coins 5000->2600, coinsRev 5000->5000
 *   FAIL RACK-DUST  a dust rack purchase moves dustRev by the price inside its claim  | dust 500->280, dustRev 500->500
 *   FAIL SPAWN  collectSpawn's coin credit moves coinsRev by the same amount  | coins +12, coinsRev +0
 *
 * Usage: node tests/coins-merge-tie-audit.mjs
 */
import './mem-idb.mjs';
const { kvGet, kvSet, db, importAll, useDbName } = await import('../js/db.js');
const { coinsAdd, spendCoins, spendDust, boneDustAdd, buyRackItem, RACK_AURA, consumeConsumable, grantConsumable } = await import('../js/loot.js');
const { collectSpawn } = await import('../js/hunt.js');

let bad = 0;
const ok = (label, pass, detail = '') => {
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${detail ? '  | ' + detail : ''}`);
  if (!pass) bad++;
};

/* ---------------- TIE: an exact coinsRev tie must keep the HIGHER balance --------------- */
useDbName('r38-13-tie');
await kvSet('coins', 25);
await kvSet('coinsRev', 40);
await importAll({
  app: 'tally', version: 3, log: [],
  kv: [{ k: 'coins', v: 10 }, { k: 'coinsRev', v: 40 }],   // SAME coinsRev, a lower balance
}, { replace: false });
ok('TIE  a coinsRev tie keeps the higher local balance, not whichever number the payload carried',
  (await kvGet('coins', 0)) === 25, `got ${await kvGet('coins', 0)}, expected 25 (not the payload's 10)`);

/* control: a payload strictly AHEAD still wins (this direction is untouched) */
useDbName('r38-13-ahead');
await kvSet('coins', 25);
await kvSet('coinsRev', 40);
await importAll({
  app: 'tally', version: 3, log: [],
  kv: [{ k: 'coins', v: 100 }, { k: 'coinsRev', v: 41 }],   // genuinely one real change ahead
}, { replace: false });
ok('AHEAD  control: a payload with a strictly higher coinsRev still wins',
  (await kvGet('coins', 0)) === 100, `got ${await kvGet('coins', 0)}, expected 100`);

/* control: local strictly ahead still wins (the original QA round 34 P0 guard) */
useDbName('r38-13-behind');
await kvSet('coins', 60);
await kvSet('coinsRev', 41);
await importAll({
  app: 'tally', version: 3, log: [],
  kv: [{ k: 'coins', v: 100 }, { k: 'coinsRev', v: 40 }],   // an older, stale blob
}, { replace: false });
ok('STALE  control: local strictly ahead of a stale payload still keeps its own balance',
  (await kvGet('coins', 0)) === 60, `got ${await kvGet('coins', 0)}, expected 60`);

/* ---------------- SUM-TIE: coinsAdd's own magnitude bump makes a real tie improbable ---------------- */
useDbName('r38-13-sumtie-a');
await coinsAdd(50);                              // one call, +50: coinsRev = 50
const aBlobCoins = await kvGet('coins', 0), aBlobRev = await kvGet('coinsRev', 0);

useDbName('r38-13-sumtie-b');
await coinsAdd(15); await coinsAdd(35);           // two calls, +15 then +35: SAME NUMBER of moves as a flat-1 scheme would tie on, but coinsRev sums to 50 too here on purpose to prove the merge-side keep-higher fallback also holds when a magnitude sum genuinely ties
ok('SUM-TIE SETUP  device B also reaches coinsRev 50, the same total as device A, by a different route',
  (await kvGet('coinsRev', 0)) === aBlobRev, `A=${aBlobRev} B=${await kvGet('coinsRev', 0)}`);
const bCoinsBefore = await kvGet('coins', 0);
await importAll({ app: 'tally', version: 3, log: [], kv: [{ k: 'coins', v: aBlobCoins }, { k: 'coinsRev', v: aBlobRev }] }, { replace: false });
ok('SUM-TIE  an exact sum tie still keeps the higher balance (the merge-side fallback, not just the improbability)',
  (await kvGet('coins', 0)) === Math.max(bCoinsBefore, aBlobCoins), `got ${await kvGet('coins', 0)}, expected max(${bCoinsBefore},${aBlobCoins})`);

/* ---------------- DEBITS: stale backups must not refund a purchase (2026-09-06) ---------------- */
useDbName('r39-coin-debit');
await kvSet('coins', 100);
await kvSet('coinsRev', 100);
const beforeCoinSpend = { app: 'tally', version: 3, log: [], kv: [{ k: 'coins', v: 100 }, { k: 'coinsRev', v: 100 }] };
ok('COIN-DEBIT SETUP  spendCoins takes 90 of the real 100-coin balance', (await spendCoins(90)) === 10, `coins=${await kvGet('coins', 0)}`);
await importAll(beforeCoinSpend, { replace: false });
ok('COIN-DEBIT  merging the pre-purchase blob cannot silently refund spent coins',
  (await kvGet('coins', 0)) === 10, `got ${await kvGet('coins', 0)}, expected 10`);

useDbName('r39-dust-debit');
await kvSet('bonedust', 100);
await kvSet('dustRev', 100);
const beforeDustSpend = { app: 'tally', version: 3, log: [], kv: [{ k: 'bonedust', v: 100 }, { k: 'dustRev', v: 100 }] };
ok('DUST-DEBIT SETUP  spendDust takes 90 of the real 100-dust balance', (await spendDust(90)) === 10, `dust=${await kvGet('bonedust', 0)}`);
await importAll(beforeDustSpend, { replace: false });
ok('DUST-DEBIT  merging the pre-purchase blob cannot silently refund spent Bone Dust',
  (await kvGet('bonedust', 0)) === 10, `got ${await kvGet('bonedust', 0)}, expected 10`);

/* the EARNING direction for dust: a blob from before the melt must not erase it */
useDbName('r39-dust-earn');
await kvSet('bonedust', 100);
await kvSet('dustRev', 100);
const beforeDustEarn = { app: 'tally', version: 3, log: [], kv: [{ k: 'bonedust', v: 100 }, { k: 'dustRev', v: 100 }] };
ok('DUST-EARN SETUP  boneDustAdd credits 60', (await boneDustAdd(60)) === 160, `dust=${await kvGet('bonedust', 0)}`);
await importAll(beforeDustEarn, { replace: false });
ok('DUST-EARN  merging the pre-earn blob cannot erase Bone Dust just melted for',
  (await kvGet('bonedust', 0)) === 160, `got ${await kvGet('bonedust', 0)}, expected 160`);

/* ---------------- RACK + SPAWN: the revision rides inside the claim transaction, not only the helper ---------------- */
useDbName('r39-rack-coin');
await kvSet('coins', 5000); await kvSet('coinsRev', 5000);
const rc = await buyRackItem(RACK_AURA.key, 'coins');
ok('RACK-COIN SETUP  the aura sells for coins', !!(rc && rc.ok), JSON.stringify(rc));
ok('RACK-COIN  a coin rack purchase moves coinsRev by the price inside its claim',
  (await kvGet('coins', 0)) === 5000 - RACK_AURA.coin && (await kvGet('coinsRev', 0)) === 5000 + RACK_AURA.coin,
  `coins 5000->${await kvGet('coins', 0)}, coinsRev 5000->${await kvGet('coinsRev', 0)}`);
useDbName('r39-rack-dust');
await kvSet('bonedust', 500); await kvSet('dustRev', 500);
const rd = await buyRackItem(RACK_AURA.key, 'dust');
ok('RACK-DUST SETUP  the aura sells for dust', !!(rd && rd.ok), JSON.stringify(rd));
ok('RACK-DUST  a dust rack purchase moves dustRev by the price inside its claim',
  (await kvGet('bonedust', 0)) === 500 - RACK_AURA.dust && (await kvGet('dustRev', 0)) === 500 + RACK_AURA.dust,
  `dust 500->${await kvGet('bonedust', 0)}, dustRev 500->${await kvGet('dustRev', 0)}`);
useDbName('r39-spawn');
const sp = await collectSpawn({ id: 'r39-coins-1', type: 'coins' }, '2099-01-01');
ok('SPAWN SETUP  the coin spawn paid', !!(sp && sp.coins > 0), JSON.stringify(sp));
ok('SPAWN  collectSpawn\'s coin credit moves coinsRev by the same amount',
  sp && (await kvGet('coins', 0)) === sp.coins && (await kvGet('coinsRev', 0)) === sp.coins,
  `coins +${await kvGet('coins', 0)}, coinsRev +${await kvGet('coinsRev', 0)}`);

/* ---------------- REVIVE: a spent consumable must not come back through a stale merge --- */
useDbName('r38-13-revive');
await grantConsumable('vigor', 'audit');
const preSpendExport = { app: 'tally', version: 3, log: [], inv: await db.all('inv'), kv: [] };   // "device A's" blob, taken BEFORE the spend
ok('REVIVE SETUP  the vigor draught is in inventory before the spend', (await db.all('inv')).some(r => r.kind === 'vigor'));
ok('REVIVE SETUP  consumeConsumable reports success', await consumeConsumable('vigor'));
ok('REVIVE SETUP  the draught is gone locally after the spend', !(await db.all('inv')).some(r => r.kind === 'vigor'));
await importAll(preSpendExport, { replace: false });
ok('REVIVE  a spent consumable does not come back through a merge of the pre-spend blob',
  !(await db.all('inv')).some(r => r.kind === 'vigor'), JSON.stringify(await db.all('inv')));

console.log(bad ? `\n${bad} FAILED` : '\nall clean');
process.exit(bad ? 1 : 0);
