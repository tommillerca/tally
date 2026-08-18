# Plan: The Raising (new-player opening) + three starter chests

_Written 2026-08-09 for Tom's approval. Nothing is built. Interactive prototype
published as an artifact; this doc is the repo-side source of truth._

Tom's brief, verbatim:

> I want to create something for our new players that are just starting. In the
> finch game you catch your egg when you make an account. I want us to start with
> the art that is the pile of bones cam made and you tap it continually until your
> bonehead arises from the dead and becomes your buddy.

and, a few minutes later:

> Every players account should start with three common chests so they can get
> going. The onboarding walkthrough should show them how the first one opens.

---

## 1. Where it goes

Onboarding is three steps today (`renderOnboarding`, `js/app.js:9364`):

| Step | Today | Proposed |
|---|---|---|
| 0 | FEED THE BONES poster | unchanged |
| 1 | THIS ONE'S YOURS: passive reveal of the bare starter + name | **The Raising**, then it settles into the existing nameplate + earns layout |
| 2 | THE PLAN: four profile questions | unchanged |
| after | lands on `#/today`, a toast mentions the welcome kit | lands on `#/today`, **one guided chest open** |

Same three dots, same `onb_step` funnel events, one new state inside step 1. The
chest grant happens in `saveInitialSettings` where it already happens.

## 2. The Raising: eight taps

One rule: **no tap does nothing**. The pile shrinking is the progress bar, so
there is no meter on the screen.

| Tap | What happens | Feel | Copy |
|---|---|---|---|
| 1 | pile jolts, dust, a chip flicks out | `haptic.tap` | Something moved. |
| 2 | a hand breaks the surface | `haptic.tap`, click +1 semitone | That's a hand. |
| 3 | arm and shoulder follow, pile down a third | `haptic.tap` | (holds) |
| 4 | ribcage clears the dirt | `haptic.tap` | It's putting itself back together. |
| 5 | hips and one leg out, pile down to a lump | `haptic.tap` | (holds) |
| 6 | it stands up, **headless** | `haptic.heavy` | Missing something. |
| 7 | the skull drops in and snaps on with an overshoot | `haptic.heavy` | There it is. |
| 8 | eye sockets flare, dust ring, it looks at you | `haptic.reward` | Congratulations. It's a skeleton. |

The headless beat at 6 is the joke and the reason this is ours rather than a
re-skinned egg. The skull arrives last because the face is the thing you bond
with. The starter skull art already has big eyes, so "it looks at you" is a light
flare on art we own, not a new drawing.

### Full copy

| Slot | String |
|---|---|
| Headline, before | SOMETHING'S IN THERE |
| Sub | Tap the pile. Keep tapping. It won't get up on its own. |
| Idle 3.5s | It is not going to tap itself. |
| Headline, after | THIS ONE'S YOURS |
| Sub, after | Congratulations. It's a skeleton. |
| Name line | You dug it up. You name it. |
| Button | That's me |
| Spotlight (chest) | Three chests came with the body. Open one. |
| After the drop | That's yours. It's already on. |
| Closing | Two left. They'll keep. |
| If they skip | They're in your bag. They aren't going anywhere. |

## 3. Art: the one dependency

**There is no pile-of-bones file in the repo, the NFT library, Cam's decks or the
Kickstarter mockups.** The map's "bone cache" is an icon, not artwork. Either Tom
points at the piece he means, or it is a small brief to Cam:

- one pile of bones, front-on, centred, transparent, on a small dirt mound.
  **Largest master plus the layered source**, never a delivery-size export
  (standing rule: `feedback_request_hires_source_art`)
- clusters grouped (outer / middle / core) so the pile empties in stages, or three
  flat states (full / half / nearly gone) if that is less work for him
- four to six loose bones as separate cutouts for the chips that fly out

**The Bonehead itself needs no new art.** The bare starter is `B0-1` (headless
body, mid-stride) + `SK0-1` (skull), 640x640, and the prototype rises those exact
two layers.

