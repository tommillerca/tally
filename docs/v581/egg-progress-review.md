# B2 egg progression: advisory implementation report

Plan SHA256 verified: `588715c5c520d3c521b4c7cee08c05de95c4b96e4c91ff4f894037e0c62e1742`.
Baseline main: `26621a9f29dd60e8fdbccb4dfa8b59422029cd1b`.
All source paths were resolved within this checkout. No commit, push or publication was attempted.

## Files changed

- `js/wellness.js`: atomically claims a daily walk ordinal, records the walk, pays XP and Vigor, credits held eggs, and grants the threshold egg using the shared daily receipt. Applies the existing day authority and preserves level rewards.
- `js/loot.js`: adds persisted manual credit to an egg's existing incubation progress. The original anchor and shared pet progression meter remain intact.
- `js/game.js`: includes accepted manual credit in the daily egg threshold on Health sync. Commits the Health egg and its receipt together so the new mixed-source reward cannot be interrupted between claim and grant.
- `js/app.js`: sends the displayed walk ordinal for replay protection, reports egg credit, retains the capped UI, and derives the requested threshold sentence from `EGG_STEP_THRESHOLD` in Backpack's Step Eggs section. Explains earning versus hatching and the manual conversion rate.
- `tests/egg-progress-audit.mjs`: CONTROL, PROGRESS, EARN, CAP, NO-RESET, RACE, REPLAY, CLOCK, SHARED-EGG, CONCURRENT-CAP, threshold copy, before/after simulation, and browser controls. Default browser mode serves this checkout and accepts `process.argv[2] || process.env.URL`.
- `tests/release-gate.mjs`: declares the audit in the full tier.
- `tests/reward-sop-audit.mjs`: updates the affected payout registrations and points to the new reward audit.
- `tests/unit.test.js`: adds incubation preservation, manual-only readiness and stalled-anchor credit assertions.
- `docs/v581/guard-red.txt`: baseline red, working simulation green, browser denial and evidence limits.
- `docs/v581/egg-progress-unit.txt`: complete agreed proof output.
- `docs/v581/egg-progress-review.md`: this advisory report.

No prohibited source or version file was edited. No CSS change was needed.

## Proof and findings

`node tests/unit.test.js`: exit 0, **392 passed, 0 failed**. Complete output is in `egg-progress-unit.txt`.

`node tests/egg-progress-audit.mjs --simulate`: exit 0, **0 failed**. The real walk, egg-progress and Health reward functions execute against a serialized in-memory persistence adapter. Peripheral level rewards and badges are excluded from the direct balance simulation. This is not proof of IndexedDB transaction behavior or rendered UI.

`node tests/egg-progress-audit.mjs --simulate --main`: exit 1, expected. The sources are read directly from main with `git show`, without modifying that tree. CONTROL accepts two walks. PROGRESS has delta 0. TOLD-SOURCE is absent. The working tree reports 15,000 raw egg credit, 8,000 visible incubation delta on the control egg, one additional daily egg, and the derived threshold sentence.

`node tests/release-gate.mjs --coverage-only`: exit 0. Output: `coverage: 452 audits on disk, 129 fast, 140 full, 183 skipped`.

`node tests/reward-sop-audit.mjs`: exit 1. Its static scanner finds 31 unregistered actions and 15 payout-count mismatches elsewhere. Replaying its scanner against read-only main sources and this tree produced identical action IDs and count mismatches. The changed walk and Health actions match their registrations. The browser portion then hits the same server denial below. This broader audit is not green.

JavaScript syntax checks and `git diff --check` passed.

## Reward authority and preservation

The state transition is a free daily ordinal becoming a recorded manual walk. The health row, prior XP receipts, day authority and egg inventory are read within one `payAtomic` transaction. That transaction records the walk and its rewards together. A failed transaction cannot spend the ordinal while dropping egg credit.

The UI sends the rendered ordinal, so two taps or a replay of that request can claim it only once. A request with a changed duration and the same ordinal is still a duplicate. Calls that omit the ordinal may take the two distinct daily slots, but four concurrent calls still accept only two. Third and fourth calls add no progress or other reward. The UI removes the walk buttons after two completions.

Clock rollback is refused. Forward changes use the existing witnessed-day grace, not a new clock policy: the existing limited forward window still exists; this is not a claim that the local clock is independently trusted. A jump 30 days forward is refused in the audit. Returning to a previously used date does not reset its receipts.

Manual progress is stored on held eggs as additive `manualWalkCredit`, not in `health.steps` or `exerciseMin`. Existing anchors, verified steps, exercise credit and previously banked egg progress are preserved. The race's actual `weekStepsNow` reducer still reads only verified `steps`; the shared pet meter remains zero in the no-Health control. Previously logged legacy manual walks are not retroactively rewarded, and their daily slots remain occupied.

## Balance choice and measured effect

The frozen plan does not specify minutes-to-progress conversion. The implementation uses the existing incubation conversion `STEPS_PER_ACTIVE_MIN` (250 per minute), with the existing two walks per day and 60 minutes per walk bounds. It applies this credit to both held-egg incubation and the existing daily new-egg threshold. It does not change the 14,000 threshold or the 8,000 hatch goal.

Direct simulation: 60 real elapsed days, two accepted walks each day, no Health source, one initial unhatched egg. Each day's authority witness advances to represent actual elapsed time. Ready eggs are counted and removed without simulating pet loot, level rewards or other egg sources.

| Walks each day | Before: daily eggs earned | After: daily eggs earned | Before: hatch-ready eggs | After: hatch-ready eggs |
| --- | ---: | ---: | ---: | ---: |
| 2 x 15 minutes | 0 | 0 | 0 | 1 |
| 2 x 30 minutes | 0 | 60 | 0 | 60 |
| 2 x 60 minutes | 0 | 60 | 0 | 61 |

All scenarios accept 120 walks and contribute zero race steps. The maximum row can hatch the initial egg plus all 60 earned eggs. At 30 minutes, one earned egg remains unhatched at the end. Two 15-minute walks help hatch held eggs but do not meet the daily new-egg threshold. The one-egg-per-day rate for two 30-minute walks is a substantial balance change and should be assessed explicitly by the independent reviewer.

## Denied actions, deviations and remaining proof

The sandbox denied the local server with `listen EPERM: operation not permitted 127.0.0.1`. `node tests/egg-progress-audit.mjs` exited 1 before any browser rows. Rendered TOLD red/green, actual walk controls, `tests/ui-audit.js`, and real IndexedDB concurrency remain unverified. No approval override was attempted because this session disallows it.

Proposed proof deviation: use the recorded direct simulation and source-copy check as partial evidence, then run the browser audit against separately served baseline and changed trees in an environment that permits local servers. These substitutes do not satisfy the frozen requirement for rendered TOLD evidence. The audit supports an explicit URL for that follow-up and never defaults to production.

An initial broad read-only file search also encountered permission denials for `/private/tmp/manager/extensions` and `/private/tmp/mdmdownloads`. Neither directory was required, edited or used. An initial baseline source read exceeded Node's default child-process output buffer; increasing that read buffer resolved it and the recorded red run completed.

Implementation choices beyond the unspecified conversion rate: per-egg credit avoids changing pet bonding; the Health egg payout is made atomic because the new mixed-source path uses it. No requirement was treated as waived, and this report is advisory for independent review.
