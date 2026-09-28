# Measure: motion, rhythm and grade metrics for rendered films

These scripts decode a rendered MP4 at 30 fps, 128 px wide, in luminance. They report how the motion is spread over the film, how long frames hold, how many visible hits there are, and the grade and palette. They need ffmpeg, numpy and Pillow.

The floors catch the common failures: always-on motion, murky grey grades, big palettes and padded ads. Passing them doesn't make a film good. Only a person watching it play can judge that.

## Run

From the repo root:

```
PY=pipeline/.venv/bin/python; M=pipeline/tools/measure
$PY $M/measure.py films/<name>/review/<film>-preview.mp4 [--ad]   # metrics plus floor flags (ok / LOW)
$PY $M/measure.py film.mp4 --json                                  # merged metrics as JSON
$PY $M/motion.py film.mp4 [more.mp4 …]                             # motion, holds, cuts, grade, palette (JSON lines)
$PY $M/peaks.py  film.mp4 [more.mp4 …]                             # punctuation and hits (JSON lines)
$PY $M/sheet.py  film.mp4 out.jpg [20]                             # contact sheet of N evenly spaced frames
$M/code.sh <label> <page.html> [kit.js …]                          # code counts for a page's source
```

- **On a page,** render a preview first ([RUNBOOK: previews](../../../docs/RUNBOOK.md#previews)), then measure the preview. A 1-sub-frame preview has no motion blur, so it reads more punctuated than the final: on one 12 s reel the preview gave peak 27.3 and a longest hold of 2.8 s, where the final gave 16.6 and 2.3 s. Use preview numbers to find problems, and trust the final render's numbers.
- `code.sh` reads the page's source directly, with no render needed.
- A 12 s film takes about 1 s to measure.

## What each metric means

"Good films" are averages over films that worked; "weak films" over a set that didn't.

| Metric | Script | Meaning | Floor | Good films | Weak films |
|---|---|---|---|---|---|
| `top10share` | peaks | % of all motion in the busiest 10 % of frames | ≥ 55 | 69 | 37 |
| `peak` | peaks | 95th percentile of frame-to-frame change over its median. High means rest punctuated by hits | ≥ 8 | 16.6 | 4.9 |
| `hits_per10` | peaks | Local motion peaks above 3× the median, ≥ 0.25 s apart, per 10 s | ≥ 5 (ads) | 6.2 | 4.3 |
| `hold_max` | motion | Longest run of frames with no visible change (under 0.25 levels), in seconds. A slow drift usually stays under that threshold, so it counts as still. A fast drift can hide a hold | ≤ 2.5 (aim ≤ 2) | 2.5 | |
| `still_pct` | motion | % of frames that are still | report only | 41 | 3 |
| `motion` | motion | Mean frame-to-frame luminance change (levels 0–255) | report only | | |
| `cuts_per10` | motion | Hard cuts per 10 s | report only | | |
| `L_p5`, `L_med`, `L_p95` | motion | Luminance percentiles (frames sampled twice a second) | dark: p5 ≤ 12, median ≤ 30; light: p5 ≤ 40, p95 ≥ 235 | median 25 | median 106 |
| `pal90` | motion | 3-bit-per-channel colour bins covering 90 % of pixels | ≤ 10 | 6 | 21 |
| `dur` | motion | Duration in seconds | ads 10–12 (`--ad`) | 10.6–11.9 | 12.3–18.9 |
| `audio` | motion | Has an audio stream | required unless the film is meant to be silent | all | none |

`measure.py` decides whether a film is dark or light from its median (below 128 is dark). A film that switches grounds can be flagged on one side; read the percentiles yourself in that case.

`code.sh` columns:
- `webgl`, `2d`, `frag`: WebGL contexts, canvas 2D contexts, fragment shader outputs;
- `march`: raymarch, SDF and path-trace terms;
- `spring` vs `ease`: spring and track calls against ease, cubic and smoothstep calls;
- `hex`: distinct colours;
- `fonts`: distinct font families;
- `post`: grain, vignette, bloom terms;
- `cues`: cue calls.

A good DOM film shows `webgl=0`, many springs, few eases, and `post` > 0.
