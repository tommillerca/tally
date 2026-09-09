> Historical standalone lane report from `6c17c72b`. The adjacent transcripts describe that earlier run. Integration preserves v528 accepted-only throttling and adapts diagnostics to its import flow. See [the integration report](../sync-integrate.md) for current changes and proof.

**Advisory implementation report**

Implemented in this checkout. The supplied plan file matched SHA256 `5c94f9388314b80cb1ed5f37c0e0df026340c33792c5a451a79a46cdfd300ccf`. Changes are uncommitted and ready for independent review.

Files changed:

| File | Change |
| --- | --- |
| `js/social.js` | Records automatic, debounced and direct profile outcomes, including pre-request failures and grants failures. Preserves existing request bodies, return values and throttling. |
| `js/sync-health.js` | New local recorder, bounded history, persistent failure episode, Settings description and notice callback. |
| `js/db.js` | Keeps diagnostics local: excludes them from exports, ignores imported diagnostics, preserves this device's record during restore, and treats diagnostic writes as quiet. |
| `js/app.js` | Settings Profile sync row, debounced-path instrumentation and delayed non-blocking toast with recovery and opt-out rechecks. |
| `sw.js` | Precaches the new module for offline startup. |
| `tests/sync-observability-audit.mjs` | New Node audit using the real social methods, mem-idb, and extracted production Settings and callback functions. |
| `tests/release-gate.mjs` | Adds the audit to PURE. |
| `tests/storage-boot-audit.mjs` | Extends the existing social stub with the new callback registration. |
| `docs/sync-observability/REPORT.md` | This report. |
| `docs/sync-observability/red.txt`, `green.txt`, `mutation.txt`, `mutation-push.txt`, `unit-first.txt`, `unit.txt` | Proof transcripts. All filenames in this row are under `docs/sync-observability/`. |

Proof:

| Run | Output | Exit |
| --- | --- | --- |
| Initial diagnostic probe, before implementation | `0/14 checks passed`. Every injected case lacked a sync outcome; the transcript lists existing kv keys and request counts. | 1 |
| `node tests/sync-observability-audit.mjs` | `68/68 checks passed` | 0 |
| **`node tests/unit.test.js`**, final run | **`377 passed, 0 failed`** | **0** |
| Unmodified control in an isolated temporary copy | `68/68 checks passed` | 0 |
| Restore original autoSync silent catch and remove finalizer in that copy | Missing-outcome and Settings assertions fail. Later dependent assertions cannot proceed without the missing state. | 1 |
| Restore original pushProfileSoon silent callback in that copy | `56/68 checks passed` | 1 |
| `git diff --check` | No output | 0 |

The first unit run was `376 passed, 1 failed`: the storage boot audit's social stub lacked `onSyncTrouble`. Updating that stub resolved it. An initial temporary-copy mutation harness omitted the data directory and failed module loading. That was corrected before the successful control and meaningful mutation runs above.

Player behavior: Settings shows the latest profile server reply, last accepted profile, attempt time, first failing hop and HTTP status or standard error name. Forty attempts are retained, plus summary timestamps and the last non-throttled outcome. Three failures spanning at least one hour qualify for one 6.5-second toast per uninterrupted failure episode. A successful sync resets the episode. Rapid retries and throttle skips cannot create a warning by themselves. Cloud opt-out suppresses notices and failure wording. The delay and recovery recheck avoid warning about an already recovered connection.

Interpretations, deviations and limits:

- A client cannot prove that a failed fetch reached the server. The implemented evidence distinguishes request initiation from receipt of an HTTP response, and distinguishes a response from acceptance. This is the proposed practical bound on “reached the network.”
- The existing cloud switch controls encrypted backups, while profile sharing continues. That behavior is preserved; the switch additionally suppresses these diagnostics notices. No endpoint, payload or upload policy was changed.
- Custom error names are normalized to `Error`; standard names are retained. Arbitrary names, messages, stacks and player content are excluded from diagnostics.
- Durable recording cannot be guaranteed if storage fails or the process exits before its transaction commits. Recording is dispatched without awaiting persistence in the sync paths. Storage failures produce a local warning and an unavailable-diagnostics Settings message rather than blocking boot.
- Settings markup and the toast callback were exercised in Node. Visual layout, native delivery and the full browser release gate remain unverified because socket binding was prohibited. The new audit is registered in PURE for the independent review.

Denied actions: none. No sockets were bound. No commit, push, PR, publishing, deployment, remote Wrangler, production D1 write or secret operation was attempted. `native/ASC-SUBMISSION.md` and any original checkout were untouched.
