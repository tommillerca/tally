R48-A advisory implementation report, 2026-09-07

Implemented within this checkout. No commit, push, publish, version stamp, changelog edit or PR. The agreed proof is not fully green: `node tests/unit.test.js` exits 1 with `362 passed, 1 failed`. Its unchanged server-lifecycle test invokes `serveTree` and fails in this restricted environment. The other 57 runnable PURE entries pass; one server-dependent PURE entry is blocked. Browser verification remains pending independent review.

The frozen plan file matched SHA256 `a73aadd8dad0d986a538ed9d023e27a688a4e035c8fc5796ded4695149836a0d`. Starting checkout HEAD was `b6b581da03c76366c35ac3cb19329426f1caa047`, with a clean working tree. Source paths were resolved here. No original checkout was edited.

Files changed:

- `data/boneheadz.js`
- `js/app.js`
- `tests/dressing-room-audit.mjs`
- `tests/emporium-audit.mjs`
- `tests/guard-hygiene-lint.mjs`
- `tests/hero-share-audit.mjs`
- `tests/purchase-write-failure-audit.mjs`
- `tests/release-gate.mjs`
- `tests/shop-door-audit.mjs`
- `tests/tabbar-contrast-audit.mjs`
- `tests/unit.test.js`
- `tests/r48-state-audit.mjs`
- `tests/R48-A-REPORT.md`

A1: `renderCharacter` now resolves the selected slot's artwork before deriving `baseArtId`. The existing preview, pricing, tile and Apply-control conditions all consume that resolved baseline. This is the Dressing Room presentation boundary, not a shared equipment rewrite. Unknown raw equipment stays in storage for a newer build to resolve. `equip`, `equipGear` and `equippedPetIid` retain their existing behavior. `bhAsset(undefined)` and `bhAsset(null)` independently return self-contained SVG placeholder art. Every known catalogue item's asset path is checked against its original mapping.

A2: each of the five audits consumes the `errors` array returned by `boot`. That shared collector attaches its `pageerror` listener before the first navigation and keeps collecting through later interactions. Each final assertion now evaluates `errors.length === 0` and prints the collected messages. The new guard-hygiene row scans both `ok` and `check` calls with quoted or template labels and a literal true verdict. It excuses ten exact file/label pairs with reasons and rejects stale or duplicated excusals. It is a lexical check for this shape, not a general proof that every assertion depends on the program.

A3: `refreshLevelChip` is a production function at module scope. Both fight settlement sites call it directly. Only its window alias is gated by `navigator.webdriver`. The Node guard executes the production settlement branches for a spar win and loss with webdriver false, using real storage, awards and XP reads. It checks the rendered level/name and XP text and the absence of the production alias. A webdriver-true control retains the alias. Existing R41-16 unit assertions were updated to require the production function and direct calls.

The new `r48-state-audit.mjs` is registered exactly once, in PURE, with a description. The existing browser-tier `dressing-room-audit.mjs` now restores absent and unknown equipped ids through both importAll modes, operates Wardrobe navigation, asserts nonempty visible content and no invalid Dressing Room controls, and decodes the placeholder. No second tier registration was added. Release-gate coverage exits 0:

```
coverage: 301 audits on disk, 114 fast, 128 full, 59 skipped
```

Red and green evidence was captured using throwaway copies under `/tmp/r48-a-proof/red-tree`. Original affected production and audit files were restored there from byte copies saved before editing. Mutations asserted their expected occurrence counts before replacement. Exit codes were written to separate `.exit` files, never read through a pipe. The working checkout was never reverted for proof. After the mutations, the throwaway files were restored to the fixed versions.

A1 original-code red, `r48-state-audit.mjs`, exit 1:

```
FAIL RESTORE replace unknown truthy H keeps Dressing Room markup: rendered 0 characters; Cannot read properties of undefined (reading 'file')
FAIL RESTORE merge unknown truthy H keeps Dressing Room markup: rendered 0 characters; Cannot read properties of undefined (reading 'file')
FAIL BOUNDARY unknown artwork never reaches asset generation or Apply controls: Dressing Room passed unresolved artwork to bhAsset
FAIL ASSET undefined and null return a drawable placeholder; every catalogue asset is unchanged: Cannot read properties of undefined (reading 'file')
```

