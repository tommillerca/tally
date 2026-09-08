# The Laboratory: build specification

Current odds ruling, 2026-09-08: [LAB-RISK.md](LAB-RISK.md) supersedes the earlier protection and final-gamble rules. Both lower recipes are always 50/50; Toxic + Rose guarantees Midnight. Earlier pace and final-failure discussions below are historical, not current behavior.

Specification only, 2026-09-08. Application implementation is outside this work order. Read in precedence order: the frozen final rulings, [V4](PRIOR-V4.md), [V3](PRIOR-V3.md), [V2](PRIOR-V2.md), [V1](PRIOR-V1.md). Historical recommendations lose to the final rulings. Source links below resolve within this checkout.

Frozen work order SHA256 verified: `546e432e56cbc945839a5e935559f59b88b3ac5593cf77ce2c242744380d0670`.

## 1. Contract and evidence gaps

The room is **The Laboratory**. Its destructive action is **Animate**. Every recipe consumes two distinct instances of the same species and creates one fresh instance of that species. Both originals are permanently destroyed, including on a Toxic result. There is no retained parent, hybrid, starter grant, one-input recipe or cheaper lower-tier exception.

The six colours are Base, Ember, Frost, Toxic, Rose and Midnight, across C1-C6: 36 current collection cells. Colours are cosmetic. Trained ordinary pets remain eligible with escalating warnings. CX and shiny instances are never eligible. One daily experiment is free; permanent incubators add slots 2 and 3. The first two recipes always roll 50/50, regardless of collection or ingredient stock. Toxic + Rose always returns Midnight. Repeated lower-tier colours are intentional; there is no pity timer.

New eggs supply Base with the existing shiny exception. Egg faucets, species selection, incubation, salvage and breeding keep their existing rules. Week one introduces species discovery and the recipe path. It promises neither a colour nor a usable pair. Onboarding, Today discovery and room explanations ship with the bench.

### Discrepancies to carry into independent review

| Finding | Required treatment and proposed deviation |
|---|---|
| The locked accepted pace is daily median 122 days / P90 161, casual 393 / 558. V4 actually measures these figures for retaining a parent in the first two recipes and consuming both only on the final recipe. Its Appendix A `finalBoth` changes the final subtraction only. | Preserve these numbers as Tom's accepted chase reference, **not a verified forecast for this specification**. Preserve consume-both at every tier. Proposed evidence deviation: withhold a matching pace claim until that exact model is rerun. Do not redesign to meet 90 days or silently port V4's lower-tier retention. No replacement calendar estimate is asserted here. |
| The final work order says Rose art was generated for all six species. This checkout lacks all six runtime `assets/bh/C/morph/C1__rose.png` through `C6__rose.png` files. Only [C3__Rose.png](pet-colorways-v3/C3__Rose.png), a reference image, was found by a case-insensitive search including ignored files. The generator still has four named palettes. | Art integration is blocked on the approved six files. Proposed deviation: obtain/copy those exact approved outputs into this checkout before feature exposure. Do not regenerate or substitute an unapproved palette, rename the C3 reference as a runtime asset, or edit another checkout. This specification generates no art. |
| A local IndexedDB transaction cannot enforce one shared daily quota or exclusive consumption on two independently offline devices. A destructive replacement restore can also rewind local history. | Section 6 specifies local enforcement and conflict refusal. That is explicitly a proposed scope interpretation, not proof of strict account-wide enforcement. If the cap is strictly account-wide, release requires shared authority or exclusive device reservations, with a separately reviewed authority protocol. Do not claim that merge conflict detection prevents an experiment already performed offline. |
| An old offline client can mint an unversioned coloured egg after rollout. A local format marker cannot establish a universal grant cutoff. | Proposed rollout exception: honour such already-minted rows on import, enforce Base-only for upgraded grant paths. A strict universal cutoff requires compatible grant authority. No confiscation or timestamp-based relabelling. |

These gaps do not prevent writing the specification. Art availability and any stronger authority requirement are release blockers. The locked consumption, recipes, warnings and unbounded final gamble remain unchanged.

## 2. Source map and data model

| Checkout source | Future work |
|---|---|
| [js/pets.js](../js/pets.js), `MORPHS`, `MORPH_TIER`, `MORPH_WEIGHT`, `MORPH_LABEL`, `isMorph`, `morphAsset`, `ownedPairs`, `ownedCellCount` | Add Rose and six-column accounting; provide pure recipe eligibility, distribution and branch-preview helpers, either here or in a dedicated pure Laboratory module. |
| [js/loot.js](../js/loot.js), `eggRow`, `hatchEgg`, `petInstancePay`, instance/bank helpers | Base-only new grants; transactional Animate and incubator APIs. Extract shared instance construction without invoking a separate mint transaction. |
| [js/db.js](../js/db.js), `atomic`, `payAtomic`, `takeAndPay`, `claimDay`, `importAll` | Extend the existing atomic seam for a live multi-key decision, classify all new keys, preserve transaction closure on restore. |
| [js/game.js](../js/game.js), `rememberPitWin`, `finishPitWin` | Recovery precedent: durable identity/result and receipt, independent of presentation. Do not use the Pit's multi-step recovery to split pet destruction from output creation. |
| [js/app.js](../js/app.js), active `renderToday`, Stable/Collection, `[data-destroy]`, `rollDayIfNeeded` | Navigation, picker, confirmation, reveal, recovery, three-sink choice and introduction. Keep retired `outThereHtml` unreachable. |
| [js/save-disclosure.js](../js/save-disclosure.js), `interruptionCopy`; [js/app.js](../js/app.js), `.rk-clock` | Copy precedent: name what happened, what is saved and the next action. The shop says “New rack in”; Laboratory must name its own reset. |

### Morph and egg policy

```text
MORPHS      = ['base', 'ember', 'frost', 'toxic', 'rose', 'midnight']
MORPH_TIER  = {base:0, ember:1, frost:1, toxic:2, rose:2, midnight:3}
MORPH_WEIGHT= {base:40, ember:22, frost:22, toxic:10, rose:10, midnight:4}
MORPH_LABEL gains rose:'Rose'; Base displays 'Base' in Laboratory UI.
```

Keep the existing blank Base label where other renderers need it. Rose follows Toxic at equal tier. Do not turn morph weights or tiers into species rarity, combat bonuses, dust value or a global Laboratory pool. `MORPH_ART` stays C1-C6; CX remains excluded. All grid denominators derive from species count times `MORPHS.length`, never literal 30. Include Rose in egg tint/render lookup for valid legacy rows, collection filters, ordering, counts and all shared pet rendering consumers. Shiny presentation keeps priority over morph presentation.

