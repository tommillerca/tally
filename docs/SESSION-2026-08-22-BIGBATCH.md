# Work register: big-batch fan-out, 2026-08-22

Approved by Tom: WS1 (bug batch), WS9 (bot census, read-only until he eyeballs
the purge list), WS3 Option B with mockups-before-wiring. Fan-out authorized.
Plan: docs/PLAN-2026-08-22-v425.md. Feedback: docs/FEEDBACK-2026-08-22-v424.md.

## Delegated (7 agents, launched ~same time, all off origin/main f18d479f; ALL 7 died on the usage limit mid-flight, resumed with context intact after the reset)

| Branch | Scope | Status |
|---|---|---|
| x425/fits | 1a saved fit forgets gear after Take-it-all-off | DONE, pushed b9c04f57 |
| x425/wheel | 1b upside-down wheel labels | RUNNING |
| x425/appcore | 1c day-strip black hole, 1i breakfast nudge + quest order, 1f crate nag, 1h double-tap tabs | RUNNING |
| x425/css | 1d crew card crop, 1e banner icon centering, 1j dynamic-island background | RUNNING |
| x425/wanderer | 1g water oracle, RECON-GATED (may return a no-go doc instead of code) | RUNNING |
| x425/bots | WS9 census done, pushed 7abfec02; 47 certain + 19 maybe; purge list awaits Tom | DONE |
| x425/mockup-today-b | WS3 Option B mockup variants, screenshots only, merges only on approval | RUNNING |

A dead agent means its item is OUTSTANDING, not done. Aggregation: merge green
x425/* into rel425, full gate --all, PR, Tom merges. Mockup branch and bot purge
are explicitly NOT part of rel425 until their approvals land.

## Not in flight (needs Tom first)

- WS2 perf (SW rework) - next after v425
- WS4 kitchen mockups, WS5 Gwart Guide, WS6 cheers, WS7 paddocks, WS8 potion doc
- Emporium glow: Tom's separate session owns gwart/wizard-cast.css + .wz-glow

## Feedback wave 2 (mid-fan-out, 2026-08-22, verbatim)

- "i just fought the wanderer and he is WAY too big in the pit and overlapping
  with my bonehead. also it seemed like the scale of bumbleseal wihle fighitng
  was too big. also bumble seal shouldnt have a glow in the pit like that. also
  after defeating the wanderer he was still just there in the boneyard and didnt
  disappear"
- "also we need to mirror bumbleseal in the fights so she faces the enemy"
- "im guessing what happened was you were afraid to cut off the tail of the
  wanderer in the pit, you can that's ok" (= explicit approval to crop the
  wanderer's tail to size him correctly in the Pit)

Delegated to x425/pit (wsH-pit worktree). RUNNING.

## Open question for Tom (schema gap)

Production D1 lacks the 2026-08-16 hardening schema while the deployed worker
references it; syncs still land, so the failure chain is unproven. Tom declined
the live-API probe. Waiting on his call: tail logs, apply the migration, or
leave it. Nothing applied.

## Second outage, 2026-08-22 (usage limit, ~6:20pm reset)

Four agents were CANCELLED, not merely paused: appcore, css, wanderer, wheel.
Their work was uncommitted in scratch worktrees, i.e. invisible to every branch
search. Snapshotted and pushed as WIP commits before anything else:

| Branch | State | Note |
|---|---|---|
| x425/fits | DONE b9c04f57 | verified, gate green bar pre-existing notif-audit |
| x425/bots | DONE 7abfec02 | census only, purge list awaits Tom |
| x425/mockup-today-b | DONE 3059a895 | 3 variants, shots sent to Tom, awaiting pick |
| x425/wheel | committed 82488294, pushed | agent cancelled before its gate result was read |
| x425/appcore | WIP 67898dc6 | UNVERIFIED: 4 items coded, 3 new audits, no prove-red/gate |
| x425/css | WIP f9bf7181 | UNVERIFIED: 98 lines app.css, no prove-red/gate |
| x425/wanderer | WIP 745fc47e | UNVERIFIED: js/water.js exists, so the recon gate evidently PASSED, but its verdict was never reported. Do not trust until re-verified. |
| x425/pit | DONE 7dffbbfa | all 5 items, measured in painted pixels, 4 prove-reds, gate 80/81 (pre-existing notif red). Verified visually by me against before/after. |

NONE of the WIP branches may merge without redoing prove-red + gate.

## Release-time step nobody owns yet

The pit agent flagged it and it is real: no branch renumbers APP_BUILD, sw.js
VERSION or changelog.js, because three branches touching it would collide.
Whoever cuts v425 does it ONCE after the merges. If this is forgotten the
service worker serves stale modules and "my change isn't showing" comes back.

## Main moved, 2026-08-23: f18d479f -> d8819940

A peer session's Emporium idle fix (PR #85) merged. I re-ran `git merge-tree`
for all eight x425 branches against the new main myself rather than trusting the
pre-merge test: ALL CLEAN, including x425/pit's app.css hunk that sits directly
under that session's `.wz-glow` block.

### The v425 cut now delivers three parties' work

The single `APP_BUILD` / `sw.js VERSION` / `changelog.js` bump is the ONLY thing
that puts any of this in front of players. It must carry:
  1. everything merged from the x425 pile,
  2. `x425/wanderer`'s `'./js/water.js'` PRECACHE line, if that branch lands,
  3. `d8819940`, the Emporium fix already on main and NOT yet live.

Merged is not shipped. Until that bump, the service worker serves the old
modules and every one of these fixes reaches nobody.

## Today rework: approved and being wired, 2026-08-23

Tom picked variant **d2** ("the container") from x425/mockup-today-v2. His words:
"i guess D2 is fine for now" — approved, NOT enthusiastic. Ship it faithfully,
do not gold-plate, and expect he may want another pass on this screen later.

**x425/appcore is being SPLIT rather than finished as one branch.** It was
unverified WIP (its agent was killed by the outage) and it rewrites renderToday,
which would collide head-on with wiring d2. The split:
  - Today items (breakfast nudge removal, quests under chips, past-day fix) fold
    into `x425/today-d2`. d2 SUPERSEDES the past-day fix: a day-anchored screen
    where a past day stays whole IS that fix, so shipping both would be two
    answers to one question.
  - The two unrelated items (Gwart crate nag, double-tap tabs) go to
    `x425/nag-doubletap`.
Both agents were told to read x425/appcore, salvage what is good, and trust none
of it unverified. When both land, **x425/appcore is superseded and should be
CLOSED, not merged.**

Both new branches are based on the NEW main d8819940, not f18d479f.

NOTE: `main` is protected (PR required). This register lives on
`docs/feedback-plan-2026-08-22`; do not try to push docs straight to main.
