# Chat handoff

Two sessions are working this repo. This file is how they avoid each other.
Written 2026-08-20. Main is at **v417**.

## The split

**Reggie (this session) owns the CLIENT UI.** Currently editing, do not touch:
- `js/app.js`
- `app.css`
- `index.html` (the wordmark work touches it)
- `tests/overscroll-wordmark-audit.mjs`, `tests/icon-inventory-audit.mjs`,
  `tests/precache-*`, `tests/talkbox-audit.mjs`

In flight here: the Boneyard icon audit (six items from Tom), the scroll-driven
wordmark, the Emporium header, the Today redesign, the onboarding rewrite.

**Gwart dev owns SERVER + BOOT + INSTRUMENTATION.** Yours, claim them here:
- `server/**` (zero drift: no commit touches `server/` between the branch base
  and main, so the server branches apply clean)
- `js/db.js`
- `js/analytics.js`
- `js/notify.js`
- `js/social.js`
- `tests/tautology-audit.mjs`, `tests/mutation-sweep.mjs`, `tests/dead-weight-*`

Where a task needs a few lines of `js/app.js` (launchfix's boot tail, memaudit's
`startMap` teardown), take them: they are far from the icon sites and the Today
render, so the conflict is additive. Say so in your PR so whoever merges second
knows.

## The queue, highest value first

Everything below was verified ABSENT from main by content, not by ancestry.
Ancestry lies here: this repo squash-merges, so `git merge-base --is-ancestor`
reports shipped work as unmerged, and `git apply --check --reverse` fails on
context drift. Grep main for a symbol the change introduces.

| # | Branch | What it fixes | Applies? | Severity |
|---|---|---|---|---|
| 1 | `gwart/concurrency` | read-modify-write races on every server write path. main's `server/src/index.js` is 1141 lines with 2 `env.DB.batch(`; the branch is 1984 with 5 | CLEAN | money / data integrity |
| 2 | `gwart/srvhard` unique commit `a398727a` only | snapshot bounds as competition bounds, rate limiter decoupled, stops publishing recovery handles, skew fails closed. **Shares patch `9b8fd8d6` with #1, so take the ONE commit, not the branch** | CLEAN | security |
| 3 | `gwart/dbprune` | retention + prune + stats, D1 indexes, dashboard window. **Skip `gwart/dbperf` entirely, all 3 of its patches are contained in this** | CLEAN | data integrity |
| 4 | `gwart/errcopy` + `gwart/writefail` | silent write failures. Three bare `await db.put('log', ...)` sites, and copy-meal is a BATCH that stops halfway telling the player nothing. **Merge them together**, they are two halves of one defect and both touch `js/db.js` | conflicts, see notes | live data loss |
| 5 | `gwart/launchfix` boot half ONLY | blank first screen forever. `js/app.js` ends in a bare `boot();` with no catch, `js/db.js open()` has no `onblocked` and no timeout, and `index.html` reloads once then gives up silently | conflicts, see notes | app unusable |
| 6 | `gwart/a11y` | restores pinch zoom. `index.html` still has `user-scalable=no` while `app.css` already sets `touch-action: manipulation`, so the tag buys nothing | CLEAN, 1 line | accessibility |
| 7 | `gwart/evqueue` | the analytics queue drops the OLDEST row, so a `pit_win` dies ~150 taps later. `js/analytics.js` still does `kvSet('evq', q.slice(-QCAP))` | CLEAN | data integrity |
| 8 | `gwart/rmrace` | reduced motion was ADDING transitions. main's reduce block has no `transition-property: none`, so every property gets a live 1ms transition | 1 trivial | accessibility |
| 9 | `gwart/tautology` | `tautology-audit` + `mutation-sweep`: a static detector for cannot-fail assertions, and a harness that breaks the app to check the guard goes red | 1 trivial | test leverage |
| 10 | `gwart/supportgap` | native players are told to use Settings > Export, which native short-circuits, so the nudge re-fires every 7 days pointing at a dead end | 1 trivial | support / data loss |
| 11 | `gwart/sheetsnap`, `gwart/memaudit` residual, `gwart/hollowscale` | fractional centring transform; `cleanupExtras` never reset so each map Retry leaks a WebGL context (browsers cap near 16); the only guard on the Hollow's apparent scale | mixed | lower |

