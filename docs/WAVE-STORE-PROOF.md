# WAVE store: advisory implementation and proof report

2026-09-07. Prepared for independent provider review, not an approval to submit.
Frozen plan SHA256 verified:
`31d69d1adff6e318f9970d0a65ab42665b94972fdb0a9c7d821857e07f575f05`.
The supplied plan was read at `../specs/wave-store.md`; all implementation
paths below resolve relative to this checkout. No original checkout was edited.

## Files changed

| File | Change |
|---|---|
| `native/build-ios.sh` | Refuse missing/invalid SUBMISSION before side effects; derive native directory from script location; check synced public resources and archive; separate internal/submission archive and export paths. |
| `native/build-store.sh` | Generate submission.json containing submission channel and app.js SHA256; replace obsolete manual config-swap instructions. |
| `native/submission-preflight.mjs` | Require marker input, validate channel/hash, fail closed on unreadable inputs, retain flag/config/copy checks. |
| `native/README.md` | Document explicit internal/submission modes, output paths, marker and script upload behavior. |
| `tests/submission-build-audit.mjs` (new) | Node-only shell integration fixture. Checks real script flow with local fake platform commands, config restoration, mode/path behavior and independently corrupted synced/archived resources. |
| `tests/submission-preflight-audit.mjs` | Supply content-bound markers and prove an internal marker with a correct hash is refused. |
| `tests/store-copy-lint.mjs` | Correct the diagnostic describing the retained internal branch to reflect explicit selection. No assertion removed or weakened. |
| `tests/release-gate.mjs` | Register the new shell audit once, in PURE, with description; update existing preflight description. |
| `docs/SUBMISSION-CHECKLIST.md` | Replace stale checklist with audited requirements, evidence/status/owner per item, runtime findings, ordered Tom tasks and estimates. |
| `docs/CLAIMS.md` | Add one dated WAVE section, preserving every existing section. PROOF entries use bare test filenames. |
| `docs/WAVE-STORE-PROOF.md` (new) | This advisory report and captured proof output. |

## Guard scope and deviations

- The silent internal default is removed: internal callers now explicitly set
  SUBMISSION=0. Internal remote-shell testing remains available. Submission
  uses SUBMISSION=1. This is the intended R45-9 behavior change.
- Literal prevention of an arbitrary manual Xcode/ASC upload is impossible
  within this checkout. Proposed boundary: require this script and verify the
  archived submission marker/preflight against the selected ASC build. The
  marker binds app.js, not all assets or native executable bytes, and is not
  cryptographic attestation. Unrelated tools can bypass a local script.
- The frozen 12+ wording conflicts with Apple's current newer-OS age-rating
  values. Proposed resolution in the checklist: preserve Tom's content and
  tobacco descriptors and use the current generated rating with his
  acknowledgment. No content or ASC rating was changed.
- No support address was invented. `support.html`, `privacy.html`,
  `TESTFLIGHT.md` and `js/app.js` are outside lane ownership. Exact proposed
  changes are in the checklist: direct support mail links, corrected hosted
  privacy href, truthful collection/linkage/step-sharing copy, corrected
  metadata and store-specific handling of web refresh actions.
- Native dependency installation, capability repair and export signing choices
  remain Tom's preparation work. No unrelated native integration was changed.
- No `tally/CLAUDE.md` exists within this checkout. The existing root CLAUDE.md
  and supplied contract were read; no original checkout was searched for it.
- No commit/push occurred. The user's current prohibition overrides the frozen
  plan's conflicting commit-and-push sentence.

## Denied, blocked and unrun actions

No tool action was denied by an approval mechanism. No approval was requested.
Real browser/server proofs and native/ASC/Worker operations were prohibited by
the work order and were not attempted. No local listener was bound. The shell
audit's npx/xcodebuild/xcrun/python3 names resolve exclusively to executables
created in its temporary fixture. They log/copy fixture files; they do not
invoke Capacitor, Xcode, altool, asc.py, credentials or the network. Real
build-store.sh runs only inside that fixture with a tiny fake build-www.sh.
The large real application bundle was not built.

This checkout lacks native/node_modules and native/build/exportOptions.plist.
The real path needs dependency installation/resolution and a reviewed export
configuration. No real archive, installation, boot, upload, distribution,
Worker migration/deploy, publication, PR, version stamp or protected
native/ASC-SUBMISSION.md edit happened.