## 4. Three chests

`initLootIfNeeded` (`js/game.js:584`) currently grants 1 golden + 1 daily, gated
on kv `loot-init`, so it is already write-once.

- **Proposed: 3 Common Crates, and keep the Golden.** The guided open uses a
  Common, so the lesson is taught on the cheap one and there is still something
  better in the bag afterwards. Opening your best crate in the first sixty seconds
  leaves the rest of the day flat.
- **Open question for Tom:** you said three common. Keep the Golden on top (my
  recommendation) or make it three total?
- Existing accounts (including Tom's) already have `loot-init` set and will not
  see the new chests. Correct, but it means testing needs a fresh profile.

### The walkthrough: one tap on the real thing

Not a tour, not a fake demo chest.

1. Land on Today and let it paint. No modal over a screen they have not seen yet.
2. Dim everything except the chest, sitting where chests actually live. One line,
   one arrow, no Next button, no step counter.
3. They tap the real chest. The existing crate reveal runs (`docs/CRATE-REVEAL.md`)
   and the item **auto-equips**, so the Bonehead they just dug up visibly changes.
   Chest, thing, on your guy: that is the whole lesson.
4. Dim lifts, closing line, two chests left with a badge. Never fires again.

## 4b. The rest of the first session

| # | Beat | Why here |
|---|---|---|
| 1 | FEED THE BONES poster | unchanged |
| 2 | **The Raising** then name it | they earn the character |
| 3 | THE PLAN, four questions | unchanged; no targets, no food half |
| 4 | **Open the first chest** | teaches the loot loop on a real chest |
| 5 | **The ask**: steps / map / alerts | right after they have seen loot |
| 6 | **It can't die** | the loudest finding in the competitor research |
| 7 | **Log one meal**, offered not forced | the core daily action |

**Deliberately deferred:** cloud backup + Recovery ID (nudge at level 3), the tab
tour (each tab introduces itself), anything social, anything about weapons /
talents / sets / the Gauntlet.

## 4c. The ask: permissions in the Bonehead's words

One screen, three rows, **non-blocking**. Each row fires its own OS sheet only
when that row is tapped.

**Why never a cold sheet:** iOS shows a Health sheet once per data type, ever. A
denial is only reversible in Settings, and "never send players to Settings" is an
existing rule (`lessons_tally_health_permissions`, v199). Our screen explains
first; the OS sheet appears only after they say yes to us. "Not now" spends
nothing and can be re-asked in context.

| Row | What it does | If you say no |
|---|---|---|
| Steps | Every step is XP, loot, and the only thing that hatches an egg | No hatching, no pet levels, no walking XP. Food side unaffected |
| Map | The Boneyard is the real map: caches, dens, spires, the Glutton | Map stays empty. Still one Remote Den a day, costing no energy |
| Alerts | Sieges have deadlines. Twice a week at most | Nothing pings you |

Every consequence verified in code: eggs hatch on `lifetimeStepsSum` and nothing
else (`js/loot.js:258`); the Remote Den spends no energy (`js/app.js:14954`).

**Branch by platform or it lies** (`platformTag()` already reports this): iOS app
= HealthKit, Android app = Health Connect, iOS PWA = no health API at all (offer
the Shortcut or hide the row), desktop browser = hide steps and map entirely.

**Fix in the same change:** the notification permission sheet currently fires
blind 3.5s after boot (`js/app.js:1440`). That is the cold-sheet pattern this
screen exists to avoid. Move it into the Alerts row.

**Privacy line** (checked against `privacy.html` and the code before writing):

> Boneheadz does not sell your data. Not your steps, not your food, not where you
> are. No ads, no third-party trackers, none of it for sale, ever. Your steps are
> read on your phone and used on your phone.

True today: health data never leaves the device except inside the E2E backup
(key never leaves the phone); GPS is only ever transmitted when the player files
a map report; analytics carry a random device id, no food/weight/health, and a
coarse IP-derived city; no third-party SDKs.

## 4d. The gentleness contract ("IT CAN'T DIE")

From Tom's competitor research: punishment mechanics churn out exactly the users
who need the app most, and real health data contains sick weeks.

Screen copy: *Miss a week and nothing happens. It waits. / It never gets weaker.
Nothing takes your gear, your pets or your coins. / Lose a fight and it costs you
the trip. That's all. / Your spire goes dormant, never destroyed. / There is no
punishment mechanic in this game. If you find one, it's a bug.*

### Audit: is it true?

| Claim | Verdict | Evidence |
|---|---|---|
| Nothing dies or rots from neglect | True | no decay/wither/spoil/starve logic in garden, pets or kitchen |
| Spires pause, never break | True | `js/spires.js:104` "DORMANT, never destroyed ... Shame-free is a hard rule" |
| A lost fight takes nothing | True | defeat screen reads DOWN, NOT OUT |
| Gear/pets/coins never taken | True | nothing removes owned inventory outside player spending |
| Stats only go up | **FALSE** | see below |

### The stat system is the problem, not one stat

**Tom's ruling, which predates this plan:** stats must not be tied to specific
actions. Actions earn XP; the player spends points on the stat they want. Logged
as item 9(b), 2026-08-04 batch in `ROADMAP.md`, never built.

What ships today does both at once. `deriveStats` (`js/pit.js:17`) computes five
base stats straight from behaviour, and `STAT_META` tells the player which habit
feeds which stat in as many words (`fedBy: 'hitting your protein target'`).
Training points sit on top but are the smaller half of the number.

Four of the five derived stats are cumulative counts and can only rise. **Marrow**
is fed by `b.streak`, which `buildFighter` (`js/app.js:14394`) recomputes as the
**current** streak via `streakFrom`, and that resets to 0 on one missed day. A
30-day streak is ~45 points of Marrow gone overnight, unexplained: the exact
Habitica mechanic the research flags.

**The fix is the ruling, not a patch.** Retire `deriveStats` as a stat source. All
five start flat, every action that fed a stat feeds XP instead, levels pay points
the player spends. Then "it never gets weaker" is structurally true rather than
true-until-someone-adds-a-stat-input. Consistent with the weapons decision:
strength is talents, chosen stats, and gear you can see.

**What it costs:**

- **The migration is the whole risk.** Existing stats are mostly derived, so a
  naive switch guts every character. `deriveStats` is pure over retained history,
  so each player's derived contribution is computable exactly and converts to
  granted points, once, under a stable ledger key (rewarded-actions SOP).
  **Nobody comes out weaker than they went in.**
- **`TRAIN_STEP` (2) and `TRAIN_CAP` (100)** were set when points were the small
  half. As the only source they are almost certainly wrong.
- **Measured, not argued.** Full `tests/fight-sim.mjs` re-baseline
  (`ref_boneheadz_fight_sim`).
- **Copy sweep:** every `fedBy` string, the Build tab explainer, the FAQ.
- **Free respec stays** (`tpReset`): the only version of a points system that fits
  a no-punishment contract.

**Sequencing:** this is its own plan and its own release. The Raising, the chests
and the ask do not depend on it and can ship first. The contract screen cannot
ship before it, or it is lying on day one.

### Rest days (flagged, not folded in)

One rest day a week that holds the streak, declared by the player or applied
automatically. `streakFrom` is a five-line function so it is small. Copy: "Rest
day taken. The bones aren't going anywhere." New mechanic, wants its own short
plan, should not ride in on an onboarding change.

## 5. Build order, each step verified

1. **Mockup strip first** (eight frames) for Tom's sign-off. → verify: approved.
2. **Art in and precached** in `assets/bh/onb/`, added to `sw.js` PRECACHE, VERSION
   and `APP_BUILD` bumped together. → verify: cold cache with the network throttled
   still paints the pile.
3. **Stage machine** in `renderOnboarding(1)`: tap count drives a stage class, CSS
   custom properties carry every distance and duration (the crate-reveal pattern).
   No `setTimeout` choreography. → verify: automated taps 1-8 each advance the
   stage, and the skull reports real rendered pixels while visible (not a CSS box:
   `lessons_animation_pixels_not_geometry`).
4. **Feel**: existing `haptic` vocabulary and `js/fx.js` sounds, click pitching up
   per tap; final burst reuses `mountCrateBurst` recoloured bone. No new modules.
   → verify: sounds off and haptics off both still complete.
5. **Unhappy paths**: reduced motion cross-fades and keeps all eight taps; backing
   out and returning restores the risen state; rapid taps are never queued or
   dropped. → verify: reduced-motion run reaches "That's me"; ten taps in one
   second land eight stages and no more.
6. **`onb_raise` funnel event** (tap count, ms to complete). → verify: fires once
   with real numbers.
7. **Chest grant**: three Commons alongside the Golden, still write-once. →
   verify: fresh profile ends with exactly 3 common + 1 golden; running the grant
   twice still leaves 3.
8. **Guided open**: dim, spotlight, real chest, real reveal, auto-equip, one-time
   flag. → verify: paperdoll pixels differ across the open; a second visit does
   not re-fire; badge reads 2.
9. **Player-assigned stats, first, as its own release.** `deriveStats` stops
   feeding stats; actions feed XP; levels pay points; existing derived
   contributions convert to granted points. → verify: no save comes out weaker
   than it went in; the conversion run twice pays once; fight-sim re-baselined; a
   simulated missed day drops nothing.
10. **The ask.** One screen, three rows, platform-branched, non-blocking, each row
    firing its own sheet only on tap; the blind 3.5s notification request deleted
    in the same change. → verify: on a web build the Health row is absent (not
    disabled); declining leaves the app fully usable and the un-asked sheets
    unspent; no OS sheet appears without a tap.
11. **The contract screen.** Five lines and a close. → verify: every claim maps to
    code, re-checked at build time.
12. **First meal, offered not forced.** → verify: skipping leaves no nag, no badge,
    no blocked screen.
13. **Guard tests** `tests/onb-raise-audit.mjs`, `tests/welcome-chest-audit.mjs`
    and `tests/permission-ask-audit.mjs`, all **proven red** before they are trusted.

## 6. Risks

- **It gates the funnel.** Onboarding is where launch lives or dies and this adds
  a required interaction. Mitigations are in the build (self-pulsing pile, idle
  line at 3.5s, honest event). If the numbers turn bad, move it behind the first
  logged meal rather than deleting it.
- **Eight taps on a slow phone.** Every stage is a transform on one wrapper. The
  burst fires once, at the end.
- **It sets a tone we then have to keep.** The same pile should come back on a
  knock-out revive later, or it reads as decoration. Not building that now.

## 7. Optional, not in the plan unless Tom says so

- Record the sequence as the App Store screenshot and the Kickstarter GIF. Nearly
  free once it exists, and better than any screenshot of a food log.
- The pile remembers where you tapped: chips fly from that spot.
- One in fifty rises wrong: skull lands backwards, holds a beat, spins around.
- Show the nameplate at tap 7 so the last beat is your own named Bonehead standing.

## 8. Open questions

1. Cam's pile-of-bones art: Tom is sending it when he is back at his computer
   (2026-08-09). Build proceeds against the placeholder until then.
2. Three common chests **plus** the existing Golden (recommended), or three total?
3. Sign-off on the hard commitment in the contract screen: "there is no punishment
   mechanic in this game" rules out decay, hunger meters, gear loss on defeat and
   stat drops from broken streaks, permanently.
4. Rest days: yes in principle? (Separate plan if so.)
5. **Points rate.** Cleanest is XP as the single currency: every action funnels
   into XP, XP levels you, each level pays N points. Need N. Today's pool is a
   mixed bag (protein days + days closed + 1 per 25,000 steps) that ignores
   spawns, eggs, quests and variety entirely because those feed stats directly.
   Keep any direct grants, or go XP-only?
