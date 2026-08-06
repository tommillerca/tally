# Boneheadz Gym: from "feels cheap" to market quality

## Context

Tom's read is that the app feels cheap in a lot of places and he wants a plan to
take it to App Store market quality. Two deep audits (CSS/design-system layer and
UI-construction layer) plus a live screen-by-screen walk confirm the feeling is
real and measurable, and that it is mostly MISALIGNMENT and MISSING FEEL, not bad
art. The game art, the world voice, and the cinematic intros (gateintro.js,
graverise.js) are already at the target bar. The chrome around them is not.

Decisions locked with Tom (2026-08-06):
1. Scope: everything (visual system, feel, first-run, store readiness).
2. Palette: align to the brand deck (coral #FD6857 lead, warm ink, hard offset
   sticker shadows, one loud accent per screen), not just systematize the drift.
3. Process: mockups first. No live code changes until Tom approves the target
   look on real screens.

## The diagnosis (measured, not vibes)

Visual system, app.css (3,940 lines):
- 148 distinct hex colors, 52 font sizes (12 half-pixel), 33 radii, ~107 unique
  box-shadows, 151 paddings. Tokens exist but govern ~15% of the surface.
- TWO design systems stacked: the "MIDNIGHT LOOK v180" layer (app.css:709-750)
  redefines .card/.btn/.page-h1 etc. over their originals 600 lines earlier.
  Every component since follows whichever half its author read. Root cause.
