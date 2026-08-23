# Work register

Live list of everything Tom has asked for, its state, and where the artefact is.
Written 2026-08-20 after: "i told you you need to right things down and delegate
you cannot lose track of work it is unacceptable". He was right: the Today
mockup finished and sat unreported while I was heads-down on one bug.

**Rule: update this file the moment work is asked for, delegated, or lands. A
finished deliverable that nobody has been told about is not delivered.**
See `SHIP-LEDGER.md` for what counts as LIVE.

## Decisions Tom made 2026-08-20 (binding)

1. **Onboarding is ONE character.** The hooded sorcerer IS Gwart, drawn scary from
   the outside; the reveal is that the terrifying silhouette is the kindly maker.
   Cam draws one figure: the same wizard cradling the orb, hood up. Beats 1 to 3
   lose the ominous framing, and the third line comes from Gwart with his name on
   it rather than from an unattributed narrator.
2. **Emporium: not shippable yet.** Tom: "use /impeccable on it beacuse right now
   it is far off clean it up the grain is spliing everywhere etc". The grain is
   spilling outside the panel. Direction D2 stands; the execution does not.
3. **Today hero: shrink the figure AND scale Gwart up inside the medallion so it
   is his FACE.** Both, not either. The 22% figure-ink cost is accepted; the
   medallion currently shows too much robe and not enough face.
4. **The wordmark gets made unmistakable.** Drive it off scroll position so it
   fades in deterministically, bigger and higher contrast. The subtle version is
   rejected: it was live and correct for two releases and he still could not see
   it.

5. **The Today speech bubble comes OUT until Gwart is in the scene.** Tom:
   "let's remove the text bubble until we have gwart in the scene floating and
   talking that will replace the bonehead talking and gwart will be more the
   coach character". So v417's one converted surface is withdrawn for now.
   `js/talkbox.js`, the font and the Settings licence credit all STAY, because
   Gwart and onboarding both need them.
   **This settles two open questions:** the pet losing its name and the
   skeleton's self-referential jokes retiring are both ACCEPTED, because Gwart
   replaces that voice entirely.
   **And it re-frames Gwart:** he is a COACH, not a narrator. His lines get
   written from that stance, and the retired pet and skeleton pools are the
   source material rather than being deleted.

## Still waiting on Tom

- The basic **egg** he made in PixelLab (link or file) for the Boneyard egg stack.
- **Settings gear** placement in the Emporium: 44.5% of its box lands on the
  wordmark. Own line costs +32px.
- **Today**: nothing below the nav cards, so the calorie ring and food log fall
  below the fold on a food tracker's home screen.
- ~~**README** claims "No accounts, no tracking, no server"~~ **FIXED**, PR #88
  merged 2026-08-23 as `0bc2df8b`. `privacy.html` followed in PR #89
  (`716f6325`). Both documents are now accurate. What is LEFT is not wording:
  see "Cloud backup off does not stop uploads" below.

## Waiting on Tom (blocking me)

| # | Item | What I need |
|---|---|---|
| 1 | Onboarding narrative | Is the hooded sorcerer Gwart himself (one character, the reveal is that the scary silhouette is the maker), or a separate villain who stole your bones? Changes Cam's art brief. |
| 2 | Emporium direction | C sticker, D hero, or D2 (hero with the wordmark inside the glow). D2 recommended: 1.11 tile rows, 77px face. |
| 3 | Settings gear | D2 deletes the character header, which is where the gear lives. It has no home. |
| 4 | Today hero on island phones | The fix that stops the medallion covering the skull costs 22% less figure ink on an iPhone with a Dynamic Island. Accept, or keep a fixed-size figure and let the medallion overlap his hat? |
| 5 | Today: nothing below the nav cards | A 688px hero puts the calorie ring and food log below the fold on a food tracker's home screen. Product call. |
| 6 | Today: the pet loses its name | `PET_LINES` had the app's only named speaker. Gwart comments on the pet instead, so the pet's name no longer appears on Today. |
| 7 | Today: retired jokes | About a third of the skeleton's best lines don't survive, because the joke is that he is talking about himself and Gwart cannot carry it. |
| 8 | ~~README privacy claim~~ **DONE** | Fixed in PR #88 (`0bc2df8b`), both claims traced to code and rewritten. `privacy.html` followed in PR #89 (`716f6325`) with a full "Location and the map" section. Wording is done in both documents; the live item is now the cloud-backup toggle bug below. |

