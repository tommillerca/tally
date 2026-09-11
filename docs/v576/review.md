# v576 advisory review

Plan SHA256: `06c81cd91f9d24fbbb6e0a1bf00dec8c5aa225c21c5394a9aaeb0e92bd3d2822`, verified against the supplied plan file. All source edits are relative to this checkout.

## Findings and deviations

1. Claim settlement already read `r.ok` in this baseline. The actual defect was a server-confirmed takeover followed by local cap refusal: it paid only 40 coins, showed a cap warning, and skipped immediate ownership reconciliation. It now pays the earned 80 coins and tower card, attempts server reconciliation, and leaves durable server ownership available to the existing 60-second siege poll if local storage or fetching fails. Local claim exceptions become explicit failures. Offline plus local refusal returns the fight charge and says local persistence failed, instead of presenting an unsaved claim as pending. Remote refusals and already-owned answers retain their prior 40/25 payouts and do not make a local claim. This is a correction to the plan's diagnosis, not a new ownership authority. The guard executes the production settlement branch with cap refusal, successful local persistence, thrown writes, failed mirror updates, offline, refused, and already-owned responses. Live service and persistent-storage recovery have not been exercised end to end.

2. A deliberate `?api=` override previously persisted with no visible escape. Device report now includes the active base and identifies overrides. Its Use production API button clears the URL's `api` parameter, the stored override, and the in-memory cache. Unrelated query parameters, hash, and identity remain intact. The guard executes the production functions with a storage and history model, including another boot query read after reset. Device report wiring is source-checked; native taps are unverified.

3. UI audit decisions:

| Finding | Source evidence and decision | Guard after change |
| --- | --- | --- |
| Coins selected Shop, expected Crates | `coinBtn` is labelled Coins. Shop is the spending destination; the separately labelled crates control still opens Backpack. Stale expectation, no product reroute. | Requires Shop destination and existing production handler. |
| Character selected Crates, expected Wardrobe | The identifier is historical. The visible `charBtn` label is Backpack with a crate icon. Stale expectation. | Requires Backpack label and crates tab. |
| `dropToShop` missing | No production markup or handler remains for the retired Today drop. Current Shop navigation is covered by `coinBtn`. | Rejects the obsolete required control. |
| `spireToMap` missing | `mountSiegeBanner` creates it only for active siege rows and wires Boneyard navigation. A clean demo without a siege cannot exercise it. | Keeps the destination assertion when the banner exists; reports a skipped fixture requirement otherwise. This is partial siege coverage, not proof of that tap. |
| Bonehead at y=44 under notch | The old selector measures `#bhStage`, a deliberately full-bleed background. Character position is a separate absolute box. The CSS adds the safe-area bleed to its top. | Selects `#bhStage > .hero-char`; no CSS or figure geometry changed. Actual rendered notch clearance still requires browser review. |

4. Removed the duplicate v544 dated September 9. The September 10 entry agrees with the v544 claims section. The guard checks all changelog version numbers for uniqueness and pins the retained date.

5. Full rebuild means a call to `renderCharacter`, which replaces hub body/content markup. Counts below come from production handlers and their local call paths, not timing estimates. These findings were reported before changing the renderer caller. No shared renderer, figure engine, or sheet manager was refactored.

| Interaction and source anchor in js/app.js | Before | After |
| --- | ---: | ---: |
| Wardrobe fit switcher toggle, slot return scroll | 0 | 0 |
| Fit long press, successful apply, rename, save, confirmed delete, strip | 1 each | 1 each |
| Paperdoll slot, look/gear mode, gear family filter | 1 each | 1 each |
| Gear inspection, second-tap equip, explicit gear commit, confirmed gear melt | 1 each | 1 each |
| Cosmetic equip via restageWardrobe | 0 normally, 1 if worn gear or fallback | unchanged |
| Look preview/commit via restageLook | 0 normally, 1 on fallback | unchanged |
| Pet talent choice in place | 0 | 0 |
| Backpack single crate open, open-all completion | 1 each | 1 each |
| Den loot claim, hatch reveal completion | 1 each, delayed | 1 each, delayed |
| Successful Battle Charm activation (`useBoost`) | 1 | 1 |
| Refused Battle Charm activation (`useBoost`) | 1 | 0 |
| Vigor use | 1 | 1 |
| Melt selections, select all/junk/none, first confirm tap | 0 | 0 |
| Bulk melt completion | 1 total, not per piece | 1 total |
| Individual bench melt | 0 | 0 |
| Kitchen/Stable links | 0 hub rebuilds | 0 hub rebuilds |

