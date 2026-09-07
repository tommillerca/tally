# A fourth pet family needs room to matter

The measured problem is that a pet can turn a nearly unwinnable fight into a near certainty. Adding another family at today's veteran warden strength would deepen that problem. Recommend a **Tactician**, whose identity is helping the player decide what to do next, introduced through a new, freely earned species. Develop that identity now, but hold its combat release until a bounded family budget can be demonstrated. Keep combat progression at 10 for now; offer permanent recognition for steps beyond it.

## What this checkout actually measures

Ran `node tests/fight-sim.mjs --seeds 200` before drafting. It exited 0 and printed:

```text
PET BOARD: 10 no-pet + 84 pet builds x 6 real configs x 200 seeds
43 flagged cells. This finite board cannot certify unbounded lineage or untested mixed talent paths.
```

That is 112,800 board fights, separate from the legacy dummy damage ruler. Each player stat is 55. The board excludes food, gear and tutorial effects, uses identical seeds for comparisons, targets the captain first and chooses the pet special before its basic. A/B mean the first/second choice at every unlocked tier. They are two complete paths, not all mixed paths. Comparisons below keep player talents empty; STACK rows are excluded unless expressly mentioned.

**Correction to the supplied brief:** 40.5% without a pet and 100% with a level 6 imp B are **Pit 4, The Gravekeeper**. Actual **Gauntlet 10, The Glutton**, is 0% without a pet and 3% with that imp. The 43 flags reproduce, but the encounter label and universal saturation claim do not. The following uses the observed board rather than carrying those errors forward.

At level 10, without shiny or lineage, these are the ranges across each family's species and A/B paths. Parentheses show the contribution over the same player without a pet, in percentage points (pp).

| Encounter | No pet | Hound | Warden | Imp |
| --- | ---: | ---: | ---: | ---: |
| Pit 4, Gravekeeper | 40.5% | 100% (+59.5) | 100% (+59.5) | 100% (+59.5) |
| Pit 8, Ribcage Ricky | 1% | 63-96.5% (+62 to +95.5) | 94-98.5% (+93 to +97.5) | 86-96.5% (+85 to +95.5) |
| Champion, Marrow King | 0.5% | 40-81.5% (+39.5 to +81) | 77-89.5% (+76.5 to +89) | 90-92.5% (+89.5 to +92) |
| Gauntlet 1, Hollow King | 0.5% | 27-74% (+26.5 to +73.5) | 71.5-83% (+71 to +82.5) | 83.5-93.5% (+83 to +93) |
| Gauntlet 10, Glutton | 0% | 8.5-45% (+8.5 to +45) | 27.5-58.5% (+27.5 to +58.5) | 59.5-67.5% (+59.5 to +67.5) |
| Gauntlet 13, Wanderer | 0.5% | 23-77% (+22.5 to +76.5) | 43.5-66% (+43 to +65.5) | 76.5-84.5% (+76 to +84) |

There is no honest single winner independent of investment and encounter. Ordinary level 10 imp leads on Champion and all three measured Gauntlet rungs. Against Glutton, its best measured path leads the best warden by 9 pp and the best hound by 22.5 pp. Species and their Signatures matter: the uncommon C5 warden reaches 98.5% on Pit 8, above legendary C2's best 97%. Rarity labels do not rank combat outcomes reliably.

**Warden is the strongest veteran concern.** At equal level 10, shiny and lineage 20, the best measured A/B path in each family gives:

| Encounter | Hound best | Warden best | Imp best | Warden's lead over imp / hound |
| --- | ---: | ---: | ---: | ---: |
| Glutton | C3 B: 63.5% | C2 B or C5 A: 95.5% | C1 A: 71% | 24.5 / 32 pp |
| Wanderer | C4 A: 87% | C5 A: 100% | C1 B: 89.5% | 10.5 / 13 pp |

