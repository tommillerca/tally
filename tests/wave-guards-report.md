# R45 guard lane advisory report

2026-09-07. No commit, push, publication, PR, version stamp or deployment.
All source reads and edits resolved within this checkout. The work-order file
matched SHA256 `92f09c49b009612cb161f8e07451c8b786043041b1fa5b0cd2989b70bd120366`.
This report is advisory; independent review remains required.

## Files changed

| File | Change |
| --- | --- |
| tests/mimic-audit.mjs | Named zero-frame CONTROL failure; three dependent pixel rows become UNPROVEN; missing ground no longer exits early; remaining rows continue; verdict preserves failure precedence. |
| tests/boneyard-audit.mjs | Ten-marker ARRIVAL-SLOW reveal sample floor; explicit 400ms SwiftShader latency budget for both laps. |
| tests/godmode.js | GODMODE_DPR or boot deviceScaleFactor override; applies to later viewport calls on the returned page and verifies devicePixelRatio; setWidth preserves current DPR. Default boot remains DPR 2. |
| tests/crate-reveal-audit.mjs | Independent FIRST/SECOND FLICK cadence and burst rows; at least 25 rAF samples per 520ms window, existing over20 <= 6 unchanged; actual burst canvas draw control; corrected performance commentary. |
| tests/guard-debts-audit.mjs | New Node regression suite executing the actual grading blocks and boot plumbing with controlled inputs. |
| tests/submission-build-audit.mjs | New artifact guard requiring explicit submission mode, a hash-bound marker and existing native content preflight; no-argument invocation runs labeled synthetic self-tests. |
| tests/release-gate.mjs | Both new audits registered exactly once in PURE with descriptions. |
| docs/CLAIMS.md | One dated lane section appended. Earlier sections untouched; new section supersedes the v500 crate numbers and records limits. |
| tests/wave-guards-report.md | This report. |

## Agreed proof

`node tests/guard-hygiene-lint.mjs`, exit **0**:

```text
ok    SETUP the lint found test files to scan  317 files
ok    RUNNER no case is registered after the runner has already drained  none
ok    SETUP the audit scan is not vacuous  283 audits
ok    CONTROL the number of audits with NO positive control does not rise above 49  47 of 283 carry no CONTROL/PREMISE/SETUP/REACH/SAMPLE row. ratchet holding
ok    PARSES every audit is something Node will actually execute  317 files parse
ok    SEAM no NEW audit proves a feature only through a test hook  29 known seam-only, 0 new
ok    SEAM the seam-only inventory has no stale entries (fixed one? delete its line)  inventory matches

guard-hygiene: clean
```

Additional Node checks, all exit 0:

| Command | Result |
| --- | --- |
| node tests/guard-debts-audit.mjs | 14 PASS rows; guard-debts: clean |
| node tests/submission-build-audit.mjs | Eight artifact fixture cases; submission-build self-test: clean |
| node tests/submission-preflight-audit.mjs | Existing content refusals and coverage positive/negative controls pass |
| node tests/release-gate.mjs --coverage-only | coverage: 302 audits on disk, 114 fast, 128 full, 60 skipped |
| node tests/guard-provenance-lint.mjs | guard-provenance: clean |
| node tests/claim-evidence-lint.mjs | claim-evidence: clean |

`git diff --check` passed. The hygiene command parsed all 317 top-level test
scripts. Coverage-only does not start the release gate's server or browser suites.

## Red and restored green

On a throwaway copy, the four existing audit/harness files were replaced with
this checkout's exact `HEAD` contents. Each replacement was asserted different
from the working version. The new Node regression suite then exited 1 with
`guard-debts: 10 FAILED`. Healthy trace, ten-marker, full-rate and default-DPR
controls remained green. Restoring the working files on that copy produced
`guard-debts: clean`, exit 0.

Selected actual red output:

```text
FAIL  MIMIC zero frames: named failure, three UNPROVEN pixel rows, later HANDOVER runs: Cannot read properties of undefined (reading 'full')
FAIL  MIMIC missing ground and undersampled trace cannot pass pixel rows: Cannot read properties of null (reading 'mean')
```

The ARRIVAL-SLOW failure included the original row's `"pass":true` and
`"1 visible once the fade settled, against 1 already placed at reveal"`.
The latency failure returned `[260, 362, 1200, null]` as bad samples instead
of `[1200, null]`. The first-flick failure included `"pass":true` with
`"over20":1,"over34":1,"worst":220,"frames":19,"worstAt":220`.
DPR override failed with `2 !== 3`.

Corresponding restored green output:

```text
PASS  MIMIC zero frames: named failure, three UNPROVEN pixel rows, later HANDOVER runs
PASS  ARRIVAL-SLOW one-marker R45 sample is UNPROVEN, never PASS
PASS  LATENCY SwiftShader R45 260/362ms pass; 1200ms hold and missing visibility fail
PASS  FIRST FLICK stalls cannot hide behind the healthy second flick
PASS  DPR 3 reaches launch, legacy setViewport and setWidth; option overrides env
PASS  DPR refuses a page that reports the wrong physical scale
```

For the new artifact guard, a separate throwaway mutation bypassed marker reads
and supplied matching hashes from the inspected content. This models the old
content-only acceptance; it is not an iOS build reproduction. The exact mutation
was asserted applied. The healthy content control stayed green, but the suite
exited 1 with four failures, including:

```text
FAIL  ARTIFACT unmarked clean artifacts refused even with SUBMISSION=1  exit 0 (want 1)
submission-build self-test: 4 FAILED
```

Restoring the marker read gave exit 0:

