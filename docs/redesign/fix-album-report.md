# Album restoration advisory report

Implemented within this checkout. No commit, push or publication. Independent
review remains required. The frozen work order hash matched
`854f355bf018c03c7520c09fbef96aeb117edfe066b3015504ea3dc6f4338fd1`.

This report supersedes the carousel and switching guidance in
`stable-redesign-report.md`, which describes the previous design.

## Files changed

- `js/app.js`: restores the shipped v524 ring's depth, tilt, fade and stacking
  from local `origin/main` (`6786b4a1`). Keeps its pointer gestures, axis lock,
  velocity-based release snapping, keyboard navigation and shortest-path dots.
  Removes Previous/Next and the position counter. Separates the pet album/dots
  from the labelled Colour / copy rail, including labels after focus changes.
- `app.css`: restores the shipped perspective and 3D track. Sizes the larger
  portrait within a frame that leaves peeking neighbours at its edges in normal
  and compact states. Keeps the redesign's title, body typography, primary
  action, permanent-action section, quiet doors, bottom currency, safe-area
  tokens and reduced-motion rules.
- `tests/breed-lock-audit.mjs`: replaces the old anti-peek assertion with
  production paint geometry checks and executed swipe/snap, vertical axis lock,
  keyboard, dot and neighbour-tap checks with reduced motion on and off. Checks
  actual Base/Frost/Ember chip templates and instance selection. Existing loss,
  typography, order and cooldown guards remain.
- `tests/unit.test.js`: requires the album guard's successful output.
- `docs/redesign/fix-album-report.md`: this advisory report.

No art, stats, economy or persistence source changed. The entire source from
Stable's nickname handler through the end of `js/app.js`, including the destroy
and breed handlers, is byte-for-byte identical to the pre-change HEAD.
Strengthened confirmations and loss disclosures remain intact.

## Proof

```text
$ node tests/unit.test.js
372 passed, 0 failed

Full PURE tier, final results:
101/101 passed, 0 unresolved failures (one dependency retry)

$ node tests/breed-lock-audit.mjs
BREED LOCK + STABLE UI: 7 passed, 0 failed
STABLE REDESIGN: 4 guard groups passed, 0 failed
```

The initial sequential PURE run finished 100/101 with `store-copy-lint.mjs`
failing because `esprima` was missing. After restoring that local dependency,
`node tests/store-copy-lint.mjs` exited 0 with
`ok store copy: beta surfaces unreachable and store strings clean`.
All 101 entries therefore passed; this is a full-tier result with a retry,
not a claim that the initial runner exited green. The unit suite also passed
inside the full tier after the final source and guard edits.

`node --check js/app.js` and `git diff --check` passed. Raw logs, the exact PURE
manifest, initial and final per-suite results, the retry log and the sequential
runner are in `/tmp/fix-album-proof/`.
The runner extracts the actual PURE declaration plus its push/unshift entries
from `tests/release-gate.mjs`, ending before BROWSER. It runs every entry alone
from this checkout, with no browser or server invocation.

The new guard was also executed against the untouched redesign's `js/app.js`
and `app.css` from HEAD (`c2e346e6`), using temporary source copies. It failed
with exit 1: `AssertionError [ERR_ASSERTION]: shipped album paint exists`.
The existing redesign guard groups passed before the album assertion failed.
Four additional regression mutations are rejected by the healthy guard.

## Denied or blocked actions

No permission denials. No commit, push, publish, network install or original
checkout edit was attempted. Browser execution is intentionally unrun.
The missing local `esprima` dependency was restored into ignored
`node_modules/esprima` from the existing npm cache. Its SHA512 was checked
against `package-lock.json`; manifests and the lockfile were not changed.

## Deviations and limits

1. The shipped album is a JavaScript transform ring with swipe-and-snap, not a
   native horizontal scrolling element with CSS scroll-snap. The proposed and
   implemented deviation preserves that shipped mechanism. The guard proves
   its horizontal swipe and release snap rather than claiming native
   `overflow-x`/`scroll-snap-type` on the pet album. The separate colour/copy
   rail retains its existing native horizontal scrolling and CSS scroll-snap.
2. The shipped fade formula dims a lone pet and completely hides the neighbour
   with two pets. The restored version exempts those collections from the
   back-of-ring fade. One pet has no neighbour; two pets have one visible
   neighbour; three or more have peeks at both edges. No cloned pets were added.
3. Ring geometry reads the untransformed `offsetWidth`, preserving the
   redesign's stable paint measurement and avoiding projected card widths
   feeding back into subsequent transforms. Card and frame sizes reconcile the
   larger portrait with the restored peeks, rather than restoring v524's small
   portrait size. The remaining ring interaction implementation is retained.
4. **Scroll height: unmeasured.** Reporting an actual `scrollHeight` requires
   browser layout, which the work order explicitly leaves unrun. Proposed
   proof deviation: the operator measures it during the independent render.
   No calculated geometry is presented as a rendered measurement.

## Operator verification

Render the final checkout and compare it with both supplied screenshots. Check
normal and compact album states, one/two/many species, both wrap directions,
fast swipes, slow drags, vertical page scrolling, neighbouring-card taps, keys
and dots. Confirm each selection updates the name, stats, action instance,
wardrobe and colour/copy chips together and clears an armed destruction.
Check Base/Frost/Ember selections, safe areas, reduced motion, long names and
small viewports. Pay particular attention to the two-pet wrap, artwork fit and
compact-state peeking. Node guards do not establish these visual outcomes.

After fonts and images settle, record the viewport, collection, focused pet,
expanded panels and these actual Stable dimensions:

```js
await document.fonts.ready;
const stable = document.querySelector('#stableBody');
({ viewport: [innerWidth, innerHeight], clientHeight: stable.clientHeight,
   scrollHeight: stable.scrollHeight,
   maxScroll: stable.scrollHeight - stable.clientHeight });
```
