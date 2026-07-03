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

## Roadmap features and their platform requirements

- **"Rare spawn near you" push notifications.** Web push works on iOS 16.4+ for
  installed home-screen apps but requires a push server (subscription storage +
  APNs web push sends). Because spawns are deterministic from (date, grid cell),
  the server never needs live location: a user opts in with a coarse home cell
  and the server can compute "a rare spawned in your area today" on its own.
  Ships naturally alongside the leaderboard server or the Capacitor wrapper
  (native local notifications need no server at all).
- **Talent trees.** Spend a talent point per level across branches like Hunter
  (+radar range, +egg odds), Chef (+coins from food quests), and Sage (+xp from
  protein days). Pure data + one kv key (`talents`); perks apply as multipliers
  inside game core functions. No schema migration needed beyond additive kv.
- **Monster battles.** Roam encounters seeded exactly like Boneyard spawns
  (deterministic per date + cell), turn-based, with fighter stats derived from
  real behavior: STR = protein adherence, STA = streak, AGI = steps. Rewards
  reuse the crate system. Requires nothing new from the platform; it is a pure
  game-core module plus UI.

## Art inventory (beyond the wardrobe)

- `assets/brand/`: wordmark + skull logo (splash, onboarding), sword map marker
  (rare spawns), tombstone + tomb gate (hero-scene decor now, "Haunt" items later),
  and Cam's illustrated quest map (parked for the steps-journey feature).
- **SOL library** (bust-style portraits, 270 layers, held in Downloads): different
  anatomy from the full-body set, so it must NOT merge into the wardrobe. Best
  future uses: player profile portraits, friend avatars, or battle opponents.
- **Haunts (planned).** The user's idea: customize the scene behind your Bonehead
  (house / castle / graveyard) with dedicated loot. v1 already ships the BG slot
  rendered as the hero backdrop; Haunts extends it with scene-level items and
  yard-decor slots (tombstones, gates, props layered at fixed anchor points).
  Pure data + one new slot family in the manifest; no migration needed.

## Non-negotiables

- IndexedDB upgrades are strictly additive; the e2e `migrate` stage proves
  old data survives every schema bump.
- Rewards only ever reinforce logging honestly, hitting protein, and staying
  in range. Nothing may reward eating less than the healthy floor.
- No accounts, no tracking. If a server appears for leaderboards, it gets
  opt-in event uploads and nothing else.
