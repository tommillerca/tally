# Boneheadz Pet/Gear Recolor + Animation Skill

A reusable playbook for taking Cam's flat PNG assets (pets, wearables) and producing
(a) palette-faithful recolor variants and (b) subtle CSS-driven "living" animations,
rendered deterministically and verified against the actual output.

Tooling that's already set up (do not re-install): `python3` (miniconda: numpy, scipy,
PIL), puppeteer-core + a local Chrome at `/Applications/Google Chrome.app/...`, ffmpeg.
Capture harness node_modules live in `scratchpad/vendorwork/node_modules`.

---

## 0. The non-negotiable: understand the asset FIRST

Every failure in this project traced back to acting before understanding. Before any
extraction or animation:

1. **Render the asset with a coordinate grid** at 3-7x (`Image.NEAREST`) over a NEUTRAL
   GRAY background (not the app's near-black, which hides dark outlines and residue).
2. **Identify every feature and name it with coordinates**: eye(s), mouth, nostril,
   tongue, limbs, tail, accessories (fly, drool), highlights. Cartoon art is ambiguous;
   a "closed ⌒ eye" vs "mouth" vs "nostril" changes everything. If unsure, zoom that
   region clean (no grid) at 6-7x and decide explicitly. State your reading.
3. **Assign a depth layer to each feature**: background / body(mid) / foreground.
   Rain drops fall in FRONT of a cloud belly (original art has them in front). A fly
   orbits in FRONT of everything. A tongue is in FRONT of the face but retracts INTO
   the mouth. Get z-order right up front or the physics read wrong.
4. **Know the high-level goal / vibe**: "chill and minimal, subtle interest not
   distracting" means slow eases, long dwell times, one thing happening at a time,
   small amplitudes. Don't over-animate.

**Two-keyframe method (BEST when a part is fused into the flat art).** If a moving part
(a tongue in a mouth) can't be cleanly extracted because it's drawn merged with fixed
anatomy, do NOT reconstruct — get a second hand-drawn keyframe (e.g. ask the artist for
a mouth-CLOSED version). Then:
- base = the reference body with ONLY the small changed region swapped to the 2nd
  keyframe (keep the whole body pixel-exact to the reference; the two drawings usually
  differ subtly EVERYWHERE from re-encoding, so never swap the whole frame).
- Decompose the DIFF between the two drawings into what-moves vs what-stays: the moving
  part (tongue) translates; fixed line art (mouth/lip) NEVER translates, it swaps in
  place. Split the moving part at the 2nd-keyframe's boundary so it can never cross onto
  a region it shouldn't (the tongue root above the closed lip belongs to the open
  drawing and stays/fades; only the part below the lip slides).
- De-speck every mask (drop <5px connected components) or diff-noise ghosts on fades.
- SNAP line art between the two states; do NOT crossfade it. At 10fps a crossfade renders
  2-3 frames of half-opacity outline = ghost pixels exactly where the part was. Time the
  snap to fall BETWEEN frame samples (e.g. opacity 1→0 across a 0.2% window that lands
  between t and t+100ms) so no partial state is ever rasterized.
- Sequencing rule: the "container" (open mouth/cup) is FULLY in its open state whenever
  the moving part is visible. In: part moves first, THEN container closes. Out: container
  opens first, THEN part moves. Attached fluids (drool) leave and return WITH the part.
- Mandatory QC: the TWO-REFERENCE per-frame audit. Every frame must match reference A
  (state 1) OR reference B (state 2) OR be a short genuine in-between (moving part /
  forming fluid). Diff every frame against BOTH; anything that matches NEITHER for more
  than the expected handful of transition frames is a held wrong-state — fix the timing.
  This is what catches "it slipped back to a half-open empty mouth" that a single-state
  gate misses.

**Overarching principle: ALL animation references real-world movement.** Before
animating anything, picture how the real thing actually moves and replicate that
mechanism, not a visual shortcut. A blink is a lid descending over the eye (the eye does
not squash). A tongue retracts into the mouth. Rain forms, falls under gravity, and
stops at the ground. A shadow stays on the ground and only changes with height. If the
mechanism is wrong, no amount of polish makes it read right.

---

## 1. Layer decomposition (extracting a sprite + reconstructing behind it)

