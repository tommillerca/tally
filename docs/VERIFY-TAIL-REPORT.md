# Frozen verification-tail advisory report

Plan SHA256 verified: `ea8cec441281d77d9c837a95e927d99aeb4bfa7c82d587972d96d959ae54d617`.

Items 1, 2, 3 and 5 are implemented and guarded. Item 4's browser audit now grades every API request, but its required zero-request outcome conflicts with the existing Crew grants path. Item 6 is BLOCKED by browser launch restrictions. This is not a complete green on the frozen work order.

## Files changed

| File | Change |
| --- | --- |
| `index.html` | Removed `user-scalable=no`. |
| `js/loot.js` | Corrected both anchor rationales to the real 40-coin grant. |
| `js/app.js` | Year extremes use daily readings in the displayed months; explains monthly-mean Average and raw Range/Latest. Year bar hint names monthly averages. |
| `server/scripts/write-contract.mjs` | Loads Acorn through `importAuditPackage`. |
| `tests/fontscale-audit.mjs` | Replaced the pinned defect assertion with a pinch-zoom-disabled regression guard and mutation control. |
| `tests/progress-playtest-audit.mjs` | Production sheet tests for Year extremes, window bounds, both weight units, monthly-mean Average and today-only history. |
| `tests/cloud-optout-audit.mjs` | Counts all server API requests and browser API attempts from the Off click through direct/profile/autoSync/restore probes. |
| `tests/lib/cloud-optout-requests.mjs` | Shared all-method, all-endpoint counter, with backup count retained for comparison only. |
| `tests/cloud-optout-transport-audit.mjs` | Actual social modules with intercepted fetch, enabled control, method controls, direct opt-out checks, scratch-tree mutation input and explicit autoSync diagnostic. |
| `tests/verify-tail-audit.mjs` | Source-comment contract and actual missing-Acorn subprocess, with guarded scratch outputs. |
| `tests/release-gate.mjs` | Registered the two new Node audits in PURE. |
| `js/changelog.js` | Five unversioned NEXT_CHANGES entries. |
| `docs/CLAIMS.md` | `## vNEXT`, five matching items with exactly five PROOF rows, plus explicit rendered-census blocker. |
| `docs/VERIFY-TAIL-REPORT.md` | This advisory report and proof inventory. |

## Red proofs and resulting behavior

Each implemented item has a failing guard recorded against original source or an explicitly reverted production guard in a scratch copy. Item 6 has no rendered red or green proof.

### Item 1: viewport

`node tests/fontscale-audit.mjs` before removing the attribute, exit 1:

```text
AssertionError [ERR_ASSERTION]: pinch-zoom must not be disabled
actual: <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
expected: /user-scalable\s*=\s*(?:no|0)\b/i
```

The new guard also rejects reintroducing `user-scalable=no`. The rest of the typography verifier still accepts both yes/no policy mutations independently of the viewport guard. No other typography assertion depended on disabled zoom. Existing Boneyard-specific CSS touch policy was not changed; this is a viewport correction, not physical gesture proof.

Final output:

```text
SOURCE CENSUS 974/974 (100.00%); fixed glyphs 10
PASS 34 type-token definitions resolve through rem and double at 16px to 32px; px TYPE tokens: 0
PASS body base, default sizes, token consumers and px border/sprite controls
INFO viewport policy: <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
PASS 9 regression mutations rejected; viewport yes/no policy changes accepted
PASS CONTROL 6 full-census regressions, 2 lowered floors and missing Dynamic Type opt-in rejected
PASS text-container wrapping/scroll contracts; fixed Paddock scene and room art controls
PASS CONTROL measured-element input validator and 95% ratchet (synthetic fixtures only; actual element census NOT RUN)
```

### Item 2: anchor rationale

`node tests/verify-tail-audit.mjs --item=2` initially exited 1:

```text
AssertionError [ERR_ASSERTION]: anchor no longer meets starting-wallet affordability
actual: broken it: a 340-coin starting wallet must be able to buy something.
expected: /cannot afford the 300-coin anchor/
```

The strengthened numeric-boundary guard was also run against original `HEAD` source in a scratch tree, exit 1:

```text
AssertionError [ERR_ASSERTION]: anchor rationale must name the real 40-coin starting wallet
expected: /\b40-coin starting wallet/
```

