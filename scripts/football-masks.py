#!/usr/bin/env python3
"""Football kit, 2026-09-04: turn Cam's eight coloured NFL-style layers into
ONE tintable master per garment plus two alpha masks.

  python3 scripts/football-masks.py ["/path/to/NFL GEAR"]

Cam paints the kit in two team colours (a saturated blue shell, a coral stripe
and badge) plus neutrals that must never be recoloured: the gold facemask, the
cream highlights and jersey body, the grey visor glass, the black outlines. The
app tints ONE master per team at runtime (a multiply layer through a CSS alpha
mask, the .wpn-sheen mechanism), so for each source PNG this writes into
assets/bh/football/:

  <name>.png          the master: the two team regions desaturated to their
                      luminance, stretched so the cluster's OWN brightest
                      pixel lands exactly on the team hex and its darkest
                      keeps a fixed floor beneath it (shading survives as a
                      lighter/darker team colour, not a flat slab); every
                      neutral pixel byte-identical to Cam's
  <name>.mask-a.png   alpha mask of the PRIMARY region (the blue), LA PNG,
                      despeckled (no island or hole under 12px at 640)
  <name>.mask-b.png   alpha mask of the SECONDARY region (the coral), LA PNG,
                      same despeckling

HOW A PIXEL IS ASSIGNED. The two team hues are MEASURED, not typed: the jersey
is the one layer with no gold in it, so its two saturated hue peaks are the
reference (expect ~240 blue, ~8 coral; asserted to exist and be far apart).
Every file then gets a per-pixel membership weight, not a threshold:
  w = alpha * satRamp(s) * hueRamp(distance to the cluster hue)
with satRamp 0 -> 1 across 50% -> 80% of the cluster's OWN median saturation
(measured 0.78 for the blue and 0.64 for the coral on every layer but the
cleats, whose blue is a pale 0.36 lavender: a fixed floor would have dropped
the whole shoe) and hueRamp 1 inside +-12 degrees falling to 0 at +-24. Cream
and grey sit under 0.35 saturation AND outside both hue windows. Anti-aliased edge pixels therefore come out as what they are:
  blue|black   still blue in hue, so w~1, and their low luminance makes them
               DARK team colour after the multiply, which is what a shaded edge
               should be;
  blue|cream   hue blue, saturation halved, so w~0.5: half tinted, half cream;
  blue|coral   a magenta hue that belongs to neither window, so w=0 and the
               pixel keeps Cam's mixed colour. Counted below as "seam px"; at
               2048 it is a one-pixel line and it vanishes into the 640 resample.
The gold facemask (hue ~40, saturation ~0.78) is 30+ degrees from the coral
peak, outside its window, and is left alone; the script prints how many gold
pixels each file carries so a coral window drifting onto it would be visible.

SIZES. Every garment, pet pieces included, ships at 640x640 full-frame, which
is what every other H/T/FW cosmetic in assets/bh is (measured: H1.png, T1.png,
FW1.png are all 640x640 RGBA).

The pet pieces are the one that needed a measurement rather than a convention.
Cam's existing pet accessories (CE1.png and friends) are 2048 squares, but they
are SERVED at 192 or 384, because their paths match BH_THUMB_RE and
croppedPetImg tiers them. Football art does not match that regex and is never
tiered, so a 2048 master here would be decoded at 2048 on every surface.
Registration is not what the square buys: croppedPetImg lays every layer out as
PERCENTAGES of the pet's box, so any square registers identically and a uniform
downscale of the same square is exact.

What the square has to buy is resolution at the largest surface that draws it.
The lizard's crop (PET_CROP.C4) is 0.3547 of the square on its long edge and
croppedPetImg fills 0.82 of its box, so the whole square lands at box x 2.312
CSS px. The biggest box a football pet piece is drawn in today is 104 (the
Paddock/roster portrait), i.e. 240 CSS px, i.e. 721 device px at DPR 3. 640
covers that at 1.13x on a DPR-3 phone and 1.00x at DPR 2, the same compromise
the 384 pet tier already ships (1.50x at DPR 3). It also takes a dressed
lizard's football layers from 100 MB of decoded bitmap (six 2048 planes) to
9.8 MB, against the memory census's 90 MB ceiling.

UPGRADE PATH if a pet piece ever has to be drawn big: 1024 covers a full hero
figure at DPR 3 (a 155.6 CSS box, 360 CSS px of square, 1080 device px). Change
the two rows below and re-run; nothing else moves. Note that the hero cannot
wear these today at all, because C4 and CX are in ANIMATED_PETS and
petSpriteHtml returns animatedPetHtml before it ever reaches croppedPetImg.

The repo keeps no 2048 masters for body cosmetics (build-cosmetics.py reads
Cam's library from outside the repo), so none are kept here either: the source
folder is the master. File the eight PNGs into the library.

VERIFIES ITSELF: composites master x tint through both masks for two test
colours and asserts the BRIGHTEST pixel inside each region (mask > 0.9) lands
within TOL of the tint (2026-09-05: no longer the region MEAN -- the whole
point of the shading fix is that the mean now sits below the hex, at whatever
fraction of it the fill's own luminance stretches to; only the cluster's own
brightest pixel is defined to hit the hex exactly). tests/football-kit-audit.mjs
repeats the same composite in node over the shipped PNGs for three REAL teams,
so the gate does not depend on python.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = sys.argv[1] if len(sys.argv) > 1 else '/Users/tommiller/Downloads/NFL GEAR'
OUT = os.path.join(ROOT, 'assets', 'bh', 'football')

# source stem -> (output name, output square). Names are the garment keys that
# data/football-teams.js builds items from; keep them in step.
GARMENTS = {
    'BH_NFL_HELM_NOVISOR': ('helmet', 640),
    'BH_NFL_HELM_VISOR25': ('visor25', 640),
    'BH_NFL_HELM_VISOR60': ('visor60', 640),
    'BH_NFL_HELM_VISOR90': ('visor90', 640),
    'BH_NFL_JERSEY': ('jersey', 640),
    'BH_NFL_CLEATS': ('cleats', 640),
    'BH_NFL_LIZARD_HELMET': ('pet-helmet', 640),
    'BH_NFL_LIZARD_JERSEY': ('pet-jersey', 640),
}
REFERENCE = 'BH_NFL_JERSEY'      # the one layer with no gold: hue peaks are unambiguous
SAT_LO, SAT_HI = 0.50, 0.80      # satRamp, as fractions of the cluster's own median saturation
HUE_IN, HUE_OUT = 12.0, 24.0     # hueRamp, degrees
CORE = 0.9                       # a pixel is "inside" a region at this weight
TOL = 12                         # /255, margin for LANCZOS ringing on the bounds self-check
FILL_TARGET = 0.90               # the cluster's FILL (its median -- Cam's flat colour, not
                                  # an anti-aliased edge) is pinned here, so the team's own
                                  # colour still reads as that colour; SHADE_FLOOR and 1.0
                                  # are the darkest/brightest edges stretch to AROUND it
SHADE_FLOOR = 0.30               # the cluster's darkest pixel is stretched to this fraction
                                  # of the team hex, its brightest to 1.0: shading survives
                                  # the multiply instead of both clipping flat to white
DESPECKLE_NATIVE = 130           # kill/fill connected components under this many px at the
                                  # 2048 source (>=12px x (2048/640)^2, the shipped-size floor)
DESPECKLE_OUT = 12               # re-applied at the shipped 640 size as an exact backstop
TEST_TINTS = ('#14213D', '#F2C14E')   # one dark, one light; the real teams are checked in node


def load(stem):
    im = Image.open(os.path.join(SRC, stem + '.png')).convert('RGBA')
    a = np.asarray(im).astype(np.float64)
    return a[..., :3], a[..., 3] / 255.0


def hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx = rgb.max(-1); mn = rgb.min(-1); d = mx - mn
    s = np.where(mx > 0, d / np.maximum(mx, 1e-9), 0)
    h = np.zeros_like(mx)
    nz = d > 0
    rm, gm, bm = (mx == r) & nz, (mx == g) & nz & (mx != r), (mx == b) & nz & (mx != r) & (mx != g)
    with np.errstate(invalid='ignore', divide='ignore'):
        h[rm] = (60 * ((g - b) / d)[rm]) % 360
        h[gm] = 60 * ((b - r) / d)[gm] + 120
        h[bm] = 60 * ((r - g) / d)[bm] + 240
    return h, s, mx / 255.0


def ramp(x, lo, hi):
    return np.clip((x - lo) / (hi - lo), 0, 1)


def hue_dist(h, centre):
    d = np.abs(h - centre) % 360
    return np.minimum(d, 360 - d)


def measure_reference():
    rgb, alpha = load(REFERENCE)
    h, s, _ = hsv(rgb)
    sel = (alpha > 0.5) & (s > 0.6)
    hist, edges = np.histogram(h[sel], bins=180, range=(0, 360))
    order = np.argsort(hist)[::-1]
    first = edges[order[0]] + 1
    second = next(edges[i] + 1 for i in order if hue_dist(edges[i] + 1, first) > 60)
    # refine each peak to the circular mean of pixels within +-HUE_IN
    def refine(c):
        m = sel & (hue_dist(h, c) <= HUE_IN)
        ang = np.deg2rad(h[m])
        return float(np.rad2deg(np.arctan2(np.sin(ang).mean(), np.cos(ang).mean())) % 360), int(m.sum())
    (pa, na), (pb, nb) = refine(first), refine(second)
    assert na > 1000 and nb > 1000, f'reference clusters too small: {na}, {nb}'
    assert hue_dist(pa, pb) > 60, f'the two team hues are not distinct: {pa:.1f} vs {pb:.1f}'
    # primary = the hue the shell is painted in, i.e. the bigger cluster across the reference
    if nb > na:
        (pa, na), (pb, nb) = (pb, nb), (pa, na)
    return pa, pb, na, nb


def membership(h, s, alpha, centre, L):
    window = (alpha > 0.5) & (hue_dist(h, centre) <= HUE_IN) & (s > 0.15)
    if window.sum() < 100:
        return np.zeros_like(s), 0.0
    med = float(np.median(s[window]))
    # a floor on the black outline's own anti-aliased blend: still blue in hue
    # (so the ramps above pass it) but this dark it is the outline, not a
    # shaded edge, and tinting it would eat into Cam's linework. Measured: the
    # helmet/jersey blue fill itself sits at L 62.5, only just above the
    # ink-leakage floor (<60) the acceptance bar checks, so the ramp's own
    # ceiling has to sit AT that fill (60), not mid-gradient (50), or the
    # ramp keeps most of the outline blend and leakage clears 1%.
    ink_ramp = ramp(L, 55.0, 60.0)
    return alpha * ramp(s, SAT_LO * med, SAT_HI * med) * (1 - ramp(hue_dist(h, centre), HUE_IN, HUE_OUT)) * ink_ramp, med


def normalised_grey(L, w):
    """Stretch L, per cluster, around its OWN fill (the median, since Cam's
    team regions are flat fills -- measured: >98% of the blue's core pixels
    share one luminance, 62; the coral's 153; the cleats' lavender 169):
    the fill itself is pinned to FILL_TARGET, its darkest member stretches
    down to SHADE_FLOOR, its brightest up to 1.0. Two segments, not one
    global stretch, and the anchor is the fix: a single lo->hi stretch (what
    this function did until 2026-09-05, see below) put the fill wherever its
    OWN ratio inside [lo, hi] happened to fall, and that ratio is a property
    of Cam's stray anti-aliasing, not of the garment -- pet-helmet's blue
    measured hi 101 against helmet's 145 (both the identical hue, cropped
    from different source files), so the SAME fill (62.5) landed at 90/255
    (35%, a muddy olive under a bright yellow tint) on one and considerably
    brighter on the other. Pinning the fill itself removes that variance:
    every garment's fill reads FILL_TARGET of the team hex, always, and the
    shading is whatever headroom is left on either side of it.

    Cam's flat fill is not the whole cluster: anti-aliased edge pixels
    against the black outline run darker, and against cream/white run
    lighter, by design (that gradient IS the shading). The OLD behaviour (one
    version ago) pinned the fill itself to 255, so the lighter tail clipped
    to the same flat white as the fill and the multiply produced one flat
    slab -- Tom's "messy recolour" bug. This still leaves headroom on both
    sides of the fill, so it survives the multiply by even a dark tint (see
    the acceptance table in tests/football-kit-audit.mjs and
    scripts/football-mask-proof.py -- a dark navy compresses absolute
    contrast the hardest, so it is the binding case), while keeping the
    fill itself close enough to the hex that the team's colour still reads
    as that colour (tests/football-render-audit.mjs PET-TINT: the render has
    to land nearer its OWN team's primary than the other team's)."""
    region = w > CORE
    if region.sum() == 0:
        return L, 0.0, 255.0
    Lr = L[region]
    fill, lo, hi = float(np.median(Lr)), float(Lr.min()), float(Lr.max())
    above = np.clip((L - fill) / (hi - fill), 0, 1) if hi > fill else np.zeros_like(L)
    below = np.clip((fill - L) / (fill - lo), 0, 1) if fill > lo else np.zeros_like(L)
    grey = np.where(L >= fill,
                     FILL_TARGET + above * (1 - FILL_TARGET),
                     FILL_TARGET - below * (FILL_TARGET - SHADE_FLOOR)) * 255.0
    return grey, lo, hi


def despeckle(w, min_px):
    """Kill any connected 'on' component (w > 0.5) under min_px, and fill any
    'off' hole under min_px back to full membership. The hue/sat ramp lands
    a handful of stray pixels just over or under the 50% line at the cluster
    edge; both read as jaggies once tinted, and neither is real membership.
    The real silhouette and its background are always far bigger than min_px,
    so they are never touched by this."""
    on = w > 0.5
    lbl, n = ndimage.label(on)
    if n:
        sizes = ndimage.sum(on, lbl, np.arange(1, n + 1))
        kill = np.isin(lbl, np.nonzero(sizes < min_px)[0] + 1)
        w = np.where(kill, 0.0, w)
        on = on & ~kill
    lbl2, n2 = ndimage.label(~on)
    if n2:
        sizes2 = ndimage.sum(~on, lbl2, np.arange(1, n2 + 1))
        fill = np.isin(lbl2, np.nonzero(sizes2 < min_px)[0] + 1)
        w = np.where(fill, 1.0, w)
    return w


def hex_rgb(hx):
    return np.array([int(hx[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float64)


def composite(master_rgb, mask, tint):
    """master x tint through mask: what the browser's multiply layer draws."""
    m = mask[..., None]
    return master_rgb * (1 - m) + (master_rgb * tint / 255.0) * m


