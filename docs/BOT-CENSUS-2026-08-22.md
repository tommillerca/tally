# Bot / test-account census, 2026-08-22

Read-only census of the production D1 database `bonez` (all queries were
`SELECT`; nothing was written, updated, deleted, migrated or deployed).
Snapshot taken 2026-08-22 via `wrangler d1 execute bonez --remote`.

## Headline

- **87** player rows total. **38** have never synced a profile snapshot; **70** never picked a name.
- **47 are certain test accounts** (bucketed below, recommended for purge; the exact list is `docs/BOT-PURGE-LIST-2026-08-22.md`).
- **19 are maybes**: probably bounced humans or slow-pattern test runs. NOT on the purge list; a real day-one player must never be purged.
- **21 look like real players** (named, levelled, befriended, recovery-phrase set, or returned on later days).
- Zero rows in `trades` and `pvp_fights`; 20 spires, all owned by real actives; none of the suspects owns a spire, has a friend, or holds a non-welcome grant.

`grants*` below = grants excluding the automatic `social-welcome` row every registration gets.

## What each signal means

- **profile NULL** ("lvl -"): the account registered but never synced a game snapshot. Only a direct `/register` call (or a bounced pre-v279 install) produces this. Already invisible on the leaderboard (`WHERE profile IS NOT NULL`).
- **level-1 + backup + zero social**: the full client onboarding flow ran once (goOnline -> syncProfile -> pushBackup) and the account was never touched again. These DO show on the leaderboard and in the Crew "New Boneheadz" card, which is exactly the mess Tom is seeing.
- **name / recovery / friends / non-welcome grants / return visits**: all require a human doing things; any of them moves an account out of the purge bucket.

## Certain test accounts (47)

Every row here: created inside a tight burst during a documented dev/test
session, no name, zero friendships, zero non-welcome grants, no recovery
phrase, no spires, and (register-only rows) last_seen == created_at.

### 2026-08-11 01:18-01:21 UTC register-only burst (9 in 3 min)

| id | handle | name | created (UTC) | last seen (UTC) | lvl | friends | grants* | backup | recovery |
|---|---|---|---|---|---|---|---|---|---|
| `19bf05f5-7d65-4802-9020-b4787714e411` | Snarling Talus | - | 2026-08-11 01:18 | 2026-08-11 01:18 | - | 0 | 0 | 0 | 0 |
| `71faae25-a441-40f4-9c78-bcc9dec1d0d4` | Jagged Jawbone | - | 2026-08-11 01:18 | 2026-08-11 01:18 | - | 0 | 0 | 0 | 0 |
| `15da7219-7a97-4209-8a16-0525f182f429` | Rugged Rex | - | 2026-08-11 01:19 | 2026-08-11 01:19 | - | 0 | 0 | 0 | 0 |
| `fe41f74f-8bc5-430e-b5ea-9d4b6788e3f5` | Electric Tibia | - | 2026-08-11 01:19 | 2026-08-11 01:19 | - | 0 | 0 | 0 | 0 |
| `7f66e520-2d67-4316-9d49-3d6f7380fd92` | Sturdy Skeleton | - | 2026-08-11 01:20 | 2026-08-11 01:20 | - | 0 | 0 | 0 | 0 |
| `e9fbab04-918b-42c8-9447-bb34e1556684` | Withered Scapula | - | 2026-08-11 01:20 | 2026-08-11 01:20 | - | 0 | 0 | 0 | 0 |
| `ca6eaa50-7c2e-4692-802c-ae9a1e1fae9a` | Crooked Gremlin | - | 2026-08-11 01:20 | 2026-08-11 01:20 | - | 0 | 0 | 0 | 0 |
| `7bec28ba-dbc5-4fc8-9d6f-3bf9ab3f9c53` | Blazing Crusher | - | 2026-08-11 01:21 | 2026-08-11 01:21 | - | 0 | 0 | 0 | 0 |
| `63de01a8-dd64-46b4-abbf-2441e961969c` | Silent Mandible | - | 2026-08-11 01:21 | 2026-08-11 01:21 | - | 0 | 0 | 0 | 0 |

### 2026-08-15 01:20-02:11 UTC register-only burst (8)

