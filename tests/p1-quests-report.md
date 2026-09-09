Advisory implementation report for lane p1-quests. Independent review is still required.

The frozen plan SHA256 matched `c9d16d04bf26ea2528faee1f2b64eb38fd1350bf15c907871950162327574eef`. All source paths were resolved in this checkout. F04, F05 and F21 are fixed and exercised. F19 remains unfixed at the application ownership boundary.

Files changed:

- `js/quests.js`: replaces separate reservation rows with a period-qualified budget in the existing atomic reward transaction. Paid legacy ledger rows seed the budget; orphan reservation rows do not consume it. A failed reward rolls back its claim and budget together. Concurrent claims still respect the cap, and cap refusals do not trigger save-failure notifications.
- `js/wheel.js`: commits the daily receipt, spent date and complete prize together. Retry uses the same prepared payout. A save failure keeps the button available and discloses the retry instead of showing a win. Coin totals come from the payout description.
- `js/app.js`: only the owned quest-cap toast changed, describing rewards paid for the period.
- `tests/quest-wheel-budget-audit.mjs`: real quest modules and shipped wheel commit/click code over transactional mem-idb. Includes all seven wheel prizes, rollback, retries, concurrent distinct and duplicate claims, legacy reservations, closed-period controls, and optional F19 observation.
- `tests/release-gate.mjs`: registers the new audit in PURE.
- `tests/unit.test.js`: runs the audit and updates the existing wheel source check to require a payout inside the atomic claim.
- `tests/p1-quests-report.md`: this advisory report.

`js/energy.js` is unchanged. No other application source was edited. An ignored `node_modules/esprima` dependency was materialized from the existing local cache at `/private/tmp/store-red-proof/installed-node_modules/esprima`, matching the pinned version 4.0.1. No dependency manifest or lockfile changed.

Before any application edits, the runnable check `node tests/quest-wheel-budget-audit.mjs --observe-energy` exited 1 with this exact output:

```text
FAIL F04 Monday dailies leave weekly claims available Monday and Tuesday: weekly rewards paid=0; Monday capped=true; Tuesday capped=true
FAIL F05 day three aborted payouts preserve the reward budget: retry paid=false; capped=true; orphan slots=3; aborted coin writes=3
FAIL F05 week three aborted payouts preserve the reward budget: retry paid=false; capped=true; orphan slots=3; aborted coin writes=3
FAIL F05 month three aborted payouts preserve the reward budget: retry paid=false; capped=true; orphan slots=2; aborted coin writes=2
FAIL F21 aborted 150-coin spin can retry and pays exactly once: retry balance=0; already=true; spent date=2026-09-07
UNFIXED F19 delayed refund: free=2->3; vigor=0->0; caller receipt required
0 passed, 5 failed
```

The same five finding checks were retained. Additional controls were added afterward. Final `node tests/quest-wheel-budget-audit.mjs --observe-energy` exited 0:

```text
PASS F04 Monday dailies leave weekly claims available Monday and Tuesday
PASS F05 day three aborted payouts preserve the reward budget
PASS F05 week three aborted payouts preserve the reward budget
PASS F05 month three aborted payouts preserve the reward budget
PASS F21 aborted 150-coin spin can retry and pays exactly once
PASS CONTROL day concurrent distinct claims stop at the cap
PASS CONTROL week concurrent distinct claims stop at the cap
PASS CONTROL month concurrent distinct claims stop at the cap
PASS CONTROL legacy paid claims count; orphan reservations do not
PASS CONTROL concurrent duplicate quest spends one budget unit
PASS CONTROL a capped quest is a refusal, not a save failure
PASS CONTROL closed quest periods still refuse
PASS CONTROL wheel c30 abort, reopen and concurrent retry pay once
PASS CONTROL wheel c75 abort, reopen and concurrent retry pay once
PASS CONTROL wheel c150 abort, reopen and concurrent retry pay once
PASS CONTROL wheel daily abort, reopen and concurrent retry pay once
PASS CONTROL wheel golden abort, reopen and concurrent retry pay once
PASS CONTROL wheel charm abort, reopen and concurrent retry pay once
PASS CONTROL wheel ingr abort, reopen and concurrent retry pay once
PASS CONTROL wheel spent-date write failure rolls back the prize
PASS CONTROL wheel save failure discloses retry without a win reveal
UNFIXED F19 delayed refund: free=2->3; vigor=0->0; caller receipt required
21 passed, 0 failed
```

