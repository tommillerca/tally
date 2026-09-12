# Session log, 2026-09-12 (Gwart commanding, Codex building)

Tom: "keep a detailed log for me to go through after of success, decisions
needed from me etc so i can stay in the loop with what is progressing".
Newest entries at the bottom. Times are Pacific.

## Decisions needed from Tom (open)

| # | Question | Why it is yours | My recommendation |
|---|---|---|---|
| D1 | **F16 meal chip.** Keep "last meal wins all day", clock only, or last meal for two hours then the clock? | Playtest: 60 of 80 logs needed a corrective tap. Changing it changes the logging habit | Option 3, two-hour memory then the clock |
| D2 | **F7 pet growth in the Stable.** The growth is built (+4% per breeding tier, capped +24%, art untouched), but the Stable draws pets through the pet card slider, which your rules say I must not touch. Allow one argument to be added to that sprite call, or ship growth in the Pit and friend profiles only? | Rule 7 in the handoff locks the slider | Allow the one-argument change; otherwise the fish you noticed stays small where you look at it |
| D3 | **F9 first run.** On a fresh install "Restore an account" is the primary button and "I am new" is the ghost. Swap them? | Which action is primary on first run is design | Swap on the unknown/no-save branch only; keep recovery-first when a save is known to be missing |
| D4 | **Economy findings** (`docs/BUGS-v588-economy.md`, six items). All are "a reward is claimed in one write and paid in a later one, so a crash between them loses the payout". Fixing them touches reward transactions. Go ahead on the two cleanest (friend battle / spar coins, wellness completions), or park all six? | Reward paths are economy | Fix those two next week, one lane each, with take-and-pay style proofs |
| D5 | **Server findings** (`docs/BUGS-v588-server.md`, ten items). Four need a Worker deploy, which only you do: podium settlement can pay first place and never the rest (#1), replay guard hashes the wrong thing (#2), a flagged test account stays visible to existing friends (#5), a cheer retried across UTC midnight pays twice (#10). | Worker deploys are yours | Schedule #1 first; it loses real prizes |
| D6 | **Race week boundary.** Client computes race weeks in local time, the Worker in UTC, and DST can produce an invalid key (server finding #4). Global UTC or player-local? | Product decision | UTC, shown to the player as "resets Monday 00:00 UTC" |

## Successes (shipped or proven)

- **F4 was already fixed** (since v528; the playtest measured v526). Closed in the register with a fresh observation on v587. PR #510.
- **Melt review recovered.** It only existed in a lane scratchpad; now `docs/melt-review.md`. PR #510.
- **Your four picks logged verbatim** (F5, F7, F16, F17). PR #511.
- **Three bug hunts landed as findings docs**, no product change: economy (6), UI (9), Worker/sync/service-worker (10). PRs #512, #513, #514.

## v588 train (branch `ship/v588`), built by five Codex lanes, every browser audit run by me

| Item | Lane | Proof |
|---|---|---|
| Salvage Bench moves to the Wardrobe; Shop shortcut lands on it | l-bench (2 rounds) | melt-ui-audit HOME/GONE/ROUTE/EMPTY green on the train, red on live. Round 1 hid the Dressing Room apply button; wardrobe-stack-audit caught it, round 2 fixed it |
| Names wrap instead of clipping (podium, leaderboard, race, gifts, Crew plates, newcomers, Pit HUD, incoming request) | l-namefit (3 rounds) | name-fit-audit promoted to a guard: 366 reds to 0 on the train, 124 reds on live at the real squeezes. Round 3 found a real defect the old audit hid: at 200% text on a 375 phone the incoming request name rendered one letter per line, 787px tall |
| Confirm before deleting a logged food | l-delconfirm | log-delete-confirm-audit 7 rows green, red on live at ASKS |
| Four buttons no longer stay dead after a refused write (Restore, recovery save, cloud backup On, Delete fit) | l-stuckbtn | settings-safety-audit 33 rows, 7 new ones red on main |
| Height clears when switching units; lucky number checkbox; Recovery ID availability race; recovery copy tells the truth | l-forms | forms-state-audit 4 rows, all red on main |

Held out of v588: pet growth (D2), and l-ackpriv (recovery save must see a real server acknowledgement; Privacy link opened the app shell instead of the policy), both built and proven, waiting for a gate slot so v588 is not re-gated.

## Gate status

- 11:46 The full gate on the train: 254 pass, 54 fail. Five of the 54 are mine and are fixed (four audits re-anchored on the bench's new home, one lock rebaselined with your quote). The rest are a mix of "currency history does not match" fixture crashes, DEPENDENCY NETWORK rows (the Worker did not answer from this machine), precache gaps (`js/hero-ground.js`, `js/laboratory.js` are not in the precache list on main either) and layout rows on screens no lane touched.
- 11:50 Running the identical gate on a pristine worktree of main as the control, nothing else on the machine. Whatever is red on both is not v588's. Whatever is red only on the train gets fixed or the lane is pulled before merge.

## Traps hit today (so nobody pays twice)

- `page.locator().click()` has the same below-the-fold failure as `page.click()`. Use `page.evaluate(() => el.click())`.
- melt-ui-audit was red on main since v550: a melted piece keeps its currency receipt forever, so a later row that melts the same id is refused; and two Dressing Room copy rows were pinned to pre-v550 wording. Fixed at the assertions.
- claim-evidence-lint resolves `tests/x.mjs` against `tests/`, so a PROOF must name the audit bare (`x.mjs`) or in a backticked command.
- Codex hands back CLAIMS entries as tables or a single row for a multi-item changelog; r6 needs one `Changelog item:` line and one numbered `PROOF | REACH` row per item.
- Two lanes appending to the end of `app.css` conflict on merge; resolve by keeping both blocks.

## 12:35 Gate verdict and Tom's answers

- The control gate on pristine main: 258 pass, 48 fail. Every one of those 48 is also red on the train, and none is red on main only. **Main has carried 48 browser-tier reds of its own**; the handoff's "one red on main" was the pure tier. Written up for the next handover, not fixed today.
- Train-only reds: six. Five were audits pinned to the Backpack's old markup or to the delete flow, re-anchored. The sixth, boneyard-scroll, times out on main too when run alone (flaky), so it is not v588's.
- v588 ships now: five lanes, gate diff clean against main.
- Tom answered D2 (grow pets everywhere except the Stable, including the Paddock, which needs the paddock.js lock lifted), D3 (swap the first-run buttons, new-player focused), D5 (podium settlement first, then the rest), D6 (race weeks local, plus a new ask: strip the UTC chatter from the leaderboard, relative time only). D1 and D4 need a plainer explanation; sent again.

## 13:40 v588 live, v589 assembled

- v588 verified live at 12:50: version.json, sw.js, APP_BUILD and the changelog all say v588; the bench and the delete confirm are in the served app.js.
- Tom's D1 ("option 3") and D4 ("do them all") logged. Lanes running: l-mealchip, l-eco5, l-eco6, l-eco2. Economy #1, #3, #4 queued behind them.
- v589 train assembled from five lanes (first run, leaderboard phrases, pet growth, recovery acknowledgement + privacy link, podium settlement). Gate running next, diffed against main's 48 known reds.
- The podium fix is Worker code: it does nothing live until Tom runs server/deploy.sh. Noted in docs/SERVER-DEPLOY-PENDING.md.

## 15:10 v589 gated, economy and server fixes in build

- v589 gate: every train-only red so far was an audit whose extracted-source context did not know the two new functions (petGrowth, relativeAgo), one audit pinned to the old "Last online: UTC" copy (re-anchored with Tom's quote), and two new audits missing a positive CONTROL row. All fixed on the train and re-run green alone.
- Economy lanes landed and proven (green on tree, red on main): level rewards (l-eco2, 16 rows red on main), friend battle and spar (l-eco5, 22), wellness completions (l-eco6, 14), Health milestones (l-eco3, 53). Gifts and spire coins were blocked by the server contract (day-keyed dedupe, no takeover id) and are re-running with Worker changes allowed, since Tom deploys server fixes anyway.
- Server lanes running: gift/cheer stable key (also closes server #10), spire takeover receipts, replay identity (#2), flagged friends (#5), local race weeks (F21).
- The meal chip (F16, option 3) is built and proven: a meal older than two hours loses to the clock, red on main.
- v590 will carry all of the above once v589 is live. Every Worker change waits on Tom running server/deploy.sh; docs/SERVER-DEPLOY-PENDING.md lists them.
