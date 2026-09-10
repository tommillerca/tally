# R6 guards: advisory implementation report

Frozen plan SHA256 verified: `7e14135a750ab76b1dbe9cf69a61106ba9613e7c1e39e0a637548c1242fbfbf1`.
Checkout HEAD: `3a403423999f542ee08cb4758d619f946e3c9c6f`.
All source paths were resolved within this checkout. No original checkout was edited. No commit, push, publish or version-stamp change occurred. Product logic in `js/app.js`, `js/pets.js`, `js/loot.js`, `js/laboratory.js` and `js/db.js` is unchanged. The only JavaScript outside tests changed is the explicitly requested pending `NEXT_CHANGES` list in `js/changelog.js`.

## Before and now: all six work items

| Item | Before | Now and proof |
| --- | --- | --- |
| R6-A4 | Operator-reported exit 1: `{"picked":0,"warn":false}`, with `FAIL SAMPLE the breeding pair is flagged and the warning is mounted`. That was a fixture failure. The active class moved to `[data-cfdot]` buttons, while the fixture searched child `i` elements, selected the same pet twice and deselected it. Its conditional seed could also leave too few distinct species. | Seed all three carousel species, clear saved selection and use the active button. A failed selection now says `FIXTURE SETUP`; the product `WARNING` row is reached only after two selections. The Node DOM model reproduces old picked=0 and new picked=2. Real warning, gutter, touch and cover results on this checkout are **UNPROVEN**, not green or product-red: listener creation was denied before boot. [Denied run](before-scroll.txt), [fixture controls](guard-controls.txt). |
| R6-G1 | [Old audit exited 0](before-stale.txt) and claimed quick confirmation rejected newly arrived health steps. Its equipped-pet seed actually forced typed review. | The first tap must arm unequipped a and open zero sheets. A nickname arriving between taps stales the retained quote, preserves a and dust, clears consent and opens typed review. Fresh consent then consumes a once. A separate control adds 1,000 pending health steps: equipped b quotes those steps, unequipped a quotes zero and completes quick destruction. [Exit 0](after-stale.txt). The nonexistent pending-health rule for an unequipped pet is removed. |
| R6-G2 | [Old audit exited 0](before-loss.txt), asserting only Destroy disclosures. The supported breed mode was never invoked. | Calls `stable(roster,'breed')` with a same-cell keeper and invested feed pet. The first tap must actually arm or open confirmation without consuming the pet. It grades all investment losses in that confirmation. **Expected exit 1: R6-S3**, missing banked steps, nickname loss, bond, chosen talents, talent name and lineage loss. This is still registered in PURE and remains an app-lane defect. [Exact red](after-loss.txt). |
| R6-G3 + R6-A2 | [Old audit exited 0 and printed 14/14](before-room2.txt), while claiming findings 5 to 20. Findings 6 and 15 had no predicates. | The denominator is the independent declared range, 16. Every declared ID is graded or reported missing; failures do not prevent later findings running. Both missing guards are now implemented in Node. Finding 6 confirms equipped/replacement disclosure and actual replacement. Finding 15 checks that the shiny preserves Base and that the review distinguishes the lost ordinary appearance from retained collection ownership. **15/16 pass, 1 fails, 0 missing**. Finding 15 is a real app-lane copy defect. The deletion control reports 14/16 when 6 and 15 are removed. [All results](after-room2.txt), [negative controls](guard-controls.txt). |
| R6-G4 | Lock recovery's eight cases never wrote health, so its green result could not establish finding 1 coverage. The separate health audit supplied that coverage. There was no executable finding-to-file requirement. | An executable mapping requires `lab-health-recovery-audit.mjs` on disk and exactly once in PURE before release coverage can pass. Direct lock runs import and execute the health audit as well, so deletion also breaks that invocation. Controls reject both file deletion and deregistration while the lock audit remains present. [Lock and health output](after-lock.txt): eight lock cases pass, with separate health controls and an explicit mapping line. |
| R6-A3 | The unlabelled evidence array was already post-fix, including `ready, ready, ready` beside finding 1's historical lock narrative. [Preserved excerpts](before-evidence.json) demonstrate the mismatch; they are not pre-fix evidence. | Regenerated [evidence.json](../playtest-lab/evidence.json) carries a post-fix phase, capture time, source hashes, historical-narrative reference and Node limitations. [PLAYTEST-LAB](../PLAYTEST-LAB.md) labels all original ranked findings historical and supplies a current disposition table. The wrapper applies to every evidence group. The room audit reads `groups`. A control rejects the old unlabelled-array shape. No missing historical raw capture is invented. |

The new baseline rows for findings 6 and 15 are explicitly labelled **synthetic negative controls derived from the historical report**, with placeholder IIDs. They are not presented as recovered original JSON measurements. All other existing pre-fix observation rows are preserved.

## Required proof

Agreed command, [complete output](unit-output.txt):

```text
$ node tests/unit.test.js
384 passed, 0 failed
```

R6-S3, deliberately red and out of lane:

```text
OBSERVED R6-S3 breed confirmation: BISCUIT (Base Drizzle · Lv 7) is destroyed for good and your keeper gains a lineage rank. Tap again to confirm.
FAIL R6-S3 Breed discloses every consumed investment: missing=banked steps, nickname, bond, talents, talent name, lineage (expected red, app lane)
AssertionError [ERR_ASSERTION]: R6-S3: Breed confirmation must disclose all consumed investment; known app-lane defect
```

The second deliberate exception:

```text
FAIL finding 15 (known app-lane disclosure defect; expected red): last appearance must be distinguished from collection ownership
15/16 room 2 guards passed; 1 failed; 0 missing
```

[run-pure.mjs](run-pure.mjs) reads the PURE declaration and all push/unshift additions directly from `tests/release-gate.mjs`, checks uniqueness and refuses fewer than 151 entries. It follows the gate's serial list. Every one of **156 PURE entries** ran. The initial run had 153 exit-0 results: the two intended reds and one temporary guard-hygiene failure caused by changing the scroll audit's last SAMPLE label to FIXTURE. Restoring an honest `FIXTURE SETUP` label fixed that lint without changing its ceiling or exceptions. Final reruns covered the changed guard controls, room audit and hygiene lint.

Final census: **154/156 PURE files exit 0**. Exactly two exceptions remain:

- `stable-loss-disclosure-audit.mjs`, exit 1: known R6-S3, app lane.
- `lab-room2-audit.mjs`, exit 1: finding 15's ordinary-appearance versus collection warning, app lane.

This is not an all-green release. [Initial full census output](pure-output.txt), [initial per-file exits](pure-results.json), [final per-file exits and rerun provenance](pure-final-results.json), [final tally](pure-final-summary.txt). The initial output's first lines give the temporary directory containing every suite's full stdout/stderr. Relevant final streams are also retained here as `rerun-*.txt`.

[Coverage-only output](coverage-output.txt) exits 0. The gate reports 123 fast browser audits and 129 full audits on this checkout, rather than the frozen plan's older 115-browser figure. `breed-sheet-scroll-audit.mjs` is explicitly `DECLARED full`, so it enters BROWSER under `--all`. It is the only touched browser-dependent audit. The other touched audits are PURE. No browser result is claimed for either tier.

Operator commands, from this checkout on a machine that permits loopback listeners:

```sh
node tests/breed-sheet-scroll-audit.mjs
node tests/release-gate.mjs --all
```

The first command resolves the outstanding A4 product-warning and scrolling verdict. The second includes all browser tiers and will also report the two known PURE reds until the app lane fixes them.

`node --check tests/breed-sheet-scroll-audit.mjs`, `node tests/claim-evidence-lint.mjs` and `git diff --check` pass. The new R6 audit independently verifies that all six `NEXT_CHANGES` items exactly match six `## vNEXT` changelog descriptions and six PROOF rows, since the existing claims lint grades the newest numbered release only.

## Denied actions, blockers and deviations

- **Denied:** running the browser audit could not bind `127.0.0.1`: `listen EPERM: operation not permitted`. Zero rendered assertions ran. No permission escalation or alternate checkout was attempted.
- **Outstanding requirement:** A4's actual product pass/fail cannot be established in this sandbox. Proposed completion: the operator runs the exact browser command above. Node fixture proof is explicitly narrower and does not substitute for that result.
- **Additional deliberate red:** the new finding-15 guard exposes an unfixed app-lane disclosure. Proposed disposition: retain the red until that lane fixes it. R6-S3 likewise stays red as expressly required. Neither assertion was weakened and neither product path was edited.
- **Evidence format change:** `docs/playtest-lab/evidence.json` now wraps rows under `groups` to make the phase distinction machine-readable. Its sole in-checkout JSON consumer, the room audit, is updated. Historical pre-fix raw evidence was unavailable; original narrative is preserved and synthetic controls are labelled.
- **Census difference:** this supplied checkout has 155 existing PURE entries plus the new R6 control audit, and 123 fast browser audits. The report uses the actual gate declarations, not stale plan counts.
- No other denied or blocked actions. No commit, push, publication, version bump, app fix, pet fix or import-path edit was attempted.

## Files changed

Test and harness changes:

- `tests/breed-sheet-scroll-audit.mjs`
- `tests/stable-stale-disclosure-audit.mjs`
- `tests/stable-loss-disclosure-audit.mjs`
- `tests/lab-room2-audit.mjs`
- `tests/lab-lock-recovery-audit.mjs`
- `tests/release-gate.mjs`
- `tests/fixtures/lab-room2-before.json`
- `tests/lib/lab-finding-coverage.mjs` (new)
- `tests/r6-guards-audit.mjs` (new)

Requested documentation, evidence and pending notes:

- `docs/CLAIMS.md`
- `js/changelog.js` (six pending notes only)
- `docs/PLAYTEST-LAB.md`
- `docs/playtest-lab/run.mjs`
- `docs/playtest-lab/evidence.json`

New advisory/proof artifacts: this `docs/r6-guards/REPORT.md`, `run-pure.mjs`, and the exact output files enumerated in [files-changed.txt](files-changed.txt). That manifest lists every changed and new file in this checkout, including itself. This report is advisory; independent review is still required.
