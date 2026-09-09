# R4 finish advisory report

2026-09-09. The required Node proofs pass. The broader visible-map portion of
R4-20 remains unresolved at the frozen file boundary. This report is advisory
for independent review, not a release approval.

## Checkout and starting evidence

The supplied plan file hashes to
`a43f44deb0ddd1ec0d5b6be6d0feef58352e45a32cee1f0fe23f7c7e50fc30ba`.
All four authoritative specs were read before edits. Paths were resolved in
this checkout. The arrival tree was clean.

The actual checkout differs from the frozen plan's description: all four named
R4 audit files were absent, while the production fixes and partial CLAIMS text
were present. There was consequently no existing audit to relax or replace.
The requested original defect-level RED evidence cannot be reproduced from
that starting state without inventing or reverting source. It is not claimed.

The agreed baseline command, `node tests/unit.test.js`, really reported:

```text
379 passed, 3 failed
```

The three failures were missing modules, not failed behavioral assertions:

```text
Error: Cannot find module '<this checkout>/tests/cloud-off-audit.mjs'
Error: Cannot find module '<this checkout>/tests/water-retry-audit.mjs'
Error: Cannot find module '<this checkout>/tests/r4-app-p1-audit.mjs'
code: 'MODULE_NOT_FOUND'
```

Paths are abbreviated here only. Full baseline stdout/stderr is retained at
`/tmp/r4-proof/unit-before.log`.

| Defect group | Arrival verdict | Reconstructed final verdict |
|---|---|---|
| R4-1, R4-2, R4-19, R4-22 | Audit missing; unit wrapper RED | 14 passed, 0 failed |
| R4-13, R4-16 | Audit missing; unit wrapper RED | 8 passed, 0 failed |
| R4-11, R4-6, R4-12, R4-14 | Audit missing, neither RED nor GREEN | 6 passed, 0 failed |
| R4-20 | Audit missing; unit wrapper RED | 6 passed, 0 failed, classifier only |

The recreated silence audit was GREEN on its first execution. The cloud and
water audits were also GREEN on their first execution. The app audit initially
reported `13 passed, 1 failed` because its new fixture extracted only the first
line of a two-line entitlement expression. The fixture now executes the full
production expression and asserts both future refusal and today's entitlement.
That was a test-authoring correction, not a production failure or relaxed
assertion. All 14 final checks pass against the source already present.

## Changes

Production implementations in `js/app.js`, `js/loot.js`, `js/game.js`,
`js/social.js`, `js/sync-health.js`, `js/save-disclosure.js`, `js/db.js` and
`js/water.js` were preserved. The missing guards and unfinished reporting were
completed.

| File | Change |
|---|---|
| `tests/r4-app-p1-audit.mjs` | Recreate 14 checks over real purchase/storage paths, the forage callback, watcher arithmetic, date controls and reward refusal. |
| `tests/cloud-off-audit.mjs` | Recreate 8 checks driving the garment callback, debounce, actual local wardrobe and profile transport boundary. |
| `tests/r4-silence-audit.mjs` | Recreate 6 checks covering all four defects plus healthy controls, fresh VM storage and peer erase recovery. |
| `tests/water-retry-audit.mjs` | Recreate 6 checks with a deterministic clock, queued-tile delivery, growth/cap/jitter and broken-loader controls. |
| `tests/lib/r4-proof.mjs` | Shared assertion/source slicing, memory storage and actual transaction-abort injection helpers. |
| `tests/log-xp-farm-audit.mjs` | Correct the fixed-date clock fixture; retain all seven existing assertions. |
| `js/changelog.js` | Add 10 unversioned `NEXT_CHANGES` entries for operator assembly. Existing `CHANGES` and version stamps are untouched. |
| `docs/CLAIMS.md` | Complete `## vNEXT` with exactly 10 PROOF rows matching the 10 pending items in order. |
| `docs/L6-SILENCE-REPORT.md` | Add current evidence and distinguish inherited historical RED claims from this checkout's evidence. |
| `docs/PLAYTEST-SETTINGS.md` | Add current peer-erase proof and the same provenance distinction. |
| `docs/R4-SILENCE-REPORT.md` | Restore the missing report target with actual current proof and limitations. |
| `docs/R4-FINISH-REPORT.md` | This advisory report, including the complete PURE enumeration. |

