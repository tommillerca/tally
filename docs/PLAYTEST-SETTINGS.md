**Settings playtest. Advisory findings for independent review.**

Work order: `06-settings.md`, SHA256 `7f8f3e7ea67ecf58ec1217c8c8b2a274f81020e007a3b246ba19a69cabd23800`, verified before work. Base commit: `0412b237706e77e47b9f9f9e9d625014c76dfe31`. All source paths below are relative to this checkout. Source line references describe the final tree unless explicitly marked original.

The new audit runs real Settings event-handler bodies and render expressions extracted from `js/app.js`. Storage operations use production `js/db.js` over `tests/mem-idb.mjs`. The uncertain-delete case runs production `social.deleteAccount()` and signing against a transport double that rejects after receiving the request. No request reaches a server. Transaction failure injection aborts the real erase transaction after its clears are scheduled. DOM doubles capture handlers, text, download requests and reload requests. They do not prove browser behavior or native plugin behavior.

**1. Importing an older file silently removes newer earnings. Unfixed, highest harm.**

Reproduction: run `node tests/settings-safety-audit.mjs --observe-replacement`. The optional observation creates a save containing settings and 100 coins, exports it through `exportAll()`, earns another 25 coins through `kvBump()`, adds one earned crate to inventory, then passes the older JSON file to production `importBackupFromFile()`. It also executes the real import-summary function.

Observed on both original and final code:

```text
OBSERVED file replacement: {"before":{"coins":125,"inventory":1},"after":{"coins":100,"inventory":0},"messages":["Backup restored"]}
```

Source: `js/app.js:22062` and `js/app.js:22066` (original lines 22043 and 22047), `js/db.js:1444`, `js/db.js:1683`. Settings' Import control at `js/app.js:14976` says only to restore from an export. The file handler gives no replacement confirmation and preserves no pre-import snapshot. `importAll()` defaults to replacement and clears declared stores in its transaction.

Impact: newer coins and inventory disappear from the local save. This path supplies no undo copy. A separate export or existing cloud snapshot might still contain them, but their existence is not guaranteed. Certainty: high for local loss and absence of a recovery copy in this path; no claim that every external recovery source has been destroyed.

Reason left unfixed: replacement is an explicit database policy, also used by deliberate account recovery. Switching the UI to merge without fully resolving identity, currency-history and Laboratory conflicts would silently redesign it. Proposed follow-up: durably preserve the complete current save before replacement, refuse replacement if preservation fails, provide a recoverable snapshot, and disclose the rollback before applying it. A confirmation alone does not satisfy the work order's rule that earned progress is never permanently lost. This proposal is not implemented or treated as approved.

**2. Erase and Delete account become stuck after a local transaction abort. Fixed within the open sheet.**

Reproduction: seed 125 coins; execute the actual Erase or Delete account opening handler; type the required confirmation; abort the IndexedDB transaction after production `eraseAll()` schedules its clears. For Delete, return one successful cloud deletion first. Retry after disabling the abort injection.

Original result: both click promises reject with `erase aborted`. The buttons remain disabled with `Erasing...` or `Deleting...`; neither callback reports the local failure. In the Delete case the cloud step has already succeeded. Source: `js/app.js:15349` and `js/app.js:15396`; storage transaction at `js/db.js:1780`.

Impact: the player cannot retry within the sheet and receives no explanation of partial deletion. Certainty: high for the handler state and local transaction behavior. Real server deletion and native vault removal are not exercised.

Fix: catch failures, restore the buttons and explain the outcome. Delete retains the successful cloud result in the open sheet, so retry performs local cleanup without sending another account-deletion request. The audit verifies that all 125 coins survive the aborted transaction, no reload occurs, retry clears every store, and exactly one server-deletion call is made across the two taps.

Limits: the successful-cloud flag belongs to this sheet and does not survive closing it or restarting the app. Durable recovery of a partially completed account deletion remains outside this fix. Native vault errors remain governed by the existing best-effort `forgetIdentity()` behavior. Multi-tab freeze/reload behavior was not exercised by this audit.

**3. Export failures have no player-facing result. Fixed.**

