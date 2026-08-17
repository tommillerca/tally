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

/* ---------------- signature auth ---------------- */
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
   no-op rather than a second row. */
async function requestFriendship(env, meId, otherId) {
  const [a, b] = pairKey(meId, otherId);
  const ex = await env.DB.prepare('SELECT status, requested_by FROM friendships WHERE a = ? AND b = ?').bind(a, b).first();
  const now = Date.now();
  if (ex && ex.status === 'accepted') return { ok: true, status: 'accepted' };
  if (ex && ex.requested_by !== meId) { // they already asked me -> accept
    await env.DB.prepare('UPDATE friendships SET status = ? , ts = ? WHERE a = ? AND b = ?').bind('accepted', now, a, b).run();
    return { ok: true, status: 'accepted' };
  }
  if (!ex) {
    await env.DB.prepare('INSERT INTO friendships (a, b, status, requested_by, ts) VALUES (?,?,?,?,?)')
      .bind(a, b, 'pending', meId, now).run();
  }
  return { ok: true, status: 'pending' };
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
            return json({ playerId: id, handle, friendCode: code, ...(keyProven ? { keyProven: true } : {}) });
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
        await env.DB.prepare(
          `UPDATE players SET profile = ?, app_v = ?, last_seen = ?,
             max_level = ?, max_level_at = ?, week_key = ?, week_steps = ? WHERE id = ?`)
          .bind(snap, String(body.appV || ''), nowP,
                checked.maxLevel || null, checked.maxLevelAt, checked.weekKey, checked.weekSteps,
                auth.playerId).run();
        // Keep every tower I hold defended by my CURRENT build. The snapshot used
        // to be frozen at claim time, so a rival months later fought the weaker
        // version of me that first took the spire. Cheap: indexed by owner.
        await env.DB.prepare('UPDATE spires SET defender = ?, updated_at = ? WHERE owner = ?')
          .bind(snap, nowP, auth.playerId).run();
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
        await env.DB.prepare('INSERT INTO backups (player_id, blob, app_v, size, updated_at) VALUES (?,?,?,?,?) ' +
          'ON CONFLICT(player_id) DO UPDATE SET blob=excluded.blob, app_v=excluded.app_v, size=excluded.size, updated_at=excluded.updated_at')
          .bind(auth.playerId, body.blob, String(body.appV || ''), body.blob.length, now).run();
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
        const rows = await env.DB.prepare('SELECT id, key, type, payload, ts FROM grants WHERE player_id = ? AND id > ? ORDER BY id LIMIT 50')
          .bind(auth.playerId, since).all();
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
                  CAST(COALESCE(json_extract(profile,'$.weekSteps'),0) AS INTEGER) steps
             FROM players
            WHERE profile IS NOT NULL
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

      // Admin dashboard aggregates. Gated by ADMIN_TOKEN (set via wrangler secret).
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
        const totalDevices = (await q(`SELECT COUNT(DISTINCT device) n FROM events WHERE ${nin('device')}`)).n;
        const dau = (await q(`SELECT COUNT(DISTINCT device) n FROM events WHERE day = ? AND ${nin('device')}`, today)).n;
        const wau = (await q(`SELECT COUNT(DISTINCT device) n FROM events WHERE day >= ? AND ${nin('device')}`, weekAgo)).n;
        const totalEvents = (await q(`SELECT COUNT(*) n FROM events WHERE ${nin('device')}`)).n;
        const byName = await all(`SELECT name, COUNT(*) n FROM events WHERE ${nin('device')} GROUP BY name ORDER BY n DESC LIMIT 30`);
        const activeByDay = await all(`SELECT day, COUNT(DISTINCT device) n FROM events WHERE day >= ? AND ${nin('device')} GROUP BY day ORDER BY day`, new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
        const newByDay = await all(`SELECT day, COUNT(*) n FROM (SELECT device, MIN(day) day FROM events WHERE ${nin('device')} GROUP BY device) GROUP BY day ORDER BY day DESC LIMIT 14`);
        // screen-dwell "heatmap": total minutes testers spent on each screen
        const screenTime = await all(`SELECT json_extract(props,'$.s') s, ROUND(SUM(json_extract(props,'$.ms'))/60000.0,1) min, COUNT(*) n FROM events WHERE name='screen_time' AND props IS NOT NULL AND ${nin('device')} GROUP BY s ORDER BY SUM(json_extract(props,'$.ms')) DESC`);
        // feature usage: how often each feature-sheet was opened + total minutes in it
        const featureOpens = await all(`SELECT json_extract(props,'$.f') f, COUNT(*) n FROM events WHERE name='feat_open' AND props IS NOT NULL AND ${nin('device')} GROUP BY f ORDER BY n DESC LIMIT 40`);
        const featureTime = await all(`SELECT json_extract(props,'$.f') f, ROUND(SUM(json_extract(props,'$.ms'))/60000.0,1) min FROM events WHERE name='feat_time' AND props IS NOT NULL AND ${nin('device')} GROUP BY f ORDER BY SUM(json_extract(props,'$.ms')) DESC LIMIT 40`);
        // play time: one ping ≈ 45s of active play; sessions = session_start count
        const pings = (await q(`SELECT COUNT(*) n FROM events WHERE name='session_ping' AND ${nin('device')}`)).n || 0;
        const sessions = (await q(`SELECT COUNT(*) n FROM events WHERE name='session_start' AND ${nin('device')}`)).n || 0;
        const playMinutes = Math.round(pings * 45 / 60);
        const avgSessionMin = sessions ? Math.round((pings * 45 / sessions / 60) * 10) / 10 : 0;
        // return rate: share of testers who came back on a later day than their first
        const r = await q(`SELECT COUNT(*) total, SUM(CASE WHEN firstday <> lastday THEN 1 ELSE 0 END) returned FROM (SELECT device, MIN(day) firstday, MAX(day) lastday FROM events WHERE ${nin('device')} GROUP BY device)`);
        const returnRate = r && r.total ? Math.round((r.returned / r.total) * 100) : 0;
        // per-tester leaderboard (top 30 by activity), with Crew name + coarse geo
        const testers = await all(
          `SELECT e.device, COUNT(*) events, MIN(e.day) first, MAX(e.day) last,
                  SUM(CASE WHEN e.name IN ('food_log','pit_win','boss_win','mini_win','cook','hatch','quest_claim','friend_battle','buy_weapon','transmute') THEN 1 ELSE 0 END) played,
                  d.label, d.country, d.region, d.city
           FROM events e LEFT JOIN devices d ON d.device = e.device
           WHERE ${nin('e.device')}
           GROUP BY e.device ORDER BY events DESC LIMIT 30`);
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
        return json({ totalDevices, dau, wau, totalEvents, byName, activeByDay, newByDay, screenTime, featureOpens, featureTime, playMinutes, sessions, avgSessionMin, returnRate, testers, byCountry, byCity, reports, leads, errors, errorsByBuild, vault, generatedAt: Date.now() });
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