## Delivered, awaiting his look

| Item | Where |
|---|---|
| Kickstarter deck, $50,000 ask | 15 pages, sent |
| Cam's battle-backdrop brief | 3-page PDF + `arena-template-1440x760.png`, sent |
| Onboarding prototype (orb, tap-to-raise, Gwart) | `scratchpad/onboard/boneheadz-onboarding-prototype.html`, sent |
| Emporium banners A/B/C/D/D2 | `scratchpad/emporium/compare.png`, sent |
| The Raising prototype | sent (working copy) |
| **Today redesign with floating Gwart** | `scratchpad/today/today-mockup.html` + `FINDINGS.md`. Motion measured 5.00px peak-to-peak over 6.4s; reduced-motion 0.00px. Dynamic Island: 0 ink in the top 59px. |

## In flight

| Item | State |
|---|---|
| Pixel icons incl. the whole Boneyard | agent running. main has 14 icon sites, the branch has 41. |
| Talk box | **PR #69 open**, v416. Converts 1 of 17 speech surfaces. |
| Sprite safe-margin deck for illustrators | agent running. Asked for long ago, never built until now. |
| Emporium yellow + grain + Dynamic Island | agent running. |
| Wanderer creature + Glutton changes | not started. Art at `~/Downloads/design_handoff_wanderer/`. |

## Live on the public repo

- **privacy.html location disclosure.** PR #89 squash-merged 2026-08-23 as
  `716f6325`. New "Location and the map" section: foreground-only permissions
  (verified in both native manifests), locally generated spawns, the `/spires`
  ~2.2 km grid poll, the 80 m claim that sends the tower's lat/lng, and the
  third-party tile host `tiles.openfreemap.org`. Two further false claims went
  with it: "stay fully anonymous by not going online" (the key is registered when
  onboarding completes, and analytics have no opt-out) and "no account".
  Confirmed by fetching the live file from raw.githubusercontent.com.
- **README privacy wording.** PR #88 squash-merged 2026-08-23 as `0bc2df8b`.
  Both false claims ("No accounts, no tracking, no server"; location "never
  stored or uploaded") are gone, replaced with wording traced through
  `js/social.js`, `server/src/index.js`, `js/analytics.js` and `js/spires.js`.
  Every claim that was KEPT was re-verified too, so the fix does not introduce a
  new false one. Confirmed by fetching raw.githubusercontent.com, not from a
  local checkout: 0 occurrences of either claim. This unblocks PR #87.

## Merged to main, NOT yet live

- **Emporium idle cost.** PR #85 squash-merged 2026-08-23 as `d8819940`.
  hub:shop 119.9 style recalcs/s -> 0.0/s; all eight settled surfaces now 0.0.
  Cam's inlined wizard-cast keyframes are bit-for-bit unchanged (opacity
  identical to 3 decimals and transform to 4 at 13 offsets against unpatched
  main, with a before-vs-before control on the same base for the noise floor).
  `KNOWN_HOT` in `tests/idle-perf-audit.mjs` is now empty. Re-verified AFTER the
  merge against a tree seeded from `git archive origin/main`: all six rows green.
  **Players do not have it.** It deliberately does not bump `APP_BUILD`,
  `sw.js VERSION` or `changelog.js`, because whoever cuts v425 does that once
  after the merges. Until that happens the service worker serves the old module.

## Shipped and verified live today

v411 app icon (web + iOS build 19 + Android versionCode 10, bytes read out of both
bundles) · v412 health bars on the backdrop · v413 quest rotation + the Monday cap
collision · v414 wordmark rule · v415 wordmark geometry.

## Known broken

- ~~**Cloud backup OFF does not stop uploads.**~~ **FIX OPEN: PR #90**, branch
  `fix/cloud-backup-optout`. One guard inside `pushBackup`, where all four
  callers converge on the app's only `signedFetch('PUT', '/backup')`. Measured
  before the fix: with the REAL Settings Off button pressed, the server received
  a 116,074-byte `PUT /backup` after the player opted out. Encrypted, so it was a
  broken promise rather than a leak. No wording changes: it makes privacy.html's
  existing sentence and the Settings toast true as written. New guard
  `tests/cloud-optout-audit.mjs`, FAST tier, proven red against
  `git show origin/main:js/social.js`. Two of its own rows were thrown away for
  being unfailable first (a reload-based BOOT row that `navigator.webdriver`
  makes vacuous, and a source-count row that its own comment tripped).
