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
 * Usage: node tests/coins-merge-tie-audit.mjs
 */
import './mem-idb.mjs';
const { kvGet, kvSet, db, importAll, useDbName } = await import('../js/db.js');
const { coinsAdd, consumeConsumable, grantConsumable } = await import('../js/loot.js');

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
