Shop and economy playtest, 2026-09-08. Advisory report for independent review.

The supplied plan file matched SHA256 `d58876795e1512e4cf36d6ba6caefb5c52449efbc017a44daa9889324ddee5f4`. All production sources were resolved inside this checkout. The starting working tree was clean.

I drove the real `js/loot.js` exports and `js/db.js` transactions over `tests/mem-idb.mjs`. The new audit aborts actual IndexedDB transactions when a selected production row is written. Its fault counter must observe exactly one matching write. It also evaluates the real Shop templates and purchase listeners sliced from `js/app.js`, including the shared two-tap confirmation handler. DOM and artwork doubles support execution only. No browser, socket, layout, hit-target, colour or pixel assessment was performed.

The fixed findings below were reproduced RED before their production changes. The completed audit was also run against both original production files obtained with `git show HEAD:js/loot.js` and `git show HEAD:js/app.js`, in a disposable copy outside the checkout. That original-source control exits 1 with 5 passing and 13 failing checks. The fixed source exits 0 with 18 passing checks. No test asserts on a substitute purchase implementation.

Finding 1: pet purchases can lose 50,000 coins before their receipt exists. Fixed. High confidence, transaction and retry reproduction.

Reproduction: seed exactly `PET_SHOP.pet.coin` (50,000 coins), buy Bumbleseal through `buyPetItem`, and abort the write of `petbuy:<pet id>`. Original result: wallet 0, no receipt and no delivered pet. Retry needs another 50,000 coins. Separately, seed an existing paid `petbuy` receipt, no pet and a zero wallet. The original recovery path returns `reason: coins`, `need: 50000`, `have: 0` before checking that payment is already recorded.

Player impact: the most expensive individual Shop purchase can consume its full price without delivery; existing paid orders require fresh funds just to enter recovery. Original source: `js/loot.js:737`, debit at 754 and independent receipt at 757. Fixed source: `js/loot.js:622`. The live transaction now includes debit, revision, receipt, cosmetic, collected look and Stable instance. An unambiguous legacy paid receipt recovers without another debit. Normal pet equipping continues through `setEquippedPet` after ownership has committed.

RED: `pet payment survived receipt abort`, `0 !== 50000`; `paid pet remains missing: {"ok":false,"reason":"coins","need":50000,"have":0}`.
GREEN: `PASS PET receipt abort preserves 50000 coins and retry charges once`; `PASS PET paid legacy receipt recovers with zero coins`.

Finding 2: football purchases can deliver a partial set permanently, and bundle receipts can overstate the charge. Fixed. High confidence, real multi-row delivery, concurrency and UI reproductions.

Reproduction: seed 4,200 coins, buy the first team's helmet and abort its second inventory colourway write. Original result: wallet 0 with only the first part of the promised 128-row helmet/visor set. Retry sees the first helmet as owned and refuses further delivery. A zero-wallet save seeded with that first paid helmet produces the same refusal. The original Shop template disables the owned preview's control.

Also start with 100,000 coins and call `buyFootballBundle('all')` and a different team's `buyFootballItem(cleatsId)` concurrently. Original receipts sum to 21,000 coins while the actual debit is 17,600, because the bundle refunds a concurrent overlap but still returns its original `cost` and garment count.

Player impact: incomplete paid colour sets, misleading ownership controls, and incorrect purchase receipts. Original source: `js/loot.js:113`, `js/loot.js:149`; `js/app.js:10349` and the drop purchase listener formerly at 10900. Fixed source: `js/loot.js:88`, `js/loot.js:113`; `js/app.js:10349`, recovery control at 10391 and receipt handling at 10943. Ownership, quote, debit, revision, collected looks and every delivered colourway now share one transaction. The receipt reports that transaction's actual charge. Partial owned garments offer a free recovery control, including at zero coins, and recovery refreshes the shelf. Complete-bundle ownership now requires every inventory colourway.

RED: `football charged for an interrupted colourway set`, `0 !== 4200`; `partial helmet cannot recover: {"ok":false,"reason":"owned"}`; `receipt costs disagree with actual debit`, `17600 !== 21000`; `owned partial garment has no free recovery control`.
GREEN: the five `FOOTBALL` rows in the retained GREEN output below, including the actual two-click recovery listener.

Finding 3: a Puffer Pack purchase can consume 3,000 coins without its jacket. Fixed. High confidence, delivery abort and retry reproduction.

