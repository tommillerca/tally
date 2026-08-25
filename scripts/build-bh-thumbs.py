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

A THIRD TIER, `trim/`, WHICH IS CROPPED. Tom, 2026-08-24: "cant you make the art
small if its a small slot? and big if it's a big slot?" He is right, and the two
square tiers above are the reason he had to ask. Every cosmetic is drawn on a
FULL-BODY square so it registers against the body when eight layers stack, so a
hat is a small patch near the top of its 640 canvas and the rest is transparent
padding that still decodes. Measured on this tree, alpha > 14 (the same
threshold drawTrimmedArt uses), longest ink side per item on the 192 sheets:

    slot   n   median ink   of the 192x192 canvas that is NOT ink
    BG    22      192 px     0.0%      <- backgrounds already fill it
    B     32      112        66.0%
    IR    24       97        74.0%
    T     24       93        81.2%
    IL    38       83        79.3%
    C      6       66        88.9%
    H     57       61        90.4%
    SK    32       61        89.9%
    FW    19       53        92.2%
    P     13       51        93.2%
    S     12       50        93.2%
    U      7       41        95.4%
    E     36       30        97.3%
    M     24       28        96.8%
    G     18       11        99.6%

So this tier crops each master to its alpha box FIRST and only then scales the
longest side down to TRIM. A 192px trim thumbnail is 192px OF GARMENT.

ONLY FOR THE CANVASES, never for a stacked <img>. drawTrimmedArt already finds
the alpha box and draws it centred, so it does not care where the ink sat: art
that arrives pre-cropped comes out pixel-identical, just decoded smaller. The
stacked layers in avatarLayersHtml (and the Collection's tiles, and the crew
backdrop) DO care -- the square IS their registration -- and they keep the
square tiers. js/app.js bhTrim() is the one function that serves this tier.

NEVER UPSCALES. `min(TRIM, the master's own ink)` is deliberate: a grillz carries
37 ink pixels in its 640 master, and blowing that up to 192 would be inventing
resolution the art does not have. It writes 37 and the canvas draws exactly the
pixels it draws today from the master, at 1/300th of the decode.

Idempotent. Run after adding art:  python3 scripts/build-bh-thumbs.py
"""
import os
import re
import sys
from PIL import Image

SIZES = [192, 384]
# The trimmed tier's cap. Its consumers are 200x200 and 80x80 canvases, and the
# largest ink any of them draws is 168 backing-store pixels (a 200 canvas at
# pad 0.08), measured by wrapping drawImage on the real Wardrobe render. 192 is
# that with headroom, and the backing store caps the physical size whatever the
# device pixel ratio is, so this tier is a downscale on every screen.
TRIM = 192
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'bh')
OUT = os.path.join(SRC, 'thumb')

# The SAME rule js/app.js's bhThumb() uses, so the two cannot drift: the flat
# per-slot cosmetic art, plus the shiny pet recolours. Anything else (fx frames,
# glutton plates, the mage, the pet animation strips) is not tiled anywhere and
# keeps its own size.
#
# THE PET-ACCESSORY SLOTS ARE IN HERE TOO (CB bag, CE glasses, CG stinger, CM
# patches), and their absence was the more expensive half of the C6 bug. Those
# five masters are 2048x2048, so ONE of them costs 16.0000 MB decoded -- ten
# times a body cosmetic -- and they are drawn as WORN LAYERS beside the pet on
# every surface she appears on, four at a time on a dressed pet. Measured on
# this tree 2026-08-24, 430x932 DPR 2, an account owning her and wearing all
# four: Today mounted 10 pet layers for 160.0 MB, the Stable 30 for 480.0 MB and
# the Paddock 48 for 652.5 MB, against the 90 MB ceiling
# tests/memory-census.mjs enforces. They were excluded here for the same reason
# they were excluded from bhThumb's regex: the slots did not exist when this
# list was written, and nothing since had a reason to walk it again.
SLOTS = ['B', 'BG', 'C', 'CB', 'CE', 'CG', 'CM', 'E', 'FW', 'G', 'H', 'IL', 'IR',
         'M', 'P', 'S', 'SK', 'T', 'U']
KEEP = re.compile(r'^(?:%s)/(?:shiny/)?[^/]+\.png$' % '|'.join(SLOTS))


def trimmed(im):
    """The master cropped to its alpha box, longest side capped at TRIM.

    Threshold 14 and no upscale: both mirror drawTrimmedArt. A fully
    transparent file (there are none today) keeps its whole canvas rather than
    becoming a zero-sized PNG."""
    box = im.getchannel('A').point(lambda p: 255 if p > 14 else 0).getbbox()
    cut = im.crop(box) if box else im
    k = TRIM / max(cut.size)
    return cut.resize((max(1, round(cut.width * k)), max(1, round(cut.height * k))),
                      Image.LANCZOS) if k < 1 else cut


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
            dst = os.path.join(OUT, 'trim', rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            trimmed(im).save(dst, optimize=True)
            total_out += os.path.getsize(dst)
            made += 1
    print('%d thumbnails across tiers %s + trim in %s'
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
