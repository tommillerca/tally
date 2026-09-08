# First App Store submission: M4 checklist

Audited 2026-09-07 against this checkout and the linked Apple documentation.
**The submittable binary has never existed, according to the frozen work order.
No store binary was built or booted in this audit.** Web file copying and Node
fixtures do not establish WKWebView operation, signing, upload or acceptance.

The earlier WAVE checklist was rechecked, not treated as evidence. All source
paths below are relative to this checkout; line numbers identify the inspected
revision. Historical claims are attributed to the plan or a named document.
ASC state, deployed pages, credentials and the Worker were not queried.
Tom owns every unchecked action below. Estimates are hands-on planning estimates,
exclude installation/download delays and Apple processing, and exclude fixes
unless expressly included.

## First-build findings

The producer removes `server` at `native/build-store.sh:22`, retaining no custom
local scheme override. `capacitor://localhost` is therefore the expected iOS
URL, inferred from [Capacitor's configuration defaults](https://capacitorjs.com/docs/config).
It has not been measured in an installed app.

| Inspected path | Finding and consequence | Guard / remaining work |
|---|---|---|
| `native/build-ios.sh:18`, export invocation later in that script | `native/build/exportOptions.plist` is absent. Previously this was discovered only at export, after bundling, sync, ASC lookup and archive. The new file-presence check refuses before those actions in both channels. | `submission-build-audit.mjs` proves refusal and valid-input continuation with fixture tools. Tom must supply reviewed export options; existence does not validate syntax, signing or distribution choices. |
| `native/ios/App/CapApp-SPM/Package.swift:16`, `native/package.json:13` | Local SwiftPM dependencies resolve under `native/node_modules`, which is absent. Dependency installation/resolution is a prerequisite, not a verified build step. | Tom installs locked dependencies and resolves packages on the build machine. No installation or CLI sync attempted here. |
| `js/app.js:11825`, `js/app.js:11849`, `js/app.js:14954`, `js/app.js:15265`; `native/build-www.sh:13` | Settings still offers Get latest. `latestBuild()` requests relative `version.json`, omitted from the bundle. Executing the actual refresh function against copied bundle files produces `No connection. Try again when you have signal`. This is a confirmed wrong store action, not a proven launch crash. | **`store-runtime-audit.mjs` is red on this defect.** App owner should return an App Store explanation before refresh fetch/reload, change the Settings label, and gate web version checks at `checkForUpdate` and the Settings `latestBuild()` call. Copying a static version file alone would still misrepresent a reload as a store update. No app.js edit made here. |
| `js/app.js:1397`, registration at `js/app.js:1418` | Boot registration requires HTTPS; the capacitor scheme skips it. The producer deliberately excludes sw.js. No unconditional local-scheme registration defect found. | Runtime audit executes the actual condition for capacitor and HTTPS control cases. This is condition coverage, not full boot execution. |
| `index.html:13`, `app.css`, all `js/*.js` and `data/*.js` | The actual web producer succeeds in a throwaway checkout. 54 modules and 180 literal entry/CSS/import references resolve without missing or root-absolute paths. | Runtime audit checks this inventory. It excludes computed paths, vendor internals, module export compatibility, CSS inside JS and image decoding. A copied file is not a decoded image. |
| `js/social.js:187`, `js/social.js:210`, `js/social.js:219`, recovery WebCrypto calls in the same file | Identity, signing and encrypted backup require `crypto.subtle`. No alternate native crypto path found in this module. | Unknown whether the installed WKWebView exposes every required API. Test generate/sign/encrypt/decrypt/recover on the actual scheme. Do not call it unavailable without a device observation. |
| `js/db.js:69`; `js/social.js:59`; `native/ios/App/App/BhVault.swift:26` | IndexedDB and web storage change origin when the remote shell becomes local. BhVault stores identity in Keychain, not the complete diary/game database. | Test a remote-shell upgrade with an existing recoverable save, then assert identity and diary/game contents. Bundle ID alone does not prove data migration. |
| `js/social.js:34`; `server/src/index.js:7` | API requests use the explicit HTTPS Worker URL; source CORS permits `*`, OPTIONS and signature headers. No cookie authentication is assumed by those headers. | Source is compatible in intent with a local origin. Deployed CORS/schema and signed requests remain untested. |
| `js/map.js:53`, `js/map.js:73`; `js/water.js:41`; `assets/map/boneheadz-style.json` | Map code/style are local; background tiles and water TileJSON use OpenFreeMap HTTPS resources. | Bundling does not make the map fully offline. Test permissions, live tile loads and network loss in WKWebView. |
| `js/ocr.js:4`, `js/ocr.js:12`; `js/scanner.js:2`; `js/sources.js:145`, `js/sources.js:246` | OCR uses vendored worker/WASM/language assets; barcode scanning uses zbar and getUserMedia; online food search uses OFF/USDA. | Camera, worker/importScripts/WASM and external responses require device proof. Test barcode, photographed label and offline manual entry. |
| `js/notify.js:108`, `js/notify.js:175`; `native/capabilities.json` | Notifications prefer the native plugin. The separate declared Haptics capability is explicitly marked NOT INSTALLED and absent from npm/SwiftPM wiring. | Test notifications on device. Haptics repair requires dependency installation, prohibited cap sync and rebuild, so remains pending. No hand edit to generated platform wiring. |
| `support.html:28`, `support.html:56`, `privacy.html:155` | Contact points back to the listing; support's `/privacy.html` escapes the hosted `/tally/` directory. The plan establishes that the listing is unpublished and mailbox nonexistent; this audit verifies the loop in source only. | Page owner inserts Tom's working address directly in both pages and changes support href to `privacy.html`. These pages are outside M4 ownership. |

Search denominator: `rg` inspected all application JS plus `index.html` and
`app.css` for `location.origin`, bracket-form origin access, location
protocol/host/href, `document.baseURI`, `document.URL`, serviceWorker, fetch,
new URL, import.meta.url, workers and HTTPS literals. No location.origin read
was found in that application scope. The location.href use at `index.html:190`
preserves the current URL for the boot retry. Vendored minified runtime behavior
was not exhaustively certified; the OCR/map rows above remain device checks.
The Node inventory covers literal references only and prints nonzero sample
counts. These limits replace the earlier broad claim about all boot assets.

## Store metadata and review checklist

- [ ] **SDK and working build.** Apple's upload minimum since April 28, 2026 is
  Xcode 26 with iOS 26 SDK or later. `project.pbxproj:247` and `:250` declare
  deployment target 15.0 and SDKROOT=iphoneos, which do not establish the build
  SDK. Tom must check the build machine and installed candidate.
  [Apple SDK requirement](https://developer.apple.com/news/upcoming-requirements/).
- [x] **Submission path source checks.** `native/build-ios.sh:6` requires an
  explicit channel, uses separate submission/internal artifact paths, restores
  config and preflights copied resources and archive. `build-store.sh:24` writes
  an app.js hash marker; `submission-preflight.mjs:43` checks it. The three
  existing Node submission/copy audits pass here. Their fixtures do not produce
  an iOS archive. The marker binds app.js only, not all assets/native code.
- [ ] **Credentials and exact build selection.** The frozen plan establishes
  an existing ASC key and historical uploads. Script references were inspected,
  but current validity, uploaded build numbers and distribution state were not
  reverified. Do not regenerate a key based on stale TESTFLIGHT.md instructions.
  Select the tested submission candidate, not an arbitrary internal build.
- [ ] **Privacy access and truthful policy.** The permanent Settings row at
  `js/app.js:14951` is relative and outside the survey gate; the producer copies
  privacy.html. The frozen plan records v505 closure, but the new native link
  still needs an offline tap test. Policy contradictions are listed below.
  [Apple privacy-link rule, 5.1.1(i)](https://developer.apple.com/app-store/review/guidelines/#privacy).
- [ ] **Support.** Replace the contact loop described above. Set Support URL to
  `https://tommillerca.github.io/tally/support.html` only after direct contact
  details are published and tested. `TESTFLIGHT.md:46` currently points at the
  app root. Apple's Support URL must reach actual contact information.
  [Support field requirement](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/).
- [ ] **Metadata fields.** `TESTFLIGHT.md:17` subtitle is 28 characters;
  promotional text at `:20` is 145; keywords at `:43` are 98 UTF-8 bytes.
  Name/subtitle limits are 30 characters, promo 170, description 4000;
  keywords are **100 bytes**, not universally 100 characters. These current
  strings fit, but the description's on-device-only claim is false. Description,
  keywords and support are required; promo/marketing URL are optional. Verify
  category, copyright and all localized fields in ASC. What’s New is not a
  first-version field. [App fields](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information),
  [Version fields](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/).
- [ ] **Reviewer contact/access.** Enter name, email and international-format
  phone number; explain setup and how to reach online features, permissions and
  account deletion. Supply demo credentials if login is required. Current tabs
  are Today/Boneyard/Crew/Bonehead (`index.html:44` onward), not the old pack's
  Home/Pit/Shop instructions. Verify every navigation step on the candidate.
  [Review information fields](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/).
- [ ] **Device family and screenshots.** `project.pbxproj:328` and `:351` still
  declare `1,2`. iPad has no operation evidence. Apple accepts 1-10 JPEG/PNG
  screenshots without alpha. A 6.9-inch set can use 1320x2868, 1290x2796 or
  1260x2736 portrait; otherwise the required 6.5-inch set uses 1284x2778 or
  1242x2688. If supporting iPad, supply the 13-inch set, 2064x2752 or 2048x2732.
  No store screenshot set was verified here.
  [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).
- [x] **Source icon format only.** The icon catalog's Contents.json references
  AppIcon-512@2x.png. Its PNG IHDR was measured as 1024x1024, 8-bit RGB,
  color type 2 without alpha. Asset catalog processing and final appearance
  remain unchecked in the archive.
- [ ] **Age rating.** `data/boneheadz.js:1439`, `:1445`, `:1979` include Rollie,
  Last Cigarette and Fat Cigar. Answer the current questionnaire truthfully,
  including health/wellness, violence and loot boxes. On OS 26+, infrequent
  tobacco references are in the 13+ global category; earlier OS ratings include
  12+. This is not a final rating determination or authorization to change
  content. The earlier checklist's reference to a frozen 12+ instruction is
  unsupported by M4's work order and removed.
  [Current and legacy age ratings](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/).
- [ ] **Payments, content and moderation.** `js/loot.js` implements earned
  currency purchases and crate odds. No StoreKit, Purchases or inAppPurchase
  integration was found in js/, native iOS source or native/package.json.
  `js/names.js:13` and `server/src/index.js:2536` use curated public names;
  `js/social.js:626` describes local friend nicknames; surveys/reports go to
  private developer routes. These searches do not certify every shared UI.
  Review actual loot/gambling descriptors and any public content obligations.
  [Review rules 1.2 and 3.1.1](https://developer.apple.com/app-store/review/guidelines/).
- [ ] **Permissions, fitness claims and deletion.** `Info.plist:29` onward
  contains camera/health/location/motion/photo purposes; App.entitlements enables
  HealthKit; `BoneheadzViewController.swift:12` registers Health and BhVault.
  `HealthPlugin.swift:290` restricts sample writes to DEBUG and `:307` rejects
  Release writes. Validate health/nutrition behavior and denial paths in the
  installed candidate. Deletion runs from `js/app.js:15232` through
  `js/social.js:519` and `server/src/index.js:3632`, then forgets identity and
  erases local data. Operate and verify the complete deletion with a disposable
  account. [Health and deletion rules](https://developer.apple.com/app-store/review/guidelines/#privacy).
- [ ] **Privacy manifests.** No PrivacyInfo.xcprivacy exists under native/ios in
  this checkout, and dependencies are not installed. That does not prove a
  resolved archive lacks manifests. Capacitor is on Apple's required SDK list;
  inspect the archive's manifests and required-reason API declarations.
  [SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/),
  [Manifest requirements](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files?changes=_8).
- [ ] **Backend readiness.** The frozen plan and
  `docs/HANDOFF-CODEX-2026-09-05.md:44` identify week-freeze as pending. Migration
  `server/migrations/2026-09-05-week-freeze.sql:32` adds both last-week columns;
  `/profile` reads them at `server/src/index.js:2206` and settlement uses them
  at `:3227`. Apply/verify migration before matching deploy, then verify profile
  sync and settlement. No current deployment state is claimed.
- [ ] **Standard EULA.** No root app HTML Terms/EULA page was found. Confirm
  reliance on Apple's standard EULA in App Information. It applies when no
  custom EULA is supplied, even though a license link then does not appear on
  the product page. Do not invent custom terms or a subscription requirement.
  [Apple EULA behavior](https://developer.apple.com/help/app-store-connect/manage-app-information/provide-a-custom-license-agreement/).
- [ ] **Encryption, rights and distribution.** `Info.plist:25` declares no
  non-exempt encryption; `js/social.js` uses ECDSA/AES-GCM/PBKDF2. Tom must
  assess Apple's export questionnaire for this binary, not infer exemption
  solely from algorithm names. Confirm rights for assets/fonts/data (Settings
  attributions at `js/app.js:14960`), territories, agreements, pricing, release
  controls and trader-status declaration (required even outside EU distribution).
  Traders distributing in the EU must verify public contact details. No ASC
  state was inspected.
  [Export guidance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance),
  [EU trader requirements](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/).

## Privacy corrections before pasting

The checked client-to-server paths contradict the old pack's no-collection or
all-unlinked answers. Apple's linkage includes account/device identifiers; an
optional form is not automatically exempt. Tom must reconcile types, purposes,
linkage, tracking and partner collection before submission.
[Apple App Privacy definitions](https://developer.apple.com/app-store/app-privacy-details/).

| Data path personally checked | Metadata/policy correction |
|---|---|
| `js/app.js:23963` snapshot weekSteps; `js/social.js:922` profile upload; `server/src/index.js:2187` storage | Weekly steps leave the device in the social snapshot, separate from encrypted backup. Review Health/Fitness and account linkage. `privacy.html:41` and `:61` cannot imply all health data stays local. |
| `js/analytics.js:82`; `server/src/index.js:3714`, `:3786` | Events carry device and player label; stored device rows include country/region/city. Review usage, identifiers and coarse location linkage. |
| `js/analytics.js:131`; `server/src/index.js:3830` | Survey sends player ID, device, label, optional name/email, feedback and context. Review contact info/user content and retention, not a blanket unlinked answer. |
| `js/analytics.js:104`; `js/social.js:727`; `js/spires.js:21` | Reports send selected coordinates; signed spire claims send tower lat/lng and are range-gated at 80 m. Assess precise location separately from coarse cells. `Info.plist:36` says claiming sends only a map cell, which does not describe this payload completely. Proposed wording: location draws nearby content; shared spire actions send the spire location and cell, and location reports send the selected point. Review against the actual UI before changing purpose text. |
| `TESTFLIGHT.md:40`; `privacy.html:155`; `support.html:28` | Replace the absolute on-device-only marketing claim and direct-contact loop. Validate retention/deletion statements against the installed and deployed paths. Public-page changes belong to their owner. |

No IDFA/AdSupport/ATTracking integration was found in the searched application
JS and native iOS source. This supports further assessment of a no-tracking
answer; it does not establish no collection or certify third-party practices.

## Tom's ordered list

1. **Support mailbox: 15-30 minutes plus provider/DNS delays.** Create or choose
   a real address, test receiving and replying, give it to the support/privacy
   page owner, fix the relative privacy link and verify the published pages.
2. **Device decision: 5 minutes.** Choose iPhone-only (both target family values
   become 1) or iPhone+iPad. Budget 45-90 additional minutes for iPad operation,
   plus any fixes. Decide before building or capturing screenshots.
3. **Standard EULA confirmation: 5 minutes.** Record that Apple's standard
   agreement is intended; confirm no custom EULA in ASC. No Terms page is
   created by this lane.
4. **Close source/build prerequisites: 20-45 minutes plus fixes/downloads.**
   Route the refresh and privacy-copy findings to their owners; prepare native
   dependencies, SDK, signing/export options and manifest review. Resolve
   Haptics through normal sync/rebuild if required. Rerun the runtime guard;
   its current red must not be waived as a passing store check.
5. **Week-freeze migration then Worker deploy: 15-30 minutes.** Verify both
   columns first, deploy matching code second, then assert profile updates and
   weekly settlement. Keep the backend available for review. These are Tom's
   future actions, not commands executed here.
6. **Actual bundled build and device proof: 45-90 minutes plus fixes.** The
   existing `SUBMISSION=1 native/build-ios.sh` command also queries ASC,
   uploads and distributes; it is not a build-only preview. In an authorized
   build session, record the candidate build number, archive marker and origin.
   Install it, cold-launch offline, complete onboarding, save/reopen food,
   operate all four tabs and Settings/privacy, deny/grant permissions, scan a
   barcode/label, load the map, sync profile, back up/recover and delete a
   disposable account. Separately upgrade an existing remote-shell save and
   assert both identity and progress. Repeat applicable flows on iPad if kept.
7. **Screenshots: 30-60 minutes iPhone, plus 20-40 iPad.** Capture the tested
   candidate at accepted sizes above. Three to five honest screens is an
   editorial suggestion, not Apple's minimum. Inspect pixels and remove alpha.
8. **Paste corrected metadata into ASC: 45-75 minutes.** Use the checked field
   constraints, accurate privacy/ratings answers, tested review instructions,
   support/privacy URLs and screenshots. Confirm EULA, export declaration,
   agreements and territories. Select the exact tested submission build.
9. **Final review and submission: 10-15 minutes.** Resolve all failing/unknown
   acceptance items first. Tom controls submission and release timing; neither
   acceptance nor processing duration is promised.

## Proof and boundaries

[M4-REPORT.md](M4-REPORT.md) contains changed files, command output, red/restored
green evidence and blocked actions. `store-copy-lint.mjs`,
`submission-build-audit.mjs` and `submission-preflight-audit.mjs` pass.
`store-runtime-audit.mjs` is deliberately **not green**: its real refresh
failure remains outside this lane's source ownership. A throwaway-only proposed
handler fix demonstrates a possible green; it is not part of this checkout.

No browser/server/native/device proof ran. No Xcode, real cap sync, altool,
asc.py, Wrangler, Worker request, commit, push, publication, version stamp,
changelog edit or PR occurred. The missing nested tally/CLAUDE.md was reported;
this checkout's CLAUDE.md was read. The explicit user instruction overrides the
plan's contradictory commit/push instruction. No original checkout was edited.
