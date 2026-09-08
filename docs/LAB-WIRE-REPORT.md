# BUILD 3 Laboratory wiring: advisory implementation report

Frozen work order verified against SHA256 `517410b3ef1a643d110737d61420ce7342206cf915d3b3b7f5030dfec81a9a69`.
Checkout baseline HEAD: `e4beabe0ebde90085b69b33962094cbb98b0c3b1`.
This report is advisory. Independent review remains required.

## Files changed

- `js/loot.js`: exports the version-1 `laboratory` adapter, projects presentation data, and adds the transaction-side checks described below.
- `tests/lab-integration-audit.mjs`: executes the actual UI gate and renderers against the real adapter and in-memory IndexedDB. Includes 13 positive control groups and deliberately rejected missing-method/unadapted-count variants.
- `tests/release-gate.mjs`: registers the integration guard in PURE.
- `docs/LAB-WIRE-REPORT.md`: this report.

The UI and pure recipe module were not changed. Source edits were confined to this checkout.

## Boundary adaptations and deviations

The original engine already exposed `quoteLaboratory`, `saveLabIntent`, `animateLaboratory`, `buyLabIncubator`, and `acknowledgeLabResult`. The adapter reuses them. It does not implement another experiment or currency transaction.

1. The engine returned a bare quote with raw talent IDs, no eligibility annotations, and branch counts as maps. The UI expects `{ok:true, quote}`, normalized input rows, talent display names, alternative salvage dust including lineage, and arrays of `{cell,before,after}`. The adapter provides those annotations and retains the unmodified engine request in `quote.request`. Dispatch checks the presentation against that request before the existing engine checks live equality. Receipt annotations come from the saved request and validated receipt, with live result presence and remaining capacity.
2. Engine refusal names differ from UI names. The adapter translates `daily-cap` to `cap-reached`, `backwards` to `clock-backwards`, `unwitnessed` to `unwitnessed-day`, `invalid-pair` to `ineligible`, `unsettled-training` to `stale-quote`, and operation/restore conflicts to `restore-conflict`.
3. The engine lacked snapshot, UI-update, and recovery services. The adapter adds them using the existing atomic snapshot seam. Presentation-only snapshots issue empty write plans, reuse supplied Today arrays without rescanning their stores, and project uncredited training without persisting it. Normal snapshots prepare migrations and training, then read coherent roster, cells, species recipes, capacity, incubators, eggs, flags and receipts. Prior-day discovery uses actual `dayclose`/`dayeffort` ledger records. Pair safety checks every supported branch and excludes all investments; it does not equate eligibility with recommendation safety.
4. **Necessary engine-boundary extension:** a wrapper-only purchase token check would race another balance or entitlement writer. `buyLabIncubator` now checks the adapter's token and persisted intent inside its existing debit/entitlement transaction, and removes the purchase intent in that same commit. Legacy callers without a token retain their API shape. The adapter persists purchase requests as `labIntents[opId].quote` with an additive `kind:'purchase'` discriminator, the fixed price, slot, rules, and snapshot token. This extends the quote subtype within the existing intent envelope because the shipped engine had no purchase-intent API. No new durable key, price, default, receipt shape or merge policy was introduced.
5. **Necessary engine-boundary extension:** recovery that removes an uncommitted intent must fence an already delayed dispatch. `animateLaboratory` accepts `requireIntent`, used by the adapter, and checks it within the existing consuming transaction. Pending operations block other requests there as well. `saveLabIntent` recognizes already committed replays before rechecking consumed inputs. Receipt readback is validated before presentation. Recovery never retries or draws an outcome. These checks cannot be made race-safe solely before entering the transaction.

`LAB_PRICES` remains 20,000 and 40,000; slot 3 still requires slot 2 and purchases require a completed experiment. `LAB_DEFAULTS` is unchanged. The shipped UI and pure engine both require guaranteed Midnight with weight 4 and protection `none`; that behavior is preserved. The older final-gamble wording in `LAB-SPEC.md` is historical and was not used to retune either half.

