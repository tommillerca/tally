# Crew outfit advisory review

Frozen plan SHA256 verified before work:
`37b9d004c7f4471c78261e09e0c66b35943e959d07565424229046a9e2fbfd63`.
All source paths were resolved within this checkout. The plan's `tally/CLAUDE.md`
is this checkout's `CLAUDE.md`.

## Diagnosis and scope

A reproducible loss occurs at hop 2 for the pet wardrobe: the Stable's garment
toggle and football team controls successfully persist `petWear` but never
schedule a public profile upload. Body wardrobe changes already schedule one.
Before editing production, the runnable check passed its body football control
and failed on pet equip, team swap and unequip with zero pending uploads. This
finding and its limited scope were reported in chat before the fix.

The supplied account report does not identify the exact items or whether the
football kit belongs to the Bonehead or its pet. This change fixes the measured
pet publish defect. It does not establish that this was the cause of Tom's
friend's specific stale body outfit. No body-slot mapper defect was found.

## Forward trace

1. **Local write.** `js/app.js`'s wardrobe `doEquip` and football `data-fbwear`
   handler await `equip()` and call `pushProfileSoon()`. `js/loot.js:3069`
   validates the catalog item, slot and ownership, then writes kv `equipped`.
   `equipped()` resolves valid slots and transmog for display. Football uses
   existing body slots. For pets, the Stable's `data-petwear` and `data-pwteam`
   callbacks call `togglePetWear()` (`js/loot.js:736`), which checks ownership
   and atomically updates kv `petWear`. The regression runs these production
   pet callbacks over real loot functions and the existing memory IndexedDB
   harness. It asserts the saved real football item before asserting a push.
2. **Snapshot and trigger.** `socialSnapshot()` (`js/app.js:24554`) awaits
   game initialization, reads `equipped()` and `petWear()`, then returns
   `outfit: eq` and `yard.wear`. Pet identity and shiny come from `fighter.petMeta`.
   `pushProfileSoon()` (`js/app.js:24726`) debounces 1,200 ms, checks online
   status, and calls `social.syncProfile()`. `js/social.js:983` sends
   `PUT /profile`. Before this fix, the two pet wardrobe callbacks omitted
   that trigger. `autoSync()` runs at boot and resume, with a five-minute
   throttle (`js/social.js:1816` onward and `js/app.js:1355,1382`), not an
   unconditional five-minute interval. Other explicit profile pushes can
   eventually update it, but a pet outfit change alone did not. The fix uses
   the existing debounce after each successful write, including successful
   pieces of a partial team swap. Refused or unchanged choices schedule nothing.
3. **Server acceptance.** `SNAP_KEYS` (`server/src/index.js:1478`) includes
   `outfit` and `yard`. `boundSnapValue()` copies nested maps with size/depth
   bounds, without enumerating outfit slots. The new check executes the actual
   full `sanitizeSnapshot()` and asserts exact equality of the actual outfit
   and pet wardrobe maps. Real long IDs such as
   `fb-boneyard-bruisers-pet-jersey` survive. The `PUT /profile` handler at
   line 2208 serializes `checked.snap` into the D1 player update. This last
   database operation was inspected, not executed against D1. No server loss
   was reproduced and no Worker edit or deployment is needed for this fix.
4. **Fetch and caching.** `listFriends()` (`js/social.js:713`) performs signed
   `GET /friends`, validates the response and adds private aliases without
   projecting outfit slots. The server's accepted-friend `shape` returns the
   entire parsed stored profile (`server/src/index.js:2714` onward); pending
   rows also retain the whole outfit map. The regression executes the actual
   accepted-friend shape and client response validation, replacing transport
   at `signedFetch` so it cannot contact a server. Crew calls `paint()` on
   entry, which fetches a fresh list (`js/app.js:13188,13714`). There is no
   client friends-response cache in this path. `sw.js:630` bypasses cross-origin
   API requests. The inspected Worker JSON helper supplies no cache policy;
   deployed intermediary behavior was not measured. An already open Crew
   sheet is not a live subscription and may require reopening to fetch again.
5. **Render props.** `crewCardArtHtml()` (`js/app.js:12343`) and
   `openFriendProfile()` (`js/app.js:13764`) use `p.outfit` directly. Both read
   pet wear from `p.yard.wear`, guarded by the yard's pets array. The new check
   executes both production templates and captures their renderer arguments:
   identical outfit maps, `foreign: true`, snapshot shiny and snapshot wear.
   A nonshiny friend is checked against a viewer owning that shiny, and a
   shiny friend against a viewer without it. No outfit shiny lookup or viewer
   pet wardrobe lookup was introduced.
6. **Renderer.** `avatarLayersHtml()` (`js/app.js:6387`) iterates `BH_SLOTS`,
   resolves each item through `BH_BY_ID` and emits the football item's master
   image plus existing tint markup. The new body helmet control executes that
   renderer and asserts the helmet image and tint output. Pet renderer
   arguments are captured by this check; the existing PURE
   `crew-pet-audit.mjs` separately executes real pet markup for football kit,
   shiny, morph and legacy snapshots at DPR 2/3. These are source/markup
   checks, not decoded browser pixels. Cam's assets, colors and rendering
   implementation were not modified.

