# VERIFY: fix/den-double-pay branch (browser pass, post-gate)

1. REMOTE-PAYS-NOTHING prove-red: in a throwaway copy, re-add
   `if (r.coins) await coinsAdd(r.coins);` to claimDenWin's remote branch and
   run tests/den-ceiling-audit.mjs: the new row must FAIL with delta 48.
   On the real tree it must PASS with carried 48, delta 0.
2. End-to-end banner==bank: win a remote den fight through the real Pit door,
   read coins before and after: delta must equal the banner amount exactly
   (with a Battle Charm equipped, delta equals the multiplied banner).
3. Wallet pill: with the hub open behind the Pit sheet, win any fight; the
   pill's coin number must change without navigating. Same on a loss (+5).
4. Playtest P1-5 second half: the outcome screen's TOTAL (if one renders)
   must match the post-payout balance; measure, and fix separately if stale.

## Status 2026-08-30 late
- Item 1 (REMOTE-PAYS-NOTHING prove-red): DONE, red with delta 48 on restored bug, green delta 0 on fix.
- Items 2-4 (end-to-end banner==bank, pill repaint, outcome total): STILL OPEN. Hand-driving a full fight to settle needs the fight harness, not button mashing; run with fight-tray-audit machinery on the next pass.


---

# VERIFY: restore journey fixes (branch fix/restore-journey)

Scope of the change: routing and copy only. `importAll` in js/db.js is untouched.
All edits are in js/app.js. `node --check js/app.js` passes on this tree.

Setup for every scenario below: serve this tree (tests/godmode.js serveTree, or
`node serve.mjs`), and prepare a REAL backup file first: boot a profile with
`?demo`, log at least one food, add at least one custom food, then Settings >
Export backup. Keep that .json. Also prepare a wrong file: any non-JSON file
renamed to .json, or a .json that is valid JSON but not a Tally export
(e.g. `{"hello":1}`).

Fresh-profile scenarios need a virgin IndexedDB: a new incognito context per run
(tests/onb-audit.mjs shows the pattern).

## (a) Onboarding: restore from a backup file

1. Boot with a virgin IndexedDB. Onboarding step 0 renders (headline FEED THE
   BONES).
