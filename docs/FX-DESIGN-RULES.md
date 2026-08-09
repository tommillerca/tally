# Spell and impact FX: the rules I should have been following

_Written 2026-08-09 after Tom looked at my first Wraith spells: "the art needs to
look less cheap ... those tombstones look like shit ... the line dot things look
super cheap like Microsoft Paint. you need to audit your ability to create these
spells and learn some design references that suit the art style of this app."_

He is right, and the diagnosis is specific rather than a matter of taste.

## What I did wrong

I built the spells out of **CSS primitives**: a `border-radius: 50%` div with a
4px border and a `box-shadow`, and white `<div>` rectangles for shards. That is
the visual language of a web demo. It has hard geometric edges, perfectly even
strokes, and no drawing in it anywhere.

**This app's effect language is hand-drawn cartoon frames.** Look at what actually
ships:

| Effect | What it is |
|---|---|
| `assets/bh/fx/jab/jab1-3.png` | Cam-drawn fists with ink outlines and speed lines, 3 frames |
| `assets/bh/fx/swing/swing1-3.png` | same, a swung arc with drawn motion streaks |
| `assets/boneyard/graverise-hand.webp` | a flat bone-cream skeletal hand, heavy ink outline |
| `js/crate-fx.js` | WebGL rays, and the only procedural effect in the app |

Flat fills. Heavy ink. Speed lines instead of motion blur. Zero gradients on the
objects themselves.

## The rule

**Anything that reads as an OBJECT must be drawn art. Only LIGHT may be
procedural, and light must be soft and multi-layered, never a single hard-edged
primitive.**

A ring of light: procedural, fine. A shard of bone: drawn. A skeletal hand:
drawn, and we already own one. If I catch myself writing `border: 4px solid` for
something a player is meant to read as a *thing*, that is the mistake.

## Practical checks before calling an effect done

1. **Is any edge in it perfectly even and perfectly sharp?** Real light falls off.
   Every glow gets at least three stacked copies at increasing `blur()`, not one
   `box-shadow`.
2. **Does any part of it read as an object?** If yes, it must be a PNG with an ink
   outline, not a CSS shape.
3. **Does it survive next to Cam's art?** Screenshot it in the real arena beside a
   Bonehead. If the effect looks like it came from a different program, it did.
4. **Is the colour ours?** Cold violet-white for the Wraith, and never the
   Glutton's green or the player's coral. Cast colour is identity.
5. **Tinting drawn art keeps the ink.** My first Rise pass recoloured the graverise
   hand by luminance and pushed the outline to white, which deleted the thing that
   made it belong. Mask the ink (`lum < 0.42`) and only recolour the fill.

## References that suit this app

Rubber-hose and screenprint, per `docs/brand/boneheadz-brand-deck.html`:

- **Cuphead** — the closest match by far. Its spell and impact FX are inked shapes
  with flat fills, animated as frames. Nothing in it is a gradient primitive.
- **Guilty Gear / Skullgirls hit sparks** — hand-drawn bursts, chunky and angular,
  with visible line weight.
- **Hollow Knight's soul and void** — the one to steal from for *light*: soft,
  layered, low-saturation bloom sitting behind inked forms rather than replacing
  them.
- **Screenprint / risograph misregistration** — an offset second colour behind the
  ink is a cheap way to make a flat shape feel printed rather than vector.
- **Old cartoon magic** — concentric inked rings, radiating straight lines, drips.
  Motion is drawn, not blurred.

## Status of the Wraith's five effects

| Effect | State |
|---|---|
| **Hollow Bolt** | approved by Tom, unchanged |
| **Reap** | approved by Tom, unchanged |
| **Wail** | **fixed.** Each ring is now three stacked ellipses at increasing blur, so the edge falls off instead of stopping dead, over a wide soft bloom |
| **Rise** | **fixed.** The placeholder tombstones are gone; it uses the shipped `graverise-hand.webp` tinted to the cast colour with its ink preserved, bursting out of a soft sigil |
| **Amulet shatter** | **still wrong.** The shards are CSS `clip-path` chips and they read as pale blobs at 8px. This one needs drawn art: 4-6 bone-shard PNGs with ink outlines, the same way jab and swing are drawn frames. Asking Cam, or tracing them off the amulet's own crossed bones |
