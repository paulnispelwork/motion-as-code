"""Music-first scoring: analyse a real track and fit it to a film.

    .venv/bin/python music.py analyze track.mp3 [--json track.music.json]
    .venv/bin/python music.py fit track.mp3 --beats 30 --out work/music.wav --json work/music.json
                                            [--drop-at 12] [--start-bar 4] [--tail-bars 1]

The track drives the film, not the other way round:
  analyze  tempo, beat and downbeat times, bar energies and drop candidates (strong energy jumps).
  fit      cuts the track to the film on bar lines, so film beat 0 is a downbeat. With --drop-at, the
           cut is chosen so the track's strongest drop lands on that film beat (put the payoff there).
           The ending fades over the last --tail-bars bars. music.json carries the bpm the page must use,
           the drop beat, the bar energies in film beats, and how far the track drifts from a fixed grid.

Any source works: a generated track, a licensed library track or a composer's stem. Keep vocals out.
Decoding uses ffmpeg, so anything ffmpeg reads is fine. Needs numpy and scipy (already in .venv).
"""
import argparse
import json
import subprocess

import numpy as np
import scipy.signal as sg
from scipy.io import wavfile

SR_A = 22050  # analysis rate
HOP = 256
NFFT = 2048
SR_OUT = 48000


def decode(path, sr, channels):
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-ac", str(channels), "-ar", str(sr), "-f", "f32le", "-"]
    raw = subprocess.run(cmd, check=True, capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    return x.reshape(-1, channels).T if channels > 1 else x


def spectrum(x):
    frames = np.lib.stride_tricks.sliding_window_view(np.pad(x, NFFT // 2), NFFT)[::HOP]
    return np.abs(np.fft.rfft(frames * np.hanning(NFFT), axis=1))


def onset_envelope(mag, lo_bin=0, hi_bin=None):
    s = np.log1p(100 * mag[:, lo_bin:hi_bin])
    flux = np.maximum(0, np.diff(s, axis=0)).sum(axis=1)
    flux = np.concatenate([[0], flux])
    fps = SR_A / HOP
    local = np.convolve(flux, np.ones(int(fps * 0.5)) / int(fps * 0.5), mode="same")
    env = np.maximum(0, flux - local)
    return env / (env.std() + 1e-9)


def estimate_period(env, fps):
    """Autocorrelation tempo, weighted toward a comfortable 70-160 BPM band."""
    n = len(env)
    ac = np.fft.irfft(np.abs(np.fft.rfft(env, 2 * n)) ** 2)[:n]
    bpms = np.arange(60.0, 190.0, 0.05)
    lags = 60 * fps / bpms
    vals = np.interp(lags, np.arange(n), ac)
    # Add the double-period evidence so a bar-level pulse supports its beat.
    vals += 0.5 * np.interp(2 * lags, np.arange(n), ac)
    weight = np.exp(-0.5 * (np.log2(bpms / 115) / 0.9) ** 2)
    best = int(np.argmax(vals * weight))
    return 60 * fps / bpms[best], bpms[best]


def track_beats(env, period, tightness=120.0):
    """Dynamic-programming beat tracker (Ellis 2007): onsets that keep a steady period win."""
    n = len(env)
    score = env.copy()
    back = -np.ones(n, dtype=int)
    lo, hi = int(round(period / 2)), int(round(period * 2))
    for t in range(hi, n):
        prev = np.arange(t - hi, t - lo)
        cost = -tightness * np.log((t - prev) / period) ** 2
        cand = score[prev] + cost
        k = int(np.argmax(cand))
        score[t] += cand[k]
        back[t] = prev[k]
    t = int(np.argmax(score[-int(period):])) + n - int(period)
    beats = [t]
    while back[t] >= 0:
        t = back[t]
        beats.append(t)
    return np.array(beats[::-1])


def analyze(path):
    x = decode(path, SR_A, 1)
    mag = spectrum(x)
    fps = SR_A / HOP
    env = onset_envelope(mag)
    period, bpm = estimate_period(env, fps)
    frames = track_beats(env, period)
    tracked = frames / fps

    # Produced music runs on a fixed grid. Fit one grid (tempo and phase) to the whole track: search
    # around the tracker's tempo for the grid whose beats sit on the most onset energy. This ignores
    # sections where the tracker briefly locked onto off-beats (hats, syncopation).
    low = onset_envelope(mag, 0, int(150 / (SR_A / NFFT)))
    drive = low  # kick and bass sit on the beat; hats and syncopation would pull the grid off it
    t_axis = np.arange(len(drive)) / fps
    bpm0 = 60 / float(np.median(np.diff(tracked)))
    best = (-1.0, bpm0, 0.0)
    for cand in np.arange(bpm0 - 1.2, bpm0 + 1.2, 0.005):
        p = 60 / cand
        grid = np.arange(0, t_axis[-1], p)
        phases = np.linspace(0, p, 64, endpoint=False)
        vals = [np.interp(grid + ph, t_axis, drive).sum() for ph in phases]
        k = int(np.argmax(vals))
        if vals[k] > best[0]:
            best = (vals[k], cand, phases[k])
    _, bpm, ph = best
    period = 60 / bpm
    beat_t = np.arange(ph, t_axis[-1], period)

    # Drift: how far the kick sits from the grid. Judge only 16-beat windows with a steady kick
    # (12+ strong hits); intros and breakdowns without one say nothing about timing.
    near = np.full(len(beat_t), np.nan)
    for j, b in enumerate(beat_t):
        w = (t_axis > b - period / 4) & (t_axis < b + period / 4)
        if w.any() and drive[w].max() > 2.0:
            near[j] = t_axis[w][np.argmax(drive[w])] - b
    resid = np.zeros(len(beat_t))
    for i in range(len(beat_t)):
        win = near[i : i + 16]
        if np.isfinite(win).sum() >= 12:
            resid[i] = abs(np.nanmedian(win))
    drift_ms = float(resid.max() * 1000)

    # Downbeat phase: the phase of 4 whose beats carry the most low-end attack (kick, bass).
    at = lambda ts: np.interp(ts, t_axis, low)  # noqa: E731
    phase = int(np.argmax([at(beat_t[k::4]).mean() for k in range(4)]))
    down_t = beat_t[phase::4]

    # Bar energies (RMS in dB) and drops: the biggest rises over the previous two bars.
    rms = np.sqrt(np.convolve(x ** 2, np.ones(HOP) / HOP, mode="same")[::HOP] + 1e-12)
    bars = []
    for a, b in zip(down_t[:-1], down_t[1:]):
        seg = rms[int(a * fps) : int(b * fps)]
        bars.append(float(20 * np.log10(seg.mean() + 1e-9)))
    bars = np.array(bars)
    rise = np.array([bars[i] - bars[max(0, i - 2) : i].mean() if i >= 1 else 0.0 for i in range(len(bars))])
    order = np.argsort(-rise)
    drops = [{"t": float(down_t[i]), "bar": int(i), "rise_db": round(float(rise[i]), 2)} for i in order[:5] if rise[i] > 1.5]

    return {
        "source": path,
        "duration": len(x) / SR_A,
        "bpm": round(bpm, 3),
        "beats": [round(float(t), 4) for t in beat_t],
        "downbeats": [round(float(t), 4) for t in down_t],
        "bar_db": [round(float(v), 2) for v in bars],
        "drops": drops,
        "drift_ms": round(drift_ms, 1),
        "_resid": resid.tolist(),
    }


def fit(path, film_beats, out, drop_at=None, start_bar=None, tail_bars=1.0):
    info = analyze(path)
    resid = np.array(info.pop("_resid"))
    bpm, beat = info["bpm"], 60 / info["bpm"]
    down = np.array(info["downbeats"])
    dur = film_beats * beat

    if start_bar is not None:
        start_i = start_bar
    elif drop_at is not None and info["drops"]:
        # Choose the downbeat that puts the strongest reachable drop on film beat drop_at.
        best, start_i = -1e9, 0
        for d in info["drops"]:
            want = d["t"] - drop_at * beat
            i = int(np.argmin(np.abs(down - want)))
            if abs(down[i] - want) < beat / 2 and down[i] + dur <= info["duration"] + 0.01:
                if d["rise_db"] > best:
                    best, start_i = d["rise_db"], i
    else:
        start_i = 0
    start = float(down[start_i])

    x = decode(path, SR_OUT, 2)
    a, n = int(start * SR_OUT), int(round(dur * SR_OUT))
    seg = x[:, a : a + n]
    if seg.shape[1] < n:
        print(f"warning: track ends {(n - seg.shape[1]) / SR_OUT:.2f} s before the film; padded with silence")
        seg = np.pad(seg, ((0, 0), (0, n - seg.shape[1])))
    fi = int(0.004 * SR_OUT)
    seg[:, :fi] *= np.linspace(0, 1, fi)
    fo = min(n, int(tail_bars * 4 * beat * SR_OUT))
    seg[:, -fo:] *= np.cos(np.linspace(0, np.pi / 2, fo)) ** 2  # equal-power style fade to silence

    wavfile.write(out, SR_OUT, (np.clip(seg.T, -1, 1) * 32767).astype(np.int16))

    # Drift that matters: only the beats inside the fitted window.
    bt = np.array(info["beats"])
    inside = (bt >= start) & (bt < start + dur)
    info["drift_ms"] = round(float(resid[inside].max() * 1000), 1) if inside.any() else 0.0

    rel = lambda t: (t - start) / beat  # noqa: E731
    drop_beats = [round(float(rel(d["t"])), 2) for d in info["drops"] if 0 <= rel(d["t"]) < film_beats]
    fitted = {
        "source": path,
        "bpm": bpm,
        "beats": film_beats,
        "duration": dur,
        "start_in_track": start,
        "drop_beats": drop_beats,
        "bar_db": {str(round(rel(t))): v for t, v in zip(down, info["bar_db"]) if 0 <= rel(t) < film_beats},
        "drift_ms": info["drift_ms"],
    }
    return fitted


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["analyze", "fit"])
    ap.add_argument("track")
    ap.add_argument("--json")
    ap.add_argument("--beats", type=float, help="film length in beats of the track's tempo")
    ap.add_argument("--out", help="fitted wav (fit)")
    ap.add_argument("--drop-at", type=float, help="film beat where the track's biggest drop should land")
    ap.add_argument("--start-bar", type=int, help="force the start downbeat index")
    ap.add_argument("--tail-bars", type=float, default=1.0)
    A = ap.parse_args()

    if A.cmd == "analyze":
        res = analyze(A.track)
        res.pop("_resid")
        print(f"{A.track}: {res['bpm']} BPM, {len(res['downbeats'])} bars, drift {res['drift_ms']} ms, "
              f"drops at {[d['t'] for d in res['drops']]} s")
    else:
        if not A.beats or not A.out:
            ap.error("fit needs --beats and --out")
        res = fit(A.track, A.beats, A.out, A.drop_at, A.start_bar, A.tail_bars)
        print(f"{A.out}: {res['bpm']} BPM, {res['beats']} beats = {res['duration']:.2f} s, "
              f"from {res['start_in_track']:.2f} s in the track, drops at film beats {res['drop_beats']}, "
              f"drift {res['drift_ms']} ms")
        if res["drift_ms"] > 25:
            print("warning: the track's tempo drifts; pick a quantised track or cut shorter sections")
    if A.json:
        json.dump(res, open(A.json, "w"), indent=1)


if __name__ == "__main__":
    main()
