# Boneheadz Gym - App Store Connect Submission Pack

## KNOWN OPEN DECISIONS (REQUIRE TOM APPROVAL)

1. **Device family**: TARGETED_DEVICE_FAMILY currently set to "1,2" (iPhone + iPad). Should the submission be iPhone-only (1) or include iPad support (1,2)?

2. **Server URL**: Capacitor config (`native/capacitor.config.json`) currently points to `https://tommillerca.github.io/tally/` (the live production site). Should the app bundle its own web build or continue pointing to the live remote URL?

---

## 1. APP PRIVACY QUESTIONNAIRE

### 1.1 Data Types Collected

#### Health & Fitness
- **Type**: Steps, active energy (calories), body weight, heart rate
- **Linked to user identity?** NO. These are read from HealthKit on the device only. They never leave the phone except inside the user's end-to-end encrypted cloud backup (which only the device can decrypt). The server never sees the plaintext.
- **Used for tracking?** NO. HealthKit data is processed only on-device to power XP gains, in-game achievements, and personal trends. No tracking identifier or user profile is attached to this data server-side.
- **Purpose**: Boneheadz reads HealthKit to reward real-world activity (steps and energy expenditure) into the game economy. This is entirely optional - users who do not connect HealthKit can still play all game modes using manually logged meals and estimated calorie burns. (Source: `native/ios/App/App/Info.plist` NSHealthShareUsageDescription; `privacy.html` "Apple Health / Health Connect" section)

#### Identifiers
- **Type**: Random device-generated UUID and ECDSA public key
- **Linked to user identity?** NO. The device generates a random 256-bit ECDSA keypair at first launch, stored locally. It is never linked to an email, name, password, or any personal information. Re-registering the same public key returns the same account, but the key itself is cryptographic material with no human-readable identity. (Source: `js/social.js` "Identity" section - "an ECDSA P-256 signing keypair...generated on-device")
- **Used for tracking?** The public key (playerId) is used to authenticate API requests and identify the player record on the server, but only for necessary account operations (friend requests, profile sync, cloud backup retrieval). It is not cross-app or cross-site tracking.
- **Purpose**: To persist the player account across app sessions and reinstalls, and to enable optional social features (friend codes, leaderboards).

#### Usage Data
- **Type**: App events (e.g., "opened app", "won a fight", "viewed screen", screen dwell time)
- **Linked to user identity?** NO. Analytics carry a random per-device ID, separate from the social account ID. This random ID is stored locally and used only for analytics aggregation. No personal information is included.
- **Used for tracking?** NO. Events are sent to the developer's own server only. There are no third-party analytics services, SDKs, or advertising networks. Events are aggregated to answer questions like "how many players use the map feature" and are never used to build user profiles or targeted advertising.
- **Purpose**: Boneheadz Gym collects usage telemetry to understand feature adoption, session length, and crash patterns so the developer can prioritize fixes and improvements. (Source: `js/analytics.js` header - "Anonymous, first-party product analytics. No third-party trackers. Events carry a RANDOM per-device id...NEVER food, weight, health, or personal data.")

#### Optional: User Feedback (Email)
- **Type**: Name, email address, feedback text, feature preferences
- **Linked to user identity?** NO. Email is only collected through an optional in-app survey. It is never linked to the player account or game progress. Users are explicitly told the data is optional and can opt out of email communications.
- **Used for tracking?** NO. Email is stored on the developer's own server and used only to contact the player or send occasional app updates (if the player ticks the opt-in box). It is never shared with other players, sold, or given to third parties.
- **Purpose**: To gather player feedback and contact willing players about app updates. (Source: `privacy.html` "Survey and email" section)

### 1.2 Coarse Location (from IP)

- **Type**: Country, region, city derived from the request's IP address (not GPS)
- **Linked to user identity?** NO in analytics. The coarse geographic region is used only to aggregate usage statistics server-side and is never attached to the player's personal account.
- **Used for tracking?** NO. This is approximate geolocation from the internet connection, not precise GPS. No location permission is requested beyond the "while using the app" iOS permission for the Boneyard map feature.
- **Purpose**: For analytics and understanding regional usage patterns. No location history is kept; only the coarse region at event-send time is recorded. (Source: `js/analytics.js` "coarse location...derived from your internet connection's IP address")

### 1.3 Map and Location Features

