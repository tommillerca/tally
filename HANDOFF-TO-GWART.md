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


# ADDENDUM, 2026-08-23. A third session's work, handed to Gwart.

_Written for a Claude with zero memory of that session. Specifics below; anything
uncertain is in Open Questions, not guessed. Live was **v426** when this was
written; `origin/main` was `6db729f7`._

I was a third session working alongside Gwart and the Emporium session. Two
things merged, one bug report was retracted, and one piece of work was NOT done.
Read this before touching `scripts/build-cosmetics.py` or
`tests/boneyard-audit.mjs`.

## 1. MERGED: the cosmetics rebuild stopped deleting the shop (PR #86, `2c032483`)

**The bug.** Re-running `python3 scripts/build-cosmetics.py` re-emitted
`data/boneheadz.js` from a FOUR-EXPORT template. The shipped file has more than
four exports, all hand-authored below the item array, and every rebuild deleted
them: `BH_ITEMS_WITH_UNRELEASED`, `PET_CROP`, `PET_SLOTS`, `PET_SHOP`,
`PET_HERO_REF`, `PET_HERO_HOUSE`, `PET_HERO_REL`. All seven are STATIC NAMED
IMPORTS in `js/app.js`, `js/loot.js` and `js/paddock-cards.js`, so the module did
not degrade, it failed to load. `PET_SHOP` is what sells Bumbleseal for 50,000
coins.

A separate earlier fix (v422-v424) had already stopped ITEM loss via `SPECIALS` +
`_prior_items()`. That worked: zero items lost. Nobody had checked the file still
loaded. **"No item was lost" and "the file still loads" are different claims.**

**The fix.** The manifest is now EDITED, not rewritten. Only the two generated
array literals are spliced in; every other byte, comment and table carries
through. The four-export template survives as the bootstrap for a checkout with
no manifest (the case `_prior_items()` already returns `{}` for). The naming
counter is seeded from shipped `#n` names so a new drop cannot reuse a number.

**Verify it still holds** (from the repo root, ~1 min):

```
python3 scripts/build-cosmetics.py && git diff --stat data/boneheadz.js
```

Expected: `0 new item(s) appended`, and **zero diff**. A rebuild with no new art
must be byte-identical. If it is not, the splice has regressed.

## 2. MERGED: the boneyard counters stopped counting the map key (PR #94, `0a569dec`)

**The bug, and it is a good one.** `js/app.js mapLegendHtml()` builds `#mapLegend`
out of the REAL marker markup on purpose, so the key cannot drift from the map.
`#mapLegend` sits INSIDE `#mapStage`, so the marker CSS applies to its swatches,
and it is `[hidden]` — i.e. `display:none`, which `getComputedStyle().opacity`
does NOT report as `0`.

Counted from source and confirmed live: **5 `.map-spawn` + 3 `.map-den-mark` +
1 `.map-mini-mark` = exactly NINE** nodes counted as permanently visible markers,
every run. `tests/boneyard-audit.mjs` counted them with unscoped
`document.querySelectorAll`.

So `vis@reveal 9` in `docs/FLAKE-CLASSIFICATION-2026-08-22.md` was never markers
inside the 220ms fade. It was the constant. Gwart corrected that doc in #91.

**Why it mattered more than the numbers.** The two rows that replaced MAJORITY are
shaped `revealDom > 0 && <comparison>`. With the key supplying 9, a Boneyard
drawing ZERO real markers gave `revealDom` 9, `revealSettled` 9, and `9 >= 9` and
`9*2 > 9` both passed. **Two green rows over an empty map**, shipped in the same
PR as the ratchet against that class.

**The fix**, all in `tests/boneyard-audit.mjs`:
- three counting sites filter through `closest('.maplibregl-marker')`. An
  ALLOWLIST on purpose: `js/map.js:200` does
  `new maplibregl.Marker({ element: el })`, so MapLibre stamps the class on what
  it owns and never on the key's copies. A `#mapLegend` denylist would work today
  and miss the next hidden thing built from marker markup.
- a decoy row (FAIL) guarding BOTH sites. Reverting only the recorder leaves the
  final count clean while inflating `revealDom`; a single-site check passes that.
- a SAMPLE floor row that goes **UNPROVEN (exit 97), not FAIL**, when the map drew
  nothing. `boneyardCapability()` proves a WebGL context can be CREATED, not that
  placement finished, and that gap is how a degraded run reaches these rows.
- `unprovenReport()` also called before the final exit. It only ran inside the
  `if (!mapCap.ok)` early exit, so a row going unproven mid-run exited 97 with
  nothing naming it: a silent 97, worse than a red.

## 3. RETRACTED: the "Boneyard draws zero markers" product bug

