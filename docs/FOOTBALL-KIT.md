# The football kit

2026-09-04. Thirty-two invented teams, five garments Cam drew once, tinted per
team at runtime. Built but **not live**: `FOOTBALL_KIT_LIVE = false` in
`data/football-teams.js`, so every piece carries `unreleased` and nothing in the
game can see it. Section 7 is the list of things only Tom can answer.

## 1. What exists

| Thing | Where | Note |
|---|---|---|
| The data, the flags and the pure functions | `data/football-teams.js` | 150 lines, no imports, read its header first: it is the design record |
| The art pipeline | `scripts/football-masks.py` | Cam's eight coloured layers to eight tintable masters plus sixteen masks |
| The shipped art | `assets/bh/football/` | 24 PNGs, 518 KB total, all 640x640 |
| The multiply layer | `app.css` `.fb-tint` | one span per tint, `mask-image` from the mask PNG, `mix-blend-mode: multiply` |
| The player renderer | `js/app.js` `footballTintHtml` | the avatar and the wardrobe tiles |
| The pet renderer | `js/app.js` `croppedPetImg` + `data/boneheadz.js` `petWornTints` | the tint spans take the layer's own geometry string, so registration is inherited |
| The shop | `js/app.js` `footballShelfHtml` | the kit room, gated on `FOOTBALL_KIT_LIVE` at the call site |
| The buy path | `js/loot.js` `buyFootballItem` | refuses unless live AND the price is a finite number above zero |
| The guard (arithmetic) | `tests/football-kit-audit.mjs` | PURE, 0.3s, 34 rows, FAST tier |
| The guard (pixels) | `tests/football-render-audit.mjs` | a real browser, ~150s, 12 rows, FULL tier until the kit goes live |
| The bundle | `data/football-teams.js` `footballBundleMath` + `js/loot.js` `buyFootballBundle` | one tile per team, every sold garment, priced as a discount |
| The colourway rail | `js/app.js` `fbRailHtml` + `app.css` `.fb-rail` | the Wardrobe's east-west slide through the 32 tints, see section 8 |
| The garment frame | `js/app.js` `fitClass` + `app.css` `.fit-fbhead` | a football helmet is not a hat: its own tile crop, see section 9 |
| The guard (the rail) | `tests/football-rail-audit.mjs` | a real browser, ~35s, 19 rows, FULL tier until the kit goes live |
| The guard (the crop) | `tests/football-tile-crop-audit.mjs` | a real browser, ~35s, 6 rows, FULL tier until the kit goes live |

**The model.** One master PNG per garment plus two alpha masks; a team is two hex
colours; an item is team x garment with a stable id `fb-<team>-<garment>`. So 32
teams cost eight PNG triplets, not 256 PNGs, and a 33rd team is one row of data.

**256 items from 32 x 8.** Eight garments: helmet, three visors, jersey, cleats,
lizard helmet, lizard jersey. The three visors are separate items rather than a
sub-option on the helmet, because picking among items in a slot is what the
wardrobe already does; buying the helmet grants all four (`footballGrantIds`).

## 2. Re-running the pipeline when Cam sends a revision

```
python3 scripts/football-masks.py                      # default source folder
python3 scripts/football-masks.py "/path/to/NFL GEAR"  # or name it
```

**Inputs**, `/Users/tommiller/Downloads/NFL GEAR/`, eight PNGs with exactly
these stems (the mapping is `GARMENTS` at the top of the script):

| Source file | Ships as |
|---|---|
| `BH_NFL_HELM_NOVISOR.png` | `helmet` |
| `BH_NFL_HELM_VISOR25.png` | `visor25` (Light Visor) |
| `BH_NFL_HELM_VISOR60.png` | `visor60` (Smoke Visor) |
| `BH_NFL_HELM_VISOR90.png` | `visor90` (Dark Visor) |
| `BH_NFL_JERSEY.png` | `jersey` |
| `BH_NFL_CLEATS.png` | `cleats` |
| `BH_NFL_LIZARD_HELMET.png` | `pet-helmet` |
| `BH_NFL_LIZARD_JERSEY.png` | `pet-jersey` |

**Outputs**, straight into `assets/bh/football/`, three files per garment:

```
<name>.png          the master: the two team regions desaturated to their
                    luminance and normalised so a multiply by the team hex lands
                    ON the hex; every neutral pixel byte-identical to Cam's
<name>.mask-a.png   alpha mask of the PRIMARY region, LA PNG
<name>.mask-b.png   alpha mask of the SECONDARY region, LA PNG
```

The script prints a per-garment report and **asserts its own output**: it
re-composites master x tint through each mask for a dark and a light test colour
and dies if any region mean misses by more than 6/255. A clean run ends with
`total bytes for the eight kits: 518K`.

**Then run the guard**, which repeats the same composite in node over the shipped
bytes for three real teams, and the pet lint, which measures the pet layers
against the lizard's crop:

```
node tests/football-kit-audit.mjs      # must exit 0
node tests/pet-accessory-lint.mjs      # must exit 0
```

Nothing else regenerates. There is no thumbnail tier for football art
(`BH_THUMB_RE` in `data/boneheadz.js` does not cover `football/`), so the
masters are served as-is and `thumb-freshness-lint` has nothing to say.

## 3. The asset contract for Cam

**Canvas.** One square PNG per layer, RGBA, full-frame: the garment drawn in the
position it is worn, with everything else transparent. The pipeline downscales
to 640x640 and does not move, crop or re-centre anything, so **the position in
Cam's canvas IS the position on the bonehead**. Source squares of 2048 are fine
and are what he sends today.

**Two colour regions, and only two.** The pipeline does not read a spec, it
MEASURES the two team hues off `BH_NFL_JERSEY.png` (the one layer with no gold
in it) and then assigns every pixel in every layer a membership weight:

| In Cam's art | What the app does with it |
|---|---|
| The saturated **blue** (hue ~240) | becomes region **a**, the team's primary: the helmet shell, the jersey numbers, the cleats |
| The **coral** (hue ~8) | becomes region **b**, the team's secondary: the helmet stripe and badge, the jersey trim |
| Everything else, at any saturation | left **byte-identical**: the gold facemask, the cream highlights and jersey body, the grey visor glass, the black outlines |

The two are recognised by hue within +-12 degrees (falling to zero at +-24) and
by saturation relative to that cluster's own median, so the exact blue and the
exact coral do not have to be repeated file to file. Anti-aliased edges come out
as what they are: a blue-on-black edge stays blue in hue and lands as *dark team
colour*, which is what a shaded edge should be; a blue-on-cream edge comes out
half tinted.

**If he uses a third colour**, it is simply not tinted. It ships as a fixed
colour on all 32 teams, exactly like the gold facemask does today. Nothing
errors and nothing looks broken; the piece just stops changing with the team.
That is the failure mode to watch for, because it is silent. The mitigations:

- The script prints `gold px` per file. A third colour drifting into the coral
  window would move that number, and a coral window drifting onto the gold
  facemask would too.
- The script prints `seam px (neither window)`, the pixels that belong to
  neither region: a blue-coral boundary reads as magenta and stays Cam's mixed
  colour. Today that number is 0 on every layer.
- `tests/football-kit-audit.mjs` row REGIONS asserts which garments have an
  empty secondary mask (see 7.6), so a colour vanishing entirely is red.

Practically: **one saturated blue, one coral, everything else neutral**. A third
team colour needs a third mask, which is a change to the script, the data
(`footballTints` returns a list, so it is not hard) and the renderer.

## 4. The 32 teams

`a` is the primary (helmet shell, jersey numbers, cleats), `b` the secondary
(helmet stripe and badge, jersey trim). Invented places and mascots in the
Boneheadz register: no real league's cities or names.

Measured over all 496 pairs, 2026-09-04, and re-measured by the guard on every
run: **primaries pairwise CIE76 dE >= 12** (min 12.50, Brightwater Barracudas vs
Shalebank Skates) so two shells read apart at 24px, and **a/b WCAG contrast >=
3:1** (min 3.02, Thornback Toads) so the stripe reads on the shell.