`eggRow(source, goal)` must assign `morph:'base', morphPolicy:'lab-final-v1'` directly. Remove its ownership read and `rollMorph` call. Retain ID creation, grant source, timestamp, effective-step anchor and `goal`, including ready `goal:0`. No substitute RNG call is needed at grant. `rollMorph` remains a pure legacy weighted helper for compatibility with old tests/data tooling, with Rose included in its general table; it is **not callable from any new reward/grant path**. Mark that restriction in its contract and audit its callers. The Laboratory uses a separate species-local recipe resolver.

At hatch preserve the unconditional shiny draw, then actual `pickRandomPet`, then the existing `SHINY_ART` gate and stored-morph selection. `SHINY_CHANCE` stays 0.03 for C1-C5 and C6 remains excluded. No new morph roll at hatch. A mature uniform pool is 2.5% shiny overall; do not label every hatch a 3% chance independent of species. The hatch action continues to consume its egg and create the pet through `takeAndPay`.

Audit all routes through `grantEgg`/`eggRow`: welcome, health milestones and level rewards in game, weekly dust egg, quests, hunt/map/POI, social grants and legacy egg conversion. Random/direct pet grants and shop defaults stay Base; breeding preserves the keeper's colour. Laboratory results do not pass through `rollMorph` or a random grant pool.

### Durable keys and exact record shapes

Use additive versioned KV records, not a second pet store. Names below are the implementation contract, not keys already shipped. Timestamps are diagnostics, never authority for odds or quota.

```text
labV = 1
labExperiments = {
  [opId]: {
    format:1, opId, rules:'lab-final-v1', day:'YYYY-MM-DD',
    slot:1|2|3, committedAt:number, zone:string,
    recipe:'base-base'|'ember-frost'|'toxic-rose', species:'C1'..'C6',
    inputs:[{iid, sp, morph, shiny:false, lineage, bankedSteps, level,
             nickname, bond, talents, equipped}, {same fields}],
    distribution:[{morph, weight}], protection:'collection'|'ingredient'|'none'|'exempt',
    beforeCells:[cellKey], branches:[{morph, lost:[cellKey], gained:[cellKey], afterCount}],
    result:{iid, sp, morph, shiny:false, lineage:0, hatchedAtSteps:number},
    equippedBefore:string|null, equippedAfter:string|null
  }
}
labDaily = { [day]: {slots:{'1':opId, '2':opId, '3':opId}, used:number} }
labIncubators = {
  [slotString]: {format:1, slot:2|3, opId, price:20000|40000,
                 purchasedAt:number, currencyReceipt:string}
}
labIntents = { [opId]: {format:1, quote, acknowledgedRisk, createdAt:number} }
labSeen = [opId]                         // presentation acknowledgement only
labUi = {format:1, introRead:boolean, todayHidden:boolean, revision:number}
```

Missing keys initialize to version 1 and empty maps/arrays, `labUi` booleans false, revision 0. Slot 1 is implicit and cannot be sold or removed. `labDaily` is a transactionally maintained projection of unique experiment receipts, not an independent resettable entitlement. Missing map slot properties mean unused; `used` equals occupied slots. Capacity is `1 + number of valid sequential purchased slots`, never a field accepted from a UI request. Retain experiment, purchase and day receipts without a fixed-length truncation while stale saves can return. `labSeen` is unioned; acknowledgement never deletes a result receipt. Private nicknames remain local/account-private and must not enter public pet payloads or analytics.

Inputs normalize only absent, null or empty-string legacy morphs to Base for eligibility. Unknown non-empty strings and wrong types are rejected without rewriting the stored row. Validate IID uniqueness in the entire live roster, supported species and finite valid investment metadata; an ambiguous duplicate IID requires the existing healer and a fresh quote before spending. Eligibility does not mean safe to recommend.

The new instance uses the existing IID scheme, must differ from both inputs and every existing/taken IID, and has same species, chosen morph, non-shiny, lineage 0, level-bank entry 0, no nickname, bond or instance talent selections. Its anchor is the quoted settled effective-step meter. No parental investment transfers. `petLvlV` and `pettalents.__iidV` retain their current migrated formats. Species wardrobe, cosmetic ownership, history and other instances' metadata remain owned. No XP, dust, coins, egg, buff, training or breed-credit award accompanies Animate.

## 3. Recipes, odds and collection preview

Only three of the 21 unordered same-species morph pairs are legal:

| Pair, both consumed | Output, always | Protection |
|---|---|---|
| Base + Base | Ember 22/44, Frost 22/44 | None |
| Ember + Frost | Toxic 10/20, Rose 10/20 | None |
| Toxic + Rose | Midnight 4/4 | None; intrinsic certainty |

Every other pair is invalid, including Toxic + Toxic and every Midnight input. Cross-species, repeated IID, shiny and CX pairs are invalid regardless of colours. There is no chosen-output control, no Base output and no shiny output. Use exact weights internally. Display 50% for each lower outcome and 100% Midnight. Midnight is certain and gets no fake gamble animation.

Collection ownership, ingredient stock, training, other species and prior results never filter either lower recipe. A player can roll three Frost before their first Ember. There is no ordered protection table. Keepers and spares remain useful advice for preserving collection cells, never an odds rule. Shiny Base may be a collection keeper but cannot be feedstock. Manual last-copy and trained inputs stay eligible with the same severe warnings.

Toxic + Rose consumes both inputs and always creates a fresh level-1 Midnight, whether Midnight is missing or already owned. No outcome RNG draw is needed. No paid reroll, refund or automatic salvage is added.

For every supported output with nonzero probability, calculate `after = liveRoster minus both selected IIDs plus one fresh output`; compare whole current cell sets. Display exact lost cells, newly gained cells, duplicate status, resulting total cells and affected cell counts. For two final Base copies, Base is lost in both branches. For a last Toxic plus last Rose, Toxic result loses Rose; Midnight result loses Toxic and Rose and gains Midnight if previously missing. The Toxic identity and training are lost even when its colour remains. No “last copy” check made separately on each input is sufficient.

Construction evidence for the locked graph, not a new pacing target: with matched plain Base stock and a policy retaining every cell, V3's accounting is `11 + 4K` experiments and `17 + 4K` initial Bases per species, where K is the geometric final-attempt count at 2/7. First-attempt success costs 15 uses and 21 Bases; each final miss adds four uses and four Bases. Mean across six species is 150 uses and 186 matched Bases. No finite stock or date guarantees success. These identities explain why V4's cheaper model cannot certify the accepted calendar figures; do not substitute V3's different arrival scenarios for a measured daily/casual forecast.

## 4. One atomic Animate transaction

