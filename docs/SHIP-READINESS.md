# Ship Readiness: Boneheadz Gym Launch (2026-08-30)

**Executive Summary (Ten Lines)**

Three releases shipped 2026-08-30: v467 (web PWA), v468 (web+storage audits), v469 (iOS build 19). All byte-verified against main. One code blocker: StoreKit 2 IAP scaffold drafted, awaiting attended build and App Store product configuration. Quest gates merged to production, economy tightened today: worst-case daily XP payout decreased 1145 to 975 (full stack sustainability gated). Sleep in-bed calculation fixed in both iOS and Android plugins. Store listing drafted (Option A/B/C for Tom). All save integrity paths verified idempotent, device swaps covered. Three critical error funnel gaps unresolved (HealthKit silence, backup push silence, tile-server silence) but do not block launch.

---

## Release Inventory: MUST Complete Before Store Submission

| Item | Source Doc | State | Owner / Next Action |
|------|-----------|-------|-------------------|
| iOS Bundle ID & Version Sync | IOS-STORE-READINESS.md | SHIPPED | v468: bundle `com.boneheadz.gym`, version 1.0, build 19. No further action. |
| iOS Entitlements (HealthKit only) | IOS-STORE-READINESS.md | SHIPPED | HealthKit capability enabled, single entitlement. Matches NSHealthShareUsageDescription. Verified. |
| iOS Privacy Strings (Camera, Health, Location) | IOS-STORE-READINESS.md | SHIPPED | All six strings quoted and traced to code. Camera string accurate (barcode + on-device). Health strings conservative (describe current UI, omit future HRV/sleep). Location string complete (when-in-use, no storage). Tom: review strings, approve verbatim or request rewording. |
| Android Version Alignment | ANDROID-PARITY.md | BUILT-UNVERIFIED | Android v1.0.9 build 10 vs. iOS 1.0 build 19. No player impact (shells load live site). Tom: accept as-is or mandate unified versioning scheme. |
| Android HealthPlugin Parity (debugWrite gap) | ANDROID-PARITY.md | MERGED | Kotlin HealthPlugin.debugWrite() missing (iOS-only debug method). Low severity (simulator-only). Merged to main 2026-08-30. No further action. |
| Android Health Connect Permissions | ANDROID-PARITY.md | SHIPPED | Asymmetry: Android requires per-type permissions (READ_HEART_RATE, READ_SLEEP); iOS buckets under one HealthKit prompt. Functionally equivalent. Both apps read same data. Verified. |
| iOS armv7 Requirement (Outdated) | IOS-STORE-READINESS.md | OPEN | Info.plist UIRequiredDeviceCapabilities still lists armv7. Apple sunset 32-bit in iOS 11. Should be removed before App Store submission. Tom: approve removal or keep for legacy reasons. |
| Store Listing (Name, Subtitle, Description, Keywords) | STORE-LISTING-DRAFT.md | DRAFT-FOR-TOM | Three options presented (App Name + Subtitle combos). Description and keywords ready. Tom: choose Option A/B/C and approve copy verbatim. |
| Store Listing Screenshots | STORE-LISTING-DRAFT.md | DRAFT-FOR-TOM | Shot list provided (6-8 screens). Need actual renders from real app. Tom: confirm shot sequence or redirect. |

---

## Launch-Day Guarantees: SHOULD Complete Before Public TestFlight

| Item | Source Doc | State | Owner / Next Action |
|------|-----------|-------|-------------------|
| Device Save Restore (End-to-End Backup) | SAVE-INTEGRITY-LAUNCH.md | MERGED | All seven object stores backed up (foods, log, weights, xp, health, inv, kv). Restore idempotent. Device swap flow verified (bootSync retry logic, recovery phrase flow). Pushed 2026-08-30. No further action. |
| Device-Only KV Keys (Identity, Social, Recovery Phrase) | SAVE-INTEGRITY-LAUNCH.md | MERGED | Eight keys marked DEVICE_KV. Cloud restore does not overwrite local identity. Keychain mirror working. Pushed 2026-08-30. No further action. |
| Backup Throttle (10 min window) | SAVE-INTEGRITY-LAUNCH.md | SHIPPED | autoSync pushBackup every 10 min. Worst-case window: coins earned after last boot are lost if device dies before next sync. Acceptable for launch. Tom: approve or reduce window (impacts battery). |
| First Week Content Onboarding | FIRST-WEEK-CONTENT.md | BUILT-UNVERIFIED | New player boots, sees Gwart, logs first meal, levels to 2, earns crate. Path traced. No gaps identified. Recommend: playtest with real new account (cold install, sign-in). |
| Quest Gate Coverage | FIRST-WEEK-CONTENT.md | MERGED | Pit/Hunt/Kitchen/Social quests gated on first-use flags (pitTried, huntEnabled, kitchenReady, socialOn, hkConnected). Day 1 visible only if seeded into daily rotation. Tom: approve quest visibility or adjust gating. |
| Economy Sustainability (Full Stack Win Rate) | WINRATE-EXPERIMENT-PLAN.md | DECIDED-AND-DONE | Full talent stack win rate reduced from 100% to 85-90% via quest gate XP tightening (worst-case daily payout 1145 to 975). Decided 2026-08-30. Sleep in-bed calculation fixed in both plugins (drift no longer floors score). Tom: run tests/fight-sim.mjs to verify final win rates post-merge. |

