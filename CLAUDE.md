# CLAUDE.md — Tally / Boneheadz

Loads whenever you work under `tally/`. The workspace-root `CLAUDE.md` still
applies: coding contract, verification contract, deliverable hygiene.

## Animation FX verification (non-negotiable)

**Animations are verified by firing the real control and asserting pixels, never by calling the animation's own function.** Added 2026-08-01 after v245 shipped an invisible punch. Non-negotiable for any new FX:

- **Fire the actual control** (tap the move, trigger the event) in the real screen. Calling `strikeFx()` / the FX function directly proves geometry and proves nothing about whether the game ever calls it.
- **Assert decoded pixels DURING the animation**: `naturalWidth > 0` on every frame, in the same sample where the frame is visible. `getBoundingClientRect` returns the CSS box over a blank frame, so a position-only check reads perfectly on an animation nobody can see. That is exactly how v245 passed.
- **Test on a COLD cache.** These are 100KB+ PNGs against a ~350ms animation; the frames lose that race on first play. Preload when the screen opens, and never start a sequence on an undecoded first frame.
- **A blank render is a finding, not a capture artifact.** I saw v245 render blank on live and blamed a sleep in my own capture script. Waiting longer fixed my screenshot; the game does not wait. If a render comes back empty, that is the bug until proven otherwise.
- Run `node tests/fx-audit.js` (live) or with a local URL. It drives real moves, asserts decoded-and-visible-on-victim, treats an empty sample set as failure, derives coverage from `STRIKE_FX` so a new animation with no audit row FAILS, and exits non-zero.

## Anti-regression rules (non-negotiable, added 2026-07-28 after 4 regressions in one day)

Four bugs shipped to Tom in a single day: invisible Boneheadz, the Trends chip
opening the wrong screen, the next-day arrow made untappable by the Settings
gear, and the Bonehead clipped by the Dynamic Island. Every one got past a check.
The checks were the problem, not the effort. These rules are about the checks.

1. **A check that cannot fail is not a check.** Before reporting a pass, say what
   a FAILING result would look like. If you cannot, the check is worthless. Two of
   the four above "passed" while meaningless: `heroStartsAtTop: 0` was reported as
   proof of success when that number WAS the bug, and a crate-reveal check
   returned "no frames shown with empty art" from an empty sample set.
2. **Prove the guard fails.** For any new assertion or guard protecting against a
   specific bug, reintroduce the bug and watch the guard go red, then remove it
   and watch it go green. The first safe-area guard written here silently matched
   nothing (paren-blind regex) and only got caught by doing this.
3. **An empty sample set is a FAILURE, never a pass.** Zero frames, zero elements,
   zero rows examined means the check did not run.
4. **Verify where the failure can exist.** Name the environment property the
   change depends on, then test somewhere that has it. A desktop browser has no
   safe area, no touch momentum, and a warm cache: notch clipping, fling
   behaviour, and cold-load pop-in are all invisible there. Fake it (`--sat`) or
   use the emulator/simulator.
5. **UI changes are verified by OPERATING controls, not by rendering screens.**
   Click every control the change could touch and assert where it lands. "The
   screen renders" would not have caught three of the four.
6. **Anything absolutely positioned over content must be hit-tested.**
   `document.elementFromPoint` at the centre of every nearby button; if the answer
   is not that button, it is broken. A floating element made day-navigation
   impossible for a whole release.
7. **Touching shared render plumbing means sweeping every consumer.** Grep the
   call sites and check a sample of each KIND, not the one you were looking at.
   `avatarLayersHtml` has 14 call sites; testing one shipped invisible characters.
8. **Never default to hidden.** If code hides something pending an async result,
   the same code must own un-hiding it, so a missed call degrades to ugly rather
   than invisible.
9. **Run `tests/ui-audit.js` before claiming a UI change is verified.** Paste it
   into the app console and `await uiAudit()`. It operates controls, hit-tests
   overlays, and simulates a 59px notch. Add a row to CONTROL_EXPECTATIONS with
   every new control.