The shipped Shop's `buyShopItem` puts its coin debit, revision and goods inside `payAtomic`. Hatch puts its egg take and pet mint inside `takeAndPay`. Pit persists a decided win and recovers it by receipt. Reuse these v517 seams and failure reporting. Never call `salvageInstance` twice and then `addPetInstance`, and never mint in a reveal callback.

### Live snapshot capability required in the existing seam

Current `payAtomic({kv, puts, dels})` callbacks each receive one key; `undefined` skips only that write. It does not currently expose a coherent multi-key decision callback. Implement an additive snapshot/planner option in the same internal `atomic` body, available to `payAtomic` and `takeAndPay`, rather than a separate Laboratory database implementation:

```text
payAtomic({
  readKv: [declared keys],
  readAll: ['health', 'inv'],             // Animate only; purchases omit these
  prepare(snapshot): {kv: {key: synchronousUpdater}, puts:[], dels:[]}
})
```

The read lists declare `kv` and each `readAll` store in the transaction scope. Queue each KV get and each declared store's `getAll()` in one `readwrite` transaction, then call `prepare` synchronously from the final read's success callback with `{kv:{key:value}, all:{store:rows}}`. It may only read the snapshot and synchronous inputs; no await, fetch, timer, promise or nested DB call. Its returned payload is dispatched before that callback returns, inside the same transaction and through existing `currencyRecorder`, delete-receipt, write-failure and store-invalidation machinery. Any future non-KV writes must declare their stores before opening the transaction. Existing call shapes and return values stay compatible. A thrown tagged refusal aborts the whole transaction; a storage exception is reported as a failure. The function resolves only on `oncomplete`.

Use a closure for the committed return value, released to the caller only after the promise resolves. The replay branch returns an empty write payload and the stored receipt. Never depend on object property iteration order to collect one key's value for another updater, and never implement validation as an `undefined` return that lets sibling mutations commit.

### Quote, validate, commit

1. Before presenting a quote, complete existing instance/bank/talent migrations and settle equipped training progress. Read a coherent snapshot for the quote. It includes selected instance data, both investments, selected species counts, exact distribution and every branch preview, current day/capacity/slot occupancy, equipment and relevant training credit. Nothing is preselected. The quote has a fresh operation UUID and a rules version. A persisted `labIntents[opId]` stores the confirmed request only, with no pet, use or currency effect. It permits reconnecting an interrupted UI to a receipt.
2. The UI handler awaits `rollDayIfNeeded()` before calling the action. Inside the transaction recompute the local `dateKey()` and apply section 6's day validation. The selected day must equal the quote day. A quote spanning midnight is refused and refreshed for explicit confirmation, even if the new day has capacity. A retry of an already committed opId returns its receipt before date, cap or input checks, including tomorrow and after the result was later consumed.
3. Read `petInst`, `petTaken`, `pets`, `looks`, `petLvlSteps`, `petLvlV`, `petNick`, `petBonds`, `pettalents`, `petEquipped`, `equipped`, `petStepCredit`, `labV`, `labIntents`, `labExperiments`, `labDaily`, `labIncubators`, `dayHighWater` and `dayWitnessOrd` inside that transaction. Also read `health` and `inv` there. Recompute the effective-step meter using `lifetimeStepsSum`'s existing formula from those health rows; it must equal the settled quote meter/checkpoint. Verify the surviving species cosmetic ownership against the live inv rows, including legacy row IDs. Changed health/ownership requires settling or repair and a fresh quote, so pre-experiment steps cannot become the result's training. Revalidate the two distinct live IIDs, all eligibility, investment/equipment facts, rules version, selected-species counts, branch consequences and exact odds against the acknowledged quote. Validate normalized data rather than permissive truthy fallbacks. An opId reused with different request contents is a refusal, not a replay.
4. Rebuild/check the day projection against committed receipts. Require the quoted available capacity and occupancy still match, then allocate the lowest unused owned slot. Any other tab's experiment, purchase or selected-pet mutation that changes the quote produces `stale-quote`. An unchanged malformed projection is a repair/refusal state, never free capacity. No output roll occurs until all validations pass.
5. Draw the output once using a crypto random sample in `[0,1)`, with exact weight boundaries (for example Uint32 divided by `2**32`). A singleton distribution needs no draw. Create a unique fresh IID and receipt from the live snapshot. Only the committed receipt makes that draw an outcome. An aborted, never-presented transaction has no saved result and no spent inputs; reviewing again is safe. Do not show a provisional roll before commit.
6. Dispatch the complete mutation set below. Any error at any write aborts everything, including the counter, day advancement and result. No success toast, reveal or input-removal animation before commit confirmation.
7. After commit invalidate/read the UI state and present the stored receipt. Presentation acknowledgement only adds opId to `labSeen`; it cannot grant, refund, remove or reroll anything. Failure to acknowledge may repeat a reveal but must not repeat the experiment.

| Key | Mutation in the one transaction |
|---|---|
| `petInst` | Remove exactly both input IIDs and append exactly one fresh result. Net count decreases by one. Preserve every unrelated row. |
| `petTaken` | Union both consumed IIDs, permanent and uncapped. This is distinct from automatic `invTaken` receipts: these inputs are KV instances. |
| `petLvlSteps` | Delete both input entries, create result IID at 0. |
| `petNick`, `petBonds`, `pettalents` | Delete both input entries; no inherited result entry. Preserve version markers and unrelated entries. |
| `petEquipped`, `equipped` | If an input was equipped, set `petEquipped` to result IID and `equipped.C` to the same species. Otherwise leave both unchanged. Preserve other slots. |
| `petStepCredit` | Preserve the settled quote checkpoint; reject a changed relevant checkpoint. Never award already-walked steps to the fresh result. See sibling-writer requirement below. |
| `pets`, `looks`, species `inv` cosmetic row | Same species survives the transaction, so preserve the existing ownership anchor, looks and cosmetic rows. Do not transiently delete/re-add them, create a second cosmetic row or pay a duplicate reward. Missing/inconsistent ownership is repaired before quoting, followed by a fresh quote; it is not a separate post-destruction task. |
| `labExperiments` | Insert the immutable full receipt under opId. |
| `labDaily` | Record the receipt under its allocated day/slot and increment the validated projection by exactly one. |
| `dayHighWater`, `dayWitnessOrd` | Apply the same accepted advancement/seeding as the day guard, atomically with success; a refusal advances neither here. |
| `labIntents` | Remove this pending intent. Receipt remains sufficient for recovery. |

No `inv` row is taken by Animate; `payAtomic` is therefore the correct entry point. `takeAndPay` stays the shared implementation precedent for egg conversions and future row-authorized operations. Do not infer that a single-row `take` can consume two KV instances.

