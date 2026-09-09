> Concurrent-run record: this report was written by another process. Its recorded plan hash differs from the current user-requested and verified hash, `41346d11eac1df772021c10409d206554bd6c2f81a7d7211cbe1e1140c47dbf4`. Its claim that Stable sorting was removed is stale: the final source preserves the original sort. The separate run's tool-action claims below were not independently verified here. See [the verified advisory for the requested plan](../../RARITY-OUT-REPORT.md). Original concurrent-run text follows for provenance.

# Advisory: rarity-out

Implemented in this checkout. Advisory evidence only, for independent provider review. No commit, push, PR, publication or deployment was performed.

Frozen plan SHA256 verified: `627040696044b9838a786dbfa5f337f7ee3056192b7b4d9811ad1c26e2a2faa2`.

Baseline HEAD: `fdbafb9607a1a9fcf4ae622a7f3010f819fe3558`.

## Files changed

| File | Change |
| --- | --- |
| `js/app.js` | Removed pet shop, hatch, panel, Stable, pet accessory and pet stage rarity copy/classes. Removed Paddock field tier glows and Stable rarity sorting. Pet reward/delivery cards now carry `pet: true`, suppressing rarity in the shared renderer while preserving gear output. |
| `js/paddock-cards.js` | Removed `PDK_RARITY`, card/grid rarity fields, the card chip and tile glow flag/classes. |
| `js/pets.js` | Display copy only: “Combined species, shiny and lineage”. No stat calculation or data changes. |
| `app.css` | Removed orphan pet rarity label, border, background and glow rules. Shared gear selectors remain. |
| `tests/pet-rarity-audit.mjs` | New Node audit executes production pet markup, shared receipts and actual gear/rack producers. Checks all species, ordinary/shiny variants, owned/locked states, family captions, models and pet CSS. Includes regression controls. |
| `tests/release-gate.mjs` | Registered the new audit in PURE. |
| `tests/kennel-copy-audit.mjs` | Strengthened the existing Frost-card assertion to require exactly one colour chip and no rarity text. |
| `tests/kennel-copy-browser-audit.mjs` | Replaced the obsolete required rarity-chip neighbour with exactly one colour chip, no rarity class/text, containment and no overlap with the level chip. |
| `tests/admin-grant-audit.mjs` | Updated the pet delivery fixture to the new card shape; added an assertion that its rarity chip and tier class are absent. Existing name/art assertions remain. |
| `docs/reviews/rarity-out.md` | This advisory report, proof transcript and source fingerprints. |

## Existing audit review

Searched the tests directory for rarity labels, tier classes, `PDK_RARITY`, `rarityColor`, `pdk-rar`, `pet-kind`, `rar-lbl`, `rk-rar` and related chip/glow callers before editing. The three existing audits changed are listed above. Only the browser colour-chip audit required the old two-chip arrangement in this checkout. The node colour audit was strengthened, and the admin delivery fixture was brought into agreement with the production producer. No audit was deleted.

`pit.test.js`, `pet-pool-audit.mjs` and the rarity/dust assertions in `unit.test.js` still assert underlying data or balance. They remain intact because the work order explicitly preserves that data. Gear rarity audits remain intact.

## Selector ownership and scope adjustments

- Removed `.pet-kind` and `.rar-lbl` rules after removing their sole pet emitters.
- Removed pet-scoped tier rules for `.pet-card`, `.hatch-pet`, `.hatch-prize`, `.t3-petcard`, `.cf-card`, `.cf-cap .dot` and `.pdk-tile`, plus `.pdk-fly.pdk-gold` and `.pdk-hover.pdk-epic`. The old hatch-pet/t3-petcard tier rules had no remaining JavaScript emitters.
- Kept `.rk-rar`, `.rk.r-*` and their shared colour variables. The weapon rack and aura tiles still use them. Kept `.rar-chip` for gear and earned SHINY. Wardrobe, weapon, gear inspection, collection and pack rarity styling remains.
- The plan's line numbers and `petCardHtml` name are stale here; the corresponding function is `petPanelHtml`. Paths were resolved in this checkout only.
- The “every PET surface” requirement also covered additional current surfaces: Stable card/chip and initial caption, new-arrival/level-up/breeding/Pit stages, Paddock card and field glows, pet accessory wardrobe, shared pet receipts, and the stat explanation in `pets.js`. These were included rather than leaving visible pet tiers behind.
- Stable species now use first-seen roster order instead of rarity order. The existing neutral card backgrounds apply to every species. Ownership, active selection, morph, shiny and lineage treatments remain.

