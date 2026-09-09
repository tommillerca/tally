Do not build the pure Boneyard offering: it asks players to surrender weeks of earned currency for a payment receipt, with no credible reason to repeat it.

# Boneyard offering critique

2026-09-09. Advisory review, documentation only.

## Evidence boundary and source mismatch

The frozen work order's file matches SHA256 `8a77c7069ac9dc589f2ba1249a2f38915a6c16c59840474b9d0835584b49653b`. All app and documentation sources below were read in this checkout, at HEAD `084bf82698287eb5245064ae9f74e951f80087f4`. No original checkout was edited.

**The supplied description of the store plan is stale here.** [PLAN-the-store.md](../PLAN-the-store.md), now v2, no longer ranks the offering second. Sections 8 and 9 instead propose merchandise breadth and decorated social deliveries, and explicitly question ceremonies designed to absorb balances. This review judges the frozen 1,000 / 5,000 / 10,000 offering exactly as requested. It does not treat the revised store plan's alternatives as shipped features or silently substitute them for that offering.

Evidence consists of the [brand deck](../brand/boneheadz-brand-deck.html), app source, and the store plan's documented economy measurements. The flow arithmetic below was recalculated, but its quest-board means and saturated-crate simulation are inherited measurements, not fresh runtime measurements. Tom's 30,450 coins at level 56 is a supplied observation; his save, ownership and transaction history were not available. No live player research, telemetry or browser playtest was performed. Demand judgments and proposed prices are hypotheses, not conversion findings.

## 1. Who buys 10,000 coins' worth of nothing?

I cannot name a plausible repeat buyer for this exact product.

The strongest hypothetical candidate is a veteran collector who already owns the clothes they want, has their preferred pet and accessories, and has stopped finding appealing purchases. They are short of a reason to care about their collection, a new way to express themselves, or recognition of something they actually did. A coin shower and a private dated debit satisfy none of those needs reliably. Having spare money establishes ability to pay, not desire.

Tom is the only concrete wallet in the brief. We do not know that he has exhausted the shop, and his stated reaction is disbelief in the purchase. He is evidence against assuming that a large balance creates this demand, not a validated buyer persona.

For that wallet, 10,000 is **32.8% of the balance**. At the modeled income it represents **18.6 to 23.3 days of gross earnings**, or **42.9 to 80.7 days of surplus after the stated shopping**. Its opportunity cost includes five 2,000-coin looks or much of the current 16,800 football kit. Coins represent accumulated effort even without assigning them a cash exchange rate.

A role-player could enjoy one absurd funeral for their money. A completionist might buy each denomination once. Neither explains indefinite repetition: the second entry records another payment, with no new occasion, audience, possession or achievement. The 10,000 tier is especially weak because it removes ten times as much as 1,000 without a defined additional benefit. Lowering the price could sell a joke; it would not establish a recurring economic instrument.

## 2. Does it belong in the Boneyard?

The existing Boneyard is **the real neighborhood turned into a skeleton scavenging and combat map**. The introduction in [app.js](../../js/app.js), `renderBoneyard`, tells players to walk within collection range. [hunt.js](../../js/hunt.js) implements a 75 m collection radius, five slots per cell and staggered 45-minute relocation. Finds include resources and crates. [poi.js](../../js/poi.js) implements dens and the Glutton; [wanderer.js](../../js/wanderer.js) supplies a moving encounter. [spires.js](../../js/spires.js) implements territory claimed by walking, with server-confirmed ownership, tribute and a quest bonus.

Its meaning is: go somewhere, find something, overcome something, bring something home. A stationary menu that destroys coins has no relationship to a walk, encounter, place or history. Cemetery imagery alone does not make it belong. As specified, this is a sink attached to a convenient spooky name.

**There is no implemented player memorial book in the inspected app.** The notable memorial reference in [changelog.js](../../js/changelog.js), entry 230, commemorates Wretched Goblin, Tom's lost level-27 account. That is a specific character and history worth remembering, not a reusable book system or evidence of demand for paid remembrance. Account recovery must remain separate from cosmetic purchases.

The brand deck reinforces the distinction: spooky-cute, warm, effort-celebrating, with restrained effects and Cam's art as the focus. A cheerful keepsake of a first boss victory fits. Asking players to dispose of their effort for a generic shower has the costume of the brand without its emotional purpose. A solemn death cult treatment would fit even less well.

## 3. The adjacent product worth testing

**An earned Boneyard field record, with optional permanent presentation styles.** The event earns the memory; coins buy how it looks.

Name the prospective buyer: a walker who has just beaten the Glutton for the first time, likes their current Bonehead outfit, and wants to show a friend what happened. They have an accomplishment, but no attractive keepsake combining that event, date and character. A previewable poster answers a specific desire that the pure offering misses.

Proposed experience:

1. A qualifying first victory creates a free dated entry with the character's name, encounter and current outfit. Reading it, keeping it and basic export are free. No paid requirement to register the achievement or preserve an account.
2. Offer an optional **1,000-coin permanent graphic frame**, usable on all compatible entries. A more elaborate **3,000-coin multi-entry layout** is a later test, not an assumed product. Preview the actual result before charging; reapplication and export remain free.
3. Let players voluntarily export the card or select an entry on a profile. Free and paid presentations have identical sharing access and placement. Payment buys neither a title nor a bigger marker, map occupancy, ranking, progression, reward multiplier or combat capability.
4. New earned events make the record meaningful over time. New presentation designs may create future purchases, but repeatedly using an owned style does not incur another fee.

The current `bossfirst-glutton` receipt in `claimGluttonWin` and `bossfirst` rows in `claimDenWin` supply possible event provenance. Landmark first-clear markers are keyed by week, so they must not all be relabeled lifetime first victories. Historical outfit snapshots are not established by those receipts. Start prospective capture, and backfill only facts supported by retained records; do not fabricate an old portrait or visit date.

**Cam art:** no new Cam drawings for a first typography, ink-border and palette treatment using existing character/encounter assets. Layout, asset-fit checks, persistent records, compositor/export and profile support still require engineering. Bespoke gravestones, illustrated borders, new poses or painted scenes **require new Cam art**. The book and these presentation surfaces are proposals, not existing infrastructure. Existing friend profiles and Paddock visits in `app.js` show a social context, not an implemented achievement gallery.

This is a better product hypothesis, not a proven buyer or a five-figure wallet solution. First compare a concrete 1,000-coin preview against keeping the coins and an actual shop alternative with veteran players. If they prefer the free record, keep the record free and stop the paid extension. Do not build a gallery just to rescue the rejected offering.

## 4. What else absorbs a five-figure wallet?

Ranked by credible player value and usefulness within the art constraint. These are alternatives for a future work order, not application changes authorized here.

| Rank | Alternative and purchase motive | Wallet effect and limit | Cam dependency |
|---|---|---|---|
| 1 | Make existing desirable cosmetics easy to buy: ownership-aware browsing, compatible previews, coherent outfits and consistent prices. A collector buys a look they actually want. | Real stock can absorb five figures now: the current full football kit is 16,800; all ten Puffer pieces total 22,500. These are finite and only useful if wanted and unowned. Do not bill again for earned appearances. | **No new art** for existing products and merchandising. |
| 2 | Permanent personal display collections using existing pets/backgrounds and genuinely distinct layouts. A pet collector buys a field or gallery they enjoy looking at and showing friends. | Test individual 1,000 to 3,000 styles first. A later 10,000 bundle needs real constituent products and an ownership-adjusted quote. Do not invent a 30,000 bundle before enough desirable content exists. Finite ownership remains finite. | **No new art** for validated layout reuse. New furniture, scenes and fitted accessories **need Cam**. Rendering and social persistence are new work. |
| 3 | Earned field records with optional frames, as above. | Stronger meaning than a payment log, but 1,000 to 3,000 occasional purchases cannot be forecast to empty 30,450. Retained styles reduce repeat spending. | Initial graphic treatments **no new art**; illustration **needs Cam**. |
| 4 | Decorated congratulations delivered to an existing friend, priced around 100 to 300, with a retained replayable card. The buyer celebrates somebody else's real milestone. | Actual occasion and recipient give repeat purchases a reason. At 250, absorbing the modeled monthly surplus requires about **15 to 28 paid deliveries per player per month**. That frequency is unproven; do not make it the balancing assumption. | Existing art and simple graphic treatments **no new art**. Bespoke animated characters **need Cam**; delivery/recovery requires client/server work. |
| 5 | Future original cosmetic collections, commissioned after identifying which category players want. | Can renew demand and support five-figure collection purchases. Cannot promise an endless catalogue with a fixed art budget. | **New Cam art required**, with capacity agreed before a release cadence. |
| 6 | Pure offering at 1,000 / 5,000 / 10,000. | Unlimited theoretical capacity multiplied by unknown, likely low participation. Reject it. | **No new art** assumed; still needs ceremony, book, purchase and restore work. |

Rank 1 requires price correction as well as better placement: `RACK_POOLS` currently charges 6,000 for fish hats also available for 1,500 in `DROP`, in [loot.js](../../js/loot.js). Inflated prices for identical art are not a healthy sink. Current prices above are source facts, not endorsements of every price or predictions that Tom wants those items.

Existing coin gifts transfer currency to another player, so they do not remove it from the economy. Free cheers should remain free, with paid decoration using the same social reach and limits. Paid rerolls can consume 31,000 in five paid rolls but buy no guaranteed item; that is not a satisfying 30,000 product. Vigor, combat pets, ingredients and laboratory capacity are excluded from recommended sinks because they buy power, inputs or progression. Every proposed paid product here is cosmetic-only.

## 5. Faucet problem or missing sinks?

**The evidence supports weak spending demand plus a potentially excessive mature-player faucet. It does not establish that every player's income needs cutting.** A voluntary dump cannot reliably fix either problem.

