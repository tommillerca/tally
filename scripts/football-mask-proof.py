#!/usr/bin/env python3
"""Proof sheet + acceptance table for the 2026-09-05 football mask quality fix.

  python3 scripts/football-mask-proof.py

For each of the eight garments: measures the SHADING and MASK-CLEANLINESS
acceptance numbers from Tom's "messy recolour" report against the shipped
assets/bh/football/*.png, and writes scratchpad/proof/masks/compare-<garment>.png
(original | master | mask-a | mask-b | navy #14213D result | gold #F9DC1A
result). Read-only: does not touch assets/bh.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = '/Users/tommiller/Downloads/NFL GEAR'
OUT_ASSETS = os.path.join(ROOT, 'assets', 'bh', 'football')
PROOF_DIR = os.path.join(ROOT, 'scratchpad', 'proof', 'masks')

# football-masks.py is imported by path (hyphen in the name).
import importlib.util
_spec = importlib.util.spec_from_file_location('football_masks', os.path.join(HERE, 'football-masks.py'))
fm = importlib.util.module_from_spec(_spec)
sys.argv = ['football-masks.py', SRC]
_spec.loader.exec_module(fm)

NAVY, GOLD = '#14213D', '#F9DC1A'
PANEL = 220


def L_of(rgb):
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def load_shipped(name):
    master = np.asarray(Image.open(os.path.join(OUT_ASSETS, f'{name}.png')).convert('RGBA')).astype(np.float64)
    masks = {}
    for tag in ('a', 'b'):
        la = np.asarray(Image.open(os.path.join(OUT_ASSETS, f'{name}.mask-{tag}.png')).convert('LA')).astype(np.float64)
        masks[tag] = la[..., 1] / 255.0
    return master, masks


def full_tint(master, masks, hex_tint):
    rgb, alpha = master[..., :3], master[..., 3]
    tint = fm.hex_rgb(hex_tint)
    m = np.clip(masks['a'] + masks['b'], 0, 1)
    out = fm.composite(rgb, m, tint)
    return np.dstack([out, alpha]).astype(np.uint8)


def component_sizes(w, thresh=0.5):
    on = w > thresh
    lbl, n = ndimage.label(on)
    on_sizes = ndimage.sum(on, lbl, np.arange(1, n + 1)) if n else np.array([])
    lbl2, n2 = ndimage.label(~on)
    off_sizes = ndimage.sum(~on, lbl2, np.arange(1, n2 + 1)) if n2 else np.array([])
    # drop the single giant background/foreground component from each side
    on_sizes = on_sizes[on_sizes > 0]
    off_sizes = off_sizes[off_sizes > 0]
    return on_sizes, off_sizes


def crop_to_ink(im):
    """Crop to the alpha bbox (threshold 14, matching build-bh-thumbs.py's
    trimmed()) so the proof sheet shows the garment, not mostly padding."""
    box = im.getchannel('A').point(lambda p: 255 if p > 14 else 0).getbbox()
    return im.crop(box) if box else im


def checkerboard_compose(im, size=PANEL):
    """Crop to ink, flatten alpha onto a mid-grey background, and letterbox
    into a square panel for a proof PNG."""
    im = crop_to_ink(im)
    k = size / max(im.size)
    im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
    bg = Image.new('RGBA', (size, size), (58, 58, 64, 255))
    bg.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    return bg.convert('RGB')


def main():
    rows = []
    stems = list(fm.GARMENTS.items())
    for stem, (name, size) in stems:
        orig_im = Image.open(os.path.join(SRC, stem + '.png')).convert('RGBA')
        orig = np.asarray(orig_im).astype(np.float64)
        orig_rgb, orig_alpha = orig[..., :3], orig[..., 3] / 255.0
        h, s, _ = fm.hsv(orig_rgb)
        L_orig = L_of(orig_rgb)
        pa, pb, _na, _nb = fm.measure_reference()

        master, masks = load_shipped(name)
        master_rgb = master[..., :3]
        L_master = L_of(master_rgb)

        master_im = Image.fromarray(np.clip(master, 0, 255).astype(np.uint8), 'RGBA')
        box = master_im.getchannel('A').point(lambda p: 255 if p > 14 else 0).getbbox()

        def crop_panel(im):
            return checkerboard_compose(im.crop(box) if box else im)

        panels = [checkerboard_compose(orig_im)]
        panels.append(crop_panel(master_im))

        # the ORIGINAL's own luminance, resized through the SAME LANCZOS filter
        # the master goes through, so a std-ratio isolates what the tonal
        # remap (normalised_grey) did rather than what the resize's own blur
        # did to both sides alike.
        L_orig_o = fm.resize(np.repeat(L_orig[..., None], 3, axis=2), size, 'RGB')[..., 0] \
            if size != L_orig.shape[0] else L_orig

        for tag, centre in (('a', pa), ('b', pb)):
            m_native, _med = fm.membership(h, s, orig_alpha, centre, L_orig)
            m_shipped = masks[tag]
            mask_rgb = (np.dstack([m_shipped, m_shipped, m_shipped]) * 255).astype(np.uint8)
            mask_png = Image.fromarray(mask_rgb).convert('RGBA')
            mask_png.putalpha(255)
            mask_crop = mask_png.crop(box) if box else mask_png
            k = PANEL / max(mask_crop.size)
            mask_crop = mask_crop.resize((max(1, round(mask_crop.width * k)), max(1, round(mask_crop.height * k))), Image.NEAREST)
            mp = Image.new('RGB', (PANEL, PANEL), (30, 30, 34))
            mp.paste(mask_crop.convert('RGB'), ((PANEL - mask_crop.width) // 2, (PANEL - mask_crop.height) // 2))
            panels.append(mp)

            n = int((m_native > 0.02).sum())
            if n < 50:
                rows.append(dict(garment=name, region=tag, n=0))
                continue

            region_shipped = m_shipped > 0.5
            std_orig = float(L_orig_o[region_shipped].std()) if region_shipped.sum() else 0.0
            std_master = float(L_master[region_shipped].std()) if region_shipped.sum() else 0.0
            std_ratio = std_master / std_orig if std_orig > 0 else float('nan')

            # tinted body-vs-extreme delta: fill = mode-ish (median) composite
            # luminance at CORE, extreme = the wider of (shipped max, shipped min)
            core = m_shipped > fm.CORE
            diffs = {}
            for hx in (NAVY, GOLD):
                tint = fm.hex_rgb(hx)
                comp = fm.composite(master_rgb, m_shipped, tint)
                Lc = L_of(comp)
                if core.sum() < 5:
                    diffs[hx] = 0.0
                    continue
                fill_Lc = float(np.median(Lc[core]))
                hi_Lc = float(Lc[region_shipped].max())
                lo_Lc = float(Lc[region_shipped].min())
                diffs[hx] = max(abs(hi_Lc - fill_Lc), abs(lo_Lc - fill_Lc))

            dark = L_orig < 60
            leak = float(m_native[dark].sum()) / max(float(m_native.sum()), 1e-9) if m_native.sum() else 0.0
            leak_shipped = float(m_shipped[L_master < 60].sum()) / max(float(m_shipped.sum()), 1e-9) if m_shipped.sum() else 0.0

            on_sizes, off_sizes = component_sizes(m_shipped)
            small_on = int((on_sizes < 12).sum())
            small_off = int((off_sizes < 12).sum())

            rows.append(dict(garment=name, region=tag, n=n, std_ratio=std_ratio,
                              diff_navy=diffs[NAVY], diff_gold=diffs[GOLD],
                              leak_native=leak, leak_shipped=leak_shipped,
                              small_on=small_on, small_off=small_off))

        navy_im = Image.fromarray(full_tint(master, masks, NAVY), 'RGBA')
        gold_im = Image.fromarray(full_tint(master, masks, GOLD), 'RGBA')
        panels.append(crop_panel(navy_im))
        panels.append(crop_panel(gold_im))

        sheet = Image.new('RGB', (PANEL * len(panels), PANEL), (30, 30, 34))
        for i, p in enumerate(panels):
            sheet.paste(p.convert('RGB'), (i * PANEL, 0))
        os.makedirs(PROOF_DIR, exist_ok=True)
        out_path = os.path.join(PROOF_DIR, f'compare-{name}.png')
        sheet.save(out_path)
        print(f'wrote {out_path}')

    print()
    print(f"{'garment':11s} {'rgn':3s} {'n':>7s} {'std%':>7s} {'diffNavy':>9s} {'diffGold':>9s} {'leak%':>7s} {'smallOn':>8s} {'smallOff':>9s}")
    fails = []
    for r in rows:
        if r['n'] == 0:
            print(f"{r['garment']:11s} {r['region']:3s} {'EMPTY':>7s}")
            continue
        std_ok = r['std_ratio'] >= 0.60
        diff_ok = max(r['diff_navy'], r['diff_gold']) >= 12
        leak_ok = r['leak_shipped'] < 1.0
        clean_ok = r['small_on'] == 0 and r['small_off'] == 0
        flag = 'ok' if (std_ok and diff_ok and leak_ok and clean_ok) else 'FAIL'
        print(f"{r['garment']:11s} {r['region']:3s} {r['n']:7d} "
              f"{r['std_ratio'] * 100:6.1f}% {r['diff_navy']:9.1f} {r['diff_gold']:9.1f} "
              f"{r['leak_shipped']:6.2f}% {r['small_on']:8d} {r['small_off']:9d}  {flag}")
        if not std_ok:
            fails.append(f"{r['garment']}/{r['region']} std_ratio {r['std_ratio'] * 100:.1f}% < 60%")
        if not diff_ok:
            fails.append(f"{r['garment']}/{r['region']} diff {max(r['diff_navy'], r['diff_gold']):.1f} < 12")
        if not leak_ok:
            fails.append(f"{r['garment']}/{r['region']} leak {r['leak_shipped']:.2f}% >= 1%")
        if not clean_ok:
            fails.append(f"{r['garment']}/{r['region']} {r['small_on']} small-on / {r['small_off']} small-off components")
    print()
    if fails:
        print('ACCEPTANCE FAILURES:')
        for f in fails:
            print(' ', f)
        return 1
    print('all acceptance numbers pass.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
