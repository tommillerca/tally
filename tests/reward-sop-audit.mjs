/* tests/reward-sop-audit.mjs — EVERY PAYING ACTION, AGAINST THE SOP.
 *
 * WHY THIS EXISTS. The same bug has now shipped three times, and each time it
 * was fixed on the one feature it was found on:
 *   - the Glutton could be re-fought inside one appearance and paid every time
 *   - a spire you already held could be re-taken, because the server is
 *     idempotent (`ok:true, already:true`) and the client only tested `ok===false`
 *   - a gift paid twice, because award() returns 0 both for "already in the
 *     ledger" and for "this payload carries no XP", so only XP-bearing payloads
 *     were ever protected
 * Three incidents, one class, and nothing generalised the lesson. The SOP is in
 * tally/CLAUDE.md under "Rewarded actions". This is its teeth.
 *
 * WHAT IT ASSERTS
 *   COVERAGE  every paying call site in js/*.js is DERIVED FROM THE SOURCE and
 *             must belong to a registered action that names its state
 *             transition. A new payout nobody registered FAILS, which is the
 *             half that makes the class stay fixed rather than being swept once.
 *   UNDRIVEN  a registered action either gets performed twice below or states
 *             why it cannot be. The undriven list is PRINTED on every run so it
 *             cannot rot into "covered" (the same rule figure-audit uses).
 *   REPEAT    every driven action is performed TWICE in the already-satisfied
 *             state, sequentially AND concurrently, against a real IndexedDB.
 *             The second attempt must pay the declared consolation and never
 *             the prize. Concurrently matters: on 2026-08-17 every one of these
 *             paid in full when two calls overlapped, because the authority was
 *             read in one transaction and the reward written in another.
 *   NO-OP     an action that decides nothing is owed must not damage the record
 *             it consulted. The REPEAT rows cannot see this: they grade what the
 *             second attempt PAID, and it correctly pays nothing while wiping
 *             the record on its way out. See the block near the foot of the file.
 *   CONTROL   the FIRST attempt actually paid, and the scanner actually found
 *             sites. An empty sample is a failure, never a pass.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not re-check that award keys are
 * free of clocks and random ids: tests/xp-cap-audit.mjs owns that (STATIC), and
 * it does not re-check that a paying `social.*Remote` call reads its answer
 * before paying: the two NO-OP guards in tests/unit.test.js own that. This
 * complements both rather than duplicating them.
 *
 * PROVE-RED: the block at the foot of this file lists, for every fix this audit
 * protects, the one-line reintroduction and the row it turns red, with the
 * overpay each one measured. All of them were run.
 *
 * Usage: node tests/reward-sop-audit.mjs            (serves this tree)
 *        node tests/reward-sop-audit.mjs <base-url>
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boot, sleep, serveTree } from './godmode.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`);
  if (!cond) fails++;
};

/* ===========================================================================
 * THE REGISTRY.
 *
 * One row per ACTION, keyed `js/<file>:<enclosing function>`. Every row states
 * the STATE TRANSITION (SOP part 1: if nothing changes, there is no reward) and
 * the AUTHORITY that decides it (SOP part 2: ask first, pay second).
 *
 * `sites` is the number of paying call sites the scanner must find inside that
 * function. It is not decoration: it is what stops a new payout being slipped
 * into an already-registered function without anybody naming its transition.
 * If you add a payout, the count moves and this file fails until you say what
 * changed state to earn it.
 *
 * `drive` names a driver in DRIVERS below. A row with no driver must carry
 * `undriven` with a reason, and every one of those is printed on every run.
 * ======================================================================== */
