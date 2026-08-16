# The Studio compositor (build order step 2)

Branch `ext/studio-compositor`, cut from `origin/main` at `ff991ca`.

Scope was step 2 of `docs/PLAN-the-studio.md` and nothing else: **look plus options
in, a 1080x1920 Blob out, no screen attached.** No Studio screen, no AR Snap, no
auto-cards, no frames, no stickers. `js/app.js` is untouched.

## Files

| File | What |
|---|---|
| `js/studio.js` | new. `composeCard(look, opts) -> Promise<Blob>` plus the `LAYOUT` constants |
| `tests/studio-audit.mjs` | new. 27 checks, all on decoded pixels of a real exported Blob |
| `tests/figure-audit.mjs` | one SITES row (`studio-card`), plus COVERAGE and STATIC now scan `js/studio.js` as well as `js/app.js` |

## The API

```js
composeCard(
  { outfit, pet, name, level },                       // the look
  { backdrop, pet, quote, code, gear },               // the composer knobs
)
```

- `backdrop`: any of the 22 `BG` catalogue ids, or `null` for the plain wash.
- `pet`: true (in shot) / false (out).
- `quote`: the line to print, or `''` for off.
- `code`: friend code as text, or `''` for off.
- `gear`: true prints the worn-gear list.

`look.pet` must be a pet INSTANCE from `petFrom()` with `shiny` resolved to a
boolean. That is the one deliberate piece of friction in the API and it is the
figure contract's rule 1 made unavoidable: `petFrom()` leaves `shiny` undefined
for your own pet so `S.shinyPets` can answer, `S.shinyPets` lives in `js/app.js`,
and `js/studio.js` does not import `js/app.js`. So an unresolved shiny **throws**
rather than defaulting to false. Defaulting would draw a shiny pet in base colours
onto something the player posts publicly and permanently, which is precisely the
bug the plan predicted would come back here.

## What was reused

Grepped, not taken from the doc.

| Reused | From | Note |
|---|---|---|
| `BH_SLOTS` z order | `data/boneheadz.js` | verbatim, sorted by `z` |
| `BH_BY_ID`, `bhAsset` | `data/boneheadz.js` | |
| `PET_CROP` | `data/boneheadz.js` | the measured pet ink boxes, the same numbers `croppedPetImg` uses |
| `petHovers()` | `js/pets.js` | a hovering species floats, it does not sit |
| `assets/bh/C/shiny/<id>.png` | same path `petSpriteHtml` uses | CX exempt, its amethyst art IS its look |
| `sparkIco`'s path data | `js/app.js` | the same 24-unit SVG path, drawn through `Path2D` |
| `assets/fonts/bangers.woff2` | `app.css` | loaded through `FontFace` so the module works with no stylesheet |

## What had to be built, and why

- **The layer stack.** `avatarLayersHtml` emits `<img>` tags. A canvas cannot use
  them. Same slot list and same z sort; different output.
- **Ink seating.** `drawTrimmedArt` does load a PNG, find its alpha bbox and draw
  it scaled, but it **centres** the art in the canvas and takes ONE source. A card
  seats a whole layer stack on a ground line and hangs a companion off a tension
  line. The bbox scan is the same idea (same `alpha > 14` floor) but it is a
  different function.
- **`drawStudioPet`.** The canvas equivalent of `petAsideHtml`. Mass normalisation
  falls out of the same rule: `petAsideHtml` multiplies the box by `petScale` and
  then fits by `max(w, h) * 0.82`, which nets out to *every species drawn at the
  same ink height*, so that is what this does directly.
- **`speechLine()` is NOT called.** It reads `S.speechSalt` and takes entries,
  totals and targets, so calling it from here would import app state and thread
  calorie data into the compositor, against the plan's hard rule. `opts.quote`
  takes a finished string; the caller (the Studio screen, step 4) picks it.

## Layout

1080x1920. Instagram Stories reserved zones from PLAN §3: top 270, bottom 380,
sides 65. The figure contract's 6% gutter is 64.8px at this width, so the two
agree at the sides and IG is stricter top and bottom.

- Bonehead on the centre line, body ink normalised to 450px, ink bottom on the
  ground line at y=1062.
- Pet in the right third of the safe box, ink inner edge on the tension line at
  x=698, width clamped so the outer edge can never cross x=1015, ground line 18px
  forward of the character's (staging depth, same as the Today card).
