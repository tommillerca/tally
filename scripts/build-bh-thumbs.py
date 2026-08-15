#!/usr/bin/env python3
"""Build the Bonehead THUMBNAIL SHEET: assets/bh/thumb/<px>/<slot>/<id>.png.

WHY. Every cosmetic in assets/bh/<slot>/ is a 640x640 PNG, so one mounted layer
costs 640*640*4 = 1.5625 MB of decoded RGBA whatever size it is drawn at. The
melt bench draws one into a 27px tile; the Collection draws 362 of them into
90px tiles. Measured (gwart/MEMORY-CENSUS.md, and tests/memory-census.mjs on
this tree): Collection 579.7 MB, Backpack 201.6 MB, Crew fan 428 MB at 30
friends. iOS kills the WKWebView renderer at those numbers with no javascript
error at all -- the tab just blanks.

TWO TIERS, because the surfaces differ by more than 4x and one size cannot
serve both. This is not hedging; it is what `srcset` exists for.

  192  0.1406 MB/layer, 11.1x.  Tiles: the melt bench's 27px icon, the
       Collection's 90px cell, the 42px leaderboard avatar, the podium, the
       friend rows, the teaser heads. The largest of those is 90 CSS px, which
       is 270 device px on a 3x phone, and at that size the downscale is
       invisible. 192 is also the largest tier the worst screen tolerates: the
       Collection mounts 362 cells at once, and 362 x 0.1406 = 51 MB against the
       90 MB ceiling tests/memory-census.mjs enforces.

  384  0.5625 MB/layer, 2.8x.  Cards: the Crew fan draws the figure at 175 CSS
       px inside a 194px card, which is 525 device px on a 3x phone. MEASURED,
       not assumed: at 192 the teeth on the skull merge into a grey row and the
       chain links lose their holes, side by side at deviceScaleFactor 3. The
       fan is bounded to seven seated cards (js/app.js applyFan), so this tier
       costs 7 x 8 x 0.5625 = 31.5 MB no matter how big the crew gets.

The BIG surfaces (the Today hero, the Wardrobe stage, the fight arena) keep the
640px art. Nothing here replaces an asset; the originals are untouched and are
still what avatarLayersHtml serves by default.

Idempotent. Run after adding art:  python3 scripts/build-bh-thumbs.py
"""
import os
import re
import sys
from PIL import Image

SIZES = [192, 384]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'bh')
OUT = os.path.join(SRC, 'thumb')

# The SAME rule js/app.js's bhThumb() uses, so the two cannot drift: the flat
# per-slot cosmetic art, plus the shiny pet recolours. Anything else (fx frames,
# glutton plates, the mage, the pet animation strips) is not tiled anywhere and
# keeps its own size.
SLOTS = ['B', 'BG', 'C', 'E', 'FW', 'G', 'H', 'IL', 'IR', 'M', 'P', 'S', 'SK', 'T', 'U']
KEEP = re.compile(r'^(?:%s)/(?:shiny/)?[^/]+\.png$' % '|'.join(SLOTS))


def main():
    made = skipped = 0
    total_src = total_out = 0
    for dirpath, _dirs, files in os.walk(SRC):
        if os.path.commonpath([dirpath, OUT]) == OUT:
            continue                      # never thumbnail the thumbnails
        for f in sorted(files):
            if not f.lower().endswith('.png'):
                continue
            src = os.path.join(dirpath, f)
            rel = os.path.relpath(src, SRC)
            if not KEEP.match(rel):
                continue
            im = Image.open(src).convert('RGBA')
            total_src += os.path.getsize(src)
            for px in SIZES:
                if max(im.size) <= px:
                    skipped += 1          # already smaller than this tier
                    continue
                dst = os.path.join(OUT, str(px), rel)
                os.makedirs(os.path.dirname(dst), exist_ok=True)
                im.resize((px, px), Image.LANCZOS).save(dst, optimize=True)
                total_out += os.path.getsize(dst)
                made += 1
    print('%d thumbnails across tiers %s in %s'
          % (made, SIZES, os.path.relpath(OUT, ROOT)))
    print('%d skipped (source already <= the tier)' % skipped)
    print('source %.1f MB -> thumbnails %.1f MB on disk' % (total_src / 1048576, total_out / 1048576))
    for px in SIZES:
        print('  %dpx: %.4f MB decoded per layer (%.1fx off 640px %.4f MB)'
              % (px, px * px * 4 / 1048576, (640 / px) ** 2, 640 * 640 * 4 / 1048576))
    if not made:
        print('NOTHING WRITTEN: that is a failure, not a clean run.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