Reproduction: seed the first `DROP.items` entry's exact price, 3,000 coins, buy it through `buyDropItem` and abort its cosmetic inventory write. Original result: wallet 0, no jacket; retry cannot afford the item. Original source: `js/loot.js:187`, debit at 203 and grant at 205. Fixed source: `js/loot.js:135`. Live ownership, payment, revision, cosmetic and collected look now commit together. The concurrent ownership check retains exactly-one-charge behavior, including legacy inventory rows.

RED: `drop payment survived delivery abort`, `0 !== 3000`.
GREEN: `PASS DROP delivery abort preserves 3000 coins and retry charges once`.

Finding 4: the weekly Mystery Egg can consume its 60 Bone Dust without delivery, and paid recovery is unavailable at zero dust. Fixed for new transactions and ungranted current-week legacy receipts. High confidence, two independent abort boundaries and real template/listener reproduction.

Reproduction: seed exactly 60 dust and call `buyDustEgg`. Abort either the `dustegg:<ISO week>` receipt write or the egg inventory write. Original result in both cases: 0 dust without an egg. Seed a current-week receipt with `granted: false` and zero dust; concurrent retry calls both return `reason: dust`, `need: 60`, `have: 0`. The real template also renders the paid recovery button disabled at zero dust.

Player impact: an earned currency payment and potentially the week's egg are unavailable; the offered retry can be a dead end. Original source: `js/loot.js:819`, separate debit at 827, receipt at 829, granted flag before inventory at 859; `js/app.js:10851`. Fixed source: `js/loot.js:677`, `js/loot.js:682`, `js/loot.js:687`; `js/app.js:10854` and 10879. Debit, revision, granted receipt and the production `eggRow` commit together. A current-week ungranted paid receipt delivers exactly once without charging again. The template names paid recovery and leaves it enabled at zero dust. Funded first taps still only arm; queued taps behind confirmation do not create extra purchases.

RED: `dust payment survived receipt abort`, `0 !== 60`; `dust charged without an egg`, `0 !== 60`; both zero-dust recovery calls refuse; `paid recovery is disabled at zero dust`, `true !== false`.
GREEN: the six egg-specific and template/handler checks in the retained GREEN output below.

Finding 5: a paid rack reroll can consume coins without changing the shelf. Fixed. High confidence, paid-rung transaction abort and retry reproduction.

Reproduction: seed 100,000 coins, consume the initial free reroll, then abort the next `rack` write when its `rr` increases. Original result: 99,000 coins with the original shelf and counter intact. The first free rung is deliberately consumed by the audit; aborting that free rung alone would not prove a currency loss. Original source: `js/loot.js:470`, independent debit at 494 and rack write at 496. Fixed source: `js/loot.js:412`.

The counter, rotating shelf, payment and revision now commit together. A stale week or counter refuses without charging. The themed nine remain unchanged. Prices, free first rung, weekly reset and the reroll ladder were not redesigned.

RED: `reroll charged without changing the shelf`, `99000 !== 100000`.
GREEN: `PASS REROLL abort preserves coins and the current shelf`.

Finding 6: a rack purchase can lose its paid-look entitlement after delivering the cosmetic. Unfixed. High confidence about the missing entitlement and failed retry; the shared Wardrobe recovery/restore policy was not fully traced in this Shop lane.

Reproduction: `node tests/shop-economy-audit.mjs --known-debts`. The additional row buys the first rack item and aborts the `paidlooks` write. The cosmetic is delivered and payment is recorded. Retry returns `reason: owned`, but `paidLooks()` still lacks the slot/item entitlement. It exits 1 with `FAIL UNFIXED rack retry must restore its interrupted paid-look entitlement: retry says owned but the paid-look entitlement is still missing`.

Source: current `js/loot.js:492`, early ownership return before recovery, and `js/loot.js:2743` (`markPaid`). `js/loot.js:2763` (`transmogPrice`) uses that entitlement when a slot has statted gear. Player impact: the already-paid look can incur a second Bone Dust charge when worn over gear. This crosses the shared Wardrobe paid-look, grandfathering and restoration rules. Proposed follow-up: put the free-to-wear entitlement in the rack purchase transaction and repair it from `rackbuy` receipts even when the cosmetic already exists, with Wardrobe and restore audits. The optional failing row explicitly records this debt; the default PURE run does not claim it is fixed.