| id | handle | name | created (UTC) | last seen (UTC) | lvl | friends | grants* | backup | recovery |
|---|---|---|---|---|---|---|---|---|---|
| `d80ec259-cd06-47f8-94ed-7a45cee8e629` | Rotten Ossuary | - | 2026-08-15 01:20 | 2026-08-15 01:20 | - | 0 | 0 | 0 | 0 |
| `bebc3560-d999-46b2-8702-62ce9c4f2e51` | Marrow Coccyx | - | 2026-08-15 01:21 | 2026-08-15 01:21 | - | 0 | 0 | 0 | 0 |
| `283b8969-1e06-415b-b6a6-8224b83676d2` | Stormy Banshee | - | 2026-08-15 01:28 | 2026-08-15 01:28 | - | 0 | 0 | 0 | 0 |
| `519abc0d-9d1e-443d-ac57-71090ff24982` | Venomous Hustle | - | 2026-08-15 01:29 | 2026-08-15 01:29 | - | 0 | 0 | 0 | 0 |
| `3072340a-fdfd-43af-bb80-680f76c5d529` | Swole Boneyard | - | 2026-08-15 01:29 | 2026-08-15 01:29 | - | 0 | 0 | 0 | 0 |
| `0727b84e-43b7-40ec-8aea-2aac2ecd0f95` | Spectral Demon | - | 2026-08-15 01:43 | 2026-08-15 01:43 | - | 0 | 0 | 0 | 0 |
| `bcfc0d62-5529-4596-b9c7-36661240d54c` | Snarling Talus | - | 2026-08-15 02:05 | 2026-08-15 02:05 | - | 0 | 0 | 0 | 0 |
| `c6b2077c-66be-4bde-8aa7-80c057cca87d` | Thunderous Mauler | - | 2026-08-15 02:11 | 2026-08-15 02:11 | - | 0 | 0 | 0 | 0 |

### 2026-08-18 01:16-01:37 UTC register-only burst (7)

| id | handle | name | created (UTC) | last seen (UTC) | lvl | friends | grants* | backup | recovery |
|---|---|---|---|---|---|---|---|---|---|
| `662117b0-d936-484d-a95f-6f4357d8e00b` | Chrome Reaper | - | 2026-08-18 01:16 | 2026-08-18 01:16 | - | 0 | 0 | 0 | 0 |
| `2ef743c2-cea3-43af-80f2-f330d5b6e81c` | Swift Casket | - | 2026-08-18 01:18 | 2026-08-18 01:18 | - | 0 | 0 | 0 | 0 |
| `395e90f6-819a-4112-b05f-83522bc7f035` | Rotten Rex | - | 2026-08-18 01:19 | 2026-08-18 01:19 | - | 0 | 0 | 0 | 0 |
| `848c5d08-cf98-4c84-8590-441d2750435e` | Chiseled Brute | - | 2026-08-18 01:20 | 2026-08-18 01:20 | - | 0 | 0 | 0 | 0 |
| `7f1339e0-3682-48c0-8edd-2757fb63c542` | Toxic Jawbone | - | 2026-08-18 01:28 | 2026-08-18 01:28 | - | 0 | 0 | 0 | 0 |
| `bda9bf73-d873-4f25-b981-03065f81abd2` | Howling Goblin | - | 2026-08-18 01:36 | 2026-08-18 01:36 | - | 0 | 0 | 0 | 0 |
| `9c842026-56b2-4fb5-afe4-f707750f659c` | Hollow Basher | - | 2026-08-18 01:37 | 2026-08-18 01:37 | - | 0 | 0 | 0 | 0 |

### 2026-08-21 01:23-01:45 UTC register-only burst (4)

| id | handle | name | created (UTC) | last seen (UTC) | lvl | friends | grants* | backup | recovery |
|---|---|---|---|---|---|---|---|---|---|
| `aa98b574-6c2c-4cab-9e95-7ad792364d60` | Hollow Crusher | - | 2026-08-21 01:23 | 2026-08-21 01:23 | - | 0 | 0 | 0 | 0 |
| `1e3ca4a9-2410-4f40-9836-c6f0d4e880f8` | Hollow Goblin | - | 2026-08-21 01:37 | 2026-08-21 01:37 | - | 0 | 0 | 0 | 0 |
| `6024b0a5-637c-408c-a024-11091398a25f` | Chrome Titan | - | 2026-08-21 01:38 | 2026-08-21 01:38 | - | 0 | 0 | 0 | 0 |
| `4a41828d-7024-43f8-829f-b77d68611491` | Bony Spine | - | 2026-08-21 01:45 | 2026-08-21 01:45 | - | 0 | 0 | 0 | 0 |

