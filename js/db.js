// Minimal promise wrapper over IndexedDB. Stores: foods, log, weights, kv, xp, health, inv.
// IMPORTANT: upgrades must stay strictly ADDITIVE (create-if-missing only).
// Existing user data must survive every version bump.
import { dayOrdinal } from './nutrition.js';

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
const FROZEN_MSG = 'this save was erased in another tab';

function tx(store, mode, fn) {
  if (frozen && mode === 'readwrite') return Promise.reject(new Error(FROZEN_MSG));
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
 * reload. Those rejections are the design working, so they are filtered out here
 * rather than becoming a storm of toasts on the way out.
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
  'hkStaleNotified', 'hkSleepDiag', 'lastExportAt', 'backupAt', 'transmuteAt',
  // cloud-health diagnostics + their once-a-day nudge throttle: all three are
  // re-derived by the next push / the next /health, same class as backupAt
  'backupFail', 'clockSkewMs', 'cloudNudgeAt',
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
  if (err && String((err && err.message) || err) === FROZEN_MSG) return;   // erasing on purpose
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
  return run().catch(err => { reportWriteFailure(store, val, op, err); throw err; });
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
  if (frozen) return Promise.reject(new Error(FROZEN_MSG));
  /* Same stamp discipline as db.put, and it has to be here: a LOSING caller's
     add never lands, but the winner's did, and this process cannot tell which
     it is until the transaction completes. Stamping before dispatch means the
     losing case invalidates a cache that may be missing the winner's row, which
     is the safe direction. js/game.js reads the stamp back and is written
     against exactly this: see awardOnce. */
  bumpStore(store);
  return guard(store, val, 'addIfAbsent', () => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    let inserted = true;
    const req = t.objectStore(store).add(val);
    req.onerror = e => {
      if (req.error && req.error.name === 'ConstraintError') {
        inserted = false;
        e.preventDefault();      // "already there" is an answer, not a failure
        e.stopPropagation();
      }
    };
    t.oncomplete = () => resolve(inserted);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('addIfAbsent aborted'));
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
  if (frozen) return Promise.reject(new Error(FROZEN_MSG));
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
  if (frozen) return Promise.reject(new Error(FROZEN_MSG));
  bumpStore('kv');
  return guard('kv', k, 'kvUpdate', () => open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction('kv', 'readwrite');
    const os = t.objectStore('kv');
    const g = os.get(k);
    let next;
    let threw = null;
    g.onsuccess = () => {
      const cur = g.result ? g.result.v : fallback;
      try { next = fn(cur); } catch (e) { threw = e; try { t.abort(); } catch { /* already going */ } return; }
      if (next !== undefined) os.put({ k, v: next });
    };
    t.oncomplete = () => resolve(next);
    t.onerror = () => reject(threw || t.error);
    t.onabort = () => reject(threw || t.error || new Error('kvUpdate aborted'));
  })));
}

/* The currency primitive. `coins` and `bonedust` are plain numbers in kv and
   every balance change in the game goes through here, so this one function is
   the difference between an exact balance and a drifting one. The clamp is the
   same `Math.max(0, ...)` the callers used to apply outside the transaction. */
export function kvBump(k, n, { min = 0 } = {}) {
  return kvUpdate(k, cur => Math.max(min, (Number(cur) || 0) + n), 0);
}

export const db = {
  put: (store, val) => { bumpStore(store); return guard(store, val, 'put', () => tx(store, 'readwrite', s => s.put(val))); },
  del: (store, key) => { bumpStore(store); return guard(store, key, 'del', () => tx(store, 'readwrite', s => s.delete(key))); },
  get: (store, key) => tx(store, 'readonly', s => s.get(key)),
  clear: (store) => { bumpStore(store); return guard(store, null, 'clear', () => tx(store, 'readwrite', s => s.clear())); },
  all: (store) => tx(store, 'readonly', s => s.getAll()),
  count: (store) => tx(store, 'readonly', s => s.count()),
  epoch: (store) => storeEpoch(store),
  /* The two atomic ones, defined above and hung here so every caller that
     already has `db` can reach them without a second import. */
  addIfAbsent: (store, val) => addIfAbsent(store, val),
  take: (store, key) => take(store, key),
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
  const o = Math.floor(ms / DAY_MS);   // UTC day ordinal, same scale as dayOrdinal()
  if (o > cur) { await kvSet(DAY_WITNESS_KEY, o); return o; }
  return cur;
}

