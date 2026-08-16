# The garden's appetite, measured

Branch `ext/garden-appetite`. Instrument: `tests/garden-sim.mjs`. Guard:
`tests/garden-appetite-guard.mjs`.

Re-run everything here with:

```
node tests/garden-sim.mjs
node tests/garden-appetite-guard.mjs
```

Every number below is simulated, 30 days x 60 seeded runs per row, driven off the
real `RECIPES` / `POTIONS` tables in `js/cooking.js` and the real constants in
`js/garden.js` and `js/energy.js`. Nothing here is arithmetic in prose.

## Headline

The brief's diagnosis is right and its prescription is wrong.

The oversupply is real: the median player (1 app open a day, 3 beds, 1 pot) grows
**7.1 ingredients a day net of composting** and the kitchen eats **1.5 to 2.4**,
banking **199 to 227 spare ingredients by day 30**. At 5 beds it is 10.7 grown
against the same 2.4 spent.

But none of the four proposed levers closes that gap, and two of them make the
median player measurably worse off. **Ingredient spend is capped by how many
cooks a visit can START, which is pots x opens. It is not capped by what a recipe
costs.** At 1 open a day with 1 pot, the player gets one cook start per day, and
one cook start per day is roughly three ingredients per day no matter what the
cookbook says.

That is why the demand ceiling and the actual spend are so far apart: if pots and
cadence were free, the fight rate alone could absorb **18.0 ingredients a day**
(stacking every dish, 3 free fights). Measured spend at the median cadence is
**2.4**. The recipes are not the constraint. The visit is.

## Step 1: the board, as shipped

Median policy, one buff running at a time:

| opens/day | beds | pots | produced/day | walk in | spent/day | surplus/day | buffed fights | stock d30 |
|---|---|---|---|---|---|---|---|---|
| 1 | 3 | 1 | 7.0 | 2.0 | 1.5 | 7.6 | 46% | 227 |
| 1 | 3 | 3 | 7.0 | 2.0 | 1.5 | 7.5 | 46% | 226 |
| 1 | 5 | 1 | 10.7 | 2.0 | 1.5 | 11.2 | 46% | 337 |
| 1 | 5 | 3 | 10.7 | 2.0 | 1.5 | 11.2 | 46% | 337 |
| 2 | 3 | 1 | 13.5 | 4.0 | 3.0 | 14.6 | 94% | 438 |
| 2 | 5 | 1 | 14.6 | 4.0 | 2.9 | 15.6 | 94% | 468 |
| 4 | 3 | 1 | 18.8 | 8.0 | 3.1 | 23.7 | 97% | 711 |
| 4 | 5 | 3 | 18.7 | 8.0 | 3.1 | 23.6 | 97% | 709 |

Maximising policy (stack every dish at once, which the game permits since
`foodCombatBuff` sums across active buffs) lifts spend to 2.4 at 1 open and 10.2
at 4 opens. It never approaches the 18.0 ceiling at any cadence.

Three things fall out of this table that prose could not have found:

1. **The fifth bed is worth more than the third pot, and both are nearly noise.**
   Going 3 to 5 beds at 1 open a day adds 3.7 produced a day and changes spend by
   0.0. Going 1 to 3 pots changes spend by 0.5 at best. The player is buying
   throughput on a road that is already blocked further down.
2. **Cadence is the whole game.** 1 open to 4 opens multiplies produced by 2.6x
   and spend by 4.0x. Every other variable on the board is a rounding error next
   to it.
3. **`--walk 0` produces literally zero, at every cadence and every bed count.**
   The garden cannot bootstrap itself: composting only ever returns seeds of the
   thing you composted, so with no map income there is nothing to compost and
   nothing to plant, forever. That is the design working as `js/garden.js`
   intends ("walking stays the best seed source, which is the point"), and it is
   worth stating because it means the garden is a multiplier on walking, never a
   source. Any appetite that assumes garden-only supply is assuming zero.

## Step 2: the four levers, measured

