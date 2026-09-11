# v574 advisory report

Work order SHA256 verified: 544c4b4aafbf06a579edadf0b82b13793ef938f1c0842d71778967f8f06bc247.

## Files changed

- app.css: appended Today motion and identity sizing, Pit poster, combined readiness/build surface and daily den styles. Inherited CSS prefix verified byte-identical.
- js/app.js: Remote Den presentation class, existing Build button moved inside readiness card, APP_BUILD v574. Existing values, reward/state branches, figure call contents and handlers retained.
- js/changelog.js, sw.js, version.json: remaining three build stamps advanced to v574, with one player-facing changelog item.
- docs/CLAIMS.md: v574 Changelog item and numbered PROOF/REACH row.
- docs/v574/: this report, reproducible PURE runner, census, direct exit results and per-suite output.

## Exact figure CSS

```css
/* v574: retain the original anchors and horizontal sharing offset. Only the
   ambient vertical excursion changes, from 5px to a negligible 0.001px. */
@keyframes todayStillIdle {
  0%, 100% { transform: translate(var(--bh-shift, 0px), 0); }
  50% { transform: translate(var(--bh-shift, 0px), -0.001px); }
}
.screen--today #bhStage > .hero-char,
.screen--today #bhStage > .hero-companion { animation-name: todayStillIdle; }
.screen--today #bhStage > .hero-companion.pop { animation-name: todayStillIdle, petPop; }
@media (prefers-reduced-motion: reduce) {
  .screen--today #bhStage > .hero-char,
  .screen--today #bhStage > .hero-companion,
  .screen--today #bhStage > .hero-companion.pop {
    animation: none;
    transform: translateX(var(--bh-shift, 0px));
  }
}
/* Still the nested idle shuffle too; the existing reward bounce remains live. */
.screen--today #bhStage:not(.bounce) > .hero-char .bh-anim { animation: none; }
@media (prefers-reduced-motion: reduce) {
  .screen--today #bhStage > .hero-char .bh-anim { animation: none; }
}
```

No top, bottom, left, right, dimensions, margins or figure sizing variables change. The outer animation retains its sharing offset and clock, with vertical excursion reduced from 5px to 0.001px. The inner decorative shuffle stops, except while the existing reward bounce class is active. Pet tap pop remains. Reduced motion disables both layers while preserving horizontal placement. These changes preserve layout anchors; they deliberately change animated visual transforms, so an arbitrary old animation sample need not equal the new visual position.

## Contrast

The header uses a 135-degree gradient from 35% --violet (#9b92e8) mixed in sRGB with 65% --surface (#16151d), to --surface. The brightest endpoint is RGB (68.55, 64.75, 100.05). Against --text (#f2e9d7), the relative-luminance contrast calculation is **7.971313544219353:1**, or **7.97:1**. All channels decrease toward the other endpoint, so this is the gradient minimum. This is a source-color calculation, not a screenshot measurement. The existing Bangers title remains.

## Deviations and limits

The supplied y coordinates imply 423.5 - 161.463 = 262.037px, whereas the stated gap is 261.203px. No re-spacing was attempted to reconcile those numbers. The proposed resolution is to retain the existing anchors and have the independent browser review establish the intended gap measurement. The hero's live y values, dimensions and gap are unproven here.

The request allows greatly reduced idle motion, so the 0.001px outer amplitude uses that option. The nested idle shuffle is removed. All new Pit selectors are scoped to #pitBody. No arena, Wardrobe, Backpack, native submission file or original checkout was edited.

No commit, push, merge or publish was attempted. No browser audits, socket binding or screenshots were attempted by this implementation workflow. Browser locks, readiness coordinates, paperdoll geometry and live portrait diversity remain for independent review. Any failures or denied actions inside the mandated PURE scripts are recorded below and in their full logs.

## Proof

Agreed command: `node tests/unit.test.js`.
Direct process exit: **0**. Final output: **391 passed, 0 failed**.
The final PURE run also executes this command and retains its complete output in `pure/unit.test.js.txt`.

The final verification enumerates the `const PURE` literal and every anchored `PURE.push`/`PURE.unshift` site using the same extraction expressions as tests/r6-guards-audit.mjs. Census: **81 literal entries + 96 additions = 177 suites**. Exact sites and ordered names are in pure-census.json. Each child is executed directly with spawnSync; status comes from the returned process status, never a pipeline. The runner uses a 600-second per-suite timeout and continues to enumerate every result.

Final PURE result: **177 passed, 0 failed, 0 unproven**, runner exit **0**. Every individual exit code is recorded in pure-results.json. The unit output ends with **391 passed, 0 failed**. No further code changes or test runs followed this final tier.

The first complete run had 176 passed and 1 failed, exit 1. claim-evidence-lint rejected the proof label `tests/unit.test.js` because it resolves audit names relative to tests/. Corrected the label to `unit.test.js` and reran all 177 suites. The original failure and first-run exit results are retained. No test assertions were weakened.

Denied or blocked implementation actions: **0**. Browser verification was excluded by the work order and remains unproven, not passed. No commit, push, merge or publication occurred.