The safety contract also covers sibling writers. Existing training, nickname, bond and talent helpers contain separate reads/writes, and existing breeding/salvage have cleanup after their primary mutation. A late stale bank write could restore deleted metadata or award pre-experiment steps to the new equipped pet. Before launch, make affected writers validate live IIDs/tombstones and update against live maps in serialized transactions. Equipment/training checkpoint transitions must atomically bind the credited IID, delta, bank and checkpoint. Preserve earned steps on surviving pets. A health refresh that changes a selected pet's bank requires a new warning, even for level-1 partial progress. Do not solve this by making trained pets ineligible. These are necessary integration fixes for a later implementation, not changes made by this document.

### Failure and recovery

Before commit, cancellation, refusal, RNG failure, quota failure or transaction abort leaves both pets and daily use intact. A genuine process death before transaction completion must reopen into either the complete pre-state or complete post-state, never a partial state. After commit, a lost response or a death during reveal finds the exact receipt on boot and exposes “Review result”. Retry returns it without requiring the parents still exist and without recreating a result that was subsequently salvaged or bred. If storage cannot be read, show unknown save status and disable a new attempt until readback establishes receipt presence or absence. Do not say “nothing spent” when the outcome is unknown.

## 5. Migration and restore

Run the Laboratory initializer idempotently after existing pet/bank migrations. Add versioned empty Laboratory state without rewriting pets or existing egg rows. Existing Base, all named colours, shiny, CX, IIDs, training, names, bonds, lineage, equipment and species wardrobe remain owned exactly as before. Old Midnight needs no recipe proof. Preserve already-earned achievements/rewards; the current grid becomes 36 cells with six Rose cells added.

| Egg on upgrade/import | Required result |
|---|---|
| Existing valid stored non-Base morph | Keep row byte-for-byte through migration, including ID, source, timestamp, goal, step anchor and tint. Hatch that stored colour even months later, unless the unchanged shiny override produces shiny Base. Species remains selected at hatch. |
| Missing/null/empty morph | Preserve row; current hatch fallback produces Base. |
| Unknown non-empty morph or wrong type | Preserve raw row for diagnosis. Current hatch fallback remains Base; do not bless unknown values as Laboratory ingredients. |
| Newly granted row on an upgraded client | `morph:'base', morphPolicy:'lab-final-v1'`; no colour roll. |
| Legacy unopened egg representation converted by `migrateLegacyEggs` | If it carries a valid already-rolled morph, copy that morph into the converted egg and mark `morphPolicy:'legacy-preserved'`. Otherwise Base. Take the old row and insert its replacement atomically through `takeAndPay`; never treat conversion as a new colour roll or an extra egg grant. |
| Imported unversioned coloured row, including old offline clients | Grandfather it under the explicitly disclosed rollout exception. Never guess its policy from wall-clock timestamp. |
| Marked `lab-final-v1` row claiming non-Base | Reject import as inconsistent before any writes, retain the original backup for recovery. Do not silently fix it or reroll it. |

Classify `labExperiments`, `labDaily`, `labIncubators`, `labIntents`, `labUi` as validated maps, `labSeen` as an array and `labV` as a number in the restore validator. Validate formats, unique opIds/IIDs, legal recipe/result support, slot range and finite values. Reject future unsupported versions without changing the current save. Export all new fields. Do not rely on generic payload-wins map merging.

For ordinary compatible merges: union immutable experiments by opId; identical copies deduplicate, conflicting contents refuse the complete import. Union purchase entitlement by slot only when receipt identity agrees; distinct purchases of the same slot are a conflict, not two debits or a free second slot. Rebuild `labDaily` from experiment receipts and merged entitlements; different opIds sharing a day/slot, receipts exceeding capacity, or two operations consuming the same IID refuse the complete merge. Union `petTaken` and strip all taken-IID investment metadata, not just the level bank. Preserve result instances that survive and subsequent legitimate tombstones for results that were later consumed. Do not regenerate pets merely because an experiment receipt exists.

Import must verify transaction closure: an experiment has both input tombstones and its result either present or legitimately taken later, with consistent day receipt and cleanup. Restore must not independently select the newer receipt and the older roster. Fail closed on ambiguous partial payloads, preserving both saves for recovery. Merge incubator purchases with their coin history operations using the existing `coinsHistory` machinery; `coinsRev` maximum alone cannot reconcile separate spends. Refuse incompatible histories or a merged negative balance without partial writes.

`labUi` updates increment revision. Merge larger revision; on equal revision, hidden/read true wins. A deliberate “Show Laboratory on Today” increments revision and can unhide; stale backups cannot silently unhide. `labSeen` unions and pending intents never spend automatically on import.

**Replacement restore limitation:** current `importAll({replace:true})` intentionally rolls back ordinary receipts and wallet state except day ceilings. Proposed Laboratory safety deviation: reject a replacement that drops or contradicts any locally known Laboratory experiment/purchase, or revives either consumed input; preserve the current save and explain the conflict. A compatible complete replacement may proceed only after closure and currency validation. Do not silently change replacement semantics for unrelated actions. On an empty/new installation there is no local history to compare, so an old backup still cannot be proven latest. Preventing that replay requires authority, not another local counter. This exception must be reviewed as part of implementation.

## 6. Daily cap, clock and incubators

The local calendar date from `dateKey()` is the day label, not UTC and not 24 hours since the previous experiment. Use the app's `dayOrdinal`, `dayHighWater`, `dayWitnessOrd` and `WITNESS_GRACE` conventions. Keep `claimDay` behavior for existing callers. Extract/reuse its decision as a synchronous helper over the transaction snapshot so Laboratory validation and marker writes occur in its commit. Unlike `claimDay`'s permissive unparseable-key fallback, malformed Laboratory day keys are refused; all normal keys come from `dateKey()`.

At equal high-water date, existing occupied slot receipts decide availability. A later allowed date starts with zero occupied slots for that date; no deletion of prior days, no banking and no reset write from a render. An earlier date is refused even if it has an empty slot. A date beyond the existing witness grace is refused. Never relax that guard or add a Laboratory network call to make the date pass. Existing app connection recovery can refresh its witness.

