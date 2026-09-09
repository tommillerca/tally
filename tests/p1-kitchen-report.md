Advisory implementation report, lane p1-kitchen, 2026-09-08.

The frozen plan SHA256 was verified as `a4171533896dc5af66080056b706c89044284873d17f9bcdfe04e4c5a67dfe55`. All source paths were resolved within this checkout. This report is advisory for independent review, not a release certification.

**Files changed**

| File | Change |
| --- | --- |
| `js/cooking.js` | Atomic cauldron purchase, Cook, Line up, queue advancement, Serve and Eat using the existing `payAtomic` snapshot API. Pantry activation rejects overlapping index actions and preserves an unsupported entry. Delivery includes potion inventory revisions. |
| `js/app.js` | Only the cauldron confirmation callback: call the atomic purchase, reject stale offers, show the committed ownership count. |
| `tests/kitchen-delivery-audit.mjs` | Real cooking/db functions over the existing transaction-serializing mem-idb implementation; injected write aborts, retries and concurrency controls. Extracts and executes the actual purchase callback. |
| `tests/release-gate.mjs` | Registers the audit in PURE. |
| `tests/unit.test.js` | Runs the audit in a child process and requires its successful summary and control output. |
| `tests/p1-kitchen-report.md` | This advisory report and proof receipts. |

An ignored local `node_modules/esprima/` was restored from the npm cache to run an existing audit. Its version and SHA512 match `package-lock.json`; no manifest or lockfile changed, no install scripts or network were used.

**Findings and limits**

F20, F07, F09, F10, F08 and F06 have exercised fixes. Every spend and its delivery now share one IndexedDB transaction, including currency/potion revisions. A failed write rejects and leaves the input available for retry. The tests verify both preserved input and a successful retry, not merely that an exception was raised.

F10 is proven for overlapping module calls, including two separately imported cooking modules sharing storage. The action snapshots the pantry before committing and refuses if it changed, so a concurrent append/removal can require another Eat tap. This is a conservative refusal, with no dish consumed or success returned. Physical tap timing and toast visibility on a device remain unrun.

F11 is only partially fixed: the exercised unsupported pantry entry survives Eat unchanged and grants no buff. F11 as a whole remains UNRESOLVED. The real pot and pantry renderers at `js/app.js` around 8530 and 8571 lie outside the owned cauldron callback. No edits crossed that boundary. A Node extraction of those actual render fragments on the final source still reported:

```text
{"potText":"🍲  Empty pot pick a recipe below","cancelOffered":false,"start":{"ok":false,"reason":"busy"}}
{"pantryText":"🍲 \n              Retired dish  Ready to eat  \n             Eat","eatOffered":true}
```

Proposed scope deviation for a follow-up, not implemented: authorize those rendering sections and their action wiring to disclose unsupported saved recipes, disable unsupported Eat, and provide an explicit recovery path that retains the opaque saved data. The new queue transaction also retains unknown paid entries instead of discarding them. Thus queueing is no longer an implicit way to erase an unknown finished pot. This preservation does not complete the missing UI recovery behavior. Unknown-recipe cancellation and rendered/browser recovery are not certified.

The `payAtomic` snapshot facility already existed in `js/db.js`; that file was not edited. Test files and this report are the supporting edits explicitly required by the proof/report standard. No gameplay costs, timers, buff strength or capacity were redesigned. The cauldron helper now performs the purchase and returns an operation result; its sole production caller was updated in the owned callback.

**Exact red proof**

Before editing production source, `node tests/kitchen-delivery-audit.mjs` exited 1. These are the exact stdout lines of the final pre-fix run. All finding checks below remained unchanged for the green run; three additional control checks were subsequently added.

```text
FAIL F20 confirmed third-cauldron purchase abort: coins=0, pots=2, coinsRev=3007, successToasts=0
FAIL F07 Serve Feast pantry abort: pot=empty, pantry=0
FAIL F09 Eat Feast buff abort: pantry=0, buffs=0
FAIL F10 overlapping Eat index zero: returns=marrow-stew,necro-feast, pantry=empty, buffs=necro-feast
FAIL F08 advance queue cooking abort: queue=0, originalPot=true, pantry=0
FAIL F08 advance queue pantry abort: queue=0, originalPot=false, pantry=0
FAIL F06 Cook job abort: marrow=0, salt=0
FAIL F06 Line up job abort: marrow=0, salt=0
PASS CONTROL concurrent Serve and queue drain conserve both cooks
FAIL CONTROL potion Serve preserves inventory and revision on abort: Expected values to be strictly equal:
+ actual - expected

+ undefined
- 'vital-tonic'

FAIL F11 partial unsupported pantry entry is retained: pantry=0, buffs=0
PASS CONTROL missing ingredients and unknown recipes refuse without spending
KITCHEN DELIVERY: 2 passed, 10 failed
```

**Exact green proof**

`node tests/kitchen-delivery-audit.mjs` exited 0 on the final implementation:

```text
PASS F20 confirmed third-cauldron purchase abort: coins=3000, pots=2, coinsRev=7 on abort; retry delivers pot 3 once
PASS F07 Serve Feast pantry abort: Feast remains in pot on abort; retry banks exactly one Feast
PASS F09 Eat Feast buff abort: pantry=1, buffs=0 on abort; retry activates Feast for 4 fights
PASS F10 overlapping Eat index zero: returns=marrow-stew,null, pantry=necro-feast, buffs=marrow-stew
PASS F08 advance queue cooking abort: queue=1, originalPot=true, pantry=0 on abort; retry banks and starts successor
PASS F08 advance queue pantry abort: queue=1, originalPot=true, pantry=0 on abort; retry banks and starts successor
PASS F06 Cook job abort: marrow=2, salt=1 on abort; retry pays for exactly one job
PASS F06 Line up job abort: marrow=2, salt=1 on abort; retry pays for exactly one job
PASS CONTROL concurrent Serve and queue drain conserve both cooks
PASS CONTROL potion Serve preserves inventory and revision on abort
PASS CONTROL stale and overlapping purchase confirmations never change the price
PASS CONTROL concurrent Cook and Line up spend only available ingredients
PASS CONTROL separate module Eats target one dish and sequential Eats retain both buffs
PASS F11 partial unsupported pantry entry is retained: pantry=1, buffs=0; unsupported UI disclosure remains out of scope
PASS CONTROL missing ingredients and unknown recipes refuse without spending
KITCHEN DELIVERY: 15 passed, 0 failed
```

The required `node tests/unit.test.js` exited 0, including the final 15-check kitchen audit:

```text
374 passed, 0 failed
```

`git diff --check` exited 0. The proof uses Node and the repository's in-memory IndexedDB implementation, not real browser IndexedDB, process termination, device rendering or physical tapping. Browser/server proofs were not attempted because the frozen plan prohibits binding sockets.

**PURE receipts**

Every current PURE entry was extracted from the actual declarations in `tests/release-gate.mjs`, including pushes/unshifts, and executed directly as `node tests/<entry>`. The release-gate entry point itself was not run because it starts a server. The initial sweep ended `PURE: 108/109 exited 0`. Its sole nonzero entry was:

```text
store-copy-lint.mjs: exit 97
UNPRV esprima  DID NOT RUN: missing dependency esprima. Install from this checkout root: npm ci --include=dev
```

After restoring the verified cached dependency, that same check exited 0 with:

```text
ok store copy: beta surfaces unreachable and store strings clean
```

All 109 entries therefore have an exit-0 receipt. This is an initial sweep plus a targeted successful retry, not a claim that the first sweep passed. Per-entry final exits follow; the unit and kitchen audit were also run directly after the additional controls were added.