### 2026-08-20 18:43-18:56 UTC full-onboarding burst (19 level-1 accounts in 13 min, during the iOS build 19 / Android 10 / v414 release train)

| id | handle | name | created (UTC) | last seen (UTC) | lvl | friends | grants* | backup | recovery |
|---|---|---|---|---|---|---|---|---|---|
| `71b8b5f7-3069-40e2-8b54-96f550cd94aa` | Feisty Mandible | - | 2026-08-20 18:43 | 2026-08-20 18:43 | 1 | 0 | 0 | 1 | 0 |
| `f091621c-f38c-4726-96c5-bb75c0f09946` | Hollow Coccyx | - | 2026-08-20 18:43 | 2026-08-20 18:49 | 1 | 0 | 0 | 1 | 0 |
| `3aa77386-fb0a-42ec-899f-3e658cc05e33` | Brutal Reaper | - | 2026-08-20 18:44 | 2026-08-20 18:47 | 1 | 0 | 0 | 1 | 0 |
| `565a678a-4a47-4eec-946b-a74ee056811c` | Fresh Fang | - | 2026-08-20 18:44 | 2026-08-20 18:44 | 1 | 0 | 0 | 1 | 0 |
| `8c6d3579-2818-4ffd-b7e5-21ac213baa93` | Nocturnal Clavicle | - | 2026-08-20 18:44 | 2026-08-20 18:46 | 1 | 0 | 0 | 1 | 0 |
| `2a84ece1-f145-4937-bb36-80a396362d55` | Vile Patella | - | 2026-08-20 18:46 | 2026-08-20 18:47 | 1 | 0 | 0 | 1 | 0 |
| `8bf498e3-6d0f-4401-82da-a209e95af93c` | Frozen Tusk | - | 2026-08-20 18:46 | 2026-08-20 18:46 | 1 | 0 | 0 | 1 | 0 |
| `6246ca35-472a-4e30-9337-d719a1d95486` | Rusty Ravager | - | 2026-08-20 18:46 | 2026-08-20 18:48 | 1 | 0 | 0 | 1 | 0 |
| `198d9920-5334-4ce0-9942-f120ff073919` | Phantom Knuckles | - | 2026-08-20 18:46 | 2026-08-20 18:47 | 1 | 0 | 0 | 1 | 0 |
| `5afe0ca6-1bcc-435f-ac6e-e573042e3176` | Chrome Ribcage | - | 2026-08-20 18:47 | 2026-08-20 18:49 | 1 | 0 | 0 | 1 | 0 |
| `71e551d8-1795-4354-b2d3-ee2f335c389a` | Ironclad Wraith | - | 2026-08-20 18:47 | 2026-08-20 18:48 | 1 | 0 | 0 | 1 | 0 |
| `12814fce-331d-4e1e-a1d9-348cdfafd203` | Massive Gargoyle | - | 2026-08-20 18:48 | 2026-08-20 18:49 | 1 | 0 | 0 | 1 | 0 |
| `3f733e6c-639e-471a-ba83-ccb4673a2713` | Electric Golem | - | 2026-08-20 18:49 | 2026-08-20 18:50 | 1 | 0 | 0 | 1 | 0 |
| `7a4b3dda-1f0c-4e90-93ca-fb985daa5e38` | Grisly Revenant | - | 2026-08-20 18:49 | 2026-08-20 18:50 | 1 | 0 | 0 | 1 | 0 |
| `4f31f2dc-8916-4e7b-b2ea-966ab1406208` | Grave Specter | - | 2026-08-20 18:50 | 2026-08-20 18:50 | 1 | 0 | 0 | 1 | 0 |
| `6da369d2-577a-46d7-88c6-27a3852151d9` | Vile Kneecap | - | 2026-08-20 18:50 | 2026-08-20 18:50 | 1 | 0 | 0 | 1 | 0 |
| `c2919d84-68f5-43c9-9748-addae19ec260` | Fresh Ribcage | - | 2026-08-20 18:50 | 2026-08-20 18:50 | 1 | 0 | 0 | 1 | 0 |
| `66ea9c4f-09a2-43d3-a1c0-0f60e1201df8` | Jolly Wrecker | - | 2026-08-20 18:50 | 2026-08-20 18:51 | 1 | 0 | 0 | 1 | 0 |
| `be736987-a861-4a86-8c16-03c956a04e51` | Rusty Stomper | - | 2026-08-20 18:56 | 2026-08-20 19:11 | 1 | 0 | 0 | 1 | 0 |

