# Craft: what good films do

Rules measured on films that worked, and checked against their code. Meeting them keeps a film out of the weak pile; a person watching it decides whether it's good.

## 1. Story

- **Arc:**
  1. the problem, in the buyer's words;
  2. the product doing the job, on real content;
  3. the scale;
  4. one payoff line;
  5. the lockup with a CTA.
- **Clear to a stranger:** after one viewing, someone who's never heard of the brand knows what it does, who it's for and what to do next.
- **The cold-scroller test:** read every line as a stranger scrolling with the sound off, for 2 s. These fail it:
  - poetic but vague lines ("Your buyers have instincts");
  - category jargon;
  - lines that assume context ("Then make more.");
  - unlabelled comparisons.
- **Humour** comes from the product's own pain or absurdity.
- **Every frame is postable.**

## 2. Mechanics: copy these, design everything else

**One hero object carries the film, and every scene change happens through it.** For example, one rounded rectangle becomes a highlighter under a word, then drops to fill the frame, then becomes an ad card, then a chat window (`shapeTrack`, `placeShape` in [motion.js](../pipeline/motion.js)). Or a gold shape highlights, floods the frame, becomes an app card, and the card shrinks into a map pin. Films without an object, just a "world", have nothing to carry their cuts.

**Every scene change is a named transition, computed from measured positions.** Write them into the beat table first. Proven ones:
- a morph of the hero shape;
- a flood from a focal point (`flood`);
- a zoom through an object (through the measured dot of a "?");
- an iris, a whip, a dive, a knife cut, a shutter, a vertical push.

Never cross-dissolve two busy layouts. Measure word boxes after layout (`rectOf`) so a highlighter lands exactly behind the words.

**Springs everywhere,** from one family of named presets `[Hz, damping]` in [engine.js](../pipeline/engine.js) (`SP`), added up per keyframe with `step`/`track`:

| Use | Preset |
|---|---|
| Camera | `cam [0.75, 1]`, `glide [1.1, 1]` |
| UI and type arrivals | `snap [2.4, .78]`, `base [1.6, .86]` |
| Slams | `slam [3.2, .62]` |
| Masks and wipes | `mask [2.3, 1]` |
| Colour changes (cut, never blend) | `cut [7, 1]` |
| Liquid edges | `lag [1.2, .72]` on the left, `lead [2.8, .82]` on the right |

Linear ramps only for mechanical things (a counter, a progress bar).

**The kit** ([motion.js](../pipeline/motion.js) and [engine.js](../pipeline/engine.js)):

| Mechanic | Functions |
|---|---|
| Morphing shape, liquid edges | `shapeTrack`, `placeShape`, `LIQUID` |
| Highlighter with ink behind it | `hlBox`, `hlStart`, `inkBehind` |
| Flood from a point; cards that grow, flip or pop | `flood`, `growFrom`, `flipIn`, `flipOut`, `popIn` |
| Self-drawing logo, a pen dot on a path | `drawableLogo`, `flight`, `alongPath`, `comet` |
| Counters, typing | `countUp`, `typed` |
| Word masks, per-letter rise with blur, wipes | `splitMask` + `mask`, `splitLetters` + `letters`, `wipe` |
| Dot-grid illustrations | `drawDots`, [tools/dotmap.py](../pipeline/tools/dotmap.py) |
| 3D camera and routes (canvas) | `camera`, `curve`, `chaseHeading` |
| Hits | `punch` (scale pulse), `flash` (exposure) |
| One page, many clips | read `?clip=a..e` in `build(q)` |

A new mechanic (a new shader, 3D technique or physics) gets proven on a known-good film first.

## 3. Motion: hits, then rest

- **Hits, then rest.** Good films put 69 % of their motion in the busiest 10 % of frames; weak ones put in 37 %.
- **Small events cluster** around the hits and the product's actions (typing ticks, counts, a spinner turning into a check), each with a sound cue. A 50 s film has about 60 cues.
- **During a rest,** only a slow drift and at most one small element move.
- **Keep holds alive with a drift:** 2–5 % scale over a scene. Never an always-on orbit, sway or bob.
  - **Never drift a layer that carries type.** A 3 % push under a reel made the headlines and UI text swim. Drift the product or the background, and keep type still between its entrance, its exit and the punches.
- **`punch()` on hits:** 3.5 % on the 3–5 biggest beats, 1 % on lesser ones.

## 4. Holds and read time

- **No stretch longer than 2.5 s without a visible change** (a hit, a cut, a new line, a product action). Aim for 2 s. The drift doesn't count as a change.
- **Read time:** a line stays 1.5–3× its read time (0.6 s + 0.22 s per word), once fully revealed. More than that is padding.
- **One headline at a time.** Anything carrying text moves slowly enough to read.

## 5. Type

