# SOCIAL: friends, trading, PvP, friendship achievements

The plan for taking Boneheadz Gym from a fully on-device game to a social one,
without giving up the two things the app is built on: data safety (additive
ledger, no destructive changes) and privacy (food logs NEVER leave the device).

## Why this is feasible now

Three design decisions made early were made FOR this moment:

1. **Event-sourced ledger with idempotent keys.** Every reward is a uniquely
   keyed row; totals are folds. A server can hand the client new ledger events
   (trades, PvP rewards, friend badges) and the client ingests them exactly like
   local ones. Nothing about local play changes.
2. **Deterministic, pure combat engine.** `pit.js` has no DOM and seeded RNG.
   The SAME file can run inside a serverless worker: submit a fight as
   `{seed, builds, actions[]}` and the server REPLAYS it to verify the result.
   Cheat-resistant PvP without real-time infrastructure.
3. **Date-seeded world.** Spawns/quests are already server-verifiable without
   the server ever knowing location.

## Architecture (recommended)

**Backend: Cloudflare Workers + D1 (SQLite).** One small REST API.

- Free tier: 100k requests/day, 5GB D1: effectively $0 forever at friends-scale,
  and unlike Supabase's free tier it never pauses from inactivity.
- Workers run plain JS: we bundle `pit.js` ITSELF into the worker for fight
  verification. One source of truth for combat.
- Deploys with `wrangler` from the repo (new `server/` dir), versioned with the
  app. NEEDS: a free Cloudflare account (Tom, one-time).

**Identity: anonymous device keypair + friend codes. No emails, no passwords.**

- First "Go Online" tap generates a WebCrypto keypair; public key registers with
  the server and gets a **friend code** (e.g. `BONE-4F7K-92QD`) and a generated
  bone-flavored handle ("Rattling Rex"). Private key lives in IndexedDB kv and
  rides inside the existing export/backup (recovery = import backup).
- Every API call is signed by the device key. No PII at all: nothing to leak,
  no login screens, App Store-friendly (no third-party login means no forced
  Sign in with Apple).
- Handles are GENERATED, not free text (dodges username moderation for now; a
  curated rename list can come later).

**Sync model: profile snapshots up, grants down.**

- UP: a small **profile snapshot** derived from the ledger: level, stats,
  equipped outfit (item ids only, art renders locally), owned gear ids, badge
  count, spec archetype. No food data, no weights, no location. Pushed on app
  open + after fights.
- DOWN: a **grants feed**: server-issued ledger events (`trade-<id>`,
  `pvp-<id>`, `friend-<n>`) the client pulls and ingests idempotently. Offline
  = fine; it catches up next open.

## Phases (each ships as its own vNN with tests + e2e, per the ritual)

### S0: Backbone (server + identity + Go Online)
- `server/` Cloudflare Worker + D1 schema: `players`, `friendships`, `trades`,
  `pvp_fights`, `grants`.
- `js/social.js`: keypair, signed fetch, register, profile snapshot builder,
  grants ingester.
- Settings "Go Online" card (opt-in, with plain privacy copy: "your game
  profile syncs; food logs never leave this phone"). Privacy copy elsewhere
  updated to match.
- Verify: worker unit tests run locally against `wrangler dev`; e2e stage
  covers register -> snapshot -> grants round trip.

### S1: Friends (the Crew)
- Friend request by code, accept/decline/remove. Friends list with real
  rendered avatars (their equipped outfit ids + local art), level, spec.
- New **Crew screen**. Home shortcut row goes 5 -> 6 in a balanced 3x2 grid
  (Boneyard / Wardrobe / Kitchen // Backpack / The Pit / Crew).
- Friendship achievements v1 (ledger type `social`): First Friend, Bone Crew
  (3), Full Squad (6).
- Request polling on app open/resume (push notifications are a later phase).

### S2: PvP ghost battles for rewards (the big one)
- Challenge a friend from the Crew screen: you fight their **ghost** (their
  real build snapshot, driven by the existing fight AI) in the shipped combat
  engine, with full manual control of your side + your pet.
- Client submits `{seed, myBuild, theirBuildRef, actions[]}`; the worker
  replays the fight with the bundled `pit.js` and only then issues the reward
  grant. Engine version is pinned in the payload; mismatched versions verify
  against the matching bundled engine or fall back to capped rewards.
- Rewards: coins per win with a daily rewarded-fight cap (e.g. 10), a weekly
  first-win bonus per friend, and a weekly **Crew leaderboard** (wins among
  friends) with a season badge. All additive; losing never costs anything.
- Anti-cheat: build sanity caps (stats must be reachable at claimed level, gear
  must exist in the catalog and be in the claimed inventory), rate limits,
  server-side replay as the source of truth.
- Balance: PvP-vs-ghost gets its own audit pass in `tests/balance-audit.js`
  (naive-policy win-rate bar applies here too).

### S3: Trading (gear escrow)
- Friends-only, gear-for-gear (1-3 pieces each side), no coins in trades v1
  (kills the dupe-farm economy risk). Both sides confirm; the worker executes
  atomically; each side receives the gear as a `trade-<id>` grant.
- Guards: can't offer gear you don't own (server checks claimed inventory),
  can't receive gear you already own, one trade per friend-pair per 24h,
  full trade log.
- Achievements: First Trade, Fair Dealer (5 trades).

### S4: Social flavor
- Gifting (send a friend one crate/ingredient per day), weekly friend quests
  ("win 3 Crew battles", "trade once"), profile wave/emote.
- Native push notifications (challenge received, trade offer) once TestFlight
  distribution is sorted; APNs setup rides on the paid dev account.

## Anti-abuse and privacy principles (non-negotiable)

- Everything social is **friend-gated**: no strangers, no discovery feed.
- Server is authoritative for anything that grants value; the client is
  authoritative for everything private.
- All social state lands as **additive ledger events**: the data-safety
  contract and the `migrate` e2e stay green.
- Food logs, weights, and location NEVER upload. The snapshot is game-state
  only, and the Settings copy says exactly what syncs.
- Wellbeing guardrail holds: no social mechanic ever rewards eating less.

## Costs

- Cloudflare free tier: $0/mo at this scale (friends + testers).
- No new paid services. Apple dev account already paid (needed for TestFlight
  anyway). Optional custom domain later (~$10/yr) but workers.dev is fine.

## What Tom needs to decide / do

1. **Approve the architecture calls**: Cloudflare Workers + D1, anonymous
   device-keypair identity + friend codes, async ghost PvP (no realtime v1),
   friends-only gear-for-gear trading. (All recommended above.)
2. **Create the free Cloudflare account** (or hand me an API token) when S0
   starts.
3. **TestFlight** remains the real unlock for friends on native (App Store
   Connect app record + API key are still pending on Tom).
4. Eventually: sign off on PvP reward numbers before S2 ships.

## Order of operations

S0 -> S1 ship together as the first drop (accounts mean nothing without
friends). S2 next (it is the fun). S3 after (it needs mature inventories to be
interesting). S4 sprinkles in whenever. Each phase is one to two focused
sessions at this project's usual pace.
