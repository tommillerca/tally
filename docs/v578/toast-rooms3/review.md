# Advisory round 3 report

Status: incomplete, browser acceptance blocked.

Frozen plan SHA256 verified: 24bdfc52f4e2a309a6dfb3a66b006e4e8c688300080fe23c0649de453e18835c.
All source paths resolve within this checkout.

## Files changed

- `tests/toast-reach-audit.mjs`: added rendered-screen and reachable-screen counts plus reachable control names on CONTROL failure. Preserved the existing CONTROL predicate and all collision assertions.
- `tests/silence-disclosure-audit.mjs`: comment explains that the layout stub preserves save-failure/erasure disclosure, severity and queue-priority assertions. This was not a 96px rebaseline.
- `tests/unit.test.js`: comment explains that the layout stub preserves backlog capacity, order, dwell and final-hide assertions. This was not a 96px rebaseline.
- `docs/v578/toast-rooms3/`: this report and raw logs: unit.txt, disclosure.txt, seat-unit.txt, reach.txt, sheet.txt, today.txt, map.txt, shipped-96-red.txt.

## Diagnosis and deviation

Source contradicts the tentative outside-screen diagnosis: route() passes #screen to renderSettings(), which assigns el.innerHTML after multiple asynchronous reads. Without a live measurement, the 13/14 global controls do not establish that Settings rendered reachable controls. They could include persistent shell controls or overlays. Replacing CONTROL with a global positive count would allow the vacuous pass prohibited by the work order.

The requested assertion fix is therefore deferred, not claimed complete. The proposed deviation is to retain the guard with additional diagnostics until a permitted browser run identifies the cause. No route-name special case or changed acceptance predicate was introduced. The diagnostics report DOM control count separately from measured reachable controls; DOM count alone is not used as proof of rendering.

## Denied actions and outstanding acceptance

All four requested browser audit commands exited 1 before measuring any row: the sandbox denied listening on 127.0.0.1 with EPERM. The shipped-seat run, `TOAST_SHIPPED_96=1 node tests/toast-reach-audit.mjs`, failed identically. This is a blocked attempt, not prove-red. Failing route names at 96px remain unknown. Prior evidence is preserved unchanged. Neither fight CLEAR row nor any requested route is newly verified green here. Today and map audits remain active.

No commit, push, publication, original-checkout edit, DOM restructuring, CSS change, protected native-document edit, or build/version change was performed. No permission bypass was attempted.

## Proof

- Agreed command `node tests/unit.test.js`: **391 passed, 0 failed**, exit 0. Full output: `unit.txt`.

- `node tests/silence-disclosure-audit.mjs`: 12 passed, 0 failed, exit 0.
- `node tests/toast-seat.test.mjs`: PASS toast-seat: default, Gwart, fight, stage, impossible surface, exit 0.
- `node --check tests/toast-reach-audit.mjs`: exit 0.
- `git diff --check`: exit 0.
