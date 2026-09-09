# Response body validation: advisory review report

Implemented in this checkout only. No commit, push, publish, endpoint, protocol, or Worker change.

Frozen plan SHA256 verified: `a7018879685fafdb321b62632e920b006c7718752aa22b1a24f1ba522e18b079`.
Baseline commit: `6786b4a1251dbf94907f52b3e499f6cf2eb18ed5`.

## Scope discrepancy and deviation

The 27-call census is reproducible for operation-level `signedFetch`/`apiFetch` calls in `js/social.js`, excluding the shared transport wrappers. It is not the total number of network calls throughout the app: analytics, food sources, map tiles and app diagnostics also make requests.

The claim that only 10 of these 27 calls lack validation is not true of this checkout. Ten other seams also lack explicit success-body validation, and several existing checks are partial. The plan does not enumerate its intended ten. This implementation covers the ten unchecked structured data responses marked **Added** below. An expanded sweep of the other unsafe seams was proposed to the user during execution. No approval for that expansion arrived, so it was not implemented. This report does not certify the remaining 17 calls as safe.

## All 27 call sites

Every line reference below is in `js/social.js`. Before lines refer to the baseline commit; final lines refer to the submitted working tree. Friendship has one transport call shared by two exported entry points and two endpoints.

| Call | Endpoint | Before line | Final line | Validation disposition |
| --- | --- | ---: | ---: | --- |
| renameOwed | GET /me | 401 | 460 | Unchanged: renameOf uses truthiness |
| registerKey | POST /register | 440 | 499 | **Added**: nonempty playerId, handle, friendCode; optional nullable name |
| deleteAccount | POST /account/delete | 521 | 580 | Existing explicit body.ok acknowledgement |
| setName | POST /name | 550 | 609 | **Added**: body.ok true and nonempty name before saving or clearing rename requirement |
| friendship | POST /friends/request or /friends/add | 579 | 638 | Unchanged: HTTP success and unchecked body spread |
| acceptFriend | POST /friends/accept | 584 | 643 | Unchanged: HTTP success only |
| removeFriend | POST /friends/remove | 585 | 644 | Unchanged: HTTP success only |
| sendGift | POST /gift | 599 | 658 | Unchanged: HTTP success and unchecked body spread |
| sendCheer | POST /cheer | 615 | 674 | Unchanged: HTTP success and unchecked body spread |
| listFriends | GET /friends | 658 | 717 | **Added**: all three arrays, each player's identity/profile shape, optional truncation flags |
| fetchSpires | GET /spires | 717 | 776 | **Added**: array and ownership, level, clock, siege and defender field types |
| claimSpireRemote | PUT /spires/:id/claim | 729 | 788 | **Added**: acknowledgement, positive level, tookFrom or explicit already outcome |
| fetchStepRace | GET /steps/week | 749 | 808 | **Added**: week, racers, nullable rank, player rows, prizes and nullable champion |
| fetchSettledRace | GET /steps/settled | 847 | 907 | **Added**: week and typed paid podium rows |
| fetchMySpires | GET /spires/mine | 856 | 916 | Existing array check and clock handling; not a full row schema |
| defendSpireRemote | POST /spires/:id/defend | 873 | 933 | **Added**: acknowledgement and positive level |
| tendSpireRemote | POST /spires/:id/tend | 884 | 944 | Existing explicit body.ok acknowledgement |
| leaderboard | GET /leaderboard | 895 | 955 | **Added**: array and typed identity, level, self flag and optional presentation fields |
| syncProfile | PUT /profile | 923 | 984 | Unchanged: bounded array checked only for diagnostics; success still HTTP-only |
| pushBackup | PUT /backup | 974 | 1035 | Existing acknowledgement and conditional version check; partial |
| pullBackup | GET /backup | 1050 | 1111 | Existing blob/decryption/import validation; metadata checks partial |
| hasCloudBackup | GET /backup | 1098 | 1159 | Unchanged: HTTP success only |
| pullGrants | GET /grants | 1300 | 1361 | **Added**: complete grant batch, receipt IDs/keys/types/timestamps, payload types and numeric cursor matching last row |
| recoveryIdAvailable | GET /recovery/available/:id | 1402 | 1468 | Unchanged: available coerced to boolean |
| setRecoveryPhrase | PUT /recovery | 1446 | 1512 | Unchanged: HTTP success only before setting recovery metadata |
| restoreWithPhrase | GET /recovery/:code or /recovery/id/:id | 1510 | 1576 | Existing decrypt/bundle checks; response metadata not schema-validated |
| touchServerDay | GET /health | 1627 | 1693 | Existing numeric time checks downstream; not a strict response schema |

These are type/shape checks at the success seam, not verification of the truth of arbitrary correctly typed values. Optional extensions remain allowed. Nested profile blobs have container and selected presentation-field checks, not an exhaustive schema for every saved game field. Existing non-2xx handling remains in place.

