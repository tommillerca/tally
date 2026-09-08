#!/bin/bash
set -e
KEY=R6B586JNRN
ISS=4e28ee87-e98d-4a22-baef-dcf3a1941e59
# Fail before any build, config mutation, signing or network operation.
case "${SUBMISSION:-}" in
  1) CHANNEL=submission ;;
  0) CHANNEL=internal ;;
  *) echo "BUILD REFUSED: set SUBMISSION=1 for App Store or SUBMISSION=0 for internal/TestFlight" >&2; exit 2 ;;
esac
NATIVE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$NATIVE"

# Both channels are explicit. Internal builds keep the remote shell for testing.
# Submission builds carry a content-bound marker and use separate artifact paths.
# Validate the copied iOS resources and then the archive itself before export.
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
    "$NATIVE/ios/App/App/public/js/app.js" "$NATIVE/ios/App/App/capacitor.config.json" \
    "$NATIVE/ios/App/App/public/submission.json"
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

ARCHIVE="build/$CHANNEL/App.xcarchive"
EXPORT="build/$CHANNEL/export"
rm -rf "$ARCHIVE" "$EXPORT"
echo "=== archive ==="
xcodebuild -project App.xcodeproj -scheme App -configuration Release \
  -archivePath "$ARCHIVE" archive -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_$KEY.p8 \
  -authenticationKeyID $KEY -authenticationKeyIssuerID $ISS
if [ "$CHANNEL" = "submission" ]; then
  APP="$ARCHIVE/Products/Applications/App.app"
  node "$NATIVE/submission-preflight.mjs" \
    "$APP/public/js/app.js" "$APP/capacitor.config.json" "$APP/public/submission.json"
fi
echo "=== export $CHANNEL ==="
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportPath "$EXPORT" \
  -exportOptionsPlist "$NATIVE/build/exportOptions.plist" -allowProvisioningUpdates \
  -authenticationKeyPath ~/.appstoreconnect/private_keys/AuthKey_$KEY.p8 \
  -authenticationKeyID $KEY -authenticationKeyIssuerID $ISS
echo "=== upload to TestFlight ==="
xcrun altool --upload-app -f "$EXPORT"/*.ipa -t ios \
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
echo "=== IOS $CHANNEL BUILD $NEXT DONE: $EXPORT ==="