### Audited before flagging, 2026-08-23

The list was re-checked against the buckets rather than taken on trust: 47 + 19
+ 21 = 87, the three buckets are disjoint, and the purge table and the drafted
DELETE contain the same 47 ids as sets. Two observations worth Tom's eye:

- **28 of the 47 were never visible in the first place.** They have a NULL
  profile, and `/leaderboard` has always required `profile IS NOT NULL`. They
  cannot be what Tom is looking at. Flagging them costs nothing and makes the
  set coherent, but the accounts he actually sees are the 19 from 2026-08-20.
- **`be736987` (Rusty Stomper, 18:56) is the weakest row on the list.** It sits
  on the last minute of the burst window, and a REAL player (`cbf6cf65`, Blazing
  Golem: two friends, recovery phrase, returned the next day) registered at
  18:57, one minute later. So a human genuinely was installing in that window.
  `be736987` has no name, no friends, no grants, no recovery phrase and has not
  been seen since 19:11 on the day it was created, which is why it stayed on
  the list. Under the DELETE plan that call would have been worth arguing about.
  Under flagging it costs one UPDATE to reverse, which is precisely why the
  reversible version is the one that shipped.

## Maybes: possibly real players who bounced (19): NOT recommended for purge

### 2026-08-07 (v279 test day): level-1, zero social, never named, but created singly over ~100 min, not machine-gun

| id | handle | name | created (UTC) | last seen (UTC) | lvl | friends | grants* | backup | recovery |
|---|---|---|---|---|---|---|---|---|---|
| `b33e3d4c-2ad3-4db3-a492-32c11415a6ec` | Grisly Boneyard | - | 2026-08-07 17:38 | 2026-08-07 17:38 | 1 | 0 | 0 | 1 | 0 |
| `d3970566-410b-4abf-b583-bc83e6ea33b4` | Obsidian Tibia | - | 2026-08-07 17:47 | 2026-08-07 17:47 | 1 | 0 | 0 | 1 | 0 |
| `012f6513-deea-48b9-8396-3d83af34f56f` | Vile Ravager | - | 2026-08-07 18:44 | 2026-08-07 19:21 | 1 | 0 | 0 | 1 | 0 |

### 2026-08-07, but RETURNED 2026-08-21 (passes the app's own evidence-of-play bar)

| id | handle | name | created (UTC) | last seen (UTC) | lvl | friends | grants* | backup | recovery |
|---|---|---|---|---|---|---|---|---|---|
| `01ac8e7b-baf8-4dfc-966a-72fec60c08be` | Reckless Reaper | - | 2026-08-07 17:04 | 2026-08-21 13:21 | 1 | 0 | 0 | 1 | 0 |

### 2026-08-20 18:24 UTC: identical shape to the burst that starts 19 min later, but outside it

| id | handle | name | created (UTC) | last seen (UTC) | lvl | friends | grants* | backup | recovery |
|---|---|---|---|---|---|---|---|---|---|
| `d54b3d4d-3d1b-4974-8984-2208ce4e60d5` | Ghastly Tibia | - | 2026-08-20 18:24 | 2026-08-20 18:24 | 1 | 0 | 0 | 1 | 0 |

### 2026-08-21 13:39/13:44 UTC pair during the morning release-gate window; two friends installing together looks the same

| id | handle | name | created (UTC) | last seen (UTC) | lvl | friends | grants* | backup | recovery |
|---|---|---|---|---|---|---|---|---|---|
| `e936a7f6-df56-4eee-8219-e754485b4193` | Gloomy Ravager | - | 2026-08-21 13:39 | 2026-08-21 13:39 | 1 | 0 | 0 | 1 | 0 |
| `9eccbec8-93c0-46c7-9667-8b959e606bcf` | Ironclad Hyoid | - | 2026-08-21 13:44 | 2026-08-21 14:00 | 1 | 0 | 0 | 1 | 0 |

### one-minute singleton installs, level 1, zero social; likely bounced humans

