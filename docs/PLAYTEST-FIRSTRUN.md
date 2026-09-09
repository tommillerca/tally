# First-run playtest

Advisory report for independent review. Frozen plan SHA256 verified:
`cd8e5c25ba339d5ccbb140bb96be6cffa4a88dd9e5f552a719350bb755130921`.
All source paths refer to this checkout. No original checkout was edited.

## Findings, ranked by player harm

### F1. Interrupted welcome delivery permanently loses the kit (fixed for new deliveries)

**Reproduction:** Run `node tests/firstrun-audit.mjs` against the original production files. On a fresh `useDbName`, invoke `initLootIfNeeded`. Either let the transaction writing `loot-init` commit and abort every subsequently opened transaction, or abort the first inventory crate transaction. Clear the fault and invoke `initLootIfNeeded` twice more. The audit wraps the real IndexedDB transaction and object-store methods supplied by `tests/mem-idb.mjs`. It does not replace the production reward function.

**Source:** Original `js/game.js:1255` reserved `loot-init` before the separate grants at lines 1256 to 1324. `js/app.js:15803` calls this during onboarding; `js/app.js:1772` calls it again on later boots. The replacement is `js/game.js:1244`, using the existing transaction primitive at `js/db.js:725`.

**Observed:** Both interruption modes left `loot-init=true` with zero crates, eggs, Draughts, ingredients and coins. Reopening returned a no-op. The expected kit is two crates, one ready egg, one Vigor Draught, two Marrow, one Grave Salt and 40 coins.

**Impact:** The player's promised first rewards can be lost permanently. The hatch and cooking introductions also lose their supplies. This is a storage-boundary failure, independent of network availability.

**Certainty:** High for the production storage mechanism. Actual mobile process termination was not exercised.

**Fix:** Build inventory rows using the shipped row constructors, then read the kit flag and existing coin receipt inside `payAtomic`. The kit flag, inventory, ingredients, day-one coin receipt, coins and coin revision now commit together. A failed transaction leaves the whole kit eligible for retry. Overlapping first boots yield exactly one kit. The existing `dayone-topup` ledger and currency receipt identity are preserved, including the control with a previously paid top-up and no kit flag. The 40-coin amount, egg tier, ingredients and crate types are unchanged.

**Unfixed legacy limit:** A pre-fix save already carrying `loot-init=true` cannot reliably distinguish a lost kit from a kit that was delivered and consumed. The legacy no-op remains. A retrospective compensation policy or additional historical evidence is needed to repair those saves safely. Proposed follow-up: have the economy/save owner decide compensation explicitly; do not infer missing rewards from an empty inventory. This is disclosed rather than silently regranting goods.

### F2. Onboarding promises XP for every meal despite a daily limit (fixed)

**Reproduction:** Render production onboarding step 1 through the actual Meet control or `renderOnboarding(1)`. Persist 21 distinct current-day food rows, calling production `onFoodLogged` for each. Read the resulting XP ledger and the rendered onboarding HTML.

**Source:** `js/app.js:15716`; production limit `js/game.js:146`; reward handling `js/game.js:675` and `js/game.js:697`.

**Observed:** The original HTML said `XP, every meal`. Exactly 20 base logging awards existed, and the 21st callback returned zero XP in the exercised state. The cap control is based on production `XP_DAILY_CAP.log`.

**Impact:** A new player can reasonably expect a reward for another logged meal that the game does not pay. This is misleading copy, not lost earned XP: the cap is intentional.

**Certainty:** High for text and reward behavior. Layout of the replacement sentence could not be seen.

**Fix:** The real template now says `XP: first 20 logs today`, with the number read from `XP_DAILY_CAP.log`.

## Recorded red and green proof

Before either production fix, the runnable audit exited 1. Its original seven rows included four passing controls:

```text
FAIL F1 after-claim: retry delivers the complete kit exactly once: recovered kit = {"crates":0,"eggs":0,"vigor":0,"ingredients":{},"coins":0}
+ actual - expected

  {
+   coins: 0,
+   crates: 0,
+   eggs: 0,
+   ingredients: {},
+   vigor: 0
-   coins: 40,
-   crates: 2,
-   eggs: 1,
-   ingredients: {
-     marrow: 2,
-     salt: 1
-   },
-   vigor: 1
  }

FAIL F1 abort: retry delivers the complete kit exactly once: recovered kit = {"crates":0,"eggs":0,"vigor":0,"ingredients":{},"coins":0}
+ actual - expected

  {
+   coins: 0,
+   crates: 0,
+   eggs: 0,
+   ingredients: {},
+   vigor: 0
-   coins: 40,
-   crates: 2,
-   eggs: 1,
-   ingredients: {
-     marrow: 2,
-     salt: 1
-   },
-   vigor: 1
  }

PASS CONTROL concurrent first boots and later boot deliver only one kit
PASS CONTROL legacy kit and existing coin receipt never pay again
PASS CONTROL onboarding Meet, reroll, accept, back and skip handlers work
FAIL F2 onboarding explains the actual daily logging XP limit: render omits the daily XP limit
PASS CONTROL first-day kit opens, hatches and cooks with persisted deliveries
firstrun: 4 passed, 3 failed
```

After the fixes, it exited 0. One additional healthy-path control was added to drive the real initial-settings persistence, and the cooking control also checks the stored Pantry delivery:

```text
PASS F1 after-claim: retry delivers the complete kit exactly once
PASS F1 abort: retry delivers the complete kit exactly once
PASS CONTROL concurrent first boots and later boot deliver only one kit
PASS CONTROL legacy kit and existing coin receipt never pay again
PASS CONTROL onboarding Meet, reroll, accept, back and skip handlers work
PASS F2 onboarding explains the actual daily logging XP limit
PASS CONTROL first-day kit opens, hatches and cooks with persisted deliveries
PASS CONTROL onboarding saves the default plan and kit through production persistence
firstrun: 8 passed, 0 failed
```

The landed check is `tests/firstrun-audit.mjs`, registered in PURE at `tests/release-gate.mjs:347`. It writes no scratch files. All transient runners and transcripts live outside the checkout under `/private/tmp`.

## Healthy paths actually exercised

- Production onboarding render and handlers: Meet, name reroll, accept, back, accept again, and Skip. The accepted name persists; back preserves the same choice; Skip supplies the advertised age and height.
- Production `saveInitialSettings`, `guardSaveBeforeInit`, `saveSettings`, and `snapSettings` with a clean database: the default profile, computed targets, game-init marker, existing-news marker and full kit persist before the app-entry callback. The test resolves the sole dynamic changelog import to this checkout. Social registration is disabled through the production demo branch, and app entry is an observed endpoint double.
- Two simultaneous initializers and a later initializer: one kit, one top-up ledger row, and exactly 40 coins and coin revision. Legacy completed kits pay nothing. An existing top-up receipt does not pay again.
- Welcome egg: production hatch delivers one pet and equips its species in the outfit. Both welcome crates deliver nonempty hands, remove their input rows, and reject reuse.
- Starter Bone Broth: starts with the real pouch, cannot be served early, delivers exactly one persisted Pantry dish after 15 simulated minutes, and cannot be served twice.
- Logging: 21 persisted food entries exercise the actual capped reward path, with exactly 20 base awards and no base XP from the extra entry.
- Existing PURE first-fight audit: 400/400 guarded first fights win; the unguarded control loses 31/400. The guard stops applying after a first win.
- Existing PURE day-one audit: local registration refusal is actually reached twice, while the wallet still has its 40-coin kit top-up plus the existing 50-coin social welcome. Its 12-seed day-close simulation reported min 286, median 305, max 316 coins; light walker min 90, median 106, max 115. That audit grades the median against 300, and its simulator persists meals without calling `onFoodLogged`. These numbers are not proof that every fully played first day clears the shop floor.

No browser was opened and no socket was bound. DOM endpoint doubles do not establish actual visibility, hit targets, scrolling, art decode, animation, native health integration, or layout. Cosmetic issues could not be seen. Full browser onboarding, actual account registration and native first launch remain unverified.

## Agreed proof and other verification

`node tests/unit.test.js` exited 0:

```text
377 passed, 0 failed
```

