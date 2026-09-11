# v575 advisory review

Frozen plan SHA256 verified: dd2a640f1f248fb24adb2a92bafdd2c08341e9d506f68e4e16e4e196661bbb3d.

## Implementation and diagnosis discrepancy

The filter hop is renderFriends -> resortFan -> pool.filter(f => !fanFavouritesOnly || favs.has(f.playerId)) -> fanOrder -> paintFan -> crewCardHtml -> deck.innerHTML -> applyFan. This checkout already filters fanOrder itself. crewCardHtml returns a card without a second favourites filter. Thus the plan's reported disagreement cannot be attributed to a later filter in this source. The original-source Node control passes empty favourites. The reported browser failure's precise cause remains unproven.

Chosen implementation: derive empty from mounted .cfan-card elements. Mount and seat base cards before optional asynchronous enrichment, then recheck mounted cards after enrichment. Keep the paint revision check. Empty search and combined filters name the undo controls. Empty crew and unreachable-server branches retain their existing explanations. No presence wording, player step-sync copy, card plate markup or styling changed.

This is defensive mounted-result coverage, not a claim that an async race caused the reported incident. The new guard executes production resortFan and paintFan against a DOM model. The existing unit DOM double now supports the selector and card class; its stale-paint and empty-state assertions remain intact. The crew-fan-audit file is unchanged.

## Red control

Command: node tests/crew-empty-audit.mjs --source=/tmp/v575-before-app.js

Original source saved from this checkout before edits. Direct exit code: 1. Output: 5 passed, 4 failed. Failures: search undo, combined-filter undo, suppressed card markup with zero mounted cards, and no cards while enrichment is pending. See red.txt. The suppressed-markup test specifically proves the zero-card explanation guard red, even with nonempty fanOrder. It is an injected renderer refusal, not a browser reproduction.

## Boundaries and denied actions

No commit, push, merge or publish attempted. No original checkout edited. native/ASC-SUBMISSION.md untouched. Runtime edits are confined to renderFriends/paintFan, plus the required APP_BUILD stamp. Other edits are version metadata, changelog/claims, tests and proof receipts.

A read-only ps command to inspect test elapsed time was denied by the sandbox with 'operation not permitted: ps'. No approval or bypass attempted. Test execution remained available.

The initial unit run returned exit 1 with 390 passed and 1 failed because its DOM double did not implement querySelectorAll. The initial PURE run was interrupted with exit 130 after that failure so the corrected final tree could be tested. Final proof receipts supersede that partial run.

Browser Crew audit, nameplate geometry and real taps are unproven here, as assigned to the independent reviewer in the work order.

## Final proof

- Agreed command: `node tests/unit.test.js`. Direct exit code 0. Output: `391 passed, 0 failed`. See unit.txt and unit-result.json.
- Last full PURE tier: 81 literal entries plus 97 push/unshift sites, 178 unique commands. 178 passed, 0 failed; runner exit code 0. Every child exit code was read from spawnSync.status, without a pipe. See pure-census.json for both enumeration sources, pure-results.json for numeric exit codes, pure-run.txt for the summary and pure/ for full outputs. Reproduce from the checkout root with `node docs/v575/run-pure.cjs`.
- Final crew-empty-audit: 9 passed, 0 failed, exit 0. Final crew-capture-node-audit: 16 passed, exit 0. leaderboard-honesty-audit, crew-presence-audit and crew-ui-1c-audit all exit 0.
- Before this final run, hygiene lint required uppercase CONTROL labels in the new audit. A later full run returned 177 passed and 1 failed because the Crew capture DOM double also lacked querySelectorAll. Its selector support was added without changing assertions, and its focused run passed before the final full tier. Those intermediate failures are superseded by the final receipts.

## Changed files

- js/app.js: mounted-card empty-state decision inside renderFriends/paintFan and APP_BUILD v575.
- sw.js, version.json, js/changelog.js: remaining three release stamps and release note.
- docs/CLAIMS.md: v575 Changelog item and numbered PROOF/REACH row.
- tests/crew-empty-audit.mjs: new production-path guard and positive controls.
- tests/release-gate.mjs: PURE registration.
- tests/unit.test.js, tests/crew-capture-node-audit.mjs: DOM doubles support the mounted-card selector.
- docs/v575/: advisory report, red output, unit receipts, full PURE census/results/output, individual command logs and reproducible runner.

Deviations: the plan's claimed later favourites-filter hop does not exist in this checkout, so that causal claim and the exact browser incident remain unproven. Mounted-card coverage implements the requested invariant with base cards displayed before enrichment. Browser review remains outstanding. No denied write, commit, push, merge or publish action occurred.
