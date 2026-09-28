"""Score synth: builds a film's music and sound design from the cue list its page exports.

    .venv/bin/python synth.py cues.json out.wav [--lufs -14] [--ceiling -2.0] [--style warm]
    .venv/bin/python synth.py cues.json out.wav --music work/music.wav [--music-lufs -19]

With --music, a real track (fitted by music.py) replaces the synthesized beds: drone, groove, lift,
build and ring are skipped, and only the page's cue sounds are synthesized, mixed under the track
and ducking it briefly on the big hits. The page's bpm must be the track's (music.json).

cues.json (from export_cues.js): {bpm, beats, duration, events: [{t, type, gain}], arr}
arr, all in beats:
  drone:   [[b0, b1]]  tension bed on the minor chord, clock ticks on the 8ths
  groove:  [[b0, b1]]  kick, sub bass, keys on the chord progression, hats
  lift:    [[b0, b1]]  no kick: keys and pluck arpeggio only, for breathing room
  build:   [[b0, b1]]  riser and snare roll landing on b1 (build_gain: optional level, default 1)
  silence: [[b0, b1]]  everything except cue sounds drops out (the gap before a drop)
  ring:    b           final chord rings from b to the end
Picture and sound stay in sync by construction: every hit is placed at a cue time from the page.
Mastered to the target integrated loudness with a 4x oversampled look-ahead limiter; the ceiling
leaves room for AAC, which adds up to ~1.2 dB of true peak.
"""
import argparse
import json

import numpy as np
import pyloudnorm as pyln
import scipy.signal as sg
from scipy.io import wavfile
from scipy.ndimage import minimum_filter1d

ap = argparse.ArgumentParser()
ap.add_argument("cues")
ap.add_argument("out")
ap.add_argument("--lufs", type=float, default=-14.0)
ap.add_argument("--ceiling", type=float, default=-2.0)
ap.add_argument("--style", default="warm")
ap.add_argument("--seed", type=int, default=11)
ap.add_argument("--music", help="fitted track (wav) that replaces the synthesized beds")
ap.add_argument("--music-lufs", type=float, default=-19.0, help="track level before the master, against the cue sounds")
A = ap.parse_args()

C = json.load(open(A.cues))
ARR = {} if A.music else (C.get("arr") or {})  # a real track replaces every synthesized bed
SR = 48000
BEAT = 60 / C["bpm"]
DUR = C["duration"]
N = int(round(DUR * SR))
TOTAL = C["beats"]
rng = np.random.default_rng(A.seed)
dry = np.zeros((2, N))
rev = np.zeros((2, N))
side = np.zeros(N)

# Styles: chord voicings as MIDI notes. warm = trust and momentum for service brands (F major, a D minor
# tension bed that resolves). dark = the cinematic minor palette that worked for B2B AI.
STYLES = {
    "warm": {
        "tension": [50, 57, 60, 64, 69],  # Dm(add9)
        "prog": [[46, 53, 57, 60, 65], [45, 53, 57, 60, 64], [43, 50, 53, 58, 62], [48, 53, 55, 58, 62]],  # Bbmaj7/F(9)/Gm7/C7sus
        "roots": [34, 33, 31, 36],
        "home": [41, 53, 57, 60, 64, 67],  # Fmaj9
    },
    # bright = optimistic tech (D major, a B minor bed that resolves to Dmaj9), for product-led SaaS brands.
    "bright": {
        "tension": [47, 54, 59, 62, 66],  # Bm
        "prog": [[43, 50, 54, 59, 62], [45, 52, 57, 61, 64], [47, 54, 57, 62, 66], [50, 57, 61, 64, 69]],  # Gmaj7/A/Bm7/D(add9)
        "roots": [31, 33, 35, 38],
        "home": [38, 50, 54, 57, 61, 64],  # Dmaj9
    },
    "dark": {
        "tension": [45, 52, 57, 60, 64],
        "prog": [[45, 52, 57, 60, 71], [41, 48, 57, 60, 64], [50, 57, 60, 65, 69], [52, 59, 62, 64, 71]],
        "roots": [33, 29, 38, 40],
        "home": [45, 52, 57, 60, 64, 71],
    },
}
S = STYLES[A.style]


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(sec):
    return np.arange(int(sec * SR)) / SR


def filt(x, kind, f, order=2):
    return sg.sosfilt(sg.butter(order, f, btype=kind, fs=SR, output="sos"), x)


