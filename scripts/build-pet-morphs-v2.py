#!/usr/bin/env python3
"""Pet morphs v2 (ember / frost / toxic / midnight / rose) for C1-C6.

Method (docs/pet-recolor-animation-skill.md, section 2, made region-aware):
  1. Each master is Cam's flat fills + one ink colour + anti-aliased seams. The
     fills are declared per species below (measured off the PNG), each with a
     role: recoloured region, or protected (ink, eye whites, teeth, cream, blush).
  2. Every visible pixel is explained as a blend of TWO palette entries that both
     have a flat core within R px of it (the region grown into its own AA edge).
     Pure-fill pixels are the degenerate t=0 case. No luminance threshold anywhere.
  3. Recolour = re-mix the same blend with the region's target fill. A protected
     entry's target is itself, so ink / whites / creams come out byte-identical and
     every seam is re-drawn against the new neighbour (an orange body no longer
     leaves blue AA against the ink).
  4. Targets are chosen per region per morph from five palette families, with the
     pixel's own S/V structure kept: a fill's target is hue-rotated and then S/V
     corrected toward the family, which is the playbook rule applied once per flat
     fill instead of once per pixel (identical result on flat art, and legible in a
     table).

Outputs (default scratchpad/kennel/v2 next to the repo, or $OUT_DIR): the morph
PNGs, sheet.png (2x on --surface-2), sheet-today.png (1x on Today green),
zooms.png, table.md, and, with --ship, copies straight into the live art
folder assets/bh/C/morph/ (approved v2 art, 2026-09-06 -- this is the only
morph folder now; there is no separate morph-v2/ staging copy in the tree).
"""
import os, argparse, colorsys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.ndimage import binary_dilation, label

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SRC = os.path.join(REPO, "assets", "bh", "C")
OUT = os.environ.get("OUT_DIR") or os.path.join(REPO, "..", "kennel", "v2")
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)

MORPHS = ["ember", "frost", "toxic", "midnight", "rose"]
SURFACE2 = (0x1e, 0x1c, 0x26)
TODAY_GREEN = (0x6c, 0x7b, 0x3d)      # sampled from scratchpad/proof/01-today-kit-on.png, 182646 px mode
INK = "#20201c"                        # Cam's ink, median of every master


def hsv(h, s, v):
    r, g, b = colorsys.hsv_to_rgb((h % 360) / 360.0, s, v)
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))


def rgb(hx):
    return np.array([int(hx[1:3], 16), int(hx[3:5], 16), int(hx[5:7], 16)], np.float32)


# ---------------------------------------------------------------------------
# Species palettes. Each region: list of source fills (hex) and, per morph, the
# target for each fill in order. KEEP means protected (target == source).
# Anatomy notes per species are in table.md (written below) and the report.
# ---------------------------------------------------------------------------
KEEP = "keep"

