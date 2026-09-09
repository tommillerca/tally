# Boneyard scroll: advisory implementation evidence

Frozen plan SHA256 verified:
`221de6c141154873e3300b5b031a99cfce20ec0c5851b5cd94ddb70f3e5b4a4d`.
Baseline checkout HEAD: `97197278`. All source paths resolve in this checkout.
No original checkout was edited. No commit, push, publish or version bump.

## Status and deviations

The CSS fix and regression guards are implemented. Renderer acceptance remains
blocked, so this is not a completed proof of player reachability.

1. Both real-render attempts failed before boot: `serveTree` cannot bind
   `127.0.0.1`, with `listen EPERM: operation not permitted`. Execution policy
   does not permit requesting elevated access. No alternative renderer or
   synthetic geometry has been substituted for the required browser proof.
   Proposed completion: run the registered guard in an environment that permits
   the project's local harness, then copy its reviewed screenshots into this
   directory and reference them from CLAIMS. The existing source RED is explicitly
   not a proven rendered RED.
2. The frozen plan says `.screen` carries a bottom exclusion border. This
   checkout deliberately removed it. `app.css:414` through the `.tabbar` padding
   at line 423 reserves that space in the dock instead, and the existing
   `dock-line-audit.mjs` refuses any restored screen border. That current
   arrangement is preserved. Rendered exclusion is still owed.
3. v538 source comparison can be completed here, but its physical zoom effect
   cannot. No assertion that zoom is harmless or that the 55% report is accurate
   is made.

## Source diagnosis

| Suspect | Baseline evidence | Change or disposition |
| --- | --- | --- |
| Ancestor overflow | `app.css:4362`: `.screen.screen--map` overrides `.screen`'s `overflow-y: auto` with `overflow: hidden`. Line 4363 also clips `.sheet-body.map-sheet`. | Restore vertical scrolling to the screen and remove the wrapper clip. Current rules are at lines 4366 and 4367. |
| Flex sizing | Baseline wrapper uses `flex: 1`, allowing it to shrink into the screen's available height. `#mapBody` already has `min-height: 0`. | Wrapper uses `flex: 1 0 auto`, retaining content height while filling spare room for the live map. Keep the body's existing shrink permission. |
| Fixed height versus minimum | `#app`, at line 155, intentionally has viewport height and clips its in-flow screen/dock flex layout. The Boneyard intro has no fixed-height rule. | Keep the app shell bounded. Let the screen scroll its content within that shell. |
| `100vh`, toolbar and dock | `#app` has both `100vh` fallback and `100dvh`; the dock is a separate in-flow flex child. | No viewport or dock changes. Dynamic toolbar behavior on a real iPhone remains untested. |

These are source findings, not measured renderer causality. The live map keeps
`.map-stage { overflow: hidden; min-height: 0 }`. No text is shrunk, hidden or
zoom-locked. The Boneyard error content shares the same wrapper and scroll owner.
No Crew or leaderboard renderer, `assets/bh/**`, `js/pets.js`,
`tests/fight-sim.mjs` or `js/hunt.js` was changed.

## Required measurements and screenshots

| Viewport | Text | Before content/scrollport height | Before unreachable | After content/scrollport height | After unreachable |
| --- | --- | --- | --- | --- | --- |
| 393x852 | 100% | BLOCKED | Not measured | BLOCKED | Not measured |
| 393x852 | 150% | BLOCKED | Not measured | BLOCKED | Not measured |
| 430x932 | 100% | BLOCKED | Not measured | BLOCKED | Not measured |
| 430x932 | 150% | BLOCKED | Not measured | BLOCKED | Not measured |

The main intro button is **Open the map**, `#mapStart`, in `renderBoneyard()`.
Its before/after coordinates and exactly which controls are off-screen cannot
be reported without rendering. The before/after screenshots were not produced.
See [before attempt](before-attempt.txt) and [after attempt](after-attempt.txt).

