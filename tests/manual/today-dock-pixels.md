# Today dock pixel proof

Frozen work order, 2026-09-08. Run from the checkout being reviewed.

## Browser band and positive control

Requires Node, Python 3, the repository's pinned Puppeteer (`npm ci`), its
Chrome installation, and permission to bind loopback sockets and launch Chrome.
On macOS use `HEADLESS_MODE=shell` if the default screenshot implementation hangs.

```sh
HEADLESS_MODE=shell node tests/today-dock-pixels-audit.mjs
```

The guard serves this checkout itself and boots the demo save. At 393x852 and
375x667 it samples screenshot pixels across both exposed sides of all interior
rows of the reserved band. It requires zero hero-edge pixels and an opaque dock
base colour. It then restores the original transparent border in the live DOM,
verifies its computed colour, width and style, and checks that the screen rectangle,
scroll position and background colour did not change. In the same two sample
rectangles, EACH side must fail the exact `BAND-PIXELS` predicate and contain
more than 100 hero-edge pixels. Restoring the original inline style must make
`RESTORED-BAND-PIXELS` pass again. Geometry is supplementary.

### Round 2 control correction and remaining investigation

The old control required over 99% hero-edge even though the band guard rejects
ANY hero-edge pixel. The operator reported 358/1570 and 270/1480 hero matches:
both already fail the actual band predicate. The old uniform-colour expectation
is inconsistent with those captures. This revision replaces that expectation
with the same predicate used to grade the fix, inverted independently on each
side, plus substantial hero-colour evidence. The fixed-band threshold and sample
rectangles are unchanged. Blank captures and an unchanged dock fail the control.
Node fixtures exercise the supplied counts; they are not rendered proof.

The precise source of the other pixels is still undiagnosed. This checkout's
restricted environment cannot serve the audit, and a socket-free Chrome pipe
launch failed with `TargetCloseError`. Consequently this is a disclosed change
to the control expectation, pending independent rendered review. Do not describe
the restore or sampling geometry as proven correct until `CONTROL-RESTORE` and
the pixel rows actually run. The new restore diagnostics distinguish an
incomplete restore or moved rectangle from a mixed-paint result.

Run this guard before applying the CSS fix to obtain the red-before result:
`BAND-PIXELS` must fail and `CONTROL-PIXELS` must pass. After the fix, both must
pass. Missing native evidence still exits 97 (unproven). A band failure exits 1
even when native evidence is absent. No network bind or browser launch means
the band proof and its positive control have not run.

### DPR caller review

The operator's `tests/godmode.js` viewport fallback is retained unchanged.
Review of `tests/*.{js,mjs}` found `today-dock-pixels-audit.mjs` as the only live
audit passing top-level `deviceScaleFactor` to `boot()` without `defaultViewport`.
Other occurrences set it inside a complete viewport or call `setViewport` after
boot. However, `GODMODE_DPR` opts ordinary boot callers into the same faulty path.
The Node doubles in `guard-debts-audit.mjs` and `harness-environment-audit.mjs`
also exercise DPR-only boot. The former now validates Chrome's required dimensions,
executes the viewport evaluation, covers live/explicit/fallback dimensions and
requires both direct-DPR and environment-DPR calls to fail when the operator's
fallback is removed. It previously accepted dimensionless viewport calls.

## Native bounce pixels

Headless Chromium cannot reproduce iOS compositor rubber-band paint. A translated
child or a computed-style check is not a substitute. The guard therefore requires
an operator-captured PNG of a real held pull and its accompanying measurements.
This is manual evidence, not an independently automated gesture assertion.

1. Serve **this checkout** to an iOS simulator/device, using a fresh demo session
   (`?demo#/today`) with caches/service workers cleared. Use standalone mode or a
   WKWebView so Safari pull-to-refresh does not replace the inner bounce. Verify
   the loaded `app.css` matches this checkout's `shasum -a 256 app.css`.
2. In its Web Inspector console, run:

   ```js
   const scroller = document.getElementById('screen');
   scroller.style.setProperty('--hero-edge', 'rgb(108,123,61)');
   scroller.scrollTop = 0;
   scroller.addEventListener('scroll', () => console.log(scroller.scrollTop), { passive: true });
   ```

3. Hold a downward touch drag until `scrollTop` is at most -40. Capture a native
   PNG **while held** (for example `xcrun simctl io booted screenshot /tmp/today-pull.png`).
   Record the negative scrollTop during capture. Do not translate content,
   change background/clip/border styles, or synthesize the screenshot.
4. Choose a rectangle wholly inside the newly exposed top bounce, at least 20
   physical pixels high and spanning at least 75% of the screenshot width. Use
   physical PNG coordinates, excluding status bars and content. Save JSON outside
   the checkout. Replace all illustrative measurements with the actual values:

   ```json
   {
     "cssSha256": "SHA256_OF_THE_LOADED_APP_CSS",
     "engine": "iOS WebKit",
     "heroEdge": [108, 123, 61],
     "scrollTop": -80,
     "screenshot": "today-pull.png",
     "region": { "x": 10, "y": 180, "width": 1159, "height": 40 }
   }
   ```

5. Run the complete guard:

   ```sh
   TODAY_BOUNCE_EVIDENCE=/tmp/today-pull.json HEADLESS_MODE=shell node tests/today-dock-pixels-audit.mjs
   ```

It decodes the native PNG and requires over 99% of the sampled pixels to match
hero-edge within 3 RGB levels. Empty/out-of-bounds samples, stale CSS hashes,
nonnegative pulls and undersized regions fail. Keep the PNG, JSON and output for
the independent reviewer. Exit 0 requires both browser band/control and native
bounce pixels. PURE includes this guard by explicit work-order requirement;
the tier now requires these browser/native prerequisites for a complete pass.