**Do NOT merge these branches, cherry-pick or rebase forward.** Every one predates
v411 to v417. Three have already tried to revert shipped work: `feat/talk-box`'s
diff shows `AppIcon-512@2x.png` going 217767 -> 295622 bytes, which IS the icon
revert, and `gwart/questpick` read as 15,945 deletions against current main.

**Skip entirely:** `gwart/clientdur` (contained in launchfix), `gwart/dbperf`
(contained in dbprune), `gwart/citefix` (its 104 "corrected" line numbers are all
wrong again, 0 of 13 sampled still valid), `gwart/hud`, `gwart/cratepix`,
`gwart/layout`, `gwart/fxflake` (all superseded or present).

## Assert these five survivors after any cherry-pick

1. `AppIcon-512@2x.png` sha256 prefix `3d9660fa4a3ebc1e`, 1024x1024, RGB, corner (33,33,30)
2. `tests/quest-pick-audit.mjs` present, and `POOL_IDS` in `js/quests.js`
3. `app.css`: `clamp(283px` twice, plus the `.fight-hud` overlay rule once
4. `tests/release-gate.mjs`: exactly ONE `const PURE = [`, 13 entries
5. `js/app.js`: 41 lines carrying `badgePixHtml(`/`pixCur(`, and the wordmark rule once in `app.css`

Number 4 is not hypothetical. Resolving a conflict by concatenating both sides
left two `const PURE` declarations: a SyntaxError that made the release gate run
ZERO suites while silently dropping five audits. It looked green.

## Traps that have cost real time today

- **`boot()` in `tests/godmode.js` defaults to LIVE PRODUCTION.** `serveTree()`
  returns `{url, port, close}`: it is `.url`, NOT `.base`. The wrong key yields
  `undefined` and silently grades the live site. This has burned us four times.
- **Never read an exit code through a pipe.** `grep -c` with 0 matches exits 1 and
  kills the rest of a chained command.
- **Merging is not shipping.** If a changed module is in `sw.js` PRECACHE and
  `VERSION` has not moved, every installed client keeps the old file. PR #65
  merged the quest fix and reached nobody until v413 bumped the stamp.
- **Assert the outcome, not the step.** For iOS run `python3 native/asc.py check`,
  for Android `python3 native/play.py check`, and for an icon inside a native
  build read the bytes OUT of the `.ipa`/`.aab`. Cam's skull sat correct in the
  tree while both stores served the old icon for weeks.
- See `docs/SHIP-LEDGER.md` and `docs/WORK-REGISTER.md`.

---

# Batch 2 for Gwart dev (queued 2026-08-20, after PR #72)

Items 1 and 2 landed as **PR #72** and they were done right: built on current
main, `server/` only, and the tests prove red. 108 tests green here against a
real local Worker with all three migrations. Keep working exactly that way.

## Why this batch avoids `js/app.js` and `app.css`

Seven client agents are churning those two files right now (Boneyard icons, the
scroll-driven wordmark, removing Today's speech, the Emporium, the Today
redesign, onboarding, the Wanderer). Each lands a PR and each bumps the version,
so anything you write against `js/app.js` today will be rebased two or three
times before it merges. So this batch is deliberately **server, `js/db.js`,
`js/analytics.js` and `tests/`**: all yours, none of it contended.

`gwart/launchfix` (the blank first screen), `gwart/errcopy`, `gwart/supportgap`
and `gwart/rmrace` all need `js/app.js` or `app.css`. They are still queued and
still valuable, **hold them until the client work drains** and I will say when.

## The batch, in order

**1. `gwart/dbprune` — server only, clean apply.** Retention, prune and stats,
the D1 indexes, and the dashboard window fix. **Skip `gwart/dbperf` entirely**:
all three of its patch-ids are contained in this branch, so taking both
double-applies. Carries migrations, so say in the PR that D1 needs them applied
at deploy and not just the Worker pushed. That is exactly the half-deploy trap
PR #72 already flagged.

