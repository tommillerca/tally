"""r56 B1, 2026-09-08: measure actual PNG cores with the review's OKLab metric.

No browser, network or asset writes. The frozen C1 frost fixture is shipped
pre-fix art, not a synthetic colour sample. Dependencies match the generator.
"""
import ast
import importlib.util
import os
from pathlib import Path
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy.ndimage import label

ROOT = Path(__file__).resolve().parents[1]
MIN_DELTA = 20.0  # About twice Tom's confused pair (10.13); see palette-fix/report.md.
sys.dont_write_bytecode = True
# Use the review's exact conversion without running its report-writing code.
review = ast.parse((ROOT / 'docs/reviews/r56/measure.py').read_text())
exec(compile(ast.Module(body=[n for n in review.body if isinstance(n, ast.FunctionDef) and n.name == 'oklab'], type_ignores=[]), 'measure.py', 'exec'))

with tempfile.TemporaryDirectory(prefix='pet-palette-') as tmp:
    os.environ['OUT_DIR'] = tmp
    spec = importlib.util.spec_from_file_location('palette_generator', ROOT / 'scripts/build-pet-morphs-v2.py')
    gen = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gen)
    colours = ['base', 'ember', 'frost', 'toxic', 'midnight', 'rose']
    expected_counts = dict(C1=8694, C2=7540, C3=8252, C4=6947, C5=8833, C6=126833)
    assert list(gen.SPECIES) == list(expected_counts)
    assert ['base'] + gen.MORPHS == colours
    failures = []
    total = 0
    for cid, species in gen.SPECIES.items():
        paths = [ROOT / f'assets/bh/C/{cid}.png'] + [ROOT / f'assets/bh/C/morph/{cid}__{m}.png' for m in colours[1:]]
        if '--control' in sys.argv and cid == 'C1':
            paths[2] = ROOT / 'tests/fixtures/pet-palette/C1__frost-before.png'
        arrays = [np.array(Image.open(p).convert('RGBA')) for p in paths]
        base = arrays[0]
        assert all(a.shape == base.shape for a in arrays), f'{cid}: dimensions changed'
        assert all(np.array_equal(a[..., 3], base[..., 3]) for a in arrays), f'{cid}: alpha changed'
        entries = [(gen.INK, False)] + [(s, not r.get('keep', False)) for r in species['regions'].values() for s in r['src']]
        fills = np.array([gen.rgb(s) for s, _ in entries])
        recolour = np.array([change and not (cid == 'C4' and s == '#fff9dd') for s, change in entries])
        distances = np.linalg.norm(base[..., None, :3].astype(float) - fills, axis=-1)
        nearest = distances.argmin(-1)
        mask = (base[..., 3] == 255) & (distances.min(-1) < gen.CORE_D) & recolour[nearest]
        assert int(mask.sum()) == expected_counts[cid], f'{cid}: review source-core mask changed'
        # Independently grade saved bytes for ink and all protected fill cores.
        visible = base[..., 3] > 0
        protected = visible & (base[..., :3].max(-1) < gen.INK_V * 255)
        cores = (distances < gen.CORE_D) & (nearest[..., None] == np.arange(len(entries))) & (base[..., 3, None] > 200)
        for i, (source, change) in enumerate(entries[1:], 1):
            if not change:
                protected |= cores[..., i]
            elif cid == 'C4' and source == '#fff9dd':
                components, _ = label(cores[..., i])
                sizes = np.bincount(components.ravel())
                protected |= (components > 0) & (sizes[components] < 500)
        for morph, array in zip(colours[1:], arrays[1:]):
            assert np.array_equal(array[protected], base[protected]), f'{cid}/{morph}: protected ink, whites, teeth or blush changed'
        labs = [oklab(a[..., :3][mask]) for a in arrays]
        rows = []
        for i in range(6):
            for j in range(i + 1, 6):
                delta = float(np.linalg.norm(labs[i] - labs[j], axis=-1).mean() * 100)
                rows.append((delta, colours[i], colours[j]))
                total += 1
                if not np.isfinite(delta) or delta <= MIN_DELTA:
                    failures.append(f'{cid} {colours[i]}/{colours[j]} {delta:.6f} <= {MIN_DELTA:.2f}')
        delta, first, second = min(rows)
        print(f'{cid}: 15 pairs, minimum {first}/{second} {delta:.6f}')
    assert total == 90
    for failure in failures:
        print('FAIL ' + failure)
    print(f'{total} pairs checked; {len(failures)} below required > {MIN_DELTA:.2f}')
    sys.exit(1 if failures else 0)
