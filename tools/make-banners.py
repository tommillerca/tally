"""Three HAUNTED KITCHEN banner concepts, pixel art, for the .marquee band.

PALETTE IS MEASURED, NOT INVENTED. Every colour below was sampled out of the
shipped 48px art in assets/icons-pix (crate.png for wood, tombstone.png for
stone, ember.png for fire, kitchen.png for iron and brew) or is an app.css
token. Nothing is eyeballed.

NOTHING IS RESAMPLED. The existing 48x48 objects are pasted at 1:1 into a canvas
whose logical pixel equals one CSS pixel, so the browser's only scale is the
integer device-pixel-ratio step under image-rendering: pixelated.

EVERY OBJECT IS BOTTOM-ALIGNED TO A REAL SURFACE by its INK bbox, never by its
48px canvas: those canvases carry different amounts of transparent padding, so
aligning by the frame is what makes a shelf of props look like props floating
near a stick.

THE FIRELIGHT IS QUANTISED. A continuous falloff put 5,059 unique colours in one
440px band; the shipped icons carry 25 to 57 each. A smooth ramp beside hard
pixel edges reads as a JPEG artefact, so the glow is stepped into 4 bands and
the finished canvas is quantised to a fixed palette with dither OFF.

Run: python3 tools/make-banners.py
"""
import os
import numpy as np
from PIL import Image

OUT = 'mockups/kitchen-art/banner'
os.makedirs(OUT, exist_ok=True)
H = 92                                     # .marquee height, app.css
ICO = 'assets/icons-pix'

# ---- measured palette -------------------------------------------------------
INK = (0x03, 0x04, 0x02)
WOOD = [(0x1f, 0x1b, 0x11), (0x3f, 0x32, 0x28), (0x7a, 0x62, 0x4b), (0xc0, 0x85, 0x2f), (0xd3, 0xa4, 0x54)]
STONE = [(0x27, 0x26, 0x21), (0x44, 0x40, 0x35), (0x52, 0x42, 0x32), (0x74, 0x6b, 0x5a), (0x97, 0x88, 0x74)]
FIRE = [(0x78, 0x21, 0x1f), (0xc1, 0x3b, 0x2b), (0xed, 0x60, 0x22), (0xfe, 0xae, 0x3b), (0xf7, 0xc2, 0x40)]
BONE = [(0x8b, 0x7d, 0x6c), (0xb5, 0xa6, 0x91), (0xe0, 0xda, 0xbd)]
BREW = (0xa5, 0xe8, 0x47)
VIOLET = (0x9b, 0x92, 0xe8)

_ink_cache = {}


def ink_box(path):
    if path not in _ink_cache:
        a = np.array(Image.open(path).convert('RGBA'))
        ys, xs = np.where(a[..., 3] > 8)
        _ink_cache[path] = (xs.min(), ys.min(), xs.max(), ys.max(), a)
    return _ink_cache[path]