const ACTIONS = [
  // ---- the ledger primitive itself -------------------------------------
  { id: 'js/game.js:award', sites: 1, drive: 'award',
    transition: 'a ledger key goes from unminted to minted; there is no other transition in the game',
    authority: 'db.addIfAbsent on the xp store: the check and the write are one transaction' },
  { id: 'js/game.js:awardCapped', sites: 1, drive: 'awardCapped',
    transition: "the nth award of the day for a repeatable source, n <= that source's daily ceiling",
    authority: 'the ledger, one fixed key per (source, date, n)' },

  // ---- world actions: repeatable, ledger-keyed --------------------------
  { id: 'js/poi.js:claimGluttonWin', sites: 5, drive: 'glutton',
    transition: "today's Glutton goes from alive to beaten, for THIS appearance window",
    authority: 'the ledger key glutton-<date>-<slot>' },
  /* sites went 11 to 10 on 2026-08-31: the remote branch's own coinsAdd was
     the double-pay half of a confirmed live money bug (banner +48, bank +96;
     the settle already pays r.coins with the multipliers). Removing a paying
     site on purpose is exactly what this count exists to make loud. */
  { id: 'js/poi.js:claimDenWin', sites: 10, drive: 'denWin',
    transition: 'a boss den goes from uncleared to cleared for today (and its week, for the Pit ceiling)',
    authority: 'the ledger keys boss-<date>-<cell> / roam-… / remote-… and bossfirst-<week>-<cell>' },
  { id: 'js/poi.js:claimMiniWin', sites: 3, drive: 'miniWin',
    transition: "a roaming mini-boss goes from unbeaten to beaten, today",
    authority: 'the ledger key mini-<date>-<cell>' },
  { id: 'js/hunt.js:collectSpawn', sites: 3, drive: 'spawn',
    transition: 'a Boneyard spawn goes from uncollected to collected, today',
    authority: 'the ledger key spawn-<date>-<spawn id>' },
  { id: 'js/poi.js:claimDenLoot', sites: 1, drive: 'denLoot',
    transition: 'a pending gear choice goes from open to picked',
    authority: "the kv 'denloot' entry, removed BEFORE the gear is granted" },
  { id: 'js/game.js:claimFriendBattle', sites: 1, drive: 'friendBattle',
    transition: "today's first battle against THAT friend",
    authority: 'the ledger key friendbattle-<date>-<friendId>' },
  { id: 'js/quests.js:claimQuest', sites: 6, drive: 'quest',
    transition: 'a completed quest goes from unclaimed to claimed for its period',
    authority: 'the ledger key quest-<periodKey>-<quest id>' },
  { id: 'js/quests.js:claimAllBonusIfDue', sites: 2, drive: 'questAll',
    transition: "the day's third daily quest is claimed, so the all-clear bonus falls due once",
    authority: 'the ledger key questsall-<date>' },

  // ---- inventory rows: the row IS the right to one payout ---------------
  { id: 'js/loot.js:openCrate', sites: 5, drive: 'crate',
    transition: 'an unopened crate row goes from held to spent',
    authority: 'db.take on the inv row: handing it over and deleting it is one transaction' },
  { id: 'js/loot.js:hatchEgg', sites: 1, drive: 'egg',
    transition: 'a ready egg row goes from held to hatched',
    authority: 'db.take on the inv row' },
  { id: 'js/loot.js:redeemCode', sites: 2, drive: 'redeem',
    transition: 'a code goes from unredeemed to redeemed ON THIS DEVICE',
    authority: "db.addIfAbsent of the kv row redeemed:<code>, with the legacy 'redeemed' list still read first" },

  // ---- kv-backed state --------------------------------------------------
  { id: 'js/spires.js:collectTribute', sites: 0, drive: 'tribute',
    transition: "a held tower's accrued tribute days go from N to 0",
    authority: "kvUpdate on 'spires': the days are read and collectedAt is moved in one transaction" },
  { id: 'js/garden.js:harvestPlot', sites: 1, drive: 'harvest',
    transition: 'a ready bed goes from grown to empty',
    authority: "the plot record in kv 'garden'" },
  { id: 'js/cooking.js:collectDish', sites: 1, drive: 'dish',
    transition: 'a finished pot goes from full to empty',
    authority: 'the cook slot, nulled and written BEFORE the dish is banked' },
  /* Was registered as undriven on the argument that it "moves an already-paid-for
     queued dish into a pot". True of the QUEUE half and false of the other half:
     it also banks whatever the pot it takes was holding, and that read-await-write
     paid twice. Driven now, and graded on the Pantry count rather than a wallet
     delta, because the leak here is a free combat consumable and not a coin. */
  { id: 'js/cooking.js:advanceQueue', sites: 1, drive: 'advance',
    transition: 'a finished pot goes from full to empty, on the clock rather than on a tap',
    authority: "one kvUpdate on 'cooking': the pot is emptied and refilled in the same transaction, and the queue entry that refills it was taken from 'cookq' by a kvUpdate of its own" },
  { id: 'js/energy.js:spendPitFight', sites: 0, drive: 'pitCharge',
    transition: 'a Pit charge goes from held to spent: the free floor first, then one banked Vigor',
    authority: "kvUpdate on 'pitEnergy': the charge is read and taken in one transaction" },
  /* RE-GRADED 2026-08-21, 7 -> 8 sites: the admin make-good gained a PET arm
     (`grantPet(p.pet, 'social')`), so /admin/grant can hand a named player back
     a species they lost to a mistake or a bug. The transition and the authority
     are unchanged, and that is the point: every arm of this function, the new
     one included, runs ONLY after awardOnce has minted the key, so a
     re-delivered or re-pulled pet grant lands exactly one copy. The server's own
     idempotency (INSERT OR IGNORE on grants(player_id, key)) is a second layer
     and neither one is load-bearing alone. */
  { id: 'js/social.js:applyPayload', sites: 8, drive: 'grant',
    transition: 'a server grant key goes from not-ingested to ingested',
    authority: "awardOnce: the ledger row IS the receipt, and minting it is the claim" },
  { id: 'js/game.js:grantLevelRewards', sites: 6, drive: 'levelRewards',
    transition: 'each level crossed goes from unpaid to paid, once ever',
    authority: "db.addIfAbsent of the levelpaid-<L> ledger row (the legacy `claimed` flag on levelup-<L> is still honoured so an already-collected level cannot be re-paid)" },
  { id: 'js/game.js:evaluateBadges', sites: 1, drive: 'badges',
    transition: 'a badge goes from unearned to earned',
    authority: 'the ledger key badge-<id>' },
  { id: 'js/game.js:streakAwards', sites: 1, drive: 'streak',
    transition: 'a streak milestone is reached for the first time',
    authority: 'the ledger key streak-<n>' },

  // ---- registered, deliberately not driven ------------------------------
  { id: 'js/game.js:onFoodLogged', sites: 7, undriven: 'a composite of award() calls, every one of them ledger-keyed and covered by the award driver; the entry has its own audit in tests/log-write-failure-audit.mjs' },
  { id: 'js/game.js:onHealthSync', sites: 16, undriven: 'sixteen ledger-keyed milestone awards over a health payload; the shape is one award per (date, milestone) and the primitive is driven above. tests/health-intake-audit.mjs owns the payload end' },
  { id: 'js/game.js:onWeighIn', sites: 1, undriven: 'one award keyed weigh-<date>; the primitive is driven above' },
  { id: 'js/game.js:awardDayCloseIfDue', sites: 6, undriven: 'runs at boot for YESTERDAY only, all six sites ledger-keyed on that date; not a control a player can press twice' },
  { id: 'js/wellness.js:addWater', sites: 1, undriven: 'ledger key water-<date>, and the goal edge is guarded by wasGoal so topping up cannot re-award' },
  { id: 'js/wellness.js:markBed', sites: 1, undriven: 'ledger key bed-<date>' },
  { id: 'js/wellness.js:markSleep', sites: 1, undriven: 'ledger key sleep-<date>' },
  /* REGISTERED BY THE REVIEWER, deliberately: the agent that built the manual
     walk (feat/manual-walk, 2026-08-30) correctly refused to register its own
     payout, which is the entire point of this registry. Pays 10 XP + 1 Vigor,
     capped 2/day and 60min in the write path, ledger key mwalk-<date>-<n>, and
     by construction it never writes h.steps, so the step race and step quests
     cannot see it (the race pays real prizes). */
  { id: 'js/wellness.js:logManualWalk', sites: 1, undriven: 'ledger key mwalk-<date>-<n>, capped 2/day in the write path' },
  { id: 'js/wellness.js:markRoutine', sites: 1, undriven: 'ledger key routine-<id>-<date>, and past ROUTINE_XP_CAP the row is minted with 0 XP on purpose' },
  { id: 'js/cooking.js:doTransmute', sites: 1, undriven: 'a once-a-day cooldown plus an ingredient spend; nothing is granted without both' },
  { id: 'js/garden.js:compostIngredient', sites: 1, undriven: 'spends an ingredient and is capped at COMPOSTS_PER_DAY; a conversion, not a payout' },
  { id: 'js/loot.js:buyShopItem', sites: 1, undriven: 'a purchase: the second attempt is MEANT to charge again. Was 3 until 2026-08-25: crates came off the coin shop (S0), so the two grantCrate branches went with them and only grantConsumable is left' },
  /* js/loot.js:buyWithDust stood here with 3 sites (grantEgg / grantCrate /
     grantConsumable). The Bone Dust shop closed on 2026-08-25 and dust is a
     cosmetic-only currency, so all three sites went with it. */
  /* sites went 1 to 2 on 2026-08-31 with the atomic spend. The second site is a
     REFUND of the coins this very call just took, on the one path where the
     grant is lost to a concurrent tap (grantCosmetic addIfAbsent's `cos:<id>`
     and returns null to whoever loses). It is bounded by the debit above it and
     conserves the balance rather than adding to it, so it is not a payout and
     needs no ledger key of its own. It is graded by the SPEND-ONCE row in
     tests/purchase-firewall.mjs: four concurrent taps on a 3,000-coin piece
     leave the wallet exactly 3,000 lighter, not 9,000. */
  { id: 'js/loot.js:buyDropItem', sites: 2, undriven: 'a purchase, and it refuses when already owned; the second site is its own refund on a lost grant race, not a payout' },
  /* Registered 2026-08-31: both gained their single "paying" site from the spend
     reorder, and in both cases it is a REFUND of the balance the same call took
     a line or two earlier, not a payout. Neither grants anything, so neither has
     a state transition to earn; what they have is a bounded give-back. */
  { id: 'js/loot.js:rerollRack', sites: 1, undriven: "the one site is a coinsAdd refunding a caller that paid for a reroll and then lost the rack kvUpdate on `used !== st.rr`. That claim was always atomic, so two rerolls could never double-charge each other; the reorder closes a reroll landing beside an ordinary BUY, each on its own stale read (measured on origin/main 2faa73b6: a 3,000-coin wallet paid a 500 reroll AND a 3,000 piece). It also covers the stale-PRICE case for free, since a caller quoting a cheap rung's price after somebody else advanced the counter is refused and refunded rather than underpaying. Graded by CROSS-REROLL in tests/purchase-firewall.mjs, alongside the REROLL-LADDER / REROLL-FLOOR / REROLL-WEEKLY rows that own the curve" },
  { id: 'js/loot.js:applyTransmog', sites: 1, undriven: "the one site is a boneDustAdd refunding a caller whose look was banked by a concurrent tap. markPaid IS this function's receipt (a banked look is free to wear forever after) and it now reports whether IT added the key, so applyTransmog is the buyDropItem shape with the paid-look ledger playing grantCosmetic's part. Not a payout: bounded by the spendDust directly above it. Before the reorder both halves were broken, measured on 2faa73b6: two concurrent applies of one 12-dust look took 24 and applied one, and the read-then-debit overdrew against any other dust spend. Graded by CROSS-TRANSMOG in tests/purchase-firewall.mjs, with the WEAR-FREE rows owning the free-to-wear half" },
  { id: 'js/loot.js:disenchantGear', sites: 1, undriven: 'melts a piece the player owns: the gear row is the input, so a second run finds nothing' },
  { id: 'js/loot.js:salvagePet', sites: 1, undriven: 'as disenchantGear, on a pet instance' },
  { id: 'js/loot.js:salvageInstance', sites: 1, undriven: 'as salvagePet, by instance id' },
  /* Re-graded v441. It was registered here as "gated on kv 'freeze-refunded' AND
     on the rows it pays for", and BOTH halves of that were false under
     concurrency: the flag was a kvGet/kvSet pair with the payout between them,
     and two callers read the same rows before either deleted any. It runs on
     boot, so two tabs was all it took. Now claimed with db.addIfAbsent on the
     same key before a coin moves, and no longer merely registered: driven. */
  { id: 'js/loot.js:refundStreakFreezes', sites: 1, undriven: "one-time make-good behind an addIfAbsent claim on kv 'freeze-refunded'. Driven to destruction by tests/freeze-refund-audit.mjs (PAYS / ONCE / BOOT / RACE / MIGRATION / NOTHING), which is where the second-attempt proof lives rather than here" },
  { id: 'js/loot.js:grantCrate', sites: 1, undriven: 'a grant helper: it has no authority to consult, it is what the authorities call' },
  { id: 'js/loot.js:grantPet', sites: 1, undriven: 'a grant helper' },
  { id: 'js/loot.js:addPetInstance', sites: 1, undriven: 'a grant helper' },
  { id: 'js/loot.js:migrateLegacyEggs', sites: 1, undriven: 'a migration that converts each legacy row and deletes it; conserves count' },
  /* runInitBackfill, not initGameIfNeeded: the backfill body was extracted into
     its own function when the replay was chunked and checkpointed, and
     initGameIfNeeded is now the one-at-a-time wrapper around it and holds no
     paying site of its own. Re-graded on the move: the seven sites are the same
     seven awards (log, firstlog, weigh, protein, dayclose, meals3, levelup),
     byte for byte the same keys and amounts, so nothing was added or lost. */
  { id: 'js/game.js:runInitBackfill', sites: 7, undriven: "one-time retroactive backfill behind kv 'game-init', reached only through initGameIfNeeded, and every award inside is ledger-keyed anyway" },
  { id: 'js/game.js:initLootIfNeeded', sites: 6, undriven: "the welcome kit, behind kv 'loot-init'; site 6 is the starter egg (goal 0, hatch on arrival), added 2026-08-30 from the playtest" },
  { id: 'js/game.js:backfillStarterSeedsIfNeeded', sites: 2, undriven: 'one-time backfill behind its own kv flag. Pays ingredients rather than seeds since 2026-08-18; the ledger key and the write-before-pay order are unchanged' },
  /* THE GARDEN'S CLOSING PAYOUT. Transition: "this save still holds a live Bone
     Garden" becomes "it has been settled", once per save, and nothing about play
     can put it back because the garden has no door left. Authority: db.addIfAbsent
     on kv 'garden-retired', asked and answered BEFORE a coin moves, so a second
     tab or a second boot gets false and pays nothing. It refunds up to 5,500
     coins on a boot path, which is the most dangerous payout in the app right
     now, so it is not merely registered here: tests/garden-retire-audit.mjs
     drives it twice, ten times, across a real reload and three-way concurrently,
     and measures the coin balance every time. */
  { id: 'js/loot.js:retireMerchantIfNeeded', sites: 2, undriven: "the Bone Merchant's closing refund, behind an addIfAbsent claim on kv merchant-retired. THE STATE TRANSITION: 'this save still holds weapons bought from a merchant that exists' becomes 'settled', and nothing about play can put it back, because buyWeapon is gone from the tree. Driven to destruction by tests/merchant-retire-audit.mjs (PAYS / ROWS / ONCE / BOOT / RACE / PARTIAL / NOTHING / PRIZE), which is where the second-attempt proof lives rather than here. It pays coins AND Bone Dust, which is why the count is 2" },
  { id: 'js/game.js:retireGardenIfNeeded', sites: 2, undriven: 'the Bone Garden refund + conversion, behind an addIfAbsent claim on kv garden-retired. Driven to destruction by tests/garden-retire-audit.mjs (PAYS / ONCE / BOOT / RACE / NOTHING), which is where the second-attempt proof lives rather than here' },
  { id: 'js/poi.js:backfillDenCeilingIfNeeded', sites: 1, undriven: "one-time backfill behind kv 'denceil-backfill'; mints 0-XP marker rows only" },
  { id: 'js/wheel.js:PRIZES', sites: 7, undriven: "the prize table's grant thunks; the day gate is kv 'wheelLastDate', set BEFORE the grant in maybeShowDailyWheel's commit(), and tests/wheel-audit.mjs drives the wheel itself" },

  // ---- app.js: the screens that pay ------------------------------------
  /* 13 -> 17, RE-GRADED, and the count was two behind before this change: the
     Mimic's settle landed without touching this line, which is exactly the
     drift this row exists to catch. The four sites are the two spawn ambushes,
     two each (the xp award and the crate it hands over). Both are the same
     shape and both are graded: each claims the SPAWN'S OWN ledger key, so the
     boss and the loot he replaced compete for one row that db.addIfAbsent can
     only create once, and both orders plus three-way concurrency are driven
     against a real IndexedDB by tests/mimic-audit.mjs and
     tests/wanderer-boneyard-audit.mjs (ONE-SHOT / ATOMIC). */
  { id: 'js/app.js:openFight', sites: 18, undriven: 'the fight settlement: thirteen modes, every one of them delegating to a claim function registered above (claimFriendBattle, claimDenWin, claimMiniWin, claimGluttonWin) or gated on an award() key it reads before paying. The two remote branches are pinned by name by the NO-OP guards in tests/unit.test.js; tests/glutton-audit.mjs and tests/spire-phase3-audit.mjs drive the two that shipped exploits; and the two Boneyard ambushes (mimic, wanderer) are driven by tests/mimic-audit.mjs and tests/wanderer-boneyard-audit.mjs' },
  { id: 'js/app.js:renderBoneyard', sites: 4, undriven: 'the map: the tribute button and the spawn button, both delegating to collectTribute and collectSpawn, which are driven above. Was 5 until 2026-08-18: a collect also paid a garden seed, and with the Bone Garden off the player\'s path a seed cannot be planted, so that grant came out' },
  { id: 'js/app.js:openKitchen', sites: 3, undriven: 'awardCapped on a served dish (driven above), plus a coin-priced forage' },
  { id: 'js/app.js:openHollow', sites: 1, undriven: 'awardCapped on a harvested bed; harvestPlot is the authority and is driven above' },
  { id: 'js/app.js:openGardenSheet', sites: 1, undriven: 'DEAD CODE: openGardenSheet has no caller anywhere in js/ (the GROW door opens openHollow). Registered so that if it is ever wired back up, the count moves and somebody has to look at it' },
  /* THE RACK. A SPEND rather than a payout, and it is registered here because
     the grant on the other side of it is one: coins or dust go out and a
     cosmetic comes in, so a second call that pays again is the same bug in the
     same shape. The negative coinsAdd/boneDustAdd are correctly not counted as
     payouts by the scanner above; grantCosmetic is the one site. */
  /* RE-GRADED 2026-08-20, from 1 site to 2. The second grantCosmetic is the
     RECOVERY path added with the write-failure fix: when a rackbuy receipt
     exists but the piece is not owned, the player already paid and the grant is
     what never landed, so it is finished on the next tap. It cannot double-pay,
     and the reason is structural rather than careful: the recovery branch is
     only reachable when db.addIfAbsent LOSES, which means the receipt was
     already down, which means the deduct below it never runs on that path. It
     deducts nothing and returns reason 'owned'. grantCosmetic is itself
     idempotent (it returns null when the cos row exists), so running it twice
     grants once. Proven both ways by tests/purchase-write-failure-audit.mjs:
     red on unfixed main where the retry leaves the player owning nothing, and
     green here with zero coins taken on the retry. */
  /* sites went 2 to 4 on 2026-08-31 with the spend reorder. The two new ones are
     the REFUND on a lost claim, `currency === 'dust' ? boneDustAdd(price) :
     coinsAdd(price)`, which the scanner counts twice because the ternary puts
     both calls on one line. Bounded by the debit directly above it and
     conserving the balance rather than adding to it, so it is not a payout;
     graded by CROSS-RACK and CROSS-DUST in tests/purchase-firewall.mjs. */
  { id: 'js/loot.js:buyRackItem', sites: 4,
    transition: 'a rack piece goes from unowned to owned, once and forever',
    authority: 'db.addIfAbsent on the kv row rackbuy:<artId>. The money is spent FIRST and atomically (spendCoins/spendDust refuse inside the kv transaction and leave the balance byte-identical), and the claim then decides WHO GETS THE THING, with the loser of the claim refunded on the line under the debit. Reordered 2026-08-31: claiming first made a second tap on the SAME item free, which is the case that was tested, and hid the case that was not, two DIFFERENT items bought in the same instant each passing their own stale balance read with both clamped debits free. Measured pre-reorder on origin/main 2faa73b6: a 3,000-coin wallet took a 3,000 and a 2,400 piece together and kept both, and 160 dust took 160 + 130',
    undriven: "driven to destruction by tests/purchase-firewall.mjs, which is where the second-attempt proof lives rather than here: it buys through the real function against a real IndexedDB, measures every store either side, and performs the same purchase twice sequentially AND three times concurrently. Proven red there on a kvGet/kvSet claim (3 callers charged 7,200 for a 2,400 item) and on paying before the claim" },
  /* sites went 2 to 3 on 2026-08-31 with the spend reorder: the new one is the
     coinsAdd REFUND on a lost claim, bounded by the debit above it. Graded by
     CROSS-PET in tests/purchase-firewall.mjs. */
  { id: 'js/loot.js:buyPetItem', sites: 3,
    transition: 'Bumbleseal, or one piece of her wardrobe, goes from unowned to owned, once and forever',
    authority: 'db.addIfAbsent on the kv row petbuy:<id>. The money is spent FIRST and atomically (spendCoins/spendDust refuse inside the kv transaction and leave the balance byte-identical), and the claim then decides WHO GETS THE THING, with the loser of the claim refunded on the line under the debit. Reordered 2026-08-31: claiming first made a second tap on the SAME item free, which is the case that was tested, and hid the case that was not, two DIFFERENT items bought in the same instant each passing their own stale balance read with both clamped debits free. Identical to buyRackItem by design; the function header says that if the two ever diverge, the divergence is the bug. Her shelf was the worst case for the old ordering because it is the only one where several affordable things each cost thousands: measured pre-reorder on 2faa73b6, an 8,000-coin wallet took an 8,000 and a 6,000 accessory together and kept both',
    undriven: "driven to destruction by tests/purchase-firewall.mjs, added 2026-08-21 when THIS ROW WAS THE THING THAT WAS MISSING: the function shipped on ext/bumbleseal-pets and reward-sop found it unregistered during the v421 merge. A registry row saying 'same shape as the one next door' is an argument, not evidence, and this is the most expensive button in the game, so it got the rack's own three legs instead. Measured green there: 50,000 spent exactly once, a second sequential buy pays 0, three concurrent buys of one 8,000 accessory spend 8,000 and grant 1. Plus a leg the rack has no equivalent for, PET-GATE: an accessory is refused with reason 'needs-pet' before she is owned AND the balance does not move, because every piece is drawn positioned for HER body and would hang in empty air on any other pet" },
  /* THE DUST EGG, restored 2026-08-31 on Tom's ruling (the S0 removal of the
     dust shop's egg was unintentional; dust is the deterministic hatch route
     for a non-walker). A SPEND whose other side is a grant, so it is registered
     the way buyRackItem/buyPetItem are. The negative boneDustAdd is correctly
     not counted by the scanner; grantEgg is the one site (it appears at two
     call sites in the function, main path and recovery, but the scanner counts
     the recovery one too, which is why sites was 2). It went to 3 on 2026-08-31
     with the spend reorder: the new site is the POSITIVE boneDustAdd refunding a
     caller that paid and then lost the receipt claim, bounded by the debit above
     it. The weekly receipt already made a second EGG impossible; what the
     reorder closes is the egg landing beside another dust spend. */
  { id: 'js/loot.js:buyDustEgg', sites: 3,
    transition: "this week's Mystery Egg goes from unbought to bought; one per ISO week, and the week key IS the bound",
    authority: 'db.addIfAbsent on the kv row dustegg:<isoWeek>. The money is spent FIRST and atomically (spendCoins/spendDust refuse inside the kv transaction and leave the balance byte-identical), and the claim then decides WHO GETS THE THING, with the loser of the claim refunded on the line under the debit. Reordered 2026-08-31: claiming first made a second tap on the SAME item free, which is the case that was tested, and hid the case that was not, two DIFFERENT items bought in the same instant each passing their own stale balance read with both clamped debits free. The granted flag on that receipt is flipped by a CONDITIONAL kvUpdate so the recovery of a paid-but-ungranted week has exactly one winner',
    undriven: 'driven to destruction by tests/dust-egg-audit.mjs (PRICE / BOUND / ONCE-RACE / FAILURE / RECOVER), which is where the second-attempt and refused-write proofs live rather than here' },
  { id: 'js/loot.js:deliverPet', sites: 1,
    transition: 'a pet you have just paid for gains its FIRST copy in the Stable, and becomes the pet you fight with',
    authority: 'petInstances() itself, read immediately before the mint: it is the list every screen and every per-copy map answers from, and the read runs the reclaim, so a copy minted there a moment earlier is seen and not duplicated',
    undriven: "the tail of buyPetItem and unreachable without it: nothing else calls it, and buyPetItem's own claim (db.addIfAbsent on petbuy:<id>) is what makes it run once. Added 2026-08-21 with the fix for the v421 defect where buyPetItem wrote ownership and never a copy, so the 50,000-coin pet was owned, equipped, drawn on Today and absent from the Stable and the Paddock. The second-attempt proof lives in tests/pet-ownership-audit.mjs, which measures the copy count as a DELTA per species across the real grant (dupes legitimately stack, so an absolute 1 would be wrong) and requires exactly +1, then reproduces the broken account and requires three consecutive boots to heal it to exactly one copy" },
  { id: 'js/app.js:openGiftSheet', sites: 1, undriven: 'a REFUND of coins this device already deducted, on a failed send; not a payout' },
  /* Added 2026-09-02 with the sibling-writer sweep. startCook and queueCook now
     take the ingredients in one kvUpdate and claim the pot or the queue slot in
     a second, because carrying the pot array across the ingredient spend was
     restoring a dish collectDish had already banked. Two kv rows cannot ride one
     transaction, so the take-first ordering leaves exactly one losing case: the
     last pot fills between the two. This hands back what THIS call took, by
     recipe, and it is the only thing that can reach it. */
  { id: 'js/cooking.js:refundIngredients', sites: 1, undriven: 'a REFUND of the ingredients this call just spent, when the pot or the queue turned out to have no room; it can only ever return r.needs and only after payIngredients returned true, so it hands back exactly what was taken and nothing else' },
  { id: 'js/app.js:openSurveySheet', sites: 1, undriven: "one-time, gated on kv 'surveyDone' read before the grant" },
];

