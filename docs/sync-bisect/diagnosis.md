# Sync release bisect diagnosis

No release regression was reproduced in the tested sync path. All 60 first-parent trees from v475 through v527 reached the intercepted `PUT /profile` in all five scenarios. There is no evidence-backed failing commit or line, and no production fix was made. This result redirects investigation toward the running environment, native wrapper, or an earlier boot/state condition that these fixtures do not reproduce. It does not establish which of those is responsible.

The production outage remains unresolved.

## Scope and evidence

- Checkout HEAD: `f586e9d3d2002ebbc010a747d7cd2a8413baf401` (v527).
- Frozen plan SHA256 verified: `6bb35b319e621f8fb3f522eca05582c12f8391e7204e20e91e0a4d1c848508d7`.
- Node: v22.22.2.
- Range: `6eb45e81^..HEAD`, first parent, oldest first. This includes v475 as a baseline, every build v476 through v527, and intervening commits. Build labels come from each tree's `APP_BUILD`, including v489 whose commit subject does not name its version.
- Each historical runtime tree was exported with `git archive` into a fresh temporary directory. No checkout was switched or reset. Each candidate ran in a separate Node process, with its own real modules and in-memory IndexedDB.
- [history.jsonl](history.jsonl) records full commit IDs, build labels, commit timestamps, exit codes and probe output. Timestamps preserve Git's explicit timezone rather than inferring deployment times from the plan's day grouping.

Five scenarios per tree, 300 successful profile-request observations:

| Scenario | Observed request sequence |
| --- | --- |
| Empty gameplay state, registered identity | `PUT /profile`, `GET /grants` |
| Owned and equipped C2 pet | `PUT /profile`, `GET /grants` |
| Equipped pet with cloud backup due | `PUT /backup`, `PUT /profile`, `GET /grants` |
| Boot lifecycle tail | `PUT /profile`, `GET /grants` |
| Registered resume callback, throttle expired | `PUT /profile`, `GET /grants` |

The probe executes `socialSnapshot`, `buildFighter`, their local helper functions and constants from each actual `js/app.js`. Imported names are resolved through that file's own import declarations, so a missing import is not concealed by supplying an entire module namespace. The production `social.js`, `db.js`, game/loot dependencies and WebCrypto signing run over `tests/mem-idb.mjs`. The fetch spy verifies the account header and ECDSA signature over the actual method, path including query, timestamp and body. It supplies successful responses locally. It opens no sockets and sends no external traffic.

For v482 onward, the probe executes `bindAppLifecycle`; earlier builds execute the corresponding source slice in `boot`. The actual registered resume callback is invoked. The later `guardSaveBeforeInit` function also runs against seeded settings and loot receipts. UI presentation, timers, Health/day refresh and native event registration are doubles. The initialization promise is in its ordinary settled state. The test does not execute all of `boot`, simulate a stuck backfill, use a production save, prove WKWebView event delivery, or exercise the service worker/native asset selection. Reaching fetch does not prove production HTTP acceptance or D1 writes.

## Source comparison

There is no failing/predecessor pair to diff. The four requested paths were examined across the range. Relevant lifecycle changes were:

- `352c0de8` (v482): moved the existing boot tail into `bindAppLifecycle` and called it after onboarding as well as boot.
- `bce3a937` (v493): changed registration-failure handling for the onboarding Go Online call.
- `fadb5cf7` (v511): added a siege check before the boot sync call.
- `9e172ca1` (v517): added the save-presence guard before resume work. It passes for the intact-save fixture.

In HEAD, the observed path is `js/app.js:1355` (boot) or `:1382` (resume), `js/social.js:1874` (`autoSync`), `js/app.js:24552` (`socialSnapshot`), `js/social.js:983` (`syncProfile`), `:373` (`signedFetch`), then `:368` (`fetch`). No hop in this exercised chain fails. The server tree was exported and its diff inspected, but no Worker execution or server acceptance claim is made because the requested discriminator was whether the client reaches the network boundary.

## RED controls and deviations

The requested production-outage RED, fix, GREEN sequence cannot be supplied honestly: the unmodified source is GREEN throughout the historical range. The plan expressly permits reporting that result. No root cause or speculative fix was substituted.

[controls.jsonl](controls.jsonl) contains separate sensitivity controls on disposable copies of the current source:

- Healthy copy: exit 0.
- Throw inside the actual snapshot builder: exit 1, snapshot scenarios fail with the injected error and no profile request.
- Remove the actual boot sync call: exit 1 on the boot row.
- Remove the actual resume sync call: exit 1 on the resume row.

These are artificial RED controls, not reproductions of the outage. The main test also checks that a throwing builder sends no profile and leaves the throttle timestamp unchanged.

Runtime-only historical exports replace full worktree checkouts to avoid copying unrelated assets or changing repository metadata. This preserves the candidate's real module graph. Testing the entire first-parent range replaces a binary search because no bad endpoint exists.

## Agreed proof and remaining blocker

`node tests/unit.test.js` exited 0:

```text
377 passed, 0 failed
```

Every one of the 124 entries in the final PURE list was executed with the release gate's actual preload convention:

```text
node --import ./tests/audit-lifecycle.mjs tests/<entry>
123 exited 0
m5-prove-red.mjs exited 1
```

The all-PURE-green requirement is therefore **not met**. [proof.json](proof.json) preserves all initial results, affected-check reruns, exact output-log paths and the standalone M5 comparison. The new sync check passes under the preload.

The remaining failure is an unchanged harness interaction: `tests/m5-prove-red.mjs:56` prints its intentionally failing child-control lines with a `FAIL` prefix. `tests/audit-lifecycle.mjs` counts those lines as parent failures and sets exit 1 even though M5 reports that every expected child exit matched. Its final output includes:

```text
m5-prove-red: PASS
AUDIT END m5-prove-red.mjs: FAILED; NORMAL EXIT (row coverage undeclared); rows=18/undeclared; failed=7; unproven=0; exit=1
```

`node tests/m5-prove-red.mjs` separately exits 0. Both harness files and their tested production sources are identical to HEAD. Proposed follow-up outside this lane: distinguish echoed child evidence from parent grading, preserving the negative controls. Neither test was removed from PURE nor was its failure hidden.

The initial PURE run also exposed missing `esprima` in four checks and an output-path guard violation in the two new helpers. The helpers now validate temporary write destinations with `auditOutputPath`. Esprima 4.0.1 was restored into this checkout's ignored `node_modules` from a local cached tarball after verifying its SHA512. All five affected checks now exit 0.

## Denied actions and constraints

An offline `npm pack` by package name failed with `ENOTCACHED`. A second offline attempt using the cached tarball URL hit `EPERM` while trying to create a temporary file under `/Users/tommiller/.npm/_cacache`; npm also could not write its log directory. No permission escalation or ownership change was attempted. Reading and verifying the cached archive directly, then extracting it into this checkout, resolved dependency setup without modifying that cache.

No commit, push, PR, publish, deployment, remote Wrangler command, production D1 write, secret change, socket server or original-checkout edit was performed. `native/ASC-SUBMISSION.md` is unchanged.

## Files changed and reproduction

- `tests/sync-path-audit.mjs`: the Node sync regression probe.
- `tests/release-gate.mjs`: registers that probe in PURE.
- `tests/lib/sync-history.mjs`: isolated historical runtime exporter and probe runner.
- `tests/lib/sync-controls.mjs`: disposable-copy sensitivity controls.
- `docs/sync-bisect/diagnosis.md`: this advisory diagnosis.
- `docs/sync-bisect/history.jsonl`: historical results.
- `docs/sync-bisect/controls.jsonl`: healthy and deliberately broken controls.
- `docs/sync-bisect/proof.json`: unit/PURE results and remaining failure evidence.

Local dependency setup additionally populated ignored `node_modules/esprima`; no manifest or lockfile changed. Full proof stdout/stderr logs are in `/private/tmp/sync-bisect-proof-fo0ls4iu`.

Run from this checkout:

```sh
node tests/sync-path-audit.mjs
node tests/lib/sync-history.mjs
node tests/lib/sync-controls.mjs
node tests/unit.test.js
```

The PURE results were obtained by evaluating the `const PURE` block, including its pushes/unshifts, up to `const BROWSER` in `tests/release-gate.mjs`, then spawning each listed file sequentially with `--import ./tests/audit-lifecycle.mjs`. This avoids starting the full release gate's socket server. No browser or full-gate pass is claimed.
