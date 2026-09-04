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
| The guard | `tests/football-kit-audit.mjs` | PURE, 0.2s, registered in `tests/release-gate.mjs` |

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

`node tests/football-kit-audit.mjs`, PURE, 0.2s, on every gate run. 24 rows.
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

## 7. Open decisions, all of them, for Tom

Nothing below is a blocker for the code. Every one of them is a number or a word
somebody has to choose before this ships.

**7.1 The price.** `FOOTBALL_KIT_PRICE_PLACEHOLDER` is `null` in
`data/football-teams.js`. The buy path refuses a non-finite price and the guard
refuses a live kit without one, so nothing can ship broken, but nothing can ship
at all until there is a number. For scale, the rack's own tiles and the drop sit
in the hundreds of coins. **No default: this one has to be answered.**

**7.2 Per-garment or a team bundle.** Today it is per garment: five tiles
(helmet+visors, jersey, cleats, lizard helmet, lizard jersey) at one flat price
each, and 32 colourways of each. The alternative is one price for a whole team's
kit. Per-garment is what is built and what `buyFootballItem` grants; a bundle is
a second grant path and a second tile. Related: the price is currently flat
across garments, so a helmet costs what a pair of cleats costs.

**7.3 `VISOR_EYES_POLICY`: `'hide'` or `'refuse'`.** Currently `'hide'`. Of all
36 eye items composited under the darkest visor, 33 sit inside the helmet-plus-
glass silhouette and read through the tint. Three poke through the glass:

| Item | Name | Escapes the silhouette by |
|---|---|---|
| `E11-1` | Red Lasers | 2068 px at 640 |
| `E11-2` | Blue Lasers | 2089 px |
| `ES22` | Rainbow Band | 479 px |

- `'hide'` draws the helmet and silently skips the eye layer for those three.
  The player keeps both items and loses the eyes while a visor is on.
- `'refuse'` makes `equip()` say no to the eyes while a visor is worn and to the
  visor while those eyes are worn, with reason `'visor'`. Honest, but it is a
  refusal the player has to work out for themselves.

One word in `data/football-teams.js`. Both branches are guarded, so either is
shippable today.

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

**7.6 Are the cleats meant to be one colour?** Measured: `cleats.mask-b.png`
comes out of the pipeline with **zero** pixels in it. Cam drew the shoe in the
primary alone. The kit now declares that (`oneColour: true` on the cleats row in
`FOOTBALL_GARMENTS`) and `footballTints` stops emitting a second multiply layer
that painted nothing and still cost a decode on every render. The empty mask is
still written and the guard asserts it stays empty, so if Cam adds a trim stripe
to the shoe the REGIONS row goes red and the flag comes off in one edit. **If
the cleats were always meant to carry the secondary, this is an art fix, not a
code one.**

**7.7 Not a decision, a gap Tom should know about.** The lizard's helmet and
jersey are drawn for `C4` (Beardie) and `CX` (Day One Lizard), and **both of
those species are in `ANIMATED_PETS`**. `petSpriteHtml` returns
`animatedPetHtml(...)` before it ever reaches `croppedPetImg`, which is the only
function that paints a pet's worn layers. So the two lizard pieces render
correctly in the kit room, the shop tile and the roster portraits
(`petPortraitHtml`, which calls `croppedPetImg` directly) and **do not render on
the Today hero, the Stable, the Paddock or the Pit**, where the animated lizard
is drawn instead. This is not a typo: the animated lizard is a separate layered
sprite stage with its own coordinate system, and the football art is registered
to the static `C4.png` canvas, so it cannot simply be stacked on. Either the
animated stage grows a garment layer (real work, needs its own art registration)
or the pet pieces are sold knowing where they show. Nothing in the tests can
catch this for you, because both renderers are behaving exactly as written.