/* ===========================================================================
 * COVERAGE: derive the paying call sites from the source.
 * ======================================================================== */
const PAY = ['award', 'awardOnce', 'awardCapped', 'coinsAdd', 'boneDustAdd', 'grantCrate', 'grantGear',
  'grantCosmetic', 'grantConsumable', 'grantEgg', 'grantPet', 'grantIngredient', 'grantSeed',
  'grantPotion', 'addPetInstance'];

/* Strip prose FIRST and keep every newline while doing it. An earlier guard in
   this project passed because the word it looked for was sitting in a COMMENT
   while the real check had been deleted, and a strip that collapses a template
   literal onto one line reports call sites at the wrong line numbers, which is
   its own kind of lie. */
function stripProse(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length))
    .replace(/`(?:[^`\\]|\\.)*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g,
      m => m[0] + m.slice(1, -1).replace(/[^\n]/g, ' ') + m[0]);
}

const scanned = { files: 0, sites: 0 };
const found = new Map();   // action id -> [{ line, fn }]
for (const f of readdirSync(path.join(ROOT, 'js')).filter(n => n.endsWith('.js') && n !== 'changelog.js')) {
  const code = stripProse(readFileSync(path.join(ROOT, 'js', f), 'utf8')).split('\n');
  scanned.files++;
  const owners = [];
  code.forEach((ln, i) => {
    const m = ln.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)/)
      || ln.match(/^(?:export\s+)?(?:const|let)\s+(\w+)\s*=/);
    if (m) owners.push([i, m[1]]);
  });
  const ownerAt = i => {
    let name = '(top level)';
    for (const [ln, n] of owners) { if (ln <= i) name = n; else break; }
    return name;
  };
  code.forEach((ln, i) => {
    for (const p of PAY) {
      const re = new RegExp(`(?:^|[^\\w.])${p}\\s*\\(`, 'g');
      let m;
      while ((m = re.exec(ln))) {
        // the primitive's own definition is not a payout
        if (new RegExp(`function\\s+${p}\\s*\\(`).test(ln)) continue;
        // a NEGATIVE coin/dust argument is a spend, and a spend is not a payout
        if ((p === 'coinsAdd' || p === 'boneDustAdd') && /^\s*-/.test(ln.slice(m.index + m[0].length))) continue;
        scanned.sites++;
        const id = `js/${f}:${ownerAt(i)}`;
        if (!found.has(id)) found.set(id, []);
        found.get(id).push({ line: i + 1, fn: p });
      }
    }
  });
}

