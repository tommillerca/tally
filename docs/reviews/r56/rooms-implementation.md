Advisory implementation report: frozen Stable and Laboratory work order

Implemented in this checkout only. The supplied plan's SHA256 matched
`8c74606a455562baa9c87fa79bf8451d03843393d5ac1adc7620098aa8df663a`.
Read sections A, A2, C and D of `docs/PLAN-r56-playtest.md`, the review evidence,
and the existing Stable capture. No original checkout was edited.

Files changed:

| File | Change |
| --- | --- |
| `js/app.js` | Pet carousel precedes room navigation. Paddock artwork and all doors remain; Kennel is a secondary collection link. Bone Dust uses a labelled balance row. Scattered help moves into one closed disclosure. Laboratory choices show art, identity and level; picker investment details remain visible beside the button and linked through `aria-describedby`. The other slot's exact instance is excluded, while identical eligible partners remain selectable. Bench and review group two inputs with a plus, followed by a distinct outcome group with a directional arrow, “Could become”, “or”, and quote-derived percentages. Guaranteed Midnight says “Will become”. All warning prose remains visible in review. |
| `app.css` | Quiet, consistent room navigation; stronger pet stat values; compact actions; display-font pet-choice buttons; differentiated outcome groups and supporting text hierarchy. |
| `tests/lab-ui-audit.mjs` | Production-renderer guards for picker exclusion in both slots, identical partners, empty filters, display font, compact choices, accessible investment details, and separated input/output art for all three recipes. Each new group includes healthy CONTROL cases and rejected faulty variants. Updated the narrow-screen mutation to match the current layout rule. |
| `tests/breed-lock-audit.mjs` | Extends the real Stable template guard: one closed help disclosure, zero scattered explainers, labelled currency, one carousel and all three doors after it. Includes rejected clutter and missing-capability variants. Existing cooldown checks remain. |
| `tests/paddock-pack-audit.mjs` | Keeps the collection-unit guard aligned with the shorter “colours collected” label and its ordinary-species denominator. Adds a faulty “pets” label CONTROL. |
| `docs/reviews/r56/rooms-implementation.md` | This advisory report. |

Local dependency preparation only: restored ignored `node_modules/esprima/`
from the existing npm cache. Version 4.0.1 and tarball integrity match
`package-lock.json`. No dependency manifest or lockfile changed; no network
installation was needed.

Proof output:

```text
node tests/unit.test.js
370 passed, 0 failed

Full PURE manifest from tests/release-gate.mjs, with its audit-lifecycle preload:
PURE: 99/100 passed, 1 failed or unproven

lab-ui-audit.mjs: 30 passed, 0 failed
breed-lock-audit.mjs: 7 passed, 0 failed
paddock-pack-audit.mjs: 6/6 guards pass
kennel-copy-audit.mjs: 16 passed, 0 failed

node tests/m5-prove-red.mjs
m5-prove-red: PASS
```

The full PURE tier is not green. Its sole remaining failure is
`m5-prove-red.mjs` under the gate's `audit-lifecycle.mjs` preload. M5's healthy
and deliberately broken variants all return their expected statuses, but the
preload treats the printed expected child failures as failures of M5 itself.
The identical failure was reproduced on a temporary copy of the untouched HEAD
application, with seven retained expected failures. Direct M5 execution exits 0.
The unrelated gate wrapper was left unchanged.

All 100 PURE entries were extracted from the actual gate declaration, including
its `push` and `unshift` registrations, and run sequentially with the gate's
preload and final-receipt check. The complete gate command was not run because it
also starts a server and browser tiers. Initial missing-dependency and stale-guard
failures were resolved before the final full PURE run.

Additional proof: syntax and `git diff --check` pass. A differential renderer
check against HEAD confirms exact preservation of all warning paragraphs and
escalation across all three recipes, each with ordinary and invested inputs.
The quote validation, shared destructive confirmation handler, and Laboratory
review/transaction-dispatch block remain byte-identical. No recipe, odds,
protection, transaction or art asset changed. No em dashes were added.

Complete local proof files, runner, 100-suite manifest, exit receipts and baseline
comparison are in `/private/tmp/fix-rooms-proof/`. In particular:
`unit-test-output.txt`, `pure-output.txt`, `pure-results.json`,
`pure-manifest.json`, `warnings-output.txt`, `m5-standalone.txt`, and
`m5-baseline-preloaded.txt`.

Scroll heights and browser limits:

| Surface at the requested 393x852 viewport | Achieved scroll height |
| --- | --- |
| Stable | Unmeasured: no connected browser |
| Laboratory | Unmeasured: no connected browser |

Browser setup returned “No browser is available”; discovery returned an empty
list. Rendered heights, actual font rendering, art decoding, visual hierarchy,
narrow-screen/text-zoom reflow, focus, hit targets and live picker interactions
remain unverified. The supplied 1,229px Stable and 1,830px Laboratory values are
baseline observations, not measurements of this change. Static guards do not
establish pixel correctness.

Denied actions: none. Blocked proof: browser measurements and a green result from
the existing PURE wrapper as described above. No commit, push or publish was
attempted.

Deviations: no functional or safety-copy deviation. The instruction to strip
button prose is implemented on the choice buttons; the required warning prose
remains below the visual equation. A completely prose-free destructive review
would conflict with the literal warning-preservation rule. The proposed treatment
is the implemented separation of compact art from unchanged, visible warnings.
The requested all-green PURE result and measured scroll heights could not be
provided; these are explicit proof limitations, not claimed successes.
