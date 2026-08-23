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

> **CORRECTION, 2026-08-23. The mechanism below is WRONG, and the rows it
> describes cannot fail.** A second session, reading Reggie's stranded 2026-08-20
> work on the same file, identified the constant 9 as the MAP LEGEND, not as
> markers inside the fade. Measured inside the real audit (a standalone probe
> cannot reproduce it: without the GL args and the geolocation override the map
> never opens and everything reads zero):
>
> ```
> #mapLegend   exists, hidden
>   inside:    5 .map-spawn + 3 .map-den-mark + 1 .map-mini-mark = 9
>   outside:   57 real markers
>   legend swatch computed opacity = 1
>   audit counts visible = 66
> ```
>
> `mapLegendHtml()` builds the key out of the real marker markup on purpose so
> the key cannot drift from the map, `#mapLegend` sits inside `#mapStage`, and
> `getComputedStyle().opacity` does NOT return 0 for a `display:none` element: it
> returns the specified value, which is 1 once `.markers-in` lands. The audit's
> counters are unscoped `document.querySelectorAll`, so all nine are counted as
> visible markers in every run.
>
> Put at its shortest: **`[hidden]` on `#mapLegend` never hid its swatches from
> an opacity-based counter.** `display:none` hides an element from the page, not
> from `getComputedStyle().opacity`. Any guard that decides "visible" from
> opacity alone inherits this, so it is worth checking the other opacity-based
> counters in tests/ rather than treating it as one file's bug.
>
> Confirmed independently on the scoped fix: 65 total, 9 in the legend, 56
> outside, and 56 carrying `maplibregl-marker`, so the allowlist selects exactly
> what a `#mapLegend` denylist would. A drop of exactly 9.
>
> So `dom@reveal 65` was about 56 real markers plus the key, and `vis@reveal 9`
> was the key alone. It was never evidence about the 220ms fade.
>
> **The consequence is worse than the wrong story.** Both replacement rows go
> GREEN on a Boneyard that draws zero real markers, because the legend still
> supplies 9: `revealDom > 0` is 9, and `revealSettled >= revealDom` is 9 >= 9.
> A guard that cannot fail, shipped in the same PR as the ratchet built to catch
> guards that cannot fail.
>
> The settled re-read is still a real improvement and the withholding row still
> caught its prove-red, but it grades contaminated numbers. The fix is to scope
> the selectors to `maplibregl-marker`, which MapLibre stamps only on nodes it
> owns (`js/map.js:200`), and to add a row asserting the map drew a plausible
> number of markers rather than merely non-zero. That work is owned by the
> session porting Reggie's ARRIVAL changes, not by this document.
>
> **A capability gate is not a per-run gate.** `boneyardCapability` proves a WebGL
> context can be CREATED on this machine. It says nothing about whether placement
> finished on THIS run. Those are different failures and only the first has a
> top-level gate, which is the hole a degraded run walks through: WebGL works, the
> gate passes, the map draws zero markers, and every row downstream grades an
> empty stage. The fix is a per-row `unproven()` when the sample is empty, not a
> harder capability check. Found 2026-08-23 by the session scoping these
> selectors, after a run came back "0 markers at rest" and looked exactly like a
> code defect.
>
> **FIXED on main at `0a569dec`.** The three unscoped counters now filter through
> `closest('.maplibregl-marker')`, a `legendDecoys` counter makes a scoping
> regression show up as a number rather than as two rows quietly passing again,
> and a `MIN_PLAUSIBLE_MARKERS` row goes `unproven()` rather than FAIL when the
> map drew nothing. Verified on the scoped tree: decoys 0/0, and 9/9 with only the
> scoping reverted, the mutation redding exactly one row. The two rows that could
> not fail can fail again.
>
> **Contention makes this suite lie in the direction of a bug**, so no timing row
> here should be graded on a busy machine. Measured on this box: ARRIVAL-SLOW
> straggler latency reads 42ms idle and 342-461ms under load against a 250ms
> budget, and a full run went 24/24 idle versus 11/25 degraded. On 2026-08-23
> three sessions ran boneyard-audit against three local servers at once while two
> release-gate runs were also going, one of them `--all`. Two of us separately
> came close to filing that environment as a defect.
>
> Kept rather than rewritten, because the wrong reasoning is the useful part: I
> read a suspiciously constant number as a timing artefact without checking what
> was being counted, having spent the same day insisting that measurement beats
> inference.


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

### 2. Environment-sensitive, needs a product call. `boneyard-density` VISIBLE

Investigated fully. **The code has not regressed and the guard is not flaky.**

The decisive experiment: checked out `5bf8af14`, the commit whose source records
`VISIBLE_FLOOR = 10;   // measured 13.75 on this branch`, and ran that audit
there today. It measures **9.25**. Same four locations, 4/14/9/10. The code that
recorded 13.75 produces 9.25 on this machine, so the variable is the environment,
not the app.

Everything else was ruled out first, in order:

| Hypothesis | Test | Result |
|---|---|---|
| Spawn supply regressed | `boneyard-supply-audit` (pure) | 13.5 per viewport vs floor 8, passes |
| `js/hunt.js` changed | diff since the audit landed | no changes |
| The four SPOTS are a low draw today | field over 400 Vancouver points | mean 46.0/3x3 cells, p10 45, p90 47; the SPOTS sit at 45,45,46,46 |
| Sample too small (n=4) | false-red rate by n, 20k trials | 0.0% at every n; the field is uniform |
| Counting before placement settles | settle 12s to 24s | 9.00 both times |

Rendered counts are stable per location and vary by **geography**: 49.2827 is
waterfront downtown and draws 3 to 4 every single run, because the walkability
snap pushes spawns off the water and out of the viewport. The pure supply model
predicts 13.5 because it does not know about water. The renderer is right.

**Do not lower the floor to 9.** The audit's own premise is that "the number Tom
judges is the number of markers on the glass", and the glass is a phone. This
container runs software GL against whatever tile data it can reach. Re-calibrating
against it would bake in a number that represents no player, which is the failure
this audit was built to replace (its predecessor modelled a screen 4x the real one
and reported 10.2 where the map drew 4).

**Needs Tom:** a floor measured on a phone-representative machine. Until then the
red is honest. It means "this machine cannot reproduce the calibration", not "the
app broke".

Arguably it should exit 97 UNPROVEN rather than FAIL, the way `boneyard-icon`
does, so it stops reading as a code defect. That is a change to what the guard
claims, so it is listed here rather than made.

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
