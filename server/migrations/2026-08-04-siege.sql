-- Dark Spires Phase 3, increment 2: sieges.
--
-- ADDITIVE ONLY. Three ADD COLUMNs, nothing renamed, nothing dropped, no data
-- rewritten. Every existing row keeps working: siege_until NULL means "no siege",
-- which is the state every current tower is already in.
--
-- Apply local:  npx wrangler d1 execute bonez --local  --file=migrations/2026-08-04-siege.sql
-- Apply remote: npx wrangler d1 execute bonez --remote --file=migrations/2026-08-04-siege.sql
--
-- siege_until: ms epoch when the 48h window closes. NULL = not besieged.
--              Absolute, so the client never has authority over the clock.
-- siege_name:  the NPC laying siege, so the owner AND any rival see the same name.
-- siege_last:  on players, the weekly limiter. One siege per player per 7 days.
ALTER TABLE spires ADD COLUMN siege_until INTEGER;
ALTER TABLE spires ADD COLUMN siege_name TEXT;
ALTER TABLE players ADD COLUMN siege_last INTEGER;
