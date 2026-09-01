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
const json = (obj, status = 200, extraHeaders = null) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS, ...(extraHeaders || {}) } });

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

/* ---------------- the daily backup slot ----------------
   Tom, 2026-08-25: "i don't want a corrupted sync to destroy an account."
   He asked for 2 or 3 revisions. That is the wrong axis and it would not have
   worked: js/social.js pushes every BACKUP_THROTTLE_MS (10 minutes), so three
   revisions span thirty minutes, and a corruption that syncs three times inside
   half an hour overwrites every one of them while the player is asleep. What
   saves an account is not how MANY saves are kept, it is how OLD the oldest one
   is. So there is one archive slot, and the rule is about time.

   TWO PROPERTIES, AND BOTH LIVE IN THE STATEMENT BELOW.

   1. It archives `backups.blob`, the save being REPLACED, not `excluded.blob`,
      the one arriving. So the first corrupt push can never be the push that puts
      corruption into the archive: what it archives is the last good save.
   2. It archives nothing unless the stored archive is already 24h old, so the
      corrupt pushes that follow cannot reach the slot either, for a day.

   WHAT THAT ACTUALLY GUARANTEES, stated plainly because the obvious claim
   ("always a save from yesterday") is not true of any one-slot scheme. The
   archive holds a save between 0 and 24h old. A corruption beginning at T
   therefore destroys it at some point in [T, T+24h]: about 12 hours on average,
   a full day at best, one throttle interval at worst (corruption arriving just
   before a rollover, where push 1 promotes the last good save and push 2 ten
   minutes later promotes push 1's). That is a bounded window in which somebody
   can notice, not a guaranteed-good save, and a hard 24h floor needs a SECOND
   archive slot at 3x storage rather than 2x. Not built: Tom chose the plain
   daily slot, and this is the number to revisit if the floor ever matters.

   THE CONDITION COMPARES AGAINST excluded.updated_at, which is the same `now`
   the row is being stamped with. That is not a trick for its own sake: it keeps
   the whole upsert at the original five bound parameters instead of repeating
   `now` once per CASE.

   daily_at IS WHEN THE COPY WAS SET ASIDE, not the age of the save inside it,
   and that distinction is the difference between this working and not. It was
   the save's own updated_at first, and the test below it went red: for a player
   who opens the app once a day, the save being archived is ALWAYS about 24h old,
   so every push promoted, the archive tracked the live save ten minutes behind,
   and the whole feature was inert for exactly the light user it protects least
   otherwise. Measuring from the last PROMOTION makes the interval 24h no matter
   what the push cadence is. The saved-at semantics were not worth a fourth
   column for a reader that does not exist yet: "set aside on the 24th" is true,
   and "you lose everything since then" is the conservative form of the only
   question a restore screen has to answer. */
const BACKUP_DAILY_MS = 24 * 60 * 60 * 1000;
const PROMOTE_DAILY = `backups.daily_at IS NULL OR excluded.updated_at - backups.daily_at >= ${BACKUP_DAILY_MS}`;
const UPSERT_BACKUP =
  `INSERT INTO backups (player_id, blob, app_v, size, updated_at) VALUES (?,?,?,?,?)
   ON CONFLICT(player_id) DO UPDATE SET
     daily_blob = CASE WHEN ${PROMOTE_DAILY} THEN backups.blob       ELSE backups.daily_blob END,
     daily_size = CASE WHEN ${PROMOTE_DAILY} THEN backups.size       ELSE backups.daily_size END,
     daily_at   = CASE WHEN ${PROMOTE_DAILY} THEN excluded.updated_at ELSE backups.daily_at  END,
     blob=excluded.blob, app_v=excluded.app_v, size=excluded.size, updated_at=excluded.updated_at`;
/* The pre-migration statement, kept verbatim. Only reachable from the "no such
   column" fallback in PUT /backup; see the note there. */
const UPSERT_BACKUP_NO_DAILY =
  'INSERT INTO backups (player_id, blob, app_v, size, updated_at) VALUES (?,?,?,?,?) ' +
  'ON CONFLICT(player_id) DO UPDATE SET blob=excluded.blob, app_v=excluded.app_v, size=excluded.size, updated_at=excluded.updated_at';

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

/* A per-isolate fallback secret, for the keyed hashes below when nothing is
   provisioned (local dev). LAZY, not a module-level const: the Workers runtime
   forbids generating random values in global scope, so a `crypto.randomUUID()`
   at the top of this file fails the whole Worker at startup rather than at the
   line that wanted it. Never a security claim -- it only means a dev box gets
   keyed values rather than silently unkeyed ones. */
let ephemeralSecret = null;
function fallbackSecret() {
  if (!ephemeralSecret) ephemeralSecret = crypto.randomUUID();
  return ephemeralSecret;
}

/* ---------------- add tokens ----------------
   WHY THESE EXIST. /leaderboard used to publish every top-100 player's
   friend_code so the board's "+ Add" button had something to send, and that was
   documented as deliberate on the grounds that codes are share-keys rather than
   secrets. It was not safe, because a friend code is ALSO the lookup handle for
   GET /recovery/<code>, which is unsigned by necessity and returns {wrapped,
   salt, iters}: the AES-GCM-wrapped identity bundle. So one signed /leaderboard
   call harvested 100 codes, and 100 wrapped bundles could then be pulled and
   attacked offline forever. Cracking one yields the ECDSA signing key AND the
   AES backup key, which is full account takeover plus decryption of the E2E
   backup. The PBKDF2 work factor (1,000,000 iterations, js/social.js) is
   genuinely strong and is not the defect. The free availability of the
   ciphertext is.

   An add token replaces the code on the board. It is:
   - OPAQUE: it carries no share-key, and cannot be typed into the friend-code
     box or looked up anywhere else.
   - BEARER-SAFE: the only thing it authorises is a friend REQUEST, which the
     other player still has to accept.
   - EXPIRING: ADD_TOKEN_TTL_MS, so a scraped board goes stale instead of
     becoming a permanent directory.
   - STATELESS: an HMAC over (playerId, expiry), so no table and no cleanup.

   The secret: ADD_TOKEN_SECRET if set, else ADMIN_TOKEN (already a deployed
   secret, so an un-provisioned deploy still issues unforgeable tokens rather
   than silently issuing forgeable ones), else a per-isolate random value so
   local dev works and nothing weaker ever reaches production by default. */
const ADD_TOKEN_TTL_MS = 24 * 3600000;

function addTokenSecret(env) {
  return env.ADD_TOKEN_SECRET || env.ADMIN_TOKEN || fallbackSecret();
}
async function addTokenMac(env, playerId, exp) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(addTokenSecret(env)),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hexOf(await crypto.subtle.sign('HMAC', key, enc.encode(`bh-add:${playerId}|${exp}`)), 16);
}
async function makeAddToken(env, playerId, nowMs) {
  const exp = nowMs + ADD_TOKEN_TTL_MS;
  return `${exp.toString(36)}.${await addTokenMac(env, playerId, exp)}.${playerId}`;
}
/** Length-safe, value-independent comparison. The tag is an HMAC so an early
 *  return would leak a byte at a time to a patient caller. */
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
/** playerId, or null when the token is malformed, expired or forged. */
async function readAddToken(env, token, nowMs) {
  if (typeof token !== 'string') return null;
  const dot1 = token.indexOf('.');
  const dot2 = token.indexOf('.', dot1 + 1);
  if (dot1 <= 0 || dot2 <= dot1 + 1) return null;
  const exp = parseInt(token.slice(0, dot1), 36);
  const mac = token.slice(dot1 + 1, dot2);
  const playerId = token.slice(dot2 + 1);
  if (!Number.isFinite(exp) || !playerId) return null;
  if (exp <= nowMs) return null;
  // bound the horizon too, so a leaked secret cannot mint a token good forever
  if (exp > nowMs + ADD_TOKEN_TTL_MS) return null;
  return sameSecret(mac, await addTokenMac(env, playerId, exp)) ? playerId : null;
}

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

/* ---------------- rate limiting ----------------

   THE BUG THIS REPLACES, because the shape of it is the reason for every choice
   below. There was one limiter in this file and it counted its budget by
   querying `events` -- the table the UNAUTHENTICATED /events ingest writes to --
   keyed on SHA-256('bh-rl:' + ip) truncated to 8 bytes. Every ingredient of that
   key is published in this source. So anyone could compute the bucket for any
   IP, POST ten forged rows to /events with that device id and name='rl_recovery',
   and lock that IP out of account recovery for ten minutes. About six requests
   an hour held it there indefinitely. Recovery is the ONLY path that saves an
   account whose keychain is gone, so a public ingest route could permanently
   deny the one thing standing between a player and a lost account.

   Two changes, and they are not alternatives. Both, because they fix different
   halves:

   1. ITS OWN TABLE (`rate_limits`). This is the fix. The limiter's counters are
      no longer reachable from any request body, on any route, because no route
      writes to that table except the limiter itself with a bucket it derived
      server-side. Keying alone would NOT have fixed it: a secret bucket still
      counted in a table an attacker can insert into is only obscure, and one
      leaked bucket (or one future route that logs into `events` with a guessable
      device id) brings the whole attack back. Separation removes the capability
      rather than hiding the target.

   2. A KEYED HMAC over the subject, when RL_SECRET is set. This is defence in
      depth and does a second, different job: it stops the bucket being a
      REVERSIBLE label. An unkeyed hash of an IP is a rainbow table away from the
      IP itself, and these rows sit in the same database the admin dashboard
      reads, so an unkeyed bucket is effectively an IP log for an app that
      deliberately never keeps one. Keyed, the counter is unlinkable, and a
      future route that did write here still could not aim at a chosen IP.
      Falls back to the unkeyed digest when no secret is provisioned: the private
      table already makes it correct, and a deploy without the secret must not
      lose rate limiting altogether.

   Fixed windows, one row per (bucket, name, window), upserted with RETURNING so
   a check is ONE D1 write instead of a read plus a row per hit. The counters
   must not become the write amplification they exist to prevent. The known cost
   of a fixed window is a 2x burst across a boundary; every limit below is set
   with that doubling already assumed. */

/* Every limiter, with the traffic it has to survive. `limit` is per `windowMs`
   per subject. */
const RATE_LIMITS = {
  // --- unsigned recovery lookups (budgets unchanged: these were already tuned) ---
  rl_recovery:    { limit: 10,  windowMs: 600000 },   // hands out CIPHERTEXT: tight on purpose
  rl_ridcheck:    { limit: 60,  windowMs: 600000 },   // only reveals whether a name is taken

  /* --- analytics ingest ---
     A normal client POSTs about 28 times a day (js/analytics.js flushes on a
     60s interval, but only when the queue is non-empty). The worst HONEST burst
     is a queue drain: QCAP is 300 events and each POST carries 50, so a client
     that was offline sends ceil(300/50) = 6 back-to-back POSTs on reconnect.
     120/hour per device is 100x the steady rate and 20x the worst burst.
     The IP bucket has to survive carrier CGNAT, where thousands of real players
     share one address, so it is deliberately loose and is a backstop against
     device-id rotation, not the primary control. */
  rl_events_dev:  { limit: 120, windowMs: 3600000 },
  rl_events_ip:   { limit: 600, windowMs: 3600000 },

  /* --- account creation ---
     A device registers ONCE, ever, and again on a reinstall. 10/hour per IP
     still covers a household or a demo table setting up several phones at once,
     and stops bulk minting of accounts (which is also bulk minting of rows in
     `players`, each holding a UNIQUE friend code out of a finite space). */
  rl_register_ip: { limit: 10,  windowMs: 3600000 },

  /* --- map feedback ---
     A player files a handful of den nominations in a session at most. */
  rl_report_dev:  { limit: 20,  windowMs: 3600000 },
  rl_report_ip:   { limit: 60,  windowMs: 3600000 },

  /* --- the survey ---
     Described in its own comment as a ONE-TIME in-app survey. 3/day per device
     leaves room to submit, notice a typo and resubmit. The IP bucket allows a
     household or a test session. This one also takes an email address, so it is
     the row a spammer would most want to flood. */
  rl_survey_dev:  { limit: 3,   windowMs: 86400000 },
  rl_survey_ip:   { limit: 10,  windowMs: 86400000 },

  /* --- the signed profile push ---
     Key-holder only, so this is not abuse control, it is a ceiling on how fast
     an account can walk its level up against the bounds in sanitizeSnapshot.
     js/app.js syncs on a 5-minute background throttle plus a ~1.2s debounced
     push whenever the player changes what friends see, so a busy dressing-room
     session is a few dozen an hour. 120/hour leaves that alone. */
  rl_profile:     { limit: 120, windowMs: 3600000 },
};

