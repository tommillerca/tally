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