For an interrupted intent with no receipt, confirmed abort requires unchanged relevant state. Day or zone passage alone does not prevent recovery. If relevant state has changed and the outcome cannot be established, the adapter retains `unknown` and blocks new submissions. It does not infer a refund or retry from elapsed time. This conservative unresolved-state behavior is a review limitation, not a claim of complete cross-device recovery.

## Red-before proof

Before any production edit, ran `node tests/lab-integration-audit.mjs` against the original loot export. Exit status: **1**.

```text
AssertionError [ERR_ASSERTION]: laboratory.version must be 1
undefined !== 1
actual: undefined
expected: 1
```

The assertion executes the production `laboratoryEngine()` gate from `js/app.js`. The guard also pins its actual required-method list against the six exercised methods. Adding, removing, renaming or changing the UI gate requirement makes the guard fail rather than silently testing an obsolete local interface.

## Green-after proof

Agreed command: `node tests/unit.test.js`. Exit status: **0**.

```text
370 passed, 0 failed
```

Integration guard: `node tests/lab-integration-audit.mjs`. Exit status: **0**. All 13 control groups pass, including two Base inputs destroyed, one coloured level-1 output, zero result bank, both inputs absent, and one persisted daily use. It also drives all six public methods, real UI quote/branch rendering, idempotent replay after salvage, sequential purchases and exact debits, stale warning refusal, read-only Today reuse, safe versus invested stock, durable intent recovery, transaction abort, lost completion response, backup flag merging, overnight recovery and purchase token races.

The full PURE list was evaluated from the declaration and every subsequent `push`/`unshift` in `tests/release-gate.mjs`, stopping before the BROWSER declaration. Every enumerated file was executed with Node. The gate server and browser tiers were not started. A temporary Node preload prohibited socket listen/connect and datagram creation; no test triggered that prohibition.

```text
100/100 PURE suites green
```

Initial PURE execution was 96/100 because the checkout lacked `node_modules` and four suites could not import `esprima`. Restored the locked esprima 4.0.1 tarball from the local npm cache into ignored `node_modules/esprima`, verifying SHA512 against `package-lock.json`. No network access, dependency version change, package manifest change or lockfile change. The final complete 100-suite rerun passed.

`git diff --check`: exit **0**.

Temporary proof logs: `/tmp/build-wire-proof/unit-final.log`, `/tmp/build-wire-proof/pure-summary.log`, `/tmp/build-wire-proof/pure-list.json`, `/tmp/build-wire-proof/pure-results.json`, and per-suite `.log` files. The temporary runner is `/tmp/build-wire-proof/run-pure.mjs`.

## Denied, blocked and unrun actions

- No tool action was denied. The missing local dependency initially blocked four checks and was resolved offline.
- No commit, push, publish or deployment was performed.
- Sockets and browser execution: **unrun**, as required. The full mixed release-gate command was not run because it starts a server/browser tier.
- Real browser IndexedDB process-death durability, browser interactions, pixels and device behavior remain unproven. The transaction evidence here uses the shared in-memory IndexedDB and the production transaction implementation.
- Strict account-wide offline quota enforcement remains outside the local engine's capability. No new authority protocol or claim was added.

## Final source hashes

- `js/loot.js`: SHA256 `b94ec9c105ec25b205a5243eb5d7fb16378bb664d1157c70027b24334f84005e`
- `tests/lab-integration-audit.mjs`: SHA256 `04f6dc5be85250b1d6504c24ef58924035132020b0aa3a069ec81cb231011895`
- `tests/release-gate.mjs`: SHA256 `617ea4da9b3e45c8040b1f0877c1deef371045c8996d7bfb094c1955bbc1b97a`

## Full PURE enumeration

Every entry below exited 0 in the final run, in gate declaration order.