Median player (1 open/day, 3 beds, 1 pot), maximising policy. `as shipped` is
64% buffed fights, 2.4 spent.

| lever | spent/day | change | buffed fights | verdict |
|---|---|---|---|---|
| as shipped | 2.4 | - | 64% | - |
| 1. raise ingredient counts (x2) | 3.0 | +0.6 | **40%** | reject |
| 2. dish consumed per fight | 2.4 | +0.0 | **26%** | reject |
| 3. banquet tier (6 to 8 ingredients) | 2.4 | +0.0 | 64% | free, but not the fix |
| 4. potions as the sink | 2.6 | +0.2 | 59% | small |
| 1 + 2 together | 3.0 | +0.6 | **16%** | reject |
| 5. cook queue x3 (not on the list) | 2.9 | +0.5 | 59% | best single lever |

Same levers at a heavy cadence (4 opens/day, 5 beds, 3 pots), where `as shipped`
is 97% buffed and 10.2 spent:

| lever | spent/day | change | buffed fights |
|---|---|---|---|
| 1. needs x2 | 13.0 | +2.8 | 91% |
| 2. dish = 1 fight | 13.0 | +2.8 | 74% |
| 3. banquet tier | 12.2 | +2.0 | 96% |
| 4. potions on | 15.1 | +4.9 | 88% |
| 3 + 4 together | 15.2 | +5.0 | 88% |

### Reading it

**Lever 1 (raise ingredient counts) buys 0.6 ingredients a day of spend and costs
the median player 24 points of buffed-fight rate.** It does not create appetite,
it creates a price the median player cannot pay. The ingredients still pile up;
the player just stops having a dish behind their fights. This is the cheapest
lever to build and the most expensive to live with.

**Lever 2 (dish consumed per fight) is the worst of the six.** It raises spend by
exactly zero at the median cadence, because the player could not cook more than
one dish a day either way, and it drops buffed fights from 64% to 26%. The
"multiplies demand ~3x on its own" claim is true only about demand. Demand that
cannot be met is not appetite, it is a shortfall.

**Lever 3 (banquet tier) is genuinely free and genuinely not the fix.** At the
median cadence it changes nothing at all, in either direction: the player never
reaches it. At heavy cadence it adds 2.0 spend a day and costs one point of
buffed fights. It is good content for the engaged player and it is not an answer
to the oversupply question.

**Lever 4 (potions) is the strongest of the four at high cadence** (+4.9 a day)
and nearly nothing at the median (+0.2). Its cost is pot time: potions compete
with dishes for the same cauldrons, which is why buffed fights drop 97% to 88%.
Potions as "the real sink" works only if brewing stops competing with cooking.

### The lever nobody listed

One variable at a time, off the shipped baseline, at the median cadence:

| variant | spent/day | buffed fights | stock d30 |
|---|---|---|---|
| shipped baseline | 2.4 | 64% | 199 |
| + compost what you need | 2.5 | 67% | 196 |
| + 3 pots (buyable today) | 2.9 | 59% | 186 |
| + cook queue x3 | 2.9 | 59% | 186 |
| **+ queue x3 and smart compost** | **3.9** | **67%** | **155** |
| + 9 fights/day (a walker's energy) | 2.4 | **21%** | 199 |
| + 9 fights and 3 pots | 2.9 | 20% | 186 |
| + everything, plus levers 3 and 4 | 5.8 | 16% | 97 |

Two results here matter more than the whole lever table.

**Raising the fight rate from 3 to 9 a day does not raise spend by one
ingredient.** It only drops buffed fights from 64% to 21%. A player who walks
enough to earn six Vigor gets three times the fights and exactly the same amount
of cooking, so they spend the extra fights unbuffed. Whatever the appetite work
turns out to be, it has to survive that: today the player who engages hardest
with the app is the one most often fighting on an empty stomach.

**Cook queue plus smarter composting is the only variant on the entire board that
raises spend and improves the player's experience at the same time** (2.4 to 3.9,
64% to 67%). Every other way of raising spend pays for it in buffed fights.