The store binary remains unproven. Expected device acceptance is specified in
Tom's step 5 of the checklist: correct local origin, cold launch, usable saved
data and controls, permissions, networking, recovery and deletion. Those are
acceptance criteria, not observed results or fabricated expected test stdout.

## Red proof method

Each red run copied the changed native scripts, the new audit and its scanner
into a fresh temporary checkout, linked existing test dependencies read-only,
and reverted only the named fix there. The audit then ran as
`node tests/submission-build-audit.mjs` from that copy. Originals were never
mutated, and each temporary copy was removed. The original-path mutant is
refused by the audit before executing the copied shell script.

Reversions: silent default; original-checkout NATIVE path; preflight reading
www instead of synced public; removal of post-archive preflight; generic shared
artifact paths; removal of marker hash comparison. Each audit exited 1.
Restored checkout tests then exited 0. Output and child exit statuses were
captured separately into files through spawnSync, never read through a pipe.
The following are captured stdout/stderr, not illustrative transcripts.

## RED: restore silent internal default

`node tests/submission-build-audit.mjs`

Exit: 1

```text
FAIL unmarked/invalid mode unset refuses before side effects (exit 0)
FAIL unmarked/invalid mode "" refuses before side effects (exit 0)
FAIL unmarked/invalid mode "true" refuses before side effects (exit 0)
FAIL unmarked/invalid mode "2" refuses before side effects (exit 0)
PASS explicit internal build remains remote and uses internal artifacts
PASS CONTROL marked submission validates copied resources and archive, then exports its own IPA
PASS CONTROL sync-copy refused before archive; config restored
PASS CONTROL archive-copy refused before export/upload; config restored
PASS CONTROL archive-server refused before export/upload; config restored
PASS CONTROL archive-unmarked refused before export/upload; config restored
PASS CONTROL sync-fail restores config and stops upload
PASS CONTROL archive-fail restores config and stops upload
submission build: 4 FAILED
```

## RED: restore original-checkout path

`node tests/submission-build-audit.mjs`

Exit: 1

```text
FAIL build-ios.sh must resolve its own checkout before fixture execution
```

## RED: inspect www instead of copied iOS resources

`node tests/submission-build-audit.mjs`

Exit: 1

```text
PASS unmarked/invalid mode unset refuses before side effects (exit 2)
PASS unmarked/invalid mode "" refuses before side effects (exit 2)
PASS unmarked/invalid mode "true" refuses before side effects (exit 2)
PASS unmarked/invalid mode "2" refuses before side effects (exit 2)
PASS explicit internal build remains remote and uses internal artifacts
PASS CONTROL marked submission validates copied resources and archive, then exports its own IPA
FAIL CONTROL sync-copy refused before archive; config restored
PASS CONTROL archive-copy refused before export/upload; config restored
PASS CONTROL archive-server refused before export/upload; config restored
PASS CONTROL archive-unmarked refused before export/upload; config restored
PASS CONTROL sync-fail restores config and stops upload
PASS CONTROL archive-fail restores config and stops upload
submission build: 1 FAILED
```

## RED: remove archive preflight

`node tests/submission-build-audit.mjs`

Exit: 1

```text
PASS unmarked/invalid mode unset refuses before side effects (exit 2)
PASS unmarked/invalid mode "" refuses before side effects (exit 2)
PASS unmarked/invalid mode "true" refuses before side effects (exit 2)
PASS unmarked/invalid mode "2" refuses before side effects (exit 2)
PASS explicit internal build remains remote and uses internal artifacts
FAIL CONTROL marked submission validates copied resources and archive, then exports its own IPA
PASS CONTROL sync-copy refused before archive; config restored
FAIL CONTROL archive-copy refused before export/upload; config restored
FAIL CONTROL archive-server refused before export/upload; config restored
FAIL CONTROL archive-unmarked refused before export/upload; config restored
PASS CONTROL sync-fail restores config and stops upload
PASS CONTROL archive-fail restores config and stops upload
submission build: 4 FAILED
```

## RED: restore shared archive/export paths

`node tests/submission-build-audit.mjs`

Exit: 1