## Failure behavior

The local validator uses the codebase's existing typeof/Array.isArray style and the `db.onWriteFailure` disclosure-sink idiom. Boot connects `social.onResponseFailure` to an eight-second error toast. Copy names the failed action, for example: "Could not check your Crew deliveries. The Crew server sent an incomplete reply. Try again in a bit."

Validation precedes response-derived local writes and returned success data. Registration retains its independent local welcome award before the request. In particular, a malformed grant anywhere in the batch prevents rewards, receipts, seen keys and cursor advancement for the entire batch. Existing array-or-null and boolean/result failure conventions remain available to callers. `pullGrants` reports `{ applied: 0, reason: 'bad-body' }` for schema refusal.

## Red-before and green-after

The same final audit ran against original `social.js` and `app.js` copied from the baseline into a temporary tree, and against the final working tree. The audit uses real client functions, in-memory IndexedDB, JSON serialization/parsing and a mocked transport. It executes the production toast registration in a VM. No network or browser is used.

Each of these ten call sites has four WRONG cases: missing fields, a missing/wrong-typed consumed field, null, and a top-level array. Rejection checks also require unchanged kv, XP receipts and inventory, plus an actual call to the production toast sink. Every site also has a nonempty correct-body CONTROL.

| Call | Before: WRONG cases | Before: CONTROL | After: WRONG cases | After: CONTROL |
| --- | --- | --- | --- | --- |
| registerKey | 4 fail | pass | 4 pass | pass |
| setName | 4 fail | pass | 4 pass | pass |
| listFriends | 4 fail | pass | 4 pass | pass |
| fetchSpires | 4 fail | pass | 4 pass | pass |
| claimSpireRemote | 4 fail | pass | 4 pass | pass |
| fetchStepRace | 4 fail | pass | 4 pass | pass |
| fetchSettledRace | 4 fail | pass | 4 pass | pass |
| defendSpireRemote | 4 fail | pass | 4 pass | pass |
| leaderboard | 4 fail | pass | 4 pass | pass |
| pullGrants | 4 fail | pass | 4 pass | pass |

Additional controls: six empty-list/feed responses and the explicit already-owned claim pass before and after. The late malformed grant payload guard fails before and passes after.

Exact audit summaries:

```text
Before: 17/58 passed; 41 failed
After:  58/58 passed; 0 failed
```

Agreed command, `node tests/unit.test.js`, before and after:

```text
371 passed, 0 failed
```

Full registered PURE tier, final run:

```text
102/102 PURE suites passed; 0 failed
```

The stock release-gate entry point starts a server and browser tiers. To obey the no-sockets rule, the temporary runner evaluates the actual PURE declaration and push/unshift statements, then runs every resulting entry sequentially. A Node preload prohibits socket listen/connect and UDP creation, including inherited Node subprocesses. No socket prohibition fired. No PURE entry was skipped. Raw per-suite output and the runner are retained in `/tmp/fix-bodies-proof/`; the main receipts are `pure-summary.txt`, `pure-list.json`, `unit-before.txt`, `unit-after.txt`, `bodies-before-final.txt` and `bodies-after.txt`.

The initial PURE attempt reported seven failures: three failures caused by stale harness dependencies fixed in this change, and four suites blocked by missing `esprima`. A local existing `esprima` 4.0.1 copy was placed in ignored `node_modules/esprima` without network access. The final full rerun passed. No package manifest or lockfile changed.

## Files changed

- `js/social.js`: ten validators, validation seam and disclosure sink.
- `js/app.js`: production error-toast hookup before boot sync.
- `tests/response-bodies-audit.mjs`: new refusal/control audit.
- `tests/release-gate.mjs`: PURE registration.
- `tests/crew-pet-node-guard.mjs`: execute the real new validation helper and supply the server fixture's required handle.
- `tests/storage-boot-audit.mjs`: register the new boot collaborator in the existing test double.
- `docs/reviews/fix-bodies/report.md`: this advisory report.

Ignored local support files: `node_modules/esprima/**`. Proof artifacts and the disposable baseline tree live under `/tmp/fix-bodies-proof`, outside this checkout.

## Denied, blocked and unrun actions

- The sandbox denied one read-only `ps` process listing. It did not block implementation or proof.
- Missing `esprima` initially blocked four PURE suites; resolved locally as described above.
- Socket, browser, live Worker, device and rendered UI checks: UNRUN, as required. The toast callback was exercised in a Node VM; no claim is made about rendered toast pixels.
- Commit, push and publish: not attempted. No approval denial occurred.
- Scope expansion beyond the ten selected data responses: proposed but not performed. The unchecked seams in the census remain review findings.

This report is advisory. Independent review should assess both the schema choices and the unresolved census discrepancy before accepting the change.
