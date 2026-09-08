# Laboratory: second critique

2026-09-08. Advisory only. Source paths refer to this checkout.

## Verdict

The information architecture is wrong. The room presents a species catalogue, a colour catalogue, a transaction form, a recipe manual, a collection ledger and a navigation hub in one uninterrupted column. More borders, shadows or padding will not make that coherent.

**Why does the room need nine screens to say what one poster says?** Because it keeps restarting the explanation. The same Bulldog appears as a species choice, six colour previews, possible working outcomes, recipe ingredients, recipe outcomes and collection entries. Each representation brings another caption and another ownership report. The player must assemble the relationships mentally while scrolling past the same information.

The earlier critique helped create this problem: its three stacked recipe cards and always-visible species grid are the wrong recommendation at this width. Withdraw those recommendations. Keep its demand for readable art and clear consequences.

The poster wins at explaining the path. It cannot replace choosing exact pets or reviewing their destruction. Aim for **one screen of recipe explanation and about two screens of routine bench content**, with the existing picker and destructive review remaining separate. Do not turn an information poster into a promise that eight Base pets always buy Midnight.

## Evidence and its limits

Inspected all three supplied images: [panel 1](lab-render/lab-panel1.png), [panel 2](lab-render/lab-panel2.png), [panel 3](lab-render/lab-panel3.png). Panel 1 spends most of its length choosing and displaying; panel 2 repeats the recipe grammar three times; panel 3 is help, a 36-cell ledger and exits. The frozen order supplies the **6,612px at 393x852** measurement. It was not remeasured here.

Source anchors: `js/app.js` functions `labBenchHtml`, `labSpeciesHtml`, `labSpecimenHtml`, `labRecipesHtml`, `labPickerHtml`, `labBranchesHtml`, `labConfirmationHtml` and `openLaboratory`; `app.css` Laboratory rules around lines 11896-11963; `js/loot.js` functions `labPresentation` and the `laboratory` export; `js/laboratory.js` functions `labDistribution` and `labPreview`.

The poster itself was not supplied among those three images. Its described composition is the comparison, not a separately inspected artifact. Panel 3 repeats part of its tail, and panel joins show clipping. `labBenchHtml` emits the ledger and footer once. Do not count that image overlap as proof of duplicate live DOM. The label/art collision is visible, but its exact live-layout cause remains unverified.

The prior critique's missing-adapter release blocker is stale: `js/loot.js:1980` now exports the version-1 adapter. This is source evidence, not a new browser integration proof.

## Concrete restructure

The permanent room should contain one bench, one colour path and compact supporting controls. A species choice changes the context of that room; it should not leave six large alternative contexts above the task.

| Current material | Decision | What remains visible |
| --- | --- | --- |
| Six large species tiles, even after selection | Collapse after a deliberate selection into a portrait, species name, current colour count and Change species control. Expand the existing choices on demand. | Before selection, all six named choices, including unowned species. After selection, one species identity. Changing species still clears both pets and the quote. |
| Separate six-colour preview gallery | Cut this section entirely. Merge its art and ownership information into the path. | All six colour variants in the single path. |
| Working pair and its detached outcome gallery | Keep the bench first. Merge the unquoted outcome explanation into the path. | Two explicit pet controls, availability, existing loss warning, missing-selection reason and Review pair. When a quote exists, retain the complete branch preview at the bench. |
| Three framed recipe cards | Remove all three card shells and their repeated caption stacks. | One connected path, with one shared species heading and three labelled recipe connections. |
| Sentence-form ingredient accounting | Replace with a labelled count row for the current recipe, using the supplied safe-spare counts. | For example: `Spare pets: Ember 0. Need 1. Frost 0. Need 1.` Unknown stays `Unknown`, never zero. Explain once that spare counts reserve a keeper and exclude invested pets. |
| Full help | Keep in the existing disclosure and preserve `introRead`, first-visit opening and saved close behaviour. | How the recipes work. Its exact protection rules and destructive warnings remain available, open on first visit. |
| Full 36-cell collection ledger | Remove from the bench; use the existing Collection destination. | A single `Your collection: 2 of 36 colours` link. Selected-species ownership lives in the path. |
| Availability plus used/capacity/reset ledger | Merge spatially, keeping all values and exact reset time/zone accessible. | Available uses near the pet controls; used/capacity and reset details in a compact disclosure. Exhaustion puts the full reset explanation at the bench. |
| Egg inventory paragraphs and multiple sink explanations | Put secondary information in a labelled More pet actions disclosure; retain the existing destinations and explanatory copy. | Collection, Eggs, Melt spares, Breed and conditionally available Incubators remain reachable. When a pair is unavailable, show the relevant egg/other-species exit beside that reason. |
| Saved experiment recovery at the bottom | Move its existing copy and control above the bench whenever present. | The saved-result action, without changing acknowledgement, recovery or spending rules. |

