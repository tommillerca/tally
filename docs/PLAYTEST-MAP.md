# Map playtest advisory

Frozen work order implemented in this checkout on 2026-09-08. Plan SHA256 verified:
`77c6cd55fddf27791e3b55569b07dd717a5d53c20f332e8259c1c6d8c690a1c2`.

Four findings fixed, two earned-reward findings left open. This is an advisory report for independent review. Passing the agreed checks does not resolve the explicitly documented settlement and backup-merge gaps.

## Method and scope

Used real `js/poi.js`, `js/hunt.js`, `js/loot.js`, `js/game.js` and `js/db.js` over `tests/mem-idb.mjs`. Rendered the actual den and remote-den templates extracted from `js/app.js`. Invoked the actual den Fight, remote Fight, and gear Keep callbacks with minimal DOM doubles. Injected transaction aborts at actual inventory and kv writes, then checked persisted state, retries and concurrent calls. Audits write no files in the checkout.

No sockets or browser were opened. No GPS walk, map tiles, pixel layout, hit testing, live animation or native IndexedDB durability was observed. Cosmetics and layout were not assessed. The in-memory store serializes transactions and models rollback, but this is not device proof.

## Findings, ordered by player harm

### M6. OPEN: stale cloud merges erase earned choices or restore spent choices

**Source:** `js/db.js:1444` (`importAll`), `js/db.js:1515` (incoming kv selection), `js/db.js:1683` (incoming store writes); `js/poi.js:398` (`claimDenWin`) and `js/poi.js:430` (`claimDenLoot`).

**Reproduction:** Run the M6 cases in `node docs/playtest-map-gaps.mjs`. First export a real save with `denloot=[]`, win a generated landmark den, then merge the earlier export with `importAll(stale, {replace:false})`. Inspect the pending list and try the same win again. Separately, export a pending choice, select its first piece, merge that pending-choice export, then select its second piece.

**Observed:** The first merge changes one pending entitlement to zero; the win retry returns null because its ledger row survives. The second merge resurrects the spent choice, so one den's choose-one drop delivers both pieces (`gear=2, expected=1`). Both are ordinary additive merges, not explicit replacement restores.

**Impact:** Cloud synchronization can permanently delete an earned reward or allow a spent entitlement to pay again. The local atomic selection fix in M1 does not establish a merge-safe consumption receipt.

**Certainty:** High. These cases execute real export, additive import, den claim and gear selection services, with no dependency failures simulated.

**Why unfixed:** This needs the shared backup area's `js/db.js` merge policy plus durable den-choice consumption receipts. A simple union of pending lists would prevent one loss while preserving the demonstrated replay. Proposed follow-up: merge pending entitlements by stable claim key, union durable consumed-choice receipts, and exclude consumed keys from the merged pending set. That cross-area change was not made under this map-only work order.

### M5. OPEN: shared victory settlement loses coins and charm charges after a failed save

**Source:** `js/app.js:26478` (settled latch and recovery limited to staked fights), `js/app.js:26538` (den claim), `js/app.js:26554` (mini claim), `js/app.js:26772` (common charm consumption and coin payment).

**Reproduction:** Run `node docs/playtest-map-gaps.mjs`. It generates the roaming den and mini at 49.28, -123.12 for 2026-09-08, seeds two charm charges, and executes the real boss/mini settlement branches plus their real common coin tail. Reject the `coinsAdd` dependency once after the claim and charm consumption. Read storage, then replay those same production branches with real `coinsAdd`.

**Observed:** The 70-coin roaming boss has a persisted claim and zero coins after failure; one charm charge is already gone. Replay pays only 13 coins (the 10-coin repeat payout with the second charm charge) instead of the 88 earned coins. The 45-coin mini similarly pays 10 on replay instead of 56. Both end with zero charm charges. Even this artificial replay is more generous than the actual settled latch, which refuses another settlement in that fight.

**Impact:** Earned currency and consumable value are permanently short. A later retry cannot recover the original reward because the claim now identifies it as a repeat.

**Certainty:** High for the executed branch behavior. The rejected dependency models an unavailable coin write; no process-kill or full battle rendering was claimed.

**Why unfixed:** Safely fixing this requires tracing and changing the shared fight recovery contract, including the food/charm debit, den ingredient grant, duplicate-fight handling and durable battle outcome. That spans the shared combat/economy path beyond this map pass. Moving only the coin call would leave another charge-before-delivery boundary. Proposed follow-up: an idempotent map-encounter settlement receipt that commits the claim and its full payout/debits together, with recovery from the recorded victory. This proposal was not implemented.

