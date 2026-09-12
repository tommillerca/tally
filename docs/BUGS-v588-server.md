# Worker, sync and service-worker findings at v588

2026-09-12. Advisory findings only, ranked by harm. No proposed fix is approved by this document. All paths resolve within this checkout. The frozen plan hash matched `8e4984205cb432cb7df86b8cb411b1baf32dbae506508c7600a8fd708366fbbb`.

Every finding below is **source-read only**. No browser, network request, production D1 operation or deployment was used. Verification scenarios are proposed follow-up work, not claimed reproductions. The requested filename is retained although this checkout's actual service-worker stamp is `tally-v587` (`sw.js:2`, `version.json:1`). Existing economy and UI findings were read and excluded; the credential acknowledgement issue below is distinct from the UI lane's missing-progress-backup promise.

## 1. The first podium payment can permanently suppress the remaining prizes

**Where:** `js/app.js:13544`, `js/app.js:13550`; `js/social.js:825`; `server/src/index.js:3253`, `server/src/index.js:3268`, `server/src/index.js:3292`.

**What happens:** A failure after first place is paid but before second and third place are paid leaves the remaining podium unpaid. Reopening Crew does not repair it. Lower-ranked finish notices can be lost in the same window.

**Evidence:** Crew pushes the profile and requests `/steps/week`. The Worker checks whether ANY grant with `stepweek-<previous week>` exists before entering settlement. It then inserts each podium grant in a separate awaited statement, followed by a separate loop for finish notices. The first committed prize satisfies the next request's `already` query even if every later insert failed. The client converts the failed race response to null (`js/social.js:828`, `js/social.js:841`); retry sees a settled week. Per-player uniqueness (`server/schema.sql:193`) prevents duplicate inserts but does not complete missing inserts.

**Proposed fix:** PROPOSAL: atomically commit the complete settlement and its completion marker, or persist an immutable settlement manifest whose unpaid recipients can resume. Do not use the existence of one recipient's reward as proof that everybody was paid.

**Verify:** With three eligible racers, fail the second podium insert. Retry twice. Require exactly one correct prize per racer and a completion marker only after the complete settlement commits. Also fail during finish notices.

## 2. Replay protection hashes signature text while verification decodes it

**Where:** `js/social.js:389`; `server/src/index.js:1216`, `server/src/index.js:1251`, `server/src/index.js:1261`.

**What happens:** A captured valid write can pass the replay guard again when the same signature bytes are represented by different accepted Base64 text. This does not let an attacker change the signed body, but defeats the promised one-signature/one-effect boundary.

**Evidence:** The client signs method, full path/query, timestamp and body. The Worker verifies those same fields after `atob(sig)`, but `claimSignature` hashes the raw header string. Base64 whitespace or omitted padding can preserve decoded bytes while changing that digest. Thus the fresh nonce bucket does not establish that the verified signature is new. Same-day gift/cheer `ck` constraints provide a separate mitigation, not a repair of this guard (`server/src/index.js:3462`, `server/src/index.js:3507`). Writes without a stable operation key still reach their route again; `/friends/accept`, for example, updates an already accepted row's timestamp (`server/src/index.js:2644`, `server/src/index.js:2648`). No captured production request was used.

**Proposed fix:** PROPOSAL: derive replay identity from the verified canonical request and player, or enforce canonical signature encoding and handle ECDSA signature malleability as well. Hashing decoded signature bytes alone fixes textual aliases but is not a complete request-identity policy.

**Verify:** In an isolated Worker harness, submit one valid signed write, then byte-equivalent Base64 encodings within the skew window. Require the repeats to be refused before route effects, with an independently signed legitimate request as control.

## 3. Recovery credentials can be reported saved without a server acknowledgement

**Where:** `js/app.js:22455`, `js/app.js:22460`; `js/social.js:1587`, `js/social.js:1591`; `server/src/index.js:2407`.

