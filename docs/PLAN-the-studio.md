# Plan: The Studio (sharing your Bonehead)

_Written 2026-08-09 for Tom's approval. Nothing built. Artifact with real sample
cards: https://claude.ai/code/artifact/31c0c843-e0ed-4c3e-a008-97e51c0d2e9f_

Tom's brief, verbatim:

> we need a feature that makes people want to share their bonehead. right now
> there is no clear way to create a bonehead studio type thing and share your
> bonehead with friends and also take a photo of them AR in the real world like
> pokemongo. this feature needs to be created to insentivize social media
> sharing. this feature should include multiple ways to get a photo of your
> bonehead, with a friend code, without a friend code, with a fun bonehead quote,
> wihtout, plain backdrop just showing gear and pet etc. there should be
> different frames you can add and stickers.

## 1. The thesis

A photobooth is not the feature. The feature is **a picture worth posting,
offered at a moment worth posting about**. Pokémon GO's AR camera is used far
less than people remember; what spread was the screenshot of a rare catch.

Three surfaces, and the third is the growth engine:

1. **The Studio** — deliberate. Backdrop, pet, frame, stickers, quote, export.
2. **AR Snap** — camera passthrough with the Bonehead composited on top.
3. **Auto-cards** — the app pre-builds a card at six proud moments and the
   existing celebration screen grows one "Share this" button.

## 2. What already exists (checked, not assumed)

| | Where |
|---|---|
| **Camera** | `js/scanner.js` runs `getUserMedia` with a rear 1920x1080 stream, permission handling, iOS inline-playback fix, stall watchdog. AR Snap is a second consumer of a shipped stack |
| **22 backdrops** | `BG` slot, real art, 1000px masters, already droppable |
| **Layer renderer** | `avatarLayersHtml`: slots, z-order, shiny swap, glow rules |
| **Canvas art** | `drawTrimmedArt` already loads a PNG, finds its alpha bbox, draws scaled |
| **Voice** | `speechLine()`, twelve contextual pools |
| **Friend codes + share sheet** | Crew calls `navigator.share` (text only) |
| **MISSING: file share** | no `@capacitor/share`; the only share call passes text |
| **MISSING: QR** | nothing in `vendor/` |
| **MISSING: hi-res art** | see §5 |

## 3. The composer (one, shared by all three surfaces)

| Knob | Options | Default |
|---|---|---|
| Backdrop | 22 `BG` items / plain wash / live camera | plain wash |
| Pet | in shot / out | in, if equipped |
| Quote | off / Bonehead line / your own | off in AR, on in Studio |
| Friend code | off / text / QR | context (see below) |
| Frame | none + unlocked | none |
| Stickers | drag, pinch, ~5 max | none |
| Gear list | off / on | on for the plain card |
| Shape | **1080x1920 everywhere** | the only option |
| Who is in it | you / +1 crew / up to 4 / a versus result | you |

**Friend-code default:** on for a system share (strangers), off for a plain save
to Photos. One tap either way. If that is too clever, default on.

**Format: 9:16 only, inside Instagram's safe zones.** Tom, 2026-08-09: "the share
sheets should all be IG story format aka 9x16" and "make sure youre taking into
account instagram 2026 safe margins on story".

| Reserved | px | What Instagram puts there |
|---|---|---|
| Top | 270 | profile icon, username, timestamp, close, progress bars |
| Bottom (Stories) | 380 | reply bar / CTA |
| Bottom (Reels) | 670 | like / comment / share / audio / caption stack |
| Sides | 65 each | safe content width ~950px |

Usable band: **1080x1270**, y=270 to y=1540. Meta unified the Stories and Reels
top margin at 270 in March 2026; the bottoms still differ.

**The rule:** *decoration may bleed into a reserved zone, information may not.* A
frame border, backdrop, the character's feet, a holo edge: fine. A word, number,
code or QR: never.

**It is a check, not an intention.** The render script measures every
informational element against 270/380/65 and fails on a violation. Proven red
against the old flush-to-bottom layout (11 violations, incl. `plate: bottom 1920
> 1540`), and it then caught 3 real ones in my own first frame pass.

**Open:** built to the Stories envelope (380). Posted as a Reel, the bottom 670px
is covered and the plate is partly hidden. Meta advises designing to the Reels
margin when a creative runs in both; I did not, because it costs another 290px of
picture and these are Stories-first. One constant if Tom wants it changed.

**Layout rule: text never sits on the character.** Figure gets the upper two
thirds, chrome gets a solid band, zero overlap. Enforced by a collision check in
the render script, not by eye.

