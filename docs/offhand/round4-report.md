# Off-hand Round 4 advisory

The exact frozen Round 4 offsets are applied in this checkout. Acceptance is incomplete: unit proof passes, but the complete PURE census is **158/159 exit 0**, with `facegate-audit.mjs` failing on all four changed masters. Nothing was committed, pushed, published or shipped. No version stamp changed.

Plan SHA256 verified: `8d921467948129ac3aa17a737bdb9ec91ecbb2b1808f611e2b326da724f50075`. All source paths were resolved relative to this checkout. No original checkout was edited.

## Art and pixel proof

The first mutation restored IL1-1, IL1-2, IL1-3, IL2, IL5 and IL9 from this checkout's HEAD. Each `git hash-object` matched its HEAD blob immediately afterward. [Printed hashes](round4-restored-hashes.txt). They were already clean at entry and remain byte-identical to HEAD after all checks.

| Master | Offset (dx, dy) | Alpha > 0 ink box before | Alpha > 0 ink box after | Lost alpha > 0 |
| --- | --- | --- | --- | --- |
| IL17-1 | (0, +40) | (362,38,632,360) | (362,78,632,400) | 0 |
| IL17-2 | (0, +40) | (362,38,640,359) | (362,78,640,399) | 0 |
| IL10-1 | (-40, +45) | (344,0,604,365) | (304,45,564,410) | 0 |
| IL10-2 | (-40, +45) | (344,0,603,364) | (304,45,563,409) | 0 |

All four loss preflights printed before any master write. All asserted zero visible loss, including export dust. Each surviving RGBA multiset and the complete visible RGBA multiset are unchanged. Alpha > 0 and alpha > 30 ink boxes both moved by exactly the required offset. Integer unmasked copies performed no redraw, recolour, scaling, blending or resampling. Reopened PNGs matched the intended decoded bytes. [Printed assertions](round4-pixel-proof.txt), [hashes and structured proof](round4-pixel-proof.json). A separate final check compared every saved RGBA pixel directly against this checkout's HEAD translated by the specified offset: [final integrity proof](round4-final-integrity.txt).

The project's `scripts/build-bh-thumbs.py` module generated all three tiers through its `wanted()` function, saving each image with `optimize=True`. All eight square thumbnails changed; all four trim files regenerated to identical bytes. The complete thumbnail freshness audit exited 0, including its controls.

## Alignment evidence and limits

The frozen Round 4 instruction supplies the operator's acceptance after four shipping-avatar render-and-look rounds against correctly held IL7-1 Blue Katana. This is the alignment evidence attributed in the single vNEXT PROOF row matching the single pending changelog item. It is not a source-composite conclusion.

The order supplies no individual run names or complete per-round offset history. CLAIMS identifies operator rendered search rounds 1, 2, 3 and 4 and records only the actual comparisons described by the order. Existing before captures and the katana control are linked there. Existing `oh-after-*.png` files are historical candidate evidence, not certified final-offset captures, and were preserved.

A fresh capture attempt failed before rendering with `listen EPERM: operation not permitted 127.0.0.1`, exit 1. [Full failure](round4-render-attempt.txt). No new screenshot pair or numeric rendered gap is claimed. Operator command from this checkout:

```sh
HEADLESS_MODE=shell node /tmp/offhand-fix-real-render.mjs "$PWD" after
```

## Proof results

- `node tests/unit.test.js`: exit 0, **384 passed, 0 failed**. [Output](round4-unit-output.txt).
- Complete PURE enumeration from `tests/release-gate.mjs`, including every push/unshift registration: **159 unique entries**, exceeding the required 156 minimum. **158 exit 0, one exits 1**, no omitted entry or timeout. [Enumeration and exits](round4-pure-results.txt), [structured results](round4-pure-summary.json), [full streams](round4-pure-output.txt), [driver](round4-run-pure.mjs). The unit entry reuses the completed agreed command's result. Each other audit runs in its own Node process, respecting the gate's SERIAL list. This is not a full browser release-gate run.
- `node tests/release-gate.mjs --coverage-only`: exit 0, `coverage: 414 audits on disk, 126 fast, 129 full, 159 skipped`. [Output](round4-coverage.txt).
- `git diff --check`: exit 0.
- `node tests/hand-registration-audit.mjs`: informational only, exit 1 before (two historical failures), exit 0 after (zero historical failures). Brush core/ring: 0/0 to 1292/322 and 1288/321. Spade core/ring: 26/267 to 832/230 and 22/264 to 825/230. Katana remains 536/1095. [Before](round4-diagnostic-before.txt), [after](round4-diagnostic-after.txt). These scores do not evidence correct registration.

The first census attempt started before the agreed unit command had finished and stopped with `Agreed unit proof missing`. [Initial attempt](round4-pure-initial-attempt.txt). After the unit command completed, the entire census ran again to completion. The driver now checks that prerequisite before launching suites. No partial run is counted as green.

## Failure, blocked actions and proposed deviation

The exact requested offsets conflict with the existing facegate source threshold:

| Item | Source face-region overlap | Limit |
| --- | --- | --- |
| IL10-1 | 28.53% | 2% |
| IL10-2 | 28.52% | 2% |
| IL17-1 | 4.26% | 2% |
| IL17-2 | 4.44% | 2% |

The work order's all-PURE-green requirement is therefore unmet. Proposed deviation for independent review: retain the exact operator-selected offsets as this review candidate while the operator reconciles rendered face visibility with the source facegate failure. No threshold was weakened, audit removed to conceal failure, or alternate offset substituted. A full green acceptance cannot be reported for these bytes.

Fresh renderer proof was blocked by the sandbox's listener denial. No approval bypass was attempted. The operator-reported rendered selection remains distinct from independent verification of this final checkout. Final captures and any decision to revise art or the facegate belong to the next review, not an invented resolution here.

The only gate change removes a stale duplicate `fast` declaration for the hand-registration diagnostic, preserving its existing explicit `skip` registration. Its header now agrees with that diagnostic-only status; all scoring and failure logic remain intact.

## Files changed

- Four masters: `assets/bh/IL/{IL10-1,IL10-2,IL17-1,IL17-2}.png`.
- Eight thumbnails: the same four IDs under `assets/bh/thumb/192/IL/` and `assets/bh/thumb/384/IL/`.
- `docs/CLAIMS.md`, `js/changelog.js`, `tests/hand-registration-audit.mjs`, `tests/release-gate.mjs`.
- New evidence files under `docs/offhand/`: `round4-report.md`, `round4-restored-hashes.txt`, `round4-pixel-proof.txt`, `round4-pixel-proof.json`, `round4-final-integrity.txt`, `round4-unit-output.txt`, `round4-coverage.txt`, `round4-diagnostic-before.txt`, `round4-diagnostic-after.txt`, `round4-render-attempt.txt`, `round4-pure-initial-attempt.txt`, `round4-pure-results.txt`, `round4-pure-summary.json`, `round4-pure-output.txt`, `round4-run-pure.mjs`.

The six restored scratch sprites, IL7-1 control and all trim thumbnails have no final diff. The five off-limits JavaScript files are byte-identical to HEAD. This report is advisory for another provider's independent review.