| Boundary | Behavior |
|---|---|
| Midnight while app stays open, timer has not fired | Animate explicitly awaits `rollDayIfNeeded`; committing service checks date again. Yesterday's quote is invalid. Refresh count/odds and require confirmation. |
| Commit just before midnight, reveal after midnight | Receipt consumes yesterday's slot once. Reveal does not charge today. New confirmation can use today's capacity. |
| Midnight between quote and transaction decision | Abort as stale; no pets/use spent. Day is linearized at the transaction's live decision, never at reveal completion. |
| DST forward/back within same calendar date | No extra use; reset is next local midnight using calendar arithmetic, not `now + 86400000`. |
| Timezone change with same date | Same receipt bucket and use count; redraw reset label in the new zone. |
| Timezone moves date backward | No restored capacity; wait until local date reaches high-water date. At equality, previous receipts still apply. |
| Timezone moves date forward | New local date may become eligible if existing day guard permits. Returning backward cannot spend the old bucket again. This local convention cannot distinguish travel from clock manipulation within witness grace. |
| App resume or day/zone change | Recompute reset and eligibility; invalidate an armed confirmation if date or consequences changed. Do not rewrite the receipt's recorded day/zone. |

`R24-L17` in [tests/unit.test.js](../tests/unit.test.js) must remain green: `commitLogEntry` rolls before a fresh log write, while an edit retains its original date. Add a separate Laboratory boundary guard. Do not repurpose food date state, alter old log receipts or rely solely on the 60-second timer.

Incubator 2 costs **20,000 coins**, incubator 3 costs **40,000 additional coins** (60,000 total), carried forward from V2-V4 as the implementation price choice. The final rulings lock purchasable slots but do not separately ratify these amounts; they are inherited specification details, not measured demand. Slot 2 is prerequisite for slot 3; no fourth slot, level gate, refund/rental, timed queue or hatch-speed effect. Animate itself has no coin fee. Every owned slot uses identical odds.

Show capacity explanation before purchase and enable purchase after one completed experiment, as in V3-V4. A purchase grants its additional use immediately on the purchase day without clearing occupied slots. Buying slot 2 after using slot 1 yields one remaining use; buying slot 3 after two uses yields one. Unused capacity expires without reminders. Hide upgrade recommendations when there is no safe useful stock; the capacity panel remains intentionally accessible.

Purchase uses the same snapshot-enabled `payAtomic`: validate a versioned purchase request/opId, live coins, `coinsRev`, entitlement/prerequisite, prior completed experiment and current catalog price. On replay return the existing entitlement with no debit. In one commit debit coins, increment `coinsRev` by `Math.max(1, price)`, record its actual `coinsHistory` operation ID through the existing currency recorder, and add the once-only slot receipt. The seam must expose that operation ID to the receipt or accept a deterministic caller receipt such as `lab-incubator:<opId>:coins`; do not invent a receipt disconnected from the recorded debit. Preserve daily receipts. Insufficient funds, changed price, duplicate ownership or failed prerequisite abort all siblings. Storage failure cannot leave debit without entitlement. Two tabs buying the same slot must produce one debit and one entitlement.

Local serialized transactions enforce capacity across tabs sharing this database. Compatible restores cannot lower known usage. Strict cross-device offline enforcement remains impossible without the authority decision in section 1. Conflict rejection prevents a corrupt merge; it does not retroactively undo two legitimate-looking local offline actions. No launch claim may exceed this proven scope.

## 7. Screens, interaction states and copy

Use the app's direct, specific register. The interrupted-fight card names the unfinished fight and points to its result. Follow that pattern for experiments; do not imply a failed save when a receipt exists. The shop clock names its rack, so label this clock **“Experiments reset at {time}, {zone}”**, with the local date when needed. Under a clock refusal, replace the ordinary reset promise with the refusal reason and actionable next step.

### Point of choosing the sink

Place these adjacent actions in Stable/Collection management with the owned-pet count, before the user chooses any destructive flow:

| Action | Visible copy |
|---|---|
| Melt spares | “Clear spare pets for Bone Dust. No daily limit.” |
| Breed | “Feed one pet to raise the keeper's lineage. 6,000 progress steps between breeds.” |
| The Laboratory | “Build your colour collection. Two pets of one species become one new pet. Both are consumed.” |

Above them: “Clearing lots of spares? Melt them for Bone Dust. The Laboratory reduces your total by one pet per experiment.” Preserve salvage's existing single-instance interaction; do not promise melt-all. Label a useful intermediate “Needed for {recipe}” in selection/salvage/breeding contexts without blocking either other sink. Show actual combined salvage value of the selected inputs as the dust opportunity cost, with no dust reward attributed to Animate.

### Bench and picker

Bench order: title and persistent back control; concise explanation; current `used/capacity` and correctly named reset; species/collection progress; all three recipe strips; two empty input positions; review action; links to Collection, eggs, Melt spares, Breed and the optional capacity panel. Show all recipe paths even with no ingredients. On each species, show current owned cells and safe available ingredient counts after reserving keepers. Before species selection show baseline odds and “The first two mixes are always 50/50 and can repeat a colour you already have”; never use another species' odds as the quote.

Bench explanation: **“Two pets in. One new pet out. Both inputs are permanently consumed. The new pet starts at level 1.”** Below the recipes: “The first two mixes are always 50/50 coin flips and can repeat a colour you already have. Toxic + Rose guarantees Midnight. Both pets are consumed.” Expanded help gives the three recipes and explains that collection, ingredient stock and previous results never change the odds. Help can collapse after first reading, but live odds and consume-both copy remain visible.

Choosing a slot opens an instance picker with species and colour filters. Sort plain surplus first, then invested/last-copy eligible rows. Never auto-select either instance. Mark safe surplus, “Last collection copy”, “Trained”, “Named”, “Bonded”, “Lineage {n}”, “Equipped”, and “Needed as an ingredient” from real state. For the second slot restrict selectable candidates to supported same-species recipe partners, while explaining why unavailable rows cannot match. Keep shiny and CX visible but disabled with their specific exclusions. Last-copy and trained eligibility cannot be disabled as a safety shortcut. Pair-wide loss is recomputed after both selections.

Each selected card names private nickname plus species name, colour, level, exact banked steps, lineage, bond out of 5, chosen talents and equipped status. Show non-shiny status in details. Clear/change is always available before commit. Show output art, names, current ownership and live probabilities before opening confirmation.

### Confirmation and escalating loss warnings

The first Review action does not spend. It presents both inputs, the exact branch previews and the new-pet defaults, with **Cancel** and **Animate**. Ordinary uninvested surplus requires the separate deliberate second action, following the armed destructive pattern. Changing inputs, closing the sheet or a stale quote clears the armed state.

Always: **“Both pets are permanently consumed. Their training, names, lineage, bonds and talent choices do not transfer. The new pet starts at level 1, with 0 banked steps and lineage 0.”**

Escalate if either pet has positive banked steps (including level 1), nickname, positive lineage, bond, selected talents, equipped status, or any branch loses a currently owned cell. Combine all applicable warnings, never only the highest one. Require the player to type exactly **ANIMATE**, with no prefilled text or enabled confirmation until it matches. Cancel remains available. Typed confirmation never overrides shiny/CX, missing inputs or invalid data.

