# Lying-comments census

Branch gwart/liar, tree at origin/main = ff90862, census taken 2026-08-18.
Method: static only. Read and grep; `node --check` at most. No suite was run,
no browser was driven. Every FACT below was established by reading this tree.

STATUS: in progress, committed in groups so an interrupted run still counts.
Counts at the top are updated with each group.

## Counts

- Candidates examined: (running total, see groups) 
- False (certain): tbd
- False (suspected): tbd
- Uncheckable: tbd

## Ranked findings, worst first

(Details in the groups below; final ranking assembled at the end.)

## Group 1: the importAll cluster and the release-gate self-contradictions

The fact all of these hang on: js/db.js importAll (js/db.js:197, header at
124-196) is ONE multi-store readwrite transaction over all seven stores,
clear-plus-puts dispatched synchronously, `oncomplete` the only success
signal, `onerror`/`onabort` both rejecting, and a load-bearing `t.abort()`
in a try/catch around the puts. The piecewise per-row version it replaced is
described in db.js's own header as "the previous version".

### 1. tests/importall-interrupt-finding.mjs:1-32 (header) - CERTAIN
CLAIM: "FINDING C, DEMONSTRATION HALF (Reg-authorised 2026-08-13, no fix).
js/db.js:91-101 (importAll) writes each store's rows in a SEPARATE IndexedDB
transaction (`await db.put(...)` in a loop, per store, no outer transaction)"
and, line 25: "NOT FIXED. Tom has not signed off on the repair."
FACT: importAll is a single all-or-nothing transaction with onabort/onerror
rollback (js/db.js:124-255). The header of db.js records Tom's sign-off:
"Tom, 2026-08-13, after Vlad's demonstration: 'sounds like a good fix youve
suggested'". The SAME test file's body comment (around line 153-160) already
says "The fix dispatches all puts synchronously inside a multi-store
transaction", so the file contradicts its own header.
MISLEADS: anyone triaging findings reads an open, unauthorised-to-fix data
loss bug that is in fact closed; they re-litigate a resolved decision or
leave a phantom P1 on the books.

### 2. tests/db-quota-finding.mjs:169-177 (runtime FINDING print) - CERTAIN
CLAIM: printed to the operator on every run: "WHAT THE APP DOES ON A REAL
QUOTA FAILURE (from code inspection, NOT measured here): ... importAll
(js/db.js:91) has no try/catch around the per-store puts, so a rejected
promise unwinds through the #importFile handler".
FACT: importAll has an explicit try/catch whose `t.abort()` is documented as
load-bearing (js/db.js:236-249); there are no per-store puts, there is one
transaction. The mechanism the print names does not exist on this tree.
MISLEADS: an operator mid-incident on a quota failure is handed a wrong
mechanism at runtime, worse than a stale comment because it reaches them as
tool output during triage.

### 3. tests/release-gate.mjs:326-346 (sw-upgrade-audit justification block) - CERTAIN
CLAIM: sw-upgrade-audit "is DELIBERATELY RED on main today. The reds are the
deliverable and both are pre-existing: sw.js:174 serves a non-OK response as
the answer instead of falling back to the cache ... app.js:519-520 promises
'Update ready. Leave this screen to apply' and nothing applies it on sheet
close."
FACT: both fixed in v391. sw.js:210-227 falls back to `caches.match` on a
non-OK response ("One bad file during a deploy now falls back to the last
good copy"). app.js:2399 applies the pending update: `if (updatePending &&
!sheetStack.length) { updatePending = false; location.reload(); }`. The
DECLARED entry for the same suite three lines below (release-gate.mjs:349)
already says "both are fixed as of v391 and it is GREEN, 35 checks". The
file contradicts itself within 25 lines.
MISLEADS: a release runner seeing sw-upgrade-audit red would wave it through
as "deliberately red", which is precisely the state the entry says can no
longer happen; a real regression in the upgrade path would be dismissed.

### 4. tests/release-gate.mjs:249 (offline-boot-audit DECLARED entry) - CERTAIN
CLAIM: "RED on main today, and the red is the finding, not a flake:
js/haptics.js and js/bosses.js are static imports of js/app.js that are not
in sw.js PRECACHE, so a worker that has only precached serves index.html for
them and the app is a dead shell."
FACT: sw.js:32-33 lists './js/haptics.js' and './js/bosses.js' in PRECACHE,
under a comment block (sw.js:17-31) explaining exactly why they were added.
MISLEADS: same failure-inversion as item 3: a genuinely red offline-boot run
reads as expected and is ignored; a green one reads as suspicious.

### 5. tests/release-gate.mjs:301 (importall-interrupt-finding DECLARED entry) - CERTAIN
CLAIM: "FINDING C demonstration (Reg-authorised 2026-08-13, no fix):
interrupts importAll mid-loop, prints per-store distribution".
FACT: the fix landed (item 1); there is no loop of per-store transactions to
interrupt mid-loop. "no fix" asserts the current state of the tree and is
false; the suite now demonstrates that interruption yields all-or-nothing.
MISLEADS: a gate reader planning release risk believes a known unfixed
partial-restore bug ships in the build.

### 6. tests/backup-roundtrip-audit.mjs:3-5 and 26-33 (header) - CERTAIN
CLAIM: "importAll iterates each store's array and calls db.put on every
row" and "C. importAll is NOT transactional: each `db.put` is its own tx
(js/db.js lines 61 + 91). A mid-import failure ... leaves the profile
HALF-RESTORED with no visible warning. Measured."
FACT: false on this tree (item 1's fact). The same header's own later
section ("ADDED 2026-08-16 ... THE RESTORE GUARDS") describes the
transactional clear-and-put design, and the Finding C code in the body
(lines ~281-289) explicitly notes that on the fixed tree it sees
everythingWritten=true and does not fire. Header top contradicts both.
MISLEADS: a reader stops trusting Settings restore, or re-opens the
half-restore bug as live; the "FINDINGS TO REPORT, NOT FIX" framing invites
re-reporting a fixed defect.

### 7. tests/release-gate.mjs:107 (backup-roundtrip-audit FAST comment) - CERTAIN, lesser
CLAIM: "...findings for the toast-count undercount and the non-transactional
import".
FACT: the undercount finding is still real (importAll returns counts for
foods/log/weights only, js/db.js:227) and still fires; the non-transactional
import finding is fixed and the suite's own code no longer fires it on this
tree. Half the description advertises a retired finding as current.
MISLEADS: mild version of item 6, but it sits in the file people read to
make merge decisions.