## Existing audit correction

The first full PURE run reported `144/145 exited 0`. Its sole failure was
`tests/log-xp-farm-audit.mjs`. The old fixture at line 45 used 2031 dates without
changing the device's current date. Its rollover at old line 76 changed only
the entry date. That fixture was wrong under the settled today-only payout
rule. This is an audit-fixture correction outside the four missing files,
necessary to verify the complete tree. No production payout rule was changed.

Actual starting output:

```text
FAIL CONTROL the first log of a day pays 10 XP  0 XP after one log
FAIL FARM 60 logs on one date pay the daily ceiling and stop  60 logs minted 0 XP of type log, ceiling is 20 x 10 = 200
FAIL ROLLOVER a different date pays again  0 XP
FAIL REPEAT the same entry through onFoodLogged twice pays its log XP once  0 -> 0 XP after two calls for one entry (one slot is 10)
FAIL CONCURRENT two overlapping onFoodLogged calls for one entry pay its log XP once  0 -> 0 XP after two simultaneous calls for one entry
FAIL (5)
```

The complete Date constructor and Date.now now follow fixed local noon on each
fixture day. All original expected payouts, the 60-log hammer, deletion
assertion, cap, deduplication and concurrent checks are unchanged. Final output:

```text
ok   SHAPE XP_DAILY_CAP.log exists and is below the hammer count  cap=20, hammer=60
ok   CONTROL the first log of a day pays 10 XP  10 XP after one log
ok   FARM 60 logs on one date pay the daily ceiling and stop  60 logs minted 200 XP of type log, ceiling is 20 x 10 = 200
ok   DELETE deleting the day and logging again mints nothing new  200 -> 200 XP after deleting all rows and logging 5 more
ok   ROLLOVER a different date pays again  210 XP
ok   REPEAT the same entry through onFoodLogged twice pays its log XP once  210 -> 220 XP after two calls for one entry (one slot is 10)
ok   CONCURRENT two overlapping onFoodLogged calls for one entry pay its log XP once  220 -> 230 XP after two simultaneous calls for one entry

all green, 7 checks
```

## Final proof

The agreed command is `node tests/unit.test.js`:

```text
382 passed, 0 failed
```

It exited 0 both standalone and in the final PURE run. The full final command
output is at `/tmp/r4-proof/unit.test.js.log`.

The four reconstructed guard outputs, captured by the final PURE run:

`node tests/r4-app-p1-audit.mjs` (exit 0):

```text
PASS R4-1 CONTROL all ten drop purchases retain coins-paid transmog credit
helmet: 32 paid colourways
jersey: 32 paid colourways
cleats: 32 paid colourways
PASS R4-1 football credits all 32 colourways, including helmet visors
PASS R4-1 bundle credits every delivered garment
PASS R4-1 unfunded purchase grants no credit or inventory
PASS R4-2 CONTROL forage pays 45 and delivers one common ingredient
PASS R4-2 aborted ingredient write preserves wallet and pantry
PASS R4-2 retry succeeds after abort
PASS R4-2 concurrent forage taps cannot spend one wallet twice
PASS R4-19 CONTROL fresh driving speed blocks actions for full watch timeout
PASS R4-19 stale speed and position clear at 20 seconds, at every gate
PASS R4-19 first returning stationary GPS fix discards old smoothing history
PASS R4-22 next control is disabled and handler refuses dates at or after today
PASS R4-22 future logs and recovery grant zero XP, crates, level-ups or entitlement
PASS R4-22 CONTROL today still earns XP
R4 APP P1: 14 passed, 0 failed
```

`node tests/cloud-off-audit.mjs` (exit 0):

```text
PASS CONTROL healthy enabled garment tap uploads its persisted outfit
OFF transport: []
PASS OFF garment tap emits ZERO network requests
PASS OFF direct and shared profile calls emit zero requests
PASS OFF skips the snapshot builder itself
PASS opting out during snapshot preparation stops the shared upload
PASS Settings disclosure names stopped profile sync and stale Crew entries
PASS OFF diagnostic outcomes describe zero attempted profile requests
PASS CONTROL re-enable reaches server and reports its rejection
Cloud off audit: 8 passed, 0 failed
```