| Loss | Exact dynamic copy |
|---|---|
| Training | “{name} will be destroyed: level {level}, {steps} banked training steps. None of those steps transfer.” Show each pet separately; level 10's threshold is cumulative 82,000, not an amount to assign to every pet. |
| Name | “The name {nickname} is removed with this pet.” Escape user text as text, not HTML. |
| Lineage and bond | “{name} loses lineage {lineage} and bond {bond}/5. The new pet starts with neither.” |
| Talents | “{name}'s talent choices are removed: {choices}. The new pet inherits none.” |
| Equipped | “{name} is your equipped pet. The new level-1 pet will take its place.” If neither input is equipped, do not suggest an equipment switch. |
| Last collection cell | “If {output} appears ({odds}), these cells become empty: {cells}. New cells: {gains or 'none'}. Collection after: {n}/36.” One row per possible output, based on the whole pair. |
| Final gamble | “Toxic: 71.43%. Midnight: 28.57%. Both selected pets are consumed either way. A Toxic result is a new pet. The selected Rose is gone.” |
| Strong final action | “This cannot be undone. Type ANIMATE to destroy both pets and create one new pet.” |

### Complete state table

| State | Copy and controls |
|---|---|
| Loading | “Opening The Laboratory...” Keep Back available. Resolve into content or an explicit read failure, never a permanent blank screen. |
| Empty roster | “Hatch eggs to discover species. The recipe path is here when you have a pair.” Show all recipes, eggs and Collection. No free starter input. |
| No safe pair | “Keep one of each colour. You need two spare pets of the same species that match a recipe.” Show actual stock, egg progress and manual picker for eligible invested/last copies. |
| Ingredient shortage | “Keep one Toxic and one Rose. You need a spare of each to try for Midnight.” Substitute exact preceding recipe/stock for other shortages. |
| Incomplete/wrong pair | “Choose two pets of the same species that match a recipe.” Review disabled; no use spent. |
| Ineligible | “Shiny pets cannot be used here.” / “The Day One Lizard cannot be used here.” / “This saved colour is not supported.” No override. |
| Ready | “{remaining} experiment(s) available today.” Review pair with current odds and warnings. |
| Outputs already owned | “You own both possible colours. This makes another copy and uses one experiment today.” Add “Needed for {recipe}” when that duplicate is useful feedstock; this never changes its odds. |
| Cap reached | “You've used {used}/{capacity} experiments today. Experiments reset at {time}, {zone}.” Animate disabled; Collection and Melt spares remain exits. Optional eligible upgrade is not the only action. |
| Incubator offer | “Incubator {n}: {price} coins. Adds one experiment each day. It supplies no pets and does not change the odds.” Show current and resulting capacity and today's remaining uses. |
| Cannot afford | “Incubator {n} costs {price} coins. You have {balance}; {shortfall} more needed.” Buy disabled, Back to bench available. Describe the free slot according to its actual used state, never imply a fresh free use. |
| Committing | “Saving your experiment...” Disable duplicate submission and await outcome. Closing/navigation cannot cancel a committed transaction. |
| Reveal, new cell | “{Colour} {species}. Added to your collection. {n}/36.” Show the actual fresh pet and defaults; “View pet” and “Back to Laboratory”. |
| Reveal, duplicate/Toxic miss | “{Colour} {species}. Another copy.” For final miss: “Both inputs were consumed. This is a new Toxic pet. A spare Rose is needed to try again.” Do not celebrate a missing Midnight as completion. |
| Guaranteed reveal | Show the certain output directly, with “Midnight was guaranteed by this recipe.” No fake two-outcome spin. |
| Complete | “All 36 colours owned. Animate copies, melt spares for Bone Dust, or breed to raise lineage.” Room stays available; Today promotion disappears. |
| Stale quote | “Your pets or available experiments changed. Review the updated pair and odds.” No substituted inputs, automatic confirmation or silent purchase. |
| Confirmed abort | “That experiment did not save. Both pets and your experiment are still available.” Only after readback establishes no receipt and unchanged affected state. Retry requires review. |
| Unknown save outcome | “The experiment's save could not be checked. Reopen The Laboratory to review it before trying again.” Disable a new submission until readback. |
| Committed, unseen result | “Your last session ended before you saw your experiment. The result is saved. Open The Laboratory to review it.” Boot/room recovery card keyed by receipt, not repeated global nagging. |
| Clock backwards | “Your device date is before your last experiment day. Check automatic date and time.” Preserve receipts and show the blocked date. |
| Unwitnessed day | “Connect briefly so the app can check today's date, then reopen The Laboratory.” Use existing app recovery; no fabricated reset countdown. |
| Restore conflict | “These saves contain conflicting experiments or incubator purchases. Your current save is unchanged. Keep both backups for recovery.” No automatic deletion or compensation. |
| Missing required art in a development build | Show an explicit unavailable-asset finding and block release. Do not ship Rose rendered as Base. |

Reveal animation is presentation only, skippable, respects reduced motion and never obstructs the saved result. Predecode actual result assets before motion. If decoding fails after a successful experiment, show the saved pet's name/colour and a retry-image control; do not repeat Animate. Use accessible names, focus restoration, keyboard activation, text labels beyond colour, screen-reader status announcements and safe-area layouts. No new video or animation artifact is produced by this specification.

## 8. Onboarding and discoverability

The permanent Stable/Collection entry is available on day one, even when Today promotion is absent. In the ordinary first egg/species-discovery explanation add: **“Hatch eggs to discover species. Keep spare pets of the same species for The Laboratory. Its recipes show the path to new colours.”** Provide a link to the non-destructive recipe overview. Do not gate the visible recipe path on having spare stock, and do not open a forced modal.

The first six retained ordinary species hatches prefer unowned species, so the first ordinary same-species pair cannot arrive before hatch seven in that funnel. A safe Base recipe normally needs three Base copies of one species: one keeper plus the two consumed inputs. Do not suggest that hatch seven universally provides a safe recipe or that a mean egg rate guarantees week-one colour. Existing stock and actual grants may vary individual timing.

Add one compact persistent Today row below the active main daily content, directly in `renderToday`. Do not revive the retired banner stack or `outThereHtml`. V3's eligibility-gated discovery carries forward with consume-both counts:

```text
visible = Today is current
          && account has completed a prior local day
          && !labUi.todayHidden
          && permitted remaining capacity > 0
          && exists safe useful recipe pair
```

