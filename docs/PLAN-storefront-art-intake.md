# The storefront, and how art gets into it

Written 2026-08-20 for "the art is coming in hot and we wanna sell this shit."
Everything here is measured against `origin/main` @ `c3b7bc9` (v420), not
against the older docs, three of which still describe the shop as a mockup.

## Where the storefront actually is

**It shipped.** `92a8b3d "v410: the Shop is open"` is on main. `buyRackItem`,
`rerollRack`, real constants, real balances, an atomic claim, `armToConfirm` on
every pill, and `purchase-firewall` guarding the cosmetic-only rule. The money
path is good. Nothing here proposes rewriting it.

## The blocker for incoming art, stated exactly

    export const RACK_THEME = 'HEATWAVE';        // one string, no rotation
    export const RACK_POOLS = [ ...8 rungs x 3 hardcoded ids... ];

A new batch of Cam's art can enter the shop in exactly one way: somebody
hand-edits those 24 ids. **The shop's entire lifetime catalogue is 24 items plus
one aura**, and there is no second theme anywhere in the tree.

Five invariants have to hold every time that array is edited, and until today
all five were re-checked by hand:

1. no id in two rungs (this one is a MONEY bug, see below)
2. the dust ladder never reverses
3. the cheapest rung stays inside a 340-coin starting wallet
4. each rung sells one body part
5. no two neighbouring tiles sell the same body part

## PHASE 1, done today: the drop is checked by machine

`tests/rack-theme-lint.mjs`, on branch `ext/rack-theme-lint`. PURE, sub-second,
reads the two source files as text. Seven rows, all seven proved red against a
real defect.

The row that matters most is COLLIDE. `buyRackItem` prices by
`RACK_POOLS[st.ids.indexOf(artId)][0]`, so an id appearing in two rungs charges
the FIRST rung's price for a piece from another. Duplicating an id is the single
easiest mistake to make when pasting a new batch in, and nothing caught it.

**Effect: an art drop is now a data change plus a green lint, not a design
review.**

## PHASE 2, next: themes as data, so art lands without touching code

Today's shape, one theme inlined at module scope. Proposed shape:

    export const RACK_THEMES = [
      { key: 'heatwave', name: 'HEATWAVE', pools: [...], dust: [...], aura: {...} },
      { key: '<next>',   name: '...',      pools: [...], dust: [...], aura: {...} },
    ];

and `rack()` picks the theme for the week the same way it already picks the nine
ids, off `isoWeekKey` and the existing FNV-1a hash. No server, no config.

**The risk, named rather than discovered later.** `RACK_POOLS` and `RACK_DUST`
are not just data, they are the PRICE LOOKUP inside the purchase path. Moving
them changes `buyRackItem`, which is the function a P0 was just fixed in and
which `purchase-firewall` guards. This is the reason phase 2 was not rushed out
today alongside phase 1.

Doing it safely:

1. `rack()` already persists `{ week, salt, ids, rr, rrDay }` in kv. Add
   `theme` to that record. A rack in flight keeps its theme for the week even if
   the theme list changes underneath it, which is the same guarantee the ids
   already have.
2. Read prices from the PERSISTED theme, never from a module-scope const, so a
   deploy mid-week cannot reprice a rack a player is looking at.
3. A record with no `theme` key is pre-migration: default it to `heatwave`. No
   migration pass, same trick the `bossfirst` markers use.
4. `rack-theme-lint` runs over EVERY theme in the list, not just the live one,
   so a bad future theme fails at commit time rather than on the Monday it
   rotates in.
5. `purchase-firewall` and `purchase-write-failure-audit` both re-run green
   before it lands.

**Estimated: small, but it is money-path work, so it gets its own branch, its
own prove-red, and does not ride with anything else.**

## PHASE 3, a decision only Tom can make: the free daily reroll

`RACK_REROLL_LADDER = [0, 100, 200, 300, 400, 500, 500]`. The first entry is
zero and the allowance resets on `rrDay`, so it is **one free reroll every day**,
seven free full-rack draws a week, each re-drawing all eight rungs from 3-deep
pools.

Probability a specific item appears at least once in a week, on the free tier
alone: **1 - (2/3)^7 = 94.15%**.

The code's own comment says an unlimited reroll "destroys the rack: you spam it
until your piece appears and the countdown becomes noise". The free daily tier
already does that. So today the weekly rack is not a curated rack, it is a
catalogue browser with a clock on it.

This matters for phase 2: **rotating themes is pointless while one theme is
fully browsable for free inside a week.** Options, cheapest first:

- make the free reroll WEEKLY rather than daily (one character: the reset key)
- deepen the pools so a reroll cannot exhaust a rung
- drop the free tier entirely and start the ladder at 100

## PHASE 4, the pet question

There is no plan for cosmetics worn BY a pet, and the code has no notion of one.
Slot `C` is a slot on the PLAYER's figure holding one flat sprite. Full writeup
in `docs/SHOP-GRILL-2026-08-20.md`. The fork:

- **Pet SKINS** reuse a system that already ships end to end (shinies: minted,
  tracked, rendered, priced on salvage). One sprite per skin, drops into the
  existing rack and try-on unchanged, because it is just another slot-`C` item.
- **Pet ACCESSORIES** need per-pet anchor points that do not exist, art from Cam
  for every item crossed with every pet, and a pet stage in the shop. The
  Paddock, where a player would expect to dress a pet, is on the external dev's
  off-limits list.

## The one sequencing rule that is not negotiable

Ship the art. Ship the rack. Ship themes.

**Do not turn on real-money coin packs until the coin faucet is priced.** Apple
guideline 3.1.1 forbids purchased currency from ever expiring or being removed,
so every faucet correction becomes permanently unavailable the day a pack goes
live. The measured problems, all verified in source and detailed in the grill:
the Gauntlet ceiling has no cap, the Vigor Draught nets +60 coins per cycle
forever at 30 coins a fight against a 50-coin rematch, foe stats clamp at 100
while the player's clamp at 150 so everything past rank 53 is risk-free, and a
60-dust Mystery Egg salvages back for a mean of 65.

None of that blocks selling cosmetics for earned coins today. All of it blocks
selling coins for money.
