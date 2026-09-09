# Backpack and Wardrobe playtest

Advisory findings for independent review, 2026-09-08. Baseline: `0412b237706e77e47b9f9f9e9d625014c76dfe31`.

Frozen plan SHA256 verified: `23744a2454e7ae34c5cdc776a309e81f3d549ac5d235b42004af180ae31fa4f0`.
All production paths below refer to this checkout. Four proven findings were fixed. No gameplay prices, rarity weights, art, or ownership rules were redesigned.

## Method and limits

Ran production `js/loot.js` and `js/db.js` over `tests/mem-idb.mjs`. The landed audit also slices and executes the single-crate click handler and the crate-odds render template from `js/app.js`. It asserts stored production results, rendered strings and control state. DOM doubles only supply event registration, messages, reveals and repaint callbacks.

The fault wrapper operates at the IndexedDB transaction boundary. Its `after` mode lets the transaction containing the selected write commit, then aborts later transactions to model an interruption. Its `abort` mode aborts the selected write's own transaction. Every fault case asserts that its trigger actually fired, then clears the fault before reading storage. This models interrupted persistence; it does not claim a physical process-kill or browser IndexedDB test.

No browser or socket was opened. I could not see cosmetic/layout issues, art, animations, hit targets, or real browser timing, and make no visual-quality claim. The tests do not write files. All scratch work and proof logs are under `/private/tmp/wardrobe-proof` or an isolated `/private/tmp/wardrobe-red-*` copy, outside the graded checkout.

## W1. Transmog could permanently charge without delivering

**Priority:** earned-currency loss. **Certainty:** high, deterministic production-state reproduction. **Fixed.**

