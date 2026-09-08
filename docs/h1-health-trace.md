# h1 health sync trace

Recorded before implementation on 2026-09-08. All paths are relative to this checkout.
Frozen plan SHA256: `5f73832612d4ebd48549806515aa92f3335514d82846f92f07ef6dd6e3610943` (verified).

1. `js/app.js:bindAppLifecycle` calls `nativeAutoSync` at startup and through `onAppResume`. `js/native.js:onAppResume` bridges native foreground events and web visibility events, deduplicated within 500 ms.
2. `nativeAutoSync` requires a native shell and the saved `hkNative` flag. This is a connection preference, not a live authorization check. It retries the existing `nativeRequestAuth` while `hkScopesV < 2`, then throttles queries to ten minutes using the in-memory `lastNativeSync`.
3. The existing Connect/Reconnect flow calls `nativeHealthAvailable`, then `nativeRequestAuth`. The adapter calls `Health.isAvailable` and `Health.requestAuth`. `native/ios/App/App/HealthPlugin.swift:requestAuth` checks HealthKit availability and calls `store.requestAuthorization`. Its comment explicitly says the read-only grant reports sheet completion, not whether reads were allowed. The JavaScript connect handler nevertheless saves connected flags and announces success even if the subsequent sync fails. Its denial copy currently sends the player to iOS Settings.
4. `nativeSyncNow` calls `js/native.js:nativeQueryToday`, which directly calls `Health.queryToday`. The Swift step statistics callback discards its error parameter and maps a missing sum to zero. The returned payload always contains numeric steps and active calories. The boundary therefore erases the distinction between readable steps, no samples and a query error. Revoked read access cannot be inferred from the returned zero.
5. `nativeSyncNow` returns false for a missing result or missing steps plus calories, and catches all exceptions to return false. Automatic callers only refresh on success. No failed-attempt record or in-app failure disclosure is written. Manual callers can say nothing is available; Connect always announces success.
6. `ingestHealth` stores the health row and, for ANY non-null steps (including the fabricated zero), writes `hkLastSync = Date.now()` and clears `hkStaleNotified`. It then feeds the game and pet level checks. A last-success timestamp DOES exist, but its input can falsely certify success. Shortcut URL and clipboard imports also enter this function. The clipboard path rejects a duplicate reading reused on a later day.
7. `hkStaleInfo` requires `hkConnected`, uses a 36-hour threshold, and seeds a missing timestamp from the end of the latest health row's date. That is a data date, not an observed sync time. Connected players with neither timestamp nor step rows are ignored forever.
8. Today calls `hkStaleInfo`, writes `hkStaleNotified`, then attempts an OS notification. The notification can be unavailable while the flag remains set. A persistent Today banner retries native sync, then routes to the app's Settings page. The egg view also uses `hkStaleInfo`. None of this can fire when fabricated zero results keep resetting the timestamp.
9. v518 `js/save-disclosure.js` builds copy from observed evidence, returns empty copy for the healthy control, and consumes/deduplicates evidence. `js/app.js` sends that copy through the existing error toast, including interrupted fights and drafts. This supplies an in-app disclosure path independent of OS notifications.

## Device verification boundary

UNRUN: sockets, browser, device, native build and live HealthKit behavior, as required by the plan. Source inspection establishes the discarded error and fabricated-zero paths. Node cannot verify what `HKStatisticsQuery` actually returns after read permission is revoked, nor whether the existing authorization request can restore that access. On a permitted device run, compare callback error, sum presence and bridge payload for allowed reads, a genuinely empty day, revoked step access and a query failure; then inspect the persisted sync evidence and the visible one-shot notice across resume and relaunch.

Exact revocation detection is BLOCKED at that native callback: this bridge has no reliable read-permission signal. Any implementation must report failed queries or absence of step data without claiming permission was revoked or that the player walked. A legitimate empty day must not be described as a confirmed disconnect.

## Implementation decision after the trace

