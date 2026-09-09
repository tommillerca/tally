# P1 merge advisory report

F01, F02 and F03 pass the exercised regressions. This is advisory evidence for independent review, not a certification of browser or real-device behavior.

Frozen plan SHA256 verified: `118631004ead4b6f70dd0a1ce3c2914d9c630797781ebc1ce7abf8066ace3d23`. All source paths were resolved inside this checkout. No original checkout was edited.

## Files changed

| File | Change |
| --- | --- |
| `js/db.js` | Atomic history for ingredients, potions, pantry, food buffs and diary mutations. Signed count deltas preserve independent earnings and spending. Causal diary versions and tombstones preserve corrections and deletions. Export seeds legacy baselines. Import validates and merges under its existing transaction lock; ambiguous or damaged histories abort the entire import. Explicit replacement remains available. |
| `tests/p1-merge-audit.mjs` | New runnable regression audit with 19 checks using the real importer and cooking writers over in-memory IndexedDB. |
| `tests/release-gate.mjs` | Registers the new audit in PURE. |
| `tests/unit.test.js` | Runs the new audit and checks its success and replacement control. |
| `tests/backup-conflict-audit.mjs` | Forks a real second test database with the same encryption key. Deleting A's diary now creates a real tombstone, so deletion cannot stand in for constructing B. |
| `tests/backup-version-audit.mjs` | Builds the healthy current-version control through real writes and export, keeping diary rows consistent with their history. |
| `tests/dayone-topup-audit.mjs` | Makes test UUIDs unique independently of the seeded payout RNG. The old pre-seed stub returned the same UUID repeatedly. |
| `tests/device-loss-audit.mjs` | Excludes new merge metadata from the incident's player-record count. Retains the original loss, recovery and payout assertions. |
| `tests/silence-disclosure-audit.mjs` | Adds a non-completing read request to its held-transaction double, preserving its interrupted-write scenario. |
| `tests/p1-merge-report.md` | This advisory report and proof output. |

Ignored local test dependency: copied pinned `esprima` 4.0.1 into `node_modules/esprima/` from an existing temporary copy. No dependency manifest or lockfile changed.

## Red before implementation

Command: `node tests/p1-merge-audit.mjs`. Exit 1 on the original `js/db.js`, before any production edit. These original five checks remain in the final audit. Exact output:

```text
FAIL F01 stale merge retains marrow, Feast and spent buff charge: expected marrow/pantry/charges [6,1,1], got [1,0,2]
FAIL F02 deletion survives stale diary merge: deleted 100-kcal meal was resurrected
FAIL F02 correction survives stale diary merge: expected corrected 250 kcal, got 100
FAIL F03 independent same-potion grants survive replay and spending: expected 3 Vital Tonics, got 2
PASS CONTROL replacement intentionally rolls back and distinct meals merge
P1 MERGE: 1 passed, 4 failed
```

## Final green proof

Agreed command: `node tests/unit.test.js`. Exit 0. Exact output:

```text
374 passed, 0 failed
```

Regression command: `node tests/p1-merge-audit.mjs`. Exit 0. Exact output:

```text
PASS F01 stale merge retains marrow, Feast and spent buff charge
PASS F02 deletion survives stale diary merge
PASS F02 correction survives stale diary merge
PASS F03 independent same-potion grants survive replay and spending
PASS CONTROL replacement intentionally rolls back and distinct meals merge
PASS F01 independent ingredient credits and debits join in both directions
PASS F01 conflicting pantry branches refuse every store without losing either dish
PASS F02 remote deletion propagates; concurrent edit/delete refuses atomically
PASS F02 causal edits work with a backwards clock and survive a fresh restore
PASS F02 all diary mutation primitives retain tombstones and edits
PASS F03 duplicate grants are counted once across repeated bidirectional exchange
PASS F03 overspent offline inventory refuses the entire import
PASS CONTROL malformed history and ambiguous legacy resources refuse without mutation
PASS CONTROL aborted multi-resource payout retains balances and histories
PASS CONTROL partial replacement without kv retires obsolete diary history
PASS CONTROL malformed diary put cannot become a clear operation
PASS CONTROL failed import rolls back staged records and merged history
PASS CONTROL legacy equal potion counts refuse instead of concealing missing grants
PASS CONTROL import and queued potion earnings serialize under one transaction lock
P1 MERGE: 19 passed, 0 failed
```

