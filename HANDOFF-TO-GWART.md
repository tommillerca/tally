# Handoff: Gwart dev takes the app

Written 2026-08-20. Live is **v420**. Read `CHAT-HANDOFF.md`,
`docs/SHIP-LEDGER.md` and `docs/WORK-REGISTER.md` next, in that order.

You now own the whole app, client and server, not just the server lane the
earlier handoff carved out. That earlier split is dead: ignore the "Reggie owns
the client UI" section in `CHAT-HANDOFF.md` and treat every file as yours.

## 1. Where things are

| what | path |
|---|---|
| the app | `/Users/tommiller/Documents/Hyperframes Editor/tally` |
| the live site | `https://tommillerca.github.io/tally/` (GitHub Pages serves `main` directly) |
| native shells | `tally/native/` (Capacitor; both load the LIVE URL, they do not bundle the web app) |
| server | `tally/server/` (Cloudflare Worker + D1) |
| art references | `tally-refs/` — `wizard/` (Gwart + his `animation/`), `mimic/`, `the-raising/`, `onboarding/`, `cam-handoff/`, `pixellab/` |
| Cam's raw handoffs | `~/Downloads/design_handoff_*` (wizard, wanderer, glutton_boss, the_hollow, the_paddock, today_home) |
| the big art libraries | `~/Downloads/SOL ASSETS/`, `~/Downloads/BONEHEADZ SOL LIBRARY`, `~/Documents/TALLY APP /BONEHEADZ NFT LIBRARY` |
| previews Tom can open | `tally/../onboarding-preview/`, `tally/../emporium-preview/` |

**The preview trap:** the Claude Code preview pane renders files OUTSIDE the
project folder as STATIC SNAPSHOTS, which paint HTML and CSS and run no JS. A
prototype in `/private/tmp` will always look dead to Tom. Put anything he needs
to click inside the project folder.

## 2. Shipping, per surface. All four are already authenticated on this Mac.

### Web (the one that matters most)
Merge to `main`. Pages deploys in about 30 to 60 seconds. `gh` is logged in as
`tommillerca`.

**Merging is NOT shipping.** Every module is in `sw.js` PRECACHE, so if you
change `js/app.js` and do not move `VERSION` in `sw.js` AND `APP_BUILD` in
`js/app.js` AND add a `js/changelog.js` entry, **no installed client ever
refetches it**. This has bitten twice in one day. All three stamps must agree;
`tests/version-stamp-audit.mjs` checks it. Commit the stamp change, and grep all
three back out of the tree before you push: a release shipped today where a
`sed` ran after a rebase and was never committed.

Verify live by `curl`ing the served bytes, never by a green merge:
```
curl -s "https://tommillerca.github.io/tally/sw.js?cb=$RANDOM" | grep -m1 VERSION
curl -s "https://tommillerca.github.io/tally/js/app.js?cb=$RANDOM" | grep -m1 APP_BUILD
```
Then grep the changed module for a symbol your change introduced.

### iOS TestFlight
`cd tally/native && ./build-ios.sh`. It preflights the build number against App
Store Connect (never against the repo), archives, exports, uploads, distributes,
then runs `asc.py check`, which EXITS NON-ZERO if the release is not actually
installable. The signing key is already on disk at
`~/.appstoreconnect/private_keys/` and the script knows its id and issuer.
Current: **build 19**, version train 1.0. Do NOT bump `MARKETING_VERSION`; a new
train triggers a fresh external beta review and blocks the public-link testers.
Check with `python3 native/asc.py check`.

### Android Play
`cd tally/native`, export `JAVA_HOME="$HOME/.local/jdk/jdk-21.0.11+10/Contents/Home"`
(JDK 21 exactly, 17 fails with `invalid source release: 21`; that exact path has
already cost two redundant 300MB downloads because `~/.local/jdk` is a DIRECTORY
of JDKs), `ANDROID_HOME="$HOME/Library/Android/sdk"`, then
`./build-www.sh && npx cap sync android && cd android && ./gradlew bundleRelease`,
then `python3 ../play.py upload app/build/outputs/bundle/release/app-release.aab`.
Current: **versionCode 10 / 1.0.9** on the internal track. Check with
`python3 native/play.py check`.

**For any icon or asset inside a native build, read the bytes OUT of the
`.ipa`/`.aab`, not out of the repo.** Cam's skull sat correct in the tree while
both stores served the old icon for weeks.

### Server
`cd tally/server && ./deploy.sh`. It exists because two "it's deployed" claims
were false in two different ways: a stale checkout published a three-release-old
worker and the deploy still SUCCEEDED, and nobody asked the deployed worker
whether the route was there. It now makes both exit non-zero. Wrangler IS authenticated on this Mac,
verified 2026-08-20 with `npx wrangler whoami`.

