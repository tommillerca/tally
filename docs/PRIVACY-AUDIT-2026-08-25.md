# Privacy audit, 2026-08-25

What this is: every privacy claim the project makes, checked against the code in
this repo and against the live `bonez` D1 database, ahead of App Store
submission. Nothing here was verified against another document. Where a document
agrees with a document and neither agrees with the code, the code wins.

**This is not legal advice.** It reports whether the shipped documents match the
shipped behaviour. It does not judge whether any of it complies with the App
Store Review Guidelines, the HealthKit terms, Google Play's Health Connect
policy, GDPR, CCPA or anything else. Those calls are Tom's or a lawyer's.

Method: read `server/src/index.js`, `server/schema.sql`, `js/social.js`,
`js/analytics.js`, `js/app.js`, `js/spires.js`, `js/sources.js`, `js/pit.js`,
`native/ios/App/App/HealthPlugin.swift`, `native/ios/App/App/Info.plist`,
`native/android/app/src/main/AndroidManifest.xml`; then `SELECT` schema, counts
and aggregates against `bonez --remote`. No row of anyone's content was read or
is reproduced here. Nothing was written, altered or deployed. Worktree cut from
`origin/main` at `a5b1f4fe`.

The one thing the README does **not** say, because it was asserted repeatedly
elsewhere today and is worth killing: the strings "No accounts, no tracking, no
server" and "never stored or uploaded" appear **zero** times in `README.md`. The
second string does appear, verbatim, in `native/ios/App/App/Info.plist`, which is
finding F2 below.

---

## Part 1. What the server actually stores

Live schema and counts, `bonez --remote`, 2026-08-25. Fifteen tables (fourteen
plus `sqlite_sequence`; `_cf_KV` is Cloudflare's own and is not listed by
`sqlite_master`).

| Table | Rows | Personal or identifying content | Retention | Documented? |
|---|---|---|---|---|
| `players` | 51 | `pubkey` (device public key), `handle`, `name` (unique display name), `friend_code`, `profile` (**plaintext** game snapshot incl. `weekSteps`, `stats`, `pet`, `yard`), `week_steps`, `created_at`, `last_seen` | **None.** No pruner, no delete route. | Partly. `privacy.html` 54-63 describes the snapshot. `week_steps` is named there but mis-classified: see F3/F4. |
| `backups` | 33 | `blob` = base64(iv‖AES-GCM ct) of the **entire** save: food log, weigh-ins, health rows, sleep, resting HR, HRV. Opaque to the server. Plus `daily_blob` archive (0 rows populated yet), `size`, `updated_at` | **None.** Retained until overwritten; never deleted, including after opt-out or app deletion. | Yes for the blob (`privacy.html` 35-40). The daily archive slot is new (2026-08-25) and undocumented. |
| `recovery` | 16 | `wrapped` = AES-GCM(identity bundle **including the backup AES key**) under PBKDF2(user phrase, 1,000,000 iters), plus `salt`, `iters`, `recovery_id` | **None.** | No. The whole recovery mechanism is absent from `privacy.html`, and it is what makes F5 true. |
| `events` | 97,465 | `device` (random UUID), `name`, `props` (small JSON), `app_v`, `day`, `ts` | **30 days**, enforced. Live `MIN(day)` = 2026-07-26, `MAX(day)` = 2026-08-25, 31 distinct days, exactly the window. | Yes, as a category (`privacy.html` 65-70). Retention period stated nowhere. |
| `devices` | 165 | `device`, `label` (**Crew display name**, 158/165 populated), `country` (165), `region` (164), `city` (165, 80 distinct), `plat`, `first_seen`, `last_seen` | **None.** The pruner deliberately never touches it. | Yes (`privacy.html` 71-75). Retention not stated; the "coarse location" description is accurate. |
| `leads` | 17 | `name` (16), **`email` (7)**, `email_optin` (3), `feedback`, `most_wanted`, `features`, `label`, **`player` = the social player id (17/17)**, `geo` (17) | **None.** | Mostly (`privacy.html` 122-130). The `player` join is not disclosed. |
| `reports` | 15 | `lat`/`lng` rounded to 1e-5 (**~1.1 m**, 11/15 populated), `note` (14), `target`, `device`, `label` (15), `geo` (15) | **None.** | Yes (`privacy.html` 114-120), though the precision is not stated. |
| `spires` | 20 | `lat`/`lng` of the tower, `owner` = players.id (20), `owner_name`, `defender` (full plaintext profile snapshot), `claimed_at`, `tended_at`. 9 distinct owners. | **None.** No pruner. | Yes, and unusually well (`privacy.html` 92-107). |
| `grants` | 751 | `player_id`, `key`, `payload` (coins/xp/crate/note; step-race receipts carry a step count) | 90 days once acknowledged; 180 days dormant. Enforced. | No. Low sensitivity. |
| `friendships` | 80 | social graph: `a`, `b`, `status`, `requested_by` | **None.** | Implied by the friends feature; not spelled out. |
| `rate_limits` | 26 | `bucket` = HMAC-SHA256(secret, "kind:value") truncated to 12 bytes. **Raw IPs are never stored.** | Swept on expiry. | No, and it does not need to be. |
| `prune_runs` | 16 | Operational only: `ts`, `ms`, `cron`, `ok`, rows deleted, `err`. No user data. 16 ticks, all ok, 10,519 events deleted. | Trimmed to newest 2,000 ids. | No, and it does not need to be. |
| `trades` | 0 | (unused) | None | n/a |
| `pvp_fights` | 0 | (unused) | None | n/a |

