# The Walk Potion: design doc

Written 2026-08-23, against `origin/main` at 0b8680f5. Design only. No code was
written and none should be until this is approved.

Source, verbatim, `docs/FEEDBACK-2026-08-22-v424.md` item 9:

> "we need to create a new and interesting mechanic for the game, here it is:
> players can cook a potion that allows them to collect coins and herbs while
> the app is closed and theyre on a walk. it will only work for 15 minutes at a
> time so it forces them to come back and cook/use another potion that can do
> it again. we do not want this potion to allow them to farm things like bosses
> while the game is closed. if you need to, research the pokemon autocatcher
> device and how they did something similar in pokemon go"

Seeded by WS8 of `docs/PLAN-2026-08-22-v425.md`. That entry half-answered the
research question and left five things open. This doc closes them or says which
ones it cannot close and why.

---

## 1. The precedent research, and which model applies

Tom asked about the "pokemon autocatcher". There are two different Niantic
mechanics that both look like "the game plays while you don't", and they are
built on completely different foundations. Only one of them is available to us.

### Pokemon GO Plus / Poke Ball Plus / the third-party auto-catchers

A **physical Bluetooth LE device**. It pairs with the phone, and the GO app
keeps a background BLE session alive so the device can drive catches and
PokeStop spins while the screen is off. The app is still running: the device is
what removes the need to *look* at it, not what removes the need to *run* it.
Third-party clones (Catchmon, Pocket Egg, DuoMon) emulate the same BLE service.

**This model does not apply to us, and cannot.** We are not a hardware company,
we have no BLE accessory, and the only reason GO can keep a background session
alive is a background execution mode granted for an accessory that does not
exist in our case. Ruling this out is the single most useful thing the research
does: it removes the temptation to solve this with background location.

### Adventure Sync

The real analogue. Adventure Sync reads **step and distance data out of Apple
HealthKit or Google Fit / Health Connect** and credits egg-hatching distance
and Buddy candy from it. Critically, GO is not the app doing the tracking. The
OS health platform tracks continuously using the phone's own motion coprocessor,
and GO reads the record afterwards. That is why Adventure Sync works with the
app closed, with GPS off, and with no mobile data, and why it costs almost no
battery. It is opt-in, it is gated on trainer level 5, and it pays weekly
milestone bundles rather than a live stream of rewards.

**This is the model that applies to the Walk Potion**, and we are already 80%
set up for it (see section 5).

### What Niantic does about cheating, because the same problems land on us

| Attack | What Niantic does | Does it land on us |
|---|---|---|
| GPS spoofing | Detection plus mass bans (5M+ across GO/Ingress/Wizards Unite in one year, publicly announced). This is their single biggest cheating problem. | **No.** Adventure Sync does not read GPS, and neither will the potion. A spoofed location creates no pedometer samples. This is the strongest single argument for the Adventure Sync model over a GPS one. |
| Driving | A ~10.5 km/h speed cap: distance above it does not count toward hatching or Adventure Sync. Framed as a safety measure as much as an anti-cheat one. | **Partly.** Health platform step counts barely accrue in a car anyway, and `distanceWalkingRunning` is pedometer-derived, not GPS-derived. We get most of this free, and the distance ceiling (section 3) does the rest of the job with no extra code. |
| Shaking the phone, dog collars, ceiling fans, "swing" rigs | Nothing effective. Niantic accepts it. | **Yes, and we accept it too.** See section 4. |
| Apps that write fake samples into Health | Real, and the "how to cheat Adventure Sync" guides are all about this route. | **Yes, and it is cheap to defend.** See section 4. |

One thing Niantic does that is worth copying outright: **Adventure Sync pays
milestones, not a live feed.** Batching the payout into a small number of
discrete grants makes the whole thing auditable and cappable. Tom's 15-minute
window is already a batch. Good instinct.

