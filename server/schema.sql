-- Boneheadz Gym social schema. Additive-only migrations, mirroring the app's
-- data-safety contract: never rename, never destructive.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  pubkey TEXT NOT NULL UNIQUE,       -- JSON JWK (ECDSA P-256 public key)
  handle TEXT NOT NULL,              -- generated bone-name fallback
  name TEXT,                         -- curated display name (adj+noun[+#]) player picks
  friend_code TEXT NOT NULL UNIQUE,  -- BONE-XXXX-XXXX (the real add-key)
  profile TEXT,                      -- JSON game snapshot (never food data)
  app_v TEXT,                        -- app version of last snapshot
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  siege_last INTEGER,                -- weekly siege limiter: one per player per 7 days
  rename_of TEXT,                    -- a name we owe them a change from (dup-name repair, 2026-08-08)
  -- SNAPSHOT BOUNDS (2026-08-16). /profile used to store whatever the client
  -- asserted, and /leaderboard ranks on it, so one signed PUT of
  -- {level:999999, badges:999999} was rank 1 forever. These four columns are the
  -- server's own memory of what it has already accepted, so a snapshot can be
  -- checked against a PRIOR value instead of only against itself.
  max_level INTEGER,                 -- highest level ever accepted (monotone ratchet)
  max_level_at INTEGER,              -- when max_level was last raised (the jump anchor)
  week_key TEXT,                     -- the race week the accepted week_steps belong to
  week_steps INTEGER,                -- highest weekSteps accepted for week_key (monotone)
  /* HOW FAR THIS PLAYER'S CLIENT HAS READ THE GRANTS FEED (2026-08-17).
     GET /grants is a cursor read: the client sends `since` and js/social.js
     pullGrants only advances its local grantCursor AFTER applying everything in
     the batch. So a request carrying since=N is the client STATING that every
     grant with id <= N has been applied on the device.
     Before this column the server held no record of that at all, which is
     exactly why grants could not be pruned: nothing on this side could tell a
     delivered gift from one still waiting. Nullable, so every pre-existing row
     means "never acknowledged anything" and is protected by default. */
  grants_ack INTEGER,
  -- TEST ACCOUNTS (2026-08-22). A test that talks to the LIVE API registers
  -- with {test:true} (server/test-flag.mjs decides, tests/live-api-register-lint.mjs
  -- enforces), so the account lands flagged. Flagged rows are excluded from all
  -- six reads that enumerate players (/leaderboard, /steps/week, /steps/settled,
  -- /spires, and /friends via requestFriendship, which /grants sender names
  -- depend on), so a test run can never again flood the Crew with dead level-1
  -- "players". Existing DBs: migrations/2026-08-22-test-accounts.sql, applied
  -- BEFORE deploying the worker that filters on it.
  is_test INTEGER DEFAULT 0
);

-- Names are one-of-a-kind, case-insensitively. /name enforces this in code too
-- (and returns the lowest free #N when a name is taken), but the constraint is
-- what makes it TRUE rather than merely intended: the code check shipped after
-- two players already shared "Massive Coccyx". Partial index because a player who
-- has never picked a name has NULL here and any number of those is fine.
-- Applied to production 2026-08-08, once the one duplicate had resolved itself.
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_name_ci ON players (lower(name)) WHERE name IS NOT NULL;

CREATE TABLE IF NOT EXISTS friendships (
  a TEXT NOT NULL,                   -- canonical: a < b
  b TEXT NOT NULL,
  status TEXT NOT NULL,              -- pending | accepted
  requested_by TEXT NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
-- The PRIMARY KEY (a, b) can only be searched on a prefix, so it answers
-- "a = ?" and it cannot answer "b = ?" at all. GET /friends asks
-- "WHERE f.a = ? OR f.b = ?", which meant the OR arm nobody had an index for
-- dragged the whole query down to a full table scan: 14.13 ms at 199,598
-- friendships, against 0.27 ms with this index. See
-- migrations/2026-08-16-indexes.sql for the full before/after.
CREATE INDEX IF NOT EXISTS idx_friendships_b ON friendships (b);

CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  from_p TEXT NOT NULL,
  to_p TEXT NOT NULL,
  offer TEXT NOT NULL,               -- JSON array of gear ids
  ask TEXT NOT NULL,                 -- JSON array of gear ids
  status TEXT NOT NULL,              -- proposed | accepted | cancelled | done
  ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pvp_fights (
  id TEXT PRIMARY KEY,
  challenger TEXT NOT NULL,
  defender TEXT NOT NULL,
  week TEXT NOT NULL,
  seed INTEGER NOT NULL,
  payload TEXT,                      -- submitted fight: builds + action log
  winner TEXT,
  verified INTEGER DEFAULT 0,
  ts INTEGER NOT NULL
);

-- Full end-to-end-ENCRYPTED save backup. The blob is AES-GCM ciphertext the
-- client encrypts on-device with a key the server never sees, so the server
-- stores opaque bytes (food/weight/health included, but unreadable here). One
-- row per player, overwritten on each backup. This is what makes progress
-- survive a reinstall / wiped device / new phone.
CREATE TABLE IF NOT EXISTS backups (
  player_id TEXT PRIMARY KEY,
  blob TEXT NOT NULL,      -- base64(iv || AES-GCM ciphertext); opaque to the server
  app_v TEXT,
  size INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Server-issued ledger events the client ingests idempotently by key.
CREATE TABLE IF NOT EXISTS grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  key TEXT NOT NULL,                 -- becomes the client ledger key
  type TEXT NOT NULL,                -- social | trade | pvp | welcome
  payload TEXT NOT NULL,             -- JSON {xp?, coins?, crate?, gearId?, note?}
  ts INTEGER NOT NULL,
  UNIQUE (player_id, key)
);
CREATE INDEX IF NOT EXISTS idx_grants_player ON grants (player_id, id);
-- Two routes look a grant up by key ALONE, with no player_id to lead with:
-- /steps/week asks "has last week been settled yet" and /steps/settled reads
-- back the podium that was paid. Neither UNIQUE (player_id, key) nor
-- idx_grants_player starts with `key`, so both were scanning all 1.9M rows
-- (38.10 ms and 112.96 ms measured) to find at most five.
CREATE INDEX IF NOT EXISTS idx_grants_key ON grants (key);
-- The grants pruner walks candidates OLDEST FIRST, and `ts` is the only column
-- that says how old a row is. Without it the retention DELETE has no usable
-- index: the planner falls back to a MULTI-INDEX OR over idx_grants_key plus a
-- TEMP B-TREE for the ORDER BY, and one 1,000-row batch measured 382 ms against
-- 400,000 rows. With it the plan is SEARCH g USING INDEX idx_grants_ts (ts<?)
-- and the same batch is 13.6 ms, a 28x difference that grows with the table.
-- Costs 17 bytes a row measured off the page_count delta (512 -> 529 bytes per
-- row all-in), which one retention cycle pays back many times over.
-- See pruneGrants in src/index.js.
CREATE INDEX IF NOT EXISTS idx_grants_ts ON grants (ts);

-- Anonymous product analytics. Keyed to a random per-device id (NOT the player
-- pubkey, NOT linked to identity). Event names + coarse props only; never food,
-- weight, health, or any personal data. Powers "how many are playing" + usage.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device TEXT NOT NULL,   -- anonymous random device id
  name TEXT NOT NULL,     -- app_open | food_log | pit_win | boss_win | level_up | cook | wellness | ...
  props TEXT,             -- small JSON, coarse only (e.g. {"level":8})
  app_v TEXT,
  day TEXT NOT NULL,      -- YYYY-MM-DD (UTC) for daily rollups
  ts INTEGER NOT NULL
);
/* THE TWO WIDENED INDEXES (2026-08-17). Each REPLACES an earlier one and carries
   it as a strict prefix, so every plan the old index served is still served, and
   the planner is left with one obvious choice instead of two similar ones.
   Measured against a 12,000,000 row events table in local SQLite, with the
   windowed /stats SQL, best of three:

     idx_events_device_day (device, day) -> (device, name, day)
       The tester leaderboard groups the whole table by device and reads `name`
       per row. On (device, day) that is one row lookup per event: 11,726 ms.
       On (device, name, day) the whole grouping is a COVERING index scan:
       1,890 ms. It also turns rateLimitRecovery's "device = ? AND name = ?"
       from a device-prefix walk into a two-column seek.

     idx_events_day (day) -> (day, device)
       Every day-ranged count and COUNT(DISTINCT device) had to leave the index
       for the device column. activeByDay 6,111 -> 348 ms, totalEvents
       4,894 -> 174 ms, dau 461 -> 13 ms. The retention pruner's "day < ?" is
       unaffected: `day` is still the leading column.

   THE PRICE, and it is not free. Measured off the page_count delta on a fresh
   build of each index set: the swap costs 20 more bytes per events row. The
   retention window was sized on 189 bytes a row, so it becomes 209, which is
   about 158 MB a day at 10,000 DAU instead of 143 MB. Sixty days of that is
   9.5 GB against a 10 GB cap, so THIS SWAP MOVES THE DAU CEILING FOR A 60 DAY
   WINDOW DOWN FROM ROUGHLY 8,000-9,000 TO ROUGHLY 7,300-8,200. That is the
   trade: /stats survives to about 13,700 daily devices instead of 2,600, and
   the storage runway gets about 10% shorter. When DAU passes it,
   EVENT_RETENTION_DAYS comes down, exactly as its own note says.

   A THIRD SWAP WAS TRIED AND REJECTED: idx_events_name -> (name, day) made
   byName WORSE (5,721 -> 9,001 ms) and the session_ping count worse
   (1,580 -> 3,301 ms), because the wider entries cost more to scan than the day
   bound saves. It is left as (name) alone. */
CREATE INDEX IF NOT EXISTS idx_events_day_device ON events (day, device);
CREATE INDEX IF NOT EXISTS idx_events_device_name_day ON events (device, name, day);
CREATE INDEX IF NOT EXISTS idx_events_name ON events (name);

-- one row per tester device: their chosen Crew name (if online) + coarse edge
-- geo (from the request IP via Cloudflare; never device GPS). Upserted on ingest.
CREATE TABLE IF NOT EXISTS devices (
  device TEXT PRIMARY KEY,
  label TEXT,            -- Crew/Boneheadz name, if the tester went online
  country TEXT,
  region TEXT,
  city TEXT,
  first_seen INTEGER,
  last_seen INTEGER,
  plat TEXT              -- ios / android / mac-web / ios-pwa ... (v311)
);

-- player-submitted map feedback: den nominations ("this landmark should be a
-- boss den, because...") + unreachable-spot reports ("this coin/boss is on
-- private property"). Private dev channel; surfaced only in the admin dashboard.
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device TEXT NOT NULL,    -- anonymous random device id
  label TEXT,              -- Crew name, if the reporter went online
  kind TEXT NOT NULL,      -- den-nominate | unreachable
  lat REAL, lng REAL,      -- map point (rounded to ~1m)
  target TEXT,             -- what was long-pressed (marker label), if any
  note TEXT,               -- the reporter's reason (capped 280 chars)
  app_v TEXT,
  geo TEXT,                -- coarse edge geo string (city, region, country)
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_ts ON reports (ts);

-- Survey leads: the one-time in-app survey (name/email/feedback/most-wanted +
-- an explicit opt-in to product-update emails). Email is contact info, so this
-- MUST be declared in the App Store / Play data-safety forms before shipping.
-- Private dev channel; surfaced only in the admin dashboard.
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device TEXT NOT NULL,      -- anonymous random device id
  player TEXT,               -- social pubkey/id, if the player went online
  label TEXT,                -- Crew name, if known
  name TEXT,                 -- what they typed (capped)
  email TEXT,                -- contact email (capped)
  email_optin INTEGER DEFAULT 0, -- 1 = opted in to update emails
  feedback TEXT,             -- free text (capped 500)
  most_wanted TEXT,          -- "one thing that would make you play more" (capped 280)
  features TEXT,             -- comma-joined slugs of the main features they use
  app_v TEXT,
  geo TEXT,                  -- coarse edge geo string (city, region, country)
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leads_ts ON leads (ts);

-- v230 account recovery: a user-chosen phrase wraps the identity bundle
-- (signing key + backup AES key) client-side. The server stores ONLY the
-- ciphertext and the KDF salt, so it still cannot read a save. This is what
-- makes an account survive losing the device that holds the keychain.
-- recovery_id (v231): a memorable handle to restore BY. Restoring used to need
-- the friend code, which nobody has after wiping the phone that displayed it, so
-- the phrase alone was useless. Nullable, so every pre-v231 row keeps working via
-- friend code. SQLite allows many NULLs under a UNIQUE index, which is what makes
-- that possible.
-- This file stays re-runnable, so the column lives in the CREATE. An ALREADY
-- EXISTING database needs the one-off migration instead (see migrations below).
CREATE TABLE IF NOT EXISTS recovery (
  player_id TEXT PRIMARY KEY,
  wrapped TEXT NOT NULL,       -- base64(iv || AES-GCM(identity bundle))
  salt TEXT NOT NULL,          -- base64 PBKDF2 salt
  iters INTEGER NOT NULL,      -- PBKDF2 iterations, recorded so it can be raised later
  updated_at INTEGER NOT NULL,
  recovery_id TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_rid ON recovery (recovery_id);

-- ---------------------------------------------------------------------------
-- MIGRATIONS for databases created before the column above existed. Run once,
-- by hand; re-running errors with "duplicate column name", which is harmless.
--   npx wrangler d1 execute bonez --remote --command \
--     "ALTER TABLE recovery ADD COLUMN recovery_id TEXT"
--   npx wrangler d1 execute bonez --remote --command \
--     "CREATE UNIQUE INDEX IF NOT EXISTS idx_recovery_rid ON recovery (recovery_id)"

-- ---------------------------------------------------------------------------
-- RATE LIMIT COUNTERS (2026-08-16). Its OWN table, and that separation is the
-- whole point of it.
--
-- The limiter used to count its budget out of `events`, which is the table the
-- UNAUTHENTICATED /events ingest writes to, keyed on SHA-256('bh-rl:' + ip)
-- truncated to 8 bytes. Every ingredient of that key is in the published source,
-- so anyone could compute the bucket for any IP and POST ten forged rows with
-- that device id and name='rl_recovery'. Ten rows locked that IP out of account
-- RECOVERY for ten minutes, and about six requests an hour held it there
-- forever. Recovery is the only thing that saves an account whose keychain is
-- gone, so a public ingest endpoint could permanently deny the one route that
-- makes a lost account recoverable.
--
-- Nothing that a request body can influence is ever written here. There is no
-- route that inserts into this table except the limiter itself, which writes
-- only a bucket it derived server-side. That is what makes the counter honest;
-- the keyed HMAC in rlBucket() is the second layer, not the first.
--
-- Fixed windows, one row per (bucket, name, window), so a burst costs ONE
-- upsert rather than a row per hit: the counters must not themselves become the
-- write amplification they exist to prevent.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT NOT NULL,          -- keyed hash of the subject (IP / device / player). Never a raw IP.
  name TEXT NOT NULL,            -- which limiter (rl_recovery, rl_events_ip, ...)
  window_start INTEGER NOT NULL, -- ms epoch, floor(now / windowMs) * windowMs
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,   -- when this row may be swept
  PRIMARY KEY (bucket, name, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expiry ON rate_limits (expires_at);

-- Dark Spires (v252): shared territory. One row per spire id that anyone has
-- ever claimed; unclaimed spires simply have no row, exactly like the client's
-- local model, so the two agree by construction.
CREATE TABLE IF NOT EXISTS spires (
  id TEXT PRIMARY KEY,               -- sp-<cx>-<cy>, deterministic from the cell
  name TEXT NOT NULL,                -- seeded name, stored so a rival sees the same one
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  owner TEXT NOT NULL,               -- players.id
  owner_name TEXT,                   -- denormalised for the map plate
  defender TEXT,                     -- JSON snapshot of the owner's fighter
  claimed_at INTEGER NOT NULL,
  tended_at INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,   -- +1 per takeover, +1 per repelled siege
  siege_until INTEGER,                -- ms epoch the 48h defense window closes; NULL = no siege
  siege_name TEXT,                    -- the NPC laying siege (owner and rivals see the same one)
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spires_owner ON spires (owner);