**What happens:** A 200 HTML interstitial, empty JSON object, or `{ok:false}` response to recovery setup is treated as success. The phone records recovery as configured and tells the player the new credentials are saved even though they may not exist remotely.

**Evidence:** The Worker success contract is `{ok:true, updatedAt, recoveryId}`. `setRecoveryPhrase` checks 409 and HTTP status only, never parses the response body, then writes `recoverySetAt` and the requested ID and returns `{ok:true}`. The handler closes the sheet and prints the saved toast. This is distinct from saving valid credentials without a progress backup. The backup and deletion clients already demand `d.ok === true` (`js/social.js:1121`, `js/social.js:602`), so those narrower protections do not cover recovery setup.

**Proposed fix:** PROPOSAL: validate the recovery acknowledgement and returned ID before recording success. On an ambiguous response, preserve retryable state and disclose that saving was not confirmed.

**Verify:** Stub 200 HTML, `{}`, `{ok:false}`, 409, and the actual Worker success body. Only the last should stamp recovery metadata and show success.

## 4. Local race weeks disagree with the Worker's UTC weeks, and DST can produce invalid keys

**Where:** `js/app.js:24994`, `js/app.js:25009`, `js/app.js:25034`, `js/app.js:13528`; `server/src/index.js:1315`, `server/src/index.js:1429`, `server/src/index.js:3252`.

**What happens:** Players in different time zones cross the race boundary at different instants, while settlement uses UTC. In a zone whose offset changes after the August epoch, adding fixed seven-day millisecond periods to local midnight can return the previous calendar date. That key is not a valid server race start, so submitted race fields are discarded.

**Evidence:** This race does NOT use `isoWeekKey`: that helper returns `YYYY-Wnn` for world content (`js/poi.js:131`). The actual race client subtracts local-midnight timestamps, divides by fixed 604800000ms periods, then formats a local date after adding those periods to the epoch. `raceWeekDates` also adds fixed 86400000ms increments to local midnight. The Worker anchors the same epoch at `00:00:00Z` and accepts only exact current/previous/next UTC period starts. After Vancouver's autumn offset change, epoch-plus-fixed-weeks lands at 23:00 on the preceding local day. Invalid classification deletes the snapshot's week fields (`server/src/index.js:1632`, `server/src/index.js:1640`). This is separate from the already-known previous-week step clamp, which is not re-reported.

**Proposed fix:** PROPOSAL: agree explicitly on race boundary time zone, compute calendar keys without DST-sensitive elapsed-local-time arithmetic, and communicate that boundary in the client. Whether settlement is globally UTC or player-local is a product decision, not silently changed here.

**Verify:** Compare real client key/window production and Worker classification around UTC rollover and both DST transitions under UTC, America/Vancouver and a positive-offset zone. Assert seven distinct intended calendar days and a server-accepted key.

## 5. A flagged existing Crew member remains visible and can still send

**Where:** `js/app.js:13283`; `js/social.js:733`; `server/src/index.js:2690`, `server/src/index.js:3425`, `server/src/index.js:3493`.

**What happens:** Marking an account as a test account after a friendship exists removes it from the public board but leaves it in friends/pending lists. An existing accepted friendship still authorizes its gifts and cheers to real players.

**Evidence:** `/leaderboard` filters `COALESCE(is_test,0)=0` (`server/src/index.js:3114`). The three `/friends` queries join both player rows but filter only membership and status, then return the other player's name/profile. `listFriends` validates and passes those buckets to Crew without a suppression check (`js/social.js:752`, `js/social.js:757`). The gift and cheer routes test accepted friendship only. `requestFriendship` blocks newly created flagged pairs (`server/src/index.js:1778`), but cannot protect pre-existing relationships. Retroactive flagging is a supported schema operation (`server/migrations/2026-08-23-flag-known-test-accounts.sql:1`); no such operation was executed here.

