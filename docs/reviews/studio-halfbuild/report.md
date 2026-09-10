# Studio half-build advisory report

Implemented in this checkout only. No commit, push, publication, deployment or PR. `native/ASC-SUBMISSION.md` was not touched. This report is advisory and does not replace independent review.

The frozen work order at the supplied plan path matched SHA256 `9546616fdde03dc8f9b7a52e04988b58572562bd1b5b276b9f55280d4b3e1fc9`.

## Files changed

| Files | Change |
| --- | --- |
| `js/studio.js` | Headless Canvas compositor, strict appearance/options boundary, fixed caption pool, registered layers, existing shiny/morph art, measured safe-zone checks, empty frame slot, PNG validation. |
| `js/studio-screen.js` | Studio controls, exact export preview, code initially off, serial/coalesced renders, stale-result rejection, failure/retry and cancellation handling. |
| `js/studio-save.js` | Exact preview Blob delivered to native save bridge or browser PNG download. |
| `js/app.js` | Wardrobe entry and Studio route. Projects the selected pet instance and compatible clothing into the compositor without health/profile fields. |
| `app.css` | Studio screen, preview and controls. |
| `sw.js` | Precaches the three Studio modules. |
| `native/ios/App/App/StudioSave.swift` | Validates and saves the PNG to Photos with add-only permission. |
| `native/ios/App/App/BoneheadzViewController.swift` | Registers the save plugin. |
| `native/ios/App/App/Info.plist` | Explains add-only Photos permission. |
| `native/ios/App/App.xcodeproj/project.pbxproj` | Includes the plugin in the app target. |
| `native/android/app/src/main/java/com/boneheadz/gym/StudioSave.kt` | Validates PNG bytes and saves through the local document picker. Handles cancellation and write failures. |
| `native/android/app/src/main/java/com/boneheadz/gym/MainActivity.java` | Registers the Android plugin. |
| `package.json`, `package-lock.json` | Pins `@napi-rs/canvas` 0.1.100 as a development dependency for real, offline Node raster proof. |
| `tests/studio-audit.mjs` | Real PNG composition and decoding, byte stability, layer order, shiny, safe-zone red controls, privacy rejection, save handoff, app boundary and control-handler proof. |
| `tests/unit.test.js` | Includes the Studio audit in the agreed command. |
| `tests/release-gate.mjs` | Adds Studio to PURE. |
| `tests/figure-audit.mjs` | Registers Studio and points to its separate compositor proof. |
| `tests/ui-audit.js` | Registers Wardrobe entry and Studio back navigation. |
| `docs/reviews/studio-halfbuild/report.md` | This advisory report. |
| `docs/reviews/studio-halfbuild/unit-output.txt`, `studio-audit.txt`, `figure-audit.txt`, `coverage.txt` | Captured proof and additional-check output, in this directory. |

## Agreed proof

Command: `node tests/unit.test.js`

```text
379 passed, 0 failed
```

Exit code: 0. Full output: [unit-output.txt](unit-output.txt).

The Studio audit uses real catalogue PNGs, the shipped Bangers font, a headless Canvas implementation and a real PNG encoder/decoder. Its fixed look produced identical bytes across repeated renders, SHA256 `eba5d75592f19cede5283d5f8eb2924750542b5f3c832153fb39a99cd7929a5f`. That is observed determinism in this runtime, not a claim that different rendering engines encode identical bytes.

Proof covers 1080x1920 dimensions, all body-slot ordering including both hands, separately registered pet clothing, visible shiny/base pixel differences, controls changing the image, explicit code opt-in, and exact PNG bytes reaching the save adapter. The safe-zone guard rejects a deliberately flush-to-bottom layout. Health fields, arbitrary captions, frames, malformed images and incomplete assets are rejected. Deferred render tests cover stale previews, retries, save cancellation, denied saves and teardown.

Native transport is tested at the JavaScript boundary with a bridge double. Browser control handlers are driven using a DOM test double. These are not device or real-browser UI proof.

## Additional checks and limitations

- `git diff --check`: passed.
- JavaScript syntax checks: passed for the app and Studio modules.
- `plutil -lint` on the iOS plist and Xcode project: both OK.
- `xcrun swiftc -parse native/ios/App/App/StudioSave.swift`: passed. This is syntax proof, not an app build or Swift typecheck against Capacitor.
- `node tests/release-gate.mjs --coverage-only`: exit 0. Reports 388 audits, 122 fast, 129 full, 137 skipped.
- `node tests/precache-audit.mjs`: exit 1, 5/6 passed. Existing failure: `js/laboratory.js` is missing from PRECACHE. The import in `js/loot.js` and omission from `sw.js` are present in HEAD. All three new Studio modules are included. The unrelated Laboratory gap was left unchanged.
- `node tests/figure-audit.mjs`: exit 1, incomplete. It retained an existing coverage failure for the `chip kin` pet call site, then localhost binding was denied. The same call site is unregistered in HEAD at `js/app.js:20291`. See [figure-audit.txt](figure-audit.txt).
- The real browser UI audit could not be established after the local-server restriction. Touch reach, preview quality, offline browser behavior and native permission/save sheets remain unproven.
- Native builds were not compiled, installed or run. Existing installed shells need a build containing `StudioSave`; the UI reports an unavailable bridge and keeps the draft when it is absent.

I cannot see the rendered result. **Visual review is owed before this goes to a player.** Native saving and browser downloading also need device/runtime review before release.

## Denied or blocked actions

- Initial offline dependency installation lacked a usable cached metadata response (`ENOTCACHED`). A second attempt hit `EPERM` writing npm's default cache outside the writable roots. Installation succeeded offline using a copied cache under `/private/tmp`; no permissions were escalated and the original cache was not modified by this work.
- Figure browser proof was blocked by `listen EPERM: operation not permitted 127.0.0.1`. No attempt was made to bypass the restriction.
- No commit, push, deployment, publication or PR was attempted.

## Deviations and unresolved inputs

1. The work order requests the player's own caption but also forbids free text in v1. Both cannot be implemented literally. The implemented proposed interpretation is a player-selected fixed caption from the revised mockup's neutral lines, plus off. No free-text field or health-context quote source was added.
2. `docs/reviews/studio-grill.md` and `docs/reviews/studio-persona.md` do not exist in this checkout. They could not be read. The frozen order, revised mockup, Studio plan, figure contract and relevant CLAIMS material were used; no source was fetched or edited from another checkout.
3. The safe information rectangle is 950x1270 at x=65 to 1015 and y=270 to 1540. The reference's phrase “1080x1270 usable band” describes its full width before side margins; the numeric 65px side reservations govern implementation.

No frames ship. The frame catalogue is empty, the picker displays only None, and forced frame exports are rejected. Stickers, AR, buddy/squad cards, auto-cards, Instagram and share-sheet integration remain outside this work.

The native save implementations follow Apple's [add-only Photos authorization API](https://developer.apple.com/documentation/photos/phphotolibrary/requestauthorization(for:handler:)), Android's [create-document storage flow](https://developer.android.com/training/data-storage/shared/documents-files), and the [Capacitor Android plugin callback contract](https://capacitorjs.com/docs/plugins/android).
