# Round 2 advisory report

Frozen plan SHA256 verified: `57cc5c56bab481675a842157ca41a70ec24d07e3439b3875229098d1bc7df766`.

Status: partial implementation, acceptance blocked by execution environment.

## Changes

`tests/name-fit-audit.mjs` now prints the selector, element, both widths, both heights, clipping flag, all clipping causes, all four named FITS predicates, and the list of failed predicates on each guard row. Clipping causes identify the ancestor or viewport, axis, overflow mode for ancestors, measured element bounds, and clipping bounds. The boolean decisions and one-pixel tolerances are unchanged.

The existing clipping calculation compares the element's border rectangle with each hidden/clip ancestor's border rectangle and the horizontal viewport bounds. Width maths compare the element's own scroll and client widths. These can disagree because an element can fit its own content while extending outside an ancestor. This explains the distinction in the code, but does not establish which condition caused the supplied 164 failures. The new diagnostics make that distinction observable.

`docs/v578/guard-red.txt` preserves previous evidence and appends full output and exit codes for both requested browser commands. `docs/v578/name-fit-round2-unit.txt` records the agreed proof output. This file records scope and remaining work.

## Blockers and deviations

- Local audit: exit 97. Listener creation was denied with `listen EPERM: operation not permitted 127.0.0.1` before any geometry was measured.
- Live audit: exit 97. Puppeteer failed to launch its browser process (`Code: null`, empty stderr). This is an environment failure, not proof that the shipped defect was detected.
- No live `.hub-name` 293/227 measurement or `.hero-name` failure was obtained. The plan's measurements are supplied evidence only.
- Fault 2 remains unresolved: no rendered rows are available to establish which condition fires or justify changing it. Vertical overflow assertions were not relaxed speculatively.
- Fault 3 remains unresolved: no sites could be exercised here, so none were declared permanently unreachable. No rows were removed, exempted, or made non-gating. Missing coverage still exits 97.
- Proposed deviation: deliver the diagnostic change for independent execution in an environment that supports a local server and Chromium, then use those measured failures to complete faults 2 and 3. This is not a completed acceptance result.

Only paths within this checkout were edited. Product files, app.css, native/ASC-SUBMISSION.md, build metadata, and changelog were unchanged. No commit, push, or publication was attempted. Approval escalation is unavailable; no escalation or sandbox bypass was attempted.

## Proof

`node tests/unit.test.js`: exit 0, `391 passed, 0 failed`. Full output is in `name-fit-round2-unit.txt`.

`node --check tests/name-fit-audit.mjs` and `git diff --check`: exit 0.