The charm refusal is a small local win for stale state or another concurrent activation. Normally an active charm's button is already disabled. Larger reductions need coordinated updates to doll, stats, inventory, fit UI, and listener closures; deferred as architectural work. These are per-handler source counts, not a claim about unrelated asynchronous events or frame cost.

## Proof and limits

- Changed JavaScript files were copied to `/tmp/v576-check.mjs` and checked with `node --check` immediately after each edit. Every syntax check exited 0.
- Final regression guard: `node tests/v576-hunt-audit.mjs`, 9/9, exit 0. `red.txt` records all nine failures against `git show HEAD` source copies in `/tmp/v576-baseline`, exit 1. `green.txt` records final passing output.
- Agreed proof: `node tests/unit.test.js`, **391 passed, 0 failed**, exit **0**. Output: `unit.txt`.
- `node tests/r6-guards-audit.mjs`: exit 0. `git diff --check`: exit 0.
- Last verification: `node docs/v576/run-pure.mjs`, **181/181 passed, 0 failed**, exit **0**. The baseline tier contains 180 suites; the added regression guard makes 181, with 99 push/unshift mutation sites. It evaluates the literal PURE array plus every anchored `PURE.push` and `PURE.unshift` site, exactly as r6 does. Each child exit status is read directly through `spawnSync`, without a shell pipeline. Enumeration and per-suite exit codes are in `pure-results.json`; progress and final totals are in `pure-summary.txt`. Individual raw outputs are under `/tmp/v576-pure`.
- Browser audits and screenshots were not requested from any tool or run as standalone proof. Socket-binding browser verification is prohibited by this work order. The exact Today gap, Wardrobe dimensions, reachability and browser audit lock counts remain unverified here. `app.css` is byte-unchanged, including the inherited frozen prefix.
- No commit, push, merge, publication, original-checkout edits, or edits to `native/ASC-SUBMISSION.md`. No denied tool action occurred. Browser proof is the explicit blocked scope. No new product layout was proposed.

The initial full-tier attempt completed 179/181, exit 1 (initial-pure-summary.txt and initial-pure-results.json). It found two regressions, both corrected before the final run: the new audit lacked the positive-control marker required by guard-hygiene, and r47's source guard required `coins = 0` to be the first statement in the pending branch. The exercised settlement test now labels its control and asserts the branch was found. The zero assignment now precedes the refund await. Targeted output reports guard-hygiene clean and r47 10 passed, 0 failed. No expectation in either existing guard was weakened.

## Files changed

- `js/app.js`: claim settlement, Device report parameters, charm refusal rebuild, app stamp.
- `js/social.js`: API configuration and reset.
- `js/device-report.js`: API row and reset button.
- `js/changelog.js`: duplicate removal and v576 release entry.
- `sw.js`, `version.json`: remaining version stamps.
- `tests/ui-audit.js`: justified current control and character anchors, explicit siege fixture skip.
- `tests/v576-hunt-audit.mjs`: nine regression groups, source baseline option.
- `tests/release-gate.mjs`: register the new PURE guard.
- `docs/CLAIMS.md`: v576 changelog item and numbered PROOF/REACH row.
- `docs/v576/review.md`, `red.txt`, `green.txt`, `unit.txt`, `run-pure.mjs`, `pure-results.json`, `pure-summary.txt`, `initial-pure-summary.txt`, `initial-pure-results.json`: advisory findings and proof evidence.
