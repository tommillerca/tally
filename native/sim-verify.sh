#!/usr/bin/env bash
# WHAT IS THE SIMULATOR ACTUALLY RUNNING? Answer it before believing anything you
# see on it.
#
# 2026-08-26. The installed build was pointed at a local dev server
# (http://192.168.40.24:8900) that had since been killed. The app kept opening,
# because a WKWebView serves the dead origin out of its own NetworkCache, and it
# had NO service worker at all: an http:// non-localhost origin is not a secure
# context, so the PWA precache never applied. So it rendered a months-old mixture
# of whatever that cache happened to hold. Two Boneyard icons appeared to be
# missing; measured, bone.png had 0 cache hits and egg-basic.png 0, while
# coin.png had 3 and crate.png 11. Both files are fine live and both are in
# PRECACHE. An hour went into a bug that did not exist.
#
# It was not the first time. Tom: "this isn't the first time youve tested with
# the simulator on an old broken build (which is crazy btw) make sure you are
# always testing on the most recent build otherwise wtf is the point".
#
# So this asks the INSTALLED BUNDLE what origin it loads, asks that origin what
# it serves, and refuses when the answer is not what you meant. It never guesses
# from the repo, because the repo is not what the phone is running.
#
#   native/sim-verify.sh                 # expect the live site's current version
#   native/sim-verify.sh v455            # expect exactly this build
#   native/sim-verify.sh --url http://…  # expect the app to point HERE
#
# Exit 0 = the simulator is running what you think. Exit 1 = it is not, and the
# message says which of the three links in the chain broke. Exit 2 = could not
# check at all, which is NOT a pass.

set -uo pipefail

BUNDLE="${BUNDLE_ID:-com.boneheadz.gym}"
LIVE="${LIVE_URL:-https://tommillerca.github.io/tally}"
WANT_VER=""; WANT_URL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --url) WANT_URL="$2"; shift 2 ;;
    *) WANT_VER="$1"; shift ;;
  esac
done

say() { printf '%s\n' "$*"; }
die2() { say "CANNOT CHECK: $*"; say "  This is not a pass. Do not report simulator results."; exit 2; }

# ---- 1. is there a booted device, and is the app installed on it ----
UDID="${UDID:-$(xcrun simctl list devices booted 2>/dev/null | sed -n 's/.*(\([0-9A-F-]\{36\}\)) (Booted).*/\1/p' | head -1)}"
[ -n "$UDID" ] || die2 "no booted simulator."
APPDIR=$(xcrun simctl get_app_container "$UDID" "$BUNDLE" 2>/dev/null) \
  || die2 "$BUNDLE is not installed on $UDID."
CFG="$APPDIR/capacitor.config.json"
[ -f "$CFG" ] || die2 "no capacitor.config.json inside the installed bundle."

# ---- 2. what origin does the INSTALLED bundle load ----
URL=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('server',{}).get('url','') or '')" "$CFG" 2>/dev/null)
if [ -z "$URL" ]; then
  say "ok   the installed build serves its own bundled www (no server.url), so there is no origin to go stale."
  say "     Bundle: $APPDIR"
  exit 0
fi
say "     installed build points at: $URL"

if [ -n "$WANT_URL" ] && [ "${URL%%\?*}" != "${WANT_URL%%\?*}" ]; then
  say "FAIL the app points at $URL but you expected $WANT_URL."
  say "     Rebuild and reinstall; the bundle is what decides this, not the repo."
  exit 1
fi

# ---- 3. is that origin actually serving, and what version ----
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL" 2>/dev/null)
if [ "$CODE" != "200" ]; then
  say "FAIL that origin answered HTTP $CODE."
  say "     The app will still OPEN: a WKWebView serves a dead origin out of its own"
  say "     cache, so it shows stale bytes and looks fine. Anything you test on it is"
  say "     a fiction. Start the server, or reinstall pointed at $LIVE."
  exit 1
fi

BASE="${URL%%\?*}"; BASE="${BASE%/}"
SERVED=$(curl -s --max-time 10 "$BASE/version.json?_=$$" 2>/dev/null | tr -d ' \n' | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
[ -n "$SERVED" ] || die2 "that origin answered 200 but served no readable version.json."
say "     that origin is serving:    $SERVED"

# a non-secure origin gets NO service worker, which is its own class of staleness
case "$BASE" in
  https://*|http://localhost*|http://127.0.0.1*) ;;
  *) say "WARN $BASE is not a secure context, so the service worker never registers."
     say "     PRECACHE does not apply and asset staleness behaves nothing like production." ;;
esac

EXPECT="$WANT_VER"
if [ -z "$EXPECT" ]; then
  EXPECT=$(curl -s --max-time 10 "$LIVE/version.json?_=$$" 2>/dev/null | tr -d ' \n' | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
  [ -n "$EXPECT" ] || die2 "could not read the live version from $LIVE to compare against."
  say "     live currently serves:     $EXPECT"
fi
case "$EXPECT" in tally-*) ;; *) EXPECT="tally-$EXPECT" ;; esac

if [ "$SERVED" != "$EXPECT" ]; then
  say "FAIL the simulator would run $SERVED but you expected $EXPECT."
  exit 1
fi
say "ok   the simulator runs $SERVED, from an origin that is actually answering."
