# Lookup guard review, 2026-09-07

L7 follow-up, 2026-09-08: [measured counterexamples](L7-guardlint.md) show that
removing either false positive's real validation leaves the findings identical
and the lint green. The reviewed-site identity does not include validation
provenance. Its PASS therefore cannot certify even that the reviewed boundaries
remain healthy. No scanner change or seven-incident coverage is claimed.

The current tree produces **2 true positives for missing boundary validation,
2 false positives, and 0 proven crashes** across 4 candidates. Precision is 50%
for the boundary-validation rule. This is not evidence of 50% crash detection
or coverage of all seven historical incidents.

| Site in js/app.js | Classification | Evidence |
| --- | --- | --- |
| `p.pet.id` into `petPortraitHtml` | True positive: boundary debt | The peer snapshot id is checked only for presence. An unknown species reaches the renderer. Terminal fallbacks mean this is not a demonstrated crash. |
| `p.pet.id` into `petSpriteHtml` | True positive: boundary debt | The friend profile tests presence without checking catalogue membership. Unknown ids can reach the renderer; no crash is established. |
| `lurkSp` into `bhAsset(BH_BY_ID[lurkSp])` | False positive | `shinyGaps` filters ids against catalogue slot C before selecting `lurkSp`. The scanner does not trace that producer. |
| `petArtId` into `petSpriteHtml` | False positive | The same expression explicitly checks `BH_BY_ID[petArtId]`. The id-consumer rule notices the truth test but fails to account for that intervening validation. |

The implementation is a bounded lexical scanner. It recognizes selected bare
truth tests, indexed lookups, one local alias, and truth-only filters reaching
registered consumers. It masks strings/comments and scans template expressions.
It does not perform general control-flow or dataflow analysis, prove reachability,
follow arbitrary assignments or helper calls, or cover every JavaScript syntax
form. Registered consumers are currently only `bhAsset`, `petSpriteHtml`, and
`petPortraitHtml`. Collection-to-consumer matching within a block is heuristic.

Keep it as a small reviewed-candidate ratchet. Every new occurrence requires
review, including duplicates, and stale reviews fail. Its 13 fixtures and
`m5-prove-red.mjs` exercise supported shapes, including reversions of the actual
species filter and equipped-art validation. Those two red mutations do not
establish recall across the whole defect class.

The complete shape cannot be caught reliably by cheaply extending these regular
expressions. A broader guarantee needs catalogue-aware validation at data ingress,
runtime guards using present-but-unknown ids at the final consumer, and, if static
coverage is required, an AST/control-flow approach. The two existing false
positives are explicitly reviewed, not evidence that the boundary debts are safe
or that every related defect is prevented. K1 changes no scanner rule or review
allowance.

`tests/lib/lookup-guard-scan.mjs` is an imported helper with no assertions of its
own. The runnable audit is `tests/lookup-guard-lint.mjs`, registered once in PURE.
There is no `tests/lookup-guard-scan.mjs` in this checkout.
