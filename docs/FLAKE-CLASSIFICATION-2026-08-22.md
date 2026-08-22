# The six "flaky guards", classified

Written 2026-08-22, against `origin/main` at `f18d479f` (v424).

## The headline

**Two of the six are not flaky. They fail every single time.**

They were filed as flakes because the NUMBER in the failure message moves between
runs. The number moving is not the same as the verdict moving. `boneyard-density`
printed 9.50 on one run and 9.25 on the next, which reads like noise, but it has
never once passed: the floor is 10 and both values are under it. `boneyard`
ARRIVAL printed 10/54, then 10/55, then 10/54.

Filing those two as "flaky" hid two real reds inside a bucket nobody triages,
for roughly nine days. That is the actual cost of the missing classification,
and it is larger than any individual fix below.

**The discriminator is the stability of the VERDICT, not the stability of the
VALUE.** A guard that reports a different measurement each run and fails each
run is a deterministic red with a noisy readout. That is a completely different
animal from a guard that sometimes passes.

## Method

Each audit was run against a clean worktree at `origin/main`, `HEADLESS_MODE=shell`:

1. All six at once, in parallel (six browsers competing for the machine).
2. The three that failed, again, alone and sequentially.
3. The three that passed, three more times each, alone.

Step 2 is the discriminator that separates contention-sensitive from genuinely
red: if a suite goes green the moment it stops sharing the machine, its problem
is the machine, not the code.

## Evidence

| Audit | Parallel | Alone | Repeats | Verdict |
|---|---|---|---|---|
| `boneyard` ARRIVAL + ARRIVAL-SLOW | FAIL 10/55 | FAIL 10/54 | FAIL 10/54 | never passed |
| `boneyard-density` VISIBLE | FAIL 9.50 | FAIL 9.25 | - | never passed |
| `boneyard` PAN | pass | FAIL `[14,-2,2]` | - | flips |
| `spawn-quiet` (4 rows) | FAIL | pass | - | flips |
| `boneyard-icon` | pass | pass | 3/3 pass | not reproduced |
| `day-strip` | pass | pass | 3/3 pass | not reproduced |
| `readiness` | pass | pass | 3/3 pass | not reproduced |

## Classification and the fix each one needs

### 1. Mis-timed sample, now FIXED. `boneyard` ARRIVAL and ARRIVAL-SLOW

**First diagnosis in this document was wrong and is corrected here.** It read as a
stale guard whose precondition (POI count bounded at 11-15) had been overtaken by
rising spawn density, against a two-wave reveal that `js/map.js` documents as
deliberate. The rising count is real, but it is not the defect.

The decisive measurement, on clean main at `f18d479f`:

    dom@reveal 65    vis@reveal 9    vis@reveal+400ms 65    dom@reveal+400ms 65

At reveal, 65 markers are placed and 9 read as visible. 400ms later all 65 are
visible and the DOM has not grown. **Nothing was withheld and nothing arrived
late. The map arrives whole.**

`revealCount` is sampled on the polling tick that first sees `.markers-in`, which
is BEFORE the 220ms opacity transition has run, so computed opacity reads near
zero for everything still fading. The row was grading the first frame of an
animation and calling it the reveal.

So its historical passes were luck, not verification. With 11-15 markers the
handful that were already opaque cleared a majority of 15. At 65 the same
mis-timed sample cannot clear the bar however correct the build is. The count
rising is what EXPOSED the flaw; it was never the cause.

**Fixed** in `tests/boneyard-audit.mjs`. MAJORITY is retired and replaced by two
rows sampled after the fade settles, each proved red on its own defect and green
on the other's:

| Row | Mutation | Result |
|---|---|---|
| the reveal SHOWED every marker it already had | drop `.map-spawn` from the `.markers-in` rule | FAIL 10 visible vs 66 placed |
| placement was essentially finished before the reveal fired | `tryReveal` drops `placedOnce && worldPassDone` | FAIL 9/68 placed at reveal |

Both are environment-independent, the standard that retired the `+60ms` row in
the same file. `finalCount` was network-dependent by construction. Suite is now
24/24 green on an idle machine.