**Seating: on INK, never the box.** Cam's art sits in a 1000px square with a lot
of transparent air, so two figures with identical boxes stand at different
heights. Take each drawing's alpha bbox and ground footprint, scale so the
*drawing* is a given height, seat the footprint on the ground line, put the shadow
under the footprint's centre. Then **clamp the pet**: shrink until it fits inside
the card with a real margin, because a companion sliced by the frame edge is worse
than a smaller one.

**HARD RULE:** no calories, macros, weight, weigh-in trend or step counts may ever
reach a card. Not as an option, not behind a toggle. Guarded by a test that is
proven red by trying to put one there.

## 3b. Buddy cards

Tom, 2026-08-09: _"what about also the ability to create a screenshot with your
buddy's bonehead?"_ Strongest idea in the feature: it doubles the reach of every
card, because two people have a reason to post it and one is showing the other off.

| Card | What it is | Fires from |
|---|---|---|
| **BUDDY** | you + one crew member, standing close, both names, one code (yours) | their Crew profile |
| **SQUAD** | up to four of the crew in a line-up | the Crew tab |
| **VERSUS** | a spar result; loser's line still reads DOWN, NOT OUT | straight off a spar |
| **AR with a friend** | their Bonehead in your room | AR Snap, pick who |

**The data already exists.** `socialSnapshot` carries each player's full `outfit`
map and their `pet` with its own `shiny` / `level` / `lineage`. That is how the
leaderboard already draws everyone's real Bonehead. Layout work, not plumbing.

**THE TRAP (documented, and it has happened here before).** The figure contract in
`tally/CLAUDE.md` opens with it: *"Never read shiny off an outfit. Never pass
another player's pet through `S.shinyPets`."* That set is **yours**, so rendering a
friend's pet through it draws their shiny in base colours or yours as shiny when
it isn't. One correct path: `petFrom(snapshotPet, ownSpecies)`. Buddy cards are
the single most likely place for that bug to return, so they get a SITES row in
`tests/figure-audit.mjs` (which fails the build if a screen draws a pet unregistered).

**Consent rules** (everything else exports *your* stuff; this exports someone else):

- **Mutual friends only.** Not anyone off the leaderboard. In-app browsing and a
  permanent public post are different bars.
- **Their display name yes, their friend code NEVER.** A handle is chosen; a code
  is an invite that is theirs to give. Only your own code appears.
- **Settings opt-out:** "Let crew put my Bonehead on their cards", default on,
  honoured server-side so a stale snapshot cannot defeat it.
- **Nothing beyond the character.** No stats, no streak, no level history.

**Two things that will bite:**

1. **Stale snapshots.** If they changed hat and have not synced, you post
   yesterday's fit under their name. Refresh before render; if the fetch fails,
   say the card shows a saved look rather than silently lying.
2. **Facing each other means mirroring, and mirroring flips lettering.** Cam's
   pose faces one way. The mockup keeps both facing the same way and lets a VS
   badge carry the confrontation. Nose-to-nose needs a per-item "safe to flip"
   flag on the catalogue: real work.

## 4. Frames: North Face meets the video store

Tom, 2026-08-09, on my first pass ("a border and a corner mark"): _"uninspired
this needs to feel cool and if youre not playing oyure missing out! it's a spooky
fun street style game get creative. think nike and the northface meets horror
movies."_

A frame does not decorate the picture, it **costumes** it. Six launch frames in
three families, all mocked up in the artifact:

| Family | Frame | What it is |
|---|---|---|
| Horror | **RENTAL** | video-shop sleeve: member sticker with your name, DUE BACK: NEVER, barcode, BE KIND. REWIND. |
| Horror | **TRACKING** | found footage: scanlines, a tracking tear, REC dot, timecode, DO NOT WATCH ALONE |
| Street | **BIB** | race number: your level IS the number, pinned four corners, sponsor stripe |
| Street | **HANGTAG** | TNF product tag: spec column, kraft swing tag on a grommet, 100% BONE / DO NOT TUMBLE DRY |
| Horror | **ONE-SHEET** | slasher poster: drippy title, tagline, credits block (NO CARBS WERE HARMED) |
| Earned | **FOIL** | prismatic border + sheen + a 3% SHINY stamp. Cannot be bought or picked |

**All six are CSS and SVG over the same composite. No new art from Cam.** That is
the point: a whole cosmetic line that costs illustration time only when we choose.

Why they drive sharing rather than just looking nice:

- **The frame states something true.** Bib prints your level. Foil prints 3%. A
  stranger reads the flex with no caption.
- **Some cannot be bought at any price.** Foil = a shiny pull. Add a Champion
  frame and a 100-day frame. The FOMO is "how did you get that frame".
