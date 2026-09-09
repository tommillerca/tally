# Advisory implementation report

Frozen plan SHA256 verified: `ecbb628631caec6dfa8fd21a25bdd018ab6aaa5bfb11c26f3a785d88e81f003c`.
All application and asset changes are within this checkout. No commit, push or publish was attempted.

## Changes

The two bugs are addressed independently:

1. `petSpriteHtml` passes the morph to `animatedPetHtml`. Drizzle (C1) selects fifteen new PNGs, three layers for each of Ember, Frost, Toxic, Midnight and Rose. Closed eyes and shadow share the unchanged originals. The complete cloud stacks are explicitly precached.
2. Static sprite fallbacks use the animation stage's native scale on their whole registered canvas. This applies equally to base, morph and shiny static fallbacks, including football garments. The existing species mass scale is unchanged. `petPortraitHtml` and the default static crop retain their existing geometry and remain still.

### Selective art admission

The new generator is `scripts/build-pet-morph-layers.py`. It reads the approved master PNGs and current palette table without regenerating or editing them. Drizzle's 1,510 non-ink eye pixels and 203 rain pixels transfer exactly from the corresponding approved master coordinates. This includes the eyes' baked body-colour edges, which cannot be shared unchanged. Another 9,970 body pixels transfer directly. Its 2,510 repaired body pixels use a two-fill palette blend with the original RGB residual retained. The maximum residual is 6.3222 RGB units against a limit of 8, with no HSV fallback. All layer dimensions, alpha channels and 6,427 protected ink pixels per colour remain identical. A frozen SHA256 inventory binds all eighteen original layer files, including unchanged shared artwork.

Catfish (C3) and Beardie (C4) morphs retain their matching static masters and are named in `MORPH_ANIMATION_FALLBACKS`. The reviewed generic layer model fails the strict zero-unexplained-pixel admission rule: Catfish's bead has 17 unexplained pixels, and Beardie's textured tongue has 150. The repaired bead/body seam and Beardie's mouth/tongue have no replacement model accepted in this change. These are failures of the available recolour model, not claims that faithful animation is impossible in principle. No base-colour animation substitutes for a morph. Ordinary base and shiny animations, including CX, remain available.

`cloud-phases.png` is an offline Pillow composite inspected in this session, showing open and closed eyes for base and all five morphs. Its single rain drop illustrates the layer palette. It is not a screenshot or a runtime frame, and does not reproduce the CSS rain timing.

### Measurable size contract

- Phase: **neutral rest at local t=0**, before bobbing or rotation changes the width. Catfish's initial vertical translation does not affect this metric.
- Metric: horizontal extent of the largest four-connected component with alpha greater than 8 in the body artwork. Detached rain, sweat, shadow, fly, garments and glow are excluded.
- Baseline: the corresponding base animation body at the same requested CSS width, using the renderer's emitted four-decimal stage scale.
- Tolerance: relative width error at most **1%**. Height equality and equality throughout a moving loop are not promised. Both paths preserve their original aspect ratios.
- Measured source body widths: C1 is 181 native pixels; C3, C4 and CX are 221. Each species' static master and animation body agree on this width. For C1 at 124 CSS pixels, the rest baseline is about 101.10 CSS pixels. Its old static body was about 97.91 pixels, and the corrected static body is about 101.10 pixels.
- The guard covers requested sizes 48, 76, 124 and 192; mass normalization off/on; floor seating off/on; all five morphs; and wear absent/present. C4/CX use actual football garments and the production sprite fallback. Every garment retains the body's identical scale and translation. Portraits remain outside this sprite contract.

## Proof

