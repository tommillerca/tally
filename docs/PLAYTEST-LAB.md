**Laboratory and Stable playtest. Advisory findings, 2026-09-08.**

Twenty ranked findings: 15 certain in the exercised state, five suspicions explicitly identified below. The largest risks are a persistent recovery lock and incomplete Stable destruction reviews. No application fixes were made. This report is evidence for independent review, not release approval.

**Scope and reproducibility**

The supplied plan file's SHA256 matched `6816c65f6e1d8b28b08a1b635920b3e21516ba49a7c82e80b213312ae8eadae7`. All source paths below refer to this checkout. No original checkout was edited.

Run `node docs/playtest-lab/run.mjs` from the checkout root. The [probe](playtest-lab/run.mjs) imports the existing `tests/mem-idb.mjs` harness and the real `js/db.js`, `js/laboratory.js`, `js/loot.js` and `js/pets.js`. It evaluates the unmodified Laboratory renderer region extracted from `js/app.js`, as the existing audits do. It also extracts and executes the Stable Destroy handler, Breed bar template and Breed click handler against real services. [evidence.json](playtest-lab/evidence.json) contains the resulting HTML, snapshots, outcomes and disclosure text, indexed by the evidence IDs below.

The probe stubs image markup, icons, DOM endpoints and timer callbacks. The Breed bar's combat-gain text is explicitly replaced with a placeholder; no finding assesses that text. It does not import or boot the entire app, render pixels, emulate a full DOM, connect to a server, bind a socket or drive a browser. Click-handler tests invoke the captured callback with synthetic event objects. IndexedDB is in memory, not the user's live database. Simulated aborts establish transaction behavior within this harness, not OS process-kill durability.

Unless a scenario says otherwise, pets are distinct C1 Drizzle instances, non-shiny, lineage 0, zero banked steps, unbonded, unnamed and unequipped. Each fixture includes the species ownership anchors, migrated level/talent maps and 100,000 coins. Names such as BISCUIT are synthetic. Exact fixture construction is in the probe. “Certain” means the stated state/data/text behavior was reproduced; the assessment of how much it hurts a player remains advisory.

The eight problems Tom previously found were not enumerated in the frozen order. These are twenty candidates for independent triage, not a claim that all twenty are distinct from his unpublished list. The known grey picker and Frost palette complaint are not counted as new findings.

**Ranked findings**

1. **An undispatched experiment can leave the Laboratory locked after a normal health sync. Certain. High impact.**

   Reproduce: own three plain Base pets. Quote the first two, persist the intent with `saveLabIntent`, then interrupt before `animateLaboratory` dispatches. Add a health row for today with 100 steps before reopening. Call the public snapshot three times, then request a new quote. All three snapshots return `unknown`; the new quote also returns `unknown`. All three pets survive, no experiment is spent, and the intent remains.

   The player sees “The experiment's save could not be checked. Reopen The Laboratory to review it before trying again.” Reopening does not resolve it. Recovery demands the old meter and whole quote context still match, even though a health sync can change them without the experiment ever running. This is a dead end with no effective action in the room, not demonstrated pet loss. Source: [js/loot.js](../js/loot.js), lines 1893-1910 and 1985-1988; [js/app.js](../js/app.js), line 21272. Evidence: `intent-health-lock`.

2. **Stable Destroy can consume more training than its frozen review disclosed. Certain. High impact.**

   Reproduce: equip one of two Base pets with 100 banked steps. Open its typed Destroy review. Before committing, sync a 1,000-step health row and run the normal `creditEquippedPetSteps` service. Its bank is now 1,100. Submit the still-open review. The handler succeeds and deletes the 1,100-step bank without refreshing or rejecting the 100-step disclosure.

   The player approved “100 banked steps” and receives a successful salvage toast. Stable captures the bank before opening review, then commits only an IID. Laboratory's quoted live-state check does not protect this sibling destruction action. Source: [js/app.js](../js/app.js), lines 21139-21145 and 21156-21163; [js/loot.js](../js/loot.js), lines 2149-2170. Evidence: `stable-training-before-commit`, `stable-stale-training`.