def noise(sec):
    return rng.uniform(-1, 1, int(sec * SR))


def env(n, a, d, s, rel):
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    return e * (1 - np.clip((t - (n / SR - rel)) / rel, 0, 1))


def place(sig, t, gain=1.0, pan=0.0, send=0.0):
    i = int(round(t * SR))
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig, i = sig[-i:], 0
    sig = sig[: N - i] * gain
    gl, gr = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
    dry[0, i : i + len(sig)] += sig * gl
    dry[1, i : i + len(sig)] += sig * gr
    if send:
        rev[0, i : i + len(sig)] += sig * gl * send
        rev[1, i : i + len(sig)] += sig * gr * send


def beats(key):
    return [tuple(x) for x in ARR.get(key, [])]


def inr(b, ranges):
    return any(a <= b < z for a, z in ranges)


SIL = beats("silence")

# ---- instruments -------------------------------------------------------------------
def pad(freq, sec, det=0.003, bright=5):
    t = tt(sec)
    x = sum(np.sin(2 * np.pi * freq * h * (1 + det) * t + h) / h ** 1.6 for h in range(1, bright))
    return x * env(len(t), 0.6, 1.2, 0.85, min(0.8, sec / 3))


def keys(freq, sec):
    """Soft electric piano: two-operator FM with a fast decaying bell."""
    t = tt(sec)
    mod = np.sin(2 * np.pi * freq * 2 * t) * 1.3 * np.exp(-t / 0.35)
    x = np.sin(2 * np.pi * freq * t + mod) + 0.25 * np.sin(2 * np.pi * freq * 4 * t) * np.exp(-t / 0.08)
    return x * env(len(t), 0.004, 0.9, 0.35, 0.25)


def pluck(freq):
    t = tt(0.5)
    x = np.sin(2 * np.pi * freq * t) + 0.4 * np.sin(4 * np.pi * freq * t) * np.exp(-t / 0.05)
    return x * np.exp(-t / 0.16) * np.minimum(1, t / 0.002)


def kick(punch=1.0):
    t = tt(0.5)
    f = 46 + 95 * punch * np.exp(-t / 0.03)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.26)
    return np.tanh(x * 1.5) * np.minimum(1, t / 0.001)


def sub(freq, sec):
    t = tt(sec)
    x = np.sin(2 * np.pi * freq * t) + 0.2 * np.sin(4 * np.pi * freq * t)
    return np.tanh(x * 1.2) * env(len(t), 0.01, 0.3, 0.8, 0.05)


def hat(open_=False):
    t = tt(0.18 if open_ else 0.05)
    return filt(noise(len(t) / SR), "highpass", 8000) * np.exp(-t / (0.07 if open_ else 0.012))


def shaker():
    t = tt(0.09)
    return filt(noise(0.09), "bandpass", [5000, 11000]) * np.sin(np.pi * t / t[-1]) ** 2


def snare(level=1.0):
    t = tt(0.2)
    body = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.045)
    return (body * 0.6 + filt(noise(0.2), "highpass", 1800) * np.exp(-t / 0.08)) * level


def riser(sec):
    t = tt(sec)
    k = t / t[-1]
    lo = filt(noise(sec), "bandpass", [300, 1500])
    hi = filt(noise(sec), "bandpass", [2000, 9000])
    tone = np.sin(2 * np.pi * np.cumsum(180 + 700 * k ** 2) / SR) * 0.12
    return (lo * (1 - k) + hi * k + tone) * k ** 2.4


# ---- cue sounds (UI foley and hits) ---------------------------------------------------
def impact(size=1.0):
    t = tt(1.8)
    boom = np.sin(2 * np.pi * np.cumsum(40 + 55 * np.exp(-t / 0.09)) / SR) * np.exp(-t / 0.5)
    air = filt(noise(1.8), "bandpass", [2500, 11000]) * np.exp(-t / (0.45 * size)) * 0.25
    return np.tanh((boom + air) * 1.2)


def whoosh(sec=0.55, lo=300, hi=5000):
    t = tt(sec)
    k = t / t[-1]
    x = noise(sec)
    return (filt(x, "bandpass", [lo, lo * 3]) * (1 - k) + filt(x, "bandpass", [hi / 3, hi]) * k) * np.sin(np.pi * k) ** 1.6


def tick():
    t = tt(0.04)
    return np.sin(2 * np.pi * 3100 * t) * np.exp(-t / 0.006)


