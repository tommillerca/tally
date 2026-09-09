Advisory report for frozen work order `rarity-out`. This is implementation evidence for independent review, not approval to release.

Plan SHA256 verified: `41346d11eac1df772021c10409d206554bd6c2f81a7d7211cbe1e1140c47dbf4`.

**Files changed**

| File | Change |
| --- | --- |
| `js/app.js` | Removed pet rarity labels and tier classes from shop, hatch, battle panel, Stable cards and caption repaint, accessories, pet ceremonies, Pit miniature, Paddock field and reward delivery. Shared reward cards use an explicit pet flag to omit rarity presentation. Pet help names species as the existing stat factor. |
| `js/paddock-cards.js` | Removed the rarity palette, model rarity fields, glow flag, chip and tile tier classes. Kept shiny indicators. |
| `js/pets.js` | Changed only the displayed stat explanation from “rarity” to “species”. |
| `app.css` | Removed pet-only rarity rules and the unused pet-kind label rule. Shared gear, crate, rack and shiny rules remain. |
| `tests/pet-rarity-audit.mjs` | Added 12 Node checks using production render functions or source slices, all pet species, shiny/ordinary variants, owned/locked states, pet receipts and positive controls for actual gear, cosmetics, weapon-rack tiers and crate odds. |
| `tests/kennel-copy-audit.mjs` | Strengthened the existing colour-chip assertion to require exactly one chip and reject pet rarity copy. |
| `tests/kennel-copy-browser-audit.mjs` | Replaced the obsolete second rarity-chip assumption with exactly one colour chip, absence of rarity copy/classes, containment and no overlap with the level badge. |
| `tests/admin-grant-audit.mjs` | Updated the pet delivery fixture to the production pet flag and added an assertion that its card has neither a rarity chip nor tier class. |
| `tests/release-gate.mjs` | Added `pet-rarity-audit.mjs` to PURE. |
| `RARITY-OUT-REPORT.md` | This advisory report. |
| `docs/reviews/rarity-out.md` | Preserved a report created by the concurrent writer and prefixed a correction identifying its different plan hash and stale sort claim. Its separate tool-action history is not independently verified here. |

The tests directory was searched for rarity words, `rar-`, `pdk-rar`, tier classes and model fields before editing. Existing gear-rarity and pet-balance/data assertions remain. No audit was deleted.

**Scope and deviations**

No impossible requirement was found, and no functional deviation from the frozen scope is required. The numbered hints were not exhaustive: the same removal also covers pet ceremony wrappers, the Pit miniature, Paddock field glows, Stable caption repaint, pet accessory tiles, grant delivery cards and the help/stat explanation.

The existing Stable species sort order remains. `PET_STATS.mult`, all stat calculations and caps, `petDustValue`, `SHINY_CHANCE`, shiny presentation, `data/boneheadz.js`, gear rarity and crate odds are preserved. The only `js/pets.js` diff is display copy. `js/loot.js` and `data/boneheadz.js` have no diff.

The red proof used a temporary copy of this checkout's JS/data/audit files. It restored the exact removed `pet-kind` line read from this checkout's HEAD, ran the real audit, then removed that line and reran it. This avoided a deliberate regression in the shared working checkout. No original checkout named in the plan was edited.

**Proof output**

`node tests/unit.test.js`, exit 0:

```text
373 passed, 0 failed
```

Red mutation, `node tests/pet-rarity-audit.mjs`, exit 1:

```text
FAIL SHOP pet hero and accessories omit rarity in owned and locked states: pet rarity label
11/12 pet rarity checks passed
```

Green, same command after restoring the fix, exit 0:

```text
PASS CONTROL label and class detectors reject regressions
PASS SHOP pet hero and accessories omit rarity in owned and locked states
PASS PANEL every species retains stats, level and shiny without rarity
PASS HATCH every species, duplicate and shiny reveal omits rarity
PASS STABLE cards, initial caption and focus repaint retain family and shiny
PASS PADDOCK models and all owned/locked tiles carry no rarity fields or glow
PASS RECEIPTS pet result and delivery cards omit rarity; gear keeps every tier
PASS PADDOCK field sprites have no species glow
PASS SOURCE pet-only help, level-up, breeding and Kennel contain no tier labels
PASS SOURCE pet stage classes and accessory wardrobe cannot emit rarity
PASS CSS pet tier rules are gone and shared gear callers still own their rules
PASS CONTROL actual gear, cosmetic, crate odds and weapon rack producers retain rarity
12/12 pet rarity checks passed
```

