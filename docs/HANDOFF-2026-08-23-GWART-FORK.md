# Handoff: the "Gwart (fork)" session, 2026-08-23

Written because Tom is closing this session and continuing with another. Read
this instead of asking; everything below was verified, and where it was not, it
says so.

Main at handoff: `a0e0f636`. App is on **v426**, live.

---

## 1. SHIPPED TODAY (merged AND live)

Verified live by fetching `js/app.js` from the live origin and grepping for
symbols the changes introduced, not from local state.

| PR | What players get |
|---|---|
| #96 | **The Pit.** Wanderer no longer overlaps your Bonehead (78.5px overlap → 22.5px gap), tail cropped with Tom's explicit approval, boss 3.19x → 2.76x. Pets sized to each other (Bumbleseal was +22%, now +5%), the Pit rarity glow removed (350 gold px → 0), pets mirrored to face the enemy, and the Wanderer despawns after you beat him. |
| #97 | **Saved fits.** A fit now stores the gear loadout AND looks on gear slots, so Take-it-all-off → re-wear restores all 14 slots instead of 7. |
| #98 | **Gwart's crate nag** capped to once per app open, and **double-tap** Today (scroll to top) / Boneyard (recenter map). |
| #101 | Changelog for the above, which had shipped unannounced. |
| #103 | (peer) notif-audit stub fixed. |
| #106 | SHIP-LEDGER corrected, see §4. |

## 2. OPEN: PR #99 — the Today rework

**The only open PR.** Mergeable, conflict resolved, but **a clean full gate run
on a QUIET machine is still owed** and that was my one reservation about merging.

What it does: variant **d2 "the container"**, approved by Tom after two mockup
rounds (round one fixed the card skin and he said "it still needs work" —
correctly, it fixed the skin not the ANCHOR). One `Today, Aug 22` header owns the
screen, the day arrows live inside it, food/wellness/activity/meals nest beneath,
the New Creatures promo is evicted below the day. A past day renders WHOLE
(`FRIDAY / Aug 21`), which fixes Tom's "makes the player feel like they just
broke the game".

**Past-day quests are read-only**, Tom's explicit call, enforced in `js/quests.js`
at both mint sites (`claimQuest`, `claimAllBonusIfDue`) via
`periodKey < periodKeyOf(period, dateKey())` — NOT on the click handler. A test
tree reverting only the authorisation while keeping the read-only markup still
paid **340 → 380 coins** when the real control was driven. The button was never
the protection.

Two deliberate deviations, both measured:
1. **Wellness stays today-only.** `js/wellness.js` keeps water/bed/sleep in ONE
   kv record stamped with one date and `save()` overwrites it, so one tap on a
   past day would destroy today's wellness. The guard declares this exception.
2. The mockup hid a whole title row, which took Activity's `#hkSync` and
   Kitchen's Collect off screen. Only the name is hidden.

The merge conflict was substantive, not textual: this branch carried
`.pet-fighter translateX(14px)`, a value that existed only because the Wanderer
filled the arena. #96 fixed that and main moved the pet to `-8px`. Resolved in
MAIN's favour; both Pit audits re-run green on the merged tree.

## 3. NOT FINISHED — decide, do not assume

| Branch | State | Note |
|---|---|---|
| `x425/appcore` | **SUPERSEDED — close, do not merge** | All four items are covered by #98 and #99, each re-verified from scratch. Two of its implementations were actively wrong (see §5). |
| `x425/css` | **UNVERIFIED WIP** | Crew card pet cropping, banner icon centring, background into the dynamic island. ~98 lines of app.css. NO prove-red, NO gate run. Rescued from a worktree after an outage killed its agent. |
| `x425/wanderer` | **UNVERIFIED WIP** | Water oracle so the Wanderer stops standing in lakes. Adds `js/water.js` (OpenFreeMap vector tiles, `water` source-layer) and a `'./js/water.js'` PRECACHE line in sw.js. The recon gate apparently PASSED but its verdict was never reported. **Distrust until re-verified** — the whole point of that gate was that a non-deterministic oracle puts the Wanderer in different places for different players, which is worse than the lake. |
| `x425/wheel` | committed, gate never read | Wheel labels upright at every rest rotation. |
| `x425/bots` | done, **awaiting Tom** | See §6. |
| `x425/mockup-today-b`, `x425/mockup-today-v2` | mockups only | Never merge. v2's d2 is what #99 ships. |

## 4. THE THING I GOT WRONG THAT MATTERS MOST

**Merging to main IS shipping for app code.** I told Tom repeatedly that merged
fixes "reach nobody" until `sw.js VERSION` moves. False. The app shell (HTML plus
our own js/mjs/css/json, anything not under `/vendor/`) is served **network-first
with `cache: 'no-cache'`**; cache is the offline fallback only. The bump delivers
the `APP_BUILD` string in Settings, the What's New dot, and a fresh precache —
not the code. Cache-first and genuinely gated on the bump: fonts, images,
`/vendor/`.