ok('CONTROL the scanner found paying call sites to grade (an empty sample is a failure)',
  scanned.sites >= 100 && found.size >= 40, `${scanned.sites} sites in ${found.size} actions across ${scanned.files} modules`);

const registered = new Map(ACTIONS.map(a => [a.id, a]));
const unregistered = [...found.keys()].filter(id => !registered.has(id));
ok('COVERAGE every paying call site belongs to a registered action that names its state transition',
  unregistered.length === 0,
  unregistered.length ? `\n     ${unregistered.map(id => `${id}  (pays at line${found.get(id).length > 1 ? 's' : ''} ${found.get(id).map(s => s.line).join(', ')}) — add a row to ACTIONS naming what changes state to earn this`).join('\n     ')}` : '');

const miscounted = [];
for (const a of ACTIONS) {
  const got = (found.get(a.id) || []).length;
  if (got !== a.sites) miscounted.push(`${a.id}  registered ${a.sites} paying site(s), source has ${got}${got ? ` (lines ${found.get(a.id).map(s => s.line).join(', ')})` : ''}`);
}
ok('COVERAGE no registered action has grown or lost a payout without being re-graded',
  miscounted.length === 0, miscounted.length ? `\n     ${miscounted.join('\n     ')}` : `${ACTIONS.length} actions, counts match`);

