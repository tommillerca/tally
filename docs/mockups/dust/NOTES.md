# Transmute conversion visual: 3 mockup options (DO NOT SHIP)

Branch: cloud/dust-visual. Mockups only. Tom picks or rejects; nothing here merges.

The subject is the Kitchen's Transmute row (js/app.js openKitchen render, js/cooking.js
TRANSMUTE = 6 commons -> 1 Ectoplasm, 20h cooldown). Shipped today: a crate-row with a
140px hairline meter (.tm-meter, v465) and a button. Payoff on convert is a generic
confettiBurst + toast, identical to serving a dish. Tom's open note (2026-08-27):
the 6-to-1 conversion visual was never built.

All three options are rendered IN the real app behind a `?tmmock=a|b|c` query param
(navigator.webdriver-independent, but demo-db only in practice since capture uses ?demo).
The param gate is clearly marked MOCKUP in js/app.js and app.css and is the whole
extent of app code touched. No art asset is edited or generated; every drawing used
is a shipped file under assets/icons-pix/.

## Option A: the meter grows pips (minimal)
Six discrete sockets instead of a hairline bar. 3/6 and 5/6 become countable at a
glance. Full = lime, same as today. On convert the pips drain and the Ectoplasm icon
takes a one-shot soft glow. Same row, same copy, same geometry otherwise.

## Option B: the pot takes them (physical conversion)
A slot strip under the copy showing the ACTUAL six commons doTransmute would take
(same greedy most-abundant order), as 24px pixel art in six sockets, an inked arrow,
and the Ectoplasm socket. On convert each ingredient flies into the Ectoplasm socket
and winks out, staggered, then the Ectoplasm pops in behind a layered bloom.
Objects are drawn art; only light is procedural (FX-DESIGN-RULES.md).

## Option C: the ritual circle (the risk)
The row becomes a small scene in the Kitchen marquee's own hand-drawn SVG language
(wobbly #2A2D28 strokes, flat fills): six sockets on an inked circle around a center
socket, old-cartoon-magic tick marks. Ingredients occupy ring sockets as they are
gathered; ready state blooms violet; convert pulls the six to center and the
Ectoplasm appears with radiating drawn lines. A composition the app has not used
before, but built entirely from its existing languages.

States captured per option: empty (0 commons), partial (3), ready (7), just-converted.
Capture: docs/mockups/dust/capture.mjs, 430x932 dsf2 via tests/godmode.js boot()
serving THIS checkout.