# r56 B1: mean source-core OKLab delta * 100 > 20 for all 90 pairs.
# Cold masters need frost saturation/value separation; rose stays pink, away
# from rarity cyan #6fd0ff, violet #c084fc and gold #ffc961.
SPECIES = {
 "C1": dict(name="Drizzle", scale=1, regions={
   "body":  dict(src=["#cffbff"], ember=[hsv(16,.72,.98)], frost=[hsv(208,0.72,0.92)], toxic=[hsv(82,.72,.95)], midnight=[hsv(252,.55,.50)], rose=[hsv(322,0.9,1)]),
   "drops": dict(src=["#62e6f2"], ember=[hsv(40,.85,1.0)], frost=[hsv(200,0.45,1)], toxic=[hsv(95,.85,.60)], midnight=[hsv(220,.35,.85)], rose=[hsv(335,0.9,0.65)]),
   "cream": dict(src=["#fff9dd"], keep=True),      # eye whites AND the dome highlight streaks (same fill; both stay)
   "white": dict(src=["#ffffe7"], keep=True),      # pupil specular dots
   "blush": dict(src=["#ff918d"], keep=True),
 }),
 "C2": dict(name="Mallard", scale=1, regions={
   "body":  dict(src=["#9f6b2e"], ember=[hsv(25,0.95,1)], frost=[hsv(203,.35,.85)], toxic=[hsv(82,.80,.85)], midnight=[hsv(250,.55,.45)], rose=[hsv(322,0.9,1)]),
   "head":  dict(src=["#2eb920"], ember=[hsv(12,0.95,0.7)], frost=[hsv(215,.65,.62)], toxic=[hsv(135,.85,.50)], midnight=[hsv(270,.55,.55)], rose=[hsv(335,0.85,0.7)]),
   "beak":  dict(src=["#ff7536"], ember=[hsv(42,.90,1.0)], frost=[hsv(18,.40,.96)], toxic=[hsv(55,.90,1.0)], midnight=[hsv(235,.40,.78)], rose=[hsv(340,.27,1.0)]),
   "speculum": dict(src=["#4646bd"], ember=[hsv(42,.85,1.0)], frost=[hsv(205,.12,1.0)], toxic=[hsv(65,.80,1.0)], midnight=[hsv(220,.35,.85)], rose=[hsv(340,.42,.98)]),
   "cream": dict(src=["#fcf0d0"], keep=True),      # wing bars, neck ring, tail
   "white": dict(src=["#ffffe7"], keep=True),      # eye dot
 }),
 "C3": dict(name="Catfish", scale=1, regions={
   "body":  dict(src=["#a8a6ff", "#6460fc"],
                 ember=[hsv(14,.50,.98), hsv(12,.85,.92)], frost=[hsv(185,0.65,1), hsv(188,0.85,1)],
                 toxic=[hsv(82,.55,.96), hsv(88,.88,.68)], midnight=[hsv(250,.50,.58), hsv(252,.72,.42)], rose=[hsv(322,0.75,1), hsv(325,0.9,0.7)]),
   "rolls": dict(src=["#ff9692"], ember=[hsv(38,.60,1.0)], frost=[hsv(232,.22,1.0)], toxic=[hsv(55,.55,1.0)], midnight=[hsv(280,.35,.62)], rose=[hsv(346,.75,.80)]),
   "hilite": dict(src=["#affeff"], ember=[hsv(45,.35,1.0)], frost=[hsv(200,.08,1.0)], toxic=[hsv(65,.28,1.0)], midnight=[hsv(220,.35,.88)], rose=[hsv(340,.12,1.0)]),
   "cream": dict(src=["#fff7d3"], keep=True),      # X eye patch, roll tops
   "white": dict(src=["#ffffe7"], keep=True),
 }),
 "C4": dict(name="Beardie", scale=1, regions={
   "body":  dict(src=["#ff8245"], ember=[hsv(10,0.95,0.58)], frost=[hsv(203,.45,.90)], toxic=[hsv(92,.85,.72)], midnight=[hsv(250,.65,.50)], rose=[hsv(322,0.9,1)]),
   "marks": dict(src=["#fcf428"], ember=[hsv(40,.85,1.0)], frost=[hsv(200,.12,1.0)], toxic=[hsv(68,.85,1.0)], midnight=[hsv(220,.35,.85)], rose=[hsv(338,.28,1.0)]),  # stripes + cheek ear-spot
   "belly": dict(src=["#fff9dd"], big=True,        # cream comps >= 500 px = belly; small cream comps (eye whites, teeth) protected
                 ember=[hsv(38,.16,1.0)], frost=[hsv(70,.07,1.0)], toxic=[hsv(60,.14,1.0)], midnight=[hsv(60,.08,.96)], rose=[hsv(340,.07,1.0)]),
   "drool": dict(src=["#b6f0e8"], keep=True),
   "white": dict(src=["#ffffe7"], keep=True),
 }),
 "C5": dict(name="Bulldog", scale=1, regions={
   "body":  dict(src=["#ca906c"], ember=[hsv(10,0.95,0.58)], frost=[hsv(208,0.65,0.9)], toxic=[hsv(112,0.75,0.85)], midnight=[hsv(250,.50,.45)], rose=[hsv(322,0.9,1)]),
   "stripes": dict(src=["#ff7b5b"], ember=[hsv(40,.80,1.0)], frost=[hsv(205,.55,.88)], toxic=[hsv(65,.80,.95)], midnight=[hsv(225,.40,.80)], rose=[hsv(338,.34,1.0)]),
   "cream": dict(src=["#fff2d4"], keep=True),      # shirt, collar spikes, teeth
   "white": dict(src=["#ffffe3"], keep=True),
 }),
 "C6": dict(name="Bumbleseal", scale=3.2, regions={
   "stripes": dict(src=["#ffe100"], ember=[hsv(20,.90,1.0)], frost=[hsv(200,.35,1.0)], toxic=[hsv(120,0.9,0.85)], midnight=[hsv(250,.65,.62)], rose=[hsv(322,0.9,1)]),
   "cream": dict(src=["#fff1c7"], keep=True),      # face, ears, wings, tail rings, tuft dots: identity, never changes
   "blush": dict(src=["#ffb7a1"], keep=True),
 }),
}