- Chrome plate x 65..1015, top 1094. Four **fixed** row slots: name, quote, gear,
  code. Rows never move when a knob is turned off, which is what makes "the quote
  row is empty when the quote is off" a check on one fixed rectangle. Only the
  plate's bottom edge follows the content, because a fixed-height plate under a
  name-only card is a visibly empty box.

The type and the plate treatment are **provisional**. Tom approves mockups at
build order step 3 and they will change. The API, the geometry rules and the
guards are what step 2 was for.

## What the audit asserts

`node tests/studio-audit.mjs`, 27 checks, ~20s. Every card is composed, handed
back as a Blob, and decoded through `createImageBitmap` so the **exported bytes**
are what gets measured.

- **SIZE** the Blob decodes to exactly 1080x1920 and is a real `image/png` with
  bytes in it.
- **ZORDER** every `BH_SLOTS` slot at the right depth, on pixels. Each slot is
  rendered alone twice, over the wash and over a backdrop; a pixel is that slot's
  own where the two agree (nothing shows through) and no higher slot touched it,
  and the finished all-slots card must be pixel-identical there. Two outfits are
  swept, because socks live under shoes and undies under trousers and a fully
  dressed figure cannot show all thirteen. Every slot must be proven in one of the
  two passes.
- **SHINY** a shiny pet and a plain one are different pixels in the pet region,
  and the sparkle's gold is present in one and absent in the other.
- **OPTIONS** each knob twice: the region it owns is EMPTY when it is off, and the
  card actually differs. Pet out means measurably fewer drawn pixels in the pet
  region. All 22 catalogue backdrops are composed and each must paint the card.
- **GUTTER** on a plain wash, the bounding box of everything drawn lies inside the
  6% gutter, and nothing at all sits below Instagram's reserved bottom.
- **CONTRACT** an unresolved pet shiny is rejected; an unknown pet id is rejected.
- **HARD RULE** a source grep: no calories, macros, weight or step tokens.
- Empty sample sets fail: every count is asserted greater than zero before it is
  asserted about.

`node tests/figure-audit.mjs` now scans `js/studio.js` too. Without that the new
SITES row would be decorative, because the audit's whole point is failing when a
new surface draws a pet unregistered.

## Proven red

Every guard. Each ran against a fresh `rsync` copy under `/tmp` with the bug
reintroduced **there**; the worktree was never mutated. To re-prove:

```sh
SRC=/Users/tommiller/reggie-press/studio
pr() { d=/tmp/pr-$1; shift; rm -rf $d; mkdir -p $d; rsync -a --exclude .git $SRC/ $d/; \
       (cd $d && "$@") ; (cd $d && node tests/studio-audit.mjs; echo "exit=$?"); rm -rf $d; }

pr zorder      perl -0pi -e 's/\.sort\(\(a, b\) => a\.z - b\.z\)/.sort((a, b) => b.z - a.z)/' js/studio.js
pr slot-gone   perl -0pi -e "s/\.map\(s => outfit\[s\.code\]\)/.filter(s => s.code !== 'H').map(s => outfit[s.code])/" js/studio.js
pr blank       perl -0pi -e 's/  for \(const rel of layerRels\) \{/  for (const rel of []) {/' js/studio.js
pr quote       perl -0pi -e 's/if \(o\.quote\) \{/if (true) {/' js/studio.js
pr petknob     perl -0pi -e 's/const pet = o\.pet \? \(look && look\.pet\) \|\| null : null;/const pet = (look \&\& look.pet) || null;/' js/studio.js
pr size        perl -0pi -e 's/const W = 1080, H = 1920;/const W = 1080, H = 1900;/' js/studio.js
pr sparkle     perl -0pi -e 's/  const sx = Math\.min\(LAYOUT\.pet\.l \+ inkW \* ps - sp \* 0\.55, LAYOUT\.pet\.r - sp\);/  const sx = LAYOUT.pet.l + inkW * ps - sp * 0.55;/' js/studio.js
pr shinyguard  perl -0pi -e "s/if \(typeof pet\.shiny !== 'boolean'\) \{/if (false) {/" js/studio.js
```

Results, verbatim:

| Mutation | Printed |
|---|---|
| slot sort reversed | 12 slots red: `dressed/H (z110) 20555 px wrong`, `dressed/T (z60) 30848 px wrong`, `under-layers/S (z20) 14370 px wrong` |
| one slot never drawn | `every slot actually draws ink` red naming `dressed/H`; `every drawable slot owns visible pixels` red naming `H` |
| no layers drawn at all | all 16 slot renders red, all 13 slots unproven |
| shiny art + sparkle removed | `0 pixels differ`; `shiny gold 0px, plain gold 0px` |
| `o.quote` ignored | `on 15631px, off 790px, 15568px changed` |
| `o.pet` ignored | `in 60367px, out 60367px, 0px changed on the card` |
| sparkle clamp removed | `ink r=1030` against a gutter right edge of 1015 |
| plate moved 80px down | `62236px below y=1540` |
| composed at 1080x1900 | `{"w":1080,"h":1900}` |
| resolved-shiny guard removed | `{"undef":"accepted"}` |
| `look.kcal` printed in the name row | HARD RULE red naming the line |

And for `tests/figure-audit.mjs` (same throwaway method, `node tests/figure-audit.mjs`):

| Mutation | Printed |
|---|---|
| the `studio-card` SITES row removed | `COVERAGE ... js/studio.js:345  if (pet) drawStudioPet(ctx, pet, art.get(petRel));` |
| a SECOND `drawStudioPet` call added elsewhere | `COVERAGE ... js/studio.js:318  if (globalThis.__never) drawStudioPet(null, null, null);` |
| `{ id: outfit.C }` built in studio.js | `STATIC ... js/studio.js:285  const pet = o.pet ? { id: outfit.C, shiny: false } : null;` |

Note on the second row: the claim string is `art.get(petRel)`, not the function
name. Claiming on `drawStudioPet` looked natural and was **useless**, because a
second call site contains that token too and would claim itself. It only goes red
with a claim unique to the one intended call site. Same class as the ±3 line
window this audit already documents.

## Findings

1. **`tests/figure-audit.mjs` only ever read `js/app.js`.** Any pet drawn from
   another module was invisible to the coverage rule whose entire job is noticing
   new figure surfaces. Now it reads a list of sources. Cheap change, and without
   it the SITES row this task asked for would have asserted nothing.
2. **The plan's stale risks (PLAN §8).** "All 22 backdrops are still called Tidy
   Backdrop #1" and "258 numbered names" are **no longer true**: `BH_ITEMS` has
   zero placeholder `#N` names across all 364 items, and BG1 is "Deep Indigo".
   The naming dependency the plan flags as a blocker for this feature is already
   paid off. The gear list renders real names today.
3. **`drawTrimmedArt` is less reusable than PLAN §2 implies.** It centres one PNG
   in a canvas. It cannot seat a stack on a ground line, which is what a card
   needs, so the ink maths is shared in spirit and not in code. Worth correcting
   in the doc so the next reader does not plan around it.
4. **`speechLine()` cannot be called from a compositor.** It reads app state and
   takes calorie totals as arguments. Wiring the quote through it would drag
   health data into the card path, against the plan's own hard rule. The
   compositor takes a finished string instead; the Studio screen calls
   `speechLine()` and passes the result.
5. **`T1`'s art is 83% semi-transparent** (median alpha 109 over its ink). It has
   no solid interior, so it cannot be depth-proven by pixel identity. The audit
   outfit is now chosen by measurement (largest solid interior per slot) rather
   than by picking ids that looked plausible. Flagging it because a garment that
   translucent may or may not be intended.
6. **Canvas resampling has reach.** A scaled layer at `imageSmoothingQuality:
   'high'` influences pixels a few past its own visible ink, and an alpha near
   0.01 vanishes against the dark wash while visibly tinting a bright body
   underneath. Both were found by probing actual mismatching pixels rather than
   by reasoning, and both are handled in the audit (a 3px reach, and ink detected
   against two backgrounds).
7. **Art resolution, unchanged from PLAN §5.** Shipped art is 640px, so a 1080
   card upscales the figure ~1.2x and a backdrop 3x. It reads fine at figure
   scale; the backdrop is visibly soft. The plan's recommendation (fetch the
   1000px masters on demand) is untouched here and still stands.

## Not done, deliberately

- No Studio screen, no AR Snap, no auto-cards, no frames, no stickers.
- No file sharing: build order step 1 (the device question) is unanswered and
  needs an attended native build.
- `APP_BUILD`, `sw.js` VERSION and the changelog are untouched, as instructed.
- The compositor is not wired into any screen and nothing imports it yet.

## Verification run before push

```
node tests/unit.test.js      exit 0    177 passed, 0 failed
node tests/figure-audit.mjs  exit 0    39/39 passed (5 sites driven, 10 not)
node tests/studio-audit.mjs  exit 0    27/27 checks passed
```
