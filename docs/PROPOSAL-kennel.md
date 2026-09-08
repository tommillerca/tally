# Kennel comprehension proposal

2026-09-08. Proposal for Tom's decision. No app changes proposed here are approved for implementation.

The Kennel promises pet management through its name, but delivers a colourway collection. Recommend option A: make that distinction explicit and name the existing Stable actions by their outcomes. The v500 placement fix did not resolve the repeated complaint. This is a comprehension finding, not a new claim that either transaction is broken.

## Scope and evidence

The supplied work order's established facts are accepted: salvage and breeding work, both live in the Stable, the breeding gate is 6,000 steps, and Kennel Phases B, C and D have not started. This inspection traces navigation, displayed copy and the gate's presentation only. Source references below resolve within this checkout. Historical paths in comments and plans were not used as edit targets.

The plan file's SHA256 matched `a07fb198031cf2efd8ec41206ff5142abc4b49fe028aa206dca91dc7de6828ae`.

Evidence is source inspection, not a browser session or observed user study. Browser, sockets, visual verification and live click-throughs are unrun by instruction. Predicted abandonment points are UX judgments. No new telemetry was collected.

## 1. Comprehension trace

### Starting state and counting rules

Cold open means an existing player's ordinary launch onto **Today**, without an incoming route, onboarding, overlays or a saved breeding selection. A brand-new account without spare pets cannot perform these actions. `currentTab()` defaults to Today; its `Stable` button opens **The Stable** (`js/app.js:3387`, `4712`, `5035`).

For an exact reproducible trace, assume the equipped keeper is initially focused and has a second copy of the same species. The species carousel shows one representative per species. Individual copies are selected using the portrait/colour/level chips below its stats (`js/app.js:20091-20133`, `20965`). A duplicate species can have different colours; the quick salvage path specifically requires an untrained, non-shiny, lineage-zero copy whose colour is also owned on another copy.

Counts include control taps. Scrolling/swiping and typing are stated separately. The number of scroll gestures cannot be fixed without a viewport and roster, and was not measured. If the species is not initially focused, add one tap on its carousel dot (`data-cfdot`, `js/app.js:20794`), or navigate by swiping instead. Existing saved pair selections can shorten or alter the breeding path (`js/app.js:19937`).

### Salvage a plain duplicate into Bone Dust

| Tap | Screen or state reached | Action and feedback |
|---|---|---|
| 1 | Today → The Stable | Tap `Stable`. Scroll past the Paddock and Kennel doors as needed to reach the focused pet's controls. |
| 2 | The Stable, duplicate focused | Tap the spare's portrait/colour/level chip in that species' copy rail. Scroll the rail if necessary. |
| 3 | The Stable, destruction armed | Tap `DESTROY {dust}`. It changes to `Melt {name} for {dust}?` with a dust icon. The toast names Bone Dust and says to tap again. |
| 4 | The Stable, refreshed | Tap that armed control again within 4.6 seconds. The spare is removed and the toast says `{name} salvaged into {dust} Bone Dust.` |

**Total: four taps, two named screens, no separate confirmation screen.** The icon is not a written currency label on the initial `DESTROY {dust}` control. The meaning is clearer in the earlier explanatory paragraph and after arming. Sources: `js/app.js:20159-20175`, `20418`, `21036-21086`.

For an actually old, trained pet, or any shiny, lineage-bearing or last-colour copy, tap 3 opens **Destroy {name}?** instead. Tap 4 focuses the input, type `DESTROY` (or the displayed full pet name), then tap 5, `Destroy it`. Success returns to The Stable. **Five taps plus typing, three named screens** under the same focus assumptions. Banked steps greater than zero trigger this protection, even below level 5. This is intentional confirmation friction, not a transaction failure (`js/app.js:21054-21076`).

### Feed a duplicate into a keeper

Assume the cooldown is ready and the initial keeper is the intended survivor.