The runnable known-gap probe is under `docs/`, deliberately outside PURE. It exits 1 on the unresolved earned-payout invariant. It is not counted as a passing check.

### M1. FIXED: choosing earned den gear can delete the entitlement without delivering the gear

**Source:** `js/poi.js:430` (`claimDenLoot`), `js/app.js:18269` (`wireLootChoice`). Original implementation was at `js/poi.js:433` and `js/app.js:18270`.

**Reproduction:** Seed one `denloot` entry with two real gear IDs. Choose one through `claimDenLoot`, abort its inventory write, and inspect inventory and the pending list. Separately abort the collected-appearance write. Then select a real card and click the actual Keep handler, abort the save, and click Keep again. Run `node tests/map-playtest-audit.mjs`, M1 rows.

**Observed before fix:** Inventory abort left `pending=0, inventory=0`. Appearance abort also consumed the choice. The Keep handler remained busy after the rejected Promise; even restoring the entitlement could not make the next tap deliver.

**Impact:** A won gear choice disappears permanently, and the visible control can become a dead end after a save error.

**Fix:** The pending-entry removal, gear inventory row and collected appearance now share one transaction. Ownership is read inside it, preserving any existing slimed variant. The Keep handler explains a save failure and releases its busy latch for retry. Unknown choices cannot consume the entitlement.

**Certainty:** High. Original production code failed all three relevant checks. Inventory and appearance aborts now roll back; retry delivers once; competing choices produce one winner; an existing variant is preserved. The new behavior prevents future losses. Historical choices already deleted without a payout cannot be reconstructed reliably from the remaining data, so no guessed compensation was added.

### M2. FIXED within the service: roaming mini-boss crate and dust writes could be lost after recording the win

**Source:** `js/poi.js:506` (`claimMiniWin`). Original implementation was at `js/poi.js:499`.

**Reproduction:** Use a generated mini with the real tier-3 reward (40 XP, 65 base coins, one Bone Crate and 12 dust). Abort the inventory write, inspect the mini ledger key, then retry. In a second fresh database, abort the dust write, inspect inventory, and make two concurrent retry calls. Run the M2 audit rows.

**Observed before fix:** The crate abort left `spent=true, crates=0`. The dust abort left a committed crate and spent claim, so retry could not deliver the dust.

**Impact:** A defeated mini permanently loses part of its earned payout.

**Fix:** Mini XP, crate and dust now commit together through `awardOnce` and its atomic payout. Dust revision metadata travels in the same transaction. Aborts leave the encounter unclaimed and overlapping retries deliver one crate and 12 dust exactly once. Minis still do not raise the den progression ceiling.

**Certainty:** High for this transaction. Encounter coins remain owned by the shared settlement path and are still subject to M5. This fix does not claim that every reward from a mini fight is now crash-safe. Older already-spent partial payouts were not guessed or backfilled.

### M3. FIXED: interrupted historical den progression repair marks itself complete too early

**Source:** `js/poi.js:673` (`backfillDenCeilingIfNeeded`). Original early completion write was at `js/poi.js:666`.

**Reproduction:** Seed legacy landmark wins for 2026-08-04 and 2026-08-11 in cell `4928_-12312`. Abort the second `bossfirst` marker write, then call backfill again. Also seed a historical row with the old `denceil-backfill=true` flag already present. Run the M3 audit rows.

**Observed before fix:** Only one of two owed weekly markers existed after retry. An old true flag prevented any attempt to restore a missing marker.

**Impact:** Earned boss progression remains missing, keeping three Gauntlet ranks locked for each missing marker.

**Fix:** Completion is written after all idempotent markers. A new `denceil-backfill-v2` completion flag also revisits devices affected by the old early flag. Count increments depend on the actual successful marker claim, so overlapping repair attempts cannot report duplicate restored markers.

**Certainty:** High. Retry restores both weeks once; an old flagged partial repair is repaired. Existing marker IDs are retained and never awarded twice.

### M4. FIXED: den preview makes two false promises

**Source:** `js/app.js:7313` (`openDenSheet`), especially the subtitle and gear-drop section; reward authority is `js/poi.js:398` (`claimDenWin`), movement comes from `denForCell` in `js/poi.js`.