The 300-coin anchor does NOT satisfy affordability for a 40-coin starting wallet. It is 260 coins short. Both comments now say so. The price is unchanged; changing it requires a product-owner decision.

### Item 3: Year range and extremes

`node tests/progress-playtest-audit.mjs` before the production fix, exit 1:

```text
PASS CONTROL badge concurrent evaluation pays once and survives loss of qualifying log: one First bite announcement, 25 XP retained
PASS CONTROL aborted badge write can retry without losing or doubling XP: abort 0 XP; retry 25 XP; repeat 0 new badges
PASS CONTROL Progress receipts count all earned XP while disclosing the six-row preview: 90 XP total; six of nine receipts disclosed; all 29 badge tiles rendered
PASS P1 cumulative history chart and summary share the completed-day average: steps 10,000; active energy 500; move minutes 60; steady insights
PASS CONTROL range switches rewire actual chart click and no-data readouts: Day/Week/Month/Year clicks and empty history reached
PASS P1 partial today cannot invent a declining activity insight: Holding steady across this window
PASS CONTROL genuine changes, noncumulative readings and today-only samples remain visible: real decline 50%; heart average 70; today-only bar 100
PASS P2 Year weight Latest is the latest weigh-in, not its monthly mean: monthly bar 80.0 kg; Latest 90.0 kg
FAIL R4-23 Year extremes use readings and disclose monthly-mean averages: steps: extremes must use recorded days
PASS P3 short sleep does not present a null score as a number: 35 minutes retained; unavailable score explained
PASS CONTROL full sleep still shows the computed score and secret badge taps stay masked: 95/100; secret masked before earning, description reachable after
PASS P4 sleep chart with older readings keeps its exploration hint: 10-day-old sleep bar retains tap hint; 7-day average remains empty
Progress playtest: 11 passed, 1 failed
```

Final output, exit 0:

```text
PASS CONTROL badge concurrent evaluation pays once and survives loss of qualifying log: one First bite announcement, 25 XP retained
PASS CONTROL aborted badge write can retry without losing or doubling XP: abort 0 XP; retry 25 XP; repeat 0 new badges
PASS CONTROL Progress receipts count all earned XP while disclosing the six-row preview: 90 XP total; six of nine receipts disclosed; all 29 badge tiles rendered
PASS P1 cumulative history chart and summary share the completed-day average: steps 10,000; active energy 500; move minutes 60; steady insights
PASS CONTROL range switches rewire actual chart click and no-data readouts: Day/Week/Month/Year clicks and empty history reached
PASS P1 partial today cannot invent a declining activity insight: Holding steady across this window
PASS CONTROL genuine changes, noncumulative readings and today-only samples remain visible: real decline 50%; heart average 70; today-only bar 100
PASS P2 Year weight Latest is the latest weigh-in, not its monthly mean: monthly bar 80.0 kg; Latest 90.0 kg
PASS R4-23 Year extremes use readings and disclose monthly-mean averages: steps 14,570; heart 48; HRV 80; weight 70-100 kg, both units; window and today-only controls
PASS P3 short sleep does not present a null score as a number: 35 minutes retained; unavailable score explained
PASS CONTROL full sleep still shows the computed score and secret badge taps stay masked: 95/100; secret masked before earning, description reachable after
PASS P4 sleep chart with older readings keeps its exploration hint: 10-day-old sleep bar retains tap hint; 7-day average remains empty
Progress playtest: 12 passed, 0 failed
```

Year Average remains an unweighted mean of populated monthly means. Year Range/Highest/Lowest use underlying recorded daily values in the displayed months. Latest remains the latest reading in that window. Existing completed-day policy for shorter cumulative ranges is preserved, including its today-only fallback. The application stores daily health aggregates; this does not claim access to unavailable intraday samples.

### Item 4: all-request opt-out guard, PARTIAL

Only the scratch copy of `js/social.js` had the v535 `syncProfile` early return removed. The checkout file was never edited. The shared counter and actual social transport probe rejected that reversion, exit 1:

```text
OFF all requests=1; old PUT /backup count=0; [{"method":"PUT","url":"https://bonez-api.boneheadz.workers.dev/profile"}]
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: opted out must emit ZERO REQUESTS OF ANY KIND

1 !== 0

    at file:///private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/ad578513-d00a-4ff9-bdb3-c31e94189b3d/scratchpad/verify-tail/tests/cloud-optout-transport-audit.mjs:30:8 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 1,
  expected: 0,
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v22.22.2
```

Restored production direct backup/profile paths, exit 0:

```text
OFF all requests=0; old PUT /backup count=0; []
PASS direct backup and profile paths emit zero requests (Node transport only)
```

Current production with `node tests/cloud-optout-transport-audit.mjs --auto-sync`, exit 1:

```text
OFF all requests=1; old PUT /backup count=0; [{"method":"GET","url":"https://bonez-api.boneheadz.workers.dev/grants?since=0"}]
node:internal/modules/run_main:123
    triggerUncaughtException(
    ^

AssertionError [ERR_ASSERTION]: opted out must emit ZERO REQUESTS OF ANY KIND

1 !== 0

    at file:///private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/ad578513-d00a-4ff9-bdb3-c31e94189b3d/scratchpad/verify-tail/tests/cloud-optout-transport-audit.mjs:30:8 {
  generatedMessage: false,
  code: 'ERR_ASSERTION',
  actual: 1,
  expected: 0,
  operator: 'strictEqual',
  diff: 'simple'
}

Node.js v22.22.2
```

These are intercepted Node fetch calls, not server receipts. The mutated profile path now counts 1 versus the old counter's 0; current autoSync also counts 1 versus 0, for a grants GET. Every method and endpoint counts toward the zero-request assertion. Backup counts are diagnostic only.

The frozen plan's earlier 18 server requests versus 3 backup writes were not reproduced here. The browser audit now reports both quantities and grades all requests, but its server cannot bind in this environment. No new measured 18/3 count is claimed.

The broad zero-request requirement is impossible to make green within the permitted production scope: `autoSync()` intentionally calls `pullGrants()` while cloud backup is off, and identity recovery can also reach the network. Proposed deviation for the owner to decide: either authorize changing those paths in `js/social.js`, or narrow the product contract to upload silence while permitting Crew reads. Neither policy change was made. The strict browser assertion is retained and may now correctly fail where the older audit passed.

### Item 5: graceful missing dependency

The real script was copied into a scratch tree without node_modules. No installed dependency, including the checkout's externally linked dependencies, was renamed or edited.

Before the fix, the child exited 1 and its guard exited 1:

```text
item 5 dependency hidden: exit 1
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'acorn' imported from .../server/scripts/write-contract.mjs
AssertionError [ERR_ASSERTION]: missing acorn must exit 97
1 !== 97
```

After the fix:

```text
PASS item 2: both comments disclose 40 coins cannot afford the unchanged 300-coin anchor
item 5 dependency hidden: exit 97
UNPRV acorn  DID NOT RUN: missing dependency acorn. Install from this checkout root: npm ci --include=dev
PASS item 5: actual write-contract missing acorn is UNPROVEN
```

### Item 6: rendered type census, BLOCKED

The available Puppeteer is 24.43.1. Chromium headless shell failed to launch under the macOS sandbox:

```text
/bin/sh: /bin/ps: Operation not permitted
Error: Failed to launch the browser process: Code: null
FATAL:content/browser/sandbox_parameters_mac.mm:67
Check failed: . : Input/output error (5)
```

Dependency named: a launchable Chromium browser with the OS permissions needed by Puppeteer. No real rendered elements were collected. No rendered guard was proved red. The 95% element ratchet and this exact disclosure remain:

```text
PASS CONTROL measured-element input validator and 95% ratchet (synthetic fixtures only; actual element census NOT RUN)
```

## Agreed proof and PURE inventory

Final `node tests/unit.test.js`, exit 0:

```text
382 passed, 0 failed
```

PURE was enumerated from the actual `const PURE` declaration and all 78 `PURE.push`/`PURE.unshift` statements, not a hand-maintained list. It yielded 150 entries, above the required minimum of 146. The runner explicitly refuses a smaller count. Each entry was run as `node tests/<entry>`.

Initial complete run:

```text
Enumerated 150 PURE entries from const PURE and all 78 push/unshift statements
PURE: 150 run; 149 exit 0; 1 nonzero
```

