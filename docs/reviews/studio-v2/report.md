# Studio v2 advisory report

Implemented only in this checkout. Independent review is still required. No commit,
push, PR, merge or publication was attempted.

Frozen plan SHA256 verified:
`cc2c6c360d9cfddd31d31e0efba2275b6fb0e6e528d8e137bdf2da8aa45f5f10`.

## Changed files

- `js/studio.js`: larger composition, feet-aligned pet, Canvas port of the shipped
  speech bubble, real hand-lettered wordmark with positions, text/monster/Crew
  stickers, strict transforms and privacy validation, nearest-neighbour sampling.
- `js/studio-screen.js`: collapsed bottom tray, fixed-choice scene buttons, sticker
  selection, drag placement, move/size/flip/remove controls, clean screenshot dialog.
- `js/app.js`: retains an appearance-only projection when the existing Crew response
  arrives. Studio receives that projection only for the same signed-in friend code.
  No new request or persistent inventory/state mutation.
- `app.css`: Studio controls use existing chip/button/sheet tokens, Bangers, coral,
  warm ink and hard shadows; full-screen clean image and bottom tray styles.
- `js/changelog.js`: silent pending notes inside `NEXT_CHANGES`, as comments so no
  player-facing changelog item is queued. No version stamp changed.
- `docs/CLAIMS.md`: `vNEXT` release evidence and changed assertion rationale.
- `tests/crew-capture-node-audit.mjs`: supplies the new production Crew projection and
  owner/identity bindings to its extracted-function harness; all existing assertions remain.
- `tests/studio-audit.mjs`: extends the existing PURE audit. No new audit registration
  is necessary; `tests/release-gate.mjs` already includes it.
- `docs/reviews/studio-v2/`: this report and captured proof outputs.

## Geometry and art integrity

The reserved rectangle remains x=65 to 1015, y=270 to 1540: 950x1270, area 1,206,500.
No source art file was edited, resampled, re-encoded or otherwise changed on disk.
The final diff contains no change under `assets/` or to `native/ASC-SUBMISSION.md`.

The supplied operator baseline is 687x909 at (126,340), 51.76% of the safe rectangle.
Its pet is 279x233 at (710,973), with ground contact 43px above the figure's feet.
That exact equipped snapshot was not supplied. The following controlled before/after
uses the SAME real-art fixture from `tests/studio-audit.mjs` on the original and new
compositors. It is not represented as a recapture of the operator's outfit.

| Decoded PNG ink | Original compositor | Studio v2 |
| --- | --- | --- |
| Figure x, y | 136, 340 | 65, 340 |
| Figure width, height | 668, 910 | 822, 1120 |
| Figure bounding-box / safe area | 50.38% | 76.31% |
| Pet x, y | 710, 973 | 660, 1114 |
| Pet width, height | 280, 277 | 350, 346 |
| Pet ground | 1250 | 1460 |
| Figure feet | 1250 | 1460 |
| Pet ground minus feet | 0 | 0 |

For this fixture, figure bounding-box area grows 51.45%. Figure placement uniformly
fits an 850x1120 box instead of 700x910. Pet placement uniformly fits 350x460 instead
of 280x400. Its bottom is explicitly aligned to the footwear ink (body ink if there
is no footwear), so accessories extending below the feet do not set its ground line.

The audit intercepts the real composition draw calls and their real transforms,
encodes each on a transparent 1080x1920 PNG, decodes it, then measures alpha >14 ink.
It also encodes and decodes the complete final PNG and checks deterministic bytes.
Bounding-box area is not an opaque-pixel coverage claim. Stickers may intentionally
overlap the figure and each other; these measurements describe component ink before
that occlusion, not a browser judgment of visual prominence.

Placed artwork uses Canvas `imageSmoothingEnabled = false` (nearest neighbour), and
preview images use `image-rendering: pixelated`. At the smallest offered longest-side
size, 180 export pixels, the representative Crew stack has 22,979 visible RGBA colours
in and 3,749 out. All 17 monster counts are in `studio-audit.txt`. Each output palette
is asserted to be a subset of the input palette. This rules out interpolated colour
mush; it does not claim that all source texture survives reduction. No arbitrary art
rotation, nonuniform scaling, tint, filter or recolour is accepted for placed stickers.
The fixed speckle is drawn only on newly authored text sticker cards.

## Speech bubble port

`js/talkbox.js:talkBoxHtml` supplies the vocabulary. The compositor cannot directly
paint DOM into its Node Canvas renderer, so it ports the finished unnamed bubble:

- `app.css .talkbox`: line-height 1.55; tracking .02em; padding .88em vertically and
  .94em horizontally; 2px border; `--radius-sm` 13px; `--sh` 4px/5px hard shadow.
- `app.css .hero-bubble`: `.6875rem` size (11 CSS px at 16px base), left pose -2deg.
  `.hero-bubble.side-r` supplies the mirrored tail and +2deg pose.
