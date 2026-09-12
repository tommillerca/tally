# Work register

Live status of everything Tom has asked for that is not yet live and verified.
I own this file. It is updated when work is ASKED, DELEGATED, DIES, or LANDS.
A dead or parked lane still counts as outstanding.

Last updated: 2026-09-11 (v560 live)

## In flight

| # | Item | Owner | State | Next action |
|---|---|---|---|---|
| F22 | Flagged existing Crew accounts (server finding 5) | Codex | Implemented locally, v590; audit 11/11, main FRIENDS RED | Independent review, then Tom owns Worker deployment |
| 1 | **Playtest slate, runs 10-14** | mostly ME (see note) | **STARTED at 12-A** | Census of all 122 browser audits running now |
| 2 | **Wardrobe header rejig** — four misaligned single-item lines, four chip treatments | Codex, building | **PAUSED at Tom's request** | Park the tree, do not review until Tom lifts it |
| 3 | ~~Step race: no progress bars~~ | me | **LANDED v558**, live | Closed. Bars 0/11 to 7/11 on the real board |
| 12 | ~~Device report~~ | Codex, 3 rounds | **LANDED v560**, live and byte-verified | Closed. Tom's phone pass is now ~15 min, 10 of it VoiceOver |
| 13 | **The 28 real browser-audit reds** — causes for each | me | **OPEN**, run 12-A's deliverable | 121 graded: GREEN 76, RED 40, UNPROVEN 5. `gate-audit` defect already named |

## Approved and not started

| # | Item | Why it is waiting |
|---|---|---|
| 4 | Studio control restyle | CLOSED by v553: 0 selects and 0 checkboxes left on the screen |

## Known and measured, not fixed

| # | Item | Measurement |
|---|---|---|
| 5 | Off-hand outliers IL9, IL5, IL8-1, IL14 | IL9 +47.7,+86.7 · IL5 +44.7 · IL8-1 -10.8 · IL14 -21.3y. None checked in a render. `docs/CLAIMS.md` v549 |
| 6 | `tests/ui-audit.js` drift | Red on clean main: `#coinBtn` opens shop not crates, `#charBtn` opens crates not wardrobe, `#dropToShop` and `#spireToMap` missing |
| 7 | Duplicate v544 changelog entry | Two entries dated 09-10 and 09-09 |
| 8 | Studio: native save | iOS Photos / Android picker unproven; needs an attended native build. Screenshot mode ships as the interim path |
| 14 | `@capacitor/haptics` NOT INSTALLED | `native/capabilities.json` declares it a deliberate `known_gap`. Every tap, payout and impact is silent on native and nothing errors. Fixing needs the dep plus `npx cap sync` plus an iOS and Android rebuild and store upload: the native lane, attended, Tom's call |
| 10 | Studio wordmark contrast | CLOSED by v554: 1.02:1 -> 12.40:1, measured on the export |
| 11 | Studio: bubble/mark placement on other outfits | The occupancy search resolved both onto clean ground for ONE render. Untested across outfits and backdrops |
| 9 | Wardrobe header | Still a mess. Item 2 is the fix, paused |
| 15 | Onboarding restore-button trap | On a FRESH save the primary green button is "Restore an account or backup file" and "I am new" is the grey secondary. This is the run-9 finding that burned 14 taps; re-observed live on v560, 2026-09-11. Not fixed |

## Shipped and byte-verified live

| Build | What | Verified |
|---|---|---|
| v546 | Day-one grant 40 → 340 | live |
| v547 | Shop price contrast 1.23:1 → 5.10:1 | live |
| v548 | Wardrobe equip feedback | live |
| v549 | Off-hand registration (shovel, spade, brush); "2 taps" label removed | live, art SHA256-matched |
| v550 | Dressing Room second step visible; zero-price labels; look counts; acquisition links | live |
| v551 | The Studio behind a quiet Wardrobe link. SILENT | live |
| v552 | Confirm bar static at rest / sticky when armed; Studio chip in the fit rail; camera + fusion-chamber icons. SILENT | live |
| v560 | Device report in Settings behind the STORE_BUILD gate. PURE 75/75; probes verified against known-wrong values; live end-to-end | live, byte-verified |
| v553 | Studio v2: stickers, speech bubble, monsters, Crew, tray, screenshot mode. SILENT | live, export measured |
| v554 | BONEHEADZ wordmark legible, 12.40:1; placement searches for clear ground. SILENT | live, export measured |

## Standing rules that bit this session

- `SILENT_BUILDS` (js/changelog.js) excuses a build from a changelog entry and NOTHING
  else. Every silent build still needs its own `docs/CLAIMS.md` section.
- Codex cannot bind a socket. Every browser audit and every screenshot is mine.
- A guard that goes red on a deliberate change gets its assertion rewritten to measure the
  NEW contract, never the defect restored and never the row deleted.

## Playtest slate (received 2026-09-10)

`PLAYTESTSLATEship20260910.md`. Exit bar is 8 items across runs 10-14.

**The structural fact: runs 10, 11, 12 and 14 are rig and browser work, and Codex cannot
bind a socket (`listen EPERM`). It cannot run any of them.** This slate is almost entirely
my usage, which makes its pace a budget decision, not a scheduling one.

| Run | What | Who can do it | State |
|---|---|---|---|
| 10-A | Cold install to first reward, non-gamer, fresh save | me | not started |
| 10-B | Day-one dead-control census, every room | me | not started |
| 10-C | What onboarding tells and hides; vocabulary census | me | not started |
| 11-A | Startup and re-render budget | me | not started |
| 11-B | Memory over 30 minutes | me | not started |
| 11-C | Offline and flaky; the `?api=` question | me | **partly answered, see below** |
| 11-D | Force quit and data integrity on current main | me | not started |
| 12-A | Classify all 122 browser audits green/red/hollow | me | **RUNNING** |
| 12-B | Fix verification, two-half | me | blocked on a Codex Wardrobe batch |
| 13 | The phone hour | **Tom** | waiting on his hour |
| 14 | The earned save | me | after 12-B |

### Two of the slate's premises have changed since it was written

1. **10-B's stated cause is already fixed.** The `.btn:disabled` vs `.btn.ghost`
   specificity bug was closed by v547: `app.css:603` now reads
   `.btn:disabled, .btn.ghost:disabled { ... }`, and `.btn.ghost:disabled` (0,3,0) beats
   `.btn.ghost` (0,2,0). The census is still worth running; this is no longer its cause.

2. **11-C's `?api=` question resolves the other way.** Both capacitor configs
   (`native/ios/App/App/capacitor.config.json`, the Android one) point at
   `https://tommillerca.github.io/tally/` with NO query string, so the shipped shell sends
   no `?api=` and `apiBase()` falls through to `PROD_API`. That is correct: a shipped phone
   should talk to production.
   **The real hazard is the opposite one and nobody has looked at it.**
   `initFromQuery()` does `kvSet('apiBase', q)`, which is PERMANENT. Any device that ever
   opens a link carrying `?api=` is pinned to that base forever, with no UI to see or clear
   it, on a shell that loads whatever is on Pages. Worth a run of its own.
