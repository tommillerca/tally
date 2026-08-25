# Real-money coin purchases: scoping only, nothing built

Written 2026-08-18. Source: scoping agent, findings re-verified by Reggie
against the tree at `js/loot.js` and `native/ios/App/App/capacitor.config.json`.
Nothing here is implemented. Decisions marked TOM are not made yet.

## The blocker that sizes the whole project

**Coins buy power today, in five places.** Verified in the tree:

| Sink | Where | Cost | Power? |
|---|---|---|---|
| Common / Golden Crate | `js/loot.js` `SHOP` | 150 / 400 | Yes. Crates roll a statted gear variant |
| Weapons | `js/loot.js:907` `WEAPON_COST` | 500 to 6,000 | Yes, outright |
| Vigor Draught / Battle Charm | `SHOP` | 90 / 100 | Yes. Pit energy and +25% Pit coins |
| Garden beds, cauldrons, forage | `js/app.js` | variable | Indirectly, via fight buffs |
| Drop items | `js/loot.js` `buyDropItem` | 1,500 / 3,000 | No. The only clean sink |

So real money to coins to crate to statted gear is a two-hop path that exists
right now. Tom's decisions already close most of it: crates become unbuyable,
the weapon tree merges into the wardrobe slot. What remains after those is
Vigor, Battle Charm and the garden sinks, and the garden is being removed
anyway. **Estimate 3 to 5 dev-days for the cleanup, and it is the real project.
The IAP code itself is 3 to 4 days.**

## Second blocker, invisible until a real buyer hits it

Transmog is priced in **Bone Dust** (`TRANSMOG_COST`, `applyTransmog`), and the
paid-look ledger is `kv paidlooks` keyed `slot:artId` via the unexported
`markPaid`. So today: a player buys coins, buys a look, and **still cannot wear
it** without spending Dust. Any coin-priced appearance purchase must also write
the `paidlooks` entry. Small change, generates refund requests if missed.

## Delivery path

The existing `grants` channel is right. It already has `UNIQUE (player_id, key)`,
signed requests, and `/admin/grant` as a working precedent. What it needs:

1. A `purchases` table with `transaction_id` as **globally** unique PK. Per-player
   uniqueness alone lets one Apple receipt mint on N accounts.
2. A **server-side** price table mapping productId to coins. Never trust a client
   coin amount.
3. An `environment` column. TestFlight and sandbox purchases are free; crediting
   one on a production account mints unlimited coins. Most likely first exploit.
4. Secrets: App Store Server API key (.p8 + key id + issuer id) and a Play
   service account JSON. **Tom runs `wrangler secret put`, not Claude.**
5. **One idempotency bug to fix first.** `applyPayload` in `js/social.js`:
   `award()` returns 0 both for "already ingested" and for "zero XP payload", so
   a coins-only grant falls through to `coinsAdd` every time it is applied. Fine
   for a free gift, not ledger-grade for money. Gate on `db.get('xp', key)` for
   `type === 'purchase'`.

Order matters: verify on the Worker, **then** finish/consume the transaction.
Persist to `kv pendingIap` before the network call, drain at boot.

## The firewall guard

`tests/purchase-firewall.mjs`, two halves, both prove-red before any purchase
code exists:

- **Runtime.** Apply a real purchase grant through `__testApplyGrant`, then buy an
  appearance. Assert coins moved by exactly the pack amount and by more than zero
  (empty-sample guard), and that `inv`, `gearloadout` and `equipped` are
  byte-identical before and after.
- **Static lint.** Fail on any reference from a purchase entry point to
  `grantGear`, `grantCrate`, `buyWeapon`, `equipGear`, `db.put('inv'`,
  `kvSet('gearloadout'`, `kvSet('equipped'`.

Plus a separate release-gate assertion that no coin-priced sink grants a crate,
gear or weapon row. The firewall is irrelevant if money bought power one hop
earlier.

## Trust model, stated plainly

The balance stays client-authoritative. A modified client can still mint coins
locally. That is acceptable **only because cosmetics are not tradeable**. If the
Bazaar roadmap item ever lets a bought cosmetic be listed, this model breaks.
ROADMAP.md:410 already forbids it; that line is now a security control.

## Platform facts

- Apple 3.1.1 requires IAP for in-game currency. The webview wrapper changes
  nothing about that rule.