## Files changed

- `js/app.js`: two missing pet wardrobe profile-push calls.
- `tests/crew-outfit-audit.mjs`: permanent runnable regression, with body
  positive control, pet changes, debounce, shiny, refusal and offline checks.
- `tests/release-gate.mjs`: register the new regression in PURE.
- `docs/fix-crew-outfit.md`: this trace, evidence and advisory report.

## RED and GREEN

The check was developed at `/private/tmp/crew-outfit-audit.mjs`, outside `tests/`.
It first failed on the unmodified application. After expanding coverage, both
fix lines were temporarily removed, the final seven-row check was run RED,
then both lines were restored and the check run GREEN. Only after GREEN was
the permanent check installed in `tests/` and registered in PURE. Source
seams and real catalog fixtures are asserted so empty samples cannot pass.

Final seven-row RED, `node /private/tmp/crew-outfit-audit.mjs`, exit 1:

```text
PASS CONTROL body football survives publish, sanitizer, friends, card and profile
FAIL pet garment equip publishes within the existing debounce: saved pet outfit scheduled no profile push

0 !== 1

FAIL pet football team change publishes the new colourway: saved team scheduled no profile push

0 !== 1

FAIL unequip publishes bare; refused garment schedules nothing: Expected values to be strictly equal:

0 !== 1

FAIL rapid garment changes coalesce and preserve snapshot shiny: Expected values to be strictly equal:

0 !== 1

PASS unchanged and unavailable team choices do not publish
FAIL offline changes remain local without a transport attempt: Expected values to be strictly equal:

0 !== 1

2/7 passed; 1 captured profile uploads; pixel review owed.
```

GREEN, same command after restoring the fix, exit 0:

```text
PASS CONTROL body football survives publish, sanitizer, friends, card and profile
PASS pet garment equip publishes within the existing debounce
PASS pet football team change publishes the new colourway
PASS unequip publishes bare; refused garment schedules nothing
PASS rapid garment changes coalesce and preserve snapshot shiny
PASS unchanged and unavailable team choices do not publish
PASS offline changes remain local without a transport attempt
7/7 passed; 5 captured profile uploads; pixel review owed.
```

The landed `node tests/crew-outfit-audit.mjs` also exited 0 in PURE.

Agreed command `node tests/unit.test.js`, exit 0:

```text
377 passed, 0 failed
```

Every PURE entry, including all later `PURE.push` and `PURE.unshift` entries,
was derived from `tests/release-gate.mjs` and invoked as `node tests/<entry>`.
The temporary runner respected its SERIAL classification. It did not execute
the gate's server or browser stages.

Initial pass: 120/124 exited 0. Four checks exited 97 with this prerequisite
failure, not an assertion failure:

```text
UNPRV esprima  DID NOT RUN: missing dependency esprima. Install from this checkout root: npm ci --include=dev
```

The declared `esprima@4.0.1` archive was available in the local npm cache.
Its SHA512 was verified against `package-lock.json` before extraction into
this checkout's ignored `node_modules/esprima`. No network, lifecycle scripts
or package/lockfile edits were needed. The four affected checks were rerun:

```text
PASS store-copy-lint.mjs exit=0
PASS store-runtime-audit.mjs exit=0
PASS submission-build-audit.mjs exit=0
PASS submission-preflight-audit.mjs exit=0
PURE final: 124/124 exited 0
```

Full transient stdout/stderr logs and the runner are retained under
`/private/tmp/fix-crew-outfit-proof/`. Final exit inventory:

```text
analytics-tag-audit.mjs: 0
audit-completion-audit.mjs: 0
audit-output-audit.mjs: 0
backup-conflict-audit.mjs: 0
backup-encoder-audit.mjs: 0
backup-key-audit.mjs: 0
backup-version-audit.mjs: 0
bastions-rep-sim.mjs: 0
boneyard-supply-audit.mjs: 0
branch-graveyard-audit.mjs: 0
breed-last-colour-audit.mjs: 0
breed-lock-audit.mjs: 0
claim-evidence-lint.mjs: 0
coins-merge-tie-audit.mjs: 0
crate-cadence-audit.mjs: 0
crew-outfit-audit.mjs: 0
crew-pet-audit.mjs: 0
crew-pet-node-guard.mjs: 0
crew-playtest-audit.mjs: 0
crew-yard-row-audit.mjs: 0
currency-revision-lint.mjs: 0
dayone-topup-audit.mjs: 0
device-loss-audit.mjs: 0
dish-worth-audit.mjs: 0
drip-badge-audit.mjs: 0
facegate-audit.mjs: 0
feedback-status-lint.mjs: 0
first-fight-audit.mjs: 0
first-pet-audit.mjs: 0
firstrun-audit.mjs: 0
fontscale-audit.mjs: 0
football-kit-audit.mjs: 0
garden-appetite-guard.mjs: 0
guard-debts-audit.mjs: 0
guard-hygiene-lint.mjs: 0
guard-provenance-lint.mjs: 0
harness-environment-audit.mjs: 0
health-disclosure-audit.mjs: 0
icon-inventory-audit.mjs: 0
inv-tombstone-audit.mjs: 0
kennel-copy-audit.mjs: 0
kitchen-atomic-audit.mjs: 0
kitchen-delivery-audit.mjs: 0
lab-foundation-audit.mjs: 0
lab-health-recovery-audit.mjs: 0
lab-integration-audit.mjs: 0
lab-room2-audit.mjs: 0
lab-ui-audit.mjs: 0
laboratory-audit.mjs: 0
lapse-witness-audit.mjs: 0
live-api-register-lint.mjs: 0
locale-numbers-audit.mjs: 0
log-xp-farm-audit.mjs: 0
lookup-guard-lint.mjs: 0
loot-fallback-audit.mjs: 0
m5-prove-red.mjs: 0
machine-character-audit.mjs: 0
manifest-exports-audit.mjs: 0
map-playtest-audit.mjs: 0
multidevice-earnings-audit.mjs: 0
n3-deadpaths-audit.mjs: 0
no-debug-markers-lint.mjs: 0
numbers-honesty-audit.mjs: 0
p1-dens-audit.mjs: 0
p1-merge-audit.mjs: 0
p1-r48-rest-audit.mjs: 0
paddock-pack-audit.mjs: 0
pet-C-node-guard.mjs: 0
pet-a11y-audit.mjs: 0
pet-accessory-lint.mjs: 0
pet-family-audit.mjs: 0
pet-morph-animation-audit.mjs: 0
pet-palette-audit.mjs: 0
pet-pool-audit.mjs: 0
pet-rarity-audit.mjs: 0
pet-state-audit.mjs: 0
pet-stress-guard.mjs: 0
pit.test.js: 0
progress-playtest-audit.mjs: 0
quest-daymore-audit.mjs: 0
quest-pick-audit.mjs: 0
quest-wheel-budget-audit.mjs: 0
r46-diary-audit.mjs: 0
r46-logging-audit.mjs: 0
r47-economy-audit.mjs: 0
r47-rest-audit.mjs: 0
r48-state-audit.mjs: 0
rack-rotate-audit.mjs: 0
rack-theme-lint.mjs: 0
recovery-status-audit.mjs: 0
render-sink-lint.mjs: 0
response-bodies-audit.mjs: 0
restore-debt-audit.mjs: 0
restore-debt-edges-audit.mjs: 0
restore-latch-audit.mjs: 0
restore-state-audit.mjs: 0
routine-race-audit.mjs: 0
settings-safety-audit.mjs: 0
shop-economy-audit.mjs: 0
silence-disclosure-audit.mjs: 0
spawn-claim-atomic-audit.mjs: 0
stable-loss-disclosure-audit.mjs: 0
stable-rooms-top-audit.mjs: 0
stable-stale-disclosure-audit.mjs: 0
stat-source-audit.mjs: 0
storage-boot-audit.mjs: 0
store-copy-lint.mjs: 0
store-runtime-audit.mjs: 0
submission-build-audit.mjs: 0
submission-preflight-audit.mjs: 0
take-and-pay-audit.mjs: 0
thumb-freshness-lint.mjs: 0
today-playtest-audit.mjs: 0
today-reads-lint.mjs: 0
transmog-receipt-audit.mjs: 0
unit.test.js: 0
version-align-lint.mjs: 0
version-stamp-audit.mjs: 0
wardrobe-family-audit.mjs: 0
wardrobe-playtest-audit.mjs: 0
wheel-easing-audit.mjs: 0
xp-curve-audit.mjs: 0
xp-key-provenance-lint.mjs: 0
zero-calorie-seam-audit.mjs: 0
```

## Restrictions, deviations and unresolved evidence

- No denied tool actions. The four missing-dependency checks were initially
  blocked and then resolved as described above.
- No commit, push, PR, publication, Worker deploy, remote Wrangler command,
  production D1 write or secret operation was attempted. No original checkout
  was edited. `native/ASC-SUBMISSION.md` was not modified.
- No scratch files were written inside `tests/`. The new test is a permanent
  regression. Test logs and temporary runners are outside the checkout.
- Pixel review is owed. No sockets were bound and no browser, UI-audit or
  figure-audit pixel claim is made. The user's frozen no-socket constraint
  prevents satisfying the local figure contract's visual completion checks.
- No requirement was silently redesigned. The verified fix is narrower than
  the reported symptom: pet wardrobe publication. The suspected body outfit
  slot loss was not reproduced. A follow-up should establish the affected
  friend's exact body/pet item IDs, app versions and persisted accepted-friend
  snapshot, then compare a newly reopened Crew card and profile. That evidence
  is needed before claiming the original incident is resolved.
- Publication remains best-effort under the existing online check and debounce.
  Offline changes, a failed upload or an app closed before the timer can run
  may wait for the next existing sync trigger. No retry/lifecycle redesign was
  included without evidence of that being this incident's cause.

This report is advisory. Independent review of the final checkout changes
and the outstanding visual/account evidence is still required.
