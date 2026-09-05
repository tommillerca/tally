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

- **Paddock compositor cost, unmeasured.** The spec's own order-of-work says
  run a filter-compositor perf pass before Phase A ships and fall the Paddock
  scene back to base art if it's expensive (88px tiles, many on screen at
  once). This session did not build or run that perf pass; `petSpriteHtml`
  currently threads the morph tint into the Paddock scene the same as every
  other surface. Needs a decision: measure it, or ship Paddock at base for now.
- **Which species should have morphs.** Section 1.4 lists a tint entry for all
  six species including C6 (Bumbleseal), but section 2.2's own "25 (species x
  morph) pairs" language, and the 200-egg sim's acceptance criterion ("an
  owner of all five species"), only account for five. This build keeps C6
  drawable in colour (she can still hatch a non-base morph, rarely, since the
  morph rides the egg independent of species) but excludes her from the
  fresh-first "still needs discovering" bookkeeping (section 3 above). Confirm
  that split is the intended one.
- **Reveal copy wording.** Implemented literally per spec section 2.5: "A
  Frost Bulldog!" (article + `MORPH_LABEL` + species name), collapsing to "A
  Bulldog!" at base morph. Section 7's fuller copy ("Three of a kind fuse")
  is Phase C language and was not pulled forward.
