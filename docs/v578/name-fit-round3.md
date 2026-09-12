# Round 3 advisory report

Frozen plan SHA256 matched f7cc51cc86a4ed9859c4af2a53cf0056a3db9b6468cb8c04b1eb7ba3d12e7566.

Implementation is partial. Browser acceptance remains blocked.

## Files changed

- `tests/name-fit-audit.mjs`: preserve horizontal overflow failure, allow vertical overflow only for wrapping text with no clipping, and distinguish hidden ancestor viewport bounds from reachable scroll extents on each axis. `overflow: clip` remains clipping. Retain clipping diagnostics and predicate details, adding computed white-space and wrapping eligibility.
- `app.css`: append flex wrapping for cheer rows, an 8rem preferred basis for sender text, and wrapping for the bounded Cheer back button. This lets the button take another line before consuming the sender's width. Existing `.hub-name` and `.hero-name` rules are untouched.
- `docs/v578/guard-red.txt`: append both requested audit commands, complete output, and exit codes.
- `docs/v578/name-fit-round3-unit.txt`: agreed unit proof output.
- `docs/v578/name-fit-round3.md`: this advisory report.

## Fixture scope decisions

The audit header permanently excludes these sites from the pending set and gate:

| Site | Decision and basis |
| --- | --- |
| `.fight-over .note` | Outside fixture. Plan identifies unreachable repeat-result state. |
| `#raceCard .race-lane .nm b` | Outside fixture. Plan identifies unreachable active-race lanes. |
| `.vs-name.foe` | Outside fixture. Plan identifies unreachable transient introduction. |
| `.vs-venue` | Outside fixture. Shares that transient introduction phase. This scope choice is inferred from the shared phase. |

Every other site retains mandatory CONTROL coverage. Unexpected missing controls still exit 97. The plan's unnamed "others" could not be identified without a working browser. Fault 3 is therefore not claimed fully resolved.

## Blockers and deviations

Local `node tests/name-fit-audit.mjs` exits 97: `listen EPERM: operation not permitted 127.0.0.1`.

Live `node tests/name-fit-audit.mjs https://tommillerca.github.io/tally/` exits 97: `Failed to launch the browser process: Code: null`.

Both runs measured zero rows. The live failure is environmental, not a successful red guard. No live `.hub-name` 293/227 measurement was obtained. Full evidence is appended to `guard-red.txt`.

One supplied genuine squeeze site, `.cheer-tx b`, was addressed from the plan's measurements and the fixed-width sibling button in source. The remaining site count is unknown, not zero. The CSS change is not browser verified. Proposed deviation: independently run both browser commands where listener creation and Chromium launch work, identify any additional genuine squeezes and unreachable sites, then finish acceptance there. No alternate measurements or successful acceptance are claimed.

No commit, push, publication, original-checkout edits, approval escalation, or sandbox bypass was attempted. No changes to `native/ASC-SUBMISSION.md`, `sw.js`, `version.json`, `APP_BUILD`, or `js/changelog.js`.

## Proof

`node tests/unit.test.js`: `391 passed, 0 failed`. Full output is in `name-fit-round3-unit.txt`.

`node --check tests/name-fit-audit.mjs` and `git diff --check`: exit 0.
