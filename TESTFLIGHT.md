# Boneheadz Gym — TestFlight / App Store prep

Everything staged for the first TestFlight build. Fully independent app under
Tom's personal Apple ID. NOT connected to veritree in any way (verified: zero
`veritree` references in the app source).

## App identity (already set in the Xcode project)
- **App name:** Boneheadz Gym
- **Bundle ID:** `com.boneheadz.gym`
- **Version / build:** 1.0 (1)  ← build number bumps each upload
- **Category:** Health & Fitness (primary); Games (secondary, optional)
- **Age rating:** 9+ (Infrequent/Mild Cartoon or Fantasy Violence — skeletons sparring)
- **App icon:** 1024×1024 present in the asset catalog

## App Store Connect metadata (paste-ready)

**Subtitle (≤30 chars):**
`Track food. Fight skeletons.`

**Promotional text (≤170 chars):**
`Log your meals, walk, and sleep to power up a skeleton fighter. Battle the Pit, hunt the Boneyard, cook, and collect. Healthy habits, but a game.`

**Description:**
```
Boneheadz Gym is a calorie and macro tracker that turns your healthy habits
into a skeleton RPG. Every real thing you do makes your fighter stronger.

- Log food fast: search, scan a barcode, or photograph a nutrition label.
- Track calories, protein, carbs, and fat against your own targets.
- Your habits become power: protein fuels your hits, steps fuel your stamina,
  streaks thicken your bones.
- Fight in The Pit: deep talent trees, eight classes, gear, pets, and an
  endless ladder.
- Explore the Boneyard: a real-world map with roaming mini-bosses, world-boss
  dens, and ingredients to forage.
- Cook in the Haunted Kitchen: brew dishes and potions you drink mid-fight.
- Daily wellness quests for water, sleep, and making your bed.
- No shame, ever: you are rewarded for showing up, even on an off day.

Your data stays on your device. No ads, no trackers, no account required.
```

**Keywords (≤100 chars):**
`calorie,macro,food log,nutrition,protein,steps,habit,fitness,rpg,wellness,sleep,water,tracker,game`

**Support URL:** `https://tommillerca.github.io/tally/`
**Marketing URL:** `https://tommillerca.github.io/tally/`
**Privacy Policy URL:** `https://tommillerca.github.io/tally/privacy.html`  ← LIVE (hosted in this repo)

**What to Test (TestFlight beta notes):**
```
First public build. Try the whole loop: log a few foods (search + label scan),
check your macros, then open The Pit and fight. Wander the Boneyard map, cook a
dish or potion, and tick the daily wellness card. Tell me anything that feels
confusing, slow, or broken.
```

## App privacy questionnaire (answers)
- **Data collection:** None collected by the developer. (All food/health/game data
  stays on device; the optional social sync uses an anonymous device key only and
  never includes food, weight, or health data.)
- **Tracking:** No.
- Camera usage: on-device label/barcode scanning only (string already in Info.plist).

## STILL NEEDED FROM TOM
1. **App Store Connect API key** (the actual blocker): App Store Connect → Users
   and Access → Integrations → generate a key with role App Manager → send the
   `.p8` file + Key ID + Issuer ID.
2. **A personal support email** for the App Store listing (NOT the veritree one),
   since the app must stay fully separate.
3. Confirm the paid **Team ID** to sign under (the project currently has
   `DEVELOPMENT_TEAM = H8TRZ23C77`; may be the same now that the account is paid).

## What I run once I have the API key
1. Point signing at the paid team, set Release automatic distribution signing.
2. `xcodebuild archive` → export an App Store `.ipa`.
3. Upload to App Store Connect via the API key (altool/notarytool/Transporter).
4. It appears in TestFlight; fill "What to Test", add testers (email group or a
   public link), submit for the light beta review if using a public link.
5. Hand Tom the invite link to send friends.

## Notes
- Progress is stored on-device and CARRIES OVER from a TestFlight build to the
  public App Store release (same bundle ID, in-place update). Deleting the app
  wipes local data; the optional cloud sync (server/ "S0") is the durable fix if
  we want progress to survive delete / new phone.
- TestFlight builds expire after 90 days; just upload a fresh build to refresh.
