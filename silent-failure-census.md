# Silent-failure census, "looks saved, wasn't"

Branch gwart/silentfail, base origin/main = ff90862 (v391). Static sweep only: no tests run, no browser driven.
Date: 2026-08-18.

## 0. Coverage and counts

- Files in js/: 46. Graded: 44. Not graded: js/paddock.js and js/paddock-cards.js (off limits per standing rules; they were not read).
- Persistence write sites enumerated by grep (db.put / kvSet / db.del / importAll / exportAll, outside js/db.js): 272 across 13 files. Every one of those 13 files was read around its writes.
- Files with no persistence writes and no network calls (verified by grep, skimmed): bosses, gear, pets, graverise, glutton, changelog, gateintro, hollow-beds, hollow-scene, hollow-art, map, walk, geo, names, nutrition, labelparse, fx, crate-fx, wraith-fx, haptics, icons-pack, petanim, native, scanner, ocr, pit. Nothing to report there beyond what their callers in app.js do.
- There is NO user-visible global failure handler: the `unhandledrejection` listener in js/analytics.js:208 only queues telemetry. So every uncaught rejection inside a click handler is invisible to the player. This fact multiplies most findings below.

Counts of findings by primary category (certain / suspected):

| Category | Certain | Suspected |
|---|---|---|
| LOST-WRITE | 13 | 2 |
| OPTIMISTIC-UI (success shown on unconfirmed op) | 4 | 1 |
| SILENT-SWALLOW | 4 | 0 |
| UNAWAITED | 1 family | 1 family |
| NO-DEADLINE (not already covered on gwart/offline) | 0 | 1 |
| Covered by gwart/offline, listed in section 3 | 6 groups | - |

The dominant systemic shape, worth naming once because it repeats in five modules: **spend or mark first, grant after, no transaction, and a caller with no try/catch**. IndexedDB writes here go through js/db.js `tx()` which rejects correctly; the loss happens in the multi-write sequences above it. A quota-full device (the exact regime the v373 meal fix was written for, measured ~2.4MB/year growth) makes any single put in these sequences fail.

## 1. Ranked findings

### Tier 1: money, XP, items or logged food lost or silently duplicated

**1. The daily wheel pays with words, not writes.** js/wheel.js:213-217 and 274. CERTAIN. Categories: SILENT-SWALLOW + LOST-WRITE + OPTIMISTIC-UI.
`commit()` writes `wheelLastDate` FIRST, then runs `prize.grant(rng)`; the caller wraps commit in `try { ... } catch { /* grant best-effort */ }` and then spins the wheel and shows the reveal regardless. Player taps SPIN, the grant write fails (or the date write fails and the grant never runs), the wheel still lands on "You won a Golden Crate" with a COLLECT button, no crate exists, and the day's spin is consumed. This is the single clearest "told you succeeded, didn't" in the codebase.

**2. Level-up rewards are marked claimed before they are paid.** js/game.js:152-171 (`grantLevelRewards`), the `row.claimed = true; await db.put('xp', row)` at 157-158 commits before `coinsAdd`/`grantCrate`/`boneDustAdd`/`grantEgg`. CERTAIN. LOST-WRITE.
Player crosses a level, the claimed flag lands, the coin write fails, the rejection dies in whatever uncaught handler triggered the XP award; the celebration never shows and every retry pays nothing because the ledger says claimed. The level's coins, crate, and any milestone dust/egg are permanently gone.

**3. Quest rewards, same shape.** js/quests.js:233-247 (`claimQuest`: `award()` ledger row first, then coins/crate/dust/item/ingredient) and 253-257 (`claimAllBonusIfDue`). Caller js/app.js:2953 has no try/catch. CERTAIN. LOST-WRITE.
Player taps Claim on a finished quest, the ledger row commits, `coinsAdd` fails, no toast appears, and reopening the quest list shows it claimed with nothing paid, forever.

**4. Hatching deletes the egg before granting the pet.** js/loot.js:294-310 (`hatchEgg`: `db.del('inv', row.id)` at 300, `addPetInstance` at 309, which is itself four more writes). Caller js/app.js:10505 has no try/catch. CERTAIN. LOST-WRITE.
Player walks 8,000 steps, taps Hatch, the egg row is deleted, the pet-instance write fails, no reveal opens and the egg and pet are both gone with no message.

