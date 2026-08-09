# Boneheadz Gym — Roadmap & Notes Tracker

**How this works:** every app note Tom sends lands here FIRST, with an investigation
finding and a status, before anything is built. This file (in the repo) is the
canonical tracker; a mirror artifact is published for phone reading. Update both
whenever notes arrive or items ship. Statuses: `BUG` confirmed defect ·
`PARTIAL` exists but broken/invisible · `FEATURE` not built · `SHIPPED` done ·
`PARKED` deliberately deferred · `DECISION` needs Tom's call.

---

## 💰 The Bone Bazaar: player gear stalls on the Crew tab (DECISION, designed 2026-08-08, awaiting Tom's call)

**Tom's ask.** "I want to brainstorm a system where players can post their own
items for sale on the crew tab. These items make two players exchange gold for
whatever the other player will pay. Once the player sells the item they lose the
stats and cosmetic. A player should only be able to sell a certain number of
things at a time. ... We can't have players selling old gear for 1g and fucking
up the economy of the game. But a long time ago I played a game called tales of
pirates where you could do something similar." Locked in the same session: gear
only in v1, no binding (floors do the work), crew-only scope.

**The honest constraint the whole design bends around: the server can only ADD
value.** Coins are device-local kv; the grants channel is strictly additive and
never sees a balance. So escrow is consignment-by-removal: listing an item
REMOVES it from inventory (the disenchant path: gearloadout slot cleared, inv
row deleted, stats gone that moment), delist/expiry grants the item back, a
sale grants coins to the seller. Every server message stays additive, and the
`gearId` grant ingest the client already ships (js/social.js:487, currently
minted by nothing) becomes the delivery mechanism. Boolean per-catalog-id gear
ownership means dupes are structurally impossible and a buyer who already owns
the piece has nothing to buy.

**The shape.**
- THE BAZAAR card on the Crew tab (between Step Race and Add-a-Friend): your
  crew's stalls browsed PER SELLER, Tales of Pirates style. Deliberately no
  price-sorted aggregate view: research finding, stall-style shops resist the
  undercutting spirals that frictionless sorted auction lists create.
- SET UP STALL on your own stall: pick gear from inventory, set a price at or
  above the floor. The piece leaves your inventory immediately (you cannot wear
  what you are selling).
- Buying: atomic conditional UPDATE on the listing row; the loser of a race
  gets `409 gone` BY NAME and refunds the locally-deducted coins. Winner gets
  the gearId grant; seller gets `price minus tax` coins as a HELD grant, so the
  Deliveries card shows a sealed coin pouch: "your stall sold the Femur Flail."
- Listings auto-expire after 7 days via lazy sweep (siege-settlement pattern);
  the item comes home as a grant.

**Economy dials (v1 defaults, each is a DECISION dial for Tom):**

| Dial | v1 | Why |
|---|---|---|
| Price floor | 3x dupe value: uncommon 75 / rare 180 / legendary 1,200 | The game already prices duplicates (crate dupe table); nothing may sell below 3x what the game itself pays. "1g gear" cannot exist. |
| Tax, burned | 15%, rounded UP | D3's gold AH used exactly 15%; FFXIV/OSRS destroy most collected tax as their inflation sink. Round-up + the 75 floor closes OSRS's under-50-coins-is-tax-free rounding hole. Coins currently pool (merchant is the only big sink), so the Bazaar is a net sink. |
| Listing slots | 2, +1 at level 20 | Matches OSRS F2P (3) and FFXIV's historical 1-2 retainers. Stalls stay curated. |
| Buy cap | 5 purchases/day | Throttles twink pipelines. Research note: OSRS sizes buy limits as per-item 4h windows, a commodity-cornering defense; flat daily cap fits a unique-item friends market better. |
| Level gate | existing gear minLevel stands | Buyable early, wearable at level. A level-3 buyer's 1,200-coin legendary does nothing until 14. |
| Expiry | 7 days | No zombie stalls. Research silent here; UX call. |

**Economy fit.** Faucets measured at ~1,000-1,300 coins/day engaged; merchant
weapons 500-6,000. A legendary at the 1,200 floor is about a day of full
engagement, and the seller permanently loses a piece only crate luck returns.
Wash trading loses 15% per hop. A modified client can already mint 5,000
coins/day/friend via gifts; the Bazaar adds no faster lever and taxes it.

**Why crew-only is also the long-term call for a monetized app.** Monetization
is locked cosmetic-only (2026-08-07): IAP cosmetics must NEVER be listable or
paid goods become gold become gear (selling power through a side door); gear-only
v1 gets that free. Diablo 3 is the canonical postmortem: ~50% of players used
the AH, the loot hunt collapsed into spreadsheet shopping, Wilson says the GOLD
house did more damage than the RMAH, and the 15% fee plus listing limits failed
to stop saturation. Lesson: tax does not protect the loop, scope and friction
do. Boneheadz's retention engine IS the acquisition loop (crates, dens,
Glutton, quests); a friends-scale stall market amplifies it socially instead of
strip-mining it. Future clean IAP synergy: stall SKINS (cosmetic, social,
power-free). Schema keeps a visibility field so a curated global board stays
possible as a separate later project.

**Exploit matrix (maps to the Rewarded-actions SOP, guards named at build):**
double-sell: impossible, item leaves inventory at list + UNIQUE open listing per
(seller, gearId) · buyer race: atomic UPDATE, named `gone` answer, local refund
· buy-what-you-own: client gate pre-charge; forced via modified client, ingest
pays dupe value (less than the floor, strictly lossy) · replay: signed body+ts,
grant keys `market-item-<listingId>` / `market-sold-<listingId>`, INSERT OR
IGNORE · list-then-wear: impossible by ordering · self-buy: server rejects own
listing; alt-hop loses 15% per hop · flooding: slots + floor now, nonrefundable
5% listing fee held in reserve · second-attempt-pays-nothing: the unit.test.js
NO-OP scanner auto-covers new `social.*Remote` payouts; add a market pin like
the spire one, proven red.

**Deliberately NOT in v1:** pets (instance model ready, breeding economy needs
its own pass), cosmetics (append-only looks make "losing the cosmetic" a new
revocation decision), weapons (the merchant is the designed coin sink; do not
undercut it), price history, offers/haggling, global visibility.

**Build notes (when Tom approves):** worktree branch; server migration replaces
the dead `trades` table (schema.sql:38) with `listings`; endpoints
`POST /market/list`, `POST /market/delist`, `GET /market/crew`,
`POST /market/buy` following the spire idempotency shapes; Bazaar card mockup
FIRST (mockups-first); crew-fan audit gains Bazaar rows; research notebook
"Boneheadz: player-market economy research" (NotebookLM) holds the sourced
brief behind the dial table.

---

## 🗺️ Leaving the Boneyard and coming back could throw (BUG, FIXED, found 2026-08-07)

**Found by** the new `tests/spire-gate.mjs` while auditing the spire fix, not by a report.
Reproducible 3/3: open the Boneyard, leave, come back, and an uncaught
`TypeError: Cannot read properties of null (reading '_getUIString')` fires.

**Cause.** `cleanup()` correctly does `map.remove()` then `map = null`, but the refresh
functions are async: they await the server for spire ownership and `queryRenderedFeatures`
for walkable snapping. A refresh started before you left resolves after, and builds a marker
for a map that no longer exists. maplibre's `Marker.addTo(null)` throws, and the stack points
into the vendor bundle naming nothing useful. Three separate `map.loaded()` call sites were
also dereferencing a nulled `map`.

**Fix.** A single guard in `domMarker()` in `js/map.js`, the choke point every Boneyard marker
routes through, returning a dead-marker stub (about six call sites immediately call
`rec.marker.setLngLat(...)` on the way out, so null would just move the crash). Plus
`map &&` on the three `map.loaded()` sites. Proven red by removing the guard.

---

## 🗼 Dark Spires: beat a tower, walk straight back in (BUG, FIXED, noted 2026-08-07)

**Tom's note.** "the spires on the map had the same problem as the glutton where once you
beat it you can just go right back in and fight again."

**Confirmed, and it was two separate defects.**

1. **No ledger at all.** `spireKey(id, day)` has existed in `js/spires.js` since Dark Spires
   shipped and was imported by NOTHING. A spire fight therefore wrote no per-day row, so
   nothing could gate a second attempt. The loop: beat a tower whose claim is then refused
   (you hold `SPIRE_CAP` already, or the tower is inside its 1h server shield) and the fight
   pays 40 coins while the button still reads "Take". Re-fight, +40, forever. Losing was
   equally free to retry, so the tower could simply be reran until you won.
2. **The energy gate never fired.** `const spent = await spendPitFight(); if (!spent)`:
   `spendPitFight()` returns `{ ok: false }` when tapped out, and an object is always truthy,
   so taking a rival's tower was free at ANY energy level. The comment directly above it
   explains this gate exists to stop two friends flipping a spire for 80 coins a pass, which
   means the mitigation had never worked a single time.

**Fix.** One attempt per tower per day, mirroring the glutton's per-slot ledger exactly:
settle writes `spireKey(id, dateKey())` as an xp row of type `spiretry` on win, loss AND draw
(outside the win/lose branches on purpose), the map snapshots those rows the way it already
snapshots `gluttonCleared`, and both the button and the click handler refuse. Defending your
own tower (breaking a siege), collecting tribute and tending are NOT gated: none of them is a
farmable fight. Plus `!spent.ok`.

**DECISION for Tom, dial if you want it looser:** one attempt per tower per day is my call,
chosen because it matches the glutton's existing rule rather than inventing a new one. The
alternatives are a cooldown in hours, or gating only the refused-claim case and leaving honest
losses retryable.