const noTransition = ACTIONS.filter(a => !a.undriven && (!a.transition || !a.authority));
ok('COVERAGE every driven action names BOTH its transition and its authority (SOP parts 1 and 2)',
  noTransition.length === 0, noTransition.map(a => a.id).join(', '));

const undriven = ACTIONS.filter(a => !a.drive);
const noReason = undriven.filter(a => !a.undriven);
ok('UNDRIVEN every action without a driver states why', noReason.length === 0, noReason.map(a => a.id).join(', '));
console.log(`\n     ${undriven.length} registered actions are NOT driven twice below. Printed every run so they cannot rot into "covered":`);
for (const a of undriven) console.log(`       ${a.id}\n         ${a.undriven}`);
console.log('');

/* ===========================================================================
 * REPEAT: perform each driven action twice, against a real IndexedDB.
 *
 * Twice SEQUENTIALLY is SOP part 5 as written. Twice CONCURRENTLY is the same
 * question asked of an app whose authority reads and reward writes used to sit
 * in different transactions: on 2026-08-17 every driven action below paid in
 * full on the overlapping second call while refusing the sequential one, which
 * is a farm that a sequential-only check reports as fixed.
 * ======================================================================== */
const srv = process.argv[2] ? null : await serveTree(ROOT);
const base = process.argv[2] || srv.url;
console.log(`URL UNDER TEST: ${base}`);
const { browser, page } = await boot(base);
await sleep(800);

