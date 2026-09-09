# PLAN: Tom's first Laboratory playtest, 2026-09-08 (v523, live)

Tom's report, verbatim, is the work order. Nothing here is invented.

## What he said
1. "immediately we have the kennel and the lab fighting for real estate i dont
   really see a need for the kennel now that we have the lab?"
2. "choose a species then choose first pet and second pet wrong fonts on buttons"
3. "choose second pet, why is the first one i had still in the lsit at the top
   it should be greyed out or removed they all look the same so it just seems
   like a dead button when youre trying to pick an identical creature"
4. "this page with the compared pets too much font all at the same weight
   nothing is standing out and theres so much text everywhere its overwhelming"
5. "the whole page has too much text in general and just feels kinda unispired
   like an FAQ page"
6. "animate these pets? page: ... way too much info on the buttons tho should
   really just be this pet + this pet COULD become this or this. not sure why
   ember and frost are below as if they seem like theyre in the column in the
   mix too?"
7. "i got a frost drizzle and the colour is so close to the base drizzle i
   thought i ahd the same pet"
8. "the frost drizzle isnt animated but the others are and he seems a tiny bit
   smaller in the stable collection when going back and forth"

## What the operator MEASURED before planning

**Item 7 is a real art defect, with numbers.** Dominant body colour, ink and
highlights excluded, from the shipped PNGs on origin/main:

| Art | Hue | Sat | Val |
|---|---:|---:|---:|
| C1 base | 185 | 19% | 100 |
| C1 frost | **200** | **32%** | 96 |
| C1 ember | 16 | 72% | 98 |

Frost sits **15 degrees** from base on a pale creature. Ember sits 169 degrees
away and reads instantly. Root cause: Drizzle's source fill `#cffbff` is
ALREADY icy blue, so a frost recolour barely moves it. The generator's C1 frost
target `hsv(200,.32,.96)` is close to the source's own hue.

**Items 7 and 8 share a root cause, and it is documented in the code.**
`js/petanim.js` line ~86: a morph is a PNG variant of the flat master, but the
animated path composites separate layers (eyes, drops, shadow) that
`scripts/build-pet-morphs-v2.py` does not recolour, so **a morphed pet forces
the static cropped image instead**. `ANIMATED_PETS` is C1, C3, C4, CX.
The same file notes animated pets are "sized by WIDTH, which quietly shrinks
the flat ones", so the static fallback also sizes differently. That is Tom's
"tiny bit smaller when going back and forth".

That trade was acceptable when morphs were a rare curiosity. **v523 made
morphs the main content of the game**, so the trade is now backwards: the
colours players work hardest for are the only ones that do not move.

**Source PNGs are identical dimensions** (186x183 for both C1 base and C1
frost), so the size jump is the render path, not the art.

## Proposed work, in priority order

### A. The Kennel: KEEP it, demote it. Tom has ruled.
"i take back what i said about the kennel we should still have it somehwere but
it does not need prime real estate". So the Kennel stays and stops competing
with the Laboratory at the top of the Stable. It is a trophy grid, not a verb;
the Laboratory is the verb. No decision needed, just execution.

### A2. The Stable needs a cleanup. Tom: "the UI in the stable is bad right now
there is too much going on and it shows weird font hierarchys and dust currency
etc this needs a polish and clean up".

Captured and measured by the operator at 393x852 (1,229px scroller). What is
actually wrong:
- **Three doors stacked at the top**, Paddock, Kennel and Laboratory, each a
  different shape and visual weight, all before a single pet is visible.
- **Five separate explainers before the collection**: the three-sinks sentence,
  a dust chip, "Only the active pet levels as you walk", a "How pets work"
  control, and a paragraph explaining Breed and Destroy.
- **The dust currency (240) floats as a chip** wedged between two unrelated
  pieces of copy, with no relationship to anything beside it.
- **Inverted hierarchy**: door titles, the pet's name and the buttons are ALL
  large Bangers, while the pet's own stats are plain body text. The loudest
  things on screen are navigation; the quietest is the creature.
- **NOT a bug, retracted before dispatch**: the operator thought the pet
  carousel rendered twice. It does not. `BASE DRIZZLE` occurs exactly ONCE in
  the DOM; the duplicate was an overlap in the operator's own scroll-and-stitch
  capture. Do not chase it.

Goal: the pet is the loudest thing in the room, the doors are quiet and
consistent, the explainers collapse to one place, and dust sits where currency
belongs. Do not remove any capability, and keep every destructive confirmation.

### B. REVISED after review. These are TWO independent bugs, not one.
The review corrected the operator on three points; the corrections are now the
plan.

**B1. The palette problem is bigger than Drizzle's Frost.** Measured pairwise
across all six species (`docs/reviews/r56/colour-pairs.csv`, mean core delta,
lower is worse):

