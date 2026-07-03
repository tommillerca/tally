# Tally

A fast, private calorie and macro tracker you install from the browser. Built to make daily logging so quick you actually do it.

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
- **Private by design**: all data in IndexedDB on your device. Export/import JSON backups any time. No accounts, no tracking, no server.

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
node tests/unit.test.js       # 28 unit tests: math, parser, mappers, food DB integrity
```

E2E (puppeteer + real Chrome, iPhone viewport): onboarding, search, portioning, persistence, barcode scan via fake camera video, label OCR through the UI. Screenshots reviewed before every deploy.

## Data sources

- [Open Food Facts](https://world.openfoodfacts.org) (ODbL)
- [USDA FoodData Central](https://fdc.nal.usda.gov) (public domain)

Libraries: [@undecaf/zbar-wasm](https://github.com/undecaf/zbar-wasm) (LGPL), [tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0).
