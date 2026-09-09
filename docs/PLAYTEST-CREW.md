# Crew playtest advisory

Frozen work order `03-crew.md`, SHA256 `845cdd0bd4bcbe2fb4d99e63c1c987b0b1af34d75be5bdbc2fb16b71490426f4`, verified before editing. All source paths resolved within this checkout. Six proven findings fixed; one loss-risk finding left open.

## Method and limits

`tests/crew-playtest-audit.mjs` imports the production social, database and wallet modules over `tests/mem-idb.mjs`. It executes actual gift, cheer, friend-code and removal handlers sliced from `js/app.js`, including the gift sheet's production template. HTTP responses and DOM nodes are doubles. Request bodies, persisted balances, receipts, queues, rendered text and actual handler effects are the observations. No browser, sockets, production API or Worker execution was used.

The gift queue check uses three production `pullGrants` calls with batches of 50, 50 and 1, matching the Worker's 50-row page size (`server/src/index.js:2502`). The coin-send harness's word `delivered` means the total coin amounts in outgoing production requests accepted by the HTTP double. It does not claim a real remote delivery. The Worker source accepts these two amounts and permits five sends per friend per day; that contract was read, not executed remotely.

No cosmetic or layout finding is asserted. Pixels, scrolling, native clipboard/share UI, animation timing and device lifecycle behavior were not visible. Existing Node profile and pet rendering guards were also run. The actual two-tap arming helper was not exercised by the new audit: its confirmed callbacks were invoked directly.

## Findings, ordered by player harm

### C0. Sender termination after debit can lose earned coins (unfixed)

- Reproduction: seed 500 coins, open the real gift sheet, invoke the confirmed 250-coin callback, and hold the HTTP response. At the boundary reached by the production send, inspect persisted storage as it would exist if the process terminated before delivery. Only after recording that boundary does the harness reject the request to clean itself up.
- Source: `js/app.js:13963`, `js/app.js:13970`, `js/app.js:13975`, `js/app.js:13976`; `js/social.js:656`. The retry-key Map belongs to the sheet and is not persisted. The remote key also includes a UTC day in `server/src/index.js:3458`.
- Observed: balance 250, no gift/send recovery records. A surviving process can refund on failure, but there is no persisted intent from which a terminated process can retry or refund. The same sender flow refunds ambiguous network failures, even though remote acceptance may have happened.
- Impact: a possible permanent loss of 250 earned coins when delivery never lands. Uncertain remote acceptance also prevents safe automatic refund decisions.
- Certainty: high for the persisted debit and absent recovery record. This is a controlled interruption boundary, not a real browser kill or real server delivery experiment.
- Left unfixed because safe recovery needs a durable debit/intent transaction, persistent idempotency and reconciliation across reopen, day rollover and backup merge. Those changes require tracing database/backup and Worker behavior beyond this Crew lane. Proposed follow-up: design and prove that protocol with the owners of those areas. No substitute protocol was implemented.
- Runnable open-finding proof: `node tests/crew-playtest-audit.mjs --known-issues`. It intentionally exits 1. This mode is not invoked by PURE.

### C1. The 101st unopened gift silently discards the first (fixed)

- Reproduction: receive 101 distinct 25-coin gifts across three pulls without opening any. The cursor reaches 101. Then try opening every gift by its original key.
- Source: `js/social.js:1328` in `applyGrant`, originally the appended queue ended with `.slice(-100)`. Cursor/seen advancement remains in `pullGrants` immediately below.
- Observed before: queue length 100 rather than 101; the oldest envelope was gone without a receipt or reward. The advanced cursor excludes it from normal subsequent pulls.
- Impact: unopened earned rewards disappear, with no ordinary player recovery control. Previously discarded gifts are not reconstructed by this fix.
- Fix: retain every unopened envelope. Deduplication, atomic append, receipt checks and explicit open behavior remain in place. Storage grows with genuinely outstanding gifts and shrinks as they are opened; storage failures must remain retryable rather than silently discarding rewards.
- Certainty: high. Afterward, all 101 open, pay 2,525 coins and empty the queue. Concurrent ingest/open controls also pass.

### C6. Confirmed gift chips can spend the same wallet twice (fixed)

- Reproduction: seed 500 coins, open the sheet and overlap confirmed 250- and 500-coin callbacks. Accept both valid gift requests in the HTTP double.
- Source: `js/app.js:13964` and `js/app.js:13970`. The old handler read `coins()` and later debited with `coinsAdd(-amt)`, whose zero clamp hid the unaffordable second debit.
- Observed before: outgoing accepted gift amounts total 750, wallet 0. Afterward: one 250-coin request, wallet 250; the other callback reports insufficient funds.
- Impact: double-spending and an untrue relation between the player's wallet and what they sent.
- Fix: use the existing production `spendCoins` atomic affordability/debit primitive and disable the chip before awaiting it. No wallet or server implementation was changed.
- Certainty: high for production callback concurrency, requests and balances over mem-idb. Physical tapping and the remote service were not exercised.

