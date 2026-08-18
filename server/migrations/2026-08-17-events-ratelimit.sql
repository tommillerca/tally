-- Per-IP daily write budget for the unsigned /events ingest.
--
-- ADDITIVE ONLY. One new table; nothing existing is touched.
--
-- Apply local:  npx wrangler d1 execute bonez --local  --file=migrations/2026-08-17-events-ratelimit.sql
-- Apply remote: npx wrangler d1 execute bonez --remote --file=migrations/2026-08-17-events-ratelimit.sql
--
-- APPLY THIS BEFORE DEPLOYING the worker that reads it: /events queries `rl` on
-- every request, so a deploy without the table 500s the ingest. deploy.sh checks
-- for it and refuses, but the ordering is the point.
--
-- WITHOUT ROWID: the primary key IS the table, so an upsert writes ONE row.
-- The table's whole job is to protect the free plan's 100,000 written rows/day
-- (each accepted event costs 4: the row plus three indexes on `events`), so the
-- counter has to be an order of magnitude cheaper than what it counts.
CREATE TABLE IF NOT EXISTS rl (
  k TEXT NOT NULL,        -- bucket + hashed ip ("ev:<8-byte hash>"), never a raw ip
  day TEXT NOT NULL,      -- YYYY-MM-DD UTC: the same boundary the CF quota resets on
  n INTEGER NOT NULL,     -- units spent today (accepted events, for the 'ev:' bucket)
  PRIMARY KEY (k, day)
) WITHOUT ROWID;
