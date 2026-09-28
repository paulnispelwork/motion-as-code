"""Punctuation metrics for a rendered film: how much of the motion sits in hits, and how many hits.

    python peaks.py film.mp4 [more.mp4 ...]      one JSON line per file

med / p95   median and 95th percentile of the frame-to-frame luminance difference (levels 0-255, 3-frame smoothed)
peak        p95 / median: high = rest punctuated by hits, low = even, always-on motion
top10share  % of all motion in the busiest 10 % of frames
hits_per10  local motion peaks above 3x the median (and above 1.5 levels), at least 0.25 s apart, per 10 s
"""
import sys, subprocess, json, numpy as np
from motion import probe


def an(f, fps=30):
    W, H, dur, aud = probe(f)
    w = 128
    h = int(round(H * w / W / 2) * 2)
    p = subprocess.run(["ffmpeg", "-v", "quiet", "-i", f, "-vf", f"fps={fps},scale={w}:{h}:flags=area,format=gray",
                        "-f", "rawvideo", "-"], capture_output=True)
    a = np.frombuffer(p.stdout, np.uint8).reshape(-1, h, w).astype(np.float32)
    d = np.abs(np.diff(a, axis=0)).mean(axis=(1, 2))
    ds = np.convolve(d, np.ones(3) / 3, "same")  # smooth over 3 frames
    med = np.median(ds)
    p95 = np.percentile(ds, 95)
    top = np.sort(d)[::-1]
    share = top[: len(d) // 10].sum() / max(d.sum(), 1e-6)
    hits = []
    for i in range(1, len(ds) - 1):
        if ds[i] >= ds[i - 1] and ds[i] >= ds[i + 1] and ds[i] > max(3 * med, 1.5):
            if not hits or i - hits[-1] > fps * 0.25:
                hits.append(i)
    return dict(file=f.split("/")[-1], med=round(float(med), 2), p95=round(float(p95), 2),
                peak=round(float(p95 / max(med, 0.05)), 1), top10share=round(float(share) * 100),
                hits_per10=round(len(hits) / (len(d) / fps / 10), 1))


if __name__ == "__main__":
    for f in sys.argv[1:]:
        print(json.dumps(an(f)))