All 116 entries in the production PURE list exited 0. The temporary runner evaluates the complete `const PURE` declaration plus its push/unshift statements, then executes every entry individually. It does not start `tests/release-gate.mjs`, whose normal entry point binds a server. Initial result was 112/116 because four entries explicitly exited 97 for missing `esprima`. After restoring the exact lockfile dependency offline, all four were rerun and exited 0. Final result:

```text
PASS store-copy-lint.mjs exit=0
PASS store-runtime-audit.mjs exit=0
PASS submission-build-audit.mjs exit=0
PASS submission-preflight-audit.mjs exit=0
PURE: 116/116 passed
```

`node --check js/app.js`, `node --check js/game.js`, and `git diff --check` also passed.

The static portion of `tests/reward-sop-audit.mjs` was executed without its browser/server portion. It has two pre-existing failing coverage checks: unregistered actions outside onboarding, and stale payout counts outside onboarding. A read-only `git show HEAD:<path>` comparison proved the baseline and final failure messages identical. The onboarding registry row now counts its one atomic payout instead of seven separate grants and cites the new audit. These unrelated registry failures remain unfixed and are not part of the agreed PURE list. Do not read the PURE result as a passing full browser release gate.

## Files changed

- `js/game.js`: atomic first-run kit delivery using existing primitives and row constructors.
- `js/app.js`: truthful onboarding logging-XP limit.
- `tests/firstrun-audit.mjs`: production-function and handler regression audit, plus healthy first-day controls.
- `tests/release-gate.mjs`: register the audit in PURE.
- `tests/reward-sop-audit.mjs`: update only the existing welcome-kit payout registry row.
- `docs/PLAYTEST-FIRSTRUN.md`: findings, reproduction, proof and limits.

Local setup also added ignored `node_modules/esprima` (version 4.0.1). Its cached tarball was verified against the SHA512 in the unchanged `package-lock.json`. It is not a source change or vendored deliverable.

## Denied, blocked and deferred actions

- No commit, push, PR, publish, deployment, Worker mutation, remote Wrangler invocation, production D1 write or secret change was attempted. `native/ASC-SUBMISSION.md` and all artwork remain untouched.
- Missing `esprima` initially blocked four PURE checks. An offline version-name package request returned `ENOTCACHED`; a direct cached-tarball npm request then returned `EPERM` while trying to create a temporary directory in the read-only global npm cache. No permission escalation or ownership change was attempted. The fallback read the cached content without modifying the cache, verified its lockfile hash, and unpacked it into this checkout's ignored dependency directory.
- Browser and socket checks were deliberately excluded as required by the frozen plan. They were not attempted and are not represented as passing.
- Legacy interrupted-kit recovery and unrelated reward-registry drift remain deferred for the reasons above.

No redesign or reward-policy deviation was made. Source changes stay within onboarding and its welcome-kit initializer; shared storage primitives and other reward systems were not edited. The only execution adjustment was offline dependency recovery and individually running PURE entries to obey the no-socket requirement.

## PURE exit ledger

Every entry below exited 0, including the four dependency-repaired retries:

```text
version-align-lint.mjs exit=0
no-debug-markers-lint.mjs exit=0
store-copy-lint.mjs exit=0
lab-room2-audit.mjs exit=0
stable-stale-disclosure-audit.mjs exit=0
breed-last-colour-audit.mjs exit=0
stable-loss-disclosure-audit.mjs exit=0
lab-health-recovery-audit.mjs exit=0
lab-integration-audit.mjs exit=0
lab-ui-audit.mjs exit=0
laboratory-audit.mjs exit=0
lab-foundation-audit.mjs exit=0
pet-stress-guard.mjs exit=0
crew-pet-node-guard.mjs exit=0
transmog-receipt-audit.mjs exit=0
today-reads-lint.mjs exit=0
kitchen-atomic-audit.mjs exit=0
backup-encoder-audit.mjs exit=0
backup-key-audit.mjs exit=0
backup-version-audit.mjs exit=0
backup-conflict-audit.mjs exit=0
unit.test.js exit=0
log-xp-farm-audit.mjs exit=0
drip-badge-audit.mjs exit=0
xp-key-provenance-lint.mjs exit=0
facegate-audit.mjs exit=0
garden-appetite-guard.mjs exit=0
pit.test.js exit=0
quest-daymore-audit.mjs exit=0
quest-pick-audit.mjs exit=0
first-fight-audit.mjs exit=0
stat-source-audit.mjs exit=0
bastions-rep-sim.mjs exit=0
analytics-tag-audit.mjs exit=0
icon-inventory-audit.mjs exit=0
version-stamp-audit.mjs exit=0
boneyard-supply-audit.mjs exit=0
loot-fallback-audit.mjs exit=0
guard-hygiene-lint.mjs exit=0
guard-provenance-lint.mjs exit=0
feedback-status-lint.mjs exit=0
rack-theme-lint.mjs exit=0
rack-rotate-audit.mjs exit=0
pet-accessory-lint.mjs exit=0
pet-pool-audit.mjs exit=0
manifest-exports-audit.mjs exit=0
xp-curve-audit.mjs exit=0
live-api-register-lint.mjs exit=0
claim-evidence-lint.mjs exit=0
thumb-freshness-lint.mjs exit=0
render-sink-lint.mjs exit=0
lapse-witness-audit.mjs exit=0
spawn-claim-atomic-audit.mjs exit=0
wardrobe-family-audit.mjs exit=0
football-kit-audit.mjs exit=0
restore-latch-audit.mjs exit=0
first-pet-audit.mjs exit=0
recovery-status-audit.mjs exit=0
currency-revision-lint.mjs exit=0
inv-tombstone-audit.mjs exit=0
take-and-pay-audit.mjs exit=0
pet-morph-animation-audit.mjs exit=0
pet-palette-audit.mjs exit=0
fontscale-audit.mjs exit=0
wheel-easing-audit.mjs exit=0
storage-boot-audit.mjs exit=0
crate-cadence-audit.mjs exit=0
silence-disclosure-audit.mjs exit=0
health-disclosure-audit.mjs exit=0
paddock-pack-audit.mjs exit=0
numbers-honesty-audit.mjs exit=0
locale-numbers-audit.mjs exit=0
audit-output-audit.mjs exit=0
branch-graveyard-audit.mjs exit=0
store-runtime-audit.mjs exit=0
r47-rest-audit.mjs exit=0
r47-economy-audit.mjs exit=0
submission-build-audit.mjs exit=0
harness-environment-audit.mjs exit=0
guard-debts-audit.mjs exit=0
submission-preflight-audit.mjs exit=0
pet-state-audit.mjs exit=0
pet-family-audit.mjs exit=0
crew-pet-audit.mjs exit=0
coins-merge-tie-audit.mjs exit=0
routine-race-audit.mjs exit=0
dayone-topup-audit.mjs exit=0
dish-worth-audit.mjs exit=0
pet-C-node-guard.mjs exit=0
r48-state-audit.mjs exit=0
r46-logging-audit.mjs exit=0
r46-diary-audit.mjs exit=0
zero-calorie-seam-audit.mjs exit=0
audit-completion-audit.mjs exit=0
machine-character-audit.mjs exit=0
n3-deadpaths-audit.mjs exit=0
m5-prove-red.mjs exit=0
lookup-guard-lint.mjs exit=0
restore-state-audit.mjs exit=0
restore-debt-edges-audit.mjs exit=0
restore-debt-audit.mjs exit=0
p1-r48-rest-audit.mjs exit=0
pet-a11y-audit.mjs exit=0
kennel-copy-audit.mjs exit=0
breed-lock-audit.mjs exit=0
device-loss-audit.mjs exit=0
multidevice-earnings-audit.mjs exit=0
response-bodies-audit.mjs exit=0
p1-merge-audit.mjs exit=0
quest-wheel-budget-audit.mjs exit=0
kitchen-delivery-audit.mjs exit=0
p1-dens-audit.mjs exit=0
crew-yard-row-audit.mjs exit=0
pet-rarity-audit.mjs exit=0
stable-rooms-top-audit.mjs exit=0
firstrun-audit.mjs exit=0
```
