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
  last_seen INTEGER NOT NULL
);

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
  last_seen INTEGER
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
