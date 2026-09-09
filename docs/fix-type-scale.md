# Fix type scale: advisory implementation report

Frozen plan SHA256: `b7bb4bc3d5ba60923c2d9daf8d67118fb29617fd814b106e05b74f8a67277daa`.
The supplied plan file matched. All edits are in this checkout. No original checkout was edited.

The shared ramp, application CSS and injected text styles are migrated. Source guards pass. **Full visual review across every screen is owed and is the real gate.** No rendering was performed, and this report makes no claim that the result looks right or that every visible element scales.

## Measured source census and red proof

| Measure | Before | After |
| --- | ---: | ---: |
| Eligible CSS/inline/injected type declarations following relative size | 253 / 974 (25.98%) | 974 / 974 (100%) |
| Main stylesheet font-size declarations | 899 | 900 |
| Main stylesheet px font-size declarations | 680 | 5 |
| Main stylesheet named-ramp font-size consumers | 147 | 885 |
| Main stylesheet direct rem font-size declarations | 64 | 1 |
| Main stylesheet px font shorthands | 1 | 0 |
| Explicit fixed glyph exceptions across scanned sources | 10 | 10 |

The extra font-size declaration is the `html { font-size: 100% }` fallback. Its Dynamic Type shorthand is excluded from the source ratio, as are the ten decorative exceptions. The body remains `1rem`. The two talk-box expressions, parent-relative `em` sizes and inherited values remain relative.

These are measured **source declaration counts**, including overridden declarations. They are not DOM element counts, and inheritance assumes a scalable ancestor. The scanner covers `app.css`, `index.html` and every top-level `js/*.js`. It does not evaluate the cascade, runtime-created values, SVG coordinate attributes, assets, or standalone pages outside the application shell.

[Before](fix-type-scale-proof/before.json) identifies the original stylesheet SHA256 and every failing type site. [After](fix-type-scale-proof/after.json) identifies the final stylesheet SHA256 and the retained glyph sites. The original stylesheet matches the plan's 680 / 899 count.

The new 100% source floor was run against the unchanged production sources before conversion. It exited 1:

```text
SOURCE CENSUS 253/974 (25.98%); fixed glyphs 10
AssertionError: scaling floor: 253/974 (25.98%) < 100%
```

[Full red output](fix-type-scale-proof/red.txt). This was an actual pre-conversion failure, not a reconstructed baseline. The original census initially failed on an unclassified `text-underline-offset`; that property is now classified as spacing.

The source floor history rises from 95% to 100%. The guard rejects a lower final floor, a descending history, unresolved aliases, px text, viewport-capped text, and new sizes that bypass the named ramp. Every new eligible declaration must scale, so adding passing declarations cannot hide one new fixed declaration. Tests include CSS, shorthand, injected style and inline regressions, plus the Dynamic Type root and fixed-art controls.

## Ramp and system setting

The original eight names remain. Seven supplementary steps cover the small-label, body and large-display clusters. At a 16px root:

| Token | rem | Reference px |
| --- | ---: | ---: |
| --fs-micro | .5625 | 9 |
| --fs-tiny | .625 | 10 |
| --fs-0 | .6875 | 11 |
| --fs-1 | .75 | 12 |
| --fs-2 | .8125 | 13 |
| --fs-3 | .9375 | 15 |
| --fs-body | 1 | 16 |
| --fs-4 | 1.0625 | 17 |
| --fs-5 | 1.3125 | 21 |
| --fs-title | 1.5 | 24 |
| --fs-6 | 1.75 | 28 |
| --fs-display | 2 | 32 |
| --fs-7 | 2.5 | 40 |
| --fs-hero | 3 | 48 |
| --fs-jumbo | 4 | 64 |

The measured common legacy sizes were 12px (76), 11px (59), 13px (54), 12.5px (47), 15px (41), 10px (38), 14px (37), 11.5px (35), 10.5px (29) and 13.5px (28). Legacy literal sizes map to the nearest ramp step, ties upward. Existing rem consumers also use the ramp. This intentionally consolidates fractional sizes instead of creating one token per old value. Existing scoped `.pet-a11y` token definitions and the four specialist talk-box sizes remain intact.

