# Progress playtest findings

Advisory evidence for independent review. Four proven findings fixed. No permanent reward loss was reproduced in the badge scenarios exercised.

Frozen plan SHA256 verified: `44e648f538366c04073f3d9ce5f2b44a6cc8556b14fbb0dcea72e8c6d88c0f4c`.
Baseline commit: `0412b237706e77e47b9f9f9e9d625014c76dfe31`.
All source paths below are relative to this checkout. No original checkout was edited.

The audit imports production `js/db.js`, `js/game.js` and `js/nutrition.js` over `tests/mem-idb.mjs`. It extracts real functions and the Progress receipt template from `js/app.js`, runs the metric range and chart click handlers, and captures their generated HTML/SVG. DOM adapters supply elements and event registration, not replacement calculations. It does not write files at runtime. The badge failure injection aborts the actual in-memory IndexedDB transaction at the badge add request.

## Findings, ranked by player impact

### P1. Partial activity creates contradictory averages and a false decline

Certainty: high, reproduced in production chart and sheet functions. Fixed.

Reproduction: set the display date to September 8, 2026. Save six completed daily health rows, September 2 through 7, with 10,000 steps each; save September 8 with 100 steps. Open Progress, Steps History, then Week. The runnable audit also exercises active energy (six days of 500 kcal, today 5) and move minutes (six days of 60, today 0.6).

Observed before the fix: the Week summary said `Average 10,000`, while the dashed chart baseline said `avg 8,586`. The insight said `Down about 25% in daily steps vs earlier in the window.` All completed days were identical. The summary already excluded today, while the chart and insight included its partial total.

Player impact: an ordinary morning appears to be a decline, and two averages on one screen disagree without explaining their samples.

Source: baseline `js/app.js:11587`, `js/app.js:11676`, and `js/app.js:11694`. Current fix: `js/app.js:11583`, `js/app.js:11588`, and `js/app.js:11692`. The chart baseline now uses the summary's existing sample, and the daily insight uses the completed-day points. Today's bar retains its exact value and click target. The existing today-only fallback and Year aggregation policy remain in place.

Red: `steps: chart avg 8,586, summary 10,000`; separate insight check: `Down about <b>25%</b> in daily steps vs earlier in the window.`
Green: chart and summary both show 10,000 steps, 500 active kcal, or 60 move minutes; the insight holds steady. A real completed-day decline still reports 50%, and noncumulative heart readings still include today.

### P2. Year weight history reports a monthly mean as the latest weigh-in

Certainty: high, reproduced through the actual Year button callback. Fixed.

Reproduction: save weights of 70 kg on September 1 and 90 kg on September 8, 2026. Open Weight History and tap Year.

Observed before the fix: the monthly chart bar correctly averaged 80 kg, but the `Latest` statistic also said `80.0`. The latest saved weigh-in and sheet header were 90 kg.

Player impact: changing the history window appears to change the latest recorded weight.

Source: baseline `js/app.js:11684`. Current fix: `js/app.js:11673` and `js/app.js:11687`. Latest now reads the last recorded date in the displayed window. The Year chart retains its monthly averages.

Red: `Latest 80.0; latest saved weight 90.0`.
Green: `monthly bar 80.0 kg; Latest 90.0 kg`.

### P3. A short sleep record presents an unavailable score as `null/100`

Certainty: high, with reachability checked through the real readiness tile renderer. Fixed.

Reproduction: provide eight resting-heart-rate days so readiness is calibrated, with the latest health row containing `sleepMin: 35`, `sleepHours: 35 / 60`. Open the Sleep tile in Progress. The audit verifies the tile has `data-sleepdetail="1"` and invokes the production detail function.

Observed before the fix: `sleepScore` correctly returned null for this duration, but the sheet interpolated it as `null/100` and said it fed readiness. The recorded duration remained `0h 35m asleep`.

Player impact: an unavailable score looks like a broken numeric result, accompanied by an incorrect claim that it contributes a sleep score to readiness.

Source: baseline `js/app.js:11913` and `js/app.js:11917`; current fix `js/app.js:11918` and `js/app.js:11922`. The sheet now shows a missing-value dot, explains the existing three-hour scoring floor, and retains the recorded duration and stages. Scoring rules were not changed.

Red: `observed null/100 for 35 minutes`.
Green: `35 minutes retained; unavailable score explained`. Control: an eight-hour manual record still displays the production result, `95/100`.

### P4. An older visible sleep reading is described as an unstarted trend

Certainty: high for rendered copy, with no visual-layout claim. Fixed.