- **They rotate** on the drop calendar, so a card is datestamped by its frame.
- **The character always wins.** Every treatment got pulled back once because the
  atmosphere was eating the Bonehead.

Stickers use the same language (dymo tape, price-gun PRICELESS, ripstop patch,
NEW starburst / hazard tape, grease-pencil circle, evidence marker, one drip /
Champion plate, streak patch, foil star). A sticker is a flat object with an ink
outline pressed onto the picture: never a glow, flare, sparkle or gif.

## 5. Two findings worth deciding now

**Mockups get rendered in the browser, not PIL.** My first card renders used
Python's imaging library, which cannot read a woff2, so they silently fell back to
a system face and shipped in the wrong typeface. Same class of error as
rasterising a slide with text metrics instead of opening PowerPoint. Cards are
rendered by Chrome with `assets/fonts/bangers.woff2` loaded, which is also the
real feature's output path.

**Resolution.** Shipped art is 640x640; Cam's masters are 1000x1000. A 1080 card
from 640px art is a 1.7x upscale and looks soft next to crisp text.
**Recommend: fetch the 1000px art on demand for the ~10 slots being rendered**,
not precached, with the 640 art as an offline fallback. Zero app-size cost. The
whole 1000px library is 13MB.

**Sharing a FILE is the real unknown.** The only share call today passes text.
`navigator.share` with a file from inside a Capacitor WKWebView is uncertain and
must be **tested on a real device before anything else is built**, because the
answer changes the button and the copy. Fallbacks: the Capacitor share plugin, or
save to Photos. Web build falls back to long-press-save plus a download link.

Everything else is quiet: all art is same-origin so the canvas never taints;
compositing a dozen PNGs at 1080 is tens of milliseconds.

## 6. Auto-card moments

Shiny hatch (3% odds, the number one card) · beating the Champion · level
10/25/50 · a legendary or prestige pull · streak 30/50/100 · a set completed.

**Anti-nag rule:** at most one offer per session, only these moments, always
inside a celebration the player already triggered, never its own popup, dismissal
remembered.

## 7. Build order

1. **Answer the share question on a real device**, before any UI. → verify: a real
   image reaches Instagram from the real iOS build, or we know which fallback we
   are building.
2. **The compositor, headless.** Look + options in, a 1080 `Blob` out. No screen
   attached. → verify: pixel-compare against a stored reference; every `BH_SLOTS`
   slot at the right z-order; a shiny pet renders shiny.
3. **Mockups for Tom** (Studio screen, AR screen) before either is built.
4. **The Studio screen.** → verify: every control changes the exported pixels not
   just the preview; export matches preview; still exports with the network cut.
5. **AR Snap.** → verify: a captured frame contains real camera pixels AND a
   decoded Bonehead; the sprite lands where the player put it; denying the camera
   leaves a working Studio, never a dead screen.
6. **Auto-cards.** → verify: all six moments in one session produce exactly one
   offer; dismissal survives a reload.
7. **Frames and stickers as catalogue items.** → verify: an unearned achievement
   frame cannot be selected or forced into an export.
8. **Guards:** `tests/studio-audit.mjs`, a mandatory new row in
   `tests/figure-audit.mjs` SITES (the audit FAILS if a new screen draws a pet and
   is not registered), and the no-health-data test. All proven red first.

## 8. Risks

- A second camera permission prompt. Follow the onboarding permission rule: our
  screen explains, then the system sheet, never cold.
- Sharing publishes. A card carries a display name and possibly a friend code out
  of the app permanently.
- **Placeholder names go public here.** The plain card's gear list renders
  "Street Hat #21", "Cosmic Top #1", "Eternal Pet #2" straight onto a picture
  going out to strangers. Renaming the catalogue is a **dependency** of this
  feature, not a tidy-up.
- **All 22 backdrops are still called "Tidy Backdrop #1".** The Studio turns the
  backdrop list into something players read and choose from, so renaming stops
  being optional the day this ships. Part of the 258 numbered names flagged
  2026-08-09.
- Scope: three shippable features. Compositor + Studio first makes the other two
  cheap.

## 9. Open questions

1. **QR or text?** QR that installs with the code prefilled is the actual growth
   loop; ~3KB vendored JS plus a deep link the app must handle. I would do it.
2. **Where does the Studio live?** My pick: a button in the Wardrobe plus an entry
   from your Crew profile. Not its own tab.
3. **Frames earned-only, or also purchasable?** Both fit cosmetic-only.
4. **Ship order.** Compositor + Studio first is my recommendation. Say if AR is
   the part you want in hands first.