export async function claimDay(key) {
  const o = dayOrdinal(key);
  if (!Number.isFinite(o)) return { fresh: true, reason: 'unparseable' };  // never judge what we cannot read

  const hw = await kvGet('dayHighWater', null);
  const oh = dayOrdinal(hw);

  // FIRST RUN, or a mark we cannot read: seed and let the player through.
  if (!Number.isFinite(oh)) {
    await kvSet('dayHighWater', key);
    // ...and rule 3's mark with it, if the server has never been seen. A device
    // that has only ever been offline gets a ceiling from here, not a free run.
    if (!(Number(await kvGet(DAY_WITNESS_KEY, 0)) || 0)) await kvSet(DAY_WITNESS_KEY, o);
    return { fresh: true, reason: 'seeded' };
  }

  // RULE 1. Strictly before the mark is never a new day.
  if (o < oh) return { fresh: false, reason: 'backwards', highWater: hw };

  /* SAME DAY. Fresh, because the per-key ledger is what decides whether any
     individual reward is still owed. Deliberately writes nothing: restamping
     here is exactly the bug that made the rolling-window design refuse honest
     evening-then-morning players. */
  if (o === oh) return { fresh: true, reason: 'same-day' };

  /* (Rule 2 stood here until QA round 26 O10. It could not fire: see the header.)

     RULE 3. A day the SERVER has not reached, plus an offline allowance. The
     one rule here that is not read off the clock being moved, so it is what
     refuses the wild jumps (a decade-ahead RTC) as well as the patient
     one-day-at-a-time walk. Seeds and lets through when there is nothing to
     judge against; see the header. "A refusal writes nothing" is the property
     that stops this guard latching, so nothing is committed until it has spoken. */
  const witness = Number(await kvGet(DAY_WITNESS_KEY, 0)) || 0;
  if (witness && o > witness + WITNESS_GRACE) {
    return { fresh: false, reason: 'unwitnessed', highWater: hw, witness, ceiling: witness + WITNESS_GRACE, claimed: o };
  }
  if (!witness) await kvSet(DAY_WITNESS_KEY, o);

  await kvSet('dayHighWater', key);
  return { fresh: true, reason: 'advanced' };
}

/* Read-only view for UI and for tests. Never writes, so it can be called from
   a render path without opening a day as a side effect. */
export async function dayGuardState() {
  const [highWater, witness] = await Promise.all([kvGet('dayHighWater', null), kvGet(DAY_WITNESS_KEY, 0)]);
  const w = Number(witness) || 0;
  return { highWater, witness: w, witnessGrace: WITNESS_GRACE, ceiling: w ? w + WITNESS_GRACE : null };
}

export async function exportAll() {
  const [foods, log, weights, kv, xp, health, inv] = await Promise.all([
    db.all('foods'), db.all('log'), db.all('weights'), db.all('kv'), db.all('xp'), db.all('health'), db.all('inv'),
  ]);
  return { app: 'tally', version: DB_VERSION, exportedAt: new Date().toISOString(), foods, log, weights, kv, xp, health, inv };
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
  if (frozen) throw new Error('this save was erased in another tab. Reload and try again.');
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
  const idb = await open();
  const declared = new Set(STORES.filter(s => Array.isArray(data[s])));
  const skipped = STORES.filter(s => !declared.has(s));
  /* Read the device rows out here, not inside the transaction. An `await`
     between the puts would let IDB auto-commit on the drained microtask
     queue and we would be back to piecewise commit, which is exactly what
     this function was rewritten to stop. */
  let keptKv = [];
  let kvRows = data.kv;
  if (declared.has('kv')) {
    const payloadKeys = new Set(data.kv.map(r => r && r.k));
    let localKv;
    try { localKv = await db.all('kv'); }
    catch (e) { throw new Error('the restore could not read storage. Your old data is unchanged. Try again.'); }
    if (replace) keptKv = localKv.filter(r => DEVICE_KV.includes(r.k) && !payloadKeys.has(r.k));
    /* MERGE: the payload never overwrites a device key this device holds
       (see the DEVICE_KV header). Non-device keys keep payload-wins. */
    if (!replace) {
      const localKeys = new Set(localKv.map(r => r && r.k));
      kvRows = data.kv.filter(r => !(r && DEVICE_KV.includes(r.k) && localKeys.has(r.k)));
    }
    /* THE DAY WITNESS ONLY EVER GOES UP, INCLUDING THROUGH A RESTORE, and
       unlike DEVICE_KV above the payload does NOT get to win. Every other mark
       in this app can be rewound by restoring an export taken before it moved
       (see the clock-trust audit's closing FINDING), which for a ceiling on
       future days is a one-click reset of the ceiling while the rows farmed
       under it stay put. Keeping the higher of the two costs three lines and
       takes that hole away on BOTH import paths, the Settings file restore and
       the cloud pull, which is why this sits outside the `replace` branch. */
    const localW = localKv.find(r => r.k === DAY_WITNESS_KEY);
    const fileW = data.kv.find(r => r && r.k === DAY_WITNESS_KEY);
    if (localW && (Number(localW.v) || 0) > (fileW ? Number(fileW.v) || 0 : 0)) keptKv.push(localW);
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
        for (const row of (s === 'kv' ? (kvRows || []) : (data[s] || []))) os.put(row);
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
        try { wipeChannel.postMessage({ t: 'frozen', id: m.id }); } catch { /* channel gone */ }
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