`guard-hygiene-lint.mjs` initially rejected the new audit's missing CONTROL label and four unguarded scratch write destinations. The new audit now identifies its actual production controls and uses the repository's `auditOutputPath` for every scratch mutation. That lint was rerun and exited 0:

```text
ok    SETUP the lint found test files to scan  418 files
ok    RUNNER no case is registered after the runner has already drained  none
ok    SETUP the audit scan is not vacuous  382 audits
ok    CONTROL the number of audits with NO positive control does not rise above 49  49 of 382 carry no CONTROL/PREMISE/SETUP/REACH/SAMPLE row. ratchet holding
ok    LITERAL-TRUE no audit asserts a constant success (including NO page errors)  0 offenders
ok    LITERAL-TRUE the ten justified reports are excused exactly once  10 excused; 0 stale or duplicated
ok    CONTROL literal-true catches a new offender even inside an excused file
ok    PARSES every audit is something Node will actually execute  418 files parse
ok    SEAM no NEW audit proves a feature only through a test hook  30 known seam-only, 0 new
ok    SEAM the seam-only inventory has no stale entries (fixed one? delete its line)  inventory matches
ok    OUTPUT all recognized audit writes validate destinations outside the graded checkout  207 guarded sinks
ok    CONTROL the output sweep is nonempty and rejects an unguarded checkout screenshot  441 files scanned recursively

guard-hygiene: clean
```

All 150 distinct PURE entries have a final successful invocation. The initial batch exit 1 is retained above, not relabeled as a batch exit 0. Targeted checks were rerun after the relevant edits. The final unit invocation also passed. No browser-tier green is claimed.

