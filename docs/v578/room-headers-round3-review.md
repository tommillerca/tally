# Round 3 advisory review

Frozen plan SHA256 verified: `91ac83f26271d113f3e818d4650539127d5f73a0c23c6ba74ac0ac784446dc95`.

## Implementation and tradeoff

Appended shared header typography rules to `app.css`. At root 16px the title remains 36px with a 36px line box, retaining the approved default geometry. At root 53px it becomes 59.625px with a 71.55px line box. A container query switches to a compact 1.125rem title when the available width is below 10em. The title never goes below the root/body size, which is stricter than the app's smaller text tokens. Titles retain full-width wrapping and all copy. Four original illustrations, their render transforms (including the inward chef), and dark backgrounds are unchanged.

The tradeoff is a discrete switch to compact title sizing when enlarged text reduces available width in ems, retaining room for the original art. SCALE asserts a 340px height budget at 375x812, reserving over 58% of the viewport outside the header. This is an audit budget, not a CSS clipping cap: arbitrarily longer future copy can grow instead of being hidden. Both rooms also receive the same longer test title, `THE EXPERIMENTAL LABORATORY`, with identical height, text containment, art containment, and minimum font-size checks. Production copy is unchanged.

## Files changed

- `app.css`: append-only shared typography adjustment.
- `tests/room-headers-audit.mjs`: numeric SCALE budget, minimum type check, longer-copy checks for both rooms, and `--prove-red` mode restoring round-2 typography in the browser only. Default HEADER remains 144px (+/- 2).
- `docs/v578/room-headers-round3-audit.txt`: current audit output and exit code.
- `docs/v578/room-headers-round3-prove-red.txt`: renewed prove-red attempt and exit code.
- `docs/v578/room-headers-round3-proof.txt`: full agreed unit proof output and exit code.
- `docs/v578/room-headers-round3-review.md`: advisory report.

## Verification and blocked actions

`node tests/unit.test.js`: 391 passed, 0 failed, exit 0. Full output is recorded in `room-headers-round3-proof.txt`.

Both `node tests/room-headers-audit.mjs` and `node tests/room-headers-audit.mjs --prove-red` exited 97: `listen EPERM: operation not permitted 127.0.0.1`. The three NO-REVERT checks pass; all ten browser rows are UNPROVEN. No rendered height, clipping result, visual preservation, or successful red reproduction is claimed. Independent review must run both commands where a local server and browser are permitted. Prove-red should fail the large-text checks while keeping default checks green.

`node --check tests/room-headers-audit.mjs` and `git diff --check` passed. Byte-prefix comparison confirms all pre-existing `app.css` content is untouched. The Impeccable detector, run on the initial appended CSS, exited 2 with 55 existing-file findings, none in those appended lines. No unrelated design changes were made.

## Deviations

No implementation scope deviation. Required browser confirmation and successful prove-red recording remain blocked by the environment; the recorded attempts are not passing evidence. The 340px bound remains a proposed, unverified layout budget until browser review succeeds.

No commit, push, publish, or edits to an original checkout were attempted. `native/ASC-SUBMISSION.md`, `sw.js`, `version.json`, `APP_BUILD`, `js/changelog.js`, and artwork files are untouched.

The first unit run returned 390 passed, 1 failed: the scaling census rejected the initial mixed pixel/rem type formula. The container-unit formula also failed the targeted token resolver, which requires literal rem tokens or aliases. The final container query uses a literal 1.125rem token and passes `node tests/fontscale-audit.mjs` (exit 0). No census exemption or weakened assertion was introduced.
