# Plan: retire the Bone Merchant (weapons)

_Written 2026-08-08 for Tom's approval. Nothing is built yet. Every number below
was read out of the running code, not estimated._

Tom's brief, verbatim:

> I think we gotta remove the bone shop. Weapons that give stats but not
> cosmetics it's confusing players. I think strength in the game should just be
> based on your talents skills and stats attached to gear you can see. Simpler is
> better here for mass appeal when we are on the App Store.

I agree with the reasoning. An invisible item that silently changes your damage
is the one power source a player cannot inspect on their own character, and it is
the only one that has no art. On an App Store listing built around a Bonehead you
dress up, that is the odd one out.

---

## 1. First, a scope question I need answered

**"The bone shop" has two possible meanings and they are very different jobs.**

The Shop tab currently sells four separate things:

| Section | Stock | Keep or cut? |
|---|---|---|
| **The Bone Merchant** | 12 buyable weapons, 500 to 6,000 coins | **this is what your reasoning describes** |
| **The drop** | Cosmetics, direct-buy, per item | keep: this is the monetization rail |
| **Consumables** | Common Crate 150, Golden Crate 400, Vigor Draught 90, Battle Charm 100 | keep: no power, pure convenience |
| **Bone Dust** | Transmute / dust spending | keep |

**Recommendation: cut the Bone Merchant only, keep the Shop tab.** Your stated
reason is entirely about weapons giving stats without cosmetics. The drop is the
opposite of that problem: it is cosmetics with no stats, and it is the thing the
cosmetic-only monetization decision (2026-08-07, not being reopened) is built on.
Deleting the whole tab would delete the store the game is meant to make money
from.

Everything below assumes that reading. **If you meant the entire Shop tab, say so
and I will rewrite this**, because the plan changes substantially.

---

## 2. What weapons actually are today

14 weapons in `js/pit.js`. One free starter, one champion-only prize, 12 for sale.

| Weapon | Rarity | Build | Cost | What it does |
|---|---|---|---|---|
| Taped Pipe | common | none | free | nothing, the honest baseline |
| Femur Rapier | rare | melee | 500 | +12% crit, Swing costs 20% less Stamina |
| Twin Shivs | rare | melee | 500 | Jab/Swing/Haymaker cost 20% less Stamina |
| Bone Wand | rare | caster | 700 | +15% magic |
| Skull Scepter | epic | caster | 900 | +30% magic |
| Bone Cleaver | epic | melee | 1,500 | +5% crit, Haymaker costs 25% more |
| Marrow Crook | epic | support | 1,600 | marrow spec |
| Marrow Maul | legendary | melee | 3,400 | power spec |
| Lich Focus | legendary | caster | 3,400 | +45% magic |
| Bone Censer | legendary | support | 3,200 | marrow spec |
| War Maul | prestige | melee | 6,000 + 350 dust | power spec |
| Voidstar | prestige | caster | 6,000 + 350 dust | hype spec |
| Reliquary | prestige | support | 5,600 + 330 dust | marrow spec |
| **Bonecrusher** | legendary | melee | **not for sale** | The Marrow King's prize |

They plug into combat in exactly four places, all in `derived()` at
`js/pit.js:238`:

- `weapon.apBonus` → action points
- `weapon.magicBonus` → magic multiplier
- `weapon.critBonus` → crit chance
- `weapon.mult(move, stats)` and `weapon.windCostMult(move)` → per-move damage and
  Stamina cost

That is a small, well-contained surface. The removal itself is not the risky part.

---

## 3. The part that IS risky: enemies carry weapons too

This is the single most important thing in this document, and it is easy to miss.

```js
// js/pit.js:1576
export const CHAMPION = { name: 'The Marrow King', ..., weaponId: 'bonecrusher', ... };
// js/pit.js:1682
weaponId: rank % 3 === 0 ? 'bonecrusher' : 'starter',
```

**Every third rung of the endless Pit ladder, and the Champion, fight you while
holding Bonecrusher.** Delete weapons naively and those enemies lose 40% Power
scaling on Haymaker overnight. The whole ladder gets easier, the Champion stops
being a wall, and the Glutton gear check we just added at every 10th rung is
measured against foes that are suddenly weaker.

So this is not a deletion, it is a **rebalance**. The enemy power those weapons
supplied has to be folded back into the foes' own stat blocks, or the ladder
silently deflates.

**This must be measured, not reasoned about.** `tests/fight-sim.mjs` already
exists and is the project's standing answer to balance questions. My own theories
about this game's balance have been disproved by that sim before.

---

## 4. What breaks, verified

