// Minimal promise wrapper over IndexedDB. Stores: foods, log, weights, kv, xp, health, inv.
// IMPORTANT: upgrades must stay strictly ADDITIVE (create-if-missing only).
// Existing user data must survive every version bump.
import { dayOrdinal } from './nutrition.js';

const DB_VERSION = 3;
let dbPromise = null;
let dbName = 'tally';

/* THE STORE LIST, IN ONE PLACE, BECAUSE A HAND-COPIED ONE LOSES A STORE.
 *
 * Every place that has to act on "all of the player's data" reads this: the
 * transactional importAll below, and Settings > Erase all data in js/app.js.
 * The erase used to carry its own literal and it was missing 'inv', so an
 * erase left the whole inventory (crates, gear, cosmetics, pets) standing
 * while wiping the kv flag that says the welcome kit was already paid. The
 * dialog promised the Bonehead was gone and it was not, and every
 * erase-then-start-over cycle paid a second welcome kit on top of the gear it
 * had failed to remove: unbounded, from the single most natural piece of
 * support advice there is.
 *
 * Adding an eighth store means adding it HERE and to onupgradeneeded, and
 * tests/erase-completeness-audit.mjs fails if those two ever disagree, so the
 * next store cannot silently reintroduce the same hole. */
export const STORES = ['foods', 'log', 'weights', 'kv', 'xp', 'health', 'inv'];

/* WRITE EPOCHS. A strictly increasing stamp per store, bumped by every write that
   goes through this module. It exists so a caller can cache something derived from
   a whole store (js/game.js caches the XP total) and know, in constant time and
   without re-reading the store, whether anything has touched it since. Bumped
   BEFORE the write lands, so a write that then FAILS still invalidates: the safe
   direction is a needless rebuild, never a stale number. */
let writeSeq = 0;
const storeSeq = new Map();
function bumpStore(store) { storeSeq.set(store, ++writeSeq); }
export function storeEpoch(store) { return storeSeq.has(store) ? storeSeq.get(store) : writeSeq; }

