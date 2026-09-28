"""Turn an illustration (a map, a product silhouette, a logo) into a dot grid for motion.js drawDots.

    .venv/bin/python tools/dotmap.py in.png out.json [--step 15] [--thresh 60] [--exclude x0,y0,x1,y1 ...] [--preview p.png]

The shape is every pixel that differs from the background (the most common corner colour) by more than
--thresh, closed, hole-filled and opened so pins, labels and thin decorative lines do not leave holes or
strays. Dots sit on a staggered grid every --step source pixels.
Output: {"src": [x0, y0, width], "aspect": h/w, "dots": [[x, y], ...]} in map units (x 0..1, y 0..aspect).
Place pins from the source image with motion.js dotUnits(map, [px, py]).
"""
import argparse
import json

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_closing, binary_fill_holes, binary_opening

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("out")
ap.add_argument("--step", type=int, default=15)
ap.add_argument("--thresh", type=float, default=60)
ap.add_argument("--exclude", nargs="*", default=[], help="source-pixel boxes to drop, e.g. inset maps")
ap.add_argument("--preview")
a = ap.parse_args()

src = Image.open(a.src).convert("RGBA")  # palette PNGs with transparency: composite on white, or clear pixels read as black
im = np.asarray(Image.alpha_composite(Image.new("RGBA", src.size, "white"), src).convert("RGB")).astype(int)
H, W, _ = im.shape
corners = [tuple(im[y, x]) for y, x in [(0, 0), (0, W - 1), (H - 1, 0), (H - 1, W - 1)]]
bg = np.array(max(set(corners), key=corners.count))
m = np.abs(im - bg).sum(2) > a.thresh
m = binary_opening(binary_fill_holes(binary_closing(m, iterations=4)), iterations=4)
boxes = [tuple(map(int, b.split(","))) for b in a.exclude]
dots = [(x, y) for y in range(0, H, a.step) for x in range((y // a.step) % 2 * a.step // 2, W, a.step)
        if m[y, x] and not any(x0 <= x <= x1 and y0 <= y <= y1 for x0, y0, x1, y1 in boxes)]
xs, ys = [p[0] for p in dots], [p[1] for p in dots]
x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
json.dump({"src": [x0, y0, x1 - x0], "aspect": round((y1 - y0) / (x1 - x0), 4),
           "dots": [[round((x - x0) / (x1 - x0), 4), round((y - y0) / (x1 - x0), 4)] for x, y in dots]}, open(a.out, "w"))
if a.preview:
    p = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(p)
    for x, y in dots:
        d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(20, 20, 20))
    p.save(a.preview)
print(f"{a.out}: {len(dots)} dots, aspect {(y1 - y0) / (x1 - x0):.3f}")
