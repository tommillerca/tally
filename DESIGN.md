# Boneheadz Gym: design system

Recorded from the shipped implementation (`app.css`, ~3,670 lines, and the render
functions in `js/app.js`). This documents the incumbent world; it does not propose
a new one. Cam's illustration is the visual authority above everything written
here.

## The world in one line

A midnight arcade cabinet. Near-black grounds, one acid-lime accent that means
"go", warm bone-cream text, and comic lettering for anything with a pulse. Quiet
chrome so the artwork is the loudest thing on every screen.

## Colour

Tokens live in `:root` in `app.css` and are the only source of truth.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0d0c12` | page ground, near-black with a violet bias |
| `--surface` | `#16151d` | cards |
| `--surface-2` | `#1e1c26` | inset cells, tiles, pot/plot cards |
| `--surface-3` | `#2a2734` | the layer above that (bars, chips) |
| `--text` | `#f2e9d7` | bone cream, primary |
| `--text-2` | `#b9ac97` | secondary |
| `--text-3` | `#7d7365` | tertiary, captions, disabled |
| `--line` / `--line-strong` | cream at 9% / 17% | hairlines, never a solid grey |
| `--accent` | `#a5e847` | THE action colour. Acid lime |
| `--accent-ink` | `#16210b` | text on accent |
| `--gold` | `#ffc961` | prestige, legendary, warnings that are not errors |
| `--danger` | `#ff6d5e` | destructive only |
| `--protein` / `--carbs` / `--fat` | `#7cc4ff` / `#ffb454` / `#ff9dc7` | macro semantics, never decoration |

**Rules.** Neutrals are violet-biased, never pure grey. The accent is scarce: it
marks the one thing to do next. Macro colours are semantic and must not be
borrowed for ornament. Rarity has its own scale (common cream, uncommon green,
rare `#6fd0ff`, epic `#c084fc`, legendary gold, prestige `#ff6b8b`) and it is
consistent across gear, pets and cards.

## Type

- **Display:** `Bangers` (`--display`), self-hosted woff2. Used ~61 times: screen
  titles, card kickers, reward callouts, anything shouting. Never for body.
- **Body:** the system stack. Weights run 600–900; there is no light weight.
- Uppercase + `letter-spacing` is the section-header idiom (`.sect-h`).
- Numbers that line up use `font-variant-numeric: tabular-nums`.

## Space and shape

`--radius: 20px` (cards), `--radius-sm: 13px`, `--pad: 16px`. In practice most
components hard-code 10–18px radii; treat 12–16px as the working range for tiles
and 18–20px for full cards. Safe-area insets are tokens (`--sat`, `--sab`) and
every fixed element must respect them.

## Depth

109 distinct `box-shadow` declarations, which is the one genuinely undisciplined
part of the system. The pattern that dominates and should be followed: a soft dark
drop for elevation, plus an optional coloured glow at low alpha for rarity or
state. Glows are `drop-shadow` filters on art, never a border.

## Motion

- Idle life: `bh-idle` on `.bh-anim`, a 3.4s translate+rotate breath on characters.
  **Never animate the root of a layer stack** (it drags backdrops and map markers
  out of register); move an inner child.
- Feedback: 100–200ms. State: 200–300ms. Sheets and reveals: 300–500ms.
- Authored moments are single events with long dwell, not loops. The Wardrobe
  weapon charge is the reference: one 1.4s pass every 6s, masked to the artwork.
- `prefers-reduced-motion` removes effects rather than freezing them mid-frame.

## Components

`.card`, `.sect-h`, `.crate-row` (icon + text + action, the workhorse list row),
`.chip`, `.btn` (+ `.small`, `.ghost`, `.danger`), `.pack-card` (the reward reveal;
`imgSrc` cards need `hydratePackArt`), `.bh-stage` + `.bh-anim` (the layered
avatar), `.glutton-banner` (the pinned Today dropdown pattern), `<details>` folds
for anything secondary.

## Rules with scars

These exist because breaking them shipped a bug:

1. A `<details>` closed with `</div>` silently swallows every sibling after it.
2. Any absolutely positioned element over content must be hit-tested; the floating
   `+` button has eaten controls twice.
3. Tap targets: chips were 18px tall and unhittable. 40px minimum hit area, grown
   with a pseudo-element if the visual must stay small.
4. Never default to hidden. If code hides something pending an async result, the
   same code must own un-hiding it.
5. Verify animations by firing the real control and asserting decoded pixels, not
   geometry. A CSS box reads perfectly over a blank frame.
6. Touching shared render plumbing (`avatarLayersHtml` has 14 call sites) means
   checking a sample of every kind of consumer.

## Dark only

`color-scheme: dark`, no light theme, deliberately. The use scene is a phone in a
kitchen or on a night walk, and the artwork is drawn against dark grounds.