### C2. An aborted reward write strands the gift's OPEN button (fixed)

- Reproduction: seal one gift, mount the production OPEN callback and abort its real `claimAndPay` transaction through the IndexedDB double. Try the same control again after storage recovers.
- Source: `js/app.js:12650`, with the recovery branch at `js/app.js:12657`; `js/social.js:1298`.
- Observed before: callback rejected with `claimAndPay aborted`; `data-busy` remained `1`, so further clicks returned without doing anything. The gift and zero balance were preserved.
- Impact: a temporary write failure makes the reward unreachable through that control until the view is rebuilt.
- Fix: catch the failed open, release the busy state and say to try again. The same button then opens, pays and reveals exactly once.
- Certainty: high for transaction rollback and actual callback behavior; no browser paint claim.

### C4. Remove/decline fails without feedback (fixed)

- Reproduction: open a friend profile or use a request-list removal control. Return HTTP 503 from the production removal call, then retry with success.
- Source: `js/app.js:13701` (request list) and `js/app.js:13884` (profile).
- Observed before: failure produced no toast or visible handler effect. Afterward, both controls say removal failed and invite retry; success still updates the list and, for the profile, closes the sheet.
- Impact: a control appears inert and leaves the player unable to tell whether removal happened.
- Fix: explicit failure feedback on both paths. Certainty: high from actual handlers and production service results.

### C3. Server errors blame the player's valid friend code (fixed)

- Reproduction: submit ` bone-test-code ` through the real handler with HTTP 401, 429 or 500. Compare the exact missing-code and own-code responses, then an accepted request.
- Source: `js/app.js:13190` and `js/app.js:13200`; server missing-code response at `server/src/index.js:2607`.
- Observed before: `No Bonehead has that code. Double-check it.` for a transient refusal. The production request correctly carried uppercase `BONE-TEST-CODE`.
- Impact: players are sent to correct a code that was not the problem.
- Fix: reserve nonexistent-code copy for the explicit `no player with that code` response; use retryable request-failure copy for other refusals. Own-code and successful acceptance controls remain distinct.
- Certainty: high from actual submitted data and toast output.

### C5. The gift sheet directs recipients to the wrong place (fixed)

- Reproduction: render the production send-gift sheet, then ingest a gift without opening it. Read its destination instructions and inspect the sealed queue.
- Source: `js/app.js:13907`; actual gift delivery/open behavior at `js/social.js:1298` and `js/social.js:1310`.
- Observed before: the sheet promised gifts land in Backpack on the next app open. Actual gifts are held sealed until opened in Crew, and coin rewards go to the wallet.
- Impact: recipients can look in Backpack and conclude a gift was never delivered.
- Fix: name Crew as the opening location and distinguish coin balance from item storage. Certainty: high from rendered production copy and delivery controls.

## Healthy paths exercised

The new audit's six control rows pass both before and after the fixes: concurrent gift ingest/open pays one receipt; missing/own/accepted friend codes stay distinct; a successful coin send spends once and an explicit 403 refunds; free and already-sent gifts preserve the wallet; cheer index zero, sender and original timestamp survive ingestion, with one retry key across send retries; friends and leaderboard distinguish an empty result, offline failure and clock refusal.

Existing PURE checks also passed: `crew-yard-row-audit.mjs` (8/8, actual profile template, owned totals, empty/legacy/malformed yard states and visit callback) and `crew-pet-node-guard.mjs` (7/7, production pet markup, species/colour/accessory controls). These establish only the Node observations named by the checks. They do not certify all Crew behavior, nickname persistence, leaderboard scrolling or visual appearance.

## Red and green receipts

Before changing production code, the new checks failed on each bug. The final audit was then rerun against the original `HEAD` versions of `js/app.js` and `js/social.js` in an external `/tmp` fixture, preserving production imports. This consolidated red run confirms the completed audit still sees every original defect. No audit writes into the graded checkout.

`node tests/crew-playtest-audit.mjs` against original source, exit 1:

```text
OBSERVED concurrent sends: delivered=750, balance=0
FAIL C6 simultaneous confirmed chips cannot deliver more than the wallet: 750 delivered from a 500-coin wallet
FAIL C1 every one of 101 pulled gifts remains openable after cursor advance: sealed gifts were discarded

100 !== 101

PASS CONTROL concurrent ingest and open pay one receipt per gift
FAIL C2 aborted reward write leaves the OPEN control retryable: handler rejected: claimAndPay aborted
FAIL C3 transient server refusal never says a valid friend code does not exist: 401: No Bonehead has that code. Double-check it.
PASS CONTROL missing, own and accepted friend codes keep distinct results
FAIL C4 failed remove explains retry in both profile and request list: profile failed silently
FAIL C5 gift sheet tells the recipient to open their gift in Crew: sheet sends recipient straight to Backpack
PASS CONTROL gift success spends once and confirmed refusal refunds
PASS CONTROL free gift and already-sent response preserve wallet
PASS CONTROL cheers retain phrase zero, sender and original send time
PASS CONTROL friends and leaderboard separate empty, offline and clock refusal
CREW PLAYTEST: 6 passed, 6 failed (Node only; no pixel claim)
```