3. **Breeding away the sole Midnight silently removes a collection cell. Certain. High impact.**

   Reproduce: own one Base and one Midnight Drizzle. Select Base as the keeper and Midnight as the feed pet, with the breed cooldown ready. Execute the two Breed taps. Collection goes from 2/36 to 1/36 and Midnight is gone.

   The bar says “Midnight Drizzle · Lv 1 is destroyed” but never identifies it as the last Midnight or says the Midnight collection cell will empty. There is no typed last-colour review. Midnight also receives no ingredient warning because it has no downstream recipe. This matters most for the pet at the end of the collection path. Source: [js/app.js](../js/app.js), lines 20176, 20544-20556 and 21185-21207; [js/loot.js](../js/loot.js), lines 1454-1468 and 1829-1837. Evidence: `breed-last-colour`.

4. **Stable Destroy omits nickname, bond and talent losses, including in its stronger review. Certain. High impact.**

   Reproduce A: own two Base pets; name the first BISCUIT and give it bond 4 with zero steps and lineage. Destroy it. It takes the quick two-tap path and says only “Base Drizzle · Lv 1 will be destroyed for 60 Bone Dust.” The name and bond maps are erased. Neither loss is named, and the nickname does not identify the pet in the confirmation.

   Reproduce B: destroy a lineage-2 Ember with 50,000 steps and a real unlocked talent choice. The typed review lists steps and lineage but omits the chosen talent, which the service deletes. These are two manifestations of one incomplete Stable disclosure contract; they count as one finding. Source: [js/app.js](../js/app.js), lines 21152-21176; [js/loot.js](../js/loot.js), lines 2150-2152. Evidence: `stable-named-bonded`, `stable-talents`. Laboratory's full confirmation correctly names these losses in the control case.

5. **Breed's warning selects one investment to mention and leaves the others undisclosed. Certain. High impact.**

   Reproduce: feed a lineage-2 Ember with 50,000 steps, BISCUIT as its nickname, bond 4 and a real unlocked talent into a plain Base keeper. The warning says “a lineage 2 pet” and “Its bloodline is lost; lineage does not transfer.” The confirmation never states the 50,000 steps, nickname, bond or chosen talent that are removed. It does display Lv 7 as part of the species label.

   A second probe feeds a level-1 pet with 100 banked steps: no precious-pet warning appears at all. The warning threshold is level 5, not whether training exists. Both execute successfully and clean the input metadata. Source: [js/app.js](../js/app.js), lines 20173-20176, 20548-20552 and 21195-21204; [js/loot.js](../js/loot.js), lines 1459-1463 and 2152. Evidence: `breed-investment`, `breed-low-training`.

6. **Destroying the equipped pet changes the active companion without disclosing the replacement. Certain. High impact.**

   Reproduce: own two plain Base pets and equip the first at zero banked steps. Destroy that pet through Stable. It uses the quick two-tap path. The second pet becomes equipped automatically.

   Neither the arming text nor the successful salvage toast says the selected pet is active or identifies what will replace it. A player can change the pet receiving future training without seeing that consequence in the review. Laboratory explicitly states when its new level-1 result will take the equipped input's place. Source: [js/app.js](../js/app.js), lines 21139-21176; [js/loot.js](../js/loot.js), lines 2155-2157. Evidence: `stable-equipped`, compared with `lab-disclosure-control`.

7. **A legacy shiny carrying a non-Base morph makes collection warnings contradict their own counts. Suspicion about real-save reachability; contradiction reproduced. Medium impact.**

   Reproduce with an imported legacy row `{sp:'C1', shiny:true, morph:'frost'}` plus two ordinary Base Drizzles. Laboratory says only Base is owned; `ownedPairs`, used by Kennel, says Base and Frost. Review the ordinary Base pair. The Ember branch says Base will become empty while its count line says “Base Drizzle: 3 to 1 pets.” The Frost branch says “You already own Frost” while its count line says “0 to 1 pets.”

   Snapshot/adapter cell keys normalize shiny to Base, but pure branch accounting uses the stored morph. Current grants force shiny to Base, so this is not a demonstrated path for a newly hatched pet. The plan requested legacy input exploration, but no authentic historical save proving this combination was supplied. Source: [js/loot.js](../js/loot.js), lines 1825-1826 and 1869-1872; [js/laboratory.js](../js/laboratory.js), lines 41-52; [js/pets.js](../js/pets.js), line 365. Evidence: `legacy-shiny-colour`. Obtain a legacy save before treating prevalence as established.