const results = await page.evaluate(async () => {
  const [loot, game, poi, hunt, spires, garden, cooking, quests, social, db, nutrition, gear, energy] = await Promise.all([
    import('/js/loot.js'), import('/js/game.js'), import('/js/poi.js'), import('/js/hunt.js'),
    import('/js/spires.js'), import('/js/garden.js'), import('/js/cooking.js'), import('/js/quests.js'),
    import('/js/social.js'), import('/js/db.js'), import('/js/nutrition.js'), import('/js/gear.js'),
    import('/js/energy.js'),
  ]);
  const wallet = async () => ({ coins: await loot.coins(), dust: await loot.boneDust(), xp: await game.totalXp() });
  const diff = (a, b) => ({ coins: b.coins - a.coins, dust: b.dust - a.dust, xp: b.xp - a.xp });
  const moved = d => d.coins > 0 || d.dust > 0 || d.xp > 0;
  const ING = cooking.COMMON_INGREDIENT_IDS[0];
  let n = 0;
  const uniq = () => `sop${Date.now().toString(36)}${n++}`;

  /* Each driver: setup() puts the world in the state where the action is legal
     and hands back a handle; act(handle) performs it once; won(result) is the
     AUTHORITY'S OWN ANSWER about whether this attempt took the state.
     `won` is the load-bearing measure, not the coin delta: several of these
     payouts are randomised (a crate rolls its coins, a level-up can fire
     mid-run), so comparing two wallet deltas would be comparing dice. The
     authority answers yes exactly once or the action is farmable, and every
     payout in these functions is downstream of that answer.
     `count`, where a driver has one, is the deterministic thing that was
     actually handed over, so the concurrent case can also be checked in
     inventory terms rather than only in the authority's word. */
  const DRIVERS = {
    award: () => { const k = uniq(); return { act: () => game.award(k, 'quest', 25, 'sop'), won: r => r > 0 }; },
    awardCapped: () => { const p = uniq(); return { act: () => game.awardCapped(p, 'fight', 10, 'sop', 1), won: r => r > 0 }; },
    glutton: () => { const d = `2099-01-01`, s = n++; return { act: () => poi.claimGluttonWin(d, s), won: r => !!r }; },
    denWin: () => {
      const den = { id: uniq(), name: 'SOP Den', reward: { xp: 50, coins: 90, crate: 'daily' }, tier: 2 };
      return { act: () => poi.claimDenWin(den, '2099-01-02', '2099-W01'), won: r => !!r };
    },
    miniWin: () => {
      const mini = { id: uniq(), name: 'SOP Mini', reward: { xp: 20, coins: 30, crate: 'daily', dust: 5 } };
      return { act: () => poi.claimMiniWin(mini, '2099-01-02'), won: r => !!r };
    },
    spawn: () => { const s = { id: uniq(), type: 'coins' }; return { act: () => hunt.collectSpawn(s, '2099-01-02'), won: r => !!r }; },
    denLoot: () => {
      const key = uniq();
      const pick = gear.GEAR_ITEMS.find(g => true);
      return {
        setup: async () => {
          for (const r of await db.db.all('inv')) if (r.kind === 'gear' && r.gearId === pick.id) await db.db.del('inv', r.id);
          await db.kvSet('denloot', [{ key, den: 'SOP', choices: [pick.id], ts: Date.now() }]);
          return pick.id;
        },
        act: id => poi.claimDenLoot(key, id),
        won: r => !!r,
        count: async () => (await loot.ownedGearIds()).has(pick.id) ? 1 : 0,
      };
    },
    friendBattle: () => { const f = uniq(); return { act: () => game.claimFriendBattle(f, true, '2099-01-02'), won: r => !!r.firstToday }; },
    quest: () => {
      const q = { id: uniq(), name: 'SOP quest', coins: 100, dust: 15, crate: 'daily' };
      /* NOT `!!r`. claimQuest gained a THIRD return shape with the claim cap:
         null (nothing paid), the xp row (paid), and { capped: true } (refused
         because the period is spent). `{capped:true}` is TRUTHY, so `!!r` scored
         a refusal as a win and reported pay:{coins:0}. It is green today only
         because this driver claims exactly QUEST_N.day distinct ids and so lands
         ON the cap rather than past it; a fourth quest here would have made it
         lie. Sitting on a boundary is not passing.
         { dayGuard } is now the FOURTH shape (the day-guard refusal, voiced
         instead of null) and is likewise a refusal, never a win. */
      return { act: () => quests.claimQuest('2099-01-02', q, 'day'), won: r => !!r && !r.capped && !r.dayGuard };
    },
    questAll: () => {
      const d = `2099-02-${String(1 + (n++ % 27)).padStart(2, '0')}`;
      const qs = [{ id: 'a' }, { id: 'b' }];
      const rows = qs.map(q => ({ key: `quest-${d}-${q.id}` }));
      return {
        setup: async () => { for (const r of rows) await db.db.put('xp', { ...r, type: 'quest', xp: 25, label: 'x', date: d, ts: Date.now() }); },
        act: () => quests.claimAllBonusIfDue(d, qs),
        won: r => !!r,
      };
    },
    crate: () => ({
      setup: async () => (await loot.grantCrate('golden', 'sop')).id,
      act: id => loot.openCrate(id).catch(e => ({ err: String(e.message || e) })),
      won: r => !r.err,
      count: async () => (await loot.unopenedCrates()).filter(c => c.source === 'sop').length,
    }),
    egg: () => ({
      setup: async () => (await loot.grantEgg('sop', 0)).id,
      act: id => loot.hatchEgg(id).catch(e => ({ err: String(e.message || e) })),
      won: r => !!r.ready,
      count: async () => (await loot.petInstances()).length,
    }),
    redeem: () => ({
      setup: async () => { await db.kvSet('redeemed', []); await db.db.del('kv', 'redeemed:BONEHEADZ'); },
      act: () => loot.redeemCode('BONEHEADZ'),
      won: r => !!r.ok,
    }),
    tribute: () => {
      const id = uniq(), now = Date.now();
      return {
        setup: async () => { await db.kvSet('spires', { [id]: { claimedAt: now - 5 * 864e5, tendedAt: now - 864e5, collectedAt: now - 2 * 864e5, level: 1, meta: { name: 'SOP', lat: 0, lng: 0 } } }); },
        act: async () => { const r = await spires.collectTribute(id); if (r.ok) { await loot.coinsAdd(r.coins); await loot.boneDustAdd(r.dust); } return r; },
        won: r => !!r.ok,
      };
    },
    harvest: () => ({
      setup: async () => { await db.kvSet('garden', { seeds: {}, plotsOwned: 3, plots: [{ ing: ING, plantedAt: 1, readyAt: 2, watered: false }, null, null], composts: { date: '', used: 0 } }); },
      // a FIXED rand: harvestYield rolls a 10% bumper, and a check whose
      // expected count is a dice roll is a check that goes red on its own
      act: () => garden.harvestPlot(0, Date.now(), () => 0.99),
      won: r => !!r.ok,
      count: async () => (await cooking.ingredients())[ING] || 0,
    }),
    dish: () => ({
      setup: async () => { await db.kvSet('cooking', [{ recipeId: cooking.RECIPES[0].id, startedAt: 1, readyAt: 2 }]); await db.kvSet('pantry', []); },
      act: () => cooking.collectDish(0),
      won: r => !!r,
      count: async () => (await cooking.pantryDishes()).length,
    }),
    /* One pot, one finished dish in it, one paid-for cook in the line: the state
       the Kitchen's 1000ms tick meets every time a pot comes good. `count` is the
       Pantry, because a dish pays no currency and a wallet delta would grade
       nothing here. */
    advance: () => ({
      setup: async () => {
        const done = cooking.RECIPES.find(r => !r.potion);
        const next = cooking.RECIPES.find(r => !r.potion && r.id !== done.id) || done;
        await db.kvSet('potsOwned', 1);
        await db.kvSet('cooking', [{ recipeId: done.id, startedAt: 1, readyAt: 2 }]);
        await db.kvSet('cookq', [{ recipeId: next.id }]);
        await db.kvSet('pantry', []);
      },
      act: () => cooking.advanceQueue(),
      won: r => r.length > 0,
      count: async () => (await cooking.pantryDishes()).length,
    }),
    /* A GATE rather than a payout: what it hands over is the right to a staked
       fight, so `count` is the charge actually taken off the meter. Grading it
       on the wallet would grade nothing, and the CONTROL row would then pass on
       a driver that never reached the state. */
    pitCharge: () => ({
      /* fromSteps pinned at the cap, so a refreshPitEnergy anywhere in this run
         pays no step Vigor into the meter mid-measurement. A sibling probe read
         "two arenas, one charge" on a healthy build for exactly that reason. */
      setup: async () => { await db.kvSet('pitEnergy', { date: nutrition.dateKey(), freeUsed: energy.FREE_FIGHTS - 1, vigor: 0, fromSteps: energy.STEP_VIGOR_CAP, fromLog: 0 }); },
      act: () => energy.spendPitFight(),
      won: r => !!r.ok,
      count: async () => ((await db.kvGet('pitEnergy', {})) || {}).freeUsed || 0,
    }),
    /* The payload carries a PET as well as currency, because the admin
       make-good arm added 2026-08-21 hands over a species by id and a species is
       the one thing here that a second delivery could duplicate in INVENTORY
       while paying no coins at all. `count` is copies of that species, so the
       concurrent row grades what actually landed in the Stable rather than only
       the authority's word. C3 is a plain catalogue pet: the exclusive is not
       needed to prove the arm and must not be minted by a test. */
    grant: () => {
      const k = uniq();
      return {
        act: () => social.__testApplyGrant({ key: k, type: 'crewreward', ts: Date.now(), payload: { coins: 100, dust: 20, pet: 'C3' } }),
        won: r => r === true,
        count: async () => (await loot.petInstances()).filter(x => x.sp === 'C3').length,
      };
    },
    levelRewards: () => { const L = 200 + (n++ % 40); return { act: () => game.grantLevelRewards(L - 1, L), won: r => r.crates > 0 }; },
    /* A BATCH, not a single claim: evaluateBadges walks every badge and mints
       the ones now earned, so two overlapping calls legitimately SPLIT the set
       between them and both come back non-empty. "Exactly one wins" is the
       wrong question here; "the set is paid once in total" is the right one, so
       these two are graded on the total handed over instead. */
    badges: () => ({
      setup: async () => { for (const r of await db.db.all('xp')) if (r.type === 'badge') await db.db.del('xp', r.key); },
      act: () => game.evaluateBadges(),
      won: r => r.length > 0,
      batch: true,
    }),
    streak: () => {
      /* ONE entry, reused. A fresh log row every call would legitimately pay
         its own log-<id> XP and mask what this driver is actually about. */
      const e = { id: uniq(), date: nutrition.dateKey(), meal: 0, name: 'SOP', kcal: 10, p: 1, c: 1, f: 1, ts: Date.now() };
      return {
        setup: async () => { for (const r of await db.db.all('xp')) if (r.type === 'streakms') await db.db.del('xp', r.key); await db.db.put('log', e); },
        act: () => game.onFoodLogged(e, { targets: { kcal: 2000, p: 20 }, entriesForDate: [e] }),
        won: r => r.xp > 0,
        batch: true,   // a composite of many awards, same reason as badges
      };
    },
  };

  const out = {};
  for (const [name, make] of Object.entries(DRIVERS)) {
    const row = { name };
    try {
      // ---- SEQUENTIAL: do it, then do it again on the satisfied state ----
      let d = make();
      let handle = d.setup ? await d.setup() : undefined;
      const w0 = await wallet(); const k0 = d.count ? await d.count() : 0;
      const first = await d.act(handle);
      const w1 = await wallet(); const k1 = d.count ? await d.count() : 0;
      row.firstWon = !!d.won(first);
      row.firstPay = diff(w0, w1);
      row.firstCount = k1 - k0;
      const second = await d.act(handle);
      const w2 = await wallet(); const k2 = d.count ? await d.count() : 0;
      row.secondWon = !!d.won(second);
      row.secondPay = diff(w1, w2);
      row.secondCount = k2 - k1;

      // ---- CONCURRENT: two overlapping attempts on one satisfied state ----
      d = make();
      handle = d.setup ? await d.setup() : undefined;
      const cw0 = await wallet(); const ck0 = d.count ? await d.count() : 0;
      const both = await Promise.allSettled([d.act(handle), d.act(handle)]);
      row.concurrentWins = both.filter(x => x.status === 'fulfilled' && d.won(x.value)).length;
      row.concurrentRejected = both.filter(x => x.status === 'rejected').length;
      row.concurrentPay = diff(cw0, await wallet());
      row.concurrentCount = (d.count ? await d.count() : 0) - ck0;
      row.hasCount = !!d.count;
      row.batch = !!d.batch;
    } catch (e) {
      row.error = String(e && e.message || e);
    }
    out[name] = row;
  }
  return out;
});

const moved = d => d.coins > 0 || d.dust > 0 || d.xp > 0;
for (const [name, r] of Object.entries(results)) {
  if (r.error) { ok(`REPEAT ${name}`, false, `driver threw: ${r.error}`); continue; }
  /* CONTROL first: a driver that never reaches the rewarded state would pass
     every repeat check below by paying nothing twice. */
  ok(`CONTROL ${name} the FIRST attempt won the state and actually handed something over`,
    r.firstWon && (moved(r.firstPay) || r.firstCount > 0),
    JSON.stringify({ won: r.firstWon, pay: r.firstPay, count: r.firstCount }));
  ok(`REPEAT ${name} the SECOND attempt on the already-satisfied state wins nothing and pays nothing`,
    !r.secondWon && !moved(r.secondPay) && r.secondCount <= 0,
    JSON.stringify({ won: r.secondWon, pay: r.secondPay, count: r.secondCount }));
  if (r.batch) {
    ok(`REPEAT ${name} TWO OVERLAPPING attempts hand over ONE lot in total (a batch: the two may split the set, they may not repeat it)`,
      r.concurrentWins >= 1 && r.concurrentPay.coins === r.firstPay.coins
      && r.concurrentPay.dust === r.firstPay.dust && r.concurrentPay.xp === r.firstPay.xp,
      JSON.stringify({ wins: r.concurrentWins, oneAttempt: r.firstPay, twoAtOnce: r.concurrentPay }));
  } else {
    ok(`REPEAT ${name} TWO OVERLAPPING attempts: exactly one takes the state`,
      r.concurrentWins === 1,
      JSON.stringify({ wins: r.concurrentWins, rejected: r.concurrentRejected, pay: r.concurrentPay, count: r.concurrentCount }));
  }
  if (r.hasCount) {
    ok(`REPEAT ${name} TWO OVERLAPPING attempts hand over one lot, not two`,
      r.concurrentCount === r.firstCount,
      JSON.stringify({ oneAttempt: r.firstCount, twoAtOnce: r.concurrentCount }));
  }
}

