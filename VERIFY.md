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

---
# VERIFY.md — browser pass for fix/honest-state (P2-4 batch)

Written under a code-only constraint (no browsers, no test suites). Every item
below needs a real browser/device pass before this branch is called done.

## 1. Progress dots — NO CODE CHANGE (finding)

Traced every "·" on the Progress screen (renderTrends, js/app.js ~8840-8900).
All five render sites are honest no-data markers; no partial-data window can
produce one:

- Walked (7d) pill (js/app.js:8851): "·" iff `stepsWk === 0`, i.e. zero steps
  summed across the last 7 health rows (`h.steps || 0`). Any step reading > 0
  in the week prints km.
- Avg sleep pill (8852) and SLEEP card (8875): "·" iff no `sleepHours != null`
  row in the last 7 days. A single sleep reading prints the average.
- 7d/30d step avgs (8865/8866): `stepAvgWithToday` (8748) returns avg 0 only
  when NO COMPLETE day in the window has steps > 0. With any complete day of
  steps, avg >= 1 and prints. NaN is impossible: `h.steps || 0` folds
  null/undefined/NaN to 0 when the `days` array is built (~8786).
- INTAKE card (8896): "·" iff zero logged days in 14. Honest.

One deliberate edge, documented in the code (js/app.js:8754-8759): on the
FIRST day of health data, when only today has steps, the 7d/30d averages stay
"·" on purpose. Computing an average from today alone would render
todaySteps / dayElapsedShare(), which at 00:15 with 100 steps claims a
25,000-step average (the guard comment's own example). "Today" prints the
real count right beside the dots, so data is never hidden.

The playtest saw dots on the step averages AND the walked pill AND the sleep
lines simultaneously. That combination requires zero steps and zero sleep
readings across the whole window: a profile with Apple Health not connected
(or a web build with no native bridge). Reproduce both states:

- Dots: fresh profile, no Health connection (or web build), open Progress.
  Expect "·" on walked, avg sleep, 7d avg, 30d avg; Today shows 0.
- Numbers: `?demo` seed (seedDemo writes 14 days of steps + sleep) or a device
  with Health connected for >= 1 complete day. Expect every dot replaced.
- First-day edge: connect Health mid-day on day one, sync. Expect Today with a
  real count, 7d/30d still "·", and the caption under the chart explaining it.

## 2. Boneyard location-denied legend (js/app.js ~16826-16835, 941)

Change: the geolocation catch block (denied / no fix / maplibre load failure)
now renders the map key card ("OUT THERE TODAY", full mapLegendHtml) under the
banner and Retry button. mapLegendHtml gained a `head` param (default
unchanged: MAP KEY) so the card supplies a .card-title instead.

Browser pass:
- Deny location, open Boneyard, tap "Open the map". Expect the denial banner,
  Retry, and the full key card (bone cache, coin pile, crate, herb patch,
  mystery egg, mini-boss, 3 den looks) with pixel icons at marker size.
- Confirm den rows in the card do NOT animate (leg-ico rules kill den-fx) and
  the card scrolls normally (it must not inherit .map-legend's absolute
  overlay positioning; it is deliberately NOT wrapped in .map-legend).
- Allow location, open the map, tap the key button. Expect the overlay legend
  identical to before (header still "MAP KEY").
- Airplane-mode / no-network branch shows the same card.

## 3. Crate reveal broken-image fallback (js/app.js wirePackArtFallback,
   defined after hydratePackArt ~14489, called in openPackReveal's renderCard)

Change: after each reveal card mounts, every <img> inside .pc-icon gets a
once-only error handler (plus an already-failed check via
`complete && naturalWidth === 0`) that replaces the art panel's content with
a quiet "Art on its way" note. Name and rarity plate untouched. Canvas-art
cards (imgSrc) already had their own fallback in drawTrimmedArt.

Browser pass (per tally/CLAUDE.md: cold cache, real control):
- DevTools: block a request pattern for one item's art
  (e.g. assets/icons-pix/*.png), then open a crate from the Backpack (the real
  button, not __packReveal). Expect: no broken-image glyph; the art area shows
  "Art on its way"; the card's name and rarity chip render normally; the
  reveal advances and closes normally.
- Prove the guard can fail (anti-regression rule 2): with the block removed,
  confirm art renders and NO "Art on its way" note appears anywhere.
- Confirm no loop: the note appears once and the network panel shows no
  repeated re-requests of the failed asset from the reveal.
- Sweep the other openPackReveal producers (quest claim, gift claim, wheel)
  since renderCard is shared: one spot check each with art blocked.
# from: 020601fa (Honest-state P2-4: denial-screen legend, reveal art fallback, Progress-dot finding)

---

# VERIFY: day guard voice + two quest counters (branch fix/dayguard-voice)

Written under a release gate: READ/EDIT/`node --check` only on this pass. Both
`node --check js/app.js` and `node --check js/quests.js` pass on this tree.
Nothing below changes what the day guard blocks or pays; items 1-3 are display
only, items 5-6 change quest COUNTERS and need the prove-red treatment.

Setup: serve this tree, `?demo` profile. To fake a clock set-back without
touching the OS clock, set the mark directly in the console:
`const db = await import('./js/db.js'); await db.kvSet('dayHighWater', db => {})`
- i.e. `kvSet('dayHighWater', '<tomorrow's key>')` with tomorrow computed via
`(await import('./js/nutrition.js')).addDays((await import('./js/nutrition.js')).dateKey(), 1)`.

1. PRE-SPENT LINE on Today (js/app.js renderToday, `preSpent`):
   - With dayHighWater set to tomorrow, open Today. MUST show the note
     "This day already passed on this clock. Fresh rewards return tomorrow."
     inside .dayflow, above the return card slot.
   - FAIL direction A (false positive): with dayHighWater equal to TODAY (the
     normal state of every ordinary day), the note MUST NOT render. This is the
     check that cannot be skipped: the condition is strictly-behind, and a
     regression to `>=` would show the line to every player every day.
   - The note must not render on a paged-back past day (it is gated on isToday).
2. FUTURE-DATED HEADER (js/app.js, `aheadOfClock`): page FORWARD with the next-day
   arrow past the real today. The day header .sub MUST read
   "<date> · dated ahead of this clock". On today and past days the suffix MUST
   be absent. No data reconciliation happens: entries on that day are untouched.
3. STREAK GRACE (js/app.js renderTrends): with an unbroken run of logged days
   ending YESTERDAY and nothing logged today (and <3000 steps today), Progress
   MUST show the real streak number with sub "day streak · log today to keep it".
   - FAIL direction: if yesterday is ALSO empty, the pill MUST show 0 with the
     plain "day streak" sub (the 0 is genuinely earned; no hint).
   - Milestone payouts are off streakFrom in js/game.js and MUST be unaffected:
     assert no new xp row of type 'streakms' appears from rendering Progress.
4. GUARD UNCHANGED prove-green: node tests/clock-trust-audit.mjs must pass
   unchanged (no assertion in it was touched; a red here means this branch
   altered an award decision and must not ship).
5. q-first COUNTER (js/quests.js `loggedAnyToday`): on a day whose daily slate
   contains q-first ("Show up: log anything"), with an EMPTY food diary, log a
   manual walk (Today > Wellness > Add a walk; requires hkConnected false).
   q-first MUST read 1/1 and be claimable. Same for a weigh-in, water goal, bed,
   sleep, or a routine tick. Prove-red: on a throwaway tree revert progress to
   `clamp(c.entries.length, 1)` and the walk case MUST read 0/1.
6. m-boss / w-boss COUNTER (js/quests.js `bossWins`): beat any den (landmark,
   remote, or roaming) and m-boss/w-boss MUST advance by exactly 1 per den win.
   - Double-count FAIL direction: a FIRST-EVER clear mints a 'bossfirst' row
     alongside the 'bossday'/'roamboss' row; the counter MUST still advance by
     1, not 2 (bossfirst is excluded by name).
   - Boneyard Wanderer: beating him (xp type 'wanderer') MUST NOT advance
     m-boss/w-boss (he re-rolls every 45 min; deliberately out of progression).
   - node tests/unit.test.js and tests/reward-sop-audit.mjs must pass: quest
     claims stay idempotent per `quest-<periodKey>-<id>`.
