# Boneheadz Gym — Roadmap & Notes Tracker

**How this works:** every app note Tom sends lands here FIRST, with an investigation
finding and a status, before anything is built. This file (in the repo) is the
canonical tracker; a mirror artifact is published for phone reading. Update both
whenever notes arrive or items ship. Statuses: `BUG` confirmed defect ·
`PARTIAL` exists but broken/invisible · `FEATURE` not built · `SHIPPED` done ·
`PARKED` deliberately deferred · `DECISION` needs Tom's call.

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

### Batch 3 — Kitchen 2.0 — 🔨 IN PROGRESS (multi-pot shipped v143)
| # | Note | Finding | Status |
|---|------|---------|--------|
| 1a | Cook more than one thing at once (multi-pot) | Single `cooking` slot → array of pots (potsOwned, default 1). Second pot 1,000g, third 3,000g (Tom, cap 3). Kitchen shows a pot row (idle/cooking/ready) + buy card; legacy save migrates. | SHIPPED v143 (verified live) |
| 1b | Slow prep-cook: basic ingredients → building-block ingredients | NEXT. Needs ingredient-chain design (which basics slow-cook into which building blocks, times). | FEATURE · needs fork |
| 1c | Once-a-day transmute: merge commons → a rare (WoW-style) | NEXT. Forks to confirm: transmute ratio (how many commons per rare) + the daily gate. | FEATURE · needs fork |

### Batch 4 — arsenal + guidance (target: v140)
| # | Note | Finding | Status |
|---|------|---------|--------|
| 2 | More weapons to buy (best caster already owned) | Bone Merchant stocks 3 tiers per archetype; Tom owns the tier-3 caster. Build: a tier-4 prestige row per archetype (big coin+dust sinks that pair with endless boss scaling), maybe weekly rotating stock. | FEATURE |
| 5 | Build page hard to find; important unlocks should notify + guide you | No unlock-guidance system exists. Build: unlock moments (first gear piece, new weapon affordable, training point earned, talent unlocked) → toast + badge on the relevant hero button, deep-linking to the right screen. | FEATURE |

### Batch 5 — platform + comms (new notes 2026-07-20 #2, approved)
| # | Note | Finding | Status |
|---|------|---------|--------|
| 10 | Get Boneheadz on Android | No Android platform yet (Capacitor iOS-only; no `native/android`, no `@capacitor/android`). The web PWA already runs anywhere, so fastest path to "on Android" = installable PWA / Play Store TWA wrapper; a full native Capacitor Android build is the heavier option (needs Play Console $25 one-time, signing, HealthKit has no Android equivalent so steps would need Google Fit / Health Connect). Scope as its own mini-project after the app-feature batches. | FEATURE (large, platform) |
| 11 | Easy-to-find patch notes for friends, retroactive last 15 patches | No changelog surface exists. Build: a `CHANGES` data list (js) rendered as a "What's New" screen reachable from Settings AND the Crew tab (friends live there); seed it retroactively from v126→v140 (15 entries) in player-facing language; a small "new since you last looked" dot when unseen. | FEATURE (medium) |

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
