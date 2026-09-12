# Economy reward-path findings at v588

2026-09-12. Advisory source review of this checkout. No product changes or fixes are approved. Plan SHA256: `7c0963086e5a58b5f1365c8a2580c7d6eb22fe1392d3dfb06ba3d4d5d2dcda21`.

The six findings below are ranked by potential player loss. All six are **source read only**, not reproduced browser failures. The existing Node audits listed below pass on narrower contracts; that does not prove interruption safety in these paths. Each proposed change requires review, and any economy decision remains Tom's. No browser was opened.

## 1. A paid gift can lose the sender's coins before a gift exists

**Where:** `js/app.js:14053`, `js/app.js:14060`, `js/app.js:14065`, `js/app.js:14074`; `js/social.js:676`.

**What happens:** Closing the process after the local debit but before the request leaves the sender poorer and the recipient with no gift. There is no durable send intent to resume. A separate failure window allows a delivered gift to be refunded locally when its response is lost.

**Evidence:** Source read only. The handler awaits `spendCoins(amt)` before creating a key in the sheet-local `giftKeys` Map and calling `sendGift`. The Map is lost on reload. `sendGift` catches transport failure and returns `{ok:false}`; the handler refunds every such answer. An accepted request with a lost response therefore leaves a delivered gift and a restored sender balance unless the same open sheet retries with its retained key. Reopening discards that key. Currency history can remain internally consistent throughout: it records the debit/refund, not whether the remote gift exists. This is not the receiving-side grant transaction tested by `r47-economy-audit.mjs`.

**Proposed fix:** PROPOSAL: persist the recipient, amount and stable operation key in the same transaction as the debit. Reconcile ambiguous transport outcomes with the server using that key before refunding. Resume unresolved sends after reload, with exactly one terminal delivery or refund.

**Verify:** In a browser, terminate immediately after debit and before dispatch, then reopen. Separately let the server accept while dropping the response, close the sheet and reopen. Check sender balance, recipient grant count and durable operation status. Each intended gift must debit once and deliver once, or refund once without delivery.

## 2. Level rewards can be marked paid while their items and coins are missing

**Where:** `js/game.js:401`, `js/game.js:474`, `js/game.js:490` to `js/game.js:504`.

**What happens:** A level-up can permanently miss coins, its Golden Crate, or milestone dust and egg. Higher milestones expose more separate failure boundaries.

**Evidence:** Source read only. `grantLevelRewards` first inserts `levelpaid-L` with `addIfAbsent`, then separately awaits coins, the normal crate, milestone crates, dust and egg. A write failure after insertion leaves the marker committed. Calling `grantLevelRewards` again skips that level when insertion returns false. This is already sufficient to defeat retry even if the level is revisited. `awardOnce` also commits the XP row before attempting level rewards, and a duplicate returns before level processing. Existing atomic crate-opening proof does not cover granting these crates.

**Proposed fix:** PROPOSAL: stage all reward rows and currency changes and commit them with the level payment marker. Alternatively retain an explicit incomplete receipt that can resume each missing component exactly once. Preserve existing amounts and legacy paid flags.

**Verify:** Cross a level-25 milestone and abort at each successive persistence boundary. Reload and retry recovery twice. The final delta must include exactly `levelCoins(25)`, three Golden Crates, 150 dust and one egg, with no partial terminal receipt.

## 3. Health milestone XP can consume the right to the rest of the reward

**Where:** `js/app.js:19962`; `js/game.js:841` to `js/game.js:915`; `js/game.js:401` to `js/game.js:417`.

**What happens:** A successful Health sync can bank milestone XP but lose its coins, Step Egg, daily crate or discipline reward. Re-syncing the same real activity does not repair the missing payout.

**Evidence:** Source read only. The app passes the Health payload into `onHealthSync`. Each milestone first calls `award`, which commits its unique XP row. Coin amounts are accumulated in a local variable and only paid at line 912. Eggs, daily crates and discipline consumables/dust are also separate writes gated by the newly awarded XP. On retry, the already-present XP row returns zero, so the corresponding reward is skipped. An error in a later milestone can also prevent payment of coins accumulated for earlier milestones. `health-disclosure-audit.mjs` reports `8 passed, 0 failed`, but its disclosure checks do not inject a crash between these claims and payouts.

