-- Survey v2: the leads row stops being one column per question.
--
-- `leads` was shaped for the v1 Day One survey: name/email/feedback/
-- most_wanted/features, one fixed column per question (schema.sql, the leads
-- table). That shape costs a migration EVERY time the survey changes a
-- question, which is what made survey v2 a schema ticket at all. Three columns
-- fix it for good:
--
--   form     which survey produced this row. NULL on every existing row, and
--            NULL reads as v1 ('dayone'); POST /survey defaults absent to
--            'dayone' so a client that predates v2 keeps inserting v1 rows.
--            The dashboard filters on it so v1 and v2 never average together.
--   answers  JSON object, the answers themselves, capped at 4000 chars by the
--            route. Refused with 400 over the cap rather than truncated: a
--            truncated JSON blob is unparseable garbage in the table forever.
--   ctx      JSON object, the silent context (days installed, level, streak,
--            build, platform), capped at 1000 chars the same way. Without it a
--            day-three answer and a day-thirty answer are the same row.
--
-- ORDER MATTERS, and getting it wrong 500s the route: apply this to production
-- D1 BEFORE deploying a Worker that reads these columns, same landmine as every
-- other migration here (deploy.sh does not run migrations).
--
--   npx wrangler d1 execute bonez --remote --file=migrations/2026-09-03-survey-v2.sql
--
-- Re-running it aborts on the first ADD COLUMN (SQLite has no IF NOT EXISTS for
-- columns); that is fine, there is nothing after the ALTERs to be skipped.
ALTER TABLE leads ADD COLUMN form TEXT;
ALTER TABLE leads ADD COLUMN answers TEXT;
ALTER TABLE leads ADD COLUMN ctx TEXT;
