# Boneheadz Gym — Google Play launch checklist

Everything's built. This is the order to click through in [Play Console](https://play.google.com/console). All files referenced are in `native/play-assets/`.

## The one thing to know up front
New personal Play accounts must run **closed testing with 12+ testers for 14 continuous days** before you can apply for production (public launch). So the plan below gets Cam + Brock installing from Play *immediately* via closed testing, and the 14-day clock runs in the background toward going public.

---

## 1. Create the app
Play Console → **Create app**
- App name: **Boneheadz Gym**
- Default language: English (Canada)
- App or game: **Game**
- Free or paid: **Free**
- Accept the declarations.

## 2. Upload the build to Closed testing
Left menu → **Testing → Closed testing** → create a track (call it "Inner Circle") → **Create new release**.
- Upload `play-assets/BoneheadzGym-release.aab` (versionCode 1, signed with your upload key — Google re-signs for distribution).
- Release name: `1.0 (1)`. Release notes: "First Boneheadz Gym beta."
- Save → Review release → Start rollout to Closed testing.

## 3. Add testers (this is how Cam + Brock get it)
On the Closed testing track → **Testers** tab → add their Google account emails (or make a Google Group and add the group). Copy the **opt-in URL** and send it to them. They tap it, accept, and install from Play like a normal app. Their Chrome/web progress migrates with **Export in Chrome → Import in app** (their save gets a fresh container).

## 4. Fill the required declarations ("Set up your app" dashboard)
Copy is pre-written in `play-assets/store-listing.md`. Field-by-field:
- **App access:** All functionality available without a special login (Crew/backup are optional). Say so, or review can stall.
- **Ads:** No ads.
- **Content rating:** Complete the IARC questionnaire → expect **Everyone**. Combat is cartoon skeletons; the "spin" wheel gives only in-game items (no real-money gambling).
- **Target audience:** 13+ (not designed for children; avoids the Families policy overhead).
- **Data safety** (current build — the survey/email feature is NOT shipped, so do NOT declare email yet):
  - Collected: **Health & fitness** (food/exercise you log), **App activity** (usage analytics), **Approximate location** (derived from IP for analytics, never GPS).
  - **Encrypted in transit:** yes. **Shared with third parties:** no. **Used for ads:** no.
  - Users can **request deletion** (Settings → Erase; deleting the app also wipes local data).
  - Optional cloud backup is end-to-end encrypted (unreadable to the server).
- **Health apps declaration (Health Connect):** REQUIRED because the app requests Health Connect. Declare it **reads** Steps, Active calories, and Weight, used only on-device to power the game and the user's own trends, never written and never sold. Google may ask for a short screen-recording showing the permission + how the data is used, be ready to record one (30s: open app → connect Health → steps power the game).
- **Privacy policy URL:** `https://tommillerca.github.io/tally/privacy.html` (live).
- **Category:** Health & Fitness. **Contact email:** your support email.

## 5. Store listing
- Title / short / full description: copy from `store-listing.md`.
- App icon: `store-icon-512.png`. Feature graphic: `feature-graphic-1024x500.png`.
- Phone screenshots: `screenshot-1-home.png` … `screenshot-4-pit.png`.

## 6. After 14 days of closed testing with 12+ opted-in testers
The console unlocks **Apply for production**. Then create a production release (same AAB or a newer one), submit for review, and it goes public after Google's review (usually a few days).

---

## When you hit any snag
Tell me the exact Play Console message and I'll sort it. The likely friction points are (a) the Health Connect declaration/demo video, and (b) needing 12 testers, if you're short, I can help you round them up. Data-safety answers above reflect the CURRENT app; when we ship the survey (email collection), that form gets updated to add "email — contact info."
