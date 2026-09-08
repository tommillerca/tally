# BUILD 2b advisory implementation report

The frozen plan hash was verified as
`254dccb8122b694eb19f21719213e75e61deeba827dde234f353312166270ac8`.
All source paths resolved within this checkout. No original checkout was edited.
This report is advisory for the independent provider's review.

## Files changed

| File | Change |
| --- | --- |
| `js/app.js` | Laboratory bench, instance picker, per-branch preview, shared destructive confirmation, receipt reveal/recovery presentation, incubator panel, permanent navigation, eligibility-gated Today/hatch discovery, hide/restore wiring, egg and interrupted-fight copy, six-colour copy and Rose tint. |
| `app.css` | Six-column Collection/door layouts and Laboratory styles, including reduced-motion handling. |
| `tests/lab-ui-audit.mjs` | New PURE guard: 12 groups executing production renderers, navigation and shared confirmation handlers, with nonempty positive controls and deliberately faulty variants. |
| `tests/release-gate.mjs` | Registers the new guard in PURE. |
| `tests/kennel-copy-audit.mjs` | Executes the extracted shared destructive helper in the existing real-salvage fixture; supplies the new navigation dependency to the collection fixture. |
| `tests/pet-a11y-audit.mjs` | Supplies the new navigation dependency, includes Rose in the fixture palette, and expects the accurate “Not owned yet” cell label. |
| `tests/breed-lock-audit.mjs` | Supplies Stable's navigation options to the existing renderer fixture. |
| `docs/LAB-UI-BOUNDARY.md` | Proposed engine API seam, exact presentation fields, responsibilities and integration limitations. |
| `docs/LAB-UI-REPORT.md` | This report. |

The lockfile-pinned `esprima` dependency was restored to ignored
`node_modules/esprima` from the existing local npm content cache. Its SHA512
integrity was checked against `package-lock.json` before extraction. No network
fetch, package manifest edit, install hook, commit, push or publication occurred.

## Proof

Agreed command, run from this checkout:

```text
node tests/unit.test.js
370 passed, 0 failed
Exit code: 0
```

Additional checks:

```text
node tests/lab-ui-audit.mjs
12 passed, 0 failed
Exit code: 0

Full PURE tier: 98/98 passed
Exit code: 0

node tests/release-gate.mjs --coverage-only
coverage: 348 audits on disk, 121 fast, 129 full, 98 skipped
Exit code: 0

node --check js/app.js
Exit code: 0

git diff --check
Exit code: 0
```

The coverage command's historical “skipped” label includes PURE; it does not mean
the 98 PURE suites were omitted. A temporary Node driver evaluated the actual
`PURE` array and all its push/unshift registrations in `tests/release-gate.mjs`,
then ran every registered member sequentially. It did not invoke the browser
array, the release runner's local server, or its release-lock workflow. Reproduce
that execution from the checkout with:

```sh
node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
const src = readFileSync('tests/release-gate.mjs', 'utf8');
const files = vm.runInNewContext(
  src.slice(src.indexOf('const PURE ='), src.indexOf('const BROWSER =')) + '\nPURE'
);
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['tests/' + file], { stdio: 'inherit' });
  if (result.status !== 0) failed++;
}
console.log(`PURE: ${files.length - failed}/${files.length} passed`);
process.exitCode = failed ? 1 : 0;
JS
```

Local raw evidence is retained at `/tmp/build-ui-unit-final.txt`,
`/tmp/build-ui-pure-summary.txt`, `/tmp/build-ui-pure/results.json`, and individual
suite outputs under `/tmp/build-ui-pure/`. The temporary driver is
`/tmp/build-ui-pure.mjs`.

The first full run was 91/98. Four suites could not run correctly without
`esprima`; three existing source-extraction fixtures lacked the newly shared
helper/navigation dependencies. The dependency and fixtures were repaired,
without deleting assertions or changing the breeding/destruction rules.
The subsequent full run passed. A final full run also covers the finished UI.

## Blocked actions, deviations and limits

- **Missing engine:** this checkout has no Laboratory recipe resolver, protection
  table, Animate transaction or incubator API. Per the work order, none was
  implemented in the UI lane. The room explicitly presents an unavailable-build
  recipe overview, real collection/egg progress and working exits. Input spending,
  purchases, recovery transactions and eligibility-based promotion remain blocked
  until the engine is connected. This is not a fully playable or releasable
  Laboratory by itself.
- **Proposed boundary:** the UI expects a versioned `laboratory` namespace from
  `js/loot.js`, with `snapshot`, `quote`, `animate`, `purchase`, `acknowledge`, and
  `setUi`. The spec defines semantics and durable shapes but no callable method
  signatures. The proposed seam and annotations are explicit in
  `LAB-UI-BOUNDARY.md`; the engine lane must reconcile them before integration.
- **Progress wording:** the room describes missing colours and needed ingredients
  as collection building, then explicitly labels optional copies and last-cell
  losses. It avoids an unconditional “every experiment advances you” promise,
  because an extra owned Midnight does not add a cell or needed ingredient.
  This follows LAB-SPEC's stated wording boundary; no recipe or eligibility rule
  was changed.
- **No denied tool action:** no permission escalation or approval bypass was
  attempted. No commit, push, publish or deployment was attempted. PURE submission
  checks use their existing command doubles; no real archive upload was requested.
- **Visual verification unrun:** browsers are prohibited by the frozen order.
  Small-phone/notch layout, text expansion, six-column touch targets, Rose tint
  and art legibility at 32/48/64 px, overlay hit testing, real keyboard/focus
  restoration, cold-image decoding and full/reduced-motion playback were not
  checked visually. Node fixtures do not certify those behaviors.
- **Engine proof unrun:** transaction atomicity, process death, stale quote races,
  durable restore/merge/hide behavior and cross-device quota enforcement require
  the engine implementation and its independent proofs. UI guards assert the
  provided snapshot's presentation and gates, not the absent engine's safe/useful
  classification or destructive transaction.