Safe means two distinct eligible same-species inputs with no training (including partial bank), nickname, lineage, bond, selected talents or equipped status, and **every possible branch retains every currently owned cell**. Evaluate full pair subtraction, not a loose duplicate count. Three plain Bases qualify; two total Bases do not. Shiny Base keeper plus two ordinary Bases may qualify; shiny plus one ordinary Base cannot supply two inputs. For the middle/final recipes reserve one keeper of each colour plus both consumed spares. Trained stock affects odds but does not make the Today predicate safe.

Useful means at least one supported branch can gain a missing output, or a lower recipe can fill stock below the section 3 dependency targets. All-36-owned copy making is not Today promotion. A last-copy gamble remains manually available inside the room with warnings, never recommended by Today.

Row copy: **“The Laboratory. Two spare pets can make a colour. Both are consumed. {n} experiments available today.”** Actions: **Open Laboratory**, **Hide this**. Persist Hide through backup/sync; reopening the room or completing an experiment does not unhide. Provide an intentional setting to restore the row. An experiment marks intro read but does not implicitly hide the persistent row. No popup, push, recurring badge, pulsing icon or loss-framed daily reminder.

Recompute after hatch, salvage, breed, Animate, purchase, restore, training/equipment/name/bond/talent changes, day/zone reset and resume. Share the pure predicate and current render snapshot instead of adding repeated whole-store reads to Today. Collapse irrelevant rows without replacing them with an upgrade advertisement. A hatch-result link reinforces discovery when live stock becomes safe and useful with capacity; avoid repeated prompts on ordinary ineligible hatches.

First room visit teaches all three recipe strips, consume-both, severe losses, repeated lower-tier coin flips and guaranteed Midnight before selection. Keep help reopenable. Update egg copy: **“New eggs hatch Base pets, with the existing rare shiny chance. Colours are now made in The Laboratory. Your pets and the colours already stored in your eggs stay yours.”** Existing collectors see **“Six Rose colours added”**, not a suggestion that six owned cells disappeared. Discovery/read flags never alter odds, grant inputs or award capacity.

## 9. Required release guards

These are acceptance requirements for the future implementation, **not tests added or passed by this document**. Each guard must have a nonempty measured sample, a positive CONTROL proving the valid path ran, and a deliberate faulty variant that makes its assertion fail. Verify persistence/crash behavior in real IndexedDB and UI behavior through real controls when those environments are authorized. A Node mock alone cannot certify process-death durability or pixels. Keep test coverage derived from recipes, grant callers and controls so added cases cannot be silently skipped.

| Guard | What it asserts, including failure direction | Positive CONTROL |
|---|---|---|
| LAB-01: morph/art contract | Exactly 6 species x 6 cells; all six approved Rose runtime files exist, decode, resolve via shared renderers and retain protected art pixels. No Rose-as-Base fallback. Check 32/48/64 px on Today green/dark with rarity glows, especially C6 vs Ember. | Existing Base and Ember decode at each footprint; every Rose species has a nonempty visible sample. Missing or swapped Rose must fail. |
| LAB-02: eligibility matrix | Exhaust all 21 morph pairs per species: exactly three legal. Cross-species, repeated/missing IID, CX, shiny, malformed IID/morph and duplicate-IID ambiguity cannot spend. Legacy absent/null/empty normalize only as specified. | Both input orders of all three valid recipes succeed; manually selected trained ordinary pair remains eligible. |
| LAB-03: flat lower odds and final certainty | Both lower recipes have exact equal weights and both outputs across all ownership and stock states. Toxic + Rose supports only Midnight. Test production resolver endpoints. | Both lower outputs are reachable, three Frost before Ember remains possible, and reintroduced collection/stock filters fail the same guard. |
| LAB-04: ingredients and ownership | Keepers and spares protect current cells under the safe selection policy, never by filtering odds. Other species and trained stock cannot change support. | Asymmetric missing colours and stock still give both outcomes at 50% each. |
| LAB-05: atomicity and death | Inject abort/kill before dispatch, during each member write, before completion and after completion before UI response. Reopen: either full before-state or full after-state, never one parent, missing result, unmatched tombstones/metadata, or use without pet. | Ordinary experiment commits net minus one pet, exactly two tombstones, one result, complete cleanup and one occupied slot; each kill reaches its intended hook. |
| LAB-06: replay/reveal | Same opId double tap, reload, next-day retry and reveal close return one saved IID/outcome with one use. A later-taken result is not recreated. No reveal-side grants. | A new request with fresh inputs and available owned slot creates a distinct result; stored receipt remains reviewable after its output is salvaged. |
| LAB-07: daily cap race | Distinct pairs/opIds racing in two tabs of one DB commit at most 1/2/3 according to ownership. Rendering/refresh cannot rewind used slots. Stale count is refused/reviewed. | Sequential valid requests consume every owned slot exactly once; one extra request is refused with unchanged pets. |
| LAB-08: rollover and R24-L17 | Across 23:59 to 00:00 before timer, Laboratory rejects stale quote and uses new day only after review. Saved pre-midnight result stays on old day. Existing fresh-log rollover/edit-date behavior still passes. | New quote on valid next day commits one use; previous-day edit remains previous-day and fresh food entry follows today. |
| LAB-09: timezone/DST/trust | Same date cannot refill; backwards date cannot reopen quota; allowed forward date follows guard; unwitnessed forward date refuses. No 24-hour cooldown introduced. | Honest evening then next morning is allowed, including DST fixtures; returning to same high-water date reads its occupied slots. |
| LAB-10: stale warning | Rename, train, bond, talent, lineage, equipment, inventory, day and capacity changes between quote/confirm refuse the old quote before roll/spend. Different request under same opId is rejected. | Unchanged quote and correct acknowledgement commit; refreshed exact warning permits the changed eligible pet. |
| LAB-11: destructive UX | Real picker/confirmation requires separate deliberate action; all investments and pair-wide last-cell losses escalate to typed ANIMATE. Cancel/incorrect text spends nothing. No default selection. | Plain uninvested surplus succeeds by review/confirm; typed trained pair succeeds and shows its exact lost bank. |
| LAB-12: branch preview | Whole-roster subtraction gives exact losses/gains/counts for every possible output, including two last Bases and final last Toxic/Rose. | Keepers outside the pair preserve their cells; final Toxic branch keeps Toxic colour but uses a new IID at zero steps. |
| LAB-13: investment and sibling writes | Both consumed IID maps stay deleted, output starts fresh, settled historical steps never flow into it; races with training/breed/salvage/equip/nick/bond/talents cannot restore or overwrite state. | Unrelated living pet retains and can gain training/name/bond/talents; equipped input replacement is the new result, non-input equipment stays. |
| LAB-14: incubator purchase | Debit, coinsRev, currency history and entitlement commit together; replay, insufficient funds, missing prerequisite, fourth slot and competing same-slot purchases cannot overcharge/grant. | Funded slot 2 after first experiment adds one same-day use without resetting slot 1; funded slot 3 follows and adds exactly one more. |
| LAB-15: migration | Existing pets and coloured egg rows survive unchanged; valid legacy queued colour hatches with original policy/shiny gate. New grants Base-only; initializer repeat adds nothing. | Seed an owned old Midnight and valid Ember egg; retain the pet, hatch Ember under non-shiny draw, and hatch a newly granted Base egg. |
| LAB-16: grant/faucet census | Enumerate every egg/direct-pet grant caller; new eggs all Base-marked, no grant calls rollMorph. Sources/counts/thresholds/goals/progress/species/shiny rules unchanged. Legacy conversion takes one and produces one. | Welcome ready egg remains ready, ordinary egg progresses at existing 8,000 goal, C6 remains in uniform species pool and cannot be shiny. |
| LAB-17: merge/restore closure | Compatible receipt unions cannot revive inputs, reset cap, detach output, lose purchase debit or resurrect metadata. Conflicting opId, same-slot spends, shared-input spends, malformed/future data and unsafe replacement refuse the whole import. | Compatible independent days/slots merge with exact results, tombstones, history and counts; a subsequent legitimate result tombstone stays taken. |
| LAB-18: authority limitation | Two offline database replicas can exceed one shared cap before merge; test must report unsupported global enforcement, not a false pass from local serialization. A future strict authority solution must reject the second reservation/commit. | Same-DB tabs pass LAB-07; a compatible nonconflicting two-replica merge works, while conflicting receipts are surfaced without destructive reconciliation. |
| LAB-19: discoverability | Today predicate includes age, hide, capacity and full safe/useful pair; suppress wrong species, invested-only and two-last-Base stock. Persistent entry/help work while row absent. Hide survives reload/merge, intentional restore setting works. | Prior-day account with three plain same-species Bases and missing output sees row and reaches bench through its real control. Day-one account reaches recipes through permanent entry. |
| LAB-20: three sinks and empty states | Real navigation leads to all three distinct actions; cannot-afford/cap/empty states have working exits. No Lab fee, dust payout, breeding rule change or advertised bulk-salvage UI. | Selected same-species pair worth 2D becomes one ordinary result worth D; existing salvage pays expected dust and Breed preserves its keeper. |
| LAB-21: recovery copy | Confirmed abort says no spend only with readback; unknown commit disables retry; committed unseen receipt names saved result and recovers without spending. | A normal saved experiment shows its actual result and remaining use count; acknowledgement stops its recovery card without deleting receipt. |
| LAB-22: UI/art/accessibility | Drive every new control, hit-test overlays, small phone/notch/text expansion/keyboard/reduced motion. Cold-cache reveal samples decoded visible art, nonzero frames and readable odds/warnings. | Real Animate yields visible named result; Back/Cancel receive taps and focus restores to the originating control. |
| LAB-23: accepted pace provenance | Any future pace report runs the actual consume-both resolver at all three tiers with V4's declared arrival/activity assumptions and net-pet invariants. It may not certify 122/161 or 393/558 from retained-parent code. | First-win matched-stock construction verifies 15 uses/21 Bases per species; forced final miss adds four uses/four Bases. A retention mutation fails conservation/cost checks. |