/* ===========================================================================
 * CEILING: DISTINCT keys against ONE shared ceiling.
 *
 * WHY THIS EXISTS, and it is the half whose absence let three bugs ship. Every
 * row above races THE SAME KEY, and the same key is precisely what addIfAbsent
 * already makes safe: one row, one winner, by construction. This file had never
 * once raced two DIFFERENT keys against a resource they SHARE. So a per-item
 * claim that is perfectly atomic could sit in front of a ceiling that is not,
 * and the whole audit stayed green over it. Measured in the round-9 sweep on
 * 2026-09-01, against origin/main 3d4b208c:
 *   the quest PERIOD cap  a weekly cap of 3 with one prior claim paid FOUR when
 *                         three DISTINCT quest ids were claimed at once: +450
 *                         coins, +210 XP, 2 golden crates and a Vigor Draught.
 *                         A monthly cap of 2 paid 3. Reachable in ONE tab with
 *                         no devtools, because the Claim handler is async and
 *                         the button is neither disabled nor debounced.
 *   the Pit charge        with one free fight left, two overlapping spends both
 *                         returned ok, so one charge opened TWO staked arenas.
 *
 * TWO SHAPES, and both are here because they fail differently. A shared COUNT is
 * a ceiling that several distinct claims are each measured against. A shared
 * GATE is one indivisible thing several distinct callers want. The count leaks
 * money; the gate leaks a fight. Neither is reachable by repeating one key.
 *
 * EVERY ROW HAS A CONTROL BESIDE IT, on the same code in the same session, with
 * the ceiling NOT reached: the same N attempts must then pay the FULL set. A
 * function that refused everything, or a driver that never reached the paying
 * state, scores a perfect pass without it. Both sample sets are non-empty by
 * assertion rather than by hope: a suite here passed vacuously once because
 * Math.min of nothing is Infinity.
 * ======================================================================== */
const ceiling = await page.evaluate(async () => {
  const [quests, energy, loot, db, nutrition] = await Promise.all([
    import('/js/quests.js'), import('/js/energy.js'), import('/js/loot.js'),
    import('/js/db.js'), import('/js/nutrition.js'),
  ]);

  // ---- a shared COUNT: the quest period cap, claimed with DISTINCT ids ----
  const cap = quests.QUEST_N.week;
  const ids = quests.WEEKLY_POOL.map(q => q.id);
  const clear = async pk => { for (const r of await db.db.all('xp')) if (String(r.key).startsWith(`quest-${pk}-`)) await db.db.del('xp', r.key); };
  const seed = async (pk, n) => { for (let i = 0; i < n; i++) await db.db.put('xp', { key: `quest-${pk}-${ids[i]}`, type: 'quest', xp: 25, label: 'sop seed', date: pk, ts: Date.now() }); };
  /* All at once, and DISTINCT: the same id would be refused by the per-quest
     ledger key, which is the protection that was already there and already
     working. `capped` and `dayGuard` are refusals, never wins, same reading the
     quest driver above takes. */
  const claimAll = (pk, picks) => Promise.all(picks.map(id => quests.claimQuest(pk, { id, name: 'sop ceiling', coins: 150 }, 'week')));
  const paidOf = rs => rs.filter(r => !!r && !r.capped && !r.dayGuard).length;
  const rowsIn = async pk => quests.claimsThisPeriod(await db.db.all('xp'), pk, 'week');

  // both keys are FUTURE periods, for the same reason the quest driver uses one:
  // periodClosed refuses a period that has CLOSED and leaves a future one alone
  const AT = '2099-03-01';
  await clear(AT); await seed(AT, cap - 1);
  const c0 = await loot.coins();
  const atPaid = paidOf(await claimAll(AT, ids.slice(cap - 1, cap - 1 + cap)));
  const count = { cap, paid: atPaid, rows: await rowsIn(AT), coins: await loot.coins() - c0 };

  const FREEPK = '2099-03-08';
  await clear(FREEPK);
  const c1 = await loot.coins();
  const freePaid = paidOf(await claimAll(FREEPK, ids.slice(0, cap)));
  const countControl = { paid: freePaid, rows: await rowsIn(FREEPK), coins: await loot.coins() - c1 };

  // ---- a shared GATE: one Pit charge, wanted by several overlapping taps ----
  // fromSteps at the cap: see the pitCharge driver, a refresh must not top the meter up under the measurement
  const setPit = free => db.kvSet('pitEnergy', { date: nutrition.dateKey(), freeUsed: energy.FREE_FIGHTS - free, vigor: 0, fromSteps: energy.STEP_VIGOR_CAP, fromLog: 0 });
  const spendThrice = () => Promise.all([energy.spendPitFight(), energy.spendPitFight(), energy.spendPitFight()]);
  const meter = async () => ((await db.kvGet('pitEnergy', {})) || {}).freeUsed || 0;
  await setPit(1);
  const gate = { ok: (await spendThrice()).filter(r => r.ok).length, freeUsed: await meter(), max: energy.FREE_FIGHTS };
  await setPit(energy.FREE_FIGHTS);
  const gateControl = { ok: (await spendThrice()).filter(r => r.ok).length, freeUsed: await meter() };

  return { count, countControl, gate, gateControl };
});

ok('CEILING quest a period already at cap-1 pays exactly ONE of several DISTINCT quest ids claimed at once',
  ceiling.count.paid === 1 && ceiling.count.rows === ceiling.count.cap,
  JSON.stringify({ cap: ceiling.count.cap, claimedAtOnce: ceiling.count.cap, paid: ceiling.count.paid, rowsAfter: ceiling.count.rows, coins: ceiling.count.coins }));
ok('CONTROL quest the SAME distinct ids on a virgin period all pay, so the row above is not passing by refusing everything',
  ceiling.countControl.paid === ceiling.count.cap && ceiling.countControl.rows === ceiling.count.cap,
  JSON.stringify({ paid: ceiling.countControl.paid, rowsAfter: ceiling.countControl.rows, coins: ceiling.countControl.coins }));
ok('CEILING pit ONE remaining charge is taken by exactly one of three overlapping spends',
  ceiling.gate.ok === 1 && ceiling.gate.freeUsed === ceiling.gate.max,
  JSON.stringify({ ok: ceiling.gate.ok, freeUsedAfter: ceiling.gate.freeUsed, freeMax: ceiling.gate.max }));
ok('CONTROL pit three charges in hand ARE taken by three overlapping spends, so the row above is not passing on a tapped-out account',
  ceiling.gateControl.ok === 3 && ceiling.gateControl.freeUsed === ceiling.gate.max,
  JSON.stringify(ceiling.gateControl));

/* ===========================================================================
 * NO-OP: an action that decides it is owed NOTHING must not damage the record
 * it consulted.
 *
 * Every kv-backed action above answers "is a payout owed?" from inside one
 * kvUpdate transaction, and says no by returning `undefined` from its updater.
 * kvUpdate honours that by writing nothing. Drop the `if (next !== undefined)`
 * and the no-op instead stores `v: undefined` over the whole record: measured
 * 2026-08-17 on this tree, a SECOND collectTribute on an emptied tower left kv
 * 'spires' undefined (every tower the player holds, not just the one), and a
 * harvest of an empty bed left kv 'garden' undefined (seeds, plots owned and
 * all three beds).
 *
 * THE REPEAT ROWS ABOVE CANNOT SEE THIS, and that is why these two exist. They
 * grade what the second attempt PAID, and the second attempt correctly pays
 * nothing while wiping the record on its way out. Both audits in this repo ran
 * green on the broken version. So the measure here is the RECORD, before and
 * after, not the payout: the tower count must be unchanged and the garden must
 * still be a garden.
 * ======================================================================== */
