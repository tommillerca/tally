"""Build the cauldron candidates for the Kitchen's "Empty pot" slot.

Source of truth is Tom's own assets/icons-pix/kitchen.png (48x48, PixelLab).
NOTHING here resamples: every operation is a per-pixel recolour or an integer
translation, so the colour-count-in / colour-count-out test stays honest.
Run: python3 tools/make-cauldrons.py
"""
import numpy as np
from PIL import Image
import os

SRC = 'assets/icons-pix/kitchen.png'
OUT = 'mockups/kitchen-art/cand'
os.makedirs(OUT, exist_ok=True)

a0 = np.array(Image.open(SRC).convert('RGBA')).astype(int)


def klass(p):
    r, g, b, al = p
    if al <= 16:
        return '.'
    L = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if g > r + 18 and g > b + 18:
        return 'G'
    if b > g + 18 and r > g + 8:
        return 'P'
    if L < 40:
        return '#'
    if L > 190:
        return 'H'
    if L > 120:
        return 'm'
    return 'd'


K = np.array([[klass(a0[y, x]) for x in range(48)] for y in range(48)])
L0 = 0.2126 * a0[..., 0] + 0.7152 * a0[..., 1] + 0.0722 * a0[..., 2]


def save(arr, name):
    Image.fromarray(arr.astype(np.uint8), 'RGBA').save(f'{OUT}/{name}.png')
    return f'{OUT}/{name}.png'


# ---------------------------------------------------------------- B: lit brew
# Only the brew changes. The pot, handles, legs and rim are Tom's pixels,
# untouched. The green goes onto the app's OWN accent ramp (--accent #a5e847).
# ONE HUE IN THE POOL: the shipped drawing carries green AND muddy purple
# (#946298) across a brew band four rows deep, and at 24 CSS px four rows of two
# competing hues is speckle, not liquid. The purple in the pool joins the green
# ramp; only the floating 4x4 cube above the rim stays violet (--violet #9b92e8),
# because it is the one purple shape big enough to survive the size.
ACC = [(0x33, 0x54, 0x14), (0x5f, 0x8f, 0x22), (0x8b, 0xd4, 0x50), (0xc4, 0xf2, 0x8a), (0xe6, 0xfc, 0xc4)]
VIO = [(0x4a, 0x40, 0x82), (0x9b, 0x92, 0xe8), (0xcf, 0xc9, 0xff)]

b = a0.copy()
gl = L0[K == 'G']
glo, ghi = gl.min(), gl.max()
for y in range(48):
    for x in range(48):
        k = K[y, x]
        if k == 'P' and y < 11:                       # the floating cube only
            t = (L0[y, x] - 30) / 110.0
            b[y, x, :3] = VIO[min(max(int(t * len(VIO)), 0), len(VIO) - 1)]
        elif k in 'GP':
            t = (L0[y, x] - glo) / max(ghi - glo, 1)
            b[y, x, :3] = ACC[min(max(int(t * len(ACC)), 0), len(ACC) - 1)]
# one lit inner-rim line so the pool has an edge to sit against, drawn only
# where the rim already meets brew directly below it
for x in range(48):
    for y in range(12, 20):
        if K[y, x] in 'mdH' and K[y + 1, x] == 'G':
            b[y, x, :3] = (0x6f, 0x8f, 0x4a)
            break
save(b, 'b-lit-brew')

# --------------------------------------------------------------- C: cold pot
# The card says "Empty pot". This one IS empty: no brew, no steam, no floating
# bits, dark iron interior. Removing the steam column frees the top third of
# the frame, so the pot is translated up to sit centred in its box (an integer
# shift, not a scale).
c = a0.copy()
IRON = [(0x1a, 0x16, 0x13), (0x2c, 0x26, 0x20), (0x3d, 0x35, 0x2c)]
for y in range(48):
    for x in range(48):
        if K[y, x] in 'GP':
            if y <= 19:                     # inside the mouth: cold iron
                t = (L0[y, x] - glo) / max(ghi - glo, 1)
                c[y, x, :3] = IRON[min(max(int(t * len(IRON)), 0), len(IRON) - 1)]
            else:
                # the spill running down the belly. Darkening it left a smear
                # that read as a crack, so it is infilled from the body pixel
                # six columns inboard on the same row instead.
                c[y, x] = c[y, x - 6] if x > 24 else c[y, x + 6]
# steam furniture above the rim: the wisp column, the floating bits and the bone
# spoon. The rim's own top edge lives on y11-y12, so those two rows are cleared
# by COLUMN, not wholesale, or the pot loses its lip.
c[0:11, :] = 0
c[11, 0:17] = 0
c[11, 32:] = 0
c[12, 0:12] = 0
c[12, 32:] = 0
# recentre: shift the remaining ink so its bbox is centred in the 48 frame
ys, xs = np.where(c[..., 3] > 16)
dy = int(round((48 - 1 - ys.max() - ys.min()) / 2))
dx = int(round((48 - 1 - xs.max() - xs.min()) / 2))
c = np.roll(np.roll(c, dy, axis=0), dx, axis=1)
save(c, 'c-cold-pot')

# ---------------------------------------------------------- report + A is src
for n, p in [('A as-shipped', SRC), ('B lit-brew', f'{OUT}/b-lit-brew.png'),
             ('C cold-pot', f'{OUT}/c-cold-pot.png')]:
    im = Image.open(p).convert('RGBA')
    for s in (48, 24):
        r = np.array(im.resize((s, s), Image.NEAREST))
        op = r[..., 3] > 16
        cols = len({tuple(q) for q in r.reshape(-1, 4) if q[3] > 16})
        lum = (0.2126 * r[..., 0] + 0.7152 * r[..., 1] + 0.0722 * r[..., 2])[op]
        ys2, xs2 = np.where(op)
        cy, cx = ys2.mean(), xs2.mean()
        print(f'{n:14s} @{s:2d}  cols={cols:3d}  ink={op.sum():4d}  '
              f'medianL={np.median(lum):5.1f}  centroid=({cx / (s - 1) * 100:4.1f}%,{cy / (s - 1) * 100:4.1f}%)  '
              f'bbox={xs2.max() - xs2.min() + 1}x{ys2.max() - ys2.min() + 1}')
