# Crate reveal — implementation notes

Implements `Crate Reveal.dc.html` (Claude Design handoff) against the shipping app.
This is production code, not a mockup: the changes live in the real `app.css` /
`js/app.js` in this folder, which are verbatim copies of `tommillerca/tally@main`,
so the diff applies to the app repo as-is.

## Files

| File | Change |
| --- | --- |
| `js/crate-fx.js` | **new.** The ray/dust burst, as raw WebGL. |
| `app.css` | pack-reveal section rewritten (`.pack-count` → `@media (prefers-reduced-motion)`), ~2944–3230. |
| `js/app.js` | `openPackReveal`, `packCardHtml`, `gearToCard`, `crateResultToCard`; new `crateOpenHtml` + `CRATE_LID` + `BURST` + `STAT_CODE`; one new import. |
| `sw.js` | `./js/crate-fx.js` added to `PRECACHE`, `VERSION` bumped. **Required companion change** — see below. |

No new dependencies, no new assets. The crate is the existing
`assets/icons-proposal/crate-golden.svg` through `crateIcon()`; the gear art,
names and rarities are the ones the app already drops.

## The sequence

The crate lands, strains, the lid blows off on an arc, light climbs out of the
mouth, and the card rises out of the box as the box sinks away.

```
land 0.85s · settle 0.95s · lid tumbles 2.3s · bloom 2.32s
light rises 2.4s (1.8s ramp) · card 2.6s over 1.05s
counter 2.9s · headline 3.7s · foot 3.9s
```

Those numbers are **CSS custom properties** on `.pack-reveal` (`--b-land`,
`--b-lid`, `--b-card`, …), not `setTimeout`s — retime the sequence in one place.
`.pack-reveal.browsing` collapses every delay to a single beat, which is what a
later card in the same hand gets. The only thing JS schedules is audio.

Every distance in the choreography is expressed against `--pc-w`, the card
width, so it holds its proportions across devices. Measured: 390×844 → card
239×391 (design: 238×389); 375×667 → 224×367; 430×932 → 263×431 (the 264px cap).
No horizontal overflow at any of the three.

`--pc-w: min(61vw, 264px, calc((100dvh - 300px) * .61))` — the third term is what
keeps a tall card off the headline on a short phone.

## Scope

- **The sequence** runs only when a crate is being cracked — `openCrateReveal()`,
  or any `openPackReveal(cards, { crate })`. A gift claim or quest payout has no
  box to come out of, so its cards just present (`.browsing` from the start).
- **The card treatment** applies everywhere `packCardHtml()` is used, including
  the boss-loot pick-one grid (`.loot-cards`). Cards with no structured stats
  fall back to the free-form `stats` HTML they already pass.

## What changed vs. ship

1. **The crate opens instead of shaking.** `.crate-shake` / `@keyframes crateshake`
   are no longer used by the reveal (the rule is left in `app.css` at L741 in case
   another module wants it). The lid and box are two `clip-path`-clipped copies of
   the same icon; the box clip starts 5% *above* the cut so the halves overlap —
   abutting edges left a hairline seam on the closed crate. Per-kind lid ratios in
   `CRATE_LID`, defaulting to 38%.
2. **`.pack-rays` → `js/crate-fx.js`.** The `repeating-conic-gradient` god-rays and
   `raySpin` are gone. The burst is a shader fan: uneven wedge widths and lengths
   from angular noise, a wide blurred pass under a sharp one so edges dissolve, a
   radial vignette that kills the light long before the quad edge, and a slow
   clockwise drift once it lands. Dust motes drift up through it with a radial
   fade (no band, no hard cutoff). The layer is 4.16 × 4.7 card-widths — larger
   than the screen on purpose, and `.reveal-take`'s `overflow:hidden` clips it.
3. **`.pack-flash` → `.pack-bloom`.** The old flash was a flat full-screen white
   radial anchored to nothing. The bloom is a 1.09-card-width burst positioned at
   the crate mouth, blurred and screen-blended, white-hot core falling off into
   the tier colour.
4. **No confetti.** `confettiRain`/`confettiBurst` no longer fire in this flow —
   they popped over the burst and fought it for the same pixels. Sounds and
   haptics stay, moved onto the beats (land 0.85s, lid 2.3s, card 2.75s).
5. **The card carries its tier and its stats.** Rarity frame + glow were already
   there; new are the slot/level-gate header row, a gold nameplate with ink
   lettering on legendary, an inner keyline on the art panel for epic and
   legendary, per-stat chips, the talent affix, and an explicit
   "Plain cosmetic · no stats" for cosmetics — an empty shelf under a legendary's
   nameplate reads as a bug. Card is taller (3/4.9, was 3/4.2) to carry the band.
   Holo foil slowed to 7s over a 260% band.
6. **A hand, not a card.** The rest of the pack stacks behind as `.pc-ghost`s and
   the top card **flies off** in the direction you threw it, with the next rising
   from the stack. It used to snap back to centre and let the next one pop in,
   which read as the swipe not working. Threshold dropped 80px → 60px. Counter is
   "1 of 3" text plus a dot row (`.pack-pips` is gone).
7. **`rotateX(58deg)` removed from the card entrance.** Foreshortening the card
   vertically on the way up read as a stutter. It is now one uniform scale from
   0.16 on a single ease-out curve. Idle sway calmed to ±3.5° (was ±6°).

## Data contract

`packCardHtml(card)` gained optional fields; everything old still works.

| Field | Meaning |
| --- | --- |
| `lvl` | level gate, right side of the header (`"Lv 12"`) |
| `statList` | `[['POW', 6], ['MAR', 4]]` — drawn as chips, colour per stat key |
| `talent` | talent affix name, with a diamond in the rarity colour |
| `plain` | `true` → "Plain cosmetic · no stats" when there are no stats |
| `stats` | unchanged: free-form HTML, now rendered inside the band |

