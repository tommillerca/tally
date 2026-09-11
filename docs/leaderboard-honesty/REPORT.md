2026-09-11 decision reversal: Tom knowingly reversed the player freshness disclosure policy below because profile contacts cannot establish presence and the notices on people were unwanted. v571 chooses no presence dots or words. Only leaderboard Last online timestamps remain. Internal stale comparison safeguards and own-device Health, step troubleshooting and save failure copy remain. The following report records the historical decision.

Advisory implementation report for independent review, 2026-09-09.

The frozen plan SHA256 matched `65666361cd7527ce3ede172cf4ad95a4972284d6989188edf03004b6ef8c2a65`. All edits resolve inside this checkout. Starting HEAD: `5f880815f185d6557bd4ea6e0499e58f39d995c5`. The original `js/app.js` SHA256 was `eb8b5c9199224784016421c38e9f2f3ebb9f46d77056fb2bcae2efc7a4fc64e6`.

The client now describes server contacts and saved snapshots. It does not infer whether someone is playing. The sync outage itself remains unresolved and outside this lane.

The chosen age policy is:

| Timestamp | Display |
| --- | --- |
| Under 6 minutes | `Synced recently` |
| 6 minutes to under 1 hour | `Synced Nm ago`, using whole elapsed minutes |
| 1 hour to under 24 hours | `Synced Nh ago`, using whole elapsed hours |
| 24 hours or older, including one week | `Awaiting a recent sync`, with no day count |
| Missing, invalid, zero, negative or future | `Sync time unavailable` |

The shared notice reads `Showing last shared snapshots. Details may have changed.` If no available row has a valid timestamp under 24 hours, it reads `Showing last shared snapshots. No recent updates have reached this view. Syncing may be delayed.` It is used on the Crew fan, leaderboard and podium, and step race. A recent server timestamp on the viewer's own row counts as recent evidence; a locally synthesized race row does not.

Surface inventory and copy decisions:

| Surface | Before | After |
| --- | --- | --- |
| Full leaderboard rows | `online`, `yesterday`, `7d ago`; snapshot details presented without qualification | Shared-snapshot notice, ranking by last shared level, and the age-policy labels above. All rows and recorded values remain. |
| Crew podium and viewer placement | `Lv N`, `#N`, current-sounding rung comparison | Shared-snapshot notice, `Last shared Lv N`, `Recorded #N`. Recorded rankings remain visible. |
| Fan cards, outfits, levels and spires | `Online now` dot tooltip; unqualified details; `Just took a spire` or `Holds N spires now` | Dot means `Synced recently`; each card carries the sync label; fan has a shared-snapshot notice. Stale cards suppress change callouts. Spire changes say `Shared a spire update` or `Shared an update: N spires`. |
| Selected friend action strip and starred friend fan | `online` or an unqualified elapsed age | Sync-age wording, under the fan's shared-snapshot notice. Starred ordering, portraits, profile, cheer and gift controls remain. |
| Fan filter and its empty state | `Online`; `Nobody in your Crew is online right now. Tap Online again to see everyone.` | `Recent syncs`; accessible label `Show only friends with a recent sync`; `No recent syncs in this selection. Tap Recent syncs again to see everyone.` The existing under-six-minute filter criterion is retained. |
| Incoming request rows | `Lv N` or `New Bonehead` | `Last shared Lv N` or `Profile not shared yet`. These rows have no sync timestamp. |
| Outgoing request rows | `Waiting for them to add you back` | Unchanged. This describes request status, not presence. No fabricated sync age. |
| Newcomer suggestions | Level, badges, `online now` fallback when timestamp absent, elapsed age otherwise | `Last shared level N` and sync-age label. Missing time no longer becomes online. Eligibility and ordering remain based on recorded progress/contact. |
| Friend and stranger profile sheets, including race entry | No snapshot-age disclosure; `Their stats will show once they next open the app.` | `Last shared profile · [sync label]. Details may have changed.` Missing stats say `No stats have reached this profile yet.` Race profile navigation now carries `seenAt` into `lastSeen`. |
| Friend paddock | Unqualified pet total and `N out in the field right now` | Same shared-profile disclosure and `N shown from their shared paddock`. Stored pet total and scene remain. |
| Step race summary and rows | `last seen 7d ago`, precise lead/gap and walking estimate from old totals; `Nobody has walked a step yet` for empty data | Sync labels and `recorded steps`; shared-snapshot notice; `Standings await recent updates.` if any supplied row is stale or unknown. Such boards suppress gap numbers, walking estimates and proportional tracks. Rows, recorded totals and recorded ranks stay visible. Fresh comparisons are qualified as last shared. Empty data says `No steps have reached this board yet.` Only a synthesized local lane says `On this phone`. |
| Boneyard top race strip | Precise `N behind [name]` or `1st ... hold it`, regardless of age | `Last shared: ...` for fresh data; `Step race updates may be delayed.` for stale or unknown data. No stale gap or standing number. |
| Cheer and gift inbox message times | Separate send/arrival meaning, but formatting depended on the presence helper | Separate event-time calculation preserves `9m ago`, `arrived 9m ago`, `yesterday`, and older event ages. These are recorded events, not player-presence claims. Existing unit controls pass. |

Additional inspected uses were left unchanged: server writes/retention, changelog read markers, the Hollow's local read marker, Crew delivery read markers, settled race receipts and their result lanes, and the badge for an observed improvement in a server-recorded race rank. None renders a person's absence from a profile timestamp. Settled race results describe a recorded settlement, not a live standing.