1. `version-align-lint.mjs`
2. `no-debug-markers-lint.mjs`
3. `store-copy-lint.mjs`
4. `lab-integration-audit.mjs`
5. `lab-ui-audit.mjs`
6. `laboratory-audit.mjs`
7. `lab-foundation-audit.mjs`
8. `pet-stress-guard.mjs`
9. `crew-pet-node-guard.mjs`
10. `transmog-receipt-audit.mjs`
11. `today-reads-lint.mjs`
12. `kitchen-atomic-audit.mjs`
13. `backup-encoder-audit.mjs`
14. `backup-key-audit.mjs`
15. `backup-version-audit.mjs`
16. `backup-conflict-audit.mjs`
17. `unit.test.js`
18. `log-xp-farm-audit.mjs`
19. `drip-badge-audit.mjs`
20. `xp-key-provenance-lint.mjs`
21. `facegate-audit.mjs`
22. `garden-appetite-guard.mjs`
23. `pit.test.js`
24. `quest-daymore-audit.mjs`
25. `quest-pick-audit.mjs`
26. `first-fight-audit.mjs`
27. `stat-source-audit.mjs`
28. `bastions-rep-sim.mjs`
29. `analytics-tag-audit.mjs`
30. `icon-inventory-audit.mjs`
31. `version-stamp-audit.mjs`
32. `boneyard-supply-audit.mjs`
33. `loot-fallback-audit.mjs`
34. `guard-hygiene-lint.mjs`
35. `guard-provenance-lint.mjs`
36. `feedback-status-lint.mjs`
37. `rack-theme-lint.mjs`
38. `rack-rotate-audit.mjs`
39. `pet-accessory-lint.mjs`
40. `pet-pool-audit.mjs`
41. `manifest-exports-audit.mjs`
42. `xp-curve-audit.mjs`
43. `live-api-register-lint.mjs`
44. `claim-evidence-lint.mjs`
45. `thumb-freshness-lint.mjs`
46. `render-sink-lint.mjs`
47. `lapse-witness-audit.mjs`
48. `spawn-claim-atomic-audit.mjs`
49. `wardrobe-family-audit.mjs`
50. `football-kit-audit.mjs`
51. `restore-latch-audit.mjs`
52. `first-pet-audit.mjs`
53. `recovery-status-audit.mjs`
54. `currency-revision-lint.mjs`
55. `inv-tombstone-audit.mjs`
56. `take-and-pay-audit.mjs`
57. `fontscale-audit.mjs`
58. `wheel-easing-audit.mjs`
59. `storage-boot-audit.mjs`
60. `crate-cadence-audit.mjs`
61. `silence-disclosure-audit.mjs`
62. `health-disclosure-audit.mjs`
63. `paddock-pack-audit.mjs`
64. `numbers-honesty-audit.mjs`
65. `locale-numbers-audit.mjs`
66. `audit-output-audit.mjs`
67. `branch-graveyard-audit.mjs`
68. `store-runtime-audit.mjs`
69. `r47-rest-audit.mjs`
70. `r47-economy-audit.mjs`
71. `submission-build-audit.mjs`
72. `harness-environment-audit.mjs`
73. `guard-debts-audit.mjs`
74. `submission-preflight-audit.mjs`
75. `pet-state-audit.mjs`
76. `pet-family-audit.mjs`
77. `crew-pet-audit.mjs`
78. `coins-merge-tie-audit.mjs`
79. `routine-race-audit.mjs`
80. `dayone-topup-audit.mjs`
81. `dish-worth-audit.mjs`
82. `pet-C-node-guard.mjs`
83. `r48-state-audit.mjs`
84. `r46-logging-audit.mjs`
85. `r46-diary-audit.mjs`
86. `zero-calorie-seam-audit.mjs`
87. `audit-completion-audit.mjs`
88. `machine-character-audit.mjs`
89. `n3-deadpaths-audit.mjs`
90. `m5-prove-red.mjs`
91. `lookup-guard-lint.mjs`
92. `restore-state-audit.mjs`
93. `restore-debt-edges-audit.mjs`
94. `restore-debt-audit.mjs`
95. `p1-r48-rest-audit.mjs`
96. `pet-a11y-audit.mjs`
97. `kennel-copy-audit.mjs`
98. `breed-lock-audit.mjs`
99. `device-loss-audit.mjs`
100. `multidevice-earnings-audit.mjs`