- **The published canvas "The Raising and the Talk Box"** shows blue with a
  missing image. The source file is fine; the seeded artifact is not. Mine to fix.
- **A hub CHIP tap blanks the screen for ~90-200ms, and it is a COST, not a
  regression: the blank IS the anti-ghosting fix.** Two sessions measured this
  from opposite ends and the second one overturned the obvious conclusion, so
  read the whole entry before touching it.

  Structural, from a MutationObserver on real taps: hub chips route through
  `renderBonehead` even when you are already on the hub, and `renderBonehead`
  writes a fresh `<div id="chBody">`, so the screen is REBUILT wholesale rather
  than refilled. Measured at 440x956, CPU x6, warm cache: unpainted 104-203ms per
  chip tap, new screen not painted until 116-215ms after the tap, against a
  tab-bar route reading 33-180ms on the same probe as a positive control.

  The cause is **v424**, measured on both sides rather than recalled: on v423,
  where chips called `renderCharacter(wrap, tab)`, chips were never unpainted
  (control 152ms); on v424, where they call `openCharacter(tab)`, chips read
  88-168ms on 4 of 4 (control 149ms).

  **The one-word fix does not work and the next person will reach for it.**
  Using `refresh()` instead of `route()` in `openCharacter`'s already-here branch
  sends chips back to never-unpainted AND turns `handover-audit` red: 8 ghost
  frames over 81ms on Wardrobe -> Shop. That audit landed in `f18d479f`, the same
  v424, titled "the tab swap stops ghosting". Removing the blank trades a paint
  delay for showing the player a half-built screen. Recorded as a comment-only
  change on `perf/hub-chip-inplace`; there is no fix at that call site.

  **Both probes written for this were blind at first and both were caught the
  same way, by a positive control.** One reported "never unpainted" for every
  target including a tab-bar route, because it sampled `.screen > *` when
  app.css:7374 puts the hide on `.screen` itself. The other reported "never
  unpainted" on a tree where the chip handler had been made a no-op. Any
  re-measurement here keeps a tab-bar route in the run or it will reproduce the
  wrong answer twice.
- **The talk box ask is ~10% done.** Tom asked for typing dialogue "instead of the
  chat bubbles everywhere in the app". PR #69 converts ONE surface. Still bubbles:
  `.cele-bubble`, `.hlw-say`, `toast()`, and seven hint chips. The onboarding
  tutorial-wizard surface does not exist yet.

---

# Decision list, 2026-08-20

Every recommendation below is backed by a measured number, and the measurement is
named so it can be re-run.

## A. The Glutton

| # | Decision | Recommendation | Why |
|---|---|---|---|
| A1 | Window shape | **`[[0,12],[12,24]]`** | `[[0,24]]` HALVES him. `gluttonLive()` nulls him once cleared, so one window = 1 clear/day = 70xp. Two 12h windows = all day AND 2 clears = 140xp, matching today. |
| A2 | Should beating him stop removing him? | **No, keep removing** | It is what makes A1 work. If he persists after a clear the cap disappears and he becomes farmable. |
| A3 | Keep the stink fog at all? | **Keep it, shrunk to `GLUTTON_RADIUS_M` (80m)** | This makes stink bugs 2 and 3 vanish for free: no 18.67x texture stretch, no 4108x4108px element. May be the entire fix. |
| A4 | Retire `GLUTTON_BLIGHT_M`? | **Yes**, once A3 lands | It only exists to size the suppression disc, which is being removed. |
| A5 | Re-fight CTA behaviour | Needs your call | Once he is always out, what does the button say between clears? |
| A6 | New copy for `gluttonWhenHtml` + 3 blight lore lines | Needs your call | The current copy says he appears at certain hours, which stops being true. |

The stink no longer muting POI pickups is already decided and safe: **one**
mechanical site, costing **14.3% of drawn markers** (34 to 47 on a real map,
header "2 nearby" to "9 nearby"). Smaller than a density change already shipped.

## B. The Wanderer

