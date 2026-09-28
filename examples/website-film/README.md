# Website film

A hero film for a website: about 43 s at 90 BPM, played by scroll or with sound, in a Next.js site.

It uses the same ideas as the pipeline, in React and TypeScript instead of one HTML page:
- **One hero object:** a WebGL particle swarm ([world.ts](components/film/world.ts)) that morphs per scene and lowers its own quality to stay at 18–24 ms a frame on phones.
- **Huge letter-by-letter type** ([letters.tsx](components/film/letters.tsx)).
- **A beat grid and cue list** ([lib/film/timeline.ts](lib/film/timeline.ts)): every scene, cut and sound placed in beats.
- **A score built from the cues** ([lib/film/score.ts](lib/film/score.ts)), in Web Audio, so picture and sound stay in sync.
- **The same copy** drives the film and a static version for screen readers and reduced motion ([lib/content.ts](lib/content.ts), [static-content.tsx](components/static-content.tsx)).

It's here to read, not to run on its own: it expects a Next.js app with Tailwind and `@/` import paths. Point Claude at it when you want the particle swarm or the per-letter type in a film.