```text
PASS unmarked/invalid mode unset refuses before side effects (exit 2)
PASS unmarked/invalid mode "" refuses before side effects (exit 2)
PASS unmarked/invalid mode "true" refuses before side effects (exit 2)
PASS unmarked/invalid mode "2" refuses before side effects (exit 2)
FAIL explicit internal build remains remote and uses internal artifacts
FAIL CONTROL marked submission validates copied resources and archive, then exports its own IPA
PASS CONTROL sync-copy refused before archive; config restored
PASS CONTROL archive-copy refused before export/upload; config restored
PASS CONTROL archive-server refused before export/upload; config restored
PASS CONTROL archive-unmarked refused before export/upload; config restored
PASS CONTROL sync-fail restores config and stops upload
PASS CONTROL archive-fail restores config and stops upload
submission build: 2 FAILED
```

## RED: remove marker digest comparison

`node tests/submission-build-audit.mjs`

Exit: 1

```text
PASS unmarked/invalid mode unset refuses before side effects (exit 2)
PASS unmarked/invalid mode "" refuses before side effects (exit 2)
PASS unmarked/invalid mode "true" refuses before side effects (exit 2)
PASS unmarked/invalid mode "2" refuses before side effects (exit 2)
PASS explicit internal build remains remote and uses internal artifacts
PASS CONTROL marked submission validates copied resources and archive, then exports its own IPA
FAIL CONTROL sync-copy refused before archive; config restored
FAIL CONTROL archive-copy refused before export/upload; config restored
PASS CONTROL archive-server refused before export/upload; config restored
PASS CONTROL archive-unmarked refused before export/upload; config restored
PASS CONTROL sync-fail restores config and stops upload
PASS CONTROL archive-fail restores config and stops upload
submission build: 2 FAILED
```

## GREEN: agreed proof command

`node tests/store-copy-lint.mjs`

Exit: 0

```text
PASS scanner single URL: ["reachable \"testflight.apple.com\" at fixture.js:4"] (want ["reachable \"testflight.apple.com\" at fixture.js:4"])
PASS scanner template URL: ["reachable \"testflight.apple.com\" at fixture.js:4"] (want ["reachable \"testflight.apple.com\" at fixture.js:4"])
PASS scanner double URL: ["reachable \"testflight.apple.com\" at fixture.js:4"] (want ["reachable \"testflight.apple.com\" at fixture.js:4"])
PASS scanner genuine line comment: [] (want [])
PASS scanner comment-like string: ["reachable \"TestFlight\" at fixture.js:4"] (want ["reachable \"TestFlight\" at fixture.js:4"])
PASS scanner block-like string: ["reachable \"TestFlight\" at fixture.js:4"] (want ["reachable \"TestFlight\" at fixture.js:4"])
PASS scanner genuine block comment: [] (want [])
PASS scanner after block comment: ["reachable \"TestFlight\" at fixture.js:5"] (want ["reachable \"TestFlight\" at fixture.js:5"])
PASS scanner multiline template: ["reachable \"testflight.apple.com\" at fixture.js:5"] (want ["reachable \"testflight.apple.com\" at fixture.js:5"])
PASS scanner nested template expression: ["reachable \"testflight.apple.com\" at fixture.js:4"] (want ["reachable \"testflight.apple.com\" at fixture.js:4"])
PASS scanner template expression comment: [] (want [])
PASS scanner escaped quote: ["reachable \"TestFlight\" at fixture.js:4"] (want ["reachable \"TestFlight\" at fixture.js:4"])
PASS scanner regex literal: ["reachable \"TestFlight\" at fixture.js:4"] (want ["reachable \"TestFlight\" at fixture.js:4"])
ok store copy: beta surfaces unreachable and store strings clean
```

## GREEN: restored build guard

`node tests/submission-build-audit.mjs`

Exit: 0

```text
PASS unmarked/invalid mode unset refuses before side effects (exit 2)
PASS unmarked/invalid mode "" refuses before side effects (exit 2)
PASS unmarked/invalid mode "true" refuses before side effects (exit 2)
PASS unmarked/invalid mode "2" refuses before side effects (exit 2)
PASS explicit internal build remains remote and uses internal artifacts
PASS CONTROL marked submission validates copied resources and archive, then exports its own IPA
PASS CONTROL sync-copy refused before archive; config restored
PASS CONTROL archive-copy refused before export/upload; config restored
PASS CONTROL archive-server refused before export/upload; config restored
PASS CONTROL archive-unmarked refused before export/upload; config restored
PASS CONTROL sync-fail restores config and stops upload
PASS CONTROL archive-fail restores config and stops upload
ok submission build: explicit modes, separate artifacts, copied and archived content guarded (fixture tools only)
```