Live schema matches `server/schema.sql` exactly, including
`backups.daily_blob/daily_size/daily_at`, so the 2026-08-25 migration is applied
in production. `players.is_test` is present and **0 rows are flagged** in
production.

**Retention summary: only three tables have any retention at all** (`events` 30
days, `grants` 90/180 days, `rate_limits` on expiry). Everything else, including
every table containing an email address, a coordinate, a display name or an
encrypted save, is kept forever with no deletion path.

---

## Part 2. Claim-by-claim

`P:` = `privacy.html`. `R:` = `README.md`. `T:` = `TESTFLIGHT.md`.
`PL:` = `native/PLAY-LAUNCH.md`. `I:` = `native/ios/App/App/Info.plist`.

### The health claims

| # | Claim | Where | Verdict | Evidence |
|---|---|---|---|---|
| F1 | "The app only reads this data (it never writes health records)" | P:44 | **TRUE** | `HealthPlugin.swift:185-189`: `#if DEBUG` the share set is `[stepsType, energyType]`, `#else` it is `[]`. Release builds request no write scope. Android manifest declares no `WRITE_*` health permission. |
| F2 | HealthKit data "uses it on-device, and never transmits it off your phone except inside your own end-to-end-encrypted backup if you have backup turned on" | P:44-46 | **FALSE** | `js/app.js:18533-18538` `weekStepsNow()` reads `db.all('health')` and sums `r.steps`. `js/app.js:18604` puts that sum in the profile snapshot as `weekSteps`. `js/social.js:583-585` `syncProfile` PUTs it unencrypted. `server/src/index.js:1549-1596` stores it in `players.profile` **and** `players.week_steps`. Live: 32/32 players with a profile carry a `weekSteps` value; 15 have one greater than zero. The `health` store is written by `ingestHealth` (`js/app.js:14757-14792`), whose payload comes from the HealthKit plugin. So HealthKit-derived step counts leave the phone in the clear, and the document's own next section says so. |
| F3 | The social snapshot includes "level, stats, talents, gear, outfit, pet, badges, and your weekly step count. That snapshot never includes your food entries, weight, or health data." | P:59-62 | **FALSE, and self-contradictory** | The weekly step count named in the first half **is** health data (HealthKit `stepCount`). Beyond that: `pet.level` (`js/app.js:18617`) is `petLevel(steps since hatch)`, roughly 3,000-step buckets. And `stats` (`js/app.js:18610`) traces to `deriveStats` at `js/pit.js:17-26`, where `power = 20 + proteinDays*2`, `marrow = 20 + streak*1.5 + closes*1.2`, `wind = 20 + sqrt(lifetimeSteps/1000)*4`, `hype = 20 + questsDone + variety*0.4`. The published value is `fighter.stats`, which is that base **plus gear and allocation** (`js/app.js:18269-18275`), so it is obscured and not directly invertible. The unobscured `habitStats` is deliberately not published. Verdict: "no food entries" and "no weight" are TRUE; "no health data" is FALSE. |
| F4 | Steps are published to other players | not claimed anywhere | **UNDISCLOSED** | `server/src/index.js:2302-2312` and 2364-2380: `GET /steps/week` returns the top 10 racers with `name` and exact `steps`, to any authenticated player. `GET /leaderboard` (2232-2256) returns `stats` and `pet` for the top 100. Neither `privacy.html` nor the README says a step count is shown to other people; both frame the snapshot as something friends read. Under Apple's rules this is HealthKit data disclosed to third parties (other users), which is the sharing case Apple scrutinises. |
| F5 | "reads your steps, active calories, and optionally weight" | P:41-43, I:32, PL:38 | **INCOMPLETE** | `HealthPlugin.swift:175-184` requests read access to a "full superset requested ONCE": stepCount, activeEnergyBurned, appleExerciseTime, appleStandTime, distanceWalkingRunning, distanceCycling, distanceSwimming, flightsClimbed, **heartRate, restingHeartRate, heartRateVariabilitySDNN, walkingHeartRateAverage, vo2Max, respiratoryRate, oxygenSaturation**, bodyMass, height, **bodyFatPercentage, leanBodyMass**, plus workoutType and sleepAnalysis. `AndroidManifest.xml:76-92` declares the same 17 read permissions. The app does read and store resting HR, HRV and staged sleep (`js/app.js:14758-14790`). The three documents name three of them. |
| F6 | Resting HR, HRV and sleep reach the server | not claimed | **They do not, except inside the encrypted blob** | They live in the `health` store, which is in `exportAll()` (`js/db.js:704`) and therefore inside the AES-GCM blob only. No plaintext route carries them. Scanned all 97,465 live `events.props`: zero hits on `kcal`, `kg`, `calorie`, `@`. The 8 `hrv` / 13 `sleep` / 42 `steps` / 39 `weight` hits are all screen names and quest ids (`feat_open`/`feat_time`/`quest_claim`), e.g. `q-sleep`, `q-steps11`, `w-steps`. So no health **value** is in analytics, but a completed `q-steps11` does tell the server that device had an 11,000-step day. That is a weak health-derived inference, and it sits under a claim that analytics "never include your food, weight, or health data" (P:69). Call it INCOMPLETE rather than false. |