8. **Excluded pets are shown with invented zero investment. Certain. Medium impact.**

   Reproduce: give a shiny Base pet and a CX pet 50,000 banked steps, the name BISCUIT and bond 4. Open the Laboratory picker with all species. The stored values remain intact, but both rows render Level 1, 0 banked training steps and Bond 0/5, with no nickname. Their exclusions are correctly explained.

   The eligibility fallback substitutes zeros and empty metadata for every rejected input, including valid shiny and CX pets. Players looking for their trained pet see what appears to be a reset or a different animal. A normal legacy pet missing its morph retains its real investment in the control case. Source: [js/loot.js](../js/loot.js), lines 1850-1859; [js/app.js](../js/app.js), lines 21263-21267 and 21382-21383. Evidence: `excluded-metadata`.

9. **An unknown legacy morph looks like usable Base in Stable but is rejected in Laboratory. Certain. Medium impact.**

   Reproduce: keep an ordinary C1 row with `morph:'UNKNOWN'`. Stable's real `petColourName` returns “Base”. Laboratory retains the string as “UNKNOWN”, disables the input and says “This saved colour is not supported.” Its collection cell is not counted as Base.

   Rejecting unsupported data is appropriate. The inconsistent identity and absence of an explanation in Stable make a pet that looks like Base fail a Base recipe. The picker offers no repair path; collecting another pet does not repair this one. Source: [js/loot.js](../js/loot.js), lines 15-17 and 1853-1857; [js/laboratory.js](../js/laboratory.js), lines 7 and 13-14; [js/app.js](../js/app.js), lines 20213 and 21383. Evidence: `excluded-metadata`. The row is not rewritten by the playtest.

10. **The completionist message invites making copies even when every legal pair spends unique colours. Certain. Medium impact.**

   Reproduce: own exactly one non-shiny instance in each of the 36 cells, with an unused daily experiment. The room says “All 36 colours owned. Animate copies, melt spares for Bone Dust, or breed to raise lineage.” Its safe-pair flag is false. Review C1 Ember + Frost: both branches have no gained cell and reduce the collection to 34/36.

   The later review correctly discloses the loss. The room's primary state explanation bypasses the no-safe-pair explanation precisely when there are no spares to support its suggestions. It frames a destructive regression as an optional completionist activity without flagging the lack of copies at this point. Source: [js/app.js](../js/app.js), lines 21279-21282; [js/loot.js](../js/loot.js), lines 1927-1932. Evidence: `completionist`.

11. **One spare produces conflicting instructions about whether a pair can be reviewed. Certain. Medium impact.**

   Reproduce: own two plain Base Drizzles and no others. The room reports one spare and says “You need two spare pets of the same species that match a recipe.” Select both existing pets. Review pair is enabled and the real quote succeeds, although neither branch preserves Base.

   The arithmetic is correct: one copy is reserved in the spare count. The instruction reads as an eligibility requirement, while the engine permits a risky pair. The player cannot infer whether to hatch another pet or use the enabled Review control. The review does correctly require typed confirmation and identify the lost Base cell. Source: [js/app.js](../js/app.js), lines 21282, 21324 and 21388-21396; [js/laboratory.js](../js/laboratory.js), lines 24-32 and 54. Evidence: `one-spare`. See the explicit scenario-premise deviation below.

12. **Midnight is selectable as the first input although no recipe accepts it. Certain. Medium impact.**

   Reproduce: own Midnight plus two Base pets, Ember and Frost. Open the first picker and choose Midnight. Its button is enabled. Open the second picker: all remaining pets are disabled for not matching the recipe. The bench still says “Choose second pet to review a pair” and labels the working recipe “Base + Base”.

   The player must discover that the first choice was impossible, cancel and clear it. There is no first-input explanation that Midnight ends the path. Safe engine rejection prevents consumption, but the picker has led the player into a locally impossible selection. Source: [js/app.js](../js/app.js), lines 21379-21383 and 21393-21396; [js/loot.js](../js/loot.js), lines 1850-1859. Evidence: `terminal-input`.

