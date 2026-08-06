# HANDOFF: Boneheadz Gym, design elevation to market quality

_Last updated: 2026-08-07. Written for a future Claude with zero memory of the session. Favor the specifics below; where something is uncertain it's in **§8 Open Questions**, not guessed._

> **This handoff covers the DESIGN ELEVATION initiative only.** The app's general
> engineering context (features, economy, server, release ritual) is in
> `/Users/tommiller/Documents/Hyperframes Editor/CLAUDE.md` and
> `/Users/tommiller/Documents/Hyperframes Editor/tally/ROADMAP.md`. Read both.
> Do not confuse this file with `/Users/tommiller/Documents/Hyperframes Editor/docs/HANDOFF.md`,
> which is the **Manulife video reel**, a completely unrelated project.

---

## 1. Project overview

**What we're making:** taking Boneheadz Gym (aka Tally) from "feels cheap in a lot
of places" to a product that can ship on the App Store and charge money. Tom's
words, 2026-08-06: _"the app feels cheap in its design in a lot of places. we need
to make a plan for how we go about taking this to the next level so it doesnt feel
like an amateur product and something that could actually go to market on the app
store and start making money."_

**The app.** Vanilla-JS ES-module PWA, IndexedDB, service worker, Capacitor-wrapped
for iOS/Android, Cloudflare Worker + D1 backend.
- Source: `/Users/tommiller/Documents/Hyperframes Editor/tally`
- Live: `https://tommillerca.github.io/tally/` (append `?demo` for the demo save)
- Currently shipped: **v270** (`js/app.js` `APP_BUILD`, `sw.js` `VERSION = 'tally-v270'`)
- iOS TestFlight app id 6787813598, bundle `com.boneheadz.gym`

**Stakeholder:** Tom (sole decision maker). **Art:** his brother Cam draws the
Boneheadz; never fake, relabel, or generate art in Cam's style and present it as his.

**The diagnosis, measured not vibed** (audit run 2026-08-06 against v270):
- `app.css` is 3,940 lines with **148 distinct hex colors, 52 font sizes** (12 of
  them half-pixel), **33 radii, ~107 unique box-shadows**, 151 paddings. Tokens
  exist but govern roughly 15% of the surface.
- **Two design systems are stacked.** The "MIDNIGHT LOOK v180" layer at
  `app.css:709-750` redefines `.card` / `.btn` / `.page-h1` over their originals
  ~600 lines earlier. Every component written since follows whichever half its
  author happened to read. **This is the root cause.**
- The brand deck's hero coral **#FD6857 appears ZERO times** in the app. Only 2 of
  15 canonical brand hexes are present. Rarity colors are Tailwind defaults
  (`#c084fc` for epic).
- The deck bans glassmorphism and soft-glow chrome; the tab bar is `blur(22px)` and
  24 shadows have blur >= 12px.
- Four separate implementations of the same icon-over-label tile (`.action-tile`,
  `.hero-act`, `.fight-act`, `.pot-card`); 12+ card classes that don't share
  `.card`; ~11 button families.
- **Zero haptics** anywhere (`@capacitor/haptics` not installed). **Zero route or
  sheet-exit transitions.** 42 `openSheet` call sites; sheets animate in but are
  `.remove()`d in a single frame.
- ~162 dingbat glyphs + ~60 emoji used as UI icons next to hand-inked SVGs. Bone
  Dust, a core currency, is a text diamond (x23). `icons-pack.js` (50 real icons)
  is imported by 2 of 37 files.
- 3 native `confirm()` and 2 native `prompt()` calls (one of them names a saved fit)
  inside a hand-illustrated game.
- Onboarding is 2 hard-cut screens that sell a calorie tracker, never mention the
  game, and whose Skip button silently assigns a fake 30yo / 178cm / 180lb body.

**Already at the target bar, do NOT "improve" these:** `js/gateintro.js` and
`js/graverise.js` cinematics, the `--sat`/`--sab` safe-area token system
(exemplary), `armToConfirm()`, the sheet open recipe, the speech-line voice, the
`fx.js` sounds architecture.

---

## 2. Current status

### DONE

- **The 8-phase plan, approved by Tom 2026-08-06.**
  **USE THIS:** `/Users/tommiller/Documents/Hyperframes Editor/tally/docs/DESIGN-ELEVATION-PLAN.md`
  (durable repo copy, made 2026-08-06). See §7 trap 1 about the original location.