| id | handle | name | created (UTC) | last seen (UTC) | lvl | friends | grants* | backup | recovery |
|---|---|---|---|---|---|---|---|---|---|
| `403bebaf-c0f3-42e0-8d12-95d3b19b6372` | Hollow Scapula | - | 2026-08-16 05:14 | 2026-08-16 05:15 | 1 | 0 | 0 | 1 | 0 |
| `7dfb3b00-1c67-4865-885b-115e5dd42e7a` | Hollow Wraith | - | 2026-08-14 21:36 | 2026-08-16 15:20 | 1 | 0 | 0 | 1 | 0 |

### pre-v279 register-only ghosts (bootSync registered every bounced install until v279); real humans, never played; already hidden from the leaderboard by `profile IS NOT NULL`

| id | handle | name | created (UTC) | last seen (UTC) | lvl | friends | grants* | backup | recovery |
|---|---|---|---|---|---|---|---|---|---|
| `718c30c2-3a3c-4e15-8367-01cdc97f84d5` | Molten Banshee | - | 2026-07-20 21:44 | 2026-07-20 21:44 | - | 1 | 0 | 0 | 0 |
| `7af29530-3fc6-4b02-b421-ce0ce78f5648` | Jolly Fiend | - | 2026-07-21 04:04 | 2026-07-21 04:04 | - | 3 | 5 | 0 | 0 |
| `c4f8f6e7-4009-4b85-92da-160153ac324d` | Spectral Fang | - | 2026-07-30 09:49 | 2026-07-30 09:49 | - | 1 | 0 | 0 | 0 |
| `ad7787ab-87d2-4a09-9207-39c9a5ac791e` | Grave Molar | - | 2026-07-30 18:21 | 2026-07-30 18:21 | - | 5 | 13 | 0 | 0 |
| `8cb6be17-a99b-4f50-a4a6-45670d8b591a` | Spectral Wight | - | 2026-07-31 11:07 | 2026-07-31 11:07 | - | 2 | 0 | 0 | 0 |
| `16815f29-4662-499d-8214-1b79760e3f02` | Phantom Tibia | - | 2026-07-31 11:56 | 2026-07-31 11:56 | - | 3 | 9 | 0 | 0 |
| `bf57864b-83d0-4060-b213-5184bc86d27d` | Chrome Gremlin | - | 2026-07-31 23:40 | 2026-07-31 23:40 | - | 1 | 0 | 0 | 0 |
| `8e297a47-4332-4ca6-aefa-e7ecf4d4048d` | Wretched Fibula | - | 2026-08-01 21:36 | 2026-08-01 21:36 | - | 2 | 0 | 0 | 0 |
| `745cb9eb-ef61-44c7-a4ec-3cf3984a2917` | Ragged Jawbone | - | 2026-08-02 17:53 | 2026-08-02 17:53 | - | 2 | 0 | 1 | 0 |
| `85b05bc8-bc3b-41e8-88e8-59a68ace1f92` | Ragged Claw | - | 2026-08-03 14:59 | 2026-08-03 14:59 | - | 1 | 0 | 0 | 0 |

## Real players (21): untouchable

