# Motion as code

Make animated ads, product launch films and website films with Claude Code, in pure code.

Every film is one HTML page with a single function, `seek(t)`, that draws the frame at time `t`. The page plays live in Chrome while you review it. Headless Chrome renders it frame by frame into a 60 fps MP4 with real motion blur, and the sound is built from the same page's cue list, so picture and sound can't drift apart.

It works for Reels and Shorts ads, product launch films and website films. Free and open: take it, change it, share it.

## Start here, with Claude Code

```
git clone https://github.com/paulnispelwork/motion-as-code && cd motion-as-code
claude
```

Then paste [prompts/new-film.md](prompts/new-film.md) with the blanks filled in. Claude reads [CLAUDE.md](CLAUDE.md), then works through the steps in [docs/METHOD.md](docs/METHOD.md). It stops at each checkpoint, so you watch a playing draft and give notes before it moves on.

Setup, once:

```
cd pipeline && npm install && npx playwright install chromium
python3 -m venv .venv && .venv/bin/pip install numpy scipy pyloudnorm pillow
```

You also need Node 18+, Python 3.10+ and ffmpeg 7+.

## What's in it

| Path | What it is |
|---|---|
| [CLAUDE.md](CLAUDE.md) | The rules Claude follows on every film |
| [docs/CRAFT.md](docs/CRAFT.md) | What good motion does, in numbers: hits and rest, the beat grid, springs, type sizes, read time, product share |
| [docs/METHOD.md](docs/METHOD.md) | One film at a time: treatment, hero moment, first draft, notes rounds, final file |
| [docs/RUNBOOK.md](docs/RUNBOOK.md) | Commands: preview, render, sound, QA, delivery |
| [pipeline/engine.js](pipeline/engine.js) | The film runtime: springs, beat grid, word and letter reveals, cues, grain, `?play` mode |
| [pipeline/motion.js](pipeline/motion.js) | Reusable mechanics: a morphing hero shape, highlighter, floods, a self-drawing logo, counters, typing, card flips, a 3D camera |
| [pipeline/render.js](pipeline/render.js) | Frame-by-frame render: supersampled, 4 sub-frames of motion blur, BT.709, chunked and resumable |
| [pipeline/synth.py](pipeline/synth.py) | Builds the score and sound design from the page's cues, mastered to −14 LUFS |
| [pipeline/music.py](pipeline/music.py) | Fits a real track (licensed or Suno) to the film: finds the BPM and puts the drop on your payoff beat |
| [pipeline/qa_page.js](pipeline/qa_page.js), [qa_file.py](pipeline/qa_file.py) | Automated checks: safe zones, read time, text size, `seek` purity, loudness, colour, frame count |
| [pipeline/tools/measure/](pipeline/tools/measure/README.md) | Measures a rendered film's rhythm, holds, grade and palette against the floors in CRAFT |
| [examples/website-film/](examples/website-film/README.md) | A website hero film in React: scroll or sound, one WebGL particle swarm |

## The rules that made the biggest difference

1. **Motion comes in hits, then rest.** Our best films put 69 % of their movement into the busiest 10 % of frames.
2. **Put everything on a beat grid:** beat n lands at n × 60 / BPM seconds, at 90–100 BPM. Ads need 5+ visible hits per 10 s, so the rhythm reads with the sound off.
3. **Use springs, not easing curves.** A few named presets (camera, UI arriving, slams, wipes) make everything feel like one film.
4. **Use one hero object** that morphs from scene to scene and carries every cut. No cross-dissolves.
5. **Read time:** each line stays on screen for at least 0.6 s + 0.22 s per word, once fully revealed.
6. **Keep the real product on screen** for at least half of an ad, rebuilt in HTML from screenshots. Never animate a screenshot.
7. **Never drift type.** A slow push under a headline makes the text swim.
8. **Frame 0 is the thumbnail.** The hook and the "who is this for" line are fully visible before anything moves.
9. **A person watches it playing before it's done.** Agents can't watch video. Checks catch defects; they don't make a film good.

## Licence

MIT. See [LICENSE](LICENSE).
