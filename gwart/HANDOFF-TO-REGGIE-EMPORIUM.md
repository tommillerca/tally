# Gwart to Reggie: the shop work, bundled for Gwart's Emporium

Written 2026-08-20. Tom's instruction: finish this, hand it to Reggie, he lands
it with the Emporium as ONE push. **Everything here is LOCAL to this Mac by
Tom's explicit request.** Nothing in this handoff was pushed after he said so.

Base for all of it: `origin/main` @ `c3b7bc9` (v420).

---

## 1. FIRST, before anything else: your own work is not committed

Your session died mid-run on 2026-08-20 and left uncommitted work in scratch
worktrees under `/private/tmp`, which macOS purges. **Gwart's Emporium is one of
them.** It was never a branch, which is why every ref search for it came back
empty.

    /private/tmp/claude-502/.../ad578513-.../scratchpad/wt-emporium
    on feat/gwart-emporium, whose tip is just c3b7bc9 (main itself)
    M app.css  M js/app.js  M js/changelog.js  M sw.js
    ?? assets/gwart/gwart.png (363,837 bytes)
    ?? assets/gwart/gwart-stars.png (111,309 bytes)

A snapshot of it is safe on origin at **`rescue/wt/wt-emporium`**, taken through
a temporary index so your worktree was never touched: it is still byte-for-byte
as you left it. The two PNGs are the part git had no record of anywhere.

Twenty other worktrees were in the same state and are snapshotted the same way
under `rescue/wt/*`. The full table is in `docs/WORK-REGISTER.md`.

**Commit into your worktrees at the end of a session. `/private/tmp` is not
storage, and no branch listing will ever show you what is missing.**

---

## 2. What is in the bundle

    ~/Documents/gwart-emporium-handoff.bundle   (16.7 KB, delta against c3b7bc9)

All four also exist as LOCAL branches in this repo, so you can just check them
out. The bundle is belt and braces.

| branch | tip | what it is |
|---|---|---|
| `ext/gate-tier-boneyard-icon` | `f3b0baa` | unblocks the gate. Take this first. |
| `ext/purchase-write-failure` | `6c1c1c6` | **P0.** A failed write during a purchase no longer eats the coins AND the piece. |
| `ext/rack-theme-lint` | `46d11cd` | new art can be dropped into a theme and the machine says if it is malformed. |
| `ext/rack-reroll-weekly` | `b0ee190` | the reroll allowance is weekly, not daily. Tom approved this today. |

Merge order is that order. `gate-tier` first because nothing can be verified
until the gate can start. The other three do not touch each other's lines.

**No version stamp is touched by any of them.** `APP_BUILD`, `sw.js` VERSION and
the changelog stay with you and Tom, so none of this reaches a phone until one
of you stamps it.

---

## 3. The gate, and a red you should not chase

`npm run gate` was exiting 1 on clean `origin/main` **before a single test ran**:
`tests/boneyard-icon-audit.mjs` (yours, from the v418 Boneyard work) belonged to
no tier, so the coverage assertion killed the run. `ext/gate-tier-boneyard-icon`
files it as `['full', ...]` to match its siblings, which need a reachable vector
tile host.

Its reason string records a real weakness rather than hiding it: unlike
`boneyard-audit`, that audit has **no capability probe and no UNPROVEN exit**, so
on a host with no route to the tile server only its CONTROL row stands between a
tile-less run and a vacuous pass. Worth fixing, and it is your suite.

**The red that is NOT a regression:** `notif-audit.mjs` fails under
`HEADLESS_MODE=shell` and passes without it. Measured today, both ways, on the
same clean tree: exit 1 with shell, exit 0 without. It is the headless-shell
Notification API, not main. This Mac needs shell mode for screenshots, so the
gate cannot go fully green here until that audit handles shell mode or declares
UNPROVEN. Do not go hunting for a notification bug that is not there.

---

## 4. The P0, because it is worth understanding before you merge it

