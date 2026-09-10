# Studio round 4 advisory review

Frozen work order SHA256: `2a2ba8d95a5a7c9dae152a9498c2a8ff71735d07ee03dfc288f7914a15d30f91`. Verified against the supplied plan file before editing. All source paths resolve within this checkout. The brand deck is `docs/brand/boneheadz-brand-deck.html`, with the plan's original `tally/` prefix removed.

## Changed files

- `js/studio.js`: high-quality smooth artwork sampling; deterministic ordered pet, body and sticker layers; one-step depth changes; deletion remapping; shared surfaces for live rendering and PNG export; information composited last.
- `js/studio-screen.js`: one artwork tray without sticker group headings or repeated visible names; Send back, Send forward and Flip beside the canvas when selected; quieter selection and ready status; keep the previous picture visible during sticker edits; smooth thumbnails.
- `app.css`: smooth Studio preview, thumbnail and clean-view display; quiet selection boundary and 44px selection actions; reduced-motion-aware press response. Pixel-icon CSS and all CSS preceding Studio are unchanged.
- `js/changelog.js`: three player-facing `NEXT_CHANGES` notes.
- `docs/CLAIMS.md`: `vNEXT` with one literal `PROOF: ... | REACH: ...` row per note and explicit limitations.
- `tests/studio-v4-audit.mjs`: new negative controls, decoded artwork coverage, actual layer occlusion, overlay priority, live/export equality, serialized draft order, removal remapping and CSS scope checks.
- `tests/studio-v3-audit.mjs`: retire artwork palette subsets and whole-export historical byte equality; retain decoded bounds, outline, interaction and v557 reachability guards; exercise actual depth buttons.
- `tests/studio-audit.mjs`: update draw interception for the layered compositor and high-quality sampling; replace obsolete palette and geometry parity assertions; retain independent decoded wordmark contrast, privacy, save, placement and transform validation.
- `tests/release-gate.mjs`: register the new audit in PURE.
- `docs/reviews/studio-v4/`: this report, frozen pre-edit sources with SHA256 manifest, executable PURE runner, proof logs, summaries and mechanical design-detector output.

## Proof

`node tests/unit.test.js`: exit 0, **385 passed, 0 failed**.
Full PURE tier: **167/167 green**, combining the complete initial enumeration with successful targeted reruns of failed or subsequently adjusted audits. The initial run is preserved, not overwritten into a claimed clean first pass. Studio v3: 7 passed, 0 failed, including both v557 reachability rows. Studio v4: 4 passed, 0 failed. Claim-evidence and guard-hygiene lints: clean. `git diff --check`: clean.

Command results are recorded in `proof-summary.txt`. Full command output is retained alongside this report; `pure-logs.tar.gz` contains the initial full-tier per-command logs.

The first complete PURE pass was 164/167. Failed rows were `guard-hygiene-lint.mjs`, `unit.test.js`, and `studio-audit.mjs`. The new audit needed its real diagonal control labelled CONTROL. The old Studio audit incorrectly included newly added full-scene copies in its bubble/mark interception, and required duplicated screenshot instructions in the ready-status message. Those assertions were corrected without removing the actual overlap, save or screenshot checks. Final reruns are recorded separately from the initial results.

`red-proof.txt` records the new guards rejecting the frozen pre-edit compositor and screen. The initial run occurred before implementation. The final guard was rerun against those same hash-checked sources. `green-proof.txt` records the current sources passing. No browser rendering is represented as Node proof.

## Decoded measurements

The controlled fixture is the repository's default full outfit from `BH_SLOTS` and `BH_ITEMS`, with shiny base C1 and default Studio options. It is the existing v3 fixture, not the operator's unavailable outfit. Measurements come from its decoded 1080x1920 PNG.

| Measurement | Current fixture |
| --- | ---: |
| Ink inside STUDIO_SAFE | 46.111728% |
| Largest connected-component box / safe area | 76.306672% |
| Largest component box | x 65, y 340, width 822, height 1120 |
| Largest component pixel count | 441,755 |
| Non-page pixels outside STUDIO_SAFE | 0 |
| Opaque wordmark-letter minimum contrast | 12.637813:1 |
| Wordmark backing against plain page | 12.171578:1 |
| Decoded RGBA SHA256 | `c380cac6a42c99d68ebb4cf0536efe836471b768d3cd8f1f5c98b29d7357d7ac` |

Ink is every decoded pixel whose RGB differs from the plain page `(243,239,231)`. Components use eight-neighbour connectivity. Safe bounds are x 65 to 1015 and y 270 to 1540, right and bottom exclusive. The independent legacy audit also intercepts the real wordmark draw and checks the decoded final PNG over all 69 backdrop/position pairs against the 4.5:1 opaque-letter floor. Partial-coverage letter edges can approach 1:1, as already disclosed in v554.

