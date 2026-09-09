# Today playtest

Advisory findings for independent review. Frozen plan SHA256 verified:
`296a6ddf88957e2d02afdf3d66ae00155074af546a25eedf772c5f52ac9cf104`.
All source paths below are relative to this checkout. No original checkout was edited.

**Method and limits**

The audit imports production `js/db.js`, `js/game.js`, `js/nutrition.js` and `js/wellness.js` over `tests/mem-idb.mjs`. It extracts the actual Today render expressions and handlers from `js/app.js`. Dates are fixed to local September 8, 2026, with explicit rollover fixtures. DOM, sound and navigation doubles observe handler destinations and rendered strings. They do not prove browser event timing, accessibility, pixels or layout. I could not see cosmetic or layout issues because opening a browser and binding sockets were prohibited.

Run the landed check with `node tests/today-playtest-audit.mjs`. It writes no files. It is registered in the PURE list at `tests/release-gate.mjs:347`.

**Findings, ranked by player harm**

1. **A streak crate could be permanently consumed by a failed delivery. Fixed for new claims.**

   Reproduction: persist three consecutive logged days, with today's meal carrying its production food-XP intent. Reject the inventory write whose source is `streak-3`. The original `onFoodLogged` writes `streak-3` for 100 XP before calling `grantCrate`. Restore storage and run the production recovery entry point, `initGameIfNeeded`, on an initialized save. Recovery sees the spent XP claim and delivers zero streak crates, then finishes the food receipt.

   Source: original `js/game.js:662` and `js/game.js:723-725`; final `js/game.js:662-676` and `js/game.js:727`. The separate inventory writer is `js/loot.js:2471-2475`.

   Observed RED: `FAIL REWARD streak crate survives delivery failure and retry: retry delivered 0 streak crates after XP claimed`.

   Player impact: an earned Bone Crate is permanently absent even after retry or normal recovery. Certainty: high, reproduced against production persistence and recovery.

   Fix: new live streak claims use the existing `awardOnce` transaction payload to write the XP and crate together. The audit aborts the real `claimAndPay` transaction through a throwing KV callback, checks that the crate is part of that payload, resumes via production recovery, and verifies one crate, 100 milestone XP, and a completed food receipt. Another retry and overlapping claims do not duplicate the crate. GREEN: the named REWARD row and overlapping-claims control pass.

2. **Several newly earned streak milestones delivered only the last crate. Fixed.**

   Reproduction: store seven consecutive diary days without milestone receipts, then log today's meal through `onFoodLogged`. This represents imported or backfilled diary history before the live milestone sweep. The original loop writes both milestone XP rows, but overwrites its single `milestone` variable and grants only `streak-7` outside the loop.

   Source: original `js/game.js:662-670` and `js/game.js:725`; final `js/game.js:662-676` and `js/game.js:757`.

   Observed RED: actual sources `['streak-7']`; expected sources `['streak-3', 'streak-7']`. Player impact: the lower milestone's claim is permanently spent without its crate. Certainty: high for this reachable persisted state. It is not the normal one-day-at-a-time path.

   Fix: each new live milestone claim carries its own crate. The returned `crates` count is the number actually delivered. GREEN: both crate sources are present and `crates === 2`. Historical `initGameIfNeeded` still uses its existing XP-only baseline; a separate control confirms that this change does not introduce retroactive initialization crates. This is an explicit payout correction for simultaneous live milestone claims, not a change to milestone thresholds or crate type.

3. **A failed day rollover disabled retries and could leave Add stuck. Fixed.**

   Reproduction: initialize the rollover anchor and selected day to September 7, store a 1,600 kcal meal against a 2,000 kcal target, then advance the clock to September 8. Reject the first day-close settlement call. Call `rollDayIfNeeded` again in the same session. Separately, trigger that failure through `commitLogEntry` with an Add button already disabled, as the real logging handlers do.

   Source: original `js/app.js:1925-1942` and `js/app.js:15878-15881`; final `js/app.js:1925-1944` and `js/app.js:15880-15885`.

   Observed RED: `retry delivered 0 day-close crates; calls=1`. In the logging case: `Add escaped: injected settlement failure; disabled=true`. The day anchor was advanced before the failing await, so the next timer/resume considered the rollover finished. The meal handler's try/catch began too late to rearm Add.

   Player impact: the earned day-close reward and new-day refresh remain unavailable through same-session retries; an open food sheet can keep Add disabled without saving the meal. This test does not claim that a subsequent full relaunch always loses the day-close reward permanently. Certainty: high for the exercised promise failure and actual handlers.

   Fix: advance the rollover checkpoint after settlement and the last-open write succeed. Include rollover and date retargeting in the existing meal-save failure handler. GREEN: retry settles exactly one crate, refreshes the day once, and saves the retried new meal exactly once on September 8. An existing meal edit retains September 7, and deliberate past-day navigation is preserved.

