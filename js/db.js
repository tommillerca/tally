import { validateLabSave, mergeLabSave } from './laboratory.js';
// Minimal promise wrapper over IndexedDB. Stores: foods, log, weights, kv, xp, health, inv.
// IMPORTANT: upgrades must stay strictly ADDITIVE (create-if-missing only).
// Existing user data must survive every version bump.
import { dayOrdinal, dateKey } from './nutrition.js';
import { beginSave, finishSave } from './save-disclosure.js';

/* Exported because it is also the backup file's `version` stamp (exportAll),
   so a file and the schema that wrote it can never disagree again (QA round
   25 M6: the export carried a literal 3 that nothing tied to this). */
export const DB_VERSION = 3;
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
   without re-reading the store, whether anything has touched THAT store since. Bumped
   BEFORE the write lands, so a write that then FAILS still invalidates: the safe
   direction is a needless rebuild, never a stale number.

   PER STORE, NOT ONE GLOBAL SEQUENCE, and this is the whole point. The first
   version of this used a single shared counter, so `epoch('xp')` moved when ANY
   store was written. js/game.js checks that the xp store moved exactly once across
   its own put, and with a shared counter an unrelated kv write in between broke
   that check. A fight win is award plus COINS, and coins are kvSet, which is
   db.put('kv', ...), so in the real app the xp cache was thrown away on almost
   every award and the next read paid for a full scan anyway: measured at 11 cache
   drops out of a 12-award burst, against 0 for a burst of bare awards. Making the
   stamp belong to the store the cache is derived from is the fix. Do not merge
   these counters back into one.

   EVERY write path in this module stamps, and that includes the atomic
   primitives below (addIfAbsent, take, kvUpdate) and eraseAll. A write that
   does not stamp is a cache that goes stale silently, which is the one failure
   mode this whole mechanism exists to make impossible. */
const storeSeq = new Map();
function bumpStore(store) { storeSeq.set(store, (storeSeq.get(store) || 0) + 1); }
export function storeEpoch(store) { return storeSeq.get(store) || 0; }

export function useDbName(name) {
  dbName = name;
  dbPromise = null;
  /* A different database is different data, and no write to the new one has
     happened yet to say so. Bump every store this process knows about: the
     counters only ever climb, so no cache built against the old database can
     still match. */
  for (const s of new Set([...STORES, ...storeSeq.keys()])) bumpStore(s);
}

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(dbName, DB_VERSION); }
      catch (error) { reject(error); return; }
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

// Boot needs an explicit outcome before starting any storage-dependent setup.
// Keep ordinary database operations rejecting so failed writes never look saved.
export async function storageStatus() {
  try { await open(); return { ok: true }; }
  catch (error) { return { ok: false, error }; }
}

/* ONE ACCOUNT, TWO TABS. Added 2026-08-17.
 *
 * Everything below this line exists because nothing in this app had ever been
 * opened twice at once, and a second tab is not a hypothetical: it is what a
 * shared link, a "open in new tab", or an installed PWA beside its own website
 * produces. Two tabs share ONE IndexedDB. IndexedDB serialises `readwrite`
 * transactions over a store across every connection, tab boundaries included,
 * so a transaction IS a lock. What is NOT a lock is a read, an `await`, and
 * then a write, and that is the shape almost every write in this app had.
 *
 * Measured on two real puppeteer pages against one served tree, before the fix
 * (tests/multitab-audit.mjs carries all of these as assertions):
 *   50 x coinsAdd(+10) from 1000 across two tabs   ended at 1280, not 1500
 *   20 spends of 100 racing 20 earns of 100        ended at 2500, not 3000
 *   one 100-coin grant delivered to both tabs      paid 200
 *   one gear id granted in both tabs               left TWO inv rows, and each
 *                                                  one disenchants for full dust
 *   awardCapped with a 12/day ceiling              paid 190 XP against a 120 cap
 *   30 additions to the grantsSeen list            kept 23 of them
 * None of these need a modified client, a patched server or a second device.
 * They need the app open twice.
 *
 * The primitives here are the whole answer: they do the read AND the write
 * inside a single transaction, so the browser does the mutual exclusion. There
 * is deliberately no lock, no leader election and no version counter to get
 * wrong. Rules for using them:
 *   - The updater function passed to kvUpdate must be SYNCHRONOUS. An `await`
 *     inside it drains the microtask queue, IndexedDB auto-commits, and the
 *     transaction is over before the write is issued. That is the same trap
 *     importAll documents above.
 *   - `addIfAbsent` is the test-and-set. It is what makes a ledger row a real
 *     receipt rather than a hint: exactly one caller can ever get `true` for a
 *     given key, no matter how many tabs ask at the same instant.
 */

/* Writes are refused while this is set. Only ever set by the wipe protocol
   below, in the tabs that are NOT doing the wiping, so that "erase everything"
   can be true rather than nearly true. A frozen tab is on its way to a reload. */
let frozen = false;
const FROZEN_MSG = 'Saving is paused because another tab started erasing this save. Reload this tab to continue.';
let frozenMessage = FROZEN_MSG;
function frozenError() { return Object.assign(new Error(frozenMessage), { wipeBlocked: true }); }

function tx(store, mode, fn) {
  if (frozen && mode === 'readwrite') return Promise.reject(frozenError());
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

/* ===================== A REJECTED WRITE MUST NOT BE SWALLOWED =====================
 *
 * THE BUG. Exactly ONE write in this app survived a full disk: the meal log in
 * js/app.js, which wraps its own put and tells the player. Every other write was
 * a bare `await db.put(...)` / `await kvSet(...)` with no catch. On a quota abort
 * the promise rejects, the rest of the function is skipped, and the rejection
 * unwinds to window.unhandledrejection, where js/analytics.js files it as an
 * anonymous `err` row with a truncated message. The player sees the fight-win
 * animation and never gets the crate, and nobody can tell afterwards which write
 * it was.
 *
 * WHY HERE AND NOT AT THE CALL SITES. 100+ try/catch blocks is a change nobody
 * can review, and the 101st write would forget it. Worse, a per-site catch cannot
 * see the failures a caller ALREADY swallows: a `.catch(() => {})` two frames up
 * hides the write forever, and there are plenty of those. Every write goes
 * through this file, so this is the one place that sees all of them.
 *
 * WHY THE ATOMIC PRIMITIVES ARE IN THE SEAM, AND THIS IS THE WHOLE POINT ON v417.
 * When this fix was first written, every payout went through `db.put`, so
 * wrapping put/del/clear covered the money. It does not any more. The reward SOP
 * (CLAUDE.md, added 2026-08-17) now REQUIRES every paying action to go through
 * addIfAbsent / take / kvUpdate / kvBump instead, and those open their own
 * transactions without touching `tx()` or `db.put`. Porting the original patch
 * unchanged would therefore have covered the bookkeeping and MISSED every coin,
 * crate, pet and XP row in the game: the exact writes whose silent loss the fix
 * exists for, newly invisible to it. So they are wrapped here too.
 *
 * ONLY A REJECTION IS A FAILURE. Each primitive has a legitimate falsy answer:
 * addIfAbsent resolves false for "somebody else has this key", take resolves
 * undefined for "already gone", kvUpdate resolves undefined for "nothing to do".
 * Those are ANSWERS. Reporting them would fire on every correctly-refused double
 * claim, which is the same conflation the SOP already calls out in award().
 *
 * A FROZEN TAB IS NOT A FAILING TAB. During "Erase all data" every other tab sets
 * `frozen` synchronously and rejects every write on purpose while it waits to
 * reload. A refused write still explains the pause; a failed erase broadcasts
 * its failure and reload guidance even before another write is attempted.
 *
 * The rejection is still RE-THROWN, unchanged: callers keep their control flow,
 * the reward code after a failed write still does not run, and the app still does
 * not pretend the write landed. The only thing added is that the failure is now
 * announced, once, to someone who can speak.
 *
 * LOUD vs QUIET. Some writes are fire-and-forget by design and interrupting the
 * player for those would be worse than silence. The line drawn here:
 *
 *   LOUD (default)  the write is the durable record of something the player did
 *                   or earned and can NAME afterwards: a meal, a weight, a step
 *                   row, an XP award, a crate/pet/gear row, coins, dust, talents,
 *                   the garden, the pantry, their equipped look.
 *   QUIET           ambient bookkeeping the app re-derives, re-asks or repeats
 *                   next launch: "have I shown this popup", "when did I last
 *                   sync", the telemetry queue, a cached position, a one-shot
 *                   migration marker.
 *
 * The QUIET list is EXPLICIT and the default is LOUD, deliberately (anti-
 * regression rule 8: never default to hidden). A new key nobody classified
 * degrades to a toast that is arguably unnecessary, never to a reward that
 * vanishes in silence.
 *
 * Store alone was not a usable axis: `kv` carries both `coins` and
 * `discordIntroSeen`. Key is.
 */
const QUIET_KV = new Set([
  // telemetry and identity plumbing
  'evq', 'analyticsId', 'recoveryId', 'recoverySetAt',
  // "have I already shown this" one-shots for intros, tours and announcements
  'spiresIntroSeen', 'bossesIntroSeen', 'mageIntroSeen', 'raceIntroSeen', 'raceResultSeen',
  'gardenIntroSeen', 'discordIntroSeen', 'discordIntroShown', 'discordJoined',
  'betaThanksSeen', 'cosmeticTeaserSeen', 'changelogSeen', 'grantsSeen', 'seenUnlocks',
  'onbProgress',
  'hlwSeen', 'siegeSeen', 'map-seen', 'mapLpHint', 'namePrompted', 'notifAsked',
  'surveyDone', 'surveySnoozeAt', 'renameRequired', 'petSeenLevel',
  'lastOpenDay', 'wbReturnDay',
  // "when did I last do X" throttles: a lost timestamp costs one extra attempt
  'lastNudgeAt', 'racePushAt', 'socialSyncAt', 'crewSeenTs', 'hkLastSync',
  'hkStaleNotified', 'hkSyncIssue', 'hkSleepDiag', 'lastExportAt', 'backupAt', 'backupVersion', 'transmuteAt',
  // cloud-health diagnostics + their once-a-day nudge throttle: all three are
  // re-derived by the next push / the next /health, same class as backupAt
  'backupFail', 'clockSkewMs', 'cloudNudgeAt', 'syncHealth',
  // idempotent one-shot migrations and backfills: they re-run next launch
  'game-init', 'loot-init', 'bootRestored', 'dayOneEquipFix', 'denceil-backfill',
  'seedpouch-backfill', 'freeze-refunded', 'wheelResetOnce_v61', 'petLvlV', 'hkScopesV',
  // diagnostics and caches the app recomputes
  'vaultConflict', 'vaultUnreadable', 'lastLoc', 'knownIncoming', 'cloudOff', 'apiBase',
]);
/* Two families are minted per week / per drop, so they cannot be listed by name.
   Both are pure "have I shown this yet" markers, same class as the set above. */
const QUIET_KV_PREFIX = ['dropSeen.', 'raceResult:', 'raceResultShown:'];

export function writeIsQuiet(store, val) {
  if (store !== 'kv') return false;
  const k = val && typeof val === 'object' ? val.k : val;
  if (typeof k !== 'string') return false;
  return QUIET_KV.has(k) || QUIET_KV_PREFIX.some(p => k.startsWith(p));
}

/* The sink is registered ONCE, by js/app.js, because js/app.js owns the toast and
   the analytics client and this file must not import either (js/analytics.js
   imports THIS file, so a reverse import would be a cycle). */
let writeFailureSink = null;
export function onWriteFailure(fn) { writeFailureSink = typeof fn === 'function' ? fn : null; }

function keyOf(store, val) {
  if (val == null || typeof val !== 'object') return val == null ? null : String(val);
  if (store === 'kv') return val.k;
  return val.id ?? val.key ?? val.date ?? null;
}

function reportWriteFailure(store, val, op, err) {
  /* A CLAIM-AND-SPEND that aborted because the wallet was short is an ordinary
     "can't afford it" refusal (js/loot.js:buyRackItem, 2026-09-05 offline crash
     fix), the same outcome spendCoins/spendDust already return silently as
     `null`. It only rejects here because it shares claimAndPay's abort plumbing
     with real write failures; it must not toast "that did not save" or queue a
     write_fail event for a player who is simply short on coins. */
  if (err && err.insufficientFunds) return;
  /* Same class, wider name (2026-09-06, takeAndPay/payAtomic): a kv updater that
     THROWS `refused` is saying "on looking at the real state inside the
     transaction, this action is not owed" (a pet copy already salvaged by a
     concurrent tap). The abort is the answer, not a failed save. */
  if (err && err.refused) return;
  const key = keyOf(store, val);
  const quiet = writeIsQuiet(store, val);
  const quota = /quota|QuotaExceeded/i.test(`${(err && err.name) || ''} ${(err && err.message) || ''}`);
  /* Tag the error itself as well as calling the sink. Anything that catches this
     downstream, including analytics' unhandledrejection handler, can now say
     WHICH write died instead of filing an anonymous row. */
  try { if (err && typeof err === 'object') err.tallyWrite = { store, key, op, quiet, quota }; } catch { /* frozen error */ }
  /* THE ONE STORE THAT CANNOT BE REPORTED. The sink queues telemetry, and
     telemetry is queued by writing kv 'evq'. Reporting a failed 'evq' write would
     queue an event, which writes 'evq', which fails, forever. */
  if (store === 'kv' && key === 'evq') return;
  if (!writeFailureSink) return;
  try { writeFailureSink({ store, key, op, quiet, quota, error: err }); }
  catch { /* a broken reporter must never break the write path */ }
}

/* Rejections are re-thrown so every existing caller behaves exactly as before. */
function guard(store, val, op, run) {
  const token = writeIsQuiet(store, val) ? null : beginSave();
  return Promise.resolve().then(run).then(value => {
    if (token) finishSave(token);
    return value;
  }, err => {
    const refusal = err?.refused || err?.insufficientFunds || err?.wipeBlocked;
    if (token) finishSave(token, !refusal);
    reportWriteFailure(store, val, op, err);
    throw err;
  });
}

/* P1 merge history stays in kv so it travels in existing backups. Count maps
   union signed, uniquely identified mutations. Other rows retain causal versions,
   including null diary tombstones. Concurrent non-additive edits refuse the entire
   import: neither save is discarded and the caller receives a recovery error.
   No pruning is safe while an unacknowledged offline backup can return. */
const MERGE_KV = new Set(['ingredients', 'potions', 'pantry', 'foodbuffs']);
const MERGE_COUNTS = new Set(['ingredients', 'potions']);
const MERGE_PREFIX = 'mergeHistory:';
const mergeKey = (store, key) => `${MERGE_PREFIX}${store}:${JSON.stringify(key)}`;
const sameValue = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])]));
  return v;
}
function historyFailure(key) {
  return new Error(`Cannot merge ${key}: missing, damaged or conflicting merge history. Your local save is unchanged. Keep both saves for recovery; no merge was applied.`);
}
const countMap = v => v && typeof v === 'object' && !Array.isArray(v) &&
  Object.values(v).every(n => Number.isSafeInteger(n) && n >= 0);
