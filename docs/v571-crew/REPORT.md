Advisory implementation report for independent review, 2026-09-11.

The frozen plan matched SHA256 2ebef5ed08a1c177630c40d28c660b6a22d4365d855d2b4e7214287fdd492453. All source edits resolve within this checkout.

Implementation choices:

- No presence dots or presence words on people. The leaderboard alone shows Last online with a UTC timestamp, omitted for unknown or invalid clocks. Server timestamps still gate internal ordering and stale race comparisons.
- The selected friend's identity row retains its real favourite toggle, saved crewFaves state, 46px target and 48px image. Its accessible label names the friend and the action. Visible guidance reads Tap the star to favourite, or Favourite. The filter is a text button reading Filter: favourites. Removing a favourite while filtered rebuilds the deck and empty state.
- Own-device Health, step troubleshooting, Settings diagnostics and save/write failure copy are unchanged. Friend artwork, pet instance/shiny/morph handling and bounded stage mounting are unchanged. Today and Wardrobe geometry rules are unchanged; no browser measurements are claimed.

Files changed:

| File | Change |
| --- | --- |
| js/app.js | Player presence/freshness wording, favourite guidance and filter, leaderboard timestamp, race copy, v571 build stamp |
| js/changelog.js | v571 release entry and stamp |
| sw.js | v571 cache stamp |
| version.json | v571 version stamp |
| docs/CLAIMS.md | Changelog item and numbered PROOF/REACH row |
| docs/leaderboard-honesty/REPORT.md | Dated note explaining the knowingly reversed policy |
| tests/crew-presence-audit.mjs | No-presence contract, timestamp boundaries, favourite filter source guarantees and baseline RED option |
| tests/leaderboard-honesty-audit.mjs | Rendered no-presence guarantees across surfaces and ages, leaderboard exception, favourite filter, preserved stale comparisons |
| tests/crew-capture-node-audit.mjs | Updated filter fixture variable and helper dependencies, neutral race wording assertion |
| tests/crew-fan-audit.mjs | Updated favourite filter fixtures; retains reachable/off-on-arrival/filter/restore/empty-state guarantees |
| tests/steprace-live-browser-audit.mjs | Neutral race comparison copy assertion |
| docs/v571-crew/REPORT.md | This advisory report |
| docs/v571-crew/run-pure.mjs | Socket-free driver copied from the earlier lane, with output paths scoped to this lane |
| docs/v571-crew/audit.txt | 51 rendered honesty checks |
| docs/v571-crew/red.txt | Original-source presence guard failure output |
| docs/v571-crew/unit-output.txt | Agreed unit command output |
| docs/v571-crew/locks.json | Protected function/file equality checks |
| docs/v571-crew/pure-first-output.txt | First full tier: 174/175, stale fixture dependency failure |
| docs/v571-crew/pure-first-results.json | First tier direct per-process exit records |
| docs/v571-crew/pure-second-output.txt | Second full tier, inherited CSS lock failure |
| docs/v571-crew/pure-second-results.json | Second tier direct per-process exit records |
| docs/v571-crew/pure-output.txt | Final full tier output, every entry enumerated |
| docs/v571-crew/pure-results.json | Final direct per-process exit records |

Selectors touched:

- #cfanOnline and .cfan-online retain their selectors and existing styling. Their label, click state and predicate now describe favourites, with text instead of a presence dot.
- #cfanStar and #cfanSel .cfan-star retain their IDs/classes and dimensions. Accessible label changes; .cfan-favourite-label replaces .cfan-status beneath the selected friend's name.
- .cfan-live and the filter's .live-dot are removed from rendered markup. .cfan-snapshot is removed from fan cards.
- .lb-seen retains the timestamp; its presence .on variant is removed. .race-fresh retains recorded-step or neutral comparison text. Race track accessible wording no longer mentions sync.
- #cfanNoHit retains its selector and now explains an empty favourites filter. #cfanSnapshot remains hidden with empty content. Existing profile/paddock notice helpers return empty strings. No crew-layout-audit selectors changed. __testFriends and __testMe remain intact.

Proof:

- node tests/unit.test.js: 390 passed, 0 failed, direct exit 0.
- node tests/leaderboard-honesty-audit.mjs: 51 passed, 0 failed, exit 0.
- node tests/crew-presence-audit.mjs: 5 passed, 0 failed, exit 0.
- RED: node tests/crew-presence-audit.mjs --source=/tmp/v571-before.js: 0 passed, 5 failed, direct exit 1. Baseline came from git show HEAD:js/app.js before edits. The fresh-timestamp assertion rejects the original Online now claim. The same current guard also rejects rendered dots and forbidden wording.
- node tests/crew-capture-node-audit.mjs after fixture repair: 16 passed, exit 0.
- node tests/crew-ui-1c-audit.mjs: source guarantees and negative controls passed, exit 0. Diff whitespace check passed.
- Full PURE is the last test run. The driver evaluates both the const PURE literal and every line-anchored PURE.push/unshift addition with exactly the r6-guards-audit extraction expressions. Each suite runs directly with Node, and its child close code is recorded without a pipe. Every suite and numeric exit appears in the output and JSON. See final result below.

Denied/blocked actions and deviations:

- No approval denial. No commit, push, merge, publish or deployment attempted. No original checkout was edited. native/ASC-SUBMISSION.md is unchanged.
- Browser audits, screenshots and socket binding were not attempted, as required. Independent review must confirm phone geometry, visible star ink, taps, filtered unfavourite behavior and leaderboard wrapping. The specified Today gap 261.203 and Wardrobe y 374.9 were not remeasured. Their source regions are unchanged. The existing six figure call sites were not edited and no new pet call site was added.
- Baseline mismatch: this checkout already had a real selected-friend star toggle, and its filter was an Online now text chip rather than the big star described in the plan. The implementation preserves that toggle, adds visible guidance, and repurposes the presence filter as an explicitly labelled favourites filter. This is the concrete interpretation used; no impossible requirement was silently redesigned.
- The first full PURE pass found one renamed fixture variable and missing helper dependency in crew-capture-node-audit. Those were repaired without weakening its guarantees. The second found that renaming a Crew CSS selector violated the Wardrobe inherited-prefix lock. The existing selector and CSS are now retained, with the new visible copy and behaviour. All runs are retained.

Final PURE result: 175/175 entries passed, 0 failed. Driver direct exit 0. Every recorded suite code is 0. No source or test edits followed this final run.
