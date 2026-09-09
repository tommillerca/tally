> Historical standalone lane report from `27ad9d7f`. Proof and denied actions below belong to that earlier lane run. See [the integration report](../sync-integrate.md) for current changes and proof.

# Sync identity advisory review

Plan SHA256 verified: `c6cdfa28bb636f06b1f2449b964173b35f43aaa22c6ef03feacccd9311c5ad05`.
All paths below are relative to this checkout. No original checkout was edited.

**Finding:** a failed registration can leave a valid local signing key with no
`social` record. A lost server reply can also leave a server account whose
profile has never been uploaded. Before this change, resume did not retry
registration. Full boot already retried, except when cloud backup was off.
This is a reproduced individual-player failure, not evidence explaining the
simultaneous stop across all players or the exact count of 43 null profiles.
No automatic fleet-wide identity deletion path was found.

## Writes, clears, and reachability

| Path | Evidence and result |
| --- | --- |
| Registration / Go Online | `js/social.js:530` (`goOnline`) obtains and persists identity before registration, then writes `social` at line 547. Called by onboarding completion, Crew and Settings buttons, recovery-code setup, and boot recovery. Network refusal, lost reply, invalid response, or a failed local social write can leave the key without the record. Normal onboarding can encounter this. The audit injects a lost reply and an incomplete response. |
| Display-name change | `js/social.js:620` rewrites `social` with the returned name. It does not intentionally clear the record. |
| Phrase / vault account adoption | `js/social.js:1650` (`adoptIdentity`) registers before writing identity and social. A registration failure leaves local identity untouched. Subsequent local writes are separate transactions, despite the comment claiming the swap lands whole. A storage failure between those writes can leave social absent on a fresh device, or stale on an existing one. The latter is a separate mismatched-account condition, not repaired by this missing-record fix. |
| File import | `js/app.js:22097` calls `importAll` with its default `replace:true`. `js/db.js:1339` includes identity and social in `DEVICE_KV`. At line 1510, replacement preserves local device keys omitted by the file. Clearing and reinserting happen in the same transaction at line 1683. An omitted social row does not disappear. Explicit incoming values, including null, take precedence on replacement. An explicit-null fixture reproduces that behavior; no normal social writer was found that emits null. This intentional replacement contract is preserved. |
| Backup merge / cloud restore | `importAll(..., {replace:false})` filters incoming device keys already held locally. Cloud replacement also preserves omitted device keys. Ordinary merge and replacement preservation are exercised over the real module. The v527 file handler delegates storage to this code; the v526 merge code does not clear existing social. |
| Cloud opt-out | `js/social.js:1812` writes only `cloudOff`. It does not remove either identity record. However, `bootSync` checks cloudOff before missing-social recovery. Existing public profile sync is independent of that opt-out. |
| Erase / account delete | `js/app.js:15374` and line 15419 first clear the native vault, then call `eraseAll`; account deletion requires server success before local cleanup. `js/db.js:1780` clears every store in one transaction. Both records disappear intentionally. These require explicit user action, not routine gameplay. The audit verifies erase cannot trigger resume registration without a surviving local key. |
| Other resets | The generic `db.clear` can clear kv, but no additional application call clearing it was found. No `deleteDatabase` or `deleteObjectStore` call was found in the inspected application/native sources. `useDbName` changes database selection, not stored contents. |

## Updates and player disclosure

`sw.js:479` deletes Cache Storage generations, not IndexedDB. The database
upgrade in `js/db.js:74` creates only missing stores, including kv; it does not
replace an existing store. `DB_VERSION` is 3. The current native configuration
keeps the app at `https://tommillerca.github.io/tally/`; no native storage wipe
on update was found. Thus these source update paths preserve social when the
origin/container is retained. Actual OS update and storage-eviction behavior
was not exercised. The memory IDB does not model version upgrades. Native vault
recovery stores the signing bundle, not social, and boot can re-register it.

Missing social renders a **Go Online** prompt in Crew (`js/app.js:12459`) and
Settings (`js/app.js:14985`). It does not put a persistent offline warning on
ordinary gameplay. Onboarding reports registration refusal via a toast; storage
write failures have the app's generic disclosure sink. Boot suppresses
`never-registered` and `opted-out` notices. Resume's catch remains silent on
failure. There is no new telemetry or UI in this lane.

## Change and proof

`autoSync` now retries registration when social is absent and both local signing
JWKs exist, using the existing idempotent `goOnline` path. Overlapping recovery
attempts within this module share a promise. No new key is minted for a fresh
install. A failed attempt remains retryable on the next lifecycle call. Backup
opt-out and profile throttling retain their existing behavior.

Files changed:

- `js/social.js`
- `tests/sync-identity-audit.mjs` (new)
- `tests/unit.test.js`
- `docs/reviews/sync-identity.md` (this report)

The focused audit uses `tests/mem-idb.mjs`, real db/social modules, real WebCrypto
keys and signature verification, and an in-process fetch stub restricted to
`https://identity.invalid`. It binds no socket and performs no real API request.
Before the production-code change, its final fixtures produced **5 passed,
4 failed**, with failures at missing-social recovery assertions. Afterward:

```text
node tests/sync-identity-audit.mjs
9 passed, 0 failed

node tests/unit.test.js

378 passed, 0 failed
```

Both final commands exited 0. `git diff --check` passed.

Denied/blocked actions: sandbox denied a read-only `ps` process-status check.
This did not block proof completion. An early audit process that retained a
Node BroadcastChannel was interrupted; the fixture now disables that browser
channel. Initial fixture setup errors were corrected before the red control.

Deviations: none. No Worker deployment, remote Wrangler, production D1 write,
secret operation, commit, push, PR, publication, or edit to
`native/ASC-SUBMISSION.md` was performed. Native update behavior is source-only
evidence. The fleet outage remains unexplained by this lane.