function historyValue(h, counts) {
  if (!counts) return h.head === null ? h.base : h.ops[h.head];
  const value = Object.assign(Object.create(null), h.base);
  for (const delta of Object.values(h.ops)) for (const [id, n] of Object.entries(delta)) value[id] = (value[id] || 0) + n;
  for (const id of Object.keys(value)) if (value[id] === 0) delete value[id];
  return value;
}
function normalized(v, counts) {
  if (!counts) return v ?? null;
  const out = { ...(v || {}) };
  for (const id of Object.keys(out)) if (out[id] === 0) delete out[id];
  return out;
}
function validHistory(h, counts) {
  if (!h || h.format !== 1 || typeof h.id !== 'string' || !h.id || !Object.hasOwn(h, 'base') ||
      !h.ops || typeof h.ops !== 'object' || Array.isArray(h.ops)) return false;
  if (!counts) return (h.head === null && !Object.keys(h.ops).length) ||
    (typeof h.head === 'string' && Object.hasOwn(h.ops, h.head));
  return countMap(h.base) && Object.values(h.ops).every(d => d && typeof d === 'object' && !Array.isArray(d) &&
    Object.values(d).every(Number.isSafeInteger)) && countMap(historyValue(h, true));
}
function newHistory(value, counts) {
  const base = normalized(value, counts);
  return { format: 1, id: (counts ? !Object.keys(base).length : base === null) ? 'empty' : crypto.randomUUID(),
    base, ops: {}, ...(!counts ? { head: null } : {}) };
}
function mergeRecorder(os, store, key, receipt) {
  const hk = mergeKey(store, key), counts = store === 'kv' && MERGE_COUNTS.has(key);
  const hg = os.get(hk);
  return (before, next) => {
    before = normalized(before, counts); next = normalized(next, counts);
    const h = hg.result?.v ?? newHistory(before, counts);
    if (!validHistory(h, counts) || !sameValue(historyValue(h, counts), before)) throw historyFailure(key);
    if (sameValue(before, next)) return;
    const id = receipt || crypto.randomUUID();
    let change = next;
    if (counts) {
      if (!countMap(next)) throw historyFailure(key);
      change = Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(next)])]
        .map(k => [k, (next[k] || 0) - (before[k] || 0)]).filter(([, n]) => n !== 0));
    }
    if (Object.hasOwn(h.ops, id)) throw historyFailure(key);
    const updated = { ...h, ops: { ...h.ops, [id]: change }, ...(!counts ? { head: id } : {}) };
    if (!validHistory(updated, counts)) throw historyFailure(key);
    os.put({ k: hk, v: updated });
  };
}
function joinHistory(key, a, b, av, bv, counts) {
  for (const [h, v] of [[a, av], [b, bv]]) if (h !== undefined &&
    (!validHistory(h, counts) || !sameValue(historyValue(h, counts), normalized(v, counts)))) throw historyFailure(key);
  if (!a && !b) {
    // Equal legacy counts can hide two independent grants. Never certify a
    // max/count tie as a lossless merge without distinct mutation receipts.
    if (counts && Object.keys(normalized(av, true)).length) throw historyFailure(key);
    if (!sameValue(normalized(av, counts), normalized(bv, counts))) throw historyFailure(key);
    return null;
  }
  if (!a || !b) {
    const h = a || b, legacy = normalized(a ? bv : av, counts);
    // An old opening snapshot contributes no new mutations. Other untracked
    // states have no reliable order or independent-earning evidence.
    if (!sameValue(legacy, h.base)) throw historyFailure(key);
    return h;
  }
  if (a.id !== b.id || !sameValue(a.base, b.base)) throw historyFailure(key);
  for (const id of Object.keys(a.ops)) if (Object.hasOwn(b.ops, id) && !sameValue(a.ops[id], b.ops[id])) throw historyFailure(key);
  if (!counts) {
    const aInB = Object.keys(a.ops).every(id => Object.hasOwn(b.ops, id));
    const bInA = Object.keys(b.ops).every(id => Object.hasOwn(a.ops, id));
    if (aInB && bInA && a.head !== b.head) throw historyFailure(key);
    if (aInB) return b;
    if (bInA) return a;
    throw historyFailure(key);
  }
  const h = { ...a, ops: { ...a.ops, ...b.ops } };
  if (!validHistory(h, true)) throw historyFailure(key);
  return h;
}
// Diary writes use the same transaction for the row and its causal tombstone.
function diaryWrite(t, key, next, die) {
  const record = mergeRecorder(t.objectStore('kv'), 'log', key);
  const g = t.objectStore('log').get(key);
  g.onsuccess = () => {
    try {
      record(g.result ?? null, next);
      if (next === null) t.objectStore('log').delete(key);
      else t.objectStore('log').put(next);
    }
    catch (e) { die(e); }
  };
}
function diaryMutation(key, next, clear = false) {
  if (frozen) return Promise.reject(frozenError());
  return open().then(idb => new Promise((resolve, reject) => {
    const t = idb.transaction(['log', 'kv'], 'readwrite');
    let error;
    const die = e => { error = e; t.abort(); };
    if (clear) {
      const g = t.objectStore('log').getAll();
      g.onsuccess = () => { for (const row of g.result) diaryWrite(t, row.id, null, die); };
    } else diaryWrite(t, key, next, die);
    t.oncomplete = () => resolve(next === null ? undefined : key);
    t.onerror = t.onabort = () => reject(error || t.error || new Error('Diary write aborted'));
  }));
}

function historyTarget(k) {
  const match = /^mergeHistory:(kv|log):(.+)$/.exec(k);
  if (!match) throw historyFailure(k);
  let key;
  try { key = JSON.parse(match[2]); } catch { throw historyFailure(k); }
  if ((typeof key !== 'string' && typeof key !== 'number') ||
      (match[1] === 'kv' && !MERGE_KV.has(key)) || k !== mergeKey(match[1], key)) throw historyFailure(k);
  return { store: match[1], key };
}
function validateMergeHistory(kv, log) {
  const values = new Map(kv.map(r => [r.k, r.v]));
  const meals = new Map(log.map(r => [r.id, r]));
  for (const { k, v } of kv) {
    if (!k.startsWith(MERGE_PREFIX)) continue;
    const { store, key } = historyTarget(k), counts = store === 'kv' && MERGE_COUNTS.has(key);
    if (!validHistory(v, counts) || (store === 'kv' && !values.has(key)) ||
        !sameValue(historyValue(v, counts), normalized(store === 'kv' ? values.get(key) : meals.get(key), counts))) throw historyFailure(key);
  }
}
function mergeProgress(localKv, fileKv, localLog, fileLog) {
  const local = new Map(localKv.map(r => [r.k, r.v])), file = new Map(fileKv.map(r => [r.k, r.v]));
  const kv = [], log = [], deleted = [];
  for (const key of MERGE_KV) {
    if (!file.has(key)) continue;
    const hk = mergeKey('kv', key), a = local.get(hk), b = file.get(hk), counts = MERGE_COUNTS.has(key);
    if (!local.has(key)) continue; // a genuinely new resource row imports as-is
    const h = joinHistory(key, a, b, local.get(key), file.get(key), counts);
    if (h) kv.push({ k: hk, v: h }, { k: key, v: historyValue(h, counts) });
  }
  const meals = new Map(localLog.map(r => [r.id, r])), incoming = new Map(fileLog.map(r => [r.id, r]));
  const ids = new Set(incoming.keys());
  for (const k of file.keys()) if (k.startsWith(`${MERGE_PREFIX}log:`)) ids.add(historyTarget(k).key);
  for (const key of ids) {
    const hk = mergeKey('log', key), a = local.get(hk), b = file.get(hk);
    const av = meals.get(key) ?? null, bv = incoming.get(key) ?? null;
    let h;
    if (!a && !meals.has(key)) h = b; // different-id meals still join
    else h = joinHistory(key, a, b, av, bv, false);
    if (h) kv.push({ k: hk, v: h });
    const value = h ? historyValue(h, false) : bv;
    if (value === null) deleted.push(key); else log.push(value);
  }
  return { kv, log, deleted };
}

/* L2 currency history. A balance is a projection of one shared opening balance
   and a union of signed mutations. Replays add nothing; independent credits and
   debits both survive. The opening id is exported with the save, never a device
   id copied into two writers. There is deliberately no history pruning without
   an acknowledgement protocol from every offline device. */
