Disclosure proposal: three notice families on the shared toast surface, with error semantics added to the existing recovery card. This is the proposal stated before implementation, with the final interruption wording refined to avoid calling a recoverable Pit win a loss or implying that an open food entry never saved.

| Disclosure | Trigger | Exact copy |
| --- | --- | --- |
| Failed save | A rejected player-data write through the database guard. Ambient bookkeeping and ordinary claim refusals remain silent. | Your progress did not save. Open Settings and export a backup before trying again. |
| Failed save, disk full | The same rejection has a quota, IOError, or failed-blob storage error. | Your device is out of storage, so your progress did not save. Free some space, then open Settings and export a backup. |
| Interrupted session, unconfirmed save | Boot finds a surviving origin-storage journal entry for an unresolved player-data write. | Your last session ended before a save was confirmed. Check your saved progress before trying that action again. |
| Interrupted session, failed save | Boot finds a surviving journal entry for a write that failed in the previous session. | Your last session ended after a save failed. Open Settings and export a backup before trying again. |
| Interrupted session, fight | Boot reads a persisted `pitFight` with phase `open`. `{foe}` is the saved name, falling back to `The Pit`. | Your last session ended with a fight against {foe} still open. Open the Pit to review the result. |
| Interrupted session, food entry | Boot reads an `addDraft` with a query or food selection and a timestamp within the preceding 24 hours. | A food entry was open when your last session ended. Check Today before finishing the entry. |
| Confirmed erase | Boot consumes the existing `ERASED_FLAG` left after a successful erase. | Your saved progress and Wardrobe on this device were erased. Restore an account or backup file to recover them. |

The existing known-loss recovery card keeps its copy: "Your saved progress is missing or could not be read. Restore your backup before continuing." Its restore and retry controls remain in place. It now has `role="alert"` and `data-severity="error"`. The fresh-player card does not gain error semantics.

The rows are variants of three event families, not separate popups scattered across screens. Fight and food-entry evidence is combined into one notice. After the R4-12 correction, an unchanged interrupted action is disclosed once across launches using a durable seen marker and an identity preserved by restore; routine sessions, stale drafts, settled fights, quiet bookkeeping and ordinary refusals produce no new error notice. Failed writes retain the existing eight-second throttle, with duplicate active or queued error messages suppressed.

Coverage against the frozen measurements:

| Historical denominator | Implementation reach | Historical cases verified in this run |
| --- | --- | --- |
| 46 toast nodes during Wardrobe/data wipe | Confirmed erase notice and existing known-loss recovery card | 0/46 replayed; coverage count unknown |
| 54 killed sessions | Surviving unresolved-write journal, failed-write journal, open Pit fight and recent food-entry draft | 0/54 replayed; coverage count unknown |
| 108 toast mutations during disk-full destruction | Early write-failure handler and protected error queue | 0/108 original observations replayed; coverage count unknown |

These denominators describe sessions or DOM observations, not enumerated product surfaces. The work order provides no case-to-trigger manifest. The Node guard separately verifies that an injected storage failure stays error-shaped while 108 routine toast calls compete with it. That is synthetic queue evidence, not a replay of the historical disk-full destruction.

Implementation:

- Register the write-failure handler before boot reads or writes. A telemetry exception cannot suppress its notice.
- Journal outstanding player-data writes in `localStorage`, with a separate key for each writer context. Consume older `sessionStorage` evidence on an upgrade reload. Concurrent writes keep the pending marker until the last settles. Rejections remain rejections; ordinary refusals do not become failed-save evidence. Journal values contain only `pending` or `failed`, not saved user data. A later successful write in a different tab cannot clear the failed writer's key.
- Read saved interruption evidence at boot. Use outcome-neutral wording because a pending Pit win may still be recovering and a food write may have committed before its draft was cleared.
- Give error toasts a visible border and `data-severity="error"`. They preempt routine toasts, survive the four-message routine backlog cap, and cannot be hidden by a stale exit-animation callback. The existing live region remains in place.
- Precache the new module. Register the guard in `tests/`, the release gate's PURE list, and the agreed unit runner.

Files changed, all relative to this checkout:

| File | Change |
| --- | --- |
| `js/save-disclosure.js` | New journal and disclosure copy helpers |
| `js/db.js` | Journal player-data writes through the existing guard |
| `js/app.js` | Early failure sink, interruption and erasure notices, priority toast handling, recovery semantics |
| `app.css` | Error-toast border |
| `sw.js` | Precache the new module |
| `tests/silence-disclosure-audit.mjs` | New Node guard with real database failures, shipped notification code and normal-session controls |
| `tests/unit.test.js` | Register the guard and adapt existing erase-copy and toast fixtures while retaining behavioral assertions |
| `tests/device-loss-audit.mjs` | Supply the extracted production sink with the shared copy helper |
| `tests/release-gate.mjs` | Add the new guard to PURE |
| `docs/L6-SILENCE-REPORT.md` | This advisory report |