Healthy controls exercised: concurrent pet, drop and egg calls produce one successful charge; empty wallets produce no goods; 90 coins buy one Vigor Draught and 100 coins buy one Battle Charm, both delivered to inventory with accurate owned counts. Normal rack coin and dust purchases deliver the cosmetic and its paid look at the returned price, and repeat purchase is refused without a second charge. Aura ownership survives taking it off and putting it on, with no further charge. The real egg template distinguishes affordable, unaffordable and bought-this-week states. The real shared confirmation function spends nothing on the first tap and allows one purchase during a queued tap burst. Existing PURE audits cover currency merge/replay and backup behavior as part of the proof run.

Historical limitations are not silently repaired. Old debits with no surviving receipt cannot reliably identify what was bought. An old `granted: true` egg receipt without an inventory egg cannot distinguish failed delivery from an egg that was already hatched. The legacy recovery added here is for the current week's ungranted receipt; older-week legacy recovery remains outside this change. Proposed deviation from a literal guarantee of repairing every historical loss: prevent new losses in the fixed paths and recover only the unambiguous states described above. Ambiguous historical compensation and the shared Wardrobe entitlement migration need separate review.

Files changed:

- `js/loot.js`: transaction boundaries and legacy recovery for football, drop, pet, dust egg and reroll purchases; pending egg query.
- `js/app.js`: paid egg and partial football recovery controls, complete bundle ownership, recovery refresh and copy.
- `tests/shop-economy-audit.mjs`: permanent Node audit, production-template/listener checks and explicit optional known-debt reproduction. It writes no files.
- `tests/release-gate.mjs`: registers the audit in PURE.
- `tests/rack-rotate-audit.mjs`: replaces the old source-order heuristic with a real funded paid-rung call and inventory-independent shelf assertions.
- `tests/unit.test.js`: the dust delivery census recognizes `eggRow`; concurrent football assertions accept either valid transaction order and require receipts to equal actual spending.
- `docs/PLAYTEST-SHOP.md`: this report.

The existing football unit check required both racing purchases to succeed under its old refund interleaving. That assertion is incompatible with an atomic bundle winning before the single purchase. The replacement accepts either serial order, verifies complete ownership, and asserts the exact appropriate charge (13,400 if the bundle wins, or 10,100 plus 4,200 if the single wins). This is a disclosed proof adaptation, not a change to catalogue prices or bundle discounts. The rack audit's old `kvUpdate`/`coinsAdd` source-order heuristic was similarly replaced by execution of the actual paid reroll. No existing audit was removed from PURE.

No commit, push, publication, PR, Worker deployment, remote Wrangler command, production D1 write, secret change or original-checkout edit was performed. `native/ASC-SUBMISSION.md` and all artwork are unchanged. No approval rejection occurred. Browser, socket and visual work were excluded by the frozen order. Temporary evidence, the original-source control and the PURE runner stayed outside the graded checkout.

Four initial PURE entries reported exit 97 because the checkout lacked `esprima`. Its pinned 4.0.1 tarball was available in the local npm cache. I verified its SHA512 against `package-lock.json` and extracted it into ignored `node_modules/esprima`. No network request or package/lockfile change was needed.

A diagnostic run with release-gate's `audit-lifecycle.mjs` preload counted the expected RED fixtures printed by `m5-prove-red.mjs` as seven failures and changed its exit to 1, despite `m5-prove-red: PASS`. The unchanged audit exits 0 when invoked directly. This harness issue is outside the Shop lane and remains unfixed. The agreed PURE proof below invokes each listed entry directly. The full browser release gate was not run.

Final proof output:

```text
$ node tests/unit.test.js
377 passed, 0 failed
exit 0

$ node tests/shop-economy-audit.mjs
PASS PET receipt abort preserves 50000 coins and retry charges once
PASS PET paid legacy receipt recovers with zero coins
PASS EGG receipt abort preserves 60 dust and retry pays once
PASS EGG delivery abort preserves dust and an unspent weekly allowance
PASS EGG paid legacy receipt recovers at zero dust exactly once
PASS DROP delivery abort preserves 3000 coins and retry charges once
PASS REROLL abort preserves coins and the current shelf
PASS CONTROL concurrent pet, drop and egg buys charge and deliver once
PASS CONTROL empty wallets refuse unpaid goods; supplies really arrive
PASS FOOTBALL interrupted colourway delivery preserves coins and grants nothing
PASS FOOTBALL legacy partial garment recovers every colour at zero coins
PASS FOOTBALL concurrent receipts report the actual coins spent
PASS CONTROL rack coin and dust prices grant paid looks; aura wear is reversible
PASS CONTROL real dust egg template prices and limits agree with storage
PASS EGG paid recovery stays clickable in the real zero-dust template
PASS FOOTBALL partial owned garment renders a free recovery control
PASS CONTROL real Shop egg button requires two taps, delivers and reports balance
PASS FOOTBALL real recovery handler accepts zero coins and refreshes the shelf
SHOP ECONOMY: 18 passed, 0 failed (Node only, no pixel claim)
exit 0

PURE entries invoked directly from the evaluated list in tests/release-gate.mjs:
116 entries, 116 exited 0, 0 failed

$ node tests/guard-hygiene-lint.mjs
guard-hygiene: clean
exit 0

$ node tests/feedback-status-lint.mjs
feedback-status: clean
exit 0

$ git diff --check
(no output)
exit 0
```

