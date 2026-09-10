# Studio Wardrobe entry: advisory report

The scoped implementation is ready for independent review. Acceptance remains incomplete: the full PURE tier has one failure, current remote main could not be verified, and browser/device proof is BLOCKED. No commit, rebase, push or publication was performed.

Frozen plan SHA256 verified: `1843bfa5a6b906eb942057822a07ad367847bbfdbf1786447e48cb341af087b1`. All source paths resolved inside this checkout. Starting HEAD was `9cc5619e50194c232c019263901f3889939d1bf3`; local `origin/main` was `1410163e7b004f98db6dfeacf8028b7bc81389e7`. HEAD already contains that main, plus the mockup and half-build commits (ahead 2, behind 0).

## Files changed in this task

| File | Change |
| --- | --- |
| `js/app.js` | Wardrobe-only Studio entry becomes a right-aligned text control; the unavailable-pet screen uses a quiet exit too. Existing route and click handler retained. |
| `app.css` | Studio-only header, text-link controls, focus/hover states and top-control spacing. Entry and exit retain 44px minimum touch height. Only the Studio block beginning at line 11957 changed. |
| `js/studio-screen.js` | Quiet exit beside the title; Backdrop before the preview; explicit preset-caption choice; quieter retry; native capability-specific help and status. |
| `js/studio-save.js` | Detects missing native plugin support, including unavailable proxies and UNIMPLEMENTED responses, and gives an actionable error without claiming a save. |
| `tests/studio-audit.mjs` | Production entry expression/click-handler checks, quiet-style mutation controls, control ordering, fixed-caption wording and current-shell save behavior. Existing real raster proof retained. |
| `js/changelog.js` | Two unversioned `NEXT_CHANGES` items. |
| `docs/CLAIMS.md` | Matching `vNEXT` section with exactly one PROOF row per new changelog item, Tom's early-version request, and native-build limitation. |
| `docs/reviews/studio-wardrobe-entry/` | This report, `unit-output.txt`, `studio-audit.txt`, `coverage.txt`, `pure-enumeration.json`, `pure-results.json`, and `pure-results.txt`. |

The compositor, native plugins and existing registrations were retained from the half-build. No Shop rack rule, version stamp, `native/ASC-SUBMISSION.md`, or original checkout was changed. The local, ignored `node_modules/acorn` directory was restored from the existing cache at the pinned version 8.14.0; tarball integrity was verified. No dependency manifest or lockfile changed.

## Proof output

| Command | Exit | Result |
| --- | --- | --- |
| `node tests/unit.test.js` | 0 | `385 passed, 0 failed` |
| `node tests/studio-audit.mjs` | 0 | Real 1080x1920 PNG compose/decode, deterministic bytes, registered layer order, shiny pixels, privacy, controls, exact save-byte handoff and new entry/save guards pass. |
| `node docs/train542-integration/run-pure.mjs /private/tmp/studio-wardrobe-entry-pure-final` | 1 | `160/161 PURE entries exit 0`. All 161 unique entries enumerated from the release gate declaration and registrations; minimum 157 checked. The complete tier is NOT green. |
| `node tests/release-gate.mjs --coverage-only` | 0 | `coverage: 418 audits on disk, 127 fast, 130 full, 161 skipped` |
| `git diff --check` | 0 | No whitespace errors. |

Full agreed proof: [unit output](unit-output.txt). Studio output: [raster and handler proof](studio-audit.txt). Complete PURE enumeration and exits: [readable results](pure-results.txt), [JSON enumeration](pure-enumeration.json), [JSON results](pure-results.json). Raw per-process streams remain under `/private/tmp/studio-wardrobe-entry-pure-final`.

The PNG digest in this runtime is `9ec1ca64dc8d9fc934807e15b2fe9c18ca0f43a09b958e0d0c18283c6a3afcfd`. This demonstrates repeatability in this runtime, not across rendering engines. Entry reach and prominence guards exercise production source/handlers and reject missing, primary-button and accent-filled mutations; they do not establish actual browser hit-testing or rendered hierarchy.

The sole PURE failure is `icon-inventory-audit.mjs`, exit 1, `6/7 passed`: `js/studio-screen.js:mountStudio` is missing from its EMITTERS register. The identical failure was reproduced against unmodified starting HEAD in a disposable directory. The first census also had two exit-97 missing-acorn results; restoring the pinned cached dependency resolved both in the complete final census.

The required Impeccable detector ran once and exited 2 with warnings. The Studio warning concerns the intentionally hidden preview image, whose Blob URL is assigned and decoded before it is shown. Other warnings concern existing app/CSS outside the changed Studio block. No rendered validation is inferred from the detector.

## Current TestFlight shell

For build 19 as described in the frozen order, the native bridge lacks StudioSave. Once these web changes are delivered, players can compose and view the image. Tapping Save reports: "This app build cannot save Studio images yet. Saving needs a newer app build. Your draft is still here." It keeps the preview and draft, writes no image, requests no browser download, and claims no success. The screen also explains the limitation before the tap.

The existing fallback is a PNG download request in a normal browser only. It does not silently become a working Photos fallback in an old native shell. Actual native saving awaits a build containing the additive plugins. Photos permission and Android picker behavior were not run on a device. Nothing was delivered to TestFlight or published by this task.

## Blocked actions and deviations

1. **Current-main integration is unverified.** `git ls-remote origin refs/heads/main` exited 128: `Could not resolve host: github.com`. No Git mutation was attempted. Proposed integration: independently fetch current main, replay/rebase this work, resolve any conflicts, and rerun proofs when the reviewer is authorized to land it. The explicit no-commit/no-push/no-publish instruction takes precedence over the plan's landing request.
2. **All-PURE-green acceptance is blocked by frozen scope.** `tests/icon-inventory-audit.mjs` is outside the half-build's touched files. It was left unchanged. Proposed deviation: allow this single EMITTERS registration in that file:

   ```js
   'js/studio-screen.js:mountStudio': ['scene', 'The exact Studio export PNG preview, sized by layout.'],
   ```

   This row was tested only in the disposable baseline copy: the audit then exited 0 with `7/7 passed`. It is not present in the reviewed checkout. No guard was weakened or excluded.
3. **Browser/screenshot proof: BLOCKED, operator-owned by the frozen plan.** Run `node tests/figure-audit.mjs` from this checkout. In the app browser, load `tests/ui-audit.js` and run `await uiAudit()` on Wardrobe and Studio. Capture both screens at phone size and verify entry prominence/reach, the quiet exit, Backdrop above the fold, and preview prominence. These commands were not run here; no fresh rendered result is claimed.
4. **Native fallback wording was corrected to observed code behavior.** The plan anticipated a fallback on the existing shell; the implementation instead explicitly reports unavailable native saving, as permitted by its honesty requirement. Browser download requests remain available in browsers. A working native fallback is not claimed.

No permission escalation, commit, push, publish, native build, or edit to an original checkout was attempted. No Shop rack deviation was needed. This report is advisory; independent review remains required.
