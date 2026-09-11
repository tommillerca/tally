# Advisory implementation report

Frozen plan SHA256 verified: f8bb58f61b77d1220a40ac5c92ab65e0f477c4943d187ab0721b9ff7bb599407.
All source paths were resolved inside this checkout. HEAD, local main and origin/main all resolve to bdf7325da4f05c8d08290037c6d0ba337deb2f10 (v578). No rebase was necessary against these available refs. Remote freshness was not independently verified.

## Changes

- `js/app.js`: measures each dequeued toast before paint. Keeps the 96px bottom seat when clear, otherwise searches measured gaps. Resolves native safe-area lengths through computed CSS. No observers or DOM reparenting.
- `app.css`: appended a measured-seat override, retaining z-index 320 and pointer-events none. Historical CSS prefix preserved.
- `tests/toast-reach-audit.mjs`: new CONTROL, VISIBLE, CLEAR and POLICY rows for nine routes at 375x812 and 430x932. CONTROL prints counts including large stages. Environment flag TOAST_SHIPPED_96 restores the old seat for red proof.
- `tests/toast-map-audit.mjs`, `tests/toast-sheet-audit.mjs`: retained all rows. SEAT now independently measures clear Crew controls after navigation instead of requiring an obsolete literal offset. Dedicated CLEAR rows unchanged. Today audit retained unchanged.
- `tests/toast-seat.test.mjs`: exercises the production positioning function against default, Gwart, fight, large-stage and impossible geometry.
- `tests/unit.test.js`, `tests/silence-disclosure-audit.mjs`: queue and disclosure VM harnesses stub layout positioning; their existing behavioral assertions remain intact. Geometry is tested separately.
- `docs/v578/guard-red.txt`: appended the blocked red attempt, preserving previous evidence.
- `docs/v578/toast-rooms2/`: this report and raw proof logs.

## Rule and limitations

Any overlap with a visible reachable control at most 160px tall counts. For taller controls, overlap counts when it covers at least 25% of the original area. This protects ordinary tap rows without treating the measured 592-707px Studio stage or 480x480 Shop container as wholly forbidden surfaces. No element-name exclusions.

The candidate search uses the default seat, the viewport top inset and gaps 12px above/below measured controls. It runs once for each queued message, not continuously during scrolling, route changes or resizing.

An overfull surface can have no valid seat. The implementation keeps the feedback visible and exposes `data-seat-clear=false` rather than claiming success or silently dropping the toast. This fallback is a proposed deviation for impossible geometry, not a claim that acceptance passed. Browser review must establish whether any required route reaches it.

## Verification and blockers

- `node tests/toast-seat.test.mjs`: PASS, five geometry cases.
- `node tests/silence-disclosure-audit.mjs`: 12 passed, 0 failed.
- `node tests/unit.test.js`: **391 passed, 0 failed**, exit 0 (unit.txt). Initial run found two mock-layout incompatibilities, corrected in the harnesses; initial output retained in unit-initial.txt.
- All four requested toast browser audits exited 1 before measurements: sandbox denied `listen` on 127.0.0.1 with EPERM. No screen has a verified green result here.
- `TOAST_SHIPPED_96=1 node tests/toast-reach-audit.mjs` hit the same denial. Red proof is UNPROVEN. No failing screen names can honestly be supplied from that attempt.
- Syntax checks and `git diff --check` pass.

No commit, push, publication, original-checkout edit, version bump, service-worker change or native/ASC-SUBMISSION.md edit was performed. No approval bypass was attempted. Browser acceptance and red-proof acceptance remain blocked and require an environment permitting the existing audit server and browser.
