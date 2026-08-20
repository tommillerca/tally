# Overscroll wordmark, third attempt: make it unmistakable

Branch `feat/wordmark-unmistakable`, rebased onto `origin/main` @ `510d583`.
Ships as **v420** (v418 and v419 both landed while this was in flight).

## Findings before writing code

1. **The shipped opacity contradicted its own comment.** The wordmark note in
   `app.css` said "Opacity .55 -> .78 because a faint mark behind the status bar
   was the second half of the same problem." The rule shipped `opacity: .55`.
   v415's contrast half never landed, because raising it turned the INK row red
   (that row pinned the composite to `--text-3`) and the number got put back
   while the sentence stayed. The guard was steering the design instead of
   grading it.

2. **The guard had 25 checks, not 27, and no rows named PREMISE.** Counted off
   `origin/main`, and its own floor was `results.length < 25`. The TODAY row is
   what covers "the app itself sets the class": it reads what route() left behind
   rather than setting the class itself. Now 37 checks.

3. **The `--sat 0` regression is real and I reproduced it.** Measured against the
   shipped rule (`top: calc(-8px - var(--sat))`, height 46), bottom edge at
   `38 - sat`:

   ```
   --sat  0px : top -8   bottom +38   38px welded on screen at every scroll position
   --sat 47px : top -55  bottom  -9   0px visible, 9px of pull for the first pixel
   --sat 59px : top -67  bottom -21   0px visible, 21px of pull (Tom's phone)
   ```

   Same rule, opposite failures at the two ends of `--sat`. That is the tell that
   arithmetic against the inset was the wrong mechanism, not that the constant
   needed another tune. Every inset the old guard graded was non-zero, which is
   how a rule with a live regression on desktop, notchless phones and the Android
   shell passed 25 of 25.

4. **`bottom: 100%` behaves as described, verified not assumed.** Probed at
   `--sat` 0, 47, 59 and 62: the percentage resolves against the scroller's
   PADDING BOX height (`clientHeight` 867, not `scrollHeight` 2972), and the used
   `top` comes out `-62px` at every one of them, i.e. the bottom edge lands
   exactly on the containing block's top edge. `getComputedStyle` returns that
   used value in px, so the guard's existing `top + height` arithmetic keeps
   working unchanged. Adopted.

## What shipped

- `app.css`: `bottom: 100%` and no `top` at all, 232x62 (was 172x46, 1.82x the
  area), `opacity: var(--wm-pull, 1)`. Zero pixels at rest and a first pixel at
  the first pixel of travel, by construction, on every inset. The `--sat 0` bug
  is not fixed, it is unrepresentable.
- `js/app.js`: `bindWordmarkPull()`, a passive `scroll` listener on `#screen`
  setting `--wm-pull` to `min(1, -scrollTop / 36)` quantised to 1/20. iOS reports
  a negative `scrollTop` for the whole rubber band, so `-scrollTop` IS the pull
  distance in px and the fade is a function of position, not of force.
- **The CSS default is 1, not 0.** If a WebView never reports the negative offset
  the listener never fires, `--wm-pull` stays unset, and the mark reveals at FULL
  opacity off the geometry alone. Third attempt at this feature: a JS-driven
  reveal that silently no-ops into a blank space is the one outcome that must be
  impossible. Guarded by the FAILOPEN row.
- `prefers-reduced-motion` is handled in the listener (`q = 1` at any pull), not
  in a media query, so a player who asked for no motion gets the mark with no
  fade rather than a dimmer mark. No keyframe, no duration and no iteration count
  exist anywhere in this feature, so there is nothing that could be collapsed to
  0.001s and run a loop a thousand times a second.

## Curve, measured off the render at `--sat 59`

| pull | mark visible | opacity |
|---|---|---|
| 0px | 0px | 0.00 |
| 10px | 10px | 0.30 |
| 20px | 20px | 0.55 |
| 36px | 36px | 1.00 |
| 63px | 62px (whole) | 1.00 |
| 110px | 62px (whole) | 1.00 |

v414: 73px for pixel one, 113px for whole, ceiling 0.55.
v415: 21px / 67px at `--sat 59`, 9px / 55px at 47, and **-38px / 8px at 0**
(already on screen), ceiling 0.55.
v420: 0px / 62px at every inset, ceiling 1.00.

## The INK row

Inverted, deliberately. It pinned the revealed mark to `--text-3` with a
brightness CEILING of 200: a rule that said "this must stay dim", which is the
thing Tom rejected in words, and which had already bent the code once (finding
1). It now requires the opposite, with a brightness FLOOR: mean within 40 of the
source cream (255,243,211) and a brightest channel of at least 240. Measured,
opacity 1 gives mean rgb(243,232,202) / max 255; the .55 the old row demanded
gives mean rgb(144,137,127) / max under 200. 80+ levels apart on every channel,
so the bound is not delicate. Proven red by restoring `.55`.

## Two harness traps found, both of which made a working feature look broken

1. **A released fake pull gets corrected during the next `await`.** The VISIBLE
   row read opacity 1 and then screenshotted a black band. The listener was
   right: releasing the `scrollTop` override lets a real scroll event land, and
   at `scrollTop` 0 the mark is correctly transparent. Anything grading pixels
   has to HOLD the negative offset across the capture, which is also a truer
   simulation of a bounce.
2. **Pseudo-element computed style lags one recalc cycle under emulated media.**
   Under `Emulation.setEmulatedMedia` the listener set `--wm-pull` to "1" and
   three consecutive reads returned "0", "0", "1". The first draft of REDUCED
   read in the same task, got 0, and I concluded a perfectly good CSS `@media`
   pin did not apply and swapped the mechanism. The swap stands on its own merits
   but the evidence for it was a stale read, and that is recorded in the guard.

## Genuinely unverifiable headless

- **The rubber band itself.** Chromium clamps `scrollTop` at 0 (the CLAMP row
  asserts it). Both the geometry and the listener are exercised by SIMULATION:
  the content layer and the mark are displaced by the geometry a bounce produces,
  and the listener is driven by shadowing `scrollTop` with an own property and
  dispatching a real `scroll` event. That runs the production handler and the
  assertions are on pixels, but it is a simulation of the bounce, not the bounce.
  The only proof that pulling down on an iPhone shows the wordmark is pulling
  down on an iPhone.
- **Whether iOS fires `scroll` often enough during the bounce for the fade to
  look smooth rather than steppy.** Unknowable off-device. Mitigated by the
  quantisation being 20 steps over 36px, and by the geometric reveal being
  continuous regardless of how often the listener runs.
- **Whether `-webkit-overflow-scrolling: touch` throttles scroll events during
  momentum on the current iOS.** If it does, the fade lands late rather than not
  at all, because the default is the loud end state.
- **The Android WebView's `--sat`.** It is almost certainly 0, which is what made
  the old bug so visible there, but this build has not run on a device.