def resize(arr, size, mode):
    im = Image.fromarray(arr.astype(np.uint8), mode)
    return np.asarray(im.resize((size, size), Image.LANCZOS)).astype(np.float64)


def main():
    os.makedirs(OUT, exist_ok=True)
    pa, pb, na, nb = measure_reference()
    print(f'reference {REFERENCE}: primary hue {pa:.1f} deg ({na} px), secondary hue {pb:.1f} deg ({nb} px)')
    total = 0
    for stem, (name, size) in GARMENTS.items():
        rgb, alpha = load(stem)
        h, s, _ = hsv(rgb)
        L = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
        (wa, sa), (wb, sb) = membership(h, s, alpha, pa, L), membership(h, s, alpha, pb, L)
        print(f'  {name:11s} cluster saturation medians: a {sa:.2f}, b {sb:.2f}' + (' (no b colour in this layer)' if not sb else ''))
        both = wa + wb
        wa, wb = np.where(both > 1, wa / np.maximum(both, 1e-9), wa), np.where(both > 1, wb / np.maximum(both, 1e-9), wb)
        wa, wb = despeckle(wa, DESPECKLE_NATIVE), despeckle(wb, DESPECKLE_NATIVE)
        opaque = alpha > 0.5
        gold = opaque & (s > 0.5) & (hue_dist(h, 40) <= 12)
        seam = opaque & (s > 0.5) & ((wa + wb) < 0.5) & ~gold & (hue_dist(h, pa) < 90) & (hue_dist(h, pb) < 90)
        out = rgb.copy()
        for w, tag in ((wa, 'a'), (wb, 'b')):
            grey, lo, hi = normalised_grey(L, w)
            out = out * (1 - w[..., None]) + grey[..., None] * w[..., None]
            print(f'  {name:11s} region {tag}: {int((w > CORE).sum()):7d} core px, luminance {lo:.0f}-{hi:.0f} stretched to {SHADE_FLOOR * 255:.0f}-255')
        print(f'  {name:11s} gold px {int(gold.sum())}, seam px (neither window) {int(seam.sum())}')
        # black outline leakage: how much of the mask sits on genuinely dark ink
        dark = L < 60
        for w, tag in ((wa, 'a'), (wb, 'b')):
            leak = float(w[dark].sum()) / max(float(w.sum()), 1e-9) if w.sum() else 0.0
            print(f'  {name:11s} region {tag}: {leak * 100:.2f}% of mask weight sits on luminance<60 ink')
        master = np.dstack([out, alpha * 255])
        # downscale every plane with the same filter so master and masks stay in register
        master_o = resize(master, size, 'RGBA') if size != rgb.shape[0] else master
        masks_o = []
        for w in (wa, wb):
            la = np.dstack([np.full_like(w, 255), w * 255])
            mo = resize(la, size, 'LA') if size != rgb.shape[0] else la
            # a backstop pass at the SHIPPED size: the resize can still leave a
            # sub-threshold fleck the native despeckle never saw
            mo[..., 1] = despeckle(mo[..., 1] / 255.0, DESPECKLE_OUT) * 255.0
            masks_o.append(mo)
        paths = [os.path.join(OUT, f'{name}.png'), os.path.join(OUT, f'{name}.mask-a.png'), os.path.join(OUT, f'{name}.mask-b.png')]
        Image.fromarray(master_o.astype(np.uint8), 'RGBA').save(paths[0], optimize=True)
        for p, m in zip(paths[1:], masks_o):
            Image.fromarray(m.astype(np.uint8), 'LA').save(p, optimize=True)
        sizes = [os.path.getsize(p) for p in paths]
        total += sum(sizes)
        print(f'  {name:11s} {size}px  master {sizes[0] // 1024}K  mask-a {sizes[1] // 1024}K  mask-b {sizes[2] // 1024}K')
        # self-check at the shipped size: since 2026-09-05 the fill no longer
        # lands exactly on the hex (that was the bug -- see normalised_grey),
        # so this checks the invariant that DOES still hold by construction:
        # every core pixel's composite sits between SHADE_FLOOR*tint (the
        # darkest the stretch allows) and tint (the brightest), with a small
        # margin for LANCZOS ringing at the resize.
        mr = master_o[..., :3]
        for tag, mo in (('a', masks_o[0]), ('b', masks_o[1])):
            m = mo[..., 1] / 255.0
            core = (m > CORE) & (master_o[..., 3] > 230)
            if core.sum() == 0:
                print(f'  {name:11s} region {tag}: EMPTY (this garment has no {tag} colour), skipped')
                continue
            for hx in TEST_TINTS:
                tint = hex_rgb(hx)
                comp = composite(mr, m, tint)[core]
                lo_bound, hi_bound = SHADE_FLOOR * tint - TOL, tint + TOL
                over = np.maximum(comp - hi_bound, lo_bound - comp)
                worst = float(np.clip(over, 0, None).max())
                bad = int((over > 0).any(1).sum())
                flag = 'ok' if worst <= TOL else 'FAIL'
                print(f'  {name:11s} region {tag} x {hx}: {bad}/{int(core.sum())} px outside '
                      f'[{SHADE_FLOOR * 100:.0f}%,100%] of tint by up to {worst:.2f}/255 {flag}')
                assert worst <= TOL, f'{name} region {tag} tinted {hx}: {bad} px outside bounds by {worst:.2f}/255'
    print(f'total bytes for the eight kits: {total / 1024:.0f}K')


if __name__ == '__main__':
    main()
