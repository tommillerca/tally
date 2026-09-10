# Studio v3 advisory implementation report

Implemented in this checkout. This report is input to independent review, not release authorization. Interaction feel is unproven and operator-owned.

The frozen plan file matched SHA256 `26540c85e60503ff370f00cc3da20a03b9c3a0cb5cdf1cb6771327269d89152c`. The plan's `tally/docs/brand/` resolved to this checkout's `docs/brand/`. The v553/v554 claims, complete Studio screen source and brand deck were read before implementation.

## Files changed

| File | Change |
| --- | --- |
| `js/studio-screen.js` | Canvas pointer editing, two-pointer scale/rotation, silhouette hit detection, selected-sticker Flip, drag-to-bin deletion, cancellation/capture cleanup, keyboard routes and secondary accessible controls. One tap places and closes the tray. Full sticker thumbnails use the compositor's artwork and outline. Old outfit-preset draft stickers reopen as Crew art. |
| `js/studio.js` | Four real creatures, shared sticker figure preparation, explicit nearest-neighbour RGBA sampling for rotation, alpha dilation and hard shadow, transformed safe bounds, reusable base/art/information surfaces for live painting. |
| `app.css` | Sticker grid, live canvas, selection/Flip/bin styling and canvas focus. The collapsed tray sits in page flow; the open tray is a drawer. |
| `js/changelog.js` | Three real player-facing entries in `NEXT_CHANGES`. No build number assigned. |
| `docs/CLAIMS.md` | Replaced the stale round 2 `vNEXT` section with current notes, one PROOF row per note, reach and limitations. Historical round 2 evidence remains in its review directory. |
| `tests/studio-v3-audit.mjs` | New PURE audit: actual production handlers on Canvas-backed element doubles, decoded pixels, brute-force dilation oracle, rotation palette survey, frozen-source red mode and export parity. |
| `tests/studio-audit.mjs` | Retained compositor/entry/privacy/save proofs. Rotation validation now rejects nonfinite values instead of valid 15-degree rotation. Palette and mirror checks isolate artwork from the new decoration. Canvas-backed UI doubles support the live painter. |
| `tests/release-gate.mjs` | Registered `studio-v3-audit.mjs` once in PURE. |
| `docs/reviews/studio-v3/` | This report, frozen input sources, red/green proof logs, PURE results and runner, coverage/detector findings, raster examples and compressed per-suite logs. |

No changes to `assets/**`, inventory/state writers, the Wardrobe `.fit-chip` entry, `js/app.js`, or `native/ASC-SUBMISSION.md`.

## Proof results

```text
node tests/unit.test.js
385 passed, 0 failed
exit 0

node tests/studio-v3-audit.mjs
5 passed, 0 failed. Interaction feel is unproven and operator-owned.
exit 0

STUDIO_V3_BASELINE=1 node tests/studio-v3-audit.mjs
1 passed, 4 failed. Interaction feel is unproven and operator-owned.
exit 1, expected RED

Full PURE tier
166/166 PURE green

node tests/release-gate.mjs --coverage-only
coverage: 425 audits on disk, 129 fast, 130 full, 166 skipped
exit 0
```

The coverage command's `166 skipped` describes its tier classification, not execution omissions. Every one of those 166 PURE entries was executed directly with Node by `run-pure.cjs`, without starting a server.

The initial full run was 165/166. `guard-hygiene-lint.mjs` rejected the new audit's optional checkout image writes and missing CONTROL label. The audit now uses `auditOutputPath` to validate temporary image destinations, and its independent disk oracle is explicitly labelled CONTROL. No guard threshold or exemption changed. After the final safe-size fix, the hygiene guard, unit command and both Studio audits were rerun and all exited 0. `pure-initial.*` retain the first results; `pure-summary.json`, `pure-proof.txt` and `final-rechecks.txt` record the final results. `pure-logs.tar.gz` includes every suite's output and the initial hygiene failure.

The full new audit is red against both frozen input sources, not against an invented implementation. Their hashes are asserted in the audit:

- Compositor: `0dc76c4ca87b00a423d94f0e76a8435377403ab709370a8a6d5d33b34046567a`.
- Screen: `78a177980e8f1824384ca8ddbb77f403e8b3711230d43230f1ed8cddb4a202c8`.

The red run rejects the old creature list, absent dilation/rasterizer and missing capture/keyboard gesture contract. Its unchanged-export control passes. The initial creature guard was also run red before either production source was edited.

The handler proof observes stored movement and changed live pixels before pointerup, without another asynchronous composition. Pinch maps 400 to 600px, twist maps 0 to 90 degrees, and lifting one pointer rebases the remaining drag. The final decoded export equals the live pixels. It also drives pointer cancellation, lost capture, empty-canvas deselection, bin deletion, keyboard selection/flip/rotation/resize/move/delete, and one-tap tray closure. These are Node event-handler invocations, not a browser's gesture recognition.

## Decoded geometry and contrast

Fixture: the existing audit's default slot outfit and shiny base C1 pet, plain cream backdrop, default caption and mark, no stickers. All figures use real on-disk art. The controlled final export is byte-identical, after PNG decoding, to the frozen input compositor's export.

| Measure | Operator v554/v553 record | Controlled input | Controlled final |
| --- | ---: | ---: | ---: |
| Safe-area ink, final export | 44.5% | 45.09300% | 45.09300% |
| Largest 8-connected component box / safe area | 86.3% | 76.30667% | 76.30667% |
| Minimum opaque-letter contrast | 12.40:1 | 12.63781:1 | 12.63781:1 |
| Warm-ink backing against plain page | 7.58:1 | 12.17158:1 | 12.17158:1 |
| Pixels outside safe rectangle | 0 | 0 | 0 |
| Pet ground minus figure feet | merged contact | 0px | 0px |

