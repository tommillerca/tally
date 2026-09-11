# Fight 1A implementation evidence

Frozen plan SHA256 verified: b9bf665208260b0aee6c306786b955c39b0baf4b287955a97b812aa868154f22.

Scope: openFight in this checkout only. The full implementation brief, local CLAUDE.md and reference layout sources were read. MOCK.html was not opened, as the lane specifically prohibits it.

## Changed files and selectors

- js/app.js: adds fight-header to the existing fight header, reads petNicks keyed by fighter.petMeta.iid, and displays the escaped nickname with the existing petBody.name fallback. No combat object is renamed. ITEMS retains its stock/availability conditions and handler; counts and the 1 AP drinking explanation remain in the existing inventory tray. APP_BUILD becomes v562.
- app.css: only the selectors listed below are added. Existing arena, stage, pet, monster, media-query and shared layout declarations remain byte-for-byte intact.
- sw.js and version.json: version stamps become tally-v562; no geometry.
- js/changelog.js and docs/CLAIMS.md: one matching player-facing note and numbered proof row; no geometry.
- tests/fight-ui-1a-audit.mjs: node guard for instance-specific nicknames, fallback, escaped HUD binding, simple ITEMS, availability binding and live venue. No production geometry.
- tests/release-gate.mjs: registers that guard in PURE. The original 168 suites remain, making 169 with the new guard.
- UI-IMPLEMENTATION-PROOF.md: this advisory evidence record.

Exact new CSS selectors:

1. .sheet-head.fight-header > .fight-title: flex: 1 distributes horizontal spare space inside the existing header. Existing min-width: 0, title ellipsis, font sizes, line heights, vertical padding and venue line are retained.
2. .sheet-head.fight-header > .sheet-close: flex-shrink: 0 protects Flee's existing width. No vertical dimensions change.
3. #fightBody > .fight-actions > .fight-act
4. #fightBody > .fight-endrow > .fight-act
   Selectors 3 and 4 change radius and shadow only, with no box dimensions or flow changes.
5. #fightBody > .fight-actions > .fight-act:not(.glow):not(.sig):not(.petmove):not(.potion): changes background and border colour only. Existing special-action colours and availability opacity remain.
6. #fightBody > .fight-endrow > .fight-act.endturn: border colour only.
7. #fightBody .fight-hud .fname: shadow and border colour only, within the absolutely positioned HUD. No figure or HUD box dimensions change.

The nickname is inside the existing single-line, clipped HUD label. It cannot resize the arena or the independently positioned figures. Removing the ITEMS detail line changes that button's content height inside the existing scrolling action tray. The arena has its existing non-flexing viewport-derived height. No arena sizing calculations, figure anchors, transforms, layers or art are changed. These are source-level reasons, not measured browser proof.

## Deviations and unproven checks

The existing title and venue already occupy separate lines. Their typography and vertical metrics are retained rather than copying the mock's header padding/font sizes, which could violate the hard lock. The mock's 64px move tiles and 1px borders are not copied; existing responsive row metrics and 2px borders remain, with approved colour/radius/shadow treatment. Existing live inventory uses a tray inside the fight, not a separate sheet; that interaction remains intact.

Browser audits, screenshots, safe-area simulation and control hit tests were not run because the frozen order identifies socket binding as blocked (listen EPERM). No local server was started. The operator must verify the locked coordinates at 393x852 and 320x568, including Wanderer, Live Wire, Bumbleseal, Glutton and large gear, and operate Flee, moves, ITEMS and End turn. No rendered-coordinate equality is claimed.

The supplied pre-existing figure-audit failure for the unregistered kinChips petPortraitHtml site remains out of scope. No figure call site was added or changed. Its new line number may shift with preceding edits.

No commit, push, publication, deployment, original-checkout write, native/ASC-SUBMISSION.md edit or art edit was attempted. No approval denial occurred. A read-only process-list diagnostic (ps) was denied with "operation not permitted"; it was not needed to collect child exit codes. Browser verification is the known blocked action.

## Proof results

The new guard was run before implementation: exit 1, "Fight HUD must resolve the equipped instance nickname". After implementation: exit 0, "PASS fight 1A: instance nickname, unnamed fallback, escaped HUD, simple ITEMS and live venue".

Release coverage command: node tests/release-gate.mjs --coverage-only, exit 0. Reports 428 audits on disk. This is registration coverage, not execution proof.