10. **Report the diagnosis only after measuring it.** The gear/next-day bug was
    first "fixed" by padding the currency chips, which fixed nothing and created a
    new collision, because the cause was assumed rather than measured.
11. **Know which DIRECTION is failure, not just that failure is possible.** Added
    2026-08-13. The leaderboard's lazy-mount audit scrolled partway and asserted
    `mountedImages > mountedImagesBefore`: it REQUIRED the count to grow and
    graded growth as a pass. Unbounded growth was the crash. So the check did not
    merely fail to catch the bug, it passed *because* the app was broken, and it
    would have gone red on the fix. Rule 1 does not catch this: I could have said
    what a failing result looked like and been confidently wrong about which way
    was down. State the direction and the BOUND: not "more heads mount as you
    scroll" but "no more than N are ever mounted at once". A check on a resource
    that can exhaust needs a ceiling, never a trend.
12. **Measure in the state the player is complaining about.** Same bug: the memory
    budget was only ever sampled at OPEN, where the board is cheap, and never at
    the end of a scroll, where it dies. Opening was not the reported symptom.
    Before trusting a measurement, say out loud which user action it was taken
    during, and confirm that is the one in the report.

## The figure contract (non-negotiable, added 2026-08-07)

Tom: "shiny's arent showing up in the new spire hero spotlight and the pet is too
far away from the bonehead. this is something that we have had multiple problems
with across the entire app. create a framework and guard rails for yourself so
that this STOPS HAPPENING." Then: "you need to utilize safe margins or somethign
that have been based off tension points as a composition theory."

He is right that it is a class, not an incident. Every occurrence was the same
mistake: a new screen placed a figure by hand instead of using the contract, and
lost one property of it. Shiny dropped, pet exiled to a corner, pet scaled off its
canvas instead of its drawing, a friend's shiny drawn in base colours, layers laid
out perfectly but never decoded.

