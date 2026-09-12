# UI bug hunt at v588

2026-09-12. Advisory findings only, ranked by harm. Every fix below is a
PROPOSAL, not approval. Source paths and line numbers refer to this checkout.
The frozen plan SHA256 matched
`b616b76a8a24051d90d0cec5f9b7cea2701d675221512960add4e5d570b4fee9`.

No browser was opened. Findings are source-read-only unless explicitly marked
as a Node handler probe. These probes use extracted production handlers with
minimal DOM doubles and injected rejection, not a rendered app or real storage.
A source audit passing does not establish layout, tap reachability or absence of
other bugs. Supporting reads of social.js and loot.js trace UI calls only.

## 1. Recovery setup promises progress recovery without checking for a backup

**Where:** `js/app.js:22402`, `js/app.js:22403`, `js/app.js:22460`;
`js/social.js:1562`, `js/social.js:1587`, `js/social.js:1594`.

**What happens:** The normal introduction says the ID and phrase together bring
your Bonehead back on any phone. The success toast says "Restore anywhere".
An existing online account can save these credentials while cloud backup is off
or before any save upload succeeds. Credentials alone do not recover progress.
The upgrade introduction also says "the ID is all you need from now on", while
the actual restore form still requires the phrase (`js/app.js:22627`).

**Evidence:** Source-read-only. `setRecoveryPhrase` wraps identity, PUTs
`/recovery`, records recovery metadata and returns success. It does not require
or upload a progress backup. Settings already distinguishes no backup from
restorable progress (`js/app.js:15027`, `js/app.js:15029`), and the restore handler
explicitly supports "Account restored, but there was no save to pull"
(`js/app.js:22666`). This is a copy finding, not an audit of backup encryption.

**Proposed fix (PROPOSAL):** Say that the ID and phrase unlock the account and
that recovering progress also needs a successful cloud backup. Replace the
upgrade sentence with "Use this ID and your phrase instead of your friend code."

**Verify:** On an online account with no uploaded save, save a recovery code.
Require truthful credential-only confirmation. Repeat with a confirmed backup
and with an old phrase being upgraded to an ID.

## 2. First-run Restore is still the primary path for someone with nothing to restore

**Where:** `js/app.js:1437`, `js/app.js:1449`, `js/app.js:1451`,
`js/app.js:22617`; `app.css:596`, `app.css:604`.

**What happens:** On the unknown/no-save branch, Restore gets the accent `.btn`
and "I am new" gets `.btn.ghost`. A new player following the primary action
enters a credential form they cannot complete. There is an exit, so this is a
misdirected first-run flow, not an inescapable modal.

**Evidence:** Source-read-only tap trace:

1. Tap "Restore an account or backup file": opens Restore, without checking
   that the player has credentials (`js/app.js:1453`).
2. Tap the ID field or phrase field: edits credentials only. The placeholders
   do not create an account (`js/app.js:22624`, `js/app.js:22628`).
3. Tap "Restore my Bonehead" with an empty/invalid ID: disables briefly,
   receives the invalid-ID result, re-enables and displays the inline error.
   Repeating the tap repeats that result (`js/social.js:1639`,
   `js/social.js:1642`, `js/app.js:22648`, `js/app.js:22651`). A valid-looking
   nonexistent ID goes to lookup and the 404 message; a wrong phrase reaches
   the decryption error (`js/social.js:1674`, `js/social.js:1696`).
4. Tap "Review local restore points": opens another sheet. With none, it says
   "No file restore points saved yet"; Done returns to Restore
   (`js/app.js:22638`, `js/app.js:22587`, `js/app.js:4005`).
5. Tap "Restore from a backup file": opens the hidden file input. Cancelling
   returns without progress; selecting a file enters import review
   (`js/app.js:22639`, `js/app.js:22640`, `js/app.js:22644`).
6. Tap Restore's Done, or its backdrop after 300 ms: goes back to the first-run
   choice (`js/app.js:22619`, `js/app.js:4004`, `js/app.js:4005`). There is no
   "I am new" action inside Restore (`js/app.js:22620` through `js/app.js:22636`).
7. Tap "I am new. Start my Bonehead": confirms the new-player branch and opens
   onboarding (`js/app.js:1454` through `js/app.js:1459`). Then "Meet your
   Bonehead" opens the name reveal, Shuffle changes the pick, "That's me"
   saves the pick and opens the plan. Start tracking validates/saves the plan;
   Skip saves the stated defaults (`js/app.js:15865`, `js/app.js:15900`,
   `js/app.js:15906`, `js/app.js:15931`, `js/app.js:15940`).