`buyRackItem` wins an atomic claim, then deducts, then grants. That ordering is
RIGHT: the claim before the money is what makes a double-spend impossible. The
cost was a gap. `js/db.js` rejects on abort, on quota and on the wipe-protocol
freeze flag, and nothing caught those.

Measured on live main before anything was changed: **300 coins charged, no
cosmetic granted, the call throwing so the player saw nothing, and the retry
answering `owned` while ownership was still false.** Because the `rackbuy:`
receipt is never removed, the piece was **unbuyable forever, on every future
rack**, and the UI cheerfully said "Already in your Wardrobe" about it.

The fix is RECOVERY, not refund. A refund has to delete the receipt, and a
delete that lands while the refund does not reopens the double-spend the receipt
exists to prevent. Finishing the grant is idempotent by construction.

**One thing to know if you touch it:** the recovery reports as `owned`, not as a
fresh purchase, on purpose. It cannot tell a stuck receipt from a LOSING CALLER
in a race, where three concurrent taps all lose the claim and all see "not
owned" because the winner has not written its row yet. An earlier version of
this fix answered `ok:true` and made one purchase report three successes.
`purchase-firewall`'s ONCE-RACE row caught that. Do not "simplify" it back.

---

## 5. What the Emporium should be built against

Two documents, both written today, both from measured facts rather than from the
older docs (three of which still describe the shop as an unwired mockup, which
it has not been since v410):

- **`docs/SHOP-GRILL-2026-08-20.md`** Eight verified holes with file:line
  evidence, six relayed leads, and the sequencing rule.
- **`docs/PLAN-storefront-art-intake.md`** How art actually gets into the rack,
  phase by phase.
- **`docs/PLAN-pet-cosmetics.md`** The pet question, answered.

### The three that will bite the Emporium specifically

1. **Any new slot-`C` (pet) item is FREE from an egg unless it is
   `exclusive: true`.** Both `hatchEgg` (`js/loot.js:515`) and breeding
   (`js/loot.js:882`) draw from
   `BH_ITEMS.filter(i => i.slot === 'C' && !i.exclusive)`. Sell a pet skin
   without that flag and the shop is selling something a 60-dust egg gives away
   on the same screen.

2. **One art id in two rack rungs charges the wrong price.** `buyRackItem`
   prices by `RACK_POOLS[st.ids.indexOf(artId)][0]`, so a duplicate id is priced
   at the FIRST rung it appears in. That is the easiest possible mistake when
   pasting a new batch of art in, and `ext/rack-theme-lint` is what now catches
   it. Run the lint on every drop; it is PURE and sub-second.

3. **The theme is still one hardcoded string.** `RACK_THEME = 'HEATWAVE'` and
   `RACK_POOLS` is 24 ids typed by hand. The shop's entire lifetime catalogue is
   24 items plus one aura. Theme rotation is designed in
   `PLAN-storefront-art-intake.md` phase 2 and deliberately NOT built, because
   `RACK_POOLS` is the price lookup inside the purchase path and that is worth
   doing carefully rather than quickly. **If the Emporium is going to need more
   than 24 sellable items, that phase is the prerequisite, not the polish.**

---

## 6. The one thing that is not negotiable

Ship the art. Ship the rack. Ship the Emporium.

**Do not turn on real-money coin packs until the coin faucet is priced.** Apple
guideline 3.1.1 forbids purchased currency from ever expiring or being removed,
so every faucet correction becomes permanently unavailable the day a pack goes
live. Verified in source today: the Gauntlet ceiling has no cap
(`endlessCeiling = 7 + 3 * wins`), a 90-coin Vigor Draught buys three fights at
30 coins each against a 50-coin rematch so it nets +60 per cycle forever, foe
stats clamp at 100 while the player's clamp at 150 so everything past rank 53 is
risk-free, and a 60-dust Mystery Egg salvages back for a mean of 65.

None of that blocks selling cosmetics for earned coins today. All of it blocks
selling coins for money.
