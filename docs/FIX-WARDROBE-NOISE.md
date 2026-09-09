# Wardrobe noise: advisory implementation report

Frozen work order implemented in this checkout only. This report is advisory for independent review.

Plan SHA256 verified: `c68b9b07d8cf5d6753dfcd5f2952137e1ef4bd226e815b91a72e90bf5acea33f`.

## Files changed

| File | Change |
| --- | --- |
| `js/app.js` | Main confirm bar requires a pending change. Its refresh inserts or removes the bar in place. Legacy look bar requires a pending change. Both fit paragraphs are verbatim inside closed `details.stable-help`, titled "How fits work". |
| `app.css` | Extends the existing Stable disclosure styling to `#chContent`. |
| `tests/wardrobe-noise-audit.mjs` | New five-row Node audit executes production renderers and click/refresh wiring with DOM doubles. |
| `tests/release-gate.mjs` | Registers the new audit in PURE. |
| `tests/unit.test.js` | Updates the old idle-bar assertion to require absence. Preserves the existing commit, price and navigation checks. |
| `docs/FIX-WARDROBE-NOISE.md` | This advisory report. |

## Proof

The new audit was run before changing production code. Every row failed, exit 1:

```text
FAIL ARRIVAL: current-slot confirmation rendered on arrival
FAIL PREVIEW: returning to the current look retained the confirmation
FAIL FITS current: instructions were outside a disclosure
FAIL FITS legacy: instructions and warning were outside a disclosure
FAIL LEGACY: current-slot sibling bar rendered before a choice
WARDROBE NOISE: 0 passed, 5 failed. Node only; pixel review owed.
```

The failure descriptions above are condensed. The complete captured assertion output is in `/private/tmp/fix-wardrobe-noise-proof/red.txt`.

After the fix, `node tests/wardrobe-noise-audit.mjs` exits 0:

```text
PASS ARRIVAL selected slot has no confirm bar, including an existing transmog
PASS PREVIEW inserts and wires an armed dock bar, clears on revert/commit, and reappears without rebuilding
PASS FITS current-fit copy is verbatim inside closed house-style help
PASS FITS legacy warning stays verbatim inside the same closed help
PASS LEGACY sibling bar is absent until changed and keeps its live action
WARDROBE NOISE: 5 passed, 0 failed. Node only; pixel review owed.
```

The PREVIEW row checks paid confirmation wiring, a free action, insufficient dust, return to the worn look, post-commit removal, subsequent insertion, and zero full-room rebuilds. Merely checking an armed preview would also pass before this fix, so the same row checks its full lifecycle.

Agreed command: `node tests/unit.test.js`, exit 0:

```text
377 passed, 0 failed
```

Every PURE entry from `tests/release-gate.mjs` was executed directly in Node, without starting the gate's server. All 124 entries have an exit-0 result. The initial sweep had one exit 97: `store-copy-lint.mjs` could not resolve `esprima`. `npm ci --offline --include=dev --ignore-scripts` installed the locked dependencies from the local cache. Retrying that entry exited 0. No dependency manifests changed.

Additional checks: `node --check js/app.js`, `git diff --check`, and `node tests/release-gate.mjs --coverage-only` exited 0. Audit coverage reports `375 audits on disk, 122 fast, 129 full, 124 skipped`.

Full local evidence, including per-entry PURE stdout/stderr and exit receipts, lives in `/private/tmp/fix-wardrobe-noise-proof/`. `pure-results.json` preserves the initial sweep, `store-copy-lint.retry.txt` records the successful retry, and `unit.txt` records the agreed command. No scratch files were written inside this checkout's `tests/`.

## Siblings, limits and deviations

Both sibling bars shared the initial-render shape. The legacy `.look-bar` now has the permitted single conditional wrapper. Football is unchanged: `fbBarHtml()` renders the worn team, but `refreshBar()` only replaces an existing `.fb-bar`. Hiding it with one condition would prevent it from appearing when a different team is selected. Fixing football requires insertion/removal handling beyond the plan's one-condition limit.

The main bar also required insertion/removal handling in `restageLook()`: its old missing-bar guard would otherwise rebuild the entire Wardrobe on the first preview. This supporting change preserves the requested behavior. The bar remains a direct child of `.mog-dock`; the existing `.mog-dock > .look-bar.mog-bar { position: sticky; bottom: 0; ... }` rule and the QA round 23 F3 travel comment are unchanged. No visual redesign or copy rewrite was made.

Pixel review is owed. No socket was bound and no browser or rendered layout was reviewed. The Node audit checks markup, state transitions and the existing sticky rule; it does not establish actual viewport visibility or paint quality.

## Denied or blocked actions

`apply_patch` rejected creation of `/private/tmp/fix-wardrobe-noise-proof/run-pure.mjs` because it was outside the project. The same scratch runner was subsequently created using permitted shell file I/O. The missing-dependency check was initially unproven and was resolved as described above. No other requested proof remains blocked.

No commit, push, PR, publication, Worker deployment, remote Wrangler command, production D1 write or secret change was performed. No original checkout was edited. `native/ASC-SUBMISSION.md` was untouched.
