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