This is presentation restructuring. No recipe-selection step, automatic pair selection, new eligibility rule or changed transaction flow is proposed. The path is explanatory, not a second control system. Keep both valid upper-tier and risky-but-eligible choices available through the existing picker.

### Height contract

At **393x852, normal text size**, target **at most 1,560 CSS px of sheet-body content** for a selected species, empty pet slots, ready state and previously read help. This is approximately a 76% reduction against the supplied 6,612px figure if both measurements use the same body-height definition. Measure actual body `scrollHeight` and `clientHeight` separately during a later implementation review; the visible viewport includes sheet chrome and safe areas.

Allocate approximately 144px to purpose, selected species and availability; 420px to the empty bench, its unchanged warning and helper copy; **720px to the entire connected path**; 180px to compact supporting controls; and 96px to group separation. The first pet control must be visible within the first 360px of body content. The complete path, including its title and legend, must fit within **720px**, so it can be read in one phone view after scrolling to it if the sheet provides that much usable height. If sheet chrome leaves less room, allow a short continuation instead of shrinking art or disclosures. This fit remains a future browser acceptance check.

Before species selection, use a compact two-column chooser with approximately 96px portrait boxes and one name/count caption per choice. Target 720px for the chooser and initial orientation. Do not spend a full extra row stating both Base ownership and total ownership on every tile.

The 1,560px target explicitly excludes expanded help, selected-pet metadata, branch warnings, error/recovery messages and destructive review. Those grow naturally. The complete first-visit help must still open under the existing rule. A hard one-screen limit for every state is incompatible with preserving its behaviour and all destructive disclosures. The proposed deviation from the poster's footprint is the two-screen routine bench plus naturally scrolling detailed states. No such deviation is implemented here.

### What the player sees at each moment

| Moment | Required information and next action |
| --- | --- |
| No species chosen | Plain purpose, six named species portraits, Choose a species. No invented owned pet, recommended pair or personal odds. |
| Species chosen, no pets | Compact species identity, experiment availability, both empty controls and the existing permanent-consumption/level-1 warning. Below that, the entire colour path with current species odds and progress. Choose first pet is the primary action. |
| Choosing a pet | Existing destruction warning first, then filters and actual pets. Move the sink/navigation material below the roster. Keep names, levels, banked steps, lineage, bond, talents, equipment, exclusion reasons and last-copy warnings. No auto-selection or hidden eligible risky pets. |
| One pet chosen | That exact identity and metadata, second-pet control, matching-pair guidance. No premature claim that the recipe is safe. |
| Two pets chosen | Both identities, exact current quote, every branch's losses/gains/counts, and Review pair. Unsupported pairs and unavailable quota keep Review disabled with the existing reason. The lower path remains contextual information. |
| Review | The current destructive review in full, with Cancel, exact warning text, fresh quote validation, investment/lost-cell escalation and typed ANIMATE where required. No height cap. |
| Saved result | Actual saved pet and result metadata. Midnight appears directly with its guarantee; protected singleton lower-tier results also remain direct. Existing two-outcome skip/reduced-motion and image-retry behaviour stays intact. |
| No pair, quota exhausted or read/save problem | The existing state-specific explanation before the task, with applicable existing exits/recovery controls. Do not present a large optimistic action beside an unresolved save. |

## One readable recipe path

Use four shared tiers connected by three full-width instruction bands. Base appears once with a clearly labelled quantity of two. Ember and Frost share one tier; Toxic and Rose share the next; Midnight ends the path. Each intermediate colour is drawn once, serving visually as a possible output above and an ingredient below. No individual card borders, species-name repetition or separate catalogue.

The reading order should follow ordinary text, top to bottom. The poster's Midnight-at-top composition is useful inspiration, but reversing the reading direction is not necessary to obtain its clarity.

