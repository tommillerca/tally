# Working on Boneheadz Gym (Tally)

Read this before your first commit. It is short on purpose; the depth is in the
files it points at.

**Live app:** https://tommillerca.github.io/tally/
**Repo:** https://github.com/tommillerca/tally
**Owner:** Tom Miller. He plays the live build daily and reports bugs from it.

This is a real product with real players and real save data. Two of the rules
below exist because someone lost a player's progress, and one exists because a
push took the whole app down for fourteen minutes.

---

## 1. Setup

```bash
git clone https://github.com/tommillerca/tally.git
cd tally
npm install
```

Node 22 or newer. `npm install` pulls Puppeteer (a headless Chrome, ~150MB) which
every browser check needs.

Verify your setup before writing anything:

```bash
npm test        # 175 unit tests + the pit sim. Pure Node, seconds.
npm run gate    # the real gate: serves the repo and drives a browser. ~7 min.
```

If `npm run gate` says **"puppeteer not found ... This is a SETUP failure"**, your
install did not finish. That message is deliberate: a missing browser must never
look like a failing app.

---

## 2. The two rules that are absolute

**1. Nothing reaches `main` without `npm run gate` passing.** No exceptions, not
even a two-line fix. A comment containing backticks inside a template literal once
killed `js/app.js` at parse and took the live app down for 14 minutes, because
`main` IS the deploy branch. Source-scan tests passed it. The gate would have
caught it in seconds.

**2. Read the exit code, not the output.** `npm run gate | tail` reports the exit
status of `tail`, not the gate. That has bitten this project twice in one day.

```bash
npm run gate; echo "exit=$?"     # exit=0 means green. Anything else is not.
```

---

## 3. House contract: read `CLAUDE.md` first

`tally/CLAUDE.md` is the accumulated list of mistakes not to repeat, each with the
bug that caused it. The non-negotiables, in one line each:

- **A check that cannot fail is not a check.** Before you trust a passing test,
  say what a failing one would print. Then reintroduce the bug and watch your
  guard go red. Half the checks in this repo's history "passed" while asserting
  nothing.
- **An empty sample set is a failure, never a pass.** Zero elements examined means
  the check did not run.
- **Verify by operating controls, not by rendering screens.** Click the thing and
  assert where it lands. "The screen renders" would have missed most of the bugs
  we have shipped.
- **Animations are verified with decoded pixels, never geometry.** A CSS box
  measures perfectly over a blank frame. That shipped an invisible punch once.
- **Anything that pays coins, dust, XP, gear or a card follows the rewarded-actions
  SOP.** Name the state transition, ask the authority before paying, treat a
  no-op answer as a no-op, and prove the second attempt pays nothing.
- **Storage is additive-only.** IndexedDB upgrades add, never rewrite. An account
  has been wiped twice. If your change can delete or overwrite player data, it
  needs Tom's explicit sign-off before it is written, not after.

---

## 4. Scope: what to touch and what to leave alone

**Off limits right now.** Three branches are in flight here and a partial landing
breaks pet feeding for players:

- `js/paddock.js`, `js/paddock-cards.js` (the Paddock)
- pet bonding, `bondUp` and anything calling it
- the pet card slider

**Fair game:** the Pit and combat, the Boneyard map, the Kitchen, the Wardrobe,
Trends, Crew, the Shop and Salvage Bench, onboarding, settings.

If you are unsure, ask Tom before starting rather than after. Merge conflicts in
this repo are cheap; two people redesigning the same screen is not.

---

## 5. Branches, versions and shipping

Work on a branch named `<yourname>/<topic>`, off `main`:

```bash
git checkout -b yourname/fix-the-thing
```

**Do not push to `main` yourself.** Push your branch and tell Tom; merges and
version numbers are handled centrally so the version ritual stays consistent.

**If your change touches anything the app serves** (`js/`, `app.css`,
`index.html`, assets), the version bump is three files changed together:

- `sw.js` -> `const VERSION = 'tally-vNNN'`
- `js/app.js` -> `const APP_BUILD = 'vNNN'`
- `js/changelog.js` -> a new entry at the top

Leave those to whoever merges unless you are told otherwise, but know the rule
exists so you do not half-apply it.

**Test-only changes get no version bump.** Bumping ships players an identical app
and fires the "what's new" dot with nothing behind it.

---

## 6. Changelog voice

Entries are written for a player, not a developer. Say what changed for them and,
when something was broken, say so plainly.

- Good: "Beat a boss and The Pit now notices. Your win was always recorded; the
  screen behind the fight never re-read it."
- Bad: "Fixed `.pit-sect` selector in the onClose re-render guard."

Never claim a fix you have not verified end to end. A wrong test goes red and gets
triaged; a wrong changelog line is simply believed.

---

## 7. Traps that will cost you an afternoon

1. **Verify on the live URL, not localhost.** Localhost can serve stale modules.
   After a deploy, check what the live site actually serves:
   `curl -s "https://tommillerca.github.io/tally/sw.js?cb=$RANDOM" | grep -o 'tally-v[0-9]*'`
2. **"My change isn't showing" usually means the service worker.** Check what the
   SW serves, not what your editor holds.
3. **A screen is a re-render, not a mutation.** Screens rebuild `innerHTML`
   wholesale, so there is no previous value for CSS to transition from. See the
   transitions section of `CLAUDE.md`.
4. **Headless Chrome freezes the main-thread animation clock.** Both
   `getBoundingClientRect` and computed transforms read as frozen while pixels
   visibly move. Screenshots are the only honest read of motion there.
5. **Pets are instances, not species.** Shiny, level and lineage live on the copy.
   Reading them off an outfit is always wrong. See the figure contract.

---

## 8. Where the state lives

- `README.md` what the app does, feature by feature
- `ARCHITECTURE.md` the layers, and which file is allowed to know what
- `CLAUDE.md` the contracts above, with the bug behind each one
- `ROADMAP.md` what is planned and what was decided against
- `docs/HANDOFF.md` deep session history, useful when archaeology is needed

Tests live in `tests/`. Every `*-audit.mjs` must be declared in
`tests/release-gate.mjs` in a tier (`fast` or `full`) or the gate fails by name.
An audit that exists but never runs is worse than no audit, because it reads as
coverage.

---

## 9. Asking

Tom is the product owner and the only player whose report you will get directly.
When he reports something, **reproduce it before theorising**. The most expensive
day in this project's history was three sessions proposing causes for a bug that
turned out to be one dead CSS selector, and a repair that shipped for a condition
no device actually had.

Proving a mechanism exists is not proving it caused the symptom.
