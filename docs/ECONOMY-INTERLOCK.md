# The economy interlock: three branches, one balance sheet

Written 2026-08-18 by Reggie. Untracked working note.

Tom's goal, verbatim: *"remove the hollow/garden and fix the kitchen section in
tandem with the boneyard increased drop rate we talked about without ruining the
economy of the game"*.

## The risk nobody is positioned to see

Three branches each change coins per day, and **each was measured alone**:

| Branch | Change | Measured effect | Direction |
|---|---|---|---|
| `econ/stage2-faucet` | crate gear-variant 0.55 to 0.30, cosmetic fallback weighted | heavy 1,948 to 1,493 coins/day | DOWN |
| `econ/boneyard-supply` | more spawns, each worth less; herbs to ingredients | required flat or down | flat/DOWN |
| `econ/hollow-removal` | garden out, refund beds, convert seeds | one-time refund up to 5,500/player | **UP, one-time** |

Every agent measured its own branch against `origin/main`. **None of them
measured the combination**, because none of them can see the other two. Three
changes that are each individually safe can still compound: the faucet cut and
the spawn re-weighting stack multiplicatively on income, while the refund is a
one-time spike landing in the same release window.

**This is the specific way this goal fails.** Not one branch being wrong. Three
right branches summing to something nobody priced.

## The guard

Before any of the three merges, all three go onto ONE integration branch and the
economy sim runs on the combination, not on the pieces. Required outputs, per
light / median / heavy profile:

- coins per day, day 1 through day 30, **including the one-time refund**
- ingredients per day and the spread across the six types
- dishes cookable per day (the number that proves the Kitchen still works)
- net coin balance at day 7 and day 30
- days to reach 50% / 90% of the gear catalogue

**Pass condition:** steady-state coins per day is flat or down against today at
every profile. The refund is allowed to spike day 1; it is not allowed to change
the day-30 slope.

**Fail condition to watch for specifically:** the refund lands, players buy the
things the faucet cut was meant to slow, and the two changes cancel. That reads
as "nothing happened" in a day-30 balance and as a wasted release.

## The other reason this cannot slip

Once a real-money coin pack ships, **Apple guideline 3.1.1 forbids coins from
ever expiring**. No resets, no wipes, permanently. So every economy correction
has to be right BEFORE monetisation, because afterwards the only available lever
is adding sinks, never removing currency. See `docs/IAP-SCOPING.md`.

## Merge order, which is not negotiable

1. `econ/boneyard-supply` (supply first)
2. `econ/hollow-removal` (only after supply, or cooking has no ingredients)
3. `econ/stage2-faucet` (independent, but its numbers assume crates are the only
   gear route, so re-measure once the cosmetic shop exists)

Closing the garden before supply moves kills cooking outright. That is the one
ordering that produces a broken game rather than a mistuned one.

---

# RESULT, measured 2026-08-18 on `econ/integration`

All four branches merged onto one tree off `origin/main` (405b5df), in the
required order, and measured together. **The economy is not ruined. Steady-state
income is DOWN.**

| measured per cell, combined tree | v400 | integrated | direction |
|---|---|---|---|
| coins | 46.54 (ceiling) | **41.46** | DOWN 11% |
| XP | 53.98 (ceiling) | 52.13 | flat |
| ingredients | 2.00 | **2.93** | UP 47% |
| spawns | 2 | 5 | UP 2.5x |
| spawns visible on a phone | 4.00 | **14.25** | UP 3.6x |

Coins per cell fall 11% **despite 2.5x the spawns**, because each pays less and
the crate weight went 1-in-5 to 1-in-14. Ingredients rise 47%, which is what
replaces the garden. The map shows 3.6x the markers on the same spawn rate,
because the fix was the start zoom, not the spawn count.

**The only upward pressure is the one-time bed refund**, up to +5,500 coins to a
five-bed player, and +0 to light and median. That remains Tom's call. It spikes
day 1 and does not change the day-30 slope, which is the pass condition set out
above.

## Audits on the integrated tree, exit codes read from files

boneyard-supply 0 · loot-fallback 0 · garden-closed 39/39 0 · garden-retire 25/25
0 · boneyard-density 0 · kitchen-queue 0 · unit.test 177/177 0.

## Three conflicts, and one was a real integration bug

`js/app.js` conflicted in three places. Two were copy. The third was load-bearing
and **neither branch could have seen it alone**: the garden-removal branch made
the ingredient reveal card UNCONDITIONAL (safe while every collect carried
exactly one ingredient), while the supply branch made a collect carry a VARIABLE
number, sometimes none. Taking the removal form wholesale would have pushed an
ingredient card for an ingredient the player did not receive, on the ~63% of
finds that carry no food. Resolved by keeping both halves: no seed, conditional
card.

That is the entire argument for integrating before merging.

## A correction to a number reported earlier

An ad-hoc coins-per-day model written during this check reported income
DOUBLING. It was wrong and is discarded: it multiplied slots by cells as though a
player collects every spawn in every cell they walk through. The audit's per-cell
measurement is authoritative because it drives the real generator over a
40,000-cell grid and was proven red.

Separately, the supply branch's own viewport row was measuring a screen 4x too
big (256px-tile constant against MapLibre's 512px tiles), which is why that
branch believed it had already fixed the empty map. Corrected; the model now
reads 13.5 against the browser's 13.25.

---

## Provenance, added 2026-08-25

This file was NOT on `main` until today. It existed in exactly one place: a
local-only branch (`ext/art-memory-census`) that was 88 commits behind main and
had never been pushed to any remote. It survives because that branch was
snapshotted to `origin/rescue/ext-art-memory-census` (commit `5ba14756`) before
anything touched it.

That is not a filing quirk, it cost real time. On 2026-08-25 Tom was asked to
decide the post-S0 coin sink, a question this document had already answered
(S1, a coin-priced appearance shop, 2 to 3 days, after S0's 3 to 5). His reply
was "weve already gone back and forth on this and made a plan to address this
did you lose it wtf?" He was right. The plan existed and was unfindable.

The same week, `docs/PLAN-remove-weapons.md` sat on main opening with "Nothing is
built yet" for 17 days after Tom approved its premise, and the Glutton marker fix
sat unshipped on the same stranded branch for five days.

**If you write a plan, merge it.** A decision that lives only in a working tree
is a decision nobody can act on, and one `rm -rf` from gone.