- The brand deck's hero coral #FD6857 appears ZERO times. Only 2 of 15 canonical
  brand hexes are in the app. Rarity colors are Tailwind defaults (#c084fc epic).
- Deck bans glassmorphism and soft glow chrome; the tab bar is blur(22px) and
  24 shadows have blur >= 12px.
- 4 implementations of the same icon-over-label tile (.action-tile, .hero-act,
  .fight-act, .pot-card), 12+ card classes that don't share .card, ~11 button
  families.

Feel, js layer (app.js 9,988 lines, 37 modules, ~62 designable surfaces):
- Zero haptics anywhere. @capacitor/haptics not installed.
- Route change = frozen old screen while ~25 sequential IDB awaits run, then a
  one-frame innerHTML hard cut. No transitions anywhere. Tab active state is a
  color change only.
- 42 openSheet call sites; sheets animate IN but are .remove()'d in one frame.
  The 3 .drop-veil intro popups have NO entry animation (blur snaps on).
- Native confirm() x3 and prompt() x2 (naming a fit!) in a hand-illustrated game.
- One global toast, no queue, no aria-live; boot coordinates toasts with a
  hand-tuned setTimeout ladder (700/900/1200/2400/4000/4200/4600ms).
- ~162 dingbat glyphs + ~60 emoji as UI icons next to hand-inked SVGs. Bone Dust,
  a core currency, is a text diamond (x23). icons-pack.js (50 icons) is imported
  by 2 of 37 files.
- No skeletons; 3 spinners across 62 surfaces; empty states are grey 13px
  sentences in an app with a full illustration library. Boneyard flashes 3
  screens on every visit.
- Boot popup storm: 10 independent gates, each polling every 500ms with 6
  copy-pasted (and divergent) guard predicates. No priority queue.
- Onboarding: 2 hard-cut screens that sell a calorie tracker and never mention
  the game; Skip assigns a fake 30yo/178cm/180lb body; no character moment.
- A11y floor: .meal-add is 30x30px, 512 px font-sizes vs 3 rem, zero
  :focus-visible, zero aria-live, sheet grabber is decorative (no drag).

Protect (already at bar): gateintro.js + graverise.js cinematics, safe-area
token system (--sat/--sab, exemplary), armToConfirm(), the sheet open recipe,
speech-line voice, sounds architecture (fx.js), DESIGN.md honesty.

## Phases

Each phase ships as its own version(s) with the normal ritual: APP_BUILD +
sw.js VERSION bump, changelog, Tom approves every push, verify on LIVE
github.io, audits red-proven. No pushes without explicit approval.

### Phase 0: Target-look mockups (no live changes) — approval gate

Static HTML mockups at iPhone size, rendered and screenshotted, of 4 screens in
the new system: Today (hero + ring + wellness), Wardrobe, the Pit fight, and one
sheet (Kitchen). Built from the brand deck: coral lead accent, lime kept as the
action color, warm ink #2A2D28 outlines, 2px ink border + 4px/5px hard offset
shadow panels, grain, Bangers display + system body on a real type scale, deck
rarity colors (violet #9B92E8, sky #72A8F1, gold #E2AB36), no glass, no soft
glow. Deliverable: side-by-side before/after strip for each screen.
Iterate until Tom signs off. THE MOCKUPS DEFINE THE TOKEN VALUES.

### Phase 1: Foundation. One token system, the repaint (biggest visible change)

app.css restructure, no behavior changes:
- Single :root token block: palette (deck hexes only), type scale (~8 steps,
  no half-pixels), spacing scale, 3 radii, 3 shadows (sticker offset, raised,
  overlay), 2 easings (ease-out standard, overshoot pop) + 3 durations, existing
  --sat/--sab kept as-is.
- MERGE the v180 layer into the originals; delete the second :root and every
  duplicate selector (.page-h1 26px vs 31px etc).
- Fix dangling tokens (--border, --text-1, --muted...), kill the 5
  backdrop-filter blurs (tab bar becomes solid surface + ink border), replace
  Tailwind rarity hexes with deck values, retire soft-glow shadows for the
  sticker shadow except earned game FX glows (rarity/legendary moments keep
  glow; chrome does not).
- prefers-reduced-motion global becomes animation: none !important (removes the
  1000x/sec loop bug and the 24 hand patches).
- GUARD (same session, red-proven): tests/design-audit.mjs parses app.css and
  FAILS on any hex outside the palette allowlist, any font-size off the scale,
  any new box-shadow not in the token set, any backdrop-filter, and runs in the
  pre-push checklist alongside unit tests. Prove red by reintroducing one drift
  of each kind.
- Verify: screenshot every route + top sheets on live before/after; the mockups
  from Phase 0 are the acceptance reference.

### Phase 2: Components. One recipe each

- One .btn base (primary/ghost/danger/small variants), one .card, one .tile
  (replaces action-tile/hero-act/fight-act/pot-card), one .chip.
- Extract sharedIntroPopup() (replaces the 3 copy-pasted drop-veil functions)
  and pinnedBanner() (replaces the 5 glutton-banner clones and the string
  .replace class hack at app.js:1846).
- Inline-style sweep of app.js: the 157 inline margins and 29 inline font-sizes
  move to classes; the flex-row triplets become utility classes.
- Touch/a11y floor in the same pass: every tappable >= 44px (fix .meal-add
  30x30), :focus-visible outline token, aria-modal + focus trap in openSheet.
- Verify: tests/ui-audit.js sweep on every consumer of each merged recipe
  (anti-regression rule 7: shared plumbing = sweep every consumer KIND).

### Phase 3: Iconography. Kill the mixed-font look

- bhIcon()/ICONS everywhere: Bone Dust diamond, checks, chevrons, close x,
  map controls (recenter, key, compass), vigor bolt, achievement icons
  (game.js:109-116), crate/consumable icons (loot.js), the 4 potion iconIds,
  the drummer badge, CSS content: glyphs, the index.html rotate-lock skull
  (inline SVG skull instead of emoji).
- Keep emoji ONLY as flavor inside prose/speech lines, never as a control or
  a data icon.
- GUARD: extend design-audit to fail on dingbat/emoji codepoints inside
  icon/control positions in builder source (checks builders, not DOM, since
  bhIcon emits paths). Red-prove with a planted glyph.

### Phase 4: Feel. Motion + haptics + dialogs (biggest felt change)

- Sheet exit animation (slide-down + backdrop fade, ~200ms ease-out) via an
  async close path; drop-veil gets fade+scale in/out; toast gets exit; details
  banners get height transition.
- Route transitions: document.startViewTransition where supported (iOS 18+
  WKWebView), CSS fallback cross-fade elsewhere. Tab bar active state gets a
  real treatment + transition. Interim skeleton: renderToday's await chain gets
  a Promise.all batch + an instant shell so the old screen never freezes; fix
  the Boneyard triple-flash (keep map alive or show one stable loading frame).
- Haptics: @capacitor/haptics (iOS/Android native) + navigator.vibrate fallback,
  one haptics.js helper with 4 vocabulary calls (tap, success, heavy, reward)
  wired to: collect, crate/pack open, spin stop, level up, Pit hits, purchase
  confirm. Gated behind the existing sounds-style setting, default on.
- Replace the 5 native dialogs: prompt('Name this fit') becomes a small sheet;
  the 3 confirms become armToConfirm or a danger sheet (Erase ALL keeps a
  typed-word confirm in-sheet).
- Toast queue (sequential, aria-live=polite region) replacing the setTimeout
  ladder; boot delays deleted.
- Verify: fx-audit style pixel assertions for new animations (fire real
  controls, assert during animation, cold cache); haptics verified on the iOS
  simulator can't vibrate, so assert the call sites fire via a shim log +
  on-device spot check by Tom.

### Phase 5: First run + boot orchestration

- One popup coordinator: priority queue (recovery > wheel > what's-new > drops >
  survey...), max 2 interrupts per boot, replaces the 6 copy-pasted 500ms
  polling predicates.
- Onboarding rewrite: sell the actual product (your Bonehead earns while you
  log), a character-reveal moment (the Bonehead assembles via the existing
  composeAvatars art, name it or keep the generated name), then the plan form;
  progress dots, back button, real transition between steps; Skip states the
  defaults it is assuming instead of silently faking a body.
- First-session pacing: day-one boot suppresses the wheel/drop/survey gates so
  a new player's first minutes are Today + one gentle Pit nudge (the hooks for
  this exist: seen-counters).
- Loading/empty states: one .empty component (illustrated, one line of world
  voice, one CTA) replacing the grey sentences; skeleton shell for Today/Trends.

### Phase 6: Copy + polish pass

- Microcopy sweep to the two-voice rule: world voice for game surfaces, one
  consistent system voice for utility (single style for Saved/Deleted,
  punctuation, one ellipsis form, curly apostrophes); errors never leak
  err.message raw; every error says what to do next.
- Sound: keep synthesized tones but layer/vary (existing fx.js architecture
  supports it); optional later: sampled hits.
- Sweep DESIGN.md to describe the NEW system and its guards.

### Phase 7: Store readiness + monetization (decision gate with Tom)

- App Review compliance pass: privacy nutrition labels vs actual collection
  (D1 leaderboard, HealthKit), account deletion path (exists: erase + server),
  screenshots/preview video from the polished app, App Store copy in brand
  voice, age rating, icon set audit.
- Monetization design NEEDS TOM'S CALL before any build. Options to price out
  when we get there: one-time unlock, cosmetic-only IAP (fits the NFT-library
  wardrobe naturally, zero pay-to-win), or subscription for premium tracking.
  Constraint from the game's own rules: never sell power, never shame eating.
  Nothing in Phases 0-6 blocks any of these.

## Order and rationale

0 (approve look) -> 1 (tokens; everything else builds on them) -> 2 (components
consume tokens) -> 3 (icons are mechanical, huge visible lift) -> 4 (feel) ->
5 (first run) -> 6 (copy) -> 7 (store). Phases 3 and 4 can swap if Tom wants
feel sooner. Each phase is several small pushes, not one big one.

## Files (main)

- Mockups: scratchpad/market-quality-mockups/ (Phase 0, not in repo)
- app.css (Phases 1-2 heavy), js/app.js (2-5), js/icons-pack.js + game.js +
  loot.js + cooking.js (3), js/fx.js + new js/haptics.js (4), native/
  package.json + cap sync (4), js/notify.js untouched, new
  tests/design-audit.mjs (1, extended in 3), tests/ui-audit.js rows (2-5),
  DESIGN.md (6), sw.js + js/changelog.js every push.

## Verification contract for this initiative

- Phase 0 approval is on RENDERED screenshots at device size, not HTML source.
- Every visual push: screenshot the live deployed app on the affected screens
  and compare against the approved mockups; measure, don't estimate.
- design-audit.mjs is the anti-drift guard: it must be red-proven at birth and
  run before every push so color 149 can never land silently.
- Animations: fire real controls, assert pixels during the animation, cold
  cache (fx-audit pattern). Empty sample set = failure.
- ui-audit.js after any component merge, sweeping every consumer kind.
- End of chain: after each phase, install the TestFlight build via the public
  link path and eyeball on real hardware; desktop has no notch, no momentum,
  no haptics.
