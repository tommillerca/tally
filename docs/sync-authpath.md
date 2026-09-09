# sync-authpath advisory diagnosis

No signing or canonicalisation regression was found in this checkout. The real
client signs a mature profile that the real server handler accepts with HTTP 200
and writes to `players.profile`, advancing `last_seen` in local SQL. The tested
snapshot size and shape limits do not reject that profile. **The production
outage's failing hop remains unknown. No production-code fix is justified by
this lane's evidence.** This is an advisory result for independent review, not
a claim that production sync works.

Frozen plan SHA-256:
`7a88a6ce165a2a63cabe23af93e8ba00ad7c6f5cf379d90a8eadb803b77f6fbb`.
The plan file matched this hash before work started. Base checkout:
`f586e9d3` (v527). All source reads and edits resolve inside this checkout.

## Observed hops and evidence

`syncProfile` calls the actual private `signedFetch` in `js/social.js`.
Its real IndexedDB reads use `tests/mem-idb.mjs`. The transport constructs a
Node `Request` and invokes the imported `server/src/index.js` default handler.
The handler executes its real authentication, replay claim, rate limiter,
sanitizer, SQL statements and profile/spire batch against `server/schema.sql`
in an in-memory SQLite database. The D1 adapter provides query methods and
transactional batching; it does not substitute authentication or SQL results.
Every unexpected transport destination or route fails the audit. No network
request is sent by the audit.

| Case | Observed result |
| --- | --- |
| Minimal signed profile | 200; profile stored, `last_seen` advanced |
| Mature fixture: 64 talents, 100 real catalogue gear IDs, 200 pet instances | 200; full expected snapshot preserved, no `bounded` fields |
| Mature serialized body | 4,142 UTF-16 units and 4,142 UTF-8 bytes |
| Entire gear catalogue | 388 IDs preserved; body 9,632 UTF-16 units |
| Production yard builder | 200 total pets, capped to 24 drawn pets |
| 513 talents, 401 gear IDs, unknown key, excessive nesting and long title | 200; arrays capped to 512/400, unknown key removed, depth bounded, title capped to 64; client records `profileBounded` |
| Body exactly 24,576 units | 200 |
| Body 24,577 units | 413 `profile too large`; player row unchanged |
| Unicode title | 200; preserved through signing and storage |
| Changed body, query, signature, or wrong local private key | 401 `bad signature`; player row unchanged |
| Unknown player | 401 `unknown player` |
| Stale or nonfinite timestamp | 401 `stale timestamp` or `bad timestamp` |
| Replayed signed write | 401 `replayed request`; newly signed retry succeeds |
| Null or array snapshot | 400 `missing snapshot` |
| 120 fresh signed requests in one hour window | All accepted; request 121 returns 429 |
| Real `autoSync`, with cloud backup explicitly opted out in the fixture | `/profile` 200, then signed `/grants?since=0` 200; `socialSyncAt` set |

The synthetic mature fixture executes the production `socialSnapshot` function
with explicit dependency fixtures. It is not a captured production save.
Talents are 64 synthetic IDs; gear IDs come from the real catalogue. The clock
is fixed to 2026-09-09 and advanced between cases to avoid hour/week boundary
flakiness. The initial fixture accidentally used a Monday week key and jumped
from a newly observed level 1 to level 20. The server correctly clamped those
fields with HTTP 200. The fixture was corrected to the Friday race epoch and
an existing level-20 observation. No server behavior was changed to make it pass.

Despite its name, `MAX_PROFILE_BYTES` is enforced through `bodyText.length`,
which counts UTF-16 units. The audit records both sizes and tests the actual
boundary. The 64/512/4 string/array/depth limits and `SNAP_KEYS` sanitize values
after signature verification. They do not reject an otherwise valid object.
The specific rejection branches are demonstrated above, but none has been
observed on an actual failing production request in this lane.

## Release history

Read-only `git show` comparisons covered all 60 first-parent revisions from
v475 (`6eb45e81`, before the requested release batch) through v527 (`f586e9d3`),
including the releases named in the work order and intervening unversioned
commits. Each source slice below has exactly one distinct SHA-256 across all
60 revisions. This checks intermediate revisions, not just matching endpoints.

| Exact source slice | SHA-256 |
| --- | --- |
| Client body serialization, timestamp, key import call and signature construction inside `signedFetch` | `ce9a1f39b0c5b526962d123b966abf183564366b0c2e0a51cc5970200dc96651` |
| Server `verifySigned`, through the routes marker | `f2b743298197455f7053e5180efee5b8b7723b9d50af3cae18e6327d6f570a52` |
| Complete `PUT /profile` route, through the backup-route comment | `4c6215f0e86137e72dcdf64c5ece86ff63b4485a39f24f8588b7f09245806e57` |
| `SNAP_KEYS` through the end-snapshot-bounds marker | `1f02a9bd75315f40438a83d70344e87e30a490cbd4bef15b85242ad1b444d151` |