- `.hero-bubble::before/::after`: triangles 10px/7px, right offsets -14px/-8px,
  top 42%/45%, 12deg local tail rotation. Padding-box coordinates, border insets and
  transform centres are retained.
- Shipped BoldPixels font, surface `#16151d`, text `#f2e9d7`, and the shipped flattened
  border/tail `#3b393d`. Shadow retains the existing component's rgba(0,0,0,.55).

Geometry is uniformly expressed at three export pixels per CSS pixel. The caption
uses the completed static state, without typing, dismissal or idle animation. Placement
and maximum text width are Studio-specific, with left/right presets and wrapped fixed
copy. Bangers remains the text-sticker face; the wordmark is `assets/brand/wordmark.png`.

## Interaction and privacy

Stickers paint after the player, pet, bubble, mark and optional friend code. Within
stickers the array is back-to-front; newest is topmost. Selection does not reorder.
Pointer hit testing searches that order in reverse. Dragging previews the selection
outline and commits the image on release. Move buttons provide a keyboard alternative.
The longest side is clamped to 180 through 650 pixels and every complete sticker box
is clamped inside STUDIO_SAFE. There is a 12-sticker draft cap and a Remove control.

The Crew response is already fetched by the Crew screen. Its new cached projection
contains a picker label and whitelisted catalogue outfit IDs only. Selecting a friend
copies only outfit IDs into the draft; no name, player ID, health, food or profile object
enters the compositor. Cache ownership is tied to the current player's friend code.
Before Crew has loaded this session, the tray explains that the player must open Crew.

Clean mode uses a top-layer full-viewport dialog containing only the current preview
image. All editing controls and the tray are behind it. Instructions before entry say
to screenshot and explain tap/Escape to return. There is no claim that a screenshot was
saved. Unavailable native Save is hidden; its existing direct-call rejection still runs
in the audit. Available browser download/native bridge behavior is preserved.

## Proof

The full PURE run initially found one missing dependency in the Crew DOM-double harness.
After supplying that dependency, its 16 checks passed. The final Studio audit also passed
after the last compositor and picker changes. Logs retain the initial run summary and
identify these targeted reruns.

- `node tests/unit.test.js`: **exit 0, 385 passed, 0 failed**. Full output in
  `unit-output.txt`.
- Full PURE list from `tests/release-gate.mjs`: **165/165 green, zero failures**. A temporary Node
  runner evaluates the exact `const PURE` declaration and all following `PURE.push`
  statements up to `const BROWSER`, then runs every listed file sequentially in this
  checkout, with per-file stdout/stderr and exit codes, consolidated in `pure-output.txt` and
  `pure-results.json`. No server is started.
- `node tests/release-gate.mjs --coverage-only`: exit 0.
- `baseline-red.txt`: original compositor exits 1 on the new material-size assertion.
- `git diff --check`: exit 0.

Existing privacy, safe-zone, invalid PNG, missing asset/font, shiny instance, layer
order, exact save-byte handoff, cancellation, stale-render and quiet-entry checks remain.
Changed stale rows and reasons are also recorded in `docs/CLAIMS.md` under `vNEXT`.
New proof covers position presets, real sticker palette subsets, exact mirrored pixels,
order-dependent PNGs, transform bounds, nested privacy rejection and control handlers.

The mechanical design detector reported two expected unset-image-src warnings: the
hidden preview and closed clean dialog receive the decoded object URL before display.
Its other warnings concern pre-existing CSS outside this change. Browser checks were
not run and no screenshot was produced or claimed.

## Denied/blocked actions and deviations

- No denied permission action. No local socket binding or browser audit was attempted,
  per the frozen order. Browser layout, touch reach, rendered prominence, real screenshots,
  Photos permissions and Android file-picker behavior remain unproven and operator-owned.
- No Worker deployment, production D1 write, secret change, remote Wrangler write,
  commit, push, PR, merge or publication. `native/ASC-SUBMISSION.md` is untouched.
- The plan's `tally/docs/brand/boneheadz-brand-deck.html` resolves to this checkout's
  `docs/brand/boneheadz-brand-deck.html`. It was read before design. No original checkout
  was edited.
- No Crew cache existed. The implemented proposed adaptation retains the safe projection
  of the existing response, with no new request. Friends become selectable after opening
  Crew in the current session. This availability limit is stated in the tray.
- Placed Crew stickers omit runtime football-team tint overlays to obey the no-tint
  constraint. They retain shipped base artwork and existing eye masks. This can differ
  from a friend's team colours. The player's pre-existing wardrobe tint rendering remains
  unchanged. No source art was changed to work around the conflict.
- The supplied operator outfit is unavailable. Controlled PNG before/after measurements
  use the existing audit fixture; the operator's baseline is quoted separately.
- Studio remains unlisted. `NEXT_CHANGES` contains pending comments, not player-facing
  entries, and the operator must assign any silent build number later.