class Cv:
    def __init__(self, w, h=H):
        self.w, self.h = w, h
        self.a = np.zeros((h, w, 4), np.uint8)

    def px(self, x, y, c, al=255):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.a[y, x] = (*c, al)

    def rect(self, x, y, w, h, c):
        for j in range(y, y + h):
            for i in range(x, x + w):
                self.px(i, j, c)

    def hline(self, x, y, w, c):
        self.rect(x, y, w, 1, c)

    def vline(self, x, y, h, c):
        self.rect(x, y, 1, h, c)

    def _blit(self, a, x, y):
        ih, iw = a.shape[:2]
        for j in range(ih):
            for i in range(iw):
                if a[j, i, 3] > 8 and 0 <= x + i < self.w and 0 <= y + j < self.h:
                    self.a[y + j, x + i] = a[j, i]

    def stand(self, name, cx, surface_y):
        """Put an object ON a surface: its INK bottom lands one px above the line,
           its INK centre lands on cx. 1:1, no scale."""
        x0, y0, x1, y1, a = ink_box(f'{ICO}/{name}.png')
        self._blit(a, cx - (x0 + x1) // 2, surface_y - 1 - y1)
        return (x0 + x1) // 2, y1 - y0 + 1

    def hang(self, name, cx, rail_y):
        """Hang an object off a rail: the string runs from the rail to the ink TOP,
           so there is never a gap and never a hidden string."""
        x0, y0, x1, y1, a = ink_box(f'{ICO}/{name}.png')
        top = rail_y + 5
        for j in range(rail_y, top):
            self.px(cx, j, BONE[0])
        self._blit(a, cx - (x0 + x1) // 2, top - y0)

    def firelight(self, cx, cy, r, c, peak=.36, steps=4):
        """Stepped falloff: pixel art has bands, not gradients."""
        for j in range(max(0, cy - r), min(self.h, cy + r + 1)):
            for i in range(max(0, cx - r), min(self.w, cx + r + 1)):
                d = ((i - cx) ** 2 + ((j - cy) * 1.45) ** 2) ** .5
                if d > r:
                    continue
                band = int((1 - d / r) * steps)
                if band <= 0:
                    continue
                k = peak * band / steps
                if self.a[j, i, 3] > 8:
                    self.a[j, i, :3] = np.clip(self.a[j, i, :3] * (1 - k) + np.array(c) * k, 0, 255)
                else:
                    self.a[j, i] = (*np.array(c, int), int(k * 70))

    def scrim(self, upto, strength=.94, steps=6):
        """Baked left-side darkener so the title never fights the art, stepped for
           the same reason the firelight is."""
        for i in range(upto):
            band = int((1 - i / upto) * steps + .5)
            k = strength * band / steps
            m = self.a[:, i, 3] > 8
            self.a[:, i, :3][m] = (self.a[:, i, :3][m] * (1 - k)).astype(np.uint8)
            self.a[:, i, 3][m] = (self.a[:, i, 3][m] * (1 - k * .5)).astype(np.uint8)

    def type_gutter(self, x0, x1, y0, y1, k=.62):
        """An extra darkening exactly where the headline and its subtitle sit.
           Measured, not guessed: the type box is band x17-239 y15-56 (read off
           the render), and the banner canvas is right-anchored, so the same
           box in canvas coordinates is that range shifted by (w - band width)."""
        for j in range(max(0, y0), min(self.h, y1)):
            for i in range(max(0, x0), min(self.w, x1)):
                if self.a[j, i, 3] > 8:
                    self.a[j, i, :3] = (self.a[j, i, :3] * (1 - k)).astype(np.uint8)

    def quantise(self, n=56):
        rgb = Image.fromarray(self.a[..., :3], 'RGB').quantize(colors=n, method=Image.MEDIANCUT, dither=Image.NONE)
        self.a[..., :3] = np.array(rgb.convert('RGB'))

    def save(self, name):
        self.quantise()
        p = f'{OUT}/{name}.png'
        Image.fromarray(self.a, 'RGBA').save(p)
        cols = len({tuple(q) for q in self.a.reshape(-1, 4) if q[3] > 8})
        print(f'{name:22s} {self.w}x{self.h}  decoded {self.w * self.h * 4 / 1024:6.1f} KB  '
              f'file {os.path.getsize(p) / 1024:5.1f} KB  colours={cols}')


def plank(c, x, y, w, thick=5):
    """A shelf board seen slightly from below: lit top edge, front face, shadow."""
    c.hline(x, y, w, WOOD[4])
    c.hline(x, y + 1, w, WOOD[3])
    for j in range(2, thick - 1):
        c.hline(x, y + j, w, WOOD[2])
    c.hline(x, y + thick - 1, w, WOOD[0])
    c.vline(x, y, thick, WOOD[1])
    c.vline(x + w - 1, y, thick, WOOD[1])
    for i in range(x + 7, x + w - 4, 13):
        c.px(i, y + 2, WOOD[1])


def bracket(c, x, y, h):
    for j in range(h):
        c.vline(x, y + j, 1, WOOD[1])
        c.px(x + 1, y + j, WOOD[0])


def flame(c, cx, base, scale=1.0):
    for w, h, col in [(15, 11, FIRE[0]), (11, 10, FIRE[1]), (7, 8, FIRE[2]), (4, 5, FIRE[3])]:
        w, h = max(2, int(w * scale)), max(2, int(h * scale))
        for j in range(h):
            ww = max(1, int(w * (1 - j / h) ** .55))
            c.hline(cx - ww // 2, base - j - 1, ww, col)


def fire_under(c, name, cx, base):
    """A pot ON a fire, drawn in the order the eye expects: logs, then the big
       flame behind, then the pot over both, then two licks that escape past its
       belly. Drawing the flame last (the first cut) painted it across the
       cauldron's legs and made the pot look like it was floating on a candle."""
    for dx, dy in [(-15, 0), (-7, 2), (5, 0), (12, 2)]:
        c.rect(cx + dx, base + dy, 13, 3, WOOD[1])
        c.hline(cx + dx, base + dy, 13, WOOD[2])
        c.px(cx + dx, base + dy + 1, INK)
    flame(c, cx, base + 1)
    c.stand(name, cx, base + 1)
    flame(c, cx - 20, base + 1, .55)
    flame(c, cx + 20, base + 1, .5)


# ============================================================ 1. SHELF CORNER
# The smallest intervention: the band, the type and the garland are untouched and
# only the vector cauldron on the right becomes a pixel pantry corner. Right-
# anchored, so it cannot stretch at any banner width.
c1 = Cv(186)
SHELF = 34
plank(c1, 6, SHELF, 174)
bracket(c1, 12, SHELF + 5, 7)
bracket(c1, 172, SHELF + 5, 7)
for i, k in enumerate(['potion-vital', 'bog', 'salt', 'potion-stone']):
    c1.stand(k, 26 + i * 45, SHELF)
fire_under(c1, 'kitchen', 96, 88)
c1.firelight(96, 80, 46, FIRE[3], .34)
c1.firelight(96, 52, 26, BREW, .16)
c1.scrim(38)
c1.save('1-shelf-corner')

# ================================================================== 2. HEARTH
# The cauldron gets a room. A stone hearth mouth with the fire inside it and two
# bunches strung across the opening: deeper than concept 1, still right-anchored.
c2 = Cv(206)
for j in range(H):
    for i in range(16, 194):
        c2.px(i, j, STONE[1] if 6 < j < H - 4 else STONE[0])
for j in range(10, H, 10):                          # coursing
    c2.hline(18, j, 174, STONE[0])
    for i in range(18 + (20 if (j // 10) % 2 else 0), 192, 40):
        c2.vline(i, j - 10, 10, STONE[0])
c2.rect(16, 0, 5, H, STONE[2])                      # jambs
c2.rect(189, 0, 5, H, STONE[2])
c2.vline(21, 0, H, STONE[3])
c2.vline(188, 0, H, STONE[1])
c2.rect(14, 0, 182, 6, STONE[3])                    # lintel
c2.hline(14, 6, 182, INK)
fire_under(c2, 'kitchen', 105, 85)
c2.firelight(105, 77, 56, FIRE[2], .40)
c2.firelight(105, 48, 30, BREW, .18)
c2.hang('herbs', 44, 7)
c2.hang('graveroot', 168, 7)
c2.scrim(112, .96)
c2.save('2-hearth')

# ========================================================= 3. FULL-BLEED PANTRY
# The whole band becomes the room: a rail of hanging stock across the top, a
# counter across the bottom, the cauldron and its fire anchored right where the
# eye lands last. The title's half is deliberately sparse and scrimmed.
c3 = Cv(430)
RAIL, COUNTER = 4, 88
c3.hline(0, RAIL, 430, WOOD[2])
c3.hline(0, RAIL + 1, 430, WOOD[0])
plank(c3, 0, COUNTER - 5, 430, 5)
for x, k in [(40, 'herbs'), (96, 'bone'), (150, 'sinew'), (206, 'bone'), (258, 'graveroot')]:
    c3.hang(k, x, RAIL + 2)
for x, k in [(30, 'crate'), (86, 'potion-fury'), (136, 'ectoplasm'), (186, 'bog'),
             (236, 'salt'), (284, 'tombstone')]:
    c3.stand(k, x, COUNTER - 5)
fire_under(c3, 'kitchen', 356, 89)
c3.firelight(356, 81, 60, FIRE[3], .38)
c3.firelight(356, 50, 34, BREW, .18)
c3.firelight(70, 30, 44, VIOLET, .10)
c3.scrim(300, .96)
c3.type_gutter(69 + 10, 69 + 245, 8, 60)
c3.save('3-full-bleed-pantry')