**Do not chase this. I filed it and then disproved it myself.**

One audit run in four produced an empty map, and I filed it as a suspected
product bug because a player on a bad connection would see an empty Boneyard.
Investigated on Tom's instruction:

- a repro harness (below), **15 runs, 15 healthy**: one `#mapStage`, `markers-in`
  true, map loaded, nothing detached, 57 or 58 markers every run.
- two full `tests/boneyard-audit.mjs` runs afterwards: **26/26 passed** both times.

**The confound was mine.** I called the box "clear" on a check that counted node
processes matching `tests/*.mjs`. It did not count BROWSERS, and I had killed two
audit runs mid-flight shortly before, which orphans their Chrome children. The
strongest sentence in my report was the least well-founded one.

The entry survives in `docs/WORK-REGISTER.md` marked DOWNGRADED, not deleted,
because the app did once render a map stage and never reveal, which defeats a
`setTimeout(revealMarkers, 1800)` armed unconditionally so that cannot happen. If
it recurs the UNPROVEN row now names the cause.

**Useful by-product: 26/26 on a quiet box.** That includes the two ARRIVAL-SLOW
straggler rows that fail on every contended run. They are contention-sensitive,
not broken. This CONFIRMS `docs/FLAKE-CLASSIFICATION-2026-08-22.md` line 119 (**on `origin/main`; NOT present in the shared checkout, which is behind main**)
rather than contradicting it (I first misread line 40, which is the MAJORITY
rows, and was corrected).

## 4. NOT DONE: Reggie's coordinated-beats model is still unported

This was the original task Tom gave me and **I did not complete it.** I found the
root cause underneath it (§2) and fixed that instead.

**Where the three versions live, and they all differ:**

| version | where | what it has |
|---|---|---|
| main | `origin/main:tests/boneyard-audit.mjs` | the settled-read fix + my §2 scoping. NO beat model. |
| Reggie's | UNCOMMITTED in the working tree of the shared checkout (branch `ext/art-memory-census`), blob `23b64fa9`. Still shows as ` M tests/boneyard-audit.mjs`. | the 26-row beat model. NO settled-read, NO scoping. |
| rescue | **LOCAL branch only** `rescue/shared-checkout-2026-08-20` @ `78b13d9d`. The REMOTE copy was deleted 2026-08-23 because the repo is PUBLIC. It exists on this Mac and nowhere else. | same as Reggie's, snapshotted |

**What the beat model is.** A BEAT is every marker that becomes visible within one
fade (`BEAT_MS = 250`, one 220ms transition plus slack) of the marker that opened
it. It asserts the map arrives in at most `MAX_BEATS = 3`, never a per-marker
trickle. Three because that is the count of legitimate placement sources: the
reveal itself, the tile-informed pass once `queryRenderedFeatures` can see water
and roads, and the spire's own network round trip.

It is deliberately REVEAL-INDEPENDENT, which is the whole point: the first beat
lands 14-539ms after the reveal on a fast line and 1810-2168ms on a slow one, so
no fixed offset describes both. It uses a FIXED WINDOW rather than a gap-linked
chain, because a chain lets a 40-marker trickle at 240ms apiece read as one long
beat.