| # | PURE entry | Final exit |
| --- | --- | --- |
| 1 | `version-align-lint.mjs` | 0 |
| 2 | `no-debug-markers-lint.mjs` | 0 |
| 3 | `store-copy-lint.mjs` | 0 |
| 4 | `migration-guard-audit.mjs` | 0 |
| 5 | `sync-observability-audit.mjs` | 0 |
| 6 | `sync-identity-audit.mjs` | 0 |
| 7 | `sync-native-audit.mjs` | 0 |
| 8 | `lab-density-audit.mjs` | 0 |
| 9 | `crew-outfit-audit.mjs` | 0 |
| 10 | `dock-line-audit.mjs` | 0 |
| 11 | `whatsnew-boot-audit.mjs` | 0 |
| 12 | `wardrobe-noise-audit.mjs` | 0 |
| 13 | `sync-clientpath-audit.mjs` | 0 |
| 14 | `sync-authpath-audit.mjs` | 0 |
| 15 | `sync-path-audit.mjs` | 0 |
| 16 | `wardrobe-playtest-audit.mjs` | 0 |
| 17 | `lab-room2-audit.mjs` | 0 |
| 18 | `stable-stale-disclosure-audit.mjs` | 0 |
| 19 | `breed-last-colour-audit.mjs` | 0 |
| 20 | `stable-loss-disclosure-audit.mjs` | 0 |
| 21 | `lab-health-recovery-audit.mjs` | 0 |
| 22 | `lab-integration-audit.mjs` | 0 |
| 23 | `lab-ui-audit.mjs` | 0 |
| 24 | `laboratory-audit.mjs` | 0 |
| 25 | `lab-foundation-audit.mjs` | 0 |
| 26 | `pet-stress-guard.mjs` | 0 |
| 27 | `crew-pet-node-guard.mjs` | 0 |
| 28 | `transmog-receipt-audit.mjs` | 0 |
| 29 | `today-reads-lint.mjs` | 0 |
| 30 | `kitchen-atomic-audit.mjs` | 0 |
| 31 | `backup-encoder-audit.mjs` | 0 |
| 32 | `backup-key-audit.mjs` | 0 |
| 33 | `backup-version-audit.mjs` | 0 |
| 34 | `backup-conflict-audit.mjs` | 0 |
| 35 | `unit.test.js` | 0 |
| 36 | `log-xp-farm-audit.mjs` | 0 |
| 37 | `drip-badge-audit.mjs` | 0 |
| 38 | `xp-key-provenance-lint.mjs` | 0 |
| 39 | `facegate-audit.mjs` | 0 |
| 40 | `garden-appetite-guard.mjs` | 0 |
| 41 | `pit.test.js` | 0 |
| 42 | `quest-daymore-audit.mjs` | 0 |
| 43 | `quest-pick-audit.mjs` | 0 |
| 44 | `first-fight-audit.mjs` | 0 |
| 45 | `stat-source-audit.mjs` | 0 |
| 46 | `bastions-rep-sim.mjs` | 0 |
| 47 | `analytics-tag-audit.mjs` | 0 |
| 48 | `icon-inventory-audit.mjs` | 0 |
| 49 | `version-stamp-audit.mjs` | 0 |
| 50 | `boneyard-supply-audit.mjs` | 0 |
| 51 | `loot-fallback-audit.mjs` | 0 |
| 52 | `guard-hygiene-lint.mjs` | 0 (rerun after correction) |
| 53 | `guard-provenance-lint.mjs` | 0 |
| 54 | `feedback-status-lint.mjs` | 0 |
| 55 | `rack-theme-lint.mjs` | 0 |
| 56 | `rack-rotate-audit.mjs` | 0 |
| 57 | `pet-accessory-lint.mjs` | 0 |
| 58 | `pet-pool-audit.mjs` | 0 |
| 59 | `manifest-exports-audit.mjs` | 0 |
| 60 | `xp-curve-audit.mjs` | 0 |
| 61 | `live-api-register-lint.mjs` | 0 |
| 62 | `claim-evidence-lint.mjs` | 0 |
| 63 | `thumb-freshness-lint.mjs` | 0 |
| 64 | `render-sink-lint.mjs` | 0 |
| 65 | `lapse-witness-audit.mjs` | 0 |
| 66 | `spawn-claim-atomic-audit.mjs` | 0 |
| 67 | `wardrobe-family-audit.mjs` | 0 |
| 68 | `football-kit-audit.mjs` | 0 |
| 69 | `restore-latch-audit.mjs` | 0 |
| 70 | `first-pet-audit.mjs` | 0 |
| 71 | `shop-economy-audit.mjs` | 0 |
| 72 | `recovery-status-audit.mjs` | 0 |
| 73 | `currency-revision-lint.mjs` | 0 |
| 74 | `inv-tombstone-audit.mjs` | 0 |
| 75 | `take-and-pay-audit.mjs` | 0 |
| 76 | `c6-price-audit.mjs` | 0 |
| 77 | `pet-morph-animation-audit.mjs` | 0 |
| 78 | `pet-palette-audit.mjs` | 0 |
| 79 | `fontscale-audit.mjs` | 0 |
| 80 | `wheel-look-audit.mjs` | 0 |
| 81 | `wheel-easing-audit.mjs` | 0 |
| 82 | `storage-boot-audit.mjs` | 0 |
| 83 | `crate-cadence-audit.mjs` | 0 |
| 84 | `r4-app-p1-audit.mjs` | 0 |
| 85 | `water-retry-audit.mjs` | 0 |
| 86 | `cloud-off-audit.mjs` | 0 |
| 87 | `r4-silence-audit.mjs` | 0 |
| 88 | `silence-disclosure-audit.mjs` | 0 |
| 89 | `health-disclosure-audit.mjs` | 0 |
| 90 | `paddock-pack-audit.mjs` | 0 |
| 91 | `numbers-honesty-audit.mjs` | 0 |
| 92 | `locale-numbers-audit.mjs` | 0 |
| 93 | `audit-output-audit.mjs` | 0 |
| 94 | `branch-graveyard-audit.mjs` | 0 |
| 95 | `store-runtime-audit.mjs` | 0 |
| 96 | `r47-rest-audit.mjs` | 0 |
| 97 | `r47-economy-audit.mjs` | 0 |
| 98 | `submission-build-audit.mjs` | 0 |
| 99 | `harness-environment-audit.mjs` | 0 |
| 100 | `guard-debts-audit.mjs` | 0 |
| 101 | `submission-preflight-audit.mjs` | 0 |
| 102 | `pet-state-audit.mjs` | 0 |
| 103 | `pet-family-audit.mjs` | 0 |
| 104 | `crew-pet-audit.mjs` | 0 |
| 105 | `coins-merge-tie-audit.mjs` | 0 |
| 106 | `routine-race-audit.mjs` | 0 |
| 107 | `dayone-topup-audit.mjs` | 0 |
| 108 | `dish-worth-audit.mjs` | 0 |
| 109 | `pet-C-node-guard.mjs` | 0 |
| 110 | `r48-state-audit.mjs` | 0 |
| 111 | `r46-logging-audit.mjs` | 0 |
| 112 | `r46-diary-audit.mjs` | 0 |
| 113 | `zero-calorie-seam-audit.mjs` | 0 |
| 114 | `audit-completion-audit.mjs` | 0 |
| 115 | `machine-character-audit.mjs` | 0 |
| 116 | `n3-deadpaths-audit.mjs` | 0 |
| 117 | `m5-prove-red.mjs` | 0 |
| 118 | `lookup-guard-lint.mjs` | 0 |
| 119 | `restore-state-audit.mjs` | 0 |
| 120 | `restore-debt-edges-audit.mjs` | 0 |
| 121 | `restore-debt-audit.mjs` | 0 |
| 122 | `p1-r48-rest-audit.mjs` | 0 |
| 123 | `pet-a11y-audit.mjs` | 0 |
| 124 | `kennel-copy-audit.mjs` | 0 |
| 125 | `breed-lock-audit.mjs` | 0 |
| 126 | `device-loss-audit.mjs` | 0 |
| 127 | `multidevice-earnings-audit.mjs` | 0 |
| 128 | `response-bodies-audit.mjs` | 0 |
| 129 | `p1-merge-audit.mjs` | 0 |
| 130 | `quest-wheel-budget-audit.mjs` | 0 |
| 131 | `kitchen-delivery-audit.mjs` | 0 |
| 132 | `map-playtest-audit.mjs` | 0 |
| 133 | `p1-dens-audit.mjs` | 0 |
| 134 | `crew-yard-row-audit.mjs` | 0 |
| 135 | `pet-rarity-audit.mjs` | 0 |
| 136 | `stable-rooms-top-audit.mjs` | 0 |
| 137 | `today-playtest-audit.mjs` | 0 |
| 138 | `crew-playtest-audit.mjs` | 0 |
| 139 | `firstrun-audit.mjs` | 0 |
| 140 | `settings-safety-audit.mjs` | 0 |
| 141 | `progress-playtest-audit.mjs` | 0 |
| 142 | `leaderboard-honesty-audit.mjs` | 0 |
| 143 | `breed-two-tap-audit.mjs` | 0 |
| 144 | `after-await-event-lint.mjs` | 0 |
| 145 | `boneyard-zoom-audit.mjs` | 0 |
| 146 | `lab-conflict-audit.mjs` | 0 |
| 147 | `lab-lock-recovery-audit.mjs` | 0 |
| 148 | `r3-rest-audit.mjs` | 0 |
| 149 | `verify-tail-audit.mjs` | 0 |
| 150 | `cloud-optout-transport-audit.mjs` | 0 |

