# ATTENDED BUILD RUNBOOK, branch `native/attended-stack`

One checkout, one session. Everything native that was waiting is on this
branch. Assembled 2026-08-30.

## 1. Checkout

```
git fetch origin && git checkout native/attended-stack
```

## 2. What is on the branch

- **native/iphone-only**: `TARGETED_DEVICE_FAMILY` 1,2 to 1 in both
  configurations. iPhone-only v1 submission; halves the screenshot set.
- **capacitor.config.store.json** (new): the committed config minus
  `server.url`, so the store binary serves the bundled `www/` instead of
  loading the GitHub Pages origin.
- **build-store.sh** (new): stages the bundled build, see step 3.
- Requested but NOT found on origin (not merged, nothing to merge):
  `fix/ios-plist`, `fix/kt-debugwrite`, `fix/sleep-inbed`,
  `fix/version-align`. If they exist somewhere, merge them before archiving.

Decision of record: the App Store binary bundles the web build; TestFlight
builds may keep the remote URL (that path is the existing `build-ios.sh`).

## 3. Stage the store build

```
cd native && ./build-store.sh
```

It refuses a checkout behind origin/main or a dirty native/, builds `www/`
(plus `sw.js` and `version.json`), verifies every sw.js PRECACHE entry landed,
swaps in the store config, runs `npx cap sync ios` (or prints the exact
commands if `node_modules` is missing), restores the committed config, and
prints the Xcode steps. It never runs xcodebuild.

## 4. Xcode (manual, attended)

1. `open native/ios/App/App.xcodeproj`
2. Confirm the synced config is the store one:
   `/usr/bin/grep -c '"url"' native/ios/App/App/capacitor.config.json` expects `0`.
3. `plutil -lint native/ios/App/App/Info.plist` must say OK.
4. Signing & Capabilities: team `H8TRZ23C77`, automatic signing, bundle
   `com.boneheadz.gym` (per TESTFLIGHT.md).
5. Build number: `python3 native/asc.py next` prints the next free number on
   App Store Connect; set CURRENT_PROJECT_VERSION to it. Never trust the local
   pbxproj value, it lags uploads from other runs.
6. Destination Any iOS Device, Product > Archive, Distribute App > App Store
   Connect > Upload.

## 5. After the upload

Uploading is not distributing (build 11 once sat invisible for three days):

```
python3 native/asc.py distribute <build>   # waits for processing, adds the
                                           # internal group AND every
                                           # public-link group, submits beta review
python3 native/asc.py check                # exits non-zero unless a tester can
                                           # actually install it
```

Tom installs via the PUBLIC LINK, so `check` green means: newest build is in
the public-link group and beta review is approved, not just "in TestFlight".
For the App Store release itself: App Store Connect > App Store tab > add the
build to the 1.0 version, metadata is paste-ready in TESTFLIGHT.md, submit for
review.

## 6. Paste-ready terminal block

```
cd "/Users/tommiller/Documents/Hyperframes Editor/tally"
git fetch origin && git checkout native/attended-stack
cd native && ./build-store.sh
plutil -lint ios/App/App/Info.plist
/usr/bin/grep -c '"url"' ios/App/App/capacitor.config.json   # expect 0
python3 asc.py next
open ios/App/App.xcodeproj
# ... archive + upload in Xcode, then:
# python3 asc.py distribute <build> && python3 asc.py check
```
