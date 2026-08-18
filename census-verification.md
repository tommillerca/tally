# Census verification, adversarial pass

Branch gwart/verify, tree ff90862 (v391). Static read-only check of every unverified finding in silent-failure-census.md (branch gwart/silentfail). No tests run, no browser driven, no source edited.
Verifier date: 2026-08-18.

## Counts

- Findings graded here: 24 (census findings 3, 5, 7, 8 in part, 9 through 26, plus the two "suspected, not fully graded" items).
- CONFIRMED: 22
- IMPRECISE: 2 (findings 15 and 26)
- REFUTED: 0
- Could not reach: 0
- Skipped as already verified by Tom, not re-checked: findings 1 (wheel.js), 2 (grantLevelRewards), 4 (hatchEgg), 6 (the loot.js buy family), and the disenchantGear and salvagePet portions of finding 8.
- Section 3 of the census (items fixed on gwart/offline) and the "already fixed on main" list were not re-graded; they are out of scope for this pass.

Every CONFIRMED verdict below survived a deliberate attempt to refute it: for each one I looked for an enclosing try higher in the function, a catch in the caller, a safer actual ordering, and a later render or toast that would surface the failure. None was found except where noted.

## Verdict table

Line numbers are as found on ff90862. "as cited" means the census's numbers still hold.

