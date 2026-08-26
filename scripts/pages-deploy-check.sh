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
#
# 2026-08-26: THE VERSION CHECK ALONE WAS VACUOUS ON EVERY NON-RELEASE COMMIT,
# which is most of them. It reads the version out of the tree and polls live for
# it, so on a commit that does not bump the version the answer is already live
# from the PREVIOUS release and the poll matches on attempt 1. Measured on
# ffdd1050 (#183, a test-harness fix):
#     == expecting 'v451' at https://tommillerca.github.io/tally
#        attempt=1 seen=tally-v451 expected=tally-v451
#     OK  live ... serves tally-v451.
# 0.14 seconds, green, and no evidence whatsoever that #183's bytes had reached
# the site. Four of the last five greens were that shape. The run it should have
# caught is cf880477 (#185), whose Pages build was cancelled after 24m28s with
# the site still on the old bytes.
#
# So the version poll is no longer the whole check. CONTENT polls the live copy
# of every servable file THIS COMMIT CHANGED and compares sha256 against the
# tree. That is a claim about this deploy rather than about some earlier one,
# and it cannot pass on nothing: a commit that changed no servable file says so
# by name instead of reporting a green.

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
    break
  fi

  sleep "$POLL_INTERVAL_SECS"
done

# --------------------------------------------------------------------------
# CONTENT: the files THIS COMMIT changed, byte for byte, off the live origin
# --------------------------------------------------------------------------
# The poll above is about a version STRING, and on a commit that did not bump it
# the string was already live before this run started (see the header). This is
# the half that makes a claim about THIS deploy: every servable file the commit
# touched must hash the same live as it does in the tree.
#
# Needs HEAD^, so the workflow checks out with fetch-depth: 2. Where there is no
# parent (a hand run on a shallow tree, the first commit) it says so and grades
# the release stamps instead, which is the case the version poll already covers.

sha() { if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1; else shasum -a 256 | cut -d' ' -f1; fi; }

echo
if ! git -C "$REPO" rev-parse --verify -q HEAD^ >/dev/null 2>&1; then
  echo "CONTENT: no parent commit reachable (shallow clone or first commit)."
  echo "  Falling back to the release stamps, which the poll above already graded."
  CHANGED=$(cd "$REPO" && ls sw.js js/app.js app.css version.json 2>/dev/null)
else
  CHANGED=$(git -C "$REPO" diff --name-only --diff-filter=d HEAD^ HEAD)
fi

# Pages serves the repo root, so nearly everything counts. Only drop what the
# site genuinely cannot serve.
SERVABLE=$(printf '%s\n' "$CHANGED" | grep -vE '^(\.github/|\.gitignore|native/|server/)' | grep -v '^$' || true)

if [ -z "$SERVABLE" ]; then
  echo "CONTENT: this commit changed no servable file, so there is nothing on the"
  echo "  site that should have moved. Not a pass and not a failure: no claim."
  exit 0
fi

# NO SILENT CAP: a bounded check that quietly drops files reads as coverage.
TOTAL=$(printf '%s\n' "$SERVABLE" | wc -l | tr -d ' ')
MAXF="${MAX_CONTENT_FILES:-12}"
LIST=$(printf '%s\n' "$SERVABLE" | head -n "$MAXF")
if [ "$TOTAL" -gt "$MAXF" ]; then
  echo "CONTENT: $TOTAL servable files changed; checking the first $MAXF. The rest are NOT graded:"
  printf '%s\n' "$SERVABLE" | tail -n +$(( MAXF + 1 )) | sed 's/^/    ungraded  /'
fi

deadline=$(( $(date +%s) + POLL_TIMEOUT_SECS ))
stale=""
while :; do
  stale=""
  now=$(date +%s)
  for f in $LIST; do
    want=$(sha < "$REPO/$f")
    got=$(curl -fsS --max-time 20 "$SITE_URL/$f?_=$now" 2>/dev/null | sha)
    [ "$want" = "$got" ] || stale="$stale $f"
  done
  if [ -z "$stale" ]; then
    echo "OK  live serves this commit's bytes for all $(printf '%s\n' "$LIST" | wc -l | tr -d ' ') changed file(s):"
    printf '%s\n' "$LIST" | sed 's/^/      /'
    exit 0
  fi
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "GUARD: waited ${POLL_TIMEOUT_SECS}s and the live site still serves DIFFERENT bytes for:"
    for f in $stale; do echo "    stale  $f"; done
    echo "  main carries this commit, the site does not. Do not tell anyone it is live."
    exit 1
  fi
  echo "  content: still stale ->$stale"
  sleep "$POLL_INTERVAL_SECS"
done
