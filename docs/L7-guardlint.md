# L7: Shape D cannot be certified by the existing scan

Advisory result, 2026-09-08. Outcome (b) for the existing lexical scan: do not
use its PASS as evidence that Shape D is prevented. No replacement scan is
shipped. The experiment below demonstrates two real validation removals that
leave both the complete findings and the runnable lint's exit status unchanged.

This is not a proof that all static analysis is impossible. An AST analysis with
interprocedural contracts could distinguish these particular examples. Claiming
otherwise from a regex failure would be unjustified. The proposed deviation from
the plan's binary wording is to reject the existing approach with measured
counterexamples, without claiming universal impossibility or seven-site coverage.

## Evidence identity and incident census

The frozen plan's SHA256 was verified as
`893ca17a592151c3c35c1c154f48c3f18e9cd3df9488b34a1cab3c51dac5e7ea`.
The inspected checkout HEAD and local `origin/main` both resolve to
`9e172ca18d446790066fbdf9811599b294f4e4ea`. No remote refresh was performed.
All source paths and line numbers below refer to this checkout at that revision.

**The required seven-incident enumeration is blocked by missing provenance.**
The plan supplies a count, not a list. Searches of current source, tests, docs,
scratchpad text and local Git history identified these two documented
present-but-unknown incidents:

| Incident | Current source path and line | Evidence and failing path |
| --- | --- | --- |
| Stable, unknown species | `js/app.js:20006`, `js/app.js:751`, `data/boneheadz.js:2033` | `docs/CLAIMS.md:544` records the old `x && x.sp` filter admitting `ZZ9`, then rendering through a pet helper into `bhAsset(undefined)`. The current filter uses `isKnownPet`. State validation also lives at `js/loot.js:1569`. |
| R48 Dressing Room, unknown equipped art | `js/app.js:16761`, `js/app.js:17069`, `data/boneheadz.js:2033` | `docs/CLAIMS.md:519` explicitly calls this the seventh instance. Previously a truthy raw equipped id became `baseArtId`, passed `if (!baseArtId)`, and an unresolved `ownArt` reached `bhAsset`. Now the baseline derives from the resolved record. `tests/r48-state-audit.mjs:64` exercises unknown ids through restore. |

The older R39-31 missing-species Stable incident is documented at
`docs/CLAIMS.md:1315`; it is a precursor at the same site, not evidence of another
present-but-unknown incident. The first-pet P0 at `docs/CLAIMS.md:1289` is a
separate equipment synchronization defect and must not be counted merely because
it shares R39 provenance. The other five Shape D incident IDs, file/line pairs,
and the asserted two-P0 classification could not be independently established.
They were requested from the user. They remain unverified, not five invented
fixtures. This work does not fulfill the seven-incident census or certify recall.

## Baseline: exactly why the two false positives fire

`node tests/lookup-guard-lint.mjs` exits 0. It scans 54 files and reports four
candidates: two boundary debts, two false positives, zero unreviewed. Full output:
[baseline.txt](l7-proof/baseline.txt).

| Reported site | Classification | Why |
| --- | --- | --- |
| `js/app.js:12291`, `p.pet.id` to `petPortraitHtml` | Boundary debt | Peer snapshot presence is checked, catalogue membership is not. This does not establish a crash because terminal asset fallback exists. |
| `js/app.js:13751`, `p.pet.id` to `petSpriteHtml` | Boundary debt | The friend-profile branch has the same missing membership check and the same distinction between boundary debt and a proven crash. |
| `js/app.js:19766`, `lurkSp` to `bhAsset(BH_BY_ID[lurkSp])` | False positive | The producer at `js/app.js:19830` filters ids by `(BH_BY_ID[id] || {}).slot === 'C'`, then selects from that filtered array. The local Paddock call at line 19843 passes this id to `paddockSceneHtml`; the friend call at line 19914 omits it and gets null. The scanner sees the consumer's bare truth test but does not trace this producer through the function argument. |
| `js/app.js:24965`, `petArtId` to `petSpriteHtml` | False positive | The expression is `petArtId && BH_BY_ID[petArtId] ? petSpriteHtml(...) : ''`. In `tests/lib/lookup-guard-scan.mjs:110`, `inspect` adds the id-consumer finding before considering indexed lookup guards. The later `checked` logic applies only to indexed-lookup findings and never cancels that id finding. This is an explicit local validation the heuristic misses. |