Every entry in PURE was executed with `node tests/<entry>`, from this checkout, without starting the release gate's server or browser tier. The list was extracted from its actual declaration and subsequent push/unshift statements. Final complete run:

```text
PASS version-align-lint.mjs exit 0
PASS no-debug-markers-lint.mjs exit 0
PASS store-copy-lint.mjs exit 0
PASS lab-room2-audit.mjs exit 0
PASS stable-stale-disclosure-audit.mjs exit 0
PASS breed-last-colour-audit.mjs exit 0
PASS stable-loss-disclosure-audit.mjs exit 0
PASS lab-health-recovery-audit.mjs exit 0
PASS lab-integration-audit.mjs exit 0
PASS lab-ui-audit.mjs exit 0
PASS laboratory-audit.mjs exit 0
PASS lab-foundation-audit.mjs exit 0
PASS pet-stress-guard.mjs exit 0
PASS crew-pet-node-guard.mjs exit 0
PASS transmog-receipt-audit.mjs exit 0
PASS today-reads-lint.mjs exit 0
PASS kitchen-atomic-audit.mjs exit 0
PASS backup-encoder-audit.mjs exit 0
PASS backup-key-audit.mjs exit 0
PASS backup-version-audit.mjs exit 0
PASS backup-conflict-audit.mjs exit 0
PASS unit.test.js exit 0
PASS log-xp-farm-audit.mjs exit 0
PASS drip-badge-audit.mjs exit 0
PASS xp-key-provenance-lint.mjs exit 0
PASS facegate-audit.mjs exit 0
PASS garden-appetite-guard.mjs exit 0
PASS pit.test.js exit 0
PASS quest-daymore-audit.mjs exit 0
PASS quest-pick-audit.mjs exit 0
PASS first-fight-audit.mjs exit 0
PASS stat-source-audit.mjs exit 0
PASS bastions-rep-sim.mjs exit 0
PASS analytics-tag-audit.mjs exit 0
PASS icon-inventory-audit.mjs exit 0
PASS version-stamp-audit.mjs exit 0
PASS boneyard-supply-audit.mjs exit 0
PASS loot-fallback-audit.mjs exit 0
PASS guard-hygiene-lint.mjs exit 0
PASS guard-provenance-lint.mjs exit 0
PASS feedback-status-lint.mjs exit 0
PASS rack-theme-lint.mjs exit 0
PASS rack-rotate-audit.mjs exit 0
PASS pet-accessory-lint.mjs exit 0
PASS pet-pool-audit.mjs exit 0
PASS manifest-exports-audit.mjs exit 0
PASS xp-curve-audit.mjs exit 0
PASS live-api-register-lint.mjs exit 0
PASS claim-evidence-lint.mjs exit 0
PASS thumb-freshness-lint.mjs exit 0
PASS render-sink-lint.mjs exit 0
PASS lapse-witness-audit.mjs exit 0
PASS spawn-claim-atomic-audit.mjs exit 0
PASS wardrobe-family-audit.mjs exit 0
PASS football-kit-audit.mjs exit 0
PASS restore-latch-audit.mjs exit 0
PASS first-pet-audit.mjs exit 0
PASS recovery-status-audit.mjs exit 0
PASS currency-revision-lint.mjs exit 0
PASS inv-tombstone-audit.mjs exit 0
PASS take-and-pay-audit.mjs exit 0
PASS pet-morph-animation-audit.mjs exit 0
PASS pet-palette-audit.mjs exit 0
PASS fontscale-audit.mjs exit 0
PASS wheel-easing-audit.mjs exit 0
PASS storage-boot-audit.mjs exit 0
PASS crate-cadence-audit.mjs exit 0
PASS silence-disclosure-audit.mjs exit 0
PASS health-disclosure-audit.mjs exit 0
PASS paddock-pack-audit.mjs exit 0
PASS numbers-honesty-audit.mjs exit 0
PASS locale-numbers-audit.mjs exit 0
PASS audit-output-audit.mjs exit 0
PASS branch-graveyard-audit.mjs exit 0
PASS store-runtime-audit.mjs exit 0
PASS r47-rest-audit.mjs exit 0
PASS r47-economy-audit.mjs exit 0
PASS submission-build-audit.mjs exit 0
PASS harness-environment-audit.mjs exit 0
PASS guard-debts-audit.mjs exit 0
PASS submission-preflight-audit.mjs exit 0
PASS pet-state-audit.mjs exit 0
PASS pet-family-audit.mjs exit 0
PASS crew-pet-audit.mjs exit 0
PASS coins-merge-tie-audit.mjs exit 0
PASS routine-race-audit.mjs exit 0
PASS dayone-topup-audit.mjs exit 0
PASS dish-worth-audit.mjs exit 0
PASS pet-C-node-guard.mjs exit 0
PASS r48-state-audit.mjs exit 0
PASS r46-logging-audit.mjs exit 0
PASS r46-diary-audit.mjs exit 0
PASS zero-calorie-seam-audit.mjs exit 0
PASS audit-completion-audit.mjs exit 0
PASS machine-character-audit.mjs exit 0
PASS n3-deadpaths-audit.mjs exit 0
PASS m5-prove-red.mjs exit 0
PASS lookup-guard-lint.mjs exit 0
PASS restore-state-audit.mjs exit 0
PASS restore-debt-edges-audit.mjs exit 0
PASS restore-debt-audit.mjs exit 0
PASS p1-r48-rest-audit.mjs exit 0
PASS pet-a11y-audit.mjs exit 0
PASS kennel-copy-audit.mjs exit 0
PASS breed-lock-audit.mjs exit 0
PASS device-loss-audit.mjs exit 0
PASS multidevice-earnings-audit.mjs exit 0
PASS response-bodies-audit.mjs exit 0
PASS pet-rarity-audit.mjs exit 0
109/109 PURE entries exit 0
```