`node tests/r4-silence-audit.mjs` (exit 0):

```text
PASS R4-11 failed save survives OS-kill model with wholly fresh VM and session storage
PASS R4-11 CONTROL confirmed saves and another writer cannot erase failure evidence
PASS R4-6 failed erase proactively tells peer truth and reload recovery
PASS R4-6 CONTROL successful erase still clears data and reloads peers
N=4 launches, 1 error notices
PASS R4-12 N=4 consecutive launches restamp draft but emit exactly one error notice
Account notices: ["This device is not connected to a Crew account. No profile request started.","Your Crew profile has not finished syncing for a while. Your progress is still on this phone. Check Profile sync in Settings."]
PASS R4-14 missing and existing accounts produce DIFFERENT exact notice strings
R4 SILENCE: 6 passed, 0 failed
```

`node tests/water-retry-audit.mjs` (exit 0):

```text
PASS CONTROL healthy host delivers and stops its timer
GREEN intervals (seconds): 13.5, 27, 54, 108, 108, 108, 108
PASS same URL retry intervals grow to a literal 120-second cap with jitter
PASS BOOT host returns and delivers queued tiles without another lookup
PASS tile-only outage heals with no walking or additional lookup
CONTROL reconstructed flat loader: 507 requests; first intervals 15.6, 15.6, 15.6, 15.6, 15.6, 15.6, 15.6, 15.6 seconds
GREEN walking loader: 104 requests; first intervals 13.5, 27, 54, 108, 108, 108, 108 seconds
PASS CONTROL walking comparison detects flat retries and reports interval AND count
PASS CONTROL disabled timer cannot self-heal a boot outage
WATER RETRY: 6 passed, 0 failed
```

The water comparison runs 606 simulated seconds, querying 13 tile URLs every
1.2 seconds with jitter fixed at its midpoint. The deliberately broken control
reinstates the flat 15-second delay and disables automatic retry scheduling.
It produces 507 requests and flat 15.6-second observed intervals; the preserved
loader produces 104 requests with 13.5, 27, 54, then 108-second intervals. The
boot control delivers zero tiles after the wire returns; the preserved loader
delivers queued tiles with no further lookup. These are mutation-control
measurements, not original-checkout RED output. They also are not the reporting
lane's historical walking measurement of 155 requests over 606 seconds.

The existing timing choices were retained:

- GPS: expire after 20 seconds, matching watchPosition's timeout beyond its
  1.2-second callback throttle and 3-second maximum cached-fix age.
- Water: 15-second base, exponential doubling, 120-second ceiling, 0 to 20%
  downward jitter. Preserve the initial retry pace, bound recovery delay and
  spread retry timing across clients.

The retired water guard-leak hypothesis remains closed.

Additional checks: `git diff --check` passes. Exact pending-note parity was
checked programmatically: `vNEXT parity: 10 changelog items, 10 PROOF rows`.

## Complete PURE enumeration

The runner extracts and evaluates the `const PURE` array and every top-level
`PURE.push` statement from `tests/release-gate.mjs`, preserving declared order.
It refuses a list shorter than 141 or containing duplicate entries. It spawns
each audit with Node in this checkout, records stdout/stderr and exit status,
and treats any timeout or nonzero exit as failure. Three independent Node
processes run at a time. The gate source itself was not changed.

Final result: **145 audits run, 145 exited 0, 0 failed**. This is the PURE tier,
not the browser release gate or physical-device proof. The extracted list,
runner and all individual logs remain under `/tmp/r4-proof/`.

