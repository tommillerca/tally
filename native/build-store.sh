#!/bin/bash
# STORE-BUNDLE PREP. Run ONLY in an attended Xcode session (native builds are
# attended-only in this project). This script prepares the bundled-web-build
# native project for the App Store binary; it NEVER runs xcodebuild itself.
#
# Decision (2026-08-30): the App Store binary bundles the web build (webDir),
# so a reviewer and a buyer get an app that works with no network and no
# dependence on the GitHub Pages origin. TestFlight builds may keep the remote
# URL (capacitor.config.json as committed); that path is native/build-ios.sh.
#
# What this does:
#   1. Refuses to run if this checkout is BEHIND origin/main (same guard as
#      server/deploy.sh step 1: behind is fatal, ahead of main is a note).
#   2. Builds www/ via build-www.sh, then adds sw.js and version.json.
#   3. Verifies every sw.js PRECACHE entry actually landed in www/.
#   4. Swaps in capacitor.config.store.json (no server.url, so the WKWebView
#      serves the bundled webDir), runs `npx cap sync ios` if node_modules
#      exist, and restores the committed config either way.
#   5. Prints the manual Xcode steps and exits. Archiving is Tom's hands.
set -euo pipefail
cd "$(dirname "$0")"

echo "== 1. is this tree what its branch says it is?"
git fetch -q origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
  if git merge-base --is-ancestor "$LOCAL" "$REMOTE"; then
    echo "REFUSING: this checkout is BEHIND origin/main."
    echo "  here:        $(git log --oneline -1 HEAD)"
    echo "  origin/main: $(git log --oneline -1 origin/main)"
    echo "  fix:         git merge --ff-only origin/main"
    exit 1
  fi
  echo "  note: building a tree that is not origin/main ($(git rev-parse --short HEAD))"
fi
if ! git diff --quiet -- . ; then
  echo "REFUSING: uncommitted changes under native/; a store binary must trace to a commit."
  git status --short -- .
  exit 1
fi

echo "== 2. build www/ (bundled web app)"
./build-www.sh
# build-www.sh skips the service worker (useless under a remote URL). The
# bundled build ships it plus the version stamp it polls, so the app is
# byte-identical to what the live site serves.
cp ../sw.js ../version.json www/

echo "== 3. every sw.js PRECACHE entry must exist in www/"
node -e '
  const fs = require("fs");
  const sw = fs.readFileSync("www/sw.js", "utf8");
  const m = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
  if (!m) { console.error("FAIL: no PRECACHE array found in sw.js"); process.exit(1); }
  const paths = [...m[1].matchAll(/\x27\.\/([^\x27]+)\x27/g)].map(x => x[1]);
  if (paths.length < 30) { console.error("FAIL: only " + paths.length + " precache entries parsed; parser broke"); process.exit(1); }
  const missing = paths.filter(p => !fs.existsSync("www/" + p));
  if (missing.length) { console.error("FAIL: precached but not in www/:\n  " + missing.join("\n  ")); process.exit(1); }
  console.log("  " + paths.length + " precache entries all present in www/");
'

echo "== 4. swap in the store config (webDir, no server.url) and sync"
cp capacitor.config.json capacitor.config.json.remote-url.bak
trap 'mv capacitor.config.json.remote-url.bak capacitor.config.json' EXIT
cp capacitor.config.store.json capacitor.config.json
if [ -d node_modules ]; then
  npx cap sync ios
else
  echo "  node_modules missing; run this yourself from native/ before archiving:"
  echo ""
  echo "    cd \"$(pwd)\""
  echo "    npm ci"
  echo "    cp capacitor.config.store.json capacitor.config.json"
  echo "    npx cap sync ios"
  echo "    git checkout -- capacitor.config.json"
  echo ""
  echo "STOPPING: the ios project is NOT synced yet."
  exit 1
fi
# trap restores the committed remote-URL config; the synced ios project keeps
# the store config (cap sync copied it into ios/App/App/capacitor.config.json).

echo "== 5. done. Manual Xcode steps (attended):"
cat <<'STEPS'
  1. open native/ios/App/App.xcodeproj
  2. Confirm the synced config has NO server.url:
       /usr/bin/grep -c '"url"' ios/App/App/capacitor.config.json   # expect 0
  3. plutil -lint ios/App/App/Info.plist
  4. Signing: target App > Signing & Capabilities > team H8TRZ23C77,
     automatic signing, Release configuration.
  5. Bump the build number PAST the highest on App Store Connect:
       python3 asc.py next
  6. Product > Archive (Any iOS Device), then Distribute App > App Store Connect.
  7. After upload: python3 asc.py distribute <build> && python3 asc.py check
STEPS
echo "== STORE PREP DONE (no xcodebuild was run) =="
