# Handoff: Boneheadz Gym, 2026-09-12

Written for a fresh Claude Code with no memory of this session. Everything below
was verified today, not recalled. Where something is unproven it says so.

**Your job for the rest of the day:** close the open items in ROADMAP.md's
register and keep the app shippable. Tom is sprinting toward App Store
submission.

---

## 1. Where everything is

| Thing | Value |
|---|---|
| Source | `/Users/tommiller/Documents/Hyperframes Editor/tally` |
| Remote | `https://github.com/tommillerca/tally.git` |
| Live PWA | `https://tommillerca.github.io/tally` |
| Live version right now | **v587**, verified |
| Backend | Cloudflare Worker + D1, database `bonez` |
| Lane dispatcher | `~/.local/bin/lane` |
| Lane worktrees | `/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/<session>/scratchpad/` |

The repo is called `tally` for historical reasons; the app is **Boneheadz Gym**.
Renaming the repo would break the installed PWA, so it stays.

---

## 2. Rules you do not get to reinterpret

These are Tom's, repeatedly stated. Breaking one costs trust, not just a revert.

1. **Never push to `main`.** It is PR-only and a direct push is rejected (GH013).
   Branch, PR, squash merge, then **verify the live URL serves the new version**.
   `git push` succeeding is not a release.
2. **Never deploy the Worker, never write production D1, never set secrets.**
   Read-only `SELECT` and schema on production D1 only.
3. **Do not touch `native/ASC-SUBMISSION.md`.**
4. **Nothing a player earned is ever permanently lost.** A missed day degrades to
   "dormant and recoverable", never destroyed.
5. **Cam's art is never redrawn, recoloured, rescaled or hue-rotated on disk.**
   At render time, move/uniform-scale/mirror/rotate/smooth-resample is fine;
   non-uniform stretch, tint, recolour and filter are not.
6. **No em dashes anywhere**, including code comments and commit messages.
7. **Do not touch** `js/paddock.js`, `js/paddock-cards.js`, pet bonding, `bondUp`
   or the pet card slider.
8. **A design or economy decision is Tom's, not yours.** A proposed fix written
   inside a bugs doc is NOT an approval. I shipped a manual-walk egg credit on
   that basis in v584 and he reverted it in v585: *"i never agreed to walks you
   log by hand adding to eggs people are going to scam that? that is a decision
   you need to ask me first."* Log it, ask, wait.

---

## 3. How to talk to Tom

From the project `CLAUDE.md`, and he enforces it:

- **Short.** Lead with the answer. No preamble, no recap, no restating a
  deliverable back to him.
- **Every reply ends with** a `TL;DR` line, then a short ordered
  `Next recommended steps` block naming who owns each.
- Cut reasoning that does not change his decision. Keep measurements, drop the
  narration around them.
- Flagging a real risk, blocker or your own mistake always stays.
- **Stand your ground on checks.** Verbatim: *"look im always going to push you
  to get more work done faster but i also dont fully know how you check things.
  you need to stand your ground and warn me that rushing a check and push will
  risk the quality of the app that is YOUR job to stand up for"*.

---

## 4. The register is the tracker. Use it.

`ROADMAP.md` has an **OPEN FEEDBACK** section at the top. Every request from Tom
lands there FIRST, quoted verbatim, before anything is built.

`tests/feedback-register-lint.mjs` is in the gate and fails the build if the
register is deleted, is empty, **paraphrases him instead of quoting him**, or
marks something done with no evidence.

That lint exists because I abandoned the roadmap mid-week and lost two requests
**at the writing-down step**: his sentence *"In back centre chests lose the
text..."* was logged as *"crates lose the text..."*, dropping the word **centre**,
so the centring was never built. A message with two asks gets two rows.

### Open right now

| # | Area | State |
|---|---|---|
| **F4** | Settings | **HIGH HARM, unstarted.** Importing an older backup silently removes newer earnings: measured 125 coins + 1 crate become 100 and 0, with the message "Backup restored". Breaks rule 4. Needs a durable pre-import snapshot; that is its own work order. Detail in `docs/PLAYTEST-SETTINGS.md` item 1. |
| **F5** | Melt | Review delivered in `docs/melt-review.md`, **needs Tom's pick**. Headline: every advertised Salvage Bench route just opens the Backpack, and the bench sits below the Kitchen. Sound hooks all exist, so "no sound on melt" is not a missing hook. |
| **F6** | Names | Still clipped at `#newcomersList .t3-tx b` (3758px of text in a 143px box) and `#lbBody .lb-who b` (86 in 77), plus ~144 rows at 200%/53px text. |
| **F7** | Pets | **Unanswered question from Tom:** do pets grow physically with breeding? Answer before building anything pet-size. |
| **F8** | Phone | Haptics decision, needs a real device. |
| **F9** | Onboarding | The restore-button trap: a non-gamer burned 14 taps in a restore sheet after taking the primary-styled "Restore an account". |
| **F10** | Steps | `weekSteps` clamp investigation. |
| **F15** | Toasts | **PARKED, deliberately.** The cap at `js/app.js:3870` is real but the symptom does not reproduce: four attempts on live all rendered 5/5 confirmations. A fix exists in lane `b5-toastq` with passing rows. Do not ship it without a real reproduction; shipping a queue change for an undemonstrated symptom is risk without benefit. |
| **F16** | Logging | **DECISION.** Meal chip guesses from the last entry; run 5 measured 60 of 80 meals needing a corrective tap. Keep or change. |
| **F17** | Logging | **DECISION.** Deleting a logged food has no confirm, no name in the message, no undo. |
| **F19** | Wardrobe | Closed in v586, but the naming question is Tom's: transmog is labelled "Dressing Room" and never called transmog to a player. |