const CURRENCY = { coins: 'coinsRev', bonedust: 'dustRev' };
const historyKey = k => `${k}History`;
function currencyTotal(h) {
  return h.balance + Object.values(h.ops).reduce((n, d) => n + d, 0);
}
function currencyHistory(h) {
  return h && h.format === 1 && typeof h.id === 'string' && h.id.length > 0 &&
    Number.isFinite(h.balance) && h.balance >= 0 && Number.isFinite(h.revision) && h.revision >= 0 &&
    h.ops && typeof h.ops === 'object' && !Array.isArray(h.ops) &&
    Object.values(h.ops).every(Number.isFinite) && Number.isFinite(currencyTotal(h)) && currencyTotal(h) >= 0;
}
function openingHistory(balance, revision) {
  return { format: 1, id: balance === 0 && revision === 0 ? 'empty' : crypto.randomUUID(),
    balance, revision, ops: {} };
}
// Queue reads BEFORE the balance updater, including before its sibling revision
// updater. Everything below runs within the caller's existing transaction.
function currencyRecorder(os, k, receipt = null) {
  if (MERGE_KV.has(k)) {
    const record = mergeRecorder(os, 'kv', k, receipt), before = os.get(k);
    return (_before, next) => record(before.result?.v, next);
  }
  if (!Object.hasOwn(CURRENCY, k)) return () => {};
  const hg = os.get(historyKey(k)), rg = os.get(CURRENCY[k]);
  return (before, next) => {
    const balance = Number(before) || 0, revision = Number(rg.result?.v) || 0;
    const h = hg.result?.v ?? openingHistory(balance, revision);
    if (!currencyHistory(h) || currencyTotal(h) !== balance) {
      throw new Error(`Cannot update ${k}: currency history does not match the balance.`);
    }
    const id = receipt || crypto.randomUUID();
    const delta = next - balance;
    if (Object.hasOwn(h.ops, id)) throw new Error(`Cannot repeat currency receipt ${id}.`);
    const updated = { ...h, ops: { ...h.ops, [id]: delta } };
    if (!currencyHistory(updated)) throw new Error(`Cannot update ${k}: invalid currency amount.`);
    os.put({ k: historyKey(k), v: updated });
  };
}
function mergeCurrencyHistory(k, local, file) {
  const rev = CURRENCY[k], hk = historyKey(k);
  const a = local.get(hk), b = file.get(hk);
  const fail = () => { throw new Error(`Cannot merge ${k}: missing or incompatible currency history. Both saves must be retained for recovery.`); };
  for (const [rows, h] of [[local, a], [file, b]]) {
    if (h !== undefined && (!currencyHistory(h) || !rows.has(k) || currencyTotal(h) !== rows.get(k))) fail();
  }
  if (!a && !b) return null; // Legacy-only snapshots retain the documented revision fallback.
  if (!file.has(k)) return a ? [{ k: hk, v: a }] : fail();
  if (!local.has(k)) return b ? [{ k: hk, v: b }] : fail();
  let h;
  if (a && b) {
    if (a.id !== b.id || a.balance !== b.balance || a.revision !== b.revision) fail();
    const ops = Object.assign(Object.create(null), a.ops);
    for (const [id, delta] of Object.entries(b.ops)) {
      if (Object.hasOwn(ops, id) && ops[id] !== delta) fail();
      ops[id] = delta;
    }
    h = { ...a, ops };
  } else {
    h = a || b;
    const legacy = a ? file : local;
    // An untracked copy of the opening snapshot or this exact projection adds
    // nothing. Anything else is ambiguous, so do not overwrite either session.
    const balance = legacy.get(k), revision = Number(legacy.get(rev)) || 0;
    const tracked = a ? local : file;
    if (!((balance === h.balance && revision === h.revision) ||
        (balance === currencyTotal(h) && revision === (Number(tracked.get(rev)) || 0)))) fail();
  }
  if (!currencyHistory(h)) fail(); // Concurrent spends cannot exceed the shared wallet.
  return [{ k, v: currencyTotal(h) }, { k: rev, v: Math.max(Number(local.get(rev)) || 0, Number(file.get(rev)) || 0) }, { k: hk, v: h }];
}

/* ATOMIC INSERT-IF-ABSENT. Returns true only for the caller whose row landed.
 *
 * `add` (not `put`) fails with ConstraintError when the key is taken, and the
 * check and the insert are the SAME request, so there is no window between
 * them for a second tab to slip through. The preventDefault is load-bearing:
 * an unhandled request error bubbles to the transaction and ABORTS it, which
 * would turn "somebody else already has this key" into a rejected promise and
 * a lost write for whatever else shared the transaction. */
export function addIfAbsent(store, val) {
  if (frozen) return Promise.reject(frozenError());
  /* Same stamp discipline as db.put, and it has to be here: a LOSING caller's
     add never lands, but the winner's did, and this process cannot tell which
     it is until the transaction completes. Stamping before dispatch means the
     losing case invalidates a cache that may be missing the winner's row, which
     is the safe direction. js/game.js reads the stamp back and is written
     against exactly this: see awardOnce. */
  bumpStore(store);
  return guard(store, val, 'addIfAbsent', () => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store === 'log' ? ['log', 'kv'] : store, 'readwrite');
    let inserted = true, error;
    const diary = store === 'log' ? mergeRecorder(t.objectStore('kv'), 'log', val.id) : null;
    const req = t.objectStore(store).add(val);
    if (diary) req.onsuccess = () => {
      try { diary(null, val); } catch (e) { error = e; t.abort(); }
    };
    req.onerror = e => {
      if (req.error && req.error.name === 'ConstraintError') {
        inserted = false;
        e.preventDefault();      // "already there" is an answer, not a failure
        e.stopPropagation();
      }
    };
    t.oncomplete = () => resolve(inserted);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(error || t.error || new Error('addIfAbsent aborted'));
  })));
}

/* ATOMIC CLAIM-AND-PAY: the claim AND everything it buys, in ONE transaction.
 *
 * addIfAbsent makes the CLAIM indivisible and nothing else. Every caller then
 * paid in LATER transactions, so a process death between them left a minted
 * ledger row and no reward: the action was spent and the player got nothing.
 * QA round 28 Y5 measured it on the Boneyard collect, where the ingredient and
 * the feast coin bonus were two more writes downstream again, in js/app.js.
 *
 * `row` is added to `store` with add(), the same test-and-set addIfAbsent is
 * built on, and the payout is dispatched from INSIDE that request's success
 * callback, so it joins the SAME transaction. A loser writes nothing at all.
 * Resolves true only for the caller whose row landed.
 *
 * `pay.kv` is {key: fn} with kvUpdate's exact contract: `fn` MUST be
 * synchronous (an await would let the transaction finish under it) and
 * returning `undefined` writes nothing. `pay.puts` is [{store, val}] for rows
 * whose key this caller minted, which need no read first. */
export function claimAndPay(store, row, { kv = {}, puts = [] } = {}) {
  if (frozen) return Promise.reject(frozenError());
  const kvKeys = Object.keys(kv);
  const stores = [...new Set([store, ...(kvKeys.length || store === 'log' || puts.some(p => p.store === 'log') ? ['kv'] : []), ...puts.map(p => p.store)])];
  for (const s of stores) bumpStore(s);   // same stamp discipline as addIfAbsent
  return guard(store, row, 'claimAndPay', () => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(stores, 'readwrite');
    let inserted = true;
    let threw = null;
    const die = e => { threw = e; try { t.abort(); } catch { /* already going */ } };
    const diary = store === 'log' ? mergeRecorder(t.objectStore('kv'), 'log', row.id) : null;
    const req = t.objectStore(store).add(row);
    req.onerror = e => {
      if (req.error && req.error.name === 'ConstraintError') {
        inserted = false;
        e.preventDefault();      // "already claimed" is an answer, not a failure
        e.stopPropagation();
      }
    };
    req.onsuccess = () => {
      try {
        if (diary) diary(null, row);
        const os = kvKeys.length ? t.objectStore('kv') : null;
        for (const k of kvKeys) {
          const record = currencyRecorder(os, k, `claim:${store}:${row.key ?? row.k ?? row.id}:${k}`);
          const g = os.get(k);
          g.onsuccess = () => {
            try {
              const next = kv[k](g.result ? g.result.v : undefined);
              if (next !== undefined) { record(g.result?.v, next); os.put({ k, v: next }); }
            } catch (e) { die(e); }
          };
        }
        for (const p of puts) {
          if (p.store === 'log') diaryWrite(t, p.val.id, p.val, die);
          else t.objectStore(p.store).put(p.val);
        }
      } catch (e) { die(e); }
    };
    t.oncomplete = () => resolve(inserted);
    t.onerror = () => reject(threw || t.error);
    t.onabort = () => reject(threw || t.error || new Error('claimAndPay aborted'));
  })));
}

/* ATOMIC TAKE. Hands the row over and deletes it, in ONE transaction.
 *
 * An inventory row (a crate, an egg, a piece of gear) IS the right to one
 * payout, so reading it and deleting it in a second transaction lets two
 * overlapping callers both read it and both get paid. Two tabs melting the
 * same gear cannot both be told they melted it.
 *
 * Resolves THE ROW when this call is the one that found it, and `undefined`
 * when it was already gone. The row rather than a bare boolean because
 * openCrate has to know WHAT it took before it can roll it, and every caller
 * that only wants the yes/no reads the same answer off truthiness. */
export function take(store, key) {
  if (store === 'log') return atomic({ take: { store, key } }, 'take');
  if (frozen) return Promise.reject(frozenError());
  bumpStore(store);
  return guard(store, key, 'take', () => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    const g = os.get(key);
    let row;
    g.onsuccess = () => { row = g.result; if (row !== undefined) os.delete(key); };
    t.oncomplete = () => resolve(row);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('take aborted'));
  })));
}

/* ATOMIC TAKE-AND-PAY: db.take and everything the row buys, in ONE transaction.
 *
 * take made the CLAIM indivisible and nothing else. openCrate, hatchEgg,
 * disenchantGear and migrateLegacyEggs all took the row and then paid in later
 * transactions, so a process death between them destroyed the input and paid
 * nothing: a fully walked egg gone with no pet, a Golden Crate gone with no
 * hand (2026-09-06 economy audit). `take` here is the same get-then-delete, and
 * the payout is dispatched from INSIDE the get's success callback, exactly the
 * way claimAndPay dispatches from its add(), so it joins the SAME transaction.
 * When the row is already gone nothing at all is written and `undefined` comes
 * back, which is take's own contract.
 *
 * `pay` is claimAndPay's shape plus `dels`: `kv` {key: SYNCHRONOUS fn, undefined
 * writes nothing}, `puts` [{store, val}], `dels` [{store, key}]. A kv fn may
 * THROW to abort the whole transaction (the take included); tag the error
 * `refused` when that is a refusal rather than a failure, see reportWriteFailure.
 *
 * payAtomic is the same body with no row to take, for a payout that has no
 * single inv row as its authority (a pet mint, a pet salvage keyed on kv
 * 'petInst', where the kv fn itself is the claim and throws when the copy is
 * already gone).
 *
 * THE RECEIPT RIDES IN THE SAME TRANSACTION (2026-09-06, merged with
 * fix/currency-revisions): every 'inv' row this transaction removes, the taken
 * row and every `dels` row on 'inv', has its id appended to kv 'invTaken'
 * inside the transaction, uncapped (see takeInv below for the bound and the
 * merge rule). The receipt is the primitive's job, not the caller's, so a
 * paying take cannot forget it and a receipt can never land without its
 * delete, or the other way round. */