ANATOMY = {
 "C1": "Anatomy: pale ice-blue dome (identity colour), cream cel-highlight streaks top-left, two cream eyes with black pupils and white specular dots, pink blush bars, black mouth, black underside slab, 4 cyan drops, ground shadow. Recoloured: dome, drops. Never: ink, cream (eyes + streaks share one fill), white dots, blush.",
 "C2": "Anatomy: brown body and wings (identity), green head (SECONDARY accent), orange beak (secondary), blue speculum bars on both wings (tertiary), cream wing bars / neck ring / tail, white eye dot. Recoloured: body, head, beak, speculum, each a deliberate step apart. Never: ink, cream, eye.",
 "C3": "Anatomy: two-shade periwinkle body (light top, dark shade below and fins, same hue), pink lip rolls (secondary accent) with cream tops, cream X-eye patch, pale-cyan highlight streaks + 3 sweat drops, ink whiskers, ground shadow. Recoloured: both body shades (structure kept), rolls, highlight/drops. Never: ink, cream, white.",
 "C4": "Anatomy: orange body (identity), yellow stripes + cheek ear-spot (same fill; markings), huge cream belly (secondary: temperature-shifted only), eye whites + teeth in the same cream but as small components (protected), pale cyan drool, orange tongue (body fill + ink). Recoloured: body, markings, belly tint. Never: ink, eye whites/teeth, drool.",
 "C5": "Anatomy: tan body (identity), cream shirt with coral stripes (stripes recoloured as accent, shirt kept), ink collar with cream spikes, cream teeth, white eye highlights. Recoloured: body, stripes. Never: ink (collar), cream, white.",
 "C6": "Anatomy: cream face/ears/wings/tail-rings/tuft dots (identity, ~42% of pixels), black stripes (ink, ~46%), yellow stripes (the ONLY recoloured fill, ~10%), pink blush. Never: ink, cream, blush. A Bumbleseal morph is therefore a stripe colour, which is what keeps it a Bumbleseal.",
}

CORE_D = 14.0      # RGB distance to count as a flat-fill core pixel
INK_V = 0.20       # channel max below this = Cam's ink (textured #14..#28), kept byte-identical
EXPLAIN_D = 16.0   # residual above which a pixel is "not a blend of two neighbours"
MIN_ISLAND = 12


