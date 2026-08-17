// Boneheadz Gym social API. Cloudflare Worker + D1.
// Auth: every player-scoped request is signed by the device's ECDSA P-256 key
// (headers x-bh-player / x-bh-ts / x-bh-sig over "METHOD\nPATH\nTS\nBODY").
// No emails, no passwords, no PII: a pubkey IS the account.

const CORS = {
  'Access-Control-Allow-Origin': '*', // signature auth, no cookies: * is safe (and native WKWebView needs it)
  'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
  'Access-Control-Allow-Headers': 'content-type,x-bh-player,x-bh-ts,x-bh-sig,x-bh-admin',
  'Access-Control-Max-Age': '86400',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS } });

const MAX_SKEW_MS = 5 * 60 * 1000;
const MAX_PROFILE_BYTES = 24 * 1024;
/* THE BACKUP CAP, AND WHAT IT ACTUALLY COSTS (measured 2026-08-17).
 *
 * A backup blob is base64(iv || AES-GCM(JSON.stringify(exportAll()))), so its
 * stored length is a pure function of the save: js/db.js exportAll defines the
 * payload, js/social.js encryptBackup does the rest, and 12 bytes of IV plus 16
 * of GCM tag then 4/3 for base64 is exact, not an estimate. Every row shape was
 * taken off the db.put call sites and the expansion was run through real
 * WebCrypto rather than assumed. What is MODELLED, and needs production
 * telemetry to pin down, is how many rows a day a player writes and how that
 * spreads across players (lognormal on meals/day, median 7, everything else
 * scaled off it). 3,000 sampled players per tenure:
 *
 *   tenure    p50       p95       p99      mean    over the 4 MB cap
 *    30 d    0.26 MB   0.55 MB   0.75 MB  0.29 MB       0 %
 *    90 d    0.62 MB   1.39 MB   1.99 MB  0.70 MB       0 %
 *   180 d    1.17 MB   2.58 MB   4.03 MB  1.31 MB       1.0 %
 *   365 d    2.23 MB   5.20 MB   7.68 MB  2.56 MB      12.7 %
 *   730 d    4.28 MB  10.42 MB  15.79 MB  5.01 MB      55.5 %
 *
 * The 256-byte fixture the events audit used was right to call itself a floor.
 * It is roughly a thousandth of a real one-year save.
 *
 * SO THE CAP IS NOT THE PROBLEM, AND RAISING IT DOES NOT FIX ANYTHING. Two
 * separate things are wrong and they pull in opposite directions.
 *
 * 1. TOTAL STORAGE. One full save per player, mean size, in the same D1
 *    database as everything else:
 *      1,000 players    0.28 GB at 30 d    1.3 GB at 180 d    2.5 GB at 365 d
 *     10,000 players    2.9  GB at 30 d   12.8 GB at 180 d   25.0 GB at 365 d
 *    D1's per-database limit is 10 GB and cannot be bought past. At 10,000
 *    players, backups alone are over it inside six months, before a single
 *    events row is counted, and events want 8.6 GB of the same 10. This is not
 *    a retention-tuning problem: a full encrypted save per player does not fit
 *    in D1 at that scale by a factor of about two and a half. The structural
 *    answer is to keep the blob in R2 (priced per GB, no wall) and leave this
 *    table holding only player_id, size, app_v, updated_at and the object key.
 *    That is real work and it is a recommendation, not a patch.
 *
 * 2. WHAT CROSSING THE CAP DOES TODAY, which is worse than the number. The PUT
 *    below answers 413; js/social.js pushBackup returns false; autoSync
 *    discards that return value; nothing anywhere tells the player. `backupAt`
 *    is only stamped on success, so the client retries every sync and fails
 *    every time, silently, forever. backupNudge in js/app.js does NOT cover
 *    this: it watches lastExportAt, which is the manual file export, a
 *    different thing. So a player's cloud backup quietly stops updating and the
 *    first they hear of it is a restore that comes back a year stale. That is
 *    the exact failure this feature exists to prevent (a real level 27 account
 *    was destroyed on 2026-07-27), and on these numbers it already reaches 1%
 *    of players at six months and 12.7% at a year.
 *    There is also no remedy behind a warning even if one were shown: the food
 *    log only grows, and nothing in the app trims it.
 *
 * 3. AND THE CLIFF IS NOT WHERE THIS CONSTANT SAYS IT IS. Bisected against
 *    local D1 on 2026-08-17: the largest blob that stores is 2,199,942 bytes,
 *    and 2,199,943 comes back "D1_ERROR: string or blob too big:
 *    SQLITE_TOOBIG". So the real limit is about 2.2 MB, not 4 MB, and every
 *    save in the 1.8 MB-wide gap between them used to reach the database, throw,
 *    and fall out of the generic handler as a 500. The PUT below now catches
 *    that and answers 413, which is what the route already meant to say.
 *    Against the distribution above, 2.2 MB is not a distant ceiling: p99
 *    crosses 2 MB at 120 days, p95 at 150 days, and p50 at 330 days. Half of
 *    the players who stay a year lose their cloud backup, silently, on a limit
 *    nothing in this file was written against.
 *
 * WHAT IS NOT MEASURED HERE, and needs production to settle:
 *   - Whether the DEPLOYED D1 limit is the same 2,199,942 bytes the local
 *     emulator enforces. It is the number this file has, it is not necessarily
 *     the number Cloudflare runs. Lowering MAX_BACKUP_BYTES to match a figure
 *     measured somewhere else would refuse saves production might accept, and
 *     refusing to store somebody's save on a guess is the one mistake here that
 *     cannot be undone, so the constant is deliberately left alone and the
 *     failure is made legible instead.
 *   - The real activity distribution. Everything above rests on a modelled
 *     spread of rows per day. The per-row costs are exact; the row counts are
 *     not, and only production telemetry can fix that.
 *   - How many players are ALREADY over the line. `backups.size` is stored on
 *     every row and nothing reads it: one query against production answers
 *     this exactly, and no model is needed for it at all. */
const MAX_BACKUP_BYTES = 4 * 1024 * 1024; // encrypted full save (food log grows over time)

/* ---------------- names + friend codes ----------------
   NAME_ADJ / NAME_NOUN power the curated name builder: the client sends INDICES,
   the server reconstructs the string from these lists. No free text ever crosses
   the wire, so no offensive names are possible and there is nothing to moderate.
   KEEP IN SYNC with tally/js/names.js (identical order). */
const ADJ = ['Rattling', 'Grim', 'Dusty', 'Creaky', 'Hollow', 'Marrow', 'Midnight', 'Restless', 'Crooked', 'Sturdy', 'Swift', 'Lucky', 'Feral', 'Ancient', 'Jolly', 'Sneaky', 'Iron', 'Cursed', 'Phantom', 'Rowdy', 'Chrome', 'Vicious', 'Gnarly', 'Wicked', 'Bony', 'Rugged', 'Shadow', 'Fresh', 'Savage', 'Brutal', 'Twisted', 'Jagged', 'Ragged', 'Grisly', 'Ghastly', 'Ghoulish', 'Spectral', 'Sinister', 'Vile', 'Rotten', 'Withered', 'Charred', 'Frozen', 'Blazing', 'Molten', 'Rusty', 'Frostbit', 'Toxic', 'Venomous', 'Rabid', 'Feisty', 'Reckless', 'Hungry', 'Ironclad', 'Swole', 'Ripped', 'Chiseled', 'Massive', 'Mighty', 'Beastly', 'Prowling', 'Nocturnal', 'Eerie', 'Murky', 'Gloomy', 'Silent', 'Menacing', 'Lurking', 'Snarling', 'Howling', 'Grinning', 'Neon', 'Golden', 'Obsidian', 'Cracked', 'Grave', 'Wretched', 'Thunderous', 'Stormy', 'Electric'];
const NOUN = ['Rex', 'Femur', 'Knuckles', 'Molar', 'Sternum', 'Tibia', 'Scapula', 'Phalange', 'Vertebrae', 'Clavicle', 'Patella', 'Mandible', 'Rib', 'Talus', 'Hyoid', 'Coccyx', 'Skull', 'Spine', 'Reaper', 'Ripper', 'Jawbone', 'Cranium', 'Gains', 'Crypt', 'Ghoul', 'Wraith', 'Fang', 'Hustle', 'Bruiser', 'Brawler', 'Slugger', 'Crusher', 'Basher', 'Smasher', 'Chomper', 'Gnasher', 'Stomper', 'Wrecker', 'Mauler', 'Ravager', 'Menace', 'Terror', 'Nightmare', 'Specter', 'Wight', 'Lich', 'Revenant', 'Banshee', 'Gargoyle', 'Golem', 'Titan', 'Brute', 'Fiend', 'Demon', 'Gremlin', 'Goblin', 'Warlock', 'Bonesaw', 'Skeleton', 'Bonehead', 'Ossuary', 'Casket', 'Coffin', 'Tombstone', 'Boneyard', 'Ribcage', 'Kneecap', 'Backbone', 'Humerus', 'Ulna', 'Pelvis', 'Sacrum', 'Fibula', 'Tusk', 'Claw', 'Talon', 'Horn', 'Spike', 'Deadlift', 'Pump'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L lookalikes

function randPick(arr) { return arr[crypto.getRandomValues(new Uint32Array(1))[0] % arr.length]; }
function makeHandle() { return `${randPick(ADJ)} ${randPick(NOUN)}`; }
// Reconstruct a curated name from indices. Returns null if out of range (tamper).
function buildName(a, n, num) {
  const adj = ADJ[a | 0], noun = NOUN[n | 0];
  if (!adj || !noun) return null;
  const suffix = (Number.isInteger(num) && num >= 0 && num <= 999) ? ` #${num}` : '';
  return `${adj} ${noun}${suffix}`;
}
function makeFriendCode() {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const c = [...r].map(b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `BONE-${c.slice(0, 4)}-${c.slice(4)}`;
}
function newId() { return crypto.randomUUID(); }
function pairKey(x, y) { return x < y ? [x, y] : [y, x]; } // canonical a<b for friendships

// The free daily friend-gift roll (server-authoritative so it can't be forged).
// Mostly coins, sometimes a crate/charm, rarely an egg.
function rollFreeGift() {
  const r = Math.random();
  if (r < 0.50) return { coins: [30, 50, 60, 75][Math.floor(Math.random() * 4)] };
  if (r < 0.80) return { crate: 'daily' };
  if (r < 0.93) return { consumable: 'xp2' };   // Battle Charm
  return { crate: 'egg' };
}

/* ---------------- recovery lookups ----------------
   A recovery id is a handle the player CHOOSES, so unlike a friend code it is
   guessable. Every unsigned recovery endpoint therefore shares one limiter, so
   adding a route can never accidentally ship an unthrottled way to harvest
   ciphertext. Keep this in step with RECOVERY_ID_RE in js/social.js. */
const RECOVERY_ID_RE = /^[a-z0-9._-]{4,32}$/;

/** Returns a 429 Response when the caller is over budget, else null.
 *  `bucket` matters: handing out CIPHERTEXT has to be tight, but an availability
 *  check only reveals whether a name is taken. They shared one counter at first,
 *  which meant a player trying four candidate IDs in the setup sheet spent half
 *  the budget that their actual restore needs. Separate buckets, separate costs. */
async function rateLimitRecovery(request, env, limit = 10, windowMs = 600000, bucket = 'rl_recovery') {
  // hash the IP: the events table holds anonymous ids by design, and a raw IP
  // log would be a privacy regression for an app that never uploads location
  const ipRaw = request.headers.get('cf-connecting-ip') || 'unknown';
  const ipHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode('bh-rl:' + ipRaw)))].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  const hits = Number((await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM events WHERE device = ? AND name = ? AND ts > ?')
    .bind(ipHash, bucket, now - windowMs).first())?.n || 0);
  if (hits >= limit) return json({ error: 'too many attempts, try again later' }, 429);
  await env.DB.prepare('INSERT INTO events (device, name, props, app_v, day, ts) VALUES (?,?,?,?,?,?)')
    .bind(ipHash, bucket, '{}', '', new Date(now).toISOString().slice(0, 10), now).run().catch(() => {});
  return null;
}

/* ---------------- events retention ----------------
   Until now nothing on this worker deleted an events row, ever. The table only
   grew, and D1's 10 GB per-database limit is a hard stop: it is the one number
   here that cannot be bought past, so "we will pay for more" is not an answer.

   THE WINDOW: 60 days, and 90 was rejected on arithmetic, not taste.
   Measured, by building the real events DDL in local SQLite and reading the
   page_count delta: one events row costs 189 bytes once idx_events_day,
   idx_events_device_day and idx_events_name are counted alongside the row
   itself. At roughly 76 events per active device per day that is 14.4 KB per
   device per day, so 10,000 DAU writes about 143 MB a day. Then:

     90 days x 143 MB = 12.9 GB   over the 10 GB cap on events ALONE
     60 days x 143 MB =  8.6 GB
     30 days x 143 MB =  4.3 GB

   Everything else measured at 10,000 players comes to 578 MB (grants 531 MB at
   1.9M rows, friendships 35 MB, players 8 MB, the rest under 4 MB), plus the
   backups table, whose blob is a whole encrypted save and is capped at 4 MB per
   player. Leaving a gigabyte of operational headroom (D1 does not auto-VACUUM,
   so freed pages are reused rather than returned), 60 days holds to roughly
   8,000 to 9,000 DAU and 90 days runs out around 5,500. 60 is the larger of the
   two candidates that survives the arithmetic anywhere near the target.

   When DAU passes that, this constant comes down. It is one line, and the
   pruner will eat the backlog over the following ticks on its own.

   RATE-LIMIT ROWS ARE NOT PRODUCT EVENTS, and they need the opposite treatment
   in both directions. rateLimitRecovery above stores its per-IP counters as
   rows in this same table, named rl_recovery / rl_ridcheck, and counts only the
   ones inside a 10 MINUTE window. So:
     1. Pruning must never remove a row the limiter is still counting. Delete
        one and the limiter quietly resets, which turns the unauthenticated
        ciphertext endpoints into an unthrottled way to harvest wrapped keys.
     2. They must not be kept for 60 days either. They are one row per attempt
        per IP, they carry no product meaning, and they pollute the dashboard:
        /stats counts DISTINCT device, and an IP hash is not a device.
   Hence their own window of 24 hours. That is 144 times the limiter's 10 minute
   horizon, so no counter it can still see is ever inside the deletable set, and
   the rows still leave 59 days earlier than everything else. */