Safe bounds remain x 65 to 1015, y 270 to 1540, with right/bottom exclusive. Final-export ink counts pixels whose decoded RGB differs from the plain `243,239,231` page. Connected components use that same mask. The separately decoded figure/pet union uses alpha greater than 14: 36.69308% ink, bounds x 65 to 1009, y 340 to 1459 inclusive. Pet ground and feet both resolve to y 1460. Body/pet pixels remain identical to the frozen v553 fixture as well.

The existing Studio audit also remeasures opaque wordmark contrast over all 69 backdrop/placement pairs: 12.63781:1 minimum, above the 4.5:1 floor. Antialiased nonzero-alpha edges still reach 1.01402:1; they are reported separately, never graded as opaque cores.

Decoded final-export RGBA SHA256: `d7f8895c6fd5b7df8c7dd7179c75cc4e2cc24a73fc26630b2a20e2736e25ddd9`. See `fixture-export.png`, `studio-v3-audit.txt` and `studio-audit.txt`.

## Sticker treatment and rotation cost

Every placed kind uses the same 12-export-pixel disk dilation of nonzero transformed artwork alpha. The outline is warm ink `#2A2D28`; the shadow is a hard copy offset 8px right and 10px down. There is no blur, tint, nonuniform scale, rectangular backing, or on-disk art edit. Text now uses the letters' silhouette rather than a card.

The independent brute-force distance oracle checks every dilation pixel on a concave fixture. Decoded art/decoration bounds establish a 12px top/left outline and 20px/22px right/bottom extent including shadow at both offered size endpoints, 180 and 650px, across every creature, representative Crew art and all three text stickers. `outline-sizes.png` shows both sizes; `rotation-survey.png` shows each kind's measured worst integer angle.

| Sticker | Source visible RGBA colours | 180px at 0 degrees | Lowest count in integer-angle survey | Angle |
| --- | ---: | ---: | ---: | ---: |
| The Wanderer | 4,129 | 1,405 | 1,349 | 26 degrees |
| The Mimic | 1,024 | 332 | 332 | 0 degrees |
| The Glutton | 5,448 | 2,305 | 2,233 | 70 degrees |
| Gwart | 9,012 | 1,597 | 1,597 | 0 degrees |
| Crew fixture | 22,979 | 3,780 | 3,672 | 14 degrees |
| BONEHEADZ GYM. | 184 | 164 | 157 | 3 degrees |
| FEED THE BONES. | 181 | 165 | 156 | 59 degrees |
| I LIVE HERE NOW. | 182 | 162 | 157 | 36 degrees |

The survey covers every integer angle from 0 through 89 degrees. Endpoint, worst-angle and 137.5-degree samples are PNG-encoded/decoded at both sizes and both mirror states. Counts grade alpha greater than 14. Every sampled artwork palette is a subset of its source palette. Sampling copies source RGBA directly, avoiding Canvas backend edge interpolation when rotating.

The largest additional creature/Crew colour reduction from twisting, compared with its same-size unrotated image, is 3.99% for the Wanderer. Size reduction itself removes much more source texture. The inspected raster examples retain hard edges, with no interpolated colour mush. This is not proof of subjective art quality on a phone, nor an exhaustive search over every real-valued angle. Arbitrary rotation remains implemented; quarter-turn snapping is the proposed fallback if the operator finds the measured texture loss unacceptable.

## Deviations, blockers and proposals

1. **Missing operator fixture.** Its equipped snapshot and export were not supplied. The displayed operator values cannot honestly be remeasured here. Proposed substitute: the controlled decoded measurements above, with exact before/after pixel parity. The numerical differences between the columns are fixture differences, not measured regressions or improvements. No figure shrink or mark-placement change was made.
2. **Decoration versus palette.** A new warm-ink outline and page blending cannot literally remain within every source PNG's palette. Proposed interpretation: preserve the transformed artwork palette, and grade generated outline/shadow separately. That distinction was disclosed before implementation. The final flattened image necessarily contains decoration and alpha-blended colours.
3. **Rotated size boundary.** A square with a 650px unrotated side needs 952px including the chosen border/shadow at 45 degrees, exceeding the 950px safe width. Implemented proposed deviation: uniformly cap only an overflowing transform to the available safe envelope. The worst square case becomes 649.124025px, a 0.875975px (0.135%) reduction. Stored size is synchronized with the fitted size. A synthetic square guard proves the resulting width is exactly 950px. The named creature and representative Crew endpoints still accept 650px in the surveyed poses.
4. **Additional creatures.** Propose the existing Mage and Wretched Goblin as a later expansion if Tom wants a larger tray. Neither is included. Gwart uses the one shipped static pose.
5. **Browser/device proof.** The work order states that socket binding is unavailable and prohibits browser proof here. No browser or server was attempted. Drag latency, frame rate, touch recognition, reach, overlay hit-testing, rendered prominence, native Photos/picker behavior and screen-reader behavior remain unproven and operator-owned. Node can prove handler wiring/state/pixels, not how the interface feels.
6. **Tool/test failures.** No automatic approval rejection or permission denial occurred. The design detector exited 2 with findings: the two existing preview images have runtime-assigned sources, and other findings concern existing shared CSS. Preview images remain hidden or in a closed dialog until a decoded image is assigned. Detector findings are recorded, not treated as browser verification. The initial hygiene failure and its correction are recorded above.

No commit, push, PR, merge, publish, deployment, production D1 write, secret change or remote Wrangler write was attempted. No original checkout was edited. Independent review and operator interaction testing remain required.