For a genuine returning player, success closes the sheets. A recovered save
enters the app; an account without recovered progress returns to account
recovery when that gate was active, otherwise resumes onboarding
(`js/app.js:22656`, `js/app.js:22674` through `js/app.js:22679`).

The historical 14 taps are recorded at `docs/WORK-REGISTER.md:37`. They were
not reproduced here. The plan calls this F9; the current work register calls it
row 15. `docs/PLAYTEST-FEEDBACK-v568.md:26` uses F9 for a different Backpack item.

**Proposed fix (PROPOSAL):** On the unknown/no-save branch, make the new-player
path primary and Restore secondary. Retain the recovery-first presentation for
known missing progress. Add an explicit new-player exit within Restore only
for the unknown/no-save branch.

**Verify:** Independently observe a non-gamer completing a virgin install.
Also test known missing progress so an easier new-player path cannot bypass
that protection. Measure taps; do not reuse the historical count as new proof.

## 3. A refused local write wedges the account Restore button

**Where:** `js/app.js:22646` through `js/app.js:22651`;
`js/social.js:1698`.

**What happens:** After valid credentials decrypt, rejecting the recovery-ID
write leaves "Restoring..." disabled for the rest of that sheet's lifetime.
Freeing storage does not re-arm it; the player must close and reopen the sheet.

**Evidence:** The write is outside the social function's network/decrypt catches.
The handler has no catch/finally around its await. A Node probe of the extracted
handler, injecting rejection from `restoreWithPhrase`, printed:
`CONFIRMED restore: rejected operation leaves disabled=true`.
The shared write-failure sink can toast (`js/app.js:1499` through
`js/app.js:1507`), so this is not a claim of total silence.

**Proposed fix (PROPOSAL):** Catch thrown restore failures, disclose the outcome
and restore the button in finally while preserving the input.

**Verify:** Reject the recovery-ID write after successful decryption, then allow
it and retry in the same sheet. Require no duplicate or misleading success.

## 4. Saving recovery credentials can similarly leave Saving stuck

**Where:** `js/app.js:22454` through `js/app.js:22457`;
`js/social.js:1577`, `js/social.js:1583`, `js/social.js:1592`.

**What happens:** Key setup, encryption, or the metadata write after the server
accepts the credentials can reject without re-enabling Save. In the last case,
the server may already have saved the credentials while the UI stays pending.

**Evidence:** Source-read-only. The social function catches the signed network
request at `js/social.js:1586`, not the earlier crypto operations or later local
writes. The caller only resets the button after a resolved return. Database
failures may get the shared toast at `js/app.js:1507`; a crypto rejection does
not pass through that database sink.

**Proposed fix (PROPOSAL):** Handle thrown failures and always release the busy
state. Distinguish server acceptance followed by failed local recording from a
request that never reached the server.

**Verify:** Reject encryption, then separately reject `recoverySetAt` after a
successful PUT. Require a useful outcome and an operable retry in both cases.

## 5. Cloud backup On stays disabled when its preference write fails

**Where:** `js/app.js:15335` through `js/app.js:15345`;
`js/social.js:1885`, `js/social.js:1886`.

**What happens:** The handler disables On, then awaits `setCloudBackup(true)`.
If that write rejects, neither the upload attempt nor the Settings re-render
runs. On stays disabled even after the storage problem is resolved.

**Evidence:** Node extracted-handler probe:
`CONFIRMED cloud-on: rejected operation leaves disabled=true`.
The catch on `pushBackup` protects only the later upload. A shared database
toast can appear, but does not release this control (`js/app.js:1507`).

**Proposed fix (PROPOSAL):** Catch preference-write failure and restore the
control in finally. Do not claim backup was enabled before the write succeeds.

**Verify:** Reject `cloudOff`, clear the failure, and tap On again without
navigating away. Require one successful preference change and upload attempt.

## 6. Delete fit cannot retry a refused deletion within its confirmation

**Where:** `js/app.js:17549` through `js/app.js:17557`;
`js/loot.js:2983` through `js/loot.js:2985`.

**What happens:** The confirmation disables Delete fit before the outfits write.
A rejection leaves the fit undeleted and the confirmation permanently disabled.
Cancel and reopen works around it; retry within the same confirmation does not.

