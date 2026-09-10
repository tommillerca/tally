# HANDOFF: Boneheadz Gym — code session

_Last updated: 2026-09-10 (v559 local and live, in sync). Written for a future Claude with zero memory of the session. Favor the specifics below; where something is uncertain it's in **§8 Open Questions**, not guessed._

> This is the **general engineering** handoff: start here for any Boneheadz code work.
> `docs/HANDOFF.md` in this same folder is scoped to the **design-elevation initiative** and is stale (last touched 2026-08-08 at v285). Read it only if the task is design elevation.

---

## 1. Project overview

**Boneheadz Gym** — a step-tracking fitness game. Log real steps, feed them into a skeleton crew you train, gear up, and fight.

**Stack.** Vanilla-JS ES-module PWA. No framework, no bundler. IndexedDB for local state, a service worker for offline, Capacitor wrapping for iOS and Android, Cloudflare Worker + D1 for the backend.

**The name is split and it stays that way.** The app is **Boneheadz Gym** (`<title>` in `index.html`). The repo, the folder and `package.json` all still say **tally**, from when it was a calorie tracker. The live URL is `https://tommillerca.github.io/tally`. Renaming the GitHub repo would change that URL and break the installed PWA for existing players, so it has not been done and should not be.

| Thing | Value |
|---|---|
| Source | `/Users/tommiller/Documents/Hyperframes Editor/tally` |
| Session home | `/Users/tommiller/Documents/Hyperframes Editor/boneheadz` (launch `claude` here) |
| Remote | `https://github.com/tommillerca/tally.git` |
| Live PWA | `https://tommillerca.github.io/tally` |
| Backend | Cloudflare Worker + D1, database `bonez` |
| Branch | `main` |

---

## 2. Current status

- **`main` is clean and in sync.** Local `main` = `origin/main` = `4605c9b6`, live `sw.js` and `version.json` both serve `tally-v559`. Confirmed 2026-09-10.
- **Still `git pull` before you start.** Releases land several times a day; never grade a change against a stale checkout.

Recent releases, newest first:

```
4605c9b6  v559: the Studio, softer and deeper (#477)
714a72a0  v558: the step race shows progress again (#476)
ef71dc37  v557: the Studio opens properly (#475)
79eadc5e  v556: the Studio builds like a story (#474)
87d747b8  v555: patch notes are back, and the popup with them (#473)
```

### Open work

`ROADMAP.md` (repo root) is the canonical tracker. Current counts: **0 BUG, 1 PARTIAL, 7 DECISION**.

| Item | Status |
|---|---|
| Step race: no progress bars, no rank line | **FIXED in v558**, live. `hydrateRace`'s `comparisonsFresh` was an all-or-nothing `every(fresh)` gate over the whole board; freshness now keys per lane. Replaying the real production board through the real code took bars drawn from 0/11 to 7/11. Guard proven RED on v557. |
| **The Studio** (in-app story composer, Wardrobe → The Studio) | **ACTIVE**, 4 rounds shipped (v553, v556, v557, v559). Tom is judging edges and the depth control. Codex builds it; see §9. |
| Chest and egg art Tom authored 2026-08-16 | **LOGGED**, not wired in |
| The Paddock (pet playland on the Stable) | **BUILDING**, assigned 2026-08-10 |
| The Hollow (garden + apothecary scene) | **DECISION** awaiting Tom, designed 2026-08-09 |
| Themed Pit bosses from existing art | design notes only, investigated 2026-08-09 |
| The Bone Bazaar (player gear stalls) | **PARKED** 2026-08-08, Tom: "park it and we can circle back later" |
| Drop calendar: 10 featured pieces after the Puffer Pack | **DECISION**, planned 2026-08-02 |

`docs/DECISIONS-OPEN.md` splits pending items into: (A) decisions only Tom can make, (B) built but needs Tom's eyes, (C) not built, queue in order, (D) two checks only a phone can answer, (E) answered and recorded so they are not reopened. Read section E before proposing anything, so you don't reopen a settled call.

