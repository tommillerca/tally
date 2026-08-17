# Vacuous-green census of tests/ (147 files), gwart/census, base ddbb079 (v391)

Phase 1 census. NOTHING was edited. Method: static read of every suite; 55 files
read line by line, the rest enumerated with a pattern triage (trend shapes,
`.every()` on possibly-empty lists, assertions nested in conditionals, `=== 0`
passes, silent skips) and every flagged site read in context. No suite was run.

## 1. Counts

- Files scanned: **147** (every .mjs and .js directly under tests/, fixtures/ excluded).
- Assertion call sites (static count of `ok( / check( / note( / setup( / die( /
  assert.*` minus helper definitions): **~2,478**. Loops multiply some of these
  at runtime; list-style audits (gate-audit, glyph-audit, newart-audit,
  mockup-parity, facegate) assert via a problems list plus exit code and are
  counted by their exit decisions.
- Zero-assertion files: **7**, all accounted for below (section 4). One more,
  balance-audit.js, carries exactly 1 assertion inside ~280 lines of report.

Category totals across all graded assertions:

| Category | rows found | of which certain |
|---|---|---|
| TREND-NOT-BOUND | 1 | 1 |
| CONDITIONAL-DISAPPEARS (unmitigated: rows vanish with NO red row) | 1 site (6 rows) | 1 |
| CONDITIONAL-DISAPPEARS (mitigated: a guard row goes red first, summary derived) | 7 suites | 7 |
| EMPTY-SAMPLE (live risk) | 2 | 0 (both suspected) |
| EMPTY-SAMPLE (mitigated by an adjacent non-empty row in the same suite) | 6 | 6 |
| NO-CONTROL | 1 major + 4 minor | 1 |
| TAUTOLOGY | 0 live (2 documented-and-replaced in fight-tray-audit) | - |
| SELF-FULFILLING | 1 (documented in its own file) | 1 |
| HONEST | everything else, ~2,45x rows | - |

The dominant fact of this census: the four templates (scout, boneyard,
fight-exit, spire-gate) have all been partially or fully rewritten on this base,
and the house style now leans hard on SAMPLE/SETUP/CONTROL rows, exact-delta
bounds, and prove-red notes. The residue below is what is left.

## 2. Ranked findings

### TREND-NOT-BOUND

**1. tests/remote-den-audit.mjs:75** - `ok('beating it raises the Gauntlet
ceiling', after.denWins > before.denWins, ...)` - **certain** (the assertion is
literally a trend). Passes while the app is broken if the daily remote-den win
double-mints its counter row (denWins +2 or +5 per kill): the pit cap inflates,
exactly the rewarded-action farm class, and this row grades the inflation as a
pass. den-ceiling-audit.mjs holds the same counter to exact `+N` deltas for
roaming and landmark dens; the daily REMOTE path has only this trend row, and
this file has no repeat-claim-pays-nothing row for it either (the UI rows check
the button disappears, not the ledger).

### CONDITIONAL-DISAPPEARS

**2. tests/spire-gate.mjs:146-148** - `if (!den) { console.log('  SKIP den
sheet: densNear returned nothing'); } else { ... 6 DEN rows ... }` -
**certain**. When densNear returns nothing, six assertions (sheet opens, odds
total 100, payouts shown, art decoded, foot states action) cease to exist with
only a console note; the summary is `results.length`-derived, so "N/N passed"
shrinks invisibly and the run stays green. This is the exact shape of template
#3 (fight-exit), which was fixed by making the guard an `ok(false)`; this one
was not.

Mitigated instances, listed so nobody re-finds them as bugs: beta-thanks-audit
(6 rows in `if (card)`), community-audit (4 rows in `if (card)`),
crate-palette-audit (`if (seam)` / `if (geo)`), crate-reveal-audit (err ->
`ok(false)` + continue), fight-exit-audit (spire/launcher/seam guards now emit
red rows), fight-layout-audit and figure-audit (`continue` always preceded by a
failing SETUP row), scout-audit (`no __map` emits a red row). In every one of
these the skipped block is preceded by a row that goes RED on the same run, and
no file hardcodes a total, so the denominator shrink cannot read as green.
Certain, low severity, no action implied by this census.

### EMPTY-SAMPLE

**3. tests/boneyard-audit.mjs:357-359** - `ok('PAN new POIs arrive in
coordinated beats, not one marker at a time', arrivals.length <= 2, ...)` -
**suspected**. Passes with `0 beat(s)` when the pan resolves nothing at all:
the guard row above it only requires markers to exist BEFORE the pan
(`panBaseline > 0`), so a generation regression that stops resolving anything
new reads as perfectly coordinated. scout-audit separately owns
"panning resolves new POIs", which is why this stays suspected rather than
certain: the gate as a whole covers it, this row alone does not.

**4. tests/unit.test.js:504, 982, 989 and tests/pit.test.js:341-342, 760, 1134**
- catalog-shaped `assert.ok(X.every(...))` rows (`SHOP.every(s => s.cost > 0)`,
`legs.every(g => g.talent)`, `TALENT_TREES.every(t => t.nodes.length >= 10)`,
`vendorArch.every(...)`) - **suspected**. Each passes on an emptied or
emptied-by-filter table; most tables are asserted non-empty somewhere else in
the same file, but not adjacent to these rows, and I did not trace every one.
Low severity: these are static data tables whose emptiness would trip other
rows.