The quest probes exercise reservation and payout with actual pool entries, including the seeded daily board on Monday September 7. They assume completion has already been established by the caller, exactly as the frozen reproduction does. Fault injection aborts real database transactions at the targeted writes. F05 was also exercised for weekly and monthly claims. The monthly old code exhausted its two slots after only two aborted writes, so the third attempt never reached the coin write.

The wheel probes select shipped wedges through the existing deterministic test pin and execute the actual commit closure with real imported payout/database functions. The click control executes the shipped listener registration and callback through a Node button adapter. These checks do not certify browser rendering, physical taps or native IndexedDB behavior.

F19 boundary and proposed deviation:

The Spire caller at `js/app.js:7454` passes `charge: spent.used`, and settlement at `js/app.js:26690` calls `refundPitFight(foeCfg.charge)`. Those application regions are outside this lane, which owns only the quest toast in that file. The string `free` identifies neither the date nor the particular spend. Once two days have free spends, an energy-only implementation cannot reliably identify which spend the caller is refunding. Guessing FIFO order or always crediting Vigor would silently redesign the requirement.

Proposed follow-up: have spending return a durable, dated charge receipt; carry that receipt through the Spire fight configuration; refund it atomically and at most once. Same-period refunds should restore the original free charge, and cross-period refunds should credit Vigor without changing the new day's free meter. The follow-up also needs an explicit policy for legacy string-only calls and a full Vigor bank so a refund cannot be discarded. No cross-lane caller edit or speculative refund behavior was implemented here. The optional observation prints the still-broken result and does not count it as a passing fix.

Proof:

- `node tests/unit.test.js`: exit 0, `374 passed, 0 failed`.
- `node tests/quest-wheel-budget-audit.mjs`: exit 0, `21 passed, 0 failed`.
- Every one of the 109 entries currently in PURE exited 0. Entries were extracted from the actual PURE declaration and run as Node subprocesses, without starting the release-gate server or browser tiers. The unit entry uses the agreed command's separate run.
- `git diff --check`: exit 0.

Initial proof issues were resolved: four PURE entries exited 97 because `esprima` was unavailable (`store-copy-lint`, `store-runtime-audit`, `submission-build-audit`, `submission-preflight-audit`). They all exited 0 after the pinned local dependency was supplied. `guard-hygiene-lint` initially rejected the new audit's use of a wheel pin without a click-binding control. The audit now exercises the shipped click registration; the lint was not weakened or edited and exits 0.

Denied or blocked actions and limitations:

- No permission-denied action occurred. F19's fix is blocked by the frozen ownership boundary, not a tool denial.
- No commit, push, PR, publication, Worker deployment, production D1 write, secret change, live account write, or original-checkout edit was attempted. `native/ASC-SUBMISSION.md` was not edited. Existing PURE submission checks used fixture tooling, not a real build or upload.
- Socket binding, browser/server proofs, native storage failure UI, process force-kill timing and physical double taps were intentionally unrun as required. The full release-gate command was not invoked because it starts a server; its PURE entries were run directly instead.
- Legacy quest reservation-only rows are harmless after this fix. Historical wheel receipts contain no pending prize or delivery status, so this patch cannot determine which already-spent legacy spins were unpaid and does not invent compensation or reset all claimed spins. The atomic fix prevents the reproduced payout loss for new spins.
- The deviation from implementing all four findings is the explicitly reported F19 deferral. No prize values, quest limits, closed-period policy or day-guard policy were redesigned.

Final PURE exit inventory (all exit 0):

