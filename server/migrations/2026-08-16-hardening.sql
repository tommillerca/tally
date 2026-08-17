-- Server hardening, 2026-08-16. Additive only: no renames, no drops, no data
-- loss. schema.sql carries the same definitions for a database created fresh;
-- this file is for one that already exists.
--
-- Run once, by hand. Re-running the ALTERs errors with "duplicate column name",
-- which is harmless and means it is already applied:
--   npx wrangler d1 execute bonez --remote --file=migrations/2026-08-16-hardening.sql

-- 1. Snapshot bounds. The server's own memory of what it has already accepted,
--    so /profile can check a claim against a PRIOR value and not only against
--    itself. NULL everywhere means "never seen", which is what every existing
--    row is, and the first accepted snapshot seeds them.
ALTER TABLE players ADD COLUMN max_level INTEGER;
ALTER TABLE players ADD COLUMN max_level_at INTEGER;
ALTER TABLE players ADD COLUMN week_key TEXT;
ALTER TABLE players ADD COLUMN week_steps INTEGER;

-- 2. Rate limit counters in their OWN table. The limiter used to count rows in
--    `events`, which the unauthenticated /events ingest writes to, on a bucket
--    key any reader of the source could compute for any IP. Ten forged rows
--    locked that IP out of account recovery. See schema.sql for the full note.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT NOT NULL,
  name TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (bucket, name, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_expiry ON rate_limits (expires_at);

-- 3. Sweep the poisoned counters out of `events`. These rows are ONLY limiter
--    bookkeeping (they were never real analytics: /stats has no rl_* row in any
--    aggregate), and any of them may be an attacker's forgery holding a real
--    player out of recovery right now. Deleting them is what lifts an existing
--    lockout. Safe to re-run.
DELETE FROM events WHERE name IN ('rl_recovery', 'rl_ridcheck');