Reproduction: seed 125 coins with damaged `coinsHistory`, then invoke the actual web Export handler. Production `exportAll()` refuses the inconsistent snapshot. This is an error-path fixture, not evidence that normal gameplay creates damaged history.

Original result: the click promise rejects with `Cannot export coins: currency history does not match the balance.` No download is requested and no failure toast is shown. Source: `js/app.js:15290`, production snapshot validation at `js/db.js:1285`.

Impact: Export appears to do nothing when snapshot creation fails. Certainty: high. Fix: catch export failures and tell the player to retry and check for a downloaded file. The audit verifies failure disclosure, no download request, and no successful-export timestamp. The healthy control still exports every store, including the seeded coins and crate, and records the attempt.

Limits: this does not repair damaged history, and a browser download request cannot prove that the player actually saved the file. Browser download completion and cancellation were not observable here.

**4. Backup and recovery messages promise mutually incompatible outcomes. Fixed.**

Reproductions and original observations:

| State and action | Original visible result | Final source |
| --- | --- | --- |
| Native shell, `cloudOff=true`, tap Export | “Your progress is auto-saved to the cloud” despite no backup check | `js/app.js:15293` |
| Cloud copy exists, no recovery phrase/ID, evaluate the Settings recovery explanation | “Reinstalling THIS device brings it back automatically” without checking vault availability or identity | `js/app.js:14901` |
| Account exists, no recovery phrase, render the Recovery code row | “Delete the app and this account is gone for good,” even though the adjacent explanation promises automatic recovery | `js/app.js:14967` |
| Cloud backup off, render the explanatory paragraph | “Your whole save backs up automatically” | `js/app.js:14961` |

Impact: these messages can lead players to rely on an unverified backup or misjudge whether an account can be recovered. Certainty: high for the contradictory rendered text and missing state checks; no real uninstall or device-vault restoration was attempted.

Fix: native Export identifies the web-only file capability and directs the player to backup status. Automatic backup copy is conditional on backup being on. Missing recovery-code copy asks the player to set one for another device, without promising same-device restoration or declaring inevitable permanent loss.

**5. An uncertain deletion response is described as proof that nothing was deleted. Fixed copy; server uncertainty remains.**

Reproduction: seed a local account with an ECDSA identity and 125 coins. Type DELETE and execute the handler using real `social.deleteAccount()`. The fetch double receives the signed POST to `/account/delete`, then rejects to model a lost response. Production `deleteAccount()` returns `{ok:false}`.

Original result: “Could not reach the server. Nothing was deleted.” Source: `js/app.js:15404` (original line 15393), `js/social.js:578`.

Impact: a request may have reached the server even when its response is lost. The old message presents an unknown cloud outcome as a confirmed non-deletion. Certainty: high for this information-loss path. The fixture does not assert that a real server actually deleted anything.

Fix: say that account deletion could not be confirmed and that the local save is unchanged. The audit verifies one actual signed transport attempt, unchanged local earnings, an enabled retry button and no reload. Exactly-once server deletion and reconciliation after an ambiguous response were not redesigned.

**Red and green evidence.**

The first audit run preceded production changes and exited 1. The final expanded audit was also run against the original `HEAD:js/app.js` in a disposable directory under `/private/tmp`, with production database modules unchanged. It exited 1 with `settings-safety: 3 passed, 8 failed`. The original checkout was never edited for this comparison. All three healthy controls passed on the original code.

| Runnable audit row | Original result | Final result |
| --- | --- | --- |
| EXPORT native does not promise an unverified cloud save | FAIL: unexpected `auto-saved` promise | PASS |
| EXPORT failed storage read reports failure without recording success | FAIL: unwanted rejection, `Cannot export coins: currency history does not match the balance.` | PASS |
| SETTINGS recovery copy does not contradict a surviving vault | FAIL: unexpected `brings it back automatically` | PASS |
| SETTINGS missing phrase does not declare the account permanently lost | FAIL: unexpected `gone for good` | PASS |
| SETTINGS cloud-off explanation is conditional | FAIL: unconditional `Your whole save backs up automatically` | PASS |
| ERASE aborted transaction retains earnings and offers retry | FAIL: unwanted rejection, `erase aborted` | PASS |
| DELETE uncertain server result does not claim nothing was deleted | FAIL: unexpected `Nothing was deleted` | PASS |
| DELETE local abort retries cleanup without deleting the account again | FAIL: unwanted rejection, `erase aborted` | PASS |