| id | handle | name | created (UTC) | last seen (UTC) | lvl | friends | grants* | backup | recovery |
|---|---|---|---|---|---|---|---|---|---|
| `8481aa73-9111-4043-99e6-81e96061602e` | Toxic Smasher | Bony Wrecker | 2026-08-03 04:28 | 2026-08-22 13:05 | 115 | 8 | 53 | 1 | 1 |
| `bfe95fec-8b95-47a2-8517-b78ed97935a6` | Phantom Hyoid | Massive Horn | 2026-08-07 04:40 | 2026-08-22 05:23 | 113 | 6 | 38 | 1 | 1 |
| `8cc78c8c-3001-450d-80ea-25913df0b4a7` | Grim Scapula | Withered Lich | 2026-07-07 02:32 | 2026-08-21 23:43 | 53 | 15 | 66 | 1 | 1 |
| `29de723f-6d1a-4933-9ca0-628efca94230` | Rugged Talon | Feisty Fang | 2026-07-22 05:34 | 2026-08-22 14:53 | 51 | 13 | 51 | 1 | 1 |
| `af587f91-213d-4aa5-ba95-cc385eb24516` | Creaky Lich | Chiseled Goblin | 2026-07-26 23:07 | 2026-08-22 15:17 | 51 | 17 | 66 | 1 | 1 |
| `4b597afd-ed48-445b-8882-48a4232a49b0` | Chiseled Patella | - | 2026-08-05 04:25 | 2026-08-20 21:58 | 39 | 7 | 44 | 1 | 1 |
| `7b6f12c4-ae45-4c1a-afb5-01d8a1ff4425` | Vile Hyoid | Savage Coccyx | 2026-08-03 16:27 | 2026-08-20 22:01 | 36 | 7 | 52 | 1 | 1 |
| `d786c8c9-a412-4959-a73c-8b003dbe489b` | Wretched Slugger | Fresh Pelvis | 2026-07-21 01:27 | 2026-08-22 05:30 | 28 | 15 | 65 | 1 | 1 |
| `ab702010-0a80-4bd0-9aa2-e88922b5251e` | Grinning Smasher | Massive Phalange | 2026-08-13 01:26 | 2026-08-22 15:19 | 27 | 3 | 22 | 1 | 1 |
| `f36813b9-e449-46a1-b30d-f9fa3df4a56f` | Cursed Crusher | Chrome Horn #8 | 2026-07-07 23:09 | 2026-08-22 00:52 | 16 | 8 | 67 | 1 | 1 |
| `fc45462c-6335-478b-b5d6-f45abe9cb02e` | Electric Ossuary | Massive Coccyx | 2026-07-21 01:22 | 2026-08-17 20:03 | 14 | 6 | 38 | 1 | 0 |
| `99b8c7ad-4051-4144-adba-7121fa777315` | Dusty Nightmare | Dusty Boneyard #24 | 2026-08-15 03:16 | 2026-08-22 03:45 | 3 | 2 | 4 | 1 | 1 |
| `34c6db94-a796-4a0e-bbab-93753e761daa` | Spectral Patella | Twisted Casket | 2026-08-15 05:41 | 2026-08-17 17:45 | 3 | 3 | 9 | 1 | 1 |
| `02cc18af-7013-4780-9dcd-fdb54d069f0b` | Reckless Humerus | Hungry Bruiser | 2026-08-15 15:52 | 2026-08-16 01:26 | 3 | 3 | 1 | 1 | 0 |
| `faf9f368-1ebb-4187-aed8-62f2c6fe2b7d` | Thunderous Coffin | Silent Humerus | 2026-08-07 23:45 | 2026-08-11 23:33 | 2 | 3 | 20 | 1 | 0 |
| `cbf6cf65-0778-4b05-8fa2-e2032c07e004` | Blazing Golem | - | 2026-08-20 18:57 | 2026-08-21 17:17 | 2 | 2 | 0 | 1 | 1 |
| `4aa7be94-9a08-4b7e-9383-b0d1b28b8eb9` | Electric Smasher | Vile Coccyx | 2026-08-21 18:25 | 2026-08-22 03:45 | 2 | 3 | 0 | 1 | 1 |
| `dc05b92e-cbe1-411b-8b64-8a6743caaba4` | Lurking Wraith | Grisly Bruiser | 2026-08-08 02:15 | 2026-08-08 18:39 | 1 | 1 | 6 | 1 | 0 |
| `d5b9988a-976d-43f1-a5d4-6a5cd307298d` | Grim Mandible | Blazing Titan | 2026-08-13 05:48 | 2026-08-20 05:46 | 1 | 0 | 0 | 1 | 0 |
| `322da5dc-313c-496b-abdf-369290323159` | Mighty Ripper | - | 2026-08-13 14:04 | 2026-08-15 11:45 | 1 | 1 | 0 | 1 | 0 |
| `a12676ef-78c8-435a-8311-8e697b2472f5` | Iron Knuckles | - | 2026-08-17 16:21 | 2026-08-21 14:48 | 1 | 0 | 0 | 1 | 1 |

## Origin: where the bots came from (evidence, not vibes)

Two distinct mechanisms, both variants of "a test ran against production by default":

**1. The register-only night bursts (28 accounts: 08-11, 08-15, 08-18, 08-21, all ~01:20-02:10 UTC = ~21:20 previous evening EDT).**
These are bare `POST /register` calls: no profile, no backup, nothing else ever
signed. The only things in this repo that POST /register directly are the
server test suites (`server/recovery.test.mjs`, `security.test.mjs`,
`concurrency.test.mjs`, ...), which default to `http://127.0.0.1:8788` but take
`BASE=` to point anywhere. Each burst lands inside an evening dev session
(e.g. the 08-18 01:16-01:37 UTC burst = 21:16-21:37 EDT on 08-17, the evening
the v390-v394 release train and the gift double-pay server fix were being
verified). Register-only, 4-9 accounts each, gone in minutes: server-route
tests pointed at the deployed worker instead of a local one.