**Proposed fix:** PROPOSAL: apply the suppression predicate to friend reads and relevant relationship/send mutations, including accept. Keep test-run provenance distinct from `is_test` suppression.

**Verify:** Create a friendship and a pending request in an isolated fixture, then flag one participant. Require absence in every returned bucket and refusal of sends/accepts involving that flagged participant. Unflagged controls must continue working.

## 6. A service-worker takeover can give an old open sheet new modules

**Where:** `js/app.js:1561`, `js/app.js:9975`; `sw.js:443`, `sw.js:481`, `sw.js:527`, `sw.js:613`.

**What happens:** While an old page keeps a sheet open and defers reload, a newly activated worker serves newly imported shared module URLs from the new build. Retaining the old cache does not bind that page's fetches to its original version.

**Evidence:** Installation calls `skipWaiting`. The controller-change handler defers reload when `sheetStack` is nonempty. Activation records client generations for retention, but the fetch listener never uses `e.clientId` to choose a generation (`sw.js:644`). `shell` looks in VERSION first, and `fromCaches` also chooses VERSION first. Lazy imports such as `./ocr.js` can therefore enter the old module graph from the new cache. This proves a mixed-build window, not that every update necessarily crashes.

**Proposed fix:** PROPOSAL: bind each client's shell/module requests to its original complete generation until navigation, or use immutable versioned module URLs. Preserve the intended sheet-safe reload behavior.

**Verify:** Hold a sheet on build A, activate B with a changed shared lazy module, and invoke the old sheet's lazy action. Require A's module until reload and B's entire graph afterward.

## 7. A same-version release cannot refresh an installed shell reliably

**Where:** `sw.js:2`, `sw.js:400`, `sw.js:550`, `sw.js:613`; `js/app.js:1551`; `version.json:1`.

**What happens:** Moving app/assets on main without changing `sw.js` or its version stamp leaves installed users on the cached shell. If `sw.js` changes but reuses VERSION, installation writes into the cache the active worker already serves, allowing a partially replaced build.

**Evidence:** The stamp check returns immediately when its version equals VERSION (`sw.js:559`). Explicit registration updates only check the worker script; unchanged worker bytes cannot create a new install. The ready shell answers cached URLs before any network request. In the second case, `caches.open(VERSION)` reuses the active cache and the installer puts entries individually before writing READY, without clearing a pre-existing sentinel (`sw.js:403`, `sw.js:424`). There is no content hash in the cache identity. This is the specific no-bump scenario requested by the work order, not a claim that a particular remote deployment occurred.

**Proposed fix:** PROPOSAL: make shell generation identity content-derived or enforce a new generation for every shell/assets release, and stage installation outside the currently served cache.

**Verify:** Install A, publish changed app bytes with identical worker/stamp, then update and reopen. Separately change worker bytes without changing VERSION and interrupt installation. Assert either a complete A or complete B, and no permanent stale shell after the supported update action.

## 8. Partial shell fallback still mixes builds and can return HTML as JavaScript

**Where:** `sw.js:398`, `sw.js:517`, `sw.js:605`, `sw.js:618`, `sw.js:638`.

**What happens:** If the serving worker lacks a complete cached shell, requests independently combine fresh network files and cached fallbacks. A failed uncached module request can even receive `index.html`, causing module loading to fail.

**Evidence:** READY only gates the cache-first branch. Without it, successful per-file network responses are returned and asynchronously written into VERSION; unsuccessful responses fall back through `fromCaches`. A thrown fetch returns the requested cache hit OR cached `index.html` unconditionally, including for `.js` requests. Partial eviction with a surviving or memoized READY also falls through on missing individual hits. Thus the sentinel does not make the recovery branch an atomic whole-build choice. No half-cache browser boot was performed.

**Proposed fix:** PROPOSAL: choose one complete generation for the whole shell recovery path. Return an appropriate module failure for a missing module, and reserve document fallback for app navigations. Rebuild damaged generations separately before serving them.