Every PURE entry was executed as a separate Node process, including the unit command. All 109 exited 0. The release-gate module itself was not executed because its normal path starts a server. Exact per-entry output is included below.

`git diff --check` exited 0 with no output.

Proof source SHA256:

- `js/db.js`: `ed76eeecede8b5f69985292b9c6568b8996bd2c99936806b6c462af7c3b1b95f`
- `tests/p1-merge-audit.mjs`: `f501cb0a3522000221080a08610a1b275dd6409c8dc3427887ef221f398c47bf`

## Blocked actions, limitations and deviations

- No commit, push, PR, publish, deployment, remote Wrangler, production D1 write or secret-setting action was attempted. No approval denial occurred. `native/ASC-SUBMISSION.md` was not touched.
- Browser and server proofs were not attempted because socket binding is prohibited. Actual cloud timing, physical-device exchange and browser IndexedDB durability remain unverified. The encrypted backup retry audit uses an in-memory API peer.
- The first broad run had four dependency checks exit 97 because `esprima` was missing. Restoring the pinned local dependency resolved all four. No proof remains blocked.
- Five existing test fixtures required the adjustments listed above, beyond adding the new audit and its two runner registrations. No production source outside `js/db.js` changed, and no existing outcome assertion was weakened to accept lost progress.
- Missing historical information cannot be reconstructed. In particular, a diary deletion made before receipts existed is indistinguishable from a meal this device has never seen when importing a legacy save. That retrospective case is not fixed or certified. Proposed recovery is retaining both old backups for manual reconciliation, rather than inventing their history.
- For detectable ambiguity, the implemented recovery policy is atomic refusal with an error telling the caller that the local save is unchanged and both saves must be retained. This includes concurrent pantry/buff branches, concurrent diary edits or edit/delete conflicts, incompatible legacy resource counts, and combined offline spending that exceeds the shared balance. The importer does not automatically resolve these cases or provide a new reconciliation UI.
- Histories are intentionally unpruned so old offline snapshots cannot replay removed receipts. Backup size grows with recorded mutations; compaction needs a separate device-acknowledgement protocol.

## PURE execution output