**Source:** original `js/loot.js:2944` through the end of `applyTransmog`, especially the separate `spendDust`, `markPaid` and `kvUpdate('transmog')` calls. Fixed function: [js/loot.js:2929](../js/loot.js#L2929).

**Exact reproduction:** grant `g-H10-1-gravecaller` and `g-H10-2-ringmaster`, equip the first in `H`, seed 100 Bone Dust, then call `applyTransmog('H', 'H10-2')`. Block every subsequent transaction once the `bonedust` debit is dispatched. The original debit commits at 88 dust, but `paidlooks` is empty and `transmog` is `{}`. The player loses 12 earned dust and has no purchase receipt that makes a retry free.

A second case aborts the transaction writing `transmog`. The original state is 88 dust and receipt `H:H10-2`, with the appearance unapplied. A third case starts with exactly 12 dust and concurrently applies the same look twice. The original calls return one success and one insufficient-dust refusal even though that look has just been paid for.

**Fix:** ownership, equipment, price, sufficient funds, debit, currency revision, paid receipt and appearance are decided or written in one existing `payAtomic` transaction. A retry sees the existing receipt. Legacy paid-look grandfathering and free, unbanked wears on slots without statted gear remain supported.

**Proof:** W1's two fault rows and the concurrent-transmog row below went red on the original code and green on the fix. The aborted-write check also verifies an unchanged dust revision and a successful retry; the interruption check clears and reapplies for zero additional dust.

## W2. Melting could erase a collected look promised forever

**Priority:** permanent earned-appearance loss. **Certainty:** high, deterministic production-state reproduction. **Fixed.**

**Source:** original `js/loot.js:1121` (`disenchantGear`) and `js/loot.js:2851` (`collectLook`). Fixed functions: [js/loot.js:1121](../js/loot.js#L1121) and [js/loot.js:2850](../js/loot.js#L2850). The real Wardrobe melt toast at `js/app.js:17705` promises that the look is yours forever.

**Exact reproduction A:** insert the real `gearRow('g-H10-2-ringmaster', 'legacy')` inventory row without a `looks` entry, matching a save predating the permanent-look ledger. `collectedLooks()` exposes `H10-2` while the gear is owned. Call `disenchantGear` on it. The gear is removed and dust is paid, but `collectedLooks()` no longer contains `H10-2`. A read had only unioned inventory into its return value, never durably banked this legacy appearance.

**Exact reproduction B:** concurrently call `grantGear` for the two hat variants above. Each calls `collectLook`, whose original read/append/replace sequence loses one addition. The stored ledger contains only `["H10-2"]`. Melting both inventory copies then permanently loses the first hat's look.

**Fix:** `collectLook` atomically unions its addition through `kvUpdate`. Melting banks the gear's appearance in the same transaction as its removal and dust payout, including legacy gear with no ledger entry. The concurrency check asserts the ledger before melting so melt-time preservation cannot mask a broken collection writer.

**Proof:** both W2 rows below went red and green. Dust payout and initial ownership are positive controls.

## W3. A failed melt silently removed equipped stats

**Priority:** inconsistent equipment after a failed action, reversible player harm. **Certainty:** high, deterministic transaction-abort reproduction. **Fixed.**

**Source:** original `js/loot.js:1128` wrote `gearloadout` before consuming the item. Fixed transaction: [js/loot.js:1126](../js/loot.js#L1126).

**Exact reproduction:** grant and equip `g-H10-1-gravecaller`, seed 100 dust, then abort the `inv` deletion inside `disenchantGear`. The operation rejects, the gear stays in inventory and the balance stays at 100, but `gearloadout.H` is already absent. A player whose melt failed has unexpectedly lost the stats they were wearing and must re-equip the item.

**Fix:** conditional removal of the worn gear now shares the consuming transaction. Its updater reads the current map and preserves every other slot. An abort restores item, dust and loadout together.

**Proof:** W3 below went red and green. A separate control overlaps two melts of one piece and confirms exactly one payout while another slot remains unchanged.

## W4. Failed single-crate opening left a disabled control

**Priority:** reachable dead control, recoverable by leaving/reopening the screen. **Certainty:** high for handler and storage behavior; no browser-layout claim. **Fixed.**

**Source:** [js/app.js:18031](../js/app.js#L18031), the real `[data-open]` click handler.

**Exact reproduction:** grant one daily crate, register the production handler against a button double pointing to that row, and abort the crate deletion transaction when clicked. The original handler rejects, leaves `disabled=true`, emits no local recovery message, and does not refresh the tab. The unopened crate remains safely stored, but the control stays disabled on that rendered screen. The global storage-error notifier does not repair this button.

**Fix:** guard repeated clicks while opening; catch failure and explain recovery; restore button state and refresh the Backpack in `finally`. The message does not promise that the crate is unopened, since a reveal failure can happen after rewards have already committed.

**Proof:** W4 below went red and green. After the induced failure, the same handler retries successfully, reveals exactly one reward result, and consumes the crate.

## Healthy paths exercised

- Concurrent opens of one Bone Crate pay once, deliver three result entries, persist corresponding inventory/ingredient rewards and coins, and record its consumed ID.
- The actual crate-odds template renders the percentages computed by production `crateOdds` for ordinary and first Bone Crate cosmetic pulls. It retains the conditional cosmetic-drop wording and three-pull count. This verifies displayed values against the configured weights, not statistical RNG distribution.
- Plain cosmetic equip removes statted equipment from that slot. Hide and clear work without a dust charge on that plain slot. Strip preserves the complete inventory.
- A paid saved fit survives stripping, restores owned gear and the selected appearance, and costs no more dust. Rename and delete affect the saved-fit list.
- Wrong-slot, uncollected-look and insufficient-dust attempts refuse without changing balance, receipts or appearance.
- Existing `transmog-receipt-audit.mjs` exercises free-wear restrictions, paid reuse and saved-fit refusal behavior. Existing `take-and-pay-audit.mjs` and merge audits are included in the PURE proof below.

## Red and green evidence

The audit was created and run before changing production code: **4 passed, 7 failed, exit 1**. After adding two healthy controls and strengthening the collection-ledger assertion, the exact final audit was rerun in an isolated temporary copy with `js/app.js` and `js/loot.js` restored from this checkout's baseline HEAD. It again failed on the same seven rows. The final transcript follows, with **6 passed, 7 failed, exit 1**:

```text
FAIL W1 transmog interruption after debit preserves receipt and appearance: dust=88, paid=[], transmog={}
FAIL W1 aborted appearance write rolls back dust and receipt: dust=88, paid=["H:H10-2"]
FAIL CONTROL concurrent transmog taps with exactly one purchase worth of dust both succeed once: [{"ok":true,"cost":12,"already":false},{"ok":false,"reason":"dust","need":12,"have":0}]
FAIL W2 melting legacy gear keeps its collected look forever: look H10-2 vanished after melt
FAIL W2 concurrent collected looks survive after inventory copies are melted: collected ledger=["H10-2"]
FAIL W3 aborted melt preserves worn stats, item and dust: failed melt removed equipped stats
+ actual - expected

+ undefined
- 'g-H10-1-gravecaller'

PASS CONTROL melting one copy concurrently pays exactly once and retains other slots
FAIL W4 single crate click recovers from an aborted take and allows retry: rejected=true, disabled=true, messages=0
PASS CONTROL crate rewards persist and double-open pays once
PASS CONTROL real crate odds template reports production percentages
PASS CONTROL plain cosmetic equip, hide, clear and strip conserve ownership
PASS CONTROL paid saved fit survives strip and restores owned gear without another charge
PASS CONTROL transmog refuses missing ownership, wrong slot and insufficient dust without changing state
WARDROBE PLAYTEST: 6 passed, 7 failed (Node only, no pixel claim)
```

On the fixed production code, `node tests/wardrobe-playtest-audit.mjs` exits 0:

```text
PASS W1 transmog interruption after debit preserves receipt and appearance
PASS W1 aborted appearance write rolls back dust and receipt
PASS CONTROL concurrent transmog taps with exactly one purchase worth of dust both succeed once
PASS W2 melting legacy gear keeps its collected look forever
PASS W2 concurrent collected looks survive after inventory copies are melted
PASS W3 aborted melt preserves worn stats, item and dust
PASS CONTROL melting one copy concurrently pays exactly once and retains other slots
PASS W4 single crate click recovers from an aborted take and allows retry
PASS CONTROL crate rewards persist and double-open pays once
PASS CONTROL real crate odds template reports production percentages
PASS CONTROL plain cosmetic equip, hide, clear and strip conserve ownership
PASS CONTROL paid saved fit survives strip and restores owned gear without another charge
PASS CONTROL transmog refuses missing ownership, wrong slot and insufficient dust without changing state
WARDROBE PLAYTEST: 13 passed, 0 failed (Node only, no pixel claim)
```

## Files changed

- `js/loot.js`: atomic transmog purchase, durable collected-look additions, transactional melt loadout cleanup and legacy appearance preservation.
- `js/app.js`: single-crate click failure recovery.
- `tests/wardrobe-playtest-audit.mjs`: new production-code audit, 13 checks.
- `tests/release-gate.mjs`: registers the new audit in PURE.
- `tests/unit.test.js`: replaces a stale transmog source regex with production-state proof and extends the dust-spend census to recognize the atomic debit.
- `docs/PLAYTEST-WARDROBE.md`: this advisory report.

The first unit run after the fix reported 375 passed and 2 failed. One assertion demanded a previously retired free-wear receipt behavior and happened to pass against a comment mentioning `markPaid`; its replacement checks durable legacy credit and forbids buying credit through a free re-tap. The other census recognized only the old debit shape; its scan now includes the new negative `bumpPay` shape without removing any existing detection or declared spend.

## Unfixed matters, blocked actions and deviations

No reproduced finding above remains unfixed. These changes prevent new losses. They cannot identify or reconstruct dust or looks already lost in older sessions when no surviving receipt, inventory or history records the loss; no speculative historical refund or migration was added.

An initial PURE run had one missing dependency: `store-copy-lint.mjs` exited 97 because Esprima was absent. The pinned Esprima 4.0.1 package was copied from an existing local temporary dependency cache into ignored `node_modules/esprima`. No package manifest or lockfile changed, and no network install was needed. That dependency failure was rerun after setup.

A read-only `ps` diagnostic was denied by the sandbox (`operation not permitted: ps`). It was nonessential and not retried. No other denied action required bypassing a restriction. No commit, push, PR, publish, deployment, remote Wrangler, production D1 write, or secret change was attempted. `native/ASC-SUBMISSION.md` and all art are untouched.

No specification deviation was needed. To obey the socket/browser restriction, a temporary runner evaluates the exact PURE declaration and its push/unshift statements from `tests/release-gate.mjs`, then runs each listed script in a separate Node process. It does not invoke the release-gate driver's server/browser setup. All PURE entries remain required; none are skipped or reclassified.

## Final agreed proof

`node tests/unit.test.js`, exit 0:

```text
377 passed, 0 failed
```

Every entry in PURE was executed, with no skips: **116/116 exited 0**. Exact per-entry output from the final run:

```text
PASS version-align-lint.mjs: exit 0
PASS no-debug-markers-lint.mjs: exit 0
PASS store-copy-lint.mjs: exit 0
PASS wardrobe-playtest-audit.mjs: exit 0
PASS lab-room2-audit.mjs: exit 0
PASS stable-stale-disclosure-audit.mjs: exit 0
PASS breed-last-colour-audit.mjs: exit 0
PASS stable-loss-disclosure-audit.mjs: exit 0
PASS lab-health-recovery-audit.mjs: exit 0
PASS lab-integration-audit.mjs: exit 0
PASS lab-ui-audit.mjs: exit 0
PASS laboratory-audit.mjs: exit 0
PASS lab-foundation-audit.mjs: exit 0
PASS pet-stress-guard.mjs: exit 0
PASS crew-pet-node-guard.mjs: exit 0
PASS transmog-receipt-audit.mjs: exit 0
PASS today-reads-lint.mjs: exit 0
PASS kitchen-atomic-audit.mjs: exit 0
PASS backup-encoder-audit.mjs: exit 0
PASS backup-key-audit.mjs: exit 0
PASS backup-version-audit.mjs: exit 0
PASS backup-conflict-audit.mjs: exit 0
PASS unit.test.js: exit 0
PASS log-xp-farm-audit.mjs: exit 0
PASS drip-badge-audit.mjs: exit 0
PASS xp-key-provenance-lint.mjs: exit 0
PASS facegate-audit.mjs: exit 0
PASS garden-appetite-guard.mjs: exit 0
PASS pit.test.js: exit 0
PASS quest-daymore-audit.mjs: exit 0
PASS quest-pick-audit.mjs: exit 0
PASS first-fight-audit.mjs: exit 0
PASS stat-source-audit.mjs: exit 0
PASS bastions-rep-sim.mjs: exit 0
PASS analytics-tag-audit.mjs: exit 0
PASS icon-inventory-audit.mjs: exit 0
PASS version-stamp-audit.mjs: exit 0
PASS boneyard-supply-audit.mjs: exit 0
PASS loot-fallback-audit.mjs: exit 0
PASS guard-hygiene-lint.mjs: exit 0
PASS guard-provenance-lint.mjs: exit 0
PASS feedback-status-lint.mjs: exit 0
PASS rack-theme-lint.mjs: exit 0
PASS rack-rotate-audit.mjs: exit 0
PASS pet-accessory-lint.mjs: exit 0
PASS pet-pool-audit.mjs: exit 0
PASS manifest-exports-audit.mjs: exit 0
PASS xp-curve-audit.mjs: exit 0
PASS live-api-register-lint.mjs: exit 0
PASS claim-evidence-lint.mjs: exit 0
PASS thumb-freshness-lint.mjs: exit 0
PASS render-sink-lint.mjs: exit 0
PASS lapse-witness-audit.mjs: exit 0
PASS spawn-claim-atomic-audit.mjs: exit 0
PASS wardrobe-family-audit.mjs: exit 0
PASS football-kit-audit.mjs: exit 0
PASS restore-latch-audit.mjs: exit 0
PASS first-pet-audit.mjs: exit 0
PASS recovery-status-audit.mjs: exit 0
PASS currency-revision-lint.mjs: exit 0
PASS inv-tombstone-audit.mjs: exit 0
PASS take-and-pay-audit.mjs: exit 0
PASS pet-morph-animation-audit.mjs: exit 0
PASS pet-palette-audit.mjs: exit 0
PASS fontscale-audit.mjs: exit 0
PASS wheel-easing-audit.mjs: exit 0
PASS storage-boot-audit.mjs: exit 0
PASS crate-cadence-audit.mjs: exit 0
PASS silence-disclosure-audit.mjs: exit 0
PASS health-disclosure-audit.mjs: exit 0
PASS paddock-pack-audit.mjs: exit 0
PASS numbers-honesty-audit.mjs: exit 0
PASS locale-numbers-audit.mjs: exit 0
PASS audit-output-audit.mjs: exit 0
PASS branch-graveyard-audit.mjs: exit 0
PASS store-runtime-audit.mjs: exit 0
PASS r47-rest-audit.mjs: exit 0
PASS r47-economy-audit.mjs: exit 0
PASS submission-build-audit.mjs: exit 0
PASS harness-environment-audit.mjs: exit 0
PASS guard-debts-audit.mjs: exit 0
PASS submission-preflight-audit.mjs: exit 0
PASS pet-state-audit.mjs: exit 0
PASS pet-family-audit.mjs: exit 0
PASS crew-pet-audit.mjs: exit 0
PASS coins-merge-tie-audit.mjs: exit 0
PASS routine-race-audit.mjs: exit 0
PASS dayone-topup-audit.mjs: exit 0
PASS dish-worth-audit.mjs: exit 0
PASS pet-C-node-guard.mjs: exit 0
PASS r48-state-audit.mjs: exit 0
PASS r46-logging-audit.mjs: exit 0
PASS r46-diary-audit.mjs: exit 0
PASS zero-calorie-seam-audit.mjs: exit 0
PASS audit-completion-audit.mjs: exit 0
PASS machine-character-audit.mjs: exit 0
PASS n3-deadpaths-audit.mjs: exit 0
PASS m5-prove-red.mjs: exit 0
PASS lookup-guard-lint.mjs: exit 0
PASS restore-state-audit.mjs: exit 0
PASS restore-debt-edges-audit.mjs: exit 0
PASS restore-debt-audit.mjs: exit 0
PASS p1-r48-rest-audit.mjs: exit 0
PASS pet-a11y-audit.mjs: exit 0
PASS kennel-copy-audit.mjs: exit 0
PASS breed-lock-audit.mjs: exit 0
PASS device-loss-audit.mjs: exit 0
PASS multidevice-earnings-audit.mjs: exit 0
PASS response-bodies-audit.mjs: exit 0
PASS p1-merge-audit.mjs: exit 0
PASS quest-wheel-budget-audit.mjs: exit 0
PASS kitchen-delivery-audit.mjs: exit 0
PASS p1-dens-audit.mjs: exit 0
PASS crew-yard-row-audit.mjs: exit 0
PASS pet-rarity-audit.mjs: exit 0
PASS stable-rooms-top-audit.mjs: exit 0
PURE: 116/116 exited 0
```

`git diff --check` also exits 0. Full standalone logs and the temporary PURE runner are available for local review under `/private/tmp/wardrobe-proof/`.
