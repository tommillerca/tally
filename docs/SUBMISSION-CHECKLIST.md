# First App Store submission: WAVE checklist

Audited 2026-09-07 against this checkout and the Apple pages linked below.
**Not ready for submission. The bundled iOS binary has never been built or
booted, according to the frozen work order. This pass did neither.** Node
fixtures prove build-script decisions, not WKWebView operation, signing, upload,
or acceptance. Historical release/ASC statements below are explicitly attributed,
not fresh remote observations. This is the single current checklist; older
submission packs are source material, not instructions to paste verbatim.

Owner **me** means the implementation lane. **Tom** means the person responsible
for the remaining decision, external action, or device proof. Done means only
what the evidence column establishes. Time estimates are hands-on estimates,
exclude Apple review/processing, and grow if device testing finds defects.

## Requirements and evidence

| Item / actual requirement | Done? | Evidence and remaining work | Owner |
|---|---|---|---|
| Explicit submission intent and identifiable artifacts | Yes, script/fixture scope | `native/build-ios.sh` refuses unset, empty and invalid SUBMISSION before side effects. `1` selects submission; `0` preserves internal remote-shell testing. Separate `ios/App/build/submission/` and `ios/App/build/internal/` archive/export paths. `tests/submission-build-audit.mjs` exercises the script using fixture executables. | me |
| Bundled code and store copy, [Review 2.2, 2.5.2](https://developer.apple.com/app-store/review/guidelines/) | Source guard done; binary unknown | `build-store.sh` builds STORE_BUILD=true, removes the server key and writes `www/submission.json` with the app.js SHA256. Preflight checks copied `ios/App/App/public` and the archived `App.app`, including marker, flag, config and reachable beta literals. `tests/store-copy-lint.mjs`, `tests/submission-preflight-audit.mjs`, `tests/submission-build-audit.mjs`. | me |
| Working binary, [Review 2.1 and 4.2](https://developer.apple.com/app-store/review/guidelines/) | No | No native boot evidence. `index.html` imports the game; `HealthPlugin.swift` and `BhVault.swift` provide native functionality. See the concrete runtime findings and Tom's acceptance sequence below. A static-server render would not prove local-scheme compatibility or review acceptance. | Tom |
| Current build SDK | Unknown | Apple requires Xcode 26+ and iOS 26 SDK+ for uploads since April 28, 2026. `project.pbxproj` uses SDKROOT=iphoneos and deployment target 15.0; deployment target does not establish build SDK. No Xcode inspection was run. [SDK requirement](https://developer.apple.com/news/upcoming-requirements/). | Tom |
| Build dependencies, signing and export inputs | No in this checkout | `native/node_modules` and `native/build/exportOptions.plist` are absent. `CapApp-SPM/Package.swift` references native node_modules. Restore/install dependencies and supply a reviewed export options plist before running the upload script. Team, provisioning and signing validity need Tom's check. No secrets were read. | Tom |
| ASC credentials / upload history | Established historically; validity today untested | Frozen plan says the key exists and builds have been uploaded. Key/issuer identifiers are wired in `native/build-ios.sh`. Prior checklist reported builds 11-20 on 2026-09-07; this pass did not query ASC or verify that list. Do not regenerate a key merely because `TESTFLIGHT.md` calls it the blocker. | Tom |
| Privacy link and location permission text, [Review 5.1.1(i)](https://developer.apple.com/app-store/review/guidelines/) | Source done; new binary interaction unknown | Frozen plan records the v505 rejection closure. `js/app.js` Settings `privacyBtn` is ungated and relative; `build-www.sh` copies `privacy.html`; `Info.plist` has the revised location explanation. Tom must open the link in the installed store bundle. This does not certify the rest of the policy's accuracy. | Tom |
| Functional support contact | No | `support.html` sends users to an unpublished listing for a nonexistent address; `privacy.html` repeats that loop. Publish a working address directly on both pages and test delivery. `support.html` also links `/privacy.html`, which resolves outside `/tally/` on the hosted site. Change to `privacy.html`. Both files are outside this lane. [Apple support/contact requirement](https://developer.apple.com/app-store/review/). | Tom |
| App Privacy answers: all collected data and linkage | No | `TESTFLIGHT.md` says no collection; `docs/ASC-SUBMISSION.md` says all categories are unlinked. Both conflict with the paths below. Apple's definition includes linkage via device or account, not just a legal name. Tom must enter corrected types, purposes and linkage. [App Privacy definitions](https://developer.apple.com/app-store/app-privacy-details/). | Tom |
| Permission purposes, HealthKit, denial paths | Source present; device proof no | `Info.plist` declares camera, photo, health, location and motion purposes. `App.entitlements` enables HealthKit. `HealthPlugin.swift` registers reads; sample writes are DEBUG-only and reject in Release. `BoneheadzViewController.swift` registers Health and BhVault. Test grant, deny, revoke and reopen on device. Review health/privacy wording against the public weekly steps path below. [Review 5.1.3](https://developer.apple.com/app-store/review/guidelines/). | Tom |
| Fitness and nutrition claims, [Review 1.4](https://developer.apple.com/app-store/review/guidelines/) | Not fully verified | App food/target/health code and TESTFLIGHT marketing describe lifestyle tracking. Tom must verify calculations, source attribution, permission-denied behavior and accuracy of health claims in the installed version. The old pack's blanket assertion that every mode has an equivalent non-Health path needs operation, not repetition. | Tom |
| Privacy manifests and required-reason APIs | Unknown | No tracked `PrivacyInfo.xcprivacy` exists under `native/ios`; dependency installation/SwiftPM resolution and archive inspection were not performed. This alone does not prove the archive lacks SDK manifests. Inspect the final privacy report, SDK manifests and applicable API reasons; fix genuine omissions. [Apple privacy manifests](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files). | Tom |
| In-app account deletion, [Review 5.1.1(v)](https://developer.apple.com/app-store/review/guidelines/) | Source present; live end-to-end no | Settings `delAcctBtn` / confirmation handler calls `social.deleteAccount()`; `server/src/index.js` `/account/delete` cascades records. Test typed DELETE, server removal, local wipe and keychain behavior using a disposable account. The separate local Erase is not this proof. | Tom |
| Backend available during review | No current proof | `server/migrations/2026-09-05-week-freeze.sql` adds `last_week_key` and `last_week_steps`; `/profile` and `/steps/week` use them. Handoff says pending. Apply/verify migration before matching Worker deploy, then prove profile and week settlement. The earlier prev-names migration is recorded as applied, not reverified. [Review preparation](https://developer.apple.com/app-store/review/). | Tom |
| Device family | Undecided | Both target configurations still have TARGETED_DEVICE_FAMILY="1,2". iPad UI has no proof. Choose iPhone-only or test and support iPad before capture. No project setting changed. | Tom |
| Screenshots | No store set verified | Apple allows 1-10 JPEG/PNG screenshots, with no alpha. Supply the required iPhone size set and iPad set if applicable. Exact capture sizes below supersede old 6.1/6.7 and 10.9-inch instructions. [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/). | Tom |
| Store icon | Source asset done; archive validation no | `Assets.xcassets/AppIcon.appiconset/Contents.json` references AppIcon-512@2x.png. PNG IHDR measured 1024x1024, 8-bit RGB (color type 2, no alpha); confirm asset-catalog processing and final appearance in the archive. | Tom |
| Metadata and review access, [Review 2.3](https://developer.apple.com/app-store/review/guidelines/) | No | TESTFLIGHT subtitle/promo/keywords exist, but description/privacy answers/support URL need corrections. Old review notes name Home/Pit/Shop tabs, while `index.html` names Today/Boneyard/Crew/Bonehead. Rewrite navigation from the actual installed build and explain onboarding, optional Health, online review paths and deletion. Provide working reviewer contact and any resources needed to reach gated features. | Tom |
| Age rating and content descriptors | No current ASC proof | Preserve Tom's tobacco content and infrequent/mild descriptors, including Rollie, Last Cigarette and Fat Cigar. The frozen 12+ wording cannot be treated as a selectable universal current rating: Apple's iOS 26 values include 13+ for infrequent tobacco references. Fill the current questionnaire truthfully; preserve legacy rating treatment where applicable. Do not rename content or lower descriptors. [Age ratings](https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/). | Tom |
| Gambling, loot and payments | Source reviewed; final UI no | Current crates/items use earned game currency; no StoreKit dependency or real-money purchase integration found in the reviewed app/native sources. `crateOdds()` disclosure is present. The old pack contradicts itself on simulated gambling: earned random loot is not by itself casino wagering. Answer separate loot-box and gambling questions based on actual mechanics. No paid-subscription EULA/paywall flow was found. [Review 3.1.1](https://developer.apple.com/app-store/review/guidelines/). | Tom |
| Public content and moderation | Source constraints present; confirm scope | `js/names.js` and server curated-name validation build public names from indices; friend nicknames are local (`js/social.js`); survey/report free text is sent privately to the developer (`js/analytics.js`). No general public chat path found in these sources. Verify all shared surfaces remain within these constraints; if public free text is exposed, filtering/report/block/contact obligations apply. [Review 1.2](https://developer.apple.com/app-store/review/guidelines/). | Tom |
| EULA choice | No Tom confirmation | No app Terms/EULA page found. Apple applies its standard EULA when no custom one is supplied; absence of a custom Terms page alone is not a free-app blocker. Confirm that choice in ASC App Information and record it in review preparation. Do not create legal terms silently. [Apple standard/custom EULA behavior](https://developer.apple.com/help/app-store-connect/manage-app-information/provide-a-custom-license-agreement/). | Tom |
| Export compliance | Declaration present; determination unconfirmed | Info.plist sets ITSAppUsesNonExemptEncryption=false. `js/social.js` uses WebCrypto ECDSA, AES-GCM and PBKDF2. Standard algorithms alone do not establish the old pack's claimed statutory exemption. Assess use of OS-provided encryption and answer Apple's questionnaire for this binary/territories. [Apple export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance). | Tom |
| Rights, territories, agreements and release controls | Unknown in ASC | Settings lists asset/font/data attributions. Tom must confirm distribution rights for art/music/fonts, app categories, pricing, territories, copyright, developer agreements and current EU trader status if distributing there. No ASC state was read. [Review 5.2](https://developer.apple.com/app-store/review/guidelines/), [EU trader requirement](https://developer.apple.com/news/upcoming-requirements/). | Tom |
| Final build selection / review submission | No | Select the exact tested submission build, with recorded build number and artifact evidence. Old generic `build/App.xcarchive` / `build/export` artifacts are unclassified. TestFlight upload or group membership does not establish a store build or App Review approval. | Tom |

## Privacy answers that must be corrected before pasting

These are code findings, not assumptions about a server inspected today:

- **Fitness leaves the phone in plaintext:** `socialSnapshot()` in `js/app.js`
  puts `weekSteps: wk.steps` into the snapshot; `js/social.js:syncProfile` sends
  it to `/profile`; the Worker ranks it for the step race. The old claims that
  all Health-derived metrics stay local or only leave encrypted are false.
  Review fitness collection, account linkage, purpose and public disclosure.
- **Usage and coarse location are linkable:** `js/analytics.js:flush` sends
  persistent `device` and Crew `label`; `/events` stores events by device and
  upserts label/country/region/city in `devices`. A random identifier does not
  make this unlinked under Apple's definition.
- **Survey contact data is linked:** `sendSurvey` sends `playerId`, device,
  label, optional name/email and answers/context to `/survey`. Assess contact
  information and user content. Do not claim no player/progress linkage, or
  assume optional collection is automatically exempt from disclosure.
- **Map data has multiple precision levels:** `sendReport` sends selected lat/lng
  with device and label. Spire claims send tower lat/lng and player identity;
  the app enforces an 80 m claim radius. These are different from coarse cell
  lookups and IP geography. Assess precise-location collection for the actual
  submitted coordinates; do not blanket-answer coarse only.
- **Policy/description corrections:** change `TESTFLIGHT.md`'s absolute
  "Your data stays on your device" and no-collection answers; reconcile
  `privacy.html`'s contradictory health/social statements, analytics linkage,
  retention and contact route. The encrypted full-save backup is separate from
  plaintext social snapshots. Sources: `js/social.js`, `js/analytics.js`,
  `server/src/index.js` `/profile`, `/events`, `/survey`, `/report` and deletion.
  Public pages and TESTFLIGHT.md are outside this lane; Tom owns their revision.

Apple asks for data types, purposes, tracking and linkage, including partner
collection. No ad/IDFA integration was found here; that supports a proposed
no-tracking answer, not a no-collection answer. The final questionnaire needs
Tom's confirmation. [App Privacy guidance](https://developer.apple.com/app-store/app-privacy-details/).

## What the bundled path actually assumes

Expected iOS origin with the generated config is `capacitor://localhost`.
The default local iOS scheme is capacitor; localhost is retained for secure-context
APIs. This is a configuration inference, not a measured boot result.
[Capacitor configuration](https://capacitorjs.com/docs/config).

| Code path inspected | Finding and concrete failure condition | Action / owner |
|---|---|---|
| `js/app.js` service-worker registration; `build-www.sh` | Registration requires `location.protocol === 'https:'`; local capacitor scheme skips it. sw.js is not bundled. No unconditional boot registration defect found. Store diagnostics are gated off; hardRefresh catches registration errors. | Tom verifies no registration attempt at local boot. |
| `index.html`, `app.css`, `js/map.js`, `js/ocr.js`, `js/graverise.js` | Entry assets are relative; module-based assets use `new URL(..., import.meta.url)`. No root-absolute boot asset URL found in the inspected entry/app sources. JS/data/vendor/icons/assets and privacy.html are copied. This is not proof every dynamic asset decodes. | Tom checks cold module load, images/fonts and every main tab. |
| `js/app.js:latestBuild`, `checkForUpdate`, `hardRefresh` | Fetches relative `version.json`; build-www does not copy it. Missing/invalid JSON yields 0; update banner stays hidden and hardRefresh says no connection. Reload cannot download a new signed bundle. This is an actual misleading refresh path, not a demonstrated fatal boot error. | Outside lane: gate web update checks/actions in store mode and use a store-update explanation. Tom routes fix to app.js owner. |
| `js/social.js:ensureIdentity`, signing, backup, recovery | Uses crypto.subtle without an alternate native implementation. If WKWebView does not expose it under the installed origin, identity generation/signing and backup/recovery fail. The code does not prove that this API is unavailable. | Tom tests key generation, signed profile, encrypted save and recovery on actual scheme. |
| `js/db.js`; `BhVault.swift`; local origin change | IndexedDB/localStorage are origin-scoped. Switching from the remote shell to local origin does not move those web stores. BhVault can recover identity; it does not copy all food/game records. An in-place upgrade needs the cloud-restore path to work. | Tom tests both clean install and upgrade with a recoverable test save. Do not promise automatic data carryover from bundle ID alone. |
| `js/social.js:apiBase/apiFetch`; Worker CORS constants | API uses absolute HTTPS Worker URL. Source allows `*`, OPTIONS and signed-request headers without cookies, compatible in intent with local origins. Actual deployed headers/schema are unverified. | Tom tests live signed requests after the ordered deploy. No Worker request made here. |
| `js/map.js`; `assets/map/boneheadz-style.json`; `js/water.js` | MapLibre code/style are local, but tiles/TileJSON use `https://tiles.openfreemap.org/planet`. A bundled app still needs networking for map background/water data and shared spires. | Tom checks local-scheme loading, permission denial and network-loss behavior. |
| `js/scanner.js`; `js/ocr.js`; `js/sources.js` | Camera uses getUserMedia. OCR creates a vendored worker/WASM loader under the local scheme. Food search uses OFF/USDA HTTPS APIs. Worker fetch/importScripts/WASM and camera permissions are unproven in WKWebView. | Tom scans a real barcode and label, tests manual entry with no network. |
| `js/notify.js`; share/copy handlers in `js/app.js` | Notifications choose the native plugin before web service-worker fallback. Friend-code share/copy has a raw-code fallback. Plugin availability and clipboard permission still need device operation. | Tom tests notification denial/scheduling, share and copy. |
| `native/capabilities.json`, package.json and CapApp-SPM | Haptics is required by the capability register, but no @capacitor/haptics dependency or SwiftPM product is present. This is a source wiring gap, not a proven archive crash. | Tom routes native capability repair and verifies physical feedback; no unrelated plugin install in this lane. |
| `support.html` | `/privacy.html` resolves incorrectly on the hosted /tally/ site. Support is not copied into www; current Settings privacy link does not depend on it. | Tom fixes hosted relative link and direct email in the page's owning lane. |

## Tom's critical path

1. **Choose device family (5 minutes).** For iPhone-only, update both target
   configurations to family 1 before the build. For universal, budget another
   45-90 minutes for iPad operation and fixes beyond that. No choice made here.
2. **Create/test the support mailbox and confirm standard EULA (15-30 minutes,
   plus DNS/provider delay if needed).** Give the page owner the exact personal
   support address. Publish it directly on support/privacy pages, fix the privacy
   href, and set ASC Support URL to
   `https://tommillerca.github.io/tally/support.html`. Confirm delivery and public
   accessibility. EULA confirmation takes about 5 minutes of this estimate.
3. **Prepare the build machine (15-30 minutes if Xcode is already installed).**
   Confirm required Xcode/SDK, install locked native dependencies, resolve native
   capability/manifest gaps, and supply `native/build/exportOptions.plist` with
   reviewed signing/distribution choices. A missing plist will break export.
4. **Apply week-freeze migration, then deploy the matching Worker (15-30 minutes).**
   Verify both columns before deploying. Without them `/profile` and week
   settlement can return `no such column: last_week_key`. Confirm both operations
   after deploy and keep the backend available through review. No deploy command
   has been run by this lane.
5. **Build and boot the actual bundled candidate (45-90 minutes, excluding fixes
   and Apple processing).** `SUBMISSION=1 native/build-ios.sh` is Tom's explicit
   archive/export/upload/distribution command, resolved within his chosen
   checkout. It is not a build-only preview. Record build number and archived
   submission marker; install that build through Tom's existing device workflow.
   Verify origin and no server URL, then cold launch offline; complete onboarding,
   add/save/reopen food, operate all four tabs and Settings, open privacy, grant
   and deny Health/location/camera/notifications, scan a label, test map, signed
   social operations, backup/recovery and disposable-account deletion. Separately
   upgrade a remote-shell install and assert the same account and saved progress.
6. **Capture screenshots of that working candidate (30-60 minutes iPhone;
   another 20-40 minutes iPad).** Prefer 1320x2868 portrait for the 6.9-inch set;
   1290x2796 is also accepted. If omitting that set, Apple's 6.5-inch set is
   required (1284x2778 or 1242x2688). With iPad support, provide the 13-inch set
   (2064x2752 or 2048x2732). Use 3-5 honest app screens as an editorial choice,
   not an invented Apple minimum. Capture from a device/simulator, no fabricated
   mockups; remove alpha. [Apple size/count requirements](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).
7. **Correct and enter metadata/privacy/ratings (45-75 minutes).** Apply the
   findings above, rewrite reviewer navigation from the tested app, confirm
   standard EULA, encryption, rights, territories, trader status and agreements.
   Do not paste the old submission pack verbatim. The current 13+ category
   versus Tom's historical 12+ wording is a decision to acknowledge, not a
   reason to alter content. Select the exact tested build and attach screenshots.
8. **Submit only after failed/unknown rows are resolved (10-15 minutes).**
   Preserve evidence for the selected build and monitor review. Approval time
   is Apple's; no estimate of acceptance is claimed.

## Scope, deviations and proof limits

- R45-9's silent default is intentionally removed. Existing internal callers
  must now set SUBMISSION=0. This is necessary to assert the human's intent.
- A local script cannot prevent manual ASC selection/upload through unrelated
  tools. Proposed boundary: use this guarded path and require archived marker
  plus preflight evidence for the exact submitted build. The marker binds
  app.js, not every asset or native executable, and is not a signature or
  Apple-enforced channel. No universal prevention is claimed.
- Current age-rating values supersede the old literal 12+ instruction for newer
  OS versions. Proposed resolution: preserve Tom's content/descriptors and use
  Apple's resulting current rating after Tom acknowledges it. Nothing changed
  in ASC or game content.
- Old checklist assertions about static-server boot, live URL status and ASC
  validity were replaced with qualified evidence. Its screenshot counts/sizes
  were corrected; metadata is no longer labelled paste-ready. Historical
  claims in `docs/ASC-SUBMISSION.md` and `TESTFLIGHT.md` remain visibly identified
  here as stale. `native/ASC-SUBMISSION.md` was not touched.
- `CLAUDE.md` was read in this checkout. No nested `tally/CLAUDE.md` exists here;
  no original checkout was consulted or edited. Only native/, docs/ and tests/
  changed. The current user prohibition overrides the plan's commit/push line.
- Node proof and deliberate red reversions are recorded in
  [WAVE-STORE-PROOF.md](WAVE-STORE-PROOF.md). Browser/server/native/device proofs
  were not run. Their expected acceptance is the concrete step 5 outcome above,
  not a promised test stdout or a claimed green. No Xcode, real cap sync, ASC,
  Worker, deployment, commit, push, publication or PR action occurred.

Until the real build runs, local-scheme WebCrypto, storage migration, plugin
permissions, worker/WASM loading, signing and actual archive contents remain
unknown. Passing Node checks does not close those unknowns.
