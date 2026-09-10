# Device report: advisory review

Frozen plan SHA256: `e9b4cbc976beff6aafd19ee3d5f427c975c4196110999be58b14975ed0cd447f` (verified).
All source paths were resolved in this checkout. No commit, push or publish was performed. `native/ASC-SUBMISSION.md` was not modified. No save or earned-data writes were added.

## Changed files

- `js/device-report.js`: report screen, pure helpers, session observations, keyboard measurement and bounded edge-event observation.
- `js/app.js`: existing diagnostics loop feeds the report, Settings entry uses the existing store gate, lifecycle subscription and build stamp.
- `sw.js`: report module and capabilities manifest cached, build stamp.
- `native/build-www.sh`: copy the authoritative capabilities manifest into bundled web assets.
- `js/changelog.js`, `version.json`: v560 stamps and one changelog item.
- `docs/CLAIMS.md`: one corresponding numbered PROOF and REACH row.
- `tests/device-report-audit.mjs`: four pure guards with executable production-source mutation controls.
- `tests/unit.test.js`: register each pure guard in the agreed proof runner.
- `tests/release-gate.mjs`: register the audit in the actual PURE tier.
- `docs/DEVICE-REPORT-REVIEW.md`: this advisory record.

## Red before green

Command: `node tests/device-report-audit.mjs --prove-red`.
Each mutation imports an in-memory copy of the production module. The exact same guard must raise an AssertionError on the mutation before it runs against the real implementation. Mutation targets and the sample count are asserted, so an empty scan cannot pass. No mutation is written to the checkout.

| Guard | Deliberate bug | Observed RED assertion | Restored production |
| --- | --- | --- | --- |
| known-gap lookup | Always return false | `false !== true` for declared Haptics gap | GREEN |
| three-state classifier | Omit Haptics no-readback branch | actual `registered`, expected `no readback` | GREEN |
| safe-area arithmetic | Ignore the bottom inset | actual clearance `44`, expected `10` | GREEN |
| plain-text serialization | Serialize only the first row | actual only Safe area, expected all four fixture rows | GREEN |

Output summary: `Device report: 4 passed, 0 failed`.

## Runtime review still required

No browser was launched, no socket was bound and no screenshot was taken. The following are not established by the pure guards:

- Non-store Settings entry, absence in store UI, table layout and clipboard delivery on the target device.
- Safe-area computed pixels, actual dock geometry and the three viewport measurements.
- Actual plugin registration and permission/status readbacks, including missing Haptics and manifest delivery in the native bundle.
- Served service-worker build on the target device. Bundled native builds historically omit `sw.js`; the inherited comparison can therefore report `sw ?` or `sw unreachable` and must not imply agreement.
- App pause/resume counts and last-transition timestamp from the native bridge.
- Keyboard appearance, settling and focused-field geometry on the phone.
- Left-edge touch delivery and resulting history/hash navigation. Native gestures may be consumed before JavaScript sees them. Navigation alone is explicitly not attributed to a swipe. The result survives closing and reopening the report within the session.

Ring/silent switch, Low Power Mode, VoiceOver order quality and the subjective purchase experience are intentionally marked `needs a person` with reasons. They were not probed.

## Deviations and limits

- The plan names a PURE list in `tests/unit.test.js`; that checkout has no such list. The new audit exports a PURE guard list, each guard is registered in the unit runner, and the audit is also registered in the actual PURE tier in `tests/release-gate.mjs`.
- The legacy one-line diagnostics output remains compatible. The table classifies those observations into explicit states. Its build row excludes legacy plugin `ok` strings. Malformed vault responses are no readback in the new table, rather than inferred empty vaults.
- Readback calls have a 2.5-second bound so a silent bridge or fetch cannot indefinitely prevent later probes. The served-SW URL, no-store policy, version extraction and build values remain the existing comparison.
- Dock clearance reports the dock surface's bottom, the safe bottom and their signed difference. The dock surface includes safe-area padding, so a negative number is not presented as a claim that its controls overlap the home indicator.
- A sandbox denied `ps` used to inspect test progress. No permission escalation was attempted. Browser/simulator checks were left for the independent reviewer as required by the plan.

## Proof results

- `node tests/unit.test.js`: `389 passed, 0 failed` on the final implementation.
- `node tests/device-report-audit.mjs --prove-red`: all four targeted mutations failed their assertions before production passed; `Device report: 4 passed, 0 failed`.
- `node tests/version-align-lint.mjs`: web builds aligned at v560, native provenance checked. Newest changelog item is n560.
- `node tests/store-copy-lint.mjs`: beta surfaces unreachable and store strings clean. This is static proof, not rendered store visibility.
- `node tests/fontscale-audit.mjs`: passed after replacing the probe field's fixed font size with `var(--fs-body)`.
- `node --check js/app.js`, `node --check js/device-report.js`, `git diff --check`: passed.
- Initial unit and npm attempts each reported `388 passed, 1 failed`: the new fixed `16px` input violated the type-scale floor (`981/982`). The scalable token fixed that failure. The final unit result above supersedes it.
- Final `npm test`: exit 0. Unit output `389 passed, 0 failed`; combat output `100 passed, 0 failed` (average 6.0 turns, maximum 8, 100% decisive; high-effort won 100/100).