**Reproduction:** Render an actual roaming den near 49.28, -123.12 and claim its win. The preview promised “Two pieces drop, you keep one” while `gearChoices` was null. Separately generate the same mage cell in weeks 2026-W36 and 2026-W37 and render its preview: its coordinates changed while the subtitle said “he is not moving”. Run both M4 rows.

**Impact:** A player can make a walk expecting gear that cannot drop, or expect a den to stay at a location it leaves on Monday.

**Fix:** The gear-choice promise and odds appear only for landmark dens. Mage copy distinguishes a persistent boss from the den's weekly movement. Other landmark copy also names weekly movement.

**Certainty:** High for generated state and emitted HTML. No visual-layout claim.

## Healthy paths exercised

- Generated landmark, roaming and remote dens use the production services. The existing `p1-dens-audit.mjs` passed, including crate abort/retry across all three types, concurrent claims and retention of a seventh pending gear choice.
- The remote card initially offers a named Fight control and reward. Its actual callback passes a remote boss configuration. A claim raises `denWinsCount` by exactly one, a duplicate returns null, and the rendered card then removes Fight and says TOMORROW.
- The den sheet's real Fight callback runs in range. Out-of-range and already-cleared states emit a disabled control and attach no fight callback.
- All five spawn types were collected through real `collectSpawn` with overlapping calls. Each produced exactly one claim and the expected XP, wallet and inventory changes. The existing `spawn-claim-atomic-audit.mjs` also passed.
- Gear choice controls reject invalid selections, serialize competing picks and retain existing item variants. Mini claims do not inflate the den ceiling.
- These observations are bounded to the exercised paths. The open M5 and M6 findings prevent a blanket claim that map rewards are healthy.

## RED and GREEN evidence

The new regression audit ran on the original production code before any fixes. After correcting the test's dust-key fixture and abort adapter, its complete RED run exited 1 with four controls passing and nine checks failing. No implementation was substituted for the code being graded.

```text
FAIL M1 gear inventory abort retains earned choice: pending=0, inventory=0

0 !== 1

FAIL M1 appearance abort rolls back gear and choice together: appearance abort consumed choice

0 !== 1

PASS CONTROL gear overlap, invalid choice and existing variant
FAIL M1 Keep handler recovers after rejected save: Keep stays busy after an aborted claim

0 !== 1

FAIL M2 mini crate abort is retryable: spent=true, crates=0

true !== false

FAIL M2 mini dust abort and concurrent retry: dust abort left spent crate claim

1 !== 0

FAIL M3 interrupted ceiling backfill resumes missing weeks: restored=1, expected=2

1 !== 2

FAIL M3 legacy completion flag cannot hide missing ceiling markers: legacy early flag prevents repair

0 !== 1

FAIL M4 roaming preview matches absence of gear choices: roaming den promises a gear chooser it never pays
FAIL M4 mage location copy agrees with weekly movement: mage moved next week but preview promises he is not moving
PASS CONTROL den reach, cleared state and fight callback
PASS CONTROL remote den actual card, handler, payout and tomorrow
PASS CONTROL all five spawn types pay once on overlapping collects
MAP PLAYTEST: 4 passed, 9 failed (Node only; no pixel claim)
```

After the fixes, the same audit command exited 0:

```text
PASS M1 gear inventory abort retains earned choice: pending=1 after abort; retry delivers one gear
PASS M1 appearance abort rolls back gear and choice together
PASS CONTROL gear overlap, invalid choice and existing variant
PASS M1 Keep handler recovers after rejected save
PASS M2 mini crate abort is retryable: unspent after abort; retry=40 XP, one crate, 12 dust
PASS M2 mini dust abort and concurrent retry
PASS M3 interrupted ceiling backfill resumes missing weeks: two weeks restored once after retry
PASS M3 legacy completion flag cannot hide missing ceiling markers
PASS M4 roaming preview matches absence of gear choices
PASS M4 mage location copy agrees with weekly movement
PASS CONTROL den reach, cleared state and fight callback
PASS CONTROL remote den actual card, handler, payout and tomorrow
PASS CONTROL all five spawn types pay once on overlapping collects
MAP PLAYTEST: 13 passed, 0 failed (Node only; no pixel claim)
```

Known unfixed gap command, `node docs/playtest-map-gaps.mjs`, exits 1:

```text
FAIL M5 boss: {"baseOwed":70,"boostedOwed":88,"afterFailure":{"claimed":true,"coins":0,"charm":1},"retry":{"xp":0,"coins":13},"wallet":13,"charm":0}
FAIL M5 mini: {"baseOwed":45,"boostedOwed":56,"afterFailure":{"claimed":true,"coins":0,"charm":1},"retry":{"xp":0,"coins":10},"wallet":10,"charm":0}
FAIL M6 stale empty merge: pending=0, winRetry=null
FAIL M6 stale choice merge: gear=2, expected=1
KNOWN GAPS: 4 earned-payout invariant(s) failed
```

## Agreed proof

`node tests/unit.test.js` exited 0:

```text
377 passed, 0 failed
```

Every entry in the final PURE list was run as `node tests/<entry>` with the checkout as cwd. A temporary driver evaluated only the PURE declaration and its push/unshift statements, stopping before `const BROWSER`, then spawned the individual commands. This avoids the release-gate server/browser startup while executing the exact registered list.

Initial result: 112/116 entries exited 0. Four exited 97 because `esprima` was absent: `store-copy-lint.mjs`, `store-runtime-audit.mjs`, `submission-build-audit.mjs`, `submission-preflight-audit.mjs`.

Resolved locally: extracted esprima 4.0.1 from the existing npm cache into ignored `node_modules/esprima`, after verifying the archive against the SHA512 integrity in this checkout's `package-lock.json`. No network, package manifest or lockfile changes. All four reruns exited 0. A subsequent complete pass with the dependency available also exited 0: **116/116 PURE entries exit 0**. Its driver output is `/private/tmp/map-pure-final.txt`. The submission checks used their fixture-only paths; no submission, archive or upload of the real application occurred.

Individual final statuses:

```text
version-align-lint.mjs: exit 0
no-debug-markers-lint.mjs: exit 0
store-copy-lint.mjs: exit 0
lab-room2-audit.mjs: exit 0
stable-stale-disclosure-audit.mjs: exit 0
breed-last-colour-audit.mjs: exit 0
stable-loss-disclosure-audit.mjs: exit 0
lab-health-recovery-audit.mjs: exit 0
lab-integration-audit.mjs: exit 0
lab-ui-audit.mjs: exit 0
laboratory-audit.mjs: exit 0
lab-foundation-audit.mjs: exit 0
pet-stress-guard.mjs: exit 0
crew-pet-node-guard.mjs: exit 0
transmog-receipt-audit.mjs: exit 0
today-reads-lint.mjs: exit 0
kitchen-atomic-audit.mjs: exit 0
backup-encoder-audit.mjs: exit 0
backup-key-audit.mjs: exit 0
backup-version-audit.mjs: exit 0
backup-conflict-audit.mjs: exit 0
unit.test.js: exit 0
log-xp-farm-audit.mjs: exit 0
drip-badge-audit.mjs: exit 0
xp-key-provenance-lint.mjs: exit 0
facegate-audit.mjs: exit 0
garden-appetite-guard.mjs: exit 0
pit.test.js: exit 0
quest-daymore-audit.mjs: exit 0
quest-pick-audit.mjs: exit 0
first-fight-audit.mjs: exit 0
stat-source-audit.mjs: exit 0
bastions-rep-sim.mjs: exit 0
analytics-tag-audit.mjs: exit 0
icon-inventory-audit.mjs: exit 0
version-stamp-audit.mjs: exit 0
boneyard-supply-audit.mjs: exit 0
loot-fallback-audit.mjs: exit 0
guard-hygiene-lint.mjs: exit 0
guard-provenance-lint.mjs: exit 0
feedback-status-lint.mjs: exit 0
rack-theme-lint.mjs: exit 0
rack-rotate-audit.mjs: exit 0
pet-accessory-lint.mjs: exit 0
pet-pool-audit.mjs: exit 0
manifest-exports-audit.mjs: exit 0
xp-curve-audit.mjs: exit 0
live-api-register-lint.mjs: exit 0
claim-evidence-lint.mjs: exit 0
thumb-freshness-lint.mjs: exit 0
render-sink-lint.mjs: exit 0
lapse-witness-audit.mjs: exit 0
spawn-claim-atomic-audit.mjs: exit 0
wardrobe-family-audit.mjs: exit 0
football-kit-audit.mjs: exit 0
restore-latch-audit.mjs: exit 0
first-pet-audit.mjs: exit 0
recovery-status-audit.mjs: exit 0
currency-revision-lint.mjs: exit 0
inv-tombstone-audit.mjs: exit 0
take-and-pay-audit.mjs: exit 0
pet-morph-animation-audit.mjs: exit 0
pet-palette-audit.mjs: exit 0
fontscale-audit.mjs: exit 0
wheel-easing-audit.mjs: exit 0
storage-boot-audit.mjs: exit 0
crate-cadence-audit.mjs: exit 0
silence-disclosure-audit.mjs: exit 0
health-disclosure-audit.mjs: exit 0
paddock-pack-audit.mjs: exit 0
numbers-honesty-audit.mjs: exit 0
locale-numbers-audit.mjs: exit 0
audit-output-audit.mjs: exit 0
branch-graveyard-audit.mjs: exit 0
store-runtime-audit.mjs: exit 0
r47-rest-audit.mjs: exit 0
r47-economy-audit.mjs: exit 0
submission-build-audit.mjs: exit 0
harness-environment-audit.mjs: exit 0
guard-debts-audit.mjs: exit 0
submission-preflight-audit.mjs: exit 0
pet-state-audit.mjs: exit 0
pet-family-audit.mjs: exit 0
crew-pet-audit.mjs: exit 0
coins-merge-tie-audit.mjs: exit 0
routine-race-audit.mjs: exit 0
dayone-topup-audit.mjs: exit 0
dish-worth-audit.mjs: exit 0
pet-C-node-guard.mjs: exit 0
r48-state-audit.mjs: exit 0
r46-logging-audit.mjs: exit 0
r46-diary-audit.mjs: exit 0
zero-calorie-seam-audit.mjs: exit 0
audit-completion-audit.mjs: exit 0
machine-character-audit.mjs: exit 0
n3-deadpaths-audit.mjs: exit 0
m5-prove-red.mjs: exit 0
lookup-guard-lint.mjs: exit 0
restore-state-audit.mjs: exit 0
restore-debt-edges-audit.mjs: exit 0
restore-debt-audit.mjs: exit 0
p1-r48-rest-audit.mjs: exit 0
pet-a11y-audit.mjs: exit 0
kennel-copy-audit.mjs: exit 0
breed-lock-audit.mjs: exit 0
device-loss-audit.mjs: exit 0
multidevice-earnings-audit.mjs: exit 0
response-bodies-audit.mjs: exit 0
p1-merge-audit.mjs: exit 0
quest-wheel-budget-audit.mjs: exit 0
kitchen-delivery-audit.mjs: exit 0
map-playtest-audit.mjs: exit 0
p1-dens-audit.mjs: exit 0
crew-yard-row-audit.mjs: exit 0
pet-rarity-audit.mjs: exit 0
stable-rooms-top-audit.mjs: exit 0
```

