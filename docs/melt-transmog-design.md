# Melt + transmog: design, before any code

_Written 2026-08-10 overnight, per Reggie's A-NIGHT-4. Code is a morning task,
verified against a clean gate as it is written. This exists so the morning is
spent building a reviewed plan rather than improvising against dust._

## What Tom actually said

> "the transmog part of the game (also confusing UX right now) doesnt let you
> transmog common gear, it's a dumb move in game but the player should be able to
> do it for simple consistency."

> "Yes you can transmog plain gear and the current statless gear should still be
> meltable"

> "Just make sure any gear in the game could be melted idk what the tiers are for
> rarity"

And earlier, the two original complaints: **melting is too hidden**, and
**commons look unmeltable**.

## The finding that changes the shape of the work

**The engine already agrees with him.** `disenchantGear` (js/loot.js) checks
exactly one thing: that you own the piece. No rarity gate, no stats gate. It even
unequips a worn piece before melting it. And every one of the 388 gear items pays
real dust: uncommon 7-11, rare 15-23, legendary 85-98. Nothing pays zero.

So **all gear is already meltable**. Nothing about the rules needs to change.
Every complaint is presentation.

Second standing fact, logged and deliberately NOT filled: `GEAR_ITEMS` is
uncommon 115 / rare 146 / legendary 127. **There are no commons, no epics, and no
stat-less gear.** Inventing a tier is economy design and was not authorised;
Reggie's reading is recorded: "even no-stat gear is meltable" is a statement of
the RULE, not a claim that such gear exists, so the `melt-nostat` branch is
validated intent and stays.

## Problem 1: melting is hidden

Today it lives at Character sheet → Backpack tab → "Salvage Bench" section → a
`<details class="melt-fold">` that is **collapsed by default**. Three levels deep
and shut.

**Plan.** Surface the entrance, do not move the feature:
- The Salvage Bench section gets a live summary line that is always visible:
  how many spare pieces and what they are worth in total. That number is already
  computed (`totalDust`); today it is inside the summary of a closed fold.
- The fold opens by default when there is anything spare to melt, and stays
  closed when there is not, so it is never an empty invitation.
- Reachable from where the gear is: the Wardrobe's own empty-slot / spare list
  gets a route into the bench, since that is where a player is standing when they
  notice they own junk.

## Problem 2: cheap pieces look unmeltable

Measured cause, in the row template. An **unworn** piece renders a checkbox plus
`<span class="melt-val">+12</span>`, a passive label. A **worn** piece renders an
actual `<button class="btn small danger">`. So the pieces you are most likely to
want gone present as static text, and the one you should NOT casually melt is the
only thing that looks tappable. On top of that the low-value rows are captioned
"no stats · looks only", which reads as a reason to keep something.

**Plan.**
- Every row reads as actionable. The value becomes part of a control, not a
  label, and the worn/unworn distinction is carried by state and wording rather
  than by one being a button and the other being text.
- Worn pieces keep their extra friction. Losing the piece you are wearing to a
  stray tap is not a mistake worth allowing, and the current design is right
  about that; it is only wrong about which one looks pressable.
- "Only the N junk" is renamed. It selects commons and uncommons, and commons do
  not exist, so it is really "only the uncommons" and the word "junk" implies a
  category gate that is not there. Honest labelling, machinery untouched.
- "no stats · looks only" stays as a branch (validated intent) but stops reading
  as a warning: it is a fact about the piece, not advice.

## Problem 3: transmog refuses plain cosmetics

The panel is gated on `wornGear`, the **statted gear** in that slot, with the
rationale "equip a plain cosmetic and the look you picked is the look you get, so
there is nothing to disguise". True, and it is exactly why Tom hit "it won't let
me transmog this common thing": commons live among cosmetics, so a slot holding
one shows no panel at all.

**Plan.** Relax the gate so every gear slot offers the panel, with the item's own
look preselected, even where the choice is a no-op. Consistency beats the
optimisation. Nothing about pricing or `collectedLooks` changes.

## Rewarded-actions SOP (melt pays dust)

Per Reggie, in full, because this moves currency.

- **State transition:** `owned(gear) → destroyed(gear) + dust(+N)`. The only
  writer is `disenchantGear`, which deletes the `inv` row and calls
  `boneDustAdd`.
- **Idempotency:** the inv row is the ledger. A second melt of the same piece
  finds no row and returns `{ok:false, reason:'not-owned'}` before any dust is
  added. **The audit must prove that second call pays zero**, not merely that it
  returns false.
- **No yield changes.** `gearDustValue` is not touched. Any change to a dust
  number is a named decision in the ledger, never a side effect of a UI pass.
- **Bulk melt** is N independent transitions, not one batched write, so a partial
  failure cannot pay for pieces it did not destroy.

## Audit plan

Extend `tests/melt-ui-audit.mjs`, do not fork it. Its existing overlap guard (the
confirm bar covering list rows) stays and stays proven red.

New checks, each operating real controls:
1. **The entrance is visible without opening anything**: from the Backpack tab,
   the spare-piece count and total dust are on screen before any tap.
2. **Every row is actionable**: for each row in the list, a real control exists,
   measured by geometry and role, not by class name.
3. **A melt actually pays**: read dust, melt one piece through the UI, assert dust
   rose by exactly `gearDustValue` and the row is gone.
4. **A second melt pays nothing** (SOP): drive the same piece again, assert dust
   is unchanged. Proven red by removing the not-owned guard.
5. **Every rarity in the game can be melted**: enumerate the distinct rarities
   from `GEAR_ITEMS` and melt one of each, so a future tier cannot ship unmeltable.
6. **Transmog offers itself for a plain cosmetic**: equip one, assert the panel is
   present with its own look preselected. Proven red by restoring the `wornGear`
   gate.

## Explicitly not doing

- Not inventing a commons or epic tier.
- Not changing any dust yield.
- Not deleting the `melt-nostat` branch or the junk-selection machinery.
- Not moving melting out of the Salvage Bench; the complaint is that it is
  buried, not that it is in the wrong place.
