# Tally architecture (and the path to a native iOS app)

Tally is deliberately layered so the whole product can graduate from PWA to App Store app without a rewrite. Keep these boundaries intact when adding features.

## Layers

```
UI            js/app.js, app.css            DOM only. No game rules, no storage math.
Game core     js/game.js, js/quests.js,     Pure rules + an async storage handle.
              js/loot.js, js/nutrition.js,  No DOM. No web-only APIs.
              js/labelparse.js
Data/content  data/generic-foods.js,        Plain data. Regenerable. A future server
              data/boneheadz.js             could serve these verbatim as JSON.
Adapters      js/db.js (IndexedDB),         The only modules allowed to touch
              js/scanner.js, js/ocr.js,     platform APIs (storage, camera, wasm).
              js/sources.js (network)
```

Porting recipe: keep UI + adapters swappable, everything else moves as-is.

## The event ledger is the source of truth for the game

Every XP-earning moment is an append-only row in the `xp` store with a globally
unique, human-readable key (`log-<entryId>`, `protein-2026-07-03`,
`quest-2026-07-03-q-scan`, `badge-scan-25`, `freeze-2026-07-02`). Rules:

- Awards are idempotent: writing the same key twice is a no-op. Backfills,
  retries, and re-syncs are therefore always safe.
- Totals (XP, level, badges) are pure folds over the ledger, never stored.
- Content rotation (daily quests) is seeded by the date string, so every
  device computes the same quests offline: no server needed today, and a
  trivially verifiable contract when one exists.

This is exactly the shape a future backend wants. Friend leaderboards become:
upload this week's ledger rows (or a signed weekly score derived from them),
server folds and ranks. Nothing about local play has to change.

## Future iOS app: two sanctioned paths

1. **Capacitor wrapper (weeks, not months).** The current code runs unchanged in
   a WKWebView shell. Wins immediately: App Store presence, real HealthKit
   plugin (replacing the Shortcuts bridge), push notifications, StoreKit.
   The IndexedDB adapter keeps working; a later migration to SQLite is one
   adapter swap behind `js/db.js`'s six functions.
2. **SwiftUI rewrite (when justified).** Reimplement UI natively; port game
   core 1:1 (it is dependency-free logic); reuse the data files and the event
   ledger schema verbatim. Export/import JSON is the migration bridge for
   existing users.

## Cosmetics pipeline (Cam's art)

`scripts/build-cosmetics.py` scans the layer library, resizes to 640 px,
assigns deterministic rarities/names, and writes `data/boneheadz.js`.
Item ids are the source filenames, so re-running with final art keeps every
player's inventory valid. Slots and z-order live in one table in the script.

## Non-negotiables

- IndexedDB upgrades are strictly additive; the e2e `migrate` stage proves
  old data survives every schema bump.
- Rewards only ever reinforce logging honestly, hitting protein, and staying
  in range. Nothing may reward eating less than the healthy floor.
- No accounts, no tracking. If a server appears for leaderboards, it gets
  opt-in event uploads and nothing else.