| Pair | Species | Delta |
|---|---|---:|
| ember vs rose | C4 | 9.62 |
| ember vs rose | C5 | 9.64 |
| **base vs frost** | **C1 (Tom's report)** | **10.13** |
| ember vs rose | C2 | 11.07 |
| base vs ember | C5 | 12.23 |
| ember vs rose | C1 | 12.61 |

**Ember versus Rose is worse than Tom's complaint on four species.** Rose
shipped today, so nobody has made one yet; this would have been next week's
report. Fix the palette TABLE in `scripts/build-pet-morphs-v2.py`, re-measure
every pair, and state the minimum acceptable delta you tuned to. Do not fix C1
frost alone.

**B2. The missing animation is a RENDERER GATE, not missing files.**
`js/app.js:828-840` resolves `morphSrc` and explicitly skips `animatedPetHtml`
whenever it exists. `js/petanim.js:94` takes only species and width with fixed
layer folders, and the generator has no animation-layer output at all. So
generating recoloured layers changes NOTHING on its own: the gate must pass the
morph through and select the right layer paths. The operator's claim that items
7 and 8 share a root cause was wrong.

**B3. Layer recolouring is feasible SELECTIVELY, not as a blanket pass.** The
review inspected all 18 layer PNGs and probed 16. Small extracted layers can
lose the palette cores the method needs, and passing core checks does not prove
seams survived. Treat each layer on its evidence in
`docs/reviews/r56/layer-checks.json`; where a layer cannot be done faithfully,
say so and keep the static fallback for that species rather than shipping
degraded linework. Cam's art is never degraded to win a feature.

**B4. "Size identically" is impossible as written, so it is replaced.** The
operator blamed a width comment that actually describes differences BETWEEN
species. The real discrepancy is about **3.2%**: at a requested 124 CSS px the
animated stage gives nominal art bounds of 103.89 x 102.22, while the static
path uses `FILL = 0.82` and the fractional `PET_CROP` for roughly 100.62 x
98.99. Both masters are 640x640 with 186x183 alpha bounds, so this is not a
morph-specific canvas difference. The two paths have different aspect ratios
and a still cannot match every frame of a moving pet, so exact equality would
require distortion or redrawing. **Specify a measurable contract instead:** a
named rest phase, a visible-body metric, a baseline and a tolerance, with
aspect ratio preserved. Check it with and without mass normalisation and
football wear.

**B5. Say which surfaces should move.** `petPortraitHtml` deliberately always
draws a still (`app.js:845`, `21285`, `21314`), so the Laboratory's specimens,
picker and input cards will NOT animate even after B2. Fixing `petSpriteHtml`
covers branches, reveals and the Stable card. Decide and state the intended
set. Keep CX, shiny priority, football's authorised static fallback and
reduced-motion behaviour intact.

### C. The room reads like an FAQ (items 4, 5, 6). Copy and hierarchy.
The room is 1,830px, already down from 6,612px, so length is no longer the
problem: **weight and density are**. Everything is the same size, so nothing
leads.
- The confirmation should read as `this pet + this pet → could become this or
  this`, with the art carrying it and the prose removed.
- Fix the Ember/Frost outcome layout so possible OUTPUTS are never mistaken for
  additional INPUTS in the mix (item 6, and this is a comprehension bug, not
  taste).
- Establish real hierarchy: one thing leads per screen.
- Cut text. Keep every destructive warning intact: those are load-bearing and
  Tom has never complained about them.

### D. Small, certain fixes (items 2 and 3).
- The pet-choice buttons use the wrong font. `DESIGN.md`: display is Bangers
  (`--display`) for anything with a pulse; buttons already use it elsewhere
  (`.btn` sets `--display`). Make these match.
- In "choose second pet", the already-selected pet must be visibly excluded:
  greyed and labelled, or removed. Today it looks like a dead button, which is
  worst precisely when picking two identical creatures.

## Constraints that do not move
Cam's art is never redrawn; recolours stay palette-faithful and must not
degrade his linework. No behaviour, odds, recipe or transaction changes: the
first two recipes stay 50/50 with no protection, Toxic + Rose stays 100%.
Non-gamers must never be lost. Voice stays dry and fond. No em dashes.

## Sequencing, CORRECTED
The review found the plan's claim false: **C and D both touch `js/app.js`** and
must not run in parallel. Two lanes in that file caused merge damage earlier
today.

- Lane 1: **B1**, the palette table plus a full pairwise re-measure. Art and
  the generator only, no app code. Safe alongside anything.
- Lane 2: **B2, B3, B4, B5**, the renderer gate, selective layer recolouring
  and the sizing contract. Touches `js/app.js` and `js/petanim.js`.
- Lane 3: **A2 + C + D together**, the Stable cleanup, the room's hierarchy and
  copy, the button fonts and the picker exclusion. All `js/app.js` and
  `app.css`, so ONE lane, not three.

Lane 1 runs beside either. Lanes 2 and 3 both touch `js/app.js`, so they are
sequential, and lane 3 goes first because it answers what Tom actually saw.
