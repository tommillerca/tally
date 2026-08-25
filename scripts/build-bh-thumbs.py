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
And `--check` rebuilds every tier IN MEMORY and diffs it against what is
committed, writing nothing: see check() for the class of bug that needs.
"""
import os
import re
import sys
from PIL import Image, ImageChops

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


def use_root(root):
    """Point SRC/OUT at another tree. ONLY --check may do this, and only so its
    own positive control can be a real run against a deliberately broken tree
    rather than a claim in a comment. Refused in build mode, which would
    otherwise write a half-populated sheet into an arbitrary directory."""
    global SRC, OUT
    SRC = os.path.join(root, 'assets', 'bh')
    OUT = os.path.join(SRC, 'thumb')

# The SAME rule js/app.js's bhThumb() uses, so the two cannot drift: the flat
# per-slot cosmetic art, plus the shiny pet recolours. Anything else (fx frames,
# glutton plates, the mage, the pet animation strips) is not tiled anywhere and
# keeps its own size.
SLOTS = ['B', 'BG', 'C', 'E', 'FW', 'G', 'H', 'IL', 'IR', 'M', 'P', 'S', 'SK', 'T', 'U']
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


def sources():
    """Every (path, path-relative-to-assets/bh) the tiers are built from."""
    for dirpath, _dirs, files in os.walk(SRC):
        if os.path.commonpath([dirpath, OUT]) == OUT:
            continue                      # never thumbnail the thumbnails
        for f in sorted(files):
            if not f.lower().endswith('.png'):
                continue
            src = os.path.join(dirpath, f)
            rel = os.path.relpath(src, SRC)
            if KEEP.match(rel):
                yield src, rel


def wanted(im):
    """Every (tier directory, expected image) this master should produce.

    ONE definition of the whole sheet, so build() and check() cannot disagree
    about what belongs on it. That mattered the first time this file grew a
    check: the two walked the tree separately and a slot dropped from SLOTS
    would have gone unbuilt AND unchecked, in lockstep, reporting clean.
    """
    for px in SIZES:
        if max(im.size) > px:             # already smaller than this tier
            yield str(px), im.resize((px, px), Image.LANCZOS)
    yield 'trim', trimmed(im)


def build():
    made = skipped = 0
    total_src = total_out = 0
    for src, rel in sources():
        im = Image.open(src).convert('RGBA')
        total_src += os.path.getsize(src)
        skipped += sum(1 for px in SIZES if max(im.size) <= px)
        for tier, out in wanted(im):
            dst = os.path.join(OUT, tier, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            out.save(dst, optimize=True)
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


def check():
    """--check: is every committed thumbnail still what this generator makes?

    THE DEFECT CLASS, found 2026-08-24. A master is redrawn, committed, and
    nobody re-runs this script, so every surface fed by the sheet keeps serving
    the OLD artwork: eight cosmetics (GS1-3, IL9, IL10-1/2, IL17-1/2) had been
    in that state since v385 redrew them on 2026-08-16, two days after the
    sheet was last built. The other half of the class is a master with NO
    thumbnail at all, and it was not theoretical: C6, the 50,000-coin
    legendary pet, had no square tiers, and the Collection's grid (js/app.js,
    the `looks` tab) asks bhThumb for one. That <img> carries no onerror, so
    the tile rendered as a broken-image icon with the alt text "Bumbleseal".
    Measured in a real browser on e2cb252d: 404, naturalWidth 0.

    So: rebuild every tier IN MEMORY and compare to what is committed. Nothing
    is written. Non-zero exit means run this script without --check.

    CEILING: this pins the committed bytes against Pillow's LANCZOS. Measured
    byte-identical across Pillow 11.3.0/Python 3.9 and 12.2.0/Python 3.13, so
    the pin is not fragile today, but a future resampler change would read as
    drift on the WHOLE sheet at once. The ratio is printed on every failing run
    for exactly that reason: a handful of files is real drift, 100% is a
    toolchain change and you should not blindly commit the rebuild.
    """
    missing, stale, checked = [], [], 0
    for src, rel in sources():
        im = Image.open(src).convert('RGBA')
        for tier, want in wanted(im):
            dst = os.path.join(OUT, tier, rel)
            if not os.path.exists(dst):
                missing.append('%s/%s' % (tier, rel))
                continue
            checked += 1
            got = Image.open(dst).convert('RGBA')
            if got.size != want.size:
                stale.append('%s/%s  committed %dx%d, should be %dx%d'
                             % (tier, rel, got.size[0], got.size[1], want.size[0], want.size[1]))
                continue
            diff = ImageChops.difference(got, want)
            box = diff.getbbox()
            if box:
                stale.append('%s/%s  %dx%d px differ from (%d,%d), worst channel %d/255'
                             % (tier, rel, box[2] - box[0], box[3] - box[1], box[0], box[1],
                                max(hi for _lo, hi in diff.getextrema())))
    print('checked %d committed thumbnails against a fresh render of their masters' % checked)
    for m in missing:
        print('MISSING  thumb/%s  (a surface asking for this tier gets a 404)' % m)
    for s in stale:
        print('STALE    thumb/%s' % s)
    if not checked:
        print('CHECKED NOTHING: that is a failure, not a clean run.', file=sys.stderr)
        return 1
    if missing or stale:
        graded = checked + len(missing)
        print('\n%d missing, %d stale, %.0f%% of the %d graded. Run: python3 scripts/build-bh-thumbs.py'
              % (len(missing), len(stale), 100.0 * (len(missing) + len(stale)) / graded, graded),
              file=sys.stderr)
        if len(missing) + len(stale) == graded:
            print('EVERY file differs, which is a Pillow/resampler change and NOT art drift. '
                  'Do not commit a whole-sheet rebuild without saying so.', file=sys.stderr)
        return 1
    print('all fresh')
    return 0


if __name__ == '__main__':
    args = sys.argv[1:]
    checking = '--check' in args
    if '--root' in args:
        if not checking:
            print('--root is only valid with --check', file=sys.stderr)
            sys.exit(2)
        use_root(args[args.index('--root') + 1])
    sys.exit(check() if checking else build())
