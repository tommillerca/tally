R3 frozen work order: advisory implementation report

Plan SHA256 verified: `54cb312e6b7cde690743a035eb63e28c143c7d9473b06ffb6d876bab384af726`.
Baseline: checkout HEAD and local `origin/main` both `07384c7af486fb421f3bbad0889ad9daa71dc3da`. All implementation paths were resolved inside this checkout.

Files changed:

| File | Change |
| --- | --- |
| `js/social.js` | Backup probe reads the body, requires a blob, decrypts it and calls the existing import validator. Unreadable or invalid responses return unknown. No backup is imported by the probe. |
| `js/app.js` | Honest unknown-backup copy; understandable Laboratory replacement refusal at preview and commit; stronger destruction gate; removed unreachable Stable filter, warning and unused import. |
| `js/pets.js` | Current accounting comment: 6 species x 6 morphs = 36 pairs. |
| `tests/r3-rest-audit.mjs` | New 11-check Node regression audit using production handlers, AES-GCM, real validators and in-memory storage. |
| `tests/release-gate.mjs` | Registers the new audit in PURE. |
| `tests/stable-loss-disclosure-audit.mjs` | Named/bonded pet now requires typed confirmation; all loss assertions remain. |
| `tests/kennel-copy-audit.mjs` | Plain-spare fixture is unequipped, isolating each gate condition. Equipped-only coverage lives in the new audit. |
| `tests/m5-prove-red.mjs` | Retargets the scanner's negative control after removal of its obsolete Stable source anchor. Failing mutations and restored green checks still run. |
| `docs/reviews/r3-rest-proof.md` | This advisory report and proof receipts. |

Decisions and deviations:

- R3-6 payload premise does not hold in this baseline. The profile's Visit their paddock callback already renders `yard.pets` with species, morph, shiny and shared wardrobe data. The payload is retained because it has a live consumer. Its production-handler control passes against both baseline and fixed source. No Worker or wire format change was needed.
- The unreachable Stable guard and warning were removed. `petInstances()` remains the authoritative known-species filter, retaining unsupported rows in storage. The new audit verifies both properties.
- R3-5 also escalates for chosen talents and equipped status, as required by the instruction to match every disclosed loss. Existing training, lineage, shiny and last-copy escalation remains.
- No other requirement deviations. Refusals and loss disclosures were preserved.

Denied or blocked actions: none remain. No commit, push, PR, publication, Worker deployment, remote Wrangler command, production D1 write or secret change was performed. `native/ASC-SUBMISSION.md` is unchanged.

Local setup: the first PURE pass reported missing esprima (exit 97). All 98 pinned dependencies were available in the local npm cache and were installed offline with scripts disabled. Package manifests and lockfile are unchanged. Three other initial failures were the two old light-gate fixtures and the new audit's lowercase control labels; these were corrected without weakening production protections. The M5 source mutation was updated for the removed dead guard. Every affected check was rerun successfully.

Proof method: the audit first ran on the untouched baseline before production edits. The final audit was also run against a throwaway `git archive origin/main` containing js, data, package.json and the memory-storage harness, with the new audit copied in. Both baseline runs exited 1. The friend payload control was already green; both other R3-6 checks were red.

Final agreed command:

```text
$ node tests/unit.test.js
378 passed, 0 failed
exit 0
```

All 137 PURE entries were enumerated from the release gate, including its push/unshift additions, and run directly with Node. The initial full pass was followed by successful reruns of affected entries. Each final exit is recorded below. Tests used local fixtures and subprocesses; no browser pixel, native device or deployed-server verification is claimed.

Baseline output (exit 1):