| PURE entry | Final exit |
| --- | --- |
| `version-align-lint.mjs` | 0 |
| `no-debug-markers-lint.mjs` | 0 |
| `store-copy-lint.mjs` | 0 (retry after cached dependency restore) |
| `lab-room2-audit.mjs` | 0 |
| `stable-stale-disclosure-audit.mjs` | 0 |
| `breed-last-colour-audit.mjs` | 0 |
| `stable-loss-disclosure-audit.mjs` | 0 |
| `lab-health-recovery-audit.mjs` | 0 |
| `lab-integration-audit.mjs` | 0 |
| `lab-ui-audit.mjs` | 0 |
| `laboratory-audit.mjs` | 0 |
| `lab-foundation-audit.mjs` | 0 |
| `pet-stress-guard.mjs` | 0 |
| `crew-pet-node-guard.mjs` | 0 |
| `transmog-receipt-audit.mjs` | 0 |
| `today-reads-lint.mjs` | 0 |
| `kitchen-atomic-audit.mjs` | 0 |
| `backup-encoder-audit.mjs` | 0 |
| `backup-key-audit.mjs` | 0 |
| `backup-version-audit.mjs` | 0 |
| `backup-conflict-audit.mjs` | 0 |
| `unit.test.js` | 0 |
| `log-xp-farm-audit.mjs` | 0 |
| `drip-badge-audit.mjs` | 0 |
| `xp-key-provenance-lint.mjs` | 0 |
| `facegate-audit.mjs` | 0 |
| `garden-appetite-guard.mjs` | 0 |
| `pit.test.js` | 0 |
| `quest-daymore-audit.mjs` | 0 |
| `quest-pick-audit.mjs` | 0 |
| `first-fight-audit.mjs` | 0 |
| `stat-source-audit.mjs` | 0 |
| `bastions-rep-sim.mjs` | 0 |
| `analytics-tag-audit.mjs` | 0 |
| `icon-inventory-audit.mjs` | 0 |
| `version-stamp-audit.mjs` | 0 |
| `boneyard-supply-audit.mjs` | 0 |
| `loot-fallback-audit.mjs` | 0 |
| `guard-hygiene-lint.mjs` | 0 |
| `guard-provenance-lint.mjs` | 0 |
| `feedback-status-lint.mjs` | 0 |
| `rack-theme-lint.mjs` | 0 |
| `rack-rotate-audit.mjs` | 0 |
| `pet-accessory-lint.mjs` | 0 |
| `pet-pool-audit.mjs` | 0 |
| `manifest-exports-audit.mjs` | 0 |
| `xp-curve-audit.mjs` | 0 |
| `live-api-register-lint.mjs` | 0 |
| `claim-evidence-lint.mjs` | 0 |
| `thumb-freshness-lint.mjs` | 0 |
| `render-sink-lint.mjs` | 0 |
| `lapse-witness-audit.mjs` | 0 |
| `spawn-claim-atomic-audit.mjs` | 0 |
| `wardrobe-family-audit.mjs` | 0 |
| `football-kit-audit.mjs` | 0 |
| `restore-latch-audit.mjs` | 0 |
| `first-pet-audit.mjs` | 0 |
| `recovery-status-audit.mjs` | 0 |
| `currency-revision-lint.mjs` | 0 |
| `inv-tombstone-audit.mjs` | 0 |
| `take-and-pay-audit.mjs` | 0 |
| `pet-morph-animation-audit.mjs` | 0 |
| `pet-palette-audit.mjs` | 0 |
| `fontscale-audit.mjs` | 0 |
| `wheel-easing-audit.mjs` | 0 |
| `storage-boot-audit.mjs` | 0 |
| `crate-cadence-audit.mjs` | 0 |
| `silence-disclosure-audit.mjs` | 0 |
| `health-disclosure-audit.mjs` | 0 |
| `paddock-pack-audit.mjs` | 0 |
| `numbers-honesty-audit.mjs` | 0 |
| `locale-numbers-audit.mjs` | 0 |
| `audit-output-audit.mjs` | 0 |
| `branch-graveyard-audit.mjs` | 0 |
| `store-runtime-audit.mjs` | 0 |
| `r47-rest-audit.mjs` | 0 |
| `r47-economy-audit.mjs` | 0 |
| `submission-build-audit.mjs` | 0 |
| `harness-environment-audit.mjs` | 0 |
| `guard-debts-audit.mjs` | 0 |
| `submission-preflight-audit.mjs` | 0 |
| `pet-state-audit.mjs` | 0 |
| `pet-family-audit.mjs` | 0 |
| `crew-pet-audit.mjs` | 0 |
| `coins-merge-tie-audit.mjs` | 0 |
| `routine-race-audit.mjs` | 0 |
| `dayone-topup-audit.mjs` | 0 |
| `dish-worth-audit.mjs` | 0 |
| `pet-C-node-guard.mjs` | 0 |
| `r48-state-audit.mjs` | 0 |
| `r46-logging-audit.mjs` | 0 |
| `r46-diary-audit.mjs` | 0 |
| `zero-calorie-seam-audit.mjs` | 0 |
| `audit-completion-audit.mjs` | 0 |
| `machine-character-audit.mjs` | 0 |
| `n3-deadpaths-audit.mjs` | 0 |
| `m5-prove-red.mjs` | 0 |
| `lookup-guard-lint.mjs` | 0 |
| `restore-state-audit.mjs` | 0 |
| `restore-debt-edges-audit.mjs` | 0 |
| `restore-debt-audit.mjs` | 0 |
| `p1-r48-rest-audit.mjs` | 0 |
| `pet-a11y-audit.mjs` | 0 |
| `kennel-copy-audit.mjs` | 0 |
| `breed-lock-audit.mjs` | 0 |
| `device-loss-audit.mjs` | 0 |
| `multidevice-earnings-audit.mjs` | 0 |
| `response-bodies-audit.mjs` | 0 |
| `kitchen-delivery-audit.mjs` | 0 |

Raw execution logs for this session are in `/private/tmp/p1-kitchen-pure/`, `/private/tmp/p1-kitchen-pure-summary.txt`, `/private/tmp/p1-kitchen-unit.txt`, `/private/tmp/p1-kitchen-red.txt` and `/private/tmp/p1-kitchen-green.txt`. The finding outputs and per-entry statuses are retained above so independent review does not depend on those temporary files.

**Denied/blocked actions and deviations**

- The sandbox denied a read-only `ps -axo pid,ppid,etime,command` process inspection with `zsh:1: operation not permitted: ps`. This did not block proofs; tool session completion and output files provided status. No approval escalation was attempted.
- The missing `esprima` dependency initially blocked one existing PURE audit, then was resolved offline as recorded above.
- F11's required UI changes are blocked by the lane boundary. The proposed follow-up scope expansion is recorded above. No other lane source file was edited.
- No browser/server proof, socket binding, Worker deployment, remote Wrangler command, production D1 write, secret change, commit, push, publication or PR was performed. `native/ASC-SUBMISSION.md` was untouched.
- No claim is made that already-lost historical coins, ingredients or dishes were reconstructed, or that unexercised UI behavior is fixed.
