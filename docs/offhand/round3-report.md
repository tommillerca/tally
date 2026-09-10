# Off-hand Round 3 candidate review

Status: **UNVERIFIED. These offsets await the operator's render.** No correct-grip or rendered-gap claim is made. Nothing was committed, pushed, published or shipped. No version stamp changed.

The frozen plan's SHA256 matched `ffef99ca481578492aa8085527b32e655cb9619c886a652987ef88ca374f6d69`. All source edits resolve inside this checkout. Round 3 explicitly authorizes candidate application before rendering and supersedes the earlier stop-before-editing rule.

## Candidates and reasoning

| Item | 640-master offset (dx, dy) | Existing operator capture | Rendered before/after gap |
|---|---:|---|---|
| IL10-1 | (-104, +48) | [Before](oh-before-IL10-1.png) | Not reliably measured / blocked |
| IL10-2 | (-104, +48) | [Before](oh-before-IL10-2.png) | Not reliably measured / blocked |
| IL17-1 | (-64, +48) | [Before](oh-before-IL17-1.png) | Not reliably measured / blocked |
| IL17-2 | (-64, +48) | [Before](oh-before-IL17-2.png) | Not reliably measured / blocked |
| IL7-1 control | Unchanged | [Control](oh-before-IL7-1.png) | No new render |

The spade offsets are the frozen Round 3 starting candidate. Visual inspection of the supplied brush and control captures confirms the relationship still needs work. In the masters, the brush's handle opening is approximately 40 pixels farther right than the spade's opening, at approximately the same height. The brush candidate therefore adds 40 pixels of left translation to the operator's spade guess and uses the same downward translation. This is a visual starting heuristic, not a source-to-render coordinate conversion, a composite-based registration proof, or a converged answer. The existing [empty-slot capture](oh-base-none.png) remains available for the operator's stage-only pixel comparison.

## Pixel preservation

Before each write, the frame-loss preflight printed `visible pixels leaving frame=[]`. No visible pixel was clipped, including alpha <= 30 export dust. Integer, unmasked RGBA copies translated the 640x640 masters without redraw, recolour, scaling, blending or resampling. The saved PNGs were reopened and compared byte-for-byte in decoded RGBA with the intended result.

| Item | Visible pixels preserved | Alpha > 0 box before | Alpha > 0 box after | Alpha > 30 box before | Alpha > 30 box after |
|---|---:|---|---|---|---|
| IL17-1 | 15043 | (362,38,632,360) | (298,86,568,408) | (364,40,543,358) | (300,88,479,406) |
| IL17-2 | 15034 | (362,38,640,359) | (298,86,576,407) | (364,40,542,357) | (300,88,478,405) |
| IL10-1 | 18575 | (344,0,604,365) | (240,48,500,413) | (346,1,602,363) | (242,49,498,411) |
| IL10-2 | 18542 | (344,0,603,364) | (240,48,499,412) | (346,1,601,362) | (242,49,497,410) |

For each item, assertions passed and printed: surviving pixels are byte-exact; the surviving RGBA multiset is unchanged; the entire visible RGBA multiset is unchanged; both ink boxes moved by exactly the requested offset. Boxes are half-open. [Machine-readable proof](candidate-pixel-proof.json) retains the original and candidate PNG SHA256 values.

All three derived tiers for each item were regenerated using the project's own `scripts/build-bh-thumbs.py` implementation: import that module, call `wanted(master.convert('RGBA'), 'IL/<id>.png')`, and save each yielded image with `optimize=True`. The 192 and 384 square tiers changed. All four trim thumbnails regenerated to their existing bytes, as expected for a translation with no ink loss. No unrelated thumbnails were rewritten.

## Source diagnostic

`node tests/hand-registration-audit.mjs` exited **1 before and after**, informational only. Its historical scoring and failure exit remain intact. The header now agrees with its diagnostic-only status. A stale duplicate `DECLARED` entry with tier `fast` was removed from `tests/release-gate.mjs`, leaving the existing explicit `skip` and helper registration in place. No rendered guard is claimed or restored.

