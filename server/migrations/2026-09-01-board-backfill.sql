-- Fill the board columns for every row that already exists, 2026-09-01.
-- The other half of 2026-09-01-board-columns.sql; read that file first.
--
-- Apply local:  npx wrangler d1 execute bonez --local  --file=migrations/2026-09-01-board-backfill.sql
-- Apply remote: npx wrangler d1 execute bonez --remote --file=migrations/2026-09-01-board-backfill.sql
--
-- RUN IT AFTER ./deploy.sh, AND AS MANY TIMES AS YOU LIKE. It holds no ALTER
-- on purpose: `wrangler d1 execute --file` stops at the first error, and a
-- second ALTER TABLE ADD COLUMN always errors with "duplicate column name", so
-- a file carrying both would be re-runnable in its comments only.
--
-- ============================================================================
-- WHY A BACKFILL AND NOT A FALLBACK
-- ============================================================================
-- A new column is NULL on every existing row until that row's owner next syncs,
-- and NULL sorts LAST under DESC. Left alone, the top 100 would have been
-- rebuilt out of whoever happened to have opened the app since the deploy, and
-- everybody else would have vanished from the Crew tab without an error
-- anywhere. Falling back in SQL (COALESCE over the JSON) is not an option
-- either: that is a computed expression again, which is the thing being fixed.
--
-- So the values are computed once, here, from the same JSON the board used to
-- read, using character-for-character the expression it used to rank on. That
-- makes the board's answer provably unchanged rather than merely fast:
-- schema-plan.test.mjs runs the OLD json_extract query and the NEW column query
-- over one fixture and requires an identical list of ids, including a row that
-- has NEVER synced since the columns existed.
--
-- IDEMPOTENT BY CONSTRUCTION, and deliberately NOT gated on `level IS NULL`:
-- it recomputes from the profile, which is the source of truth, so on a row the
-- worker already maintains it writes back what is already there. That is what
-- makes the post-deploy re-run both safe and useful. A fill-if-empty backfill
-- would be safe and useless: it could not repair a row that went stale in the
-- window between this migration and the deploy, which is the only thing the
-- second run is there for.
--
-- COST: one pass over players, and it is linear in them. Measured in local
-- SQLite on the real schema, rebuilding both columns from the JSON:
--
--   25,000 players    29 ms
--  100,000 players   130 ms
--  200,000 players   289 ms
--
-- roughly 1.4 microseconds a row. D1's ceiling is 30 SECONDS PER STATEMENT, and
-- a network round trip is not what this spends its time on, so the headroom is
-- large but it is not infinite: if players ever reaches the millions, add
-- `AND level IS NULL` and run this repeatedly instead, accepting that the
-- post-deploy sweep described in 2026-09-01-board-columns.sql then no longer
-- repairs a stale row and has to be done some other way.
UPDATE players
   SET level  = CAST(COALESCE(json_extract(profile, '$.level'),  1) AS INTEGER),
       badges = CAST(COALESCE(json_extract(profile, '$.badges'), 0) AS INTEGER)
 WHERE profile IS NOT NULL;

-- week_key/week_steps get the same treatment for the same reason, but only
-- where the column has never been written: the deployed worker has maintained
-- them since 2026-08-16, so a non-NULL value there is current and must not be
-- rewritten from a snapshot. The rows this touches are the ones that have not
-- synced since that migration, whose JSON weekKey is that old too.
UPDATE players
   SET week_key   = json_extract(profile, '$.weekKey'),
       week_steps = CAST(COALESCE(json_extract(profile, '$.weekSteps'), 0) AS INTEGER)
 WHERE profile IS NOT NULL AND week_key IS NULL;