export function useDbName(name) {
  dbName = name;
  dbPromise = null;
  /* A different database is different data. Clearing the per-store stamps while
     writeSeq keeps climbing means every store now reports a value no cache built
     against the old database can be holding. */
  writeSeq++;
  storeSeq.clear();
}

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('foods')) {
          const s = db.createObjectStore('foods', { keyPath: 'id' });
          s.createIndex('barcode', 'barcode');
          s.createIndex('lastUsedAt', 'lastUsedAt');
        }
        if (!db.objectStoreNames.contains('log')) {
          const s = db.createObjectStore('log', { keyPath: 'id' });
          s.createIndex('date', 'date');
        }
        if (!db.objectStoreNames.contains('weights')) {
          db.createObjectStore('weights', { keyPath: 'date' });
        }
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'k' });
        }
        if (!db.objectStoreNames.contains('xp')) {
          db.createObjectStore('xp', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('health')) {
          db.createObjectStore('health', { keyPath: 'date' });
        }
        if (!db.objectStoreNames.contains('inv')) {
          db.createObjectStore('inv', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    try { out = fn(s); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const db = {
  put: (store, val) => { bumpStore(store); return tx(store, 'readwrite', s => s.put(val)); },
  del: (store, key) => { bumpStore(store); return tx(store, 'readwrite', s => s.delete(key)); },
  get: (store, key) => tx(store, 'readonly', s => s.get(key)),
  clear: (store) => { bumpStore(store); return tx(store, 'readwrite', s => s.clear()); },
  all: (store) => tx(store, 'readonly', s => s.getAll()),
  count: (store) => tx(store, 'readonly', s => s.count()),
  epoch: (store) => storeEpoch(store),
  byIndex: (store, index, value) => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const req = t.objectStore(store).index(index).getAll(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  })),
};

export async function kvGet(k, fallback = null) {
  const row = await db.get('kv', k);
  return row ? row.v : fallback;
}
export function kvSet(k, v) { return db.put('kv', { k, v }); }

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ------------------------------------------------------------------------
 * MONOTONIC DAY GUARD, part 2 of 2. Part 1 is dayOrdinal() in js/nutrition.js.
 *
 * WHAT IT IS FOR. Every daily limit in this app is decided by the device's own
 * clock through dateKey() (js/nutrition.js:132, plain `new Date()` in LOCAL
 * time): the daily wheel, the day-close crate, daily and period quests, the
 * free Pit fights, the Glutton. Move the device clock forward a day and all of
 * them re-arm, because the per-key award() ledger only refuses the SAME key
 * twice and a new date makes a new key. tests/clock-trust-audit.mjs measured
 * what that is worth on this build over 14 simulated resets: 176.4 XP, 64.6
 * coins, 3.0 free Pit fights and 1.4 inventory rows per reset, with a golden
 * crate in 13 of 14. That is level 50 in about 271 resets, and because
 * socialSnapshot pushes level and buildFighter derives stats from the same xp
 * rows, it all lands on the SHARED leaderboard.
 *
 * BE HONEST ABOUT WHAT THIS IS. This is a speed bump, not a lock. Everything
 * in js/ is plain text served to the person it is trying to stop: anyone with
 * devtools can call kvSet('dayHighWater', ...) themselves, edit this file in a
 * local checkout, or restore an exported backup over the top of it. It stops
 * casual clock-toggling from Settings, which is the cheap, no-skill version
 * everybody can do, and it makes the expensive version actually expensive.
 * It does not stop anyone who opens a console. A local-first offline app
 * cannot, and pretending otherwise in a comment is how a guard rots.
 *
 * THE TWO RULES, and an honest account of what each one is worth.
 *
 *  1. BACKWARDS IS REFUSED. A day strictly before the high-water mark never
 *     counts as fresh. THIS IS THE LOAD-BEARING RULE and very nearly the whole
 *     guard. It does two things. It kills the cheap harvest outright: jump to
 *     day D+5, collect, then walk back through D+1..D+4 collecting each day
 *     you skipped, all of which are unclaimed keys the award() ledger is happy
 *     to pay. And it makes a forward jump PERMANENT. The farmer cannot put the
 *     clock back, so either the device stays that many days in the future,
 *     which breaks calendars, reminders and TLS on the rest of the phone, or
 *     they set it right and every real day until the calendar catches up pays
 *     nothing. Fourteen farmed days now costs fourteen dead real ones.
 *
 *  2. THE LOCAL DATE MAY NOT OUTRUN UTC ELAPSED by more than DAY_GRACE days,
 *     measured from a drifting anchor. BE CLEAR ABOUT ITS LIMIT: Date.now()
 *     below is the SAME clock dateKey() reads, so moving the clock forward one
 *     day moves both terms by one day and this rule cannot see it. It is not a
 *     rate limiter on clock-moving and must never be described as one. What it
 *     does catch is a local date that advances without UTC advancing, which is
 *     what a TIMEZONE change does: switching region hands you tomorrow for
 *     free, no clock movement at all. Rule 1 already caps that at one hop
 *     (there is nowhere further east to go), so rule 2 is belt and braces
 *     there. Its real job is the second half: capping banked allowance so an
 *     idle month cannot be spent in one sitting. Cheap, and no false positive
 *     a traveller can trip inside DAY_GRACE.
 *
 * WHAT NEITHER RULE CAN DO, stated so nobody has to rediscover it: nothing
 * here detects a plain forward clock move, because there is no trustworthy
 * clock on the device to compare against. `performance.now()` is monotonic but
 * resets on every page load, so a force-quit erases it. A server timestamp
 * would work and this app is offline-first, and server/ is not ours to change.
 * The guard's value is entirely that the move cannot be undone.
 *
 * WHY NOT A ROLLING "20 HOURS SINCE THE LAST DAY WE SAW". It was the first
 * design and it BRICKS HONEST PLAYERS, every day, for free. The stamp would be
 * rewritten on the player's last interaction of the day, so somebody who opens
 * the app at 23:00 and again at 08:00 the next morning has nine hours between
 * a real day boundary, is refused, and loses a genuine day of rewards. Any
 * evening-then-morning player hits it. The anchor below is not restamped on
 * same-day activity and does not care WHERE in the day the anchor sat, because
 * DAY_GRACE absorbs the partial day once rather than once per day.
 *
 * WHY THE ANCHOR DRIFTS FORWARD. If it never moved, a player who did not open
 * the app for a month would bank thirty days of allowance and could then spend
 * them in one sitting. So whenever real time has run AHEAD of the claimed day
 * count, the anchor is pulled up to now. Headroom is therefore capped at
 * DAY_GRACE permanently, and for a player who opens the app daily it sits at
 * 2 to 3 days and never erodes toward zero.
 *
 * NTP / FLAT BATTERY, and why this cannot brick an honest player. A flat
 * battery leaves a phone booting on its RTC default, and NTP corrects it a few
 * seconds later, usually before the app is open at all.
 *   - Corrected BACKWARDS (the RTC had run fast, or read a future default):
 *     the wrong future day is refused by rule 2 only if it is more than
 *     DAY_GRACE days out, and a refusal WRITES NOTHING, so the high-water mark
 *     never learns the bad date. When NTP lands, the true date is still at or
 *     above the mark and the player carries on with nothing lost. Inside
 *     DAY_GRACE the bad day is accepted and the mark moves a day or two ahead,
 *     which costs at most those days of dailies once, and never repeats.
 *   - Corrected FORWARDS (the RTC was stuck in the past): the stale day is
 *     refused by rule 1, so no rewards are paid while the clock is wrong; the
 *     player would have got the wrong day's keys anyway. The moment NTP lands,
 *     the true date is at or above the mark, real elapsed and the true date
 *     have moved together, and the day opens normally.
 * In every case the failure mode is a REFUSAL, which is stateless: the guard
 * has no way to latch. It cannot leave a player permanently locked out, only
 * unpaid for the window their clock was wrong. Nothing is ever clawed back.
 *
 * THE TRAVELLER. Flying EAST is free: the date jumps forward, rule 1 does not
 * care and rule 2 has DAY_GRACE to spend, so an LA-to-Sydney flight (Monday
 * 22:00 PDT to Wednesday 06:00 AEST, two local dates in fifteen hours) opens
 * both days and pays normally. Flying WEST across the date line is the one
 * honest case that costs something: you land on a local date BEFORE the mark,
 * rule 1 refuses it, and you lose about one day of dailies before the calendar
 * catches up. That is the price and it is deliberate, because "backwards is
 * sometimes fine" is exactly the hole the whole guard exists to close. One day
 * for the rare traveller is the cheaper mistake than an open farm for everyone.
 *
 * EXISTING PLAYERS. dayHighWater starts null, so the first call after this
 * update seeds the mark from wherever that player's clock already is. Nobody
 * is retroactively penalised, nobody who has already farmed is rolled back,
 * and no existing save loses a day to the update itself. That is the right
 * trade: the alternative is punishing a legitimate player whose device happens
 * to be a day off, to reclaim XP that is already spent.
 *
 * THIS SITS IN FRONT OF award(), IT DOES NOT REPLACE IT. The per-key ledger
 * still refuses a second claim on the same key. This only answers "is the
 * device's idea of today trustworthy enough to open a new day at all".
 * ------------------------------------------------------------------------ */
const DAY_MS = 86400000;
/* 3 days, and each one is spoken for: ONE for the partial day the anchor was
   set in (an anchor at 23:00 is a whole day behind an anchor at 00:01), ONE
   for the largest honest jump a calendar can make in no time at all, which is
   an eastward date-line crossing from UTC-12 to UTC+14 and is worth up to two
   local dates for 26 hours of offset, and ONE spare for DST, a manual timezone
   change and the fact that this is a speed bump, so it should err toward the
   traveller. The farmer's prize for all of it is three days, ever, once. */
export const DAY_GRACE = 3;

export async function claimDay(key) {
  const o = dayOrdinal(key);
  if (!Number.isFinite(o)) return { fresh: true, reason: 'unparseable' };  // never judge what we cannot read

  const hw = await kvGet('dayHighWater', null);
  const oh = dayOrdinal(hw);

  // FIRST RUN, or a mark we cannot read: seed and let the player through.
  if (!Number.isFinite(oh)) {
    await kvSet('dayHighWater', key);
    await kvSet('dayPaceKey', key);
    await kvSet('dayPaceAt', Date.now());
    return { fresh: true, reason: 'seeded' };
  }

  // RULE 1. Strictly before the mark is never a new day.
  if (o < oh) return { fresh: false, reason: 'backwards', highWater: hw };

  /* SAME DAY. Fresh, because the per-key ledger is what decides whether any
     individual reward is still owed. Deliberately writes nothing: restamping
     here is exactly the bug that made the rolling-window design refuse honest
     evening-then-morning players. */
  if (o === oh) return { fresh: true, reason: 'same-day' };

  // RULE 2. Days claimed since the anchor may not outrun days elapsed since it.
  const anchorKey = await kvGet('dayPaceKey', hw);
  const anchorAt = Number(await kvGet('dayPaceAt', 0)) || 0;
  const oa = dayOrdinal(anchorKey);
  if (Number.isFinite(oa) && anchorAt > 0) {
    const elapsedDays = Math.floor((Date.now() - anchorAt) / DAY_MS);
    const allowed = elapsedDays + DAY_GRACE;
    if (o - oa > allowed) {
      return { fresh: false, reason: 'too-fast', highWater: hw, allowed, claimed: o - oa };
    }
    /* Pull the anchor up when wall time has outrun the day count, so an idle
       month cannot be banked and spent in one sitting. */
    if (elapsedDays > o - oa) { await kvSet('dayPaceKey', key); await kvSet('dayPaceAt', Date.now()); }
  } else {
    await kvSet('dayPaceKey', key);
    await kvSet('dayPaceAt', Date.now());
  }

  await kvSet('dayHighWater', key);
  return { fresh: true, reason: 'advanced' };
}

/* Read-only view for UI and for tests. Never writes, so it can be called from
   a render path without opening a day as a side effect. */
export async function dayGuardState() {
  const [highWater, paceKey, paceAt] = await Promise.all([
    kvGet('dayHighWater', null), kvGet('dayPaceKey', null), kvGet('dayPaceAt', 0),
  ]);
  return { highWater, paceKey, paceAt: Number(paceAt) || 0, grace: DAY_GRACE };
}

export async function exportAll() {
  const [foods, log, weights, kv, xp, health, inv] = await Promise.all([
    db.all('foods'), db.all('log'), db.all('weights'), db.all('kv'), db.all('xp'), db.all('health'), db.all('inv'),
  ]);
  return { app: 'tally', version: 3, exportedAt: new Date().toISOString(), foods, log, weights, kv, xp, health, inv };
}

/* kv rows that belong to the DEVICE, not to the save.
 *
 * Clearing kv is half of what closes the duplication loop below, but kv is
 * also where the account's private key lives, and a backup file taken before
 * this device ever registered carries no `identity` row to put back. Wiping
 * it would sign the player out of an account they cannot return to on the
 * web, where there is no OS keychain for ensureIdentity() to recover from.
 * That is the 2026-07-27 shape all over again.
 *
 * So these keys are read BEFORE the transaction and re-applied inside it,
 * and only for keys the payload does not itself carry. The payload always
 * wins where it has an opinion, which means the outcome for every one of
 * these keys is byte-identical to what upsert-only produced. Nothing here
 * is game state: no coins, no dust, no progress. */
const DEVICE_KV = ['identity', 'social', 'recoveryId', 'recoverySetAt', 'vaultConflict', 'bootRestored', 'cloudOff', 'apiBase'];

/* IMPORT IS ALL-OR-NOTHING. Tom, 2026-08-13, after Vlad's demonstration:
 * "sounds like a good fix youve suggested". Every row across every store
 * commits together in ONE multi-store transaction, or none of them do
 * and the player's old save is left byte-identical to what it was
 * before the click. No third state.
 *
 * The previous version did `await db.put(...)` per row per store, one
 * IndexedDB transaction per row. A tab reload, an app background, or a
 * failed put anywhere in the seven loops left foods/log full of new
 * data and weights/kv/xp/health/inv untouched, and the app booted on
 * the mixed state silently. See gwart/FINDING-C-INTERRUPT-DEMO.md and
 * tests/importall-interrupt-finding.mjs for the measurement.
 *
 * How the guarantee holds:
 *   - Multi-store readwrite transaction over ALL seven stores.
 *   - All puts dispatched SYNCHRONOUSLY inside the transaction. If any
 *     `await` sat between them, IndexedDB would auto-commit when the
 *     microtask queue drained and we would be back to piecewise commit.
 *   - `oncomplete` is the only success signal; the promise resolves
 *     only when EVERY put has committed.
 *   - Any failure inside the transaction (bad row, quota hit, tab
 *     reload) fires `onabort` and IDB rolls back automatically. The
 *     promise rejects with a message the toast can show verbatim.
 *
 * The rejection wording is intentionally caller-safe: js/app.js's
 * #importFile handler prefixes it as `Import failed: <message>` and
 * the full string tells the player their old data is safe and to try
 * again. Silent failure is not acceptable and neither is silent success.
 *
 * A RESTORE REPLACES, IT DOES NOT MERGE. Tom approved this on 2026-08-16.
 * The version above only ever called `os.put`, so a restore could add rows
 * and overwrite rows but could never REMOVE one. That is an unlimited
 * duplication loop reachable from the Settings buttons alone, with no
 * modified client and no edited file:
 *
 *   Settings -> Export.   coins 6500, 17 inv rows.
 *   Shop -> buy a drop piece for 3000.   coins 3500, 18 inv rows.
 *   Settings -> Import that same file.   coins 6500, STILL 18 inv rows.
 *
 * The kv row for `coins` came back at its pre-spend value because the file
 * carried it, and the inv row the purchase minted stayed because the file
 * carried nothing that could delete it. Measured twice around on the real
 * UI: two 3000-coin pieces for a net cost of zero. Same shape for any spend
 * whose payout lands in a NEW row: crates, gear, xp award rows.
 *
 * So every store the payload declares is CLEARED first, inside the same
 * transaction as its puts.
 *
 * WHY THE CLEAR IS SAFE, measured on Chrome 2026-08-16, not assumed:
 *   - An abort rolls the clear back with everything else. A transaction
 *     that cleared kv and inv, put a row, then hit a malformed row and
 *     aborted, left BOTH stores holding their original rows.
 *   - Same for an asynchronous request failure after the clear: the error
 *     bubbles, IDB aborts, the cleared rows come back.
 *   - BUT a malformed row throws SYNCHRONOUSLY out of `os.put` (DataError)
 *     and that throw does NOT abort the transaction by itself. Left alone
 *     it COMMITS, clear included, and the store is emptied. The `t.abort()`
 *     in the catch below is therefore load-bearing, not tidy-up. It is the
 *     only reason "Your old data is unchanged" is still literally true.
 *
 * A store the file OMITS is left completely alone: not cleared, not
 * written. An older export that predates a store carries no rows for it,
 * and clearing on absence would destroy data that no put restores. An
 * explicit empty array IS cleared, because "this store held nothing at
 * export time" is a fact the file is stating, and exportAll always emits
 * all seven keys as arrays, so a genuine backup never lands in the omitted
 * branch by accident.
 *
 * `replace: false` keeps the old additive behaviour for callers whose
 * contract is a merge rather than a restore. js/social.js's cloud pull is
 * the only one. */
export async function importAll(data, { replace = true } = {}) {
  if (!data || data.app !== 'tally' || !Array.isArray(data.log)) throw new Error('Not a Tally backup file');
  /* STORES is the module-level export above. importAll used to keep its own
     copy of this list, and a second copy in js/app.js's erase loop is what
     silently lost 'inv' and left the inventory behind on a full wipe. One
     list, imported everywhere, is the fix for that whole class. */
  /* Shape check BEFORE anything opens a transaction, so "unchanged" is
     trivially true on this path. A store key that is present but is not an
     array is a damaged file, not an old one, and the two cases deserve
     different answers: this one refuses, an absent key is skipped below. */
  const damaged = STORES.filter(s => data[s] != null && !Array.isArray(data[s]));
  if (damaged.length) throw new Error(`that backup file is damaged (${damaged.join(', ')}). Your old data is unchanged.`);
  const idb = await open();
  const declared = new Set(STORES.filter(s => Array.isArray(data[s])));
  const skipped = STORES.filter(s => !declared.has(s));
  /* Read the device rows out here, not inside the transaction. An `await`
     between the puts would let IDB auto-commit on the drained microtask
     queue and we would be back to piecewise commit, which is exactly what
     this function was rewritten to stop. */
  let keptKv = [];
  if (replace && declared.has('kv')) {
    const payloadKeys = new Set(data.kv.map(r => r && r.k));
    try { keptKv = (await db.all('kv')).filter(r => DEVICE_KV.includes(r.k) && !payloadKeys.has(r.k)); }
    catch (e) { throw new Error('the restore could not read storage. Your old data is unchanged. Try again.'); }
  }
  return new Promise((resolve, reject) => {
    let t;
    try { t = idb.transaction(STORES, 'readwrite'); }
    catch (e) { reject(new Error('the restore could not open storage. Your old data is unchanged. Try again.')); return; }
    t.oncomplete = () => resolve({ foods: (data.foods || []).length, log: (data.log || []).length, weights: (data.weights || []).length, skipped });
    /* onerror and onabort BOTH need handling. onerror bubbles from a
       failed put; onabort fires when the transaction is explicitly
       aborted OR when the tab is torn down mid-flight. Either way IDB
       rolls back and the player's old save survives. */
    t.onerror = () => reject(new Error('the restore did not finish. Your old data is unchanged. Try again.'));
    t.onabort = () => reject(new Error('the restore did not finish. Your old data is unchanged. Try again.'));
    try {
      for (const s of STORES) {
        const os = t.objectStore(s);
        /* Clear and puts in one transaction, so they land together or not
           at all. Only for stores the file declares: see the header. */
        if (replace && declared.has(s)) os.clear();
        for (const row of (data[s] || [])) os.put(row);
        if (s === 'kv') for (const row of keptKv) os.put(row);
      }
      /* An import replaces the contents of every store, so every derived cache
         built on the old contents is now wrong. Stamp them all. */
      for (const s of STORES) bumpStore(s);
    } catch (e) {
      /* LOAD-BEARING, do not delete. A synchronous throw out of `os.put`
         (malformed row, unclonable value) does NOT abort the transaction
         on its own: measured, such a transaction goes on to COMPLETE and
         commits the clear, leaving the store empty. This abort is what
         rolls the clear back and keeps the promise in the rejection copy
         literally true. onabort then rejects with the standard message. */
      try { t.abort(); } catch { /* already aborting */ }
    }
  });
}

// Ask the browser to protect this origin's storage from automatic eviction.
export function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch { /* unsupported */ }
}