| # | Team | id | `a` | `b` |
|---|---|---|---|---|
| 1 | Boneyard Bruisers | `boneyard-bruisers` | `#14213D` | `#F2C14E` |
| 2 | Hollow Howlers | `hollow-howlers` | `#4B2C83` | `#9BE564` |
| 3 | Marrow Mammoths | `marrow-mammoths` | `#7A2E2E` | `#F1E3C6` |
| 4 | Gravel Gulls | `gravel-gulls` | `#9AA3AB` | `#2B2F33` |
| 5 | Ember Coast Kilns | `ember-coast-kilns` | `#C8401F` | `#FFD27F` |
| 6 | Rustwater Rats | `rustwater-rats` | `#8C4A1E` | `#B9E2F5` |
| 7 | Cinderfall Crows | `cinderfall-crows` | `#1B1B1F` | `#E84C3D` |
| 8 | Saltmarsh Serpents | `saltmarsh-serpents` | `#1E6B4E` | `#F7E27A` |
| 9 | Ironhaven Anvils | `ironhaven-anvils` | `#5B6B7F` | `#F4F4F4` |
| 10 | Frostbite Foxes | `frostbite-foxes` | `#FF7F3F` | `#1B2A3A` |
| 11 | Thornback Toads | `thornback-toads` | `#5B7A1E` | `#FFB7C5` |
| 12 | Duskmoor Moths | `duskmoor-moths` | `#7D6BA0` | `#F4E9D8` |
| 13 | Copperhill Cobras | `copperhill-cobras` | `#B5651D` | `#1E2D2B` |
| 14 | Peatbog Pikes | `peatbog-pikes` | `#3E4A1F` | `#E7D98A` |
| 15 | Lanternlight Lynx | `lanternlight-lynx` | `#E0912A` | `#2B2118` |
| 16 | Stormgate Stags | `stormgate-stags` | `#2C5D8F` | `#F0F0F0` |
| 17 | Sootvale Salamanders | `sootvale-salamanders` | `#4D4D4D` | `#FF8A3D` |
| 18 | Brightwater Barracudas | `brightwater-barracudas` | `#007C80` | `#FFE066` |
| 19 | Nettlewood Nightjars | `nettlewood-nightjars` | `#2E4A3F` | `#D9B8FF` |
| 20 | Quarry Hill Quakes | `quarry-hill-quakes` | `#4E3A52` | `#FFD166` |
| 21 | Mudflat Minotaurs | `mudflat-minotaurs` | `#8B5E3C` | `#F5D6A8` |
| 22 | Windrow Wasps | `windrow-wasps` | `#F9DC1A` | `#1C1C1C` |
| 23 | Shalebank Skates | `shalebank-skates` | `#2F6F7E` | `#8FE3CF` |
| 24 | Tallow Creek Tusks | `tallow-creek-tusks` | `#3B2A20` | `#EADBC8` |
| 25 | Gallows Reach Ghouls | `gallows-reach-ghouls` | `#D8CFA8` | `#1E5A3A` |
| 26 | Hexley Hexes | `hexley-hexes` | `#8E2A6B` | `#FFD9EC` |
| 27 | Old Kiln Kestrels | `old-kiln-kestrels` | `#A33A2A` | `#F7C59F` |
| 28 | Pinebarrow Badgers | `pinebarrow-badgers` | `#F4F4F0` | `#222222` |
| 29 | Rimefall Rooks | `rimefall-rooks` | `#7FB3D5` | `#15243B` |
| 30 | Bramblegate Bison | `bramblegate-bison` | `#5E3517` | `#E4A34A` |
| 31 | Lowmarsh Lurkers | `lowmarsh-lurkers` | `#7FA07A` | `#1F3A2A` |
| 32 | Glasswater Gannets | `glasswater-gannets` | `#3A8FC7` | `#FFFFFF` |
## 5. Eight alternates, if a team has to be replaced

Not in the data. Each was measured against all 39 other primaries (the 32 above
plus the other seven here) on the same two rules, so any one of them can be
pasted into `FOOTBALL_TEAMS` in place of a team Tom does not like and the guard
stays green. Re-run `node tests/football-kit-audit.mjs` after a swap: the
DE-HEADER and CONTRAST-HEADER rows will go red if the swap moves the recorded
minimum, and the fix is to update the two numbers in the data file's header.

