# Advisory implementation report

Work order SHA256 verified: `463db1aa2741691ac3adbacafef536af87ed2bbe566357bb60f94aae9ada97e4`.

Implemented in this checkout only. No application renderer or forbidden file was changed. No browser, localhost listener, commit, push or publication was attempted. This report is advisory and does not replace the independent provider's review.

## Files changed

| File | Change |
| --- | --- |
| `tests/lib/crew-capture.mjs` | Guarded demo fixtures, operator surface functions, DOM geometry/raster-alpha/occlusion measurements. |
| `tests/lib/crew-geometry-guards.mjs` | Three rendered-geometry predicates, with approved baselines required for plate/pet comparisons. |
| `tests/lib/crew-browser-runner.mjs` | Connect-only operator runner, per-member/per-row measurement, DOM mutation controls and external output paths. |
| `tests/crew-bars-browser-audit.mjs` | BROWSER entry for plate/card fractions. |
| `tests/crew-pets-browser-audit.mjs` | BROWSER entry for pet bounds and plate encroachment. |
| `tests/crew-icons-browser-audit.mjs` | BROWSER entry for all five ranked rows, fresh and stale scenarios, size/opacity/ink/clipping/covers. |
| `tests/crew-capture-node-audit.mjs` | PURE proof of the guarded fixture callback and shipped data-consuming renderers. |
| `tests/release-gate.mjs` | Registers the Node routing proof in PURE and all three geometry guards in BROWSER. |
| `tests/guard-hygiene-lint.mjs` | Explicitly documents why the new hook-routing audit is hook-only. Existing checks and other exceptions are unchanged. |
| `docs/crew-capture/README.md` | Operator instructions, measurement definitions, browser requirements and limitations. |
| `docs/crew-capture/BISECT.md` | Ordered candidates, all nine available build diffs with locations, and unavailable-v539 disclosure. |
| `docs/crew-capture/run-pure.mjs` | Complete gate-derived PURE runner, minimum 152 entries, no browser/listener. |
| `docs/crew-capture/node-output.txt` | Recorded Node proof output. |
| `docs/crew-capture/unit-output.txt` | Recorded agreed unit proof output. |
| `docs/crew-capture/proof/pure-enumeration.json` | All 155 PURE entries enumerated from the gate. |
| `docs/crew-capture/proof/pure-results.json` | Exit code, signal and spawn error for every PURE audit. |
| `docs/crew-capture/proof/pure-output.txt` | Complete final PURE runner summary and location of full per-audit streams. |
| `docs/crew-capture/REPORT.md` | This advisory report. |

## Proof

Agreed command: `node tests/unit.test.js`.

```text
382 passed, 0 failed
```

Harness routing command: `node tests/crew-capture-node-audit.mjs`.

```text
CREW CAPTURE NODE: 13 passed; browser geometry UNPROVEN
```

Complete PURE command: `node docs/crew-capture/run-pure.mjs`.

```text
Enumerated 155 PURE audits from tests/release-gate.mjs
155/155 PURE audits exit 0
```

The initial PURE run was 154/155. `guard-hygiene-lint.mjs` identified unguarded browser output paths and the new hook-only Node audit. Browser output now passes `auditOutputPath` and defaults outside the checkout. The hook exception explains the frozen order's requirement to prove those hooks; it does not classify any geometry assertion as PURE. A complete second run passed all 155 audits. The initial logs remain in `/tmp/crew-capture-first-proof`.

Each of the three browser entry scripts was invoked without operator configuration. Each printed `UNPROVEN: operator browser run required` and returned exit 97 before importing Puppeteer or attempting a connection. This verifies their no-configuration refusal only, not any browser assertion. `git diff --check` passed.

## Findings and remaining proof

The shipped browser data path uses `window.__testMe`, `__testFriends`, `__testLb` and `__testRace`, gated by webdriver. `renderFriends` owns its `data` closure. Setting `window.data.friends` cannot fill it. `openLeaderboard()` is the level leaderboard; `hydrateRace()` paints the separate step leaderboard.

With the same installed fixture callback used by Puppeteer, Node DOM doubles execute the shipped identity branch, `paint`, `paintFan`, `fetchLb`, `openLeaderboard` and `hydrateRace`. They produce seven member-card templates, five level rows, and five ranked step rows including the player's rank-3 row, with zero social fallback calls. Removing the hook and disabling webdriver are failing controls. Fresh data produces five `.run` markers; one stale racer, all stale racers, and unknown timestamps each produce zero. That is source/data-path evidence, not rendered-pixel evidence.

Browser navigation, event bubbling, fan seating, real fonts/images, computed geometry, overlap probes, screenshot appearance and the guards' browser mutation controls remain UNPROVEN until the operator runs them. All three geometry guards are BROWSER-only. Bar and pet guards need operator-approved geometry; the icon guard's stale cases are expected to expose the existing suppression without changing it. Native iOS Dynamic Type, viewport/pinch effects and the hedged pet appearance require the operator's device evidence. No root cause is declared proven from screenshots.

## Denied or blocked actions

No sandbox or automatic approval denial occurred. No prohibited action was attempted. Browser work is assigned to the operator by the work order and was not retried or reported as a localhost blocker. The explicit browser-runner exit-97 refusals are recorded above.

## Deviations and proposed treatment

1. **Missing v539:** the order calls v530 to v539 nine builds, but that inclusive range is ten. Only nine release commits, v530 to v538, exist in the available history. HEAD and `version.json` still identify the shipped runtime as v538. The bisect list covers all nine available diffs and leaves v539 unavailable. Proposed treatment: obtain the exact v539 commit before testing it.
2. **No approved numeric geometry:** the order provides no known-good capture or numeric acceptance boundary. The bar/pet guards therefore require an explicitly approved baseline, using a documented two-CSS-pixel comparison tolerance. They cannot certify current geometry from guessed constants. Proposed treatment: have the operator approve matching device/text-size baseline measurements before running those two guards.
3. **Measurement scope:** pet fractions describe the rendered pet wrapper, not a normalized animation silhouette. Icon checks combine layout, sampled/intersection hit tests and raster alpha; they are not a full screenshot compositor. Complex masks/pseudo-elements and pet-art appearance still require screenshot review. These limits are exposed in the runbook rather than presented as proven pixels.

Production behavior and every excluded source/assets path remain untouched.
