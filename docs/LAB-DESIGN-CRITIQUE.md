# Laboratory design critique

2026-09-08. Advisory findings, ordered by impact within each priority. Critique only. All source paths refer to this checkout.

## Verdict

Not shippable as a finished room. It explains a pet transformation system without showing the pets or making the next step visible. The screenshot feels like an internal form because instructions, counters and probability text occupy the space where Cam's creatures should establish the point of the feature. The gap is art, hierarchy and a readable recipe journey, not more decoration.

There is also a separate functional release blocker: the UI expects a `labLoot.laboratory` version-1 object, while `js/loot.js` exports individual functions such as `quoteLaboratory` and `animateLaboratory`. `laboratoryEngine()` therefore returns null and `labReadSnapshot()` supplies the unavailable overview. A visual pass cannot make this checkout a working Laboratory.

## Evidence and corrections to the brief

Read in the requested order: the brand deck, including “It should feel printed” and “Do / Don't”; `DESIGN.md`, `PRODUCT.md` and the CSS tokens; Laboratory renderers and styles; then `docs/lab-room-screenshot.png`. Supporting reads include the pet render helpers, asset inventory, `js/pets.js`, `js/loot.js` and `docs/LAB-UI-BOUNDARY.md`.

- The screenshot has no creature art and no meaningful colourway demonstration. The entry renderer and picker likewise contain no pet images. However, `labBranchesHtml()` and `labRevealHtml()` already render 64px and 144px sprites. Art is deferred until later in the flow, not absent from every Laboratory screen.
- The select is styled: `.lab-room select` has a 44px minimum height, `--surface-2`, `--text`, a 1px `--line-strong` border and `--radius-sm`. The screenshot shows that treatment. It remains a generic text-only species control, but calling it raw or unstyled would be inaccurate.
- The screenshot ends at the opening of the help section. Source continues with input slots, Review pair, eggs and navigation. “That is the whole screen” describes the visible impression, not all the implemented content. The screenshot's pixel dimensions do not establish CSS font size or device scale.
- Existing assets cover six ordinary species in six colours: six base PNGs plus 30 morph PNGs, including six Rose files. There are 36 ordinary collection images, excluding CX and shiny assets.
- `docs/LAB-UI-BOUNDARY.md` says the engine is absent. Current source contains engine functions, but lacks the adapter the UI checks. The screenshot's available-experiment state is not proof that this integration works in this checkout.

### Which parts of the design system are present?

| Element | Current evidence | Direction |
|---|---|---|
| Near-black grounds | Used: `.sheet` uses `--surface: #16151d`; recipe cells use `--surface-2: #1e1c26`; `--bg` is `#0d0c12`. | Keep the dark frame. This is not a generic SaaS colour palette; generic form composition is the failure. |
| Bone-cream text | Used: `--text: #f2e9d7`, with secondary `--text-2: #b9ac97`. | Keep it, with clearer emphasis. Current `--text-3` is `#9d9284`, not DESIGN.md's older `#8f8578`. |
| Scarce lime action | `.btn` and focus outlines use the system; no next action is visible in the supplied frame. | Reserve the prominent `--accent: #a5e847` fill for the current next step, with `--accent-ink: #16210b` text. |
| Bangers | The room heading and inherited `.btn` labels use `--display`. `.lab-recipe h3` remains system type at 1rem. | Add display hierarchy to recipe titles and the specimen name. Keep explanatory body copy in system sans. |
| Rarity | Entry and recipe cards communicate none. The recipe ladder describes colours, not rarity. | Do not label Ember rare, Toxic epic or Midnight legendary. Species rarity comes from `PET_ASSIGN`; changing colour does not change it. |
| Printed surfaces | `--ink: #2a2d28`, `--sh: 4px 5px 0 rgba(0,0,0,.55)` and `--grain` exist. Lab cards do not use them. Shared `.btn` already has a partial sticker treatment. | Apply the deck's flat, inked treatment locally. Avoid a global component rewrite. |

The authorities conflict in places. DESIGN.md records soft elevation, while the canonical deck requires hard shadows. Use the deck's hard shadow here. DESIGN.md's epic `#c084fc` is superseded by actual `--violet: #9b92e8`. The deck's rare cyan is `#62e5f1` and legendary gold is `#e2ab36`; DESIGN.md lists rare `#6fd0ff`, and current `--gold` is `#ffc961`. There is no single consistent rare token to reuse. Do not disguise `--protein` as a new decorative cyan or silently redefine global gold. If rarity is added, specify that limited reconciliation explicitly, as discussed under later polish.