- **Phase 0 mockups: 4 screens, approved by Tom at rev 3 (2026-08-06).**
  Today, Wardrobe, The Pit, Kitchen. All four signed off ("okay im liking this now").
  Files in §3.
- **Full surface inventory (2026-08-06).** Counted from live v270 source:
  **43 surfaces total. 4 mocked, 18 need a mockup, 8 need a polish pass, 13 are
  carried by the repaint alone.**
  Local: `/Users/tommiller/Documents/Hyperframes Editor/market-quality-mockups/surface-inventory.html`
  Published: `https://claude.ai/code/artifact/44d406b0-2d94-46fd-9622-28ec48bb4318`

- **Tier 1 mockups: 8 surfaces, approved by Tom 2026-08-06** ("these are looking
  really good let's build them"). Add food, portion, quick add, barcode scanner,
  label scan, label-confirm/new-food form, Boneyard, Boneyard tapped-den.
  Files in §3. Two rounds of his notes are recorded in §6.
- **ALL EIGHT Tier 1 surfaces BUILT AND LOCALLY VERIFIED, shipping as one v272.**
  The six add-food surfaces plus the Boneyard map chrome. `tests/t1-audit.mjs` is
  **34/34** and `tests/unit.test.js` is **120/120**.
  Tom's call 2026-08-07: hold v271 and ship both together, so it is a single
  version. The changelog carries ONE entry (`n: 272`); there is deliberately no
  v271 entry, because that build never went live and a phantom "what's new" for
  it would be a lie.
  Live proof shots: `market-quality-mockups/live-v271/live-t1-*.png` (7 files,
  captured by driving the real controls, NOT the mockups; the folder name predates
  the merge into v272).

- **Tier 2: all 6 moments BUILT and shipped in v273.** Crate reveal, fight
  victory + gear choice, level up, pet hatch, pack reveal, breed result. Mockups
  at `market-quality-mockups/t2-*.html`.
- **Breeding now explains itself (v273).** Tom, 2026-08-07: "a lot of people are
  confused". Cause was in the pre-commit copy, not the result screen. See §6.
- **v274, the glyph sweep, is PUSHED but not yet live** (Pages was degraded).

### IN PROGRESS / NEXT

**VERIFIED ON LIVE 2026-08-07, driving real controls, not just a version poll:**
`t1-audit` 34/34, `t2-audit` 20/20, `spire-gate` 10/10 against
`https://tommillerca.github.io/tally/`. Live serves **tally-v273**.

- **v274 needs its live check once Pages catches up.** Poll `sw.js` for
  `tally-v274`, then re-run `glyph-audit` plus `t1`/`t2` against the live URL.
- **GitHub outage note:** on 2026-08-06 Actions and Pages both went to major
  outage and the Pages build job was CANCELLED by GitHub, so a correct push sat
  undeployed for hours. The status page still said major outage after deploys had
  resumed, so trust the live `sw.js`, not githubstatus.
- **NEXT, the rest of Phase 3: the emoji ICON SETS.** These were left out of v274
  on purpose because they need icon-art decisions rather than mechanics:
  28 badge icons (`js/game.js`), 17 ingredient/recipe icons (`js/cooking.js`),
  20 in `js/app.js` (nudge cards, class picker), 7 in `js/loot.js`.
  `badgeIconHtml()` / `ingIconHtml()` ALREADY map an emoji to a pack icon where
  one exists, so the job is filling the map, not building the mechanism.
  53 prose/voice emoji stay by Tom's rule.
- **Then Onboarding** (Tier 4, mockups first). Highest-leverage screen for going
  to market: two hard-cut screens that never mention the game, and Skip silently
  assigns a fake 30yo / 178cm / 180lb body.
- **Still owed, small:** the 5 CSS classes the Tier 1 rewrite orphaned
  (`.food-row`, `.action-tiles`/`.action-tile`, `.stepper`, `.src-badge`,
  `.grid3`). `.action-tile` shares its v180 rule with `.hero-act`, which is still
  in use: delete the selector, not the rule.

## 3. Directory & file map

### Mockups (Phase 0). All paths verified 2026-08-06

Directory: `/Users/tommiller/Documents/Hyperframes Editor/market-quality-mockups/`

| File | Status | Notes |
|---|---|---|
| `tokens.css` | **USE THIS** | The proposed Phase 1 token set. **These values become the `app.css` `:root`.** Deck hexes only, 8-step type scale, 3 radii, 3 shadows. |
| `mock.js` | **USE THIS** | Shared mockup helpers. Contains the app's real `ICONS` copied verbatim from `js/app.js`, **plus newly drawn `dust` and `cauldron` icons** that do not exist in the app yet. Hydrates `[data-bhi]` / `[data-ico]`. |
| `icons-pack.js` | reference copy | Copied from `tally/js/icons-pack.js`. Do not edit here. |
| `today.html` | **FINAL (rev 3)** | Approved. |
| `wardrobe.html` | **FINAL (rev 2)** | Approved. |
| `pit.html` | **FINAL (rev 3)** | Approved. |
| `kitchen.html` | **FINAL (rev 3)** | Approved. Includes the animated scene. |
| `after-today.png` etc (x4) | **FINAL** | Rendered @2x, 375x812. The acceptance reference. |
| `before-*.png` (x4) | reference | Captured from LIVE v270 for the comparison strips. |
| `strip-*.png` (x4) | **FINAL** | Side-by-side before/after. **`strip-today.png` and `strip-pit.png` are rev 3; `strip-wardrobe.png` and `strip-kitchen.png` are rev 2** and were not re-rendered after cosmetic rev-3 tweaks. Regenerate if exactness matters. |
| `kitchen-motion.mp4` | **FINAL** | 8s, 30fps, deterministic capture of the animated Kitchen marquee. |
| `asset-*.png` (x3) | reference | Stage crops pulled from the live app by `extract-assets.mjs`. |
| `avatar-layers.json`, `fighter-layers.json` | reference | The exact avatar layer URLs the mockups compose. |
| `surface-inventory.html` | **USE THIS** | Source of the published inventory artifact. |
| `tokens.css` + `t1.css` | **USE THIS** | `t1.css` holds the Tier 1 component recipes. It is the direct source of the `app.css` Tier 1 block. |
| `t1-picker/portion/quickadd/scanner/label/foodform/boneyard/boneyard-tap.html` | **FINAL** | The 8 approved Tier 1 mockups. |
| `after-t1-*.png` (x8), `strip-t1-*.png` (x8) | **FINAL** | Rendered @2x. The strips are what Tom signed off on. |
| `before-t1-*.png` (x7) | reference | Captured from LIVE v270. |
| `plate-boneyard.png` | **USE THIS** | The real live basemap with every piece of old chrome hidden. The Boneyard mockups draw over it. Do not re-shoot it casually; see trap 9. |
| `capture-before-t1.mjs`, `render-t1.mjs`, `build-strips-t1.py` | **USE THIS** | The Tier 1 rig. `render-t1.mjs` pauses every animation and seeks to a fixed time so a screen never renders at two points of its sweep. |

### Tier 1 code, in the app (v271)

| Path | What |
|---|---|
| `tally/app.css` | Brand-deck tokens added to the **top** `:root` (coral, violet, mint, `--sh`, `--sh-sm`, `--fs-0..7`). `--ink` changed from `#100c14` to the deck's `#2a2d28`. A `TIER 1: THE DAILY LOOP` block at the end holds every `.t1-*` recipe. |
| `tally/js/app.js` | `dayBudget()`, `foodDefaultNutr()`, `t1Sect()`, new `ICONS` entries, and rewritten `openAdd` / `foodRowHtml` / `openPortion` / `openQuickAdd` / `openScanner` / `openLabelFlow` / `openFoodForm`. |
| `tally/assets/brand/label-guide.svg` | The drawn Nutrition Facts panel on the label-scan screen. |
| `tally/tests/t1-audit.mjs` | **USE THIS.** The Tier 1 guard. Drives the real flow, 24 checks, exits non-zero. Its header records exactly how each check was proven red. |

### Repo docs

| Path | Status |
|---|---|
| `/Users/tommiller/Documents/Hyperframes Editor/tally/docs/DESIGN-ELEVATION-PLAN.md` | **USE THIS**, the approved 8-phase plan |
| `/Users/tommiller/Documents/Hyperframes Editor/tally/docs/HANDOFF.md` | this file |
| `/Users/tommiller/Documents/Hyperframes Editor/tally/ROADMAP.md` | the app-wide notes tracker (separate process, still live) |
| `/Users/tommiller/Documents/Hyperframes Editor/tally/docs/brand/boneheadz-brand-deck.html` | **the canonical art direction.** Read before any visual work. |

### SUPERSEDED / do not use

- `~/.claude/plans/delegated-tumbling-storm.md`: **SUPERSEDED by the repo copy.**
  It currently holds the design-elevation plan, but this path is session-scoped and
  gets reused. See §7 trap 1.
- Anything under `/private/tmp/claude-502/.../scratchpad/`: **GONE or going.**
  Everything worth keeping was copied to the durable paths above on 2026-08-06.

---

## 4. Scripts & tooling

All run from `/Users/tommiller/Documents/Hyperframes Editor/market-quality-mockups/`.
Node is nvm v22. Puppeteer is **not installed in this directory**; the scripts
resolve it out of the overlay render kit by absolute path (see trap 3).

**Re-render all four mockup screenshots** (writes `after-*.png`):
```bash
cd "/Users/tommiller/Documents/Hyperframes Editor/market-quality-mockups" && node render.mjs
```

**Capture the animated Kitchen** (writes `kframes/f0000.png`... then you assemble):
```bash
cd "/Users/tommiller/Documents/Hyperframes Editor/market-quality-mockups" && node capture-kitchen.mjs
```
Then assemble the mp4 (the `scale=trunc(iw/2)*2` is required, odd dimensions fail):
```bash
ffmpeg -y -framerate 30 -i kframes/f%04d.png -c:v libx264 -pix_fmt yuv420p -crf 19 -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" kitchen-motion.mp4
```

**Re-capture the BEFORE shots from the live app** (only if v-something changes the
current look and the comparison needs refreshing):
```bash
cd "/Users/tommiller/Documents/Hyperframes Editor/market-quality-mockups" && node capture-before.mjs
```

**Pull fresh avatar/stage assets from live:**
```bash
cd "/Users/tommiller/Documents/Hyperframes Editor/market-quality-mockups" && node extract-assets.mjs
```
Uses `tally/tests/godmode.js` to boot a real browser against the live URL.

**Existing app test suites** (run from `/Users/tommiller/Documents/Hyperframes Editor/tally`):
```bash
node tests/unit.test.js
```
```bash
URL=https://tommillerca.github.io/tally/ node tests/fx-audit.js
```
`tests/ui-audit.js` is pasted into the app console and run with `await uiAudit()`.

---

## 5. Priority workflow

**The process Tom approved, and the one that has been working. Do not skip steps.**

1. **Mock it before you build it.** No live code change for this initiative until a
   rendered mockup of the target look is approved. Tom's exact framing when this
   paid off: mockups are _"cheap to argue with, free to throw away."_
2. **Render, then look.** Never present a mockup from source. Run `render.mjs`, open
   the PNG, and inspect the actual pixels. Every round of feedback below was caught
   this way, and two of my own bugs were caught by looking at the render.
3. **Ship the strip.** Deliver `strip-<screen>.png` (before | after, labelled with
   the rev number), not the raw after-shot. Tom compares.
4. **Iterate until sign-off.** Rev 1 got four notes, rev 2 got four more, rev 3 was
   approved. Expect three rounds.
5. **Only then build**, phase by phase, each as its own version with the normal
   release ritual: bump `APP_BUILD` in `js/app.js` AND `VERSION` in `sw.js`
   together, changelog entry in `js/changelog.js`, **wait for Tom's explicit
   approval to push**, then verify on the LIVE github.io URL by driving real
   controls, and poll the deployed `sw.js` to confirm the new version is actually
   being served.

---

## 6. Key decisions & rationale (do not reopen)

**All Tom's calls, 2026-08-06.**

1. **Scope is everything**, not just a repaint: visual system, feel, first-run,
   store readiness, and a monetization gate.
2. **Palette aligns to the brand deck.** Coral `#FD6857` is the lead accent, lime
   `#A5E847` stays the action color, warm ink `#2A2D28` for every outline. Hard
   4px/5px offset sticker shadows. **No glassmorphism, no soft-glow chrome.** Deck
   rarity colors (violet `#9B92E8`, sky `#72A8F1`, gold `#E2AB36`) replace the
   Tailwind defaults. Earned game FX (legendary reveals) may keep a glow; chrome
   may not.
3. **Mockups first.** Locked. See §5.
4. **Phase order:** 0 mockups → 1 tokens/repaint → 2 components → 3 icons → 4 feel
   → 5 first-run → 6 copy → 7 store + monetization. Phases 3 and 4 may swap if Tom
   wants feel sooner.
5. **Never sell power.** Any eventual monetization is cosmetic or unlock based. The
   game's own rules also forbid shaming eating. This constrains Phase 7 before it
   starts.
6. **Mockup-specific decisions Tom made during review:**
   - The pet **must** appear on the Today hero (rev 1 omitted it). It sits
     bottom-right, inset 14px from the frame edge.
   - The Bonehead in the Wardrobe was too small on the tall stage; it was enlarged
     ~25% to fill the coral panel width.
   - **Health bars must never overlap a Bonehead's face.** They live in their own
     plated strip *above* the arena, not floating over the art. Debuff and status
     chips live in that same strip for the same reason, and are the only place
     status effects may render.
   - The Kitchen must have **ambience**, not just clean chrome. Rev 1 was rejected
     as _"soulless and lack lustre"_. It now opens on an illustrated night scene
     (cauldron, embers, steam, drifting spores, bone garland) with slow ambient
     motion.

---

## 7. Environment & gotchas

**Machine facts.** macOS. Media toolbelt is already installed and on PATH
(`ffmpeg`, `ffprobe`, `exiftool`, `pdftoppm` shim, `timeout` shim, `gh`); do not
reinstall. Default `python3` is miniconda 3.13 with PIL/numpy;
`/usr/bin/python3` has nothing. Screen Recording and Accessibility are granted.

### Traps we hit (each cost real time; do not re-debug)

1. **The plan file path is not durable.** `~/.claude/plans/delegated-tumbling-storm.md`
   held the **Dark Spires Phase 3** plan at the start of this session and holds the
   **design elevation** plan now. Same filename, different plan. That is why the
   plan was copied into the repo. **Always read
   `tally/docs/DESIGN-ELEVATION-PLAN.md`, never the `~/.claude/plans/` path.**

2. **`page.screencast()` produced a webm that decodes zero packets.** ffmpeg reported
   `Nothing was written into output file` on a 348KB VP9 file that looked fine to
   `ffprobe`. Do not waste time on the codec. **The fix that works** is deterministic
   capture: pause every animation, then step `currentTime` frame by frame. Chromium
   honors `currentTime` writes on CSS animations (Safari does not, per the existing
   WebKit lesson). That is what `capture-kitchen.mjs` does.

3. **Puppeteer is not installed in the mockup directory.** Every script resolves it
   from `~/Documents/Hyperframes Editor/overlay-render-kit/node_modules/puppeteer`
   by absolute path. A plain `import puppeteer from 'puppeteer'` throws
   `ERR_MODULE_NOT_FOUND`. Copy the resolution block from the top of `render.mjs`.

4. **Mockups must be served over http, not `file://`.** They use ES module imports
   (`mock.js`), which fail under the file protocol. `render.mjs` spins up
   `python3 -m http.server 8123` for exactly this reason.

5. **A capture that is a still is a FAILED capture, not a quiet one.**
   `capture-kitchen.mjs` asserts `document.getAnimations().length > 0` and throws if
   it is zero, and the frames are diffed afterward to prove pixels actually changed
   between them. An 8-second video of a static image looks like a successful render.

6. **I drew a second shadow under the pet.** The cloud pet art already has a shadow
   baked into the PNG. Adding a CSS ellipse produced two stacked shadows, which only
   became visible when the render was cropped and inspected at full size. **Check
   what is already in the art before adding chrome to it.**

7. **A summary number that does not match its own contents.** The first draft of the
   surface inventory said "4 mocked / 21 need design / 16 system / 41 total" while
   the page itself contained 43 cards tagged 4 / 18 / 8 / 13. The published version
   is verified by a script that counts the cards and asserts the header matches.
   **If a doc states a count, count it programmatically before publishing.**

9. **Headless Chrome renders the Boneyard map as a black rectangle** unless WebGL
   is forced on. MapLibre initialises, the attribution draws, and the tiles never
   appear, so it looks like a network problem. Launch puppeteer with
   `args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']`.
   Geolocation also needs `ctx.overridePermissions(origin, ['geolocation'])` plus
   `page.setGeolocation(...)`, or you land on the pre-map gate screen instead.

10. **Two positions for the scanner status message were wrong before the third.**
    The original `top: calc(44% - 130px)` put a two-line "camera denied" through the
    TOP brackets; moving it to `bottom: 226px` put it through the BOTTOM ones,
    because there is no gap between the reticle and the hint big enough for it.
    It now shares the hint's exact slot (`bottom: 172px`) and the hint hides while
    the status speaks. `t1-audit.mjs` asserts the rects never intersect.

11. **A guard's documented red-proof has to be the one that actually reproduces.**
    I first wrote that deleting `.sheet.t1 .sheet-body { flex: 1 1 auto }` would
    fail FOOT-ON-SCREEN. It does not: a flex child shrinks by default and `.sheet`
    is height-clamped, so the layout survives. The break that fails it is
    `flex: 0 0 auto`. If a comment claims a proof, run the proof.

12. **A gate that reads correctly and never fires, twice.** `if (!gluttonBeaten)`
    called a function that did not exist (ReferenceError on every tap). Then
    `const spent = await spendPitFight(); if (!spent)`: that helper returns
    `{ ok: false }` when tapped out, and an object is always truthy, so the
    energy cost on taking a rival's spire had never once applied. Both read fine
    in review. `tests/gate-audit.mjs` now scans for the pattern mechanically.

13. **A whole mechanism built and wired to nothing.** `spireKey(id, day)` sat in
    `spires.js` from the day Dark Spires shipped, imported by no file, so spire
    fights had no per-day ledger and a refused claim could be re-fought for 40
    coins forever. **When a helper exists for exactly the gate you need, check
    whether anything actually calls it.**

14. **maplibre `Marker.addTo(null)` throws `Cannot read properties of null
    (reading '_getUIString')`,** with a stack pointing into the vendor bundle that
    names nothing of ours. It means a marker was built for a map that teardown
    already removed, because the refresh functions are async and resolve after you
    have left. Guarded once in `domMarker()`. Do not chase this in app.js.

8. **`renderFoods` is a dead screen.** It still exists in `js/app.js` and still
   routes on `#/foods`, but nothing in the interface links to it since the Crew tab
   replaced the Foods tab. **Do not redesign it.** Per the coding contract it is
   being flagged, not deleted.

### Standing rules that bite on this initiative

- **Never push or deploy without Tom's explicit approval.** This was violated once
  (the Bone Garden went live mid-optimization) and he called it _"extremely sloppy."_
- **Never use em dashes** in any output, chat or document.
- **A check that cannot fail is not a check.** Before reporting a pass, state what a
  failing result would look like. An empty sample set is a failure, never a pass.
- **Verify on the LIVE github.io URL**, driving real controls. Localhost demo serves
  stale modules.

---

## 8. Open questions & blockers

1. **What do we do next: replan, or keep mocking?** Asked 2026-08-06, unanswered.
   Options put to Tom: rebuild the phased plan around the 43-surface inventory, or
   mock the next batch first. **My recommendation: mock Onboarding + the add-food
   flow next**, since between them they are the entire first-run experience and the
   most-used surface in the app. **Blocked on Tom. Do not start building either way.**

2. **Monetization model.** Explicitly deferred to Phase 7 and explicitly Tom's call.
   Options to price out when we get there: one-time unlock, cosmetic-only IAP (fits
   the wardrobe naturally, zero pay-to-win), or a subscription for premium tracking.
   Constraint: never sell power. Nothing in Phases 0-6 depends on this.

3. **Illustrated scene art from Cam.** The Kitchen scene currently shipped in the
   mockup is **my placeholder SVG**, animated to prove the ambience concept. The
   real version wants Cam. Same for a crate-reveal stage and an onboarding hero.
   **This should go to Cam as ONE batched brief, not three piecemeal asks.** Not yet
   written. Per Tom's standing preference, any art brief must request the largest
   master plus layered source, never delivery-size files.

4. **Do the rev-2 strips need re-rendering?** `strip-wardrobe.png` and
   `strip-kitchen.png` are rev 2; the underlying `after-*.png` files are rev 3.
   Cosmetic only, nobody has complained. Regenerate with `node render.mjs` plus the
   strip-building step if a clean set is wanted for a deck.

5. **Whether the pet should cameo in the Wardrobe panel.** Tom asked whether the pet
   was missing there. It never has been in that panel (pets appear on Today, in
   fights, and in the Stable). He did not ask for it to be added. Flagged as an easy
   add if he wants it; **not assumed.**

---

_A future session can start from this file alone. First message: `@tally/docs/HANDOFF.md`_
