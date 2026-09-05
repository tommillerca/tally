# God mode: making one player whole

Tom, 2026-08-21, about a player who deleted her Day One Lizard by accident:
_"there will be tiems that we need to go god mode and fix player's mistakes by
giving them a new pet etc"._

This is that. Two admin routes, both gated on `ADMIN_TOKEN`, both usable from a
phone with curl at 2am. **Copy the commands, change the name and the note.**

- Token: `~/.boneheadz-admin-token.txt` (the same one the dashboard uses).
- API: `https://bonez-api.boneheadz.workers.dev`

```sh
API=https://bonez-api.boneheadz.workers.dev
TOK=$(cat ~/.boneheadz-admin-token.txt)
```

---

## 1. Find the player

Support gives you a NAME. The grant route takes a `player_id`, so start here.
Matches an id or a friend code exactly, or a name/handle by substring, newest
seen first, 20 at most. Read-only: it changes nothing.

```sh
curl -s "$API/admin/players?q=Feisty%20Fang" -H "x-admin-token: $TOK"
```

```json
{"q":"Feisty Fang","count":1,"players":[
  {"id":"9f3c…","name":"Feisty Fang","handle":"Grim Molar",
   "friendCode":"BONE-XXXX-XXXX","level":14,"lastSeen":1755…,"appV":"423"}
]}
```

`level` and `lastSeen` are there so a near-miss is obvious. Two people can have
similar handles; nobody can share a name (it is unique, case-insensitively).
**If `count` is not 1, stop and narrow the search.** Granting to the wrong
person cannot be undone from here: this channel can only ever give.

## 2. Give her the lizard back

```sh
curl -s -X POST "$API/admin/grant" \
  -H "x-admin-token: $TOK" -H 'content-type: application/json' \
  -d '{"playerId":"9f3c…",
       "key":"makegood-feistyfang-dayone-lizard",
       "pet":"CX",
       "note":"Your Day One Lizard, back where it belongs. Sorry about that!"}'
```

```json
{"ok":true,"to":"Feisty Fang","playerId":"9f3c…",
 "granted":"pet CX","payload":{"pet":"CX"},
 "note":"Your Day One Lizard, back where it belongs. Sorry about that!",
 "inserted":true}
```

Read `to` and `granted` back before you close the terminal. That line is the
whole safety net against a mistyped id.

She gets it the next time the app pulls its grants (boot, or a foreground
return). It arrives in her Stable and her Paddock, and on her shoulder only if
her companion slot is empty: a make-good never re-dresses a player.

### The three required fields

| field | why it is required |
|---|---|
| `playerId` | targeted at ONE person. Never a code, never everybody. |
| `key` | your idempotency key. The same key twice grants ONCE (`"inserted":false` the second time). Make it descriptive, not random: `makegood-<player>-<what>`. |
| `note` | the player is told WHY the gift arrived. No silent gifts. |

## 3. What else it can hand over

Everything below is additive and capped or allowlisted. Combine them in one
call if you like; they all ride the same `key`.

| field | allowed values |
|---|---|
| `coins` | `1`–`20000` |
| `dust` | `1`–`2000` (Bone Dust) |
| `pet` | `C1` `C2` `C3` `C4` `C5` `C6` `CX` — by id, never `random` |
| `crate` | `daily` (Common) · `golden` (Bone) · `egg` (Step Egg) |
| `consumable` | `xp2` (Battle Charm) · `vigor` (Vigor Draught) |
| `egg` | `"ready"` — an egg she can crack immediately |

```sh
# a bug ate someone's crate run: 2,000 coins and a Bone Crate, one call
curl -s -X POST "$API/admin/grant" \
  -H "x-admin-token: $TOK" -H 'content-type: application/json' \
  -d '{"playerId":"…","key":"makegood-crateloss-2026-08-21",
       "coins":2000,"crate":"golden",
       "note":"A bug ate your crate. Here it is, plus a little extra."}'
```

## 4. What it will NOT do, and why

A 400 with the reason comes back for each of these. Each is one line to lift in
`GRANT_MENU` / `GRANT_REFUSED` at the top of `server/src/index.js`, the day a
real player actually loses one:

- **`gearId`** — gear is statted power, and Boneheadz is cosmetic-only (locked
  2026-08-07, never sell power). This route is not going to be the first thing
  in the game that mints power on request.
- **`xp`** — XP moves a level, and every level crossed pays its own coins and
  crates. That is a second payout the response could not honestly report, and
  the response naming what landed is what catches a mistake.
- **`rename`** — not a gift. It forces the player to change their name: the one
  payload arm that takes something.
- **`pet: "random"`** — a make-good is targeted or it is not a make-good.
- **Taking anything away.** There is no such route and there should not be. If
  something needs removing, that is a code change with its own review.

## 5. Why not a redeem code

`REDEEM_CODES` lives in `js/loot.js`, which ships inside the client bundle, so
**any code added there is readable by every player**, and `redeemed` is
per-save. A "Day One Lizard code" would hand CX to everybody and destroy the
exclusive for every player who earned it by being here at the start. The Day One
Lizard is `exclusive: true` and `pickRandomPet` keeps it out of every random
grant precisely so it stays meaningful. Handing it back **by name, to one
`player_id`**, is the only way it should ever move.

## 6. Before you touch production

```sh
cd server
npx wrangler d1 execute bonez --local --file=schema.sql
npx wrangler dev --local --port 8788 --var DEV:1 --var ADMIN_TOKEN:devtoken --var ADD_TOKEN_SECRET:devaddsecret --var RL_SECRET:devrlsecret
node admin-grant.test.mjs                # the routes, 40 rows
cd .. && node tests/admin-grant-audit.mjs # the pet actually landing, client side
```

Both files carry their prove-red lists in the header: every row has a mutation
that turns it red, and all of them were run.