`git diff --check`, both changed JavaScript syntax checks, and `node tests/release-gate.mjs --coverage-only` also exited 0. Raw session proof logs are under `/private/tmp/map-pure-proof/`, `/private/tmp/map-unit-proof.txt`, `/private/tmp/map-playtest-red.txt` and `/private/tmp/map-playtest-green.txt`. The relevant outputs are retained above for review without those temporary files.

## Files changed

- `js/poi.js`: atomic gear selection and mini crate/dust payout; resumable den ceiling repair.
- `js/app.js`: den preview corrections; recoverable Keep save error.
- `tests/map-playtest-audit.mjs`: runnable production-code regression audit, 13 checks.
- `tests/release-gate.mjs`: adds that audit to PURE.
- `docs/playtest-map-gaps.mjs`: runnable evidence for the unfixed settlement and backup-merge gaps, outside PURE.
- `docs/PLAYTEST-MAP.md`: this advisory report.

An ignored dependency was provisioned at `node_modules/esprima` for proof only. No original checkout was edited.

## Blocked actions and deviations

No tool approval was denied. The initial dependency-blocked proof entries were resolved as described above. No commit, push, PR, publish, deployment, remote Wrangler command, production D1 write or secret operation was attempted. `native/ASC-SUBMISSION.md` and all art assets were untouched.

No requirement was silently redesigned. Browser and socket restrictions were followed using the direct-code method prescribed by the plan. The full release-gate entry point was not invoked because it starts browser infrastructure; every agreed PURE entry was invoked individually instead. M5 remains unfixed under the plan's instruction to report work that cannot be safely completed within the traced area. M6 requires another area's backup merge file, which the plan explicitly excludes from fixes. Both proposed broader changes are advisory only.