def click():
    t = tt(0.05)
    return np.sin(2 * np.pi * 2000 * t) * np.exp(-t / 0.008) + filt(noise(0.05), "highpass", 3000) * np.exp(-t / 0.002) * 0.5


def pop():
    t = tt(0.16)
    f = 650 + 500 * (1 - np.exp(-t / 0.02))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.05) * np.minimum(1, t / 0.002)


def ding():
    """Success: a two-note bell, fifth up."""
    t = tt(1.4)
    a = np.sin(2 * np.pi * midi(84) * t) * np.exp(-t / 0.4)
    b = np.sin(2 * np.pi * midi(91) * t) * np.exp(-np.maximum(t - 0.11, 0) / 0.6) * (t > 0.11)
    return (a + 0.8 * b) * np.minimum(1, t / 0.002)


def stamp():
    """A rubber stamp landing: low thud plus a paper slap."""
    t = tt(0.35)
    thud = np.sin(2 * np.pi * np.cumsum(90 + 120 * np.exp(-t / 0.015)) / SR) * np.exp(-t / 0.07)
    slap = filt(noise(0.35), "bandpass", [700, 4000]) * np.exp(-t / 0.02)
    return np.tanh((thud + slap * 0.7) * 1.6)


def typing(n=6, gap=0.075):
    out = np.zeros(int((n * gap + 0.05) * SR))
    for k in range(n):
        c = click() * (0.6 + 0.4 * rng.random())
        i = int(k * gap * (0.85 + 0.3 * rng.random()) * SR)
        out[i : i + len(c)] += c[: len(out) - i]
    return out


def shimmer():
    """Logo sparkle: soft high partials that bloom."""
    t = tt(2.2)
    x = sum(np.sin(2 * np.pi * midi(m) * t + m) for m in [84, 88, 91, 96]) / 4
    return x * np.minimum(1, t / 0.25) * np.exp(-t / 0.8)


def swell(sec=1.2):
    t = tt(sec)
    k = t / t[-1]
    x = sum(np.sin(2 * np.pi * midi(m) * t) for m in S["home"][2:]) / 4
    return x * k ** 3 + filt(noise(sec), "bandpass", [1500, 7000]) * k ** 4 * 0.2


def phone():
    """A soft, modern ring: a fast two-note trill, twice (a phone call arriving)."""
    t = tt(1.25)
    hi = (np.floor(t / 0.045) % 2 == 0)
    f = np.where(hi, midi(88), midi(83))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) + 0.3 * np.sin(4 * np.pi * np.cumsum(f) / SR)
    burst = ((t < 0.42) | ((t > 0.62) & (t < 1.04))).astype(float)
    burst = filt(burst, "lowpass", 60)
    return x * burst * 0.8


def blip():
    """A message bubble arriving: a short upward chirp."""
    t = tt(0.12)
    f = 900 + 900 * (t / t[-1])
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.04) * np.minimum(1, t / 0.003)


def hop():
    """A soft wooden tok for a bouncing dot landing (marimba-like, a slight downward pitch)."""
    t = tt(0.22)
    f = 520 * (1 + 0.08 * np.exp(-t / 0.02))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) + 0.35 * np.sin(4 * ph) * np.exp(-t / 0.015)
    return x * np.exp(-t / 0.06) * np.minimum(1, t / 0.0015)


SFX = {
    "impact": (impact(), 0.34, 0, 0.25, 0), "whoosh": (whoosh(), 0.07, 0, 0.3, 0.3), "tick": (tick(), 0.06, 0.15, 0.1, 0),
    "click": (click(), 0.14, 0, 0.1, 0), "pop": (pop(), 0.1, 0.1, 0.2, 0), "ding": (ding(), 0.1, 0, 0.45, 0),
    "stamp": (stamp(), 0.3, 0, 0.25, 0), "type": (typing(), 0.08, 0.1, 0.05, 0), "send": (whoosh(0.3, 800, 6000), 0.06, 0.3, 0.2, 0.2),
    "shimmer": (shimmer(), 0.09, 0, 0.6, 0), "swell": (swell(), 0.07, 0, 0.5, 1.2),
    "phone": (phone(), 0.1, 0, 0.3, 0), "blip": (blip(), 0.07, 0.1, 0.2, 0), "hop": (hop(), 0.09, 0, 0.15, 0),
}

