"""Source-only translation proof. Cannot evidence rendered hand registration.

Offsets are absolute from the preserved originals, not cumulative from Round 4.
Default verifies; --apply replaces only the hash-pinned Round 4 masters, after
all four preflights. The frozen order permits loss of export dust at alpha <=30.
Its Round 5 zero-loss assertion is impossible for the two original spades.
"""
from collections import Counter
from hashlib import sha256
from pathlib import Path
from struct import iter_unpack
import json
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPECS = [
    ('IL17-1', 24, 32, 7, 'fbf4806de8f7db7e9ec9a9f9f03613737777ebb71e153fb2f5c604f2a3d8a0cf', '7b585560969b4c24060f4635ba46e6e7842cc9f2ed177ba85ae221c4ac3e5c65'),
    ('IL17-2', 24, 32, 10, '9e4e74bf299b83a53aa82cb858f4e907859e9dcfa91a5ab831b1d20dec0b2941', 'd84f4950490dfa8c27c81a46794cbf149548a3d19984715a9d745aac44eee90e'),
    ('IL10-1', 22, 86, 0, 'b6690bc3e36f49f56988c75856a527cdfcaf1eae955299a9467a458c3b1fff71', '8b2048c03da874d1ecfce0f8b89ab7a330a34993bbab4bf51d451ce1ff5482c8'),
    ('IL10-2', 22, 86, 0, '4b7ee917dd3d074f755e988c020235006ec5bafd85712febb84d274289c09172', 'abb136d98fc5b870915563f5ca80e09e379fff6d1efb47601cf528d191c2e6ff'),
]


def ink(im):
    return Counter(p for p in iter_unpack('4B', im.tobytes()) if p[3] > 0)


def box(im, threshold):
    return im.getchannel('A').point(lambda a: 255 if a > threshold else 0).getbbox()


prepared = []
for name, dx, dy, loss, baseline_hash, round4_hash in SPECS:
    source = ROOT / 'docs/offhand-registration/before' / (name + '.png')
    destination = ROOT / 'assets/bh/IL' / (name + '.png')
    assert sha256(source.read_bytes()).hexdigest() == baseline_hash, name + ' original hash'
    if '--apply' in sys.argv:
        assert sha256(destination.read_bytes()).hexdigest() == round4_hash, name + ' unexpected current master'
    before = Image.open(source).convert('RGBA')
    assert before.size == (640, 640), name + ' canvas'
    lost = [(x, y, before.getpixel((x, y))) for y in range(640) for x in range(640)
            if not (0 <= x + dx < 640 and 0 <= y + dy < 640)
            and before.getpixel((x, y))[3] > 0]
    print(f'PREFLIGHT {name} offset=({dx:+},{dy:+}) lost alpha>0={len(lost)}; '
          f'alpha>30={sum(p[3] > 30 for x, y, p in lost)}; pixels={lost}', flush=True)
    assert len(lost) == loss, name + ' unexpected loss'
    assert all(p[3] <= 30 for x, y, p in lost), name + ' STOP: loss above alpha 30'
    surviving = before.crop((0, 0, 640 - dx, 640 - dy))
    expected = Image.new('RGBA', (640, 640))
    expected.paste(surviving, (dx, dy))  # Unmasked integer copy, no blending or resampling.
    assert ink(expected) == ink(before) - Counter(p for x, y, p in lost)
    prepared.append((name, dx, dy, before, surviving, expected, destination, lost))

if '--apply' in sys.argv:
    for name, dx, dy, before, surviving, expected, destination, lost in prepared:
        expected.save(destination, optimize=True)

# Same source mask and threshold as tests/facegate-audit.mjs, unchanged.
sk = np.array(Image.open(ROOT / 'assets/bh/SK/SK0-1.png').convert('RGBA'))[..., 3] > 40
ys, xs = np.where(sk)
face = np.zeros_like(sk)
face[ys.min():ys.min() + int((ys.max() - ys.min()) * .55), xs.min():xs.max()] = True
face_ink = int((sk & face).sum())
records = []
for name, dx, dy, before, surviving, expected, destination, lost in prepared:
    after = Image.open(destination).convert('RGBA')
    assert after.size == (640, 640) and after.tobytes() == expected.tobytes(), name + ' exact RGBA translation'
    assert ink(surviving) == ink(after), name + ' surviving RGBA multiset'
    boxes = {}
    for threshold in (0, 30):
        old = box(surviving, threshold)
        shifted = tuple(v + (dx if i % 2 == 0 else dy) for i, v in enumerate(old))
        actual = box(after, threshold)
        assert shifted == actual, name + ' surviving ink box'
        if threshold == 30:
            assert old == box(before, threshold), name + ' stronger ink lost'
        boxes[str(threshold)] = {'original': box(before, threshold), 'surviving': old, 'after': actual}
        print(f'PASS {name} alpha>{threshold} surviving bbox={old} + ({dx:+},{dy:+}) = {actual}; '
              f'original bbox={box(before, threshold)}', flush=True)
    pct = round(100 * float(((np.array(after)[..., 3] > 40) & sk & face).sum()) / face_ink, 2)
    assert pct <= 2, name + ' facegate'
    print(f'PASS {name} surviving RGBA multiset unchanged; exact saved RGBA bytes; '
          f'lost alpha>0={len(lost)}, alpha>30=0; facegate={pct:.2f}% (limit 2%)', flush=True)
    records.append({'item': name, 'offset_from_original': [dx, dy],
                    'lost_pixels': lost, 'lost_alpha_gt_0': len(lost), 'lost_alpha_gt_30': 0,
                    'surviving_rgba_multiset_unchanged': True, 'saved_pixels_exact': True,
                    'boxes': boxes, 'facegate_pct': pct,
                    'after_sha256': sha256(destination.read_bytes()).hexdigest()})

if '--apply' in sys.argv:
    (ROOT / 'docs/offhand/round5-pixel-proof.json').write_text(json.dumps(records, indent=2) + '\n')