`gearToCard()` builds `statList` from `g.stats` directly rather than re-parsing
`gearLabel()`'s rendered string. Two things about that map, both checked against
`js/gear.js` on `main`:

- **Its keys are the long internal names** (`power`, `marrow`, `wind`, `reflex`,
  `hype`), not the codes players read. `gearLabel()` maps them through a local
  `KEY` table that is the only place the three-letter codes exist — `STAT_META`
  in `pit.js` carries long names and prose labels, not codes. `STAT_CODE` in
  `js/app.js` mirrors that table; if a third caller ever needs it, export one
  from `gear.js` and delete the mirror.
- **`GEAR_BUDGET` has no `common` entry**, so `statSplit()` hands a common back
  `{power: NaN}` rather than `{}` — commons are plain armour with no stats by
  design. `gearToCard()` filters on `Number.isFinite(v) && v > 0`, so the `plain`
  flag is right and no card can print "+NaN POW". Note this also means the
  shipping `hasStats()` (`js/app.js`) returns true for commons and `gearLabel()`
  renders "+NaN POW" for them — pre-existing, untouched here, but worth a look.

Verified end to end: legendary Hat → `+6 POW · +4 MAR` (the design's exact card),
rare Hat → `+4 STA · +2 RFX`, common Hat → "Plain cosmetic · no stats",
uncommon Socks → `+2 HYP`.

Stat chip colours are tokens (`POW`→gold, `MAR`→protein, `STA`→accent,
`RFX`→violet) with one literal, `HYP: #f08ab4`, which has no token in
`app.css :root`.

## crate-fx.js

```js
const fx = mountCrateBurst(hostEl, { color: '#ffc961', amp: .55, haze: .07, delay: 2.4 });
fx.tune({ color, amp, haze });   // re-tint for the card now on top
fx.restart(0);                   // replay the reveal ramp
fx.destroy();                    // stop the loop, drop the context
```

Returns `null` when WebGL is unavailable; `.pack-burst:empty` then paints a still
radial haze, so the reveal degrades rather than breaking. Not mounted at all
under `prefers-reduced-motion`.

**Why not three.js.** The design prototype imported `three@0.184` from unpkg. Tally
is an offline-capable PWA with no CDN dependencies and a precached service worker;
the whole effect is two draw calls, so it is written straight against a WebGL
context in ~250 lines instead of adding ~600KB to the bundle. The GLSL is the
prototype's, unchanged.

**Backing store is capped by area** (`MAX_PIXELS = 1.2e6`) rather than by
`devicePixelRatio`. The burst element is far larger than the screen, and a naive
dpr-2 buffer runs 4M+ fragments for a picture that is entirely soft gradients.
Nothing in the image has an edge sharp enough to show the upscale.

Also handles `webglcontextlost` and disposes on sheet close.

## Reduced motion

`prefers-reduced-motion` removes the sequence rather than freezing it: no crate,
no bloom, no burst, no sway, no entrance — the card is just there. `js/app.js`
also treats `navigator.webdriver` as reduced, as it already did.

## Verified

Driven through a harness that ran the real `openPackReveal`/`packCardHtml` out of
`js/app.js` against stubs, in Chromium at 390×844 / 375×667 / 430×932:

- the ten beats scrubbed frame by frame via `document.getAnimations()`
- common / rare / epic / legendary card treatments
- tap-to-advance and drag-to-fling through a 3-card and a 2-card hand (counter,
  dots, art, name, frame colour and stats all advance)
- the WebGL fan rendering under SwiftShader (812×917 backing store)
- the WebGL-unavailable and reduced-motion fallbacks
- the boss-loot `.loot-cards` grid with the new band

Checked against `tommillerca/tally@main` (files outside this bundle):

- `g.stats` shape and the `common` → `NaN` case — see **Data contract** above.
- `bhIcon()` returns `<svg class="bhi" viewBox=… width=N height=N style="color:…">`,
  so `.co-box svg { width: 100% }` overrides the presentation attributes and the
  crate fills its box, and the icon keeps its own `BH_ICON_TINTS` colour.
- `sparkleSound` / `levelSound` / `dropSound` / `reducedMotion` all still exported
  from `js/fx.js`.

## Service worker

`sw.js` precaches an explicit list of every JS module keyed to `VERSION`, and its
install handler throws on any non-200. So:

- `./js/crate-fx.js` **must** be in `PRECACHE`, or the module is only ever
  network-fetched and the reveal breaks offline.
- Listing it while the file is absent from the server fails the service-worker
  install **for every user** — far worse than a broken animation. The module and
  its precache entry therefore ship in the same commit, always.
- `VERSION` must move forward or installed clients keep serving the old cached
  `app.js` and the feature silently never ships.

`VERSION` is owned by whatever release is in flight; confirm the next free value
immediately before merging rather than trusting the one in this branch. On a
revert, bump *forward* again rather than restoring the previous string.

## Applying to tally

`app.css` and `js/app.js` in this bundle are the design-tool's snapshot from
`2026-08-08T01:01:56Z` and `main` has moved since (`app.css` +187 lines,
`js/app.js` +248). **None of the upstream hunks fall inside the regions this
change touches** — nearest are `app.css` ~2548 and ~3999 against an edit at
2944–3040, and `js/app.js` ~7272 and ~8584 against edits at 7437–7695 — so a
three-way merge lands clean. Rebase onto current `main` before applying rather
than replacing whole files, or the newer upstream work gets reverted.

Paths in this repo are prefixed `project/`; in `tally` they sit at the repo root
(`git apply -p2`, or strip the prefix).