function hexOf(buf, bytes) {
  return [...new Uint8Array(buf)].slice(0, bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** The subject of a limit, hashed. `kind` is part of the input, so an IP bucket
 *  and a device bucket can never collide even when the two values are equal. */
async function rlBucket(env, kind, value) {
  const enc = new TextEncoder();
  const material = `${kind}:${value}`;
  const secret = env.RL_SECRET || fallbackSecret();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hexOf(await crypto.subtle.sign('HMAC', key, enc.encode(material)), 12);
}

const clientIp = request => request.headers.get('cf-connecting-ip') || 'unknown';

/** Returns a 429 Response when the subject is over budget, else null.
 *  Counts FIRST and refuses after, so a refused request still costs the caller
 *  budget: a limiter that stops counting once you are over is one you can
 *  outrun by simply continuing. */
async function rateLimit(env, name, kind, value) {
  const cfg = RATE_LIMITS[name];
  if (!cfg) throw new Error(`no rate limit named ${name}`);
  const bucket = await rlBucket(env, kind, value);
  const now = Date.now();
  const windowStart = Math.floor(now / cfg.windowMs) * cfg.windowMs;
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, name, window_start, hits, expires_at) VALUES (?,?,?,1,?)
     ON CONFLICT(bucket, name, window_start) DO UPDATE SET hits = hits + 1
     RETURNING hits`)
    .bind(bucket, name, windowStart, windowStart + cfg.windowMs * 2).first();
  const hits = Number(row?.hits || 1);
  // Sweep on the FIRST hit of a fresh window only: self-throttling (one delete
  // per bucket per window) and it keeps the table proportional to live traffic
  // rather than to all traffic ever.
  if (hits === 1) {
    await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now).run().catch(() => {});
  }
  if (hits <= cfg.limit) return null;
  const resetMs = windowStart + cfg.windowMs - now;
  return json({ error: 'too many requests, try again later', retryAfterMs: resetMs }, 429,
    { 'retry-after': String(Math.max(1, Math.ceil(resetMs / 1000))) });
}

/** The unsigned recovery routes, limited per IP. Kept as its own name because
 *  the point of a shared limiter here is that adding a recovery route can never
 *  accidentally ship an unthrottled way to harvest ciphertext. */
function rateLimitRecovery(request, env, name = 'rl_recovery') {
  return rateLimit(env, name, 'ip', clientIp(request));
}

/* ---------------- events retention ----------------
   Until now nothing on this worker deleted an events row, ever. The table only
   grew, and D1's 10 GB per-database limit is a hard stop: it is the one number
   here that cannot be bought past, so "we will pay for more" is not an answer.

   THE WINDOW: 30 days as of 2026-08-25, down from 60, and the reason is not
   only the arithmetic below. This is anonymous product telemetry on a
   consumer app heading for the App Store, and Apple's review guidelines expect
   data collection limited to what the app actually needs. What this database
   NEEDS is what the dashboard READS, and that is STATS_WINDOW_DAYS = 14. Every
   day kept past what anything queries is a day of retained behavioural data
   with no consumer, which is the definition of over-collection. 30 leaves the
   reporting window double the headroom it uses and drops the rest.

   WHAT IT COSTS: three figures on /stats have no day bound at all and so are
   the only things that lose history. `errors` and `errorsByBuild` (name='err')
   and `vault` (vault_backfill / vault_recover) go from a 60 day view to a 30
   day one. All three are debug surfaces read by one person, not gameplay and
   not anything a player can see; a crash older than a month on a build nobody
   is running is not a finding. Every other figure on that route is already
   bounded by STATS_WINDOW_DAYS (14), `today` or `weekAgo`, and the four
   all-time figures read `devices`, which the pruner never touches.

   THE ARITHMETIC, RE-MEASURED against production on 2026-08-25, because the
   numbers this note was originally sized on were both wrong in the same
   direction. Same method as before (build the real events DDL in local SQLite
   from production's own column-length histogram, read the page_count delta):

     bytes per row     256   (not the 209 the schema note assumes; 240 after a
                              VACUUM, and 249 cross-checked top-down against
                              D1's own reported database_size for the live DB)
     events per active device-day
                       228 MEAN over the last 14 days of production
                           (118 median, but storage is a sum and a sum is the
                            mean; the distribution is heavily right-skewed,
                            p95 = 949)

   That is 58 KB per active device per day, so 10,000 DAU writes about 584 MB a
   day, four times the 143 MB this note used to claim. Then, against 10 GB:

     60 days x 584 MB = 35.0 GB    3.5x over the cap on events ALONE
     30 days x 584 MB = 17.5 GB

   Which is to say the honest reading of the corrected numbers is that 10,000
   DAU does not fit at any window worth having, and the constant here is a
   runway rather than a solution. Leaving a gigabyte of operational headroom
   (D1 does not auto-VACUUM, so freed pages are reused rather than returned),
   30 days holds to roughly 5,100 DAU where 60 held to roughly 2,600. On the
   more optimistic 132 events/device-day figure the same arithmetic gives 8,800
   and 4,400. Either way the halving is the point, and the ceiling is now a
   MEASURED quantity: /admin/prune reports the live row count and the pruner's
   own trace, so the day the curve bends is visible rather than inferred.

   When DAU passes that, this constant comes down again, or the events schema
   stops carrying three indexes per row. It is one line, and the pruner will eat
   the backlog over the following ticks on its own.

   RATE-LIMIT ROWS ARE NOT PRODUCT EVENTS, and they need the opposite treatment
   in both directions. rateLimitRecovery above stores its per-IP counters as
   rows in this same table, named rl_recovery / rl_ridcheck, and counts only the
   ones inside a 10 MINUTE window. So:
     1. Pruning must never remove a row the limiter is still counting. Delete
        one and the limiter quietly resets, which turns the unauthenticated
        ciphertext endpoints into an unthrottled way to harvest wrapped keys.
     2. They must not be kept for 30 days either. They are one row per attempt
        per IP, they carry no product meaning, and they pollute the dashboard:
        /stats counts DISTINCT device, and an IP hash is not a device.
   Hence their own window of 24 hours. That is 144 times the limiter's 10 minute
   horizon, so no counter it can still see is ever inside the deletable set, and
   the rows still leave 29 days earlier than everything else. */
const EVENT_RETENTION_DAYS = 30;
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
      DELETED, and this is the rule that took a product decision rather than an
      argument from the code: a value-bearing grant that was never acknowledged,
      once BOTH it and its recipient have gone quiet for GRANT_DORMANT_DAYS.
      Until 2026-08-25 this row was the one thing here with no ceiling at all,
      and the note in this place said so: a dormant account whose friends keep
      sending gifts accumulated rows no rule could touch, because the only safe
      signal was the one the client had not sent. Tom's decision was 180 days of
      the GIFT's age AND 180 days of the RECIPIENT's silence, and the second half
      is the whole rule, not an optimisation on the first.
      WHY AGE ALONE WOULD BE WRONG. An unacknowledged grant does not mean an
      absent player. It means the ack never landed, and there are three ordinary
      ways for that to happen to somebody who is playing every day: an old build
      that predates players.grants_ack entirely, a cloud restore rolling
      grantCursor backwards (see the paragraph above), and the ack write simply
      failing, which GET /grants tolerates by design. Deleting on age alone
      takes a real reward off an active player in all three. The recipient's own
      clock is what separates "nobody is coming back for this" from "the
      bookkeeping missed".
      WHY last_seen IS THE RIGHT SECOND CLOCK. It is written by PUT /profile,
      and js/social.js autoSync calls syncProfile IMMEDIATELY BEFORE pullGrants
      on the same 5 minute throttle. So every client that could acknowledge
      anything has already moved last_seen, on every build, whether or not it
      knows what an ack is, and whether or not there was a grant to read. It is
      therefore strictly more recent than any acknowledgement signal, which is
      the direction a delete rule needs to be wrong in. It is also NOT NULL and
      has been written since the first schema, so unlike grants_ack it needs no
      backfill: this rule is not reading a column that only started recording
      yesterday.
      A grant whose player row is GONE has last_seen NULL, `p.last_seen < ?` is
      then NULL rather than true, and the row is not deleted. That is the same
      fail-safe COALESCE(p.grants_ack, 0) buys on the rule above, and it is why
      neither half of this predicate gets a COALESCE that would invent a date.
      NEVER DELETED, still: a value-bearing unacknowledged grant for a player who
      is still around. There is no age at which that becomes safe. */
const GRANT_RETENTION_DAYS = 90;
/* THE DORMANCY WINDOW, applied to the gift's age AND to the recipient's
   last_seen, both of which must be past it. Must be >= GRANT_RETENTION_DAYS or
   the constant would be a lie: the outer age bound on the DELETE below is the
   shorter of the two, so a smaller number here would silently be clamped to it.
   schema-plan.test.mjs asserts the ordering. */
const GRANT_DORMANT_DAYS = 180;
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
  /* Never shorter than the age bound the outer predicate already applies: a
     dormancy window inside it could not delete anything the first rule had not
     already reached, so the constant would be reporting a window it does not
     enforce. */
  const dormantDays = Math.max(days, GRANT_DORMANT_DAYS);
  const dormantTs = now - dormantDays * 86400000;
  let total = 0, stopped = null;

  /* ONE statement, not three passes, because every rule shares the same outer
     age bound and the same never-delete carve-out, and one predicate means one
     walk of idx_grants_ts instead of three. The index is what keeps this honest:
     without it the planner falls back to a MULTI-INDEX OR over idx_grants_key
     plus a temp b-tree for the ORDER BY, and a 1,000 row batch measured 382 ms
     against 400,000 rows instead of 13.6 ms. ORDER BY g.ts is not cosmetic
     either: it is what makes a batch stop at the oldest rows and return, rather
     than walking the whole table to find its LIMIT.
     The dormancy arm is the third OR and it needs BOTH of its own bounds. Drop
     `p.last_seen < ?` and this becomes a delete-on-age rule that eats live
     players' rewards; the KEEP test for an old gift held by an active account is
     what says so. */
  for (;;) {
    if (total >= maxRows) { stopped = 'maxRows'; break; }
    if (Date.now() - started >= budgetMs) { stopped = 'budgetMs'; break; }
    const n = Math.min(batch, maxRows - total);
    const r = await env.DB.prepare(
      `DELETE FROM grants WHERE id IN (
         SELECT g.id FROM grants g LEFT JOIN players p ON p.id = g.player_id
          WHERE g.ts < ?
            AND (g.key < ? OR g.key >= ?)
            AND (g.id <= COALESCE(p.grants_ack, 0) OR g.type = 'cheer'
                 OR (g.ts < ? AND p.last_seen < ?))
          ORDER BY g.ts LIMIT ?)`)
      .bind(cutoffTs, STEPWEEK_LO, STEPWEEK_HI, dormantTs, dormantTs, n).run();
    const c = Number(r?.meta?.changes || 0);
    total += c;
    if (c < n) break;   // caught up
  }

  return {
    total,
    retentionDays: days,
    cutoffTs,
    dormantDays,
    dormantTs,
    stopped,
    more: stopped !== null,
    ms: Date.now() - started,
  };
}

/* ---------------- what the pruner did ----------------
   THE CRON WENT LIVE ON 2026-08-24 AND NOBODY COULD PROVE A TICK HAD FIRED.
   scheduled() console.log'd its result and nothing else. `wrangler tail` is a
   live stream that retains nothing, so three separate tail sessions produced
   zero occurrences of the words cron, scheduled or prune, and there was no
   other place to look. For a job whose only purpose is deleting rows from a
   live player database, "did it run last night, and what did it delete" is the
   question, and it had no answer at all once the terminal was closed.

   Two things fix that and they are not alternatives. wrangler.toml now carries
   [observability], so Workers Logs retains the console lines for a week and a
   failed invocation is visible in the dashboard. This table is the other half:
   it is queryable by a route, it survives longer than the log retention, and it
   is the only one of the two that can answer "how many rows, per rule, and did
   it hit a cap" without a human reading log text.

   KEPT DELIBERATELY DUMB. One INSERT and one DELETE per tick, no index, no
   read. It is trimmed to a fixed number of newest rows rather than to an age,
   because an age bound would still grow if the schedule got faster, and because
   `id <= max - keep` needs no clock and no date arithmetic.

   IT SWALLOWS ITS OWN FAILURE, which is the one thing in here that had to be
   argued rather than assumed. If the migration has not been applied the INSERT
   throws "no such table: prune_runs"; letting that propagate would turn a
   MISSING TRACE into a FAILED PRUNE, so the observability would be deleting the
   thing it exists to observe. The failure is not silent, it just is not fatal:
   it goes to console.error, GET /admin/prune reports status "no-table" and
   names the migration. schema-plan.test.mjs asserts this function still catches. */
const PRUNE_RUNS_KEEP = 2000;   // ~21 days at 96 ticks/day; 216 KB measured at the ceiling
/* How far GET /admin/prune will count the unprunable-grants tail before giving
   up and saying "or more". See the note at its query for the measurement. */
const DORMANT_COUNT_CAP = 100000;
/* D1's hard per-database ceiling, and the share of it GET /admin/prune projects
   the backups table against. 10 GB cannot be raised by paying for it; the
   fraction is a judgement about how much of one database a single table may
   have, and it travels in the response so nobody reads the projected player
   count without it. Backups is the one table with NO pruning rule at all
   (Tom, 2026-08-25: prune nothing, watch the average), so the projection IS the
   policy: it is the thing that has to move before anything else does. */
const D1_LIMIT_BYTES = 10 * 1024 * 1024 * 1024;
const BACKUPS_BUDGET_FRACTION = 0.5;

async function recordPruneRun(env, row) {
  try {
    await env.DB.prepare(
      `INSERT INTO prune_runs (ts, ms, cron, ok, ev, ev_stop, ev_by, gr, gr_stop, err)
       VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(row.ts, row.ms, row.cron, row.ok ? 1 : 0,
            row.ev, row.evStop, row.evBy, row.gr, row.grStop, row.err)
      .run();
    /* The self-prune. One statement, and it is a no-op until the table is full:
       `id <= max - 2000` selects nothing while fewer than 2,000 rows exist.
       AUTOINCREMENT ids never repeat, so subtracting from MAX(id) is a row
       count only while no row is deleted out of the middle, and nothing else
       ever deletes from this table. */
    await env.DB.prepare(
      'DELETE FROM prune_runs WHERE id <= (SELECT MAX(id) FROM prune_runs) - ?')
      .bind(PRUNE_RUNS_KEEP).run();
  } catch (e) {
    console.error('prune trace failed (the prune itself is unaffected)', (e && e.message) || e);
  }
}

/* ---------------- signature auth ----------------

   ONE SIGNATURE, ONE EFFECT. Everything below used to check exactly two things:
   the signature, and that the timestamp was inside MAX_SKEW_MS. Neither of them
   says a request is NEW. A captured signed POST re-sent byte for byte verified
   again and landed a fresh effect every time, for as long as that five-minute
   window stayed open, and this was PROVEN against /cheer: one original plus two
   replays delivered three cheers to the recipient.

   The `ck` idempotency key closes it for a cheer sent by a client that mints
   one -- the replay carries the same ck, so the grant's UNIQUE (player_id, key)
   absorbs it -- but that is a per-route patch: it does nothing for an older
   client that sends no ck, nothing for a spire claim, and nothing for the next
   signed route somebody adds. So the guard lives HERE, once, in front of every
   signed write there will ever be.

   ECDSA signing is randomised, so two honest requests never share a signature,
   and a real retry re-signs with a fresh ts (js/social.js signedFetch mints
   both per call): nothing legitimate is ever refused by this. That is also why
   it is not a substitute for `ck` -- a retry is a DIFFERENT signature, which
   this cannot dedupe and the client's key can.

   `rate_limits` rather than a new table, because a nonce IS a limiter: a budget
   of one per subject, in a table nothing but the limiter writes, with an
   `expires_at` sweeper that already runs. The digest is UNKEYED, unlike
   rlBucket, on purpose: a signature is 512 bits with nothing to reverse it to,
   so there is no rainbow table to build, and the per-isolate fallback secret
   would give the same replay a different bucket on a different isolate, which
   is exactly how this guard would quietly stop catching anything. */
async function claimSignature(env, sig, tsNum) {
  const digest = hexOf(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sig)), 16);
  const r = await env.DB.prepare(
    "INSERT OR IGNORE INTO rate_limits (bucket, name, window_start, hits, expires_at) VALUES (?,'sig',?,1,?)")
    // Swept at twice the skew window, so the row always outlives the signature
    // it is remembering; the sweep itself is rateLimit()'s, on any rl_* route.
    .bind(digest, Math.floor(tsNum), Math.floor(tsNum) + MAX_SKEW_MS * 2).run();
  return !!(r.meta && r.meta.changes);
}