These character counts come from executing the real extracted Dressing Room setup and markup builder after real importAll/equipment reads. They are not a claimed browser measurement of the full Wardrobe. Browser arrival and image decoding remain unrun.

A1 fixed green:

```
PASS RESTORE replace unknown truthy H keeps Dressing Room markup
PASS RESTORE merge unknown truthy H keeps Dressing Room markup
PASS BOUNDARY unknown artwork never reaches asset generation or Apply controls
PASS ASSET undefined and null return a drawable placeholder; every catalogue asset is unchanged
```

A2 original-code red uses the actual boot listener with a Node EventEmitter and evaluates each audit's actual final assertion against two emitted errors. It does not claim that a browser was launched or that js/app.js was injected in a live page:

```
FAIL ERRORS emporium observes clean, first-load and later errors: emporium: two collected errors still report PASS
FAIL ERRORS hero-share observes clean, first-load and later errors: hero-share: two collected errors still report PASS
FAIL ERRORS shop-door observes clean, first-load and later errors: shop-door: two collected errors still report PASS
FAIL ERRORS purchase-write-failure observes clean, first-load and later errors: purchase-write-failure: two collected errors still report PASS
FAIL ERRORS tabbar-contrast observes clean, first-load and later errors: tabbar-contrast: two collected errors still report PASS
```

All five corresponding `PASS ERRORS ...` rows are green after the fix, including clean-stream positive controls and a check that each audit consumes boot's pre-navigation stream.

The final lint against the five original audit files exits 1 and names exactly these five offenders:

```
FAIL  LITERAL-TRUE no audit asserts a constant success (including NO page errors)  emporium-audit.mjs:233 NO page errors | hero-share-audit.mjs:424 NO page errors | purchase-write-failure-audit.mjs:143 NO page errors | shop-door-audit.mjs:197 NO page errors | tabbar-contrast-audit.mjs:107 NO page errors
ok    LITERAL-TRUE the ten justified reports are excused exactly once  10 excused; 0 stale or duplicated
```

Restoring the fixed five gives exit 0. Adding a new real constant-success call to the throwaway `figure-audit.mjs`, a file with an existing legitimate excusal, gives exit 1 again:

```
FAIL  LITERAL-TRUE no audit asserts a constant success (including NO page errors)  figure-audit.mjs:907 R48 new false assurance
ok    LITERAL-TRUE the ten justified reports are excused exactly once  10 excused; 0 stale or duplicated
```

Removing that new offender gives exit 0:

```
ok    LITERAL-TRUE no audit asserts a constant success (including NO page errors)  0 offenders
ok    LITERAL-TRUE the ten justified reports are excused exactly once  10 excused; 0 stale or duplicated
guard-hygiene: clean
```

The ten excusals are: figure decoder prerequisites; selector fixture prerequisites; suite-rot fixture prerequisites; two XP provenance branches; the boneyard egg-drawn branch; two boneyard minimum-sample branches; wardrobe family ownership prerequisites; and Dressing Room ownership prerequisites. Exact labels and individual reasons are recorded in the lint. Its separate seam inventory documents that the new Node audit reads the window alias to assert its absence, never to invoke the feature.

A3 original-code red, with both production settlement paths still executing:

```
FAIL CHIP webdriver=false win refreshes production level and XP: production leaks the webdriver alias
FAIL CHIP webdriver=false loss refreshes production level and XP: production leaks the webdriver alias
```

A separate throwaway gate-only mutation preserves the fixed artwork path, gates the old window definition and leaves both optional window calls. It exits 1 with exactly two failures:

```
FAIL CHIP webdriver=false win refreshes production level and XP: settlement never read XP
FAIL CHIP webdriver=false loss refreshes production level and XP: settlement never read XP
r48-state: 12 passed, 2 failed
```

The final fixed Node audit exits 0:

```
PASS CHIP webdriver=false win refreshes production level and XP
PASS CHIP webdriver=false loss refreshes production level and XP
PASS CONTROL webdriver=true retains the test alias
r48-state: 14 passed, 0 failed
```

The 69-guard sweep cannot establish class closure. Its historical selection criterion is not present in this checkout or the supplied plans; the only located references state the count and ask this same question. I cannot recover its criterion or honestly say it would have found the live pet defect. That provenance gap is a deviation from the requested historical answer, not evidence of pet coverage.

Proposed replacement lint: derive a selector-flow inventory from all production js/ and data/ modules. Select persisted or external identifiers read from kvGet, imported backups, local storage, instance rows and profile snapshots, then follow aliases and helper returns into catalogue index/.find/Map.get lookups and into artwork, species, combat and control-building consumers. Require a successful resolved-object guard or a registered membership validator before those sinks. A truthiness test on the original id must not discharge the requirement. Include raw equipment writers as sources, so equip, equipGear and equippedPetIid cannot bypass the inventory.

A finite validator/source/sink registry needs exact reasons for exemptions and must fail for new unclassified selector flows or stale exemptions. Positive and mutation controls must include absent H, unknown truthy H, unknown C99, valid species, and null instance rows. The pet flow must require isKnownPet before rendering/fighting and legalPicks for talent choices. Under that proposed criterion the old pet case is explicitly covered: a truthy unsupported species reaching pet render/combat is rejected. JavaScript dynamic flows that cannot be traced must be reported unclassified and fail the inventory, rather than count as inspected. This lint is proposed, not implemented or claimed green; these two artwork patches do not close the class.

PURE inventory below was evaluated from the initial array and all 13 PURE.push/PURE.unshift statements in `tests/release-gate.mjs`, retaining their order. There are 59 unique entries. Individual stdout/stderr and separate exit files are in `/tmp/r48-a-proof/pure/`; the unit output is `/tmp/r48-a-proof/unit.txt`. Guard hygiene was rerun after the justified seam-inventory entry, and its final output is `/tmp/r48-a-proof/lint-green.txt`.

| PURE file | Final exit/status |
| --- | --- |
| `version-align-lint.mjs` | 0 |
| `no-debug-markers-lint.mjs` | 0 |
| `store-copy-lint.mjs` | 0 |
| `transmog-receipt-audit.mjs` | 0 |
| `today-reads-lint.mjs` | 0 |
| `kitchen-atomic-audit.mjs` | 0 |
| `backup-encoder-audit.mjs` | 0 |
| `backup-key-audit.mjs` | 0 |
| `backup-version-audit.mjs` | 0 |
| `backup-conflict-audit.mjs` | 0 |
| `unit.test.js` | 1 |
| `log-xp-farm-audit.mjs` | 0 |
| `drip-badge-audit.mjs` | 0 |
| `xp-key-provenance-lint.mjs` | 0 |
| `facegate-audit.mjs` | 0 |
| `garden-appetite-guard.mjs` | 0 |
| `pit.test.js` | 0 |
| `quest-daymore-audit.mjs` | 0 |
| `quest-pick-audit.mjs` | 0 |
| `first-fight-audit.mjs` | 0 |
| `stat-source-audit.mjs` | 0 |
| `bastions-rep-sim.mjs` | 0 |
| `analytics-tag-audit.mjs` | 0 |
| `icon-inventory-audit.mjs` | 0 |
| `version-stamp-audit.mjs` | 0 |
| `boneyard-supply-audit.mjs` | 0 |
| `loot-fallback-audit.mjs` | 0 |
| `guard-hygiene-lint.mjs` | 0 |
| `guard-provenance-lint.mjs` | 0 |
| `feedback-status-lint.mjs` | 0 |
| `rack-theme-lint.mjs` | 0 |
| `rack-rotate-audit.mjs` | 0 |
| `pet-accessory-lint.mjs` | 0 |
| `pet-pool-audit.mjs` | 0 |
| `manifest-exports-audit.mjs` | 0 |
| `xp-curve-audit.mjs` | 0 |
| `live-api-register-lint.mjs` | 0 |
| `claim-evidence-lint.mjs` | 0 |
| `thumb-freshness-lint.mjs` | 0 |
| `render-sink-lint.mjs` | 0 |
| `lapse-witness-audit.mjs` | 0 |
| `spawn-claim-atomic-audit.mjs` | 0 |
| `wardrobe-family-audit.mjs` | 0 |
| `football-kit-audit.mjs` | 0 |
| `restore-latch-audit.mjs` | 0 |
| `first-pet-audit.mjs` | 0 |
| `currency-revision-lint.mjs` | 0 |
| `inv-tombstone-audit.mjs` | 0 |
| `take-and-pay-audit.mjs` | 0 |
| `submission-preflight-audit.mjs` | 0 |
| `pet-state-audit.mjs` | 0 |
| `pet-family-audit.mjs` | 0 |
| `coins-merge-tie-audit.mjs` | 0 |
| `routine-race-audit.mjs` | 0 |
| `dayone-topup-audit.mjs` | 0 |
| `dish-worth-audit.mjs` | 0 |
| `serve-tree-identity-audit.mjs` | BLOCKED |
| `pet-C-node-guard.mjs` | 0 |
| `r48-state-audit.mjs` | 0 |

