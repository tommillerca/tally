#!/bin/bash
set -e
KEY=R6B586JNRN
ISS=4e28ee87-e98d-4a22-baef-dcf3a1941e59
NATIVE="/Users/tommiller/Documents/Hyperframes Editor/tally/native"
cd "$NATIVE"
echo "=== build-www + cap sync ==="
./build-www.sh
npx cap sync ios
cd ios/App

# Auto-increment. This used to be a hardcoded `sed 10 -> 11`, which meant running
# the script a second time silently produced a duplicate build number.
CUR=$(grep -m1 -o 'CURRENT_PROJECT_VERSION = [0-9]*' App.xcodeproj/project.pbxproj | grep -o '[0-9]*')
NEXT=$((CUR + 1))
echo "=== bump build $CUR -> $NEXT ==="
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
echo "=== IOS BUILD $NEXT DONE ==="