[Migration ledger](fix-type-scale-proof/migration.json): 793 converted source occurrences, 747 in app.css and 46 in JavaScript. Source line numbers identify the original files. Root additions and layout overrides are recorded separately.

`html` uses the user default 100% fallback followed by `font: -apple-system-body`. That shorthand connects WebKit text to iOS Dynamic Type; body typography still sets the application's font family. Rem alone does not establish that connection. See the [WebKit accessibility discussion](https://bugs.webkit.org/show_bug.cgi?id=187013). The 16px values above are arithmetic reference sizes, not a device measurement. Apple's body style can have a different default root, commonly 17px, which can also enlarge default text. Device behavior and preference changes while the app is open remain unverified.

## Containers adjusted and remaining risks

These are source mitigations, not verified fits. No sprite, image, SVG viewport, wheel radius, Paddock packing coordinate, or carousel art dimension was resized.

| Container or text surface | Risk and handling |
| --- | --- |
| `.btn`, `.gi-actions .btn`, `.pdk-btn` | Long action labels: wrap text and flex content, allow shrinkage, break long words. |
| `.sheet-head h2` | Single-line clipped sheet headings: normal wrapping and visible overflow. |
| `.tab` | 62px navigation labels: permit word breaking within the existing width; tab bar remains in flow. |
| `.tab-badge`, `.q-badge` | Fixed 16px/18px badge heights: auto height with the original minimum. |
| `.stepper button` | Fixed 44x42 text controls: auto size with the original minimum dimensions and padding. |
| `.rk-or` | 14px fixed line and box: unitless 1.4 line-height, auto height, 14px minimum. |
| `.rk > b` | Shop names in a 28px, two-line clipped box: remove line clamp and fixed height, retain a two-line minimum in em. |
| Wardrobe and pet `.look-cost.dust` | 16px fixed line-height and the local rem override: unitless 1.6 line-height. Dust image dimensions remain fixed. |
| `.cf-chip`, `.cf-lv` | Opposite corner badges in a fixed carousel card: constrain each to its half and wrap. |
| `.cf-eq`, `.cf-n` | Bottom ribbon/count collision: wrap the ribbon and count, constrain the count width and derive its bottom clearance from the ribbon type token. Multi-line ribbon overlap still requires visual review. |
| Stable role, wallet, metadata rows and actions | Permit wrapping, shrinkable metadata columns and word breaking. Existing carousel art, track, frame and transforms stay fixed. |
| `#stableBody .stable-rooms` and room labels | Three narrow room columns: auto-fit columns with a 5.5rem minimum bounded by available width, wrapped names and details. Room art rows remain 54px; existing tile height is a minimum, so text can grow. |
| `.t3-cells`, `.t3-cell` | Narrow crate/item room tiles: auto-fit columns with an 8rem minimum bounded by available width, shrinkable cells and wrapped text. Fixed art blocks remain unchanged. |
| `.pdk-host` | Absolutely placed cards can grow outside the fixed 520px scene: maximum width inside the field, 398px maximum height and vertical scrolling with control padding. 398px equals 520 minus the 96px high anchor and 26px bottom clearance. |
| `.pdk-state` | Sprite-attached state labels: constrain to the sprite width and wrap. At very large text they can still cover art or neighboring labels. No packing or sprite geometry was changed. |
| `.pdk-head` copy, `.pdk-acts`, `.pdk-btn` | Shrink and wrap card copy, wrap action rows, give actions a 5rem basis. |
| `.pdk-coach` | Centered absolute coach mark: constrain width inside the field and wrap. |
| `.pdk-x-btn` | Fixed 30px close button with text: auto dimensions and 30px minima. Card/rail clipping of expanded controls remains a visual check. |
| Wheel `.dw-card` children, `.dw-prizes`, `.dw-cta` | Constrain text to card width, break long words, auto-fit the external prize legend with 8rem columns, wrap the CTA. Existing overlay already scrolls; wheel and icon geometry stay fixed. |

[Risk inventory](fix-type-scale-proof/layout-risks.json) records all 147 selectors flagged by a source scan for type combined with fixed sizes, clipping, no-wrap or absolute/fixed placement, plus nine SVG coordinate-text occurrences. These flags are **not 147 proven rendered defects or 147 resolved cases**. Every candidate remains in the visual review queue; the table above identifies the actual mitigations. The scan does not discover every ancestor or cross-selector interaction.