### The encryption claims

| # | Claim | Where | Verdict | Evidence |
|---|---|---|---|---|
| F7 | "the server stores only unreadable data. We cannot see your food, weight, or health information." | P:38-40, R:41 | **TRUE** | `js/social.js:209-232`: `encryptBackup` does AES-GCM with a random 12-byte IV under a 256-bit key from `backupKey()` (`js/social.js:196-207`), which is generated with `crypto.subtle.generateKey` on-device and stored in kv `identity`. Server side, `PUT /backup` (`server/src/index.js:1600-1660`) treats `body.blob` as an opaque string, stores it, and reads only `.length`. No route decrypts, and no key material exists server-side to decrypt with. The `?slot=daily` archive is the same ciphertext. |
| F8 | "with a key that never leaves your device" | P:38, R:41 | **INCOMPLETE** | True until the player sets a recovery phrase. `js/social.js:947-975` `setRecoveryPhrase` reads the whole `identity` bundle, **which contains `aesJwk`, the backup key**, encrypts it under PBKDF2-SHA256(phrase, 1,000,000 iterations) and PUTs it to `/recovery`, which stores it in `recovery.wrapped` (`server/src/index.js:1691-1728`). Live: **16 of 51 players have done this.** The key is not readable by the server, and the KDF is strong, and the phrase is floor-checked (12 chars, blocklist, must contain a space or digit, `js/social.js:892-912`). But "never leaves your device" is literally not true for those 16, and `privacy.html` does not mention account recovery at all. |
| F9 | "You can turn cloud backup off in Settings." | P:40 | **TRUE, with two unstated limits** | The toggle exists (`js/app.js:11731`, handlers 11906-11913) and the guard is at the single choke point `js/social.js:609`, so all four callers are covered. **Limit 1:** turning it off stops future pushes but does not delete the blob already stored, and there is no route that could. **Limit 2:** it does not stop the plaintext profile sync, so `weekSteps` still uploads. A reader of P:35-40 would reasonably think the toggle is the control over what the server holds. |

