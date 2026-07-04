# Boneheadz Gym (Tally)

A gamified, private calorie and macro tracker you install from the browser. Feed the bones: scan, log, earn loot, and level up a skeleton dressed in art by Cam Miller. Built to make daily logging so quick you actually do it.

**Live app:** https://tommillerca.github.io/tally/
**Try with sample data:** https://tommillerca.github.io/tally/?demo=1

## Install on iPhone

1. Open the live link in Safari
2. Tap Share, then "Add to Home Screen"
3. Launch Tally from the home screen (full-screen, works offline)

## What it does

- **Barcode scanning** with the camera (EAN/UPC). Products resolve via Open Food Facts, with USDA branded data as fallback. Scanned foods are cached on-device, so repeat scans are instant and offline.
- **Nutrition label camera.** Photograph any Nutrition Facts panel (US or Canadian bilingual). OCR runs entirely on-device (tesseract.js); parsed values land in an editable form. Foods created this way remember their barcode.
- **220+ built-in staples** with real serving sizes search instantly, no network.
- **Online text search** of USDA FoodData Central (branded + generic). Works out of the box on the shared demo key; add a free personal key in Settings for 1,000 searches/hour.
- **Plan targets**: Mifflin-St Jeor TDEE, goal presets (lose fat, slow cut, recomp, maintain, lean bulk), protein set by bodyweight, all editable.
- **Frictionless logging**: recents, favorites, copy-yesterday, quick add, per-meal totals, streaks, portion stepper with live macro preview.
- **Trends**: smoothed weight trend with weekly rate, 14-day calorie chart vs target, 7-day protein adherence.
- **Gamified**: XP for every log, 20 levels (Rookie Logger to Tally Grandmaster), 15 badges, streak flames with milestone celebrations, confetti on adds, animated rings and count-ups. Existing history is retroactively credited on first launch.
- **The Pit (combat)**: turn-based skeleton duels where your fighter is a live mirror of your habits: protein feeds Power, streaks feed Marrow (HP), steps feed Wind (stamina), Boneyard play feeds Reflex, quests feed Hype. Two ranges, telegraphed haymakers, a block/dodge counter layer, Wind economy, and an earned Signature finisher. Sparring, a 5-rung ladder, and a Champion who drops the Bonecrusher (a weapon that multiplies effort, never replaces it). Engine is a pure module verified against the combat spec's worked examples, with simulation tests proving 5-7 turn pacing and that effort beats gear.
- **The Bone Road (steps journey)**: your lifetime Apple Health steps walk your Bonehead down Cam's illustrated quest map. Seven stops per lap with escalating chest rewards; finish the road and it loops to the next lap. Pure derivation from synced steps, nothing new stored.
- **Haunts v1 (yard decor)**: an equippable Yard slot rendered into the home scene. Haunted Tombstone and Tomb Gate drop from crates; full scene customization (house/castle/graveyard) is the designed next step.
- **The Boneyard (GPS hunt)**: a Pokemon-Go-style radar. Deterministic daily spawns appear around your neighborhood grid cell: bone caches (XP), coin piles, buried crates, and occasional RARE spawns. Walk within 45 m and collect. Location is processed on-device only, never stored or uploaded.
- **Trainer-style home screen**: a full-bleed hero scene of your Bonehead idling in front of its equipped backdrop (tombstone in the yard, naturally), with level, XP progress, next-unlock teaser, and Hunt/Wardrobe/Crates/Progress shortcuts. Brand splash uses Cam's real wordmark and logo.
- **Boneheadz RPG layer**: your skeleton avatar (art by Cam Miller) lives on the Today screen and wears loot you earn. 258 cosmetics across 15 slots with rarity tiers, loot crates from quests/day-closes/level-ups/10k-step days, coins with duplicate conversion and a small shop, XP Boost consumables, and Streak Freezes that auto-save a missed day. Three seeded daily quests plus a weekly protein challenge.
- **Apple Health bridge, one tap**: the app ships a pre-built, signed companion shortcut (Get the shortcut → Add → done). It sums today's steps and active calories from Health to the clipboard; Boneheadz ingests on Sync. Built and signed by `scripts/build-shortcut.py` via `shortcuts sign --mode anyone`. Steps feed the activity card, step eggs, and the Bone Road.
- **Private by design**: all data in IndexedDB on your device. Export/import JSON backups any time. No accounts, no tracking, no server. The app requests persistent storage and reminds you to back up every couple of weeks.

## Data safety

Database upgrades are strictly additive (create-if-missing) and covered by a migration test that seeds a v1 database with real entries, boots the new code, and asserts every row survives. Your log is never touched by app updates.

## Architecture

Static PWA, no build step. Vanilla ES modules, hand-rolled CSS, service worker precaches the shell for offline use.

- `js/nutrition.js` targets + portion math (pure, unit-tested)
- `js/labelparse.js` OCR text to nutrition fields, OCR-noise tolerant (pure, unit-tested)
- `js/sources.js` Open Food Facts + USDA FDC mappers (tested on live API fixtures)
- `js/scanner.js` getUserMedia + zbar-wasm live decode
- `js/ocr.js` tesseract.js v5 wrapper, assets self-hosted in `vendor/`
- `js/app.js` screens, sheets, flows
- `data/generic-foods.js` curated food database

## Tests

```
node tests/unit.test.js       # 41 unit tests: math, parser, mappers, game math, quests, loot data, food DB integrity
```

E2E (puppeteer + real Chrome, iPhone viewport): 40 assertions covering onboarding, search, portioning, persistence, barcode scan via fake camera video, label OCR through the UI, v1-to-current data migration, XP/badge celebrations, Apple Health ingest (URL + clipboard), and the RPG loop (avatar compositing, crate opening, wardrobe equip). Screenshots reviewed before every deploy. See ARCHITECTURE.md for the native-iOS porting plan.

## Data sources

- [Open Food Facts](https://world.openfoodfacts.org) (ODbL)
- [USDA FoodData Central](https://fdc.nal.usda.gov) (public domain)

Libraries: [@undecaf/zbar-wasm](https://github.com/undecaf/zbar-wasm) (LGPL), [tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0). Display font: [Bangers](https://fonts.google.com/specimen/Bangers) (OFL). Character art: Cam Miller (placeholder library).