| # | Thing | Where | Handling |
|---|---|---|---|
| 1 | `derived()` reads 4 weapon fields | `js/pit.js:238-257` | default them to zero; keep the parameter so foes can still carry a stat block |
| 2 | Enemy Bonecrusher | `js/pit.js:1576, 1638, 1682` | **fold into foe stats, re-baseline with the sim** |
| 3 | Champion prize (first ladder) | `js/app.js:16336` writes a `kind:'weapon'` inventory row | **remove the weapon grant (Tom's call).** Replacement prize, see §6 |
| 4 | Shop merchant UI | `js/app.js:5982-6110` | delete the merchant block |
| 5 | Buy flow | `buyWeapon`, `WEAPON_COST`, `weaponCoinCost`, `weaponDustCost` in `js/loot.js:919-957` | delete |
| 6 | Equip flow | `kvSet('loadout', ...)` at `js/app.js:6088` | delete |
| 7 | Owned weapons in inventory | `db 'inv'` rows with `kind:'weapon'` | **refund, see §5** |
| 8 | `loadout` pushed to the social profile | `pushProfileSoon()` after equipping | drop the field; server ignores unknown fields, so no migration |
| 9 | `recommendArch` / `ARCH_META` | `js/app.js` | used for the merchant's grouping. Check for other consumers before deleting |
| 10 | `fighter.owned` / `fighter.loadout` | `buildFighter()` | remove once nothing reads them |
| 11 | Tests | `tests/fight-sim.mjs`, `tests/unit.test.js` (138 passing) | update, expect the sim's baselines to move |

Not affected: gear stats, gear-granted talents, sets, the talent trees, cooking,
spires, dens, the Glutton. Those are all separate systems.

---

## 5. Players who already bought weapons

**This is where "won't break the game" is actually decided.** People spent real
progression on these. Silently deleting a 6,000-coin purchase is the kind of thing
that ends a beta.

Additive-only data rules apply: never destructively rewrite what a player owns.

**Recommended: full coin refund at the price paid, plus dust back for prestige
weapons.** Not a discount, not store credit. They paid a listed price for a thing
we are withdrawing, so they get the listed price back.

- Total exposure is small. Even a player who bought one of everything is at
  roughly 33,000 coins and 1,030 dust, and almost nobody owns the full rack.
- **Step one is to measure it, not guess**: query D1 for how many players hold
  weapons and which ones, before writing any migration. If it turns out to be six
  people, this is trivial.
- Delivered as a one-time reconciliation on next open, through the existing
  idempotent award ledger, with a ledger key that is stable (not timestamped) so
  it cannot pay twice. This follows the rewarded-actions SOP.
- Shown as a proper notice, not a silent balance change: "The Bone Merchant has
  closed. Your weapons have been refunded in full." People forgive a removal they
  are told about.

Inventory rows stay in the database (additive rule), just unreferenced by the UI.

---

## 6. What replaces them

Two holes are left. Both need filling or the change makes the game worse.

**A coin sink.** Weapons were the main thing coins bought, from 500 up to 6,000.
Remove them and coins inflate with nothing to spend on but 150-coin crates. Your
own direction answers this: coins should buy **visible gear and cosmetics**. That
is the same sink, moved to things the player can see on their character, which is
exactly the simplification you are asking for.

**A Champion prize.** Beating The Marrow King (finishing the first Pit ladder)
currently grants Bonecrusher, written as a `kind:'weapon'` inventory row at
`js/app.js:16336`.

> **Tom's call, 2026-08-08:** "finishing the first ladder of fights in the pit
> will no longer grant a weapon." Decided, not an open question.

So that grant goes. It still has to feel like a trophy, or the ladder loses its
payoff. Best fit, in order:

1. An exclusive **cosmetic** plus a title on the nameplate. Visible, brag-worthy,
   no power, consistent with cosmetic-only.
2. A legendary **gear** piece (visible, has stats, follows the existing gear
   rules).

I would go with the cosmetic and the title: it is the only option that makes the
Champion's reward something other players can actually SEE on you, which is the
whole point of the change.

Note this is separate from the enemy-side Bonecrusher in §3. The Champion also
*fights* holding it, and that power has to be folded into their stat block or the
final fight gets easier at the same moment its prize changes.

---

## 7. Build order, each step verified before the next

1. **Measure first.** D1 query: how many players own weapons, which ones, what
   they paid. Run `tests/fight-sim.mjs` and record today's ladder win rates and
   TTK as the baseline to hold. → verify: baseline numbers written down.
2. **Fold enemy weapons into foe stats.** Champion and every-third-rung foes keep
   their current effective power without a weapon. → verify: sim reproduces the
   step-1 baseline within tolerance. This is the step that protects the ladder.
3. **Refund migration**, behind the ledger, with the notice. → verify: run twice,
   second run pays nothing (rewarded-actions SOP rule 5).
4. **Remove the merchant UI and the buy/equip flows.** → verify: Shop renders,
   drop and consumables still buyable, no dead controls, `screen-sweep` green.
5. **Strip weapons from combat**, default the four fields. → verify: full sim
   again, ladder unchanged from step 2.
6. **New Champion prize.** → verify: beat the Champion in the harness, assert the
   prize lands.
7. **Update tests and CLAUDE.md**, ship with a plain-language changelog entry.

Roughly one focused session. Steps 1 and 2 are the ones that carry the risk;
4 and 5 are mechanical.

---

## 8. What I am NOT doing unless you say so

- Not touching the drop, consumables, crates or Bone Dust.
- Not touching gear, talents, sets or any other power source.
- Not removing the Shop tab.
- Not deleting anyone's inventory rows.
- Not rebalancing anything beyond restoring the enemy power the weapons supplied.

---

## 9. Open questions

1. **Scope**: Bone Merchant only, or the entire Shop tab? (I recommend merchant
   only, §1.)
2. **Refund**: full coins and dust back, as recommended? Or something else?
3. **Champion prize**: the weapon grant is going (your call). What replaces it:
   exclusive cosmetic plus a title, or a legendary gear piece?
4. **Coin sink**: happy for coins to point at visible gear and cosmetics, or do
   you want to decide that separately later?
