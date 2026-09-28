// Closed-form motion helpers. Every value on the film is a pure function of t,
// so nothing here keeps state between frames.

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

// Map v from [a, b] to [0, 1], clamped.
export const range = (v: number, a: number, b: number) => clamp((v - a) / (b - a));

export const smooth = (u: number) => u * u * (3 - 2 * u);

// Snappy tech easing: cubic-bezier(0.15, 0.9, 0.2, 1) approximated as expo-out.
export const easeOut = (u: number) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(u)));

// Step response of a damped spring: 0 before the trigger, settles at 1.
// f is the natural frequency in Hz, zeta the damping ratio.
export function spring(dt: number, f = 1.6, zeta = 0.78) {
  if (dt <= 0) return 0;
  const w = 2 * Math.PI * f;
  if (zeta >= 1) return 1 - Math.exp(-w * dt) * (1 + w * dt);
  const wd = w * Math.sqrt(1 - zeta * zeta);
  const decay = Math.exp(-zeta * w * dt);
  return 1 - decay * (Math.cos(wd * dt) + (zeta * w / wd) * Math.sin(wd * dt));
}

// A value that changes target many times: one spring per key, summed.
// keys are [time in seconds, target value]; the first key is the start value.
export function track(t: number, keys: [number, number][], f = 1.6, zeta = 0.78) {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], f, zeta);
  }
  return v;
}

// 0 → 1 over [a, b], held, then 1 → 0 over [c, d]. Eased both ways.
export function window4(t: number, a: number, b: number, c: number, d: number) {
  if (t <= a || t >= d) return 0;
  if (t < b) return smooth(range(t, a, b));
  if (t > c) return 1 - smooth(range(t, c, d));
  return 1;
}

// Progress of p through [a, b], eased: the workhorse of a scrubbed scene.
export const phase = (p: number, a: number, b: number) => smooth(range(p, a, b));