const EVENT_RETENTION_DAYS = 60;
const EVENT_RETENTION_OVERRIDE_DAYS = { rl_recovery: 1, rl_ridcheck: 1 };
/* HOW FAR BACK /stats READS, which is a different question from how far back
   the table goes. Retention is a storage decision; this is a latency one. See
   the long note on the /stats route for the measured curve that forced it, and
   for the list of figures whose meaning changed the day it landed. Lowering it
   makes the dashboard faster and narrower; raising it costs time superlinearly.
   It must stay <= EVENT_RETENTION_DAYS, or the route would claim a window the
   pruner has already emptied. */
const STATS_WINDOW_DAYS = 14;

/* BATCHING. D1 has a 30 second query timeout and a SINGLE writer. An unbounded
   DELETE against tens of millions of rows either times out, or does not and
   holds the write lock while every profile sync, gift and grant queues behind
   it. So every run is bounded three ways (rows per statement, rows per tick,
   wall clock) and carries no cursor: each statement is independently correct,
   so a tick killed halfway leaves the remainder for the next one and nothing
   has to be remembered in between.

   Measured against a 3,000,000 row events table in local SQLite: both DELETEs
   are index-driven (SEARCH events USING INDEX idx_events_day / idx_events_name,
   never a scan), one 1,000 row batch takes 48 to 115 ms, and 50 batches take
   2.8 s. That leaves the 20 s budget below mostly as protection against D1's
   per-statement network latency rather than against the work itself. */
const PRUNE_BATCH = 1000;        // rows per DELETE statement
const PRUNE_MAX_ROWS = 50000;    // rows per scheduled tick
const PRUNE_BUDGET_MS = 20000;   // wall clock per tick, under D1's 30 s ceiling

/** Delete expired events in bounded batches. Safe to interrupt and resume.
 *  Returns what it did, for the cron log and for the DEV-only test hook. */