## GREEN: preflight failure cases and control

`node tests/submission-preflight-audit.mjs`

Exit: 0

```text
PASS  HEALTHY  a correct store bundle passes  exit 0 (want 0)  submission preflight passed: marked store bundle, local config, no reachable beta strings
PASS  MARKER   internal channel is refused even with a correct hash  exit 1 (want 1)  SUBMISSION PREFLIGHT FAILED: submission marker missing, wrong channel or does not match bundle bytes
PASS  FLAG     a bundle built without STORE_BUILD=1 is refused  exit 1 (want 1)  SUBMISSION PREFLIGHT FAILED: /var/folders/k7/gh5s55k16q17nlm_hj_3g3bm0000gp/T/submission-preflight-Hu5zfc/flag.js does not declare STORE_BUILD = true (the bundle was built without STORE_BUILD=1)
PASS  SERVER   a synced config that still has a server URL is refused  exit 1 (want 1)  SUBMISSION PREFLIGHT FAILED: /var/folders/k7/gh5s55k16q17nlm_hj_3g3bm0000gp/T/submission-preflight-Hu5zfc/server.json still has a server key, so the app would load the live site over the network instead of its own bundle
PASS  STRING   a reachable TestFlight string is refused  exit 1 (want 1)  SUBMISSION PREFLIGHT FAILED: reachable "TestFlight" at /var/folders/k7/gh5s55k16q17nlm_hj_3g3bm0000gp/T/submission-preflight-Hu5zfc/string.js:5
PASS  SCANNER  single-url  exit 1 (want 1)  SUBMISSION PREFLIGHT FAILED: reachable "testflight.apple.com" at /var/folders/k7/gh5s55k16q17nlm_hj_3g3bm0000gp/T/submission-preflight-Hu5zfc/single-url.js:5
PASS  SCANNER  template-url  exit 1 (want 1)  SUBMISSION PREFLIGHT FAILED: reachable "testflight.apple.com" at /var/folders/k7/gh5s55k16q17nlm_hj_3g3bm0000gp/T/submission-preflight-Hu5zfc/template-url.js:5
PASS  SCANNER  double-url  exit 1 (want 1)  SUBMISSION PREFLIGHT FAILED: reachable "testflight.apple.com" at /var/folders/k7/gh5s55k16q17nlm_hj_3g3bm0000gp/T/submission-preflight-Hu5zfc/double-url.js:5
PASS  SCANNER  line-comment  exit 0 (want 0)  submission preflight passed: marked store bundle, local config, no reachable beta strings
PASS  SCANNER  comment-in-string  exit 1 (want 1)  SUBMISSION PREFLIGHT FAILED: reachable "TestFlight" at /var/folders/k7/gh5s55k16q17nlm_hj_3g3bm0000gp/T/submission-preflight-Hu5zfc/comment-in-string.js:5
PASS  COVERAGE registered helper  exit 0 (want 0)  coverage: 301 audits on disk, 114 fast, 128 full, 59 skipped
PASS  COVERAGE unregistered runnable refused  exit 1 (want 1)  FAIL  coverage: 1 declared audit file(s) belong to no running tier:
        unregistered-store-fixture.mjs
        Put each runnable file in exactly one of PURE, BROWSER, or DECLARED full.

submission preflight: refuses marker, flag, server and copy defects; passes the control
```

## GREEN: release-gate registration coverage

`node tests/release-gate.mjs --coverage-only`

Exit: 0

```text
coverage: 301 audits on disk, 114 fast, 128 full, 59 skipped
```

## GREEN: shell syntax

`bash -n native/build-ios.sh native/build-store.sh`

Exit: 0

```text
(no output)
```

## Final file checks

`git diff --check`: exit 0, no output. All 11 changed files are within native/, docs/ and tests/. Existing CLAIMS sections are byte-preserved. No added em dashes.