**Proposed fix:** PROPOSAL: use `awardOnce` with its atomic pay payload for every milestone's full reward. Keep milestone keys, amounts and caps unchanged. Return receipt-derived totals for the toast.

**Verify:** Sync a day with 14,000 steps and a qualifying workout. Abort immediately after each XP claim, then sync the identical payload twice after reload. Compare every milestone's XP, currency and inventory reward, not merely the displayed sync success.

## 4. Spire ownership can recover without its takeover coins

**Where:** `js/app.js:27172`, `js/app.js:27201`, `js/app.js:27218` to `js/app.js:27227`, `js/app.js:27323`.

**What happens:** A player can win and own the tower but never receive the earned 80-coin takeover base payment. A repeat claim follows the already-owned consolation path instead of recovering the original prize.

**Evidence:** Source read only. Server ownership is acquired first. The success branch assigns `coins = 80` in memory, after additional awaits, and the actual currency write occurs at line 27323. There is no takeover payment receipt in this branch. A death after server success but before that write loses the money. The existing audit row is deliberately narrower: `ok   BASELINE Spire: next ownership sync heals the missing tower once` from `take-and-pay-audit.mjs`. It proves the ownership mirror heals, not that takeover coins are paid. `r47-economy-audit.mjs` also passes the offline gates; an offline pending result and a confirmed server success interrupted before local payment are different cases.

**Proposed fix:** PROPOSAL: bind a durable payout receipt to the server's particular ownership transition, and reconcile it on recovery. An already-owned answer must distinguish an unpaid prior transition from a new no-op, preserving the current consolation policy for actual repeats.

**Verify:** Complete a real takeover, kill after server acceptance and before `coinsAdd`, then reopen and sync twice. Assert ownership and exactly one full original takeover payment. Re-fight separately to confirm the existing no-op rule still holds.

## 5. Friend battles and paid spars consume their claim before paying coins

**Where:** `js/game.js:208` to `js/game.js:210`, `js/game.js:433` to `js/game.js:445`; `js/app.js:27035` to `js/app.js:27038`, `js/app.js:27323`, `js/app.js:27345` to `js/app.js:27346`.

**What happens:** A friend battle can lose its 25-coin win or 8-coin loss reward. A spar can consume one of the day's 12 paid slots without delivering its 15 or 5 coins.

**Evidence:** Source read only. `claimFriendBattle` inserts the once-per-friend/day XP claim, then updates metadata and returns the amount for the caller to pay. A retry sees the claim and returns zero coins. `claimSpar` likewise commits `claimCapped` before returning a coin amount to the arena. Neither includes money in its claim transaction. The passing row `ok   REBOOT Pit stake: staked win retains 60 coins and 75 XP` in `take-and-pay-audit.mjs` covers the separate staked-win recovery service (`js/game.js:283` to `js/game.js:295`), not these branches.

**Proposed fix:** PROPOSAL: include the coin payment in the friend claim and spar slot transaction. Return the committed receipt to the arena so the caller displays rather than independently pays it. Preserve the daily cap and per-friend policy.

**Verify:** Abort after the friend or spar claim commits and before the arena's coin write, for both win and loss. Retry the same action after reopening. Exactly one payment must survive and only one slot may be consumed.

## 6. Wellness completion flags can block unpaid XP, and walks can lose Vigor

**Where:** `js/wellness.js:22` to `js/wellness.js:55`, `js/wellness.js:96` to `js/wellness.js:110`; `js/app.js:5340` to `js/app.js:5358`.

**What happens:** Water, bed or sleep can appear completed while their promised XP never arrives. An interrupted manual walk can consume a daily walk allowance without XP, or earn XP without its Vigor.

