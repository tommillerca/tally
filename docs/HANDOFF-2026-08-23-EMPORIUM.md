# Handoff: the Emporium session, 2026-08-23

Written for the Gwart sessions. Everything below is either merged, open as a PR,
or explicitly parked with a reason. Nothing is sitting on an unpushed branch.

Main was at **v424** when this session started and is at **v426** now, live.

## 1. What shipped, and how it was verified

| PR | what | verified |
|---|---|---|
| #85 | Emporium idle: `hub:shop` 119.9 style recalcs/s -> **0.0**, Cam's wizard-cast keyframes bit-for-bit unchanged | opacity identical to 3 decimals and transform to 4 at 13 offsets vs unpatched main, with a before-vs-before control run for the noise floor |
| #88 | README privacy claims corrected to what the code does | live file fetched from raw.githubusercontent |
| #89 | privacy.html gains the location section it never had | ditto |
| #90 | **cloud backup OFF actually stops the upload** | fake API received a 116,074-byte `PUT /backup` after opting out; 0 after the guard |
| #92 | v425 stamp | live `sw.js` read through the real service worker |
| #100 | v426: the write-failure seam gets the consumer it shipped without | the new audit run **against the live site**, 6/6 |

Open: **#103** (notif-audit stub, test-only, app untouched).

## 2. The traps. These are the parts that will cost you time

**A dead animation is not removed by taking the second one away.** Chrome decides
compositability WHEN AN ANIMATION STARTS and never re-evaluates one that keeps
running. `animation-name: none, zGlowIdle` leaves the same animation OBJECT in
place and still reads 119.9/s while looking correct in `getAnimations()`. Only a
NEW element gets a fresh decision. Changing the delay under a class DOES force a
re-decide but slides the running timeline: 2.4s -> 0s put the glow at .740
opacity where Cam's has .351.

**`NOSOCIAL = S.demo || navigator.webdriver === true`.** Puppeteer sets
`navigator.webdriver`, so **the boot `autoSync` never runs under ANY automation**,
with or without `?demo`. A reload-based row asserting "no upload on boot" read a
clean 0 on the BROKEN tree twice before it was caught. Anything grading
boot-time sync behaviour here is probably grading the harness.

**`.screen:not(.screen-in) { opacity: 0 }` puts the hide on the SCREEN, not its
child.** A probe sampling `.screen > *` reported "never unpainted" for every
target INCLUDING a tab-bar route, at 6x CPU throttle, which reads exactly like
"nothing to see here". Keep a tab-bar route in any such run as a positive
control or you will get that answer.

**A test that supplies the missing collaborator cannot notice it is missing.**
`write-failure-seam-audit` registers its OWN sink to observe the seam. Correct
testing, and precisely why 29 green assertions sat on top of a feature that did
nothing for a whole release: nothing called `onWriteFailure`. Two cheap tells:
a commit message naming a file its diff never touches, and an exported
registration function whose only occurrence in the tree is its own definition.

**The shell is served NETWORK-FIRST.** Merging to main IS shipping. A version
bump is not what carries code to devices; it carries the Settings build string,
the What's New dot and a fresh precache. `SHIP-LEDGER.md` still says a merge
alone reaches nobody while VERSION has not moved: that describes the PRECACHE
path, is no longer how the shell is served, and it is the sentence that misled
this session for hours. **Somebody should reconcile it.**

**An exit code read through a pipe is the last command's.** The 84-suite gate
run reported "exit code 0" with 20 failures in it, because the command ended in
`| tail -40`.

## 3. My own mistakes, so nobody repeats them

- I told Tom repeatedly that "nothing since v424 has reached a player". Wrong,
  see network-first above. It mis-prioritised a release.
- I reported #78 as live from a symbol grep of the deployed bundle. The symbols
  were there and the feature was dead. **Live means driving the page.**
- I stamped v426 with a changelog describing only my own change. #96, #97 and
  #98 had merged before the bump and rode out unannounced, including a brand new
  double-tap gesture nobody can discover unaided. **PR #101 fixes that and is
  the right call.** Before stamping a release, diff what merged since the last
  stamp, not what you personally landed.
- Two probes I wrote were blind and passed on broken trees. Both were caught by
  a positive control and by nothing else.

## 4. Parked deliberately, with reasons

- **Production D1 is missing `migrations/2026-08-16-hardening.sql`.** Verified
  read-only by the Gwart dev session: no `rate_limits` table, `players` lacks
  four columns, yet players synced. **That contradiction is unexplained**, and
  Tom declined a live-API probe. It was routed to this session and refused: a
  job the user declined in one session does not become available by being handed
  to another. Diagnose before applying.
- **`ext/art-memory-census`**: the main clone sits on a branch whose remote is
  gone, behind main, with uncommitted `app.css`, `tests/boneyard-audit.mjs` and
  `native/.../build.gradle` last touched 2026-08-20 19:18. Snapshotted to
  patches; nothing at risk while it waits, but it is still unreconciled.
- **A hub CHIP tap blanks the screen 104-203ms at 6x throttle.** Measured from
  both sides: it is a COST, not a regression. `refresh()` instead of `route()`
  sends chips back to never-unpainted AND turns `handover-audit` red with 8
  ghost frames. The blank IS the anti-ghosting fix. Do not "fix" it.
- **`x425/appcore`, `x425/css`, `x425/wanderer`** remain unverified WIP.

## 5. New guards this session left behind

- `tests/cloud-optout-audit.mjs` (FAST) — the opt-out really stops the upload.
- `tests/write-failure-toast-audit.mjs` (registered) — the seam has a consumer.
- `tests/idle-perf-audit.mjs` `KNOWN_HOT` is now `{}`, its only ever entry
  retired in the same change that fixed it, as its both-directions assertion
  demands.

Every one was proven red before being trusted, each in its own `cp -R` throwaway
seeded with `git show <rev>:<path> >`, never a worktree checkout.
