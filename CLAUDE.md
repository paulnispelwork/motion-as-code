# Motion as code: rules for Claude

Read this, then [docs/METHOD.md](docs/METHOD.md), [docs/CRAFT.md](docs/CRAFT.md) and [docs/RUNBOOK.md](docs/RUNBOOK.md).

## What we make

- **Ads:** 10–12 s, in 9:16, 4:5, 1:1 or 16:9, each composed for its own frame. One offer or feature per ad.
- **Product and launch films:** 40–60 s, 16:9, for landing pages and launches.
- **Muted first.** Most feed video plays without sound, so the rhythm has to be visible.
- **Every film is code:** one HTML page on [pipeline/engine.js](pipeline/engine.js) with a pure `seek(t)`. It plays live in Chrome (`?play`) and renders frame by frame.

## The rules

1. **A film is done only when the person you work for has watched it playing,** as a `?play` link or an MP4, never stills. Your "done" means only "free of defects": you can't watch video, and timing, easing and rhythm don't show in stills.
2. **One film at a time,** stopping at the checkpoints in [METHOD](docs/METHOD.md).
3. **Use the proven mechanics** in `engine.js` and `motion.js`. Design the idea, composition and look fresh. Ask before inventing a new rendering technique.
4. **Motion comes in hits, then rest,** on a beat grid, visible with the sound off.
5. **It plays in real time:** ≤ 25 ms per frame in Chrome. Use DOM, CSS 3D and canvas 2D, and at most one shader object.
6. **Sound is in the first playable draft,** unless the film is meant to be silent.
7. **A one-page treatment, approved, before any code.**
8. **Real facts only,** from the brand's live site or their own material. The real product UI, rebuilt in HTML from screenshots, is the star.

## Don't

- Choose between directions from stills, or rotate styles for variety. Variety comes from the idea.
- Build path tracers, raymarched worlds, glass shaders or point clouds, or let a device grow into the whole background.
- Replace the product with a metaphor.
- Cross-dissolve two busy layouts, or drift a layer that carries type.

## Layout

```
pipeline/            engine.js, motion.js, render.js, qa_page.js, qa_file.py, synth.py, music.py, tools/
films/<name>/        research/  brand/BRAND.md  music/  src/*.html  PLAN.md  NOTES.md  make.sh
                     out/ qa/ review/ deliver/   (git-ignored)
examples/            reference films
```