async function verifySigned(request, env, bodyText) {
  const playerId = request.headers.get('x-bh-player');
  const ts = request.headers.get('x-bh-ts');
  const sig = request.headers.get('x-bh-sig');
  if (!playerId || !ts || !sig) return { err: 'missing auth headers' };
  /* THE SKEW CHECK USED TO FAIL OPEN. It was
       if (Math.abs(Date.now() - Number(ts)) > MAX_SKEW_MS) ...
     and Number('abc') is NaN, so `NaN > 300000` is false and the request was
     NOT rejected. Any non-numeric x-bh-ts skipped the freshness bound entirely,
     which removed the five-minute replay window from a captured signed request
     for as long as the signature stayed valid, which is forever.
     Number.isFinite first: it rejects NaN, Infinity, '' (Number('') is 0, and an
     empty ts is caught by the header check above but not by the arithmetic) and
     anything else that is not a real instant. The comparison is only reached
     once the value is known to be a number. */
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { err: 'bad timestamp' };
  if (Math.abs(Date.now() - tsNum) > MAX_SKEW_MS) return { err: 'stale timestamp' };
  const row = await env.DB.prepare('SELECT pubkey FROM players WHERE id = ?').bind(playerId).first();
  if (!row) return { err: 'unknown player' };
  const url = new URL(request.url);
  const msg = `${request.method}\n${url.pathname}${url.search}\n${ts}\n${bodyText || ''}`;
  let ok = false;
  try {
    const key = await crypto.subtle.importKey('jwk', JSON.parse(row.pubkey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
    ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sigBytes, new TextEncoder().encode(msg));
  } catch {
    return { err: 'bad signature' };
  }
  if (!ok) return { err: 'bad signature' };
  /* Writes only. A replayed READ changes nothing, and making every /grants and
     /friends poll pay for a row would turn the guard into the write
     amplification it is here to prevent. The claim is OUTSIDE the try above so
     a database failure can never be laundered into 'bad signature'. */
  if (request.method !== 'GET' && !(await claimSignature(env, sig, tsNum))) {
    return { err: 'replayed request' };
  }
  return { playerId };
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

/* ================= SNAPSHOT BOUNDS =================================
   The race week, mirrored from js/app.js (raceWeekKey / RACE_EPOCH / RACE_DAYS).
   KEEP IN SYNC, exactly like ADJ/NOUN and RACE_RULES above.

   The client computes its week key in LOCAL time and the server computes it in
   UTC, so the two disagree for up to a day around a boundary. That skew is why
   validateWeek() accepts the previous and next key as well as the current one,
   and why each of the three gets a different rule rather than a blanket pass. */
const RACE_EPOCH = '2026-08-07';
const RACE_DAYS = 7;
const RACE_PERIOD_MS = RACE_DAYS * 86400000;
const dayKeyUTC = ms => new Date(ms).toISOString().slice(0, 10);
function raceWeekStartMs(atMs) {
  const epoch = Date.parse(RACE_EPOCH + 'T00:00:00Z');
  if (!(atMs >= epoch)) return epoch;            // before launch: everything is period one
  return epoch + Math.floor((atMs - epoch) / RACE_PERIOD_MS) * RACE_PERIOD_MS;
}
const raceWeekKey = atMs => dayKeyUTC(raceWeekStartMs(atMs));

/* ---- the level curve, mirrored from js/game.js (xpForLevel / levelFor) ----
   KEEP IN SYNC. Only the level number is needed here, so levelForXp returns the
   integer rather than the whole descriptor the client builds. */
function xpForLevel(L) {
  if (L <= 1) return 0;
  return Math.round((120 * Math.pow(L - 1, 1.55) + 80 * (L - 1)) / 10) * 10;
}
function levelForXp(xp) {
  let L = 1;
  while (L < 100000 && xpForLevel(L + 1) <= xp) L++;
  return L;
}

/* ---- what one day of play can pay, from the game's own award tables ----
   Every number below is a literal lifted from js/game.js, not a guess, so a
   change to the economy shows up here as a conflict rather than as a silent
   drift. Sources are named per line.

   These are the DAILY-IDEMPOTENT awards: each one is keyed by date in
   js/game.js, so the game itself will not pay them twice in a day however many
   times it is asked. */
const XP_HEALTH_DAY =
  10 +          // 'hk', the Apple Health sync itself           (js/game.js onHealthSync)
  3 * 15 +      // 'stepms', one per STEP_MILESTONES tier (3)   (js/game.js STEP_MILESTONES)
  15 +          // 'egg', the big-day Step Egg                  (js/game.js EGG_STEP_THRESHOLD)
  4 * 5 +       // 'stepx', one per STEP_OVER tier (4)          (js/game.js STEP_OVER)
  3 * 15 +      // 'actms', one per ACTIVE_MILESTONES tier (3)  (js/game.js ACTIVE_MILESTONES)
  15 +          // 'actcrate', workout of the day               (js/game.js ACTIVE_WORKOUT_KCAL)
  3 * 5 +       // 'actx', one per ACTIVE_OVER tier (3)         (js/game.js ACTIVE_OVER)
  3 * 15 +      // 'wk', WORKOUT_CAP rewarded sessions          (js/game.js WORKOUT_CAP = 3)
  20 +          // 'exring', the Apple Exercise ring            (js/game.js EXERCISE_RING_MIN)
  8 * 8 +       // 'cyc', CYCLE_KM_CAP / CYCLE_KM_STEP = 8 steps(js/game.js CYCLE_KM_CAP = 40, STEP = 5)
  3 * 10;       // 'wtype', one per discipline (3)              (js/game.js DISCIPLINE_REWARD)
const XP_DAY_CLOSE =
  50 +          // 'dayclose'   (js/app.js)
  25 +          // 'dayeffort'  (js/app.js)
  40 +          // 'protein'    (js/app.js)
  20 +          // 'meals'      (js/app.js)
  15 +          // 'firstlog'   (js/app.js)
  15;           // 'weigh'      (js/game.js onWeighIn)
const XP_STREAK_DAY = 100;   // 'streakms', at most one milestone a day (js/game.js)

/* The OPEN-ENDED sources are the honest part of this estimate. A Pit win pays
   10 XP on a key containing Date.now() (js/app.js) and a food log pays 10 on a
   per-entry key, so neither has a daily cap in the game at all. 100 such actions
   in one day is far past any real session (a Pit fight is a whole animation, and
   a hundred logged foods is not a day anyone has) and it is the only term here
   that is a judgement rather than a constant, so it is named as one. */
const XP_OPEN_ENDED_ACTIONS_DAY = 100;
const XP_OPEN_ENDED_DAY = XP_OPEN_ENDED_ACTIONS_DAY * 10;

/** The most XP a day of play can plausibly produce: 1,589. For scale, the
 *  heaviest real account on record was level 27, which is 20,800 XP on the curve
 *  above; spread over the two months that account existed that is about 350 XP a
 *  day, so this ceiling is roughly 4.5x the busiest genuine player. */
const DAILY_XP_CEILING = XP_HEALTH_DAY + XP_DAY_CLOSE + XP_STREAK_DAY + XP_OPEN_ENDED_DAY;

/** Every badge in the game, awarded once each, ever. BADGES in js/game.js has 29
 *  rows and evaluateBadges pays 25 XP per badge. This is also the hard clamp on
 *  the `badges` count itself: the leaderboard's secondary sort key cannot exceed
 *  the number of badges that exist. KEEP IN SYNC with BADGES in js/game.js. */
const MAX_BADGES = 29;
const XP_ALL_BADGES = MAX_BADGES * 25;

/* A first sync legitimately carries history the account row has never seen. Two
   real cases: a first Apple Health authorisation BACKFILLS past days, each worth
   up to XP_HEALTH_DAY, and a player who installed a pre-social build registers
   only when they update, so created_at is the day they came online rather than
   the day they started playing. 90 days of allowance covers both with room to
   spare: at DAILY_XP_CEILING that is 143,010 XP, which is level 94 on the curve,
   against a heaviest-real-account level of 27. */
const PRIOR_HISTORY_DAYS = 90;

/** The largest single jump the game itself can produce: the level
 *  DAILY_XP_CEILING reaches from a standing start, which is 5. Levels only get
 *  more expensive further up the curve, so 5 is the maximum anywhere, and any
 *  claim that moves further than this in a day did not come from playing. */
const BURST_LEVELS = levelForXp(DAILY_XP_CEILING);

/** Steps. The game's own top recognised tier is the last STEP_OVER entry at
 *  20,000 in a day (js/game.js STEP_OVER), past which it stops paying at all.
 *  Five times that is the ceiling here: 100,000 steps in a single day is roughly
 *  50 miles on foot, beyond any player and well past anything the game rewards,
 *  yet it leaves five times the game's own maximum as headroom so no real walker
 *  is ever clipped. This is the number that makes 200,000 steps in an hour
 *  impossible: a week's total may not exceed this per ELAPSED day of that week,
 *  so on the Monday of a race week the most anyone can claim is 100,000. */
const STEP_OVER_TOP = 20000;
const MAX_STEPS_PER_DAY = 5 * STEP_OVER_TOP;

/** The client caps its own gear list at 400 ids (js/app.js socialSnapshot,
 *  `[...gOwned].slice(0, 400)`). The leaderboard publishes json_array_length of
 *  it, so an unbounded array is an unbounded number on the board. */
const MAX_GEAR_IDS = 400;

const intOrNull = v => (typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Which race week a claimed key is, relative to the server's own clock.
 *  Returns 'current' | 'previous' | 'next' | null (null = not a real week start,
 *  or too far away to be clock skew). */
function classifyWeekKey(key, nowMs) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const t = Date.parse(key + 'T00:00:00Z');
  if (!Number.isFinite(t)) return null;
  const cur = raceWeekStartMs(nowMs);
  if (t === cur) return 'current';
  if (t === cur - RACE_PERIOD_MS) return 'previous';
  if (t === cur + RACE_PERIOD_MS) return 'next';
  return null;
}

/* THE FIX FOR THE UNVALIDATED CLIENT ASSERTION.
 *
 * /profile used to check three things: the body is under 24 KB, the signature is
 * valid, and body.snapshot is a non-null object. Then it JSON.stringify'd it
 * straight into players.profile. Everything downstream reads that as fact:
 * /leaderboard ranks on json_extract(profile,'$.level') and '$.badges', the step
 * race reads '$.weekSteps' / '$.weekKey' / '$.raceV', and the same blob is
 * copied into spires.defender for every tower the caller holds. So one signed
 * PUT of {level: 999999, badges: 999999} was rank 1 permanently, and setting
 * weekKey to last week with any weekSteps took a podium that pays 5,000 coins
 * plus a Golden Crate.
 *
 * WHY CLAMP AND NOT REJECT. A 400 here would take a player's whole snapshot
 * offline -- outfit, pet, gear, spire defender -- over one bad field, and the
 * likeliest cause of a bad field is our own bug, not an attacker. Clamping keeps
 * the account working and publishes only defensible numbers. `bounded` in the
 * response names every field that was pulled down, so a client (or a test) can
 * see it happened instead of guessing.
 *
 * WHAT THIS DOES NOT CLAIM. The trust model of this game is stated plainly
 * elsewhere in this file: the client wins its own fights. These bounds do not
 * make the snapshot trustworthy, they make it PLAUSIBLE, which is a different
 * and achievable thing. A fresh key can still assert a believable level once,
 * because the server has no prior observation of an account it has never seen.
 * What it can no longer do is assert an impossible one, walk up without the
 * elapsed time to justify it, or take a paying podium it did not walk for.
 */
function sanitizeSnapshot(rawSnap, row, nowMs) {
  const snap = { ...rawSnap };
  const bounded = [];

  /* ---- level ----
     Two independent ceilings, and the lower of the two wins.

     (a) PLAUSIBLE: the level the curve reaches from the most XP this account
         could ever have earned, which is DAILY_XP_CEILING for every day it has
         existed, plus PRIOR_HISTORY_DAYS of backfillable history, plus every
         badge in the game. Time-anchored, so it cannot be outrun by making more
         requests.
     (b) NO TELEPORTING: max_level plus BURST_LEVELS for the current day and for
         each day since max_level was last raised. This is what stops a long
         quiet account jumping in one PUT; it is measured against a value the
         SERVER stored, which is the whole reason max_level exists. */
  const ageDays = Math.max(0, (nowMs - (row.created_at || nowMs)) / 86400000);
  const plausibleCeiling = levelForXp(DAILY_XP_CEILING * (ageDays + PRIOR_HISTORY_DAYS) + XP_ALL_BADGES);
  const prevMax = intOrNull(row.max_level) || 0;
  let ceiling = plausibleCeiling;
  /* THE JUMP RULE NEEDS A PRIOR OBSERVATION THAT MEANS SOMETHING, and an
     account less than a day old has not got one. A real first day is not a
     sequence of small climbs: the player onboards at level 1, authorises Apple
     Health, and a BACKFILL imports months of history in one step (js/game.js
     onHealthSync pays every past day it is handed). Applying a
     five-levels-a-day ratchet to that pins an honest new player at level 6 and
     makes them climb back over the next half hour, with a wrong level on the
     board and a weaker spire defender the whole time.
     Skipping the rule for day one costs nothing: a day-old account is bounded
     by plausibleCeiling either way, and that is the same bound a brand new key
     would face on its very first PUT regardless. */
  if (prevMax > 0 && ageDays >= 1) {
    const sinceRaiseDays = Math.max(0, (nowMs - (row.max_level_at || row.created_at || nowMs)) / 86400000);
    ceiling = Math.min(ceiling, prevMax + BURST_LEVELS * (1 + Math.floor(sinceRaiseDays)));
  }
  const claimedLevel = intOrNull(snap.level);
  // a missing or non-numeric level is the client's own COALESCE(...,1) default,
  // not an attack: leave the field absent rather than inventing a number
  if (claimedLevel !== null) {
    const level = clamp(claimedLevel, 1, ceiling);
    if (level !== claimedLevel) bounded.push('level');
    snap.level = level;
  } else if (snap.level !== undefined) {
    delete snap.level;
    bounded.push('level');
  }

  /* ---- badges ----
     A count of a fixed list. There is no derivation to argue about: you cannot
     have earned more badges than the game defines. */
  const claimedBadges = intOrNull(snap.badges);
  if (claimedBadges !== null) {
    const badges = clamp(claimedBadges, 0, MAX_BADGES);
    if (badges !== claimedBadges) bounded.push('badges');
    snap.badges = badges;
  } else if (snap.badges !== undefined) {
    delete snap.badges;
    bounded.push('badges');
  }

  /* ---- gear ----
     Display-only (the board publishes its length), but unbounded length is an
     unbounded number, so hold it to the client's own cap. */
  if (Array.isArray(snap.gear) && snap.gear.length > MAX_GEAR_IDS) {
    snap.gear = snap.gear.slice(0, MAX_GEAR_IDS);
    bounded.push('gear');
  }

  /* ---- raceV ----
     The rules stamp. Ranking requires raceV >= RACE_RULES, so a forged high
     value is only a way of passing that gate; normalise it to the newest rules
     the server actually knows about. */
  const claimedRaceV = intOrNull(snap.raceV);
  if (claimedRaceV !== null) snap.raceV = clamp(claimedRaceV, 0, RACE_RULES);

  /* ---- the step race ----
     This is the one that pays money: STEP_RACE_PODIUM is 5,000 coins plus a
     Golden Crate plus 200 dust for first, settled lazily by whoever calls
     /steps/week first in a new week. Three rules, and each closes a different
     half of the same exploit.

     1. THE WEEK KEY MUST BE A WEEK. Not a real period start, or further away
        than one period, and the race fields are dropped entirely: an arbitrary
        key was how you claimed a week nobody could contest.
     2. A PAST WEEK IS FROZEN. The previous key is accepted only up to the total
        the server already recorded WHILE that week was current. That is what
        the client legitimately sends across a rollover boundary, and it means a
        fresh account cannot claim last week at all, because the server recorded
        nothing for it. This is the rule that closes the podium theft.
     3. A LIVE WEEK IS MONOTONE AND RATE-BOUNDED. Never below what was already
        accepted for the same key (steps do not un-walk), and never above
        MAX_STEPS_PER_DAY for each day of that week that has actually elapsed.
        The elapsed-day term IS the per-day delta ceiling: on the Monday of a
        race week the cap is 100,000, and it only reaches 700,000 once the whole
        week has been walked, so no hour can ever add 200,000. */
  const claimedKey = typeof snap.weekKey === 'string' ? snap.weekKey : null;
  const when = classifyWeekKey(claimedKey, nowMs);
  const storedKey = typeof row.week_key === 'string' ? row.week_key : null;
  const storedSteps = Math.max(0, intOrNull(row.week_steps) || 0);
  const claimedSteps = Math.max(0, intOrNull(snap.weekSteps) || 0);
  let acceptedKey = null, acceptedSteps = 0;

  if (!when) {
    if (snap.weekKey !== undefined || snap.weekSteps !== undefined) bounded.push('weekKey');
    delete snap.weekKey;
    delete snap.weekSteps;
  } else if (when === 'previous') {
    const frozen = storedKey === claimedKey ? storedSteps : 0;
    acceptedKey = claimedKey;
    acceptedSteps = Math.min(claimedSteps, frozen);
    if (acceptedSteps !== claimedSteps) bounded.push('weekSteps');
    snap.weekKey = acceptedKey;
    snap.weekSteps = acceptedSteps;
  } else {
    // 'current' or 'next'. 'next' is a phone whose local midnight has crossed
    // before the server's, so it is day one of a week and gets one day's budget.
    const weekStart = Date.parse(claimedKey + 'T00:00:00Z');
    const elapsedDays = clamp(Math.ceil((nowMs - weekStart) / 86400000), 1, RACE_DAYS);
    const floor = storedKey === claimedKey ? storedSteps : 0;
    const cap = MAX_STEPS_PER_DAY * elapsedDays;
    acceptedKey = claimedKey;
    acceptedSteps = clamp(claimedSteps, floor, Math.max(floor, cap));
    if (acceptedSteps !== claimedSteps) bounded.push('weekSteps');
    snap.weekKey = acceptedKey;
    snap.weekSteps = acceptedSteps;
  }

  const level = intOrNull(snap.level) || 0;
  const raisesMax = level > prevMax;
  return {
    snap,
    bounded,
    maxLevel: Math.max(prevMax, level),
    maxLevelAt: raisesMax ? nowMs : (row.max_level_at || null),
    weekKey: acceptedKey,
    weekSteps: acceptedSteps,
  };
}
/* =============== end snapshot bounds =============== */

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

/* The friendship edge, shared by /friends/request (by friend code) and
   /friends/add (by leaderboard add token). One body so the two handles cannot
   drift into different rules: reciprocation auto-accepts, and a repeat is a
   no-op rather than a second row.

   ONE upsert, because the three cases are one decision about one row and the
   row is the only thing that can arbitrate it.

   It used to be SELECT-then-INSERT, and the two friendliest players in the game
   broke it: when both press Add at the same moment, both read "no row", both
   INSERT, and the loser hits PRIMARY KEY (a, b) and falls out of the outer catch
   as a 500. Measured locally on 2026-08-17: [200, 500], with a
   "UNIQUE constraint failed: friendships.a, friendships.b" detail handed to the
   client. Worse than the 500 is what it left behind: the reciprocation rule that
   turns "they already asked me" into an accepted friendship never ran, so two
   people who both asked to be friends end up merely pending, each looking at an
   OUTGOING request and waiting for the other to accept something their client is
   not showing them.

   The upsert says all of it at once: insert pending if there is no row, promote
   to accepted if the existing row was requested by the OTHER player, and leave
   my own repeat alone. RETURNING is the row's own answer, so the status the
   caller is told is the status that is stored. */
/* A FLAGGED TEST ACCOUNT FORMS NO RELATIONSHIPS, in either direction, and the
   rule lives HERE because this is the only place a friendship row is ever
   written: /friends/request (by code) and /friends/add (by addToken) both land
   on it. Filtering only the code lookup would have left the token path open,
   and the token path is the live one: GET /leaderboard hands every caller an
   addToken for every row it returns, so a flagged account that reads the board
   could put a pending request in a real player's Crew. That request is exactly
   the clutter this whole change exists to stop, and it is also the gate on
   /gift and /cheer, both of which refuse anything but an ACCEPTED friendship.
   One guard, four surfaces.

   Folded into the INSERT rather than read before it: no extra round trip, and
   nothing to race. With ON CONFLICT DO UPDATE, RETURNING answers for the
   conflicting row too, so a missing row means precisely that the WHERE NOT
   EXISTS refused this write. The caller is told 'pending' anyway: only a
   flagged account can ever see it, and a test that is meant to be invisible
   learns nothing from a distinct error. */
async function requestFriendship(env, meId, otherId) {
  const [a, b] = pairKey(meId, otherId);
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO friendships (a, b, status, requested_by, ts)
     SELECT ?,?,'pending',?,?
      WHERE NOT EXISTS (SELECT 1 FROM players WHERE id IN (?,?) AND COALESCE(is_test, 0) = 1)
     ON CONFLICT(a, b) DO UPDATE SET
       status = CASE WHEN friendships.requested_by <> excluded.requested_by THEN 'accepted' ELSE friendships.status END,
       ts     = CASE WHEN friendships.requested_by <> excluded.requested_by THEN excluded.ts   ELSE friendships.ts     END
     RETURNING status`).bind(a, b, meId, now, meId, otherId).first();
  if (!row) return { ok: true, status: 'pending', ignored: true };
  return { ok: true, status: row.status === 'accepted' ? 'accepted' : 'pending' };
}

/* ---------------- daily-capped grants ----------------
   Gifts and cheers are capped per sender per recipient per day, and the cap used
   to be read with a COUNT and then used TWICE across an await: once to refuse
   over the cap, and once to build the grant key as `${prefix}${n}`.

   Both halves broke under concurrency, and the second half broke silently, which
   is the worse of the two. Measured locally on 2026-08-17, eight concurrent
   spend-gifts from one sender: every one read n = 0, every one built the key
   `...-0`, every one was answered `{ok:true}` -- and ONE grant reached the
   recipient. The client deducts the sender's coins on that ok, so seven gifts
   were paid for and never delivered. That is exactly the "my coins went weird"
   report, weeks later, with nothing in any log. Eight cheers landed two. And the
   cap itself never applied: all eight passed a limit of five.

   The count now lives INSIDE the insert. SQLite evaluates the subqueries and the
   insert as one statement against one snapshot, and D1 has a single writer, so
   the second concurrent call sees the first call's row: it gets the next `n`, and
   the (n+1)th is refused by the WHERE rather than by a stale read. The key format
   is unchanged and still deterministic (no timestamp, no random id -- the client
   ledger's idempotence depends on that).

   An explicit `key` (a client idempotency key, still inside `prefix` so it is
   counted by the same cap) replaces the counted suffix: the row then dedupes on
   UNIQUE (player_id, key), so a retry of a request whose answer was lost lands
   nothing and changes nobody's total. The caller distinguishes that `false`
   from a cap refusal by asking whether the row is there.

   Returns true when a row landed, false when the cap refused it (or, with an
   explicit key, when this exact request already landed). */
async function insertCappedGrant(env, { to, prefix, cap, type, payload, now, key = null }) {
  const hi = prefix + '￿'; // prefix-range count: no LIKE, playerIds contain '_'
  const count = 'SELECT COUNT(*) FROM grants WHERE player_id = ? AND key >= ? AND key < ?';
  const r = await env.DB.prepare(
    `INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts)
     SELECT ?, ${key ? '?' : `? || (${count})`}, ?, ?, ?
      WHERE (${count}) < ?`)
    .bind(to, ...(key ? [key] : [prefix, to, prefix, hi]), type, payload, now, to, prefix, hi, cap).run();
  return !!(r.meta && r.meta.changes);
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
    /* ONE batch: losing the tower and being TOLD you lost it must land together
       or not at all. As two awaited .run() calls the first could land alone,
       and the owner would find a dormant tower with nothing in Deliveries to
       explain it -- and no later sweep would ever try again, because the guard
       below sees siege_until already NULL. The pair stays idempotent whichever
       way it races: the UPDATE is guarded on siege_until IS NOT NULL so only one
       sweeper changes the row, and the grant key carries the window so a second
       sweeper's OR IGNORE is a no-op rather than a second delivery. */
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE spires SET tended_at = ?, siege_until = NULL, siege_name = NULL, updated_at = ?
         WHERE id = ? AND siege_until IS NOT NULL`)
        .bind(dormantAt, now, r.id),
      env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
        .bind(r.owner, `siege-lost-${r.id}-${r.siege_until}`, 'spire', JSON.stringify({
          note: `${r.siege_name || 'The siege'} broke through at ${r.name}. It stands dormant, not lost: walk back and take it again.`,
        }), now),
    ]);
    r.siege_until = null; r.siege_name = null; r.tended_at = dormantAt;
  }
  return rows;
}