| Tap | Screen or state reached | Action and feedback |
|---|---|---|
| 1 | Today → The Stable | Tap `Stable`; scroll to the focused keeper's actions as needed. |
| 2 | The Stable, first pet selected | Tap `BREED`. It becomes `BREEDING`; the waiting panel says `Now pick the second pet` and `Swipe across and tap BREED on it`. |
| 3 | The Stable, spare focused | Tap the duplicate's chip in the same species' copy rail. |
| 4 | The Stable, pair selected | Tap `BREED` on the spare. The inline `What breeding does` panel appears. The first selected pet defaults to keeper. Inspect `KEPT` and `FED` under `Which one are you keeping?`; scroll as needed. |
| 5 | The Stable, feed armed | Tap `Feed {spare name} in`. It changes to `Destroy {spare name}?` and warns that the spare is permanently destroyed. |
| 6 | Bred in the Stable, result takeover | Tap again within 5.2 seconds. The keeper gains lineage and the spare is consumed. The result says `Lineage {rank}` and `{species} got stronger`. |
| 7 | The Stable | Tap `Adopt` to dismiss the result. The operation already completed at tap 6. |

**Total: six taps to complete, seven to return, three named surfaces.** If the wrong survivor is selected, add one keeper-chip tap before arming. The confirmation does not require typing, including for precious spares, although those receive stronger warnings. Sources: `js/app.js:20062-20077`, `20285-20293`, `20412-20470`, `20999-21005`, `21090-21120`, `21249-21279`.

The first-pick hint describes swiping across pets, but the current carousel groups by species. For a same-species duplicate, the player needs the copy rail. This guidance is poorly matched to the requested task, even though another species can also supply the spare.

### Where this player gives up

The predicted primary abandonment point is **tap 2 on the mistaken route**: Today → `Stable` → `THE KENNEL`. The resulting **The Kennel** screen offers `Your pets`, `Collection` and cells that reveal colour names. There is no salvage, feed or management shortcut. An exploratory third tap on a cell changes its label and still does not advance the task. That is the point where “turn an old pet into something useful” reaches a dead end. This prediction follows Tom's repeat report; it is not an observed session.

Recovery requires `Done` back to The Stable, then finding the controls below the doors. Entering and leaving the Kennel adds two taps to either successful trace. On the correct route, secondary abandonment risks are deciding that `DESTROY` means loss without benefit, following the wrong second-pet hint, or discovering a disabled feed button only after selecting a pair.

## 2. Naming collision and actual copy

Braces below denote dynamic values; HTML entities are rendered as visible characters.

| Surface | Actual copy | What it tells the player |
|---|---|---|
| Today door and Stable heading | `Stable`; `The Stable` | A place name without a management outcome. |
| Stable explanation, when no pair is selected | `Breed feeds a spare pet into one you keep: the keeper gains a lineage rank (+5% to every stat) and the spare is destroyed. Destroy trades a spare for Bone Dust instead.` | Explicit, correct account of both useful outcomes. |
| Kennel door in Stable | `THE KENNEL`; `{found} of 30 species colourways · founder excluded` | Subtitle defines a collection, while the prominent place name can suggest caring for or managing pets. |
| Kennel heading and instructions | `The Kennel`; `Your pets`; `Collection · {found} / 30`; `Five colourways per pet, in column order. Filled dots are hatched; hollow dots and locked cells are not. Tap a cell to read its name.` | Inspecting a collection, with no management action. |
| Stable pet actions | `BREED` / `BREEDING`; `DESTROY {dust}` | Labels emphasize a breeding concept and destruction, rather than “strengthen keeper” and “gain dust”. |
| Selected pair | `What breeding does`; `Kept · lineage {old} → {new}`; `Fed in · gone`; `Which one are you keeping?`; `Feed {name} in` | Feed/upgrade semantics become explicit only after selection. |
| Result | `Bred in the Stable`; `{species} got stronger`; `Adopt` | Strengthening an existing pet is described with words that can imply a new animal. |

Sources: `js/app.js:4712`, `19993`, `20159-20175`, `20381-20418`, `20442-20469`, `21152`, `21220-21233`, `21255-21276`.