Mitigated instances (adjacent row in the same suite forces the sample
non-empty, so the suite cannot go green vacuously): badges-audit rows 2-3
(`d.found.every(...)` behind `found.length === 4`), news-tab-audit:70 (`imgs
=== 0 ||` decode row, but the row above requires `thumbsDrawn === rows >= 5` in
real pixels), backup-roundtrip-audit MALFORMED rows for `weights`/`health`
(compare empty-to-empty in that scenario, five other stores carry rows),
ember-cohesion-audit:57 (`if (r.e4Layers === 0) continue` skips a surface's
row, backstopped by `lit.length >= 3` which requires all three own-player
surfaces to render), crew-fan "every card genuinely online" (behind `cards >
0`), error-telemetry NO-ORIGIN (behind QUEUED rows). All certain, all low.

### NO-CONTROL

**5. tests/spire-gate.mjs:125** - `ok('SPIRE handler refuses even if the button
is re-enabled', afterTap === beforeTap, 'sheets ${beforeTap} -> ${afterTap}')` -
**certain that the shape is unchanged from template #4** (it still passes on
`sheets 0 -> 0`). Nothing in the suite proves that a tap through this same
dispatch path CAN open a sheet: row 1 reads the button's text, it never taps
it, and the evaluate that fires the synthetic click silently `return`s if
`#mapSpire` is missing. So "the handler refused" is indistinguishable from "the
click never reached a handler". Partial mitigation: the preceding row fails if
the button is absent or not disabled, so a wholly broken map goes red earlier
in the run; the un-instrumented hop is the click dispatch itself.

Minor, suspected, listed for completeness: balance.mjs:85-88 and :125 (CHEATDEATH
wiring and GEAR economy-filter rows assert source-text regexes; they prove the
text exists, not that the code path works, and the negative regex would miss a
differently-spelled bypass), bestiary-audit:48-49 (roster-absence asserted by a
wording regex with no row proving the regex can find a real roster offer),
figure-audit:318 (undriven-reason row only checks the excuse is >20 chars).

### SELF-FULFILLING

**6. tests/ember-cohesion-audit.mjs:76-92** - the small-avatar rows build
`.lb-av` / `.fl-av` / `.map-you-av` nodes BY HAND and measure the stylesheet,
so they prove CSS rules exist and nothing about whether any real screen renders
that nesting - **certain**, and the file says so itself in a scope comment
(including that it removed a class the app never renders). Kept honest by its
own disclosure; a real-node probe is acknowledged as not possible in this tree.

### TAUTOLOGY

None live. Two documented corpses worth knowing about because they are the
purest examples in the repo: fight-tray-audit's old CLIP and AFFORDANCE rows
were `X === 0 || (tray.scrolls && tray.masked)` where `.scrolls` is set by the
app from THE SAME EXPRESSION on THE SAME ELEMENT the audit then measured, so
the right branch was true exactly when the left was false. Both were replaced
(REST floor + BUDGET ratio ceiling, both proven red) before this census.

## 3. Files not graded assertion-by-assertion, and why

- **tests/unit.test.js (2,896 lines, ~291 asserts) and tests/pit.test.js (1,255
  lines, ~189 asserts)**: graded by pattern triage plus context reads of every
  flagged line, not a line-by-line read of all 480 assertions. Findings from
  them are marked suspected. They are engine unit tests over pure modules;
  the flagged trend shapes there turned out bounded (`buffed ~ base*1.25 +-1`,
  `power <= 150`).
- **~85 mid-size suites** were graded by the same triage + spot-read of every
  flagged site rather than a full line-by-line read (named per-file in the
  worklog). Every flagged site was read in context; unflagged rows in those
  files are graded HONEST on the strength of the pattern sweep, which is a
  weaker claim than the 55 deep-read files carry.
- **tests/hollow-backdrop-audit.mjs** contains a non-UTF8 byte (grep treats it
  as binary); its 25 `note()` rows were still enumerated and triaged via the
  wider regex. Nothing flagged.

## 4. Zero-assertion files (a count of zero is itself the finding)

| File | Verdict |
|---|---|
| arena-static-probe.mjs | self-declared PROBE; prints tables, always exits 0. Harmless standalone, but if it were ever placed in a gate tier it would be a row that cannot fail. |
| fight-sim.mjs | measurement instrument consumed by balance.mjs; by design |
| garden-sim.mjs | same, sim instrument |
| reap-orphans.mjs | maintenance utility (orphan process reaper), not a test |
| godmode.js | shared harness |
| release-gate.mjs | orchestrator; its PASS/FAIL rows come from child exit codes (not run, per standing rules) |
| ui-audit.js | in-console tool returning `{ pass, problems }`; no exit code of its own |

Near-zero: **balance-audit.js** has exactly 1 assertion (the 90% weapon exploit
bar); its v123 boss-ramp and v128 lineage sections print "should climb / should
not hit 100%" language and assert nothing. If those properties matter, nothing
guards them.

## 5. Confidence summary

Certain: remote-den trend row; spire-gate den-skip; spire-gate handler-refuse
shape; every "mitigated" classification (mechanics verified by reading both the
skip and its guard row); the seven zero-assertion files; ember-cohesion
self-fulfilling rows (self-documented).

Suspected: boneyard PAN row (the vacuity window depends on whether a healthy
pan can legitimately resolve nothing); unit/pit catalog `.every()` rows (did
not trace every table's non-emptiness); the minor NO-CONTROL regex rows in
balance.mjs / bestiary-audit.

Nothing here was fixed, per the Phase 1 constraint. The top three rows
(remote-den:75, spire-gate:146, spire-gate:125) are the ones I would take into
a Phase 2 first, in that order.