**Guards, both proven red.** `tests/gate-audit.mjs` scans for the class of mistake (truthiness
on an `{ok}` result) and fails naming the file and line; `tests/spire-gate.mjs` drives the real
map, teleports onto a real spire, and asserts the tower is attackable with no ledger row and
refuses with one, including a stale tap that re-enables the button.

## 🧢 Drop calendar: 10 featured pieces after the Puffer Pack — DECISION (planned 2026-08-02)

**Tom's ask.** Plan 10 key pieces for featured drops or weekly sale items, coolest weapons
included, no filler slots (socks/undies out). Picked by surveying every IL/IR/FW/SK/H asset
(88 props/kicks/skulls + 21 hats + 19 tops), not from the manifest names.

**Two mechanics, both already built.** The Puffer Pack shipped the whole pipeline (recolor
playbook, manifest OVERRIDES, drop section, popup, pinned banner). A **featured drop** = new
legendary colourways of a hero piece, popup + banner, every 4-6 weeks. A **weekly sale** = an
EXISTING catalog piece made direct-buy for 7 days, picked deterministically by ISO week from a
curated list (the den-refresh pattern; zero server work). Sales give the shop a weekly heartbeat
between drops.

**The 10, in the order I'd run them:**
| # | piece | mechanic | concept |
|---|---|---|---|
| 1 | Katana (IL7, 3 finishes exist) | featured drop | "Boneyard Steel": new blade colourways; the coolest weapon in the library |
| 2 | Kitsune mask (H11, 3 exist) | featured drop | "Kitsune Night": gold/jade masks; Tom literally wears one already |
| 3 | Chunky kicks (FW7, 6 exist) | weekly sale + 2 new | "Grail Kicks": rotate the 6, drop a triple-black and an all-bone legendary |
| 4 | Magma skull (SK10) | featured drop | "Cold Flame": blue/green fire recolors; skull = face = maximum flex |
| 5 | Storm skull (SK13) | featured drop | red/acid lightning variants; pairs with 4 as "Elements" season |
| 6 | Chrome skull (SK7/8) | weekly sale | "Chrome Death" spotlight; maybe one gold "Midas" variant later |
| 7 | Ball & chain (IR1) | featured drop | "The Wrecking Crew": gold/slime/rose flails, angry ball stays angry |
| 8 | Foam finger (IL4, 3 exist) | weekly sale | cheap fun tier; keeps sales from feeling like a money grab |
| 9 | Fishing rod (IR4) | weekly sale bundle | "Gone Fishin'": rod + a Blowfish hat cross-sell; extends the Puffer joke |
| 10 | Pocket pet (IR2, tamagotchi) | weekly sale | retro bait; pairs with the pet system thematically |

**Pricing bands (per Puffer Pack precedent):** hero-slot legendary colourways (skulls, katana)
3,000 · secondary slots (masks, flails, kicks) 1,500-2,000 · fun tier (foam finger, balloons)
600-900. Weekly sale = the piece's band, no fake discounts.

**Rules that carry over:** all colourways palette-anchored to Cam's library with provenance
receipts; masters into the library as new files only; manifest rebuilt through OVERRIDES with the
additive diff proven clean; popup budget stays one active drop at a time.

**Waiting on Tom:** approve/edit the 10 · which one is drop #2 (katana is my pick) · whether
weekly sales start now or after drop #2.

---

## 🗼 Dark Spires — territory you claim and tend — DECISION (designed 2026-08-02, awaiting Tom's call)

**Tom's ask.** A Pokemon-Go-gym-like system: claim a tower ("dark spire") in your town as your
Bonehead, protect it, and have a reason to walk to it.

**The honest constraint the whole design bends around: player density.** Pokemon Go gyms work
because millions of players contest them. This game has ~92 accounts, few sharing a neighborhood.
A system whose fun DEPENDS on rivals showing up reads as dead content for almost everyone. So the
design must be fully alive for one player alone in their town, and get better with rivals rather
than requiring them.