function atomic({ take = null, kv = {}, puts = [], dels = [], snapshot = null, decide = null, currencyReceipts = {} }, op) {
  if (frozen) return Promise.reject(frozenError());
  const kvKeys = Object.keys(kv);
  const receipts = [...(take && take.store === 'inv' ? [take.key] : []), ...dels.filter(d => d.store === 'inv').map(d => d.key)];
  const stores = [...new Set([...(take ? [take.store] : []), ...(kvKeys.length || receipts.length || snapshot || take?.store === 'log' || puts.some(p => p.store === 'log') || dels.some(d => d.store === 'log') ? ['kv'] : []), ...(snapshot?.stores || []),
    ...puts.map(p => p.store), ...dels.map(d => d.store)])];
  for (const s of stores) bumpStore(s);   // same stamp discipline as addIfAbsent
  const [label, labelKey] = take ? [take.store, take.key] : ['kv', kvKeys[0]];
  return guard(label, labelKey, op, () => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(stores, 'readwrite');
    let row = true;           // payAtomic resolves true; takeAndPay resolves the row
    let threw = null;
    const die = e => { threw = e; try { t.abort(); } catch { /* already going */ } };
    const pay = () => {
      try {
        const os = kvKeys.length ? t.objectStore('kv') : null;
        for (const k of kvKeys) {
          const record = currencyRecorder(os, k, take ? `take:${take.store}:${take.key}:${k}` : currencyReceipts[k]);
          const g = os.get(k);
          g.onsuccess = () => {
            try {
              const next = kv[k](g.result ? g.result.v : undefined);
              if (next !== undefined) { record(g.result?.v, next); os.put({ k, v: next }); }
            } catch (e) { die(e); }
          };
        }
        for (const p of puts) {
          if (p.store === 'log') diaryWrite(t, p.val.id, p.val, die);
          else t.objectStore(p.store).put(p.val);
        }
        for (const d of dels) {
          if (d.store === 'log') diaryWrite(t, d.key, null, die);
          else t.objectStore(d.store).delete(d.key);
        }
        if (receipts.length) {
          const kvs = t.objectStore('kv');
          const tg = kvs.get('invTaken');
          tg.onsuccess = () => {
            const arr = Array.isArray(tg.result && tg.result.v) ? tg.result.v : [];
            const add = receipts.filter(id => !arr.includes(id));
            if (add.length) kvs.put({ k: 'invTaken', v: [...arr, ...add] });
          };
        }
      } catch (e) { die(e); }
    };
    // All snapshot requests finish inside this transaction. The callback is
    // synchronous and may only write stores declared up front. No pre-read can
    // authorize a spend. Existing callers retain their original payload shape.
    const decideLive = () => {
      const state = {}, rows = {};
      const keys = snapshot.keys || [], names = snapshot.stores || [];
      let left = keys.length + names.length;
      const ready = () => {
        if (--left > 0) return;
        try {
          const plan = decide(state, rows);
          if (!plan || typeof plan.then === 'function') throw new Error('atomic decision must be synchronous');
          row = plan.result;
          kv = plan.kv || {}; kvKeys.splice(0, kvKeys.length, ...Object.keys(kv));
          puts = plan.puts || []; dels = plan.dels || [];
          currencyReceipts = plan.currencyReceipts || {};
          receipts.push(...dels.filter(d => d.store === 'inv').map(d => d.key));
          pay();
        } catch (e) { die(e); }
      };
      for (const k of keys) { const g = t.objectStore('kv').get(k); g.onsuccess = () => { state[k] = g.result?.v; ready(); }; }
      for (const name of names) { const g = t.objectStore(name).getAll(); g.onsuccess = () => { rows[name] = g.result; ready(); }; }
      if (!left) { left = 1; ready(); }
    };
    if (snapshot) {
      if (take || typeof decide !== 'function') die(new Error('invalid atomic snapshot request'));
      else decideLive();
    } else if (take) {
      const os = t.objectStore(take.store);
      const g = os.get(take.key);
      g.onsuccess = () => {
        row = g.result; if (row === undefined) return;
        if (take.store === 'log') diaryWrite(t, take.key, null, die);
        else os.delete(take.key);
        pay();
      };
    } else pay();
    t.oncomplete = () => resolve(row);
    t.onerror = () => reject(threw || t.error);
    t.onabort = () => reject(threw || t.error || new Error(`${op} aborted`));
  })));
}
export function takeAndPay(store, key, pay = {}) { return atomic({ ...pay, take: { store, key } }, 'takeAndPay'); }
export function payAtomic(pay = {}) { return atomic(pay, 'payAtomic'); }

/* ATOMIC READ-MODIFY-WRITE on one kv row. `fn` MUST be synchronous, see above.
   Returns the value that was actually stored. This is the replacement for every
   `const v = await kvGet(k); v.push(x); await kvSet(k, v)` in the tree: that
   shape loses one of two concurrent additions every time it interleaves.

   RETURN `undefined` FROM `fn` TO WRITE NOTHING. That is how a caller says "on
   looking at the real state inside the transaction, there is nothing to do
   here": a collect on an empty pot, a harvest of a bed somebody else just took,
   a tribute already claimed. It matters because those callers are the ones
   whose whole job is to decide whether a payout is owed, and a no-op that still
   wrote the record back would touch a row it never changed. kvUpdate then
   resolves undefined, so `if (!out.ok)` and `if (next === undefined)` are both
   honest readings of "I did not take the state". */
export function kvUpdate(k, fn, fallback = null) {
  if (frozen) return Promise.reject(frozenError());
  bumpStore('kv');
  return guard('kv', k, 'kvUpdate', () => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction('kv', 'readwrite');
    const os = t.objectStore('kv');
    const record = currencyRecorder(os, k);
    const g = os.get(k);
    let next;
    let threw = null;
    g.onsuccess = () => {
      const cur = g.result ? g.result.v : fallback;
      try { next = fn(cur); if (next !== undefined) record(cur, next); } catch (e) { threw = e; try { t.abort(); } catch { /* already going */ } return; }
      if (next !== undefined) os.put({ k, v: next });
    };
    t.oncomplete = () => resolve(next);
    t.onerror = () => reject(threw || t.error);
    t.onabort = () => reject(threw || t.error || new Error('kvUpdate aborted'));
  })));
}

/* kvUpdate ABOVE, BUT ACROSS SEVERAL KV ROWS IN ONE TRANSACTION.
 *
 * cancelCook (js/cooking.js) used to null the pot's kv row and refund its
 * ingredients as two separate kvUpdate calls: correct against a same-instant
 * double-cancel (each transaction refuses on its own), but a crash between the
 * two left the pot gone with the ingredients never returned. Same shape as the
 * `kv` map claimAndPay already runs inside ONE transaction for a claim-and-pay;
 * this is that same multi-key loop without requiring a claim row to hang it
 * off, for callers that only need several kv rows to commit or abort together.
 *
 * `updaters` is {key: fn}, each fn synchronous with kvUpdate's exact contract
 * (cur => next; undefined writes nothing; a throw aborts the WHOLE transaction,
 * so every key's write is discarded, not only the one that threw). Keys run in
 * the order given, so a later updater can read state set by an earlier one
 * (cancelCook's ingredients fn only refunds once the cooking fn has decided
 * there is something to refund). `fallbacks` is {key: value} for a row that
 * has never been written, same as kvUpdate's own `fallback` arg, per key
 * because 'cooking' and 'ingredients' do not share a shape. Resolves
 * {key: result}. */
export function kvUpdateMulti(updaters, fallbacks = {}) {
  if (frozen) return Promise.reject(frozenError());
  bumpStore('kv');
  const keys = Object.keys(updaters);
  return guard('kv', keys, 'kvUpdateMulti', () => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction('kv', 'readwrite');
    const os = t.objectStore('kv');
    const out = {};
    let threw = null;
    for (const k of keys) {
      const record = currencyRecorder(os, k);
      const g = os.get(k);
      g.onsuccess = () => {
        if (threw) return;
        const cur = g.result ? g.result.v : (k in fallbacks ? fallbacks[k] : null);
        let next;
        try { next = updaters[k](cur); if (next !== undefined) record(cur, next); } catch (e) { threw = e; try { t.abort(); } catch { /* already going */ } return; }
        out[k] = next;
        if (next !== undefined) os.put({ k, v: next });
      };
    }
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(threw || t.error);
    t.onabort = () => reject(threw || t.error || new Error('kvUpdateMulti aborted'));
  })));
}

/* The currency primitive. `coins` and `bonedust` are plain numbers in kv and
   every balance change in the game goes through here, so this one function is
   the difference between an exact balance and a drifting one. The clamp is the
   same `Math.max(0, ...)` the callers used to apply outside the transaction. */
export function kvBump(k, n, { min = 0 } = {}) {
  return kvUpdate(k, cur => Math.max(min, (Number(cur) || 0) + n), 0);
}

/* THE REVISIONED CURRENCY PRIMITIVE (2026-09-06, Codex audit of v485).
   `coins`/`coinsRev` and `bonedust`/`dustRev` are the balance and the merge
   ordering signal importAll reads to refuse a stale blob. They used to move in
   TWO transactions (coinsAdd: kvBump, then kvBump), and every debit moved the
   balance ALONE: spendCoins, spendDust, buyRackItem's claimAndPay, and Bone
   Dust had no revision at all. A same-revision blob taken before the spend
   then won on "higher balance" and silently refunded the purchase while the
   item stayed. Measured in tests/coins-merge-tie-audit.mjs: COIN-DEBIT got
   100 expected 10, DUST-DEBIT got 100 expected 10.
   Both rows move in ONE readwrite transaction here, same shape as kvUpdate
   (get inside the transaction, put inside the get's success callback, a sync
   decision, nothing awaited). The revision bumps by the MAGNITUDE of the
   change (see js/loot.js coinsAdd's R38-13 note on why not a flat 1).
   `requireFunds`: refuse (write NOTHING, resolve undefined) when the balance
   cannot cover the debit; that is spendCoins/spendDust's "could not afford
   it". Without it the balance clamps at 0, kvBump's contract. */
export function kvBumpRevisioned(k, revKey, n, { requireFunds = false } = {}) {
  if (frozen) return Promise.reject(frozenError());
  bumpStore('kv');
  return guard('kv', k, 'kvBumpRevisioned', () => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction('kv', 'readwrite');
    const os = t.objectStore('kv');
    const record = currencyRecorder(os, k);
    const bg = os.get(k), rg = os.get(revKey);
    let pending = 2, next, threw;
    const write = () => {
      if (--pending) return;   // both reads are in; decide and put in one go
      const bal = Number(bg.result && bg.result.v) || 0;
      if (requireFunds && bal + n < 0) return;
      next = Math.max(0, bal + n);
      try { record(bal, next); } catch (e) { threw = e; t.abort(); return; }
      os.put({ k, v: next });
      os.put({ k: revKey, v: (Number(rg.result && rg.result.v) || 0) + Math.max(1, Math.abs(n)) });
    };
    bg.onsuccess = write;
    rg.onsuccess = write;
    t.oncomplete = () => resolve(next);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(threw || t.error || new Error('kvBumpRevisioned aborted'));
  })));
}

/* ATOMIC TAKE WITH RECEIPT (2026-09-06, Codex audit). Deletes an 'inv' row AND
   records its id in kv 'invTaken' in ONE transaction. The two used to be
   separate writes (db.del, then a kvUpdate), so a process death between them
   left the row gone with no receipt, and the next cloud merge of a blob that
   still carried it put it straight back. Resolves the row when this call found
   it (and so owns the one payout it stood for), undefined when it was already
   gone; a gone row writes no receipt, whoever took it wrote one.
   THE TOMBSTONE HAS NO SIZE CAP. 'invTaken' and openCrate's 'crateTaken' kept
   only the newest 500 ids, so an old enough snapshot revived item 1 the moment
   item 501 was taken (tests/inv-tombstone-audit.mjs RING). Bound, measured:
   one newId() is 20 bytes plus JSON punctuation, ~23 bytes an id, so 10,000
   consumed rows is ~230 KB inside a backup blob whose D1 ceiling is 2.2 MB
   (server/src/index.js). importAll UNIONS the list on a merge, so a tombstone
   never drops while any device's blob can still carry the row.
   ponytail: prune an id once it is absent from local inv AND the newest pulled
   blob, if the list ever measurably matters; that reopens a third-device hole.
   Since the merge with fix/atomic-take-and-pay this is takeAndPay with nothing
   to pay: the receipt is written by atomic() above for EVERY 'inv' removal, so
   the two lanes share one body and cannot drift. */