**2. `gwart/writefail`, the `js/db.js` HALF ONLY.** This is the most valuable
thing left in the whole queue and it is real work, not a cherry-pick. The seam
does not exist on main: zero hits for `onWriteFailure`, `writeIsQuiet`,
`QUIET_KV`, `reportWriteFailure` or `tallyWrite`. Every write outside the one
v373 meal-log site is silent when the quota rejects it, and
`js/analytics.js:213`'s `unhandledrejection` only calls `pushErr`, so nothing
ever reaches the player.
**DROP its Boneyard half.** Main already fixed that differently and adequately:
`js/app.js` carries `if (!mapEl) return;` before the unguarded
`appendChild(poiTip)`, and all six map buttons are optional-chained. Its four
`js/app.js` hunks are all that half colliding with main's own fix.
The genuine work: main **rewrote** the whole `export const db = {...}` object
around `bumpStore()` plus `addIfAbsent`/`take`/`kvUpdate`, so the `write()`
wrapper has to be re-derived rather than applied. And you have a design decision
to make and state: do the new atomic primitives (`addIfAbsent`, `take`,
`kvUpdate`) route through the failure seam too? I think they must, since they are
where the money moves, but argue it either way.

**3. `gwart/evqueue` — `js/analytics.js` only, clean apply, one line of real
change.** `js/analytics.js:44` and `:205` both still do
`kvSet('evq', q.slice(-QCAP))`, and a negative slice keeps the TAIL, so the
OLDEST row is dropped: a `pit_win` really does die about 150 taps later. Note the
branch's own warning, and put it in the PR body: merging this makes
`session_ping` evictable, so `playMinutes` and `avgSessionMin` can read LOWER
after this build on any device that crosses the cap. That is a dashboard
discontinuity somebody has to be told about, not a regression.
Second, still-live loss channel the branch documents but does not fix:
`js/analytics.js:81` does `await kvSet('evq', q)` writing back a stale local copy
taken before a network round trip. Fix it in the same PR or say why not.

**4. `gwart/tautology` — `tests/` only, one trivial conflict.** Adds
`tautology-audit.mjs` (a static detector for assertions that cannot fail) and
`mutation-sweep.mjs` (a harness that breaks the app and checks the guard goes
red). Neither exists on main under any name; the nearest thing is
`guard-hygiene-lint.mjs`, which is a static lint and never mutates anything.
**Today is the argument for this branch.** In one day: a wordmark guard was green
across 18 checks while the feature drew zero pixels, because every row proved it
cost no LAYOUT and none proved it could be SEEN. A quest audit pinned its
ceilings to one lucky date and was breached on up to 346 of 365 days. A
release-gate conflict resolution left two `const PURE` declarations, a
SyntaxError that ran ZERO suites and looked green. An audit manufactured its own
precondition by adding the very class it then measured. Every one of those is
what this branch detects mechanically.
Its lead example is already superseded (main fixed `fight-tray-audit`'s escape
clause), so re-point that instance and say so.

## Two new items, not from the bundle

**5. Generate the line-number citations, do not hand-maintain them.**
`gwart/citefix` re-derived 104 citations and **0 of 13 sampled are still correct**
against today's main, and one was actively moved OFF its anchor. Hand-fixing
these is futile at this commit rate. Build the thing that makes it moot: an audit
that reads `file.js:NNN` style citations out of comments and docs and fails when
the cited line no longer contains what the citation claims, or a generator that
rewrites them from a symbol anchor. Design it yourself; `tests/` only, zero
collision. **Close `gwart/citefix` when this lands.**

**6. Write `docs/INGEST.md` for the art pipeline.** Found while building the
illustrator handoff deck, and it is a genuine hole. `scripts/build-cosmetics.py`
resizes from ONE library path, Cam's original library is 1000x1000 while the
newer `~/Downloads/SOL ASSETS/` library is 2048x2048, and the out-of-repo process
that scaled and placed those 2048 items onto the figure **no longer exists
anywhere findable**. Thumbnails also need `scripts/build-bh-thumbs.py` run.
So right now nobody can ingest a new art batch from written instructions. Read
the scripts, reconstruct the real steps, write them down, and say plainly what
you could not reconstruct. Docs only.

## Reminders that have cost real time today

- `boot()` in `tests/godmode.js` defaults to LIVE PRODUCTION, and `serveTree()`
  returns `{url, port, close}`: `.url`, NOT `.base`. Four incidents today.
- Never read an exit code through a pipe.
- Merging is not shipping: a module in `sw.js` PRECACHE with an unmoved `VERSION`
  reaches nobody.
- Assert the five survivors after every pick. Especially exactly ONE
  `const PURE = [` in `tests/release-gate.mjs`.
