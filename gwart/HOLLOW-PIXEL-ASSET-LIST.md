# The Hollow in pixel art: complete asset list

For Tom, 2026-08-16. Paste-ready for a pixel artist or a generator.

---

## 0. THE GRID, decide this before anyone draws a single sprite

Everything below depends on one number and it cannot be changed later without redrawing.

The stage is **390 x 740 CSS px**, rendered at deviceScaleFactor 2, so **780 x 1480 device pixels**.

**Recommendation: a 16px tile, 4 device pixels per art pixel.**

| | |
|---|---|
| Art canvas | **192 x 368 art px** = 12 x 23 tiles of 16 |
| Renders to | 768 x 1472 device px = **384 x 736 CSS px** |
| Stage change needed | 390 x 740 becomes 384 x 736. Six px and four px. Trivial. |
| Keeper height | 190 CSS px becomes **96 art px**, exactly 6 tiles |
| A garden bed | 84 CSS px wide becomes **42 art px** |
| Scale rule | integer only, `image-rendering: pixelated`, never a fractional transform |

Why 4x and not 6x: at 6x the canvas is 130 art px wide and the two bed frames eat 100 of it, which leaves no room to draw anything between them. At 4x the frames are 75 art px each and the scene breathes.

**Everything is authored at 1x and scaled up by 4. Nothing is ever authored large and scaled down.** That is the whole lesson from the icon test this morning: a 48px sprite rendered at 13px lost three quarters of its artwork and the coin turned into a brown speckle.

---

## 1. TERRAIN, tileable

All 16 x 16 unless stated. Must tile seamlessly on all four edges.

| # | Asset | Notes |
|---|---|---|
| 1 | `grass-base` | The default ground. 3 to 4 variants so a field does not visibly repeat |
| 2 | `grass-variant-a/b/c` | Sparse detail: a few blades, a pebble, a bone chip |
| 3 | `grass-edge-n/s/e/w` | Transition to dirt |
| 4 | `grass-corner-inner/outer` | 8 corner pieces for clean transitions |
| 5 | `dirt-base` | Under the path and around the beds |
| 6 | `dirt-variant-a/b` | |

**Count: about 18 tiles.** This is the piece most likely to be underestimated. A tileset with no edge or corner pieces produces hard rectangles and looks unfinished no matter how good the individual tiles are.

---

## 2. THE PATH

| # | Asset | Size | Notes |
|---|---|---|---|
| 7 | `path-stone` | 12 x 6 | 3 shape variants. Currently 13 stones down the centre |
| 8 | `path-dirt-band` | 16 x 16 tile | The worn strip the stones sit on |

---

## 3. STRUCTURES

| # | Asset | Size | Notes |
|---|---|---|---|
| 9 | `shed` | 64 x 56 | Body, roof, door, gable window |
| 10 | `shed-door-open` | 64 x 56 | For the seed-pouch interaction |
| 11 | `shed-lantern` | 12 x 16 | Hangs on the shed. Needs a **lit** and an **unlit** version |
| 12 | `fence-post` | 8 x 20 | |
| 13 | `fence-rail` | 16 x 20 | Tileable horizontally |
| 14 | `fence-gate-post` | 12 x 24 | The taller capped post at the path |
| 15 | `sign-post-arm` | 40 x 32 | The hanging arm and chains |
| 16 | `sign-board` | 60 x 20 | Blank. **Text is never baked in**, it is drawn over |
| 17 | `bed-frame` | 76 x 176 | The wooden plot border. Needs a 9-slice or a tileable rail so both frames can differ in height |

---

## 4. BEDS AND SOIL

| # | Asset | Size | Notes |
|---|---|---|---|
| 18 | `bed-empty` | 42 x 30 | Untilled soil |
| 19 | `bed-tilled` | 42 x 30 | Raked rows |
| 20 | `bed-watered` | 42 x 30 | Darker, damp. Currently we have no watered state at all and it is a gap |
| 21 | `bed-locked` | 42 x 30 | The ghost slot. **Must read clearly against grass.** The current vector version fills within 7/255 of the lawn and measures 2.5% coverage against 41 to 44% for a real bed, so it is nearly invisible. Do not repeat that. |

---

## 5. CROPS, the largest single block

**7 crops:** Marrow, Graveroot, Ember Pepper, Bog Mushroom, Sinew, Grave Salt, and Ectoplasm (rare).

**4 stages each:** seeded, sprout, young, ripe.

| Option | Count | Trade |
|---|---|---|
| Full set | **28 sprites** | Every crop distinct at every stage |
| Shared seed stage | **22 sprites** | The seeded mound is a seed in dirt and looks the same for everything. Saves 6. |

**Size: 32 x 40**, drawn from the soil line up, anchored bottom-centre.

**The thing to get right:** each crop must be identifiable at **sprout and young**, not just ripe. Today six of seven crops are one silhouette with a colour swap, and at sprout and young there is no tintable element at all, so they are pixel-identical. That is the single biggest reason the garden does not read as a garden. Give each crop a distinct leaf shape or growth habit early, not just a different fruit at the end.

---

## 6. PROPS

