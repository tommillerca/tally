# R6 merge lane advisory report

Status: E2 backend implemented and verified. Full frozen-work-order acceptance is blocked on its explicit file ownership boundary. This report is advisory for independent review.

## Authority and scope

The plan at `../specs/r6-merge.md` matches SHA256 `cf001ffd84922cf462dfce72360ee9ba013f5cbf20ecb60c595c9f34e33daa60`.
All source paths resolved within this checkout. No original checkout was edited. No commit, push, publication, production request or version stamp change was performed.

The plan assigns this lane `js/db.js` and `js/social.js`, explicitly assigns `js/app.js`, `js/loot.js` and `tests/` elsewhere, and also requires changelog/claims updates. The scope-extension question has no answer at report time. App, loot, Laboratory rules and tests remain untouched. Proof scripts and output live under `docs/r6-merge/` to respect test-lane ownership.

## Purchase policy and implementation

Each distinct paid receipt is retained unchanged in `labIncubatorPurchases`, indexed by operation ID. The lexically smallest operation ID owns its original numbered slot. Other purchases for that same slot receive their full price back, using the permanent currency receipt `lab-incubator-refund:<opId>:coins`. The debit records remain intact. The existing incubator capacity and prices are unchanged.

This is an explicit departure from keeping two active copies of a numbered incubator. The shipped rules permit only slots 2 and 3. Adding permanent capacity would change the gameplay rules and another lane's files. A full refund preserves all the earned coin value of the duplicate purchase and permits spending it again. The archive preserves both original receipts for review and future recovery.

Reconciliation occurs under the import transaction's write lock, before the currency union. This ordering matters when each offline device could afford the purchase but their combined debits exceed the shared wallet. Deterministic refund receipts prevent repeated credits across replay, stale imports and further device merges.

The disputed purchase is excluded only from the active slot projection. Its debit, original receipt and compensation survive. Unrelated incoming rows continue through the ordinary importer. Additive merges preserve local-only rows. `replace:true` retains the existing replacement semantics for unrelated declared stores, so it does not promise to keep local-only rows that the user deliberately replaces. Missing experiments, incompatible currency histories and corrupted immutable receipts still cause refusal; this change does not bypass those integrity checks.

`importAll` returns structured `notices`, including slot, conflicting purchase operation ID, retained operation ID, refund amount and player-facing explanation. It also persists the notice as `labIncubatorRecovery` in the same transaction. `pullBackup` exposes the notices directly as well as through its counts. The 409 push path retains the durable notice while continuing to a successful encrypted upload.

## Proof

- `node docs/r6-merge/guard.mjs --before` against unmodified HEAD sources in a temporary fixture exits 1. Both directions and both replace modes print `unrelatedSurvived=false` with `laboratory-restore-conflict`. Cloud push prints `false` after an actual simulated CAS conflict. All five defect outcomes are positively asserted. See `before.txt` and source hashes in `baseline.json`.
- `node docs/r6-merge/guard.mjs` exits 0. Every incoming non-KV store row and the independent KV row survive all four import arms. Both paid receipts remain byte-equivalent to their originals, the duplicate receives exactly 20,000 coins, and the notice identifies precisely that purchase. Both original device databases subsequently pull and push without erase. See `after.txt`.
- `node docs/r6-merge/guard.mjs --low-wallet` exits 0 with an opening wallet of 25,000 coins. Two offline purchases cannot wedge the merge merely because their pre-refund union is negative. See `low-wallet.txt`.
- Both guard variants test replay, stale input, spending the refund, a third buyer with a newly selected canonical receipt, a separately earned slot 3 in both directions, injected transaction failure in both replace modes, immutable-receipt conflict refusal and malformed archived purchase validation.
- The existing `tests/lab-conflict-audit.mjs` covers R6-E1 independently. It exits 0 with `0 failed`. This lane does not change experiment reconciliation, consumed-input rules, result retention, or capacity. See `r6-e1-output.txt`.
- The agreed command is run directly as `node tests/unit.test.js`. It exits 0 with `384 passed, 0 failed`. Exact output is retained in `unit-output.txt`.
- `node docs/r6-merge/run-pure.mjs` evaluates the PURE declaration and every subsequent push/unshift from `tests/release-gate.mjs` itself. It refuses a census below 151 or with duplicates. This checkout declares 155 entries. Final observed result: `155/155 PURE audits exit 0`, including all 58 final-source refresh entries. `pure-list.json`, `pure-results.json`, `pure-output.txt` and `pure/*.txt` retain the enumeration, exits and per-audit output. Final-source coverage combines the complete enumeration with a conservative rerun of every audit that ran before or across the last source edit. The rerun list and output are in `pure-refresh-list.json` and `pure-refresh.txt`; final runtime source hashes are in `final-source-sha256.json`. No browser or production service is involved in the new guard.

## Blocked requirements and proposed follow-up

1. Visible E2 disclosure is blocked by ownership of `js/app.js`. Returning and storing a message is not proof that the player sees it. Proposed app-lane integration: append `counts.notices` to file-import results, and render or acknowledge the persistent `labIncubatorRecovery` notice after cloud synchronization, including the 409 retry path. Treat message strings as text or escape them. Do not turn a successful compensated merge into a backup failure.
2. R6-E3 is blocked by `fileImportFailure` in `js/app.js`. It still contains the impossible advice to choose a newer backup. Proposed app-lane change: reuse the existing honest Settings conflict explanation rather than introduce a third copy variant. No E3 fix is claimed.
3. R6-E4 is blocked by `labPending` in `js/loot.js` and the room's result/status handling in `js/app.js`. A different operation's known pending intent currently calls `labRefuse('unknown')`. Proposed joint change: return a distinct concurrent-action refusal, say another action is already in progress, and reserve unknown for an actually unverifiable outcome. The app must not put a known losing tap into its uncertainty latch. No E4 fix is claimed.
4. The new regression guard is deliberately not registered or installed under `tests/`. The tests lane should integrate it and add browser/handler proof of the visible notice after the UI wiring exists. A `vNEXT` claim with one matching PROOF row records only the implemented backend behavior.

No automatic approval review or filesystem operation denied an action. The blockers above come from the frozen plan's explicit lane ownership, not a tool rejection. The overall work order must not be reported green solely because its implemented backend checks and existing PURE suites pass.

## Files changed

- `js/db.js`: validated immutable purchase archive, deterministic full-price refunds, atomic merge normalization, structured and persisted recovery notice.
- `js/social.js`: expose import recovery notices on successful cloud pull.
- `js/changelog.js`: one pending item, no version increment.
- `docs/CLAIMS.md`: one matching `vNEXT` PROOF row, with incomplete acceptance disclosed.
- `docs/r6-merge/guard.mjs`, `run-pure.mjs`, this report, and retained evidence files listed above.