```text
  1. r4-app-p1-audit.mjs exit=0
  2. water-retry-audit.mjs exit=0
  3. cloud-off-audit.mjs exit=0
  4. migration-guard-audit.mjs exit=0
  5. sync-observability-audit.mjs exit=0
  6. sync-identity-audit.mjs exit=0
  7. sync-native-audit.mjs exit=0
  8. lab-density-audit.mjs exit=0
  9. crew-outfit-audit.mjs exit=0
 10. dock-line-audit.mjs exit=0
 11. whatsnew-boot-audit.mjs exit=0
 12. wardrobe-noise-audit.mjs exit=0
 13. sync-clientpath-audit.mjs exit=0
 14. sync-authpath-audit.mjs exit=0
 15. sync-path-audit.mjs exit=0
 16. wardrobe-playtest-audit.mjs exit=0
 17. lab-room2-audit.mjs exit=0
 18. stable-stale-disclosure-audit.mjs exit=0
 19. breed-last-colour-audit.mjs exit=0
 20. stable-loss-disclosure-audit.mjs exit=0
 21. lab-health-recovery-audit.mjs exit=0
 22. lab-integration-audit.mjs exit=0
 23. lab-ui-audit.mjs exit=0
 24. laboratory-audit.mjs exit=0
 25. lab-foundation-audit.mjs exit=0
 26. pet-stress-guard.mjs exit=0
 27. crew-pet-node-guard.mjs exit=0
 28. transmog-receipt-audit.mjs exit=0
 29. today-reads-lint.mjs exit=0
 30. kitchen-atomic-audit.mjs exit=0
 31. backup-encoder-audit.mjs exit=0
 32. backup-key-audit.mjs exit=0
 33. backup-version-audit.mjs exit=0
 34. backup-conflict-audit.mjs exit=0
 35. unit.test.js exit=0
 36. log-xp-farm-audit.mjs exit=0
 37. drip-badge-audit.mjs exit=0
 38. xp-key-provenance-lint.mjs exit=0
 39. facegate-audit.mjs exit=0
 40. garden-appetite-guard.mjs exit=0
 41. pit.test.js exit=0
 42. quest-daymore-audit.mjs exit=0
 43. quest-pick-audit.mjs exit=0
 44. first-fight-audit.mjs exit=0
 45. stat-source-audit.mjs exit=0
 46. bastions-rep-sim.mjs exit=0
 47. analytics-tag-audit.mjs exit=0
 48. icon-inventory-audit.mjs exit=0
 49. version-stamp-audit.mjs exit=0
 50. boneyard-supply-audit.mjs exit=0
 51. loot-fallback-audit.mjs exit=0
 52. guard-hygiene-lint.mjs exit=0
 53. guard-provenance-lint.mjs exit=0
 54. feedback-status-lint.mjs exit=0
 55. rack-theme-lint.mjs exit=0
 56. rack-rotate-audit.mjs exit=0
 57. pet-accessory-lint.mjs exit=0
 58. pet-pool-audit.mjs exit=0
 59. manifest-exports-audit.mjs exit=0
 60. xp-curve-audit.mjs exit=0
 61. live-api-register-lint.mjs exit=0
 62. claim-evidence-lint.mjs exit=0
 63. thumb-freshness-lint.mjs exit=0
 64. render-sink-lint.mjs exit=0
 65. lapse-witness-audit.mjs exit=0
 66. spawn-claim-atomic-audit.mjs exit=0
 67. wardrobe-family-audit.mjs exit=0
 68. football-kit-audit.mjs exit=0
 69. restore-latch-audit.mjs exit=0
 70. first-pet-audit.mjs exit=0
 71. shop-economy-audit.mjs exit=0
 72. recovery-status-audit.mjs exit=0
 73. currency-revision-lint.mjs exit=0
 74. inv-tombstone-audit.mjs exit=0
 75. take-and-pay-audit.mjs exit=0
 76. c6-price-audit.mjs exit=0
 77. pet-morph-animation-audit.mjs exit=0
 78. pet-palette-audit.mjs exit=0
 79. fontscale-audit.mjs exit=0
 80. wheel-look-audit.mjs exit=0
 81. wheel-easing-audit.mjs exit=0
 82. storage-boot-audit.mjs exit=0
 83. crate-cadence-audit.mjs exit=0
 84. r4-silence-audit.mjs exit=0
 85. silence-disclosure-audit.mjs exit=0
 86. health-disclosure-audit.mjs exit=0
 87. paddock-pack-audit.mjs exit=0
 88. numbers-honesty-audit.mjs exit=0
 89. locale-numbers-audit.mjs exit=0
 90. audit-output-audit.mjs exit=0
 91. branch-graveyard-audit.mjs exit=0
 92. store-runtime-audit.mjs exit=0
 93. r47-rest-audit.mjs exit=0
 94. r47-economy-audit.mjs exit=0
 95. submission-build-audit.mjs exit=0
 96. harness-environment-audit.mjs exit=0
 97. guard-debts-audit.mjs exit=0
 98. submission-preflight-audit.mjs exit=0
 99. pet-state-audit.mjs exit=0
100. pet-family-audit.mjs exit=0
101. crew-pet-audit.mjs exit=0
102. coins-merge-tie-audit.mjs exit=0
103. routine-race-audit.mjs exit=0
104. dayone-topup-audit.mjs exit=0
105. dish-worth-audit.mjs exit=0
106. pet-C-node-guard.mjs exit=0
107. r48-state-audit.mjs exit=0
108. r46-logging-audit.mjs exit=0
109. r46-diary-audit.mjs exit=0
110. zero-calorie-seam-audit.mjs exit=0
111. audit-completion-audit.mjs exit=0
112. machine-character-audit.mjs exit=0
113. n3-deadpaths-audit.mjs exit=0
114. m5-prove-red.mjs exit=0
115. lookup-guard-lint.mjs exit=0
116. restore-state-audit.mjs exit=0
117. restore-debt-edges-audit.mjs exit=0
118. restore-debt-audit.mjs exit=0
119. p1-r48-rest-audit.mjs exit=0
120. pet-a11y-audit.mjs exit=0
121. kennel-copy-audit.mjs exit=0
122. breed-lock-audit.mjs exit=0
123. device-loss-audit.mjs exit=0
124. multidevice-earnings-audit.mjs exit=0
125. response-bodies-audit.mjs exit=0
126. p1-merge-audit.mjs exit=0
127. quest-wheel-budget-audit.mjs exit=0
128. kitchen-delivery-audit.mjs exit=0
129. map-playtest-audit.mjs exit=0
130. p1-dens-audit.mjs exit=0
131. crew-yard-row-audit.mjs exit=0
132. pet-rarity-audit.mjs exit=0
133. stable-rooms-top-audit.mjs exit=0
134. today-playtest-audit.mjs exit=0
135. crew-playtest-audit.mjs exit=0
136. firstrun-audit.mjs exit=0
137. settings-safety-audit.mjs exit=0
138. progress-playtest-audit.mjs exit=0
139. leaderboard-honesty-audit.mjs exit=0
140. breed-two-tap-audit.mjs exit=0
141. after-await-event-lint.mjs exit=0
142. boneyard-zoom-audit.mjs exit=0
143. lab-conflict-audit.mjs exit=0
144. lab-lock-recovery-audit.mjs exit=0
145. r3-rest-audit.mjs exit=0
```