Sources: [Niantic's Adventure Sync announcement](https://nianticlabs.com/news/adventuresync),
[Pokemon GO Help Center: Adventure Sync](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/3265-adventure-sync/),
[Pokemon GO Help Center: Official Bluetooth Devices](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/77-official-bluetooth-devices-1689609298/),
[Engadget on the HealthKit/Google Fit launch](https://www.engadget.com/2018-11-01-pokemon-go-adventure-sync-apple-health-googlefit.html),
[Pokemon GO Hub: Adventure Sync guide](https://pokemongohub.net/post/guide/adventure-sync-in-pokemon-go-everything-you-need-to-know/),
[PhoneArena on the 5M ban wave](https://www.phonearena.com/news/PokemonGO-5-million-cheaters-banned_id130355).

---

## 2. The two-class problem, settled

This is the hard one and the plan flagged it as G5. Settling it:

**The gate is `hkConnected`, not the platform, and there is no time-only
fallback. Ever.**

### Why no fallback

A time-only fallback pays for elapsed minutes, not for walking. It is an idle
timer wearing a walk potion's costume. There is no number that makes it fair:

- Set it equal to the walking payout and it is **strictly dominant**. Close the
  app, put it in a drawer, collect. Zero effort, same money. Every player who
  can reach that path should take it, including native players the moment a
  shared code path lets them.
- Set it meaningfully below and it is an insult wearing the same costume: the
  PWA player gets a visibly worse version of the headline feature, still pays
  the full herb cost, and reads the difference as the game cheating them.

There is no third setting. The fallback is not a fairness measure, it is a
second, worse mechanic that happens to share a name.

### Why badging it is honest rather than a cop-out

**This game already gates content on Health, and has for a long time, without
a fairness complaint.** `js/quests.js` `pick()` filters every quest carrying
`need: 'hk'` out of the slate when `hkConnected` is false. That is seven daily
and weekly quests (`q-steps8`, `q-steps11`, `q-active`, `w-steps`,
`w-workouts`, `m-steps`, and the Health sync XP in `js/game.js onHealthSync`)
that a Health-less player has never seen and has never asked about. The Walk
Potion is that same pattern applied to one more thing.

Framing it as `hkConnected` rather than "native vs PWA" also fixes an unfairness
the platform framing would have created: a native player who declines the
Health sheet is in exactly the same position as a web player, and should be
treated identically. It also means the recipe can appear in the cookbook for
everyone with an honest, single-line explanation attached, rather than being
invisible on web and unexplained.

### What the Health-less player actually loses

An option, not value. The Boneyard, the kitchen, the wheel, the Pit, quests and
every non-`hk` faucet are unchanged, and the Health-less player is not paying
the potion's herb cost either. The potion is additive on top of a game they can
still play completely.

### The copy, proposed

Recipe card, always visible, greyed when the gate is shut:

> **Ambler's Draught**, needs Apple Health / Health Connect.
> Reads the walk you already took. Connect Health to brew it.

with the existing connect flow one tap away. No "premium", no "upgrade", no
store link anywhere near it (see section 6, Apple 5.1.3(i)).

### The number that could overturn this

If the Health-connected share of the active player base is small, this ships a
headline feature most players cannot use, and the answer changes to "do not
build it yet". **That number is already collectible and nobody has looked.**
`js/analytics.js` sends `plat` on every event batch via `platformTag()`
(`js/native.js:18`), so a single D1 query over the events table gives the
native/web split, and the Health-connected share follows from the presence of
`hk`-typed XP rows. **Run that query before the build starts.** I did not run
it: it needs the live server and this is a design doc.

---

## 3. The mechanic, concretely

### The loop

1. Brew the potion in the kitchen. Costs **2 common ingredients**, cooks for
   **15 minutes**, in a normal pot slot.
2. Drink it. That writes a window: `{ start: now, end: now + 15min }`.
3. Close the app. Walk.
4. Next open, the app reads distance walked between `start` and `end` from
   HealthKit / Health Connect, and grants **coins and common ingredients only**.
5. The window is gone. To do it again, brew again.

### What it grants, exhaustively

**Coins and common ingredients. Nothing else.** Explicitly not: crates, gear,
weapons, Bone Dust, Ectoplasm, XP, eggs, pets, wanderer encounters, boss or den
progress, spire tribute, quest progress, or badge progress. Tom's "no boss
farming" is the headline, but the list has to be exhaustive or the next feature
quietly adds to it.

Two consequences of that list worth stating up front:

- **It grants no XP.** Level is the number the shared leaderboard ranks on
  (`server/src/index.js:1952`, `ORDER BY lvl DESC`). A closed-app faucet must not touch it.
- **It does not advance `q-hunt` ("Collect 2 spawns on the map") or `w-hunt`
  ("Collect 15 spawns this week").** Those quests mean "go outside and use the
  map". A potion that satisfies them turns a map quest into an idle quest.

### Where the numbers come from

Every number below is derived from something measured on this tree. The
derivation is shown so it can be attacked.

**The anchor: what 15 minutes of walking is worth today, with the app open.**

Measured, from `tests/boneyard-supply-audit.mjs` and `docs/ECONOMY-INTERLOCK.md`
(the `econ/integration` result, which is on main: `SPAWN_FOOD` at
`js/cooking.js:41` matches):

- 41.46 coins per grid cell
- 2.93 ingredients per grid cell
- 5.00 spawns per grid cell

Cell geometry, `js/hunt.js:19`, `CELL_DEG = 0.005`, at the latitude everything
was measured at (49.28): 556 m north-south by 363 m east-west, so **201,828 m²
per cell**.

Collection corridor: `COLLECT_RADIUS_M = 75` (`js/hunt.js:20`), so a walker
sweeps a 150 m-wide band. Fifteen minutes at 5.0 km/h is 1,250 m, sweeping
**187,500 m²**, which is **0.93 cell-areas**.

So a 15-minute walk, app open, collecting every single spawn inside 75 m of the
path, is worth:

| | per 15-minute walk, app open, perfect collection |
|---|---|
| coins | **38.5** |
| ingredients | **2.7** |
| spawns | **4.6** |

That is a **ceiling**, and honestly labelled as one: it assumes the player
detours to every spawn in the corridor and that streets are straight. It also
carries about ±8% from the 0.92 inset `spawnsForCell` applies when placing
spawns inside a cell. It is the right anchor anyway, because a payout for
walking with the app *closed* has to be argued against the best case for walking
with it open, not against an average.

**The rule that falls out: the potion must pay strictly less than playing.**
If a closed app pays as well as an open one, the optimal play in a map game is
to close the map. That is an absurd outcome and it is the failure mode this
number exists to prevent.

**Proposed: 50% of the app-open ceiling.**

| | per full 15-minute window |
|---|---|
| coins | **19** |
| ingredients | **1.4** (expected; drawn from the existing `DEMAND_POOL` weighting so it hands you what the cookbook wants) |

Scaled linearly by distance and clamped: `payout x min(1, distance_m / 1250)`.
Walk 600 m in the window and you get roughly half.

**The 50% is a judgement, not a measurement.** I derived the ceiling; I chose
the haircut. It is the part of this section I am least confident in. See G2.

### The herb cost, and whether it is a real sink

2 commons matches the cheapest existing potion (Vital Tonic:
graveroot 1 + bog 1, `js/cooking.js`). At the daily cap of 4 windows that is
**8 commons a day spent** against **5.6 returned**, a net sink of **2.4 commons
a day**.

For scale: `tests/garden-sim.mjs` measured the kitchen eating **2.4 to 3.9
ingredients a day** (quoted in the `js/cooking.js` queue comment). So a
fully-farmed Walk Potion roughly **doubles the kitchen's ingredient demand**.
That is a real sink by any standard, and it points in the direction the economy
integration explicitly wanted: ingredients came out of that release **up 47%**
with the garden removed, and nothing was added to absorb the surplus.

That is the honest economic case for this mechanic: **it is a converter, not a
faucet.** It turns the ingredient surplus the integration created into a small
amount of the coin income the same integration removed (coins came out **down
11%**), and it charges walking for the privilege.

### The daily cap

**4 windows per day.** Derivation:

- 4 x 1,250 m = 5 km, roughly 6,500 steps. A real walking day, and comfortably
  under the 10,000 steps `js/game.js` already calls "the daily cap".
- 4 x 19 = **76 coins/day ceiling**. Against the ~400 coins/day the game
  already pays for health data alone (steps 126 + active kcal 99 + workouts 75
  + exercise ring 20 + cycling 80, all from `js/game.js`), that is 19%. Against
  the ~1,000 to 1,300 coins/day engaged figure at `ROADMAP.md:657`, it is 6 to
  8%.
- 4 windows costs at least 2 hours of wall clock (4 x 15 min cook + 4 x 15 min
  walk), and only if the player opens the app exactly on each expiry.

That last point matters more than the arithmetic. The `js/cooking.js` queue
comment records a **measured median player who opens the app once a day**. At
one open a day the realised number is **one window, 19 coins**, which is a
rounding error on the economy. The cap of 4 is a ceiling almost nobody reaches.

The cap is keyed on `claimDay` (`js/db.js:625`), the monotonic day guard, not
on `dateKey()`. See section 4.

### Cook time, and the pot slot

**15 minutes, in a normal pot slot, competing with dishes.**

Sharing the pot is deliberate. `garden-sim` found that cook starts per visit is
the throughput ceiling on the whole kitchen, so a shared slot means the potion
genuinely competes with a buff dish and cannot inflate total cooking. A
dedicated burner would add capacity nobody measured.

**Decision for Tom:** a one-pot player brewing an Ambler's Draught cannot cook a
dish for those 15 minutes. That is the real cost of sharing, and it is either a
good tension or an annoyance depending on taste. Recommend shared; flagging it
because it is a feel question, not a numbers one.

### Expiry, and the return trip

The window expires 15 minutes after drinking whether the player walks or not.
An uncollected window is **collectible for 24 hours after expiry, then
forfeit**. Reasons: a player who drinks and then doesn't open the app until
tomorrow should still get their walk; a player who banks fifteen unclaimed
windows should not.

A local notification at expiry ("your draught has settled") is available for
free: `LocalNotificationsPlugin` is already in the Capacitor `packageClassList`.
It must carry no offer, price or store link (section 6).

### Naming

"Walk Potion" is Tom's working name and is his call. In-fiction the kitchen
names things darkly: Vital Tonic, Fury Flask, Stoneskin Draught, Revenant's
Draught. **Ambler's Draught** is used throughout this doc as a placeholder.
Others: Wayfarer's Draught, Roamer's Brew, the Long Way Home.

---

## 4. The anti-cheese story

Stated as: what it costs to defend, what we defend, and what we accept.

### Free, because of the architecture

**GPS spoofing does nothing.** The potion never reads location. It reads a
pedometer record after the fact. A location spoofer produces no step samples,
so the single most common cheat in this genre is not applicable. This is the
main reason to copy Adventure Sync rather than build a GPS mechanic.

**Driving does nearly nothing.** Step counts barely accrue in a car, and
`distanceWalkingRunning` on iOS and `READ_DISTANCE` on Health Connect are
pedometer-derived, not GPS-derived. On top of that, the payout ceilings at
1,250 m per 15-minute window, which is 5 km/h. **The distance ceiling is the
speed cap.** One number does both jobs and no separate pace check is needed.

**No background execution, so no background attack surface.** The app does zero
work while closed. The window is two timestamps in a kv row, and the payout is
one health query on resume. No background location plugin, no "Always" location
permission, no background BLE session, no battery cost, and nothing for App
Review to interrogate. This is also why the feature is small.

### Cheap, and worth doing

**Fake samples written into Health by other apps.** This is the real attack, and
it is the one every "how to cheat Adventure Sync" guide is actually about. Any
app with HealthKit write authorisation can insert step samples. We know it works
because **our own plugin does it**: `HealthPlugin.swift debugWrite` writes
`HKQuantitySample` steps in DEBUG builds.

Defence: HealthKit stamps every sample with an `HKSource` / `sourceRevision`,
and Health Connect stamps every record with `metadata.dataOrigin`. **Count only
samples originating from the device itself or a paired watch; reject
third-party-app-authored samples.** This is a filter on the query we have to
write anyway, so it costs essentially nothing.

Accepted side effect: it also rejects legitimate Fitbit and Garmin importers.
Those players still get every other faucet, and the alternative is a mechanic
any free App Store step-faker defeats in thirty seconds. Take the trade, and
say so in the copy.

**The manual paste route must not be able to close a window.** `js/game.js:1055`
accepts a pasted `tally-hk d=... steps=...` string from an iOS Shortcut. That is
a user-typed daily total, unwindowed, and trivially forged. The potion reads
**only** the native plugin's windowed query. This is also the honest reason the
PWA has no fallback: the one step source a web player has is the one that cannot
back a 15-minute window.

**Clock tampering is already handled, and the potion must use the existing
guards rather than its own.** `js/db.js` has `claimDay` (monotonic day guard,
line 625) and `witnessServerDay` (a ceiling from the newest day `GET /health`
has been seen to report, line 616, `WITNESS_GRACE = 7` at line 610). Concretely:

- the daily cap counts against `claimDay`, never `dateKey()`;
- `start` and `end` are absolute ms stored at drink time;
- collection rejects if `now < end` (rolling the clock forward to end the window
  early) and if `now > end + 24h` (rolling it back to re-collect an old one);
- the health query's own range is `[start, end]`, so moving the device clock
  moves the query window with it and finds no samples in it.

`tests/clock-trust-audit.mjs` already exists and already asserts these guards.
The potion's daily cap gets a row in it.

### Accepted, and here is why that is the right call

**Shaking the phone.** A phone in a bag on a washing machine, on a dog, on a
ceiling fan, or in a purpose-built swing rig produces genuine pedometer samples
from the device itself. There is no cheap defence. Cadence analysis is not
cheap, is defeated by a better rig, and produces false positives on real humans
pushing strollers.

Niantic accepts this too. We accept it, and the reason is the cap rather than
any detection:

> **The maximum prize for perfectly cheating this mechanic all day is 76 coins
> and 6 ingredients. The daily wheel's top segment is 150 coins for one tap.**

A cheat that pays less than a free spin does not need to be caught. This is the
whole anti-cheese story in one line, and it is the actual design move: make the
cheat not worth the effort rather than build detection that will lose anyway.

**A modified client minting coins locally.** Unchanged from today. The balance
is client-authoritative, stated plainly in `docs/IAP-SCOPING.md`, and acceptable
only because cosmetics are not tradeable. The potion changes nothing about this
model and must not be used as an argument to revisit it.

---

## 5. What has to be built, and what already exists

**Already there, and this is why the feature is small:**

| Piece | Where |
|---|---|
| HealthKit auth incl. `.distanceWalkingRunning` and `.stepCount` | `native/ios/App/App/HealthPlugin.swift:175-183` |
| Health Connect `READ_STEPS` and `READ_DISTANCE` | `native/android/.../AndroidManifest.xml:76,81` |
| Health Connect client 1.1.0 | `native/android/app/build.gradle:60` |
| Resume hook (`appStateChange` + `visibilitychange`) | `js/native.js:59-61` |
| Local notifications | `capacitor.config.json packageClassList` |
| Cook/queue/pot machinery, ingredient inventory | `js/cooking.js` |
| Monotonic day + server-day witness | `js/db.js:616,625` |
| `hkConnected` gating precedent | `js/quests.js pick()` |
| Boneyard drop tables and weighting | `js/hunt.js`, `js/cooking.js DEMAND_POOL` |

**Both platforms already hold read permission for exactly the two data types
this needs, so the potion adds no new permission prompt to either build.**

**New, and it is short:**

1. **`queryRange({ startMs, endMs })` on both health plugins.** iOS:
   `HKStatisticsQuery` over `HKQuery.predicateForSamples(withStart:end:)`
   ANDed with a source predicate. Android: `readRecords` with
   `TimeRangeFilter.between` plus a `metadata.dataOrigin` filter. Returns
   `{ steps, distanceM }` and nothing else. Today's `queryToday()` returns a
   day total only, which is why this cannot be reused.
2. **One kv row.** `walkpot = { start, end, day, used }`.
3. **A recipe entry, a drink action, and a collect-on-resume path** that draws
   from the existing tables with crate, rare and boss types excluded.
4. **`tests/walk-potion-audit.mjs`**, prove-red before anything ships:
   - the collect path grants coins and common ingredients and **nothing else**
     (assert `inv`, `gearloadout`, `equipped`, `xp`, crate and pet state are
     byte-identical across a collect; empty-sample guard so a no-op collect
     cannot pass);
   - the daily cap holds at 4 across a clock reset, wired into
     `clock-trust-audit`;
   - a window collected before `end`, or more than 24h after `end`, pays zero;
   - distance scaling clamps at 1,250 m;
   - samples from a non-device source contribute zero.
   - Also add the potion's collect entry point to the static forbidden-reference
     lint proposed for `tests/purchase-firewall.mjs` in `docs/IAP-SCOPING.md`.

**Rough size: 2 to 3 days**, of which the plugin method is half, and that half
needs a real device (see G3).

---

## 6. Why this cannot become power creep, argued honestly

Monetisation is **cosmetic-only, decided 2026-08-07, not reopenable**. The
economy is **HELD** (`ROADMAP.md:83`: anything touching the Boneyard economy,
the Gauntlet or boss XP curves). A mechanic that prints currency is precisely
what gets held. So the case has to be made, not asserted.

**The coin half is not power, and increasingly cannot be.** `docs/IAP-SCOPING.md`
stage S0 is "make coins cosmetic-only": crates become unbuyable, the weapon tree
folds into the wardrobe slot. Post-S0, a coin faucet is a cosmetic faucet by
construction, and cosmetics are not tradeable, so a coin faucet cannot be
laundered into power by any route. **The potion should ship after S0, not
before**, and that single sequencing decision converts the whole coin argument
from a judgement call into a structural one.

**The ingredient half IS the power half, and that inverts the naive reading.**
Ingredients cook into dish buffs, dish buffs feed the Pit. So the resource to
worry about here is the herbs, not the coins. The mitigation is structural: at
the proposed numbers the potion is a **net ingredient sink** (2 spent, 1.4
returned), so it cannot raise buff uptime no matter how hard it is farmed. The
check for this is `tests/garden-sim.mjs` (which measures buff uptime, 64% to
67% in the queue work), not `tests/balance.mjs` (which measures build damage
ratios and would not see this at all).

**It grants no XP and cannot move the leaderboard.** Stated in section 3 and
worth repeating here: level is what the server ranks on, and a closed-app faucet
must never touch it.

**Apple 5.1.3(i): health data may not drive marketing.** Gameplay driven by
health data is fine (Adventure Sync is the existence proof). What is not fine is
any offer, price, discount or store prompt triggered by steps. So: the expiry
notification carries no offer, the collect screen carries no store link, and no
pack, sale or upsell may ever be conditioned on potion activity. One line, cheap
to get wrong, expensive to get flagged for.

### The honest answer on the hold

**This mechanic adds coins per day. That is a fact and no framing removes it.**

`docs/ECONOMY-INTERLOCK.md` sets the pass condition for economy work: *steady-state
coins per day is flat or down against today, at every profile.* At the proposed
numbers the potion adds up to 76 coins/day at the absolute ceiling and about 19
at the measured median open rate. That is small, and small is not flat.

So the honest position is one of these two, and it is Tom's call which:

- **A. It ships after S0, with a fresh integration measurement.** The potion is
  merged onto a tree with the economy as it will actually be, `garden-sim` and
  the per-cell audit are re-run with the potion on at light / median / heavy,
  and the day-30 coin slope is compared against today. If the slope moves, the
  cap or the haircut comes down until it doesn't. That measurement is the thing
  that decides the numbers, **not any figure in this doc**, and I have not run
  it because the mechanic does not exist yet.
- **B. It waits.** If the hold is meant literally, this is a coin faucet and it
  waits with everything else.

I did consider a third option, an **ingredients-only version** with no coins, so
that the coins/day line is untouched and the hold is respected. **It does not
work**, and I am reporting that rather than proposing it: for anyone to brew it,
an ingredients-only potion has to return more ingredients than it costs, which
at a 4/day cap adds up to +6 ingredients a day against a kitchen that eats 2.4
to 3.9. That roughly doubles ingredient supply, on top of the 47% the
integration already added, and it fails the same interlock from the other
direction. There is no version of this mechanic that is free.

**Recommendation: A**, and specifically after S0, because S0 is what makes the
coin argument structural rather than a matter of taste.

---

## 7. The grill: where this design is weakest

**G1. The potion may be a worse deal than just opening the app, on purpose,
which means its audience is people who won't.** Section 3 sets the payout at
half the app-open ceiling for a good reason, and the direct consequence is that
any player willing to look at their phone should ignore the potion entirely. So
the mechanic is aimed squarely at players who walk without playing. **I have no
evidence that population exists or is large.** This is the part of the design I
am least sure about, and it is not a numbers problem: no haircut fixes it,
because raising the payout to make the potion attractive to engaged players is
exactly the change that makes closing the map the correct play. If Tom's actual
goal is to give engaged players more to do, this mechanic is the wrong shape and
should be replaced rather than retuned.

**G2. The 50% haircut is a judgement dressed as arithmetic.** The 38.5-coin
app-open ceiling is derived from measured per-cell numbers and stated geometry,
and I stand behind it. The 0.5 is taste. Defensible alternatives: 0.35 (the
potion is a consolation prize, keeps the map clearly primary) or 0.65 (the
potion is genuinely worth the herbs, at the cost of a real temptation to close
the app). The right way to settle it is the integration measurement in section
6, not more argument.

**G3. The HealthKit windowed read is unproven and 15 minutes is short enough for
that to matter.** Three specific worries, none of which can be settled from a
desk:
- iOS writes pedometer samples in chunks, and a chunk can straddle a window
  boundary. Over a 15-minute window, boundary handling could plausibly move the
  answer by a large percentage.
- If a user carries both an iPhone and an Apple Watch, both write steps, and
  `HKStatisticsQuery` deduplicates by source priority. The number we read may
  not match what the user sees in the Health app, and "the game says I walked
  less than my watch did" is a support ticket generator.
- The source filter in section 4 has to be written against the real
  `sourceRevision` values, not against what the docs imply.
**None of the payout numbers mean anything until `queryRange` has been run on a
real device against a real walk and the reading compared to the Health app's
own.** That measurement is the first task of the build, before any balance work.

**G4. "Forces them to come back" is a retention pump, and should be called
one.** The 15-minute expiry is designed to make the player open the app more
often. That is the point, and it is also the definition of an engagement loop.
The line I would hold: the potion must never notify more than once per window,
never nag about an unbrewed potion the way the crate reminders did (feedback
item 17, already fixed once), and never appear in Gwart's nudge rotation. The
mechanic earning an extra app open because the player wants the coins is fine.
The app asking for it is item 17 again.

**G5. The two-class answer rests on a number nobody has looked up.** Section 2
argues from the `need: 'hk'` quest precedent, which is genuinely shipped and
genuinely uncomplained-about. But it is a precedent about seven quests inside a
slate of three, not about a headline mechanic. If the Health-connected share
turns out to be small, "badge it honestly" becomes "build a headline feature
most players cannot use", and the correct answer flips to not building it. The
D1 query is named in section 2. Run it first.

**G6. It pays twice for the same steps.** Steps already pay: 90 coins at 10,000
(`STEP_MILESTONES`) plus up to 36 past the cap, plus health-gated quests. The
potion pays again for a slice of the same walk. My defence is that the Boneyard
already double-pays the same walk and always has, that the potion is the only
one of the three that costs an input, and that the cap keeps the third payment
under 20% of the existing health-derived total. That is a real defence and it is
also a rationalisation, and I would rather Tom see it labelled than argued.

**G7. There is no version of this that is free, and I could not find one.**
Section 6 documents the ingredients-only version failing. That means the choice
really is "lift the hold for this one thing, with a measurement" or "wait", and
a design doc that cannot offer a third door is a weaker deliverable than one
that can. I looked and there isn't one.

**G8. Shared pot slots may be the wrong call and I picked it on a throughput
argument, not a feel one.** A one-pot player choosing between a Marrow Stew and
an Ambler's Draught is either an interesting decision or a reason to stop
brewing the potion. The throughput case for sharing is solid; the feel case is
untested. If it plays badly, a dedicated burner is the fix, and it reopens
capacity nobody has measured.

**G9. Every number in section 3 is measured off a tree that was measured with a
different question in mind.** The 41.46 coins and 2.93 ingredients per cell come
from `tests/boneyard-supply-audit.mjs`, which was built to guard supply, not to
price a 15-minute walk. The corridor geometry (0.93 cell-areas) is my own
derivation, stated so it can be checked, and it assumes straight-line walking
and perfect collection. Neither assumption is true. The direction of the error
is at least the safe one: real walking sweeps less, so the real app-open value
is below 38.5, so a potion priced at half of 38.5 is further below the app-open
rate than intended, not above it.

---

## Decisions this doc needs from Tom

1. **Ship after S0 with a fresh integration measurement (A), or wait (B).**
   Recommend A. Section 6.
2. **Shared pot slot, or its own burner.** Recommend shared. Section 3.
3. **The name.** "Ambler's Draught" is a placeholder.
4. **Confirm the exhaustive grant list** in section 3, particularly that the
   potion grants no XP and does not advance `q-hunt` / `w-hunt`.

And one thing to do before the build starts regardless: **run the D1 query for
the Health-connected share** (section 2). It can overturn the whole design and
it costs one query.