```text
PASS  ARTIFACT unmarked clean artifacts refused even with SUBMISSION=1  exit 1 (want 1)
submission-build self-test: clean
```

Full logs and separate `.exit.txt` files are at `/private/tmp/wave-guards-proof-vg4_e8kt`.
No exit status was read through a pipe. These are Node grading/plumbing proofs,
not browser, compositor or archived-build proofs.

## Denied, blocked and deviations

No tool action was denied and no automatic approval rejection occurred.
Browser/server proofs were prohibited by the frozen work order and were not
attempted. No App Store Connect, Worker, original-checkout or native mutation
was attempted. The frozen plan's commit/push instruction was superseded by the
user's explicit prohibition. `CLAUDE.md` was read; `tally/CLAUDE.md` does not
exist in this checkout. No substitute checkout was edited.

- **R45-3:** The Node test proves the empty trace cannot discard the subsequent
  HANDOVER grading block, and checks the final verdict logic separately. Running
  all later arena rows in a browser remains unverified.
- **R45-4:** The allowed budget change is explicit: 250ms to 400ms in both
  already-forced SwiftShader laps, accounting for the supplied 362ms worst
  reading as a 220ms fade plus 180ms scheduling/sampling slack. No hardware-phone
  budget was measured. The one-marker slow reveal is now UNPROVEN; a successful
  whole-suite exit is not promised for that scenario. The ten-marker floor is
  shared with FAST. The original false claim that revealDom must be zero was
  removed from the diagnostic.
- **R45-5:** The supplied R45 measurements support the burst mechanism improvement,
  not the old full-rate claim. The first-flick app fix remains out of lane.
  Proposed app-lane work: profile the first 520ms window of a newly opened crate,
  isolate the remaining compositor/layout/decode cost with the burst paused,
  then fix the measured bottleneck and rerun first and second moves separately.
  No app fix is inferred from the timing summary alone.
- **R45-9:** A tests-only change cannot enforce the operator's actual historical
  build command or stop an upload that bypasses the guard. The new schema is a
  proposed provenance mechanism, not an integrated native build fix. No real
  submission build was certified. See the exact integration proposal below.
- **R45-10:** Capability added without changing default boot DPR. On opt-in runs,
  overriding legacy per-page DPR 2 requests is intentional so the art guards
  actually retain DPR 3 after resizing. setWidth now preserves an existing
  non-default DPR, instead of resetting it to 2. The override covers the page
  returned by boot; independently created pages inherit launch DPR but do not
  receive that page's resize wrapper. Rendered art still needs reviewer proof.
- **R45-7, R45-8, R45-11:** Their definitions are absent from both the work order
  and the checkout Markdown search. Proposed resolution for each: recover its
  finding body, observed failing state and reproduction; identify the owned
  files; add an end-of-path guard and send any app/native fix to its owner.
  Assigning a specific defect or fix from these IDs would invent requirements.

## Native integration proposal, not implemented

In `native/build-ios.sh`, have the submission branch create
`submission-build.json` after bundling and Capacitor sync, alongside the assets
that will actually be archived. Its schema is:

```json
{
  "schema": 1,
  "mode": "submission",
  "appSha256": "SHA256 of the inspected bundled app.js bytes",
  "configSha256": "SHA256 of the inspected synced capacitor.config.json bytes"
}
```

Remove stale markers in the internal-build branch. Before archiving, invoke:

```sh
SUBMISSION=1 node tests/submission-build-audit.mjs <bundled-app.js> <synced-config.json> <submission-build.json>
```

Use the packaged iOS public app.js and synced iOS config, not source app.js or
an unrelated www directory. Carry the marker in the archive and require the
submission/upload entry point to rerun the guard against extracted archive
bytes. If Xcode/manual submission can bypass that entry point, it remains
outside the enforcement boundary and cannot be described as guarded. Hashes
prevent stale artifact evidence; they are not signatures or proof against
someone deliberately fabricating a marker. The native owner must implement
and test that integration, including internal, submission and stale-marker
builds. This lane changed no native file.

## Reviewer browser proofs, not run

| Command | Expected diagnostic or bound, not a predicted green suite |
| --- | --- |
| node tests/mimic-audit.mjs | Empty trace: named ZERO-FRAME TRACE failure, three UNPROVEN pixel rows, later rows and MIMIC AUDIT FAILED verdict. Healthy capture grades those rows normally. |
| node tests/boneyard-audit.mjs | Prints explicit 400ms SwiftShader budget. A one-marker reveal prints ARRIVAL-SLOW UNPROVEN. Withheld markers fail on a sample of at least ten; 1200ms holds still fail. |
| node tests/crate-reveal-audit.mjs | FIRST FLICK and SECOND FLICK cadence and burst rows separately. The known first-flick defect may still fail >=25 samples / <=6 over20; zero burst calls does not imply good cadence. |
| GODMODE_DPR=3 node tests/art-resolution-audit.mjs | Prints verified DPR 3; existing art-resolution bounds stay unchanged and may expose real 3x defects. |
| GODMODE_DPR=3 node tests/figure-audit.mjs | Verified DPR 3; operate and grade the existing figure surfaces. |
| GODMODE_DPR=3 node tests/pit-figures-audit.mjs | Verified DPR 3 survives viewport resizing; existing figure rows run. |
| GODMODE_DPR=3 node tests/pixel-art-swap-audit.mjs | Verified DPR 3 survives its explicit legacy DPR 2 viewport request. |

The reviewer must perform real browser mutation red-green runs on those paths.
The requirement to prove the full browser behavior red and green could not be
satisfied under this lane's explicit prohibition. No browser result is claimed.
