# Sync integration advisory report

Frozen plan SHA256: `c596a4a1966e783cae5ec04d763fddda56d81de369dee36e4c16e30eeed415d5`, verified against the supplied plan file. Base: `5f880815` (v528). Imported lane tips: observability `6c17c72b`, identity `27ad9d7f`, native `a2a15fbb`. Changes are uncommitted and await independent review.

All three intents are preserved. `autoSync` recovers a missing registration using the surviving signing key before proceeding, records one outcome for the attempt, and advances `socialSyncAt` only after an accepted profile and completed grant pull. An HTTP-rejected profile still pulls grants, keeps its rejection hop/status, and remains immediately retryable. Existing thrown-failure behavior is preserved. Public profile recovery remains independent of encrypted-backup opt-out; new installs and erased identities do not register on resume.

Observability retains local history, Settings status, delayed failure notices, direct profile receipts, and the debounced outfit path. v528 extracted `validateImport` from `importAll`, so the incoming diagnostics filter belongs in the actual import path. The replacement preview now applies the same filter. Local diagnostics survive replacement and merge and remain absent from exported saves. The service worker precaches the new module.

The native lane's source investigation and diagnostic audit are retained. Its earlier expectation that a surviving identity cannot sync without `social` was superseded by identity recovery. That assertion now requires registration with the original public key, followed by profile and grant requests. Its signing, resume deduplication, cache selection, and API bypass checks remain. Historical lane reports are explicitly marked as earlier evidence.

Final proof:

| Command or check | Output | Exit |
| --- | --- | --- |
| `node tests/unit.test.js` | `378 passed, 0 failed` | 0 |
| `node /tmp/sync-integrate-pure.mjs /tmp/sync-integrate-pure-final` | `135/135 PURE entries exited 0` | 0 |
| `node tests/release-gate.mjs --coverage-only` | `coverage: 386 audits on disk, 122 fast, 129 full, 135 skipped` | 0 |
| `git diff --check` | No output | 0 |

The temporary PURE runner evaluates the actual array declaration and every `PURE.push`/`PURE.unshift` statement in `tests/release-gate.mjs`, then runs each entry sequentially as a separate Node process in this checkout. All 135 exits are exactly zero, with no skipped or unproven entry. The coverage-only command checks registration; its printed tier summary is not the execution result.

The final observability audit reports `80/80 checks passed`; identity reports `9 passed, 0 failed`; native reports `9 diagnostic checks passed; device behavior remains unverified`. Guard hygiene reports `49 of 367` without a positive control, `ratchet holding`, and `guard-hygiene: clean`.

Current transcripts and receipts:

- [Unit output](/tmp/sync-integrate-unit-final.log)
- [PURE summary](/tmp/sync-integrate-pure-final.log)
- [Every PURE exit code](/tmp/sync-integrate-pure-final/results.json)
- [Exact PURE entry list](/tmp/sync-integrate-pure-final/files.json)
- [Coverage output](/tmp/sync-integrate-coverage.log)
- [Reproducible temporary runner](/tmp/sync-integrate-pure.mjs)

Each individual PURE transcript is `/tmp/sync-integrate-pure-final/<entry>.log`. The first integration sweep was `126/135`, with five integration failures and four missing-dependency results. Those issues were resolved before the complete final sweep.

Every changed or added source and guard:

| File | Change and reason |
| --- | --- |
| `js/social.js` | Compose recovery, attempt/hop recording and v528 accepted-only throttling; add the observed debounced push function and direct-call receipts. |
| `js/sync-health.js` | Import the observability lane's bounded local recorder, status descriptions and sustained-failure notice logic. |
| `js/db.js` | Quiet, device-local diagnostics; export exclusion, incoming filtering at the import boundary, matching replacement preview. |
| `js/app.js` | Import the Settings row, notice callback, and `pushProfileSoon` delegation to `pushProfileUpdate`. |
| `sw.js` | Import the new module's offline precache entry. |
| `tests/crew-outfit-audit.mjs` | Strip all exports in the expanded profile source slice; bind the actual new push function and real diagnostics dependencies; give transport doubles HTTP statuses. Existing real wardrobe-handler and round-trip assertions remain. |
| `tests/crew-pet-node-guard.mjs` | Strip all exports in the expanded profile slice and bind real diagnostics over mem-idb; supply HTTP statuses. Existing sanitizer, friend-profile and rendered pet contracts remain. |
| `tests/sync-clientpath-audit.mjs` | Replace the stale no-registration assertion with recovery/upload assertions and preserve the no-identity negative control separately. |
| `tests/storage-boot-audit.mjs` | Import the lane's `onSyncTrouble` registration double so the actual boot function can execute. |
| `tests/sync-observability-audit.mjs` | Import the lane audit; add measured successful-transport CONTROL rows, accepted-only stamp and rejected/null-profile grant checks, and replacement-preview parity. |
| `tests/sync-identity-audit.mjs` | Import the lane audit; label its existing-account signed-transport CONTROL and exercise recovery, HTTP rejection, grant polling, preserved hop, zero stamp and immediate accepted retry together. |
| `tests/sync-native-audit.mjs` | Import the diagnostic audit; adapt the missing-registration assertion to the integrated recovery contract, retain a verifiable signed-request CONTROL, and assert signing failure is recorded. |
| `tests/unit.test.js` | Import the lane's subprocess regression for the nine identity scenarios before the unit runner drains. |
| `tests/release-gate.mjs` | Register all three new Node audits in PURE. No existing entry was removed. |

`tests/guard-hygiene-lint.mjs` was not edited. Its no-control ceiling remains **49**. The three new audits have measured positive controls; no cap or assertion was weakened to make the gate pass.

Documentation and historical evidence added:

- `docs/sync-integrate.md`: this report.
- `docs/reviews/sync-identity.md`: imported identity report with a historical-evidence banner.
- `docs/reviews/sync-native.md`: imported native investigation and device procedure with a historical-evidence banner.
- `docs/sync-observability/REPORT.md`: imported observability report with a historical-evidence banner.
- `docs/sync-observability/green.txt`
- `docs/sync-observability/mutation-push.txt`
- `docs/sync-observability/mutation.txt`
- `docs/sync-observability/red.txt`
- `docs/sync-observability/unit-first.txt`
- `docs/sync-observability/unit.txt`

The six `.txt` files above are unchanged historical lane transcripts, not final integration proof.

Denied/blocked actions: none remain. The initial PURE sweep reported four entries unproven because this checkout lacked `esprima`. The locked `4.0.1` package was copied into this checkout's ignored `node_modules/esprima` from an existing local installation after checking its version against `package-lock.json`. No package manifest or lockfile changed. No original checkout was edited.

No commit, push, PR, deployment, publication, or edit to `native/ASC-SUBMISSION.md` was performed. All source edits resolve within this checkout. Test transcripts and the temporary PURE runner are outside it under `/tmp`.

Deviations: no intent or scope deviation was required. The plan calls the native lane documentation-only; its actual commit also contains a Node diagnostic audit, which was retained and registered. Updating that audit's obsolete expectation is necessary to preserve identity recovery, not a change to native runtime behavior. No impossible requirement was substituted. Native device behavior, installed binary state and browser pixels remain unverified; those are outside the agreed Node proof.