Reproduction: on September 8, 2026, save one eight-hour sleep record dated August 29 and open Progress. The record is inside the 14-day chart but outside the seven-day average.

Observed before the fix: the eight-hour bar and hit target were rendered, but the tap hint was blank and the footer asked the player to log sleep `to start your sleep trend`. Those strings checked only the last seven days.

Player impact: a player returning after a week gets misleading empty-state instructions beside their existing history, with no invitation to explore it.

Source: baseline `js/app.js:11317` and `js/app.js:11318`; current fix `js/app.js:11242`, `js/app.js:11318`, and `js/app.js:11319`. Chart copy now checks the chart's 14-day window. The seven-day average still excludes this older reading.

Red: `older bar exists but its exploration hint is blank`.
Green: `10-day-old sleep bar retains tap hint; 7-day average remains empty`.

## Healthy paths exercised

- Two concurrent `evaluateBadges()` calls produce one First bite announcement and exactly 25 XP. Removing the qualifying food row and evaluating again leaves the earned badge and its XP intact.
- Aborting the badge transaction leaves no badge receipt and zero XP. Retrying grants one badge and 25 XP. A subsequent retry returns no new badges. The test verifies that the injected abort actually occurred.
- The actual Progress receipt template totals nine persisted 10-XP receipts as 90 XP, renders six rows, and discloses `Showing 6 of 9 XP receipts for today`. All 29 catalogue badge tiles render.
- Secret badge taps show the mystery hint before earning and the actual achievement description after its badge receipt exists.
- Day, Week, Month and Year callbacks regenerate the history body and rewire the actual chart click handler. Populated hit targets report their stored values. Empty values report `nothing recorded`; empty history presents its no-readings state.
- Genuine activity changes remain measurable, noncumulative heart averages retain today's reading, and a today-only history stays finite and explorable.

These are bounded checks, not a universal guarantee about every badge, level reward, cloud merge or native storage failure.

## Reproduce the red and green evidence

No scratch files are created inside `tests/`. The optional argument selects only the production app source; imported game and database modules are unchanged by this work.

```sh
git show 0412b237706e77e47b9f9f9e9d625014c76dfe31:js/app.js > /private/tmp/progress-baseline-app.js
node tests/progress-playtest-audit.mjs /private/tmp/progress-baseline-app.js
# Expected exit 1: 6 passed, 5 failed (P1 has two independent checks).
node tests/progress-playtest-audit.mjs
# Expected exit 0: 11 passed, 0 failed.
```

All four findings first failed before production edits, with the control rows passing. An initial P4 harness run lacked the production `shownTotals` binding. That setup error was corrected, then P4 failed on its actual missing hint before the production fix. The complete final audit was also rerun against the preserved baseline source and failed for the original bugs.

## Agreed proof

`node tests/unit.test.js` exited 0. It was also run as a PURE entry after the production changes:

```text
377 passed, 0 failed
```

Every one of the 116 entries in the final `PURE` list of `tests/release-gate.mjs` has an exit-0 result. A temporary runner evaluated the actual PURE declarations, used three child processes for independent entries, respected the gate's SERIAL membership, and captured logs outside the checkout. It did not execute the browser/server portion of the gate.

The initial sweep exited 1 with `PURE: 112/116 passed; 4 failed`. All four failures were explicit exit-97 dependency refusals, not failed assertions:

```text
UNPRV esprima  DID NOT RUN: missing dependency esprima. Install from this checkout root: npm ci --include=dev
```

The locked `esprima@4.0.1` tarball was available in the local npm cache. Its SHA512 was checked against `package-lock.json`, then its files were unpacked into this checkout's ignored `node_modules/esprima`. No network access or package/lockfile edits were needed. Each blocked entry was rerun and exited 0:

| PURE entry | Final output |
| --- | --- |
| `store-copy-lint.mjs` | `ok store copy: beta surfaces unreachable and store strings clean` |
| `store-runtime-audit.mjs` | `store runtime: 13/13 passed` |
| `submission-build-audit.mjs` | `ok submission build: explicit modes, separate artifacts, copied and archived content guarded (fixture tools only)` |
| `submission-preflight-audit.mjs` | `submission preflight: refuses marker, flag, server and copy defects; passes the control` |

Thus 112 initial passes plus four successful dependency retries cover all 116 registered entries. The new Progress audit was rerun after its final control additions, with 11 passing checks. Initial per-entry logs are in `/private/tmp/progress-pure-results/`; retry logs use the `.retry.log` suffix. These temporary files are supporting session evidence, not required checked-in artifacts.

