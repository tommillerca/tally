#!/usr/bin/env python3
"""Selective animation layers from approved morph masters. No HSV fallback.

C1 source pixels transfer by coordinate, including baked eye-edge paint and
rain texture. Only the extracted body's repair pixels need a palette model:
a two-fill blend with the original RGB residual retained, maximum residual 8.
Ink stays byte-identical. C3/C4 remain static until their seam models pass QC.
Run with --check for read-only reproducibility and alpha/ink checks.
"""
import argparse
import importlib.util
import json
import hashlib
import os
from pathlib import Path
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy.ndimage import label, find_objects

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parent.parent
# Import the current palette without allowing the legacy generator's default
# output directory to escape this checkout.
os.environ['OUT_DIR'] = tempfile.gettempdir() + '/fix-anim-palette'
spec = importlib.util.spec_from_file_location('palette', ROOT / 'scripts/build-pet-morphs-v2.py')
palette = importlib.util.module_from_spec(spec)
spec.loader.exec_module(palette)


def rgba(path):
    return np.array(Image.open(path).convert('RGBA'))


def body_width(a):
    labels, _ = label(a[..., 3] > 8)
    sizes = np.bincount(labels.ravel()); sizes[0] = 0
    box = find_objects(labels)[sizes.argmax() - 1]
    return box[1].stop - box[1].start


def build(check=False):
    source = Image.open(ROOT / 'assets/bh/C/C1.png').convert('RGBA')
    bbox = source.getbbox()
    master = np.array(source.crop(bbox))
    entries = [('ink', palette.INK)] + [(name, region['src'][0]) for name, region in palette.SPECIES['C1']['regions'].items()]
    fills = np.stack([palette.rgb(color) for _, color in entries])
    hashes = json.loads((ROOT / 'docs/reviews/fix-anim/source-hashes.json').read_text())
    for path, digest in hashes.items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest, f'{path}: reviewed source changed'
    evidence = json.loads((ROOT / 'docs/reviews/r56/layer-checks.json').read_text())
    # Strict admission: the reviewed blind palette model must explain every
    # required seam pixel. C1 has the replacement transfer/repair model below.
    # C3/C4 do not. Retain their static masters instead of HSV reassignment.
    rejected = {}
    for sp, layer in [('C3', 'catfish/bead.png'), ('C4', 'lizard/tongue.png')]:
        row = next(r for r in evidence if r['layer'].endswith('/' + layer))
        count = row['unmodified_generator_frost_checks']['unexplained']
        assert count > 0, f'{sp}: reassess fallback, reviewed failure no longer present'
        rejected[sp] = {'layer': layer, 'unexplained': count, 'required': 0}
    report = {}
    for name, xy in [('body-noeyes', (0, 0)), ('eyes', (0, 0)), ('drop', (92, 129))]:
        a = rgba(ROOT / f'assets/bh/anim/cloud/{name}.png')
        x, y = xy; h, w = a.shape[:2]
        original = master[y:y+h, x:x+w]
        vis = a[..., 3] > 0
        ink = vis & (a[..., :3].max(-1) < 51)
        transfer = vis & ~ink & np.all(a[..., :3] == original[..., :3], axis=-1)
        repair = vis & ~ink & ~transfer
        values = a[repair, :3].astype(float)
        best = np.full(len(values), np.inf)
        weights = np.zeros((len(values), len(fills)))
        for i in range(len(fills)):
            for j in range(i + 1, len(fills)):
                v = fills[j] - fills[i]
                t = np.clip((values - fills[i]) @ v / (v @ v), 0, 1)
                error = np.linalg.norm(values - (fills[i] + t[:, None] * v), axis=1)
                use = error < best
                best[use] = error[use]; weights[use] = 0
                weights[use, i] = 1 - t[use]; weights[use, j] = t[use]
        residual = float(max(best, default=0))
        assert residual <= 8, f'{name}: unexplained repair RGB residual {residual}; retain static'
        assert name == 'body-noeyes' or not repair.any(), f'{name}: expected exact source transfer'
        report[name] = {'transferred': int(transfer.sum()), 'ink_kept': int(ink.sum()), 'repair_pixels': int(repair.sum()), 'max_repair_residual': residual}
        for morph in palette.MORPHS:
            target = rgba(ROOT / f'assets/bh/C/morph/C1__{morph}.png')[bbox[1]:bbox[3], bbox[0]:bbox[2]][y:y+h, x:x+w]
            targets = np.stack([palette.rgb(palette.INK)] + [palette.rgb(region['src'][0] if region.get('keep') else region[morph][0]) for region in palette.SPECIES['C1']['regions'].values()])
            out = a.copy()
            out[transfer, :3] = target[transfer, :3]
            out[repair, :3] = np.clip(np.rint(values + weights @ (targets - fills)), 0, 255).astype('uint8')
            assert np.array_equal(out[..., 3], a[..., 3])
            assert np.array_equal(out[ink], a[ink])
            assert np.array_equal(out[transfer, :3], target[transfer, :3])
            path = ROOT / f'assets/bh/anim/morph/C1/{morph}/{name}.png'
            if check:
                assert np.array_equal(rgba(path), out), f'{path.relative_to(ROOT)} stale or changed'
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                Image.fromarray(out).save(path)
    widths = {}
    for sp, folder, body in [('C1', 'cloud', 'body-noeyes'), ('C3', 'catfish', 'body'), ('C4', 'lizard', 'base'), ('CX', 'lizard-amethyst', 'base')]:
        widths[sp] = {'static': body_width(rgba(ROOT / f'assets/bh/C/{sp}.png')), 'animated': body_width(rgba(ROOT / f'assets/bh/anim/{folder}/{body}.png'))}
        for morph in palette.MORPHS if sp != 'CX' else []:
            assert body_width(rgba(ROOT / f'assets/bh/C/morph/{sp}__{morph}.png')) == widths[sp]['static']
    return {'cloud': report, 'body_widths': widths, 'rejected_layer_models': rejected}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(); parser.add_argument('--check', action='store_true')
    print(json.dumps(build(parser.parse_args().check), indent=2))
