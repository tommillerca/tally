# The Hollow: beds, crops, chips and the price sign

`js/hollow-beds.js` draws the Hollow's beds from the designer's own pieces in
`js/hollow-art.js` instead of the hand-written inline SVG in `openHollow`.
Branch `ext/hollow-beds`, off `origin/reggie/hollow`. Guard:
`tests/hollow-beds-audit.mjs`.

## The contract Reggie is coding against

```js
export const BED_BOX = { w: 84, h: 60 };
export function hlwBedArt(plot)        // one bed's art, HTML string
export function hlwChipHtml(plot)      // that bed's chip, or '' when it has none
export function hlwPriceSignHtml(price)// the buy-a-bed sign
```

Nothing else is exported. The call site, exactly:

```js
<div style="position:absolute;left:${cx - 42}px;top:${cy - 30}px;width:84px;height:60px;
            pointer-events:none;z-index:2" id="hlwBedArt${i}">${hlwBedArt(plot)}</div>
<div style="position:absolute;left:${cx}px;top:${cy - 52}px;z-index:5">${hlwChipHtml(plot)}</div>
<div style="position:absolute;left:${spotX - 31}px;top:${spotY - 46}px;z-index:3">${hlwPriceSignHtml(price)}</div>
```

Three things about that recipe, all of them load-bearing:

1. **The chip carries no left/top of its own.** `.hlw-chip` is already
   `translateX(-50%)`, so it centres itself on whatever anchor the wrapper sets.
   No width-dependent offset, because that is what broke when the label changed
   length. `.hlw-chip.thirst`'s measured -7px nudge in app.css still applies and
   is what keeps it off the price sign.
2. **The chip now carries `white-space: nowrap` inline.** Found by looking at the
   render, not by reasoning: the anchor wrapper is absolutely positioned with no
   width, so the chip's containing block is 0 wide, shrink-to-fit hands it
   min-content, and `1h 30m` arrived stacked on two lines at 38.4px tall.
   `.hlw-chip` has no white-space rule and app.css is another lane's file, so it
   rides on the span. The audit pins chip height under 26px.
3. **`plot` takes two optional flags** on top of a `gardenState().plots` entry:
   `locked` (a ghost slot you do not own yet) and `tilled` (an empty bed that has
   been worked, the rake pass between the tap and the seed landing). Both default
   to absent, so a raw plot object works unchanged.

**Boxes.** `BED_BOX` 84x60 is the SOIL footprint, centred on the bed spot. A ripe
plant is taller than its own bed and grows up out of the top: measured in the
render it reaches **17.1px above the box**, and **0.0px** outside it left, right or
below. Beds are 95px apart vertically, so that headroom lands on grass. The sign
box is **66x70**, top-left at the wrapper; at 1,500 and at 4,000 nothing paints
outside it (measured overflow 0 at both). Placed as above, the board lands exactly
where the shipped sign sat, centred on `(spotX, spotY - 27)`.

**The module emits art only.** No buttons, no hit areas; every root is
`pointer-events: none`. 375 `elementFromPoint` probes across the rendered states
never landed on module output. The 60px bed buttons stay yours.

## Which crops have real art

| Crop | Seed | Sprout | Young | Ripe | How it is drawn |
|---|---|---|---|---|---|
| Ember Pepper | yes | yes | yes | yes | the designer's four pieces, untouched, in their own colours |
| Marrow | fallback | fallback | fallback | fallback | Ember Pepper silhouette, tinted `#d7cba6` |
| Graveroot | fallback | fallback | fallback | fallback | tinted `#a7b24c` |
| Bog Mushroom | fallback | fallback | fallback | fallback | tinted `#9c8fa0` |
| Sinew | fallback | fallback | fallback | fallback | tinted `#9a7a6a` |
| Grave Salt | fallback | fallback | fallback | fallback | tinted `#c8bfae` |
| Ectoplasm (rare) | fallback | fallback | fallback | fallback | tinted `#9fe3cf`, same mint the shipped build already used |

**One crop out of seven has art.** The tints are not invented: they are
`BH_ICON_TINTS`, the colour the app already gives each ingredient, so the hue in
the bed matches the hue on the seed in the pouch.

**No new crop art was generated.** That art is Cam's hand and a separate approval,
explicitly held.