**5. Spire tribute is consumed in one module and paid in another.** js/spires.js:261-271 (`collectTribute` stamps `collectedAt` and commits) plus js/app.js:14253-14257 (caller then does `coinsAdd`/`boneDustAdd`, uncaught). CERTAIN. LOST-WRITE.
Player taps their tower to collect days of tribute, the collected stamp commits, the coin write fails, the toast never shows, and the tribute is gone unpaid.

**6. Every coin/dust purchase spends before it grants.** js/loot.js: `buyDropItem` 70-71 (up to 3,000 coins), `buyShopItem` 903-906, `buyWeapon` 953-955 (up to 6,000 coins + 350 dust), `buyWithDust` 213-217. All callers are catchless: js/app.js:6097, 6115, 6134, 6148, 10630, 10648. CERTAIN. LOST-WRITE.
Player confirms the two-tap buy, the debit commits, the grant put fails, the handler dies before any toast, the button stays disabled or resets, and the coins are gone with nothing bought. (`applyTransmog`'s dust spend has the safer order: it banks `markPaid` before charging.)

**7. A saved meal can still be silently duplicated, around the v373 guard.** js/app.js:5546-5548. CERTAIN. LOST-WRITE (duplication direction).
The v373 fix guards only `db.put('log', e)`; the very next awaits (`persistFoodUse`, `onFoodLogged`) sit outside the try. Player taps Add, the meal write SUCCEEDS, the foods/xp write fails, the sheet stays open with no message, they tap Add again, and a second log row with a fresh id commits: the diary now silently holds the meal twice.

**8. Salvage destroys the item before paying the dust.** js/loot.js: `disenchantGear` 171-175, `salvagePet` 186-201, `salvageInstance` 544-571 (instance list saved minus the pet, bank/bond cleanup, THEN `boneDustAdd`). Callers js/app.js:10251, 10574, 10586, 12629 catchless. CERTAIN. LOST-WRITE.
Player melts a shiny pet after the double-confirm, the pet is removed, the dust write fails, no toast, pet gone, zero dust.

**9. Consumables are deleted before their effect lands.** js/loot.js:1255-1264 (`activateBattleCharm`: charm row deleted, then buffs kvSet) and js/app.js:10525 (`consumeConsumable('vigor')` then `addVigor`). CERTAIN. LOST-WRITE.
Player drinks a Vigor Draught, the inv row is deleted, the pitEnergy write fails, no vigor is added and no message shows.

**10. Crate opening grants, then deletes, then pays, in the wrong order to fail safely.** js/loot.js:834-871 (`openCrate`: per-roll grants commit first, `db.del` of the crate at 869, `coinsAdd` at 870), caller js/app.js:10513 catchless. CERTAIN. LOST-WRITE, both directions.
If the delete fails after grants, the crate is still in the backpack and reopening double-grants (dupes convert to coins, an unbounded coin faucet on a persistently failing delete); if the final `coinsAdd` fails, the crate's coins vanish. Either way the reveal never opens and the button stays dead.

**11. Choosing a boss drop removes the offer before granting the gear.** js/poi.js:475-480 (`claimDenLoot`: pending entry kvSet-removed at 479, `grantGear` at 480). CERTAIN. LOST-WRITE.
Player picks their gear piece from the den drop, the pending offer is deleted, the gear put fails, and the earned drop is gone.

**12. Breeding consumes the pet before charging or crediting.** js/loot.js:397-427 (`breedPets`: `savePetInstances` commits the destroyed parent and the lineage bump, then dust, cooldown, bank, bond writes follow one at a time). Caller js/app.js:12658 catchless. CERTAIN. LOST-WRITE (mixed directions: a failure after the instance save can leave the fed pet destroyed with dust never charged, or leave stale bank/bond entries).

**13. The rest of the award-ledger-first family.** js/poi.js:398-471 (`claimDenWin`), 539-545 (`claimMiniWin`), 635-671 (`claimGluttonWin`), js/hunt.js:163-171 (`collectSpawn`), js/game.js:115-123 (`claimFriendBattle`, whose coins are paid separately by the caller at js/app.js:16165). CERTAIN. LOST-WRITE.
Same sentence each time: the win is recorded on the idempotent ledger, the payout writes come after, a failure between them makes the reward unclaimable forever, and no caller catches.

### Tier 2: success reported on a failure

**14. "Cloud backup on. Your progress is safe." with the push swallowed.** js/app.js:9088-9091 (`#cbOn`), and the same shape at 9075-9082 (`#goOnlineBtn`: "Your progress is now backed up.") and 7323-7325 ("You're online!"). `social.pushBackup(...).catch(() => {})` immediately before the toast. CERTAIN. OPTIMISTIC-UI.
Player turns cloud backup on while the Worker is unreachable, the push fails silently, and the app asserts their progress is safe when no backup exists.

**15. The native Export button asserts auto-cloud-safety it never checks.** js/app.js:9190 ("Your progress is auto-saved to the cloud") plus js/social.js:888-899 (`autoSync` ignores `pushBackup` returning false, forever; `backupAt` goes stale and nothing ever reads it to warn). CERTAIN. OPTIMISTIC-UI / SILENT-SWALLOW.
A native player whose backups have been failing for months taps Export and is told their progress is already safe; there is no path anywhere that surfaces a stale `backupAt`.

**16. "All notifications on." when scheduling threw.** js/app.js:9106-9115 (`applyNotifs` toasts unconditionally) over js/notify.js:153-164 (`syncNotifications` swallows `L.cancel` and `L.schedule` failures with `/* ignore */`). CERTAIN. OPTIMISTIC-UI.
Player enables the streak saver, the native schedule call fails, the toast says it is on, the reminder never fires, and the streak they relied on it for dies.

**17. The survey reward celebration runs whether or not the pet was granted.** js/app.js:8548-8556: `grantPet('CX')` failure is swallowed (`/* grant best-effort */`) and `showDayOneReveal` still replaces the form with celebration copy. CERTAIN. SILENT-SWALLOW.
Player fills in the survey for the promised Day One Lizard, the grant write fails, they get a warm thank-you screen and no lizard. Mitigation that keeps this out of tier 1: `surveyDone` is only set after a successful grant, so a resubmit can retry; the inverse failure (grant ok, `surveyDone` kvSet fails) allows a duplicate grant on resubmit.

### Tier 3: fails silently, player sees nothing

**18. Two of the v373 siblings are STILL bare.** js/app.js:5265 (re-log a recent food) and js/app.js:5653 (quick add): naked `await db.put('log', ...)` with the toast after it and no catch. CERTAIN.
Player taps a recent food to relog it (or saves a quick-add), the put fails, the handler dies before the toast, the sheet stays, and the meal is simply not in the diary. Exactly the v373 shape, unguarded.

**19. Copy-yesterday commits half a meal.** js/app.js:2977-2991: `db.put` in a loop, no catch. CERTAIN.
Player taps "copy from yesterday" on a 4-item meal, the third put fails, two items are committed, no toast or confetti appears, and nothing tells them the copy is partial.

**20. Custom food save and weight save vanish silently.** js/app.js:5942 ("Food saved" toast is after the await, so no false success, but a failure shows nothing) and js/app.js:7022 (weight save, same). CERTAIN.
Player taps Save, nothing at all happens, no error, and the data is not there after a reload.

**21. Erase-all can stop half way and hang.** js/app.js:9225-9237: `social.forgetIdentity()` then `for (const st of STORES) await db.clear(st)`, uncaught; `location.reload()` only after all seven. CERTAIN (shape).
Player types ERASE and taps the button, a clear rejects mid-loop, the button sticks on "Erasing...", the app never reloads, and part of the data the dialog promised to remove is still there with no message.

**22. Health sync conflates "nothing to sync" with "sync crashed".** js/app.js:12730-12757 (`nativeSyncNow` catch returns false, including when the `ingestHealth` WRITE failed) with callers at 2939 (falls through to Settings), 6386 (does nothing on false), 12807 (toasts "Nothing to sync yet today."). CERTAIN.
Player taps Sync, the health row write fails, they are told there is nothing to sync, and the day's steps are silently absent from vigor, eggs and trends.

**23. Profile pushes fail silently forever.** js/app.js:14779-14785 (`pushProfileSoon` swallows) and the `syncProfile(...).catch(() => {})` sites. CERTAIN, low stakes.
Player changes weapon/outfit, the push fails, friends fight a stale clone of them indefinitely with no indication.

### Tier 4: everything else

**24. Settings writes are memory-first.** 11 `kvSet('settings', ...)` sites in js/app.js mutate `S.settings` before (or without checking) the write. SUSPECTED severity. A failed write leaves the session showing a choice that reverts on reload with no message. Same pattern for hint flags (`kvSet(...).catch(() => {})` at app.js:1432-1433, 13276, 14385), which are deliberate and fine.

**25. Boot runs a fan of unawaited async calls.** js/app.js:620-666 (`nativeAutoSync`, `backupNudge`, `refreshNotifSchedules`, a dozen `maybeShow*`). UNAWAITED family. Most contain their own `catch { /* never block boot */ }`; the ones that reach into social/analytics rely on those modules' own returns. CERTAIN as a pattern, no single player-visible sequence beyond what is already listed above.

**26. The service-worker diagnostics fetch has no deadline.** js/app.js:8830 (`fetch('./sw.js?diag=1')` inside `buildDiagLine`). SUSPECTED NO-DEADLINE: a hang is same-origin and SW-served so unlikely, but if it hangs the diagnostics line never finishes rendering. The update-check fetch at 6988 is caught and its silent skip is deliberate; the "Update ready" lie itself was fixed in v391, not re-found here.

**Suspected, not fully graded:**
- js/app.js:8426: if the gift SEND fails and then the REFUND `coinsAdd(amt)` write also fails, the coins are gone with the failure toast never shown (the handler rejects before it). Requires two failures; marked suspected.
- js/loot.js:673-677 (`redeemCode`): if `kvSet('redeemed', done)` fails after the grant, the code stays redeemable and can mint duplicate pets/coins on retry. Player-favourable, storage-failure-only; suspected.

## 2. What a fix would have to respect (for whoever picks this up)

Not fixes, just the constraint the census surfaced: the safe orders that DO exist here are worth copying. `importAll` (js/db.js) is a real multi-store transaction; `applyTransmog` banks the paid marker before charging; the free-gift flow (app.js:8390-8396) marks `giftFreeSent` only after `r.ok`; `initLootIfNeeded` grants before setting its flag so a failure retries rather than starves. The broken sites are the ones that invert those orders.

## 3. Already fixed on gwart/offline, do not re-find

All of these exist in THIS tree (base ff90862) but are corrected on branch gwart/offline (commits d8fbcef, 817de47, a493255):

1. js/social.js `signedFetch`/register/recovery fetches had no timeout; a hanging request never rejected so none of the 40+ catches ran. Covered by `apiFetch` + AbortController (12s deadline). This includes the confirmed 250-coin gift hang with no refund at app.js:8418.
2. js/analytics.js:73, 99, 125: the three POSTs a disabled "Sending..." button waits on. Covered by the same `apiFetch`.
3. js/sources.js: all Open Food Facts / USDA fetches had no deadline, and a failure was indistinguishable from "not in the database". Covered by `timedFetch`/`fetchWithDeadline` plus the `reached` flag.
4. js/app.js scanner: "Not in the books" shown for a barcode the databases were never asked about. Covered by the `lookupBarcode`/`reached` sheet ("Could not look that up").
5. js/app.js crew tab: an unreachable server rendered as "No Crew yet" with count 0. Covered by the `reached === false` branch and retry box.
6. js/app.js friend-add: network failure toasted "No Bonehead has that code." Covered by the `r.reached === false` wording.

Already fixed on main, per standing rules, not re-found: the applyPayload gift double-pay (v390), the sw.js 404 dead shell and the "Update ready" no-op (v391), and the v373 meal-write guard itself (app.js:5519, verified present).

## 4. Not graded, and why

- js/paddock.js, js/paddock-cards.js, bondUp and the pet card slider: off limits by standing rules. `bondUp`/`clearBond` in js/loot.js were read only as far as needed to grade their loot.js callers.
- server/: disputed surface, untouched.
- sw.js and index.html: outside js/ and their known failure lies were fixed in v391.
- Dynamic behaviour (whether a given handler's button is disabled at the moment of failure, exact toast stacking): static sweep only, so every "player sees nothing" sentence describes the code path, not a reproduced session. Findings whose sequence I could not state concretely are marked suspected above rather than padded into the list.