**Evidence:** Source read only. Water saves its new count before `award`; retry at eight cups fails the `!wasGoal` gate. Bed saves `bed=true` before XP and retry skips the block. Sleep saves `sleepHours` before both its health row and XP; retry has `first=false`. Walks persist their list before claiming its ordinal XP key, and add Vigor in another await only when XP was newly paid. At the two-walk ceiling, a failed second award cannot be retried through the service. After XP but before Vigor, the original ordinal cannot pay Vigor again. The UI reads these results as completion or already done. `routine-race-audit.mjs` reports `ROUTINE RACE VERIFIED`, but that grades routine slot contention, not these completion/payment interruptions.

**Proposed fix:** PROPOSAL: commit each completion and all its rewards together, or make missing ledger payments recoverable from durable completion records without consuming another daily allowance. Keep manual walks out of verified race steps and preserve existing reward caps.

**Verify:** Inject failure between each completion write, XP claim and Vigor write. Reopen and repeat the control. Check health/wellness state, ledger, walk count and Vigor together. Each accepted completion must retain exactly its intended reward.

## Proof and limits

Agreed proof command: `node tests/unit.test.js`. Final output: `392 passed, 0 failed`. This is the existing unit suite, not browser proof of the findings.

All commands ran against this checkout. No browser, server deployment, commit, push or publish was attempted. No action was denied by tooling. No requirement was redesigned and no implementation deviation was taken. Temporary console captures are outside the checkout under `/tmp/h-economy-*.txt`; only this document is added to the checkout.

The following relevant PURE-tier commands from `tests/release-gate.mjs:255` to `tests/release-gate.mjs:330` ran individually as `node tests/<name>.mjs`, all with exit 0:

- `take-and-pay-audit`: `all clean`. Its Spire and Pit limitations are quoted above.
- `kitchen-atomic-audit`: `all green, 20 checks`. Includes `CONTROL a normal cancel returns the recipe and refunds in full`.
- `routine-race-audit`: `ROUTINE RACE VERIFIED`.
- `currency-revision-lint`: `currency-revision: clean`; `SAMPLE` reports `14 pay-map entries, 1 assignments`.
- `coins-merge-tie-audit`: `all clean`.
- `shop-economy-audit`: `SHOP ECONOMY: 18 passed, 0 failed (Node only, no pixel claim)`.
- `r47-economy-audit`: `10 passed, 0 failed`; includes `PASS reachable siege banner and offline fight payout gates remain wired`.
- `r4-app-p1-audit`: `R4 APP P1: 14 passed, 0 failed`.
- `laboratory-audit`: `10/10 Laboratory guards passed`; includes `PASS FAULT CONTROL: split transactions lose inputs; atomic service rolls back every write boundary`.
- `lab-integration-audit`: exit 0; `PASS CONTROL: overnight intent readback recovers unchanged pets without accepting an old-day quote`.
- `breed-last-colour-audit`: exit 0; `PASS CONTROL: last Midnight is named in bar and typed review, and only explicit consent consumes it`.
- `stable-loss-disclosure-audit`: exit 0; `PASS R6-S3 Breed discloses every consumed investment: missing=none`.
- `pet-state-audit`: `pet-state: 12 passed, 0 failed`.
- `pet-family-audit`: `pet-family-audit: 14 passed, 0 failed`.
- `pet-pool-audit`: exit 0; `SHINY-MINT` reports `SHINY_ART = C1,C2,C3,C4,C5`.
- `loot-fallback-audit`: `PASS  loot-fallback-audit: 12/12 checks`.
- `first-pet-audit`: exit 0; `CONTROL a chosen pet stays chosen` passes.
- `rack-rotate-audit`: `rack-rotate: clean`.
- `rack-theme-lint`: exit 0; `PASS  AURA the aura carrier is a real item and is not for sale on the rack`.
- `xp-curve-audit`: `all green`.
- `log-xp-farm-audit`: `all green, 7 checks`.
- `health-disclosure-audit`: `8 passed, 0 failed`.

These are selected relevant audits, not a full release gate. Their green results do not certify the six unexercised interruption scenarios.

## Looked at, not a bug

