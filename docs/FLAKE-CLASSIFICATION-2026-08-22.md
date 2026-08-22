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

### 1. Implementation-coupled / STALE. `boneyard` ARRIVAL and ARRIVAL-SLOW

Not a flake and not a product bug. **The guard's own stated precondition is no
longer true, and the guard says so itself.** From `tests/boneyard-audit.mjs`,
written 2026-08-13:

> "Not attempting a per-fraction rule, because on this app the total POI count is
> bounded (~11-15 in Vancouver) and majority is the right shape. **If POI density
> ever varies wildly, revisit.**"

The counted set is now **54 to 55**, not 11 to 15. `VIS` counts `.map-spawn`
alongside dens, minis, spires and gluttons, and spawn density was subsequently
raised (`boneyard-density` demands a floor of 10 visible spawn markers per
screen). So the set the majority rule grades is now dominated by spawns and is
roughly 4x what it was when the rule was written.

Meanwhile `js/map.js` documents the current behaviour as deliberate, measured
2026-08-08: placement lands in two waves about 2.6s apart (local snap, then
network-backed), and holding the reveal for both "leaves the map blank for 6.6s
after a pan, which is its own bug". The ~10 markers in the first wave are the
local snap. The app is doing what it was designed to do.

So the guard demands "arrives whole" while production deliberately arrives in two
beats, because waiting for both was itself judged the worse bug.

**Fix:** revisit the majority rule exactly as its own comment instructs. Tom's
original complaint (2026-08-08, "it looks cheap when everything staggers in") is
about staggering, and the LATENCY and SHAPE rows already cover that: both pass,
with every straggler fading in within 42ms against a 250ms budget. MAJORITY is
the row that assumed a bounded POI count. This is a decision for Tom, not a
mechanical fix.

**This is the exact failure mode `guard-provenance-lint` was built for**, and it
is worth being honest about the limits: the guard DID carry its revisit condition,
dated and in prose, and it still went unnoticed for nine days. A citation does not
catch staleness automatically. It makes staleness diagnosable in one read once you
are already looking, which is what happened here.

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

### 5. Not reproduced. `boneyard-icon`, `day-strip`, `readiness`

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
