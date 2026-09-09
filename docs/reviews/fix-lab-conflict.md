# Advisory review: fix-lab-conflict

Status: recovery implemented, with an unresolved requirement. The strict prevention of the same pet being consumed on two disconnected devices is not implemented. This report does not certify full compliance with the frozen plan.

Frozen plan SHA256 verified before edits:
`21f5be00d751dc63ed9dc1540cfe225cbfc46cb08cf63f451f170480f802e024`.
All source paths were resolved in this checkout. The named original checkout was not edited.

## Choice and resulting behavior

Reconcile immutable experiment histories automatically through the existing additive merge. This retains every original receipt and earned result, lets the existing Settings Cloud backup On control recover the losing device, and allows subsequent encrypted pushes and pulls to succeed. It avoids choosing a result to delete.

Day/slot collisions have a deterministic representative, ordered by operation ID. All experiment receipts remain in the history, and every receipt counts toward its original day's usage. Remaining uses are clamped at zero, including when two offline experiments exceed a capacity of one. Incubator purchase copy accounts for that excess.

The consumption projection assigns each input instance one canonical owner. The existing durable petTaken union keeps consumed inputs absent on both devices after sync. Reconciliation does not execute an experiment or mint a replacement pet. Replays return the original receipt, and a later consumed result is not recreated by stale imports.

The Laboratory discloses recovered overlaps even when their receipts were already seen. Confirmation explains the offline limitation. Permanent merge failures no longer claim safety or successful eventual retry. Copy names the existing On control, Send feedback, and file export where available. Native file export remains unavailable in the existing app; the copy does not promise otherwise.

A stale daily replacement still refuses when it would discard a local experiment. The recovery path is the ordinary additive sync, not destructive replacement.

## Unresolved requirement and proposed deviation

Frozen item 4 requires immediate exclusion across disconnected devices. Neither device can observe the other's action while both are offline. Strict prevention requires coordinated online authorization or exclusive ownership reserved before disconnection. Neither mechanism exists in this implementation.

The proposed deviation implemented here is reconciliation after reconnect, preserving both previously earned outcomes. Duplicate offline attempts and extra results remain possible before reconnect, including deliberate repetition across devices. The same-pair fixture still commits two experiments using the same input IDs while offline. A unique consumption projection after reconnect does not prove that the original two destructive operations never happened. No user approval of this relaxation was received, so item 4 remains unresolved for independent review.

Retaining both results also retains the extra daily outcome already earned offline. Both count toward that day's usage; the implementation does not claw back results or impose future-day debt. Online authorization or pre-reserved ownership is the proposed follow-up if strict account-wide pet consumption and daily limits must hold before reconnect.

## Files changed

- `js/laboratory.js`: deterministic collision-tolerant daily projection and recovery/consumption projection; immutable receipt conflict and malformed-save refusals retained.
- `js/loot.js`: expose reconciliation in snapshots and result presentation; clamp remaining uses.
- `js/app.js`: honest backup failure guidance, offline and recovery disclosures, and accurate capacity/purchase copy.
- `tests/lab-conflict-audit.mjs`: real database and encrypted client recovery fixtures, Settings callback execution, replay, stale replacement, consumption after reconnect, atomic rollback and invalid-receipt controls.
- `tests/release-gate.mjs`: register the new audit in PURE.
- `docs/reviews/fix-lab-conflict.md`: this advisory report and captured proof.

## Proof before implementation

The initial regression test was written and run before changing production source. Both required arms failed. Each showed three refused pushes, failed pull and daily restore, backupAt 0, and the original Settings copy. Exit code: 1.

```text
same-pair: {"pushes":[false,false,false],"backupAt":0,"reason":"conflicting-experiments","pull":false,"daily":false,"copy":"The last backup did not go through. Your progress is safe on this phone and it keeps retrying. Last good backup: never."}
FAIL same-pair: losing device recovers and records a backup: Expected values to be strictly deep-equal:
FAIL same-pair: immutable receipts, results and unrelated progress survive: Expected values to be strictly deep-equal:
FAIL same-pair: both devices converge and consumed pets cannot be used again: Expected values to be strictly deep-equal:
different-pairs: {"pushes":[false,false,false],"backupAt":0,"reason":"conflicting-experiments","pull":false,"daily":false,"copy":"The last backup did not go through. Your progress is safe on this phone and it keeps retrying. Last good backup: never."}
FAIL different-pairs: losing device recovers and records a backup: Expected values to be strictly deep-equal:
FAIL different-pairs: immutable receipts, results and unrelated progress survive: Expected values to be strictly deep-equal:
FAIL different-pairs: both devices converge and consumed pets cannot be used again: Expected values to be strictly deep-equal:
FAIL permanent conflict copy gives action without a safety or retry promise: The input was expected to not match the regular expression /safe|keeps retrying/i. Input:
7 failed
```

## Final proof

Agreed command: `node tests/unit.test.js`. Exit code: 0.

```text
378 passed, 0 failed
```

`node tests/lab-conflict-audit.mjs`. Exit code: 0. The daily fixture is an older archive missing the other device's experiment, so its replacement correctly remains refused after live sync recovers.

```text
same-pair: {"pushes":[true,true,true],"backupAt":1788974330129,"pull":true,"daily":false,"copy":null}
PASS same-pair: losing device recovers and records a backup
PASS same-pair: immutable receipts, results and unrelated progress survive
PASS same-pair: both devices converge and consumed pets stay absent after reconnect
PASS same-pair: recovery is disclosed and a stale daily replacement cannot erase it
PASS same-pair: replay, stale merge and later result consumption cannot duplicate pets
PASS same-pair: abort rolls reconciliation back and invalid receipts still refuse
different-pairs: {"pushes":[true,true,true],"backupAt":1788974330467,"pull":true,"daily":false,"copy":null}
PASS different-pairs: losing device recovers and records a backup
PASS different-pairs: immutable receipts, results and unrelated progress survive
PASS different-pairs: both devices converge and consumed pets stay absent after reconnect
PASS different-pairs: recovery is disclosed and a stale daily replacement cannot erase it
PASS different-pairs: replay, stale merge and later result consumption cannot duplicate pets
PASS different-pairs: abort rolls reconciliation back and invalid receipts still refuse
PASS permanent conflict copy gives action without a safety or retry promise
LIMITATION: disconnected devices can still attempt the same pets. This audit proves reconciliation and ownership refusal after reconnect, not immediate offline exclusion.
0 failed
```

Additional checks, all exit code 0:

- `node tests/laboratory-audit.mjs`: 10/10 Laboratory guards passed.
- `node tests/lab-integration-audit.mjs`: all controls passed.
- `node tests/lab-ui-audit.mjs`: 30 passed, 0 failed.
- `node tests/backup-conflict-audit.mjs`: all green.
- `git diff --check`: no output.

These are Node tests with in-memory IndexedDB, simulated network replies and extracted production UI functions/callbacks. Browser pixels, native storage durability, the complete release gate and a live Worker were not tested. The passing conflict audit proves recovery and post-sync ownership, not strict offline exclusion.

## Denied or blocked actions

No tool action was denied. No commit, push, PR, publish, Worker deployment, remote Wrangler command, production D1 write, or secret change was attempted. `native/ASC-SUBMISSION.md` was not touched.

The outstanding blocker is the unresolved offline exclusion requirement described above. There were no filesystem or test execution blockers.
