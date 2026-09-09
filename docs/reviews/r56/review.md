# r56 playtest plan review

**Recommendation: revise the plan before dispatching build lanes.** The static-morph diagnosis is sound, but the sizing explanation is incomplete, the proposed animation work is not a blind generator extension, and the claim that C and D touch different files is false. Removing the Kennel's collection function would be a bad idea. Consolidating its entry point can make sense.

This is an advisory review of `docs/PLAN-r56-playtest.md` in this checkout. No application implementation was performed. The supplied work-order file's SHA256 matched `7eb35397ec1adc825538d5408744051e22305dedf777e7aea5a994d99af43520`.

## 1. Animation diagnosis: correct gate, incorrect shared-root-cause claim

`js/app.js:828-840` resolves `morphSrc` and explicitly skips `animatedPetHtml` whenever that path exists. `js/petanim.js:94` accepts only species and width, with fixed layer folders. `scripts/build-pet-morphs-v2.py:125` reads the flat species master and has no animation-layer output. Therefore non-base morphs of C1, C3 and C4 really do take the static path. Generating files alone will not change that: B must also pass the morph through the renderer and select the correct layer paths.

The plan says items 7 and 8 share a root cause. They do not. Poor palette separation causes item 7. The explicit renderer gate causes the missing animation in item 8. Neither fixing the palette nor merely exporting additional images changes that gate.

The width comment in `petanim.js:105` describes differing proportions between species, not an unscaled morph branch. `petSpriteHtml` computes `S2` once and supplies it to both branches. `petScale` in `app.js:454` deliberately uses the same species scale for both. Do not replace it with a different morph normalization based on that comment.

There is still a measurable geometry discrepancy. At the Stable card's requested 124 CSS pixels, C1 animation places its 186 by 183 art on a 222 by 219 stage: nominal art bounds are 103.89 by 102.22 CSS pixels. The static function uses `FILL = 0.82` and the fractional `PET_CROP` in `data/boneheadz.js:2314`. Its reference crop is 101.68 by 100.09, and the actual 186 by 183 alpha bounds inside that slightly padded reference calculate to approximately 100.62 by 98.99. This supports a roughly 3.2% smaller static image before animation phase, resampling and surface CSS are considered. These are source-derived calculations, not browser measurements.

Also correct the plan's dimensions: both C1 masters are **640 by 640 PNGs**. Their alpha bounding boxes are 186 by 183. Equal master geometry rules out a morph-specific canvas change; it does not make the static and layered paths geometrically identical.

**B3 needs a measurable contract.** The existing comment at `app.js:438-452` documents a different animated versus static lizard drawing/aspect ratio and a width-versus-height tradeoff. A uniform scale cannot make different aspect ratios match in both dimensions, nor can a still match every frame of a moving pet. Proposed deviation from literal “size identically”: specify a rest phase, visible-body metric, baseline and tolerance; preserve aspect ratio. Exact equality of both bounds would require distortion, redrawing, or replacing the still with the same frozen layer composite. Those alternatives must be explicit, not silently introduced. Review size with and without mass normalization and football wear.

The Laboratory's specimen art, picker and input cards use `petPortraitHtml`, which deliberately always draws a still (`app.js:845`, `21285`, `21314`). Fixing `petSpriteHtml` animates branches, reveals and the Stable card, but will not animate those portraits. Clarify which surfaces should move. Keep CX, shiny priority, football's authorized static fallback, and reduced-motion behavior intact.

## 2. Layer feasibility: feasible selectively, unsafe as a blanket pass

I inspected all 18 shipped layer PNGs and ran the existing generator against temporary copies of the 16 ordinary cloud/catfish/lizard files with the existing Frost target. No probe image was shipped or retained in the checkout. `layer-checks.json` records dimensions, alpha bounds, dominant colours and generator checks. `lizard/out.png` is included for inventory but is not referenced by `petanim.js`; the two amethyst files are CX assets and were inventoried without probing.

