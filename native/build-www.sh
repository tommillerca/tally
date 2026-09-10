#!/bin/bash
# Copy the PWA into the native webDir, minus dev/test-only files.
# Run from tally/native: ./build-www.sh
set -euo pipefail
SRC="$(cd .. && pwd)"
DST="$(pwd)/www"
rm -rf "$DST"
mkdir -p "$DST"
# privacy.html ships too: Settings' ABOUT row links it with a RELATIVE href and
# the native shell serves only what lands in www, so leaving it out 404s the one
# link App Store guideline 5.1.1(i) requires (R43-1).
cp "$SRC/index.html" "$SRC/app.css" "$SRC/manifest.webmanifest" "$SRC/privacy.html" "$DST/"
cp -R "$SRC/js" "$SRC/data" "$SRC/vendor" "$SRC/icons" "$SRC/assets" "$DST/"
mkdir -p "$DST/native"
cp "$SRC/native/capabilities.json" "$DST/native/"
if [ "${STORE_BUILD:-0}" = "1" ]; then
  sed -i '' 's/const STORE_BUILD = false;/const STORE_BUILD = true;/' "$DST/js/app.js"
  grep -q 'const STORE_BUILD = true;' "$DST/js/app.js"
fi
# the native shell has no use for the service worker (Capacitor serves locally)
# but keep it harmless: app.js only registers it on https.
echo "www built: $(du -sh "$DST" | cut -f1)"
