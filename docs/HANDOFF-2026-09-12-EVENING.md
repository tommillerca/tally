# Handoff, evening of 2026-09-12

Written for a fresh Claude Code with no memory of this session. Everything
below was verified today. `HANDOFF-CLAUDE-2026-09-12.md` (the morning one)
still holds for rules, how to talk to Tom, the lane dispatcher and the
traps; this file is what changed since. Read `docs/SESSION-LOG-2026-09-12.md`
for the hour-by-hour.

## Where things are

| Thing | Value |
|---|---|
| Live version | **v590**, verified (version.json, sw.js, APP_BUILD, changelog agree) |
| Shipped today | v588 (bench to Wardrobe, names wrap, delete confirm, four stuck buttons, forms), v589 (first run new-player first, leaderboard phrases, pet growth outside the Stable, recovery acknowledgement, privacy link, podium settlement), v590 (six atomic reward paths, meal chip option 3, replay identity, flagged friends, local race weeks) |
| Waiting on Tom | ONE Worker deploy: apply `server/migrations/2026-09-12-spire-takeover-receipt.sql`, then `server/deploy.sh`. `docs/SERVER-DEPLOY-PENDING.md` lists the bundle. Until then every Worker fix is code on main only |
| Tom's page | a private claude.ai artifact "Boneheadz Build Log" under his own account, regenerated from the scratchpad HTML; not veritree's org |
| Lane worktrees | `/private/tmp/claude-502/-Users-tommiller-Documents-Hyperframes-Editor/2c4b4d8a-2296-4d59-b3e6-da94e930b39d/scratchpad/<lane>`, all merged; safe to delete |

## The finding that matters most

**Main carries 48 browser-tier gate reds of its own.** The nightly board only
shows the pure tier, so nobody saw them. Measured by running the identical
full gate on a pristine worktree of main three times today (v587, v588,
v589): 48 every time, identical set. They are a mix of "Cannot update coins:
currency history does not match the balance" fixture crashes (one seed
helper, probably), DEPENDENCY NETWORK rows (the Worker does not answer from
this Mac), precache gaps (`js/hero-ground.js`, `js/laboratory.js` are not in
sw.js's list), and layout rows. A Codex triage of all 48 is landing as
`docs/GATE-REDS-2026-09-12.md`; read it before touching any of them.

**How to gate a train without chasing ghosts:** run the gate on the train,
run it on a throwaway worktree of `origin/main`, `comm -23` the FAIL lists.
Only the train-only reds are yours. Re-run each of those ALONE before
believing it: boneyard-scroll, v279 and boneyard-icon all went red in a gate
and green alone (or red on main alone too).

## Register state (ROADMAP.md OPEN FEEDBACK)

Closed today: F4 (was already fixed since v528), F5, F6, F7, F9, F16, F17,
F19, F20, F21 (client half), F22 (all four, Worker half pending deploy), F23
(all six). Open: F8 (haptics, needs a real phone), F10 (answered in the
economy doc: the previous-week clamp is deliberate; whether late Health
uploads should count is Tom's call), F15 (toast queue, parked, no
reproduction). Decisions Tom gave today are quoted verbatim in the rows.

## Traps this session paid for

1. **Extracted-source audits break when a new module-level function appears.**
   Nine audits went red across v589 and v590 only because their vm context
   did not know `petGrowth`, `relativeAgo`, `resumeGiftIntents` or
   `takeoverPaid`. The fix is always in the audit's context, never in the
   product. Grep `tests/` for the function's neighbours before you ship a new
   helper.
2. **Audits pinned to copy.** leaderboard-honesty required "Last online:
   2026-" and forbade "yesterday"; melt-ui required pre-v550 Dressing Room
   wording. Re-anchor at the assertion with Tom's quote in a comment.
3. **The provenance lint is a ratio.** Moving award sites into atomic payloads
   shrank its denominator and tripped 0.35 on healthy code. It is now an
   absolute ratchet (18 unresolved, floor of 20 resolved). Lower it, never
   raise it.
4. **A lane's "confirmed refusal" can be narrower than the app's.** The gift
   lane refunded only on three specific error bodies; the crew playtest's
   refusal is a bare 403. Any 4xx from the Worker is a refusal.
5. **`git worktree` of a lane cut from an older main will not rebase** once
   docs and gate declarations moved. Cut a fresh lane from the new main and
   give it the old spec plus "here is what round 1 did".
6. **Two lanes appending to `app.css`** conflict; keep both blocks. Two lanes
   adding v-next entries to `js/changelog.js` and `docs/CLAIMS.md` conflict
   every time; take ours, then write ONE unified entry (one `Changelog item:`
   line and one numbered `PROOF | REACH` row per item, audit named bare).
7. **`git checkout --ours` on `tests/release-gate.mjs` drops a lane's
   declaration.** Re-add it, or the gate refuses with "belongs to more than
   one running tier" or the claims lint says "the gate does not run".
8. **A schema change needs `cd server && node scripts/schema-guard.mjs
   --generate`** or migration-guard-audit goes red on "stale write contract".
9. **zsh does not word-split unquoted variables.** `for x in $L` iterates once.
   Use `${=L}`.
10. **claim-evidence-lint resolves `tests/x.mjs` against `tests/`**, so a
    PROOF names the audit bare or inside a backticked command.

## Suggested order for tomorrow

1. Read `docs/GATE-REDS-2026-09-12.md` and fix the FIXTURE class first (one
   seed helper probably turns a dozen rows green).
2. F8 needs Tom with a phone; F15 needs a reproduction; neither is a lane.
3. After Tom deploys, run the Worker audits against production read-only
   (`SELECT` only) to confirm podium settlement and the flagged-friends
   predicate behave on real rows.
