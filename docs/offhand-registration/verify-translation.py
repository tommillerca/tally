#!/usr/bin/env python3
"""Verify the frozen translation against hash-pinned original art.

Default is read-only. --apply writes all four masters after all preflights pass.
--sheet writes the before/after B0-1 contact sheet after verification.
Coordinates and boxes use alpha > 0 and half-open bounds throughout.
"""
from collections import Counter
from hashlib import sha256
from pathlib import Path
from struct import iter_unpack
import sys
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SPECS = [
    ('IL10-1', 30, 104, 0, 'b6690bc3e36f49f56988c75856a527cdfcaf1eae955299a9467a458c3b1fff71'),
    ('IL10-2', 30, 104, 0, '4b7ee917dd3d074f755e988c020235006ec5bafd85712febb84d274289c09172'),
    ('IL17-1', 44, 68, 7, 'fbf4806de8f7db7e9ec9a9f9f03613737777ebb71e153fb2f5c604f2a3d8a0cf'),
    ('IL17-2', 44, 68, 10, '9e4e74bf299b83a53aa82cb858f4e907859e9dcfa91a5ab831b1d20dec0b2941'),
]


def ink(image):
    return Counter(p for p in iter_unpack('4B', image.tobytes()) if p[3] > 0)


prepared = []
for item, dx, dy, loss, digest in SPECS:
    source = HERE / 'before' / (item + '.png')
    assert sha256(source.read_bytes()).hexdigest() == digest, item + ' baseline hash'
    before = Image.open(source).convert('RGBA')
    assert before.size == (640, 640), item + ' canvas'
    lost = [before.getpixel((x, y)) for y in range(640) for x in range(640)
            if (x + dx >= 640 or y + dy >= 640) and before.getpixel((x, y))[3] > 0]
    assert len(lost) == loss, (item, 'STOP: pixels-lost', len(lost), loss)
    assert all(p[3] <= 30 for p in lost), (item, 'STOP: lost real ink')
    print(f'PASS {item} pixels-lost(alpha>0)={len(lost)} expected={loss}; '
          f'every lost alpha<=30; max={max((p[3] for p in lost), default=0)}; '
          f'alpha histogram={dict(sorted(Counter(p[3] for p in lost).items()))}')
    surviving = before.crop((0, 0, 640 - dx, 640 - dy))
    expected = Image.new('RGBA', before.size)
    expected.paste(surviving, (dx, dy))  # No mask: copy all four channels exactly.
    assert ink(expected) == ink(before) - Counter(lost), item + ' preflight multiset'
    prepared.append((item, dx, dy, before, surviving, expected))

if '--apply' in sys.argv:
    # Refuse accidental double translation or overwriting intervening edits.
    for item, _, _, before, _, _ in prepared:
        current = Image.open(ROOT / 'assets/bh/IL' / (item + '.png')).convert('RGBA')
        assert current.tobytes() == before.tobytes(), item + ' master must still be original'
    for item, _, _, _, _, expected in prepared:
        expected.save(ROOT / 'assets/bh/IL' / (item + '.png'), optimize=True)

for item, dx, dy, before, surviving, expected in prepared:
    after = Image.open(ROOT / 'assets/bh/IL' / (item + '.png')).convert('RGBA')
    assert after.size == (640, 640), item + ' output canvas'
    assert after.tobytes() == expected.tobytes(), item + ' exact RGBA translation'
    old_values, new_values = ink(surviving), ink(after)
    assert old_values == new_values, item + ' surviving RGBA multiset'
    old_box = surviving.getchannel('A').getbbox()
    shifted_box = tuple(v + (dx if i % 2 == 0 else dy) for i, v in enumerate(old_box))
    new_box = after.getchannel('A').getbbox()
    assert new_box == shifted_box, item + ' surviving bounding box'
    print(f'PASS {item} surviving RGBA multiset identical: '
          f'before={sum(old_values.values())} after={sum(new_values.values())} '
          f'distinct={len(old_values)}; exact translated RGBA bytes identical')
    print(f'PASS {item} surviving bbox before={old_box} + ({dx},{dy}) '
          f'= expected={shifted_box} after={new_box}')

if '--sheet' in sys.argv:
    # Full-resolution composites: only the evidence image is composited.
    body = Image.open(ROOT / 'assets/bh/B/B0-1.png').convert('RGBA')
    sheet = Image.new('RGB', (2560, 1360), '#ede9df')
    draw = ImageDraw.Draw(sheet)
    for column, (item, dx, dy, before, _, after) in enumerate(prepared):
        for row, (label, art) in enumerate([('BEFORE', before), ('AFTER', after)]):
            left, top = column * 640, row * 680
            draw.text((left + 16, top + 12), f'{item} {label}  dx=+{dx}, dy=+{dy}', fill='#222222')
            composite = Image.alpha_composite(body, art)
            sheet.paste(composite, (left, top + 40), composite)
    sheet.save(HERE / 'before-after.png')
    print('PASS before-after.png: all four original/corrected layers over B0-1, at 1:1 scale')
