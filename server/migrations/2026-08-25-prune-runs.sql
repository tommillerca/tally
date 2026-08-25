-- The pruner's durable trace. One row per scheduled() tick.
--
-- Apply local:  npx wrangler d1 execute bonez --local  --file=migrations/2026-08-25-prune-runs.sql
-- Apply remote: npx wrangler d1 execute bonez --remote --file=migrations/2026-08-25-prune-runs.sql
--
-- Purely additive: one new table, no index, nothing dropped, nothing renamed.
--
-- RUN THIS BEFORE ./deploy.sh, like every other migration here. It is the one
-- migration whose absence is DESIGNED to be survivable, though, and that is
-- deliberate rather than lax: recordPruneRun() in src/index.js swallows its own
-- failure, because a trace that can break the thing it is tracing is worse than
-- no trace. Deploy the worker without this table and the pruner keeps pruning
-- correctly and silently; GET /admin/prune then answers
--   {"ok":false,"status":"no-table"}
-- and names this file, rather than 500ing or, worse, reporting "healthy" off an
-- empty result set. The swallow is asserted in schema-plan.test.mjs
-- ("recordPruneRun swallows its own failure"); the route's half was exercised by
-- hand against a database with the table dropped.
--
-- See the long note in schema.sql for why the table exists and why it cannot
-- grow: scheduled() trims it to the newest PRUNE_RUNS_KEEP (2,000) ids on every
-- tick, which is about 21 days at 96 ticks a day and 216 KB measured at the ceiling.
CREATE TABLE IF NOT EXISTS prune_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,        -- ms epoch the tick started
  ms INTEGER NOT NULL,        -- wall clock for the whole tick
  cron TEXT,                  -- the schedule expression Cloudflare fired, e.g. "*/15 * * * *"
  ok INTEGER NOT NULL,        -- 1 = both passes completed, 0 = something threw
  ev INTEGER NOT NULL,        -- events rows deleted this tick
  ev_stop TEXT,               -- NULL = drained | 'maxRows' | 'budgetMs'
  ev_by TEXT,                 -- JSON {rule: rows}
  gr INTEGER NOT NULL,        -- grants rows deleted this tick
  gr_stop TEXT,               -- NULL = drained | 'maxRows' | 'budgetMs'
  err TEXT                    -- the stack, when ok = 0
);