### The identity and analytics claims

| # | Claim | Where | Verdict | Evidence |
|---|---|---|---|---|
| F10 | "an anonymous device key ... There is no sign-up: no name, no email, no password" | P:54-56 | **TRUE** | `js/social.js:169-183`: ECDSA P-256 keypair generated on-device. `POST /register` (`server/src/index.js:1470-1548`) takes only the JWK. No credential of any kind is collected outside the optional survey. |
| F11 | "it creates an anonymous device key for you and registers it ... when you finish setting up the app" | P:54, and the correction note at P:76-81 | **TRUE** | `js/app.js:12358-12360`: `saveInitialSettings` fires `social.goOnline()` then `autoSync(socialSnapshot)` unconditionally at the end of onboarding (except demo/webdriver). The correction note added in PR #89 is accurate, and creditably so. |
| F12 | Analytics run "under a random device id that is not your social key" | P:68, R:43 | **TRUE literally, but the two datasets are joined** | The ids genuinely differ: `js/analytics.js:25-32` mints `analyticsId` with `crypto.randomUUID()` into kv, entirely separate from the ECDSA identity. **But** `js/analytics.js:74-78` attaches the Crew display name as `label` on every flush, stored in `devices.label`, and `js/analytics.js:121` sends the social player id as `leads.player`. Live: 158/165 devices carry a label; 18 of those match a `players.name` exactly (and `players.name` is UNIQUE case-insensitively, `schema.sql:51`), 27 match a `players.handle`; and **17/17 leads rows carry an explicit player id**. So the separation of identifiers is real and the separation of data is not. P:71-72 discloses the name attachment. The `leads.player` link is disclosed nowhere. |
| F13 | "There are no third-party analytics services or advertising trackers involved." / "No ads." | P:70, P:134-135, R:43 | **TRUE** | `package.json` has one devDependency (puppeteer). `native/package.json` has five Capacitor packages and nothing else. `index.html` loads no external script, stylesheet or font: `assets/fonts/bangers.woff2` is local, tesseract/zbar/maplibre are vendored in `vendor/`. Full URL scan of the client found no analytics or ad host. |
| F14 | "a coarse location (country, region, and city) derived from your internet connection's IP address ... never precise GPS, and no location permission is used" | P:72-75 | **TRUE** | `server/src/index.js:2580, 2595`: `request.cf.country / cf.region ?? cf.regionCode / cf.city` upserted into `devices`. Cloudflare edge geo, three named text fields, nothing finer. Live: 23 distinct countries, 80 distinct cities. Raw IPs never stored anywhere: `rlBucket` (`server/src/index.js:373-379`) HMACs them under a secret and truncates to 12 bytes. |

### The location claims