**The shape.**
- Spires are **permanent named landmarks**, sparser than dens (~1 per 2.2 km cell vs dens' 1.1 km)
  so each feels like a monument. Position + name seeded by cell, same `mulberry32(hashStr(...))`
  machinery as dens: The Crooked Fang, Marrowspike Rise, The Widow's Belfry.
- Walk within 60 m to challenge. An unclaimed spire is held by an NPC **Wraith Warden** scaled to
  your level. Win and your Bonehead becomes the guardian: your real build, gear, talents and pet,
  frozen as a snapshot, VISIBLY standing on the map with your name. (The v136 friend-battle
  faithful-AI-clone builder is exactly this; the profile snapshot is already on the server.)

**The solo loop — what makes a player walk there with zero rivals:**
1. **Tribute.** A held spire accrues coins + Bone Dust daily, capped at ~3 days, collectible only
   in person. Uncollected tribute is the standing reason to walk.
2. **Tending.** Guardian resolve decays over ~7 days; any visit restores it. Lapse and the spire
   goes **dormant** (neutral NPC retakes it). Nothing is destroyed, per the shame-free rule: decay
   pauses income, it never punishes. A weekly walking circuit emerges on its own.
3. **Keeper's Boon.** Holding ≥1 spire grants a small always-on perk (proposal: +10% quest coins).
   Gentle loss aversion: the buff is why losing a spire stings even solo.
4. **Sieges (rare).** At most one push/week: a named NPC (graverise flavor) besieges one of your
   spires; 48 h to walk there and break it or it goes dormant. Defense becomes a story with no
   humans nearby. This is the ONLY new notification type, respecting the reduced-frequency rule.
5. **Warden prestige.** Days-held streak, spire level (grows per tend/defense), and a Warden
   cosmetic line that can ONLY be earned by holding spires.

**The rivalry layer — lights up with even ONE other player in town (Brock, Cam):**
- Take a rival's spire by beating their AI clone **in person**; your snapshot replaces theirs.
- The fallen owner gets the notification and the **revenge walk**, the strongest motivator here.
- Absent defense pays: your guardian repels an attacker → you receive a grant (+coins).
- Cap of **3 held spires** (forces geographic choice, leaves towers for others); **1 h shield**
  after a takeover so two friends at one corner can't ping-pong farm it.

**Economy fit.** Attacking costs a fight charge (Pit energy), consistent with every other fight;
tending and collecting are free. Walks already pay steps → Vigor; spires add *direction*, not grind.

**Tech reality (why this is cheaper than it sounds).** Placement/naming = den cell-seeding verbatim.
Defenders = existing profile snapshots + v136 clone builder. State = one new D1 `spires` table
(id, owner, defender snapshot, claimed_at, resolve_until, tribute_from, level, siege) + 3-4 signed
routes; rewards ride the existing grants system. Fights resolve client-side like every other award
(friends-scale trust, stated plainly). Offline players see spires shrouded; claiming needs online.

**Phases.**
1. **The Lone Warden** — spires on the Boneyard map, NPC guardian, claim, tribute, tend, boon.
   Fully fun at n=1. Server: table + routes.
2. **Rivals** — player guardians, takeovers, notifications, revenge, shield, cap.
3. **Legend** — sieges, spire levels, Warden cosmetics, leaderboard column.

**Art: DECIDED 2026-08-02. Spires use `assets/brand/tomb.png`** (Tom's call). It is the bat-gargoyle
gate that was the retired Yard slot's "Tomb Gate" and is otherwise **unused**, so a Spire costs zero
new art and cannot be confused with a den (dens use `tombstone.png`, a different silhouette). Proven
on the real Boneyard map with the real marker plumbing: three states read clearly at map scale and
against the Glutton blight.
- **Unclaimed** `grayscale(.85) brightness(.62)` — cold, dead, obviously free to take.
- **Yours** `hue-rotate(62deg) saturate(1.5)` + accent glow + a `YOURS` pennant + tribute counter.
- **Rival's** `hue-rotate(-38deg) saturate(1.7)` + coral glow + their name on the pennant.
- Marker root carries position ONLY; every filter/animation sits on an inner `.spire-fx`, or
  MapLibre's positioning transform gets clobbered (the lesson already written into `.map-den-mark`).
- Bigger than a den on purpose (58x74 vs 46x52) so a Spire reads as a landmark, not another pickup.
- Later polish, not needed to ship: the owner's Bonehead head on the gate, and a lit doorway.

**Decisions for Tom:** name stays "Dark Spire"? · Keeper's Boon perk (+10% quest coins vs +1 Vigor
cap vs a daily dust trickle)? · cap at 3? · siege cadence (weekly max feels right)? · Phase 1 go?

---

## 🔑 Account recovery (ironclad) — ✅ SHIPPED v230 + v231 (2026-07-28)

**Status.** Layer 1 shipped in v230. **v231 finished it** and the measured facts below correct several assumptions in the original plan:

- **Restore no longer needs the friend code.** A user-chosen **Recovery ID** (`^[a-z0-9._-]{4,32}$`, unique index on `recovery.recovery_id`) is the lookup handle; friend-code restore still works for anyone who wrote theirs down. Nobody has their friend code after wiping the phone that displayed it, which made the v230 phrase useless on its own.
- **Phrase bar raised because the ID is guessable**: `RECOVERY_MIN_LEN` 8 → **12**, must contain a space or digit, `RECOVERY_ITERS` 600k → **1M**. Existing phrases are grandfathered (`iters` is stored per row).
- **`/recovery/available/:id` has its OWN rate-limit bucket** (`rl_ridcheck`, 60/10min) separate from the ciphertext lookups (`rl_recovery`, 10/10min). They shared one at first, so typing a few candidate IDs during setup could lock a player out of their own restore.
- **Android vault shipped**: `native/android/.../BhVault.kt` on Play Services Block Store, same JS surface as the iOS keychain plugin.
- **Measured on an emulator, not assumed**: Block Store is **deleted on uninstall** unless Google Backup is on (`Blockstore: Removed Blockstore data for com.boneheadz.gym upon uninstallation`). Separately, `android:allowBackup="true"` DOES restore the entire WebView IndexedDB on reinstall, which is more than the iOS keychain does. Settings now reports which of these is actually true per phone instead of promising a reinstall will work.
- **The bug that actually caused the loss**: both vaults reported a failed READ as "empty", and the boot path is `get → empty → mint → overwrite`. One transient read error minted a new account and destroyed the good key on the next line. Fixed on both platforms: empty and unreadable are now distinct, `ensureIdentity` retries before concluding "new player", and `mirrorIdentity` is compare-and-set that refuses to overwrite a different account (offering it to the player instead).
- **Erase ALL data** now clears the vault; it did not, so the next boot restored the account you had just deleted.
- Tests: `node tests/unit.test.js` (89, incl. a guard that the client and Worker recovery-ID regexes match), `node server/recovery.test.mjs` (13, against `wrangler dev`), plus a destructive rehearsal run against **production**: register → back up → wipe → restore with ID + phrase alone → coins and save marker returned.

**Why this was P0.** Tom deleted the app to troubleshoot a bug. His level 27 account (Wretched Goblin, 14 badges, 47 gear) is unrecoverable: the cloud backup blob is intact on the server (129,444 bytes, saved locally to `~/Documents/boneheadz-recovery/`) but the AES key lived only in the iOS keychain, and it went with the app. `BhVault.swift` and the memory note both asserted keychain items survive app deletion. **They did not.** Second data loss of the same class (see [[lessons_native_install_wipes_container]]).

**Blast radius today: 8 encrypted backups on the server**, incl. a 164KB level 27 (Cam). Every one is one app-deletion away from the same loss, while Settings promises "end-to-end encrypted, only your phone can read it".

### Layer 1 — recovery phrase (web + Worker, reaches everyone immediately)
- **User-CHOSEN phrase** (Tom's call, overriding auto-generated: "people will forget to save the ones you auto generate").
- Set: `KEK = PBKDF2-SHA256(phrase, salt=random16, 600k iters)` → AES-GCM wrap the identity bundle (privJwk + aesJwk) → `POST /recovery` with `{wrapped, salt}`. Server stores ciphertext only, never sees the phrase or the keys, so it stays E2E.
- Restore: fresh device → "I already have an account" → enter **friend code + phrase** → `GET /recovery/:friendCode` returns `{wrapped, salt}` → derive → unwrap → identity restored → existing `pullBackup()` decrypts the save. No change to how saves are encrypted, so **all 8 existing accounts are covered the moment they set a phrase**.
- Schema: additive `recovery_blob`, `recovery_salt`, `recovery_set_at` on `players`.
- **Tradeoffs to state plainly, not bury:** a user-chosen phrase is weaker than a generated key. Mitigate with a minimum length, a common-password blocklist, PBKDF2 600k, and per-account salt. Lookup by friend code means anyone holding a friend code could fetch the ciphertext and attempt an offline attack, so the endpoint needs hard rate limiting. Threat model is a fitness game, and the alternative is losing accounts permanently, so this is the right trade.

### Layer 2 — iCloud Keychain sync (native, build 14, background priority)
- `kSecAttrSynchronizable = true` in `BhVault`. The key then rides iCloud Keychain, survives app deletion and moves to a new phone with no user action. **This alone would have saved Tom's account.**
- Migration gotcha: a synchronizable query does NOT match existing non-synchronizable items. Must read the old item, write a synchronizable copy, and keep both.

### Layer 3 — stop the foot-guns (web)
- **ONE art piece, not two** (Tom, 2026-07-27). The memorial card IS the What's New entry: it lives in the changelog list, later releases stack above it, and it stays viewable forever. No separate one-time full-screen warning carrying the same art.
- Boot prompt when online with no recovery phrase set: **plain and functional**, a short "set your recovery code" form. No hero art, no memorial framing, that story is told once in What's New. Recurring, dismissible per session, silent once set.
- Settings shows a warning state until a phrase exists; the backup card stops claiming safety it cannot deliver.
- Remove the unconditional `mirrorIdentity(id)` on every `ensureIdentity()` read. It is what overwrote Tom's keychain slot seconds after the fresh install minted a new identity, destroying any chance the old key had survived.
- Nag when the last local export goes stale.

### Patch note (Tom's copy, approved art)
`💀 Claude destroyed my account 💀` with a hero render of Wretched Goblin's real loadout, recovered from the **unencrypted** `players.profile` snapshot (the Crew-tab copy) before anything is deleted. Art committed at `assets/bh/memorial/wretched-goblin.png` (663x840, transparent). Needs a new optional `hero` field on changelog entries. Copy: this happened, it will not happen to you, set a recovery code, Tom restarts from scratch as Wretched Goblin.

### Sequence
1. Layer 1 + Layer 3 + patch note (web + Worker) → verify → **ask Tom before pushing**.
2. Delete the dead Wretched Goblin player + backup rows only after Tom confirms (local copy retained regardless).
3. Layer 2 in build 14.

---

## 🧥 Saved fits + the Looks collection — 2026-07-26 — ✅ SHIPPED v222

The two halves of WoW's system that v221 deliberately left out. Mock served its purpose and was removed; the real thing is in the app.

**Catalogue:** 257 collectible pieces across 15 slots. Hat 21, Skull 31, Body 31, Background 22, Left hand 20, Kicks 19, Top 19, Right hand 17, Grillz 15, Pants 13, Eyes 13, Socks 12, Mouth 11, Undies 7, Pet 6. Every slot has exactly 1 legendary except Left hand (2) and Pet (2).

### A. Saved fits
- kv `outfits: [{id, name, look:{slot: artId|'__hide'}, ts}]`, cap 6.
- Saves the **look only, never stats**. You re-gear constantly for stats; the look should survive that.
- Applying: gear slots set transmog, non-gear slots equip the cosmetic. A gear slot with nothing equipped keeps its transmog dormant (v221 rule 2) and it wakes when you gear up.
- **Re-wearing is free.** New `paidLooks` set of `slot:artId`; `applyTransmog` charges only the first time you wear a given look in a given slot. Makes fit-swapping free by construction, and fixes the v221 trap where flip-flopping between two looks charged you every single time. An outfit containing one unpaid look charges only that one, and the button says the amount.
- UI: horizontally scrolling chip rail at the top of the Wardrobe. Tap to wear, long-press to rename/delete, "+ Save this fit" captures the current look. **No art thumbnail**: the source PNGs are full-body canvases with heavy transparent padding, so at 26px they rendered as empty squares. Replaced with a rarity pip off the fit's headline piece, which reads at any size.

### B. The Looks collection
- Entry: a **full-width 5th card** under the four tab cards, showing "34 / 257 collected" and a progress bar. Full width because a 2x2 grid has no natural 5th cell, and it gives the collection a real front door.
- Inside: one section per slot, header reads `HAT · 6 of 21 · 1 legendary still out there`.
- Collected tile: real art, rarity border, tick if currently worn. Tap for name + rarity + "Wear this look", which deep-links to that Wardrobe slot (functional, not just a trophy case).
- **Locked tile: identical for every piece.** No art, no outline, no rarity, no name, just a `?`. Tom's call: the unlock stays a surprise. Tap gives a spoiler-free nudge ("Still out there. Crates, dens and the Glutton all drop new looks.").
- The per-slot counts are the hook and they spoil nothing: you learn a legendary hat exists, not what it looks like. Recommendation is to keep rarity OUT of locked tiles and only in the header tally.

**Risk:** low, all additive kv. The one behaviour change is `paidLooks` making repeat transmogs free, which shrinks the dust sink to "first time per look per slot". Across 257 looks that is still a deep sink.

---

## 👗 Transmog — wear the stats, keep the look — 2026-07-26 — ✅ SHIPPED v221

Pay to move a gear piece's **look** onto whatever cosmetic you actually want, keeping its stats. Modelled on WoW's transmogrification.

**Investigation finding: the game currently punishes taste.** Look and stats are welded together in two places.
- `equipGear` (js/loot.js:799) writes **both** `gearloadout[slot]` and `equipped[slot] = g.artId`. Wearing the stats forces you to wear the art.
- `equip` (js/loot.js:788) does the reverse: *"choosing a plain look drops the statted piece from that slot."* Pick the hat you like, lose the +6 POW.
- An unused `keepGear` flag already exists on `equip()`. It is the seed of this feature.
- Melting gear for dust currently destroys the look **permanently**. An appearance collection makes melting pure upside and unclogs the dust economy.

**What we take from WoW:** (1) you collect *appearances*, not items, and the unlock is permanent even after you destroy the item; (2) slot-for-slot, and only what you could actually equip; (3) a modest currency fee per piece, deliberately cheap; (4) fully reversible, stats never change; (5) **hide slot** (helm/cloak) is the most-loved single part; (6) ensembles = saved outfits.

**Decisions locked with Tom (2026-07-26):**
- **Cost: Bone Dust, scaled by the look's rarity.** Legendary 60 · rare 25 · uncommon 12 · common 6. Reverting to your true look is free. Chosen over coins because coins already sink into the Bone Merchant's thousand-coin weapons, while dust pools up (only sinks are eggs 60 / crates 40).
- **UI home: inline in the wardrobe.** A "Change look" button on the existing gear inspect panel opens the appearance grid for that slot. No new art, no new screen. Promote to a proper Bone Tailor screen later if the Appearances browser gets built.

**Design:**
- **Collection**: append-only kv `looks`, written on every gear/cosmetic grant. On read, union with everything currently owned so existing players are grandfathered on first load. No migration, nobody loses anything. (Additive-DB rule.)
- **Applied state**: kv `transmog: { [slot]: artId }`, `'__hide'` to hide a slot.
- **One choke point**: `equipped()` resolves transmog by default, `{ raw: true }` returns the truth for the wardrobe. That single change carries the mogged look into the Pit, home hero, map marker, level-up card and friends' Crew tab, because they all already call `equipped()`.
- **Rules**: same slot only, collected looks only. No level gate (looks are cosmetic). Legendary look on uncommon stats is allowed, same as WoW.
- **Melt copy**: "The look is yours forever. Melting only takes the stats."
- **Balance surface: zero.** Stats are untouched by definition.

**Deferred to a second release:** saved outfits/ensembles; a full Appearances browser with locked silhouettes (strong retention hook, art already exists); transmog for pets and backgrounds.

---

## 🫠 The Glutton — first big feature highlight — 2026-07-23 — 🎨 FEATURE (art-blocked)

A map-wide world event. The Glutton (a slime/blob abomination, Brock's lore) **feasts on part of the Boneyard, creating a blight** that suppresses all spawns in its area until a player hunts it down and beats it. Intended as our **first "big feature" launch** with a proper announcement popup. **Launch gated on Cam's real art** — everything below is designed + mocked on placeholder art, ready to build once art lands.

**Mocks (placeholder art, approved direction):**
- Announcement popup → artifact `437a041e-f0c5-4f84-b0c4-cbd84471038b` (source `scratchpad/glutton.src.html`). Direction locked after v2 rework: **near-monochrome + one muted sickly-green accent**, spooky not poppy, title in bone-white **Bangers** (colour was reading junior), lore panel, single outlined CTA. Restraint-first per taste contract.
- Blight-on-map → artifact `f8c7dbda-9ba7-4f1d-96a4-f9dd7e2553f1` (source `scratchpad/blightmap.src.html`). Locked visual behaviour:
  - **Dead zone**: inside the rot the map darkens + desaturates, mottled/uneven (SVG fractal-noise + speckle, no repeating tile), streets tinted sickly green, no new spawns.
  - **Feathered creeping edge**: organic slime border (turbulence-displaced + blurred, never a clean circle), oozing tendrils; grows outward the longer it's ignored.
  - **Fill drifts like fog in a light wind** (two noise layers, 17s/23s loops + 26s turbulence churn; edge stays anchored). Verified drifting via 2-frame diff.
  - **Glutton at the heart**: pulsing sickly den marker, tap in to fight.
  - **Cleanse on defeat**: colour floods back, spawns return, its hoard spills across the freed ground.

**Lore (Brock, use verbatim in the announcement):**
> Beware the Glutton. With a comparable appetite to a chocolate lab and the expansion rate of spray foam insulation, the Glutton is no mere dungeon monster. It seeks out and devours every goodie and gold piece its blobby body can slime up to. Face this abomination and you may become its next snack, or make off with its entire jellified hoard. Best of luck, my bony buddy.
> "Plan for what is difficult while it is easy, do what is great while it is small." - Sun Tzu... probably

**Open gameplay DECISIONs (need Tom's call before build):**
1. **Spawn + growth cadence** — timer/level-triggered? Slow menace (grows over hours, ignorable a while) vs urgent (grows fast, forces action)?
2. **Can it block core play?** — allowed to creep over a den / the Pit entrance and lock it until cleared (more threatening), or open-ground only (never blocks)?
3. **One at a time, or multiple** blights concurrently?
4. **Reward** — generic big coin+crate burst, or a signature **Glutton-only cosmetic/pet**?

**Build notes (when unblocked):** announcement popup reuses the What's-New sheet pattern, one-time gated. Blight = a GeoJSON region + map style overlay in `js/map.js`/`poi.js`; the Glutton is a special den (`poi.js`) with its own fight mode + cleanse-on-win → restore spawns + hoard payout. Additive state only (new ledger keys).

---

## 🥁 Easter-egg bosses — 2026-07-21 — ✅ Tum Tum Wabaloo SHIPPED v178

Tom's ask: hidden bosses friends can FIND. Chosen mechanic: secret map dens (hybrid of Tom's "hidden map spot, scattered because Brock's in Ontario").

- **7 buried spots**, no UI hint anywhere: Gastown Steam Clock + Science World (Vancouver), Lonsdale Quay (North Van), Walton St + waterfront (Port Hope ON = Brock), Place Jacques-Cartier (Montréal), downtown Phoenix AZ (the two new testers' cities from analytics geo).
- **Discovery gradient** (`poi.js SECRET_DENS/secretsNear`): cryptic toast within 400m ("You hear a distant TUM... TUM... 🥁"), den materializes at 75m (spectral red tombstone, lit eyes, rise animation), enterable at 45m via a dedicated #mapSecret button. Nothing renders beyond 75m — spreads by rumor.
- **Fight**: mode:'secret', 1.15x player stats, aiLevel 3, melee kit; venue "The Burial Mound".
- **Reward**: first win at ANY spot = 150 XP + 400 coins + golden crate + hidden badge **Wabaloo Whisperer** (ledger `secret-tumtum`, idempotent). Badge renders as a **??? tile** until earned (the only in-app breadcrumb). Rematches 25c. Analytics `secret_boss_win`.
- Patch notes: cryptic teaser only ("faint drumming from beneath the ground").
- **Verified on live v178** (GPS stubbed to the Steam Clock): whisper/reveal radii, marker materializes, AWAITS button, fight opens at Burial Mound (screenshot), award idempotent, badge flips ??? → earned. Real-world walk-up = Tom's phone whenever he's in Gastown.
- Extending later = one new entry in SECRET_DENS + a badge row (data-only).

---

## 📥 Easy-wins batch + Leaderboard — 2026-07-21 — ✅ SHIPPED v174

Data-driven batch (Tom approved): telemetry showed new players open + browse but never fight; feedback tools undiscovered (0 nominations); "who actually plays?" needed hand SQL.

| Item | Ship |
|---|---|
| All-players **Leaderboard** (Tom's ask) | Signed `GET /leaderboard` (level-ranked, top 100, includes friend codes deliberately while community is small); Crew-tab card → sheet with rank/level/badges + one-tap **+Add** on every row (auto-accepts if they'd requested you). Verified: SQL output on D1, 401 unsigned, sheet renders + degrades gracefully; happy-path add needs Tom's phone. |
| First-fight nudge | `computeHomeUnlocks` fires "Ready for your first fight?" (priority 6, deep-links to The Pit) when career fight wins = 0. Verified live on a fresh profile. |
| "Played" column | `/stats` testers now carry real-gameplay counts (food_log/pit_win/boss/mini/cook/hatch/quest/friend_battle/buy_weapon/transmute); dashboard + artifact show "⚔ N played" vs "browsed only". Verified: 128-event device = 84 played, Spectral Basher = 0. |
| Map press-and-hold hint | One-time toast on Boneyard open (kv `mapLpHint`). |
| **Phantom-player hygiene** | Discovered every fresh `?demo`/webdriver boot auto-registered a NEW level-8 phantom player (analytics was gated in v166, social wasn't). Root-fixed (bootSync/autoSync gated by `NOSOCIAL`); purged 20 phantom rows + their backups from D1 (backed up to session scratchpad first). 15 real players remain. CORRECTION: "Spectral Basher" was one of these phantoms (a Claude verification session), not a real tester. |

---

## 📥 Notes — 2026-07-20 part 2 (4 notes) — ✅ ALL SHIPPED v161

| # | Note | Root cause | Fix |
|---|---|---|---|
| 1 | What's New should go 30 patches back | Changelog had 17 curated entries (back to v124) | Expanded to **32 entries** back to v71 (Bone Merchant), all player-facing plain language; added v159 roaming dens + v144 transmute + 13 older milestones (social, cloud backup, shiny pets, Alchemist, combat rework, etc.). No render cap. |
| 2 | STILL nudged to buy a weapon weaker than my current one | `computeHomeUnlocks` suggested an upgrade in ANY archetype that out-tiered your (often empty) kit in THAT style. Maining a caster → nudged toward a melee/support piece = reads as "weaker." | Now only ever suggests a weapon in the **archetype you currently WIELD** (`fighter.loadout`), and only if it **strictly out-tiers** your equipped weapon. Starter (no real weapon) still gets a first-weapon nudge. |
| 3 | Ladder shouldn't stay open once completed; new fights should be at the top | Pit sections were fixed-order with the Ladder always `open`. | Sections now reorder: once you've **beaten the Champion**, the live **Endless/Gauntlet** fight floats to the top and opens; the finished Ladder + Champion collapse below (with ✓ + rung x/N summaries). Beaten rungs read "Rematch." |
| 4a | Pink gravestone stuck in the top-left corner | Roaming den's `roamDrift` CSS animation set `transform` on the **marker ROOT**, overriding MapLibre's positioning transform → stranded at (0,0). Same latent bug on `.awaken` shudder + all in-range `blipready` scale pulses (dens/minis/spawns). | Den visuals + transform animations moved to an inner **`.den-fx`** wrapper; in-range emphasis switched from transform-scale to a **filter glow** (`mapMarkGlow`) that never touches position. Applied to den/mini/spawn. |
| 4b | Too easy to accidentally open the report sheet + then trapped (only Send or force-quit) | v160 long-press was 550ms/14px and the sheet had no Cancel. | Long-press now **750ms + 8px** (a deliberate stationary hold); report sheet gained a clear **Cancel** button (plus the existing tap-outside/back dismissal). |

Verify: JS syntax clean; changelog 32 entries render (no slice); Pit reorder + weapon-nudge logic are pure render (verified live after ship). Map marker fix reasoned from root cause; live-map/GPS leg needs on-device confirmation.

---

## 📥 Note — 2026-07-20 part 3 · POI placement (loot in ocean / private property) — ✅ SHIPPED v163

Trigger: Tom's own long-press reports (v160 feature working) surfaced 4 real bad placements in Vancouver — a bone pile "in the ocean", a rare pile + a mini-boss (Cinder Shade) + a den (The Boneyard Gate) all on "private property". Also v162 SHIPPED: fixed the press-and-hold report stacking multiple dialogues (single-pointer guard + one-sheet lock).

Root cause (`js/geo.js snapToWalkable` + `js/app.js` refreshSpawns/refreshDens/refreshMinis):
- **Dens + minis never snap** — only spawns run through `snapToWalkable`. So dens/minis land wherever the cell seed drops them (backyards, etc.).
- **Snapper fails open** — if no walkable feature (road/path/park) is within ~40m, it returns null and the caller renders the POI at its RAW seed point. It never tests for water, so a coastal point with no nearby road stays in the ocean.

Proposed fix (v163, needs on-device GPS/coastline verify):
1. Run dens + minis through the SAME `queryRenderedFeatures` + `snapToWalkable` path spawns already use.
2. Make snapping robust: widen the query box + maxMeters fallback; if STILL nothing walkable (truly remote / open water), **suppress** that POI for the session rather than dropping it at the raw point.
3. Explicit water reject: if the raw/snapped point is inside a water polygon (natural=water / water layer via queryRenderedFeatures), force relocate-or-suppress.
4. Private property is only best-effort: snapping to public roads/paths/parks inherently avoids most private lots; we can't perfectly detect "private" from OSM tags. Acceptable + the report tool remains the safety net.

---

## 📥 Note — 2026-07-24 · Hybrid boss dens (fixed landmarks + roaming) — PLAN, awaiting approval

Tom: dens currently never move (permanent spots, weekly boss rotation — working as designed). He wants a HYBRID: keep some permanent **landmark** dens (and let players photograph a cool real local spot to nominate it to devs, so dens feel personal) PLUS **roaming** boss dens that appear/refresh around the map to keep it fresh.

- **Phase 1 — Roaming dens: ✅ SHIPPED v159.** 2nd den class in `poi.js`, day-seeded (`roam:<date>:<cell>`), ~40% of nearby cells host a boss that relocates + refreshes daily, beatable once/day (`roamboss-<day>-<id>`, separate ledger type so it doesn't inflate the endless-Pit gate). Rewards deliberately LIGHT (mostly coins/XP, occasional crate, no gear-choice/Ectoplasm) to keep the faucet in check; landmark dens keep weekly golden + gear + escalation. Distinct blue drifting marker. Reuses the whole boss fight path. Logic verified (deterministic, relocates day-to-day, correct keys); live map-fight leg needs on-device test.
- **Phase 1.5 — Text-only long-press map feedback: ✅ SHIPPED v160.** Press-and-hold anywhere on the Boneyard map → if over a marker (den/mini/spawn), a **"report unreachable"** sheet (private property, locked gate); if over empty ground, a **"nominate a den here"** sheet with a required "why" note. Both `sendReport()` (analytics.js) → new unsigned, capped `/report` Worker endpoint → new D1 `reports` table (device, label, kind, lat/lng, target, note, coarse edge geo, ts) → **Community map reports** section in the admin dashboard (newest first, note escaped, Google-Maps coord link, den/unreachable tag). No photos, no account, no public UGC — private dev channel only, so it dodges Phase 2's moderation weight. iOS long-press callout/selection suppressed in CSS so the gesture reaches our handler. Backend verified end-to-end (both kinds POST → land in D1 with geo → render in dashboard, XSS-escaped; bad body → 400). Client long-press gesture needs on-device touch test.
- **Phase 2 — Community landmark nominations WITH PHOTOS (needs decisions first):** camera/photo + note + current location → upload to your server → you review in the dashboard → approved spots become curated permanent landmark dens near them. FLAGS: (a) **UGC photos** = Apple/Google review + moderation obligations (you gate every one before it goes live, which helps); (b) **storage** (Cloudflare R2 vs base64-in-D1); (c) **privacy** (uploading a user photo + precise location — needs policy update + data-safety); (d) global-vs-local (does an approved landmark show for everyone near it, or just the nominator's town?). Bigger build; plan/approve separately. (Phase 1.5 already delivers the text version of this without the photo weight.)

Recommendation: Phases 1 + 1.5 shipped; treat Phase 2 (photos) as its own planned feature given the UGC/storage/moderation weight.

| # | Note | Finding | Proposed status |
|---|------|---------|--------|
| R1 | Recommended to buy a wand weaker than my current weapon; also the Bone Merchant is too hard to find | TWO issues. (a) BUG in my own v146 unlock nudge: `computeHomeUnlocks` suggests the CHEAPEST affordable unowned weapon regardless of whether it upgrades your loadout, so it pushed the 700-coin Wand while you run a tier-3 caster. Fix: only nudge a weapon that's a genuine upgrade over your equipped weapon (higher tier, relevant archetype), else drop the signal. (b) Merchant is buried in Pit → Build → scroll. Fix: a direct Merchant entry (Build sub-tab or hero shortcut) + the "suits you" list shouldn't headline weapons weaker than what you own. | BUG + FEATURE |
| R2 | Patch notes should pop up on first open after an update, easily dismissible, and clearly findable afterward (currently buried in Settings) | v148 put What's New in Settings + Crew with an unseen count, but no auto-popup. | SHIPPED v151 — maybeShowWhatsNew() auto-opens the (dismissible) What's New sheet once on the first boot with unseen entries; never stacks over onboarding/wheel/any open sheet (retries next launch); opening marks changelogSeen=latest so it won't re-fire until the next patch. New players seeded caught-up at onboarding (no historical backlog). Settings + Crew entry points kept. Gate logic node-verified (returning@v148 → fires; caught-up → silent). Live runtime check blocked only by the preview's no-SW disk cache; works on-device via the versioned SW precache. |
| R3 | Trends tab is prime real estate but I never use it; repurpose it | Tom's call: **Shop tab**, open to housing future microtransactions. | SHIPPED v150 — Trends slot → **Shop** tab. renderShop consolidates the Bone Merchant (weapons, moved out of buried Build), coin shop + Bone Dust shop (moved out of Backpack), a Forage route, and a **Bone Vault** placeholder for future real-money packs (no billing yet; earned-only, no pay-to-win). Also fully fixes R1's "merchant too hard to find." Build + Backpack now point to the Shop. Verified live. |
| R4 | What currency buys the final weapon? Not shown top-right with the others | It's **Bone Dust**. It IS in the top-right HUD (◆ icon), but the prestige-weapon price I shipped uses a 🦴 bone emoji, so the two don't match and it reads as a mystery currency. Fix: one consistent Bone Dust icon + label everywhere (HUD, prices, shop) + tap-to-explain. | BUG (quick, my v145 inconsistency) |
| R5 | Cooked food shouldn't force immediate use; want a pantry stockpile | `collectDish` used to activate the buff instantly. | SHIPPED v152 — collected dishes now bank in a **Pantry** (kv 'pantry'); a Pantry section in the Kitchen lets you **Eat** one on demand (activates the buff) or discard it, so you save dishes for the fight/day you want. Potions still go to the satchel. Additive + data-safe (kv exported wholesale → survives reinstall). Core flow verified live against IndexedDB (bank → eat → activates + leaves pantry; discard removes the right one). |
| R6 | List current ingredients for Cam: which to illustrate + alternates/future | 7 today (6 common: Marrow, Graveroot, Ember Pepper, Bog Mushroom, Sinew, Grave Salt; 1 rare: Ectoplasm), on placeholder game-icons/emoji. Built a reference sheet artifact for Cam this session. | DELIVERABLE (done) |
| R7 | Streak Freeze feels underused + too abundant; keep it but reduce; what else in that vein? | Freeze was 50% of consumable drops. | SHIPPED v153 — crate consumable roll reweighted to ~20% Freeze; new **Vigor Draught** (⚡) consumable banks +3 Pit energy on demand (buyable in the coin shop, usable from Backpack). Verified live (drink → +3 energy). More consumables can follow the same pattern (Lucky Bone / Forager's Charm ideas parked). |
| R8 | Progress tab purpose unclear; maybe merge with Trends | Consolidate into one. | SHIPPED v150 — Trends merged into **Progress**: the old Trends screen (which already carried the level recap + badges) is now the Progress screen, reached by tapping the level/streak chip + quest-progress (routed #/progress). Charts + badges + level in one place, off the main nav. Verified live. |
| R9 | More enticing quests | Rewards were almost all coins. | SHIPPED v153 — claimQuest now also grants **Bone Dust, ingredients, or a consumable** (item), sprinkled across the pools (protein → dust, pit-run → Vigor Draught, cook → Grave Salt, boss → dust, scavenger → rare Ectoplasm, monthly boss → 150 dust). Quest cards show the new reward icons. Verified live (dust/item/ingredient all granted on claim). |
| R10 | Biggest competitors? Features they have that we're missing? | Research — answered in chat 2026-07-20. Trackers: MyFitnessPal (biggest DB, AI photo/voice logging), MacroFactor (adaptive target coaching), Cronometer (micronutrients), Lose It!/Yazio/Lifesum. Gamified: NutriBalance (streaks/XP/leagues/missions/badges), Habitica + Finch (RPG/pet habit apps = our spiritual peers). Gaps worth considering: AI photo logging, adaptive targets, a leaderboard/league, micronutrients. Our moat (deep RPG: pets/gear/combat/breeding) is unmatched by mainstream trackers. | RESEARCH (logged) |

**Build order:** ✅ **Batch A SHIPPED v149** (R1 + R4). ✅ **R3+R8 SHIPPED v150** (Shop tab + Trends→Progress merge; also finishes R1's merchant-findability). ✅ **Batch B SHIPPED v151** (R2 patch-notes auto-popup). ✅ **Batch C SHIPPED v152** (R5 cooking Pantry). ✅ **Batch D SHIPPED v153** (R7 consumables + R9 quests). **🎉 Round-3 notes R1–R10 all complete.** R6/R10 delivered as research/deliverables.

- **R1 — SHIPPED v149:** home unlock nudge now only suggests genuine upgrades (vendor tier ≥ 3 that out-tiers your best weapon in that archetype); never entry weapons. Functionally verified: tier-3 caster + rich → suggests tier-4, not the wand; starter + 800c → no nudge. (Merchant discoverability itself still open — folds into the R3 tab decision.)
- **R4 — SHIPPED v149:** every Bone Dust glyph unified to `◆` (matches the top-right HUD); prestige-weapon price + wallet now read "◆ Bone Dust". No more mystery-currency mismatch. Verified live (no 🦴 in merchant).

---

## 📥 Notes intake — 2026-07-20 (approved; batches ship in order)

### Batch 1 — quick wins — ✅ SHIPPED v137–v140 (2026-07-20, verified live)
| # | Note | Finding | Status |
|---|------|---------|--------|
| 7 | Quest claim scrolls you back to top | CONFIRMED: claim calls `refresh()` which re-renders the whole home screen, resetting scroll. Fix: preserve scroll position across the re-render. | SHIPPED |
| 6 | "Melt gear" not an actual option? | EXISTS but buried: tap a gear piece in Wardrobe → inspect panel → Melt (arm-then-confirm). Fix: put a melt list right at the Salvage Bench + clearer hint in Wardrobe. | SHIPPED |
| 8 | Apple Health disconnected silently, steps stopped counting | No watchdog exists. Fix: track last successful sync; if connected but stale >36h → home banner + push notification + "Reconnect" CTA in Settings. Also investigate the root disconnect cause on Tom's device. | SHIPPED |
| 9 | Stat point every 25,000 steps | Training points currently come ONLY from protein days + closed days, so a walking-focused player earns none. Fix: +1 TP per 25k lifetime steps, derived from step history (idempotent, additive, wellbeing-aligned). NOTE: retroactive by default — Tom's existing step history would grant a one-time batch of points. | SHIPPED |

### Batch 2 — combat feel — ✅ SHIPPED v141 (2026-07-20, verified live)
| # | Note | Finding | Status |
|---|------|---------|--------|
| 3 | Boss + mini-boss add feels weird ("is the second skeleton his pet?") | Adds render as a second skeleton ("Gnash's Second"). Lean into Tom's read: make the add literally the boss's CREATURE (pet-style art, "Gnash's Hound"), mirroring how the player fights with a pet. | SHIPPED |
| 4a | Do enemies ever target your pet? Moves should have AoE/splash | BOTH EXIST already: enemies target your pet 15% of turns (35% when it's low), and tough foes have an AoE sweep that hits you AND your pet. It's invisible in play. Fix: telegraph it (copy + FX + floaters), extend the sweep to mini-bosses/high tiers, tune rates up slightly. | SHIPPED |
| 4b | Pet talent tree needs more depth | Tree already goes 5 tiers to Lv 10 (v125) — tiers 8/10 need 52k/82k banked steps on ONE pet, so Tom likely hasn't seen them. Proposal: first make upcoming talents visible ("next talent at Lv 8"), then decide if species-signature capstones are still wanted. | SHIPPED — visibility (v141) + species-signature capstones (v142) |

### Batch 3 — Kitchen 2.0 — ✅ SHIPPED (multi-pot v143 · transmute v144)
| # | Note | Finding | Status |
|---|------|---------|--------|
| 1a | Cook more than one thing at once (multi-pot) | Single `cooking` slot → array of pots (potsOwned, default 1). Second pot 1,000g, third 3,000g (Tom, cap 3). Kitchen shows a pot row (idle/cooking/ready) + buy card; legacy save migrates. | SHIPPED v143 (verified live) |
| 1b | Slow prep-cook: basics → building blocks | Folded into the v144 transmute (commons → the rare that gates the premium feast). A literal NEW intermediate-ingredient tier is deferred — content-design fork, low priority. | DONE-ish · deeper tier deferred |
| 1c | Once-a-day transmute: merge commons → a rare (WoW-style) | 6 commons → 1 Ectoplasm on a 20h cooldown; greedy-consume from most-abundant; Kitchen panel. | SHIPPED v144 (verified live) |

### Batch 4 — arsenal + guidance — ✅ SHIPPED (prestige weapons v145 · unlock guidance v146, fixed v147)
| # | Note | Finding | Status |
|---|------|---------|--------|
| 2 | More weapons to buy (best caster already owned) | Bone Merchant stocks 3 tiers per archetype; Tom owns the tier-3 caster. Build: a tier-4 prestige row per archetype (big coin+dust sinks that pair with endless boss scaling). | SHIPPED v145 — 3 tier-4 "prestige" weapons: Ossuary Warmaul (melee/power, 6000c+350 dust), Voidstar Focus (caster/hype, 6000c+350), Eternal Reliquary (support/marrow, 5600c+330). Dual-currency (coins AND Bone Dust — first weapons to spend dust, ties salvage into endgame). Merchant shows dust wallet + dual price; buy spends both. Exploit bar re-audited: all three <20% vs Champion (well under 90%). Weekly-rotating stock deferred (not needed — the 3 permanent prestige pieces are the ceiling). |
| 5 | Build page hard to find; important unlocks should notify + guide you | No unlock-guidance system exists. Build: unlock moments (first gear piece, new weapon affordable, training point earned, talent unlocked) → toast + badge on the relevant hero button, deep-linking to the right screen. | SHIPPED v146 (crash fixed v147) — computeHomeUnlocks() surfaces 4 signals: first-gear-unequipped, unspent talent points, unspent training points, cheapest affordable+unowned weapon. Home shows a tappable nudge card that deep-links straight to Build (openTalents) or the Wardrobe, plus a "!" badge on the Pit/Wardrobe hero button. fireUnlockToasts() pops the top NEW one once; seenUnlocks kv self-prunes to active keys so a returning state re-notifies. (v146 had a TDZ crash — unlock block read isToday before its declaration, blanked home; caught in live verify, fixed v147.) |

### Batch 5 — platform + comms (new notes 2026-07-20 #2, approved)
| # | Note | Finding | Status |
|---|------|---------|--------|
| 10 | Get Boneheadz on Android | Tom chose FULL NATIVE Capacitor Android (with Health Connect for steps). Phased mini-project. | IN PROGRESS — **Phase 1 DONE**: scaffold (`native/android`, live URL, appId com.boneheadz.gym, portrait lock). **Phase 3 DONE (2026-07-20)**: toolchain self-installed to `~/` (Temurin **JDK 21** at `~/.local/jdk/jdk-21.0.11+10`, Android SDK at `~/Library/Android/sdk`: build-tools 36, platform-tools 37, platform android-36, emulator + `system-images;android-36;google_apis;arm64-v8a`). Note: Capacitor 8's android lib needs **JDK 21** (JDK 17 fails "invalid source release: 21"). `./gradlew assembleDebug` → **app-debug.apk (23 MB)**, verified live in an emulator (bh_test AVD): app installs, launches, loads the v154 site in the native WebView, portrait-locked, full game (incl. Shop tab) renders. APK copied to `native/BoneheadzGym-debug.apk` (gitignored) + sent to Tom to sideload. **Phase 2 DONE (2026-07-20)**: Kotlin `HealthPlugin` (Capacitor plugin `Health`) backed by `androidx.health.connect:connect-client:1.1.0` — mirrors the iOS JS interface (isAvailable/requestAuth/queryToday) so js/native.js is unchanged; aggregates today's steps + active calories, reads latest weight, drives the HC permission sheet via Capacitor activity-result. Added kotlin-android + coroutines; **minSdk 24→26** (HC requires 26); manifest READ_STEPS/ACTIVE_CALORIES/WEIGHT + rationale intents; registered in MainActivity. Verified in emulator via DevTools: plugin registers, `isAvailable()`→`{available:true,native:true}`, `queryToday()` resolves gracefully (0s + caught SecurityException pre-grant, no crash). Real grant-sheet + live read = device-verified (needs a HC step source). **Phase 4 PREPPED (2026-07-20)**: signed release **AAB** built (`bundleRelease`, upload keystore `native/android/boneheadz-upload.keystore` — gitignored, pw in keystore.properties, Tom must back it up); Play listing assets in `native/play-assets/` (512 icon, 1024×500 feature graphic, 4× 1080×2400 screenshots, store-listing.md with copy + data-safety/content-rating notes); privacy.html updated for Health Connect (live at tommillerca.github.io/tally/privacy.html). **Phase 4 SHIPPED (2026-07-28)**: Play account registered, app created, **internal testing track live**, first automated release = versionCode **6 / 1.0.5** (jumped 4 → 6: versionCode 5 was built Jul 24 and never uploaded, unnoticed for four days). Publishing now goes through **`native/play.py`**, the Android twin of `asc.py`: `check` reports what the track actually serves and `upload` re-queries Google afterwards, exiting non-zero unless the track serves the build it just sent. **Never upload by hand.** Auth is OAuth-as-Tom, not a service account: nomad91.com enforces `iam.managed.disableServiceAccountKeyCreation`, so create a **Desktop app** OAuth client in GCP project `boneheadz-503722` and run `play.py login <client_secret.json>` (token at `~/.config/boneheadz/play-oauth.json`, 0600). **Tom's remaining steps for production** (internal is already live): ~12 testers × 14 days closed testing, data-safety + content-rating forms, Health Connect data-access declaration. |
| 11 | Easy-to-find patch notes for friends, retroactive last 15 patches | No changelog surface exists. Build: a `CHANGES` data list (js) rendered as a "What's New" screen reachable from Settings AND the Crew tab (friends live there); seed it retroactively in player-facing language; a small "new since you last looked" dot when unseen. | SHIPPED v148 — js/changelog.js (12 entries seeded v124→v148, newest first, plain language). What's New screen reachable from Settings + Crew tab; count badge that clears on open (changelogSeen kv = highest build viewed). Verified live: Crew card showed "12" badge, sheet renders all entries. |

---

## ✅ Shipped (recent major — full history in git log)
- v123 boss scaling with progression (past 1.32 cap, smarter AI, minions join)
- v124 per-pet base stats by rarity/personality; shiny = +8%; no "collection complete" signal
- v125 escalating pet level curve to Lv 10 + 5-tier talent trees + level-up celebration
- v126 pet instancing (duplicates stack as breeding stock)
- v127 only the EQUIPPED pet levels (banked per-individual progress)
- v128/129 breeding + lineage tiers (+5% stats/tier, stacking glow)
- v130/131 The Stable (pets out of the paper-doll; per-copy equip/breed/destroy)
- v133–135 home layout fixes (currency/notch double-count, pet size, crew box)
- v136 battle a friend's AI bonehead + daily/weekly friend-battle quests
- Native build 4: portrait lock (TestFlight); external public link approved & live

## 🧊 Parked (deliberate, don't lose)
- Live synchronous PvP (async PvP vs friends' real builds SHIPPED as v136 friend battles; realtime duels unscoped)
- Pet permadeath / 3+ fighters per side (rejected for now)

*(Corrected 2026-07-20: Crow Lord class and player-controlled pet actions were listed
parked but are SHIPPED — Crow Lord lives in pit.js with the Flock/Murder kit, and the
pet takes a player-controlled turn via petActionsFor/applyPetAction.)*

### Batch 1 ship notes (v137–v140)
- Scroll fix took three attempts: root cause was rAF callbacks being THROTTLED on
  WebViews (scheduled, never executed) — the hold is timer-based now, releases on
  touch/wheel. Lesson: verify the RUNNING build via the Settings badge first.
- Melt bench verified end-to-end (+dust). Watchdog verified: banner + one-shot
  notification + clears on next good sync. TP verified retroactive (+1/25k steps).

## 📝 July 22 idea batch (Tom, logged 2026-07-22 — needs prioritization, none started unless noted)

1. **Gear-reveal "cursed fortune teller" wheel.** A carnival/slot spin where potential gear
   flashes by before it lands on your piece — lean into the addictive near-miss feel. Builds on
   the existing daily wheel (`js/wheel.js`, Tomb-gate chat's) + boss-loot reveal; this is a
   dedicated GEAR spin with a teasing pre-roll. Design: keep it earned (crate/dust cost), not a
   money sink; date/seed-deterministic like the daily wheel so no reroll-by-reload.
2. **Navi-style guide sprite.** A little ghost/lantern companion that proactively advises
   "what next? where to spend coins?" Character-fies the existing home nudge system
   (`computeHomeUnlocks` in app.js). Needs: a sprite (Cam art), a rules engine for suggestions,
   a non-nagging cadence.
3. **Holistic "I had a burrito bowl" meal builder.** For meals you can't look up exactly: guide
   the user through likely components (Uber-Eats-order style) → ballpark macros. New food-entry
   flow; pairs with #4. Bigger feature (component DB + estimation UX).
4. **Branded fast-food data.** Tim Hortons, McDonald's, Chipotle, etc. menu items. Extends the
   current search (OFF + USDA in `js/sources.js`); OFF has some branded items but a curated
   chain set would be better. Data-sourcing task.
5. **Simplify home-screen icons / combine actions.** The Boneyard/Build/Stable/Kitchen/Backpack/
   Pit action tiles — combine sensibly, reduce clutter. Home IA pass (renderToday in app.js).
6. **Rearrange bottom nav to most-used.** e.g. Boneyard in the tab bar instead of Shop.
   Bottom-nav IA (`bindTabs`/tab bar in index.html + app.js). Pairs with #5.
7. **Granular workout data (Apple Watch — workouts, bike rides).** ✅ SHIPPED v183–v185 + Android
   vc4: active energy + completed workouts + exercise minutes + type-themed rewards. iOS workout
   reads ready (Swift), ship on next TestFlight build. Cycling-distance per-km bonus = fast-follow.
8. **Boneyard legend + tap-for-tooltip.** A legend of what the collectibles are, and/or a
   WoW-style tooltip when you tap a map thing explaining what it is. Map legibility/onboarding
   (`js/map.js`/`js/poi.js` + a legend UI). Cheap, high clarity win.
9. **Personalized quest chains for your own tasks** (take vitamins, take out trash…). The design
   problem Tom flagged: how to allow custom tasks WITHOUT "I made a task just to farm the reward"
   cheating. Options to explore: self-set tasks pay only tiny/symbolic rewards (streak/cosmetic,
   not coins/loot), or cap custom-task rewards/day, or make them honor-system with no material
   payout (just satisfaction + a habit streak). Must stay inside the wellbeing guardrail. Design
   task before build.

## 🏋️ Fitness-tracking expansion (planned 2026-07-22, awaiting Tom's approval to build)

### Context (how health data works TODAY)
- No native HealthKit plugin. An Apple **Shortcut** ("Sync Boneheadz") reads Health and
  hands the app a payload string: `tally-hk d=YYYY-MM-DD steps=N active=N weightlb=N`
  (parsed in `js/game.js` parseHkPayload ~L426). Android = Health Connect, same idea.
- `onHealthSync(date,{steps})` rewards STEPS ONLY (step milestones + big-day egg + past-cap
  XP, idempotent ledger keys `stepms-/egg-/stepx-<date>`). **`active` kcal is parsed but
  dropped** — not rewarded. Wellbeing guardrail: only ever reward movement, never eating less.

### A. Apple Watch → reward workouts / bike / active energy (LOW-RISK, no native build)
Everything an Apple Watch records (workouts, active energy, exercise minutes, cycling
distance) is ALREADY in Apple Health. The whole feature = read more fields in the Shortcut
+ reward them. Steps:
1. **Extend the Shortcut** to also append: `active=` (already sent), `exmin=` (exercise
   minutes), `cyclekm=` (cycling distance), `workouts=` (count/min of completed workouts).
   Provide Tom an updated shortcut recipe; Health Connect mirror for Android.
2. **parseHkPayload**: parse the new fields (additive, back-compatible).
3. **onHealthSync**: reward them, wellbeing-safe + idempotent per date:
   - Active energy: XP/Vigor per N kcal, daily cap + diminishing past cap (mirrors steps).
     Covers ALL cardio (bike/run/gym/swim burn active kcal) — the universal "you moved".
   - Exercise minutes: milestone at Apple's 30-min ring + bonus crate roll.
   - Completed workout: a real reward (coins + Vigor + crate roll); first-workout-of-day
     bonus. This is the marquee new hook — a bike ride or gym session = a meaningful reward.
   - Cycling km: per-km reward so bike rides (few "steps") finally count.
4. **Quests**: new weekly/monthly ("do 3 workouts", "burn 2000 active kcal", "ride 20 km").
5. **UI**: a "Today's activity" surface (steps + active kcal + exercise min + workouts) with
   reward toasts; Apple-Watch-ring energy.
- Integrity: rewards keyed to Health TOTALS via idempotent ledger keys, not user input; caps.
- Effort: MODERATE, contained to game.js + a quests + a UI card + the Shortcut recipe. No
  native rebuild (Shortcut mechanism already live).
- ✅ SHIPPED v183 (active-energy milestones + Workout Crate + daily/weekly quests, web-only).

### A2. GRANULAR HealthKit / Health Connect metrics (approved in principle 2026-07-22, NATIVE build)
Tom: step count + calorie burn isn't enough; need per-activity granularity. This is the native
follow-up. Extend the existing pipeline (no new architecture):
- **Metrics to add** (both platforms):
  - Workout SESSIONS: type + duration + energy. iOS `HKWorkout`/`HKWorkoutActivityType`
    (cycling/running/walking/swim/strength/HIIT/yoga…); Android `ExerciseSessionRecord` +
    `exerciseType`. Needs adding workout read perms (Info.plist strings already exist; Android
    manifest needs the Health Connect exercise/distance permission entries).
  - Exercise minutes: iOS `appleExerciseTime`; Android sum of session durations.
  - Cycling distance: iOS `distanceCycling`; Android `DistanceRecord` / per-session distance.
- **Flow**: `HealthPlugin.swift` + `HealthPlugin.kt` `queryToday()` return new fields
  (`exerciseMin`, `cycleKm`, `workouts:[{type,min,kcal}]`); `nativeSyncNow` (app.js ~4443)
  adds them to the payload; shortcut recipe + `parseHkPayload` gain `exmin=/cyclekm=/workouts=`
  so shortcut users benefit; `ingestHealth` stores; `onHealthSync` rewards; quests + a workout
  UI surface consume them.
- **Reward design (DECISION PENDING)**: per-workout event reward (≥10 min → coins+XP+crate,
  first-of-day bonus, type shown), per-km cycling, exercise-minute ring bonus, weekly
  "cross-trainer" variety bonus, type-specific quests (ride 20km / 3 strength / 60 min cardio).
  Optional phase-2 RPG flavor: workout type → themed loot/buff.
- **SHIP REALITY**: web reward/quest/UI ships live as usual, but the native metric-reading needs
  an **iOS + Android rebuild + re-upload to BOTH TestFlight and Play** (new build numbers,
  review). ⚠️ Coordinate with Tomb-gate chat: they just touched `AndroidManifest.xml` +
  `build.gradle` (GPS fix, versionCode 2) — adding Health Connect exercise/distance perms edits
  the manifest again; base on their vc2, note in handoff before editing native/android.

### B. Fitbit steps (friend's request)
The app is source-agnostic — it rewards whatever steps land in Apple Health / Health Connect.
So the task is getting Fitbit data INTO that store:
- **Android**: Fitbit app now supports **Health Connect** — she enables Fitbit → Health
  Connect (steps), Tally reads it. Zero app work.
- **iOS**: Fitbit does NOT write to Apple Health. Options:
  a. **Bridge app** (Health Sync / Sync Solver / myFitnessSync, ~$5): Fitbit → Apple Health,
     Tally reads via the Shortcut. Easiest, no app change. (Recommended short-term.)
  b. **Fitbit Web API** first-class integration: OAuth + a Worker endpoint pulling daily
     steps from Fitbit's cloud. Real project (Fitbit dev app, OAuth, token storage). Only
     worth it if many users have Fitbits.
  c. Manual entry fallback.
- Recommendation: short-term = tell her to bridge (iOS) / enable Health Connect (Android),
  no build. Long-term = Fitbit Web API only if Fitbit demand is broad.

## ✅ Pre-public-launch checklist (parked 2026-07-22, do BEFORE production/App Store review)
- **Declare email in the store data-safety forms.** v180 shipped the Day One survey,
  which collects an optional email LIVE (reaches TestFlight/Play via the web bundle).
  Play Data safety + App Store privacy must add "Email address (contact info)" before
  going to production/public review. privacy.html already covers it. Not blocking for
  internal/friends testing; Tom deferred 2026-07-22.
- **Move the app off `tommillerca.github.io` to a custom domain.** The native apps load
  the web app live from that URL, so iOS permission prompts + the privacy-policy URL show
  the GitHub handle (reads as Tom's name). Fix = custom domain (e.g. boneheadz.app):
  CNAME in repo + DNS + switch capacitor.config server.url + privacy/listing URLs, then
  one native rebuild + re-upload. Tom deferred 2026-07-22 ("leave it for now").

## The Bone Garden (shipped v259)

Tom's Stardew-style idea: grow ingredients in the Kitchen. Seeds from walks or by
destroying an ingredient, RNG seed count, RNG harvest always above 1.

**The balance argument, kept here because the numbers are the design.** Composting
an ingredient into seeds and harvesting more than you planted is a multiplier above
1, and it compounds. Tom's first shape (1 ingredient -> avg 2 seeds -> avg 2.5 each)
is 5x per cycle: 1 -> 5 -> 25 -> 125. Ingredients gate the dishes and dishes are
combat buffs, so unthrottled that means every buff permanently on and the Boneyard
stops mattering.

The throttle is SEEDS, not plots:

| Dial | Value | Why |
|---|---|---|
| Composts per day | 3 | caps the closed loop at ~4.6 seeds/day whatever else you own |
| Seeds per compost | 1 / 2 / 3 at 55 / 35 / 10% | Tom's RNG, kept |
| Beds | 3 free, 5 max (1,500 then 4,000 coins) | second throttle, not the first |
| Grow time | 3h common, 12h Spore | two cycles a day at most |
| Yield | 2 base, +1 watered, +1 bumper (10%) | always beats the 1 spent |
| Spore yield | 1 base, +1 watered, no bumper | protects the Feast gate |
| Seed off a spawn | 30% | walking stays the best seed source |

Net closed loop is about 9 ingredients a day, roughly one walk, and it needs two
app opens. Guarded in tests/unit.test.js: each dial has an assertion that goes red
when the dial is moved to the value that breaks it (proven, not assumed).

Ectoplasm cannot be composted at all. Spores only come off rare map finds and world
bosses, so the Necromancer's Feast stays something you earn outside.

**Open / deferred**
- Watering is not yet quest-tracked (no xp row per water); the two shipped quests
  are harvest-based. A "water every bed today" quest needs a water counter.
- No cross-player garden anything (gifting seeds, visiting a friend's patch).
- The single dial if it plays too generous is composts/day. Two halves the loop.

## Notes from Tom, 4 Aug 2026 (screenshots in _feedback_shots/2026-08-04-notes-*.jpg)

Twelve items. Two were clear defects with a measurable root cause and are FIXED in
v261. The rest are design changes and are logged here awaiting approval, per the
notes process: investigate, log, plan, wait.

### FIXED in v261

**1. The Glutton is still farmable (third report).** Root cause was never the map
marker (attempt one) or the way the sheets closed (attempt two). `openGluttonSheet`
builds its markup once and computes `beaten` at open time; nothing re-renders it,
so the FACE THE GLUTTON button survives the win, still wired. `history.go(-2)` is
count arithmetic and breaks whenever the gear loot reveal adds a sheet to the
stack. Fixed with three independent guards (self-heal on the win event, ledger
re-read on tap, ledger re-read on reopen), each proven red in isolation. Also fixed
the `slot = w.active ? w.slot : 0` fallback, which filed a win that settled after
the feeding window against an appearance that was never fought.

**2. The Glutton has no avatar for the first few moves.** The arena renders
`assets/bh/glutton/combat/*.png` (~90KB each); sw.js precached only the hero
portraits and nothing warmed the combat plates, so the first fight of a session
raced the network. Added to the precache and to `warmMapArt`, guarded by a unit
test that derives the required list from what `js/glutton.js` actually renders.

### AWAITING APPROVAL

**3. Bone Dust shop is too hard to find.** Agreed. It currently lives inside the
Backpack tab's Salvage Bench. Proposal: a Dust row in the Wardrobe tab header
next to the coin/dust chips, since that is where you are already thinking about
gear. Cheap: it is a route, not a new system.

**4. Unclear which gear in the melt list has stats.** The melt rows show a dust
value but not whether the piece is statted. Proposal: a stat badge on each row plus
a "commons only" quick-select next to "select all unworn", so a junk sweep cannot
eat a statted piece by accident.

**5. Statted gear should give more dust.** Needs checking against
`gearDustValue()` before I claim either way; if it is already rarity-scaled the ask
may really be "scale by stat count too".

**6. UI bug on the melt button.** The screenshot Tom referenced was not among the
four attached. Blocked pending that screenshot. Separately, the victory screen in
`2026-08-04-notes-3.jpg` shows the GEAR reward card rendering EMPTY (name present,
art panel blank), which looks like the v257 imgSrc change not drawing its canvas.
Investigating that as its own defect.

**7. Quests menu font is off-brand.** It uses the body face while the feature
banners use the display face. One-line change; wants a look at both together
before committing.

**8. Combat debuff icons are not tappable.** True. They are decorative spans.
Proposal: a tap target per status that opens a one-line explanation, same pattern
as the map legend.

**9. Build tab confuses new players, and auto-assigned stat points are wrong.**
Two parts. (a) A collapsible "what do these do" card at the top of the tab. (b)
Tom wants the bonus points that currently steer toward whatever task you do most
to become player-assigned instead. (b) is an economy change touching existing
saves, so it needs a migration plan: existing auto-allocated points must not
vanish or double.

**10. No duplicate pets from eggs until each has been seen once.** Proposal: hatch
from the unseen pool first, falling back to the full pool once the set is complete.
Needs a check on how duplicates currently feed the instancing/breeding system so a
"no dupes" rule does not starve it.

**11. Hide a garment but keep its stats, and toggle item glow.** This is transmog
by another route, and there is already a `transmogCost` / `TRANSMOG_HIDE` in
loot.js to build on. Proposal: a per-slot "hidden" flag that never touches the
stat calculation, plus a per-item glow toggle. Wants its own increment.

## 2026-08-04 batch: Pit ceiling, pet dupes, hide + glow (v264)

**Pit ceiling (item 1) DONE.** The cap existed but only as one sentence in a note
paragraph plus a text link, which read as fine print. Now a real state: the section
summary says AT THE CAP, a gold card names the rank you are stuck on, states that
each world boss raises the ceiling by 3, shows how many you have beaten, and offers
a full-width button to the Boneyard. The fight row says "rematch only". Guarded by
tests/pit-cap-audit.mjs, which also asserts the UNCAPPED state has no gate card, so
the check cannot pass on both.

**Pet duplicates (item 2): the rule was ALREADY THERE.** Both grant paths
(`hatchEgg` and `grantPet('random')`) build a `fresh` pool of species you do not own
and only repeat once nothing fresh remains. Measured the roster to explain what Tom
actually saw:

| | |
|---|---|
| Hatchable species | **5** (3 non-common, 2 common) |
| First possible duplicate | hatch **#6** |
| Exclusive, never rollable | CX (Founder's Lizard) |

So duplicates are correct behaviour once you hold all five; the roster is simply
small. **Open question for Tom: is 5 species enough?** If he wants dupes to feel
rarer, the fix is more pets, not more logic.

Also found and fixed a real bug while checking: `grantPet('random')` filtered
`slot === 'C'` WITHOUT excluding `exclusive`, so the Founder's Lizard could be
handed out by chance, devaluing it for the people who were actually given one.
`hatchEgg` has always excluded them. Guarded by a unit test that requires every
inline pet pool in loot.js to carry `!i.exclusive`, proven red.

Second observation, NOT changed, needs Tom's call: both pools prefer
`rarity !== 'common'`, so the two common pets can only ever appear after all three
non-commons are owned. That inverts rarity (commons become the last things you get).
Deliberate-looking, but worth a decision.

**Hide + glow (item 3): half of it already shipped.** `TRANSMOG_HIDE` is wired with
a Hide cell in the looks picker, per slot, free, and transmog never touches stats.
The missing half was the glow toggle, now in Settings > App as "Gear glow", gating
both the epic/legendary weapon halo and the slimed-gear glow. Cosmetic only, proven:
gear stats are byte-identical with it on and off, and hiding a slot changes no stats
either.
