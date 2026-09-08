# s2 advisory investigation report

Status: blocked at browser painting. The supplied production code does not
reproduce the reported blank in Node. No production fix is claimed.

The frozen plan file's SHA256 matched
`e61f0bbc9a7894d7f0ee51da70432067b5c4067de5643aa7f84c29c6ae6cf8f2`.
All inspected sources and changed files belong to this checkout. No original
checkout was edited. Catalogue membership, art existence, and the existence of
crop entries were not re-investigated as possible causes.

## Path recorded before testing any candidate cause

`socialSnapshot` → `syncProfile` and JSON serialization → server profile
sanitization/storage → `/friends` → `listFriends` → fan selection/mounting →
`crewCardArtHtml` → `petPortraitHtml` → `croppedPetImg` → thumbnail URL and
image geometry → CSS/compositing.

The following evidence walks forward from the producer. Source line numbers
refer to this checkout. “Executed” means production function source evaluated
in a Node VM with the boundary substitutions described below. It does not mean
a browser or live service was exercised.

## Every traced hop

| Hop | Evidence and result |
| --- | --- |
| 1. Producer input | `js/app.js:23765`: `buildFighter` derives `petMeta` from `petInst`, including `id: petInst.sp`, shiny and validated morph. Source inspection only. The Node fixture supplies this boundary object, since reproducing the owner's persisted save is outside this diagnostic. |
| 2. `socialSnapshot` | `js/app.js:24055` awaits settled initialization and reads the fighter, outfit, instances and wardrobe. At line 24132 the `pet` literal explicitly keeps `id`, `level`, `shiny`, `lineage`, and `morph`. The `yard` literal retains wardrobe separately. Executed for all seven rows: the resulting pet equals the input pet field for field. |
| 3. `syncProfile` | `js/social.js:922` passes `{ snapshot, appV }` directly to `signedFetch('PUT', '/profile', ...)`. Executed with a transport stub: the uploaded pet equals the snapshot pet. There is no further pet DTO here. |
| 4. Signed request serialization | `js/social.js:373`, specifically line 377, serializes the complete `bodyObj` with `JSON.stringify`. Source inspection; the stub performs an equivalent JSON round trip. Signing and HTTP were not executed. |
| 5. Server input shaping | `server/src/index.js:1478` allows both `pet` and `yard`. `boundSnapValue` at line 1503 bounds strings and nesting, without a nested pet-field allowlist. `sanitizeSnapshot` at line 1526 applies that copy and unrelated numeric bounds. Executed the complete production sanitizer: every row retains its exact pet and expected wardrobe, including the football jersey. |
| 6. Profile persistence | `server/src/index.js:2208` sanitizes the request snapshot, line 2209 serializes `checked.snap`, and line 2222 binds that string into `players.profile`. Source inspection plus JSON serialization replay. No database or request handler execution. |
| 7. Accepted-friend server response | The `/friends` SELECT at `server/src/index.js:2686` reads both players' complete profile columns. `shape` at line 2713 parses the other player's profile and the accepted branch at line 2728 returns `profile: prof` verbatim. Executed `shape` for an accepted friend with a serialized profile fixture: complete profile equality holds. SQL querying and authentication were not executed. |
| 8. Client friend response | `js/social.js:654` parses the response, adds aliases to friend rows, then returns `{ ...data, reached: true }` at line 677. Executed against the fixture response: the friend's complete profile is preserved. |
| 9. Fan data and selection | `js/app.js:13126` assigns `social.listFriends()` directly to `data` and calls `paintFan`. `fanFriend` at line 12765 selects the original row by player ID. Fan ordering tracks IDs rather than rebuilding profiles. Source inspection only; there is no pet-field destructuring here. |
| 10. Fan mounting | `applyFan` at `js/app.js:12804` hides/unmounts off-hand cards. A seated empty stage receives `crewCardArtHtml(f)` as `innerHTML`, then `composeAvatars(stage)` at line 12842. Source inspection only. Real DOM mounting, card visibility and seat transitions remain unverified. |
| 11. Crew pet renderer | `crewCardArtHtml` at `js/app.js:12285` reads `f.profile`, requires `p.pet.id`, and emits `.cfan-pet`. It passes the ID, size 58, explicit shiny, `mass: true`, validated snapshot morph, `thumb: true`, and wardrobe from `p.yard.wear`. Executed with each transported friend. All seven emit a pet wrapper; no field is dropped on this call. |
| 12. Portrait adapter | `petPortraitHtml` at `js/app.js:823` destructures and forwards `mass`, `wear`, `thumb`, and `morph`. It selects shiny art, morph art via `js/pets.js:303`, or `bhAsset(BH_BY_ID[petId])` via `data/boneheadz.js:2033`. `CX` deliberately uses its ordinary amethyst portrait. It calls `croppedPetImg` directly. Executed: this path is static for every species, including both football lizards. `petSpriteHtml` and animated sprite generation are not part of the Crew card path. |
| 13. Size and wardrobe adapters | `petScale` at `js/app.js:432` uses `petMassScale` for animated species and `staticMassScale` at line 404 otherwise. `wearOf` at line 453 uses the viewer's wardrobe only for `undefined`; the Crew supplies its own wardrobe or `null`. Executed: C2 gets an 83px box, C6 58px, and C4/CX 77px. The fixture deliberately gives the viewer a separate wardrobe; a bare friend stays bare. |
| 14. Cropped image construction | `croppedPetImg` at `js/app.js:534` accepts the explicit source override, applies the known crop's fractional geometry, resolves worn layers/tints, and emits a base image plus worn images. Executed: all boxes are nonzero, no `NaN`, `Infinity`, or `undefined` appears, and the transformed known crop bounds remain within the wrapper. These are calculations on emitted markup, not measured browser rectangles or decoded pixels. |
| 15. Thumbnail URL and fallback | `croppedPetImg` selects a tier from full-image display size and DPR, then calls `bhThumb` at `data/boneheadz.js:2148`. `bhAsset` preserves explicit `item.file`; `bhThumb` preserves the source's relative suffix. Executed at DPR 2: each emitted base URL matches its expected ordinary, shiny or morph source at an allowed tier. Tiered markup carries `data-full` and `THUMB_FALLBACK` at line 2172. Image loading, fallback events and decoding were not executed. |
| 16. CSS and compositor | `app.css:3795` positions `.cfan-pet`; line 4860 gives `.petcrop` relative positioning, inline-block layout and hidden overflow. The image has inline absolute geometry. `composeAvatars` at `js/app.js:6733` selects only `.bh-anim` stacks; the pet wrapper is a sibling. Source inspection only. Actual CSS cascade, image decoding, clipping, stacking and final painting are the first unverified visual results. No claim is made that Node proves visibility. |