| # | Finding | Verdict | Corrected location | Deciding evidence |
|---|---|---|---|---|
| 3 | Quest rewards ledger-first | CONFIRMED | claimQuest quests.js:232-247, claimAllBonusIfDue 251-257 | `const xp = await award(...)` (writes the xp row) precedes `await coinsAdd(coins)`; the `[data-claim]` handler at app.js:2945-2974 has no try/catch and `questState` reads claimed from the xp ledger |
| 5 | Spire tribute consumed in spires.js, paid in app.js | CONFIRMED | as cited (spires.js:261-271, app.js:14253-14257) | `rec.collectedAt = now; ... await kvSet(KV, state)` commits before the caller's `await coinsAdd(r.coins); await boneDustAdd(r.dust)`; the #mapSpire click handler (app.js:14234) has no try/catch |
| 7 | Meal duplication around the v373 guard | CONFIRMED | app.js:5543-5545 (persistFoodUse / onFoodLogged) | The try closes after `db.put('log', e)`; `await persistFoodUse(food)` and `await onFoodLogged(e, ...)` sit outside it; #addBtn is never disabled in this handler and a non-editing retap builds `id: newId()` |
| 8 | Salvage destroys before paying (salvageInstance portion only; the rest pre-verified) | CONFIRMED | salvageInstance loot.js:544-567 (boneDustAdd at 565) | `await savePetInstances(next)` removes the pet, bank/bond/equip cleanup follows, `await boneDustAdd(dust)` is last; caller app.js:12629 catchless |
| 9 | Consumables deleted before effect | CONFIRMED | activateBattleCharm loot.js:1255-1266 (del 1262, kvSet 1264), consumeConsumable loot.js:787-792, vigor caller app.js:10524-10527 | `await db.del('inv', row.id)` then `await kvSet('buffs', buffs)`; `consumeConsumable` deletes and returns true, then `addVigor` (energy.js:69, a kvSet of pitEnergy) runs in the catchless caller |
| 10 | Crate opening grants, deletes, pays in unsafe order | CONFIRMED | del at loot.js:893, coinsAdd at loot.js:894 (census said 869-870) | Per-roll `grantConsumable`/`grantIngredient`/`grantGear`/`grantCosmetic` all commit first, then `await db.del('inv', crateRow.id); await coinsAdd(coinsWon)`; caller app.js:10511-10515 sets `b.disabled = true` then awaits with no catch |
| 11 | Den loot offer removed before gear granted | CONFIRMED | as cited (poi.js:475-481: kvSet-remove 479, grantGear 480) | `await kvSet('denloot', pending.filter(...))` then `const g = await grantGear(gearId, 'boss-den')`; wireLootChoice (app.js:10726) awaits `claimFn(sel)` with no try/catch and `busy` stays true on a rejection |
| 12 | Breeding consumes before charging | CONFIRMED | breedPets loot.js:382-429 (census said 397-427): savePetInstances at 403, boneDustAdd(-cost) at 404 | The destroyed parent and lineage bump commit in `savePetInstances(list)` before the dust charge, cooldown, bank, and bond writes; caller app.js:12658 catchless |
| 13 | Award-ledger-first family | CONFIRMED | claimDenWin poi.js:398-473, claimMiniWin 539-546, claimGluttonWin 635-673, collectSpawn hunt.js:164-172, claimFriendBattle game.js:115-125 | Every site writes the idempotent xp row first and pays after; settle() (app.js:16146) and the #mapCollect handler (app.js:14276) contain no try/catch around any of these; claimFriendBattle's coins are paid by the caller at app.js:16165 as cited |
| 14 | Backup safety asserted after a swallowed push | CONFIRMED | #cbOn app.js:9088-9093, #goOnlineBtn 9072-9082, #crewGoOnline 7317-7326 | `await social.pushBackup(APP_SOCIAL_V).catch(() => {})` immediately precedes `toast('Cloud backup on. Your progress is safe.')` and `Your progress is now backed up.` respectively |
| 15 | Native Export asserts auto-cloud-safety; backupAt never surfaced | IMPRECISE | toast at app.js:9190; autoSync social.js:888-901; but see app.js:8893-8896 | Core claim true, staleness sub-claim false. See below |
| 16 | "All notifications on." over swallowed scheduling | CONFIRMED | applyNotifs app.js:9106-9116, note passed at 9131; syncNotifications notify.js:151-165 | `if (notis.length) { try { await L.schedule(...) } catch { /* ignore */ } }` and the cancel is equally swallowed; applyNotifs toasts the note unconditionally after `await syncNotifications()` |
| 17 | Survey celebration regardless of grant | CONFIRMED | try at app.js:8547-8553, reveal call 8557, showDayOneReveal 8562-8576 | `catch { /* grant best-effort; gating below still marks done */ }` swallows a grantPet failure, then `showDayOneReveal(granted)` replaces the form with "The Day One Lizard is yours!" copy that ignores `granted`; the cited mitigation is also real: `kvSet('surveyDone', true)` sits after grantPet inside the try, so a failed grant leaves the survey resubmittable, and a failed kvSet after a good grant allows a duplicate |
| 18 | Two bare v373 siblings | CONFIRMED | relog put at app.js:5265, quick-add put at app.js:5654 (census said 5653) | Both are naked `await db.put('log', ...)` with the toast after and no catch anywhere in the handler |
| 19 | Copy-yesterday commits half a meal | CONFIRMED | app.js:2977-2992 | `for (const e of src) { ... await db.put('log', copy); ... }` with no catch; toast and confetti come after the loop |
| 20 | Custom food and weight saves vanish silently | CONFIRMED | as cited (app.js:5942, 7022) | Both are bare `await db.put(...)` with the success toast after and no catch; a failure shows nothing (census correctly notes there is no false success here) |
| 21 | Erase-all can stop halfway and hang | CONFIRMED | app.js:9226-9238 | `go.textContent = 'Erasing...'` then `await social.forgetIdentity(); for (const st of STORES) await db.clear(st); location.reload();` with no catch: a mid-loop rejection strands the button, skips the reload, and leaves a partial erase |
| 22 | Health sync conflates nothing-to-sync with crash | CONFIRMED | nativeSyncNow app.js:12730-12757; callers 2939, 6386, 12807 | The try wraps `await ingestHealth(payload, ...)` and `catch { return false }`; syncFromClipboard does `if (ok) refresh(); else toast('Nothing to sync yet today.')`, so a failed health WRITE reads as no data |
| 23 | Profile pushes fail silently forever | CONFIRMED | pushProfileSoon app.js:14778-14785; swallow sites 7200, 7323, 9078 | `try { ... await social.syncProfile(...) } catch { /* best-effort */ }` and three `syncProfile(...).catch(() => {})` sites; nothing surfaces the failure |
| 24 | Settings writes are memory-first | CONFIRMED | 11 `kvSet('settings', ...)` sites in app.js (count verified exact) | e.g. app.js:9171 `S.settings.units = 'lb'; await kvSet('settings', S.settings)`: the in-memory choice renders regardless and reverts on reload if the write failed. Minor note: the parenthetical about hint flags is slightly off, see notes |
| 25 | Boot fan of unawaited async calls | CONFIRMED | app.js:620-667 | `backupNudge(); nativeAutoSync(); ... refreshNotifSchedules();` and the maybeShow* line-up all run unawaited; the ones checked carry their own catch, matching the census's own characterization |
| 26 | SW diagnostics fetch has no deadline | IMPRECISE | fetch at app.js:8830 inside diagnosticsLine (not "buildDiagLine"), awaited at 8886 inside renderSettings | Mechanism right, consequence understated. See below |
| S1 | Gift refund double-failure loses coins | CONFIRMED (as suspected) | debit app.js:8418, refund coinsAdd at 8427, toast 8428 | `sendGift` never throws (social.js:336-342 returns `{ ok: false }` on catch), so the refund branch is reached on any send failure; if `await coinsAdd(amt)` then rejects, armToConfirm's `await onConfirm()` (app.js:462) has no catch, the toast at 8428 never runs, and the debit stands. Two failures required, exactly as the census marks it |
| S2 | redeemCode can mint duplicates if the redeemed flag write fails | CONFIRMED (as suspected) | redeemCode loot.js:631-659 (census said 673-677); grant at 653, coinsAdd 655, kvSet('redeemed') at 656 | `done.push(code); await kvSet('redeemed', done);` is the last write, after the pet grant and coin add; a failure there leaves the code redeemable and dupes stack by design, so a retry mints again. Player-favourable and storage-failure-only, as stated |

