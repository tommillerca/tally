#!/usr/bin/env bash
# Boneheadz Gym: native build readiness check.
# Run any time: `bash native/preflight.sh`
# Tells you exactly what (if anything) is still blocking a device build.

set -u
cd "$(dirname "$0")"
bold=$(tput bold 2>/dev/null || true); dim=$(tput dim 2>/dev/null || true); rst=$(tput sgr0 2>/dev/null || true)
ok(){ printf "  ✅ %s\n" "$1"; }
no(){ printf "  ❌ %s\n" "$1"; }
warn(){ printf "  ⚠️  %s\n" "$1"; }
blocked=0

echo "${bold}Boneheadz Gym: native preflight${rst}"
echo

echo "${bold}1. Xcode (free, the hard prerequisite)${rst}"
dev="$(xcode-select -p 2>/dev/null || true)"
if echo "$dev" | grep -q "Xcode.app"; then
  ver="$(xcodebuild -version 2>/dev/null | head -1)"
  ok "Xcode active: $ver"
  if xcrun simctl list devices available 2>/dev/null | grep -qi iphone; then
    ok "iOS Simulator available"
  else
    warn "No iOS simulator runtime yet (open Xcode once, or Settings > Components)"
  fi
else
  no "Xcode not installed (found: ${dev:-nothing})"
  echo "     ${dim}Install from the Mac App Store, then run:"
  echo "     sudo xcode-select -s /Applications/Xcode.app/Contents/Developer${rst}"
  blocked=1
fi
echo

echo "${bold}2. Signing identity (needs your Apple ID in Xcode)${rst}"
ids="$(security find-identity -v -p codesigning 2>/dev/null | grep -c "Apple Develop" || true)"
if [ "${ids:-0}" -gt 0 ]; then
  ok "$ids Apple signing identity(ies) present"
else
  no "No Apple signing identity yet"
  echo "     ${dim}Xcode > Settings > Accounts > add your Apple ID."
  echo "     Free ID = 7-day device installs. Paid program = 1 year + TestFlight + push + reliable HealthKit.${rst}"
  blocked=1
fi
echo

echo "${bold}3. Project wiring (already done, verifying)${rst}"
[ -f capacitor.config.json ] && grep -q "com.boneheadz.gym" capacitor.config.json && ok "bundle id com.boneheadz.gym" || no "bundle id missing"
[ -f ios/App/App/App.entitlements ] && grep -q "healthkit" ios/App/App/App.entitlements && ok "HealthKit entitlement present" || no "HealthKit entitlement missing"
grep -q "NSHealthShareUsageDescription" ios/App/App/Info.plist 2>/dev/null && ok "Health usage strings present" || no "Health usage strings missing"
[ -f ios/App/App/HealthPlugin.swift ] && ok "Swift HealthKit plugin present" || no "HealthPlugin.swift missing"
[ -d ios/App/CapApp-SPM ] && ok "Swift Package Manager (no CocoaPods needed)" || warn "SPM package not found"
if command -v npx >/dev/null 2>&1; then ok "node/npx available ($(node -v 2>/dev/null))"; else no "node/npx missing"; blocked=1; fi
echo

echo "${bold}Verdict${rst}"
if [ "$blocked" -eq 0 ]; then
  echo "  ${bold}GO.${rst} Build it:"
  echo "    ${dim}cd native && ./build-www.sh && npx cap sync ios && npx cap open ios${rst}"
  echo "  Then in Xcode: pick your team under Signing & Capabilities, pick your iPhone, press Run."
else
  echo "  ${bold}BLOCKED${rst} on the ❌ items above. Everything else is ready and waiting."
  echo "  See ${bold}native/SETUP.md${rst} for the click-by-click."
fi