The agreed command's complete summary and failure text:

```
FAIL serveTree does not hold the event loop open after the script ends
  serveTree kept node alive, so a self-serving audit can never exit: Command failed: [node --input-type=module subprocess importing tests/godmode.js and awaiting serveTree(this checkout)]
362 passed, 1 failed
```

The actual output, including absolute subprocess paths, is preserved in `/tmp/r48-a-proof/unit.txt`; exit 1 is in `unit.exit`. That test suppresses child stdout/stderr, so its output does not establish a more specific socket-level failure cause. Its assertion was not changed, skipped or weakened. Proposed deviation: the independent reviewer runs the same unit command and serve-tree-identity-audit in an environment permitted to bind sockets. Full success criteria remain unmet until those proofs are green.

Denied and blocked actions: no approval-review rejection occurred. No standalone browser or server proof was launched. The explicitly agreed unit command itself attempted its server-dependent child and failed. `serve-tree-identity-audit.mjs` was inspected and left unrun because it calls serveTree and binds local sockets. The five fixed browser audits and the expanded Dressing Room browser audit were not run, per the work order. Expected browser results are PASS for a clean error stream, FAIL/nonzero when real page errors are injected, and passing RESTORE/ASSET rows with nonempty Wardrobe content and a decoded placeholder. These are expectations, not recorded browser passes. The Node chip proof uses DOM adapters; it is not a browser pixel proof.

Other constraints and deviations: `CLAUDE.md` was read; `tally/CLAUDE.md` does not exist relative to this checkout. No original-checkout contract was substituted. `js/spires.js`, `js/social.js`, native files and integ/day5 were untouched. The shared pet helpers already exist and are imported by app.js; no new helper dependency was needed. The plan's commit/push instruction was overridden by the user's explicit no-commit/no-push request. `docs/CLAIMS.md` was not edited because strict lane ownership permits only js/app.js, data/boneheadz.js and tests/. The exact proposed single section for its owner is:

```
## 2026-09-07 R48-A

CLAIM: Restored unknown equipped artwork leaves the Dressing Room usable; bhAsset supplies a placeholder for unresolved artwork.
PROOF: r48-state-audit.mjs
PROOF: dressing-room-audit.mjs

CLAIM: Five browser audits assert the collected page-error stream, and literal-success assertions require an exact justified excusal.
PROOF: guard-hygiene-lint.mjs
PROOF: r48-state-audit.mjs

CLAIM: Production win and loss settlement refresh Today's level and XP while the window test alias is webdriver-only.
PROOF: r48-state-audit.mjs
PROOF: unit.test.js

STATUS: Node R48 and guard hygiene proofs pass. Unit server-lifecycle proof fails in the restricted environment. Browser and server proofs remain pending independent review.
```

`git diff --check` passes. This report is advisory and does not replace independent review.