**2. The full-onboarding bursts (19+ level-1 accounts, worst on 08-20 18:43-18:56 UTC = 14:43-14:56 EDT, the exact window of the "iOS build 19" / "Android versionCode 10" / v414 commits at 14:44 EDT).**
These accounts ran the complete client flow: register + profile sync + backup
push, then silence. The client registers at onboarding completion
(js/app.js: `if (!(S.demo || navigator.webdriver === true)) social.goOnline()`),
and `js/social.js` defaults `apiBase` to the production worker
(`PROD_API = 'https://bonez-api.boneheadz.workers.dev'`) unless `?api=` is
passed. godmode audits are safe (they boot `?demo` under webdriver, which gates
goOnline off), but any environment where `navigator.webdriver` is false (the
iOS simulator / Android emulator during native build verification, and audits
that deliberately spoof `webdriver:false` to render the first-run flow) mints
one real production account per fresh install/boot unless it also overrides
`?api=`. 19 accounts in 13 minutes matches an automated loop, not thumbs.

Corroborating repo evidence: the v279 commit (2026-08-07) says registration was
moved to onboarding-completion precisely because boot-time registration "minted
one abandoned level-1 player per bounced install" (that mechanism produced the
10 pre-v279 ghosts in the maybe bucket); `tests/release-gate.mjs` documents that
suites reading no URL "booted godmode's default, https://tommillerca.github.io/tally/"
and "graded PRODUCTION"; and the newcomers card in js/app.js carries Tom's two
prior complaints about the same symptom (2026-08-08).

## Every public surface that enumerates players, and what hides a flag on it

Found two ways, and the two agree, which is why this list is believed complete.

**Server side**, by enumerating routes rather than trusting a list: `grep "if
(path ===\|if (path.startsWith" server/src/index.js` gives all 34 routes, and
`grep "players" server/src/index.js` gives every statement that touches the
table. Six routes read another player's identity. Everything else reads `me`,
an aggregate, or an admin view.

**Client side**, by sweeping js/ for anything that renders a name, avatar,
level or count belonging to someone else: 32 distinct surfaces (crew fan cards,
faves, request rows, the podium, the "you are #N of M" rung, the leaderboard
sheet, stranger profiles, the Worth-Adding card, deliveries, the race lanes and
the map race strip, the settled-race poster and its Today banner, the spire
pennants and tower sheet, PvP arena headers, gift and cheer pickers, grant
toasts and pushes, the crew badge). All 32 collapse onto those same six reads.
There is no seventh source: the client has no player list of its own.