async function pruneEvents(env, now = Date.now(), opts = {}) {
  const batch = Math.max(1, Math.min(5000, Number(opts.batch) || PRUNE_BATCH));
  const maxRows = Math.max(0, opts.maxRows === undefined ? PRUNE_MAX_ROWS : Number(opts.maxRows));
  const budgetMs = Math.max(100, opts.budgetMs === undefined ? PRUNE_BUDGET_MS : Number(opts.budgetMs));
  const started = Date.now();
  const deleted = {};
  let total = 0, stopped = null;
  const room = () => maxRows - total;
  const outOfTime = () => Date.now() - started >= budgetMs;

  /* Pass 1: the short-window names, one pass each. idx_events_name stores its
     entries as (name, rowid), so within a name the OLDEST rows come first and
     the LIMIT stops the moment a batch is full: no scan, and no runaway once
     the backlog for that name is gone. */
  for (const [name, days] of Object.entries(EVENT_RETENTION_OVERRIDE_DAYS)) {
    const cutoffTs = now - days * 86400000;
    for (;;) {
      if (room() <= 0) { stopped = 'maxRows'; break; }
      if (outOfTime()) { stopped = 'budgetMs'; break; }
      const n = Math.min(batch, room());
      const r = await env.DB.prepare(
        'DELETE FROM events WHERE id IN (SELECT id FROM events WHERE name = ? AND ts < ? LIMIT ?)')
        .bind(name, cutoffTs, n).run();
      const c = Number(r?.meta?.changes || 0);
      if (c) { deleted[name] = (deleted[name] || 0) + c; total += c; }
      if (c < n) break;   // that name is drained for this cutoff
    }
    if (stopped) break;
  }

  /* Pass 2: everything else, on idx_events_day. `day` is the indexed column and
     it is derived from the same ts the row carries, so comparing the YYYY-MM-DD
     strings is both correct and the only version of this that does not scan.
     The override names are excluded so that "the events table covers the last
     60 days" stays exactly true of the rows it is said about. */
  if (!stopped) {
    const names = Object.keys(EVENT_RETENTION_OVERRIDE_DAYS);
    const holes = names.map(() => '?').join(',');
    const cutoffDay = new Date(now - EVENT_RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
    for (;;) {
      if (room() <= 0) { stopped = 'maxRows'; break; }
      if (outOfTime()) { stopped = 'budgetMs'; break; }
      const n = Math.min(batch, room());
      const r = await env.DB.prepare(
        `DELETE FROM events WHERE id IN (SELECT id FROM events WHERE day < ? AND name NOT IN (${holes}) LIMIT ?)`)
        .bind(cutoffDay, ...names, n).run();
      const c = Number(r?.meta?.changes || 0);
      if (c) { deleted.window = (deleted.window || 0) + c; total += c; }
      if (c < n) break;   // caught up
    }
  }

  return {
    total, deleted,
    retentionDays: EVENT_RETENTION_DAYS,
    cutoffDay: new Date(now - EVENT_RETENTION_DAYS * 86400000).toISOString().slice(0, 10),
    stopped,                       // null = it finished; otherwise the bound that hit
    more: stopped !== null,        // true = there is still a backlog for the next tick
    ms: Date.now() - started,
  };
}

/* ---------------- grants retention ----------------
   grants was the second table nothing ever deleted from, and at 531 MB for
   1.95M rows on the 10,000 player fixture it is the largest non-events table.
   It is NOT the same job as pruning telemetry: a grant is the DELIVERY RECORD
   for a gift, a welcome kit, a step-race payout or an admin make-good, and
   deleting the wrong row silently eats somebody's present. So this deletes only
   what the code can prove is safe, and the proof is in three parts.

   1. HOW THE CLIENT CONSUMES A GRANT. GET /grants is a cursor read: the client
      sends `since`, gets `id > since ORDER BY id LIMIT 50`, and js/social.js
      pullGrants writes its local grantCursor to the last id in the batch ONLY
      after applying every grant in it. So a request carrying since=N is the
      client stating that everything with id <= N has landed on the device.
      Until 2026-08-17 the server threw that statement away, which is the whole
      reason grants could not be pruned: nothing here could tell a delivered
      gift from one still waiting. GET /grants now records it in
      players.grants_ack, and that column is what makes the first rule below
      provable rather than hopeful.

   2. WHAT DELETING A ROW CAN AND CANNOT CAUSE.
      RE-DELIVERY is defended twice and neither defence is the row. The server
      side is UNIQUE (player_id, key) + INSERT OR IGNORE, which only works while
      the row exists; the client side is award()'s key check in the xp store
      plus grantsSeen in kv, and both of those live in the save forever. Reading
      every INSERT INTO grants in this file, no route can regenerate a pruned
      key by itself either: gift/cheer keys carry the UTC day and are only ever
      counted for TODAY, spire and siege keys carry a timestamp that does not
      recur, and social-welcome is written once at /register. The one exception
      is an admin deliberately reusing a key on /admin/grant, and the client's
      ledger stops that from paying twice.
      LOSS is the real risk, and it is one-way. Delete a row the client has not
      read and that reward never arrives. Everything below exists to make that
      impossible for anything carrying value.

   3. WHERE THE LINE IS DRAWN.
      DELETED, because it has provably been delivered: id <= grants_ack, and
      older than GRANT_RETENTION_DAYS. The age bound is not decoration. A
      restore from cloud backup rolls the client's cursor BACKWARDS, because
      grantCursor lives in kv and kv is inside the encrypted blob; js/social.js
      autoSync pushes that blob on a 10 minute throttle and pulls grants after
      it, so the backup can trail the ack by one sync cycle. 90 days is that
      cycle with three months of margin: a device whose ack has not moved in 90
      days has also not pushed a backup in 90 days, so its restore point is
      older than anything being deleted here either way.
      DELETED, because it can never carry value: type 'cheer', past the same age
      bound, acknowledged or not. /cheer builds its payload from
      { from, cheer, cheerFrom, note } and nothing else, so there is no coins,
      xp, dust, crate, gearId, egg or consumable field for applyPayload to act
      on; js/app.js presents it as a stacked toast and a Deliveries line. A
      three month old "somebody cheered you" is not news, and it is also the
      highest-volume producer in the table at 10 per friend per day.
      NEVER DELETED, at any age, acknowledged or not: the stepweek- keys.
      /steps/settled reads those rows back as the RECEIPT for a race that has
      already paid out, for any week ever asked for, and the comment on that
      route explains at length why the live board cannot answer the same
      question. They are also what /steps/week checks to decide a week is
      already settled. There are five a week, which is 260 rows a year, so
      keeping them forever costs nothing worth having.
      NEVER DELETED, and this one is an admission rather than a policy: a
      value-bearing grant for a player who has never acknowledged it. A dormant
      account whose friends keep sending gifts accumulates rows that no rule
      here can touch, because the only safe signal is the one the client has not
      sent. That tail is unbounded. Capping it needs a product decision about
      how long an unopened gift waits, which is Tom's to make, not this file's. */
const GRANT_RETENTION_DAYS = 90;
/* The stepweek- receipts, as a key RANGE rather than a LIKE. Player ids contain
   '_', which is a LIKE wildcard, and /gift already learned that lesson; a range
   is also the form the planner can drive an index with. '.' is the next
   character after '-' that can start a key, so [stepweek-, stepweek.) is exactly
   the set of keys beginning "stepweek-". */
const STEPWEEK_LO = 'stepweek-';
const STEPWEEK_HI = 'stepweek.';

/** Delete grants that have provably been delivered, or that can never carry
 *  value, in bounded batches. Same contract as pruneEvents: no cursor, every
 *  statement independently correct, safe to interrupt and resume. */
async function pruneGrants(env, now = Date.now(), opts = {}) {
  const batch = Math.max(1, Math.min(5000, Number(opts.batch) || PRUNE_BATCH));
  const maxRows = Math.max(0, opts.maxRows === undefined ? PRUNE_MAX_ROWS : Number(opts.maxRows));
  const budgetMs = Math.max(100, opts.budgetMs === undefined ? PRUNE_BUDGET_MS : Number(opts.budgetMs));
  const started = Date.now();
  const days = Math.max(0, opts.retentionDays === undefined ? GRANT_RETENTION_DAYS : Number(opts.retentionDays));
  const cutoffTs = now - days * 86400000;
  let total = 0, stopped = null;

  /* ONE statement, not two passes, because both rules share the same age bound
     and the same never-delete carve-out, and one predicate means one walk of
     idx_grants_ts instead of two. The index is what keeps this honest: without
     it the planner falls back to a MULTI-INDEX OR over idx_grants_key plus a
     temp b-tree for the ORDER BY, and a 1,000 row batch measured 382 ms against
     400,000 rows instead of 13.6 ms. ORDER BY g.ts is not cosmetic either: it
     is what makes a batch stop at the oldest rows and return, rather than
     walking the whole table to find its LIMIT. */
  for (;;) {
    if (total >= maxRows) { stopped = 'maxRows'; break; }
    if (Date.now() - started >= budgetMs) { stopped = 'budgetMs'; break; }
    const n = Math.min(batch, maxRows - total);
    const r = await env.DB.prepare(
      `DELETE FROM grants WHERE id IN (
         SELECT g.id FROM grants g LEFT JOIN players p ON p.id = g.player_id
          WHERE g.ts < ?
            AND (g.key < ? OR g.key >= ?)
            AND (g.id <= COALESCE(p.grants_ack, 0) OR g.type = 'cheer')
          ORDER BY g.ts LIMIT ?)`)
      .bind(cutoffTs, STEPWEEK_LO, STEPWEEK_HI, n).run();
    const c = Number(r?.meta?.changes || 0);
    total += c;
    if (c < n) break;   // caught up
  }

  return {
    total,
    retentionDays: days,
    cutoffTs,
    stopped,
    more: stopped !== null,
    ms: Date.now() - started,
  };
}

/* ---------------- signature auth ---------------- */
async function verifySigned(request, env, bodyText) {
  const playerId = request.headers.get('x-bh-player');
  const ts = request.headers.get('x-bh-ts');
  const sig = request.headers.get('x-bh-sig');
  if (!playerId || !ts || !sig) return { err: 'missing auth headers' };
  if (Math.abs(Date.now() - Number(ts)) > MAX_SKEW_MS) return { err: 'stale timestamp' };
  const row = await env.DB.prepare('SELECT pubkey FROM players WHERE id = ?').bind(playerId).first();
  if (!row) return { err: 'unknown player' };
  const url = new URL(request.url);
  const msg = `${request.method}\n${url.pathname}${url.search}\n${ts}\n${bodyText || ''}`;
  try {
    const key = await crypto.subtle.importKey('jwk', JSON.parse(row.pubkey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sigBytes, new TextEncoder().encode(msg));
    return ok ? { playerId } : { err: 'bad signature' };
  } catch {
    return { err: 'bad signature' };
  }
}

/* ---------------- routes ---------------- */
// A spire untended this long is dormant and stops counting against the cap.
// The weekly step race prize. Coins and a crate: a reward for walking, never
// power, so winning the race cannot make you win fights (see the cosmetic-only
// monetization line: the game must never sell or gift an advantage).
/* Tom's call 2026-08-08: "top three should all get a prize of some sort." A
   winner-takes-all board stops mattering to everyone who cannot catch first by
   Wednesday; three places keeps the middle of the pack racing each other. */
/* Sized against the actual economy, not vibes. Tom, 2026-08-08: "the prizes seem
   weak, for a week long contest that's all you get? bump it up. and give 4th and
   5th something but just far less than top 3."
   Reference points: a Golden Crate is 400 coins in the shop, the top cosmetics
   are 1,500 to 3,000, a den win pays 120 to 250, and an egg is 60 dust. The old
   750-coin first prize was worth about three den wins for SEVEN DAYS of walking.
   First now buys a top-tier cosmetic outright. Total weekly injection across all
   five places is 10,000 coins, which is a few days of one active player. */
const STEP_RACE_PODIUM = [
  { coins: 5000, crate: 'golden', dust: 200, place: '1st' },
  { coins: 2500, crate: 'golden', dust: 100, place: '2nd' },
  { coins: 1500, crate: 'golden', dust: 0, place: '3rd' },
  { coins: 600, crate: 'daily', dust: 0, place: '4th' },
  { coins: 400, crate: 'daily', dust: 0, place: '5th' },
];
const STEP_RACE_PRIZE_COINS = STEP_RACE_PODIUM[0].coins;
/* RANK ONLY TOTALS COUNTED UNDER THE CURRENT RULES. weekSteps is summed on the
   phone, so a player who has not updated keeps pushing a total counted by an
   older window. v296 backdated the race by two days; v299 fixed it, and the
   board still led with 33,272 because that row was written by a phone that had
   not picked the fix up yet. A stale client is now simply unranked until it
   updates, rather than beating everyone with a number nobody else was allowed
   to count. Must match RACE_RULES in js/app.js. */
const RACE_RULES = 2;
/* NO GRANDFATHER CLAUSE. Tried one on 2026-08-07: rank a row anyway if it was
   written after the corrected build went live, so the board would not sit empty
   during adoption. It is unsound and MEASURED to be unsound: last_seen records
   when the row was written, not which code computed it. The 33,272 row re-synced
   twenty minutes after the fix was serving and pushed 33,608, because that phone
   is still running the old bundle. A timestamp cannot tell you what version did
   the arithmetic. Only the stamp can. */
const SPIRE_DORMANT_MS = 7 * 86400000;
const SPIRE_SHIELD_MS = 3600000;         // 1h after a takeover, the tower cannot flip back
const SIEGE_WINDOW_MS = 48 * 3600000;   // time to walk there and break it
const SIEGE_COOLDOWN_MS = 7 * 86400000; // at most one siege per player per week
const SIEGE_CHANCE = 0.7;               // ...and not even every eligible week
// Graverise-flavour besiegers. Seeded per (spire, week) so the name is stable for
// everyone looking at the same siege, owner and rival alike.
const SIEGE_NAMES = ['Gravelord Mulch', 'The Rattling Choir', 'Sister Ossuary', 'Kiln the Unfed',
  'Marrowjaw', 'The Pale Tithe', 'Hollow Abbot Crane', 'Nine-Finger Vesper'];
function siegeNameFor(id, at) {
  let h = 2166136261;
  const key = `${id}:${Math.floor(at / SIEGE_COOLDOWN_MS)}`;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return SIEGE_NAMES[(h >>> 0) % SIEGE_NAMES.length];
}

/* Expire any siege whose 48h has run out. NEVER destructive: the tower is not
   lost, it is backdated into DORMANT, which is the state the whole client already
   understands (and which frees a cap slot). Idempotent: the grant key carries the
   window, and tended_at only ever moves backwards to the dormancy line. */
async function sweepSieges(env, rows, now) {
  const dead = (rows || []).filter(r => r.siege_until && r.siege_until < now);
  for (const r of dead) {
    // ONE value, used for the write AND for the object we hand back. Computing the
    // dormancy line in SQL and again in JS let the response describe a state the
    // database was not in, which is how a test can pass over a broken write.
    const dormantAt = Math.min(r.tended_at, now - SPIRE_DORMANT_MS);
    await env.DB.prepare(
      `UPDATE spires SET tended_at = ?, siege_until = NULL, siege_name = NULL, updated_at = ?
       WHERE id = ? AND siege_until IS NOT NULL`)
      .bind(dormantAt, now, r.id).run();
    await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
      .bind(r.owner, `siege-lost-${r.id}-${r.siege_until}`, 'spire', JSON.stringify({
        note: `${r.siege_name || 'The siege'} broke through at ${r.name}. It stands dormant, not lost: walk back and take it again.`,
      }), now).run();
    r.siege_until = null; r.siege_name = null; r.tended_at = dormantAt;
  }
  return rows;
}

export default {
  /* THE CRON. Declared in wrangler.toml under [triggers], every 15 minutes.
     This is the only thing on this worker that deletes anything, and the only
     reason the events table has a ceiling at all.

     Awaited rather than handed to ctx.waitUntil, and the error is rethrown, so
     a broken prune shows up as a FAILED cron invocation in the Cloudflare
     dashboard. A pruner that silently stops is indistinguishable from one that
     had nothing to do, right up until the 10 GB cap arrives. */
  async scheduled(event, env) {
    try {
      const now = Date.now();
      const r = await pruneEvents(env, now);
      /* Grants second, and with whatever wall clock the events pass left. Events
         are the table with the 10 GB deadline and they are also the only one
         whose backlog can arrive in a burst, so they get the budget first; the
         grants pruner is cursorless and resumes on the next tick, so being cut
         short costs it nothing. Both are awaited and neither is swallowed: a
         pruner that silently stops is indistinguishable from one with nothing
         to do, right up until the cap arrives. */
      const g = await pruneGrants(env, now, { budgetMs: Math.max(1000, PRUNE_BUDGET_MS - r.ms) });
      console.log('prune', JSON.stringify({ cron: (event && event.cron) || null, ...r, grants: g }));
    } catch (e) {
      console.error('prune failed', (e && e.stack) || e);
      throw e;
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    try {
      if (path === '/health') return json({ ok: true, ts: Date.now() });

      // Register a device pubkey -> player. Idempotent: re-registering the same
      // key (reinstall from backup) returns the existing account.
      if (path === '/register' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        const jwk = body && body.pubkey;
        if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) return json({ error: 'bad pubkey' }, 400);
        const pub = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
        const existing = await env.DB.prepare('SELECT id, handle, friend_code, name FROM players WHERE pubkey = ?').bind(pub).first();
        if (existing) return json({ playerId: existing.id, handle: existing.handle, friendCode: existing.friend_code, name: existing.name || null, existing: true });
        // retry on the (astronomically unlikely) friend-code collision
        for (let i = 0; i < 5; i++) {
          const id = newId(), handle = makeHandle(), code = makeFriendCode(), now = Date.now();
          try {
            await env.DB.prepare('INSERT INTO players (id, pubkey, handle, friend_code, created_at, last_seen) VALUES (?,?,?,?,?,?)')
              .bind(id, pub, handle, code, now, now).run();
            // welcome grant: a little hello the client ingests as a ledger event
            await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
              .bind(id, 'social-welcome', 'welcome', JSON.stringify({ coins: 50, xp: 10, note: 'Welcome to the Crew' }), now).run();
            return json({ playerId: id, handle, friendCode: code });
          } catch (e) {
            if (!String(e).includes('UNIQUE')) throw e;
          }
        }
        return json({ error: 'could not allocate friend code' }, 500);
      }

      // Signed: push the game-profile snapshot (never food data).
      if (path === '/profile' && request.method === 'PUT') {
        const bodyText = await request.text();
        if (bodyText.length > MAX_PROFILE_BYTES) return json({ error: 'profile too large' }, 413);
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const body = JSON.parse(bodyText || '{}');
        if (!body.snapshot || typeof body.snapshot !== 'object') return json({ error: 'missing snapshot' }, 400);
        const snap = JSON.stringify(body.snapshot);
        const nowP = Date.now();
        await env.DB.prepare('UPDATE players SET profile = ?, app_v = ?, last_seen = ? WHERE id = ?')
          .bind(snap, String(body.appV || ''), nowP, auth.playerId).run();
        // Keep every tower I hold defended by my CURRENT build. The snapshot used
        // to be frozen at claim time, so a rival months later fought the weaker
        // version of me that first took the spire. Cheap: indexed by owner.
        await env.DB.prepare('UPDATE spires SET defender = ?, updated_at = ? WHERE owner = ?')
          .bind(snap, nowP, auth.playerId).run();
        return json({ ok: true });
      }

      // Signed: store the full ENCRYPTED save backup (client-side AES-GCM; the
      // server never has the key and cannot read it). One row per player.
      if (path === '/backup' && request.method === 'PUT') {
        const bodyText = await request.text();
        if (bodyText.length > MAX_BACKUP_BYTES) return json({ error: 'backup too large' }, 413);
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const body = JSON.parse(bodyText || '{}');
        if (typeof body.blob !== 'string' || !body.blob) return json({ error: 'missing blob' }, 400);
        const now = Date.now();
        try {
          await env.DB.prepare('INSERT INTO backups (player_id, blob, app_v, size, updated_at) VALUES (?,?,?,?,?) ' +
            'ON CONFLICT(player_id) DO UPDATE SET blob=excluded.blob, app_v=excluded.app_v, size=excluded.size, updated_at=excluded.updated_at')
            .bind(auth.playerId, body.blob, String(body.appV || ''), body.blob.length, now).run();
        } catch (e) {
          /* D1 HAS ITS OWN VALUE LIMIT, AND IT IS LOWER THAN MAX_BACKUP_BYTES.
             Measured 2026-08-17 by bisection against local D1: the largest blob
             that stores is 2,199,942 bytes, and 2,199,943 comes back
             "D1_ERROR: string or blob too big: SQLITE_TOOBIG". The constant
             above is 4 MB, so every save between roughly 2.2 MB and 4 MB was
             falling through to the generic handler as an unhandled 500.
             A 500 and a 413 are the same thing to the client (js/social.js
             pushBackup only reads r.ok), so this changes nothing a player sees.
             It changes what the LOGS say, which is the only place anybody could
             ever have noticed: a 500 reads as "the worker is broken" and gets
             chased, and this is not that. It is a save that has outgrown the
             row it lives in, and on the size distribution in the note on
             MAX_BACKUP_BYTES the p95 player reaches it at about five months.
             Deliberately NOT lowering MAX_BACKUP_BYTES to match. The measurement
             above is the LOCAL emulator's limit, not necessarily the deployed
             one, and a lower constant would refuse backups that production may
             well accept. Refusing to store somebody's save on the strength of a
             number measured somewhere else is the one mistake here that cannot
             be undone. The right fix is to move the blob to R2 and stop asking a
             row to hold a whole encrypted save; until then this makes the
             failure legible instead of alarming. */
          if (/TOOBIG|too big/i.test(String(e))) {
            return json({ error: 'backup too large for the database', code: 'too-large', bytes: body.blob.length }, 413);
          }
          throw e;
        }
        return json({ ok: true, updatedAt: now });
      }

      // Signed: pull the encrypted backup back down (fresh install / new phone).
      if (path === '/backup' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const row = await env.DB.prepare('SELECT blob, app_v, updated_at FROM backups WHERE player_id = ?').bind(auth.playerId).first();
        if (!row) return json({ error: 'no backup' }, 404);
        return json({ blob: row.blob, appV: row.app_v, updatedAt: row.updated_at });
      }

      /* ---------------- account recovery ----------------
         Why this exists: the backup above is encrypted with a key that lived
         ONLY in the device keychain. Delete the app and that key is gone, and
         the backup becomes undecryptable forever. That destroyed a real level 27
         account. A recovery phrase wraps the identity bundle client-side so the
         account can be rebuilt on any device. The server still only ever holds
         ciphertext plus a KDF salt: it cannot read a save, and it cannot help an
         attacker without also cracking the phrase. */

      // Signed: store (or replace) the wrapped identity bundle.
      if (path === '/recovery' && request.method === 'PUT') {
        const bodyText = await request.text();
        if (bodyText.length > 64 * 1024) return json({ error: 'too large' }, 413);
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const body = JSON.parse(bodyText || '{}');
        if (typeof body.wrapped !== 'string' || !body.wrapped) return json({ error: 'missing wrapped' }, 400);
        if (typeof body.salt !== 'string' || !body.salt) return json({ error: 'missing salt' }, 400);
        const iters = Number(body.iters) || 0;
        if (iters < 100000) return json({ error: 'weak kdf' }, 400);
        let rid = null;
        if (body.recoveryId != null && body.recoveryId !== '') {
          rid = String(body.recoveryId).toLowerCase().trim();
          if (!RECOVERY_ID_RE.test(rid)) return json({ error: 'bad recovery id' }, 400);
          const taken = await env.DB.prepare(
            'SELECT player_id FROM recovery WHERE recovery_id = ? AND player_id != ?')
            .bind(rid, auth.playerId).first();
          if (taken) return json({ error: 'that recovery id is taken' }, 409);
        }
        const now = Date.now();
        try {
          await env.DB.prepare(
            'INSERT INTO recovery (player_id, wrapped, salt, iters, updated_at, recovery_id) VALUES (?,?,?,?,?,?) ' +
            'ON CONFLICT(player_id) DO UPDATE SET wrapped=excluded.wrapped, salt=excluded.salt, ' +
            'iters=excluded.iters, updated_at=excluded.updated_at, ' +
            // keep the existing id when this call does not carry one
            'recovery_id=COALESCE(excluded.recovery_id, recovery.recovery_id)')
            .bind(auth.playerId, body.wrapped, body.salt, iters, now, rid).run();
        } catch (e) {
          // the unique index is the real guard; the SELECT above only races
          if (/UNIQUE|constraint/i.test(String(e))) return json({ error: 'that recovery id is taken' }, 409);
          throw e;
        }
        return json({ ok: true, updatedAt: now, recoveryId: rid });
      }

      // Is this recovery id free? Rate limited like the lookups, since it is an
      // unauthenticated probe of which handles exist.
      if (path.startsWith('/recovery/available/') && request.method === 'GET') {
        const rid = decodeURIComponent(path.slice('/recovery/available/'.length)).toLowerCase().trim();
        if (!RECOVERY_ID_RE.test(rid)) return json({ error: 'bad recovery id' }, 400);
        // Its own generous bucket: the setup sheet checks as you type, and this
        // must never eat the budget a real restore depends on.
        const limited = await rateLimitRecovery(request, env, 60, 600000, 'rl_ridcheck');
        if (limited) return limited;
        const row = await env.DB.prepare('SELECT 1 AS x FROM recovery WHERE recovery_id = ?').bind(rid).first();
        return json({ available: !row });
      }

      // UNSIGNED, same bargain as the friend-code lookup below: hands out
      // ciphertext to whoever knows the handle. A recovery id is CHOSEN, so it is
      // more guessable than a random friend code, which is exactly why the client
      // requires a longer phrase and a heavier KDF before it will attach one.
      if (path.startsWith('/recovery/id/') && request.method === 'GET') {
        const rid = decodeURIComponent(path.slice('/recovery/id/'.length)).toLowerCase().trim();
        if (!RECOVERY_ID_RE.test(rid)) return json({ error: 'bad recovery id' }, 400);
        const limited = await rateLimitRecovery(request, env);
        if (limited) return limited;
        const row = await env.DB.prepare(
          'SELECT wrapped, salt, iters FROM recovery WHERE recovery_id = ?').bind(rid).first();
        if (!row) return json({ error: 'no account' }, 404);
        return json({ wrapped: row.wrapped, salt: row.salt, iters: row.iters });
      }

      // Signed: has this account got a recovery phrase yet? (drives the nag)
      if (path === '/recovery' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const row = await env.DB.prepare('SELECT updated_at FROM recovery WHERE player_id = ?').bind(auth.playerId).first();
        return json({ set: !!row, updatedAt: row ? row.updated_at : null });
      }

      // UNSIGNED by necessity: a device restoring an account has no key yet, so
      // it cannot sign. Looked up by friend code, which is semi-public, so this
      // hands out ciphertext to anyone who knows a code. That is acceptable only
      // because the phrase is never sent and the wrap is PBKDF2-hardened, but it
      // does mean an offline attack is possible, so it is rate limited per IP.
      if (path.startsWith('/recovery/') && request.method === 'GET') {
        const code = decodeURIComponent(path.slice('/recovery/'.length)).toUpperCase().trim();
        if (!/^BONE-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return json({ error: 'bad code' }, 400);
        const limited = await rateLimitRecovery(request, env);
        if (limited) return limited;
        const p = await env.DB.prepare('SELECT id FROM players WHERE friend_code = ?').bind(code).first();
        if (!p) return json({ error: 'no account' }, 404);
        const row = await env.DB.prepare('SELECT wrapped, salt, iters FROM recovery WHERE player_id = ?').bind(p.id).first();
        if (!row) return json({ error: 'no recovery set' }, 404);
        return json({ wrapped: row.wrapped, salt: row.salt, iters: row.iters });
      }

      // Signed: pull server-issued ledger events (idempotent on the client by key).
      if (path === '/grants' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const since = Number(url.searchParams.get('since') || 0);
        /* RECORD THE READ WATERMARK. `since` is the client's grantCursor, and
           js/social.js pullGrants only advances it after applying the whole
           batch, so this request is the device stating that everything at or
           below `since` has landed. Nothing on the server used to keep that,
           which is why grants could never be pruned. See pruneGrants above.

           Batched with the read so it costs one D1 round trip rather than two,
           and written under three guards:
             - `COALESCE(grants_ack,0) < ?` so the common case (a client with
               nothing new to fetch re-sending the same cursor) changes no rows
               and the single writer is not touched at all.
             - MIN(?, the player's own highest grant id) so a client that sends
               a wildly future `since` cannot mark grants it has never been
               shown as acknowledged. Only its own account is reachable either
               way, but a self-inflicted hole is still a hole.
             - the ack is only ever raised, never lowered, so a restore that
               rolls the client's cursor backwards re-delivers whatever survives
               instead of un-acknowledging what is already gone. */
        const ackSql = `MIN(?, COALESCE((SELECT MAX(id) FROM grants WHERE player_id = players.id), 0))`;
        const [, rows] = await env.DB.batch([
          env.DB.prepare(
            `UPDATE players SET grants_ack = ${ackSql}
              WHERE id = ? AND COALESCE(grants_ack, 0) < ${ackSql}`).bind(since, auth.playerId, since),
          env.DB.prepare('SELECT id, key, type, payload, ts FROM grants WHERE player_id = ? AND id > ? ORDER BY id LIMIT 50')
            .bind(auth.playerId, since),
        ]);
        const grants = (rows.results || []).map(r => ({ id: r.id, key: r.key, type: r.type, payload: JSON.parse(r.payload), ts: r.ts }));
        return json({ grants, cursor: grants.length ? grants[grants.length - 1].id : since });
      }

      // Signed: set your display name from curated indices (no free text -> no
      // moderation). Server reconstructs the string from its own word lists.
      if (path === '/name' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const b = JSON.parse(bodyText || '{}');
        const name = buildName(b.adj, b.noun, b.num);
        if (!name) return json({ error: 'bad name indices' }, 400);
        /* NAMES ARE UNIQUE. Tom, 2026-08-08: "How did you allow two people to
           pick the same name Massive coc? That was the whole point of usernames?"
           There was no check here and no UNIQUE on players.name, so /name was a
           blind UPDATE. Worth being precise about why it happened: this is not
           unlucky collision. The name is picked from chips, so players are not
           sampling 6400 combinations uniformly, they are all reaching for the
           same joke. The funniest combination is the one that collides first.
           Case-insensitive, because "Massive Coccyx" and "massive coccyx" are the
           same name to everyone reading a leaderboard. First claimant keeps it.
           `taken` is a named outcome, not an error string the client sniffs. */
        const clash = await env.DB.prepare(
          'SELECT id FROM players WHERE name IS NOT NULL AND lower(name) = lower(?) AND id <> ?')
          .bind(name, auth.playerId).first();
        if (clash) {
          // Offer the lowest free #N for this adj+noun so the client can propose
          // one instead of making the player guess their way through the space.
          const base = buildName(b.adj, b.noun, null);
          const rows = await env.DB.prepare(
            "SELECT name FROM players WHERE name IS NOT NULL AND lower(name) LIKE lower(?) || ' #%'")
            .bind(base).all().catch(() => ({ results: [] }));
          const used = new Set((rows.results || []).map(r => {
            const m = /#(\d{1,3})$/.exec(r.name || '');
            return m ? Number(m[1]) : -1;
          }));
          let free = null;
          for (let i = 1; i <= 999; i++) if (!used.has(i)) { free = i; break; }
          return json({ ok: false, reason: 'taken', name, suggestNum: free }, 409);
        }
        await env.DB.prepare('UPDATE players SET name = ?, last_seen = ?, rename_of = NULL WHERE id = ?')
          .bind(name, Date.now(), auth.playerId).run();
        return json({ ok: true, name });
      }

      // Signed: request a friend by their friend code. If they already requested
      // you, this accepts. Idempotent.
      if (path === '/friends/request' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const code = String((JSON.parse(bodyText || '{}').code) || '').toUpperCase().trim();
        const target = await env.DB.prepare('SELECT id FROM players WHERE friend_code = ?').bind(code).first();
        if (!target) return json({ error: 'no player with that code' }, 404);
        if (target.id === auth.playerId) return json({ error: 'that is your own code' }, 400);
        const [a, b] = pairKey(auth.playerId, target.id);
        const ex = await env.DB.prepare('SELECT status, requested_by FROM friendships WHERE a = ? AND b = ?').bind(a, b).first();
        const now = Date.now();
        if (ex && ex.status === 'accepted') return json({ ok: true, status: 'accepted' });
        if (ex && ex.requested_by !== auth.playerId) { // they already asked me -> accept
          await env.DB.prepare('UPDATE friendships SET status = ? , ts = ? WHERE a = ? AND b = ?').bind('accepted', now, a, b).run();
          return json({ ok: true, status: 'accepted' });
        }
        if (!ex) await env.DB.prepare('INSERT INTO friendships (a, b, status, requested_by, ts) VALUES (?,?,?,?,?)').bind(a, b, 'pending', auth.playerId, now).run();
        return json({ ok: true, status: 'pending' });
      }

      // Signed: accept an incoming request.
      if (path === '/friends/accept' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const other = String(JSON.parse(bodyText || '{}').id || '');
        const [a, b] = pairKey(auth.playerId, other);
        const ex = await env.DB.prepare('SELECT requested_by FROM friendships WHERE a = ? AND b = ?').bind(a, b).first();
        if (!ex) return json({ error: 'no such request' }, 404);
        if (ex.requested_by === auth.playerId) return json({ error: 'cannot accept your own request' }, 400);
        await env.DB.prepare('UPDATE friendships SET status = ?, ts = ? WHERE a = ? AND b = ?').bind('accepted', Date.now(), a, b).run();
        return json({ ok: true });
      }

      // Signed: remove a friend / decline a request.
      if (path === '/friends/remove' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const [a, b] = pairKey(auth.playerId, String(JSON.parse(bodyText || '{}').id || ''));
        await env.DB.prepare('DELETE FROM friendships WHERE a = ? AND b = ?').bind(a, b).run();
        return json({ ok: true });
      }

      // Signed: my friends + pending, each with the other player's public profile.
      if (path === '/friends' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const rows = await env.DB.prepare(
          'SELECT f.a, f.b, f.status, f.requested_by, f.ts, ' +
          'pa.handle a_handle, pa.name a_name, pa.friend_code a_code, pa.profile a_profile, pa.app_v a_v, pa.last_seen a_seen, ' +
          'pb.handle b_handle, pb.name b_name, pb.friend_code b_code, pb.profile b_profile, pb.app_v b_v, pb.last_seen b_seen ' +
          'FROM friendships f JOIN players pa ON pa.id = f.a JOIN players pb ON pb.id = f.b ' +
          'WHERE f.a = ? OR f.b = ? ORDER BY f.ts DESC LIMIT 100').bind(auth.playerId, auth.playerId).all();
        const friends = [], incoming = [], outgoing = [];
        for (const r of rows.results || []) {
          const meIsA = r.a === auth.playerId;
          const other = {
            playerId: meIsA ? r.b : r.a,
            name: (meIsA ? r.b_name : r.a_name) || (meIsA ? r.b_handle : r.a_handle),
            handle: meIsA ? r.b_handle : r.a_handle,
            friendCode: meIsA ? r.b_code : r.a_code,
            appV: meIsA ? r.b_v : r.a_v,
            profile: (() => { try { return JSON.parse(meIsA ? r.b_profile : r.a_profile); } catch { return null; } })(),
            since: r.ts,
            lastSeen: meIsA ? r.b_seen : r.a_seen,
          };
          if (r.status === 'accepted') friends.push(other);
          else if (r.requested_by === auth.playerId) outgoing.push(other);
          else incoming.push(other);
        }
        return json({ friends, incoming, outgoing });
      }

      /* ---------------- Dark Spires: shared territory ----------------
         Ownership has to live here or a spire means something different on every
         phone. Unclaimed spires have NO row, matching the client's local model,
         so "nobody has taken it" needs no bookkeeping. The client still owns
         placement and naming (both deterministic from the map cell), so the
         server never invents a tower. */

      /* Every tower I hold, and the ONLY place a siege is ever created.
         WHY LAZILY, HERE, instead of a cron: there is no server-to-device push
         channel in this project at all (notifications are scheduled on-device).
         A cron could start a 48h siege while the app was closed and burn the whole
         window in silence, which is unwinnable-by-design. Creating it at the moment
         the owner checks in guarantees they see the full 48 hours. It also means a
         player on an OLD build is simply never besieged, because old clients never
         call this route: nobody gets a timer they cannot see. */
      if (path === '/spires/mine' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const now = Date.now();
        const rs = await env.DB.prepare(
          `SELECT id, name, lat, lng, owner, owner_name, claimed_at, tended_at, level, siege_until, siege_name
             FROM spires WHERE owner = ?`).bind(auth.playerId).all();
        let rows = await sweepSieges(env, rs.results || [], now);

        // Eligible: I hold a live tower, none of them is already under siege, and
        // my weekly cooldown has passed. Then a roll, so it is not a chore.
        const live = rows.filter(r => r.tended_at > now - SPIRE_DORMANT_MS);
        const besieged = rows.some(r => r.siege_until && r.siege_until > now);
        const me = await env.DB.prepare('SELECT siege_last FROM players WHERE id = ?').bind(auth.playerId).first();
        const cooled = !me?.siege_last || (now - me.siege_last) >= SIEGE_COOLDOWN_MS;
        // DEV-only: force the roll so a test can exercise CREATION deterministically
        // (eligibility and target choice are the logic worth testing; the dice are
        // not). Never available in production.
        const forced = env.DEV === '1' && url.searchParams.get('force') === '1';
        if (live.length && !besieged && cooled && (forced || Math.random() < SIEGE_CHANCE)) {
          // the least-recently-tended tower: deterministic (so it is testable) and
          // it nudges the weekly circuit toward the one being neglected
          const target = live.slice().sort((a, b) => a.tended_at - b.tended_at)[0];
          const until = now + SIEGE_WINDOW_MS;
          const nm = siegeNameFor(target.id, now);
          await env.DB.batch([
            env.DB.prepare('UPDATE spires SET siege_until = ?, siege_name = ?, updated_at = ? WHERE id = ? AND owner = ?')
              .bind(until, nm, now, target.id, auth.playerId),
            env.DB.prepare('UPDATE players SET siege_last = ? WHERE id = ?').bind(now, auth.playerId),
          ]);
          rows = rows.map(r => r.id === target.id ? { ...r, siege_until: until, siege_name: nm } : r);
        }
        return json({
          spires: rows.map(r => ({
            id: r.id, name: r.name, lat: r.lat, lng: r.lng, level: r.level || 1,
            claimedAt: r.claimed_at, tendedAt: r.tended_at,
            siegeUntil: r.siege_until || null, siegeName: r.siege_name || null,
          })),
        });
      }

      // Break a siege. Owner only, and only while the window is actually open: a
      // repelled siege LEVELS the tower, which is what makes level mean something.
      if (path.startsWith('/spires/') && path.endsWith('/defend') && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const id = path.slice('/spires/'.length, -'/defend'.length);
        if (!/^sp-[-0-9]+-[-0-9]+$/.test(id)) return json({ error: 'bad spire id' }, 400);
        const now = Date.now();
        const row = await env.DB.prepare('SELECT owner, siege_until, level FROM spires WHERE id = ?').bind(id).first();
        if (!row || row.owner !== auth.playerId) return json({ ok: false, reason: 'not-yours' }, 403);
        if (!row.siege_until || row.siege_until < now) return json({ ok: false, reason: 'no-siege' }, 409);
        await env.DB.prepare(
          `UPDATE spires SET siege_until = NULL, siege_name = NULL, tended_at = ?, level = level + 1, updated_at = ?
             WHERE id = ? AND owner = ?`).bind(now, now, id, auth.playerId).run();
        return json({ ok: true, level: (row.level || 1) + 1 });
      }

      // Who holds these spires? ids come from the client's local cell scan.
      if (path === '/spires' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const ids = (url.searchParams.get('ids') || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 24);
        if (!ids.length) return json({ spires: [] });
        const q = `SELECT id, name, owner, owner_name, defender, claimed_at, tended_at, level, siege_until, siege_name FROM spires WHERE id IN (${ids.map(() => '?').join(',')})`;
        const rs = await env.DB.prepare(q).bind(...ids).all();
        // a rival walking past a besieged tower should see it under siege too
        const swept = await sweepSieges(env, rs.results || [], Date.now());
        return json({
          spires: swept.map(r => ({
            id: r.id, name: r.name, owner: r.owner, ownerName: r.owner_name,
            siegeUntil: r.siege_until || null, siegeName: r.siege_name || null,
            claimedAt: r.claimed_at,          // so a rival's tower can show its age
            mine: r.owner === auth.playerId,
            defender: r.owner === auth.playerId ? null : JSON.parse(r.defender || 'null'),
            claimedAt: r.claimed_at, tendedAt: r.tended_at, level: r.level,
          })),
        });
      }

      // Take one. The client has already won the fight locally (same trust model
      // as every other award in this game, friends-scale, stated plainly).
      if (path.startsWith('/spires/') && path.endsWith('/claim') && request.method === 'PUT') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const id = path.slice('/spires/'.length, -'/claim'.length);
        if (!/^sp-[-0-9]+-[-0-9]+$/.test(id)) return json({ error: 'bad spire id' }, 400);
        const b = JSON.parse(bodyText || '{}');
        if (!b.name || typeof b.lat !== 'number' || typeof b.lng !== 'number') return json({ error: 'missing spire' }, 400);
        const now = Date.now();
        const me = await env.DB.prepare('SELECT id, name, handle, profile FROM players WHERE id = ?').bind(auth.playerId).first();
        const prev = await env.DB.prepare('SELECT owner, owner_name, level, claimed_at FROM spires WHERE id = ?').bind(id).first();
        // SHIELD: a tower just taken cannot be taken straight back. Two friends at
        // one corner could otherwise ping-pong a spire for 80 coins a pass, and
        // spire fights are free. Derived from claimed_at, so no new column.
        if (prev && prev.owner !== auth.playerId && (prev.claimed_at || 0) > now - SPIRE_SHIELD_MS) {
          return json({ error: 'shielded', until: (prev.claimed_at || 0) + SPIRE_SHIELD_MS }, 409);
        }
        if (prev && prev.owner === auth.playerId) {
          await env.DB.prepare('UPDATE spires SET tended_at = ?, updated_at = ?, defender = ? WHERE id = ?')
            .bind(now, now, me.profile || null, id).run();
          return json({ ok: true, already: true, level: prev.level || 1 });
        }
        // Cap: three live spires each, enforced HERE too. A client-only cap is a
        // suggestion, and this is the rule that keeps towers available to others.
        const held = await env.DB.prepare('SELECT COUNT(*) AS n FROM spires WHERE owner = ? AND tended_at > ?')
          .bind(auth.playerId, now - SPIRE_DORMANT_MS).first();
        if ((held?.n || 0) >= 3) return json({ error: 'cap', cap: 3 }, 409);
        await env.DB.prepare(`INSERT INTO spires (id, name, lat, lng, owner, owner_name, defender, claimed_at, tended_at, level, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, owner=excluded.owner, owner_name=excluded.owner_name,
               defender=excluded.defender, claimed_at=excluded.claimed_at, tended_at=excluded.tended_at,
               level=spires.level+1, updated_at=excluded.updated_at`)
          .bind(id, String(b.name).slice(0, 40), b.lat, b.lng, auth.playerId, me?.name || me?.handle || null,
                me?.profile || null, now, now, 1, now).run();
        // Tell the loser, through the grants channel the client already ingests.
        if (prev && prev.owner !== auth.playerId) {
          await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
            .bind(prev.owner, `spire-lost-${id}-${now}`, 'spire', JSON.stringify({
              note: `${me?.name || me?.handle || 'Someone'} toppled ${b.name}. Walk back and take it.`,
            }), now).run();
        }
        // the level AFTER this write is the number the client must mirror: a fresh
        // claim is 1, a takeover is the previous level + 1
        const lvl = prev ? (prev.level || 1) + 1 : 1;
        return json({ ok: true, tookFrom: prev ? (prev.owner_name || 'someone') : null, level: lvl });
      }

      // A visit restores resolve. Owner only.
      if (path.startsWith('/spires/') && path.endsWith('/tend') && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const id = path.slice('/spires/'.length, -'/tend'.length);
        if (!/^sp-[-0-9]+-[-0-9]+$/.test(id)) return json({ error: 'bad spire id' }, 400);
        const now = Date.now();
        const r = await env.DB.prepare('UPDATE spires SET tended_at = ?, updated_at = ? WHERE id = ? AND owner = ?')
          .bind(now, now, id, auth.playerId).run();
        return json({ ok: !!(r.meta?.changes) });
      }

      // Signed: the all-players leaderboard. Ranked by snapshot level. Includes
      // each player's friend code so anyone can add anyone straight from the
      // board (deliberate while the community is small — codes are share-keys,
      // not secrets, and names are curated so there's no PII here).
      if (path === '/leaderboard' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const rows = await env.DB.prepare(
          `SELECT id, handle, name, friend_code,
                  CAST(COALESCE(json_extract(profile,'$.level'), 1) AS INTEGER) lvl,
                  json_extract(profile,'$.levelName') lvlName,
                  CAST(COALESCE(json_extract(profile,'$.badges'), 0) AS INTEGER) badges,
                  json_extract(profile,'$.outfit') outfit,
                  json_extract(profile,'$.pet') pet,
                  json_extract(profile,'$.stats') stats,
                  /* the COUNT, not the array. Tom, 2026-08-07: "when you click a
                     friend on the leaderboard on the crew tab it shows their gear
                     at 0 no matter who they are." It did, because this row never
                     carried gear at all and the sheet renders p.gear.length.
                     Sending the array would be up to 400 ids x 100 players; the
                     sheet only ever shows the number. */
                  json_array_length(COALESCE(json_extract(profile,'$.gear'), '[]')) gearCount,
                  last_seen, created_at,
                  (SELECT COUNT(*) FROM spires sp WHERE sp.owner = players.id AND sp.tended_at > ?) spires,
                  (SELECT COALESCE(SUM(? - sp.claimed_at), 0) FROM spires sp WHERE sp.owner = players.id AND sp.tended_at > ?) held_ms
           FROM players
           WHERE profile IS NOT NULL -- a registration that never synced a snapshot COALESCEs to a level-1 "bot"; hide it
           ORDER BY lvl DESC, badges DESC, last_seen DESC LIMIT 100`)
          .bind(Date.now() - SPIRE_DORMANT_MS, Date.now(), Date.now() - SPIRE_DORMANT_MS).all();
        const players = (rows.results || []).map(r => ({
          playerId: r.id,
          name: r.name || r.handle,
          level: r.lvl || 1,
          levelName: r.lvlName || null,
          badges: r.badges || 0,
          outfit: (() => { try { return r.outfit ? JSON.parse(r.outfit) : null; } catch { return null; } })(), // cosmetic ids only; art renders client-side
          stats: (() => { try { return r.stats ? JSON.parse(r.stats) : null; } catch { return null; } })(),
          gearCount: r.gearCount || 0,
          pet: (() => { try { return r.pet ? JSON.parse(r.pet) : null; } catch { return null; } })(), // {id, level, shiny, lineage}: the board must show a shiny as its shiny
          friendCode: r.friend_code,
          lastSeen: r.last_seen,
          joinedAt: r.created_at,   // powers the Crew's "new Boneheadz" welcome list
          spires: r.spires || 0,
          spireDays: Math.floor((r.held_ms || 0) / 86400000),
          you: r.id === auth.playerId,
        }));
        return json({ players });
      }

      /* THE WEEKLY STEP RACE.
       *
       * Tom, 2026-08-08: "there should be weekly events that show which player
       * has the most steps and then a prize that they win for having the most.
       * the event should show who is currently in first, 2nd 3rd, in a fun way
       * that creates rivalry and gets people moving."
       *
       * No new table. The client stamps `weekSteps` and the `weekKey` they belong
       * to into the profile snapshot it already syncs, so a stale client can
       * never have last week's total counted into this week's race.
       *
       * Settlement is LAZY: the first request in a new week pays out the previous
       * week's winner through the normal grants channel. No cron, and the
       * INSERT OR IGNORE on a `stepweek-<weekKey>` key makes it idempotent no
       * matter how many clients race to be first through the door.
       */
      if (path === '/steps/week' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const wk = String(url.searchParams.get('week') || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(wk)) return json({ error: 'bad week' }, 400);

        const board = async weekKey => (await env.DB.prepare(
          `SELECT id, handle, name, json_extract(profile,'$.outfit') outfit,
                  CAST(COALESCE(json_extract(profile,'$.weekSteps'),0) AS INTEGER) steps
             FROM players
            WHERE profile IS NOT NULL
              AND json_extract(profile,'$.weekKey') = ?
              AND CAST(COALESCE(json_extract(profile,'$.raceV'),0) AS INTEGER) >= ${RACE_RULES}
              AND CAST(COALESCE(json_extract(profile,'$.weekSteps'),0) AS INTEGER) > 0
            ORDER BY steps DESC LIMIT 25`).bind(weekKey).all()).results || [];

        // Settle the week just gone, once, before answering for this one.
        const prev = new Date(Date.parse(wk + 'T00:00:00Z') - 7 * 86400000).toISOString().slice(0, 10);
        const settledKey = `stepweek-${prev}`;
        const already = await env.DB.prepare('SELECT 1 FROM grants WHERE key = ? LIMIT 1').bind(settledKey).first();
        let champion = null;
        if (!already) {
          const last = await board(prev);
          if (last.length) {
            const w = last[0];
            champion = { name: w.name || w.handle, steps: w.steps, week: prev };
            // Pay the whole podium. Every grant carries the SAME settledKey so the
            // `already` check above still sees the week as settled after one row,
            // and OR IGNORE keeps a re-run from paying anyone twice; the key is
            // unique per (player, key), so three players can each hold one.
            for (let i = 0; i < Math.min(STEP_RACE_PODIUM.length, last.length); i++) {
              const p = last[i], prize = STEP_RACE_PODIUM[i];
              await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
                .bind(p.id, settledKey, 'social', JSON.stringify({
                  coins: prize.coins,
                  ...(prize.crate ? { crate: prize.crate } : {}),
                  ...(prize.dust ? { dust: prize.dust } : {}),
                  /* place and steps as NUMBERS, not only inside the note. The
                     first settlement (2026-08-07) wrote them into English prose
                     alone, so /steps/settled has to parse a sentence to read
                     back its own result. applyPayload ignores keys it does not
                     know, so these are free to the client. */
                  place: i + 1,
                  steps: p.steps,
                  note: `${prize.place} in the step race with ${p.steps.toLocaleString()} steps!`,
                }), Date.now()).run();
            }
          }
          // If nobody raced last week there is nothing to settle and nothing to
          // record: a marker row would be pulled down as a grant and show up in
          // somebody's Deliveries as an empty gift. Re-checking an empty week is
          // one indexed query.
        }

        const rows = await board(wk);
        const meIdx = rows.findIndex(r => r.id === auth.playerId);
        return json({
          week: wk,
          prize: { coins: STEP_RACE_PRIZE_COINS, crate: 'golden' },
          podium: STEP_RACE_PODIUM,       // so the card can show what 2nd and 3rd pay too
          champion,                       // last week's winner, for the "who to beat" line
          yourRank: meIdx >= 0 ? meIdx + 1 : null,
          racers: rows.length,
          players: rows.slice(0, 10).map((r, i) => ({
            rank: i + 1,
            playerId: r.id,
            name: r.name || r.handle,
            steps: r.steps,
            outfit: (() => { try { return r.outfit ? JSON.parse(r.outfit) : null; } catch { return null; } })(),
            you: r.id === auth.playerId,
          })),
        });
      }

      /* THE SETTLED RESULT, read back from what was actually PAID.
       *
       * /steps/week CANNOT answer this and never could. Its board filters on
       * each player's CURRENT profile weekKey, so a racer vanishes from last
       * week's board the moment they take a step in the new one. Measured
       * against production on 2026-08-14, seven days after the only race that
       * has settled: three of the five players who were PAID had already
       * rolled over, and querying that week returned three players who never
       * placed, promoted 5th to 2nd, and reported the winner's steps 90 higher
       * than the total he was paid on (that board is a live counter, not a
       * result). A poster built on it would have announced the wrong winners.
       *
       * The grants rows ARE the receipt. They are written once at settlement,
       * never rewritten, and they carry the player id, so the name and the
       * outfit stay joinable forever. Nothing here decays.
       */
      if (path === '/steps/settled' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const wk = String(url.searchParams.get('week') || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(wk)) return json({ error: 'bad week' }, 400);
        const paid = (await env.DB.prepare(
          `SELECT g.payload, p.name, p.handle, json_extract(p.profile,'$.outfit') outfit
             FROM grants g LEFT JOIN players p ON p.id = g.player_id
            WHERE g.key = ?`).bind(`stepweek-${wk}`).all()).results || [];
        const podium = paid.map(r => {
          let pl = {};
          try { pl = JSON.parse(r.payload || '{}'); } catch { /* a torn row is one missing place, not a 500 */ }
          // Fallback for the August 2026 settlement, whose place and steps live
          // only in the note. Newer rows carry both as fields (see above).
          const m = /^(\d+)\D\D in the step race with ([\d,]+) steps/.exec(pl.note || '');
          return {
            place: Number(pl.place) || (m ? Number(m[1]) : 0),
            steps: Number(pl.steps) || (m ? Number(m[2].replace(/,/g, '')) : 0),
            name: r.name || r.handle || 'A Bonehead',
            outfit: (() => { try { return r.outfit ? JSON.parse(r.outfit) : null; } catch { return null; } })(),
            coins: pl.coins || 0,
            crate: pl.crate || null,
            dust: pl.dust || 0,
          };
        }).filter(x => x.place > 0 && x.steps > 0).sort((a, b) => a.place - b.place);
        return json({ week: wk, podium });
      }

      // Signed: send a gift to an accepted friend. mode 'free' = one server-rolled
      // gift per friend per day; mode 'spend' = the sender's own coins (client
      // deducts locally), capped 5/friend/day + 1000/gift. Delivered as a grant so
      // it rides the recipient's normal reward-reveal on their next open.
      if (path === '/gift' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const bd = JSON.parse(bodyText || '{}');
        const to = String(bd.to || '');
        const mode = bd.mode === 'spend' ? 'spend' : 'free';
        if (!to || to === auth.playerId) return json({ error: 'bad recipient' }, 400);
        const [a, b] = pairKey(auth.playerId, to);
        const fr = await env.DB.prepare('SELECT status FROM friendships WHERE a = ? AND b = ?').bind(a, b).first();
        if (!fr || fr.status !== 'accepted') return json({ error: 'not friends' }, 403);
        const me = await env.DB.prepare('SELECT handle, name FROM players WHERE id = ?').bind(auth.playerId).first();
        const fromName = (me && (me.name || me.handle)) || 'A Bonehead';
        const day = new Date(Date.now()).toISOString().slice(0, 10);
        let reward, key, note;
        if (mode === 'free') {
          key = `gift-free-${auth.playerId}-${day}`;
          const existed = await env.DB.prepare('SELECT 1 FROM grants WHERE player_id = ? AND key = ?').bind(to, key).first();
          if (existed) return json({ error: 'already sent today', code: 'daily-done' }, 409);
          reward = rollFreeGift();
          note = `${fromName} sent you a gift!`;
        } else {
          const coins = Math.max(1, Math.min(1000, Math.floor(bd.coins || 0)));
          // prefix-range count (no LIKE: playerIds contain '_', a LIKE wildcard)
          const pfx = `gift-spend-${auth.playerId}-${day}-`;
          const cnt = await env.DB.prepare('SELECT COUNT(*) n FROM grants WHERE player_id = ? AND key >= ? AND key < ?').bind(to, pfx, pfx + '￿').first();
          const n = (cnt && cnt.n) || 0;
          if (n >= 5) return json({ error: 'daily spend-gift limit', code: 'limit' }, 429);
          key = `gift-spend-${auth.playerId}-${day}-${n}`;
          reward = { coins };
          note = `${fromName} sent you ${coins} coins!`;
        }
        const payload = JSON.stringify({ ...reward, from: fromName, note, gift: true, mode });
        await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)').bind(to, key, 'gift', payload, Date.now()).run();
        return json({ ok: true, reward, mode });
      }

      // Signed: send a preset cheer/emote to an accepted friend. Index into a
      // client-side phrase list (no free text = nothing to moderate). Capped
      // 10/friend/day. Delivered as a reward-less grant.
      if (path === '/cheer' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const bd = JSON.parse(bodyText || '{}');
        const to = String(bd.to || '');
        const cheer = Math.floor(Number(bd.cheer));
        if (!to || to === auth.playerId) return json({ error: 'bad recipient' }, 400);
        if (!(cheer >= 0 && cheer < 64)) return json({ error: 'bad cheer' }, 400);
        const [a, b] = pairKey(auth.playerId, to);
        const fr = await env.DB.prepare('SELECT status FROM friendships WHERE a = ? AND b = ?').bind(a, b).first();
        if (!fr || fr.status !== 'accepted') return json({ error: 'not friends' }, 403);
        const me = await env.DB.prepare('SELECT handle, name FROM players WHERE id = ?').bind(auth.playerId).first();
        const fromName = (me && (me.name || me.handle)) || 'A Bonehead';
        const day = new Date(Date.now()).toISOString().slice(0, 10);
        const pfx = `cheer-${auth.playerId}-${day}-`;
        const cnt = await env.DB.prepare('SELECT COUNT(*) n FROM grants WHERE player_id = ? AND key >= ? AND key < ?').bind(to, pfx, pfx + '￿').first();
        const n = (cnt && cnt.n) || 0;
        if (n >= 10) return json({ error: 'daily cheer limit', code: 'limit' }, 429);
        const key = `cheer-${auth.playerId}-${day}-${n}`;
        const payload = JSON.stringify({ from: fromName, cheer, cheerFrom: auth.playerId, note: `${fromName} cheered you` });
        await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)').bind(to, key, 'cheer', payload, Date.now()).run();
        return json({ ok: true });
      }

      // Signed: who am I (handle/code/name lookup, used by the client after restore).
      if (path === '/me' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const row = await env.DB.prepare('SELECT handle, friend_code, name, created_at, rename_of FROM players WHERE id = ?').bind(auth.playerId).first();
        /* `renameOf` is a rename WE owe this player: they hold a name somebody
           older already had, because /name shipped without a uniqueness check.
           Deliberately NOT delivered as a grant. A grant is consumed once, and
           this player's client is on an old build that would swallow it without
           understanding the payload, losing the flag forever. A column on the row
           is durable: an old client ignores an unknown field, and the moment they
           update, it is still here. Cleared by /name when they actually rename. */
        return json({ handle: row.handle, friendCode: row.friend_code, name: row.name || null, createdAt: row.created_at,
          renameOf: row.rename_of || null });
      }

      // Anonymous analytics ingest. Unsigned (events carry only a random device
      // id + coarse event names, no identity/PII), but capped to resist spam.
      if (path === '/events' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body || typeof body.device !== 'string' || !Array.isArray(body.events)) return json({ error: 'bad body' }, 400);
        const device = body.device.slice(0, 64);
        const appV = String(body.appV || '').slice(0, 16);
        const batch = body.events.slice(0, 50); // cap per request
        const now = Date.now();
        const stmt = env.DB.prepare('INSERT INTO events (device, name, props, app_v, day, ts) VALUES (?,?,?,?,?,?)');
        const ops = [];
        for (const e of batch) {
          if (!e || typeof e.name !== 'string') continue;
          const ts = Number(e.ts) || now;
          const day = new Date(ts).toISOString().slice(0, 10);
          const props = e.props ? JSON.stringify(e.props).slice(0, 300) : null;
          ops.push(stmt.bind(device, e.name.slice(0, 40), props, appV, day, ts));
        }
        if (ops.length) await env.DB.batch(ops);
        // upsert the tester's identity (Crew name, if online) + coarse edge geo
        // from Cloudflare (country/region/city off the request IP; no device GPS).
        const cf = request.cf || {};
        const label = (typeof body.label === 'string' && body.label) ? body.label.slice(0, 40) : null;
        // `plat` is the shell + OS family, nothing fingerprintable. Without it,
        // "is this player on Android" was unanswerable and support was guesswork.
        const plat = (typeof body.plat === 'string' && body.plat) ? body.plat.slice(0, 16) : null;
        await env.DB.prepare(
          `INSERT INTO devices (device, label, plat, country, region, city, first_seen, last_seen)
           VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(device) DO UPDATE SET
             label = COALESCE(excluded.label, devices.label),
             plat = COALESCE(excluded.plat, devices.plat),
             country = COALESCE(excluded.country, devices.country),
             region = COALESCE(excluded.region, devices.region),
             city = COALESCE(excluded.city, devices.city),
             last_seen = excluded.last_seen`
        ).bind(device, label, plat, cf.country || null, cf.region || cf.regionCode || null, cf.city || null, now, now).run();
        return json({ ok: true, accepted: ops.length });
      }

      // Player-submitted map feedback: den nominations + unreachable-spot reports.
      // Unsigned + best-effort like /events (no account needed). Private dev
      // channel — only ever surfaced in the admin dashboard, never to players.
      if (path === '/report' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body || typeof body.device !== 'string' || typeof body.kind !== 'string') return json({ error: 'bad body' }, 400);
        const kind = body.kind.slice(0, 24); // 'den-nominate' | 'unreachable'
        const device = body.device.slice(0, 64);
        const appV = String(body.appV || '').slice(0, 16);
        const label = (typeof body.label === 'string' && body.label) ? body.label.slice(0, 40) : null;
        const lat = Number.isFinite(body.lat) ? Math.round(body.lat * 1e5) / 1e5 : null;
        const lng = Number.isFinite(body.lng) ? Math.round(body.lng * 1e5) / 1e5 : null;
        const target = (typeof body.target === 'string' && body.target) ? body.target.slice(0, 60) : null;
        const note = (typeof body.note === 'string' && body.note) ? body.note.slice(0, 280) : null;
        const cf = request.cf || {};
        const city = [cf.city, cf.region || cf.regionCode, cf.country].filter(Boolean).join(', ') || null;
        await env.DB.prepare(
          `INSERT INTO reports (device, label, kind, lat, lng, target, note, app_v, geo, ts)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).bind(device, label, kind, lat, lng, target, note, appV, city, Date.now()).run();
        return json({ ok: true });
      }

      // One-time in-app survey lead: name/email/feedback/most-wanted + an explicit
      // opt-in to update emails. Unsigned + best-effort like /report (no account
      // needed). Email is contact info -> declared in the store data-safety forms.
      // Private dev channel; only ever surfaced in the admin dashboard.
      if (path === '/survey' && request.method === 'POST') {
        const body = await request.json().catch(() => null);
        if (!body || typeof body.device !== 'string') return json({ error: 'bad body' }, 400);
        const device = body.device.slice(0, 64);
        const player = (typeof body.player === 'string' && body.player) ? body.player.slice(0, 200) : null;
        const label = (typeof body.label === 'string' && body.label) ? body.label.slice(0, 40) : null;
        const name = (typeof body.name === 'string' && body.name) ? body.name.trim().slice(0, 60) : null;
        const email = (typeof body.email === 'string' && body.email) ? body.email.trim().slice(0, 120) : null;
        const optin = body.emailOptin ? 1 : 0;
        const feedback = (typeof body.feedback === 'string' && body.feedback) ? body.feedback.slice(0, 500) : null;
        const mostWanted = (typeof body.mostWanted === 'string' && body.mostWanted) ? body.mostWanted.slice(0, 280) : null;
        // features they said they use: an array of short slugs -> stored comma-joined
        const features = Array.isArray(body.features)
          ? body.features.filter(f => typeof f === 'string').slice(0, 20).map(f => f.slice(0, 24)).join(',') || null
          : null;
        const appV = String(body.appV || '').slice(0, 16);
        const cf = request.cf || {};
        const city = [cf.city, cf.region || cf.regionCode, cf.country].filter(Boolean).join(', ') || null;
        await env.DB.prepare(
          `INSERT INTO leads (device, player, label, name, email, email_optin, feedback, most_wanted, features, app_v, geo, ts)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(device, player, label, name, email, optin, feedback, mostWanted, features, appV, city, Date.now()).run();
        return json({ ok: true });
      }

      /* Admin dashboard aggregates. Gated by ADMIN_TOKEN (set via wrangler secret).
       *
       * TWO WINDOWS, AND THEY MEAN DIFFERENT THINGS.
       *
       * EVENT_RETENTION_DAYS (60) is what EXISTS: the cron deletes events older
       * than that, so nothing here can see further back however it is asked.
       * STATS_WINDOW_DAYS (14) is what this route CHOOSES TO READ, and it is
       * new on 2026-08-17. Both ship in the response so dashboard.html labels
       * every figure from the window that actually produced it.
       *
       * WHY A SECOND WINDOW EXISTS. Measured in local SQLite against the real
       * events DDL, at 250k / 1M / 4M / 12M rows, best of three per statement:
       *
       *     rows        testers    activeByDay   byName    whole route
       *     250,000      196 ms       40 ms       57 ms       460 ms
       *   1,000,000      880 ms      168 ms      213 ms      1,962 ms
       *   4,000,000    5,922 ms    1,450 ms    1,574 ms     12,357 ms
       *  12,000,000   33,883 ms    6,111 ms    5,285 ms     56,995 ms
       *
       * The tester leaderboard is superlinear (roughly N^1.3: it groups the
       * whole table by device and does a row lookup per row for `name`, which
       * stops fitting in cache) and it crosses D1's 30 SECOND STATEMENT LIMIT
       * at about 12M rows. 12M rows is 2,600 daily devices on a 60 day window,
       * not the 10,000 the retention arithmetic was sized for. The dashboard
       * breaks at a quarter of the scale the storage cap does.
       *
       * WHAT CHANGED, AND WHICH FIGURES CHANGED MEANING WITH IT. A "total" that
       * quietly becomes a window is a reporting lie, and this route has already
       * had to correct one of those, so each of these is named:
       *
       *   MOVED OFF events ENTIRELY, onto `devices`, which the pruner never
       *   touches and whose ON CONFLICT deliberately does not overwrite
       *   first_seen. The previous comment here signposted exactly this fix.
       *     totalDevices  WAS distinct devices seen in the last 60 days.
       *                   NOW devices ever seen. A bigger, true, all-time number.
       *     newByDay      WAS MIN(day) over surviving rows, so a long-standing
       *                   tester whose first day had been pruned reappeared as
       *                   new. NOW devices.first_seen. It stops lying.
       *     returnRate    Same shape of error, same fix, off first_seen /
       *                   last_seen. It stops lying.
       *     testers.first / .last   WAS first and last SURVIVING day. NOW the
       *                   device's real first and last seen, all time.
       *   These four are corrections, not narrowings, and all four are now O(devices)
       *   instead of O(events): 752 ms to 0.1 ms for totalDevices at 12M rows.
       *
       *   NARROWED from 60 days to STATS_WINDOW_DAYS, which IS a meaning change
       *   and the reason statsWindowDays ships in the response:
       *     totalEvents, byName, screenTime, featureOpens, featureTime,
       *     playMinutes, sessions, avgSessionMin, and testers.events / .played.
       *   Every one of those was a 60 day figure yesterday and is a 14 day
       *   figure today. Comparing a number from this dashboard against one
       *   written down last week compares two different questions.
       *
       *   CORRECTED a second way: byName and testers now exclude the recovery
       *   rate limiter's own rows. Those live in this table by design, keyed by
       *   an IP HASH in the device column, and on a quiet run rl_ridcheck was
       *   the single most common "event name" while an IP hash held the top of
       *   the tester leaderboard with no label, no geo and no first-seen.
       *   Measured at 12M rows: testers is unaffected (1,890 -> 1,924 ms, still
       *   a COVERING scan) and byName pays about 17% (5,721 -> 6,693 ms). Only
       *   those two; see the note at NOT_PRODUCT below for why dau, wau,
       *   activeByDay and totalEvents deliberately still count them.
       *
       *   UNCHANGED: dau (today), wau (7 days) and activeByDay (14 days) were
       *   already inside the new window. errors, errorsByBuild and vault still
       *   read the whole 60 days, because they are cheap (name-indexed, tiny
       *   result sets: 23 ms and 13 ms at 12M rows) and because a crash you saw
       *   six weeks ago is exactly the one you want to know has stopped.
       *   byCountry / byCity / reports / leads read tables the pruner never
       *   touches and are untouched here.
       *
       * The window alone was not enough, and the index swap in schema.sql is
       * the other half: idx_events_device_day became (device, name, day) so the
       * tester grouping is a COVERING index scan instead of 12M row lookups,
       * and idx_events_day became (day, device) so the day-ranged counts and
       * COUNT(DISTINCT device) never leave the index. Both are strict prefix
       * supersets of what they replace. Measured together on the same 12M table
       * with the new SQL: testers 33,883 -> 1,890 ms, activeByDay 6,111 -> 348,
       * totalEvents 4,894 -> 174, dau 461 -> 13, whole route 56,995 -> 14,357.
       * A third swap (idx_events_name -> (name, day)) was tried and REJECTED on
       * the measurement: it made byName worse (5,721 -> 9,001 ms) and pings
       * worse (1,580 -> 3,301), because the wider entries cost more to scan
       * than the day bound saves.
       *
       * WHAT IS STILL THE NEXT WALL. byName scans idx_events_name whole
       * whatever window is asked for, so it scales with the TABLE, not the
       * window: 6,693 ms at 12M rows extrapolates to 30 s at about 54M, which
       * is roughly 11,700 daily devices on a 60 day retention window. That is
       * past the 10,000 target rather than a quarter of it, but it is the
       * figure to watch, and the fix for it when it comes is a rollup table,
       * not another index. Widening idx_events_name was already tried and is
       * measured above to make it worse.
       *
       * AND FINALLY, THE HONEST CAVEAT ON ALL OF THE ABOVE. Every number here
       * was measured in local SQLite on the real DDL, which is the right way to
       * compare plans and the wrong way to predict absolute latency on D1: a
       * deployed statement also pays network time, and it runs on Cloudflare's
       * hardware rather than this one. Treat the RATIOS as the finding (20x on
       * activeByDay, 6x on testers, 4x on the whole route) and the milliseconds
       * as the shape of the curve, not as a promise. */
      if (path === '/stats' && request.method === 'GET') {
        const token = url.searchParams.get('token') || request.headers.get('x-bh-admin') || '';
        if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ error: 'unauthorized' }, 401);
        const today = new Date().toISOString().slice(0, 10);
        const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
        const q = async (sql, ...b) => (await env.DB.prepare(sql).bind(...b).first());
        const all = async (sql, ...b) => ((await env.DB.prepare(sql).bind(...b).all()).results || []);
        // Exclude the developer's own device(s) so one heavy in-house tester
        // (Tom = "Wretched Goblin") doesn't skew the numbers. Reversible: edit
        // EX_IDS to re-include or add devices. IDs are sanitised then inlined.
        const EX_IDS = ['fb31564c-22cc-49e8-836b-2da8fbf8531f'];
        const inList = EX_IDS.map(id => `'${String(id).replace(/[^a-f0-9-]/gi, '')}'`).join(',') || "''";
        const nin = col => `${col} NOT IN (${inList})`;
        /* RATE-LIMIT ROWS ARE NOT PRODUCT EVENTS, and they are in this table by
           design: rateLimitRecovery stores its per-IP counters here, keyed by an
           IP HASH in the `device` column. The retention note already called out
           that they pollute the dashboard, and they do: on a quiet local run
           rl_ridcheck was the single most common "event name" and an IP hash sat
           at the top of the tester leaderboard with no label, no geo and no
           first-seen, because it has no `devices` row to join to.
           Excluded here from the two figures where it is FREE to exclude them.
           `testers` already reads e.name out of idx_events_device_name_day, and
           byName is grouping on name, so neither plan changes.
           NOT excluded from dau / wau / activeByDay / totalEvents, deliberately.
           Those are served index-only by idx_events_day_device (day, device),
           which does not carry `name`; adding a name predicate would force a row
           lookup per event and hand back the whole 20x this fix just bought
           (activeByDay 348 ms would go back towards 6,111 ms at 12M rows). So
           those four still count an IP hash as a device, for at most the 24
           hours the rate-limit override keeps the rows. The real fix is for the
           limiter to stop borrowing this table, which is a bigger change than
           this one and belongs with whoever owns that route. */
        const NOT_PRODUCT = Object.keys(EVENT_RETENTION_OVERRIDE_DAYS);
        const rlHoles = NOT_PRODUCT.map(() => '?').join(',');
        const noRl = col => `${col} NOT IN (${rlHoles})`;
        // The reporting window. `day` is a YYYY-MM-DD string derived from the
        // same ts the row carries, so comparing the strings is both correct and
        // the only version of this the (day, device) index can drive.
        const statsFrom = new Date(Date.now() - STATS_WINDOW_DAYS * 864e5).toISOString().slice(0, 10);
        // ALL TIME and true, off `devices` rather than `events`: the pruner never
        // touches that table and its upsert never overwrites first_seen.
        const totalDevices = (await q(`SELECT COUNT(*) n FROM devices WHERE ${nin('device')}`)).n;
        const dau = (await q(`SELECT COUNT(DISTINCT device) n FROM events WHERE day = ? AND ${nin('device')}`, today)).n;
        const wau = (await q(`SELECT COUNT(DISTINCT device) n FROM events WHERE day >= ? AND ${nin('device')}`, weekAgo)).n;
        const totalEvents = (await q(`SELECT COUNT(*) n FROM events WHERE day >= ? AND ${nin('device')}`, statsFrom)).n;
        const byName = await all(`SELECT name, COUNT(*) n FROM events WHERE day >= ? AND ${noRl('name')} AND ${nin('device')} GROUP BY name ORDER BY n DESC LIMIT 30`, statsFrom, ...NOT_PRODUCT);
        const activeByDay = await all(`SELECT day, COUNT(DISTINCT device) n FROM events WHERE day >= ? AND ${nin('device')} GROUP BY day ORDER BY day`, statsFrom);
        // first_seen is ms epoch; date(x/1000,'unixepoch') is the same UTC day
        // string the events rows carry, so this chart keeps its x axis.
        const newByDay = await all(`SELECT day, COUNT(*) n FROM (SELECT date(first_seen/1000,'unixepoch') day FROM devices WHERE ${nin('device')} AND first_seen IS NOT NULL) GROUP BY day ORDER BY day DESC LIMIT 14`);
        // screen-dwell "heatmap": total minutes testers spent on each screen
        const screenTime = await all(`SELECT json_extract(props,'$.s') s, ROUND(SUM(json_extract(props,'$.ms'))/60000.0,1) min, COUNT(*) n FROM events WHERE name='screen_time' AND day >= ? AND props IS NOT NULL AND ${nin('device')} GROUP BY s ORDER BY SUM(json_extract(props,'$.ms')) DESC`, statsFrom);
        // feature usage: how often each feature-sheet was opened + total minutes in it
        const featureOpens = await all(`SELECT json_extract(props,'$.f') f, COUNT(*) n FROM events WHERE name='feat_open' AND day >= ? AND props IS NOT NULL AND ${nin('device')} GROUP BY f ORDER BY n DESC LIMIT 40`, statsFrom);
        const featureTime = await all(`SELECT json_extract(props,'$.f') f, ROUND(SUM(json_extract(props,'$.ms'))/60000.0,1) min FROM events WHERE name='feat_time' AND day >= ? AND props IS NOT NULL AND ${nin('device')} GROUP BY f ORDER BY SUM(json_extract(props,'$.ms')) DESC LIMIT 40`, statsFrom);
        // play time: one ping ≈ 45s of active play; sessions = session_start count
        const pings = (await q(`SELECT COUNT(*) n FROM events WHERE name='session_ping' AND day >= ? AND ${nin('device')}`, statsFrom)).n || 0;
        const sessions = (await q(`SELECT COUNT(*) n FROM events WHERE name='session_start' AND day >= ? AND ${nin('device')}`, statsFrom)).n || 0;
        const playMinutes = Math.round(pings * 45 / 60);
        const avgSessionMin = sessions ? Math.round((pings * 45 / sessions / 60) * 10) / 10 : 0;
        // return rate: share of testers who came back on a later day than their
        // first. All time and true, for the same reason totalDevices is.
        const r = await q(`SELECT COUNT(*) total, SUM(CASE WHEN date(first_seen/1000,'unixepoch') <> date(last_seen/1000,'unixepoch') THEN 1 ELSE 0 END) returned FROM devices WHERE ${nin('device')} AND first_seen IS NOT NULL AND last_seen IS NOT NULL`);
        const returnRate = r && r.total ? Math.round((r.returned / r.total) * 100) : 0;
        /* Per-tester leaderboard (top 30 by activity in the window), with Crew
           name + coarse geo. `first` and `last` come off devices now, so they
           are the real first and last seen rather than the oldest and newest day
           that happens to have survived the prune. */
        const testers = await all(
          `SELECT e.device, COUNT(*) events,
                  SUM(CASE WHEN e.name IN ('food_log','pit_win','boss_win','mini_win','cook','hatch','quest_claim','friend_battle','buy_weapon','transmute') THEN 1 ELSE 0 END) played,
                  d.label, d.country, d.region, d.city,
                  date(d.first_seen/1000,'unixepoch') first, date(d.last_seen/1000,'unixepoch') last
           FROM events e LEFT JOIN devices d ON d.device = e.device
           WHERE e.day >= ? AND ${noRl('e.name')} AND ${nin('e.device')}
           GROUP BY e.device ORDER BY events DESC LIMIT 30`, statsFrom, ...NOT_PRODUCT);
        const byCountry = await all(`SELECT COALESCE(country,'?') country, COUNT(*) n FROM devices WHERE ${nin('device')} GROUP BY country ORDER BY n DESC`);
        const byCity = await all(`SELECT COALESCE(city,'?') city, COALESCE(region,'') region, COALESCE(country,'') country, COUNT(*) n FROM devices WHERE ${nin('device')} GROUP BY city, region, country ORDER BY n DESC LIMIT 30`);
        // community map feedback: newest first (den nominations + unreachable reports + general feedback)
        const reports = await all(`SELECT r.kind, r.lat, r.lng, r.target, r.note, r.geo, r.ts, COALESCE(r.label, d.label) label FROM reports r LEFT JOIN devices d ON d.device = r.device WHERE ${nin('r.device')} ORDER BY r.ts DESC LIMIT 100`);
        // survey leads: newest first (name/email/feedback/most-wanted + opt-in flag)
        const leads = await all(`SELECT l.name, l.email, l.email_optin optin, l.feedback, l.most_wanted mostWanted, l.features, l.geo, l.ts, COALESCE(l.label, d.label) label FROM leads l LEFT JOIN devices d ON d.device = l.device WHERE ${nin('l.device')} ORDER BY l.ts DESC LIMIT 200`);
        /* CRASHES. Deliberately NOT filtered by nin(): the developer-device
           exclusion exists so one heavy tester cannot skew usage counts, but a
           crash is a crash and hiding Tom's would hide the ones we hear about
           first. Grouped by message so a crash loop reads as one row with a
           count, newest-affected first, with the device spread so "one unlucky
           phone" is distinguishable from "everybody". */
        const errors = await all(
          `SELECT json_extract(props,'$.m') msg, COUNT(*) n, COUNT(DISTINCT device) devices,
                  MAX(app_v) build, MAX(json_extract(props,'$.k')) kind,
                  MAX(json_extract(props,'$.src')) src, MAX(json_extract(props,'$.s')) screen,
                  MAX(ts) lastTs
           FROM events WHERE name='err' GROUP BY msg ORDER BY MAX(ts) DESC LIMIT 40`);
        const errorsByBuild = await all(
          `SELECT app_v build, COUNT(*) n, COUNT(DISTINCT device) devices
           FROM events WHERE name='err' GROUP BY app_v ORDER BY app_v DESC LIMIT 10`);
        /* VAULT. Two events with opposite meanings. A backfill SPIKE is expected
           once, when the native build carrying the BhVault registration reaches
           existing iOS players. A recover TRICKLE afterwards is the net catching
           real reinstalls, which is the only proof the feature works that does not
           require anyone to delete their own app. Backfills with zero recovers
           after a few weeks would itself be the finding. */
        const vault = await all(
          `SELECT name, COUNT(*) n, COUNT(DISTINCT device) devices, MAX(app_v) build,
                  MIN(day) firstDay, MAX(day) lastDay
           FROM events WHERE name IN ('vault_backfill','vault_recover') GROUP BY name`);
        /* BOTH windows travel with the numbers, so the dashboard cannot label a
           figure with a window it was not computed over. windowDays is what the
           events table still HOLDS; statsWindowDays is what this route READ.
           They are different questions and after 2026-08-17 they are different
           numbers, which is exactly why neither can be typed into the HTML. */
        return json({ windowDays: EVENT_RETENTION_DAYS, statsWindowDays: STATS_WINDOW_DAYS, totalDevices, dau, wau, totalEvents, byName, activeByDay, newByDay, screenTime, featureOpens, featureTime, playMinutes, sessions, avgSessionMin, returnRate, testers, byCountry, byCity, reports, leads, errors, errorsByBuild, vault, generatedAt: Date.now() });
      }

      /* Admin: hand a specific player coins through the normal grants channel, so a
         mis-tap or a bug can be made good without touching their device. Gated on
         ADMIN_TOKEN, the same secret the dashboard uses. Deliberately narrow:
         coins only, a required note so the player is told WHY, an explicit key so a
         repeated call cannot pay twice, and a cap so a fat finger here cannot mint a
         fortune. It cannot take anything away. */
      if (path === '/admin/grant' && request.method === 'POST') {
        const token = request.headers.get('x-admin-token') || '';
        if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ error: 'unauthorized' }, 401);
        const b = await request.json().catch(() => ({}));
        const coins = Math.floor(Number(b.coins) || 0);
        if (!b.playerId || !b.key || !b.note) return json({ error: 'playerId, key and note are required' }, 400);
        if (!(coins > 0) || coins > 20000) return json({ error: 'coins must be 1..20000' }, 400);
        const who = await env.DB.prepare('SELECT id, name, handle FROM players WHERE id = ?').bind(String(b.playerId)).first();
        if (!who) return json({ error: 'no such player' }, 404);
        const r = await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
          .bind(who.id, String(b.key), 'social', JSON.stringify({ coins, note: String(b.note).slice(0, 160) }), Date.now()).run();
        return json({ ok: true, to: who.name || who.handle, coins, inserted: !!(r.meta?.changes) });
      }

      // DEV-ONLY helpers for tests (env.DEV="1"; never set in production).
      if (env.DEV === '1' && path === '/dev/grant' && request.method === 'POST') {
        const b = await request.json();
        await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
          .bind(b.playerId, b.key, b.type || 'social', JSON.stringify(b.payload || {}), Date.now()).run();
        return json({ ok: true });
      }
      // Backdate a spire's timers so a test can simulate "an hour later" or "eight
      // days later" without sleeping. DEV only, and it can only ever move a row's
      // OWN timestamps: it grants nothing and cannot change ownership.
      if (env.DEV === '1' && path === '/dev/spire-warp' && request.method === 'POST') {
        const b = await request.json();
        const back = Number(b.backMs) || 0;
        // move EVERY timer on the row, so "three days passed" means the same thing
        // to the shield, to dormancy and to an open siege. Shifting only some of
        // them produced a tower that was somehow both stale and freshly besieged.
        await env.DB.prepare(
          `UPDATE spires SET claimed_at = claimed_at - ?, tended_at = tended_at - ?,
             siege_until = CASE WHEN siege_until IS NULL THEN NULL ELSE siege_until - ? END
           WHERE id = ?`)
          .bind(back, back, back, String(b.id || '')).run();
        const row = await env.DB.prepare('SELECT id, owner, claimed_at, tended_at, level, siege_until FROM spires WHERE id = ?').bind(String(b.id || '')).first();
        return json({ ok: true, row: row || null });
      }
      /* Run the retention prune on demand, with an injectable clock and
         injectable bounds. DEV only. This calls the SAME pruneEvents the cron
         calls, so a test drives the real thing rather than a copy of it, and
         the clock injection is what lets a test assert the 60 day boundary
         without waiting 60 days. It can only ever delete rows that are already
         past their window under the clock it is handed. */
      if (env.DEV === '1' && path === '/dev/prune' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const r = await pruneEvents(env, Number(b.nowMs) || Date.now(), {
          batch: b.batch, maxRows: b.maxRows, budgetMs: b.budgetMs,
        });
        return json({ ok: true, ...r });
      }
      /* Run the GRANTS prune on demand, DEV only. Deliberately a separate route
         from /dev/prune rather than a second field on it: the events retention
         suite asserts the shape /dev/prune returns, and a pruner for the table
         that holds people's gifts should not be able to break those assertions
         or hide behind them. Same injectable clock and bounds, plus an
         injectable retentionDays so a test can prove the 90 day line from both
         sides without waiting 90 days. */
      if (env.DEV === '1' && path === '/dev/prune-grants' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const r = await pruneGrants(env, Number(b.nowMs) || Date.now(), {
          batch: b.batch, maxRows: b.maxRows, budgetMs: b.budgetMs, retentionDays: b.retentionDays,
        });
        return json({ ok: true, ...r });
      }
      /* Read grants back exactly, DEV only. A retention test has to assert what
         SURVIVED as precisely as what went, and GET /grants cannot do it: it
         only ever shows one player their own rows ABOVE their cursor, which is
         the half of the table this pruner is least interested in. */
      if (env.DEV === '1' && path === '/dev/grants' && request.method === 'GET') {
        const where = [], bind = [];
        const player = url.searchParams.get('player');
        const keyPrefix = url.searchParams.get('keyPrefix');
        const type = url.searchParams.get('type');
        if (player) { where.push('player_id = ?'); bind.push(player); }
        if (type) { where.push('type = ?'); bind.push(type); }
        if (keyPrefix) { where.push('key >= ? AND key < ?'); bind.push(keyPrefix, keyPrefix + '￿'); }
        const sql = `SELECT id, player_id, key, type, ts FROM grants${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY id`;
        const rows = (await env.DB.prepare(sql).bind(...bind).all()).results || [];
        return json({ n: rows.length, rows });
      }
      /* Plant a grant at a chosen AGE, and read/set the acknowledgement cursor.
         DEV only. Both are the only way to build a fixture that is old enough
         to be prunable without a fake clock on the write side, and to prove
         that GET /grants really is what moves grants_ack. */
      if (env.DEV === '1' && path === '/dev/grant-aged' && request.method === 'POST') {
        const b = await request.json();
        await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
          .bind(b.playerId, b.key, b.type || 'social', JSON.stringify(b.payload || {}),
                Date.now() - (Number(b.ageMs) || 0)).run();
        const row = await env.DB.prepare('SELECT id, ts FROM grants WHERE player_id = ? AND key = ?')
          .bind(b.playerId, b.key).first();
        return json({ ok: true, ...(row || {}) });
      }
      if (env.DEV === '1' && path === '/dev/grants-ack' && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT grants_ack FROM players WHERE id = ?')
          .bind(url.searchParams.get('player')).first();
        return json({ ack: row ? row.grants_ack : null });
      }
      /* Count events matching a filter. DEV only, read only. A retention test
         has to assert what SURVIVED every bit as precisely as what went, and
         /stats only exposes coarse aggregates over the whole table. */
      if (env.DEV === '1' && path === '/dev/events-count' && request.method === 'GET') {
        const where = [], bind = [];
        const eName = url.searchParams.get('name');
        const eDevice = url.searchParams.get('device');
        const minTs = url.searchParams.get('minTs');
        const maxTs = url.searchParams.get('maxTs');
        if (eName) { where.push('name = ?'); bind.push(eName); }
        if (eDevice) { where.push('device = ?'); bind.push(eDevice); }
        if (minTs) { where.push('ts >= ?'); bind.push(Number(minTs)); }
        if (maxTs) { where.push('ts < ?'); bind.push(Number(maxTs)); }
        const row = await env.DB.prepare(
          `SELECT COUNT(*) n FROM events${where.length ? ' WHERE ' + where.join(' AND ') : ''}`).bind(...bind).first();
        return json({ n: Number((row && row.n) || 0) });
      }
      if (env.DEV === '1' && path === '/dev/player' && request.method === 'GET') {
        const row = await env.DB.prepare('SELECT id, handle, friend_code, profile, app_v FROM players WHERE id = ?')
          .bind(url.searchParams.get('id')).first();
        return json(row || {});
      }

      return json({ error: 'not found' }, 404);
    } catch (e) {
      console.error('handler error', e && e.stack || e);
      return json({ error: 'server error', detail: String(e).slice(0, 200) }, 500);
    }
  },
};