| # | Asset | Size | Notes |
|---|---|---|---|
| 22 | `compost-heap` | 56 x 32 | Soil mound with crossed bones |
| 23 | `compost-steam` | 12 x 16 | 3 frames, rising |
| 24 | `crow` | 24 x 16 | Idle plus a 2 frame wing flap |
| 25 | `crow-rock` | 20 x 10 | The perch. **Missing from the current pack**, the crow stands on bare grass |
| 26 | `lantern-post` | 12 x 40 | Standing lantern, bottom left |
| 27 | `lantern-flame` | 8 x 8 | 3 frame flicker |
| 28 | `seed-crate` | 20 x 20 | |
| 29 | `seed-sack` | 16 x 20 | |
| 30 | `grass-tuft` | 12 x 12 | 3 variants, sways |
| 31 | `bone-pile` | 24 x 12 | Set dressing |
| 32 | `watering-can` | 20 x 16 | Held by the keeper during the pour |

---

## 7. THE KEEPER

This is the hard one and the one to prototype first, because if the character does not work the whole pivot does not work.

**Now: one farmer sprite.** 48 x 96 art px (6 tiles tall), bottom-centre anchored.

| Animation | Frames | Used by |
|---|---|---|
| `idle` | 4 | Standing about, which is most of the time |
| `walk` | 4 | Walking to a bed. One direction, flipped horizontally for the other |
| `dig` | 3 | Tilling an empty bed |
| `water` | 4 | The pour, holding the can |
| `pluck` | 3 | Harvesting |
| `celebrate` | 3 | Optional, for a bumper crop |

**Count: 21 frames minimum.**

**Later: gear-aware, and I want to be honest about the cost.** Making the player's equipped gear show up in pixel art is not a reskin, it is a paper-doll system: every gear item has to be redrawn for every pose of every animation. With 6 slots and 21 frames that is 126 drawings **per item**, and the catalogue has 276 pieces. That is not a stretch goal, it is a separate project.

The realistic path, in order:
1. One farmer sprite now, no gear at all. Ships the pivot.
2. A small **palette swap** later: 3 to 5 recolours of the same sprite tied to something the player earns.
3. **Layered head slot only**: hats read at this size and are the most recognisable slot. One 32 x 24 sprite per hat, aligned to a single head anchor across all frames.
4. Full paper doll only if the game is big enough to justify it.

---

## 8. LIGHT AND TIME OF DAY

Three bands: day, dusk (17 to 20 and 5 to 7), night.

Tom's call from earlier today stands: **no full-screen colour wash.** A flat tint over pixel art flattens exactly the outlines the style depends on.

| # | Asset | Notes |
|---|---|---|
| 33 | Day / dusk / night variants of `grass-base` and `dirt-base` | Repainted per band, not tinted. 3 x about 6 tiles = 18 |
| 34 | `light-pool-lantern` | 48 x 48 radial, dithered edge, not a soft gradient |
| 35 | `light-pool-window` | 32 x 32 for the shed window |
| 36 | `firefly` | 3 x 3, 2 frame pulse |

**Dithering, not alpha gradients.** A soft radial gradient over pixel art is the same mistake as the tint.

---

## 9. FX

| # | Asset | Notes |
|---|---|---|
| 37 | `water-droplet` | 4 x 6, 3 frames falling |
| 38 | `dirt-pop` | 6 x 6, 3 frames, for digging |
| 39 | `sparkle-harvest` | 8 x 8, 4 frames |
| 40 | `bumper-burst` | 16 x 16, 4 frames, for the lucky roll |

---

## 10. UI CHROME: my recommendation is DO NOT make this pixel art

Measured this morning on your own three sprites, and it decided the icon question:

| Slot | Renders at | Source px per device px | Result |
|---|---|---|---|
| Wallet chip | 13 px | 1.85 | Dust lost **76%** of its ink, coin became a dim speckle |
| Quest row | 11 px | 2.18 | Same |
| Reward card | 74 to 131 px | 0.32 to 0.18 upscale | **Works, and the chest beat the vector version** |

The timer chips, the THIRSTY and READY chips, the price sign numerals and the keeper's speech bubble all live in the 11 to 15px band. Pixel art dies there. **Keep the chrome as it is: Bangers type, ink keylines, the acid-lime accent.** The scene goes pixel, the interface stays vector. That contrast is a deliberate style, not a compromise, and plenty of games ship exactly that.

If you want pixel chrome anyway, it needs sprites **drawn at 16px native**, not scaled down from 48.

---

## TOTALS

| Block | Sprites | Frames |
|---|---|---|
| Terrain | 18 | |
| Path | 4 | |
| Structures | 9 | |
| Beds | 4 | |
| Crops | 22 to 28 | |
| Props | 11 | 8 animated |
| Keeper | 1 character | **21** |
| Light and bands | 21 | 2 |
| FX | 4 | 14 |
| **Total** | **about 94 sprites** | **about 45 animation frames** |

---

## FOR THE MOCK ONLY, this is the shortlist

You said mock it first. To judge whether the pivot works you do not need 94 sprites, you need **17**:

1. `grass-base` plus 2 variants (3)
2. `dirt-base` (1)
3. `path-stone` (1)
4. `bed-tilled` and `bed-locked` (2)
5. One crop at all 4 stages, Ember Pepper since it already exists (4)
6. `shed` (1)
7. `fence-post` and `fence-rail` (2)
8. `bed-frame` (1)
9. The keeper: **idle only, 2 frames** (2)

That is enough to render one full screen and answer the only question that matters: does a pixel Hollow look better than the hand-inked one, and does the keeper survive the translation.

**Draw the keeper first.** If the character does not work at 48 x 96, nothing else is worth drawing.
