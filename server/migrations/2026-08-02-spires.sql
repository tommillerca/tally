-- ADDITIVE ONLY. Creates the Dark Spires table; touches nothing that exists.
CREATE TABLE IF NOT EXISTS spires (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  owner TEXT NOT NULL,
  owner_name TEXT,
  defender TEXT,
  claimed_at INTEGER NOT NULL,
  tended_at INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spires_owner ON spires (owner);
