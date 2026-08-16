# The Hollow: backdrop from the designer's art

Branch `ext/hollow-backdrop`, rebased onto `origin/reggie/hollow` at `db61159`
("Wire the beds module into the scene"). The commit is three ADDED files and
zero modifications, so it merges clean regardless of how the base moves.
Files: `js/hollow-scene.js`, `tests/hollow-backdrop-audit.mjs`, this report.
Nothing else touched. `js/app.js`, `app.css`, `js/hollow-art.js` unchanged.

## The contract Reggie codes against

```js
export const HLW_STAGE = { w: 390, h: 740 };
export function hollowBackdropHtml({ band })   // 'day' | 'dusk' | 'night' -> HTML string
```

The string is a set of sibling nodes meant to go straight inside `.hlw-stage`.
It is not wrapped in a single container, deliberately: the scene sits at
`z-index:0` under the beds and the keeper, and the dusk/night tint and the
fireflies sit at `z-index:8` and `9` over them, which is where the comp puts
them. One wrapper would have trapped the tint under the beds.

Every node carries `pointer-events:none`. Nothing in the string is focusable or
clickable.

## What the coverage check found

`HLW_ART` holds **27** pieces, not 28. All 27 are accounted for:
**13 drawn, 14 excused with a reason.**

Drawn: `hollow-path-stone` (13 stones) · `hollow-fence-left` ·
`hollow-fence-right` (carries the gate post) · `hollow-sign` · `hollow-shed` ·
`hollow-shed-lantern` · `hollow-crate` · `hollow-sack` · `hollow-crow` ·
`hollow-grass-tuft` (3 placements) · `hollow-compost` · `hollow-lantern-post` ·
`hollow-lantern-flame`.

Excused, with the reason each carries in `NOT_IN_BACKDROP`:

| piece | why not backdrop |
|---|---|
| `hollow-bed-frame` | the plot frame; the beds lane owns it and app.js already draws it |
| `hollow-bed-empty`, `hollow-bed-tilled` | per-bed soil state, drawn from live garden state |
| `hollow-bed-locked` | unowned bed slot, drawn from `plotsOwned` |
| `hollow-price-sign` | buy-a-bed sign, named out of scope in the brief |
| `hollow-coin-plaque` | coin balance chip, UI chrome |
| `hollow-back-chevron` | back button, interactive chrome |
| `hollow-timer-chip`, `hollow-water-needs`, `hollow-water-done` | per-bed chips |
| `crop-ember-pepper-{seed,sprout,young,ripe}` | crop growth stages, per bed |

Before the shipped build, exactly one of the 27 was in use
(`hollow-bed-frame`). It is now 14 of 27 across app.js and this module.

## Missing from HLW_ART

Three things the scene wants and the pack never shipped. None were invented.

1. **The crow's rock and ground shadow.** `hollow-crow.svg` is the bird only:
   body, wing, head, beak, eye, one leg. The comp perched it on a small inked
   rock (`M14 48 l4 -16 h24 l4 16 z`, fill `#8a6f52`) with a shadow ellipse
   under it. The crow now stands on the grass at the comp's own spot (39,152),
   just in front of the left fence run, facing the gate. It reads fine, but if
   the designer wants the rock back it needs a `hollow-crow-rock` piece.
2. **The path's two curved bands.** The dark-green edging (46 wide) and the dirt
   band (38 wide) are a single 730-unit bezier across the whole scene, not a
   trimmable piece, so there was nothing to trim. Both `<path>` elements are
   copied character for character out of `The Hollow.dc.html` and marked as such
   in the file. The stones on top of them ARE the asset.
3. **The "THE HOLLOW" sign label.** By design: NOTES.md says "Text is never
   baked in". The README promised each SVG would carry an HTML comment with the
   font/size/position for its label; **the shipped SVGs carry no comments at
   all**. The label was rebuilt from the comp's own `<text>` attributes (Bangers
   23, letter-spacing 2, `#f2e9d7`, `x=205 y=110` inside `rotate(-2 205 102)`).

The gradients (sky glow, dusk/night tints, the two warm glows, the fireflies)
are not missing art: NOTES.md specifies them as CSS values.

