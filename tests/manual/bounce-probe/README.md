# The bounce probe

**What it answers:** what actually paints into the strip an iOS rubber-band pull
opens at the top of Today, which is the one thing no headless run in `tests/` can
assert and the thing that has now cost four releases.

`tests/overscroll-wordmark-audit.mjs` grades everything that can be wrong WITHOUT
a bounce. This is the other half, and it is manual on purpose: it needs a real
WebKit compositor and a real held gesture.

## Run it

```
cd tests/manual/bounce-probe && python3 -m http.server 8842 --bind 127.0.0.1
xcrun simctl openurl booted "http://localhost:8842/"
```

Then hold a drag downward from the middle of the screen and screenshot while the
finger is still down. Driving it from a script:

```
# capture window first, because the bounce only exists mid-gesture
(for i in $(seq -w 1 300); do xcrun simctl io booted screenshot /tmp/b_$i.png; done) &
# then a drag whose last points barely move, so the pull is HELD for ~9s
```

The page forces `--hero-edge` to magenta, so the strip's source is unmistakable.

## What it measured, 2026-08-25

The pulled strip is **magenta edge to edge with the wordmark printed on it**. So
`background-color` on `.screen--today` DOES fill the rubber band, and the page
plate (`.today-plate`, sticky, `z-index: -1`) does not intrude on it.

## Why it is a BARE page and not the app

Dragging inside the real app in MobileSafari fires **Safari's own
pull-to-refresh** instead of the inner scroller's bounce: the page reloads and
you measure nothing. `overscroll-behavior: contain` is already on `.screen` and
does not prevent it. The service worker can also serve cached CSS over whatever
you just changed. Both of those cost me a full round of false measurements. A
bare page with the same `#app` / `.screen` boxes has neither problem.

Keep it in sync by hand with the four rules it copies: `.screen`,
`.screen--today`, `.today-plate` (+ `::before`), and
`#app:has(.screen--today)::before`.
