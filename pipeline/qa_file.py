"""Automated QA on a rendered deliverable. Exit code 1 on any FAIL.

    .venv/bin/python qa_file.py <file.mp4> --page film.html [--fps 60] [--lufs -14] [--tp -1.0] [--sheet out.jpg]

Checks, all against the page the file was rendered from:
  FAIL  stream format: H.264 yuv420p, size, 60 fps, AAC 48 kHz stereo
  FAIL  colour tags: bt709 primaries, transfer and matrix, limited range (untagged files shift brand colours)
  FAIL  frame count: round(duration x fps) +-1
  FAIL  decode errors on a full decode
  FAIL  integrated loudness off target by more than 1 LU, or true peak above the ceiling (measured after AAC)
  FAIL  colour drift: frames decoded as a player would (BT.709) vs browser stills at the same times,
        compared on static flat areas; any channel off by more than 3 levels fails
  Also writes a contact sheet pulled from the file itself, including the last frame.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy.ndimage import minimum_filter, uniform_filter

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("file")
ap.add_argument("--page", required=True)
ap.add_argument("--fps", type=float, default=60)
ap.add_argument("--lufs", type=float, default=-14.0)
ap.add_argument("--tp", type=float, default=-1.0)
ap.add_argument("--samples", type=int, default=10)
ap.add_argument("--sheet")
ap.add_argument("--report")
a = ap.parse_args()
fails, info = [], {}


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def page_meta():
    js = ("const {launch,openFilm}=require(%r);(async()=>{const b=await launch();const {film}=await openFilm(b,%r);"
          "console.log(JSON.stringify(film));await b.close();})()") % (os.path.join(HERE, "lib.js"), a.page)
    for attempt in range(3):
        r = run(["node", "-e", js])
        if r.returncode == 0 and r.stdout.strip():
            return json.loads(r.stdout.strip().splitlines()[-1])
    sys.exit("could not boot the page: " + r.stderr.strip()[-500:])


film = page_meta()
W, H, D = film["width"], film["height"], film["duration"]
expect = int(D * a.fps + 0.5)  # half up, like Math.round in render.js

# ---- streams and tags ----
pr = json.loads(run(["ffprobe", "-v", "error", "-count_packets", "-show_entries",
                     "stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,nb_read_packets,color_primaries,color_transfer,color_space,color_range,sample_rate,channels",
                     "-of", "json", a.file]).stdout)
v = next(s for s in pr["streams"] if s["codec_type"] == "video")
au = next((s for s in pr["streams"] if s["codec_type"] == "audio"), None)
num, den = map(int, v["r_frame_rate"].split("/"))
info["video"] = {k: v.get(k) for k in ["codec_name", "width", "height", "pix_fmt", "r_frame_rate", "nb_read_packets", "color_primaries", "color_transfer", "color_space", "color_range"]}
if v["codec_name"] != "h264" or v["pix_fmt"] != "yuv420p":
    fails.append(f"video is {v['codec_name']} {v['pix_fmt']}, expected h264 yuv420p")
if (v["width"], v["height"]) != (W, H):
    fails.append(f"size {v['width']}x{v['height']}, expected {W}x{H}")
if abs(num / den - a.fps) > 0.01:
    fails.append(f"frame rate {v['r_frame_rate']}, expected {a.fps}")
for k, want in [("color_primaries", "bt709"), ("color_transfer", "bt709"), ("color_space", "bt709"), ("color_range", "tv")]:
    if v.get(k) != want:
        fails.append(f"{k} is {v.get(k)}, expected {want}")
if int(v["nb_read_packets"]) != expect:
    fails.append(f"{v['nb_read_packets']} frames, expected {expect} ({D:.3f} s at {a.fps} fps)")
if not au or au["codec_name"] != "aac" or au.get("sample_rate") != "48000" or au.get("channels") != 2:
    fails.append(f"audio is {au and (au['codec_name'], au.get('sample_rate'), au.get('channels'))}, expected aac 48000 stereo")

# ---- full decode ----
dec = run(["ffmpeg", "-v", "error", "-i", a.file, "-f", "null", "-"])
if dec.stderr.strip():
    fails.append("decode errors: " + dec.stderr.strip()[:300])

# ---- loudness after encoding ----
if au:
    lo = run(["ffmpeg", "-hide_banner", "-nostats", "-i", a.file, "-map", "0:a", "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
    summ = lo[lo.rfind("Summary:"):]
    I = float(re.search(r"I:\s+(-?[\d.]+) LUFS", summ).group(1))
    TP = float(re.search(r"Peak:\s+(-?[\d.]+|-inf) dBFS", summ).group(1))
    info["loudness"] = {"integrated_lufs": I, "true_peak_dbtp": TP}
    if abs(I - a.lufs) > 1.0:
        fails.append(f"integrated loudness {I} LUFS, target {a.lufs} +-1")
    if TP > a.tp:
        fails.append(f"true peak {TP} dBTP above {a.tp}")


# ---- colour: decoded frames vs browser stills on static flat areas ----
def frame_raw(t):
    p = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.6f}", "-i", a.file, "-frames:v", "1",
                        "-vf", "scale=in_color_matrix=bt709:in_range=tv:out_color_matrix=bt709:out_range=pc:flags=accurate_rnd+full_chroma_int,format=rgb24",
                        "-f", "rawvideo", "-"], capture_output=True)
    return np.frombuffer(p.stdout, np.uint8).reshape(H, W, 3).astype(np.float64)


tmp = tempfile.mkdtemp(prefix="qa_")
# Evenly spaced samples plus the end card, which is static in every film, so colour is always verifiable.
frames = [int(round((k + 0.5) / a.samples * expect)) for k in range(a.samples)] + [expect - 30, expect - 3]
# Grain switches tile every 1/24 s: keep each sample mid-tile (frame n at 60 fps is 0.4 n grain frames),
# so the browser stills around it share one grain tile and static areas are really static.
frames = [next(g for g in (f, f - 1, f + 1, f - 2, f + 2) if 0 <= g < expect and 0.25 <= (g * 24 / a.fps) % 1 <= 0.75) for f in frames]
times = [f / a.fps for f in frames]
eps = 0.002
stills = ",".join(f"{t - eps:.6f},{t:.6f},{t + eps:.6f}" for t in times)
r = run(["node", os.path.join(HERE, "stills.js"), "--page", a.page, "--out", tmp, "--t", stills, "--png"])
if r.returncode:
    fails.append("stills.js failed: " + r.stderr[-300:])
worst, drift = 0.0, []
for f, t in zip(frames, times):
    ld = lambda tt: np.asarray(Image.open(os.path.join(tmp, "t" + f"{tt:.3f}".rjust(8, "0") + ".png")).convert("RGB"), np.float64)
    try:
        b0, b1, b2 = ld(t - eps), ld(t), ld(t + eps)
    except FileNotFoundError:
        continue
    m = frame_raw(t)
    static = (np.abs(b0 - b1).max(axis=2) < 1.5) & (np.abs(b2 - b1).max(axis=2) < 1.5)
    # Flatness on a 7 px blur, so film grain does not count as detail but edges and gradients do.
    lum = uniform_filter(b1.mean(axis=2), 7)
    grad = np.abs(np.diff(lum, axis=0, append=0)) + np.abs(np.diff(lum, axis=1, append=0))
    # Large flat regions only (31 px erosion): text strokes and thin UI are excluded, because 4:2:0 chroma
    # subsampling legitimately bleeds colour into them. A wrong colour matrix shifts big flat areas, which remain.
    flat = minimum_filter(static & (grad < 1.5), size=31)
    cover = flat.mean()
    if cover < 0.02:
        drift.append({"t": round(t, 3), "coverage": round(float(cover), 3)})
        continue
    bb = np.stack([uniform_filter(b1[..., c], 9) for c in range(3)], -1)[flat]
    mm = np.stack([uniform_filter(m[..., c], 9) for c in range(3)], -1)[flat]
    d = np.abs(bb.mean(axis=0) - mm.mean(axis=0))
    p95 = np.percentile(np.abs(bb - mm), 95, axis=0)
    worst = max(worst, float(d.max()))
    drift.append({"t": round(t, 3), "coverage": round(float(cover), 3), "mean_diff_rgb": [round(float(x), 2) for x in d], "p95_rgb": [round(float(x), 1) for x in p95],
                  "still_rgb": [round(float(x), 1) for x in bb.mean(axis=0)], "file_rgb": [round(float(x), 1) for x in mm.mean(axis=0)]})
    if d.max() > 3.0:
        fails.append(f"colour drift at t={t:.2f}: mean diff {d.round(1).tolist()} on static areas (limit 3)")
info["colour"] = {"worst_mean_diff": round(worst, 2), "samples": drift}
checked = sum(1 for s in drift if "mean_diff_rgb" in s)
if checked < 2:
    fails.append(f"colour not verifiable: only {checked} samples had static flat areas")

# ---- contact sheet from the file itself ----
if a.sheet:
    n = 24
    idx = [int(k * (expect - 1) / (n - 1)) for k in range(n)]
    sel = "+".join(f"eq(n\\,{i})" for i in idx)
    cols = 6 if W >= H else 8
    tw = 320 if W >= H else 200
    th = round(tw * H / W)
    run(["ffmpeg", "-y", "-v", "error", "-i", a.file, "-vf", f"select='{sel}',scale={tw}:{th},tile={cols}x{(n + cols - 1) // cols}", "-frames:v", "1", "-q:v", "3", a.sheet])
    info["sheet"] = a.sheet

report = {"file": a.file, "page": a.page, "pass": not fails, "fails": fails, **info}
if a.report:
    json.dump(report, open(a.report, "w"), indent=1)
print(f"QA file {os.path.basename(a.file)}: {'PASS' if not fails else 'FAIL'}")
print(f"  {v['width']}x{v['height']} {v['r_frame_rate']} {v['nb_read_packets']} frames, tags {v.get('color_primaries')}/{v.get('color_transfer')}/{v.get('color_space')}/{v.get('color_range')}")
if "loudness" in info:
    print(f"  loudness {info['loudness']['integrated_lufs']} LUFS, true peak {info['loudness']['true_peak_dbtp']} dBTP")
print(f"  colour: worst mean diff {worst:.2f} levels on static areas, {checked} of {len(drift)} samples verifiable")
for f in fails:
    print("  FAIL " + f)
sys.exit(1 if fails else 0)