## Must-fix before ship

### 1. Put the creatures where the feature begins

**Location:** `js/app.js`, `labBenchHtml()`, `labRecipesHtml()`, `labPickerHtml()`; `app.css`, `.lab-room`, `.lab-recipe`, `.lab-pet`, `.lab-slots`.

Make a selected species' actual colour variants the first substantial visual, ahead of the experiment ledger. Use `petPortraitHtml(sp, 144, false, { morph, wear: null, thumb: true })` for a static specimen, and 48 to 64px portraits for ingredients and outcomes. This helper already uses the content crop; raw full-canvas PNGs can make the animal tiny inside a large box. For recipe previews, label unowned colours as “Not collected” without obscuring their colour or silhouette. Before selection, show the six base portraits as species choices rather than inventing an owned specimen or a predicted result.

Use the existing files `assets/bh/C/C1.png` through `C6.png` and `assets/bh/C/morph/C1__rose.png` through `C6__rose.png`, with the equivalent Ember, Frost, Toxic and Midnight paths resolved through `morphAsset()`. No redraw, generated substitute, CSS hue rotation or regeneration of the recolours. Art stays unchanged and palette-faithful.

Pair each image with its species and colour name. Add the same portraits to input slots and picker rows so players can identify the exact pet they are choosing. Preserve nicknames, levels, investment details and exclusion reasons. Preview portraits explicitly suppress wear and shiny; actual instance portraits must reflect the instance's shiny state and remain labelled if excluded.

**Acceptance:** a new visitor can see what changes colour before reading odds, and can distinguish a recipe example from a pet they own.

### 2. Give the player one clear next step

**Location:** `labBenchHtml()`, `openLaboratory().paint()`, `.lab-clock`, `#labHelp`, `[data-lab-slot]`, `[data-lab-review]`, `.lab-links`; room heading inherits `.pet-a11y .sheet-head h2`.

Order the room as: title and short purpose; species portraits; active recipe with its input slots and outcome art; Review pair; remaining recipe path and help; collection, reset details and other destinations. Keep the essential loss warning next to the inputs and review action. The initial attention target is a creature and the species choice. Once two pets are selected, the one primary action is **Review pair**, which must still open review rather than spend immediately.

Use one lime-filled next-step control at a time: the first empty input after choosing a species, then the second, then Review pair when valid. Other selectable controls use `--surface-2`, `--text` and a neutral selected checkmark. Do not auto-select expendable pets. Keep unavailable, invalid-pair and quota states explicit; disabled Review must say what is missing nearby. In the current unavailable build, keep spending disabled and retain Collection and Eggs as useful exits.

Proposed scoped type values: room title `var(--fs-6)` (1.75rem), recipe and specimen titles `var(--fs-5)` (1.3125rem), `font-family: var(--display)`, weight 400, `.02em` tracking and 1.1 leading. Body stays 1rem with 1.5 leading; explanatory captions use `--fs-3` (.9375rem) and `--text-2`. These sizes preserve root text scaling. Add a Laboratory-specific sheet class for its heading instead of enlarging every `.pet-a11y` sheet.

Change `.lab-room` spacing to grouped 16px gaps using `--pad`; remove the extra bottom margin on direct child paragraphs so a 14px gap plus 10px margin does not repeatedly interrupt the thought. Keep generous spacing between groups. Show “1 experiment available today” prominently once. Keep the used/capacity ledger and exact reset time/zone secondary. Move `#labHelp` below the working controls while preserving its saved open/read behaviour.

**Acceptance:** the player can find the next control without reading the full help table. Narrow screens and enlarged text may scroll naturally; never shrink text or hide loss disclosures to force everything above the fold.

### 3. Make the three recipes a visible progression

**Location:** `labRecipes`, `labRecipesHtml()`, `labBranchesHtml()`, `.lab-recipes`, `.lab-recipe h3`.

Keep three ordered recipe cards in a vertical path, with labelled ingredient portraits, a neutral plus/arrow connector, and larger outcome portraits. Use `--text-3` for connectors and `--surface` for cards. Put the outcome promise before the percentages:

| Step | Visible ingredients | Lead copy and outcome art | Supporting numbers |
|---|---|---|---|
| 1 | Two Base pets of the same species | “Make Ember or Frost”, showing both portraits | “Equal chance: 50% each” for baseline odds only |
| 2 | Ember + Frost of that species | “Make Toxic or Rose”, showing both portraits | Baseline 50% each, replaced by the selected species' actual distribution |
| 3 | Toxic + Rose of that species | “Make Midnight. Guaranteed.”, showing one portrait | “100% Midnight” secondary; no roulette or fake suspense |