| # | Decision | Recommendation | Why |
|---|---|---|---|
| B1 | Tappable: lore card, or a reward? | **Lore only** | A reward makes him a POI and puts him in the economy. As atmosphere he costs nothing and can ship now. |
| B2 | One in the world, or one per den cell? | **One per den cell** | World-anchored per cell needs no server state and every player sees him in the same place. |
| B3 | Roam radius | **200m** | Measured on-screen fraction: 95.3% at 390x844, 86.0% at 320x568. At 320m it collapses to 49.7% / 20.1%. |
| B4 | Facing flip when he turns? | Needs your call | Cheap, on an inner child so it cannot fight the marker transform. |
| B5 | Marker size: 92px or 104-112px? | **92px** | His flame is 4.2x4.9px at 92. Bigger only helps if the lantern matters at map scale. |
| B6 | Snap him to walkable ground? | **No** | He is a ghost. Snapping needs routing data the app does not have. |

Speed is settled and measured: **0.35 m/s, 21 m/min, 18 px/min at zoom 15.4, a
64-minute lap over 1344m.** Ground scale read off the renderer (collect ring
75m = 127.0px, so 1.18 m/px), not modelled.

## C. Still open from earlier

| # | Decision | Recommendation |
|---|---|---|
| C1 | Emporium settings gear | Its own line, +32px, taking the cost to 1.00 tile rows. 44.5% of its box currently lands on wordmark ink. |
| C2 | Today: calorie ring and food log fall below the fold under a 688px hero | Needs your call. It is a food tracker's home screen. |
| C3 | ~~README claims "No accounts, no tracking, no server"~~ **DONE** | PR #88 merged as `0bc2df8b`. `privacy.html` followed in PR #89 (`716f6325`). |
| C4 | Merge PR #72 (server races) | Your call: money-path write behaviour, verified locally only. Needs the D1 migration applied at deploy, not just a Worker push. |
| C5 | Merge PR #73 (remove Today's bubble) | Merge. It also uncovers the fox mask the bubble was sitting on. |

---

# LIVE STATE, last updated 2026-08-20 evening

**Update this at four moments: asked, delegated, DIED, landed.** The one I miss
is DIED: a killed or failed agent means the work is OUTSTANDING again, not done.

## Agents out right now

| agent | owns | state |
|---|---|---|
| Emporium option A | ships the Shop hero for real | running |
| The Mimic | 1-in-3 chests, blink, 4 bosses into the Gauntlet | running |
| Egg naming + herb marker | Mystery Egg consistency, food-find icon | running |
| Today redesign | all four of Tom's notes, restarted after being killed | running |

## Agents that DIED and had to be restarted (the failure mode)

- **Today redesign** — killed mid-run 2026-08-20. Got as far as ink masks at
  16:28, never produced the mockup. I noted it in one clause and did not restart
  it until Tom asked "and the today screen fixes?". Restarted.
- **Emporium /impeccable** — died on ECONNRESET. Restarted.
- **Emporium direction D** — died without reporting. Tom noticed before I did.

## Shipped and verified live today

v411 app icon (web + iOS build 19 + Android versionCode 10, bytes read out of
both bundles) · v412 health bars on the backdrop · v413 quest rotation and the
Monday cap collision · v414/v415 wordmark rule and geometry · v416 Boneyard
pixel art · v417 talk box · v418 Today's bubble removed · v419 Boneyard icon
audit · v420 wordmark made visible. Server races merged (PR #72).

## Outstanding, nobody is working on it

- **A 48px herb / food-find pixel marker.** Tom draws these in PixelLab. It
  cannot borrow an ingredient icon: the spawn does not know which ingredient it
  carries until collected.
- ~~**README privacy claim.**~~ **FIXED** in PR #88 (`0bc2df8b`, merged
  2026-08-23). Verified gone from the live public repo, not just from a local
  checkout. `privacy.html` followed in PR #89 (`716f6325`): a new
  "Location and the map" section covering the ~2.2 km grid poll, the 80 m claim,
  foreground-only permissions and the third-party tile host, plus two further
  false claims removed. Wording is finished in both documents.
- **`docs/INGEST.md`.** Nobody can ingest a new art batch from written
  instructions; the process that placed the 2048px SOL items onto the figure is
  not findable.
- **The talk box is ~10% delivered.** Tom asked for typing dialogue "instead of
  the chat bubbles everywhere in the app and also used during onboarding". One
  surface was converted and then removed again. Still bubbles: `.cele-bubble`,
  `.hlw-say`, `toast()`, seven hint chips, and onboarding has none of it.