| # | Claim | Where | Verdict | Evidence |
|---|---|---|---|---|
| F15 | **"Location is used on this phone only, never stored, never uploaded."** | **I:36** (`NSLocationWhenInUseUsageDescription`) | **FALSE** | This is the string Apple shows in the permission prompt and reads during review. It is contradicted by the app's own privacy policy three ways: spire polling uploads a grid cell, spire claiming uploads a coordinate and stores it against an identity (F17), and map feedback uploads a ~1.1 m coordinate and stores it forever (F18). `privacy.html` is honest about all three; the Info.plist string is not. **This is the single highest-risk item for review**, because it is a false statement in the permission prompt itself. |
| F16 | Foreground only, no background location | P:84-87 | **TRUE** | `js/app.js:18214-18242` uses `navigator.geolocation.watchPosition`; `stopHuntWatch()` (16551-16553) clears it, and it is called from the Boneyard screen's `cleanup` (16591) and from `startMap` (16630). No `UIBackgroundModes` key in Info.plist. No `ACCESS_BACKGROUND_LOCATION` in the Android manifest (only FINE and COARSE, lines 63-64). |
| F17 | Spires: polled "by a grid cell roughly 2.2 km across, never by your exact position"; claiming "sends that tower's name and coordinates ... you have to stand within 80 m" | P:96-104, R:34 | **TRUE, and precise** | `js/spires.js:21-22`: `SPIRE_CELL_DEG = 0.02` (2.22 km of latitude), `SPIRE_RADIUS_M = 80`. `js/spires.js:74-84` `spiresNear` sends the ids of the 3x3 block around the player, so the server can derive the centre cell exactly, which is the 2.2 km resolution claimed. **On precision:** `spires.lat/lng` is stored as a full IEEE-754 double (live `MAX(LENGTH(CAST(lat AS TEXT)))` = 18, so ~15 significant figures), but it is **not the player's position**: `js/spires.js:64-70` derives it deterministically from `hashStr("spire:cx:cy")`, so the coordinate carries no information the id does not already carry. The real disclosure is exactly what the policy says: `spires.owner` + `claimed_at` + an 80 m radius around a known point. Live: 20 spires, 9 distinct owners, oldest claim 2026-08-17. **Not stated:** there is no pruner and no delete route, so those 20 location-and-time records are permanent. |
| F18 | Map feedback "sends the map coordinates you tapped and the note you typed" | P:114-120 | **TRUE but under-stated** | `server/src/index.js:2613-2614` rounds to 1e-5, i.e. **5 decimal places, about 1.1 m**. That is stored with `device`, the Crew `label`, the free-text `note` and the coarse `geo`, forever, with no pruner. Live: 15 reports, 11 with coordinates, 15 with a label and a geo string. The point is user-chosen rather than the device fix, and it is only sent on a deliberate submit, both of which the policy says. What it does not say is the precision or that nothing ever deletes it. Also note `README.md:34`'s "only map tiles and that spire poll touch the network" is INCOMPLETE: map feedback and screen analytics also fire from that screen. |
| F19 | "Your GPS coordinates are never sent anywhere" | P:88 | **TRUE for the raw fix** | No route accepts a device position. `/spires` takes cell ids; `/spires/:id/claim` takes the tower's deterministic coordinate; `/report` takes the tapped point. The raw `watchPosition` fix is never transmitted. The sentence is bolded and absolute, though, and sits four lines above the paragraph that explains the exceptions, so it reads stronger than the section as a whole supports. |

### Third parties

| # | Claim | Where | Verdict | Evidence |
|---|---|---|---|---|
| F20 | Map tiles come from OpenFreeMap and reveal the area viewed | P:108-112 | **TRUE** | `assets/map/boneheadz-style.json` and `js/water.js:41` both point at `https://tiles.openfreemap.org/planet` and nothing else. No identifier is attached. |
| F21 | Open Food Facts and USDA FoodData Central | **absent from `privacy.html`** | **UNDISCLOSED** | `js/sources.js:124` sends the scanned barcode to `world.openfoodfacts.org/api/v2/product/`. `js/sources.js:230` sends the typed **search term** to `world.openfoodfacts.org/cgi/search.pl`. `js/sources.js:217` sends the typed search term plus an API key to `api.nal.usda.gov`. Each carries the device IP. No user identifier is attached and no result is reported back to our own server, so these are not trackers, and P:135 "No third-party analytics or trackers" survives. But food search terms and scanned barcodes are food data leaving the device to two third parties, under a policy whose framing is "your data is yours" and which discloses one third party (OpenFreeMap) and not these two. `README.md:73-74` lists them as data sources, which is a licensing note rather than a privacy disclosure. |
| F22 | Camera: "the photo is processed on your device ... Photos are not stored or uploaded" | P:48-50 | **TRUE** | OCR is `vendor/tesseract`, barcode decode is `vendor/zbar` (wasm), both local. No image ever reaches a fetch. |

### Deletion, and the store forms