**Migrations are not carried by the deploy.** PR #72 added
`server/migrations/2026-08-16-hardening.sql` and changed `schema.sql`. Applying
it to production D1 is a separate step. Pushing the worker without it runs new
code against the old schema.

## 3. The rules that actually cost time here

- **`boot()` in `tests/godmode.js` defaults to LIVE PRODUCTION**, and
  `serveTree()` returns `{url, port, close}`: it is `.url`, NOT `.base`. Passing
  the wrong key yields `undefined` and silently grades the live site. Four
  incidents in one day, including one where I nearly reverted a correct fix.
- **Never read an exit code through a pipe.** `grep -c` with 0 matches exits 1
  and kills the rest of a chained command.
- **Never merge a stale branch, cherry-pick or rebase forward.** Branches cut
  before v411 try to revert Cam's app icon and delete `tests/quest-pick-audit.mjs`.
  One read as 15,945 deletions against current main.
- **Assert these five survivors after every pick:** AppIcon sha256
  `3d9660fa4a3ebc1e`; `tests/quest-pick-audit.mjs` present; `POOL_IDS` in
  `js/quests.js`; `clamp(283px` twice plus the `.fight-hud` overlay rule in
  `app.css`; exactly ONE `const PURE = [` in `tests/release-gate.mjs`. That last
  one is not hypothetical: a concatenated conflict resolution left two, a
  SyntaxError that made the gate run ZERO suites while looking green.
- **Animations are verified by firing the real control and asserting PIXELS**,
  never by calling the animation's own function and never off a CSS box. Headless
  freezes the animation clock, so identical samples mean a broken capture, not a
  still element.
- **Never collapse `animation-duration` to 0.001s** under reduced motion; it runs
  an infinite loop a thousand times a second. Cap iterations or disable.
- **Balance is MEASURED**, never reasoned from the code: `tests/fight-sim.mjs`,
  `tests/balance-audit.js`.
- **A guard that cannot be shown failing is not a guard.** Prove every new
  assertion red in a throwaway tree and assert the mutation applied BEFORE
  reading the result. Four guards passed today while proving nothing.
- **Cam's drawn art is never replaced or altered.** Before finishing:
  `git diff --stat origin/main -- assets/bh assets/brand assets/crates js/glutton.js js/hollow-*.js js/paddock.js js/paddock-cards.js`
  must be empty.
- **Money paths use `db.addIfAbsent`** as the atomic claim. A naive
  `kvGet`/`kvSet` was measured printing 16,500 coins to three concurrent callers.
- No em dashes anywhere, in code, copy or chat.
- Clean up background processes. Two orphaned `http.server` instances were found
  four days and 25 hours old.

## 4. In flight right now, none of it merged

Three agents were running when this was written. Check for open PRs first:
`gh pr list --state open`.

1. **Gwart's Emporium, option A.** Tom chose it off a six-way sheet. The Shop
   tab's header becomes a full-bleed Gwart hero. Everything settled is written
   into `scratchpad/emporium/` and summarised in the agent brief: `K_DIM = 0.45`,
   no local grain layer, `var(--bg)` floor, wordmark nudge -3px with the app's
   `3px 4px 0 var(--ink)` sticker shadow, gear bottom-right, Cam's animation
   verbatim, `isolation:isolate` on `.hero`.
2. **The Mimic.** 1-in-3 Boneyard chests become a Mimic fight; the blink comes
   from three plates that differ only in the eye band; Mimic, Wanderer, Glutton
   and Mage all into the Pit's Gauntlet. Art at `tally-refs/mimic/`.
3. **Mystery Egg naming** (it is called three different things across two
   surfaces) and the **herb marker**, which has no pixel art and cannot borrow an
   ingredient icon because the spawn does not know which ingredient it carries.

## 5. Decisions Tom has already made, do not reopen

- Onboarding is ONE character: the hooded figure IS Gwart, and the reveal is his
  face. He is a **COACH**, not a narrator.
- Today's speech bubble is removed until Gwart floats in the scene. The pet
  losing its name and the skeleton's self-referential jokes retiring are both
  accepted.
- Glutton: window `[[0,12],[12,24]]`, NOT `[[0,24]]` (one window halves his
  payout, because `gluttonLive()` nulls him once cleared). Keep removing him on
  clear. Shrink the fog to 80m. Retire `GLUTTON_BLIGHT_M`. The stink no longer
  suppresses POI pickups.
- Wanderer: lore only, one per den cell, 200m radius, 92px marker, not snapped to
  ground, and he flips to face travel WITH the Hollow's motion-blur trick
  (`scaleX(-1)` on a wrapper, `.18s`, plus a 2.5px horizontal `feGaussianBlur`
  for 240ms during the turn).
