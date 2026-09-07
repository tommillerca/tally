/* A CONSUMED INVENTORY ROW STAYS CONSUMED, THROUGH ANY MERGE AND ANY CRASH.
 *
 * 2026-09-06, Codex audit of v485 (lane 3 of the seven-lane plan). Two defects
 * in the take receipts js/db.js importAll reads before re-adding an 'inv' row a
 * stale blob still carries:
 *
 *   THE RING. 'invTaken' (consumables, Battle Charms, a pet's last cosmetic
 *   copy) and 'crateTaken' (openCrate) each kept only the newest 500 ids
 *   (`.slice(-500)`). Consume item 501 and item 1 falls off the list, so the
 *   next merge of a blob old enough to still carry item 1 puts it straight
 *   back. The changelog copy said "never comes back", unconditionally.
 *
 *   THE SPLIT WRITE. The delete (db.del / db.take) and the receipt (a kvUpdate)
 *   were two transactions. A process death between them left the row gone with
 *   no receipt: the item is lost locally AND the next merge revives it, and
 *   nothing on either side can tell the two states apart.
 *
 * The fix is one helper, db.takeInv: the delete and the receipt in ONE
 * readwrite transaction over ['inv','kv'], list unbounded, and every site that
 * removed an 'inv' row outright now goes through it (openCrate included; the
 * legacy 'crateTaken' list is still read on a merge, nothing writes it). The
 * bound is documented on the helper: ~23 bytes an id, so 10,000 consumed rows
 * is ~230 KB inside a blob whose D1 ceiling is 2.2 MB.
 *
 * HOW THE CRASH IS MODELLED (same wrapper as spawn-claim-atomic-audit): the
 * in-memory IndexedDB is wrapped so the FIRST readwrite transaction touching
 * 'inv' is allowed to commit and every transaction dispatched after it is DEAD:
 * it accepts requests, fires no callbacks and never completes, which is what a
 * killed tab does to the writes queued behind it. The invariant is read off the
 * DATABASE after a revive, never off the call's return value, because a dead
 * process has no return value.
 *
 * ROWS
 *   CONTROL     with nothing killed, a consume removes the row AND leaves its id
 *               on the receipt list. Non-empty by assertion.
 *   RING        grant 501 draughts, snapshot the pre-consumption blob, consume
 *               all 501, merge the blob: zero come back. Same for 501 crates
 *               through openCrate.
 *   ATOMIC      with the death armed, for a consumable and for a crate: the row
 *               is gone if and only if its receipt exists. Either the take never
 *               happened, or it happened whole.
 *
 * PROVE-RED, run on a throwaway worktree of origin/main bce3a937 (v493) with
 * this file copied in:
 *   FAIL RING  501 consumed draughts stay consumed through a merge of the pre-consumption blob  1 revived (the oldest: yes)
 *   FAIL RING-CRATE  501 opened crates stay opened through a merge of the pre-open blob  1 revived (the oldest: yes)
 *   FAIL ATOMIC  a consumable's delete and its receipt land together or not at all  row gone: true, receipt: false
 *   FAIL ATOMIC-CRATE  a crate's take and its receipt land together or not at all  row gone: true, receipt: false
 *
 * PURE: node only, no browser, a few seconds.
 *     node tests/inv-tombstone-audit.mjs
 */
import './mem-idb.mjs';   // installs globalThis.indexedDB before js/db.js opens it