**Verify:** Remove a required module from a cached generation and exercise online success, 404 and thrown-fetch cases while newer assets exist. Verify module content types and a consistent generation, with offline complete-cache boot as control.

## 9. The Privacy policy link navigates to the app shell

**Where:** `js/app.js:15234`; `sw.js:11`, `sw.js:606`, `sw.js:613`, `sw.js:614`.

**What happens:** In the service worker's scope with a ready cache, opening the Settings Privacy policy link receives cached `index.html` instead of the policy, even though `privacy.html` is precached.

**Evidence:** Settings links directly to `privacy.html` in a new tab. `shell` treats every navigation as an app navigation and uses `nav ? './index.html' : req.url` for lookup, with no pathname exception. A regular `fetch('privacy.html')` is not a navigation and therefore does not prove the link works. The release gate's screen-sweep description explicitly describes fetching the href (`tests/release-gate.mjs:520`), not exercising this navigation branch.

**Proposed fix:** PROPOSAL: scope SPA fallback to actual app entry routes and serve precached standalone documents by their own URL.

**Verify:** From a controlled installed app, click Read in Settings online and offline. Require the policy document in the new tab, with app deep-link navigation as control.

## 10. A same-key cheer retry across UTC midnight delivers twice

**Where:** `js/app.js:14101`, `js/app.js:14107`; `js/social.js:692`; `server/src/index.js:3498`, `server/src/index.js:3508`, `server/src/index.js:3525`.

**What happens:** A cheer accepted just before UTC midnight whose response is lost can be delivered again when the player retries the same chip after midnight, even with the original operation key.

**Evidence:** The open sheet retains its per-chip key until success and re-enables chips on failure (`js/app.js:14116`). `sendCheer` sends that same `ck`, but the Worker prefixes the grant key and duplicate lookup with the request's current UTC day. The retry therefore addresses a different unique key. A new timestamp/signature is legitimate and passes signature verification. This finding concerns cheer retry identity; the economy lane already owns gift debit/refund ambiguity.

**Proposed fix:** PROPOSAL: key deduplication by stable sender/recipient/operation identity independent of daily cap accounting. Retain the receipt across the supported retry horizon.

**Verify:** Accept a cheer at 23:59:59 UTC, drop its reply, then retry the retained key after midnight. Require one recipient grant and a successful duplicate acknowledgement. A new operation key should still send normally.

## Proof and limits

Agreed command: `node tests/unit.test.js`. Exit 0. Final output: `392 passed, 0 failed`.

Selected relevant PURE audits were run individually as `node tests/<filename>`, all exit 0. Registration is in `tests/release-gate.mjs:267` to `tests/release-gate.mjs:293`, with additional entries at `tests/release-gate.mjs:307`, `tests/release-gate.mjs:315`, `tests/release-gate.mjs:316` and `tests/release-gate.mjs:335`. Exact output rows:

| Audit filename | Quoted output |
| --- | --- |
| sync-observability-audit.mjs | `80/80 checks passed` |
| sync-identity-audit.mjs | `9 passed, 0 failed` |
| sync-clientpath-audit.mjs | `PASS CONTROL due backup HTTP 503 still reaches profile` |
| sync-authpath-audit.mjs | `sync-authpath: 18 passed, 0 failed` |
| sync-path-audit.mjs | `PASS CONTROL: thrown snapshot produces no profile request and no throttle stamp` |
| backup-encoder-audit.mjs | `40 pass, 0 fail` |
| backup-key-audit.mjs | `all green` |
| backup-version-audit.mjs | `all green` |
| backup-conflict-audit.mjs | `all green` |
| recovery-status-audit.mjs | `PASS recovery-status: 32 cases, including 404 CONTROL, server faults, throttling, network and unexpected responses` |
| version-stamp-audit.mjs | `all green, 4 checks` |
| version-align-lint.mjs | `VERSION ALIGNMENT LINT: web builds aligned at v587, native provenance checked.` |
| store-runtime-audit.mjs | `store runtime: 13/13 passed` |
| r47-rest-audit.mjs | `5 passed, 0 failed` |
| cloud-off-audit.mjs | `Cloud off audit: 8 passed, 0 failed` |

