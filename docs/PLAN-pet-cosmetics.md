# Pet cosmetics: the plan, and the trap under it

Written 2026-08-20 for Tom, to hand to Reggie alongside Gwart's Emporium.
Everything measured against `origin/main` @ `c3b7bc9` (v420).

## The question

Tom: "cosmetics to be sold that go ON the pet, and they have a place in the shop
to view and try on."

## What the code models today

- **`C` (Pet) is a slot on the PLAYER'S figure**, `z: 5`, behind the Body at
  `z: 10` (`data/boneheadz.js`, `BH_SLOTS`). A pet is one flat sprite the player
  equips, in the same system as a hat.
- **A pet is not a character with its own slots.** Nothing anywhere models an
  item worn BY a pet.
- **The whole pet catalogue is 6 items**: 5 non-exclusive plus the exclusive Day
  One Lizard. Once the two commons are owned, the hatch pool is exactly three:
  Drizzle (epic), Mallard (legendary), Bulldog (uncommon).
- Render entry point is `petSpriteHtml(petArtId, 76, ...)`. One sprite, one call.
- Pets DO have combat identity: `petMeta`, `petBody.kit.lineage`, shiny state,
  breeding.

## THE TRAP, and it is the most important thing in this document

Both the egg and breeding draw their pool the same way:

    js/loot.js:515   const pets = BH_ITEMS.filter(i => i.slot === 'C' && !i.exclusive);   // hatchEgg
    js/loot.js:882   const pets = BH_ITEMS.filter(i => i.slot === 'C' && !i.exclusive);   // breed

**So any new slot-C item is automatically obtainable FREE from a Mystery Egg and
from breeding, unless it is flagged `exclusive: true`.**

Ship a paid pet skin without that flag and it is a 60-dust egg away, on the same
screen that sells it. Three consequences, all bad, all silent:

1. the shop sells something the egg gives away
2. the hatch pool dilutes, so every existing pet gets rarer per hatch
3. the salvage EV moves, and it is already inverted (see below)

**Rule for any pet item added for sale: `exclusive: true`, and a guard that says
so.** That guard is ~10 lines and belongs next to `rack-theme-lint`.

## The related economy fact Reggie should know before pricing anything

A Mystery Egg costs **60 dust** and the three-pet hatch pool salvages for a mean
of **65** (`petDustValue`: uncommon 15, epic 60, legendary 120), plus a 3% shiny
bonus. That is a closed **+9% per cycle** dust loop gated only by an 8,000-step
walk, with unbounded batch size. Pet pricing sits directly on top of that.

## The fork

### Option A, RECOMMENDED: pet SKINS

Sell alternative sprites for a pet: a recolour, a variant, a costume baked into
the art.

**Why this is the cheap one: the game already ships pet variants, end to end.**
`SHINY_CHANCE` mints them, `S.shinyPets` tracks them, the `.is-shiny` class
renders them, `petDustValue` prices them on salvage. A skin is that same path
with a different sprite.

- No anchors. No per-item-per-pet art multiplication. One sprite per skin.
- Drops into the existing rack unchanged, because it is just another slot-`C`
  item, which means it inherits the try-on the shop already has.
- There is a documented recolour pipeline for Cam's art
  (`docs/pet-recolor-animation-skill.md`).
- Try-on works with no new surface: the sheet already composites
  `{ ...playerEq, [it.slot]: id }`, and `C` is a player slot.

Work: art, an `exclusive: true` flag, a rung in a theme, the lint row. Small.

### Option B: pet ACCESSORIES (a hat ON the pet)

**This is a new system, not a shop feature.** Required:

1. **Per-pet anchor points.** `PET_CROP` (`data/boneheadz.js:1997`) holds measured
   alpha bounding boxes, so you know WHERE THE ART IS. An accessory needs WHERE
   THE HEAD IS, plus a size and an angle, per pet. The pool contains a rain
   cloud, a duck and a bulldog, so one anchor derived from the bounding box lands
   wrong on most of them.
2. **Art from Cam for every item crossed with every pet**, or per-pet variants of
   each accessory.
3. **A second z-order stack** anchored to the pet sprite, independent of
   `BH_SLOTS`.
4. **A pet stage in the shop.** Today try-on composites onto the player figure;
   there is no pet-only stage to try a pet hat on.
5. **A Paddock decision.** The Paddock is where a player would expect to view and
   dress a pet, and it is on the external dev's off-limits list.

Work: large, and it multiplies with every future pet.

## Recommendation

**Ship skins now, keep accessories on the shelf.** Skins reuse a shipped system
and land inside the existing storefront; accessories need an anchor system, an
art multiplier and a new surface before a single item is for sale. If
accessories are wanted eventually, skins do not block them: they are additive,
and shipping them first tells you whether players buy pet cosmetics at all
before anyone builds an anchor rig.

## If skins are approved, the ordered build

1. **Guard first.** A lint row: every slot-`C` item that appears in any rack
   theme must be `exclusive: true`. Prove it red by removing the flag from a
   sale pet. Belongs beside `tests/rack-theme-lint.mjs`, which already parses
   the themes and the catalogue and would need about ten lines.
2. **Art in**, with `exclusive: true` on every sale pet, and names written from
   how the pet reads at 300px, not from the asset filename.
3. **A rung in a theme.** `C` is not currently one of the eight rungs, so this
   is a theme-shape decision: either a ninth rung or a rotating slot. Note the
   existing rule that no two neighbouring tiles sell the same body part, which
   `rack-theme-lint` now enforces.
4. **Re-check the egg.** Adding exclusives does not change the hatch pool, which
   is the point, but confirm it with the numbers rather than by reading the
   filter.
5. **No version stamp**: that stays with Tom and Reggie.