- **GPS (Boneyard Map)**: The app requests "while using the app" location on iOS. GPS coordinates are **never sent to the server**. All map features (daily spawns, boss dens, mini-bosses, secrets) are generated locally on the device from the player's position. The only server communication for map features is grid-cell lookups for shared towers (Spires), identified by a grid cell roughly 2.2 km across, never by exact coordinates. Claiming a spire tells the server approximately where the player is when they claim it, but only for that specific action. (Source: `privacy.html` "Location and the map" section; Info.plist NSLocationWhenInUseUsageDescription)

### 1.4 Data NOT Collected

- **No name, no email, no password, no sign-up.** The account is anonymous by design. Email is only collected if the player fills out the optional survey.
- **No food entries transmitted.** Food logs, weights, and health data never leave the device except inside the encrypted backup, which the server cannot read.
- **No third-party sharing.** No analytics platforms, ad networks, or data brokers have access to any player data.
- **No behavioral profiling or re-identification.** Events carry no device fingerprint, IP history, or cross-app identifiers beyond what the player explicitly opts into.
- **No device identifiers except those needed for the app itself.** The app does not request IDFA or any Apple advertising identifier.

---

## 2. AGE RATING QUESTIONNAIRE

### 2.1 Simulated Gambling (Loot Crates)

**ASC Question**: Does your app contain simulated gambling?

**Answer**: NO (frequency: None).

**Reasoning**:
- Boneheadz Gym includes loot crates earned through gameplay (no real-money purchase). Crates contain random gear, cosmetics, consumables, and eggs.
- These crates are **not purchased with real money** in this submission version, so they do not meet the definition of gambling that triggers payment-related scrutiny.
- Apple's simulated gambling question targets casino-style wagering presented as gambling (slots, poker, roulette, betting). Random loot rewards earned through play are not that: they are handled by the separate loot box rules (Guideline 3.1.1 odds disclosure, which the app already satisfies in-app), not by the gambling rating flag. Answering YES here would misrepresent the game and inflate the age rating for a mechanic Apple regulates through disclosure instead.
- **Odds are disclosed in-app**: The app includes a "Crate odds" section visible in the Shop menu. Players see the probability of each rarity tier before opening any crate. (Source: `js/app.js` - "Store loot-box odds disclosure (Review Guideline 3.1.1)...the block renders whether or not a crate is currently held: the odds are computed at render time by crateOdds()"; see `crateOdds('daily')` output: "Any ordinary pull: ${line('daily')}. Rare or better: about 1 in ${crateOdds('daily').rareUpOneIn}.")
- **No real-money purchase**: In v1, crates are earned only through in-game play (daily login gift, boss defeats, quest rewards). There is no option to purchase crates with real money. All cosmetics and gameplay items earned from crates are cosmetic or power-neutral; no crate reward is pay-to-win or pay-to-progress.
- **No pressure to purchase**: The game loop does not gate progress on crate openings. Players advance solely through logged meals, workouts, and step activity.

**Conclusion**: Answer None for simulated gambling. Keep the in-app odds disclosure (already shipped) as the loot box compliance; mention it in the review notes so the reviewer sees it without hunting.

### 2.2 Violence

**ASC Question**: Does your app contain violence?

**Answer**: YES, but cartoon skeleton combat only.

**Reasoning**:
- The game features turn-based skeleton battles. Combat is cartoonish and abstract - no blood, gore, injury, or realistic violence.
- Skeletons are stylized cartoon characters. Battles are won/lost with visual effects (text, UI updates) but no graphic depictions of harm.
- The violence is comparable to children's game animation (e.g., turn-based RPG combat without graphic realism).

**Conclusion**: Rate as contains mild cartoon violence. Appropriate for 4+ or 12+ depending on ASC's guidance for cartoon combat.

### 2.3 Health, Medical, or Treatment Information

**ASC Question**: Does your app collect, use, or disclose health or medical information?

**Answer**: YES, for calorie tracking and optional fitness data.

**Reasoning**:
- Boneheadz Gym is explicitly a calorie and habit tracker. Players log meals and manually enter calorie intake. This is dietary/nutritional tracking, not medical treatment.
- Players can optionally connect HealthKit to read step activity and energy expenditure. Neither of these is medical data; they are fitness metrics used to drive game progression.
- The app does NOT provide medical advice, diagnose conditions, or recommend medical treatment. Users set their own calorie targets. The app does not prescribe targets based on medical status.
- Health data is always optional (HealthKit can be disabled), and every game feature has a non-Health path: players can advance entirely on manually logged meals and estimated calorie burns.
- Calorie tracking for fitness and habit-building is not medical in nature; it is nutritional/lifestyle tracking.