## Changes and deviations

- Added `tests/crew-pet-node-guard.mjs`: a diagnostic that executes the production
  snapshot, sync adapter, sanitizer, accepted-friend response shaper, friend
  response adapter, Crew pet renderer, portrait renderer and crop renderer.
- Modified `tests/release-gate.mjs`: registered the diagnostic in `PURE`.
- Added this report, `docs/s2-crewblank.md`.
- Production files are unchanged. The proposed deviation from a repair is this
  diagnostic and an explicit browser investigation handoff. All seven rows
  already pass on the supplied production code. Consequently the requested
  guard that fails before the fix and passes after is **not fulfilled**.
  No artificial failure or speculative fix was introduced.
- The plan describes the prior accessory fix as `pet.wear`. This checkout
  instead deliberately sends wardrobe via the friends-only `yard.wear`, and
  the Crew renderer reads it there. That existing behavior was preserved.

The diagnostic stubs persistence inputs, signing/HTTP, alias storage, avatar
sibling markup and sparkle markup. It runs no app boot, browser, SQL query or
live server. The successful C2 base CONTROL demonstrates a normal pet taking
the same tested pipeline. It does not distinguish the reported blank from that
control: all supplied cases produce valid markup today.

## Proof output

Required command: `node tests/unit.test.js`. Exit 0.

```text
365 passed, 0 failed
```

`node tests/crew-pet-node-guard.mjs`. Exit 0, both before and after registration
in PURE, with no production edits:

```text
PASS CONTROL C2 base: assets/bh/thumb/384/C/C2.png; 83x83 box; 1 image(s)
PASS C6 base: assets/bh/thumb/192/C/C6.png; 58x58 box; 1 image(s)
PASS C6 dressed: assets/bh/thumb/192/C/C6.png; 58x58 box; 2 image(s)
PASS C6 shiny: assets/bh/thumb/192/C/shiny/C6.png; 58x58 box; 2 image(s)
PASS C6 midnight: assets/bh/thumb/192/C/morph/C6__midnight.png; 58x58 box; 2 image(s)
PASS C4 football: assets/bh/thumb/384/C/C4.png; 77x77 box; 2 image(s)
PASS CX football: assets/bh/thumb/384/C/CX.png; 77x77 box; 2 image(s)
7/7 Node rows passed. Browser paint unverified.
```

`git diff --check`: exit 0, no output.

## Blocked actions and unrun proofs

No permission denials occurred. No sockets, browser, commit, push or publish
actions were attempted. The full release gate and browser audits were not run.

The blocked confirmation is the mounted image at
`.cfan-pet .petcrop img` on an affected, seated Crew card. A browser follow-up
would inspect the actual friend's `profile.pet` and `yard.wear`, the mounted
markup, `currentSrc`, `complete`, `naturalWidth`/`naturalHeight`, fallback
events, computed styles and bounding rectangles through `.cfan-stage`,
`.cfan-pet`, `.petcrop` and the image. It would check clipping and overlap from
the plate and neighboring cards, then compare final pixels with the C2 control.
These observations would identify whether the first difference occurs in the
real payload, loading/decoding, DOM state, layout or painting. They were not
guessed or substituted with a redesign.
