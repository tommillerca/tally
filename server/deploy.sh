#!/usr/bin/env bash
# DEPLOY THE WORKER, AND PROVE IT.
#
# 2026-08-14 cost two rounds of "it's deployed" that were not true, in two
# different ways, so this script exists to make both of them exit non-zero:
#
#   1. The checkout was three releases behind main, so `wrangler deploy`
#      published v373's server file. The deploy SUCCEEDED. It shipped the wrong
#      code, and nothing said so.
#   2. Nobody asked the deployed worker whether the route was there afterwards.
#      /steps/settled answered 404 while every local test was green.
#
# So: refuse to deploy a stale tree, then interrogate the LIVE worker about
# every route this file claims to serve. `wrangler deploy` returning 0 is not
# evidence that a player can reach anything.
set -euo pipefail
cd "$(dirname "$0")"

API="${API:-https://bonez-api.boneheadz.workers.dev}"

echo "== 1. is this tree what main says it is?"
git fetch -q origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" != "$REMOTE" ]; then
  # Behind is fatal. Ahead of main is not: deploying a branch under test is a
  # real thing to want, and it is visible on the line below.
  if git merge-base --is-ancestor "$LOCAL" "$REMOTE"; then
    echo "REFUSING: this checkout is BEHIND origin/main."
    echo "  here:       $(git log --oneline -1 HEAD)"
    echo "  origin/main:$(git log --oneline -1 origin/main)"
    echo "  fix:        git merge --ff-only origin/main"
    exit 1
  fi
  echo "  note: deploying a tree that is not origin/main ($(git rev-parse --short HEAD))"
fi
if ! git diff --quiet -- src/ ; then
  echo "  note: src/ has uncommitted changes; they are going live"
fi

echo "== 1b. does the live DB have what this tree queries?"
# /events reads `rl` on every request, so deploying ahead of the migration turns
# analytics ingest into a 500 for everyone. A missing migration must stop the
# deploy, not surface as a live incident.
if ! npx wrangler d1 execute bonez --remote --command "SELECT 1 FROM rl LIMIT 1" > /dev/null 2>&1; then
  echo "REFUSING: table 'rl' is missing from the remote D1."
  echo "  fix: npx wrangler d1 execute bonez --remote --file=migrations/2026-08-17-events-ratelimit.sql"
  exit 1
fi

echo "== 2. tests before the deploy, not after"
npx wrangler dev --local --port 8791 --var DEV:1 --var ADMIN_TOKEN:devtoken > /tmp/bonez-predeploy.log 2>&1 &
DEV_PID=$!
trap 'kill $DEV_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:8791/health > /dev/null 2>&1 && break
  sleep 2
done
API=http://127.0.0.1:8791 node test/api.test.mjs
kill $DEV_PID 2>/dev/null || true
trap - EXIT

echo "== 3. deploy"
npx wrangler deploy

echo "== 4. ASK THE LIVE WORKER, because a green deploy is not a reachable route"
# Every signed route answers 401 unsigned. A route that is NOT DEPLOYED falls
# through to the worker's 404, so 401-vs-404 is the discriminator, and it needs
# no key material to read.
fail=0
check() {   # check <path> <expected> <what it means>
  code=$(curl -s -o /dev/null -w '%{http_code}' "$API$1")
  if [ "$code" = "$2" ]; then
    echo "  ok   $1 -> $code"
  else
    echo "  FAIL $1 -> $code, expected $2 ($3)"
    fail=1
  fi
}
check "/health" 200 "the worker is up at all"
check "/steps/week?week=2026-08-14" 401 "the live race board is routed"
check "/steps/settled?week=2026-08-07" 401 "the settled-result route is routed; 404 means this deploy did not include it"

if [ "$fail" != "0" ]; then
  echo
  echo "DEPLOYED, BUT THE LIVE WORKER DOES NOT SERVE WHAT THIS TREE CLAIMS."
  echo "Do not tell anyone the feature is live."
  exit 1
fi
echo
echo "deployed and reachable: $(git log --oneline -1 HEAD)"
