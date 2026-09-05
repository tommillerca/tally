#!/usr/bin/env python3
# ponytail: throwaway proof helper, not app code. Two jobs: sample dark pixels
# in a rectangle (cleats outline measurement) and crop+upscale the lower part
# of a screenshot (the feet zoom). No deps beyond PIL, which is already on this
# machine's python3.
import sys, json
from PIL import Image

def measure(path, x, y, w, h, thresh):
    im = Image.open(path).convert('RGBA')
    W, H = im.size
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    if x1 <= x0 or y1 <= y0:
        print(json.dumps({'error': f'empty bbox after clamp: ({x0},{y0})-({x1},{y1}) in {W}x{H}'}))
        return
    px = im.crop((x0, y0, x1, y1)).load()
    cw, ch = x1 - x0, y1 - y0
    n_all = n_dark = 0
    sum_all = [0, 0, 0]
    sum_dark = [0, 0, 0]
    for j in range(ch):
        for i in range(cw):
            r, g, b, a = px[i, j]
            if a == 0:
                continue
            n_all += 1
            sum_all[0] += r; sum_all[1] += g; sum_all[2] += b
            luma = 0.299 * r + 0.587 * g + 0.114 * b
            if luma < thresh:
                n_dark += 1
                sum_dark[0] += r; sum_dark[1] += g; sum_dark[2] += b
    print(json.dumps({
        'image': f'{W}x{H}', 'bbox': [x0, y0, cw, ch],
        'n_all': n_all, 'n_dark': n_dark,
        'mean_dark_rgb': [round(s / n_dark, 1) for s in sum_dark] if n_dark else None,
        'mean_all_rgb': [round(s / n_all, 1) for s in sum_all] if n_all else None,
    }))

def diffbbox(path_a, path_b, thresh, pad):
    # The garment layers in this app are full-canvas transparent PNGs (each
    # <img> covers the whole stage; only its own alpha shows), so an element's
    # getBoundingClientRect() cannot find "the boot's footprint" -- it just
    # returns the stage box. Rendering the SAME view with the garment
    # equipped vs not and diffing isolates exactly the pixels that garment
    # draws, no guessing about where on the canvas it sits.
    a = Image.open(path_a).convert('RGB')
    b = Image.open(path_b).convert('RGB')
    if a.size != b.size:
        print(json.dumps({'error': f'size mismatch {a.size} vs {b.size}'}))
        return
    w, h = a.size
    pa, pb = a.load(), b.load()
    x0, y0, x1, y1, n = w, h, -1, -1, 0
    for j in range(h):
        for i in range(w):
            ra, ga, ba = pa[i, j]
            rb, gb, bb = pb[i, j]
            if abs(ra - rb) + abs(ga - gb) + abs(ba - bb) > thresh:
                n += 1
                if i < x0: x0 = i
                if i > x1: x1 = i
                if j < y0: y0 = j
                if j > y1: y1 = j
    if n == 0:
        print(json.dumps({'error': 'no differing pixels between the two renders', 'n': 0}))
        return
    x0 = max(0, x0 - pad); y0 = max(0, y0 - pad)
    x1 = min(w - 1, x1 + pad); y1 = min(h - 1, y1 + pad)
    print(json.dumps({'bbox': [x0, y0, x1 - x0 + 1, y1 - y0 + 1], 'n': n}))

def cropfeet(src, dst, topfrac, scale):
    im = Image.open(src)
    w, h = im.size
    top = int(h * topfrac)
    crop = im.crop((0, top, w, h))
    crop = crop.resize((crop.width * scale, crop.height * scale), Image.NEAREST)
    crop.save(dst)
    print(json.dumps({'src': src, 'dst': dst, 'crop_box': [0, top, w, h], 'out_size': list(crop.size)}))

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'measure':
        measure(sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6]), float(sys.argv[7]))
    elif cmd == 'diffbbox':
        diffbbox(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 24, int(sys.argv[5]) if len(sys.argv) > 5 else 6)
    elif cmd == 'cropfeet':
        cropfeet(sys.argv[2], sys.argv[3], float(sys.argv[4]), int(sys.argv[5]))
    else:
        print(json.dumps({'error': f'unknown cmd {cmd}'}))
        sys.exit(1)
