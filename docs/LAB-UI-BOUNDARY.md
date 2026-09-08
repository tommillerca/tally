# Laboratory UI integration boundary

Frozen BUILD 2b, 2026-09-08. Plan SHA256:
`254dccb8122b694eb19f21719213e75e61deeba827dde234f353312166270ac8`.

`js/app.js` owns presentation. The engine is absent in this checkout. The room
therefore opens as a read-only recipe overview and explicitly says it is
unavailable in this build. It reads existing pets and egg progress without
performing migrations or inventing eligibility. Review and spending are disabled.
The permanent room links work. Today promotion and its restore setting stay
inactive until the engine exists.

The proposed integration seam is a named `laboratory` export from `js/loot.js`,
with `version: 1` and these asynchronous methods. Exporting a namespace object
keeps the existing app import valid before the engine lane lands. These method
names are a proposed boundary because LAB-SPEC defines records and behavior,
but does not provide callable API signatures. Do not publish this intermediate
checkout as a complete Laboratory release.

## Methods

- `snapshot(pre = {})`: coherent presentation snapshot described below. A normal
  room read performs the engine's required preparation, live quota validation and
  intent/receipt readback. `presentationOnly: true` must be read-only. Today passes
  its existing `inv`, `health`, `log`, and `xp` arrays; reuse these rather than
  rescanning those stores. Snapshot preparation, caching and the pure safe/useful
  predicate belong to the engine. The UI does not infer recommendation safety
  from loose duplicate counts.
- `quote({iids: [first, second]})`: `{ok: true, quote}` or a definite refusal. No
  spend, outcome draw, persisted intent or automatic selection. Settle live
  investments as required by LAB-SPEC. Called for the selected-pair preview and
  again at Review. A refreshed quote must have a fresh operation ID.
- `animate({quote, acknowledgedRisk})`: commit the exact reviewed request.
  `acknowledgedRisk` is `ANIMATE` for any investment or lost collection cell,
  otherwise `reviewed`. The engine must independently enforce acknowledgement,
  eligibility, live snapshot equality, date trust and atomicity. Return
  `{ok: true, receipt}` for both a commit and an idempotent replay. The UI awaits
  `rollDayIfNeeded()` before dispatch and never substitutes inputs after refusal.
- `purchase({slot, opId, snapshotToken})`: validate the reviewed snapshot, current
  balance, previous experiment, sequential slots and fixed 20,000/40,000 prices;
  atomically buy capacity. The UI requires a separate second purchase action.
  Return `{ok: true}` or refusal. The engine owns purchase recovery and must refuse
  unresolved purchase intents until readback. The UI never writes coins or slots.
- `acknowledge(opId)`: union the receipt ID into `labSeen`. No receipt deletion,
  grants, new result, refund or capacity change.
- `setUi(patch)`: update only `introRead` and/or `todayHidden`, retain the other
  field, advance the versioned revision, and enforce LAB-SPEC backup/merge rules.
  Opening the room and completing an experiment must not unhide Today. Animate
  marks the introduction read; closing the help marks it read explicitly.

Definite Animate refusal reasons recognized by the UI are `confirmed-abort`,
`stale-quote`, `ineligible`, `cap-reached`, `clock-backwards`, `unwitnessed-day`,
and `restore-conflict`. `confirmed-abort` requires the spec's unchanged-state
readback. All other reasons, including `unknown`, and thrown dispatch errors keep
new submissions blocked pending recovery. The engine must persist the confirmed
intent before uncertain dispatch so this also holds across a process restart.

## Snapshot

```js
{
  status: 'ready', // or unavailable/read-error/unknown/clock-backwards/
                   // unwitnessed-day/restore-conflict
  token, used, capacity, remaining, resetTime, zone, coins,
  collectionCount, hasExperiment, priorDay,
  hasEligiblePair, hasSafePair, hasSafeUsefulPair,
  pets: [/* normalized presentation rows below */],
  species: {
    C1: {
      count, complete, hasEligiblePair,
      safeCounts: {base, ember, frost, toxic, rose, midnight},
      recipes: {
        'base-base': {distribution, explanation, shortage},
        'ember-frost': {distribution, explanation, shortage},
        'toxic-rose': {distribution, explanation, shortage}
      }
    } // C2 through C6 use the same shape
  },
  eggs: [{steps, goal, ready}],
  ui: {format: 1, introRead, todayHidden, revision},
  unseen: [/* enriched saved receipts, oldest first */],
  recoveredOpIds: [/* IDs whose intent/commit outcome is now established */]
}
```