---

## 5. How work gets done: Codex lanes

Tom wants Codex doing the building. **Codex cannot bind sockets**
(`listen EPERM 127.0.0.1`), so it cannot run a browser. Every render,
screenshot and browser audit is YOURS. That is the critical path on anything
visual, and it is why lanes hand back audits that have never actually run.

```bash
~/.local/bin/lane <name> <spec.md>                 # fresh worktree from origin/main
~/.local/bin/lane <name> <spec.md> --tree <path>   # continue an existing worktree
```

The wrapper refuses to build in the main checkout, refuses a dirty main, refuses
a worktree that is behind `origin/main` (a stale lane silently reverts whatever
landed since), and refuses a second lane in a live worktree. Respect the
refusals; they are all paid for.

**Write specs that carry the evidence.** The lanes that worked got measured
numbers, the file and line, the rule that constrains the fix, and an explicit
acceptance test. The ones that floundered got adjectives.

**Always demand the acceptance test:**

```
node tests/<audit>.mjs                                       # must PASS
node tests/<audit>.mjs https://tommillerca.github.io/tally/  # must FAIL
```

An audit that passes against live, which lacks the fix, proves nothing. That
happened twice today.

---

## 6. The verification contract

- **`npm run gate`** is `tests/release-gate.mjs`. The **PURE tier is 183 entries**,
  built from a `const PURE = [...]` literal **plus ~100 `PURE.push` sites**.
  Parsing only the literal gives ~75 and silently skips half. Enumerate both:

```js
const init = gate.match(/const PURE = (\[[\s\S]*?\]);/)[0];
const adds = [...gate.matchAll(/^PURE\.(?:push|unshift)\([^;]+\);/gm)].map(m => m[0]);
const pure = Array.from(vm.runInNewContext(init + '\n' + adds.join('\n') + '\nPURE'));
```

- **Four version stamps must agree:** `sw.js` VERSION, `APP_BUILD` in `js/app.js`,
  the newest `n:` in `js/changelog.js`, and `version.json`.
- **`docs/CLAIMS.md`** needs, per changelog item, a `Changelog item: <exact text>`
  line AND a numbered `N. PROOF: ... | REACH: ...` row. `r6-guards-audit` checks
  the first, `claim-evidence-lint` the second. REACH must name the route in
  words, and PROOF must name an audit the gate runs or say `NONE` and why.
- **Run the full tier on the MERGED tree**, never only per-lane. Four lanes green
  individually once produced a merged tree that broke the live app.
- **After merging, assert zero conflict markers** across the repo and that
  `app.css` brace balance (comments stripped) is 0.

---

## 7. Traps this session paid for. Read these; each cost real time.

1. **A backtick inside a JS template literal ends it.** I put an HTML comment
   containing `` `.ward-other-slots` `` inside a template. `node --check` PASSED
   (the backticks paired evenly) and the Wardrobe rendered a **completely empty
   panel with no page error**. Found by applying edits one at a time.
2. **`node --check` on a `.js` file parses it as CommonJS**, so `export` reads as
   a syntax error. Copy to `.mjs` and check, or a real break looks like a harness
   artifact.
3. **`page.evaluate(sourceText)` runs a CLASSIC script.** Feeding it an ES module
   throws `Unexpected token 'export'`.
4. **`page.click()` fails on these screens.** The hub renders inside its own
   scroller well below the fold (`[data-lab-slot]` at y1137 in an 852px
   viewport), and Puppeteer cannot compute a clickable point. Use
   `page.evaluate(() => document.querySelector(sel).click())`, still the real
   control and the real handler, so it is not seam-only.
5. **Routing too early.** `location.hash = '#/bonehead'` within ~1s of `boot()`
   finds no `#chTabs`. Wait for `#screen`, settle ~4.5s, `dismissOverlays`, then
   route.
6. **`bhFamilies()` returns a Map**, not an array.
7. **`innerText` is empty for content inside a collapsed `<details>`.** Use
   `textContent` when you want the label regardless of rendering.