---

## 3. Directory map

| Path | What |
|---|---|
| `js/` | App source, ES modules. `js/app.js` is the main file. |
| `tests/` | **445 test files.** Includes `release-gate.mjs` (1699 lines). |
| `server/` | Cloudflare Worker, D1 migrations, `deploy.sh`. |
| `assets/`, `icons/` | Art. Cam's illustrations plus generated variants. |
| `data/` | Game data tables. |
| `native/` | Capacitor iOS/Android. `native/play.py` is the only sanctioned Play publish path. |
| `docs/` | This file, `ROADMAP.md`'s companions, `BACKLOG.md` (168KB), `CLAIMS.md` (565KB), `BRANCH-GRAVEYARD.md` (288KB). |
| `scripts/`, `tools/` | Art generation and analysis helpers, mostly Python. |
| `gwart/` | Gwart the guide/shopkeeper assets and agents. |

---

## 4. Commands

Run from `/Users/tommiller/Documents/Hyperframes Editor/tally`.

```bash
npm test          # node tests/unit.test.js && node tests/pit.test.js
npm run gate      # node tests/release-gate.mjs      <- the release gate
npm run gate:all  # full gate
npm run balance   # node tests/balance-audit.js
```

**Balance questions get measured, never reasoned from code.** Use `tests/fight-sim.mjs`. Do not argue about numbers from reading the source.

**Deploying the Worker:** use `server/deploy.sh`, not a bare `wrangler deploy`. The script exists because on 2026-08-14 two separate "it's deployed" claims were false: once because the checkout was three releases behind and it published v373's server file with exit code 0, once because nobody asked the live Worker whether the route existed afterwards (`/steps/settled` answered 404 while every local test was green). The script refuses a stale tree and interrogates the live Worker for every route it claims to serve.

**Querying live game data:**

```bash
wrangler d1 execute bonez --remote --json --command "SELECT ..."
```

---

## 5. Release ritual

**`main` is PR-only. A direct push is rejected (GH013).**

1. Branch, commit, push the branch.
2. `gh pr create`
3. Squash merge.
4. **Verify the live `sw.js` actually serves the new version.** `git push` succeeding is not a release. Derive truth from the deployed site, never from local state.

---

## 6. Non-negotiable contracts (do not reopen, all in `CLAUDE.md` at the repo root)

`tally/CLAUDE.md` is 20KB and loads automatically when you touch files under `tally/`. Read it. The sections:

1. **Animation FX verification** — fire the *real control* and assert *decoded pixels* during the animation. Calling the FX function directly proves nothing. Added after v245 shipped an invisible punch that passed a position-only check. Test on a cold cache: 100KB+ PNGs lose the race against a ~350ms animation on first play.
2. **Anti-regression rules** — 10 of them, added 2026-07-28 after 4 regressions in one day.
3. **The figure contract** — added 2026-08-07.
4. **Rewarded actions SOP** — added 2026-08-07.
5. **Transitions and in-between moments** — added 2026-08-08.
6. **Screens arrive whole** — added 2026-08-08.
7. **Naming cosmetics** — name an item from how it looks *on the bonehead at 300px+*, never from the loose asset file.
8. **Simulator: never read a result off a build you did not confirm.**

Also standing, from the workspace root `CLAUDE.md`: think before coding, simplicity first, surgical changes, trace the data path before theorising, assert the end of the chain.

---

## 7. Gotchas