- **Headlines:** ≥ 110 px at 16:9, ≥ 90 px at 9:16, 4:5 and 1:1. Aim for 150 px or more. At least once per film, a single word fills the frame.
- **One line at a time,** on a flat or darkened area. Never over a moving textured world, and never at an angle in 3D.
- **Two roles at most:** a grotesk voice, plus one accent (an italic serif or the brand's display face).
- **Reveals:**
  - per letter: rising from a baseline mask, blurred 9 px down to sharp, 26 ms stagger, spring `[2.3, 0.7]`;
  - word masks: 0.07 beat per word for body lines, 0.2–0.42 beat for big headline words.
- **Exits:** blur 14 px plus a fade. Text is gone before anything emerges from it.
- **Too small to read in motion:** cut it; don't shrink it.

## 6. Product

- **Share of runtime with the real UI or output on screen:** ≥ 40 % of a film, ≥ 50 % of each ad. The best film reached ~64 %; weak ones 0–18 %.
- **Size:** at its hero moment the product fills ≥ 45 % of the frame width.
- **Show it being used,** on real content: a real ad annotated, tags flying into a card that counts up, a question typed and answered, a cursor clicking the CTA.
- **Build it in DOM,** in em units, from the brand's screenshots, so one component serves every format. Never animate a screenshot.
- **Honest numbers:** no invented claims; wins and losses in two tones; no chart where every bar is full.

## 7. Palette and grade

- **Palette:** at most 3 grounds + 1 accent, and the accent owns the hits. Good films cover 90 % of their pixels with about 6 colour bins; weak ones needed 21.
- **Grade** (frame luminance, 0–255):
  - dark ground: 5th percentile ≤ 12, median ≤ 30;
  - light ground: 5th percentile ≤ 40, 95th percentile ≥ 235.

  Mid-grey (median about 106) is murk.
- **Changing ground:** a flood or a cut, never a blend. Dim with a colour swap, not opacity.

## 8. Rhythm and sound

- **Grid:** every event on a beat grid, `B(n) = n·60/BPM`, with cuts snapped to the nearest frame.
- **Tempo:** product films 90–96 BPM, ads 90–105 BPM. Dense product UI reads better at 90 than 96. A track's own BPM wins; measure it with `music.py analyze`.
- **Hits (ads):** at least 5 visible hits per 10 s, so the rhythm reads muted.
- **Cues:** the page exports its cue list, and the score is built from it. Picture and sound stay in sync by construction.
- **Dynamics:** the payoff is the loudest moment. Builds rise, never a quiet gap.
- **Taste:** no heartbeat motifs; no "funky" bounce for sober B2B; no cute blob sounds.

## 9. Ads

- **Length:** 10–12 s (17–19 beats at 96 BPM).
- **The hook lands in the first second:** the audience call-out ("Running ads on Meta or LinkedIn?") and the hook visual are readable by 1 s. The call-out stays until the end card.
- **The thumbnail is chosen, not assumed:** pick the frame that reads best as a still, with the product or the hook big and the message clear, and export it as the poster (`stills.js --t <time> --png`). Say which frame you picked and why.
- **Structure:** the hook, one feature shown in the product, then the end card (logo, promise, "For [audience]", CTA).
- **Each format is composed for its own frame.** A 4:5 ad is never a crop of the 9:16.
- **CTA:** no URL on screen, and the CTA matches the real offer.

## 10. Real time and finish

- **Frame time:** ≤ 25 ms per frame in `?play`. Use DOM, CSS 3D and canvas 2D, and at most one shader object inside a DOM film. A shader can lower its own quality to stay in budget (the particle swarm in [examples/website-film](../examples/website-film/) does). A look that can't make the budget is baked to images or video, or dropped.
- **Finish,** the same on every film:
  - grain re-seeded 24×/s at opacity 0.14 (`grain`);
  - a vignette on dark scenes;
  - a glow that follows the action;
  - per-shot motion blur via `shutter(t)` (0.15 on hard cuts and floods, 0.5 otherwise).

  Pages never draw their own motion blur.

## 11. Details that are wrong the first time

- **The highlighter:** covers the full glyph height, extends 4 px left and 14 px right of the words, and the ink stays inside it.
- **3D pins** scale with `min(26, 0.1·F/z)`, never linearly.
- **A colour cut timed to a flood** lands when the flood covers the element, not on the beat.
- **A zero-length round-capped line** still paints a dot, so hide it until it has length.

## Self-check

Run this before a draft goes to the reviewer. The tools are in [pipeline/tools/measure/](../pipeline/tools/measure/README.md).

| Check | Floor |
|---|---|
| Punctuation (`measure.py`) | top-10 % share ≥ 55 %, peak ratio ≥ 8 |
| Holds (`measure.py`) | none over 2.5 s |
| Hits (`measure.py --ad`) | ≥ 5 per 10 s |
| Grade and palette (`measure.py`) | per §7; ≤ 10 colour bins cover 90 % of pixels |
| Ad length | 10–12 s |
| Product | share and width per §6 |
| Type | sizes per §5; `qa_page.js` passes |
| First second | call-out and hook readable by 1 s; a thumbnail frame picked |
| Frame time | p95 ≤ 25 ms |
| Sound | present; payoff loudest |
| Transitions | 0.1-beat strips: no mud, no text left on screen as something emerges |

Fix any of these before the reviewer sees the film: a new rendering technique as the hero; motion that never rests; a small, static or missing product; mid-grey; small type over moving imagery; an ad over 12 s; silence; no hero object; a cross-dissolve; an unsourced claim.
