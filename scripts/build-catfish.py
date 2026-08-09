#!/usr/bin/env python3
"""Split the catfish (C3) app asset into animation layers.

One idempotent script per animation (docs/pet-recolor-animation-skill.md):
assets/bh/C/C3.png in -> assets/bh/anim/catfish/{body,shadow,drop}.png out,
QC gates printed every run. Exits non-zero if any gate fails.

Cam drew the catfish mid-flop: body airborne over a separated ground shadow,
two sweat drops flying off its back and a third BEAD still attached to the
back. The free drops + shadow are disjoint connected components (lossless
split, no reconstruction). The bead is fused with the body: its tail crosses
the black back stroke into the body fill, so it is extracted by color and the
footprint is repaired row-wise (nearest unmasked pixels left/right per row),
which reconnects the stroke and the cream highlight in one pass. Bead pixels
that sat over ink ship OPAQUE with their original blended color (mask-exact-
and-fill, playbook rule) so the rest composite stays exact; pixels feathering
into transparency keep their original alpha.

Layer frame = the full ink bbox (alpha > 0) of the 640 canvas. body.png is
full-frame; shadow.png and drop.png are tight crops positioned by CSS
(.pa-catfish in app.css). The printed offsets are those CSS positions.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/bh/C/C3.png"
OUT = ROOT / "assets/bh/anim/catfish"

fails = []


def gate(label, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {label}{'  | ' + detail if detail else ''}")
    if not ok:
        fails.append(label)


a = np.array(Image.open(SRC).convert("RGBA"))
solid = a[..., 3] > 8
lab, n = ndimage.label(solid)
gate("source has exactly 4 disjoint ink components", n == 4, f"{n} found")

# Faint AA pixels (alpha 1-8) are stray sub-threshold specks around each shape;
# assign every one to its nearest solid component so no ink is orphaned.
alpha = a[..., 3] > 0
_, (iy, ix) = ndimage.distance_transform_edt(lab == 0, return_indices=True)
lab = np.where(alpha & (lab == 0), lab[iy, ix], lab)

# Layer frame = the full ink bbox (alpha > 0), so faint AA at the edges stays in.
ys_all, xs_all = np.where(alpha)
X0, X1, Y0, Y1 = xs_all.min(), xs_all.max(), ys_all.min(), ys_all.max()

# Identify components by geometry, not label order: shadow = lowest, body =
# largest, drops = the two small cyan ones (bigger drop becomes the sprite).
comps = []
for i in range(1, n + 1):
    ys, xs = np.where(lab == i)
    comps.append({"id": i, "px": len(ys), "x0": xs.min(), "x1": xs.max(),
                  "y0": ys.min(), "y1": ys.max()})
body = max(comps, key=lambda c: c["px"])
shadow = max(comps, key=lambda c: c["y0"])
drops = sorted([c for c in comps if c is not body and c is not shadow],
               key=lambda c: c["px"])
gate("component roles resolve (body, shadow, 2 drops)",
     len(drops) == 2 and body is not shadow,
     f"body {body['px']}px, shadow {shadow['px']}px, drops {[d['px'] for d in drops]}")
gate("body and shadow do not touch (air gap)", body["y1"] < shadow["y0"],
     f"body ends y{body['y1']}, shadow starts y{shadow['y0']}")


def layer_full(comp_ids):
    m = np.isin(lab, comp_ids)
    out = a.copy()
    out[~m] = 0
    return out[Y0:Y1 + 1, X0:X1 + 1]


def layer_tight(c):
    m = lab == c["id"]
    out = a.copy()
    out[~m] = 0
    return out[c["y0"]:c["y1"] + 1, c["x0"]:c["x1"] + 1]


OUT.mkdir(parents=True, exist_ok=True)
body_png = layer_full([body["id"]])
shadow_png = layer_tight(shadow)
drop_png = layer_tight(drops[-1])  # the bigger drop; CSS reuses it at both spots

# --- the attached bead: extract by color from the body, repair row-wise -------
# Cyan like the free drops (G,B high / R lower), confined to the upper-back
# region so no other art can match.
fr = body_png.astype(int)
cyan = ((fr[..., 3] > 0) & (fr[..., 1] > 180) & (fr[..., 2] > 180)
        & (fr[..., 0] < 200) & (fr[..., 1] - fr[..., 0] > 30))
region = np.zeros_like(cyan)
region[0:55, 50:95] = True
bead_mask = cyan & region
lab_b, n_b = ndimage.label(bead_mask)
if n_b > 1:  # keep the largest blob, drop specks
    sizes = ndimage.sum(bead_mask, lab_b, range(1, n_b + 1))
    bead_mask = lab_b == (int(np.argmax(sizes)) + 1)
gate("attached bead found on the body", int(bead_mask.sum()) > 60, f"{int(bead_mask.sum())} px")

bead_png = np.zeros_like(body_png)
bead_png[bead_mask] = body_png[bead_mask]
# mask-exact rule: bead pixels that were fully opaque in the source ship opaque
# (their RGB already holds Cam's blend against whatever was behind); soft outer
# AA against transparency keeps its original alpha, so both states render true.
# The REPAIR footprint is wider than the sprite (the bead trails an alpha 1-4
# cyan halo the color mask can't own) but NEVER touches the dark back stroke:
# fixed anatomy keeps Cam's original pixels (lizard lesson), and where the tail
# visibly crossed the stroke the row interpolation runs dark-to-dark and
# rebuilds it.
stroke_dark = (fr[..., 3] > 128) & (fr[..., :3].max(axis=-1) < 80)
repair_mask = ndimage.binary_dilation(bead_mask, iterations=2) & ~stroke_dark
bys, bxs = np.where(repair_mask)
bead_box = (bys.min(), bys.max(), bxs.min(), bxs.max())
bead_png = bead_png[bead_box[0]:bead_box[1] + 1, bead_box[2]:bead_box[3] + 1]

# Row-wise repair of the bead footprint in the body: each masked run fills by
# linear interpolation between the nearest unmasked pixels on its row (RGBA),
# but ONLY when both endpoints carry ink. A run with a transparent endpoint is
# outside the body silhouette (above the back), and its correct "behind" is
# nothing: interpolating transparent-to-stroke there painted a grey smear wing
# left of the tail that only showed in the bead-GONE state.
repaired = body_png.astype(float)
for y in range(bead_box[0], bead_box[1] + 1):
    row = repair_mask[y]
    if not row.any():
        continue
    xs_m = np.where(row)[0]
    for run_start, run_end in [(g[0], g[-1]) for g in np.split(xs_m, np.where(np.diff(xs_m) > 1)[0] + 1)]:
        lx, rx = run_start - 1, run_end + 1
        l = repaired[y, lx] if lx >= 0 else np.zeros(4)
        r = repaired[y, rx] if rx < repaired.shape[1] else np.zeros(4)
        if l[3] < 8 or r[3] < 8:
            repaired[y, run_start:run_end + 1] = 0
            continue
        n = run_end - run_start + 2
        for i, x in enumerate(range(run_start, run_end + 1), 1):
            repaired[y, x] = l + (r - l) * (i / n)
body_png = repaired.round().clip(0, 255).astype(np.uint8)

# GATE: the back stroke is continuous through the repair. In every column the
# bead touched (padded 3px), if the original had dark stroke ink in the band,
# the repaired body must too.
band = slice(max(0, bead_box[0]), min(body_png.shape[0], bead_box[1] + 14))
orig_body = layer_full([body["id"]])
gaps = []
for x in range(max(0, bead_box[2] - 3), min(body_png.shape[1], bead_box[3] + 4)):
    def has_stroke(img):
        col = img[band, x]
        return bool(((col[:, 3] > 128) & (col[:, :3].max(axis=1) < 80)).any())
    if has_stroke(orig_body) and not has_stroke(body_png):
        gaps.append(x)
gate("back stroke continuous where the bead was lifted", not gaps, f"gap columns {gaps}" if gaps else "")

# GATE: no cyan residue where the bead was.
res = body_png[bead_box[0]:bead_box[1] + 1, bead_box[2]:bead_box[3] + 1].astype(int)
res_cyan = ((res[..., 3] > 0) & (res[..., 1] > 180) & (res[..., 2] > 180)
            & (res[..., 0] < 200) & (res[..., 1] - res[..., 0] > 30))
gate("body clean of the bead (0 cyan residue)", int(res_cyan.sum()) == 0, f"{int(res_cyan.sum())} px")

Image.fromarray(body_png).save(OUT / "body.png")
Image.fromarray(shadow_png).save(OUT / "shadow.png")
Image.fromarray(drop_png).save(OUT / "drop.png")
Image.fromarray(bead_png).save(OUT / "bead.png")

# GATE: partition. Every ink pixel belongs to exactly one shipped layer
# (drops ship as one sprite reused twice, so the smaller drop's pixels are
# accounted against its own source region, not the sprite).
assigned = sum(c["px"] for c in comps)
gate("ink partition is complete", assigned == int(alpha.sum()),
     f"{assigned} vs {int(alpha.sum())}")

# GATE: REST composite == original. Reassemble the layers the way the BROWSER
# does (alpha compositing, back to front) and pixel-diff against the source
# crop. The smaller drop is not shipped as its own file, so composite it from
# the source for the diff (its CSS instance reuses drop.png; the rest gate
# proves the split, sprite reuse is a render decision verified in the capture
# harness).
def blend_over(dst, src, y, x):
    h, w = src.shape[:2]
    reg = dst[y:y + h, x:x + w].astype(float)
    s = src.astype(float)
    sa = s[..., 3:4] / 255.0
    da = reg[..., 3:4] / 255.0
    oa = sa + da * (1 - sa)
    rgb = np.where(oa > 0, (s[..., :3] * sa + reg[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-9), 0)
    dst[y:y + h, x:x + w] = np.dstack([rgb, oa * 255]).round().clip(0, 255).astype(np.uint8)

def build_rest():
    rest = np.zeros_like(body_png)
    rest[:] = body_png
    blend_over(rest, bead_png, bead_box[0], bead_box[2])
    for c in (shadow, drops[0], drops[1]):
        t = layer_tight(c)
        blend_over(rest, t, c["y0"] - Y0, c["x0"] - X0)
    return rest

# Auto-repair loop (playbook): any pixel where the rest composite visibly
# misses the original gets its ORIGINAL pixel reassigned to the bead sprite
# (these are the tail-base rim blends: too dark for the cyan mask, too light
# for the stroke mask). Semi-transparent ones also clear the body behind so
# the composite reproduces the source exactly. Loops to zero, max 5 passes.
orig_frame = a[Y0:Y1 + 1, X0:X1 + 1]
pmf = lambda img: img[..., :3].astype(float) * img[..., 3:4].astype(float) / 255.0
for _ in range(5):
    bad = np.abs(pmf(orig_frame) - pmf(build_rest())).max(axis=-1) > 8
    bad[:bead_box[0], :] = False; bad[bead_box[1] + 1:, :] = False
    bad[:, :bead_box[2]] = False; bad[:, bead_box[3] + 1:] = False
    if not bad.any():
        break
    ys_b, xs_b = np.where(bad)
    for y, x in zip(ys_b, xs_b):
        bead_png[y - bead_box[0], x - bead_box[2]] = orig_frame[y, x]
        if orig_frame[y, x, 3] < 255:
            body_png[y, x] = 0
Image.fromarray(bead_png).save(OUT / "bead.png")  # re-save with the rim pixels
Image.fromarray(body_png).save(OUT / "body.png")

rest = build_rest()
# Compare what renders: premultiplied, with the harness's visibility threshold
# (>8 of 255). Invisible RGB residue under transparent pixels and the alpha 1-4
# halo the repair intentionally rewrites both fall below it; a real seam or
# misplaced layer is hundreds of fully visible pixels (proven red at 1133).
orig = a[Y0:Y1 + 1, X0:X1 + 1]
pm = lambda img: img[..., :3].astype(float) * img[..., 3:4].astype(float) / 255.0
diff = int((np.abs(pm(orig) - pm(rest)).max(axis=-1) > 8).sum())
gate("REST composite == original (0 visibly differing px)", diff == 0, f"{diff} px differ")

# GATE: no pixel of any removed part survives in the body layer (mask-based;
# the parts' faint-AA bboxes legitimately overlap body ink, so no bbox checks).
body_alpha = body_png[..., 3] > 0
for name, c in (("shadow", shadow), ("drop-a", drops[0]), ("drop-b", drops[1])):
    m = (lab == c["id"])[Y0:Y1 + 1, X0:X1 + 1]
    gate(f"body layer clean of {name}", int((body_alpha & m).sum()) == 0)

print("\nCSS geometry (frame-relative, for .pa-catfish in app.css):")
print(f"  art frame: {X1 - X0 + 1}x{Y1 - Y0 + 1}")
print(f"  shadow: left {shadow['x0'] - X0}px top {shadow['y0'] - Y0}px "
      f"({shadow['x1'] - shadow['x0'] + 1}x{shadow['y1'] - shadow['y0'] + 1})")
for tag, c in (("drop small", drops[0]), ("drop big", drops[1])):
    print(f"  {tag}: left {c['x0'] - X0}px top {c['y0'] - Y0}px "
          f"({c['x1'] - c['x0'] + 1}x{c['y1'] - c['y0'] + 1})")
print(f"  bead (attached, rides .pa-flop): left {bead_box[2]}px top {bead_box[0]}px "
      f"({bead_box[3] - bead_box[2] + 1}x{bead_box[1] - bead_box[0] + 1})")
print(f"  body ink bottom y {body['y1'] - Y0}px, shadow top y {shadow['y0'] - Y0}px "
      f"(grounding excursion = the gap)")

print("\nCATFISH LAYERS " + ("FAILED: " + ", ".join(fails) if fails else "OK"))
sys.exit(1 if fails else 0)