Use small labelled swatches from `morphSwatch()`: Base `--text`, Ember `#f0763a`, Frost `#5fb8ec`, Toxic `#8fd23c`, Rose `#e878a5`, Midnight `#6b4fc4`. These are the existing morph semantics, not new card background colours. Toxic green must not become another large lime-like action panel. Cream and ink hold the frame; the creature colours supply the variety.

Read protection and shortages from the engine's species recipe details. Before species selection, say “Example odds. Choose a species to see your chances.” A protected single outcome gets “Guaranteed” only when the supplied distribution warrants it. Do not hard-code 50/50 into the redesign, add an outcome selector, or calculate safety from collection dots. Exact branch losses and gains remain visible at review.

Show “Have” and “Need” ingredient counts beside names when the snapshot supplies them. Keep unknown counts unknown. Explain that extra copies are needed for later recipes and that each experiment removes both inputs to create one pet. The ladder must not imply that one Base pet simply levels through all six colours, or that Midnight is a higher combat rarity.

**Acceptance:** players can follow Base to Ember/Frost to Toxic/Rose to Midnight visually, understand the two-pet cost, and distinguish a chance from a guarantee without interpreting a percentage table.

### 4. Give species selection a pet identity

**Location:** `#labSpecies` in `labBenchHtml()` and its change handler in `openLaboratory().paint()`; `.lab-room select`; picker filters `#labPickSpecies`, `#labPickColour`.

The main species control needs portraits, full names and a quiet “2 of 6 colours” count. Keep all six species visible, including those with no matching pair. Use at least 44px hit areas, wrapping labels and the existing 2px `--accent` focus outline with 3px offset. A selected state needs text or a checkmark as well as colour. Changing species must continue clearing both input IDs and the quote. Preserve focus across the current full `innerHTML` repaint.

**Tom's taste call:** an always-visible, wrapping two-column radio group of six portraits is easier to scan and removes a tap, but uses more vertical space. A compact portrait-and-name button opening a species sheet gives the specimen more room, but adds a tap and hides the full choice set. Either can fulfil the requirement. If using radios, use actual radio inputs with labelled portrait tiles and native keyboard behaviour; if using a sheet, retain focus return and announce the chosen species. Neither choice needs a custom ARIA combobox.

The picker filters can remain native selects because they filter a roster rather than establish the room's identity. Give them the local ink border and 16px radius from finding 5, retain associated labels, and show pictures in the resulting rows.

### 5. Apply the printed language to the room's surfaces

**Location:** `.lab-recipe`, `.lab-branch`, `.lab-loss`, `.lab-pet`, `.lab-room .btn`; inherited `.sheet`, `.btn`, and `body::before` in `app.css`.

The current recipe treatment is 1px `--line-strong`, 13px `--radius-sm`, 14px padding and no shadow. Replace the main recipe-card treatment with `border: 2px solid var(--ink)`, `border-radius: var(--radius)` (20px), `padding: var(--pad)` (16px), `background: var(--surface)` and `box-shadow: var(--sh)`. Use 16px radii on smaller ingredient tiles and controls. Keep the destructive review's explicit warning and `--danger` semantics, rather than indiscriminately recolouring every `.lab-loss` border as ordinary ink.

Use the same 2px ink outline and hard 4px 5px shadow on the local primary sticker button, with flat `--accent` fill and `--accent-ink` lettering. Remove its inherited inset sheen locally. A pressed state can move 2px down and right and reduce the offset to 2px 3px. Secondary navigation remains neutral. No soft material elevation, glass, or a wall of coloured recipe cards.

`body::before` already has grain, but it sits at z-index 0 behind the opaque `.sheet` at 51. Adding more body noise will not texture this room. Propose one local, noninteractive grain layer using existing `--grain`, a 150px tile and `.05` opacity, matching the deck. Keep it behind text, portraits and controls, clipped to the surface. This placement is a deliberate adaptation of the deck's over-everything overlay to protect Cam's linework. Do not stack grain on both the room and every card, or copy the body's `.5` opacity into a foreground overlay.

**Acceptance:** the room reads as inked paper objects against midnight. Art remains crisp; shadows and grain do not obscure text or intercept taps. Actual compositing remains to be checked in a future browser review.

### 6. Replace internal language without concealing the consequences