# ---- arrangement --------------------------------------------------------------------
# Tension bed: detuned pad on the minor chord, clock ticks on the 8ths (the waiting).
# The bed sits well under the payoff and swells toward its end; builds carry it on, rising, into the hit.
for b0, b1 in beats("drone") + [(a, z) for a, z in beats("build") if not any(d0 <= a < d1 for d0, d1 in beats("drone"))]:
    sec = (b1 - b0) * BEAT + 0.8
    swell_ = np.linspace(0.45, 1.0, int(sec * SR))
    for m in S["tension"]:
        for det, pan in [(0.0025, -0.5), (-0.0025, 0.5)]:
            place(pad(midi(m), sec, det, 4) * swell_, b0 * BEAT, 0.016, pan, 0.4)
    place(sub(midi(S["tension"][0] - 12), sec) * swell_, b0 * BEAT, 0.05)
    b = b0
    while b < b1:
        if not inr(b, SIL):
            place(tick(), b * BEAT, 0.05 if (b - b0) % 1 == 0 else 0.03, 0.3 if (b * 2) % 2 else -0.3)
        b += 0.5

GROOVE, LIFT = beats("groove"), beats("lift")
for ranges, with_kick in [(GROOVE, True), (LIFT, False)]:
    for g0, g1 in ranges:
        for bar, b0 in enumerate(np.arange(g0, g1, 4)):
            chord = S["prog"][bar % 4]
            sec = min(4, g1 - b0) * BEAT + 0.3
            for m in chord:
                for det, pan in [(0.002, -0.55), (-0.002, 0.55)]:
                    place(pad(midi(m), sec, det, 4), b0 * BEAT, 0.013, pan, 0.35)
            # Keys: chord on 1, a softer re-strike on the "and" of 2.
            for off, g in [(0, 0.05), (1.5, 0.028), (3, 0.02)]:
                if b0 + off < g1 and not inr(b0 + off, SIL):
                    for j, m in enumerate(chord[1:]):
                        place(keys(midi(m + 12), 1.4), (b0 + off) * BEAT + j * 0.006, g, -0.3 + j * 0.15, 0.3)
            place(sub(midi(S["roots"][bar % 4]), sec - 0.3), b0 * BEAT, 0.16 if with_kick else 0.1)
        b = g0
        while b < g1:
            if not inr(b, SIL):
                if with_kick:
                    place(kick(), b * BEAT, 0.5)
                    i = int(b * BEAT * SR)
                    n = min(int(0.3 * SR), N - i)
                    if n > 0:
                        side[i : i + n] = np.maximum(side[i : i + n], np.exp(-np.arange(n) / SR / 0.11))
                    place(hat(), (b + 0.5) * BEAT, 0.05, 0.25)
                    place(shaker(), (b + 0.25) * BEAT, 0.02, -0.35)
                    place(shaker(), (b + 0.75) * BEAT, 0.02, -0.35)
                else:
                    # Lift: half-time pulse and a soft sub keep the energy up without the full groove.
                    if (b - g0) % 2 == 0:
                        place(kick(0.8), b * BEAT, 0.46)
                        i = int(b * BEAT * SR)
                        n = min(int(0.3 * SR), N - i)
                        if n > 0:
                            side[i : i + n] = np.maximum(side[i : i + n], 0.6 * np.exp(-np.arange(n) / SR / 0.11))
                    place(shaker(), (b + 0.5) * BEAT, 0.02, -0.35)
            b += 1
        # Pluck arpeggio from the second bar on.
        ARP = [0, 2, 4, 2, 3, 1, 4, 2]
        s = 0
        b = g0 + (4 if with_kick else 0)
        while b < g1:
            if not inr(b, SIL):
                chord = S["prog"][int((b - g0) // 4) % 4]
                p = pluck(midi(chord[1 + ARP[s % 8] % 4] + 12))
                place(p, b * BEAT, 0.035, -0.2, 0.3)
                place(p, (b + 0.75) * BEAT, 0.012, 0.6, 0.5)
            b += 0.5
            s += 1

BG = ARR.get("build_gain", 1.0)  # optional: louder risers and rolls, so a build never reads as a quiet gap
for a, z in beats("build"):
    place(riser((z - a) * BEAT + 0.05), a * BEAT, 0.09 * BG, 0, 0.3)
    b = a
    while b < z:
        k = (b - a) / max(z - a, 1e-6)
        place(snare(0.3 + 0.7 * k), b * BEAT, 0.07 * BG * (0.4 + 0.6 * k), 0.1, 0.2)
        b += 0.5 if k < 0.5 else 0.25

if "ring" in ARR:
    b0 = ARR["ring"]
    sec = DUR - b0 * BEAT + 0.2
    for m in S["home"]:
        for det, pan in [(0.002, -0.5), (-0.002, 0.5)]:
            place(pad(midi(m), sec, det, 5), b0 * BEAT, 0.03, pan, 0.5)
    for j, m in enumerate(S["home"][1:]):
        place(keys(midi(m + 12), min(sec, 3)), b0 * BEAT + j * 0.03, 0.07, -0.4 + j * 0.16, 0.5)
    place(sub(midi(S["home"][0]), min(sec, 3)), b0 * BEAT, 0.18)

for ev in C["events"]:
    sig, g, pan, send, lead = SFX[ev["type"]]
    place(sig, ev["t"] - lead, g * ev.get("gain", 1), pan, send)

# ---- a real track under the cue sounds ------------------------------------------------------
music = None
if A.music:
    msr, m = wavfile.read(A.music)
    m = m.astype(np.float64) / (32768.0 if m.dtype == np.int16 else 1.0)
    m = m.T if m.ndim == 2 else np.vstack([m, m])
    if msr != SR:
        m = sg.resample_poly(m, SR, msr, axis=1)
    m = np.pad(m[:, :N], ((0, 0), (0, max(0, N - m.shape[1]))))
    m *= 10 ** ((A.music_lufs - pyln.Meter(SR).integrated_loudness(m.T)) / 20)
    hits = np.zeros(N)
    for ev in C["events"]:
        if ev["type"] in ("impact", "stamp", "swell"):
            i, n = int(ev["t"] * SR), int(0.35 * SR)
            if i < N:
                n = min(n, N - i)
                hits[i : i + n] = np.maximum(hits[i : i + n], min(1.0, ev.get("gain", 1)) * np.exp(-np.arange(n) / SR / 0.12))
    music = m * (1 - 0.3 * filt(hits, "lowpass", 30))

# ---- reverb and master ------------------------------------------------------------------
trv = tt(2.6)
ir = np.vstack([filt(noise(2.6), "lowpass", 6500), filt(noise(2.6), "lowpass", 6500)]) * np.exp(-trv / 0.65)
ir[:, : int(0.02 * SR)] = 0
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
wet = np.vstack([sg.fftconvolve(rev[0], ir[0])[:N], sg.fftconvolve(rev[1], ir[1])[:N]])
duck = 1 - 0.4 * filt(side, "lowpass", 30)
mix = dry * duck + wet * 0.7
if music is not None:
    mix = mix + music
mix = sg.sosfilt(sg.butter(2, 28, btype="highpass", fs=SR, output="sos"), mix, axis=1)
fi, fo = int(0.01 * SR), int(0.7 * SR)
mix[:, :fi] *= np.linspace(0, 1, fi)
mix[:, -fo:] *= np.linspace(1, 0, fo) ** 2

meter = pyln.Meter(SR)


def true_peak_db(x):
    return 20 * np.log10(np.abs(sg.resample_poly(x, 4, 1, axis=1)).max() + 1e-12)


def limit(x, ceiling_db, release=0.08, look=0.002):
    ceil = 10 ** (ceiling_db / 20)
    up = np.abs(sg.resample_poly(x, 4, 1, axis=1)).max(axis=0)
    pk = up[: (len(up) // 4) * 4].reshape(-1, 4).max(axis=1)
    pk = np.pad(pk, (0, x.shape[1] - len(pk)))
    g = minimum_filter1d(np.minimum(1, ceil / (pk + 1e-12)), size=2 * int(look * SR) + 1)
    a = np.exp(-1 / (release * SR))
    out = np.empty_like(g)
    cur = 1.0
    for i, v in enumerate(g):
        cur = v if v < cur else a * cur + (1 - a) * v
        out[i] = cur
    return x * out


x = mix
for _ in range(5):
    x = limit(x * 10 ** ((A.lufs - meter.integrated_loudness(x.T)) / 20), A.ceiling)
lufs, tp = meter.integrated_loudness(x.T), true_peak_db(x)
wavfile.write(A.out, SR, (np.clip(x.T, -1, 1) * 32767).astype(np.int16))
print(f"{A.out}: {DUR:.2f} s, {lufs:.2f} LUFS, true peak {tp:.2f} dBTP, {len(C['events'])} cues")
