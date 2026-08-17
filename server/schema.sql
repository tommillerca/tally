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
  week_steps INTEGER                 -- highest weekSteps accepted for week_key (monotone)
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
CREATE INDEX IF NOT EXISTS idx_events_day ON events (day);
CREATE INDEX IF NOT EXISTS idx_events_device_day ON events (device, day);
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