**Implementation meaning:** Kennel means the colourway collection; Stable means pet management. **Comprehension conflict:** two ordinary pet-housing names do not establish that distinction on their own. The subtitle and Stable paragraph are already doing useful explanatory work, so saying “nothing explains it” would be false. The mismatch is between the naming promise, the visible action labels and where the player expects to act. Whether to retain either place name is Tom's taste call.

### Separately flagged factual copy issues, not implemented

1. **Collection ownership is described as hatch history.** `Not hatched yet.` and the hollow-dot sentence above are based on current `ownedPairs(insts)`, not a permanent hatch-history record (`js/app.js:21155-21169`, `21231`). After consuming the last copy of a hatched colour, that cell can claim it was never hatched. Proposed correction: `Not currently owned.` and `Filled dots are owned; hollow dots and locked cells are not.` Keep “Tap a cell to read its name.” This would qualify for the work order's factual-copy exception, but is left for review in this proposal.
2. **Walking-only language omits exercise credit.** Help says `It costs nothing but walking: 6,000 steps between breeds.` The gate's meter also credits exercise minutes, as detailed below. Proposed correction: explain “6,000 progress steps between breeds” and explicitly state the exercise conversion. The precise short label is Tom's choice. No cooldown or currency change is proposed.

The Kennel name, `BREED`, `DESTROY` and `Adopt` are comprehension/taste issues, not permission to make an unapproved copy redesign.

## 3. How much the cooldown contributes

`breedStatus()` reads a lifetime progress meter and the value recorded at the previous breed. With no previous breed, it is ready immediately. Otherwise, the gate clears after **6,000 additional credited steps**. It is global across pets, persists across days, and does not reset at midnight. A successful breed records the current meter, so surplus progress does not bank multiple future breeds (`js/loot.js:1490-1496`, `1506-1509`, `1535`). Having two pets and selecting a pair are separate prerequisites for an enabled feed control (`js/app.js:20062-20077`).

For this meter, daily contribution is `steps + min(exerciseMin, 60) * 250` (`js/loot.js:1244-1251`). Thus 24 newly credited exercise minutes alone can clear 6,000; daily exercise credit is capped at 15,000. Physical step counts alone can overestimate the wait. Progress must be recorded in the app's health data to count.

### Availability estimate and its limit

An actual “typical player is locked X% of visits” is **not determinable from this checkout's supplied evidence**. It requires the joint distribution of credited activity, pet inventory, breed events and Stable visits. The existing planning baseline says the median player opens once daily (`js/cooking.js:230`, `docs/DESIGN-walk-potion.md:267-270`), but does not establish those breeding-specific distributions.

Proposed evidentiary deviation: use explicit scenarios, not an invented population measurement. Assume one visit after each day's credited activity, constant daily credit D, at least one spare replenished as needed, and breeding immediately on every ready visit. Exclude the initially ready first visit. Then visits per successful breed are `ceil(6000 / D)`, with one ready visit and the remaining visits locked per cycle.

| Assumed activity between daily visits | D | Ready at visit | Locked at visit | Breed interval |
|---|---:|---:|---:|---|
| 2,000 steps, no exercise minutes | 2,000 | 33.3% | 66.7% | Every third day |
| 3,000 steps, no exercise minutes | 3,000 | 50% | 50% | Every second day |
| 6,000 steps, no exercise minutes | 6,000 | 100% | 0% | Every day |
| 10,000 steps, no exercise minutes | 10,000 | 100% | 0% | Every day, with this visit schedule |
| 3,000 steps plus 12 exercise minutes | 6,000 | 100% | 0% | Every day |

These are pre-action availability percentages, not percentages of elapsed time. At 6,000 daily credit, a player who breeds on the first ready visit and checks three more times before gaining further credit sees one ready and three locked visits: 25% ready, 75% locked. Conversely, a player who stops breeding remains ready after clearing the gate. An account with no spare cannot use breeding even when its cooldown is ready.

