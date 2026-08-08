#!/usr/bin/env python3
"""Split the catfish (C3) app asset into animation layers.

One idempotent script per animation (docs/pet-recolor-animation-skill.md):
assets/bh/C/C3.png in -> assets/bh/anim/catfish/{body,shadow,drop}.png out,
QC gates printed every run. Exits non-zero if any gate fails.

Cam drew the catfish mid-flop: body airborne over a separated ground shadow,
two sweat drops flying off its back. All four ink regions are disjoint
connected components, so the split is lossless: no background reconstruction,
REST composite == original by construction (still asserted, never assumed).

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
Image.fromarray(body_png).save(OUT / "body.png")
Image.fromarray(shadow_png).save(OUT / "shadow.png")
Image.fromarray(drop_png).save(OUT / "drop.png")

# GATE: partition. Every ink pixel belongs to exactly one shipped layer
# (drops ship as one sprite reused twice, so the smaller drop's pixels are
# accounted against its own source region, not the sprite).
assigned = sum(c["px"] for c in comps)
gate("ink partition is complete", assigned == int(alpha.sum()),
     f"{assigned} vs {int(alpha.sum())}")

# GATE: REST composite == original. Reassemble the layers at their offsets and
# pixel-diff against the source crop. The smaller drop is not shipped as its
# own file, so composite it from the source for the diff (its CSS instance
# reuses drop.png; the rest gate proves the split, sprite reuse is a render
# decision verified in the capture harness).
rest = np.zeros_like(body_png)
rest[:] = body_png
for c in (shadow, drops[0], drops[1]):
    t = layer_tight(c)
    ys, xs = c["y0"] - Y0, c["x0"] - X0
    region = rest[ys:ys + t.shape[0], xs:xs + t.shape[1]]
    keep = t[..., 3] > 0
    region[keep] = t[keep]
# Compare what renders: premultiply by alpha so invisible RGB residue under
# fully transparent pixels (present in Cam's source) doesn't count as a diff.
orig = a[Y0:Y1 + 1, X0:X1 + 1]
pm = lambda img: img[..., :3].astype(int) * img[..., 3:4].astype(int)
diff = int(((np.abs(pm(orig) - pm(rest)).sum(axis=-1) > 0)
            | (orig[..., 3] != rest[..., 3])).sum())
gate("REST composite == original (0 px visible diff)", diff == 0, f"{diff} px differ")

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
print(f"  body ink bottom y {body['y1'] - Y0}px, shadow top y {shadow['y0'] - Y0}px "
      f"(grounding excursion = the gap)")

print("\nCATFISH LAYERS " + ("FAILED: " + ", ".join(fails) if fails else "OK"))
sys.exit(1 if fails else 0)
