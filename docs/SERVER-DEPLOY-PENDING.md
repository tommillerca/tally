# The Worker is behind main, on purpose

Written 2026-08-23, after #77 merged.

> ## CORRECTION, 2026-08-25 — READ THIS BEFORE THE TABLE BELOW
>
> **Everything under "State" was already stale when I read it, and it cost a
> round of wrong assumptions. Derive schema truth from the LIVE DATABASE, never
> from this file.**
>
> ```
> npx wrangler d1 execute bonez --remote --json \
>   --command "SELECT name FROM pragma_table_info('players');"
> ```
>
> **What is actually true now:**
>
> - **All four pending migrations HAVE been applied to production D1** (2026-08-25),
>   in order: `2026-08-22-test-accounts`, `2026-08-23-flag-known-test-accounts`,
>   `2026-08-16-indexes`, `2026-08-17-prune-and-stats`. `is_test` and `grants_ack`
>   both exist. The section below says none had ever been applied; in fact
>   `2026-08-16-hardening` was ALREADY live before any of this (max_level,
>   week_key, week_steps, rate_limits and idx_rate_limits_expiry were all present),
>   so its `DELETE` of poisoned limiter rows had already run.
> - **The 47 test accounts are DELETED, not flagged.** Player count 98 -> 51.
>   Verified against live data before writing: all 47 at level 1, **zero
>   friendships**, zero recovery codes, spires, trades or fights. Friendships
>   still 80 afterwards, the 14 real progressed players untouched.
> - **The Worker itself is still NOT deployed.** `server/deploy.sh` was refused by
>   a permission gate. The gap is safe: the new columns are additive, so the older
>   deployed Worker ignores them, `/health` is 200 and the gated routes still 401.
>   What the deploy buys is the `is_test` filter for FUTURE test accounts; it is
>   no longer what cleans the leaderboard, because those rows are gone.
> - **`crons = []` is committed**, so deploying starts NO pruner. #77's 15-minute
>   pruner deletes rows from a live database and has never run against real data.
>   It stays off until somebody decides to watch the first tick.

## State

| | |
|---|---|
| deployed Worker | healthy: `/health` 200, `/admin/players` 401 (gated) |
| API base | `https://bonez-api.boneheadz.workers.dev` |
| main's server HEAD | `24ab7b6b` (#77) |
| deployed | **everything up to `f18d479f`. #77 is NOT running.** |

**Nothing is broken by this.** The live client is v425, which predates #77, and
#77 is server-internal (retention, pruning, indexes). No shipped client code
depends on it. The divergence is safe to sit on and unsafe to forget.

## Why it was not deployed with the merge

`server/deploy.sh` is a deliberate, separate step, and #77 needs two things that
a merge does not do:

1. **Two new migrations against production D1**, `2026-08-16-indexes.sql` and
   `2026-08-17-prune-and-stats.sql`. Schema changes are not reversible by
   re-deploying.
2. **A cron trigger**, `crons = ["*/15 * * * *"]` in `server/wrangler.toml`. Once
   live it prunes every fifteen minutes, unattended.

#77 DELETES ROWS from a live database with real players in it. That is the whole
feature. It deserves someone watching it, not a merge side effect.

## What was verified, and what was not

Verified locally on a fresh D1 with `schema.sql` plus all five migrations:

```
schema-plan       12 passed, 0 failed     (asserts the migrations and schema.sql agree)
api               39 passed, 0 failed
retention         13 passed, 0 failed
grants-retention  17 passed, 0 failed
```

All four exit 0, so `deploy.sh`'s pre-deploy gate can pass for the first time.

**Not verified:** anything against production. No migration has been applied to
the real D1, the cron has never fired, and the pruner has never run against real
data. Local green says the logic is right; it says nothing about the shape of the
production tables.

## Two guards were fixed to get here, and why it matters

`api.test.mjs` and `retention.test.mjs` each had a positive control that could
never pass. Both counted the rate limiter through `/dev/events-count`, which
reads `events`, and #77's whole point is moving the limiter into `rate_limits`.
So each failed with "the limiter wrote no row, so this test proves nothing".

They were right, and they failed loudly rather than passing on an empty sample.
The precondition simply encoded the behaviour the change removes. Fixed with a
DEV-only `/dev/ratelimit-count` over the correct table.

Proved they are still real controls: with the limiter mutated to record nothing
(`INSERT ... SELECT ... WHERE 0`), both go red again with their original
messages. A "fix" that turned two controls into decorations would have been worse
than the failing tests.

## To deploy

```
cd server
npx wrangler d1 execute bonez --remote --file=migrations/2026-08-16-indexes.sql
npx wrangler d1 execute bonez --remote --file=migrations/2026-08-17-prune-and-stats.sql
./deploy.sh
```

`deploy.sh` runs the four suites first and refuses on any failure. It was written
after a deploy reported success while shipping three-releases-stale code, so
believe its refusal over any local impression.

