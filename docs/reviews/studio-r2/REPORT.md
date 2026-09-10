# Studio round 2 advisory report

Frozen plan SHA256 verified: `bd934653189c6e3fdf7862b14dd6c228a362aca33a9f717237f0b1684cf81057`.
All source paths were resolved in this checkout. The plan's `tally/docs/brand/` resolves to `docs/brand/` here. The v553 release record was read before changes.

The wordmark now has a warm-ink `#2A2D28` backing, cream rim and hard offset shadow. Its original PNG pixels are uniformly scaled, without recolouring. Placement searches all integer-pixel safe positions, choosing least artwork overlap before proximity to the requested preset. Bubble scoring uses its painted alpha mask, including the tail and shadow at alpha >14. Mark clearance includes its complete backing/shadow envelope. The tail faces the measured skull. Stickers draw before information so they cannot cover the mark.

**Files changed**

- `js/studio.js`: compositing, occupancy search, bubble mask, contrast guard.
- `tests/studio-audit.mjs`: frozen-baseline red control, decoded contrast matrix, decoded overlap, connected-component metrics and baseline pixel parity. Existing art/palette, entry, privacy and save checks remain.
- `js/changelog.js`: comments in `NEXT_CHANGES` only.
- `docs/CLAIMS.md`: pending `vNEXT` record.
- `docs/reviews/studio-r2/`: this report, `v553-compositor.txt`, `studio-audit.txt`, `unit-proof.txt`, `pure-proof.txt`, `pure-summary.json`, `run-pure.cjs`, and `pure-logs.tar.gz`.

**Contrast for every placement x backdrop**

Ratios below are minimum opaque-letter contrast, measured from the decoded final PNG against the pixels captured immediately before the mark draw. All current pairs also have an all-nonzero-alpha minimum of **1.01402:1**. Source-alpha 255 identifies letter cores; edges are reported separately, never rounded into a pass.

| Backdrop | Top | Bottom | Right |
|---|---:|---:|---:|
| Plain cream | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG1 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG10 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG2-1 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG2-2 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG2-3 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG3-1 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG3-2 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG3-3 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG4-1 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG4-2 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG4-3 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG5-1 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG5-2 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG5-3 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG6-1 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG6-2 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG6-3 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG7-1 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG7-2 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG7-3 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG8 | 12.63781:1 | 12.63781:1 | 12.63781:1 |
| BG9 | 12.63781:1 | 12.63781:1 | 12.63781:1 |

The frozen v553 source is SHA256 `2cc1a56aa345eeae3f2f0c6f88b84449f99e7edcd6c40093650e557c89f5ac6d`. The same guard applied to its real output is RED: opaque cores **1.03831:1**, all nonzero-alpha pixels **1.00:1**. The audit asserts both the original source hash and the expected rejection; it does not simulate the defect with a flat colour swatch.

**Resolved placements and artwork overlap**

Fixture: the existing audit's default slot outfit, shiny base C1 pet, and `BONE-ABCD-EFGH`. This table uses the longer `personality` caption and includes the friend code. Coordinates are export pixels, expressed as `(x, y, width, height)`. Bubble bounds enclose its painted mask; brand bounds include backing and shadow. Every row independently decodes the bubble/wordmark layers and compares alpha >14 against the decoded figure/pet union.

| Bubble preference | Mark preference | Bubble bounds | Mark envelope | Bubble overlap | Mark overlap |
|---|---|---|---|---:|---:|
| left | top | (66, 277, 406, 209) | (611, 273, 372, 127) | 0px / 0% | 0px / 0% |
| left | bottom | (66, 277, 406, 209) | (643, 330, 372, 127) | 0px / 0% | 0px / 0% |
| left | right | (66, 277, 406, 209) | (643, 330, 372, 127) | 0px / 0% | 0px / 0% |
| right | top | (609, 319, 406, 209) | (77, 273, 372, 127) | 0px / 0% | 0px / 0% |
| right | bottom | (609, 319, 406, 209) | (68, 291, 372, 127) | 0px / 0% | 0px / 0% |
| right | right | (609, 319, 406, 209) | (73, 288, 372, 127) | 0px / 0% | 0px / 0% |