Additional checks: `git diff --check` clean; `node tests/release-gate.mjs --coverage-only` exit 0; browser audit syntax check exit 0. Direct comparison confirmed five NEXT_CHANGES strings equal the five vNEXT changelog items and exactly five PROOF rows.

## Denied actions, boundaries and deviations

- Browser launch was denied by the macOS sandbox. Its process-list probe also received Operation not permitted.
- The cloud browser audit exited 1 before grading any rows because binding `127.0.0.1` returned `listen EPERM`.
- No approval escalation was attempted. No commit, push, publish or deployment was attempted.
- `assets/**`, `js/db.js`, `js/hunt.js`, `js/social.js`, and `js/water.js` are unchanged in the checkout. No version stamp, 300-coin price or spawn spacing changed.
- All production paths were resolved relative to this checkout. Original source for red controls came from this checkout's HEAD. Temporary mutations were confined to scratch copies.
- Item 4 uses Node transport mutation evidence as a disclosed substitute for unavailable browser/server proof. The broad zero-request outcome remains unresolved, and the old 18/3 server census remains unreproduced.
- Item 6 follows the plan's explicit blocked fallback. Its unchanged disclosure is not evidence of a rendered pass.

Full raw logs, the PURE extraction runner, manifest and initial result JSON are in `/tmp/verify-tail-proof/` for this review session. The essential outputs and complete audit inventory are embedded above so the advisory survives scratch-log cleanup.
