#!/bin/bash
set -e
KEY=R6B586JNRN
ISS=4e28ee87-e98d-4a22-baef-dcf3a1941e59
NATIVE="/Users/tommiller/Documents/Hyperframes Editor/tally/native"
cd "$NATIVE"

# SUBMISSION=1 is the ONLY path that may be uploaded to the App Store, and it is
# deliberately not the default: Tom ruled the remote shell stays wired for
# internal/TestFlight builds because it makes testing fast
# (docs/HANDOFF-CODEX-2026-09-05.md #6). Without the flag this script behaves
# exactly as it always has.
#
# It delegates the bundle and the no-server config to build-store.sh rather than
# repeating them, so the two cannot drift, then swaps the config in for the sync
# and restores it on EXIT even if the archive fails.
if [ "${SUBMISSION:-0}" = "1" ]; then
  echo "=== SUBMISSION build: bundled www, beta surfaces off, no server URL ==="
  ./build-store.sh
  CONFIG_BACKUP="$(mktemp "$NATIVE/capacitor.config.json.submission.XXXXXX")"
  cp "$NATIVE/capacitor.config.json" "$CONFIG_BACKUP"
  restore_config() { cp "$CONFIG_BACKUP" "$NATIVE/capacitor.config.json"; rm -f "$CONFIG_BACKUP"; }
  trap restore_config EXIT
  cp "$NATIVE/capacitor.config.store.json" "$NATIVE/capacitor.config.json"
  npx cap sync ios
  # Assert the bundle that is about to be archived, not the repo. Exits non-zero.
  node "$NATIVE/submission-preflight.mjs" \
    "$NATIVE/www/js/app.js" "$NATIVE/ios/App/App/capacitor.config.json"
else
  echo "=== internal build: remote shell, beta surfaces on ==="
  ./build-www.sh
  npx cap sync ios
fi
cd ios/App

# PREFLIGHT. The build number comes from App Store Connect, not from this repo:
# the local pbxproj can lag behind what is already uploaded (a failed run, a build
# from another machine), and Apple only rejects a duplicate AFTER a full archive
# and upload. This used to be a hardcoded `sed 10 -> 11`, so a second run would
# have silently produced a duplicate.
CUR=$(grep -m1 -o 'CURRENT_PROJECT_VERSION = [0-9]*' App.xcodeproj/project.pbxproj | grep -o '[0-9]*')
NEXT=$(python3 "$NATIVE/asc.py" next)
if [ -z "$NEXT" ]; then echo "PREFLIGHT FAILED: could not reach App Store Connect"; exit 1; fi
echo "=== bump build $CUR (local) -> $NEXT (next free on App Store Connect) ==="
sed -i '' "s/CURRENT_PROJECT_VERSION = $CUR;/CURRENT_PROJECT_VERSION = $NEXT;/g" App.xcodeproj/project.pbxproj

rm -rf build/App.xcarchive build/export
echo "=== archive ==="
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -archivePath build/App.xcarchive archive -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_$KEY.p8 \
  -authenticationKeyID $KEY -authenticationKeyIssuerID $ISS
echo "=== export ==="
xcodebuild -exportArchive -archivePath build/App.xcarchive -exportPath build/export \
  -exportOptionsPlist "$NATIVE/build/exportOptions.plist" -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_$KEY.p8 \
  -authenticationKeyID $KEY -authenticationKeyIssuerID $ISS
echo "=== upload to TestFlight ==="
xcrun altool --upload-app -f build/export/*.ipa -t ios \
  --apiKey $KEY --apiIssuer $ISS

# Uploading is NOT distributing. A build with no group is invisible in TestFlight,
# which is how build 11 sat unused for three days while the phone showed 10. Wait
# for processing, then add it to the internal group (no Apple review needed).
echo "=== distribute build $NEXT to the internal group ==="
python3 "$NATIVE/asc.py" distribute "$NEXT"
python3 "$NATIVE/asc.py" list

# POSTFLIGHT. Assert the outcome that matters (a tester can install it), not just
# that the upload returned 200. `check` exits non-zero, so this script can never
# again report a successful build over a release nobody can see.
echo "=== postflight check ==="
python3 "$NATIVE/asc.py" check
echo "=== IOS BUILD $NEXT DONE ==="
