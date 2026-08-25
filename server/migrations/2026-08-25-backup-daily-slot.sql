-- The daily backup slot, 2026-08-25. One archived save per player, replaced at
-- most once every 24 hours, so a corrupted sync has a bounded window in which it
-- can destroy an account rather than an instant one. The reasoning lives in
-- schema.sql next to the columns; the promotion rule lives in src/index.js,
-- PUT /backup.
--
-- Apply local:  npx wrangler d1 execute bonez --local  --file=migrations/2026-08-25-backup-daily-slot.sql
-- Apply remote: npx wrangler d1 execute bonez --remote --file=migrations/2026-08-25-backup-daily-slot.sql
--
-- Purely additive: three nullable columns, no index, nothing dropped, nothing
-- renamed, no backfill. Every existing row reads "no archive yet" and gets one
-- on its owner's next two pushes. Re-running errors with "duplicate column
-- name", which is harmless.
--
-- ORDER: apply this BEFORE deploying the worker, like every migration here.
-- Unlike the others, getting the order wrong is survivable ON PURPOSE, because
-- the route it touches is the one that stores people's saves and a 500 there is
-- silent (js/social.js pushBackup only reads r.ok). PUT /backup catches "no such
-- column" and falls back to the pre-migration upsert: the current save is still
-- stored, correctly, and only the archive is skipped. GET /backup?slot=daily
-- answers 404 the same way. Two migrations in this directory
-- (2026-08-16-hardening.sql, 2026-08-22-test-accounts.sql) are sitting here
-- unapplied to production right now, which is why that fallback is not
-- speculative.
ALTER TABLE backups ADD COLUMN daily_blob TEXT;
ALTER TABLE backups ADD COLUMN daily_size INTEGER;
ALTER TABLE backups ADD COLUMN daily_at INTEGER;