To animate a part independently you SPLIT the flat PNG into layers: a base body with the
part removed, plus the part as its own sprite. The hard part is **reconstructing what
was behind the removed part** so the base is seamless (this is where clipped/holed/
ragged artifacts come from).

### Extracting a sprite
- Work in HSV. Compute per-pixel hue/sat/val from the RGBA array.
- Mask by **hue + saturation + value + spatial region**, not color alone. Cam's palette
  has near-hues (orange skin h≈20 s≈0.73 vs pink tongue h≈3 s≈0.44 vs cream h≈49
  s≈0.13) — separate them by sat/region too.
- Clean up with `scipy.ndimage`: `binary_dilation` to grab a shape's own dark outline,
  `binary_fill_holes` to solidify, `label` + pick largest component to isolate one thing.
- **Always preview each extracted sprite cropped-tight and zoomed over gray** before
  trusting it. A tiny tinted-mask preview lies about position; a per-sprite view doesn't.

### Reconstructing the background behind it (the #1 source of bugs)
The base layer must look like the part was never there. Options, cheap → robust:

1. **Flat-fill from a sampled local color** — when behind is a solid region (orange head
   behind an eye → fill eye disc with median orange; cream face behind a tongue → fill
   with cream). Sample the fill color from a ring AROUND the removed region, not a guess.
2. **Row-wise interpolation** — when behind is a smooth gradient, fill each masked run
   from the nearest non-masked pixels on that row (used for eye sockets on the cloud).
   Feather only the seam (`GaussianBlur(0.8)` on the 1px border ring).
3. **Smooth contour fill** — when you're removing many small things from a large shape
   and must rebuild a smooth EDGE (the cloud belly after removing drops). DO NOT
   per-column fill to a median-filtered contour — it stair-steps ("ragged"). Instead:
   - get per-column top/bottom of the region (longest contiguous dark run ignores stray
     marks like a mouth),
   - **fit a low-order polynomial (parabola/cubic) to the contour** → guaranteed smooth
     curve, no nubs,
   - render the fill with **analytic anti-aliasing**: `alpha = clip(y-(top-.5),0,1) *
     clip((bot+.5)-y,0,1)` per pixel, composite the fill color over the original by that
     alpha. Smooth top AND bottom edges, matches the hand-drawn line quality.
4. **Interpolate/reconnect lines that the removed part interrupted.** If the part sat on
   top of a line (a mouth, an outline), redraw the missing stroke so it connects
   smoothly to what remains (e.g. a small dark mouth stroke where a slurped tongue
   attached, so the closed mouth reads).

### After reconstruction, ASSERT it's clean
- Programmatically count residual pixels of the removed color in the base layer
  (saturated-cyan-in-belly = 0), BUT beware false positives (a light-blue cloud BODY
  trips a naive "blue" test). Constrain the check to the region + saturation band.
- Then LOOK at the base over gray, zoomed on the reconstructed area. The metric and the
  eye must agree.

### MANDATORY sprite hygiene check (every extracted sprite, no exceptions)
Baked-in art has anti-aliasing in the RGB (opaque pixels whose color is a blend with
the ORIGINAL neighbor). Extract naively and those edge pixels become a **wrong-colored
halo** when composited over a NEW background. Also the shape's dark KEYLINE must be
carried so line weight stays right. For every sprite:

1. **Carry the keyline.** Cam draws every shape with a dark outline. Include the dark
   pixels hugging the fill (`binary_dilation(core,2) & dark`) as the sprite's boundary,
   so the edge is the intended dark line (reads correctly over ANY background), not a
   color-blend fringe. Uneven/missing keyline = wrong line weight; fix it.
2. **Exclude the pale fringe.** Do NOT dilate the fill into the surrounding color. Build
   `mask = fill ∪ keyline` then `binary_fill_holes` (fill_holes adds only enclosed
   interior, never exterior background), so the cream/skin AA halo is never included.
3. **Defringe residuals.** Any pale/blend pixel that slipped onto the mask edge: recolor
   it from the nearest solid interior pixel (`distance_transform_edt(return_indices)`),
   keeping alpha. No foreign color survives at the boundary.
4. **Feather for smooth line weight.** A hard boolean mask gives a jaggy edge. Feather
   the mask alpha (`GaussianBlur(~0.6)`) so the edge matches Cam's smooth AA line; over
   the real background the soft dark/fill edge blends correctly.
