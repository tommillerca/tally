# The shop, grilled. 2026-08-20

Five adversarial passes on the cosmetic shop plan, commissioned by Tom. Every
number below that carries a VERIFIED tag was re-checked against `origin/main`
@ `c3b7bc9` by hand after the agent reported it. Anything tagged RELAYED is the
agent's finding that I have not personally re-derived, and should be treated as
a lead rather than a fact.

## 0. The premise was dead. VERIFIED

`docs/STATE-2026-08-19.md` says the shop is a mockup with "0 of 16 buy buttons
wired" and "`js/loot.js` is untouched by design".

**The shop shipped as v410 and is live.** `92a8b3d "v410: the Shop is open (#61)"`
is an ancestor of `origin/main`. `buyRackItem`, `rerollRack`, `RACK_POOLS`,
`RACK_DUST`, `RACK_AURA` and `RACK_REROLL_LADDER` are all real code in
`js/loot.js:87-254`. Three documents still describe the mockup, and this has
already sent one agent to rebuild a shipped feature.

**Fix the docs first.** It is the cheapest item here and it stops the next
session wasting itself.

## 1. A failed write mid-purchase destroys the money AND the item. VERIFIED. P0

`js/loot.js:224` runs claim, deduct, grant, `markPaid`, with **no try/catch**.
Every write path in `js/db.js` rejects on abort, quota, or the wipe-protocol
freeze flag.

So when the grant fails after the deduct: coins gone, no `cos` row, no toast,
no rerender. The tile still shows a price. Tap it again and the
`db.addIfAbsent('kv', 'rackbuy:<artId>')` claim row from the first attempt is
still there, so it returns `owned` and `js/app.js:7032` toasts
**"Already in your Wardrobe."** for a piece that is not in the wardrobe.
`js/loot.js:194` says that claim row is never removed, so the piece is
**unbuyable forever, on every future rack**.