- Preserve `hkLastSync`, but only advance it for an ingested step quantity. The Swift bridge now reports `stepsRead` as `ok`, `empty` or `failed`, and omits steps on empty/error reads. JavaScript preserves an existing day's steps when there is no valid replacement. An explicit readable zero is healthy. Older bridge zero results are treated as ambiguous, since the old contract cannot prove their origin. Positive legacy quantities still sync normally. Android's existing payload `error` is also honored at the shared JavaScript boundary.
- Persist `hkSyncIssue` with an observation start and first failed-attempt time. A failed attempt discloses immediately. Empty reads disclose only after the existing 36-hour threshold. A connected install with no timestamp starts a 36-hour observation period instead of fabricating a success from a historical row. A successful step ingest clears the issue and the existing `hkStaleNotified` episode latch.
- Add evidence/copy helpers to v518's `js/save-disclosure.js`. Use its existing error-toast channel, once per unresolved episode across relaunches, instead of the OS notification. Retain the inline Today card as a retry entry point. A healthy sync produces no health warning. Failure handling runs on native sync completion even when Today is not open; Today also checks elapsed gaps.
- The existing card retries sync and opens the existing Health guide on failure. No new permission request flow was added. The existing Connect handler no longer announces success when step sync failed or directs a denied connection to iOS Settings.
- Register `tests/health-disclosure-audit.mjs` in PURE and invoke it from the agreed unit proof. It executes the actual JavaScript sync, ingest and disclosure functions with the existing memory IndexedDB fixture. Swift callback wiring is inspected statically, not executed.

## Deviation and limits

Confirmed revocation detection is impossible from the available read contract. The proposed and implemented deviation is an evidence-based failed-sync/no-step-data disclosure, not a claim that authorization was revoked. A healthy but completely empty HealthKit day can eventually receive the qualified no-data notice; an actual readable zero quantity receives none. Recovery means a successful step read and ingest, not completion of the authorization sheet. The native status field requires a future native build to reach installed devices; no build or publication was performed here. Existing fabricated timestamps cannot reveal an earlier disconnect retroactively.

The persistent inline retry card is not a repeated launch toast. `hkStaleNotified` suppresses further automatic toasts until a successful step sync begins a new episode. No browser/device visual verification or real permission recovery is claimed.

## Advisory implementation report

Files changed:

| File | Change |
| --- | --- |
| `js/app.js` | Persist failed/empty read evidence, disclose once through the existing toast, retain actionable Today card, report connection outcomes honestly. |
| `js/save-disclosure.js` | Step-result classification, elapsed-gap evaluation and evidence-based disclosure copy. |
| `js/db.js` | Classify the new health diagnostic key with the existing quiet health metadata. |
| `native/ios/App/App/HealthPlugin.swift` | Preserve step-query success, empty and failure status; do not fabricate a step quantity. |
| `tests/health-disclosure-audit.mjs` | Eight Node cases covering production sync, persistence, disclosure, positive controls and static native/UI wiring. |
| `tests/release-gate.mjs` | Register the health guard in PURE. |
| `tests/unit.test.js` | Run the health guard in the agreed proof. |
| `docs/h1-health-trace.md` | Pre-implementation trace, decision, limits and this advisory report. |

Agreed proof: `node tests/unit.test.js`, exit 0. Output:

```text
370 passed, 0 failed
```

Focused proof: `node tests/health-disclosure-audit.mjs`, exit 0. Output:

```text
PASS CONTROL healthy step sync produces NONE, including a readable zero
PASS failed bridge query discloses once across relaunch and preserves last success
PASS stale sync discloses at 36 hours, fresh timestamp is a positive CONTROL
PASS native error/empty results cannot overwrite steps or certify success
PASS missing timestamp observes a grace period without inventing historical success
PASS recovery clears failure and re-arms only a later episode
PASS CONTROL never-connected player gets no health disclosure
PASS production UI and Swift bridge retain actionable evidence plumbing
8 passed, 0 failed
```

`node --check js/app.js`, `node --check js/save-disclosure.js` and `git diff --check` passed with no output. Initial focused-test failures were a fixture clock mismatch and an overbroad source assertion; both were corrected before the agreed proof.

Denied tool actions: none. Blocked verification: exact revoked-read behavior and recovery at the Swift HealthKit callback described above. Unrun: sockets, browser, device, native build and the full release gate (which starts a server/browser). No commit, push or publish was attempted. No original checkout was edited. This report is advisory for independent review.