Anti-aliased boundary pixels are counted explicitly as fractional-alpha pixels with at least one fully transparent eight-neighbour pixel, including hole boundaries. Both source and output are measured with the same rule.

| Creature | Source AA boundary pixels | Decoded at 180px | Decoded at 650px |
| --- | ---: | ---: | ---: |
| The Wanderer | 7,899 | 1,348 | 8,496 |
| The Mimic | 7,767 | 1,090 | 6,940 |
| The Glutton | 2,039 | 840 | 3,337 |
| Gwart | 7,485 | 679 | 4,831 |

The broader coverage guard supplements those boundary counts. Artwork softness uses fractional alpha coverage: count all decoded pixels with `0 < alpha < 255`, including texture coverage as well as the outer silhouette. This explicitly defined instrument differs from the work order's unspecified edge-count method, so its source counts are not claimed to reproduce the order's table. Each artwork surface is encoded to a transparent PNG and decoded before counting. The final page is opaque, so alpha-edge counts cannot be taken directly from that flattened page. Decoration is excluded from the artwork measurement.

| Creature | Source partial-alpha pixels | Decoded at 180px | Decoded at 650px | Frozen nearest at 180px | Frozen nearest at 650px |
| --- | ---: | ---: | ---: | ---: | ---: |
| The Wanderer | 14,103 | 1,914 | 24,782 | 1,450 | 19,004 |
| The Mimic | 12,624 | 1,351 | 16,839 | 996 | 13,026 |
| The Glutton | 4,547 | 1,179 | 15,221 | 907 | 11,896 |
| Gwart | 12,745 | 790 | 10,757 | 645 | 8,468 |

Pixel counts naturally vary with output size. The guard requires at least 10% more fractional coverage than the frozen nearest-neighbour output at each endpoint. A hard, opaque diagonal independently requires new fractional coverage after scaling; the old inverse-map implementation fails it. This is an edge-softness guard, not a hue/chroma guarantee. Palette-subset assertions are retired because smooth resampling necessarily blends colours. Transform whitelists still reject tint, recolour and nonuniform scale. Artwork assets are untouched.

## Depth and interaction evidence

The default order is pet, body, then placed stickers. Send back and Send forward swap the selected sticker with one adjacent layer. Draft order is explicit and deterministic; deletion remaps sticker indices. New stickers append on top. Information remains outside that ordered scene stack and composites last.

The audit executes both actual depth-button handlers. Decoded overlapping opaque pixels prove that the figure covers a sticker sent behind it and the sticker covers the figure when brought forward. An independent composition of the returned surfaces matches the decoded PNG. Opaque information pixels remain above both arrangements. Live rendering matches export; a serialized/reconstructed draft renders identically. Existing drag, pinch, twist, cancellation, lost-capture, keyboard and bin-deletion checks pass on Canvas-backed element doubles.

The tray remains above `calc(80px + var(--sab))`; canvas `touch-action` remains `pan-y` unless selected. These are source/handler contracts. They do not prove mobile layout or gesture recognition.

## Deviations and unproven requirements

1. The original operator outfit/export is absent. Proposed proof substitution: explicitly labelled decoded Node fixture measurements rather than pretending to remeasure the historical 44.5%, 86.3%, 12.40:1 and 7.58:1 operator export.
2. Smooth staging changes the fixture pet's alpha-derived height from 346.132597 to 344.230769 export pixels, a 1.901828px (0.55%) difference. Proposed deviation: accept this sampling-derived bound change under a 1% geometry guard. The body sizing policy and pet foot grounding remain unchanged. Historical whole-image byte equality is incompatible with changing sampling.
3. The existing uniform cap for a 650px square rotated 45 degrees remains 649.124025px so its outline and shadow fit the safe width. This is inherited, not a newly introduced size reduction.
4. The edge-count methodology is explicit above. It measures both anti-aliased boundary pixels and broader partial coverage in decoded isolated artwork, not alpha edges in the opaque flattened page. The plan's source edge-count numbers are not reproducible without its original counting method.
5. No browser render, screenshot, device gesture, latency, native save, or judgement that the result feels classy or elegant is proven. These remain operator-owned. The mechanical design detector flagged the two intentionally hidden, asynchronously populated image elements and existing out-of-scope CSS. Hidden images acquire decoded sources before becoming visible; the dialog opens only after readiness.

## Denied, blocked and prohibited actions

No action was denied by a tool or automatic approval review. Local browser/socket proof was unavailable under the supplied work order and was not attempted. No commit, push, PR, merge, publication, deployment, production D1 write, secret write or remote Wrangler invocation occurred. `assets/**`, earned-player data, the Wardrobe Studio entry and `native/ASC-SUBMISSION.md` were not edited. No original checkout was edited.

This report is advisory. Independent provider review and operator visual/touch review remain required.