13. **The first experiment can remove the only visible incubator entry. Certain. Medium impact.**

   Reproduce: start with two Base pets and 100,000 coins. Perform the first free experiment. There is now one coloured pet, `hasExperiment:true`, and no legal pair. The bench no longer contains `data-lab-incubators`, although the real incubator renderer offers purchase of slot 2 and the player meets the prior-experiment and coin requirements.

   Before the experiment the incubator view says to try the free experiment first. After doing so, the entry disappears unless a matching pair remains. The capacity feature becomes undiscoverable just as the explicit onboarding prerequisite is satisfied. This is a navigation problem, not a claim that incubators supply pets. Source: [js/app.js](../js/app.js), lines 21370-21375 and 21403. Evidence: `incubator-hidden`.

14. **An exhausted daily allowance still invites choosing pets that cannot be used. Certain. Medium impact.**

   Reproduce: spend the day's only experiment with more Base pets left. Return to the bench with empty slots. The quota text correctly says the day is used, but both slot buttons remain enabled and the nearby hint says “Choose first pet to review a pair.” Choosing both cannot enable Review until a new allowance becomes available.

   `canWork` gates emphasis, not slot interactivity or the empty-slot prompt. A player can spend time selecting individual pets before meeting a predictable refusal. This is separate from the already-known grey picker presentation complaint. Source: [js/app.js](../js/app.js), lines 21389-21396 and 21493; the same picker binds for a capped snapshot. Evidence: `purchase-cap-control` (`cappedHtml`), `midnight` (`oldHtml`).

15. **Stable's last-colour warning disagrees with the collection's shiny-keeper rule. Certain inconsistency. Medium impact.**

   Reproduce: own one ordinary Base Drizzle and one shiny Base Drizzle. Destroy the ordinary one. Stable requires typing because “This is your last copy of this colour.” The shiny remains and still owns the Base collection cell. Conversely, the Laboratory's shiny-keeper control treats two ordinary Base inputs as safe when that shiny remains.

   Stable compares `petColourName`, which calls the shiny “Shiny”; collection accounting calls it Base. The warning is true if it means the last ordinary appearance, but reads as the collection-loss warning used elsewhere. It needs that distinction to avoid making a correctly preserved cell seem inconsistent. Source: [js/app.js](../js/app.js), lines 21152-21156; [js/loot.js](../js/loot.js), lines 15-17 and 1825-1826. Evidence: `stable-shiny-last-copy`, `shiny-keeper-control`.

16. **A recovered receipt can read like the pet's investment was reset after it was trained. Suspicion about player interpretation; text mismatch reproduced. Medium impact.**

   Reproduce: complete Toxic + Rose, leave the result unseen, then train that result to 50,000 steps and nickname it NEWNAME before reviewing the saved experiment. The live snapshot shows level 7 and NEWNAME. The recovered reveal still says “Level 1. 0 banked steps. Lineage 0. Non-shiny. No inherited name, bond or talents.”

   Those are valid historical birth facts, so this is not a reset or evidence of data loss. The reveal does not say “at creation” or show a historical date beside them, while its remaining-experiments count is current. A user returning after interruption may read the mixed time frames as lost progress. Source: [js/loot.js](../js/loot.js), lines 1875-1884; [js/app.js](../js/app.js), line 21362. Evidence: `old-receipt`. Validate comprehension and recovery flow on a device before promoting this to a confirmed UX defect.

17. **Closing recipe help does not keep it closed during the next species repaint. Certain in renderer/state flow. Lower impact.**

   Reproduce: on an unread room, close “How the recipes work”, wait for the UI preference write, then change species. The stored `introRead` is true, but the room's existing snapshot still has false. `paint()` emits `<details id="labHelp" open>` again.

   The toggle handler persists the preference without updating or rereading the snapshot used by the immediate species-change paint. Reopening the whole room can correct it, but the first in-room action undoes the player's explicit collapse. Source: [js/app.js](../js/app.js), lines 21402, 21485 and 21487-21488. Evidence: `help-stale-snapshot`. This probes the stored flag and actual render output; native details-toggle event timing itself remains unrun.