- **F10, weekSteps clamp investigation:** The producer sums only health `steps` within the race dates (`js/app.js:25045`), publishes `weekSteps` (`js/app.js:25116`), and the server bounds and stores the accepted total (`server/src/index.js:1633` to `server/src/index.js:1661`). The board reads `week_steps` (`server/src/index.js:3187`). Current-week totals are monotone with a ceiling of 100,000 per elapsed UTC day (`server/src/index.js:1413`, `server/src/index.js:1653`). For example, a day-one claim of 20,000 with an earlier accepted 10,000 remains 20,000. The ordinary 20,000-step reward threshold is not a weekly ceiling. However, a previous-week submission is capped at its already stored value using `Math.min(claimedSteps, frozen)` at line 1646. Thus 15,000 real steps uploaded late against a stored 10,000 cannot add the missing 5,000 to that race, and a smaller previous-week submission can lower the accepted pair. Departing stored totals are archived for settlement at lines 1673 onward. This is an explicit anti-retroactive rule, not evidence that ordinary current-week earnings are accidentally clamped. Whether genuine late Health uploads should count requires Tom's race-settlement policy decision. Source read only; no selected PURE audit proves the late-upload outcome end to end. Proposed browser follow-up: controlled current/previous-week submissions, inspect accepted totals and archived settlement, and compare the rendered board. Do not silently relax the cap.
- **Currency history:** Apparent bare coin updates are not automatically missing history rows. `currencyRecorder` (`js/db.js:516`) records the delta alongside the balance, and claim/pay/update primitives invoke it at `js/db.js:649`, `js/db.js:743`, `js/db.js:835`, `js/db.js:879`, `js/db.js:926`. Export checks balance/history equality at `js/db.js:1402`. The selected revision and merge audits pass. No concrete unmatched balance/history write was established in the scoped paths. This does not excuse missing whole rewards in the findings above.
- **Crate and egg destruction:** `openCrate` stages its hand before `takeAndPay` (`js/loot.js:2481`, `js/loot.js:2575`); `hatchEgg` pays the pet in the egg-take transaction (`js/loot.js:1221`). The take-and-pay audit covers crash and retry boundaries. The known gear-melt deviation in `docs/CLAIMS.md` is excluded as requested.
- **Breeding, pet destruction and Laboratory:** Breeding uses a fresh atomic snapshot and quote comparison (`js/loot.js:1324`), and the Laboratory explicitly discloses permanent consumption and requires confirmation (`js/app.js:21712`, `js/app.js:21952`). The listed loss-disclosure and Laboratory fault audits pass. These intentional, confirmed sinks are not newly classified as an unconfirmed deletion. Pet stats disclose the 1.5x cap and a lineage rank that adds zero combat stats (`js/pets.js:191` to `js/pets.js:209`), so the cap alone is not a false promise.
- **Rack, Shop and Kitchen:** Rack persists the purchase receipt with the debit and has a paid-but-ungranted recovery branch (`js/loot.js:548` to `js/loot.js:578`). Shop commits debit and consumable together (`js/loot.js:2579`). Kitchen collects dishes atomically (`js/cooking.js:404`), refunds cancellation ingredients in the same update (`js/cooking.js:440`), and requires two taps to toss or cancel (`js/app.js:8738` to `js/app.js:8754`). The corresponding Node audits pass.
- **Egg thresholds:** The 14,000-step rule earns an egg (`js/game.js:789`, `js/game.js:852`); the 8,000-step goal incubates it (`js/loot.js:1051`, `js/loot.js:1087`). These are different stages, not a numerical contradiction. Exercise minutes also contribute to incubation, capped at 60 minutes per day (`js/loot.js:1068` to `js/loot.js:1077`). Manual walks deliberately do not write verified steps (`js/wellness.js:96` to `js/wellness.js:104`). The already recorded no-Health egg-access issue in `docs/BUGS-v580.md:26` is not relisted as a new discovery.
- **Incoming gifts and cheers:** Incoming grants use an atomic reward receipt (`js/social.js:1281` onward), covered by `take-and-pay-audit`'s `BASELINE grant: receipt and payout commit together, retry pays once`. Cheers are routed to rewardless notices (`js/app.js:24886`); they are not missing coin payouts. The outgoing paid-gift gap is separate.