Integrate relevant cases with the existing unit suite and [tests/pet-morph-audit.mjs](../tests/pet-morph-audit.mjs), [tests/claimed-row-audit.mjs](../tests/claimed-row-audit.mjs), [tests/clock-trust-audit.mjs](../tests/clock-trust-audit.mjs), [tests/claim-evidence-lint.mjs](../tests/claim-evidence-lint.mjs), [tests/ui-audit.js](../tests/ui-audit.js) and Today read-cost guards. Any changed atomic primitive requires Shop/Pit/hatch regression and injected-failure coverage through their real paying paths, not merely Laboratory tests. A baseline unit pass alone is insufficient release evidence for the feature.

## 10. Staging and exposure

1. **Internal foundation:** bring the approved Rose assets into this checkout; implement pure tables/resolver/preview, the atomic snapshot seam, records, migration/restore and sibling-writer safety. Add odds, transaction, cap and migration guards before any exposure. Keep new Base-only grants and UI behind a coordinated release gate so eggs cannot lose their colour route before the bench exists.
2. **Internal feeling slice, soonest:** exercise Base + Base with a real stored pair, consume-both confirmation, atomic saved output and reveal, plus the visible full recipe path and onboarding draft. This is the shortest way to experience choosing, risking and meeting a new pet. Use explicit test fixtures, not a production starter grant. It is not a public partial bench and does not certify the upper recipes.
3. **Smallest publicly shippable slice:** all three recipes with flat lower odds and guaranteed Midnight, six-species Rose integration, free daily use and both purchasable incubators, every state/warning/recovery path, migration, complete first-room explanation, permanent navigation, safe Today row and first-egg species/path introduction. Ship these together. Publicly shipping lower tiers alone, postponing onboarding, or flipping eggs early would violate the frozen order. Require the guards above and resolution of the applicable art/authority blockers first.

Do not add vanity products, cross-species art, extra hatch rewards, new economy sources or alternate timers to this slice. The accepted chase is a collection project, and incubator revenue is not evidence that its safeguards or onboarding work.

## 11. Advisory execution report

- Changed: `docs/LAB-SPEC.md` only. No runtime, test, asset or prior-document implementation changes.
- Agreed proof, run from this checkout: `node tests/unit.test.js`.

```text
370 passed, 0 failed
Exit code: 0
```

- This is baseline repository proof, not proof of a Laboratory implementation. All Laboratory acceptance guards above are specified, not implemented or executed.
- Denied actions: none. Read-command glob mismatches were corrected with targeted reads; they caused no denied or blocked mutation.
- Blocked/evidence-limited requirements: six approved runtime Rose files absent; V4 pace figures use different lower-tier consumption; strict cross-device/offline quota and universal old-client grant cutoff cannot be guaranteed by local state; empty-install old-backup replay cannot be prevented locally.
- Proposed deviations are explicit in sections 1, 5 and 6: label accepted pace as unverified for this graph; import the approved missing art; local cap scope if accepted; honour old-client minted eggs; reject unsafe Laboratory replacement rollback. No recipe, consumption, shiny-rate, egg-supply, starter or pity deviation is proposed or implemented. Inherited 20k/40k pricing is labelled as a specification choice.
- Browser, socket-based checks, visual verification, art generation, process-kill injection and multi-device tests: **unrun** under the work-order restriction. No sockets or browser were opened for this task.
- No commit, push, publish or deployment attempted. No original checkout edited. This report is advisory for independent review.