| # | Claim | Where | Verdict | Evidence |
|---|---|---|---|---|
| F23 | "Deleting the app removes all locally stored data from your device." | P:141 | **INCOMPLETE, and wrong on one point** | Wrong on the keychain: `js/social.js:50-92` mirrors the identity bundle (signing key **and** backup AES key) into the iOS keychain via the `BhVault` plugin specifically so it **survives app deletion**. That is the feature working as designed, and it means deleting the app does not remove all local data. Incomplete on the server: nothing in that section mentions server-side data, and there is **no account-deletion route at all**. `/usr/bin/grep "DELETE FROM"` over `server/src/index.js` returns six hits, all pruner or friend-removal; no route deletes a player, a backup, a recovery bundle, a lead, a report or a spire. In-app "Erase ALL data" (`js/app.js:12048-12064`) clears IndexedDB and the vault, and leaves every server row standing. Whether an anonymous device key counts as "account creation" for Apple's 5.1.1(v) deletion requirement is a judgement call I am not making, but the account has a friend code, a chosen unique display name, a recovery id and a server record. |
| F24 | **"Data collection: None collected by the developer."** and "the optional social sync uses an anonymous device key only and never includes food, weight, or health data" | **T:58-63** | **FALSE** | Written 2026-07-05, before analytics, the survey, spires, the step race and the profile snapshot existed (`git log -1 -- TESTFLIGHT.md`). Against the code today the developer collects, at minimum: identifiers (analytics device id, player id, pubkey, friend code, display name), usage data, diagnostics (`err` events, 75 live rows), health and fitness (`week_steps`), coarse location (country/region/city on 165 devices), precise location (spire claims and ~1.1 m report coordinates), contact info (**7 live email addresses**) and user content (feedback notes). **If this file's answers were the ones submitted to App Store Connect, the privacy label is wrong on every axis.** |
| F25 | "the survey/email feature is NOT shipped, so do NOT declare email yet" and "Shared with third parties: no" | **PL:33-35** | **FALSE (both halves, now)** | The survey shipped (`js/analytics.js:113-133`, `js/app.js:11290-11365`). Live `leads`: 17 rows, **7 with an email**, 3 opted in to update emails. Email must be declared as Contact info. On sharing: no data is sold or handed to an analytics vendor, but barcodes and food search terms go to Open Food Facts and USDA (F21), tile requests go to OpenFreeMap (F20), and step counts are made visible to other users (F4), which is Play's "publicly visible" question rather than its third-party one. PL:38's Health Connect declaration ("reads Steps, Active calories, and Weight") also does not match the 17 read permissions in the manifest (F5). |

### Smaller true things, stated plainly so they are not re-litigated

- Analytics have no off switch, and `privacy.html:76-81` says so explicitly and apologises for having once said otherwise. That note is accurate.
- Survey email "never sold or given to third parties" (P:127-128): TRUE. `leads.email` is read by exactly one route, `GET /stats` (`server/src/index.js:2878`), which is `ADMIN_TOKEN`-gated. No export, no forwarding, no mail integration exists.
- Map feedback "never shared with other players" (P:119): TRUE. `reports` is read only by `GET /stats`.
- "No sign-up, no password and no login" (P:137): TRUE.
- Event retention is genuinely 30 days and the cron genuinely runs: `server/src/index.js:488`, `wrangler.toml` `crons = ["*/15 * * * *"]`, and `prune_runs` has 16 ticks, all `ok=1`, 10,519 events deleted. Live `MIN(day)` sits exactly on the boundary.
- The 715 future-dated rows are gone. Live `MAX(day)` = 2026-08-25, i.e. today, and `server/src/index.js:2572` now clamps `ts` forward at ingest.
- `server/src/index.js:1` still carries the comment "No emails, no passwords, no PII: a pubkey IS the account." Stale since the survey shipped. Cosmetic, but it is the kind of stale comment that gets quoted into a form later.
- The `/stats` comment block at `server/src/index.js:2663` still says `EVENT_RETENTION_DAYS (60)`. The constant is 30. Cosmetic.

---

## Part 3. What Tom should act on, worst first

1. **Check what was actually submitted to App Store Connect, and fix `TESTFLIGHT.md:58-63.`** (F24) "Data collection: None" is false in every category. If that is the live privacy label, it needs correcting before or with the next submission. The label needs, at minimum: Contact Info (email, from the survey), Health & Fitness (steps), Location (coarse for analytics; precise for spire claims and map feedback), Identifiers (device id, player id), Usage Data, Diagnostics, User Content (feedback notes). Whether each is "linked to you" is a judgement call driven by F12: the analytics id is separate, but `leads.player` and `devices.label` join it to the player record, so "not linked" is hard to defend.

2. **Fix `NSLocationWhenInUseUsageDescription` in `native/ios/App/App/Info.plist:36.`** (F15) It says location is "never stored, never uploaded". The app's own privacy policy explains three ways that is not true. This string is shown in the permission prompt and read during review, and it directly contradicts a public policy at a URL the submission itself provides. Cheapest fix in the whole list and the one most likely to be caught.

