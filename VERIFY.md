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
