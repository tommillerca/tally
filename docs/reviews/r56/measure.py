"""Offline review evidence. Run from any directory. Does not modify game assets."""
import csv
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.dont_write_bytecode = True


def oklab(rgb):
    c = np.asarray(rgb, dtype=float) / 255
    c = np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)
    lms = c @ np.array([[.4122214708, .5363325363, .0514459929],
                        [.2119034982, .6806995451, .1073969566],
                        [.0883024619, .2817188376, .6299787005]]).T
    return np.cbrt(lms) @ np.array([[.2104542553, .7936177850, -.0040720468],
                                  [1.9779984951, -2.4285922050, .4505937099],
                                  [.0259040371, .7827717662, -.8086757660]]).T


with tempfile.TemporaryDirectory(prefix='r56-review-') as tmp:
    os.environ['OUT_DIR'] = tmp
    spec = importlib.util.spec_from_file_location('morph_review', ROOT / 'scripts/build-pet-morphs-v2.py')
    gen = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gen)
    colours = ['base'] + gen.MORPHS
    pairs = []
    for cid, species in gen.SPECIES.items():
        paths = [ROOT / f'assets/bh/C/{cid}.png'] + [ROOT / f'assets/bh/C/morph/{cid}__{m}.png' for m in gen.MORPHS]
        arrays = [np.array(Image.open(p).convert('RGBA')) for p in paths]
        assert all(a.shape == arrays[0].shape for a in arrays)
        assert all(np.array_equal(a[..., 3], arrays[0][..., 3]) for a in arrays)
        base = arrays[0]
        entries = [(gen.INK, False)] + [(s, not r.get('keep', False)) for r in species['regions'].values() for s in r['src']]
        fills = np.array([gen.rgb(s) for s, _ in entries])
        # Fixed opaque source-core mask. Nearest palette entry wins within the
        # generator's 14 RGB-unit core tolerance, including export variations.
        # Exclude all C4 cream here: belly and protected eyes share one fill.
        recolour = np.array([change and not (cid == 'C4' and s == '#fff9dd') for s, change in entries])
        distances = np.linalg.norm(base[..., None, :3].astype(float) - fills, axis=-1)
        nearest = distances.argmin(-1)
        mask = (base[..., 3] == 255) & (distances.min(-1) < gen.CORE_D) & recolour[nearest]
        labs = [oklab(a[..., :3][mask]) for a in arrays]
        visible = base[..., 3] > 0
        weights = base[..., 3][visible] / 255
        full = [oklab(a[..., :3][visible]) for a in arrays]
        for i in range(6):
            for j in range(i + 1, 6):
                pairs.append(dict(species=cid, first=colours[i], second=colours[j],
                                  recolour_core_pixels=int(mask.sum()),
                                  mean_core_delta_ok_100=float(np.linalg.norm(labs[i] - labs[j], axis=-1).mean() * 100),
                                  alpha_weighted_visible_delta_ok_100=float(np.average(np.linalg.norm(full[i] - full[j], axis=-1), weights=weights) * 100)))
    with (HERE / 'colour-pairs.csv').open('w') as f:
        writer = csv.DictWriter(f, fieldnames=list(pairs[0]))
        writer.writeheader()
        writer.writerows(pairs)
    for cid in gen.SPECIES:
        row = min((p for p in pairs if p['species'] == cid), key=lambda p: p['mean_core_delta_ok_100'])
        print(json.dumps(row))

    layers = []
    files = sorted((ROOT / 'assets/bh/anim').glob('*/*.png'))
    sheet = Image.new('RGB', (840, 160 * len(files)), '#484848')
    draw = ImageDraw.Draw(sheet)
    for idx, path in enumerate(files):
        im = Image.open(path).convert('RGBA')
        a = np.array(im)
        visible = a[..., 3] > 8
        vals, counts = np.unique(a[..., :3][visible], axis=0, return_counts=True)
        order = np.argsort(counts)[-6:][::-1]
        top = [{'rgb': list(map(int, vals[i])), 'pixels': int(counts[i])} for i in order]
        row = dict(layer=str(path.relative_to(ROOT)), size=im.size, bbox=im.getbbox(), visible=int(visible.sum()), top_colours=top)
        cid = {'cloud': 'C1', 'catfish': 'C3', 'lizard': 'C4'}.get(path.parent.name)
        if cid:
            folder = Path(tmp) / str(idx)
            folder.mkdir()
            im.save(folder / f'{cid}.png')
            gen.SRC = str(folder)
            gen.OUT = str(folder)
            _, _, checks, _ = gen.build(cid, gen.SPECIES[cid], ['frost'])
            row['unmodified_generator_frost_checks'] = checks['frost']
        layers.append(row)
        draw.text((8, idx * 160 + 4), str(path.relative_to(ROOT)), fill='white')
        crop = im.crop(im.getbbox())
        crop.thumbnail((360, 125))
        sheet.paste(crop, (12, idx * 160 + 25), crop)
        draw.text((380, idx * 160 + 25), json.dumps(top), fill='white')
    (HERE / 'layer-checks.json').write_text(json.dumps(layers, indent=2) + '\n')
    sheet.save('/tmp/r56-review-layers.png')
    print('90 pairs and', len(layers), 'layer inventories written; probe outputs discarded.')
