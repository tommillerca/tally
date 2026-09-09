# Store audit dependency proof

Advisory implementation report for independent review. No commit, push or publication.

Frozen work order SHA256 verified before changes:
`78808bbb3b8ba54be5ffcf2eaf67b6f8ee0c008d10e09753d5b820a2080f61b2`.

## Changes

Missing prerequisites print the existing `UNPRV ... DID NOT RUN:` protocol and exit 97. The release gate's classifier and reason formatter are unchanged. The lifecycle receipt reports UNPROVEN, one unproven row and zero failed rows. Package resolution is checked separately from loading: installed package syntax errors, runtime exceptions, broken entry points and missing internal/transitive modules remain RED. Python import errors other than the explicitly missing requested package remain RED too.

Esprima 4.0.1 is now a direct devDependency, using the version already in the lockfile. The shared scanner handles both the copy lint and native submission preflight. Submission audits check Esprima before launching assertion fixtures. The build fixture copies the new helper alongside its scanner. Existing assertions and positive controls are retained.

Files changed (paths relative to this checkout):

- [package.json](../package.json)
- [package-lock.json](../package-lock.json)
- [tests/lib/audit-dependencies.mjs](../tests/lib/audit-dependencies.mjs)
- [tests/lib/audit-dependencies.test.mjs](../tests/lib/audit-dependencies.test.mjs)
- [tests/store-copy-scan.mjs](../tests/store-copy-scan.mjs)
- [tests/store-runtime-audit.mjs](../tests/store-runtime-audit.mjs)
- [tests/submission-build-audit.mjs](../tests/submission-build-audit.mjs)
- [tests/submission-preflight-audit.mjs](../tests/submission-preflight-audit.mjs)
- [tests/facegate-audit.mjs](../tests/facegate-audit.mjs)
- [tests/thumb-freshness-lint.mjs](../tests/thumb-freshness-lint.mjs)
- [tests/unit.test.js](../tests/unit.test.js)
- [docs/store-red-proof.md](../docs/store-red-proof.md)

## Dependency inventory

Reviewed all 96 PURE entries from `tests/release-gate.mjs`, their local imports and subprocess targets. Found **2 additional affected audits**, for **6 total**. The additional traps were facegate's exit 2 on absent Pillow/numpy (the gate treats 2 as RED), and thumbnail freshness's five false failed rows on absent Pillow. Both now use UNPROVEN with installation instructions. Missing Python executables are also disclosed.

The remaining 90 entries had no additional third-party package trap. Imports of godmode in PURE code use its Node helpers; Puppeteer loads lazily and is not needed by those paths. No browser, network service or native producer was invoked for this review. Host shell commands used by the store fixtures were inspected; native platform commands in submission-build are local fixture executables.

| PURE entry with package prerequisite | Prerequisite |
| --- | --- |
| `store-copy-lint.mjs` | esprima through store-copy-scan.mjs |
| `store-runtime-audit.mjs` | esprima |
| `submission-build-audit.mjs` | esprima through child native preflight |
| `submission-preflight-audit.mjs` | esprima through child native preflight |
| `facegate-audit.mjs` | Python 3, Pillow, numpy |
| `thumb-freshness-lint.mjs` | Python 3, Pillow through build-bh-thumbs.py |

## Before and after

Before runs used unmodified source from this checkout. Store audits initially ran with no `node_modules`. Present runs used the real Esprima 4.0.1 tarball from the existing local npm cache, verified against the lockfile SHA512 integrity. No network fetch occurred. The temporary package was removed from the checkout afterward.

Python absence was measured with a real `venv --without-pip`, selected using `PYTHON` for facegate and `PATH` for thumbnail freshness. Baseline Python audits were copied from this checkout's HEAD into a temporary directory with read-only source links. Pillow absence was measured first; exposing only the locally installed Pillow to that venv then measured numpy absence separately. Present runs used the existing host Python packages.

| Audit | Before absent | After absent | Before present | After present |
| --- | --- | --- | --- | --- |
| store-copy-lint.mjs | 1, RED | 97, UNPROVEN | 0, PASS | 0, PASS |
| store-runtime-audit.mjs | 1, RED | 97, UNPROVEN | 0, PASS | 0, PASS |
| submission-build-audit.mjs | 1, RED | 97, UNPROVEN | 0, PASS | 0, PASS |
| submission-preflight-audit.mjs | 1, RED | 97, UNPROVEN | 0, PASS | 0, PASS |
| facegate-audit.mjs, Pillow absent | 2, RED | 97, UNPROVEN | 0, PASS | 0, PASS |
| facegate-audit.mjs, numpy absent | 2, RED | 97, UNPROVEN | 0, PASS | 0, PASS |
| thumb-freshness-lint.mjs | 1, RED | 97, UNPROVEN | 0, PASS | 0, PASS |

