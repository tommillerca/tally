Advisory implementation report. Independent review is still required.

The supplied plan SHA256 matched `49f58fbd21dec1573f25a6b7fdd7bd07637ef4054bb80829f8eff00adbeddc92`. All source paths were resolved within this checkout. No original checkout was edited. No commit, push or publish occurred.

Fourteen findings received fixes or copy clarifications. Findings 6 and 15 remain blocked by the frozen scope boundary.

| Finding | Reproduction and disposition |
| --- | --- |
| 5 | Reproduced both invested Breed and 100-step cases before edits. Breed's visible review now enumerates every stored investment, including the actual talent name. Any banked training, nickname, bond, lineage or talent triggers the warning. Existing shiny, bloodline and permanence warnings remain. The Breed commit handler is unchanged. |
| 6 | Reproduced the undisclosed equipped-pet replacement. Blocked: correcting the Destroy review would edit the destruction path explicitly reserved for the other lane. Proposed deviation: transfer this finding to that lane. No replacement behavior or disclosure was changed here. |
| 7 | Reproduced the legacy shiny Frost contradiction. Shared collection ownership and pure branch counts now treat shiny keepers as Base, matching the Laboratory adapter. Real-save prevalence remains unproven; the contradictory counts in the supplied fixture were real. No odds changed. |
| 8 | Reproduced shiny and CX rows showing invented zeros. Excluded rows now read their stored steps, nickname, lineage, bond and talents independently of input eligibility. Malformed metadata is labelled unknown instead of silently becoming zero. Eligibility stays restrictive. |
| 9 | Reproduced unknown morphs impersonating Base in Stable. Their identity now says Unsupported colour and includes the saved value. Laboratory explains the exclusion and retaining the pet and backup for recovery. The unsupported row is not rewritten or made eligible. |
| 10 | Reproduced 36 owned cells with no safe pair. The no-safe-pair explanation now precedes completion suggestions and explicitly names risky review or hatching more copies. |
| 11 | Reproduced one spare alongside an enabled, valid risky quote. Copy distinguishes preservation from eligibility and offers risky review. No spare arithmetic or recipe eligibility changed. |
| 12 | Reproduced selectable Midnight followed by no matching second input. Midnight now has a disabled picker button and an explanation that it completes the path and no recipe consumes it. |
| 13 | Reproduced loss of the incubator entry after the first experiment. Incubators remain reachable from a ready room without requiring another pair. Onboarding and purchase prerequisites still apply. |
| 14 | Reproduced an exhausted allowance with enabled picker slots and a choose-first hint. Slots now disable when work is unavailable, and the hint gives the state explanation, including the reset time for the capped case. |
| 15 | Reproduced the shiny-keeper versus last-colour warning inconsistency. Blocked by the same reserved Destroy path as finding 6. Proposed deviation: transfer the appearance-versus-collection disclosure to that lane. The warning is unchanged. |
| 16 | Reproduced a level-7, renamed result beside a level-1 receipt. Rejected the interpretation that progress was reset: those are correct historical birth facts and live investment survives. Clarified the copy with “At creation” and an explicit distinction from later training and naming. No receipt data or pet state changed. |
| 17 | Reproduced stored help preference versus stale room snapshot. The actual toggle callback now updates the current snapshot immediately as well as persisting the preference. The next species repaint keeps help closed. |
| 18 | The original probe reproduced fresh-service rollover versus stale rendered state. An added callback probe also reproduces the missing foreground clock refresh in the original UI source. A scoped clock check now refreshes on local day or timezone change and is cleared on close. Device scheduling remains unverified. |
| 19 | Added callback reproduction confirms the original carousel repaint keeps the previous ingredient note. A shared note repaint now runs for initial render and carousel focus changes, preserving warnings for selected Breed inputs. Forward and reverse swipes are exercised through the production callback. |
| 20 | Added callback reproduction confirms a successful purchase retained old capacity and purchase markup. Success now reads a fresh snapshot, renders current capacity and uses, and binds the next purchase button with that snapshot's token. Purchase prices and service behavior are unchanged. |

Before application edits, `node docs/playtest-lab/run.mjs` completed 31 baseline evidence groups and 378 recipe checks. Its lifecycle suspicions were not full UI reproductions. After the edits, the probe was extended for 17 to 20 and replayed the actual callbacks against the retained pre-edit UI source, then against the changed UI. This is a sequencing limitation relative to the request for reproduction before each fix; the original failing callback behavior is demonstrated by frozen-source replay. These additional checks reproduce source behavior in Node, not browser gestures or native event timing. The original exploratory evidence file is unchanged.

