# Off-hand registration round 2: advisory implementation report

Frozen plan SHA256 verified:
`d64dda488e0d3ff370dc19030686a391c03c1b6a12a6ef0d4bea426c35cc8278`.
All source paths resolved relative to this checkout. This report is advisory for independent review.

## Applied and verified

The four 640x640 masters use the exact frozen translations. All surviving RGBA
values are unchanged, including low-alpha ink. No resampling or recolouring was
performed on a master. Only the authorized out-of-frame dust was discarded.
The saved PNGs were decoded again and compared against every expected RGBA byte.

| Item | Translation | Lost alpha>0 pixels | Max lost alpha | Surviving pixels | Surviving bbox before | Bbox after |
| --- | --- | --- | --- | --- | --- | --- |
| IL10-1 | +30,+104 | 0 | 0 | 18575 | (344,0,604,365) | (374,104,634,469) |
| IL10-2 | +30,+104 | 0 | 0 | 18542 | (344,0,603,364) | (374,104,633,468) |
| IL17-1 | +44,+68 | 7 | 11 | 15036 | (362,38,582,360) | (406,106,626,428) |
| IL17-2 | +44,+68 | 10 | 30 | 15024 | (362,38,544,359) | (406,106,588,427) |

Boxes are half-open and measured at alpha>0. The before boxes describe surviving
pixels, excluding only the authorized 17 lost pixels. Each after box equals that
before box plus the frozen offset. Remaining low-alpha dust is preserved.

[Printed assertions](translation-output.txt) include exact loss counts, lost-alpha
histograms, surviving multiset counts and bounding-box equalities. Reproduce with
`python3 docs/offhand-registration/verify-translation.py`. This defaults to
read-only verification against SHA256-pinned originals in [before/](before/).
Its optional `--apply` refuses masters that no longer match the originals.

## Hand audit and visual limitation

The existing `tests/hand-registration-audit.mjs` and its PURE registration in
`tests/release-gate.mjs` are retained unchanged. The audit is green on all four:

| Item | Before core/ring | After core/ring |
| --- | --- | --- |
| IL10-1 | 0 / 0 | 191 / 1320 |
| IL10-2 | 0 / 0 | 195 / 1323 |
| IL17-1 | 26 / 267 | 212 / 1303 |
| IL17-2 | 22 / 264 | 216 / 1305 |

The full post-fix census is **38/38 IL and 24/24 IR**, exit 0. The [complete
post-fix table](after-audit.txt) prints every IR item. IR art is unchanged.
The [pre-fix run](before-audit.txt), repeated before any art writes, exits 1 with
both brushes failing. The old spades already passed the ring floor, so this
metric cannot by itself prove every grip is correct.

The [before/after contact sheet](before-after.png) shows all four layers over
B0-1 at full source resolution and is cited in CLAIMS. Visually inspected: the
frozen offsets bring the shafts onto the raised fist, but their existing
transparent shaft cutouts now sit below it. Thus the mechanical translation is
verified, while a fully natural grip is not claimed. No alternate offsets or
redrawing were applied. If aligning those cutouts is also required, the proposed
follow-up is a revised artist/operator-approved placement, with a new pixel and
contact-sheet review. That is outside this frozen work order.

## Proof output

- `node tests/unit.test.js`: **379 passed, 0 failed**, exit 0.
  [Complete output](unit.test.output.txt).
- `node tests/hand-registration-audit.mjs`: **38/38 IL, 24/24 IR, 0 FAILED**, exit 0.
- `node docs/offhand-registration/run-pure.mjs`: **145/145 PURE files exit 0**.
  [Driver](pure-driver.txt), [summary](pure-summary.json), [all suite output](pure-output.txt).
  The runner reads the actual PURE declaration and all push/unshift statements,
  runs with concurrency 4, and respects the gate's SERIAL list. No browser tier
  or release server was started.
- `python3 docs/offhand-registration/verify-translation.py`: all exact loss,
  alpha, RGBA and bbox assertions pass.
- `python3 scripts/build-bh-thumbs.py`: regenerated all 1,300 derived thumbnails
  using the unmodified project process. [Output](thumbnail-build.txt).
- `python3 scripts/build-bh-thumbs.py --check`: **all fresh**, exit 0.
  [Output](thumbnail-check.txt). Nine thumbnail files differ: all eight square
  derivatives and IL17-2 trim. The other three affected trims rebuild identically.
- `git diff --check`: exit 0.

## Denied/blocked actions and deviations

No tool action was denied. No commit, push or publication was attempted. No
original checkout, IR art, prohibited JavaScript file, disclosure module or
other lane's audit was edited.

The first spec's stash/restore RED procedure was replaced with a run against the
original PNGs before any writes. It proves the same pre-fix failure without
writing read-only Git metadata. Hash-pinned originals are retained for review.

The existing vNEXT changelog comment now states the fix is implemented and awaits
release integration. It remains outside shipped CHANGES; a numbered release would
require changing the forbidden app.js version. CLAIMS contains exactly one vNEXT
PROOF row for that one item. This continues the previous round's documented
release-integration deviation.

The dust removal is explicitly authorized by round 2, not an additional deviation.
No numerical or translation requirement was redesigned. The visual limitation
above remains for independent review.

`preflight.json` and `art-unchanged.txt` are retained as historical pre-write
evidence from round 1. Their no-write statements describe that earlier state;
`translation-output.txt` and this report describe the corrected art.

## Files changed in round 2

See [changed-files.txt](changed-files.txt) for the exact checkout-relative list.
The changes comprise four masters, nine thumbnails, CLAIMS, the vNEXT changelog
comment, this report, updated PURE receipts, and new pixel/visual evidence with
reproducible verification and PURE runners. The hand audit and release gate were
already present and required no edits. Unit and pre-fix logs were rerun and are
byte-identical to their previous checked-in outputs.
