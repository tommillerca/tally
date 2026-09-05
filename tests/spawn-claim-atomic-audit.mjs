/* A BONEYARD CLAIM WITHOUT ITS PAYOUT CANNOT EXIST.
 *
 * QA round 28 Y5. `collectSpawn` minted the ledger key `spawn-<date>-<id>` in
 * its own transaction and wrote everything the key bought AFTER it: coins and
 * the crate in js/hunt.js, and then the scavenged ingredient and the feast coin
 * bonus two writes further downstream again, in js/app.js's #mapCollect handler.
 * Kill the process anywhere in that run and the spawn is SPENT with nothing
 * handed over, permanently: the key is minted, so the next tap is correctly
 * refused and there is no way back to the loot.
 *
 * HOW THE KILL IS MODELLED, and it is a real kill rather than a thrown error.
 * The in-memory IndexedDB is wrapped so that the FIRST transaction touching the
 * `xp` store is allowed to commit and every transaction dispatched after it is
 * DEAD: it accepts requests, fires no callbacks and never completes, which is
 * exactly what a killed tab does to the writes queued behind it. The invariant
 * is then read off the DATABASE, not off collectSpawn's return value, because a
 * dead process has no return value.
 *
 * ROWS
 *   CONTROL   with nothing killed, a collect mints the key AND delivers all
 *             four things: XP, coins (feast multiplier applied), the crate row,
 *             the ingredient. Non-zero by assertion: an empty payout would let
 *             every KILL row below pass by delivering nothing twice.
 *   KILL      with the death armed, for each of the four: the ledger key exists
 *             if and only if the payout landed. Either the collect never
 *             happened, or it happened whole.
 *   SPENT     and the harm is named: after the killed collect the key IS
 *             minted, so a second collect on the same spawn pays nothing. That
 *             is what makes a lost payout permanent rather than retryable.
 *
 * CONCURRENCY IS NOT CLAIMED HERE. tests/mem-idb.mjs does not serialise
 * transactions: two overlapping ones both read the committed state and the
 * later commit wins. So this file proves the ORDERING property (nothing is
 * written after the claim) and says nothing about two tabs racing. The race on
 * this same function is graded in a real browser by the `spawn` rows in
 * tests/reward-sop-audit.mjs.
 *
 * PROVE-RED, RUN on a git-archive throwaway of this tree (2026-09-04). The
 * mutation keeps the payout collectSpawn computes and only moves it back OUT of
 * the claim's transaction, which is the shipped shape: awardOnce without `pay`,
 * then kvUpdate coins, db.put inv, kvUpdate ingredients. Every CONTROL row
 * stayed green there, so the mutation is the ordering and nothing else:
 *   FAIL KILL a minted coin claim carries its coins, feast bonus included  +0 coins on a minted claim
 *   FAIL KILL a minted coin claim carries its scavenged ingredient  +0 ingredients, owed 1
 *   FAIL KILL a minted crate claim carries its crate row  +0 inv rows on a minted claim
 *   FAIL KILL a minted crate claim carries its scavenged ingredient  +0 ingredients, owed 1
 *   SPAWN CLAIM ATOMICITY FAILED (4)
 *
 * PURE: node only, no browser, under a second.
 *     node tests/spawn-claim-atomic-audit.mjs
 */
import './mem-idb.mjs';   // installs globalThis.indexedDB before js/db.js opens it

/* ---- the kill: wrap the store BEFORE js/db.js ever calls open() ---- */
const raw = globalThis.indexedDB;
let armed = false;   // arm the death: the next `xp` transaction is the last one
let dead = false;
const DEAD_REQ = () => ({ onsuccess: null, onerror: null, result: undefined, error: null });
const DEAD_STORE = { get: DEAD_REQ, getAll: DEAD_REQ, count: DEAD_REQ, put: DEAD_REQ, add: DEAD_REQ, delete: DEAD_REQ, clear: DEAD_REQ, index: () => ({ getAll: DEAD_REQ }) };
const DEAD_TX = () => ({ objectStore: () => DEAD_STORE, abort() {}, error: null });
globalThis.indexedDB = {
  open(...a) {
    const req = raw.open(...a);
    let user = null;
    Object.defineProperty(req, 'onsuccess', {
      configurable: true,
      get: () => user,
      set: fn => {
        user = e => {
          const h = req.result;
          if (h && !h.__killWrapped) {
            h.__killWrapped = true;
            const realTx = h.transaction.bind(h);
            h.transaction = (stores, mode) => {
              if (dead) return DEAD_TX();
              const t = realTx(stores, mode);
              if (!armed || ![].concat(stores).includes('xp')) return t;
              let oc = null;   // let THIS one land, then the process is gone
              Object.defineProperty(t, 'oncomplete', {
                configurable: true,
                get: () => oc,
                set: g => { oc = ev => { dead = true; g(ev); }; },
              });
              return t;
            };
          }
          fn(e);
        };
      },
    });
    return req;
  },
};

const { kvGet, kvSet, useDbName, db } = await import('../js/db.js');
const hunt = await import('../js/hunt.js');
const cooking = await import('../js/cooking.js');
useDbName('spawn-claim-atomic-audit');