| Item | Source core before / after | Source ring before / after |
|---|---:|---:|
| IL10-1 | 0 / 0 | 0 / 154 |
| IL10-2 | 0 / 0 | 0 / 152 |
| IL17-1 | 26 / 0 | 267 / 112 |
| IL17-2 | 22 / 0 | 264 / 103 |
| IL7-1 | 536 / 536 | 1095 / 1095 |

The brush scores rise above the historical 150 floor while the spade scores fall below it. Both states have two historical failures. This swing is disclosed for review, not used to accept or reject the candidate offsets. Full [before output](diagnostic-before.txt) and [after output](diagnostic-after.txt) are retained.

## Material source-check failure

The unchanged `facegate-audit.mjs` exits **1**, naming all four candidates. Using its own alpha > 40 mask and skull-derived face zone, [the source comparison](facegate-comparison.txt) reports:

| Item | Original face-zone overlap | Candidate face-zone overlap | Existing limit |
|---|---:|---:|---:|
| IL10-1 | 0.74% | 68.65% | 2% |
| IL10-2 | 0.76% | 68.65% | 2% |
| IL17-1 | 0.62% | 36.51% | 2% |
| IL17-2 | 0.70% | 36.74% | 2% |

This is a new source-check failure caused by the candidates, not a passing audit or rendered occlusion measurement. The original values were read from this checkout's HEAD assets without modifying them. The requested candidates remain applied for operator review. The facegate threshold and implementation remain unchanged. Rendered comparison, including face visibility, is required before accepting the art; another candidate round may be necessary.

## Proof and blocked actions

- Agreed command: `node tests/unit.test.js`. Output: `384 passed, 0 failed`. [Full output](unit-output.txt).
- `node tests/thumb-freshness-lint.mjs`: exit 0 in the complete enumeration, including the full sheet check and stale/missing-thumbnail controls.
- `node tests/release-gate.mjs --coverage-only`: exit 0, `coverage: 406 audits on disk, 123 fast, 129 full, 154 skipped`.
- All 154 PURE entries were enumerated directly from the current gate's array and push/unshift statements, with a minimum-152 and duplicate check. [Enumeration and exits](pure-results.txt); [full per-command output](pure-output.txt). Final result: **153/154 exited 0; facegate-audit.mjs exited 1 with all four candidate items failing.** No PURE entry was skipped or timed out. The unit entry reuses the agreed command's completed result. This is not a PURE-green or release-green claim. Browser proof is separately blocked.
- The operator's render command was attempted in this checkout and exited 1 before capturing any frame: `listen EPERM: operation not permitted 127.0.0.1`. [Exact failure output](render-attempt.txt). No new after screenshots or rendered measurements exist. Browser acceptance and convergence remain blocked. No attempt was made to bypass the sandbox.

Operator command, from this checkout:

```sh
HEADLESS_MODE=shell node /tmp/offhand-fix-real-render.mjs "$PWD" after
```

Compare all four after captures with the unchanged IL7-1 control in the same geometry before accepting any candidate. The operator must still judge whether each handle passes through the fist and iterate if needed.

## Deviations and changed files

No deviation from the corrected Round 3 scope. The earlier rounds' before/after convergence and rendered-gap proof remain explicitly deferred under Round 3. The brush numeric candidate was left to this lane by the frozen order and is explained above. The duplicate diagnostic gate declaration was reconciled with the required diagnostic-only status, without changing any score or threshold.

Changed production assets: `assets/bh/IL/{IL10-1,IL10-2,IL17-1,IL17-2}.png` and their eight square thumbnails at `assets/bh/thumb/{192,384}/IL/`. The four regenerated trim files are byte-unchanged.

Changed text: `tests/hand-registration-audit.mjs`, `tests/release-gate.mjs`, `docs/CLAIMS.md`, `js/changelog.js`. There is one pending changelog item and one matching vNEXT PROOF row, explicitly pending rendered proof.

New evidence: this report and `candidate-pixel-proof.json`, `diagnostic-before.txt`, `diagnostic-after.txt`, `unit-output.txt`, `pure-results.txt`, `pure-output.txt`, `render-attempt.txt`, `facegate-comparison.txt` under `docs/offhand/`.

The off-limits files `js/app.js`, `js/pets.js`, `js/loot.js`, `js/db.js` and `js/social.js` were not edited. No original checkout was edited.