## IMPRECISE findings, what is actually true

### Finding 15

True, exactly as the census says:
- app.js:9190: on native, the Export button toasts "Your progress is auto-saved to the cloud (end-to-end encrypted)..." unconditionally. It checks nothing: not `cloudBackupOn()`, not `backupAt`, not whether the account is even online. The assertion is made even when cloud backup is switched off.
- social.js:888-901 (`autoSync`): `if (now - lastBackup > BACKUP_THROTTLE_MS) await pushBackup(appV);` discards the return value, and `pushBackup` (social.js:502-510) returns false on any failure and only stamps `backupAt` on success. No failure is ever surfaced by this path.

False: "backupAt goes stale and nothing ever reads it to warn; there is no path anywhere that surfaces a stale backupAt." There is one. The Settings backup status row reads it and renders its age:

    app.js:8893  const backupAt = apiConfigured ? await kvGet('backupAt', 0) : 0;
    app.js:8895  : backupAt ? `On · last backup ${Date.now() - backupAt < 36e5 ? 'just now' : Math.round((Date.now() - backupAt) / 36e5) + 'h ago'}`

A player whose pushes have failed for months would see "On · last backup 2160h ago" in Settings. That is a surface, though a weak one: it is a raw hour count with no staleness threshold, no warning styling, and it sits on a different screen from the Export button that makes the safety claim. The defect is real; the census's "no path anywhere" is not.

### Finding 26

True: the fetch at app.js:8830 (`fetch('./sw.js?diag=1', { cache: 'no-store' })`) has no AbortController and no timeout, and the census's likelihood assessment (same-origin, SW-served, a hang is unlikely) is fair.

Wrong in two details:
1. The function is `diagnosticsLine` (app.js:8824), not "buildDiagLine".
2. The stated consequence, "the diagnostics line never finishes rendering", understates it. `diagnosticsLine()` is awaited at app.js:8886 inside `renderSettings` (app.js:8868), before any of the page HTML is built:

       app.js:8886  const diag = await diagnosticsLine();

   A hang there stalls the ENTIRE Settings page render, not just the one line. The surrounding try at 8829-8834 catches a rejection (pushing "sw unreachable") but a fetch that never settles rejects nothing, so the whole render awaits forever.

## REFUTED findings

None. Every mechanism I attempted to knock down held, with the two partial exceptions graded IMPRECISE above.

## Notes on minor inaccuracies that did not change a verdict

- Finding 10: the crate delete and final coinsAdd moved to loot.js:893-894 (census cited 869-870). Everything else holds, including both failure directions and the dupe-to-coins faucet on a persistently failing delete.
- Finding 12: breedPets spans loot.js:382-429, not 397-427. The mixed-direction description is accurate: `savePetInstances` at 403 commits the destroyed parent and the lineage bump before the dust charge at 404 and the bank/bond/cooldown writes after it.
- Finding 24: the parenthetical claims the hint-flag sites at app.js:13276 and 14385 use `kvSet(...).catch(() => {})`. They do not; both are bare fire-and-forget calls (`kvSet('mapLpHint', true);` and `kvSet('map-seen', true)`), so a failure there is an unhandled rejection rather than a swallowed one. Only the 1432-1433 sites carry the `.catch`. Same practical outcome (invisible, analytics-only), so the verdict stands.
- S2 (redeemCode): the cited lines 673-677 are inside petLevelBank on this tree; redeemCode is loot.js:631-659.
- Preamble: "Files in js/: 46" is 45 on this tree, and the enumerated write-site count is 280 by the same grep shape (census says 272), still across 13 files as stated. Neither is a graded finding.
- Preamble claim verified: the only `unhandledrejection` listener in the codebase is analytics.js:208 and it only calls `pushErr` (telemetry); no toast, no UI. The "multiplies most findings" statement is sound.

## Appendix: observed in passing, not part of this job

- Finding 14's third citation (app.js:7325, "You're online!") is the weakest of the three sites: that toast itself claims only connectivity, which goOnline did verify. The backup claim at that site lives in the sheet copy at app.js:7313 ("Your whole save backs up too"), shown before the tap, with the pushBackup at 7324 swallowed. The two primary sites (9081, 9090) assert safety in the toast itself exactly as the census says, so the finding's verdict is unaffected.