**Conclusion**: Rate as uses fitness data but does NOT use medical data or provide medical advice. Include disclosure that the app is a lifestyle tool, not medical, and results should not replace professional health advice.

### 2.4 Other Content

- **Unrestricted Web Access**: NO. The app is a bundled web app with no in-app browser or link to arbitrary web content.
- **Profanity**: NO profanity in the base game.
- **Alcohol, tobacco, drugs**: NO references.
- **Contests or gambling requiring real money**: NO. Crates are earned only, not purchased with real money in v1.
- **Frequent/intense horror**: NO. Skeletons are friendly, cartoonish, and non-threatening.
- **Sexual content**: NO.

---

## 3. EXPORT COMPLIANCE (Encryption)

### 3.1 Encryption in the App

The app uses the following cryptographic operations:
- **ECDSA P-256** (Elliptic Curve Digital Signature Algorithm) for signing API requests
- **AES-GCM** (Advanced Encryption Standard - Galois Counter Mode) for end-to-end encryption of cloud backups
- **HMAC-SHA-256** for message authentication codes
- All operations use the WebCrypto API, which is part of the W3C standard and available on all modern platforms.

### 3.2 Encryption Exemption Category

**Exemption**: 15 CFR 740.17(b)(1) - Encryption commodities.

**Reasoning**:
- The cryptographic algorithms used (ECDSA, AES-GCM, HMAC-SHA-256) are published, unrestricted algorithms listed in 15 CFR 740.17(b)(1) as exempt encryption commodities.
- The app does NOT implement custom or proprietary encryption algorithms.
- The app does NOT provide encryption for anonymizing user identity or bypassing security controls.
- Encryption is used for its intended purpose: protecting user data in transit and at rest (backup encryption).

### 3.3 ITSAppUsesNonExemptEncryption

**Value**: `false` (declared in `native/ios/App/App/Info.plist`)

**Justification**: All encryption in the app is covered by the commodity exemption at 15 CFR 740.17(b)(1). No non-exempt encryption is used. Therefore, the app does not require an encryption review and does not use encryption that requires separate regulatory approval.

### 3.4 Export Compliance Answer for ASC

**ASC Prompt**: "Does your app contain encryption?"

**Answer**: YES, standard encryption. Uses ECDSA and AES-GCM for cloud backup security. Exempt under 15 CFR 740.17(b)(1) (published unrestricted algorithms). No encryption review required.

---

## 4. APP REVIEW NOTES

**Paste-ready reviewer note for ASC submission:**

---

Boneheadz Gym is a calorie and habit tracker that gamifies daily activity and workouts with a turn-based skeleton RPG. No account sign-up is required. Here is how to see the main game loop in 2 minutes:

1. **First launch**: The app automatically creates an anonymous account and opens the onboarding flow. Select a skeleton pet to get started.
2. **Log a meal** (Home tab): Tap "Add food" and scan a nutrition label or barcode, or select a food from the quick list. The app adds the meal to the log and updates the player's calorie balance.
3. **Meet the skeleton** (Pit tab): The app shows the player's skeleton and its stats. Sufficient calorie burn triggers level-ups and new gear.
4. **Open the Pit** (combat): Tap "Fight" to battle a random skeleton. Combat is turn-based, uses equipped gear, and grants coins and XP on victory. Wins contribute to weekly step races (Bone Road).

**Key points for review**:

- **No login required**: Account is anonymous and auto-created. Players can tap "Go Online" in Settings to optionally enable friend codes and leaderboards, but the game is fully playable offline.
- **HealthKit is optional**: If the player declines HealthKit access, the app still works. Calorie burn can be entered manually or estimated from logged meals. There is a non-Health path for every game feature.
- **Loot crate odds are disclosed**: Open the Shop tab and scroll down to see "Crate odds" showing the probability of each rarity tier. Odds are recomputed and displayed every time the screen opens so the player always sees current rates. Crates are earned through play only (daily login gift, boss rewards, quest completion); there is no real-money purchase option in v1.
- **Account deletion**: In Settings, "Delete account & cloud data" (typed DELETE confirm) deletes the server account and every cloud row (friends, race entry, encrypted backup), then wipes the local save. This is the Guideline 5.1.1(v) control. The separate "Erase all data" wipes only the local save.
- **Cloud backup is end-to-end encrypted**: If enabled (on by default), a copy of the save is backed up to the developer's server, encrypted on the device before upload. The server cannot read the backup. Backup can be disabled in Settings.
- **No third-party analytics or ads**: The app collects only anonymous usage events (e.g., "opened app", "won a fight") tied to a random device ID. No third-party trackers, no ad networks, no behavioral profiling. Coarse location (country/region) is derived from the request IP and aggregated for analytics only; precise GPS is never transmitted to the server.
- **Privacy policy**: Full details at the app's privacy URL (shown on the App Store listing).

---

## 5. REQUIRED URLS AND ASSETS CHECKLIST

### 5.1 URLs

| Item | URL | Status | Notes |
|------|-----|--------|-------|
| Privacy Policy | `https://tommillerca.github.io/tally/privacy.html` | READY | Live and complete |
| Support / Contact | `https://tommillerca.github.io/tally/support.html` | PENDING | File does not yet exist in repo; needs to be created before submission |

**Action**: Create `support.html` before submitting. Should include contact email address for player support inquiries.

### 5.2 App Icon and Screenshots