These green results cover existing contracts, not the ten proposed reproductions above. In-process Worker/SQLite and mocked client transport are local proof, not production D1 or network proof. Browser-only precache tests and the FULL `sw-upgrade-audit.mjs` were not run because this work order prohibits browsers and network (`tests/release-gate.mjs:447`, `tests/release-gate.mjs:1302`). Console captures are outside the checkout at `/tmp/h-server-<filename>.log`.

Changed files: only this new `docs/BUGS-v588-server.md`. No source fixes, commit, push, publish, secret changes, migration execution or production writes were attempted. One read-only process-list diagnostic (`ps`) was denied with `operation not permitted`; it was unnecessary and did not block proof. No other action was denied or blocked.

Deviations: no requirement was redesigned. The plan's suggested `isoWeekKey` comparison does not describe the actual race call path, so the review traced `raceWeekKey` instead and documented both helpers. The requested v588 filename is unchanged despite the checkout's v587 stamps. No original checkout was edited.

## Looked at, not a bug

- **Signed fields:** Client and Worker both cover method, path plus query, timestamp and serialized body (`js/social.js:395`, `server/src/index.js:1247`). Gift amounts, recipient, cheer index and operation key are inside that signed body. The replay identity issue above does not mean those fields can be altered under an existing signature.
- **Public board and Spire projection:** The board excludes flagged accounts and emits an add token, not a friend code (`server/src/index.js:3114`, `server/src/index.js:3130`). Spire reads mask a flagged owner's identity and project defender fields (`server/src/index.js:2875`, `server/src/index.js:2882`); claims explicitly reject test accounts (`server/src/index.js:2920`). These protections do not imply the friend-list filter exists.
- **Spire contention:** Claim cap, shield and same-owner tests are inside the write (`server/src/index.js:2972`); defense clears the siege and increments level under one conditional UPDATE (`server/src/index.js:2840`). Client claim/defend responses are validated (`js/social.js:806`, `js/social.js:951`). The economy lane's missing local takeover payment is not re-reported.
- **Backup upload/download:** The client encrypts before PUT, sends baseVersion, and on 409 pulls/merges before one retry (`js/social.js:1085`). The Worker uses a conditional upsert and returns its actual stored version (`server/src/index.js:2264`, `server/src/index.js:2284`). Downloads decrypt before import; failures return named reasons (`js/social.js:1165`). This does not certify native keychain behavior or production storage limits.
- **Recovery lookup and deletion:** Recovery-ID lookup and legacy-code lookup are deliberately different (`server/src/index.js:2427`, `server/src/index.js:2467`); restore explains legacy-code refusal (`js/social.js:1674`). Delete validates `{ok:true}` before the UI proceeds (`js/social.js:598`, `js/app.js:15551`); the Worker batches its cascade (`server/src/index.js:3658`). No deletion was performed and this is not a claim of exhaustive concurrent-delete safety.
- **Sync and offline retries:** Profile failures remain retryable because autoSync stamps socialSyncAt only when syncProfile succeeds (`js/social.js:1997`, `js/social.js:2006`). There is no general durable send queue in signedFetch (`js/social.js:389`); gift interruption loss is already in lane A. Grant pulls validate responses and advance through the delivered batch (`js/social.js:1426`, `js/social.js:1451`), independently of the server settlement-completion flaw.
- **Update trigger exists:** Resume requests a worker update and controllerchange schedules reload after sheets close (`js/app.js:1558`, `js/app.js:1572`). A new complete install calls skipWaiting (`sw.js:443`). The report does not claim a version bump always waits forever; the concrete defects are generation selection, same-version releases and fallback behavior above.