3. **Resolve the health contradiction inside `privacy.html`.** (F2, F3, F4) Lines 44-46 say health data never leaves the phone except inside the encrypted backup; line 60 says the weekly step count is in the plaintext snapshot. One of those has to go, and the code says which. Then say the thing neither document says: the weekly step count and the pet level are **shown to other players** on the step race board and the leaderboard. Apple treats disclosure of HealthKit data to third parties as needing consent, and right now the user is not told it happens at all.

4. **Fix the Play data-safety draft, `native/PLAY-LAUNCH.md:33-38.`** (F25, F5) Declare email. Re-check the "shared with third parties" answer against F20/F21. Make the Health Connect declaration match the 17 permissions the manifest actually requests, or cut the manifest down to what is used. Google asks for a demo video on exactly this declaration.

5. **Narrow the HealthKit and Health Connect permission requests, or disclose them.** (F5) Asking for VO2 max, blood oxygen, respiratory rate, body fat and lean body mass "once so future features never need a new prompt" is a legible reason to a developer and an unexplained overreach to a reviewer looking at three named types in the usage string. Either trim `HealthPlugin.swift:175-184` and `AndroidManifest.xml:76-92` to what is read today, or list them honestly in the usage strings and the policy.

6. **Decide what deletion means, and say it.** (F23) Today: the keychain survives app deletion by design, and no server row is ever deleted by anything. At minimum, correct P:141 to say so. If an account-deletion route is wanted, it is one signed `DELETE` that clears `players`, `backups`, `recovery`, `grants`, `friendships` and `spires` for that id, plus a Settings button.

7. **Correct "a key that never leaves your device".** (F8) It does, wrapped, for the 16 players who set a recovery phrase. `privacy.html` does not mention account recovery at all. A sentence covering both would be more reassuring than the current absolute, because the mechanism is genuinely good: PBKDF2 at a million iterations, ciphertext only, server holds no key.

8. **Disclose Open Food Facts and USDA.** (F21) One sentence: scanning a barcode or searching for a food sends that barcode or search term to Open Food Facts or USDA FoodData Central, with no identifier attached. It costs nothing and closes the only undisclosed outbound data class.

9. **Say what is kept and for how long.** No document states a retention period for anything. `events` is 30 days and that is worth claiming. The rest is forever, and a reader who has been told the app is private will assume otherwise. Related, and smaller: the backup opt-out does not delete the stored blob and does not stop the step count uploading (F9).

10. **Disclose the `leads.player` join.** (F12) The survey attaches the social player id, which is the one place the "separate ids" story is broken by design rather than by inference. `privacy.html:122-130` does not mention it.

11. **Cosmetic, but they end up quoted into forms:** stale comment at `server/src/index.js:1`, stale `(60)` at `server/src/index.js:2663`, and the `README.md:34` claim that only tiles and the spire poll touch the network from the map.

**No document was changed by this audit.** Everything above is a proposal.

---

## Part 4. What I could not determine

- **Whether the App Store privacy label actually submitted matches `TESTFLIGHT.md`.** That file is the only record in the repo of what the answers were meant to be, and it is seven weeks stale. What Tom typed into App Store Connect can only be read in App Store Connect. Item 1 above is "go and check", not "it is definitely wrong on the store".
- **What Cloudflare Workers Logs retain.** `wrangler.toml` sets `[observability] enabled = true, head_sampling_rate = 1`, so every invocation is kept. `GET /spires?ids=...` carries the player's 3x3 cell block in the URL and the player id in a header. Whether Cloudflare's log retention captures the query string and the custom headers, and for how long, I did not verify. If it does, there is a short-lived server-side location trail that no document accounts for. Worth a five-minute check in the Cloudflare dashboard.
- **Whether `players.name` uniqueness makes `devices.label` a re-identifier in every case.** I measured that 18 of 158 labels match a `players.name` exactly today and 27 match a `handle`. The rest are presumably older labels from before renames. I did not attempt to reconstruct the full historical join, and deliberately did not read any row of user content to try.
- **Whether any of this complies with anything.** Out of scope, and stated again here because the temptation to read a verdict column as a legal finding is real. FALSE in this document means "the code does not do what the sentence says", nothing more.