Recalculation of [the store plan, section 4](../PLAN-the-store.md): daily opening, about 8,000 steps, two daily quests, two weekly quests, one monthly quest, three repeat Champion wins per day and two coin piles. Five Common and four Bone Crates per week are a combined supply budget, not additional crates on top of separately counted quest/wheel rewards. The endpoints use base crate coins versus the inherited fully saturated inventory simulation.

| Component | Coins/day |
|---|---:|
| Quest means scaled to that completion pattern | 169.75 |
| Wheel direct expected payout | 33.79 |
| 8,000-step milestones | 50.00 |
| Three repeat Champion wins at 40 | 120.00 |
| Two coin piles at 12 | 24.00 |
| Crates: base-only / saturated sample | 31.43 / 140.51 |
| Gross, using the plan's retained totals | **428.97 / 538.06** |
| One 2,000 cosmetic and three 45-coin forages per week | **305.00 spent/day** |
| Net | **+123.97 / +233.06** |
| Net per 30 days | **+3,719.10 / +6,991.80** |

Displayed components are rounded independently. Forage is a modeled current habit, not an approved cosmetic sink. Removing that paid power input without replacement spending increases net accumulation by **19.29/day**. Sources for the underlying paths include `STEP_MILESTONES` in [game.js](../../js/game.js), `CHAMPION` in [pit.js](../../js/pit.js), [quests.js](../../js/quests.js), [wheel.js](../../js/wheel.js), and `openCrate` in [loot.js](../../js/loot.js).

Three implications change the diagnosis:

* **Desirable spending matters as much as faucet size.** At one 4,000-coin cosmetic per week, retaining the same forage habit, net becomes **-161.74 to -52.65/day**. The same modeled player runs down savings. A universal cut justified by the cheaper basket would punish this player and lighter earners. The unknown is whether players find enough 4,000 coins' worth of desirable purchases each week, not whether such prices can be typed into a catalogue.
* **Collection saturation increases income while reducing purchase needs.** The inherited sample yields 59.014 per Common and 172.132 per Bone Crate, versus base means of 30 and 17.5. The same weekly budget adds `(5 × 29.014 + 4 × 154.632) / 7 = 109.09` coins/day from the modeled duplicate effect, about **3,273 per 30 days**. That explains about 47% of the upper endpoint's surplus. `openCrate` confirms duplicate compensation is additional coins. This is a more specific faucet candidate than reducing walking rewards for everyone.
* **Outliers have substantial extra sources.** The server's `STEP_RACE_PODIUM` pays 5,000 to the winner and 10,000 across a full five-place podium per settlement, not per participant. Three maintained base-level Spires can supply 180 coins/day before level bonuses, plus up to 15% quest coins. Neither is in the baseline. Levels 2 through 56 would supply **9,075 direct coins** under today's `levelCoins` formula, excluding crates. Refunds and grants can also swell a balance. None reconstructs Tom's actual history.

Holding the modeled 305/day spending fixed would require a blanket gross-income reduction of **28.9% to 43.3%** to stop growth. That is arithmetic, not a recommended cut. Even eliminating the wheel's entire 33.79 direct expectation leaves substantial surplus. Moving duplicate compensation wholesale to dust would merely create a second balancing problem and change the reward's value.

A 10,000 offering once a month would need roughly **37% to 70% of the modeled cohort buying every month** to offset its average surplus, assuming buyers otherwise have the same flows and no displaced shop spending. Nothing in the proposal supports that participation. Small social purchases also cannot be assumed to reach the required frequency.

**Recommended economic response:** preserve existing balances and owed compensation; improve actual cosmetic choice first; measure recurring inflows by source and inventory saturation alongside wanted, affordable, unowned stock and voluntary spending. Separate ordinary earners, collectors, race winners and exceptional refunds. If collectors still accumulate without desired purchases, simulate prospective adjustments to duplicate cash and repeatable endgame income before changing rates. Preserve earned items and already owed rewards, and avoid reducing basic health-effort recognition to finance the shop. No new Cam art is required for measurement or faucet tuning.

There is no requirement that every finite collection be matched by an infinite appetite for purchases. A large wallet is acceptable when a player is content. Persistent unwanted currency calls for better products or calibrated issuance, not an obligation to perform meaningless disposal.

## Scope and independent-review handoff

Only `docs/reviews/boneyard-critique.md` is added. No application code, prices, balances, assets or source plan were changed. No commit, push, PR, publication or external messages were attempted. No denied or blocked action prevents this deliverable.

No implementation deviation is required to complete this documentation order. Two premise mismatches are explicitly reported above: the store plan has been revised, and a player memorial book is not implemented. The proposed earned record deliberately changes the rejected product's benefit and requires new infrastructure; it is advisory, not a silent implementation substitution or authorization to build it.

Agreed proof command: `test -f docs/reviews/boneyard-critique.md`. This proves file existence only, not factual accuracy or player demand. The final changes remain available for independent review.
