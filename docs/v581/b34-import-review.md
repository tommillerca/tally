# B34 advisory implementation report

Frozen plan SHA256 verified: `4b52b75cbf0b4231665c26199194d04fcf70040ae1629d03df1d407b205b7937`.

Files changed:
- `js/app.js`: correct retention sentence; opt file replacement into retry; retain confirmation and release the button after refusal; remember database completion before refreshing UI.
- `tests/settings-safety-audit.mjs`: extend the existing production-handler and production-db harness, preserving its transaction-abort and storage-failure coverage. CONTROL prints rendered markup presence, accepted confirmation, and button state. SENTENCE compares the displayed number with the production eviction limit and observed retention. RETRY and ONCE cover throws, quota refusal, abort after staged writes, post-commit refresh failure, overlapping clicks, and clicks after success.
- `tests/unit.test.js`: run the Settings safety audit in the agreed proof command.
- `docs/v581/guard-red.txt`: failing guard output against unmodified local main, identical to starting HEAD.
- `docs/v581/b34-import-review.md`: this advisory report.

Repeat-commit protection: production import and restore use atomic IndexedDB transactions. An abort rolls back staged changes; retry can safely attempt the replacement again. The existing reviewed-state check runs under the transaction write lock. A per-sheet applied flag is set immediately after database success and before fallible UI work, so a retry after refresh failure skips both snapshot creation and database replacement. Busy and finished guards reject overlapping and completed presses. The flag is not a durable operation ledger, and no new ledger is needed for this sheet-local retry of an atomic replacement.

F4 interaction: this checkout already has a verified pre-import snapshot; its ordering and database implementation remain unchanged, with no new F4 work.

Scope interpretation: retry is opt-in for file replacement because the review handler also serves pet actions whose unresolved-operation behavior must remain intact. No CSS change is needed. The red baseline is local main at `26621a9f29dd60e8fdbccb4dfa8b59422029cd1b`; no remote fetch was performed.

Denied or blocked actions: none. No commit, push, publication, original-checkout edit, version bump, or prohibited-file edit was performed.

Validation: `node tests/settings-safety-audit.mjs` reports `settings-safety: 26 passed, 0 failed`. Baseline reports `21 passed, 5 failed`, including SENTENCE and all four RETRY cases. This is a simulated DOM harness, not a browser rendering proof.

Agreed proof: `node tests/unit.test.js` exited 0. Final output: `392 passed, 0 failed`. `git diff --check` passed. No added em dashes were found.