Suppressing either identity is insufficient. `tests/lookup-guard-lint.mjs:28`
keys reviews by file, rule, key, lookup and sink. None includes the actual
validation or its provenance. Removing either validation therefore preserves
the reviewed identity, including its obsolete false-positive classification.
An unsafe boundary continues to print `lookup-guard: PASS`.

## Reproducible counterexample

Run this block from the checkout root with Node. It uses real producer and
consumer expressions extracted from app.js, the real catalogue, and an assertion
at the renderer boundary. The assertion is the proposed diagnostic seam; it is
not a claimed existing production assertion. The other renderer dependencies
are small adapters. Both healthy known-id controls must actually call the sink,
so skipping all rendering cannot pass. Missing and unknown ids are separate
controls. Only temporary source copies are mutated, and they are removed.

The experiment is a diagnostic recipe, not a newly shipped test or prevention
scan. Its expected assertion failures prove the boundary checks can go red.
The current production placeholder means these mutations alone do not prove a
production crash, a browser render failure, or reachability through every caller.

```js
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { BH_BY_ID, bhAsset } from './data/boneheadz.js';
import { scanLookupGuards } from './tests/lib/lookup-guard-scan.mjs';

const app = readFileSync('js/app.js', 'utf8');
const unknown = 'L7-present-but-unknown';
assert.equal(BH_BY_ID[unknown], undefined);
const known = Object.values(BH_BY_ID).find(i => i.slot === 'C' && i.id !== 'CX').id;
function once(source, from, to) {
  assert.equal(source.split(from).length, 2, `unique anchor: ${from}`);
  return source.replace(from, to);
}
function span(source, from, to) {
  assert.equal(source.split(from).length, 2, `unique start: ${from}`);
  const start = source.indexOf(from), end = source.indexOf(to, start);
  assert.ok(end > start, `end exists: ${to}`);
  return source.slice(start, end);
}
function exercise(source, kind, id) {
  let calls = 0;
  const sink = item => {
    calls++;
    assert.ok(item, 'unresolved catalogue record reached renderer');
    return bhAsset(item);
  };
  let value;
  if (kind === 'lurkSp') {
    const producer = span(source, '  const shinyOwned = new Set(roster.filter', '\n\n  const K =');
    const consumer = 'bhAsset(BH_BY_ID[lurkSp])';
    assert.equal(source.split(consumer).length, 2, 'unique real lurker sink');
    value = vm.runInNewContext(`${producer}\nlurkSp ? ${consumer} : '';`, {
      BH_BY_ID, bhAsset: sink, roster: [], ownedIds: new Set([id]),
      rotHash: () => 0, dateKey: () => '2026-09-08',
    });
  } else {
    const expression = span(source, 'petArtId && BH_BY_ID[petArtId] ? petSpriteHtml(', " : ''}") + " : ''";
    value = vm.runInNewContext(expression, {
      BH_BY_ID, petArtId: id, petArtMorph: 'base',
      petFightPx: () => 76, petHovers: () => false,
      petSpriteHtml: key => sink(BH_BY_ID[key]),
    });
  }
  return { calls, value };
}
// The local petArtId mutation changes the extraction anchor, so execute the
// extracted original expression after changing just its condition instead.
const originalFight = span(app, 'petArtId && BH_BY_ID[petArtId] ? petSpriteHtml(', " : ''}") + " : ''";
function unsafeFight(id) {
  return vm.runInNewContext(once(originalFight, 'petArtId && BH_BY_ID[petArtId]', 'petArtId'), {
    BH_BY_ID, petArtId: id, petArtMorph: 'base',
    petFightPx: () => 76, petHovers: () => false,
    petSpriteHtml: key => {
      assert.ok(BH_BY_ID[key], 'unresolved catalogue record reached renderer');
      return bhAsset(BH_BY_ID[key]);
    },
  });
}
const variants = [
  ['lurkSp', once(app, "(BH_BY_ID[id] || {}).slot === 'C' && ", '')],
  ['petArtId', once(app, 'petArtId && BH_BY_ID[petArtId] ? ', 'petArtId ? ')],
];
const temp = mkdtempSync(join(tmpdir(), 'l7-counterexample-'));
try {
  for (const dir of ['js', 'data']) cpSync(dir, join(temp, dir), { recursive: true });
  for (const [kind, mutated] of variants) {
    const control = exercise(app, kind, known);
    assert.equal(control.calls, 1);
    assert.ok(control.value.length > 0);
    for (const id of [null, unknown]) assert.deepEqual(exercise(app, kind, id), { calls: 0, value: '' });
    console.log(`CONTROL ${kind}: known renders once; absent and unknown do not reach sink`);
    const runMutated = id => kind === 'lurkSp' ? exercise(mutated, kind, id) : unsafeFight(id);
    assert.doesNotThrow(() => runMutated(known));
    assert.throws(() => runMutated(unknown), /unresolved catalogue record reached renderer/);
    console.log(`RED ${kind}: removed validation trips runtime boundary assertion`);
    assert.deepEqual(scanLookupGuards(mutated), scanLookupGuards(app));
    writeFileSync(join(temp, 'js/app.js'), mutated);
    const lint = spawnSync(process.execPath, ['tests/lookup-guard-lint.mjs', temp], { encoding: 'utf8', timeout: 20000 });
    assert.ifError(lint.error);
    assert.equal(lint.status, 0, lint.stdout + lint.stderr);
    assert.match(lint.stdout, /2 false positives, 0 unreviewed/);
    console.log(`BLIND ${kind}: identical findings; existing lint exit ${lint.status}`);
  }
} finally { rmSync(temp, { recursive: true, force: true }); }
console.log('DIAGNOSIS: both validation removals escape the existing ratchet. Shape D prevention is UNPROVEN.');
```