No audit catches it. `tests/purchase-firewall.mjs` pins that a SECOND call pays
nothing, which is exactly the trap. The repo already has the right guard shape
in `tests/log-write-failure-audit.mjs` ("a failed save must not look like a
saved meal"). It was never applied to the money path.

Suggested fix, not built: make the claim row a receipt with a state
(`claimed` then `granted`) and reconcile any stuck row at the top of
`renderShop`. Idempotent by construction, no delete, no refund arithmetic.
Do NOT fix it by deleting the claim and refunding: a delete that lands while
the refund does not reopens double-spend, which is worse.

## 2. The Vigor Draught is a coin printer. VERIFIED. P0 before any IAP

- `js/loot.js:35` `VIGOR_DRAUGHT_AMOUNT = 3`
- `js/loot.js:40` Vigor Draught costs **90 coins**

So a Pit fight costs **30 coins**.

- `js/pit.js:1692` ordinary endless rematch pays `15 + Math.min(35, rank * 2)`,
  which is **50 coins flat from rank 18 up**
- `js/pit.js:1648` Glutton rungs pay `25 + Math.min(45, rank * 3)`, up to **70**
- `js/pit.js:1690` a FIRST clear pays `120 + rank * 15`

Buy one Draught for 90, drink it, rematch three times at any rank 18 or higher:
3 x 50 = 150 coins in. **Net +60 per cycle, no day gate, no cap.** On a Glutton
rung it is 3 x 70 = 210, net +120. Against a first clear at rank 295 it is
4,545 coins for 30 coins of Draught, a 151x margin.

Note the named ladder is fine: rungs 1 to 8 repeat for 15 to 30, so the loop is
break-even or negative down there. The printer only starts in the endless ranks.

## 3. The ceiling has no cap, so coin income is quadratic in time. VERIFIED

`js/pit.js:1702` `endlessCeiling(denWins) => 7 + 3 * Math.max(0, denWins)`.
No cap of any kind.

Three sources mint fresh distinct-den markers forever: roaming
(`bossfirst-roam-<date>-<cell>`, `js/poi.js:417`), remote
(`bossfirst-remote-<day>`, `js/poi.js:426`) and landmark
(`bossfirst-<week>-<cell>`, `js/poi.js:456`). Measured separately today: about
**3.2 roaming dens are reachable in a player's home 3x3 per day**, so a walker's
ceiling reaches 295 by day 30 and 871 by day 90.

Because a first clear pays `120 + 15r` and the reachable rank rises daily,
cumulative coin income grows as roughly O(days squared).

**Important: the marker keys are NOT the bug.** Roaming ids carry the date
because roamers are day-seeded, and landmark ids carry the week because
`denForCell` seeds the boss from `den:${week}:${cx}:${cy}`, so a cell holds a
different boss each week. Stripping either would re-break the exact bug the
2026-08-16 fix repaired, and `tests/den-ceiling-audit.mjs` already guards it.
An earlier note of mine calling this "roaming cap inflation" was wrong. What is
actually true is only that the ceiling is uncapped.

## 4. Foe stats saturate while rewards do not. VERIFIED

- `js/pit.js:1706` `scaleStats` clamps every foe stat to **100**
- `js/pit.js:59` `allocatedStats` lets the player reach **150**

A base stat of 20 saturates at `mult >= 5`, which is about **rank 53**. From
there up every endless foe is stat-identical while the payout keeps climbing 15
a rank. The UI still prints a rising percentage for a foe that is measurably no
stronger.

This is the enabler: it is what makes items 2 and 3 safe to farm rather than
merely profitable on paper.

## 5. A 60-dust egg salvages for 65. VERIFIED

- `js/loot.js:414` Mystery Egg costs **60 dust**, `buyWithDust` has no cap
- `js/loot.js:520` the hatch pool is `poolAll.filter(i => i.rarity !== 'common')`

Parsed from `data/boneheadz.js`: 6 slot-C items, 5 non-exclusive, and once the
commons are owned the pool is exactly **three** pets.

| pet | rarity | salvage |
|---|---|---|
| C1 Drizzle | epic | 60 |
| C2 Mallard | legendary | 120 |
| C5 Bulldog | uncommon | 15 |

Mean salvage **65.00 dust** against a 60-dust cost, plus a 3% shiny bonus, so
about **+9% per cycle**, gated only by an 8,000-step walk, with unbounded batch
size because eggs bought together share one walk.

This is the cleanest one to fix: price the egg above 66, or widen the pool.

## 6. The free daily reroll defeats the weekly rack. VERIFIED

`js/loot.js:123` `RACK_REROLL_LADDER = [0, 100, 200, 300, 400, 500, 500]`. The
first entry is **zero**, and `js/loot.js:142` and `:163` reset the allowance on
`rrDay`, so it is **one free reroll every day**, seven free full-rack draws a
week, each re-drawing all eight rungs from 3-deep pools.

Probability a specific item on a rung appears at least once in a week on the
free tier alone: 1 - (2/3)^7 = **94.15%**.

The code comment at `js/app.js:6680` says an unlimited reroll "destroys the
rack: you spam it until your piece appears and the countdown becomes noise".
The free tier already does that.

Related: `RACK_THEME` is a bare const, `'HEATWAVE'`, with no rotation anywhere
in the tree. The shop's entire lifetime catalogue is 24 items plus one aura.

## 7. `/gift` mints coins with no server-side balance check. VERIFIED

`server/src/index.js:1608`, spend mode:
`const coins = Math.max(1, Math.min(1000, Math.floor(bd.coins || 0)))`, taken
straight off the request body, then a grant crediting the recipient. There is no
server-side balance anywhere to check against; the endpoint's own comment says
the client "deducts locally".

Bounded by an accepted friendship and 5 gifts per friend per day, so 5,000
coins per friend per day rather than infinite. Tolerable while coins are only
earned. The day coins cost real money it is a grey market with a first-party
API, and it breaks the trust model `docs/IAP-SCOPING.md` explicitly rests on:
a client-authoritative balance is accepted there **because cosmetics are not
tradeable**. Coins are tradeable.

## 8. The purchase firewall guards three functions and misses the power sinks. VERIFIED

`tests/purchase-firewall.mjs:115` scans exactly `buyRackItem`, `rerollRack` and
`wireRackBuys`. Meanwhile `js/loot.js:1214` grants a Golden Crate for coins, on
the same screen. The guard is green today while coin-priced power sits twelve
lines from the cosmetic grant it exists to protect.

`docs/IAP-SCOPING.md:69` also promises a release-gate assertion that no
coin-priced sink grants a crate, gear or weapon row. No such assertion exists.

## RELAYED, worth chasing, not re-derived by me

- **The economy sign-off is a pre-merge gate for code that already merged.**
  `docs/ECONOMY-INTERLOCK.md` required all three `econ/*` branches be measured
  together before any merge. They shipped as v404 on 2026-08-19. Its instrument
  `tests/boneyard-supply-audit.mjs` never imports `js/loot.js`, the only file
  the faucet branch changes, so the "combination" was never measured. Its own
  ordered follow-up, re-measure once the cosmetic shop exists, is outstanding
  while the shop has been live a day.
- **The faucet fix gives away the shop's own stock.** Cutting gear variants
  0.55 to 0.30 pushed about 70% of gear-slot crate rolls into the cosmetic pool
  that holds 100% of the rack's 24 items, on 7 of 8 rungs.
- **Try-on composites the product UNDER the player's own clothes.** The
  300-coin briefs rung exists specifically so a starting wallet can buy
  something, and it is invisible on a dressed player.
- **The shop is the only monetisation screen with zero precached art**, so a
  cold cache paints nine price tags and no products.
- **Paid rerolls of a randomized rack** may carry an odds-disclosure obligation
  on both stores, which `docs/IAP-SCOPING.md:96` assumes is out of scope.
- **Settings > Erase all data** wipes purchased currency with copy that only
  mentions "log, foods, weights, gear".

## The caveat that matters

The player-experience pass graded `mockup/shop-rack`, which is 20 commits
behind the shipped screen. Its findings on copy, theme and the try-on sheet are
probably still live, but **every one needs re-checking against v420 before
anyone acts on it**.

## Why the sequencing is not negotiable

`docs/ECONOMY-INTERLOCK.md` is right that Apple guideline 3.1.1 forbids
purchased currency from ever expiring or being removed. **Every coin-faucet
correction above has to land before the coin pack ships**, or it is permanently
unavailable. That single fact reorders the whole roadmap: items 2 to 5 are not
polish, they are prerequisites.

---

# THE GAP THE GRILL DID NOT COVER: cosmetics that go ON the pet

Tom asked on 2026-08-20 whether there is a plan for cosmetics worn by the pet,
with a place in the shop to view and try them on. **There is no such plan**, and
none of the five passes covered it. Recording the engineering state so the
decision is made on facts.

## What the code actually models today

- **`C` (Pet) is a slot on the PLAYER's figure**, `z: 5`, behind the Body at
  `z: 10` (`data/boneheadz.js`, `BH_SLOTS`). The pet is one flat sprite the
  player equips, in the same system as a hat.
- **A pet is not a character with its own slots.** Nothing anywhere models an
  item worn BY a pet.
- **There are 6 slot-C items in the entire game**, 5 non-exclusive: Drizzle,
  Mallard, Bulldog and two commons, plus the exclusive Day One Lizard.
- **The rack sells 8 slots** (H, B, IL, T, FW, P, S, U) and `C` is not one of
  them. Try-on composites onto the player figure via
  `{ ...playerEq, [it.slot]: id }`, so there is no pet stage to try anything on.

## The one asset that half-helps, and why it is not enough

`PET_CROP` (`data/boneheadz.js:1997`) holds measured alpha bounding boxes per
pet, so any surface can crop a pet to its ink and scale it to a slot. That gives
you WHERE THE ART IS. An accessory needs WHERE THE HEAD IS, plus a size and an
angle, per pet. The pool contains a rain cloud, a duck and a bulldog, so a single
generic anchor derived from the bounding box lands wrong on most of them.

## So accessories are a new system, not a shop feature

Required: per-pet anchor points, new art from Cam for every item crossed with
every pet, a pet stage in the shop for try-on, and a decision about whether the
Paddock (which is where a player would expect to view and dress a pet) is in
scope. The Paddock is on the standing off-limits list for the external dev.

## The cheap alternative, which reuses a shipped system

**Sell pet SKINS, not pet accessories.** The game already ships pet variants end
to end: `SHINY_CHANCE` (`js/loot.js:498`) mints them, `S.shinyPets` tracks them,
the `.is-shiny` class renders them, and `petDustValue` prices them on salvage. A
recolored Mallard is that exact path with a different sprite.

- No anchors needed.
- No per-item-per-pet art multiplication: one sprite per skin.
- Drops into the existing rack and the existing try-on unchanged, because it is
  just another slot-`C` item.
- There is already a documented recolor pipeline for Cam's art
  (`docs/pet-recolor-animation-skill.md`).

**The fork to decide before anyone builds: skins reuse a shipped system,
accessories require a new one.** Note also that adding slot-C items to the rack
interacts with finding 5 above, because the egg hatch pool is drawn from the same
slot-C set and its salvage economics are already inverted.