C5 A in that veteran configuration wins 100%, 100%, 100%, 99.5%, 95.5%, 100% across the six encounters in table order. Warden accounts for 35 of the 43 flagged cells; imp accounts for five and hound three. Counts include STACK rows and unequal numbers of species, so they are screening evidence, not a fair family league table. Warden is plainly out of line with preserving uncertainty in veteran fights. Imp also needs attention; making hounds equally dominant would spread the defect.

Saturation starts early, but is not universal. On Pit 4, level 1 pets with no picks already win 77-87.5%, adding 36.5-47 pp. Level 6 A/B paths reach 97.5-100%; all level 10 A/B paths reach 100%. On Pit 8, level 6 ranges are hound 20-25%, warden 39-66.5%, imp 50.5-75.5%; by level 10 their best paths reach 96.5-98.5%. The hard Gauntlet rungs retain headroom for ordinary pets, then largely lose it for veteran wardens. The board samples levels 1, 6 and 10, so it cannot locate an exact saturation level between them or beyond the six encounters.

These are observations, not population estimates or proof of guaranteed wins. At 200 seeds, 200 wins has a 95% Wilson interval of 98.1-100%; C5 A's veteran Glutton result is 95.5% [91.7,97.6], contributing +95.5 pp with conservative difference interval [88.5,97.8]. Small differences should not determine design. Winning-turn medians describe winning subsets only; they do not establish paired speed improvements.

## Two distinct identities

Both candidates need a complete family contract, not just a new label. Both retain one pet action on its own turn and a self-Guard option. Proposed values and mechanics below are starting designs, not simulated outcomes.

### Tactician: choose with better information

The pet helps the player read the opponent. It does not add damage, shields, hype or enemy action denial. Information can still improve wins, and its body can still absorb attacks, so both count toward the budget.

- **Passive:** show the category of one selected opponent's committed next action: attack, support or control.
- **Basic, Read:** spend the pet turn revealing that action's intended target.
- **Special, Forecast:** reveal its exact move instead, initially on a three-round cooldown. It replaces Read for that pet turn. Do not reveal random hit results or reroll anything.
- **Talent tree:** one of two choices at levels 2/4/6/8/10, within a fixed information allowance. Explore target versus resource-cost detail; one opponent's exact move versus both opponents' categories; a reveal now versus reserving it for a later round; offensive versus defensive detail; and a fixed forecast preference versus one in-fight preference switch. These are alternative uses of the same allowance, not five extra reveals. Prototype comprehension and actual decision changes before freezing the node text.
- **Species Signature at 10:** once per fight, redirect an already available forecast to the other opponent without gaining a second forecast. Against a lone opponent, let it switch the detail being read instead. It changes flexibility, not the number of actions or reveals.

This is a new decision loop: the player can save stamina, guard, or change target because they know something useful. It must remain helpful without making Forecast compulsory on every cooldown. If playtesting shows that it only decorates an obvious choice, it has failed its identity even if its win rate is acceptable.

**Engine cost: high.** Today's special effect dispatcher handles hits, shields and debuffs; basics branch into warden healing or damage. A Tactician needs explicit information effects and a basic resolver, plus a passive consumer. The opponent AI must prepare a deterministic intent before the player can see it, then execute or transparently invalidate it when conditions change. A guessed intent presented as certainty would be a broken feature. Fight state, target selection, UI and the simulated player policy all need that contract. The current special-first policy alone cannot validate the value of information. This cannot ship as a `PET_ASSIGN` edit.

### Quartermaster: move stamina through time

The pet carries a small reserve so the player chooses when to spend resources. This differs from warden's existing stamina gifts only if it **moves existing stamina rather than generating it**, and never grants a free player action.

- **Passive:** allow a reserve, initially capped at 10 stamina, separate from the player's available stamina. Start empty.
- **Basic, Stow:** spend the pet turn transferring up to five current player stamina into the reserve.
- **Special, Unpack:** transfer up to five back, bounded by available reserve and the player's maximum, initially on a two-round cooldown. Transfer only what fits; keep the remainder in reserve.
- **Talent tree:** one choice per level 2/4/6/8/10. Explore smaller precise versus larger fixed transfers; manual release versus a chosen low-stamina trigger; early versus delayed delivery; low-balance versus high-balance storage conditions; and fixed versus once-changeable release instructions. Preserve a common reserve ceiling and transfer allowance. Any automatic delivery must consume the same pet action it replaces.
- **Species Signature at 10:** once per fight, reverse a queued transfer before execution. It changes a decision without duplicating stamina, restoring spent resources or refunding a used turn.