Same audit against final source, exit 0:

```text
OBSERVED concurrent sends: delivered=250, balance=250
PASS C6 simultaneous confirmed chips cannot deliver more than the wallet
PASS C1 every one of 101 pulled gifts remains openable after cursor advance
PASS CONTROL concurrent ingest and open pay one receipt per gift
PASS C2 aborted reward write leaves the OPEN control retryable
PASS C3 transient server refusal never says a valid friend code does not exist
PASS CONTROL missing, own and accepted friend codes keep distinct results
PASS C4 failed remove explains retry in both profile and request list
PASS C5 gift sheet tells the recipient to open their gift in Crew
PASS CONTROL gift success spends once and confirmed refusal refunds
PASS CONTROL free gift and already-sent response preserve wallet
PASS CONTROL cheers retain phrase zero, sender and original send time
PASS CONTROL friends and leaderboard separate empty, offline and clock refusal
CREW PLAYTEST: 12 passed, 0 failed (Node only; no pixel claim)
```

Open finding on final source, `node tests/crew-playtest-audit.mjs --known-issues`, exit 1:

```text
OBSERVED termination boundary: balance=250, gift/send records=[]
FAIL UNFIXED sender termination after debit leaves no recoverable gift intent: 250 debited before delivery, without a persisted retry/refund intent

250 !== 500

CREW PLAYTEST: 0 passed, 1 failed (Node only; no pixel claim)
```

## Agreed proof and remaining gate limitation

`node tests/unit.test.js` exited 0:

```text
377 passed, 0 failed
```

All 116 current PURE entries were exercised. A temporary runner evaluated the actual PURE declarations and additions from `tests/release-gate.mjs`, stopping before BROWSER, and ran the entries without starting the gate server. It reused the completed unit-command receipt. The initial run with the gate's lifecycle preload returned 111/116 exit 0. Four entries were UNPROVEN (97) because `esprima` was absent. Installed the exact locked `esprima@4.0.1` into ignored `node_modules/esprima` from the local npm cache after verifying its archive integrity against `package-lock.json`. No network, dependency scripts or manifest changes were needed.

Rechecks:

```text
store-copy-lint.mjs exit=0 gate lifecycle preload
store-runtime-audit.mjs exit=0 gate lifecycle preload
submission-build-audit.mjs exit=0 gate lifecycle preload
submission-preflight-audit.mjs exit=0 gate lifecycle preload
m5-prove-red.mjs exit=0 direct entry
```

Every PURE entry now has a successful entry-point exit. **The gate lifecycle wrapper is still not fully green:** it forces `m5-prove-red.mjs` to exit 1 after that suite prints intentional failing mutation-child output. The suite itself reports `m5-prove-red: PASS` and exits 0 when run directly. With the wrapper, its final receipt says `rows=18/undeclared; failed=7; unproven=0; exit=1`. This pre-existing harness mismatch is outside Crew; it was not suppressed or fixed. Therefore the 116-entry evidence includes this explicitly disclosed direct-run deviation, rather than claiming a completely green release-gate run.

`node tests/release-gate.mjs --coverage-only` exited 0:

```text
coverage: 367 audits on disk, 122 fast, 129 full, 116 skipped
```

Here `116 skipped` is the coverage command's label for PURE tier membership, not tests omitted from the proof run. `git diff --check` also passed.

Full per-entry logs from the initial run are retained locally at `/tmp/crew-pure-proof-qPfY9Q`. Red/green and open-finding outputs are embedded above so their evidence stays with this report. Temporary runner and follow-up logs use `/tmp/crew-*`.

## Changed files, denied actions and deviations

- `js/app.js`: Crew gift/open/send and friendship controls only, plus the existing wallet primitive import.
- `js/social.js`: retain all unopened gifts.
- `tests/crew-playtest-audit.mjs`: runnable regression audit, healthy controls and opt-in open-finding reproduction.
- `tests/release-gate.mjs`: register the audit in PURE.
- `docs/PLAYTEST-CREW.md`: this advisory report and proof receipts.

An ignored local `node_modules/esprima` installation supports proof only. No tracked dependency files changed.

Denied diagnostic: `ps` returned `operation not permitted` while checking unit-process progress. Tool-session polling completed the proof instead. No approval request or prohibited retry was made.

No commits, pushes, PRs, publishing, Worker deployment, remote Wrangler, production D1 writes, secrets, native submission edits or art changes. No browser or socket attempt. No original checkout was edited.

Deviations: the lifecycle-wrapper issue above prevents claiming the exact wrapped PURE run is entirely green; its entry was additionally verified directly. C0 is intentionally left as a proven open finding under the work order's unsafe-fix rule. No impossible requirement was silently redesigned. Independent review should prioritize that sender-loss protocol and the wrapper mismatch before treating this lane as release-ready.