| Endpoint | Client surfaces it feeds | How a flagged row is hidden |
|---|---|---|
| `GET /leaderboard` | podium, "#N of M", the 100-row sheet, stranger profiles, the "Worth adding" card, and the addTokens all of those carry | `AND COALESCE(is_test,0) = 0` in the board query |
| `GET /steps/week` | the race lanes, the collapsed standing, the map's race strip | `AND COALESCE(is_test,0) = 0` in the board query |
| `GET /steps/settled` | the results poster, the Today "X TOOK IT" banner | `AND COALESCE(p.is_test,0) = 0` on the joined player |
| `GET /friends` | crew cards, faves, the fan strip, request rows, profiles, friend PvP, gift and cheer pickers, the crew badge | no friendship can form: `requestFriendship` refuses when EITHER side is flagged, which is the one place a friendship row is ever written |
| `GET /spires?ids=` | map pennants, "Take X from Y", the tower sheet (which renders the holder's whole Bonehead), spire PvP | a flagged account is refused at CLAIM; a retroactively flagged owner is masked on the read (owner, ownerName and defender together) |
| `GET /grants?since=` | gift and cheer sender names, delivery popups, OS pushes | gift and cheer both require an ACCEPTED friendship, which the line above makes impossible |

Two corrections to what the brief for this work assumed:

- **There is no early-bird banner count.** `thanksBannerHtml` in js/app.js is
  static copy ("Thanks for being early") with no fetch and no number in it. The
  count sitting near it in the same tab is the leaderboard's "you are #N of M"
  rung, where M is `players.length` from `/leaderboard`, so it was already
  covered by the board filter.
- `/friends/request` (lookup by friend code) was already filtered, but that was
  only half the door: `/leaderboard` hands every caller an opaque addToken for
  every row, redeemed at `POST /friends/add`, so a flagged account could still
  push a pending request into a real player's Crew. That is why the guard moved
  into `requestFriendship`, where both routes meet.

Deliberately NOT filtered, each for a reason:

- `POST /name`: the unique-name index is global either way, so filtering here
  would only let a flagged account steal a name a real player then cannot use.
- `GET /recovery/<code>`: account recovery for your own account. It enumerates
  nobody.
- `GET /stats`, `GET /admin/players`: admin-token gated, never shown to players.

## What now stops it happening again

**Mechanism 1, the register-only night bursts (28 accounts).** Closed
mechanically. `server/test-flag.mjs` exports `flagFor(base)`, every suite binds
`IS_TEST = flagFor(BASE)`, and every registration passes `test: IS_TEST`. A
local run is unflagged and behaves exactly as before (the suites' own board and
race assertions need visible accounts); a run pointed anywhere else mints only
invisible ones. `tests/live-api-register-lint.mjs` fails the release gate if any
test registers without that binding, and it is proven red two ways: dropping the
flag from a call site, and defanging the binding to `const IS_TEST = false;`
while leaving the import in place.

**Mechanism 2, the full-onboarding burst (19 accounts, 2026-08-20).** This one
is a human procedure, not a script in this repo, and it is worth being honest
about the difference. As the tree stands today no audit can reach it: godmode's
`boot()` appends `?demo`, and `?demo` sets NOSOCIAL in js/app.js, so no
automated browser session registers at all. What remains is a native build
verified by hand in the iOS Simulator or Android emulator, where
`navigator.webdriver` is false and `js/social.js` defaults `apiBase` to the
production worker. A fresh install there still mints one real account.

Two things make that survivable rather than a census:
1. it is now ONE command to clean up, not an investigation:
   `UPDATE players SET is_test = 1 WHERE id = '<id>';` (the recipe is in the
   header of `migrations/2026-08-23-flag-known-test-accounts.sql`), and
2. a native verification run can boot the app at `?api=http://<your-ip>:8788`
   or `?demo`, either of which keeps it off production entirely.

A client-side flag keyed on `?calm` (the existing device-check switch) was
considered and NOT built: nothing in the repo shows the runs that minted those
19 accounts passing `?calm`, so it would have been a guess dressed up as a
guard.

## The fix as it now stands (drafted, NOT applied, NOT deployed)

**Nothing is deleted.** The 47 stay in the database and become invisible. That
is the whole difference between this and the purge list, and it is the reason
`docs/BOT-PURGE-LIST-2026-08-22.md` now carries a superseded banner.

1. `server/migrations/2026-08-22-test-accounts.sql`: adds `players.is_test`
   (INTEGER DEFAULT 0). Apply BEFORE deploying the filtered worker.
2. `server/migrations/2026-08-23-flag-known-test-accounts.sql`: sets
   `is_test = 1` on exactly the 47 ids above. Idempotent, and its header carries
   the one-line UPDATE that undoes it in full or for a single account.
3. `server/src/index.js`: `/register` accepts `{test:true}` and stamps
   `is_test = 1`; the six reads in the table above each hide a flagged row.
4. The standing rule is a lint, not a sentence: see "What now stops it
   happening again".

Both migrations were applied in order to a sqlite database built from
origin/main's `schema.sql` (which, like production, has no `is_test`): the
census bot came out flagged, Tom's account came out at 0, and running them in
the WRONG order fails loudly with `no such column: is_test` rather than
silently.

Deploy order and the verification commands live in
`docs/SERVER-DEPLOY-PENDING.md`, alongside the #77 deploy this rides with.

## Two side findings (flagged, untouched)

- Production `players` is MISSING the 2026-08-16 hardening columns
  (`max_level`, `max_level_at`, `week_key`, `week_steps`): the migration
  `server/migrations/2026-08-16-hardening.sql` was never applied remotely.
  Verified via `pragma_table_info('players')`. The worker code on main writes
  those columns in `/profile` PUT, so EITHER the deployed worker predates the
  hardening (the snapshot-bounds protection is not actually live) OR /profile
  would be 500ing. Needs its own session; nothing here touched it.
- The is_test migration inherits the same landmine: deploying the drafted
  filter code before applying the migration breaks the filtered routes.
  Migration first, deploy second (stated in the migration header).
