"""Contact sheet from a folder of stills, labelled with each file's name.

    .venv/bin/python sheet.py <stills-dir> <out.jpg> [--cols 6] [--width 320]
"""
import argparse
import glob
import os

from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("out")
ap.add_argument("--cols", type=int, default=6)
ap.add_argument("--width", type=int, default=320)
a = ap.parse_args()
files = sorted(glob.glob(os.path.join(a.src, "*.jpg")) + glob.glob(os.path.join(a.src, "*.png")))
first = Image.open(files[0])
W = a.width
H = round(W * first.height / first.width)
rows = (len(files) + a.cols - 1) // a.cols
sheet = Image.new("RGB", (W * a.cols, (H + 18) * rows), "white")
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((W, H), Image.LANCZOS)
    x, y = (i % a.cols) * W, (i // a.cols) * (H + 18)
    sheet.paste(im, (x, y + 18))
    d.text((x + 4, y + 3), os.path.splitext(os.path.basename(f))[0], fill="black")
sheet.save(a.out, quality=88)
print(f"{a.out}: {len(files)} frames")