**Evidence:** `deleteFit` awaits `kvSet` without converting rejection to an
outcome. Extracted-handler probe:
`CONFIRMED delete-fit: rejected operation leaves disabled=true`.
The existing wardrobe PURE audit covers successful deletion and duplicate-tap
locking, not failure recovery (`tests/wardrobe-ui-1f-audit.mjs:78`). Shared
write-error disclosure remains possible (`js/app.js:1507`).

**Proposed fix (PROPOSAL):** Retain the duplicate-tap lock while pending, catch
failure and re-enable confirmation if the deletion did not commit.

**Verify:** Fail the outfits write, verify the fit remains, then successfully
retry once in the same confirmation.

## 7. Clearing height and switching units silently resurrects the old value

**Where:** `js/app.js:15716` through `js/app.js:15724`;
`js/app.js:15662` through `js/app.js:15676`.

**What happens:** Clear both imperial height inputs, then switch to metric.
The metric field retains its previously rendered value, rather than remaining
blank. Clearing metric height and switching back similarly exposes stale feet
and inches. With other fields valid, the stale height can become the saved plan.

**Evidence:** Source-read-only. Null source height skips the entire destination
assignment at line 15720, then the hidden flags switch at line 15724. `get()`
reads the newly selected unit's fields. This contradicts the nearby explicit
blank-preservation intent (`js/app.js:15714`). Both onboarding and Settings use
this binder (`js/app.js:15930`, `js/app.js:15747`).

**Proposed fix (PROPOSAL):** Clear the destination height field(s) when source
height is null, before exposing them.

**Verify:** In both directions, erase height, switch units and require a blank
field plus missing-height validation. Keep existing nonblank conversion checks.

## 8. A suggested lucky number is saved while its checkbox still says Off

**Where:** `js/app.js:12342` through `js/app.js:12346`,
`js/app.js:12368` through `js/app.js:12381`.

**What happens:** Save a taken name with Lucky number off. When the server
suggests a number, the preview and selection get that number but the checkbox
stays unchecked and its input stays hidden. The next Save submits the number
while the control still says the option is off.

**Evidence:** Source-read-only. The taken branch assigns `sel.num`, input value
and preview, then returns. It never calls `paint()`, which owns checked/hidden
synchronization. The next submission sends `sel.num` at line 12370. The server
suggestion is explicitly preserved by `js/social.js:633` through
`js/social.js:635`.

**Proposed fix (PROPOSAL):** Synchronize the checkbox and visibility after adopting
the suggestion, while preserving the intended input/caret behavior.

**Verify:** Return taken with `suggestNum: 7` for a no-number name. Require the
preview, checked state, visible value and next submitted number all to agree.

## 9. Recovery-ID availability can describe an input the player already changed

**Where:** `js/app.js:22429` through `js/app.js:22442`;
`js/social.js:1538` through `js/social.js:1547`.

**What happens:** A slow lookup for ID A can overwrite the availability status
for newer ID B, or put "A is free" beside an empty input. This can encourage
submission of a different ID without a reliable availability indication.

**Evidence:** Source-read-only. `clearTimeout` cancels only a timer that has not
fired. Once the async lookup starts, its captured `v` is always painted after
await, without comparing current input or a request generation. Server-side
Save still rejects taken IDs (`js/social.js:1590`), so this does not establish
an account collision or data loss.

**Proposed fix (PROPOSAL):** Discard availability replies unless their input and
request generation still match the live field. Invalidate on empty/invalid edits.

**Verify:** Resolve B's request first, then A's. Require only B's result. Repeat
with the field cleared while A is in flight.

## Proof and audit boundaries

The agreed `node tests/unit.test.js` completed successfully. Final output:

```text
392 passed, 0 failed
```

Full captured output: `/tmp/h-ui-unit.log`.
All commands ran relative to this checkout. No full release gate was launched
because it includes browser suites. The following selected source/handler audits
are PURE entries at `tests/release-gate.mjs:255` through
`tests/release-gate.mjs:288`, with Settings safety added at
`tests/release-gate.mjs:385`. Each command was `node tests/<file>` and exited 0.
Quoted output rows:

| Audit | Output row |
| --- | --- |
| wardrobe-ui-1f-audit.mjs | `PASS real fit bindings in DOM model: toggle state, equip, explicit rename, confirmed delete and duplicate-confirm lock. Browser UNPROVEN.` |
| wardrobe-unlock-audit.mjs | `PASS 388 gear variants reachable with stats across 105 tiles; exclusive picker markup and reduced-motion return contract. Browser unproven.` |
| today-ui-1e-audit.mjs | `PASS Today title lookup, digit-bearing titles, live name/level/XP refresh, newspaper and scoped navigation/disclosure contracts. Browser UNPROVEN.` |
| crew-ui-1c-audit.mjs | `PASS Crew 1C source: separate rows, pixel star and state, handlers, race/podium order, no base gradient, fixture and unmount seam` |
| wardrobe-family-audit.mjs | `13 checks, 0 failed` |
| restore-latch-audit.mjs | `all green` |
| settings-safety-audit.mjs | `settings-safety: 26 passed, 0 failed` |
| recovery-status-audit.mjs | `PASS recovery-status: 32 cases, including 404 CONTROL, server faults, throttling, network and unexpected responses` |
| stable-stale-disclosure-audit.mjs | `PASS CONTROL: armed quick quote rejects a new nickname, preserves the pet, then requires fresh typed consent` |
| stable-loss-disclosure-audit.mjs | `PASS R6-S3 Breed discloses every consumed investment: missing=none` |
| crew-outfit-audit.mjs | `7/7 passed; 5 captured profile uploads; pixel review owed.` |
| render-sink-lint.mjs | `ok    SINK no field that can carry another player's text is interpolated raw into markup  5075 interpolations scanned, none raw` |

The captured profile uploads in the Crew audit are test doubles, not production
publication. The unit suite and restore audit contain inherited economy checks;
no economy findings were investigated or added in this lane.

Syntax proof: copied `js/app.js` to `/tmp/h-ui-app.mjs`, ran
`node --check /tmp/h-ui-app.mjs`, exit 0 with no output. No malformed template
backtick was found. Legitimate backticks inside JavaScript expression comments
are not treated as errors merely because they occur near markup.

Additional proof: `node /tmp/h-ui-probes.cjs`, exit 0, produced the three
`CONFIRMED` rows quoted above. This temporary harness is not a repository change.

Denied/blocked actions: no tool denial. Browser observation and pixel/tap proof
were excluded by the work order and remain unperformed. No commit, push or
publication was attempted. Only this document was created in the checkout;
temporary proof logs and the probe live under `/tmp`.

Deviations: no product requirement was redesigned or implemented. The historical
F9 label mismatch is disclosed in finding 2. Nine findings are reported rather
than padding the list with speculative escaping or layout failures.

## Looked at, not a bug

- Player-text sinks sampled across Today, hub, Wardrobe, Backpack, Stable, Crew
  and leaderboard were escaped: food entries (`js/app.js:8966`), hub name
  (`js/app.js:16483`), fit title/text/rename/delete labels (`js/app.js:17208`
  through `js/app.js:17213`, `js/app.js:17546`), active dish names
  (`js/app.js:18287`), Stable confirmation names (`js/app.js:20879`,
  `js/app.js:20881`), friend name/alias (`js/app.js:12429`), leaderboard name
  (`js/app.js:13427`). No evidenced raw player-text sink was found; the narrow
  lint's clean result is not a universal escaping proof.
- Meal headings interpolate `name` without `esc()` (`js/app.js:8958`,
  `js/app.js:8962`), but the caller supplies fixed MEALS labels
  (`js/app.js:5058`), not free-text food names. Food names use a separate escaped
  slot at line 8966.
- The prior restore-point retention sentence is corrected to the last two
  (`js/app.js:22548`). This is not re-reported from v580.
- `paintFanSel` unhides its action box after rebuilding it
  (`js/app.js:13034`). The favourite handler updates the star before the
  subsequent repaint (`js/app.js:13026` through `js/app.js:13029`), so that
  particular handle use is not a post-render stale-node bug.
- The name API converts request/write failures to `{ok:false}`
  (`js/social.js:644`), and the builder handles that outcome and re-enables Save
  (`js/app.js:12383`). Its ordinary rejected request is not the same failure
  path as findings 3 through 6.
- Restore sheets have scrolling via `.sheet-body` (`app.css:483`). The route
  dispatch targets existing render functions (`js/app.js:3661` through
  `js/app.js:3672`), and hub navigation consumes `pendingHubTab`
  (`js/app.js:16455`, `js/app.js:16468`). No unreachable target was established
  in these inspected paths. Layout under a keyboard remains unproven.
- Onboarding explicitly clears the container opacity gate and resets scroll
  (`js/app.js:15809`, `js/app.js:15827`); its gear is deliberately hidden until
  routing (`js/app.js:15818`, `js/app.js:3656`). These are owned visibility
  changes, not unexplained dead controls.