def build(cid, spec, want=None):
    want = MORPHS if want is None else want
    im = Image.open(os.path.join(SRC, f"{cid}.png")).convert("RGBA")
    A = np.asarray(im).astype(np.float32)
    bb = im.getbbox(); x0, y0, x1, y1 = bb
    A = A[y0:y1, x0:x1]
    rgbA, al = A[..., :3], A[..., 3]
    vis = al > 0
    H, W = al.shape
    R = max(3, int(round(4 * spec["scale"])))

    # palette entries: 0 = ink, then every fill
    entries = [("ink", INK, {m: INK for m in want}, None)]
    for rname, reg in spec["regions"].items():
        for k, s in enumerate(reg["src"]):
            tg = {m: (s if reg.get("keep") else reg[m][k]) for m in want}
            entries.append((rname, s, tg, reg))
    P = np.stack([rgb(e[1]) for e in entries])           # (n,3)
    n = len(entries)

    # cores + grown neighbourhoods
    d = np.linalg.norm(rgbA[..., None, :] - P[None, None], axis=-1)   # (H,W,n)
    # a core pixel belongs to its NEAREST entry only (cream #fff9dd and white #ffffe7 are 11.7 apart)
    nearest = d.argmin(-1)
    core = (d < CORE_D) & (nearest[..., None] == np.arange(n)[None, None]) & vis[..., None] & (al[..., None] > 200)
    core[..., 0] = vis & (rgbA.max(-1) < INK_V * 255)   # ink is a textured family of darks; all of it is protected
    # C4 belly vs eye-white split: same cream fill, different components
    for i, (rname, s, tg, reg) in enumerate(entries):
        if reg is not None and reg.get("big"):
            lab, k = label(core[..., i])
            sizes = np.bincount(lab.ravel())
            small = np.isin(lab, np.where(sizes < 500)[0]) & (lab > 0)
            # small cream comps become a protected twin entry
            entries.append((rname + "_keep", s, {m: s for m in want}, None))
            P = np.vstack([P, rgb(s)[None]])
            core = np.concatenate([core, small[..., None]], axis=-1)
            core[..., i] &= ~small
            n += 1
    near = np.stack([binary_dilation(core[..., i], iterations=R) for i in range(n)], -1)

    # best explaining pair per pixel
    best_res = np.full((H, W), np.inf, np.float32)
    best_i = np.zeros((H, W), np.int16); best_j = np.zeros((H, W), np.int16)
    best_t = np.zeros((H, W), np.float32)
    for i in range(n):
        for j in range(i, n):
            m = near[..., i] & near[..., j] & vis
            if not m.any(): continue
            a, b = P[i], P[j]; ab = b - a; L2 = float(ab @ ab)
            c = rgbA[m]
            t = np.zeros(len(c), np.float32) if L2 == 0 else np.clip(((c - a) @ ab) / L2, 0, 1)
            recon = a + t[:, None] * ab
            res = np.linalg.norm(c - recon, axis=1)
            cur = best_res[m]
            upd = res < cur - 1e-3
            idx = np.where(m)
            ys, xs = idx[0][upd], idx[1][upd]
            best_res[ys, xs] = res[upd]; best_i[ys, xs] = i; best_j[ys, xs] = j; best_t[ys, xs] = t[upd]
    # a core pixel is pure by definition: snap it to its own entry
    for i in range(n):
        ci = core[..., i]
        best_i[ci] = i; best_j[ci] = i; best_t[ci] = 0; best_res[ci] = 0
    unexplained = vis & (best_res > EXPLAIN_D)
    no_pair = vis & np.isinf(best_res)
    # label = dominant endpoint
    lab_map = np.where(best_t < 0.5, best_i, best_j)
    lab_map[~vis] = -1

    # islands: tiny components of a label become the majority neighbour label
    kept_entry = np.array([e[3] is None or e[3].get("keep", False) for e in entries])
    solid = vis & (al >= 8)                                           # alpha 1-7 is Cam's export fringe, not paint
    def islands(lm):
        out = []
        for i in range(n):
            if kept_entry[i]: continue
            l, k = label((lm == i) & solid)
            sizes = np.bincount(l.ravel())
            tiny = np.where((sizes < MIN_ISLAND) & (sizes > 0))[0]
            tiny = tiny[tiny != 0]
            for t in tiny:
                m = l == t
                if (m & core[..., i]).any(): continue   # a tiny comp WITH its own flat core is Cam's mark (pupil dot, nostril), not speckle
                out.append((i, m))
        return out
    fixed = 0
    for _ in range(4):
        isl = islands(lab_map)
        if not isl: break
        for i, m in isl:
            grown = binary_dilation(m, iterations=1) & ~m & vis
            nb = lab_map[grown]; nb = nb[nb != i]
            if len(nb) == 0: continue
            newl = np.bincount(nb).argmax()
            # re-explain those pixels with newl forced as one endpoint
            idx = np.where(m)
            c = rgbA[idx]
            bestr = np.full(len(c), np.inf); bi = np.full(len(c), newl); bj = np.full(len(c), newl); bt = np.zeros(len(c))
            for j in range(n):
                if not near[..., j][idx].any() and j != newl: continue
                a, b = P[newl], P[j]; ab = b - a; L2 = float(ab @ ab)
                t = np.zeros(len(c)) if L2 == 0 else np.clip(((c - a) @ ab) / L2, 0, 1)
                res = np.linalg.norm(c - (a + t[:, None] * ab), axis=1)
                u = res < bestr; bestr[u] = res[u]; bj[u] = j; bt[u] = t[u]
            best_i[idx] = bi; best_j[idx] = bj; best_t[idx] = bt; best_res[idx] = bestr
            lab_map[idx] = newl                     # owned by the neighbour region; colour still follows its own blend
            fixed += int(m.sum())
    left = islands(lab_map)
    remaining = sum(int(m.sum()) for _, m in left)
    if left: print(cid, "islands left:", [(entries[i][0], int(m.sum())) for i, m in left][:20])

    # fallback for unexplained pixels: per-pixel hue rotation with the dominant
    # region's fill->target delta (keeps the pixel's own S/V structure)
    def fallback(morph, m):
        out = rgbA[m].copy()
        for i in range(n):
            mi = m & (lab_map == i)
            if not mi.any(): continue
            s_h, s_s, s_v = colorsys.rgb_to_hsv(*(P[i] / 255))
            t_h, t_s, t_v = colorsys.rgb_to_hsv(*(rgb(entries[i][2][morph]) / 255))
            px = rgbA[mi] / 255
            hh = np.array([colorsys.rgb_to_hsv(*p) for p in px])
            hh[:, 0] = (hh[:, 0] + (t_h - s_h)) % 1.0
            hh[:, 1] = np.clip(hh[:, 1] * (t_s / max(s_s, 1e-3)) if s_s > 0.05 else t_s, 0, 1)
            hh[:, 2] = np.clip(hh[:, 2] * (t_v / max(s_v, 1e-3)), 0, 1)
            out_i = np.array([colorsys.hsv_to_rgb(*p) for p in hh]) * 255
            sel = mi[m]
            out[sel] = out_i
        return out

    results, checks = {}, {}
    for morph in want:
        T = np.stack([rgb(e[2][morph]) for e in entries])
        a = T[best_i]; b = T[best_j]
        mixed = a + best_t[..., None] * (b - a)
        out = A.copy()
        out[..., :3][vis] = np.clip(mixed[vis], 0, 255)
        # both endpoints protected -> copy source bytes (no requantisation)
        prot = np.array([e[2][morph] == e[1] for e in entries])
        both_kept = prot[best_i] & prot[best_j] & vis
        out[..., :3][both_kept] = rgbA[both_kept]
        if unexplained.any():
            out[..., :3][unexplained] = np.clip(fallback(morph, unexplained), 0, 255)
        full = np.asarray(im).astype(np.float32).copy()
        full[y0:y1, x0:x1] = out
        img = Image.fromarray(np.round(full).astype(np.uint8), "RGBA")
        img.save(os.path.join(OUT, f"{cid}__{morph}.png"))
        results[morph] = img
        # checks
        ink_core = core[..., 0]
        kept_core = np.zeros_like(ink_core)
        for i in range(n):
            if prot[i] and i != 0: kept_core |= core[..., i]
        checks[morph] = dict(
            ink_identical=bool((out[..., :3][ink_core] == rgbA[ink_core]).all()),
            ink_px=int(ink_core.sum()),
            whites_identical=bool((out[..., :3][kept_core] == rgbA[kept_core]).all()),
            whites_px=int(kept_core.sum()),
            edge_partials=int((vis & (best_t > 0.05) & (best_t < 0.95)).sum()),
            unexplained=int(unexplained.sum()), no_pair=int(no_pair.sum()),
            islands_fixed=fixed, islands_left=remaining,
            visible=int(vis.sum()),
        )
    if os.environ.get("DEBUG"):
        pal = np.array([[40,40,40],[255,0,0],[0,200,0],[0,90,255],[255,220,0],[255,0,255],[0,255,255],[255,128,0],[128,0,255],[0,128,128],[200,200,200]],np.uint8)
        lm = np.where(lab_map < 0, 10, lab_map); lm = np.minimum(lm, 10)
        dbg = pal[lm]; dbg[unexplained] = [255,255,255]
        Image.fromarray(dbg).resize((W*3,H*3),Image.NEAREST).save(os.path.join(OUT,"work",f"labels_{cid}.png"))
        print(cid, "core px:", [(e[0], int(core[..., i].sum())) for i,e in enumerate(entries)], "unexplained opaque/partial:", int((unexplained&(al==255)).sum()), int((unexplained&(al<255)).sum()))
    meta = dict(entries=entries, bbox=bb, lab_map=lab_map, n=n, P=P, region_px={
        entries[i][0]: int((lab_map == i).sum()) for i in range(n)})
    return im, results, checks, meta