The registered browser guard uses `serveTree` and `boot` from `tests/godmode.js`.
It sets the real root font to 16px and 24px at both phone viewports, waits for
fonts, images and route presentation, and records the main button's initial
rectangle. It intersects rendered rectangles with every clipping ancestor,
the viewport and the dock, then measures the union of content-height intervals
reachable by scrolling. The unreachable fraction is one minus that union's
length divided by the intro's rendered height. It never scrolls a hidden
screen programmatically to make unreachable content pass.

All intro controls must become fully visible and pass a center-point hit test.
It also drives the real `refresh()` and `route()` through a test-only intercepted
module response, requires nonzero scroll at 150%, checks preservation versus
reset, and checks the dock and FAB ring rectangles. Production router logic
is unchanged. `js/app.js` only receives a corrected routing comment.

Completion commands, all within this checkout:

```sh
HEADLESS_MODE=shell node tests/boneyard-scroll-audit.mjs --control
HEADLESS_MODE=shell node tests/boneyard-scroll-audit.mjs
```

The control injects the exact two original clipping declarations into the
browser and must exit nonzero on a geometry assertion after printing all four
measurements. A setup error is not an accepted RED. The normal run must exit 0.
The guard writes top/bottom PNGs and JSON to the OS temporary `boneyard-scroll`
directory, following the harness's prohibition on automatic checkout output.
Control filenames start `control-`; fixed filenames start `after-`, followed
by viewport and text percentage. Copy these real artifacts into `docs/` only
after they exist. Do not create substitute screenshots or fill missing numbers
with modeled values.

## v538 evidence

[Source hashes and viewport metadata](v538-source-evidence.txt) compare
`770e027b^` with `770e027b`, the actual v538 commit. Both complete `app.css`
files and both `renderBoneyard` function bodies are byte-identical. v538 removed
`user-scalable=no`; the font-scale CSS predates that commit.

Therefore v538 did not introduce or worsen the Boneyard's source layout rules.
It permits zoom previously disabled by viewport metadata. Whether this makes
the clipping worse in the physical renderer remains unverified, including at
the requested text sizes. Pinch zoom and root text scaling are distinct inputs.

## Proof receipts

- `node tests/unit.test.js`: **382 passed, 0 failed**, exit 0.
  [Full output](unit.test.output.txt).
- `node tests/dock-line-audit.mjs`: source assertions exit 1 against the original
  CSS, then exit 0 after the fix, including controls restoring screen and nested
  clipping. [Source RED](source-red.txt), [source GREEN](source-green.txt).
- `node tests/release-gate.mjs --coverage-only`: exit 0, including the new
  browser audit. [Output](coverage-output.txt).
- Every PURE audit is enumerated by evaluating the declaration through the
  pre-BROWSER source, including all pushes and unshifts. The runner refuses
  fewer than 151 or duplicate entries and executes each with Node. Results and
  the full-log directory are in [the complete census](pure-results.txt).
  **154/154 entries have exit-0 results**, across the full run and one targeted
  rerun. The initial run was 153/154: guard-hygiene rejected entry through a test
  hook. Entry now taps the actual Boneyard dock button, and the
  [guard-hygiene rerun](guard-hygiene-rerun.txt) exits 0. The initial failure
  remains in the receipt; no uninterrupted green run is claimed.
- The renderer commands both exit 1 on `listen EPERM` before any measurement.
  No browser RED/GREEN, screenshot, physical gesture or rendered reachability
  proof is claimed.

## Files changed

- `app.css`: Boneyard scroll owner and wrapper sizing.
- `js/app.js`: routing comment only.
- `js/changelog.js`: one pending item, no released entry or version change.
- `tests/boneyard-scroll-audit.mjs`: rendered geometry guard, original-CSS
  control, screenshots and scroll/dock assertions.
- `tests/dock-line-audit.mjs`: updated Boneyard overflow contract and two
  clipping mutation controls, preserving the existing exclusion assertions.
- `tests/release-gate.mjs`: browser registration.
- `docs/CLAIMS.md`: one vNEXT PROOF row matching the pending changelog item,
  with blocked evidence disclosed.
- `docs/boneyard-scroll/`: this report and proof receipts.

This report is advisory. Independent review must resolve the rendered proof
gap before accepting the reachability claim.
