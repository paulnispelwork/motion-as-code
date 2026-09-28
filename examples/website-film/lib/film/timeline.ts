// The beat grid. Every scene, cut and sound is placed in beats, so a tempo
// change is one number. 90 BPM: people read slower than you think.

export const BPM = 90;
export const BEAT = 60 / BPM;
export const B = (n: number) => n * BEAT;

export const SCENES = [
  { id: "open", label: "Cold open", from: 0, to: 16 },
  { id: "formats", label: "What we make", from: 16, to: 41 },
  { id: "outcomes", label: "What you get", from: 41, to: 56 },
  { id: "end", label: "Your film", from: 56, to: 65 },
] as const;

export const END_BEAT = 65;
export const DURATION = B(END_BEAT);

// Outcomes: 5 beats each, one headline at a time.
export const OUTCOME_FROM = 41;
export const OUTCOME_BEATS = 5;
export const OUTCOME_COUNT = 3;

export function sceneAt(t: number) {
  const beat = t / BEAT;
  return SCENES.find((s) => beat < s.to) ?? SCENES[SCENES.length - 1];
}

// The cue list the score reads. Picture and sound stay in sync by construction.
export const CUES = {
  hits: [16, 40, 56],
  risers: [
    [12, 16],
    [52, 56],
  ] as [number, number][],
  kicks: [
    [16, 38],
    [41, 55],
    [56, 64],
  ] as [number, number][],
};