| Team | id | `a` | `b` | nearest primary (dE76) | a/b contrast |
|---|---|---|---|---|---|
| Ashfen Alligators | `ashfen-alligators` | `#2F7D3B` | `#F6E7B8` | 20.19 (Thornback Toads) | 4.14:1 |
| Clatterjaw Crabs | `clatterjaw-crabs` | `#A8203C` | `#F0DFC0` | 18.40 (Old Kiln Kestrels) | 5.46:1 |
| Moonwell Manta | `moonwell-manta` | `#243A6B` | `#8FD6E8` | 15.61 (Stormgate Stags) | 6.84:1 |
| Tinder Hollow Hares | `tinder-hollow-hares` | `#C99A2E` | `#2A1F3D` | 14.94 (Lanternlight Lynx) | 5.98:1 |
| Gallowglass Goats | `gallowglass-goats` | `#6E4C8F` | `#F2D48A` | 15.19 (Duskmoor Moths) | 4.71:1 |
| Bramble Bay Bats | `bramble-bay-bats` | `#481048` | `#B8E986` | 24.30 (Hexley Hexes) | 10.42:1 |
| Kelpforge Krakens | `kelpforge-krakens` | `#0F5E5A` | `#F5B8C4` | 13.39 (Brightwater Barracudas) | 4.53:1 |
| Stonewold Shrikes | `stonewold-shrikes` | `#520E1A` | `#EDE3CF` | 14.96 (Marrow Mammoths) | 11.48:1 |

## 6. What the guard checks

`node tests/football-kit-audit.mjs`, PURE, on every gate run. 34 rows.
Its header carries the eight prove-red mutations and the FAIL line each one
produced, all confirmed 2026-09-04 on a throwaway tree.

- **SAMPLE** the modules loaded with something to grade.
- **TEAMS / HEX / ITEMS / ITEM-IDS** 32 unique ids and names, 64 valid hexes,
  exactly teams x garments, every id the stable `fb-<team>-<garment>`.
- **DE / CONTRAST** both header claims re-measured over all 496 pairs and all 32
  teams. **DE-HEADER / CONTRAST-HEADER** compare the re-measurement to the
  minimum the data file's comment records, so a comment that has drifted from
  the data is itself a red row.
- **ASSETS** every master and mask the catalogue can ask for is on disk, plus
  **ASSETS-CONTROL**, which proves the same existence check reports a path that
  is deliberately not there.
- **TINT** the composite the browser draws, done in node over the shipped bytes:
  3 teams x 8 garments = 45 region samples, each region's mean colour within
  8/255 of the team hex. Worst today 2.64/255.
- **REGIONS** a garment is declared one-colour exactly when its secondary mask is
  empty, and gets exactly that many tint layers. Both directions.
- **GATE / GATE-RESOLVES / SHELF** the unreleased flag keeps all 256 out of
  `BH_ITEMS` while `BH_BY_ID` still resolves them, and the shelf is gated.
- **VISOR-EYES / VISOR-HIDE / VISOR-REFUSE / VISOR-LIVE** the three blocked eye
  ids are real E-slot items, and **both** policy branches are exercised.
- **GRANT** the helmet tile hands over its three visors; every other tile only
  itself.
- **PRICE / PRICE-CONTROL / PRICE-BUYPATH** a live kit with a null price is
  refused, the predicate is proved to refuse it, and the shape of the real guard
  in `buyFootballItem` is pinned.
- **CLEATS / PET-TINT / PET-SPECIES** the cleats take the team primary on all 32
  teams (5,430 core px each, worst 1.51/255) and are one colour BY THE ART; both
  lizard garments carry BOTH colours on all 32 teams (128 samples, worst
  2.64/255); and both garments fit both lizard species, with a shiny proven to
  be the same species id rather than a catalogue entry of its own.