```text
R3-8 witness: hasCloudBackup=true; erase copy=A cloud backup <b>does</b> exist for this account and can be restored later with your recovery code.
FAIL R3-8 bare ok body cannot reassure before erase: Expected values to be strictly equal:

true !== null

FAIL R3-8 CONTROL: valid encrypted save, malformed body, unreadable save and HTTP outcomes: null

true !== null

R3-4 witness: Import failed: laboratory-restore-conflict
FAIL R3-4 refused replacement explains protection and next step without changing save: The input was expected to not match the regular expression /laboratory-restore-conflict/. Input:

'Import failed: laboratory-restore-conflict'

FAIL R3-5 nickname alone requires typed destruction: Only the light gate opened
FAIL R3-5 bond alone requires typed destruction: Only the light gate opened
FAIL R3-5 talents alone requires typed destruction: Only the light gate opened
FAIL R3-5 equipped alone requires typed destruction: Only the light gate opened
PASS R3-5 CONTROL: uninvested duplicate keeps two-tap confirmation
FAIL R3-6 remove unreachable Stable guard; authority still filters unsupported rows: Unreachable Stable filter/warning remains
FAIL R3-6 morph accounting comment matches six morphs and 36 pairs: Comment still claims five morphs / 30 pairs
PASS R3-6 CONTROL: retained friend payload actually reaches paddock renderer
R3 rest: 2 passed, 9 failed
```

Fixed audit output (exit 0):

```text
R3-8 witness: hasCloudBackup=null; erase copy=The cloud backup could not be verified, so no vault copy can be confirmed. Treat this as the only copy.
PASS R3-8 bare ok body cannot reassure before erase
PASS R3-8 CONTROL: valid encrypted save, malformed body, unreadable save and HTTP outcomes
R3-4 witness: Restore blocked: this backup is missing or conflicts with Laboratory experiments or incubator purchases on this device. This protects pets and purchases from being undone or duplicated. Your current save is unchanged. Choose a newer backup that includes those records.
PASS R3-4 refused replacement explains protection and next step without changing save
PASS R3-5 nickname alone requires typed destruction
PASS R3-5 bond alone requires typed destruction
PASS R3-5 talents alone requires typed destruction
PASS R3-5 equipped alone requires typed destruction
PASS R3-5 CONTROL: uninvested duplicate keeps two-tap confirmation
PASS R3-6 remove unreachable Stable guard; authority still filters unsupported rows
PASS R3-6 morph accounting comment matches six morphs and 36 pairs
PASS R3-6 CONTROL: retained friend payload actually reaches paddock renderer
R3 rest: 11 passed, 0 failed
```

Final PURE receipts:

```text
version-align-lint.mjs: exit 0
no-debug-markers-lint.mjs: exit 0
store-copy-lint.mjs: exit 0
r3-rest-audit.mjs: exit 0
sync-observability-audit.mjs: exit 0
sync-identity-audit.mjs: exit 0
sync-native-audit.mjs: exit 0
lab-density-audit.mjs: exit 0
crew-outfit-audit.mjs: exit 0
dock-line-audit.mjs: exit 0
whatsnew-boot-audit.mjs: exit 0
wardrobe-noise-audit.mjs: exit 0
sync-clientpath-audit.mjs: exit 0
sync-authpath-audit.mjs: exit 0
sync-path-audit.mjs: exit 0
wardrobe-playtest-audit.mjs: exit 0
lab-room2-audit.mjs: exit 0
stable-stale-disclosure-audit.mjs: exit 0
breed-last-colour-audit.mjs: exit 0
stable-loss-disclosure-audit.mjs: exit 0
lab-health-recovery-audit.mjs: exit 0
lab-integration-audit.mjs: exit 0
lab-ui-audit.mjs: exit 0
laboratory-audit.mjs: exit 0
lab-foundation-audit.mjs: exit 0
pet-stress-guard.mjs: exit 0
crew-pet-node-guard.mjs: exit 0
transmog-receipt-audit.mjs: exit 0
today-reads-lint.mjs: exit 0
kitchen-atomic-audit.mjs: exit 0
backup-encoder-audit.mjs: exit 0
backup-key-audit.mjs: exit 0
backup-version-audit.mjs: exit 0
backup-conflict-audit.mjs: exit 0
unit.test.js: exit 0
log-xp-farm-audit.mjs: exit 0
drip-badge-audit.mjs: exit 0
xp-key-provenance-lint.mjs: exit 0
facegate-audit.mjs: exit 0
garden-appetite-guard.mjs: exit 0
pit.test.js: exit 0
quest-daymore-audit.mjs: exit 0
quest-pick-audit.mjs: exit 0
first-fight-audit.mjs: exit 0
stat-source-audit.mjs: exit 0
bastions-rep-sim.mjs: exit 0
analytics-tag-audit.mjs: exit 0
icon-inventory-audit.mjs: exit 0
version-stamp-audit.mjs: exit 0
boneyard-supply-audit.mjs: exit 0
loot-fallback-audit.mjs: exit 0
guard-hygiene-lint.mjs: exit 0
guard-provenance-lint.mjs: exit 0
feedback-status-lint.mjs: exit 0
rack-theme-lint.mjs: exit 0
rack-rotate-audit.mjs: exit 0
pet-accessory-lint.mjs: exit 0
pet-pool-audit.mjs: exit 0
manifest-exports-audit.mjs: exit 0
xp-curve-audit.mjs: exit 0
live-api-register-lint.mjs: exit 0
claim-evidence-lint.mjs: exit 0
thumb-freshness-lint.mjs: exit 0
render-sink-lint.mjs: exit 0
lapse-witness-audit.mjs: exit 0
spawn-claim-atomic-audit.mjs: exit 0
wardrobe-family-audit.mjs: exit 0
football-kit-audit.mjs: exit 0
restore-latch-audit.mjs: exit 0
first-pet-audit.mjs: exit 0
shop-economy-audit.mjs: exit 0
recovery-status-audit.mjs: exit 0
currency-revision-lint.mjs: exit 0
inv-tombstone-audit.mjs: exit 0
take-and-pay-audit.mjs: exit 0
pet-morph-animation-audit.mjs: exit 0
pet-palette-audit.mjs: exit 0
fontscale-audit.mjs: exit 0
wheel-look-audit.mjs: exit 0
wheel-easing-audit.mjs: exit 0
storage-boot-audit.mjs: exit 0
crate-cadence-audit.mjs: exit 0
silence-disclosure-audit.mjs: exit 0
health-disclosure-audit.mjs: exit 0
paddock-pack-audit.mjs: exit 0
numbers-honesty-audit.mjs: exit 0
locale-numbers-audit.mjs: exit 0
audit-output-audit.mjs: exit 0
branch-graveyard-audit.mjs: exit 0
store-runtime-audit.mjs: exit 0
r47-rest-audit.mjs: exit 0
r47-economy-audit.mjs: exit 0
submission-build-audit.mjs: exit 0
harness-environment-audit.mjs: exit 0
guard-debts-audit.mjs: exit 0
submission-preflight-audit.mjs: exit 0
pet-state-audit.mjs: exit 0
pet-family-audit.mjs: exit 0
crew-pet-audit.mjs: exit 0
coins-merge-tie-audit.mjs: exit 0
routine-race-audit.mjs: exit 0
dayone-topup-audit.mjs: exit 0
dish-worth-audit.mjs: exit 0
pet-C-node-guard.mjs: exit 0
r48-state-audit.mjs: exit 0
r46-logging-audit.mjs: exit 0
r46-diary-audit.mjs: exit 0
zero-calorie-seam-audit.mjs: exit 0
audit-completion-audit.mjs: exit 0
machine-character-audit.mjs: exit 0
n3-deadpaths-audit.mjs: exit 0
m5-prove-red.mjs: exit 0
lookup-guard-lint.mjs: exit 0
restore-state-audit.mjs: exit 0
restore-debt-edges-audit.mjs: exit 0
restore-debt-audit.mjs: exit 0
p1-r48-rest-audit.mjs: exit 0
pet-a11y-audit.mjs: exit 0
kennel-copy-audit.mjs: exit 0
breed-lock-audit.mjs: exit 0
device-loss-audit.mjs: exit 0
multidevice-earnings-audit.mjs: exit 0
response-bodies-audit.mjs: exit 0
p1-merge-audit.mjs: exit 0
quest-wheel-budget-audit.mjs: exit 0
kitchen-delivery-audit.mjs: exit 0
map-playtest-audit.mjs: exit 0
p1-dens-audit.mjs: exit 0
crew-yard-row-audit.mjs: exit 0
pet-rarity-audit.mjs: exit 0
stable-rooms-top-audit.mjs: exit 0
today-playtest-audit.mjs: exit 0
crew-playtest-audit.mjs: exit 0
firstrun-audit.mjs: exit 0
settings-safety-audit.mjs: exit 0
progress-playtest-audit.mjs: exit 0
leaderboard-honesty-audit.mjs: exit 0
PURE: 137/137 exited 0; complete enumeration=true
```