- `node tests/unit.test.js`: exit 0, **371 passed, 0 failed**. Full output: `unit-output.txt`.
- Full registered PURE tier: exit 0, **102/102 suites passed**. Per-suite status: `pure-output.txt`; full subprocess output: `pure-details.txt`; machine-readable exits: `pure-results.json`.
- `node tests/pet-morph-animation-audit.mjs`: exit 0. Exact output: `guard-output.txt`. The final tightened reduced-motion assertion was rerun successfully after the full tier.
- `python3 scripts/build-pet-morph-layers.py --check`: exit 0. Measurements: `layer-checks.json`.
- `node tests/release-gate.mjs --coverage-only`: exit 0; new guard registered in PURE.
- `git diff --check`: exit 0.

The normal release gate also starts a server and browser suites. To obey the browser prohibition, the PURE runner extracts the actual `PURE` initializer and every `push`/`unshift` from `tests/release-gate.mjs`, then runs every registered suite sequentially. It does not use a hand-maintained subset. Reproduce from this checkout with:

```sh
node --input-type=module < docs/reviews/fix-anim/pure-driver.txt > docs/reviews/fix-anim/pure-output.txt 2>&1
```

The PURE guard executes extracted production render functions, imports the actual animation resolver, reads the shipped PNGs and checks regeneration. Positive controls independently restore the pre-fix morph gate, unnamed/colour-ignorant resolver, and static FILL geometry. Each is rejected. A separate blind-animation control proves that naming a fallback alone cannot conceal base-colour animation.

The old code already kept C3/C4 morphs static. Therefore the pre-fix fallback control rejects its missing named failure policy, as required by the work order, rather than pretending its static behavior was itself a regression.

## Operator verification still required

No browser was run, as ordered. The operator must verify:

1. On Stable cards, branches and reveals, all five Drizzle morphs float, blink and rain without base-colour flashes, halos at eye edges, damaged repaired eye areas or crop clipping. Compare against the approved master at actual small sizes on both game backgrounds, including a full blink and rain loop.
2. Catfish and Beardie morphs remain their correct static colours. Base and shiny Catfish/Beardie and CX retain their existing bead, tongue, blink and fly animations. Check shiny priority when a morph is also supplied.
3. At the defined neutral rest phase, compare visible body width with mass normalization off/on and football wear off/on. Hide garments only for measuring the body, then inspect registration and clipping with garments visible. Check perceived size through the whole loop separately; the numeric proof does not establish perceptual equality or height equality.
4. Laboratory specimens, picker rows and input cards remain still. Reduced-motion settings stop animation through the existing CSS policy.
5. A fresh service-worker installation, an upgrade from the prior build and a subsequent offline launch load complete morph stacks on all intended surfaces. Static precache coverage is proven; network loading and cache lifecycle behavior are untested.

## Denied actions, blockers and deviations

Denied actions: none. Remaining execution blockers: none for the required Node/PURE proofs. Browser/playback checks were deliberately unrun. No original checkout was edited.

The first PURE run exposed the affected accessory guard's literal FILL parser; the implementation now retains the default `FILL = 0.82` and applies sprite rest scaling separately. Four unrelated suites initially could not load `esprima`. An offline npm pack attempt returned `ENOTCACHED`. A read-only local copy of esprima 4.0.1, matching the lockfile, was then copied from the sibling `lab-final2/node_modules/esprima` into this checkout's ignored `node_modules`. No package manifest or lockfile changed, and no network installation was used.

Scope deviations: none. Selective static fallbacks and a width-based rest contract implement the frozen rulings. A separate layer generator preserves the approved flat-master generator and assets. Release version stamps were not changed because this work order forbids publishing.

## Files changed

- `js/app.js`
- `js/petanim.js`
- `sw.js`
- `scripts/build-pet-morph-layers.py` (new)
- `tests/pet-morph-animation-audit.mjs` (new)
- `tests/release-gate.mjs`
- `assets/bh/anim/morph/C1/{ember,frost,toxic,midnight,rose}/{body-noeyes,eyes,drop}.png` (15 new files)
- `docs/reviews/fix-anim/`: this report, source hashes, layer measurements, offline composite and proof logs/driver. `files-changed.txt` lists every individual deliverable path.

The ignored local esprima dependency is test setup, not a tracked application change.