Execute with `node --input-type=module` on stdin (the block contains top-level
imports). Captured output: [counterexample.txt](l7-proof/counterexample.txt).

## What would catch it

1. Make catalogue resolution an explicit shared boundary returning a resolved
   record or a named unsupported result. A truthy raw string must not represent
   a validated record. Validate peer snapshots and restored state as well as
   local producers. Preserve unsupported stored rows for newer builds.
2. Keep the terminal `bhAsset` placeholder. A development/test assertion or
   injected strict consumer should report an unresolved record, including the
   caller and original id, while production degrades without blanking the page.
   The counterexample proves this assertion rejects both validation removals
   while preserving known-id rendering.
3. Drive the real state and render boundaries with missing, known, and
   present-but-unknown values. Existing `pet-state-audit.mjs` and
   `r48-state-audit.mjs` provide starting seams. Add all seven incident fixtures
   only after their identities and original failures are supplied. Require
   per-incident validation-removal controls and nonempty known-id controls.
4. If static enforcement is still wanted, use a checked resolver contract with
   a branded resolved-record type and enforcement against unchecked casts/raw
   ingress. Plain JavaScript truth tests cannot provide that contract. An AST
   rule could enforce use of the resolver; runtime checks still establish that
   external ids belong to the catalogue. This is a proposed follow-up, not an
   implemented type migration or a certified whole-program analysis.

## Proof, blocked actions and deviations

Files changed: `docs/L7-guardlint.md` (this report and executable recipe),
`docs/lookup-guard-review.md` (warning about stale reviewed classifications),
and the three captured outputs `docs/l7-proof/baseline.txt`,
`docs/l7-proof/counterexample.txt`, and `docs/l7-proof/unit.txt`.

| Proof | Actual result |
| --- | --- |
| Frozen plan hash | Match |
| Existing scan | Exit 0; 54 files, 4 candidates, 2 boundary debts, 2 false positives |
| Counterexample block | Exit 0; two expected runtime assertion failures; two mutated lint runs still exit 0 |
| `node tests/unit.test.js` | Exit 0; `365 passed, 0 failed`. [Full output](l7-proof/unit.txt) |

No action was denied by tooling. No sockets, browser, server proofs, commits,
pushes, or publication were attempted. Browser arrival, actual crash reproduction
on historical builds, and full release-gate/PURE execution are unrun. The unit
proof does not establish those results.

Blocked requirement: the five missing historical identities prevent a complete
seven-incident census and controls. Proposed deviation: retain this explicitly
partial census and reject the lexical guard on the evidence available. No
source suppression, narrower matching rule, production change, new scan, test
registration, or PURE-list change is shipped. Existing scan behavior and its
registration remain intact. This report is advisory for independent review.
