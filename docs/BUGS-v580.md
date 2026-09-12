# Five confirmed bugs at v580, for Codex

Sat Sep 12, Pacific. Each was re-read in the v580 source (`main` at `869a32d1`) today.
Line numbers are v580. None waits on a playtest. New-player items are excluded on
purpose; those come later.

House rules still apply: worktree only, PR to main, no em dashes anywhere including
comments, do not touch `js/paddock.js`, `js/paddock-cards.js`, pet bonding, bondUp or
the pet card slider.

---

## 1. The Laboratory only celebrates when the outcome was uncertain

**Where:** `js/app.js:21929` and `:21937`.
**What happens:** `receipt.distribution.length > 1` gates both the `Skip reveal` link
and the `lab-play` class. An experiment with one possible outcome, the certain one,
gets no reveal animation. The player who did everything right sees the least.
**Fix:** invert the intent. Play the reveal whenever a pet was produced; offer
`Skip reveal` only when there is something to skip. Keep the `reducedMotion` guard.
**Verify:** run a certain experiment and an uncertain one, screenshot both at +400 ms,
the certain one must animate.
**Origin:** R7-L6, run 7.

## 2. Without Apple Health you can never own a second pet

**Where:** `js/app.js:7031` (comment), `js/wellness.js` `logManualWalk`,
`js/game.js:789` `EGG_STEP_THRESHOLD = 14000` and `:852` where it is applied.
**What happens:** the manual "Add a walk" row pays XP, quests and Vigor and, as its own
comment says, "never writes a `steps` field". Eggs hatch on steps. A player who
declines Health, or has no watch, walks forever and never gets a second egg. And the
14,000 figure is rendered to the player zero times in `js/app.js`, so a Health player
on 9,000 steps a day sees two eggs in sixty days with no explanation.
**Fix:** two parts. Let manual walks contribute to egg progress, capped by the existing
2/day rule, even if they stay out of the step race. And print the threshold where eggs
are shown, in the player's words: "An egg needs 14,000 steps in a day."
**Verify:** fresh save, no Health, log two 30-minute walks a day for the days it takes,
read egg progress. Then find the sentence on screen.
**Origin:** R7-U4, R7-A3, run 7.

## 3. The restore-point sentence is false

**Where:** `js/app.js:22488`, the import review sheet.
**What happens:** the copy still reads *"Points stay on this device until Erase all
data or Delete account removes them."* v537 evicts everything but the last two, on
Tom's ruling. The sentence promises what the code deletes.
**Fix:** one sentence. "The last two restore points are kept on this device; older ones
are removed when a new one is saved."
**Verify:** read the sheet.
**Origin:** R4-7, run 4, still open since v537.

## 4. "Replace save" is dead after a refused import

**Where:** `js/app.js:21800` and `:21805`.
**What happens:** `finished = true` is set whether `commit()` resolves or throws. When
the import is refused (storage full is the common case), the player frees 5 MB, types
REPLACE again, and the button stays dead while the copy says "try again".
**Fix:** only set `finished` on a successful commit. On a thrown or refused commit,
leave the sheet live, keep the typed confirmation, and let the button fire again.
**Verify:** fill storage, attempt an import, free space, type REPLACE, the button must
work without closing the sheet.
**Origin:** R4-8, run 4.

## 5. The toast queue drops confirmations

**Where:** `js/app.js:3870`.
**What happens:** `while (toastQ.filter(item => !item.error && !item.action).length > 4)`
silently discards the oldest routine toast. Startup already queues 18 to 24 seconds of
them. Every Wardrobe confirmation shipped in v548 ("It's on", "It's off", "Saved") is
a routine toast on this same queue, so the fix that made the Wardrobe talk can be
thrown away before it is heard. An error toast also pre-empts a routine one
mid-display and drops it (R5-B2).
**Fix:** give player-action confirmations priority over startup chatter (v548 claims
this; the cap runs before it), never drop a toast that answers a tap, and re-queue a
routine toast an error interrupts rather than losing it.
**Verify:** boot, equip five pieces inside the first ten seconds, count the
confirmations that render. Must be five.
**Origin:** R5-B1, R5-B2, R9-F18.

---

Two decisions for Tom, not bugs, listed so they are not mistaken for one:

- **Meal chip guesses from the last entry** (R5-L1). The comment at `js/app.js:8981`
  now describes this as the design. Run 5 measured 60 of 80 meals needing a
  corrective tap. Keep or change.
- **Deleting a logged food** has no confirm, no name in the message, no undo (R5-B6).