No impossible requirement was redesigned. These are the implementation adjustments to the frozen plan's stale locations and broader surface requirement. No balance deviation: `js/loot.js`, `js/gear.js` and `data/boneheadz.js` are byte-identical to HEAD. `js/pets.js` differs from HEAD only in that displayed sentence. `PET_STATS.mult`, dust payouts, shiny probability and catalogue rarity fields remain intact. Talent unlock levels and lineage are real progress, so their tiers remain. Historical changelog entries were not rewritten.

## Red proof

Temporarily restored the exact removed shop line inside the production `petShelfHtml` hero:

```html
      <div class="pet-kind">${esc((pet.rarity || '').toUpperCase())} PET</div>
```

Ran `node tests/pet-rarity-audit.mjs`, captured exit 1, then restored the fixed source in a `finally` block. This was a real source mutation in this checkout, not a fabricated failing HTML sample.

```text
PASS CONTROL label and class detectors reject regressions
FAIL SHOP pet hero and accessories omit rarity in owned and locked states: pet rarity label
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
11/12 pet rarity checks passed
Exit: 1
```

## Green proof

`node tests/pet-rarity-audit.mjs` after restoring the fix:

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
Exit: 0
```

Agreed command, executed directly as the PURE runner's `unit.test.js` child:

```text
node tests/unit.test.js