- **The published canvas "The Raising and the Talk Box"** renders blue with a
  missing image. Source is fine, the seeded artifact is not.
- **Gwart dev's queue**, batch 2 in `CHAT-HANDOFF.md`: dbprune, writefail's
  db-layer half, evqueue, tautology, the citation generator, INGEST.md. Held
  until the client work drains: launchfix, errcopy, supportgap, rmrace.

## 2026-08-20, Mac session: the single-copy risk is retired

`MACSESSIONSTARTHERE.md` section 6 said the survivors and Reg's in-flight
branches existed in exactly one place. Both are now on origin.

- **The seven crew docs are pushed.** `ext/crew-docs-rescue` @ `34d2e2d`, off
  `origin/main` @ `c3b7bc9`. CHAT-HANDOFF.md, HANDOFF-TO-GWART.md,
  SHIP-LEDGER.md, WORK-REGISTER.md, ECONOMY-INTERLOCK.md, IAP-SCOPING.md and
  STATE-2026-08-19.md. Docs only, no app code, no version stamp. Built with a
  temp index so the working tree and its staged/modified files were untouched.
  They are still untracked locally on purpose. Merge the branch when convenient.
- **21 branches held commits that were on no origin ref.** All pushed, none
  forced, nothing clobbered. 19 under their own name, and 2 that had diverged
  from a same-named remote branch went to `rescue/feat/talk-box-v415` and
  `rescue/fix/boneyard-icons-audit`. The biggest were `reggie/gwart-batch`
  (24 unique commits), `reggie/gwart-rest` (12) and `reggie/train-harness` (10).
- **Reg's three:** the Mimic is `feat/mimic-gauntlet` @ `6ec8c49` ("wip2") and
  the egg naming is `fix/boneyard-egg-name` @ `d26a914` ("wip: egg name"), both
  now on origin. **Emporium option A is NOT on this Mac.** `feat/gwart-emporium`
  exists locally but its tip is just `c3b7bc9`, main itself, so it is an empty
  branch. That work is still in one place, on Reggie's machine.
- Verified after the fact: every commit on every local branch is now reachable
  from an origin ref. Origin went from 284 refs to 306.

### RESOLVED: the bundle arrived and both branches are up as PRs

Tom produced it as `~/Downloads/v420picks.bundle` (no hyphen, which is why the
first search missed it). `git bundle verify` says okay, and it required exactly
`c3b7bc9`, so both branches sit directly on today's main with no rebase.

- **PR #77, `gwart/v420-dbprune` @ `0bc0d38`.** Nine commits, 12 files, `server/`
  only, confirmed by name check. Two things a reviewer must ACT on rather than
  read: it adds two migrations for the deployed database, and it adds a
  `[triggers] crons = ["*/15 * * * *"]` block to `server/wrangler.toml` that does
  nothing until the worker is deployed. The PR body carries the three guard
  repairs from the forward-port, the byName exclusion decision that comes out
  once production drains, and the two test results that are not code defects
  (the 413 blob guard is unprovable on local D1; security.test.mjs kills the
  local worker after passing 24/24, so run it last or alone).
- **PR #78, `gwart/v420-writefail` @ `3cb9be3`.** One commit, 3 files: `js/db.js`,
  one line of `tests/release-gate.mjs`, and the new
  `tests/write-failure-seam-audit.mjs`. **Ran it here on the branch: 29
  assertions, PASS, exit 0**, read from a file rather than through a pipe.
- Both report MERGEABLE. **Neither is merged.** `origin/main` is still `c3b7bc9`.
- **Merging #78 is not shipping it.** `js/db.js` is in the `sw.js` PRECACHE list
  (`sw.js:9`) and VERSION on main is `tally-v420`. No installed client gets the
  seam until VERSION moves. The stamp belongs to the release, so it was
  deliberately not bumped on the branch.
- `gwart/v417-concurrency` is dead as the doc said: already merged as PR #72.
  The local `v417picks.bundle` holds only that ref and can be deleted.

### The doc was wrong about Emporium, and about where the risk lived

`MACSESSIONSTARTHERE.md` said Reggie's three in-flight branches were on his
machine. Two of them are branches on this Mac and are now pushed. The third,
**Emporium option A, was never a branch at all.** It is UNCOMMITTED work sitting
in a worktree at
`/private/tmp/claude-502/.../ad578513-.../scratchpad/wt-emporium`, on
`feat/gwart-emporium` whose tip is just `c3b7bc9`. That is why every ref search
came back empty: there was nothing in git to find.

