# Advisory implementation report

Frozen plan SHA256 verified: `122adf1e1db7b2c7fa61fe0469a1f774fe8c6845a0d05fc894695c6430ce169a`.
All source paths were resolved within this checkout. This report is advisory for independent review.

## Mechanism and tradeoffs

The Boneyard already uses vendored MapLibre 5.24.0, including its camera pinch handler. Its factory now explicitly sets `touchZoomRotate: true`, retaining disabled rotation and pitch, camera bounds, and the existing initial zoom. Page zoom stays disabled, including Boneyard controls and sheets. Only the map camera zooms.

`html, body` now use `touch-action: pan-x pan-y`, replacing the body's `manipulation` value. This preserves permission for native scrolling on both axes while excluding browser pinch zoom. MapLibre retains ownership of its canvas gestures. These are the declared browser behaviors in the [W3C Pointer Events specification](https://www.w3.org/TR/pointerevents3/#the-touch-action-css-property). Actual device enforcement remains unverified.

Options considered:

| Option | Assessment |
| --- | --- |
| Existing MapLibre camera | Chosen. Preserves map coordinates, markers, hit targets and camera limits. Existing teardown removes the camera and re-entry creates a fresh one. |
| Custom scoped gesture handler | Would duplicate MapLibre's touch handling and introduce gesture arbitration and cleanup risks. |
| CSS transform zoom | Would magnify rendered UI and require additional work to preserve map projection, hit testing and bounds. |
| Toggle viewport policy per tab | Would permit zoom of the whole document while on the Boneyard, including surrounding UI. Resetting page scale on exit would depend on browser behavior. |

No global touch listeners, viewport toggles or additional animation were introduced. Existing map lifecycle code was exercised without modification. The outgoing held map has `pointer-events: none` and is removed through the existing route teardown.

## Files changed

- `app.css`: scrolling-permitted page gesture policy on the document root and body.
- `js/map.js`: explicit Boneyard camera pinch permission.
- `tests/boneyard-zoom-audit.mjs`: new pure guard with independently runnable red controls.
- `tests/fontscale-audit.mjs`: logs viewport policy instead of asserting `user-scalable=no`; accepts yes/no policy variants.
- `tests/release-gate.mjs`: registers the zoom guard in `PURE`.
- `docs/reviews/fix-zoom-boneyard/report.md`: this advisory report.

## Proof output

Required command: `node tests/unit.test.js`, exit 0:

```text
378 passed, 0 failed
```

`node tests/boneyard-zoom-audit.mjs`, exit 0:

```text
PASS real routes, Boneyard camera boot, key taps, retry, exit/re-entry and late GPS teardown
PASS CONTROL app-wide zoom rejected by the same guard
PASS CONTROL zoom disabled everywhere rejected by the same guard
DEVICE VERIFICATION OWED: physical pinch, scrolling and taps on iOS/Android were not tested
```

Both deliberate mutations ran as separate commands without modifying production files:

| Command | Exit | Expected assertion |
| --- | --- | --- |
| `node tests/boneyard-zoom-audit.mjs --control=app-wide` | 1 | `today: page zoom must be refused` |
| `node tests/boneyard-zoom-audit.mjs --control=everywhere-off` | 1 | `Boneyard zoom must be permitted` |

`node tests/fontscale-audit.mjs`, exit 0:

```text
PASS 20 type-token definitions resolve through rem and double at 16px to 32px; px TYPE tokens: 0
PASS body base, default sizes, token consumers and px border/sprite controls
INFO viewport policy: <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
PASS 9 regression mutations rejected; viewport yes/no policy changes accepted
```

The full font audit was also run from isolated temporary layouts with `user-scalable=yes` and with the directive omitted. Both exited 0, logged the changed policy, and produced the same three PASS lines. The checkout's `index.html` was not modified.

`node --check tests/boneyard-zoom-audit.mjs` and `git diff --check` passed.

## Proof limits, denied actions and deviations

The zoom guard executes extracted production router, held-view lifecycle, Boneyard renderer, start/retry closure, and map factory code. It uses DOM, GPS and MapLibre stand-ins, and deliberately stops boot at the first map event registration before world simulation. It checks CSS declarations rather than browser-computed styles. Camera teardown/reset, late GPS handling and key callbacks are code-level evidence; the test does not execute MapLibre gesture internals or prove physical pinch, scroll or tap behavior.

Device verification is owed on iOS and Android: pinch the map, try pinch on other tabs and Boneyard overlays, check scrolling/tapping, then leave and return while zoomed. No claim is made that a real gesture works. The full release gate and browser audits were not run.

Denied or blocked actions: none encountered. No commit, push, PR, publishing, Worker deployment, remote Wrangler, production D1 write or secret change was attempted. `native/ASC-SUBMISSION.md` was not touched.

Deviations: none. Reusing the existing Boneyard camera was one of the mechanisms explicitly allowed by the work order. Device verification remains outstanding as required by the plan.
