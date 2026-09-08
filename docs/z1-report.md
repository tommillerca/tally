# Z1 advisory implementation report

The supplied plan SHA256 matched `5cdc97adf4b1cb68b3e88927c70ce00bd851720766472c78c15725c8a7374b4d`. All source reads and edits used this checkout. No original checkout was edited.

## Files changed

- `js/app.js`: Trends now uses the paying engine's `streakDateSet`, removing walking-only streak credit and preserving historic freeze protection. It still uses the entire diary and the existing grace period for an empty today.
- `tests/zero-calorie-seam-audit.mjs`: new Node guard runs actual Trends calculations and recap HTML with DOM substitutes, plus real `onFoodLogged`, `buildStats`, storage and XP ledger code using the existing in-memory IndexedDB helper and a fixed local clock.
- `tests/r46-diary-audit.mjs`: supplies the shared streak helper to the renderer and updates the walking-only control to the row rule.
- `tests/release-gate.mjs`: registers the new guard in PURE.
- `docs/z1-report.md`: this advisory report.

## Evidence and proof output

All commands below exited 0:

```text
node tests/unit.test.js
369 passed, 0 failed

node tests/zero-calorie-seam-audit.mjs
7 passed, 0 failed

node tests/r46-diary-audit.mjs
6/6 guards passed

node tests/log-xp-farm-audit.mjs
all green, 7 checks

node tests/release-gate.mjs --coverage-only
coverage: 343 audits on disk, 121 fast, 129 full, 93 skipped

git diff --check
(no output)
```

The new guard verifies:

- A zero-calorie row belongs to both the weekly logged-day count and the paying streak. Deleting its day's only row changes a 9-day streak to 6 and a 90-day streak to 3, identically in the display, payment result and badge statistics. The weekly recap changes from 7/7 to 6/7 in both fixtures. Counts over different windows are not expected to have the same numeric delta as a consecutive streak.
- A zero-calorie quick add advances 13 to 14, produces the existing 14-day milestone ledger award, and cannot pay again on retry.
- Deleting one of two zero-calorie rows keeps the day; deleting the last removes it, despite surviving XP records.
- Empty and walking-only diaries count zero days and zero streak. Historic freeze records retain their existing streak protection without becoming logged food days.
- A positive food pays its base 10 XP. Sixty zero-calorie log/delete attempts cannot exceed the existing shared daily log XP ceiling.

The existing anti-farm audit independently reports 200 XP for 60 positive logs, unchanged after deleting them and logging five more, with a new day's first log paying 10 XP. It also checks entry retry deduplication and overlapping calls under the storage substitute. This does not certify browser races.

## XP proposal requiring Tom's call

No XP policy change was implemented. This checkout already routes base food XP through `awardCapped` with `XP_DAILY_CAP.log = 20`, a maximum of 200 base food XP per day, with entry-reference deduplication. Deleting diary rows does not restore those ledger slots. That mechanism bounds the farm, but does not eliminate the first +10 XP for a zero-calorie row.

Proposed narrow fix: make a zero-calorie row ineligible for base food-log XP in both `finishFoodLogged` and the historical replay log phase. Keep positive food awards on the existing capped ledger, preserve existing slot identities and paid records, and do not consume a paying slot for an ineligible row. Tests should cover zero-only replay, mixed positive/zero rows, retry, deletion, and the shared daily ceiling. Replay must not renumber existing ledger claims when filtering eligibility.

This needs Tom's decision because logging a legitimate diet soda and tapping a zero-calorie quick add are both valid diary rows under his ruling. A calorie threshold cannot establish whether someone logged honestly. The optional policy question received no answer during this implementation, so no new entitlement rule was inferred.

The proposed change closes the repeatable zero-calorie base-XP payout only. First-log XP, meal/badge rewards, and streak milestone XP are separate existing rewards. Removing those for zero-only days would require a broader ruling. Current zero-calorie rows can still earn base XP up to the existing cap and can earn those other rewards. This report does not claim the first-tap XP issue is closed.

## Deviations and limits

The plan's measured `kcal > 0` logged-day defect was already fixed in this checkout before work started. That condition was not reimplemented. Inspection found a remaining disagreement: Trends gave streak credit for walking-only days, while the paying engine did not. The implementation resolves that disagreement under the row rule and replaces the earlier audit's contrary walking expectation.

Historic freeze protection remains an explicit inherited exception for streaks. It does not make an empty food diary a logged day. No impossible implementation requirement was found. The XP distinction remains a proposal, as the frozen plan requests, pending Tom's policy call.

Denied actions: none. Blocked decision: the proposed new zero-calorie base-XP eligibility policy has not been authorized. Browser, socket/server proofs and the full release gate were unrun as instructed; only coverage-only gate validation ran. No commit, push, or publication was attempted.