Historical L6 proof output, before the R4 corrections:

```text
$ node tests/unit.test.js
366 passed, 0 failed
exit 0

$ node tests/silence-disclosure-audit.mjs
PASS CONTROL normal session saves and returns with no error-shaped disclosure
PASS ordinary claim refusals leave no failed-save journal or disclosure
PASS generic write failure still speaks when telemetry throws
PASS write failure is error-shaped, preempts routine traffic and survives 108 routine mutations
PASS failed save remains disclosed on return even if later writes succeed
PASS quiet bookkeeping failures do not announce or recurse
PASS interrupted fight and food entry are disclosed from persisted evidence on any return route
PASS stale drafts and settled fights are normal, not interrupted sessions
PASS confirmed erase is error-shaped and consumed once
PASS queued errors survive routine backlog pressure and normal exit animation callbacks
PASS an interrupted in-flight write discloses uncertainty on return
PASS refused session storage does not prevent the live failure disclosure
12 passed, 0 failed
exit 0

$ node tests/device-loss-audit.mjs
device-loss: 14/14 passed; 0 failed
exit 0

$ node tests/guard-hygiene-lint.mjs
guard-hygiene: clean
exit 0

$ node tests/precache-audit.mjs
6/6 passed
exit 0

$ node --check js/app.js
$ node --check js/db.js
$ node --check js/save-disclosure.js
$ git diff --check
No output; each exited 0.
```

An initial unit run reported 365 passed, 1 failed because the old erase guard required an inline string. Its assertion now checks the shared constant and the boot call; the new guard also executes the erase-notice branch. A new test initially called `db.kvUpdate` instead of the exported `kvUpdate`; that fixture error was corrected. Neither failure remains in the final proofs.

Denied or blocked actions: no actual tool action was denied. No sockets, browser, commit, push or publish were used. Storage-denial behavior was simulated inside the Node guard, not encountered as an environment denial. Source paths were resolved inside this checkout. No original checkout was edited. The supplied plan file's SHA256 matched `d6810d589c4b9f9e798a491dee5f33e245ed53afdb5aac9e2b4d096c7b45d4d1`.

Deviations and unrun proofs: complete coverage of the historical 54 killed sessions is not established. This limitation and the proposed evidence-based scope were disclosed before implementation. Termination after a completed transaction but before another action begins may leave no pending-write marker. Discarding a tab no longer removes the journal. Refused storage or complete origin-data erasure can still prevent or remove it. An unpersisted form or interaction has no reliable interruption evidence. A blank session with no surviving identity or save evidence cannot reliably be distinguished from a first visit without creating false alarms. A generic warning on every return would violate the normal-session control.

Browser rendering, screen-reader announcement, actual disk-full destruction, native process termination, tab restoration, cross-tab behavior and the original 54-session replay were not run under the no-browser/no-sockets rule. The complete release gate was not run because it starts browser/server work. The Node fixtures prove notification behavior and durable-write rejection handling, not physical process termination or all browser IndexedDB behavior. This report is advisory for independent review and does not certify the original denominators as fixed.


R4 correction (2026-09-09): the original per-tab journal could not survive a fresh tab, and the original once-per-tab draft claim was false because restore restamped the timestamp used for deduplication. The R4 guard was red on both: fresh-context journal=null, and N=4 launches produced 4 error notices. The corrected guard observes the failed-save notice in a fresh context and exactly 1 error notice across N=4 launches. New food-entry flows receive their own identity; restoring an older draft preserves its original timestamp as its identity. Repeated error furniture directly taxes the credibility of the entire disclosure surface.

The synchronous localStorage journal is the work order's allowed alternative to IndexedDB. It departs from the preference to share the fight/draft mechanism so that journal writes can precede an asynchronous save and remain independent of a failing IndexedDB transaction. Storage refusal and eviction remain limits. See `docs/R4-SILENCE-REPORT.md` for current red/green evidence and scope; historical physical-device and denominator limitations above still apply.

Finish-checkout verification (2026-09-09): the four R4 source corrections above
were present, but `tests/r4-silence-audit.mjs` and the referenced R4 report were
absent. The reconstructed audit passes its fresh-context journal, failed peer
erase/reload, N=4 launches with exactly one notice, and both account-message
branches. Earlier RED statements above are inherited history, not starting
evidence independently observed in this checkout. See `R4-FINISH-REPORT.md`.