### The surplus is also the wrong shape

Composting returns seeds of the species you composted, so the obvious play
(compost your spare) compounds a monoculture. By day 30 at the median cadence the
199 banked ingredients are **167 of a single common**, with the thinnest common
sitting at **0.7**. Recipes need two or three distinct commons, so a full larder
still blocks a pot 0.14 times a day at 1 open and 0.8 times a day at 4 opens.

Composting the thing you are shortest of instead fixes the shape completely
(fattest 167 to 45, thinnest 0.7 to 15.3) and raises spend by only 0.1 a day at
the median. So the monoculture is a real trap, and it is not what is capping
spend. Worth fixing as a usability problem (the compost sheet could sort by what
the cookbook is shortest of), not as an economy lever.

## Recommendation

**Do not ship levers 1 or 2.** Measured, they buy 0 to 0.6 ingredients a day of
spend at the median cadence and cost 24 to 38 points of buffed-fight rate. They
convert an oversupply problem into a shortfall problem and leave the ingredients
piling up either way.

**The appetite the brief is asking for cannot be built in the recipe table.** The
ceiling is cook starts per day, which is pots x opens, and no edit to `needs` or
`fights` moves it. The change that actually moves it is letting one visit line up
more than one cook: measured, a queue depth of 3 takes the median player from 2.4
to 2.9 spent, and to 3.9 alongside a compost sheet that suggests what you are
short of, while raising buffed fights from 64% to 67%.

**Ranked, cheapest first:**

1. **Cook queue.** The mechanism lives in `js/cooking.js` (`readSlots`,
   `startCook`, `cookState`), so the model side is small. It needs a queue
   affordance in the Kitchen, which is `js/app.js` and not this lane. This is the
   only change measured to raise spend without costing the player buffs.
2. **Compost sheet ordered by what the cookbook is shortest of.** Pure usability,
   fixes the monoculture, +0.1 spend at the median and +1.5 at heavy cadence.
   Also `js/app.js`.
3. **Lever 3, the banquet tier.** Free at the median, +2.0 a day for the engaged
   player, no measured cost anywhere. Ship it as content once the queue exists,
   because until then the median player never reaches it.
4. **Lever 4, potions.** The biggest single sink at high cadence (+4.9 a day),
   but it costs 9 points of buffed fights because brewing competes with cooking
   for the same pots. Worth doing only after cook throughput goes up.

Nothing in `js/cooking.js` or `js/garden.js` was changed on this branch. Shipping
a recipe edit that measurement says does nothing (lever 3) or actively harms the
median player (levers 1, 2) would have been content dressed as balance.

## Step 3: the watering defect

**The bug as described does not exist, and I can show it.**

The brief states that at 0.76 opens a day the player "plants, leaves, returns the
next day to a ready crop, and can NEVER claim it". Reading the actual path:

- `plantSeed` writes `watered: false` and returns.
- `gardenState` computes `canWater: !ready && !p.watered`, with no elapsed-time
  term, so a bed is waterable **from the instant it is planted**.
- `waterPlot` rejects only `now >= p.readyAt` and `p.watered`.
- The Kitchen's plant handlers (`data-plantseed` and `data-plant`) both call
  `render()` on completion, so the bed the player just filled comes straight back
  as a tappable `.t3-bed.thirsty` with a droplet and the label "needs water", in
  the same visit.

A once-a-day player plants and waters in two consecutive taps on the same screen.
The +1 is fully reachable at any cadence.

What the sim does confirm is the **size** of the swing, which is larger than the
brief's estimate:

| opens/day | waters | produced/day | vs unwatered |
|---|---|---|---|
| 1 | yes | 7.1 | - |
| 1 | no | 4.2 | **-41%** |
| 2 | yes | 13.6 | - |
| 2 | no | 8.2 | -40% |
| 4 | yes | 18.7 | - |
| 4 | no | 11.7 | -37% |