`git diff --check`, JavaScript syntax checks, and syntax checks of the two changed browser audits passed.

Full per-suite logs, the unit transcript, red/green transcripts, the extracted PURE list and final source hashes are under `/tmp/rarity-out-proof-primary/`. The standalone runner is `/tmp/rarity-out-run-pure.mjs`; the mutation runner is `/tmp/rarity-out-red-proof.mjs`.

**Failures encountered, blocked actions and limitations**

- The initial PURE run found missing `esprima` and returned exit 97 for `store-copy-lint.mjs`. `npm ci --offline --ignore-scripts --no-audit --no-fund` installed 98 packages from the local cache. Dependency manifests and the lockfile were unchanged. The lint and the complete PURE run then passed.
- During audit development, a new control incorrectly assumed the actual statted gear catalog had common and epic items. The catalog has three statted tiers. The corrected control executes every real gear item, and separately covers all five cosmetic and rack tiers. The temporary failing audit was rerun successfully.
- Concurrent writes by another process were observed in this checkout. The first guarded edit stopped before writing when its expected source no longer matched. Those changes were reviewed, the existing sort order was restored to respect presentation-only scope, and final source hashes remained unchanged during the final standalone unit and targeted proof checks. No authorship exclusivity is claimed.
- No tool action was denied in this run. The concurrent writer's separate report records its own denied actions; those claims are preserved and clearly attributed there. No commit, push, PR, publication, Worker deployment, remote Wrangler call, production D1 write or secret change was attempted. `native/ASC-SUBMISSION.md` was not touched.
- Browser/server proofs were not attempted, as required by the no-socket instruction. The updated `kennel-copy-browser-audit.mjs` and `admin-grant-audit.mjs` remain unrun. A permitted local browser run is still needed to verify colour-chip layout at 320/393 px, shiny and neutral card paint, decoded pet art and interaction. Node proof does not certify pixels or layout.