The method preserves declared ink and protected cores, grows nearby fill regions, and reconstructs two-colour blends. It also snaps near-core colours and uses an HSV fallback for unexplained pixels (`build-pet-morphs-v2.py:239-276`). Passing the core checks is not proof that all linework seams, textured fills or transparent edges survived. Small extracted layers can lose the nearby palette cores the method needs. A static-master success does not establish success on every layer.

| Layer | Finding and honest treatment |
|---|---|
| `cloud/body-noeyes.png` | Body palette matches C1. Recolouring is plausible, but the blind probe leaves 139 unexplained pixels, including 68 without a nearby pair. Validate the repaired eye area and body edges before accepting. |
| `cloud/drop.png` | Uses the expected cyan family. Recolour with its drops target, preserving alpha and texture; 29/203 alpha-visible pixels use fallback in the probe. |
| `cloud/eyes.png` | Protected eye/ink artwork, with possible baked edge colours. Prefer sharing; inspect edge contamination against all new bodies. Probe reports 13 unexplained pixels, so “run every layer” is not justified. |
| `cloud/closed.png`, `cloud/shadow.png` | Pure ink/neutral artwork. Share unchanged. No morph output is needed. |
| `catfish/body.png` | Source-derived body plus repaired bead footprint. Existing palette largely applies; 134/15,512 pixels are unexplained. Check the repaired rim with the bead both attached and airborne. |
| `catfish/bead.png`, `catfish/drop.png` | Highlight family is represented, but these are tiny extracted sprites. Probe fallback is 17/157 and 43/156 pixels respectively; the drop has three pixels with no pair. Preserve the extracted alpha and original stroke blends, and use layer-specific palette/masks if needed. |
| `catfish/shadow.png` | Share unchanged. Even this nominally neutral layer produces seven unexplained pixels if unnecessarily sent through the generator. |
| `lizard/base.png`, `lizard/lid.png` | Body orange is exactly represented. A matched body/lid target is feasible. Base has 129 unexplained pixels; lid has zero. Validate cream belly versus eye/teeth protection by anatomy, not just an assumed component-size rule. |
| `lizard/mouthline.png` | Contains orange body paint and cream, not just black ink. Sharing it unchanged would leave an orange seam on a recoloured pet. Recolour its body contribution and preserve cream/ink. Probe has 27/452 unexplained pixels. |
| `lizard/tongue.png` | **The existing C4 palette cannot faithfully explain this layer.** It is textured pink, with frequent RGB values such as (255,147,143), absent from C4's declared orange/yellow/cream palette. 150/273 alpha-visible pixels use fallback, with two having no pair. Blind processing would assign an inappropriate region. Share Cam's pink tongue unchanged as the honest first fallback, or obtain an explicit tongue palette/mask and verify it separately. Do not call automatic HSV reassignment a faithful recolour. |
| `lizard/drool.png`, `lizard/fly.png` | Share unchanged. Drool is explicitly protected by the static palette, but the blind probe still has 44/126 unexplained pixels. No reason to expose it to fallback. |

Counts above use the generator's alpha > 0 visibility definition, which includes faint export fringe. They identify where review is needed; they are not counts of visible rendering defects. The JSON also records alpha > 8 inventory counts. All probes passed the generator's protected-core tests, illustrating why those tests alone cannot certify the final composite.

The existing CX implementation demonstrates selective sharing: `lizard(px, skin)` swaps base and lid while sharing the tongue, mouthline, drool and fly. It is a useful folder-selection precedent, not proof of fidelity for ordinary morphs. In particular, its unchanged mouthline includes orange paint. Also, the generator's anatomy comment says the static C4 tongue is orange; the animated pink layer is different art. A shared pink tongue preserves the animation's source but does not establish flat-master colour parity. Record that choice explicitly.

For C3, `scripts/build-catfish.py:8-17` explains that the bead contains opaque original colour blends over ink, with a repaired body underneath. Recolouring those independently needs a recomposition check. The script's original rest check even uses the separate original small drop, whereas runtime reuses a larger drop sprite. Do not promise pixel identity between every runtime frame and the master from that rest gate alone.