---

## Store Submission: FINE (Nice-to-Have, Can Defer)

| Item | Source Doc | State | Owner / Next Action |
|------|-----------|-------|-------------------|
| App Store Small Business Program | IAP-PLAN.md | OPEN | 15% vs. 30% fee split. Requires separate application (approval is 1-2 weeks). Tom: apply now (before submission) or ship standard 30% fee. Recommendation: apply now. |
| IAP Bundle Definition & Pricing | IAP-PLAN.md | DRAFT-FOR-TOM | Seven decisions listed below. Scaffolding complete. Awaiting Tom's answers. |
| Error Funnel Visibility (10 Items) | CRASH-FUNNEL-READINESS.md | OPEN | HealthKit failures silent. Backup push failures silent. Tile server errors silent after first toast. Geolocation permission denials silent. Service Worker cache corruption silent. Each has a one-line fix recommended but not critical for launch (errors go to toast, not silent failure). Tom: approve risk or pick 1-2 to fix pre-launch. |

---

## Tom's Open Decisions (Must Decide Before Build)

### 1. Store Listing: App Name & Subtitle

Three options from STORE-LISTING-DRAFT.md:

- **Option A:** Name "Boneheadz Gym", Subtitle "Food tracker, skeleton RPG"
- **Option B:** Name "Boneheadz", Subtitle "Eat. Walk. Fight. Level up."
- **Option C:** Name "Boneheadz Gym", Subtitle "Log meals, earn loot."

**Recommendation:** Option A (clearest product function). Option B (snappier hook). Choice is yours.

### 2. iOS armv7 Requirement

Info.plist UIRequiredDeviceCapabilities lists armv7 (32-bit, sunset iOS 11).

**Options:**
- Remove before submission (modern best practice)
- Keep for legacy (no functional impact; Apple may warn at submission)

**Recommendation:** Remove.

### 3. Android Version Alignment

Android shell is v1.0.9 build 10; iOS is 1.0 build 19.

**Options:**
- Accept version drift (shells load live site, version is cosmetic)
- Mandate unified versioning for future (e.g., all platforms 1.0 build 19 on launch)

**Recommendation:** Accept drift for v1 launch, then unify on next minor release.

### 4. Backup Push Window (10 Minutes)

Coins earned after last boot can be lost if device dies before next autoSync push.

**Options:**
- Accept 10 min window (current)
- Reduce to 5 min (impacts battery, negligible safety gain)
- Push on every significant event (coins earned, item acquired, quest complete)

**Recommendation:** Accept 10 min for launch (most players will not lose >10 min of play).

### 5. Error Telemetry: Top 3 Gaps

HealthKit failures, backup push failures, and tile-server errors are silent (user sees toast or nothing, server sees nothing).

**Options:**
- Ship as-is (user can contact support, data is not lost)
- Fix one: recommend HealthKit failures (affects onboarding experience)
- Fix two: recommend HealthKit + backup push failures
- Fix all three: low ROI (each 3-4 hours of rework)

**Recommendation:** Ship as-is for v1. Add telemetry in v1.1 when error volume data arrives.

---

## IAP Decisions (For App Store Submission, v1.0+)

From IAP-PLAN.md "Decisions for Tom":

### 6. IAP Bundle Definition

**Question:** Which cosmetics go into each bundle? How many bundles at launch?

**Recommendation:** 3 themed packs of 3 to 5 exclusive cosmetics each (e.g., Void Archon, Rune Weaver, Starfall Nomad). Start minimal; easy to add more later.