The signing-key import, signature base64 encoder, server replay-claim function,
profile rate-limit definition, and numeric bounds were also unchanged across
these revisions. v485 adds optional fetch options for the backup page-hide
keepalive path. The profile call supplies no such options; its canonical
message remains `METHOD\nPATH\nTS\nBODY`, encoded as UTF-8 for ECDSA P-256/SHA-256.
Commit timestamps are repository metadata, not proof of deployment times or
of the deployed Worker version.

## Changes and proof

Changed tracked-source files:

- `tests/sync-authpath-audit.mjs`: the Node diagnostic and rejection controls.
- `tests/release-gate.mjs`: registers that audit in `PURE`.
- `docs/sync-authpath.md`: this diagnosis, proof and limitations.

An ignored `node_modules/esprima` directory was populated with pinned version
4.0.1 from the local npm cache. Its archive was checked against the SHA-512 in
`package-lock.json`. No manifest or lockfile changed.

Proof output:

```text
node tests/unit.test.js
377 passed, 0 failed
exit 0

node tests/sync-authpath-audit.mjs
MEASURE mature body: 4142 UTF-16 units, 4142 UTF-8 bytes
MEASURE catalogue body: 388 gear ids, 9632 UTF-16 units
MEASURE canonical mutation: child exit 1, MATURE rejected with 401 bad signature
sync-authpath: 18 passed, 0 failed
exit 0

PURE: 124/124 exited 0

node tests/release-gate.mjs --coverage-only
coverage: 375 audits on disk, 122 fast, 129 full, 124 skipped
exit 0

git diff --check
exit 0
```

The gate's complete `PURE` array, including its push/unshift additions, was
evaluated without executing the gate's socket-binding startup. Each entry ran
as a separate Node process from this checkout. The unit proof ran separately
under the exact agreed command. Initial results were 120 entries exiting 0
and four exiting 97 for missing `esprima`: `store-copy-lint.mjs`,
`store-runtime-audit.mjs`, `submission-build-audit.mjs`, and
`submission-preflight-audit.mjs`. All four exited 0 after the verified offline
dependency restoration. The new diagnostic was rerun after stabilizing its
fixture clock and also exited 0. SQLite's experimental warning and the
Worker's missing-secret log are expected in this deliberately secret-free
in-process fixture; neither prevented the profile write.

Raw logs, the exact PURE inventory, per-entry exit receipts, and the 60-revision
hash matrix are in `/private/tmp/sync-authpath-proof/`. These are local review
artifacts outside the checkout, not committed deliverables.

## Denied actions, deviations and limits

1. The plan both requests `wrangler dev` and forbids binding sockets. This
   conflict was disclosed before implementation. The substitute is the real
   handler in Node with SQLite, not a listening local Worker. It does not prove
   workerd behavior, WebKit behavior, browser preflight execution, network
   delivery, the deployed code version, or production D1 schema/data parity.
   The adapter follows the relevant [D1 batch transaction contract](https://developers.cloudflare.com/d1/worker-api/d1-database/).
   [Workers Web Crypto documentation](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
   was consulted for the runtime review; actual test execution used Node crypto.
2. A production RED reproduction was not found, so no outage fix or genuine
   production RED-to-GREEN claim is made. The permanent audit instead launches
   an isolated child with one asserted in-memory canonical-path mutation. That
   child fails the normal acceptance checks with 401 and exit 1; unmodified
   source passes. This validates the guard's sensitivity, not an outage cause.
3. `npm pack esprima@4.0.1 --offline` first failed with `ENOTCACHED`. A second
   offline pack using the cached tarball URL was denied with `EPERM` when npm
   attempted `mkdtemp` under `/Users/tommiller/.npm/_cacache/tmp`. No permission
   escalation or cache ownership change was attempted. Read-only retrieval of
   the lockfile-verified archive followed by extraction into this checkout
   resolved the dependency without another write to that cache.
4. No sockets were bound. No Worker deployment, remote Wrangler command,
   production D1 write, secret setting, commit, push, PR or publication was
   attempted. `native/ASC-SUBMISSION.md` and other checkouts were not edited.

The client still discards important evidence: `syncProfile` returns `false`
on HTTP failure, while `autoSync` ignores that boolean and can stamp a completed
attempt after `pullGrants` returns. Its outer catch also hides exceptions.
Those observations explain why refusal evidence could disappear, but do not
establish the outage's cause. They were not changed as an unproven auth fix.
The next discriminating evidence is an actual failed attempt's hop and response
status/body, or confirmation that it never reaches the transport. A deployed
runtime/schema mismatch also remains outside this reproduction's reach.