**The honest limit of the fallback, stated rather than buried:** the sprout and
young pieces are all leaf and carry no tintable fruit, so **at those two stages
every crop looks identical**. Only the seed body and the ripe fruit take the tint.
A player growing Sinew and Bog Mushroom side by side cannot tell them apart for
the middle two thirds of the grow. The bed chip does not name the crop either.

## What I would need from the designer

1. **Seed / sprout / young / ripe for the other five commons plus Ectoplasm.**
   Six crops x four states = 24 pieces, in the same `{ vb, p }` shape. That is the
   whole fix and everything below is a workaround for not having it.
2. **Failing that, one tintable element in the sprout and young pieces** (a bud, a
   cap, a stem node) with its own fill, so a fallback crop is at least identifiable
   before it ripens. This is much cheaper than 24 pieces and removes the worst of
   the limitation above.
3. **A ripe silhouette that is not a berry.** Ectoplasm is a spore and Sinew is
   meat; both currently ripen into a round pepper in a different colour.
4. **A call on `hollow-bed-locked`'s value.** Its fill `#5c6e3e` is within 7/255
   of the grass gradient behind it, so the ghost slot reads only through its
   dashed outline: measured, the whole locked state differs from bare background
   in just **2.50%** of pixels, against 41% for an owned bed. If that is the
   intended ghost effect, fine, and I have left it exactly as drawn. If not, it
   wants either a darker fill or a heavier dash.

## Pieces I own that are deliberately NOT drawn

Each is declared in `NOT_IN_BEDS` in the audit, which fails if the reason is
missing, if the piece has vanished from `HLW_ART`, or if the module renders it
anyway.

| Piece | Why not |
|---|---|
| `hollow-bed-frame` | the five-slot frame is scene chrome drawn once by `openHollow`, not per-bed art |
| `hollow-timer-chip` | a fixed 64x22 SVG pill cannot flex to a `2h 58m` label, and its baked droplet would put a droplet on non-thirsty beds. `.hlw-chip` already carries its spec: `rgba(13,12,18,.6)`, r11, h22 |
| `hollow-water-done` | a tick droplet on every watered bed is the exact regression the shipped thirst-cue fix removed. "Watered" is carried by the ABSENCE of the thirst chip |
| `hollow-coin-plaque` | the coin balance is HUD chrome, not a bed, and the contract has no export for it. It is ready for whoever owns the HUD: `hlwArt('hollow-coin-plaque', { w: 92 })` |

One deviation worth naming: the thirst droplet uses `hollow-water-needs`'s path
but its fill is swapped from the designer's `#9fd0e8` to `currentColor`. Pale blue
on the lime `--accent` chip is nearly invisible; ink measures 52% coverage of the
droplet's own box.

## Verified

Every number above is measured in a real browser at 390x844 and 375x667, against
a local server, never the live site.

```
node tests/hollow-beds-audit.mjs 390 844      # prints the URL it serves
node tests/hollow-beds-audit.mjs 375 667
node tests/hollow-audit.mjs 390 844           # still green
node tests/hollow-audit.mjs 375 667
node tests/hollow-audit.mjs 390 844 reduce
```

State distinctness, all 28 pairs, closest first: `empty|tilled 1.15%`,
`tilled|sprout 1.20%`, `tilled|seeded 1.61%`, `empty|sprout 2.09%`,
`seeded|sprout 2.31%`. Floor 0.90%. `empty` and `tilled` are the closest pair
because the designer's two soil pieces differ only in their rake marks; a genuine
duplicate measures 0.00%.

Reduced motion: 2 of 2 animations running with the setting off, 0 running with
`prefers-reduced-motion: reduce` emulated. The first half of that is the point.
An empty animation set is treated as a failure, because a reduce assertion over
nothing proves nothing.

Thirteen mutations were proven red in a throwaway copy under `/tmp`, deleted
afterwards: an unused piece, a stale exclusion, a piece excused while still
rendered, a blank state, the rare crop drawn identically to the common one, the
droplet back on every growing bed, a button emitted by the module, a price that
overflows the sign box, a ripe plant past its headroom, an animation that ignores
reduce, no animation at all, the chip nowrap removed, and `BED_BOX` changed out
from under the caller. The pristine copy was green in the same loop.
