# JS crash-risk and state-management audit (web half)

Branch `ext/js-crashrisk`, cut from `origin/main` at b5dd3af (v383).
42 modules, ~28,200 lines, vanilla ES modules, no type checker.

Everything reproduced below was reproduced against **a local server of THIS
worktree**, never bare. `boot()` in `tests/godmode.js` defaults to the live
production site, so a bare run measures production. Every URL is named per
finding.

## Counts

| Severity | Count | Confirmed | Unconfirmed | Fixed here |
|---|---|---|---|---|
| P0 | 0 | - | - | - |
| P1 | 3 | 3 | 0 | 3 |
| P2 | 4 | 1 | 3 | 0 |
| P3 | 5 | 1 | 4 | 0 |
| **Total** | **12** | **5** | **7** | **3** |

Plus one item handed to this lane by the coordinator that I **could not
reproduce**: see NOT-REPRODUCED at the bottom. It is not counted above because I
have no evidence of my own for it, and counting somebody else's sighting as my
finding would be dressing an unconfirmed thing up as a confirmed one.

A separate static sweep of the non-`app.js` modules produced a long list of
read-modify-write candidates. They are collected under P2-1 as ONE finding,
because they are one defect with thirteen addresses, and because I confirmed the
mechanism but not any individual site's reachability at human speed. Reporting
thirteen unconfirmed P1s off a static read would be the exact thing this project
keeps getting burned by.

---

# P1

## P1-1 · A `%` in the URL fragment bricks the app until the URL is edited

**CONFIRMED.** `js/app.js:11680` (`ingestHkFromUrl`), thrown at the
`decodeURIComponent(h)` on the old line 11683.

`boot()` is called bare at the bottom of `js/app.js` (line 15891). `await
ingestHkFromUrl()` sits at line 569 of `boot()`, which is **before** `route()`
(583) and `bindTabs()` (582). `decodeURIComponent` throws `URIError` on any
stray `%` in its input, and the input is `location.hash`, which is entirely
player-supplied.

**Trigger.** Open the app on any URL whose fragment starts `#/hk` and contains a
percent sign that is not a valid escape:

```
https://tommillerca.github.io/tally/#/hk%
https://tommillerca.github.io/tally/#/hk?n=100%
```

**What the player gets.** `#screen` empty (innerHTML length **0**), a tab bar
that renders from static HTML but has no click handlers because `bindTabs()`
never ran, and `URIError: URI malformed` in the console. The fragment survives a
reload, so reloading does not help, and `index.html`'s dead-shell recovery
script reloads once and correctly stops. The app is dead until somebody edits
the URL. On a home-screen PWA saved at that URL, there is no URL bar to edit.

Reachability is the reason this is P1 and not P0: it needs an odd link, and the
documented Apple Health Shortcut writes numeric values. But the failure mode is
total, sticky, and silent.

**Measured** at `http://127.0.0.1:53428/` (serveTree of this worktree):

```
{"hash":"(none)",        "screenHtmlLen":46820, "tabbarActive":1, "errs":[]}
{"hash":"#/hk?steps=1000","screenHtmlLen":46840,"tabbarActive":1, "errs":[]}
{"hash":"#/hk%",         "screenHtmlLen":0,     "tabbarActive":0, "errs":["URIError: URI malformed"]}
{"hash":"#/hk?note=100%","screenHtmlLen":0,     "tabbarActive":0, "errs":["URIError: URI malformed"]}
```

(Each probe needs a **fresh page**. `page.goto()` to a URL differing only in the
fragment is a same-document navigation, so `boot()` never re-runs; my first run
read five byte-identical DOMs and looked clean. That trap is written into the
guard.)

**Fix, shipped.** Fall back to the raw hash when the decode throws.
`parseHkPayload` reads plain `k=v` pairs and never needed the decode to have
succeeded, so this is the correct read rather than merely a safe one, and a
genuinely unreadable link still gets the existing "Could not read the Health
sync link" toast.