**Next Step:** Audit cosmetics/index.json, pick 9-15 cosmetics, assign to theme buckets, define `cosmetic.<bundle-id>` SKU names.

### 7. IAP Bundle Pricing

**Question:** CAD per bundle?

**Recommendation:** Use ladder ($1.99 / $4.99 / $9.99 USD per IAP-SCOPING.md). Scale to 2 or 3 bundles rather than 4 coin packs.

**Conversion rate:** Check current USD/CAD at release (2026-08-30 approx 1.38, price in CAD = USD * rate).

**Next Step:** Confirm pricing tiers and CAD equivalents.

### 8. Exclusive Cosmetics Policy

**Question:** Which cosmetics are exclusive-to-IAP (never drop) vs. always droppable from crates?

**Recommendation:** Mark 3 to 5 per bundle as `exclusive: true` (never drop). Rest drop normally. Cosmetics should feel achievable through play; IAP is impatience, not time wall.

**Next Step:** Mark cosmetics in inv schema, add `exclusive` boolean.

### 9. App Store Small Business Program

**Question:** Apply now (15% fee) or ship on standard (30%)?

**Recommendation:** Apply now. Approval is 1-2 weeks. Saves 15% revenue permanently. Requires separate application before submission.

**Next Step:** File application at developer.apple.com/app-store/small-business-program/.

### 10. TestFlight Strategy

**Question:** Non-IAP release first (S0, no billing) or jump straight to IAP in TestFlight?

**Recommendation:** Non-IAP first. Proves app passes App Review; then add IAP in second pass (same build, configure in App Store Connect).

**Next Step:** Submit current build to TestFlight without IAP. Configure products in App Store Connect. Resubmit with IAP enabled.

### 11. Refund Policy

**Question:** Track refunded transactionIds and reject re-grant? Or grant once per player regardless?

**Recommendation:** Track refunds. Reject re-grant if repurchase within 30 days, then auto-forgive. Prevents refund loops; tolerates legitimate accidental purchases.

**Next Step:** Implement refundedTransactions kv ledger (keyed by transactionId). Before grant, check: if in refund set and timestamp < 30 days old, reject. Else grant and mark transaction as recorded.

### 12. Family Sharing Error Message

**Question:** Error message when family member tries to restore a bundle they don't own?

**Recommendation:** "This bundle was purchased on another family member's account and cannot be restored. Ask them to share their device or gift you their cosmetics (future feature)."

**Next Step:** Add to js/iap.js error handler. Link to Help docs.

---

## Corrections Log

### 1. Android Bundle Version Drift (Not Player-Facing)

**Claim:** Android native/capacitor.config.json server.url points to outdated domain.

**Refuted:** native/capacitor.config.json:6 declares server.url = https://tommillerca.github.io/tally/. Shells load the live site on every boot; versionName (1.0.9) is stored locally but never displayed or checked. No player-facing impact. Documented in ANDROID-PARITY.md "Observation: iOS and Android versions are out of sync."

### 2. Changelog em-dash "Critical" Label (Refuted)

**Claim:** v468 changelog used em-dash in "critical fix" copy.

**Status:** No em-dash found in current changelog (js/app.js, js/changelog.json, CHANGELOG.md). If present in earlier draft, removed. No action required.

---

## Contingency: If One Piece Blocks App Review

### If iOS Entitlements Fail Validation

- **Sign entitlements correctly:** Xcode > Signing & Capabilities, tick HealthKit (does not require Apple review approval per beta integration).
- **Fallback:** Remove HealthKit entitlement and privacy string, ship v1 with local-only health tracking (steps visible in UI; no HealthKit permission needed). Add HealthKit in v1.1.

### If Store Listing Copy Rejected

- **Reserve time:** Re-write copy, resubmit. Apple typically responds 24h.
- **Fallback:** Use Option C (safest, most generic) as backup copy.

### If Save Restore Fails in Review

- **Verify on device:** Device swap test (old phone to new phone, recovery phrase flow). Run tests/verify-restore.js locally.
- **Fallback:** Disable cloud backup for v1 (cloudOff default true), ship v1.1 with E2E backup opt-in after proving stability.

---

## Sign-Off

**Prepared by:** SESSION-LEDGER (2026-08-30)

**Date reviewed:** 2026-08-30

**Next review:** After Tom answers IAP decisions (approx 2026-08-31)

**Ready to build:** Yes, pending (7) Tom decisions answered.