export function takeInv(id) { return atomic({ take: { store: 'inv', key: id } }, 'takeInv'); }

export const db = {
  put: (store, val) => {
    if (store === 'kv' && MERGE_KV.has(val.k)) return kvUpdate(val.k, () => val.v).then(() => val.k);
    bumpStore(store);
    return guard(store, val, 'put', () => store === 'log' ? diaryMutation(val.id, val) : tx(store, 'readwrite', s => s.put(val)));
  },
  del: (store, key) => { bumpStore(store); return guard(store, key, 'del', () => store === 'log' ? diaryMutation(key, null) : tx(store, 'readwrite', s => s.delete(key))); },
  get: (store, key) => tx(store, 'readonly', s => s.get(key)),
  clear: (store) => { bumpStore(store); return guard(store, null, 'clear', () => store === 'log' ? diaryMutation(undefined, null, true) : tx(store, 'readwrite', s => s.clear())); },
  all: (store) => tx(store, 'readonly', s => s.getAll()),
  count: (store) => tx(store, 'readonly', s => s.count()),
  epoch: (store) => storeEpoch(store),
  /* The two atomic ones, defined above and hung here so every caller that
     already has `db` can reach them without a second import. */
  addIfAbsent: (store, val) => addIfAbsent(store, val),
  claimAndPay: (store, row, pay) => claimAndPay(store, row, pay),
  take: (store, key) => take(store, key),
  takeAndPay, payAtomic,   // shorthand on purpose: reward-sop-audit's scanner reads `takeAndPay(` as a paying site
  takeInv: (id) => takeInv(id),
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
 * THE RULES, and an honest account of what each one is worth. Two of them,
 * numbered 1 and 3; the number 2 is retired, see below.
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
 *  2. THERE IS NO RULE 2 ANY MORE (QA round 26 O10, round 28 G4). It read
 *     "days claimed since an anchor may not outrun days elapsed since it",
 *     with both terms read off Date.now(), the SAME clock dateKey() reads. A
 *     clock move shifts both terms together, so across 33 walked days, a +30
 *     and a +31 jump and four skip-aheads it never fired once, while this
 *     header credited it with catching wild jumps and a banked idle month.
 *     Its only reachable trigger was a TIMEZONE change (a local date advancing
 *     with no UTC elapsed), which rule 1 already caps at one hop. A rule that
 *     cannot fire is worse than no rule: it is described as a guard, tested as
 *     a guard, and guards nothing. The one clock the player cannot move is the
 *     server's, and that is rule 3, so "give rule 2 a trustable clock" IS rule
 *     3. Do not rebuild it. Its kv rows (dayPaceKey, dayPaceAt) are left in
 *     place in old saves and never read.
 *
 * WHAT RULE 1 CANNOT DO, stated so nobody has to rediscover it: nothing
 * local detects a plain forward clock move, because there is no trustworthy
 * clock on the device to compare against. `performance.now()` is monotonic but
 * resets on every page load, so a force-quit erases it. Rule 1's value is
 * entirely that the move cannot be undone; rule 3 is what bounds it.
 *
 * WHY NOT A ROLLING "20 HOURS SINCE THE LAST DAY WE SAW". It was the first
 * design and it BRICKS HONEST PLAYERS, every day, for free. The stamp would be
 * rewritten on the player's last interaction of the day, so somebody who opens
 * the app at 23:00 and again at 08:00 the next morning has nine hours between
 * a real day boundary, is refused, and loses a genuine day of rewards. Any
 * evening-then-morning player hits it. Nothing here measures hours: rule 1
 * compares calendar days and rule 3 compares them to the server's.
 *
 * NTP / FLAT BATTERY, and why this cannot brick an honest player. A flat
 * battery leaves a phone booting on its RTC default, and NTP corrects it a few
 * seconds later, usually before the app is open at all.
 *   - Corrected BACKWARDS (the RTC had run fast, or read a future default):
 *     the wrong future day is refused by rule 3 if it is past the server's
 *     day plus WITNESS_GRACE, and a refusal WRITES NOTHING, so the high-water
 *     mark never learns the bad date. When NTP lands, the true date is still
 *     at or above the mark and the player carries on with nothing lost. Inside
 *     WITNESS_GRACE the bad day is accepted and the mark moves ahead, which
 *     costs at most those days of dailies once, and never repeats.
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
 * care and rule 3 has a week of allowance, so an LA-to-Sydney flight (Monday
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

/* ------------------------------------------------------------------------
 * RULE 3: THE SERVER'S DAY. This is the part no local rule could do, and it
 * is THE guard against a forward clock move: the only one, not the last line.
 *
 * Rule 1 is read off the SAME clock the farmer is moving (and so was the
 * retired rule 2), so a plain forward walk (jump 24h, collect, jump 24h again)
 * satisfies it: the day advances, and Date.now() advances with it.
 * tests/clock-trust-audit.mjs measured that walk at 176.4 XP and 64.6 coins
 * per reset with no ceiling in sight, and the header above says plainly that
 * no local rule can see it. It cannot. There is exactly one clock in this
 * system the player's Settings app cannot move, and it is the server's.
 *
 * WHAT IS WITNESSED. `GET /health` (server/src/index.js:190) already answers
 * `{ ok, ts }` with the server's own Date.now(). It is UNSIGNED and takes no
 * identity, which is what makes it usable here: a device whose clock is a day
 * out cannot make a SIGNED call at all (verifySigned refuses a timestamp more
 * than five minutes off, server/src/index.js:89), so the one call we need is
 * the one that still works while the clock is wrong. js/social.js
 * touchServerDay() does the fetch and calls witnessServerDay() below.
 *
 * NO SERVER CHANGE AND NO MIGRATION. The endpoint, the response and the
 * client's fetch plumbing all already existed. This is a read.
 *
 * THE RULE. A day may be opened if its ordinal is at most WITNESS_GRACE days
 * past the newest day the server has ever been seen to be on. The mark only
 * ever RISES (Math.max on write), so a lying or replayed answer cannot lower
 * the ceiling, and neither can restoring an old backup: importAll keeps the
 * higher of the two.
 *
 * WHAT IT ACTUALLY BUYS. It converts the forward walk from unbounded into a
 * ONE-TIME bubble of WITNESS_GRACE days followed by a hard stop. To open day
 * N+8 the farmer needs the server to have reached day N+1, and the only way to
 * make that happen is to wait a real day. The steady-state farm rate is
 * therefore one day of dailies per real day, which is what an honest player
 * gets. Paired with rule 1 the bubble is not even free: the high-water mark is
 * left seven days in the future, so the next seven REAL days pay nothing and
 * the farmer has borrowed a week rather than earned one.
 *
 * OFFLINE IS THE WHOLE REASON FOR THE GRACE. This is an offline-first app and
 * people log food on planes. Inside the window nothing changes for anybody:
 * the guard is a ceiling, never a requirement, so a player who has not seen
 * the server in six days still opens every day normally. Past the window the
 * DAILIES pause (wheel, day-close crate, daily quests, free Pit fights) and
 * nothing else does: logging food, weight, steps, XP for what you logged, the
 * shop, the Pit, and every screen keep working, because none of those are
 * day-gated. The pause is stateless, like every other refusal here, so one
 * successful /health, on any network, on any later day, restores full service
 * immediately and permanently. The cost of a genuinely offline eighth day is
 * that day's dailies, once. Deferring the payout instead of refusing it was
 * considered and rejected: it would need a pending queue in front of every
 * gate in the game to buy back a case that starts on the eighth day.
 *
 * THE OFFLINE-ONLY DEVICE. A device that has never once reached the server has
 * nothing to be judged against, so the first call SEEDS the mark from whatever
 * day it is standing on and lets it through, exactly as the high-water mark
 * does. That is deliberate and it is bounded: the seed hands out a ceiling,
 * not days, and rule 1 stops the farmer walking BACK to collect the days below
 * it. A fresh install that seeds at some absurd future date therefore gets one
 * day of rewards there and then stops dead until the calendar catches up.
 *
 * WHAT IT STILL DOES NOT STOP, and nobody should have to rediscover it: this
 * is client code, so devtools still wins (kvSet the mark, or edit this file).
 * kv `apiBase` is settable from the URL (?api=), so a player who points the
 * app at a server they control can hand it any time they like; that is the
 * same tier as devtools, not the same tier as the Settings clock toggle this
 * closes. And a full "erase all data" or a clean reinstall reseeds everything,
 * which is true of every mark in the app and costs the player their save.
 * ------------------------------------------------------------------------ */
/* 7 days: ONE is spent on timezones (a local date legitimately runs up to a
   day ahead of the UTC date the server's ms lands on) and SIX is the offline
   stretch an honest player gets for free. A week covers a flight, a cabin, a
   cruise and a dead SIM. It is also the size of the farmer's one-time bubble,
   and seven borrowed days repaid with seven dead ones is the right trade for
   never blocking a real player who simply has no signal. */
export const WITNESS_GRACE = 7;
export const DAY_WITNESS_KEY = 'dayWitnessOrd';

/* Record that the server was seen to be at `serverMs`. Monotonic by
   construction: an older or forged-backwards answer is ignored rather than
   trusted, so the ceiling can only ever go up. Returns the mark in force. */
export async function witnessServerDay(serverMs) {
  const ms = Number(serverMs);
  const cur = Number(await kvGet(DAY_WITNESS_KEY, 0)) || 0;
  if (!Number.isFinite(ms) || ms <= 0) return cur;
  /* 2026-09-05: this used to be Math.floor(ms / DAY_MS), the UTC calendar day.
     claimDay's `o`/`oh` are dayOrdinal(key), the LOCAL calendar day (dateKey()
     is getFullYear/Month/Date, not UTC). The two ordinal systems agree most of
     the day and disagree by exactly 1 for the hours where the device's local
     date and the UTC date of the same instant differ, which is most hours of
     the day off UTC+0. Measured: witness recorded 21131 for an instant whose
     LOCAL date was "2027-11-08", and dayOrdinal("2027-11-08") is 21130 -- a
     forward claim one day past the WITNESS_GRACE ceiling landed AT the ceiling
     instead of past it, and rule 3 let it through. Convert to the same LOCAL
     calendar day claimDay reads, so both sides of every comparison are one
     ordinal. */
  const o = dayOrdinal(dateKey(new Date(ms)));
  if (o > cur) { await kvSet(DAY_WITNESS_KEY, o); return o; }
  return cur;
}

// Shared synchronous decision. Laboratory applies writes with its own commit.
export function dayDecision(key, hw, rawWitness, strict = false) {
  const o = dayOrdinal(key), oh = dayOrdinal(hw), witness = Number(rawWitness) || 0;
  if (!Number.isFinite(o) || (strict && !/^\d{4}-\d{2}-\d{2}$/.test(key))) return {fresh: !strict, reason:'unparseable', writes:{}};
  if (!Number.isFinite(oh)) return {fresh:true, reason:'seeded', writes:{dayHighWater:key, ...(!witness ? {[DAY_WITNESS_KEY]:o} : {})}};
  if (o < oh) return {fresh:false, reason:'backwards', highWater:hw, writes:{}};
  if (o === oh) return {fresh:true, reason:'same-day', writes:{}};
  if (witness && o > witness + WITNESS_GRACE) return {fresh:false, reason:'unwitnessed', highWater:hw, witness, ceiling:witness+WITNESS_GRACE, claimed:o, writes:{}};
  return {fresh:true, reason:'advanced', writes:{dayHighWater:key, ...(!witness ? {[DAY_WITNESS_KEY]:o} : {})}};
}
export async function claimDay(key) {
  return payAtomic({snapshot:{keys:['dayHighWater', DAY_WITNESS_KEY]}, decide:s=>{
    const {writes, ...answer} = dayDecision(key, s.dayHighWater, s[DAY_WITNESS_KEY]);
    return {kv:Object.fromEntries(Object.entries(writes).map(([k,v])=>[k,()=>v])), result:answer};
  }});
}

/* Would rule 3 refuse `key` right now? Read-only, like dayGuardState below, so
   a render path and a boot path can both ask without opening a day. This is the
   ONE refusal the player can do something about (any connection, for a moment,
   clears it), which is why it gets a predicate of its own: js/app.js awaits a
   bounded /health on it before the day close, and Today says so when it stands.
   `witness` of 0 is a device that has never seen the server, which claimDay
   SEEDS rather than refuses; false here matches that. */
export async function dayIsUnwitnessed(key) {
  const o = dayOrdinal(key);
  if (!Number.isFinite(o)) return false;
  const w = Number(await kvGet(DAY_WITNESS_KEY, 0)) || 0;
  return w > 0 && o > w + WITNESS_GRACE;
}

/* Read-only view for UI and for tests. Never writes, so it can be called from
   a render path without opening a day as a side effect. */
export async function dayGuardState() {
  const [highWater, witness] = await Promise.all([kvGet('dayHighWater', null), kvGet(DAY_WITNESS_KEY, 0)]);
  const w = Number(witness) || 0;
  return { highWater, witness: w, witnessGrace: WITNESS_GRACE, ceiling: w ? w + WITNESS_GRACE : null };
}

// File review must not call exportAll: that function seeds merge histories.
export function sameSaveRows(a, b) {
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
    return value;
  };
  const rows = value => (value || []).map(row => JSON.stringify(canonical(row))).sort();
  return JSON.stringify(rows(a)) === JSON.stringify(rows(b));
}

export async function readFileSave() {
  if (frozen) throw frozenError();
  const idb = await open();
  return new Promise((resolve, reject) => {
    const t = idb.transaction(STORES, 'readonly');
    const data = { app: 'tally', version: DB_VERSION, exportedAt: new Date().toISOString() };
    for (const s of STORES) {
      const r = t.objectStore(s).getAll();
      r.onsuccess = () => { data[s] = r.result; };
    }
    t.oncomplete = () => resolve(data);
    t.onerror = t.onabort = () => reject(t.error || new Error('Could not read the current save.'));
  });
}

// Separate from the imported stores, scoped to this database, and append-only.
// No retention eviction: a full/disabled localStorage refuses the import.
const filePointPrefix = () => `tally-file-restore:${encodeURIComponent(dbName)}:`;
export function fileRestorePoints() {
  const points = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(filePointPrefix())) {
      const point = JSON.parse(localStorage.getItem(key));
      if (!point?.data || STORES.some(s => !Array.isArray(point.data[s]))) throw new Error('A restore point could not be read.');
      points.push({ ...point, key });
    }
  }
  return points.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export function saveFileRestorePoint(data) {
  if (frozen) throw frozenError();
  const point = { createdAt: new Date().toISOString(), data };
  const key = filePointPrefix() + newId();
  try {
    const bytes = JSON.stringify(point);
    localStorage.setItem(key, bytes);
    if (localStorage.getItem(key) !== bytes) throw new Error('Restore point verification failed');
  } catch {
    throw new Error('Could not save a restore point (storage is full or unavailable). Nothing was replaced. Free device storage and try again.');
  }
  return { ...point, key };
}
function eraseFileRestorePoints() {
  // No localStorage in Node-only consumers. In a browser, a removal failure
  // rejects eraseAll, so the destructive UI offers retry instead of success.
  if (typeof localStorage === 'undefined') return;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(filePointPrefix())) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}