It tests the thing Tom actually complained about on 2026-08-08 ("it looks cheap
when everything staggers in") and **nothing on main tests that today.**

**Before porting it, note:** it was written against an app 16+ commits old, so its
measured windows need re-measuring, and it must keep BOTH main's settled-read and
my scoping or it reintroduces §2.

## 5. The repro harness. It is NOT in the repo, on purpose

Every `.mjs` in `tests/` must belong to a tier or `release-gate` fails its
coverage assertion before a browser starts, so adding this as a file means adding
a `DECLARED` entry too. I did not, because nobody asked for a permanent tool.
It lived in `/private/tmp`, which is gone. Verbatim, so it is not rebuilt:

```javascript
import { boot, seed, sleep, serveTree } from './tests/godmode.js';
const srv = await serveTree(process.cwd());
const base = srv.url;
if (!/localhost|127\.0\.0\.1/.test(base)) { console.log('REFUSING, not local:', base); process.exit(2); }
const N = Number(process.argv[2] || 3);
for (let i = 1; i <= N; i++) {
  const { browser, page } = await boot(base, { args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  try {
    await browser.defaultBrowserContext().overridePermissions(new URL(base).origin, ['geolocation']);
    await page.setGeolocation({ latitude: 49.2827, longitude: -123.1207 });
    await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

    await seed(page, { level: 18, coins: 500 });
    await page.evaluate(() => { location.hash = '#/boneyard'; });
    await sleep(2500);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#screen button')].find(x => /start|allow|enable|walk|open|let/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await sleep(9000);
    const r = await page.evaluate(() => {
      const live = document.querySelector('#mapStage');
      const all = document.querySelectorAll('#mapStage');
      const m = window.__map;
      const canvas = document.querySelector('#mapCanvas');
      const owned = [...document.querySelectorAll('.map-spawn,.map-den-mark,.map-mini-mark,.map-spire,.map-glutton-mark')]
        .filter(e => e.closest('.maplibregl-marker'));
      let loaded = null, styleLoaded = null, ctr = null;
      try { loaded = m?.loaded?.() ?? null; styleLoaded = m?.isStyleLoaded?.() ?? null; ctr = m?.getCenter?.() ? 1 : 0; } catch (e) { loaded = 'threw:' + e.message; }
      return {
        stages: all.length,
        liveAttached: live ? document.body.contains(live) : null,
        markersIn: live ? live.classList.contains('markers-in') : null,
        mapObj: !!m, mapLoaded: loaded, styleLoaded, canvasAttached: canvas ? document.body.contains(canvas) : null,
        mapCanvasInLiveStage: (canvas && live) ? live.contains(canvas) : null,
        ownedMarkers: owned.length,
        detachedOwned: owned.filter(e => !document.body.contains(e)).length,
      };
    });
    console.log(`run${i} ` + JSON.stringify(r));
  } catch (e) { console.log(`run${i} THREW ${e.message}`); }
  await browser.close();
}
await srv.close?.(); srv.kill?.();
process.exit(0);
```

Save as `<repo root>/diag.mjs`, run `node diag.mjs 12`. ~20s per iteration versus
~4 minutes for the full audit. It reports detached stages, detached markers,
`markers-in`, `map.loaded()`, and the MapLibre-owned marker count.

**The trap that cost me a round:** do NOT add your own `page.goto(base)`.
`boot()` already navigates to `/?demo`, and `seed()` refuses to run on a page
that is not in demo mode.

## 6. Traps from this session, so they are not re-debugged

1. **A "clear box" check that counts test processes does not count browsers.**
   Killing a node parent orphans its Chrome children and they are invisible to
   `pgrep -f 'tests/.*mjs'`. This produced a false product-bug report.
2. **`pgrep -fc` and `pgrep -fl` disagreed**: the count returned 0 while the
   listing showed seven processes, because the pattern did not match full-path
   `node` invocations. Verify a count against a listing before trusting it.
3. **Timing rows in `boneyard-audit` must not be graded on a busy machine.**
   ARRIVAL-SLOW straggler latency reads 42ms idle and 342-461ms under load
   against a 250ms budget. At one point THREE sessions were running browser
   suites, including a full `release-gate --all`.
4. **`x === 0` is two claims.** "x was measured" AND "x is zero", and the failure
   output cannot separate them. `revealDecoys === 0` went red because no reveal
   fired, so it was `undefined`. A guard must distinguish ABSENT from ZERO; give
   the unmeasured case `unproven()` / exit 97.
5. **A prove-red that comes back GREEN is a result, not a pass.** Mine did, and
   the cause was that I had run the mutation inside a copy carrying my own
   PATCHED script, so byte-identical was the correct answer to the question I had
   accidentally asked.
6. **`guard-provenance-lint` counts bracketed literals containing strings**, not
   every constant. I dated the wrong one first. A `const SELS = ['.a','.b']`
   extracted into a `page.evaluate` counts; `const N = 10` does not.
7. **zsh ate `$R:tests/...`** as a history modifier in `git rev-parse`. Brace it.

## 7. Open questions for Gwart

1. **Is the beat model wanted at all now?** With §2's root cause fixed it may be
   less necessary than it looked. Nobody has decided. Tom's call, not mine.
2. **13 audits decide visibility from `getComputedStyle().opacity` alone** and an
   unknown subset share the §2 bug. Gwart's finding. Needs per-call-site review,
   NOT a grep: a file-level check reports `boneyard-audit.mjs` as guarded and we
   proved it was not. Logged in `docs/WORK-REGISTER.md`, unstarted.
3. **The fast path has no Boneyard-entry timestamp.** `window.__arr.t0` is set at
   document creation (line ~71, inside `evaluateOnNewDocument`), before `seed()`
   and before navigation, while the slow path sets `__slow.entry` at Boneyard
   entry. So fast reveal figures include the whole harness runway and are NOT
   comparable to the 1800ms cap. I claimed they were and withdrew it. Fixing it
   means recording an entry timestamp on the fast path the way the slow one does.
4. **`docs/WORK-REGISTER.md` has no owner.** Three sessions append to it
   concurrently and it drifts from its last commit within minutes. It is on
   `ext/art-memory-census`, which is PUSHED (Tom's informed call 2026-08-23,
   knowing the repo is PUBLIC).
