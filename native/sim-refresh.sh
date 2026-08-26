#!/usr/bin/env bash
# PUT THE SIMULATOR ON WHAT JUST SHIPPED. Run this at the END of a release.
#
# native/sim-verify.sh is the backstop: it BLOCKS you from reading a result off a
# stale simulator. This is the thing that stops the backstop having to fire. Tom,
# 2026-08-26, on being asked where a check should live: "maybe everytime you ship
# a new build theres a check to see if the ios simulator is on a new build?"
#
# BE HONEST ABOUT WHAT THIS IS. A ship-time refresh is NOT a substitute for the
# test-time check and cannot be, because staleness happens AFTER the ship: the
# origin can die at 11am and you test at 2pm. The pair is the point. This one
# reduces how often the backstop fires; the backstop is what makes a miss safe.
#
# It always points at the LIVE site, never a local server. Pointing the installed
# bundle at a dev server is what caused the incident this whole pair exists for:
# the server was killed, the WKWebView kept serving the dead origin out of its own
# cache, and an hour went into a bug that did not exist.
#
#   native/sim-refresh.sh              # build + install against live, then verify
#   native/sim-refresh.sh v456         # and require the live site to be on v456
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
BUNDLE="${BUNDLE_ID:-com.boneheadz.gym}"
LIVE="${LIVE_URL:-https://tommillerca.github.io/tally}"
WANT="${1:-}"

UDID="${UDID:-$(xcrun simctl list devices booted 2>/dev/null | sed -n 's/.*(\([0-9A-F-]\{36\}\)) (Booted).*/\1/p' | head -1)}"
[ -n "$UDID" ] || { echo "no booted simulator. Boot one and re-run."; exit 2; }

# 1. the live site has to actually be serving what you think BEFORE you install.
SERVED=$(curl -s --max-time 15 "$LIVE/version.json?_=$$" | tr -d ' \n' | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
[ -n "$SERVED" ] || { echo "FAIL $LIVE served no readable version.json. Is the deploy finished?"; exit 1; }
if [ -n "$WANT" ]; then
  case "$WANT" in tally-*) ;; *) WANT="tally-$WANT" ;; esac
  [ "$SERVED" = "$WANT" ] || { echo "FAIL live serves $SERVED but you expected $WANT. The deploy has not landed; do not install yet."; exit 1; }
fi
echo "==> live is serving $SERVED"

# 2. the bundle must point at live, not at whatever the last experiment left behind.
cd "$HERE"
CFG="capacitor.config.json"
CUR=$(python3 -c "import json;print(json.load(open('$CFG')).get('server',{}).get('url',''))")
case "$CUR" in
  "$LIVE"|"$LIVE/") ;;
  *) echo "==> capacitor.config.json points at '$CUR', restoring the committed value"
     git checkout -- "$CFG"
     CUR=$(python3 -c "import json;print(json.load(open('$CFG')).get('server',{}).get('url',''))")
     case "$CUR" in "$LIVE"|"$LIVE/") ;; *) echo "FAIL even the committed config points at '$CUR', not $LIVE."; exit 1 ;; esac ;;
esac

# A WORKTREE HAS NO node_modules, so `npx cap` there resolves to nothing and dies
# with a bare npm error. Say which problem it is instead of leaking that.
if [ ! -x node_modules/.bin/cap ] && [ ! -d node_modules/@capacitor ]; then
  echo "FAIL no capacitor install in $HERE (node_modules missing)."
  echo "     Run this from the real checkout, not a git worktree: worktrees do not"
  echo "     carry node_modules, and the iOS project's Pods live there too."
  exit 2
fi
npx cap sync ios >/dev/null
DD="${DERIVED:-/tmp/sim-refresh-dd}"
echo "==> building for the simulator"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath "$DD" build >/dev/null
APP="$DD/Build/Products/Debug-iphonesimulator/App.app"
[ -d "$APP" ] || { echo "FAIL the build produced no App.app at $APP"; exit 1; }

xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
xcrun simctl install "$UDID" "$APP"
xcrun simctl launch "$UDID" "$BUNDLE" >/dev/null
echo "==> installed and launched"

# 3. ASSERT THE END OF THE CHAIN. Installing is not the same as running it.
rm -f /tmp/.sim-freshness-ok
exec "$HERE/sim-verify.sh" ${WANT:+"$WANT"}