/* ===========================================================================
 * WHAT AN ADMIN MAKE-GOOD MAY EVER CONTAIN  (POST /admin/grant)
 *
 * The runbook, with the exact curl to run, is docs/GOD-MODE.md.
 *
 * Tom, 2026-08-21, after a player deleted her Day One Lizard by accident:
 * "there will be times that we need to go god mode and fix player's mistakes by
 * giving them a new pet etc". So this is a capability, not a one-off, and the
 * allowlist below is the whole of it: a channel that can mint arbitrary items is
 * the most dangerous thing in this codebase, so its rules live in ONE table that
 * can be read in one sitting.
 *
 * Everything here is ADDITIVE. The client arms it feeds (js/social.js
 * applyPayload) only ever add: coinsAdd, boneDustAdd, grantCrate,
 * grantConsumable, grantEgg, grantPet. Nothing on this route can remove, reduce
 * or overwrite anything a player already has, and the arms that could are
 * refused by name below rather than left to nobody sending them.
 *
 * PETS are allowlisted BY ID, the whole slot-C catalogue, CX included. Handing
 * the Day One Lizard back to a NAMED player is the entire point of this route:
 * it is the one thing a player can lose and never earn back, because
 * pickRandomPet filters `exclusive` out of every RANDOM grant. That filter is
 * untouched, and 'random' is refused here, so the exclusive stays unobtainable
 * by play and reachable only by someone holding ADMIN_TOKEN who types the id.
 * A redeem code cannot do this job and must never be used for it: REDEEM_CODES
 * ships inside the client bundle, so any code added there is readable by every
 * player, and `redeemed` is per-save, so everyone could claim a Day One Lizard
 * and the exclusive would be destroyed for everybody who earned it.
 *
 * DELIBERATELY NOT GRANTABLE. Each refusal is one line to lift the day a real
 * player loses one, and every one of them is a 400 that says so:
 *   gearId    gear is STATTED POWER and Boneheadz is cosmetic-only (locked
 *             2026-08-07, "never sell power"). applyPayload can apply it and
 *             nothing has ever sent it; this route is not going to be the first
 *             thing in the game that mints power on request.
 *   xp        XP moves a player's LEVEL, and grantLevelRewards pays coins and
 *             crates for every level crossed. That is a second payout whose size
 *             this route could not honestly report back, and the response saying
 *             plainly what landed is what catches a mistake.
 *   rename    not a gift. It writes kv 'renameRequired' and MAKES the player
 *             change their name: the one payload arm that takes something.
 *   pet:'random'  a make-good is targeted or it is not a make-good, and the
 *             response has to be able to name the species that landed.
 *
 * The ids are duplicated from data/boneheadz.js and js/loot.js rather than
 * imported, because this Worker does not bundle the client. Drift fails CLOSED
 * (an unlisted pet is a 400, never a surprise grant), and admin-grant.test.mjs
 * imports the real catalogue and grants EVERY species through this route, so a
 * pet added to the game and missing here is a red row rather than a puzzle at
 * 2am.
 * ======================================================================== */
const GRANT_MENU = {
  coins: 20000,      // unchanged: a fat finger here must not mint a fortune
  dust: 2000,        // ~10 top-rack transmogs (RACK_DUST tops out at 200)
  pets: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'CX'],
  crates: ['daily', 'golden', 'egg'],
  consumables: ['xp2', 'vigor'],
};
const GRANT_REFUSED = {
  gearId: 'gear is statted power, and Boneheadz is cosmetic-only',
  xp: 'XP moves a level, and a level crossing pays its own coins and crates',
  rename: 'a rename takes something; this route can only ever give',
};

/** Build the grant payload from an /admin/grant body, or explain the refusal.
 *  Returns { payload, got } or { error }. `got` is plain English for the
 *  response, so a mistyped id or a wrong player is visible before it matters. */