**Engine cost: medium to high.** It needs explicit reserve and transfer intents, fight-local state, a basic resolver, a passive consumer and a clear two-balance UI. Validate conservation through capped transfers, interruptions, fainting and fight end. The AI policy must learn when to store and release; always using the special is not a useful proof. The reserve disappears only as temporary fight state, like current combat stamina, never as an earned collection resource.

The risk is substantial: free player regeneration while stamina is stored can increase total usable stamina, and warden already offers resource recovery. If measured gains come mainly from exploiting regeneration, the identity has become another sustain engine. A stricter combined player-plus-reserve ceiling is a possible prototype constraint, not an assumed harmless fix. Reject this candidate if that constraint leaves no meaningful timing choice.

**Recommendation:** prototype Tactician first. Its engineering cost is higher, but its central promise is more distinct from all three existing families. Keep Quartermaster as a fallback only if timing remains interesting under a conserved budget. Do not build a fifth family alongside either.

## Proposed power budget and release decision

Target **+15 percentage points at combat level 10**, with a design range of **+10 to +20 pp**, against reference fights where the same player without a pet wins 40-60%. That turns a close fight into roughly a 55-75% prospect while preserving room for player choices, builds and future opponents. It is a proposed design target for Tom, not an existing approved band and not a claim that the prototype meets it.

Use these additional limits when evaluating the prototype:

- Start near +5 pp at level 1 and +10 pp at level 6 on those reference fights. Signature and talent contributions are included in the level 10 total.
- On stronger encounters where the no-pet player wins at most 10%, propose a maximum +25 pp contribution. The pet should not independently turn a distant challenge into a routine clear.
- Include the pet body, passive, basic, special, talents, Signature and stack interactions. Use the same player talents in each no-pet comparison. No damage-only budget can cover a second body's survival benefit.
- Check every mixed path, plain and shiny pets, lineage 0 and 20, player stacks, food including cooldown bypass, and an appropriate decision policy. Retain the six real encounters and add reference fights if a future tuning pass moves the originals out of the 40-60% window. Report per-cell intervals; if uncertainty crosses a proposed ceiling, gather more evidence instead of rounding it into a pass.

**This budget is incompatible with simply reusing today's pet package.** Pit 4 already exceeds the proposed entire level 10 contribution at level 1 without picks. The proposed deviation from an immediate fourth-family release is to prototype first and make combat release conditional on tuning the body and encounter curve. Otherwise a responsibly weaker fourth family will feel unrewarding beside existing pets, while matching warden will worsen saturation.

Lineage makes a universal ceiling impossible under the current contract: it adds 5% per tier forever. Shiny adds 8%; morphs add nothing. At lineage 20, shiny multiplies the intrinsic rarity budget by 2.16. For C2, that is 1.36 × 1.08 × 2 = 2.9376 before stat tilts and rounding. This boosts intrinsic body stats, not every special's owner/level-based effect. Twenty is a veteran scenario, not a maximum or telemetry percentile. No finite seed board certifies all future lineage.

Do not silently cap existing lineage or take away earned levels, pets, Signatures or steps. A possible separate decision is an optional challenge ruleset with disclosed bounded combat contributions, leaving existing collection records and current-mode benefits intact. That needs Tom's approval and its own design; it is not permission to nerf old pets here. If preserving every current benefit in every mode is absolute, accept that a global bounded-power promise cannot be made. Hold the combat expansion rather than conceal that conflict.

## Fix the collection's lack of variety without taking a pet away

The mapping is four hounds (C3, C4, CX, C6), two wardens (C2, C5) and one imp (C1). A player with six of seven species **can** have seen only two families if the missing species is C1; this is not true of every six-species collection. New looks have not reliably delivered new ways to play.