18. **Leaving the bench open through midnight may strand an available experiment behind a stale disabled Review button. Suspicion. Lower confidence, potentially medium impact.**

   Reproduce on a device: use all capacity, keep a valid pair selected, leave Laboratory foregrounded from 23:59:59 through 00:00:01 without changing focus or sheets. The in-memory service changes from zero to three available uses correctly after a fresh snapshot; rendering the retained old snapshot still shows zero.

   `openLaboratory` subscribes to focus, visibility and sheet-child changes, but has no midnight timer. Since Review is disabled, its fresh-quote path cannot itself recover the state. A wider app lifecycle event might refresh it, which was not exercised in the no-browser harness. Source: [js/app.js](../js/app.js), lines 21457-21476 and 21528-21529. Evidence: `midnight` proves the service rollover and old/new render difference, not the complete foreground UI event sequence. Check both local rollover and travel between timezones on a real device.

19. **Stable's Laboratory ingredient warning may remain attached to the previous pet after a carousel swipe. Suspicion. Lower impact.**

   Reproduce on a device: own a C1 Ember needed for the recipe path and a different species' plain Base. Open Stable focused on the Ember with its talents closed; observe the ingredient note. Swipe to the other species without opening a new sheet or talent panel. Check whether the old Ember note remains under the new pet's Destroy button. Also start on the Base and swipe toward Ember to check for a missing warning.

   The note is appended only during the full render using the original focused pet. `repaintFocus()` updates nickname, equip, destroy, wardrobe and kin controls but does not update `.lab-ingredient`. A full render triggered by another state change can hide this defect. Source: [js/app.js](../js/app.js), lines 20933-20978 and 21103-21109. This is a source-backed lifecycle suspicion, not a browser-observed swipe result. No extra finding is counted for the reverse direction.

20. **A successful incubator purchase may leave its sheet displaying the old balance of capacity and uses. Suspicion about the full UI; handler behavior is explicit. Lower impact.**

   Reproduce on a device: after one experiment, retain enough pets for a pair and enough coins. Open incubators with capacity 1 and zero remaining, then buy slot 2. Observe whether the sheet still says “Capacity: 1 to 2. Today's remaining uses: 0 to 1” and retains the old purchase button rather than presenting slot 3 or the saved capacity.

   The handler disables the button and changes only `labPurchaseStatus`; it does not refresh the snapshot or regenerate the incubator markup. The engine purchase is correct and the status directs the player back to the bench, so this is not a failed payment. The stale purchase presentation can nevertheless make the saved result unclear. Source: [js/app.js](../js/app.js), lines 21577-21588. Evidence: `purchase-cap-control` records the pre-purchase markup and correct post-purchase capacity; the full sheet lifecycle was not executed.

**Coverage and controls that did not fail**

| Scenario | Exercised result |
| --- | --- |
| New account, one welcome-shaped Base pet | 1/36 owned, zero spares, no recipe pair. Room names the shortage and links to eggs. First picker still offers the sole pet. No free pet or guaranteed welcome colour was promised. |
| Mid-collection with odd spare count | Four Base copies plus one Ember, Frost and Toxic: 4/36 owned, three Base spares, correct per-morph counts. |
| All 36 ordinary cells | Exactly 36/36, no safe pair when every cell has one copy; branch losses accurately reduce to 34. Completion copy issue is finding 10. |
| Every unordered morph pair, all six species | 126 actual quote cases; exactly 18 legal, three per species. Repeated with the same IID and cross-species input for 378 total checks. Wrong pairs are rejected. |
| Missing legacy morph | Normalized to Base without rewriting the pet; investment retained. Unknown nonempty morph correctly excluded. |
| Shiny input and ordinary shiny keeper | Shiny input excluded; Base shiny keeper preserves Base and allows a safe ordinary pair. Shiny remains shiny when used as the Breed keeper. |
| Laboratory investment review | Real quote disclosed 50,000 and 100 steps, BISCUIT, lineage 3, bond 4, actual talent name and equipped replacement. Animate cleaned input metadata and created fresh level-1 output. Wardrobe state remained stored. |
| Odds after protection removal | Existing engine audit passed its flat 50/50 collection/species/investment checks and 60,000 draws. Toxic + Rose remains 100% Midnight. Recipe-path copy explicitly says repeats are possible. No ordered-outcome guarantee was found in the exercised ordinary recipe renderers. |
| Today discovery | A real safe-useful state renders discovery; the optional lower-tier duplicate branch remains possible. The probe records this copy but does not count its general invitation as proof of an outcome guarantee. |
| Daily allowance | Zero remaining after spending; one remaining at the initial/free and purchased-slot stages; two remaining after one use of capacity 3; three remaining after midnight. Pure/service reset works. Capacity itself is 1-3; zero is remaining allowance, not a purchasable zero-capacity configuration. |
| Timezone change | LA to Tokyo can advance the local day and grant the next bucket. Returning to LA is refused as `clock-backwards`; no earlier bucket is reopened. The error says to check automatic date/time, even when it is already correct. This wording concern is recorded as context, not counted as an additional finding. |
| Purchase 3 without 2 | Public adapter returns `prerequisite`; no slot granted. |
| Insufficient coins | 19,999 coins cannot buy slot 2; adapter returns `insufficient-coins`, UI gives the exact one-coin shortage. |
| Duplicate purchase | Same operation replay succeeds without charging twice. Slot 2 debits exactly 20,000; slot 3 then debits 40,000. Existing audit also rejects competing new operations for an owned slot. |
| Interruption during consuming transaction | Existing real-service audit aborts after the destructive roster write and injects faults at every listed write boundary. Both input pets, output and daily debit roll back. The faulty split-transaction control demonstrates the loss detector. No production destroy/create split was found. |
| Lost completion response and retry | Existing integration audit recovers the stored receipt, prevents duplicate minting and confirms abort readback. These controls pass despite the changed-health pre-dispatch recovery problem in finding 1. |

