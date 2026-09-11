# v570 advisory implementation report

Plan SHA256 verified: `01661435ce6c1e9528cb2bbb69f22e5eb42b3c137de62540b287051999300e5a`.
All source edits are relative to this checkout. No commit, push, merge or publish was attempted.

## Files changed

- `js/app.js`: boot recovery, interrupted/forfeit/loss copy, returned-credit spending and display; removes the Today Laboratory insertion, hide handler, Restore setting and kitchen disclaimer; build v570.
- `js/energy.js`: atomic interrupted recovery and persistent returned credits, including spending and refunding those credits.
- `js/save-disclosure.js`: truthful unresolved/interrupted notices without a resume or result promise.
- `js/changelog.js`, `sw.js`, `version.json`: remaining three version stamps and release copy.
- `docs/CLAIMS.md`: v570 changelog item and numbered proof/reach row.
- `tests/interrupted-fight-audit.mjs`: new production reservation/recovery guard with original failure evidence, replay, concurrent recovery, full Vigor, day rollover, retry and loss controls.
- `tests/release-gate.mjs`: registers the guard in PURE.
- `tests/lab-ui-audit.mjs`, `tests/silence-disclosure-audit.mjs`, `tests/unit.test.js`: update expectations for the explicitly requested removals and interruption copy.
- `tests/sync-clientpath-audit.mjs`: binds the real energy module for the new boot dependency.
- `docs/v570/`: raw red/green and unit output, complete PURE census, per-entry output and direct process exit results, and this report.

## Proof

The new guard failed against original production code with exit 1. Its rendered output said: "You left your fight with Rattles before it was decided, so it goes down as a loss." See `red.txt`.

The guard passed after implementation with exit 0. Recovery changes the persisted open record to interrupted and restores one ready fight, exactly once. See `green.txt` and the final PURE guard output for the additional controls.

The agreed command, `node tests/unit.test.js`, returned exit 0: `390 passed, 0 failed`. See `unit.txt`.

Final PURE result: **176 passed, 0 failed**, runner exit 0. This was the last verification run.

The final PURE census evaluates the `const PURE` literal and all line-start `PURE.push`/`PURE.unshift` sites, following `r6-guards-audit.mjs`: 81 literal entries plus 95 additions, 176 total. Each child exit code comes directly from its process exit event, without a shell pipe. `pure-census.json`, `pure-results.json`, `pure-run.txt` and `pure/` contain the evidence. Earlier failed runs are retained separately in `pure-initial-results.json` and `pure-second-results.json`.

## Decisions, deviations and limits

The refund is one persistent fight credit, spent before free fights or Vigor. Legacy records do not identify the payment source, so a source-specific refund cannot be reconstructed reliably. The credit avoids losing compensation at the Vigor cap or midnight. This is the chosen outcome under the plan's refund principle, not a combat resume.

No mid-fight state is resumed. Explicit forfeits and played-out losses remain losses. Open records get distinct copy; boot recovery produces the refunded interrupted outcome.

Legacy records also lack a live owner-tab identity. Recovery cannot distinguish another live tab's fight from a terminated session. Setup failures during the current session require restarting to take the boot recovery path. These limits remain for independent review.

The deleted kitchen disclaimer was the only explicit production statement found that growing/cooking does not log eaten food. Its removal was requested; the underlying diary and Kitchen behavior remains.

The Laboratory route and helpers remain. Its Today insertion is empty, and its hide listener and Settings Restore row/listener are gone. Crew, art, layout styles and `native/ASC-SUBMISSION.md` were not edited.

No browser audit, socket server or screenshot was attempted. The 261.203 Today gap, 374.9 Wardrobe position, figure-site locks and visual ingredient/egg-bar locks are not re-proven here. Those remain with the independent reviewer. No claim is made that source checks prove rendered geometry.

One read-only diagnostic was denied by the sandbox: `ps` returned "operation not permitted". No automatic approval rejection occurred. No other blocked action required a scope change.
