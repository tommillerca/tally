# Advisory implementation report

Status: implementation present, acceptance incomplete. The independent reviewer must run the browser audit in an environment that permits a local server and Chromium. Neither a live defect reproduction nor a passing local browser audit is claimed.

Frozen plan SHA256 verified: `bfba9e6661be955b085db0af9f8cac4b4f57f373d44709f905ccf7d4741a629c`.

## Changed files

- `app.css`: appended individual figure shifts, retaining the companion's right anchor and the existing sharing offset. Added an explicit correction to the historical shadow geometry comments.
- `js/app.js`: mounts the grounding routine when Today renders.
- `js/hero-ground.js`: derives the shadow centre from equipped character alpha after image load and resize. Applies a shared 5% horizontal displacement through each figure's own `--bh-shift`. Cost is one CSS-pixel character-box canvas composite and alpha scan per scheduled mount/load/resize update, not a continuous animation loop. Disconnects the previous observer on remount.
- `tests/hero-ground-audit.mjs`: composite-alpha guard for four footwear looks, ordinary C1 and large C6 pets, and both requested viewport sizes. Uses an overscan margin to retain off-viewport ink. Disables animation and filters while preserving the keyframe shift. Compares displacement to the inherited transforms, including the original sharing offset. Explicit URL argument takes precedence over URL environment variable; otherwise serves this checkout.
- `docs/l-ground2/`: this report, source alpha measurements, unit output, local/live audit output, and combined `guard-red.txt`.

## Proof

`node tests/unit.test.js`: exit 0, **391 passed, 0 failed**. Full stdout/stderr in `unit.txt`.

Syntax checks passed for both new JavaScript files. `git diff --check` passed. Byte comparison against HEAD confirms the inherited `app.css` prefix is unchanged.

Both browser commands exited 1 before measurements. Local serving failed with `listen EPERM: operation not permitted 127.0.0.1`. Live testing encountered `/bin/ps: Operation not permitted` and Chromium launch failure. Full output is in `guard-red.txt`. These are infrastructure failures, not proven-red results.

## Padding and historical diagnosis

Source canvases composited at 640x640, using alpha >24 and layers B0-1, optional footwear, then SK0-1:

| Look | Ink bottom | Canvas bottom minus ink bottom |
| --- | ---: | ---: |
| Barefoot | 591 | 49 |
| FW1, Bunny Slippers (wide footwear) | 602 | 38 |
| FW3, Rain Boots | 602 | 38 |
| FW7-1, Sticker Hi-Tops | 596 | 44 |

Pixel counts and bounds are in `art-padding.txt`. These are source-art measurements, not browser measurements. They establish that a single padding constant is invalid.

Commit `997baa2a` (v566, Screen 1E) raised both figures 16px while preserving their sizes, leaving the shadow unchanged. This establishes a layout change underlying the gap. The exact August costume and viewport are not recorded, so the remaining difference between the historical 105px and supplied 117.8px cannot be uniquely attributed. No claim that the source art itself changed is made.

## Deviations and unresolved requirement

1. Five percent of 430px is 21.5px, incompatible with an 18-to-20px shift at both widths. Implementation uses 5% at both widths; audit expects 18.75px and 21.5px with 1px raster tolerance.
2. Correcting the original CSS comments conflicts with preserving the inherited prefix. Explicit superseding comments were appended; historical bytes remain intact.
3. PET-PLANE remains unresolved. Footwear changes the sole by up to 11 source pixels, approximately 6.5 CSS pixels at the supplied figure size. Keeping the pet's vertical position fixed can therefore exceed the 4px tolerance for barefoot looks. The audit retains the strict 4px requirement. Proposed deviation, **not implemented**: vertically align the character to the existing pet ink baseline per equipped look, then place the shadow there. This requires agreement because it changes character placement beyond the requested horizontal shift.

No commit, push, publication, version bump, art edit, or modification to `native/ASC-SUBMISSION.md` was performed. All writes were in this checkout. No permission escalation was attempted; the environment disallows it.