**Note on the class.** The specific reachable throw is fixed, but the shape
stays: *any* throw between `boot()`'s start and `route()` produces the same dead
shell, and `boot()` has no catch. A blanket `boot().catch(() => route())` is
**not** a safe fix, because most of those throws land before `S.settings` is
loaded and `route()` would immediately throw again on `S.settings.targets`.
Doing it properly means an explicit failure screen, which is a bigger change
than this audit's remit. Logged here as the follow-up.

---

## P1-2 · A dropped connection freezes the "Save name" button forever

**CONFIRMED.** `js/social.js:293` (`setName`), unhandled rejection surfacing
from `signedFetch` at `js/social.js:242`; the stuck control is
`js/app.js:6480` (`openNameBuilder`'s `#nbSave` handler).

`setName` was the only `signedFetch` caller in `social.js` with no `try/catch`.
Every sibling (`renameOwed`, `friendRequest`, `acceptFriend`, `sendGift`,
`sendCheer`, `claimSpireRemote`, `fetchSpires`, ...) returns a failure object.
`signedFetch` **rejects** when the network is unreachable and **throws
`'offline'`** when there is no account row, so on a dropped connection the
rejection propagated straight out of the async click handler, which had already
done `btn.disabled = true; btn.textContent = 'Saving...'`. Nothing re-enables
it.

**Trigger.** Open The Crew, tap "pick a name" / "change name", lose signal (lift
off wifi, tunnel, airplane mode), tap Save.

**What the player gets.** A dead button reading "Saving...", no toast, no
explanation, no retry. The only escape is closing the sheet. The handler's
`!r.ok` branch already carries the right copy and never runs.

**Measured** at `http://127.0.0.1:54307/` with the app pointed at a dead port
via `?demo&api=http%3A%2F%2F127.0.0.1%3A65534`:

```
before: Save name disabled=false
PAGEERROR Failed to fetch
    signedFetch (…/js/social.js:242:10)
    async Module.setName (…/js/social.js:294:13)
AFTER: {"btn":"Saving...","disabled":true,"toast":null,"unhandled":["Failed to fetch"]}
```

**Fix, shipped.** `try/catch` around `setName`'s body returning `{ ok: false }`,
so the failure is a RETURN like every sibling in the file rather than something
one handler has to learn about. The whole body is inside it on purpose: an
unreadable 200 body or a failed `kvSet` is also a name that did not save and
must not leave the button dead either.

**Two latent siblings, left alone.** `syncProfile` (`js/social.js:479`) and
`pullGrants` (`js/social.js:584`) also let `signedFetch` throw. Every current
caller guards them (`.catch()` at app.js 6496 / 6619 / 8354 / 8356, inside
`try` at 7375 / 13714 and in `autoSync`), so there is no live bug and no reason
to touch them. They are the next two to bite if a new call site forgets.

---

## P1-3 · The vault diagnostic reports an unreadable vault as "empty"

**CONFIRMED by source, both platforms read.** `js/app.js:8139`.

```js
extra = ':' + (s && s.readable === false ? 'unreadable' : (s && s.present ? 'has-key' : 'empty'));
```

`BhVault.status()` returns neither `readable` nor `present`. Verified against
both implementations rather than taken on report:

- `native/ios/App/App/BhVault.swift:89-90` resolves
  `{ available: true, e2e: true, hasIdentity: Bool }`, plus `readError` on a
  keychain error.
- `native/android/.../BhVault.kt:133-155` resolves `available`, `e2e`,
  `hasIdentity`, plus `reason` and `readError`.

So `s.readable === false` is `undefined === false` (never true) and `s.present`
is always `undefined` (always falsy). **Both branches fall through and the
Settings diagnostics line prints `BhVault:ok:empty` on every phone**: one
holding a live key, and one whose vault could not be read at all.

That is the worst string in the app to get wrong. The whole identity subsystem
is built on one rule, written into `js/social.js:59-64`: a failed vault read is
not an empty vault, because an empty reading is what makes the app mint a new
identity over a recoverable account. This diagnostic exists to surface exactly
that failure, and it would have said "empty" during the incident it was written
for.

The real consumer, `vaultRowHtml` at `js/app.js:11806`, uses the correct keys
and is unaffected. The defect is confined to the one diagnostic string.

**Fix, shipped.** Read the keys the plugins actually return:
`(s.readError || s.available === false)` for unreadable, `s.hasIdentity` for
has-key.

**Measured**, four stubbed `status()` shapes copied from the two plugin files,
at `http://127.0.0.1:55850/` (before) and `http://127.0.0.1:54750/` (after):

| shape | before | after |
|---|---|---|
| `{available:true,e2e:true,hasIdentity:true}` | `empty` | `has-key` |
| `{available:true,e2e:true,hasIdentity:false}` | `empty` | `empty` |
| `{…,hasIdentity:false,readError:'keychain status -25300'}` | `empty` | `unreadable` |
| `{available:false,e2e:false,hasIdentity:false,reason:'…'}` | `empty` | `unreadable` |

---

# P2 (documented, deliberately NOT fixed)

## P2-1 · Lost updates on every `kvGet` → mutate → `kvSet` pair

**Mechanism CONFIRMED. Reachability at human tap speed UNCONFIRMED for every
individual site.** `js/db.js:74-78` is the shared primitive; thirteen call
sites are listed below.

`kvGet` opens a readonly IDB transaction and `kvSet` a readwrite one, so if task
B's read is dispatched before task A's write, B is *guaranteed* to read the
pre-A value and its later write clobbers A wholesale. Any `await` between a read
and its write is a real window.

**Measured** at `http://127.0.0.1:55423/` and a second run, driving the real
`#wWater` control on Today (`js/wellness.js:22-27`, `addWater`) and reading kv
`wellness` back:

```
gap=0ms   8 taps -> water=1     (7 of 8 increments lost)
gap=40ms  8 taps -> water=8
gap=80ms  8 taps -> water=8
gap=120ms 8 taps -> water=8
```

So the class is real and demonstrable, and the window on the *narrow* sites is
under ~40ms, which a thumb cannot hit on one button. **That is why this is P2
and not P1**, and why I did not convert thirteen call sites: the sites that
matter are the ones where either (a) the window is wide because there are slow
awaits inside it, or (b) the two writers are independent async paths rather than
two taps, and I could not reach either state in the demo profile to measure it.

Sites, widest window and highest loss first. All UNCONFIRMED as player-reachable:

1. **`coins`** — `js/loot.js:83` (`coinsAdd`). Reached from `claimQuest`
   (`js/quests.js:233-240`) *after* `await award(...)` (2-3 IDB round trips plus
   `grantLevelRewards`) and `await keepersBoon()`. The Claim buttons at
   `js/app.js:2813` have **no `disabled` guard**, unlike `[data-open]` at
   `js/app.js:9722` which does. Two Claim taps a few hundred ms apart on Today
   would lose one quest's whole payout permanently, because `award()` has
   already written the idempotent `quest-<periodKey>-<id>` row.
2. **`xp` level crossing** — `js/game.js:54-70`. Two concurrent `award()` calls
   both read `before = X`; neither `X+25` nor `X+70` crosses a level but `X+95`
   does, so `grantLevelRewards` never fires and no later call can notice,
   because the next read sees `X+95` and `lvB.level` is already the new level.
   Loses `levelCoins(L)` + a Golden Crate, silently, forever.
3. **`petInst`** — `js/loot.js:496-500`, across `await lifetimeStepsSum()`.
   `[data-hatch]` (`js/app.js:9714`) has no guard and `hatchEgg` deletes its own
   inv row first, so two hatches consume two eggs and file one pet.
4. **`pitEnergy`** — `js/energy.js:46-60`, across `await todaySignals()`
   (`db.all('health')`, the widest read in the codebase). Collides with the home
   render's `Promise.all([...refreshPitEnergy()...])` at `js/app.js:2407`.
   Drinks the Draught and banks nothing, or refunds a spent fight.
5. **`spires`** — `js/spires.js:212` (`syncSieges`, driven by the
   `checkSieges` poll at `js/app.js:13686`) vs `js/spires.js:262`
   (`collectTribute`, driven by a marker tap at `js/app.js:13187`). Two
   genuinely independent triggers, which makes this the most plausible of the
   thirteen. Losing the synced `rec.siege` also loses
   `scheduleSiegeReminder`, so the tower falls unannounced.
6. **`bonedust`** — `js/loot.js:141-145`, reachable from `disenchantGear`,
   `salvageInstance`, `claimQuest`'s `q.dust`, `claimMiniWin`
   (`js/poi.js:523`) and `onHealthSync` (`js/game.js:468`).
7. **`ingredients` / cook slots** — `js/cooking.js:202-210`; two Cook taps
   compute the same free pot index and deduct from the same inventory snapshot.
8. **`redeemed`** — `js/loot.js:636-644`; the Redeem button
   (`js/app.js:8416`) has no `disabled` guard and `grantPet` is slow. See P3-1.
9. **`ingredients` / compost cap** — `js/garden.js:95-106`; bypasses the
   `COMPOSTS_PER_DAY = 3` throttle that `js/garden.js:10-13` calls the garden
   economy's balance guard.
10. **`equipped`** — `js/loot.js:1181-1192`, across `await ownedCosmeticIds()`
    (`db.all('inv')`).
11. **`petLvlSteps`** — `js/loot.js:715-725` vs `:507` and `:551`; the loss is
    permanent because `petStepCredit` has already advanced.
12. **`paidlooks`** — `js/loot.js:1010-1013` vs `js/loot.js:995-1007`, which
    *writes during a read*, fanned out six-wide by
    `Promise.all(fitList.map(fitPrice))` at `js/app.js:9153`. Re-charges dust
    for a transmog already paid for: the v221 trap the comment at
    `js/loot.js:989-993` says was retired.
13. **`foodbuffs`** — `js/cooking.js:300-303` vs `:291-297` vs `:326-331`.

**Recommended fix (one place, not thirteen).** Add a per-key serialised
`kvUpdate(key, fn, fallback)` to `js/db.js` using the same promise-chain trick
`js/analytics.js:33-42` already uses for the `evq` queue, then convert the
sites above. That is a ~6-line primitive plus thirteen mechanical edits, and it
wants its own reviewable change rather than riding in a crash audit.

## P2-2 · A restored account shows the old device's food list

**UNCONFIRMED** (not driven; requires a live account restore).
`js/app.js:8344` (`adoptIdentity` handler) and `js/app.js:11941`
(`restoreWithPhrase` handler).

Both refresh `S.settings` after the restore and **neither refreshes
`S.userFoods`**. The two sibling restore paths do: the file-import handler at
`js/app.js:8463` and boot's cloud restore at `js/app.js:540` both run
`S.userFoods = await db.all('foods')`.

`renderFoods` reads `S.userFoods` directly (`js/app.js:6335-6340`), and
`findFood` (`js/app.js:2315`) resolves logged entries through it, so after a
phrase restore the My Foods screen lists the pre-restore device's custom foods
and the restored log's entries cannot resolve their food rows. `route()` is
called right after, so the wrong list is what the player is shown. It corrects
itself on the next cold boot.

Classic drop-in-the-boring-glue: four restore paths, two remembered the second
line. Fix is one line at each site.

## P2-3 · A render that throws is invisible to the error telemetry

**CONFIRMED by reading**, not driven. `js/app.js:2166`.

```js
return Promise.resolve(done).catch(() => {}).then(() => { … });
```

Every screen render goes through here. A throw inside `renderToday` /
`renderFriends` / any of them is swallowed outright, so the player gets a
half-built screen **and** `analytics.js`'s `unhandledrejection` listener never
fires, so no `err` row is queued and nobody ever learns. The telemetry added on
2026-08-10 exists precisely so crashes are not found by Tom playing daily, and
the single most likely crash surface is the one place it cannot see.

`tests/screen-sweep.mjs` catches a render that leaves a screen blank, which is
the visible half. It cannot catch one that leaves a screen *partly* built.

Fix: report before swallowing, e.g. re-throw asynchronously
(`.catch(e => { setTimeout(() => { throw e; }); })`) so `window.onerror`
picks it up while navigation still completes. One line, but it changes what
lands in production telemetry, so it should be somebody's deliberate call rather
than a side effect of this audit.

## P2-4 · Server-supplied race rows are rendered without a shape check

**UNCONFIRMED** (needs a malformed server payload).
`js/app.js:1109` and `:1120`, `raceLanesHtml` / `openRaceResults`.

`p.steps.toLocaleString()` and `w.steps.toLocaleString()` run over whatever
`/steps/settled` returned. `settledPodium` (`js/app.js:1099`) guards only
`podium.length`, then **caches the payload to kv forever** (`raceResultKey(wk)`)
on the correct reasoning that a settled result cannot change. So one row missing
`steps` throws inside the boot-time poster and the bad payload is now permanent
local state. Same for `p.name` / `p.place`.

Everything else on this path is defended carefully (the `!race` branch at
`js/app.js:7386` explicitly refuses to default to hidden). This is the one
unguarded read.

---

# P3 (documented, not fixed)

## P3-1 · Double-tapping Redeem grants a code twice
`js/loot.js:636-644` + `js/app.js:8416`. **UNCONFIRMED.** The handler sets no
`disabled` and the read-to-write window spans `grantPet` →
`addPetInstance` → `lifetimeStepsSum`. Two taps inside that window both see an
empty `redeemed` and both grant. Bounded blast radius: six codes, one device.
`tests/redeem-audit.mjs` covers the sequential second redeem, not a concurrent
one.

## P3-2 · The daily wheel can be spun twice if you cross midnight mid-spin
`js/wheel.js:190` vs `:211-217`. **UNCONFIRMED**, deterministic by reading.
`const today = dateKey()` is captured when the wheel is *shown*, before
`waitForSplash()` and before the player taps SPIN; `commit` then writes
`wheelLastDate = today`. Open at 23:59, spin at 00:00, and the gate at `:198`
(`=== today`) fails on the next open, so the wheel is offered again the same
day. Stale-closure, not a race. The prize is seeded off the stale key too. Once
per day at most and awkward to farm deliberately.

## P3-3 · An unknown hash renders Today with no tab selected
`js/app.js:2094` (`currentTab`) and `:2141`. **CONFIRMED**, measured at
`http://127.0.0.1:53428/`: `#/zzzz` renders Today (46,851 chars, no errors) but
zero `#tabbar .tab` carry `active`. Not a dead screen, just a bar that shows
nothing selected. Any hash a player mistypes or is linked to lands here.

## P3-4 · Open Food Facts nutrients enter the log unbounded
`js/sources.js:21-32`; `n()` at `:8` checks only `isFinite`. **UNCONFIRMED.**
OFF is crowd-edited and per-100g fields routinely carry kJ or whole-package
values. `kcalConsistent` (`js/nutrition.js:122`) exists but only feeds a ranking
score at `js/sources.js:137` and `:190`, never a gate. A scanned
`energy-kcal_100g: 9000` pushes `dayTotals` past target, which sends
`awardDayCloseIfDue` (`js/game.js:484-489`) down the `dayeffort` branch, and the
`dayclose-<date>` ledger key makes that permanent.

## P3-5 · Health payload accepts an impossible date and unbounded steps
`js/game.js:591-593` (`parseHkPayload`). **UNCONFIRMED.** `weightKg` gets a
25-350 clamp two lines below at `:598`; `date` and `steps` get nothing.
`9999-99-99` becomes a permanent `health` row no `dateKey()` will ever match,
and `steps=99999999` flows into `lifetimeStepsSum` (`js/loot.js:240`), maturing
every incubating egg at once. Same file also has the unbounded kcal branch at
`js/labelparse.js:86-89`, where the sibling branch four lines up at `:83` does
enforce `0..2000`.

---

# NOT REPRODUCED

## `TypeError: Cannot read properties of null (reading 'getAttribute')` in a fight

Reported to this lane as confirmed on unmodified `origin/main`, during a mage
(`__denFight(1.4, 0, {mage:true})`) fight, around teardown and re-entry between
viewport passes. **I could not reproduce it in seven fight opens** and I am not
going to fix a site I cannot show is the site. A null guard at a crash site I
have not observed would silence a symptom and leave whatever is actually leaking
in place, and a guard written against a bug I cannot provoke would be a check
that cannot fail.

What I ran, both against `serveTree` of this worktree
(`http://127.0.0.1:56204/` and `http://127.0.0.1:56720/`), with `pageerror`
logging `err.stack` and an in-page `window.onerror` / `unhandledrejection`
collector installed via `evaluateOnNewDocument` before the first load:

1. Three passes at 390x844, 375x667, 430x932. Talents seeded, `__denFight`
   opened (`#youStage` present each time), torn down with `history.back()`
   while a sheet was still on screen. **0 errors.**
2. Four passes, same viewports plus a repeat, with the Boneyard opened and
   MapLibre mounted first (`.maplibregl-map` present each time), geolocation
   stubbed, and teardown by navigating to `#/today` **mid-animation** rather
   than backing out cleanly. **0 errors.**

What I ruled out by reading, which narrows it for whoever picks it up:

- The whole origin has exactly **three** `getAttribute` call sites.
  `js/app.js:2238` (`nextToast`) reads `$('#toast')`, and `#toast` is a static
  element in `index.html:64` that nothing removes, so the receiver cannot be
  null. `js/app.js:10166` maps over `$$()`, which yields an array of live nodes,
  so `cv` cannot be null either.
- The third is `vendor/maplibre/maplibre-gl.js`. **That makes MapLibre teardown
  the leading hypothesis**, and it fits "around teardown and re-entry" only when
  the Boneyard map is alive at the time, which the mage boss makes plausible.
  `route()` calls `screenCleanup?.()` at `js/app.js:2134` inside a `try` that
  swallows, so a marker or a `frameAsync` callback outliving a removed map would
  land exactly as an uncaught async `getAttribute` on null. I mounted the map
  and still could not provoke it.

Next step, and it needs the reporter's harness rather than mine: re-run *their*
exact sequence with a `page.on('pageerror', e => console.log(e.stack))`
attached. Only their ordering produces it, so only their ordering can name the
file and line. Once there is a line, the fix belongs in the teardown that leaks,
not at the crash site.

Untouched per the coordinator's hold: `app.css` `.fight-actions` / `.fight-act`
and the `renderActions` scroll-state block in `js/app.js`.

---

# What changed on this branch

| File | Change |
|---|---|
| `js/app.js` | P1-1: `decodeURIComponent` on the hash falls back to the raw string |
| `js/app.js` | P1-3: vault diagnostic reads `readError` / `available` / `hasIdentity` |
| `js/social.js` | P1-2: `setName` returns `{ok:false}` instead of throwing |
| `tests/crash-guard-audit.mjs` | new: 26 assertions covering all three, proven red |
| `tests/release-gate.mjs` | registers the new audit in `BROWSER` |

## The guard, and the proof it can fail

`node tests/crash-guard-audit.mjs` (serves this repo on a free port if given no
URL; takes a base URL otherwise).

Proven red in a throwaway `rsync` copy under `/tmp` with all three fixes
reverted and nothing else changed, run at `http://127.0.0.1:55850/`:
**13 FAIL, exit 1**, and the vault half collapsed to `states seen: empty,
empty, empty, empty`, which is the defect stated exactly. Green on this
worktree at `http://127.0.0.1:54750/`: **26 PASS, exit 0**. The throwaway tree
was deleted afterwards.

Every check carries a CONTROL that stays green in both runs, so the suite cannot
pass by measuring nothing:

- BOOT-HASH: a plain boot and a *well-formed* `#/hk?steps=4321` boot must both
  render >500 chars. Both were green in the red run, so the four red rows are
  about the malformed hashes and not about a harness that renders nothing.
- NAME-STUCK: the app must be pointed at the dead API, and the name builder must
  have opened with an **enabled** Save button, before the click counts. A sheet
  that never opened fails here rather than passing downstream.
- VAULT-DIAG: a `BhVault:` token must be found in the diagnostics line at all;
  an unmatched regex is a FAIL, never a quiet pass. Empty sample set is failure.

Direction is stated, not just failure: BOOT-HASH fails **downward** (screen
length toward 0, never a trend); NAME-STUCK fails at `disabled === true`;
VAULT-DIAG fails by **collapsing** four distinct inputs onto one output, which
is why the last assertion counts distinct strings rather than checking any one
of them.
