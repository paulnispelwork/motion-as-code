// The score is synthesized in the browser from the page's own cue list.
// Dark and cinematic: minor-ninth pads, sub bass, a deep four-on-the-floor kick,
// risers into the drops. No claps, no open hats, no cute sounds.

import { B, BEAT, CUES, DURATION } from "./timeline";

type Chord = { root: number; voices: number[] };

const CHORDS: Chord[] = [
  { root: 55, voices: [220, 261.63, 329.63, 392, 493.88] }, // Am9
  { root: 43.65, voices: [174.61, 220, 261.63, 329.63] }, // Fmaj7
  { root: 36.71, voices: [146.83, 174.61, 220, 261.63, 329.63] }, // Dm9
  { root: 41.2, voices: [164.81, 220, 246.94, 329.63] }, // Esus4
];

const BAR = 4 * BEAT;

export type Score = {
  // Current film time in seconds, read from the audio clock.
  time: () => number;
  stop: () => void;
};

function noiseBuffer(ctx: AudioContext) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function playScore(fromT: number): Score {
  const ctx = new AudioContext();
  const start = ctx.currentTime + 0.08;
  const at = (t: number) => start + (t - fromT);
  const noise = noiseBuffer(ctx);

  const master = ctx.createGain();
  master.gain.setValueAtTime(0, start);
  master.gain.linearRampToValueAtTime(0.8, start + 0.4);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  master.connect(comp).connect(ctx.destination);

  const inFuture = (t: number) => t >= fromT - 0.01 && t <= DURATION + 2;

  // Pads and sub bass, one chord per bar.
  const padBus = ctx.createBiquadFilter();
  padBus.type = "lowpass";
  padBus.frequency.value = 1150;
  padBus.Q.value = 0.6;
  padBus.connect(master);

  const firstBar = Math.max(0, Math.floor(fromT / BAR));
  const lastBar = Math.ceil(DURATION / BAR);
  for (let bar = firstBar; bar < lastBar; bar++) {
    const chord = CHORDS[bar % CHORDS.length];
    const t0 = Math.max(bar * BAR, fromT);
    const t1 = (bar + 1) * BAR;
    const s = at(t0);
    const e = at(t1);

    for (const f of chord.voices) {
      for (const detune of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = f;
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.018, s + 0.9);
        g.gain.setValueAtTime(0.018, e);
        g.gain.linearRampToValueAtTime(0, e + 1.4);
        osc.connect(g).connect(padBus);
        osc.start(s);
        osc.stop(e + 1.5);
      }
    }

    if (t1 > B(16)) {
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = chord.root;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.16, s + 0.3);
      g.gain.setValueAtTime(0.16, e - 0.1);
      g.gain.linearRampToValueAtTime(0, e + 0.2);
      sub.connect(g).connect(master);
      sub.start(s);
      sub.stop(e + 0.3);
    }
  }

  // Deep kick on every beat inside the kick sections.
  for (const [from, to] of CUES.kicks) {
    for (let beat = from; beat < to; beat++) {
      const t = B(beat);
      if (!inFuture(t)) continue;
      const s = at(t);
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(130, s);
      osc.frequency.exponentialRampToValueAtTime(42, s + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, s);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.42);
      osc.connect(g).connect(master);
      osc.start(s);
      osc.stop(s + 0.45);
    }
  }

  // Risers: band-passed noise sweeping up into the drop.
  for (const [from, to] of CUES.risers) {
    const t0 = Math.max(B(from), fromT);
    const t1 = B(to);
    if (t1 <= fromT) continue;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.4;
    // Joining mid-riser starts the sweep where it would already be.
    const done = (t0 - B(from)) / (t1 - B(from));
    bp.frequency.setValueAtTime(250 * Math.pow(6000 / 250, done), at(t0));
    bp.frequency.exponentialRampToValueAtTime(6000, at(t1));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, at(t0));
    g.gain.exponentialRampToValueAtTime(0.22, at(t1) - 0.02);
    g.gain.linearRampToValueAtTime(0, at(t1));
    src.connect(bp).connect(g).connect(master);
    src.start(at(t0));
    src.stop(at(t1) + 0.05);
  }

  // Hits on the scene cuts: a low boom plus a dark noise tail.
  for (const beat of CUES.hits) {
    const t = B(beat);
    if (!inFuture(t)) continue;
    const s = at(t);
    const boom = ctx.createOscillator();
    boom.frequency.setValueAtTime(70, s);
    boom.frequency.exponentialRampToValueAtTime(34, s + 0.8);
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(0.7, s);
    bg.gain.exponentialRampToValueAtTime(0.001, s + 1.6);
    boom.connect(bg).connect(master);
    boom.start(s);
    boom.stop(s + 1.7);

    const tail = ctx.createBufferSource();
    tail.buffer = noise;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2400, s);
    lp.frequency.exponentialRampToValueAtTime(200, s + 1.2);
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0.18, s);
    tg.gain.exponentialRampToValueAtTime(0.001, s + 1.3);
    tail.connect(lp).connect(tg).connect(master);
    tail.start(s);
    tail.stop(s + 1.4);
  }


  return {
    time: () => fromT + Math.max(0, ctx.currentTime - start),
    stop: () => {
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.15);
        setTimeout(() => ctx.close().catch(() => undefined), 250);
      } catch (error) {
        console.error("Could not stop the score", error);
      }
    },
  };
}