Representative before output:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'esprima'
FAIL  HEALTHY  a correct store bundle passes  exit 1 (want 0)
ModuleNotFoundError: No module named 'PIL'
thumb freshness: 5 FAILED
```

After output, shared by each of the four store audits:

```text
UNPRV esprima  DID NOT RUN: missing dependency esprima. Install from this checkout root: npm ci --include=dev
```

With the gate's lifecycle preload, the copy lint also emitted:

```text
AUDIT END store-copy-lint.mjs: UNPROVEN; NORMAL EXIT (row coverage undeclared); rows=1/undeclared; failed=0; unproven=1; exit=97
```

Python diagnostics:

```text
UNPRV Pillow  DID NOT RUN: missing dependency Pillow. Install for the audit interpreter: "python3" -m pip install Pillow
UNPRV numpy  DID NOT RUN: missing dependency numpy. Install for the audit interpreter: "/tmp/store-red-proof/python-empty/bin/python3" -m pip install Pillow numpy
```

Present-dependency output:

```text
ok store copy: beta surfaces unreachable and store strings clean
store runtime: 13/13 passed
ok submission build: explicit modes, separate artifacts, copied and archived content guarded (fixture tools only)
submission preflight: refuses marker, flag, server and copy defects; passes the control
facegate clean
thumb freshness: clean
```

## Agreed proof and regression controls

Command: `node tests/unit.test.js`

```text
371 passed, 0 failed
```

Exit 0, including a final run with no `node_modules`. The new unit case executes all four store entry points without Esprima, the gate's actual classifier and reason formatter, a healthy installed fixture package, broken installed package controls, and Python probe failure controls. It needs neither Esprima nor Python installed.

Additional checks:

```text
guard-hygiene: clean
audit-output: 8 passed, 0 failed
audit-completion: 18/18 passed, 0 FAILED
coverage: 346 audits on disk, 121 fast, 129 full, 96 skipped
```

Each exited 0. `git diff --check` passed. Coverage was run with `node tests/release-gate.mjs --coverage-only`; the full release gate was not run. Raw local execution logs are retained at `/tmp/store-red-proof/`.

## Denied or blocked actions and deviations

Denied or blocked actions: none. Deviations from the work order: none. No source checkout outside this checkout was edited. No parser was vendored, no network fetch was added or performed, and no assertion was weakened. No commit, push, upload or publication was performed. The native build audit exercised only its existing local fixture tools.

## Complete PURE inventory reviewed

`package` identifies the six entries listed above. All other entries use Node built-ins and checked-in modules in their PURE execution paths.

```text
version-align-lint.mjs
no-debug-markers-lint.mjs
store-copy-lint.mjs  [package]
pet-stress-guard.mjs
crew-pet-node-guard.mjs
transmog-receipt-audit.mjs
today-reads-lint.mjs
kitchen-atomic-audit.mjs
backup-encoder-audit.mjs
backup-key-audit.mjs
backup-version-audit.mjs
backup-conflict-audit.mjs
unit.test.js
log-xp-farm-audit.mjs
drip-badge-audit.mjs
xp-key-provenance-lint.mjs
facegate-audit.mjs  [package]
garden-appetite-guard.mjs
pit.test.js
quest-daymore-audit.mjs
quest-pick-audit.mjs
first-fight-audit.mjs
stat-source-audit.mjs
bastions-rep-sim.mjs
analytics-tag-audit.mjs
icon-inventory-audit.mjs
version-stamp-audit.mjs
boneyard-supply-audit.mjs
loot-fallback-audit.mjs
guard-hygiene-lint.mjs
guard-provenance-lint.mjs
feedback-status-lint.mjs
rack-theme-lint.mjs
rack-rotate-audit.mjs
pet-accessory-lint.mjs
pet-pool-audit.mjs
manifest-exports-audit.mjs
xp-curve-audit.mjs
live-api-register-lint.mjs
claim-evidence-lint.mjs
thumb-freshness-lint.mjs  [package]
render-sink-lint.mjs
lapse-witness-audit.mjs
spawn-claim-atomic-audit.mjs
wardrobe-family-audit.mjs
football-kit-audit.mjs
restore-latch-audit.mjs
first-pet-audit.mjs
recovery-status-audit.mjs
currency-revision-lint.mjs
inv-tombstone-audit.mjs
take-and-pay-audit.mjs
fontscale-audit.mjs
wheel-easing-audit.mjs
storage-boot-audit.mjs
crate-cadence-audit.mjs
silence-disclosure-audit.mjs
health-disclosure-audit.mjs
paddock-pack-audit.mjs
numbers-honesty-audit.mjs
locale-numbers-audit.mjs
audit-output-audit.mjs
branch-graveyard-audit.mjs
store-runtime-audit.mjs  [package]
r47-rest-audit.mjs
r47-economy-audit.mjs
submission-build-audit.mjs  [package]
harness-environment-audit.mjs
guard-debts-audit.mjs
submission-preflight-audit.mjs  [package]
pet-state-audit.mjs
pet-family-audit.mjs
crew-pet-audit.mjs
coins-merge-tie-audit.mjs
routine-race-audit.mjs
dayone-topup-audit.mjs
dish-worth-audit.mjs
pet-C-node-guard.mjs
r48-state-audit.mjs
r46-logging-audit.mjs
r46-diary-audit.mjs
zero-calorie-seam-audit.mjs
audit-completion-audit.mjs
machine-character-audit.mjs
n3-deadpaths-audit.mjs
m5-prove-red.mjs
lookup-guard-lint.mjs
restore-state-audit.mjs
restore-debt-edges-audit.mjs
restore-debt-audit.mjs
p1-r48-rest-audit.mjs
pet-a11y-audit.mjs
kennel-copy-audit.mjs
breed-lock-audit.mjs
device-loss-audit.mjs
multidevice-earnings-audit.mjs
```
