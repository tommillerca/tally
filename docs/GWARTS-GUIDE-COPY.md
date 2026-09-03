# Gwart's Guide: the copy

**This file is the deliverable. The sheet is the container.** Red-pen the words
here and the UI follows: `js/app.js` builds the Guide from `GUIDE_ENTRIES`, and
every line below is in that array verbatim. Change a line here, change it there.

Tom, 2026-08-22 (item 4 of `docs/FEEDBACK-2026-08-22-v424.md`):

> "ectoplasm needs an explanation the transmute thing as confused almost all of
> my friends and leads to a bigger question, clicking on gwart should take you to
> an explainer FAQ page that can help all confuse players. Gwart is to act as a
> character lke Navi from the legend of zelda, an omniscient helper"

## The voice, and where it came from

Not invented here. It is the register of the lines already shipped in
`gwartPool()` (`js/app.js`), rewritten from resigned to wry on 2026-08-22 on
Tom's note ("the lines feel a little sad or something, let's make them a bit
lighter"). The rules that fall out of reading them:

- **Two or three short sentences.** Never a paragraph.
- **He calls the Bonehead "he", never "your character".** "Nothing statted on
  him. He will fight. He will lose more."
- **He takes credit for his half and hands you yours.** "The garden is ready. I
  watered it. You pick it." / "I do the growing. The carrying is yours."
- **Dry, faintly superior, never mean.** "Bare bones. Fine in a tavern, less so
  in the Pit."
- **No ad-speak.** Nothing is exciting, powerful or amazing. A thing is worth
  doing or it is not, and he says which.
- **No em dashes.** Periods, commas, colons, parentheses.