Required future B acceptance: unchanged dimensions/alpha, byte-identical shared layers and protected ink, appropriate treatment of unexplained paint, and composited inspection of blink, tongue, bead and rest phases. No layer here proves morph animation impossible in principle. The impossible assumption is that the unchanged static palette can faithfully recolour every layer without exceptions. If a required body or seam fails, retain the current matched static morph until a faithful layer exists; do not silently show base-colour animation.

## 3. All 90 colour pairs measured

`measure.py` measures the shipped master PNGs, not nominal HSV targets. For each species it compares all 15 unordered pairs across Base, Ember, Frost, Toxic, Midnight and Rose, for 90 comparisons total. All six variants of each species have equal dimensions and byte-identical alpha channels.

Metric: convert sRGB through linear RGB to OKLab, then calculate Euclidean distance at corresponding pixels, multiplied by 100. The primary result averages over a fixed opaque source-colour core mask: the nearest declared fill within the generator's 14 RGB-unit tolerance, excluding ink and protected fills. C4 cream is excluded because belly and protected eyes share it. This captures recolour separation without diluting it with unchanged ink. A second metric weights distances across all visible pixels by source alpha, exposing how little of a creature actually changes. Neither number is CIEDE2000, a calibrated confusion threshold, or a substitute for small-screen inspection.

| Species | Closest pair | Core mean distance | Whole-art alpha-weighted distance |
|---|---|---:|---:|
| C1 Drizzle | Base / Frost | 10.13 | 5.47 |
| C2 Mallard | Ember / Rose | 11.07 | 6.10 |
| C3 Catfish | Ember / Rose | 13.51 | 8.63 |
| C4 Beardie | Ember / Rose | 9.62 | 4.83 |
| C5 Bulldog | Ember / Rose | 9.64 | 5.31 |
| C6 Bumbleseal | Ember / Rose | 13.16 | 1.29 |

The same closest pairs win under both metrics. Full results, including the non-minimal pairs, are in `colour-pairs.csv`.

**C1 Frost is not the only pair to investigate.** C4 and C5 Ember/Rose are closer on the recoloured regions than C1 Base/Frost. C6's stripe colours differ, but unchanged cream and ink dominate the creature, so its whole-art separation is especially small. These are risk rankings, not proof every listed pair confuses players. Do not repaint all five species automatically.

Measure before choosing the new Frost target, then repeat all pairs afterward. A deeper saturated blue could improve Base/Frost while getting closer to Midnight. Review actual thumbnail sizes and both game backgrounds; keep colour names and ownership labels so recognition does not depend on hue alone. The plan supplies no perceptual acceptance threshold or comparison baseline. Agree one using the shipped confusing example plus visual recognition, instead of declaring an arbitrary numerical pass.

## 4. Kennel: consolidate access, retain the collection function

Recommend A's third option: retire the competing Stable door **after Tom's decision**, while keeping the existing grid reachable through the Laboratory. This is already partially wired: `labBenchHtml` includes “Your collection” and `wireLabLinks` calls `openKennel` (`app.js:21415`, `21462`). It is unnecessary to rebuild a collection screen to make that navigation possible.

The Kennel supplies a cross-species 36-cell overview, owned-species roster, collection completion, locked-cell labels and the explanation that colours are cosmetic (`app.js:21605-21699`). The Laboratory's selected-species recipe path is not equivalent. Keep collection access available with zero experiments, no eligible pair, and an unavailable Lab engine. Putting it behind an experiment prerequisite would remove a useful read-only feature. The current Lab read-error branch offers reopening and pet actions, not a direct collection link, so making the Lab the only entry would add an availability dependency.

Concrete dependency audit:

| Concern | What actually depends on it |
|---|---|
| Stable guards | `tests/kennel-audit.mjs` requires `#kennelBtn` in the Stable body and clicks it. Door removal fails SETUP/DOOR. Browser audits `pet-C-browser-audit`, `paddock-pack-browser-audit`, `kennel-copy-browser-audit`, and `pet-a11y-pixels-audit` also click that selector. `paddock-pack-audit.mjs:130` checks the door's count wording. These need intentional navigation-contract updates, not deletion of collection coverage. |
| Release gate | `tests/release-gate.mjs:392` runs the Kennel audit. Some comments still say 30 cells; the current runtime and unit contract are 36. Use actual assertions, not stale comments, when updating guards. |
| Deep links | No Kennel hash route was found. The router chooses the main tabs (`app.js:3606-3624`); Kennel opens as a history-backed sheet. The webdriver-only `window.__openKennel` seam at `21701` is a test hook, not a public deep link. Retiring only the door does not invalidate an implemented Kennel URL. |
| Saved state | `openKennel` derives cells from `petInstances` and `ownedPairs`; cell selection is transient DOM state. No independent Kennel save schema was found. Preserve pet instances/morphs and Lab receipts, incubators, intents and `labUi`; no save migration is justified by moving a door. |
| Achievements | No Kennel-entry achievement was found in the game/quest code or other runtime Kennel references. The completion message is computed from current ownership, not a durable award. Do not turn it into an “ever collected” total: experiments can remove the final owned copy of a colour. |
| Navigation and analytics | Both sheets currently link to each other, permitting deeper stacks. A consolidation needs a clear Back/focus rule and should avoid creating another Laboratory from its own collection subview. `openSheet` also derives analytics names from headings unless explicitly named. Renaming/removing the sheet changes that reporting dimension. |

A is correctly a decision, not an authorized build lane. It does not block independent art analysis, but its eventual collection placement overlaps C's room/navigation work and must be integrated by the same owner.

## 5. Sequencing: C and D collide

The proposed “different files” rationale is demonstrably false:

| Lane | Actual shared ownership |
|---|---|
| D picker exclusion | `app.js:21389` `labPickerHtml`, `21512` picker event wiring; `app.css:11950-11953` button/disabled presentation. |
| D button typography | `app.css` Lab button rules; possibly markup inside `labBenchHtml` and `labSpeciesHtml` to distinguish labels from detail text. |
| C density/hierarchy | `app.js:21285` shared `labPetDetails`, `21345` branches, `21367` confirmation, `21399` bench; `app.css:11929-11959` cards, branches, slots and buttons. |

`labPetDetails` is used in picker, bench and destruction review, so these are semantic collisions even if a merge tool finds separate lines. **Give C and D one UI owner or serialize D followed by C on the updated baseline.** Merely putting them in different worktrees does not remove the integration risk. Include affected `lab-ui-audit.mjs` and `lab-integration-audit.mjs` assertions in that ownership: several pin exact warning/copy strings.

B's generator/assets and `petanim.js` can be developed independently, but its eventual `petSpriteHtml` integration also touches `app.js`, and sizing can touch `app.css`. Freeze the renderer API before the UI work relies on it and integrate those shared files serially. Revised dispatch order: resolve B's layer/palette contract; allow isolated art work; implement D then C under one UI owner; integrate renderer and UI; apply A's chosen navigation change through that owner when decided. No parallel agents were launched for this review.

## 6. What the response to Tom's eight points misses

