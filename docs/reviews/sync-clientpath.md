# sync-clientpath diagnosis and advisory review report

The production outage is **not explained by the healthy client path reproduced here**. The real boot function reaches lifecycle binding, `autoSync`, a non-null level-10 snapshot and a signed `PUT /profile`. A separate, reproducible throttle defect is fixed: an HTTP-rejected profile or null snapshot used to advance `socialSyncAt`, suppressing the next attempt for five minutes. No evidence here establishes that production players received those failures.

## Scope and provenance

Implemented inside the supplied checkout only. The frozen plan file's SHA256 matched `f3affc4f7ed04aae733339b80a0f5a060e3fc3c72658118e2f8c2dce68c6a92c`. The established production observations in that plan were accepted without repeating production checks.

## Boot-forward evidence

The new Node audit evaluates the complete, unchanged `boot()` and `bindAppLifecycle()` function bodies from this checkout. It uses `tests/mem-idb.mjs`, real database/game/loot/social modules, and real WebCrypto signing. Snapshot and fighter dependencies are populated from the actual named imports in `app.js`. The audit does not inject replacement snapshot, fighter or initialization implementations.

The registered fixture has settings, settled initialization receipts, 5,000 XP and 1,234 steps today. Its identity is generated through real `goOnline()` against an in-process fetch fixture.

| Hop | Observed result |
| --- | --- |
| Boot storage and recovery gates | Healthy store proceeds through real `bootSync` and initialization functions. |
| Lifecycle binding | `lifecycleBound` becomes true; one resume callback is registered. Rebinding does not launch another sync. |
| `autoSync` invocation | Called once at boot and again from the captured resume callback. |
| `isOnline()` | True with a registered identity and API; false without the social row, with zero snapshot builds or requests. |
| Backup before profile | A due encrypted backup is attempted before profile. Both HTTP 200 and 503 allow profile to proceed. |
| Snapshot | Real `socialSnapshot`, `gameInitSettled`, `buildFighter`, week steps and title logic produce level 10 and 1,234 weekly steps. |
| Signing and fetch | `PUT /profile` carries the snapshot and signature headers, then `GET /grants` runs. |
| Resume throttle | Immediate resume after success sends no second profile; a resume with an expired stamp reaches profile again. |

Measured boot trace:

```text
TRACE boot: GET /health -> autoSync -> buildSnapshot -> snapshot 10 -> PUT /profile -> GET /grants
```

## Exact reproduced failure and fix

`syncProfile()` returns `r.ok`. When `/profile` answers 401, 413, 429 or 503, that result is `false`, not an exception. Previously `autoSync()` discarded it, pulled grants and unconditionally wrote `socialSyncAt`. A null snapshot also skipped the profile request but reached the stamp.

The 2026-09-05 comment was correct for thrown snapshot/network errors: those already bypassed the stamp. Its claim that failed attempts never stamp was too broad. The new regression rows failed on all four HTTP statuses and the null snapshot before the production edit, while the healthy boot and thrown-error controls passed:

```text
SYNC CLIENT PATH: 5 failed
exit 1
```

The fix retains the profile result and stamps only when it is accepted. Grants still pull after a rejected profile. No timer, scheduling policy, API contract or UI is changed. Existing silent catches remain.

A recent stamp only blocks attempts inside its five-minute window; skipped calls do not move it. This bug alone cannot explain three days without any request. Persistent HTTP rejection could repeatedly trigger the old behavior, but its production cause is unproven.

## Proof

- `node tests/unit.test.js`: exit 0, `377 passed, 0 failed`.
- `node tests/sync-clientpath-audit.mjs`: exit 0, 10 PASS rows, `SYNC CLIENT PATH: 0 failed`.
- Every one of the 124 final PURE entries exited 0. The first run was 120/124, with four exit-97 dependency refusals. After restoring locked `esprima` 4.0.1 from the local npm cache, all four affected entries exited 0: `store-copy-lint.mjs`, `store-runtime-audit.mjs`, `submission-build-audit.mjs`, and `submission-preflight-audit.mjs`. The cached tarball's SHA512 was verified against `package-lock.json`. The final expanded sync audit was also rerun successfully.
- `node tests/release-gate.mjs --coverage-only`: exit 0; 375 audits, 122 fast, 129 full, 124 in the reported skipped tier (including PURE).
- `git diff --check`: exit 0.

The socket-free PURE runner evaluates the actual declaration block from `const PURE = [` up to `const BROWSER = [`, including every push/unshift, then launches `node tests/<entry>` for each entry in separate processes. It does not import the gate or start its server. Runner and full output are retained under `/tmp/sync-clientpath-pure-runner.mjs`, `/tmp/sync-clientpath-pure/`, `/tmp/sync-clientpath-pure-summary.txt`, `/tmp/sync-clientpath-*.retry.txt`, `/tmp/sync-clientpath-store-copy-retry.txt`, `/tmp/sync-clientpath-unit.txt`, `/tmp/sync-clientpath-red.txt`, and `/tmp/sync-clientpath-green.txt`.

## Limits, deviations and blocked actions

The production outage remains unresolved. The proposed scope deviation is to deliver this proven retry correction without claiming it repairs the outage. The healthy fixture rules out a universal failure in the tested function path, not failures tied to production data, stale bundles, module evaluation, real DOM initialization, native lifecycle delivery, transport or server authorization. UI/OS helpers and scheduling are explicit doubles; this is not a browser or device boot proof. Fetch is an in-process boundary, with no live network request.

The full release-gate runner was not used because it binds a socket. Every PURE entry was instead executed directly, as described above. No socket server, Worker deployment, remote Wrangler, production D1 write, secret change, commit, push, PR or publication was attempted. `native/ASC-SUBMISSION.md` was not touched.

One cleanup command, `pkill`, failed because process listing was unavailable (`Cannot get process list`). The early audit process was then stopped successfully through its existing execution session. There are no outstanding blocked actions. The missing dependency was resolved locally without network access or lockfile changes.

## Files changed

- `js/social.js`: only accepted profiles advance the sync throttle.
- `tests/sync-clientpath-audit.mjs`: boot-forward regression audit and positive controls.
- `tests/release-gate.mjs`: register the new audit in PURE.
- `docs/reviews/sync-clientpath.md`: this advisory diagnosis and evidence report.

Ignored local setup: `node_modules/esprima/`. No original checkout was edited. Another provider should independently review these changes and the stated evidence limits.