- Emporium is red, dimmed, NO added grain.

## 6. Still owed to Tom

- A **48px herb / food-find marker** in pixel art. He draws these in PixelLab.
- The **README privacy claim**: it says "No accounts, no tracking, no server" and
  location "never stored or uploaded", while the app runs a Worker with D1, holds
  a per-device identity and uploads spire lat/lng. Needs fixing, in his words.
- `docs/INGEST.md`: nobody can currently ingest a new art batch from written
  instructions, because the process that placed the 2048px SOL items onto the
  figure does not exist anywhere findable.

---

# ADDENDUM, 2026-08-20 evening. Read this before section 4.

Section 4 above is stale. This is the real state.

## Everything uncommitted is now on origin

Ten worktrees held work that existed nowhere else. All snapshotted to
`rescue/wt/<name>`, taken with a temporary index so **no worktree was touched**
(verified after: each still shows the same uncommitted count as before).

| branch on origin | worktree HEAD was | files |
|---|---|---|
| `rescue/wt/wt-emporium` | `feat/gwart-emporium` (never pushed) | 5 |
| `rescue/wt/wt-mimic` | `feat/mimic-gauntlet` | 5 |
| `rescue/wt/wt-tryon` | `mockup/shop-rack-tryon-tmp` (never pushed) | 3 |
| `rescue/wt/wt-bal` | detached | 7 |
| `rescue/wt/wt-by` | detached | 2 |
| `rescue/wt/wt-egg` | `fix/boneyard-egg-name` | 1 |
| `rescue/wt/wt-eggred` | detached | 1 |
| `rescue/wt/wt-icons2` | detached | 1 |
| `rescue/wt/wt-shop3` | detached | 1 |
| `rescue/wt/wt-xpcurve` | `ext/balance-endgame-tiers` | 1 |

`feat/gwart-emporium` and `mockup/shop-rack-tryon-tmp` existed **only on this
Mac**. They are safe now. Nothing in `rescue/*` is reviewed; treat each as a
snapshot to mine, not a branch to merge.

## Four pieces of work were killed mid-flight, not finished

All four died on the same API error, `You've hit your org's monthly spend
limit`. None of them committed. Their reasoning survives only in their
transcripts under `tasks/`, and their partial files are in the rescue branches
above.

1. **Today screen, all four of Tom's notes.** Nothing landed, zero commits. It
   died while measuring whether a 100px top guard still pays for itself at a
   short hero.
2. **The Mimic** (chest fights + Gauntlet). Died right after confirming its art
   diff was additions only, on the survivors and em-dash check.
3. **Emporium option A.** Died while aligning its detectors with the mockup's
   measurement method.
4. **Egg naming + herb marker.** Died with both mutations already proven red,
   fixing a header comment.

Items 2 and 4 were close to done. Item 1 had barely started.

## Open PRs, both from the Gwart side

- **#77** server: D1 retention, pruning and indexes. Needs the migrations
  applied AND a cron trigger, not just a worker push.
- **#78** db: a rejected write is announced, and the atomic primitives move
  inside the seam.

## The four local branches plus the Emporium

Per `gwart/HANDOFF-TO-REGGIE-EMPORIUM.md` (on disk, 7,772 bytes) and
`~/Documents/gwart-emporium-handoff.bundle`. Land them as ONE push,
**gate-tier first**, then the other three, which do not touch each other.

**Two traps that will bite the Emporium specifically:**

1. **A new pet item is FREE from a Mystery Egg unless it is `exclusive: true`.**
   Both `hatchEgg` (`js/loot.js:515`) and breeding (`js/loot.js:882`) draw from
   `BH_ITEMS.filter(i => i.slot === 'C' && !i.exclusive)`. Sell a pet skin
   without that flag and a 60-dust egg gives it away on the same screen that
   sells it.
2. **One art id in two rack rungs charges the WRONG price.** `buyRackItem`
   prices by `RACK_POOLS[ids.indexOf(artId)][0]`, and `indexOf` returns the
   first match. Easiest mistake to make pasting in a batch.
   `ext/rack-theme-lint` catches it, is PURE and sub-second. **Run it on every
   art drop.**

## Do not chase notif-audit going red

Measured both ways on a clean tree today: exit 1 under `HEADLESS_MODE=shell`,
exit 0 without. It is the headless-shell Notification API, not main.

## Version stamps

None of the four branches touch them. Stamping stays with Tom and whoever ships.
Live is **v420**.

## One more zsh trap, since it cost a round today

In zsh, `"$CMT:refs/heads/x"` silently eats the `:r` as a history modifier and
produces a mangled refspec. Always brace it: `"${CMT}:refs/heads/x"`.