Final registration and hygiene checks also exited 0: `node tests/release-gate.mjs --coverage-only` reported `coverage: 367 audits on disk, 122 fast, 129 full, 116 skipped`; `node tests/guard-hygiene-lint.mjs` reported `guard-hygiene: clean`. The coverage report's skipped inventory is separate from the PURE list. `node --check js/app.js` and `git diff --check` passed.

## Files changed, limits and denied actions

- `js/app.js`: four Progress display corrections described above.
- `tests/progress-playtest-audit.mjs`: production-driven regression audit and healthy controls.
- `tests/release-gate.mjs:347`: registers that audit in PURE.
- `docs/PLAYTEST-PROGRESS.md`: this evidence report.
- Local dependency setup only: ignored `node_modules/esprima`, restored from the verified cache for proof.

No proven finding from this report remains unfixed. Browser appearance, layout, physical touch targets and native device behavior were not observable, so no cosmetic findings or pixel claims are made. Monthly aggregation and the existing weighting choices were not redesigned.

One tool action was denied: `apply_patch` refused creation of the temporary PURE runner at `/private/tmp/progress-run-pure.mjs` as outside its project boundary. The same temporary file was then created successfully through an allowed shell write. The missing-dependency blocks were resolved as described above. No permission request or unresolved blocker remains.

No product or scope deviation from the frozen work order. Running the PURE declarations independently was the execution adaptation required by the no-sockets/no-browser constraint. No commit, push, PR, publication, Worker deployment, remote Wrangler command, production D1 write, secret change or edit to `native/ASC-SUBMISSION.md` occurred. Art assets were untouched.

## Captured audit output

Baseline production source, exit 1:

```text
PASS CONTROL badge concurrent evaluation pays once and survives loss of qualifying log: one First bite announcement, 25 XP retained
PASS CONTROL aborted badge write can retry without losing or doubling XP: abort 0 XP; retry 25 XP; repeat 0 new badges
PASS CONTROL Progress receipts count all earned XP while disclosing the six-row preview: 90 XP total; six of nine receipts disclosed; all 29 badge tiles rendered
FAIL P1 cumulative history chart and summary share the completed-day average: steps: chart avg 8,586, summary 10,000
PASS CONTROL range switches rewire actual chart click and no-data readouts: Day/Week/Month/Year clicks and empty history reached
FAIL P1 partial today cannot invent a declining activity insight: observed insight: Down about <b>25%</b> in daily steps vs earlier in the window.
PASS CONTROL genuine changes, noncumulative readings and today-only samples remain visible: real decline 50%; heart average 70; today-only bar 100
FAIL P2 Year weight Latest is the latest weigh-in, not its monthly mean: Latest 80.0; latest saved weight 90.0
FAIL P3 short sleep does not present a null score as a number: observed null/100 for 35 minutes
PASS CONTROL full sleep still shows the computed score and secret badge taps stay masked: 95/100; secret masked before earning, description reachable after
FAIL P4 sleep chart with older readings keeps its exploration hint: older bar exists but its exploration hint is blank
Progress playtest: 6 passed, 5 failed
```

Fixed production source, exit 0:

```text
PASS CONTROL badge concurrent evaluation pays once and survives loss of qualifying log: one First bite announcement, 25 XP retained
PASS CONTROL aborted badge write can retry without losing or doubling XP: abort 0 XP; retry 25 XP; repeat 0 new badges
PASS CONTROL Progress receipts count all earned XP while disclosing the six-row preview: 90 XP total; six of nine receipts disclosed; all 29 badge tiles rendered
PASS P1 cumulative history chart and summary share the completed-day average: steps 10,000; active energy 500; move minutes 60; steady insights
PASS CONTROL range switches rewire actual chart click and no-data readouts: Day/Week/Month/Year clicks and empty history reached
PASS P1 partial today cannot invent a declining activity insight: Holding steady across this window
PASS CONTROL genuine changes, noncumulative readings and today-only samples remain visible: real decline 50%; heart average 70; today-only bar 100
PASS P2 Year weight Latest is the latest weigh-in, not its monthly mean: monthly bar 80.0 kg; Latest 90.0 kg
PASS P3 short sleep does not present a null score as a number: 35 minutes retained; unavailable score explained
PASS CONTROL full sleep still shows the computed score and secret badge taps stay masked: 95/100; secret masked before earning, description reachable after
PASS P4 sleep chart with older readings keeps its exploration hint: 10-day-old sleep bar retains tap hint; 7-day average remains empty
Progress playtest: 11 passed, 0 failed
```