1. **"My change isn't showing" means the service worker cache**, not curl. Verify on the live site, not localhost; localhost demo serves stale modules. On-device staleness needs a full quit and reopen.
2. **`refresh()` preserves scroll position, `route()` goes to the top.** Never `scrollTop = 0` a re-render.
3. **A differently-signed native install wipes the WKWebView container**, taking device-local progress with it.
4. **Never animate `transform` on a MapLibre marker root.** Put it on an inner child.
5. **319 git worktrees are registered** against this repo, most in `/private/tmp` session scratchpads. Uncommitted work in those is invisible to every branch search. Do not assume a scratch worktree is disposable.
6. **`serveTree` can grade the wrong worktree** if a stranded server already holds the port. Curl a symbol only your tree has before trusting a result.
7. **A bare audit run grades production**, because `boot()` defaults to the live site. Pass the local URL explicitly or your prove-reds prove nothing.
8. **TestFlight:** Tom installs via the public link, so a build needs that group *and* beta-review approval before he can get it.

---

## 8. Open questions & blockers

**Q1. ANSWERED.** The step race is fixed, in v558, live. `ROADMAP.md` has been corrected. The measurement is recorded there: bars drawn 0/11 to 7/11 on the real production board, guard proven RED against v557.

**Q2. ANSWERED.** Local was simply behind. Pulled; local and live are both v559.

**Q3. Seven DECISION items are waiting on Tom**, listed in §2 and detailed in `ROADMAP.md` and `docs/DECISIONS-OPEN.md` section A. None are blocked on engineering.

**Q4. Process rule:** app notes from Tom go into `ROADMAP.md` first with an investigation finding and a status, and then wait for his approval before anything is built. Investigate, log, plan, wait. Do not skip to building.

---

## 9. The Studio (the live thread)

An in-app story composer reached from the Wardrobe fit rail ("The Studio", camera icon).
The player poses their bonehead and pet, adds stickers, and screenshots to share. It is
built to feel like composing an Instagram story.

**Codex builds it, Claude reviews.** Four rounds have shipped: v553 (first entry), v556,
v557 (unbrick), v559 (softer art, one flat tray, send forward/back).

Facts that keep biting:

- `STUDIO_SAFE = {left:65, top:270, right:1015, bottom:1540}`. The top 270px and bottom
  380px are a **deliberate** Stories/IG UI reserve, not empty space. Do not "fix" them.
- **v556 shipped a bricked Studio with every audit green.** Two causes: the tray toggle sat
  below the fold under the tab bar (the only door to stickers), and `.studio-preview` had a
  blanket `touch-action: none` over most of the viewport. Screens get rendered and touched,
  not just asserted.
- **The character art is smooth illustration, not pixel art.** Measured: `wanderer.png` has
  2,625 opaque colours and 3.9% anti-aliased edge pixels. A "pixel-preserving" resample is
  the wrong filter and reads as over-sharpened; v559 widened the silhouette transition
  1.33px to 1.67px. `assets/icons-pix/` **is** genuine pixel art and is deliberately excluded.
- Cam's art is never redrawn, recoloured, rescaled or hue-rotated **on disk**. At render
  time, composition (move, uniform scale, mirror, rotate, smooth resample) is fine;
  non-uniform stretch, tint, recolour and filter are not.

Open for Tom: whether rotation should snap to quarter-turns (measured 3.99% worst-case
colour loss), and whether the accessible button row still reads as clutter. Native save to
iOS Photos / Android picker is **unproven** and needs an attended native build.

## 10. Outstanding: the browser-audit census

Playtest slate run 12-A graded all 121 browser audits on the current build:
**GREEN 76, RED 40, UNPROVEN 5** (exit 97 is `UNPROVEN_EXIT` in `godmode.js`, a deliberate
third state, not a failure).

Of the 40 reds: 10 need an argument the runner did not pass, 28 report real FAIL rows,
2 crashed. **Producing the cause for each of those 28 is the open deliverable.** One real
defect is already named: `gate-audit` — `js/app.js:27012` takes `claimSpire()` into `r` and
never reads `r.ok`.

**Codex cannot bind sockets** (`listen EPERM 127.0.0.1`). Every browser audit and every
screenshot is Claude's to run. That is the critical path on anything visual.
