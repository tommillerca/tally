#!/bin/bash
# Copy the PWA into the native webDir, minus dev/test-only files.
# Run from tally/native: ./build-www.sh
set -euo pipefail
SRC="$(cd .. && pwd)"
DST="$(pwd)/www"
rm -rf "$DST"
mkdir -p "$DST"
cp "$SRC/index.html" "$SRC/app.css" "$SRC/manifest.webmanifest" "$DST/"
cp -R "$SRC/js" "$SRC/data" "$SRC/vendor" "$SRC/icons" "$SRC/assets" "$DST/"
# the native shell has no use for the service worker (Capacitor serves locally)
# but keep it harmless: app.js only registers it on https.
echo "www built: $(du -sh "$DST" | cut -f1)"