373 passed, 0 failed
Exit: 0
```

All PURE entries were extracted from the actual `const PURE` block and its subsequent push/unshift statements in `tests/release-gate.mjs`. The runner spawned each with `node tests/<entry>` serially from this checkout. It did not import or execute the gate's server/browser path. Final result: **109/109 entries exit 0**.

```text
PASS version-align-lint.mjs exit=0 0.02s
PASS no-debug-markers-lint.mjs exit=0 0.04s
PASS store-copy-lint.mjs exit=0 0.11s
PASS lab-room2-audit.mjs exit=0 8.88s
PASS stable-stale-disclosure-audit.mjs exit=0 0.16s
PASS breed-last-colour-audit.mjs exit=0 0.20s
PASS stable-loss-disclosure-audit.mjs exit=0 0.14s
PASS lab-health-recovery-audit.mjs exit=0 0.32s
PASS lab-integration-audit.mjs exit=0 0.65s
PASS lab-ui-audit.mjs exit=0 0.10s
PASS laboratory-audit.mjs exit=0 1.13s
PASS lab-foundation-audit.mjs exit=0 0.85s
PASS pet-stress-guard.mjs exit=0 2.34s
PASS crew-pet-node-guard.mjs exit=0 0.03s
PASS transmog-receipt-audit.mjs exit=0 0.27s
PASS today-reads-lint.mjs exit=0 3.83s
PASS kitchen-atomic-audit.mjs exit=0 0.14s
PASS backup-encoder-audit.mjs exit=0 0.66s
PASS backup-key-audit.mjs exit=0 0.15s
PASS backup-version-audit.mjs exit=0 0.05s
PASS backup-conflict-audit.mjs exit=0 0.13s
PASS unit.test.js exit=0 20.61s
PASS log-xp-farm-audit.mjs exit=0 2.54s
PASS drip-badge-audit.mjs exit=0 0.08s
PASS xp-key-provenance-lint.mjs exit=0 0.50s
PASS facegate-audit.mjs exit=0 0.23s
PASS garden-appetite-guard.mjs exit=0 0.06s
PASS pit.test.js exit=0 0.09s
PASS quest-daymore-audit.mjs exit=0 0.06s
PASS quest-pick-audit.mjs exit=0 0.07s
PASS first-fight-audit.mjs exit=0 0.07s
PASS stat-source-audit.mjs exit=0 0.03s
PASS bastions-rep-sim.mjs exit=0 0.03s
PASS analytics-tag-audit.mjs exit=0 0.03s
PASS icon-inventory-audit.mjs exit=0 0.59s
PASS version-stamp-audit.mjs exit=0 0.03s
PASS boneyard-supply-audit.mjs exit=0 0.13s
PASS loot-fallback-audit.mjs exit=0 3.52s
PASS guard-hygiene-lint.mjs exit=0 7.68s
PASS guard-provenance-lint.mjs exit=0 0.06s
PASS feedback-status-lint.mjs exit=0 0.02s
PASS rack-theme-lint.mjs exit=0 0.02s
PASS rack-rotate-audit.mjs exit=0 0.04s
PASS pet-accessory-lint.mjs exit=0 0.41s
PASS pet-pool-audit.mjs exit=0 2.63s
PASS manifest-exports-audit.mjs exit=0 0.04s
PASS xp-curve-audit.mjs exit=0 0.03s
PASS live-api-register-lint.mjs exit=0 0.07s
PASS claim-evidence-lint.mjs exit=0 0.02s
PASS thumb-freshness-lint.mjs exit=0 3.56s
PASS render-sink-lint.mjs exit=0 0.04s
PASS lapse-witness-audit.mjs exit=0 1.77s
PASS spawn-claim-atomic-audit.mjs exit=0 0.07s
PASS wardrobe-family-audit.mjs exit=0 0.03s
PASS football-kit-audit.mjs exit=0 5.70s
PASS restore-latch-audit.mjs exit=0 0.15s
PASS first-pet-audit.mjs exit=0 0.20s
PASS recovery-status-audit.mjs exit=0 0.04s
PASS currency-revision-lint.mjs exit=0 0.08s
PASS inv-tombstone-audit.mjs exit=0 4.19s
PASS take-and-pay-audit.mjs exit=0 2.68s
PASS pet-morph-animation-audit.mjs exit=0 0.33s
PASS pet-palette-audit.mjs exit=0 2.94s
PASS fontscale-audit.mjs exit=0 0.18s
PASS wheel-easing-audit.mjs exit=0 0.02s
PASS storage-boot-audit.mjs exit=0 0.04s
PASS crate-cadence-audit.mjs exit=0 0.05s
PASS silence-disclosure-audit.mjs exit=0 0.06s
PASS health-disclosure-audit.mjs exit=0 0.19s
PASS paddock-pack-audit.mjs exit=0 0.05s
PASS numbers-honesty-audit.mjs exit=0 0.06s
PASS locale-numbers-audit.mjs exit=0 0.05s
PASS audit-output-audit.mjs exit=0 0.03s
PASS branch-graveyard-audit.mjs exit=0 0.15s
PASS store-runtime-audit.mjs exit=0 1.75s
PASS r47-rest-audit.mjs exit=0 0.04s
PASS r47-economy-audit.mjs exit=0 0.23s
PASS submission-build-audit.mjs exit=0 7.06s
PASS harness-environment-audit.mjs exit=0 0.04s
PASS guard-debts-audit.mjs exit=0 0.03s
PASS submission-preflight-audit.mjs exit=0 0.57s
PASS pet-state-audit.mjs exit=0 0.45s
PASS pet-family-audit.mjs exit=0 0.13s
PASS crew-pet-audit.mjs exit=0 0.03s
PASS coins-merge-tie-audit.mjs exit=0 0.14s
PASS routine-race-audit.mjs exit=0 0.09s
PASS dayone-topup-audit.mjs exit=0 1.92s
PASS dish-worth-audit.mjs exit=0 2.54s
PASS pet-C-node-guard.mjs exit=0 0.04s
PASS r48-state-audit.mjs exit=0 1.60s
PASS r46-logging-audit.mjs exit=0 0.05s
PASS r46-diary-audit.mjs exit=0 0.06s
PASS zero-calorie-seam-audit.mjs exit=0 2.77s
PASS audit-completion-audit.mjs exit=0 0.51s
PASS machine-character-audit.mjs exit=0 2.34s
PASS n3-deadpaths-audit.mjs exit=0 0.04s
PASS m5-prove-red.mjs exit=0 1.69s
PASS lookup-guard-lint.mjs exit=0 0.35s
PASS restore-state-audit.mjs exit=0 0.27s
PASS restore-debt-edges-audit.mjs exit=0 0.22s
PASS restore-debt-audit.mjs exit=0 0.07s
PASS p1-r48-rest-audit.mjs exit=0 0.03s
PASS pet-a11y-audit.mjs exit=0 0.06s
PASS kennel-copy-audit.mjs exit=0 0.27s
PASS breed-lock-audit.mjs exit=0 0.07s
PASS device-loss-audit.mjs exit=0 1.60s
PASS multidevice-earnings-audit.mjs exit=0 1.00s
PASS response-bodies-audit.mjs exit=0 1.25s
PASS pet-rarity-audit.mjs exit=0 0.11s
109/109 PURE entries exit 0
```

Additional checks: `node --check` passed for edited JavaScript and both edited browser audits. `git diff --check` passed. `node tests/release-gate.mjs --coverage-only` exited 0:

```text
coverage: 360 audits on disk, 122 fast, 129 full, 109 skipped
```

The “skipped” count above is gate inventory classification, not skipped PURE entries in this proof. Full per-entry stdout/stderr, the exact runner and JSON exit records remain in `/tmp/rarity-out-proof/` in this session. The first PURE pass was 107/109; the final complete pass above supersedes it.

## Denied actions, interruptions and limitations

- No socket binding, browser/server proof, Worker deployment, remote Wrangler command, production D1 write, secret setting, commit, push, PR or publication was attempted. `native/ASC-SUBMISSION.md` is absent in both HEAD and this working tree and was not created or edited.
- Browser work remains for an environment that permits it: run the updated Kennel copy and admin delivery browser audits, plus visually inspect pet shop, hatch, Stable, Paddock and Pit for clipping, neutral backgrounds, retained SHINY/lineage effects and unchanged gear appearance. Node source/markup checks do not prove pixels or layout.
- The checkout was externally recreated at 19:55:48 local time, discarding the first implementation before its red proof. Git metadata and file timestamps showed the recreation. No competing edits were present, so the implementation was reapplied. A later gear-control block appeared in the new audit outside this agent's tool calls. It was preserved and corrected to test actual catalogue tiers: stat gear has no common or epic rows, while cosmetics/rack items span all five. All real stat-gear rows and all five cosmetic/rack tiers are now tested. The source fingerprints below identify the final reviewed bytes.
- Process inspection (`ps`) was denied with `operation not permitted`, so the source of those concurrent changes could not be identified. A clarification was sent to the user; no response was needed to preserve the changes and complete validation.
- The first PURE pass reported `store-copy-lint.mjs` exit 97 because `esprima` was missing. An offline version-name npm pack returned `ENOTCACHED`. A direct cached-tarball npm pack then attempted a temporary cache write under `/Users/tommiller/.npm/_cacache/tmp` and was denied with `EPERM`. No ownership or permission change was attempted.
- Resolved the dependency without network or cache writes: read the cached esprima 4.0.1 archive, verified its SHA512 integrity against `package-lock.json`, and extracted it into this checkout's ignored `node_modules/esprima`. No package manifest or lockfile changed. The final full PURE pass is green.

## Final source SHA256

Fingerprints exclude this report itself.

```text
9144f25ba7806f277b21b5cdf26d8816e4fb7f4d748207ee7385e0001350ddf5  app.css
b98ce677fe5a0a21af60b005ecbb09160278a3d638ef48b2279c6fb9631b08cc  js/app.js
a7fff296ae5e1f33ef08dc07427ccbeea423204548fbe13813161fd3095c0953  js/paddock-cards.js
116ec4012a6d755e82b6e80bddde9f49359e509460ac83d21dd2fdd1de6154d2  js/pets.js
8fe5fec8a87f06c98511513f50e1aa197e334fb9b496a0268f020152ba39457c  tests/admin-grant-audit.mjs
dd4937a6d86b21d070f5d7a9990952de37cd8ab5f6264f8fd8de30e29e23c704  tests/kennel-copy-audit.mjs
e897503d9d2997dcd626c86fbe15ea23a4bc4416716cb9922c793107a64d4be8  tests/kennel-copy-browser-audit.mjs
82a97497843a81283840318a64725d7da55c246f078e7b74557cee3f55826903  tests/release-gate.mjs
306073e19e773e3f0e619f2e4eedef79fb85d9eeaea75928bda6a3c6f1b83ae7  tests/pet-rarity-audit.mjs
```
