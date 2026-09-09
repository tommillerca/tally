# Ship policy: how work gets from a Codex lane into production

Written 2026-09-09 after a day that shipped v518 through v533 and hit an
integration break on **every single multi-lane train**. This is a proposal for
grilling, not a decision.

## The evidence this is built on

Every train assembled today, and what went wrong:

| Train | Lanes | Failure at assembly |
|---|---|---|
| v525 | 7 | Brace trap in `unit.test.js`; duplicated `const PURE` declaration |
| v526 | 6 | Duplicated `const PURE`; dropped `repaintLabIngredients` call |
| v527 | 8 | `release-gate.mjs` conflict on every pick |
| v528 | 11 | Duplicated `const PURE`; orphaned dead code that faked a regression |
| v529 | 3 | **6 red audits. Hand-assembly abandoned and re-done by Codex.** |
| v531 | 2 | Podium collision; missing `acorn` dependency |
| v532 | 1 | Conflict markers committed into `release-gate.mjs` → **empty PURE list → false green** |
| v533 | 5 | 2 audit registrations dropped; missing CONTROL row |

**Zero clean assemblies.** The pattern is not "batching is bad" or "shipping
often is bad". It is:

1. **Same-file collisions are the killer.** v529's three lanes all edited
   `js/social.js` and could not be merged by hand at all.
2. **`tests/release-gate.mjs` conflicts on literally every train**, because every
   lane appends its audit. It is mechanical and safe, but it is also where
   registrations get dropped and where a bad resolution produced a false green.
3. **The gate is the cost, not the ship.** ~142 audits per run. The PR, merge and
   live poll are trivial beside it.

## The proposal

### 1. Two ship classes

**IMMEDIATE, alone, no batching:** anything broken in production for players
right now. Breeding was dead today; batching that behind cosmetic work would have
been indefensible. Also: data loss, a security or privacy defect, an outage.

**BATCHED:** everything else, grouped by **file overlap, not by clock or count**.

### 2. Group by overlap, not by time

Before assembling, compute the changed-file sets of every READY lane. Lanes whose
sets are disjoint go in one train and share one gate. Lanes that touch the same
source file ship in separate trains.

`tests/release-gate.mjs` is excluded from the overlap test: every lane touches it,
the conflict is always "append a line", and treating it as overlap would forbid
all batching. But its resolution must be **generated, never hand-merged** (see 4).

### 3. A pre-flight that refuses a bad train

Before any gate runs, the assembled tree must pass, and the assembly is abandoned
rather than patched if it does not:

- zero conflict markers in any tracked file
- `node --check` on every changed `.js`/`.mjs`
- the PURE list parses, has **no duplicates**, and is **not shorter than the
  previous release's** (a shrinking list is the false-green signature)
- every audit file on disk belongs to exactly one tier
- every new audit carries a positive CONTROL row

Each of these corresponds to a real failure above. None is hypothetical.

### 4. `release-gate.mjs` is generated at assembly, never merged

Take the file from `origin/main`, append each lane's `PURE.push` lines, write it
out. Never resolve it as a text conflict. Three separate failures today came from
hand-resolving that file, including the false green.

### 5. The false-green floor

A gate run that reports GREEN over fewer than the previous release's audit count
is refused as a broken harness, not accepted as a pass. v532 reported
"PURE: GREEN" having run **zero** audits.

### 6. Who does what

Codex builds and fixes. The operator assembles, gates, ships, and verifies live.
**Integration failures go back to Codex as their own lane** rather than being
hand-patched: that worked for v529 after hand-assembly failed, and hand-patching
is where three of today's breaks came from.

## What this is NOT

- Not a rule that lanes wait for a scheduled window. Cron jobs do not fire while
  the session is busy; a 12-minute cron set today never fired once.
- Not "ship everything instantly", which was a reaction to being caught sitting on
  work, not a considered policy.
- Not a claim that batching is dangerous. Batching *overlapping* lanes is.

## Open questions for the grill

1. Is file-overlap the right partition, or is it too coarse? Two lanes can touch
   `js/app.js` in completely unrelated regions.
2. Should the pre-flight be a script in the repo rather than an operator habit?
   Habits failed repeatedly today.
3. What is the correct action when a train fails pre-flight: drop the offending
   lane and ship the rest, or send the whole train back?
4. Is there a cheaper gate for a low-risk train, or is 142 audits always the bar?
5. What measurement would prove this policy works, rather than feeling better?