/* ---- the kill: wrap the store BEFORE js/db.js ever calls open() ---- */
const raw = globalThis.indexedDB;
let armed = false;   // arm the death: the next readwrite transaction on 'inv' is the last one
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
              if (!armed || mode !== 'readwrite' || ![].concat(stores).includes('inv')) return t;
              let oc = null;   // let THIS one land, then the process is gone
              Object.defineProperty(t, 'oncomplete', {
                configurable: true,
                get: () => oc,
                set: g => { oc = ev => { dead = true; armed = false; g(ev); }; },
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

const { kvGet, useDbName, db, importAll } = await import('../js/db.js');
const { grantConsumable, consumeConsumable, grantCrate, openCrate } = await import('../js/loot.js');

let fails = 0;
const ok = (m, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${m}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};
/* both lists: the ATOMIC rows grade the split write, not which list a site
   chose, so a receipt on the legacy list counts as a receipt */
const receipts = async () => new Set([...((await kvGet('invTaken', [])) || []), ...((await kvGet('crateTaken', [])) || [])]);
const blobOf = async () => ({ app: 'tally', version: 3, log: [], inv: await db.all('inv'), kv: [] });
/* the killed call never resolves (its writes are queued behind a dead
   transaction), so give it a beat and then read the database */
const killed = p => Promise.race([p.catch(() => {}), new Promise(r => setTimeout(r, 200))]);

/* ------------------------------- CONTROL ---------------------------------- */
useDbName('inv-tombstone-control');
const ctl = await grantConsumable('vigor', 'audit');
ok('CONTROL SETUP  the draught is in inventory', (await db.all('inv')).some(r => r.id === ctl.id));
ok('CONTROL  a consume removes the row and leaves its receipt',
  (await consumeConsumable('vigor')) === true && !(await db.all('inv')).some(r => r.id === ctl.id) && (await receipts()).has(ctl.id),
  `receipts=${(await receipts()).size}`);

/* --------------------------------- RING ----------------------------------- */
const N = 501;
useDbName('inv-tombstone-ring');
const draughts = [];
for (let i = 0; i < N; i++) draughts.push(await grantConsumable('vigor', 'audit'));
const preConsume = await blobOf();
ok(`RING SETUP  ${N} draughts granted and in the pre-consumption blob`, preConsume.inv.filter(r => r.kind === 'vigor').length === N);
for (let i = 0; i < N; i++) await consumeConsumable('vigor');
ok(`RING SETUP  all ${N} consumed locally`, !(await db.all('inv')).some(r => r.kind === 'vigor'));
await importAll(preConsume, { replace: false });
const revived = (await db.all('inv')).filter(r => r.kind === 'vigor');
ok(`RING  ${N} consumed draughts stay consumed through a merge of the pre-consumption blob`,
  revived.length === 0, `${revived.length} revived (the oldest: ${revived.some(r => r.id === draughts[0].id) ? 'yes' : 'no'})`);

useDbName('inv-tombstone-ring-crate');
const crates = [];
for (let i = 0; i < N; i++) crates.push(await grantCrate('daily', 'audit'));
const preOpen = await blobOf();
ok(`RING-CRATE SETUP  ${N} crates granted and in the pre-open blob`, preOpen.inv.filter(r => r.kind === 'crate').length === N);
for (const c of crates) await openCrate(c.id);
ok(`RING-CRATE SETUP  all ${N} opened locally`, !(await db.all('inv')).some(r => r.kind === 'crate'));
await importAll(preOpen, { replace: false });
const revivedCrates = (await db.all('inv')).filter(r => r.kind === 'crate');
ok(`RING-CRATE  ${N} opened crates stay opened through a merge of the pre-open blob`,
  revivedCrates.length === 0, `${revivedCrates.length} revived (the oldest: ${revivedCrates.some(r => r.id === crates[0].id) ? 'yes' : 'no'})`);

/* -------------------------------- ATOMIC ---------------------------------- */
useDbName('inv-tombstone-atomic');
const vic = await grantConsumable('vigor', 'audit');
armed = true;
await killed(consumeConsumable('vigor'));
dead = false; armed = false;   // revive: the dead transactions wrote nothing, so the database is exactly what the crash left
const gone = !(await db.all('inv')).some(r => r.id === vic.id);
const receipted = (await receipts()).has(vic.id);
ok('ATOMIC SETUP  the killed consume reached the database at all', gone || receipted, 'neither the row nor a receipt moved');
ok('ATOMIC  a consumable\'s delete and its receipt land together or not at all', gone === receipted, `row gone: ${gone}, receipt: ${receipted}`);

useDbName('inv-tombstone-atomic-crate');
const cr = await grantCrate('daily', 'audit');
armed = true;
await killed(openCrate(cr.id));
dead = false; armed = false;
const crGone = !(await db.all('inv')).some(r => r.id === cr.id);
const crReceipted = (await receipts()).has(cr.id);
ok('ATOMIC-CRATE SETUP  the killed open reached the database at all', crGone || crReceipted, 'neither the row nor a receipt moved');
ok('ATOMIC-CRATE  a crate\'s take and its receipt land together or not at all', crGone === crReceipted, `row gone: ${crGone}, receipt: ${crReceipted}`);

console.log(fails ? `\nINV TOMBSTONE FAILED (${fails})` : '\nall clean');
process.exit(fails ? 1 : 0);