## Denied or blocked actions and deviations

- No permission or automatic-approval denial occurred. No commit, push,
  publish, external message or original-checkout edit was attempted.
- No edits touched `assets/bh/**`, `js/hunt.js`, spawn density guards or the
  restore-point eviction/import policy. No boundary collision occurred in
  `js/db.js` because its working source was preserved.
- Missing starting audit files made the frozen request for their original RED
  output impossible. Reconstructing them against the existing fixes is the
  disclosed deviation. An original RED or arrival silence verdict is not
  claimed. Historical statements in inherited documents remain labeled history.
- R4-20 remains partially fulfilled. Classifier recovery is proven. The visible
  MapLibre boot error path at `js/app.js:22747` calls `floorMap` after six seconds
  without a tile; teardown removes the map at `js/app.js:22506`. The tiles spec
  explicitly excludes editing app.js for that defect. Proposed deviation for
  the owning lane: permit retrying map creation while the Boneyard remains open,
  then prove actual rendered tile delivery after a boot outage. The classifier
  proof cannot certify that behavior, and no visible-map recovery is claimed.
- Existing localStorage journaling is the spec's allowed alternative to
  IndexedDB, retained to make the journal synchronous and independent of a
  failing IndexedDB transaction. It differs from the stated preference to
  reuse the fight/draft mechanism. Storage denial/eviction is still a limit.
- Pending changelog notes are exported separately as `NEXT_CHANGES`, so the
  operator can assign the train version. They are not inserted into a shipped
  build's notes or made visible as an unversioned release.
- The existing XP-farm audit needed a clock-fixture correction after its RED
  output was run and read. No assertion was weakened. No previously working
  production partial fix was rewritten.

These green Node results do not remove the visible-map boundary or replace
independent review of the final diff.