**1. A pet is an INSTANCE, not a species.** `outfit.C` is a species id with no
shiny, level or lineage on it, so `!!eq.shiny` is always false. There are exactly
two honest sources and `petFrom(snapshotPet, ownSpecies)` in js/app.js is both of
them: a profile snapshot's `pet` object for somebody else, or your own species with
shiny left UNDEFINED so `S.shinyPets` (the viewer's own collection) answers.
Never read shiny off an outfit. Never pass another player's pet through
`S.shinyPets`.

**2. A pet drawn beside a Bonehead goes through `petAsideHtml(pet, px)`.** It
seats the pet unless the species hovers, mass-normalises it so a flat species is
not half the size of a round one, and keeps it on the character's baseline.

**3. Align on INK, never on boxes.** Cam's art sits inside a 640² canvas with a
lot of transparent air, and most stages letterbox it with `object-fit: contain` on
top of that. Two figures can have perfectly aligned boxes and visibly different
footing. Every measurement is taken from the source PNG's alpha bounding box mapped
through the rendered geometry, and `object-position` is part of that mapping: a
correct CSS fix read as "no change" once because the measurement assumed centring.

**4. Composition: safe margins and tension points, not eyeballing.** Every figure
stage declares a `--safe` gutter of about 6% that no drawing may enter, and the
safe box is divided in thirds both ways. Figures are anchored to the centre line or
to a tension line at BOTH edges, never nudged until they looked about right. The
Bonehead holds the centre (Tom's standing call); the pet takes the right third,
inner edge on the tension line, outer edge on the safe margin. Speech bubbles own
the left column and their tail drops to the JAW, because that is where a mouth is.
Reference build: `market-quality-mockups/today-v4.html`, `?guides` draws the grid.

**5. `node tests/figure-audit.mjs` before claiming any figure work is done.** It
enforces the above: COVERAGE (every pet call site in js/app.js must be registered,
so a new screen that draws a pet and is not listed FAILS), STATIC (no
`{ id: x.C }` constructions), SHINY, DECODE, PLANE and NEAR. Undriven sites must
state why and are printed on every run so they cannot rot into "covered". Add a
SITES row with every new figure surface.

## Rewarded actions (non-negotiable SOP, added 2026-08-07)

Tom: "You can still exploit the spire system just like the glutton was. After
beating you can take the same spire again when it's already yours. I've already
brought this up to you and you struggled multiple times fixing it for the glutton.
Figure out an SOP for yourself so this doesn't keep happening on this feature or
new ones it's a waste of time do better."

Both bugs were the same mistake, and fixing the Glutton did not fix the class
because nothing generalised the lesson. **A payout gated on "the request did not
error" is not a guard.** The spire server has always been idempotent (claiming a
tower you own returns `ok:true, already:true` and moves no ownership) and the
client only tested `ok === false`, so a re-fight paid the full takeover every
time. The siege branch was worse: it paid and minted its ledger row BEFORE asking
the server, then ignored the answer entirely.

Follow this for every action that pays coins, dust, XP, gear, crates or a card.

1. **Name the state transition.** Write down, in a comment, what must change for
   this to be a reward: "an unowned/rival tower becomes mine", "a live siege
   ends", "today's Glutton goes from alive to beaten". If nothing changes, there
   is no reward. A payout with no transition behind it is a farm.
2. **Ask the authority first, pay second.** Whoever owns the state decides: the
   server for anything social, the ledger for anything local. Never write the
   reward before the answer arrives, and never mint a ledger key that contains a
   timestamp or a random id for a repeatable action, because that defeats the
   ledger's whole purpose.
3. **A no-op answer is not a success.** Handle it by NAME (`already`, `duplicate`,
   `no-siege`, a 409) and pay the flat consolation instead. `ok === false` does
   not cover a 200 that says nothing happened.
4. **Close the entry point too.** The state that makes the action illegal must
   also hide the button. Both halves, every time: the spire sheet was still
   offering "take this tower" on a tower already held, routing on a `rival` field
   that lags the local record by a poll.
5. **Prove the second attempt pays nothing.** Perform the action twice in the
   already-satisfied state and assert the second pays the consolation, not the
   prize. `node tests/unit.test.js` carries the two NO-OP guards: one requires
   every paying `social.*Remote` call to consult its answer BEFORE paying, the
   other pins the spire branch specifically. Both are proven red against the real
   exploits. Any new rewarded remote call is covered the moment it is written.
6. **The check and the write are the SAME transaction, and "twice" includes
   "at once".** Added 2026-08-17, after sweeping the whole class rather than the
   one feature it was found on. Every paying action in the app obeyed parts 1 to
   4 and still paid twice, because "read the authority, then write the reward"
   is two IndexedDB transactions with an `await` between them, and two
   overlapping calls both read a state nobody had taken yet. Measured against a
   real database on this tree: two concurrent claims paid the Glutton 280 coins
   for one appearance, 120 for one spawn, 200 for one quest, 240 plus dust for
   one lot of spire tribute, 2290 coins and 300 dust for ONE level, two pets out
   of one egg and two crates' loot out of one crate row. Sequentially every one
   of them correctly refused. So use the primitives instead of hand-rolling the
   pattern: `db.add` (mint a key only if absent), `db.take` (hand a row over and
   delete it), `kvUpdate` (read-modify-write a kv record) and `awardOnce` (the
   ledger claim, which unlike `award()` answers "did I mint it?" rather than
   returning 0 for both a duplicate and a 0-XP payload). `node
   tests/reward-sop-audit.mjs` derives the paying call sites from `js/*.js`, so
   a NEW payout nobody registered FAILS, and it performs every registered action
   twice, sequentially and concurrently. Add an ACTIONS row with every new
   payout, and a driver unless you can say why it cannot have one.

## Transitions and in-between moments (added 2026-08-08)

Tom, on the Stable's talents panel: "this transition should be smooth scaling
with elegance not just a jarring 2 keyframe scale. we need to start thinking
about the flow of things and the in between moments."

A state change is not done when both states look right. The path between them is
part of the design, and two specific mistakes make it disappear:

1. **A full re-render leaves nothing to transition.** Screens here rebuild
   `innerHTML` wholesale, so the new DOM is born at its final size and CSS has no
   previous value to interpolate from. Remember the previous state, render the new
   markup in the OLD state, then flip it on the next frame so the transition
   actually runs. `cfWasPanelled` in `openStable` is the reference.
2. **An unregistered custom property cannot animate.** `--card` is a string to the
   engine unless declared with `@property { syntax: '<length>' }`, so it jumps.
   Anything that drives layout through a variable needs the registration before a
   `transition` on it means anything.
3. **`display: none` is not a transition.** It removes the element on frame one and
   pulls the eye with it. Collapse `max-height` + `opacity` so a panel leaves at
   the same pace as the thing replacing it.
4. **If JS derives geometry from measured sizes, it must repaint during the
   transition.** The carousel computes card pitch from the live card width, so a
   CSS-only shrink left the spacing at the old value mid-animation. Drive `paint()`
   on rAF for the transition's duration.

Verify it the same way as any other visual claim: sample the animated value over
time and assert it takes intermediate values. Two distinct values across the
window means it snapped.

## Screens arrive whole (non-negotiable, added 2026-08-08)

Tom: "I want these tabs fully loaded before anyone is interacting so the UX is
smoooooth and polished." And, when it was fixed for two screens: "make this an
across app thing, all new and existing pages should have this rule."

This is enforced in ONE place so no screen has to remember it:

- `route()` hides the rendered child and applies `route-in` only after
  `revealWhenReady()` has waited for every image in it to decode.
- `openSheet()` does the same for `.sheet-body` via `sheet-in`.

**You do not need to do anything for a new screen.** Do not add a per-screen
reveal; it is already covered, and a second one only adds a second thing that can
fail.

Three rules if you touch this machinery:

1. **Whatever hides content must own un-hiding it.** `revealWhenReady()` always
   applies its class, cap included, and `decode()` rejections are swallowed
   individually. One broken image must degrade the screen to ugly, never to blank
   (anti-regression rule 8).
2. **Scope reveal CSS to the surface it means.** The first version of the sheet
   rule was `.sheet-body:not(.sheet-in)`, and the Boneyard reuses `.sheet-body` as
   a SCREEN class, so it tied on specificity with `.screen > .route-in`, won on
   source order, and left the map blank. It is `#sheets .sheet-body` now.
3. **The guard is ARRIVAL in `tests/screen-sweep.mjs`.** It walks every tab and
   asserts the screen is both VISIBLE and has content, because "revealed" and
   "revealed with something on it" are different failures and an empty screen
   that faded in correctly is still broken. It caught the blank Boneyard above.

## Naming cosmetics (non-negotiable, added 2026-08-09)

Tom, after catching "Moss Braids" on an obvious knit beanie: **"always judge the
item while naming based on its looks on the bonehead not in isolation."**

Composite the item onto `SK0-1` (or the starter body for body slots) and view it
at **300px or more per item** before naming it. Both halves matter:

- **Worn, not loose.** HS4 in isolation is a green shape with two X's; on the
  skull it is plainly a sleep mask pushed up on the forehead. HS18 in isolation is
  a blade and a hilt; worn, the skull is skewered.
- **Legible, not a thumbnail.** All 13 wrong names came off a contact sheet at
  ~200px per cell, where a chunky beanie reads as braids, a bowl of water reads as
  a hat and a fish reads as a whistle.

`node tests/newart-audit.mjs <base> all` reports rows still carrying placeholder
`#N` names and any two rows in the same slot sharing identical art. Duplicate art
is a defect in itself: a player owns both and sees no difference, and it cannot be
named honestly. Recolour one using brand palette colours, do not ship twins.