Two things the Guide adds that the talk box cannot. It is longer than 59
characters (the plaque's hard ceiling, measured in `tests/talkbox-audit.mjs`),
and it is **read on purpose** rather than glanced at. So the sentences stay as
short as his, but there are more of them, and every number in them is real.

## What this is not

Information is rationed on purpose in this game. A guide is not a catalogue.
Nothing below names a drop rate, a recipe list, a boss table or anything a player
is meant to find out there. Nine entries, one confused tester behind each.

Everything below was checked against the implementation before it was written.
Four of the first drafts were wrong and are corrected here; the corrections are
noted where they matter.

---

# 1. Ectoplasm

**PRIORITY.** This and Transmute are the two that confused almost every tester.

> The rare one. Everything else in the pot grows in dirt. This does not.
>
> It comes off rare finds in the Boneyard and off world bosses. Nothing else out
> there drops it, and it cannot be composted for seed.
>
> You never eat it. It is a key. Three things in the pot are locked behind one
> Ectoplasm each: the Necromancer's Feast, the Revenant's Draught and the
> Spectral Fury. They are the best things you can cook, which is the whole reason
> for the lock.
>
> If none is falling, you can make some. That is what the Transmute is for.

| Claim | Where it is true |
|---|---|
| the only rare-tier ingredient | `js/cooking.js:17`, `:21` |
| rare map spawns and world-boss dens only | `js/cooking.js:16`, `js/app.js:19319` |
| cannot be composted | `js/garden.js:95`, returns `{ ok: false, reason: 'rare' }` |
| gates exactly three recipes, one each | `js/cooking.js:105`, `:131`, `:133` |

A weekly quest ("Scavenger", 15 spawns) also pays one Ectoplasm
(`js/quests.js:182`). Left out deliberately: naming a specific quest reward turns
an explainer into a checklist, and the entry is about what the stuff *is*.

# 2. Transmute

**PRIORITY.** Written as steps, because "what am I giving and what am I getting"
is the exact question the testers could not answer.

> A trade, and only a trade. Nothing is rolled and nothing can go wrong.
>
> You hand over six common ingredients. Any six, from any piles: it counts your
> commons together, and it takes them off your biggest stack first and works
> down.
>
> You get one Ectoplasm. Always one, always Ectoplasm.
>
> Those six are spent and the rest of your bag is untouched. No dish is unmade,
> no gear, no seed, nothing you have cooked or planted is at risk. It only ever
> reaches the six.
>
> Then it sits for twenty hours before it will do it again.

| Claim | Where it is true |
|---|---|
| six commons in, one Ectoplasm out | `TRANSMUTE = { commons: 6, yields: RARE_INGREDIENT }`, `js/cooking.js:373` |
| pooled across all six common types | `commonsHave` sums `COMMON_INGREDIENT_IDS`, `js/cooking.js:386` |
| biggest stack first, then down | `transmuteConsume` sorts descending and drains in order, `js/cooking.js:375-381` |
| deterministic, no roll | `doTransmute` calls no rng, `js/cooking.js:389-398` |
| touches nothing but your ingredients | `doTransmute` writes `ingredients` and `transmuteAt`, `js/cooking.js:393-396` |
| twenty hours, not a calendar day | `cooldownMs: 20 * 3600e3`, `js/cooking.js:373` |

`tests/gwart-guide-audit.mjs` reads `TRANSMUTE` out of `js/cooking.js` and
requires this entry to still name those numbers. Re-cost the transmute without
rewriting the words and the audit goes red.

**Two things worth Tom's pen.**

1. **"Nothing is destroyed" is not true here, and the entry does not claim it.**
   The brief asked for that reassurance, and for *transmog* it is exactly right
   (your gear keeps its stats, `js/loot.js:1516`). Transmute genuinely spends the
   six. So the entry says what *is* true, which is the reassurance the testers
   actually needed: the spend is bounded, it is only ever those six, and there is
   no gamble. Writing "nothing is destroyed" over a mechanic that eats six
   ingredients is how you get a second round of confused testers.
2. **The Kitchen label says "once a day". The code says twenty hours.**
   `js/app.js:6557` reads `Transmute · once a day`; `cooldownMs` is 20h. Those
   drift apart for anyone who transmutes in the evening. The Guide says twenty
   hours because that is the truth. The label is the interface agent's call, not
   this branch's.

---

# 3. Crates

> A crate is a box of things he can wear, with the odd drink or ingredient in
> with it. Nothing inside is a decision you can get wrong.
>
> They come off levels, the wheel, quests and the map, and they wait in the
> Backpack. They never go off, so there is nothing to save one for.
>
> Anything in there you already own turns into coins on the way out. You cannot
> open a crate badly.
>
> Open it. It is already yours. I have never understood the hoarding.

Corrected from the first draft, which called a crate clothes only: a roll can
also be a Battle Charm, a Vigor Draught or a cooking ingredient
(`js/loot.js:1401-1416`). Duplicates auto-convert to coins
(`js/loot.js:1435-1439`). Nothing expires: crates are plain `inv` rows with no
TTL anywhere. Contents are automatic, never a pick (`js/app.js:12867`).

# 4. Eggs and pets

> An egg hatches on your feet. Eight thousand steps from the day it turns up, and
> then it opens. Nothing else hurries it along.
>
> What comes out is what comes out. I do not choose it and neither do you.
>
> A pet fights beside him: its own body in the Pit, its own turn, and it makes
> him better just by being out there with him.
>
> Only the pet he has out banks your steps toward its own levels. The others
> wait, and they wait patiently. Pick one and walk.

**The first draft of this was wrong and it was the worst one.** It said eggs
"hatch on their own time". They do not: `EGG_GOAL_STEPS` is 8,000 steps walked
since the egg was granted (`js/loot.js:596`, `:629-646`). A player who does not
know that is a player who thinks their egg is broken. That single number is now
the first sentence of the entry.

The last line is the other thing worth knowing: only the equipped instance banks
steps toward its level (`js/loot.js:1181-1184`), so which pet you have out is a
real decision rather than a costume choice.

Left out on purpose: shiny odds, breeding, lineage, species multipliers. That is
the catalogue, and the player is meant to find it.

# 5. The Wanderer

> He walks a circle out there with a lantern, and he is not a find. You cannot
> tap him. He has to see you.
>
> Stand in his light and he comes over. Then it is fight him or walk away, and
> walking away costs you nothing at all.
>
> Beat him and he pays properly, once. He moves slower than you do, so being
> caught by him is always something you chose.

Corrected: the first draft had him as something you walk up to and tap. He has no
tap interaction at all (his marker is `pointer-events:none`,
`js/wanderer.js:283-290`). He walks a seeded circle at 0.33 to 0.51 m/s, about a
third of walking pace (`js/wanderer.js:32-38`, `:170-201`), and his lantern cone
is 300 m wide at 60 degrees, drawn on the map, which is what makes "being caught
is something you chose" a fair thing to say (`js/wanderer.js:118-119`). Fleeing
writes nothing and the reward is still owed later (`js/app.js:16668-16674`).

Tom, item 15 of the same feedback batch: "The wanderer is out in the lake where I
am right now. He shouldn't be. He's bound to land." That is open and it is not
this branch's. The entry says nothing about where he walks, so it does not go
stale when somebody fixes it.

# 6. Bone Dust

> The other currency, and the one everybody ignores. Coins buy things. Dust is
> for changing your mind about them.
>
> Melting gear you are never going to wear is where most of it comes from. A
> piece he has outgrown is not waste, it is dust.
>
> It pays for how your gear LOOKS: wearing one piece and showing another, and
> the weekly Rack. One exception, on purpose: once a week it buys a Mystery Egg
> in the Shop, so a pet is never out of reach. Crates and charms are still gone,
> and breeding is free.
>
> You pay for a look once. Putting it back on in that same slot is free forever
> after that.

Corrected: the first draft said transmog was the only thing dust buys. It is not.
Breeding costs dust (`js/loot.js:breedCost`), and the weekly Rack is priced in
dust as well as coins (`RACK_DUST`, `js/loot.js`).

Corrected again 2026-08-25 (S0): the tier-4 weapons line is gone with the Bone
Merchant, and the Bone Dust shop closed later the same day, so the Mystery Egg /
Common Crate / Battle Charm line went with it. Dust is a COSMETIC currency now,
with breeding as the one remaining exception, and this copy has to say so
plainly rather than leave a player hunting a shop that is not there.

Corrected again 2026-08-31: the Mystery Egg is back, alone, on Tom's ruling that
its removal was unintentional (dust is the deterministic hatch route for a
player who cannot walk the step milestones). One per ISO week at the historical
60 dust (`js/loot.js:buyDustEgg`, `DUST_EGG`). Breeding stopped costing dust on
2026-08-27, so the paragraph now names the egg as the one non-cosmetic dust
spend, which is also what the S0 register in tests/unit.test.js declares.

The last line is the non-obvious one and the reason it is in: a (slot, look) pair
is paid for once and is free forever after (`paidLooks`, `js/loot.js:1563-1582`).
Players who do not know that ration their transmogs for no reason.

# 7. Changing how gear looks

Added 2026-08-23 AT INTEGRATION, not in the original launch set, and it exists
because of a defect neither branch could see alone. `x428/transmog-rework-r2`
hooked `guideLinkHtml('transmog')` on its reworked look panel while this Guide,
written on `feat/gwarts-guide`, had no `transmog` entry. Merged together, that
link opened the Guide and landed on nothing. Caught by the integration run, not
by either lane.

> Wearing one thing and showing another. The numbers are whatever the piece
> really is; only the picture changes.
>
> Nothing is destroyed and nothing comes off. The piece stays on him, keeps its
> stats, and stays in the Backpack where you left it.
>
> It costs dust, and only the first time. That look in that slot is free forever
> after, so try things.
>
> A look you have not paid for is priced on the tile before you commit. Nothing
> is taken until you say so twice.

Every claim checked against `js/loot.js` rather than against the panel's copy:
`transmogPrice` returns 0 when `paidLooks()` already holds `paidKey(slot, artId)`
(`js/loot.js:1593-1598`), and `applyTransmog` writes the override without touching
the gear row or the inventory, which is what makes "nothing is destroyed" TRUE
here. Note that it is true of transmog and FALSE of transmute, where the six
commons really are spent, and the two entries deliberately say different things
for that reason.

The last line names the arm-then-confirm, because a player who does not know a
price is quoted before anything is taken reads the cost as a gamble.

Overlaps the Dust entry on purpose: Dust says "you pay for a look once" from the
currency's side, this says it from the wardrobe's side, and a player arriving from
the look panel should not have to go and read a different entry to learn it.

# 7. Saved fits

> A saved fit is a photograph of what he has on. Six of them, and taking one
> costs nothing.
>
> Load it and he puts that look back on. Statted gear only fills slots that are
> empty, so a fit will never strip off something you picked this morning.
>
> Anything you have melted since is quietly skipped. The rest still arrives.
>
> The pet is not in it. The Stable keeps her.
>
> Save one before you start experimenting. That is the entire point of them.

Six is `MAX_FITS` (`js/loot.js:1643`). Gear refills empty slots only and never
bumps what is worn (`js/loot.js:1693-1702`). Missing pieces are silently skipped
(`js/loot.js:1710-1718`). The pet slot C is excluded from fits entirely
(`js/loot.js:1644-1646`), which is worth one line given Tom's item 16 on this
exact surface.

Not said, and this is a judgement call worth Tom's eye: applying a fit **can
charge Bone Dust**, if it contains a look you have never paid for
(`fitPrice`, `js/loot.js:1676-1691`). It is left out of this entry because the
Dust entry already carries "you pay for a look once", and repeating it here makes
saving a fit sound expensive when it is free. If Tom would rather the surprise
charge be named on this entry, it is one sentence.

# 8. The wheel

> One spin a day, free, and it comes to you. There is no button for it anywhere.
>
> Every wedge pays something. No blanks, no bad luck, no spin worth skipping.
>
> The day decides the prize, not the spin, so closing the app and coming back
> gets you the very same thing. Do not waste your evening on it.
>
> Shut it without spinning and it will be there next time you open. Tomorrow's
> does not stack on top of it though.

Seven wedges, weights summing to 100, no losing wedge (`js/wheel.js:99-118`). The
outcome is date-seeded, so a reload cannot reroll it (`js/wheel.js:299-301`),
which is the sentence in there to stop people farming reloads. The day is
consumed on the spin tap, not on show, so closing it without spinning loses
nothing (`js/wheel.js:303-317`). There is genuinely no manual entry point: it
fires from boot and from a day rollover (`js/app.js:1254`, `:1311`).

# 9. Streaks

> Days in a row that you wrote food down. Not steps, not walks. Food.
>
> Yesterday's streak stands until a whole day goes by empty. Miss one and it
> starts again at one.
>
> It is not decoration. Your streak is part of his Marrow, which is how much he
> can take in the Pit before he goes down. A long streak is a harder Bonehead to
> kill.
>
> Nothing else goes when it breaks. Only me being pleased with you.

Corrected: the first draft said "anything counts". Only food-log dates maintain
the rewarded streak; steps do not (`js/nutrition.js:214-221`, `js/game.js:15-18`).
Today not yet logged still counts yesterday's streak, so the break lands only
after a full empty day. Marrow is `20 + streak × 1.5 + on-budget closes × 1.2`
(`js/pit.js:20-21`), which is max HP and physical armour: that is the line that
turns a streak from a nag into a reason.

**A bug found while writing this, not fixed here.** The Progress page counts a
day toward its streak pill if it was logged **or** had 3,000+ steps
(`js/app.js:8349-8350`, `:8382`). The streak that pays milestones counts food
logs only. So Progress can show a bigger number than the one that actually pays,
and a player who trusts it will think the milestone is broken. Logged for Tom;
out of scope for this branch, and the entry above states the paying rule rather
than the displayed one.

---

## Where the words are reachable from

Gwart is drawn in exactly two places in the app, and both now open the Guide:

| Surface | Element | Where |
|---|---|---|
| Today, the plaque under the wallet | `#gwartBtn` | `js/app.js`, `renderToday` |
| Gwart's Emporium, the shop panel | `button.gw-art` | `js/app.js`, `gwartHeroHtml()` |

Plus two inline "What is this?" links, which exist because the explanation has to
be reachable at the moment of confusion and not only from the character:

| Surface | Opens |
|---|---|
| Kitchen, the Transmute section header | entry 2, already expanded |
| Compost heap, the Ectoplasm section header | entry 1, already expanded |

A player standing in front of the Transmute button asking "what does this do"
should not have to guess that the wizard on another screen is the answer.

## The one behaviour that moved, and where it went

You asked for two things on the same control, a day apart:

- 2026-08-21: "when you tap him he should say things"
- 2026-08-22: "clicking on gwart should take you to an explainer FAQ page"

Neither was dropped. **The plaque opens the Guide. The talk box he is speaking
out of advances the line.** Everything else is untouched: the opening line when
Today renders, and the idle timer that re-says on its own every 30 seconds, still
work exactly as they did.

The split is also what the box's own markup already meant. `renderToday` carries
the note "the chevron means tap the box for the next line", and until now nothing
in the app made that true.

One thing worth your eye: the box has **no visible affordance** saying it is
tappable. The chevron the comment refers to only draws in the talk box's "hold"
mode, and turning that on for this box adds padding that would move the measured
Today geometry `tests/today-peek-audit.mjs` pins. So the tap is there and it is
silent. It was equally silent before (nothing ever said "tap Gwart" either), so
this is no worse, but if you want the chevron it is a separate, measured change.

`tests/gwart-crate-audit.mjs` drives that box tap now instead of the plaque. Its
subject, the once-per-open cap on the crate reminder, did not move: the cap still
lives in `gwartLine`, and the audit still drives a real mouse click at a real
control rather than calling the function. Repointing the driver was the correct
response to a superseded instruction; loosening the assertion would not have
been.