# ---------------------------------------------------------------------------
def thumb(img, box, bg, zoom, sc):
    t = img.crop(img.getbbox())
    t = t.resize((max(1, round(t.width * zoom / sc)), max(1, round(t.height * zoom / sc))), Image.LANCZOS)
    t.thumbnail(box, Image.LANCZOS)
    cell = Image.new("RGBA", box, bg + (255,))
    cell.alpha_composite(t, ((box[0] - t.width) // 2, (box[1] - t.height) // 2))
    return cell


def sheet(base, res, bg, cell, path, zoom, morphs=None):
    morphs = MORPHS if morphs is None else morphs
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 15)
    cols = ["base"] + list(morphs)
    S = Image.new("RGBA", (90 + cell * len(cols), 30 + cell * len(base)), bg + (255,))
    d = ImageDraw.Draw(S)
    for c, name in enumerate(cols):
        d.text((90 + c * cell + cell // 2, 14), name, fill=(230, 230, 230), font=font, anchor="mm")
    for r, cid in enumerate(base):
        d.text((45, 30 + r * cell + cell // 2), f"{cid}\n{SPECIES[cid]['name']}", fill=(230, 230, 230), font=font, anchor="mm", align="center")
        sc = SPECIES[cid]["scale"]
        S.alpha_composite(thumb(base[cid], (cell - 8, cell - 8), bg, zoom, sc), (94 + 0 * cell, 34 + r * cell))
        for c, m in enumerate(morphs):
            S.alpha_composite(thumb(res[cid][m], (cell - 8, cell - 8), bg, zoom, sc), (94 + (c + 1) * cell, 34 + r * cell))
    S.convert("RGB").save(path)


ZOOMS = [  # (cid, box in master coords, label)
    ("C6", (1230, 640, 1400, 810), "C6 stripe edge + tuft dots"),
    ("C6", (330, 980, 700, 1350), "C6 face, blush, mouth"),
    ("C2", (490, 440, 580, 500), "C2 head / beak / eye"),
    ("C2", (385, 400, 480, 475), "C2 speculum + wing bars"),
    ("C5", (395, 495, 480, 560), "C5 collar, spikes, shirt stripes"),
    ("C5", (445, 430, 530, 500), "C5 muzzle, teeth"),
    ("C4", (395, 430, 470, 500), "C4 eye rim, tongue, drool"),
    ("C4", (445, 470, 560, 545), "C4 belly / marking boundary"),
    ("C1", (415, 415, 505, 500), "C1 eyes, blush, mouth"),
    ("C1", (410, 500, 500, 545), "C1 drops"),
    ("C3", (450, 450, 540, 500), "C3 rolls / X eye"),
    ("C3", (400, 390, 500, 440), "C3 highlight streaks + drops"),
]


def zooms(base, res, path, morphs=None):
    morphs = MORPHS if morphs is None else morphs
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 13)
    Z = 4; cw = 96 * Z; ch = 80 * Z
    cols = ["base"] + list(morphs)
    S = Image.new("RGB", (cw * len(cols), (ch + 22) * len(ZOOMS)), SURFACE2)
    d = ImageDraw.Draw(S)
    for r, (cid, box, lbl) in enumerate(ZOOMS):
        if cid not in base: continue
        y = r * (ch + 22)
        d.text((6, y + 4), lbl, fill=(230, 230, 230), font=font)
        for c, m in enumerate(cols):
            img = base[cid] if m == "base" else res[cid][m]
            sc = SPECIES[cid]["scale"]
            crop = img.crop(box)
            if sc != 1: crop = crop.resize((int(crop.width / sc), int(crop.height / sc)), Image.LANCZOS)
            crop = crop.resize((crop.width * Z, crop.height * Z), Image.NEAREST)
            cell = Image.new("RGBA", (cw, ch), SURFACE2 + (255,))
            crop.thumbnail((cw, ch)); cell.alpha_composite(crop, (0, 0))
            S.paste(cell.convert("RGB"), (c * cw, y + 22))
    S.save(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("species", nargs="*", metavar="C<N>")
    parser.add_argument("--ship", action="store_true")
    parser.add_argument("--morphs", nargs="+", choices=MORPHS, default=MORPHS)
    args = parser.parse_args()
    if any(cid not in SPECIES for cid in args.species):
        parser.error("unknown species")
    morphs = args.morphs
    ship, only = args.ship, args.species
    base, res, allchecks, metas = {}, {}, {}, {}
    for cid, spec in SPECIES.items():
        if only and cid not in only: continue
        im, r, ch, meta = build(cid, spec, morphs)
        base[cid], res[cid], allchecks[cid], metas[cid] = im, r, ch, meta
        print(cid, ch, "region_px", meta["region_px"], flush=True)
    sheet(base, res, SURFACE2, 490, os.path.join(OUT, "sheet.png"), 2, morphs)
    sheet(base, res, TODAY_GREEN, 250, os.path.join(OUT, "sheet-today.png"), 1, morphs)
    zooms(base, res, os.path.join(OUT, "zooms.png"), morphs)
    # table
    L = ["# Pet morphs v2: per-region source -> target and checks", "",
         f"Ground truths: ink {INK} (protected), --surface-2 #{SURFACE2[0]:02x}{SURFACE2[1]:02x}{SURFACE2[2]:02x}, Today green #{TODAY_GREEN[0]:02x}{TODAY_GREEN[1]:02x}{TODAY_GREEN[2]:02x} (sampled from proof/01-today-kit-on.png).",
         "Every visible pixel is explained as a blend of two palette entries with cores within R px; the blend is re-mixed with the targets. Protected entries map to themselves.", ""]
    for cid in base:
        spec = SPECIES[cid]; meta = metas[cid]
        L += [f"## {cid} {spec['name']}", "", ANATOMY[cid], "",
              "| region | source | " + " | ".join(morphs) + " | px (dominant) |",
              "|" + "---|" * (len(morphs) + 3)]
        for rname, reg in spec["regions"].items():
            for k, s in enumerate(reg["src"]):
                if reg.get("keep"):
                    row = [s] + ["= (kept)"] * len(morphs)
                else:
                    row = [s] + [reg[m][k] for m in morphs]
                px = meta["region_px"].get(rname, 0)
                L.append(f"| {rname} | " + " | ".join(row) + f" | {px} |")
        L.append(f"| ink | {INK} | " + " | ".join(["="] * len(morphs)) + f" | {meta['region_px'].get('ink',0)} |")
        L += ["", "| morph | ink identical | whites/creams identical | edge partials | unexplained (fallback) | islands fixed / left |", "|---|---|---|---|---|---|"]
        for m in morphs:
            c = allchecks[cid][m]
            L.append(f"| {m} | {c['ink_identical']} ({c['ink_px']} px) | {c['whites_identical']} ({c['whites_px']} px) | {c['edge_partials']} | {c['unexplained']} | {c['islands_fixed']} / {c['islands_left']} |")
        L.append("")
    open(os.path.join(OUT, "table.md"), "w").write("\n".join(L))
    if ship:
        dst = os.path.join(SRC, "morph"); os.makedirs(dst, exist_ok=True)
        for cid in res:
            for m in morphs: res[cid][m].save(os.path.join(dst, f"{cid}__{m}.png"))
        print("shipped to", dst)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
