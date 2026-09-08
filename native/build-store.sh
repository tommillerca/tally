#!/bin/bash
# Submission-prep build: bundled www (STORE_BUILD=true) + a capacitor config
# variant with server.url removed, so Capacitor serves the local www instead
# of the remote GitHub Pages shell. Never touches native/capacitor.config.json.
#
# Run from tally/native: ./build-store.sh
# Produces:
#   native/www/                       (STORE_BUILD bundle plus submission.json)
#   native/capacitor.config.store.json (server key removed; gitignored, regenerated each run)
#
# This only prepares files. Tom uses SUBMISSION=1 native/build-ios.sh to sync,
# validate the copied resources, archive, validate again, and export/upload.
set -euo pipefail
cd "$(dirname "$0")"

STORE_BUILD=1 ./build-www.sh

node -e '
const fs = require("fs");
const { createHash } = require("crypto");
const cfg = JSON.parse(fs.readFileSync("capacitor.config.json", "utf8"));
delete cfg.server;
const appSha256 = createHash("sha256").update(fs.readFileSync("www/js/app.js")).digest("hex");
fs.writeFileSync("www/submission.json", JSON.stringify({ kind: "submission", appSha256 }, null, 2) + "\n");
fs.writeFileSync("capacitor.config.store.json", JSON.stringify(cfg, null, 2) + "\n");
'
echo "capacitor.config.store.json written (server.url removed)"