Final execution results are recorded below after completion.

Agreed proof: node tests/unit.test.js, exit 0, final output: 390 passed, 0 failed. Full output: /tmp/ui-1a-unit.log. The same command also passed inside the PURE run.

The initial PURE run caught guard-hygiene-lint.mjs rejecting the new guard for missing a positive-control row. The guard now mutates the production nickname expression from instance key to species key and asserts that the nickname check fails. Both the guard and the hygiene lint reran with exit 0. No lint threshold was weakened.

node --check js/app.js and git diff --check: exit 0.

PURE enumeration used the exact r6-guards-audit extraction: the const PURE literal plus all /^PURE\.(?:push|unshift)/ additions, evaluated with node:vm. The initial inventory was 75 literal entries plus 93 additions, total 168. Each suite ran via spawnSync with its status read directly, no exit-code pipeline. Exit 97 was classified as unproven. Every child completed without a timeout or signal.

Initial run: 167 green, 1 red, 0 unproven. The sole red was the new guard's missing positive control, described above. After its successful targeted rerun, final original-tier status: **168 green, 0 red, 0 unproven**. The newly registered fight-ui-1a-audit.mjs also passed: **169 green, 0 red, 0 unproven including the added guard**. Final registration is 76 literal entries plus 93 additions.

Per-suite initial exit codes and logs: /tmp/ui-1a-pure/results.json and /tmp/ui-1a-pure/*.log. Run summary: /tmp/ui-1a-pure.log. Corrected hygiene output: /tmp/ui-1a-hygiene-final.log. r6-guards-audit passed both independently and in the completed PURE run. Browser audits are not included in these node-only pass counts.


# Pit 1B implementation evidence

Frozen plan SHA256 verified: 896b4064a861c9860fcae593743e515380c04b75b775e373de9c22ddfb9218de.

Scope: this checkout only. The full IMPLEMENTATION.md, figure contract and reference layout sources were read. The kit was read at its supplied authority path because it is not present under this checkout. No original-checkout source was edited. MOCK.html was not read or opened.

## Files and boundaries

- js/app.js: adds pitOpponentPortrait and replaces icons/rank tiles in the remote den, ladder, champion, Gauntlet and sparring rows with live opponent artwork. Ordinary faces use the unchanged headshotHtml renderer. Named and sparring opponents use foeOutfitFor, remote dens use the same themedLook and mage flag as their handler, and Gauntlet rows use endlessFightCfg. Rank/rung remains supporting text. The Pit hero loses its decorative arena-like backdrop in favor of the reviewed gradient. Build stays distinct. APP_BUILD becomes v563.
- app.css: adds only the selectors inventoried below. They all require #pitBody and direct Pit children. #fightBody and #arena cannot match them. The existing arena CSS, shared figure CSS and screen 1A additions are unchanged.
- sw.js, version.json: build stamps become tally-v563. No geometry or game code.
- js/changelog.js: new n: 563 note. docs/CLAIMS.md: matching exact changelog line and numbered proof row. Neither affects geometry.
- tests/pit-ui-1b-audit.mjs: new PURE guard for opponent identity, special figure choice, row bindings, supporting rank and distinct Build, with a mutation control. Test data stays in the audit only.
- tests/release-gate.mjs: registers that guard in PURE. No existing registration removed.
- UI-IMPLEMENTATION-PROOF.md: appends this advisory record without changing screen 1A evidence.

The existing head crop intentionally skips C, so these are opponent faces without pets. No pet instance, shiny or morph data is invented, replaced or dropped from an existing pet renderer. No new pet call site is introduced. Glutton and Mimic use their unchanged figure markup; Live Wire and Wanderer use the same authored plates as the fight. Mimic's existing renderer installs its existing stylesheet, exactly as it already does in fights. No shared renderer, art file, fight rule, reward or eligibility code is changed.

Source equality checks against HEAD confirmed that the entire Pit event-handler block and the entire openFight function through the end of app.js are unchanged. All pre-champion, champion, cleared, cap/rematch, depleted-energy, free sparring, remote-den and persisted defeat/recovery conditions remain in place. This is source evidence, not operated-control or pixel proof.

## Exact CSS selector inventory

Every selector below is rooted in #pitBody. Hero, energy, Build, headings and row text/actions change only Pit presentation. The last three selectors frame Pit portraits, remove the existing headshot border to avoid a double frame, and contain the two single-image monster plates. They do affect these new Pit portraits as intended; they cannot affect a fight or any existing figure surface. Head crop transforms, figure layers and pet helpers are unchanged.

1. `#pitBody > .t3-hero`
2. `#pitBody > .t3-hero h2`
3. `#pitBody > .t3-hero p`
4. `#pitBody > .t3-energy`
5. `#pitBody > .t3-energy .ic`
6. `#pitBody > .t3-energy .bar`
7. `#pitBody > #buildBtn`
8. `#pitBody > #buildBtn b`
9. `#pitBody > .t3-sect`
10. `#pitBody > .t3-sect::before`
11. `#pitBody > .t3-sect.pit-gauntlet-heading::before`
12. `#pitBody > .t3-sect.pit-sparring-heading::before`
13. `#pitBody > .t3-sect b`
14. `#pitBody > .t3-sect i`
15. `#pitBody > .t3-sect .r`
16. `#pitBody > .t3-row`
17. `#pitBody > .t3-row > .t3-tx b`
18. `#pitBody > .t3-row > .t3-tx small`
19. `#pitBody > .t3-row > .btn`
20. `#pitBody > .t3-row > .t3-lock`
21. `#pitBody > .t3-row > .pit-opponent-portrait`
22. `#pitBody > .t3-row > .pit-opponent-portrait > .tz-head`
23. `#pitBody > .t3-row > .pit-opponent-portrait > img`

## Deviations and baseline discrepancies

- The special monsters do not have the skeleton's head-crop geometry. As reported during implementation, they use their existing full figure artwork inside the same 52px portrait frame rather than an invented skull crop. Ordinary opponents use the existing headshot renderer. Review of special-monster visible ink remains owed.
- The reviewed pixel font sizes are expressed through scalable type tokens, preserving their default sizes and the app's Dynamic Type contract. Live extra states, support copy and hero readiness chips remain even though the mock omits them.
- The supplied PURE census says 75 literal entries plus additions equals 169. This checkout actually began with 76 literal entries and 93 added entries, totaling 169. Adding this guard gives 77 literal entries plus 93 additions, totaling 170. No suite was dropped to match the prose count.
- The figure audit's static prefix has one red coverage row, but that row lists SIX existing call sites, not only kinChips: js/app.js:20428, :21465, :21501, :21504, :21505 and :21530. The other five are Laboratory sites. Running the exact static prefix with HEAD's app.js and with the changed app.js produced identical output. Result: 6 green static rows, 1 red, zero additional findings. These sites are all before the Pit edits and retain their line numbers. They were not fixed.

## Blocked and unproven actions

Browser audits, screenshots, decoded portrait checks, safe-area/width review, actual control operation and hit tests were not run. The order states that socket binding fails with listen EPERM; no server or browser audit was attempted. Full figure-audit and pit-figures-audit remain unproven. The operator's supplied fight measurements are a baseline only, not a newly measured result. Verify 375px, 390px and wider phones, large text, all opponent types and states, and the locked fight arena before acceptance.

No commit, push, merge, publish, deploy, original-checkout write, native/ASC-SUBMISSION.md edit or art edit was attempted. No permission denial occurred during implementation.

## Proof

New guard before implementation: node tests/pit-ui-1b-audit.mjs, exit 1, "SETUP Pit rows need the live opponent portrait renderer". After implementation: exit 0, "PASS Pit 1B: live outfits, all special figures, five row bindings, supporting ranks and distinct Build" and "PASS CONTROL: lost opponent outfit rejected". The control removes explicit outfit precedence and asserts that the identity check rejects it.

Initial agreed proof: node tests/unit.test.js, exit 1, 389 passed, 1 failed. The failure was fontscale-audit rejecting six newly added fixed-pixel font sizes. Those declarations now use scalable tokens. Targeted fontscale-audit rerun: exit 0, SOURCE CENSUS 988/988 (100.00%). No test threshold changed.

Guard hygiene: exit 0, clean. Release registration coverage: exit 0, 429 audits on disk. Impeccable detector: exit 2 with 54 existing warnings; none in the added UI lines. Its output is /tmp/ui-1b-design-detect.json. Detector output is not visual proof.

The static-only figure run copied the unchanged audit prefix into a temporary file beside the original, stopping before its setup/browser gate. The temporary file was removed. This was NOT a full figure-audit run. Baseline and final logs: /tmp/ui-1b-figure-baseline.log and /tmp/ui-1b-figure-static.log.

Final PURE execution and corrected agreed-proof results follow below.


The PURE run also caught the icon inventory correctly rejecting the new unregistered portrait emitter and the stale golden-crate fallback entry removed from the champion row. tests/icon-inventory-audit.mjs now registers pitOpponentPortrait as scene artwork and removes only that obsolete renderPit|crate/golden fallback row. This test-only registry update has no figure or fight runtime effect. The audit reran with exit 0; no checks were weakened. Its corrected output is /tmp/ui-1b-icon-final.log.

The first complete PURE pass finished at 168 green, 2 red, 0 unproven. In addition to the icon registry, map-playtest-audit.mjs extracted the remote-den card without supplying its new portrait dependency. tests/map-playtest-audit.mjs now provides that presentation dependency in its Node harness and asserts the portrait receives the actual remote boss name and mage flag. Its existing availability, handler, payout and tomorrow assertions are unchanged. It reran with exit 0, 13 passed, 0 failed. This test-only harness update cannot affect production figures or the arena.

The first 21 suites that completed before the font correction were also rerun successfully (21 green) in /tmp/ui-1b-pure-recheck. A second complete PURE pass was then started against the final source and test registries. Original run logs remain in /tmp/ui-1b-pure; final pass logs are in /tmp/ui-1b-pure-final.


Final complete PURE pass: **170 green, 0 red, 0 unproven**, 170 suites executed. Enumeration used the exact r6-guards-audit regexes and node:vm evaluation of BOTH the const PURE literal and every line-anchored PURE.push/unshift statement. Final inventory: 77 literal entries plus 93 added entries. Every child exit code was read directly from spawnSync.status, never through a pipeline. Exit 97 is classified as unproven. No child ended by signal or timeout.

Agreed proof in the final pass: **node tests/unit.test.js**, exit **0**, final output **390 passed, 0 failed**. Full output: /tmp/ui-1b-pure-final/unit.test.js.log. Final per-suite names and direct exit codes: /tmp/ui-1b-pure-final/results.json. Exact enumeration: /tmp/ui-1b-pure-final/inventory.json. Runner output: /tmp/ui-1b-pure-final.log. All 169 inherited suites and the new Pit guard are green on this pass, including icon inventory, map playtest, guard hygiene and r6-guards-audit.

node --check js/app.js and git diff --check passed before the final PURE pass. No production or test source was changed during that pass; only this evidence record was completed afterward. Browser checks are excluded from these counts and remain unproven as described above.

# Screen 1C: Crew, frozen work order, 2026-09-10

Authority: plan SHA256 9c6cf7adc07fe947af69d3346aac642981053dea4084f7a21cfd7d5019427f21 verified against the supplied plan file. Read IMPLEMENTATION.md in full and the reference CSS/JS. MOCK.html was not read. All implementation paths resolve within this checkout. Screens 1A and 1B are preserved.

## Changes and source boundary

- js/app.js: renderFriends markup and paintFanSel presentation only, plus APP_BUILD v564. Separate identity and action rows; existing pixel star at 48px with real aria-pressed state; dense stats remain in the existing full profile; search placeholder simplified. Race precedes the still-visible podium; discovery and code sharing precede community/history. All original control IDs, handlers, states and the webdriver fixture seam remain. No changes to the fan card/art helpers, applyFan, swiping, filter/sort logic, profile, race/leaderboard hydration or shared figure machinery.
- app.css: scoped Crew rules listed below. Disabled the existing fan-only base scrim with an appended Crew override. Solid dark nameplates, artwork, card transforms, pet placement and animation rules remain unchanged. The scrim removal intentionally changes visible fan art by removing an overlay; it does not change figure geometry or layers. No arena selector or shared figure rule is changed.
- js/changelog.js, sw.js, version.json: v564 stamps and one matching changelog item. No figure or arena presentation rules.
- docs/CLAIMS.md: matching exact Changelog item and numbered PROOF/REACH row. Documentation only.
- tests/crew-ui-1c-audit.mjs: new Node source guard and mutation controls, no production effects.
- tests/release-gate.mjs: register the new guard in PURE. No suite removed or weakened.
- UI-IMPLEMENTATION-PROOF.md: append this advisory evidence record.

The fan's bounded mounting code is untouched: all friend records retain cards, only the seven seated stages mount crewCardArtHtml, and off-seat stages clear their children. No additional art mounting path was introduced. Pet instance, shiny, morph and wear remain passed through the original renderer. This is source evidence of preserving the existing bound, not a measured runtime memory claim.

## Exact selector inventory

Added: `#cfanDeck .cfan-stage::after`, disabling the Crew-only gradient scrim with content: none and background: none. The original declaration remains untouched to preserve the pre-Studio CSS boundary. This is the only changed selector over figure artwork, deliberately removing the forbidden overlay. It cannot select the fight arena.

Added overrides:

1. `#cfanSel`: selected-friend panel surface.
2. `#cfanSel .cfan-identity`: identity row layout.
3. `#cfanSel .cfan-star`: 46px target, centered content.
4. `#cfanSel .cfan-star img`: 48px pixel asset.
5. `#cfanSel .cfan-star:not(.on) img`: visibly distinct off state.
6. `#cfanSel .cfan-star.on`: selected border/background state.
7. `#cfanSel .cfan-sel-nm`: name wrapping.
8. `#cfanSel .cfan-status`: secondary truthful recency.
9. `#cfanSel .cfan-acts`: separate two-column action row.
10. `#cfanSel .cfan-acts .btn`: action size and scalable type.
11. `#cfanSel .cfan-acts .btn.gift`: approved gold action treatment.
12. `#cfanSearchRow`: toolbar wrapping.
13. `#cfanSearchRow input`: simplified input treatment.
14. `#cfanOnline`: online button treatment.
15. `#cfanOnline.on`: active filter treatment.
16. `#cfanClear`: in-flow 44px clear control, preventing overlap with Online.
17. `#cfanSnapshot`: secondary operational detail, still visible when relevant.

All added selectors are rooted in IDs emitted only by renderFriends. Their descendants contain identity, icons, text and controls, not Bonehead or pet layers. They cannot select Pit or fight content. Existing `.cfan-sel-tx` is reused inside the identity row. Existing `.cfan-chips`, `.cfan-chip`, `.cfan-chip.lvl` and `.cfan-chip.pet` markup is removed only from the selected panel; level/title remain on cards and full stats remain in profiles. The old selectors are not globally edited. IDs moved in document order without selector changes: raceCard, deliveriesCard, newcomersCard, crewCodeBig, crewShare, crewCopy, crewWhatsNew. Existing thanks/community renderers also move intact.

## Deviations and factual limitations

- Omit Crew since as authorized. GET /friends exposes `since: r.ts`, but requestFriendship can overwrite ts on an already-accepted reciprocal request, and /friends/accept unconditionally resets ts on repeat acceptance. It cannot reliably establish original friendship creation. No backend field or substitute date added. The initial source-reading statement that no timestamp was exposed was corrected after tracing the server writers.
- Preserve existing small-Crew search thresholds, actionable notification cards, race disclosure behavior, pending request presentation, discovery expansion and history controls. The mock's samples and generic sheets are not imported. The actual friend list is not reduced.
- The order describes only kinChips as a pre-existing figure finding. The baseline static audit actually has one failing COVERAGE row listing six sites: original lines 20428, 21465, 21501, 21504, 21505 and 21530. The final static run has the same six sites at lines 20425, 21462, 21498, 21501, 21502 and 21527. Both runs: 6 green rows, 1 red row. Zero additional findings. No pre-existing failure fixed.

## Proof and blocked actions

New source guard before implementation: node tests/crew-ui-1c-audit.mjs, exit 1, "identity must have its own row". After implementation, source assertions pass. Its undersized-target mutation initially matched an unrelated earlier CSS rule and failed to trigger; the mutation now targets the exact #cfanSel rule. Both mutation controls now pass by rejecting their broken inputs. This guard proves source structure and declared dimensions, not rendered overlap or visible ink.

Static figure evidence: /tmp/ui-1c-figure-baseline.log and /tmp/ui-1c-figure-final.log. Executed the unchanged prefix of figure-audit before its SETUP GATE in a temporary test file, with baseline app source substituted for the baseline run. Both exit 1. The temporary test was removed. These are explicitly NOT full figure-audit runs.

Impeccable mechanical detector exit 2; output /tmp/ui-1c-design-detect.json. Its existing warnings do not constitute browser proof. An attempted guard-hygiene-audit.mjs command failed because that filename does not exist; corrected to guard-hygiene-lint.mjs. No permission denial occurred.

No browser audits, screenshots, socket binding, decoded-ink measurements, actual control operation, safe-area checks or hit tests attempted, per the work order's listen EPERM restriction. All browser acceptance scenarios remain UNPROVEN: 375px/390px/wider, long names, favourite states, filters, large Crew, loading/stale/empty/offline/error, requests, gift/cheer/cheer-back, profiles, race, podium/standings, code sharing and history. Full figure-audit and pit-figures-audit remain unproven here.

No commit, push, merge, publish, deployment, production mutation, original-checkout write, art edit or native/ASC-SUBMISSION.md edit attempted. No impossible requirement was silently redesigned.

Final PURE census, direct child exit codes and agreed unit proof follow below after execution. The inherited tier is 170; the new guard makes 171. Both the literal and every push/unshift site are enumerated as r6-guards-audit does. Exit 97 is UNPROVEN.


Guard hygiene initially exited 1 because the new source guard checks the existing webdriver seam without operating browser controls. tests/guard-hygiene-lint.mjs now explicitly inventories crew-ui-1c-audit.mjs with its source-only limitation and separately owed browser coverage. This test-only classification has no figure/arena effect. No runtime guarantee is claimed or removed. The corrected lint is included in final PURE execution.

Initial agreed command node tests/unit.test.js: exit 0, 390 passed, 0 failed. Detector reports 54 warnings, none in the appended Crew CSS. Syntax and diff whitespace checks passed before the final PURE run.


First full PURE pass found studio-v4-audit red because deleting the legacy Crew scrim altered CSS before the Studio boundary. Corrected by restoring that exact legacy declaration and appending #cfanDeck .cfan-stage::after with content: none and background: none. The existing Studio guard is unchanged. The Crew guard now checks that explicit suppression. This is an implementation adjustment, not a visual deviation: the base overlay is still absent, with the solid nameplate preserved. All suites are rerun below against the corrected final source.


## Final corrected verification

Final complete PURE pass: **171 green, 0 red, 0 unproven**, overall exit **0**. Census: **78 literal entries + 93 push/unshift additions = 171**. All 170 inherited suites plus the new Crew guard executed. Enumeration uses the exact r6-guards-audit regexes and node:vm evaluation of the literal and additions. Every child exit is read directly from spawnSync.status, never through a pipe. No child ended by signal, and none exited 97.

Agreed proof on final source: **node tests/unit.test.js**, exit **0**, output **390 passed, 0 failed**. Full output: /tmp/ui-1c-pure-final/unit.test.js.log. Final suite inventory: /tmp/ui-1c-pure-final/inventory.json. Per-suite direct exit codes: /tmp/ui-1c-pure-final/results.json. Runner log: /tmp/ui-1c-pure-final.log. The corrected Studio guard and guard hygiene are green. The new Crew guard also rejects removal of the explicit scrim suppression, in addition to the missing identity-row class and undersized target controls.

The first pass logs remain under /tmp/ui-1c-pure-first and /tmp/ui-1c-pure-first.log: 170 green, 1 red, 0 unproven. The one red was the CSS-boundary finding described above. No production or test source changed during the final corrected pass; only this evidence record was completed afterward. The original fan art helpers, crewCardHtml, applyFan, full profile and fight through EOF compare unchanged against HEAD. Existing Crew browser-audit selectors remain compatible with the retained IDs/classes and those audit files are unchanged.

These PURE counts exclude all browser checks. Rendered ink, overlap, safe-area behavior, operated controls and runtime mounting measurements remain UNPROVEN for independent review. Static figure coverage retains only the six baseline findings described above. No denied action, commit, push, merge or publish occurred.

# Screen 1D readiness, frozen lane, v565 (2026-09-10)

Authority: supplied work order SHA256 a3ee655774ef00a99110bd128b6f1e956af437998206bf9e3eabdfd1aa5f0199 verified. IMPLEMENTATION.md read in full, with reference/layout.css and reference/layout.js. The kit does not exist at its relative path here, so the named external kit was read only. MOCK.html was not read. All edits resolve within this checkout.

## Files and boundaries

- js/app.js: readinessHtml adds the approved heart/pulse SVG paths and existing moon PNG, and consistent icon/label/value/delta spans. Heart recency moves below the value; stale sleep retains date and "not last night". Missing sleep remains a non-actionable tile with an explicit No reading caption. Missing heart tiles and calibration retain existing behavior. Existing data-metric and data-sleepdetail bindings remain intact. The gauge and readinessScore are unchanged, with scoring bytes compared against HEAD. The existing sleep-sheet fallback sentence now says "this night" because it previously mislabeled stale unstaged watch readings. No teardown changes. Activity mix adds existing boot art for walking/hiking and dumbbell for strength. Other supported activities, real counts, ordering and history remain intact. APP_BUILD advances to v565. No figure call site is edited or added; a line-by-line comparison of figure call sites matches HEAD.
- app.css: appended selectors only, enumerated below. No old CSS changed, preserving 1A, 1B, 1C and the Studio boundary.
- sw.js: VERSION advances to tally-v565 and boot.png is precached for the newly used existing asset. Moon and dumbbell were already precached. Cache machinery is unchanged. This affects asset availability, not scoring or geometry.
- version.json: tally-v565 metadata only.
- js/changelog.js: fourth version stamp, n:565, and the player-facing note only.
- docs/CLAIMS.md: exact matching Changelog item and numbered PROOF/REACH row. No runtime effects.
- tests/readiness-ui-1d-audit.mjs: Node VM executes the real scoring and readiness renderer with test-only inputs, checks the locked score tuple, calibration, no-heart result, tile anatomy, stale dates, icon paths, retained action attributes and declared tile minimum height. A missing-icon mutation must fail. This does not prove browser controls or geometry.
- tests/release-gate.mjs: adds this new PURE guard without removing inherited entries. No runtime effects.
- UI-IMPLEMENTATION-PROOF.md: this advisory evidence record only.

## Every touched CSS selector

1. .rd-card .rd-tiles: equal grid columns, 7px gaps, stretched heights.
2. .rd-card .rd-tile: 148px minimum height, flat surface, left alignment and consistent padding.
3. .rd-card .rd-tile::after: suppresses the legacy decorative top stripe.
4. .rd-card .rd-icon: common 30px icon row and 9px spacing.
5. .rd-card .rd-icon svg: approved 22px SVG size.
6. .rd-card .rd-icon img: contained pixel moon.
7. .rd-card .rd-tile .rl: common label type.
8. .rd-card .rd-tile .rv: common value type and spacing.
9. .rd-card .rd-tile .rv small: real unit type.
10. .rd-card .rd-delta: common delta/recency type and wrapping.
11. .rd-card .rd-delta i: existing delta arrows inherit the common size.
12. .rd-activities .rd-activity-icon: contained 32px existing pixel assets.

All selectors require readiness-only roots. Their descendants are metric text/icons or activity icons, with no figure or arena content. CSS cannot alter the scoring function. No global selector, figure sizing, art file, battle layout, historical navigation or shared handler was modified.

## Proof, failures and limitations

New guard before implementation: node tests/readiness-ui-1d-audit.mjs exited 1, "icon label value delta anatomy". After implementation it exits 0 and rejects the missing-icon mutation. It evaluates the real score tuple as 72 / 96 / 47 / 49 / 72. This is Node proof, not the seven-row browser audit or its seedHealth seam. tests/readiness-audit.mjs is unchanged.

Guard hygiene initially failed because the console evidence did not contain an uppercase CONTROL label. Corrected the evidence label for the existing mutation assertion, without changing or exempting lint rules; guard-hygiene-lint.mjs then exited 0. A patch script stopped at an unmatched release-gate registration string; corrected to insert in the literal. The temporary static figure runner initially exceeded Node's git output buffer, then exposed replacement-string expansion in its source injection. Both runner defects were corrected before accepting any result.

Static figure audit only: executed the unchanged prefix before SETUP GATE with baseline and final app source. Both exit 1 with 6 green rows and the same ONE failing coverage row containing SIX identical call-site contents. Baseline lines: 20425, 21462, 21498, 21501, 21502, 21527. Final lines: 20429, 21466, 21502, 21505, 21506, 21531. These are the work order's six pre-existing sites shifted by inherited and current source line changes. Logs: /tmp/ui-1d-figure-baseline.log and /tmp/ui-1d-figure-final.log. Temporary audit source removed. No seventh site introduced and no baseline finding fixed.

No browser audits, socket binding, screenshots, safe-area or decoded-ink measurements attempted, per the frozen restriction. Readiness browser 7/7, Pit figures 25/25, full figure audit, live controls, tile heights/overflow at 375px/390px/wider, historical navigation and complete sheet dismissal remain UNPROVEN for independent review. No permissions were denied. No commit, push, merge, publish, production data mutation, external-checkout edit, native/ASC-SUBMISSION.md edit or art change attempted.

Reference clarification: the kit's approved moon is assets/icons-pix/moon.png, not an SVG. The existing asset is used exactly. The existing live sleep-score headline and supported activities remain, rather than copying example values or limiting activities to the mock. No impossible requirement was silently redesigned; no functional deviation proposed. Existing health guidance is retained without additions.

Final PURE enumeration and direct exit results will be appended after execution. The inherited tier has 171 entries; the new guard makes 172. Enumeration includes the literal plus every push/unshift using exactly the r6-guards-audit regexes and VM evaluation. Exit 97 counts as UNPROVEN.

Initial agreed unit proof exited 1: 389 passed, 1 failed. The fontscale census correctly rejected four newly declared fixed pixel font sizes. Converted those four to rem equivalents without changing the intended default sizes; no guard weakened. The in-progress first PURE run was interrupted (exit 130) and is not a final census. Process inspection with ps was denied by the sandbox; cancellation succeeded through the existing command session. This was the only permission denial. Final full PURE is restarted against the corrected source.

The fontscale follow-up also requires named ramp tokens, not raw rem values. Final declarations use --fs-micro, --fs-tiny and calc(var(--fs-body) * 1.4375). The second prematurely started PURE pass was also interrupted, exit 130; neither partial pass is claimed.

The next PURE pass found icon-inventory-audit.mjs red: activityRecoveryHtml is now an image emitter and requires inventory classification. Added its exact EMITTERS row as a chart with existing activity artwork. This additional test-file change has no runtime, scoring, figure or arena effect and does not weaken its discovery assertion. The pass was interrupted (exit 130) to restart all entries after this required registration.

A later PURE entry, studio-v4-audit.mjs, rejected the two pixelated declarations because its source guard scans all CSS after the Studio boundary, including unrelated scoped readiness styles. Reused the existing .ico.pix-cur class on the moon/activity PNGs and removed the two new image-rendering declarations. Its existing declaration is unchanged and retains the exact requested pixel treatment. The two readiness selectors now only declare containment (and activity flex sizing). No Studio code, test, existing selector or baseline changed. This is an implementation adjustment, not a visual deviation. That pass was interrupted, exit 130; all entries are restarted after the correction.

## Final verification on corrected source

- Full PURE: **172 green, 0 red, 0 unproven**, overall exit **0**. Census is **79 literal entries + 93 push/unshift additions = 172**. All 171 inherited entries plus the new readiness guard executed. Direct spawnSync.status values were recorded, without pipes. No exit 97, null status or signal in this completed run.
- Agreed proof: **node tests/unit.test.js**, direct exit **0**, final output **390 passed, 0 failed**.
- Full unit output: /tmp/ui-1d-pure/unit.test.js.log. Exact literal, additions and resulting inventory: /tmp/ui-1d-pure/inventory.json. Per-entry exits: /tmp/ui-1d-pure/results.json. Runner output: /tmp/ui-1d-pure.log. Runner source: /tmp/ui-1d-pure.cjs.
- New guard is green and its missing-icon mutation is rejected. Fontscale, icon inventory, Studio v4, inherited 1A/1B/1C guards and guard hygiene all green in the final complete run. No production/test source changed during that run. Only this evidence record was completed afterward.
- git diff --check passed. Changed files are exactly js/app.js, app.css, sw.js, version.json, js/changelog.js, docs/CLAIMS.md, tests/readiness-ui-1d-audit.mjs, tests/icon-inventory-audit.mjs, tests/release-gate.mjs and UI-IMPLEMENTATION-PROOF.md.
- Final denied action: ps process inspection, operation not permitted. It did not block completion. Browser verification remains unproven under the work order's socket restriction. No commit, push, merge or publish attempted.
- Deviations: no functional or visual redesign. Use the reference's actual PNG moon; preserve existing live sleep-score behavior and unsupported-icon activity labels. Reuse existing pixel-image styling and named scalable type tokens to satisfy repository contracts. Four interrupted PURE passes are retained as partial logs under /tmp/ui-1d-pure-interrupted* and are excluded from the final count. The known six static figure findings remain, with unchanged contents.

This is advisory evidence for independent review, not browser approval or publish authorization.
