# Release gate status (R3, 2026-09-07)

This is a measurement of checkout `4aab9ec8` plus the R3 changes. It supersedes
older readiness prose that calls machine time the only blocker. This is not a
full release certification. See [R3 advisory evidence](R3-REPORT.md), including
all four verdicts and the [individual PURE exits](r3-proof/pure-results.json).

## What runs here

The final PURE inventory contains 78 files. Each was executed directly with Node,
without the gate's server startup. The agreed proof is
`node tests/guard-hygiene-lint.mjs`. The inventory check is
`node tests/release-gate.mjs --coverage-only`, which exits before server, lock,
browser discovery, orphan reaping or suite execution.

`unit.test.js` contained a real socket-dependent server exit test. R3 moved that
check to `serve-tree-identity-audit.mjs`, preserving its real subprocess and
20-second timeout. That audit itself had also been mislabeled PURE. It is now
registered exactly once in FULL, with its socket requirement stated. The initial
PURE sweep attempted it and received `listen EPERM: operation not permitted
127.0.0.1`. This was a harness capability failure before any assertion, not an
application finding. No server or browser proof passed here.

## Census: compare membership, never just totals

Round 48's frozen work order reports 318 files, 303 `.mjs` files, 294 gate-visible
files and 293 in exactly one tier. It also reports 303 unique tier names, with
five `.mjs` files absent from those names and five names absent from the `.mjs`
set. Equal totals hid unequal sets. These are historical figures supplied by the
work order, not measurements of this newer checkout; no original round-48
census artifact was available to independently reproduce the five historical
names on each side.

R3 personally evaluated the current gate's actual PURE/BROWSER/DECLARED/HELPERS
initialization and compared it with files on disk. The machine-readable
[census](r3-proof/census.json) records:

| Current measure | Count |
|---|---:|
| Top-level regular files in `tests/` | 348 |
| Top-level `.mjs` files | 336 |
| Gate-visible `.js` and `.mjs` files after HELPERS exclusions | 324 |
| In exactly one running tier | 324 |
| PURE / BROWSER / FULL | 78 / 117 / 129 |
| Unique names across PURE, BROWSER and DECLARED | 334 |
| `.mjs` only / declared-name only | 7 / 5 |
| Missing running tier / duplicate running tier | 0 / 0 |

The seven `.mjs`-only names are `audit-lifecycle.mjs`, `badge-centre-lib.mjs`,
`dependency-observer.mjs`, `fight-sim.mjs`, `mem-idb.mjs`, `release-gate.mjs` and
`store-copy-scan.mjs`. They are declared helpers, not orphan audits. The five
name-only entries are `balance-audit.js`, `fx-audit.js`, `pit.test.js`,
`ui-audit.js` and `unit.test.js`. Some DECLARED metadata still names excluded
helpers. The sets answer different questions and must not be substituted for
one another.

The current coverage command prints:

```text
coverage: 324 audits on disk, 117 fast, 129 full, 78 skipped
```

Its word `skipped` is misleading: the remaining 78 are PURE and do run. R3 did
not change that summary formatter. The table above uses actual tier membership.
No missing or duplicate running-tier file was found. Libraries under `tests/lib`
and retired audits are outside this top-level gate census, but the new write
sink scan includes them recursively.

## What remains unmeasured

This sandbox prohibits binding local sockets. The default release gate starts
its server before PURE, so the ordinary gate cannot run here even though its
PURE files can. No browser launch, UI interaction, rendering, timing or server
identity/exit proof is certified by this lane. The updated Python in-memory
identity endpoint still requires its real socket proof on a permitted machine.
Expected server audit rows are `PASS READ-ONLY`, `PASS WRONG-TREE` and
`PASS serveTree does not hold the event loop open after the script ends`, exit 0.
Those are expectations, not observed output.

A full run needs a machine permitted to bind loopback sockets and launch the
resolved Puppeteer/Chromium stack, Python 3, the suite's native image tools, and
enough idle RAM/CPU. Confirm the shared gate lock and claim it with `--as=<name>`;
run `node tests/release-gate.mjs --all --as=<name>` against this checkout. Inspect
the printed browser instrument and every dependency receipt. Map/WebGL/tile
host capabilities, screen capture and timing measurements must actually work.
A missing date-seeded case needs the appropriate data state, not merely another
machine. Network-dependent rows need an explicitly permitted review environment;
this work order does not authorize Worker traffic.

Exit 1 means failure; exit 97 and `UNPRV` mean required checks did not run. Neither
is a pass. FULL contains 129 files, not an optional certification claim. A clean
PURE run says nothing about the 246 BROWSER/FULL files.

## Audit output rule and its boundary

Every recognized filesystem destination and screenshot/trace path now passes
through `auditOutputPath` at the write. It rejects the checkout root, descendants,
relative traversal, file URLs and symlink aliases, including missing leaves below
an existing symlink. Caller-supplied output overrides are checked too. `serveTree`
registers additional served roots and answers its random identity endpoint from
memory instead of creating `.serve-tree-*` files. External temporary fixtures
and output directories remain writable.

`guard-hygiene-lint.mjs` scans `.js`/`.mjs` recursively, including helpers and
retired scripts, requiring guarded destinations and the helper import at each
recognized sink. `audit-output-audit.mjs` executes actual external writes and
checks refusal controls. Its red/green proofs are in the R3 report.

This is a bounded source guard plus runtime path validation, not an OS-level
filesystem guarantee. Arbitrary subprocess commands, generated code, computed
method names, unrecognized APIs and a symlink replaced concurrently after
validation require additional containment/review. The sweep inspected the
existing subprocess writers: temporary native-build/control trees, the
service-worker archive/certificate setup and thumbnail generation all target
external fixtures. Future opaque subprocess writers need explicit review.
A universal guarantee for arbitrary audit programs would require a read-only
checkout mount or an OS write sandbox inherited by all children. That stronger
requirement remains blocked by this lane's environment; do not describe the
bounded lint as proving it.
