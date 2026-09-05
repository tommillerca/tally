#!/usr/bin/env python3
"""Build the per-species morph PNG variants: assets/bh/C/morph/<species>__<morph>.png.

Kennel palettes, 2026-09-05. Tom's ruling: morphs are PER-SPECIES Cam-faithful
palettes shipped as PNG variants; the CSS filter table (js/app.js MORPH_TINT)
is replaced. Method matched to the approved mockup
(scratchpad/kennel/work/recolor-morphs.py, scratchpad/kennel/palette-table.md
in the integ2 worktree), adapted to write real repo assets at each master's
OWN resolution (C6 ships a 2048 master; the mockup resized it to 640 for a
uniform review sheet, which this script never does -- Cam's art is never
degraded, rule 0.7 / PRODUCT.md rule 1).

  1. Protect Cam's ink + whites: outline (luminance<0.22) and eye-white/teeth/
     highlight-ink (V>0.85 & S<0.18) are copied byte-identical from source in
     every morph. Never touched.
  2. Cluster the remaining (body/fill) pixels into hue families by a weighted
     hue histogram (peak-pick + one circular-mean refinement -- k-means on
     the hue circle, same idea as scripts/football-masks.py's clustering).
  3. Each morph has ONE fixed ABSOLUTE target hue (ember 14deg, frost 200deg,
     toxic 98deg, midnight 254deg), not a rotation delta -- the fix for
     "ember reads blue on the Beardie": a global hue-rotate's OUTPUT hue
     depends on the INPUT hue, an absolute target does not.
  4. Every cluster is remapped to that target hue; saturation is stretched
     proportionally to the cluster's own saturation structure (relative
     shading survives); V is preserved pixel-for-pixel (shading survives),
     except midnight's three luminance tiers, which re-anchor the cluster's
     median V to 0.60 / 0.75 / 0.85 so Tom can pick one (MIDNIGHT_TIER,
     js/pets.js).
  5. A per-cluster "highlight band" (that cluster's own brightest ~18% of V)
     gets an extra hue/sat nudge per morph -- Cam's own shading decides WHICH
     pixels are the highlight; this script never paints a new highlight shape.

Idempotent. Run after any master art changes: python3 scripts/build-pet-morphs.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'bh', 'C')
OUT = os.path.join(SRC, 'morph')

SPECIES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']
# midnight ships three luminance tiers, not one -- Tom, 2026-09-05: the tier is
# not decided yet, so all three are built and MIDNIGHT_TIER (js/pets.js) picks
# the served file with a one-line change.
MORPHS = ['ember', 'frost', 'toxic', 'midnight-dark', 'midnight-medium', 'midnight-dusk']


# ---------- vectorised HSV (same shape as docs/pet-colorways-v3/recolor_v3.py) ----------
def rgb_to_hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a[..., :3].max(-1); mn = a[..., :3].min(-1); d = mx - mn
    v = mx
    s = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    h = np.zeros_like(v)
    m = (mx == r) & (d > 0); h[m] = ((g - b)[m] / d[m]) % 6
    m = (mx == g) & (d > 0); h[m] = ((b - r)[m] / d[m]) + 2
    m = (mx == b) & (d > 0); h[m] = ((r - g)[m] / d[m]) + 4
    return h / 6.0, s, v


def hsv_to_rgb(h, s, v):
    i = np.floor(h * 6).astype(int) % 6
    f = h * 6 - np.floor(h * 6)
    p = v * (1 - s); q = v * (1 - f * s); t = v * (1 - (1 - f) * s)
    out = np.zeros((*h.shape, 3), np.float32)
    for idx, (rr, gg, bb) in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        m = (i == idx)
        out[..., 0][m] = rr[m]; out[..., 1][m] = gg[m]; out[..., 2][m] = bb[m]
    return out


def circ_dist_deg(a, b):
    d = np.abs(a - b) % 360
    return np.minimum(d, 360 - d)


def find_clusters(h_deg, weight, max_k=3, min_frac=0.06):
    """Weighted hue-histogram peak pick + one circular-mean refinement."""
    total = weight.sum()
    if total <= 0:
        return []
    hist, edges = np.histogram(h_deg, bins=72, range=(0, 360), weights=weight)
    centres = edges[:-1] + 2.5
    order = np.argsort(hist)[::-1]
    peaks = []
    for i in order:
        c = centres[i]
        if hist[i] / total < min_frac:
            break
        if any(circ_dist_deg(c, p) < 40 for p in peaks):
            continue
        peaks.append(float(c))
        if len(peaks) >= max_k:
            break
    refined = []
    for p in peaks:
        m = circ_dist_deg(h_deg, p) < 40
        w = weight[m]
        if w.sum() <= 0:
            refined.append(p); continue
        ang = np.deg2rad(h_deg[m])
        mean = np.rad2deg(np.arctan2((np.sin(ang) * w).sum(), (np.cos(ang) * w).sum())) % 360
        refined.append(float(mean))
    return refined


MORPH_HUE = {"ember": 14.0, "frost": 200.0, "toxic": 98.0,
             "midnight-dark": 254.0, "midnight-medium": 254.0, "midnight-dusk": 254.0}
MORPH_SAT = {"ember": 0.80, "frost": 0.40, "toxic": 0.82,
             "midnight-dark": 0.55, "midnight-medium": 0.50, "midnight-dusk": 0.42}
MIDNIGHT_V_ANCHOR = {"midnight-dark": 0.60, "midnight-medium": 0.75, "midnight-dusk": 0.85}
# highlight-band tuning: (hue target, sat target, is "whiten")
MORPH_HI = {
    "ember":            (36.0, 0.92, False),
    "frost":            (198.0, 0.10, True),
    "toxic":            (66.0, 0.95, False),
    "midnight-dark":    (232.0, 0.30, False),
    "midnight-medium":  (232.0, 0.28, False),
    "midnight-dusk":    (232.0, 0.24, False),
}


def recolor(im, morph):
    a = np.asarray(im).astype(np.float32) / 255.0
    rgb, alpha = a[..., :3], a[..., 3]
    h, s, v = rgb_to_hsv(rgb)
    L = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]

    opaque = alpha > 0.05
    outline = opaque & (L < 0.22)
    white = opaque & (v > 0.85) & (s < 0.18)          # eye-white / teeth / Cam's ink highlight dots
    protect = outline | white
    body = opaque & ~protect

    h_deg = (h * 360.0) % 360.0
    weight = (s * v * body.astype(np.float32))
    peaks = find_clusters(h_deg[body], weight[body]) if body.sum() else []
    if not peaks:
        peaks = [0.0]

    h2, s2, v2 = h.copy(), s.copy(), v.copy()
    target_hue = MORPH_HUE[morph]
    target_sat = MORPH_SAT[morph]
    hi_hue, hi_sat, hi_white = MORPH_HI[morph]

    assign = np.full(h_deg.shape, -1, dtype=np.int32)
    if body.sum():
        idxs = np.stack([circ_dist_deg(h_deg, p) for p in peaks], axis=0)
        nearest = np.argmin(idxs, axis=0)
        assign = np.where(body, nearest, -1)

    for ci, p in enumerate(peaks):
        cmask = assign == ci
        if not cmask.sum():
            continue
        cluster_s = s[cmask]
        cluster_v = v[cmask]
        med_s = float(np.median(cluster_s)) or 1e-6
        med_v = float(np.median(cluster_v))

        stretch = target_sat / med_s
        s2[cmask] = np.clip(cluster_s * stretch, 0, 1)
        h2[cmask] = target_hue / 360.0

        if morph.startswith('midnight'):
            anchor = MIDNIGHT_V_ANCHOR[morph]
            lo, hi = float(cluster_v.min()), float(cluster_v.max())
            above = np.clip((cluster_v - med_v) / max(hi - med_v, 1e-6), 0, 1)
            below = np.clip((med_v - cluster_v) / max(med_v - lo, 1e-6), 0, 1)
            floor = max(anchor - 0.28, 0.05)
            ceil = min(anchor + 0.30, 0.98)
            new_v = np.where(cluster_v >= med_v, anchor + above * (ceil - anchor), anchor - below * (anchor - floor))
            v2[cmask] = new_v

        hi_thresh = np.quantile(cluster_v, 0.82)
        himask = cmask & (v >= hi_thresh)
        if hi_white:
            v2[himask] = np.clip(v[himask] * 1.05 + 0.05, 0, 1)
            s2[himask] = np.minimum(s2[himask], hi_sat)
            h2[himask] = hi_hue / 360.0
        else:
            h2[himask] = hi_hue / 360.0
            s2[himask] = np.clip(np.maximum(s2[himask], hi_sat), 0, 1)

    out_rgb = hsv_to_rgb(h2, s2, v2)
    out = np.dstack([out_rgb, alpha])
    out[protect] = a[protect]   # ink + whites pasted back byte-identical
    out_img = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGBA')

    outline_luma = float((L[outline] * 255).mean()) if outline.sum() else None
    return out_img, dict(outline_luma=round(outline_luma, 1) if outline_luma is not None else None,
                          white_px=int(white.sum()))


def main():
    os.makedirs(OUT, exist_ok=True)
    made = 0
    total_bytes = 0
    per_tier_bytes = {}
    for sp in SPECIES:
        im = Image.open(os.path.join(SRC, f'{sp}.png')).convert('RGBA')
        for morph in MORPHS:
            out_img, checks = recolor(im, morph)
            dst = os.path.join(OUT, f'{sp}__{morph}.png')
            out_img.save(dst, optimize=True)
            n = os.path.getsize(dst)
            total_bytes += n
            per_tier_bytes.setdefault(morph, []).append(n)
            made += 1
            print(f'wrote {sp}__{morph}.png  {im.size[0]}x{im.size[1]}  {n} bytes  '
                  f'outline_luma={checks["outline_luma"]}')
    print(f'\n{made} files, {total_bytes} bytes ({total_bytes / 1048576:.2f} MB) in {OUT}')
    for morph, sizes in per_tier_bytes.items():
        print(f'  {morph}: {len(sizes)} files, avg {sum(sizes) / len(sizes):.0f} bytes')
    if not made:
        raise SystemExit('NOTHING WRITTEN: that is a failure, not a clean run.')


if __name__ == '__main__':
    main()