I got it from a wrong sentence in `docs/SHIP-LEDGER.md`, which had been living
UNTRACKED in one clone where nobody could review it. Corrected and brought onto
main in #106.

**Consequence:** do not hold an urgent fix waiting on a version bump.

## 5. LANDMINES THAT COST REAL TIME TODAY

- **This machine cannot be trusted for timing tests while sessions run in
  parallel.** Reds scale with load on UNCHANGED code: a clean archive of main
  scored 79/81 at load 13 and **66/81 at load 40**, different failure set each
  run. Peak was load 83 with 103 Chrome processes. **Re-run any red solo before
  believing it.**
- **`git --git-dir=<worktree> checkout` rewrites the worktree index.** It shipped
  two pre-fix commits while audits kept passing against the working tree. Seed
  throwaway trees with `git show <rev>:<path> > file`, and verify from
  `git archive HEAD`, never the working tree.
- **A pipeline's exit code is the last command's.** `npm run gate | tail -40`
  reported exit 0 for a run with 20 failures. Read exit codes from a FILE.
- **`NOSOCIAL = S.demo || navigator.webdriver === true`** and puppeteer sets
  `navigator.webdriver`, so **boot autoSync NEVER RUNS UNDER AUTOMATION**. Any
  row asserting boot-time sync is grading the harness.
- **Two remotes.** `origin` is PUBLIC, `private` is tally-source (PRIVATE).
  `ext/art-memory-census` was on the PUBLIC repo 05:28Z–12:56Z today with the
  571-line work register in it, because the branch's upstream was `origin` and a
  bare `git push` from that clone published it. Remediated by a peer (upstream
  repointed to `private`); I verified `git push --dry-run` now targets
  tally-source and origin has zero matching branches. **`git push --dry-run` is
  the only command that answers "where would this actually go".**
- Uncommitted work in a scratch worktree is **invisible to every branch search**,
  and `git diff` **cannot see untracked files** — a patch-based rescue silently
  captures only the tracked half.

## 6. WAITING ON TOM — nothing here is mine to decide

1. **The D1 hardening migration.** He said "apply the migration"; the classifier
   blocked me, I gave him the command, and the terminal is sitting at a `Y/n`
   prompt that was never answered. **Production D1 still lacks the `rate_limits`
   table and the 4 `players` columns** (`max_level`, `max_level_at`, `week_key`,
   `week_steps`) that the deployed worker references. Pre-state measured: the
   migration also deletes exactly 64 poisoned rate-limiter rows (8 `rl_recovery`,
   56 `rl_ridcheck`) — that deletion is the migration's INTENT, it lifts existing
   account-recovery lockouts. 87 players, 99,369 events, nothing else touched.
   **Unexplained and worth resolving: players sync fine despite the missing
   columns, which contradicts the code. My model is wrong somewhere.**
   ```
   cd "<recon>/server" && npx wrangler d1 execute bonez --remote --file=migrations/2026-08-16-hardening.sql
   ```
2. **47 bot accounts** on a purge list awaiting his eyeball —
   `docs/BOT-PURGE-LIST-2026-08-22.md` on `x425/bots`, copied to
   `~/Documents/tally-handoff-2026-08-23/`. **Read-only census; nothing was ever
   deleted.** 47 certain test accounts in five registration bursts, 19 "maybes"
   deliberately EXCLUDED because a real day-one player must never be purged.
   The branch also drafts (does not apply) an `is_test` flag and server filters.
3. **PR #99** — merge, or wait for the clean gate run.
4. **Close `x425/appcore`.**

## 7. ARTIFACTS SAVED OUT OF /private/tmp

`~/Documents/tally-handoff-2026-08-23/` (30MB, 43 files) — scratchpad is in
`/private/tmp` and will vanish:
- `screenshots/pit-before-after/` — the measured Pit fix
- `screenshots/today-mockups-v1/`, `today-mockups-v2/` — both approval rounds
- `screenshots/today-d2-shipped/` — what #99 actually renders, incl. past-day
  and read-only quests
- `BOT-CENSUS-2026-08-22.md`, `BOT-PURGE-LIST-2026-08-22.md`

Session register: `docs/SESSION-2026-08-22-BIGBATCH.md` on branch
`docs/feedback-plan-2026-08-22`.

## 8. FEEDBACK OF TOM'S THAT IS CAPTURED BUT NOT BUILT

From the big batch, still unbuilt and NOT in any branch: the cauldron icon +
haunted-kitchen banner mockup, the ectoplasm/transmute explainer and Gwart-as-Navi
FAQ page, the crew cheers interface + paid cheers concept, the transmog clarity
rework, viewing a friend's paddock, pets keeping cosmetics while unequipped, and
the **walk-and-collect potion** (15-minute offline collection, explicitly must not
farm bosses). All are in `docs/FEEDBACK-2026-08-22-v424.md` / the session
register. **Do not let these quietly die — Tom's standing instruction is that a
deliverable nobody has been told about is not delivered.**