**Afterwards, verify against the deployed Worker, not the deploy output.** A
`wrangler deploy` returning 0 is not evidence. Curl a route the change
introduces, and check the cron actually fired by watching the prune counters
move.

---

# Second thing waiting on that same deploy: the test-account flag (2026-08-23)

Branch `x425/bots-invisible`. It rides the SAME deploy, deliberately: two
deliberate deploys are two chances to get the order wrong.

## What it is

Tom, 2026-08-22 (`docs/FEEDBACK-2026-08-22-v424.md`, item 6): "im pretty sure
youve somehow added a bunch of bot testers again because we have a ton of lvl 1s
that no one plays. it's okay if you need to do this to test the game but find a
more eloquent solution to this than just leaving a mess of dead bots in the
actual game."

He complained about CLUTTER, not about rows existing. So nothing is deleted.
`players.is_test` flags an account and every public surface stops showing it.
Flagging is reversible with one UPDATE; deleting is not reversible at all.

**NOTHING HAS BEEN DELETED AND NOTHING WILL BE BY THIS.** The drafted DELETE in
`docs/BOT-PURGE-LIST-2026-08-22.md` stays drafted and is Tom's call alone.

## The three commands, in this order

```
cd server
npx wrangler d1 execute bonez --remote --file=migrations/2026-08-22-test-accounts.sql
npx wrangler d1 execute bonez --remote --file=migrations/2026-08-23-flag-known-test-accounts.sql
./deploy.sh
```

1. **`2026-08-22-test-accounts.sql`** adds `players.is_test INTEGER DEFAULT 0`.
   One column, additive, no data touched.
2. **`2026-08-23-flag-known-test-accounts.sql`** sets `is_test = 1` on exactly
   the 47 ids in the census. Idempotent. Every "maybe a human" is off the list.
3. **`deploy.sh`** ships the worker that filters on the column.

**ORDER IS NOT OPTIONAL.** Deploying the worker before step 1 breaks every
filtered route with "no such column: is_test". Verified locally on a
production-shaped schema (origin/main's `schema.sql`, which has no `is_test`):
running step 2 first fails with `Parse error near line 27: no such column:
is_test`, and running 1 then 2 flags the census bot and leaves the real player
at 0.

## After it lands, verify against the DEPLOYED worker

```
npx wrangler d1 execute bonez --remote --command \
  "SELECT COUNT(*) flagged FROM players WHERE is_test = 1;"      # expect 47
npx wrangler d1 execute bonez --remote --command \
  "SELECT COUNT(*) total FROM players;"                          # expect 87, unchanged
```

87 unchanged is the row that proves nothing was deleted. Then open the Crew tab
on a real device: the leaderboard and the "Worth adding" card should have lost
the level-1s and kept every real player.

## To undo, at any time

```
npx wrangler d1 execute bonez --remote --command "UPDATE players SET is_test = 0 WHERE is_test = 1;"
```

That is the entire rollback. The rows never went anywhere.

## Still true, and still not fixed by any of this

`2026-08-16-hardening.sql` has never been applied to production either (the
census found `max_level`, `max_level_at`, `week_key`, `week_steps` missing from
the live `players` table). That is a separate, older gap with its own risk, and
this branch did not touch it. Whoever runs the deploy above should decide
consciously whether that migration goes in the same window.

---

## x429 (crew cheers, friend paddocks, pets keep their wear) needs NO deploy

Added 2026-08-23. Recorded here because "does this branch need the Worker?" is
exactly the question this file exists to answer, and for this one the answer is
no. Nothing below is waiting on `server/deploy.sh`.

**No migration, and no server file changed.** The branch adds one field, `yard`,
to the profile snapshot the client PUTs to `/profile`. It rides today's deployed
Worker untouched, because `sanitizeSnapshot` SPREADS the snapshot
(`const snap = { ...rawSnap }`) and clamps named fields rather than allow-listing
them. A field the server has never heard of is stored and handed back verbatim.
That is a property worth naming, since the opposite (a DTO allow-list) is the
usual reason a new field disappears silently between two hops.

**The crew-only promise is already true of the deployed Worker**, for the same
reason and with nothing to deploy: `GET /friends` returns the whole profile blob
joined through an ACCEPTED friendship, while `GET /leaderboard` json_extracts a
FIXED list (level, levelName, badges, outfit, pet, stats, and a COUNT of gear)
for any authenticated caller. `yard` is not in that list, so it reaches accepted
friends and nobody else. `tests/friend-paddock-audit.mjs` reads that SELECT out
of `server/src/index.js` and goes red if `yard` is ever added to it, so this stays
true rather than merely being true today.

**If the Worker is later changed to allow-list the snapshot**, `yard` has to be
added to the allow-list in the same change, and it must NOT be added to the
leaderboard extract. Both halves.

The pet roster and its wardrobe ride the PLAINTEXT `players.profile` column, never
the end-to-end encrypted `backups` blob. That is deliberate: a friend cannot
decrypt the vault either, so the vault is not a channel to another player at all.
