# Boneheadz Gym — Roadmap & Notes Tracker

**How this works:** every app note Tom sends lands here FIRST, with an investigation
finding and a status, before anything is built. This file (in the repo) is the
canonical tracker; a mirror artifact is published for phone reading. Update both
whenever notes arrive or items ship. Statuses: `BUG` confirmed defect ·
`PARTIAL` exists but broken/invisible · `FEATURE` not built · `SHIPPED` done ·
`PARKED` deliberately deferred · `DECISION` needs Tom's call.

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
| 10 | Get Boneheadz on Android | Tom chose FULL NATIVE Capacitor Android (with Health Connect for steps). Phased mini-project. | IN PROGRESS — **Phase 1 DONE**: scaffold (`native/android`, live URL, appId com.boneheadz.gym, portrait lock). **Phase 3 DONE (2026-07-20)**: toolchain self-installed to `~/` (Temurin **JDK 21** at `~/.local/jdk/jdk-21.0.11+10`, Android SDK at `~/Library/Android/sdk`: build-tools 36, platform-tools 37, platform android-36, emulator + `system-images;android-36;google_apis;arm64-v8a`). Note: Capacitor 8's android lib needs **JDK 21** (JDK 17 fails "invalid source release: 21"). `./gradlew assembleDebug` → **app-debug.apk (23 MB)**, verified live in an emulator (bh_test AVD): app installs, launches, loads the v154 site in the native WebView, portrait-locked, full game (incl. Shop tab) renders. APK copied to `native/BoneheadzGym-debug.apk` (gitignored) + sent to Tom to sideload. **Phase 2 DONE (2026-07-20)**: Kotlin `HealthPlugin` (Capacitor plugin `Health`) backed by `androidx.health.connect:connect-client:1.1.0` — mirrors the iOS JS interface (isAvailable/requestAuth/queryToday) so js/native.js is unchanged; aggregates today's steps + active calories, reads latest weight, drives the HC permission sheet via Capacitor activity-result. Added kotlin-android + coroutines; **minSdk 24→26** (HC requires 26); manifest READ_STEPS/ACTIVE_CALORIES/WEIGHT + rationale intents; registered in MainActivity. Verified in emulator via DevTools: plugin registers, `isAvailable()`→`{available:true,native:true}`, `queryToday()` resolves gracefully (0s + caught SecurityException pre-grant, no crash). Real grant-sheet + live read = device-verified (needs a HC step source). **Phase 4 PREPPED (2026-07-20)**: signed release **AAB** built (`bundleRelease`, upload keystore `native/android/boneheadz-upload.keystore` — gitignored, pw in keystore.properties, Tom must back it up); Play listing assets in `native/play-assets/` (512 icon, 1024×500 feature graphic, 4× 1080×2400 screenshots, store-listing.md with copy + data-safety/content-rating notes); privacy.html updated for Health Connect (live at tommillerca.github.io/tally/privacy.html). **Tom's remaining steps**: pay $25 + register personal Play account (needs ~12 testers × 14 days closed testing before production), create the app, upload the AAB, fill data-safety + content-rating forms, submit Health Connect data-access declaration. |
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