Specific residual risks include the Today hero overlays, combat HUD and floating damage, fixed score/ring centers, paper-doll labels, narrow Kennel cells, Hollow scene overlays, splash/intro text, multi-line carousel badges and enlarged Paddock status labels. Wrapping inside a fixed art scene cannot guarantee that text and art do not overlap. A proposed follow-up for confirmed collisions is an in-flow text caption or detail surface outside that scene, reviewed visually before adopting it. That redesign was not silently applied here.

## Deliberately retained fixed units

Only explicit `font-size` and `font` size values were mechanically converted. Width, height, positions, transforms, padding, borders, radii, shadows, backgrounds, masks and asset data were not part of that conversion. The scoped text-container overrides above are the separately reviewed source changes.

[Geometry proof](fix-type-scale-proof/geometry.json) compares all 14,371 original non-type declarations before and after, excluding the newly added text-layout override block and new ramp definitions. They are identical, with SHA256 `e3b75f2e3c30800511766752dc2692656572a4d54ccfceebe384dab7420e3536`. The artifact lists every added override. The wheel's explicit changes affect its text grid and wrapping only. Art assets and their fixed dimensions were not edited.

Every retained px-valued type exception:

| Source | Value | Reason |
| --- | --- | --- |
| app.css `.crate-shake` | 74px | Decorative crate glyph wrapper. |
| app.css `.hero-emoji` | 22px; 23px line-height | Decorative hero glyph geometry. |
| app.css `.vs-bone` | 44px | Fixed versus bone icon wrapper. |
| app.css landscape `.rl-skull` | 54px | Decorative rotate-device skull. |
| app.css `.pc-icon` | 96px | Icon-only portrait fallback wrapper. |
| js/app.js milestone icon wrapper | 44px | Contains the fixed spark/star artwork, not the milestone text. |
| js/hollow-scene.js steam spans | 16px and 14px | Animated decorative steam glyphs. |
| js/wheel.js `.dw-hub` | min(7vw,26px) | Skull glyph inside the fixed wheel hub. |
| js/wheel.js `.dw-result .ri` | 46px | Prize icon wrapper; readable result text uses the ramp. |

Nine `font-size` SVG attributes also remain in drawing units, not CSS px declarations: seven in js/app.js (chart day/axis/best/average labels and the Paddock sign), one in js/hollow-beds.js (bed sign), and one in js/hollow-scene.js (Hollow sign). Exact occurrences are in the risk inventory. **These include readable text and are a remaining coverage gap**, not decorative glyph exceptions. Converting labels inside unchanged SVG viewports can clip them; proposed follow-up is responsive HTML labels or separately reviewed SVG text layout. Their fixed coordinate attributes were preserved rather than claiming that they respond to system text size.

Other retained px groups are borders/hairlines, spacing, effects, fixed geometry and viewport breakpoints. They retain their existing jobs rather than becoming text-scaled art. The repeatable full inventory, including every retained px declaration, is available with:

```sh
node scripts/fontscale-census.mjs > /tmp/fontscale-current.json
```

## Rendered element guard and deviations

The plan cites historical v516 0/415 and v529 5/427 element measurements. Those figures were provided in the plan; they were not remeasured here. The existing checkout census is a stylesheet source inventory. A new actual before/after element census requires the rendering prohibited by this work order. **Actual element counts for this checkout remain unmeasured.** Substituting the separately labeled source census is a disclosed proof deviation, not evidence that every screen now passes.

The census now also accepts an independently collected element artifact and enforces a 95% floor, with a nondecreasing floor history:

```sh
node scripts/fontscale-census.mjs --elements /path/to/measured-elements.json
```

Artifact shape: an object with a nonempty `build` string and an `elements` array. Each entry has `screen`, `id`, `normalPx`, and `largePx`. Include at least 400 matched visible text elements from the same screen/state under normal and enlarged system settings, with unique screen/id pairs. Count an element as scaling when its measured font size grows by more than 5%. Invalid sizes, duplicate identities, undersized samples and a falling floor fail. Collection must cover every screen; the input validator cannot independently establish that coverage. Synthetic fixtures prove this validator red/green but are explicitly not application measurements.

