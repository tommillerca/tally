# What each patch note claims, and what backs it

## vNEXT

Changelog item: The off-hand brushes and spades are held properly now.

1. PROOF: MANUAL operator's frozen Round 5 shipping-avatar comparison against correctly held IL7-1 Blue Katana, plus `facegate-audit.mjs` for the source face-coverage constraint | REACH: IL17-1/2 at (+24,+32), IL10-1/2 at (+22,+86), relative to the preserved original 640 masters. The operator reports searching under the facegate constraint and choosing these offsets by rendered comparison at 393x852 DPR 2. The earlier four rendered search rounds (operator rounds 1, 2, 3 and 4, individually unnamed in the order) selected Round 4's visually approved candidate, which facegate rejected at 28.53% brush coverage against a 2% limit. Round 5 supersedes that candidate and the v544 alignment claim below. No new version stamp or release is made here.

Local [pixel proof](offhand/round5-pixel-proof.txt) and [reproducible source verifier](offhand/round5-verify-translation.py) establish exact translation and unchanged surviving RGBA values, not rendered grip. Local source face coverage is 0.00% for both spades and 1.62%/1.61% for the brushes, below 2%; the operator's table said 1.64% for both brushes. Exact offsets are preserved. Round 5's zero-loss assertion cannot hold for the original spades: 7 and 10 export-dust pixels at alpha <=30 leave the frame. The plan's explicit dust-loss allowance is used; no pixel above alpha 30 is lost. The surviving alpha>0 ink boxes and complete alpha>30 ink boxes move by exactly the requested offsets. The complete original alpha>0 boxes cannot do so because the dust is clipped. Both brushes lose zero pixels. Derived 192, 384 and trim thumbnails use the project's generator.

Rendered acceptance is attributed to the operator's frozen instruction. Existing [brush 1 before](offhand/oh-before-IL10-1.png), [brush 2 before](offhand/oh-before-IL10-2.png), [spade 1 before](offhand/oh-before-IL17-1.png), [spade 2 before](offhand/oh-before-IL17-2.png) and [katana control](offhand/oh-before-IL7-1.png) are historical operator captures. Existing after images are not certified Round 5 captures. No independent final screenshot or numeric rendered gap is claimed. See the [Round 5 advisory](offhand/round5-report.md) for current proof output, deviations and capture limitations.

Validation: `node tests/unit.test.js` exited 0 with `384 passed, 0 failed`; `node tests/facegate-audit.mjs` exited 0. All 159 unique PURE entries enumerated from `tests/release-gate.mjs` exited 0, including thumbnail freshness. [Enumeration and exits](offhand/round5-pure-results.txt). Fresh browser capture exited 1 on `listen EPERM`; the PURE result does not claim browser proof. The zero-loss requirement remains unmet only for the explicitly reported export dust.

## v543 (2026-09-09)

Changelog item: Every racer in the step race shows their figure and an honest progress track, even when a friend has not shared an outfit.

1. PROOF: steprace-live-browser-audit.mjs | REACH: Tom, on the live build: "the steprace still isnt showing the progress bar and player profile pic on live", after saying of an earlier operator screenshot "leaderboard looks fine in your screenshot but doesnt look like that on live". CAUSE: the race row passed a friend's stored outfit straight to avatarLayersHtml, so a friend whose profile carries no valid body or skull rendered no figure at all; the harness fixture gave every friend a complete outfit, which is why the operator's capture looked healthy and Tom's phone did not. FIX: the row falls back to B0-1/SK0-1 and marks the figure a placeholder with its own aria-label, and the track reads 0 with "Progress comparison unavailable until recent syncs" rather than drawing a bar from steps it does not have. NO STEP COUNT IS INVENTED; this project has nine prior instances of a count reporting the render rather than the data. VERIFIED BY THE OPERATOR IN A REAL BROWSER (the builder's sandbox cannot bind a listener): Chromium headless=shell, 393x852 at DPR 2, all five crew states PASS on painted avatars and measured honest tracks, including the degraded state that is Tom's actual report. leaderboard-honesty-audit.mjs holds at 49 passed. LIMIT: a friend who has NEVER synced cannot appear in the server's race query at all, so the degraded case exercised is a stale partial profile, not a never-synced one.

## v544 (2026-09-09)

Changelog item: The off-hand brushes and spades are held properly now.

1. PROOF: MANUAL operator's four render-and-look rounds in the shipping avatar against the correctly held IL7-1 Blue Katana control, as recorded in the frozen work order's Round 4 | REACH: Bonehead tab with IL17-1/2 spades translated by (0,+40) and IL10-1/2 brushes by (-40,+45), applied exactly to the 640 masters. The operator reports the handles pass through the fist and the heads clear the skull. This pending note is for assembly; no release or version stamp is advanced here.

The operator's four rendered search rounds selected these offsets, superseding the failed source-composite approach and the Round 3 guesses. The supplied order does not individually name or number the four render runs: they are recorded here as operator rendered search rounds 1, 2, 3 and 4, without inventing a per-round offset history. Its reported comparisons reject spade +60 vertically (blade crosses the skull), spade -24 or farther left (blade behind the head), brush -30 horizontally (handle right of fist) and brush -50 (head crosses the skull).

[Round 4 pixel proof](offhand/round4-pixel-proof.txt) establishes exact integer translation, unchanged surviving RGBA multisets and zero visible pixels lost. It does not measure rendered grip. The existing [brush 1 before](offhand/oh-before-IL10-1.png), [brush 2 before](offhand/oh-before-IL10-2.png), [spade 1 before](offhand/oh-before-IL17-1.png), [spade 2 before](offhand/oh-before-IL17-2.png) and [katana control](offhand/oh-before-IL7-1.png) are operator captures. Existing oh-after screenshots belong to the earlier candidate evidence and are not asserted to show these final offsets. Final-offset screenshot pairs and numeric rendered gaps are not supplied by Round 4. Alignment acceptance is attributed to the operator's frozen instruction, not an independent render in this sandbox. See the [Round 4 advisory](offhand/round4-report.md) for proof results and limitations. The historical hand-registration source diagnostic is not evidence of correctness.

Validation for this pending change: `node tests/unit.test.js` exits 0 with `384 passed, 0 failed`. All 159 PURE entries ran: 158 exit 0, `facegate-audit.mjs` exits 1 on the four requested offsets (brush overlap 28.53%/28.52%, spades 4.26%/4.44%, against 2%). All-PURE-green acceptance is unmet. Fresh renderer capture is blocked by `listen EPERM`; retain the exact offsets for independent review and reconcile the source facegate with rendered face visibility before assembly.

## v542 (2026-09-09)

Changelog item: Shiny pets now hold the same Base collection cell in the Kennel and Stable loss warnings, even with an unsupported saved colour.

1. PROOF: collection-cell-audit.mjs | REACH: Stable Destroy and Breed disclosures execute production handlers with real destruction quotes over in-memory IndexedDB. C2 shinies cover null, unsupported sparkle and all six supported morphs; the player-facing collection-cell warning and unchanged roster before consent are asserted. Every ordinary species is checked against an independent cell counter. Shinies retain Base ownership because that is the existing Kennel meaning, including unsupported saved morphs; Laboratory ingredient eligibility and recipe policy are unchanged.

Changelog item: Destroying a plain Base pet no longer says it is your last colour copy when a shiny pet still holds that cell. Losing a shiny appearance still gets its own warning.

2. PROOF: collection-cell-audit.mjs | REACH: Stable Destroy, with a C6 Base and shiny keeper, checks the actual disclosure string and safe two-tap removal. Null, unsupported sparkle and every supported shiny morph are covered. The reverse selection retains the last-shiny appearance warning without falsely claiming cell loss.

Scope and evidence limits: the guard was RED before implementation (105 passed, 17 failed). The hostile roster's independent count, Stable door text and aria-label, Kennel heading and seven filled dots passed before the fix and remain seven. These are production-template and handler checks with DOM doubles, not browser layout proof. The original handoff's exact rows were unavailable in this checkout, so the guard reconstructs its listed traits (CX, sparkle, null, shiny Ember and duplicate iid) with the required seven-cell total; exact fixture identity is unverified. R6-C4 is deferred to `petDestructionHtml` in `js/app.js:21508`. R6-C2 naming and R6-C3 Breed gate changes remain with the app lane. No version stamp is advanced.

Validation: `node tests/unit.test.js` exited 0 with `384 passed, 0 failed`. `node tests/collection-cell-audit.mjs` exited 0 with `122 passed, 0 failed`; the final guard also exited 1 against disposable pre-fix sources with `105 passed, 17 failed`. All 156 PURE entries, enumerated from the declaration and registrations in `tests/release-gate.mjs`, ran in separate Node processes and exited 0. `node tests/release-gate.mjs --coverage-only` exited 0. Off-grid `ownedPairs` keys, including CX, retain their historical API behavior; the agreement assertion compares actual grid cells, as the Kennel counter does.

Changelog item: Backups can reconcile duplicate offline incubator purchases, keep both purchase receipts, refund the duplicate price once, and continue backing up other progress.

1. PROOF: r6-merge-audit.mjs | REACH: real production purchase, import, export, encryption and cloud CAS functions over the existing in-memory IndexedDB harness and simulated transport. Registered in PURE, including both 100,000 and 25,000 coin opening wallets. The pre-fix baseline at 3a403423999f542ee08cb4758d619f946e3c9c6f fails all four import arms (both directions, replace false/true), omits unrelated incoming rows, and cannot push after a 409. The existing product fix preserves incoming rows in every store, both immutable purchase receipts and exactly one full refund; both original device databases recover without erase. Additive imports also retain local-only rows. Cloud push and pull preserve every unrelated test row. Replay, stale backups, spending the refund, a third independent buyer, separately earned slot 3 and injected transaction aborts are exercised. Historical evidence: [before](r6-merge/before.txt), [after](r6-merge/after.txt), [small wallet](r6-merge/low-wallet.txt). No browser or production-network claim. The notice is returned and persisted, but visible disclosure and R6-E3/R6-E4 remain BLOCKED by the frozen app/loot ownership boundary. This is not complete acceptance of the work order.

The corrected work order matches SHA256 `860e00ed815f37f64c9bb797d2fc970371b9e4406e4916b0384d4dfc941b7a80`. This continuation registers the existing guard and retains the product fix. The earlier [advisory report](r6-merge/REPORT.md) describes round 1; its test-registration blocker is resolved here. No version stamp changes.

Purchase policy: keep both immutable paid receipts, retain one active copy of the numbered incubator, and refund the other purchase's full 20,000 coins exactly once. This explicitly differs from keeping both purchases active: the existing slots and capacity stay intact, while the refund preserves all earned coin value. `replace: true` retains its existing replacement semantics for unrelated local-only rows. R6-E1 experiment reconciliation is unchanged.

Remaining ownership blockers: visible E2 disclosure needs the file-import result handler in `js/app.js:22245` and the cloud notice UI; R6-E3 needs `js/app.js:22184` to reuse the honest Settings copy; R6-E4 needs `js/loot.js:1687` and `js/app.js:21338`/`21544` to distinguish a known concurrent action from an uncertain save. The correction still forbids the loot edit and assigns app.js to another lane. Those fixes are proposed for their owning lanes, not claimed here.

Changelog item: The breeding scroll audit now distinguishes an unselected fixture from a missing loss warning; browser proof is pending.

1. PROOF: breed-sheet-scroll-audit.mjs, r6-guards-audit.mjs | REACH: R6-A4. Node DOM-model control reproduces picked=0 with the old child-dot selector and picked=2 with the current button selector. Actual warning, gutter, touch and cover assertions are UNPROVEN: the browser audit is in DECLARED full and loopback listen is denied. Operator command: node tests/breed-sheet-scroll-audit.mjs.

Changelog item: The Stable stale-quote audit now enters quick confirmation and checks nickname changes and equipped-only pending health credit.

2. PROOF: stable-stale-disclosure-audit.mjs | REACH: R6-G1. The first quick tap must arm a and open zero sheets. A new nickname stales consent, preserves the pet and requires typed approval. A separate 1,000-step pending health row belongs to equipped b and does not block unequipped a.

Changelog item: The Breed loss audit now runs the breed handler and exposes the known missing-investment disclosure.

3. PROOF: stable-loss-disclosure-audit.mjs | REACH: R6-G2. The registered PURE audit now invokes breed mode. Expected RED R6-S3: same-cell Breed confirmation omits banked steps, nickname loss, bond, talent choices and lineage loss. App lane owns the fix; no assertion is weakened.

Changelog item: The Laboratory room audit now counts all 16 declared findings, including equipped replacement and shiny collection disclosure.

4. PROOF: lab-room2-audit.mjs, r6-guards-audit.mjs | REACH: R6-G3 and R6-A2. Denominator is the declared 5 to 20 range. Missing-key controls report 14/16. All 16 guards execute: finding 6 passes; finding 15 remains expected RED for ambiguous ordinary-appearance versus preserved collection disclosure, owned by the app lane.

Changelog item: The Laboratory recovery checks now require the health-writing audit for finding 1.

5. PROOF: lab-lock-recovery-audit.mjs, lab-health-recovery-audit.mjs, r6-guards-audit.mjs | REACH: R6-G4. Release coverage requires the health guard on disk and exactly once in PURE. Direct lock audit imports and executes health scenarios. Deletion and deregistration controls fail even when lock recovery remains registered.

Changelog item: The Laboratory evidence now labels its current capture separately from the historical pre-fix observations.

6. PROOF: r6-guards-audit.mjs, lab-room2-audit.mjs | REACH: R6-A3. Evidence metadata labels the post-fix recapture, source hashes and Node limitations. PLAYTEST-LAB labels the ranked narrative as historical and gives current dispositions. No original pre-fix JSON capture is invented.

Changelog item: Breeding refuses changed loss disclosures and asks you to review the current training steps again.

1. PROOF: r6-app-audit.mjs | REACH: R6-S3: Stable Breed panel shows 100 steps, real creditEquippedPetSteps lands 20,000, first tap refuses and re-renders 20,100 without arming or spending. A further credit during typed review is refused inside the real breed service; consent clears before a successful retry. Node services and DOM doubles only; browser acceptance remains unproven.

Changelog item: The Stable Laboratory door counts saved waiting operations, including experiments still in flight.

2. PROOF: r6-app-audit.mjs | REACH: R6-R1: Stable door reads labIntents plus unseen labExperiments, deduplicated by operation ID and excluding labSeen. Empty and deliberately inflated render lists both display the same durable count; ready and unknown empty controls are checked. Node services and DOM doubles only; browser acceptance remains unproven.

Changelog item: Feeding an invested pet into breeding requires typing DESTROY, matching the Laboratory review.

3. PROOF: r6-app-audit.mjs | REACH: R6-C3: Stable Breed on a named, bonded, trained pet with lineage and talent remains unspent after two taps and wrong text; DESTROY succeeds. Ordinary surplus still succeeds on two taps. Node services and DOM doubles only; browser acceptance remains unproven.

Changelog item: Destruction warnings name the collection cell a shiny pet holds as Base.

4. PROOF: r6-app-audit.mjs | REACH: R6-C2: A real destruction quote for the last shiny Base cell renders Your last Base, with an Ember naming control. Cell ownership code is unchanged in this lane. Node services and DOM doubles only; browser acceptance remains unproven.

Changelog item: Incubator purchases are disabled when they would add no experiment uses today.

5. PROOF: r6-app-audit.mjs | REACH: R6-R2: An affordable 20,000-coin incubator with remaining uses 0 to 0 is disabled; 0 to 1 is enabled, and insufficient coins remain disabled. Node services and DOM doubles only; browser acceptance remains unproven.

Changelog item: Interrupted experiments keep the Today and post-hatch invitations into the Laboratory available.

6. PROOF: r6-app-audit.mjs | REACH: R6-A1: A valid saved intent makes the real presentation-only snapshot unknown with zero remaining. Production Today markup and the post-hatch callback retain Open Laboratory. Explicit Today hiding is respected. Node services and DOM doubles only; browser acceptance remains unproven.

The six guards pass on the inherited round 1 product fixes. Each fails against the pre-fix `js/app.js` from `3a403423` using `R6_APP_SOURCE` and otherwise the same checkout modules. This is historical RED proof, because the initial checkout already contained the product fixes. No product fix or version stamp was rewritten. Full PURE acceptance and browser verification are reported separately; these rows do not assert a green release gate.

Validation: `node tests/unit.test.js` exits 0 with 384 passed, 0 failed. `node tests/r6-app-audit.mjs` exits 0 with six passed. Coverage registration passes. The complete final PURE census has 156 entries: 149 exit 0, six exit 1, one exit 97 using the gate lifecycle preload. Nonzero entries are breed-last-colour-audit.mjs, breed-two-tap-audit.mjs, lab-ui-audit.mjs, kennel-copy-audit.mjs, stable-rooms-top-audit.mjs, m5-prove-red.mjs and verify-tail-audit.mjs. Existing test-context/expectation conflicts and lifecycle parsing of expected child failures require changes outside this lane. No audit was removed to obtain green.

Browser acceptance remains unrun under the stated listener restriction. The current BROWSER tier contains 123 audits. Run `node tests/release-gate.mjs --all` from this checkout on the operator machine, including the destructive-action and layout coverage in kennel-copy-browser-audit.mjs, breed-sheet-scroll-audit.mjs and sheet-action-reachable-audit.mjs. Node proof does not establish browser reachability or pixel layout.

Integration addendum for v542 (existing rows above retained as lane history):

| Updated claim | PROOF | REACH |
| --- | --- | --- |
| Ordinary Base appearance loss is distinguished from the Base cell retained by a shiny. Breed investment disclosure and required health-guard coverage now pass after assembly. | lab-room2-audit.mjs, collection-cell-audit.mjs, stable-loss-disclosure-audit.mjs, r6-guards-audit.mjs | Stable Destroy and Breed disclose the lost ordinary appearance on the quick path while preserving shiny Base ownership. Typed reviews retain investment losses. The release gate invokes the finding-coverage requirement. This supersedes the expected-red status of findings 15 and R6-S3 above. Node services and DOM doubles only; no browser or deployment claim. |

See [the integration advisory](train542-integration/REPORT.md) for the per-audit diagnosis, complete PURE census and red-control evidence.

## v541 (2026-09-09)

Changelog item: The off-hand brushes and spades are back to how they looked before the last change.

1. PROOF: hand-registration-audit.mjs | REACH: Tom, on the live build: "you made the offhand problem worse now the shovel tooth bursh and flag are further off the bonehead wtf". v536 translated four off-hand masters (IL10-1/2 by +30,+104 and IL17-1/2 by +44,+68) on the strength of a Python composite over assets/bh/B/B0-1.png. That is NOT the renderer the app ships and no screenshot of the real avatar was ever taken, which is exactly what the verification contract forbids. All thirteen files (four masters, eight 192/384 thumbnails, one trim) are restored to their pre-v536 bytes, verified by git hash-object against the v535 blobs, four of four masters matching. tests/hand-registration-audit.mjs is demoted in the same commit: it grades a source composite and its header now says so, because it cannot evidence rendered registration. THE UNDERLYING DEFECT IS STILL OPEN: the off-hand items were misaligned before v536 and are misaligned again now. This change only removes a regression that made it worse; it is not a fix, and the CHANGELOG says so in the player's words.

## v540 (2026-09-09)

Changelog item: The Boneyard intro and location error screens now allow scrolling as text grows.

1. PROOF: boneyard-scroll-audit.mjs | REACH: Tom, 2026-09-09, on the live build via OPEN-ITEMS R5-S1: the Boneyard screen does not scroll. MEASURED BY THE OPERATOR in a real browser (the builder's sandbox cannot bind a listener, so the rendered half was blocked for it), Chromium headless=shell, 393x852 at DPR 2, demo save, Boneyard tab: BEFORE, `.sheet-body.map-sheet` computed `overflow-y: hidden` with scrollHeight 920 against clientHeight 741, so 179 px of content (19.5%) was unreachable and no ancestor scrolled; the screenshot shows the spawn list cut mid-item behind the dock. AFTER, that element no longer clips and `MAIN.screen--map` is the scroll owner at `overflow-y: auto`, scrollHeight 920 against clientHeight 741, so the same content is reachable. The source guard rejects the old clipping rules. NOT MEASURED and not claimed: behaviour at 150% text, main-button coordinates, refresh/route scroll retention and dock hit tests. The reported 55% is NOT adopted; 19.5% is what this checkout measures on a demo save, and a fuller account may differ.

v538 did not change app.css or renderBoneyard, as confirmed by matching hashes
in [source evidence](boneyard-scroll/v538-source-evidence.txt). It removed the
viewport zoom lock. Whether that worsened physical zoom behavior is unverified;
no rendered before/after conclusion is claimed. Version stamps are unchanged.

Validation: `node tests/unit.test.js` reports 382 passed, 0 failed. All 154 PURE
entries have exit-0 results across the complete enumeration and a targeted
guard-hygiene rerun. The initial failure and final results are retained in
[the census](boneyard-scroll/pure-results.txt). Browser acceptance is blocked.

## v539 (2026-09-09)

Changelog item: All pets now share the same base combat stats, raised without reducing existing stats. Shiny and breeding bonuses stay earned.

1. PROOF: pet-parity-guard.mjs, pet-family-audit.mjs, pit.test.js, unit.test.js | REACH: all seven multipliers equal 1.36 and every tilt is identical; levels 1-10, ordinary/shiny and lineage 0-30/1000 retain at least every pre-parity numeric stat. Original-source parity guard exited 1, showing the 1.00-1.36 spread. Current guard exits 0. Family identity, talent trees, signatures and effect dispatch remain frozen; 13,552 serialized builds match 70 explicitly updated build hashes; all 54,208 effects retain their historical hashes. Original hashes and fixture are retained.

Changelog item: Pet balance checks now use an equipped, fully specced player with an ordinary pet and compare every foe with the same player fighting without a pet.

2. PROOF: fight-sim.mjs, pet-stress-guard.mjs, unit.test.js | REACH: step-2 pre-parity measurement below preceded the new ceiling. The ordinary board is 70 cells (7 species x 2 food states x 5 foes), each 200 paired seeds. Current maximum 77.5% passes the 85% ceiling; every daily-Glutton cell retains the matched-control +5 percentage point assertion. Actual pet-body stats multiplied by 1000, with the same engine/player/foes/seeds, make the guard exit 1: C1 Crow Lord/dailyGlutton 91.0% exceeds 85%, and the full runaway board peaks at 100%. Empty, duplicate, malformed, saturated, no-contribution and moved-control samples are also rejected.

### Frozen work order and explicit deviation

2026-09-09 plan SHA256: `7c7466174cd8180b6a2ce3e94c3f916edf325c22fee105678df70ba53566451a`.
All source paths were resolved within this checkout. No version stamp is changed.

A literal copy of C2's tilt cannot satisfy "no player loses power": at the existing 1.5 combined cap, C1 would lose reflex/wind and C5 marrow/HP. The reported deviation uses the componentwise maximum of the old tilts: power 1.12, marrow 1.15, wind 1.06, reflex 1.12. Every multiplier is exactly 1.36. C2's multiplier is unchanged but its tilt improves too. This is the smallest shared tilt that never reduces a capped stat. `SHINY_STAT_MULT=1.08`, `PET_LINEAGE_STEP=0.05`, and the existing combined cap 1.5 are unchanged. No pet trees, Pit ladder, foe stats, or production fight mechanics were changed.

### Step 1: source-derived player, fixed before observing outcomes

This is a plausible equipped midgame scenario, not a population survey or a claim that one loadout covers every competent player.

- Level 16 is the first level with 15 talent points (`js/pit.js` `talentPoints`). It requires 9,180 XP (`js/game.js` `xpForLevel`). The existing `BUILDS` Crow Lord flock spends all 15 points, with every acquisition checked against `TALENT_TREES` and `canTakeTalent`, including tier gates and ranks. It is an established active player's build, not the talentless baseline.
- Base stats use shipped `deriveStats()` (20 each) and `allocatedStats()` (+2 per training point). The explicit plausible activity budget is 30 protein days + 30 closed days + floor(250,000 lifetime steps / 25,000) = 70 training points, using `js/app.js` `buildFighter`'s grant formula. All 70 are spent, 14 per stat, without assuming a migration grant. Balanced allocation avoids selecting a stat skew after measuring wins. These activity counts are scenario assumptions, not telemetry.
- Gear uses `js/gear.js` `GEAR_ITEMS`, derived from `data/boneheadz.js`, in `GEAR_SLOTS` order. Alternate rare/uncommon, select the first eligible catalogue ID in each slot, and treat each selected piece as owned. These tiers unlock well before level 16 (`GEAR_MIN_LEVEL` and `SLOT_LEVEL_OFFSET`); four retained uncommon pieces and four rare upgrades form a mixed progression wardrobe. No legendary or outcome-selected best-in-slot equipment is assumed. All selections appear below.
- The shipped `gearStats`, `gearSetInfo`, `gearTalents` and `gearArmor` helpers apply ownership and level checks. Two-piece gravecaller and gravewarden bonuses yield final stats power 63, marrow 65, wind 56, reflex 57, hype 65. Gear armor is physical 26, spell 20. The harness now passes that armor to `makeFighter`, as the real caller does. Gear/set extras exclude already learned talents and `lightfeet`, matching `js/app.js` `ECONOMY_TALENTS`. This particular wardrobe grants no extra talents.
- Each ordinary pet is level 6, non-shiny, lineage 0: 30,000 steps since this hatch from `js/pets.js` `PET_LEVEL_STEPS`. A recently hatched companion on an established account is plausible. Each takes the first legal option at levels 2, 4 and 6 from its shipped `PET_TREES`. All seven species are covered, with CX explicitly representing a founder account, not a current egg drop.
- The two food states are no dish and Skewer (`js/cooking.js` `RECIPES`, saved `petFree` buff). The paired control removes only the pet, preserving stats, armor, talents, food, foe and seed. `smartPlayerTurn` supplies the same competent policy throughout. `FOES` remains the existing five complete encounter configurations, including talents, AI and adds.

| Slot | Catalogue ID | Tier | Minimum level |
|---|---|---|---:|
| IR | g-IR1-slab | rare | 8 |
| IL | g-IL1-1-gravewarden | uncommon | 2 |
| T | g-T10-1-greyhound | rare | 8 |
| P | g-P2-ringmaster | uncommon | 2 |
| FW | g-FW1-boneshaman | rare | 6 |
| H | g-H10-1-gravecaller | uncommon | 1 |
| U | g-U1-gravecaller | rare | 6 |
| S | g-S1-1-gravewarden | uncommon | 1 |

### Step 2: full pre-parity table, before adding or moving a ceiling

Command: `node tests/fight-sim.mjs --stress-only --seeds 200`.
Each cell is **pet win% / matched no-pet win%**, seeds 1-200 multiplied by 7919. Printed in full to the operator before editing `js/pets.js` or setting the new ceiling.

| Pet and loadout | Daily Glutton | Champion | Endless 1 | Glutton 10 | Wanderer 13 |
|---|---:|---:|---:|---:|---:|
| C1 Crow Lord | 66.0/5.5 | 32.5/1.5 | 20.0/0.5 | 18.5/2.5 | 40.5/12.0 |
| C1 Crow Lord + Skewer | 69.0/5.5 | 39.0/1.5 | 24.5/0.5 | 25.5/2.5 | 45.0/12.0 |
| C2 Crow Lord | 73.5/5.5 | 37.0/1.5 | 30.0/0.5 | 24.5/2.5 | 39.0/12.0 |
| C2 Crow Lord + Skewer | 74.5/5.5 | 37.5/1.5 | 33.0/0.5 | 26.0/2.5 | 40.5/12.0 |
| C3 Crow Lord | 49.5/5.5 | 24.0/1.5 | 11.0/0.5 | 20.5/2.5 | 49.0/12.0 |
| C3 Crow Lord + Skewer | 52.5/5.5 | 28.5/1.5 | 13.5/0.5 | 27.5/2.5 | 51.5/12.0 |
| C4 Crow Lord | 46.5/5.5 | 20.0/1.5 | 8.5/0.5 | 19.0/2.5 | 40.5/12.0 |
| C4 Crow Lord + Skewer | 49.5/5.5 | 23.0/1.5 | 11.5/0.5 | 24.0/2.5 | 43.0/12.0 |
| C5 Crow Lord | 61.0/5.5 | 34.5/1.5 | 23.5/0.5 | 18.0/2.5 | 37.5/12.0 |
| C5 Crow Lord + Skewer | 62.5/5.5 | 34.5/1.5 | 27.0/0.5 | 20.0/2.5 | 38.0/12.0 |
| CX Crow Lord | 55.0/5.5 | 29.5/1.5 | 14.0/0.5 | 23.5/2.5 | 48.5/12.0 |
| CX Crow Lord + Skewer | 58.5/5.5 | 32.0/1.5 | 16.5/0.5 | 32.0/2.5 | 51.0/12.0 |
| C6 Crow Lord | 55.0/5.5 | 29.5/1.5 | 14.0/0.5 | 23.5/2.5 | 48.5/12.0 |
| C6 Crow Lord + Skewer | 58.5/5.5 | 32.0/1.5 | 16.5/0.5 | 32.0/2.5 | 51.0/12.0 |

Finding: this profile is not steamrolling. Its pre-parity peak is 74.5%; even the easiest foe wins more than one fight in four against the strongest measured ordinary cell. This does not establish difficulty for every talent/gear combination or the separately labelled extreme pet. No ceiling was changed to obtain this finding.

### Step 4: challenge gate and provenance

After that table and parity, but before measuring post-parity outcomes, the new ordinary ceiling was set to 85%, giving 10.5 percentage points above the pre-parity maximum while still requiring at least 15% losses in every cell. It replaces the old synthetic median/peak bands, which have no justification on an equipped profile. It is an observed fixed-seed regression ceiling, not a population guarantee. No-pet wins are pinned to `[11, 3, 1, 5, 24]` in foe order for both food states. The +5pp daily contribution assertion survives unchanged in meaning. Current ordinary min/median/max is 18.0/37.0/77.5%.

The main board has 70 cells instead of 105: on this single competent talent profile the former talentless Skewer row would duplicate Crow Lord + Skewer. Both food states and all species/foes remain represented. This sample change is explicit, not an attempt to retain the v519 distributions.

The v519 board is retained as `historicalPetStressBuilds` / `historicalPetStressCells`, with the original 105 identities, maxed shiny lineage20 pets, talentless Skewer row and ungeared Crow rows. Its original `KINDS`, `FOES`, `controlWins` and assertion function with PROVENANCE comments remain in `pet-stress-guard.mjs`. `--historical-check` explicitly compares current code with that old band; it is not the ordinary gate. `--stress-only --historical-stress` prints the old scenario using current pet code. **The win-rate figures in v519 were measured on synthetic isolation profiles and do not describe real play.** The historical prose and figures below remain intact and must not be relabelled as real-player results or as measurements of the new parity code.

Finding: the extreme board peaks at 96.5% (C1 Crow Lord versus the daily Glutton), with 14 of 70 cells above 85%. The top end does steamroll that foe. This is disclosed, without raising the ordinary ceiling or changing foes.

The new realistic owner with a maxed shiny lineage20 pet is a separate **EXTREME ONLY** board (`--stress-only --extreme-stress`, also printed by the default simulation). It is descriptive and is not folded into the ordinary 85% ceiling.

### Validation receipt

- `node tests/unit.test.js`: exit 0, `384 passed, 0 failed`.
- `node tests/pit.test.js`: exit 0, `100 passed, 0 failed`.
- `node tests/pet-family-audit.mjs`: exit 0, `14 passed, 0 failed`; 13,552 builds and 54,208 effects checked.
- `node tests/pet-parity-guard.mjs`: pre-parity exit 1, current exit 0. Original multipliers: C3/C4 1.00, C5 1.09, C1 1.27, C2 1.36, CX/C6 1.15. Original guard failure: `C3: multiplier must equal old top 1.36`, `1 !== 1.36`.
- `node tests/pet-stress-guard.mjs --control-overpowered`: exit 1, `C1 Crow Lord/dailyGlutton: 91.0% exceeds 85% realistic ceiling`. The actual overpowered input peaks at 100%.
- `node tests/pet-stress-guard.mjs`: exit 0, ordinary min/median/max `18.0/37.0/77.5%`, 70 cells x 200 paired fights, daily +5pp floor and frozen realistic controls pass.
- `node tests/fight-sim.mjs --seeds 120`: exit 0, full build table pasted below. Its dummy column is explicitly synthetic, not the realistic stress result.
- All **155/155 PURE audits** enumerated from the `PURE` declaration and every `PURE.push`/`PURE.unshift` in `tests/release-gate.mjs` exited 0. Enumeration asserted uniqueness and refused counts below 151. First pass was 153/155: provenance and hygiene lints caught a missing dated comment and a missing positive-control annotation in the new guards. Both were fixed without changing either lint or its thresholds, then the entire 155-audit list was rerun with all exits 0.
- `node tests/release-gate.mjs --coverage-only`: exit 0; 406 audits on disk. This is coverage accounting, not a claim that browser audits ran. The PURE pool was run directly without a server.
- `git diff --check`: exit 0. Forbidden files (`js/hunt.js`, `js/social.js`, `js/db.js`, `js/app.js`) and production `js/pit.js` are byte-identical to checkout HEAD. Two pending changelog items match exactly two vNEXT PROOF rows; versioned `CHANGES` is unchanged.

```text
fight-sim: 8 builds + 2 stacks x 120 seeds
damage/turn vs a dummy (offense, no AI noise) + win% vs a foe at 80% of your stats

build                         dmg/turn   x base   win%   median turns
----------------------------------------------------------------------------
baseline (no talents)         50.1       1.00x    78%    6
Slab: rage stack              58.3       1.16x    96%    4
Alchemist: catalyst           79.7       1.59x    78%    6
lifesteal + hallowed          50.1       1.00x    98%    6
Crow Lord: flock              56.9       1.14x    100%   5
two free lives                50.1       1.00x    98%    6
stamina engine                63.8       1.27x    98%    5
Shaman: elemental             60.0       1.20x    78%    6
STACK: alchemist + stamina    108.6      2.17x    98%    5
STACK: alch + stamina + slab  96.7       1.93x    100%   5

Same stats in every row, so the multiplier IS the talents.

win% vs the game's own rungs   Glutton 1.3   Wanderer 1.45
baseline (no talents)                  11%             3%
Crow Lord: flock                       36%            17%
two free lives                         29%            16%
stamina engine                         13%             7%
STACK: alchemist + stamina             13%             7%
STACK: alch + stamina + slab           14%             3%
```

Denied/blocked actions: none. No commit, push, publication, or original-checkout edit was performed. The reported deviations are the shared maximum tilt needed to prevent capped-stat losses, and the explicitly documented 70-cell ordinary board with the original 105-cell historical board retained. Extreme difficulty is a finding, not a ceiling exception on the ordinary board.

Unversioned pending note in `NEXT_CHANGES`, in matching order.

Changelog item: The cloud opt-out audit forbids uploads and pins the allowed reads, while checking that the app still reads Crew gifts.

1. PROOF: cloud-optout-audit.mjs, cloud-off-audit.mjs | REACH: PARTIAL: The real Settings Off control is graded for zero uploads in server receipts and browser attempts. GET paths are pinned to /backup, /friends, /grants and /health, with only the GET /grants preflight allowed. A gifts GET must occur in both observations. The frozen gifts disclosure is restored in Settings. Browser proof is BLOCKED: `Error: listen EPERM: operation not permitted 127.0.0.1`. Node scratch controls execute this audit's grading block against real client transport: removing the profile upload guard fails with two PUT /profile attempts, and injecting GET /audit-unlisted fails the read pin, each exit 1. The unchanged garment audit passes 8/8; unit tests pass 382/382; all 154 PURE entries enumerated from release-gate.mjs exit 0. Node controls do not substitute for browser proof; browser green and both browser RED mutations remain operator work.

## v538 (2026-09-09)

Unversioned pending notes in `NEXT_CHANGES`, in matching order.

Changelog item: Viewport metadata no longer disables pinch zoom.

1. PROOF: fontscale-audit.mjs | REACH: R3-7: The viewport guard rejected the original user-scalable=no. Typography still passes all source and mutation controls with the attribute removed. Existing scoped touch policy is unchanged; physical pinch remains unverified.

Changelog item: The shop price notes now acknowledge that 40 starting coins cannot buy the unchanged 300-coin anchor.

2. PROOF: verify-tail-audit.mjs | REACH: R4-4: Both source comments identify DAYONE_TOPUP = 40 and state that a starting wallet cannot afford the 300-coin anchor. Price unchanged, shortfall 260; affordability needs a product-owner decision.

Changelog item: Year trend ranges and extremes now use recorded daily readings. The average still uses monthly averages.

3. PROOF: progress-playtest-audit.mjs | REACH: R4-23: Production Year sheet proves steps 14,570, resting heart rate 48, HRV 80, weight range 70-100 kg in kg and lb, and excludes out-of-window readings. Monthly-mean Average and raw Latest are separately checked and explained.

Changelog item: The cloud opt-out audit now counts every API request. Its strict check still conflicts with Crew grant downloads while opted out.

4. PROOF: cloud-optout-transport-audit.mjs | REACH: PARTIAL: The browser audit shares an all-method, all-endpoint counter with the Node transport proof. Removing syncProfile opt-out on a scratch copy fails with one profile request versus zero backup writes. Current autoSync separately fails with one grants GET. Browser/server counts are BLOCKED by Chromium launch denial. No claim of zero requests across autoSync.

Changelog item: The write-contract audit now reports a missing parser as did not run, with exit 97.

5. PROOF: verify-tail-audit.mjs | REACH: The actual write-contract script is copied into a dependency-free scratch tree. Before the fix it exits 1 with ERR_MODULE_NOT_FOUND; after the fix it prints UNPRV acorn DID NOT RUN and exits 97. No installed dependency is moved.

R3-9 BLOCKED: Chromium cannot launch under this macOS sandbox. The rendered element census was not run; the existing synthetic-only disclosure and 95% ratchet remain unchanged. No changelog claim is made for rendered scaling.

## v537 (2026-09-09)

1. PROOF: r4-restore-audit.mjs | REACH: Settings file replacements retain the two newest readable restore points, including migration from an eight-point quota-full history. Nine imports succeed under a simulated 5,242,880-byte quota. Undo through the production Settings callback preserves all 35,491 fields in both retained synthetic year-sized snapshots (589,788 bytes each before import). The original measured fixture was not supplied, so this is equivalent-size synthetic proof, not a replay of that original save.
2. PROOF: r4-restore-audit.mjs | REACH: A truncated or malformed local restore-point entry no longer hides good points in Settings. The console identifies each skipped key, and its raw bytes remain stored for recovery. No new UI.

R4-10 remains blocked: `node tests/r4-restore-audit.mjs --refused-import`
still exits 1 because the unchanged Settings caller writes before `importAll`
can refuse a stale review. Fixing this without redefining the public snapshot
function requires moving snapshot coordination into the replacement operation
and changing the caller. The frozen work order forbids editing `js/app.js`.
That file also still says points last until Erase all data or Delete account;
its retention copy needs to say only the two newest are kept. Neither blocked
change is claimed as delivered. These two rows are the pending changelog items;
the released changelog is untouched.

Validation: `node tests/unit.test.js` reports 379 passed, 0 failed. All 145
registered PURE entries exit 0. The default R4 audit reports 8 passed, 0 failed;
the separately invoked R4-10 guard reports 0 passed, 1 failed and is not counted
as green. No browser or device measurement was performed.

3. PROOF: reachable-density-audit.mjs | REACH: PURE guards the shared reachability meter with dense and sparse controls. The separate model reports the shipped route at 0.568 spawns/fix against a floor of 1, N=400. This is a finding rather than a failure. Product owner Tom has deferred the spacing decision; spacing and the 75 m collect radius are unchanged.
4. PROOF: native-shell-comment-audit.mjs | REACH: Both iOS build-19 comments now describe a remote shell loading published main, with no wrapped web version. A server.url plus a WRAPPED_WEB_BUILD comment fails the new guard and the existing version lint. This corrects source provenance, not native runtime behavior.

R4-21 density tier correction (2026-09-09): the deterministic measurement is
shared by the guard and model. The guard requires dense and sparse controls to
grade GREEN and RED respectively, pins their 722 and 18 sightings and 7.220
and 0.180 scores, and retains empty, outside-radius and far-only controls.
The model asserts nothing and exits 0 for the below-floor shipped finding.
The floor remains 1 in every sampled window. Sightings are not collections;
this is producer geometry before snapping/rendering, not on-device proof.

The original native-shell claim and its PROOF row above are retained unchanged.
There are two existing vNEXT changelog items and exactly two PROOF rows.
Only density work and its registration are changed, plus this explicitly
required vNEXT CLAIMS block. No changelog or native-shell edits are needed.

Command proof:

- `node tests/unit.test.js`: `379 passed, 0 failed`, exit 0.
- `node tests/reachable-density-audit.mjs`: GREEN, exit 0. Both spatial
  controls plus empty, outside-radius and far-only controls pass.
- `node tests/reachable-density-model.mjs`: exit 0; verbatim output below.
- `node tests/release-gate.mjs --coverage-only`: exit 0. The model is in both
  HELPERS and DECLARED skip, exactly like garden-sim.mjs.
- Complete PURE census: **146/146 exit 0**, including the density meter guard.
  The runner evaluates the `const PURE = [` through pre-`const BROWSER = [`
  source from tests/release-gate.mjs, including every push/unshift, prints
  all 146 names, refuses fewer than 145 or duplicate entries, and executes
  every resulting filename with Node. Full enumeration and per-audit output
  are retained in the advisory proof artifacts, outside the checkout.
- Broken-meter proof uses disposable copies of the same guard and shared
  meter, with production imports resolved to this checkout. Each mutation
  must match exactly once and be confirmed applied before running. Healthy
  copy: exit 0. Replacing `counts.push(reachable.length)` with
  `counts.push(0)` causes the dense-control assertion to fail, exit 1.
  Replacing `green: score >= FLOOR` with `green: true` causes the sparse-control
  assertion to fail, exit 1. Neither mutation changes spacing or radius.
- vNEXT correspondence: two changelog items, two numbered PROOF rows, with
  each named file present and registered. The native-shell row is unchanged.

Verbatim model output:

```text
ROUTE: date=2026-09-09, start={"lat":49.249,"lng":-123.1}, end={"lat":49.25619457284735,"lng":-123.1}, northbound 800 m over 10 min; N=100 fixes/window, step=8.081 m, start minutes=540,585,630,675, collect radius=75 m
FLOOR: mean >= 1 reachable spawn/fix; one nearby target at an ordinary sampled point. Sightings are not collections. Producer geometry only, before snap/render.
GREEN CONTROL synthetic dense field (20 m spacing): N=100, median nearest non-far=4.95 m, reachable spawn sightings=722, score=7.220 spawns/fix against floor=1, fixes with reach=100/100, distinct reachable=41
RED CONTROL synthetic sparse field (one fixed spawn): N=100, median nearest non-far=202.02 m, reachable spawn sightings=18, score=0.180 spawns/fix against floor=1, fixes with reach=18/100, distinct reachable=1
RED SHIPPED window start=540 min: N=100, median nearest non-far=109.09 m, reachable spawn sightings=34, score=0.340 spawns/fix against floor=1, fixes with reach=24/100, distinct reachable=3
RED SHIPPED window start=585 min: N=100, median nearest non-far=68.39 m, reachable spawn sightings=99, score=0.990 spawns/fix against floor=1, fixes with reach=58/100, distinct reachable=7
RED SHIPPED window start=630 min: N=100, median nearest non-far=90.31 m, reachable spawn sightings=43, score=0.430 spawns/fix against floor=1, fixes with reach=36/100, distinct reachable=4
RED SHIPPED window start=675 min: N=100, median nearest non-far=88.41 m, reachable spawn sightings=51, score=0.510 spawns/fix against floor=1, fixes with reach=37/100, distinct reachable=4
RED SHIPPED density: N=400, aggregate score=0.568 against floor=1 spawns/fix in EACH window; 0/4 windows meet floor
FINDING, not a failure: shipped score=0.568 spawns/fix; floor=1; N=400; gap=0.432 spawns/fix below floor. Spacing decision DEFERRED by product owner Tom. MODEL asserts nothing about the app.
```

Advisory scope report: changed tests/reachable-density-audit.mjs,
tests/release-gate.mjs and this vNEXT block in docs/CLAIMS.md; added
tests/lib/reachable-density.mjs and tests/reachable-density-model.mjs.
Denied or blocked actions: none. Deviations: none; the expressly required
CLAIMS update is the sole documentation edit. No commits, pushes or publishing.
Production spacing, collect radius, native-shell guard, pbxproj, version lint
and changelog remain unchanged. Independent review is still required.

Changelog item: Every pet now fights with identical stats. What a pet does in a fight comes from its talent tree, not its species.

## v536 (2026-09-09)

1. PROOF: hand-registration-audit.mjs | REACH: "The off-hand toothbrushes and spades sit in the raised fist." IL10-1/2 translated +30,+104 and IL17-1/2 +44,+68 within their 640x640 masters. Brushes lose 0 pixels; spades discard exactly the authorized 7 and 10 dust pixels, all alpha <=30. Surviving RGBA multisets and translated bounding boxes match exactly. The full census passes 38/38 IL and 24/24 IR; the pre-fix brushes fail, while the ring floor already passed the old spades and cannot alone certify their grip. See the [before/after B0-1 contact sheet](offhand-registration/before-after.png), [printed pixel assertions](offhand-registration/translation-output.txt), [full hand census](offhand-registration/after-audit.txt), and [advisory report](offhand-registration/REPORT.md). Derived thumbnails rebuilt with the project generator. Visual limitation: the frozen offsets bring the shafts onto the fist but leave their existing transparent cutouts below it; no grip redesign was authorized or applied. One implemented vNEXT changelog item remains in a comment pending release integration.

## v535 (2026-09-09)

Pending entries in `js/changelog.js` (`NEXT_CHANGES`), in matching order. These
are unversioned train notes. Existing shipped entries and version stamps remain
unchanged. Source fixes were already present on arrival; the four named audit
files were missing and have been reconstructed. See `R4-FINISH-REPORT.md` for
starting evidence, final proof and limitations.

Changelog item: Shop cosmetics no longer charge Bone Dust a second time to wear. Football garments include all 32 team colourways.

1. PROOF: r4-app-p1-audit.mjs | REACH: R4-1: Real drop, football and bundle purchases persist slot:artId credits, preserve existing credits and debit the quoted price. Helmet, jersey and cleats each credit all 32 colourways. Unfunded purchases grant nothing.

Changelog item: Foraging in the Kitchen saves the coin payment and ingredient together. A failed save keeps your coins.

2. PROOF: r4-app-p1-audit.mjs | REACH: R4-2: The real forage confirmation callback uses payAtomic. Aborting the ingredient write retains wallet and pantry, emits no success receipt, and allows retry. Concurrent taps cannot spend one 45-coin balance twice.

Changelog item: The Boneyard clears an old driving-speed reading after GPS has been silent for 20 seconds.

3. PROOF: r4-app-p1-audit.mjs | REACH: R4-19: Production speed gates retain fresh driving restrictions and expire after the 20-second watch timeout. The first returning stationary fix clears stale smoothing history. The watch throttles at 1.2 seconds and permits a 3-second cached fix. Physical GPS behavior remains device proof.

Changelog item: The next-day arrow stops at today. Future food entries cannot earn XP, crates or level-up rewards.

4. PROOF: r4-app-p1-audit.mjs | REACH: R4-22: Execute the disabled expression and click handler at today, after today and yesterday. Five future logs grant zero XP, inventory rewards or level-up events; future reward recovery is refused. The production entitlement expression refuses new future intents. Today still earns XP.

Changelog item: Turning Cloud backup off also stops profile uploads. Your Crew row and leaderboard entry stop updating until you turn it back on.

5. PROOF: cloud-off-audit.mjs | REACH: R4-13/R4-16: Real pet-garment callback, debounce, local wardrobe and profile transport send zero requests when off. Direct/shared calls and opt-out during snapshot preparation are guarded. Settings and the off toast name the stale Crew row and leaderboard. Re-enabling reaches a rejecting server boundary and discloses HTTP 500.

Changelog item: A failed-save warning survives closing the tab or restarting the app when device storage survives.

6. PROOF: r4-silence-audit.mjs | REACH: R4-11: Discard the complete journal VM and its session storage. A fresh context sharing only localStorage reads the failed-save notice. Confirmed saves stay quiet and a second successful writer cannot clear the failed writer. OS-kill simulation, not physical iOS evidence.

Changelog item: If erasing fails in another tab, that tab says saving is paused and tells you to reload to continue.

7. PROOF: r4-silence-audit.mjs | REACH: R4-6: Abort the production erase transaction over mem-idb. The peer receives the production error-toast callback before another write, retains 125 coins and gives truthful failure/reload wording. A fresh module writes 126 coins. Successful erase still clears the save and requests peer reloads.

Changelog item: Restoring the same unfinished food entry no longer repeats its error notice on every launch.

8. PROOF: r4-silence-audit.mjs | REACH: R4-12: N=4 fresh launch contexts run production disclosure, restore, identity initialization and stamping. Timestamps change but action identity survives. Exactly one error notice appears. Routine error furniture taxes the credibility of failure disclosures.

Changelog item: A device without a Crew account no longer gets a warning claiming its Crew profile is behind.

9. PROOF: r4-silence-audit.mjs | REACH: R4-14: Four failed outcomes in each account state produce different exact notice strings. The missing-account branch reuses the existing Settings sentence; the existing-account branch retains profile-sync guidance.

Changelog item: The Boneyard water classifier backs off failed tile requests and retries after an outage without another lookup.

10. PROOF: water-retry-audit.mjs | REACH: R4-20, classifier only: A boot TileJSON outage and a tile-only outage recover queued classifier tiles without walking or another lookup. Retained URLs use a 15-second base doubling to a 120-second ceiling with 0 to 20% downward jitter. Healthy delivery stops retries. Visible MapLibre recovery is unresolved, see R4-FINISH-REPORT.md.


## v534 (2026-09-09)

1. PROOF: c6-price-audit.mjs | REACH: C6 Bumbleseal cost 50,000 coins while being obtainable free from the ordinary egg pool. Repriced to 5,000, and anyone who paid the old price is credited the 45,000 difference exactly once, keeping their pet and all progress. Measured from production analytics before the change: `buy_pet` with `{"id":"C6","cost":50000}` fired 5 times across 5 distinct devices, so the refund population is small and the entitlement, not a server count, decides who is owed. A replayed refund grants nothing, an aborted credit burns no entitlement and can retry, and a player who hatched C6 free is owed nothing.

**The cosmetic-only conflict is NOT resolved by this release and is not claimed
to be.** C6's `PET_STATS.mult` is 1.15, so selling it at any price still sells
power. This release corrects an indefensible price; it does not make the product
compliant with the never-sell-power rule. That decision is still open.

Two documents also land: `docs/reviews/boneyard-critique.md`, which recommends
NOT building the proposed Boneyard coin sink, and `docs/BACKLOG.md`, a triage of
the previously unreadable open-feedback list.

379 unit assertions, 0 failures, all 143 PURE entries exit 0. This was the first
clean multi-lane assembly of the day: the lanes were grouped by changed-file
overlap rather than by clock, and zero cherry-picks conflicted.

## v533 (2026-09-09)

1. PROOF: fontscale-audit.mjs | REACH: A full census measured 0 of 415 elements scaling on v516 and 5 of 427 on v529, with 680 of 899 `font-size` declarations hardcoded px. The type ramp is converted so text follows the system text-size setting. Fixed art dimensions, borders and pixel-art sizes are deliberately NOT swept up. The census is now a guard with a floor rather than a one-off measurement. **Visual review across every screen is owed and NOT done: no lane could render, and scaling text inside hand-tuned fixed-size surfaces is exactly where this breaks.**
2. PROOF: boneyard-zoom-audit.mjs | REACH: Pinch-zoom is permitted on the Boneyard and refused elsewhere, per Tom's ruling. `tests/fontscale-audit.mjs` previously ASSERTED `user-scalable=no` must be present, so anyone fixing zoom broke the suite; it now records the policy instead of requiring it. Real pinch gestures are unverified: device proof is owed.
3. PROOF: lab-lock-recovery-audit.mjs | REACH: `animate()` is two transactions and a crash left the `labIntents` fence behind, with recovery clearing it only on an exact pinned-context match. Measured 8 of 28 kills locked, including 6 of 6 taken mid-transaction, and boot-time auto-equip could trigger it with zero player action. Recovery no longer depends on an exact match, and the control, nickname-first and auto-equip arms all recover.
4. PROOF: lab-conflict-audit.mjs | REACH: Two offline devices could each take slot 1 of the same day, the account got two free experiments, and in the same-pair arm the same two pets were destroyed twice. On reconnect the losing device was permanently refused with `backupAt` 0 while Settings read "your progress is safe and it keeps retrying", which could never succeed. The refusal is kept, because it protects data; the dead end and the false copy are gone.
5. PROOF: r3-rest-audit.mjs | REACH: `hasCloudBackup()` returned true on `r.ok` without reading the body, so a bare `{"ok":true}` rendered "a cloud backup does exist" on the screen before irreversible destruction; it now treats an unreadable shape as "cannot confirm". The refused restore explains itself rather than printing `laboratory-restore-conflict`. The destroy escalation gate now includes nickname and bond, matching its own disclosure.

6. PROOF: r3-rest-audit.mjs | REACH: The Stable's `isKnownPet` filter and its warning were unreachable because `petInstances()` already filters, v528's crew change left the wire payload shipping data the UI no longer shows, and `js/pets.js` claimed "5 morphs = 30 pairs" while the code correctly uses 6. Each corrected; the dead guard's disposition is recorded rather than silently deleted.

378 unit assertions, 0 failures, all 142 PURE entries exit 0. Two audits were
found belonging to no running tier after a conflict resolution dropped their
registrations, and one new audit lacked the positive CONTROL row the project
requires; both were corrected before this gate, not waived.

## v532 (2026-09-09)

1. PROOF: breed-two-tap-audit.mjs, after-await-event-lint.mjs | REACH: `#doBreed` read `e.currentTarget` AFTER an `await`, by which point dispatch had completed and it was null, so the next `.dataset` read threw on every tap, before arming, before the review, and before `breedPets` was ever called. Nothing changed on screen; the only signal was a console error. Verified independently against live `origin/main` before the fix. The capture now happens before the first await, as v516 had it. The guard drives the REAL handler through a full two-tap breed and asserts the roster actually changes, which is what a registration-only or no-exception test would have missed. A second lint fails on any async listener reading `currentTarget` after an await, so the class cannot return.

Found by a playtester, not by the gate, on the release titled "the app stops
failing quietly". The fix is one line; the reason it shipped is that nothing
caught it, which is why this release lands two guards for one bug.

378 unit assertions, 0 failures, all 138 PURE entries exit 0. The PURE list was
rebuilt after a cherry-pick left conflict markers in `release-gate.mjs`, which
had briefly produced an EMPTY list and a false green; the run above is over the
full 138 and a floor check now refuses a suspiciously short list.

## v531 (2026-09-09)

1. PROOF: migration-guard-audit.mjs | REACH: The 2026-09-05 migration adding `last_week_key` and `last_week_steps` was written, the Worker was deployed, and the migration was never applied to production D1. Every `PUT /profile` threw `no such column: last_week_key` from 2026-09-05 to 2026-09-09 while returning a success-shaped response, so 80 players stopped syncing and nothing surfaced it. This lands a schema/write-contract check that derives the required columns FROM THE SOURCE rather than a hand list, a health check that exercises the write path instead of returning 200 without touching the affected columns, and a deploy-order check. Prove-red is that exact scenario: a local D1 missing the 2026-09-05 migration makes the checks go red naming the missing column, and applying it makes them green.

The audit parses source with acorn, which was declared in `server/package.json`
but not where the audit runs. It is now a root devDependency beside the esprima
precedent, AND the audit degrades to exit 97 UNPROVEN when the package is absent,
following the convention established when six store audits were found exiting
green on a missing dependency. A guard that cannot run must never look like a
guard that passed.

378 unit assertions, 0 failures, all 137 PURE entries exit 0. No browser, device
or socket proof was run. The sync latency work is NOT in this release: its audit
was written against the pre-v530 podium and needs reconciling first.

## v530 (2026-09-09)

1. PROOF: leaderboard-honesty-audit.mjs | REACH: Every surface that turned `last_seen` into a claim about a person now describes a server contact instead. Under 6 minutes reads "Synced recently"; under a day keeps minute or hour precision; 24 hours or older drops the day count entirely and reads "Awaiting a recent sync"; a missing, zero, negative or future timestamp reads "Sync time unavailable". Driven with fresh, day-old, week-old and fleet-stale snapshots across the Crew fan, leaderboard, podium and step race; the week-old and fleet-stale rows go red against the previous code, which printed a confident day count.
2. PROOF: leaderboard-honesty-audit.mjs | REACH: When no row in a view carries a valid timestamp under 24 hours, the shared notice says no recent updates have reached this view and syncing may be delayed, rather than implying the players are absent. The viewer's own recent server timestamp counts as evidence; a locally synthesised race row does not, so the app cannot reassure itself with its own data.

This release does NOT fix the sync outage and does not claim to. No player has
synced since 2026-09-06 and the cause remains unknown after five investigating
lanes. What it fixes is the app stating as fact something it never measured:
`last_seen` moves only when a sync succeeds, so it has never meant "last time
they played". No browser or device proof was run.

## v529 (2026-09-09)

1. PROOF: sync-observability-audit.mjs | REACH: Every sync attempt now records its outcome and the hop it stopped at, and a Settings row reports it in plain language. Driven with an injected failure of each kind: today's code leaves no trace anywhere for any of them. A guard fails if a bare catch returns to the sync path. Nothing new is uploaded and the cloud opt-out is never reported as a failure.
2. PROOF: sync-identity-audit.mjs | REACH: A registration whose reply is lost used to leave a valid signing key with no `social` record, and because `isOnline()` reads that record the player failed the gate silently and forever. Recovery now runs in place of that gate, on resume as well as boot, and signs as the same player rather than minting a new identity. This is a reproduced individual failure; it is NOT claimed to explain the fleet-wide outage.
3. PROOF: sync-clientpath-audit.mjs | REACH: An HTTP-rejected profile or a null snapshot no longer advances the throttle stamp, so one failure no longer suppresses every retry inside the following five minutes. Grants are still pulled when the profile is rejected.

**The production sync outage is NOT fixed and is NOT claimed to be.** No player
has synced since 2026-09-06. Five lanes investigated: 300 observations across 60
release trees all reached `PUT /profile`, no signing or canonicalisation
regression exists, and the tracked native config loads the live site rather than
pinning players to a bundled build. The cause remains unknown. This release makes
the NEXT failure visible instead of silent, which is the precondition for finding
it.

Three lanes edited `js/social.js` and did not combine: a hand-assembly produced
six red audits and was abandoned rather than patched blind. The integration was
redone as its own lane. 378 unit assertions, 0 failures, all 135 PURE entries
exit 0. No browser, device or socket proof was run.

## v528 (2026-09-09)

1. PROOF: stable-rooms-top-audit.mjs, wheel-look-audit.mjs | REACH: The three rooms render above the album with live counts and their own pixel icons from assets/icons-pix. The wheel is restyled to the brand deck with labels upright rather than rotated to the wedge; the prize table is byte-identical and the weights still sum to 95, so no odds changed. Visual review of both is owed: neither lane could render.
2. PROOF: lab-density-audit.mjs | REACH: The Laboratory stated the same consumption rule three ways and printed its daily-experiment sentence twice on one screen. The duplicate is gone and the rules are stated once, at the point of commitment. No destroy disclosure or safety warning was weakened.
3. PROOF: dock-line-audit.mjs | REACH: The 13px band that excludes the FAB's overhang from the scrollport no longer paints itself an opaque fixed colour, which read as a black line against the Today hero. The FAB exclusion itself is proven still intact: a row under the FAB's box remains tappable.
4. PROOF: wardrobe-playtest-audit.mjs | REACH: The transmog confirm bar no longer renders on arrival for a choice the player has not made; it appears once a real change is pending. The fits explainer moved into a closed disclosure with its copy intact, including the warning that older fits remember only the look.
5. PROOF: crate-cadence-audit.mjs | REACH: Two independent rows: the authored gap between cards equals a single named constant, and advancing does NOT wait on art readiness even when art never resolves. The v525 change had removed the stall and the pacing in one edit, so neither could be tested alone. On-device cadence is unverified.
6. PROOF: whatsnew-boot-audit.mjs | REACH: What's New opens once after an update, marks itself seen, does not reopen, never fires for a new player seeded caught-up, and does not open over an existing sheet. A further row asserts NO other boot takeover was restored, guarding the eleven removed in v448.
7. PROOF: settings-safety-audit.mjs | REACH: A file import now discloses what replacement will cost using the real values, takes a restore point before the transaction opens, and leaves exactly one coherent state if the import aborts. A snapshot that cannot be written blocks the import rather than proceeding silently.
8. PROOF: crew-outfit-audit.mjs, sync-clientpath-audit.mjs | REACH: Pet wardrobe changes now schedule a public profile upload; only body changes did. Separately, an HTTP-rejected profile or a null snapshot no longer advances the sync throttle stamp, which previously suppressed the next attempt for five minutes after a failure.

**The production sync outage is NOT fixed by this release and is NOT claimed to
be.** Since 2026-09-06 no player has synced. Three lanes investigated and all
returned negative with evidence: 60 release trees from v475 to v527 across five
scenarios produced 300 observations that all reached `PUT /profile`; no signing
or canonicalisation regression exists; the real boot path reaches a signed
request. The cause is not in this codebase's sync path and remains unknown.
Item 8's throttle fix is a failure amplifier, not the cause.

The assembled release runs 377 unit assertions with 0 failures and all 132 PURE
entries exit 0. One integration break was found while stitching and fixed here:
the What's New restoration added a boot collaborator that the sync-path audit's
sandbox did not stand in for, so a healthy lane read red. No browser, device or
socket proof was run.

## v527 (2026-09-09)

1. PROOF: wardrobe-playtest-audit.mjs | REACH: Transmog charges only on delivery and a failed melt no longer removes a collected look or strips equipped stats; a failed single-crate open recovers its control. Each case is driven through the production handler with an injected write failure and carries a pre-fix observation the grade rejects.
2. PROOF: crew-playtest-audit.mjs | REACH: The 101st unopened gift no longer discards the oldest, a confirmed gift chip cannot spend the same wallet twice, an aborted reward write no longer strands the Open button, and decline/remove failures report instead of failing silently. C0, a sender terminating after the debit, is NOT fixed and is recorded open.
3. PROOF: map-playtest-audit.mjs | REACH: Choosing earned den gear no longer deletes the entitlement without delivering, roaming mini-boss crate and dust writes survive a failure after the win is recorded, and the historical-progression repair no longer marks itself complete early. M5 and M6, the shared-victory settle and stale cloud merge, are NOT fixed and are recorded open.
4. PROOF: firstrun-audit.mjs | REACH: An interrupted welcome delivery completes on the next run instead of losing the kit, for new deliveries; kits already lost before this build are not recovered. Onboarding no longer promises XP for every meal when the daily cap applies.
5. PROOF: settings-safety-audit.mjs | REACH: Erase and Delete account recover after a local transaction abort, export failures surface a result, and backup copy no longer promises incompatible outcomes. Finding 1, Import silently replacing newer earnings with no confirmation and no undo snapshot, is NOT fixed and is the highest-harm item still open.
6. PROOF: progress-playtest-audit.mjs | REACH: A partly-logged day no longer produces contradictory averages or a false decline, a year of weight history no longer reports a monthly mean as the latest weigh-in, an unavailable sleep score no longer renders as a number, and an older visible reading is no longer described as an unstarted trend.
7. PROOF: today-playtest-audit.mjs, shop-economy-audit.mjs | REACH: Today's rows and the Shop's purchase and currency paths were exercised against injected failures and concurrent taps; the fixes landed here restore controls that previously died after a failed save. Both lanes' remaining findings are written up rather than claimed fixed.

Every lane branched from v526 and was gated independently before assembly. The
assembled release runs 377 unit assertions with 0 failures and all 123 PURE
entries exit 0. NO browser, device or socket proof was run for this release:
these are Node-level reproductions over mem-idb and sliced production
renderers. Four items Tom reported by hand on 2026-09-09 (the daily wheel's
look, the Laboratory's density, friend outfits going stale in Crew, and the
dock band reading as a black line) are NOT addressed here.

## v526 (2026-09-09)

1. PROOF: stable-rooms-top-audit.mjs | REACH: The Paddock, Laboratory and Kennel now render as three controls ABOVE the album in DOM order, each carrying a live count read from the same state the room itself uses, each keeping the id its existing handler and every clicking audit depends on. Empty collection and a null Laboratory snapshot both render sanely. Moving a tile back below the album goes red. The visual result was verified separately by rendering the real Stable at 393x852: three 115x112 tiles, 18px radius, hard 3px 4px offset, cream Bangers labels, real pixel icons, album still at y=324.
2. PROOF: pet-rarity-audit.mjs | REACH: No pet surface emits a rarity word or a pet rarity tier class; gear, crate and weapon-rack rarity still do, because those drops are genuinely weighted. PET_STATS mult (1.00 to 1.36) and petDustValue (10 to 120) are unchanged, so no owned pet lost strength or salvage value. Shiny survives everywhere. Restoring one removed label goes red. The removal is display only: the rarity field in data/boneheadz.js is untouched.
3. PROOF: p1-merge-audit.mjs | REACH: A merge restore preserves Kitchen earnings, banked dishes, diary deletions and corrections, and potions earned independently on two devices. Each case carries a pre-fix observation the grade rejects. This is the js/db.js importer exercised over mem-idb in Node; real multi-device cloud timing is NOT claimed and still needs devices.
4. PROOF: quest-wheel-budget-audit.mjs | REACH: A claim whose payout transaction aborts no longer consumes the period's reservation, and the retry pays instead of reporting already-claimed. Monday's daily and the week's Monday key no longer collide, so weekly quests are claimable in a week whose dailies were claimed. Fault injection drives the real claim and wheel commit paths; reverting either fix goes red.
5. PROOF: kitchen-delivery-audit.mjs, p1-dens-audit.mjs | REACH: Cook, Line up, Serve, Eat, the cauldron purchase, den reward delivery, the Wanderer settle, Battle Charm activation and Pit setup either complete or leave the player whole under an injected write failure. Overlapping and double-tapped actions are driven concurrently. Every fix has an aborted-write control that goes red without it. The roaming and remote boss 'bossfirst' markers that raise the Pit ceiling are preserved through the den consolidation.
6. PROOF: crew-yard-row-audit.mjs | REACH: A friend's profile renders the paddock header and the visit control and renders no per-pet portrait row. Restoring the row goes red. The friend paddock scene itself and the profile's equipped-pet portrait are untouched.

Two integration breaks found while stitching the seven lanes were fixed here, not
carried: `release-gate.mjs` gained a duplicate `const PURE` declaration from a
keep-both resolution, and the room-tile change orphaned `doorSp`/`doorPx`, whose
dead `order.slice(0, 2)` then fell inside an audit's source slice and made a
healthy guard read red. The assembled release runs 377 unit assertions with 0
failures and all 115 PURE entries exit 0. Browser and socket proofs beyond the
Stable render above were not run.

## v525 (2026-09-08)

1. PROOF: breed-lock-audit.mjs | REACH: The Stable's album survives the redesign. Executed paint geometry proves the neighbouring cards still peek at the frame edges; swipe, velocity snap, vertical axis lock, keyboard navigation, dot taps and neighbour taps are driven through the production handlers with reduced motion on and off. Body order, typography scale and the single primary action are asserted against the shipped tokens. Removing the peek, the depth transform or the primary-action class each goes red. This is source and executed-handler evidence in Node, not a browser screenshot.
2. PROOF: pet-morph-animation-audit.mjs | REACH: Every generated morph now ships the three animation layers its base species ships, and the renderer no longer skips animatedPetHtml when a morphSrc exists. Catfish (C3) and Beardie (C4) remain deliberately static and are asserted as static, not as passing. Deleting a morph layer or restoring the renderer's morphSrc gate goes red.
3. PROOF: stable-loss-disclosure-audit.mjs, stable-stale-disclosure-audit.mjs, breed-last-colour-audit.mjs | REACH: Destroy and Breed reviews name the pet and enumerate banked steps, nickname, bond, lineage and each chosen talent by its real name. A quote that goes stale between review and commit replaces the disclosure in place and clears the typed acknowledgement. Reverting to the unnamed copy or to the un-enumerated loss line goes red on each audit.
4. PROOF: lab-room2-audit.mjs | REACH: Fourteen playtest findings each carry a frozen pre-fix observation that the grade rejects and a current production scenario that it passes. The carousel repaint, day-rollover clock, incubator purchase refresh and slot disabling are driven through the real callbacks with DOM endpoints doubled. Findings 6 and 15 are NOT fixed: they were blocked by the reserved Destroy scope and are recorded as open. No browser gestures or native event timing are claimed.
5. PROOF: crate-cadence-audit.mjs | REACH: The authored path from fling to the next card's rise is measured from source and clock, not from browser wall time. Subsequent normal-motion cards hydrate concurrently and commit layout before adding .go synchronously, removing the two-frame wait that ready art still paid. Restoring the frame wait goes red. Pixel-level cadence on a device remains UNPROVEN.
6. PROOF: response-bodies-audit.mjs | REACH: Ten structured-data seams in js/social.js now validate the success body before anything is written locally; each has a malformed-body case that goes red without the check. The report does NOT certify the other seventeen calls: they are enumerated with their disposition, and several remain HTTP-status-only.
Two changes in this release are not player-facing and so carry no patch note.
Six store and submission audits previously exited green when a required package
was missing; they now exit 97 UNPROVEN, `checkAuditDependencies` in
`tests/unit.test.js` proves each distinguishes a missing dependency from a real
defect, and esprima is pinned in package.json. Two integration breaks found while
stitching the lanes were fixed here rather than carried: `repaintFocus` had lost
its call to `repaintLabIngredients`, and the playtest harness lacked the
destruction helpers its production slice now calls. The assembled release runs
373 unit assertions with 0 failures and all 108 PURE entries exit 0. Browser and
socket proofs were not run. Laboratory findings 6 and 15 remain open, blocked by
the reserved Destroy scope.


## T1: pet re-tune rulings (2026-09-07)

1. PROOF: pit.test.js | REACH: Eternal Guard retains its per-species, automatic level-10 unlock, with the contract and existing player text both promising exactly 20% HP. A real lethal hit saves once at that amount; reverting to 40% fails both effect and resolved-HP checks.
2. PROOF: pit.test.js, dish-worth-audit.mjs | REACH: Hunter's Skewer shortens special recovery by one turn, with a one-turn minimum. All seven species enforce the timer in displayed availability and direct dispatch. Recipe, active-buff label and worth copy agree. Existing dishes, charges and saved petFree flags remain usable; no progression or inventory is migrated.
3. PROOF: dish-worth-audit.mjs | REACH: Re-measured 2,000 seeds in each arm. The trained C6 hound improves from 1836 to 1900 wins; without a pet both arms win 747. The copy contains no percentage. Removing the edge fails PET, falsely marking the working dish unclaimed fails NOCLAIM upward, and restoring the old mechanical copy fails both copy rows.
4. PROOF: pet-family-audit.mjs | REACH: Deliberately ratified the already-frozen tuned baseline under the 20% ruling. All 13,552 builds and 54,208 effects match. The original fixture, frozen hashes and separate family identity guard remain; reverting the C2 effect fails NO-DRIFT.
5. PROOF: balance.mjs, fight-sim.mjs | REACH: Whole-board before/after measurements use the real five-rung ladder and all mixed legal paths. The ordinary target passes 128/128 guards, but daily-Glutton stress still reaches 99.5% for maxed shiny lineage20 C4 with Crow Lord and Skewer. No fourth family or release clearance is claimed.
6. PROOF: pit.test.js, dish-worth-audit.mjs | REACH: The agreed command exits 0: 101 passed, 0 failed; dish-worth: all rows green. Every one of the 80 actual PURE entries exits 0. Browser/server proofs were prohibited. No commit, push, publication or version change occurred.

The complete advisory report, before/after boards, red/green output, file list,
limitations and proposed owner fixes are in `tests/fight-sim.mjs`, printable with
`node tests/fight-sim.mjs --report`. Existing maxed pets keep all earned records
and unlocks but have less combat power under the inherited tuning. The unowned
app.js lineage promises still contradict its cap and remain a release blocker.

## R3: operational debt (2026-09-07)

1. PROOF: unit.test.js | REACH: The hotfix registerKey/goOnline regions and strengthened R37-24 guard are byte-identical to locally available origin/main. The current unit suite checks the failed retry, welcome receipt and successful later signup. Branch left intact; no live-wallet measurement is claimed.
2. PROOF: audit-output-audit.mjs, guard-hygiene-lint.mjs | REACH: Recognized audit write destinations reject the checkout, traversal and symlink aliases; the remaining serveTree proof file moved into memory. Three throwaway reversions went red and restored copies went green. This is bounded source/path evidence, not an OS-level guarantee for opaque subprocesses or a browser proof.
3. PROOF: serve-tree-identity-audit.mjs | REACH: Real wrong-port, read-only directory and child-exit proofs remain pending on a socket-permitted machine. The socket-dependent checks now belong to FULL, preserving their assertions. Initial inherited PURE execution received listen EPERM and did not grade any row.

Four verdicts, files, exact proof output, denials and deviations are recorded in
[R3-REPORT.md](R3-REPORT.md). Current census/machine limits are in
[RELEASE-GATE-STATUS.md](RELEASE-GATE-STATUS.md). [TESTFLIGHT-STATE.md](TESTFLIGHT-STATE.md)
attributes the supplied snapshot and marks current remote verification blocked
by the contradictory ASC instruction. No commit, push or publication occurred.


## M5: first-run disclosure and lookup guards (2026-09-07)

1. PROOF: unit.test.js | REACH: Gwart retains his introduction and gives the exact anonymous-account disclosure. First run retains its intro, returning players skip it unless explicitly previewing. The four-job toast backlog cap remains. The three focused Node guards pass; the full unit command has one socket-dependent failure.
2. PROOF: first-run-honesty-audit.mjs | REACH: Browser operation and screenshots are PENDING sandbox-free review. Expected 8/8 passed and exit 0; no browser or screenshot proof is claimed here. The older onboarding audit now waits for the retained intro to be dismissed before grading its CTA.
3. PROOF: lookup-guard-lint.mjs | REACH: A bounded scan reports all four current candidates across 54 source files: two unresolved peer-pet boundaries and two upstream-validated false positives (50% of this sample). Downstream fallbacks prevent these boundary findings from establishing a crash. New or duplicated sites fail. This does not claim complete coverage of the guard class.
4. PROOF: m5-prove-red.mjs | REACH: Seven throwaway source reversions exit 1, including both known lookup guards; restored first-run guards and lint exit 0. Full red/green output, scope limits and deviations are recorded in tests/m5-review.md.

The required remote merge is blocked: origin/codex/cx-firstrun is absent and GitHub DNS resolution failed. The only local branch is rejected-round WIP commit 3c782c65. The frozen corrections were implemented directly; the completed branch was not merged or verified. No commit, push or publication was performed.

## WAVE: submission intent and store audit (2026-09-07)

1. PROOF: submission-build-audit.mjs | REACH: GATED until Tom builds and installs the candidate. The scripted build now requires explicit SUBMISSION=1 or SUBMISSION=0, resolves its own checkout, separates artifacts, and refuses mismatched copied or archived submission content before export. Node-only fixture execution proves the branch outcomes and config restoration; six throwaway reversions went red. No native build or upload was run.
2. PROOF: submission-preflight-audit.mjs | REACH: Both submission preflight calls require a content-bound submission marker, STORE_BUILD=true, no server key and clean reachable store strings. Internal markers are refused even with a correct digest.
3. PROOF: store-copy-lint.mjs | REACH: Source store-copy proof passes. This does not establish bundled WKWebView operation, storage migration, signing, live backend compatibility or App Review readiness.

Advisory evidence, changed files, red/green output, exclusions and deviations:
[WAVE-STORE-PROOF.md](WAVE-STORE-PROOF.md). The current owner/status/evidence
checklist and Tom's ordered tasks are in
[SUBMISSION-CHECKLIST.md](SUBMISSION-CHECKLIST.md). No version, commit, push,
publication, Worker or App Store Connect action was performed.

## Lane H: Today reads and guard integrity (2026-09-07)

Advisory report for independent provider review. The supplied frozen plan SHA256
matched `37e11f9c6bbd7d4ddee7933b348f1a99d744213ce0b28ae3266973226309d2ac`.
All source paths resolved inside this checkout. Its root `CLAUDE.md` was read;
`tally/CLAUDE.md` does not exist here. No original checkout was edited.

Files changed:

- `tests/today-reads-lint.mjs`: re-point the petInstances return-pattern pin at
  the filtered instance list. Also require the SHA256 of its entire
  comment-stripped function body so newly inserted code cannot silently inherit
  the exemption. Add Node execution of buildFighter's actual pet assembly with
  production loot/pets/db exports, observing cold inventory reads, earned picks,
  zero warm store scans and unchanged battle output over two warm calls. The
  optional root argument also selects the runtime modules from that root.
- `tests/pet-state-audit.mjs`: add a CONTROL row that checks the actual seeded
  instance list and earned level, reads an existing legal choice, writes its
  legal alternative, checks the persisted iid bank, reads it back, and checks
  the sibling retains its own choices. An empty or wrong-instance answer fails.
- `tests/dish-worth-audit.mjs`: date the CONFIGS provenance 2026-09-07, citing
  Tom's master handoff B5 and frozen Lane H RED 3. The recorded roughly
  threefold disagreement between with-pet and no-pet measurements explains both
  configurations and why dish copy states no percentage. No measurement changed.
- `docs/CLAIMS.md`: this dated section only.

1. PROOF: today-reads-lint.mjs | REACH: The static whole-Today count changes from `{"health":1,"inv":5,"log":1,"xp":1}` to `{"health":1,"inv":1,"log":1,"xp":1}`. All existing once-guard exemptions remain. A new scan inserted before the pinned suffix fails both GATE and the runtime warm-scan row. This is Node and source evidence, not a measurement of browser frame time or battery usage.
2. PROOF: pet-state-audit.mjs, guard-hygiene-lint.mjs | REACH: The new selected-instance control passes. The state audit reports `pet-state: 12 passed, 0 failed`; hygiene reports `49 of 281 carry no CONTROL/PREMISE/SETUP/REACH/SAMPLE row. ratchet holding` and `guard-hygiene: clean`. The ceiling remains 49.
3. PROOF: dish-worth-audit.mjs, guard-provenance-lint.mjs | REACH: The two unchanged measurement arms pass all dish rows. Provenance reports `60 known, 0 new` and `guard-provenance: clean`. No threshold or inventory allowance was increased.

Agreed proof command, exit 0:

```sh
node tests/today-reads-lint.mjs && node tests/guard-hygiene-lint.mjs && node tests/guard-provenance-lint.mjs
```

Key output:

```text
ok   A1 the WHOLE Today draw (renderToday and everything it calls in the tick) scans log, xp, health and inv exactly once each  {"health":1,"inv":1,"log":1,"xp":1}
ok   CONTROL cold pet assembly reads inventory and retains earned talents  {"inv":1}
ok   C1 warm battle pet assembly scans no stores (tick 1)  {}
ok   C1 warm battle pet assembly scans no stores (tick 2)  {}
all green
ok    CONTROL the number of audits with NO positive control does not rise above 49  49 of 281 carry no CONTROL/PREMISE/SETUP/REACH/SAMPLE row. ratchet holding
guard-hygiene: clean
ok    RATCHET no NEW pinned expectation lacks dated provenance  60 known, 0 new
guard-provenance: clean
```

Red/green evidence, using throwaway source copies under `/private/tmp/pet-h-proof/throwaway`:

- Restore the original Today audit: `FAIL GATE petInstances still carries the once-guard its exemption pins` and `FAIL A1 ... {"health":1,"inv":5,"log":1,"xp":1}`, exit 1. Restore the fixed audit: `all green`, exit 0.
- Restore the original state audit with no control: `FAIL CONTROL the number of audits with NO positive control does not rise above 49`, `50 of 281`, exit 1. Restore the added control: `49 of 281`, `guard-hygiene: clean`, exit 0.
- Restore the original CONFIGS comment: `FAIL RATCHET no NEW pinned expectation lacks dated provenance`, `1 new: dish-worth-audit.mjs:CONFIGS`, exit 1. Restore the dated comment: `60 known, 0 new`, `guard-provenance: clean`, exit 0.
- Insert `await db.all('inv')` at the start of petInstances while preserving the return suffix: `FAIL GATE petInstances`, `FAIL A1 ... {"health":1,"inv":9,"log":1,"xp":1}`, and `FAIL C1 warm battle pet assembly scans no stores (tick 1) {"inv":3}` (also tick 2), exit 1. Restore production bytes: `C1 ... {}`, `all green`, exit 0. Also repeated by pointing the checkout's audit at the mutated throwaway root, proving the runtime half measures that root.
- Make petPicks return an empty array: `FAIL CONTROL earned talent round-trip reaches the selected instance bank: Expected values to be strictly deep-equal`, exit 1. Restore production bytes: `PASS CONTROL earned talent round-trip reaches the selected instance bank`, `pet-state: 12 passed, 0 failed`, exit 0.
- Remove picks from the real battle assembly: `FAIL CONTROL cold pet assembly reads inventory and retains earned talents {"inv":1}`, exit 1. Restore assembly: the same CONTROL is green, exit 0. This prevents the zero-scan row from passing on an empty pet result.

PURE enumeration follows the actual initializer plus every PURE.push/PURE.unshift
in `tests/release-gate.mjs`, evaluated in their source order without executing
its server runner. There are 58 files: 56 passed, two require prohibited server
proofs. No new audit was created, so no release registration changed.

| # | PURE file | Result |
| --- | --- | --- |
| 1 | `version-align-lint.mjs` | Exit 0 |
| 2 | `no-debug-markers-lint.mjs` | Exit 0 |
| 3 | `store-copy-lint.mjs` | Exit 0 |
| 4 | `transmog-receipt-audit.mjs` | Exit 0 |
| 5 | `today-reads-lint.mjs` | Exit 0 |
| 6 | `kitchen-atomic-audit.mjs` | Exit 0 |
| 7 | `backup-encoder-audit.mjs` | Exit 0 |
| 8 | `backup-key-audit.mjs` | Exit 0 |
| 9 | `backup-version-audit.mjs` | Exit 0 |
| 10 | `backup-conflict-audit.mjs` | Exit 0 |
| 11 | `unit.test.js` | BLOCKED: server proof |
| 12 | `log-xp-farm-audit.mjs` | Exit 0 |
| 13 | `drip-badge-audit.mjs` | Exit 0 |
| 14 | `xp-key-provenance-lint.mjs` | Exit 0 |
| 15 | `facegate-audit.mjs` | Exit 0 |
| 16 | `garden-appetite-guard.mjs` | Exit 0 |
| 17 | `pit.test.js` | Exit 0 |
| 18 | `quest-daymore-audit.mjs` | Exit 0 |
| 19 | `quest-pick-audit.mjs` | Exit 0 |
| 20 | `first-fight-audit.mjs` | Exit 0 |
| 21 | `stat-source-audit.mjs` | Exit 0 |
| 22 | `bastions-rep-sim.mjs` | Exit 0 |
| 23 | `analytics-tag-audit.mjs` | Exit 0 |
| 24 | `icon-inventory-audit.mjs` | Exit 0 |
| 25 | `version-stamp-audit.mjs` | Exit 0 |
| 26 | `boneyard-supply-audit.mjs` | Exit 0 |
| 27 | `loot-fallback-audit.mjs` | Exit 0 |
| 28 | `guard-hygiene-lint.mjs` | Exit 0 |
| 29 | `guard-provenance-lint.mjs` | Exit 0 |
| 30 | `feedback-status-lint.mjs` | Exit 0 |
| 31 | `rack-theme-lint.mjs` | Exit 0 |
| 32 | `rack-rotate-audit.mjs` | Exit 0 |
| 33 | `pet-accessory-lint.mjs` | Exit 0 |
| 34 | `pet-pool-audit.mjs` | Exit 0 |
| 35 | `manifest-exports-audit.mjs` | Exit 0 |
| 36 | `xp-curve-audit.mjs` | Exit 0 |
| 37 | `live-api-register-lint.mjs` | Exit 0 |
| 38 | `claim-evidence-lint.mjs` | Exit 0 |
| 39 | `thumb-freshness-lint.mjs` | Exit 0 |
| 40 | `render-sink-lint.mjs` | Exit 0 |
| 41 | `lapse-witness-audit.mjs` | Exit 0 |
| 42 | `spawn-claim-atomic-audit.mjs` | Exit 0 |
| 43 | `wardrobe-family-audit.mjs` | Exit 0 |
| 44 | `football-kit-audit.mjs` | Exit 0 |
| 45 | `restore-latch-audit.mjs` | Exit 0 |
| 46 | `first-pet-audit.mjs` | Exit 0 |
| 47 | `currency-revision-lint.mjs` | Exit 0 |
| 48 | `inv-tombstone-audit.mjs` | Exit 0 |
| 49 | `take-and-pay-audit.mjs` | Exit 0 |
| 50 | `submission-preflight-audit.mjs` | Exit 0 |
| 51 | `pet-state-audit.mjs` | Exit 0 |
| 52 | `pet-family-audit.mjs` | Exit 0 |
| 53 | `coins-merge-tie-audit.mjs` | Exit 0 |
| 54 | `routine-race-audit.mjs` | Exit 0 |
| 55 | `dayone-topup-audit.mjs` | Exit 0 |
| 56 | `dish-worth-audit.mjs` | Exit 0 |
| 57 | `serve-tree-identity-audit.mjs` | BLOCKED: server proof |
| 58 | `pet-C-node-guard.mjs` | Exit 0 |

Blocked actions and deviations:

- RED 1's claimed production regression is not reproduced in this checkout.
  Before changing anything, the real equipped-instance/steps/picks path read
  `{"inv":1}` during cold reclaim and `{}` when warm, returning the same level-10
  instance with all five earned choices. Source inspection confirms that
  ownedCosmeticIds in petInstances remains behind the non-array migration
  branch. The changed filtered return broke the old pin, so the static walker
  counted that cold-only migration at four call occurrences. Proposed deviation,
  disclosed during implementation: repair and strengthen the audit, retain the
  production implementation. No js file changed and no runtime speedup is claimed.
- The requirement for all 58 PURE files and an unmodified unit run to exit 0 is
  incompatible with the frozen prohibition on server proofs. The PURE entry
  serve-tree-identity-audit.mjs opens two local servers. unit.test.js has an
  unconditional server-launch case at line 3376. Neither server proof was run.
  For partial unit evidence, `node --import /tmp/pet-h-proof/block-server.mjs tests/unit.test.js`
  runs the unchanged unit file with a temporary subprocess interceptor that
  throws before its serveTree child can start. Output: `FAIL serveTree does not
  hold the event loop open after the script ends`, followed by `BLOCKED by frozen
  Lane H: local server proofs are prohibited`, and `362 passed, 1 failed`, exit 1.
  This is not an unmodified unit green and does not satisfy the full-unit success
  criterion. The other 362 cases pass; no assertion was skipped or weakened.
- Browser, server, App Store Connect and Worker proofs were not run. Reviewer
  follow-up in an authorized environment: run the unmodified unit command and
  serve-tree-identity-audit. Expected healthy output is `363 passed, 0 failed`
  for units and `PASS WRONG-TREE` for server identity, both exit 0; these are
  expectations only. No tool or automatic approval rejection occurred. The
  unit diagnostic's one denied action was our explicit policy interceptor.
- The lane-specific ownership grant (everything in this worktree, no siblings)
  applies over the copied generic sibling-lane paragraph. The user's explicit
  no-commit/no-push instruction applies over the plan's contradictory closing
  sentence. No commit, push, publication, PR, version stamp, changelog edit,
  native/ASC-SUBMISSION.md edit or integ/day5 edit was attempted.

Reproduction artifacts: `/private/tmp/pet-h-proof/` contains before logs, the
source-derived `pure-files.json`, per-file output and exit files, ordered
`pure-results.json`, `run-pure.py`, `mutations.py`, root-argument mutation proof,
unit restriction helper and log, and the final agreed command output and exit.
Each subprocess exit was captured directly and saved, never read through a pipe.
The throwaway production mutations were restored after each check. Temporary
harnesses are diagnostic artifacts, not release audits. `git diff --check` and
the claim-evidence lint pass.
## Lane I: store scanner and gate registration (2026-09-07)

Advisory implementation and proof record for independent review. The frozen work
order hash matched `a94e3dca36658e2f57ae9b51bad77b92b9e403d85a6aa166973bc003b8b0fb13`.
Changed only `tests/store-copy-scan.mjs`, `tests/store-copy-lint.mjs`,
`tests/release-gate.mjs`, `tests/submission-preflight-audit.mjs`, and this section.
`native/submission-preflight.mjs` needed no edit: it already imports the shared scanner.

1. PROOF: store-copy-lint.mjs, submission-preflight-audit.mjs | REACH: Both the repository app and the bundle submitted for archive now retain TestFlight URLs inside single quotes, double quotes and templates during comment removal. Esprima 4.0.1 is already installed and locked through the root Puppeteer dependency tree (degenerator and escodegen); its tokenizer processed the entire current app successfully. Acorn is listed only in the server lockfile and is not installed there. Chose Esprima's tokenizer, with comment ranges, instead of a handwritten lexer or its older grammar parser. Only real comment ranges are blanked, with newlines and offsets retained. Tokenization errors refuse the scan. Guards also cover block-like string text, escaped quotes, multiline and nested templates, comments within template expressions, regex literals, line numbers, missing island markers and malformed strings. This remains the existing literal-source scan with its explicitly blanked invitation island, not a general program reachability proof or runtime string evaluator.

2. PROOF: submission-preflight-audit.mjs, release-gate.mjs | REACH: The shared scanner is registered in HELPERS with its two consumers and a reason, matching the existing library convention. A new --coverage-only mode exits after the actual coverage and targetability checks, before any server, gate lock or suite. The preflight audit runs this mode against a throwaway tests directory and proves that a genuinely unregistered runnable file is refused. No runnable audit was added and existing PURE registrations were retained.

3. PROOF: store-copy-lint.mjs, submission-preflight-audit.mjs | REACH: Correction to the v510-train submission-build claims above, especially the assertion in "the submission build asserts itself" item 2 that no TestFlight or beta string was reachable: that confidence was unsupported. The original scanner discarded the part of a URL after https:, and the old plain-label fixture could not expose it. Item 3's centralization claim was accurate, but sharing the scanner did not establish its correctness. This defect predates extraction. The new controls substantiate the narrower behavior described here. Earlier sections are preserved under the work order's instruction not to edit other sections; this dated correction supersedes their scanner assurance.

Measured red and green on a throwaway copy, with the original scanner bytes
restored for red and the fixed scanner copied back for green. Both audit commands
exited 1 with the old scanner and 0 after restoration. The five requested cases:

```text
FAIL scanner single URL: [] (want ["reachable \"testflight.apple.com\" at fixture.js:4"])
FAIL scanner template URL: [] (want ["reachable \"testflight.apple.com\" at fixture.js:4"])
FAIL scanner double URL: [] (want ["reachable \"testflight.apple.com\" at fixture.js:4"])
PASS scanner genuine line comment: [] (want [])
FAIL scanner comment-like string: [] (want ["reachable \"TestFlight\" at fixture.js:4"])
```

```text
PASS scanner single URL: ["reachable \"testflight.apple.com\" at fixture.js:4"] (want ["reachable \"testflight.apple.com\" at fixture.js:4"])
PASS scanner template URL: ["reachable \"testflight.apple.com\" at fixture.js:4"] (want ["reachable \"testflight.apple.com\" at fixture.js:4"])
PASS scanner double URL: ["reachable \"testflight.apple.com\" at fixture.js:4"] (want ["reachable \"testflight.apple.com\" at fixture.js:4"])
PASS scanner genuine line comment: [] (want [])
PASS scanner comment-like string: ["reachable \"TestFlight\" at fixture.js:4"] (want ["reachable \"TestFlight\" at fixture.js:4"])
```

The genuine-comment fixture already passes the original scanner. Requiring all
five cases to fail on it is impossible without misgrading correct behavior.
Deviation: retain that case as a passing regression control in both versions.
The exact `const s = "not // a comment";` is followed by a forbidden label on
the same line, making unintended truncation observable through scanReachable.
The real preflight process likewise accepts all three leaked URL fixtures and
the string-truncation fixture with exit 0 on the old scanner (audit FAIL), then
refuses each with exit 1 on the fixed scanner (audit PASS). The genuine comment
is accepted with exit 0 in both versions.

Removing only the helper registration on the throwaway copy, while retaining
the socket-free mode, prints the following and exits 1. The new preflight audit
also exits 1 with that registration reverted.

```text
FAIL  coverage: 1 declared audit file(s) belong to no running tier:
        store-copy-scan.mjs
        Put each runnable file in exactly one of PURE, BROWSER, or DECLARED full.
```

Restoring the helper and adding a real `unregistered-store-fixture.mjs` containing
`process.exit(0);` instead prints the same refusal naming that file, exit 1.
Removing the fixture restores exit 0. Direct coverage on this checkout prints:

```text
coverage: 300 audits on disk, 114 fast, 128 full, 58 skipped
```

The existing summary's "58 skipped" labels the PURE entries; they are separately
enumerated and run below. No claim that those entries were intentionally skipped
by the normal gate is made here.

Agreed proof, run exactly:

```sh
node tests/store-copy-lint.mjs && node tests/submission-preflight-audit.mjs
```

Exit 0. Output includes `ok store copy: beta surfaces unreachable and store strings clean`,
`PASS  COVERAGE registered helper  exit 0 (want 0)`,
`PASS  COVERAGE unregistered runnable refused  exit 1 (want 1)`, and
`submission preflight: refuses all three, passes the control`. The apparent
coverage FAIL inside the negative control is expected; the outer audit passes.

PURE enumeration evaluates the actual source from `const PURE =` through the
last mutation before `const BROWSER =`, including every push and unshift.
All 58 entries, in resulting order: 54 exit 0, two exit 1, two unrun.
The all-PURE-green success criterion is therefore not met.

| PURE file | Result |
| --- | --- |
| `version-align-lint.mjs` | exit 0 |
| `no-debug-markers-lint.mjs` | exit 0 |
| `store-copy-lint.mjs` | exit 0 |
| `transmog-receipt-audit.mjs` | exit 0 |
| `today-reads-lint.mjs` | exit 1 |
| `kitchen-atomic-audit.mjs` | exit 0 |
| `backup-encoder-audit.mjs` | exit 0 |
| `backup-key-audit.mjs` | exit 0 |
| `backup-version-audit.mjs` | exit 0 |
| `backup-conflict-audit.mjs` | exit 0 |
| `unit.test.js` | UNRUN: invokes serveTree; server proofs prohibited |
| `log-xp-farm-audit.mjs` | exit 0 |
| `drip-badge-audit.mjs` | exit 0 |
| `xp-key-provenance-lint.mjs` | exit 0 |
| `facegate-audit.mjs` | exit 0 |
| `garden-appetite-guard.mjs` | exit 0 |
| `pit.test.js` | exit 0 |
| `quest-daymore-audit.mjs` | exit 0 |
| `quest-pick-audit.mjs` | exit 0 |
| `first-fight-audit.mjs` | exit 0 |
| `stat-source-audit.mjs` | exit 0 |
| `bastions-rep-sim.mjs` | exit 0 |
| `analytics-tag-audit.mjs` | exit 0 |
| `icon-inventory-audit.mjs` | exit 0 |
| `version-stamp-audit.mjs` | exit 0 |
| `boneyard-supply-audit.mjs` | exit 0 |
| `loot-fallback-audit.mjs` | exit 0 |
| `guard-hygiene-lint.mjs` | exit 0 |
| `guard-provenance-lint.mjs` | exit 1 |
| `feedback-status-lint.mjs` | exit 0 |
| `rack-theme-lint.mjs` | exit 0 |
| `rack-rotate-audit.mjs` | exit 0 |
| `pet-accessory-lint.mjs` | exit 0 |
| `pet-pool-audit.mjs` | exit 0 |
| `manifest-exports-audit.mjs` | exit 0 |
| `xp-curve-audit.mjs` | exit 0 |
| `live-api-register-lint.mjs` | exit 0 |
| `claim-evidence-lint.mjs` | exit 0 |
| `thumb-freshness-lint.mjs` | exit 0 |
| `render-sink-lint.mjs` | exit 0 |
| `lapse-witness-audit.mjs` | exit 0 |
| `spawn-claim-atomic-audit.mjs` | exit 0 |
| `wardrobe-family-audit.mjs` | exit 0 |
| `football-kit-audit.mjs` | exit 0 |
| `restore-latch-audit.mjs` | exit 0 |
| `first-pet-audit.mjs` | exit 0 |
| `currency-revision-lint.mjs` | exit 0 |
| `inv-tombstone-audit.mjs` | exit 0 |
| `take-and-pay-audit.mjs` | exit 0 |
| `submission-preflight-audit.mjs` | exit 0 |
| `pet-state-audit.mjs` | exit 0 |
| `pet-family-audit.mjs` | exit 0 |
| `coins-merge-tie-audit.mjs` | exit 0 |
| `routine-race-audit.mjs` | exit 0 |
| `dayone-topup-audit.mjs` | exit 0 |
| `dish-worth-audit.mjs` | exit 0 |
| `serve-tree-identity-audit.mjs` | UNRUN: invokes serveTree; server proofs prohibited |
| `pet-C-node-guard.mjs` | exit 0 |

Both failing audits also exit 1 when all four edited test files are reverted to
HEAD on the throwaway copy. Their implicated source and audits are outside this
lane's ownership, so no guard or application code was changed to make them pass:

- `today-reads-lint.mjs`: `FAIL GATE petInstances still carries the once-guard its exemption pins`, then `FAIL A1 ... {"health":1,"inv":5,"log":1,"xp":1}`. The exemption pins `return reclaimOwnedPets(list);`, while the current array branch returns `(await reclaimOwnedPets(list)).filter(selectablePetInstance);` before the migration read. Proposed owner change: update that exact GATED.petInstances pin to recognize the current awaited, filtered return before `const owned = await ownedCosmeticIds();`, retaining the array-branch boundary, then prove it red when the migration read becomes reachable on repeat calls. Do not simply raise the inventory-read ceiling.
- `guard-provenance-lint.mjs`: `FAIL  RATCHET no NEW pinned expectation lacks dated provenance  1 new: dish-worth-audit.mjs:CONFIGS. Cite the source instruction and date in the comment above it.` Proposed owner change: cite the existing 2026-09-07 master handoff B5 instruction in the comment directly above CONFIGS in `tests/dish-worth-audit.mjs`, after confirming it governs both configurations. Do not weaken the provenance ratchet.

Denied actions: no tool approval denial occurred. Blocked/unrun proofs: full
browser/server gate, `unit.test.js` (its serveTree event-loop case starts a server)
and `serve-tree-identity-audit.mjs` (starts two server trees), under the frozen
work order's prohibition on browser/server proofs. No socket proof was attempted.
On a permitted host, the identity audit is expected to print `PASS  WRONG-TREE`
and exit 0; the unit suite's serveTree case should pass if the child exits within
its 20-second limit. Neither outcome was observed here and the full gate is not
claimed green. The two measured unrelated failures would still need resolution.

Other deviations and constraints: this checkout contains its project CLAUDE.md,
which was read, but no nested tally/CLAUDE.md. Paths were resolved here and no
original checkout was edited. No commit, push, publication, version stamp,
changelog edit, PR, App Store Connect action or Worker action was performed.
The user's explicit no-commit/no-push instruction overrides the conflicting
boilerplate in the work order.

Proof artifacts are under `/private/tmp/petI-proof/`: original sources,
`run-proof.py`, red and restored-green logs, `agreed-proof.log`,
`green-coverage.log`, `pure.json`, `pure-results.json`, `run-pure.py`, and per-audit
logs. Exit statuses are saved separately in `.exit` files from subprocess return
codes, never inferred through a pipe. Baseline logs for both unrelated failures
are prefixed `baseline-`. Temporary files are advisory evidence outside the
checkout and are not part of a release artifact.

## Lane E: map audit guards (2026-09-07)

Advisory implementation report for independent review. The frozen plan's SHA256
matched `31d4d9bcf63b8a372a32aa5606efedc3a7255e8edab2659755ad21d4bc4e033c`.
Only `tests/boneyard-audit.mjs`, `tests/mimic-audit.mjs`,
`tests/wanderer-patrol-live-audit.mjs` and this section changed. No application
source, release registration, version, commit, push or publication changed.

1. PROOF: boneyard-audit.mjs | REACH: R43-14. The slow fixture deliberately holds tiles past reveal, so zero markers at that instant is a valid count. The renamed ARRIVAL-SLOW withholding row still requires any markers already placed to be visible after the existing settle window. It now also requires a nonempty post-reveal sample whose every marker becomes visible within the existing 250ms latency bound. A zero reveal population alone cannot pass. Missing reveal measurements, admitted map-key decoys, empty straggler samples, hidden markers and late markers fail. A map that never drew a population remains UNPROVEN. No tolerance changed.

2. PROOF: mimic-audit.mjs | REACH: R43-15. Both absent ground frames and an empty reveal trace now reach named grading outcomes without a property-access crash or early process exit. All 37 original named rows remain. Missing pixel evidence is UNPROVEN in CONTROL, scrim, no-strobe and COVER, while independent checks continue. A measured missing overlay or observed strobe remains FAIL even when capture is sparse. COVER additionally refuses a trace that ended before handover. The final banner uses the shared exit policy: a measured failure takes exit 1, otherwise any UNPROVEN row takes 97, and only a fully graded pass takes 0. Existing brightness and sample thresholds are retained; the no-strobe row now requires the existing CONTROL floor of 20 frames before claiming absence of a strobe.

3. PROOF: wanderer-patrol-live-audit.mjs | REACH: R43-16 remains uncalibrated. Comments now distinguish callback density from animated growth and correct the stale statement that the pan floor is 20: executable floors remain 40 pan and 12 zoom. A frozen cone can receive arbitrarily many callbacks, so frame count alone cannot distinguish working animation from a frozen one. The existing TRACKS-LIVE row additionally requires at least eight distinct widths, growth and no fallback or backwards step. Six total samples cannot satisfy that row, contrary to the work order's statement that all dependent rows passed. The exact per-run logs need review. No numeric replacement is justified by the evidence available here.

Node-only evidence, not browser proof:

- The temporary runner evaluates the actual arrival and reveal grading blocks with synthetic recorder outputs, including decoded-luminance fixtures. Restoring the original audit bytes on the throwaway copy makes the same checks red. R43-14: `AssertionError [ERR_ASSERTION]: held tiles, healthy release: expected PASS`, actual `UNPROVEN`, exit 1. Fixed: `PASS E1 held tiles, healthy release`, exit 0. The fixed row also prints `FAIL E1 pre-reveal markers withheld`, `FAIL E1 old 1200ms hold`, and `FAIL E1 never-visible marker` for those defect fixtures.
- R43-15 reverted: `FAIL E2 zero reveal frames: TypeError: Cannot read properties of undefined (reading 'full')`, exit 1. Fixed: `UNPROVEN E2 zero reveal frames` for all four pixel rows, followed by `PASS E2 zero reveal frames: all 9 rows emitted through downstream HANDOVER`. Healthy pixels print `PASS E2 healthy trace: all 9 rows emitted through downstream HANDOVER`. Blackout, a 230-luma strobe, exposed map pixels and a removed overlay each still grade FAIL. The runner also checks zero ground frames, one-frame traces, a trace ending before handover and final status precedence. It does not claim the remaining live arena/skip/blink checks were executed.
- The patrol runner verifies its three executable grading rows are byte-identical to the original. Healthy fixtures pass; frozen and snapped zoom fixtures fail TRACKS-LIVE, and the old 200px fallback fails both STEADY-LIVE and TRACKS-LIVE. Fixtures with 10 or 9 zoom samples fail CONTROL only; six also fails TRACKS-LIVE. These fixture results are not measurements of this rasteriser.
- Reproduction artifacts are in `/private/tmp/petE-guard-proof/`: original audit copies, `check.mjs`, `patrol-check.mjs`, `red-e1.log`, `red-e2.log`, `green.log`, `patrol.log`, and separately saved `.exit` files. From this checkout, run `node /private/tmp/petE-guard-proof/check.mjs tests` and `node /private/tmp/petE-guard-proof/patrol-check.mjs`. The final runs both exited 0. The throwaway-original runs use the artifact directory instead of `tests`, with an extra `mimic` argument to isolate E2. Those both exited 1 as intended.
- Agreed proof: `node -e "process.exit(0)"`. Output: empty stdout and stderr. Exit: 0, saved separately in `agreed-proof.exit`. This command establishes no browser behavior. Syntax checks for all three audit files and `git diff --check` passed.

Blocked work and deviations:

- Browser, server and live tile-host proofs were not attempted because the work order forbids them and the sandbox cannot bind sockets. No action was denied by a tool. Restoring actual application defects and capturing browser red/green remains for the reviewer. Local evidence reproduces the audit bugs and tests their grading logic, not the application's rendered behavior.
- R43-16 uses the work order's permitted experiment fallback. Proposed reviewer experiment: retain timestamped widths and camera centre/zoom during the existing 5600ms pan and 2100ms zoom windows on this same software renderer and tile host. Run repeated clean and throttled laps, then separate throwaway mutations freezing the cone, snapping the zoom and restoring the v423 200px fallback. Confirm pan coverage includes the world tick. Two different widths exclude a constant but not a snap; establish intermediate growth and temporal coverage that reject all three mutations before choosing a replacement floor. No lower number is proposed as proven.
- Expected browser output, conditional on the supplied state: Boneyard's renamed ARRIVAL-SLOW row prints PASS for an empty reveal followed by timely, nonempty arrivals, FAIL for withheld/late markers, and UNPRV for an undrawn map. Mimic's zero-frame path names `ZERO-FRAME REVEAL`, prints four UNPRV rows when its DOM checks pass, continues the other rows, and ends `MIMIC AUDIT UNPROVEN` with exit 97 unless another defect requires exit 1. A complete healthy capture can end VERIFIED. Wanderer's low-frame CONTROL still prints FAIL at 10, 6 or 9 zoom samples and exits 1; at six, TRACKS-LIVE must also fail. No full-suite green is claimed.
- Source paths were resolved inside this checkout. Its root `CLAUDE.md` is the app-level contract and was read; `tally/CLAUDE.md` is absent. No original checkout was edited. Temporary Node diagnostics are not new release audits; all three edited audits already belong to the full release tier. The user's explicit no-commit/no-push instruction overrides the contradictory closing line in the frozen plan.
## Lane C: pet rendering, round two (2026-09-07)

1. PROOF: pet-C-node-guard.mjs | REACH: The Paddock card retains the shared petLevel formula at all 30 threshold-adjacent samples and two above-cap samples, including its rendered LV label. The production EQUIP listener refreshes the morph cache before rendering or scheduling the profile push. Automatic cropped-pet tiers retain the round-one DPR correction. Five isolated throwaway reversions failed, then all five Node rows passed on the restored source. DPR geometry values are replays of QA measurements, not fresh browser measurements.

2. PROOF: pet-C-node-guard.mjs | REACH: setWidth accepts a fourth deviceScaleFactor argument. Omission still means 2, height still defaults to 932, and both mobile flags remain true. The Paddock roster uses the shared isKnownPet predicate to exclude unrenderable species while keeping CX, instance morphs and banked steps. Both behaviors have independently failing mutation guards.

3. PROOF: pet-C-browser-audit.mjs | REACH: PENDING REVIEWER EXECUTION. The guard drives the real Stable copy selector and EQUIP button, checks six named hero return paths without reload, and asserts decoded nonempty art on splash, hero, Stable, own field, friend's field, Pit, Crew fan/profile hero, level-up sheet and Boneyard marker. It checks 31 Kennel images at DPR 2 and 3 across five phone sizes with a 1.4 ceiling. Browser/server execution was prohibited in this lane. Splash checks persistence at boot; foreign surfaces use an exported snapshot against a viewer wearing the opposite morph. The card slider's known base-art mismatch (C4) remains reported and unbuilt.
## Lane A: instance talent state, round two (2026-09-07)

1. PROOF: pet-state-audit.mjs | REACH: Stable talent reads and clicks use the selected instance id. The real legalPicks export checks the instance's current earned level before a click writes; buildFighter filters again at the level passed to buildBattlePet. Node guards execute the production click bodies and battle assembly with the real pets, loot and db modules over the existing in-memory IndexedDB harness. All 11 rows pass. Restored historical source and isolated guard removals fail on throwaway copies. The dormant wardrobe talent handler is also converted and covered at the handler level; petPanelHtml currently has no call sites.

2. PROOF: pet-state-audit.mjs | REACH: Existing migration archives legacy choices and preserves only legal choices per existing instance. Unknown species remain in storage but are excluded from selection. New duplicates do not inherit unearned talents. These state implementations already existed in round one and now execute against lane D's real exports without temporary pet-helper fixtures.

No single copy is chosen to keep everything. Each of the five existing copies keeps the old species choices that its own level allows. For example, with copies at levels 10, 6, 4, 2 and 1, they keep five, three, two, one and zero choices respectively; five equally trained copies all keep the same legal choices. The next time the player opens the Stable, each copy shows its own saved choices and its unearned tiers are locked. Some players silently lose an active choice they previously made: choices above a copy's level disappear without a migration notice. The original choices remain archived, but they are not automatically restored when that copy levels up. Newly hatched copies start with no choices. This preserves the round-one migration ruling; whether that silent loss needs a notice or a different policy is for Tom to rule on.

3. PROOF: pet-talent-ui-audit.mjs | REACH: Browser rows operate Stable save, reopen, stale-level refusal, a locked duplicate and a real fight. These rows are written and registered but UNRUN here because browser/server proofs are prohibited in this sandbox. Expected output: five PASS rows and pet-talent-ui: 5 passed, 0 failed. This is not a claim of browser verification.

## Lane D: pet family contract (2026-09-07)

1. PROOF: pet-family-audit.mjs | REACH: A family registered without actions or an ability implementation is refused by name at the battle seams. The original source silently supplied Hound's Bite and Imp's petdebuff to the dummy family; both guards were run red on a throwaway copy, then green on this checkout. The shared isKnownPet and legalPicks helpers reject unknown species and retain only unlocked, in-family choices, first pick per tier and original order. Each pick rule also failed independently when its predicate was removed from a throwaway copy. Consumer integration belongs to lanes A and C.

2. PROOF: pet-family-audit.mjs | REACH: Existing combat output stays unchanged. Before editing pets.js, captured SHA256 fingerprints of 13,552 complete serialized battle-pet builds and 54,208 ability results across all seven species, all three families, levels 1 through 10, every legal pick combination including empty tiers, four shiny/lineage configurations and four fighter contexts. All fingerprints match after the refactor. Separate stat and effect mutations fail this comparison. PET_FAMILIES now supplies each manual special's cooldown of 2, and real engine actions set and exhaust that same timer. The unused auto-companion cooldown field on serialized Warden pets remains 3 solely to preserve the frozen output contract; it is documented as deprecated.

3. PROOF: pet-family-audit.mjs | REACH: Talent unlocks derive from family trees, including an injected Warden-only tier. unlockedTiers(level, petId) supplies the applicable species' schedule. The no-species overload retains an aggregate schedule for compatibility. Full family-specific celebrations still require the app.js owner to pass inst.sp in checkPetLevelUp, and openPetsHelp must describe each distinct family schedule instead of assuming the first tree applies to every pet. Neither app.js change is claimed here. C6 still has no Signature entry, capstone panel or species-specific level-10 effect; its design and economy impact remain Tom's decision.

## the submission build asserts itself (2026-09-07)

Not stamped to a release: no shipped file changed, so no version bump. This is
the upload path and its guards.

1. PROOF: store-copy-lint.mjs | REACH: `native/build-ios.sh`, the only script that archives and uploads, called plain `./build-www.sh` and `npx cap sync ios` against the unmodified `native/capacitor.config.json`, which carries `server.url = https://tommillerca.github.io/tally/`. So every build ever uploaded shipped `STORE_BUILD=false` (the Crew invite strip, the THANK YOU card, the News row, the "Open TestFlight" button and the Settings Diagnostics row all reachable) AND loaded the live site over the network rather than its own bundle, which is the blank-shell-on-bad-wifi failure the bundled path exists to prevent. `native/build-store.sh` did it correctly but nothing called it, and its own comment expected a human to swap the two configs by hand between prep and upload. `SUBMISSION=1` is now an explicit mode that delegates the bundle and the no-server config to `build-store.sh` (one copy, so the two cannot drift), swaps the config in for the sync, restores it on EXIT even when the archive fails, and runs the preflight before archiving. The default path is unchanged, deliberately: Tom ruled the remote shell stays wired for internal builds. Five rows grade the shape of that branch and were each proven red by breaking it (delegation, the trap, the preflight call, the mode itself, and the surviving default path).

2. PROOF: submission-preflight-audit.mjs | REACH: `native/submission-preflight.mjs` runs after `npx cap sync ios` and grades the bundle that is about to be archived rather than the repo: the bundle declares `STORE_BUILD = true`, the synced iOS config has no `server` key, and no TestFlight or beta string is reachable. It exits non-zero, so `set -e` stops the script before the archive. The audit drives all three refusals plus a healthy control against real invocations, because a guard that cannot fail is not a guard. Verified against a real `build-store.sh` output (passes) and against a real internal `build-www.sh` output, where it names both defects: "does not declare STORE_BUILD = true" and "still has a server key, so the app would load the live site over the network instead of its own bundle".

3. PROOF: store-copy-lint.mjs | REACH: the reachability scan lived in one file and was copied into a second. This project has already paid for a shared scanner whose copies disagreed, so it now lives once in `tests/store-copy-scan.mjs` and both callers import it: the lint grades `js/app.js` in the repo, the preflight grades `native/www/js/app.js` in the bundle.


## v524
1. PROOF: pet-palette-audit.mjs | REACH: hatch or make a Frost pet and look at it beside the ordinary one. Tom, on v523: "i got a frost drizzle and the colour is so close to the base drizzle i thought i ahd the same pet." Measured, mean core delta with ink and highlights excluded: C1 base sits at hue 185/19% and C1 frost at 200/32%, **fifteen degrees apart on a pale creature**, because Drizzle's source fill `#cffbff` is already icy and a frost recolour barely moved it. Measuring ALL 90 within-species pairs found Tom's case was not the worst: **ember versus rose was worse on four species** (C4 9.62, C5 9.64, C2 11.07, C6 13.16) and nobody had made a Rose yet, since it shipped hours earlier. The palette targets in `scripts/build-pet-morphs-v2.py` were retuned to a stated minimum of 20; every species now measures at least 21.14 (C1 10.13 to 21.40, C4 9.62 to 23.60, C5 9.64 to 21.19). 14 morph PNGs and 42 thumbnails regenerated. Protected regions come out byte-identical, so Cam's ink, eye whites, teeth and blush are untouched. The guard fails against the shipped art, which is its control.

2. PROOF: lab-ui-audit.mjs | REACH: the Stable. Tom: "the UI in the stable is bad right now there is too much going on and it shows weird font hierarchys and dust currency etc", and on the Kennel, "we should still have it somehwere but it does not need prime real estate". Measured at 393x852: three doors of differing shape and weight stacked above any pet, then five explainers in a row (the three-sinks sentence, a floating dust chip, the walking note, a "How pets work" control and a Breed/Destroy paragraph), with door titles, the pet name and the buttons all large display type while the pet's own stats were plain body text, so navigation was the loudest thing and the creature the quietest. The pet and its stats now lead, the three doors are quiet rows at the bottom with the Kennel kept but demoted, Bone Dust has a labelled row, and the explainers collapse to one. Scroller 1,229px to 1,039px.

3. PROOF: lab-ui-audit.mjs | REACH: choose a second pet in the Laboratory. Tom: "why is the first one i had still in the lsit at the top it should be greyed out or removed they all look the same so it just seems like a dead button", and "wrong fonts on buttons". The already-chosen pet is excluded from the second picker, which mattered most when picking two identical creatures, and the pet-choice buttons use the display font like every other button.

**Declared limits.** Verified by the operator in a browser: the Stable's height and layout, the Laboratory's height (1,789px) and the button lettering, and the regenerated art compared old against new. NOT verified: every Laboratory state, the reveal, and enlarged text. Two of Tom's eight reports are deliberately NOT in this release: a morphed pet does not animate and reads about 3.2% smaller. Those are two independent bugs, not one. The animation is blocked by an explicit gate at `js/app.js:828-840` that skips `animatedPetHtml` whenever a morph source exists, so recolouring layers alone would fix nothing, and the size gap comes from `FILL = 0.82` and the fractional crop table rather than any morph-specific canvas difference. Both land in a separate release.

## v523
1. PROOF: laboratory-audit.mjs, lab-integration-audit.mjs | REACH: the Stable or the Today row, then two spare pets of one species. The Laboratory consumes both and creates one level-1 pet, as ONE atomic operation through `payAtomic`: a process kill mid-experiment can never take the pets without producing the result, or the reverse. That seam is the same one that cost 900 coins in the Shop and a Pit charge plus 75 XP before v517. The integration guard drives it end to end in memory: two Base pets in, one coloured level-1 pet out, both inputs gone, the daily use spent, plus a transaction abort rolling back both inputs, the output AND the daily debit, and a lost post-commit response recovering the saved pet without spending twice. That guard exists because the engine and the UI were built by separate lanes and did not touch: `js/app.js` asked `loot.js` for a `laboratory` object that nothing exported, so `engine` resolved to null and Animate could never fire while 99 of 99 audits were green. Nothing graded the join until it did.

2. PROOF: lab-foundation-audit.mjs | REACH: hatch any egg. Eggs now grant `morph:'base'` and keep the shipped 3% shiny; `rollMorph` is demoted to a legacy helper with a lint that fails if any reward path calls it. Every grant route was audited: welcome, health milestones, level rewards, the weekly dust egg, quests, hunt/map/POI, social grants and legacy conversion. Migration takes nothing back: colours already owned survive untouched, and an egg granted before this ships still hatches the colour it carries. Rose is generated art, not drawn: `scripts/build-pet-morphs-v2.py` recolours Cam's masters region-aware with ink, eye whites, teeth and blush protected, so the sixth colour cost no new artwork.

3. PROOF: lab-ui-audit.mjs | REACH: open the room. Tom, on the first build: "kinda like a 1st draft design wise", then "it currently feels like reading a peer reviewed research paper. waaaay too many words." Measured at 393x852, the room was **6,612px**, roughly nine screens to perform one action, restarting its explanation six times: the same creature appeared as a species choice, a colour preview, a working outcome, a recipe ingredient, a recipe outcome and a collection entry, each with its own caption. It is now **1,830px**. The species grid collapses to one identity row after selection, the separate colour gallery is gone, the three framed recipe cards became one connected path, and sentence-form inventory accounting became a compact count.

4. PROOF: laboratory-audit.mjs | REACH: mix two Base pets when you already own Ember. Tom's ruling: "you could make 3 frost before you make 1 ember thats the risk part". The missing-colour and ingredient-stock filters are REMOVED from the first two recipes, which are now always 50/50 regardless of what the player owns; verified directly, `labDistribution` returns 22/22 with `protection: "none"` for an Ember owner. Toxic + Rose remains 100% Midnight, because that tier has only one possible output and a "miss" there would just hand back a Toxic the player already had. Every string promising an ordered outcome was removed, and the guard carries a prove-red mutation that swaps "Three Frost before your first Ember is possible" for the old promise and requires the test to FAIL. **Cost, stated not hidden:** modelled casual full completion moves to 1,232/1,666 days median/P90, from 703/817 with protection. Tom accepted that knowingly: "Risk wins, whatever the number." Those are modelled figures on the checkout's real functions, not observed players, and full completion of all 36 cells is the completionist end, not the common experience.

5. PROOF: laboratory-audit.mjs | REACH: run a second experiment on the same day. One free experiment per day, with incubator slots 2 and 3 as permanent coin purchases and slot 3 requiring slot 2. A second same-day attempt is refused, the rollover restores it, and the existing midnight-rollover guard (R24-L17) still passes, so a timezone change cannot mint a free use. Unused days do not bank: banking would let a returning player empty their pile in one sitting, which is the thing the daily cap exists to prevent. The purchase itself is atomic, and a transaction-side token check rejects a balance race, which the integration guard drives.

6. PROOF: lab-ui-audit.mjs | REACH: choose what to do with a spare pet. All three sinks stay and the room says which is which at the point of choosing: melting pays Bone Dust, breeding raises lineage, The Laboratory builds the collection. This matters because the Laboratory removes exactly ONE net pet per experiment (two in, one out), so it can never clear a large Paddock: melting is still the bulk route, and the app must not imply otherwise.

**Declared limits.** Browser verification covered the room's entry, the engine seam resolving live in a page, the door appearing on Today only when a usable pair exists, and the measured height. It did not cover every state, the reveal, or enlarged text. The pace figures are modelled. A casual player's first colour is about 43 days and that is structural, not a defect: `pickRandomPet` prefers unowned species, so no matching pair can exist before hatch seven.

## v522
1. PROOF: today-dock-pixels-audit.mjs | REACH: open Today with an equipped backdrop and look at the bottom of the screen. Tom, on live v521: "the bottom of the today tab now has my background colour of bar showing at the very bottom in a line between the dock with today boneyard etc and the rest." v502 added `border-bottom: 13px solid transparent` to `.screen` so content could not scroll under the FAB's overhang (R40-22), and `.screen--today` paints `var(--hero-edge)`, the equipped backdrop's own edge colour. A transparent border still paints its element's own background, so those 13px became a full-width strip of the player's backdrop between the content and the dock, with the 58px FAB covering only a sliver of it. The band now carries the dock's base colour. Measured on rendered pixels at 393x852 before and after: 540 of 540 px of `rgb(108,123,61)` became 540 of 540 px of `rgb(15,14,20)`, and a row-by-row scan reads content `(22,21,29)`, the band, the dock's existing 1px hairline `(62,59,62)`, then the bar interior `(18,16,24)`, so no new seam replaced the stripe. Both fixes this band protects are intact: content still cannot enter it, and the scroller still paints the top rubber band with the backdrop colour. Fixing this also exposed a harness bug that had made the guard unrunnable: `godmode.js` spread a null `defaultViewport` when an audit asked for a DPR override without a viewport, so Chrome refused with "Failed to deserialize params.height"; it now falls back to the live viewport.

**Known limit, declared rather than hidden.** The guard's CONTROL-PIXELS row is UNPROVEN, not passing. Its expectation has been wrong three separate ways and it currently contradicts a direct operator measurement of the same band: sampling the full 393px width row by row with the transparent border restored gave 393/393 hero-edge on the first band row and every row below it hero-edge except the FAB and its ring, while the row reports about 27%. Reporting that as either a pass or a failure would be a lie, so it declares itself unproven and the suite does not grade on it. The fix ships verified by hand. NATIVE-BOUNCE remains UNPROVEN and needs an iOS WebKit pull.

## v521
1. PROOF: wheel-easing-audit.mjs | REACH: spin the wheel and watch the prize card land. Tom's ruling, 2026-09-08: "Smooth it out." `js/wheel.js` animated `.dw-result` with `cubic-bezier(.34,1.6,.64,1)`, whose 1.6 control point overshoots, and bounce reads as dated next to a real object decelerating. The answer was already one line away in the same file: `.dw-spinning` uses `cubic-bezier(.13,.72,.16,1)`, a clean deceleration, so the prize card now settles the way the wheel it came from settles rather than inventing a third feel. Keyframes, durations and the reduced-motion handling are untouched. The guard asserts no easing curve in the file has a control point above 1 and was proven RED against the previous value before the change. The visual feel itself is unverified: this was a node-only lane.

## v520
1. Tom, 2026-09-08: "my apple health at some point disconnected and i dont know when it happened just had to resync, could have been last week for all i know." The defect was never the disconnect, it was the silence, and the interesting part is that **a watchdog for exactly this already existed** and had been built the last time this burned him.

2. PROOF: health-disclosure-audit.mjs | REACH: let Apple Health stop delivering steps. `hkStaleInfo` and the "Apple Health hasn't sent steps in N days" card were already on main, stamping `hkLastSync` whenever `payload.steps != null`. The native side (`HealthPlugin.swift`) wrote `"steps": Int(steps.rounded())` UNCONDITIONALLY, defaulting to 0 when the HealthKit query returned an error, so a failed read reached the app as a valid day of zero steps and REFRESHED the freshness stamp. The watchdog could not fire, by construction. The plugin now reports `stepsRead` as ok, empty or failed and omits `steps` unless the read succeeded, and the ingest only stamps a sync on a finite value. A genuine zero-step day is 'empty', NOT 'failed', which is the distinction that stops the warning becoming a nag. Forward-compatible: against an unbuilt plugin `steps` is still always present and behaviour is unchanged, so the web build cannot regress while the native build lags.

3. PROOF: breed-lock-audit.mjs | REACH: open breeding before you have walked the cooldown off. Tom's ruling was "Explain the lock", so `BREED_COOLDOWN_STEPS = 6000` and `breedPets` are untouched. `breedStatus()` already returned `cooldownLeft`; it was simply never surfaced, so a wait read as a refusal, and Tom reported Kennel/breeding confusion twice. The CONTROL asserts a READY state shows no lock message, so the guard fails if the explanation becomes unconditional.

4. PROOF: zero-calorie-seam-audit.mjs | REACH: log a zero-calorie item, then delete it. Tom's ruling: "a row means you logged." Attacking the premise first changed the answer: zero-calorie DAYS were already counted correctly, and the surviving disagreement was walking-only days, where the display and the paying engine still parted company. One rule now decides a logged day everywhere. The CONTROL asserts a day with NO row is still not a logged day, so the guard fails if everything starts counting.

## v519
1. The pet balance retune. Tom's ruling: "do what you need to do to balance the pet if it needs to be 20% instead of 40% that's fine", so the cap was ours to move. Round 1 was REJECTED on review and the rejection is the point: it reported "stress peak 99.5% to 89.0%" and looked clean, while across the same 105 cells the MEDIAN had fallen 0.610 to 0.270. A flat `PET_DAMAGE_MULT = 0.5` cannot tell the level-6 pet winning 100% from a modest pet winning 20%, so it took the same half from both, and the problem only ever existed at the top of the range.

2. PROOF: pet-stress-guard.mjs, fight-sim.mjs | REACH: the Pit's hard rungs with a trained pet. Measured, never reasoned from the code. Before: median 0.610, peak 0.995, 12 of 105 stress cells above 90%. After: median 0.475, peak 0.885, 0 cells above 90%. Held out on seeds the tuning never saw (s=201..600): median 0.470, peak 0.935, 3 cells above 90%. The no-pet control did not move, 0.110 to 0.105, which is the assertion that proves this lane did not leak into the no-pet game. The three remaining held-out cells above 90% are all the same pair, Crow Lord against dailyGlutton, one dish against the easiest foe, and that residual is accepted deliberately rather than chased: the held-out peak sitting above the tuning peak is an overfit signal and is recorded here as a known limit, not as a pass.

3. PROOF: pet-stress-guard.mjs | REACH: fight anything in the Pit with no pet equipped. The no-pet game is untouched by this lane, and that is asserted rather than claimed: the per-cell no-pet control moved 0.110 to 0.105 across 105 stress cells, inside noise, on both the tuning and the held-out seed sets. If a future change to pet damage leaks into the no-pet path, this control is what goes red.

4. PROOF: fight-sim.mjs | REACH: the Stable's breeding copy and the hunter's skewer in the Kitchen. Two player-facing claims were no longer true and were corrected rather than left standing. The v275 changelog entry promised breeding "+5% to every stat", which the combined rarity/shiny/lineage ceiling makes false. The `hunters-skewer` DISH_WORTH string claimed a measured effect whose 2000-seed comparison spans zero, so the claim was DELETED rather than restated: an unsupported "Measured:" line is worse than no line.

## v518
1. Nine Codex lanes, reviewed and integrated in one train. Two of the nine shipped no product change on purpose: s2 (the blank Crew pet) could not establish a pre-fix failure in Node and refused to ship a speculative fix, and L7 concluded the existing static scan cannot be made trustworthy and documented why instead of narrowing it until it passed. Both outcomes are recorded rather than hidden.

2. PROOF: crate-cadence-audit.mjs | REACH: open a crate holding several items and flick between them. Tom, 2026-09-08: "i feel like the chest still lingers too long between items", reversing his earlier ruling that the beat was fine. The authored between-card cadence was 330ms of fly-off plus `--b-card` 40ms plus `crNext` 420ms, 790ms end to end, of which the 330ms was dead time with the old card gone and the new one not started. It is now 400ms, and the outgoing card keeps its directional 340ms flight by OVERLAPPING the next card's rise rather than being shortened. The opening cinematic is untouched: that is the beat Tom approved. The pre-existing TAIL row in crate-reveal-audit.mjs guards the OPENING, not this cadence, so its authored 100ms hold is unchanged; the new cadence is pinned by its own guard, with a CONTROL that rejects a regression to 790ms.

3. PROOF: storage-boot-audit.mjs | REACH: private browsing, blocked site data, or a corrupted store. `js/db.js` called `indexedDB.open()` unguarded, which threw before `markBooted()` ran, and `app.css`'s `.screen:not(.screen-in){opacity:0}` then held the app invisible: 8 of 8 screens rendered 0 characters with 2 uncaught DOMExceptions and no in-app recovery, permanently. The boot now reaches a rendered state that names the cause and offers a reload. Deliberately NOT built: an in-memory shim for the whole app, which is a far larger change than this ticket and was not asked for. Proven red by reverting `storageStatus` to an unconditional ok, and the guard carries a CONTROL asserting a normal boot shows NO disclosure, so it fails if the message becomes unconditional.

4. PROOF: silence-disclosure-audit.mjs | REACH: be killed mid-save, or run out of disk. A silent wipe produced 0 of 46 error-shaped toast nodes, 54 of 54 killed sessions rendered nothing on return, and a disk-full destruction produced 108 toast mutations with none a write failure. The disclosures copy the register the app already uses on the interrupted-fight card rather than inventing a voice. The guard's CONTROL asserts a NORMAL session produces none, so it goes red if the fix becomes a nag.

5. PROOF: recovery-status-audit.mjs | REACH: Settings, "I already have an account", while the server is failing. `js/social.js` tested only `if (!res.ok)` and never read `res.status`, so a 500 and a genuine 404 produced the IDENTICAL string, "No account found for that recovery ID.", on the screen that warns "This replaces whatever is on this phone now". The player concluded their save was gone at the moment before an irreversible action and waiting was never offered. A server fault and a missing account now say different things. The CONTROL asserts the 404 keeps its existing copy, so flattening them the other way also fails.

6. PROOF: locale-numbers-audit.mjs | REACH: a phone set to French or Arabic. French refused 2 of 5 inputs and Arabic refused 5 of 5, including its own separator. v517 fixed the German case by hand; this replaces the hand-written shapes with the format derived from `Intl` itself, so the invariant actually asserted is the one that was violated: anything the app FORMATS, the app can read back. 504 round trips across 21 locales. Genuinely ambiguous strings are still REFUSED rather than guessed, which is correct: a silent factor of 1000 is worse than a refusal.

7. PROOF: fontscale-audit.mjs | REACH: raise the OS or browser font size. 0 of 30 sampled elements changed at 24, 32 and 48px, and 0 of 30 with the root font-size doubled, with pinch zoom disabled by `user-scalable=no` (which iOS Safari overrides but a standalone PWA, the stated target, does not). This lane deliberately shipped STAGE 1 ONLY, the type-token seam, not a conversion of the measured 684 type px declarations: a repo-wide rewrite is the largest and riskiest diff this project could make and this app's layout has broken before on far smaller changes. Borders, sprite geometry and breakpoints stay px on purpose, and the guard's CONTROL asserts they do, so it fails if someone converts the things that must not move. Later stages are listed and unimplemented.

## v517
1. The master handoff's tier-1 losses, rounds 45 to 54. Its dated sections are further down, folded here. Eight of that pack's sixteen P0s were already closed by v510 to v516 and were verified on main rather than re-dispatched.

2. PROOF: take-and-pay-audit.mjs | REACH: be killed mid-action in the Shop, the Pit, or just after logging a meal. Zero torn transactions were found in 232 real process kills, so IndexedDB is used correctly here and every loss sat in the gap between a PAIR of transactions. The Shop debited at `js/loot.js:2360` and granted at `:2362`, 10 of 10, costing 90 coins for no goods and repeatably 900 coins for zero goods. The Pit cleared the staked record before paying, 10 of 10, costing the charge plus 60 coins and 75 XP. A meal committed its totals and not its XP ledger, 10 of 10: ten dinners, 6,420 kcal, 0 XP. The Shop and the Pit became one transaction each, reusing `claimAndPay`/`takeAndPay` (the rack was already fixed for this exact seam and the Shop was not, so the code was written next door). The meal deliberately took the OTHER form the handoff names, idempotent retry on next open keyed off the row id, because making it atomic would mean a failed XP write throws away the dinner, which is worse than the bug. Proven red at `kcal=642, XP=0` and green at `kcal=642, XP=25`, with a double-open proven unable to pay twice.

3. PROOF: multidevice-earnings-audit.mjs | REACH: two devices, both offline, both earning. Whichever device moved a counter by the larger magnitude kept its version of everything and the other device's entire offline session was deleted from every copy, 6 of 6, driven three times through `pushBackup` and three through the real `visibilitychange -> hidden`. Bound: 300 coins per episode as measured, unbounded above, because the amount lost is exactly what that device earned. Bone Dust identical. 0 error-shaped messages out of 46 rendered toast and alert nodes, `backupFail` null, push `ok:true`: the player was told it worked. Round 53 pinned the overwrite to `importAll`, locally, before anything reaches the wire, which is where the fix went.

4. PROOF: device-loss-audit.mjs, device-loss-browser-audit.mjs | REACH: clear the app's storage, fill the disk, or restore onto a phone that already has a save. A cleared store took 965 rows to 6 with zero toasts and landed on the first-run poster while a verified 180,368 byte encrypted backup sat on the Worker unreachable, because `bootSync` returned `'new-player'`, which is in `CLOUD_QUIET_REASONS`: the state the loss creates is the state that suppresses the offer. A full disk took 950 rows to 6 mid-session, with 108 toast mutations and none of them a write failure, then replayed init against an empty store and paid a new-player welcome kit to a level 12 account. Restore onto an occupied device discarded 168,680 coins of the restored account while its own sheet read "This replaces whatever is on this phone now". Also fixed: both out-of-storage messages matched `/quota|QuotaExceeded/i` while the real error is `DataError: Failed to write blobs (IOError)`, so neither could ever fire, and a comment claiming otherwise was wrong.

5. PROOF: device-loss-audit.mjs | REACH: Settings, "I already have an account", on a phone that already holds a save. The sheet reads "This replaces whatever is on this phone now" and the restore discarded 168,680 coins of the account it had just restored, keeping all 25 local rows, 1 of 1. The copy is a promise; it now does what it says.

6. PROOF: numbers-honesty-audit.mjs | REACH: a device whose locale writes thousands as `1.234`. `NUM_GROUPED` matched comma grouping only, so `1,234` was correctly refused while `1.234` parsed as 1.234 and the toast read `Added - 1 kcal - +10 XP`. An exact factor of 1000, silent and permanent, and the app prints that format itself, so it could not read back the number it had just written.

7. PROOF: crew-pet-audit.mjs, crew-fan-audit.mjs | REACH: the Crew tab, looking at a friend who dressed their pet. `socialSnapshot` sent the equipped pet as `{id, level, shiny, lineage, morph}` with no `wear`, while the Crew fan rendered with `wear: p.pet.wear`, which was therefore always undefined, so a friend's pet accessories could never draw on the card for any species.

## v516
1. Round 44's Paddock geometry and Kennel naming backlog, plus the operational debt. Its dated sections are further down, folded here.

   Not player-visible, so it carries no changelog item: `hotfix/register-429-wallet` is dead weight and can be deleted. Its `registerKey` is byte-identical to main's through the whole retry body, and main additionally guards `apiBase()` being absent, which the branch version does not. QA round 43 confirmed the shipped behaviour live on v493 at 28 of 28 samples. Recorded with the evidence in docs/TESTFLIGHT-STATE.md rather than acted on, because branch deletion is Tom's call.

2. PROOF: paddock-pack-audit.mjs, paddock-pack-browser-audit.mjs | REACH: the Paddock with a large collection. At 200 pets the packer failed the contract stated in `js/paddock.js`'s own header: 76 pairs overlapped by more than 20px in both axes, worst 121x72, among the 50 actually drawn. A breeding-armed pet and the equipped pet were both completely unmarked in the field, which are two states the player chose. The Stable copy row also lost 2,160px of scroll position on every tap, and a breeding pick was silently dropped on leaving the sheet while the sibling team pick persisted, which is the tell that one of the two was re-rendering rather than refreshing.

3. PROOF: kennel-copy-browser-audit.mjs | REACH: hatch a pet, then look for its colour anywhere. The reveal said "A Frost Bumbleseal!" and from that second the word Frost appeared on no screen in the game except one Kennel panel, while the Stable card for that exact animal printed rarity, level and four stats and no colour, with its own img pointing at the Frost art. The card already had a chip vocabulary for rarity, level and shiny, so the colourway was the only pet property with art and no chip. It is now named on the card, in the breed picker and in the destroy confirm, which are the three points where the choice is irreversible. The typed-confirm gate also keyed on species and never on colourway or level, so a Level 10 one-of-a-kind with 105,000 banked steps was destroyed by two taps inside 2,800 ms with no toast on arming.

4. PROOF: paddock-pack-audit.mjs | REACH: the Stable copy row. It lost 2,160px of scroll position on every tap, and a breeding pick was silently dropped on leaving the sheet while the sibling team pick persisted. Two sibling controls behaving differently is what identified it: one path was re-rendering where the other refreshed.

5. PROOF: kennel-copy-audit.mjs | REACH: melt a pet. The heavier typed-confirm gate keyed on species and never on colourway or level, so a Level 10 one-of-a-kind with 105,000 banked steps went to two taps inside a 2,800 ms window, with no toast on arming, a button reading "Melt for 60?" and a result toast naming only the species.

## v515
1. The restore path hardened ahead of round 50, plus round 48's remainder and the pet-screen accessibility work. Its dated sections are further down, folded here.

2. PROOF: restore-debt-audit.mjs, restore-state-audit.mjs | REACH: restore a backup, or open an older build after updating. Four ways a restore lost something the player had earned, each proven red on the shipped tree and green on the fix, with the app files reverted to origin/main to prove it: a stale petInst merge lost an earned duplicate (copies 2 to 1); a stale per-instance level bank erased banked steps (1000 to 10); a stale potion balance refunded a potion already drunk (spent count 0 to 1, the same merge bug pointed the other way); and an older cooking reader DELETED a future build's earned buff on open (rows 1 to 0), which is a forward-compatibility hole that fires on ordinary update behaviour rather than anything exotic. All four break this project's house rule that nothing earned is ever lost. The fixes reuse the shapes already in this codebase rather than inventing new ones: revision ranking, union merges so a consumed thing cannot revive, and single-transaction take-and-pay. `docs/P3-KV-CENSUS.md` records all 165 keys a restore can write with a payload-wins verdict for each, which had never been enumerated.

3. PROOF: pet-a11y-audit.mjs, pet-a11y-pixels-audit.mjs | REACH: the Kennel grid with an incomplete collection. Every colour was hidden from anyone who had not already won it: column headers carried no swatch, unowned cells were greyed to near-black, and an unowned roster dot measured 1.19:1 against its own row, which is invisible, so nobody ever learned there are five slots per species. Pressing an unowned cell also replaced the row label with "Not hatched yet." and every locked cell carried that identical aria-label, so a zero-pet grid was 30 indistinguishable cells to a screen reader.

## v514
1. The round-46 diary remainder, the first-run disclosure that had been finished and unmerged, the store-build update copy, and the machine-character disclosure. Its dated sections are further down, folded here.

   Not player-visible, so it carries no changelog item: a store build no longer fetches `version.json` and no longer tells the player "No connection. Try again when you have signal" when an update is unavailable. An App Store build updates through the App Store, so that message was both wrong and the kind of thing a reviewer reads as a broken app. Gated on the existing STORE_BUILD flag; the web build's behaviour is byte-identical, because it genuinely does update over the web. PROOF: store-runtime-audit.mjs.

   Also not player-visible: timing rows now disclose the machine they ran on. PROOF: flick-disclosure guard in crate-reveal-audit.mjs. R45-5 reported the first crate flick running at half rate in 4 of 5 runs, 12 to 20 frames. Re-measured here on v513 across five fresh browser processes: first flick 49, 46, 59, 58, 47 rAF samples against second flick 43, 57, 59, 58, 43, with ZERO of five runs at or below the 20-frame ceiling and the first flick sampling MORE frames than the second in 3 of 5. 81/81 rows passed. Both reports are honest and the machines differ, which is the third instance of this class after boneyard-audit gave rounds 43, 45 and 48 three different correct verdicts. No first-flick fix was built, because a fix without a reproduction is a guess; v500's mechanism stays (burst draw calls 0 on v509 against 18 and 26 on v493) and the audit now records that the fix belongs on whichever machine reproduces it.

2. PROOF: first-run-honesty-audit.mjs | REACH: the first screen of onboarding. An anonymous account is created at first run and the only disclosure was inside the optional survey, so a player who skipped it was never told. Gwart now says it in his own voice while keeping his introduction, and points at the permanent Privacy policy row v505 shipped. Three earlier attempts were rejected and their corrections hold: the splash is gated on RETURNING only so a new player keeps the intro, the toast backlog cap survives, and Gwart's introduction is intact.

3. PROOF: r46-diary-audit.mjs | REACH: Trends against the streak pill. The two surfaces disagreed about what counts as a logged day, so the same question returned two answers depending where it was asked.

4. PROOF: r46-diary-audit.mjs | REACH: the copy-yesterday chip, and a day more than a week old. The chip promised one number and delivered another, and old empty days spoke as though they were today.

5. PROOF: r46-diary-audit.mjs | REACH: the day arrow at the start of an account's history. It walked off the end of the account's own history.

## v513
1. Round 48's harness and reporting work plus the remainder of round 47. Its dated sections are further down, folded here.

2. PROOF: r47-rest-audit.mjs | REACH: open a Spire defended by another player. `GET /spires` returned the defender's profile with nine more fields than `/leaderboard` does, including `weekSteps`, the `yard` pet roster, the full `gear` list and `plat`. That falsified the app's own stated invariant: `socialSnapshot` carries a comment saying `yard` "reaches accepted friends and nobody else", and a rival is not an accepted friend. Scoped honestly by the round that found it: `privacy.html` does not promise friends-only, so this was a source-level invariant violation rather than a broken user-facing promise, and it is closed either way. The response now carries only what a rival needs, guarded so the field list cannot quietly grow back, which is how it got here.

3. PROOF: r47-rest-audit.mjs | REACH: lose a tower, then open the siege sheet. The lost-tower card contradicted itself in two lines and the siege sheet's clock did not tick.

## v512
1. Round 48's shipped defects plus round 46's logging lane, and the guard and submission work behind them. Its dated sections are further down, folded here. The pet balance re-tune was HELD OUT of this train: it conflicts with a shipped contract (Eternal Guard heals to 40%, the re-tune needs 20%) and that is Tom's ruling to make.

2. PROOF: r48-state-audit.mjs, unit.test.js | REACH: restore a backup carrying an equipped gear id this build cannot resolve. A guard tested whether the equipped art id was MISSING; the case that occurs is an id that is present but unresolvable, which is truthy, so it walked through, reached `bhAsset(undefined)`, and `data/boneheadz.js` dereferenced `item.file`. Measured: a missing id renders 14,074 characters, an unresolvable one renders 0, and there is NO page error, so nothing in the console marks it. This is the seventh instance of one class in this project, and the round-48 ticket named the wrong guard: `js/app.js:16583` protects `previewEq()`, which never calls `bhAsset`, so repairing it would have been a no-op. A plan review caught that and the real four-hop path was verified before any code was written.

3. PROOF: r46-logging-audit.mjs | REACH: the Add sheet and the Foods screen. Search could not see the player's own history (0 of 3: "Dinner out", present as 2 rows in their own log, returned 2 unrelated built-in foods), truncated silently while announcing a false total to a screen reader ("25 matches" for 93), and could not match an unaccented query against an accented food (3 of 3: creme, brulee, Cafe all returned 0). 


5. PROOF: r46-logging-audit.mjs | REACH: tap Add twice quickly. Driven 5 times: 0 of 5 duplicated the intended entry, so the obvious defect was absent, but 1 of 5 logged an unintended item at 105 kcal and left the app on about:blank. Putting food in a diary the player did not choose, on a page they cannot read, is worse than a duplicate, so the fix is at the selection rather than a debounce over it.

4. PROOF: unit.test.js | REACH: after any fight. `window.__refreshLevelChip` shipped in the production bundle, which round 48 filed as a test seam to gate behind the webdriver check. Gating it would have been a bug: production fight settlement calls it after both a win and a loss through optional chaining, so the calls would have silently done nothing and left the level and XP stale. A plan review caught this too. It is now a real production function called directly from both sites, with only the window alias gated.

## v511
1. Round 47's economy and siege lane. The server half needs a Worker deploy, which Tom runs; the client half is live on merge. Its dated section is further down, folded here.

2. PROOF: r47-economy-audit.mjs | REACH: lose a Spire to another player. Nothing in `js/spires.js` deleted a local spire record, so after B took A's tower A kept a phantom Keeper's Boon worth up to +15% on every quest payout for up to 7 days AND could collect real tribute from a tower B owned: measured through the real map button while offline, 90 coins and 12 Bone Dust, pennant still reading `mine`, button still offering to defend it. Tom ruled the fix shape on 2026-09-07: an offline fight's claim on a shared tower stays PENDING until the server confirms, granting no ownership, tribute or Boon. That was the ruling rather than a plain delete because the fight handler treats an `offline` response as permission to call `claimSpire`, so deleting the record alone would have let a loser fight offline and recreate a paying tower while the rival still owned it server-side. Proven red on the shipped tree at the measured 90 coins, at the offline re-fight minting a tower, and at a stale file restore resurrecting the income.

3. PROOF: r47-economy-audit.mjs | REACH: receive any server-delivered reward. `applyPayload` committed `awardOnce` before separately adding coins, dust and inventory, so terminating in between left the receipt written and the reward unpaid, and the next pull found the receipt and skipped it permanently. Routed through `claimAndPay` via `awardOnce`'s pay argument, the same shape this project already uses for crates, eggs and salvage. Guarded for an interrupted application and a concurrent delivery.

4. PROOF: r47-economy-audit.mjs | REACH: hold a Spire through a takeover. Losing the tower was silent in session: 0 toasts and 0 pushes across 30 samples in the 150s after zero, and for the first 30 seconds, 7 of 7 samples, the tower read as normally held with a Tend button, a state already untrue on the server.

5. PROOF: r47-economy-audit.mjs | REACH: a siege deadline with a skewed device clock. Countdowns were device time against a server deadline, so inside the Worker's plus or minus 5 minute tolerance a connected player saw "48h 4m" for a 48 hour window, and beyond it the poll 401s, `fetchMySpires` returns null and the player was never told a siege existed at all, with no skew notice on that path although `leaderboard()` has one.

## v510
1. The pet train: seven lanes off v509, closing round 45's two open debts and round 44's state and render defects. Its dated sections are further down, folded here.

   Not player-visible, so it carries no changelog item: PROOF: store-copy-lint.mjs, submission-preflight-audit.mjs | REACH: any store build. The shared reachability scanner stripped comments with a plain search for `//`, with no notion of a string literal, so a reachable `window.open('https://testflight.apple.com/join/...')` was truncated to `window.open('https:` before the forbidden-string check ran and reported nothing. The guard that exists to keep a TestFlight link away from an App Store reviewer could not see a TestFlight URL. Now tokenized; negative controls cover the URL in single quotes, double quotes and a template literal, a real comment that must still be stripped, and comment-like text inside a string that must not be. Also registered in the gate: it passed the file filter with a tier count of 0, so the coverage check exited 1 before a browser started and the full gate could not run at all.

2. PROOF: pet-state-audit.mjs, unit.test.js | REACH: the Stable, on a save carrying one instance whose species this build does not know. `js/app.js` filtered instance rows on `x && x.sp` (truthy) rather than on the species existing, so a row with `sp: 'ZZ9'` walked through and threw in `bhAsset`: measured 0 children, 0 bytes, no `#kennelBtn`, no `#stableToPaddock`, 0 EQUIP buttons, against 5 children and 16,196 bytes on a normal save. That button is the only door, so the crash took the Kennel, Paddock, EQUIP, breeding and salvage with it, silently. The guard that failed was written FOR this crash (R39-31) and its comment describes it correctly; it filtered on the field being falsy while the case that occurs is truthy and unknown. Fixed at the state boundary with `isKnownPet`, not at the one render site, because unknown rows were also accepted by `addPetInstance`, returned by `petInstances`, selectable by `equippedPetIid` and included by `paddockRoster`. `bhAsset` degrades to a placeholder instead of throwing. Unknown persisted rows are preserved, not deleted.

3. PROOF: pet-state-audit.mjs, pet-talent-ui-audit.mjs | REACH: own two copies of one species, level one to 10 and pick its tree, then fight with the other. `pettalents` was keyed by SPECIES while `petLevelBank` is keyed by instance, and `buildBattlePet` accepted every stored id without checking level or legal tree, so a level 1 duplicate fought with its level 10 sibling's full tree. The app's own help text ("each one keeps its own") described the intended model and the storage disagreed with it. Migrated to instance keys, with every read, write and battle construction routed through `legalPicks`.

4. PROOF: pet-C-node-guard.mjs, pet-C-browser-audit.mjs | REACH: equip the other copy of a species from the Stable. `refreshPetMorphs` had five call sites and the EQUIP handler was not one of them, so the Stable card changed and Today's hero kept the copy you put away through three repaints a player can perform, until a full reload. Seven call sites now.

5. PROOF: pet-C-node-guard.mjs | REACH: the Paddock, on a pet above 20,000 banked steps. It computed `1 + Math.floor(levelSteps / 20000)` instead of calling `petLevel`, so it printed level 5 for a pet the Stable and Pit both called level 10.

6. PROOF: pet-C-browser-audit.mjs | REACH: the Kennel on a 3x phone. The tier picker read the CSS box only and never saw device pixel ratio, so cells measured 1.405 on a 16 Pro, 1.527 on a 15 Pro Max with 10 of 31 over the 1.4 ceiling, and 1.570 on a 16 Pro Max.

7. PROOF: dayone-topup-audit.mjs | REACH: a first day. The welcome kit pays a one-time 40-coin top-up inside its own claim transaction, so a `/register` that answers 429 cannot strand it. Measured over 12 seeds: a complete first day moves from a median 264 to 304 coins against the 300 rack floor, and the audit prints the shortfall at the unluckiest seeds rather than hiding it.

8. PROOF: dish-worth-audit.mjs | REACH: the Pit's dish line and the Kitchen's recipe list. `DISH_WORTH` states what a cooked dish is worth, re-measured each run rather than pinned as a string. Two pet dishes previously carried no claim because the sim could not fire a pet action; now that it can, they measure a real edge and their NOCLAIM rows failed upward exactly as designed, which is how this was found.

## v509
1. A hotfix off v508: three first-hour defects from the R41/R39 packs. Its dated section is further down, folded here.

2. PROOF: toast-sheet-audit.mjs, toast-map-audit.mjs | REACH: any sheet with controls at its foot, with a toast firing. Measured unfixed in a real fight: at 375x667 the toast box 26.3,466 322.5x105 covered SIX move buttons, Jab and Bone Spike entirely; at 393x852 it clipped Haymaker and Bone Guard. The collision is structural rather than the Pit's, because every sheet puts its controls at the bottom and `.toast` sits 96px off the bottom, so the fix is one CSS rule keyed on a sheet existing (`body:has(#sheets .sheet) .toast`), the same shape as the shipped map rule and out-specifying it. Deferring the toast until the sheet closed was rejected on inspection of the call sites: most toasts in this app ARE a sheet's own feedback, so holding them detaches the answer from the action. After: toast at y=110 at both widths, zero intersection with 10 controls including Flee, and toast-map-audit's SEAT still 96px. The 393x852 row is declared in the audit header as a fence rather than a reproduction, because with an eight-move tray the toast lands in the tray's empty tail and the row is green on the unfixed tree.

3. PROOF: new-cosmetic-mark-audit.mjs | REACH: win a cosmetic, then open the Wardrobe. A piece arrived with nothing marking it, so a crate reward disappeared into a full collection. Every grant path already routes through two row builders, so `nw: 1` on the row covers crates, drops, hatches, shop and quest payouts in two lines, rendered as a dot in the app's existing badge language on the slot rail and the tile and cleared when the grid renders. The flag lives on the row rather than in a table of per-slot seen-timestamps deliberately: a timestamp needs a backfill answer for every existing account and the honest one is a wall of dots on a shipped collection, so an absent flag reads as seen. Measured after: dots on 14 slots and 1 of 3 tiles, both zero on the next render and after a reload. Cost is one extra inv read on the Wardrobe render and zero on Today's tick, with today-reads-lint green.

4. PROOF: streak-card-audit.mjs | REACH: reach a streak milestone. Measured at 393x852: day 7 drew three content blocks and day 14 drew two, because BADGES has streak-3, streak-7 and streak-30 and nothing at 14, so with the number stripped day 14 said strictly less than day 7. No streak-14 badge was added: that pays XP and lands in the badge grid, which is an economy change and Tom's call. Instead every milestone gains a line of its own, a row of counts read straight off what the player owns with a chip dropped at zero, and the golden Bone Crate that streakAwards has always granted and no card ever mentioned. After: day 7 five blocks, day 14 four, and day 14 carries a line day 7 does not. The audit's CONTROL row goes red if a streak-14 badge is ever added, which is a signal to re-read the file rather than delete the row.

## v508
1. A hotfix off v507: the App Store reviewer's small-screen pass from round 43, including a regression this project shipped in v489. Its dated section is further down, folded here.

2. PROOF: onb-audit.mjs | REACH: onboarding, the screen titled THIS ONE'S YOURS, at 320x568. PR #395 fixed the primary button falling below the fold by making `.onb-foot` sticky with a full-bleed background. The cure overshot: the opaque footer measured 159.8px of a 568px viewport and the nameplate's visible fraction measured 0.000, so the screen that names your Bonehead showed no name, and a real click at the reroll button's coordinates hit `span` (the footer's own copy) and left the name unchanged. At 375x667 the nameplate measured 0.467 visible. The step is now a viewport-height column of two bands: content in its own scrollport, footer static beside it. It cannot regress in either direction by construction, which is the point: the button is a flex item of a box exactly one viewport tall, so it is on screen at first paint whether or not the content fits, and the content is clipped by a scrollport that ends where the footer begins, so nothing can sit under it. Padding on the scroller was rejected because reserved space at the end of a document does nothing at scrollTop 0, which is where the defect lived. Nameplate now 1.000 at all three viewports and the reroll click rerolls at all three. R39-15's own rows were asserted green on both trees in the same pass, so neither fix can be bought with the other.

3. PROOF: onb-audit.mjs | REACH: onboarding, THE PLAN. The chips you had just selected sat behind the footer at every viewport, including 393x852 where the entire Goal row was behind the save button, measured as 1 of 4 rows covered with a clip fraction of 1.000 and the centre hitting `#onbSave`. Now 0 of 4 at all three. CHIPS-REACHABLE was green on both trees, so a chip past the form's own fold was never the defect.

4. PROOF: fight-tray-audit.mjs, fight-press-audit.mjs | REACH: a fight at 320x568. The fourth move, Bone Guard, exposed 19.8px against a 40px tap floor, its centre hit `div#fightBody`, and a real press left the log reading "Round one. Your turn." Now 44.5px exposed and the press takes the turn, at all three viewports.

## v507
1. A hotfix off v506: the boot a lapsed player gets, which round 43 found was the one boot nobody had ever graded. Its dated section is further down, folded here.

2. PROOF: returning-boot-audit.mjs | REACH: come back after a gap. The day-close line telling a returning player they were paid for the day they walked away measured 0.0% of its own box painted with its own surface, mean rgb(10,12,10), on 3 of 3 boots: the daily wheel's veil covered it. The cause was NOT the z-index the ticket named. `#toast` lived inside `#app`, which is `position: relative; z-index: 1`, a stacking context, so no number inside it could ever beat a veil appended to `document.body`; raising it to 320 alone still measured 0.0%, and moving it alone was also red. Both halves were proven red separately. It now measures 83.8% against a 25% floor. Graded on PIXELS rather than a hit test on purpose: `.toast` is `pointer-events: none` by design, so an elementFromPoint row could never pass and would have looked like a working guard.

3. PROOF: returning-boot-audit.mjs | REACH: Today, on a returning save. The welcome-back card measured 1411px against a 785.8px fold, so the app's only greeting to somebody coming back was unread at every gap length, 3 of 3. Moved above the hero, because the layout was measured rather than nudged: hero 0 to 641, doors 653 to 718, news pill 740 to 781, quests 791 to 845, and NOTHING that renders under the hero is above the fold at 393x852. It stays outside `section.dayblk`, so the 2026-09-05 trade that moved it out still holds: `.dayblk` at 320x568 measures 398.1px against a 501.8px screen, unchanged. The copy no longer claims everything survived while the streak reads zero; the day-close clause only renders when the ledger really paid, read off rows the render already holds.

4. PROOF: unit.test.js | REACH: a returning player's daily board. 164 of 365 dates drew three dailies with nothing a meal could finish, which is the day-one under-filled board arriving at the other end of the lifecycle; now 0 of 365, by reusing the day-one anchor rule rather than adding a second one.

5. PROOF: unit.test.js | REACH: Today's Gwart plaque, on a save with a long gap. His empty-ledger scold, "Half the day gone and not a crumb on the page", was in the bag for a returning player at 6 of 36 renders and guaranteed within 8, so somebody coming back after three months could be greeted with a scold. It is now withheld on a return, the same way v491 withheld it on the install day, and the row also asserts the remaining pool is still a pool rather than one line, because an emptied pool would pass the first assertion and break the plaque.

## v506
1. A hotfix off v505 from Tom's own photograph of the live app on his phone: a dark strip with a card edge in it near the top of Today. Its dated section is further down, folded here.

2. PROOF: top-strip-audit.mjs, today-peek-audit.mjs | REACH: Today, while the running build is behind the live one. `#updBanner` sat between `.today-plate` and `.hero-card`, and `.hero-scene`'s upward bleed is a negative top margin that collapses out through `.hero-card` and lands the art at y=0 only while nothing above it has height. With the banner mounted the negative margin ate the banner instead of the scroller's padding: hero top measured 91.9 instead of 0 (73 padding + 79.9 banner + 12 margin - 73 bleed) at --sat 59, leaving 18.9px of the plate's dark backdrop with the banner's amber top edge on it, between the safe-area strip and the hero. The banner moved below `.hero-actions` to become the first card of the feed, which also puts it where the scroll peek carries a player to it. The hero at rest is unchanged, because the div is empty and zero-height at every other time. Proven red at both insets on a stale client, with both fresh configurations green as the control.

## v505
1. A hotfix off v504: the two App Store submission blockers from the R43 audit pack, both of them copy and reachability rather than behaviour. Its dated section is further down, folded here.

2. PROOF: screen-sweep.mjs, unit.test.js | REACH: Settings, ABOUT, "Privacy policy", Read. App Store guideline 5.1.1(i) requires the policy to be reachable in the app; before this it was linked from exactly two places, both inside the survey sheet, and that row is gated on !surveyDone, so a DOM sweep of all six routes on a save with the survey already filled returned zero anchors matching privacy|terms|legal|eula. The row is now permanent and ungated, needs no account, and resolves offline and inside the store build because privacy.html was added to sw.js's PRECACHE and to native/build-www.sh's copy list (it had never been in the native bundle at all, so a relative href would have 404'd in the exact build App Review opens, and shell() answers a navigation miss with index.html, which would have handed a reviewer the app instead of the policy). The browser row fetches the href rather than trusting the anchor, for that reason. Proven red at 0 matches across 7 routes.

3. PROOF: unit.test.js | REACH: open the Boneyard map. The intro said, at the moment of the location grant, "Your location is used on this phone only, never stored, never uploaded", while the map's own boot sends a 0.02-degree grid cell of about 2.2 km to the server for Spires (js/spires.js SPIRE_CELL_DEG). The copy now says spawns and dens are worked out on the phone and exact coordinates never leave it, and that the map cell goes to the server for the shared towers, which matches the iOS purpose string corrected in v498 and privacy.html's "Location and the map" section. Nothing on the wire changed. The guard is a conjunction, so if Spires ever stop sending a cell it goes red and asks for the copy to be revisited rather than letting "never uploaded" become true by accident. Proven red with the line restored.

## v504
1. A hotfix off v503: the 32 football colourways repainted to the palettes players recognise, approved by Tom on the rendered before and after sheet, 2026-09-07. Its dated section is further down, folded here.

2. PROOF: football-kit-audit.mjs, football-render-audit.mjs, football-rail-audit.mjs | REACH: each team's two colours are now the published brand pair of the franchise it stands in for, measured as a CIE76 distance from that pair: the worst five before were 158.6, 148.2, 142.2, 136.5 and 127.4, and every team reads 0.0 after. Team names, ids and the tint pipeline are untouched. The PAIR row keeps every team's two colours a readable distance apart on a 24 px disc (minimum 17.59) and no two teams share a pair; the LEGIBLE row keeps each team's own two colours apart (minimum 44.46), which replaced a contrast rule the real league would fail (six navy shells, four black, and one aqua-on-orange pair at 1.16 to 1). Both were proven red on a tree with a duplicated and a near-identical pair.

## v503
1. A hotfix off v502 from Tom's play of the Kennel: blurry pets, the entry nobody finds, the grid nobody can read, and a copy rail worth no scroll. Its dated section is further down, folded here.

2. PROOF: kennel-audit.mjs, art-resolution-audit.mjs | REACH: every Kennel cell and roster thumb draws at or under its source. The sheet asked for a fixed 192 tier while the crop scales each species' ink to fill its cell, so a pet drew at up to 1.82 times its source at 393 wide (C1 349.5 device px off 192) while the same cell measured 1.396 at 320, under the ceiling: the ART row grades both viewports for exactly that reason. Handing the pick to the tier picker every other surface uses takes the worst to 0.910, at a measured cost of 55.2 to 67.9 MB decoded on a full-collection save against a 90 MB ceiling.

3. PROOF: kennel-audit.mjs | REACH: the Kennel's door sits in the Stable's body under the Paddock's, built from the same door parts, showing your five colourway swatches and how many of the thirty you hold, and one line above the grid says a filled cell is a colour you have hatched and a locked one is not (DOOR row red with the entry back in the header at 73.3 by 44 in the dismiss corner and no swatches; LEAD row red with the line deleted). Roster dots carry each colourway's own hue instead of one accent, and an unowned cell flattens to a silhouette so the grid reads as a set with holes.

4. PROOF: pet-ownership-audit.mjs, kennel-audit.mjs | REACH: each copy chip under a Stable card carries a 26 px portrait of that instance, so a base copy and a midnight copy of one species look different in the rail, inside the same 44 px tap target (KIN row red when the portrait is keyed off the species: copy-2 drew copy-1's art; the chips-are-text state exits without grading rather than passing).

## v502
1. A hotfix off v501: the Locker Room polish and the Boneyard's frame cost (master handoff R40-21..27 and R41-18). Its dated section is further down, folded here.

2. PROOF: boneyard-raf-audit.mjs, boneyard-audit.mjs | REACH: a stationary player whose fix jitters no longer drives the map: 1,843.7 requestAnimationFrame calls a second (21.65 a frame) becomes 1.8 a second, because a no-op reposition is skipped and the camera only eases when the fix moved at least 4 m. Walking still costs the library's own per-marker pass over 49 DOM markers (2,071 to about 1,114 to 1,750 a second); the audit sets no ceiling there and says why.

3. PROOF: locker-polish-audit.mjs, football-kit-audit.mjs, precache-audit.mjs, sw-upgrade-audit.mjs | REACH: the colourway strip shows six 10 px discs and a plus-26 chip instead of 5.84 px dots at 393 and 3.56 at 320 (DISCS row red with those numbers); the buy pill reads the live balance so what you can afford updates the moment you spend (PILL row red: cant false, tap said null); the news hero serves the 384 tier, 157 KB on the wire against a 359 KB master (HERO row red at 350.9 KB); and the football art the shop and poster need is precached, 211 entries and 11,714 KB becoming 227 and 11,998 KB with the conditional carry still green (PRECACHE row red: 16 files asked for, 0 listed).

4. PROOF: locker-polish-audit.mjs | REACH: Today's Add button can no longer cover a News row at any scroll position, because the scroller keeps a 13 px transparent border while its background still paints under it (FAB row red: the row was covered 58 by 7.9 px and elementFromPoint answered the button); and a garment whose master fails to load drops its tint spans and disables its buy instead of selling a smear of colour (NOART rows red: 2 spans still painting, buy enabled).

## v501
1. A hotfix off v500: the Wanderer's stacking on the Boneyard map (Tom's live report) and the gate-hygiene work that makes every registered audit run (Codex). Their dated sections are further down, folded here.

2. PROOF: wanderer-patrol-live-audit.mjs | REACH: the Wanderer paints in front of every other map pin, and the player's own marker still paints in front of him because collecting depends on it. Measured in real pixels at a forced overlap (two synthetic markers dropped on his own point, sampled with him visible and hidden): before, both reads returned the marker's colour and his coat contributed nothing; the STACK-LIVE row is red on that (visible and hidden both rgba(0,0,255,255)) and green after, with the marker group at 1, the Wanderer at 2 and the player at 3 as class rules MapLibre cannot overwrite on a reposition.

## v500
1. A hotfix off v499 from Tom's live report that opening a crate is slow and glitchy between cards.

2. PROOF: crate-reveal-audit.mjs | REACH: the card-to-card move renders without dropping frames. Measured on a real three-card Bone Crate driven through the Backpack's own OPEN button: the full-screen burst shader redrew every frame for the reveal's whole life and held the takeover at a 33.3 ms median frame (16.7 ms with it hidden, measured back to back in one process), so the flick played at half rate on every build from v481 to v499, not as a regression. The burst now holds its last composited frame during the flick and resumes once the next card has risen, and the finished crate subtree is dropped on the first advance: dropped frames per move fall from 8 to 16 down to 1 to 5, frames rendered rise from about 22 to 33 to 60. FLICK rows red on v499 (over20 14 and 13, worst 92 ms), green on the fix (45/45); the R37-5 early-tap rows, the R39 recovery rows, BULK, CLAIM and TAP all stay green. The bound is a dropped-frame count, not a per-frame ceiling, because a 34 ms ceiling is red on v481 itself; worst and worstAt print every run so the one residual first-flick hitch stays visible.

## v499
1. A hotfix off v498 carrying two lanes: the prorated bundle with its pet-kit warning (Tom's rulings, 2026-09-06) and the Boneyard's outmatched line. Their dated sections are further down, folded here.

2. PROOF: football-kit-audit.mjs, football-render-audit.mjs, unit.test.js | REACH: footballBundleQuote keeps the 20 percent saving on the missing pieces (5 missing 16,800; 4 missing 13,400; 1 missing 3,400, rounded to the nearest 100) so buying a piece first no longer costs 21,000 for the set, and the save line always states the real saving (BUNDLE-QUOTE rows red on the superseded formula, which quoted 16,800 for four missing). A purchase that includes lizard gear on a save with no lizard says the pet pieces wait in the Stable until one hatches, and a save that owns one sees no such line (PET-WARN rows red with petsPending forced false, PET-WARN-CONTROL green throughout).

3. PROOF: outmatched-audit.mjs, unit.test.js | REACH: one helper answers whether the player can plausibly win a foe, calibrated on the fight sim (below a 5 percent simulated win rate reads as outmatched; measured 0 percent for a flat level-2 build against the Glutton and against a rival's specced Spire tower, 8 to 52 percent against an eased NPC warden, which is why the line does not fire there). The Glutton and Spire sheets show one plain line when it fires and nothing when it does not, and the Spire sheet always states that fighting for a tower you do not hold spends today's attempt (rows red before: the helper did not exist and the Spire sheet had no such copy).

## v498
1. The integration train (integ/day5) off v497: Kennel phase A, palettes, the approved v2 recolour art and the Kennel UI; crew activity; the Wardrobe paint virtualization; the truthful iOS permission strings (not a player-visible change, documented in docs/PERMISSION-STRINGS.md). Each row below folds the dated sections further down.

2. PROOF: unit.test.js, pet-pool-audit.mjs, pet-morph-audit.mjs, kennel-audit.mjs | REACH: a granted egg rolls a morph fresh-first over species x morph pairs at MORPH_WEIGHT, the hatch reads it, morphs never touch stats; each morph is a per-fill recolour PNG of Cam's master (ink, whites and creams byte-identical, one midnight tier, Tom approved the sheet 2026-09-06) with tiers built; the Kennel sheet inside the Stable lists every species with a 30-cell collection grid and column headers.

3. PROOF: unit.test.js, pet-pool-audit.mjs, friend-paddock-audit.mjs, pet-morph-audit.mjs | REACH: Bumbleseal hatches at the same even share as C1 to C5 with her hatchChance removed; the morph rides the friend wire like shiny and every pet surface (Today hero, Stable card, Paddock scene own and visited, friend profile hero and paddock row, level-up sheet) resolves the variant art, red on the pre-fix scene with 0 of 30 sprites.

4. PROOF: crew-activity-audit.mjs | REACH: a friend's card names what changed since the last look from a cached snapshot (silent on first sight and on nothing changed); GET /friends carries a spire count per side shown on card and profile; the Crew badge counts an improved race rank once.

5. PROOF: unit.test.js, crew-activity-audit.mjs | REACH: raceStanding's gap is to the racer above; raceClockLabel fires "settles tonight" on the last calendar day; settlement writes a reward-less place grant for every non-podium finisher; hasFightableStats demands a real number for every stat before any fight or stat bar renders.

6. PROOF: wardrobe-family-grid-audit.mjs, football-tile-crop-audit.mjs, memory-census.mjs | REACH: hydratePackArt paints only tiles on screen or one screen away via an IntersectionObserver rooted on the real scroller (measured 166 ms to 73 ms main-thread script opening the hat slot at 4x CPU, 185 owned hats; OFF-DOM decoded bitmaps 12.2 MB to 9.3 MB).
7. PROOF: unit.test.js | REACH: the Pit's board says when the day's twelve paid sparring slots are spent and the victory card drops its coin pill instead of printing +0; Gwart's greeting keeps a persisted anti-repeat bag so consecutive days differ; the daily spin fires on a first-day session and is queued after a level-up sheet instead of skipped; Today's level chip repaints on fight settle the way the wallet pill already did (each row red before the fix, quoted in the dated "the day tells the truth" section).

8. PROOF: take-and-pay-audit.mjs | REACH: openCrate, hatchEgg, disenchantGear, both salvage paths and the legacy-egg conversion spend their input and write their payout in one transaction, so killing every IndexedDB transaction after the take leaves the player with the item or the full payout, never neither (six CRASH rows red on the pre-fix order: crate consumed with 0 coins and no rows, egg gone with no pet, gear gone with no dust).

## day one clears the floor, and the Pit says what a dish is worth (2026-09-07)

Not stamped to a release: hotfix/dayone-topup-cooking, off v503. Two rulings
from Tom, master handoff B4/R39-27 and B5.

1. PROOF: dayone-topup-audit.mjs, reward-sop-audit.mjs, kitchen-welcome-audit.mjs
| REACH: every brand-new save gets 40 coins in the welcome kit, once. QA drove
two perfect first days and finished on 298 and 307 coins against a cheapest rack
item of 300, so the best possible first day either just missed the shelf or just
cleared it on a coin flip. Driven here through the shipped payout functions
(the welcome kit, three logged meals, onHealthSync, every crate opened, the
on-budget day close at the day-two boot) over twelve seeds, a perfect first day
goes from a median 264 coins to 304, and a light walker's from 68 to 108. The
unluckiest of the twelve seeds still lands at 294, six short, and the file says
so on every run rather than quietly choosing a bigger number: 40 is Tom's
figure. The price ladder, the crate coin ranges, the quest rewards and the spar
cap are untouched. The grant is one ledger key paid inside its own transaction,
so a second boot, a second tab and a restore pay nothing (ONCE row red without
it: moved=0, rows=0), and it lives in the kit rather than on the Crew path so a
signup that answers 429 cannot strand it (REG429 row red without it: coins=50).
The welcome-kit toast names the coins, read off the real onboarding.

2. PROOF: dish-worth-audit.mjs, pit-kitchen-hint-audit.mjs | REACH: the Pit's
line about your live dish, and the Kitchen's own recipe list, now say what the
dish is worth in plain words. Copy only: serving a dish still pays its 8 XP and
no recipe was re-costed. Measured in tests/fight-sim.mjs against a mirror (a foe
at 100% of your own stats), 2,000 seeds per arm, in two configurations because
they disagree by about 3x: with a level-5 Hound the baseline is already an 84.7%
win so everything saturates near +15pp, and with no pet it is 37.4% and the same
dishes spread +18 to +60pp. As the share of even fights you lose: no dish
15.3%/62.7%, Bone Broth 1.5%/25.0%, Hearty Hash 2.0%/11.9%, Necromancer's Feast
0.2%/2.3%, Marrow Stew 8.5%/44.6%. So the first three say they more than halve
the fights you lose, which is true in BOTH columns, and the Stew says the
smaller thing (29 to 44%). No percentage is printed anywhere: the two columns
disagree on size and one of them pretending to be the answer would be the
over-precise figure the ruling forbids. The two PET dishes carry no claim at
all, because the sim's player never takes a pet action, so their measured 0.0pp
is the harness declining to answer rather than a finding. The audit re-measures
every claim on each gate run instead of pinning the string; proved red three
ways (a weak dish given the strong sentence, an unmeasurable dish given any
sentence, a claim deleted): 3, 6 and 1 rows, exit 1 each.
## an audit cannot grade the wrong worktree (2026-09-07)
PROOF: serve-tree-identity-audit.mjs

## the app says where it stands (2026-09-07)

Not stamped to a release: hotfix/privacy-and-location-copy, off v504. Two
submission blockers from the R43 audit pack, both of them copy and reachability
rather than behaviour. Nothing about what the app sends changed.

1. PROOF: screen-sweep.mjs, unit.test.js | REACH: Settings, ABOUT, "Privacy policy", Read. The row is never gated, needs no account, and works offline and inside the store build because privacy.html is now in sw.js's PRECACHE and in native/build-www.sh's copy list. Before this, privacy.html was linked from exactly two places, both inside the survey sheet, whose Settings row is gated on `!surveyDone`, so the only route to the policy vanished the moment a player filled the survey: App Store guideline 5.1.1(i), and a rejection. PRIVACY-LINK walks all seven routes with `surveyDone` forced TRUE and fetches the href rather than trusting the anchor, because sw.js answers a navigation miss with index.html and a 404 would otherwise read as a pass. Proven red on origin/main: 0 matches across 7 routes, and the static half fails with "Settings must carry a privacy policy row".

2. PROOF: unit.test.js | REACH: open the Boneyard map. The intro used to say, at the moment of the location grant, "Your location is used on this phone only, never stored, never uploaded", while the map's own boot sends a 0.02-degree grid cell (about 2.2 km, `GET /spires?ids=sp-2464--6156` from 49.2827, -123.1207) to the server for Spires. It now says spawns and dens are worked out on the phone and exact coordinates never leave it, and that the map cell you are in, about 2.2 km across, goes to the server for the shared towers. That matches the iOS purpose string corrected in v498 and privacy.html's "Location and the map" section; nothing on the wire changed. The guard is a conjunction, so if Spires ever stop sending a cell it goes red and asks for the copy to be revisited rather than letting "never uploaded" become true by accident. Proven red with the line restored: `js/app.js:21449: "used on this phone only"`.
## the top of the screen is one colour (2026-09-07)

Not stamped to a release: fix/top-sliver, off v504. Tom, from a screenshot of
the live app on his own iPhone: "ive noticed this top sliver recently a couple
times sometimes it goes away i think after an update but looks glitchy". A black
band across the full width a few tens of points down from the top, with the top
two rounded corners and the warm amber top edge of a card clipped inside it, and
CORRECT hero green both above and below it.

DIAGNOSED OFF A RENDER RATHER THAN OFF THE CSS, and reproduced on demand. The
band is `.today-plate::before` (the page backdrop, rgb(13,12,18)) and the clipped
card is `.upd-banner`, the "Update available" banner. `#updBanner` was the second
child of the Today screen, between `.today-plate` and `.hero-card`, and it is
EMPTY unless version.json says the live build is ahead of the running one: that
is the whole of the intermittency, and it is exactly why an update clears it.
The hero's bleed under the island is a negative `margin-top: calc(-1 * (--sat +
14px))` on `.hero-scene` which collapses out through `.hero-card`, and it only
lands the art at y=0 while nothing above it has height. Measured at 393x852,
--sat 59, with the banner mounted: `#updBanner` 73 -> 152.9 (79.9 tall) and
`.hero-scene` 91.9, i.e. 73 + 79.9 + 12 - 73. The negative margin ate 73px of the
BANNER instead of the scroller's padding, the opaque hero painted over the rest,
and the 18.9px left over is the band. At --sat 0 the same arithmetic leaves
77.9px of it. Not a fade and not a gap: an overlap.

RULED OUT, each against the render rather than in the abstract: a restored
scrollTop (the band is there at scrollTop 0); a transform or containing block
clipping the bleed (with the banner absent the hero's box measures top 0 at both
insets); a crate or news plate mounting above the hero (the screen's child list
is plate, hero-card, hero-actions, and nothing else can precede the hero: the only
other insert in js/app.js is one `grid.insertBefore` in the Boneyard); and the
service worker pairing a stale app.css with a fresh js/app.js (sw.js precaches
both into ONE cache named VERSION, all-or-nothing on install, and serves the
shell cache-first out of that single cache, so the two cannot disagree).

1. PROOF: top-strip-audit.mjs | REACH: on the Bonehead tab the colour behind the status bar and the Dynamic Island runs unbroken into the hero art, including while you are on an old build with the "Update available" banner showing. That banner moved from above the hero to under the four doors, where it is the first card of the feed. Proven red on the pre-fix tree at both insets: hero top 91.9 against a ceiling of 0.5, and 144 of 408 (--sat 0) and 40 of 644 (--sat 59) page-background pixels in the strip above the currency chips.
## coming back is a welcome (2026-09-07)

Not stamped to a release: hotfix/returning-player, off v504. Round 43 played
three five-day players end to end through the shipped UI and brought each one
back after 10, 30 and 90 days. The DATA was perfect at every gap: zero rows lost,
zero duplicated, the pet, the coins, the XP, the crates and every quest claim
intact, and the day close they had earned on the day they walked away paid, crate
and all. Nothing here is a data fix. What was wrong was the screen they came back
to, and every fault was the same fault: the app had something true and kind to
say and no way for the player to read it.

MEASURED BEFORE FIXING, on origin/main, at 393x852 on a 90-day-gap save driven
through a real boot (kv `lastOpenDay` backdated and the page reloaded, so
maybeWelcomeBack decides the return rather than a stamped flag):

- the day-close line was drawn under the daily wheel's veil in 36 of 36 samples.
  0.0% of the toast's own box was painted with its own surface; mean rgb(10, 12,
  10), which is the veil's near-black.
- `#wbCard` sat at 1411px against a 785.8px fold (1220px on round 43's own
  saves, which carry no news pill). Nothing that renders under the hero is above
  the fold on that screen: the hero card alone is 0 to 641, the doors 653 to 718,
  the news pill 740 to 781, the quests 791 to 845.
- 164 of 365 dates drew a returning player a daily board with nothing on it that
  logging a meal could finish.

1. PROOF: returning-boot-audit.mjs | REACH: open the app after two or more days away and the line telling you the last day you logged was closed and paid is readable on top of the daily wheel instead of behind it. Measured on the same boot: 0.0% of the toast's box was its own colour before, 83.8% after, floor 25%. The toast moved out of `#app`, which is `z-index: 1` and therefore a stacking context, so no number inside it could ever beat a veil appended to the body; it is `pointer-events: none` either way, so it still cannot take a tap from the wheel it now paints over. Every full-screen takeover this app raises is covered, not just the wheel.

2. PROOF: returning-boot-audit.mjs, today-peek-audit.mjs, today-container-audit.mjs | REACH: the card that greets you when you come back is the first thing on Today instead of 368px below the fold: measured top 1411 before and 14 after at 393x852, with the screen asserted at the top in the same read. It stays OUTSIDE the day container, so the collapsed day summary still fits a 568px screen (398.1px against 501.8px); putting the card back inside the day, its position before 2026-09-05, reds that row at 539.1px. The card is still one tap to dismiss and still never comes back.

3. PROOF: returning-boot-audit.mjs | REACH: the card no longer says "Everything is where you left it." while your streak reads 0. It says the streak starts over and nothing else does, then names what is still there: your Bonehead, pets, coins, gear and claimed quests, and the last day you logged if the ledger really paid its close. No day count, nothing invented, and the streak is not mentioned anywhere else on Today.

4. PROOF: unit.test.js, quest-pick-audit.mjs, quest-daymore-audit.mjs | REACH: a returning player's three daily quests always include one that logging a meal can finish. This is the rule v491 already applied to a day-one board, which fails for the opposite reason: on day one every capability is off, and on a return every capability is on, so nothing is filtered and the draw can be three quests that all need a walk, a fight or a spawn. 164 of 365 dates drew such a board before and none do after, swept over a year. Quest rewards, coin values, the ladder and every other gate state are untouched.

5. PROOF: unit.test.js | REACH: Gwart does not greet somebody back from a long gap with "Half the day gone and not a crumb on the page." He has a line of his own for it. This is the same exemption v491 gave the install day and the never-logged player, extended to the case it missed.
## small screens keep their controls (2026-09-07)

Not stamped to a release: hotfix/small-screen-fold, off v504. QA round 43,
R43-4, R43-5 and R43-6, the App Store reviewer pass on small screens.

R43-4 and R43-5 are a regression I shipped. PR #395 (v489) fixed "the primary
button sits below the fold on iPhone SE" by making `.onb-foot` sticky at the
bottom of #screen with an opaque full-bleed backing. That is an overlay, and it
cost the bottom band of every onboarding step at every scroll offset.

MEASURED ON origin/main (v504, 6e55bbf), off the render at each viewport, with
only the two audit files changed. Visible means the rect clipped by the viewport
and by every scrollport above it, minus what the footer paints over.

| | 320x568 | 375x667 | 393x852 |
|---|---|---|---|
| .onb-foot height | 159.8px of 568 | 140.3px of 667 | 140.3px of 852 |
| nameplate visible, THIS ONE'S YOURS | **0.000** | **0.467** | 1.000 |
| what its centre hits | span (footer copy) | div.onb-foot | span#onbName |
| real click at the reroll's coordinates | **no change** | **no change** | rerolls |
| selected chips behind the footer, THE PLAN | **1 of 4** | **1 of 4** | **1 of 4** |
| "That's me" bottom vs fold | 443.5 / 568 | 562 / 667 | 747 / 852 |

R43-6 is older. At 320x568 .fight-body is 465.5px and holds arena 283 + meta 52
+ tray + End Turn 58.8 + 10px pad, which leaves the tray 41.7px; its own 96px
floor then overflowed the column, so the four base moves (145px of content in
two 68.3px rows) were clipped at 547.5 with Bone Guard rendered 527.8 to 596.
Its centre hit div#fightBody, only 19.8px of it was inside the tray, and a real
click there left the log on "Round one. Your turn." Both larger viewports were
fine.

AFTER, same method, same three viewports:

| | 320x568 | 375x667 | 393x852 |
|---|---|---|---|
| .onb-foot height | 119.7px | 141.3px | 141.3px |
| nameplate visible | 1.000 | 1.000 | 1.000 |
| real click at the reroll | rerolls | rerolls | rerolls |
| selected chips behind the footer | 0 of 4 | 0 of 4 | 0 of 4 |
| "That's me" bottom vs fold | 517.6 / 568 | 599 / 667 | 784 / 852 |
| "Start tracking" bottom vs fold | 501.4 / 568 | 599 / 667 | 784 / 852 |
| 4th move exposed in the tray | 44.5px | 54.8px | 54.8px |
| 4th move clicked at its own centre | takes the turn | takes the turn | takes the turn |

1. PROOF: onb-audit.mjs | REACH: on a 320px or 375px phone, the screen that
   names your Bonehead shows the name. The onboarding step is a viewport-height
   column of two bands now: the content scrolls in its own box and the footer
   sits beside it, static, so the button is on screen at first paint by
   construction and nothing can be underneath it. Under 600px of height the
   poster gives up 100px so the nameplate clears the fold without scrolling, the
   display type steps 40 to 34 (THE PLAN already ships 30) and the earns row is
   left to peek as the scroll cue. NAMEPLATE-VISIBLE and REROLL-CLICK are red on
   v504 at 320x568 and 375x667 with the numbers above; R39-15's own rows, which
   is what the sticky footer bought, stay green on both trees, and they are
   asserted in the same pass so nothing can fix one by giving up the other.

2. PROOF: onb-audit.mjs | REACH: on THE PLAN, the chips you picked are readable
   where they sit instead of under the Start tracking bar, at every viewport
   including 393x852 where the whole Goal row was behind it. CHIPS-CLEAR is red
   on v504 at all three (clip 1.000, covered 1.000, centre hitting #onbSkip or
   #onbSave); CHIPS-REACHABLE stays green on both trees, because a chip scrolled
   past the form's own fold was never the defect and grading the two the same
   way is how a fixed tree would have excused the real one.

3. PROOF: fight-tray-audit.mjs | REACH: on a 320x568 phone all four moves are
   pressed where they sit, with no scrolling. Two full rows cost 105px the
   screen does not have, so the meta and row margins give 26 and the arena gives
   the rest, 283 to 220 at this breakpoint only: the one place the 2026-08-16
   "pin the primary action, do not shrink the arena" call has to bend, and it is
   flagged rather than buried. That buys a 120.8px tray, three moves exposed
   68.3px each and the fourth 44.5px, over the 40px tap floor, with the tray
   still scrolling for the last 23px and still drawing its fade. HIT and PRESS
   are red on v504 at 320x568 (centre hits div#fightBody, 19.8px exposed, log
   unchanged) and green at both larger viewports on both trees. Type sizes,
   hints, button sizes and the fight's rules are untouched.

## the crate deals its cards smoothly (2026-09-07)

Not stamped to a release: hotfix/crate-reveal-jank, off v498. Tom, on v498:
"opening crates right now is super slow and glitchy between the items after one
in the crate."

MEASURED BEFORE FIXING, on v481 (before the tap guards), v487 (Open all and the
payoff), v495 (the Open all recovery) and v498 (atomic take-and-pay), driving a
real three-card Bone Crate through the Backpack's own OPEN button, two runs
each. There is NO regression to attribute: the tap-to-next-card-interactive gap
is 331 to 340ms on all four (it is fling's own `at(330, advance)`), and the
per-card cost is identical too, 2 layouts, ~32 style recalcs, 1.9ms of script,
ZERO canvas work and no long task. Every suspect in the brief measured dead: the
card art is already warmed by openPackReveal and a crate deals `wear` cards, so
drawTrimmedArt never runs between cards; the payoff toast fires once, after the
whole reveal, not per card; `dataset.landed` is set in the same microtask turn
the deck is rebuilt in.

The cause is present in v481 too: the reveal renders at half rate for its whole
life because #packBurst is a full-screen WebGL fragment shader drawing every
frame. Back to back in one process, two passes agreeing, median frame 33.3ms
with it mounted and 16.7ms with it hidden.

1. PROOF: crate-reveal-audit.mjs | REACH: Open a Bone Crate from your Backpack and flick through its three cards: each card leaves and the next one arrives at full frame rate instead of half. Measured over the 520ms of the move, dropped frames 8-16 before and 1-5 after, frames rendered 18-27 before and 47-59 after. Nothing about what a crate pays, the reveal's copy, the tap guards (R37-5) or the Open all recovery (R39) changes.

## the first hour keeps its promises (2026-09-07)

Not stamped to a release: hotfix/first-hour-polish, off v503. Three items from
the QA master handoff that needed no ruling: R41-20, R39-25 and R41-21.

1. PROOF: toast-sheet-audit.mjs | REACH: A toast can no longer sit on top of a control you are being asked to use. The welcome-kit message fires 1.2s after onboarding and a new player is five taps from their first fight, so it landed on the move tray: measured at 375x667 it covered six move buttons, Jab (110.3x54.8) and Bone Spike whole, and at 393x852 on a nine-move tray it took 104.8x27.8 of Haymaker and 116.3x27.8 of Bone Guard. Fixed for every sheet rather than for the Pit, because every sheet in the app puts its controls at the bottom and the toast's seat is 96px off the bottom: while a sheet is open the toast takes a seat under the sheet head, clear of the Flee button as well. Everywhere else it has not moved (96px, graded).
2. PROOF: new-cosmetic-mark-audit.mjs | REACH: Win a cosmetic and it stays findable. From the moment it is granted, the Wardrobe's paper doll marks the slot it landed in with a dot, and the tile inside that slot carries one too, in the same accent-on-dark language the crate count and the News dot already use. Both clear when you open that slot's grid, and stay clear after a reload. Nothing you already owned is marked: the flag is written by the grant, so an existing collection is quiet.
3. PROOF: streak-card-audit.mjs | REACH: A longer streak is no longer a thinner screen. Measured at 393x852: day 7's card carried three blocks of content and day 14's carried two, because there is a badge at 7 and none at 14, so with the number taken out day 14 said nothing day 7 did not. Every streak milestone now carries a line of its own and a row of counts you can check yourself (pieces found, pets, badges, each one a length of something you own, dropped when it is zero), and the sub-line names the golden Bone Crate the milestone has always paid and never mentioned. No badge was added at 14: that pays XP and is an economy change, not a copy fix.

## the Kennel explains itself (2026-09-07)

Not stamped to a release: hotfix/kennel-ux, off v500. Tom's four items from
playing the Kennel that shipped in v500, verbatim: "Some pets in the kennel
blurry photos", "Kennel button placement not intuitive", "How to use the kennel
not clear at all", "Scrolling through multiple pets in stable just shows their
lvl not a little picture of them or something so not intuitive to want to go
scroll that rail."

1. PROOF: kennel-audit.mjs | REACH: Open the Kennel: the pets are sharp. The art was served at a fixed 192px tier while the crop scales each species' ink to fill its cell, so a 62.6px cell at 393x852 drew a 349.5 device-pixel Drizzle off a 192px file, 1.82x its source; five of the six species were over the house 1.4x ceiling (C1 1.82, C5 1.76, C3 1.51, C4 1.51, C2 1.43) and only Bumbleseal, drawn small in her own canvas, was under. The tier now comes from the geometry, the way every other tiered surface picks one: worst ratio 0.91 at 393x852 and 0.70 at 320x568, both viewports graded because the narrow phone alone measured 1.396 and would have passed. Decoded image bytes on the screen rise from 55.2 MB to 67.9 MB, measured on the same full-collection save, against the project's 90 MB ceiling.
2. PROOF: kennel-audit.mjs | REACH: Open the Stable: the way into the Kennel is a door under the Paddock's, reading THE KENNEL and "Every colour your pets come in", with a strip of the five colourway swatches filled for the ones you own and a count of how many of the 30 you have found. It used to be a 73x44 button in the sheet head's trailing corner, 8px from Done, which is the corner this app puts DISMISS in, wearing a one-word label that named nothing.
3. PROOF: kennel-audit.mjs | REACH: In the Kennel, one line above the grid says how to read it: in colour is one you've hatched, greyed out with a lock is one you haven't, tap any to name it. An unowned cell is flattened to a silhouette on the page ground so it reads as a hole in the set rather than an underexposed pet, and each dot under a pet in the roster now carries that colourway's own colour instead of one flat accent, so which colours you own reads without the caption.
4. PROOF: pet-morph-audit.mjs | REACH: Own two copies of one species in the Stable and look at the row of chips under the card: each chip carries a small picture of that copy in its own colourway beside its level, shiny mark and "out" state, so the rail shows what is on it. The chips keep their 44px tap floor and the row still scrolls.
## the Wanderer walks in front (2026-09-07)

Not stamped to a release: hotfix/wanderer-z, off v500. Tom, live: "Boneyard:
icons on map on top of wanderer should be behind him."

MEASURED BEFORE FIXING, on the real Boneyard: `.map-wanderer-mark { z-index: 0 }`
against `.map-you, .map-spawn, .map-den-mark, .map-mini-mark, .map-spire,
.map-glutton-mark { z-index: 1 }` (js/wanderer.js, dated 2026-08-23), so every
other marker painted over him. A forced, deterministic overlap (two synthetic
markers dropped at his own lat/lng) sampled the real render at that pixel: with
him hidden the pixel read the synthetic colour exactly; with him visible it
read the same synthetic colour, proving nothing of his own art survived the
overlap.

FIXED by reordering the same rule: `.map-wanderer-mark` now carries z-index 2,
the marker group (spawns, dens, POIs, spires, coin piles) carries z-index 1, and
`.map-you` alone carries z-index 3. The player's own marker is the one
exception, kept on top of him: its 75 m collect ring is functional, not
decorative, and burying it was the reason he was pushed to the back in the
first place (js/wanderer.js note, 2026-08-23). No change to his cone, his patrol,
or any marker's size.

PROVEN RED on a throwaway `cp -R` with the old rule restored: PINS-SURVIVE and
STACK-LIVE both failed, exit 1 --
`FAIL  STACK-LIVE his art wins the overlap in real pixels, not just in z-index,
against 2 other marker kinds  | at device pixel (196,344): visible
rgba(0,0,255,255), hidden rgba(0,0,255,255)`. Fixed: 19/19, exit 0.

1. PROOF: wanderer-patrol-live-audit.mjs, marker-anchor-audit.mjs | REACH: on the Boneyard map, the Wanderer's coat now paints over every spawn, den, POI, spire and coin-pile marker he overlaps; your own marker and its collect ring still paint over him. Measured on the real render at the forced overlap point: with him visible the pixel is his own colour (not the marker's), and with him hidden it becomes the marker's colour, so the fix is proven in pixels, not only in the stacking rule.

## kennel round 39 (2026-09-06)

Not stamped to a release: kennel/r39, off integ/day5 (v488). HANDOFFr3920260906.md
R39-6, 8, 9, 10, 11, 13, 14, 21, 23, 30, 32, re-measured on this tree before fixing.

1. PROOF: pet-morph-audit.mjs | REACH: Own two copies of one species in different colours and equip the second: Today's hero, the splash, the try-on rack, the level-up sheet, the Crew hero and the Boneyard marker paint the copy you equipped, the same one the Pit fights with.
2. PROOF: pet-morph-audit.mjs | REACH: Open your own Paddock from the Stable with two copies of one species in different colours: each copy is drawn in its own colour, as it already was in a friend's field.
3. PROOF: kennel-audit.mjs | REACH: Open the Kennel on an iPad or a desktop window, or rotate the phone with it open: every pet sits inside its cell instead of spilling past it.
4. PROOF: kennel-audit.mjs, unit.test.js | REACH: Open the Kennel owning a Founder's Lizard: the Collection counter reads N / 30 for the cells you have filled, never 31 / 30 or one more than you can see.
5. PROOF: kennel-audit.mjs | REACH: In the Kennel, tap a grid cell (or focus it and press Enter or Space): the row names that colourway; tap it again and the species name comes back. The dots under a pet are indicators.
6. PROOF: kennel-audit.mjs | REACH: Open the Kennel on a 320 wide phone owning every colourway of every pet: all six rows fit above the fold, the caption ends in an ellipsis instead of wrapping, and each column header sits over its column.
7. PROOF: pet-morph-audit.mjs | REACH: Open the Backpack with an incubating Ember egg: the shell reads orange, not blue. Frost reads blue, Toxic green, Midnight purple.
8. PROOF: hero-share-audit.mjs | REACH: Equip Bumbleseal from the Stable, visit it again and come back to Today: she still stands at her own size (169px box at 390x844) and the Bonehead still steps aside (-27px), because equipping through the Stable writes both the equipped-instance record and the outfit slot. The audit used to seed with the bare outfit slot, which v490's R39-1 heal reverts on the next Stable paint: red on origin/main since 49fc6878 (green at its parent, measured 2026-09-07), not a train regression. Re-premised onto addPetInstance + setEquippedPet, the writer every player path uses.
## take and pay is one step (2026-09-06)

Not stamped to a release: fix/atomic-take-and-pay, off v492. Lane 2 of the
2026-09-06 economy audit.

1. PROOF: take-and-pay-audit.mjs (six CRASH rows, each proved red on origin/main
   bce3a937 with the same file: crate, egg, gear, salvageInstance, salvagePet,
   legacy egg-crate) | REACH: Opening a crate, hatching an egg, melting a piece of
   gear or destroying a pet can no longer take the thing away and then fail to
   pay you for it. Each of those used to spend the input first and hand over the
   reward a moment later in separate saves, so an app killed between the two left
   you with neither. The spend and the whole payout are one save now: a kill at
   any point leaves either the unopened crate, the unhatched egg, the piece, the
   pet, or the complete reward with the input gone. Nothing pending, nothing to
   resume. Measured by killing every save after the take: on the old order a Bone
   Crate vanished with no coins and no items, a walked egg vanished with no pet, a
   rare piece melted for 0 dust; on the new order the full hand, the pet instance
   with its ownership row and level seed, and the dust with its revision are all
   on disk. The legacy egg-crate sweep on the Crates tab converts a crate to an
   egg in the same one save.
## the bundle prorates, the pet kit says who it fits (2026-09-07)

Not stamped to a release: hotfix/bundle-prorate-petkit, off v497. Two rulings
from Tom, both dated 2026-09-06. Owned by this lane: `footballBundleQuote` in
data/football-teams.js, the Locker Room buy flow in js/app.js and js/loot.js.

1. PROOF: football-kit-audit.mjs | REACH: In the Shop's Kit room, the full-kit
   tile's price is your 20% saving applied to whatever you are still missing,
   not a flat 16,800 the moment you own anything. Missing 5 (nothing owned):
   16,800. Missing 4: 13,400. Missing 3: 10,100. Missing 2: 6,700. Missing 1:
   3,400 (each rounded to the nearest 100 coin; the exact 20%-off numbers are
   16,800 / 13,440 / 10,080 / 6,720 / 3,360). Own everything and the tile reads
   "The whole kit is yours" instead of a price. Before this fix, owning 1 of 5
   garments quoted the full 16,800 for the other 4 -- the flat five-garment
   price for one garment short of the whole kit -- because the superseded
   2026-09-05 fix (charge only for the missing pieces, capped at the flat
   bundle price) ties the flat price the moment 4 of 5 are missing.

2. PROOF: football-kit-audit.mjs, football-render-audit.mjs | REACH: The two
   lizard cosmetic tiles and the full-kit tile all say "For the lizard" on
   their own line, whether or not you have one yet. If you own no lizard (no
   C4 Beardie, no CX Founder's Lizard) when you buy a lizard piece or the
   bundle, the confirm toast adds "The pet pieces wait in the Stable until a
   lizard hatches." Nothing is withheld or refunded: the garment is granted
   in all 32 team colours exactly as normal, it just has nowhere to be worn
   yet. Own a lizard already and the same purchase confirms with no such
   line. Measured on a fresh account: buying a pet tile with no lizard reads
   "Lizard Jersey · 32 colourways is yours. ... The pet pieces wait in the
   Stable until a lizard hatches."; the same account's bundle buy reads "The
   full kit · 32 colourways is yours. ... The pet pieces wait in the Stable
   until a lizard hatches."; a control account already owning a lizard reads
   "Lizard Helmet · 32 colourways is yours. ..." with no such line.
## the Stable rail tells the truth (2026-09-06)

Not stamped to a release: hotfix/stable-rail-truth, off v493. HANDOFFMASTER20260906.md
B9, B10, B11 and R40-28..31, re-measured on this tree before fixing. Owned by this
lane: the Stable's pet wardrobe shelf and team rail, the Locker Room price pill's
CSS, the kin chips and the Dressing Room family tile's tier.

1. PROOF: football-render-audit.mjs | REACH: Open the Stable on a lizard that
   owns a football piece. The teams you own come first on the rail, the ones
   you do not come after, dimmed and marked Locked with no price. Measured with
   three owned teams: they sit at positions 1, 2 and 3 of 32, 192px from the
   first to the last on a 393px screen, where before the owned Glasswater
   helmet sat 3113px along a 3337px rail.

2. PROOF: football-render-audit.mjs | REACH: The rail opens parked on the team
   you last picked here, else the team she has on, else the first team you own
   a piece for, and it remembers the pick across closing the Stable, a reload
   and a fresh open. A team you own nothing in is never the parked one, so a
   Locked tile never reads Picked.

3. PROOF: football-render-audit.mjs | REACH: Tap a team you own and every
   worn piece that exists in that team swaps to it, in one tap. When both
   pieces exist you hear nothing. When one does not, the piece that does
   swaps, the other stays as it was, and the toast names it: "Her Lizard
   Jersey does not come in Glasswater Gannets colours in your wardrobe."
   Before, the same tap on a helmet you owned did nothing and said "That
   colourway is not in your wardrobe." Tap a Locked team with nothing on and
   the toast is "Nothing of hers comes in Hollow Howlers colours yet." and
   the rail stays where it was.

4. PROOF: football-render-audit.mjs | REACH: In the Shop, the Locker Room
   poster's price pill ("4,200 a piece, 16,800 the lot") wraps onto two lines
   inside its card. Measured against the text column it is laid out in, on
   v493 before fixing: the 203.1px nowrap pill ran 23.0px past it at 393,
   40.1px at 375 and 95.1px at 320 (the brief's 7.0 / 24.1 / 79.1 are the same
   overrun taken 16px further out, at the card's padding edge; the card clips,
   so at 320 it read "4,200 A PIECE, 16" and stopped). After: 0px past the
   column and 16px inside the card border at all three widths, both prices
   readable.

5. PROOF: pet-ownership-audit.mjs | REACH: In the Stable, the chips under a
   pet with more than one copy are 44px tall (were 40). Arm one copy for
   breeding, step to another copy through its chip, and the armed copy's chip
   still says "breeding"; the BREED button speaks for the copy in front.

6. PROOF: unit.test.js | REACH: In the Dressing Room, a family tile that shows
   a lower-rarity colourway (the one you wear) carries that colourway's tier
   badge and border, at that colourway's price, instead of the family's best
   member's tier.
## locker room polish and a quiet Boneyard (2026-09-07)

Not stamped to a release: hotfix/lockerroom-polish, off v498.
HANDOFFMASTER20260906.md R40-21..27 and R41-18, each re-measured on this tree
before it was touched and again after.

1. PROOF: locker-polish-audit.mjs | REACH: The "every team's colours" proof on
   the Locker Room poster and on every kit tile is readable now. It was 32 discs
   sharing whatever width the strip had left: 5.84 px across at 393, 5.28 at 375
   and 3.56 at 320, which is a row of dots rather than a claim about colour. Six
   10 px discs and a "+26" say the same thing and can be seen saying it. The
   count is still on screen, in the chip and in the label a screen reader reads.

2. PROOF: locker-polish-audit.mjs | REACH: Tapping a News row on Today no longer
   sometimes taps the add button instead. The round-plus button hangs 8.1 px up
   into the scrolling page (12.1 with its ring), and a row passing through that
   band had its own visible centre owned by it: measured 58 x 7.9 px at 393x852
   and 375x667, with the hit test answering the button and not the row. The page
   now ends above the button, so no row can sit under it at any scroll position.
   Round 40's own 58 x 20.1 px was measured off unclipped rectangles, which count
   rows already hidden behind the tab bar; the defect is real and it is 7.9 px.

3. PROOF: locker-polish-audit.mjs | REACH: A Locker Room buy button knows what
   is in your wallet at the moment you look at it. The shelf read your balance
   once, when the Shop was drawn, and the kit room's tiles are built later, when
   you open it: earn or spend anything in between and the price told you the old
   number, either refusing a purchase you could now afford or arming to buy one
   you could not. Both the tiles and the tap read the live balance now.

4. PROOF: locker-polish-audit.mjs | REACH: Today's news banner costs 202 KB less
   on every cold boot. The Locker Room hero was fetching the full-size poster,
   359 KB, into a 97.8 px box; it serves the 157 KB tier that already existed,
   which still covers that box at 2x, and falls back to the master if the tier
   is ever missing.

5. PROOF: football-kit-audit.mjs (PRECACHE, PRECACHE-CONTROL), precache-audit.mjs,
   sw-upgrade-audit.mjs | REACH: The Locker Room survives a cold or offline boot.
   None of the kit's art was in the service worker's precache while all three
   plates the poster replaced still were, so the newest thing in the game was the
   one thing an offline first boot drew as holes. The sixteen files the news hero
   and the Shop's lead shelf actually draw (the 384 tier) are precached now:
   211 entries to 227, and 283.7 KB more to install (11,714.0 KB to 11,997.7 KB
   measured on the v498 base this was written against; 12,012.7 KB after the
   merge with v500, whose own art moved the total by 15 KB). The kit room's own
   grid is left on the runtime road on purpose, because it does not exist in the
   page until somebody opens it. The conditional-precache path is unchanged and
   sw-upgrade-audit's CARRIED row is still green (183 of 183 carried by 304).

6. PROOF: locker-polish-audit.mjs | REACH: If a garment's art ever fails to
   arrive, the tile says nothing rather than selling you nothing. The art layer
   was removed on error and its two colour layers were not, so the team's colours
   went on painting the shape of a garment that was not there, on a tile still
   charging 4,200 coins. The colour layers now leave with the art they belong to,
   and that tile's buy button goes dead.

7. PROOF: boneyard-raf-audit.mjs | REACH: Standing still in the Boneyard costs
   the phone almost nothing. It used to cost the same as walking: a phone that
   never moves still reports a position a metre or two away every 1.2 s, and each
   of those re-pinned all 49 markers and started a fresh 900 ms camera glide, so
   the map animated three quarters of the time with nothing to show. Measured
   with the scheduler hooked: 1,843.7 animation frames a second, 21.65 per frame,
   against 1.8 after. A marker is only moved when it has actually moved, and the
   camera only follows a fix that carried you 4 m, which is 1.7 px on screen at
   the Boneyard's own zoom. Walking is unchanged to look at and still costs
   ~17 frames of marker work per frame: that half is maplibre's own per-marker
   pass over DOM markers during a camera move, not the app's, and it is named
   here rather than claimed as fixed.

## the day tells the truth (2026-09-07)

Not stamped to a release: hotfix/daily-truth, off v496. HANDOFFMASTER20260906.md
B3, B13, B14, R41-16.

1. PROOF: unit.test.js | REACH: sparring past the day's 12 paid slots no longer
   prints "+15 coins on a win" over a wall that pays 0, and a capped win's
   victory card drops its coin pill instead of printing a literal "+0" beside
   the XP it did earn. Sparring itself stays free and unlimited; only the
   money stops, the same shape the Pit-charge cap already handles honestly.
   No economy change: SPAR_DAILY_CAP, SPAR_COINS and claimSpar are untouched.

2. PROOF: unit.test.js | REACH: Gwart's "put your gear on" line no longer
   repeats for a fortnight of once-a-day opens. The last few lines he said
   persist to kv (gwRecent) and seed the anti-repeat bag on the next boot,
   before he speaks.

3. PROOF: unit.test.js | REACH: the daily spin wheel fires on day one (a
   finished signup and a mid-onboarding restore both reach it now), and a
   level-up sheet open at boot no longer eats the day's spin outright:
   closeTopSheet retries it the moment the sheet stack drains. Day one was
   never a deliberate exclusion (claimDay's first-run branch already lets a
   brand-new device through like any other day); it was a missing wire.

4. PROOF: unit.test.js | REACH: Today's level chip (Lv, title, XP bar)
   repaints the moment a Pit fight settles, win or lose, without navigating
   away and back, the same fix class the wallet pill already got for
   coins/dust/Vigor.

## currency and receipts are one transaction (2026-09-06)

Not stamped to a release: fix/currency-revisions, off v493. Codex's read-only
audit of v485 (the aggregator handoff of 2026-09-06, lanes 1 and 3).

1. PROOF: coins-merge-tie-audit.mjs | REACH: buying something and then syncing can no longer refund the purchase while the item stays. Every coin and Bone Dust change (a spend, a Rack buy in either currency, a Boneyard coin pickup, a quest's dust reward, a melt) moves its balance and its merge-ordering revision in one IndexedDB transaction, so a cloud blob taken before the spend is recognised as older and refused. Bone Dust had no ordering signal at all before this and rides the same rule now. Red before, on v493: COIN-DEBIT got 100 expected 10; DUST-DEBIT got 100 expected 10; DUST-EARN got 100 expected 160; RACK-COIN coins 5000->2600 with coinsRev 5000->5000; RACK-DUST dust 500->280 with dustRev 500->500; SPAWN coins +12 with coinsRev +0.

2. PROOF: currency-revision-lint.mjs | REACH: the next place somebody writes a coin or dust balance cannot forget the revision. A static scan of every script forbids a raw balance write, requires the revision function beside every balance function in a claim's pay map, and requires the three shared helpers to route through the one revisioned primitive. Red on v493 with four findings (RAW, MAP, ASSIGN, PRIM), then red on the fixed tree for each of three single-site mutations, one check each.

3. PROOF: inv-tombstone-audit.mjs | REACH: a consumed item stays consumed. Using a draught or a Battle Charm, opening a crate, or losing a pet's last cosmetic copy deletes the row and writes its receipt in one transaction, and the receipt list has no size cap any more (it kept the newest 500, so the 501st use let an old backup bring item 1 back). Measured bound: about 23 bytes a receipt, so 10,000 consumed items is about 230 KB inside a 2.2 MB backup ceiling; a merge unions receipts from both devices and never drops one. Red before, on v493: RING 1 revived (the oldest: yes); RING-CRATE 1 revived (the oldest: yes); ATOMIC row gone: true, receipt: false; ATOMIC-CRATE row gone: true, receipt: false.
## open all recovers, cancel is one step (2026-09-06)

Not stamped to a release: fix/openall-kitchen-atomic, off v493. HANDOFFr3920260906.md
Lane 5 (open-all recovery) and Lane 6 (Kitchen cancel atomicity), both re-measured
on this tree before fixing.

1. PROOF: crate-reveal-audit.mjs | REACH: the Backpack's "Open all" control on a
   row of Common Crates used to be able to spend several crates, hit a bad row
   partway through, and lose the whole batch: nothing already opened was shown,
   the crates the loop never reached still sat spent-looking in inventory, and
   the button never came back. Poisoning the third of five crates mid-loop
   reproduced it (0 cards shown, the button staying disabled forever). Now a
   mid-loop failure still reveals whatever was actually taken, leaves every
   untouched crate exactly where it was, and the control comes back the same
   way a clean run leaves it.

2. PROOF: kitchen-atomic-audit.mjs | REACH: cancelling a pot in the Kitchen
   refunds its ingredients and empties the pot in one step. A crash between the
   two used to be possible (the pot cleared with nothing refunded, or the
   reverse), because they ran as two separate saves; forcing that exact
   mid-cancel failure now leaves the pot and the ingredients both exactly where
   they were before you tapped Cancel, never half-done. kitchen-day-one-strand-audit.mjs
   (the recovery from the day-one mis-tap this shares its Cancel path with)
   stays green.

CORRECTION to "## v483" item 4 below: it called the pot-and-refund cancel "one
atomic step" on the day it shipped. It was not; that was two separate saves with
a real gap between them, exactly the failure item 2 above fixes. Corrected rather
than left standing, because this file is read to check whether a note is true NOW.
## the routine cap holds under a race (2026-09-07)

Not stamped to a release: fix/wellness-xp-ceiling, no ticket-facing changelog
line. markRoutine read the daily routine-XP cap off a ledger scan and decided
the payout several awaits later, so two DIFFERENT routines finishing at once
both read cap-1 and both minted the reward: a documented 15 XP ceiling
(ROUTINE_XP 5 x ROUTINE_XP_CAP 3) paid 20 (measured 2026-09-06). The cap and
the payout are now one atomic claim through awardCapped's shared-ordinal
addIfAbsent (js/game.js), the same primitive every other repeatable daily
reward already uses.

1. PROOF: routine-race-audit.mjs, unit.test.js | REACH: marking two different
   self-care routines done at the same moment, on the day only one XP-earning
   slot is left, pays the XP to one of them and 0 to the other instead of
   both; the day's total routine XP never exceeds 15 no matter how the taps
   land, and both routines are still remembered as done today either way
   (red before: +10 XP paid on the race, 20 XP total, 0 of 2 calls reporting
   capped).

## the gate runs what it registers (2026-09-06)

Not stamped to a release: fix/gate-hygiene-c, off v493.

1. PROOF: release-gate.mjs | REACH: Every runnable guard belongs to exactly one
   tier that executes it. A declared guard missing from every running tier, a
   duplicate, or a never-run tier stops the gate before browser work begins.

2. PROOF: recovery-audit.mjs, log-write-failure-audit.mjs | REACH: The recovery
   suite reaches a dropped backup download after registration, and the log-write
   suite always runs its normal, failed-log and failed-XP cases.

3. PROOF: pet-wardrobe-audit.mjs, crew-fan-audit.mjs,
   reveal-mannequin-audit.mjs, harness-leak-audit.mjs | REACH: Image checks wait
   a bounded time for real decode evidence, while a missing image still fails;
   test browsers launched through an explicit browser path are reaped if their
   owning audit is killed.
## team colours read as the teams (2026-09-07)

Not stamped to a release: art/football-team-colours, off v493, waiting on Tom's
review of the before/after sheet. Tom, overnight: "go back through the football
colours and try to make them closer to the actual nfl teams, some are very far
off."

1. PROOF: football-kit-audit.mjs | REACH: Shop, Locker Room poster, the strip of
   32 discs, and the Wardrobe rail with any football piece worn: each team's two
   colours are now the brand colours of the franchise it stands in for (helmet
   shell first). Measured as CIE76 distance from each old pair to its
   franchise's pair: the worst eight were 105 to 159 apart and all 32 are now 0.
   The rows PAIR and LEGIBLE re-measure that no two teams share a pair (every
   two pairs >= 12 apart, min 17.59) and that each team's two colours read as
   two (>= 40 apart, min 44.46).

2. PROOF: football-render-audit.mjs | REACH: the lizard's helmet and jersey, on
   the Stable and on Today, take the new colours: rendered under Boneyard
   Bruisers (navy) and Windrow Wasps (old gold), the pixels that differ between
   the two renders sit nearer their own team's shell colour.

3. PROOF: football-rail-audit.mjs | REACH: sliding the Wardrobe rail recolours
   both Boneheads to the new pairs, the worn helmet holds one colour on arrival,
   and nothing is worn until the bar says so.

## pit readout and exit (2026-09-06)

Not stamped to a release: hotfix/pit-ap-exit, off v487. Tom on live v487, two
reports in one message.

1. PROOF: fight-hint-audit.mjs | REACH: In a fight, a move's AP/Stamina cost no
   longer overlaps its name (worst on Bone Guard, whose cost line is the only
   one long enough to wrap to two lines and paint over "BONE GUARD"). Measured
   on the pre-fix code at 375x667 and 393x852: every move's cost overlapped its
   label by 3.6px, Bone Guard's by 13.2px; both are 0px after.

2. PROOF: pit-exit-motion-audit.mjs | REACH: Closing a fight from the Pit (the
   Done button after a win) no longer does two full re-renders of the Pit
   screen behind it. Measured with a real tap on the real button: the Pit was
   being rewritten twice, once right away and once a quarter-second later,
   landing on the tail of the close animation for no reason the second
   time - a leftover duplicate of a re-render the sheet's own close handler
   already ran. It is rewritten once now.
## day one tells the truth (2026-09-06)

Not stamped to a release: hotfix/dayone-board, off v482. HANDOFFr3920260906.md
R39-2, R39-3, R39-28, R39-29, re-measured on this tree before fixing.

1. PROOF: unit.test.js, quest-pick-audit.mjs, quest-daymore-audit.mjs | REACH:
   A brand-new player's first Quests board always has 3 dailies you can
   actually do, and one of them is something onboarding itself taught you
   (Log anything at all, or Log 3 meals in a day). Two players who install on
   the same calendar day no longer see the identical board.

2. PROOF: unit.test.js | REACH: Onboarding's LOG FOOD screen no longer says
   logging a meal pays coins. It doesn't; coins come from quests, crates and
   the day close, so the line now only promises what logging actually pays
   (XP).

3. PROOF: unit.test.js | REACH: Gwart never opens with a scold ("Half the day
   gone and not a crumb on the page") on your first day, or on any day you
   have never logged a single thing. That line only ever fires on an
   established account that has logged before and chose not to today.

4. PROOF: unit.test.js, news-banner-audit.mjs, news-tab-audit.mjs,
   newsrow-return-audit.mjs | REACH: A fresh install starts with 0 unread news
   on Today. Every announcement the game has ever made is older than your
   account, so it is marked read the moment onboarding finishes; the News tab
   still lists every one of them, you just are not told you are behind on ten
   things you were never here for.
## first pet reaches Today (2026-09-06)

Not stamped to a release: hotfix/first-pet, off v487 (d7906217). HANDOFFr3920260906.md
R39-1 (P0) and R39-31, both re-measured on v487 before fixing: a cold install that
hatched the welcome egg through the Backpack's own HATCH button came home to
`equipped()` = `{B, SK}`, no C slot, no `#heroPetBtn`, and a Stable saying OUT WITH
YOU with EQUIP disabled. Root cause: `equippedPetIid()`'s heal wrote `petEquipped`
and never the paper-doll C slot; only `setEquippedPet` wrote both, and nothing on
the hatch path called it.

1. PROOF: first-pet-audit.mjs, pet-ownership-audit.mjs | REACH: Install fresh, finish
   onboarding, open your Bonehead, tap Backpack, tap HATCH on the welcome egg and
   Adopt. Back on Today your new pet is standing beside your Bonehead. No second
   egg needed.

2. PROOF: first-pet-audit.mjs | REACH: If you already hatched on v482 to v487 and
   came home to no pet, the next time the game asks which pet is out (opening the
   Stable, or the step credit that runs when Today refreshes) the slot is repaired
   and she appears. Nothing to tap.

3. PROOF: pet-ownership-audit.mjs | REACH: In the Stable, EQUIP is only greyed out
   as OUT WITH YOU while that pet is actually the one drawn on Today. A pet the
   home screen is not showing can always be equipped.

4. PROOF: pet-ownership-audit.mjs, unit.test.js | REACH: The "(name)'s wardrobe"
   heading in the Stable shows the species name as text whatever characters it
   carries. Catalogue names are ours today, so nothing visible changes for
   players.

5. PROOF: pet-ownership-audit.mjs | REACH: A save carrying a pet row with no
   species no longer empties the Stable. Every real pet is still drawn; the bad
   row is skipped and noted once in the console.
## onboarding fits the SE, sheets survive a double tap (2026-09-06)

Not stamped to a release: hotfix/onboarding-fold. HANDOFFr3920260906.md R39-12,
R39-15, re-measured on this tree before fixing.

1. PROOF: onb-audit.mjs | REACH: on an iPhone SE-sized phone (375x667) or
   smaller (320x568), onboarding's primary button is on screen the moment each
   step paints, with no scrolling and no scroll cue needed. It used to sit 22px
   below the fold on the reveal step ("That's me") and 293px below it on the
   plan step ("Start tracking"), because the button was pushed down by
   `margin-top: auto`, which only works when the screen has room to spare. It
   now rides the bottom of the scrollable area from first paint instead.

2. PROOF: sheet-doubletap-audit.mjs | REACH: opening any sheet in the app (the
   Kennel button among them) with a fast double-tap no longer opens it and
   immediately closes it again. The second tap used to land on the new sheet's
   own backdrop mid slide-up and read as a request to dismiss it; the backdrop
   now ignores a tap in the first 300ms after it appears, so a normal
   dismissal tap (at 400ms or later) still works exactly as before.
## the worn kit holds its colour (2026-09-06)

Not stamped to a release: hotfix/wardrobe-tint-flash, off v487. Tom, live v487:
"Switching to wardrobe makes the helmet or jersey run through every colour
quickly if you're on that item slot at the time. Makes me think these items
layer every colour at once?" Measured before fixing: the stage's two tint spans
took 18 distinct colour pairs inside 1.5s of the tab tap, the rail's scrollLeft
walking 0 to 2000 underneath them. Nothing was layered: the rail opened on the
worn tile with `centreOn(worn, 'auto')`, `'auto'` defers to `.fb-rail`'s
`scroll-behavior: smooth`, and the rail's scroll handler painted the doll with
every team the animated centring passed. After: 1 colour, 2 spans per garment.

1. PROOF: football-rail-audit.mjs | REACH: Wear a football helmet or jersey in
   any team but the first, open the Bonehead tab with that slot selected, or tap
   its slot chip. The piece on your Bonehead is your team's colours from the
   first frame; it no longer flicks through the other 31 on the way in.

## backup and recovery truth (2026-09-06)

Not stamped to a release: hotfix/backup-recovery, off v482. HANDOFFr3820260906.md
R38-2, R38-10, R38-11, R38-12, R38-13, re-measured on this tree before fixing.
R38-10's `hasCloudBackup()` half was already fixed by an earlier round (it asks
the server, not the opt-in flag); the contradiction between the two screens was
not, and R38-2, R38-11, R38-12 and R38-13 were all still live on v482.

1. PROOF: unit.test.js, backup-lifecycle-audit.mjs | REACH: Closing the app, or
   switching away from it, now pushes your encrypted cloud backup instead of
   waiting for the next boot or resume. A session that logs a meal or opens a
   crate reaches the cloud within seconds of being backgrounded, instead of
   sitting unsynced until a 10-minute throttle happens to have elapsed.

2. PROOF: unit.test.js, erase-vault-line-audit.mjs | REACH: The Erase sheet and
   Settings no longer say your progress "can be restored later" one line above
   a warning that no recovery code is set. A cloud backup with no recovery code
   is not restorable on a new device, and both screens now say exactly that
   instead of contradicting themselves.

3. PROOF: unit.test.js | REACH: Restoring by an old friend code plus your
   phrase, on an account that has since set a recovery ID, no longer says "No
   account found for that friend code." It names the actual fix: use your
   recovery ID instead.

4. PROOF: unit.test.js, api.test.mjs, recovery.test.mjs | REACH: A recovery
   attempt against one account no longer locks out every other phone on the
   same wifi network. The lockout is now keyed per account rather than per IP,
   and a locked-out attempt shows the real wait instead of a flat "a few
   minutes."

5. PROOF: coins-merge-tie-audit.mjs, restore-latch-audit.mjs,
   backup-key-audit.mjs, backup-conflict-audit.mjs | REACH: Two devices that
   each moved the coin ledger the same number of times no longer have the
   lower of the two balances silently win on the next sync. A spent
   consumable, a used Battle Charm, or a pet cosmetic removed on salvage can no
   longer come back through a stale cloud merge either.

## kitchen on day one (2026-09-06)

Not stamped to a release. HANDOFFr3820260906.md R38-21/R38-22/R38-23.

1. PROOF: kitchen-welcome-audit.mjs | REACH: a fresh install's welcome-kit toast (the message every new player actually receives, whether they finish onboarding or boot straight into an existing settings row) now says "exactly one Bone Broth. Cook it." instead of stopping at the ingredient count. The instruction used to live only on the pre-existing-install backfill path (`kit ? null : backfillStarterSeedsIfNeeded()`), which a fresh install's `kit` being truthy meant it never reached. Red with the appended copy reverted; drives real onboarding, polls #toast rather than reading it once.

2. PROOF: pit-kitchen-hint-audit.mjs | REACH: the Pit sheet, right where a fight is offered, now names an active dish buff and its plain-words effect, or (no buff active but ingredients or a cooked dish owned) points at the Kitchen; says nothing when there is truly nothing to cook. Cooking is measured at +37.7 to +59.9pp win rate in the real fight engine and renderPit never mentioned it before. Red on both the buff line and the nudge line with the Pit's kitchen line removed; the quiet state stays correctly green either way, which is the point.

3. PROOF: kitchen-day-one-strand-audit.mjs | REACH: a day-one cook that goes wrong is recoverable. The starter pouch ({marrow:2, salt:1}) is also enough to brew Stoneskin Draught, and doing that first used to leave nothing else affordable with no way back (measured: 606 coins of foraging to recover, against a roughly 300-coin day-one wallet). A Cancel control on any cooking pot (armed, so a stray tap cannot cost real progress) now refunds the ingredients in full, and the Kitchen names which recipe the starter ingredients are for before the first tap. Red independently on the tip and on the cancel control; the audit reproduces the exact strand (cooks Stoneskin, confirms 0 of 13 recipes affordable) before proving the recovery.

## register 429 wallet (2026-09-06)

1. PROOF: unit.test.js | REACH: a fresh install receives the complete social-welcome grant locally before registration. Two consecutive 429 responses retry once, leave exactly 50 welcome coins and 10 XP under the server's existing receipt key, and surface one named failure toast. A later registration cannot pay the grant twice.
## three generations, no orphaned page (2026-09-06)

Not stamped to a release: fix/sw-three-generations, off main at v493. Lane 4 of
the Codex read-only audit (finding "prevGen() retains the numerically newest
READY cache, not the cache of the page still running").

1. PROOF: sw-upgrade-audit.mjs | REACH: a player who keeps a sheet open on build A while build B and then build C install and take charge underneath still gets A's own modules when the old page lazily imports one (THREE GENERATIONS row, red before: the A page's import of the module only its build carries answered 404 with caches tally-v493, tally-v494; green after: 200, caches tally-v471, tally-v494). The worker keeps every generation an open page came from, at most two behind the current build, and sweeps the rest; the generation nobody is running (B here) goes.

2. PROOF: sw-upgrade-audit.mjs, offline-boot-audit.mjs, dead-shell-audit.mjs | REACH: nothing else about the swap moved: the new worker still takes over the moment its whole build is cached (R38-1), the page it takes over from keeps its own generation (R38-17), identical entries are still reused across the install (R38-18), and a cold offline boot and the dead-shell recovery still work with the extra tally-clients bookkeeping cache present.
## v497
1. A hotfix off v496, master handoff B9, B10, B11 and R40-28..31. Its rows are the dated section "the Stable rail tells the truth" further down, folded here.

2. PROOF: football-render-audit.mjs | REACH: owned colourways lead the Stable rail (positions 1 to 3 of 32, 192 px span, was 3113 of 3337), the rail parks on and persists the last pick (S.settings.petRailTeam), an owned team applies to every worn piece that exists in it and the toast names only a genuinely missing piece, a Locked team never reads Picked (RAIL-ORDER, RAIL-TOAST, RAIL-HALF-SWAP, RAIL-LOCKED, RAIL-REMEMBERS, RAIL-SE red on v493 with the quoted positions and toasts).

3. PROOF: football-render-audit.mjs, pet-ownership-audit.mjs, unit.test.js | REACH: the Locker Room price pill stays inside its text column at 320, 375 and 393 (PILL red before: 95.1, 40.1, 23.0 px past the column), kin chips are 44 px (KIN-TAP red at 40), a pet armed for breeding keeps its chip across copies (KIN-BREED), and a mixed-rarity family tile carries the shown item's rarity badge (R40-31 unit row red: fam r-legendary on a worn common).

## v496
1. A hotfix off v495, lane 4 of the data-integrity plan plus the hero-share audit re-premise. Its rows are the dated section "three generations, no orphaned page" further down, folded here.

2. PROOF: sw-upgrade-audit.mjs, offline-boot-audit.mjs, dead-shell-audit.mjs | REACH: the worker records which build cache served each live client (tally-clients) and the activate sweep keeps the generations of every live client (bounded to this build plus two), so a page still running build A after B and C activated can lazily import an A-only module (THREE GENERATIONS row red before: 404, caches tally-v493 and tally-v494 only; after: 200 with tally-v471 kept). The self-admitting install, the conditional precache, the reachability-gated Get latest and updateViaCache none are unchanged; the full audit is ALL GREEN.

## v495
1. A hotfix off v494, lanes 5, 6 and 7 of the data-integrity plan. Its rows are the dated sections "open all recovers, cancel is one step" and "the routine cap holds under a race" further down, folded here.

2. PROOF: crate-reveal-audit.mjs | REACH: the Common Open all loop reveals everything it actually opened when a later crate throws, leaves the unopened crates in place and re-enables the control (RECOVERY rows red before: cards=0, disabled=true with crate 3 poisoned).

3. PROOF: kitchen-atomic-audit.mjs, kitchen-day-one-strand-audit.mjs | REACH: cancelCook empties the pot and refunds its ingredients in one transaction (MID-CANCEL red before: the pot emptied with no refund when the second write failed); the earlier CLAIMS row that called the cancel atomic is corrected.

4. PROOF: routine-race-audit.mjs, unit.test.js | REACH: the wellness routine cap is claimed through per-day ordinal slots with the app's test-and-set, so two distinct routines finishing at once pay 15 total and both record completion (red before: 20 XP total, 0 of 2 capped).

## v494
1. A hotfix off v493, lanes 1 and 3 of the data-integrity plan (Codex audit, 2026-09-06). Its rows are the dated "currency and receipts are one transaction" section further down, folded here.

2. PROOF: coins-merge-tie-audit.mjs, currency-revision-lint.mjs, unit.test.js | REACH: coinsAdd, boneDustAdd, spendCoins and spendDust move the balance and its revision in one kv transaction (kvBumpRevisioned, revision by magnitude); buyRackItem, collectSpawn and claimQuest carry coinsRev/dustRev inside their claim pay maps; importAll ranks Bone Dust by dustRev the way coins are ranked; a static lint fails any site that moves coins or bonedust without its revision. Red before: COIN-DEBIT and DUST-DEBIT got 100 expected 10, DUST-EARN got 100 expected 160, RACK-COIN coinsRev 5000 to 5000, SPAWN coins +12 coinsRev +0; lint RAW/MAP/ASSIGN/PRIM red on the unfixed sites.

3. PROOF: inv-tombstone-audit.mjs, restore-latch-audit.mjs, unit.test.js | REACH: db.takeInv removes an inventory row and writes its receipt in one transaction, every former db.del('inv') site and openCrate use it, the receipt list is uncapped (about 23 bytes an id, documented bound) and merges as a union with the payload's, so a snapshot older than 500 takes cannot revive the oldest item. Red before: RING and RING-CRATE 1 revived (the oldest), ATOMIC and ATOMIC-CRATE row gone with receipt missing.

## v493
1. A hotfix off v492, Codex's round-37 lane (R37-24). Its rows are its dated section further down, folded here.

2. PROOF: unit.test.js | REACH: a freshly minted identity receives the social-welcome payload (50 coins, 10 XP) locally through one claimAndPay transaction before registration; POST /register retries once after a 429 with backoff; a second failure shows one onboarding line saying the coins are safe; a later server grant dedupes against the same receipt so coins stay exactly 50 (red before: register must retry exactly once after a 429, 1 !== 2; the forced double-429 row asserts two attempts, 50 coins, 10 XP, one toast, then a permitted registration stores the real player id with no second toast).

## v492
1. A hotfix off v491 from Tom's live play test. Its rows are the dated "pit readout and exit" section further down, folded here.

2. PROOF: fight-hint-audit.mjs | REACH: no move's cost pill overlaps its label at 375x667, 393x852 or 430x932 (measured 3.6 px on every move and 13.2 px on Bone Guard before; 0 after), and Bone Guard's cost fits one line.

3. PROOF: pit-exit-motion-audit.mjs | REACH: closing the fight sheet through the real Done rewrites #pitBody exactly once; the redundant setTimeout renderPit that fired at 262 ms on top of onClose's own render is gone (red before: 2 writes), with rAF frame timing bounded against a same-run Stable close.

## v491
1. A hotfix off v490, QA round 39's R39-2, 3, 28, 29. Its rows are the dated "day one tells the truth" section further down, folded here. No quest reward or coin value changed.

2. PROOF: unit.test.js, quest-pick-audit.mjs, quest-daymore-audit.mjs | REACH: pick() filters the pool by gate state before drawing, a day-one board carries q-first or q-3meals, and a per-install salt folds into the date seed (rows red on the pre-fix pick; quest-daymore's SCOPED sweep proves the substitution applies to the day-one gate combination and nowhere else, red when the guard is loosened).

3. PROOF: unit.test.js | REACH: the onboarding LOG FOOD line no longer promises coins; food pays XP and the line names quests, crates and the day close as the coin sources (row red before).

4. PROOF: unit.test.js, news-banner-audit.mjs, news-tab-audit.mjs | REACH: Gwart never scolds on the install day or before anything has ever been logged (row red before), and saveInitialSettings marks every live NEWS row seen so a fresh install shows zero unread while the rows stay listed (row red with the write removed).

## v490
1. A hotfix off v489, QA round 39's R39-1 (P0) and R39-31. Its rows are the dated "first pet reaches Today" section further down, folded here.

2. PROOF: first-pet-audit.mjs, pet-ownership-audit.mjs | REACH: equippedPetIid's heal writes both records (petEquipped and the paper-doll C slot), hatchEgg calls it so the first hatched pet is out before the reveal closes, and the Stable only shows OUT WITH YOU (disabled) when the worn outfit actually holds that species. Node rows red on v487 (C=undefined on HEAL, STUCK and HATCH); browser FIRSTPET red on v487 (real onboarding, real HATCH, heroPetBtn false), green after (heroPetBtn true, both records agree).

3. PROOF: pet-ownership-audit.mjs | REACH: the Stable's wardrobe heading escapes the species name (HER row red: a name containing <b> rendered bold), and an instance row without sp is skipped with one warning instead of throwing out of bhAsset and emptying the Stable (GHOST row red: 0 cards, TypeError).

## v489
1. A hotfix off v488, QA round 39's R39-15 and R39-12. Its rows are the dated "onboarding fits the SE, sheets survive a double tap" section further down, folded here.

2. PROOF: onb-audit.mjs | REACH: the onboarding primary button's bottom edge is inside the viewport at first paint at 375x667 and 320x568 on both the reveal and plan steps (the foot is sticky to the screen bottom, safe-area aware); red before with the measured overflows (21.7, 293.5, 162.2 and 330.5 px).

3. PROOF: sheet-doubletap-audit.mjs | REACH: two real taps 60 ms apart on a sheet trigger leave the sheet open, and a backdrop tap at 400 ms still closes it, because the shared openSheet backdrop handler ignores clicks within 300 ms of open (red before with the guard reverted).

## v488
1. A hotfix off v487 from Tom's live play test. Its row is the dated "the worn kit holds its colour" section further down, folded here.

2. PROOF: football-rail-audit.mjs | REACH: arriving on the Wardrobe with a football piece worn paints the stage once, in the worn team, because the rail's opening centring is instant instead of a smooth scroll whose per-frame select repainted the stage spans (RAIL-HOLDS row red before: 18 distinct colours across 88 samples; after: 1; RAIL-STACK shows two tint spans per garment throughout, so nothing was ever layered).

## v487
1. A hotfix off v486, Codex's two round-37 lanes (R37-14, 19, 20 and R37-17). Its rows are their dated sections further down, folded here.

2. PROOF: crate-reveal-audit.mjs | REACH: a crate open toasts the item and where to wear it, the non-dupe card carries a New plus rarity payoff line, and Common Crates get a sequential Open all through the existing reveal timing (38 rows green; each new row red on the pre-fix code).

3. PROOF: health-intake-audit.mjs | REACH: Today renders the Activity card in a not-connected state with the Sync control before the first Health sync, and a first successful sync routes back to Today (red on the pre-fix code where healthCardHtml returned nothing).

## v486
1. A hotfix off v485, QA round 38's update-path items (R38-1, 3, 4, 15, 17, 18). Its rows are the dated "update path" section further down, folded here.

2. PROOF: sw-upgrade-audit.mjs | REACH: the new worker's own install precaches, writes READY and calls skipWaiting, so a downloaded build activates on a device whose page never had letItIn; side A of the audit is now a real v471 build (git archive 96c1104a) served over TLS, and the SECOND OPEN row is red with sw.js reverted (after resume: build v471, waiting installed) and green with the fix (build v486, waiting null).

3. PROOF: sw-upgrade-audit.mjs, offline-boot-audit.mjs | REACH: activate keeps one previous READY cache generation and fromCaches serves this build first then the kept one, so a module the new build dropped still answers 200 to an old page mid-swap (WINDOW row red before: 404, import failed); hardRefresh proves reachability against version.json before touching a cache and asks the registration for the new worker, so Get latest offline keeps the app and says there is no connection (GET LATEST OFFLINE row red before: caches [], the page is gone).

4. PROOF: sw-upgrade-audit.mjs | REACH: the update banner renders on Today with a real hit box and the Settings build row names the live build when behind (TODAY BANNER and SETTINGS ROW rows red before); precache carries byte-identical entries from the kept generation instead of re-downloading them (CARRIED row: 187 of 187 carried, 3755 KB served of 11582; red before: carried 0).

## v485
1. A hotfix off v484, QA round 38's backup and recovery items (R38-2, 10, 11, 12, 13, 14). Its rows are the dated "backup and recovery truth" section further down, folded here. Server change included: no D1 migration; Tom deploys the Worker.

2. PROOF: unit.test.js, backup-lifecycle-audit.mjs | REACH: visibilitychange to hidden and pagehide push the encrypted backup, and a save whose export grew bypasses the 600 s throttle past a 20 s floor (red: 0 PUT /backup after the hidden transition; the throttle row red on the bare elapsed check).

3. PROOF: erase-vault-line-audit.mjs, unit.test.js | REACH: the Erase sheet and Settings read one restoreTruth (none, no recovery code, restorable, unreachable) so no sentence contradicts its neighbour, and a deleted account flips a second device to signed-out copy on the 401.

4. PROOF: unit.test.js | REACH: the recovery lockout is keyed per account with a looser per-IP ceiling, the client quotes the server's retryAfterMs, and the friend-code 404 copy names the real fix (the route is deliberately closed once a recovery id exists) instead of claiming no account exists. Server rows live in server/recovery.test.mjs and server/test/api.test.mjs, run against a local wrangler dev: 16/16 and 86/86.

5. PROOF: unit.test.js | REACH: coinsRev bumps by magnitude so an equal revision means an equal sum and importAll keeps the higher balance on a true tie (red: got 10, expected 25); consumeConsumable, activateBattleCharm, refundStreakFreezes and the pet-extinction removals write the same taken receipt crates already had, so the additive merge cannot revive a spent item (red: the item reappears in the REVIVE row).

## v484
1. A hotfix off v483, QA round 38's quest items (R38-5, 7, 8, 24). Its rows are the dated "quests tell the truth" section further down, folded here. No quest reward or coin value changed.

2. PROOF: unit.test.js | REACH: a claim on a closed period toasts the truth and repaints instead of returning silently, and the claim path runs the day re-check first (red: a bare if (!res) return swallowed the refusal).

3. PROOF: unit.test.js | REACH: a Quick Add counts toward the new-food quest by name; q-friend and w-friends gate on a cached accepted-friend count, not reachability; w-boss and m-boss need the Pit tried; the water quest shows cups against the goal; a monthly first shown after the 1st scales its target to the days left, reward untouched (each row red on the pre-fix code).

4. PROOF: unit.test.js | REACH: weeklies carry a Monday reset note and dailies a midnight note after 21:00 local; the water hint fires only with q-water on the board and unclaimed; the shown floor quest is sticky for its period across capability changes; the Quest progress link that opened Trends is gone.

## v483
1. A hotfix off v482, QA round 38's Kitchen items (R38-21, 22, 23). Its rows are the dated "kitchen on day one" section further down, folded here.

2. PROOF: kitchen-welcome-audit.mjs | REACH: the welcome kit toast on a real fresh install names Bone Broth and says to cook it (red with the copy reverted: the kit toast fires and names no recipe).

3. PROOF: pit-kitchen-hint-audit.mjs | REACH: the Pit carries one line naming the active dish buff, or pointing at the Kitchen when ingredients or a dish are owned, and nothing when there is nothing to cook (BUFF and NUDGE rows red with the line removed, QUIET grades the absence).

4. PROOF: kitchen-day-one-strand-audit.mjs | REACH: a cooking pot can be cancelled and refunds its ingredients, and the day-one Kitchen says which recipe the starter kit is for before the first tap (TIP and CANCEL rows red when reverted separately; the strand itself reproduced first: marrow 1, salt 0, 0 of 13 buttons). (This called the cancel "one atomic step" when it shipped. It was not: the pot was cleared and the ingredients refunded as two separate saves, with a real gap a crash could land in. See "## open all recovers, cancel is one step (2026-09-06)" above for the actual fix. Corrected rather than left standing, because this file is read to check whether a note is true NOW.)
## health card today (2026-09-06)

1. PROOF: health-intake-audit.mjs | REACH: Open Today before connecting Apple
   Health. The Activity card and its Sync control are present for the first
   import. Completing that first sync from Settings returns to Today, where the
   synced activity is visible.

## v482
1. A hotfix off v481, QA round 37's first-session and crate-tap items (R37-1, 5, 6; R37-2 verified already fixed by the round-34 restore latch). Its rows are the dated "first session and crate taps" section further down, folded here.

2. PROOF: first-session-lifecycle-audit.mjs | REACH: the install session binds the app lifecycle (resume handling, the midnight roll, sync on return) the same way every later boot does; the audit drives real onboarding to Today in one page, walks a pinned clock across midnight, fires a real resume and reads the day marker advance (red with the onboarding call removed: before null, want the new day, got null).

3. PROOF: crate-reveal-audit.mjs | REACH: a tap on the crate card at 900, 1400 or 1800 ms no longer destroys the reveal before it draws; the item lands and reads back (EARLYTAP rows, red before: survivedTap true, landedOk false).

4. PROOF: crate-reveal-audit.mjs | REACH: the Add-food button is hidden and inert while a reveal is mounted and for 360 ms after, and the close hint no longer overlaps its box at 393x852 or 375x667 (FABSAFE rows, red before: overlap 3364 px, FAB hit at 600 and 900 ms).

## quests tell the truth (2026-09-06)

Not stamped to a release: hotfix/quests, off v482. HANDOFFr3820260906.md R38-5,
R38-7, R38-8 and R38-24, re-measured on this tree before fixing.

1. PROOF: unit.test.js | REACH: tapping CLAIM on a quest whose period closed
   at midnight (or the week/month turning over) while the board sat open no
   longer does nothing. The claim handler re-checks the day the same way the
   minute timer does before claiming, then names the truth ("That quest
   closed at midnight/when the week turned over/when the month turned over")
   and repaints so the dead CLAIM button is gone, instead of silently
   swallowing claimQuest's null.

2. PROOF: unit.test.js | REACH: a Quick Add of a food never logged before now
   completes q-new-food (matched by name, since Quick Add has no food id).
   w-boss and m-boss now only appear once the Pit has been tried, same as
   every other Pit quest. "Drink 8 cups of water" shows real partial progress
   (3/8, not a hidden 0/1). A monthly that first appears after the 1st scales
   its target to the days actually left in that player's first month; an
   existing player's target is untouched. Coin, dust and crate rewards are
   unchanged throughout.

3. PROOF: unit.test.js | REACH: q-friend and w-friends now require an actual
   accepted friend (read from the cached friends list, refreshed at boot and
   resume) instead of only a reachable account, so a zero-friend player is no
   longer handed a quest they cannot complete.

4. PROOF: unit.test.js | REACH: weeklies now warn "Weekly quests reset
   Monday" and dailies in their last hours warn "Daily quests reset at
   midnight", the same treatment the monthly tier already had.

5. PROOF: unit.test.js | REACH: connecting a capability (Health, the Pit)
   mid-period can no longer swap out a quest already shown for a different
   one; it can only reveal more of what was always there.

6. PROOF: unit.test.js | REACH: "Quest progress" no longer opens Trends, a
   screen that never says the word quest; the link is dropped since the
   quest drawer right above it already shows the same progress. The "Claim
   the water quest for coins" toast only fires when q-water is actually on
   today's board and not already claimed.

## v481
1. A hotfix off v480, QA round 37's notification items (R37-3, 4, 9, 10, 11, 12, 23). Its rows are the dated "notifications consent" section further down, folded here.

2. PROOF: unit.test.js, notif-audit.mjs | REACH: the native send path checks permission before claiming success and the Settings test button says it could not send under denied (red before: toast "Sent. Background the app to see it."); nothing schedules while permission is prompt or denied, and one line of consent copy precedes the OS prompt (notifGateOk rows, red: got true for prompt).

3. PROOF: unit.test.js, notif-tier-audit.mjs | REACH: immediate pushes take distinct ids from a pool (red: got 9 === 9) and pushes due between 22:00 and 08:00 local move to 08:00 (red: 0:00 must clamp to 08:00).

4. PROOF: notif-tier-audit.mjs, unit.test.js | REACH: the Dark Spires siege reminder has its own Settings row so the Essentials preset visibly changes the page and its toast names what it drops; a committed meal log re-runs the schedule sync so the evening reminder clears; denied permission dims the sub-toggles and the web note stops advertising retired pushes.

## v480
1. A hotfix off v479 from Tom's live session. Its rows are the dated "dressing room families" section further down, folded here.

2. PROOF: dressing-room-audit.mjs, wardrobe-family-grid-audit.mjs | REACH: the Dressing Room look picker shows one tile per family with the team rail (FAMILY and RAIL rows, red on v477: 35 tiles for 33 looks, no family tile), and "its own look" resolves to the gear's own art in all five slots (OWN rows, red by mutation).

3. PROOF: dressing-room-audit.mjs | REACH: the Dressing Room's bar and the fit rail's team bar are addressed separately, so a look tap no longer replaces the Wardrobe's team bar (PICK row, red before the selector fix).

## v479
1. A hotfix off v478, two Stable fixes from Tom's live session. Its rows are the dated "stable collapse" section further down, folded here.

2. PROOF: football-render-audit.mjs | REACH: the pet wear shelf shows one tile per garment family with the 32-team rail below it, every team tile at least 40px; tapping a team recolours every football piece the lizard wears (SHELF and SHELF-TEAM rows, red on v476: 0 garment tiles, 0 team tiles).

3. PROOF: pet-ownership-audit.mjs | REACH: the Stable ring draws one card per species with a count badge and a copy row under the caption; twelve Bulldogs collapse to one card carrying 12, and one swipe from the Bulldog lands on the lizard (COLLAPSE, COLLAPSE-COUNT, COLLAPSE-REACH rows, red on v476 with 14 cards).

## v478
1. A hotfix off v477 from Tom's live session and QA round 37. Nothing from the integration train is in it.

2. PROOF: hype-banner-audit.mjs, news-banner-audit.mjs | REACH: the news pill's hero slot promotes the Locker Room row: a poster rendered from the real kit-room DOM (Bonehead in the Bruisers kit, lizard in front) registered as a measured plate, so the hero shows the newest thing on sale instead of the Wanderer. The hype audit re-measures the hero (one hero, art decoded, whole figure, fits, caption length) with the new plate in it; the news audit keeps every row bounded.

3. PROOF: shop-door-audit.mjs | REACH: Today's coin pill opens the Shop. The COIN-PILL row taps the real pill and reads the Shop chip lit; red on v477 (tapped, chip off).
## update path (2026-09-06)

Not stamped to a release: hotfix/update-path, off v482. HANDOFFr3820260906.md
R38-1, R38-3, R38-4, R38-15, R38-17, R38-18. The lever that admits a downloaded
build moves out of js/app.js (the half a stranded device never runs) and into
sw.js's own install, which is the only new code guaranteed to execute on an old
device. tests/sw-upgrade-audit.mjs now serves side A as a REAL old build
(`git archive 96c1104a`, v471, pre-letItIn) instead of this tree with VERSION
bumped; on that premise the untouched audit was 53/53 green against the exact
sw.js that stranded every tester, and with the real A it reads red on the
pre-fix sw.js and green on this one.

1. PROOF: sw-upgrade-audit.mjs (SECOND OPEN "after the install lands and the app
   is RESUMED" and "real activation" rows; red with sw.js alone reverted to
   origin/main: `after resume: shell=A module=A css=A build=v471, registration
   {"active":"activated","installing":null,"waiting":"installed"}`; green on
   this tree: `shell=B module=B css=B build=v482, registration
   {"active":"activated","installing":null,"waiting":null}`), unit.test.js (the
   SKIP_WAITING handshake rows, unchanged and still green) | REACH: A player on
   any build from v427 to v482 opens the app once with signal. The new worker
   downloads the whole build in the background, then takes over by itself the
   moment the last file is cached; the page they are on reloads once (or, with a
   sheet open, when they close it) and they are on the new build. No button, no
   force-quit, no second open. Nothing on their side has to know how to let it in.

2. PROOF: sw-upgrade-audit.mjs (WINDOW row: the v471 page, with the v482 worker
   already in charge under it, lazily imports js/ocr.js, which B drops from
   PRECACHE and 404s; answered `200 text/javascript`; red under
   --prove-red=window, which deletes the previous generation on activate again:
   `status=404, import()=FAILED: TypeError: Failed to fetch dynamically imported
   module`; and red on the pre-fix sw.js because the swap never happens) plus the
   re-premised "exactly two tally-v* caches survive" and sentinel rows | REACH:
   During the seconds between the new build taking over and the page reloading,
   the old page still finds every file of its own build: activate keeps one
   previous cache generation and deletes only older ones, and every lookup reads
   this build's cache first, then the kept one. A module the new build removed
   is still served to the page that asked for it. What is NOT closed: a module
   both builds carry is answered from the NEW build during that window (the
   pre-v427 shape), bounded by the reload the swap itself triggers.

3. PROOF: sw-upgrade-audit.mjs (GET LATEST OFFLINE row: Settings "Get latest"
   pressed on the new build with the network gone; red under --prove-red=blank,
   which restores origin/main's hardRefresh) | REACH: Tapping "Get latest" with
   no signal now toasts "No connection. Try again when you have signal" and
   leaves the worker, the caches and the running app exactly as they were. It
   used to unregister every worker and delete every cache before reloading,
   which with no signal left a blank app (0 characters, no caches, no
   registration) across reopen and force-quit until the network came back. With
   signal it asks the registration for the new worker and lets that worker's own
   install and activate do the swap, so the old cache is deleted only after the
   new build has fully landed. The dead `location.reload(true)` argument is gone.

4. PROOF: sw-upgrade-audit.mjs (TODAY BANNER and SETTINGS ROW rows, driven on
   the new build's page with version.json claiming v999; red under
   --prove-red=nobanner) | REACH: The "Update available. You're on vX; vY is
   live. Get latest" banner is on Today, the screen a player actually opens, not
   only on Progress. The Settings build row reads "Build vX, vY is live" when
   behind instead of the same "tap if the app looks out of date" it showed
   whether current or six builds back. Both read version.json (the worker's own
   never-cached killswitch stamp, thirty bytes) rather than downloading sw.js.

5. PROOF: sw-upgrade-audit.mjs (CARRIED rows: of 187 byte-identical precache
   entries between v471 and this tree, 187 in the new cache are the previous
   generation's own copies validated by a 304 and 0 were re-downloaded; the
   install pulled 3,755 KB of an 11,582 KB precache; red under
   --prove-red=refetch, `carried=0 fresh=188, 11,899 KB served`, and on the
   pre-fix sw.js, which pulled 11,474 KB) |
   REACH: An update downloads the files that changed, not all 211. Install asks
   the server conditionally (If-None-Match against the ETag the previous
   generation stored, with the browser HTTP cache bypassed so a small or evicted
   one changes nothing) and copies the old entry across on a 304. On the
   measured v471 to v477 gap that is about 3.2 MB instead of about 11 MB, on
   the bad connection this player is on by definition.

## notifications consent (2026-09-06)

Not stamped to a release: hotfix/notify-consent, off v477. HANDOFFr3720260906.md
R37-3, R37-4, R37-9, R37-10, R37-11, R37-12, R37-23, re-measured on this tree
before fixing (all seven were still live on v477, none were already fixed by
the intervening train).

1. PROOF: unit.test.js (notifGateOk), notif-audit.mjs | REACH: The Settings
   "Send a test notification" button can no longer tell a player who denied
   notifications that it sent one. notifyNow's native branch checks the real
   OS permission before scheduling anything; denied now toasts "Could not
   send. Check permission." instead of "Sent."

2. PROOF: unit.test.js (notifGateOk), notif-audit.mjs, notif-tier-audit.mjs |
   REACH: Nothing schedules on a device that has not granted notification
   permission, even though notifications default to on for a new player. The
   19:00 daily reminder is no longer already scheduled on a fresh install
   before permission is ever asked. One line of consent copy in Settings
   ("Turning this on asks your device for permission to send notifications")
   now sits ahead of the OS prompt; the ask itself still only happens from an
   explicit Settings control, and boot still asks for nothing.

3. PROOF: unit.test.js (nextImmId, immRateCheck), notif-tier-audit.mjs | REACH:
   A friend's gift and cheer arriving moments apart no longer erase each
   other. Every immediate push (friend request, gift, cheer, siege discovery,
   the HealthKit stall notice, the Settings test button) now gets a distinct
   id from a small pool instead of sharing one, plus a generous rate ceiling
   against a genuine runaway.

4. PROOF: unit.test.js (clampQuietHours) | REACH: The Dark Spires siege
   reminder (the T-12h nudge) no longer fires between 22:00 and 08:00 local;
   a time that would land overnight moves to 08:00 instead.

5. PROOF: notif-tier-audit.mjs | REACH: Settings > Notifications now shows a
   Dark Spires siege row, so "Just essentials" visibly differs from
   "Everything" instead of rendering byte-identical cards. The Essentials
   toast now names what it actually keeps on (log reminder, streak saver,
   Crew activity: friend requests, gifts, cheers) instead of saying "friend
   requests" for a key that also covers gifts and cheers.

6. PROOF: unit.test.js (R37-9 commitLogEntry / R24-L17) | REACH: Logging a
   meal now re-syncs notification schedules immediately. A morning-only
   logger who eats dinner mid-evening no longer gets the 20:30 "keep your
   streak" nag with the streak already safe; it's pushed to tomorrow evening
   instead.

7. PROOF: NONE beyond what the Settings render itself proves (no dedicated
   audit row; small enough to read directly) | REACH: The three (now four)
   notification sub-toggles render visibly dimmed and disabled once
   permission is denied in system settings, instead of staying live and
   still writing preferences that can never fire. The web/PWA note no longer
   advertises "rare" pushes retired in v251; it now names exactly what does
   and doesn't work in a browser (immediate pushes only; the daily reminder
   and streak saver need the installed app).

## crate reveal payoff (2026-09-06)

Not stamped to a release. hotfix/crate-reveal-payoff, off v482. Round 37 R37-14/R37-19/R37-20.

1. PROOF: crate-reveal-audit.mjs | REACH: finish opening a crate that contains a new cosmetic or gear piece. The completion toast names it and points to the Wardrobe.

2. PROOF: crate-reveal-audit.mjs | REACH: reveal a new cosmetic. Its payoff line says New and names the card's rarity instead of leaving the space blank while duplicate cards show their coin payout.

3. PROOF: crate-reveal-audit.mjs | REACH: hold two or more Common Crates and open the Backpack. One Open all tap spends every Common sequentially and presents their combined hand through the existing reveal. Bone Crates are left alone.

## v477
1. A hotfix off v476, two Crew fixes from Tom's live session. Nothing from the integration train is in it.

2. PROOF: crew-slime-leak-audit.mjs | REACH: the slime glow is scoped to the player's own worn item and every render of someone else's outfit (Crew cards, friend rows and profiles, leaderboard heads, race runners, foes, the boss wall, a rival keeper, a visited paddock's keeper) is marked foreign. The audit seeds slimed kicks on the viewer, three friends with kicks in the deck, reads zero slimed layers inside the Crew deck while the viewer's own hero shows the glow; red on v476 with 2 friend layers lit.

3. PROOF: crew-slime-leak-audit.mjs | REACH: the Crew's sealed-gift card renders one gift and "and N more waiting" instead of every sealed gift; six seeded gifts render one button; red on v476 with six.

## first session and crate taps (2026-09-06)

Not stamped to a release. Round 37 handoff, R37-1/R37-5/R37-6.

1. PROOF: first-session-lifecycle-audit.mjs | REACH: an install that finishes onboarding (rather than reopening into an existing save) now gets a day rollover and a resume handler from its very first session: backgrounding and returning does something, and the app closes yesterday if it is left open past midnight. Both used to be registered only from boot(), which a fresh install never runs. bindAppLifecycle() is now called from both boot() and the end of onboarding, guarded so a second call is a no-op.

2. PROOF: crate-reveal-audit.mjs | REACH: tapping a crate reveal's card in the roughly one second before it visibly lands (rather than beside it) no longer destroys the item unseen and unrecoverable. The same guard that already protected a tap-anywhere-on-the-screen now also protects a tap that lands directly on the card.

3. PROOF: crate-reveal-audit.mjs | REACH: the crate reveal's "tap to close" hint no longer sits on top of the Add-food button. A second tap in the same spot shortly after closing a crate can no longer land you on Today with the Add-food sheet open instead of nothing.

## v476
1. A hotfix off v475, two changes. Nothing else from the day's integration train is in it.

2. PROOF: no-debug-markers-lint.mjs | REACH: the TEMP DIAGNOSTICS OVERLAY (a fixed pre at z-index 999999 mirroring console.error) that v475 shipped in the page shell is removed. The lint scans the shell, the worker, the stylesheet and every module under js/ and data/ for "do not commit", TEMP DIAGNOSTICS or an id="dbg" sink and exits 1 on the first hit; proven red on v475's own shell (two hits, lines 31 and 33) before the removal.

3. PROOF: football-kit-audit.mjs, football-render-audit.mjs | REACH: the Locker Room poster's summary no longer overrides its display (WebKit's disclosure hit test ignored a real tap when the summary itself was a flex row; measured on the iOS 17 Pro Simulator: fbSect.open stayed false after a tap, true after the fix). The flex row lives on an inner wrapper, the POSTER-TOGGLE row pins that and was proven red by reinstating the override (DISPLAY OVERRIDE, exit 1), and the render audit re-measures the poster's hero, discs and tiles after the move.

## v475
1. Folds in the day's dated sub-sections finished since v474: kit live feedback,
rack weekly, shop front door, crew identity, crew layout and offline crash
seams, plus claim hygiene's quest-claim row. Each row below combines one or
more of those sections' original rows into the one changelog line it backs;
the leftover rows that did not make this changelog (a GATED banner, an
honest-403 gift copy, and the welcome-kit double-boot race) stay documented
in their own dated sections further down, unpromoted. The sw-upgrade-audit
re-premise merged the same day changed no player behaviour and is documented
in its own section below, not folded in here.

2. PROOF: news-banner-audit.mjs, news-tab-audit.mjs, shop-lead-order-audit.mjs | REACH: Today's News pill now carries "The Locker Room is open" as its newest, unread row, above the fold with the wardrobe's own unread dot. Tapping it takes you straight to the Shop with the Locker Room already open, the same one-shot the Wardrobe's colourway rail button already used.

3. PROOF: shop-lead-order-audit.mjs (TINT-STRIP, BUNDLE-5), art-resolution-audit.mjs, memory-census.mjs | REACH: Each of the five Locker Room tiles now shows the same 32-team colour strip the poster above it does, instead of only the grey "All 32 colourways" line. The full-kit tile no longer shows one two-tone disc in whatever team you happen to be previewing; it shows all five pieces, each in a different team's colours, under "Every piece, every team", so buying the bundle reads as buying the whole kit, not one colourway.

4. PROOF: shop-lead-order-audit.mjs (PET-384), art-resolution-audit.mjs, football-render-audit.mjs, memory-census.mjs | REACH: The lizard's two Locker Room tiles (Lizard Helmet, Lizard Jersey) are no longer soft. They draw from the same 384 tier the poster hero above them already uses, worst case 1.15x its source instead of the 192 tier's ~2.3x.

5. PROOF: unit.test.js (rack weekly rotation, rack nudge), rack-rotate-audit.mjs, purchase-firewall.mjs (REROLL rows), shop-lead-order-audit.mjs, emporium-audit.mjs, t3-audit.mjs | REACH: The rotating twelve on the rack now turn over once a week, on the same Monday boundary the themed nine and the reroll ladder already used, instead of silently re-rolling every night. The scarcity clock ("HEATWAVE · RACK N OF 4 / New rack in Nd") moved off an 11px line below the pet shelf and the football Kit room and into Gwart's own header, at heading size, and its rack number is now read off the same ISO week the shelf itself turns on rather than the day of the month. The free first reroll of the week sits beside the rotating shelf's own header now, above its 12 tiles instead of 1,770px below them. A player who has not opened the Shop since the rack last turned sees a badge on the Shop tab; it clears the moment they open the Shop.

6. PROOF: shop-door-audit.mjs (WALLET, GIFT) | REACH: On the Shop's rack, tapping the coin balance now takes you to Today, the same as the dust balance already did, since that is where coins actually come from (day close, the Pit, the step race). And a coins-only Crew gift now opens with a real "Spend it in the Shop" button, tappable straight into the Shop, instead of a line of text with nothing behind it.

7. PROOF: shop-door-audit.mjs (COUNT) | REACH: The rack's "buys X of Y" line now drops both numbers the moment you buy something, instead of still counting a piece you already own against your wallet.

8. PROOF: unit.test.js (raceStanding), crew-fan-audit.mjs, crew-pair-audit.mjs, and (for the clock-skew and champion-line rows) NONE in the browser gate: Worker-only behaviour, proved against a local dev in the server's own test suite rather than a browser audit | REACH: Going online for the first time now uses the name you picked at onboarding instead of a random handle, and tells you plainly if somebody already holds that exact name. Your line on the step race shows the rank the server actually has for you, even below 10th, rather than a number invented by squeezing you into the visible top 10, and reads "unranked" rather than a fake rank when the server genuinely has none for you yet. A device whose clock is more than five minutes out now sees its own wrong clock named on the Crew fan, the leaderboard and the step race alike, instead of being told the Crew server is unreachable. The step race's "who to beat" line (last week's winner) shows every time you open the board after it settles, not only in the one request that happened to settle it. And a friend's name on their Crew card or profile sheet now carries a full-name tooltip once it is long enough to be cut off, and can no longer visually reverse the text sitting next to it.

9. PROOF: crew-layout-audit.mjs (GIFT, WORTH, HIT, TOAST) | REACH: An unopened gift now renders in its own card above the fan, on screen the moment Crew opens, instead of over a thousand pixels down under the fan, cheers, the leaderboard, the race and Add A Friend. The WORTH ADDING card opens on one stranger instead of five, with a "See N more" button that reveals the rest in place. Tapping a friend's card beside the featured one in the fan now brings that friend to the front, instead of opening whichever friend was already featured. And a cheer toast whose phrase has an apostrophe ("You're crushing it!") reads with a real apostrophe instead of the literal escaped entity.

10. PROOF: unit.test.js (R-offseam-2a, R-offseam-2b, R-claimhyg-1), purchase-firewall.mjs, reward-sop-audit.mjs (COVERAGE, buyRackItem and awardDayCloseIfDue paying-site counts, quest/questAll live rows) | REACH: Three payout paths got the same fix: a crash or a rejected write between paying and receiving no longer leaves you half-charged. Buying a rack piece now lands the spend and the grant together, so a crash in between costs nothing and a retry after reopening charges exactly one price. The day-close crate that rides with yesterday's bonus now lands with that claim in one step, so it can no longer be banked as XP with the crate lost for good. And claiming a daily, weekly or monthly quest, or the all-three bonus crate, no longer risks reading as claimed while paying nothing: the whole payout lands in the same step as the claim, so a failed write takes nothing with it and a retry pays in full.

11. PROOF: unit.test.js (R-offseam-3) | REACH: Reconnecting (or reopening the app) right as a friends/profile sync attempt failed used to mark that sync as "just tried" even though it never got anywhere, so the next open inside five minutes silently gave up instead of retrying. A failed attempt no longer starts that five-minute wait; the very next open tries again for real.

## crew activity (2026-09-05)

Branch `feat/crew-activity-signal`, not yet stamped to a release. Round 35's
remaining Crew tickets: CREW-3 (a new player's first race), CREW-4 (a friend's
play is invisible), CREW-5 (the badge only counts other people), CREW-6 (the
week close is silent), CREW-13 (spires have no surface on the tab), CREW-14
(a stranger's empty stats produce "Jab ~NaN dmg").

1. PROOF: unit.test.js (raceStanding: an 11th-place rookie / a rank far outside the visible board / 1st place is never behind anyone, each proven red by reverting the gap back to "against first") | REACH: A new player's race summary now measures the gap to the racer directly above them, never to whoever is first; if that racer is not even visible (a true 40th, say), no gap is shown at all rather than a huge one against a stranger. The minutes estimate on the card is dropped once it passes an hour, and on your first-ever week the card says "Your first race. N friends are in it." instead of any gap.
2. PROOF: crew-activity-audit.mjs (CREW-4 rows, proved red by dropping the sinceMap wiring in paintFan) | REACH: A friend's card now says the one thing that changed since you last looked -- leveled up, new gear, took a spire -- and stays silent when nothing did. Nothing is invented on the first time you ever see a friend: there is nothing to compare against yet.
3. PROOF: crew-activity-audit.mjs (CREW-5 rows) | REACH: The Crew badge now also lights up when YOUR OWN race rank improves overnight, not only for cheers, gifts and requests other people sent you.
4. PROOF: unit.test.js (raceClockLabel, proved red at the `msLeft <= 0` threshold), server/test/api.test.mjs ("a non-podium finisher still gets told where they placed", proved red by disabling the settlement loop) | REACH: The step race card says "settles tonight" for the whole final day instead of never saying it at all; the News row about the race says the purse pays five, not three; and everyone who raced last week, not only the top 5, gets a boot notice naming where they finished, once the week settles.
5. PROOF: crew-activity-audit.mjs (CREW-13 rows) | REACH: A friend's card and profile show a compact "Holds N spires" line, with a one-line "beat their defender to take one" on the profile, where nothing about spires showed up anywhere on the Crew tab before.
6. PROOF: unit.test.js (hasFightableStats, proved red by relaxing it to `!!stats`), crew-activity-audit.mjs (CREW-14 rows) | REACH: A friend or stranger whose stats never synced now shows "Their stats will show once they next open the app" instead of five zero-width bars, and offers no Battle button that would otherwise start a fight with no real numbers behind it.

## perf grid and map (2026-09-05)

Branch `perf/grid-and-map`, off `integ/day3`. Round 34 perf lane, two items,
both measured with `scratchpad/r34/perf/perf-drive.mjs` at CPU 4x, 3 runs,
medians (a driver row, not a browser-gate audit, per this round's brief).

1. PROOF: wardrobe-family-grid-audit.mjs, football-tile-crop-audit.mjs,
   memory-census.mjs (wardrobe row, all green), MANUAL medians from
   perf-drive.mjs `wardrobe` mode, hoarder account (185 owned hats), CPU 4x,
   opening the Wardrobe's hat slot: main-thread script time 166ms -> 73ms
   (Performance.getMetrics ScriptDuration), longtask count 3 -> 2, longtask
   total duration 250ms -> 186ms. memory-census's own OFF-DOM concurrent
   bitmap row (a stricter, unthrottled instrument) fell from ~12.2 MB to
   9.3 MB with the fix, TIER stayed 100% trim / 0 masters (292 bh images
   sampled). | REACH: Wardrobe, any slot with enough colourways to fill more
   than a couple of screens (Hat on a collector account is the extreme
   case). Opening the slot no longer decodes and paints every collected
   tile at once; a canvas paints once it is on screen or about to be
   (one `.screen`-height of scroll margin on both sides), and a tile
   scrolled straight past without lingering never pays for a decode it
   would never show. The family rail, the equipped ring, and the football
   tint painting are unaffected (all three guards above exercise them
   directly and stay green).
2. PROOF: NONE, stopped before writing code; MANUAL cost measured with
   perf-drive.mjs `boneyard` mode, CPU 4x, 3 runs: a single Boneyard
   revisit (Today -> Boneyard, map destroyed and rebuilt) costs a median
   1,089ms of longtask time across 5 tasks, the longest at 462ms
   (medians of runs at 823/1,267/1,089ms total). | REACH: not shipped.
   `js/app.js`'s own comments on `holdOutgoing`/`screenCleanup` (the code
   the task pointed at) say the map's teardown on every navigation away
   from the Boneyard is deliberate, not an oversight: the "held outgoing
   copy" mechanism already exists to hide the visual cut and explicitly
   still runs the real `map.remove()` a moment later, because leaving one
   map instance's destructor pointed at a DIFFERENT live map after a fast
   Boneyard -> Today -> Boneyard is the exact bug that comment names.
   All six marker sets (spawn, den, mini, secret, wanderer, spire) and
   their poll timers and DOM listeners live inside `renderBoneyard`'s
   single per-mount closure (~1,500 lines), by design; keeping the map
   alive across visits means lifting that state to module scope and
   turning `route()`'s wholesale `#screen` rebuild into a targeted
   reattach for one screen only, which is a rewrite of the Boneyard's
   lifecycle, not a surgical fix. None of the three named guards
   (boneyard-audit.mjs, marker-anchor-audit.mjs, spawn-quiet-audit.mjs)
   drive a repeated leave-and-return cycle, so a persistence bug (a
   doubled listener, a marker left in the wrong place after a long time
   away, a stale follow-cam lock) would ship undetected. Stopping here
   rather than rearchitecting the screen on a guess; the 1-2s cost is
   real and measured above but unaddressed.

## v474

1. PROOF: unit.test.js, football-kit-audit.mjs, MANUAL measured off the rendered Shop screen (buy buttons and the team picker read 40px tall, up from 35.5px and 36px; a buy button below your balance stays enabled and pressable, and a tap answers with the coin shortfall) | REACH: The Locker Room shelf sells five football pieces, a helmet, a jersey, cleats and a matching helmet and jersey for the lizard, each 4,200 coins and yours in all 32 team colours the moment you buy it. Buying the full kit after already owning some of its five pieces charges only for what is missing, never more than the flat 16,800 kit price, and the "you save" line only appears when there really is a saving. Every buy button on the shelf is a full-size tap target, and one you cannot yet afford still responds to a tap and names the shortfall instead of going dead.

2. PROOF: wardrobe-family-audit.mjs (gate-registered PURE), wardrobe-family-grid-audit.mjs, memory-census.mjs | REACH: Your Collection and the Stable now collapse every colourway family, the football kit's 32 teams included, and any hand-drawn recolour series, into one tile per drawing with a count badge, the same rule the Wardrobe's own rail already used. A tap opens the rail to every colour you own.

3. PROOF: unit.test.js | REACH: An outright cosmetic purchase on the rack costs about double what it did, in coins and in Bone Dust alike. Your very first Common piece is held at its old price, so a new player's early days play out exactly as they did before.

4. PROOF: unit.test.js, loot-fallback-audit.mjs | REACH: Opening a crate can now hand you a cosmetic you already own instead of always being something new, so the rack above Common has something left to sell you; a duplicate still pays the same coins it always did. Also, a day you logged but missed your calorie budget on no longer comes with a bonus crate, though it still pays the same XP for logging it.

5. PROOF: lapse-witness-audit.mjs (gate-registered PURE), unit.test.js | REACH: Coming back after a gap of more than a week used to lose a race against a day-guard check the app was still waiting on, so the Bone Crate earned on your last logged day silently never paid. Day close now waits for that check before deciding, and a restore can no longer roll your day ceiling backward either.

6. PROOF: restore-latch-audit.mjs (gate-registered PURE), unit.test.js | REACH: Every fresh install used to restore its own cloud backup back over itself on its second open, undoing whatever the player had already spent: an opened crate reappeared and spent coins were quietly refunded. That is now closed two ways: the device that just created its cloud account no longer runs that pull at all (there is nothing on the server older or newer than what it just pushed), and even a forced merge of an older backup can no longer bring back a crate this device already opened or hand back a coin balance the device has since moved past. A genuine restore onto a different or reinstalled device is unaffected and still pulls its real backup in full.

7. PROOF: NONE in the browser gate, and this row says so rather than implying one: the change is Worker code, so its evidence is the server test suite the deploy runs before each push, not a browser audit. Proved red on the pre-fix server (the settler, in second place last week, was paid nothing) and green after. | REACH: The weekly step race pays the place you actually finished even if you opened the app right as the week rolled over; before, that rollover could erase your own spot on the old week's board a request before it paid out. Server half switches on at the next Worker deploy.

8. PROOF: unit.test.js, fight-tray-audit.mjs, fight-hint-audit.mjs | REACH: The Pit's move tray shows what a move costs as its own line in the button's corner, instead of folding it into the hint text, which used to wrap onto a second line and push the tray's third row off the bottom of the screen.

9. PROOF: dead-shell-audit.mjs | REACH: On a slow connection, the dead-shell watchdog no longer reloads the app while js/app.js is still downloading. It now waits for the module script to settle (load or error) before arming its 12s check, so a genuinely dead shell still recovers on the same schedule, but a merely slow one is no longer reloaded mid-download.

10. PROOF: meal-memory-audit.mjs (MYFOODS_NEW) | REACH: Add Food, pick a meal, tap My foods, tap Create a food: the portion screen you land on keeps the meal you picked instead of jumping back to Breakfast.

11. PROOF: input-validation-audit.mjs (QTY-COMMA) | REACH: On the portion screen, typing a thousands-comma amount like "1,234" into Servings is still refused, and now the field and the preview agree about it: the box keeps showing what you typed and the preview goes blank, instead of the box quietly showing "0.25" next to a preview still reading "0 kcal".

12. PROOF: unit.test.js | REACH: Logging a forgotten meal onto a past day (the day's Add sheet, a relog, Quick add) no longer pays XP, a streak milestone, or a badge. Past days stay fully editable (an existing entry there still saves after being edited), but only a log dated today earns a reward. Gwart's line on a past day no longer claims the day is "finished"; it now says the day is open to fix, just unpaid.

13. PROOF: football-render-audit.mjs (STAGE, proved red on the unfixed code) | REACH: Open your Bonehead's Backpack or Build tab with a lizard equipped and its helmet and jersey worn: the lizard on the big portrait now wears them too, tinted to your team, instead of the bare species art. True for the base lizard, its shiny, and the Day One Lizard alike.

14. PROOF: unit.test.js, football-kit-audit.mjs | REACH: Buying the full football kit at the same time as buying one of its garments separately (two overlapping taps) no longer overcharges. The kit bundle now re-checks what it actually delivered after an overlapping single-garment buy lands, and refunds the difference, so a player is never charged for a garment the bundle didn't end up needing to grant.

15. PROOF: a11y-audit.mjs (foodFieldNames) | REACH: A screen reader creating a custom food, or using Quick add, now hears each number field by name (Calories, Protein, Carbs, Fat, Sodium, Grams, and so on) instead of an unlabelled textbox, or three identical fields for Protein, Carbs and Fat.

## stable collapse (2026-09-05)

Not stamped to a release. Tom, on v476: "you gotta scroll past all the helmet colours before you get to the shirt. it should be two items then colours below just like the boneheadz wardrobe" and "the stable is overwhelming with too much of the same pet ... scrolling past 50 bulldogs to get to the lizard".

1. PROOF: football-render-audit.mjs (SHELF, SHELF-TEAM, proved red on v476) | REACH: In the Stable, a lizard's wardrobe now shows one tile per garment (helmet, jersey) with a rail of the 32 team colours underneath, the same shape as your Bonehead's Wardrobe. Tapping a team recolours whatever football piece she has on; with nothing on, it picks the team the next garment tap wears.

2. PROOF: pet-ownership-audit.mjs (COLLAPSE, COLLAPSE-COUNT, COLLAPSE-REACH, proved red on v476) | REACH: The Stable ring shows one card per kind of pet, not one per copy. Twelve Bulldogs are one card with a "×12" badge, and the lizard is one swipe away. A row under the focused card lists that kind's copies (name, level, shiny, which one is out) so you can step through them, breed, dress or destroy any one of them without leaving the ring.
## dressing room families (2026-09-06)

Tom, live on v476: "the colour picker in the wardrobe works well but down in the
transmog mirror section it's individually listing every single cleat/shirt etc as
its own thing without a colour picker". Nothing about the price, the paid-once
rule or the arm-then-confirm flow moved; every row of transmog-clarity-audit and
transmog-receipt-audit still grades them. dressing-room-audit's FAMILY and RAIL
rows were proved red against v477's js/app.js (35 tiles for 33 looks, no family
tile) and its OWN rows by mutation (the own-look branch deleting the slot instead
of restoring it).

1. PROOF: dressing-room-audit.mjs | REACH: Open your Bonehead, Wardrobe, tap a gear slot you own football garments for. The look picker now shows one tile per garment with its colourway count, the same as the fit grid above it, instead of one tile per team. Tap it and the team rail opens; tap a team and that colourway is the look being tried, drawn on the After figure and named in the bar. The tile paints the team you are trying, and the one you wear when nothing is being tried.

2. PROOF: dressing-room-audit.mjs | REACH: With a look applied over a gear piece, tap "Its own look" in Hat, Top, Pants, Shoes or Feet: the After figure draws that gear's own art, and Wear it puts it on the big stage with the disguise gone. Tom's "shows the sock" report did not reproduce on a healthy network; a layer that fails to load degrades to the default by design.

3. PROOF: dressing-room-audit.mjs | REACH: With a football garment worn (so the fit grid's team bar is showing above the Dressing Room), tapping a look no longer swaps that team bar for a second "You keep / You get / You pay" bar while the real one at the bottom keeps the old text. The bottom bar updates and the team bar stays. Not named in the brief; found in the after-rail screenshot, and it was live on v477.

## claim hygiene (2026-09-05)

Not stamped to a release: the quest-claim row folded into v475 above; the
welcome-kit row below did not make this changelog and stays here unpromoted.

1. PROOF: unit.test.js (R-claimhyg-2) | REACH: Opening the app on two devices (or two tabs) at the exact moment a brand-new account first boots no longer doubles the welcome kit. Only one welcome kit (2 crates, a Vigor Draught, the starter ingredients, and the starter egg) is ever granted per install, however many boots race to claim it.

## stage pet wear (2026-09-05)

1. PROOF: football-render-audit.mjs (STAGE, proved red on the unfixed code) | REACH: Open your Bonehead's Backpack or Build tab with a lizard equipped and its helmet and jersey worn: the lizard on the big portrait now wears them too, tinted to your team, instead of the bare species art. True for the base lizard, its shiny, and the Day One Lizard alike.

## store build (2026-09-05)

1. PROOF: store-copy-lint.mjs, unit.test.js | REACH: The App Store archive has no internal-distribution invitation, thank-you strip, invitation News item, testing update copy, or Settings diagnostics. Web and internal builds keep those feedback routes.

## r34 backup version (2026-09-05)

1. PROOF: backup-conflict-audit.mjs (gate-registered PURE), api.test.mjs (local Worker) | REACH: Two devices that edit from the same cloud backup no longer overwrite each other. The stale device pulls the winner, merges both saves, and retries once.

## gate-13 audit fixes (2026-09-05)

1. PROOF: shell-watchdog-audit.mjs | REACH: NONE beyond what dead-shell-audit.mjs (a real-browser audit) already reaches: this closes a gap in the test's own fake DOM, which had stopped modelling the watchdog's script-load gate and was passing without ever running an assertion. No app behaviour changed.

2. PROOF: news-banner-audit.mjs | REACH: The News banner's row icons on Today size and centre correctly the first time you open the banner, every time, instead of an even coin flip between a correct icon and one still at its native, oversized, off-centre size.

## sw upgrade audit (2026-09-05)

Not stamped to a release; audit-only, no player behaviour changed. Branch
`fix/sw-upgrade-audit-v473` re-premised four rows of tests/sw-upgrade-audit.mjs
that still pinned the pre-v473 "a new build always waits until every client of
the old worker closes" rule. v473 (commit 63367157) added `letItIn()`, which
posts SKIP_WAITING to a waiting worker at boot, on install, and on
`closeTopSheet()`; the four rows (SECOND OPEN, KILLSWITCH, SHEET CLOSED, and
the APP_UPDATE_ANCHOR string the NO_APP_UPDATE prove-red mutation matches
against) were failing on both v473 and v474 because they still expected the
old, superseded behaviour. Re-premised to assert the letItIn ruling instead.

1. PROOF: sw-upgrade-audit.mjs | REACH: NONE beyond what v473 already shipped and reached: this closes a gap in the audit's own premise, which still graded the pre-v473 rule and was failing (for the wrong reason) on live behaviour that has worked since v473. No app behaviour changed by this fix.

## shop front door (2026-09-05)

Not stamped to a release: rows 1-4 folded into v475 above. Row 5 below did not
make this changelog (no live surface renders the banner it fixes) and stays
here unpromoted.

1. PROOF: shop-door-audit.mjs (DOOR-SHAPE, DOOR-VIEWPORT, DOOR-ROUTE) | GATED: no live surface renders this banner. The Today teaser banner (cosmeticTeaserBannerHtml) these two rows fix is only ever called from outThereHtml, and nothing has called outThereHtml since Tom retired the "Out there today" card from Today on 2026-08-21 (tests/out-there-audit.mjs, skipped in the gate, says so in its own skip reason) -- the round-36 handoff's S9 finding predates that retirement and is stale against this tree. The button and its delegated click listener are real, shipped code, proven through the same webdriver-only hook (__teaserBanner) the app already exposes for this card's unreachable sibling bestiaryBannerHtml (__todayRow), but no player reaches it until the card, or this banner specifically, is revived. Not a player-facing claim until then.

## crew layout (2026-09-05)

Not stamped to a release: rows 1-4 folded into v475 above. Row 5 below did not
make this changelog (the copy path it fixes was not in scope) and stays here
unpromoted.

1. PROOF: NONE in the browser gate; this is copy on a 403 branch of a coin-gift and free-gift send that unit.test.js and the browser audits do not drive, so the row says so rather than implying one. Measured live in round 34's SOCIAL lane (a real 403 from a real Worker after one player deleted their account). | REACH: Sending a gift to someone no longer in your Crew now says "They're not in your Crew any more" instead of the generic "Could not send. Try again" that sent the player around a loop that could never succeed.

## kennel phase A (2026-09-05)

Not yet released (WIP on feat/kennel-phase-a, no version bump). Recorded here per the branch's own audit trail, not as a shipped claim.

1. PROOF: unit.test.js (KENNEL rollMorph rows, KENNEL hatchEgg rows, KENNEL addPetInstance rows, KENNEL sim rows), pet-pool-audit.mjs (rewritten SPLIT/NEVER/DUPE-POOL rows), pet-morph-audit.mjs (real-browser, pixel-sampled) | REACH: Every step egg now hatches into one of five colourways (base, Ember, Frost, Toxic, Midnight) alongside its species, decided when the egg is granted and revealed on hatch: "A Frost Bulldog." for a fresh (species, colour) pair, "ANOTHER ONE!" only when you already have that exact pair. The colour is a pure cosmetic recolour of the same art (no new artwork, never touches a pet's stats), applied everywhere that pet is drawn: Today's hero, the Stable, the hatch reveal, the breed picker and reveal, Crew, a friend's profile and paddock, the leaderboard, and your own pet in the Pit. A shiny pet is always its base colour, and Bumbleseal's worn accessories never take the tint. The egg's own shell in your Backpack carries a hint of the colour inside, with no name given away before it hatches. Also fixed in the same pass: duplicate eggs used to never hand back the Catfish or the Beardie (both Common-rarity pets), silently narrowing the dupe pool to three species instead of five; they are back in the pool.
2. PROOF: NONE beyond unit.test.js's own sim rows: this is an internal fix to the colour-roll, not a player-facing claim of its own | REACH: n/a -- found and fixed while proving the row above. The colour roll originally weighed Bumbleseal (a 1%, mostly shop-bought pet) into the same "which colours has this player never seen" accounting as the five ordinary hatch species, which kept the plain, uncoloured look permanently favoured for almost every player and starved the other four colours of a fair shot at showing up. Scoped to the five ordinary species instead.

## kennel palettes (2026-09-05)

Not yet released (WIP on feat/kennel-palettes, no version bump). Recorded here per the branch's own audit trail, not as a shipped claim.

1. PROOF: unit.test.js (KENNEL MORPH_ART rows, KENNEL Bumbleseal hatch-share row), pet-morph-audit.mjs (real-browser, pixel-sampled, ink diffed against the served files) | REACH: A pet's colourway is now a hand-recolored variant of that species' own drawing, not one shared filter stretched over all six -- the fix for a colour reading wrong on a specific species (Ember used to read blue on the Beardie because a single rotation lands somewhere different depending on what colour the art started as; every colour now targets the same absolute hue on every species). Wherever a coloured pet is drawn -- Today's hero, the Stable, the hatch reveal, the breed picker and reveal, Crew, a friend's profile and paddock, the leaderboard, your own pet in the Pit, and the shop's try-on rack -- the outline ink is untouched pixel-for-pixel and a shiny is always its base colour. One trade: while coloured, the three pets that normally move (the cloud, the catfish, the lizard) hold still and show their static art instead, the same trade already accepted for the football kit.
2. PROOF: unit.test.js (KENNEL rollMorph fresh-first row for C6, KENNEL sim row, pet-pool-audit.mjs SAMPLE/SPLIT rows) | REACH: Bumbleseal now hatches from a step egg at the same odds as every other species instead of a rare 1% pull. She still sells in Gwart's Menagerie for the same 50,000 coins, and her five accessories are unchanged, cash-shop-only.
3. RESOLVED, see "kennel v2 recolour" below: the three provisional midnight luminance tiers this row described were never a shipped claim, and are gone (one midnight now).

## kennel v2 recolour (2026-09-06)

Not yet released (WIP on art/kennel-v2-wire, no version bump). Recorded here per the branch's own audit trail, not as a shipped claim.

1. PROOF: unit.test.js (KENNEL rows re-premised for one midnight file per species), pet-morph-audit.mjs, pet-pool-audit.mjs, kennel-audit.mjs (all re-run against the new art) | REACH: Tom approved the pet colourway art itself ("now this is quality work. approved.") and it replaces the placeholder recolour: every fill region is remapped to an absolute target hue per morph with Cam's outline ink, eye-whites and cream highlights kept byte-identical, rather than one shared filter guess. The undecided midnight brightness question above is resolved by shipping a single midnight look instead of three candidates.

## kennel ui (2026-09-05)

Not yet released (WIP on feat/kennel-ui, off feat/kennel-phase-a, no version bump). Recorded here per the branch's own audit trail, not as a shipped claim.

1. PROOF: kennel-audit.mjs (real-browser, gate-registered) | REACH: The Stable's header now carries a Kennel button, next to Done. It opens a new screen with two parts: a roster of every species you own, one row each with a set of dots showing which of the five colourways you have found for it, and a 30-cell collection grid (six species by five colourways -- Bumbleseal counts as a normal species now, not the exclusive she used to be treated as for this purpose) where a cell you own shows the pet in colour and a cell you have not found yet shows a dimmed, locked silhouette of the plain species, never a broken image. Tapping a dot names what it is: the colourway and species if you have it, "Not hatched yet." if you do not. A line from Gwart under the roster says plainly that the colours are cosmetic and never touch a pet's stats. The roster fits on screen with no scrolling even with all six species owned, on the smallest supported phone. Filling the grid earns nothing yet.

## v473

1. PROOF: unit.test.js (gate-registered PURE), "a downloaded build can actually start: boot posts SKIP_WAITING to a waiting worker". Proven red on the tree that shipped v472: "nothing in the app tells a waiting worker to take over, so a downloaded build can never start". The defect it closes was measured on a real device, not modelled: a phone sat on v470 through repeated force quits while the server served v472, because the service worker deliberately never calls skipWaiting() and nothing had ever posted the message that lets a waiting worker in. | REACH: Open the app after a release. It reloads into the new build by itself instead of staying on the old one. A device already stuck before v473 cannot be rescued by it and needs a reinstall.

## v472

1. PROOF: unit.test.js (gate-registered PURE), "SW update checks bypass the HTTP cache", asserting register() passes updateViaCache: 'none'. Proven red on v471. GitHub Pages serves the worker script with max-age=600, so for ten minutes after a deploy the update check was answered from the device's own stale copy. NOTE: this shipped believing it was the whole fix; it was not, and v473 is the rest of it. | REACH: Nothing to see directly. It is why a new build is noticed promptly instead of up to ten minutes late.

## v470

1. PROOF: MANUAL, browser-verified through the real Pit door on all three exits: quit mid-fight and reopen shows the open fight, lose and reopen shows the defeat panel, finish and reopen shows a clean Pit. The stake ledger sites are registered in reward-sop-audit.mjs (gate-registered), proven red on an unregistered paying site. | REACH: Any staked Pit mode. Kill the app mid-fight and reopen: the fight is where you left it and your charge is spent exactly once.

2. PROOF: MANUAL plus the deploy gate (not a browser-gate audit, which is why this row says so): seven new rows in the server api test suite (delete removes the player from a friend's list, backup 404s afterward, off the step board with a non-empty control, re-delete answers ok, a wrong key gets 401 and the account survives), green in the pre-deploy run that shipped the route live; the typed-confirm flow was operated headlessly end to end by its builder, including the offline abort that wipes nothing. | REACH: Settings, Delete account and cloud data, type DELETE. Online only; a failed server call leaves everything intact.

3. PROOF: MANUAL, driven tonight with a real 86 KB export: fed through the new onboarding file door on a fresh profile, onboarding exits through the same shell latch as settings-save, the tab bar is alive (a Crew tap really routes), and the toast read "Restored 166 log entries and 22 weigh-ins" with zero-count stores omitted. The latch extraction also fixes a latent dead shell on the cloud-restore exit. | REACH: Welcome screen, Played before, Restore from a backup file. Also any Settings import now lands on Today.

4. PROOF: MANUAL, full lifecycle driven: a three-day gap with logging history shows the card with only true facts (a finished weekly, real crate count), dismiss removes it, and a zero-gap reload never shows it. No day count anywhere in the copy; the voice rule comes from the Hollow gardener's own comment. | REACH: Return after two or more days away with any logging history; one card at the top of Today, once.

5. PROOF: den-ceiling-audit.mjs (gate-registered) gained REMOTE-PAYS-NOTHING, green on this build (carried 48, wallet delta 0) and proven red on the reverted bug (delta 48): the settle is the single payer, so a win banks exactly its banner. The header repaint is wired at both settle payers; its end-to-end fight drive is queued behind the machine's capture health. | REACH: Win the daily remote den: the banner amount is the bank amount. Coin count on the day updates when a fight pays.

6. PROOF: MANUAL, driven: the tab-bar crate badge tracked the store exactly (2 at boot, 4 after two grants, identical to what the crates tab renders) because both read one function; the claim tag copy change rides the pre-existing gate-registered quest badge machinery. | REACH: Any unopened crates show as a count on the Bonehead tab; a finished unclaimed weekly says "ready to claim" on the collapsed header.

7. PROOF: MANUAL: the legend is position-free seeded markup (the same map key the live map renders), included by the denial branch; the Retry width is arithmetic (width calc 100 percent minus the two 16px margins that measured 391 of 375 before). | REACH: Boneyard with location denied or offline, any phone width.

8. PROOF: MANUAL: meal memory stores the day key with the meal, so it expires at midnight by construction; the manual walk writes wellness minutes and never the step field, registered in reward-sop-audit.mjs (gate-registered) with the two-a-day cap in the write path. | REACH: Log a meal, log again the same day: the picker remembers. No Health connected: an Add a walk row on Today.

9. PROOF: MANUAL: the note renders from the same questState the badges read, gated on three or fewer days remaining AND nonzero monthly progress, both computed from state in hand at render. | REACH: The monthly quest header, in the last three days of any month, for players mid-progress.

10. PROOF: MANUAL, root-caused in source: talent sections rendered with expansion DERIVED from points-in-tree and re-rendered wholesale on every spend, so collapsed sections snapped open under the finger, and refused nodes carried the disabled attribute, structurally silent. Expansion now persists in a quiet kv and every refused tap toasts its exact reason; the talent badge suite was updated for the new selector. Browser drive queued in the branch's VERIFY. | REACH: The talent screen: sections stay as you left them across visits and reloads, and every tap either spends or says why not.

11. PROOF: MANUAL, root-caused in source: Retry leaked one WebGL context and one live world timer per tap (nothing tore the old map down), which is also the console TypeError stream; the boot now tears down first, bounds the load at 25 seconds, and floors persistent tile failure into the labeled card with the map key. Browser drive with tile-host blocking queued in the branch's VERIFY. | REACH: The Boneyard, any time the network or tiles fail: a labeled screen with a Retry that actually retries, never an infinite loading line.

12. PROOF: MANUAL, root-caused in source: the Fight tap trusted a distance computed at render time, so it started fights from 600 meters; it now recomputes from the freshest position fix and refuses beyond 1.5x the trigger radius, the prompt withdraws as you walk away, and the fight-exit close now clears the whole sheet stack on loss exactly as on win, verified compatible with the fight-exit audit's own source slice. | REACH: Map boss encounters: fight in range or be told to walk back; no stale sheets after any outcome.

13. PROOF: MANUAL, proven in source by grep: nothing writes the xp type the boss counters read since the den rework, so m-boss, w-boss and the den badges have paid nobody; the counters now read the rows den wins actually write (landmark, remote and roaming), with the roaming Wanderer deliberately excluded per the 2026-08-21 ruling pinned in the wanderer audit. | REACH: Boss quests and den badges count from your existing ledger the moment this build loads; past wins are honored retroactively.

14. PROOF: MANUAL: the pre-spent line renders only when today sits strictly behind the day high water (equal is every normal day, reasoned in the code comment); the streak pill gained the same one-day grace the paying streak function always had, display only; the ahead-of-clock marker is pure render. The guard's decisions are untouched, asserted by reading the diff: no award path changed in the voice commit. | REACH: Set your clock back or fly west and the silent day explains itself; mornings before the first log show your real streak.

15. PROOF: MANUAL, each verified in source first: the champion grant really pays the Moonlit Skull plus the title (the row claimed the retired Bonecrusher), the ladder cap really is level-scaled (the copy said forever), and every pit win really pays the universal bonus the rows now include. | REACH: The Pit's champion row, the Gauntlet header, and every ladder row.

16. PROOF: MANUAL: the reveal routes the premium purchase through the existing celebration machinery with the pet's own art (call site registered in the figure audit); the typed confirm reuses the Erase sheet and arms only for a last-copy shop or legendary pet, dupes keep the light arm; keeper chips carry level, lineage, shiny and KEPT or FED. Browser drive queued. | REACH: Buying, destroying, or breeding around a premium pet.

17. PROOF: MANUAL: lockedCardHtml carried the founder line for every species; three honest flavors now, and only the Lizard's is a closed door. | REACH: Any locked pet card in the Paddock.

18. PROOF: rack-rotate-audit.mjs (gate-registered) gained CURVE, DISTINCT, N0 and WEEK-IDENTITY rows, green on this tree and proven red on a non-monotone ladder and on a themed-nine redraw in a throwaway; the free first roll is pinned by CURVE. The dust egg follows the receipt-before-debit pattern with a granted-flag recovery, registered in reward-sop-audit.mjs and its own dust-egg-audit.mjs (declared in the gate, first execution happens in that gate). | REACH: The Shop: reroll the rotating shelf, first free then rising to a cap; the Mystery Egg, 60 Bone Dust, once a week. Dust buying an egg is Tom's 2026-08-31 ruling, pet significance being hard-capped.

19. PROOF: MANUAL: the Go Online catch mirrors the sibling call site's shipped pattern with an offline-aware message; the back arrow clearance was pixel-verified at 375 and 390 in the rendered app; the crate art fallback fires once per image and keeps name and rarity; the two pluralization strings were rendered and read; the onboarding resume was reproduced broken (reload landed on the first screen) and driven fixed (reload lands on THE PLAN with the same skeleton name on both sides of the quit). | REACH: Airplane-mode Go Online resets with a message; onboarding titles clear the arrow on small phones; a slow-loading crate reveal reads "Art on its way" instead of a broken glyph; quitting mid-onboarding resumes at the same step with the same pick.

20. PROOF: purchase-firewall.mjs and t3-audit.mjs (both already gate-registered), extended rather than duplicated, driven against real IndexedDB through the real functions and proven red on a cp -R copy of the pre-fix tree with the CONTROL rows green there. A CENSUS found six read-then-debit sites, not the two reported: measured before, three overlapping shop buys on 90 coins granted 3 items for 90; four taps on a 3,000-coin cosmetic with 7,000 coins took the WHOLE 7,000 for one item (the zero clamp absorbs the overdraft, so it is worse than the double-charge that was reported); two different rack pieces on a 3,000 wallet kept both and handed over 2,400 free; two pet accessories handed over 6,000 free; the same 12-dust transmog applied twice took 24. After, every row pays exactly once for exactly what it delivers. The primitive is spendCoins/spendDust deciding affordability and debiting inside ONE kvUpdate transaction, so a refused spend leaves the balance byte-identical (verified in js/db.js: kvUpdate skips the write entirely when its updater returns undefined). markPaid was itself a lost update and is now an atomic claim that reports whether it banked the key, which is what lets applyTransmog use the receipt it already had instead of inventing a key namespace. The arm-to-confirm guard's restore() moved below its await behind a latch. reward-sop-audit re-graded, including three authority strings that documented a receipt-before-debit ordering the code no longer has. | REACH: Every purchase in the game, coins and dust. You are charged once for what you get, an unaffordable purchase changes nothing, and a look you have paid for is never charged again.

21. PROOF: honest-surfaces-audit.mjs (gate-registered, full tier), 24 rows each comparing two RENDERED states with non-empty samples, proven red 12 of 24 on a cp -R copy with every control green. Rendered strings captured against a real non-demo boot with a stubbed PUT: a 413 renders "Backup is blocked: this save has outgrown its slot on the server ... Your progress is safe on this phone" and a skewed clock renders "this device's clock is 3 days ahead", where all three cases previously rendered the identical healthy line "On, last backup just now". The streak pill went from "56 day streak" to "400 day streak" on a 400-day seed with a 12-day control unchanged on both trees; it now reads through the same streakFrom the payouts use, and the module that pays streak milestones is untouched (verified: zero diff lines in it), so display and payout can no longer disagree on the cap. /health stays unsigned and ungated so the day-guard witness ceiling keeps being fed while signed traffic is dark. | REACH: Anyone whose backup is failing, anyone whose device clock is wrong, and every long-term player's streak number.

22. PROOF: a11y-audit.mjs (gate-registered FAST), 0 failures on the clean tree and proven red 78 rows on a cp -R copy of pre-fix code carrying the identical audit file, with all three CONTROL rows green there. Tap targets were measured as REAL HIT AREA via elementFromPoint rather than bounding boxes, which is load-bearing: the fix carries the hit area on a transparent ::before so the visible box is unchanged, and a getBoundingClientRect assertion would have FAILED a correct fix. Wallet chips went from 26x16 to 45x45, day arrows and gear 38x39 to 44x45, quest Claim 56x28 to 56x44, shop price 59x26 to 59x45, all against Apple's 44pt floor. The toast blocked 3 of 3 tested doors and now blocks 0. Contrast: the range pill and fight chips 2.39:1 to 6.29:1 (independently recomputed by the reviewer at 6.292), the hype eye 3.08:1 to 7.32:1, --text-3 notes 4.64:1 to 5.51:1. Wardrobe tiles name their own tier in words, 0 of 4 to 4 of 4. Pit fight buttons carry distinct accessible names, 1 of 5 to 5 of 5. The toast live region exists at parse time instead of being attached in the tick its first message lands. Two of the agent's own fixes were caught by these checks and reverted before shipping, and a first version of the rarity row was VACUOUS (it passed on the broken tree) and was rewritten to ask whether each tile names its own tier. | REACH: Every player, and specifically anyone with low vision, colour-vision deficiency, a screen reader, or ordinary thumbs.

23. PROOF: NONE in the browser gate, and this row says so rather than implying one: the change is worker code, so its evidence is the server suite that the deploy gate runs, not a browser audit. That suite was extended and proven red first on a cp -R throwaway where the replay test failed 200 !== 401 and the gift test failed on duplicate === undefined; green after, with all server suites passing locally (api 59, spires 27, concurrency 10, security 24, recovery 14, admin-grant 40, retention 19, grants-retention 23, future-dates 2, schema-plan 18, zero failures). The replay test carries its own control, a re-signed identical body that must still land, so a guard that refused everything could not pass it. The nonce is ONE guard in verifySigned in front of every signed write rather than a per-route patch, stored in the existing rate_limits table, so there is no migration and no client change; a legitimate retry re-signs with a fresh timestamp (verified in the client's signed-fetch helper, which mints both per call) and is absorbed by the idempotency key instead. The spire clause folds the same-owner decision into the write on the same three bindings. NOT LIVE until the next worker deploy, and the spire race provably cannot be reproduced on the local engine (synchronous in-process SQLite serialises it), so that clause was verified by staging the post-takeover state and running both statements verbatim, which is stated rather than dressed up as a repro. | REACH: Cheers and gifts sent on a bad connection arrive once, and a captured signed request replays as nothing. Server half switches on at the next worker deploy.

24. PROOF: backup-encoder-audit.mjs (gate-registered in the PURE tier, so it runs on every gate), green on this tree and proven red on a copy of the pre-fix encoder where the three large rows fail with RangeError while every small and chunk-boundary control stays green, which is the exact shape of the shipped bug (small saves fine, mature saves dead). The audit asserts the PROPERTY rather than a byte threshold on purpose: the limit is the CALL STACK, not a fixed argument cap, measured at 109,841 bytes under node here against the reporter's 124,385 in Chromium, so a number would pass on one runtime and lie on another. Rows cover round-trip at 200KB, 1MB and 4MB, every chunk boundary, and a structural row so the spread form cannot return in review. The reporter independently proved the whole pipe healthy once encoded: the same 2MB ciphertext PUT in 97ms and pulled back byte-identical across all seven stores. | REACH: Every player whose save has grown past roughly a few weeks of heavy play, which is every long-term player. Their cloud backup had been failing silently on every push path; it resumes on the next push. NOT fixed here: the blanket catch is still silent about a failed push, which is tracked separately.

25. PROOF: reward-sop-audit.mjs (gate-registered) gained a CEILING section that races DISTINCT keys against one shared ceiling, in both failing shapes: a shared COUNT (the quest cap seeded to cap-1, then cap distinct ids claimed at once) and a shared GATE (one Pit charge, three overlapping spends). The old suite raced the SAME key, which the per-item receipt protects by definition, which is why it missed this family for five rounds. Measured before on origin/main: the kitchen double-banked a finished dish 11 of 12 times across two real tabs on the shared storage, one Pit charge opened 2 arenas, and a weekly cap of 3 with one prior claim paid 4 (+450 coins, +210 XP, 2 golden crates, a Vigor Draught). After: 1, one arena for one charge, and exactly 3. Both halves of two fixes were proven independently load-bearing by ablation rather than assumed: claiming the cooking pot alone still carried one paid-for queue entry into two pots, and the atomic Pit spend without the button guard still opened two arenas. The quest cap reserves a numbered ledger row rather than a counter in storage, because a counter starts at zero on a restored save and would hand every existing player a fresh capful; the reservation rows are invisible to the count itself, which filters against the real quest-pool ids. The CONTROL rows earned their place on a mutant that lets exactly one extra claim through, which the ceiling rows pass perfectly. | REACH: The Kitchen, the Pit and the quest board, for anyone with two tabs open or an impatient thumb. A reward meant to happen once now happens once.

26. PROOF: ceremony-once-audit.mjs (new, gate-registered), which counts ceremonies off the live DOM by tagging each sheet so a SEQUENTIAL double is counted too, and reads the reward figure off the pill. Proven red on a copy of the pre-fix tree at 7 of 9 and green at 9 of 9 here, the reds being the food path opening 2 sheets and reporting a reward pair of 65 and 0. Measured through the real Quick add sheet 5 XP below a level: two sheets at +427ms showing +65 and +514ms showing +0, now one at +422ms showing +65, with a non-food level-up source still celebrating exactly once as its own control. The payout was never wrong and is untouched. One change beyond the obvious was required: the celebration queue held one pending ceremony PER CALL, so collapsing the level paths alone would have traded a double level sheet for a level sheet plus a badge sheet on the same log. | REACH: Levelling up by logging food, which is the most common way it happens. One celebration, naming the reward you actually got.

27. PROOF: MANUAL plus paddock-scene-audit.mjs and paddock-card-audit.mjs (both gate-registered), driven on a 21-pet roster at 430x932 in one page session, before and after. PACKING was the real finding and the root cause was not the band rule: walkers, floppers and hoverers each had their own packer and none could see the others, so the fourth of anything wrapped back onto the first. Measured before: 8 pairs overlapping more than 20px in BOTH axes, worst 66x96px (two Drizzles on one hover spot) and 59x46px (a Bulldog standing inside a Catfish). After: 0 offending pairs across 105, worst remaining overlap 18x18px. Rows are now 58px apart, which exceeds the 76px sprite minus the 20px the paid-for layout rule tolerates, so cross-row overlap is impossible by construction rather than by tuning. The keeper hitbox went from 4 of 25 sampled points opening a hidden pet's card to 0 of 25. The grid card moved from 142px edge-to-edge away from the tapped tile to 110px with the tile lit. Seven guards added or changed, every one comparing two RENDERED states rather than asserting markup exists, all proven red on a copy of the pre-fix tree. A follow-up commit gives hoverers and floppers a per-pet animation phase, measured 4 of 4 distinct: without it the new single sky row drifted and bobbed in lock-step, which the packing fix itself created. | REACH: The Paddock field, every player with more than a handful of pets.

28. PROOF: cloud-restore-silent-audit.mjs (gate-registered) gained an ADOPT section, 26 of 26 green on this tree and proven red on a throwaway copy of the pre-fix code with four discriminating rows: the failed register THREW rather than returning a reason, the device identity was already swapped when it did, and both one-shot rows showed the retry flag burned on a failure. The controls (the 404 case and the honest-copy rows, which pin the decrypt work rather than this) stayed green on both trees. The ordering fix is structural: the one network call that can refuse now runs first against the bundle and nothing local is written until it answers ok, so there is no rollback of a forced keychain overwrite to get wrong, which is the operation that destroyed a real account once. The cheer key's SQL was verified against real SQLite with the exact statement, including a pre-fix control that delivered two cheers for one tap. NOT YET LIVE ON THE SERVER: the client sends the key and the deployed worker ignores it until the next worker deploy, so cheers behave exactly as they do today until then. | REACH: Phrase restore and vault account switch, on any connection good enough to start and bad enough to drop. A cheer sent twice because the first answer never came arrives once, after the worker deploy.

29. PROOF: MANUAL, all nine driven in the real page at phone size with pets seeded through the game's own grant paths, each one measured on a clean baseline tree first and re-measured after: the bond pips went from five coral at bond 3 to three coral and two dark; a real click at the PET button's centre hit the coach pill and closed the card, and now hits the button and banks 2 to 3 hearts; the nest's own centre resolved to a flopped pet and now resolves to the nest; four slider dots hit-tested to the panel above them and now hit-test to themselves, with dot 3 moving the rail to copy 3; tapping the last of four copies opened copy 0 and now opens copy 3. paddock-card-audit.mjs (gate-registered) gained a row asserting a filled pip and an empty pip PAINT different colours, proven red on the pre-fix tree. The pre-existing hearts row asserted the icons were present, which was true throughout the bug, which is how it shipped. | REACH: The Paddock, every player. The affection meter now shows your real bond instead of showing every pet as fully bonded.

30. PROOF: gap-settle-audit.mjs (gate-registered, full tier), 18 rows including four controls, green on this tree and proven red on a throwaway copy of the pre-fix code with every control row green on both trees: the settle now falls back to the last logged day and pays EXACTLY one day however long the gap, an already-settled day pays nothing on a second open, a guard-refusing state pays nothing, and the plain-yesterday control still pays. The day-guard refusal now returns a named reason so the Claim button toasts it, with the guard's decision byte-for-byte unchanged; the only production caller was read and both audit predicates that scored a claim by truthiness were updated in the same commit, or a refusal would have scored as a payout. The streak reminder rows assert a dead streak schedules only the plain reminder, the legacy repeating schedule is cancelled, and a live streak arms one shot at a future time. | REACH: Anyone returning after two or more days away gets the crate their last logged day earned, with a toast that says last logged day rather than yesterday. Anyone offline past the day guard's ceiling gets told why Claim is paused instead of tapping a dead button. Anyone whose streak has ended stops getting the nightly reminder.

31. PROOF: backup-key-audit.mjs (gate-registered in the PURE tier, so it runs on every gate, not only full ones): 24 rows over the real social and db modules with a structured-clone-faithful storage shim and two devices as two databases, green on this tree and proven red 12 of 24 on a throwaway copy of the pre-fix code with the three merge controls staying green. The chain was read link by link in source before a line was written: the first push snapshotted storage before the key was minted, the merge path never consulted the device-private list, and a decrypt rejection was laundered into the generic failure string. | REACH: Anyone with cloud backup on, most of all anyone restoring by phrase onto a second device. A backup that cannot be decrypted now names that as the reason on the boot toast, the phrase restore and the vault adopt, and the server copy is left untouched so the device holding the good key heals it on its next daily push.

## v469

1. PROOF: onb-gwart-audit.mjs (gate-registered, 7 rows on a PLAIN-url fresh boot: portrait rect at size, box clear of the headline, both lines typed verbatim, funnel completes, shell latch intact; proven red by reintroducing the hero pin, which fails exactly the GWART and CLEAR rows). | REACH: Install fresh, or clear the app's data, and open it. Gwart is on the first screen and on the plan step. Existing players never see onboarding again, so this reaches new players only, which is the point.

2. PROOF: MANUAL, driven through the shipped thresholds by moving the target around the demo intake so the app's own hudPct computation picked each class: hud-low (no animation, no filter), hud-near (hudBreathe running, caught mid-breath at 0.553 alpha), hud-hit (the brighter stroke rgb(194,240,125) with the double glow), hud-over (the shipped amber with a quiet glow). Screenshots of all four states on file. The class is computed in the one shared calorieRingCard, so Today and Trends cannot disagree. | REACH: Open Today or Trends with any day in flight. Below 85 percent of target the ring is the calm lime it always was; from 85 percent it breathes; landing 100 to 107 percent charges it.

3. PROOF: MANUAL, the gap found by a static precache cross-reference and verified by hand: zero hits for anim/cloud in the service worker against a first-paint reference in the onboarding poster. Two entries added to the precache list. NOT separately audited: the offline-boot suite covers the cold-offline boot path and precache-audit covers list integrity; a dedicated row for one image would restate the diff. | REACH: Install the app, go offline before first open, and the welcome screen's cloud pet still draws. Requires this release's service worker to have installed once online first, which is how every precache entry reaches a device.

## v468

1. PROOF: MANUAL, by firing the real button per the FX rules: seeded {marrow:4, graveroot:3}, the strip showed marrow x4 + graveroot x2 (the greedy picks), and after converting the inventory read {graveroot:1, ectoplasm:1} with exactly one filled socket left, so shown = spent, to the item. The seam is structural: transmutePicks is the single source of the take order and transmuteConsume derives from it (unit tests 189/189 including the pre-existing consume assertions). Ready-state glow measured on pixels (645 violet px at the out socket). | REACH: Open the Kitchen. The Transmute row shows the sockets whenever you own any commons; the violet lights when you hold six. No flag, no server change.

2. PROOF: MANUAL, probed mid-animation through the real click at +420ms: computed box-shadow rgba(180,138,255,.706) 16.7px with tmxBloom running on the body-level clone. The clones are body-level BECAUSE the first capture caught the Kitchen's cook-timer tick re-rendering the sheet mid-moment and wiping the bloom off the live socket; the moment is theatre, never state, and doTransmute settles the ledger before the first clone exists. Reduced motion mints no clones. | REACH: Hold six commons off cooldown and press Transmute. The six fly into the pot and it blooms.

3. PROOF: MANUAL, one-line change reviewed against an independent control: 49 icon-bearing buttons in the app source, a lone-icon-without-aria sweep returned zero further hits. | REACH: A screen reader on the Pantry now announces "Discard" on the toss button. Nothing visual changed.

## v467

1. PROOF: wanderer-encounter-audit.mjs (gate-registered, 11 rows green; the NAME row grades the SHIPPED string, computed visibility and the rule width, proven red by blanking TITLE_TEXT: exit 1 while LINES stayed green). | REACH: Walk into the Wanderer's lantern cone on the Boneyard map. The line types over the glow, he walks in, THE WANDERER slams on. No flag, no server change.

2. PROOF: toast-map-audit.mjs (gate-registered; drives a REAL toast through the shipped toast() seam; CLEAR proven red by disabling the one CSS rule, SEAT green both ways). | REACH: On the Boneyard with something in reach, trigger any message (walk fast and get the Slow down nag). The message sits above the action card instead of on it. Everywhere else it keeps its old seat.

3. PROOF: MANUAL, measured 2026-08-28: #mapReadout held by reference across 800ms read rect 28,799 40x40 before and 0,0 0x0 after, because refreshSpawns rewrote innerHTML on every camera idle; after keying on data-bar the map-topbar misread disappeared 3/3 and badge-centre's detach artifact with it. No dedicated audit: the defect was invisible except through a held reference, and badge-centre exercises the path. | REACH: Stand still on the Boneyard. Nothing visibly changes; the readout card simply stops being torn down and rebuilt every second.

4. PROOF: levelup-audit.mjs green on the tree (exit 0, zero FAIL rows; the suite exists because of three earlier bugs on this exact path). NOT PROVEN: no automated test fails on the pre-fix code, because the bug needs a second XP award landing inside a 35-await gap and that interleaving resisted deterministic triggering; stated in PR #260 rather than implied. | REACH: Log a food while other XP lands (the init backfill replaying is the reachable case). The level crossing is computed from the total at the comparison instant.

## v466

1. PROOF: MANUAL, a 2x render with a positive control rather than an eyeball. Same markup, both stylesheets, counting cream fill-tail pixels in the band above the box: BEFORE (tail present) box top y=295, cream tail px=47; AFTER (tail removed) box top y=295, cream tail px=0. Box top identical, so nothing reflowed. No audit grades .cele-bubble and I did not write one: a static check that the two deleted rules are still deleted would only restate the diff. My first probe counted the dark stage background as tail pixels and could not have failed; it was thrown out. | REACH: Level up any pet, or finish a breed in the Stable. The note under the pet portrait now has no tail pointing at it. Both sheets reach it, and neither is behind a flag or a server change.

2. PROOF: MANUAL, the same render pair. The copy strings in the app source are untouched by this change (the diff is app.css only, two pseudo-element rules), and the measurement above shows the box top unmoved at y=295, so the sticker and its 14px gap are where they were. | REACH: The same two sheets. The words, the cream sticker and its tilt are identical to v465; the only difference a player can see is the missing tail.

## v465

1. PROOF: water-cache-audit.mjs (a new suite that grades the PROPERTY rather than the policy: a point that HAS answered keeps answering while the player walks and the cache churns past its cap, which stays true if the eviction is ever rewritten. The cause: the water module swept its tile cache by iterating the Map, and a Map iterates in INSERTION order, so it discarded the OLDEST-FETCHED tiles, which are the ones under the player, fetched first when the map opened and read every pass since. isWater then answers undefined for the cell the player stands in, and wandererAt cannot tell that apart from "all water", so the Wanderer is not drawn. MY FIRST VERSION OF THIS AUDIT COULD NOT FAIL and its prove-red is what caught it: checking HOME once at the END passed on the broken tree, because a read of an evicted tile also RE-FETCHES it and re-inserts it at the tail, immunising it against the very sweep under test. The symptom is transient, so HOLD records EVERY pass and one blank fails. Proven red on the restored sweep: "1 of 11 passes read undefined, first after 77 points", with WARM and CHURN still green so the red is the eviction and not the setup) | REACH: Open the Boneyard on a cold map and watch the Wanderer. He no longer disappears for a few seconds and come back while the map is still loading.

2. PROOF: kitchen-queue-audit.mjs (clean on the tree that carries this) plus the rendered row measured at both states rather than reasoned about: at 3 commons the button reads "3 more" with a "3 / 6 commons" meter filled to 50%, and at 6 it reads "Transmute" with the meter full and the button enabled. The meter carries a visible EMPTY remainder deliberately: the first version drew only the fill, and 3 of 6 and 5 of 6 look identical with no track behind them, which is the same confusion the row was being fixed for | REACH: Open the Kitchen with fewer than six common ingredients. The Transmute button says how many MORE you need instead of "Need 6", and there is a 3 of 6 bar under the description.

## v464

1. PROOF: memory-census.mjs (its CEILING row for the Paddock, which was the last red row in that suite and now exits 0 across every screen: paddock 88.4 MB from 109.6, against a 90 MB ceiling, with stable 64.4 and shop 83.8. NOT a mis-calibrated bound, which is where I started: that file's own header settles it, "THE PADDOCK CARRYING THE STABLE IS NOT A DRIVER ARTIFACT ... that is the DOM a player standing in the Paddock actually has". Found by breaking the number down by container first (page 54.1 MB, paddock's own 41.6, the Stable underneath 13.9) and then listing every image at or above 1024px wide with its cost, which named two files that were simply wrong for their slot: a 2048px pet master in a 96x64 box at 16.0 MB, and a 1024px news thumbnail painted at 24 CSS px at 3.5 MB) plus news-banner-audit.mjs (its TILES row, which CAUGHT A WRONG FIX before it shipped: `loading="lazy"` on those thumbnails saved the memory and broke them, because the banner normalises each one against its natural size and a lazy image reports 0, measured "longest side 24-55.4px (spread 31.4, bound 1.5), 1 overflowing". Reverted; the real fix is smaller source art, not deferred decode) plus precache-audit.mjs 6/6 and offline-boot-audit.mjs 16/16 (the three new thumbnails are precached alongside their masters, because an asset the app asks for that PRECACHE does not carry is exactly the v455 offline blank-screen bug) | REACH: Open the Stable and walk into the Paddock. It looks exactly as it did; your phone is holding about a fifth less picture data while you are standing there, so the app is less likely to be dropped from memory while you are doing something else.

2. PROOF: news-banner-audit.mjs (its TILES row is the one that would catch a thumbnail that changed size or position: it bounds every thumbnail to the same longest side and centre, and it went RED on my first attempt at this, which is how I know it can see a difference. Green on the shipped tree) plus art-resolution-audit.mjs (nothing is drawn above 1.40x its source anywhere in the app, so a smaller file cannot have been swapped in somewhere it would be stretched: the news slots paint at 24 to 40 CSS px against 192px art, and the Paddock lurker at 96 CSS px against 192px art, both downscales) plus icon-inventory-audit.mjs (ASSETS: every art path the drawers can ask for exists on disk, so no slot fell back to a missing file) | REACH: Look at the Paddock and at the news rows on Today. The pet at the edge of the Paddock and the little pictures beside each news row are the same art in the same places at the same sizes.


## v463

1. PROOF: art-resolution-audit.mjs (its RESOLUTION row, whose bound is 1.40x and which was RED on main because of my own v462 shelf: measured `shop:thumb/384/B/B0-1.png src 384 drawn 583 = 1.52x`, and the offending images were confirmed to be mine by container rather than assumed, `inGrid: 1`, the second grid. The cause is that the tile CROPS to the body part with a scale, so a 130px tile carries a 292 CSS px layer, 583 device px at dpr 2. THAT EXACT UPSCALE IS IN THAT AUDIT'S OWN HEADER, with these same numbers, as the reason the rack moved to masters originally; I reintroduced it without reading the history in the file. The way out was measured rather than reasoned: masters at 12 tiles put the Shop at 115.6 MB, at 8 still over, at 6 STILL over, so masters do not fit at any useful count; the 384 tier at four across gives 167 CSS / 333 device = 0.87x. Worst upscale in the whole app is now 1.40x, which is the themed shelf's own long-standing on-the-line case) plus memory-census.mjs (Shop 83.8 MB against the 90 MB ceiling) plus grid-min-width-audit.mjs (20/20: the denser grid does not push a control off any of the three phone widths, and the price pill still fits "1,000" at 76px) | REACH: Open the Shop and scroll to the shelf under the themed nine. It is four tiles across instead of three and the artwork is crisper. Nothing was removed: it is still twelve pieces.

2. PROOF: pixel-art-swap-audit.mjs (its SWAP row named all five screens, kitchen, stable, today, wheel and wheel-reveal, drawing a vector golden crate at 16px beside pixel art; the suite now reports "every screen draws one medium", 18 rows, 0 failing. The second SWAP row is what forced the tidy-up: it fails when a declared exemption starts passing, so it named the Pit by hand the moment the root fix reached it, and that stale row is deleted rather than left to rot. The Pit was INSPECTED rather than assumed, because its declaration said the decision "wants Tom's eye on the rendered card": 2 crate chips on the sheet, both carrying the rare glow, and zero golden vectors) | REACH: Open the Kitchen, the Stable, Today, or spin the prize wheel. Wherever a golden chest is drawn small it is the pixel chest with a gold glow now, instead of the older flat drawing.

## v462

1. PROOF: rack-rotate-audit.mjs (12 rows, PURE. Every POOL row prints its own denominator and fails on an empty match set, so "nothing banned leaked in" cannot pass over a scan that matched nothing. DISJOINT is the money row: buyRackItem prices a themed piece by `st.ids.indexOf(artId)`, so one id on BOTH shelves would take the themed branch wherever the player tapped it and charge another rung's price, which is the collision rack-theme-lint exists to stop one level up. It runs across 240 week/salt shelves, not one. MY FIRST DRAFT OF THAT ROW COULD NOT FAIL: it reimplemented the picker's seed arithmetic locally, so deleting the disjointness filter from the real picker left the audit completely green. It imports the real pickers now, and that was caught by proving it red rather than by reading it. Verified in the browser too: a rotating common charged exactly 300 coins, and B0-1, a starting default, refused 'not-stocked'. Proven red three ways, each isolating its own row: dropping the exclusive filter reds POOL at "1 leaked into the pool", dropping the taken filter reds DISJOINT at 59 collisions of 240, and inverting epic's dust reds LADDER) plus memory-census.mjs (the reason the first build of this was NOT shippable: twelve full-size mannequins took the Shop from 64.1 MB to 115.6 MB against a 90 MB ceiling, images 59 to 92. The rotating shelf draws at the 384 tier now while the themed rungs keep the masters their own comment says were deliberately paid for: 83.8 MB, and art 384 natural against 102 CSS px so nothing is upscaled) | REACH: Open the Shop. Under the themed nine there is a second shelf headed ALSO ON THE RACK with twelve more pieces on it, and the wallet line above counts all 21 rather than 9. Tapping any of them tries it on exactly as the nine do.

2. PROOF: rack-rotate-audit.mjs (the DAILY row: 30 consecutive days give 30 DISTINCT shelves, with zero collisions against the themed nine. Proven red by seeding the shelf on the week again, which reports "1 distinct shelves across 30 consecutive days". The separation was ALSO measured on the running app across a real day change, because it is the risky half: the themed nine did not move, the week did not change, and a spent reroll was not handed back (rr 1 to 1). rack()'s own comment records that rr once reset daily and that this gave a free full-rack draw every day, surfacing any specific themed piece 94% of weeks for nothing; Tom approved weekly rerolls on 2026-08-20 and that is untouched) | REACH: Open the Shop today, then again tomorrow. The twelve on the lower shelf are all different. The themed nine above and your rerolls are unchanged, so anything you are saving for stays where it was.

3. PROOF: rack-rotate-audit.mjs (the four POOL rows, one per excluded class, each naming the items it protects and their count so the row cannot pass on an empty set: 7 pets, 5 of Bumbleseal's own pieces, 2 exclusive, 2 starting defaults, 0 leaked into the pool of 355) | REACH: Nothing to do. Those pieces never appear on the shelf. Bumbleseal is still hatch-or-her-own-shelf, and the Day One Lizard cannot be bought by anyone.

## v461

1. PROOF: crate-reveal-audit.mjs (its two TAIL rows, each paired with a CONTROL that refuses to grade a run where the sequence never reached its final frame, so a reveal that did nothing cannot pass by having a huge apparent margin. The defect was found by instrumenting the app's own variables under the audit's cold-cache provocation rather than deducing them: late=1633ms against a sink at 1640, so the window had already closed, but `Math.max(200, ...)` insisted on 200ms anyway and the final frame landed 279ms AFTER the crate began leaving. Proven red on a throwaway tree with that floor restored: daily -564ms, golden -614ms, 20/22, exit 1. Green after on two consecutive runs with holds of 86/88 and 96/90 against a 100ms target. Pixels asserted at each frame's OWN instant per the FX rule, not after the fact: all 9 daily and all 3 golden frames decoded, visible, 144x144. The fast path is measured separately and unmoved: on a warm cache the sink stays at its authored 1.640s for both crates) | REACH: Open the first chest of a session, either kind. The lid finishes coming off before the chest drops away. This was most visible on the first chest after opening the app, and not on later ones.

## v460

1. PROOF: t2-audit.mjs (its BREED rows, three of which came back the moment the dangling return field was removed. `js/loot.js:869` returned a `cost` key whose variable #203 deleted when breeding stopped costing dust, and the only three `cost` bindings in that file sit at 169, 1670 and 1744, all inside other functions. A strict-mode ES module with no binding in scope throws ReferenceError, so the throw was unconditional rather than an edge case: every breed, every player, every time. The single caller at `js/app.js:15938` never read the key, which is why deleting it is the whole fix. NOT in the v456 baseline, which is why an earlier baseline diff showed one t2 failure where a fresh run showed four) | REACH: Open the Stable, pick two pets and breed them. The reveal opens and shows the offspring with its new lineage rank. Before this the screen did nothing visible at all.

2. PROOF: NONE for the data claim specifically, and that is deliberate rather than an omission: it is a statement about what ALREADY happened on players' devices during v458 and v459, which no audit on this tree can grade. It is read off the control flow instead, and the reading is what corrected a FALSE first draft of this very note. The throw is on the return, and every mutation is persisted above it: `savePetInstances` with the fed pet already removed, `kvSet('petBreedCredit')`, the level-bank delete, `clearBond`, `clearNick`, and the equipped/extinct cleanup. The keeper's `lineage` is mutated in place on an object inside the saved list. The caller has no try/catch, so the throw also skipped `render()` and the `sel`/`offSp` reset, which is why the Stable looked frozen with the pair still selected rather than showing an error. The first draft of this note said "your pets were never consumed" the opposite of the truth, written from where the throw is rather than from what runs before it | REACH: Nothing to do. If you bred in the last two days, it worked: the fed pet is gone and your keeper carries the extra lineage rank. Reopening the Stable at the time would have shown that. No breed was charged or applied twice.


## v459

1. PROOF: offline-boot-audit.mjs (its three COLD rows, which are the ones that were red: `0 chars on #screen`, a tab tap moving hash `(none) -> (none)`, and Today reading `{"heading":"","ring":false,"kcal":"","len":0}`. FOUND BY LOGGING every same-origin response through an offline reload: 42 requests, 41 answered `text/javascript` out of Cache Storage and exactly one answered `text/html` the baked hero-edge colour table under `data/`, which the app's entry module imports STATICALLY and the service worker's PRECACHE list never carried, so offline it missed both network and cache and the worker's fallback handed it the shell HTML instead. A module served as text/html is a hard load error that kills the whole static graph, which is why the symptom was a blank page rather than a missing colour. After the one-line PRECACHE addition: 504 chars, `#/bonehead`, and a real 1,286 kcal. Same shape as the v455 haptics/bosses/wraith-fx incident that the PRECACHE comment already documents, and that one line flipping three rows is also the deliberate-mutation proof that a local edit is visible to this audit at all) plus precache-audit.mjs (which was GREEN throughout and should not have been: its walker matched only sibling `./x` specifiers and prepended `js/`, so every `../data/` specifier the entry module writes was discarded before comparison two other data modules were in PRECACHE by hand, which is why nothing looked wrong. It now resolves each specifier against the file that wrote it; graph reached goes 46 -> 49 modules. Proven red in both walkers: with the OLD one and the table removed from PRECACHE it still reported `PASS all 46 covered`, blind to the exact bug it exists to catch, and with the new one the same removal reads `MISSING: data/hero-edge`) | REACH: Open the app once with signal so this update installs. After that it opens with no signal at all on a plane, underground, anywhere with no bars. Before this it opened to a blank screen and stayed blank.

2. PROOF: shell-watchdog-audit.mjs (a new audit that grades LIVE/DEAD/ONCE against the shipped index.html script in a fake DOM: LIVE requires that an app which is momentarily empty and then draws is NOT reloaded, DEAD that a genuinely dead shell still is, ONCE that it never reloads twice. Proven red by restoring the one-shot sample verbatim: LIVE alone goes red at 1 reload while DEAD and ONCE stay green, so the red names the defect rather than the file) plus newcomers-audit.mjs (the real-browser evidence: it was failing roughly one run in six before this and ran 6 of 6 green after, which is the flake this was causing) | REACH: Use the app normally. It no longer reloads itself while you are tapping around in it.

3. PROOF: news-banner-audit.mjs (which drives all nine rows for real: eight open a sheet, stay on `#/today`, leave the banner open and never rebuild `#screen`; only the Wanderer navigates, and only that row carries a destination) | REACH: Open the NEWS banner on Today. The Wanderer row tells you it opens the Boneyard before you tap it. The other eight open a card and leave you on Today.

4. PROOF: day-strip-audit.mjs (its PICKER row asserted a control that no longer exists and is RETIRED, replaced by WALKBACK: nine taps of the back arrow land exactly nine days back, measured from where the strip actually is rather than from today its first draft measured from today after the checks above had already moved the day and failed by two for its own arithmetic. The shown date moved rather than vanishing: the picker's value was the only place it was readable, so the header carries `data-date` now and both this audit and today-container-audit read that) | REACH: Tap the word TODAY at the top of the Today page. Nothing happens; the phone's date picker no longer opens. The arrows either side still move you a day at a time.

## v458

1. PROOF: idle-perf-audit.mjs (the IDLE row, whose healthy value is 0.0-3.5 recalcs/s and whose broken value is 119.9. Today measured 120.3/s on the shipped v457. FOUND BY MEASUREMENT, not by reading: a CDP trace of 3s of settled Today showed 6,480 StyleRecalcInvalidationTracking events across 18 elements, all reason "Animation", and v456 traced ZERO. Hiding subtrees one at a time isolated it, and cancelling ONLY the five animations inside the shut news banner took it 119.0 -> 0.0 while leaving all 18 visible ones running. Cause: content behind a closed <details> gets no compositor layer, so its animations run on the main thread and one un-compositable animation drops the whole document onto the slow path. The first fix attempted was a name-list on .bh-anim and it still measured 119.6/s, because a single remaining wpnCharge held the document there alone; the shipped rule states the invariant instead, so anything animated behind any disclosure is covered. Proven red with the rule deleted: IDLE alone at 119.9/s, with METER still reading 119.9 so the zero means something) | REACH: Open Today and leave it alone. It does no work until you touch it. This was introduced in v457, so if the app felt warm since yesterday, this is that.

2. PROOF: unit.test.js (the S0 dust register, which enumerates EVERY dust spend in the tree and requires each to be declared. breedPets was the one declared NOT COSMETIC, written down rather than excused, with the note that it "is the first thing to look at if dust is ever sold for money". That declaration is now gone and the floor moved 3 -> 2, so the claim is unqualified: every dust spend is cosmetic) | REACH: Breed two pets in the Stable. It costs no Bone Dust, only the 6,000 steps it always needed.

3. PROOF: transmog-clarity-audit.mjs (its STRUCTURE row reads .mog-h, where the name is pinned) plus melt-ui-audit.mjs (which had to be fixed first: it was booting against the LIVE SITE, so its one red row was never real and two cp -R mutations of the copy it asserts on changed its output by nothing) | REACH: Open your Bonehead, tap a gear slot. The panel is headed "The Dressing Room" instead of "change how it looks", and Gwart's Guide has an entry under that name.

4. PROOF: melt-ui-audit.mjs (the EMPTY case, plus the two panel lines now graded separately: .mog-lead carries the price claim and .mog-safe the safety claim, which one row had been conflating) | REACH: On a brand new account open the Salvage Bench. It says what will fill it and when, instead of pointing at a list that is not there.

## v457

1. PROOF: today-peek-audit.mjs (the WHOLE pair, which REPLACES the retired PEEK rows. PEEK required a card to straddle the fold so a player could see there was more below; that was right while Today was a long scroll and is meaningless now that the day is one banner, because nothing straddles on any of the four viewports. WHOLE grades what the collapse actually promises: the day fits inside a single screen height, measured at 363px against a 786px screen where it used to be roughly 2300. The first draft of that row was FALSE and the guard caught it before it shipped: it asserted the day sits ABOVE the fold, and it ends 434px past it because it is under the hero, the doors and the quests) plus today-container-audit.mjs (its LEDGER rows now stage the day EXPANDED, because every claim in that block is about content that went behind a tap rather than away) | REACH: Open Today. The day is one card showing your calorie wheel and your macros, with everything else one tap underneath it. Tap it and meals, wellness, the Kitchen and activity are all there, unchanged.

2. PROOF: today-container-audit.mjs (the SCROLL row, which caught this as a real defect rather than a staging problem: a day change re-rendered with the disclosure shut, the page shortened under the player and the scroll position clamped, 900 to 608) | REACH: Expand the day, scroll down, then flick to yesterday and back. The page stays where you left it instead of jumping.

3. PROOF: news-banner-audit.mjs (five rows on the real Today. QUIET asserts it is CLOSED on arrival, because a banner that opens itself is v448's launch-takeover decision quietly reversed. COVERED asserts every row of the NEWS registry is present, so the banner and the News tab read one array and cannot drift. TILES bounds every thumbnail to one longest side and centre: measured before the fix, art filled 0.36 to 3.80 of a 40px tile, a ten-fold spread, with the Discord tile 19px off centre because its art is a fixed 78px square; after, 31.2px and 0px. Proven red with the normalisation deleted: 24-78px, spread 54, 19px off centre, 6 overflowing) | REACH: Open Today. There is a NEWS line above your quests with a count when something is new. Tap it and every announcement the game has made drops down with its own art, all the same size.

4. PROOF: gwart-guide-audit.mjs (COVERED grades the BOOKKEEPING rather than the rendering, and that distinction is the row: openGwartGuide falls back to a "More" bucket for any ungrouped entry, which makes "is it rendered" true by construction, and the first version of this row stayed GREEN on the exact mutation it existed to catch. ASK grades the hero card. Proven red twice, one row each) | REACH: Tap Gwart on Today. His guide is grouped into Your Bonehead, Out there and Every day, and it opens with him telling you to tap him whenever you are stuck.

## v456

1. PROOF: hero-edge-audit.mjs (the SEAM pair. It grades PIXELS across the fill/art boundary, BOTH mean luma and standard deviation, because four previous fixes graded colour alone and the defect was texture. MEASURED on a 90px displaced hero: with the grain layer on, fill 111.45 sd 0.00 against art 111.92 rising to 112.27 sd 0.47; with it off, 111.45 sd 0.00 on both sides. A CONTROL row refuses to grade two empty rows. Proven red by restoring the grain layer verbatim: 0.56 luma and 0.47 sd, control still green) | REACH: Open Today and look at where the page meets the art behind your Bonehead, or pull down past the top. There is no line there any more.

2. PROOF: today-peek-audit.mjs, today-container-audit.mjs (both green on the merged tree, so the ring's new centre lines did not move anything around them) | REACH: Open Today. The big number in the calorie ring is what you have EATEN and it climbs as the ring fills, instead of counting down while the ring filled up.

3. PROOF: icon-inventory-audit.mjs (calorieRingCard is declared as a chart in the emitter registry, which is what makes a SECOND undeclared copy of this card fail the gate rather than quietly drift from the first) | REACH: Open the Progress tab. The same calorie card is at the top under the heading "Today".

4. PROOF: icon-inventory-audit.mjs (ASSETS: every pixel path a drawer can ask for exists on disk, 58 of them) | REACH: Open the Boneyard map. The herb patches are green instead of the same browns as the dirt they sit on.

5. PROOF: icon-inventory-audit.mjs (EMITTERS and SUBFLOOR: 309 sites, 80 emitters, 50 declared vector fallbacks) plus art-resolution-audit.mjs (worst upscale 1.40x, unchanged from before these icons landed) | REACH: Water, sleep, bed, quests and workouts have pixel icons now. The row of doors under your Bonehead has five entries, the new one on the left opening Trends; the small dot that used to do that in the top corner is gone.

6. PROOF: tab-doubletap-audit.mjs (CREW-DBL is a position row PAIRED with a marker-identity row, because a rebuild also lands at scrollTop 0 and the position row alone passed on the broken tree) | REACH: Scroll down the Crew tab and double-tap the Crew icon in the bottom bar. It scrolls back to the top instead of rebuilding the page under you.

## v455

1. PROOF: hero-edge-audit.mjs (GONE grades the removal in both directions, statically and in pixels: no element paints in that strip and no code writes --wm-pull or --wm-fade. The 53-row audit that graded the wordmark is deleted with it) | REACH: On Today, pull down past the top. Nothing is printed in the space you open up. The BONEHEADZ mark that used to slide in is gone.

2. PROOF: hero-edge-audit.mjs (SWEEP equips EVERY backdrop in the catalogue for real and asserts the scroller's resolved background-color is that backdrop's own colour, which is the only thing iOS paints in a rubber-band region; measured across v434, v435 and v436, a rectangle parked above the scroll origin paints nothing there. TABLE recomputes all 22 rows off the real PNG through the browser's canvas filter while the table itself was generated by a colour matrix in python, so agreement means two independent methods match rather than one method agreeing with itself. VARIED requires more than three distinct colours so a build handing everybody one constant fails. NOBG covers the empty slot, which has no default and is the state that shipped as 110px of page background on top of the art. This REPLACES a 53-row audit whose every row ran on one seeded save, which is why it stayed green through two releases that shipped the bug) | REACH: On Today, pull down past the top. The space above your Bonehead is the same colour as your backdrop, whichever one you have equipped, and the same colour on every phone because it is computed from the art rather than sampled while the app runs.

## v454

1. PROOF: overscroll-wordmark-audit.mjs (the NOBG pair, new for this build. The BG slot has NO default in BH_SLOTS, so "no backdrop equipped" is a state real players are in, and the hero renders no backdrop element at all for them. paintHeroEdge read that as a missing image and returned, leaving --hero-edge unset so the scroller fell back to the page background. MEASURED on a save with BG removed: the pulled strip rendered rgb(13,12,18) for 110px sitting directly on the scene's coral rgb(253,104,87), and after the fix --hero-edge is rgb(253,104,87) and the strip runs continuously into the art. The CONTROL row grades the EQUIPPED case in the same run, so a build that set one constant colour for everybody cannot pass. Every other row in that file runs on the seeded default, which HAS a backdrop, which is why 51 green rows never saw this. Proven red by restoring the early return: NOBG red at UNSET, its control still green) | REACH: With no backdrop equipped, open Today and pull down past the top. The strip above your Bonehead is the same colour as the scene he stands in, instead of a black band on top of it. With a backdrop equipped nothing changed; that case was already sampled from your art.

2. PROOF: overscroll-wordmark-audit.mjs (the RELEASE row, re-premised again and now naming all THREE wrong answers in its own failure message, because this row has been rewritten twice and each rewrite was a different mistake shipping: 1.00 half way back is PINNED, the original defect where the mark sat lit while the cards slid under it; 0.00 well before landing is v452, which read as blinking out; 0.50 is v453's straight proportion, which lands together but reads as dragged. The bound is the band between them, 0.20 to 0.45, with the endpoints unmoved: still exactly the on-screen value at the instant of release and still exactly zero as the pull reaches zero. Measured sweep 120px:1.00 100px:0.75 80px:0.50 60px:0.30 40px:0.15 30px:0.10 20px:0.05 0px:0.00) | REACH: On Today, pull down past the top and let go. The wordmark is most of the way gone by the time the screen is half way back, instead of tracking it down at the same rate.

## v453

1. PROOF: overscroll-wordmark-audit.mjs (the RELEASE row, re-premised for this build and carrying the bound it replaces. It asserted "the ink reaches ZERO while the travel is still running", which is what v452 shipped and what Tom rejected: gone at 30px of pull with 122px of the 128px travel left. It now asserts the alpha is PROPORTIONAL to the return, 0.50 +/- 0.10 half way back from a 120px peak, reaching zero as the pull does, and it names the other wrong answer in its own message so neither can pass: pinned reads 1.00, which is the pre-v452 defect. The LEAD row was re-premised alongside it from "opacity faster than travel" to "one shared duration", because the shorter opacity duration is what put the fade 70ms in front of the movement. Measured sweep 120px:1.00 100px:0.85 80px:0.65 60px:0.50 40px:0.35 30px:0.25 20px:0.15 0px:0.00. Proven red twice, each mutation reddening exactly one row) | REACH: On Today, pull down past the top of the screen and let go. The BONEHEADZ mark travels back up with the screen and dims as it goes, both arriving at the same moment, instead of blinking out while the screen is still on its way.

## v452

1. PROOF: overscroll-wordmark-audit.mjs (51 rows. The three that grade THIS build are RELEASE, POP and HELD, and they exist because the four fixes before it all graded the tail and the defect was in the head: the reveal is pinned at full opacity for every pull past 36px, so from a deep bounce down to 36px the mark sat lit while the content slid up under it, and no symmetric function of the pull can tell the way in from the way out. RELEASE drives a real release and requires the ink at ZERO while travel is still running, measured at 30px of pull with 122px of the 128px travel left. POP grades continuity at two depths because a fixed denominator looks right on a deep release and snaps a shallow one from full to nearly gone in one frame. HELD is the control: the same descending sweep with NO release must leave the mark lit, which is what stops the detector blanking the mark for the row that photographs it. Proven red twice, each mutation reddening exactly one row) | REACH: On Today, pull down past the top of the screen and let go. The BONEHEADZ mark fades in over the art as before, and on the way back it clears while the screen is still travelling, instead of sitting on top of your first card as it lands.

## v451

1. PROOF: newart-audit.mjs (grades every cosmetic's NAME rather than its art, which is what this build changed: it fails on any placeholder name still of the form #NN, and on any duplicate across the WHOLE catalogue, not just within a slot, because a crate reveal showing two rows a player cannot tell apart is the failure a rename can introduce. 258 rows graded) | REACH: Open a crate that rolls B17, or open your Looks list and read the BODY row. The piece is called "Sprinkle Bones" now instead of "Odd Socks". Nothing about how it looks changed, only what the card calls it: it was the one body in the game named after a different slot, so a crate could tell you that you had found socks while the card underneath said BODY.

## v448

1. PROOF: first-session-audit.mjs (launches the app with navigator.webdriver MASKED, which is the only way any suite in this repo has ever rendered one of these: every launch gate self-suppresses under webdriver, which is why the first session had no test on it for months. COLD polls 40 seconds of an untouched launch and requires ZERO sheets, veils or teaser posts, dismissing the daily wheel each poll so a card behind it cannot hide. MASKED is a graded row because an unmasked page reports a quiet boot on a tree that still interrupts. CONTROL opens a real sheet through a real control on the same masked page, so the zero cannot be a blind detector. QUEUE reads boot()'s tail statically and fails by name on any maybeShow*/maybePrompt* outside a four-entry allowlist. Measured on origin/main at 23de102b: COLD 2, the recovery sheet then What's New. On this tree: COLD 0. Proven red by restoring maybeShowWhatsNew's call and function: QUEUE and COLD went red together, exit 1) plus community-audit.mjs and beta-thanks-audit.mjs (each carries its own MASKED + NEVER-FROM-BOOT pair for its own card) | REACH: Open the app. It goes to Today. Nothing opens over it, on the first launch after installing or on any launch after that, except the daily wheel, which is your free spin and is unchanged.

2. PROOF: notif-audit.mjs (BOOT-ASKER, four rows, behavioural: Notification.requestPermission is spied on before the page loads with navigator.webdriver masked, and a launch must call it ZERO times. The opposite direction is graded in the same run, because a zero is also what a build that can no longer ask would report: pressing "Everything (power user)" in Settings must call it, and it does, 1 ask against 0 on boot. A fourth row is static and fails if maybeRequestNotifPermission is ever declared again) | REACH: Open the app: iOS does not ask about notifications. Go to Settings, tap "Everything (power user)" or "Just essentials", and iOS asks then.

3. PROOF: race-results-audit.mjs (retargeted from the deleted poster to the Today banner it always had: PAID grades the podium name by name, place by place and step count by step count against the real production result, and a companion row fails if any name off the live /steps/week board appears, which is the read that would announce the wrong winners. VISIBLE grades effective opacity up the ancestor chain, REAL counts the drawn layers before requiring them decoded, and EMPTY requires no card at all rather than an empty frame when there is no settled podium) | REACH: Open Today. The gold "THE STEP RACE - SETTLED" card is there, and tapping it opens every place with its full purse. It no longer opens itself over the app when you launch.

4. PROOF: news-tab-audit.mjs (opens every announcement through its real News row and requires a real decoded box for each) plus community-audit.mjs and beta-thanks-audit.mjs (each drives its Crew strip, its News row and, for the Discord card, its Settings row, and asserts the real invite link at the end of each) | REACH: Open What's New from Settings or from the Crew tab and tap the News tab: every announcement the game has shown is listed there and opens as it did the first time. The Discord and TestFlight links are also on the Crew tab, and the Discord link is in Settings.

5. PROOF: recovery-audit.mjs (drives the Settings recovery and restore controls for real: SETUP asserts the restore sheet opens from its real Settings control, and the rest pin that a FAILED restore never destroys the save it was meant to replace) | REACH: Settings, "Recovery code". The row says NOT SET in plain words if you have not set one, and the app says so in a passing message about once a week. Nothing blocks the screen.

## v446


1. PROOF: freeze-refund-audit.mjs (drives refundStreakFreezes against a real IndexedDB: PAYS asserts +300 on three seeded freezes before anything else is graded, so the no-op rows cannot be vacuous; ONCE, ten repeats and a real page reload each move the balance by 0; RACE fires three concurrent callers and requires exactly one receipt; MIGRATION seeds the OLD kvSet flag alongside three unpaid freezes and requires +0, which is what stops an already-settled install being paid a second time; NOTHING pins that an empty save still burns the flag. Proved red twice: against the shipped v445 code, where three concurrent callers each took a 300-coin receipt and the balance moved +900 for 300 owed, and again on a throwaway worktree with the db.addIfAbsent claim swapped back for kvGet/kvSet, which passes ONCE, BOOT and MIGRATION and still prints +900. Both reds were the same two rows) plus unit.test.js "the freeze payout claims atomically BEFORE it pays, and pays before it deletes" (a static lint requiring the claim to be addIfAbsent on the ORIGINAL key and to precede coinsAdd; proved red on the same mutation) | REACH: Open the app. If you were owed the old Streak Freeze payout it arrives by itself, once, and it can no longer arrive twice if the app happens to start twice at the same moment. If you were already paid, nothing happens and you keep the coins: the existing marker on your save reads as already-settled, which the MIGRATION rows above are there to prove.

1. PROOF: unit.test.js "S0: dust buys looks, and every dust spend in the tree is declared" (a static lint over the loot module and the app module in three rows: DUST_SHOP and buyWithDust are absent from both files rather than merely unrendered; EVERY negative boneDustAdd in the loot module is attributed to its enclosing function and must appear in a declaration table, so a shop cannot return under a new name; and no declared dust spend's body reaches grantEgg / grantCrate / grantConsumable / grantGear / grantPet / addPetInstance. It carries a CONTROL that fires each of the three patterns against a forgery, and each row was proved red on its own throwaway tree: one DUST_SHOP entry restored with buyWithDust -> "DUST_SHOP is back in the tree"; a renamed `bonePouchRedeem` that spends 60 dust and grants an egg -> "an undeclared dust spend: buyRackItem, bonePouchRedeem, breedPets, applyTransmog"; a grantConsumable added inside applyTransmog -> "applyTransmog spends dust and grants an item". The unmutated copy was green first, exit 0) | REACH: Open the Shop. The Bone Dust shop section is gone, and the only dust control left on that screen is the route to the Salvage Bench, which is where you EARN dust. There is nothing priced in dust to buy there any more. (That last sentence was true when v446 shipped and stopped being true on 2026-08-31: Tom ruled the EGG's removal unintentional, and buyDustEgg sells one Mystery Egg a week for 60 dust as the lint's one declared exception. The crate and the charm stay gone. Corrected rather than left standing, because this file is read to check whether a note is true NOW; see tests/dust-egg-audit.mjs.)

2. PROOF: the declaration table in the same lint is what backs the "what dust is for" half: it names all three surviving dust spends (buyRackItem, applyTransmog, breedPets) and fails if a fourth appears, so the list in this note cannot silently go stale. purchase-firewall.mjs grades the Rack leg for real (a live dust purchase against a real IndexedDB: the balance falls by exactly the price, no coins move, and the purchase path statically cannot reach grantGear or grantCrate) | REACH: Melt gear at the Salvage Bench, then spend the dust on a transmog in your Wardrobe or on a piece from the weekly Rack. Breeding two pets in the Stable still charges dust, which is what the note says.

3. PROOF: NONE for the sentence itself, which is a statement of intent, not a mechanic, and saying otherwise would be the dishonest move. What IS graded is the mechanic it describes: row 3 of the lint above fails on any dust spend that hands out an egg, a crate, a consumable, gear or a pet, and purchase-firewall.mjs holds the same line for coins | REACH: Nothing to do. It explains why the three items were withdrawn.

4. PROOF: reward-sop-audit.mjs (it derives every paying call site in js/ from the source and fails on one that is not declared in its registry; after this change the grantCrate and grantEgg sites in the quests, game, hunt, poi, social, wheel and app modules are all still present and still registered, and the run is green at exit 0). NONE end to end for any single drop: no audit walks a player from 14,000 steps to an egg in their bag | REACH: Walk 14,000 steps in a day for a Step Egg. Cross any level for a Bone Crate, and every tenth level also hands you an egg. Finish a quest, spin the daily wheel, close a day inside your budget, burn a workout's worth of calories, or beat a den boss, the Mimic, the Wanderer or a Gauntlet rung. None of those changed.


## v445

1. PROOF: unit.test.js "S0: no coin-priced sink grants a crate, gear or a weapon row" (a static lint over js/loot.js: the coin shop's parsed stock carries no `crate-` id, buyShopItem's own body reaches no grantCrate / grantGear / db.put('inv'), and the four weapon-shop exports are absent from the file rather than merely unreferenced. It carries a CONTROL that fires each pattern against a forged violation, and was proved red on a cp -R copy with a crate reachable from buyShopItem) plus two-tap-audit.mjs (the shop screen really renders, and carries zero [data-buyweapon] and zero [data-weapon]; proved red against LIVE v443, which answers 12 and 1) | REACH: Open the Shop. The Bone Merchant section is gone and there are no weapons to buy anywhere in the game.

2. PROOF: merchant-retire-audit.mjs (drives retireMerchantIfNeeded against a real IndexedDB: PAYS asserts +33,300 coins and +1,030 dust on a full rack before anything else is graded, so the no-op rows cannot be vacuous; ONCE, ten repeats and a real page reload each move both balances by 0; RACE fires three concurrent callers and requires exactly one receipt; PARTIAL pays two weapons as two and a duplicated row once; PRIZE pays nothing for a Bonecrusher won from the Champion; ROWS pins that no inventory row is deleted. Proved red by swapping the db.addIfAbsent claim for a kvGet/kvSet pair, which passes ONCE and BOOT and still prints 99,900 coins and 3,090 dust to three concurrent callers) plus unit.test.js "S0: the merchant refund knows what every withdrawn weapon cost" (pins all twelve prices against what the merchant charged on origin/main; proved red on a single price changed from 500 to 250) | REACH: Open the app. If you bought weapons, the coins and Bone Dust come back by themselves on that first open, at the price you paid, and a line on screen tells you it happened. You do not have to do anything, you cannot claim it twice, and the weapons stay in your inventory.

3. PROOF: pit.test.js (the four enemy-power contract numbers, 94 damage and 46 Stamina on the worked example plus the 65 and 122 guardrails, measured on origin/main BEFORE the removal and asserted unchanged after) plus gauntlet-sim.mjs and balance-audit.js, both run on origin/main and on this tree and byte-identical across 40 rungs x 120 seeds and across the whole build-by-foe table including the CHAMP column. All three proved red on a throwaway with the heavy Haymaker scaling flattened: 4 assertions red, 37 changed sim rows, every heavy-carrying rung measurably easier | REACH: Fight anything. The Champion, the Glutton, the Mimic and every third rung of the Gauntlet used to fight you holding Bonecrusher; that weapon's damage curve moved into their own stat block unchanged, so the ladder is exactly as hard as it was yesterday.

4. PROOF: unit.test.js "S0: no coin-priced sink grants a crate, gear or a weapon row" (its first half parses the coin shop's stock out of the loot module and fails on any id starting `crate-`, proved red on a cp -R copy with the 150-coin Common Crate put back) | REACH: Open the Shop. Crates are not sold for coins any more, because a crate can roll a statted piece of gear and coins are not allowed to buy power. They still arrive from quests, level-ups, day closes and the Champion, all unchanged. (The clause that stood here, "and the Bone Dust shop still sells a Common Crate for 40 dust", was true when v445 shipped and stopped being true later the same day: see v446 above. Corrected rather than left standing, because this file is read to check whether a note is true NOW.)

5. PROOF: NONE for the Champion prize end to end, and that is the honest state: no audit drives a full Champion win and reads the grant back. What IS graded is that the prize cannot be got any other way (the loot module's crateEligible now excludes `exclusive`, and unit.test.js already fails if an exclusive is reachable from a pool) and that the title is derived from the `pit-champ` badge rather than stored beside it, so it cannot drift from the achievement or be lost in a restore | REACH: Beat The Marrow King. You get the Moonlit Skull, which no crate in the game can roll, and the Marrow King title under your name on your own hub header and on your crew's plates. Players who already pulled that skull from a crate keep it.

## v441

1. PROOF: today-peek-audit.mjs (the SEAM row, re-premised on the RENDERED strip instead of on the filtered source: the old row compared two reads of the same image file, so it was green through the whole of the defect Tom reported twice. Proved red on pristine v440 at 393x852, delta 4.5 against a bound of 1.5, and green on this tree at 0.5. Its CONTROL partner suppresses `.hero-scene::after` and requires the strip to move, so the comparison cannot pass on a page that composites nothing) | REACH: Pull down past the top of Today. The strip that opens is the colour of your equipped backdrop, and it is now the colour that backdrop is actually PAINTED, not the colour of the file it comes from: measured rgb(111,125,65) against a rendered strip of 110.8/125.4/65.5, where the shipped build sat 2.8/2.4/4.5 away and left a visible line. Every backdrop is sampled the same way, so this is not one cosmetic.

2. PROOF: overscroll-wordmark-audit.mjs (the LEAD row: the fade must be given strictly less time than the travel. Proved red on pristine v440, which has both at 130ms, and green here at 60 against 130. The pixel measurement behind it is in the row's header and is NOT what the row grades, deliberately, because it is frame-timing) | REACH: Pull down on Today until the wordmark shows, then let go. The mark fades out ahead of the screen instead of alongside it: measured off compositor frames on a driven release, the last frame with any wordmark ink moved from 326-353ms to 280-282ms against a release that ends at ~360ms, so the lead went from 8-33ms to 74-82ms. The mark is still at full strength for the deep part of a pull, which is what makes it visible at all; what changed is the exit.

## v439

1. PROOF: memory-census.mjs (the Stable, Paddock and Shop CEILING rows plus the new decoded-width SHOT/TILE rows; seven mutations proved red on the tree by the branch author, including the trap that parking the cut sheet restores the SAME numbers byte-for-byte because the onerror fallback brings the art AND the memory back, so only a width row notices) | REACH: Open the Stable, a paddock, or the Shop. The pets are drawn from art cut to the animal instead of the full-size sheet, so the screen decodes a fraction of the picture data: Stable 215.1 -> 52.7 MB, Paddock 322.8 -> 78.1 MB, Shop 192.3 -> 38.1 MB, against a 90 MB census ceiling all three used to blow through. Nothing about how the pets LOOK changes.

CARRIED OVER FROM #158, NOT FIXED, AND UNOWNED: the Shop rack's mannequin tiles
draw a 384px thumbnail at up to 653 device px, a 1.70x upscale against
art-resolution-audit's 1.40 ceiling. Real, and the same class of problem, but it
is not pet art and it needs its own memory-versus-resolution call rather than
being smuggled into a memory fix. art-resolution-audit never sweeps the Shop,
which is why nobody had seen it. Tom has a task chip for it (task_43f67ed6).

## v438

1. PROOF: friend-paddock-audit.mjs (VISITOR: left-not-mirrored, right-mirrored, and a SPLIT row, each proved red alone on its own tree) | REACH: Open a friend's paddock from their profile. You and your friend face each other across the field. The flip is on the figure's container via the `scale` property, not on its layers and not on `transform`: `transform` is animated on that element so a mirror written there is discarded every frame (which is why v435 did nothing at all), and flipping the layers alone leaves the weapon's charge sweeping the wrong side of the body, because that glint is a masked span rather than an image.
2. PROOF: today-peek-audit.mjs (BOUNCE + four PLATE rows + the existing magenta BLEED row; contrast-audit.mjs also reds on the same defect) | REACH: On Today the page behind and between your cards is the app's own backdrop, grain and all, and pulling down past the top opens a strip in your Bonehead's backdrop colour. Measured in one run at three scroll depths: forcing the backdrop colour to magenta changes NOTHING on the page (zero bleed), the means match the pre-v434 page exactly at every sample point, and the grain survives (luminance variance 2.72/1.70/2.91 against the old page's 2.53/1.54/3.10).

THE BOUNCE HALF OF 2 IS NOT VERIFIED IN THIS SESSION, AND SAYING SO IS THE POINT.
The scroller's background is now byte-for-byte the v434 configuration, a
background-COLOR and no image, which is the state Tom confirmed looked "very
good" and the only state this repo has ever measured filling the rubber band (see
the on-device note at the top of app.css: a 126pt held bounce on a booted iPhone
17 Pro showed the scroller's colour edge to edge and zero pixels of four other
forms). What is new is only that the page no longer relies on that colour being
hidden. I tried to re-measure the bounce on the simulator and could not: a drag in
mobile Safari triggers Safari's own pull-to-refresh rather than the app's inner
scroller, and the service worker may serve cached CSS on top of that. So this
rests on the earlier device measurement plus Tom's own report of v434, not on
anything I ran today.

## v437

1. PROOF: unit.test.js ("every cosmetic any tier can be asked for is on disk", proved red by hiding assets/bh/thumb/192/C/C6.png), thumb-freshness-lint.mjs (FRESH + the MISSING half of both CONTROL rows) | REACH: Own Bumbleseal, open your Bonehead and tap Collection. Her tile draws her instead of a broken-image icon with "Bumblesea" spilling over it. Measured in the running app on e2cb252d with 363 cells on screen: 404 on assets/bh/thumb/192/C/C6.png, naturalWidth 0, and that tile is a bare <img> with no onerror to fall back with. 200 and naturalWidth 192 after. Anyone who does not own her never saw this and sees no change.
2. PROOF: thumb-freshness-lint.mjs (FRESH, proved red with the sixteen files restored to their pre-fix bytes: 18 drifted), memory-census.mjs (the four TIER rows, so the fix cannot have been bought by serving bigger art) | REACH: Open Collection, the Crew cards, the leaderboard or the melt bench and look at the banner, either torch, either shovel or any of the three grillz. They are the drawing Cam has had on the big screens since 2026-08-16 rather than the one before it. Measured off the render at deviceScaleFactor 3 across 16 surfaces: the eight items change, every other pixel on every surface is identical, and nothing is drawn at a different size or from a smaller source than before.

## v436

1. PROOF: today-peek-audit.mjs (AMBIENT + FILL, each proved red alone: a background put back on the scroller, and the strip's colour removed) | REACH: On Today, the page behind your quests and your day is the app's own dark purple again rather than flat black, and pulling down past the top opens a strip in your Bonehead's backdrop colour under the wordmark. Measured A/B in one run: byte-identical to the pre-v434 page at all four sample points, where the v435 build read rgb(13,12,18) at every one.
2. PROOF: friend-paddock-audit.mjs (VISITOR FACING, proved red on three separate trees: host flipped, guest flipped, neither) | REACH: Open a friend's paddock from their profile. You and your friend face each other across the field instead of standing back to back. Nothing about your friend has to change.
3. PROOF: memory-census.mjs (the OFF-DOM and TIER rows), unit.test.js ("every cosmetic the cropped tier can be asked for is on disk") | REACH: Open your Bonehead and tap Wardrobe. The hat tiles are drawn from art cut to the hat instead of a full-body square, so they are less soft. Measured per item on the rendered tiles rather than claimed: 51 of 57 hats land closer to the 640px master (RMS error 22.6 to 10.2), 52 are drawn from more source pixels, none from fewer, and no tile's art moved by more than 2px. The same screen decodes 39.8 MB of source bitmaps at once before and 10.8 MB after.

## v435

1. PROOF: friend-paddock-audit.mjs (CONTROL VISITOR / VISITOR x2, each proved red on its own defect: visitor absent, both figures on one side, visitor at half height) | REACH: Open Crew, tap a friend's card once to centre it and again to open their profile, then tap "Visit their paddock" under their pets. Your own Bonehead is standing in their field on the right, the same size as theirs on the left, turned to face them. Nothing about your friend has to change for this: it is your figure, drawn from your own equipment, on your own screen.
2. PROOF: today-peek-audit.mjs (CONTROL BLEED + BLEED, proved red by removing the fix: 3 of 4 gaps bleed) | REACH: On Today, the page behind and between your quests and your day is the normal dark page again, whatever backdrop your Bonehead is wearing. This is a fix for a regression shipped in v434, so a player on v434 is the one who saw it.

NOT CLAIMED IN v435, DELIBERATELY. The build also changes how the pull-down fill
colour is sampled: it now reads the backdrop through the same `saturate(0.92)`
the art is displayed with, which removes a five-unit blue step at the join
(tests/today-peek-audit.mjs SEAM, proved red at delta 5). It is a real fix and it
is in this build, but it is not in the player notes, because a smaller residual
survives that no flat colour can remove: .hero-scene composites a 7% grain and a
warm radial gradient over the art, lifting the rendered edge by a further
+3/+2/+4 with no hue shift. Whether that still reads as a line is a question for
Tom's eyes, not for a measurement, and "the seam is gone" is exactly the kind of
note this file exists to stop us writing before somebody has looked. It gets a
note in a later build if he confirms it, and more work if he does not.

## v434

1. PROOF: overscroll-wordmark-audit.mjs | REACH: On Today, pull down past the top. The strip you open up is the same colour as the art above your Bonehead instead of turning into the dark page behind the app, so pulling reveals the wordmark and not the edge of the screen. It follows whichever backdrop you have equipped.

## v433

1. PROOF: friend-paddock-audit.mjs | REACH: Open Crew, tap a friend's card once to centre it and again to open their profile, then tap "Visit their paddock" under their pets. You land in their field with their herd in it. A friend still on an older build has no paddock and no button offering one, which is the honest empty state rather than an empty field.

## v432

1. PROOF: kitchen-queue-audit.mjs | REACH: Open the Kitchen from Today. The empty pot card shows a cauldron, not a cookbook.
2. PROOF: today-peek-audit.mjs | REACH: Open Today on a phone with a notch or an island. The coins and chips sit just under the top edge instead of with a gap above them.

## v431

1. PROOF: transmog-clarity-audit.mjs | REACH: Open your Bonehead, tap a gear slot, and the look panel shows your Bonehead before and after right above the tiles. On for everyone; ?mogv2=0 returns the old screen if a bisect ever needs it.
2. PROOF: today-peek-audit.mjs, today-container-audit.mjs | REACH: Open Today on a phone with a notch or an island. The art runs to the very top instead of stopping at a line, and nothing below it moved.
3. PROOF: overscroll-wordmark-audit.mjs | REACH: On Today, pull down past the top. The wordmark slides in over the art. It draws on top now because behind it would be invisible once the art reaches the top.

## v430

1. PROOF: crew-fan-audit.mjs | REACH: Open Crew. A friend with a long title or nickname keeps their pet visible instead of it being cropped by the name plate.
2. PROOF: crew-fan-audit.mjs | REACH: Open Crew and look at the "thanks for being early" banner: the icon sits in the middle of its slot, not the corner.
3. PROOF: overscroll-wordmark-audit.mjs | REACH: On Today, pull down past the top. The wordmark slides in smoothly instead of stuttering.
4. PROOF: pet-hold-audit.mjs | REACH: Press and hold a pet, on Today or in the Stable, and what it is wearing lights up.
5. PROOF: badge-centre-audit.mjs | REACH: Walk fast enough on the Boneyard to see "Too fast to loot": the bolt is centred in its circle.

## Retired claims, kept because the mistakes are the point

- v429 "Changing how gear looks got a clearer screen" was `GATED ?mogv2`. It went
  out to players who could not reach it, and was removed on 2026-08-23.
- v429 "Test accounts no longer clutter the leaderboard" was
  `PENDING-DEPLOY the D1 migrations`. `is_test` still does not exist in
  production, so nothing changed for anybody. Removed the same day.
- v427 "Tap a friend and see their paddock" was `NEEDS-PEER the friend's upload`
  and, on the second pass, still missing the route: the crew deck is a carousel
  and one tap only centres the card. Now written as two taps, with the empty state
  named.


## 2026-09-07: R45 guard debts

This section supersedes the crate performance numbers in the earlier v500
crate-flick claim without changing that historical section. R45 measurements
supplied with the work order show burst drawArrays calls during the move fell
from 18 and 26 on v493 to zero on v509. That mechanism improvement stands.
The reported dropped-frame counts were 2 to 10, and six of ten moves exceeded
the audit's existing over20 <= 6 bound. The first flick still ran at half rate
in four of five runs (12 to 20 frames); the second ran full rate in every run.
A 520ms window contains about 31 frames at 60Hz, so 47 to 59 cannot describe
that window at 60Hz. These are supplied R45 results, not new browser measurements.
The first-flick app fix remains with the app lane.

1. PROOF: mimic-audit.mjs | REACH: A zero-frame reveal now prints a named CONTROL failure, marks the three dependent pixel rows UNPROVEN, and continues through the remaining DOM, timing and arena checks to a verdict. Missing ground capture also continues. The Node regression exercises the actual grading block; the full browser audit was not executable in this lane.
2. PROOF: boneyard-audit.mjs | REACH: ARRIVAL-SLOW requires the same ten-marker reveal-time sample as FAST. R45's one-marker sample is UNPROVEN, never a pass. Both laps explicitly force SwiftShader; their latency budget is now 400ms, stated in output as the 220ms fade plus 180ms software-compositor sampling slack, justified by R45's 260ms and 362ms readings. The 1200ms hold and missing visibility still fail. No phone timing claim is made.
3. PROOF: guard-debts-audit.mjs | REACH: GODMODE_DPR=3 or boot(base, { deviceScaleFactor: 3 }) opts into DPR 3. The override applies to boot and later viewport changes on the returned page, even legacy explicit DPR 2 calls, and asserts window.devicePixelRatio after each change. Unset retains DPR 2 at boot; setWidth preserves the page's current DPR. Node checks use a stub browser, not rendered art proof.
4. PROOF: crate-reveal-audit.mjs | REACH: FIRST FLICK 1->2 and SECOND FLICK 2->3 have independent cadence and burst-pause rows. Each 520ms window requires at least 25 rAF samples and retains over20 <= 6. A burst-draw control must see the actual canvas before the first tap; each move must record zero burst drawArrays calls. rAF samples are cadence evidence, not a count of compositor-rendered frames. Browser results remain unproven here.
5. PROOF: submission-build-audit.mjs | REACH: Explicit artifact inspection requires SUBMISSION=1, a schema-1 submission marker matching both artifact SHA256 hashes, and the existing native store-content preflight. No-argument execution runs labeled synthetic self-tests in PURE and certifies no build. Creating the marker during sync and enforcing inspection before submission require native integration outside this lane; manual builds can still bypass an unintegrated test. Unmarked artifacts cannot pass this guard.
6. PROOF: guard-debts-audit.mjs | REACH: Node-only regression checks execute the actual audit grading blocks with empty, undersampled and healthy fixtures. The pre-change grading code was restored on a throwaway copy and failed; restoring the changes passed. This does not substitute for the prohibited browser/server red-green runs.

R45-7, R45-8 and R45-11 remain unspecified: neither this checkout's Markdown
nor the frozen work order defines their defects. Proposed next step: recover
the three finding bodies and their reproductions, assign any app/native fixes
to their owners, then add guards against those observed states. No defect or
fix has been invented from an issue number. Detailed evidence, pending browser
commands and native integration proposal are in tests/wave-guards-report.md.
## R46 logging lane, 2026-09-07 (round two, advisory)

1. PROOF: r46-logging-audit.mjs | REACH: Add and Foods search include saved diary portions, fold accents for comparison, and disclose the true match total with the visible limit. Selecting history keeps its saved nutrition; a restored portion draft resolves the original diary row. Proven with real source functions and Node DOM doubles, not a browser reload or screen-reader session.
2. PROOF: r46-logging-audit.mjs, unit.test.js | REACH: Midnight advances the diary date and closes the prior day before a fresh row is written; edits retain their original date. Open sheet inputs survive because the router postpones teardown until the last sheet closes. R24-L17 is unchanged and passes. The complete unit command remains blocked by the local socket restriction in its serveTree check.
3. PROOF: r46-logging-audit.mjs | REACH: Online completion binds only its own rows; late recents cannot replace a newer search. Completing Add retires every sheet before bulk history traversal, so the lower relog control cannot accept the next tap during that traversal. A Node model running the real close functions and relog handler reproduced Banana at 105 kcal and history index zero before the fix. Physical tap targeting and actual about:blank navigation still require browser review.
4. PROOF: r46-logging-audit.mjs | REACH: Add's budget uses the same sum of rounded diary rows as Today. Five 100.4 kcal rows display and budget as 500 kcal, leaving 1500 against 2000.

R46-7 is deferred with a proposed common diary-date definition for Trends and the logging streak. R46-9, R46-10, R46-11 and R46-12 lack finding details in the frozen plans and checkout reports located in this review; no behavior change is claimed for those items. No release or deployment is claimed by this section.


## 2026-09-07: N2 audit completion and dependency disclosure

1. PROOF: audit-completion-audit.mjs | REACH: Tiered release-gate children preload a shared receipt that names interrupted runs, retains emitted failures, and refuses zero exits with incomplete declared row counts. Direct Godmode audits load the same receipt. Legacy counts are explicitly undeclared, not fabricated. A SIGKILL leaves START without END and the parent reports INCOMPLETE.
2. PROOF: audit-completion-audit.mjs | REACH: Godmode browser pages disclose external responses, HTTP status, failures, cache use and intercepted fixtures. Required Boneyard probes disclose both available and unavailable measurements, check a tile beyond TileJSON with bounded fetches, and mark subsequent required-host failures UNPROVEN without erasing real assertion failures. RAF and icon capability refusals and Water's unanswered HOME sample return 97 in Node fixtures.
3. PROOF: audit-completion-audit.mjs, guard-debts-audit.mjs | REACH: Mimic retains the earlier empty-frame grading fix and declares all 38 current rows (the original 37 plus its added zero-frame control). Its actual row helpers produce a complete 38/38 receipt or preserve the partial count and earlier failure on a throw. These are Node regression proofs, not new screencast or browser measurements.

Browser/server proofs were prohibited in this lane. The PURE array currently has
64 files: 62 exited 0; unit.test.js and serve-tree-identity-audit.mjs were not run
because they require local servers. This is not a claim that all PURE files or
all browser audits passed. The advisory evidence and deviations are recorded in
tests/n2-report.md.
## N3 dead paths and audit artifacts, 2026-09-07 (advisory)

1. PROOF: n3-deadpaths-audit.mjs, today-container-audit.mjs | REACH: Today audit screenshots, the Today capture helper, the level-paid trace default and the figure decoder fixture resolve to temporary storage. Each original path was restored separately in a throwaway copy and failed the Node path guard; the restored fixes passed. Browser screenshot execution remains unproven. The sibling-owned serveTree still writes an identity marker into its served root, so this is not a claim that every audit is read-only.
2. PROOF: race-audit.mjs, n3-deadpaths-audit.mjs | REACH: Today > News > The weekly step race now reads the equipped outfit before opening its poster. The browser row uses real controls after a masked reload and requires all seven decoded expected layers. Node execution of the real News callback through the real poster function to its renderer input failed on the original app.js with missing 5: H11-1 FW1 IL1-1 IR10-3 P1, then passed after restoration. Browser red/green remains pending independent review.
3. PROOF: garden-closed-audit.mjs, hollow-beds-audit.mjs, hollow-backdrop-audit.mjs, figure-audit.mjs | REACH: UNREACHABLE. The Hollow's player doors were removed on 2026-08-18. Its feature code is retained for a product deletion decision; module probes are not player coverage. The figure register no longer cites the deleted hollow-audit.mjs as a live walkthrough.
4. PROOF: mage-audit.mjs, reward-sop-audit.mjs | REACH: UNREACHABLE. The retired bestiaryBannerHtml probe now identifies itself in comments and printed row names. The reward register no longer claims a GROW door opens the Hollow and explicitly marks the Hollow payout as unreachable. Neither retired feature is reopened.

The agreed unit command returned 362 passed, 1 failed at the socket-dependent
serveTree lifetime check. Final PURE status is 62 of 64 exit 0; that unit failure
and the prohibited serve-tree-identity server proof prevent an all-green claim.
See docs/N3-REPORT.md for exact red/green output, the write-site sweep,
file ownership blockers and proposed deviations. No release is claimed.
## N1 harness environments, 2026-09-07 (advisory)

1. PROOF: harness-environment-audit.mjs | REACH: Explicit boot options emulate timezone and Chrome Intl locale before navigation. Orientation selects 393x852 or 852x393 with mobile and touch flags. Unset options preserve the previous calls. Node doubles verify plumbing and negative controls; actual browser emulation remains unproven in this sandbox.
2. PROOF: today-container-audit.mjs | REACH: This audit opts into Pacific/Kiritimati. Its SCROLL expectation subtracts a local calendar day without converting to UTC. The original expression fails the Node UTC+14 fixture; restoring the local expression passes. Browser SCROLL and its original scroll-reset mutation remain pending review.
3. PROOF: two-tap-audit.mjs | REACH: This audit opts into de-DE and checks the exact price formatted in the page. The original comma-only predicate fails the German Node fixture. Browser taps remain pending review.
4. PROOF: honest-surfaces-audit.mjs | REACH: The demo page opts into de-DE. Wallet toasts must contain the actual balance formatted in that page. The original comma-only predicate fails a correct German fixture. The separate cloud page retains its previous environment. Browser purchases remain pending review.
5. PROOF: orientation-audit.mjs | REACH: New browser guard checks real Intl/timezone state before and after reload, landscape lock visibility, full viewport coverage and hit interception, portrait release, and a real Settings click. Node grading controls reject an absent landscape cover and a stuck portrait cover. Browser and server execution are prohibited here, so no rendered green or browser mutation proof is claimed.

The agreed unit command reported 362 passed and 1 failed at its embedded serveTree check. The standalone serve-tree identity proof was not run because it requires a server. Full evidence and pending reviewer commands are in tests/n1-report.md. No release is claimed.

## M3 branch graveyard, 2026-09-07 (advisory)

1. PROOF: branch-graveyard-audit.mjs | REACH: The read-only branch classifier uses head containment in recorded main or a merged PR, including release-train containment. It rejects name-only, reused-head, wrong-repository and incomplete evidence. Node fixtures pass; live GitHub evidence is unavailable in this sandbox.
2. PROOF: branch-graveyard-audit.mjs | REACH: The frozen report reproduces all 953 captured branches: 147 integrated in recorded main, zero established genuinely unmerged, 806 uncertain. A throwaway reintroduction of the documented phantom-unmerged defect failed on origin/art/cauldron-swap; the restored classifier passed 21/21 guards.
3. PROOF: branch-graveyard-audit.mjs | REACH: Deletion preview requires both explicit flags, protects main and suppresses candidates when inventory freshness is unverified. The captured preview retains all 953 branches. There is no deletion executor and no branch was deleted.

Network failure prevents a current remote inventory and PR-backed classification. Registering this audit in PURE is pending because the existing release-gate file is outside M3 ownership. Exact proof output, the proposed registration, limitations and deviations are in docs/M3-REPORT.md. No commit, push, publication or release is claimed.
## M4 App Store surface, 2026-09-07 (advisory)

1. PROOF: submission-build-audit.mjs | REACH: Both native build channels refuse missing export options before bundling, sync, ASC lookup or archive. The original script was restored in a throwaway copy and failed both new rows; restoring the check passed. Platform and ASC executables were fixtures only. File presence does not validate signing or plist contents.
2. PROOF: store-runtime-audit.mjs | REACH: The real web producer in a temporary checkout copies 54 application/data modules and resolves 180 literal entry, CSS and import references. Its service-worker condition skips capacitor and admits the HTTPS control. These are Node checks, not native launch or pixel proof.
3. PROOF: store-runtime-audit.mjs | REACH: BLOCKED. The actual bundled hardRefresh requests missing version.json and displays a false no-connection message. The final checkout exits 1 with 4/5 rows passing. An App Store explanation guard proposed only in a throwaway copy passes 5/5, fails when reverted to the actual defect, and passes when restored. The app.js owner must implement and operate the real control; no application fix is claimed here.
4. PROOF: store-copy-lint.mjs, submission-preflight-audit.mjs | REACH: Existing store-copy and submission-preflight checks pass in this checkout. They do not establish an installed or submittable binary. Current metadata sources, remaining Tom actions, evidence and limitations are in docs/SUBMISSION-CHECKLIST.md and docs/M4-REPORT.md.
## M2 diary consistency, 2026-09-07 (advisory)

1. PROOF: r46-diary-audit.mjs | REACH: Progress counts a zero-calorie diary row as a logged day, including in the intake averages. The existing activity streak can also count a day with 3000 steps; that distinct rule and all rewards remain unchanged. Node executes the actual recap markup on a gapped ledger and after deleting the zero-calorie row.
2. PROOF: r46-diary-audit.mjs | REACH: Add already uses Today's sum of rounded diary rows in this checkout. The existing fix is retained and verified with 872 displayed kcal and 1668 left. Copy chips now use that same displayed total while committed nutrition remains unrounded. Historical chips and completion toasts identify the actual source date. Node operates the real copy callback through commitLogEntry into storage doubles and renders the resulting meal.
3. PROOF: r46-diary-audit.mjs | REACH: Historical empty meals and sign-offs describe the displayed day without today's time promises. Today's existing speech is retained. Every speech selector value is exercised in Node.
4. PROOF: r46-diary-audit.mjs | REACH: Today's Back button disables and its callback stops at account creation, or an older imported diary row. Missing or invalid creation dates fall back to the first diary row or today. Node operates the actual arrow callback and evaluates its actual markup; browser hit testing remains unproven.

R46-13 remains a design ruling for Tom: whether a meal started before midnight
should retain that start date, warn, offer a move, or keep commit-time dating.
No ruling, version stamp or release is made here. Browser/server proofs are
prohibited; the advisory report records Node results and outstanding proofs.


**Scope and files changed.** `js/app.js` (logging, Trends and day-arrow sites),
`tests/r46-diary-audit.mjs` (new Node guard), `tests/release-gate.mjs` (one PURE
registration with a description), and `docs/CLAIMS.md` (this single dated section).
`js/nutrition.js` and `js/sources.js` needed no changes. Supporting guard,
registration and CLAIMS edits implement the work order's explicit instructions;
no sibling-owned runtime site was changed.

The supplied plan file's SHA256 matched
`eb17611b3c57e16bf553254eb5bbeba93f91782fb90133bb26de5a99b03cd346`.
The checkout's root `CLAUDE.md` and round 46's full handoff text were read.
`tally/CLAUDE.md` is absent in this checkout; the available root contract was
used. Source edits and historical source reads used this checkout only. The
external handoff was read, never edited.

**Diagnosis and implementation choices.** A logged food day means at least one
diary row, because the logging streak uses row dates and a zero-calorie drink
is still a recorded entry. Trends' separate activity streak also counts walked
days. That existing rule remains, so an activity streak is not a count of food
logging alone. Copying on a historical date continues to copy the displayed
date's preceding day, with that source date now named explicitly. The first
navigable date is the earlier of creation and existing diary history, preserving
older imports. Missing or invalid creation metadata falls back to the earliest
row or today. These choices add no migration or reward change.

**Red/green evidence.** The guard executes actual source functions, rendered
HTML expressions and registered click callbacks. Database and DOM dependencies
are Node doubles, not IndexedDB durability or browser interaction proof. Each
run's exit status was saved directly to an `.exit` file, without a pipe.

The unmodified starting `js/app.js` was copied into a throwaway tree, the new
audit was run against it, and the fixed source was restored there and rerun.
Original-source output: `1/6 guards passed`, exit 1. The sole green case was
R46-8, already fixed before this work. Restored output: `6/6 guards passed`,
exit 0. Exact failure excerpts:

| Finding | Original-source failure |
| --- | --- |
| R46-7 | `zero-calorie day omitted from rendered 6/7 recap` |
| R46-9 | `chip promises 722 kcal but copied meal displays 723` |
| R46-10 | `historical chip must name 2026-08-28: ↺ Copy yesterday's Breakfast (722 kcal)` |
| R46-11 | `historical Breakfast still uses today's empty copy: Nothing yet. The day is young and so are you, relatively.` |
| R46-12 | `back arrow walked past account history to 2026-08-13` (expected `2026-08-28`) |

Additional isolated reversions all exited 1, then exited 0 after restoring the
fix on the same throwaway copy:

- R46-8: restored `dayBudget`'s actual v511 (`fadb5cf7`) expression,
  `const tot = dayTotals(entries);`. Failure: `Add used 870 instead of Today's 872`.
  The corresponding displayed remaining budget is 1670 instead of 1668.
- R46-10 completion toast alone: `historical toast must name 2026-08-28: Copied 3 items from yesterday`.
- R46-11 sign-off alone: `The input did not match the regular expression /recorded for this day/. Input:` followed by `'Nothing written down yet. I will be here.'`.
- R46-12 disabled markup alone: `The input did not match the regular expression /\sdisabled[\s>]/. Input:` followed by the original `prevDay` button without `disabled`.

Final `node tests/r46-diary-audit.mjs` output, exit 0:

```text
PASS R46-7 zero-calorie row counts: 6/7 logged, streak 9; deletion gives 5/7 and 5
PASS R46-8 Add and Today both show 1668 left after 872 displayed kcal
PASS R46-9 copy chip and callback agree on source date, 723 kcal and stored meal
PASS R46-10 copy chip and callback agree on source date, 723 kcal and stored meal
PASS R46-11 past empty meals and sign-offs never speak as today, across every speech choice
PASS R46-12 actual back-arrow callback stops at creation and marks its button disabled
6/6 guards passed
```

The nine-day streak fixture has no entry today and a zero-calorie row six days
back. Deleting that row leaves five prior consecutive logged days. It is an
independent deterministic fixture of the reported disagreement, not a claim to
have recreated the original browser save or its exact post-delete streak of 6.

**Agreed proof.** `node tests/unit.test.js` was run without skips or weakened
assertions. Exit 1, output:

```text
FAIL serveTree does not hold the event loop open after the script ends
  serveTree kept node alive, so a self-serving audit can never exit: Command failed: /Users/tommiller/.nvm/versions/node/v22.22.2/bin/node --input-type=module -e import { serveTree } from "/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/ad578513-d00a-4ff9-bdb3-c31e94189b3d/scratchpad/m2-r46rest/tests/godmode.js";
    const own = await serveTree("/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/ad578513-d00a-4ff9-bdb3-c31e94189b3d/scratchpad/m2-r46rest");
    process.once('exit', () => own.close());

362 passed, 1 failed
```

The failure is in the embedded socket-dependent `serveTree` check. Its child
stderr is suppressed by the existing unit test, so this run does not provide a
more specific operating-system error. No all-green unit result is claimed.

**Release proofs.** The actual PURE array, including its push/unshift entries,
contains 68 files. Each permitted file was invoked directly with Node, with
stdout/stderr and exit status saved separately. Results: 66 exit 0, the unit
command above exit 1, and `serve-tree-identity-audit.mjs` not run because it
requires local servers. The all-PURE-exit-0 success criterion is therefore
unmet in this sandbox. `node tests/release-gate.mjs --coverage-only` exited 0:

```text
coverage: 311 audits on disk, 115 fast, 128 full, 68 skipped
```

PURE files that exited 0:

```text
version-align-lint.mjs  0
no-debug-markers-lint.mjs  0
store-copy-lint.mjs  0
transmog-receipt-audit.mjs  0
today-reads-lint.mjs  0
kitchen-atomic-audit.mjs  0
backup-encoder-audit.mjs  0
backup-key-audit.mjs  0
backup-version-audit.mjs  0
backup-conflict-audit.mjs  0
log-xp-farm-audit.mjs  0
drip-badge-audit.mjs  0
xp-key-provenance-lint.mjs  0
facegate-audit.mjs  0
garden-appetite-guard.mjs  0
pit.test.js  0
quest-daymore-audit.mjs  0
quest-pick-audit.mjs  0
first-fight-audit.mjs  0
stat-source-audit.mjs  0
bastions-rep-sim.mjs  0
analytics-tag-audit.mjs  0
icon-inventory-audit.mjs  0
version-stamp-audit.mjs  0
boneyard-supply-audit.mjs  0
loot-fallback-audit.mjs  0
guard-hygiene-lint.mjs  0
guard-provenance-lint.mjs  0
feedback-status-lint.mjs  0
rack-theme-lint.mjs  0
rack-rotate-audit.mjs  0
pet-accessory-lint.mjs  0
pet-pool-audit.mjs  0
manifest-exports-audit.mjs  0
xp-curve-audit.mjs  0
live-api-register-lint.mjs  0
claim-evidence-lint.mjs  0
thumb-freshness-lint.mjs  0
render-sink-lint.mjs  0
lapse-witness-audit.mjs  0
spawn-claim-atomic-audit.mjs  0
wardrobe-family-audit.mjs  0
football-kit-audit.mjs  0
restore-latch-audit.mjs  0
first-pet-audit.mjs  0
currency-revision-lint.mjs  0
inv-tombstone-audit.mjs  0
take-and-pay-audit.mjs  0
r47-rest-audit.mjs  0
r47-economy-audit.mjs  0
submission-build-audit.mjs  0
harness-environment-audit.mjs  0
guard-debts-audit.mjs  0
submission-preflight-audit.mjs  0
pet-state-audit.mjs  0
pet-family-audit.mjs  0
coins-merge-tie-audit.mjs  0
routine-race-audit.mjs  0
dayone-topup-audit.mjs  0
dish-worth-audit.mjs  0
pet-C-node-guard.mjs  0
r48-state-audit.mjs  0
r46-logging-audit.mjs  0
r46-diary-audit.mjs  0
audit-completion-audit.mjs  0
n3-deadpaths-audit.mjs  0
```

**Blocked actions and deviations.** No commit, push, PR, publication, deployment,
version stamp, changelog edit, native change, App Store Connect call or Worker
operation was performed. The user's no-commit/no-push instruction overrides the
plan's contradictory commit-and-push line. No automatic approval rejection was
received. Browser/server proofs were prohibited by the work order and sandbox;
no browser or standalone server proof was attempted. The explicitly requested
unit command nevertheless contains the server check reported above.

R46-8 required verification of an existing fix rather than another source edit.
The missing nested contract and unachievable all-PURE-green criterion are
reported above, not silently replaced. Proposed verification deviation: accept
these Node results provisionally and have the independent reviewer run the
remaining proofs in a socket-capable environment. No guard was weakened to
make that criterion appear satisfied.

Pending reviewer proofs, with expected results rather than measured passes:

- `node tests/unit.test.js`: `363 passed, 0 failed`, exit 0, once its local server can start.
- `node tests/serve-tree-identity-audit.mjs`: `PASS  WRONG-TREE`, exit 0.
- Load `tests/ui-audit.js` in the running local app and call `await uiAudit()`:
  expected `pass: true` and an empty `problems` array. Operate Back at creation,
  an older imported date, and one date after each bound; confirm disabled
  appearance, focus behavior and hit testing. Browser results remain unproven.
- In the local app, seed a gapped ledger containing a zero-calorie row and
  fractional portions. Read Progress before/after deleting the zero row,
  operate historical Copy, and inspect stored rows and resulting meal after
  reload. Expected chip total equals the rendered meal, source date equals the
  named preceding date, and past empty-day text has no today-only promise.

Raw logs and throwaway copies are in `/private/tmp/m2-r46-proof`. This report is
advisory for independent review and is not release approval.


## K1, 2026-09-07: App Store updates and guard controls

Advisory implementation report for independent review. No release approval is
claimed. Frozen plan SHA256 verified as
`5e902dada55d0406102247336752c9ed6d7dc00e0df9507e11e3d6986c465aa4`.
All source paths were resolved against this checkout. The root `CLAUDE.md` was
read before editing; `tally/CLAUDE.md` does not exist here.

1. PROOF: store-runtime-audit.mjs | REACH: Store Settings > App version > How to update explains App Store updates. Background checks in Settings, Today and Progress return without a web version fetch. Browser/device operation is pending.
2. PROOF: guard-hygiene-lint.mjs, branch-graveyard-audit.mjs | REACH: Node-only real controls observe web updater effects and a shipped head from the same captured branch inventory. The existing ceiling remains 49.
3. PROOF: submission-preflight-audit.mjs | REACH: The gate recognizes all current top-level runnables and refuses an injected unregistered one. The lookup scanner is an imported helper under tests/lib.
4. PROOF: lookup-guard-lint.mjs, m5-prove-red.mjs | REACH: A bounded source scan reports four reviewed candidates and rejects real species/equipped-art regression mutations. It does not cover the entire defect class.

**Files changed (7).**

- `js/app.js`: two STORE_BUILD early returns, App Store Settings explanation and button label. Existing web updater bodies are byte-identical after removing those two returns; the web Settings row renders identical bytes.
- `tests/store-runtime-audit.mjs`: retained bundle/config/path checks, added real web positive controls, store background checks, Settings copy and handler reach assertions. The same extracted functions and instruments observe web fetches, banner binding, worker update and reload.
- `tests/branch-graveyard-audit.mjs`: added a nonempty, reachable non-main head control from the captured snapshot, checked against the same classified rows. It fails if the classifier stops recognizing shipped heads.
- `tests/release-gate.mjs`: documented the existing scanner helper location and updated the store audit description. No tier, allowance, threshold or executable registration changed.
- `tests/lookup-guard-lint.mjs`: made true-positive/false-positive counts explicit and corrected its review-document reference. No scanner rule or reviewed-site allowance changed.
- `docs/lookup-guard-review.md`: added the missing precision/coverage review, including evidence for each candidate.
- `docs/CLAIMS.md`: appended only this dated K1 section.

**Three named guards.**

| Guard | Baseline | Final | Fixed the change or the guard? |
| --- | --- | --- | --- |
| store-runtime-audit.mjs | Exit 1, 4/5 | Exit 0, 13/13 | Fixed the app defect; also strengthened the guard with controls and background coverage. |
| guard-hygiene-lint.mjs | Exit 1, 51 of 297 lack controls | Exit 0, 49 of 297 lack controls | Fixed the two audits' missing controls. The hygiene lint and its ceiling were not edited. |
| submission-preflight-audit.mjs | Exit 0 | Exit 0 | Already resolved in this checkout. Documented the actual helper layout, with no guard weakening or duplicate registration. |

`first-run-honesty-audit.mjs` already has a meaningful positive premise: it
observes one real first-run splash insertion using the same instrument that
requires zero returning-user insertions. It did not cause this ratchet failure.
Its browser proof was not run. `m5-prove-red.mjs` already emits measured CONTROL
rows requiring exact replacement counts, expected child exits and failure text.
It passed all seven mutations and restored-green runs. It needs no exception;
its filename is also outside the hygiene lint's audit filename pattern.

**Agreed proof command.**

`node tests/guard-hygiene-lint.mjs && node tests/store-runtime-audit.mjs`

Executed unchanged, exit 0. Output:

```text
ok    SETUP the lint found test files to scan  333 files
ok    RUNNER no case is registered after the runner has already drained  none
ok    SETUP the audit scan is not vacuous  297 audits
ok    CONTROL the number of audits with NO positive control does not rise above 49  49 of 297 carry no CONTROL/PREMISE/SETUP/REACH/SAMPLE row. ratchet holding
ok    LITERAL-TRUE no audit asserts a constant success (including NO page errors)  0 offenders
ok    LITERAL-TRUE the ten justified reports are excused exactly once  10 excused; 0 stale or duplicated
ok    CONTROL literal-true catches a new offender even inside an excused file
ok    PARSES every audit is something Node will actually execute  333 files parse
ok    SEAM no NEW audit proves a feature only through a test hook  29 known seam-only, 0 new
ok    SEAM the seam-only inventory has no stale entries (fixed one? delete its line)  inventory matches

guard-hygiene: clean
PASS real web bundle producer completes in throwaway checkout
PASS generated store config is local and bundled flag is true
PASS bundle paths: 54 modules, 180 literal entry/CSS/import references, missing=[], root-absolute=[]
PASS real service-worker condition skips capacitor and admits HTTPS control
PASS CONTROL web Settings update row retains identical rendered bytes
PASS store Settings names the update channel before the player taps
PASS REACH Settings update button is bound to the audited handler
PASS store refresh must explain App Store updates without web fetch/reload: calls=[], messages=["To update Boneheadz Gym, open the App Store and check for updates."]
PASS store background update checks never fetch or show a web banner: calls=[]
PASS CONTROL web stale banner observes the live version and binds its update button
PASS CONTROL web banner click updates the waiting worker without a premature reload
PASS CONTROL web refresh without a worker fetches and reloads
PASS CONTROL offline web refresh retains its connection message without reloading
LIMIT: literal path inventory and VM functions only; dynamic assets, WKWebView APIs and rendered controls require device proof.
store runtime: 13/13 passed
```

Submission proof, exit 0:

```text
PASS  COVERAGE registered helper  exit 0 (want 0)  coverage: 316 audits on disk, 116 fast, 128 full, 72 skipped
PASS  COVERAGE unregistered runnable refused  exit 1 (want 1)  FAIL  coverage: 1 declared audit file(s) belong to no running tier:
        unregistered-store-fixture.mjs
submission preflight: refuses marker, flag, server and copy defects; passes the control
```

The `FAIL` inside that second coverage row is the expected child negative
control. The parent audit exited 0.

**Red/restored-green evidence.**

Every mutation was made on a throwaway copy under `/private/tmp/k1-proof`,
with exact-once replacements asserted. The original app was saved before any
edit, restored on the throwaway tree, and tested with the strengthened guard.
Each child output and exit status was saved separately; no exit code was read
through a pipe. The working source was never reverted.

Baseline actual bundled-path failure, exit 1:

```text
FAIL store refresh must explain App Store updates without web fetch/reload: calls=["version.json"], messages=["No connection. Try again when you have signal"]
store runtime: 4/5 passed
```

Strengthened audit on the original app, exit 1 (its instrument supplies a newer
web version, proving the incorrect store update/reload path too):

```text
FAIL store Settings names the update channel before the player taps
FAIL store refresh must explain App Store updates without web fetch/reload: calls=["version.json","reload"], messages=["Getting the latest build..."]
store runtime: 10/13 passed
```

Remove only the background gate, exit 1:

```text
FAIL store background update checks never fetch or show a web banner: calls=["version.json","version.json"]
store runtime: 12/13 passed
```

Disconnect the web fetch, exit 1:

```text
FAIL CONTROL web stale banner observes the live version and binds its update button
FAIL CONTROL web banner click updates the waiting worker without a premature reload
FAIL CONTROL web refresh without a worker fetches and reloads
FAIL CONTROL offline web refresh retains its connection message without reloading
store runtime: 9/13 passed
```

Misclassify reachable heads, exit 1:

```text
FAIL CONTROL captured reachable head is shipped and appears in the same classified rows: Expected values to be strictly equal:
Branch graveyard audit: 18/22 passed.
```

Restore the two pre-K1 audits on the throwaway tree, exit 1:

```text
FAIL  CONTROL the number of audits with NO positive control does not rise above 49  51 of 297 carry no CONTROL/PREMISE/SETUP/REACH/SAMPLE row.
guard-hygiene: 1 FAILED
```

Restore fixed sources and controls, all exit 0:

```text
store runtime: 13/13 passed
Branch graveyard audit: 22/22 passed.
guard-hygiene: clean
PASS existing latestBuild, hardRefresh and checkForUpdate bytes identical after removing the two store-only early returns.
```

The existing M5 runner also proved both lookup regressions red and then green:

```text
PASS CONTROL red-pet-species: exit 1, expected 1
FAIL NEW unresolved lookup guard: js/app.js:19886 x.sp
PASS CONTROL red-equipped-art: exit 1, expected 1
FAIL NEW unresolved lookup guard: js/app.js:16973 baseArtId
PASS CONTROL restored-lint: exit 0, expected 0
lookup-guard: PASS
m5-prove-red: PASS
```

**Lookup precision and limits.**

Measured 54 source modules and 4 candidates: **2 true positives for missing
boundary validation, 2 false positives, 0 unreviewed, 0 proven crashes**. Both
true positives pass a merely-present peer pet id into a renderer. One false
positive misses the catalogue filter upstream of `lurkSp`; the other misses the
same-expression catalogue check for `petArtId`. Boundary precision is 50%.

The scan is useful as a narrow reviewed-candidate ratchet. Cheap lexical matching
cannot reliably cover the full absent-versus-unresolvable class. Broader coverage
needs validated data boundaries, runtime tests using unknown ids at the final
consumer, and an AST/control-flow approach if a static guarantee is required.
The seven historical incidents are not seven measured detections. See
`docs/lookup-guard-review.md` for the complete site review and limitations.

**PURE enumeration and measured results.**

The runner evaluated the actual `const PURE` initialization and every subsequent
push/unshift through `const BROWSER` in `tests/release-gate.mjs`, without executing
the release gate or starting its server. It asserted a nonempty, unique inventory.
All 72 entries are listed below in their derived order. **70 passed, 0 executed
entries failed, 2 were blocked and not run.** Each executed entry has separate
stdout/stderr and exit files under `/private/tmp/k1-proof/pure`.

```text
version-align-lint.mjs  0
no-debug-markers-lint.mjs  0
store-copy-lint.mjs  0
transmog-receipt-audit.mjs  0
today-reads-lint.mjs  0
kitchen-atomic-audit.mjs  0
backup-encoder-audit.mjs  0
backup-key-audit.mjs  0
backup-version-audit.mjs  0
backup-conflict-audit.mjs  0
unit.test.js  BLOCKED, NOT RUN: local server required
log-xp-farm-audit.mjs  0
drip-badge-audit.mjs  0
xp-key-provenance-lint.mjs  0
facegate-audit.mjs  0
garden-appetite-guard.mjs  0
pit.test.js  0
quest-daymore-audit.mjs  0
quest-pick-audit.mjs  0
first-fight-audit.mjs  0
stat-source-audit.mjs  0
bastions-rep-sim.mjs  0
analytics-tag-audit.mjs  0
icon-inventory-audit.mjs  0
version-stamp-audit.mjs  0
boneyard-supply-audit.mjs  0
loot-fallback-audit.mjs  0
guard-hygiene-lint.mjs  0
guard-provenance-lint.mjs  0
feedback-status-lint.mjs  0
rack-theme-lint.mjs  0
rack-rotate-audit.mjs  0
pet-accessory-lint.mjs  0
pet-pool-audit.mjs  0
manifest-exports-audit.mjs  0
xp-curve-audit.mjs  0
live-api-register-lint.mjs  0
claim-evidence-lint.mjs  0
thumb-freshness-lint.mjs  0
render-sink-lint.mjs  0
lapse-witness-audit.mjs  0
spawn-claim-atomic-audit.mjs  0
wardrobe-family-audit.mjs  0
football-kit-audit.mjs  0
restore-latch-audit.mjs  0
first-pet-audit.mjs  0
currency-revision-lint.mjs  0
inv-tombstone-audit.mjs  0
take-and-pay-audit.mjs  0
branch-graveyard-audit.mjs  0
store-runtime-audit.mjs  0
r47-rest-audit.mjs  0
r47-economy-audit.mjs  0
submission-build-audit.mjs  0
harness-environment-audit.mjs  0
guard-debts-audit.mjs  0
submission-preflight-audit.mjs  0
pet-state-audit.mjs  0
pet-family-audit.mjs  0
coins-merge-tie-audit.mjs  0
routine-race-audit.mjs  0
dayone-topup-audit.mjs  0
dish-worth-audit.mjs  0
serve-tree-identity-audit.mjs  BLOCKED, NOT RUN: local server required
pet-C-node-guard.mjs  0
r48-state-audit.mjs  0
r46-logging-audit.mjs  0
r46-diary-audit.mjs  0
audit-completion-audit.mjs  0
n3-deadpaths-audit.mjs  0
m5-prove-red.mjs  0
lookup-guard-lint.mjs  0

```

**Blocked actions and deviations.**

The success criterion requiring every PURE entry to exit 0 remains unmet.
`unit.test.js` starts a server for its serveTree process-lifetime test, and
`serve-tree-identity-audit.mjs` requires real local sockets. The work order
explicitly prohibits server/browser proofs. Neither whole file was run or
silently modified to pass. Proposed verification deviation: the independent
reviewer runs these two files in a socket-capable environment. Expected, not
measured here: `363 passed, 0 failed` for unit.test.js and `PASS WRONG-TREE` for
serve-tree-identity-audit.mjs, both exit 0. The M5 runner did separately execute
its three extracted unit test bodies; this is not a full unit-suite pass.

Browser/device verification remains pending. In a real store bundle, open
Settings, operate How to update, and visit Today and Progress. Expected: the
App Store explanation, zero version.json requests, no web update banner or
reload. Run first-run-honesty-audit.mjs in the reviewer environment; expected
8/8, not measured here. UI audit, hit testing and WKWebView behavior were not
claimed from Node VM/source checks.

The plan names `tests/lookup-guard-scan.mjs`, but this checkout already places it
at `tests/lib/lookup-guard-scan.mjs` and registers the actual runnable lint once
in PURE. The helper was declared in the gate comments instead of adding a
nonexistent top-level runnable or a redundant tier entry. Preflight was already
green at baseline. The two audits actually missing recognized positive controls
were store-runtime and branch-graveyard. No m5-prove-red exception was needed.

The opening K1 ownership grant (all merged lanes, no siblings running) was used
over the stale boilerplate about three sibling lanes and unspecified ownership
lists. The user's no-commit/no-push instruction overrode the plan's contradictory
commit-and-push line. No version stamp, changelog edit, PR, commit, push,
publication, deployment, App Store Connect or Worker operation was performed.
No tracked native file, native/ASC-SUBMISSION.md, or integ/day5 file was edited.
No original checkout was edited. Dependency packages were read through this
checkout's existing node_modules symlink only.

No automatic approval rejection or permission-denied tool action occurred.
Missing tally/CLAUDE.md and the plan's missing scanner path are explicitly
reported above. The browser/server prohibition was honored without an attempted
bypass. The all-PURE-green criterion is pending reviewer proof, not certified.

Evidence and reproduction scripts: `/private/tmp/k1-proof`. This section and the
final changes are advisory inputs to the independent review.
## 2026-09-07: L1 machine character and R45-5 correction

This section supersedes the first-flick conclusion in the R45 guard-debts
section and the earlier v500 cadence numbers. It leaves those historical
sections intact. The supplied measurements establish the v500 mechanism:
burst drawArrays calls during a move fell from 18 and 26 on v493 to zero on
v509. Preserve that mechanism. The historical 47 to 59 frame claim was not
reproducible even on the reporting machine under the stated conditions. A
520ms hold contains about 31 frames at 60Hz, so 47 to 59 cannot describe that
window at that refresh rate. rAF callbacks are cadence samples, not proof of
compositor-presented frames.

The work order supplies a v513 remeasurement from five fresh browser processes
and profiles with FLICK_TRACE_DIR enabled: first samples 49, 46, 59, 58, 47;
second samples 43, 57, 59, 58, 43; first over20 gaps 4, 4, 1, 1, 5 against the
unchanged bound of 6. It reports 81/81 rows passed, exit 0. None of the five
first flicks reproduced R45's <=20 samples, and three first flicks sampled more
than their second. These are supplied observations, not a new browser proof
from this lane; the referenced scratchpad evidence log is absent here. The
trace adds profiling overhead. First-flick asymmetry is environment-specific
pending reproduction. If Tom's QA rig still reproduces 12 to 20 frames, build
and verify a fix there. Do not infer a universal defect or undo v500.

1. PROOF: machine-character-audit.mjs | REACH: Every result row from the shared browser wrapper carries machine character: host CPU/load, Chromium/renderer, page identity, viewport, CPU throttle history, attached trace history and an observed baseline cadence with its sampling state. FLICK also samples the settled Crates tab before OPEN and after optional trace start. Empty, refused and timed-out baseline probes say UNAVAILABLE. The Node controls prove emitted receipts, trace overhead disclosure after stop, separate pages and bounded probe cleanup; they do not prove browser performance.
2. PROOF: crate-reveal-audit.mjs | REACH: FIRST FLICK and SECOND FLICK retain the 520ms window, minimum 25 rAF samples, over20 <= 6, zero burst draw calls and 200ms long-task ceiling. The audit prints the environment-specific interpretation and QA-rig reproduction requirement. Browser/server proof is blocked by the work order and remains for independent review.
3. PROOF: fx-audit.js | REACH: The FX cache load-time precondition prints machine character even though its legacy measurement line is not a PASS row. FX setup failures on stderr and its OK frame-life rows also carry the shared disclosure. No timing threshold changed.

## P1 round 48 remainder, 2026-09-07

1. PROOF: p1-r48-rest-audit.mjs, art-resolution-audit.mjs | REACH: Audit-only change. Every declared art surface must contribute decoded layers; Crew receives a friend fixture and is sampled in its own fan. Missing inputs fail SETUP and cannot certify RESOLUTION or SMOOTH. The original five-screen and four-screen predicates were reproduced red in Node; populated browser rendering remains unrun.
2. PROOF: p1-r48-rest-audit.mjs, hollow-beds-audit.mjs, hollow-backdrop-audit.mjs, garden-closed-audit.mjs | REACH: UNREACHABLE. Retain closed-door and module guards pending Tom's product decision. Both dedicated module probes now print zero player coverage. No Hollow feature was deleted or reopened. Product choices and Node red/green evidence are in docs/P1-R48-REPORT.md.
3. PROOF: p1-r48-rest-audit.mjs, n3-deadpaths-audit.mjs, race-audit.mjs, reward-sop-audit.mjs | REACH: Existing corrections confirmed. The race ANNOUNCE row uses masked real News controls and the reward register identifies the deleted GROW door. Reintroducing the original News callback in a throwaway copy fails with missing 5: H11-1 FW1 IL1-1 IR10-3 P1; restoration passes. Browser proof remains pending.
## 2026-09-07: P3 restore hardening and unresolved debt

Advisory lane evidence, not a release certification. The frozen work order hash
matched. Changes are confined to js/db.js, js/loot.js, tests and the explicitly
requested docs. No version stamp, changelog, commit, push or publication.

1. PROOF: restore-state-audit.mjs | REACH: Settings file import and cloud merge reach production importAll, followed by actual equipment, receipt and export readers. Invalid known containers, duplicate kv keys and unsupported pet bank formats refuse before store writes. Receipt unions preserve both sides on merges. Unsupported equipment is hidden from the normal look reader without erasing its stored selection during loot equip calls. The raw Dressing Room contract is retained. Throwaway original-source reversion reports 2 passed, 19 failed; restored code reports 21 passed, 0 failed.
2. PROOF: restore-debt-audit.mjs | REACH: Explicitly unresolved, not green. An old blob erases an earned pet duplicate (2 to 1), lowers its banked steps (1000 to 10), and refunds a spent potion (0 to 1). A future same-schema food buff is deleted when the cooking reader opens it (1 to 0). All four desired invariants remain failing assertions in PURE. The coordinated fixes and file ownership boundaries are in docs/P3-KV-CENSUS.md.
3. PROOF: unit.test.js | REACH: The agreed command ran and reported 364 passed, 1 failed, exit 1. The same serveTree subprocess failure occurs on the unmodified baseline. The standalone serve-tree-identity PURE entry requires prohibited local sockets and was not run. Browser/server results are not certified. Full per-file Node results, measured red/green output, blockers and deviations are in docs/P3-RESTORE-REPORT.md.


## 2026-09-07: L1 transaction pairs, advisory and incomplete

PROOF: take-and-pay-audit.mjs unit.test.js reward-sop-audit.mjs

REACH: Buy a Shop Draught or win a staked Pit fight (ladder, Champion,
Gauntlet). Pending Pit wins retry through the existing game initialization
path on the next open, including when game-init is already true.

The frozen L1x.md SHA256 matched
fa84a687928124ccb1fc2430bb8165c35afc654fc9af6491a118f692682f3f1f.
The input checkout HEAD was 5cfdfbd07fdc6197c50fd4e1f410fcdc17559eee.
All source paths were resolved inside this checkout. The root CLAUDE.md was
read. There is no tally/CLAUDE.md in this checkout.

Files changed:

- js/loot.js: Shop affordability, debit, currency revision and goods use payAtomic.
- js/app.js: only the Pit settle function changed. It records a win before
  resolving the stake and delegates staked payouts to the recovery path.
- js/game.js: durable Pit intents, atomic first-clear/repeat payouts, deduped
  capped XP, badge retry and initialization recovery. Buff consumption commits
  with the intent. Champion loot commits with the first-clear ledger row.
- tests/take-and-pay-audit.mjs: extended the existing transaction-boundary kill
  model for all five requested sites. The meal assertion is enabled and red.
- tests/reward-sop-audit.mjs: registered the moved Pit payouts, updated the Shop
  description and corrected the stale grant count from eight calls to one.
- tests/release-gate.mjs: updated the existing PURE entry's description. No new
  audit file or duplicate tier registration was added.
- docs/CLAIMS.md: this explicitly requested dated lane section only.

Site disposition:

| Site | Disposition |
| --- | --- |
| Shop | Fixed, single transaction through payAtomic. |
| Pit | Fixed for staked wins, durable intent plus idempotent retry. The capped XP, first-clear/repeat payment and badges retain their existing ledger authorities. |
| Meal | Blocked by file ownership. Log totals still survive while base XP is lost. |
| Grant | Already atomic on the input tree. applyPayload stages the payload through awardOnce(..., pay), which uses claimAndPay. New coverage passes on both trees. |
| Spire | Already retried on the input tree. fetchMySpires plus syncSieges recreates a missing local tower from server ownership at boot/resume. New local-storage coverage passes on both trees. |

Proof results:

- node tests/unit.test.js: `364 passed, 0 failed`, exit 0.
- All 80 files in the current release gate's PURE tier were executed directly
  with Node. 79 exit 0. take-and-pay-audit.mjs exits 1 for the unresolved meal
  seam. The all-PURE-green success criterion is NOT met.
- The final extended take-and-pay audit prints `1 FAIL`. Shop, Pit, grant and
  Spire rows pass. This is not a green overall audit.
- The Node source-census portion of reward-sop-audit.mjs passes its five checks,
  exit 0. Its full browser driver was not run. The stale grant census was
  observed red before the metadata correction: `js/social.js:applyPayload
  registered 8 paying site(s), source has 1`.

Red proof used a throwaway tree under /private/tmp/l1-proof/red-tree. It kept
the new guard unchanged and replaced js/loot.js, js/app.js and js/game.js with
their saved, unmodified input versions. No original checkout was edited. The
baseline audit exits 1 and prints `15 FAIL`; the final audit exits 1 with the
single remaining meal failure. Output and exit codes are separate files, never
an exit status read through a pipe.

Representative red and fixed output:

```text
RED  FAIL CRASH shop: 90 coins buys one Draught even after death  coins=0, goods=0, cost=90 coins
FIX  ok   CRASH shop: 90 coins buys one Draught even after death  coins=0, goods=1, cost=90 coins
RED  FAIL REBOOT Pit stake: staked win retains 60 coins and 75 XP  coins=0, XP=0; measured loss: charge, 60 coins and 75 XP
FIX  ok   REBOOT Pit stake: staked win retains 60 coins and 75 XP  coins=60, XP=75; measured loss: charge, 60 coins and 75 XP
BOTH FAIL REBOOT meal: saved 642-kcal dinner recovers 25 XP  kcal=642, XP=0; measured loss: 25 XP per meal
```

Pit recovery also passes after deaths at the capped fight-XP row, rung-XP row
and badge row. The first two additional boundaries are red on the input tree;
the badge boundary already conserves the measured payout on the input tree.
Controls cover concurrent settlement, repeat wins, all three staked modes,
one Champion crate and skull, and exactly one charm/food charge for a modified
94-coin payout. The meal row measures log and firstlog XP only, excluding badge
XP. Under the existing economy, 25 is the first entry of a day's 10 plus 15;
subsequent entries do not each earn another firstlog award.

Blocked actions and deviations:

1. The meal writer is js/app.js:commitLogEntry, outside this lane's explicit
   Shop/Pit-only app.js ownership. Permission to edit that one function was
   requested and has not been received. It was not edited. Proposed change:
   persist an eligible reward intent with the log row in its first transaction,
   recording the original reward date and scan/label context. Replay that
   intent idempotently from js/game.js at initialization, including after
   midnight, and retire it only when its rewards have landed. Do not infer
   entitlement from old edited/backdated rows or reset game-init. That would
   change the economy. The existing red guard is left intact for the owner.
2. The Pit needs retry recovery as well as the meal and remote Spire seam.
   Forcing its capped XP, first-clear key and derived badges under one new
   primitive would redesign their authorities. Existing claimAndPay,
   takeAndPay and payAtomic are reused; no database primitive was added.
3. Grant and Spire cannot honestly be proven red for the stated defects on
   this input tree, because their current implementations already pass the
   guards. They were not artificially broken or rewritten to match the plan.
   These are baseline passes, not claimed new fixes.
4. Browser and server proofs were prohibited by the work order and were not
   attempted. The executed kill model is transactional mem-idb with later
   transactions aborted, not an actual OS process kill or browser run.
   Independent review still needs the full reward-sop browser driver and real
   arena/boot checks. Expected changed-path outcomes are one paid staked win,
   no duplicate on reopen, and the existing victory card with its paid coins,
   XP and Champion loot. No browser result is claimed.
5. No command was rejected by automatic approval review, and no permission
   denial occurred. No commit, push, PR, publish, deployment, version stamp or
   changelog edit was performed. No Worker, App Store Connect, native submission
   file or integ/day5 action was taken. The user's no-commit/no-push instruction
   superseded the contradictory commit-and-push sentence inside the plan.

Evidence directory: /private/tmp/l1-proof. Key files are audit.red.txt,
audit.red.exit, audit.green.txt, audit.green.exit, unit.txt, unit.exit,
reward-sop-static.green.txt and pure/results.json. The final changes and this
report are advisory inputs to independent review. Meal recovery and therefore
the frozen work order remain incomplete.

## L5: durable meal XP recovery (2026-09-07)

1. PROOF: take-and-pay-audit.mjs | REACH: The real commitLogEntry saves reward eligibility, original date, scan/label route and targets with the meal row. Game initialization retries unfinished eligible rows before its established-player early return. Existing awardCapped entry-id refs and awardOnce ledger keys prevent duplicate XP; a separate completion marker is written only after the reward path succeeds. The meal and XP remain separate transactions.
2. PROOF: take-and-pay-audit.mjs | REACH: The agreed command passes 78 rows and prints all clean, exit 0. Coverage includes deaths after the meal write, base XP, first-log XP, scan XP, label XP and completion marker; independent module instances open concurrently against one database, then open again. Midnight recovery retains the original date and label context, while a backdated edit still returns zero XP. Recovery of 21 saved meals retains the existing 215-XP daily limit (20 times 10, plus one 15-XP first-log bonus).
3. PROOF: unit.test.js, device-loss-audit.mjs, take-and-pay-audit.mjs | REACH: R24-L17 is unchanged and passes its real midnight roll/write test. Both write-failure outcomes remain intact: an unsuccessful meal save returns null, re-arms Add and reports the storage failure; a saved meal with failed rewards returns zero XP and receiptFailed. Both production Add-toast expressions still say Added, the calories, and XP did not record. The DataError IOError control proves the injected error reaches the actual meal write. These are Node source/transaction proofs, not browser sheet-visibility proofs.
4. PROOF: release-gate.mjs | REACH: All 84 files in PURE were executed directly with Node and exit 0. No gate server was started. The existing take-and-pay registration remains in exactly one tier; its description now includes meal retry. No new audit file was introduced.
5. PROOF: reward-sop-audit.mjs | REACH: The five Node source-census checks pass: 161 paying sites, 67 source actions, 72 registry entries with matching counts. The existing seven food reward call sites moved into finishFoodLogged, shared by normal logging and recovery; the registry names that owner. The full browser driver remains unrun.

Advisory implementation report for independent review:

| File changed | Change |
| --- | --- |
| js/app.js | Stage the row's reward intent inside the existing meal-write try/catch, after the unchanged day roll. Preserve a pending intent when an existing row is edited. |
| js/game.js | Share the existing food reward path, record completion after success, and recover unfinished intents at initialization. |
| tests/take-and-pay-audit.mjs | Extend the existing kill-boundary proof with partial writes, midnight, concurrent/repeated opens, caps, failure returns and actual toast expressions. |
| tests/unit.test.js | Let R25-M4's structural check accept preparation statements inside the same write try/catch. It still requires the write's catch to return null and re-arm Add. R24-L17 is untouched. |
| tests/device-loss-audit.mjs | Supply the new read/clock dependencies in the isolated writer fixture and assert the failing put was reached. Existing IOError and input-preservation assertions remain. |
| tests/reward-sop-audit.mjs | Register the relocated food reward call sites under their actual owner. |
| tests/release-gate.mjs | Update the existing audit's description only. |
| docs/CLAIMS.md | Append this dated L5 section only. |

The supplied plan file's SHA256 matched
`bcd03869f61017bfdb50000382a263df05cfc85f76dc9b687f83a947a403679b`.
The checkout's CLAUDE.md was read; no nested tally/CLAUDE.md exists here.
All source paths were resolved in this checkout. The opening whole-worktree
ownership instruction supersedes the plan's copied sibling-lane boilerplate.

Red and green evidence:

```text
BASELINE FAIL REBOOT meal: saved 642-kcal dinner recovers 25 XP  kcal=642, XP=0; measured loss: 25 XP per meal
BASELINE 1 FAIL (exit 1)
REVERTED FAIL REBOOT meal: saved 642-kcal dinner recovers 25 XP  kcal=642, XP=0
REVERTED 11 FAIL (exit 1)
RESTORED ok   REBOOT meal: saved 642-kcal dinner recovers 25 XP  kcal=642, XP=25
RESTORED all clean (exit 0)
PASS R24-L17 commitLogEntry rolls the day before the row is written, and a fresh row follows it
PASS R25-M4 every UI log write routes through commitLogEntry, and its two outcomes are honest
365 passed, 0 failed
84/84 PURE files exited 0
```

The expanded audit was held unchanged on a throwaway copy under
/private/tmp/l5-meal-proof/red-tree. Restoring the saved pre-fix app.js and
game.js reproduced the real defect; restoring the final sources returned it
to green. A separate throwaway mutation replaced the write-failure return
with a throw. The adapted R25-M4 guard failed with
`db.put('log', e) is no longer in a try whose catch returns null (the not-committed outcome)`.
The final guard passes. Final review also reproduced an interaction with an
unfinished history backfill on a throwaway copy: `refs=b-pending,b-pending`
and `XP=45` for two meals. Recovery now runs after history assigns its
ordinal slots, producing `refs=a-legacy,b-pending` and `XP=35` even after retry.
The two new guards were red on the earlier implementation and green after
this ordering fix. Initial PURE execution found two fixture assumptions,
then both corrected fixtures passed with their behavior assertions retained.
Output and exit status were captured separately, never read through a pipe.

Denied/blocked actions and deviations:

- No command was denied by automatic approval review. Browser/server proofs
  were explicitly prohibited and were not attempted. The crash model aborts
  later mem-idb transactions after a committed boundary; it does not kill an
  OS process. Independent review still needs the browser logging control and
  failure modes in log-write-failure-audit.mjs, plus a real reload/double-tab
  check. Expected results: saved calories persist, missing eligible XP lands
  once, failed meal writes retain the open input, and receipt failures show
  the honest saved-meal message without re-arming Add.
- Legacy-data limitation and proposed deviation: replay uses durable intents
  created by this fix. Unmarked pre-fix rows cannot reliably distinguish an
  eligible meal from a backdated entry, and lack the original scan/label and
  target context. They are not retroactively awarded by this recovery path.
  Repairing those historical losses requires an explicit compensation policy;
  no such policy or entitlement was invented. This limitation was disclosed
  before implementation. The original history award phases remain intact and run before intent recovery on an unfinished initialization.
- The quoted 25 XP is the first meal's existing 10 plus the day's one-time 15,
  not a new 25-XP payment for every meal. Existing reward keys and caps remain.
- The user's explicit instruction supersedes the plan's contradictory
  commit-and-push sentence. No commit, push, PR, publication, deployment,
  version stamp or changelog edit occurred. No original checkout, Worker,
  App Store Connect, native/ASC-SUBMISSION.md or integ/day5 was modified.

Evidence is under /private/tmp/l5-meal-proof: baseline-audit.txt and .exit,
audit.red.txt and .exit, audit.green.txt and .exit, audit.restored.txt and .exit,
selected-unit.txt and .exit, write-guard.red.txt and .exit, backfill.red.txt and .exit, backfill.green.txt and .exit, unit.txt and .exit,
device-loss.txt and .exit, sop-static.txt and .exit, and pure/results.json
with per-file output and exit status. This report is advisory and is not
independent review or release authorization.