- **BUNDLE / BUNDLE-MATH / BUNDLE-PRICE / BUNDLE-PRICE-CONTROL / BUNDLE-BUYPATH**
  the team bundle covers every sold garment (5 tiles -> 8 ids, derived from the
  tiles' own grants, so the helmet still drags its visors), the saving is the
  sum minus the bundle, and a live bundle needs a number that is actually a
  discount.

## 6b. What the PIXEL guard checks

`node tests/football-render-audit.mjs`, a real browser, ~150s, 12 rows, FULL
tier. Every measurement is a **difference between two screenshots of the same
rectangle of the same frame**, never a `getBoundingClientRect`.

- **PET-CONTROL / PET-WEARS** owned-but-unworn draws the animated stage and zero
  tint spans; after a real tap on the Stable's wardrobe tile all three lizards
  (Beardie, its shiny, Day One) draw base + 2 garments + 4 tint spans on the
  static canvas, on the Stable AND on Today.
- **PET-SIZE** the animal keeps its visual mass when the kit forces the static
  canvas. Measured at 124px with the garments hidden and the clock pinned:
  animated ink 264x179 = 30,941 px, static 260x194 = 30,257 px, linear ratio
  0.9889. The 4x15 box delta is the two DRAWINGS (aspect 1.475 animated against
  1.340 static), not the scale.
- **PET-TINT** each lizard rendered under a navy team and a yellow one; the
  pixels that differ between those two renders are exactly the tinted ones, and
  each render's mean over that mask must be nearer its OWN team's primary.
  Measured dE: navy 100 vs 208, yellow 84 vs 217, on all three.
- **PET-REGISTER-SHINY / -CX** the kit lands on IDENTICAL pixels on C4 and its
  shiny (zero tolerance). On CX it is 1.4% larger and 1-2 device px up-left, and
  that number is PREDICTED from `PET_CROP` (1.0181) before it is measured
  (1.0142), so the drift is Cam's crop and not the renderer.
- **VISOR-SEEN / VISOR-CLIP / VISOR-CONTROL** the lasers are still drawn (2,559
  px of the composited hero change when the eye layer is hidden), **0 of 4,968
  eye-alpha pixels land outside the helmet silhouette**, and turning the mask off
  in the live DOM on the same frame reports 3,804 escapes, so the row can fail.
  The silhouette is read as ALPHA (each layer shot alone over black and again
  over white) after a first version diffed against the page background and
  reported 904 false escapes: the dark glass over the skull's dark eye sockets
  changes nothing, so "where the helmet paints" is not "where the helmet is".

## 7. Open decisions, all of them, for Tom

**Tom ruled on four of these on 2026-09-04 (7.2, 7.3, 7.6, 7.7): they are built
and measured, and are kept here as the record of what was decided and why.**
Tom also named the two prices (7.1) the same day. What is still OPEN is 7.4 (the
live date) and 7.5 (which pools).

**7.1 The two prices. ANSWERED 2026-09-04.** Tom named them and they are in
`data/football-teams.js`:

| | coins | how it was set |
|---|---|---|
| `FOOTBALL_KIT_PRICE_PLACEHOLDER` | **4,200** a garment | 3x the epic rung (1,400) |
| `FOOTBALL_BUNDLE_PRICE_PLACEHOLDER` | **16,800** a team | 20% off the 21,000 sum, so the saving is exactly one garment |

Beta wallets are deep, so both are marked to be re-priced at launch. Both buy
paths still refuse a non-finite price and `footballBundleSellable` still refuses
a bundle at or above the sum, so the guards do not go quiet now that the numbers
are real. **What is still open is 7.4 and 7.5: the date, and which pools.**

**7.2 Per-garment AND a team bundle. DECIDED 2026-09-04, built.** Tom: "per
garment only with a bundle of everything for a slightly cheaper but expensive
price." Five per-garment tiles as before, plus ONE bundle tile per team that
grants every sold garment of that team in one purchase (8 ids for 5 tiles: the
helmet still drags its three visors). `FOOTBALL_BUNDLE_PRICE_PLACEHOLDER` is
**16,800** against **21,000** for the five tiles (7.1). The maths, the tile, the
buy path and the "you save N" line are wired:

```
full  = FOOTBALL_KIT_PRICE_PLACEHOLDER x 5        4,200 x 5 = 21,000
save  = full - FOOTBALL_BUNDLE_PRICE_PLACEHOLDER  21,000 - 16,800 = 4,200
```

`footballBundleSellable` refuses a live bundle with no number AND one priced at
or above `full`, because a non-positive saving would print a lie on a price tag.
Partial ownership pays the full bundle price and is granted the rest; owning all
of it is refused outright. Guarded by BUNDLE, BUNDLE-MATH, BUNDLE-PRICE,
BUNDLE-PRICE-CONTROL and BUNDLE-BUYPATH.

**7.3 `VISOR_EYES_POLICY`: DECIDED 2026-09-04, it is `'clip'`.** Tom: "hide the
eyes on any eye cosmetics that dont fit in the bound of the helmet OR if it is
easy keep them on and have the lazers bound within the helmet itself that could
be cool." It was easy: the eye layer keeps its place in the stack and takes a
`mask-image` of the worn visor helmet's OWN master, whose alpha is the
helmet-plus-glass silhouette. The mask needs no registration of its own -- it is
a 640 square on the same canvas as every E-slot master, so `app.css .eye-clip`
hands it the surface's `--av-fit`/`--av-pos` exactly as `.fb-tint` does.

MEASURED, on Today's hero at 393x852 with the darkest visor and E11-1 Red Lasers:
**0 of 4,968 eye-alpha pixels outside the silhouette**, with 2,559 px of the
composited hero still changing when the eye layer is hidden (the lasers read
through the glass, they are not simply gone). Turning the mask off in the live
DOM on the same frame gives **3,804 escapes**, which is what makes the zero mean
something.

`'hide'` and `'refuse'` are intact, still exported, still guarded, and still one
word away.

**7.4 The live date.** `FOOTBALL_KIT_LIVE = false`. Flipping it to `true` puts
256 items into `BH_ITEMS`, which is the rack's rotating pool, the crate pool,
gear derivation, the Looks tab and the random splash outfits, all at once, and
turns the kit room on in the shop. That is a large single-drop injection into
the rack's weekly rotation. Worth deciding alongside 7.5.

**7.5 Rack-only, crate drops, or both.** The flag is binary today: released
means visible to every pool. If the kit should be shop-only and never a crate
reward, that is a filter at the crate pool rather than a flag here, and it does
not exist yet. `js/gear.js` already skips `football` for gear derivation, so
these never become statted pieces.

**7.6 The cleats DO tint, and they are one colour BY THE ART. ANSWERED
2026-09-04.** Tom: "make sure you can tint the cleats too you were wrong about
skipping that". They were never skipped: the shoe takes the team **primary**
through `cleats.mask-a.png` and comes out navy, red or purple correctly. What a
previous pass dropped was the empty SECOND layer, and it is empty because
`cleats.mask-b.png` has **zero** pixels above the core threshold: Cam drew the
shoe in the primary alone. The audit now says both halves out loud:

- row **CLEATS** measures the primary on all 32 teams (5,430 core px each, worst
  1.51/255) and asserts the garment emits exactly one tint layer;
- row **REGIONS** asserts, in both directions, that a garment is declared
  `oneColour` exactly when its `mask-b` is empty.

**What Cam must draw for two-tone cleats.** Add a **coral** (hue ~8, the same
secondary he already uses for the helmet stripe and the jersey trim) trim to
`BH_NFL_CLEATS.png` -- a stripe, a swoosh, a sole edge, anything with real
coverage -- and re-run `python3 scripts/football-masks.py`. REGIONS goes red the
moment `mask-b` stops being empty, and the fix is deleting `oneColour: true`
from the cleats row in `FOOTBALL_GARMENTS`. One edit, no code design. Nothing
else is needed: the second multiply layer already exists for every other
garment.

**7.7 ANSWERED 2026-09-04: the lizard wears the kit, and holds still while it
does.** Tom: "just put the pet pieces on a version of the lizard that isnt
animated for this." Football wear now forces `petSpriteHtml` down the static
canvas (`croppedPetImg`), which is the only function that paints worn layers.
The trade is explicit and it is his: **while the kit is on, the lizard stops
animating**; with no football wear it animates exactly as it always did.

And "make sure the cosmetics go on the shiny and the founders purple lizard
because at the end of the day theyre all the same base frame" -- they do, and it
needed no data change. A shiny is an INSTANCE flag over the same species id, so
`C4` being in `FOOTBALL_PETS` already covers its shiny; CX is C4 recoloured on
the same `PET_CROP` bbox. Measured on the Stable card and on Today's hero:

| | garment lands at | vs C4 |
|---|---|---|
| C4 Beardie | 140,93 211x202 device px | - |
| C4 shiny | 140,93 211x202 | **identical pixels** |
| CX Day One | 139,91 214x205 | 1.4% larger, 1-2px up-left |

CX's 1.4% is Cam's crop, not the renderer: `PET_CROP` has C4 at
0.5344..0.8891 and CX at 0.5375..0.8859, which PREDICTS a 1.0181 size ratio
before anything is rendered, against 1.0142 measured. `croppedPetImg` fits the
INK to 82% of the box, so a marginally smaller ink means a marginally larger
canvas behind it.

**The scale does NOT change when the kit goes on**, and that is measured rather
than assumed. At 124px with the garments hidden and the clock pinned:

```
animated lizard                      264 x 179 device px, 30,941 px of ink
static under petMassScale (shipped)  260 x 194,           30,257
static under staticMassScale         257 x 191,           29,655
```

`petMassScale` is nearer on width (4px vs 7) and on area (684 vs 1,286),
`staticMassScale` on height (12px vs 15). So the scale FUNCTION is not what
makes the animal change size: the two DRAWINGS do, at aspect 1.475 animated
against 1.340 static. `petScale` is therefore left exactly as it was, and
PET-SIZE bounds the linear ratio (0.9889 today) at 5%, which still catches a
lost `mass: true` at 24%.

## 8. The colourway rail (the Wardrobe)

Tom, 2026-09-04: *"you still have yet to show me the dressing room/wardrobe
where you can slide from east to west on the different tints."*

Put a football garment on and the Wardrobe grows a horizontal rail under the fit
grid: one tile per team, the tile under the CENTRE is the one being tried on,
and the player's own Bonehead recolours as they slide. Nothing is worn until the
bar says so.

**It is cheap because of the model in section 1.** Every team of a garment is
the same master PNG behind the same pair of masks, so a team change is two
`style.background` values on spans already in the document: no restage, no
innerHTML, no decode, no reflow. That is what makes it safe to drive from a
scroll handler. Measured on the rendered rail: **32 tiles are 96 `<img>` from
THREE distinct sources** and 64 tint spans, 442 nodes, and the Wardrobe's first
paint with the rail on it is 516ms. `football-kit-audit` row `RAIL-SHARED` is
the pure guard on that invariant, with its own control.

**The precedent is `.pw-row`**, the Stable's pet-accessory row, reused rather
than copied: `.fb-rail` carries `.pw-row` and every tile carries `.pw-item`, so
the flex, the gap, the mandatory x-snap and the `on` state are that row's. Only
the centre snap, the end margins and the locked state are new CSS.

**Two Boneheads recolour.** At 430x932 the rail's top edge is at document y 1151
while the paper doll ends near y 400, so the rail carries its own figure (the
same `figure` helper and `.mog-fig` box the look panel's Now/After pair uses).
The big doll keeps in step because it costs nothing.

**An unowned colourway is SHOWN, locked, with its price.** Not hidden: a player
owning one helmet would otherwise get a one-tile rail, and seeing their own
Bonehead in the other 31 sets is the argument for a second one. Every tile
previews on the doll; the lock lives on the BAR. **The rail never sells** -- the
locked bar routes to the Kit room with the team already picked and the shelf
already open (`S.fbJump`), so `buyFootballItem` stays the one and only till.

**Not offered on a disguised slot.** If a transmog is making a gear piece look
like a football helmet then `eq[slot]` is football while `rawEq[slot]` is not,
and "wear this colourway" would mean re-buying a transmog. The rail wants both
to be the same football item.

## 9. Why a football helmet has its own tile crop

Tom annotated the Kit room's helmet tile, 2026-09-04: *"too zoomed in."* He was
right, and the number was 94.2%. Measured on the rendered 88px tile, the
garment's own silhouette read as an ALPHA (the layer alone over a black ground
and again over a white one, corners squared):

| garment | ink, before | ink, after | runs off the tile, before | after |
|---|---|---|---|---|
| helmet | **94.2%** | **43.4%** | **all four edges** (L83 R45 T88 B46) | none |
| jersey | 42.6% | 42.6% | none | none |
| cleats | 33.4% | 33.4% | none | none |
| lizard helmet | 23.6% | 23.6% | none | none |
| lizard jersey | 20.7% | 20.7% | none | none |

`.fit-head` is a measured frame for HEADWEAR sitting on a skull. A football
helmet is a bigger object -- shell plus a facemask over the whole face -- so the
same frame blew it off every edge. The fix keys off the ITEM (`fitClass`), not
the surface, because the same crop draws this helmet on the Kit-room tile, the
rack stage, a reveal card and the colourway rail; a tile-scoped override would
have fixed one of four. Only slot H, so the helmet and its three visors move
together and nothing else moves at all.

**Read `tests/football-tile-crop-audit.mjs` before re-measuring anything here.**
Three instruments were wrong before the one that runs, and each returned a
confident number: hiding the whole mannequin measures the base skeleton
(`object-fit: cover`, 98% of every tile); hiding just the garment and diffing
measures the CONTRAST (this same helmet read 61.3% in the shop and 20.7% on the
rail, on provably identical geometry); and reading an alpha with the tile's
corners left rounded counts the corner arcs as garment.