| Route | What it gives | What it costs the player |
| --- | --- | --- |
| New species, recommended | Preserves every existing pet's identity and invested build; adds a clear fourth idea | Wait for Cam's art and animation work; earn and level another instance; collection completion moves farther away |
| Reassign an existing hound, such as C3 | Reuses art and reduces the 4/2/1 skew to 3/2/1/1 sooner | Every owner of that species gets a different kit; existing picks and its Signature need migration; someone loses a combat identity they chose |

Use a permanent, freely earned introduction to the new species, with no purchase, paid shortcut, streak requirement or expiring claim. Awarding this family cannot depend on owning a shop pet. Cam's work includes recognizable species art and the combat/render variants required by the checkout; lead time must be agreed with Cam rather than invented here. A future species also needs catalogue, stats, hatch/acquisition, action, tree, Signature and rendering coverage, not only artwork.

Reassignment is technically quicker but incompatible with preserving every owner's old combat choice under today's fixed-species family contract. An opt-in family per instance would change that shared contract. It is not a migration shortcut authorized by this plan. Even preserving iid, banked steps, shiny, lineage, nickname and wardrobe would not preserve the old play style. Do not reassign C6 to make the 50,000-coin Bumbleseal the gate to a unique mechanic: its stated role is prestige, not power. Keep CX's earned identity intact too.

## What level 11 and beyond can buy

Reaching 10 takes **82,000 cumulative steps credited to that instance**, not the sum of the threshold array. `creditSteps` continues adding beyond the cap without clamping the bank. That effort already exists and must be recognized without resetting, spending or moving it to another pet.

Offer mastery recognition beyond 10: permanent titles, collection journal milestones, noncombat poses or cosmetic presentation choices. Retroactively recognize existing excess banked steps. No missed-day penalty, decay, health score or comparison that shames a player. These rewards require content work and may not satisfy someone asking specifically for deeper combat talents; say that plainly.

There is **nothing safe in another automatic combat stat tier before retuning**. Even more options at equal nominal strength can raise win rates through better matchup selection. Deeper combat choices should first replace additive choices within the existing budget, with free reselection outside fights and no loss of earned unlocks, then be measured.

Simply appending thresholds is unsafe for a second reason: `buildBattlePet` currently activates the Signature at `level >= PET_MAX_LEVEL`. Raising the maximum would move the unlock above 10 and remove it from existing level 10 pets. A future mastery system must preserve the Signature threshold at 10 and separate displayed mastery from effective combat level. Intrinsic stats, passive magnitude, basics and specials currently consume level, so all those paths need that separation. No such change is made here.

## What I would not do

- Match veteran warden as the fourth family's target, buff hounds to its ceiling, or add endlessly stacking talents. All would erase more of the measured difficulty curve.
- Sell access to a family or make paid progression its best route. Keep morphs stat-free and explicitly account for the existing shiny and lineage boosts.
- Make raw steps, sleep or protein increase combat strength without a bound, or weaken a pet after a difficult day. That rewards quantity over an inclusive routine and conflicts with keeping earned progress. Real-world inputs can inform optional journal flavor without combat penalties or health judgments.
- Claim 43 flags are 43 test failures or that exit 0 certifies balance. This command is an advisory measuring instrument. Its outlier rule is a lower 95% win bound above 90% against a stronger foe, not an approved release threshold.
- Fix unrelated defects inside this design lane. The board reports Pack Tactics changing a legacy cooldown field while dispatch still uses two rounds, and C6 lacking a species Signature. Future owners should reconcile Pack Tactics' advertised behavior with authoritative special availability and provide or explicitly resolve C6's missing capstone, then rerun the board. Restoring either promised benefit can itself increase power.

All source references above resolve within this checkout: `tests/fight-sim.mjs`, `js/pets.js`, `js/pit.js` and `js/loot.js`. This document proposes future decisions only. It changes no combat behavior, collection state or shared helper contract.