**Location:** `labBenchHtml()`, `labStateCopy()`, `labPetDetails()`, `labConfirmationHtml()`, `labBranchesHtml()`, `#labHelp`, and `laboratoryEngine()`.

Lead with “Make a new colour from two pets of the same species.” Keep “Both pets are permanently removed. The new pet starts at level 1.” adjacent to selection and review. Use “Choose first pet” and “Choose second pet” instead of “input”; introduce protection as “Missing colours come first.” Put the detailed rules beneath that sentence. Retain exact investment losses, typed ANIMATE when required, cancellation, stale-quote refusal and saved-result recovery. Dry and fond does not mean casual about losing a named pet.

Remove “Six Rose colours added” from the permanent collection line. It is release-note language, not guidance. Use “Your collection: 2 of 36 colours”, then per-species labelled colour dots, with owned/not-collected text available to assistive technology. Use `--text-2` and tabular figures for counts, never lime for every owned cell. Keep the existing named problem and recovery in read-error and uncertain-save states.

Two issues need explicit resolution before functional release. First, `PRODUCT.md` says earned things are never permanently lost, while the implemented Laboratory explicitly destroys both pets and their investment. Do not silently reinterpret this as reversible or rewrite the mechanics in a design pass. Tom must reconcile the policy with voluntary, confirmed consumption, or commission a mechanics change. Second, the missing version-1 UI adapter needs a separately reviewed integration change. Preserve the unavailable disclosure until that seam is implemented and proved; do not enable Review with fabricated eligibility.

## Later polish

### 7. Rarity and reveal emphasis are optional, separate from colour

**Location:** `labRevealHtml()`, `.lab-reveal`, `.lab-surprise.lab-play [data-lab-result-art]`; rarity source `PET_ASSIGN` in `js/pets.js`.

**Tom's taste call:** omit rarity effects here to keep colour comparison clean, or show a small, static rarity glow only around the final result with a plain rarity label. The former is quieter; the latter connects the reward to the wider game but can make Frost or Midnight look like different colours. Never use rarity-coloured card borders, and never change species rarity based on the recipe step.

If choosing the glow, propose scoped deck values: rare cyan `#62e5f1`, epic `var(--violet)` (`#9b92e8`), legendary `#e2ab36`. The cyan and gold differ from current shared styling, so adopting them locally needs an explicit consistency decision, not a silent global token change. A later implementation should assess a low-alpha 4px halo outside the silhouette; keep it off comparative ingredient portraits. This is not required to repair the room's hierarchy.

The existing `.65s` arrival scales from .65 and fades from .15 opacity. A later motion pass could use the deck's 150 to 300ms settle with much less scale change and no fading line art. Keep singleton results direct, the skip control for two-outcome reveals, image-decode recovery and reduced-motion behaviour. No extra sparks, machinery or looping laboratory effects are needed to ship the design fixes.

### 8. Clear the demonstration badge from content

**Location:** `app.css`, `.demo-badge`.

The supplied image shows the orange DEMO badge over the Midnight line. It has `pointer-events: none`, so source does not suggest a tap blocker, but it obscures content. In a later demo-shell pass, put the badge in reserved header space instead of the fixed `bottom: calc(var(--sab) + 86px)` overlay. Retain the existing amber demo semantics and adequate contrast; reserve room beside Back at enlarged text sizes. This is surrounding shell polish, not an excuse to rearrange the recipe around a floating badge.

## Scope, deviations and verification

This document is the only intended change. No application, stylesheet, artwork, engine or test implementation is part of this order. No commit, push or publish.

The frozen plan's select, whole-screen and total-artwork descriptions were corrected against source and the supplied image, as documented above. The proposed grain placement adapts the deck to preserve the art; rarity colour discrepancies and the permanent-loss policy conflict are explicit unresolved decisions. These are advisory proposals, not implemented deviations or permission to change mechanics.

The agreed proof command `node tests/unit.test.js` completed with exit code 0:

```text
370 passed, 0 failed
```

It checks the checkout's unit assertions, not the quality or usability of these proposed designs. No denied tool actions or blocked deliverable steps occurred. The integration and policy issues above are findings for release, not obstacles to completing this critique.

Browser and socket/server execution: **unrun**, as required. The existing screenshot was inspected locally; it was not regenerated. Live layout, enlarged text, keyboard navigation, focus restoration, hit testing, grain compositing, image decoding and motion are consequently unverified. Future implementation should check these at narrow phone widths and enlarged root text sizes, across empty, unavailable, eligible, protected, guaranteed, exhausted and uncertain-save states. The screenshot alone cannot establish those behaviours.
