# Boneheadz Gym: getting onto a real iPhone

Everything in this repo is ready to build. Two things gate it, and both need
**your Apple ID** so nobody else can do them for you. Run
`bash native/preflight.sh` any time to see what is still red.

## The only two human steps

### 1. Install Xcode (free, ~1 hr mostly download)
Mac App Store > search **Xcode** > Get. It is ~15 GB, so start it and walk
away. When it finishes, open it once to accept the license, then:
```
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```
This alone unlocks building to your own iPhone and the iOS Simulator.

### 2. Enroll in the Apple Developer Program ($99/yr, approval 1-2 days)
https://developer.apple.com/programs/enroll  (Individual, needs your Apple ID
+ payment + a photo ID check). **Start this now, in parallel with the Xcode
download**, because approval is not instant and everything below waits on it.

**Why pay now instead of using the free tier?** For *your* goals it is the
clean path, not optional-later:
- **HealthKit** provisioning is flaky-to-broken on a free personal team (the
  entitlement wants an explicit App ID tied to one paid team). Paid removes
  all doubt. This is the feature you want next, so this is the deciding factor.
- **Rare-spawn push notifications** (on the roadmap) *require* the paid program.
- **TestFlight** for Cam and friends requires it.
- Free-tier apps re-sign and die every **7 days**; paid lasts a year.

You can technically start on the free tier (add your Apple ID in Xcode, install
to your own phone for 7 days at a time) if you want to poke around before
paying, but you will hit the HealthKit wall fast. Recommendation: enroll now.

## Then it is one command

Once `preflight.sh` shows **GO**:
```
cd native
./build-www.sh          # copies the live web app into the shell
npx cap sync ios
npx cap open ios        # opens Xcode
```
In Xcode: **Signing & Capabilities** > pick your Team (the paid one once
approved) > plug in your iPhone > press **Run**. First run asks you to trust
the developer cert on the phone (Settings > General > VPN & Device Management).

## What this unlocks for the next features

- **HealthKit (the real one):** tap Connect Apple Health in-app > iOS
  permission sheet > done. Steps / active energy / weight then sync on every
  launch and resume. No shortcut, no clipboard. The Swift plugin
  (`ios/App/App/HealthPlugin.swift`) and `js/native.js` adapter are already
  wired; `Health.debugWrite({steps, activeKcal})` injects test samples in the
  Simulator, which has no real Health data.
- **The real map:** native gives reliable background-ish location + full-res
  map tiles. Once we are building native, the hunt radar can graduate to an
  actual map view. We will decide the tile source (MapKit vs a styled provider)
  when we get there; nothing about it blocks on this setup.

## Notes
- SPM, not CocoaPods: there is no `pod install` step. Ignore any old guide that
  mentions it.
- Web keeps shipping exactly as now. `./build-www.sh` re-syncs web changes into
  the shell whenever you want the native app to catch up.
- Your tracked data is never at risk: the native app is its own container and
  the export/import path plus additive DB design cover migration.