**Every one of this project's scratch worktrees lives under `/private/tmp`,
which macOS purges.** A sweep found 34 of them dirty, 21 holding real work that
existed nowhere else.

All 21 are now snapshotted to `rescue/wt/<worktree-name>` on origin. Each was
built with a temporary index against that worktree's own HEAD, so **no index and
no HEAD was touched** and the other session's working state is byte-for-byte as
it was. These are backups, not proposals to merge.

The ones that would have hurt:

- **`rescue/wt/wt-emporium`**, Emporium option A: 239 insertions across
  `app.css`, `js/app.js`, `js/changelog.js` and `sw.js`, plus the two untracked
  PNGs `assets/gwart/gwart.png` (363,837 bytes) and `gwart-stars.png` (111,309
  bytes). The art was the part git had no record of anywhere.
- **`rescue/wt/wt-mimic`**, the Mimic: 420 insertions, including an untracked
  `tests/gauntlet-sim.mjs` and 269 lines of FINDINGS.md.
- **`rescue/wt/rel385`**, release/v385: 488 insertions plus an untracked
  `assets/hollow/morningdew-loop.m4a` (809,298 bytes) and a 290-line
  `tests/hollow-music-audit.mjs`.
- **`rescue/wt/tally`**: the main checkout's own 537 insertions, the same seven
  docs plus the in-flight `app.css`, `build.gradle` and `boneyard-audit.mjs`
  edits that `ext/crew-docs-rescue` deliberately left out.
- Then `recov` (42), `tally-provered` (47), `vlad-tally-adopt` (36),
  `vlad-tally-C` (25), `preflight` (93), `cur` (new pixel art), and ten smaller.

**The lesson for the crew: a scratch worktree under /private/tmp is not
storage.** Work parked there is one temp sweep from gone, and no branch listing
will ever show it missing.

### Reggie's session was cut off mid-run. Here is what each worktree was left holding.

His agents are all dead (no node, wrangler, workerd or headless Chrome processes
alive as of 2026-08-20 18:30). Per the dead-agent rule, every line below is
OUTSTANDING, not done. All of it is snapshotted at `rescue/wt/<name>`, so the
worktree can be purged without losing it.

| worktree | branch | left holding |
|---|---|---|
| `wt-emporium` | `feat/gwart-emporium` @ `c3b7bc9` | Emporium option A: app.css, js/app.js, changelog, sw.js, plus untracked `assets/gwart/` (two PNGs). Never committed. |
| `wt-mimic` | `feat/mimic-gauntlet` @ `6ec8c49` | the Mimic: mimic.js, two audits, 269 lines of FINDINGS.md, untracked `tests/gauntlet-sim.mjs` |
| `rel385` | `release/v385` @ `5a3c071` | the Hollow music release: untracked `morningdew-loop.m4a` and a 290-line `hollow-music-audit.mjs`, plus app.js/app.css/sw.js and a gate line |
| `cur` | `reggie/pixel-currency` @ `d47722d` | NEW PIXEL ART, uncommitted: ectoplasm, kitchen, stable, vigor, a food/ folder, and a `.bak` of battle-charm |
| `recov` | `reggie/recovery-key` @ `fc9bb0f` | js/social.js, server/src/index.js, server/recovery.test.mjs. Based on v388, so 32 releases behind. |
| `b1` | `reggie/batch1-review` @ `c536fdf` | js/app.js and sw.js |
| `hollow` | `reggie/hollow` @ `87bf926` | untracked `gwart/HOLLOW-PIXEL-ASSET-LIST.md` |
| `preflight` | detached @ `3c85640` | js/app.js, STAGED but never committed |
| `tally-provered` | detached @ `76fb77a` | app.css plus untracked `tests/boot-flash-audit.mjs` |
| `vlad-tally-adopt` | `ext/detach-guard-adoption` | tests/godmode.js plus untracked `tests/detach-guard.test.mjs` |
| `vlad-tally-C` | `vlad-c-scratch` | tests/year-readout-audit.mjs |
| `vlad-tally-lint` | `ext/test-lint` | untracked `tests/selector-sweep.mjs` |
| `wt-bal` | detached @ `d17b59c` | seven untracked `zz-*` balance probe scripts |
| `wt-by`, `wt-egg`, `wt-eggred`, `wt-xpcurve`, `wt-icons2`, `wt-shop3`, `wt-tryon` | various | small edits and one-off measurement scripts |