### What locked actually says

Before two selections, the pet's `BREED` control remains enabled and there is no cooldown status alongside it. Once a pair is selected, the panel displays **`Walk {remaining} more steps before breeding again.`**, and **`Feed {name} in`** is disabled. The label itself does not change to a lock explanation. Help separately states **`6,000 steps between breeds`**. A cooldown rejection from the transaction handler would toast **`Walk a bit more before breeding again.`** (`js/app.js:19571`, `19603`, `20173`, `20467-20469`, `21117`).

**Finding:** the lock is explained, but late in the selection flow. Repeated checks with insufficient credited activity can make it look persistently unavailable. “Usually locked and unexplained” is not supported as a blanket finding. Earlier status could prevent wasted selection effort; it would not fix the Kennel dead end on its own.

## 4. Options for Tom

Sizes are rough engineering estimates including focused tests and later browser review, not commitments. Nothing below is implemented.

| Option | Proposed scope | Pros | Cons | Rough size |
|---|---|---|---|---|
| **A. Copy and signposting only** | Retain current navigation and transactions. Consider `Kennel: Colourway collection`, explicit “Manage pets in the Stable” guidance, `Salvage for {dust} Bone Dust`, and `Feed spare` wording. Explain the same-species copy rail. Show ready/remaining progress before selecting pets. | Directly addresses the repeated misunderstanding; exposes both existing outcomes; smallest change; preserves established confirmation protections. | Still requires returning from Kennel; additional text may be missed; earlier live status needs a small render change, so this is not entirely literal string replacement. | **Small: 1 to 2 engineering days.** Literal copy work is hours; state placement, responsive review and guards make the wider scope larger. |
| **B. Put management where the player looks** | Let a Kennel species/colour selection lead to individual-copy management with salvage and feed controls, using existing transactions and confirmations. Decide whether Stable remains the main manager or links into this surface. | A player arriving in Kennel can complete the intended task; connects collection cells to useful actions. | A species/colour cell is not an individual pet; needs explicit copy selection, keeper/spare identity and a navigation design. Risks duplicate management surfaces and accidental loss of last colours. | **Medium: 4 to 7 engineering days**, after Tom approves navigation and interaction design. |
| **C. Give Kennel Phase C fusion** | Define and implement an actual collection-related conversion verb. Tom must first specify eligible inputs, outputs, morph progression, preservation/loss rules and its relationship to existing breeding. | Gives Kennel an intrinsic purpose beyond viewing; may provide a distinct use for duplicates. | No approved complete mechanic in this lane; adds economy, persistence, concurrency, confirmation and explanation work. A third conversion verb can deepen confusion. Must respect cosmetic morphs and the existing no-dust-in-fusion ruling in `docs/KENNEL.md`. | **Large: 2 to 4+ engineering weeks after a frozen design**, with substantial uncertainty; not a reskin of breeding. |

**Recommend A first.** This report is about finding useful existing actions. Names, outcome labels, correct duplicate-selection guidance and early cooldown status address that directly without inventing another mechanic. Merely moving or enlarging the Kennel door again repeats the previous intervention. Option B is the next candidate if Tom wants “Kennel” to mean management or if a later cold-start review still fails. C requires a separate product decision, not an assumed repair.

Tom decides the final names, whether the Kennel should own management, and whether fusion is worth adding. Proposed acceptance check for any approved follow-up: ask a cold-start reviewer to gain dust from a duplicate and then strengthen a keeper, without coaching; verify both ready and locked states and last-colour confirmation. That user/browser proof is unrun in this lane.

## Delivery constraints

Only this proposal is changed. No app behavior, styles or on-screen copy are changed. No commit, push, publish, browser session or socket-based check was attempted. The agreed proof `node tests/unit.test.js` completed with exit 0 and output `365 passed, 0 failed`. This is not a substitute for usability evidence. No actions were denied by the environment. The only proposed deviation is substituting labeled availability scenarios for an unavailable population statistic, with the limitation preserved above.
