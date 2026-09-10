# Work register

Live status of everything Tom has asked for that is not yet live and verified.
I own this file. It is updated when work is ASKED, DELEGATED, DIES, or LANDS.
A dead or parked lane still counts as outstanding.

Last updated: 2026-09-10 (v553 live)

## In flight

| # | Item | Owner | State | Next action |
|---|---|---|---|---|
| 1 | **Studio round 2** — the BONEHEADZ wordmark is invisible (measured 1.00:1) | Codex, building | **RUNNING** | Mine: render, measure contrast at every placement, ship |
| 2 | **Wardrobe header rejig** — four misaligned single-item lines, four chip treatments | Codex, building | **PAUSED at Tom's request** | Park the tree, do not review until Tom lifts it |
| 3 | **Step race: no progress bars** — root cause confirmed on production D1 | me | **AWAITING TOM'S GO** | Dispatch once approved |

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
| 10 | **Studio wordmark contrast 1.00:1** | Cream RGB(243,239,231) on backdrop RGB(243,239,231); 68.1% of its band over artwork. Shipped knowingly in v553; round 2 is item 1 |
| 9 | Wardrobe header | Still a mess. Item 2 is the fix, paused |

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
| v553 | Studio v2: stickers, speech bubble, monsters, Crew, tray, screenshot mode. SILENT | live, export measured |

## Standing rules that bit this session

- `SILENT_BUILDS` (js/changelog.js) excuses a build from a changelog entry and NOTHING
  else. Every silent build still needs its own `docs/CLAIMS.md` section.
- Codex cannot bind a socket. Every browser audit and every screenshot is mine.
- A guard that goes red on a deliberate change gets its assertion rewritten to measure the
  NEW contract, never the defect restored and never the row deleted.
