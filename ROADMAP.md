# Boneheadz Gym — Roadmap & Notes Tracker

**How this works:** every app note Tom sends lands here FIRST, with an investigation
finding and a status, before anything is built. This file (in the repo) is the
canonical tracker; a mirror artifact is published for phone reading. Update both
whenever notes arrive or items ship. Statuses: `BUG` confirmed defect ·
`PARTIAL` exists but broken/invisible · `FEATURE` not built · `SHIPPED` done ·
`PARKED` deliberately deferred · `DECISION` needs Tom's call.

---

## 📥 Note — 2026-07-24 · Hybrid boss dens (fixed landmarks + roaming) — PLAN, awaiting approval

Tom: dens currently never move (permanent spots, weekly boss rotation — working as designed). He wants a HYBRID: keep some permanent **landmark** dens (and let players photograph a cool real local spot to nominate it to devs, so dens feel personal) PLUS **roaming** boss dens that appear/refresh around the map to keep it fresh.

- **Phase 1 — Roaming dens: ✅ SHIPPED v159.** 2nd den class in `poi.js`, day-seeded (`roam:<date>:<cell>`), ~40% of nearby cells host a boss that relocates + refreshes daily, beatable once/day (`roamboss-<day>-<id>`, separate ledger type so it doesn't inflate the endless-Pit gate). Rewards deliberately LIGHT (mostly coins/XP, occasional crate, no gear-choice/Ectoplasm) to keep the faucet in check; landmark dens keep weekly golden + gear + escalation. Distinct blue drifting marker. Reuses the whole boss fight path. Logic verified (deterministic, relocates day-to-day, correct keys); live map-fight leg needs on-device test.
- **Phase 2 — Community landmark nominations (needs decisions first):** camera/photo + note + current location → upload to your server → you review in the dashboard → approved spots become curated permanent landmark dens near them. FLAGS: (a) **UGC photos** = Apple/Google review + moderation obligations (you gate every one before it goes live, which helps); (b) **storage** (Cloudflare R2 vs base64-in-D1); (c) **privacy** (uploading a user photo + precise location — needs policy update + data-safety); (d) global-vs-local (does an approved landmark show for everyone near it, or just the nominator's town?). Bigger build; plan/approve separately.

Recommendation: build Phase 1 now; treat Phase 2 as its own planned feature given the UGC/storage/moderation weight.

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