| Point | Missing or too weak |
|---|---|
| 1. Competing rooms | A offers choices but omits that the collection is already reachable from the Lab, plus the read-error dependency and test/navigation consequences above. |
| 2. Wrong button fonts | “Choose a species” already has `.btn`, and `.btn` sets Bangers. Empty first/second slots have `.lab-pet` without that font. Verify the reported species control rather than assuming all three fail identically. `DESIGN.md:43` explicitly says display is never for body text: applying Bangers to an entire metadata-heavy pet button would create another hierarchy problem. Style action/name labels separately. |
| 3. First pet looks selectable | The selected other instance is already disabled with “Choose a different pet.” The defect is recognizability, not a missing eligibility guard. Exclude or explicitly mark that exact `iid` as “First pet”; keep another identical species/colour instance selectable. Do not filter by species or colour, which would break Base + Base. Verify disabled appearance, accessible explanation, keyboard behavior and the empty-filter case. |
| 4. Comparison overload | `labPetDetails` repeats the full nickname/lineage/bond/talents/equipped inventory on inputs, and confirmation repeats many of those facts again. C needs explicit input-card versus review-detail roles. Otherwise changing weights alone leaves the same reading burden. |
| 5. Whole page feels like FAQ | The quoted 1,830-pixel height is not a universal finding. It varies with viewport, selected state, names, errors and help expansion. C targets confirmation more concretely than the bench, picker, recipe path and result screen. Define the dominant action for each state and inspect narrow screens and larger text before declaring length solved. |
| 6. Too much information; outputs look like inputs | Inputs and outputs use similarly styled `.lab-loss`/`.lab-branch` panels in a vertical sequence. The flow needs distinct input/output groups with names, explicit probabilities and one actual output, including the guaranteed Midnight case. “Keep every destructive warning intact” cannot mean preserving all duplicated prose while promising prose removed. Preserve all material loss facts and typed-confirmation behavior, consolidate repeated wording, and keep quote-derived branch-specific collection losses visible before commit. Any literal-copy constraint must be resolved explicitly because current tests pin wording. Also, “Animate these pets?” can mean making sprites move to a non-gamer, precisely the other complaint in this report. Clarify that this makes one new pet; do not silently alter the transaction or required ANIMATE token. |
| 7. Frost mistaken for Base | B acknowledges the real defect, but needs the wider comparison above, a recheck after retargeting, and regeneration of the 192/384/trim morph derivatives. `croppedPetImg(... thumb:true)` uses those assets. Changing only the master can leave the reported collection view with old colours. Unit tests currently check derivative existence, not matching new content. |
| 8. Frost static and smaller | B misses portrait-versus-sprite call sites, the quantitative crop/stage discrepancy, and the impossibility of matching every phase/aspect with one scalar. Retain football/reduced-motion exceptions and protect CX/shiny behavior. New layer paths also need loading/offline coverage: `sw.js` has explicit animation entries and fallback caches, so old/new assets must not be assumed to arrive together. |

Preserving every safety fact is compatible with fewer repetitions and stronger grouping. Preserving every sentence while promising a sparse art-led confirmation is not a concrete, internally consistent brief. C needs to say which contract it means before implementation.

## Proof, changed files and limits

Agreed proof command: `node tests/unit.test.js`, executed in this checkout. Exit status: **0**. Complete captured output in `unit-test-output.txt`:

```text
370 passed, 0 failed
```

Offline measurement command: `python3 docs/reviews/r56/measure.py`. Completed successfully: 90 colour-pair measurements, 18 layer inventories and 16 temporary Frost probes. Requires the already available NumPy, Pillow and SciPy. The optional scikit-image import check failed because that package is absent; OKLab conversion is implemented directly in the evidence script, without installing packages or using a different non-perceptual metric. Temporary probe art was discarded. A local inspection contact sheet was written to `/tmp/r56-review-layers.png`.

Files added in this checkout:

- `docs/reviews/r56/review.md`
- `docs/reviews/r56/measure.py`
- `docs/reviews/r56/colour-pairs.csv`
- `docs/reviews/r56/layer-checks.json`
- `docs/reviews/r56/unit-test-output.txt`

Existing application, test, asset and plan files were not edited. An import-generated Python bytecode file was removed; the evidence script now disables bytecode writes.

Denied actions: none. Blocked actions: none required to complete this review. Browser, sockets, live-site checks, animation playback and browser audits were **unrun**, as the frozen order requires. The unit result does not establish browser layout, perceptual recognition, composite fidelity or offline loading. Local PNG inspection and source calculations are explicitly distinguished from those proofs.

No commit, push or publish was attempted. No original checkout named in project documentation was edited. Deviations enacted: none from the frozen review-only order. The outer request was handled by executing that review order, not by implementing its proposed A-D work. Proposed requirement changes needing resolution before a build are the rest-phase sizing contract, selective layer recolouring with an unchanged pink tongue fallback, consolidated warning wording, and serialized UI ownership. These are recommendations for the independent reviewer, not approved product changes.