// A local restore point is an exact rollback, including internal bookkeeping.
// Cloud and ordinary file imports continue to use importAll's existing rules.
export async function restoreFileSave(data, expected) {
  if (frozen) throw frozenError();
  if (STORES.some(s => !Array.isArray(data?.[s]))) throw new Error('That restore point is damaged.');
  const idb = await open();
  return new Promise((resolve, reject) => {
    const t = idb.transaction(STORES, 'readwrite');
    const reads = STORES.map(s => [s, t.objectStore(s).getAll()]);
    let error;
    reads.at(-1)[1].onsuccess = () => {
      try {
        if (reads.some(([s, r]) => !sameSaveRows(r.result, expected[s]))) throw new Error('Your save changed after the review. Nothing was replaced. Reopen Restore points to review it again.');
        for (const s of STORES) {
          const store = t.objectStore(s);
          store.clear();
          for (const row of data[s]) store.put(row);
          bumpStore(s);
        }
      } catch (e) { error = e; t.abort(); }
    };
    t.oncomplete = resolve;
    t.onerror = t.onabort = () => reject(error || t.error || new Error('The restore did not finish. Your old data is unchanged.'));
  });
}

export async function exportAll() {
  if (frozen) throw frozenError();
  const idb = await open();
  return new Promise((resolve, reject) => {
    const t = idb.transaction(STORES, 'readwrite');
    const snapshot = { app: 'tally', version: DB_VERSION, exportedAt: new Date().toISOString() };
    let threw;
    const seedDiary = () => {
      if (!snapshot.log || !snapshot.kv) return;
      try {
        const rows = new Map(snapshot.kv.map(r => [r.k, r.v]));
        for (const row of snapshot.log) {
          const k = mergeKey('log', row.id);
          if (rows.has(k)) continue;
          const receipt = { k, v: newHistory(row, false) };
          t.objectStore('kv').put(receipt); snapshot.kv.push(receipt);
        }
        validateMergeHistory(snapshot.kv, snapshot.log);
      } catch (e) { threw = e; t.abort(); }
    };
    for (const store of STORES) {
      const g = t.objectStore(store).getAll();
      g.onsuccess = () => {
        snapshot[store] = store === 'kv' ? g.result.filter(r => r.k !== 'syncHealth') : g.result;
        if (store === 'log') seedDiary();
        if (store !== 'kv') return;
        try {
          const rows = new Map(g.result.map(r => [r.k, r.v]));
          for (const k of MERGE_KV) {
            if (!rows.has(k) || rows.has(mergeKey('kv', k))) continue;
            const row = { k: mergeKey('kv', k), v: newHistory(rows.get(k), MERGE_COUNTS.has(k)) };
            t.objectStore('kv').put(row); snapshot.kv.push(row);
          }
          seedDiary();
          for (const [k, rev] of Object.entries(CURRENCY)) {
            if (rows.has(historyKey(k))) {
              const h = rows.get(historyKey(k));
              if (!currencyHistory(h) || currencyTotal(h) !== rows.get(k)) throw new Error(`Cannot export ${k}: currency history does not match the balance.`);
              continue;
            }
            if (!rows.has(k)) continue;
            const row = { k: historyKey(k), v: openingHistory(Number(rows.get(k)) || 0, Number(rows.get(rev)) || 0) };
            t.objectStore('kv').put(row);
            snapshot.kv.push(row);
            bumpStore('kv');
          }
        } catch (e) { threw = e; t.abort(); }
      };
    }
    t.oncomplete = () => resolve(snapshot);
    t.onerror = t.onabort = () => reject(threw || t.error || new Error('Could not export storage'));
  });
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
 * is game state: no coins, no dust, no progress.
 *
 * ON THE MERGE PATH (replace:false, the cloud pull) the payload does NOT
 * win these keys: a device key the DEVICE already holds is kept and the
 * payload's copy is dropped. Verified 2026-08-31 by reading every importAll
 * caller: no flow supplies identity via a blob. The Settings file import is
 * replace:true; the cloud pull cannot even START without a local identity
 * (signedFetch signs with it), and a phrase restore installs the identity
 * via adoptIdentity BEFORE pulling. So the only thing a blob's identity row
 * could ever do on a merge is OVERWRITE a live key, and that is exactly the
 * total-loss bug this closes: device A's first-ever blob carried a keyless
 * identity (see pushBackup), device B pulled it over its good one, re-keyed
 * on the next push, and the two devices encrypted under different keys.
 * A device key the device does NOT hold yet still lands from the payload,
 * which keeps the pre-existing fresh-device behaviour byte-identical. */
/* DEVICE-SCOPED means the row describes THIS PHONE, not the save: it is true of
 * the hardware the app is running on and stays true when a different save is
 * restored over the top, so a payload never gets to speak for it. The two day
 * marks belong here for exactly that reason: they are the ceiling this device
 * has climbed to (the newest day it has stood on, and the newest day it has
 * seen the server stand on), and a restore is a statement about the save, not
 * about where this device's clock has been. */
const DEVICE_KV = ['syncHealth', 'identity', 'social', 'recoveryId', 'recoverySetAt', 'vaultConflict', 'bootRestored', 'cloudOff', 'apiBase', 'backupVersion', DAY_WITNESS_KEY, 'dayHighWater'];

// P3: refuse unreadable known containers before replacing any store. Unknown
// keys and unknown fields remain opaque, so exporting cannot discard new data.
// This is container validation, not a complete schema or an authenticity check.
const RESTORE_ARRAY_KV = new Set(['invTaken', 'crateTaken', 'petTaken', 'paidlooks', 'looks',
  'redeemed', 'grantsSeen', 'petInst', 'outfits', 'giftbox', 'pantry', 'foodbuffs',
  'cookq', 'routines', 'evq', 'labSeen']);
const RESTORE_MAP_KV = new Set(['equipped', 'gearloadout', 'transmog', 'petWear',
  'pets', 'petLvlSteps', 'petBonds', 'petNick', 'pettalents', 'buffs', 'ingredients',
  'potions', 'potionsRev', 'pitEnergy', 'settings', 'notifPrefs', 'grantPresentation',
  'labExperiments', 'labDaily', 'labIncubators', 'labIntents', 'labUi']);
const RESTORE_NUMBER_KV = new Set(['coins', 'coinsRev', 'bonedust', 'dustRev',
  'grantCursor', 'petLvlV', 'petStepCredit', 'petBreedCredit', 'potsOwned', 'labV']);
const MERGE_RECEIPTS = ['invTaken', 'crateTaken', 'petTaken', 'paidlooks', 'looks', 'redeemed', 'grantsSeen'];
function validateRestoreKv(rows) {
  const keys = new Set();
  for (const row of rows) {
    if (!row || typeof row.k !== 'string' || !row.k || !Object.hasOwn(row, 'v') || keys.has(row.k)) {
      throw new Error('that backup file is damaged (invalid or duplicate kv key). Your old data is unchanged.');
    }
    keys.add(row.k);
    const { k, v } = row;
    if (v != null && ((RESTORE_ARRAY_KV.has(k) && !Array.isArray(v)) ||
        (RESTORE_MAP_KV.has(k) && (typeof v !== 'object' || Array.isArray(v))) ||
        (RESTORE_NUMBER_KV.has(k) && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)))) {
      throw new Error(`that backup file is damaged or unsupported (${k}). Update the app or use another backup. Your old data is unchanged.`);
    }
    if ((k === 'petLvlV' && v > 2) || (k === 'pettalents' && v?.__iidV > 2)) {
      throw new Error(`that backup uses a newer ${k} format. Update the app, then import it again. Your old data is unchanged.`);
    }
  }
}

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
export function validateImport(data) {
  if (!data || data.app !== 'tally' || !Array.isArray(data.log)) throw new Error('Not a Tally backup file');
  /* STORES is the module-level export above. importAll used to keep its own
     copy of this list, and a second copy in js/app.js's erase loop is what
     silently lost 'inv' and left the inventory behind on a full wipe. One
     list, imported everywhere, is the fix for that whole class. */
  /* Shape check BEFORE anything opens a transaction, so "unchanged" is
     trivially true on this path. A store key that is present but is not an
     array is a damaged file, not an old one, and the two cases deserve
     different answers: this one refuses, an absent key is skipped below. */
  const damaged = STORES.filter(s => Object.hasOwn(data, s) && !Array.isArray(data[s]));
  if (damaged.length) throw new Error(`that backup file is damaged (${damaged.join(', ')}). Your old data is unchanged.`);
  /* THE VERSION IS READ, AND A NEWER FILE IS REFUSED. QA round 25 M6: nothing
     anywhere read data.version, so a file stamped by a newer app carrying an
     eighth store imported "clean" and the unknown store was silently dropped.
     That is what a launch update does to every existing player's backup the
     day a store is added. An OLDER file is fine: the store loop below leaves
     any store it omits alone and reports it in `skipped`. There is no
     migration framework here on purpose; the schema only ever grows
     (additive-only, see the header), so "older imports, newer refuses" is the
     whole rule. A file with no version at all is treated as old. */
  const fileVersion = Number(data.version) || 0;
  if (fileVersion > DB_VERSION) throw new Error(`that backup was made by a newer version of the app (v${fileVersion}; this app reads v${DB_VERSION}). Update the app, then import it again. Your old data is unchanged.`);
  if (Array.isArray(data.kv)) { validateRestoreKv(data.kv); validateLabSave(Object.fromEntries(data.kv.map(r=>[r.k,r.v]))); }
  if ((data.inv || []).some(r => r.kind === 'egg' && r.morphPolicy === 'lab-final-v1' && r.morph !== 'base')) throw new Error('inconsistent Laboratory egg policy');
  if (Array.isArray(data.kv)) {
    const rows = new Map(data.kv.map(r => [r.k, r.v]));
    for (const k of Object.keys(CURRENCY)) {
      const h = rows.get(historyKey(k));
      if (rows.has(historyKey(k)) && (!currencyHistory(h) || !rows.has(k) || currencyTotal(h) !== rows.get(k))) {
        throw new Error(`that backup has damaged or unsupported ${k} history. Your old data is unchanged.`);
      }
    }
  }
  validateMergeHistory(data.kv || [], data.log);
}