**Nothing of his was overwritten to make these snapshots.** No push was forced,
every `rescue/` ref is a newly created name, and each snapshot was built through
a temporary index so no worktree's HEAD or index moved. His branch tips on origin
match his local tips exactly.

## 2026-08-22, cosmetics session: the rebuild stops eating the shop

**State: MERGED to main 2026-08-23 as #86, squash commit `2c032483`. CLOSED.** https://github.com/tommillerca/tally/pull/86 . Merge itself is
still his call. Verified on the remote, not from the push output: `git ls-remote`
tip matches local, and the remote's copy carries exactly the three files below.

| branch | SHAs | holds |
|---|---|---|
| `fix/cosmetics-manifest-splice` | `85c5c40e`, `e7b6aa1e` | REBASED 2026-08-22 onto `origin/main` @ `716f6325` (was `f18d479f`; #85, #88, #89 landed under it, none touching these files). Old SHAs `074a2970`/`0a9b5c4e` are dead. `scripts/build-cosmetics.py`, new `tests/manifest-exports-audit.mjs`, one line of `tests/release-gate.mjs`. |

**THE BUG.** Re-running `scripts/build-cosmetics.py` destroyed the shop. Two
separate halves, found in that order:

1. The item half, FIXED ALREADY by the Gwart lane in v422-v424 (69 items mirrored
   into SPECIALS, `_prior_items()` copying name+rarity forward). Verified working:
   a rebuild loses zero items and renames zero.
2. The half nobody checked: the write path still re-emitted a FOUR-EXPORT
   template, discarding seven hand-authored exports below the item array.
   `BH_ITEMS_WITH_UNRELEASED  PET_CROP  PET_SLOTS  PET_SHOP  PET_HERO_REF
   PET_HERO_HOUSE  PET_HERO_REL`. All seven are static named imports in
   `js/app.js`, `js/loot.js`, `js/paddock-cards.js`, so the module does not
   degrade, it FAILS TO LOAD. `PET_SHOP` is what sells Bumbleseal for 50,000
   coins. "No item was lost" and "the file still loads" are different claims and
   only the first was being checked.

**THE FIX.** The shipped manifest is edited, not rewritten: only the two generated
array literals are spliced, every other byte, comment and table carries through.
The old template stays as the bootstrap for a checkout with no manifest. The
naming counter is seeded from shipped `#n` names so a new drop cannot reuse a
number the last drop holds.

**PROOF.** Rebuild against the real library is BYTE-IDENTICAL; module loads (370
items, PET_SHOP sells C6, PET_CROP has 7 pets); two successive scratch art drops
append only the new ids. `npm test` 186 + 91, pet-pool-audit and
guard-hygiene-lint green. The new audit was prove-redded in four separate trees:
broken import regex, empty glob, scan narrowed to ONE file (the case a bare
not-zero bound passed), and a rebuild by the unpatched script.

**RESOLVED: #84 merged as `13b3f20e`, then #86 as `2c032483`. The PURE conflict was
resolved keeping both entries; both are on main and both lints pass. Original note:** Tom believed he had merged it; `gh pr view 84`
reports state=OPEN, mergedAt=null, and `guard-provenance-lint.mjs` is absent from main.
The last merges were #85, #88, #89. So #86 currently reports MERGEABLE/CLEAN, which is
true only until #84 lands. That green is not evidence the conflict below went away.

**CONFLICT, DO NOT RESOLVE BY GUESSING.** PR #84 also adds one line to the `PURE`
array in `tests/release-gate.mjs`. Whoever merges second keeps BOTH filenames and
BOTH comment blocks. The array is order-insensitive; the gate's own COVERAGE
assertion refuses to start on an undeclared audit, so a careless resolve fails
loudly rather than silently.

**Open, for Tom:** push + PR this branch; PR #78 (`gwart/v420-writefail`) is open
against main and the Gwart lane cannot speak to its state; and
`tests/boneyard-audit.mjs` now has two competing ARRIVAL fixes, one in PR #84 and
one in `rescue/shared-checkout-2026-08-20`, which must be ported deliberately
rather than replayed.