Proof:

```text
node tests/unit.test.js
377 passed, 0 failed
exit 0

node tests/leaderboard-honesty-audit.mjs
LEADERBOARD HONESTY: 49 passed, 0 failed
exit 0

node docs/leaderboard-honesty/run-pure.mjs
133/133 PURE files exit 0
exit 0

node tests/leaderboard-honesty-audit.mjs --source=/private/tmp/leaderboard-honesty-before.js
LEADERBOARD HONESTY: 2 passed, 47 failed
exit 1 (expected baseline failure)
```

The audit executes production rendering functions and source blocks with a fixed clock, service adapters and Node DOM doubles. It drives fresh, day-old, week-old and all-available-rows-stale scenarios across the inventory, including the actual recent-sync filter, race profile click callback, paddock renderer, and map race block. The paddock's dynamic import is supplied through its real module; its scene pixels are stubbed. Other artwork is stubbed. Missing clocks, a missing timestamp on a server-supplied own row, empty races, and pending rows without timestamps have controls. No browser, real network or pixels are claimed.

[Baseline output](red.txt) records week-old and fleet-stale leaderboard/race failures on the original confident `7d ago` and `last seen 7d ago` strings. The map rows fail on the old precise gap. The original source can be reproduced with `git show 5f880815f185d6557bd4ea6e0499e58f39d995c5:js/app.js` written to a temporary file, then passed to `--source=`.

[Audit output](audit.txt), [unit output](unit-output.txt), [all PURE exits](pure-output.txt), and [per-suite exit records](pure-results.json) are retained here. The PURE driver extracts the registered PURE list plus push/unshift additions, respects the serial suite list, and runs the complete tier without starting the release gate's socket server. Its output names the temporary directory containing each full suite stream. Syntax checking and `git diff --check` also passed.

The [first PURE run](pure-first-output.txt) was 131/133. The new audit initially used the browser fixture hook and tripped the guard-hygiene rule. It now supplies the normal service response with `webdriver: false`. The numbers-honesty audit depended on the removed `Online/last-seen` comment; its source boundary now uses the unchanged function declaration. No assertions were weakened. The two existing profile audits load the real new helper dependencies. The first targeted unit run also caught the shared inbox formatter and unavailable pending timestamp; both implementation errors were corrected before final proof.

Files changed:

| File | Purpose |
| --- | --- |
| `js/app.js` | Honest sync labels, snapshot notices, stale comparison suppression, event-time separation and profile timestamp propagation |
| `app.css` | Allow race freshness copy to wrap and avoid expanded letter spacing on the fan's snapshot label |
| `tests/leaderboard-honesty-audit.mjs` | New production-source scenario audit and baseline-source option |
| `tests/release-gate.mjs` | Register the new audit in PURE |
| `tests/crew-outfit-audit.mjs` | Load actual profile helper dependencies |
| `tests/crew-yard-row-audit.mjs` | Load actual profile helper dependencies |
| `tests/numbers-honesty-audit.mjs` | Replace obsolete comment boundary with function boundary |
| `docs/leaderboard-honesty/REPORT.md` | This advisory report |
| `docs/leaderboard-honesty/run-pure.mjs` | Reproducible socket-free complete PURE runner |
| `docs/leaderboard-honesty/audit.txt` | Final targeted proof output |
| `docs/leaderboard-honesty/red.txt` | Original-source failure output |
| `docs/leaderboard-honesty/unit-output.txt` | Agreed command output |
| `docs/leaderboard-honesty/pure-first-output.txt` | First complete run and failures |
| `docs/leaderboard-honesty/pure-output.txt` | Final complete run |
| `docs/leaderboard-honesty/pure-results.json` | Final per-suite exit codes |

Local dependency setup: this checkout lacked `esprima`. The existing local `../lab-final2/node_modules/esprima` version 4.0.1 was copied read-only into this checkout's ignored `node_modules/esprima`, matching the lockfile. No dependency manifest or lockfile changed, and no network installation occurred. No sibling checkout was edited.

Limits, blocked actions and deviations:

- No action was denied by approval review. No commit, push, PR, publish, deployment, remote Wrangler command, production D1 write or secret change was attempted. `native/ASC-SUBMISSION.md` and server code are untouched.
- Browser proof is blocked by the work order's socket restriction. Independent review owes real browser/device rendering and taps for the expanded fan plate and filter chip, the podium notice, leaderboard scrolling/profile navigation, race wrapping and stale rows without tracks, profile/paddock notices and Boneyard strip. Review at narrow phone widths and large text sizes, especially pet/art overlap and total/name readability. No rendered-layout result is asserted here.
- The API does not provide a fleet-wide freshness aggregate. The leaderboard and race are capped lists, and Crew is a subset. The implemented bounded alternative is the explicitly view-scoped notice above. This limitation was reported during implementation; no fleet outage is claimed or diagnosed.
- Request payloads intentionally omit sync timestamps. Their bounded alternative is last-shared profile copy and unchanged pending status, rather than an invented age. This limitation was reported during implementation; no server payload or timestamp meaning changed.
- The plan left a sensible age cutoff to implementation. This lane chooses 24 hours and retains stored values as historical snapshots. It removes derived stale precision rather than concealing the leaderboard or substituting fallback numbers.