export function fileReplacementPreview(current, data) {
  // Diagnostics describe this device and must never travel with a save.
  if (data.kv) data = { ...data, kv: data.kv.filter(r => r?.k !== 'syncHealth') };
  const next = Object.fromEntries(STORES.map(s => [s, data[s] || current[s]]));
  const local = Object.fromEntries(current.kv.map(r => [r.k, r.v]));
  const file = Object.fromEntries((data.kv || []).map(r => [r.k, r.v]));
  if (data.kv) {
    const kv = new Map(data.kv.map(r => [r.k, r]));
    for (const r of current.kv) if (DEVICE_KV.includes(r.k) && !kv.has(r.k)) kv.set(r.k, r);
    for (const [k, rank] of [[DAY_WITNESS_KEY, v => Number(v) || 0], ['dayHighWater', v => dayOrdinal(v) || 0]]) {
      if (rank(local[k]) > rank(file[k])) kv.set(k, { k, v: local[k] });
    }
    next.kv = [...kv.values()];
  }
  mergeLabSave(local, file, Object.fromEntries(next.kv.map(r => [r.k, r.v])), true);
  return next;
}

export async function importAll(data, { replace = true, expectedFileState = null } = {}) {
  if (frozen) throw frozenError();
  validateImport(data);
  // Diagnostics describe this device and must never travel with a save.
  if (data.kv) data = { ...data, kv: data.kv.filter(r => r?.k !== 'syncHealth') };
  const idb = await open();
  const declared = new Set(STORES.filter(s => Array.isArray(data[s])));
  const skipped = STORES.filter(s => !declared.has(s));
  // Read and decide under the same write lock as the final puts. A gameplay
  // payout queued during import must never disappear behind a stale pre-read.
  let keptKv = [];
  let kvRows = data.kv;
  return new Promise((resolve, reject) => {
    let t, mergeError;
    try { t = idb.transaction(STORES, 'readwrite'); }
    catch { reject(new Error('the restore could not open storage. Your old data is unchanged. Try again.')); return; }
    t.oncomplete = () => resolve({ foods: (data.foods || []).length, log: (data.log || []).length, weights: (data.weights || []).length, skipped });
    t.onerror = t.onabort = () => reject(mergeError || new Error('the restore did not finish. Your old data is unchanged. Try again.'));
    // File imports alone carry a reviewed state. Check every store under the
    // replacement's write lock, before any clear/put, including queued payouts.
    const reviewedReads = expectedFileState && replace
      ? STORES.map(s => [s, t.objectStore(s).getAll()]) : null;
    const localLogRead = t.objectStore('log').getAll();
    const read = t.objectStore('kv').getAll();
    read.onsuccess = () => {
      try {
        if (reviewedReads && reviewedReads.some(([s, r]) => !sameSaveRows(r.result, expectedFileState[s]))) {
          throw new Error('Your save changed after the review. Nothing was replaced. Pick the file again to review the latest progress.');
        }
        const localKv = read.result;
        if (!replace) validateMergeHistory(localKv, localLogRead.result);
        if (replace && !declared.has('kv')) {
          for (const row of localKv) if (row.k.startsWith(`${MERGE_PREFIX}log:`)) t.objectStore('kv').delete(row.k);
        }
        let logRows = data.log;
        const logDeletes = [];
        if (!replace) {
          const merged = mergeProgress(localKv, data.kv || [], localLogRead.result, data.log);
          keptKv.push(...merged.kv); logRows = merged.log; logDeletes.push(...merged.deleted);
        }
        if (declared.has('kv')) {
          const payloadKeys = new Set(data.kv.map(r => r && r.k));
          if (replace) keptKv = localKv.filter(r => DEVICE_KV.includes(r.k) && !payloadKeys.has(r.k));
          /* MERGE: the payload never overwrites a device key this device holds
             (see the DEVICE_KV header). Resource-specific rules follow. */
          if (!replace) {
            const localKeys = new Set(localKv.map(r => r && r.k));
            kvRows = data.kv.filter(r => !(r && DEVICE_KV.includes(r.k) && localKeys.has(r.k)));
            // L2: union signed currency receipts when either snapshot has history.
            // Legacy-only snapshots cannot reveal their shared earnings; retain
            // the old revision / higher-on-tie policy for compatibility. This is
            // explicitly NOT an additive guarantee for already-diverged old saves.
            // replace:true remains an intentional rollback, outside this branch.
            const keepRevisionedBalance = (balanceKey, revKey) => {
              const local = new Map(localKv.map(r => [r.k, r.v]));
              const file = new Map(data.kv.map(r => [r.k, r.v]));
              if (!file.has(balanceKey)) {
                kvRows = kvRows.filter(r => r.k !== revKey && r.k !== historyKey(balanceKey));
                return;
              }
              const merged = mergeCurrencyHistory(balanceKey, local, file);
              if (merged) { keptKv.push(...merged); return; }
              const localRev = Number((localKv.find(r => r.k === revKey) || {}).v) || 0;
              const fileRev = Number((data.kv.find(r => r && r.k === revKey) || {}).v) || 0;
              const localRow = localKv.find(r => r.k === balanceKey);
              const fileRow = data.kv.find(r => r && r.k === balanceKey);
              const localBalance = Number(localRow && localRow.v) || 0;
              const fileBalance = Number(fileRow && fileRow.v) || 0;
              if (localRev > fileRev || (localRev === fileRev && localBalance > fileBalance)) {
                const localRevRow = localKv.find(r => r.k === revKey);
                if (localRow) keptKv.push(localRow);
                if (localRevRow) keptKv.push(localRevRow);
              }
            };
            keepRevisionedBalance('coins', 'coinsRev');
            /* 2026-09-06 (Codex audit of v485): Bone Dust had NO ordering signal at
               all, so any older blob restored dust already spent or erased dust just
               earned. 'dustRev' moves with 'bonedust' in the same transaction
               (kvBumpRevisioned above) and rides the same rule. */
            keepRevisionedBalance('bonedust', 'dustRev');
            // Potion counts now use signed receipts. Retain monotonic legacy
            // revisions for older readers, without letting a revision-only file
            // advance the ordering of a balance it does not contain.
            const localValue = k => localKv.find(r => r.k === k)?.v;
            const fileValue = k => data.kv.find(r => r.k === k)?.v;
            if (!payloadKeys.has('potions')) kvRows = kvRows.filter(r => r.k !== 'potionsRev');
            else {
              const a = localValue('potionsRev') || {}, b = fileValue('potionsRev') || {};
              keptKv.push({ k: 'potionsRev', v: Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])]
                .map(id => [id, Math.max(Number(a[id]) || 0, Number(b[id]) || 0)])) });
            }

            // Ownership is a union by INSTANCE, minus permanent take receipts.
            // Absence alone cannot distinguish a stale roster from a consumed copy.
            const taken = new Set([...(localValue('petTaken') || []), ...(fileValue('petTaken') || [])]);
            const roster = [...(localValue('petInst') || [])];
            const matched = new Set();
            const localCount = roster.length;
            for (const row of fileValue('petInst') || []) {
              // Match each local occurrence once, leaving corrupt duplicate iids for
              // petInstances' existing healer instead of silently losing a copy.
              const i = roster.findIndex((x, index) => index < localCount && !matched.has(index) &&
                (row?.iid ? x?.iid === row.iid : JSON.stringify(x) === JSON.stringify(row)));
              if (i < 0) {
                roster.push(row);
              } else {
                matched.add(i);
                const prior = roster[i];
                roster[i] = row?.iid ? { ...prior, ...row } : row;
                // Feeding earns lineage on the keeper, which a stale copy cannot undo.
                if (typeof prior?.lineage === 'number' && typeof row?.lineage === 'number') {
                  roster[i].lineage = Math.max(prior.lineage, row.lineage);
                }
              }
            }
            const livePets = roster.filter(row => !taken.has(row?.iid));
            if (payloadKeys.has('petInst') || taken.size) keptKv.push({ k: 'petInst', v: livePets });

            // Steps are earned, never spent on a surviving iid. Keep the higher bank
            // entry, like the existing high-water marks. Convert legacy species banks
            // before comparing, or an old format marker would remigrate and zero iids.
            const lv = Number(localValue('petLvlV')) || 0, fv = Number(fileValue('petLvlV')) || 0;
            if (payloadKeys.has('petLvlSteps') || payloadKeys.has('petLvlV') || taken.size) {
              const perInstance = Math.max(lv, fv) >= 2;
              const normalize = (bank, version) => {
                if (!perInstance || version >= 2) return bank || {};
                return Object.fromEntries(livePets.filter(x => x?.iid && x?.sp && bank?.[x.sp] != null)
                  .map(x => [x.iid, bank[x.sp]]));
              };
              const local = normalize(localValue('petLvlSteps'), lv);
              const file = normalize(fileValue('petLvlSteps'), fv);
              const bank = { ...local };
              for (const [iid, steps] of Object.entries(file)) bank[iid] = Math.max(bank[iid] || 0, steps);
              if (perInstance) for (const iid of taken) delete bank[iid];
              if (localValue('petLvlSteps') != null || fileValue('petLvlSteps') != null) keptKv.push({ k: 'petLvlSteps', v: bank });
              keptKv.push({ k: 'petLvlV', v: Math.max(lv, fv) });
            }
            if (payloadKeys.has('petStepCredit')) keptKv.push({ k: 'petStepCredit',
              v: Math.max(localValue('petStepCredit') || 0, fileValue('petStepCredit') || 0) });

            /* THE TOMBSTONES ARE A UNION, NEVER PAYLOAD-WINS (2026-09-06). 'invTaken'
               and 'crateTaken' are the receipts the inv filter below reads. Left as
               an ordinary kv row the payload overwrote them on every pull, so device
               B's own receipts vanished the moment it merged device A's blob, and
               the next blob still carrying B's spent row revived it. A merge can
               only ever ADD a receipt. */
            // Purchase and delivery receipts are also permanent on a merge. A stale
            // backup must not un-buy a look or forget that a code/grant was handled.
            for (const k of MERGE_RECEIPTS) {
              const local = localKv.find(r => r.k === k);
              const file = data.kv.find(r => r && r.k === k);
              if (!local) continue;
              keptKv.push({ k, v: [...new Set([...(Array.isArray(local.v) ? local.v : []), ...(file && Array.isArray(file.v) ? file.v : [])])] });
            }
          }
          /* THE DAY CEILINGS ONLY EVER GO UP, INCLUDING THROUGH A RESTORE, and
             unlike DEVICE_KV above the payload does NOT get to win. Every other mark
             in this app can be rewound by restoring an export taken before it moved
             (see the clock-trust audit's closing FINDING), which for a ceiling on
             future days is a one-click reset of the ceiling while the rows farmed
             under it stay put. Keeping the higher of the two costs three lines and
             takes that hole away on BOTH import paths, the Settings file restore and
             the cloud pull, which is why this sits outside the `replace` branch. */
          /* BOTH marks, not just the witness: rule 1's high-water mark is the other
             half of the same ceiling, and leaving it payload-wins meant a cloud pull
             could hand back a day the device had already climbed past. They are
             ranked differently only because one stores an ordinal and the other
             stores a date key. */
          const keepHigher = (k, rank) => {
            const local = localKv.find(r => r.k === k);
            const file = data.kv.find(r => r && r.k === k);
            if (local && rank(local.v) > rank(file ? file.v : null)) keptKv.push(local);
          };
          keepHigher(DAY_WITNESS_KEY, v => Number(v) || 0);
          keepHigher('dayHighWater', v => dayOrdinal(v) || 0);
        }
        /* THE TAKE RECEIPT (QA round 34 P0). A merge (!replace) `os.put`s every
           'inv' row the blob carries, which is right for a row this device has
           never seen and wrong for one it already opened: a blob older than the
           local save still carries the now-opened crate, and the put brings it
           back. js/loot.js openCrate records every crate id it takes in kv
           'crateTaken' (bounded, same idiom as js/social.js's 'grantsSeen'); a
           merge never re-adds an inv row on that list. Scoped to !replace for the
           same reason as the coinsRev guard above: a `replace:true` restore is
           deliberately reverting to an older save, receipts and all, and must not
           be second-guessed. */
        let invRows = data.inv;
        const takenInv = new Set();
        if (!replace) {
          /* R38-13 (2026-09-06): crateTaken above only ever covered openCrate. Every
             OTHER place this file deletes an 'inv' row outright (a spent
             consumable, a used Battle Charm, a pet's last cosmetic copy on
             salvage/extinction) had no receipt at all, so the SAME stale-blob merge
             revived them: measured, a spent Vigor Draught came back 1 -> 0 -> 1
             through a two-device merge. Every one of those sites now goes through
             takeInv above, which deletes the row and writes 'invTaken' in one
             transaction, unbounded. The payload's own receipts count too (the union
             the kv merge above keeps), so a row the OTHER device took never lands. */
          const taken = takenInv;
          for (const k of ['crateTaken', 'invTaken']) {
            for (const id of (localKv.find(r => r.k === k)?.v || [])) taken.add(id);
            const file = Array.isArray(data.kv) && data.kv.find(r => r && r.k === k);
            if (file && Array.isArray(file.v)) for (const id of file.v) taken.add(id);
          }
          if (taken.size && declared.has('inv')) invRows = data.inv.filter(r => !(r && taken.has(r.id)));
        }
        const localLab = Object.fromEntries(localKv.map(r=>[r.k,r.v]));
        const fileLab = Object.fromEntries((data.kv||[]).map(r=>[r.k,r.v]));
        const finalLab = Object.fromEntries([...(replace && declared.has('kv') ? [] : localKv), ...(kvRows||[]), ...keptKv].map(r=>[r.k,r.v]));
        const labMerge = mergeLabSave(localLab, fileLab, finalLab, replace);
        keptKv.push(...Object.entries(labMerge).map(([k,v])=>({k,v})));
        for (const s of STORES) {
          const os = t.objectStore(s);
          /* Clear and puts in one transaction, so they land together or not
             at all. Only for stores the file declares: see the header. */
          if (replace && declared.has(s)) os.clear();
          for (const row of (s === 'kv' ? (kvRows || []) : s === 'inv' ? (invRows || []) : s === 'log' ? logRows : (data[s] || []))) os.put(row);
          if (s === 'kv') for (const row of keptKv) os.put(row);
          if (s === 'log') for (const id of logDeletes) os.delete(id);
          // A remote receipt also removes a LOCAL ownership row. Otherwise the
          // next Stable boot can reclaim a pet whose instance was just removed.
          if (s === 'inv') for (const id of takenInv) os.delete(id);
        }
        /* An import replaces the contents of every store, so every derived cache
           built on the old contents is now wrong. Stamp them all. */
        for (const s of STORES) bumpStore(s);
      } catch (e) {
        mergeError = e;
        try { t.abort(); } catch { /* already aborting */ }
      }
    };
  });
}