```text
Bulldog colour path                 You have 1 of 6 colours
Repeat recipes to build the next pair.

                         [Base art] x2
                              Base
             Use two Base pets. Make Ember or Frost.
                Equal chance: Ember 50%, Frost 50%*

                [Ember art]             [Frost art]
                    Ember                   Frost
             Use Ember and Frost. Make Toxic or Rose.
                 Equal chance: Toxic 50%, Rose 50%*

                [Toxic art]              [Rose art]
                    Toxic                    Rose
                   Use Toxic and Rose. Make Midnight.
                       Guaranteed. Midnight 100%.

                         [Midnight art]
                             Midnight
```

This is a relationship sketch, not measured layout or final copy. The asterisks mean those baseline distributions are illustrative: render the species snapshot's actual distribution. For a protected singleton, lead with `Make Frost. Guaranteed.` and then `Frost 100%`, with the applicable plain-language protection explanation. A colour excluded from today's outcome remains visible as part of the overall path, but no active outcome connector or probability label may imply it can be produced now. The active connection makes that distinction explicit.

Missing snapshot data must say example odds or unavailable, as it does today. Never calculate protection from the decorative owned markers. A refreshed exact-pair quote remains the authority at preview and review.

The path must say **one output per experiment**, not imply both displayed alternatives are awarded. The existing warning `Every experiment removes two pets to make one.` stays visible beside the bench. Keep `Midnight is the only output. Both pets are consumed.` at the final connection. Add a small repeat/return connector with the literal label `Repeat to build a pair`, rather than showing one pet surviving upward through the diagram.

Eight Base portraits are not a literal cost model. Even an idealised eight-to-four-to-two-to-one bracket is seven experiments, not three. Lower-tier outcomes depend on live ownership and ingredient protection; obtaining an ingredient can require repeating earlier recipes, and consumed collection cells can disappear. The graph explains three recipe types. It does not promise three daily uses, eight Base pets, retained parents or permanent progress.

## Give the art the room that captions currently occupy

The current implementation explicitly asks for 48px ingredient portraits and 64px outcome portraits. `croppedPetImg` uses a 0.82 content-fill factor, so their longest content dimensions are approximately **39px and 52px** before any other layout effects. The operator's sub-40px observation has a source-level explanation. A 144px gallery above them does not fix the recipe's unreadable ingredients.

Use approximately **96px portrait boxes in the path**, yielding about 79px of content along the longest dimension. Two columns comfortably accommodate the intermediate pairs at 393px width because their species name and full ownership sentence have been removed. Allocate at least 120px per art-and-colour tier, then approximately 48px per instruction band, leaving 96px for the title, orientation and shared ownership legend within the 720px target. Extra wrapping must grow the content rather than clip it. Treat this as a budget to verify, not permission to overlap captions to meet it.

Use `petPortraitHtml` with an explicit morph, no preview wear and no preview shiny; it resolves the shipped PNGs through `morphAsset()`. Keep the existing crop geometry. No redraw, hue rotation, greyscale, silhouette substitution or decorative tint. Put labels in normal document flow below the full portrait box. Species is named once at the path heading and in accessible node names. Actual selected pets keep their full individual identities.

The design should recover space by eliminating repeated containers and prose. If art only fits after reducing it back to 48px, the restructure has failed.

## Which repetition survives

**“Two Bulldog pets in. One new pet out.”: none of the three recipe-card copies survives.** The surviving generic statement is already in the working bench's complete paragraph, which stays verbatim:

> Two pets in. One new pet out. Both inputs are permanently consumed. The new pet starts at level 1.

Species identity is immediately above it. Removing redundant recipe narration does not remove any permanent-loss warning.

**“Missing colours come first.”: keep the contextual recipe occurrence**, attached to the applicable connection when the engine reports collection protection. Remove the blanket pre-path occurrence and the duplicate help opener. Keep the help's substantive rule beginning `On the first two recipes, missing colours come first, then needed ingredients.` It explains the actual scope. If both lower connections need the same current explanation, share one visibly associated note across them instead of printing it twice. Needed-ingredient protection must retain its distinct explanation. Never apply this slogan to Toxic + Rose.