```text
0 analytics-tag-audit.mjs
0 audit-completion-audit.mjs
0 audit-output-audit.mjs
0 backup-conflict-audit.mjs
0 backup-encoder-audit.mjs
0 backup-key-audit.mjs
0 backup-version-audit.mjs
0 bastions-rep-sim.mjs
0 boneyard-supply-audit.mjs
0 branch-graveyard-audit.mjs
0 breed-last-colour-audit.mjs
0 breed-lock-audit.mjs
0 claim-evidence-lint.mjs
0 coins-merge-tie-audit.mjs
0 crate-cadence-audit.mjs
0 crew-pet-audit.mjs
0 crew-pet-node-guard.mjs
0 currency-revision-lint.mjs
0 dayone-topup-audit.mjs
0 device-loss-audit.mjs
0 dish-worth-audit.mjs
0 drip-badge-audit.mjs
0 facegate-audit.mjs
0 feedback-status-lint.mjs
0 first-fight-audit.mjs
0 first-pet-audit.mjs
0 fontscale-audit.mjs
0 football-kit-audit.mjs
0 garden-appetite-guard.mjs
0 guard-debts-audit.mjs
0 guard-hygiene-lint.mjs
0 guard-provenance-lint.mjs
0 harness-environment-audit.mjs
0 health-disclosure-audit.mjs
0 icon-inventory-audit.mjs
0 inv-tombstone-audit.mjs
0 kennel-copy-audit.mjs
0 kitchen-atomic-audit.mjs
0 lab-foundation-audit.mjs
0 lab-health-recovery-audit.mjs
0 lab-integration-audit.mjs
0 lab-room2-audit.mjs
0 lab-ui-audit.mjs
0 laboratory-audit.mjs
0 lapse-witness-audit.mjs
0 live-api-register-lint.mjs
0 locale-numbers-audit.mjs
0 log-xp-farm-audit.mjs
0 lookup-guard-lint.mjs
0 loot-fallback-audit.mjs
0 m5-prove-red.mjs
0 machine-character-audit.mjs
0 manifest-exports-audit.mjs
0 multidevice-earnings-audit.mjs
0 n3-deadpaths-audit.mjs
0 no-debug-markers-lint.mjs
0 numbers-honesty-audit.mjs
0 p1-r48-rest-audit.mjs
0 paddock-pack-audit.mjs
0 pet-C-node-guard.mjs
0 pet-a11y-audit.mjs
0 pet-accessory-lint.mjs
0 pet-family-audit.mjs
0 pet-morph-animation-audit.mjs
0 pet-palette-audit.mjs
0 pet-pool-audit.mjs
0 pet-state-audit.mjs
0 pet-stress-guard.mjs
0 pit.test.js
0 quest-daymore-audit.mjs
0 quest-pick-audit.mjs
0 quest-wheel-budget-audit.mjs
0 r46-diary-audit.mjs
0 r46-logging-audit.mjs
0 r47-economy-audit.mjs
0 r47-rest-audit.mjs
0 r48-state-audit.mjs
0 rack-rotate-audit.mjs
0 rack-theme-lint.mjs
0 recovery-status-audit.mjs
0 render-sink-lint.mjs
0 response-bodies-audit.mjs
0 restore-debt-audit.mjs
0 restore-debt-edges-audit.mjs
0 restore-latch-audit.mjs
0 restore-state-audit.mjs
0 routine-race-audit.mjs
0 silence-disclosure-audit.mjs
0 spawn-claim-atomic-audit.mjs
0 stable-loss-disclosure-audit.mjs
0 stable-stale-disclosure-audit.mjs
0 stat-source-audit.mjs
0 storage-boot-audit.mjs
0 store-copy-lint.mjs
0 store-runtime-audit.mjs
0 submission-build-audit.mjs
0 submission-preflight-audit.mjs
0 take-and-pay-audit.mjs
0 thumb-freshness-lint.mjs
0 today-reads-lint.mjs
0 transmog-receipt-audit.mjs
0 unit.test.js
0 version-align-lint.mjs
0 version-stamp-audit.mjs
0 wardrobe-family-audit.mjs
0 wheel-easing-audit.mjs
0 xp-curve-audit.mjs
0 xp-key-provenance-lint.mjs
0 zero-calorie-seam-audit.mjs
```