Additional deviations and tradeoffs:

- Legacy fractional and intermediate values intentionally round to the shared 15-step ramp. Default appearance can change, including the larger minimum for formerly 6.8px text.
- Four viewport-capped readable headings (wheel quote, gate intro, grave rise, wanderer) use the nearest ramp step to their old upper bound. This removes their viewport-only sizing behavior so they can grow with text preferences, but can make narrow-screen headings substantially larger. Visual review may require breakpoint-selected ramp steps.
- SVG coordinate text remains unconverted as described above. This is an explicit unfinished portion of universal text-size coverage.
- Rendered overflow validation, actual element counts and native/PWA system-setting behavior remain blocked by the no-render constraint. None is claimed passed.

## Proof output and actions

Agreed command, exit 0:

```text
node tests/unit.test.js
378 passed, 0 failed
```

[Unit output](fix-type-scale-proof/unit.txt). The unit suite invokes the expanded font guard. [Guard output](fix-type-scale-proof/guard.txt) includes 974/974 source scaling, 34 rem-resolving token definitions, zero px type tokens, the original nine regression controls, six source regressions, two lowered floors, Dynamic Type, layout controls and synthetic element-input controls.

All entries from the final `PURE` list were executed directly, without starting the release gate's server or browser suites:

```text
PURE 136/136 exited 0; 0 failed
```

[Per-entry exits](fix-type-scale-proof/pure.txt). Reproduction driver: `node --input-type=module < docs/fix-type-scale-proof/pure-driver.txt`, from the checkout root. It derives the list from tests/release-gate.mjs and captures each suite's detailed output under `/tmp`.

The first PURE pass had three failures: missing esprima (exit 97), a dock model accepting only px, and a pet test accepting only literal rem. Dependencies were installed from the existing offline npm cache using `npm ci --offline --ignore-scripts --include=dev`. No package or lockfile changed. The two tests now resolve/check named tokens while retaining their geometry and accessibility assertions. The full final rerun passed all 136 entries. [Initial exits](fix-type-scale-proof/pure-initial.txt) remain available.

`git diff --check` passed. No commit, push, PR, publish, Worker deploy, remote Wrangler, production D1 write, secret change or rendering was attempted. `native/ASC-SUBMISSION.md` is untouched. No approval or sandbox denial occurred. The missing dependency was resolved; the prohibited rendering and resulting visual/element proof remain the only blocked verification actions.

## Files changed

Production:

- `app.css`: ramp, Dynamic Type root, type migration and text-container mitigations.
- `js/app.js`: inline application text consumes the ramp.
- `js/gateintro.js`, `js/graverise.js`, `js/wanderer.js`: injected intro text consumes the ramp.
- `js/wheel.js`: injected wheel text and external legend wrapping.

Census and tests:

- `scripts/fontscale-census.mjs`: source scaling report, element-input guard and underline-offset classification.
- `tests/lib/fontscale-census.mjs`: source reader, exact glyph exceptions, named-ramp rules and source/element ratchets.
- `tests/fontscale-audit.mjs`: full source guard, Dynamic Type and layout controls, regression fixtures.
- `tests/dock-line-audit.mjs`: resolve rem tokens at normal/doubled root size in the existing dock model.
- `tests/pet-a11y-audit.mjs`: accept and resolve named tokens in the existing pet text guard.
- `tests/unit.test.js`: require the expanded census and regression output.
- `tests/release-gate.mjs`: retain one PURE registration and describe its expanded coverage. The guard was already registered, so no duplicate entry was added.

Advisory evidence:

- `docs/fix-type-scale.md` (this report).
- `docs/fix-type-scale-proof/before.json`, `after.json`, `migration.json`, `geometry.json`, `layout-risks.json`.
- `docs/fix-type-scale-proof/red.txt`, `guard.txt`, `unit.txt`, `pure.txt`, `pure-initial.txt`, `pure-driver.txt`.

The dependency installation created ignored local `node_modules`; it is not a source change. This report is advisory for the independent reviewer. It does not clear the visual release gate.
