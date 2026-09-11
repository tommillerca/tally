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