So a player who does not know about the tap loses about 40% of the garden's
lifetime output, at every cadence. That is a real defect, but it is a
discoverability defect, not a reachability one, and the fix is a UI nudge (water
automatically on plant, or make the droplet louder) in `js/app.js`.

**My call: change nothing in the yield rule.** Two reasons, both from the numbers
above.

1. Folding the +1 into `HARVEST_BASE` would raise the median player's output from
   7.1 to 7.1 for anyone who already taps, and from 4.2 to 7.1 for anyone who
   does not. That is **growing supply** in a report whose entire finding is that
   supply already outruns demand by 3x. It is the wrong direction on this branch.
2. `tests/unit.test.js` already pins the rule exactly (`watering is worth exactly
   +1, and the bumper roll another +1`, plus `a common seed always returns more
   than the ingredient it cost`). A second guard would only be a second thing to
   drift.

The one thing worth protecting is the reachability itself, since a future change
to `canWater` that added an elapsed-time term would create the bug the brief
feared. That is noted here rather than guarded, because `gardenState` needs
IndexedDB and cannot be driven from node. The live-browser suite that already
taps a thirsty bed is `tests/t3-audit.mjs`.

## The guard

`tests/garden-appetite-guard.mjs`, exits non-zero on failure. It pins the
decision above:

- **Static:** no common-fed combat dish may cost more than 1.5 ingredients per
  fight it covers. Shipped worst case is Bone Broth at exactly 1.50.
- **Simulated:** the median player (1 open, 3 beds, 1 pot, maximising policy)
  must keep a dish up for at least 55% of fights. Shipped is 64%.
- **Emptiness:** zero combat dishes, zero fights or zero production is a FAILURE,
  never a pass.

Direction of failure is stated in the file and it is a **floor**, not a trend:
the failure mode being defended against is a recipe table that raises ingredient
spend by starving the player of buffs, which would pass any "spend went up"
check.

### Proven red

In throwaway trees under `/tmp` (rsync'd copies, mutated there, deleted after).
The worktree was never mutated.

| reintroduced bug | guard result | measured |
|---|---|---|
| every recipe's `needs` doubled (lever 1) | exit 1, 6 FAILED | 40% buffed, 2.0 to 3.0 per fight |
| every combat dish `fights: 1` (lever 2) | exit 1, 6 FAILED | 26% buffed, 3.0 per fight |
| no combat dishes at all (empty sample) | exit 1, 1 FAILED | 0 dishes |
| mutation reverted in the same copy | exit 0, all good | 64% buffed |

## What the model assumes, stated plainly

- **Map income is a parameter, not a measurement.** Default `--walk 2`
  ingredients per app open. One spawn collected is one ingredient
  (`spawnIngredient` returns `n: 1`) plus a 30% seed roll, but how many spawns a
  player walks to per session is not in the codebase. Sensitivity: `--walk 6`
  raises median production 7.0 to 8.1 and leaves spend at 1.5. `--walk 0`
  produces zero. The conclusion does not turn on this number.
- **Fights per day defaults to `FREE_FIGHTS` (3).** The 9-fight row models a
  walker at the full step-Vigor cap.
- **The cook queue is modelled as `pots x queue` parallel slots.** Exact at 1 to
  2 opens a day (a 24h gap dwarfs a 15 to 120 minute cook, so sequential and
  parallel finish in the same visit), slightly generous at 4 opens a day. Noted
  in the source. Model a real per-pot FIFO if the 4-open row ever becomes the
  decision.
- **Ectoplasm and the two rare potions are excluded from the demand side**, since
  the garden deliberately cannot grow spores from compost and rare supply is a
  separate question.
- **Not verified:** anything requiring a browser. The sim is a pure model of
  `garden.js` and `cooking.js` logic, not a drive of the real Kitchen UI. The
  watering-reachability finding is read from the source path
  (`plantSeed` to `render` to `canWater` to `waterPlot`) and from the existing
  live audit `tests/t3-audit.mjs`, not from a browser run on this branch.