function adminGrantPayload(b) {
  const p = {}, got = [];
  const has = k => b[k] !== undefined && b[k] !== null && b[k] !== '';
  for (const [k, why] of Object.entries(GRANT_REFUSED)) {
    if (has(k)) return { error: `${k} is not grantable here: ${why}` };
  }
  for (const k of ['coins', 'dust']) {
    if (!has(k)) continue;
    const n = Math.floor(Number(b[k]));
    if (!(n > 0) || n > GRANT_MENU[k]) return { error: `${k} must be 1..${GRANT_MENU[k]}` };
    p[k] = n; got.push(`${n} ${k}`);
  }
  for (const [k, list] of [['pet', GRANT_MENU.pets], ['crate', GRANT_MENU.crates], ['consumable', GRANT_MENU.consumables]]) {
    if (!has(k)) continue;
    const v = String(b[k]);
    if (!list.includes(v)) return { error: `${k} must be one of: ${list.join(', ')}` };
    p[k] = v; got.push(`${k} ${v}`);
  }
  if (has('egg')) {
    if (b.egg !== 'ready' && b.egg !== true) return { error: "egg must be 'ready'" };
    p.egg = 'ready'; got.push('a ready egg');
  }
  if (!got.length) return { error: `nothing to grant: pass at least one of coins, dust, pet, crate, consumable, egg` };
  return { payload: p, got };
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
    const now = Date.now();
    const cron = (event && event.cron) || null;
    let r = null, g = null, thrown = null;
    try {
      r = await pruneEvents(env, now);
      /* Grants second, and with whatever wall clock the events pass left. Events
         are the table with the 10 GB deadline and they are also the only one
         whose backlog can arrive in a burst, so they get the budget first; the
         grants pruner is cursorless and resumes on the next tick, so being cut
         short costs it nothing. Both are awaited and neither is swallowed: a
         pruner that silently stops is indistinguishable from one with nothing
         to do, right up until the cap arrives. */
      g = await pruneGrants(env, now, { budgetMs: Math.max(1000, PRUNE_BUDGET_MS - r.ms) });
      console.log('prune', JSON.stringify({ cron, ...r, grants: g }));
    } catch (e) {
      thrown = e;
      console.error('prune failed', (e && e.stack) || e);
    }
    /* THE TRACE IS WRITTEN ON BOTH PATHS, and the failing path is the one it
       exists for. A tick that threw is exactly the tick nobody will be watching,
       and `r` surviving while `g` is null is how "the events pass finished and
       the grants pass died" stays legible afterwards. */
    await recordPruneRun(env, {
      ts: now,
      ms: Date.now() - now,
      cron,
      ok: !thrown,
      ev: r ? r.total : 0,
      evStop: r ? r.stopped : null,
      evBy: r ? JSON.stringify(r.deleted) : null,
      gr: g ? g.total : 0,
      grStop: g ? g.stopped : null,
      err: thrown ? String((thrown && thrown.stack) || thrown).slice(0, 2000) : null,
    });
    // Rethrown AFTER the trace, so the invocation is still marked FAILED in the
    // Cloudflare dashboard and Workers Logs, and the row is there to explain it.
    if (thrown) throw thrown;
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
        const limitedR = await rateLimit(env, 'rl_register_ip', 'ip', clientIp(request));
        if (limitedR) return limitedR;
        const body = await request.json().catch(() => null);
        const jwk = body && body.pubkey;
        if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) return json({ error: 'bad pubkey' }, 400);
        const pub = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
        /* POSSESSION OF THE PRIVATE KEY.
           This route proves only that the caller can TYPE a public key, not that
           they hold the matching private one, so anyone can mint an account
           around a key they do not own. The impact is small in this design --
           registration is idempotent on the pubkey, so the rightful owner
           registering later gets the SAME account back rather than a stolen one,
           and every other route is signature-checked -- but it does mean the
           account table can be filled with keys nobody can sign for.
           `proof` is a signature over the canonical string below. It is VERIFIED
           when present and recorded, and it is deliberately not yet REQUIRED,
           because requiring it would 400 every client in the field: js/social.js
           goOnline() posts {pubkey} and nothing else. Enforcement is a one-line
           flip here once a client that sends it has shipped, and the client
           change is written up in the fix report. */
        let keyProven = false;
        if (typeof body.proof === 'string' && body.proof) {
          try {
            const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
            const sigBytes = Uint8Array.from(atob(body.proof), c => c.charCodeAt(0));
            keyProven = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sigBytes,
              new TextEncoder().encode(`bh-register\n${pub}`));
          } catch { keyProven = false; }
          if (!keyProven) return json({ error: 'bad key proof' }, 400);
        }
        const asExisting = row => json({ playerId: row.id, handle: row.handle, friendCode: row.friend_code, name: row.name || null, existing: true });
        const existing = await env.DB.prepare('SELECT id, handle, friend_code, name FROM players WHERE pubkey = ?').bind(pub).first();
        if (existing) return asExisting(existing);
        /* TEST ACCOUNTS opt in at birth. Any test that talks to the live API
           registers with {test:true}; the row lands with is_test=1 and every
           public surface below excludes it, so a test run can never again fill
           the Crew with dead level-1 "players" (docs/BOT-CENSUS-2026-08-22.md).
           Honesty-only flag: a liar who omits it gains nothing but visibility,
           and a real client never sends it. */
        const isTest = body.test === true ? 1 : 0;
        // retry on the (astronomically unlikely) friend-code collision
        for (let i = 0; i < 5; i++) {
          const id = newId(), handle = makeHandle(), code = makeFriendCode(), now = Date.now();
          try {
            /* ONE batch, so the account and its welcome grant land together or
               not at all. As two awaited .run() calls they were not a
               transaction: a failure between them left a player who had joined
               the Crew and was never welcomed, and no later call would notice. */
            await env.DB.batch([
              env.DB.prepare('INSERT INTO players (id, pubkey, handle, friend_code, created_at, last_seen, is_test) VALUES (?,?,?,?,?,?,?)')
                .bind(id, pub, handle, code, now, now, isTest),
              // welcome grant: a little hello the client ingests as a ledger event
              env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
                .bind(id, 'social-welcome', 'welcome', JSON.stringify({ coins: 50, xp: 10, note: 'Welcome to the Crew' }), now),
            ]);
            return json({ playerId: id, handle, friendCode: code, ...(keyProven ? { keyProven: true } : {}) });
          } catch (e) {
            if (!String(e).includes('UNIQUE')) throw e;
            /* NOT EVERY UNIQUE HERE IS A FRIEND-CODE COLLISION, and treating it
               as one is why this route 500'd on the most ordinary thing a client
               does. players.pubkey is UNIQUE too, and the SELECT above is a read
               across an await, so two goOnline() calls from one reinstalling
               device both saw "no account" and both inserted. Retrying with a
               fresh id/handle/code cannot help: the pubkey collides again, five
               times over, and the player was handed "could not allocate friend
               code" 500 instead of the account that had just been created for
               them one millisecond earlier. Measured locally on 2026-08-17:
               three concurrent registers of one pubkey gave 200, 200, 500.
               Re-read on the pubkey: if the account now exists, the race is the
               ANSWER, not a failure. */
            const raced = await env.DB.prepare('SELECT id, handle, friend_code, name FROM players WHERE pubkey = ?').bind(pub).first();
            if (raced) return asExisting(raced);
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
        const limitedP = await rateLimit(env, 'rl_profile', 'player', auth.playerId);
        if (limitedP) return limitedP;
        const body = JSON.parse(bodyText || '{}');
        if (!body.snapshot || typeof body.snapshot !== 'object' || Array.isArray(body.snapshot)) {
          return json({ error: 'missing snapshot' }, 400);
        }
        const nowP = Date.now();
        /* BOUND IT BEFORE IT IS STORED, in ONE place. Every consumer of this
           column reads it as fact (the leaderboard's ORDER BY, the step race
           board, spires.defender), so the only honest place to enforce a bound
           is the write. Sanitising at each read would mean four chances to
           forget, and the copy into spires.defender below would still carry the
           raw claim. */
        const prior = await env.DB.prepare(
          'SELECT created_at, max_level, max_level_at, week_key, week_steps FROM players WHERE id = ?')
          .bind(auth.playerId).first();
        const checked = sanitizeSnapshot(body.snapshot, prior || {}, nowP);
        const snap = JSON.stringify(checked.snap);
        /* ONE batch. The player row and every tower that row defends are one
           fact, and two awaited .run() calls are not a transaction in D1: the
           first could land and the second not, leaving towers defended by a build
           the player's own profile says they do not have. Nothing here needs a
           value from the other statement, so a batch costs nothing and removes
           the torn state.

           Keep every tower I hold defended by my CURRENT build. The snapshot used
           to be frozen at claim time, so a rival months later fought the weaker
           version of me that first took the spire. Cheap: indexed by owner. */
        await env.DB.batch([
          env.DB.prepare(
            `UPDATE players SET profile = ?, app_v = ?, last_seen = ?,
               max_level = ?, max_level_at = ?, week_key = ?, week_steps = ? WHERE id = ?`)
            .bind(snap, String(body.appV || ''), nowP,
                  checked.maxLevel || null, checked.maxLevelAt, checked.weekKey, checked.weekSteps,
                  auth.playerId),
          env.DB.prepare('UPDATE spires SET defender = ?, updated_at = ? WHERE owner = ?')
            .bind(snap, nowP, auth.playerId),
        ]);
        // `bounded` names any field that was pulled down to its ceiling. Empty
        // on every honest sync, so a client that starts seeing entries here is
        // telling us something (a real cheat, or one of our own bugs).
        return json({ ok: true, ...(checked.bounded.length ? { bounded: checked.bounded } : {}) });
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
          await env.DB.prepare(UPSERT_BACKUP)
            .bind(auth.playerId, body.blob, String(body.appV || ''), body.blob.length, now).run();
        } catch (e) {
          /* THE MIGRATION IS NOT APPLIED YET, AND THIS IS THE ONE ROUTE WHERE
             THAT MUST NOT MATTER. Two migrations in server/migrations/ are
             unapplied to production as I write this, so "deployed before the
             ALTER ran" is the normal case here, not the unlucky one. Without
             this the upsert 500s, js/social.js pushBackup reads only r.ok, and
             every player's cloud backup stops silently -- the exact failure the
             daily slot exists to prevent, caused by the daily slot. So: store
             the save the old way, skip the archive, and say so in the log. */
          if (/no such column/i.test(String(e))) {
            console.error('backups.daily_* missing; storing without the archive. ' +
              'Apply migrations/2026-08-25-backup-daily-slot.sql', (e && e.message) || e);
            await env.DB.prepare(UPSERT_BACKUP_NO_DAILY)
              .bind(auth.playerId, body.blob, String(body.appV || ''), body.blob.length, now).run();
            return json({ ok: true, updatedAt: now });
          }
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

      /* Signed: pull the encrypted backup back down (fresh install / new phone).
         `?slot=daily` returns the ARCHIVE instead, which is the whole restore
         path for the daily slot: the blob is ciphertext the server cannot read,
         so nothing here or in an admin route can restore anybody. Only the
         player's own device holds the key, so the archive has to come back down
         the same signed pipe the current save does. js/social.js
         restoreDailyBackup() is the other end. */
      if (path === '/backup' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const daily = url.searchParams.get('slot') === 'daily';
        let row = null;
        try {
          row = await env.DB.prepare(daily
            ? 'SELECT daily_blob blob, daily_at updated_at FROM backups WHERE player_id = ?'
            : 'SELECT blob, app_v, updated_at FROM backups WHERE player_id = ?').bind(auth.playerId).first();
        } catch (e) {
          // migration not applied yet: "there is no archive" is the true answer
          if (daily && /no such column/i.test(String(e))) return json({ error: 'no backup' }, 404);
          throw e;
        }
        if (!row || !row.blob) return json({ error: 'no backup' }, 404);
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
        const limited = await rateLimitRecovery(request, env, 'rl_ridcheck');
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

      /* UNSIGNED by necessity: a device restoring an account has no key yet, so
         it cannot sign. Looked up by friend code, which is semi-public.

         LEGACY ONLY, from 2026-08-16. The friend code was never meant to be a
         secret -- it is printed in the app, copied into chats, and it used to be
         published for the whole top 100 by /leaderboard -- so making it the
         lookup handle for the wrapped identity bundle meant the ciphertext was
         effectively public. That is the harvest this fix closes, and removing
         codes from the board is only half of it: the other half is that a code
         must stop being a handle to a bundle at all.

         It cannot be deleted outright, because it is the ONLY way in for a
         pre-v231 account: those rows have no recovery_id, and the player has
         wiped the phone that held it, so refusing them here would strand exactly
         the people this whole subsystem exists for.

         So it is narrowed to precisely that population. An account that has a
         recovery_id has a lookup handle that is not a share-key, and for that
         account the code path is closed and answers as though nothing is set.
         The legacy set only shrinks: the next PUT /recovery from an updated
         client attaches a recovery_id and closes this door behind it. */
      if (path.startsWith('/recovery/') && request.method === 'GET') {
        const code = decodeURIComponent(path.slice('/recovery/'.length)).toUpperCase().trim();
        if (!/^BONE-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) return json({ error: 'bad code' }, 400);
        const limited = await rateLimitRecovery(request, env);
        if (limited) return limited;
        const p = await env.DB.prepare('SELECT id FROM players WHERE friend_code = ?').bind(code).first();
        if (!p) return json({ error: 'no account' }, 404);
        const row = await env.DB.prepare('SELECT wrapped, salt, iters, recovery_id FROM recovery WHERE player_id = ?').bind(p.id).first();
        if (!row) return json({ error: 'no recovery set' }, 404);
        // SAME answer as "no recovery set", deliberately. A distinct status here
        // would turn this route into an oracle for which codes belong to
        // accounts worth attacking through some other door.
        if (row.recovery_id) return json({ error: 'no recovery set' }, 404);
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
        const read = () => env.DB.prepare('SELECT id, key, type, payload, ts FROM grants WHERE player_id = ? AND id > ? ORDER BY id LIMIT 50')
          .bind(auth.playerId, since);
        /* THE FALLBACK IS NOT DEFENSIVENESS, IT IS DEPLOY ORDER. batch() is one
           transaction, so if the UPDATE fails the SELECT rolls back with it and
           this route returns nothing. players.grants_ack arrives in
           migrations/2026-08-17-prune-and-stats.sql, and deploy.sh does not run
           migrations: publish the code before the ALTER and every client in the
           world silently stops receiving gifts until somebody notices. Retention
           bookkeeping is not worth that, so a failed ack degrades to "grants
           still deliver, nothing gets pruned for this player" and says so in the
           log, which is the direction this trade has to fail in. */
        let rows;
        try {
          [, rows] = await env.DB.batch([
            env.DB.prepare(
              `UPDATE players SET grants_ack = ${ackSql}
                WHERE id = ? AND COALESCE(grants_ack, 0) < ${ackSql}`).bind(since, auth.playerId, since),
            read(),
          ]);
        } catch (e) {
          console.error('grants ack failed, delivering without it', String(e).slice(0, 200));
          rows = await read().all();
        }
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
        // Offer the lowest free #N for this adj+noun so the client can propose
        // one instead of making the player guess their way through the space.
        const taken = async () => {
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
        };
        const clash = await env.DB.prepare(
          'SELECT id FROM players WHERE name IS NOT NULL AND lower(name) = lower(?) AND id <> ?')
          .bind(name, auth.playerId).first();
        if (clash) return await taken();
        /* THE INDEX IS THE GUARD, the SELECT above only races. idx_players_name_ci
           is what makes the name unique; the read is a way to give a NICE answer,
           and there is an await between it and the UPDATE. Two players reaching
           for the same joke at the same moment both read "free", and the loser's
           UPDATE threw straight into the outer 500 handler: measured locally on
           2026-08-17, [200, 500] with "UNIQUE constraint failed:
           idx_players_name_ci" in the body. The one that loses a name race must
           get the same designed 409 with a suggested number as the one that reads
           the clash, because to the player they are the same event. */
        try {
          await env.DB.prepare('UPDATE players SET name = ?, last_seen = ?, rename_of = NULL WHERE id = ?')
            .bind(name, Date.now(), auth.playerId).run();
        } catch (e) {
          if (!/UNIQUE|constraint/i.test(String(e))) throw e;
          return await taken();
        }
        return json({ ok: true, name });
      }

      // Signed: request a friend by their friend code. If they already requested
      // you, this accepts. Idempotent.
      if (path === '/friends/request' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const code = String((JSON.parse(bodyText || '{}').code) || '').toUpperCase().trim();
        // is_test filter: a flagged test account is unfriendable, same 404 as absent
        const target = await env.DB.prepare('SELECT id FROM players WHERE friend_code = ? AND COALESCE(is_test, 0) = 0').bind(code).first();
        if (!target) return json({ error: 'no player with that code' }, 404);
        if (target.id === auth.playerId) return json({ error: 'that is your own code' }, 400);
        return json(await requestFriendship(env, auth.playerId, target.id));
      }

      /* Signed: add a player straight from the leaderboard, by the opaque
         addToken that row carried. The board no longer publishes friend codes
         (see /leaderboard), because a code is also the recovery lookup handle,
         so it needed a way to add someone that is not a share-key. Same
         idempotent outcome as /friends/request; only the handle differs. */
      if (path === '/friends/add' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err) return json({ error: auth.err }, 401);
        const token = String(JSON.parse(bodyText || '{}').token || '');
        const targetId = await readAddToken(env, token, Date.now());
        // one answer for malformed, forged and expired: a caller who can tell
        // them apart can use the difference to test tokens
        if (!targetId) return json({ error: 'that add link has expired', code: 'bad-token' }, 400);
        if (targetId === auth.playerId) return json({ error: 'that is you' }, 400);
        const exists = await env.DB.prepare('SELECT 1 AS x FROM players WHERE id = ?').bind(targetId).first();
        if (!exists) return json({ error: 'no such player' }, 404);
        return json(await requestFriendship(env, auth.playerId, targetId));
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
        /* THE SIEGE CHECK LIVES IN THE WHERE CLAUSE, not in the `if` above.
           The read above is still worth having -- it is what tells a caller
           whether they were refused for not-yours or for no-siege -- but it CANNOT
           be the guard, because there is an await between it and the write. Two
           concurrent defends of the same open siege both saw siege_until set, both
           ran `level = level + 1`, and one siege paid two levels. Measured locally
           on 2026-08-17: twelve concurrent defends took a level-1 tower to level 13.
           `siege_until IS NOT NULL AND siege_until >= ?` makes the row itself the
           lock: whoever gets there first clears siege_until in the same statement
           that increments, so every later UPDATE matches nothing. RETURNING hands
           back the level the write actually produced, so the number the client
           mirrors is the number in the database rather than one computed from a
           stale read. */
        const won = await env.DB.prepare(
          `UPDATE spires SET siege_until = NULL, siege_name = NULL, tended_at = ?, level = level + 1, updated_at = ?
             WHERE id = ? AND owner = ? AND siege_until IS NOT NULL AND siege_until >= ?
           RETURNING level`).bind(now, now, id, auth.playerId, now).first();
        // no row changed: another request in flight repelled this same siege
        if (!won) return json({ ok: false, reason: 'no-siege' }, 409);
        return json({ ok: true, level: won.level });
      }

      // Who holds these spires? ids come from the client's local cell scan.
      if (path === '/spires' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const ids = (url.searchParams.get('ids') || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 24);
        if (!ids.length) return json({ spires: [] });
        /* owner_test rides along so a FLAGGED owner can be masked in the response.
           The claim route already refuses a flagged account, so this can only
           fire for one flagged AFTER it claimed something (the retroactive case:
           migrations/2026-08-23-flag-known-test-accounts.sql). It is read here
           and applied in the map below, NOT masked in this SELECT, because
           sweepSieges runs in between and needs the real owner to deliver the
           siege-lost grant. */
        const q = `SELECT s.id, s.name, s.owner, s.owner_name, s.defender, s.claimed_at, s.tended_at,
                          s.level, s.siege_until, s.siege_name, COALESCE(p.is_test, 0) owner_test
                     FROM spires s LEFT JOIN players p ON p.id = s.owner
                    WHERE s.id IN (${ids.map(() => '?').join(',')})`;
        const rs = await env.DB.prepare(q).bind(...ids).all();
        // a rival walking past a besieged tower should see it under siege too
        const swept = await sweepSieges(env, rs.results || [], Date.now());
        return json({
          spires: swept.map(r => {
            /* A flagged owner is nobody: the tower reads as unclaimed. owner,
               ownerName and defender are masked TOGETHER, because the map
               pennant and the "Take X from Y" button read the name while the
               tower sheet renders the holder's whole Bonehead out of defender.
               Masking one would have left the other. */
            const hide = r.owner_test === 1;
            const owner = hide ? null : r.owner;
            return {
              id: r.id, name: r.name, owner, ownerName: hide ? null : r.owner_name,
              siegeUntil: r.siege_until || null, siegeName: r.siege_name || null,
              mine: owner === auth.playerId,
              defender: (hide || r.owner === auth.playerId) ? null : JSON.parse(r.defender || 'null'),
              claimedAt: r.claimed_at,          // so a rival's tower can show its age
              tendedAt: r.tended_at, level: r.level,
            };
          }),
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
        const me = await env.DB.prepare('SELECT id, name, handle, profile, is_test FROM players WHERE id = ?').bind(auth.playerId).first();
        /* A FLAGGED TEST ACCOUNT HOLDS NO TOWERS. Refused rather than hidden,
           because a spire is a real place: hiding a test-held tower on the map
           would still have taken it out of the game for whoever walks past it,
           and toppling one sends a NAMED grant to the player who lost it. The
           read is free (is_test rides the SELECT that was already here). */
        if (me && me.is_test) return json({ error: 'test accounts do not hold towers', code: 'test-account' }, 403);
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
        /* THE CAP AND THE SHIELD ARE PART OF THE WRITE, not `if`s in front of it.
           Both used to be read across an await and then trusted, and neither
           survived concurrency. Measured locally on 2026-08-17: eight concurrent
           claims of eight DIFFERENT towers all read `held = 0`, all passed a cap
           of three, and the player finished holding eight. The shield had the
           same hole in the other direction: two rivals claiming the same tower at
           once both read the pre-claim claimed_at, both took it, and the level
           went up twice for one takeover.

           Evaluated inside the statement, both become true rules. D1 has one
           writer, so the second concurrent claim sees the first one's row: its
           cap subquery counts it, and its shield subquery sees the fresh
           claimed_at. RETURNING gives the level the write actually produced,
           which is the number the client has to mirror -- computing it from the
           stale `prev` read published a level the database did not have.

           AND SO IS "IT IS ALREADY MINE". The early return above is the only
           thing that stopped a same-owner claim bumping the level, and it reads
           `prev` an await before the write. Once a concurrent claim by this
           same player flips ownership, a second request that read a pre-flip
           prev sails past it, and the shield below could not stop it either:
           `owner <> ?` is FALSE for a tower that is now mine, so NOT EXISTS was
           true and `level = spires.level+1` fired a second time. Two levels for
           one takeover, and js/app.js pays the full 80-coin branch for each.
           The clause is now "refuse if the row is mine OR was claimed inside the
           shield", which is the same test as before plus the same-owner case,
           on the same three bindings: the owner read is re-checked AT WRITE TIME
           instead of being trusted across the await. A refusal from the new arm
           lands on the `already` path below, which is exactly what the early
           return would have answered had it read the post-flip state. */
        const won = await env.DB.prepare(
          `INSERT INTO spires (id, name, lat, lng, owner, owner_name, defender, claimed_at, tended_at, level, updated_at)
             SELECT ?,?,?,?,?,?,?,?,?,?,?
              WHERE (SELECT COUNT(*) FROM spires WHERE owner = ? AND tended_at > ?) < 3
                AND NOT EXISTS (SELECT 1 FROM spires WHERE id = ? AND (owner = ? OR claimed_at > ?))
             ON CONFLICT(id) DO UPDATE SET name=excluded.name, owner=excluded.owner, owner_name=excluded.owner_name,
               defender=excluded.defender, claimed_at=excluded.claimed_at, tended_at=excluded.tended_at,
               level=spires.level+1, updated_at=excluded.updated_at
           RETURNING level`)
          .bind(id, String(b.name).slice(0, 40), b.lat, b.lng, auth.playerId, me?.name || me?.handle || null,
                me?.profile || null, now, now, 1, now,
                auth.playerId, now - SPIRE_DORMANT_MS,
                id, auth.playerId, now - SPIRE_SHIELD_MS).first();
        if (!won) {
          // Nothing landed, so say WHICH rule refused it. Read after the write,
          // never before: this only picks the message, it decides nothing.
          const nowRow = await env.DB.prepare('SELECT owner, claimed_at, level FROM spires WHERE id = ?').bind(id).first();
          // The tower is mine, so a claim by me is a tend, not a takeover: the
          // same answer the early return gives, at the level the write that beat
          // me actually produced. Answering 'cap' here would be a lie AND would
          // tell the client its own concurrent claim failed.
          if (nowRow && nowRow.owner === auth.playerId) {
            return json({ ok: true, already: true, level: nowRow.level || 1 });
          }
          if (nowRow && (nowRow.claimed_at || 0) > now - SPIRE_SHIELD_MS) {
            return json({ error: 'shielded', until: (nowRow.claimed_at || 0) + SPIRE_SHIELD_MS }, 409);
          }
          return json({ error: 'cap', cap: 3 }, 409);
        }
        // Tell the loser, through the grants channel the client already ingests.
        if (prev && prev.owner !== auth.playerId) {
          await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
            .bind(prev.owner, `spire-lost-${id}-${now}`, 'spire', JSON.stringify({
              note: `${me?.name || me?.handle || 'Someone'} toppled ${b.name}. Walk back and take it.`,
            }), now).run();
        }
        return json({ ok: true, tookFrom: prev ? (prev.owner_name || 'someone') : null, level: won.level });
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

      /* Signed: the all-players leaderboard. Ranked by snapshot level.
         NO FRIEND CODES. This route used to publish friend_code for the whole
         top 100 so the "+ Add" button had something to send, on the stated
         grounds that codes are share-keys rather than secrets. That reasoning
         held right up until v230 made the friend code the lookup handle for GET
         /recovery/<code>, which is unsigned by necessity and hands back the
         AES-GCM-wrapped identity bundle. From that release on, one signed call
         to this route harvested 100 codes, and those 100 codes pulled 100
         wrapped bundles for offline attack at leisure. A cracked phrase yields
         the signing key and the backup key: full takeover plus decryption of
         the end-to-end-encrypted save.

         The board now carries an opaque, expiring addToken instead (see
         makeAddToken), redeemed at POST /friends/add. It adds the same player
         and nothing else, and it is not a handle to anything. */
      if (path === '/leaderboard' && request.method === 'GET') {
        const auth = await verifySigned(request, env, '');
        if (auth.err) return json({ error: auth.err }, 401);
        const rows = await env.DB.prepare(
          `SELECT id, handle, name,
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
             AND COALESCE(is_test, 0) = 0 -- flagged test accounts never surface; also gates the "New Boneheadz" card and add-tokens, both derived from these rows
           ORDER BY lvl DESC, badges DESC, last_seen DESC LIMIT 100`)
          .bind(Date.now() - SPIRE_DORMANT_MS, Date.now(), Date.now() - SPIRE_DORMANT_MS).all();
        const nowLb = Date.now();
        const players = await Promise.all((rows.results || []).map(async r => ({
          playerId: r.id,
          name: r.name || r.handle,
          level: r.lvl || 1,
          levelName: r.lvlName || null,
          badges: r.badges || 0,
          outfit: (() => { try { return r.outfit ? JSON.parse(r.outfit) : null; } catch { return null; } })(), // cosmetic ids only; art renders client-side
          stats: (() => { try { return r.stats ? JSON.parse(r.stats) : null; } catch { return null; } })(),
          gearCount: r.gearCount || 0,
          pet: (() => { try { return r.pet ? JSON.parse(r.pet) : null; } catch { return null; } })(), // {id, level, shiny, lineage}: the board must show a shiny as its shiny
          // the add handle for this row. Opaque and expiring: NOT a friend code.
          addToken: r.id === auth.playerId ? null : await makeAddToken(env, r.id, nowLb),
          lastSeen: r.last_seen,
          joinedAt: r.created_at,   // powers the Crew's "new Boneheadz" welcome list
          spires: r.spires || 0,
          spireDays: Math.floor((r.held_ms || 0) / 86400000),
          you: r.id === auth.playerId,
        })));
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
                  CAST(COALESCE(json_extract(profile,'$.weekSteps'),0) AS INTEGER) steps,
                  last_seen seenAt
             FROM players
            WHERE profile IS NOT NULL
              AND COALESCE(is_test, 0) = 0 -- a test account must never place (or be paid) in the race
              AND json_extract(profile,'$.weekKey') = ?
              AND CAST(COALESCE(json_extract(profile,'$.raceV'),0) AS INTEGER) >= ${RACE_RULES}
              AND CAST(COALESCE(json_extract(profile,'$.weekSteps'),0) AS INTEGER) > 0
            ORDER BY steps DESC LIMIT 25`).bind(weekKey).all()).results || [];

        /* Settle the week just gone, once, before answering for this one.
           ONLY WHEN `wk` REALLY IS THIS WEEK. `wk` arrives in the query string,
           and settlement pays the podium for wk minus seven days and then marks
           it settled forever. So a caller asking for NEXT week used to settle
           the week currently being raced: it would pay whoever happened to lead
           on a Tuesday and, because the marker row makes settling idempotent,
           the real winners on Sunday would then be paid nothing at all. Reading
           any week's board stays open (it is a read); only the paying half is
           gated on the server's own clock agreeing that the previous week is
           over. */
        const prev = new Date(Date.parse(wk + 'T00:00:00Z') - 7 * 86400000).toISOString().slice(0, 10);
        const settledKey = `stepweek-${prev}`;
        const settleable = classifyWeekKey(wk, Date.now()) === 'current';
        const already = settleable
          ? await env.DB.prepare('SELECT 1 FROM grants WHERE key = ? LIMIT 1').bind(settledKey).first()
          : true;
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
            WHERE g.key = ?
              -- a flagged account never appears on a podium, not even one it was
              -- paid on before it was flagged
              AND COALESCE(p.is_test, 0) = 0`).bind(`stepweek-${wk}`).all()).results || [];
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
        const now = Date.now();
        if (mode === 'free') {
          /* ONCE PER DAY, and the UNIQUE (player_id, key) is what enforces it.
             The check used to be a SELECT followed by an INSERT, which is not a
             once-per-day check at all across an await: measured locally on
             2026-08-17, three of eight concurrent free gifts passed it, three
             rewards were rolled, and one grant was delivered. INSERT OR IGNORE
             against the constraint is atomic, and `changes` is the honest answer
             to "was mine the one that landed". Nothing is written on the losing
             path, so a refused caller has cost the recipient nothing. */
          const key = `gift-free-${auth.playerId}-${day}`;
          const reward = rollFreeGift();
          const payload = JSON.stringify({ ...reward, from: fromName, note: `${fromName} sent you a gift!`, gift: true, mode });
          const r = await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
            .bind(to, key, 'gift', payload, now).run();
          if (!(r.meta && r.meta.changes)) return json({ error: 'already sent today', code: 'daily-done' }, 409);
          return json({ ok: true, reward, mode });
        }
        const coins = Math.max(1, Math.min(1000, Math.floor(bd.coins || 0)));
        const reward = { coins };
        /* A RETRY IS NOT A SECOND GIFT, and here that is not merely untidy, it
           MINTS COINS. js/app.js deducts the sender locally BEFORE the send and
           refunds only when the answer says it failed, so a gift that was
           delivered but whose answer was lost refunds the sender while the
           recipient keeps the coins. Two of them, both succeeding, debits the
           sender twice and credits the friend twice. The counted cap key made
           that unavoidable: it is the opposite of dedup, minting the NEXT n for
           every retry. Same `ck` treatment as /cheer, for the same reason, with
           the same shape: the client mints one key per amount chip and reuses
           it for every retry of that chip, the grant's UNIQUE (player_id, key)
           collapses them, and no ck (older clients) keeps the counted key. */
        const ck = String(bd.ck || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
        const prefix = `gift-spend-${auth.playerId}-${day}-`;
        const landed = await insertCappedGrant(env, {
          to, prefix, cap: 5, type: 'gift', now,
          key: ck ? `${prefix}ck-${ck}` : null,
          payload: JSON.stringify({ ...reward, from: fromName, note: `${fromName} sent you ${coins} coins!`, gift: true, mode }),
        });
        /* `false` has two causes with a ck: the cap refused it, or this exact
           tap already landed. The retry MUST be answered ok, because the client
           refunds itself on anything else and the friend keeps the coins. */
        if (!landed && ck) {
          const dupe = await env.DB.prepare('SELECT 1 FROM grants WHERE player_id = ? AND key = ?')
            .bind(to, `${prefix}ck-${ck}`).first();
          if (dupe) return json({ ok: true, duplicate: true, reward, mode });
        }
        if (!landed) return json({ error: 'daily spend-gift limit', code: 'limit' }, 429);
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
        /* A RETRY IS NOT A SECOND CHEER. The cap key counts rows, so a client
           that re-sends after a lost answer (the app's own network deadline
           fires at 12s and the tap is re-armed) mints the NEXT n and delivers a
           duplicate. The client mints one `ck` per tap and reuses it on retry;
           the same UNIQUE (player_id, key) + INSERT OR IGNORE that enforces the
           gift's once-a-day does the deduping here, and a duplicate answers ok
           without a second cheer, because the sender did what they meant to do
           exactly once. No ck (older clients) keeps the counted key. */
        const ck = String(bd.ck || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
        const prefix = `cheer-${auth.playerId}-${day}-`;
        // same COUNT-then-key shape as the spend gift, and the same fix: the
        // count is evaluated inside the insert, so no two concurrent cheers can
        // mint the same key and silently collapse into one. With a ck the key
        // is the client's instead of the count, so the UNIQUE constraint does
        // the deduping; the cap is counted over both shapes either way.
        const landed = await insertCappedGrant(env, {
          to, prefix, cap: 10, type: 'cheer', now: Date.now(),
          key: ck ? `${prefix}ck-${ck}` : null,
          payload: JSON.stringify({ from: fromName, cheer, cheerFrom: auth.playerId, note: `${fromName} cheered you` }),
        });
        /* A REFUSAL HAS TWO CAUSES AND ONLY ONE OF THEM IS AN ERROR. With a ck,
           `false` means either the cap refused it or this exact tap already
           landed. A retry of a delivered cheer must answer ok, or the app tells
           the player it failed and they send a third. One SELECT, only on the
           rare path, and it is the row's own existence that decides. */
        if (!landed && ck) {
          const dupe = await env.DB.prepare('SELECT 1 FROM grants WHERE player_id = ? AND key = ?')
            .bind(to, `${prefix}ck-${ck}`).first();
          if (dupe) return json({ ok: true, duplicate: true });
        }
        if (!landed) return json({ error: 'daily cheer limit', code: 'limit' }, 429);
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

      /* Signed: delete this account and everything the server holds about it
         (App Store guideline 5.1.1(v): in-app account deletion).

         One batch, so a half-deleted account cannot exist. Every table keyed to
         the player goes: players, backups (live + daily archive columns ride in
         the row), recovery, grants, friendships (either side), trades and
         pvp_fights (either side), leads (the survey row carries the player id
         and an email). NOT deleted, with reasons: devices/events/reports are
         keyed to the anonymous per-device id, never the player, and rate_limits
         holds only keyed-HMAC buckets that expire on their own.

         Spires: an unclaimed spire has NO row, by construction (see the schema
         and the /spires comment above), so deleting the rows IS returning the
         towers to unowned. The map stays whole for everyone else because tower
         placement and naming are deterministic from the map cell and the server
         never invents a tower. Keeping the rows was considered and rejected:
         owner_name and the defender snapshot are this player's data, and a row
         pointing at a deleted owner renders as a ghost hold nobody can contest.

         STEP RACE, delete-and-recreate inside one race week: SAFE. The board
         (/steps/week) selects FROM players, so a deleted player is simply off
         the board, and settlement pays only board rows: deletion pays nothing.
         A re-registered account is a fresh player whose previous-week claim is
         frozen at 0 (sanitizeSnapshot rule 2: the server recorded nothing for
         it) and whose current week is rate-bounded from 0, so the cycle can
         only LOSE steps, never gain a place. The welcome grant is re-minted per
         registration, but its client ledger key ('social-welcome') is constant,
         so a save that already claimed it ignores the duplicate; harvesting it
         means erasing the whole local save each cycle, which costs far more
         than the 50 coins it pays. One bounded residual: if the deleted player
         held a settled week's ONLY podium row, that week reads as unsettled and
         may settle again, but UNIQUE(player_id, key) + INSERT OR IGNORE means
         no remaining player can ever be paid twice for it.

         Idempotent: the second call finds no players row, verifySigned answers
         'unknown player', and that IS the requested end state, so it returns ok
         rather than 401. Harmless to a probe: there is nothing left to protect
         and every other route already distinguishes known from unknown ids. */
      if (path === '/account/delete' && request.method === 'POST') {
        const bodyText = await request.text();
        const auth = await verifySigned(request, env, bodyText);
        if (auth.err === 'unknown player') return json({ ok: true, already: true });
        if (auth.err) return json({ error: auth.err }, 401);
        const id = auth.playerId;
        await env.DB.batch([
          env.DB.prepare('DELETE FROM spires WHERE owner = ?').bind(id),
          env.DB.prepare('DELETE FROM friendships WHERE a = ? OR b = ?').bind(id, id),
          env.DB.prepare('DELETE FROM trades WHERE from_p = ? OR to_p = ?').bind(id, id),
          env.DB.prepare('DELETE FROM pvp_fights WHERE challenger = ? OR defender = ?').bind(id, id),
          env.DB.prepare('DELETE FROM grants WHERE player_id = ?').bind(id),
          env.DB.prepare('DELETE FROM backups WHERE player_id = ?').bind(id),
          env.DB.prepare('DELETE FROM recovery WHERE player_id = ?').bind(id),
          env.DB.prepare('DELETE FROM leads WHERE player = ?').bind(id),
          env.DB.prepare('DELETE FROM players WHERE id = ?').bind(id),
        ]);
        return json({ ok: true });
      }

      // Anonymous analytics ingest. Unsigned (events carry only a random device
      // id + coarse event names, no identity/PII), but capped to resist spam.
      if (path === '/events' && request.method === 'POST') {
        /* RATE LIMITED, IP FIRST. One request here is up to 50 event rows plus a
           devices upsert: 51 D1 writes, from anyone, with body.device any string
           the caller likes. The device bucket is the primary control because it
           matches how a real client is identified; the IP bucket is the backstop
           for a caller rotating device ids, and it is deliberately loose because
           carrier CGNAT puts thousands of genuine players behind one address.
           The IP check runs BEFORE the body is read so a rotating attacker
           cannot make us parse a 24 KB body to find out they are over budget.
           NOTE: this bounds per-identity abuse, not a flood. Each check is
           itself a D1 write, so a limiter in the database is not a DDoS defence:
           volumetric protection belongs in a Cloudflare rate-limiting rule in
           front of the Worker, which is a deploy-side change, not a code one. */
        const limitedEip = await rateLimit(env, 'rl_events_ip', 'ip', clientIp(request));
        if (limitedEip) return limitedEip;
        const body = await request.json().catch(() => null);
        if (!body || typeof body.device !== 'string' || !Array.isArray(body.events)) return json({ error: 'bad body' }, 400);
        const device = body.device.slice(0, 64);
        const limitedEdev = await rateLimit(env, 'rl_events_dev', 'device', device);
        if (limitedEdev) return limitedEdev;
        const appV = String(body.appV || '').slice(0, 16);
        const batch = body.events.slice(0, 50); // cap per request
        const now = Date.now();
        const stmt = env.DB.prepare('INSERT INTO events (device, name, props, app_v, day, ts) VALUES (?,?,?,?,?,?)');
        const ops = [];
        for (const e of batch) {
          if (!e || typeof e.name !== 'string') continue;
          /* CLAMPED FORWARD ONLY, BECAUSE A FUTURE ROW IS AN UNPRUNABLE ROW.
             `e.ts` is the CLIENT's clock and this route is unauthenticated, so
             it was whatever the caller said. pruneEvents deletes on `day <
             cutoffDay`, so a row dated next month survives every retention
             window that will ever be configured: not "kept longer", kept
             FOREVER. Measured on production 2026-08-25: 715 such rows on five
             future days out to 2026-09-14, from 39 distinct devices whose
             `devices` rows were all first seen on 2026-08-11 in five different
             countries. One skewed device is an accident; 39 is a shape that
             recurs, and one of them with a clock a year out writes a batch
             nothing can ever remove.
             BACKDATING IS LEFT ALONE ON PURPOSE. A device offline for three days
             genuinely has events from those days, and forcing them to the sync
             day would corrupt every daily figure that reads `day` (activeByDay,
             newByDay, DAU/WAU). Forward-dating has no legitimate case: nothing
             happens after now. So the clamp is one-sided.
             The 0 floor is NOT about storage -- any past day is inside the
             pruner's reach by definition -- it is about Date. ts is unbounded
             below, and `new Date(-1e16).toISOString()` throws RangeError, which
             would take out the whole 50-event batch as an unhandled 500. Zero is
             the cheapest value that cannot: it lands on 1970-01-01, which the
             very next prune tick deletes. */
          const ts = Math.min(Math.max(Number(e.ts) || now, 0), now);
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
        const limitedRip = await rateLimit(env, 'rl_report_ip', 'ip', clientIp(request));
        if (limitedRip) return limitedRip;
        const body = await request.json().catch(() => null);
        if (!body || typeof body.device !== 'string' || typeof body.kind !== 'string') return json({ error: 'bad body' }, 400);
        const kind = body.kind.slice(0, 24); // 'den-nominate' | 'unreachable'
        const device = body.device.slice(0, 64);
        const limitedRdev = await rateLimit(env, 'rl_report_dev', 'device', device);
        if (limitedRdev) return limitedRdev;
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
        const limitedSip = await rateLimit(env, 'rl_survey_ip', 'ip', clientIp(request));
        if (limitedSip) return limitedSip;
        const body = await request.json().catch(() => null);
        if (!body || typeof body.device !== 'string') return json({ error: 'bad body' }, 400);
        const device = body.device.slice(0, 64);
        const limitedSdev = await rateLimit(env, 'rl_survey_dev', 'device', device);
        if (limitedSdev) return limitedSdev;
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
        /* NOTHING CAN HAVE HAPPENED AFTER TODAY, and until 2026-08-25 every
           windowed figure below believed it could. `day >= ?` with no upper
           bound means a row dated in the future is inside "the last 7 days"
           and stays there until the calendar catches up. 39 devices with wrong
           system clocks wrote 715 rows dated 2026-09-01 to 2026-09-14; WAU read
           85 when the true figure was 46, an 85% overstatement that would have
           persisted for three weeks and then silently corrected itself.
           `today` is server-derived from the same UTC calendar `day` is, and it
           is inlined rather than bound so that every existing bind list below
           is untouched -- the same trick EX_IDS already uses two lines up. */
        /* WHAT IT COST, measured with EXPLAIN QUERY PLAN against schema.sql on
           2026-08-25 rather than assumed. Nothing got slower and two things got
           faster, because a closed range is a seek where an open one is a scan:
             wau          SCAN COVERING idx_events_device_name_day
                       -> SEARCH COVERING idx_events_day_device (day>? AND day<?)
             byName       SCAN idx_events_name (a row lookup per event, all 30 days)
                       -> SEARCH idx_events_day_device (the 14 day window only)
             totalEvents  the same seek, with the range closed at the top
             the other nine plans are byte-identical.
           `testers` is the one that had to be written differently to keep its
           plan; see the note on the unary plus down there. */
        const upto = col => `${col} <= '${today}'`;
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
        const wau = (await q(`SELECT COUNT(DISTINCT device) n FROM events WHERE day >= ? AND ${upto('day')} AND ${nin('device')}`, weekAgo)).n;
        const totalEvents = (await q(`SELECT COUNT(*) n FROM events WHERE day >= ? AND ${upto('day')} AND ${nin('device')}`, statsFrom)).n;
        const byName = await all(`SELECT name, COUNT(*) n FROM events WHERE day >= ? AND ${upto('day')} AND ${noRl('name')} AND ${nin('device')} GROUP BY name ORDER BY n DESC LIMIT 30`, statsFrom, ...NOT_PRODUCT);
        const activeByDay = await all(`SELECT day, COUNT(DISTINCT device) n FROM events WHERE day >= ? AND ${upto('day')} AND ${nin('device')} GROUP BY day ORDER BY day`, statsFrom);
        // first_seen is ms epoch; date(x/1000,'unixepoch') is the same UTC day
        // string the events rows carry, so this chart keeps its x axis.
        const newByDay = await all(`SELECT day, COUNT(*) n FROM (SELECT date(first_seen/1000,'unixepoch') day FROM devices WHERE ${nin('device')} AND first_seen IS NOT NULL) GROUP BY day ORDER BY day DESC LIMIT 14`);
        // screen-dwell "heatmap": total minutes testers spent on each screen
        const screenTime = await all(`SELECT json_extract(props,'$.s') s, ROUND(SUM(json_extract(props,'$.ms'))/60000.0,1) min, COUNT(*) n FROM events WHERE name='screen_time' AND day >= ? AND ${upto('day')} AND props IS NOT NULL AND ${nin('device')} GROUP BY s ORDER BY SUM(json_extract(props,'$.ms')) DESC`, statsFrom);
        // feature usage: how often each feature-sheet was opened + total minutes in it
        const featureOpens = await all(`SELECT json_extract(props,'$.f') f, COUNT(*) n FROM events WHERE name='feat_open' AND day >= ? AND ${upto('day')} AND props IS NOT NULL AND ${nin('device')} GROUP BY f ORDER BY n DESC LIMIT 40`, statsFrom);
        const featureTime = await all(`SELECT json_extract(props,'$.f') f, ROUND(SUM(json_extract(props,'$.ms'))/60000.0,1) min FROM events WHERE name='feat_time' AND day >= ? AND ${upto('day')} AND props IS NOT NULL AND ${nin('device')} GROUP BY f ORDER BY SUM(json_extract(props,'$.ms')) DESC LIMIT 40`, statsFrom);
        // play time: one ping ≈ 45s of active play; sessions = session_start count
        const pings = (await q(`SELECT COUNT(*) n FROM events WHERE name='session_ping' AND day >= ? AND ${upto('day')} AND ${nin('device')}`, statsFrom)).n || 0;
        const sessions = (await q(`SELECT COUNT(*) n FROM events WHERE name='session_start' AND day >= ? AND ${upto('day')} AND ${nin('device')}`, statsFrom)).n || 0;
        const playMinutes = Math.round(pings * 45 / 60);
        const avgSessionMin = sessions ? Math.round((pings * 45 / sessions / 60) * 10) / 10 : 0;
        // return rate: share of testers who came back on a later day than their
        // first. All time and true, for the same reason totalDevices is.
        const r = await q(`SELECT COUNT(*) total, SUM(CASE WHEN date(first_seen/1000,'unixepoch') <> date(last_seen/1000,'unixepoch') THEN 1 ELSE 0 END) returned FROM devices WHERE ${nin('device')} AND first_seen IS NOT NULL AND last_seen IS NOT NULL`);
        const returnRate = r && r.total ? Math.round((r.returned / r.total) * 100) : 0;
        /* Per-tester leaderboard (top 30 by activity in the window), with Crew
           name + coarse geo. `first` and `last` come off devices now, so they
           are the real first and last seen rather than the oldest and newest day
           that happens to have survived the prune.

           THE UNARY PLUS ON `+e.day` IS LOAD-BEARING AND IS NOT A TYPO. SQLite
           treats `+expr` as an expression rather than a bare column, which makes
           the term unusable for index selection while leaving it a perfectly
           normal filter. Written as plain `e.day <= 'x'` the planner sees a
           selective range on the LEADING column of idx_events_day_device and
           takes it, and this query then needs `e.name` per row, which that index
           does not carry:
             with `+`:     SCAN e USING COVERING INDEX idx_events_device_name_day
             without it:   SEARCH e USING INDEX idx_events_day_device (day>? AND day<?)
                           ... USE TEMP B-TREE FOR GROUP BY
           Measured with EXPLAIN QUERY PLAN against schema.sql on 2026-08-25.
           This is the statement the plan test calls THE 30 SECOND STATEMENT:
           33,883 ms at 12M rows once it leaves the covering index, which is past
           D1's limit. schema-plan.test.mjs pins the covering plan and went red on
           exactly this, which is why the `+` is here. */
        const testers = await all(
          `SELECT e.device, COUNT(*) events,
                  SUM(CASE WHEN e.name IN ('food_log','pit_win','boss_win','mini_win','cook','hatch','quest_claim','friend_battle','buy_weapon','transmute') THEN 1 ELSE 0 END) played,
                  d.label, d.country, d.region, d.city,
                  date(d.first_seen/1000,'unixepoch') first, date(d.last_seen/1000,'unixepoch') last
           FROM events e LEFT JOIN devices d ON d.device = e.device
           WHERE e.day >= ? AND ${upto('+e.day')} AND ${noRl('e.name')} AND ${nin('e.device')}
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
           FROM events WHERE name='err' AND ${upto('day')} GROUP BY msg ORDER BY MAX(ts) DESC LIMIT 40`);
        const errorsByBuild = await all(
          `SELECT app_v build, COUNT(*) n, COUNT(DISTINCT device) devices
           FROM events WHERE name='err' AND ${upto('day')} GROUP BY app_v ORDER BY app_v DESC LIMIT 10`);
        /* THE THREE FIGURES BELOW STILL HAVE NO LOWER BOUND, deliberately: what
           they are asked is "what has this table ever seen", and the retention
           note above already accounts for them as the only figures whose history
           the 30 day window shortens. What they gained is an UPPER bound, which
           is a different statement and not a narrowing: no row can be dated
           after today, so excluding those excludes nothing real. It matters most
           here. `errors` orders by MAX(ts) DESC, so ONE future-dated crash row
           pins itself to the top of the list and pushes a real crash off the
           bottom of the 40, and `vault.lastDay` would read as a date that has
           not happened. */
        /* VAULT. Two events with opposite meanings. A backfill SPIKE is expected
           once, when the native build carrying the BhVault registration reaches
           existing iOS players. A recover TRICKLE afterwards is the net catching
           real reinstalls, which is the only proof the feature works that does not
           require anyone to delete their own app. Backfills with zero recovers
           after a few weeks would itself be the finding. */
        const vault = await all(
          `SELECT name, COUNT(*) n, COUNT(DISTINCT device) devices, MAX(app_v) build,
                  MIN(day) firstDay, MAX(day) lastDay
           FROM events WHERE name IN ('vault_backfill','vault_recover') AND ${upto('day')} GROUP BY name`);
        /* BOTH windows travel with the numbers, so the dashboard cannot label a
           figure with a window it was not computed over. windowDays is what the
           events table still HOLDS; statsWindowDays is what this route READ.
           They are different questions and after 2026-08-17 they are different
           numbers, which is exactly why neither can be typed into the HTML. */
        return json({ windowDays: EVENT_RETENTION_DAYS, statsWindowDays: STATS_WINDOW_DAYS, totalDevices, dau, wau, totalEvents, byName, activeByDay, newByDay, screenTime, featureOpens, featureTime, playMinutes, sessions, avgSessionMin, returnRate, testers, byCountry, byCity, reports, leads, errors, errorsByBuild, vault, generatedAt: Date.now() });
      }

      /* IS THE PRUNER HEALTHY. Gated by ADMIN_TOKEN, read via ?token= or the
       * x-bh-admin header, which is the same pair /stats takes and the same
       * secret; dashboard.html already holds it. No new auth scheme, and
       * nothing here is reachable without the token.
       *
       * THE QUESTION THIS ROUTE HAS TO SURVIVE is the one that had no answer on
       * 2026-08-24: the cron was enabled, the deploy output confirmed the
       * schedule, and three `wrangler tail` sessions could not observe a single
       * tick. `status` and `detail` are therefore the point of the response and
       * the arrays are the evidence underneath them. Somebody with no context
       * reads one word and one sentence.
       *
       * IT GRADES THE OUTCOME, NOT THE ACTIVITY, and that distinction is what
       * makes it worth having. A tick that ran, reported success and deleted
       * nothing looks identical in the run log whether it had nothing to do or
       * whether its DELETE silently matched nothing. So `behind` is decided by
       * MIN(day) in the events table against the retention cutoff -- the state
       * of the data, which is what a player's storage bill actually depends on
       * -- and not by anything the pruner said about itself.
       *
       * THE CADENCE IS MEASURED, NOT DECLARED. The schedule lives in
       * wrangler.toml and a Worker cannot read its own [triggers], so a constant
       * here would be a second copy of it, free to drift. The median gap between
       * the recorded ticks is the schedule, observed. Under three runs there is
       * nothing to measure and it falls back to 15 minutes.
       *
       * COST, measured rather than assumed, because a health route that times
       * out at the size it is meant to warn about is worse than none.
       * On a 12,000,000 row events table built from real production rows:
       *   MIN(day)          0 ms   SEARCH ... COVERING INDEX idx_events_day_device
       *   COUNT(*)         47 ms   SCAN ... COVERING INDEX idx_events_name
       * COUNT(*) is the only O(table) one and at 47 ms per 12M rows it reaches
       * D1's 30 second statement limit somewhere past a billion rows, which is
       * two orders of magnitude beyond where the 10 GB cap kills the database
       * anyway. The dormant-grants count was the one that did NOT scale and it
       * is bounded by a LIMIT; see its own note below. */
      if (path === '/admin/prune' && request.method === 'GET') {
        const token = url.searchParams.get('token') || request.headers.get('x-bh-admin') || '';
        if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ error: 'unauthorized' }, 401);
        const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 20));
        const now = Date.now();
        const cutoffDay = new Date(now - EVENT_RETENTION_DAYS * 86400000).toISOString().slice(0, 10);

        let runs;
        try {
          runs = (await env.DB.prepare(
            `SELECT id, ts, ms, cron, ok, ev, ev_stop evStop, ev_by evBy, gr, gr_stop grStop, err
               FROM prune_runs ORDER BY id DESC LIMIT ?`).bind(limit).all()).results || [];
        } catch (e) {
          /* The table is missing, which means the worker was deployed without
             its migration. Say so, and say which file: reporting "healthy" off
             an empty result set is the failure this whole route exists to stop. */
          return json({
            ok: false, status: 'no-table',
            detail: 'The prune_runs table does not exist, so no run has ever been recorded. ' +
                    'Apply migrations/2026-08-25-prune-runs.sql, then check again after the next tick. ' +
                    'The pruner itself is unaffected by this and is still running.',
            error: (e && e.message) || String(e),
            runs: [], generatedAt: now,
          });
        }

        /* The table figures are wrapped because THE VERDICT MUST SURVIVE A
           BROKEN DATABASE. The single most valuable moment for this route is the
           one where the pruner is throwing, and the likeliest reason it throws
           is a table or column that is not there -- which is also what would
           break the aggregates below. Losing the counts is acceptable; losing
           "status: failing" and the recorded stack because of them is not. */
        let oldestDay = null, eventsRows = null, grantsRows = null, grantsDormant = null,
            backups = null, tableErr = null;
        const dormantTs = now - GRANT_DORMANT_DAYS * 86400000;
        try {
          oldestDay = await env.DB.prepare('SELECT MIN(day) d FROM events').first('d');
          eventsRows = await env.DB.prepare('SELECT COUNT(*) n FROM events').first('n');
          grantsRows = await env.DB.prepare('SELECT COUNT(*) n FROM grants').first('n');
          /* THE UNOPENED-GIFT TAIL, AND IT IS NO LONGER PERMANENT. Until
             2026-08-25 a value-bearing grant for a player who had never
             acknowledged anything was never deleted at any age, and this figure
             counted the only part of the database with no ceiling at all. The
             dormancy rule capped it: what is counted here now is the part of
             that tail the pruner still cannot touch, which is a gift that is
             either younger than GRANT_DORMANT_DAYS or held by a recipient who
             has been seen inside it. The two ways to leave this count are the
             two good ones: the player comes back and reads it, or both clocks
             run out and the pruner takes it. Same predicate as the pruner,
             negated, including the NULL arm: a grant whose player row is gone
             has no last_seen and the pruner will never delete it.

             COUNTED THROUGH A LIMIT, so the cost is bounded by the cap and not
             by the table. Measured on 8,000,000 grants: 4,333 ms uncapped
             against 329 ms capped at 100,000, and the uncapped form extrapolates
             to D1's 30 second statement limit at roughly 55M rows. "More than
             100,000 unopened gifts are still waiting" is exactly as actionable
             as an exact figure, and it cannot become the reason this route stops
             answering. A capped result is flagged so nobody reads the ceiling as
             a measurement. */
          grantsDormant = await env.DB.prepare(
            `SELECT COUNT(*) n FROM (
               SELECT 1 FROM grants g LEFT JOIN players p ON p.id = g.player_id
                WHERE g.type <> 'cheer' AND g.id > COALESCE(p.grants_ack, 0)
                  AND (g.key < ? OR g.key >= ?)
                  AND (g.ts >= ? OR p.last_seen IS NULL OR p.last_seen >= ?) LIMIT ?)`)
            .bind(STEPWEEK_LO, STEPWEEK_HI, dormantTs, dormantTs, DORMANT_COUNT_CAP).first('n');
          /* SAVE SIZE, WATCHED RATHER THAN PRUNED. Tom's decision on backups was
             "prune nothing, watch the average", on the condition that the average
             becomes visible, so this is the other half of that decision and not a
             nice-to-have. Nothing deletes from backups and nothing should: the
             table is one row per player (player_id is the PRIMARY KEY and the
             write is INSERT ... ON CONFLICT DO UPDATE), so it grows with PLAYER
             COUNT alone and not at all with how often anybody syncs. There is no
             stale row to reclaim. What there is instead is a save that gets
             bigger as it matures, and that is a curve nobody can see without
             this line.
             THE PROJECTION IS AN OBSERVATION, NOT A CONSTANT. playersAtBudget
             divides the budget by the CURRENT MEASURED average, so it falls on
             its own as saves mature and there is no hardcoded forecast to go
             stale. It was 55 KB per save at 33 players on the day this shipped;
             the code's own estimate for a mature one-year save is 2.23 MB, which
             is the same figure forty times smaller, so expect this number to
             drop by about that much and treat the fall as the signal.
             CHEAP: one aggregate over one row per player. At 10,000 players that
             is 10,000 rows, three orders of magnitude under the events COUNT(*)
             already above it, so it does not change what this route costs to
             poll. */
          /* SIZE MEANS BOTH COPIES NOW. The daily slot doubles what a player
             costs, so counting only `size` would have halved this projection on
             the very day the second copy started being stored, and the number
             everyone reads to decide whether backups fit in D1 would have been
             wrong in the safe-looking direction. daily_size is stored (rather
             than LENGTH(daily_blob)) precisely so this stays one cheap aggregate
             over one row per player instead of a read of every blob. */
          backups = await env.DB.prepare(
            `SELECT COUNT(*) n,
                    COALESCE(SUM(size + COALESCE(daily_size, 0)), 0) bytes,
                    COALESCE(MAX(size + COALESCE(daily_size, 0)), 0) maxBytes,
                    COUNT(daily_at) withDaily FROM backups`).first();
        } catch (e) { tableErr = (e && e.message) || String(e); }
        const avgBackup = backups && backups.n ? Math.round(backups.bytes / backups.n) : null;

        // The observed schedule: median gap between consecutive recorded ticks.
        const gaps = [];
        for (let i = 0; i + 1 < runs.length; i++) gaps.push(runs[i].ts - runs[i + 1].ts);
        gaps.sort((a, b) => a - b);
        /* A measured cadence under a minute is not a schedule, it is somebody
           firing /__scheduled by hand in a test run, and trusting it would call
           the pruner "stale" three minutes later. Below that floor the declared
           15 minutes is the better guess. */
        const median = gaps.length >= 2 ? gaps[Math.floor(gaps.length / 2)] : 0;
        const cadenceMs = median >= 60000 ? median : 900000;
        const last = runs[0] || null;
        const sinceLastMs = last ? now - last.ts : null;
        const fails = runs.filter(r => !r.ok).length;
        const mins = ms => Math.round(ms / 60000);

        let status, detail;
        if (!last) {
          status = 'never-ran';
          detail = 'The prune_runs table exists but is empty: not one tick has been recorded since it was created. ' +
                   'If the worker was deployed within the last 15 minutes this is normal and the next tick will fill it. ' +
                   'If it is older than that, check [triggers] in wrangler.toml and the Cron Triggers tab in the Cloudflare dashboard.';
        } else if (!last.ok) {
          status = 'failing';
          detail = `The most recent tick, ${mins(sinceLastMs)} minutes ago, THREW. ` +
                   `${fails} of the last ${runs.length} recorded ticks failed. The error is in runs[0].err.`;
        } else if (sinceLastMs > cadenceMs * 3) {
          status = 'stale';
          detail = `The last recorded tick was ${mins(sinceLastMs)} minutes ago and the observed schedule is every ` +
                   `${mins(cadenceMs)} minutes, so at least three ticks have been missed. The cron is not firing.`;
        } else if (oldestDay && oldestDay < cutoffDay) {
          status = 'behind';
          detail = `Ticking normally, but the oldest surviving events row is dated ${oldestDay} and the retention cutoff ` +
                   `is ${cutoffDay}: rows past the window are still in the table. The pruner is not keeping pace with ` +
                   `the write rate. Lower EVENT_RETENTION_DAYS or raise PRUNE_MAX_ROWS.`;
        } else {
          status = 'healthy';
          detail = `Last tick ${mins(sinceLastMs)} minutes ago, on an observed schedule of every ${mins(cadenceMs)} minutes. ` +
                   `${fails === 0 ? 'None' : fails} of the last ${runs.length} recorded ticks failed. ` +
                   `Nothing older than the ${EVENT_RETENTION_DAYS} day cutoff is left in events.`;
        }

        return json({
          ok: status === 'healthy', status, detail,
          lastRunAt: last ? last.ts : null, sinceLastMs, cadenceMs,
          recordedRuns: runs.length, failedRuns: fails, keeping: PRUNE_RUNS_KEEP,
          retention: {
            eventDays: EVENT_RETENTION_DAYS, eventCutoffDay: cutoffDay,
            eventOverrideDays: EVENT_RETENTION_OVERRIDE_DAYS, grantDays: GRANT_RETENTION_DAYS,
            grantDormantDays: GRANT_DORMANT_DAYS,
            /* backups has no rule here on purpose. Naming it as null next to the
               windows that do exist is the difference between a decision and an
               oversight, and the figures under tables.backups are what that
               decision was traded for. */
            backupDays: null,
          },
          caps: { batch: PRUNE_BATCH, maxRowsPerTick: PRUNE_MAX_ROWS, budgetMs: PRUNE_BUDGET_MS },
          tables: {
            eventsRows, eventsOldestDay: oldestDay, grantsRows, grantsDormant,
            grantsDormantCapped: grantsDormant >= DORMANT_COUNT_CAP,   // true = "at least this many"
            backups: backups ? {
              rows: backups.n, bytes: backups.bytes, avgBytes: avgBackup, maxBytes: backups.maxBytes,
              // bytes/avgBytes/maxBytes are CURRENT + DAILY. withDaily is how many
              // rows have an archive at all, which is what makes the doubling visible
              // as it rolls out rather than as a step change nobody can attribute.
              withDaily: backups.withDaily, dailyMs: BACKUP_DAILY_MS,
              /* The whole point of decision 3: a player count derived from the
                 average measured a moment ago, so it MOVES as saves mature. */
              budgetFraction: BACKUPS_BUDGET_FRACTION, budgetBytes: Math.round(D1_LIMIT_BYTES * BACKUPS_BUDGET_FRACTION),
              playersAtBudget: avgBackup ? Math.round(D1_LIMIT_BYTES * BACKUPS_BUDGET_FRACTION / avgBackup) : null,
            } : null,
            error: tableErr,
          },
          runs, generatedAt: now,
        });
      }

      /* Admin: find a player by NAME. The grant route below takes a player_id and
         support arrives as "Feisty Fang deleted her lizard", so without this half
         the capability is unusable by hand. READ-ONLY, gated on the same secret,
         and it returns level and last-seen next to each hit precisely so a
         near-miss on a generated bone-name is obvious before anything is granted.
         Matches an id or a friend code exactly, or a name/handle by substring. */
      if (path === '/admin/players' && request.method === 'GET') {
        const token = url.searchParams.get('token') || request.headers.get('x-admin-token') || '';
        if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ error: 'unauthorized' }, 401);
        const q = (url.searchParams.get('q') || '').trim();
        if (q.length < 2) return json({ error: 'q must be at least 2 characters' }, 400);
        // LIKE wildcards in the query are escaped: a search for "100%" is a
        // search for that text, not for every player in the table.
        const like = '%' + q.toLowerCase().replace(/[%_\\]/g, m => '\\' + m) + '%';
        const rows = (await env.DB.prepare(
          `SELECT id, name, handle, friend_code friendCode, app_v appV, last_seen lastSeen, created_at createdAt,
                  CAST(COALESCE(json_extract(profile,'$.level'), 1) AS INTEGER) level
             FROM players
            WHERE id = ? OR friend_code = ?
               OR lower(name) LIKE ? ESCAPE '\\' OR lower(handle) LIKE ? ESCAPE '\\'
            ORDER BY last_seen DESC LIMIT 20`)
          .bind(q, q.toUpperCase(), like, like).all()).results || [];
        return json({ q, count: rows.length, players: rows });
      }

      /* Admin: hand a specific player a make-good through the normal grants
         channel, so a mis-tap or a bug can be repaired without touching their
         device. Gated on ADMIN_TOKEN, the same secret the dashboard uses.
         Narrow on purpose, and every guardrail the coins-only version had is
         still here: a required note so the player is told WHY, an explicit key
         so a repeated call cannot pay twice, and a cap or an allowlist on every
         single thing it can hand out (GRANT_MENU, above the handler, which is
         also where the reasoning for each refusal lives). It cannot take
         anything away.
         The response names WHO it landed on and WHAT they got, in English, so a
         mistyped name is caught while it is still only a row in `grants`. */
      if (path === '/admin/grant' && request.method === 'POST') {
        const token = request.headers.get('x-admin-token') || '';
        if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) return json({ error: 'unauthorized' }, 401);
        const b = await request.json().catch(() => ({}));
        if (!b.playerId || !b.key || !b.note) return json({ error: 'playerId, key and note are required' }, 400);
        const built = adminGrantPayload(b);
        if (built.error) return json({ error: built.error }, 400);
        const who = await env.DB.prepare('SELECT id, name, handle FROM players WHERE id = ?').bind(String(b.playerId)).first();
        if (!who) return json({ error: 'no such player' }, 404);
        const note = String(b.note).slice(0, 160);
        const r = await env.DB.prepare('INSERT OR IGNORE INTO grants (player_id, key, type, payload, ts) VALUES (?,?,?,?,?)')
          .bind(who.id, String(b.key), 'social', JSON.stringify({ ...built.payload, note }), Date.now()).run();
        return json({
          ok: true, to: who.name || who.handle, playerId: who.id,
          granted: built.got.join(', '), payload: built.payload, note,
          inserted: !!(r.meta?.changes),
        });
      }

      // DEV-ONLY helpers for tests (env.DEV="1"; never set in production).
      /* Flag or unflag an EXISTING player, the way
         migrations/2026-08-23-flag-known-test-accounts.sql does to the 47
         already in production. There is no production route for this on purpose:
         flagging is an operator decision made with a migration and Tom watching,
         not something an account can do to itself. It exists here because the
         retroactive case is the only one the born-flagged path cannot reach, and
         it is the case that decides whether a tower a flagged account already
         holds still names it on the map. */
      if (env.DEV === '1' && path === '/dev/flag-player' && request.method === 'POST') {
        const b = await request.json();
        await env.DB.prepare('UPDATE players SET is_test = ? WHERE id = ?')
          .bind(b.test === false ? 0 : 1, String(b.playerId || '')).run();
        const row = await env.DB.prepare('SELECT id, is_test FROM players WHERE id = ?').bind(String(b.playerId || '')).first();
        return json({ ok: true, row: row || null });
      }
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
      /* Backdate a player's race week so a test can settle a week that is really
         over, without waiting seven days. DEV only, and it exists BECAUSE of the
         2026-08-16 snapshot bounds: sanitizeSnapshot deliberately makes "claim a
         past week's steps" impossible from outside, which is the whole point of
         it, and that also removed the only way a test could stage a settlement.
         So the fixture moved in here, where production can never reach it.
         It writes the same two places a real sync would leave behind: the
         profile snapshot the board reads, and the server's own record of what it
         accepted. It grants nothing and cannot change ownership. */
      if (env.DEV === '1' && path === '/dev/week-warp' && request.method === 'POST') {
        const b = await request.json();
        const wk = String(b.weekKey || '');
        const steps = Math.max(0, Math.floor(Number(b.steps) || 0));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(wk)) return json({ error: 'bad week' }, 400);
        await env.DB.prepare(
          `UPDATE players SET profile = json_set(COALESCE(profile,'{}'), '$.weekKey', ?, '$.weekSteps', ?),
             week_key = ?, week_steps = ? WHERE id = ?`)
          .bind(wk, steps, wk, steps, String(b.playerId || '')).run();
        const row = await env.DB.prepare('SELECT id, week_key, week_steps, profile FROM players WHERE id = ?')
          .bind(String(b.playerId || '')).first();
        return json({ ok: true, row: row || null });
      }
      /* Age a player, so a test can exercise the snapshot bounds that are
         functions of TIME without waiting days. Same shape and same reasoning as
         /dev/spire-warp above: move EVERY clock on the row together, because a
         row that is somehow eight days old and also synced one second ago is a
         state the real world cannot produce and the bounds would read it as
         nonsense. DEV only; it grants nothing and changes no ownership. */
      if (env.DEV === '1' && path === '/dev/player-warp' && request.method === 'POST') {
        const b = await request.json();
        const back = Number(b.backMs) || 0;
        await env.DB.prepare(
          `UPDATE players SET created_at = created_at - ?, last_seen = last_seen - ?,
             max_level_at = CASE WHEN max_level_at IS NULL THEN NULL ELSE max_level_at - ? END
           WHERE id = ?`)
          .bind(back, back, back, String(b.id || '')).run();
        const row = await env.DB.prepare(
          'SELECT id, created_at, last_seen, max_level, max_level_at FROM players WHERE id = ?')
          .bind(String(b.id || '')).first();
        return json({ ok: true, row: row || null });
      }
      /* Age a player's backup row, so a test can cross the 24h daily boundary
         without waiting a day. Same shape and same reasoning as /dev/spire-warp
         and /dev/player-warp above: move EVERY clock on the row together, or the
         row describes a state the real world cannot produce (an archive somehow
         older than the save it was promoted from). DEV only. It shifts
         timestamps and copies nothing: it cannot fabricate an archive, so a test
         that sees daily_blob had to have made the server promote it. */
      if (env.DEV === '1' && path === '/dev/backup-warp' && request.method === 'POST') {
        const b = await request.json();
        const back = Number(b.backMs) || 0;
        await env.DB.prepare(
          `UPDATE backups SET updated_at = updated_at - ?,
             daily_at = CASE WHEN daily_at IS NULL THEN NULL ELSE daily_at - ? END
           WHERE player_id = ?`).bind(back, back, String(b.playerId || '')).run();
        const row = await env.DB.prepare(
          'SELECT player_id, size, updated_at, daily_size, daily_at FROM backups WHERE player_id = ?')
          .bind(String(b.playerId || '')).first();
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
      /* Plant an events row at a chosen ts, bypassing the /events write path.
         DEV only. The read bounds on /stats are defence in depth for rows the
         WRITER did not create, so the guard that proves them cannot be built out
         of the writer: PR #170 clamps `ts` on POST /events, and the moment that
         lands, a future-dated row is unreachable through the only other door.
         A guard that can no longer build its own fixture is a guard that passes
         on an empty sample, which is the failure mode this repo has been bitten
         by most. Same shape as /dev/grant-aged and gated the same way. */
      if (env.DEV === '1' && path === '/dev/event-at' && request.method === 'POST') {
        const b = await request.json();
        const ts = Number(b.ts);
        if (!Number.isFinite(ts)) return json({ error: 'ts required' }, 400);
        await env.DB.prepare('INSERT INTO events (device, name, props, app_v, day, ts) VALUES (?,?,?,?,?,?)')
          .bind(String(b.device || 'dev'), String(b.name || 'dev'), b.props ? JSON.stringify(b.props) : null,
                String(b.appV || 'test'), new Date(ts).toISOString().slice(0, 10), ts).run();
        return json({ ok: true, day: new Date(ts).toISOString().slice(0, 10), ts });
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
      /* COUNT THE LIMITER'S OWN TABLE. This change moves the rate limiter off
         `events` and into `rate_limits`, which is the whole point of it: on a
         quiet run rl_ridcheck was the most common "event name" on the dashboard.
         Two positive controls counted the limiter through /dev/events-count,
         which reads `events`, so after the move they could never see a row and
         both tests failed with "the limiter wrote no row, so this test proves
         nothing". The guards were right; they were reading the pre-change table.
         A separate endpoint rather than a `table` parameter on events-count: the
         two tables have different time columns (events.ts vs
         rate_limits.window_start), and a dynamic table name in a DEV endpoint is
         a footgun for no gain. */
      if (env.DEV === '1' && path === '/dev/ratelimit-count' && request.method === 'GET') {
        const where = [], bind = [];
        const rName = url.searchParams.get('name');
        const rMinTs = url.searchParams.get('minTs');
        if (rName) { where.push('name = ?'); bind.push(rName); }
        if (rMinTs) { where.push('window_start >= ?'); bind.push(Number(rMinTs)); }
        const row = await env.DB.prepare(
          `SELECT COUNT(*) n FROM rate_limits${where.length ? ' WHERE ' + where.join(' AND ') : ''}`).bind(...bind).first();
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
