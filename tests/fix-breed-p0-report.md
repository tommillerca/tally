# fix-breed-p0 advisory implementation report

Plan SHA256 verified: `cc7086b6eee2dae7958a2c38298223ea7306451da1e79ef9436440103ecbb254`.

All source paths were resolved in this checkout. At implementation time, both HEAD and the local `origin/main` ref were `07384c7af486fb421f3bbad0889ad9daa71dc3da`. No fetch was performed, so this identifies the checked-out baseline, not an independently verified remote tip.

## Files changed

| File | Change |
| --- | --- |
| `js/app.js` | Move the existing `btn = e.currentTarget` capture before the first await in `#doBreed`. No other application changes. |
| `tests/lib/pet-destruction-harness.mjs` | Clear the event double's `currentTarget` when synchronous dispatch returns, before the listener resumes. Keep `target` intact. Previously the double hid the production failure. |
| `tests/breed-two-tap-audit.mjs` | Execute the extracted, registered production handler with real quote and breed services over in-memory IndexedDB. Assert tap one arms and spends nothing; tap two changes roster 4 to 3, removes the selected feed, increments keeper lineage, preserves unselected pets, writes `petBreedCredit`, and opens the result. |
| `tests/lib/after-await-event-scan.mjs` | Parse all async functions in `js/app.js`, including named listeners, and detect post-suspension `currentTarget` access. Include an inventory of event member reads in registered async listeners. |
| `tests/after-await-event-lint.mjs` | Run the scanner and 19 positive/negative parser controls. Nonzero exit on hazards. |
| `tests/release-gate.mjs` | Register both new guards in PURE. |
| `package.json`, `package-lock.json` | Pin Acorn 8.18.0 as a development dependency for modern JavaScript parsing. |
| `tests/fix-breed-p0-report.md` | This advisory report. |

## Red and green proof

After obtaining green, temporarily moved only the capture back below the await. Asserted that the resulting entire `js/app.js` was byte-for-byte equal to `git show origin/main:js/app.js`. Ran both guards and required exit 1. Restored the fixed file in a `finally` block and required both guards to exit 0.

Red, `node tests/breed-two-tap-audit.mjs`, exit 1:

```text
evalmachine.<anonymous>:22
      if (btn.dataset.armed === '1' && btn.destructionQuote) {
              ^
TypeError: Cannot read properties of null (reading 'dataset')
```

Red, `node tests/after-await-event-lint.mjs`, exit 1:

```text
PASS CONTROL: 19 parser fixtures
FAIL js/app.js:21193: e.currentTarget reads currentTarget after await; capture it before suspension
FAIL after-await-event: 1 hazards, 360 async functions scanned
```

Green, `node tests/breed-two-tap-audit.mjs`, exit 0:

```text
PASS CONTROL tap 1: armed, disclosure shown, roster 4, no breed credit
PASS tap 2: roster 4 -> 3, keeper lineage 1, petBreedCredit written as 0, result opened
```

Green, `node tests/after-await-event-lint.mjs`, exit 0:

```text
PASS CONTROL: 19 parser fixtures
PASS after-await-event: 0 hazards, 360 async functions scanned
```

Agreed proof, `node tests/unit.test.js`, exit 0:

```text
378 passed, 0 failed
```

Full unit output is retained at `/private/tmp/fix-breed-p0-unit.txt`. Red and green guard output is retained at `/private/tmp/fix-breed-p0-{red,green}-{breed-two-tap-audit,after-await-event-lint}.mjs.txt`.

Additional checks all exited 0:

- `node tests/breed-last-colour-audit.mjs`: last-colour typed consent, spare path, shiny keeper, stale disclosure and cancellation.
- `node tests/stable-stale-disclosure-audit.mjs`: stale and newly credited health disclosure, cleared consent, exactly-once destruction.
- `node tests/stable-loss-disclosure-audit.mjs`: quick and typed destruction disclosures, investment losses.
- `node tests/lab-health-recovery-audit.mjs`: fresh experiment after health changes, late-dispatch fencing, missing-input refusal.
- `node tests/guard-hygiene-lint.mjs`: clean.
- `node tests/guard-provenance-lint.mjs`: clean.
- `node tests/release-gate.mjs --coverage-only`: `coverage: 389 audits on disk, 122 fast, 129 full, 138 skipped`.
- `git diff --check`: clean.

The full release gate and browser suites were not run. The runtime proof uses production handler source and services with DOM doubles and in-memory storage, not a browser or device.

## Whole-file event-read review

Parsed all 360 async functions and reviewed the event-bearing async listener bodies, including their event reads before and after suspension. Only the breeding site read `currentTarget` after suspension. The other remaining post-await event reads are:

| Source line | Listener | Reads | Classification |
| --- | --- | --- | --- |
| `js/app.js:5392` | `[data-claim]`, listener begins at 5341 | `ev.clientX`, `ev.clientY` after quest writes | Working. Mouse coordinates persist after dispatch and position confetti. |
| `js/app.js:5422` | `[data-copymeal]`, listener begins at 5412 | `ev.clientX`, `ev.clientY` after copying entries | Working. Same persistent coordinates and confetti use. |
| `js/app.js:9143` | `[data-relog]`, listener begins at 9136 | `ev.clientX`, `ev.clientY` after loading and committing an entry | Working. Same persistent coordinates and confetti use. |
| Pre-fix `js/app.js:21193` | `#doBreed`, listener begins at 21189 | `e.currentTarget` after `quotePetDestruction` | Real bug. Dispatch clears the value. Fixed capture is now at line 21191. |

No other post-await event-object reads were found in the async listeners. In particular, their `target` reads occur before suspension. Ordinary objects with names such as `e` and `ev` elsewhere in the file, including log entries and fight simulation records, are not DOM events.

The lint conservatively inspects all async functions, not just inline listener syntax. It covers direct and optional member access, literal computed access, event aliases, destructuring, branches, loops, and captured-event closures created after suspension. It can reject unreachable code because it does not prove control-flow reachability. Dynamically computed property names and reads hidden in called helpers or previously created closures are outside its intraprocedural analysis. This is a source guard, not a universal JavaScript lifetime proof.

## Denied or blocked actions and deviations

No commit, push, PR, publication, Worker deployment, remote Wrangler command, production D1 write, or secret operation was attempted. `native/ASC-SUBMISSION.md` was not touched. No original checkout was edited.

Two offline dependency setup attempts failed: the package-name install returned `ENOTCACHED`, and a cached-tarball install was denied an npm-cache temporary write with `EPERM`. Resolved by reading the existing cached tarball, verifying its SHA512 against the cache integrity value recorded in the lockfile, and extracting it into this checkout's ignored `node_modules/acorn`. No network, cache ownership change, or permission escalation was used. No blocker remains.

No breeding behavior deviation. Lineage, costs, destruction disclosure, and typed confirmation remain as implemented. Acorn is the added tooling dependency needed for the parser guard; lint analysis boundaries are disclosed above. No requirement was silently redesigned. This report is advisory and does not replace independent review.
