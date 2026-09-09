# Dock line review, frozen work order 2026-09-09

Pixel review is owed. This restricted checkout cannot bind sockets, so no
rendered colours, native bounce or browser row taps were measured here.

The old acceptance rule required an opaque `rgb(15,14,20)` band. That rule
certified the black line reported by Tom and is superseded. The browser audit
now captures all four tabs and checks scroller clipping and row taps. It does
not turn geometry or a fixed RGB target into proof of visual continuity.

## Implementation choice

Move the 13px exclusion from the screen border into the dock's top padding:
8px becomes 21px. The dock begins 13px higher, while its buttons and the screen's
content clip retain their positions. Its existing translucent background and
blur paint the entire dock. No separate band needs to match variable art.

Scroller padding would allow content into the exclusion. Inheriting Today's
scroller colour would expose its equipped backdrop's bounce colour again.
Moving the exclusion into the sibling dock avoids both problems. Today's solid
background colour and its internal plate remain intact for native bounce.

## Automated source proof

```sh
node tests/dock-line-audit.mjs
node tests/unit.test.js
```

The PURE check covers Today, Boneyard, Crew (`friends`) and Bonehead, rejects the
real opaque-border regression and the original transparent sliver, and models
FAB clearance from the current CSS dimensions. These are source checks, not
browser measurements. The check also rejects lost exclusion and increased FAB
overhang. It was run RED on the original CSS before the fix, outside `tests/`.

## Browser geometry and row taps

On a machine allowed to serve this checkout, with the locked browser dependencies:

```sh
HEADLESS_MODE=shell node tests/today-dock-pixels-audit.mjs
```

The audit serves only its own checkout. It captures each tab at the top and
bottom at 393x852 and 375x667, checks zero screen border and zero gap, and requires
the FAB's 4px ring to remain below the scrollport. A temporary 44px probe row
straddles the clip edge beneath the FAB: tapping its visible portion must invoke
the row once; its clipped portion must be excluded. Removing the extra dock
padding must make a hit at the bottom of the scrollport resolve to the FAB.
The probe and inline control styles are restored after each tab.

Screenshots go to a printed temporary directory outside the checkout. Set
`DOCK_LINE_EVIDENCE_DIR` to another external directory if desired. The audit exits
97 for pending visual review, even if geometry and taps pass. A real assertion
failure exits 1. Its new browser path has not been executed in this environment.

## Required visual measurements

Review both sides of the FAB and the full boundary above the dock in every
capture. Record RGB distributions and seam height for Today, Boneyard, Crew and
Bonehead individually. Do not call a dark room unaffected because it seems
near-black. Compare the unfixed and fixed checkouts at identical scroll offsets,
viewport sizes and safe-area insets. The old 13px opaque or hero-coloured strip
must disappear into the continuous dock surface; the normal dock top rule is
still present. Confirm that content and FAB positions are unchanged.

Repeat with the bright Today hero and actual equipped backdrops, including
contrasting light/dark choices. Equip existing art normally. Do not recolour,
redraw or hue-rotate Cam's art. Inspect tab transitions and Boneyard map gestures
at the boundary, plus the ordinary News-row interaction that exposed R40-22.

## Native bounce evidence

Use iOS WebKit in standalone mode or WKWebView, with fresh assets from this
checkout. Verify the loaded `app.css` SHA256. Set only the bounce test token:

```js
const s = document.getElementById('screen');
s.style.setProperty('--hero-edge', 'rgb(108,123,61)');
s.scrollTop = 0;
s.addEventListener('scroll', () => console.log(s.scrollTop), { passive: true });
```

Hold a real downward touch drag until `scrollTop <= -40`. Capture a native PNG
while held. Record a rectangle wholly inside the exposed bounce, at least 20
physical rows and 75% of the image width. Save this JSON outside the checkout:

```json
{
  "cssSha256": "SHA256_OF_LOADED_APP_CSS",
  "engine": "iOS WebKit",
  "heroEdge": [108, 123, 61],
  "scrollTop": -80,
  "screenshot": "today-pull.png",
  "region": { "x": 10, "y": 180, "width": 1159, "height": 40 }
}
```

Replace every illustrative value with the measured value. Run the browser audit
with `TODAY_BOUNCE_EVIDENCE=/absolute/path/today-pull.json`. It validates the CSS
hash and requires over 99% of the native sample to match the bounce token within
3 RGB levels. This does not discharge the separate all-tab visual review.