5. **VERIFY over the actual new background.** Composite the sprite over the layer it will
   sit on (tongue over the cream body, NOT over gray/black) and zoom the edges 6-7x.
   Look specifically for: a halo ring, a broken/uneven keyline, jaggy stair-stepped
   edges. Over gray/black a halo can hide; over the real neighbor it shows. This check
   is required before the sprite is used.

### THE decisive QC gates — run ALL THREE, per moving part
A moving part has three states and each must be verified from the render:
1. **REST**: reassembled composite == original (pixel diff, below).
2. **GONE**: the body alone (part removed) must be a clean surface — run a color-residue
   detector for the part's hues over the whole zone (target 0 px), AND look at it.
   Residue hides in body pixels that "pass" the rest diff because they're original — pale
   AA of the part baked into the body shows up ONLY in the gone state.
3. **MOVING**: step through the mid-motion frames (both directions) and inspect: nothing
   crosses other features, fixed anatomy (lip line, outlines) never shifts or breaks,
   no fringe dots trail on strokes the part grazes.
Converge with an auto-repair loop: any pixel where a gate fails gets reassigned to the
correct layer (sprite vs body) and re-checked, until the counters hit 0. Don't hand-tune
thresholds and eyeball it — loop to zero.

Read the anatomy right before choosing the mechanism (the lizard cost ~10 cycles to
this). A tongue is not a flap on a flat lip — it sits in an OPEN-MOUTH CUP, and the
piece that reads as "the lip" is the upper mouth-top line (dark, with orange head
directly above it). Don't try to rebuild or overlay a clean "lip stroke"; that fights
the drawing. Correct decomposition for a tongue-in-mouth:
- mouth-top line (dark & orange-above): FIXED anatomy, left as Cam's original pixels IN
  THE BODY, tight (no dilation, or it eats the tongue's junction and leaves spikes).
- tongue = pink + its ENTIRE connected dark outline (use connected-components seeded from
  the pink, minus mouth-top — a fixed dilation misses the far outline and leaves a
  cup-shaped remnant). This whole thing slurps up as one.
- body = original with ONLY the tongue+drool footprint filled clean face-cream. Nothing
  else is reconstructed. Rest then equals the reference to ~0 px by construction.
- The tongue is clipped by a `clip-path` along the mouth-top line, so it vanishes exactly
  at the lip and never crosses onto the orange head. (The clip edge adds a few px of
  invisible AA vs a PIL composite — verify the rendered frame LOOKS identical, don't
  panic at the pixel count.)
Result: the mouth line is Cam's, at Cam's weight, in EVERY frame, because it never moves
and is never redrawn.

Fixed anatomy is a PERSISTENT layer, never a crossfade. A line the source always draws
(a mouth/lip a tongue emerges from) must be its OWN always-on layer of the original
pixels, composited in FRONT of the moving part. Do NOT fade the original lip out during
motion and swap in a rebuilt stroke — the weight visibly changes the instant they swap
(this was the single most-repeated lizard failure). Correct structure for tongue-in-mouth:
- `lip.png` = the original dark stroke + its orange/cream AA shoulders, EXCLUDING any
  tongue pink / drool teal (dilating the stroke pulls those in — mask them out). Shown
  every frame, in front of the tongue.
- tongue slurps up, clipped at the lip line, disappears BEHIND the persistent lip.
- body = original with the tongue/drool footprint filled clean face-cream; scrub the
  reveal by SATURATION (cream is desaturated; pink is cream-ordered r>g>b so a hue/order
  test misses it — only a saturation test catches tongue pink).
- Verify LIP CONSTANCY explicitly: diff the lip band between a tongue-OUT and a
  tongue-GONE frame — it must be ~0 (only the tongue itself and its mouth-opening notch
  may differ).

Render/verify pixel-perfect against the reference:
- Do NOT double-resample. The browser upscales the PNG once; if you also downscale
  captured frames you blur twice and shift line weight + add fringe. Capture at NATIVE
  scale (deviceScaleFactor 1) for the fidelity check; deliver with a SINGLE clean upscale.
- Frame-0 identity: capture native, diff the art region against the reference on the app
  background. Lip zone must be 0; accept only genuine source sub-alpha pixels (Cam's soft
  tongue-tip edge can't be reproduced over an opaque reconstruction).
- Per-frame stray sweep: for every frame, mask out the animated zones (mouth, eye/lid,
  fly band) and diff the STATIC remainder against the reference — must be 0 for all frames.

Hard-won process rules (each violation cost a full review cycle on the lizard):
- **One idempotent build script per animation** (`build.py`): original art in → all
  layers out, gates printed every run. NEVER hand-patch a layer PNG in ad-hoc REPL
  passes — one bad scrub destroyed legitimate AA and there was no way back but a full
  rebuild.
- **When the part's linework MERGES with fixed linework in the original** (tongue
  outline fused into the lip stroke), perfect rest-fidelity and clean animation are
  incompatible. Resolve by rebuilding BOTH as clean geometry: idealized stroke in the
  body (poly-fit contours + analytic AA) + a clean closed sprite (core + own outline +
  mid-brightness AA ring, and NOTHING else — blob fragments read as flying debris).
  Consistency across all states beats pixel-forensics at rest.
- **Verify at DELIVERY resolution.** 8-10x inspection zoom shows 1px "artifacts" that
  don't exist at ship size — and can hide ones that do. The gate image is a frame from
  the shipped pipeline at shipped scale.
- A 1-2 frame crossing artifact (sprite AA grazing a stroke in flight) is legitimately
  masked with keyframed `filter:blur(~0.5px)` motion blur during the fast segment.
- Stagger independent motions (blink vs slurp) with `animation-delay` so key poses
  never coincide; keep delays loop-divisor-safe.

### THE decisive QC gate: rest-composite == original (pixel diff)
When a part is at its RESTING position (tongue out, eye open), the reassembled
`body + sprite` MUST equal the untouched original. This is objective and catches every
seam/halo/gap at once:
- `ImageChops.difference(original, rest_composite)`, count changed pixels (>20) in the
  affected region. Target = 0 (a max of ~2 from rounding is fine). If it's not ~0, you
  have a seam/halo/gap — fix before proceeding. (On the lizard this went 123 → 0.)
- **How to make it 0**: the sprite's mask must INCLUDE its baked AA edge pixels as
  OPAQUE original colors (hard alpha at the true silhouette, not a Gaussian-feathered
  alpha), and the body must be reconstructed on the EXACT SAME mask. Feathering the
  sprite alpha while filling a different color behind it is what creates the cream/skin
  seam. Do not feather-and-fill; mask-exact-and-fill.
- Never let a reconstruction fill (cream) bleed into an adjacent different region
  (orange lip, dark mouth line) — dilating the fill mask into the neighbor leaves a
  wrong-colored gap. Reconstruct only the removed part's own footprint.
- Reveal-state art (what shows when the part moves away, e.g. cream mouth when the
  tongue retracts) lives BEHIND the resting sprite, so it never affects the rest diff;
  keep any added detail (a mouth line) strictly inside the sprite's footprint.

---

## 2. Recoloring (palette-faithful variants)

Goal: multiply one art asset into many visually-distinct rarities/colorways using ONLY
colors that appear in the original library.

### Extract the real palette once
Sample every saturated pixel across ALL asset files, k-means cluster (~24 centers) →
that's the canonical palette. Rarity/colorway targets MUST be chosen from these swatches
(Tom's hard rule: "only select colours you have found in the original artwork").

### Techniques, weakest → strongest identity change
- **Accent-only** (markings): remap just the SECONDARY hue cluster, leave the dominant
  body untouched. Too subtle on its own for most items.
- **Global hue ROTATION** (the sweet spot): rotate ALL saturated pixels' hue by a fixed
  delta so the dominant body lands exactly on a target palette hue, **keeping each
  pixel's S and V**. This preserves Cam's shading/highlights → looks hand-drawn, not
  paint-dunked. Do NOT collapse a cluster to a single target hue (that's the "heavy
  handed monochrome dunk" Tom rejected).
- **Lighter hand**: `Image.blend(original, rotated, 0.4)` — a partial shift reads as a
  believable morph of the same creature (a tinted brown dog, not a purple dog).
- **Shiny (ultra-rare)**: the full, punchy recolor IS the payoff — reserve the dramatic
  version for a 1-in-N shiny, plus the existing rarity glow + a sparkle tag.
- Masking rule: only recolor pixels with `sat > ~0.25`. Dark outlines (low S) and
  cream/white (low S) must stay put or the linework/eyes break.
- Pets specifically: keep the body identity; change MARKINGS (stripes, head, fins) more
  than the base coat. A per-creature naturalistic choice beats a uniform rarity color.

---

## 3. Animation (subtle, CSS-driven, deterministic, seamless-loop)

We author pure-CSS keyframe animations over layered PNGs — the same thing ships in the
app (no video files, GPU-composited, tiny). One HTML file, layers as `<img>`, animate
with transforms/opacity/filter.

### Layer + transform-origin discipline
- Stack layers back-to-front in DOM order (painting order). Foreground = later in DOM.
- Group parts that must move together (body+eye+tongue) in one container so a shared
  motion (breathing) keeps them aligned; keep independent parts (a fly) outside it.
- `transform-origin` is everything for squash/retract: a blink squashes about the eye's
  vertical CENTER; a tongue retracts about its TOP (the mouth). Express as % of the
  layer's own box.

### Motion vocabulary (compose 2-4, keep amplitudes small for "chill")
- **Bob/float**: `translateY` sine (0→-Npx→0). N≈5px is plenty.
- **Breathe**: `scale(1 → 1.01)` about bottom-center for a resting creature. Very subtle.
- **Blink** — A REAL BLINK IS AN EYELID SWEEPING DOWN OVER A STATIC EYE, not the eye
  deforming. Eyes don't squash in the real world; the lid moves. Never `scaleY` the
  eyeball.
  - **Keep the eye's dark OUTLINE/ring in place** (it's the socket rim). The closed eye
    must still have Cam's linework — a lid that's a bare skin blob with no outline looks
    cheap/wrong. Leave the black ring in the BODY layer (don't remove the eye); it stays
    visible open AND closed.
  - Build the **lid** to fill only the eye INTERIOR (inside the ring): a skin-color
    ellipse sized to the interior + a BOLD dark lash/crease line (match Cam's stroke
    weight — measure it; ~5px here — with rounded caps, gentle curve). Layer it above the
    body, over the eyeball.
  - Animate the lid `scaleY(0 → 1 → 0)` from `transform-origin` at the interior's TOP
    (+ `opacity 0→1→0`). Closed = ring (outline) + skin lid + lash line = a hand-drawn
    closed eye. Fast (~150ms), occasional.
  - The squash/closed-line trick is a stylized shortcut, NOT a real blink — avoid it.
- **Retract (tongue/limb into a mouth/hole)**: do NOT `scaleY` squash it, and do NOT
  translate it as a free-floating block (it will cross other features — on the lizard it
  slid over the EYE). The part must vanish **exactly at the opening**:
  - Measure the opening's line in the art (the lip stroke — probe dark runs per column,
    fit the diagonal). The stroke itself STAYS IN THE BODY; it never moves.
  - Wrap the sprite in a container with a **`clip-path` polygon whose edge follows that
    line** (offset so the resting sprite is untouched). Animate `translateY` up; the
    part disappears progressively AT the lip, like entering the mouth slit. It can never
    appear above the line, over the face, or over the eye.
  - Attached fluids (drool) are their own layer: fade OUT during the retract, fade back
    IN after the part returns (drool re-forms; it doesn't travel across the face).
- **Orbit (fly)**: keyframe `translate()` through 6-8 waypoints forming a CLOSED loop
  (start==end). Uneven %-spacing gives natural speed variation ("zoom"). `ease-in-out`.
- **Motion blur**: keyframe `filter: blur()` alongside the transform — small (0.4px
  rest) rising to ~1.5px on the fast segments. Reads as speed; keep subtle on small
  sprites. This is the go-to for anything that "zooms."
- **Contact shadow**: a floating object's ground shadow must NOT drift or squash
  sideways. Use UNIFORM `scale()` about its own center, synced to height: object up →
  shadow smaller + lighter; object settles → larger + darker. Never `scaleX`-only.
- **Emergence physics**: rain drops render in front, FORM at the belly lip (fade in at
  the source, not mid-face), fall, and FADE OUT above the ground shadow (never fall
  behind/into the ground — splatter or vanish before contact).

### Seamless loop math (or it "abruptly restarts")
- Pick a loop length L. Make EVERY animation's period an integer divisor of L
  (e.g. L=6s: bob 3s, blink 3s, orbit 6s, rain 1.5s).
- Every keyframe track must have **start state == end state** (author full cycles:
  0%→50%→100% returns home; not CSS `alternate`, whose home is at 2×duration).
- Staggered elements: use NEGATIVE `animation-delay` (not positive) so they realign at
  L. Positive delays desync the loop boundary.
- **Headroom**: any motion that moves a layer toward a frame edge needs PADDING or it
  clips (the cloud's up-bob shaved the top puff). Wrap the art in a padded stage; give
  ~15-24px margin, more than the max excursion. Verify the topmost/edge content stays
  inside at the motion's extreme frame.

### Deterministic capture (seek-safe, per project memory on WebKit/WAAPI)
- Puppeteer + local Chrome, `deviceScaleFactor: 4`, viewport = the PADDED stage size
  (capture the full page at native size — do NOT `transform: scale()` the stage and then
  hard-crop; that overflow-crop is what clipped edges).
- Pause all animations, then set `document.getAnimations().forEach(a => a.currentTime =
  t)` for t = 0..L stepping 100ms; screenshot each. Infinite animations wrap currentTime
  correctly, so t=L reproduces t=0.
- **Prove the loop**: assert frame(0) == frame(L) pixel-for-pixel (`ImageChops.difference`
  max == 0). This is the objective seamless-loop test.

### Verify in the shipping renderer (the project's verification contract)
- Inspect FROM THE RENDER, over a neutral gray background so residue/artifacts show
  (near-black hides them). Zoom the specific areas: reconstructed regions, edges at
  motion extremes, the blink-closed frame, the part-removed frame.
- Build a frame strip across the loop + individual key-moment frames. Measure, don't
  eyeball, for edge-clipping and drift (min/max content coordinates per frame).

### Encode
- MP4 for iMessage: `-c:v libx264 -pix_fmt yuv420p -profile:v high -crf 20 -movflags
  +faststart`, `-stream_loop 2` for 3 seamless loops. Even dimensions. Preserve the
  art's aspect ratio (don't force-crop). ~150-300KB is typical.
- GIF: `palettegen=stats_mode=diff` then `paletteuse=dither=bayer:bayer_scale=4`.

---

## 4. Error post-mortem (things that actually went wrong — don't repeat)

- **Blue residue on the belly**: baked-in original drop pixels + AA halos the mask missed.
  Fix = flat/contour-fill the whole region, don't surgically carve; assert zero residue.
- **Ragged reconstructed edge**: per-column fill to a stepped contour. Fix = polynomial
  fit + analytic AA.
- **Drops behind the body / ghosting on the belly**: wrong z-order + fade-in on the face.
  Fix = match the ORIGINAL art's depth order; form drops at the source lip.
- **Shadow "moving around"**: `scaleX`-only pulse. Fix = uniform centered scale.
- **Clipped edges**: scaled stage overflow + hard crop, AND motion with no headroom.
  Fix = native-size capture + padded stage sized above the motion excursion.
- **Wrong feature animated**: didn't identify the eye vs nostril vs mouth first. Fix =
  the §0 anatomy pass, stated explicitly.
- **Blinked by squashing the eyeball**: eyes don't compress in reality. Fix = a
  skin-colored eyelid sprite sweeping down over a static eye (§3 Blink).
- **Wrong-colored halo around a sprite**: naive extraction kept the baked-in AA blend
  with the old neighbor. Fix = carry the keyline, exclude the pale fringe, defringe,
  feather, and VERIFY over the real new background (§1 sprite hygiene check).

---

## 5. Files / where things live
- Working examples: `scratchpad/cloud-anim/` (cloud) and `scratchpad/lizard-anim/`
  (bearded dragon) — each has `*.html`, layer PNGs, `capture.js`, and the encoded
  mp4/gif.
- Recolor sheets + baked variants: `scratchpad/colorways-pets*`, `scratchpad/recolors`.
- To wire into the app: colorway recipe (base art id + palette targets + assigned
  rarity) in the catalog; runtime canvas recolor pass; animated pet card uses the same
  layer+CSS approach; shinies get glow + sparkle tag.