8. **`scrollHeight` exceeds `clientHeight` by ~3px on every padded element**
   (border box vs padding box). Asserting `scrollHeight <= clientHeight` reds 40
   healthy buttons.
9. **A stale node reference after a re-render.** Toggling a control runs
   `refresh()`, which REPLACES the node; re-reading the old handle gives the old
   attribute. `ui-audit.js` called a working control broken this way.
10. **Headless freezes the animation clock.** Set `HEADLESS_MODE = 'shell'`
    before `boot()` (it reads at call time, so module-body assignment is fine).
11. **Reduced motion as `animation-duration: 0.001s`** runs a loop 1000x/sec. Cap
    the iteration count and assert the end state.
12. **`git checkout -- <file>` destroys uncommitted lane work.** Commit first.
13. **zsh eats `$var:app.css`** as a parameter modifier. Write `"${var}:app.css"`.

---

## 8. Failure patterns in the GUARDS, which matter more than the bugs

Tom's app has ~183 pure audits and ~129 browser ones. Today more time went into
guards lying than into product bugs. Watch for all four:

- **Hollow.** The audit crashes before grading anything and reports
  `rows=0`. Exit 1 with zero rows is NOT a red, it is nothing. Require a row that
  FAILS, naming what it could not reach, when a fixture cannot build.
- **Unfalsifiable.** A pixel audit returned `changedPixels=0` for four different
  states, including two that definitely animate. Add a **positive control** that
  injects a known-moving element and samples it through the same code path; only
  then does a zero mean anything.
- **Pinned to the defect.** `lab-ui-audit` required the source to contain
  `receipt.distribution.length > 1`, which was the bug, so it went red on the
  fix. `wardrobe-stack-audit` asserted twelve `.ward-other-slots` sections that
  Tom had just told us to remove. When a guard reds on a correct change, ask
  whether the guard is asserting a defect before you touch the product.
- **Fixture too weak to see it.** `wardrobe-rail-fit-audit` v1 opened a two-card
  family rail with no cosmetic card and stayed green with the fix removed. Prove
  every guard red on the real defect, not on a convenient mutation.

---

## 9. Lane worktrees you are inheriting

All under the scratchpad path in section 1.

| Lane | State |
|---|---|
| `b5-toastq` | **4 dirty files, 5 behind.** The F15 toast-queue fix, rows passing. Parked pending a real reproduction. Do not ship without one. |
| `l-nameclip` | Clean, 11 behind. Produced `tests/name-fit-audit.mjs`, declared `skip` in the gate as a working diagnostic that still exits 97. It FOUND the open F6 sites; promote it to `full` once it stops counting wrapping and a scroll container's overflow as truncation. |
| `l-roomheaders` | Clean, 11 behind. Shipped in v579. |
| `l-toast-rooms2` | Clean, 11 behind. Shipped in v579. |

Rebase any worktree onto `origin/main` before dispatching into it, or the lane
guard will refuse (correctly).

---

## 10. What shipped today, so you do not redo it

v577 through v587, all verified against the live URL:

- **v577** Backpack CSS lost in a chain merge (tab highlight, item dropdowns, pet box)
- **v578** the Bonehead's contact shadow reads instead of washing out; toast off Today's door tiles
- **v579** Bonehead grounded on his shadow and both figures 5% left; room headers; name clipping on Bonehead/Today; toasts clear of controls on every screen; spire underpayment (a confirmed takeover paid 40 instead of 80); wardrobe slot-scroll and stacking; Settings rows
- **v580** chests centred; Take off and The Studio swapped
- **v581** the Settings tidy, rebased from another session's v568 patch
- **v582** the false restore-point sentence; "Replace save" retryable after a refused import
- **v583** the Laboratory reveal plays for a certain outcome
- **v584** manual walks credited eggs, **REVERTED in v585**
- **v585** that revert, plus the Crew card plate that was covering the art
- **v586** the Wardrobe shows one slot at a time; the two nav buttons separated; rules in a dropdown
- **v587** the variant rail fits on screen and its art canvas is sized

`docs/CLAIMS.md` carries the measurement behind every one of those, including
the corrections where a first diagnosis was wrong.

---

## 11. Suggested order

1. **F4**, the import that deletes newer earnings. Highest harm, breaks a lock,
   and it is the last one of that severity.
2. **F16 / F17 / F7 / F19** are waiting on Tom. Put them in front of him early so
   they are not blocking at the end of the day.
3. **F6**, the remaining name clipping, with `name-fit-audit` promoted once its
   FITS row stops counting wrapping as truncation.
4. **F9**, the onboarding restore trap, which is a first-run quality item and
   matters for submission.

Do not start **F5** (melt) until Tom picks from `docs/melt-review.md` section 5,
and do not start **F15** without a reproduction.
