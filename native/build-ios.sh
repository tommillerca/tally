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
echo "=== bump build 7 -> 8 ==="
sed -i '' 's/CURRENT_PROJECT_VERSION = 9;/CURRENT_PROJECT_VERSION = 9;/g' App.xcodeproj/project.pbxproj
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
echo "=== IOS BUILD 8 DONE ==="
