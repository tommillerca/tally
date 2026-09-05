#!/bin/bash
# Submission-prep build: bundled www (STORE_BUILD=true) + a capacitor config
# variant with server.url removed, so Capacitor serves the local www instead
# of the remote GitHub Pages shell. Never touches native/capacitor.config.json.
#
# Run from tally/native: ./build-store.sh
# Produces:
#   native/www/                       (STORE_BUILD bundle, same as build-www.sh)
#   native/capacitor.config.store.json (server key removed; gitignored, regenerated each run)
#
# Tom ruled the remote shell stays wired for testing speed until submission
# (docs/HANDOFF-CODEX-2026-09-05.md #6). This script prepares the bundled path
# without flipping native/capacitor.config.json. To actually build against the
# bundle at submission time: copy capacitor.config.store.json over
# capacitor.config.json (or symlink it) before `npx cap sync ios`, then restore.
set -euo pipefail
cd "$(dirname "$0")"

STORE_BUILD=1 ./build-www.sh

node -e '
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync("capacitor.config.json", "utf8"));
delete cfg.server;
fs.writeFileSync("capacitor.config.store.json", JSON.stringify(cfg, null, 2) + "\n");
'
echo "capacitor.config.store.json written (server.url removed)"
