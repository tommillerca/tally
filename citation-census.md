# Citation census, 2026-08-17

A static sweep of every checkable citation in this tree: file paths, named
identifiers, line numbers, release-gate tier declarations, selector claims, and
incident / version / commit-hash claims. Base is origin/main = ddbb079 (v391).
Method was read, grep, and git only. No test suite was executed and the gate was
not run. Every entry below is marked **certain** or **suspected**.

---

## 0. Things found during the sweep that someone should look at first

These are not fixes. They are the two places where acting on the current text
would cost the most, written at the top as instructed.

**0.1 The "2026-08-12 TestFlight incident" is REAL, and the retraction is the
false claim. (certain, with receipts)**

The v391 release commit (ddbb079) body says, under "A CLAIM I REPEATED AND
COULD NOT SUPPORT": *"There is no such incident in ROADMAP.md, the changelog,
the git history or my notes, and Tom does not recall one. The claim is struck
from the comment."* That statement is contradicted by the git history it cites:

- `a6e4d9a` (2026-08-13 +1000, which is 2026-08-12 US time, PR #3), commit body:
  *"A TestFlight user opened Boneheadz for the first time on one bar of LTE and
  got a blank screen he could not get past: the gear button and the tab bar
  painted, nothing behind them."* It goes on: *"REPRODUCED AGAINST LIVE, not
  theorised"*, with measured numbers, and names the three modules missing from
  PRECACHE (haptics.js, bosses.js, wraith-fx.js).
- `3f308a6` (2026-08-12 12:12 -0700), commit body: *"That is the exact shape of
  Tom's TestFlight user on one bar of LTE."* This is the dead-shell self-reload
  commit.

So the six in-tree citations of the incident (sw.js:22, index.html:69,
tests/dead-shell-audit.mjs:3, tests/precache-audit.mjs:3,
tests/precache-assets-audit.mjs:6 and :210) are corroborated, and the one place
the claim was struck (the sw-upgrade-audit header, via ddbb079) removed a true
citation on the strength of a search that missed two commit bodies. If the team
now treats this incident as fictional, real history gets erased. Whoever
searched likely grepped commit SUBJECTS or the changelog; the evidence is in
commit BODIES (`git log --all --grep="TestFlight"` finds both).

**0.2 The tree that ships as v391 still says v390 everywhere a player or a tool
can read a version. (certain)**

HEAD is the v391 release commit, but `js/app.js:14570` has
`const APP_BUILD = 'v390'` (its own comment says "bump with sw.js VERSION"),
`sw.js:2` has `const VERSION = 'tally-v390'`, and js/changelog.js's highest
entry is n:390. Commit 68e6b98 ("v386: actually bump APP_BUILD and sw.js
VERSION") shows in-repo bumps are the norm and have been missed before. Not a
citation, but every version-stamped log, Settings screen and cache name on this
tree misreports the running build, per the standing rule this file is not the
place to fix it.

---

## 1. Counts

| Category | Citations found | Resolved | Broken | Uncertain / n.a. |
|---|---|---|---|---|
| 1. File paths (distinct paths cited in md/js/css/html text) | 273 | 236 | 7 (11 citing sites) | 30 (see 3.1: extraction artifacts 8, documented-external 16, planned files 6) |
| 2. Named identifiers cited in comments/docs (distinct) | 2,636 | 2,610 | 0 | 26, all triaged benign (external APIs, planned names, asset/artifact ids, documented removals) |
| 3. Line-number citations (file:line instances) | 223 | 60 at the cited line | 132 certain drift | 27 suspected drift, 4 targets outside the tree |
| 4. release-gate.mjs tier declarations (runnable files in tests/) | 147 files, 144 declarations + 3 helpers | 147 covered, all declared files exist, no dupes | 4 stale/false claims inside declarations (see 2.3 to 2.6) | 3 red/green claims not statically checkable |
| 5. Selector/DOM tokens cited in comments and docs (distinct) | 252 | 220 emitted in source | 0 | 32 not emitted, all triaged: documented negatives, CSS residue the text itself calls orphaned, harness-local, vendor-runtime, or false positives |
| 6a. Commit hashes cited as commits | 24 | 24 exist in this repo | 0 | ~30 other hex strings are artifact UUIDs / asset ids / colors / DB ids, not commit claims |
| 6b. Version claims (distinct vNNN cited) | 100+ | all corroborated by js/changelog.js or git log | 0 | v271 explained by docs/HANDOFF.md itself (build held, never went live) |
| 6c. Dated incident claims | checked the classes below | 2026-08-12 TestFlight: corroborated | 1 (the ddbb079 retraction, see 0.1) | Tom-quote citations uncheckable |

Headline: the tree's identifier, selector, commit-hash and version citations are
in remarkably good health. The rot is concentrated in exactly two classes:
**paths to files that were never committed** (agent-session reports and one test
that never existed) and **absolute line numbers**, where 159 of 219 checkable
citations no longer point at what they claim (73%).

---

## 2. THE BROKEN LIST, ranked by damage

### 2.1 File paths that send you chasing nothing (certain)

Each of these names a file as existing evidence. None exists in the working
tree, and `git log --all` (every branch, all history) shows the file was never
committed anywhere. Anyone following the pointer finds nothing and cannot even
recover it from history.

1. **`tests/repeat-audit.mjs`** cited at **js/app.js:16296** ("See 'Rewarded
   actions' in tally/CLAUDE.md and tests/repeat-audit.mjs"). Never existed on
   any branch. The CLAUDE.md half of the same sentence is fine ("Rewarded
   actions" is a real CLAUDE.md section). The real guards for this class are
   tests/unit.test.js's NO-OP guards and tests/xp-cap-audit.mjs.
2. **`gwart/MEMORY-CENSUS.md`** cited at **js/app.js:3204**,
   **scripts/build-bh-thumbs.py:7**, and **tests/memory-census.mjs:8**, twice
   with the phrase "on this tree", which it is not. Never committed. The
   companion citation in each case, tests/memory-census.mjs, is real and carries
   the same numbers, so the measurements survive; the .md pointer is dead.
3. **`gwart/FINDING-C-INTERRUPT-DEMO.md`** cited at **js/db.js:134** ("See
   gwart/FINDING-C-INTERRUPT-DEMO.md and tests/importall-interrupt-finding.mjs
   for the measurement"). Never committed. The second pointer
   (tests/importall-interrupt-finding.mjs) exists and is the surviving record.
4. **`gwart/REG-BATCH.md`** cited at **tests/respec-audit.mjs:101** ("Coverage
   gap flagged in gwart/REG-BATCH.md"). Never committed.
5. **`gwart/REG-PLAN-2026-08-15.md`** cited at **tests/release-gate.mjs:352**
   (the sheet-action-reachable-audit declaration: "DELIBERATELY RED as of
   today: gwart/REG-PLAN-2026-08-15.md item 2B parks it outside FAST until 1B
   and 1C land"). Never committed. The same plan is cited as "REG-PLAN 2D" in
   the cloud-restore-silent-audit declaration (tests/release-gate.mjs:321).
   This one is the worst of the five: a gate declaration justifies a
   deliberately-red suite by deadline items in a document nobody can read.
6. **`tests/selector-sweep.mjs`** cited at **tests/suite-rot-audit.mjs:20**
   ("This is the same bug class tests/selector-sweep.mjs guards in js/").
   This one DID exist and was deleted in v386 (aa4359b, carrying 773494d
   "Delete tests/selector-sweep.mjs, the second name for an audit we already
   run"). The live equivalent is **tests/selector-audit.mjs**. Note: the
   deleting commit's body claims *"Verified before deleting: nothing outside
   the file itself refers to it"*; suite-rot-audit.mjs:20 referred to it and
   still does.
7. **`gwart/dead-audits`** cited at **tests/release-gate.mjs:274** (the
   suite-rot-audit declaration: "see gwart/dead-audits for the first two").
   Not a path in the tree and not a branch on this machine today (suspected:
   it may have been a since-deleted branch; unverifiable either way, the
   pointer answers to nothing now).

A pattern worth naming: items 2 to 5 are all `gwart/<REPORT>.md` files written
by agent sessions into worktrees and cited from committed code, but never
themselves committed. gwart/ on main has exactly four .md files
(GARDEN-SIM-FINDINGS, HOLLOW-BACKDROP-REPORT, HOLLOW-BEDS-REPORT,
JS-CRASH-AUDIT); any code comment citing a gwart/ file outside those four is
citing a file that exists only in a dead container.

### 2.2 The market-quality-mockups/ class (certain about the repo, suspected about the world)

**22 citations across 14 distinct paths** point into `market-quality-mockups/`
(app.css x5, js/app.js x7, js/bosses.js, ROADMAP.md x4, CLAUDE.md:115,
tests/garden-doors.mjs, tests/spire-poster.mjs, docs). The directory is not in
the tree and has never been committed on any branch. docs/DESIGN-ELEVATION-PLAN.md:200
says plainly: "Mockups: scratchpad/market-quality-mockups/ (Phase 0, **not in
repo**)", so this is a known-external reference, presumably alive on Tom's
machine. But most of the citing comments do not say so: app.css and js/app.js
say "Approved mockup: market-quality-mockups/crew-fan.html; spec + acceptance:
market-quality-mockups/crew-fan-HANDOFF.md" as if a reader could open them, and
CLAUDE.md (a standing instruction file) sends every future session to
`market-quality-mockups/today-v4.html` for the figure-contract reference build.
tests/mockup-parity.mjs does NOT need the directory (it checks signature markers
inside js/app.js), so the gate is unaffected. The risk is nobody in a fresh
checkout can consult the acceptance specs these comments lean on, and if Tom's
local copy is ever lost the specs are gone with it.

### 2.3 release-gate.mjs: the suite-rot-audit declaration (certain)

**tests/release-gate.mjs:274**: *"audits that never run, and audits aimed at
deleted UI. Exits 1 by design on a tree that still has rot; see
gwart/dead-audits for the first two."*

Three problems, all statically verifiable:

- The audit's actual exit is `process.exit(failed ? 1 : 0)`
  (tests/suite-rot-audit.mjs:440). It exits 1 only when it finds rot, not "by
  design".
- The two motivating rot findings its header names are both fixed on this tree:
  tests/t2-audit.mjs:37 now destructures `serveTree` from its godmode import,
  and tests/garden-intro-audit.mjs queries `.t3-bed` with `.plot-card` only in
  a comment. So on this tree the declaration describes a red suite that is
  green, which is exactly the reported observation ("It exits 0").
- "gwart/dead-audits" answers to nothing (2.1 item 7).

The declaration sits inside a comment block (release-gate.mjs:269-273) that
justifies keeping a permanently-red suite out of FAST. That whole justification
now describes a suite that is not red.

### 2.4 release-gate.mjs: the stale sw-upgrade block comment (certain)

**tests/release-gate.mjs:326-346** still reads: *"it is DELIBERATELY RED on
main today. The reds are the deliverable and both are pre-existing: sw.js:174
serves a non-OK response... app.js:519-520 promises 'Update ready...' and
nothing applies it."* Both findings were fixed by ddbb079 (v391), and that same
commit updated the sw-upgrade-audit DECLARED entry two entries below to say
"both are fixed as of v391 and it is GREEN, 35 checks", while leaving this
comment untouched. The comment now (a) contradicts the declaration it was
written for, (b) cites line numbers that have drifted (the "Update ready" toast
is at js/app.js:558; the non-OK-response logic sw.js:174 pointed at is now the
fixed block around sw.js:215-222), and (c) sits directly above the
**map-offline-audit** entry, so a reader skimming the file attaches "eight
minutes, deliberately red" to the wrong suite.

### 2.5 release-gate.mjs: the offline-boot-audit declaration (certain that its stated cause is gone)

**tests/release-gate.mjs:249**: *"RED on main today, and the red is the
finding... js/haptics.js and js/bosses.js are static imports of js/app.js that
are not in sw.js PRECACHE."* They are in PRECACHE (sw.js:32-33, added by the
a6e4d9a hotfix; sw.js's own comment at :18 records the addition). The stated
reason for the red no longer exists in the source. Whether the suite is green
now was not verified (not run, per the rules), so: the claim's premise is
certainly false, the suite's current colour is suspected-green.

### 2.6 release-gate.mjs: sheet-action-reachable-audit (certain for the pointer, unverifiable for the status)

Covered in 2.1 item 5: the "DELIBERATELY RED as of today" justification points
at a document that was never committed, and "as of today" was 2026-08-15 or
earlier. Whether it is still red cannot be checked statically.

### 2.7 Line-number citations: 159 of 219 checkable ones no longer hold (132 certain, 27 suspected)

Method: every `file:line` citation in the tree (223 instances) was resolved and
the cited line's ACTUAL current content compared against the citing claim; when
they disagreed, the claimed identifier or quoted string was located elsewhere
in the target file. 60 citations still point at their content (within 2
lines). 132 are **certain drift**: the claimed content exists in the file but
at a different line, drift ranging from +4 to +11,650 lines. 27 are
**suspected drift**: the relocation probe could not pin a single site (usually
because the identifier appears at more than 12 places, e.g. `armToConfirm`,
`toast()`, `avatarLayersHtml`); every one that was then hand-checked was also
drift, none was a genuinely absent identifier. The complete row-by-row table is
in the Appendix.

The ones most worth knowing about, because the citing file is live guidance or
a running test rather than a dated report:

| Citing site | Claim | Actually |
|---|---|---|
| tests/release-gate.mjs:337-339 | sw.js:174 serves non-OK as answer; app.js:519-520 "Update ready" | fixed; toast now at js/app.js:558; see 2.4 |
| tests/selector-audit.mjs:15 | "$()/$$() (app.js:83)" | js/app.js:87-88 |
| tests/petlevel-audit.mjs:16 | "(js/app.js:558). openPetLevelUp is module-scope" | openPetLevelUp at js/app.js:11636; :558 is now the Update-ready toast |
| tests/backup-roundtrip-audit.mjs:3, tests/db-export-completeness-lint.mjs:3 | exportAll js/db.js:84, importAll :91 | js/db.js:101 and :111 |
| tests/figure-audit.mjs:64 | "COVERAGE fails naming js/app.js:418" | that region is now icon tables; the sample site is elsewhere |
| tests/gate-audit.mjs:16,20,26,75 | prove-red instructions pointing at app.js:2066, :13632, :14922 | all three drifted (+1898, +1335, about -220); following the instruction verbatim edits the wrong code |
| tests/sheet-action-reachable-audit.mjs:44,199,571 | "armToConfirm (js/app.js:396)" | js/app.js:437 |
| docs/MORNING-REPORT-HANDOFF.md:131-132 | openFeedbackSheet js/app.js:6206; map report sheet :9918 | js/app.js:8455 and :10602 |
| ROADMAP.md:1582 | "BH_ITEMS.filter(i => !i.default) (js/app.js:8511)" | js/app.js:9893 |
| docs/CRATE-REVEAL.md:56 | "@keyframes crateshake left in app.css at L686" | app.css:741-742 |

Overall pattern: js/app.js has grown by roughly 1,000 to 2,000 lines across the
last few releases, so every absolute app.js line citation older than a release
or two is wrong. The gwart/JS-CRASH-AUDIT.md and docs/PLAN-*.md tables are
dated documents and their drift is expected aging, but tests carry these
numbers in prove-red instructions, where following a stale number is actively
harmful (see the gate-audit rows above).

### 2.8 The four line citations into files not in the tree (not broken, but flagged)

tests/godmode.js:348-349 and tests/unit.test.js:2340-2342 cite
`puppeteer-core/.../cdp/Page.js:819` and `.../EmulationManager.js:335`
(node_modules internals, quoted excerpts included in the comments, so a reader
can still verify against an installed copy); tests/crew-pair-audit.mjs:82 uses
`server/node_modules/wrangler/bin/wrangler.js` at runtime (wrangler ^3.99.0 is
declared in server/package.json, so the path exists after install). Not rot;
listed so the count reconciles.

---

## 3. UNCERTAIN list

**3.1 File paths that did not resolve but are not (or may not be) rot:**

- *Planned files in plan docs* (suspected fine; they are written as future
  work): tests/design-audit.mjs (docs/DESIGN-ELEVATION-PLAN.md:95,205, written
  as "new tests/design-audit.mjs"), tests/onb-raise-audit.mjs,
  tests/welcome-chest-audit.mjs, tests/permission-ask-audit.mjs
  (docs/PLAN-the-raising.md:278-279), tests/studio-audit.mjs
  (docs/PLAN-the-studio.md:238). Note: studio-audit.mjs actually EXISTS on the
  unmerged branch `origin/ext/studio-compositor` (commit 26a899f), so that plan
  is partially executed; if that branch is abandoned, the doc's "All proven red
  first" becomes unbacked.
- *Documented-external*: everything in 2.2; CHAT-HANDOFF.md (release-gate.mjs
  reads it from OUTSIDE the repo root at `../CHAT-HANDOFF.md`, by design);
  native/BoneheadzGym-debug.apk and the upload keystore (both in
  native/.gitignore, build artifacts).
- *Extraction artifacts of my own regex, verified present*:
  assets/fonts/bangers.woff2, assets/shortcut/Sync-Boneheadz.shortcut,
  assets/eggs/step/f1..f15.png, assets/bh/fx/jab and /swing frames,
  native/android/.../BhVault.kt and HealthPlugin.kt (ellipsis notation; the
  files exist at their full paths), js/a.js (a fixture name inside
  selector-audit's self-test), tests/zzz-audit.mjs (release-gate.mjs:194
  describes deliberately dropping a nonexistent file to prove a check dead;
  correctly absent).

**3.2 Gate declarations whose red/green claims cannot be checked statically:**

- race-you.mjs "Red on main for a date reason tracked separately" (tracked
  where? no pointer to follow).
- spire-gate.mjs "RED under BOTH headless modes... Under triage".
- paddock-card-audit "it is just not routed on main yet" (paddock surfaces are
  off-limits to this session; not examined).
- Every stated runtime ("25s", "about four minutes", "about eight minutes") and
  every "N checks green on four consecutive runs" claim: plausible, unverified,
  per the no-running rule.

**3.3 Other uncertain items:**

- breed-sheet-scroll-audit's "Proven red at 19c3a99": the hash exists
  (2026-08-15, merge of PR #14 "fix/pages-symlink") and its tree does contain
  the stable/breeding UI, so the claim is plausible; the odd part is that the
  commit subject is an unrelated symlink fix, so suspected-fine, worth an
  eyebrow.
- The ddbb079 claim "Gate coverage 144 audits, none undeclared" matches my
  static count (147 runnable files minus 3 HELPERS = 144). Consistent.
- gwart/JS-CRASH-AUDIT.md rows marked **UNCONFIRMED** by their own author were
  taken at their word and not re-litigated.

---

## 4. What was not checked, and why

- **Nothing was executed.** No suite, no gate, no dynamic import of gate
  modules (parse checks used `node --check` only). So no claim of the form
  "suite X is currently green/red" or "takes Ns" was verified at runtime; where
  the tree statically contradicts a red claim's stated CAUSE (2.3, 2.5) that
  contradiction is reported instead.
- **Production and live-site claims** (measured production numbers in
  race-results-audit's declaration, boot timings, memory tables in
  js/app.js:3204 and tests/memory-census.mjs): the numbers are measurements
  from past sessions; only their pointers were checked.
- **Quotes attributed to Tom or Reg** in comments: no corroboration source in
  the repo.
- **claude.ai artifact UUIDs** (ROADMAP.md, docs/HANDOFF.md,
  docs/PLAN-the-studio.md) and Cam's asset-upload ids: external services.
- **Uncommitted state of other agents' worktrees/branches** on this shared box:
  off-limits, and irrelevant to what a reader of main can reach.
- **server/** was read (schema.sql, package.json) only to resolve citations
  pointing INTO it; nothing there was audited on its own terms (disputed area).
- **tests/selector-audit.mjs and tests/suite-rot-audit.mjs already cover** the
  machine-checkable selector classes: selector-audit sweeps every literal
  selector QUERIED in js/ against emissions in js/, data/ and index.html
  (deliberately refusing CSS and comments as evidence of life); suite-rot
  sweeps selectors queried by tests/ against the app corpus, plus unbound
  godmode imports. What neither covers, and what section 1 row 5 adds, is
  selectors cited in COMMENTS and docs as claims about the app; that sweep
  found zero live-claim rot (every non-emitted cited token is either described
  by its own citation as removed, or is residue the citing doc itself flags).

---

## Appendix: every line-number citation that no longer points at its claim

Verdict format: the probe (identifier or quoted string taken from the citing
line), where it actually is now, and the drift in lines. "+N other hits" means
the probe also appears elsewhere in the file; the nearest hit to the cited line
is reported. Suspected rows are where no probe could be relocated uniquely
(probe too common or the citing line carries no strong identifier); spot checks
of those found drift in every case examined, not absence.

### Certain drift (132 rows)

| citing file:line | cited target | where the claimed content actually is | the claim (truncated) |
|---|---|---|---|
| ROADMAP.md:1279 | js/game.js:341 | DRIFT "STEP_OVER" actually at :387 (+1 other hits) (drift +46) | ('js/game.js:341') caps the real reward at 10,000 and 'STEP_OVER' pays a |
| ROADMAP.md:1580 | js/loot.js:973 | DRIFT "collectedLooks" actually at :985 (+1 other hits) (drift +12) | INVESTIGATED, NOT YET DIAGNOSED. collectedLooks() (js/loot.js:973) unions |
| ROADMAP.md:1582 | js/app.js:8511 | DRIFT "BH_ITEMS" actually at :9893 (+9 other hits) (drift +1382) | reading. The denominator is BH_ITEMS.filter(i => !i.default) (js/app.js:8511). |
| ROADMAP.md:395 | js/pit.js:1416 | DRIFT "rungs" actually at :1595 (+1 other hits) (drift +179) | Ladder rungs 1-8 + The Marrow King ('js/pit.js:1416'), the 8-name gauntlet cycle, |
| ROADMAP.md:396 | js/poi.js:66 | DRIFT "Boneyard" actually at :82 (+5 other hits) (drift +16) | 6 Boneyard den bosses ('js/poi.js:66'), 5 spire wardens ('js/spires.js:62'). |
| ROADMAP.md:403 | js/app.js:11860 | DRIFT "foeOutfitFor(name)" actually at :15012 (drift +3152) | **Finding 3: it is a data change.** 'foeOutfitFor(name)' (js/app.js:11860) hashes |
| ROADMAP.md:477 | js/social.js:487 | DRIFT "gearId" actually at :591 (drift +104) | 'gearId' grant ingest the client already ships (js/social.js:487, currently |
| ROADMAP.md:798 | js/loot.js:799 | DRIFT "equipGear" actually at :960 (+1 other hits) (drift +161) | - 'equipGear' (js/loot.js:799) writes **both** 'gearloadout[slot]' and 'equipped[slot] = g.artId'. Wearing the |
| ROADMAP.md:799 | js/loot.js:788 | DRIFT "choosing" actually at :1205 (drift +417) | - 'equip' (js/loot.js:788) does the reverse: *"choosing a plain look drops the statted piece from that slot."* |
| docs/DESIGN-ELEVATION-PLAN.md:121 | js/game.js:109-116 | DRIFT "consumable" actually at :429 (+3 other hits) (drift +320) | (game.js:109-116), crate/consumable icons (loot.js), the 4 potion iconIds, |
| docs/DESIGN-ELEVATION-PLAN.md:24 | app.css:709-750 | DRIFT "MIDNIGHT" actually at :775 (drift +66) | - TWO design systems stacked: the "MIDNIGHT LOOK v180" layer (app.css:709-750) |
| docs/HANDOFF.md:38 | app.css:709-750 | DRIFT ".page-h1" actually at :806 (+4 other hits) (drift +97) | 'app.css:709-750' redefines '.card' / '.btn' / '.page-h1' over their originals |
| docs/MORNING-REPORT-HANDOFF.md:131 | js/app.js:6206 | DRIFT "openFeedbackSheet" actually at :8455 (+1 other hits) (drift +2249) | \| 'feedback' \| free-text bug report / tester feedback \| 'openFeedbackSheet', 'js/app.js:6206' \| |
| docs/MORNING-REPORT-HANDOFF.md:132 | js/app.js:9918 | DRIFT "unreachable" actually at :10602 (+8 other hits) (drift +684) | \| 'unreachable' \| POI you cannot physically reach \| map report sheet, 'js/app.js:9918' \| |
| docs/PLAN-remove-weapons.md:111 | js/pit.js:1426 | DRIFT "Bonecrusher" actually at :293 (drift -1133) | \| 2 \| Enemy Bonecrusher \| 'js/pit.js:1426, 1474, 1488' \| **fold into foe stats, re-baseline with the sim** \| |
| docs/PLAN-remove-weapons.md:112 | js/app.js:12907 | DRIFT "inventory" actually at :13472 (+6 other hits) (drift +565) | \| 3 \| Champion prize (first ladder) \| 'js/app.js:12907' writes a 'kind:'weapon'' inventory row \| **remove the  |
| docs/PLAN-remove-weapons.md:114 | js/loot.js:844-870 | DRIFT "buyWeapon" actually at :941 (drift +97) | \| 5 \| Buy flow \| 'buyWeapon', 'WEAPON_COST', 'weaponCoinCost', 'weaponDustCost' in 'js/loot.js:844-870' \| dele |
| docs/PLAN-the-raising.md:148 | js/app.js:11875 | DRIFT "Remote" actually at :13859 (+6 other hits) (drift +1984) | else ('js/loot.js:258'); the Remote Den spends no energy ('js/app.js:11875'). |
| docs/PLAN-the-raising.md:148 | js/loot.js:258 | DRIFT "spends" actually at :924 (drift +666) | else ('js/loot.js:258'); the Remote Den spends no energy ('js/app.js:11875'). |
| docs/PLAN-the-raising.md:155 | js/app.js:1440 | DRIFT "pattern" actually at :1291 (+5 other hits) (drift -149) | blind 3.5s after boot ('js/app.js:1440'). That is the cold-sheet pattern this |
| docs/PLAN-the-raising.md:22 | js/app.js:7274 | DRIFT "renderOnboarding" actually at :9364 (+5 other hits) (drift +2090) | Onboarding is three steps today ('renderOnboarding', 'js/app.js:7274'): |
| docs/PLAN-the-raising.md:90 | js/game.js:546 | DRIFT "initLootIfNeeded" actually at :584 (drift +38) | 'initLootIfNeeded' ('js/game.js:546') currently grants 1 golden + 1 daily, gated |
| gwart/JS-CRASH-AUDIT.md:100 | js/social.js:242 | DRIFT "stuck" actually at :299 (drift +57) | from 'signedFetch' at 'js/social.js:242'; the stuck control is |
| gwart/JS-CRASH-AUDIT.md:101 | js/app.js:6480 | DRIFT "openNameBuilder" actually at :7127 (+6 other hits) (drift +647) | 'js/app.js:6480' ('openNameBuilder''s '#nbSave' handler). |
| gwart/JS-CRASH-AUDIT.md:126 | /js/social.js:294 | DRIFT "setName" actually at :306 (drift +12) | async Module.setName (…/js/social.js:294:13) |
| gwart/JS-CRASH-AUDIT.md:136 | js/social.js:479 | DRIFT "syncProfile" actually at :494 (+1 other hits) (drift +15) | **Two latent siblings, left alone.** 'syncProfile' ('js/social.js:479') and |
| gwart/JS-CRASH-AUDIT.md:173 | js/app.js:11806 | DRIFT "vaultRowHtml" actually at :12833 (+1 other hits) (drift +1027) | The real consumer, 'vaultRowHtml' at 'js/app.js:11806', uses the correct keys |
| gwart/JS-CRASH-AUDIT.md:228 | js/app.js:2813 | DRIFT "[data-open]" actually at :10511 (drift +7698) | 'js/app.js:2813' have **no 'disabled' guard**, unlike '[data-open]' at |
| gwart/JS-CRASH-AUDIT.md:229 | js/app.js:9722 | DRIFT "hundred" actually at :7976 (+1 other hits) (drift -1746) | 'js/app.js:9722' which does. Two Claim taps a few hundred ms apart on Today |
| gwart/JS-CRASH-AUDIT.md:238 | js/app.js:9714 | DRIFT "[data-hatch]" actually at :10504 (drift +790) | '[data-hatch]' ('js/app.js:9714') has no guard and 'hatchEgg' deletes its own |
| gwart/JS-CRASH-AUDIT.md:242 | js/app.js:2407 | DRIFT "refreshPitEnergy" actually at :2538 (+2 other hits) (drift +131) | render's 'Promise.all([...refreshPitEnergy()...])' at 'js/app.js:2407'. |
| gwart/JS-CRASH-AUDIT.md:245 | js/app.js:13686 | DRIFT "checkSieges" actually at :14752 (+2 other hits) (drift +1066) | 'checkSieges' poll at 'js/app.js:13686') vs 'js/spires.js:262' |
| gwart/JS-CRASH-AUDIT.md:245 | js/spires.js:262 | DRIFT "spires" actually at :165 (+5 other hits) (drift -97) | 'checkSieges' poll at 'js/app.js:13686') vs 'js/spires.js:262' |
| gwart/JS-CRASH-AUDIT.md:246 | js/app.js:13187 | DRIFT "collectTribute" actually at :14253 (+1 other hits) (drift +1066) | ('collectTribute', driven by a marker tap at 'js/app.js:13187'). Two |
| gwart/JS-CRASH-AUDIT.md:252 | js/game.js:468 | DRIFT "onHealthSync" actually at :438 (drift -30) | ('js/poi.js:523') and 'onHealthSync' ('js/game.js:468'). |
| gwart/JS-CRASH-AUDIT.md:262 | js/loot.js:715-725 | DRIFT "petLvlSteps" actually at :736 (+9 other hits) (drift +21) | 11. **'petLvlSteps'** - 'js/loot.js:715-725' vs ':507' and ':551'; the loss is |
| gwart/JS-CRASH-AUDIT.md:266 | js/app.js:9153 | DRIFT "fitPrice" actually at :9943 (+2 other hits) (drift +790) | 'Promise.all(fitList.map(fitPrice))' at 'js/app.js:9153'. Re-charges dust |
| gwart/JS-CRASH-AUDIT.md:268 | js/loot.js:989-993 | DRIFT "retired" actually at :1281 (drift +292) | 'js/loot.js:989-993' says was retired. |
| gwart/JS-CRASH-AUDIT.md:280 | js/app.js:11941 | DRIFT "adoptIdentity" actually at :9066 (drift -2875) | 'js/app.js:8344' ('adoptIdentity' handler) and 'js/app.js:11941' |
| gwart/JS-CRASH-AUDIT.md:280 | js/app.js:8344 | DRIFT "adoptIdentity" actually at :9066 (drift +722) | 'js/app.js:8344' ('adoptIdentity' handler) and 'js/app.js:11941' |
| gwart/JS-CRASH-AUDIT.md:288 | js/app.js:6335-6340 | DRIFT "renderFoods" actually at :7038 (+1 other hits) (drift +703) | 'renderFoods' reads 'S.userFoods' directly ('js/app.js:6335-6340'), and |
| gwart/JS-CRASH-AUDIT.md:289 | js/app.js:2315 | DRIFT "findFood" actually at :2436 (+4 other hits) (drift +121) | 'findFood' ('js/app.js:2315') resolves logged entries through it, so after a |
| gwart/JS-CRASH-AUDIT.md:300 | js/app.js:2166 | DRIFT "driven" actually at :10490 (+2 other hits) (drift +8324) | **CONFIRMED by reading**, not driven. 'js/app.js:2166'. |
| gwart/JS-CRASH-AUDIT.md:325 | js/app.js:1109 | DRIFT "raceLanesHtml" actually at :1158 (+2 other hits) (drift +49) | 'js/app.js:1109' and ':1120', 'raceLanesHtml' / 'openRaceResults'. |
| gwart/JS-CRASH-AUDIT.md:328 | js/app.js:1099 | DRIFT "/steps/settled" actually at :1115 (drift +16) | '/steps/settled' returned. 'settledPodium' ('js/app.js:1099') guards only |
| gwart/JS-CRASH-AUDIT.md:366 | js/sources.js:21-32 | DRIFT "isFinite" actually at :8 (drift -13) | 'js/sources.js:21-32'; 'n()' at ':8' checks only 'isFinite'. **UNCONFIRMED.** |
| gwart/JS-CRASH-AUDIT.md:369 | js/sources.js:137 | DRIFT "sources" actually at :194 (drift +57) | score at 'js/sources.js:137' and ':190', never a gate. A scanned |
| gwart/JS-CRASH-AUDIT.md:371 | js/game.js:484-489 | DRIFT "awardDayCloseIfDue" actually at :516 (drift +32) | 'awardDayCloseIfDue' ('js/game.js:484-489') down the 'dayeffort' branch, and the |
| gwart/JS-CRASH-AUDIT.md:375 | js/game.js:591-593 | DRIFT "parseHkPayload" actually at :655 (drift +64) | 'js/game.js:591-593' ('parseHkPayload'). **UNCONFIRMED.** 'weightKg' gets a |
| gwart/JS-CRASH-AUDIT.md:380 | js/labelparse.js:86-89 | DRIFT "lines" actually at :79 (+5 other hits) (drift -7) | 'js/labelparse.js:86-89', where the sibling branch four lines up at ':83' does |
| gwart/JS-CRASH-AUDIT.md:39 | js/app.js:11680 | DRIFT "ingestHkFromUrl" actually at :12708 (+1 other hits) (drift +1028) | **CONFIRMED.** 'js/app.js:11680' ('ingestHkFromUrl'), thrown at the |
| gwart/JS-CRASH-AUDIT.md:413 | js/app.js:2238 | DRIFT "nextToast" actually at :2291 (+2 other hits) (drift +53) | 'js/app.js:2238' ('nextToast') reads '$('#toast')', and '#toast' is a static |
| gwart/JS-CRASH-AUDIT.md:414 | index.html:64 | DRIFT "nothing" actually at :70 (+4 other hits) (drift +6) | element in 'index.html:64' that nothing removes, so the receiver cannot be |
| gwart/JS-CRASH-AUDIT.md:415 | js/app.js:10166 | DRIFT "yields" actually at :5053 (+3 other hits) (drift -5113) | null. 'js/app.js:10166' maps over '$$()', which yields an array of live nodes, |
| gwart/JS-CRASH-AUDIT.md:420 | js/app.js:2134 | DRIFT "screenCleanup?.()" actually at :2194 (drift +60) | 'route()' calls 'screenCleanup?.()' at 'js/app.js:2134' inside a 'try' that |
| gwart/JS-CRASH-AUDIT.md:99 | js/social.js:293 | DRIFT "setName" actually at :306 (drift +13) | **CONFIRMED.** 'js/social.js:293' ('setName'), unhandled rejection surfacing |
| js/app.js:13587 | js/app.js:14166 | DRIFT "startMap" actually at :14385 (+5 other hits) (drift +219) | so (startMap, js/app.js:14166) after a guess said otherwise. */ |
| js/app.js:13934 | js/spires.js:102 | DRIFT "claimedAt" actually at :114 (+5 other hits) (drift +12) | // to exist (spires.js:102), so if we have one, read claimedAt from it |
| tests/backup-roundtrip-audit.mjs:22 | js/app.js:7585 | DRIFT "#exportBtn" actually at :9186 (drift +1601) | *   A. '#exportBtn' in js/app.js:7585 early-returns on 'isNative()' with a |
| tests/backup-roundtrip-audit.mjs:285 | js/db.js:61 | DRIFT "readwrite" actually at :78 (+4 other hits) (drift +17) | 'state after mid-import synthetic failure: ${JSON.stringify(partial.state)}  err=${partial.err}. Each row is p |
| tests/backup-roundtrip-audit.mjs:3 | js/db.js:84 | DRIFT "exportAll" actually at :101 (+1 other hits) (drift +17) | * Settings -> YOUR DATA fires exportAll (js/db.js:84) and importAll (js/db.js:91). |
| tests/backup-roundtrip-audit.mjs:3 | js/db.js:91 | DRIFT "exportAll" actually at :101 (+1 other hits) (drift +10) | * Settings -> YOUR DATA fires exportAll (js/db.js:84) and importAll (js/db.js:91). |
| tests/boneyard-audit.mjs:464 | tests/godmode.js:196 | DRIFT "godmode" actually at :238 (+1 other hits) (drift +42) | evaluateOnNewDocument survives seed()'s reload (see godmode.js:196). */ |
| tests/cloud-restore-silent-audit.mjs:21 | js/app.js:535 | DRIFT "const NOSOCIAL = S.demo \|\| navigator.webdriver === true" actually at :577 (drift +42) | *  1. app.js:535 'const NOSOCIAL = S.demo \|\| navigator.webdriver === true', so |
| tests/crate-palette-audit.mjs:112 | js/app.js:14722 | DRIFT "scales" actually at :15935 (+4 other hits) (drift +1213) | navigator.webdriver scales JS timing by 0.25 at js/app.js:14722 while CSS |
| tests/crate-palette-audit.mjs:82 | js/app.js:11096 | DRIFT "__crateForce" actually at :11152 (+2 other hits) (drift +56) | /* __crateForce OR THERE IS NO CRATE. js/app.js:11096 reads |
| tests/day-strip-audit.mjs:5 | js/app.js:2138-2140 | DRIFT "#datePick" actually at :2799 (drift +661) | * '#datePick' (js/app.js:2138-2140) were referenced by ZERO test files, on the |
| tests/db-export-completeness-lint.mjs:3 | js/db.js:84 | DRIFT "exportAll" actually at :101 (+1 other hits) (drift +17) | * js/db.js:84 (exportAll) and js/db.js:91 (importAll) hand-list the seven |
| tests/db-export-completeness-lint.mjs:3 | js/db.js:91 | DRIFT "exportAll" actually at :101 (+1 other hits) (drift +10) | * js/db.js:84 (exportAll) and js/db.js:91 (importAll) hand-list the seven |
| tests/db-quota-finding.mjs:171 | js/db.js:91 | DRIFT "importAll" actually at :11 (+2 other hits) (drift -80) | 'underlying transaction aborts. importAll (js/db.js:91) has no try/catch', |
| tests/endless-look-audit.mjs:11 | tests/unit.test.js:2276 | DRIFT "asserts" actually at :2198 (+3 other hits) (drift -78) | * tests/unit.test.js:2276 asserts 'endlessFoe(rank).look' has a body and a |
| tests/fight-layout-audit.mjs:230 | js/app.js:13964 | DRIFT "acting" actually at :15867 (+1 other hits) (drift +1903) | at js/app.js:13964 early-returns with a "<foe> is acting..." placeholder |
| tests/fight-tray-audit.mjs:193 | app.css:1324 | DRIFT "false" actually at :305 (drift -1019) | app.css:1324 and 'masked' goes false while 'scrolls' stays true), but it is |
| tests/figure-audit.mjs:64 | js/app.js:418 | DRIFT "COVERAGE" actually at :12068 (drift +11650) | *             -> COVERAGE fails naming js/app.js:418 |
| tests/foods-delete-audit.mjs:4 | js/app.js:4577 | DRIFT "permanently" actually at :1446 (+4 other hits) (drift -3131) | * Foods tab can delete one permanently (js/app.js:4577, db.del('foods', id)) |
| tests/foods-delete-audit.mjs:55 | js/app.js:4191 | DRIFT "offers" actually at :16462 (drift +12271) | reachable at all: js/app.js:4191 only offers it for custom foods. */ |
| tests/foods-delete-audit.mjs:92 | js/app.js:5635 | DRIFT "OPENS" actually at :7354 (+4 other hits) (drift +1719) | the Foods tab OPENS THE PORTION SHEET to log it (js/app.js:5635), it does not |
| tests/foods-delete-audit.mjs:95 | js/app.js:4191 | DRIFT "logging" actually at :4124 (+7 other hits) (drift -67) | (js/app.js:4191). So the delete is three taps deep behind logging, which is |
| tests/fx-audit.js:113 | js/app.js:15117 | DRIFT "strikeFx" actually at :15486 (+6 other hits) (drift +369) | * <img> tags strikeFx builds at js/app.js:15117 go back to the network for the |
| tests/fx-audit.js:116 | js/app.js:15152-15158 | DRIFT "strikeFx" actually at :15486 (+6 other hits) (drift +334) | * over a second, while strikeFx's own safety net (js/app.js:15152-15158) gives up |
| tests/fx-audit.js:120 | tests/release-gate.mjs:53-54 | DRIFT "release" actually at :18 (+11 other hits) (drift -35) | * Last-Modified and the same tree passes. tests/release-gate.mjs:53-54 sends |
| tests/fx-audit.js:135 | sw.js:55-60 | DRIFT "install" actually at :173 (drift +118) | *      the host: sw.js:55-60 precaches all six strike frames on install |
| tests/fx-audit.js:137 | sw.js:183-184 | DRIFT "player" actually at :217 (drift +34) | *      (sw.js:183-184), so a player who has opened the app once fights with these |
| tests/fx-audit.js:39 | app.css:4069 | DRIFT "crossfade" actually at :4312 (drift +243) | * the LIVE, mid-flight value of the crossfade declared at app.css:4069 |
| tests/fx-audit.js:42 | js/app.js:14722 | DRIFT "fast = !!navigator.webdriver" actually at :15104 (drift +382) | * Meanwhile js/app.js:14722 sets 'fast = !!navigator.webdriver', so under any |
| tests/fx-audit.js:43 | js/app.js:15138 | DRIFT "automation" actually at :11235 (+3 other hits) (drift -3903) | * automation the whole animation is played at 4x: js/app.js:15138 scales every JS |
| tests/fx-audit.js:67 | js/app.js:16096 | DRIFT "warmStrikeFx" actually at :16478 (+2 other hits) (drift +382) | *     warmStrikeFx (js/app.js:16096) in ~40ms with transferSize > 0, and the audit |
| tests/fx-audit.js:72 | js/app.js:15139 | DRIFT "strikeFx" actually at :15486 (+6 other hits) (drift +347) | * strikeFx() writes at js/app.js:15139, which is exactly "this is the frame I am |
| tests/gate-audit.mjs:131 | tests/unit.test.js:1869 | DRIFT "CLAUDE" actually at :1877 (+2 other hits) (drift +8) | (tally/CLAUDE.md rule 3, and tests/unit.test.js:1869 for the same fix). */ |
| tests/gate-audit.mjs:16 | js/app.js:2066 | DRIFT "if (!spent)" actually at :3964 (drift +1898) | * PROVE-RED (confirmed 2026-08-07): change app.js:2066 back to 'if (!spent)' and |
| tests/gate-audit.mjs:20 | js/app.js:13632 | DRIFT "spendPitFight" actually at :14967 (+3 other hits) (drift +1335) | * js/app.js:13632 to 'const { ok } = await spendPitFight();' and drop the guard. |
| tests/gate-audit.mjs:26 | js/app.js:14922 | DRIFT "NOTHING" actually at :14701 (+4 other hits) (drift -221) | * it understood NOTHING about was js/app.js:14922, the spire claim, which is the |
| tests/glutton-audit.mjs:157 | js/poi.js:600 | DRIFT "ledger" actually at :646 (+2 other hits) (drift +46) | * +0 and +0, with the ledger stuck at one row. The guard is at js/poi.js:600, |
| tests/health-intake-audit.mjs:128 | js/app.js:10729 | DRIFT "clipboard" actually at :9251 (+9 other hits) (drift -1478) | navigator.clipboard.readText() at app.js:10729. Overriding the method |
| tests/health-intake-audit.mjs:5 | js/game.js:564 | DRIFT "parseHkPayload" actually at :655 (drift +91) | * navigator.clipboard, passes it to parseHkPayload (js/game.js:564), and |
| tests/health-intake-audit.mjs:6 | js/app.js:9558 | DRIFT "ingestHealth" actually at :8873 (+8 other hits) (drift -685) | * pipes the return through ingestHealth (js/app.js:9558) which writes a |
| tests/importall-interrupt-finding.mjs:3 | js/db.js:91-101 | DRIFT "importAll" actually at :11 (+2 other hits) (drift -80) | * js/db.js:91-101 (importAll) writes each store's rows in a SEPARATE |
| tests/lb-memory-audit.mjs:9 | server/src/index.js:679-694 | DRIFT "server" actually at :832 (+8 other hits) (drift +153) | * (server/src/index.js:679-694), covering every field it can emit as null |
| tests/notif-audit.mjs:5 | js/app.js:1573 | DRIFT "retention" actually at :9502 (drift +7929) | * js/app.js:1573). The retention lever, and it fails silently in both |
| tests/notif-tier-audit.mjs:132 | js/app.js:14397 | DRIFT "notifyNow" actually at :14630 (+10 other hits) (drift +233) | js/app.js:14397 called notifyNow with no gate at all and the device queued it |
| tests/offline-boot-audit.mjs:91 | js/app.js:507 | DRIFT "registers" actually at :2163 (+1 other hits) (drift +1656) | js/app.js:507 registers sw.js only when '!S.demo && location.protocol === |
| tests/petlevel-audit.mjs:16 | js/app.js:558 | DRIFT "openPetLevelUp" actually at :11636 (+1 other hits) (drift +11078) | * (js/app.js:558). openPetLevelUp is module-scope, not exported to window. |
| tests/petlevel-audit.mjs:24 | js/pets.js:135 | DRIFT "battle" actually at :131 (+4 other hits) (drift -4) | * ASSERTIONS use the battle-stat formulas from js/pets.js:135 as ground |
| tests/petlevel-audit.mjs:44 | js/app.js:9647 | DRIFT "jumps" actually at :7657 (drift -1990) | * at app.js:9647. The seed jumps steps from L2 (needs 4000) to L3 (needs |
| tests/petlevel-audit.mjs:83 | js/pets.js:135 | DRIFT "itself" actually at :234 (drift +99) | /* Expected deltas from pets.js:135 formulas. Read them from the app itself |
| tests/precache-assets-audit.mjs:221 | sw.js:135 | DRIFT "PRECACHE" actually at :177 (+1 other hits) (drift +42) | * sw.js's install is Promise.all over the full PRECACHE list (sw.js:135), so |
| tests/redeem-audit.mjs:245 | js/loot.js:499 | DRIFT "nothing" actually at :440 (+11 other hits) (drift -59) | (js/loot.js:499), so the seed wrote to a key nothing reads and the |
| tests/redeem-audit.mjs:84 | js/app.js:2264 | DRIFT "nextToast" actually at :2291 (+2 other hits) (drift +27) | the previous one. nextToast() (js/app.js:2264) does not clear #toast between |
| tests/redeem-dupe-audit.mjs:14 | js/app.js:9097 | DRIFT "unlocked" actually at :9166 (+8 other hits) (drift +69) | *   pet: "<Name> unlocked! Equip it in your Wardrobe." (js/app.js:9097). The |
| tests/redeem-dupe-audit.mjs:15 | js/app.js:9098 | DRIFT "consolation" actually at :9158 (+2 other hits) (drift +60) | *   already-owned consolation copy at js/app.js:9098 is dead with it. |
| tests/redeem-dupe-audit.mjs:32 | js/loot.js:492 | DRIFT "nothing" actually at :440 (+11 other hits) (drift -52) | *     is 'sp' (js/loot.js:492, :499), so that seed wrote to a key nothing |
| tests/redeem-dupe-audit.mjs:70 | js/app.js:2264 | DRIFT "nextToast" actually at :2291 (+2 other hits) (drift +27) | nextToast() (js/app.js:2264) hides the old message and shows the next |
| tests/release-gate.mjs:336 | sw.js:174 | DRIFT "instead" actually at :222 (+1 other hits) (drift +48) | - sw.js:174 serves a non-OK response as the answer instead of falling back |
| tests/release-gate.mjs:339 | js/app.js:519-520 | DRIFT "Update ready. Leave this screen to apply" actually at :558 (drift +39) | - app.js:519-520 promises "Update ready. Leave this screen to apply" and |
| tests/selector-audit.mjs:10 | js/app.js:12970 | DRIFT "comment" actually at :12108 (+10 other hits) (drift -862) | * (2026-08-11, the comment above the fix at js/app.js:12970 tells the story). |
| tests/sheet-action-reachable-audit.mjs:199 | js/app.js:396 | DRIFT "wired" actually at :362 (+2 other hits) (drift -34) | is wired through 'armToConfirm' (js/app.js:396), so 'grep -n 'armToConfirm(' |
| tests/sheet-action-reachable-audit.mjs:38 | app.css:6432 | DRIFT "something" actually at :6147 (+10 other hits) (drift -285) | *             at app.css:6432), or something is drawn OVER it. |
| tests/sheet-action-reachable-audit.mjs:476 | js/app.js:1969 | DRIFT "backupNudge" actually at :2128 (+1 other hits) (drift +159) | backupNudge (js/app.js:1969) fires ONCE a session, 4 seconds late, for |
| tests/siege-client-audit.mjs:134 | js/app.js:11696 | DRIFT "spireInRange" actually at :13858 (+8 other hits) (drift +2162) | // populate 'spireInRange' (app.js:11696), which is a closure local in the |
| tests/spire-poster.mjs:154 | js/app.js:12608 | DRIFT "preserves" actually at :13935 (+2 other hits) (drift +1327) | The fix at js/app.js:12608 preserves heldSince from the local record even when |
| tests/spire-poster.mjs:155 | js/app.js:3521 | DRIFT "branches" actually at :8847 (+2 other hits) (drift +5326) | 'held' flips false at dormancy; the fix at js/app.js:3521 branches the sub to |
| tests/sw-upgrade-audit.mjs:208 | sw.js:174 | DRIFT "revalidation" actually at :207 (drift +33) | already forces revalidation for its own fetches (sw.js:174). */ |
| tests/sw-upgrade-audit.mjs:41 | sw.js:168 | DRIFT "navigate" actually at :204 (+1 other hits) (drift +36) | *   are network-first (sw.js:168 counts request.mode === 'navigate' as shell), |
| tests/sw-upgrade-audit.mjs:52 | sw.js:174 | DRIFT "answer" actually at :215 (+2 other hits) (drift +41) | *   1. sw.js:174 treats a NON-OK response as the answer. Only a THROWN fetch |
| tests/sw-upgrade-audit.mjs:60 | js/app.js:519-520 | DRIFT "Update" actually at :558 (+11 other hits) (drift +39) | *   2. app.js:519-520 tells the player "Update ready. Leave this screen to |
| tests/sw-upgrade-audit.mjs:728 | sw.js:174 | DRIFT "request" actually at :194 (+10 other hits) (drift +20) | Online this whole question is moot: sw.js:174 answers every shell request from |
| tests/sw-upgrade-audit.mjs:763 | sw.js:141-144 | DRIFT "PRECACHE" actually at :177 (+1 other hits) (drift +36) | console.log('FINDING  one 404 in PRECACHE (${BREAK}) -> install of ${B_VERSION} throws at the first non-OK (sw |
| tests/sw-upgrade-audit.mjs:811 | js/app.js:519-520 | DRIFT "console" actually at :618 (+1 other hits) (drift +99) | console.log('FINDING  app.js:519-520, "apply the new build as soon as no sheet is open" / "Update ready. Leave |
| tests/teaser-fire-audit.mjs:34 | js/app.js:591 | DRIFT "maybeShowCosmeticTeaser" actually at :652 (+1 other hits) (drift +61) | /* No manual call: maybeShowCosmeticTeaser() is invoked by BOOT (js/app.js:591), |
| tests/unit.test.js:2700 | js/app.js:9849 | DRIFT "comment" actually at :9500 (+10 other hits) (drift -349) | * to learn about a comment. Proven red against 178f442 (names app.js:9849). */ |
| tests/weight-edit-audit.mjs:10 | js/app.js:4232 | DRIFT "openEntryEdit" actually at :2976 (+1 other hits) (drift -1256) | * openEntryEdit at js/app.js:4232 -> openQuickAdd(entry) at :4244 is the |
| tests/weight-edit-audit.mjs:4 | js/app.js:5574 | DRIFT "openWeightSheet" actually at :6355 (+1 other hits) (drift +781) | * openWeightSheet at js/app.js:5574 writes to the 'weights' store, overwrites |

### Suspected drift, probe heuristic could not relocate (27 rows)

| citing file:line | cited target | verdict | the claim (truncated) |
|---|---|---|---|
| ROADMAP.md:1285 | js/app.js:11875 | UNMATCHED | the reason it exists ('js/app.js:11875'). |
| docs/DESIGN-ELEVATION-PLAN.md:109 | js/app.js:1846 | UNMATCHED | .replace class hack at app.js:1846). |
| docs/PLAN-remove-weapons.md:115 | js/app.js:4557 | UNMATCHED | \| 6 \| Equip flow \| 'kvSet('loadout', ...)' at 'js/app.js:4557' \| delete \| |
| docs/PLAN-remove-weapons.md:167 | js/app.js:12907 | UNMATCHED | 'js/app.js:12907'. |
| docs/PLAN-remove-weapons.md:67 | js/pit.js:237 | UNMATCHED | 'js/pit.js:237': |
| docs/PLAN-remove-weapons.md:84 | js/pit.js:1426 | UNMATCHED | // js/pit.js:1426 |
| docs/PLAN-remove-weapons.md:86 | js/pit.js:1488 | UNMATCHED | // js/pit.js:1488 |
| docs/PLAN-the-raising.md:201 | js/app.js:11363 | UNMATCHED | is fed by 'b.streak', which 'buildFighter' ('js/app.js:11363') recomputes as the |
| gwart/JS-CRASH-AUDIT.md:125 | /js/social.js:242 | UNMATCHED | signedFetch (…/js/social.js:242:10) |
| gwart/JS-CRASH-AUDIT.md:146 | js/app.js:8139 | UNMATCHED | **CONFIRMED by source, both platforms read.** 'js/app.js:8139'. |
| gwart/JS-CRASH-AUDIT.md:197 | js/db.js:74-78 | UNMATCHED | individual site.** 'js/db.js:74-78' is the shared primitive; thirteen call |
| gwart/JS-CRASH-AUDIT.md:252 | js/poi.js:523 | UNMATCHED | ('js/poi.js:523') and 'onHealthSync' ('js/game.js:468'). |
| gwart/JS-CRASH-AUDIT.md:285 | js/app.js:540 | UNMATCHED | 'js/app.js:8463' and boot's cloud restore at 'js/app.js:540' both run |
| gwart/JS-CRASH-AUDIT.md:285 | js/app.js:8463 | UNMATCHED | 'js/app.js:8463' and boot's cloud restore at 'js/app.js:540' both run |
| gwart/JS-CRASH-AUDIT.md:343 | js/app.js:8416 | UNMATCHED | 'js/loot.js:636-644' + 'js/app.js:8416'. **UNCONFIRMED.** The handler sets no |
| gwart/JS-CRASH-AUDIT.md:343 | js/loot.js:636-644 | UNMATCHED | 'js/loot.js:636-644' + 'js/app.js:8416'. **UNCONFIRMED.** The handler sets no |
| tests/fx-audit.js:390 | js/app.js:15139 | UNMATCHED | style.opacity = '1' on exactly one img (js/app.js:15139). This is the |
| tests/gate-audit.mjs:75 | js/app.js:14922 | UNMATCHED | result at js/app.js:14922 and reads 'r.ok' at :14933, eleven lines down, |
| tests/mage-audit.mjs:77 | js/app.js:2564 | UNMATCHED | /* .bh-anim is what avatarLayersHtml actually returns (js/app.js:2564). |
| tests/mini-theme-audit.mjs:115 | js/app.js:13356 | UNMATCHED | at js/app.js:13356 inside the fight sheet. The older '.hud-side .hud-name' |
| tests/notif-audit.mjs:163 | js/app.js:2244 | UNMATCHED | * DO NOT read #toast once and hope. 'toast()' is a QUEUE (app.js:2244): each |
| tests/notif-tier-audit.mjs:158 | js/app.js:2555 | UNMATCHED | js/app.js:2555, the Settings test button): nothing but the master switch can |
| tests/selector-audit.mjs:15 | js/app.js:83 | UNMATCHED | * $()/$$() (app.js:83), querySelector/All, closest, matches, getElementById - |
| tests/sheet-action-reachable-audit.mjs:307 | app.css:6425 | UNMATCHED | that once "sat over .cf-acts by 15px" (app.css:6425). So the tall panel is |
| tests/sheet-action-reachable-audit.mjs:44 | js/app.js:396 | UNMATCHED | * 'armToConfirm' (js/app.js:396), so 'grep -n 'armToConfirm(' js/*.js' IS the list, |
| tests/sheet-action-reachable-audit.mjs:571 | js/app.js:396 | UNMATCHED | goes through 'armToConfirm' (js/app.js:396), so 'grep -n 'armToConfirm(' js/*.js' |
| tests/sw-upgrade-audit.mjs:531 | js/app.js:519-520 | UNMATCHED | /* the claim in app.js:519-520: with a sheet open the update is NOT applied and |