- **Coins may not expire.** No economy reset or coin wipe is possible after the
  first sale, ever.
- Coin packs are **consumables**: not restorable, no Family Sharing. The reinstall
  answer is the existing BhVault keychain identity plus the encrypted backup, not
  the store. A brand new device needs the recovery code, and the purchase
  confirmation must say so.
- Apple Small Business Program is 15% instead of 30%. It is an **application**,
  not automatic. Tom qualifies.
- Play's fee is in flux for 2026 (US/EEA/UK restructure). **Read the actual tier
  off Tom's own Play Console before locking prices.** A 15-point swing changes
  the ladder.
- Play requires acknowledge/consume within **3 days** or the purchase auto-refunds.
- Crates staying unbuyable is what keeps loot-box odds-disclosure obligations
  (both stores) out of scope entirely.
- **Apple 5.1.3(i): health data may not drive marketing.** No offer, price,
  discount or prompt may be triggered by steps, weight, calories or streak.
- The app has **never passed full App Review**, and `capacitor.config.json` ships
  `server.url = https://tommillerca.github.io/tally/`, which Capacitor's own docs
  say is not for production. Submitting a webview shell AND payments in one
  review means two independent rejection causes at once.

## Proposed pack ladder, sized for the LIGHT walker

Not decided. Derived from 250 to 900 coins/day light, ~2,800 heavy. Sized against
the light end deliberately: the heavy player earns everything anyway and should
feel no reason to buy.

| Pack | CAD | Coins | @250/day | @900/day |
|---|---|---|---|---|
| Handful | 1.99 | 1,200 | 4.8 days | 1.3 days |
| Pouch | 4.99 | 3,500 | 14 days | 3.9 days |
| Sack | 9.99 | 7,500 | 30 days | 8.3 days |
| Hoard | 19.99 | 16,000 | 64 days | 17.8 days |

$4.99 buys exactly one 3,000-coin legendary. Tops out at 33% better value, not a
3x whale ladder. **Consequence: every existing coin price becomes a real-money
price the day a pack ships.** Reprice the appearance catalogue in the same
release. Also: never show "days of walking saved" anywhere.

Note: `ROADMAP.md:404` records ~1,000 to 1,300 coins/day engaged, which
disagrees with the 2,800 figure. Re-measure before locking prices.

## Decisions

- **TOM, D1: one currency or two.** One currency (coins go cosmetic-only) needs
  the 3 to 5 day cleanup above. A second purchase-only currency with exactly one
  sink is 0.5 to 1 day and trivially provable, but two currencies reads as
  monetised in a way one does not. Highest-leverage decision here.
- **TOM, D2: confirm the ladder**, after re-measuring the earn rate.
- **DECIDED (Tom, 2026-08-17): crates are not buyable, only gear for
  transmogging.** That closes the largest half of the power path.
- **DECIDED (Tom, 2026-08-17): IAP comes after the shop launches.** "once this is
  live." Correct sequencing: with today's 10-item catalogue the lifetime spend
  ceiling is about $28. If nobody spends earned coins on looks, nobody will spend
  real money on them either.
- **TOM, D3: get a non-IAP App Store release approved first?** Recommend yes. One
  extra review cycle buys an unambiguous answer if the wrapper gets flagged.
- **TOM, D4: does the shipped build stay remote-hosted?** Bundling `www` removes
  the 4.2/2.5.2 argument but ends instant web updates.
- **TOM, D5: refund policy.** The Worker is additive-only and cannot claw back.
  Proposed: record the refund, leave the balance, flag repeat abusers by hand.
- **TOM, external, start early:** Paid Apps Agreement, then US tax forms, then
  banking. Longest external wait and it gates every other stage. GST/HST given
  Apple and Google are merchant of record is an accountant question.

## Effort

| Stage | Days |
|---|---|
| S0 make coins cosmetic-only | 3 to 5 |
| S1 coin-priced appearance shop | 2 to 3 |
| S2 Worker verification | 2 to 3 |
| S3 native StoreKit + Play plugins | 1 to 2 each |
| S4 client flow and pending queue | 1 to 2 |
| S5 store config and compliance | 1 plus external waiting |
| S6 sandbox and failure testing | 1 to 2 |

**12 to 20 dev-days total. Minimum shippable iOS-only version: 3 to 4 days of
actual IAP code, on top of S0 and S1.**

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