```text
PASS version-align-lint.mjs exit=0
PASS no-debug-markers-lint.mjs exit=0
PASS store-copy-lint.mjs exit=0
PASS p1-merge-audit.mjs exit=0
PASS lab-room2-audit.mjs exit=0
PASS stable-stale-disclosure-audit.mjs exit=0
PASS breed-last-colour-audit.mjs exit=0
PASS stable-loss-disclosure-audit.mjs exit=0
PASS lab-health-recovery-audit.mjs exit=0
PASS lab-integration-audit.mjs exit=0
PASS lab-ui-audit.mjs exit=0
PASS laboratory-audit.mjs exit=0
PASS lab-foundation-audit.mjs exit=0
PASS pet-stress-guard.mjs exit=0
PASS crew-pet-node-guard.mjs exit=0
PASS transmog-receipt-audit.mjs exit=0
PASS today-reads-lint.mjs exit=0
PASS kitchen-atomic-audit.mjs exit=0
PASS backup-encoder-audit.mjs exit=0
PASS backup-key-audit.mjs exit=0
PASS backup-version-audit.mjs exit=0
PASS backup-conflict-audit.mjs exit=0
PASS unit.test.js exit=0
PASS log-xp-farm-audit.mjs exit=0
PASS drip-badge-audit.mjs exit=0
PASS xp-key-provenance-lint.mjs exit=0
PASS facegate-audit.mjs exit=0
PASS garden-appetite-guard.mjs exit=0
PASS pit.test.js exit=0
PASS quest-daymore-audit.mjs exit=0
PASS quest-pick-audit.mjs exit=0
PASS first-fight-audit.mjs exit=0
PASS stat-source-audit.mjs exit=0
PASS bastions-rep-sim.mjs exit=0
PASS analytics-tag-audit.mjs exit=0
PASS icon-inventory-audit.mjs exit=0
PASS version-stamp-audit.mjs exit=0
PASS boneyard-supply-audit.mjs exit=0
PASS loot-fallback-audit.mjs exit=0
PASS guard-hygiene-lint.mjs exit=0
PASS guard-provenance-lint.mjs exit=0
PASS feedback-status-lint.mjs exit=0
PASS rack-theme-lint.mjs exit=0
PASS rack-rotate-audit.mjs exit=0
PASS pet-accessory-lint.mjs exit=0
PASS pet-pool-audit.mjs exit=0
PASS manifest-exports-audit.mjs exit=0
PASS xp-curve-audit.mjs exit=0
PASS live-api-register-lint.mjs exit=0
PASS claim-evidence-lint.mjs exit=0
PASS thumb-freshness-lint.mjs exit=0
PASS render-sink-lint.mjs exit=0
PASS lapse-witness-audit.mjs exit=0
PASS spawn-claim-atomic-audit.mjs exit=0
PASS wardrobe-family-audit.mjs exit=0
PASS football-kit-audit.mjs exit=0
PASS restore-latch-audit.mjs exit=0
PASS first-pet-audit.mjs exit=0
PASS recovery-status-audit.mjs exit=0
PASS currency-revision-lint.mjs exit=0
PASS inv-tombstone-audit.mjs exit=0
PASS take-and-pay-audit.mjs exit=0
PASS pet-morph-animation-audit.mjs exit=0
PASS pet-palette-audit.mjs exit=0
PASS fontscale-audit.mjs exit=0
PASS wheel-easing-audit.mjs exit=0
PASS storage-boot-audit.mjs exit=0
PASS crate-cadence-audit.mjs exit=0
PASS silence-disclosure-audit.mjs exit=0
PASS health-disclosure-audit.mjs exit=0
PASS paddock-pack-audit.mjs exit=0
PASS numbers-honesty-audit.mjs exit=0
PASS locale-numbers-audit.mjs exit=0
PASS audit-output-audit.mjs exit=0
PASS branch-graveyard-audit.mjs exit=0
PASS store-runtime-audit.mjs exit=0
PASS r47-rest-audit.mjs exit=0
PASS r47-economy-audit.mjs exit=0
PASS submission-build-audit.mjs exit=0
PASS harness-environment-audit.mjs exit=0
PASS guard-debts-audit.mjs exit=0
PASS submission-preflight-audit.mjs exit=0
PASS pet-state-audit.mjs exit=0
PASS pet-family-audit.mjs exit=0
PASS crew-pet-audit.mjs exit=0
PASS coins-merge-tie-audit.mjs exit=0
PASS routine-race-audit.mjs exit=0
PASS dayone-topup-audit.mjs exit=0
PASS dish-worth-audit.mjs exit=0
PASS pet-C-node-guard.mjs exit=0
PASS r48-state-audit.mjs exit=0
PASS r46-logging-audit.mjs exit=0
PASS r46-diary-audit.mjs exit=0
PASS zero-calorie-seam-audit.mjs exit=0
PASS audit-completion-audit.mjs exit=0
PASS machine-character-audit.mjs exit=0
PASS n3-deadpaths-audit.mjs exit=0
PASS m5-prove-red.mjs exit=0
PASS lookup-guard-lint.mjs exit=0
PASS restore-state-audit.mjs exit=0
PASS restore-debt-edges-audit.mjs exit=0
PASS restore-debt-audit.mjs exit=0
PASS p1-r48-rest-audit.mjs exit=0
PASS pet-a11y-audit.mjs exit=0
PASS kennel-copy-audit.mjs exit=0
PASS breed-lock-audit.mjs exit=0
PASS device-loss-audit.mjs exit=0
PASS multidevice-earnings-audit.mjs exit=0
PASS response-bodies-audit.mjs exit=0
PURE: 109/109 passed, 0 failed
```

The runner used the exact PURE declaration and its push/unshift registrations without importing the server-starting gate. Reproduce from this checkout root:

```sh
mkdir -p /tmp/p1-pure-results
node --input-type=commonjs <<'JS'
const fs = require('node:fs'), vm = require('node:vm'), cp = require('node:child_process');
const source = fs.readFileSync('tests/release-gate.mjs', 'utf8');
const names = vm.runInNewContext(source.slice(source.indexOf('const PURE ='), source.indexOf('const BROWSER =')) + '\nPURE');
let failed = 0;
for (const name of names) {
  const run = cp.spawnSync(process.execPath, ['tests/' + name], { encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
  fs.writeFileSync('/tmp/p1-pure-results/' + name + '.log', (run.stdout || '') + (run.stderr || '') + (run.error ? '\n' + run.error : ''));
  console.log(`${run.status === 0 ? 'PASS' : 'FAIL'} ${name} exit=${run.status}${run.signal ? ' signal=' + run.signal : ''}`);
  if (run.status !== 0) failed++;
}
console.log(`PURE: ${names.length - failed}/${names.length} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
JS
```