Original-source RED control, using the finished audit in the external disposable copy (assertion headings and final summary retained verbatim):

```text
FAIL PET receipt abort preserves 50000 coins and retry charges once: pet payment survived receipt abort
FAIL PET paid legacy receipt recovers with zero coins: paid pet remains missing: {"ok":false,"reason":"coins","need":50000,"have":0}
FAIL EGG receipt abort preserves 60 dust and retry pays once: dust payment survived receipt abort
FAIL EGG delivery abort preserves dust and an unspent weekly allowance: dust charged without an egg
FAIL EGG paid legacy receipt recovers at zero dust exactly once: missing paid egg: [{"ok":false,"reason":"dust","need":60,"have":0},{"ok":false,"reason":"dust","need":60,"have":0}]
FAIL DROP delivery abort preserves 3000 coins and retry charges once: drop payment survived delivery abort
FAIL REROLL abort preserves coins and the current shelf: reroll charged without changing the shelf
FAIL FOOTBALL interrupted colourway delivery preserves coins and grants nothing: football charged for an interrupted colourway set
FAIL FOOTBALL legacy partial garment recovers every colour at zero coins: partial helmet cannot recover: {"ok":false,"reason":"owned"}
FAIL FOOTBALL concurrent receipts report the actual coins spent: receipt costs disagree with actual debit
FAIL EGG paid recovery stays clickable in the real zero-dust template: paid recovery is disabled at zero dust
FAIL FOOTBALL partial owned garment renders a free recovery control: owned partial garment has no free recovery control
FAIL FOOTBALL real recovery handler accepts zero coins and refreshes the shelf: Expected values to be strictly equal:
SHOP ECONOMY: 5 passed, 13 failed (Node only, no pixel claim)
exit 1
```

The initial pre-fix run had 4 passing controls and 7 failing checks for pet, egg, drop and paid reroll losses. Subsequent pre-fix additions separately reproduced the disabled egg control, football delivery/receipt failures and disabled partial-football recovery control. The final original-source control above additionally verifies that the completed harness detects those original defects together. Detailed assertion values are recorded under each finding.

PURE entry exit codes, in executed order. Each command was `node tests/<entry>`, launched from this checkout. The new Shop audit was rerun after its final handler/control additions and passed 18/18; the agreed unit command and relevant hygiene/document checks were also rerun after the final changes.

| Entry | Exit |
| --- | ---: |
| `version-align-lint.mjs` | 0 |
| `no-debug-markers-lint.mjs` | 0 |
| `store-copy-lint.mjs` | 0 |
| `shop-economy-audit.mjs` | 0 |
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
| `p1-merge-audit.mjs` | 0 |
| `quest-wheel-budget-audit.mjs` | 0 |
| `kitchen-delivery-audit.mjs` | 0 |
| `p1-dens-audit.mjs` | 0 |
| `crew-yard-row-audit.mjs` | 0 |
| `pet-rarity-audit.mjs` | 0 |
| `stable-rooms-top-audit.mjs` | 0 |

Execution evidence outside the checkout: `/private/tmp/shop-original-final-audit.txt`, `/private/tmp/shop-economy-green.txt`, `/private/tmp/shop-economy-known-debts.txt`, `/private/tmp/shop-pure-direct/results.json` and its per-entry logs. The original-source control copy was `/var/folders/k7/gh5s55k16q17nlm_hj_3g3bm0000gp/T/shop-original-hx85a9w3`. These paths are evidence only, not alternate production source locations. The report retains the results needed if those temporary files are cleaned up.