let fails = 0;
const ok = (m, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${m}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

const DATE = '2099-03-04';
const FEAST = 1.5;   // a live "coins" food buff, so the feast bonus is exercised
const snap = async () => ({
  coins: (await kvGet('coins', 0)) || 0,
  ing: { ...((await kvGet('ingredients', {})) || {}) },
  inv: (await db.all('inv')).length,
  keys: (await db.all('xp')).map(r => r.key),
});
const ingTotal = s => Object.values(s.ing).reduce((a, n) => a + n, 0);

/* Spawn ids whose deterministic ingredient roll actually carries food: about
   four in five 'coins' and 'crate' spawns carry NONE (cooking.js SPAWN_FOOD),
   and a guard seeded with one of those would grade the ingredient half against
   zero. `nth` walks past the ones already used, so every row gets a fresh
   spawn and no two share a ledger key. */
function spawnCarryingFood(type, nth = 0) {
  let seen = 0;
  for (let i = 0; i < 2000; i++) {
    const s = { id: `y5-${type}-${i}`, type };
    if (cooking.spawnIngredient(s).n > 0 && seen++ === nth) return s;
  }
  throw new Error(`no ${type} spawn #${nth} carrying food in 2000 ids`);
}

const COINS = spawnCarryingFood('coins');    // pays coins + XP + an ingredient
const CRATE = spawnCarryingFood('crate');    // pays a crate row + XP + an ingredient

await kvSet('foodbuffs', [{ kind: 'coins', pct: FEAST - 1, untilMs: Date.now() + 3600e3 }]);
ok('SETUP the feast buff is live, so the coin half includes the bonus Y5 names',
  (await cooking.foodCoinMult()) === FEAST, `x${await cooking.foodCoinMult()}`);

/* ------------------------------- CONTROL ---------------------------------- */
const c0 = await snap();
const gotCoins = await hunt.collectSpawn(COINS, DATE);
const gotCrate = await hunt.collectSpawn(CRATE, DATE);
const c1 = await snap();
ok('CONTROL both collects were paid, so there is a real payout to grade',
  !!gotCoins && !!gotCrate, JSON.stringify({ coins: gotCoins, crate: gotCrate }));
ok('CONTROL the coin spawn paid its coins WITH the feast multiplier applied',
  c1.coins - c0.coins === Math.round(12 * FEAST), `+${c1.coins - c0.coins} coins`);
ok('CONTROL the crate spawn left an inventory row', c1.inv - c0.inv === 1, `+${c1.inv - c0.inv} inv rows`);
ok('CONTROL both spawns paid their scavenged ingredient',
  ingTotal(c1) - ingTotal(c0) === gotCoins.ing.n + gotCrate.ing.n,
  `+${ingTotal(c1) - ingTotal(c0)} ingredients, expected ${gotCoins.ing.n + gotCrate.ing.n}`);
ok('CONTROL both ledger keys were minted',
  c1.keys.includes(hunt.spawnKey(DATE, COINS)) && c1.keys.includes(hunt.spawnKey(DATE, CRATE)),
  c1.keys.join(', '));

/* --------------------------------- KILL ----------------------------------- */
/* Fresh spawns, and the death armed: the transaction that touches `xp` is the
   last one this process gets. Nothing is awaited to completion on purpose, a
   killed process never resolves; the state is read straight out of the store. */
const KCOINS = spawnCarryingFood('coins', 1);
const KCRATE = spawnCarryingFood('crate', 1);

async function killedCollect(spawn) {
  const before = await snap();
  armed = true; dead = false;
  await Promise.race([
    hunt.collectSpawn(spawn, DATE).catch(() => null),
    new Promise(r => setTimeout(r, 150)),
  ]);
  armed = false; dead = false;   // the "process" is restarted for the read-back
  const after = await snap();
  return { before, after };
}

const kc = await killedCollect(KCOINS);
const kcKey = hunt.spawnKey(DATE, KCOINS);
const kcClaimed = kc.after.keys.includes(kcKey);
const kcIng = cooking.spawnIngredient(KCOINS);
ok('CONTROL the kill actually reached the claim (an unclaimed sample proves nothing)',
  kcClaimed, `key ${kcKey} ${kcClaimed ? 'minted' : 'ABSENT'}`);
ok('KILL a minted coin claim carries its coins, feast bonus included',
  !kcClaimed || kc.after.coins - kc.before.coins === Math.round(12 * FEAST),
  `+${kc.after.coins - kc.before.coins} coins on a ${kcClaimed ? 'minted' : 'unminted'} claim`);
ok('KILL a minted coin claim carries its scavenged ingredient',
  !kcClaimed || ingTotal(kc.after) - ingTotal(kc.before) === kcIng.n,
  `+${ingTotal(kc.after) - ingTotal(kc.before)} ingredients, owed ${kcIng.n}`);

const kr = await killedCollect(KCRATE);
const krKey = hunt.spawnKey(DATE, KCRATE);
const krClaimed = kr.after.keys.includes(krKey);
const krIng = cooking.spawnIngredient(KCRATE);
ok('CONTROL the crate kill reached the claim too', krClaimed, `key ${krKey} ${krClaimed ? 'minted' : 'ABSENT'}`);
ok('KILL a minted crate claim carries its crate row',
  !krClaimed || kr.after.inv - kr.before.inv === 1,
  `+${kr.after.inv - kr.before.inv} inv rows on a ${krClaimed ? 'minted' : 'unminted'} claim`);
ok('KILL a minted crate claim carries its scavenged ingredient',
  !krClaimed || ingTotal(kr.after) - ingTotal(kr.before) === krIng.n,
  `+${ingTotal(kr.after) - ingTotal(kr.before)} ingredients, owed ${krIng.n}`);

/* -------------------------------- SPENT ----------------------------------- */
/* Why the rows above are worth a file: the loss is not retryable. */
const retry = await hunt.collectSpawn(KCOINS, DATE);
ok('SPENT a killed collect has really spent the spawn: the retry is refused',
  retry === null, JSON.stringify(retry));

console.log(`\n${fails ? `SPAWN CLAIM ATOMICITY FAILED (${fails})` : 'SPAWN CLAIM ATOMICITY VERIFIED'}`);
process.exit(fails ? 1 : 0);