4. **Today's hero understated a protected streak. Fixed.**

   Reproduction: store diary rows for September 4, 5, 7 and 8, plus the saved `freeze` XP marker for September 6. Execute the real opening block of `renderToday`, then pass its streak to the production `gwartPool` copy function.

   Source: original `js/app.js:4262`; final `js/app.js:4274`. The existing authoritative union is `js/game.js:15-19`, already used by reward calculation and Progress.

   Observed RED: `Today says 2; protected streak is 5`. Player impact: Today disagrees with earned streak history and suppresses or understates the corresponding hero lines. Certainty: high for saves with legacy freeze markers.

   Fix: use `streakDateSet(allLog, allXp)` with the XP snapshot Today already reads. GREEN: five days and the production line `5 days running. The habit is doing the work now.` No additional full-store reads; `today-reads-lint.mjs` passes.

**Remaining issue and proposed follow-up**

Already-spent legacy milestone claims are not automatically compensated. Exact reproduction on the final source: seed three consecutive diary days and `xp['streak-3'] = { key: 'streak-3', type: 'streakms', xp: 100, date: today, ts: Date.now() }`, with no `streak-3` crate, then call `onFoodLogged` for today's persisted meal. Observed output: `LEGACY: claimed streak XP=100, delivered streak crates=0`. This reproduces the saved state left by finding 1.

The duplicate-claim path in `js/game.js:401-416` returns without paying. That protects against duplicate rewards, and initialization intentionally has an XP-only historical baseline at `js/game.js:1222`. An absent inventory crate alone is insufficient evidence of non-delivery because crates can also have been opened. I did not fully trace all historical consumption and migration records, so I did not guess at a compensation migration. Proposed follow-up: establish a reliable historical delivery/consumption discriminator or agree an explicit make-good policy before compensating old receipts. New claims are atomic; the report does not claim all pre-existing losses are repaired.

**Healthy paths actually exercised**

- Day-close settlement pays one crate and 50 XP; repeated settlement does not duplicate it.
- Ordinary food-write failure retains an unsaved meal and rearms Add. An XP failure leaves one committed meal with its persisted entitlement. Retrying the food award does not create another log-XP row.
- Meal rows and the real calorie-ring template agree for an empty diary, fractional values `340.4 + 340.4 + 341.7` (shown total 1,022), and 2,100 kcal against a 2,000 target (100 over). The Add controls remain present.
- Actual hero handlers route the scene and Backpack button to `crates`, the Stable button to Stable, and the Pit button to the Pit. A click originating in a nested button is ignored by the scene handler.
- Actual daily-row handlers record nine water taps as eight cups and one water reward, two bed taps as one reward, and six then eight hours of sleep as one reward with 480 minutes persisted. The completed water and bed templates remove their completed action buttons. The following day's wellness read starts at zero. These are sequential success-path checks, not a claim about every wellness failure or concurrent write.
- Overlapping live streak claims deliver one crate; historical initialization continues to grant milestone XP without retroactive crates.

**RED and GREEN evidence**

The initial RED checks ran before their corresponding production edits. After completing the audit, I copied only this checkout's `js/`, `data/`, package metadata and the two audit files to a disposable external directory, restored the two production files there from this checkout's original HEAD, and ran the final audit unchanged. This stronger check confirms the landed audit still detects every fixed bug without changing production source in the graded checkout.

Final audit against original production source:

```text
PASS CONTROL day close pays one crate and retries pay none
FAIL ROLLOVER failed settlement remains retryable in the same session: retry delivered 0 day-close crates; calls=1

0 !== 1

FAIL ROLLOVER failed meal-time settlement rearms Add and retry saves once today: Add escaped: injected settlement failure; disabled=true
PASS CONTROL rollover retains deliberate past navigation and existing meal dates
FAIL STREAK Today honours earned freeze days in the hero copy: Today says 2; protected streak is 5

2 !== 5

PASS CONTROL food save failure keeps Add usable; XP failure keeps one committed meal
FAIL REWARD streak crate survives delivery failure and retry: retry delivered 0 streak crates after XP claimed

0 !== 1

FAIL REWARD every newly earned streak milestone delivers its crate: Expected values to be strictly deep-equal:
+ actual - expected

  [
-   'streak-3',
    'streak-7'
  ]

PASS CONTROL overlapping milestone claims pay one crate; history initialization stays XP-only
PASS CONTROL meal rows and calorie ring agree at fractional, empty and over-budget totals
PASS CONTROL actual hero handlers open Backpack, Stable and Pit without button bubbling
PASS CONTROL daily row handlers persist water, bed and sleep; repeat taps pay once
TODAY PLAYTEST: 7 passed, 5 failed (Node only)

EXIT 1
```

Final audit against the edited checkout:

```text
PASS CONTROL day close pays one crate and retries pay none
PASS ROLLOVER failed settlement remains retryable in the same session
PASS ROLLOVER failed meal-time settlement rearms Add and retry saves once today
PASS CONTROL rollover retains deliberate past navigation and existing meal dates
PASS STREAK Today honours earned freeze days in the hero copy
PASS CONTROL food save failure keeps Add usable; XP failure keeps one committed meal
PASS REWARD streak crate survives delivery failure and retry
PASS REWARD every newly earned streak milestone delivers its crate
PASS CONTROL overlapping milestone claims pay one crate; history initialization stays XP-only
PASS CONTROL meal rows and calorie ring agree at fractional, empty and over-budget totals
PASS CONTROL actual hero handlers open Backpack, Stable and Pit without button bubbling
PASS CONTROL daily row handlers persist water, bed and sleep; repeat taps pay once
TODAY PLAYTEST: 12 passed, 0 failed (Node only)

EXIT 0
```

**Agreed proof and audit coverage**

- `node tests/unit.test.js`: exit 0, `377 passed, 0 failed`.
- Every current PURE entry from `tests/release-gate.mjs`: **116/116 exit 0** after dependency recovery. The runner evaluated the actual PURE declaration and subsequent push/unshift statements, then ran each entry with Node from this checkout. It did not start the combined gate's server or browser tier.
- Initial PURE pass: 112 exited 0; `store-copy-lint.mjs`, `store-runtime-audit.mjs`, `submission-build-audit.mjs` and `submission-preflight-audit.mjs` exited 97, explicitly reporting missing `esprima`. All four exited 0 on retry.
- Dependency recovery: the offline npm install attempt returned `ENOTCACHED`. The exact `esprima@4.0.1` tarball was nevertheless present in npm's content-addressed cache. Its SHA512 matched `package-lock.json`; it was extracted outside the checkout and copied into ignored `node_modules/esprima`. No manifest or lockfile changed and no install scripts ran.
- The final expanded Today audit, guard hygiene, guard provenance and Today-read checks were rerun after audit additions and exited 0.
- `node tests/release-gate.mjs --coverage-only`: exit 0, `coverage: 367 audits on disk, 122 fast, 129 full, 116 skipped`. These are the gate's inventory categories, not the PURE execution count.
- Full per-entry logs and the enumerated PURE list are in `/private/tmp/today-pure-proof/`. Initial results retain the four exit-97 records; the corresponding `.retry.txt` files hold successful rerun output. The agreed unit-command output is `/private/tmp/today-unit.txt`.

**Files changed**

- `js/app.js`: rollover checkpoint/failure handling and protected-streak display.
- `js/game.js`: atomic live milestone crates and accurate returned crate count.
- `tests/today-playtest-audit.mjs`: new runnable production audit.
- `tests/release-gate.mjs`: register the audit in PURE.
- `docs/PLAYTEST-TODAY.md`: this advisory report.

Local ignored dependency files were added under `node_modules/esprima`. Scratch runners, source copies and raw evidence stayed outside the checkout.

**Denied/blocked actions and deviations**

No permission requests or permission-denied actions occurred. Missing parser dependencies temporarily blocked four proof checks; that block was resolved offline. Browser and socket-based playtesting were intentionally unavailable under the frozen order, so no visual claim is made. No commit, push, PR, publication, Worker deployment, remote Wrangler operation, production D1 write or secret change was attempted. `native/ASC-SUBMISSION.md` and Cam's art were untouched.

No scope or workflow deviation was needed. The explicit limit is the unresolved historical compensation issue above. The implementation and proof are advisory for the independent reviewer.