| Item | Requirement | Status |
|------|-------------|--------|
| App Icon (1024x1024) | Single icon, no transparent areas | CHECK IN XCODE |
| iPhone Screenshots (6 required) | 390x844 (6.1"), 1170x2532 (6.7"), or similar | CAPTURE FROM DEVICE/SIMULATOR |
| iPad Screenshots (optional) | 1024x1366 (10.9") or similar if submitting iPad | **DEPENDS ON DECISION #1 above** |

**Resolution at time of knowledge cutoff (Feb 2025)**: iPhone-only submissions require 2-3 screenshots; iPhone+iPad requires screenshots for both. **Verify in ASC at submission time** as screenshot requirements change with iOS releases.

**Capture method**: Use Xcode simulator or a physical device to capture actual app screens. Do not use mockups or design files.

### 5.3 Description vs. Promotional Text

| Field | Max | Guidance |
|-------|-----|----------|
| Promotional Text | 170 characters | Lead with hook: "Turn your daily routine into a skeleton battle RPG" or similar |
| Description | 4000 characters | Full feature list: calorie tracking, HealthKit integration, turn-based combat, friend features, end-to-end encrypted backup, no ads, no pay-to-win |
| Keywords | 100 characters | e.g., "calorie counter, fitness tracker, RPG, skeleton, gamified" |

**Tone**: Friendly and straightforward. Emphasize no sign-up, privacy-first, and play-for-free aspects.

---

## 6. SUBMISSION CHECKLIST

### 6.1 Pre-Submission

- [ ] Create `support.html` and confirm URL works
- [ ] Verify Privacy Policy URL is accessible and up to date
- [ ] Confirm `ITSAppUsesNonExemptEncryption = false` in Info.plist
- [ ] Confirm TARGETED_DEVICE_FAMILY setting (1 for iPhone-only, or "1,2" for iPhone+iPad)
- [ ] Confirm Capacitor config points to correct server URL
- [ ] Capture screenshots for iPhone (and iPad if supporting both)
- [ ] Confirm app icon is 1024x1024 and present in Xcode
- [ ] Test account creation and erase flow on device
- [ ] Test HealthKit permission prompt and denial path
- [ ] Open shop and verify crate odds display is visible and readable
- [ ] Confirm loot crate screen shows no real-money purchase buttons in v1

### 6.2 During ASC Submission

- [ ] Select "Yes" for privacy questionnaire: Collects Health & Fitness, Identifiers, Usage Data
- [ ] Clarify that Identifiers are "random device ID" not linked to personal identity
- [ ] Clarify that Health & Fitness data never leaves the device except in encrypted backup
- [ ] Select "Yes" for Encryption and choose "Published algorithms" / commodity exemption
- [ ] Select "Yes" for Simulated Gambling (loot boxes with disclosed odds, no real-money purchase)
- [ ] Select appropriate age rating for cartoon violence (4+ or 12+)
- [ ] Paste the "APP REVIEW NOTES" verbatim into the Notes for Reviewer field
- [ ] Include both Privacy URL and Support URL
- [ ] Submit app for review

### 6.3 After Submission

- [ ] Monitor TestFlight invite groups if using beta review
- [ ] Prepare for potential ASC rejections on crate odds or gambling classification
- [ ] Have clarifications ready on end-to-end encryption and backup handling
- [ ] Prepare screenshots of crate odds display and Settings account deletion flow for reviewer follow-up if needed

---

## APPENDIX: Data Path Tracing

### A.1 Calorie Entry

User logs meal -> Local IndexedDB storage -> (if backup on) Encrypted with AES-GCM on device -> Sent to server as opaque ciphertext -> Server stores ciphertext in cloud backup table -> User never sees it decrypted server-side

**Server visibility**: NONE (ciphertext only)

### A.2 HealthKit Steps

User consents to HealthKit -> App reads steps from HealthKit -> Processed on device to calculate XP and level-up -> Stored in local IndexedDB -> (if backup on) Encrypted and sent with backup -> (optional) Game snapshot includes step total in public profile

**Server visibility**: Step total ONLY if player goes online and sync is enabled (in public game snapshot, not in encrypted backup)

### A.3 Analytics Event

User opens app -> App generates event (e.g., { name: 'app_open', device: randomUUID(), ts: timestamp }) -> Event queued locally -> Every 60s, batch of events POSTed to `/events` endpoint with random device ID (NOT linked to player account) -> Server stores in D1 events table -> No personal data included

**Server visibility**: Event name, random device ID, screen name, optional tester name (only if player went online), coarse IP-derived location

### A.4 Friend Code Generation

Player taps "Go Online" -> App generates ECDSA keypair on device and sends pubkey to `/register` endpoint (unsigned) -> Server returns playerId, bone name, friend code -> App stores in local social record -> Player can share friend code (a UUID) to invite others

**Server visibility**: Public key (used to verify signed requests), playerId, handle (auto-generated from word lists), friend code

**Private (never on server)**: Private key, full save, food log, weight, health data

---

## APPENDIX: Document Certification

**This document is grounded in the following source files:**

| Claim | Source File | Location |
|-------|-------------|----------|
| Privacy policy exists and content | `privacy.html` | Full file |
| Analytics never collects food/weight/health data | `js/analytics.js` | Lines 1-20, track() function |
| Backup is AES-GCM end-to-end encrypted | `js/social.js` | encryptBackup() / decryptBackup() functions, comments at lines 200-210 |
| Account is anonymous ECDSA keypair, no email required | `js/social.js` | ensureIdentity(), lines 60-180 |
| HealthKit is optional and read-only | `native/ios/App/App/Info.plist`, `privacy.html` | NSHealthShareUsageDescription, "Apple Health" section |
| Crate odds are disclosed in-app | `js/app.js` | crateOdds() call, "Crate odds" section rendering |
| ITSAppUsesNonExemptEncryption = false | `native/ios/App/App/Info.plist` | Key: ITSAppUsesNonExemptEncryption, Value: false |
| Device supports iPhone and iPad | `native/ios/App/App.xcodeproj/project.pbxproj` | TARGETED_DEVICE_FAMILY = "1,2" |
| Server URL points to live site | `native/capacitor.config.json` | server.url: "https://tommillerca.github.io/tally/" |
| Account deletion is in Settings | `js/app.js` + `js/social.js` + `server/src/index.js` | "Delete account & cloud data" row, deleteAccount(), POST /account/delete (feat/account-deletion) |
| Coarse location added server-side from IP | `js/analytics.js` | flush() function, "label" parameter; comment: "Location is added server-side from the request's coarse edge geo" |
| Map grid cells are 2.2 km, not GPS coords | `privacy.html` | "Location and the map" section, "grid cell roughly 2.2 km across" |

**Claims not verified in repo (flagged as DECISION NEEDED or external dependencies):**

| Claim | Reason |
|-------|--------|
| Support.html exists and is deployed | File does not exist; needs to be created |
| Exact screenshot requirements for current ASC form | User's knowledge cutoff is Feb 2025; ASC may have updated requirements by submission time |
| App icon is production-ready | Icon location not searched; assume it exists in Xcode and verified by builder |
| Current device compatibility (does it actually run on iPad?) | UI not tested on iPad; TARGETED_DEVICE_FAMILY set but no iPad-specific layout confirmed |