`priorDay` means an actual previously completed local day, not merely a prior
creation timestamp. `safeCounts` reserve a collection keeper and exclude invested
pets. `hasSafeUsefulPair` must implement the full section 8 predicate: two distinct
legal same-species inputs, no partial training/name/lineage/bond/talents/equipment,
every branch retaining every current cell, and a missing output or needed
ingredient. Two last Bases do not qualify. All 36 owned suppresses promotion.

Each `pets` row includes `iid`, `sp`, normalized `morph`, `shiny`, `lineage`,
`bankedSteps`, `level`, `nickname`, `bond`, `talents` (display names), `equipped`,
`eligible`, `reason`, `safeSurplus`, `lastCopy`, and optional `neededFor` (recipe
label). All amounts and metadata must be validated and current. `safeSurplus` is
never a substitute for pair-wide branch checking. Keep excluded shiny, CX and
unsupported rows visible with their specific reason. Trained and last-copy
ordinary pets remain eligible. The UI sorts plain surplus first and selects
nothing automatically.

Species recipes contain the exact current distribution after protection. Without
a selected species, the UI shows the three baseline strips, including Midnight
100%. It never offers a chosen-output control. A missing engine snapshot shows
unknown safe-spare counts, not a fabricated zero.

## Quotes and receipts

Use the durable shapes in LAB-SPEC section 2, with presentation annotations:

- `quote.inputs` uses the normalized rows above, including explicit `eligible`.
- `quote.salvageDust` is the actual combined alternative salvage value, including
  lineage modifiers. Animate itself pays no dust.
- Every branch supplies `morph`, exact whole-roster `lost` and `gained` cell keys,
  `afterCount`, `counts: [{cell, before, after}]` for affected cells, and optional
  `neededFor`. A duplicate Midnight must never have `neededFor`.
- `receipt.resultPresent` is the live presence of the stored result IID. Set false
  when that instance subsequently left the roster, so View pet is disabled and
  the receipt does not imply recreation.
- `receipt.remaining` is the current permitted remaining capacity after readback.
- Presentation annotations can be projected at the boundary; they do not change
  the frozen durable record shapes.

The UI rejects unsupported quote recipe support. Final quotes require exactly one
Midnight output with weight 4 and protection `none`. The engine remains the
protection and transaction authority. It must also validate saved receipts before
returning them, including result membership in the frozen support and branch set.

The preview and review list both original identities and their exact bank,
level, nickname, lineage, bond, talents, equipment and non-shiny status. They show
every supported branch's cells and counts. The UI reuses the existing salvage
confirmation through `openPetDestructionReview`; ANIMATE must match exactly.

Reveals read saved receipts only. Every singleton is direct, including guaranteed
Midnight and protected lower recipes. Two-outcome results get a skippable arrival
animation only after image decoding; reduced motion disables it. Decode failure
keeps the saved name/result visible and offers image retry, never another Animate.

## Scope and proof limits

No engine, protection table, transaction, currency writer, durable key classifier,
merge rule or approved art was changed in this lane. The prior spec's missing-art
finding is superseded by the six runtime Rose files now in this foundation.
A matching Rose shell/swatch tint and six-column layouts are added here.

The unit and PURE evidence measures Node behavior and rendered markup. Browser
execution is prohibited by this order. Visual verification remains unrun:
small phone and notch layouts, six-column touch targets and label wrapping,
32/48/64 px Rose legibility, overlay hit testing, real keyboard/focus restoration,
image decode timing, and full/reduced-motion playback. Engine transaction,
process-death and cross-device guarantees require the other lane's proof.