/* ---------------- ERASE EVERYTHING, WITH A SECOND TAB OPEN ----------------
 *
 * THE MEASUREMENT. Settings > Erase all data used to be, in js/app.js:
 *     for (const st of STORES) await db.clear(st);
 *     location.reload();
 * Seven separate transactions, then a reload of THIS tab only. Driven with a
 * second tab in a plain write loop (30 x coinsAdd(5) + 30 inv rows), the erase
 * finished and the database still held 30 inv rows, a kv row, and a coin
 * balance of 150. The sheet says "Your log, foods, weights, XP, gear and
 * Bonehead on this device will be gone". It was not gone, and the tab that did
 * the erasing reloaded onto a save it believed it had destroyed. That is the
 * 2026-08-13 'inv' shape again: a destructive dialog that is not true, and the
 * welcome kit is re-paid on top of an inventory that survived.
 *
 * WHY IT NEEDS A HANDSHAKE AND NOT JUST ONE TRANSACTION. One transaction fixes
 * the erase being piecewise. It does nothing about the other tab, which is
 * still running, still holds the player's whole state in memory, and writes
 * again a millisecond later. So:
 *
 *   1. Broadcast `freeze`. Every other tab sets `frozen` SYNCHRONOUSLY in its
 *      message handler, which makes every readwrite in this module reject, and
 *      acks.
 *   2. Wait for the acks (bounded: WIPE_ACK_MS, so one wedged tab cannot hold
 *      the erase hostage forever).
 *   3. THEN open the clear transaction. Anything the other tab dispatched
 *      before it froze was queued as a transaction earlier than this one, and
 *      IndexedDB runs same-store readwrite transactions in creation order, so
 *      those writes commit BEFORE the clear and the clear removes them. That
 *      is the whole reason the ack has to come before the transaction opens
 *      rather than after.
 *   4. Broadcast `erased`, and the frozen tabs reload onto the empty save
 *      instead of sitting there showing a Bonehead that no longer exists.
 *
 * Bound, measured with the other tab in a continuous write loop across the
 * whole handshake: every store holds exactly ZERO rows afterwards. Not fewer.
 * Zero. tests/multitab-audit.mjs asserts that number.
 *
 * BroadcastChannel is absent in no browser this app supports, but the whole
 * protocol degrades to "one transaction, this tab only" if it is missing,
 * which is still strictly better than the seven-transaction loop it replaces. */
const WIPE_CH = 'tally-db-wipe';
const WIPE_ACK_MS = 300;
let wipeChannel = null;
function chan() {
  if (wipeChannel !== null) return wipeChannel;
  try { wipeChannel = new BroadcastChannel(WIPE_CH); } catch { wipeChannel = false; }
  if (wipeChannel) {
    wipeChannel.onmessage = e => {
      const m = e && e.data;
      if (!m || typeof m !== 'object') return;
      if (m.t === 'freeze') {
        frozen = true;                       // synchronous: no write can slip past this
        frozenMessage = FROZEN_MSG;
        try { wipeChannel.postMessage({ t: 'frozen', id: m.id }); } catch { /* channel gone */ }
      } else if (m.t === 'erase-failed') {
        frozen = true;
        frozenMessage = 'An erase attempt in another tab failed. Saving is paused. Reload this tab to continue.';
        reportWriteFailure(null, null, 'wipe', frozenError());
      } else if (m.t === 'erased') {
        frozen = true;
        markErased();
        try { if (typeof location !== 'undefined') location.reload(); } catch { /* not a document */ }
      }
    };
  }
  return wipeChannel;
}
// Called once at boot so a tab is listening before any OTHER tab erases.
export function watchForWipe() { chan(); }

/* THE WIPE HAS TO SAY WHAT IT DID, AND IT CANNOT SAY IT HERE. QA round 25 M9
   measured 3,780 rows to zero in 72 ms and the reloaded tab booting with an
   EMPTY toast: both wipe paths (Erase, Delete account) run eraseAll() and then
   location.reload(), the watching tabs reload from the `erased` message, and
   toast() is in-memory state that dies with the document. A kv row cannot
   carry the message either, because kv is one of the stores this wipe just
   cleared (and multitab-audit asserts zero rows afterwards). sessionStorage is
   per-tab and survives a reload, and app.js already uses it for exactly this
   shape (the per-tab 'bhg-splash' flag), so the wiping tab and every frozen
   tab drop this flag and app.js boot reads it once and toasts. */
export const ERASED_FLAG = 'tally-erased';
function markErased() { try { sessionStorage.setItem(ERASED_FLAG, '1'); } catch { /* not a document, or private mode */ } }

export async function eraseAll() {
  const ch = chan();
  if (ch) {
    const id = Math.random().toString(36).slice(2);
    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; ch.removeEventListener('message', onAck); resolve(); } };
      /* Resolve on the FIRST ack rather than counting tabs: there is no way to
         know how many are open, and a tab that never answers is covered by the
         timeout and then by the `erased` reload. */
      const onAck = e => { if (e && e.data && e.data.t === 'frozen' && e.data.id === id) finish(); };
      ch.addEventListener('message', onAck);
      try { ch.postMessage({ t: 'freeze', id }); } catch { finish(); return; }
      setTimeout(finish, WIPE_ACK_MS);
    });
  }
  try {
    const idb = await open();
    /* Stamp every store before the clear opens: an erase invalidates every cache
       derived from a store's contents (js/game.js's XP total is one), and the
       stamp has to be in place before any of them can be rebuilt. */
    for (const st of STORES) bumpStore(st);
    await new Promise((resolve, reject) => {
      /* ONE transaction over every store db.js defines. Same guarantee importAll
         gives a restore: it all goes, or none of it does and the player is left
         exactly where they were. STORES, never a literal: the literal is what
         lost 'inv' and left the whole wardrobe standing. */
      const t = idb.transaction(STORES, 'readwrite');
      for (const st of STORES) t.objectStore(st).clear();
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('erase aborted'));
    });
    eraseFileRestorePoints();
  } catch (error) {
    if (ch) try { ch.postMessage({ t: 'erase-failed' }); } catch { /* channel gone */ }
    throw error;
  }
  if (ch) try { ch.postMessage({ t: 'erased' }); } catch { /* channel gone */ }
  markErased();
}

/* Ask the browser to protect this origin's storage from automatic eviction,
   AND KEEP THE ANSWER. QA round 25 M23: this used to `.catch(() => {})` the
   promise and drop the boolean, so `navigator.storage.persisted()` read FALSE
   with a full year of data on board and nothing in the app could have known.
   Module state, like `frozen` and `writeFailureSink` beside it: null until the
   browser answers (or when the API is missing), then the persist() boolean.
   No UI reads it yet (Tom's call); app.js logs it once at boot. */
let persistGranted = null;
export function persistenceGranted() { return persistGranted; }
export function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist().then(v => { persistGranted = !!v; return persistGranted; }, () => null);
    }
  } catch { /* unsupported */ }
  return Promise.resolve(null);
}