**Proof output**

The agreed command was run exactly, with stdout/stderr captured:

```text
$ node tests/unit.test.js

371 passed, 0 failed
exit code: 0
```

The [unit output](playtest-lab/unit-output.txt) is the complete captured stream. Additional bounded checks:

```text
node docs/playtest-lab/run.mjs
Completed 31 evidence groups; 378 recipe checks. No app mutations.
exit code: 0

node tests/laboratory-audit.mjs
10/10 Laboratory guards passed
exit code: 0

node tests/lab-integration-audit.mjs
All 13 printed CONTROL groups passed
exit code: 0
```

Full existing-audit streams: [engine-output.txt](playtest-lab/engine-output.txt), [integration-output.txt](playtest-lab/integration-output.txt). The exploratory probe had temporary extraction/stub errors while being constructed; these were confined to the new probe, corrected, and rerun. They are not reported as app failures. The final probe exit is zero; it deliberately records undesired existing behavior rather than asserting the app is bug-free.

**Files changed**

All six files are new:

- `docs/PLAYTEST-LAB.md`: this advisory report.
- `docs/playtest-lab/run.mjs`: reproducible in-memory probe.
- `docs/playtest-lab/evidence.json`: generated observations and real renderer output.
- `docs/playtest-lab/unit-output.txt`: complete agreed proof output.
- `docs/playtest-lab/engine-output.txt`: existing engine audit output.
- `docs/playtest-lab/integration-output.txt`: existing integration audit output.

No application source, assets, existing tests or configuration changed. No commit, push or publish was performed.

**Denied or blocked actions, deviations and device work**

No approval request or sandbox denial occurred. No requested permitted action remains blocked. Sockets and browser/device operation were deliberately unrun under the frozen order, not attempted and then claimed as passing. No external communication or deployment was attempted.

One scenario premise required an explicit interpretation: “one spare, so no legal pair exists” conflicts with the actual engine, which permits consuming the keeper plus the spare with a last-colour warning. This was reported during execution. The playtest treats that state as **no safe pair**, also exercises the legal risky pair, and records the conflicting UI instruction in finding 11. No eligibility rule was changed or silently redesigned. Supporting probe/evidence files were added alongside the requested report to make the findings reviewable; no application changes were substituted for the requested investigation.

Real-device work still needed: foreground midnight and timezone rollover; native health sync during an open review and after interruption; actual process termination before dispatch, during IndexedDB commit and after commit before response; browser history/sheet refresh and focus restoration; ingredient warnings across carousel swipes; incubator success presentation; stale receipt comprehension; narrow-screen and enlarged-text reachability; screen-reader names; art loading, image retry, Base/Frost distinction and colour swatches. None of those pixel, assistive-technology or OS durability outcomes is claimed by the in-memory results.
