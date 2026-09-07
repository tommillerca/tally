# The Kennel: pet morphs (Phase A)

2026-09-05. Spec: `BUILDpetskennel20260905.md` (Downloads, not in the repo).
Tree references there are v471 (96c1104a); this branch is `feat/kennel-phase-a`
off a later tip, so line numbers in the spec are stale -- the anchors are
function names. **Phase A only** (the spec's sections 1 and 2). Phases B
(stages), C (fusion) and D (egg faucet) are not started.

Owner rulings that do not move (spec section 0): morphs are cosmetic, never a
stat (`petBattleStats`, `buildBattlePet` never receive one); no glow, anywhere;
no dust in breeding/fusion (n/a to Phase A); the species stays a hatch-time
roll after `db.take`, rng order in `hatchEgg` unchanged, only the MORPH moves
to grant time; `js/paddock.js` and `js/paddock-cards.js` are off limits; an
unknown morph value renders base; no new PNGs (morphs are CSS filters); CX
(the Founder's Lizard) is exempt; shiny forces base.

## 1. What exists

| Thing | Where | Note |
|---|---|---|
| The morph set, weights, tiers, labels | `js/pets.js` | `MORPHS`, `MORPH_WEIGHT`, `MORPH_TIER` (tier order for Phase C fusion, unused so far), `MORPH_LABEL`, `isMorph` |
| The roll | `js/pets.js` `rollMorph` + `ownedPairs` | pure, fresh-first over the five ordinary hatch species (`MORPH_SPECIES`), falls through to a plain `MORPH_WEIGHT` draw once every pair is owned |
| The grant | `js/loot.js` `eggRow` | rolls the morph at grant, stores it on the egg's inv row |
| The dupe pool fix | `js/loot.js` `pickRandomPet` | uniform pick over all five species (was excluding the two Common ones, C3/C4) |
| The read | `js/loot.js` `hatchEgg` | reads the egg's own morph; shiny or an unknown value forces base; no new rng() call |
| The instance field | `js/loot.js` `addPetInstance` | `morph` (default `'base'`), validated at the write (shiny forces base, unknown value forced base) |
| The tint table | `js/app.js` `MORPH_FILTER` / `MORPH_TINT` + `petTint` | one CSS filter per morph, currently identical across all six species (Cam's to tune per species later); `petTint(petId, morph)` is the one helper every draw path resolves through |
| The egg-shell tint | `js/app.js` `eggTint` | species-agnostic (the species isn't decided yet), same filter table |
| The cache | `js/app.js` `S.petMorphs` + `refreshPetMorphs` | `{ species: morph }` for the BEST instance of every owned species (mirrors `S.shinyPets`), refreshed at boot and after anything that can mint a pet |
| The eight draw paths | `js/app.js` / `js/petanim.js` | see section 2 below |
| The snapshot field | `js/app.js` `socialSnapshot`, `snapPetMorph` | whitelisted with `isMorph`, unknown/missing falls back to base on every reader |

## 2. The draw paths

Every path resolves a morph string and passes it through `petTint`/`eggTint`;
none of them guess.

1. `croppedPetImg` -- the filter goes on the BASE `<img>` only, via a new
   `extraStyle` parameter on its internal `layer()` helper, never on the
   `.petcrop` wrapper (a wrapper filter would also catch the football tint
   spans, which must read true) and never on a worn `<img class="pw">` layer
   (Bumbleseal's accessories share her canvas).
2. `animatedPetHtml` (`js/petanim.js`) -- a `tint` parameter applied to the
   outer `.petanim` box's own inline style, for the three animated species
   (cloud, catfish, lizard) plus the lizard's amethyst (CX) skin, though CX
   itself is never given a non-empty tint (exempt).
3. `petSpriteHtml` -- resolves the instance's morph (explicit, or `S.petMorphs`
   when the caller doesn't have the instance) and threads it into both 1 and 2.
4. `petPortraitHtml` -- same resolution, one draw call.
5. `avatarLayersHtml` -- the third path, for a pet stacked INSIDE the avatar
   (splash, leaderboard, level-up sheet, boneyard map marker, arena foe/mirror):
   `opts.petMorph`, the same shape `opts.shinyPetId` already used.
6. The hatch reveal canvas (`drawTrimmedArt`) -- `ctx.filter` set before the
   draw, reset after; a fifth parameter threaded through the tier-up recursion.
7. The backpack egg card -- a `filter` style on the shell's own wrapper span,
   keyed by the egg row's morph.
8. The Pit (`openFight`, `buildFighter`) -- the player's own equipped instance's
   morph rides `fighter.petMeta.morph`, threaded to the in-fight sprite; the
   foe/mirror/add plates go through `avatarLayersHtml`'s `petMorph` (5).

Surfaces driven: Today's hero, the Stable card, the Backpack egg card, the
hatch reveal, the breed picker and its reveal, Crew's fan card, a friend's
profile hero and paddock row, the leaderboard, the splash, the level-up sheet,
the Boneyard map marker, the Shop's try-on rack, and the Pit (both your own
pet and a foe's/mirror's/add's). The Paddock card slider
(`js/paddock-cards.js:60`) is explicitly off limits per the spec and draws
base art until its own owner threads the morph through; this is a known,
logged gap, not an oversight.

## 3. The bug the 200-egg sim caught

`rollMorph`'s fresh-first accounting originally scoped "which species still
need this colour" to every non-exclusive slot-C pet, which includes C6
(Bumbleseal): a 1%, mostly shop-bought hatch that almost no player owns in any
colour. That kept `(C6, base)` permanently "unowned", which kept `'base'`
itself in the fresh-first candidate set forever alongside the four real
colours -- and `base` carries the highest `MORPH_WEIGHT` (40 of 98). A
simulated player who owned all five ordinary species in base morph hatched
nothing but base across 200 draws, 30/30 trials.

Fixed by scoping `MORPH_SPECIES` to the five ordinary dupe-pool species
(C1-C5), matching the spec's own "25 (species x morph) pairs" language (5x5,
not 6x5). Re-measured after the fix: 0/30 trials missed a single one of the 25
pairs across 200 draws; the same two-eggs-one-day check (a player missing
three species) never minted the same species twice across 200 trials.

## 4. Tests

- `tests/unit.test.js`, `KENNEL` rows: `rollMorph`'s distribution (20,000
  draws, within 1.5% of `MORPH_WEIGHT`) and its fresh-first rule (a single
  unowned pair is drawn every time); `hatchEgg` reads the egg's morph with no
  new rng() call, shiny forces base, a missing or unknown morph reads base;
  `addPetInstance` refuses an unknown morph and shiny still forces base; the
  200-egg sim and the two-eggs-one-day sim.
- `tests/pet-pool-audit.mjs`: rewritten SPLIT (even split is now over five
  species, not three) and NEVER (commons are legitimately in the pool now, only
  an exclusive pet is banned) rows, plus a new DUPE-POOL row pinning both
  Commons reachable; SHARED, SHINY-ART and SHINY-MINT rows unchanged.
- `tests/pet-morph-audit.mjs` (browser, `HEADLESS_MODE=shell`): real pixel
  sampling (a canvas draws the element with its own computed CSS filter
  applied, then reads the decoded pixels back) on Today's hero and the Stable
  card, proving the tinted render's mean colour actually differs from a
  base-morph control; and on Bumbleseal wearing an accessory while morphed,
  proving her base layer differs and her worn layer's pixels are unchanged
  (delta 0.00 measured) whether she is coloured or not.
- `tests/figure-audit.mjs` STACK row re-run clean (41/41): the new `petMorph:`
  argument on every `avatarLayersHtml` call sits on the same line as the
  existing `shinyPetId:` argument the STACK check scans for, so nothing about
  that check needed to change.
- `tests/memory-census.mjs` re-run clean: no screen crossed its ceiling with
  the filters in place. This does NOT measure compositor/paint cost of CSS
  filters on many sprites, which the spec (section 6, item 7) explicitly flags
  as unmeasured and gates the Paddock scene's render on -- see Open questions.

## 5. Open questions for Tom

- **Paddock compositor cost, unmeasured.** ~~The spec's own order-of-work
  says run a filter-compositor perf pass...~~ MOOT 2026-09-05 (section 6): a
  morph is a PNG variant now, decoded exactly like any other pet colourway
  (same tiering, same file count) -- there is no CSS filter left to composite,
  so this concern does not apply. `tests/memory-census.mjs` re-run clean with
  the variants in place (Paddock 85.1 MB, under the 90 MB ceiling, unchanged
  by morphs since exactly one image decodes per pet regardless of which
  variant it resolves to).
- **Which species should have morphs.** RESOLVED 2026-09-05 (see section 6
  below): Tom ruled Bumbleseal (C6) is a normal species now, in the
  fresh-first accounting and the 30-pair grid, same as C1-C5. The Kennel
  screen's own collection grid (section 8, `feat/kennel-ui`) counts her the
  same way -- 6 species x 5 morphs = 30 cells -- while `rollMorph`'s
  fresh-first bookkeeping in `js/pets.js` (section 3 above, unrelated) stays
  scoped to hatch-weight fairness across the five species that actually cycle
  through the egg faucet; two separate questions that land on the same
  answer.
- **Reveal copy wording.** Implemented literally per spec section 2.5: "A
  Frost Bulldog!" (article + `MORPH_LABEL` + species name), collapsing to "A
  Bulldog!" at base morph. Section 7's fuller copy ("Three of a kind fuse")
  is Phase C language and was not pulled forward.

## 6. Kennel palettes (2026-09-05): PNG variants replace the filter table

Tom's ruling, same day as Phase A shipped: "morphs are PER-SPECIES Cam-faithful
palettes shipped as PNG variants, the CSS filter table is replaced." Three
changes, one branch (`feat/kennel-palettes`, off `feat/kennel-phase-a`):

1. **The art.** `scripts/build-pet-morphs.py` recolors each species' own master
   (`assets/bh/C/{C1..C6}.png`) into `assets/bh/C/morph/<species>__<morph>.png`,
   at that master's own resolution (C6 stays 2048; nothing is resized down).
   Method, matched to the approved mockup
   (`scratchpad/kennel/work/recolor-morphs.py`,
   `scratchpad/kennel/palette-table.md` in the integ2 worktree): protect Cam's
   ink (luma < 0.22) and eye-white/teeth/cel-highlight dots (V > 0.85, S < 0.18)
   byte-identical in every morph; cluster the remaining fill pixels into hue
   families by a weighted hue histogram (peak-pick + one circular-mean
   refinement, the same idea `scripts/football-masks.py` uses for team
   clusters); remap every cluster to an ABSOLUTE target hue per morph (ember
   14deg, frost 200deg, toxic 98deg, midnight 254deg) rather than a rotation
   delta -- the actual fix for "ember reads blue on the Beardie", since a
   `hue-rotate()` chain's output hue depends on the input hue and an absolute
   target does not; stretch saturation proportionally around each cluster's
   own median (internal shading survives); leave V pixel-for-pixel untouched
   except midnight, whose three luminance tiers (dark/medium/dusk, anchored at
   V 0.60/0.75/0.85) were ALL built at the time, because the tier was not yet
   decided (below) -- SUPERSEDED, see section 9: the v2 recolour Tom approved
   2026-09-06 ships exactly one midnight, no tier choice;
   nudge each cluster's own brightest ~18% of V (Cam's cel-highlight facet) per
   morph. 36 masters (6 species x 6 morph candidates: ember/frost/toxic x3
   midnight tiers), 2.17 MB total. `scripts/build-bh-thumbs.py`'s KEEP regex
   and `data/boneheadz.js` `BH_THUMB_RE` both gained a `morph/` alternative
   beside the existing `shiny/` one (mirrored, one-line each), so the folder
   tiers exactly like every other slot: 108 thumbnail files (192/384/trim x 36
   masters), `--check` clean.
2. **The gate.** `js/pets.js` gains `MORPH_ART` (which species carry morph art
   -- a plain membership list mirroring `SHINY_ART`, js/loot.js -- C1-C6, CX
   exempt), `MIDNIGHT_TIER` (`'dark' | 'medium' | 'dusk'`, defaults `'medium'`
   -- the one-line switch that ships Tom's pick once he makes it, since all
   three tiers are already built and thumbed -- REMOVED in section 9, the v2
   art ships one midnight, no switch needed), and `morphAsset(petId, morph)`
   (the path resolver: '' for base/CX/unknown morph/an unlisted species, else
   the variant path -- mirrors `bhAsset`). `js/app.js`'s old `MORPH_TINT` (a
   CSS filter table shared by every species) and `petTint` are gone; every
   draw path that used to call `petTint` now resolves `morphAsset` and passes
   its result as the existing `srcOverride` parameter every one of them already
   had for shiny (`croppedPetImg`, `petSpriteHtml`, `petPortraitHtml`,
   `avatarLayersHtml`'s C slot, the hatch reveal's `drawTrimmedArt`, the try-on
   rack's two `petTint` call sites). `MORPH_FILTER` (the flat per-morph CSS
   filter table) survives ONLY for the backpack egg shell's tease (`eggTint`):
   the species is not decided until hatch (rule 0.4), so there is no petId to
   resolve a variant PNG for. **The three animated species (C1 cloud, C3
   catfish, C4 lizard) have no morphed layer art** -- the build script recolors
   the flat master, not their separate layer PNGs (body/eyes/drops/shadow,
   `js/petanim.js`) -- so a non-base morph now forces the static cropped image
   instead of animating, the identical trade already accepted for the football
   kit (`wearsFootball`, 2026-09-04): while morphed, cloud/catfish/lizard hold
   still; base morph animates exactly as before. This is a considered choice,
   not an oversight -- see "Assumptions this session made" below.
3. **Bumbleseal.** Tom: "roll Bumbleseal into things, her time as
   shop-exclusive has passed." Her catalogue entry (`data/boneheadz.js`,
   `scripts/build-cosmetics.py` SPECIALS) no longer carries `hatchChance`, so
   `pickRandomPet` (`js/loot.js`) draws her at the same even share as C1-C5 in
   both the fresh-species pool and the owns-everything dupe pool; `js/pets.js`
   `MORPH_SPECIES` is back to all six, so fresh-first morph accounting counts
   her the same as everyone else (the exact pathology that excluded her in
   Phase A -- a species nobody ever owns keeping 'base' permanently "fresh" --
   cannot recur now that she is not rare). She still SELLS for 50,000 coins in
   Gwart's Menagerie (`PET_SHOP.pet`, `buyPetItem`) and her five accessories
   are still cash-shop-only -- both untouched, independent of the egg pool.
   `tests/pet-pool-audit.mjs`'s SAMPLE/RATE pair (pinned her at exactly 1%) is
   gone; SPLIT now grades her inside the same even-share row as C1-C5, with
   `expected`/`reserved` computed off the catalogue (not hardcoded to "nobody
   has hatchChance today") so a future shop pet declaring the field is still
   graded correctly.

### Assumptions this session made (state them, since the brief didn't rule on them)

- **Animated species force static while morphed.** The brief said "replace the
  CSS filter table" and listed `animatedPetHtml` via `js/petanim.js` as a
  consumer to thread. Since the build script only recolors the flat master and
  not the animated layer stack, and since C4 (the Beardie/lizard) IS one of the
  three animated species -- the exact species Tom's own bug report named -- I
  judged that reusing a CSS filter for animated species specifically would
  silently leave the reported bug unfixed for her. Forcing the static canvas
  instead (mirroring the already-shipped football-kit trade) fixes it
  completely and adds no new mechanism. If Tom wants morphed animation instead,
  that needs morphed layer PNGs for cloud/catfish/lizard, which is new art and
  new script work, not a wiring change.
- **Midnight ships all three tiers on disk today**, keyed by filename suffix
  (`__midnight-dark.png` / `-medium.png` / `-dusk.png`), with `MIDNIGHT_TIER`
  choosing which suffix `morphAsset` resolves to. This means all three exist,
  thumbed, in the shipped tree right now (rather than only the chosen one),
  ~0.7 MB of the 2.17 MB total -- the read of "generate all three... one-line
  change ships his pick" that seemed most literal and required no follow-up
  script run when Tom decides. SUPERSEDED, see section 9: this whole build was
  a placeholder pending the real recolour; the approved v2 art ships one
  midnight and `MIDNIGHT_TIER` is gone.

## 7. Tests (kennel palettes)

- `tests/unit.test.js`, KENNEL rows extended: `rollMorph`'s fresh-first now
  covers all six species (a new row pins that a gap on C6 specifically is
  still counted, prove-red by reverting `MORPH_SPECIES` to five); the 200-egg
  sim owns and grades all six species, 30 pairs; the two rng-count hatchEgg
  rows dropped from 3 to 2 calls (`pickRandomPet`'s old C6 shop-gate roll is
  gone along with her `hatchChance`) -- re-measured directly rather than hand-
  derived, since the catalogue lists C6 BEFORE C1-C5; new rows: `MORPH_ART`
  resolves all 30 (species, morph) pairs to a real file at every tier (master
  + 192/384/trim), CX/an unknown morph/an unlisted species all resolve to base,
  all three midnight tiers exist on disk and `morphAsset` resolves to the one
  `MIDNIGHT_TIER` names (this row and the `MIDNIGHT_TIER` constant are gone as
  of section 9: v2 ships one midnight), and Bumbleseal hatches at the same
  ~1/6 share as C1-C5 over 20,000 seeded draws.
- `tests/pet-pool-audit.mjs`: SAMPLE/RATE (pinned C6 at 1%) replaced with a
  SAMPLE row pinning no hatch-chance gate; SPLIT now grades all six species
  with a catalogue-derived `reserved`/`expected` rather than a formula that
  went NaN the moment `hatchChance` was removed.
- `tests/pet-morph-audit.mjs` (browser, `HEADLESS_MODE=shell`): rewritten from
  a CSS-filter audit to a PNG-variant audit. CONTROL/TINT now check the real
  `currentSrc` an `<img>` resolved to (base master vs `/morph/` variant) instead
  of `getComputedStyle().filter`; a new INK row loads the two REAL served files
  (preferring the untiered master via `data-full` over a thumbnailed tier, so a
  Lanczos-resize artifact on Bumbleseal's 2048-to-384 downscale cannot read as
  an ink defect) and diffs every pixel under luminance 0.22 in the base file,
  requiring max per-channel delta <= 2 -- measured 0 on both graded species.
  Proved red by making `morphAsset` always return `''`: TINT and ACCESSORY's
  variant-PNG rows fail by name, pixel-diff rows read delta 0.00, CONTROL/INK
  stay green throughout (indistinguishable from "nothing was ever morphed",
  exactly the failure mode those rows exist to catch).
- `tests/memory-census.mjs` re-run clean with the variants on disk: every
  screen stays under its ceiling (Paddock 85.1 MB, closest to the 90 MB limit,
  pre-existing and unmoved by morphs since exactly one image decodes per pet
  regardless of which variant it resolves to), and every TIER row confirms
  pet art is still served off the 192/384 sheet, never a bare master.

## 8. The Kennel screen (feat/kennel-ui, 2026-09-05)

Where it lives, and why: `scratchpad/kennel/KENNEL-UX.md` (the design plan) is
the full argument; the short version is that the Stable is already "where a
player goes to decide things about a pet", so the Kennel is one button in its
header (`openStable`'s sheet-head, next to Done) opening a sibling sheet
(`openKennel`, `js/app.js`), not a sixth Today door and not the Paddock
(off limits this phase, unchanged).

What it shows, in order:

- **Your pets**, one row per OWNED species (not per copy), a thumbnail tinted
  by the highest-tier morph that species has found, five dots showing which of
  the five colourways are owned, and a caption naming what a tapped dot is (or
  "Not hatched yet." if it is not owned).
- **Gwart's line**, plain language for the cosmetic-only rule, sitting BELOW
  the roster rather than above it: an earlier draft put it first and blew the
  roster's own screen budget at 320x568 with all six species owned (693px of
  568, 125px past the fold) -- moving it cost nothing else, since nothing
  requires it to be first, only present.
- **Collection**, the 30-cell grid (6 species x 5 morphs, Tom's ruling above):
  an owned cell draws the pet in colour at the 192px thumb tier; an unowned
  cell draws the same species' base art, desaturated, with a lock glyph --
  never a broken image, never a preview of the morph tint it would get.

No stat line, no dust, no glow anywhere (Tom's ruling, matches the Paddock's
own "no glow on pets" standing rule): ownership is colour and opacity only,
which keeps the added decode count to one thumbnail per owned species in the
roster plus one per grid cell (30), never a second image per state. Filling
the whole grid earns nothing yet (no badge, no payout); that is an open reward
decision, not shipped here.

Guard: `tests/kennel-audit.mjs` (browser, gate-registered). BUTTON pins the
real header button opening the real sheet; GRID pins the cell count at 30;
OWNED and UNOWNED pin that a granted pair draws unlocked-and-decoded while an
ungranted one draws the locked placeholder, decoded, never a 404; ROSTER pins
one row per species actually granted (through `addPetInstance`, the same
writer `hatchEgg` and `grantPet` both route through), not the whole catalogue;
GWART pins the explainer line's text; FIT pins that all six roster rows sit
above the fold with no scroll at both 390x844 and 320x568. Proven red in a
`cp -R` copy, seven mutations, one row failing in each -- see the file's own
header for the exact FAIL lines.

## 9. Kennel v2: the approved recolour replaces the palette build (2026-09-06)

Tom on the v2 recolour sheet: "now this is quality work. approved." Wired in
the same day. Two changes from section 6/7's palette build, both because the
old build was always a placeholder pending the real recolour, not a shipped
final:

1. **The art.** `scripts/build-pet-morphs-v2.py` (region-aware: every visible
   pixel is explained as a blend of two of the species' own declared fill
   regions, each remapped to an absolute target hue per morph with its own
   S/V structure kept -- `docs/pet-morphs-v2/table.md` is the per-region
   source-to-target table and its own ink/white/cream-identity checks) is the
   only morph generator now. It ships straight into `assets/bh/C/morph/` via
   `--ship` -- there is no `morph-v2/` staging folder in the tree, and
   `scripts/build-pet-morphs.py` (section 6's build) is deleted: nothing else
   referenced it once its output was replaced pixel-for-pixel by the same
   filenames.
2. **One midnight, not three.** Section 6 built three provisional luminance
   tiers (`dark`/`medium`/`dusk`) because the pick was not yet made; v2 ships
   exactly one `<sp>__midnight.png` per species (24 files total: 6 species x
   4 morphs -- ember/frost/toxic/midnight), so `js/pets.js` loses the
   `MIDNIGHT_TIER` constant and `morphAsset`'s tier-stem branch: the stem is
   just the morph name now, same shape as ember/frost/toxic. Every reference
   to `MIDNIGHT_TIER`/`midnight-dark`/`midnight-medium`/`midnight-dusk` in
   code, tests and docs was removed or re-premised with this note; the
   `tests/unit.test.js` KENNEL row that pinned three-tiers-on-disk is gone
   (replaced by a row pinning exactly one midnight file per species).

Everything else in section 6 (the gate shape, `MORPH_ART`, the per-draw-path
wiring, the animated-species-forces-static trade, Bumbleseal's even hatch
share) is unchanged -- v2 is a drop-in art swap at the same paths, not a
new mechanism.

## 10. QA round 39 (2026-09-06): the Kennel after a hostile pass

HANDOFFr3920260906.md, KENNEL and GRID lanes, measured on integ/day5 v483 and
re-verified on v488 before fixing. Branch `kennel/r39`.

- **R39-13, the wrong copy's colour.** `refreshPetMorphs` (js/app.js) filled
  `S.petMorphs` from `bestInstance`, which sorts on lineage then shiny and
  keeps the first-hatched copy on a tie, while the Pit reads the equipped
  instance. Now the EQUIPPED copy answers for its species (`bestInstance` only
  for species with no equipped copy), and `ownPetMorph` re-reads before
  answering, because the Stable's EQUIP button swaps the copy without touching
  the cache and Today repaints off it on the way back. One helper, so the
  splash, Today's hero, the try-on rack, the level-up sheet, the Crew hero and
  the Boneyard marker all agree with the Pit.
- **R39-14, `js/paddock.js` exception (dated 2026-09-06).** Section 0 marks
  `js/paddock.js` off limits for the Kennel spec's scope. `paddockRoster()`
  carried `shiny` but not `morph`, so the consumer's `morph: r.morph` in
  `js/app.js` was always undefined and every copy of a species drew the same
  colour in your own field while a friend's field was right. One field added
  beside `shiny` (`morph: x.morph`), nothing else in the file touched. The
  card slider (`js/paddock-cards.js`, R39-22) is still off limits and still
  draws base art.
- **R39-8/9, art sized from the viewport.** `openKennel` computed a cell size
  from `window.innerWidth`, but `.sheet` caps at 600px, so above 605px the art
  overflowed its clipped cell (43% visible at 1280x800) and a size frozen at
  open survived a rotation (154px art in a 48px cell). `croppedPetImg`'s
  layers are percentages of `.petcrop`, so the box is drawn at a nominal 48px
  and `app.css` sizes it to the grid track (`.k-cell .petcrop { width: 100% }`,
  `!important` over the inline px): no JS measurement, no resize listener.
- **R39-10, the counter.** `owned.size` counted CX. `ownedCellCount`
  (js/pets.js) counts only pairs with a cell.
- **R39-11/23, the control.** The 10px `.k-dot` was the control (click-only,
  Enter and Space dead) and the 62px `.k-cell` had no handler. The cell is a
  real `<button>` now (48px at 320 wide, keyboard for free, `aria-pressed`);
  pressing it names the colourway in the row's own label and pressing it again
  restores the species name. The dots are indicators (`aria-hidden`).
- **R39-6/30, the layout.** The caption ellipsises on one line, so a collector's
  "Ember, Frost, Toxic, Midnight owned" cannot grow the row past the 320x568
  fold; head and cells share one `grid-template-columns: repeat(5, minmax(0,
  1fr))` so the headers cannot drift off their columns.
- **R39-21, the egg shell.** `MORPH_FILTER`'s hue-rotate is gone. `eggTint`
  returns a flat palette colour (`MORPH_SHELL`, hues from the v2 recolour
  targets) multiplied onto the shell through a mask of the shell itself.
  Measured: an Ember shell went from mean RGB 150,153,181 (blue) to 155,71,32.
- **R39-32, reported.** Long pet names now ellipsise in the roster and the
  grid labels (a trivial CSS half); a missing morph PNG still leaves a blank
  box (`THUMB_FALLBACK` removes the image), not reachable with today's
  catalogue, left as is.

Guards: `tests/kennel-audit.mjs` (COUNT x2, LINE, FIT re-premised to the full
30-pair roster, HIT, HEAD, TOGGLE, KEYS, CLIP x2), `tests/pet-morph-audit.mjs`
(EQUIPPED x2, PADDOCK, EGG), `tests/unit.test.js` (`ownedCellCount`). Every
new row was run red against the integ/day5 code with the new tests in a
throwaway copy; the FAIL lines are in each file's header. One honest gap: the
re-premised FIT row stayed green on the OLD code on this Mac (last row bottom
555.125 of 568), because this Chromium fits the longest caption at 320 by
about 9px where the QA rig's Linux fallback font wrapped it; LINE (at 300
wide, with a SETUP row proving the overflow is real) is the row that goes red
for R39-6 here.