## What moved off the comp, and why

The comp is 900/930 tall, the stage is 740. Only pieces the crop would have
pushed off the bottom moved.

| piece | comp | shipped | reason |
|---|---|---|---|
| stepping stones | 16, cy 172-854 | 13, cy 172-718 | the last three sit entirely below the crop. The dirt band still runs off the bottom edge, which is intended. |
| compost heap | (256, 694) | (256, 676) | comp bottom was 754 on a 740 stage. Up 18. |
| lantern post | glass at y611 | y609 | the pack draws post + head as ONE 151-tall piece, longer than the comp's separate post, so it is anchored by its foot at the stage floor (740 − 151 = 589). Glass lands within 2 units of the comp. |
| grass tuft 2 | (327, 639) | (340, 620) | raising the compost brought its steam glyphs onto this tuft; measured in the render, they read as one blob at (322,654). Nudged clear. |
| 2 of 6 fireflies | comp y 780, 845 | y 700, 690 | below the crop. NOTES.md says six, so they were relocated inside the lower third rather than dropped. |
| sack | comp y136, ~24 tall | y121, 41 tall | the pack redrew the sack taller than the comp's; seated on the shed's own ground line (y162) instead of the comp's y. |

Nothing assumes twelve plots. The backdrop contains no bed geometry at all.

## Two things Reggie needs to know at the call site

1. **`#hlwCrow` no longer points at anything.** app.js has
   `<button class="hlw-bed" id="hlwCrow" aria-label="Compost heap"
   style="left:26px;top:630px;width:70px;height:66px">`. The shipped build drew
   a crow-on-a-rock there and used it as the compost affordance. The designer
   puts the crow top-left and the **compost heap bottom-RIGHT**. Measured in the
   render, the heap now occupies **x 256-368, y 676-736**. The button wants to
   move to roughly `left:266px; top:672px; width:92px; height:64px` (inside the
   stage, clear of the 40px floor). Left where it is, it sits on empty grass.
2. **app.js still emits its own tints and fireflies** at lines ~4244-4248, and
   its own inline path/fence/sign/shed/crow/tuft SVG at ~4153-4207. All of that
   is superseded by this module; leaving both in double-tints the night.

## Two smaller findings, not fixed here

- **`app.css`'s reduced-motion block does not cap `animation-delay`.** It caps
  duration and iteration-count, which stops infinite loops, but an animation
  sitting in its delay still reports `playState: "running"`. Measured: with the
  handoff's positive staggers, 8 of these 14 animations reported running 400ms
  in, the longest for 4.2s. Fixed inside this module by making every stagger a
  **negative** delay, which is exactly equivalent for an infinite loop and lets
  the iteration cap finish them. Zero running under reduce at both sizes. The
  gap in `app.css` is still there for anyone who writes a positive delay.
- **Duplicate ids.** `hlwArt` inlines the designer's ids verbatim, so
  `hollow-lantern-post` and `hollow-shed-lantern` both put `#glass` in the
  document. Harmless today; it will bite the first person who does
  `querySelector('#glass')`.
- **`crowFlap` cannot ship.** `app.css` has `hlwCrowBob` but no flap keyframe,
  and `app.css` is not mine to edit. The crow bobs; the wing does not beat.

## Verification

`tests/hollow-backdrop-audit.mjs`, run at **390x844** and **375x667**, all three
bands, screenshots measured rather than estimated.

```
cd /Users/tommiller/reggie-press/hbackdrop
HLW_OUT=/tmp/hlw-shots node tests/hollow-backdrop-audit.mjs
```

It calls `serveTree()` on the checkout and **prints the URL it chose** before
anything else. It never falls back to `boot()`'s production default. To point it
somewhere explicit: `node tests/hollow-backdrop-audit.mjs --url http://127.0.0.1:PORT/`.

Measured, healthy tree:

```
COVERAGE  27 keys = 13 drawn + 14 excused
COVER 390x844  day vs empty stage: 31.196%     COVER 375x667  30.389%
BAND  390x844  dusk 98.691%  night 99.895%     BAND  375x667  dusk 97.095%  night 97.880%
GLOW  390x844  shed window 80.199%  lantern 66.235%
GLOW  375x667  shed window 80.459%  lantern 65.090%
INERT 390x844  800 probes, 167 nodes, 0 controls   INERT 375x667  780 probes
GEOM  fence-left@6,112 fence-right@231,105 sign@136,54 shed@281,51
      shed-lantern@307,105 crate@292,136 sack@350,121 crow@39,152
      compost@256,676 lantern-post@75,589 lantern-flame@82.5,614   (identical at both sizes)
SIGN  board top measured at y81.95  (comp rect y84 minus half its 4-unit keyline)
MOTION on: 14 declared, 14 running   reduce: 14 declared, 0 running
```

### The coverage check derives its own scope

It reads the `HLW_ART` keys out of `js/hollow-art.js` at run time and asks, per
key, whether `hollowBackdropHtml` drew it. A key that is neither drawn nor
excused fails. Nobody has to remember to add a row.

The matcher is the pair (viewBox, inner markup), both of which `hlwArt` inlines
verbatim. Inner markup alone is unsound and the file proves it before trusting
it: `hollow-water-needs`' path is a literal substring of `hollow-timer-chip`'s,
and `hollow-bed-empty`/`hollow-bed-tilled` share a viewBox. The audit asserts
the pair is unique across all 27 before using it.

### Proven RED

Ten mutations, each in its own throwaway `rsync` copy under `/tmp`, deleted
after. The worktree was never mutated.

| mutation | result |
|---|---|
| add a 28th `HLW_ART` key nobody drew | `COVERAGE UNACCOUNTED: hollow-scarecrow` |
| delete `hollow-sack` from the scene | `COVERAGE UNACCOUNTED: hollow-sack` + 2 GEOMETRY |
| excuse `hollow-crow` while still drawing it | `COVERAGE CONTRADICTION` |
| `hollowBackdropHtml` returns `''` | 60 fails incl. `NOT BLANK: 0% (floor 6%)` and 6 EMPTY SAMPLE |
| `pointer-events:auto` on the backdrop | `INERT: 8 nodes` + `HIT TEST: 800/800 probes` |
| positive staggers (the app.css delay gap) | `REDUCED MOTION: 8/14 still running (hlwSway, hlwSteam, hlwFirefly)` |
| fireflies at day | `FIREFLIES day: 6, expected 0` |
| shed moved 10 units left | `GEOMETRY: measured 271,51, expected 281,51` |
| shed-window glow made fully transparent | `GLOW: changes only 0% of its own box (floor 40%)` |
| delete the night tint | `BAND night: only 2.774% (floor 60%)` |

**The last one caught a bad check of mine.** The BAND floor was originally 2%.
Deleting the night tint outright still scored **2.78%**, off the glows and
fireflies alone, and the check PASSED on the exact bug it exists to catch. A
full-stage wash measures 97-99.9%, so the floor is now 60% and the mutation goes
red. Found by mutation, not by reasoning about it.

**The glow check exists for the same reason.** Both glows are emitted,
positioned and computed-visible, and I could not see the shed one in the night
screenshot. Rather than adjust blind, the audit now renders a control frame with
the glow spans deleted and diffs each glow's own box: 80% and 66% changed. The
glows were fine; my eyeballing was not.

## What I could not verify

- **The module inside the real `openHollow`.** It is not wired in yet; that is
  Reggie's call site. The audit mounts the string into the app's own
  `.hlw-vp > .hlw-stage` on a page that has loaded the real `app.css`, and
  scales it the way `openHollow` scales it, so the renderer and the stylesheet
  are the shipping ones. Layering against the beds, the keeper and the buttons
  is not covered here and needs a run of `tests/hollow-audit.mjs` after wiring.
- **`tests/release-gate.mjs`** was not run; it is off limits for this lane.
- **A real device.** Both sizes were emulated in Chromium at dsf 2 with
  `isMobile`/`hasTouch`. No safe-area inset was faked, so the sign's clearance of
  the Dynamic Island is asserted against the handoff's y84 rule and the measured
  y81.95, not against a notch simulation.
- **Bangers.** The sign label renders in whatever the page resolves for
  `Bangers, sans-serif`. It came up correctly in the render, but the fallback
  path is not asserted.