Keep every destructive sentence in the pre-path/helper material and help verbatim, including `Every experiment removes two pets to make one.`, `Both pets are consumed.`, `Spending last copies can leave cells empty.` and `Trained pets are allowed, but all their investment is lost.` They can move with their existing context; they cannot become tooltip-only cautions or be replaced by a reassuring icon. Keep `labPetDetails`, `labBranchesHtml`, `labConfirmationHtml`, the picker destruction warning and the shared confirmation escalation intact. Their purposeful preview/review repetition is outside the copy cuts above.

## Progress without a wall of absence

Show every colour in full, unchanged art. A collected node gets a small check and a compact `Have` label. Unowned nodes get no repeated negative badge. A shared legend says `Unmarked colours are still to collect`; accessible names explicitly retain owned/not-owned meaning. The selected species has one `You have 1 of 6 colours` count.

For zero colours, use `Six colours to collect` plus the applicable existing no-pets/no-pair guidance. Do not show six locks or six grey animals. The art is the invitation. The Base node is the starting point, not an item the interface pretends the player owns.

Do not call a row complete forever, fill a permanent achievement bar, or mark every earlier tier done when Midnight is owned. Ownership is current and can move backwards when last copies are consumed. Collection progress and spare stock are different measures: a `Have` check cannot stand in for an available ingredient. Keep the ingredient counts at the working bench, sourced from `safeCounts`, and keep exact branch losses visible. A dry, fond line is enough; loss does not need a joke.

## Findings beyond the operator's list

1. **The picker recreates the detour.** `picker()` puts `labSinksHtml()` before both filters and the roster. Choosing first pet opens another navigation essay before any pet. Reordering the main room alone would leave the task slow. Preserve the picker warning and move unrelated exits below its working content.
2. **Recovery has the worst position in the room.** The saved-experiment copy/action is appended after Incubators. A player returning from an interrupted session may see ordinary bench content long before learning that a result is already saved. Move recovery to the top without altering the recovery engine or its gating.
3. **“No spares” is not “no legal recipe.”** `safeCounts` reserve a keeper and exclude investment. Eligibility still permits trained and last-copy ordinary pets, with escalation. `labStateCopy` saying “You need two spare pets” when no safe pair exists blurs those concepts. A future wording correction should explain that spares avoid those losses while other eligible pets require review; it must not disable those choices or weaken any warning. This is an advisory copy correction, not an engine change.
4. **The room can teach the wrong first move.** `activeId` defaults to Base + Base until selected pets indicate otherwise. A player who already has Toxic and Rose still initially sees a Base recipe heading. Label an empty bench `Choose your pair`, keeping all three recipes visible in the path. Derive the working recipe from the same selected pets as today; do not introduce a recommendation algorithm or automatically spend the best pair.
5. **The smallest phones get a structural penalty.** At 380px and below, CSS makes both species and preview grids single-column. A 375px phone therefore gets substantially more catalogue scroll than the supplied 393px case. Removing the duplicate gallery and collapsing the chosen species addresses this discontinuity. Later verification must include 375px and expanded text, not just 393px.
6. **The process and the collection are not the same graph.** The present cards make a consuming recipe look like an upgrade ladder; a literal eight-pet bracket could reinforce that error. “Repeat to build a pair,” exact consumption warnings and current-ownership marks must travel together. Protection changing tomorrow's odds is part of the mental model, not fine print to lose when compressing it.

## Proof and execution report

Frozen plan SHA256 verified:
`19f77ea88738113e2bfc190a0a68c72bf2cdd67e5e9a490aa0fd5111a1546598`.

Changed file: `docs/LAB-GRILL-2.md` only. No application, stylesheet, artwork, test or engine implementation. No original checkout edits. No commit, push or publish.

Agreed proof, executed from this checkout:

```text
node tests/unit.test.js
370 passed, 0 failed
Exit code: 0
```

The unit result checks existing repository assertions. It does not prove this proposed layout or its usability. `git diff --check` also completed with exit code 0; the new document was separately checked for trailing whitespace and forbidden dash characters.

Denied actions: none. Blocked deliverable actions: none. Browser and socket/server execution: **unrun**, as required. Supplied local PNG inspection was performed; live layout, focus, touch, rendering and the proposed height targets remain unverified.

Deviations: no implementation deviations. The proposed routine bench exceeds the poster's single screen because exact-pet selection and destructive review need additional space. Expanded first-visit help and risk states are deliberately outside the height ceiling to preserve the frozen behaviour and warnings. No rules, odds, protection, transaction, art or confirmation changes are proposed. This report is advisory for independent review.
