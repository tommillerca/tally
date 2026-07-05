-- Boneheadz Gym social schema. Additive-only migrations, mirroring the app's
-- data-safety contract: never rename, never destructive.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  pubkey TEXT NOT NULL UNIQUE,       -- JSON JWK (ECDSA P-256 public key)
  handle TEXT NOT NULL,              -- generated bone-name, no free text
  friend_code TEXT NOT NULL UNIQUE,  -- BONE-XXXX-XXXX
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