const noop = await page.evaluate(async () => {
  const [spires, garden, db] = await Promise.all([
    import('/js/spires.js'), import('/js/garden.js'), import('/js/db.js')]);
  const now = Date.now();
  const id = 'sop-noop';
  await db.kvSet('spires', { [id]: { claimedAt: now - 5 * 864e5, tendedAt: now - 864e5, collectedAt: now - 2 * 864e5, level: 1, meta: { name: 'SOP', lat: 0, lng: 0 } } });
  const first = await spires.collectTribute(id);
  const towersAfterFirst = Object.keys((await db.kvGet('spires', null)) || {}).length;
  const second = await spires.collectTribute(id);         // the no-op
  const rawSpires = await db.kvGet('spires', '(no row at all)');
  const towersAfterSecond = rawSpires && typeof rawSpires === 'object' ? Object.keys(rawSpires).length : String(rawSpires);

  await db.kvSet('garden', { seeds: { x: 1 }, plotsOwned: 3, plots: [null, null, null], composts: { date: '', used: 0 } });
  const h = await garden.harvestPlot(0, Date.now());      // an empty bed: the no-op
  const rawGarden = await db.kvGet('garden', '(no row at all)');
  const plotsAfter = rawGarden && typeof rawGarden === 'object' ? (rawGarden.plots || []).length : String(rawGarden);
  return { first: !!first.ok, second: !!second.ok, towersAfterFirst, towersAfterSecond, harvest: !!h.ok, plotsAfter };
});
/* CONTROL first: if the tribute never paid, the no-op below is not a no-op and
   both rows would pass by never reaching the state they are about. */
ok('CONTROL noop the tribute actually paid once and the tower survived it, so the second call really is the no-op',
  noop.first === true && noop.second === false && noop.towersAfterFirst === 1,
  JSON.stringify({ firstPaid: noop.first, secondPaid: noop.second, towersAfterFirst: noop.towersAfterFirst }));
ok("NO-OP collectTribute on an already-emptied tower leaves kv 'spires' exactly as it was, not undefined",
  noop.towersAfterSecond === 1, `towers after the no-op: ${noop.towersAfterSecond} (expected 1)`);
ok("NO-OP harvestPlot on an empty bed leaves kv 'garden' a garden, not undefined",
  noop.harvest === false && noop.plotsAfter === 3, `harvest ok: ${noop.harvest}, plots after: ${noop.plotsAfter} (expected false and 3)`);

const driven = ACTIONS.filter(a => a.drive).map(a => a.drive);
const missingDrivers = driven.filter(d => !(d in results));
ok('CONTROL every action that claims a driver actually ran one', missingDrivers.length === 0, missingDrivers.join(', '));
ok('CONTROL the repeat half examined a non-empty sample', Object.keys(results).length >= 15,
  `${Object.keys(results).length} drivers`);

await browser.close();
if (srv) srv.close();

/* PROVE-RED, every line below CONFIRMED 2026-08-17 in a throwaway copy of this
 * tree (/tmp/red), one reintroduction at a time, with the tree restored between
 * each. The clean tree runs 75 checks and exits 0. Each entry is the single edit
 * that puts the bug back, and the rows it turns red with the measured overpay:
 *
 *  js/game.js awardOnce -> db.get then db.put, as it was
 *      10 rows red. award, awardCapped, glutton (280 coins + 40 dust for ONE
 *      appearance), denWin, miniWin, spawn (120 coins for one spawn),
 *      friendBattle, quest (200 coins + 30 dust for one quest), questAll, grant
 *      (200 coins + 40 dust for one grant key): "TWO OVERLAPPING attempts:
 *      exactly one takes the state", wins 2.
 *  js/loot.js openCrate -> find the row in inventory(), delete it at the end
 *      REPEAT crate, wins 2, 40 coins out of one crate.
 *  js/loot.js hatchEgg -> db.del instead of db.take
 *      REPEAT egg, wins 2.
 *  js/loot.js redeemCode -> drop the db.addIfAbsent('kv', 'redeemed:<code>') claim
 *      REPEAT redeem, wins 2, 100 coins for one code.
 *  js/spires.js collectTribute -> spireState() then kvSet, as it was
 *      REPEAT tribute, wins 2, 240 coins + 32 dust for one lot of tribute.
 *  js/game.js claimFriendBattle -> db.get then award, returning firstToday:true
 *      REPEAT friendBattle, wins 2 (the caller is what pays the 25 coins).
 *  js/game.js grantLevelRewards -> the `claimed` flag, get then put
 *      REPEAT levelRewards, wins 2, 2290 coins + 300 dust for ONE level.
 *  js/garden.js harvestPlot -> grant then clear, as it was
 *      REPEAT harvest, wins 2, and "hand over one lot" 4 ingredients vs 2.
 *  js/cooking.js collectDish -> readSlots then writeSlots
 *      REPEAT dish, wins 2, and "hand over one lot" 2 dishes vs 1.
 *  js/social.js applyPayload -> db.get then awardOnce
 *      REPEAT grant, wins 2, 200 coins + 40 dust for one grant key.
 *  js/db.js kvUpdate -> `os.put(...)` unconditionally, dropping the
 *      `if (next !== undefined)` skip
 *      the two NO-OP rows, and ONLY those two: kv 'spires' reads undefined
 *      after the second collect (every tower gone, not just the emptied one)
 *      and kv 'garden' reads undefined after harvesting an empty bed. Every
 *      REPEAT row stays green, which is the point of the pair: the second
 *      attempt pays nothing while destroying the record on its way out.
 *
 *  COVERAGE, the half that keeps the class fixed:
 *    add `export async function sneakyPayout() { await coinsAdd(9999); }` to
 *      js/hunt.js -> "every paying call site belongs to a registered action",
 *      naming js/hunt.js:sneakyPayout and the line it pays on.
 *    add one coinsAdd(500) inside collectSpawn -> "no registered action has
 *      grown or lost a payout", registered 3 sites, source has 4.
 *    delete the collectSpawn row from ACTIONS -> "every paying call site
 *      belongs to a registered action", naming js/hunt.js:collectSpawn.
 *
 * PROVE-RED for the round-9 rows, CONFIRMED 2026-09-01 in a `cp -R` throwaway
 * copy of the PRE-FIX tree (origin/main 3d4b208c) with only this file dropped
 * in, one bug at a time. Nothing in the working tree was checked out.
 *
 *  js/cooking.js advanceQueue as it was (readQueue -> readSlots -> await the
 *      grant -> writeSlots)
 *      REPEAT advance "TWO OVERLAPPING attempts: exactly one takes the state",
 *      wins 2, and "hand over one lot, not two", 2 Pantry dishes from ONE cook.
 *  js/energy.js spendPitFight as it was (kvGet -> await -> kvSet)
 *      REPEAT pitCharge, wins 2 while the meter moved by 1, so one free fight
 *      bought two staked arenas. CEILING pit, THREE spends of ONE charge all
 *      returned ok. CONTROL pit red too and for the bug's own reason: three
 *      charges in hand were all spent and the meter moved by 1, not 3.
 *  js/quests.js claimQuest as it was (db.all('xp') -> claimsThisPeriod -> award)
 *      CEILING quest, paid 3 of 3 against a period already at cap-1: the ledger
 *      ended holding 5 claims in a period whose ceiling is 3, +474 coins. Every
 *      REPEAT row stayed green, and that is the whole reason this section
 *      exists: the per-quest key was never the broken half.
 *
 * THE CONTROLS, and what actually needs them. Refusing everything is caught by
 * the CEILING rows on their own (`return { capped: true, cap, period }` at the
 * top of claimQuest turns CEILING quest red at paid 0; `return { ok: false }`
 * from spendPitFight turns CEILING pit red at ok 0), so that is not the case
 * they earn their place on. This is:
 *      cap := already + 1, a ceiling that only ever lets ONE more through
 *      CEILING quest passes PERFECTLY, paid 1 of 3 with the ledger on 3. It is
 *      CONTROL quest that goes red, paid 1 where three virgin claims must pay
 *      3. A ceiling row alone cannot tell "held the line" from "let nobody
 *      through", and a lock that never opens is not a fixed cap.
 */
console.log(`\n${fails ? `REWARD SOP AUDIT FAILED (${fails})` : 'REWARD SOP VERIFIED'}`);
process.exit(fails ? 1 : 0);