The baseline app source SHA256 was `8a15c62a467e1e86c4411d9f242bf5e18a1cbd79c286a267ef32317faea08c0b`. Its captured initial evidence SHA256 was `ddc6cd9fb17120ddbf51c84a4c592bdae517216dd765ab5eefc53f07f7d1ba94`. The small checked-in guard fixture preserves relevant pre-fix observations, including the additional original-source callback measurements. Each of the 14 grades rejects its pre-fix observation and passes the corresponding current production scenario. The callback controls for 18 and 19 execute subscription and repaint code with DOM endpoints doubled. They do not boot the full app.

Proof:

```text
$ node tests/unit.test.js
371 passed, 0 failed
exit code: 0

$ LAB_EVIDENCE_OUT=docs/fix-lab-room2/evidence.json node docs/playtest-lab/run.mjs
Completed 35 evidence groups; 378 recipe checks. No app mutations.
exit code: 0

$ node tests/lab-room2-audit.mjs
14/14 room 2 guards passed
exit code: 0

$ node docs/fix-lab-room2/run-pure.mjs
102/102 PURE files exit 0
exit code: 0
```

The PURE driver reads all registered PURE entries and their push/unshift additions from the release gate, respects its serial list, and runs every entry. It does not start the browser tier. Full per-suite streams are retained in the temporary directory named on the first line of [pure-output.txt](pure-output.txt). [pure-results.json](pure-results.json) records each exit code. [guards.txt](guards.txt), [unit-output.txt](unit-output.txt), [reproduction.txt](reproduction.txt) and [evidence.json](evidence.json) retain the targeted proof.

The first full PURE pass was 97/102. Four suites lacked installed dependencies, including esprima. `npm ci --offline --ignore-scripts` restored the locked dependencies from the existing local cache without changing either package manifest or lockfile. The fifth failure identified missing audit-output destination checks in the new guard; those were added. The full rerun passed. Two existing UI expectations and one colour-name expectation were updated because they enforced behavior this work order reverses. Their positive controls remain.

Changed tracked source and test files:

- `js/app.js`: Breed investment copy, picker and room explanations, help state, foreground clock refresh, ingredient notes, and purchase sheet refresh.
- `js/loot.js`: excluded-pet display metadata and unknown-colour names.
- `js/pets.js`: shiny collection identity.
- `js/laboratory.js`: matching pure branch survivor counts.
- `docs/playtest-lab/run.mjs`: additional callback evidence, optional source/output paths, and removal of assertions that demanded reproduced bugs persist.
- `tests/kennel-copy-audit.mjs`: unsupported-colour expectation.
- `tests/lab-ui-audit.mjs`: updated no-pair and incubator copy expectations.
- `tests/release-gate.mjs`: registers the new guard in PURE.

New files:

- `tests/lab-room2-audit.mjs`: 14 finding-specific production guards with pre-fix controls.
- `tests/fixtures/lab-room2-before.json`: frozen pre-fix observations.
- `docs/fix-lab-room2/REPORT.md`: this report.
- `docs/fix-lab-room2/run-pure.mjs`: reproducible complete PURE driver.
- `docs/fix-lab-room2/evidence.json`, `reproduction.txt`, `guards.txt`, `unit-output.txt`, `pure-output.txt`, `pure-results.json`: proof artifacts.

Denied or blocked actions and deviations:

No sandbox denial, automatic approval rejection or permission request occurred. Findings 6 and 15 are scope-blocked, not rejected as correct behavior. Completing them here would violate the express ban on modifying the other lane's destruction paths; the proposed deviation is reassignment. The Stable Destroy handler, Breed commit handler and Laboratory recovery function were checked byte-for-byte against baseline and remain unchanged. Findings 1 to 4 were not fixed in this lane.

No finding was silently replaced with an economy or odds redesign. Finding 16 received only historical-copy clarification, with its reset interpretation explicitly rejected. Findings 7 and 18 to 20 retain the reachability and device limits described above. Native details timing, screen reader behavior, pixels, actual foreground scheduling, process termination and live health-sync races are not claimed as tested. No browser, server, device, external communication or deployment was used. Installed ignored `node_modules` are local verification dependencies, not deliverable source changes.
