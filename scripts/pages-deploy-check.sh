#!/usr/bin/env bash
# PAGES DEPLOY GUARD: prove the site actually serves the version main declares.
#
# 2026-08-14 cost a full round of "the PR is merged, so v378 is live" that was
# not true, in a way that lied at every step. A Pages build failed on a
# node_modules symlink committed by accident; `gh pr merge` reported success;
# CI's Pages step turned green through some path that never republished the
# site; the live sw.js kept serving tally-v377 while main carried tally-v378.
# Merged, deployed and live are three different states and only the last one
# counts.
#
# So this asks the LIVE thing what it serves, and exits non-zero when the
# answer is not the version this tree declares. It runs post-merge in the
# CI workflow that follows the Pages deploy, or by hand any time somebody
# wants to know whether the site actually caught up.
#
# It never touches the deployment. Its only job is to REFUSE to declare a
# release live when it is not.

set -euo pipefail

# --------------------------------------------------------------------------
# CONFIG (override via env when needed; defaults match the current setup)
# --------------------------------------------------------------------------

SITE_URL="${SITE_URL:-https://tommillerca.github.io/tally}"
POLL_TIMEOUT_SECS="${POLL_TIMEOUT_SECS:-300}"   # 5 min: Pages usually publishes in ~1 min
POLL_INTERVAL_SECS="${POLL_INTERVAL_SECS:-10}"
EXPECTED_VERSION="${EXPECTED_VERSION:-}"        # if unset, read from tree

# --------------------------------------------------------------------------
# DETERMINE THE EXPECTED VERSION
# --------------------------------------------------------------------------
# The tree declares its version in two places that must match. If they don't,
# the tree itself is inconsistent and no deploy check can fix that.
here() { cd "$(dirname "$0")/.."; pwd; }
REPO="$(here)"

if [ -z "$EXPECTED_VERSION" ]; then
  SW_VER=$(grep -oE "const VERSION = 'tally-v[0-9]+'" "$REPO/sw.js" | grep -oE "v[0-9]+")
  APP_VER=$(grep -oE "const APP_BUILD = 'v[0-9]+'" "$REPO/js/app.js" | grep -oE "v[0-9]+")
  if [ -z "$SW_VER" ] || [ -z "$APP_VER" ]; then
    echo "GUARD: could not read version from tree (sw.js VERSION or js/app.js APP_BUILD)."
    echo "  sw.js  match: '$SW_VER'"
    echo "  app.js match: '$APP_VER'"
    exit 2
  fi
  if [ "$SW_VER" != "$APP_VER" ]; then
    echo "GUARD: tree is INCONSISTENT: sw.js VERSION=$SW_VER but js/app.js APP_BUILD=$APP_VER."
    echo "  fix in the tree; bump them together."
    exit 2
  fi
  EXPECTED_VERSION="$SW_VER"
fi

echo "== expecting '$EXPECTED_VERSION' at $SITE_URL"

# --------------------------------------------------------------------------
# POLL THE LIVE sw.js
# --------------------------------------------------------------------------
# Cache-bust every fetch so we read what the CDN's ORIGIN serves, not a stale
# edge cached from before the deploy. `?_=timestamp` is enough for GitHub Pages
# to skip the edge cache; the origin is the source of truth for this check.
deadline=$(( $(date +%s) + POLL_TIMEOUT_SECS ))
attempt=0
last_seen=""

while :; do
  attempt=$(( attempt + 1 ))
  now=$(date +%s)
  if [ "$now" -ge "$deadline" ]; then
    echo
    echo "GUARD: waited ${POLL_TIMEOUT_SECS}s; live sw.js is still '$last_seen', expected 'tally-$EXPECTED_VERSION'."
    echo "  Do not tell anyone $EXPECTED_VERSION is live."
    exit 1
  fi

  body=$(curl -fsS --max-time 15 "$SITE_URL/sw.js?_=$now" 2>/dev/null || true)
  seen=$(printf '%s' "$body" | grep -oE "const VERSION = 'tally-v[0-9]+'" | grep -oE "v[0-9]+" | head -1)
  last_seen="tally-${seen:-?}"
  echo "  attempt=$attempt seen=$last_seen expected=tally-$EXPECTED_VERSION"

  if [ "$seen" = "$EXPECTED_VERSION" ]; then
    echo
    echo "OK  live $SITE_URL/sw.js serves tally-$EXPECTED_VERSION."
    exit 0
  fi

  sleep "$POLL_INTERVAL_SECS"
done