**The lesson worth keeping:** a guard can be wrong about WHEN it looks, not just
where. Prove-red at authoring time would not have caught this, because the row
did go red on the bug it was written for. What exposed it was the measurement
moving far enough from the threshold to make the reading obviously impossible.

### 2. Threshold-marginal. `boneyard-density` VISIBLE

`9.50` and `9.25` against a hard floor of `10`, with the note "the parent branch
drew 4.00". Consistently under, by a small margin, on a stochastic mean.

**Fix:** this needs a decision, not a nudge. Either spawn density genuinely
regressed below its intended floor (a real bug), or the floor of 10 was set
optimistically against a mean that never reliably clears it. Do not "fix" this by
lowering the floor to 9 without establishing which. Measure the shipped density
first.

### 3. Timing-sensitive. `boneyard` PAN

`3 beat(s), [14,-2,2] markers each`. A **negative** beat count means markers were
removed between samples, so the audit is sampling a value mid-flight rather than
reading a settled one. Failed alone, passed under contention, which is the
opposite of the contention signature.

**Fix:** this is the documented `SERIAL` shape ("a suite that samples a value AT A
MOMENT rather than reading a settled one"), but SERIAL will not help since it
fails when it is already alone. It needs to settle before counting, or to tolerate
removal as a legitimate beat.

### 4. Contention-sensitive. `spawn-quiet`

Green alone, four rows red in parallel. The four reds are ONE cause, not four:
`DROVE ... bones:yes coins:yes herbs:yes crate:NO rare:yes in 13 attempts`. The
audit walks a real map until it has collected one of each spawn type; under
contention it exhausts its attempts before a crate appears, and CEREMONY, CONTROL
and GRANT then all report "never driven".

Worth noting the DROVE row is a positive control ("an empty sample is a FAILURE")
and it did its job perfectly: it reported the incomplete sample rather than
letting three downstream rows pass on nothing. The guard is honest. The sampling
strategy is what is fragile.

**Fix:** add to `SERIAL`, which is the cheap correct answer. Pinning the spawn
seed would be better and is more work.

### 5a. Environment-sensitive, and honest about it. `boneyard-icon`

Reclassified after the gate run. It returned rc=0 three times standalone, then
**exit 97 (UNPROVEN)** both under the gate and standalone later the same day, on
pristine main and on the branch alike: "did not fully run on this machine ... run
this suite where the missing property exists".

That is not a flake and not a failure. The suite detects that it cannot grade its
surface on this machine and refuses to report a pass it cannot back. Every guard
here should behave that way. The earlier "8% egg roll" note was a different
failure and may still exist underneath, but it is not what is happening now.

**Fix:** none. It needs a machine that can host the surface. Do not "fix" the 97
by relaxing it into a pass.

### 5b. Not reproduced. `day-strip`, `readiness`

4/4 green each. Two have known conditional triggers that simply did not fire:
`boneyard-icon` depends on an 8% egg roll, `day-strip` failed at a midnight date
rollover. `readiness` has no recorded trigger at all.

**Fix:** none yet, and specifically **do not go looking**. Their triggers are a
low-probability roll and a wall-clock boundary. The honest action is to record the
trigger next to each so the next failure is diagnosed in one minute instead of
being re-derived. `readiness` needs its trigger captured the next time it goes red.

## What to change about how this is tracked

Stop recording "N flaky guards". Record the cause, because the causes take
different fixes and two of them were not flakes at all:

| Category | Meaning | Fix shape |
|---|---|---|
| Deterministic red | Same verdict every run, value may wobble | It is a bug or a stale guard. Triage it. |
| Implementation-coupled | Expectation derived from, or superseded by, the thing under test | Re-read the guard's own citation |
| Timing-sensitive | Samples a value mid-flight | Settle before reading |
| Contention-sensitive | Green alone, red sharing the machine | `SERIAL`, or remove the shared resource |
| Roll-dependent | Depends on a random draw | Pin the seed, or record the trigger |
| Clock-dependent | Depends on wall-clock date or time | Inject the date |

A suite whose failure message contains a number should have that number read
across at least two runs before it is called flaky. Two runs would have caught
both of the misfiled reds above in about four minutes.