Final output from `node tests/settings-safety-audit.mjs --observe-replacement`:

```text
PASS EXPORT native does not promise an unverified cloud save
PASS EXPORT failed storage read reports failure without recording success
PASS CONTROL web Export contains every store and records a completed attempt
PASS SETTINGS recovery copy does not contradict a surviving vault
PASS SETTINGS missing phrase does not declare the account permanently lost
PASS SETTINGS cloud-off explanation is conditional
PASS ERASE aborted transaction retains earnings and offers retry
PASS DELETE uncertain server result does not claim nothing was deleted
PASS DELETE local abort retries cleanup without deleting the account again
PASS CONTROL unconfirmed danger actions preserve the save
PASS CONTROL file import refuses malformed JSON and damaged stores without losing earnings
OBSERVED file replacement: {"before":{"coins":125,"inventory":1},"after":{"coins":100,"inventory":0},"messages":["Backup restored"]}
settings-safety: 11 passed, 0 failed
```

The optional loss observation is diagnostic output, not a passing assertion that rollback is desirable. The default PURE audit does not run that observation.

**Other exercised behavior and proof.**

Healthy controls exercised complete file export, refusal of malformed JSON and damaged store shapes without losing earnings, typed confirmation checks that reject unconfirmed destructive actions, and successful cleanup after a transaction abort. Existing PURE backup, restore, recovery and multidevice audits also exited 0. This supports those tested cases, not a claim that all account or Settings behavior is healthy.

Agreed command, exit 0:

```text
$ node tests/unit.test.js
377 passed, 0 failed
```

Every entry in the final PURE list of `tests/release-gate.mjs` was executed directly as a Node child process. All 116 entries ultimately exited 0. The first pass had 112 passes and four dependency refusals, each exit 97: `store-copy-lint.mjs`, `store-runtime-audit.mjs`, `submission-build-audit.mjs`, and `submission-preflight-audit.mjs`. All reported missing `esprima`. An existing local 4.0.1 archive was verified against the SHA512 integrity in `package-lock.json`, then unpacked into this checkout's ignored `node_modules/esprima`. All four reruns exited 0. The final Settings audit and hygiene lint were rerun after audit expansion and also exited 0. `node --check js/app.js` and `git diff --check` passed.

The PURE array, including its push/unshift entries, was read from the release-gate source; no hand-maintained subset was substituted. The release-gate driver itself was not started because it also manages browser suites and a listening server. Scratch logs are outside the checkout at `/private/tmp/settings-proof/`, `/private/tmp/settings-safety-red.txt`, and `/private/tmp/settings-safety-green.txt`. The report embeds the material outcomes so review does not depend on those temporary files.

**Files changed, blocked actions and deviations.**

- `js/app.js`: Settings copy and Export, Erase, Delete account error handling.
- `tests/settings-safety-audit.mjs`: permanent production-code audit and optional replacement observation. The audit writes no files.
- `tests/release-gate.mjs`: adds the audit to PURE.
- `docs/PLAYTEST-SETTINGS.md`: this report.

Ignored environment addition: `node_modules/esprima`, verified version 4.0.1. Package manifests and lockfiles were unchanged.

No permission denial occurred. Missing dependencies temporarily blocked four checks and were resolved offline. No browser, socket binding, deployment, remote Wrangler invocation, production D1 write, secret setting, commit, push, publication or PR was attempted. `native/ASC-SUBMISSION.md`, artwork and original checkouts were untouched. Existing native preflight audits ran only their local disposable fixtures.

No implementation deviation was silently made. The unresolved replacement policy and proposed preservation approach are disclosed in finding 1. Full visual layout, hit targets, real native file delivery, native vault removal, live cloud behavior and multi-tab timing remain unverified. Cosmetic and layout issues could not be seen and are not claimed as findings. The fixes and this report remain advisory for the independent reviewer.