With the default `notes` caption, left resolves to `(66, 334, 390, 158)`. Mark top resolves to `(611, 273, 372, 127)`; bottom and right resolve to `(643, 330, 372, 127)`. All have zero artwork overlap. The requested locations are preferences, so bottom can resolve near the top when that is clear. Some presets may converge on the same position.

**Round 1 preservation**

| Measure | This fixture, frozen v553 | This fixture, current |
|---|---:|---:|
| Safe-area ink, figure/pet union | 36.69308% | 36.69308% |
| Largest 8-connected component bounding box / safe area | 76.30667% | 76.30667% |
| Pet ground contact minus figure feet | 0px | 0px |
| Union ink bounds, inclusive | x 65..1009, y 340..1459 | x 65..1009, y 340..1459 |
| Figure size reduction | n/a | 0% |
| All measured art and information inside STUDIO_SAFE | yes | yes |

The decoded figure/pet union is byte-for-byte identical to the frozen compositor, before information overlays. The operator's separate export measured 39.0% ink and an 86.3% connected box. Its input/export is not attached, and this audit fixture does not reproduce those numbers or the merged figure/pet component. Therefore exact preservation of that operator fixture is not certified. No figure shrink was introduced. The mark instead uses the existing 340px width when the 480px option overlaps art and 340px fits clear, a 29.17% linear reduction for top/bottom on this fixture. The trade preserves figure scale and buys measured clearance plus contrast; rendered prominence remains the operator's assessment.

**Proof**

`node tests/unit.test.js`: **exit 0**, `385 passed, 0 failed`.
Full PURE tier: **exit 0**, `165/165 PURE green`.
`node tests/studio-audit.mjs`: **exit 0**, 69 contrast pairs, six zero-overlap placement combinations, decoded baseline pixel parity, and the v553 red control.
`git diff --check`: **exit 0**.
Complete output is recorded in `unit-proof.txt`, `studio-audit.txt`, `pure-proof.txt`, `pure-summary.json`, and the compressed per-suite logs.
The agreed command is `node tests/unit.test.js`. The complete PURE list is executed by `node docs/reviews/studio-r2/run-pure.cjs`, extracted from `tests/release-gate.mjs`, without starting its browser server. This is the full PURE tier, not the browser/full release gate. `studio-audit.mjs` was already registered in PURE and was extended in place.

**Denied/blocked actions and proposed deviations**

- A diagnostic `ps -axo pid,etime,command` was denied with `operation not permitted`. Session completion tools were used instead. No elevation was requested.
- A literal 4.5:1 floor at every nonzero-alpha edge pixel is not met. Preserved low-alpha source edges approach the backing colour as coverage approaches zero. Proposed deviation: apply 4.5:1 to opaque letter cores while reporting the all-pixel minimum. This qualification is pending independent review, not presented as literal compliance.
- Exact reproduction of the operator's 39.0%/86.3% export is blocked by the missing operator fixture/export. Proposed substitute: report the existing audit fixture's numbers and assert decoded baseline pixel parity. The difference remains visible above.
- Presets may relocate and use the existing compact mark width for clearance. Bubble-tail attachment to the skull, browser appearance, rendered prominence and touch reach remain unproven. The painted bubble shape is retained and its tail faces the skull, but a new physical attachment measurement is not claimed.
- No socket was bound, browser rendered, screenshot taken, commit made, push performed, PR opened, deployment performed, production data written, secret set, or publication attempted. `assets/**`, `native/ASC-SUBMISSION.md`, inventory/state logic and the Wardrobe entry were not edited. Studio remains unlisted; no build number was assigned.