2. Tap "Played before? Restore a backup" (#onbRestore). The Restore sheet opens.
3. MUST BE TRUE: the sheet now contains, below "Restore my Bonehead":
   - the note "Got a backup file instead? Use the .json you exported from Settings."
   - a button "Restore from a backup file" (#rsFileBtn)
   - a hidden file input #rsFile with accept="application/json,.json".
4. Tap #rsFileBtn and hand the real backup .json to #rsFile (puppeteer:
   `(await p.$('#rsFile')).uploadFile(path)`; the change handler fires on
   uploadFile).
5. MUST BE TRUE after the import settles:
   - the sheet is closed and ONBOARDING IS GONE: no `.onb` in the DOM.
   - the app is on Today (location.hash === '#/today', Today's day strip renders).
   - the tab bar is VISIBLE (#tabbar not display:none) and tabs WORK: tap the
     Bonehead tab and assert the hub renders, tap back to Today. This is the
     shell latch (enterAppFromOnboarding); a hidden or dead tab bar is a FAIL.
   - a toast appeared matching /^Restored .+/ (exact grammar in (c) below), and
     it does NOT contain any ", 0 " or " 0 foods" text.
   - the imported data is really there: the logged food from the export shows on
     Today / in the log for its day.
6. Reload the page. MUST BE TRUE: onboarding does NOT come back (settings
   persisted); boots straight to the app.

## (b) Settings import lands on Today

1. On an established profile (finish onboarding or ?demo), go to Settings.
2. Tap Import (#importBtn), hand the same backup .json to #importFile.
3. MUST BE TRUE:
   - the app NAVIGATES to Today: location.hash === '#/today' and the Today
     screen renders. Staying on Settings is a FAIL (that was the bug).
   - the summary toast from (c) appears.

## (c) Import summary copy

Drive three imports (Settings path is fine) and assert the exact toast text:

1. Backup with 214 log rows and 12 custom foods, 0 weights:
   "Restored 214 log entries and 12 custom foods"
2. Backup with log rows only (edit the export: `foods: []`, `weights: []`):
   "Restored N log entries" (no mention of foods or weights).
3. Backup with log, foods AND weights nonzero:
   "Restored N log entries, M custom foods and K weigh-ins"
4. Singulars: 1 log row reads "1 log entry"; 1 food "1 custom food"; 1 weight
   "1 weigh-in".
5. Backup whose log/foods/weights are all empty arrays (kv/xp only):
   "Backup restored"
6. NEVER TRUE: any toast containing "0 log entries", "0 foods", "0 custom
   foods", "0 weigh-ins". The old string was "Imported N log entries, 0 foods";
   grep the live DOM toast text for ", 0" and fail on a hit.

## (d) Wrong-file error copy

1. From the Settings Import button AND from the onboarding sheet's
   "Restore from a backup file", hand each of:
   - a non-JSON file renamed .json (parser SyntaxError path)
   - `{"hello":1}` (importAll's 'Not a Tally backup file' shape check)
2. MUST BE TRUE for all four combinations:
   - toast text is exactly: "That doesn't look like a Boneheadz Gym backup.
     Pick the .json file you exported."
   - no raw parser text ("Unexpected token", "JSON", "Not a Tally backup file")
     reaches the toast.
   - the app state is unchanged: still on Settings / still in onboarding, old
     data intact (importAll is transactional; nothing to re-check beyond the
     screen not navigating).
3. STILL TRUE (do not lose these): a DAMAGED tally file (e.g. `"log": {}`... a
   file with data.app === 'tally', Array log, but `foods: 5`) keeps importAll's
   own copy "that backup file is damaged (...). Your old data is unchanged.",
   prefixed "Import failed: ". Only the two wrong-file shapes get the new copy.

## (e) Settings gear during onboarding: HIDDEN (chosen: hide, not wire)

Why hide: the gear's click handler is bound in bindTabs(), which has not run on
the onboarding path (boot returns before it when no settings exist), and
Settings mid-onboarding would render against S.settings = null. Hiding is one
line and honest; wiring it would mean booting half the shell early.

1. Boot a virgin profile. On onboarding steps 0, 1 and 2:
   - #gearBtn has the hidden attribute and is not visible
     (getBoundingClientRect().width === 0 or display none).
2. Finish onboarding (or restore). Navigate to a tab that shows the gear
   (e.g. #/foods or #/friends; Today, Settings, Boneyard hide it by design).
   MUST BE TRUE: the gear is visible again and tapping it opens Settings
   (route() owns gear visibility per tab; landing tab Today hides it, that is
   pre-existing design, not this change).

## (f) "Never backed up yet" updates after export

Web only (native early-returns with the cloud-backup toast and must NOT change).

1. Fresh profile, go to Settings. The Export backup row reads
   "Never backed up yet".
2. Tap Export. Toast "Backup exported".
3. MUST BE TRUE without leaving Settings manually: the row now reads
   "Last backup: today" (the handler calls refresh() after the export; scroll
   position should be preserved since refresh() keeps scroll).
4. On native (isNative() true): tapping Export still shows only the
   "auto-saved to the cloud" toast and the row does NOT change (no kvSet).

## Extra changes to verify (shared-path fixes made by this branch)

1. CLOUD restore from onboarding gets the same shell latch: on a virgin
   profile, onboarding > Restore a backup > enter valid recovery ID + phrase
   (needs the test server; skip if none). After "Welcome back...", assert the
   same bullet list as (a)5: onboarding gone, Today rendered, tab bar visible
   AND functional. Before this branch, a bare route() left the tab bar hidden
   with no bound tabs.
2. Cloud restore of an account with NO save to pull, from onboarding: toast
   "Account restored, but there was no save to pull." and onboarding step 0
   re-renders (the player is not dumped into a settings-less app).
3. Onboarding file import of a crafted tally file WITHOUT a settings kv row:
   toast fires, onboarding STAYS on screen (no dead shell), and finishing
   onboarding normally still works over the imported rows.
4. Settings > Import of the same file twice in a row: the second pick of the
   SAME file still fires (the input value is cleared after each pick).
5. Regressions: `node tests/onb-audit.mjs` (RESTORE step asserts /recovery id/i
   in the sheet, still present; PLAN-SAVED exercises saveInitialSettings which
   now exits through enterAppFromOnboarding) and `node tests/screen-sweep.mjs`.
   tests/backup-roundtrip-audit.mjs FINDING B is informational and mentions the
   old toast string; it does not assert it.

## Change map (js/app.js)

- ~12061: export handler now calls refresh() after "Backup exported"  (f)
- ~12066: #importFile handler delegates to importBackupFromFile, clears value  (b,c,d)
- ~12310: renderOnboarding hides #gearBtn  (e)
- ~12438: saveInitialSettings tail extracted to enterAppFromOnboarding()  (a)
- ~16609: importSummary()  (c)
- ~16624: importBackupFromFile()  (a,b,c,d)
- ~16672: restore sheet gains file button + input + handler  (a)
- ~16688: rsGo captures wasOnb; cloud restore mid-onboarding latches the shell
  or re-renders onboarding when no save came back  (extra 1,2)
# from: 3c2c98dc (Restore journey: file import from onboarding, honest summary copy, wrong-file error, gear hidden during onboarding, export label refresh)


---

# Verification Checklist

## 1. Hero badge at 375px viewport
- [ ] Badge visible at 375px: elementFromPoint on badge center (approximately x:152, y:~590 for Backpack button) hits the badge element
- [ ] Badge rect fully within button bounds: badge right edge <= button right edge + 6px
- [ ] Badge still visible at 430px: elementFromPoint hit confirms render
- [ ] No visual regression at 430px: badge position within a few pixels of original

## 2. Den victory button label
- [ ] Remote Den fight: button shows "Back to The Pit" on victory
- [ ] Walked-to den fight (from Boneyard): button shows "Back to the Boneyard" on victory
- [ ] Sparring fight: button shows "Back to The Pit" on victory
- [ ] Each fight closes to the correct destination (verified by checking which sheet renders after close)
# from: fcb69d59 (Fix hero badge clipping at 375px and den victory button label.)

---
# VERIFY: welcome-back return card (feat/welcome-back)

Built under a release-gate constraint: syntax-checked only (`node --check`
passes on js/app.js and js/db.js). NOTHING below has been driven in a browser.
A later verifier must run all of it before this ships.

## What was built

A player who returns after 2+ days away gets one gentle card at the top of the
Today day block, above the ring (first child of `.dayflow`, above the hk-stale
banner). Copy obeys the HLW_SAY.back voice rule (js/app.js ~line 5990): no day
count, no streak talk, no guilt, no exclamation marks.

- Gate: `maybeWelcomeBack()` in js/app.js (after `rollDayIfNeeded`), called
  awaited in `boot()` before the first `route()`, and on every `onAppResume`.
- kv keys: `lastOpenDay` (dateKey, written on boot + resume when it changes),
  `wbReturnDay` (the return date while the card is pending; cleared on dismiss,
  expires by itself when the day moves on). Both registered in db.js QUIET_KV.
- Render + dismiss: `renderToday` (`wbShow` block, `#wbCard` markup, `#wbOk`
  handler). CSS `.wb-back` in app.css beside `.hk-stale`.

## Drive these (real browser, ui-audit rules apply)

1. Cold path, card appears: seed a save with logging history, set kv
   `lastOpenDay` to a date 3+ days back, clear `wbReturnDay`, reload.
   Card must render inside `.dayflow` above the ring, greeting
   "Everything is where you left it." plus 1-2 fact sentences. A FAILING
   result is no card, or a card below the ring.
2. Facts are true right now, not invented:
   - With a completed unclaimed weekly quest: the weekly line shows and the
     quest really is claimable in the QUESTS panel.
   - With N unopened crates: the crate line shows N and matches the Backpack
     badge.
   - With neither: exactly one fact line, "Today's quests are new."
   - Never more than two fact sentences.
3. Dismiss: tap "Good to be back". Card leaves the DOM without a re-render,
   `wbReturnDay` kv is null, and it does NOT return on reload, tab switches,
   or refresh() the same day.
4. Once per return: after dismissal, set `lastOpenDay` to yesterday and reload
   (1-day gap). No card. Then 3 days back again: card returns.
5. Natural expiry: stamp `wbReturnDay` with yesterday's date, do not dismiss,
   reload today. No card (it belongs to the return day only).
6. Never for the ineligible:
   - Fresh install straight through onboarding: no card on first Today, and
     `lastOpenDay` seeds without stamping `wbReturnDay`.
   - A save with settings but ZERO rows in the `log` store and a 3-day gap:
     no card.
   - Paged back to a past day (isToday false): no card.
7. Resume path (the one boot never covers): background/foreground the app
   (or fire the `onAppResume` seam) with `lastOpenDay` 3+ days back and no
   sheet open. The screen must repaint with the card, without a reboot.
8. Two tabs / double open: open the app twice the same day after a gap. Both
   may show the card; dismissing in one and navigating in the other must not
   resurrect it after reload. No reward is attached anywhere, so
   reward-sop-audit has nothing new to register, but confirm `node
   tests/reward-sop-audit.mjs` still passes its derivation sweep over js/*.js.
9. Voice check on the rendered card, verbatim: no digits counting days away,
   no "streak", no "missed", no "!" anywhere in the card.
10. Regression gates the constraint blocked: tests/ui-audit.js (add a
    CONTROL_EXPECTATIONS row for `#wbOk`: tap it, assert `#wbCard` leaves the
    DOM), tests/screen-sweep.mjs, tests/unit.test.js, and hit-test `#wbOk` via
    elementFromPoint since the card sits above tappable content.

## Exact copy shipped (for Tom's review)

- Greeting (always): `Everything is where you left it.`
- Weekly fact: `A weekly quest is finished and waiting to claim.` /
  `{n} weekly quests are finished and waiting to claim.`
- Crates fact: `A crate is waiting in your backpack.` /
  `{n} crates are waiting in your backpack.`
- Fallback fact (only when neither above is live): `Today's quests are new.`
- Dismiss button: `Good to be back`
# from: b744a88a (Welcome-back return card on Today after a 2+ day gap)
# from: 75d0e771 (Welcome-back return card on Today after a 2+ day gap)

---
# VERIFY.md: loot visibility (branch fix/loot-visibility)

Written under a no-browser release gate. Nothing below has been run; this is the
checklist for the verification pass. Verify on a real served app (live or local
serve.mjs), not by reading code.

## What changed

1. `index.html`: the Bonehead tab in `#tabbar` gains `<i class="tab-badge" id="crateBadge" hidden>`,
   the same badge element/class the Crew tab already uses (`#crewBadge`).
2. `js/app.js`:
   - `setCrateBadge(n)` + `refreshCrateBadge()` next to `setCrewBadge()` (~line 2433).
     Count source: `unopenedCrates()` from js/loot.js, which is
     `inventory().filter(r => r.kind === 'crate')`, the SAME `inv` store and filter the
     Backpack crates tab renders (`renderCharacter`, `inv.filter(r => r.kind === 'crate')`).
   - `route()` calls `refreshCrateBadge()` on every navigation/refresh (~line 2861).
   - `renderCharacter()` calls `setCrateBadge(crates.length)` from its own crates rows
     (~line 12902), because opening a crate re-renders that screen in place without route().
   - QUESTS summary badge copy: "N ready" is now "N ready to claim" (~line 3612).
     The badge itself (questClaimable across day/week/month tiers, today only) already
     existed since v179; only the copy changed per the ticket.

## Checks (each must be able to fail; the failing look is stated)

1. **Nav badge appears and matches the Backpack.** Seed a crate
   (`(await import('./js/loot.js')).grantCrate('daily', 'verify')` in the console), then
   navigate to any tab (route runs the refresh). PASS: `#crateBadge` visible with "1".
   Open the Bonehead tab, Backpack/crates tab: exactly 1 crate row listed.
   FAIL looks like: badge hidden, or badge count differs from the crate rows on screen.
2. **Badge and crates tab cannot disagree.** With N crates seeded (include one
   `grantCrate('golden', 'verify')`), compare `#crateBadge` text to the number of
   crate rows in the Backpack crates tab. Must be equal, goldens included.
3. **Opening a crate decrements live, without navigation.** On the crates tab, tap OPEN,
   finish the reveal. PASS: `#crateBadge` drops by 1 (hides at 0) while still on that
   screen. FAIL: badge unchanged until you switch tabs (that was the stale-path risk;
   renderCharacter's setCrateBadge call is the guard, prove it by removing that one call
   and watching this step go red).
4. **Zero state.** Open all crates. PASS: `#crateBadge` has `hidden` set. An empty
   `inv` must not leave a "0" badge.
5. **9+ cap.** Seed 12 crates: badge reads "9+" (same idiom as crewBadge).
6. **Hit-test (anti-regression rule 6).** With the badge visible,
   `document.elementFromPoint` at the center of the Bonehead tab still returns the tab
   button (the badge is a child, so this passes unless CSS moved it).
7. **Quest tag reads from outside when collapsed.** On today, complete but do not claim
   one weekly quest (or seed its progress), leave `.q-collapse` collapsed. PASS: summary
   shows a `.q-badge` reading "1 ready to claim" without opening the section, and the
   section did NOT auto-expand. FAIL: no badge, or copy still "1 ready".
8. **Past days stay silent.** `tests/today-container-audit.mjs` must stay green: it
   asserts the q-badge is ABSENT on a read-only past day (the copy change does not touch
   that logic, but run it since the summary line was edited).
9. **Run `tests/ui-audit.js`** per tally CLAUDE.md rule 9 (badge overlays a tabbar
   control).

## Not changed on purpose

- No auto-expand of QUESTS, no reward/claim logic touched (claimQuest, periodClosed,
  reward-sop-audit surface untouched: js/quests.js and js/loot.js have zero diff).
- The Today hero Backpack door badge (`hero-badge` on `#charBtn`) already existed (v188)
  and already reads `unopenedCrates()`; left alone.
# from: c564bffd (loot visibility: crate count on the Bonehead tab, claim tag says claim)
# from: 5c76e4b2 (loot visibility: crate count on the Bonehead tab, claim tag says claim)
