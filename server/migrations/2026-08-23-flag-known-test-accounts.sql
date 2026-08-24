-- Flag the 47 known test accounts, 2026-08-23. DRAFTED, NOT YET APPLIED.
--
-- REVERSIBLE ON PURPOSE. Tom's words (docs/FEEDBACK-2026-08-22-v424.md item 6):
-- "find a more eloquent solution to this than just leaving a mess of dead bots
-- in the actual game". He complained about CLUTTER, not about rows existing, so
-- nothing here deletes anything. These 47 rows stay in the database and become
-- invisible to every public surface instead.
--
-- The list is exactly the "certain" bucket of docs/BOT-CENSUS-2026-08-22.md and
-- exactly the table in docs/BOT-PURGE-LIST-2026-08-22.md (47 ids, verified
-- identical as sets). Every account that might be a bounced human stayed off it.
-- The drafted DELETE in the purge doc remains DRAFTED and is Tom's call alone.
--
-- ORDER: 2026-08-22-test-accounts.sql (which adds the column) runs FIRST, then
-- this, then the worker deploy. See docs/SERVER-DEPLOY-PENDING.md.
--
--   npx wrangler d1 execute bonez --remote --file=migrations/2026-08-23-flag-known-test-accounts.sql
--
-- TO UNDO, in full, at any time (this is the whole point of flagging):
--   UPDATE players SET is_test = 0 WHERE is_test = 1;
-- To un-flag ONE account (say Tom decides a row was a real player after all):
--   UPDATE players SET is_test = 0 WHERE id = '<id>';
-- To flag a stray one that slips through later, no census required:
--   UPDATE players SET is_test = 1 WHERE id = '<id>';
--
-- Idempotent: re-running sets the same rows to the same value.
UPDATE players SET is_test = 1 WHERE id IN (
  '19bf05f5-7d65-4802-9020-b4787714e411', -- Snarling Talus, registered 2026-08-11 01:18 UTC
  '71faae25-a441-40f4-9c78-bcc9dec1d0d4', -- Jagged Jawbone, registered 2026-08-11 01:18 UTC
  '15da7219-7a97-4209-8a16-0525f182f429', -- Rugged Rex, registered 2026-08-11 01:19 UTC
  'fe41f74f-8bc5-430e-b5ea-9d4b6788e3f5', -- Electric Tibia, registered 2026-08-11 01:19 UTC
  '7f66e520-2d67-4316-9d49-3d6f7380fd92', -- Sturdy Skeleton, registered 2026-08-11 01:20 UTC
  'e9fbab04-918b-42c8-9447-bb34e1556684', -- Withered Scapula, registered 2026-08-11 01:20 UTC
  'ca6eaa50-7c2e-4692-802c-ae9a1e1fae9a', -- Crooked Gremlin, registered 2026-08-11 01:20 UTC
  '7bec28ba-dbc5-4fc8-9d6f-3bf9ab3f9c53', -- Blazing Crusher, registered 2026-08-11 01:21 UTC
  '63de01a8-dd64-46b4-abbf-2441e961969c', -- Silent Mandible, registered 2026-08-11 01:21 UTC
  'd80ec259-cd06-47f8-94ed-7a45cee8e629', -- Rotten Ossuary, registered 2026-08-15 01:20 UTC
  'bebc3560-d999-46b2-8702-62ce9c4f2e51', -- Marrow Coccyx, registered 2026-08-15 01:21 UTC
  '283b8969-1e06-415b-b6a6-8224b83676d2', -- Stormy Banshee, registered 2026-08-15 01:28 UTC
  '519abc0d-9d1e-443d-ac57-71090ff24982', -- Venomous Hustle, registered 2026-08-15 01:29 UTC
  '3072340a-fdfd-43af-bb80-680f76c5d529', -- Swole Boneyard, registered 2026-08-15 01:29 UTC
  '0727b84e-43b7-40ec-8aea-2aac2ecd0f95', -- Spectral Demon, registered 2026-08-15 01:43 UTC
  'bcfc0d62-5529-4596-b9c7-36661240d54c', -- Snarling Talus, registered 2026-08-15 02:05 UTC
  'c6b2077c-66be-4bde-8aa7-80c057cca87d', -- Thunderous Mauler, registered 2026-08-15 02:11 UTC
  '662117b0-d936-484d-a95f-6f4357d8e00b', -- Chrome Reaper, registered 2026-08-18 01:16 UTC
  '2ef743c2-cea3-43af-80f2-f330d5b6e81c', -- Swift Casket, registered 2026-08-18 01:18 UTC
  '395e90f6-819a-4112-b05f-83522bc7f035', -- Rotten Rex, registered 2026-08-18 01:19 UTC
  '848c5d08-cf98-4c84-8590-441d2750435e', -- Chiseled Brute, registered 2026-08-18 01:20 UTC
  '7f1339e0-3682-48c0-8edd-2757fb63c542', -- Toxic Jawbone, registered 2026-08-18 01:28 UTC
  'bda9bf73-d873-4f25-b981-03065f81abd2', -- Howling Goblin, registered 2026-08-18 01:36 UTC
  '9c842026-56b2-4fb5-afe4-f707750f659c', -- Hollow Basher, registered 2026-08-18 01:37 UTC
  'aa98b574-6c2c-4cab-9e95-7ad792364d60', -- Hollow Crusher, registered 2026-08-21 01:23 UTC
  '1e3ca4a9-2410-4f40-9836-c6f0d4e880f8', -- Hollow Goblin, registered 2026-08-21 01:37 UTC
  '6024b0a5-637c-408c-a024-11091398a25f', -- Chrome Titan, registered 2026-08-21 01:38 UTC
  '4a41828d-7024-43f8-829f-b77d68611491', -- Bony Spine, registered 2026-08-21 01:45 UTC
  '71b8b5f7-3069-40e2-8b54-96f550cd94aa', -- Feisty Mandible, registered 2026-08-20 18:43 UTC
  'f091621c-f38c-4726-96c5-bb75c0f09946', -- Hollow Coccyx, registered 2026-08-20 18:43 UTC
  '3aa77386-fb0a-42ec-899f-3e658cc05e33', -- Brutal Reaper, registered 2026-08-20 18:44 UTC
  '565a678a-4a47-4eec-946b-a74ee056811c', -- Fresh Fang, registered 2026-08-20 18:44 UTC
  '8c6d3579-2818-4ffd-b7e5-21ac213baa93', -- Nocturnal Clavicle, registered 2026-08-20 18:44 UTC
  '2a84ece1-f145-4937-bb36-80a396362d55', -- Vile Patella, registered 2026-08-20 18:46 UTC
  '8bf498e3-6d0f-4401-82da-a209e95af93c', -- Frozen Tusk, registered 2026-08-20 18:46 UTC
  '6246ca35-472a-4e30-9337-d719a1d95486', -- Rusty Ravager, registered 2026-08-20 18:46 UTC
  '198d9920-5334-4ce0-9942-f120ff073919', -- Phantom Knuckles, registered 2026-08-20 18:46 UTC
  '5afe0ca6-1bcc-435f-ac6e-e573042e3176', -- Chrome Ribcage, registered 2026-08-20 18:47 UTC
  '71e551d8-1795-4354-b2d3-ee2f335c389a', -- Ironclad Wraith, registered 2026-08-20 18:47 UTC
  '12814fce-331d-4e1e-a1d9-348cdfafd203', -- Massive Gargoyle, registered 2026-08-20 18:48 UTC
  '3f733e6c-639e-471a-ba83-ccb4673a2713', -- Electric Golem, registered 2026-08-20 18:49 UTC
  '7a4b3dda-1f0c-4e90-93ca-fb985daa5e38', -- Grisly Revenant, registered 2026-08-20 18:49 UTC
  '4f31f2dc-8916-4e7b-b2ea-966ab1406208', -- Grave Specter, registered 2026-08-20 18:50 UTC
  '6da369d2-577a-46d7-88c6-27a3852151d9', -- Vile Kneecap, registered 2026-08-20 18:50 UTC
  'c2919d84-68f5-43c9-9748-addae19ec260', -- Fresh Ribcage, registered 2026-08-20 18:50 UTC
  '66ea9c4f-09a2-43d3-a1c0-0f60e1201df8', -- Jolly Wrecker, registered 2026-08-20 18:50 UTC
  'be736987-a861-4a86-8c16-03c956a04e51' -- Rusty Stomper, registered 2026-08-20 18:56 UTC
);

-- Expect: 47 rows written. Verify with
--   SELECT COUNT(*) FROM players WHERE is_test = 1;            -- 47
--   SELECT COUNT(*) FROM players WHERE COALESCE(is_test,0) = 0; -- 40 (19 maybes + 21 real)
