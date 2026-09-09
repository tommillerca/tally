# Crate cadence review

Advisory report for independent review. Frozen plan SHA256 verified:
`064cea36970a8addbe7cfb0882328754bcb140625ea2d3aefe9f3fc8e566ecc9`.
All source paths below are relative to this checkout.

## Finding and change

`index.html:28` loads `app.css`; `index.html:99` loads `js/app.js` directly.
The audited source is the page's entry source. No deployed build was inspected.

Before this change, the nominal 400ms calculation skipped `renderCard()`'s
art-readiness race and `go()` frame scheduling. The full normal-motion,
non-final-card path was:

`0ms advance + min(art readiness, 700ms) + min(two animation frames, 300ms fallback) + 20ms CSS delay + 380ms rise`.

With cold art and undelivered frames, that is **1,400 authored milliseconds**.
Even ready art still paid the frame wait. This is source/clock evidence, not a
measurement of browser wall time. Timer throttling can extend those deadlines.

Subsequent normal-motion cards now hydrate concurrently and commit the new
deck's layout before adding `.go` synchronously. Their authored path is:

| Part | Code | Authored time from fling |
| --- | --- | --- |
| Capture and gesture | `js/app.js:19399`: `setPointerCapture(pid)`; pointermove records `dx`; `end()` at line 19415 checks `landed` and calls `fling()` from pointerup | 0ms |
| Dispatch next card | `js/app.js:19386`: `at(0, advance)`; `at` at line 19144 is a relative `setTimeout` | 0ms |
| Build and start entrance | `advance()` at line 19214 increments `i` and calls `renderCard()`; lines 19310 to 19331 hydrate art and synchronously call `enter()` for `i > 0 && !reduced` | 0ms |
| CSS delay | `app.css:5248`: browsing `--b-card: .02s` | 20ms |
| CSS rise | `app.css:5377`: scoped `crNext .38s ... var(--b-card) both` | **400ms settled** |
| Concurrent outgoing flight | `js/app.js:19385`: remove the retained outgoing subtree at 340ms, matching its `.34s` transition | 340ms |

The existing removal of inline opening beat overrides remains in place. First
card opening beats, the first browsing card's art gate, reduced-motion dispatch,
last-card close timing, and the 100ms opening HOLD are unchanged. The 560ms burst
resume timer does not gate the card entrance. Idle sway and surrounding label
animations are separate from the card rise's settled pose.

## Guard and proof

Extended `tests/crate-cadence-audit.mjs`, retaining every existing guard row.
It executes the real pointer listeners, `advance()` and `renderCard()` with DOM,
clock, art and frame doubles. It asserts capture, exactly one advance, layout
commit, both directions, tap, cold art, stalled frames, outgoing retention and
400ms authored settling. Controls reject both the old 790ms serial arrangement
and the hidden 1,000ms art/frame wait. It also checks page entry paths and the
scoped CSS rule.

- `node tests/unit.test.js`: **371 passed, 0 failed**.
- `node tests/crate-cadence-audit.mjs`: **12/12 passed**.
- Full PURE registry: **101/101 suites passed**, including dependency recovery
  and final reruns of the changed guard and guard lints.
- `node --check js/app.js` and `git diff --check`: passed.

PURE was extracted from the complete `const PURE` block, including every push
and unshift, in `tests/release-gate.mjs`. Each registered suite ran sequentially
with Node. The regular release gate was not launched because it starts a server
and browser work. Runner: `/private/tmp/fix-crate-pure.mjs`. Initial suite logs,
exit codes, registry, rerun logs and final results are under
`/private/tmp/fix-crate-pure-proof/`. Unit output is
`/private/tmp/fix-crate-unit.log`.

## Denied actions and deviations

Initial PURE result was 100/101: `store-copy-lint.mjs` could not import `esprima`.
Offline npm recovery first returned ENOTCACHED, then EPERM when it tried to
create a temporary directory in the user's npm cache. No permission escalation
or network installation followed. The cached tarball was copied read-only,
verified against `package-lock.json`'s SHA512, and extracted to this checkout's
ignored `node_modules/esprima`. The failed suite then passed. Dependency
manifests and lockfiles were unchanged.

Behavioral tradeoff: subsequent cards no longer wait for art readiness. A cold
asset can populate its panel after the entrance starts. A strict 400ms guarantee
for fully decoded rendered pixels is impossible from authored constants alone.
The implemented interpretation is a 400ms authored card-rise budget, with cold
art and actual frame delivery explicitly left for browser review. No opening
cinematic requirement was changed and no guard row was weakened.

No commit, push, publication, socket server or browser was run. Browser and
rendered-pixel proof are **UNRUN** by work-order restriction.

## Exact remaining browser work

1. Load this checkout with normal motion. Under webdriver set
   `window.__crateForce = 1`; keep reduced-motion preference off. Open a pack of
   at least three distinct cards and wait for its first card to land.
2. Use native touch or active-pointer input to produce
   `pointerdown` / `pointermove` / `pointerup` on `.pack-tilt`. Confirm the active
   pointer is captured by `setPointerCapture`. Previous `page.mouse` drags did
   not trigger the fling and must not be accepted as evidence.
3. Require all three pointer events, a changed card identity/count and the
   outgoing subtree before scoring timing. Record from the pointerup that
   invokes fling through the next `.pc-rise` animation completion and its
   visible final pose. Check outgoing continuity through its 340ms flight.
4. Exercise first-to-second and second-to-third transitions, left/right throws
   and tap. Repeat with cold art to inspect the disclosed late-art tradeoff.
   Record art decode/readiness separately from the 400ms animation budget.
   DOM events and computed durations alone do not certify rendered pixels.

## Files changed

- `js/app.js`
- `tests/crate-cadence-audit.mjs`
- `docs/reviews/fix-crate-review.md`
